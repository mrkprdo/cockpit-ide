const { execSync } = require('child_process');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
let commitHash = 'dev';
try {
  commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: root }).trim();
} catch {}

esbuild.buildSync({
  entryPoints: ['src/renderer/index.ts'],
  bundle: true,
  outfile: 'dist/renderer/index.js',
  format: 'iife',
  define: { COMMIT_HASH: JSON.stringify(commitHash) },
});
