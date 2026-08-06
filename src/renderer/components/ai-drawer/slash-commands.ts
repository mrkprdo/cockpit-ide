// Slash-command registry + autocomplete popup (the `!`/`/` command menu).
// Owns the command list and the popup's filter/selection state; DOM reads/writes
// go through the shared AiDrawerDom refs and the injected SlashHost callbacks.

import { escapeHtml } from './render';
import type { AgentState } from '../../agents/types';
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
  /** Live agents for the @mention popup. */
  getActiveAgents(): Array<{ id: string; name: string; icon: string; color: string; state: AgentState }>;
  /** Purge finished agent tabs (files stay on disk). */
  purgeFinished(): void;
}

type PopupMode = 'slash' | 'mention';

export class SlashCommands {
  commands: SlashCommand[] = [];
  private slashSelectedIndex = 0;
  private slashFiltered: SlashCommand[] = [];
  private mentionFiltered: Array<{ id: string; name: string; icon: string; color: string; state: AgentState }> = [];
  private mode: PopupMode = 'slash';

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
      name: 'agents',
      label: '/agents',
      description: 'List live sub-agents in Chat',
      action: () => this.listAgents(),
    });
    this.register({
      name: 'purge',
      label: '/purge',
      description: 'Purge finished agent tabs',
      action: () => this.host.purgeFinished(),
    });
    this.register({
      name: 'exit',
      label: '/exit',
      description: 'Close the entire application',
      action: () => window.electronAPI?.window.close(),
    });
  }

  listAgents(): void {
    const agents = this.host.getActiveAgents();
    if (agents.length === 0) {
      this.pushSystem('No sub-agents are running.');
      return;
    }
    this.pushSystem(
      agents.map(a => `${a.icon} **${a.name}** · ${a.state} · \`${a.id}\``).join('\n')
    );
  }

  private pushSystem(content: string): void {
    this.host.getMessages().push({ role: 'system', content, timestamp: Date.now() });
    this.host.renderMessages();
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
    if (value.startsWith('@')) {
      // Only while the @token is still being typed — once a space lands the rest
      // is the message body, not a filter.
      if (/\s/.test(value)) { this.close(); return; }
      this.mode = 'mention';
      const query = value.slice(1).toLowerCase();
      this.mentionFiltered = this.host.getActiveAgents().filter(a =>
        a.name.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)
      );
      this.slashSelectedIndex = this.mentionFiltered.length > 0 ? 0 : -1;
    } else {
      this.mode = 'slash';
      const query = value.slice(1).toLowerCase();
      this.slashFiltered = this.commands.filter(cmd =>
        cmd.label.toLowerCase().startsWith('/' + query)
      );
      this.slashSelectedIndex = this.slashFiltered.length > 0 ? 0 : -1;
    }
    this.renderPopup();
    this.dom.slashPopupEl.style.display = 'flex';
  }

  close(): void {
    if (!this.dom.slashPopupEl) return;
    this.dom.slashPopupEl.style.display = 'none';
    this.slashFiltered = [];
    this.mentionFiltered = [];
    this.slashSelectedIndex = -1;
  }

  handleKeydown(e: KeyboardEvent): void {
    const listLen = this.mode === 'mention' ? this.mentionFiltered.length : this.slashFiltered.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (listLen > 0) {
        this.slashSelectedIndex = (this.slashSelectedIndex + 1) % listLen;
        this.updateSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (listLen > 0) {
        this.slashSelectedIndex = (this.slashSelectedIndex - 1 + listLen) % listLen;
        this.updateSelection();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.mode === 'mention') {
        const agent = this.mentionFiltered[this.slashSelectedIndex];
        if (agent) {
          this.autocompleteMention(agent.name);
        } else {
          this.close();
          this.host.sendMessage();
        }
      } else {
        const cmd = this.slashFiltered[this.slashSelectedIndex];
        if (cmd && this.inputMatches(cmd)) {
          this.execute(cmd);
        } else {
          this.close();
          this.host.sendMessage();
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (this.mode === 'mention') {
        const agent = this.mentionFiltered[this.slashSelectedIndex];
        if (agent) this.autocompleteMention(agent.name);
      } else {
        const cmd = this.slashFiltered[this.slashSelectedIndex];
        if (cmd) this.autocomplete(cmd);
      }
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

  /** Insert `@Name ` so the mention resolves by persona name (case-insensitive). */
  autocompleteMention(name: string): void {
    this.host.setInputValue(`@${name} `);
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
    const header = this.dom.el.querySelector('.ai-slash-popup-header');
    if (header) header.textContent = this.mode === 'mention' ? 'Agents' : 'Commands';
    this.dom.slashEmptyEl.textContent =
      this.mode === 'mention' ? 'No live agents' : 'No matching commands';
    const listLen = this.mode === 'mention' ? this.mentionFiltered.length : this.slashFiltered.length;
    if (listLen === 0) {
      this.dom.slashListEl.style.display = 'none';
      this.dom.slashEmptyEl.style.display = '';
      return;
    }
    this.dom.slashListEl.style.display = '';
    this.dom.slashEmptyEl.style.display = 'none';

    if (this.mode === 'mention') {
      this.mentionFiltered.forEach((a, i) => {
        const item = document.createElement('div');
        item.className = 'ai-slash-item' + (i === this.slashSelectedIndex ? ' is-selected' : '');
        item.dataset.command = a.id;
        item.innerHTML = `
          <span class="ai-slash-name">${escapeHtml(a.icon)} ${escapeHtml(a.name)}</span>
          <span class="ai-slash-desc">${a.state}</span>
        `;
        item.addEventListener('mouseenter', () => {
          this.slashSelectedIndex = i;
          this.updateSelection();
        });
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.autocompleteMention(a.name);
        });
        this.dom.slashListEl.appendChild(item);
      });
      return;
    }

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
