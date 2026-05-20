#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

const PORT_FILENAME = 'mcp-port.txt';

function findCockpitPort() {
  const envPort = process.env.COCKPIT_MCP_PORT;
  if (envPort) return parseInt(envPort, 10);

  const candidates = [];

  if (platform() === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) candidates.push(join(appData, 'cockpit-ide'));
  }

  if (platform() === 'darwin') {
    candidates.push(join(homedir(), 'Library', 'Application Support', 'cockpit-ide'));
  }

  candidates.push(join(homedir(), '.config', 'cockpit-ide'));

  if (process.env.XDG_CONFIG_HOME) {
    candidates.push(join(process.env.XDG_CONFIG_HOME, 'cockpit-ide'));
  }

  if (process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'cockpit-ide'));
  }

  candidates.push(join(homedir(), '.cockpit'));

  for (const dir of candidates) {
    const portFile = join(dir, PORT_FILENAME);
    if (existsSync(portFile)) {
      try {
        return parseInt(readFileSync(portFile, 'utf-8').trim(), 10);
      } catch {}
    }
  }

  return 49876;
}

async function main() {
  const port = findCockpitPort();
  const serverUrl = new URL(`http://127.0.0.1:${port}`);

  const httpTransport = new StreamableHTTPClientTransport(serverUrl);
  const cockpitClient = new Client(
    { name: 'cockpit-bridge', version: '0.0.1' },
    { capabilities: {} },
  );

  await cockpitClient.connect(httpTransport);

  const bridgeServer = new Server(
    { name: 'cockpit-ide', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  bridgeServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return cockpitClient.listTools();
  });

  bridgeServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return cockpitClient.callTool(name, args ?? {});
  });

  const stdioTransport = new StdioServerTransport();
  await bridgeServer.connect(stdioTransport);

  bridgeServer.onclose = async () => {
    await cockpitClient.close();
    process.exit(0);
  };

  process.on('SIGINT', async () => {
    await bridgeServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await bridgeServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('cockpit-mcp-bridge error:', err);
  process.exit(1);
});
