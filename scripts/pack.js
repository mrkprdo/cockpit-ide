const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');

const d = new Date();
const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

const origPkg = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(origPkg);
const [major, minor] = pkg.version.split('.');
pkg.version = `${major}.${minor}.${date}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`[pack] Version: ${pkg.version}`);

function restore() {
  fs.writeFileSync(pkgPath, origPkg);
  console.log('[pack] package.json restored');
}

function findMakensis() {
  try { execSync('makensis /VERSION', { stdio: 'ignore', shell: true }); return 'makensis'; } catch {}
  const def = 'C:\\Program Files (x86)\\NSIS\\makensis.exe';
  if (fs.existsSync(def)) return `"${def}"`;
  return null;
}

function ensureMakensis() {
  let bin = findMakensis();
  if (bin) return bin;
  console.log('[pack] NSIS not found — installing via winget...');
  execSync(
    'winget install NSIS.NSIS --silent --accept-package-agreements --accept-source-agreements',
    { stdio: 'inherit', shell: true }
  );
  bin = findMakensis();
  if (!bin) throw new Error('NSIS install failed. Install manually from https://nsis.sourceforge.io/');
  return bin;
}

async function main() {
  execSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });

  const { packager } = require('@electron/packager');
  const appPaths = await packager({
    dir: root,
    name: 'CockpitIDE',
    platform: 'win32',
    arch: 'x64',
    out: path.join(root, 'out'),
    overwrite: true,
    icon: path.join(root, 'public', 'cockpit_ide_icon.ico'),
    extraResource: [path.join(root, 'public', 'cockpit_ide_icon.ico')],
    asar: {
      unpack: '**/node_modules/node-pty/**',
    },
    ignore: [
      /^\/src\b/,
      /^\/scripts\b/,
      /^\/\.github\b/,
      /^\/release\b/,
      /^\/out\b/,
      /^\/\.git\b/,
      /^\/tsconfig/,
      /^\/Makefile$/,
      /^\/vitest\.config/,
      /^\/dev\.js/,
      /^\/node_modules\/node-pty\/prebuilds\/win32-arm64\b/,
      /\.pdb$/,
    ],
    appCopyright: `Copyright © ${d.getFullYear()} Cockpit IDE`,
    win32metadata: {
      CompanyName: 'Cockpit IDE',
      FileDescription: 'The IDE for developers who thinks spatially',
      OriginalFilename: 'CockpitIDE.exe',
      ProductName: 'Cockpit IDE',
    },
    executableName: 'CockpitIDE',
  });

  const srcDir = appPaths[0];

  // Strip bloat from Electron distribution
  const localesDir = path.join(srcDir, 'locales');
  if (fs.existsSync(localesDir)) {
    for (const f of fs.readdirSync(localesDir)) {
      if (f !== 'en-US.pak') fs.rmSync(path.join(localesDir, f));
    }
    console.log('[pack] Stripped non-en-US locales');
  }
const outDir = path.join(root, 'out');
  const nsiScript = path.join(root, 'scripts', 'installer.nsi');
  const iconPath = path.join(root, 'public', 'cockpit_ide_icon.ico');

  console.log(`[pack] Packaged to: ${srcDir}`);
  console.log('[pack] Building installer...');

  const makensis = ensureMakensis();
  execSync(
    `${makensis} /DVERSION="${pkg.version}" /DOUTDIR="${outDir}" /DSRCDIR="${srcDir}" /DICONPATH="${iconPath}" "${nsiScript}"`,
    { cwd: root, stdio: 'inherit', shell: true }
  );

  console.log(`[pack] Done: out/CockpitIDESetup-${pkg.version}.exe`);
}

main().then(() => restore()).catch((err) => {
  restore();
  console.error('[pack] Error:', err.message || err);
  process.exit(1);
});
