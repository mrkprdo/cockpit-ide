// Slash-command registry + autocomplete popup (the `!`/`/` command menu).
// Owns the command list and the popup's filter/selection state; DOM reads/writes
// go through the shared AiDrawerDom refs and the injected SlashHost callbacks.

import { escapeHtml } from './render';
import type { AiDrawerDom, ChatMessage, SlashCommand } from './types';

export interface SlashHost {
  getInputValue(): string;
  setInputValue(value: string): void;
  getInputEl(): HTMLTextAreaElement;
  handleInput(): void;
  sendMessage(): void;
  newSession(): void;
  compactSession(): void;
  getMessages(): ChatMessage[];
  setMessages(messages: ChatMessage[]): void;
  renderMessages(): void;
}

export class SlashCommands {
  commands: SlashCommand[] = [];
  private slashSelectedIndex = 0;
  private slashFiltered: SlashCommand[] = [];

  constructor(private dom: AiDrawerDom, private host: SlashHost) {}

  register(cmd: SlashCommand): void {
    const existing = this.commands.findIndex(c => c.name === cmd.name);
    if (existing !== -1) {
      this.commands[existing] = cmd;
    } else {
      this.commands.push(cmd);
    }
  }

  registerDefaults(): void {
    this.commands = [];
    this.register({
      name: 'new',
      label: '/new',
      description: 'Start a new session',
      action: () => this.host.newSession(),
    });
    this.register({
      name: 'opencode',
      label: '/opencode',
      description: 'Open a terminal and run opencode',
      action: () => this.runOpencode(),
    });
    this.register({
      name: 'compact',
      label: '/compact',
      description: 'Summarize conversation into compact context',
      action: () => this.host.compactSession(),
    });
    this.register({
      name: 'exit',
      label: '/exit',
      description: 'Close the entire application',
      action: () => window.electronAPI?.window.close(),
    });
  }

  async runOpencode(): Promise<void> {
    const cockpit = (window as any).__cockpit;
    if (!cockpit || typeof cockpit.addTerminal !== 'function') {
      throw new Error('Canvas not ready');
    }
    const uuid = await cockpit.addTerminal();
    if (cockpit.writeToTerminal) {
      cockpit.writeToTerminal(uuid, 'opencode');
    }
  }

  isPopupOpen(): boolean {
    return this.dom.slashPopupEl?.style.display !== 'none';
  }

  open(value: string): void {
    const query = value.slice(1).toLowerCase();
    this.slashFiltered = this.commands.filter(cmd =>
      cmd.label.toLowerCase().startsWith('/' + query)
    );
    this.slashSelectedIndex = this.slashFiltered.length > 0 ? 0 : -1;
    this.renderPopup();
    this.dom.slashPopupEl.style.display = 'flex';
  }

  close(): void {
    if (!this.dom.slashPopupEl) return;
    this.dom.slashPopupEl.style.display = 'none';
    this.slashFiltered = [];
    this.slashSelectedIndex = -1;
  }

  handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.slashFiltered.length > 0) {
        this.slashSelectedIndex = (this.slashSelectedIndex + 1) % this.slashFiltered.length;
        this.updateSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.slashFiltered.length > 0) {
        this.slashSelectedIndex = (this.slashSelectedIndex - 1 + this.slashFiltered.length) % this.slashFiltered.length;
        this.updateSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = this.slashFiltered[this.slashSelectedIndex];
      if (cmd && this.inputMatches(cmd)) {
        this.execute(cmd);
      } else {
        this.close();
        this.host.sendMessage();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const cmd = this.slashFiltered[this.slashSelectedIndex];
      if (cmd) this.autocomplete(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  }

  inputMatches(cmd: SlashCommand): boolean {
    const value = this.host.getInputValue().trim();
    return value === cmd.label || value === `/${cmd.name}`;
  }

  autocomplete(cmd: SlashCommand): void {
    this.host.setInputValue(cmd.label);
    this.host.handleInput();
    this.host.getInputEl().focus();
  }

  async execute(cmd: SlashCommand): Promise<void> {
    this.host.setInputValue('');
    this.close();
    try {
      await cmd.action();
    } catch (err) {
      // Surface command errors as a transient system message.
      this.host.getMessages().push({
        role: 'system',
        content: `**/${cmd.name} failed:** ${escapeHtml((err as Error).message || 'Unknown error')}`,
        timestamp: Date.now(),
      });
      this.host.renderMessages();
    }
  }

  private renderPopup(): void {
    this.dom.slashListEl.innerHTML = '';
    if (this.slashFiltered.length === 0) {
      this.dom.slashListEl.style.display = 'none';
      this.dom.slashEmptyEl.style.display = '';
      return;
    }
    this.dom.slashListEl.style.display = '';
    this.dom.slashEmptyEl.style.display = 'none';
    this.slashFiltered.forEach((cmd, i) => {
      const item = document.createElement('div');
      item.className = 'ai-slash-item' + (i === this.slashSelectedIndex ? ' is-selected' : '');
      item.dataset.command = cmd.name;
      item.innerHTML = `
        <span class="ai-slash-name">${escapeHtml(cmd.label)}</span>
        <span class="ai-slash-desc">${escapeHtml(cmd.description)}</span>
      `;
      item.addEventListener('mouseenter', () => {
        this.slashSelectedIndex = i;
        this.updateSelection();
      });
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.autocomplete(cmd);
      });
      this.dom.slashListEl.appendChild(item);
    });
  }

  private updateSelection(): void {
    const items = this.dom.slashListEl.querySelectorAll('.ai-slash-item');
    items.forEach((item, i) => {
      (item as HTMLElement).classList.toggle('is-selected', i === this.slashSelectedIndex);
    });
    const selected = items[this.slashSelectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }
}
