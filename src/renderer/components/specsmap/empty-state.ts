// SpecsMap — empty/entry-point state (refactor.md §A.4): what the window
// shows when no *.spec.md collection is found, plus the SPECGEN generation
// prompt it can write+copy. Stateless — the host passes the DOM refs it needs.

import SPECGEN_TEMPLATE from '../../../../SPECGEN.md';
import { SPECGEN_HASH, SPECGEN_VERSION } from '../../specgen-hash';

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function detectEntrycandidates(entries: DirEntry[]): string[] {
  const dirNames = new Set(entries.filter(e => e.isDirectory).map(e => e.name));
  const fileNames = new Set(entries.filter(e => !e.isDirectory).map(e => e.name));
  const out: string[] = [];
  for (const d of ['src', 'lib', 'app', 'backend', 'frontend', 'server', 'client', 'core', 'packages', 'internal']) {
    if (dirNames.has(d)) out.push(d + '/');
  }
  for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'Makefile', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', 'setup.py', 'build.gradle', 'pom.xml', 'CMakeLists.txt']) {
    if (fileNames.has(f)) out.push(f);
  }
  return out;
}

export async function showEmptyState(emptyState: HTMLDivElement, wsPath: string): Promise<void> {
  const wsRoot = wsPath.replace(/\\/g, '/').replace(/\/?$/, '');

  // Check src/ and gather root entries in parallel
  const [srcEntries, rootEntries, specgenRaw, agentsRaw] = await Promise.all([
    window.electronAPI?.fs.readDir(wsRoot + '/src'),
    window.electronAPI?.fs.readDir(wsRoot),
    window.electronAPI?.fs.readFile(wsRoot + '/SPECGEN.md'),
    window.electronAPI?.fs.readFile(wsRoot + '/Agents.md'),
  ]);

  const hasSrc = srcEntries !== null;
  const specgenExists = !!specgenRaw;
  const agentsExists = !!agentsRaw;
  const candidates = (() => {
    const detected = detectEntrycandidates(rootEntries ?? []);
    if (hasSrc && !detected.includes('src/')) detected.unshift('src/');
    return detected;
  })();

  // Hash-verify workspace SPECGEN.md against bundled hash (seeded with version)
  type SpecgenIntegrity = 'verified' | 'modified' | 'missing';
  let specgenIntegrity: SpecgenIntegrity = 'missing';
  if (specgenRaw) {
    const wsHash = await sha256(`${SPECGEN_VERSION}:${specgenRaw}`);
    specgenIntegrity = wsHash === SPECGEN_HASH ? 'verified' : 'modified';
  }

  emptyState.innerHTML = '';
  emptyState.style.display = 'flex';

  // Icon + title
  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:32px;opacity:0.18;margin-bottom:10px;color:var(--primary)';
  icon.textContent = '⬡';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:var(--text-sm);font-weight:700;letter-spacing:1px;color:var(--primary);margin-bottom:8px';
  title.textContent = 'NO SPEC FILES';

  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:var(--text-xs);color:var(--tertiary);margin-bottom:18px;line-height:1.6;max-width:340px';
  sub.textContent = hasSrc
    ? (specgenExists ? 'SPECGEN.md found. Copy the generation prompt and paste it into Claude.' : 'Write SPECGEN.md to this workspace and copy a 3-pass generation prompt.')
    : 'src/ not found. Choose the entry point for spec generation.';

  // Entry point section (always shown, always editable)
  const entrySection = document.createElement('div');
  entrySection.style.cssText = 'width:100%;max-width:320px;margin-bottom:16px;pointer-events:auto';

  const entryLabel = document.createElement('div');
  entryLabel.style.cssText = 'font-size:var(--text-xs);font-weight:700;letter-spacing:0.8px;color:var(--tertiary);margin-bottom:8px';
  entryLabel.textContent = 'ENTRY POINT — choose or type';
  entrySection.appendChild(entryLabel);

  // Chip row for candidates
  if (candidates.length > 0) {
    const chipRow = document.createElement('div');
    chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px';
    for (const c of candidates) {
      const chip = document.createElement('button');
      chip.style.cssText =
        'background:none;border:1px solid var(--border);border-radius:var(--radius-xs);' +
        'padding:3px 10px;font-family:"Space Mono","Courier New",monospace;font-size:var(--text-xs);' +
        'color:var(--tertiary);cursor:pointer;transition:border-color 0.12s,color 0.12s';
      chip.textContent = c;
      chip.addEventListener('mouseenter', () => { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; });
      chip.addEventListener('mouseleave', () => { chip.style.borderColor = ''; chip.style.color = ''; });
      chip.addEventListener('click', () => { entryInput.value = c; entryInput.focus(); });
      chipRow.appendChild(chip);
    }
    entrySection.appendChild(chipRow);
  }

  // Entry input
  const entryInput = document.createElement('input');
  entryInput.type = 'text';
  entryInput.value = candidates[0] ?? 'src/';
  entryInput.placeholder = 'e.g. src/ or docker-compose.yml';
  entryInput.style.cssText =
    'width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);' +
    'border-radius:var(--radius-s);padding:6px 12px;font-family:"Space Mono","Courier New",monospace;' +
    'font-size:var(--text-xs);color:var(--primary);outline:none;transition:border-color 0.12s;';
  entryInput.addEventListener('focus', () => { entryInput.style.borderColor = 'var(--accent)'; });
  entryInput.addEventListener('blur', () => { entryInput.style.borderColor = ''; });
  entrySection.appendChild(entryInput);

  // Integrity badge
  const integrityBadge = document.createElement('div');
  integrityBadge.style.cssText =
    'font-size:var(--text-xs);font-weight:700;letter-spacing:0.3px;margin-bottom:16px;pointer-events:none;' +
    'display:flex;align-items:center;gap:6px';
  const badgeConfig: Record<SpecgenIntegrity, { icon: string; text: string; color: string }> = {
    verified:  { icon: '✓', text: `SPECGEN.md verified · v${SPECGEN_VERSION}`, color: 'var(--green)' },
    modified:  { icon: '⚠', text: 'SPECGEN.md modified — differs from bundled template', color: 'var(--amber)' },
    missing:   { icon: '○', text: `SPECGEN.md will be written · v${SPECGEN_VERSION}`, color: 'var(--tertiary)' },
  };
  const bc = badgeConfig[specgenIntegrity];
  integrityBadge.innerHTML =
    `<span style="color:${bc.color}">${bc.icon}</span>` +
    `<span style="color:${bc.color};opacity:0.85">${bc.text}</span>`;
  if (specgenIntegrity === 'modified') {
    integrityBadge.title =
      `Hash mismatch: workspace SPECGEN.md differs from the v${SPECGEN_VERSION} bundled template. ` +
      `The prompt may not match the expected generation format.`;
  }

  // Generate button
  const btn = document.createElement('button');
  btn.className = 'sm-empty-btn';
  btn.style.pointerEvents = 'auto';
  btn.textContent = specgenExists ? '⚡ Copy Generation Prompt' : '⚡ Setup Spec Generation';

  // Hint
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:var(--text-xs);color:var(--tertiary);margin-top:12px;opacity:0.7;max-width:340px;line-height:1.5';
  hint.textContent = agentsExists
    ? 'Agents.md detected — prompt will include update instructions.'
    : 'Paste prompt into Claude or your AI assistant.';

  btn.addEventListener('click', () =>
    generateAndCopyPrompt(btn, wsRoot, specgenExists, entryInput.value.trim() || 'src/', specgenIntegrity)
  );

  emptyState.appendChild(icon);
  emptyState.appendChild(title);
  emptyState.appendChild(sub);
  emptyState.appendChild(entrySection);
  emptyState.appendChild(integrityBadge);
  emptyState.appendChild(btn);
  emptyState.appendChild(hint);
}

