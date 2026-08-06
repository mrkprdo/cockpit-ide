import { describe, it, expect } from 'vitest';
import { AgentFeed } from './agent-feed';
import type { AgentEvent, AgentId } from '../../agents/types';

function persona(id: AgentId = 'agent:x'): any {
  return { id, name: 'Reviewer', icon: 'RV', color: '#ffd54f', definition: 'reviewer' };
}

/** Drive a private feed event (the executor wires the same handler). */
function fire(feed: AgentFeed, id: AgentId, ev: AgentEvent): void {
  (feed as any).handleEvent(id, ev);
}

function spawnEvent(id: AgentId = 'agent:x'): AgentEvent {
  return {
    kind: 'spawn',
    persona: persona(id),
    brief: 'review the cache',
    expectedResult: 'findings brief',
    guardrails: ['never edit files'],
  };
}

describe('AgentFeed', () => {
  it('routes spawn join + say + final into the chat; step/tool stay in the PoV', () => {
    const feed = new AgentFeed();
    const chat: any[] = [];
    feed.onChatMessage = (m) => chat.push(m);
    fire(feed, 'agent:x', spawnEvent());
    const t = feed.transcripts.get('agent:x')!;
    expect(t.steps.some(m => m.content.includes('review the cache'))).toBe(true);
    expect(t.steps.some(m => m.content.includes('findings brief'))).toBe(true);
    expect(chat.some(m => m.content.includes('Reviewer joined'))).toBe(true);

    // step → PoV thinking, NOT in the chat.
    fire(feed, 'agent:x', { kind: 'step', text: 'reading cache.ts', step: 1 });
    expect(t.steps.some(m => m.role === 'thinking' && m.content === 'reading cache.ts')).toBe(true);
    expect(chat.some(m => m.content === 'reading cache.ts')).toBe(false);

    // tool → PoV chip only.
    fire(feed, 'agent:x', { kind: 'tool', name: 'read_file', args: '{"path":"cache.ts"}', callId: 'tc1' });
    expect(t.steps.some(m => m.role === 'tool' && m.toolCallId === 'tc1')).toBe(true);
    expect(chat.some(m => m.toolName === 'read_file')).toBe(false);

    // say → chat + PoV, with intent.
    fire(feed, 'agent:x', { kind: 'say', text: 'the tenant id is missing', intent: 'finding' });
    expect(chat.some(m => m.content === 'the tenant id is missing' && m.intent === 'finding')).toBe(true);
    expect(t.steps.some(m => m.content === 'the tenant id is missing' && m.speaker?.name === 'Reviewer')).toBe(true);

    // state → no chat line.
    const chatLen = chat.length;
    fire(feed, 'agent:x', { kind: 'state', state: 'active' });
    expect(chat.length).toBe(chatLen);

    // final → chat verdict + PoV.
    fire(feed, 'agent:x', { kind: 'final', text: 'VERDICT: ship it', state: 'done' });
    expect(chat.some(m => m.content === 'VERDICT: ship it' && m.intent === 'verdict')).toBe(true);
    expect(t.state).toBe('done');
    expect(t.finishedAt).not.toBeNull();
  });

  it('a throwing onChatMessage listener does not break the run', () => {
    const feed = new AgentFeed();
    feed.onChatMessage = () => { throw new Error('chat bug'); };
    fire(feed, 'agent:x', spawnEvent());
    fire(feed, 'agent:x', { kind: 'say', text: 'still works', intent: 'note' });
    const t = feed.transcripts.get('agent:x')!;
    expect(t.steps.some(m => m.content === 'still works')).toBe(true);
  });

  it('tool result patches its pending chip by callId', () => {
    const feed = new AgentFeed();
    fire(feed, 'agent:x', spawnEvent());
    fire(feed, 'agent:x', { kind: 'tool', name: 'read_file', args: '{"path":"a.ts"}', callId: 'tc9' });
    const t = feed.transcripts.get('agent:x')!;
    const pending = t.steps.find(m => m.toolCallId === 'tc9');
    expect(pending?.toolResult).toBeUndefined();

    fire(feed, 'agent:x', { kind: 'tool', name: 'read_file', args: '{"path":"a.ts"}', result: 'content', callId: 'tc9' });
    const patched = t.steps.find(m => m.toolCallId === 'tc9');
    expect(patched?.toolResult).toBe('content');
    // No duplicate chip was added.
    expect(t.steps.filter(m => m.toolCallId === 'tc9').length).toBe(1);
  });

  it('caps evict the oldest transcript entries (200)', () => {
    const feed = new AgentFeed();
    fire(feed, 'agent:x', spawnEvent());
    const t = feed.transcripts.get('agent:x')!;
    for (let i = 0; i < 250; i++) {
      fire(feed, 'agent:x', { kind: 'step', text: `step ${i}`, step: i });
    }
    expect(t.steps.length).toBeLessThanOrEqual(200);
    expect(t.steps.some(m => m.content === 'step 0')).toBe(false);
    expect(t.steps.some(m => m.content === 'step 249')).toBe(true);
  });

  it('unread increments only for the agent tab when it is not active', () => {
    const feed = new AgentFeed();
    feed.activeView = 'agent:x'; // viewing the agent → its tab is active
    fire(feed, 'agent:x', spawnEvent());
    const t = feed.transcripts.get('agent:x')!;
    fire(feed, 'agent:x', { kind: 'say', text: 'directed to me', intent: 'finding' });
    expect(t.unread).toBe(0);

    feed.activeView = 'chat';
    fire(feed, 'agent:x', { kind: 'say', text: 'broadcast', intent: 'note' });
    expect(t.unread).toBe(1);

    feed.clearUnread('agent:x');
    expect(t.unread).toBe(0);
  });

  it('addToTranscript pushes a user @mention into the target PoV', () => {
    const feed = new AgentFeed();
    fire(feed, 'agent:a', spawnEvent('agent:a'));
    feed.addToTranscript('agent:a', {
      role: 'assistant',
      content: 'user asks',
      timestamp: Date.now(),
      speaker: { id: 'main', name: 'You', icon: 'YO', color: '#00e5ff' },
      intent: 'question',
    });
    const t = feed.transcripts.get('agent:a')!;
    expect(t.steps.some(m => m.content === 'user asks' && m.speaker?.name === 'You')).toBe(true);
  });

  it('purgeFinished drops finished tabs; reset empties everything', () => {
    const feed = new AgentFeed();
    fire(feed, 'agent:a', spawnEvent('agent:a'));
    fire(feed, 'agent:b', spawnEvent('agent:b'));
    fire(feed, 'agent:b', { kind: 'final', text: 'done b', state: 'done' });
    feed.purgeFinished();
    expect(feed.transcripts.has('agent:a')).toBe(true);
    expect(feed.transcripts.has('agent:b')).toBe(false);

    feed.reset();
    expect(feed.transcripts.size).toBe(0);
    expect(feed.activeView).toBe('chat');
  });
});
