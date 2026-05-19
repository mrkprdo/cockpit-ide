const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkgPath = path.join(root, 'package.json');
const licensePath = path.join(root, 'installer-assets', 'license.txt');

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const releaseType = process.env.RELEASE_TYPE ? `-${process.env.RELEASE_TYPE}` : '';
const versionSuffix = `${date}${releaseType}`;

const platformFlags = process.argv.slice(2).join(' ');

// Patch package.json
const origPkg = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(origPkg);
const origVersion = pkg.version;
const baseVersion = origVersion.replace(/-[0-9a-f]{7}.*$/, '').replace(/-[\d.]+\-?\w*$/, '');
pkg.version = `${baseVersion}-${versionSuffix}`;
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
