import { getAgentExecutor } from '../agents/executor';
import { SKILLS, SKILL_NAMES } from '../agents/skills';
import { listDefinitions } from '../agents/definitions';
import { composeRoundtable, EXPERT_AREAS } from '../agents/roundtable';
import type { AgentMessage, AgentStatus } from '../agents/types';
import type { ExpertAssignment, RoundtablePlan } from '../agents/roundtable';

interface Connection {
  id: string;
  from: string;
  to: string;
  ts: number;
  color: string;
}

/** A composed roundtable session the UI is tracking (composed but maybe not yet launched). */
interface RTSession {
  plan: RoundtablePlan;
  /** definition id → running agent id (filled when the panel is launched). */
  agents: Map<string, string>;
  launchedAt: number | null;
}

/**
 * Agents canvas card — dynamic fleet UI.
 *
 * - Bubbles: main (pinned) + one per sub-agent, skill icon + label + status ring.
 *   Roundtable experts (definition id `expert-*`) get a dashed ring + 🎯 badge
 *   so the panel reads as a group on the canvas.
 * - Edges: SVG lines between bubbles when a message travels (dispatch, peer
 *   request, respond). Active edges are colored + animated dashes; idle edges
 *   decay to gray dashed ("stale") after a few seconds and re-fire on wake.
 * - Inspector: click a bubble to see brief, guardrails, mailbox, steps/tokens,
 *   result preview.
 * - Controls: spawn (skill + context + expected result), kill, purge.
 * - Roundtable: compose an expert panel (issue, panel size, seed, quorum),
 *   launch every expert in parallel, and track live quorum progress — chips
 *   show each expert's state and a progress bar fills toward the quorum.
 */
