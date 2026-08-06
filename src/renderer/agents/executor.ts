import { LLMClient } from '../ai/llm-client';
import { ToolRegistry } from '../ai/tool-registry';
import { getToolContext } from '../ai/cockpit-context';
import type { ToolContext } from '../ai/types';
import { getDefaultBus, type AgentBus } from './bus';
import { getDefinition, isCustomDefinition, READ_ONLY_TOOLS, ROOM_TOOLS, DEFAULT_AGENT_TIMEOUT_MS, initials } from './definitions';
import { HookRunner } from './hooks';
import { Pipeline, stageForSkill } from './pipeline';
import { SubAgentSession } from './session';
import type {
  AgentBrief,
  AgentEvent,
  AgentId,
  AgentMessage,
  AgentStatus,
  AgentState,
  PermissionMode,
  SkillName,
  SpawnResult,
  SpeechIntent,
  SubAgentDefinition,
  WaitResult,
} from './types';

export interface LLMConfigProvider {
  (): { endpoint: string; apiKey: string; model: string };
}

export interface SpawnParams {
  /** Custom definition id (from .cockpit/agents/ or a built-in name). */
  agent?: string;
  /** Legacy built-in skill name (back-compat with existing callers). */
  skill?: SkillName;
  /** Ad-hoc persona designed by the main session — mutually exclusive with agent/skill. */
  persona?: PersonaInput;
  context: string;
  expectedResult: string;
  guardrails?: string[];
  timeoutMs?: number;
  seedSummary?: string;
  correlationId?: string;
  /** Per-agent model override (else definition.model, else executor config). */
  model?: string;
  /** Per-agent permission mode override (else definition.permissionMode). */
  permissionMode?: PermissionMode;
  /** Per-agent maxTurns override (else definition.maxTurns). */
  maxTurns?: number;
}

/** A persona as authored by the main session (agent_spawn `persona` param). */
export interface PersonaInput {
  name: string;
  icon?: string;
  color?: string;
  system_prompt: string;
  tools?: string[];
  max_turns?: number;
  context_tokens?: number;
  timeout_ms?: number;
}

interface AgentRuntime {
  id: AgentId;
  definitionName: string;
  session: SubAgentSession;
  runPromise: Promise<string>;
  briefSummary: string;
  guardrails: string[];
  adhoc: boolean;
}

const MAX_CONCURRENT = 8; // concurrent sub-agents in one room + headroom
/** How many recent respond payloads to keep for fast agent_wait resolution. */
const RESPOND_CACHE_SIZE = 100;

/** Accent palette for ad-hoc personas whose colour is missing/invalid (T11). */
const PERSONA_PALETTE = [
  '#00e5ff', '#ffd54f', '#ef5350', '#a5d6a7', '#ce93d8',
  '#ffb74d', '#4fc3f7', '#f48fb1', '#9e9d24', '#80cbc4',
  '#ff8a65', '#b39ddb',
];
let personaColorIdx = 0;

/** Clamp model-authored persona strings before they reach the DOM (T11). */
function sanitizePersona(p: PersonaInput): { name: string; icon: string; color: string } {
  const name = p.name.trim().slice(0, 32) || 'Agent';
  // Text icons only — strip anything non-alphanumeric (emoji included) and fall
  // back to the name's initials. "Single emoji" chips are out.
  const rawIcon = (p.icon ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4);
  const icon = rawIcon || initials(name);
  const color = /^#[0-9a-f]{6}$/i.test(p.color ?? '')
    ? p.color!
    : PERSONA_PALETTE[personaColorIdx++ % PERSONA_PALETTE.length];
  return { name, icon, color };
}

