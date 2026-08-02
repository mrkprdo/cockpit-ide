# Agentic & Subagent Overhaul — Design

Status: **Implemented (2026-07-31).** All sections §1–§7, §9–§11 are landed; §8 (worktree isolation, per-agent MCP, container guardrails) remains deferred as designed. See the file map below for the concrete modules.

This document maps the Claude-Code-style subagent architecture onto Cockpit IDE's existing agent fleet. It is the contract for the implementation pass that follows. It only proposes **new** surface; anything already present (bus, skills, session, executor, `agent_*` tools) is described as-is where it stays, and flagged where it changes.

---

## 0. Current state (what we already have)

All under `src/renderer/agents/`:

| Module | Responsibility | Status |
|---|---|---|
| `types.ts` | `AgentMessage` envelope, `AgentBrief`, `Skill`, `AgentState`, `AgentStatus` | stays |
| `bus.ts` | Pub/sub bus, mailboxes, `waitFor` collector, delivery log | stays (add `hook` events) |
| `skills.ts` | 10 SDLC skills (allowlists + `capabilities`), `guardToolCall`, `HARD_DENY` | **refactor into data** |
| `prompts.ts` | `AGENT_SHARED_PREAMBLE`, `SKILL_PROMPTS`, `COMPACTION_PROMPT`, `ORCHESTRATION_SECTION` | extends |
| `session.ts` | `SubAgentSession` headless loop (short context, compaction, mailbox injection) | **extended** |
| `executor.ts` | `AgentExecutor` singleton (spawn/kill/status/dispatch/wait), respond cache | **extended** |
| `agent-tools.ts` | `agent_spawn/dispatch/wait/status/kill` tool defs | **extended** |

Fleet is wired into the main session (`AiDrawer` → `ORCHESTRATION_SECTION`, `setConfigProvider`), the UI card (`AgentsPlugin`), and persistence (`App.ts` → `.cockpit/agents/{bus.jsonl,roster.json}`).

**Gaps vs. the Claude Code architecture (this overhaul):**

