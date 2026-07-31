import { describe, it, expect, vi } from 'vitest';
import { AgentBus, Mailbox } from './bus';
import type { AgentMessage } from './types';

function msg(partial: Partial<AgentMessage> & { from: string; to: AgentMessage['to']; payload?: unknown; type?: AgentMessage['type'] }): AgentMessage {
  return {
    id: `m-${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type ?? 'broadcast',
    from: partial.from,
    to: partial.to,
    payload: partial.payload ?? null,
    ts: partial.ts ?? Date.now(),
    topic: partial.topic,
    correlationId: partial.correlationId,
    expectsResponse: partial.expectsResponse,
    replyTo: partial.replyTo,
    ttl: partial.ttl,
  };
}

describe('AgentBus', () => {
  it('delivers a direct message to the addressed mailbox', () => {
    const bus = new AgentBus();
    bus.registerMailbox('agent:a');
    const record = bus.publish(msg({ from: 'main', to: 'agent:a', type: 'dispatch', payload: 'hello' }));
    const mb = bus.getMailbox('agent:a')!;
    expect(mb.length).toBe(1);
    expect(mb.drain()[0].payload).toBe('hello');
    expect(record.deliveredTo).toEqual(['agent:a']);
  });

  it('multicasts to an array of targets and drops unknown ones', () => {
    const bus = new AgentBus();
    bus.registerMailbox('agent:a');
    bus.registerMailbox('agent:b');
    const record = bus.publish(msg({ from: 'main', to: ['agent:a', 'agent:b', 'agent:ghost'] }));
    expect(record.deliveredTo).toEqual(['agent:a', 'agent:b']);
    expect(record.dropped.some(d => d.to === 'agent:ghost' && d.reason === 'no-mailbox')).toBe(true);
  });

  it('broadcasts to every registered mailbox when to is "*"', () => {
    const bus = new AgentBus();
    bus.registerMailbox('agent:a');
    bus.registerMailbox('agent:b');
    bus.publish(msg({ from: 'main', to: '*', payload: 'all-hands' }));
    expect(bus.getMailbox('agent:a')!.length).toBe(1);
    expect(bus.getMailbox('agent:b')!.length).toBe(1);
  });

  it('drops expired messages (TTL) instead of delivering them', () => {
    const bus = new AgentBus();
    bus.registerMailbox('agent:a');
    const record = bus.publish(msg({ from: 'main', to: 'agent:a', ttl: 1, ts: Date.now() - 5000 }));
    expect(bus.getMailbox('agent:a')!.length).toBe(0);
    expect(record.dropped.some(d => d.reason === 'expired')).toBe(true);
  });

  it('notifies topic subscribers for fan-out', () => {
    const bus = new AgentBus();
    const handler = vi.fn();
    bus.subscribe('impl.done', handler);
    bus.subscribe('*', handler);
    bus.publish(msg({ from: 'agent:i', to: 'main', type: 'respond', topic: 'impl.done' }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('mailbox is FIFO and drain empties it', () => {
    const mb = new Mailbox('agent:a');
    mb.push(msg({ from: 'main', to: 'agent:a', payload: 1 }));
    mb.push(msg({ from: 'main', to: 'agent:a', payload: 2 }));
    expect(mb.peek().length).toBe(2);
    const drained = mb.drain();
    expect(drained.map(m => m.payload)).toEqual([1, 2]);
    expect(mb.length).toBe(0);
  });

  describe('MessageCollector (who-captures-what)', () => {
    it('resolves waitFor when a respond arrives with the correlationId', async () => {
      const bus = new AgentBus();
      const waiter = bus.waitFor('corr-1', { timeoutMs: 1000 });
      bus.publish(msg({ from: 'agent:a', to: 'main', type: 'respond', correlationId: 'corr-1', replyTo: 'main', payload: 'done' }));
      const got = await waiter;
      expect(got.payload).toBe('done');
      expect(bus.waiterCount('corr-1')).toBe(0);
    });

    it('rejects with timeout when nothing arrives', async () => {
      const bus = new AgentBus();
      await expect(bus.waitFor('corr-none', { timeoutMs: 30 })).rejects.toThrow(/timeout/);
    });

    it('resolves when a request message (expectsResponse) arrives', async () => {
      const bus = new AgentBus();
      const waiter = bus.waitFor('corr-2', { timeoutMs: 1000 });
      bus.publish(msg({ from: 'agent:b', to: 'main', type: 'request', correlationId: 'corr-2', expectsResponse: true, payload: 'question?' }));
      const got = await waiter;
      expect(got.type).toBe('request');
    });

    it('records deliveries in the audit log', () => {
      const bus = new AgentBus();
      bus.registerMailbox('agent:a');
      bus.publish(msg({ from: 'main', to: 'agent:a' }));
      expect(bus.getDeliveryLog().length).toBe(1);
      expect(bus.getDeliveryLog()[0].deliveredTo).toContain('agent:a');
    });

    it('aborts the wait on an external AbortSignal', async () => {
      const bus = new AgentBus();
      const ac = new AbortController();
      const waiter = bus.waitFor('corr-3', { timeoutMs: 5000, signal: ac.signal });
      ac.abort();
      await expect(waiter).rejects.toThrow('Aborted');
    });
  });
});