/**
 * AgentExecutor — the fleet orchestrator.
 *
 * - spawn() creates a headless SubAgentSession, registers its mailbox,
 *   publishes the dispatch, and runs it (non-blocking).
 * - kill() aborts at the next yield.
 * - status() feeds the UI card.
 * - dispatch() lets capable agents message each other.
 * - waitFor() is the non-blocking collector await used by agent_wait.
 * - approve() resolves a parked ask-gated tool call (agent_approve).
 *
 * Use getAgentExecutor() — a lazy singleton so `ai/tool-definitions.ts`
 * (which imports the agent_* tools) can reference it without a module-cycle
 * footgun: ALL_TOOLS is only touched on first access, after all modules load.
 */
export class AgentExecutor {
  private bus: AgentBus;
  private registry: ToolRegistry;
  private configProvider: LLMConfigProvider | null = null;
  private configOverride: { endpoint: string; apiKey: string; model: string } | null = null;
  private agents = new Map<AgentId, AgentRuntime>();
  private maxConcurrent = MAX_CONCURRENT;
  private persistHook: ((kind: 'transcript' | 'bus' | 'roster', data: unknown) => void) | null = null;

  /**
   * Recent responds keyed by correlationId (insertion-ordered, bounded).
   * Lets waitFor() resolve instantly when an agent finished (or failed) BEFORE
   * the caller registered its waiter — without this, the respond is consumed
   * by the bus and the wait burns the full timeout.
   */
  private respondCache = new Map<string, AgentMessage>();

  /** Fired on any lifecycle/status change — the UI card subscribes here. */
  onStatusChange: (() => void) | null = null;
  /** Fired when a message travels the bus (edges animation). */
  onBusMessage: ((msg: AgentMessage) => void) | null = null;
  /** Fired for every observable event on any agent (the AI panel subscribes here). */
  onAgentEvent: ((id: AgentId, ev: AgentEvent) => void) | null = null;

  /** SDLC pipeline guard — enforces plan → implement → test → verify ordering. */
  private pipeline = new Pipeline();

  getPipeline(): Pipeline {
    return this.pipeline;
  }

  /** Room transcript — what each agent said, for late-joiners (bounded). */
  private roomLog: Array<{ from: AgentId; name: string; icon: string; intent: SpeechIntent; text: string; ts: number }> = [];
  private static readonly ROOM_LOG_MAX = 30;
  private static readonly ROOM_DIGEST_CHARS = 3000;

  constructor(bus?: AgentBus, registry?: ToolRegistry) {
    this.bus = bus ?? getDefaultBus();
    this.registry = registry ?? new ToolRegistry([]);
    this.bus.onMessage = (msg) => {
      this.captureRespond(msg);
      this.onBusMessage?.(msg);
    };
  }

  getBus(): AgentBus {
    return this.bus;
  }

  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /** Inject the shared tool registry (tool-definitions registers ALL_TOOLS here). */
  setRegistry(registry: ToolRegistry): void {
    this.registry = registry;
  }

  setMaxConcurrent(n: number): void {
    this.maxConcurrent = Math.max(1, Math.min(20, n));
  }

  getMaxConcurrent(): number {
    return this.maxConcurrent;
  }

  setConfigProvider(provider: LLMConfigProvider): void {
    this.configProvider = provider;
  }

  setConfigOverride(cfg: { endpoint: string; apiKey: string; model: string } | null): void {
    this.configOverride = cfg;
  }

  setPersistHook(hook: ((kind: 'transcript' | 'bus' | 'roster', data: unknown) => void) | null): void {
    this.persistHook = hook;
  }

  private resolveConfig(): { endpoint: string; apiKey: string; model: string } {
    if (this.configOverride) return { ...this.configOverride };
    if (this.configProvider) return { ...this.configProvider() };
    return { endpoint: 'https://opencode.ai/zen/go/v1', apiKey: '', model: 'deepseek-v4-flash' };
  }

  /**
   * Resolve the model config for a definition+spawn pair. Order:
   * spawn override > definition.model > executor override > provider > default.
   */
  private resolveConfigFor(defn: SubAgentDefinition, params: SpawnParams): { endpoint: string; apiKey: string; model: string } {
    const base = this.resolveConfig();
    const model = params.model ?? defn.model ?? base.model;
    return { ...base, model };
  }

