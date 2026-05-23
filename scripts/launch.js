const { execFile } = require('child_process');
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

if (process.platform === 'win32') {
  const argStr = args.join(' ');
  const quotedTarget = target.replace(/'/g, "''");
  const quotedArgs = argStr.replace(/'/g, "''");
  const quotedCwd = cwd.replace(/'/g, "''");
  const psCmd = `Start-Process '${quotedTarget}' -ArgumentList '${quotedArgs}' -WindowStyle Normal -WorkingDirectory '${quotedCwd}'`;
  execFile('powershell.exe', ['-NoProfile', '-Command', psCmd], () => {});
} else {
  const { spawn } = require('child_process');
  spawn(target, args, {
    detached: true,
    stdio: 'ignore',
    cwd,
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' },
  }).unref();
}
