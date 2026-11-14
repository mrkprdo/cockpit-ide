// Keyboard-shortcut cheat sheet — the single source of truth for "what keys
// does this app listen to?".
//
// Before this, the only list in the product was tutorial step 13: it omitted
// Ctrl+Tab, Ctrl+Shift+F, Ctrl+O and the dev console, and described Ctrl+P as
// fuzzy-matching when it is a plain substring filter. Every entry below is
// verified against the live handlers (App.ts document keydown, monaco-bootstrap,
// and main.ts zoom controls). Keep it in sync when a binding changes.

export interface Shortcut {
  group: string;
  keys: string;
  action: string;
}

export const SHORTCUTS: Shortcut[] = [
  { group: 'Workspace', keys: 'Ctrl+O', action: 'Open workspace' },
  { group: 'Workspace', keys: 'Ctrl+Shift+N', action: 'New window' },
  { group: 'Cards', keys: 'Ctrl+Tab / Ctrl+Shift+Tab', action: 'Cycle between cards' },
  { group: 'Cards', keys: 'Ctrl+J', action: 'New terminal' },
  { group: 'Cards', keys: '`', action: 'Toggle dev console' },
  { group: 'Editor', keys: 'Ctrl+P', action: 'Go to file' },
  { group: 'Editor', keys: 'Ctrl+Shift+F', action: 'Search across files' },
  { group: 'Editor', keys: 'Ctrl+S', action: 'Save file' },
  { group: 'Editor', keys: 'Ctrl+W', action: 'Close editor tab' },
  { group: 'Agent', keys: 'Ctrl+Shift+A', action: 'Toggle Cockpit Agent' },
  { group: 'Agent', keys: 'Ctrl+Space', action: 'Toggle Cockpit Agent (not in a text field)' },
  { group: 'View', keys: 'Ctrl+ + / Ctrl+ - / Ctrl+0', action: 'Zoom the whole UI' },
  { group: 'Help', keys: '?', action: 'Show this list' },
];

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'shortcuts-styles';
  style.textContent = `
.sc-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;align-items:baseline}
.sc-group{grid-column:1/-1;margin-top:10px;font-size:var(--text-2xs);letter-spacing:var(--tracking-eyebrow,.15em);text-transform:uppercase;color:var(--tertiary)}
.sc-group:first-child{margin-top:0}
.sc-keys{justify-self:end;white-space:nowrap;font-size:var(--text-xs);color:var(--primary);background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-2xs,3px);padding:1px 6px}
.sc-action{font-size:var(--text-xs);color:var(--secondary)}
.sc-list{max-height:min(60vh,520px);overflow:auto;padding-right:4px}`;
  document.head.appendChild(style);
}

export class ShortcutsModal {
  private overlay: HTMLDivElement;
  private onCloseCb: (() => void) | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    injectStyles();

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.display = 'none';

    const dialog = document.createElement('div');
    dialog.className = 'modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'shortcuts-title');

    let rows = '';
    let group = '';
    for (const s of SHORTCUTS) {
      if (s.group !== group) {
        group = s.group;
        rows += `<div class="sc-group">${group}</div>`;
      }
      rows += `<span class="sc-keys">${escapeText(s.keys)}</span><span class="sc-action">${escapeText(s.action)}</span>`;
    }

    dialog.innerHTML = `
      <div class="modal-body">
        <div id="shortcuts-title" style="font-size:var(--text-sm);letter-spacing:var(--tracking-label,.08em);text-transform:uppercase;margin-bottom:10px">Keyboard shortcuts</div>
        <div class="sc-list"><div class="sc-grid">${rows}</div></div>
      </div>
      <div class="modal-actions">
        <button class="btn-ghost" id="shortcuts-close" type="button">Close</button>
      </div>`;

    this.overlay.appendChild(dialog);
    document.body.appendChild(this.overlay);

    dialog.querySelector('#shortcuts-close')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
  }

  open(onClose?: () => void): void {
    this.onCloseCb = onClose ?? null;
    this.overlay.style.display = 'flex';
    this.escHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    document.addEventListener('keydown', this.escHandler);
    (this.overlay.querySelector('#shortcuts-close') as HTMLButtonElement | null)?.focus();
  }

  close(): void {
    this.overlay.style.display = 'none';
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    this.onCloseCb?.();
    this.onCloseCb = null;
  }
}

/** Local escape for the static strings above (kept dependency-free). */
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