  /** Build the hook runner wired to the renderer's shell.exec (guarded). */
  private buildHookRunner(): HookRunner {
    return new HookRunner((opts) => {
      const api = window.electronAPI?.shell?.exec;
      if (!api) return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      return api(opts);
    });
  }

  /** Remember the latest respond per correlationId (bounded, oldest evicted). */
  private captureRespond(msg: AgentMessage): void {
    if (msg.type !== 'respond' || !msg.correlationId) return;
    this.respondCache.set(msg.correlationId, msg);
    if (this.respondCache.size > RESPOND_CACHE_SIZE) {
      const oldest = this.respondCache.keys().next().value;
      if (oldest !== undefined) this.respondCache.delete(oldest);
    }
  }

  /**
   * Resolve a definition by `persona`, `agent`, or `skill`. `skill` maps to the
   * built-in of the same name (back-compat); `agent` can be a custom or built-in
   * id. A `persona` builds an ephemeral definition inline (T2) — it is never
   * registered in the definition registry and its capabilities are hard-coded
   * to `['peer']` (T3).
   */
  private resolveDefinition(params: SpawnParams): { defn: SubAgentDefinition; name: string; adhoc: boolean } {
    if (params.persona) {
      const named = [params.agent, params.skill].filter(Boolean).length;
      if (named > 0) {
        throw new Error('spawn requires either agent (definition id), skill, or persona — not two');
      }
      const { name, icon, color } = sanitizePersona(params.persona);
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
      const defn: SubAgentDefinition = {
        name: `adhoc-${slug}-${Math.random().toString(36).slice(2, 6)}`,
        label: name, icon, color,
        description: `Ad-hoc persona designed by the main session: ${name}`,
        systemPrompt: params.persona.system_prompt,
        tools: [...(params.persona.tools ?? READ_ONLY_TOOLS), ...ROOM_TOOLS],
        capabilities: ['peer'],        // hard-coded — see T3
        permissionMode: 'default',     // read-only by default; per-spawn override still possible
        maxTurns: params.persona.max_turns ?? 12,
        contextTokens: params.persona.context_tokens ?? 4096,
        timeoutMs: params.persona.timeout_ms ?? DEFAULT_AGENT_TIMEOUT_MS,
      };
      return { defn, name: defn.name, adhoc: true };
    }
    const agent = params.agent;
    if (agent) {
      const defn = getDefinition(agent);
      if (!defn) throw new Error(`Unknown agent definition "${agent}". Use definitions_list or agent_status.`);
      return { defn, name: defn.name, adhoc: false };
    }
    if (params.skill) {
      const defn = getDefinition(params.skill);
      if (!defn) throw new Error(`Unknown skill "${params.skill}"`);
      return { defn, name: defn.name, adhoc: false };
    }
    throw new Error('spawn requires either agent (definition id), skill, or persona');
  }

