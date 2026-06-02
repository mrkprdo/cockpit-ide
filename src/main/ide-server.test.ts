import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('ws', () => {
  const MockWebSocket = vi.fn();
  MockWebSocket.prototype.send = vi.fn();
  MockWebSocket.prototype.close = vi.fn();
  MockWebSocket.prototype.on = vi.fn();

  const MockWebSocketServer = vi.fn();
  MockWebSocketServer.prototype.on = vi.fn();
  MockWebSocketServer.prototype.close = vi.fn();

  return { WebSocket: MockWebSocket, WebSocketServer: MockWebSocketServer };
});

import { IdeServer } from './ide-server';

describe('IdeServer', () => {
  let server: IdeServer;
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-server-test-'));
    fs.mkdirSync(path.join(tmpDir, '.cockpit'), { recursive: true });
    server = new IdeServer();
  });

  afterEach(() => {
    server.stop();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  describe('start / stop', () => {
    it('writes and removes workspace lock file', async () => {
      const lockPath = path.join(tmpDir, '.cockpit', 'ide.lock');
      expect(fs.existsSync(lockPath)).toBe(false);

      await server.start(tmpDir);
      expect(fs.existsSync(lockPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      expect(content.transport).toBe('ws');
      expect(content.workspaceFolders).toEqual([tmpDir.replace(/\\/g, '/')]);

      server.stop();
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('writes ~/.claude/ide/{port}.lock lock file', async () => {
      const origUserProfile = process.env.USERPROFILE;
      process.env.USERPROFILE = tmpDir;
      try {
        await server.start(tmpDir);
        const lockDir = path.join(tmpDir, '.claude', 'ide');
        const files = fs.readdirSync(lockDir);
        const lockFiles = files.filter(f => f.endsWith('.lock'));
        expect(lockFiles.length).toBeGreaterThan(0);
        const lockContent = JSON.parse(fs.readFileSync(path.join(lockDir, lockFiles[0]), 'utf-8'));
        expect(lockContent.transport).toBe('ws');
        expect(lockContent.workspaceFolders).toEqual([tmpDir.replace(/\\/g, '/')]);
      } finally {
        process.env.USERPROFILE = origUserProfile;
      }
    });

    it('writes lock file with correct transport field', async () => {
      await server.start(tmpDir);
      const lockPath = path.join(tmpDir, '.cockpit', 'ide.lock');
      const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      expect(content).toEqual({
        transport: 'ws',
        workspaceFolders: [tmpDir.replace(/\\/g, '/')],
      });
    });

    it('cleans up all lock files on stop', async () => {
      const origUserProfile = process.env.USERPROFILE;
      process.env.USERPROFILE = tmpDir;
      try {
        await server.start(tmpDir);
        const allPaths = server.getLockPaths();
        for (const p of allPaths) {
          expect(fs.existsSync(p)).toBe(true);
        }
        server.stop();
        for (const p of allPaths) {
          expect(fs.existsSync(p)).toBe(false);
        }
      } finally {
        process.env.USERPROFILE = origUserProfile;
      }
    });
  });

  describe('updateEditorState (JSON-RPC 2.0)', () => {
    it('handles null state gracefully', async () => {
      await server.start(tmpDir);
      expect(() => server.updateEditorState(null)).not.toThrow();
    });

    it('handles state with null filePath', async () => {
      await server.start(tmpDir);
      expect(() => server.updateEditorState({ filePath: null, text: null, selection: null })).not.toThrow();
    });

    it('handles state with no selection', async () => {
      await server.start(tmpDir);
      expect(() => server.updateEditorState({
        filePath: '/test/file.ts',
        text: null,
        selection: null,
      })).not.toThrow();
    });

    it('handles state with full selection including text', async () => {
      await server.start(tmpDir);
      expect(() => server.updateEditorState({
        filePath: path.join(tmpDir, 'src', 'file.ts'),
        text: 'const x = 1;',
        selection: { startLine: 10, startColumn: 1, endLine: 20, endColumn: 80 },
      })).not.toThrow();
    });
  });

  describe('getPort', () => {
    it('returns 0 before start', () => {
      expect(server.getPort()).toBe(0);
    });

    it('returns port after start', async () => {
      await server.start(tmpDir);
      expect(server.getPort()).toBeGreaterThan(0);
    });
  });

  describe('getLockPaths', () => {
    it('returns copy of lock paths array', async () => {
      await server.start(tmpDir);
      const paths = server.getLockPaths();
      expect(Array.isArray(paths)).toBe(true);
      paths.push('/should/not/mutate');
      expect(server.getLockPaths().length).toBe(paths.length - 1);
    });
  });
});
