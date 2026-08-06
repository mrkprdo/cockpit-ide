import { describe, it, expect } from 'vitest';
import { BUILTIN_DEFINITIONS, ROOM_TOOLS } from './definitions';
import { definitionToSkill, guardToolCall } from './skills';

describe('room protocol: every built-in can speak', () => {
  it('every built-in definition carries the peer capability (can talk to the room)', () => {
    for (const name of Object.keys(BUILTIN_DEFINITIONS)) {
      const defn = BUILTIN_DEFINITIONS[name as keyof typeof BUILTIN_DEFINITIONS];
      expect(defn.capabilities, `${name} must carry peer`).toContain('peer');
    }
  });

  it('every built-in passes guardToolCall for agent_broadcast (ROOM_TOOLS granted)', () => {
    for (const name of Object.keys(BUILTIN_DEFINITIONS)) {
      const skill = definitionToSkill(BUILTIN_DEFINITIONS[name as keyof typeof BUILTIN_DEFINITIONS]);
      const r = guardToolCall(skill, 'agent_broadcast');
      expect(r.ok, `${name} must be allowed to agent_broadcast: ${r.error}`).toBe(true);
      // agent_status too — the room tools are granted to every built-in.
      const status = guardToolCall(skill, 'agent_status');
      expect(status.ok, `${name} must be allowed to agent_status`).toBe(true);
    }
  });

  it('ROOM_TOOLS contains the two room primitives', () => {
    expect(ROOM_TOOLS).toContain('agent_broadcast');
    expect(ROOM_TOOLS).toContain('agent_status');
  });
});
