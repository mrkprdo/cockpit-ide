const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

esbuild.buildSync({
  entryPoints: ['src/renderer/index.ts'],
  bundle: true,
  outfile: 'dist/renderer/index.js',
  format: 'iife',
  define: { COMMIT_HASH: JSON.stringify(buildDate) },
});
