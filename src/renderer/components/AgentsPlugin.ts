import { getAgentExecutor } from '../agents/executor';
import { SKILLS, SKILL_NAMES } from '../agents/skills';
import type { AgentMessage, AgentStatus, SkillName } from '../agents/types';

interface Connection {
  id: string;
  from: string;
  to: string;
  ts: number;
  color: string;
}

/**
 * Agents canvas card — dynamic fleet UI.
 *
 * - Bubbles: main (pinned) + one per sub-agent, skill icon + label + status ring.
 * - Edges: SVG lines between bubbles when a message travels (dispatch, peer
 *   request, respond). Active edges are colored + animated dashes; idle edges
 *   decay to gray dashed ("stale") after a few seconds and re-fire on wake.
 * - Inspector: click a bubble to see brief, guardrails, mailbox, steps/tokens,
 *   result preview.
 * - Controls: spawn (skill + context + expected result), kill, purge.
 */
export class AgentsPlugin {
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
            <span class="agents-side-count"></span>
          </div>
          <div class="agents-inspector"></div>
          <div class="agents-spawn">
            <div class="agents-spawn-title">Spawn agent</div>
            <select class="agents-spawn-skill">
              ${SKILL_NAMES.map(s => `<option value="${s}">${SKILLS[s].icon} ${SKILLS[s].label}</option>`).join('')}
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
      </div>
    `;
    this.bindSpawnControls();
  }

  private bindSpawnControls(): void {
    const spawnBtn = this.root.querySelector<HTMLButtonElement>('.agents-spawn-btn');
    const purgeBtn = this.root.querySelector<HTMLButtonElement>('.agents-purge-btn');
    const killAllBtn = this.root.querySelector<HTMLButtonElement>('.agents-killall-btn');

    spawnBtn?.addEventListener('click', () => {
      const skill = (this.root.querySelector<HTMLSelectElement>('.agents-spawn-skill')?.value || 'implementer') as SkillName;
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
        const res = getAgentExecutor().spawn({ skill, context, expectedResult: expected, guardrails });
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
      const label = `<text class="agents-svg-label" x="14" y="20">${total} agents · ${this.connections.length} recent links</text>`;
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
      const title = `${a.label} — ${a.state}${a.error ? ` · ${a.error}` : ''}`;
      parts.push(`<div class="agents-bubble is-${a.state}" data-id="${a.id}" title="${this.escapeAttr(title)}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;--agent-color:${a.color}">
        <div class="agents-bubble-ring"><span class="agents-bubble-ring-dot">${ringDot}</span></div>
        <div class="agents-bubble-body">
          <span class="agents-bubble-icon">${a.icon}</span>
          <span class="agents-bubble-label">${this.escapeHtml(a.label)}</span>
          <span class="agents-bubble-state">${a.state}${a.mailboxCount > 0 ? ` · ${a.mailboxCount} mail` : ''}</span>
        </div>
        ${badge}
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
    return `<div class="agents-bubble is-${state}" data-id="${id}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--agent-color:${color}">
      <div class="agents-bubble-ring"><span class="agents-bubble-ring-dot">${state === 'active' ? '●' : '◆'}</span></div>
      <div class="agents-bubble-body">
        <span class="agents-bubble-icon">${icon}</span>
        <span class="agents-bubble-label">${this.escapeHtml(label)}</span>
        <span class="agents-bubble-state">${state}</span>
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
    el.innerHTML = `
      <div class="agents-inspector-item">
        <div class="agents-inspector-head">
          <span class="agents-inspector-icon">${st.icon}</span>
          <span><b>${this.escapeHtml(st.label)}</b><br><span class="agents-inspector-id">${st.id}</span></span>
        </div>
        <div class="agents-inspector-grid">
          <span>state</span><b class="agents-state-${st.state}">${st.state}</b>
          <span>skill</span><b>${st.skill}</b>
          <span>steps</span><b>${st.steps}</b>
          <span>tokens</span><b>${st.tokensUsed.toLocaleString()} / ${st.contextTokens.toLocaleString()}</b>
          <span>mailbox</span><b>${st.mailboxCount}</b>
          <span>age</span><b>${age}</b>
        </div>
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
