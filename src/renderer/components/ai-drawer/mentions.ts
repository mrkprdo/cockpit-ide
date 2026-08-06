// @mention routing (D5): a leading @Name / @room sends that ONE message to a
// live sub-agent (or every one of them) instead of the main session. Everything
// else falls through to the normal send path. The main chat session is the room,
// so a routed mention stays visible in Chat and lands in the target's PoV.
//
// Lives outside the facade for the same reason the other controllers do: the
// facade stays a thin wiring layer.

import { getAgentExecutor } from '../../agents/executor';
import type { AgentFeed } from './agent-feed';
import type { ChatMessage } from './types';

export interface MentionHost {
  getFeed(): AgentFeed;
  getMessages(): ChatMessage[];
  renderMessages(): void;
  /** Persist the main thread — these paths never enter the LLM loop. */
  persistChat(): void;
  /** Fall back to the main agent (unmatched mention). */
  runMessage(text: string): void;
}

export class Mentions {
  constructor(private host: MentionHost) {}

  /** `@name rest` → parts, or null when the text is not a mention. */
  parse(text: string): { name: string; rest: string } | null {
    const m = /^@([A-Za-z0-9_\-:]+)\s+([\s\S]+)$/.exec(text);
    if (!m) return null;
    return { name: m[1].toLowerCase(), rest: m[2] };
  }

  /** 'room' | an agent id | null, matched against LIVE agents only. */
  resolve(name: string): string | null {
    const agents = this.host.getFeed().activeAgents();
    if (name === 'room' || name === 'all') return 'room';
    if (name.startsWith('agent:')) return agents.some(a => a.persona.id === name) ? name : null;
    const matches = agents.filter(a => {
      const slug = a.persona.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return a.persona.name.toLowerCase() === name || slug === name || slug.startsWith(name);
    });
    return matches.length === 1 ? matches[0].persona.id : null;
  }

  /** Route one message. `original` keeps the user's casing for the Chat line. */
  send(name: string, rest: string, original: string): void {
    const target = this.resolve(name);
    const payload = `[user] ${rest}`;
    if (target === 'room') {
      getAgentExecutor().broadcast(payload, 'room.user', 'main');
      this.pushMessage(name, rest, original, null);
      return;
    }
    if (target) {
      getAgentExecutor().dispatch(target as never, { type: 'request', from: 'main', payload });
      this.pushMessage(name, rest, original, target);
      return;
    }
    // No match: say so rather than silently dropping it, then send to main.
    this.host.getMessages().push({
      role: 'system',
      content: `No live agent matches "@${name}" — sent to the main agent instead.`,
      timestamp: Date.now(),
    });
    this.host.renderMessages();
    this.host.persistChat();
    this.host.runMessage(original);
  }

  private pushMessage(name: string, text: string, original: string, target: string | null): void {
    const now = Date.now();
    const feed = this.host.getFeed();
    // Chat shows exactly what was said; the target PoV gets it as a question.
    this.host.getMessages().push({ role: 'user', content: original, timestamp: now, mentionTo: name });
    if (target) {
      feed.addToTranscript(target as never, {
        role: 'assistant',
        content: text,
        timestamp: now,
        speaker: { id: 'main', name: 'You', icon: 'YO', color: 'var(--accent)' },
        intent: 'question',
        toName: target ? feed.nameOf(target as never) : undefined,
      });
    }
    this.host.renderMessages();
    this.host.persistChat();
  }
}
