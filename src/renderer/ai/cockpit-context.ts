import type { CockpitGlobal, ToolContext } from './types.ts';

const REQUIRED_COCKPIT_KEYS: (keyof CockpitGlobal)[] = [
  'getCanvasState',
  'getWorkspacePath',
  'openFile',
  'addPlugin',
  'focusCard',
  'closeCard',
  'minimizeCard',
  'moveCard',
  'resizeCard',
  'autoArrange',
  'fitCardToViewport',
  'writeToTerminal',
  'sendKeyToTerminal',
  'insertInEditor',
  'readTerminal',
  'readEditor',
  'getEditorState',
  'getSelectionText',
  'setEditorContent',
  'goToLine',
  'reopenCard',
  'resetView',
  'panToCard',
  'setView',
  'setCanvasOverlay',
  'zoomIn',
  'zoomOut',
  'openInMarkdown',
  'revealFile',
  'killTerminal',
  'refreshSpecsMap',
  'regenerateSpecs',
];

/**
 * Return a typed view of `window.__cockpit`.
 * Returns null if the object is missing or incomplete.
 */
export function getCockpitGlobal(): CockpitGlobal | null {
  const raw = (window as any).__cockpit as Partial<CockpitGlobal> | undefined;
  if (!raw) return null;
  for (const key of REQUIRED_COCKPIT_KEYS) {
    if (typeof raw[key] !== 'function') return null;
  }
  return raw as CockpitGlobal;
}

/**
 * Build a ToolContext from the current window globals.
 * Returns null if the cockpit bridge is not available.
 */
export function getToolContext(): ToolContext | null {
  const cockpit = getCockpitGlobal();
  const electronAPI = (window as any).electronAPI as Window['electronAPI'] | undefined;
  if (!cockpit || !electronAPI) return null;
  return { cockpit, electronAPI };
}

/** Throw-friendly variant used by the executor when a tool truly needs the IDE. */
export function requireToolContext(): ToolContext {
  const ctx = getToolContext();
  if (!ctx) throw new Error('Canvas not ready');
  return ctx;
}
