const path = require('path');
const esbuild = require('esbuild');

esbuild.buildSync({
  entryPoints: ['src/renderer/index.ts'],
  bundle: true,
  outfile: 'dist/renderer/index.js',
  format: 'iife',
});
