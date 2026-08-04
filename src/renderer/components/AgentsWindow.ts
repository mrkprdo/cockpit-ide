import { getAgentExecutor } from '../agents/executor';
import { listRoundtablePlans } from '../agents/roundtable';
import type { AgentMessage, AgentStatus } from '../agents/types';
import type { RoundtablePlan } from '../agents/roundtable';

interface Connection {
  id: string;
  from: string;
  to: string;
  ts: number;
  color: string;
}

/** A roundtable session currently visible on the fleet: its plan + whichever experts are live. */
interface LiveRoundtableSession {
  plan: RoundtablePlan;
  agents: AgentStatus[];
  responded: number;
}

/**
 * Agents canvas card — live fleet telemetry. Fully passive: every agent and
 * every roundtable panel shown here was spawned by the LLM via agent_* tools
 * (agent_spawn, roundtable_compose, …) mid-conversation. There is no manual
 * spawn form and no manual roundtable composer — this card only observes and
 * offers safety-valve controls (kill / purge) over what's already running.
 *
 * - Bubbles: main (pinned) + one per sub-agent, skill icon + label + status
 *   ring. Roundtable experts (definition id `expert-*`) get a dashed ring +
 *   🎯 badge so the panel reads as a group on the canvas.
 * - Edges: SVG lines between bubbles when a message travels (dispatch, peer
 *   request, respond). Active edges are colored + animated dashes; idle edges
 *   decay to gray dashed ("stale") after a few seconds and re-fire on wake.
 * - Inspector: click a bubble to see brief, guardrails, mailbox, steps/tokens,
 *   result preview.
 * - Roundtable: any session the LLM has composed (agents/roundtable.ts's live
 *   plan registry) and spawned experts for renders automatically as a quorum
 *   tracker — chips per expert, a progress bar toward quorum, kill-panel only.
 */
export class AgentsWindow {
  private root: HTMLDivElement;
  private statuses: AgentStatus[] = [];
  private connections: Connection[] = [];
  private selectedId: string | null = null;
  private raf = 0;
  private destroyed = false;

  constructor(body: HTMLElement, _wsPath: string) {
    this.root = document.createElement('div');
    this.root.className = 'agents-root';
    body.appendChild(this.root);
    this.renderShell();
    this.refreshStatuses();

    const ex = getAgentExecutor();
    ex.onStatusChange = () => this.scheduleRefresh();
    ex.onBusMessage = (msg) => this.recordMessage(msg);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    const ex = getAgentExecutor();
    ex.onStatusChange = null;
    ex.onBusMessage = null;
    this.root.remove();
  }

  // ── Shell ──────────────────────────────────────────────────────────────────

  private renderShell(): void {
    this.root.innerHTML = `
      <div class="agents-hud">
        <div class="agents-fleet">
          <svg class="agents-svg" width="100%" height="100%"></svg>
          <div class="agents-bubbles"></div>
        </div>
        <div class="agents-side">
          <div class="agents-side-header">
            <span class="agents-side-title">Fleet</span>
            <span class="agents-side-rt-wrap">
              <span class="agents-side-count"></span>
              <button class="agents-side-rt-chip" title="Live roundtable session" hidden>🎯 <span class="agents-side-rt-count"></span></button>
            </span>
            <span class="agents-side-ops">
              <button class="agents-purge-btn" title="Purge finished agents">🧹</button>
              <button class="agents-killall-btn" title="Kill all agents">⛔</button>
            </span>
          </div>
          <div class="agents-inspector"></div>
          <div class="agents-rt" hidden>
            <div class="agents-rt-sessions"></div>
          </div>
        </div>
      </div>
    `;
    this.bindOpsControls();
  }

