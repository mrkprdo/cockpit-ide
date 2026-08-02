import type { AgentId, HookEventName, HookSpec, SubAgentDefinition } from './types';
import { familyForTool } from './permissions';

/**
 * Hook runner — Claude-Code-style lifecycle hooks.
 *
 * Hooks are shell commands declared on a definition's `hooks` map:
 *   PreToolUse / PostToolUse / SubagentStart / SubagentStop.
 *
 * Contract:
 * - Hook input (JSON) is piped to the command on stdin.
 * - Exit code 0 = pass; PreToolUse exit 2 = BLOCK the tool call; any other
 *   non-zero exit is logged (non-blocking for PostToolUse; PreToolUse treats
 *   only 2 as a block, other failures warn and continue).
 * - Timeout defaults to 30s; a timed-out PreToolUse hook blocks (conservative).
 * - Hooks run sequentially in definition order; the first block short-circuits.
 */

export interface HookRunResult {
  /** True when a PreToolUse hook blocked the tool (exit 2 or timeout). */
  blocked: boolean;
  /** Concatenated output of every hook that ran (for the transcript). */
  output: string;
  /** Number of hooks that errored (non-zero exit, non-block). */
  errored: number;
}

export interface HookPayload {
  hook_event_name: HookEventName;
  agent_id: AgentId;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  start_time: string;
}

/** The shell executor injected from the renderer (window.electronAPI.shell.exec). */
export type ShellExec = (opts: {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  input?: string;
}) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

const DEFAULT_TIMEOUT = 30_000;
const MAX_HOOK_OUTPUT = 4000;

/** Collect all hook specs for an event from a definition. */
export function getEventHooks(defn: SubAgentDefinition, event: HookEventName): HookSpec[] {
  const list = defn.hooks?.[event];
  if (!list) return [];
  return list.filter(h => typeof h?.command === 'string' && h.command.trim());
}

/** Does a hook spec's matcher apply to this tool call? */
export function matcherApplies(spec: HookSpec, toolName: string): boolean {
  if (!spec.matcher || spec.matcher === '*' || spec.matcher.trim() === '') return true;
  const matchers = spec.matcher.split('|').map(m => m.trim()).filter(Boolean);
  const family = familyForTool(toolName);
  return matchers.some(m => m === toolName || m === family);
}

export class HookRunner {
  /** Optional synchronous side-channel for tests/UI (bypasses shell). */
  onHook: ((event: HookEventName, cmd: string, result: { exitCode: number | null; stdout: string; stderr: string }) => void) | null = null;

  constructor(
    private exec: ShellExec | null,
    private defaultTimeoutMs = DEFAULT_TIMEOUT,
  ) {}

  private async runOne(
    event: HookEventName,
    agentId: AgentId,
    spec: HookSpec,
    toolName: string | undefined,
    toolInput: Record<string, unknown> | undefined,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    const input = JSON.stringify({
      hook_event_name: event,
      agent_id: agentId,
      tool_name: toolName,
      tool_input: toolInput ?? {},
      start_time: new Date().toISOString(),
    });

    // No executor (unit tests / pre-IPC) → treat as pass-through.
    if (!this.exec) {
      const noop = { exitCode: 0, stdout: '', stderr: '' };
      this.onHook?.(event, spec.command, noop);
      return noop;
    }
    const res = await this.exec({ command: spec.command, timeoutMs: this.defaultTimeoutMs, input });
    this.onHook?.(event, spec.command, res);
    return res;
  }

  /**
   * Run all hooks for an event. Returns whether a PreToolUse hook blocked,
   * plus accumulated output. Never throws — hook failures degrade gracefully.
   */
  async run(defn: SubAgentDefinition, agentId: AgentId, event: HookEventName, opts: { toolName?: string; toolInput?: Record<string, unknown> } = {}): Promise<HookRunResult> {
    const specs = getEventHooks(defn, event).filter(s => {
      if (opts.toolName === undefined) return true;
      return matcherApplies(s, opts.toolName);
    });

    let blocked = false;
    let errored = 0;
    let output = '';

    for (const spec of specs) {
      if (blocked) break;
      const res = await this.runOne(event, agentId, spec, opts.toolName, opts.toolInput);
      const line = res.stdout.trim() || res.stderr.trim();
      if (line) {
        output = appendCapped(output, `${line}${output ? '\n' : ''}`, MAX_HOOK_OUTPUT);
      }
      if (event === 'PreToolUse') {
        if (res.exitCode === 2) {
          blocked = true;
        } else if (res.exitCode !== 0 && res.exitCode !== null) {
          errored++;
        }
      } else if (res.exitCode !== 0 && res.exitCode !== null) {
        errored++;
      }
    }

    return { blocked, output, errored };
  }
}

function appendCapped(buf: string, chunk: string, cap: number): string {
  if (buf.length >= cap) return buf;
  const next = buf + chunk;
  return next.length > cap ? next.slice(0, cap) : next;
}
