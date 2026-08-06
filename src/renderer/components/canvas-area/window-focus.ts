import type { CardLifecycle } from './card-lifecycle';
import type { Notifier } from './notify';
import type { Viewport } from './viewport';

export class WindowFocus {
  constructor(
    private lifecycle: CardLifecycle,
    private notifier: Notifier,
    private viewport: Viewport,
  ) {}

  focusTerminal(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) this.lifecycle.focusCard(cs.card.opts.title);
  }

  focusExplorer(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) { this.lifecycle.focusCard(cs.card.opts.title); this.viewport.panToCard(cs); }
  }

  focusGit(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) { this.lifecycle.focusCard(cs.card.opts.title); this.viewport.panToCard(cs); }
  }

  focusSpecsmap(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && c.isOpen);
    if (cs) { this.lifecycle.focusCard(cs.card.opts.title); this.viewport.panToCard(cs); }
  }

  reopenTerminal(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && !c.isOpen);
    if (!cs) return;
    cs.isOpen = true;
    cs.card.el.style.display = '';
    cs.worldX = cs.savedWX;
    cs.worldY = cs.savedWY;
    this.lifecycle.positionCard(cs);
    this.notifier.notifyTerminalsChanged();
  }

  reopenExplorer(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) { this.lifecycle.reopenCard(cs); this.notifier.notifyExplorersChanged(); }
  }

  reopenGit(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) this.lifecycle.reopenCard(cs);
  }

  reopenSpecsmap(uuid: string): void {
    const cs = this.lifecycle.getCards().find(c => c.card.uuid === uuid && !c.isOpen);
    if (cs) this.lifecycle.reopenCard(cs);
  }

  openFileAndReveal(filePath: string): void {
    this.lifecycle.ensureExplorer().then(explorer => explorer.openFile(filePath));
  }
}
