const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--dev');
const args = process.argv.slice(2).filter(a => a !== '--dev');

let target;
let usingElectron;

const localExe = path.join(__dirname, '..', 'CockpitIDE.exe');
if (fs.existsSync(localExe)) {
  target = localExe;
  usingElectron = false;
} else {
  let electronPath;
  try { electronPath = require('electron'); }
  catch { electronPath = null; }
  if (electronPath) {
    target = electronPath;
    args.unshift('.');
    usingElectron = true;
  } else {
    console.error('Cockpit IDE not found. Build or install first.');
    process.exit(1);
  }
}

const cwd = usingElectron ? path.join(__dirname, '..') : path.dirname(target);

// Spawn the binary directly (detached) on every platform. The previous Windows
// path built a PowerShell -Command string; it escaped single quotes, but there
// is no reason for a launcher to route its argv through a shell at all.
{
  const { spawn } = require('child_process');
  spawn(target, args, {
    detached: true,
    stdio: 'ignore',
    cwd,
    windowsHide: true,
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' },
  }).unref();
}
