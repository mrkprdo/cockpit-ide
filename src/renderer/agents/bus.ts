import type { AgentId, AgentMessage, DeliveryRecord } from './types';

/**
 * The fleet's pub/sub transport + capture layer.
 *
 * - `publish` routes a message by `to` (direct / multicast / broadcast) and
 *   notifies `topic` subscribers for fan-out.
 * - Every agent owns a Mailbox; messages addressed to it queue until the agent
 *   drains it between loop steps.
 * - MessageCollector is the *who-captures-what* layer: any message with
 *   `expectsResponse` registers a waiter keyed by correlationId; the first
 *   matching `respond`/`request` resolves it. Main (or any peer) can
 *   `await collector.waitFor(corrId, { timeoutMs })` without blocking the bus.
 * - Every delivery is recorded in the delivery log (audit trail).
 */
export interface WaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class Mailbox {
  readonly owner: AgentId;
  private queue: AgentMessage[] = [];

  constructor(owner: AgentId) {
    this.owner = owner;
  }

  push(msg: AgentMessage): void {
    this.queue.push(msg);
  }

  /** Drain all currently queued messages (FIFO). */
  drain(): AgentMessage[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  get length(): number {
    return this.queue.length;
  }

  peek(): AgentMessage[] {
    return [...this.queue];
  }
}

interface TopicSubscription {
  topic: string;
  handler: (msg: AgentMessage) => void;
}

export class AgentBus {
  private mailboxes = new Map<AgentId, Mailbox>();
  private topicSubs: TopicSubscription[] = [];
  private deliveryLog: DeliveryRecord[] = [];
  private readonly maxDeliveryLog = 500;
  private waiters = new Map<string, Array<(msg: AgentMessage) => void>>();

  /** Optional listener notified on every publish (UI card hooks in here). */
  onMessage: ((msg: AgentMessage, record: DeliveryRecord) => void) | null = null;

  registerMailbox(id: AgentId): Mailbox {
    let mb = this.mailboxes.get(id);
    if (!mb) {
      mb = new Mailbox(id);
      this.mailboxes.set(id, mb);
    }
    return mb;
  }

  unregisterMailbox(id: AgentId): void {
    this.mailboxes.delete(id);
  }

  getMailbox(id: AgentId): Mailbox | null {
    return this.mailboxes.get(id) ?? null;
  }

  hasMailbox(id: AgentId): boolean {
    return this.mailboxes.has(id);
  }

  /** Subscribe to a topic (or '*' for everything). Returns an unsubscribe fn. */
  subscribe(topic: string, handler: (msg: AgentMessage) => void): () => void {
    const sub: TopicSubscription = { topic, handler };
    this.topicSubs.push(sub);
    return () => {
      this.topicSubs = this.topicSubs.filter(s => s !== sub);
    };
  }

