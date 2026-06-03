/**
 * Dev runner — watches src/ for changes, rebuilds, and restarts Electron
 * Usage: node dev.js
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stamp, restore } = require('./scripts/version');

let electron = null;
let building = false;
let pendingRestart = false;
let lastBuildTime = 0;

function startElectron() {
  if (electron) {
    try { electron.kill('SIGTERM'); } catch {}
    electron = null;
  }
  const electronPath = require('electron');
  const p = spawn(`"${electronPath}" . --dev`, {
    detached: true,
    stdio: 'ignore',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' },
  });
  p.on('close', () => {
    electron = null;
    if (pendingRestart) { pendingRestart = false; startElectron(); }
  });
  electron = p;
}

function build() {
  if (building) { pendingRestart = true; return; }
  building = true;
  console.log('\n[dev] Building...');
  try {
    execSync('tsc -p tsconfig.main.json', { stdio: 'inherit' });
    execSync('node scripts/build-renderer.js', { stdio: 'inherit' });
    execSync('copy src\\renderer\\*.html dist\\renderer\\', { stdio: 'inherit' });
    execSync('copy src\\renderer\\*.css dist\\renderer\\', { stdio: 'inherit' });
    console.log('[dev] Build complete');
  } catch (e) {
    console.error('[dev] Build failed:', e.message);
  }
  building = false;
  lastBuildTime = Date.now();
  if (electron) {
    console.log('[dev] Reloading...');
  } else {
    startElectron();
  }
}

// Watch source for changes
const watchDirs = ['src/main', 'src/preload', 'src/renderer', 'src/renderer/components'];
let debounce = null;

for (const dir of watchDirs) {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) continue;
  fs.watch(fullPath, { recursive: true }, (event, filename) => {
    if (!filename || filename.endsWith('.map')) return;
    if (building) return; // build() reads from src/ (copy commands) — skip spurious events
    if (Date.now() - lastBuildTime < 500) return; // cooldown after build for delayed fs events
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(build, 200);
  });
}

// Initial build
console.log('[dev] Starting initial build...');
stamp();
build();

process.on('exit', () => restore());
process.on('SIGINT', () => { restore(); process.exit(); });
process.on('SIGTERM', () => { restore(); process.exit(); });