export async function generateAndCopyPrompt(
  btn: HTMLButtonElement,
  wsRoot: string,
  specgenAlreadyExists: boolean,
  entryPath: string,
  integrity: 'verified' | 'modified' | 'missing',
): Promise<void> {
  btn.disabled = true;
  btn.textContent = 'Working…';

  if (!specgenAlreadyExists) {
    await window.electronAPI?.fs.writeFile(wsRoot + '/SPECGEN.md', SPECGEN_TEMPLATE);
  }

  const agentsRaw = await window.electronAPI?.fs.readFile(wsRoot + '/Agents.md') ?? null;

  const agentsSection = agentsRaw
    ? `## Step 0 — Update Agents.md\n\nAdd a "Spec System" section:\n- Spec files live in \`src/specs/\`, one per source module\n- \`src/specs/main.spec.md\` is the authoritative index\n- The SpecsMap window (Tools → SpecsMap) visualizes the dependency graph\n- When adding or changing source files, update the corresponding spec\n\n`
    : '';

  const isDir = entryPath.endsWith('/');
  const pass1 = isDir
    ? `Walk \`${entryPath}\` recursively. For every source file record:\n` +
      `- Full path from repo root\n` +
      `- Which other \`${entryPath}\` files it imports (runtime imports only, not node_modules)\n` +
      `- Its architectural layer: foundation / core / widget / modal / overlay / windows\n\n` +
      `Print the complete file list before generating any spec. Do not skip files.`
    : `Start from \`${entryPath}\`. Map every service, component, or module it defines or references.\n` +
      `Follow references to Dockerfiles, scripts, config files, and source directories.\n` +
      `Build a complete inventory: entry = \`${entryPath}\`, then all referenced files/dirs.\n\n` +
      `Print the full inventory before generating any spec. Do not skip files.`;

  const pass2 = isDir
    ? `For each source file found in Pass 1, write \`src/specs/[feature-name].spec.md\` following SPECGEN.md exactly.\n` +
      `Required fields in frontmatter: name, file, type, layer, singleton, exports. Required sections: description, Dependencies, Referenced By, IPC Channels.\n` +
      `Write a companion \`[feature-name]-ui.spec.md\` for any component with 3 or more user interactions or complex DOM.\n` +
      `Keep descriptions specific — no generic phrases like "manages state" or "handles events".`
    : `For each service/component/module in the inventory, write \`src/specs/[feature-name].spec.md\` following SPECGEN.md.\n` +
      `Adapt the layer taxonomy to fit the project type. Use "foundation" for base infrastructure, "core" for primary logic, "windows" for optional extensions.\n` +
      `Keep descriptions specific to what each component actually does.`;

  const integrityNote = integrity === 'modified'
    ? `> ⚠ SPECGEN.md integrity warning: the workspace copy differs from the v${SPECGEN_VERSION} ` +
      `bundled template (hash mismatch). Review SPECGEN.md before proceeding — it may have been ` +
      `intentionally updated or accidentally modified.\n\n`
    : '';

  const prompt =
    `# Task: Generate Spec Files\n\n` +
    integrityNote +
    `Follow the spec format defined in SPECGEN.md (now in your workspace root).\n` +
    `Entry point: \`${entryPath}\`\n\n` +
    agentsSection +
    `## Pass 1 — Codebase Discovery\n\n${pass1}\n\n` +
    `## Pass 2 — Individual Spec Files\n\n${pass2}\n\n` +
    `## Pass 3 — Index and Validation\n\n` +
    `Write \`src/specs/main.spec.md\`:\n` +
    `1. Group all specs under their layer in the \`## Features\` section (one \`### layer\` table per layer)\n` +
    `2. Each table row: \`| id | name | file | spec | ui |\` where spec = the .spec.md filename\n` +
    `3. Catalog IPC channels in an \`## IPC Channels\` section\n` +
    `4. Validate: every \`## Dependencies\` entry in each spec must match another spec's \`file:\` frontmatter field. Fix mismatches.\n\n` +
    `Start with Pass 1 now. List every file before writing any spec.\n`;

  await window.electronAPI?.clipboard.writeText(prompt);

  const label = specgenAlreadyExists ? '✓ Prompt Copied' : '✓ SPECGEN.md Written + Prompt Copied';
  btn.textContent = label;
  btn.style.borderColor = 'var(--green)';
  btn.style.color = 'var(--green)';

  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = '⚡ Copy Generation Prompt';
    btn.style.borderColor = '';
    btn.style.color = '';
  }, 3000);
}
