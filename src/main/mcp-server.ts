import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as http from 'http';
import * as fs from 'fs';
import * as pathModule from 'path';
import { BrowserWindow, app, dialog, shell } from 'electron';

const MCP_PORT_ENV = 'COCKPIT_MCP_PORT';
const DEFAULT_MCP_PORT = 49876;

export interface McpServerContext {
  workspacePath: string | null;
  isPathSafe: (p: string) => boolean;
  ptyProcesses: Map<string, any>;
  terminalSenders: Map<string, any>;
  cockpitDir: (dir: string) => void;
  createNewWindow: () => void;
  filterEnv: () => Record<string, string>;
}

function getBrowserWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins.length > 0 ? wins[wins.length - 1] : null;
}

export interface McpServerInstance {
  server: McpServer;
  httpServer: http.Server;
  port: number;
  close: () => Promise<void>;
}

export async function createAndStartMcpServer(
  context: McpServerContext,
): Promise<McpServerInstance> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  const server = new McpServer(
    { name: 'cockpit-ide', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  // ─── File System Tools ───

  server.tool('fs_read_dir',
    'List entries in a directory',
    { dirPath: z.string() },
    async ({ dirPath }) => {
      if (!context.isPathSafe(dirPath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const result = entries.map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`);
        return { content: [{ type: 'text', text: result.join('\n') || '(empty)' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('fs_read_file',
    'Read file contents as text',
    { filePath: z.string() },
    async ({ filePath }) => {
      if (!context.isPathSafe(filePath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('fs_write_file',
    'Write content to a file (creates or overwrites)',
    { filePath: z.string(), content: z.string() },
    async ({ filePath, content }) => {
      if (!context.isPathSafe(filePath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        fs.writeFileSync(filePath, content, 'utf-8');
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('fs_mkdir',
    'Create a directory (recursive)',
    { dirPath: z.string() },
    async ({ dirPath }) => {
      if (!context.isPathSafe(dirPath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('fs_delete',
    'Delete a file or directory (recursive)',
    { targetPath: z.string() },
    async ({ targetPath }) => {
      if (!context.isPathSafe(targetPath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('fs_copy',
    'Copy a file or directory (recursive)',
    { src: z.string(), dest: z.string() },
    async ({ src, dest }) => {
      if (!context.isPathSafe(src) || !context.isPathSafe(dest)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        fs.cpSync(src, dest, { recursive: true });
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('fs_rename',
    'Rename or move a file or directory',
    { oldPath: z.string(), newPath: z.string() },
    async ({ oldPath, newPath }) => {
      if (!context.isPathSafe(oldPath) || !context.isPathSafe(newPath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        fs.renameSync(oldPath, newPath);
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // ─── Workspace Tools ───

  server.tool('workspace_get_path',
    'Get the current workspace path',
    {},
    async () => {
      return { content: [{ type: 'text', text: context.workspacePath || '(no workspace)' }] };
    },
  );

  server.tool('workspace_load_state',
    'Load saved workspace state from .cockpit/window.json',
    { wsPath: z.string().optional() },
    async ({ wsPath }) => {
      const targetPath = wsPath || context.workspacePath;
      if (!targetPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace path' }], isError: true };
      }
      if (wsPath && !context.isPathSafe(wsPath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        const data = fs.readFileSync(pathModule.join(targetPath, '.cockpit', 'window.json'), 'utf-8');
        return { content: [{ type: 'text', text: data }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('workspace_save_state',
    'Save workspace state to .cockpit/window.json',
    { state: z.any(), wsPath: z.string().optional() },
    async ({ state, wsPath }) => {
      const targetPath = wsPath || context.workspacePath;
      if (!targetPath) {
        return { content: [{ type: 'text', text: 'Error: no workspace path' }], isError: true };
      }
      if (wsPath && !context.isPathSafe(wsPath)) {
        return { content: [{ type: 'text', text: 'Error: path outside workspace' }], isError: true };
      }
      try {
        const dir = pathModule.join(targetPath, '.cockpit');
        context.cockpitDir(dir);
        fs.writeFileSync(pathModule.join(dir, 'window.json'), JSON.stringify(state, null, 2));
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('workspace_get_recent',
    'List recently opened workspaces',
    {},
    async () => {
      const recentWsFile = pathModule.join(app.getPath('userData'), 'recent-workspaces.json');
      try {
        const list: string[] = JSON.parse(fs.readFileSync(recentWsFile, 'utf-8'));
        return { content: [{ type: 'text', text: list.join('\n') || '(none)' }] };
      } catch {
        return { content: [{ type: 'text', text: '(none)' }] };
      }
    },
  );

  server.tool('workspace_select',
    'Open native dialog to select a workspace directory',
    {},
    async () => {
      const win = getBrowserWindow();
      if (!win) {
        return { content: [{ type: 'text', text: 'Error: no window' }], isError: true };
      }
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Open Workspace',
      });
      if (result.canceled || !result.filePaths.length) {
        return { content: [{ type: 'text', text: 'cancelled' }] };
      }
      return { content: [{ type: 'text', text: result.filePaths[0] }] };
    },
  );

  // ─── Terminal Tools ───

  server.tool('terminal_list',
    'List active terminal session UUIDs',
    {},
    async () => {
      const uuids = Array.from(context.ptyProcesses.keys());
      return { content: [{ type: 'text', text: uuids.join('\n') || '(no active terminals)' }] };
    },
  );

  server.tool('terminal_create',
    'Create a new terminal PTY session',
    { uuid: z.string(), cwd: z.string().optional() },
    async ({ uuid, cwd }) => {
      let nodePty: any;
      try {
        nodePty = require('node-pty');
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error loading node-pty: ${e.message}` }], isError: true };
      }

      const plat = process.platform;
      let shellBin: string;
      if (plat === 'win32') {
        shellBin = process.env.COMSPEC || 'cmd.exe';
      } else if (plat === 'darwin') {
        shellBin = process.env.SHELL || '/bin/zsh';
      } else {
        shellBin = process.env.SHELL || '/bin/bash';
      }

      const home = process.env.USERPROFILE || process.env.HOME || '/tmp';
      let resolvedCwd = cwd || home;
      try {
        if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
          resolvedCwd = home;
        }
      } catch { resolvedCwd = home; }

      try {
        const pty = nodePty.spawn(shellBin, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: resolvedCwd,
          env: context.filterEnv(),
        });

        pty.onExit(() => {
          context.ptyProcesses.delete(uuid);
          context.terminalSenders.delete(uuid);
        });

        context.ptyProcesses.set(uuid, pty);
        return { content: [{ type: 'text', text: `Terminal ${uuid} created (shell: ${shellBin}, cwd: ${resolvedCwd})` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('terminal_write',
    'Write data to a terminal session',
    { uuid: z.string(), data: z.string() },
    async ({ uuid, data }) => {
      const pty = context.ptyProcesses.get(uuid);
      if (!pty) {
        return { content: [{ type: 'text', text: 'Error: terminal not found' }], isError: true };
      }
      try {
        pty.write(data);
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('terminal_kill',
    'Kill a terminal session',
    { uuid: z.string() },
    async ({ uuid }) => {
      const pty = context.ptyProcesses.get(uuid);
      if (!pty) {
        return { content: [{ type: 'text', text: 'Error: terminal not found' }], isError: true };
      }
      try {
        pty.kill();
        context.ptyProcesses.delete(uuid);
        context.terminalSenders.delete(uuid);
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // ─── Window Tools ───

  server.tool('window_new',
    'Create a new Cockpit IDE window',
    {},
    async () => {
      try {
        context.createNewWindow();
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool('window_minimize',
    'Minimize the active window',
    {},
    async () => {
      const win = getBrowserWindow();
      if (!win) return { content: [{ type: 'text', text: 'Error: no window' }], isError: true };
      win.minimize();
      return { content: [{ type: 'text', text: 'OK' }] };
    },
  );

  server.tool('window_maximize',
    'Toggle maximize on the active window',
    {},
    async () => {
      const win = getBrowserWindow();
      if (!win) return { content: [{ type: 'text', text: 'Error: no window' }], isError: true };
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return { content: [{ type: 'text', text: 'OK' }] };
    },
  );

  server.tool('window_close',
    'Close the active window',
    {},
    async () => {
      const win = getBrowserWindow();
      if (!win) return { content: [{ type: 'text', text: 'Error: no window' }], isError: true };
      win.close();
      return { content: [{ type: 'text', text: 'OK' }] };
    },
  );

  // ─── Preferences Tools ───

  server.tool('prefs_load',
    'Load user preferences from preferences.json',
    {},
    async () => {
      const prefsFile = pathModule.join(app.getPath('userData'), 'preferences.json');
      try {
        const data = JSON.parse(fs.readFileSync(prefsFile, 'utf-8'));
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: '{}' }] };
      }
    },
  );

  server.tool('prefs_save',
    'Save user preferences to preferences.json',
    { prefs: z.any() },
    async ({ prefs }) => {
      const prefsFile = pathModule.join(app.getPath('userData'), 'preferences.json');
      try {
        fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // ─── Shell Tools ───

  server.tool('shell_open_external',
    'Open a URL in the default browser (https/http/mailto only)',
    { url: z.string() },
    async ({ url }) => {
      try {
        const parsed = new URL(url);
        if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) {
          return { content: [{ type: 'text', text: 'Error: protocol not allowed' }], isError: true };
        }
        await shell.openExternal(url);
        return { content: [{ type: 'text', text: 'OK' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  // ─── HTTP Server ───

  const port = parseInt(process.env[MCP_PORT_ENV] || String(DEFAULT_MCP_PORT), 10);

  const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'POST' || req.method === 'GET') {
      let body = '';
      req.on('data', (chunk: string) => { body += chunk; });
      req.on('end', async () => {
        try {
          const parsedBody = body ? JSON.parse(body) : undefined;
          await transport.handleRequest(req, res, parsedBody);
        } catch (e: any) {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        }
      });
    } else {
      res.writeHead(405);
      res.end();
    }
  });

  httpServer.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`MCP port ${port} in use; MCP server not available`);
    } else {
      console.error('MCP server error:', e);
    }
  });

  const actualPort = await new Promise<number>((resolve, reject) => {
    httpServer.listen(port, '127.0.0.1', () => {
      const addr = httpServer.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
    httpServer.once('error', (e: any) => {
      if (e.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} in use`));
      } else {
        reject(e);
      }
    });
  });

  await server.connect(transport);
  console.log(`Cockpit MCP server running at http://127.0.0.1:${actualPort}`);

  return {
    server,
    httpServer,
    port: actualPort,
    close: async () => {
      await server.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
