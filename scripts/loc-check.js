// File-size + console-usage guardrails for the modularization refactor.
//
//   node scripts/loc-check.js loc        — fail if any in-scope .ts file exceeds 700 LOC
//   node scripts/loc-check.js console    — fail on console.error/console.warn added under
//                                          the folders the refactor creates
//
// Scope (per refactor.md §A.2/§F): working source only — src/main/**/*.ts and
// src/renderer/**/*.ts application logic. Tests, src/test/**, scripts/**, *.config.ts
// are exempt. The console-usage include-list grows by one entry per refactor phase.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HARD_CEILING = 700;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function isInScope(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (/\.test\.ts$/.test(rel)) return false;
  if (rel.startsWith('src/test/')) return false;
  if (rel.startsWith('src/renderer/')) return true;
  if (rel.startsWith('src/main/')) return true;
  return false;
}

function countLines(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.length === 0) return 0;
  return raw.split(/\r\n|\r|\n/).length;
}

// Console-usage guardrail scope. Grows by one entry per phase — the refactor's
// logging convention is only enforced under these paths, not repo-wide.
const CONSOLE_SCOPE = [
  'src/renderer/health',
  'src/renderer/components/dev-console',
  'src/renderer/components/git-plugin',
  'src/renderer/components/canvas-area',
  'src/renderer/components/ai-drawer',
  'src/renderer/components/specsmap',
];

function checkLoc() {
  const files = walk(path.join(ROOT, 'src')).filter(isInScope);
  const violations = [];
  for (const f of files) {
    const n = countLines(f);
    if (n > HARD_CEILING) {
      violations.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), n });
    }
  }
  violations.sort((a, b) => b.n - a.n);
  if (violations.length === 0) {
    console.log(`loc:check ok — no in-scope file exceeds ${HARD_CEILING} lines.`);
    return 0;
  }
  console.error(`loc:check FAIL — ${violations.length} file(s) over ${HARD_CEILING} lines:`);
  for (const v of violations) {
    console.error(`  ${String(v.n).padStart(5)}  ${v.file}`);
  }
  return 1;
}

function checkConsole() {
  const re = /console\.(error|warn)\s*\(/;
  const violations = [];
  for (const dir of CONSOLE_SCOPE) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of walk(abs)) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      if (/\.test\.ts$/.test(rel)) continue;
      const lines = fs.readFileSync(f, 'utf8').split(/\r\n|\r|\n/);
      lines.forEach((line, i) => {
        if (re.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  if (violations.length === 0) {
    console.log('console:check ok — no console.error/console.warn in monitored folders.');
    return 0;
  }
  console.error('console:check FAIL — console.error/console.warn found in monitored folders:');
  for (const v of violations) console.error(`  ${v}`);
  return 1;
}

const cmd = process.argv[2];
if (cmd === 'loc') process.exit(checkLoc());
if (cmd === 'console') process.exit(checkConsole());
console.error(`usage: node scripts/loc-check.js <loc|console>`);
process.exit(2);
