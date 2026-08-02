import { describe, it, expect, vi } from 'vitest';
import { HookRunner, getEventHooks, matcherApplies } from './hooks';
import type { HookSpec, HooksSpec, SubAgentDefinition } from './types';

function defn(hooks: HooksSpec): SubAgentDefinition {
  return { name: 'agent-x', description: 'd', systemPrompt: 'sp', hooks };
}

function shellExecMock(results: Array<{ exitCode: number | null; stdout?: string; stderr?: string }>) {
  let i = 0;
  return vi.fn((opts: { command: string; input?: string }) => {
    const r = results[Math.min(i++, results.length - 1)];
    return Promise.resolve({ exitCode: r.exitCode, stdout: r.stdout ?? '', stderr: r.stderr ?? '' });
  });
}

describe('getEventHooks', () => {
  it('returns hooks for an event, filtering invalid entries', () => {
    const d = defn({
      PreToolUse: [
        { matcher: 'Bash', command: 'check.sh' },
        { matcher: 'Read', command: '' },
        { command: '   ' },
        { matcher: '*', command: 'log.sh' },
      ],
    });
    const list = getEventHooks(d, 'PreToolUse');
    expect(list).toHaveLength(2);
  });

  it('returns empty for events with no hooks', () => {
    const d = defn({ PostToolUse: [{ command: 'lint.sh' }] });
    expect(getEventHooks(d, 'SubagentStart')).toHaveLength(0);
  });
});

describe('matcherApplies', () => {
  it('bare/default matcher applies to everything', () => {
    expect(matcherApplies({ command: 'x' }, 'read_file')).toBe(true);
    expect(matcherApplies({ command: 'x', matcher: '*' }, 'anything')).toBe(true);
  });

  it('single and pipe-separated matchers filter by tool name', () => {
    expect(matcherApplies({ command: 'x', matcher: 'Bash' }, 'write_to_terminal')).toBe(true);
    expect(matcherApplies({ command: 'x', matcher: 'Bash' }, 'read_file')).toBe(false);
    expect(matcherApplies({ command: 'x', matcher: 'Edit|Write' }, 'write_file')).toBe(true);
  });
});

describe('HookRunner', () => {
  it('without an executor, hooks pass through and are reported', async () => {
    const runner = new HookRunner(null);
    const seen: string[] = [];
    runner.onHook = (_e, cmd) => { seen.push(cmd); };
    const d = defn({ SubagentStart: [{ command: 'setup.sh' }] });
    const res = await runner.run(d, 'agent:1', 'SubagentStart');
    expect(res.blocked).toBe(false);
    expect(res.errored).toBe(0);
    expect(seen).toEqual(['setup.sh']);
  });

  it('PreToolUse exit 2 blocks; output is captured', async () => {
    const exec = shellExecMock([{ exitCode: 2, stdout: 'BLOCKED: read-only' }]);
    const runner = new HookRunner(exec as never);
    const d = defn({ PreToolUse: [{ matcher: 'Bash', command: 'validate.sh' }] });
    const res = await runner.run(d, 'agent:1', 'PreToolUse', { toolName: 'write_to_terminal', toolInput: { command: 'rm -rf /' } });
    expect(res.blocked).toBe(true);
    expect(res.output).toContain('BLOCKED');
    // Payload sent on stdin includes the hook event, agent id, and tool name.
    const input = JSON.parse(exec.mock.calls[0][0].input ?? '{}');
    expect(input.hook_event_name).toBe('PreToolUse');
    expect(input.agent_id).toBe('agent:1');
    expect(input.tool_name).toBe('write_to_terminal');
  });

  it('PreToolUse non-zero (not 2) logs an error but does not block', async () => {
    const exec = shellExecMock([{ exitCode: 3, stderr: 'meh' }]);
    const runner = new HookRunner(exec);
    const d = defn({ PreToolUse: [{ command: 'warn.sh' }] });
    const res = await runner.run(d, 'agent:1', 'PreToolUse', { toolName: 'read_file' });
    expect(res.blocked).toBe(false);
    expect(res.errored).toBe(1);
  });

  it('hooks run sequentially and short-circuit on the first PreToolUse block', async () => {
    const exec = shellExecMock([
      { exitCode: 0, stdout: 'first ok' },
      { exitCode: 2, stdout: 'second blocked' },
      { exitCode: 2, stdout: 'third never runs' },
    ]);
    const runner = new HookRunner(exec);
    const d = defn({ PreToolUse: [{ command: 'a' }, { command: 'b' }, { command: 'c' }] });
    const res = await runner.run(d, 'agent:1', 'PreToolUse', { toolName: 'write_file' });
    expect(res.blocked).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(res.output).toContain('first ok');
  });

  it('PostToolUse non-zero exit is recorded but never blocks', async () => {
    const exec = shellExecMock([{ exitCode: 1, stdout: 'lint failed' }]);
    const runner = new HookRunner(exec);
    const d = defn({ PostToolUse: [{ command: 'lint.sh' }] });
    const res = await runner.run(d, 'agent:1', 'PostToolUse', { toolName: 'write_file' });
    expect(res.blocked).toBe(false);
    expect(res.errored).toBe(1);
    expect(res.output).toContain('lint failed');
  });

  it('exit code 0 is a clean pass', async () => {
    const exec = shellExecMock([{ exitCode: 0, stdout: 'ok' }]);
    const runner = new HookRunner(exec);
    const d = defn({ SubagentStart: [{ command: 'setup.sh' }] });
    const res = await runner.run(d, 'agent:1', 'SubagentStart');
    expect(res.blocked).toBe(false);
    expect(res.errored).toBe(0);
  });
});
