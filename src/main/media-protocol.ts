// cockpit-media:// — read-only, workspace-scoped streaming for the Explorer's
// image, video and PDF viewers.
//
// Why a protocol instead of fs:readFile: the text bridge buffers the whole file
// in the main process and caps reads at 32 MB. A video needs byte ranges (seek)
// and must never be buffered whole. Requests are answered from disk with a
// 206/Content-Range when Chromium asks for one, so playback and scrubbing work
// for files far larger than the text limit.
//
// Security: the scheme serves *only* known media extensions, only from files
// whose canonical (symlink-resolved) path is inside an open workspace, and with
// nosniff. It cannot be used to load workspace HTML/JS into the renderer.

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { protocol } from 'electron';
import { mediaMimeType } from '../shared/media';
import { state } from './ipc/state';
import { isWithin } from './ipc/security';

export const MEDIA_SCHEME = 'cockpit-media';

/** Must run before app.whenReady(); the renderer's CSP names this scheme. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true, // video/PDF viewers can stream + range-request it
    },
  }]);
}

export interface ByteRange { start: number; end: number; }

/**
 * Parse a single-range `Range` header against a known file size.
 * null = no range requested (serve the whole file); 'invalid' = 416.
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | 'invalid' | null {
  if (!header) return null;
  if (!Number.isFinite(size) || size <= 0) return 'invalid';
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'invalid';
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return 'invalid';

  if (!rawStart) {
    // Suffix form: bytes=-N means the last N bytes.
    const suffix = parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = parseInt(rawStart, 10);
  const end = rawEnd ? parseInt(rawEnd, 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (start >= size || start > end) return 'invalid';
  return { start, end: Math.min(end, size - 1) };
}

/** Workspace roots a media request may read from (every window, plus the CLI root). */
function workspaceRoots(): string[] {
  const roots = new Set<string>();
  if (state.defaultWorkspacePath) roots.add(state.defaultWorkspacePath);
  for (const ws of state.windowWorkspaces.values()) {
    if (ws) roots.add(ws);
  }
  return [...roots];
}

/** Canonical path when it lives inside one of the roots; 'missing' for ENOENT. */
function canonicalInsideRoots(target: string, roots: string[]): string | 'missing' | null {
  let real: string;
  try {
    real = fs.realpathSync(target);
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'missing' : null;
  }
  for (const root of roots) {
    try {
      if (isWithin(fs.realpathSync(root), real)) return real;
    } catch { /* a closed workspace root cannot contain anything */ }
  }
  return null;
}

function streamBody(filePath: string, start?: number, end?: number): ReadableStream {
  const stream = start === undefined
    ? fs.createReadStream(filePath)
    : fs.createReadStream(filePath, { start, end });
  return Readable.toWeb(stream) as ReadableStream;
}

/** Serve one cockpit-media request. Exported for tests (no Electron runtime needed). */
export async function serveMediaRequest(request: Request, roots: string[]): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  let rawPath: string | null = null;
  try {
    rawPath = new URL(request.url).searchParams.get('path');
  } catch { /* malformed URL */ }
  if (!rawPath) return new Response('Missing path', { status: 400 });

  const mime = mediaMimeType(rawPath);
  if (!mime) return new Response('Unsupported media type', { status: 415 });

  const canon = canonicalInsideRoots(rawPath, roots);
  if (canon === 'missing') return new Response('Not found', { status: 404 });
  if (!canon) return new Response('Forbidden', { status: 403 });

  let stat: fs.Stats;
  try { stat = await fs.promises.stat(canon); } catch { return new Response('Not found', { status: 404 }); }
  if (!stat.isFile()) return new Response('Not found', { status: 404 });

  const size = stat.size;
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };

  const range = parseRangeHeader(request.headers.get('range'), size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    return new Response(
      request.method === 'HEAD' ? null : streamBody(canon, range.start, range.end),
      { status: 206, headers },
    );
  }

  headers['Content-Length'] = String(size);
  return new Response(
    request.method === 'HEAD' ? null : streamBody(canon),
    { status: 200, headers },
  );
}

/** Register the protocol handler. Call once, after app.whenReady(). */
export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => serveMediaRequest(request, workspaceRoots()));
}
