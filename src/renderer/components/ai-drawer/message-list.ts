// Incremental transcript renderer for the AI drawer (render.ts stays the
// formatting/chrome facade). llm-loop calls renderMessages() several times per
// tool call (chip pushed → result attached → next assistant turn), so a blanket
// `innerHTML = source.map(renderMessage).join('')` re-escaped and re-regexed the
// whole conversation every time. This keeps one DOM node per mounted message
// and reconciles instead:
//
//   - unchanged nodes are left alone (selection, `<details>` open state and
//     scroll position survive),
//   - a node whose only change is its text body is repainted in place,
//   - anything else is rebuilt; new messages are appended, vanished ones removed.
//
// Only the newest RENDER_WINDOW messages are mounted; older ones sit behind a
// "show earlier" control.

import type { ChatMessage } from './types';

/** How many messages are mounted at once. */
export const RENDER_WINDOW = 150;

/** A mounted message node + the cheap fingerprint used to skip re-rendering. */
interface RenderedNode {
  key: ChatMessage;
  content: string;
  toolResult: string | undefined;
  meta: string;
  el: HTMLElement;
}

export interface MessageListDeps {
  /** Live container ref — re-queried each render (the drawer can rebuild). */
  getContainer(): HTMLElement;
  getSource(): ChatMessage[];
  /** Full markup for one message at a source index. */
  renderMessage(m: ChatMessage, index: number): string;
  /** Repaint only the text region of a live node; false when it has none. */
  paintBody(el: HTMLElement, m: ChatMessage): boolean;
  /** The PoV run card above the messages ('' for the chat view). */
  headerHtml(): string;
  emptyHtml(): string;
  isExpanded(m: ChatMessage): boolean;
}

export class MessageList {
  private nodes: RenderedNode[] = [];
  private nodesBase = 0;
  private source: ChatMessage[] | null = null;
  private container: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private headerSig = '';
  private earlierEl: HTMLButtonElement | null = null;
  private emptyShown = false;
  private showAll = false;

  constructor(private deps: MessageListDeps) {}

  /** Reconcile the transcript DOM against the current source array. */
  render(): void {
    const container = this.deps.getContainer();
    const source = this.deps.getSource();
    if (container !== this.container || source !== this.source) {
      // View/session switch (or a rebuilt skeleton) — cached nodes are stale.
      this.reset(container, source);
    }

    if (source.length === 0) {
      if (!this.emptyShown) {
        this.headerSig = this.deps.headerHtml();
        container.innerHTML = this.headerSig + this.deps.emptyHtml();
        this.emptyShown = true;
      }
      return;
    }
    if (this.emptyShown) this.reset(container, source);

    this.reconcile(container, source);
    this.syncEarlier(container);
    this.syncHeader(container);

    // Mark only the last message for the entrance animation.
    const last = container.lastElementChild as HTMLElement | null;
    if (last) last.classList.add('is-new');
  }

  /** "Show earlier" click: mount the whole transcript, once, on request. */
  showEarlier(): void {
    this.reset(this.deps.getContainer(), this.deps.getSource(), true);
    this.render();
  }

  /** Count of messages hidden above the mounted window (for tests/debugging). */
  hiddenCount(): number {
    return this.nodesBase;
  }

  /**
   * Keep the fingerprint in step after an in-place streaming repaint, so the
   * next full render only repaints this node instead of rebuilding it.
   */
  noteContent(m: ChatMessage): void {
    const node = this.nodes.find(n => n.key === m);
    if (node) node.content = m.content;
  }

  private reset(container: HTMLElement, source: ChatMessage[], showAll = false): void {
    container.innerHTML = '';
    this.nodes = [];
    this.source = source;
    this.container = container;
    this.nodesBase = showAll ? 0 : Math.max(0, source.length - RENDER_WINDOW);
    this.headerEl = null;
    this.headerSig = '';
    this.earlierEl = null;
    this.emptyShown = false;
    this.showAll = showAll;
  }

  private syncEarlier(container: HTMLElement): void {
    if (this.nodesBase === 0) {
      this.earlierEl?.remove();
      this.earlierEl = null;
      return;
    }
    const label = `Show ${this.nodesBase} earlier message${this.nodesBase === 1 ? '' : 's'}`;
    if (this.earlierEl) { this.earlierEl.textContent = label; return; }
    const btn = document.createElement('button');
    btn.className = 'ai-msg-earlier';
    btn.textContent = label;
    // Inline design tokens instead of a new styles-*.css file: one-off control.
    btn.style.cssText = 'display:block;width:100%;margin:4px 0 8px;padding:6px;background:transparent;'
      + 'border:1px dashed var(--border);border-radius:8px;color:var(--secondary);font:inherit;cursor:pointer';
    container.insertBefore(btn, container.firstChild);
    this.earlierEl = btn;
  }

  /** Keep the PoV run card in sync without touching the message nodes. */
  private syncHeader(container: HTMLElement): void {
    const html = this.deps.headerHtml();
    if (html === this.headerSig) return;
    this.headerSig = html;
    this.headerEl?.remove();
    this.headerEl = null;
    if (!html) return;
    const el = this.nodeFromHtml(html);
    container.insertBefore(el, this.earlierEl ? this.earlierEl.nextSibling : container.firstChild);
    this.headerEl = el;
  }

  private reconcile(container: HTMLElement, source: ChatMessage[]): void {
    let i = 0;
    while (i < this.nodes.length) {
      const m = source[this.nodesBase + i];
      if (!m || !this.refreshNode(this.nodes[i], m)) break;
      i++;
    }
    for (let j = i; j < this.nodes.length; j++) this.nodes[j].el.remove();
    this.nodes.length = i;

    for (let idx = this.nodesBase + i; idx < source.length; idx++) {
      const m = source[idx];
      const el = this.nodeFromHtml(this.deps.renderMessage(m, idx));
      container.appendChild(el);
      this.nodes.push({ key: m, content: m.content, toolResult: m.toolResult, meta: this.meta(m), el });
    }

    // Drop the oldest mounted messages once the window is over its cap —
    // after the append, so a single new message evicts exactly one.
    const maxVisible = this.showAll ? Infinity : RENDER_WINDOW;
    while (this.nodes.length > maxVisible) {
      this.nodes.shift()!.el.remove();
      this.nodesBase++;
    }
  }

  /** True when the node still matches; repaints a text-only change in place. */
  private refreshNode(node: RenderedNode, m: ChatMessage): boolean {
    if (node.key !== m || node.toolResult !== m.toolResult || node.meta !== this.meta(m)) return false;
    if (node.content !== m.content) {
      if (!this.deps.paintBody(node.el, m)) return false;
      node.content = m.content;
    }
    return true;
  }

  /**
   * Everything that affects a message's markup EXCEPT its text body (compared
   * separately). Small on purpose: 150 of these per render is a few KB.
   */
  private meta(m: ChatMessage): string {
    return [
      m.role, m.timestamp, m.toolName ?? '', m.toolCallId ?? '', m.toolCalls?.length ?? 0,
      m.isSteer ? 1 : 0, m.intent ?? '', m.replyTo ?? '', m.toName ?? '',
      m.speaker ? `${m.speaker.id}|${m.speaker.name}|${m.speaker.icon}|${m.speaker.color}` : '',
      this.deps.isExpanded(m) ? 1 : 0,
    ].join('|');
  }

  private nodeFromHtml(html: string): HTMLElement {
    const tpl = document.createElement('div');
    tpl.innerHTML = html;
    return tpl.firstElementChild as HTMLElement;
  }
}
