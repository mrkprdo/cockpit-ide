// The app's single user-facing message channel.
//
// Before this existed, a failed save, a rejected stage, a dead PTY or a
// corrupted layout produced *nothing* the user could see: failures went to the
// dev console (if it was open) or nowhere at all. Every subsystem that can fail
// an operation a user asked for should say so here.
//
// Deliberately tiny: a stacked, auto-dismissing toast in the bottom-right, above
// the status bar, never blocking pointer input. No dependency on any window
// controller so it is safe to call from anywhere (including before App mounts).

export type ToastLevel = 'info' | 'warn' | 'error';

const VISIBLE_MS: Record<ToastLevel, number> = { info: 3500, warn: 6000, error: 8000 };
const MAX_VISIBLE = 4;

let host: HTMLDivElement | null = null;
let stylesInjected = false;

// Styles live here rather than in a styles-*.css file so the toast layer has no
// cascade-order or build-copy dependency — it works even if it fires before the
// stylesheets finish loading (a boot-time failure is exactly when you need it).
function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
.toast-host{position:fixed;right:12px;bottom:34px;z-index:var(--z-dropdown,1100);display:flex;flex-direction:column;gap:6px;align-items:flex-end;pointer-events:none;max-width:min(420px,60vw)}
.toast{pointer-events:auto;display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:var(--radius-s,6px);border:1px solid var(--border-strong,var(--border));background:var(--surface);color:var(--primary);font-family:var(--font);font-size:var(--text-xs);line-height:1.45;box-shadow:var(--shadow)}
.toast-warn{border-color:var(--warning,var(--amber))}
.toast-error{border-color:var(--danger,var(--red))}
.toast-text{flex:1;word-break:break-word}
.toast-close{flex:none;background:none;border:0;color:var(--tertiary);cursor:pointer;font-size:var(--text-sm);line-height:1;padding:0 2px;min-width:24px;min-height:24px}
.toast-close:hover{color:var(--primary)}
@media (prefers-reduced-motion:no-preference){.toast{animation:toast-in .15s ease-out}@keyframes toast-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}}`;
  document.head.appendChild(style);
}

function ensureHost(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (host?.isConnected) return host;
  injectStyles();
  host = document.createElement('div');
  host.className = 'toast-host';
  // Polite live region: screen readers announce new messages without stealing
  // focus from whatever the user is typing in.
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/** Show a transient message. Errors persist until dismissed by click. */
export function showToast(message: string, level: ToastLevel = 'info'): void {
  const el = ensureHost();
  if (!el || !message) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${level}`;
  toast.setAttribute('role', level === 'error' ? 'alert' : 'status');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message; // never innerHTML — messages can carry paths/filenames
  toast.appendChild(text);

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '×';
  close.addEventListener('click', () => toast.remove());
  toast.appendChild(close);

  el.appendChild(toast);
  // Drop the oldest rather than growing without bound during an error storm.
  while (el.children.length > MAX_VISIBLE) el.firstElementChild?.remove();

  const ttl = VISIBLE_MS[level];
  if (ttl > 0) window.setTimeout(() => toast.remove(), ttl);
}
