import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  installConsoleCapture, subscribeLogs, getRecentLogs, clearLogs, logLevelRank,
} from './log-capture';
import type { LogEntry } from './log-capture';

describe('dev-console/log-capture', () => {
  let unbind: () => void = () => {};

  beforeEach(() => {
    clearLogs();
  });

  afterEach(() => {
    unbind();
    vi.restoreAllMocks();
  });

  it('captures console calls into a ring buffer', () => {
    unbind = installConsoleCapture();
    console.log('hello', 42);
    console.warn('warn');
    console.error('err');
    const entries = getRecentLogs();
    expect(entries).toHaveLength(3);
    expect(entries[0].level).toBe('log');
    expect(entries[0].args).toEqual(['hello', 42]);
    expect(entries[1].level).toBe('warn');
    expect(entries[2].level).toBe('error');
  });

  it('notifies subscribers synchronously', () => {
    unbind = installConsoleCapture();
    const seen: LogEntry[] = [];
    const unsub = subscribeLogs((e) => seen.push(e));
    console.info('x');
    expect(seen).toHaveLength(1);
    expect(seen[0].level).toBe('info');
    unsub();
  });

  it('restores original console methods on unbind', () => {
    unbind = installConsoleCapture();
    const before = getRecentLogs().length;
    unbind();
    console.error('after unbind');
    expect(getRecentLogs().length).toBe(before);
  });

  it('caps the buffer at 500 entries', () => {
    unbind = installConsoleCapture();
    for (let i = 0; i < 520; i++) console.log(i);
    expect(getRecentLogs().length).toBe(500);
  });

  it('is idempotent — second install returns a noop and does not double-capture', () => {
    unbind = installConsoleCapture();
    const noop = installConsoleCapture();
    console.log('once');
    expect(getRecentLogs()).toHaveLength(1);
    noop();
  });

  it('ranks levels error<warn<log<info<debug', () => {
    expect(logLevelRank('error')).toBe(0);
    expect(logLevelRank('warn')).toBe(1);
    expect(logLevelRank('log')).toBe(2);
    expect(logLevelRank('info')).toBe(3);
    expect(logLevelRank('debug')).toBe(4);
  });
});