  private bindOpsControls(): void {
    const purgeBtn = this.root.querySelector<HTMLButtonElement>('.agents-purge-btn');
    const killAllBtn = this.root.querySelector<HTMLButtonElement>('.agents-killall-btn');
    const headChip = this.root.querySelector<HTMLButtonElement>('.agents-side-rt-chip');

    // The chip is only ever visible while a session is live (renderRoundtable
    // toggles `hidden`) — clicking it scrolls that live card into view.
    headChip?.addEventListener('click', () => {
      this.root.querySelector('.agents-rt')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    purgeBtn?.addEventListener('click', () => {
      getAgentExecutor().purgeFinished();
      this.scheduleRefresh();
    });

    killAllBtn?.addEventListener('click', () => {
      getAgentExecutor().purgeAll();
      this.scheduleRefresh();
    });
  }

  // ── Roundtable (live telemetry only) ─────────────────────────────────────

  /** Roundtable plans the LLM has composed that currently have at least one live/known expert. */
  private liveRoundtableSessions(): LiveRoundtableSession[] {
    const sessions: LiveRoundtableSession[] = [];
    for (const plan of listRoundtablePlans()) {
      const agents = this.statuses.filter(s => s.roundtableSessionId === plan.sessionId);
      if (agents.length === 0) continue;
      const responded = agents.filter(s => s.state === 'done' || s.state === 'error').length;
      sessions.push({ plan, agents, responded });
    }
    return sessions;
  }

  /** Kill every still-running expert in a roundtable session (safety valve, not setup). */
  private killRoundtableSession(sessionId: string): void {
    for (const a of this.statuses) {
      if (a.roundtableSessionId === sessionId && !['done', 'error', 'killed'].includes(a.state)) {
        getAgentExecutor().kill(a.id as never);
      }
    }
    this.scheduleRefresh();
  }

  private renderRoundtableCard(session: LiveRoundtableSession): string {
    const { plan, agents, responded } = session;
    const chips = plan.experts.map(e => {
      const st = agents.find(a => a.definition === e.definition);
      const state = st?.state ?? 'queued';
      const dot = state === 'done' ? '✓' : state === 'error' ? '✗' : state === 'killed' ? '✕' : state === 'queued' ? '○' : '●';
      const title = st ? `${e.name} — ${state}${st.error ? ` · ${st.error}` : ''}` : `${e.name} — not launched yet`;
      return `<button class="agents-rt-chip is-${state}" data-def="${e.definition}" title="${this.escapeAttr(title)}" ${st ? `data-agent="${st.id}"` : ''}>
        <span class="agents-rt-chip-dot">${dot}</span>
        <span>${e.icon} ${this.escapeHtml(e.name.replace(' Master', ''))}</span>
        ${st?.mailboxCount ? `<span class="agents-rt-chip-mail">${st.mailboxCount}</span>` : ''}
      </button>`;
    }).join('');

    const pct = Math.round((responded / plan.panelSize) * 100);
    const quorumMet = responded >= plan.quorum;

    return `
      <div class="agents-rt-plan">
        <div class="agents-rt-plan-head">
          <span class="agents-rt-plan-id" title="${this.escapeAttr(plan.topic)}">${plan.sessionId}</span>
          <span class="agents-rt-plan-quorum">${quorumMet ? '🎉 quorum met' : `quorum ${plan.quorum}/${plan.panelSize}`}</span>
        </div>
        <div class="agents-rt-progress"><div class="agents-rt-progress-fill${quorumMet ? ' is-met' : ''}" style="width:${pct}%"></div></div>
        <div class="agents-rt-plan-issue">${this.escapeHtml(this.rtIssueOf(plan))}</div>
        <div class="agents-rt-chips">${chips}</div>
        <div class="agents-rt-actions">
          <button class="agents-rt-killall-btn" data-session="${plan.sessionId}" title="Abort this panel">⛔ ${responded}/${plan.quorum} responded</button>
        </div>
      </div>
    `;
  }

  private renderRoundtable(): void {
    const containerEl = this.root.querySelector<HTMLElement>('.agents-rt');
    const sessionsEl = this.root.querySelector<HTMLElement>('.agents-rt-sessions');
    const headChip = this.root.querySelector<HTMLButtonElement>('.agents-side-rt-chip');
    const headCount = this.root.querySelector<HTMLElement>('.agents-side-rt-count');
    if (!containerEl || !sessionsEl) return;

    const sessions = this.liveRoundtableSessions();
    if (sessions.length === 0) {
      containerEl.hidden = true;
      sessionsEl.innerHTML = '';
      if (headChip) headChip.hidden = true;
      return;
    }

    containerEl.hidden = false;
    if (headChip) headChip.hidden = false;
    if (headCount) headCount.textContent = String(sessions.length);

    sessionsEl.innerHTML = sessions.map(s => this.renderRoundtableCard(s)).join('');

    sessionsEl.querySelectorAll<HTMLElement>('.agents-rt-chip').forEach(el => {
      el.addEventListener('click', () => {
        const agentId = el.dataset.agent;
        if (agentId) {
          this.selectedId = agentId;
          this.renderInspector();
        }
      });
    });
    sessionsEl.querySelectorAll<HTMLButtonElement>('.agents-rt-killall-btn').forEach(btn => {
      btn.addEventListener('click', () => this.killRoundtableSession(btn.dataset.session!));
    });
  }

  // ── Data hooks ─────────────────────────────────────────────────────────────

  private refreshStatuses(): void {
    try {
      this.statuses = getAgentExecutor().status();
    } catch {
      this.statuses = [];
    }
  }

  private scheduleRefresh(): void {
    if (this.destroyed || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.destroyed) return;
      this.refreshStatuses();
      this.renderFleet();
      this.renderInspector();
      this.renderRoundtable();
    });
  }

