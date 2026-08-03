// memory:* namespace — agent memory: global (userData) + workspace-local
// (.cockpit/memory.json). Workspace reads/writes go through the path sandbox.

import * as fs from 'fs';
import * as path from 'path';
import type { IpcMain } from 'electron';
import { app } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging } from './logging';

interface MemoryShape { version: number; updatedAt: string; entries: any[] }

export function registerMemoryHandlers(ipcMain: IpcMain, ctx: IpcCtx): void {
  const { security } = ctx;
  const globalMemoryFile = path.join(app.getPath('userData'), 'memory.json');

  const emptyMemoryFile = (): MemoryShape => ({ version: 1, updatedAt: new Date().toISOString(), entries: [] });

  const normalizeMemoryFile = (raw: any): MemoryShape => {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.entries)) return emptyMemoryFile();
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
      entries: raw.entries,
    };
  };

  const readOrCreateMemoryFile = (filePath: string): MemoryShape => {
    try {
      if (!fs.existsSync(filePath)) {
        const base = emptyMemoryFile();
        security.cockpitDir(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(base, null, 2), 'utf-8');
        return base;
      }
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return normalizeMemoryFile(parsed);
    } catch {
      const base = emptyMemoryFile();
      try {
        security.cockpitDir(path.dirname(filePath));
        fs.writeFileSync(filePath, JSON.stringify(base, null, 2), 'utf-8');
      } catch { /* ignore */ }
      return base;
    }
  };

  const writeMemoryFile = (filePath: string, data: any): boolean => {
    try {
      const file = normalizeMemoryFile(data);
      file.updatedAt = new Date().toISOString();
      security.cockpitDir(path.dirname(filePath));
      fs.writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');
      return true;
    } catch { return false; }
  };

  withHandlerLogging('memory:loadGlobal', () => readOrCreateMemoryFile(globalMemoryFile), null);
  withHandlerLogging('memory:saveGlobal', (_event, data: any) => writeMemoryFile(globalMemoryFile, data), false);

  withHandlerLogging('memory:loadWorkspace', (event, wsPath: string) => {
    if (!wsPath || !security.isPathSafe(wsPath, event)) return emptyMemoryFile();
    const f = path.join(wsPath, '.cockpit', 'memory.json');
    return readOrCreateMemoryFile(f);
  }, null);

  withHandlerLogging('memory:saveWorkspace', (event, wsPath: string, data: any) => {
    if (!wsPath || !security.isPathSafe(wsPath, event)) return false;
    const f = path.join(wsPath, '.cockpit', 'memory.json');
    return writeMemoryFile(f, data);
  }, false);
}
