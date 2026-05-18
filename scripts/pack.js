const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const eulaPath = path.join(root, 'build', 'license_eula.txt');

let hash = 'dev';
try {
  hash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: root }).trim().slice(0, 7);
} catch {}

const platformFlags = process.argv.slice(2).join(' ');

// Patch package.json
const origPkg = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(origPkg);
const origVersion = pkg.version;
pkg.version = `${origVersion}-${hash}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Patch EULA
const origEula = fs.readFileSync(eulaPath, 'utf8');
const patchedEula = origEula.replace(
  /Cockpit IDE - Version .*/,
  `Cockpit IDE - Version ${pkg.version}`
);
fs.writeFileSync(eulaPath, patchedEula);

console.log(`[pack] Version: ${pkg.version}`);

try {
  execSync(`npm run build && npm run generate-assets && electron-builder ${platformFlags}`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
} finally {
  fs.writeFileSync(pkgPath, origPkg);
  fs.writeFileSync(eulaPath, origEula);
  console.log('[pack] Files restored');
}
