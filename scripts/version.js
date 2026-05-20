const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
let _original = null;

function stamp() {
  if (_original !== null) return _original;
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  _original = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(_original);
  const [major, minor] = pkg.version.split('.');
  pkg.version = `${major}.${minor}.${date}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  return _original;
}

function restore() {
  if (_original === null) return;
  fs.writeFileSync(pkgPath, _original);
  _original = null;
}

module.exports = { stamp, restore, versionPath: pkgPath };
