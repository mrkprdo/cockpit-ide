import type { CardState } from './types';

export type CardListItem = { uuid: string; title: string; isOpen: boolean };

export interface NotifyHost {
  getCards(): CardState[];
  getTerminalsChanged(): ((items: CardListItem[]) => void) | null;
  getExplorersChanged(): ((items: CardListItem[]) => void) | null;
  getGitChanged(): ((items: CardListItem[]) => void) | null;
  getSpecsmapChanged(): ((items: CardListItem[]) => void) | null;
}

export class Notifier {
  constructor(private host: NotifyHost) {}

  notifyCardChanged(title: string): void {
    if (title.startsWith('Terminal')) this.notifyTerminalsChanged();
    else if (title === 'Explorer') this.notifyExplorersChanged();
    else if (title === 'Git') this.notifyGitChanged();
    else if (title === 'SpecsMap') this.notifySpecsmapChanged();
  }

  notifyTerminalsChanged(): void {
    const list = this.host.getCards().filter(c => c.savedTitle.startsWith('Terminal'))
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.host.getTerminalsChanged()?.(list);
  }

  notifyExplorersChanged(): void {
    const list = this.host.getCards().filter(c => c.savedTitle === 'Explorer')
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.host.getExplorersChanged()?.(list);
  }

  notifyGitChanged(): void {
    const list = this.host.getCards().filter(c => c.savedTitle === 'Git')
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.host.getGitChanged()?.(list);
  }

  notifySpecsmapChanged(): void {
    const list = this.host.getCards().filter(c => c.savedTitle === 'SpecsMap')
      .map(c => ({ uuid: c.card.uuid, title: c.savedTitle, isOpen: c.isOpen }));
    this.host.getSpecsmapChanged()?.(list);
  }
}
