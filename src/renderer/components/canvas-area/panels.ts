import { ContextMenu } from '../ContextMenu';
import type { CardState } from './types';

export interface PanelsHost {
  getCards(): CardState[];
  getContextMenuOpen(): boolean;
  setContextMenuOpen(v: boolean): void;
  getTileW(): string;
  setTileW(v: string): void;
  getTileH(): string;
  setTileH(v: string): void;
  focusCard(title: string): void;
  panToCard(cs: CardState): void;
  reopenCard(cs: CardState): void;
  terminateCard(cs: CardState): void;
  autoArrange(): void;
  tilePlugins(): void;
  snapOrigin(): void;
}

export class Panels {
  private pluginListZone: HTMLButtonElement;
  private pluginListPanel: HTMLDivElement;
  private arrPanel: HTMLDivElement;

  constructor(private el: HTMLElement, private host: PanelsHost) {
    // Plugin list panel (lower-left hover zone) — keyboard accessible
    const zone = document.createElement('button');
    zone.className = 'pli-zone';
    zone.setAttribute('aria-label', 'Plugin list');
    zone.tabIndex = 0;
    this.pluginListZone = zone;
    const icon = document.createElement('span');
    icon.className = 'pli-icon';
    icon.textContent = '◣';
    icon.setAttribute('aria-hidden', 'true');
    zone.appendChild(icon);

    this.pluginListPanel = document.createElement('div');
    this.pluginListPanel.className = 'plugin-list-panel';
    this.pluginListPanel.style.display = 'none';

    zone.appendChild(this.pluginListPanel);
    this.el.appendChild(zone);

    const showPL = () => { if (!this.pluginListPanel.style.display || this.pluginListPanel.style.display === 'none') this.showPluginList(); };
    const hidePL = () => {
      setTimeout(() => {
        if (!this.host.getContextMenuOpen() && !zone.matches(':hover') && !this.pluginListPanel.matches(':hover') && document.activeElement !== zone) {
          this.pluginListPanel.style.display = 'none';
        }
      }, 200);
    };

    zone.addEventListener('mouseenter', showPL);
    zone.addEventListener('mouseleave', hidePL);
    zone.addEventListener('focus', showPL);
    zone.addEventListener('blur', hidePL);
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this.pluginListPanel.style.display !== 'none') {
          this.pluginListPanel.style.display = 'none';
        } else {
          showPL();
        }
      }
    });
    this.pluginListPanel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.pluginListPanel.addEventListener('mouseenter', () => { this.pluginListPanel.style.display = 'block'; });
    this.pluginListPanel.addEventListener('mouseleave', () => {
      if (!this.host.getContextMenuOpen() && !zone.matches(':hover') && document.activeElement !== zone) this.pluginListPanel.style.display = 'none';
    });

    // Arrange panel (lower-right hover zone) — keyboard accessible
    const arrZone = document.createElement('button');
    arrZone.className = 'prr-zone';
    arrZone.setAttribute('aria-label', 'Arrange panel');
    arrZone.tabIndex = 0;
    const arrIcon = document.createElement('span');
    arrIcon.className = 'prr-icon';
    arrIcon.textContent = '◢';
    arrIcon.setAttribute('aria-hidden', 'true');
    arrZone.appendChild(arrIcon);

    this.arrPanel = document.createElement('div');
    this.arrPanel.className = 'arr-panel';
    this.arrPanel.style.display = 'none';

    arrZone.appendChild(this.arrPanel);
    this.el.appendChild(arrZone);

    const showAP = () => { if (!this.arrPanel.style.display || this.arrPanel.style.display === 'none') this.showArrPanel(); };
    const hideAP = () => {
      setTimeout(() => {
        if (!this.arrPanel.matches(':hover') && document.activeElement !== arrZone) {
          this.arrPanel.style.display = 'none';
        }
      }, 200);
    };

    arrZone.addEventListener('mouseenter', showAP);
    arrZone.addEventListener('mouseleave', hideAP);
    arrZone.addEventListener('focus', showAP);
    arrZone.addEventListener('blur', hideAP);
    arrZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this.arrPanel.style.display !== 'none') {
          this.arrPanel.style.display = 'none';
        } else {
          showAP();
        }
      }
    });
    this.arrPanel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.arrPanel.addEventListener('mouseenter', () => { this.arrPanel.style.display = 'block'; });
    this.arrPanel.addEventListener('mouseleave', () => {
      if (!arrZone.matches(':hover') && document.activeElement !== arrZone) this.arrPanel.style.display = 'none';
    });
  }

  setDrawerOffset(left: number): void {
    if (!this.pluginListZone) return;
    this.pluginListZone.style.left = `${left + 4}px`;
  }

  showPluginList(): void {
    const panel = this.pluginListPanel;
    panel.innerHTML = '';
    if (this.host.getCards().length === 0) {
      panel.innerHTML = '<div class="pli-empty">No plugins</div>';
    } else {
      const sorted = [...this.host.getCards()].sort((a, b) => a.savedTitle.localeCompare(b.savedTitle));
      for (const cs of sorted) {
        const item = document.createElement('div');
        item.className = 'pli-item';
        item.textContent = cs.savedTitle + (cs.isOpen ? '' : ' (minimized)');
        item.addEventListener('click', () => {
          if (cs.isOpen) {
            this.host.focusCard(cs.card.opts.title);
            this.host.panToCard(cs);
          } else {
            this.host.reopenCard(cs);
          }
        });
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.host.setContextMenuOpen(true);
          const menu = new ContextMenu([
            { label: 'Show', action: () => {
              if (cs.isOpen) { this.host.focusCard(cs.card.opts.title); this.host.panToCard(cs); }
              else this.host.reopenCard(cs);
            }},
            { separator: true },
            { label: cs.savedTitle.startsWith('Terminal') ? 'Terminate' : 'Close', action: () => this.host.terminateCard(cs) },
          ], e.clientX, e.clientY);
          menu.onClose = () => { this.host.setContextMenuOpen(false); };
        });
        panel.appendChild(item);
      }
    }
    panel.style.display = 'block';
  }

  showArrPanel(): void {
    const panel = this.arrPanel;
    panel.innerHTML = '';

    const items: { label: string; action: () => void }[] = [
      { label: 'Auto Arrange', action: () => this.host.autoArrange() },
      { label: 'Tile Plugins', action: () => this.host.tilePlugins() },
      { label: 'Snap Origin', action: () => this.host.snapOrigin() },
    ];

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'arr-item';
      el.textContent = item.label;
      el.addEventListener('click', () => {
        item.action();
        panel.style.display = 'none';
      });
      panel.appendChild(el);
    }

    const row = document.createElement('div');
    row.className = 'arr-input-row';
    const validate = (v: string): string => {
      const n = parseInt(v);
      if (isNaN(n) || n < 10) return '10';
      if (n > 2000) return '2000';
      return String(n);
    };
    const inpW = document.createElement('input');
    inpW.className = 'arr-input';
    inpW.type = 'text';
    inpW.placeholder = 'W';
    inpW.value = this.host.getTileW();
    inpW.addEventListener('input', () => { this.host.setTileW(inpW.value); });
    inpW.addEventListener('change', () => { this.host.setTileW(validate(inpW.value)); inpW.value = this.host.getTileW(); });
    row.appendChild(inpW);
    const sep = document.createElement('span');
    sep.className = 'arr-input-sep';
    sep.textContent = '×';
    row.appendChild(sep);
    const inpH = document.createElement('input');
    inpH.className = 'arr-input';
    inpH.type = 'text';
    inpH.placeholder = 'H';
    inpH.value = this.host.getTileH();
    inpH.addEventListener('input', () => { this.host.setTileH(inpH.value); });
    inpH.addEventListener('change', () => { this.host.setTileH(validate(inpH.value)); inpH.value = this.host.getTileH(); });
    row.appendChild(inpH);
    panel.appendChild(row);

    panel.style.display = 'block';
  }
}