  /** Publish a message: route by `to`, fan out by `topic`, resolve waiters. */
  publish(msg: AgentMessage): DeliveryRecord {
    const deliveredTo: AgentId[] = [];
    const dropped: DeliveryRecord['dropped'] = [];

    const expired = msg.ttl !== undefined && Date.now() - msg.ts > msg.ttl;

    // Direct / multicast / broadcast addressing.
    const targets: AgentId[] = msg.to === '*'
      ? Array.from(this.mailboxes.keys())
      : Array.isArray(msg.to)
        ? msg.to
        : [msg.to];

    for (const target of targets) {
      const mb = this.mailboxes.get(target);
      if (!mb) {
        dropped.push({ to: target, reason: 'no-mailbox' });
        continue;
      }
      if (expired) {
        dropped.push({ to: target, reason: 'expired' });
        continue;
      }
      mb.push(msg);
      deliveredTo.push(target);
    }

    // Topic fan-out (still fires for expired messages — subscribers see the log).
    if (msg.topic) {
      for (const sub of this.topicSubs) {
        if (sub.topic === '*' || sub.topic === msg.topic) {
          try {
            sub.handler(msg);
          } catch {
            // A subscriber must never break the bus.
          }
        }
      }
    }

    // Collector: resolve waiters keyed by correlationId (+replyTo).
    if (msg.expectsResponse || (msg.type === 'respond' && msg.correlationId)) {
      const key = msg.correlationId;
      if (key) {
        const waiters = this.waiters.get(key);
        if (waiters) {
          const replyTo = msg.replyTo;
          const matching = replyTo
            ? waiters.filter(w => w !== null) // all waiters on a corrId accept a respond addressed to them
            : waiters;
          // A waiter with a replyTo filter only consumes the message if it matches.
          const consumed: Array<(msg: AgentMessage) => void> = [];
          for (const w of [...matching]) {
            consumed.push(w);
          }
          // Resolve all waiters for this correlationId (main may wait once, peers may also wait).
          for (const w of consumed) {
            w(msg);
          }
          if (consumed.length > 0) {
            this.waiters.delete(key);
          }
        }
      }
    }

    const record: DeliveryRecord = {
      msgId: msg.id,
      deliveredTo,
      dropped,
      ts: Date.now(),
    };
    this.deliveryLog.push(record);
    if (this.deliveryLog.length > this.maxDeliveryLog) {
      this.deliveryLog.splice(0, this.deliveryLog.length - this.maxDeliveryLog);
    }
    this.onMessage?.(msg, record);
    return record;
  }

  /**
   * Non-blocking wait: resolves when a message arrives with the given
   * correlationId (a respond or request), or rejects on timeout/abort.
   */
  waitFor(correlationId: string, opts: WaitOptions = {}): Promise<AgentMessage> {
    return new Promise<AgentMessage>((resolve, reject) => {
      const timeoutMs = opts.timeoutMs ?? 120_000;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = (fn: () => void) => {
        if (opts.signal?.aborted) return;
        if (timer) clearTimeout(timer);
        fn();
      };

      const list = this.waiters.get(correlationId) ?? [];
      const handler = (msg: AgentMessage) => done(() => {
        // Remove ourselves from the waiter list (if not already cleaned).
        const remaining = (this.waiters.get(correlationId) ?? []).filter(h => h !== handler);
        if (remaining.length === 0) this.waiters.delete(correlationId);
        else this.waiters.set(correlationId, remaining);
        resolve(msg);
      });
      list.push(handler);
      this.waiters.set(correlationId, list);

      timer = setTimeout(() => {
        const remaining = (this.waiters.get(correlationId) ?? []).filter(h => h !== handler);
        if (remaining.length === 0) this.waiters.delete(correlationId);
        else this.waiters.set(correlationId, remaining);
        reject(new Error(`Wait timeout for correlationId "${correlationId}" after ${timeoutMs}ms`));
      }, timeoutMs);

      if (opts.signal) {
        opts.signal.addEventListener('abort', () => {
          if (timer) clearTimeout(timer);
          const remaining = (this.waiters.get(correlationId) ?? []).filter(h => h !== handler);
          if (remaining.length === 0) this.waiters.delete(correlationId);
          else this.waiters.set(correlationId, remaining);
          reject(new Error('Aborted'));
        }, { once: true });
      }
    });
  }

  /** Count of unresolved waiters for a correlationId (debugging/UI). */
  waiterCount(correlationId: string): number {
    return (this.waiters.get(correlationId) ?? []).length;
  }

  getDeliveryLog(): DeliveryRecord[] {
    return [...this.deliveryLog];
  }

  clearDeliveryLog(): void {
    this.deliveryLog = [];
  }
}

let defaultBus: AgentBus | null = null;

/** Process-wide default bus (tests create their own instances). */
export function getDefaultBus(): AgentBus {
  if (!defaultBus) defaultBus = new AgentBus();
  return defaultBus;
}
