// SPECGEN runtime — TS/JS source-fact extraction (quality ladder step A:
// regex + path resolution; upgrade to the TS compiler API only when false
// edges measurably hurt).

import type { SourceFacts } from './types';

export const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
export const TEST_FILE_RE = /\.(test|spec)\./;

const IPC_NAMESPACES = ['fs:', 'window:', 'clipboard:', 'terminal:', 'workspace:', 'shell:', 'prefs:', 'git:', 'cmake:', 'file:', 'ide:', 'app:'];

export function extractSourceFacts(
  relativePath: string,
  content: string,
  fileSet: Set<string>,   // repo-relative paths of all files under the source roots
): SourceFacts {
  const exports = new Set<string>();
  let m: RegExpExecArray | null;

  const exportDeclRe = /export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|function\*?|const|interface|type|enum|let|var)\s+(\w+)/g;
  while ((m = exportDeclRe.exec(content)) !== null) exports.add(m[1]);

  // export { a, b as c }
  const exportListRe = /export\s+\{([^}]+)\}/g;
  while ((m = exportListRe.exec(content)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^\w+$/.test(name)) exports.add(name);
    }
  }

  const dir = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';
  const importPaths: string[] = [];
  const externalPackages = new Set<string>();
  // import … from '…', export … from '…', import('…')
  const importRe = /(?:import|export)\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = importRe.exec(content)) !== null) {
    const specifier = m[1] ?? m[2];
    if (!specifier) continue;
    if (specifier.startsWith('.')) {
      const resolved = resolveImport(dir, specifier, fileSet);
      if (resolved && !importPaths.includes(resolved)) importPaths.push(resolved);
    } else {
      const pkg = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
      if (pkg && !pkg.startsWith('node:')) externalPackages.add(pkg);
    }
  }

  const ipcChannels: string[] = [];
  const ipcRe = /['"]([a-z]+:[a-zA-Z][a-zA-Z:]*)['"]/g;
  while ((m = ipcRe.exec(content)) !== null) {
    if (IPC_NAMESPACES.some(ns => m![1].startsWith(ns)) && !ipcChannels.includes(m[1])) {
      ipcChannels.push(m[1]);
    }
  }

  const stem = relativePath.replace(SOURCE_FILE_RE, '');
  let testPath: string | undefined;
  for (const ext of ['.test.ts', '.test.tsx', '.test.js', '.test.jsx']) {
    if (fileSet.has(stem + ext)) { testPath = stem + ext; break; }
  }

  const singleton = /getInstance\(\)|export\s+const\s+\w+\s*=\s*new\s+/.test(content);

  const { type, layer } = classify(relativePath, content);

  return {
    relativePath, exports: [...exports], importPaths,
    ipcChannels, externalPackages: [...externalPackages],
    testPath, singleton, suggestedType: type, suggestedLayer: layer,
  };
}

function resolveImport(dir: string, specifier: string, fileSet: Set<string>): string | null {
  const joined = normalize(dir ? `${dir}/${specifier}` : specifier);
  for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']) {
    if (fileSet.has(joined + ext)) return joined + ext;
  }
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    if (fileSet.has(`${joined}/index${ext}`)) return `${joined}/index${ext}`;
  }
  return null;
}

function normalize(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

// Classification hints only — an existing spec's layer/type always wins (R1).
// SPECGEN-methodology heuristics, not project-specific filename lists.
function classify(relPath: string, content: string): { type: string; layer: string } {
  const path = relPath.toLowerCase();
  const hasDom = /document\.|createElement|innerHTML|querySelector|classList|addEventListener/.test(content);
  const hasIpc = /ipcMain\.|ipcRenderer\.|electronAPI/.test(content);

  let type = 'logic';
  if (path.endsWith('.d.ts')) type = 'model';
  else if (path.includes('/main/') || path.includes('/preload/')) type = 'process';
  else if (hasDom) type = 'ui';
  else if (hasIpc) type = 'data';
  else {
    const meaningful = content.split('\n').filter(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('//') && !t.startsWith('import') && !t.startsWith('*') && !t.startsWith('/*');
    });
    const typeLines = meaningful.filter(l => /^\s*(export\s+)?(interface|type)\s/.test(l));
    const funcLines = meaningful.filter(l => /^\s*(export\s+)?(function|const)\s/.test(l));
    if (meaningful.length === 0) type = 'config';
    else if (typeLines.length > meaningful.length * 0.3) type = 'model';
    else if (funcLines.length > meaningful.length * 0.4) type = 'utility';
  }

  let layer = 'plugin';
  const importsProjectCode = /(?:import|export)\s+[\w*{}\s,$]+\s+from\s+['"]\./.test(content);
  if (!importsProjectCode) layer = 'foundation';                    // SPECGEN: foundation = no internal imports
  else if (path.includes('modal')) layer = 'modal';
  else if (/overlay|palette|tutorial|drawer/.test(path)) layer = 'overlay';
  else if (path.includes('plugin')) layer = 'plugin';
  else if (type === 'utility') layer = 'utility';
  else if (type === 'ui') layer = 'widget';
  else layer = 'core';

  return { type, layer };
}
