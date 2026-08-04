import type { Viewport } from './viewport';
import type { CardLifecycle } from './card-lifecycle';
import type { Notifier } from './notify';
import { MonacoEditorWindow } from '../MonacoEditorWindow';
import { TerminalWindow } from '../TerminalWindow';
import { ExplorerWindow } from '../ExplorerWindow';
import { GitWindow } from '../GitWindow';
import { SpecsMapWindow } from '../SpecsMapWindow';
import { AgentsWindow } from '../AgentsWindow';
import { DevConsoleWindow } from '../dev-console/DevConsoleWindow';
import { createLogger } from '../../logging/logger';

const log = createLogger('canvas');

export interface WindowFactoriesHost {
  getWsPath(): string;
  setWsPath(v: string): void;
  getOnStateChange(): (() => void) | null;
}

export class WindowFactories {
  private activeEditor: MonacoEditorWindow | null = null;
  private explorerCounter = 0;

  constructor(
    private lifecycle: CardLifecycle,
    private viewport: Viewport,
    private notifier: Notifier,
    private host: WindowFactoriesHost,
  ) {}

  addEditor(): void {
    const cs = this.lifecycle.addCard('EDITOR', '', -250, -210, 500, 420);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body');
      if (body) {
        (body as HTMLElement).style.padding = '0';
        this.activeEditor = new MonacoEditorWindow(body as HTMLElement);
      }
      this.lifecycle.bringToFront(cs.card);
      this.viewport.panToCard(cs);
    });
  }

  addExplorer(wsPath: string): void {
    this.host.setWsPath(wsPath);
    const existing = this.lifecycle.getCards().find(c => c.savedTitle === 'Explorer');
    if (existing) {
      existing.isOpen = true;
      existing.card.el.style.display = '';
      existing.worldX = existing.savedWX;
      existing.worldY = existing.savedWY;
      this.lifecycle.positionCard(existing);
      const body = existing.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new ExplorerWindow(body, wsPath);
        dev.onStateChange = () => this.host.getOnStateChange()?.();
        existing.explorerWindow = dev;
      }
      this.lifecycle.bringToFront(existing.card);
      this.viewport.panToCard(existing);
      this.notifier.notifyExplorersChanged();
      return;
    }
    const cs = this.lifecycle.addCard('Explorer', '', -400, -250, 800, 500);
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body && !cs.explorerWindow && !body.hasChildNodes()) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dev = new ExplorerWindow(body, wsPath);
        dev.onStateChange = () => this.host.getOnStateChange()?.();
        cs.explorerWindow = dev;
        this.notifier.notifyExplorersChanged();
        this.lifecycle.bringToFront(cs.card);
        this.viewport.panToCard(cs);
      }
    });
  }

  addGit(wsPath: string): void {
    // Only one Git window instance allowed
    const existing = this.lifecycle.getCards().find(c => c.savedTitle === 'Git');
    if (existing) {
      existing.isOpen = true;
      existing.card.el.style.display = '';
      existing.worldX = existing.savedWX;
      existing.worldY = existing.savedWY;
      this.lifecycle.positionCard(existing);
      this.lifecycle.bringToFront(existing.card);
      this.viewport.panToCard(existing);
      this.notifier.notifyGitChanged();
      return;
    }
    this.lifecycle.setGitCounter(1);
    const cs = this.lifecycle.addCard('Git', '', -400, -250, 800, 500);
    log.info('add git card');
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const git = new GitWindow(body, wsPath);
        git.onStateChange = () => this.host.getOnStateChange()?.();
        git.onFileOpen = (filePath) => this.lifecycle.getActiveExplorerWindow()?.openFile(filePath);
        cs.gitWindow = git;
        cs.card.onDestroy = () => git.destroy();
        this.notifier.notifyGitChanged();
        this.lifecycle.bringToFront(cs.card);
        this.viewport.panToCard(cs);
      }
    });
  }

  addMarkdown(): void {
    // Markdown is integrated into Explorer — ensure and open explorer
    this.lifecycle.ensureExplorer();
  }

  addSpecsmap(wsPath: string): void {
    const existing = this.lifecycle.getCards().find(c => c.savedTitle === 'SpecsMap');
    if (existing) {
      existing.isOpen = true;
      existing.card.el.style.display = '';
      existing.worldX = existing.savedWX;
      existing.worldY = existing.savedWY;
      this.lifecycle.positionCard(existing);
      this.lifecycle.bringToFront(existing.card);
      this.viewport.panToCard(existing);
      this.notifier.notifySpecsmapChanged();
      return;
    }
    const cs = this.lifecycle.addCard('SpecsMap', '', -400, -250, 800, 500);
    log.info('add specsmap card');
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const sm = new SpecsMapWindow(body, wsPath);
        sm.onFileOpen = (filePath) => this.lifecycle.getActiveExplorerWindow()?.openFile(filePath);
        cs.specsmapWindow = sm;
        cs.card.onDestroy = () => sm.destroy();
        this.notifier.notifySpecsmapChanged();
        this.lifecycle.bringToFront(cs.card);
        this.viewport.panToCard(cs);
      }
    });
  }

  addAgents(wsPath: string): void {
    const existing = this.lifecycle.getCards().find(c => c.savedTitle === 'Agents');
    if (existing) {
      existing.isOpen = true;
      existing.card.el.style.display = '';
      existing.worldX = existing.savedWX;
      existing.worldY = existing.savedWY;
      this.lifecycle.positionCard(existing);
      this.lifecycle.bringToFront(existing.card);
      this.viewport.panToCard(existing);
      this.notifier.notifyAgentsChanged();
      return;
    }
    const cs = this.lifecycle.addCard('Agents', '', -400, -250, 800, 500);
    log.info('add agents card');
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const ag = new AgentsWindow(body, wsPath);
        cs.agentsWindow = ag;
        cs.card.onDestroy = () => ag.destroy();
        this.notifier.notifyAgentsChanged();
        this.lifecycle.bringToFront(cs.card);
        this.viewport.panToCard(cs);
      }
    });
  }

  addTerminal(cwd?: string): Promise<string> {
    const name = `Terminal ${this.lifecycle.nextTerminalNumber()}`;
    const cs = this.lifecycle.addCard(name, '', -280, -210, 560, 420);
    log.info('add terminal card', name);
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const body = cs.card.el.querySelector('.card-body');
        if (body) {
          (body as HTMLElement).style.padding = '0';
          (body as HTMLElement).style.alignItems = 'stretch';
          (body as HTMLElement).style.justifyContent = 'stretch';
          const term = new TerminalWindow(body as HTMLElement, cs.card.uuid, cwd);
          term.onExit = () => this.lifecycle.terminateCard(cs);
          cs.card.onDestroy = () => term.destroy();
          cs.terminalWindow = term;
          cs.onCardResize = () => { term.setScale(this.viewport.scale); term.fit(); };
          term.setScale(this.viewport.scale);
          term.ready.then(resolve);
        } else {
          resolve(cs.card.uuid);
        }
        this.notifier.notifyTerminalsChanged();
        this.lifecycle.bringToFront(cs.card);
        this.viewport.panToCard(cs);
      });
    });
  }

  /** Toggle the dev console card — reuses the existing card if present. */
  addDevConsole(wsPath: string): void {
    const existing = this.lifecycle.getCards().find(c => c.savedTitle === 'DevConsole');
    if (existing) {
      existing.isOpen = !existing.isOpen;
      existing.card.el.style.display = existing.isOpen ? '' : 'none';
      if (existing.isOpen) {
        existing.worldX = existing.savedWX;
        existing.worldY = existing.savedWY;
        this.lifecycle.positionCard(existing);
        this.lifecycle.bringToFront(existing.card);
        this.viewport.panToCard(existing);
      }
      this.host.getOnStateChange()?.();
      return;
    }
    const cs = this.lifecycle.addCard('DevConsole', '', -400, -250, 720, 480);
    log.info('toggle dev console card');
    requestAnimationFrame(() => {
      const body = cs.card.el.querySelector('.card-body') as HTMLElement;
      if (body) {
        body.style.padding = '0';
        body.style.alignItems = 'stretch';
        body.style.justifyContent = 'stretch';
        const dc = new DevConsoleWindow(body, wsPath);
        cs.devConsoleWindow = dc;
        cs.card.onDestroy = () => dc.destroy();
        this.lifecycle.bringToFront(cs.card);
        this.viewport.panToCard(cs);
      }
    });
  }
}
