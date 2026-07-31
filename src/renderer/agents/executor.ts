import { LLMClient } from '../ai/llm-client';
import { ToolRegistry } from '../ai/tool-registry';
import { getToolContext } from '../ai/cockpit-context';
import type { ToolContext } from '../ai/types';
import { getDefaultBus, type AgentBus } from './bus';
import { getSkill } from './skills';
import { SubAgentSession } from './session';
import type {
  AgentBrief,
  AgentId,
  AgentMessage,
  AgentStatus,
  AgentState,
  SkillName,
  SpawnResult,
  WaitResult,
} from './types';

export interface LLMConfigProvider {
  (): { endpoint: string; apiKey: string; model: string };
}

export interface SpawnParams {
  skill: SkillName;
  context: string;
  expectedResult: string;
  guardrails?: string[];
  timeoutMs?: number;
  seedSummary?: string;
  correlationId?: string;
}

interface AgentRuntime {
  id: AgentId;
  skill: SkillName;
  session: SubAgentSession;
  runPromise: Promise<string>;
  briefSummary: string;
  guardrails: string[];
}

const MAX_CONCURRENT = 5;
/** How many recent respond payloads to keep for fast agent_wait resolution. */
const RESPOND_CACHE_SIZE = 100;

/**
 * AgentExecutor — the fleet orchestrator.
 *
 * - spawn() creates a headless SubAgentSession, registers its mailbox,
 *   publishes the dispatch, and runs it (non-blocking).
 * - kill() aborts at the next yield.
 * - status() feeds the UI card.
 * - dispatch() lets capable agents message each other.
 * - waitFor() is the non-blocking collector await used by agent_wait.
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

  /** Remember the latest respond per correlationId (bounded, oldest evicted). */
  private captureRespond(msg: AgentMessage): void {
    if (msg.type !== 'respond' || !msg.correlationId) return;
    this.respondCache.set(msg.correlationId, msg);
    if (this.respondCache.size > RESPOND_CACHE_SIZE) {
      const oldest = this.respondCache.keys().next().value;
      if (oldest !== undefined) this.respondCache.delete(oldest);
    }
  }

  /** Spawn a sub-agent for a skill. Returns agentId + correlationId. Non-blocking. */
  spawn(params: SpawnParams): SpawnResult {
    const running = Array.from(this.agents.values()).filter(a =>
      ['active', 'waiting', 'spawning'].includes(a.session.state)
    ).length;
    if (running >= this.maxConcurrent) {
      throw new Error(`Agent cap reached (${this.maxConcurrent} concurrent). Kill an agent or wait.`);
    }

    const skill = getSkill(params.skill);
    const agentId: AgentId = `agent:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const correlationId = params.correlationId ?? `corr-${agentId.slice(6)}`;

    const brief: AgentBrief = {
      skill: params.skill,
      context: params.context,
      expectedResult: params.expectedResult,
      guardrails: params.guardrails ?? [],
      timeoutMs: params.timeoutMs,
      seedSummary: params.seedSummary,
      correlationId,
    };

    const cfg = this.resolveConfig();
    const llm = new LLMClient(cfg);
    const session = new SubAgentSession(agentId, skill, brief, correlationId, {
      bus: this.bus,
      registry: this.registry,
      llm,
      ctx: (): ToolContext | null => getToolContext(),
      onStateChange: () => {
        this.notifyStatus();
        this.persist('roster', this.serializeRoster());
      },
    });

    this.bus.registerMailbox(agentId);

    const runtime: AgentRuntime = {
      id: agentId,
      skill: params.skill,
      session,
      runPromise: Promise.resolve().then(() => session.run()),
      briefSummary: params.context.slice(0, 140) + (params.context.length > 140 ? '…' : ''),
      guardrails: [...(params.guardrails ?? [])],
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
        skill: params.skill,
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
  broadcast(payload: unknown, topic?: string): string {
    const msg: AgentMessage = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'broadcast',
      from: 'main',
      to: '*',
      topic,
      payload,
      ts: Date.now(),
    };
    this.bus.publish(msg);
    this.persist('bus', msg);
    return msg.id;
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
    // Fast path: the respond may already be on the bus (agent finished or
    // failed before the caller called agent_wait). Never burn the timeout
    // for a message we already saw.
    const cached = this.respondCache.get(correlationId);
    if (cached) {
      return { ok: true, correlationId, message: cached, reason: 'respond' };
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
      list.push({
        id: r.id,
        skill: r.skill,
        state: s.state,
        label: `${getSkill(r.skill).label} ${r.id.slice(6, 10)}`,
        icon: getSkill(r.skill).icon,
        color: getSkill(r.skill).color,
        steps: s.steps,
        tokensUsed: s.tokensUsed,
        contextTokens: getSkill(r.skill).contextTokens,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
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

  private serializeRoster() {
    return this.status().map(s => ({
      id: s.id,
      skill: s.skill,
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
