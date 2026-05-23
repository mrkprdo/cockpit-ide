const { spawn } = require('child_process');
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
const env = { ...process.env, NODE_ENV: isDev ? 'development' : 'production' };

if (process.platform === 'win32') {
  // On Windows, use WScript.Shell.Run via a VBScript helper for true
  // detachment. This creates the process in a completely independent
  // process group — closing the parent console cannot kill it.
  const vbs = path.join(__dirname, '..', '.cockpit', `launch-${process.pid}.vbs`);
  try {
    fs.mkdirSync(path.dirname(vbs), { recursive: true });
    const quoted = `"${target.replace(/"/g, '""')}"`;
    const argStr = args.map(a => `"${a.replace(/"/g, '""')}"`).join(' ');
    const cmdLine = `${quoted} ${argStr}`;
    fs.writeFileSync(vbs,
      `Set WshShell = CreateObject("WScript.Shell")\n` +
      `WshShell.CurrentDirectory = "${cwd.replace(/\\/g, '\\\\').replace(/"/g, '""')}"\n` +
      `WshShell.Run "${cmdLine.replace(/\\/g, '\\\\').replace(/"/g, '""')}", 0, False\n`,
    );
    const child = spawn('wscript.exe', ['//NoLogo', vbs], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    // Clean up VBS after a short delay
    const timer = setTimeout(() => {
      try { fs.unlinkSync(vbs); } catch {}
    }, 1000);
    timer.unref();
  } catch (e) {
    console.error('Launch failed:', e.message);
    process.exit(1);
  }
} else {
  const child = spawn(target, args, {
    detached: true,
    stdio: 'ignore',
    cwd,
    env,
  });
  child.unref();
}
