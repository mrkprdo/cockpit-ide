# Agent Group Chat — Removal + Architecture Plan

Replace the roundtable feature and the Agents canvas card with a **group chat inside the AI panel**:
sub-agents designed and invoked by the main Cockpit agent, each with its own identity, speaking in a
shared room, with a **PoV switcher** to jump between the room and any single agent's own reasoning
stream — and each agent's PoV persisted as its own session file, linked from the main session.

Status: plan only, nothing implemented. **No open questions — every decision below is settled.**

---

## 0. Decisions

### 0.1 Product decisions (user-confirmed)

| # | Question | Decision |
|---|---|---|
| D1 | Agents canvas card (`AgentsWindow`) | **Delete entirely.** The AI panel is the only agent surface. |
| D2 | Built-in SDLC skill definitions | **Keep all 10**, plus an inline `persona` param so main designs ad-hoc sub-agents per spawn. |
| D3 | How much of a run is visible | **Live**: prose, tool calls, tool results, verdict — streamed into that agent's PoV tab. |
| D4 | Roundtable (roster, PRNG draw, quorum) | **Delete.** Identity + shared findings survive as persona + room. |
| D5 | User voice | **Input always goes to main**, except a leading `@Name` / `@room` mention, which routes that one message to that agent / every live agent. |
| D6 | Manual controls | **Per-agent kill** (in the agent's PoV header) + **purge finished** (on the strip). No kill-all. |
| D7 | Broadcast budget | **Hard cap 6 per agent per run**; the 7th returns a guardrail string. |
| D8 | Persistence | **Each agent PoV is its own session file.** The main session file links them; reopening the main session re-links and replays the PoVs and the room. |

### 0.2 Technical decisions (settled here, with rationale)

| # | Question | Decision | Why |
|---|---|---|---|
| T1 | Where do per-step events travel? | A new typed observer channel (`onAgentEvent`), **not** the bus. | Bus messages land in every peer's mailbox and are folded into their context. Per-step prose on the bus would burn every agent's 4096-token window. |
| T2 | Are ad-hoc personas registered in the definition registry? | **No.** Build the `SubAgentDefinition` and hand it straight to the session. | `SubAgentSession` holds its own `def` and never re-reads the registry after construction. Registering adds cleanup debt and gets wiped by `App.loadWorkspace()` → `clearCustomDefinitions()` — the exact bug `registerRoundtableExperts()` had to self-heal around. |
| T3 | Can a persona grant itself capabilities? | **No.** The builder hard-codes `capabilities: ['peer']`; `persona.capabilities` is not in the tool schema at all. | A model-authored persona must never be able to hand itself `destructive` or `orchestrate`. Hard security boundary. |
| T4 | Does the room count toward the panel's token bar? | **No** — the bar keeps measuring the main thread only. | Room traffic is charged to each sub-agent's own context, not main's. Changing the bar would misreport what the next main request costs. |
| T5 | Do main↔agent dispatches show in the room? | **Yes**, as speaker "Main". Agent↔agent direct requests also show, with a `→ Reviewer` chip. | Hiding directed messages makes rebuttals read as non-sequiturs. |
| T6 | Does main's final synthesis show in the room? | **No** — it is main's answer to the user and belongs in Chat. | The room is the sub-agents' surface. Duplicating the synthesis doubles the longest message in the panel. |
| T7 | Auto-switch to Room on spawn? | **No.** Push one compact line into Chat: `**3 agents working** — open ⚯ Room to watch`, and badge the Room tab. | Auto-switching steals focus mid-read. |
| T8 | Finished agents' tabs | Stay, dimmed, until **purge** or session switch. Their session files persist regardless. | The verdict is the most-read part; it must not vanish the moment the agent exits. |
| T9 | Concurrency cap | Keep `MAX_CONCURRENT = 8`. | A 6-persona room plus headroom. Already tunable via `setMaxConcurrent`. |
| T10 | `AgentStatus.skill` for ad-hoc personas | `null`. | The field is typed `SkillName \| null`; an ad-hoc name is not a `SkillName`. |
| T11 | Persona field sanitising | `color` must match `/^#[0-9a-f]{6}$/i` else palette; `icon` truncated to its first grapheme, non-emoji → `🤖`; `name` trimmed, capped 32 chars, escaped at render. | Model-authored strings reach the DOM. Escaping alone is not enough — an 800-char "name" wrecks the tab strip. |
| T12 | Workspace switch with agents running | `purgeAll()` + `feed.reset()`. | Today nothing kills them; they keep running against a stale workspace path. Real bug, fixed here. |
| T13 | Detached float card | Chat only. Clicking a tab while detached calls `ensureDrawerOpen()`. | Same behaviour the settings and sessions buttons already have. |
| T14 | Agent session files in `index.json` order? | **No.** They live in `sessions/agents/` and are reached only through the main session's links. | `loadSessions()` reads every id in `index.order` as a user session; agent files are not user sessions and must not appear in the sessions list. |
| T15 | Deleting a main session | Cascades: delete every linked agent file. | Otherwise `sessions/agents/` grows forever with unreachable files. |
| T16 | Session schema version bump | Not needed. `agents` is an additive optional field; agent files carry their own `v: 1`. | Old sessions load with no links and an empty room. |
| T17 | Room persistence | **No room file.** The room is reconstructed by merging the linked agent files' room-visible messages by timestamp. | The room is a view over per-agent transcripts. A separate file would be a second source of truth to keep in sync. |
| T18 | `@mention` autocomplete | Reuse `SlashCommands`' popup DOM with an `@` trigger mode. | A second popup implementation for the same interaction is waste. |
| T19 | Smoke-test discipline | `AgentsWindow.smoke.test.ts` is replaced by `AiDrawer.room.smoke.test.ts`, driven through tool calls against a real DOM. | Keeps the tool-call-driven smoke coverage the deleted file provided. |
| T20 | fs failures | Best-effort `.catch(() => {})`, matching `sessions.ts`. A failed write never breaks a run. | Existing discipline in this codebase. |

---

## 1. Current state

### 1.1 Sub-agent core — kept

| File | Lines | Role |
|---|---:|---|
| `agents/bus.ts` | 239 | `AgentBus`: mailboxes, topic pub/sub, correlation-id waiters, delivery log. Already fans out `to:'*'`. |
| `agents/session.ts` | 566 | `SubAgentSession`: headless loop, guardrail chain, mailbox injection, rolling window + compaction, `postRespond`/`postStatus`. |
| `agents/executor.ts` | 503 | `AgentExecutor` singleton: spawn/kill/dispatch/broadcast/wait/approve/status, respond cache, persist hook. |
| `agents/definitions.ts` | 160 | 10 built-in `SubAgentDefinition`s + custom registry (`.cockpit/agents/*.json`). |
| `agents/skills.ts` | 101 | Derives `Skill` from definitions; `expandToolAllowlist`, `guardToolCall`, `HARD_DENY`. |
| `agents/permissions.ts` | 231 | Pattern matchers, `evaluatePermission`, `applyMode`, `TOOL_FAMILIES`. |
| `agents/hooks.ts` | 137 | Pre/PostToolUse + SubagentStart/Stop shell hooks. |
| `agents/memory-scopes.ts` | 53 | Agent-scoped memory dirs. |
| `agents/definition-file.ts` | 129 | Loads `.cockpit/agents/*.json`. |

### 1.2 Deleted

| File | Lines |
|---|---:|
| `agents/roundtable.ts` | 324 |
| `agents/roundtable.test.ts` | 237 |
| `components/AgentsWindow.ts` | 455 |
| `components/AgentsWindow.smoke.test.ts` | 63 |
| `renderer/styles-agents-fleet.css` | 100 |
| **Total** | **1,179** |

### 1.3 Facts found during survey

- **Shared context already exists.** `agent_broadcast` → `bus.publish(to:'*')` → every mailbox →
  `session.injectMailbox()` folds peer traffic into that agent's transcript as a `user` turn
  (`session.ts:407-429`). Roundtable did not build this; it only used it.
- **Built-in agents cannot currently speak.** `agent_broadcast` is in `HARD_DENY` requiring `peer`
  (`skills.ts:73`), and **no built-in lists `agent_broadcast` in `tools`** — only the deleted
  `EXPERT_TOOLS` did. Six of ten also lack `peer`. §5.1 fixes both; without it the room is silent.
- **`onStatusChange` carries no payload** (`executor.ts:94`) — a bare re-poll ping. Cannot carry step
  events; hence T1.
- **`SubAgentSession` holds its own `def`** (`session.ts:82-91`, `executor.ts:227`) — hence T2.
- **Session files are flat** `${dir}/${id}.json` with an `index.json` of `{currentSessionId, order}`
  (`sessions.ts:44-75`) — hence T14.

---

## 2. Phase 1 — Removal

Target: green `npm run build` + `npx vitest run`, zero roundtable/HUD references left.

### 2.1 Delete files

```
src/renderer/agents/roundtable.ts
src/renderer/agents/roundtable.test.ts
src/renderer/components/AgentsWindow.ts
src/renderer/components/AgentsWindow.smoke.test.ts
src/renderer/styles-agents-fleet.css
```

### 2.2 Roundtable references

| File | Line(s) | Action |
|---|---|---|
| `agents/index.ts` | 10, 23 | Drop barrel doc line + `export * from './roundtable'`. |
| `agents/types.ts` | 110-111 | Drop `AgentStatus.roundtableSessionId`. |
| `agents/executor.ts` | 43-44 | Drop `SpawnParams.roundtableSessionId`. |
| `agents/executor.ts` | 54, 249 | Drop `AgentRuntime.roundtableSessionId` + its assignment. |
| `agents/executor.ts` | 418 | Drop the field from the `status()` row. |
| `agents/executor.ts` | 57 | Reword `MAX_CONCURRENT` comment → "concurrent sub-agents in one room + headroom". |
| `agents/agent-tools.ts` | 6 | Drop `composeRoundtable, EXPERT_AREAS` import. |
| `agents/agent-tools.ts` | 62, 69, 141 | Drop `roundtable_session_id` param, alias, and forwarding. |
| `agents/agent-tools.ts` | 110-121 | Delete `RoundtableComposeArgs`. |
| `agents/agent-tools.ts` | 125 | Strip roundtable mentions from `agent_spawn`'s description. |
| `agents/agent-tools.ts` | 177 | Rewrite `agent_broadcast` description (§5.2). |
| `agents/agent-tools.ts` | 266-280 | Delete `roundtableComposeTool`. |
| `agents/agent-tools.ts` | 286 | Drop "including roundtable experts" from `definitions_list`. |
| `agents/agent-tools.ts` | 310 | Drop `roundtableComposeTool` from `AGENT_TOOLS`. |
| `agents/prompts.ts` | 139-152 | Delete `ROUNDTABLE_SECTION`. |
| `agents/prompts.ts` | 105, 107, 113, 124, 131 | Strip roundtable clauses from `ORCHESTRATION_SECTION` (rewritten §5.3). |
| `agents/skills.ts` | 11 | Comment "the Agents window" → "the AI panel". |
| `components/App.ts` | 12, 366-367 | Drop `registerRoundtableExperts` import + boot call. |
| `ai-drawer/llm-loop.ts` | 14, 134 | Drop `ROUNDTABLE_SECTION` import + `parts.push`. |
| `ai-drawer/llm-loop.ts` | 556 | Rewrite escalation note → `…or delegate: agent_spawn a debugger, or design a small panel of personas to attack it from several angles.` |

### 2.3 Agents canvas card

| File | Line(s) | Action |
|---|---|---|
| `renderer/index.html` | 33 | Drop the `styles-agents-fleet.css` link. |
| `components/App.ts` | 98 | Drop `this.canvas.onAgentsChanged = …`. |
| `components/App.ts` | 141-143 | Drop `onNewAgents` / `onFocusAgents` / `onReopenAgents`. |
| `components/App.ts` | 284 | Drop `case 'agents'`. |
| `components/TopBar.ts` | 21-23 | Drop the three agents callback fields. |
| `components/TopBar.ts` | 73 | Drop `setAgentsItems()`. |
| `components/TopBar.ts` | 166-167 | Drop the agents branch of the window-list click handler. |
| `components/TopBar.ts` | 240 | Drop the `menu-new-agents` dropdown item. |
| `components/TopBar.ts` | 463 | Drop the `onNewAgents` binding. |
| `components/CanvasArea.ts` | 9, 26, 152 | Drop import, `onAgentsChanged`, `getAgentsChanged`. |
| `components/CanvasArea.ts` | 321, 335, 349, 386 | Drop `addAgents` / `focusAgents` / `reopenAgents` / `getActiveAgentsWindow`. |
| `components/CanvasArea.ts` | 507-514, 524 | Drop the `'Agents'` restore branch + trailing notify. |
| `canvas-area/types.ts` | 6, 27 | Drop import + `CardState.agentsWindow`. |
| `canvas-area/card-lifecycle.ts` | 10, 230-232, 339-348, 413-429 | Drop import, `getActiveAgentsWindow`, `mountAgents`, reopen branch. |
| `canvas-area/window-factories.ts` | 9, 157-186 | Drop import + `addAgents()`. |
| `canvas-area/window-focus.ts` | 32, 63 | Drop `focusAgents` / `reopenAgents`. |
| `canvas-area/notify.ts` | 11, 22, 49-52 | Drop `getAgentsChanged`, the `'Agents'` dispatch branch, `notifyAgentsChanged`. |
| `ai/tool-definitions/schemas.ts` | 49 | Drop `'agents'` from the `add_window` enum. |
| `ai/tool-definitions/helpers.ts` | 22 | Drop `if (title === 'Agents') return 'agents';`. |

### 2.4 Migration: persisted state

`.cockpit/window.json` may hold a card with `title: 'Agents'`. After the restore branch is deleted an
unknown title falls through the `if/else if` chain and is not mounted — **verify no empty
`WindowCard` shell remains**; if one does, add an explicit skip in the restore loop:

```ts
// ponytail: legacy card type; workspaces saved before the group-chat panel land here
if (p.title === 'Agents') continue;
```

`.cockpit/agents/roster.json` is executor telemetry, overwritten next run, never read back — no
migration. Old `.cockpit/sessions/*.json` mentioning roundtable are just chat logs — left alone.

### 2.5 Tests touched

| File | What breaks |
|---|---|
| `agents/agent-tools.test.ts` | 11, 16, 65-90, 186-231 — delete roundtable cases; retopic broadcast tests to `room.findings`. |
| `agents/executor.test.ts` | 49-58 — rename the broadcast-attribution case, keep the assertion. |
| `components/App.test.ts` | `case 'agents'` + TopBar callback expectations. |
| `components/CanvasArea.test.ts` | `addAgents` / `'Agents'` restore expectations. |
| `components/TopBar.test.ts` | `setAgentsItems` / `menu-new-agents` expectations. |
| `components/AiDrawer.test.ts` | `buildSystemPrompt` assertions expecting roundtable text. |

**Commit 1** — `refactor(agents): remove roundtable panel and Agents canvas card`

---

## 3. Phase 2 — Personas designed by main

### 3.1 `agent_spawn` gains `persona`

`agents/agent-tools.ts`, added to `AgentSpawnArgs`:

```ts
persona: z.object({
  name: z.string().describe('Display name, e.g. "Cache Skeptic" — how it signs its messages in the room'),
  icon: z.string().optional().describe('Single emoji for its chip (default 🤖)'),
  color: z.string().optional().describe('#rrggbb accent for its chip and message border'),
  system_prompt: z.string().describe('Its angle, what it must not do, what its verdict must contain'),
  tools: z.array(z.string()).optional().describe('Tool allowlist; defaults to read-only + room tools'),
  max_turns: z.number().int().positive().optional(),
  context_tokens: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().optional(),
}).optional()
  .describe('Design a sub-agent inline instead of naming a built-in. Mutually exclusive with skill/agent.'),
```

**No `capabilities` field** — see T3. Precedence: `persona` > `agent` > `skill`; passing two returns
the same style of error string as today's "spawn requires either agent or skill".

### 3.2 Ephemeral definition builder — `agents/executor.ts`

```ts
const PERSONA_PALETTE = [ /* 12 hexes lifted from the design tokens */ ];
let personaColorIdx = 0;

function sanitizePersona(p: PersonaInput): { name: string; icon: string; color: string } {
  const name = p.name.trim().slice(0, 32) || 'Agent';
  const icon = [...(p.icon ?? '')][0] ?? '🤖';                       // first grapheme only
  const color = /^#[0-9a-f]{6}$/i.test(p.color ?? '')
    ? p.color!
    : PERSONA_PALETTE[personaColorIdx++ % PERSONA_PALETTE.length];
  return { name, icon, color };
}
```

Inside `resolveDefinition()`:

```ts
if (params.persona) {
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
    timeoutMs: params.persona.timeout_ms ?? 300_000,
  };
  return { defn, name: defn.name, adhoc: true };
}
```

`ROOM_TOOLS = ['agent_broadcast', 'agent_status']`, exported from `definitions.ts` and reused by
§5.1. `AgentRuntime` gains `adhoc: boolean`; `status()` reports
`isCustom: r.adhoc || isCustomDefinition(defn.name)` and `skill: r.adhoc ? null : (defn.name as SkillName)` (T10).

**Commit 2** — `feat(agents): inline persona spawns designed by the main session`

---

## 4. Phase 3 — Event channel

### 4.1 Types — `agents/types.ts`

```ts
export type SpeechIntent =
  | 'note' | 'finding' | 'suggestion' | 'rebuttal' | 'question' | 'verdict';

export interface AgentPersona {
  id: AgentId; name: string; icon: string; color: string; definition: string;
}

export type AgentEvent =
  | { kind: 'spawn';  persona: AgentPersona; brief: string; expectedResult: string; guardrails: string[] }
  | { kind: 'step';   text: string; step: number }
  | { kind: 'tool';   name: string; args: string; result?: string; callId: string }
  | { kind: 'say';    text: string; intent: SpeechIntent; topic?: string; to?: AgentId; re?: string }
  | { kind: 'state';  state: AgentState; note?: string }
  | { kind: 'final';  text: string; state: AgentState };
```

### 4.2 Emission points — `agents/session.ts`

`SessionDeps` gains `onEvent?: (ev: AgentEvent) => void`. Every emission wrapped in try/catch so a UI
listener can never break a run (same discipline as `bus.publish`'s subscriber loop, `bus.ts:126-131`).

| Location | Event |
|---|---|
| `run()` after `setState('active')` (~:150) | `spawn` |
| `:216`, when `content` non-empty | `step` |
| `:235` before `guardedExecute` | `tool` (no `result`) |
| `:237` after the result | `tool` (same `callId`, with `result` — the panel patches in place) |
| `setState()` (~:111) | `state` |
| `:245-247` | `final` (`done`) |
| `:252-257` | `final` (`error` / `killed`) |

`say` is **not** emitted here — it originates in the broadcast/dispatch tools so the intent tag
travels with the call (§5.2).

### 4.3 Executor re-emit — `agents/executor.ts`

```ts
/** Fired for every observable event on any agent (the AI panel subscribes here). */
onAgentEvent: ((id: AgentId, ev: AgentEvent) => void) | null = null;
```

Wired in `spawn()` beside the existing `onStateChange`:

```ts
onEvent: (ev) => { try { this.onAgentEvent?.(agentId, ev); } catch {} },
```

`onStatusChange` and `onBusMessage` stay: the strip's state rings re-poll via the former, and
directed peer traffic (T5) is read from the latter.

**Commit 3** — `feat(agents): typed per-step event channel for UI observers`

---

## 5. Phase 4 — Room mechanics

### 5.1 Let built-ins speak (blocking prerequisite)

In `agents/definitions.ts`, append `ROOM_TOOLS` to every built-in's `tools` and add `'peer'` to every
built-in's `capabilities`:

| Definition | Has `peer` today | Change |
|---|---|---|
| planner, spec-orienter, scaffolder, git-committer, docs-writer, spec-sync | no | add `'peer'` + `ROOM_TOOLS` |
| implementer, reviewer, tester, debugger | yes | add `agent_broadcast` to `tools` |

`peer` grants `agent_dispatch` + `agent_broadcast` only — not `destructive`, not `orchestrate`. A
planner still cannot write files or spawn agents. Blast radius: "can talk".

### 5.2 Intent tagging + broadcast budget

`agent_broadcast` becomes the room's speak primitive:

```ts
intent: z.enum(['note','finding','suggestion','rebuttal','question','verdict']).optional()
  .describe('How the room should read this. Use rebuttal when you disagree with a named peer.'),
re: z.string().optional().describe('Persona name or agent id you are answering (renders as a reply chip)'),
```

`agentBroadcastTool.execute` also emits `{kind:'say', …}` on the sender's event channel.
`agent_dispatch` emits `say` with `intent: 'question'` when `expects_response`, else `'note'`, plus
`to`. Untagged messages arriving at the panel default by envelope type: `respond` → `verdict`,
`request` → `question`, `broadcast` → `note`.

**Budget (D7)** — enforced in `session.ts`, which is the only place that knows both the agent and the
call, and already owns the guardrail chain:

```ts
/** ponytail: flat per-run budget; scale to room size only if flooding shows up in practice */
const ROOM_BROADCAST_BUDGET = 6;
```

In `guardedExecute`, before the allowlist check:

```ts
if (name === 'agent_broadcast') {
  if (this.broadcastsUsed >= ROOM_BROADCAST_BUDGET) {
    return `Guardrail: room budget spent (${ROOM_BROADCAST_BUDGET} broadcasts). Save the rest for your verdict.`;
  }
  this.broadcastsUsed++;   // counted only on calls that reach execution
}
```

Surfaced in `agent_status` output as `broadcastsUsed` so main can see who is loud.

### 5.3 Prompts — `agents/prompts.ts`

`AGENT_SHARED_PREAMBLE` gains:

```
## The room
- You are one of several sub-agents working the same problem in a shared room. Peer messages arrive
  between your steps — read them.
- agent_broadcast is how you speak to the room. Tag every message with an intent: finding (evidence
  you actually saw), suggestion (an action you propose), rebuttal (you disagree with a named peer —
  say who and why), question (you need something from a peer), note (anything else).
- You get 6 broadcasts per run. Two or three is normal. Spend them on what the others need, not on
  progress updates.
- Disagreement is the point. If a peer's claim contradicts what you read, rebut it with the evidence.
- The user may address you directly (a message from Main prefixed [user]). Answer it.
- Your final response is your verdict. It reaches the main session and the room.
```

`ORCHESTRATION_SECTION` replaces the deleted roundtable guidance with:

```
### Designing a sub-agent
Pass `persona` to agent_spawn to design one for the problem: name, icon, system_prompt (its angle),
optional tools. Use built-in skill/agent ids for standard SDLC steps; design a persona when you want
a specific point of view (a cache skeptic, a Windows-path pedant, a "what breaks at 10k rows" reviewer).

### Running a room
1. Spawn 3-6 personas in parallel with complementary angles. Keep every correlationId. Cap is 8.
2. They hear each other: anything one broadcasts lands in every other agent's context before its next
   step. An agent spawned mid-discussion gets the room digest in its brief.
3. agent_wait each correlationId with timeout_ms >= the persona timeout (default 300s; the wait
   default is 120s — pass it explicitly).
4. Synthesize: convergences, the disagreements and which persona holds which side, then your
   recommendation. Attribute claims to the persona that made them.
5. Kill any persona still running once you have what you need.
```

### 5.4 Late-joiner digest — `agents/executor.ts`

```ts
private roomLog: Array<{ from: AgentId; name: string; intent: SpeechIntent; text: string; ts: number }> = [];
private static readonly ROOM_LOG_MAX = 30;
private static readonly ROOM_DIGEST_CHARS = 3000;
```

Appended on every `say` and `final`; `spawn()` prepends to the brief when non-empty:

```
## Room so far
[🔍 Reviewer · finding] The cache key omits the tenant id (src/cache.ts:44).
[🐞 Debugger · rebuttal] Disagree with Reviewer — that path is tenant-scoped upstream at router.ts:12.
```

Truncated oldest-first to `ROOM_DIGEST_CHARS`. Cleared by `purgeAll()`. Worst case ≈750 tokens against
a 4096-token persona context — the cap is the control.

**Commit 4** — `feat(agents): room protocol, broadcast budget, late-joiner digest`

---

## 6. Phase 5 — Panel: room, PoV switcher, @mention, controls

### 6.1 `ai-drawer/agent-feed.ts` (new, ~260 lines)

```ts
export interface AgentTranscript {
  persona: AgentPersona;
  state: AgentState;
  steps: ChatMessage[];       // full PoV
  unread: number;
  startedAt: number;
  finishedAt: number | null;
  sessionFile: string | null; // 'agents/<id>.json' once written
  archived: boolean;          // restored from disk — read-only, no kill button
}

export class AgentFeed {
  transcripts = new Map<AgentId, AgentTranscript>();
  room: ChatMessage[] = [];
  onChange: (() => void) | null = null;

  attach(ex: AgentExecutor): void;           // onAgentEvent + onStatusChange + onBusMessage
  detach(): void;
  activeAgents(): AgentTranscript[];         // state ∈ spawning|active|waiting
  clearUnread(view: PanelView): void;
  purgeFinished(): void;                     // drops finished tabs; files stay on disk
  reset(): void;                             // workspace switch / new session
  hydrate(links: AgentLink[]): Promise<void>;// restore from linked session files
  rebuildRoom(): void;                       // merge transcripts' room-visible msgs by ts
}
```

Routing:

| Event | Room | Agent PoV |
|---|---|---|
| `spawn` | ✅ `🛠 Implementer joined` | ✅ brief + expected result + guardrails |
| `step` | ✗ | ✅ as `thinking` |
| `tool` | ✗ | ✅ as `tool` chip, patched by `callId` |
| `say` | ✅ | ✅ |
| `state` | ✗ (strip ring only) | ✗ |
| `final` | ✅ as `verdict` | ✅ |
| bus `request`/`dispatch` between agents or from main (T5) | ✅ with `→ target` chip | ✅ in both endpoints |

Caps: 200 per transcript, 300 in the room, oldest evicted.

### 6.2 Persistence (D8) — agent PoV = its own session file

**Layout**

```
.cockpit/sessions/
  index.json                    # unchanged: { currentSessionId, order }  (T14)
  <mainSessionId>.json          # gains an `agents` link array
  agents/
    <mainSessionId>-<agentSuffix>.json
```

**Main session type** — `ai-drawer/types.ts`:

```ts
export interface AgentLink {
  agentId: AgentId;
  file: string;            // relative to the sessions dir, e.g. 'agents/msd1-a4f2.json'
  name: string; icon: string; color: string;
  definition: string;
  state: AgentState;
  startedAt: number;
  finishedAt: number | null;
}

export interface Session {
  // …unchanged…
  agents?: AgentLink[];    // additive optional — old sessions load fine (T16)
}
```

**Agent session file** — `AgentSessionFile`:

```ts
{
  v: 1,
  id: string,                 // '<mainSessionId>-<agentSuffix>'
  mainSessionId: string,
  agentId: AgentId,
  persona: AgentPersona,
  definition: string,
  adhoc: boolean,
  brief: string,
  expectedResult: string,
  guardrails: string[],
  state: AgentState,
  startedAt: number,
  finishedAt: number | null,
  steps: number,
  tokensUsed: number,
  broadcastsUsed: number,
  messages: ChatMessage[]     // same shape as the main thread
}
```

**Write policy** — new `ai-drawer/agent-sessions.ts` (~140 lines), mirroring `sessions.ts` idioms:
- `ensureDir()` once per workspace (`sessionsDirEnsured` pattern).
- Throttled write per agent, **1s**, while running; forced flush on `final` and on `purgeFinished`.
- On the first write for an agent, append its `AgentLink` to the main session and trigger the
  existing `saveSessions()` debounce — the link and the file land together.
- All writes `.catch(() => {})` (T20).

**Read policy** — on `loadSessions()`/`switchSession()`, after the main session is set:
1. `feed.reset()`.
2. `feed.hydrate(session.agents ?? [])` — read each linked file, build an `archived: true` transcript.
   A missing/corrupt file is skipped silently and its link dropped on next save (self-healing).
3. `feed.rebuildRoom()` — merge every transcript's room-visible messages by `timestamp` (T17). Join
   lines are synthesised from `persona` + `startedAt`.
4. Tab strip renders the restored agents dimmed, no kill button.

**Delete cascade (T15)** — `deleteSession(id)` also deletes every `agents[].file` of that session
before removing the main file.

**New session** — `newSession()` calls `feed.reset()`; the new session starts with no links.

### 6.3 `ChatMessage` extension — `ai-drawer/types.ts`

```ts
export type PanelView = 'chat' | 'room' | AgentId;

export interface ChatMessage {
  // …existing fields unchanged…
  speaker?: { id: string; name: string; icon: string; color: string };
  intent?: SpeechIntent;
  replyTo?: string;     // persona name from `re`
  toName?: string;      // directed message target, renders '→ Reviewer'
  mentionTo?: string;   // set on a user @mention message
}
```

No new `role`: an agent turn is `role: 'assistant'` with `speaker` set, so the existing render paths,
token estimator, and session serializer keep working untouched.

### 6.4 `@mention` (D5) — `AiDrawer.sendMessage()`

Parse before anything else:

```
/^@([A-Za-z0-9_\-]+)\s+([\s\S]+)$/
```

Resolution order against **live** agents (`feed.activeAgents()`), case-insensitive:
1. `@room` / `@all` → `executor.broadcast(text, 'room.user', 'main')`.
2. slugified persona name (`Cache Skeptic` → `cache-skeptic`, also matches `cache`), unique prefix.
3. `@agent:xxxx` raw id.

Matched → `executor.dispatch(agentId, { type: 'request', from: 'main', payload: '[user] ' + text })`.
The `[user]` prefix is what the preamble tells agents to answer. `AgentId` stays
`'main' | agent:${string}` — no type change (ponytail).

Rendering: pushed into `this.messages` as a normal `user` message with `mentionTo` set (so Chat shows
what was said), and into the room + target PoV with a `speaker` of `{name:'You', icon:'🧑', color: accent}`.

**No match** → do not silently drop: push a system line
`No live agent matches "@foo" — sent to the main agent instead.` and fall through to the normal send.

**Autocomplete (T18)**: typing `@` at the start of the input opens the existing slash popup in mention
mode, listing live agents (icon + name + state). Same keyboard handling (`↑`/`↓`/`Enter`/`Esc`) — one
`mode: 'slash' | 'mention'` flag in `SlashCommands`.

**Slash commands added**: `/room` (switch view), `/agents` (list live agents in Chat), `/purge`
(purge finished). Registered in `slash.registerDefaults()`.

### 6.5 Render — `ai-drawer/render.ts`

**View state**: `activeView: PanelView = 'chat'`.

```ts
const source =
  this.activeView === 'chat' ? this.messages
  : this.activeView === 'room' ? this.feed.room
  : this.feed.transcripts.get(this.activeView)?.steps ?? [];
```

`this.messages` keeps its exact current meaning — sessions, context window, compaction, token
counting, and `llm-loop` are untouched (T4).

**Tab strip** — between `.ai-drawer-header` and `.ai-chat-messages`; this *is* the "show active
agents" surface:

```html
<div class="ai-pov-strip" role="tablist" aria-label="Conversation view">
  <button class="ai-pov-tab is-selected" role="tab" aria-selected="true" data-view="chat">💬 Chat</button>
  <button class="ai-pov-tab" role="tab" aria-selected="false" data-view="room">
    ⚯ Room <span class="ai-pov-badge" aria-label="3 unread">3</span>
  </button>
  <button class="ai-pov-tab is-agent" role="tab" aria-selected="false"
          data-view="agent:xyz" style="--agent-color:#00e5ff">
    <span class="ai-pov-ring" aria-hidden="true"></span>🛠 Implementer
  </button>
  <button class="ai-pov-purge" title="Purge finished agents" aria-label="Purge finished agents">⌫</button>
</div>
```

- Ring classes mirror `AgentState`: `is-spawning` (pulse), `is-active` (solid), `is-waiting` (hollow),
  `is-done` (✓ dim), `is-error` (✗), `is-killed` (✕).
- Unread badge on Room and each agent tab; cleared on select.
- Strip hidden entirely when no agent has spawned **and** no links were restored — zero cost for solo use.
- `overflow-x:auto` past ~4 tabs; never wraps, never grows the header (laptop-screen constraint, DESIGN.md).
- Keyboard: roving tabindex, `←`/`→` move, `Home`/`End` jump. `aria-selected` tracks `activeView`.
- Purge button (D6) hidden when nothing is finished.

**Agent message**:

```html
<div class="ai-chat-msg ai-chat-msg-agent" style="--agent-color:#ffd54f" data-msg-index="7">
  <div class="ai-agent-head">
    <span class="ai-agent-icon">🔍</span>
    <span class="ai-agent-name">Reviewer</span>
    <span class="ai-intent-badge is-rebuttal">rebuttal</span>
    <span class="ai-agent-reply">↩ Debugger</span>
  </div>
  <div class="ai-chat-msg-text">…</div>
  <div class="ai-chat-msg-meta"><span class="ai-chat-msg-time">14:22</span>…</div>
</div>
```

Left border in `--agent-color`; intent badge token-scaled (`rebuttal` warm, `finding` neutral,
`suggestion` accent, `verdict` outlined). Error verdicts get `is-error` styling. All persona text
goes through `escapeHtml`/`formatBody` — model-authored names and icons are never injected raw (T11).

**Agent PoV header** (D6) — above the message list when `activeView` is an agent:

```html
<div class="ai-pov-header">
  <span class="ai-pov-persona">🔍 Reviewer</span>
  <span class="ai-pov-stat">step 7 · 3.2k tok · 2/6 broadcasts</span>
  <button class="ai-pov-kill" data-id="agent:xyz">✕ Kill</button>
</div>
```

Kill button hidden when `state ∈ {done, error, killed}` or `archived`.

**Room empty state**: *No agents yet. The main agent will spawn them when a task needs several angles.*

### 6.6 Wiring — `AiDrawer.ts`

- Construct `AgentFeed` + `AgentSessionStore`; `feed.attach(getAgentExecutor())` in the constructor.
- Pass the feed to `RenderController` via a new `getFeed()` host method (same injection style as the
  other sub-controllers).
- `feed.onChange` → `requestAnimationFrame`-coalesced `renderMessages()`. **Required, not optional**:
  step events can outpace frames with several agents running (same discipline as the canvas isolation
  work in `f327847`).
- Bind the strip, purge, and kill buttons with `bindGuarded` (health/monitor discipline).
- `resetSessions()` → `feed.reset()`, `activeView = 'chat'`, `getAgentExecutor().purgeAll()` (T12).
- Tab click while detached → `ensureDrawerOpen()` (T13).
- `SessionStore` host gains `onSessionLoaded(session)` → `feed.hydrate(session.agents ?? [])`.

### 6.7 CSS — `renderer/styles-ai-drawer-05.css` (new, ~200 lines)

Registered in `index.html` where `styles-agents-fleet.css` used to sit. Contains `.ai-pov-strip`,
`.ai-pov-tab`, `.ai-pov-ring`, `.ai-pov-badge`, `.ai-pov-purge`, `.ai-pov-header`, `.ai-pov-kill`,
`.ai-chat-msg-agent`, `.ai-agent-head`, `.ai-intent-badge`, `.ai-agent-reply`.

Discipline per DESIGN.md and the token-scale pass in `e24d078`: token-scaled icon/font/radius,
minimum hit targets on tabs and the kill/purge buttons, no hard-coded hex outside the persona colour
variable, `prefers-reduced-motion` respected on the ring pulse.

**Commit 5** — `feat(ai-drawer): sub-agent room, PoV switcher, @mention, per-agent sessions`

---

## 7. Test plan

### 7.1 New / extended

| File | Cases |
|---|---|
| `agents/definitions.test.ts` | Every built-in passes `guardToolCall(skill, 'agent_broadcast')`; every built-in carries `peer`. |
| `agents/agent-tools.test.ts` | `persona` parses; `persona` + `skill` rejected; `persona.capabilities` is not accepted by the schema (T3); ad-hoc def gets `peer` + `ROOM_TOOLS`; `agent_broadcast` forwards `intent`/`re`. |
| `agents/executor.test.ts` | Persona spawn → `status()` shows label/icon/color, `isCustom: true`, `skill: null`; sanitiser clamps a 500-char name, rejects `red`, takes one grapheme from a multi-emoji icon; ad-hoc name never collides with a built-in; `roomLog` caps at 30 and the digest reaches a later spawn's context; `purgeAll()` clears it. |
| `agents/session.test.ts` | `onEvent` fires `spawn`/`step`/`tool` (twice per call, same `callId`)/`final`; a throwing listener does not abort the run; 7th `agent_broadcast` returns the budget guardrail and does not reach the bus; a denied broadcast does not consume budget. |
| `ai-drawer/agent-feed.test.ts` | Routing table §6.1 holds; tool result patches its pending chip by `callId`; caps evict oldest; `unread` increments only for non-active views; `rebuildRoom()` orders merged messages by timestamp; `reset()` empties everything. |
| `ai-drawer/agent-sessions.test.ts` | Writes to `sessions/agents/<main>-<suffix>.json`; link appended to the main session exactly once; throttle coalesces rapid steps into one write; `final` forces a flush; corrupt file on hydrate is skipped and its link dropped; delete cascade removes every linked file. |
| `components/AiDrawer.test.ts` | Strip hidden with no agents, appears on spawn; switching view swaps the rendered source; `this.messages` untouched by room traffic; token bar unchanged by room traffic (T4); agent message renders name + intent badge; `<script>` in a persona name is escaped; `@Reviewer hi` dispatches to that agent and does not call the LLM; `@nobody hi` falls through to main with a system note; kill button hidden on finished/archived agents. |
| `components/AiDrawer.room.smoke.test.ts` (new) | Replaces the deleted HUD smoke test (T19): drive spawn → say → final purely through tool calls against a real DOM, assert the strip, room, and PoV render. |

### 7.2 Regression guards

- `buildSystemPrompt()` contains no `roundtable` substring and does contain the room section.
- `ALL_TOOLS` has no `roundtable_compose`; `AGENT_TOOLS.length` drops by exactly 1.
- Existing `AiDrawer.test.ts` session/compaction/token cases pass unchanged — proof the main thread's
  data path was not touched.
- A session file written before this change loads with an empty room and no strip (T16).
- `npx vitest run` green; `npm run build` clean; no new `console.error`.

---

## 8. Sequencing

| # | Commit | Scope | Green alone |
|---|---|---|---|
| 1 | `refactor(agents): remove roundtable panel and Agents canvas card` | §2 | yes — sub-agents still work, just invisible |
| 2 | `feat(agents): inline persona spawns designed by the main session` | §3 | yes |
| 3 | `feat(agents): typed per-step event channel for UI observers` | §4 | yes — channel exists, nothing listens |
| 4 | `feat(agents): room protocol, broadcast budget, late-joiner digest` | §5 | yes — room verifiable headless via `agent_status` |
| 5 | `feat(ai-drawer): sub-agent room, PoV switcher, @mention, per-agent sessions` | §6 | yes — the payoff |

Commit 4 before 5 deliberately: the room is verifiable at the tool layer before any UI exists to blame.

**Delta**: −1,179 removed; +~940 added (persona ~90, events ~60, budget ~20, room log ~40,
`agent-feed.ts` ~260, `agent-sessions.ts` ~140, render/types/mention/wiring ~130, CSS ~200 — offset by
the 100 CSS lines deleted).

---

## 9. Risks

1. **Broadcast volume vs. context.** Six agents × six broadcasts = 36 injected turns against 4096-token
   contexts. Mitigated by the hard budget (§5.2), the 30-entry digest cap, and prompt discipline.
   Residual: a 6-agent room at full budget can still trigger `maybeCompact()` mid-run. Watch the first
   real run; the `ROOM_BROADCAST_BUDGET` constant is the tuning knob.
2. **Persona quality is unbounded.** The model can spawn six near-identical personas and manufacture
   consensus. The prompt asks for complementary angles; nothing enforces it. Observe before building
   machinery for it.
3. **Ad-hoc personas skip the `.cockpit/agents` review a file-based definition gets.** Contained by
   `permissionMode: 'default'`, read-only tool default, the unchanged `permissions.ts` +
   `guardToolCall` chain, and T3's hard-coded `capabilities: ['peer']`.
4. **Render churn.** The `requestAnimationFrame` coalescing in §6.6 is load-bearing.
5. **Disk growth.** One file per sub-agent per session. A busy week of 6-agent rooms is thousands of
   small files. Delete cascade (T15) bounds it to live sessions; if it still bites, add a retention
   sweep on load — not in this plan.
6. **Detached float card** shows Chat only. Watching the room while detached would need its own view
   state — follow-up if wanted.

---

## 10. Out of scope

- Replaying a finished room as an animation / timeline.
- User-authored personas via UI (`.cockpit/agents/*.json` still works, untouched).
- Any canvas visualisation of the fleet — the bubble/edge graph dies with `AgentsWindow` and is not
  being ported.
- Per-agent model selection UI (the `model` spawn param already exists, unchanged).
- Retention sweep / archiving of old agent session files.
