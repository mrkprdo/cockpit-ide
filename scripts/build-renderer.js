const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

// Always wipe and re-copy dist/vs — avoids stale files from old Monaco versions
const vsDir = path.join(__dirname, '..', 'dist', 'vs');
const vsSrc = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs');
if (fs.existsSync(vsDir)) fs.rmSync(vsDir, { recursive: true, force: true });
fs.cpSync(vsSrc, vsDir, { recursive: true });

const isProd = process.env.NODE_ENV === 'production';

esbuild.buildSync({
  entryPoints: ['src/renderer/index.ts'],
  bundle: true,
  outfile: 'dist/renderer/index.js',
  format: 'iife',
  minify: isProd,
  sourcemap: !isProd,
  define: {
    'process.env.NODE_ENV': isProd ? '"production"' : '"development"',
  },
});
