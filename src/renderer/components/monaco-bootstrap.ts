// Monaco bootstrap — the shared loader + editor-instance creation for
// MonacoEditorWindow (refactor.md §A.2: keeps the window file under the 700
// LOC cap). Bootstraps Monaco globals (CSS, loader.js, themes) exactly once.

import { theme } from '../theme';

let monacoReady: Promise<any> | null = null;

export interface MonacoEditorHooks {
  getActiveTab(): string | null;
  isDirtySuppressed(): boolean;
  onDirty(activeTab: string): void;
  onCursorSelection(): void;
  saveFile(): void;
}

export function createEditorInstance(m: any, el: HTMLElement, hooks: MonacoEditorHooks): any {
  const isLight = () => !theme.isDark;
  const editor = m.editor.create(el, {
    value: '',
    language: 'plaintext',
    theme: isLight() ? 'cockpit-light' : 'cockpit-dark',
    fontSize: 13,
    fontFamily: '"Space Mono", "Courier New", monospace',
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    tabSize: 2,
    renderWhitespace: 'selection',
    padding: { top: 8 },
  });

  editor.addAction({
    id: 'save-file',
    label: 'Save File',
    keybindings: [m.KeyMod.CtrlCmd | m.KeyCode.KeyS],
    run: () => hooks.saveFile(),
  });

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  editor.onDidChangeModelContent(() => {
    const active = hooks.getActiveTab();
    if (active && !hooks.isDirtySuppressed()) hooks.onDirty(active);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => hooks.saveFile(), 1500);
  });

  editor.onDidChangeCursorSelection(() => hooks.onCursorSelection());

  return editor;
}

export async function initMonacoEditor(el: HTMLElement, hooks: MonacoEditorHooks): Promise<any> {
  // If another instance already bootstrapped globals, just create this instance's editor.
  if ((window as any).monaco) {
    return createEditorInstance((window as any).monaco, el, hooks);
  }
  // Bootstrap once across all instances — loader.js declares top-level vars and
  // throws if injected twice.
  if (!monacoReady) {
    monacoReady = bootstrapMonaco();
  }
  const m = await monacoReady;
  if (m) return createEditorInstance(m, el, hooks);
  return null;
}

async function bootstrapMonaco(): Promise<any> {
  const vsBase = new URL('../vs', window.location.href).href.replace(/\/$/, '');

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../vs/editor/editor.main.css';
  document.head.appendChild(link);

  // Relative URL resolves to file:// worker — file:// pages can create file:// workers,
  // and Electron transparently handles ASAR paths. Inside the worker, importScripts
  // with relative paths resolves correctly relative to the worker file.
  (window as any).MonacoEnvironment = {
    getWorkerUrl: (_moduleId: string, _label: string): string => {
      return '../vs/base/worker/workerMain.js';
    },
  };

  await loadScript('../vs/loader.js');

  return new Promise<any>((resolve) => {
    const r = (window as any).require;
    r.config({
      paths: { vs: vsBase },
      'vs/nls': { availableLanguages: { '*': '' } },
    });

    r(['vs/editor/editor.main'], () => {
      const m = (window as any).monaco;
      if (!m) { resolve(m); return; }

      m.editor.defineTheme('cockpit-dark', {
        base: 'vs-dark', inherit: true, rules: [],
        colors: {
          'editor.background': '#0A0E14',
          'editor.foreground': '#C8D6E5',
          'editorCursor.foreground': '#C8D6E5',
          'editor.selectionBackground': '#2A3A4A',
          'editorLineNumber.foreground': '#546E7A',
          'editorLineNumber.activeForeground': '#78909C',
          'editorWidget.background': '#121820',
          'editorWidget.border': '#2A3A4A',
          'input.background': '#1A2430',
          'input.border': '#2A3A4A',
          'focusBorder': '#2A3A4A',
        },
      });

      m.editor.defineTheme('cockpit-light', {
        base: 'vs', inherit: true, rules: [],
        colors: {
          'editor.background': '#f8f8f8',
          'editor.foreground': '#1a1a1a',
          'editorCursor.foreground': '#1a1a1a',
          'editor.selectionBackground': '#e0e0e0',
          'editorLineNumber.foreground': '#6a6a6a',
          'editorLineNumber.activeForeground': '#2a2a2a',
          'editorWidget.background': '#eeeeee',
          'editorWidget.border': '#1a1a1a',
          'input.background': '#ffffff',
          'input.border': '#1a1a1a',
          'focusBorder': '#1a1a1a',
        },
      });

      resolve(m);
    }, (err: any) => {
      console.error('Monaco failed to load:', err);
      resolve(null);
    });
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
