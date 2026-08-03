// userData file-backed state shared by workspace + app namespaces and the
// zoom controls in main.ts (recent-workspaces.json, last-workspace.txt,
// zoom-level.txt). Pure file IO over the three store paths.

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

let lastWsFile = '';
let recentWsFile = '';
let zoomFile = '';

/** Must run once app.whenReady() has resolved (userData path is available). */
export function initWorkspaceStore(): void {
  const dir = app.getPath('userData');
  lastWsFile = path.join(dir, 'last-workspace.txt');
  recentWsFile = path.join(dir, 'recent-workspaces.json');
  zoomFile = path.join(dir, 'zoom-level.txt');
}

export function getRecentWorkspaces(): string[] {
  try { return JSON.parse(fs.readFileSync(recentWsFile, 'utf-8')); } catch { return []; }
}

export function addRecentWorkspace(p: string): void {
  const list = getRecentWorkspaces().filter(w => w !== p);
  list.unshift(p);
  if (list.length > 5) list.length = 5;
  try { fs.writeFileSync(recentWsFile, JSON.stringify(list, null, 2)); } catch {}
}

export function removeRecentWorkspace(p: string): void {
  const list = getRecentWorkspaces().filter(w => w !== p);
  try { fs.writeFileSync(recentWsFile, JSON.stringify(list, null, 2)); } catch {}
}

export function saveLastWorkspace(p: string): void {
  try { fs.writeFileSync(lastWsFile, p, 'utf-8'); } catch {}
}

export function loadLastWorkspace(): string | null {
  try { return fs.readFileSync(lastWsFile, 'utf-8').trim() || null; } catch { return null; }
}

// Renderer zoom (Ctrl +/-/0). Electron zoom level is logarithmic: factor = 1.2 ^ level.
export const ZOOM_STEP = 0.5;
export const ZOOM_MIN = -2;
export const ZOOM_MAX = 4;

export function readZoom(): number {
  try {
    const n = parseFloat(fs.readFileSync(zoomFile, 'utf-8'));
    return Number.isFinite(n) ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n)) : 0;
  } catch { return 0; }
}

export function writeZoom(level: number): void {
  try { fs.writeFileSync(zoomFile, String(level)); } catch {}
}
