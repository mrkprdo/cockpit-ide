// prefs:* namespace — user preferences (userData, not workspace-specific).
// May contain secrets (e.g. the LLM API key), so encrypt at rest via the OS
// keychain (safeStorage) where available; plaintext JSON from an older version,
// or from a platform without a keychain, still loads correctly.

import * as fs from 'fs';
import * as path from 'path';
import type { IpcMain } from 'electron';
import { app, safeStorage } from 'electron';
import type { IpcCtx } from './context';
import { withHandlerLogging } from './logging';

/**
 * The persisted preferences blob, decrypted when the OS keychain is available.
 * Exported because main-side settings (the file-watcher backend) live in the
 * same file the renderer writes.
 */
export function readPrefsFile(): Record<string, any> {
  const file = path.join(app.getPath('userData'), 'preferences.json');
  try {
    const raw = fs.readFileSync(file);
    try { return JSON.parse(raw.toString('utf-8')); } catch { /* not plaintext — try decrypting below */ }
    if (safeStorage.isEncryptionAvailable()) return JSON.parse(safeStorage.decryptString(raw));
    return {};
  } catch { return {}; }
}

export function registerPrefsHandlers(ipcMain: IpcMain, _ctx: IpcCtx): void {
  const prefsFile = path.join(app.getPath('userData'), 'preferences.json');

  withHandlerLogging('prefs:load', () => readPrefsFile(), {});

  withHandlerLogging('prefs:save', (_event, prefs: any) => {
    try {
      const json = JSON.stringify(prefs, null, 2);
      const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : json;
      fs.writeFileSync(prefsFile, data);
      return true;
    } catch { return false; }
  }, false);
}
