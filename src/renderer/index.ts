import { App } from './components/App';
import { initHealthMonitor } from './health/monitor';

// Health monitor installs the window.onerror / unhandledrejection safety net
// (reporting via reportFailure → diagnostics:rendererError) and subscribes to
// main-process failures pushed over health:mainFailure.
initHealthMonitor();

new App();

// Theme toggle
const toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
toggle?.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
});
