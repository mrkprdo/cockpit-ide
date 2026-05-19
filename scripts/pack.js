const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const licensePath = path.join(root, 'installer-assets', 'license.txt');

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

// Patch license version
const origLicense = fs.readFileSync(licensePath, 'utf8');
const patchedLicense = origLicense.replace(
  /Cockpit IDE - Version .*/,
  `Cockpit IDE - Version ${pkg.version}`
);
fs.writeFileSync(licensePath, patchedLicense);

console.log(`[pack] Version: ${pkg.version}`);

try {
  execSync(`npm run build && npm run generate-assets && electron-builder ${platformFlags}`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
} finally {
  fs.writeFileSync(pkgPath, origPkg);
  fs.writeFileSync(licensePath, origLicense);
  console.log('[pack] Files restored');
}
