import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCockpitGlobal, getToolContext, requireToolContext } from './cockpit-context';
import type { CockpitGlobal } from './types';

function makeMockCockpit(overrides: Partial<CockpitGlobal> = {}): CockpitGlobal {
  return {
    getCanvasState: vi.fn(),
    getWorkspacePath: vi.fn(),
    openFile: vi.fn(),
    addWindow: vi.fn(),
    addTerminal: vi.fn(),
    focusCard: vi.fn(),
    closeCard: vi.fn(),
    minimizeCard: vi.fn(),
    moveCard: vi.fn(),
    resizeCard: vi.fn(),
    autoArrange: vi.fn(),
    fitCardToViewport: vi.fn(),
    writeToTerminal: vi.fn(),
    sendKeyToTerminal: vi.fn(),
    insertInEditor: vi.fn(),
    readTerminal: vi.fn(),
    readEditor: vi.fn(),
    getEditorState: vi.fn(),
    getSelectionText: vi.fn(),
    setEditorContent: vi.fn(),
    goToLine: vi.fn(),
    reopenCard: vi.fn(),
    resetView: vi.fn(),
    panToCard: vi.fn(),
    setView: vi.fn(),
    setCanvasOverlay: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    openInMarkdown: vi.fn(),
    revealFile: vi.fn(),
    killTerminal: vi.fn(),
    validateSpecsMap: vi.fn(),
    reconcileSpecsMap: vi.fn(),
    reloadSpecsMap: vi.fn(),
    exploreSpecsMap: vi.fn(),
  };
}

describe('cockpit-context', () => {
  let original: CockpitGlobal | undefined;
  let originalElectron: Window['electronAPI'] | undefined;

  beforeEach(() => {
    original = (window as any).__cockpit;
    originalElectron = (window as any).electronAPI;
    delete (window as any).__cockpit;
    delete (window as any).electronAPI;
  });

  afterEach(() => {
    (window as any).__cockpit = original;
    (window as any).electronAPI = originalElectron;
    vi.restoreAllMocks();
  });

  describe('getCockpitGlobal', () => {
    it('returns null when __cockpit is missing', () => {
      expect(getCockpitGlobal()).toBeNull();
    });

    it('returns null when __cockpit is incomplete', () => {
      (window as any).__cockpit = { getWorkspacePath: vi.fn() };
      expect(getCockpitGlobal()).toBeNull();
    });

    it('returns the typed global when all required methods are present', () => {
      const mock = makeMockCockpit();
      (window as any).__cockpit = mock;
      expect(getCockpitGlobal()).toBe(mock);
    });
  });

  describe('getToolContext', () => {
    it('returns null when __cockpit is missing', () => {
      (window as any).electronAPI = {} as Window['electronAPI'];
      expect(getToolContext()).toBeNull();
    });

    it('returns null when electronAPI is missing', () => {
      (window as any).__cockpit = makeMockCockpit();
      expect(getToolContext()).toBeNull();
    });

    it('builds a context from __cockpit and electronAPI', () => {
      const cockpit = makeMockCockpit();
      const electronAPI = {} as Window['electronAPI'];
      (window as any).__cockpit = cockpit;
      (window as any).electronAPI = electronAPI;

      const ctx = getToolContext()!;
      expect(ctx.cockpit).toBe(cockpit);
      expect(ctx.electronAPI).toBe(electronAPI);
    });
  });

  describe('requireToolContext', () => {
    it('throws when the bridge is unavailable', () => {
      expect(() => requireToolContext()).toThrow('Canvas not ready');
    });

    it('returns the context when available', () => {
      const cockpit = makeMockCockpit();
      (window as any).__cockpit = cockpit;
      (window as any).electronAPI = {} as Window['electronAPI'];
      expect(requireToolContext().cockpit).toBe(cockpit);
    });
  });
});
