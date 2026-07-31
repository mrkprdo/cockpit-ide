# Sub-Agents Plan — Orchestrated Agent Fleet

**Status:** ✅ Implemented (all phases landed; 1491 tests green, spec graph valid)
**Owner:** Cockpit Agent + user
**Relation to existing code:** builds on `src/renderer/ai/*` (LLMClient, ToolRegistry, executeToolCall, ToolContext) and the AiDrawer agent-loop pattern. New code lives under `src/renderer/agents/` + an `agents` canvas card.

---

> Implementation note: the design below was fully delivered. Key landing points:
>
> - **`src/renderer/agents/`** — types.ts (envelope/brief/status contracts), bus.ts (pub/sub + mailboxes + MessageCollector + delivery log), skills.ts (10 SDLC skills + code-enforced guardrails), prompts.ts (skill templates + compaction + orchestration section), session.ts (headless loop, rolling window, LLM compaction, abort), executor.ts (spawn/kill/status/dispatch/wait, caps, lazy singleton), agent-tools.ts (the five `agent_*` tools).
> - **UI** — `src/renderer/components/AgentsPlugin.ts` (bubble graph, animated/stale SVG edges, inspector, spawn/kill/purge controls) + CSS + CanvasArea/App/TopBar integration + persistence to `.cockpit/agents/` (bus.jsonl + roster.json).
> - **Tests** — bus/skills/session/executor unit+integration suites (32 tests) plus zero regressions across the existing 1459.
> - **Specs** — new/updated .spec.md files; `specs_validate` clean except the pre-existing `ai-index` stale row (src/renderer/ai/index.ts never existed).

## 1. Problem

A single agent session holds one long context, does everything sequentially, and cannot delegate. We want:

- Main agent **plans** and, once **confirmed**, **launches precise sub-agents** for SDLC stages (spec, scaffold, implement, review, test, commit, docs).
- Sub-agents are **autonomous sessions**: we send context + skill + guardrails + expected result; they run independently.
- Sub-agent responses are **non-blocking**: main waits on the bus for results and/or for adjacent sub-agents to intercommunicate.
- Sub-agents can **talk to each other** (peer messaging), not only to main → needs a **messaging bus** and a defined **who-captures-what** structure.
- A **dynamic UI**: icon bubbles, animated connection edges, active/stale visual states, spawn/kill from main.
- Sub-agents hold **short context only** — just enough for their specific task.

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                        RENDERER THREAD                      │
│                                                             │
│  ┌────────────┐    dispatch/respond    ┌─────────────────┐  │
│  │ Main Agent │◄───────────────────────│                 │  │
│  │ (AiDrawer  │       AgentBus         │   AgentExecutor │  │
│  │  session)  │───────┬────────────────│ (orchestrator,  │  │
│  └────────────┘       │                │  spawn/kill,    │  │
│                       ▼                │  lifecycle)     │  │
│               ┌─────────────┐          └─────────────────┘  │
│               │ ResponseRouter│  correlationId waiters      │
│               │ + Mailboxes  │  topic subscribers           │
│               └─────────────┘                               │
│                     │  deliver                              │
│        ┌────────────┼────────────┐                          │
│        ▼            ▼            ▼                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ agent A │◄►│ agent B │◄►│ agent C │   headless sessions  │
│  │(impl)   │  │(review) │  │(test)   │   (LLM loop + tools) │
│  └─────────┘  └─────────┘  └─────────┘                     │
│        │            │            │                         │
│  shared: ToolContext (canvas, terminal, editor, git, specs) │
└────────────────────────────────────────────────────────────┘
```

- All agents run in the renderer process (they need `ToolContext` access to canvas/terminal/editor — same constraint as AiDrawer). Concurrency is **cooperative**: each agent loop yields between steps.
- The bus is in-memory; a `.cockpit/agents/` log persists transcripts/bus messages.

## 3. Core Concepts

### 3.1 Headless Agent Session (`SubAgentSession`) ✅

Same pattern as `AiDrawer.runMessage` (stream → tool calls → stream) but:

- No chat UI, no user-steering — fully autonomous.
- Input = one `AgentMessage` of type `dispatch` (the **brief**).
- Owns an `AbortController` (killable), a token budget, a step cap, a timeout.
- Drains its **mailbox** between steps: pending peer messages become injectable context.
- On completion posts a `respond` (or `status`) message on the bus with `correlationId` copied from the brief.

### 3.2 Message Envelope (`AgentMessage`) ✅

One shape for everything on the bus — addressed, correlation-tracked, expiring.

### 3.3 Bus, Router, Collector — "who captures what" ✅

- **AgentBus** — pub/sub transport. `publish(msg)` routes by `to` (direct / multicast / broadcast) and by `topic`.
- **Mailbox** — every agent has one; messages addressed to it queue until the agent drains them between loop steps.
- **MessageCollector** — the *capture* layer. Every message with `expectsResponse` registers a waiter keyed by `correlationId`. When a `respond`/`request` arrives whose `correlationId` + `replyTo` match, the waiter resolves.
- **Topic subscribers** — `subscribe(topic, handler)` for fan-out.
- Delivery log entries `{msgId, deliveredTo[], dropped[], ts}` — the audit trail of who got what.

### 3.4 Skills Registry (SDLC pipeline) ✅

10 skills: planner, spec-orienter, scaffolder, implementer, reviewer, tester, debugger, git-committer, docs-writer, spec-sync — each with icon/color/prompt/allowedTools/capabilities/contextTokens/maxSteps/timeoutMs.

### 3.5 Guardrails (enforced in code, not just prompt) ✅

Tool-executor wrapper (`guardToolCall`) + hard deny-list requiring capabilities (`destructive` / `orchestrate` / `peer`).

### 3.6 Short-Context Policy ✅

Brief + rolling window (last N tool turns) + LLM compaction on 80% budget; per-dispatch context; token budget with graceful partial respond.

### 3.7 Lifecycle & Kill ✅

planned → spawning → active ⇄ waiting(blocked on peer) → done · error · killed · expired. `kill` message + AbortController; TTL on messages.

### 3.8 Agent Tools (for the main session and capable sub-agents) ✅

`agent_spawn` · `agent_dispatch` · `agent_wait` · `agent_status` · `agent_kill` — registered in ALL_TOOLS; main session prompt gains the orchestration section (appended by AiDrawer).

## 4. Dynamic UI — `agents` Canvas Card ✅

Bubbles (main pinned + agent bubbles with skill icon + status ring), SVG edges (colored `is-firing` → `is-idle` → gray dashed `is-stale`, re-fired on wake), active/pulsing vs stale/gray states, inspector (brief/guardrails/mailbox/steps/tokens/result/kill), spawn form + purge/kill-all. Card persists like other canvas cards; singleton per workspace.

## 5. Example Flow — full SDLC run

```
user: "implement the auth module per specs"
main: plans (uses specs_explore) → presents plan → user confirms
main: agent_spawn('planner', context, expectedResult='P0..P3 plan with deps')
     └ planner: respond(plan) → collector resolves
