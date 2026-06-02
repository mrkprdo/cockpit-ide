const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
let _origVersion = null;

function stamp() {
  if (_origVersion !== null) return null;
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  _origVersion = pkg.version;
  const [major, minor] = pkg.version.split('.');
  pkg.version = `${major}.${minor}.${date}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return raw;
}

function restore() {
  if (_origVersion === null) return;
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);
  pkg.version = _origVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  _origVersion = null;
}

module.exports = { stamp, restore, versionPath: pkgPath };