  private recordMessage(msg: AgentMessage): void {
    if (this.destroyed) return;
    const to = Array.isArray(msg.to) ? msg.to[0] : (msg.to === '*' ? null : msg.to);
    if (!to || to === msg.from) return;
    this.connections = this.connections.filter(c => c.id !== msg.id);
    this.connections.push({
      id: msg.id,
      from: msg.from,
      to,
      ts: Date.now(),
      color: this.colorFor(msg.from),
    });
    if (this.connections.length > 60) {
      this.connections.splice(0, this.connections.length - 60);
    }
    this.scheduleRefresh();
  }

  private colorFor(id: string): string {
    if (id === 'main') return 'var(--accent, #00e5ff)';
    const st = this.statuses.find(s => s.id === id);
    return st?.color || '#78909c';
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  private bubblePosition(index: number, total: number, w: number, h: number): { x: number; y: number } {
    const cx = Math.max(110, w * 0.3);
    const cy = h / 2;
    const radius = Math.max(100, Math.min(w * 0.34, 260));
    if (index === -1) return { x: cx, y: cy };
    const angle = -Math.PI / 2 + (total <= 1 ? 0 : (index / (total - 1)) * Math.PI);
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  }

  // ── Fleet render ───────────────────────────────────────────────────────────

  private renderFleet(): void {
    const fleetEl = this.root.querySelector('.agents-fleet') as HTMLElement;
    if (!fleetEl) return;
    const w = Math.max(340, fleetEl.clientWidth || 340);
    const h = Math.max(260, fleetEl.clientHeight || 260);
    const now = Date.now();
    const total = this.statuses.length;

    const positions = new Map<string, { x: number; y: number }>();
    positions.set('main', this.bubblePosition(-1, total, w, h));
    this.statuses.forEach((a, i) => positions.set(a.id, this.bubblePosition(i, Math.max(total, 1), w, h)));

    // ── Edges (SVG) ──
    const svg = this.root.querySelector('.agents-svg') as unknown as SVGSVGElement;
    if (svg) {
      const defs = `<defs>
        <marker id="agents-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="context-stroke"/>
        </marker>
      </defs>`;
      const edgePaths = this.connections.map(c => {
        const a = positions.get(c.from);
        const b = positions.get(c.to);
        if (!a || !b) return '';
        const age = now - c.ts;
        const cls = age > 8000 ? 'is-stale' : (age < 1500 ? 'is-firing' : 'is-idle');
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / len, uy = dy / len;
        const ctrlX = midX + (-uy) * 20;
        const ctrlY = midY + ux * 20;
        return `<path class="agents-edge ${cls}" data-edge="${c.id}"
          d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}"
          stroke="${c.color}" fill="none" stroke-width="1.6"
          stroke-dasharray="6 4" marker-end="url(#agents-arrow)"/>`;
      }).join('');
      const liveRt = this.liveRoundtableSessions();
      const rtNote = liveRt.length > 0
        ? ` · 🎯 RT ${liveRt.map(s => `${s.responded}/${s.plan.panelSize}`).join(', ')}`
        : '';
      const label = `<text class="agents-svg-label" x="14" y="20">${total} agents · ${this.connections.length} recent links${rtNote}</text>`;
      svg.innerHTML = defs + label + edgePaths;
    }

    // ── Bubbles ──
    const bubblesEl = this.root.querySelector('.agents-bubbles') as HTMLElement;
    if (!bubblesEl) return;
    const m = positions.get('main')!;
    const parts: string[] = [this.bubbleHtml('main', 'Main', '🧠', 'var(--accent, #00e5ff)', 'active', m.x, m.y)];

    for (const a of this.statuses) {
      const p = positions.get(a.id)!;
      const ringDot = a.state === 'done' ? '✓' : a.state === 'error' ? '✗' : a.state === 'killed' ? '✕' : a.state === 'waiting' ? '◌' : '●';
      const badge = a.mailboxCount > 0 ? `<span class="agents-badge-mail">${a.mailboxCount}</span>` : '';
      const isExpert = a.definition.startsWith('expert-');
      const rtBadge = isExpert ? '<span class="agents-bubble-rt-badge" title="Roundtable expert">🎯</span>' : '';
      const expertCls = isExpert ? ' is-expert' : '';
      const title = `${a.label} — ${a.state}${a.mailboxCount > 0 ? ` · ${a.mailboxCount} mail` : ''}${a.error ? ` · ${a.error}` : ''}`;
      parts.push(`<div class="agents-bubble is-${a.state}${expertCls}" data-id="${a.id}" title="${this.escapeAttr(title)}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;--agent-color:${a.color}">
        <div class="agents-bubble-ring"><span class="agents-bubble-ring-dot">${ringDot}</span></div>
        <div class="agents-bubble-body">
          <span class="agents-bubble-icon">${a.icon}</span>
          <span class="agents-bubble-label">${this.escapeHtml(a.label)}</span>
        </div>
        ${badge}
        ${rtBadge}
      </div>`);
    }

    bubblesEl.innerHTML = parts.join('');
    bubblesEl.querySelectorAll<HTMLElement>('.agents-bubble').forEach(el => {
      el.addEventListener('click', () => {
        this.selectedId = el.dataset.id ?? null;
        this.renderInspector();
      });
    });
  }

  private bubbleHtml(id: string, label: string, icon: string, color: string, state: string, x: number, y: number): string {
    return `<div class="agents-bubble is-${state}" data-id="${id}" title="${this.escapeAttr(`${label} — ${state}`)}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--agent-color:${color}">
      <div class="agents-bubble-ring"><span class="agents-bubble-ring-dot">${state === 'active' ? '●' : '◆'}</span></div>
      <div class="agents-bubble-body">
        <span class="agents-bubble-icon">${icon}</span>
        <span class="agents-bubble-label">${this.escapeHtml(label)}</span>
      </div>
    </div>`;
  }


  // ── Inspector ──────────────────────────────────────────────────────────────

  private renderInspector(): void {
    const el = this.root.querySelector('.agents-inspector') as HTMLElement;
    const countEl = this.root.querySelector('.agents-side-count');
    if (countEl) countEl.textContent = `${this.statuses.length} live`;
    if (!el) return;

    if (!this.selectedId) {
      el.innerHTML = `<div class="agents-inspector-empty">Click a bubble to inspect its brief, guardrails, mailbox, and result.</div>`;
      return;
    }
    if (this.selectedId === 'main') {
      el.innerHTML = `<div class="agents-inspector-item"><b>🧠 Main session</b><p>The AiDrawer agent. Spawns, dispatches, waits, kills via agent_* tools. Always online.</p></div>`;
      return;
    }
    const st = this.statuses.find(s => s.id === this.selectedId);
    if (!st) {
      el.innerHTML = `<div class="agents-inspector-empty">Agent left the roster.</div>`;
      return;
    }

    const guardrails = st.guardrails.length
      ? `<li>${st.guardrails.map(g => this.escapeHtml(g)).join('</li><li>')}</li>`
      : '<li><i>none</i></li>';
    const age = st.startedAt ? this.fmtAge(st.startedAt) : '—';
    const isExpert = st.definition.startsWith('expert-');
    el.innerHTML = `
      <div class="agents-inspector-item">
        <div class="agents-inspector-head">
          <span class="agents-inspector-icon">${st.icon}${isExpert ? ' 🎯' : ''}</span>
          <span><b>${this.escapeHtml(st.label)}</b><br><span class="agents-inspector-id">${st.id}</span></span>
        </div>
        <div class="agents-inspector-grid">
          <span>state</span><b class="agents-state-${st.state}">${st.state}</b>
          <span>definition</span><b>${this.escapeHtml(st.definition)}${st.isCustom ? ' (custom)' : ''}</b>
          <span>permission</span><b>${st.permissionMode}</b>
          <span>steps</span><b>${st.steps}</b>
          <span>tokens</span><b>${st.tokensUsed.toLocaleString()} / ${st.contextTokens.toLocaleString()}</b>
          <span>mailbox</span><b>${st.mailboxCount}</b>
          <span>age</span><b>${age}</b>
        </div>
        ${st.definitionDescription ? `<div class="agents-inspector-section"><span class="agents-inspector-label">Definition</span><p class="agents-inspector-text">${this.escapeHtml(st.definitionDescription)}</p></div>` : ''}
        <div class="agents-inspector-section"><span class="agents-inspector-label">Brief</span><p class="agents-inspector-text">${this.escapeHtml(st.briefSummary)}</p></div>
        <div class="agents-inspector-section"><span class="agents-inspector-label">Expected result</span><p class="agents-inspector-text">${this.escapeHtml(st.expectedResult)}</p></div>
        <div class="agents-inspector-section"><span class="agents-inspector-label">Guardrails</span><ul class="agents-inspector-guard">${guardrails}</ul></div>
        ${st.resultPreview ? `<div class="agents-inspector-section"><span class="agents-inspector-label">Result</span><p class="agents-inspector-text">${this.escapeHtml(st.resultPreview)}</p></div>` : ''}
        ${st.error ? `<div class="agents-inspector-section"><span class="agents-inspector-label is-err">Error</span><p class="agents-inspector-text is-err">${this.escapeHtml(st.error)}</p></div>` : ''}
        ${st.state !== 'done' && st.state !== 'error' && st.state !== 'killed'
          ? `<div class="agents-inspector-actions"><button class="agents-inspector-kill" data-id="${st.id}">✕ Kill</button></div>`
          : ''}
      </div>
    `;
    el.querySelector<HTMLButtonElement>('.agents-inspector-kill')?.addEventListener('click', (e) => {
      const id = (e.currentTarget as HTMLButtonElement).dataset.id!;
      getAgentExecutor().kill(id as never);
      this.scheduleRefresh();
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Pull the human-readable issue line out of an expert's spawn context. */
  private rtIssueOf(plan: RoundtablePlan): string {
    const ctx = plan.experts[0]?.context ?? '';
    const m = /^## The issue under discussion\n([^\n]+)/m.exec(ctx);
    return m ? m[1].trim() : ctx.split('\n')[0] || '';
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  private escapeAttr(str: string): string {
    return this.escapeHtml(str).replace(/"/g, '&quot;');
  }

  private fmtAge(ts: number): string {
    const d = Date.now() - ts;
    const s = Math.floor(d / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h`;
  }
}
