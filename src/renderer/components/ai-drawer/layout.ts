// Drawer layout — attach/detach (docked ↔ floating input card), open/close,
// width resize, float positioning, and the canvas pan/overlay offset the open
// drawer occupies. Owns detached state, the float-preview DOM, and the drawer
// chrome refs it moves around.

import { formatBody } from './render';
import type { AiDrawerDom, ChatMessage, FloatPreviewState } from './types';

export interface DrawerLayoutDeps {
  dom: AiDrawerDom;
  getMessages(): ChatMessage[];
  getIsLoading(): boolean;
  onDetachChange(detached: boolean): void;
}

export class DrawerLayout {
  isDetached = false;
  drawerWidth = 420;
  isMaximized = false;
  /** Matches CSS `--ai-shell-inset` (now 0 — drawer is edge-to-edge). */
  private readonly shellInset = 0;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private isDragging = false;
  private floatEl: HTMLDivElement | null = null;
  private floatPreviewEl: HTMLDivElement | null = null;
  private dockBtnEl: HTMLButtonElement | null = null;
  private floatResizeHandler: (() => void) | null = null;

  constructor(private deps: DrawerLayoutDeps) {}

  ensureDrawerOpen(): void {
    if (!this.deps.dom.el.classList.contains('is-open')) {
      this.open();
    }
  }