export class AgentsPlugin {
  private root: HTMLDivElement;
  private statuses: AgentStatus[] = [];
  private connections: Connection[] = [];
  private selectedId: string | null = null;
  private raf = 0;
  private destroyed = false;
  private rt: RTSession | null = null;

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
              <button class="agents-side-rt-chip" title="Roundtable session" hidden>🎯 <span class="agents-side-rt-count"></span></button>
            </span>
          </div>
          <div class="agents-inspector"></div>
          <div class="agents-spawn">
            <button class="agents-spawn-toggle" aria-expanded="false">
              <span class="agents-spawn-title">Spawn agent</span>
              <span class="agents-spawn-chevron">▸</span>
            </button>
              <div class="agents-spawn-fields">
                <select class="agents-spawn-skill">
                  <optgroup label="Built-in skills">
                    ${SKILL_NAMES.map(s => `<option value="${s}">${SKILLS[s].icon} ${SKILLS[s].label}</option>`).join('')}
                  </optgroup>
                  ${this.customOptions()}
                </select>
              <textarea class="agents-spawn-context" rows="3" placeholder="Context: files, plan, results… (keep short)"></textarea>
              <input class="agents-spawn-expected" type="text" placeholder="Expected result…">
              <input class="agents-spawn-guardrails" type="text" placeholder="Guardrails (comma-separated, optional)">
              <div class="agents-spawn-actions">
                <button class="agents-spawn-btn">▶ Spawn</button>
                <button class="agents-purge-btn" title="Purge finished agents">🧹</button>
                <button class="agents-killall-btn" title="Kill all agents">⛔</button>
              </div>
              <div class="agents-spawn-msg"></div>
            </div>
          </div>
          <div class="agents-rt">
            <button class="agents-rt-toggle" aria-expanded="false">
              <span class="agents-rt-title">🎯 Roundtable</span>
              <span class="agents-rt-chevron">▸</span>
            </button>
            <div class="agents-rt-fields">
              <textarea class="agents-rt-issue" rows="2" placeholder="Issue for the expert panel — a stubborn bug, design call, or review…"></textarea>
              <div class="agents-rt-row">
                <label class="agents-rt-field">
                  <span>Panel</span>
                  <input class="agents-rt-size" type="number" min="3" max="15" value="5">
                </label>
                <label class="agents-rt-field">
                  <span>Seed</span>
                  <input class="agents-rt-seed" type="number" placeholder="any" title="Deterministic: same seed → same panel">
                </label>
                <label class="agents-rt-field">
                  <span>Quorum</span>
                  <input class="agents-rt-quorum" type="number" min="0.5" max="1" step="0.05" value="0.6" title="Fraction of the panel that must respond">
                </label>
              </div>
              <div class="agents-rt-actions">
                <button class="agents-rt-compose-btn">⚗ Compose panel</button>
                <button class="agents-rt-clear-btn" title="Discard the composed panel" hidden>✕</button>
              </div>
              <div class="agents-rt-plan"></div>
              <div class="agents-rt-msg"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    this.bindSpawnControls();
    this.bindRoundtableControls();
  }

  private customOptions(): string {
    const customs = listDefinitions().filter(d => !SKILL_NAMES.includes(d.name as never));
    if (customs.length === 0) return '';
    return `<optgroup label="Custom agents">
      ${customs.map(d => `<option value="${d.name}">${d.icon ?? '🤖'} ${d.label ?? d.name}</option>`).join('')}
    </optgroup>`;
  }

  private bindSpawnControls(): void {
    const spawnBtn = this.root.querySelector<HTMLButtonElement>('.agents-spawn-btn');
    const purgeBtn = this.root.querySelector<HTMLButtonElement>('.agents-purge-btn');
    const killAllBtn = this.root.querySelector<HTMLButtonElement>('.agents-killall-btn');
    const toggleBtn = this.root.querySelector<HTMLButtonElement>('.agents-spawn-toggle');
    const spawnEl = this.root.querySelector<HTMLElement>('.agents-spawn');

    toggleBtn?.addEventListener('click', () => {
      const expanded = spawnEl?.classList.toggle('is-expanded') ?? false;
      toggleBtn.setAttribute('aria-expanded', String(expanded));
    });

    spawnBtn?.addEventListener('click', () => {
      const skill = (this.root.querySelector<HTMLSelectElement>('.agents-spawn-skill')?.value || 'implementer') as string;
      const context = this.root.querySelector<HTMLTextAreaElement>('.agents-spawn-context')?.value.trim() || '';
      const expected = this.root.querySelector<HTMLInputElement>('.agents-spawn-expected')?.value.trim() || '';
      const guardrailStr = this.root.querySelector<HTMLInputElement>('.agents-spawn-guardrails')?.value.trim() || '';
      const guardrails = guardrailStr ? guardrailStr.split(',').map(s => s.trim()).filter(Boolean) : undefined;

      const msgEl = this.root.querySelector<HTMLElement>('.agents-spawn-msg');
      if (!context || !expected) {
        if (msgEl) { msgEl.textContent = 'Context and expected result are required.'; msgEl.className = 'agents-spawn-msg is-error'; }
        return;
      }
      try {
        // Built-in skills spawn via skill; custom definitions spawn via agent.
        const isBuiltin = SKILL_NAMES.includes(skill as never);
        const res = isBuiltin
          ? getAgentExecutor().spawn({ skill: skill as never, context, expectedResult: expected, guardrails })
          : getAgentExecutor().spawn({ agent: skill, context, expectedResult: expected, guardrails });
        if (msgEl) { msgEl.textContent = `Spawned ${res.agentId} (${skill})`; msgEl.className = 'agents-spawn-msg is-ok'; }
        this.selectedId = res.agentId;
        this.scheduleRefresh();
      } catch (err: any) {
        if (msgEl) { msgEl.textContent = err?.message || String(err); msgEl.className = 'agents-spawn-msg is-error'; }
      }
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

  // ── Roundtable ─────────────────────────────────────────────────────────────

  private bindRoundtableControls(): void {
    const rtEl = this.root.querySelector<HTMLElement>('.agents-rt');
    const toggleBtn = this.root.querySelector<HTMLButtonElement>('.agents-rt-toggle');
    const composeBtn = this.root.querySelector<HTMLButtonElement>('.agents-rt-compose-btn');
    const clearBtn = this.root.querySelector<HTMLButtonElement>('.agents-rt-clear-btn');
    const headChip = this.root.querySelector<HTMLButtonElement>('.agents-side-rt-chip');

    const setExpanded = (open: boolean) => {
      rtEl?.classList.toggle('is-expanded', open);
      toggleBtn?.setAttribute('aria-expanded', String(open));
    };

    toggleBtn?.addEventListener('click', () => setExpanded(!rtEl?.classList.contains('is-expanded')));
    headChip?.addEventListener('click', () => setExpanded(true));

    composeBtn?.addEventListener('click', () => {
      const issue = this.root.querySelector<HTMLTextAreaElement>('.agents-rt-issue')?.value.trim() || '';
      const msgEl = this.root.querySelector<HTMLElement>('.agents-rt-msg');
      if (!issue) {
        if (msgEl) { msgEl.textContent = 'Describe the issue first.'; msgEl.className = 'agents-rt-msg is-error'; }
        return;
      }
      const size = Math.min(15, Math.max(3, Number(this.root.querySelector<HTMLInputElement>('.agents-rt-size')?.value) || 5));
      const seedRaw = this.root.querySelector<HTMLInputElement>('.agents-rt-seed')?.value.trim();
      const seed = seedRaw !== '' && seedRaw !== undefined ? Number(seedRaw) : undefined;
      const quorumRaw = this.root.querySelector<HTMLInputElement>('.agents-rt-quorum')?.value;
      const quorumRatio = quorumRaw !== '' && quorumRaw !== undefined ? Number(quorumRaw) : undefined;
      try {
        const plan = composeRoundtable(issue, { panelSize: size, seed, quorumRatio });
        this.rt = { plan, agents: new Map(), launchedAt: null };
        if (msgEl) { msgEl.textContent = ''; msgEl.className = 'agents-rt-msg'; }
        if (clearBtn) clearBtn.hidden = false;
        this.scheduleRefresh();
      } catch (err: any) {
        if (msgEl) { msgEl.textContent = err?.message || String(err); msgEl.className = 'agents-rt-msg is-error'; }
      }
    });

    clearBtn?.addEventListener('click', () => {
      this.rt = null;
      if (clearBtn) clearBtn.hidden = true;
      this.scheduleRefresh();
    });
  }

  /** Launch every expert of the composed panel in parallel (best-effort). */
  private launchRoundtable(): void {
    const session = this.rt;
    const msgEl = this.root.querySelector<HTMLElement>('.agents-rt-msg');
    if (!session || session.launchedAt !== null) return;

    const errors: string[] = [];
    for (const e of session.plan.experts) {
      try {
        const res = getAgentExecutor().spawn({
          agent: e.definition,
          context: e.context,
          expectedResult: e.expectedResult,
          guardrails: e.guardrails,
        });
        session.agents.set(e.definition, res.agentId);
      } catch (err: any) {
        errors.push(`${e.definition}: ${err?.message || String(err)}`);
      }
    }
    session.launchedAt = Date.now();
    if (msgEl) {
      if (errors.length === 0) {
        msgEl.textContent = `Launched ${session.agents.size}/${session.plan.panelSize} experts — waiting for quorum (${session.plan.quorum}).`;
        msgEl.className = 'agents-rt-msg is-ok';
      } else {
        msgEl.textContent = `Launched ${session.agents.size}/${session.plan.panelSize} · ${errors.join(' · ')}`;
        msgEl.className = 'agents-rt-msg is-error';
      }
    }
    // Auto-expand so the live tracker is visible.
    this.root.querySelector<HTMLElement>('.agents-rt')?.classList.add('is-expanded');
    this.scheduleRefresh();
  }

  private killRoundtable(): void {
    const session = this.rt;
    if (!session) return;
    for (const agentId of session.agents.values()) {
      getAgentExecutor().kill(agentId as never);
    }
    session.launchedAt = null;
    session.agents.clear();
    this.scheduleRefresh();
  }

  private copyRoundtablePlan(): void {
    const session = this.rt;
    if (!session) return;
    const text = JSON.stringify(session.plan, null, 2);
    const api = window.electronAPI?.clipboard;
    if (api) {
      void api.writeText(text);
    } else if (navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => {});
    }
    const msgEl = this.root.querySelector<HTMLElement>('.agents-rt-msg');
    if (msgEl) { msgEl.textContent = 'Plan copied to clipboard.'; msgEl.className = 'agents-rt-msg is-ok'; }
  }

  /** Map an expert assignment to its live status (null = not launched/left roster). */
  private rtStatusFor(e: ExpertAssignment): { st: AgentStatus | undefined; agentId: string | null } {
    const session = this.rt;
    if (!session) return { st: undefined, agentId: null };
    const agentId = session.agents.get(e.definition) ?? null;
    const st = agentId ? this.statuses.find(s => s.id === agentId) : undefined;
    return { st, agentId };
  }

  /** How many experts have responded (done or error both post a respond). */
  private rtResponded(): number {
    const session = this.rt;
    if (!session) return 0;
    let n = 0;
    for (const e of session.plan.experts) {
      const { st } = this.rtStatusFor(e);
      if (st && (st.state === 'done' || st.state === 'error')) n++;
    }
    return n;
  }

  private renderRoundtable(): void {
    const planEl = this.root.querySelector<HTMLElement>('.agents-rt-plan');
    const headChip = this.root.querySelector<HTMLButtonElement>('.agents-side-rt-chip');
    const headCount = this.root.querySelector<HTMLElement>('.agents-side-rt-count');
    const clearBtn = this.root.querySelector<HTMLButtonElement>('.agents-rt-clear-btn');

    const session = this.rt;
    if (!session) {
      if (planEl) planEl.innerHTML = '';
      if (headChip) headChip.hidden = true;
      if (clearBtn) clearBtn.hidden = true;
      return;
    }

    const { plan, launchedAt } = session;
    const responded = this.rtResponded();
    const live = session.agents.size;
    const launched = launchedAt !== null;

    if (headChip) headChip.hidden = false;
    if (headCount) headCount.textContent = launched ? `${responded}/${plan.panelSize}` : `${plan.panelSize}`;

    const chips = plan.experts.map(e => {
      const { st, agentId } = this.rtStatusFor(e);
      const state = st?.state ?? (agentId ? 'spawning' : 'queued');
      const dot = state === 'done' ? '✓' : state === 'error' ? '✗' : state === 'killed' ? '✕' : state === 'queued' ? '○' : '●';
      const title = agentId ? `${e.name} — ${state}${st?.error ? ` · ${st.error}` : ''}` : `${e.name} — not launched`;
      return `<button class="agents-rt-chip is-${state}" data-def="${e.definition}" title="${this.escapeAttr(title)}" ${agentId ? `data-agent="${agentId}"` : ''}>
        <span class="agents-rt-chip-dot">${dot}</span>
        <span>${e.icon} ${this.escapeHtml(e.name.replace(' Master', ''))}</span>
        ${st?.mailboxCount ? `<span class="agents-rt-chip-mail">${st.mailboxCount}</span>` : ''}
      </button>`;
    }).join('');

    const pct = Math.round((responded / plan.panelSize) * 100);
    const quorumMet = responded >= plan.quorum;
    const progress = `<div class="agents-rt-progress"><div class="agents-rt-progress-fill${quorumMet ? ' is-met' : ''}" style="width:${pct}%"></div></div>`;

    const actions = launched
      ? `<button class="agents-rt-launch-btn" disabled>● ${responded}/${plan.quorum} responded</button>
         <button class="agents-rt-killall-btn" title="Abort the panel">⛔</button>`
      : `<button class="agents-rt-launch-btn">▶ Launch all (${plan.experts.length})</button>
         <button class="agents-rt-copy-btn" title="Copy the spawn plan">⧉</button>`;

    planEl!.innerHTML = `
      <div class="agents-rt-plan-head">
        <span class="agents-rt-plan-id" title="${this.escapeAttr(plan.topic)}">${plan.sessionId}</span>
        <span class="agents-rt-plan-quorum">${quorumMet ? '🎉 quorum met' : `quorum ${plan.quorum}/${plan.panelSize}`}</span>
      </div>
      ${progress}
      <div class="agents-rt-plan-issue">${this.escapeHtml(this.rtIssueOf(plan))}</div>
      <div class="agents-rt-chips">${chips}</div>
      <div class="agents-rt-actions">${actions}</div>
    `;

    planEl?.querySelectorAll<HTMLButtonElement>('.agents-rt-chip').forEach(el => {
      el.addEventListener('click', () => {
        const agentId = el.dataset.agent;
        if (agentId) {
          this.selectedId = agentId;
          this.renderInspector();
        }
      });
    });
    planEl?.querySelector<HTMLButtonElement>('.agents-rt-launch-btn')?.addEventListener('click', () => this.launchRoundtable());
    planEl?.querySelector<HTMLButtonElement>('.agents-rt-killall-btn')?.addEventListener('click', () => this.killRoundtable());
    planEl?.querySelector<HTMLButtonElement>('.agents-rt-copy-btn')?.addEventListener('click', () => this.copyRoundtablePlan());
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
      const rtNote = this.rt ? ` · 🎯 RT ${this.rtResponded()}/${this.rt.plan.panelSize}` : '';
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
