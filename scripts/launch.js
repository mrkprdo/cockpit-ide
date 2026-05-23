const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--dev');
const args = process.argv.slice(2).filter(a => a !== '--dev');

let target;
let cwd;

const localExe = path.join(__dirname, '..', 'CockpitIDE.exe');
if (fs.existsSync(localExe)) {
  target = localExe;
  cwd = path.dirname(localExe);
} else {
  let electronPath;
  try { electronPath = require('electron'); }
  catch { electronPath = null; }
  if (electronPath) {
    target = electronPath;
    args.unshift('.');
    cwd = path.join(__dirname, '..');
  } else {
    console.error('Cockpit IDE not found. Build or install first.');
    process.exit(1);
  }
}

const child = spawn(target, args, {
  detached: true,
  stdio: 'ignore',
  cwd,
  env: {
    ...process.env,
    NODE_ENV: isDev ? 'development' : 'production',
  },
});

child.unref();
