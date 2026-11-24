import { describe, it, expect } from 'vitest';
import { extensionOf, isMediaPath, mediaKindForPath, mediaMimeType } from './media';

describe('shared/media — extension mapping', () => {
  it('extracts a lower-cased extension from Windows and POSIX paths', () => {
    expect(extensionOf('D:\\ws\\photos\\Sunset.JPG')).toBe('jpg');
    expect(extensionOf('/ws/photos/sunset.png')).toBe('png');
    expect(extensionOf('/ws/README')).toBe('');
    expect(extensionOf('/ws/.gitignore')).toBe('gitignore');
  });

  it('maps previewable images, video and PDF', () => {
    expect(mediaKindForPath('a.png')).toBe('image');
    expect(mediaKindForPath('a.JPEG')).toBe('image');
    expect(mediaKindForPath('a.webp')).toBe('image');
    expect(mediaKindForPath('a.gif')).toBe('image');
    expect(mediaKindForPath('a.avif')).toBe('image');
    expect(mediaKindForPath('a.mp4')).toBe('video');
    expect(mediaKindForPath('a.webm')).toBe('video');
    expect(mediaKindForPath('a.mov')).toBe('video');
    expect(mediaKindForPath('a.pdf')).toBe('pdf');
  });

  it('routes undecodable media to the external-app tab', () => {
    expect(mediaKindForPath('scan.tiff')).toBe('unsupported');
    expect(mediaKindForPath('photo.heic')).toBe('unsupported');
    expect(mediaKindForPath('clip.avi')).toBe('unsupported');
  });

  it('leaves source files on the editor path', () => {
    expect(mediaKindForPath('main.ts')).toBeNull();
    expect(mediaKindForPath('README.md')).toBeNull();
    expect(mediaKindForPath('logo.svg')).toBeNull();
    expect(mediaKindForPath('Makefile')).toBeNull();
    expect(isMediaPath('main.ts')).toBe(false);
    expect(isMediaPath('photo.png')).toBe(true);
  });
});

describe('shared/media — protocol MIME policy', () => {
  it('returns the served MIME type for previewable files', () => {
    expect(mediaMimeType('a.png')).toBe('image/png');
    expect(mediaMimeType('a.jpg')).toBe('image/jpeg');
    expect(mediaMimeType('a.mp4')).toBe('video/mp4');
    expect(mediaMimeType('a.webm')).toBe('video/webm');
    expect(mediaMimeType('a.pdf')).toBe('application/pdf');
  });

  it('refuses external-only, source and HTML/JS files', () => {
    expect(mediaMimeType('scan.tiff')).toBeNull();
    expect(mediaMimeType('main.ts')).toBeNull();
    expect(mediaMimeType('index.html')).toBeNull();
    expect(mediaMimeType('app.js')).toBeNull();
  });
});
