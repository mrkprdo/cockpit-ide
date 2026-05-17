import { App } from './components/App';

new App();

// Theme toggle
const toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
toggle?.addEventListener('click', () => {
  document.documentElement.classList.toggle('light');
});