main: agent_spawn('spec-orienter', plan) ─┐ parallel
      agent_spawn('scaffolder', plan)  ───┘
main: agent_spawn('implementer', spec-orienter.result + scaffold)
impl: request('review.request', to: reviewer)   ← peer edge impl→reviewer
reviewer: respond(review, corrId)               ← edge reviewer→impl
impl: patches → respond('impl.done', {files})
main: agent_spawn('tester', impl.result)
tester: respond('test.passed', summary)
main: agent_spawn('spec-sync') → reconcile → agent_spawn('git-committer')
main: final summary to user
```

## 6. Concurrency & Safety ✅

Cooperative scheduling, global caps (default 5, settable), per-agent timeout, AbortController wired to fetch signal, shared state only via bus + filesystem, bus traffic logged to `.cockpit/agents/bus.jsonl`.

## 7. Persistence ✅

`.cockpit/agents/` — `bus.jsonl` (message log), `roster.json` (lifecycle snapshot). Resurrect/replay of a past fleet is future work.

## 8. Phases

- **P0 — Types & Bus** ✅ (`types.ts`, `bus.ts` + tests)
- **P1 — Skills & Guardrails** ✅ (`skills.ts` + tests)
- **P2 — Headless Session** ✅ (`session.ts` + tests)
- **P3 — Executor** ✅ (`executor.ts` + `agent_*` tools + tests)
- **P4 — SDLC skill prompts** ✅ (`prompts.ts`; orchestration section wired into AiDrawer)
- **P5 — UI card v1** ✅ (`AgentsPlugin.ts`, CanvasArea/App/TopBar integration, styles)
- **P6 — Edges & animation** ✅ (SVG edges, firing/idle/stale, wake-up styling)
- **P7 — Peer messaging polish** ✅ (mailbox badge, inspector, kill controls, TTL)
- **P8 — Persistence & hardening** ✅ (`.cockpit/agents/`, spec sync + validation)

## 9. Open Questions (resolved during implementation)

1. **Confirmation UX** → the main agent steers via its normal plan/step modes; no dedicated card button needed (spawn form is a manual fallback).
2. **Auto-chain** → main decides per stage via the orchestration section; read-only stages auto-chain, mutating stages respect the drawer's destructive-tool confirmation.
3. **Shared LLM endpoint** → sub-agents share the AiDrawer config via a provider (`setConfigProvider`); per-skill overrides remain possible via `setConfigOverride`.
4. **Worker vs renderer** → renderer (needs ToolContext); cooperative async, no worker threads.
5. **Compaction granularity** → per-loop-check at 80% of the skill context budget + rolling window.
6. **Agent count cap** → default 5, settable via `setMaxConcurrent` (1–20).