  /** Spawn a sub-agent for a definition/skill. Returns agentId + correlationId. Non-blocking. */
  spawn(params: SpawnParams): SpawnResult {
    const running = Array.from(this.agents.values()).filter(a =>
      ['active', 'waiting', 'spawning'].includes(a.session.state)
    ).length;
    if (running >= this.maxConcurrent) {
      throw new Error(`Agent cap reached (${this.maxConcurrent} concurrent). Kill an agent or wait.`);
    }

    const { defn, name, adhoc } = this.resolveDefinition(params);
    const agentId: AgentId = `agent:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const correlationId = params.correlationId ?? `corr-${agentId.slice(6)}`;

    // Late-joiner digest (T: an agent spawned mid-discussion gets the room so far).
    const digest = this.roomDigest();
    const context = digest ? `${params.context}\n\n${digest}` : params.context;

    const brief: AgentBrief = {
      skill: params.skill ?? (defn.name as SkillName),
      context,
      expectedResult: params.expectedResult,
      guardrails: params.guardrails ?? [],
      timeoutMs: params.timeoutMs,
      seedSummary: params.seedSummary,
      correlationId,
    };

    // Effective definition with per-spawn overrides applied (no mutation).
    const effectiveDefn: SubAgentDefinition = {
      ...defn,
      model: params.model ?? defn.model,
      permissionMode: params.permissionMode ?? defn.permissionMode,
      maxTurns: params.maxTurns ?? defn.maxTurns,
    };

    const cfg = this.resolveConfigFor(effectiveDefn, params);
    const llm = new LLMClient(cfg);
    const session = new SubAgentSession(agentId, effectiveDefn, brief, correlationId, {
      bus: this.bus,
      registry: this.registry,
      llm,
      ctx: (): ToolContext | null => getToolContext(),
      hooks: this.buildHookRunner(),
      workspacePath: () => getToolContext()?.cockpit.getWorkspacePath() ?? null,
      onStateChange: () => {
        this.notifyStatus();
        this.persist('roster', this.serializeRoster());
      },
      onEvent: (ev) => {
        this.handleAgentEvent(agentId, ev);
      },
    });

    this.bus.registerMailbox(agentId);

    const runtime: AgentRuntime = {
      id: agentId,
      definitionName: name,
      session,
      runPromise: Promise.resolve().then(() => session.run()),
      briefSummary: params.context.slice(0, 140) + (params.context.length > 140 ? '…' : ''),
      guardrails: [...(params.guardrails ?? [])],
      adhoc,
    };

    // Rejections are already surfaced via status messages; keep the promise from
    // becoming an unhandled rejection when nobody awaits runPromise.
    runtime.runPromise.catch(() => {});

    this.agents.set(agentId, runtime);

    // Publish the dispatch envelope (visible on the bus + UI).
    const dispatchMsg: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'dispatch',
      from: 'main',
      to: agentId,
      correlationId,
      expectsResponse: true,
      replyTo: 'main',
      payload: {
        skill: params.skill ?? null,
        agent: params.agent ?? null,
        definition: name,
        context: params.context,
        expectedResult: params.expectedResult,
        guardrails: brief.guardrails,
      },
      ts: Date.now(),
    };
    this.bus.publish(dispatchMsg);
    this.persist('bus', dispatchMsg);
    this.notifyStatus();
    return { agentId, correlationId };
  }

  /** Resolve a parked ask-gated tool call on an agent (agent_approve). */
  approve(correlationId: string, yes: boolean): boolean {
    for (const r of this.agents.values()) {
      const s = r.session;
      if (s.pendingApproval && (s.pendingApproval.toolCallId === correlationId || s.correlationId === correlationId)) {
        return s.approve(correlationId, yes);
      }
    }
    return false;
  }

  /** Find the definition a running agent was spawned from (UI/status). */
  getDefinitionName(agentId: AgentId): string | null {
    return this.agents.get(agentId)?.definitionName ?? null;
  }

  /** Send a message to a running agent (peer messaging / updates / requests). */
  dispatch(to: AgentId, msg: Omit<Partial<AgentMessage>, 'to'> & { payload?: unknown }): string {
    const runtime = this.agents.get(to);
    if (!runtime) {
      throw new Error(`No running agent "${to}". Use agent_status to list agents.`);
    }
    const full: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: msg.type ?? 'request',
      from: msg.from ?? 'main',
      to,
      topic: msg.topic,
      correlationId: msg.correlationId,
      expectsResponse: msg.expectsResponse,
      replyTo: msg.replyTo,
      payload: msg.payload ?? null,
      ttl: msg.ttl,
      ts: Date.now(),
    };
    this.bus.publish(full);
    this.persist('bus', full);
    return full.id;
  }

  /** Broadcast to all registered mailboxes or a topic. */
  broadcast(payload: unknown, topic?: string, from: AgentId = 'main'): string {
    const msg: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'broadcast',
      from,
      to: '*',
      topic,
      payload,
      ts: Date.now(),
    };
    this.bus.publish(msg);
    this.persist('bus', msg);
    return msg.id;
  }

  /**
   * Emit a `say` event on an agent's event channel (the room's speak primitive,
   * called by the agent_broadcast/agent_dispatch tools so the intent tag travels
   * with the call). Recorded in the room log and forwarded to onAgentEvent.
   */
  emitSay(from: AgentId, ev: Omit<Extract<AgentEvent, { kind: 'say' }>, 'kind'>): void {
    this.handleAgentEvent(from, { kind: 'say', ...ev });
  }

  /** Kill an agent: abort at next yield, status → killed. */
  kill(agentId: AgentId): boolean {
    const runtime = this.agents.get(agentId);
    if (!runtime) return false;
    runtime.session.abort();
    const msg: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'kill',
      from: 'main',
      to: agentId,
      payload: 'killed by main',
      ts: Date.now(),
    };
    this.bus.publish(msg);
    this.persist('bus', msg);
    this.notifyStatus();
    return true;
  }

  /** Non-blocking wait on the collector for a correlationId. */
  async waitFor(correlationId: string, timeoutMs = 120_000): Promise<WaitResult> {
    // Fast path 1: the respond may already be on the bus (agent finished or
    // failed before the caller called agent_wait). Never burn the timeout
    // for a message we already saw.
    const cached = this.respondCache.get(correlationId);
    if (cached) {
      return { ok: true, correlationId, message: cached, reason: 'respond' };
    }
    // Fast path 2: an ask-gated tool is parked awaiting approval — resolve the
    // wait immediately so the orchestrator can agent_approve instead of hanging.
    for (const r of this.agents.values()) {
      const p = r.session.pendingApproval;
      if (p && (p.toolCallId === correlationId || r.session.correlationId === correlationId)) {
        return { ok: false, correlationId, message: null, reason: 'needs-approval' };
      }
    }
    try {
      const msg = await this.bus.waitFor(correlationId, { timeoutMs });
      return { ok: true, correlationId, message: msg, reason: 'respond' };
    } catch (err: any) {
      return {
        ok: false,
        correlationId,
        message: null,
        reason: err?.message?.includes('timeout') ? 'timeout' : 'aborted',
      };
    }
  }

  /** Snapshot for the UI / agent_status. */
  status(): AgentStatus[] {
    const now = Date.now();
    const list: AgentStatus[] = [];
    for (const r of this.agents.values()) {
      const s = r.session;
      const defn = s.def;
      list.push({
        id: r.id,
        skill: r.adhoc ? null : (defn.name as SkillName),
        definition: defn.name,
        definitionDescription: defn.description,
        isCustom: r.adhoc || isCustomDefinition(defn.name),
        permissionMode: s.def.permissionMode ?? 'acceptEdits',
        state: s.state,
        label: `${defn.label ?? defn.name} ${r.id.slice(6, 10)}`,
        icon: defn.icon ?? initials(defn.label ?? defn.name),
        color: defn.color ?? '#78909c',
        steps: s.steps,
        tokensUsed: s.tokensUsed,
        contextTokens: defn.contextTokens ?? s.skill.contextTokens,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        broadcastsUsed: s.broadcastsUsed,
        briefSummary: r.briefSummary,
        expectedResult: s.brief.expectedResult,
        guardrails: r.guardrails,
        mailboxCount: s.mailboxCount,
        lastActivityAt: s.lastActivityAt,
        resultPreview: s.result ? s.result.slice(0, 200) : null,
        error: s.error,
      });
    }
    // Oldest first (stable order for the UI).
    list.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    return list;
  }

  /** Remove finished agents from the roster (GC after done/error/killed). */
  purgeFinished(): number {
    let n = 0;
    for (const [id, r] of this.agents) {
      if (['done', 'error', 'killed'].includes(r.session.state)) {
        this.bus.unregisterMailbox(id);
        this.agents.delete(id);
        n++;
      }
    }
    if (n > 0) {
      this.notifyStatus();
      this.persist('roster', this.serializeRoster());
    }
    return n;
  }

  purgeAll(): void {
    for (const r of this.agents.values()) r.session.abort();
    this.agents.clear();
    this.bus.clearDeliveryLog();
    this.respondCache.clear();
    this.roomLog = [];
    this.pipeline.reset();
    this.notifyStatus();
    this.persist('roster', this.serializeRoster());
  }

  getAgentSession(id: AgentId): SubAgentSession | null {
    return this.agents.get(id)?.session ?? null;
  }

  getStateLabel(id: AgentId): AgentState | null {
    return this.agents.get(id)?.session.state ?? null;
  }

  private notifyStatus(): void {
    this.onStatusChange?.();
  }

  /** Route one per-step event: keep the room log warm and fan out to observers. */
  private handleAgentEvent(agentId: AgentId, ev: AgentEvent): void {
    try {
      if (ev.kind === 'say' || ev.kind === 'final') {
        const r = this.agents.get(agentId);
        const name = r ? (r.session.def.label ?? r.session.def.name) : agentId;
        const icon = r?.session.def.icon ?? initials(name);
        const intent = ev.kind === 'say' ? ev.intent : 'verdict';
        this.roomLog.push({ from: agentId, name, icon, intent, text: ev.text, ts: Date.now() });
        if (this.roomLog.length > AgentExecutor.ROOM_LOG_MAX) {
          this.roomLog.splice(0, this.roomLog.length - AgentExecutor.ROOM_LOG_MAX);
        }
      }
      // A successful deliverable advances its SDLC stage (test/verify stages
      // can only be confirmed after an agent of that stage has actually run).
      if (ev.kind === 'final' && ev.state === 'done') {
        const defName = this.agents.get(agentId)?.session.def.name;
        const stage = defName ? stageForSkill(defName) : null;
        if (stage) this.pipeline.recordRun(stage);
      }
      this.onAgentEvent?.(agentId, ev);
    } catch {
      // A throwing UI observer must never break the fleet.
    }
  }

  /** Conversation digest for late-joining agents; truncated oldest-first to the cap. */
  private roomDigest(): string {
    if (this.roomLog.length === 0) return '';
    let text = '## Conversation so far\n' + this.roomLog
      .map(e => `[${e.icon} ${e.name} · ${e.intent}] ${e.text}`)
      .join('\n');
    if (text.length > AgentExecutor.ROOM_DIGEST_CHARS) {
      while (text.length > AgentExecutor.ROOM_DIGEST_CHARS) {
        const nl = text.indexOf('\n');
        if (nl === -1) { text = ''; break; }
        text = text.slice(nl + 1);
      }
      text = `[conversation log truncated]\n${text}`;
    }
    return text;
  }

  private serializeRoster() {
    return this.status().map(s => ({
      id: s.id,
      skill: s.skill,
      definition: s.definition,
      definitionDescription: s.definitionDescription,
      isCustom: s.isCustom,
      permissionMode: s.permissionMode,
      state: s.state,
      briefSummary: s.briefSummary,
      expectedResult: s.expectedResult,
      guardrails: s.guardrails,
      steps: s.steps,
      tokensUsed: s.tokensUsed,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      resultPreview: s.resultPreview,
      error: s.error,
    }));
  }

  private persist(kind: 'transcript' | 'bus' | 'roster', data: unknown): void {
    try {
      this.persistHook?.(kind, data);
    } catch {
      // Persistence is best-effort; never break the fleet over a write failure.
    }
  }
}

let sharedExecutor: AgentExecutor | null = null;

/** Lazy process-wide singleton used by the agent_* tools and the UI card. */
export function getAgentExecutor(): AgentExecutor {
  if (!sharedExecutor) sharedExecutor = new AgentExecutor();
  return sharedExecutor;
}

/** Main-session capability — always granted to 'main' pseudo-agent. */
export const MAIN_CAPABILITIES = ['orchestrate', 'peer', 'destructive'] as const;
