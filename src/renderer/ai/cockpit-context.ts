import type { CockpitGlobal, ToolContext } from './types';

const REQUIRED_COCKPIT_KEYS: (keyof CockpitGlobal)[] = [
  'getCanvasState',
  'getWorkspacePath',
  'openFile',
  'addPlugin',
  'addTerminal',
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
  'exploreSpecsMap',
  'validateSpecsMap',
  'reconcileSpecsMap',
  'reloadSpecsMap',
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
 *
 * This is intentionally lenient: tests and partial integrations may supply
 * only the cockpit methods a specific tool needs. Runtime failures for
 * missing methods are surfaced by the tool executor as error strings.
 */
export function getToolContext(): ToolContext | null {
  const raw = (window as any).__cockpit as Partial<CockpitGlobal> | undefined;
  const electronAPI = (window as any).electronAPI as Window['electronAPI'] | undefined;
  if (!raw || !electronAPI) return null;
  return { cockpit: raw as CockpitGlobal, electronAPI };
}

/** Throw-friendly variant used by the executor when a tool truly needs the IDE. */
export function requireToolContext(): ToolContext {
  const ctx = getToolContext();
  if (!ctx) throw new Error('Canvas not ready');
  return ctx;
}