1. Subagent definitions are hardcoded `Skill` objects; no user-defined agents, no `description`/`model`/`disallowedTools`/`permissionMode`/`hooks`/`color`.
2. No permission layer — only a per-skill tool allowlist + capability hard-deny. No `allow`/`deny`/`ask` pattern matching (`Bash(npm run test *)`, `Read(./**/*.ts)`).
3. No hook lifecycle (`PreToolUse`/`PostToolUse`/`SubagentStart`/`SubagentStop`, exit code 2 = block). Requires a real command runner — main has only git `execFile` + PTY today.
4. No per-agent model selection — the fleet inherits the drawer's single model.
5. `maxSteps` exists but there is no `maxTurns`/`effort`/`background`/`isolation` concept.
6. Memory scopes are `global`/`workspace` only; no `user`/`project`/`local` agent-memory dirs.
7. No subagent **spawn restriction** beyond `capabilities` (the doc's `Agent(worker, researcher)` allowlist).

---

## 1. Target architecture (derived)

```
┌────────────────────────────────────────────────────────────┐
│ ORCHESTRATION  AiDrawer + ORCHESTRATION_SECTION + agents/  │
│   executor.ts (spawn/dispatch/wait/kill/status)            │
├────────────────────────────────────────────────────────────┤
│ SUBAGENT HARNESS  SubAgentSession (headless loop)          │
│   • system prompt  = definition.systemPrompt + preamble    │
│   • tool access    = definition.tools ∩ disallowedTools    │
│   • permission mode= definition.permissionMode             │
│   • model          = definition.model → executor provider  │
│   • maxTurns       = definition.maxTurns (renamed maxSteps)│
├────────────────────────────────────────────────────────────┤
│ GUARDRAIL LAYER                                            │
│   permissions.ts   allow/deny/ask matchers (Tool(pattern)) │
│   hooks.ts         PreToolUse/PostToolUse/Sub/Start/Stop   │
│   main shell:exec  IPC → command runner (exit 2 = block)   │
├────────────────────────────────────────────────────────────┤
│ ISOLATION (deferred, see §8)   worktree isolation stub     │
├────────────────────────────────────────────────────────────┤
│ TOOL LAYER  ToolRegistry (ALL_TOOLS + agent_* + hooks)     │
└────────────────────────────────────────────────────────────┘
```

New modules (all renderer unless noted):

| New file | Purpose |
|---|---|
| `src/renderer/agents/definitions.ts` | `SubAgentDefinition` type, built-in definition registry, loader for `.cockpit/agents/*.json`, merge/validate |
| `src/renderer/agents/permissions.ts` | `PermissionMode`, `PermissionRule` matchers (`Tool(pattern)`), `evaluatePermission` |
| `src/renderer/agents/hooks.ts` | `HookSpec`, hook runner, PreToolUse/PostToolUse/SubagentStart/SubagentStop dispatch, exit-code semantics |
| `src/renderer/agents/definition-file.ts` | Parse a `.cockpit/agents/<name>.json` → `SubAgentDefinition` (separate from `skills.ts` to avoid a cycle) |
| `src/main/shell.ts` | New `shell:exec` IPC handler (command runner w/ timeout + exit code + output) |
| `src/renderer/agents/memory-scopes.ts` | `user`/`project`/`local` agent-memory directory resolution over `electronAPI.fs` |

Changed files:

| File | Change |
|---|---|
| `src/renderer/agents/types.ts` | Add `SubAgentDefinition`, `PermissionMode`, `HookEventName`, `SpawnParams` extensions; keep old types |
| `src/renderer/agents/skills.ts` | Rebuilt on top of `definitions.ts` — `SKILLS` becomes derived data; `guardToolCall` kept as a fast path, superseded by `permissions.ts` |
| `src/renderer/agents/session.ts` | Consume `SubAgentDefinition`; run permission gate + hooks around every tool call; per-agent model |
| `src/renderer/agents/executor.ts` | `spawn` accepts `agent: string` (definition id) OR `skill`; per-agent LLM config; hooks lifecycle |
| `src/renderer/agents/agent-tools.ts` | `agent_spawn` gains `agent` param + optional `model`/`permission_mode`/`max_turns` overrides; add `agent_hooks`? (no — hooks are config, not a tool) |
| `src/renderer/ai/tool-definitions.ts` | Register `definitions_reload`/`definitions_list` tools; pass hook context |
| `src/renderer/ai/types.ts` | `ToolContext` gains `hooks`/`permissions` accessors (used by session, not by plain tools) |
| `src/preload/preload.ts` + `src/global.d.ts` | Add `shell.exec` |
| `src/main/main.ts` | Import + register `shell.ts` handler |
| `src/renderer/components/AiDrawer.ts` | Load definitions on workspace open; list custom agents in `ORCHESTRATION_SECTION` |
| `src/renderer/components/AgentsPlugin.ts` | Spawn form supports definitions; show permission mode/hooks in inspector |

---

## 2. SubAgentDefinition (the core data model)

```ts
// src/renderer/agents/definitions.ts
export interface PermissionSet {
  allow: string[];   // e.g. ['Bash(npm run test *)', 'Read(./**/*.ts)', 'Edit(src/**)']
  deny: string[];    // e.g. ['Bash(rm *)', 'Write(.env)', 'Write(.git/**)']
  ask: string[];     // e.g. ['Bash(npm install *)', 'Edit(package.json)']
}

export interface HookSpec {
  matcher?: string;  // tool name or '*' ; default '*'
  command: string;   // shell command; receives JSON on stdin, exit code 2 = block
}

export interface HooksSpec {
  PreToolUse?: HookSpec[];
  PostToolUse?: HookSpec[];
  SubagentStart?: HookSpec[];
  SubagentStop?: HookSpec[];
}

export interface SubAgentDefinition {
  name: string;                  // unique, lowercase-hyphens
  description: string;           // when to delegate (drives agent_spawn/UI)
  systemPrompt: string;          // markdown body (role/constraints/output)
  model?: string;                // override; else executor config
  tools?: string[];              // allowlist (default: inherit READ_ONLY_TOOLS)
  disallowedTools?: string[];    // subtract from inherited/allowlist
  maxTurns?: number;             // default from executor (e.g. 24)
  permissionMode?: PermissionMode; // 'default' | 'acceptEdits' | 'auto' | 'plan' | 'dontAsk'
  permissions?: PermissionSet;   // pattern matchers
  hooks?: HooksSpec;             // lifecycle hooks
  capabilities?: string[];       // keep existing 'orchestrate'|'peer'|'destructive'
  color?: string;                // bubble color (UI)
  timeoutMs?: number;
  contextTokens?: number;
  background?: boolean;          // reserved; session already runs detached
  memoryScope?: 'user' | 'project' | 'local'; // see §7
}
```

### Built-ins become definitions

The ten skills (planner, spec-orienter, scaffolder, implementer, reviewer, tester, debugger, git-committer, docs-writer, spec-sync) are rebuilt as `SubAgentDefinition`s in `definitions.ts`, keeping their existing `allowedTools`/`capabilities`/`contextTokens`/`timeoutMs` and prompt templates. `skills.ts` becomes a thin compatibility layer:

```ts
const skill = getSkill(name) // derived from BUILTIN_DEFINITIONS
```

`guardToolCall` stays for back-compat but the session will use the new `evaluatePermission` first, then `guardToolCall` as an additional hard deny. **No behavior regression**: reviewer stays read-only, git-committer never pushes, etc.

### Definition file format (`user` scope)

```jsonc
// .cockpit/agents/<name>.json
{
  "name": "db-reader",
  "description": "Read-only SQL analyst. Use when a task needs DB queries.",
  "tools": ["Bash"],
  "permissionMode": "default",
  "permissions": {
    "allow": ["Bash(select *)"],
    "deny": ["Bash(insert *)", "Bash(update *)", "Bash(delete *)", "Bash(drop *)"]
  },
  "hooks": {
    "PreToolUse": [{ "matcher": "Bash", "command": "scripts/validate-readonly-query.sh" }]
  },
  "maxTurns": 10,
  "color": "blue",
  "systemPrompt": "You are a database analyst with read-only access.\nOnly execute SELECT queries."
}
```

Loader (`definition-file.ts`) reads `<wsPath>/.cockpit/agents/*.json` via `electronAPI.fs.readDir/readFile`, validates with zod, dedupes against built-ins (built-in wins on name collision, with a warning), and merges. Malformed files produce an error row in `definitions_list`, never a crash.

---

## 3. Permission layer (`permissions.ts`)

### 3.1 Pattern grammar

`Tool(glob)` where `Tool` ∈ `Read | Write | Edit | Bash | Grep | WebFetch | Agent | *`, and `glob` is a minimatch-style pattern over the tool's primary argument:

- `Bash(npm run test *)` — command prefix match
- `Bash(git push *)` — deny remote ops
- `Read(./**/*.ts)` — path pattern
- `Write(.env)` / `Write(.git/**)` — sensitive paths
- `Edit(package.json)` — require approval for deps
- `Agent(worker)` / `Agent(worker, researcher)` — restrict spawnable subagents
- `*` — matches any tool

Bare tool name (`"Read"`) = matches the tool with any args. Parse via a small tokenizer; the arg segment is glob-compiled to a RegExp (escape specials, `*` → `.*`, `**` → `(.*)`). No dependency added — ~40 lines.

### 3.2 Evaluation

```ts
type PermissionDecision = 'allow' | 'deny' | 'ask' | 'unset';

function evaluatePermission(
  def: SubAgentDefinition,
  toolName: string,
  args: Record<string, unknown>,
): PermissionDecision
```

Order: **deny > ask > allow > mode default** (deny always wins; a single deny hit blocks even if an allow also matches — like Claude Code). Path normalization: backslashes → `/`, `.` and `..` resolved, rooted at workspace path.

### 3.3 Permission modes (session-level, from the doc §L1)

| Mode | Behavior in this app |
|---|---|
| `default` | tool executes if permission says `allow`; `ask` pauses the session and reports a pending-approval status message (headless agents → surface as `error` with reason `needs-approval`, see §3.4); `unset` → allowed for reads, denied for writes (conservative) |
| `acceptEdits` | `Write`/`Edit` auto-approved within the workspace; `Bash` still gated |
| `auto` | auto-approve `allow` + `ask` (treated as allow); deny still blocks |
| `plan` | read-only: all `Write`/`Edit`/`Bash`/`git_commit`/`specs_reconcile` denied, everything else allowed |
| `dontAsk` | only `allow` runs; everything else denied (no ask) |

These are enforced in `session.ts` inside the tool loop, *after* `guardToolCall` hard-deny and *before* `executeToolCall`. The main session (`AiDrawer`) is unaffected — modes apply to sub-agents. Default for a definition without `permissionMode`: `acceptEdits` (matches current implementer behavior).

### 3.4 Headless `ask`

Sub-agents cannot show a UI prompt. For `ask`-matched tools we do **not** block-and-wait (would deadlock a detached loop). Instead:
- `evaluatePermission` returns `ask` → session sets a flag `pendingApproval = { tool, args, correlationId }`.
- The tool call is skipped; a status message `agent.status.<id>` with `needsApproval` is posted.
- `agent_wait` on that correlation resolves with `{ ok: false, reason: 'needs-approval' }`.
- A new optional main-tool `agent_approve(correlation_id, yes)` resolves the pending item; if yes, the session re-runs the tool (the transcript carries an injected `user` message noting approval). If no, it posts an error and stops.

This keeps the fleet autonomous while preserving the guardrail. `acceptEdits`/`auto` modes never produce `ask`.

---

## 4. Hooks (`hooks.ts` + `main/shell.ts`)

### 4.1 IPC: `shell:exec` (new)

Main-process command runner. Unlike git's `execFile` (which never touches a shell), hooks need real shell semantics on Windows (`cmd.exe /C`) and POSIX (`/bin/bash -c`).

```
electronAPI.shell.exec(command: string, opts: {
  cwd?: string;
  timeoutMs?: number;   // default 30_000
  input?: string;       // JSON payload passed on stdin
}) => Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>
```

Implementation in `src/main/shell.ts`: `child_process.spawn` with `windowsHide: true`, `env` merge, kill on timeout, `maxBuffer` guard (~1 MB), and **no shell-metacharacter risk for the caller** (the renderer supplies the whole command string — this is the same trust model as `write_to_terminal`; the workspace path gate from `isPathSafe` applies to `cwd`). Add to `preload.ts` (`shell.exec`) and `global.d.ts`.

Security note: the renderer is the only IPC caller; the existing workspace trust gate is applied to `cwd`. This is consistent with the existing `terminal:create` (renderer already can run arbitrary commands in the workspace terminal).

### 4.2 Hook contract

- Hook input (JSON on stdin): `{ hook_event_name, agent_id, tool_name, tool_input, start_time }`.
- Exit code semantics (Claude Code convention): `0` = pass/allow, `2` = block (PreToolUse) or flag failure (PostToolUse), other non-zero = error (logged, non-blocking for PostToolUse; PreToolUse treats only `2` as block, other failures log a warning and continue).
- Timeout defaults 30s; a timed-out PreToolUse hook blocks (conservative).
- Hooks run sequentially in definition order; the first `2` short-circuits.

### 4.3 Where they fire in `session.ts`

| Event | When |
|---|---|
| `SubagentStart` | once, right before the first `chatCompletion` (after `spawning` → `active`) |
| `PreToolUse` | per tool call, after permission gate, before execution; exit 2 → output becomes the guardrail error string |
| `PostToolUse` | per tool call, after execution, with the result; non-blocking |
| `SubagentStop` | once, in `finally` of `run()` |

Hook output is appended to the transcript as a `user`-role message (visible to the model), capped at ~2k chars.

---

## 5. Per-agent model + maxTurns + effort

### 5.1 Model resolution order

1. `SpawnParams.model` (agent_spawn arg override)
2. `definition.model`
3. `executor.setConfigOverride(...)`
4. `executor.setConfigProvider(...)` (the drawer's current config)

`AgentExecutor.spawn` already builds a fresh `LLMClient` per agent; it just needs to resolve config via the above chain instead of a single `resolveConfig()`.

### 5.2 maxTurns / effort

- `maxSteps` is kept as the internal name (session loop already caps on it); `SubAgentDefinition.maxTurns` maps onto it. `agent_spawn` gains `max_turns` override.
- `effort` (low/medium/high) is accepted in the definition and passed as a `reasoning_effort` field to the completion body **only if the model metadata supports it** (`model-metadata.ts`); otherwise ignored. Low risk, optional in this pass.

---

## 6. Orchestration additions (small)

- `agent_spawn` schema: replace `skill: enum` with `skill: enum` **or** `agent: string` (definition id). Keep `skill` for back-compat. Add optional `model`, `permission_mode`, `max_turns`.
- Spawn restriction: `Agent(name...)` deny patterns in `permissions` gate `agent_spawn`/`agent_dispatch` targets — the doc's "subagent spawning restrictions". Evaluated in `agent-tools.ts` via `evaluatePermission`.
- Parallel/nested orchestration already works via the bus + correlation IDs; no new mechanism needed. Document the patterns in `ORCHESTRATION_SECTION`.

---

## 7. Memory scopes (`memory-scopes.ts`)

Map the doc's `user`/`project`/`local` onto the existing memory system without breaking `MemoryStore`:

| Claude scope | This app | Location |
|---|---|---|
| `user` | `global` (existing) | `%APPDATA%/cockpit/memory.json` |
| `project` | `workspace` (existing) | `<wsPath>/.cockpit/memory.json` |
| `local` | new: `workspace-local` | `<wsPath>/.cockpit/agents/memory/<name>.md` — agent-scoped scratch, not version-controlled |

`memoryScope` on a definition is passed to the session; the existing memory_* tools already accept `global`/`workspace` scopes so no IPC change is needed for user/project. `local` is a per-agent file the session can read/write via `electronAPI.fs` (used for long-running state handoff between dispatches). This is the smallest slice that delivers the doc's §7 semantics.

---

## 8. Deferred (designed, not in this pass)

- **Worktree isolation** (`isolation: worktree`): needs new `git:worktree-add/remove` IPC in main. The session would operate on a `GIT_WORK_TREE` override. Flagged as follow-up; the `background`/`isolation` fields are reserved in the definition type but ignored for now.
- **MCP servers per agent** (`mcpServers:` in definition): the renderer has no MCP client; `ide-server.ts` is a Claude-IDE-protocol server, not an MCP client. Out of scope.
- **Container/VM deployment guardrails** (§8 of the doc): not applicable to a desktop IDE's renderer.

---

## 9. Spec & test plan (Change Protocol compliant)

### Specs to add
| New spec | File |
|---|---|
| `definitions.spec.md` | `src/renderer/agents/definitions.ts` |
| `permissions.spec.md` | `src/renderer/agents/permissions.ts` |
| `hooks.spec.md` | `src/renderer/agents/hooks.ts` |
| `definition-file.spec.md` | `src/renderer/agents/definition-file.ts` |
| `shell.spec.md` | `src/main/shell.ts` (type: process, layer: process) |
| `memory-scopes.spec.md` | `src/renderer/agents/memory-scopes.ts` |

### Specs to update (structural via reconcile + prose by hand)
- `agents-types.spec.md` — add new type exports
- `agents-plugin.spec.md` — spawn form + inspector changes
- `agent-tools.spec.md` — new `agent`/`model`/`permission_mode`/`max_turns` params + `agent_approve`
- `ai-types.spec.md` — `ToolContext` extensions
- `main-process.spec.md` — `shell:exec` IPC channel (both ends)
- `main.spec.md` — Features rows for new files; IPC catalog `shell:exec`

### Tests (vitest, jsdom)
| File | Covers |
|---|---|
| `permissions.test.ts` | grammar parsing, glob→regex, deny>ask>allow order, path normalization, all 5 modes |
| `hooks.test.ts` | exit-code semantics (0/2/other/timeout), sequential short-circuit, payload shape |
| `definitions.test.ts` | built-ins derived from definitions; collision policy; merge |
| `definition-file.test.ts` | load valid/invalid/malformed `.json` via mocked `electronAPI.fs` |
| `shell.test.ts` | spawn/cwd/timeout/exit code (integration via real child_process, gated) |
| `memory-scopes.test.ts` | scope resolution paths |
| `session.test.ts` (extend) | permission gate ordering, ask→needsApproval, hooks fire order |
| `executor.test.ts` (extend) | model resolution chain, spawn by `agent`, `agent_approve` flow |
| `agent-tools.test.ts` (extend) | new schema params, spawn restriction via `Agent()` deny |

Existing 1430-test suite must stay green (2 known pre-existing failures in `main.test.ts` excluded).

---

## 10. Build & wiring checklist

1. `npm run build` (esbuild renderer + tsc main/preload) — new files compile both pipelines.
2. `npx tsc -p tsconfig.main.json --noEmit` and `npx tsc -p tsconfig.renderer.json` clean.
3. `npm test` passes (coverage thresholds: st 70 / br 60 / fn 65 / li 70 — new modules come with tests, not untested surface).
4. `npm run dev` smoke: open Agents card, spawn a built-in, spawn a custom `.cockpit/agents/db-reader.json`, verify permission/hooks UI.
5. Regenerate `src/renderer/specgen-hash.ts` via `scripts/gen-specgen-hash.js` (build does it) and commit with the spec changes.

## 11. Suggested implementation order

1. `definitions.ts` + `types.ts` extensions + `skills.ts` refactor (pure refactor, tests first)
2. `permissions.ts` + tests
3. `main/shell.ts` + IPC + `global.d.ts`/`preload.ts`
4. `hooks.ts` + tests
5. `session.ts` integration (permission gate → hooks → model resolution)
6. `executor.ts` + `agent-tools.ts` (spawn by agent, overrides, `agent_approve`)
7. `definition-file.ts` + `memory-scopes.ts` + `AiDrawer`/`AgentsPlugin` UI
8. Specs (new + structural reconcile) + `specgen-hash.ts` regen
9. Full test + build + typecheck pass

---

*Open questions for review: (1) confirm `.cockpit/agents/*.json` as the user-definition directory vs. `{workspace}/.agents/`; (2) confirm `ask` behavior — resolve-by-`agent_approve` vs. simple auto-deny with a log; (3) whether `permissionMode` default should be `acceptEdits` (recommended, matches current impl) or `default`.*