  detach(): void {
    if (this.isDetached) return;
    // Floating mode reuses the panel resize width: restore before undocking.
    if (this.isMaximized) this.restore();
    this.isDetached = true;
    const dom = this.deps.dom;

    this.floatEl = document.createElement('div');
    this.floatEl.className = 'ai-float-input';

    // Inject dock button into input toolbar (takes detach button's slot)
    this.dockBtnEl = document.createElement('button');
    this.dockBtnEl.className = 'ai-float-dock-btn';
    this.dockBtnEl.setAttribute('title', 'Dock back to panel');
    this.dockBtnEl.innerHTML = '&#x2935;';
    this.dockBtnEl.addEventListener('click', () => this.attach());
    dom.inputAreaEl.querySelector('.ai-input-toolbar-left')!.appendChild(this.dockBtnEl);

    // Move step controls and input area into float (header stays docked)
    this.floatEl.appendChild(dom.stepControlsEl);
    this.floatPreviewEl = document.createElement('div');
    this.floatPreviewEl.className = 'ai-float-preview';
    this.floatPreviewEl.style.display = 'none';
    // The preview scrolls; without this, a wheel over the float also zooms the
    // canvas (Ctrl+wheel is handled document-wide in CanvasArea).
    this.floatPreviewEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    // Delegated so the close button survives innerHTML rewrites
    this.floatPreviewEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.ai-float-preview-close')) {
        this.updateFloatPreview('hidden');
        return;
      }
      const codeBtn = target.closest<HTMLButtonElement>('.ai-chat-code-copy');
      if (codeBtn) {
        const pre = codeBtn.closest('.ai-chat-code-wrap')?.querySelector<HTMLElement>('pre');
        if (pre) window.electronAPI?.clipboard.writeText(pre.textContent ?? '').catch(() => {});
      }
    });
    this.floatEl.appendChild(this.floatPreviewEl);
    this.floatEl.appendChild(dom.inputAreaEl);

    dom.detachBtn.style.display = 'none';
    dom.wrapper.appendChild(this.floatEl);
    this.updateFloatPosition();
    this.floatResizeHandler = () => this.updateFloatPosition();
    window.addEventListener('resize', this.floatResizeHandler);
    dom.inputEl.focus();
    this.deps.onDetachChange(true);
  }

  attach(): void {
    if (!this.isDetached || !this.floatEl) return;
    this.isDetached = false;
    const dom = this.deps.dom;

    if (this.floatResizeHandler) {
      window.removeEventListener('resize', this.floatResizeHandler);
      this.floatResizeHandler = null;
    }

    // Remove injected dock button
    this.dockBtnEl?.remove();
    this.dockBtnEl = null;

    this.floatPreviewEl?.remove();
    this.floatPreviewEl = null;
    // Restore drawer order: step controls before queue bar, input last
    dom.drawerContentEl.insertBefore(dom.stepControlsEl, dom.queueBarEl);
    dom.drawerContentEl.appendChild(dom.inputAreaEl);

    dom.detachBtn.style.display = '';
    this.floatEl.remove();
    this.floatEl = null;
    this.deps.onDetachChange(false);
  }

  /** 24px of slack before we consider the reader "at the bottom". */
  private static readonly PIN_SLACK = 24;
  /** True while the preview follows the stream; false once the user scrolls up. */
  private floatPreviewPinned = true;

  updateFloatPreview(state: FloatPreviewState, text?: string): void {
    const el = this.floatPreviewEl;
    if (!el) return;
    if (state === 'hidden') {
      el.style.display = 'none';
      el.className = 'ai-float-preview';
      el.textContent = '';
      this.floatPreviewPinned = true;
      return;
    }
    el.style.display = '';

    if (state === 'loading') {
      el.className = 'ai-float-preview is-loading';
      el.innerHTML = '<span class="ai-chat-loading-dot"></span><span class="ai-chat-loading-dot"></span><span class="ai-chat-loading-dot"></span>';
      this.floatPreviewPinned = true;
      return;
    }

    // Keep the body node STABLE across chunks. Rebuilding innerHTML replaced the
    // scroll container, which reset scrollTop to 0 on every token: the preview
    // never followed the stream AND any manual scroll was undone immediately.
    let body = el.querySelector<HTMLElement>('.ai-float-preview-body');
    if (!body) {
      el.className = state === 'stream' ? 'ai-float-preview is-stream' : 'ai-float-preview is-done';
      el.innerHTML =
        '<button class="ai-float-preview-close" aria-label="Clear response" title="Clear response">&#215;</button>' +
        '<div class="ai-float-preview-body"></div>';
      body = el.querySelector<HTMLElement>('.ai-float-preview-body')!;
      // A brand-new response always starts pinned to the bottom.
      this.floatPreviewPinned = true;
      body.addEventListener('scroll', () => {
        const distance = body!.scrollHeight - body!.scrollTop - body!.clientHeight;
        this.floatPreviewPinned = distance <= DrawerLayout.PIN_SLACK;
      }, { passive: true });
    } else {
      const cls = state === 'stream' ? 'ai-float-preview is-stream' : 'ai-float-preview is-done';
      if (el.className !== cls) el.className = cls;
    }

    const previousTop = body.scrollTop;
    body.innerHTML = formatBody(text || '');
    if (this.floatPreviewPinned) body.scrollTop = body.scrollHeight;
    else body.scrollTop = previousTop;   // keep the reader's place while text grows
  }

  /** Keep detached float card in sync with the active session transcript. */
  syncFloatPreviewToMessages(): void {
    if (!this.isDetached || this.deps.getIsLoading()) return;
    const last = [...this.deps.getMessages()].reverse().find(m => m.role === 'assistant');
    const text = last?.content ?? '';
    this.updateFloatPreview(text.length > 0 ? 'done' : 'hidden', text);
  }

  updateFloatPosition(): void {
    if (!this.floatEl) return;
    const overlayLeft = this.deps.dom.el.classList.contains('is-open')
      ? this.isMaximized ? window.innerWidth : this.occupiedLeft(this.drawerWidth)
      : 0;
    const centerX = (window.innerWidth + overlayLeft) / 2;
    this.floatEl.style.left = `${Math.round(centerX)}px`;
  }

  /** Left edge extent occupied by the inset glass card (+ trailing gap). */
  occupiedLeft(w = this.drawerWidth): number {
    return w > 0 ? this.shellInset + w + this.shellInset : 0;
  }

  shiftCanvasPan(delta: number): void {
    const cockpit = (window as any).__cockpit;
    if (!cockpit) return;
    const state = cockpit.getCanvasState();
    cockpit.setView(state.panX + delta, state.panY, state.zoom);
  }

  setCanvasOverlay(left: number): void {
    (window as any).__cockpit?.setCanvasOverlay(left);
  }

  /** Expand the open drawer to the full window width. */
  maximize(): void {
    if (this.isMaximized) return;
    this.isMaximized = true;
    this.deps.dom.el.classList.add('is-maximized');
    this.setBackTitle('Back to panel');
    this.applyWidth(window.innerWidth);
  }

  /** Return the drawer to its resized panel width. */
  restore(): void {
    if (!this.isMaximized) return;
    this.isMaximized = false;
    this.deps.dom.el.classList.remove('is-maximized');
    this.setBackTitle('Close panel');
    this.applyWidth(this.drawerWidth);
  }

  toggleMaximize(): void {
    // Floating: pull the input card back into the panel before expanding.
    if (this.isDetached) this.attach();
    this.ensureDrawerOpen();
    if (this.isMaximized) this.restore();
    else this.maximize();
  }

  /** << control: a maximized drawer returns to the panel; otherwise the panel closes. */
  back(): void {
    if (this.isMaximized) this.restore();
    else this.close();
  }

  /** Reflect the << control's meaning in its accessible label. */
  private setBackTitle(action: 'Close panel' | 'Back to panel'): void {
    const btn = this.deps.dom.backBtn;
    if (btn) {
      btn.setAttribute('aria-label', action);
      btn.setAttribute('title', action);
    }
  }

  /** Set drawer width and re-sync the canvas overlay + float position. */
  private applyWidth(w: number): void {
    this.setOpenWidth(w);
    this.setCanvasOverlay(this.occupiedLeft(w));
    this.updateFloatPosition();
  }

  open(): void {
    const occ = this.occupiedLeft(this.drawerWidth);
    this.shiftCanvasPan(occ);
    this.setCanvasOverlay(occ);
    this.setOpenWidth(this.drawerWidth);
    this.deps.dom.el.classList.add('is-open');
    this.deps.dom.notch.classList.add('is-open');
    // The drawer exists to be typed into: focus the composer so Ctrl+Shift+A
    // then typing works without an extra click.
    requestAnimationFrame(() => {
      try { this.deps.dom.inputEl.focus(); } catch { /* detached/tearing down */ }
    });
    if (this.isDetached) this.updateFloatPosition();
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.escHandler);
  }

  /**
   * Ghost the FLOATING input card so the card the agent just focused is readable.
   *
   * Only the detached float is ghosted — the docked left panel is meant to stay
   * put, and it is not covering the canvas the same way. Called by every cockpit
   * action allowed to move the camera (App.ts).
   */
  peek(): void {
    if (!this.isDetached || !this.floatEl) return;
    this.floatEl.classList.add('is-peeking');
  }

  /** Restore the float: user focus (CSS), a streamed token, or the run ending. */
  unpeek(): void {
    this.floatEl?.classList.remove('is-peeking');
  }

  close(): void {
    const occ = this.occupiedLeft(this.drawerWidth);
    this.shiftCanvasPan(-occ);
    this.setCanvasOverlay(0);
    if (this.isMaximized) {
      this.isMaximized = false;
      this.deps.dom.el.classList.remove('is-maximized');
    }
    this.setBackTitle('Close panel');
    this.deps.dom.el.style.width = '0';
    this.deps.dom.el.classList.remove('is-open');
    this.updateFloatPosition();
    this.deps.dom.notch.style.left = '0';
    this.deps.dom.notch.classList.remove('is-open');
    this.deps.dom.settingsEl?.classList.remove('is-visible');
    this.deps.dom.sessionsPanelEl?.classList.remove('is-visible');
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
  }

  private setOpenWidth(w: number): void {
    this.deps.dom.el.style.width = w + 'px';
    const edge = w > 0 ? this.shellInset + w : 0;
    this.deps.dom.resizeHandle.style.left = edge + 'px';
    // Edge chip only used when closed; keep it parked at left origin.
    this.deps.dom.notch.style.left = '0';
  }

  bindResize(): void {
    let startX = 0;
    let startW = 420;
    const dom = this.deps.dom;

    dom.resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.isDragging = true;
      startX = e.clientX;
      startW = dom.el.offsetWidth || this.drawerWidth;
      // Dragging a maximized drawer restores the panel mode first.
      if (this.isMaximized) this.restore();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const delta = e.clientX - startX;
      const w = Math.max(280, Math.min(800, startW + delta));
      this.drawerWidth = w;
      this.setOpenWidth(w);
      this.setCanvasOverlay(this.occupiedLeft(w));
      this.updateFloatPosition();
    });

    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }
}
