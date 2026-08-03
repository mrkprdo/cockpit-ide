import { App } from './components/App';
import { initHealthMonitor } from './health/monitor';
import { createLogger } from './logging/logger';

// Health monitor installs the window.onerror / unhandledrejection safety net
// (reporting via reportFailure → diagnostics:rendererError) and subscribes to
// main-process failures pushed over health:mainFailure.
initHealthMonitor();

const log = createLogger('cockpit');
log.info('renderer boot', {
  platform: navigator.platform,
  app: window.electronAPI?.versions?.app,
  electron: window.electronAPI?.versions?.electron,
});

new App();

// Theme toggle
const toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
toggle?.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
});
