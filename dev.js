/**
 * Dev runner — watches src/ for changes, rebuilds, and reloads/restarts Electron
 * Usage: node dev.js
 */
const { spawn, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { stamp, restore } = require('./scripts/version');

let electron = null;
let building = false;
let pendingRestart = false;
let lastBuildTime = 0;

// Sentinel file written after renderer-only rebuilds; main.ts watches it to reload
const RELOAD_SENTINEL = path.join(__dirname, 'dist', '.dev-reload');
// Persists the electron PID across dev.js restarts so orphaned instances get killed
const PID_FILE = path.join(__dirname, 'dist', '.dev-runner.pid');

function killByPid(pid) {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {}
}

function killOrphan() {
  // PID file: handles sessions started with this version of dev.js
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid) { killByPid(pid); return; }
  } catch {}

  // Fallback: kill all electron.exe (raw npm electron binary — VS Code/Slack/Discord
  // use their own named executables, so this only hits dev Electron instances)
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/f', '/im', 'electron.exe'], { stdio: 'ignore' });
  } else {
    spawnSync('pkill', ['-f', `electron.*${path.basename(__dirname)}`], { stdio: 'ignore' });
  }
}

function writePid(pid) {
  try { fs.writeFileSync(PID_FILE, String(pid)); } catch {}
}

function clearPid() {
  try { fs.unlinkSync(PID_FILE); } catch {}
}

function killElectron(proc) {
  proc.removeAllListeners('close');
  killByPid(proc.pid);
  clearPid();
}

function startElectron() {
  if (electron) {
    killElectron(electron);
    electron = null;
  }
  const electronPath = require('electron');
  // Pass __dirname twice: first as app path (consumed by Electron), second as
  // workspace arg so resolveCliWorkspace() in main.ts returns the project dir.
  const p = spawn(electronPath, [__dirname, __dirname, '--dev'], {
    detached: false,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'development' },
  });
  p.on('close', () => {
    if (electron !== p) return;
    electron = null;
    if (pendingRestart) { pendingRestart = false; startElectron(); }
  });
  electron = p;
  writePid(p.pid);
}

function signalReload() {
  try { fs.writeFileSync(RELOAD_SENTINEL, String(Date.now())); } catch {}
  console.log('[dev] Signaled renderer reload');
}

// Returns true when main or preload changed — requires a full restart
function needsRestart(dirs) {
  return dirs.has('src/main') || dirs.has('src/preload');
}

function build(changedDirs) {
  if (building) { pendingRestart = true; return; }
  building = true;
  const restart = needsRestart(changedDirs);
  console.log('\n[dev] Building...');
  try {
    execSync('tsc -p tsconfig.main.json', { stdio: 'inherit' });
    execSync('node scripts/build-renderer.js', { stdio: 'inherit' });
    execSync('copy src\\renderer\\*.html dist\\renderer\\', { stdio: 'inherit' });
    execSync('copy src\\renderer\\*.css dist\\renderer\\', { stdio: 'inherit' });
    console.log('[dev] Build complete');
  } catch (e) {
    console.error('[dev] Build failed:', e.message);
    building = false;
    return;
  }
  building = false;
  lastBuildTime = Date.now();

  if (restart || !electron) {
    console.log('[dev] Restarting Electron...');
    startElectron();
  } else {
    signalReload();
  }
}

function isGitIgnored(fullFilePath) {
  const result = spawnSync('git', ['check-ignore', '-q', fullFilePath], { stdio: 'ignore' });
  return result.status === 0;
}

// Watch source for changes
const watchDirs = ['src/main', 'src/preload', 'src/renderer', 'src/renderer/components'];
let pendingDirs = new Set();
let debounce = null;

for (const dir of watchDirs) {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) continue;
  fs.watch(fullPath, { recursive: true }, (event, filename) => {
    if (!filename || filename.endsWith('.map')) return;
    if (building) return;
    if (Date.now() - lastBuildTime < 500) return;
    if (isGitIgnored(path.join(fullPath, filename))) return;
    pendingDirs.add(dir);
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      const dirs = new Set(pendingDirs);
      pendingDirs.clear();
      build(dirs);
    }, 200);
  });
}

// Kill any Electron left over from a previous dev session before starting
killOrphan();

// Initial build — treat as main change (needs electron start)
console.log('[dev] Starting initial build...');
stamp();
build(new Set(['src/main']));

process.on('exit', () => { clearPid(); restore(); });
process.on('SIGINT', () => { if (electron) killElectron(electron); restore(); process.exit(); });
process.on('SIGTERM', () => { if (electron) killElectron(electron); restore(); process.exit(); });
