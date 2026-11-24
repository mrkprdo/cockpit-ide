import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaViewer, mediaAssetUrl } from './media-viewer';
import { mockElectronAPI } from '../../../test/setup';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('mediaAssetUrl', () => {
  it('encodes the absolute path into the cockpit-media scheme', () => {
    expect(mediaAssetUrl('D:\\ws\\my photo.png')).toBe(
      'cockpit-media://local/?path=' + encodeURIComponent('D:\\ws\\my photo.png'),
    );
  });

  it('adds a cache-busting token when requested', () => {
    expect(mediaAssetUrl('/ws/a.mp4', 7)).toContain('&v=7');
  });
});

describe('MediaViewer — images', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
  });

  it('mounts an <img> pointing at the media protocol and reveals it on load', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'pic.png', originalPath: '/ws/pic.png', kind: 'image' });

    const img = container.querySelector('img.media-preview-img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('cockpit-media://local/?path=');
    expect(img.src).toContain(encodeURIComponent('/ws/pic.png'));
    expect(img.alt).toBe('pic.png');
    expect((container.querySelector('.media-preview-area') as HTMLElement).style.display).toBe('block');

    const status = container.querySelector('.media-preview-status');
    expect(status).toBeTruthy();
    img.dispatchEvent(new Event('load'));
    expect(container.querySelector('.media-preview-status')).toBeNull();
  });

  it('keeps the same element when the same tab is shown again', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'pic.png', originalPath: '/ws/pic.png', kind: 'image' });
    const first = container.querySelector('img');
    viewer.hide();
    viewer.show({ name: 'pic.png', originalPath: '/ws/pic.png', kind: 'image' });
    expect(container.querySelector('img')).toBe(first);
  });

  it('rebuilds when a different file is shown', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'a.png', originalPath: '/ws/a.png', kind: 'image' });
    viewer.show({ name: 'b.png', originalPath: '/ws/b.png', kind: 'image' });
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect((container.querySelector('img') as HTMLImageElement).src).toContain(encodeURIComponent('/ws/b.png'));
  });

  it('shows an error with an external-open action when decoding fails', async () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'broken.png', originalPath: '/ws/broken.png', kind: 'image' });
    (container.querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error'));

    expect(container.querySelector('.media-preview-media')).toBeNull();
    expect(container.querySelector('.media-preview-message')?.textContent).toContain('broken.png');

    (container.querySelector('.media-preview-action') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(mockElectronAPI.shell.openPath).toHaveBeenCalledWith('/ws/broken.png');
  });

  it('clear() unloads the media and hides the surface', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'pic.png', originalPath: '/ws/pic.png', kind: 'image' });
    viewer.clear();
    expect(container.querySelector('img')).toBeNull();
    const area = container.querySelector('.media-preview-area') as HTMLElement;
    expect(area.style.display).toBe('none');
  });

  it('refresh reloads only the file the viewer is showing', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'a.png', originalPath: '/ws/a.png', kind: 'image' });
    const before = (container.querySelector('img') as HTMLImageElement).src;

    viewer.refresh('/ws/other.png');
    expect((container.querySelector('img') as HTMLImageElement).src).toBe(before);

    viewer.refresh('/ws/a.png');
    expect((container.querySelector('img') as HTMLImageElement).src).not.toBe(before);
  });

  it('refresh does not reveal a hidden viewer over a source tab', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'a.png', originalPath: '/ws/a.png', kind: 'image' });
    viewer.hide();

    viewer.refresh('/ws/a.png');
    const area = container.querySelector('.media-preview-area') as HTMLElement;
    expect(area.style.display).toBe('none');
    expect(container.querySelector('img')).toBeTruthy();
  });
});

describe('MediaViewer — video and PDF', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeContainer();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('mounts a controllable <video> and pauses it on hide', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'clip.mp4', originalPath: '/ws/clip.mp4', kind: 'video' });
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video.controls).toBe(true);
    expect(video.src).toContain('cockpit-media://local/?path=');

    viewer.hide();
    expect(video.pause).toHaveBeenCalled();
    expect((container.querySelector('.media-preview-area') as HTMLElement).style.display).toBe('none');
  });

  it('mounts a visible PDF iframe without a loading veil', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'doc.pdf', originalPath: '/ws/doc.pdf', kind: 'pdf' });
    const frame = container.querySelector('iframe.media-preview-frame') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.src).toContain(encodeURIComponent('/ws/doc.pdf'));
    expect(frame.style.visibility).toBe('');
    expect(container.querySelector('.media-preview-status')).toBeNull();
    expect((container.querySelector('.media-preview-area') as HTMLElement).classList.contains('is-pdf')).toBe(true);
  });

  it('explains external-only formats instead of mounting a player', () => {
    const viewer = new MediaViewer(container);
    viewer.show({ name: 'scan.tiff', originalPath: '/ws/scan.tiff', kind: 'unsupported' });
    expect(container.querySelector('img, video, iframe')).toBeNull();
    expect(container.querySelector('.media-preview-message')?.textContent).toContain('cannot be previewed');
  });
});
