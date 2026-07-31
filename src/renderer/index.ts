import { App } from './components/App';

// No top-level handler existed before this — an uncaught error or rejection
// vanished silently with nothing logged and nothing shown to the user.
window.addEventListener('error', (e) => {
  window.electronAPI?.diagnostics.reportError('window.onerror', e.error?.stack || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  window.electronAPI?.diagnostics.reportError(
    'unhandledrejection',
    reason instanceof Error ? (reason.stack || reason.message) : String(reason),
  );
});

new App();

// Theme toggle
const toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
toggle?.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
});
