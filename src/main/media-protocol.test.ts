/**
 * @vitest-environment node
 *
 * Tests for the cockpit-media:// protocol handler and its range parsing.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  app: { isPackaged: false },
  BrowserWindow: vi.fn(),
}));

import { parseRangeHeader, serveMediaRequest } from './media-protocol';

function mediaUrl(filePath: string): string {
  return 'cockpit-media://local/?path=' + encodeURIComponent(filePath);
}

describe('parseRangeHeader', () => {
  it('returns null when no range was requested', () => {
    expect(parseRangeHeader(null, 20)).toBeNull();
  });

  it('parses start-end, open-ended and suffix ranges', () => {
    expect(parseRangeHeader('bytes=2-5', 20)).toEqual({ start: 2, end: 5 });
    expect(parseRangeHeader('bytes=10-', 20)).toEqual({ start: 10, end: 19 });
    expect(parseRangeHeader('bytes=-4', 20)).toEqual({ start: 16, end: 19 });
  });

  it('clamps an end past the file size', () => {
    expect(parseRangeHeader('bytes=5-999', 20)).toEqual({ start: 5, end: 19 });
  });

  it('rejects unsatisfiable or malformed ranges', () => {
    expect(parseRangeHeader('bytes=20-', 20)).toBe('invalid');
    expect(parseRangeHeader('bytes=9-4', 20)).toBe('invalid');
    expect(parseRangeHeader('bytes=-0', 20)).toBe('invalid');
    expect(parseRangeHeader('bytes=abc', 20)).toBe('invalid');
    expect(parseRangeHeader('bytes=', 20)).toBe('invalid');
    expect(parseRangeHeader('bytes=0-1', 0)).toBe('invalid');
  });
});

describe('serveMediaRequest', () => {
  let workspace: string;
  let outside: string;

  beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-media-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-media-outside-'));
    fs.writeFileSync(path.join(workspace, 'clip.mp4'), '0123456789abcdefghij');
    fs.writeFileSync(path.join(outside, 'secret.mp4'), 'secret');
  });

  afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('streams a full media file from the workspace', async () => {
    const res = await serveMediaRequest(new Request(mediaUrl(path.join(workspace, 'clip.mp4'))), [workspace]);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('content-length')).toBe('20');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe('0123456789abcdefghij');
  });

  it('answers a byte range with 206 and Content-Range', async () => {
    const req = new Request(mediaUrl(path.join(workspace, 'clip.mp4')), { headers: { Range: 'bytes=2-5' } });
    const res = await serveMediaRequest(req, [workspace]);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-5/20');
    expect(res.headers.get('content-length')).toBe('4');
    expect(await res.text()).toBe('2345');
  });

  it('returns 416 for an unsatisfiable range', async () => {
    const req = new Request(mediaUrl(path.join(workspace, 'clip.mp4')), { headers: { Range: 'bytes=99-' } });
    const res = await serveMediaRequest(req, [workspace]);
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */20');
  });

  it('answers HEAD without a body', async () => {
    const res = await serveMediaRequest(new Request(mediaUrl(path.join(workspace, 'clip.mp4')), { method: 'HEAD' }), [workspace]);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(res.headers.get('content-length')).toBe('20');
  });

  it('refuses files outside every workspace root', async () => {
    const res = await serveMediaRequest(new Request(mediaUrl(path.join(outside, 'secret.mp4'))), [workspace]);
    expect(res.status).toBe(403);
  });

  it('refuses non-media extensions even inside the workspace', async () => {
    fs.writeFileSync(path.join(workspace, 'notes.txt'), 'text');
    const res = await serveMediaRequest(new Request(mediaUrl(path.join(workspace, 'notes.txt'))), [workspace]);
    expect(res.status).toBe(415);
  });

  it('returns 404 for a missing media file', async () => {
    const res = await serveMediaRequest(new Request(mediaUrl(path.join(workspace, 'gone.png'))), [workspace]);
    expect(res.status).toBe(404);
  });

  it('rejects a request without a path', async () => {
    const res = await serveMediaRequest(new Request('cockpit-media://local/'), [workspace]);
    expect(res.status).toBe(400);
  });
});
