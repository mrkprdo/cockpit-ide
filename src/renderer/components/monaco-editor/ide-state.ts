// Editor → ide-server state bridge, split out of MonacoEditorWindow so the
// window file stays under the 700-LOC cap (refactor.md §A.2 pattern: the
// facade keeps `sendEditorState()` as a one-line forwarder).

export interface EditorTab {
  filePath: string;
  name: string;
  originalPath: string;
  kind?: 'markdown';
}

/**
 * Snapshot what the ide-server needs: active file, selected text and range.
 * Markdown preview tabs carry no editor buffer, only their path.
 */
export function buildIdeEditorState(
  tabs: EditorTab[],
  activeTab: string | null,
  editor: any,
): EditorSelectionState {
  const tab = activeTab ? tabs.find(t => t.filePath === activeTab) : null;
  const filePath = tab ? tab.originalPath : null;
  if (!filePath || tab?.kind === 'markdown' || !editor) {
    return { filePath, text: null, selection: null };
  }
  const sel = editor.getSelection();
  if (!sel) return { filePath, text: null, selection: null };

  const isCollapsed =
    sel.selectionStartLineNumber === sel.positionLineNumber &&
    sel.selectionStartColumn === sel.positionColumn;
  if (isCollapsed) return { filePath, text: null, selection: null };

  const selection = {
    startLine: sel.selectionStartLineNumber,
    startColumn: sel.selectionStartColumn,
    endLine: sel.positionLineNumber,
    endColumn: sel.positionColumn,
  };
  const model = editor.getModel();
  const text = model
    ? model.getValueInRange({
      startLineNumber: sel.startLineNumber,
      startColumn: sel.startColumn,
      endLineNumber: sel.endLineNumber,
      endColumn: sel.endColumn,
    })
    : null;
  return { filePath, text, selection };
}

/** Debounced (150 ms) push of the latest snapshot over IPC. */
export class IdeStatePusher {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private snapshot: () => EditorSelectionState) {}

  push(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const api = window.electronAPI;
      if (!api?.ide) return;
      api.ide.editorState(this.snapshot());
    }, 150);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
