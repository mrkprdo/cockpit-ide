import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportFailure, onFailure, bindGuarded, initHealthMonitor } from './monitor';
import type { FailureSignal } from './types';

describe('health/monitor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('reportFailure', () => {
    it('emits to subscribers with a timestamp', () => {
      const received: FailureSignal[] = [];
      const unsub = onFailure((s) => received.push(s));
      reportFailure({ kind: 'llm.stream-error', source: 'ai-drawer/llm-loop.ts', message: 'boom' });
      expect(received).toHaveLength(1);
      expect(received[0].kind).toBe('llm.stream-error');
      expect(received[0].source).toBe('ai-drawer/llm-loop.ts');
      expect(received[0].at).toBeGreaterThan(0);
      unsub();
    });

    it('forwards to diagnostics:rendererError', () => {
      const reportError = vi.fn();
      (window as any).electronAPI.diagnostics.reportError = reportError;
      reportFailure({ kind: 'ipc.handler-error', source: 'main/ipc/fs.ts', message: 'err' });
      expect(reportError).toHaveBeenCalledWith('ipc.handler-error', 'err');
    });

    it('does not call console.error (re-entrancy guard)', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      reportFailure({ kind: 'window.crash', source: 'x', message: 'y' });
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('never throws when the diagnostics channel is missing', () => {
      const api = (window as any).electronAPI;
      delete (window as any).electronAPI;
      expect(() => reportFailure({ kind: 'specs.corrupt-cache', source: 'specsmap/data.ts', message: 'x' }))
        .not.toThrow();
      (window as any).electronAPI = api;
    });
  });

  describe('bindGuarded', () => {
    it('reports sync throws from a listener as window.crash', () => {
      const reported: FailureSignal[] = [];
      const unsub = onFailure((s) => reported.push(s));
      const el = document.createElement('div');
      const unbind = bindGuarded(el, 'click', () => { throw new Error('listener boom'); }, 'git-window/changes.ts');
      el.dispatchEvent(new Event('click'));
      expect(reported).toHaveLength(1);
      expect(reported[0].kind).toBe('window.crash');
      expect(reported[0].source).toBe('git-window/changes.ts');
      expect(reported[0].message).toContain('listener boom');
      unbind();
    });

    it('reports async rejections from a listener', async () => {
      const reported: FailureSignal[] = [];
      const unsub = onFailure((s) => reported.push(s));
      const el = document.createElement('div');
      const unbind = bindGuarded(el, 'click', () => Promise.reject(new Error('async boom')), 'canvas-area/card-lifecycle.ts');
      el.dispatchEvent(new Event('click'));
      await new Promise((r) => setTimeout(r, 0));
      expect(reported).toHaveLength(1);
      expect(reported[0].message).toContain('async boom');
      unbind();
    });

    it('returns an unbind that removes the listener', () => {
      const reported: FailureSignal[] = [];
      const unsub = onFailure((s) => reported.push(s));
      const el = document.createElement('div');
      const unbind = bindGuarded(el, 'click', () => { throw new Error('boom'); }, 'x');
      unbind();
      el.dispatchEvent(new Event('click'));
      expect(reported).toHaveLength(0);
      unsub();
    });
  });

  describe('initHealthMonitor', () => {
    it('subscribes to health:mainFailure and merges into the stream', () => {
      const onMainFailure = vi.fn();
      (window as any).electronAPI.health.onMainFailure = onMainFailure;
      initHealthMonitor();
      expect(onMainFailure).toHaveBeenCalled();

      const cb = onMainFailure.mock.calls[0][0];
      const received: FailureSignal[] = [];
      const unsub = onFailure((s) => received.push(s));
      cb({ kind: 'ipc.handler-error', message: 'from main' });
      expect(received).toHaveLength(1);
      expect(received[0].source).toBe('main');
      expect(received[0].kind).toBe('ipc.handler-error');
      unsub();
    });
  });
});
