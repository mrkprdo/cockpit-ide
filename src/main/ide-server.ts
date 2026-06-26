import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocket, WebSocketServer } from 'ws';

export interface EditorSelectionState {
  filePath: string | null;
  text: string | null;
  selection: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  } | null;
}

interface LockFile {
  transport: string;
  workspaceFolders: string[];
}

interface SelectionChangedParams {
  text: string | null;
  filePath: string | null;
  relativePath: string | null;
  selection: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  } | null;
}

export class IdeServer {
  onOpenFile: ((filePath: string) => void) | null = null;

  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private port = 0;
  private workspacePath = '';
  private lockPaths: string[] = [];
  private clients = new Set<WebSocket>();
  private currentState: SelectionChangedParams | null = null;

  start(wsPath: string): Promise<void> {
    this.workspacePath = wsPath;
    this.server = http.createServer();

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      let initialized = false;

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.method === 'initialize' && msg.id != null) {
            ws.send(JSON.stringify({
              jsonrpc: '2.0',
              id: msg.id,
              result: {
                protocolVersion: '2025-11-25',
                serverInfo: { name: 'Cockpit IDE', version: '0.0.1' },
              },
            }));
            initialized = true;
            if (this.currentState) {
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'selection_changed',
                params: this.currentState,
              }));
            }
          } else if (msg.method === 'openFile' && msg.params?.filePath) {
            this.onOpenFile?.(msg.params.filePath);
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.on('close', () => { this.clients.delete(ws); });
      ws.on('error', () => { this.clients.delete(ws); });
    });

    this.writeLockFiles();

    return new Promise((resolve) => {
      this.server!.on('error', (err) => {
        console.error('ide: http server error', err);
        resolve();
      });

      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.updateLockFiles();
        resolve();
      });
    });
  }

  stop(): void {
    this.removeLockFiles();
    if (this.wss) {
      for (const ws of this.clients) {
        try { ws.close(); } catch {}
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.currentState = null;
    this.port = 0;
  }

  updateEditorState(state: EditorSelectionState | null): void {
    if (!this.wss || this.clients.size === 0) return;

    let msg: SelectionChangedParams;
    if (!state || !state.filePath) {
      msg = {
        text: null,
        filePath: null,
        relativePath: null,
        selection: null,
      };
    } else {
      const rel = this.workspacePath
        ? path.relative(this.workspacePath, state.filePath).replace(/\\/g, '/')
        : state.filePath;
      msg = {
        text: state.text || null,
        filePath: state.filePath,
        relativePath: rel,
        selection: state.selection ? {
          start: { line: state.selection.startLine, character: state.selection.startColumn },
          end: { line: state.selection.endLine, character: state.selection.endColumn },
        } : null,
      };
    }

    this.currentState = msg;
    const raw = JSON.stringify({
      jsonrpc: '2.0',
      method: 'selection_changed',
      params: msg,
    });
    for (const ws of this.clients) {
      try { ws.send(raw); } catch {}
    }
  }

  getPort(): number { return this.port; }
  getLockPaths(): string[] { return [...this.lockPaths]; }

  private writeLockFiles(): void {
    const data: LockFile = {
      transport: 'ws',
      workspaceFolders: this.workspacePath ? [this.workspacePath.replace(/\\/g, '/')] : [],
    };
    const raw = JSON.stringify(data, null, 2);

    // 1. Workspace-local lock file
    if (this.workspacePath) {
      const wsDir = path.join(this.workspacePath, '.cockpit');
      try { fs.mkdirSync(wsDir, { recursive: true }); } catch {}
      const wsLock = path.join(wsDir, 'ide.lock');
      try { fs.writeFileSync(wsLock, raw, 'utf-8'); } catch (e) { console.error('ide: writeLock failed', wsLock, e); }
      this.lockPaths.push(wsLock);
    }

    // 2. %USERPROFILE%/.claude/ide/ (Claude Code / Cursor / opencode protocol)
    const userProfile = process.env.USERPROFILE;
    if (userProfile) {
      const claudeDir = path.join(userProfile, '.claude', 'ide');
      try { fs.mkdirSync(claudeDir, { recursive: true }); } catch (e) { console.error('ide: mkdir .claude/ide failed', e); }
      const claudeLock = path.join(claudeDir, `${this.port}.lock`);
      try { fs.writeFileSync(claudeLock, raw, 'utf-8'); } catch (e) { console.error('ide: writeLock failed', claudeLock, e); }
      this.lockPaths.push(claudeLock);
    }

    // 3. {xdgData}/opencode/ide/ (opencode XDG data path)
    const xdgData = process.env.XDG_DATA_HOME || (userProfile ? path.join(userProfile, '.local', 'share') : null);
    if (xdgData) {
      const opencodeDir = path.join(xdgData, 'opencode', 'ide');
      try { fs.mkdirSync(opencodeDir, { recursive: true }); } catch (e) { console.error('ide: mkdir opencode ide failed', e); }
      const ocLock = path.join(opencodeDir, `${this.port}.lock`);
      try { fs.writeFileSync(ocLock, raw, 'utf-8'); } catch (e) { console.error('ide: writeLock failed', ocLock, e); }
      this.lockPaths.push(ocLock);
    }
  }

  private updateLockFiles(): void {
    const newPaths: string[] = [];
    for (const p of this.lockPaths) {
      try {
        const dir = path.dirname(p);
        const data: LockFile = {
          transport: 'ws',
          workspaceFolders: this.workspacePath ? [this.workspacePath.replace(/\\/g, '/')] : [],
        };
        const raw = JSON.stringify(data, null, 2);
        const base = path.basename(p);
        const newName = base === 'ide.lock' ? 'ide.lock' : `${this.port}.lock`;
        const newPath = path.join(dir, newName);
        fs.writeFileSync(newPath, raw, 'utf-8');
        if (newPath !== p) {
          try { fs.unlinkSync(p); } catch {}
        }
        newPaths.push(newPath);
      } catch (e) {
        console.error('ide: updateLock failed', p, e);
        newPaths.push(p);
      }
    }
    this.lockPaths = newPaths;
  }

  private removeLockFiles(): void {
    for (const p of this.lockPaths) {
      try { fs.unlinkSync(p); } catch {}
    }
    this.lockPaths = [];
  }
}

export const ideServer = new IdeServer();
