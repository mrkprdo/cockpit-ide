// Tab bar rendering, split out of MonacoEditorWindow to keep the window under
// the 700-LOC guardrail. DOM structure and classes are unchanged — the window
// keeps a thin `renderTabs()` forwarder.

import { ContextMenu } from '../ContextMenu';
import type { EditorTab as Tab } from './ide-state';

export interface TabBarHost {
  activate(filePath: string): void;
  close(filePath: string): void;
  closeOthers(filePath: string): void;
  closeAll(): void;
  reorder(fromIndex: number, toIndex: number): void;
}

const KIND_GLYPH: Record<string, string> = {
  markdown: '◈ ',
  image: '▧ ',
  video: '▷ ',
  pdf: '▤ ',
  unsupported: '▨ ',
};

export class EditorTabBar {
  constructor(
    private container: HTMLDivElement,
    private host: TabBarHost,
  ) {}

  render(tabs: Tab[], activeTab: string | null, dirtyFiles: Set<string>): void {
    this.container.innerHTML = '';

    if (tabs.length === 0) {
      this.mountEmptyLabel();
      return;
    }

    for (const tab of tabs) {
      const isActive = tab.filePath === activeTab;
      const isDirty = dirtyFiles.has(tab.filePath);
      const kindClass = tab.kind ? ` is-media is-${tab.kind}` : '';
      const tabEl = document.createElement('div');
      tabEl.className = 'editor-tab' + (isActive ? ' is-active' : '') + (isDirty ? ' is-dirty' : '') + kindClass;
      tabEl.title = tab.filePath;
      tabEl.draggable = true;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'editor-tab-name';
      nameSpan.textContent = (tab.kind ? KIND_GLYPH[tab.kind] || '' : '') + tab.name;
      tabEl.appendChild(nameSpan);

      const closeBtn = document.createElement('span');
      closeBtn.className = 'editor-tab-close';
      closeBtn.textContent = '✕';

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.host.close(tab.filePath);
      });

      tabEl.addEventListener('click', () => this.host.activate(tab.filePath));

      // Middle-click to close
      tabEl.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
          e.preventDefault();
          this.host.close(tab.filePath);
        }
      });

      // Drag-and-drop reorder
      tabEl.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', tab.filePath);
        tabEl.classList.add('is-dragging');
      });
      tabEl.addEventListener('dragover', (e) => { e.preventDefault(); });
      tabEl.addEventListener('dragenter', (e) => {
        e.preventDefault();
        tabEl.classList.add('is-dragover');
      });
      tabEl.addEventListener('dragleave', () => {
        tabEl.classList.remove('is-dragover');
      });
      tabEl.addEventListener('drop', (e) => {
        e.preventDefault();
        tabEl.classList.remove('is-dragover');
        const draggedPath = e.dataTransfer?.getData('text/plain');
        if (!draggedPath || draggedPath === tab.filePath) return;
        const fromIdx = tabs.findIndex(t => t.filePath === draggedPath);
        const toIdx = tabs.findIndex(t => t.filePath === tab.filePath);
        if (fromIdx === -1 || toIdx === -1) return;
        this.host.reorder(fromIdx, toIdx);
      });

      // Right-click context menu
      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        new ContextMenu([
          { label: 'Close', action: () => this.host.close(tab.filePath) },
          { label: 'Close Others', action: () => this.host.closeOthers(tab.filePath) },
          { label: 'Close All', action: () => this.host.closeAll() },
          { separator: true },
          { label: 'Copy File Path', action: () => { window.electronAPI?.clipboard.writeText(tab.originalPath); } },
        ], e.clientX, e.clientY);
      });

      tabEl.appendChild(closeBtn);
      this.container.appendChild(tabEl);
    }

    // Auto-scroll active tab into view (manual scrollLeft to avoid ancestor overflow:hidden scroll)
    const activeEl = this.container.querySelector('.is-active') as HTMLElement;
    if (activeEl) {
      const tabLeft = activeEl.offsetLeft;
      const tabRight = tabLeft + activeEl.offsetWidth;
      if (tabLeft < this.container.scrollLeft) {
        this.container.scrollLeft = tabLeft;
      } else if (tabRight > this.container.scrollLeft + this.container.clientWidth) {
        this.container.scrollLeft = tabRight - this.container.clientWidth;
      }
    }
  }

  private mountEmptyLabel(): void {
    const empty = document.createElement('span');
    empty.className = 'editor-empty';
    empty.textContent = 'No file selected';
    this.container.appendChild(empty);
  }
}
