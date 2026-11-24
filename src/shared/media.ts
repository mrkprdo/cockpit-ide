// Media formats the Explorer previews in-app. Shared by the renderer (which
// picks the viewer for a tab) and the main-process cockpit-media:// handler
// (which decides the MIME type and refuses everything else).
//
// Three tiers:
//   - previewable images/video/PDF -> a viewer tab backed by cockpit-media://
//   - recognizable but undecodable formats (TIFF, HEIC, AVI, ...) -> a viewer
//     tab that explains the limitation and offers "open with default app"
//   - everything else -> the existing text editor path, unchanged.
//
// SVG deliberately stays in the third tier: in an IDE it is source first, and
// auto-previewing it would take the editor away from anyone opening it to edit.

export type MediaKind = 'image' | 'video' | 'pdf';

/** Viewer kinds. `unsupported` still gets a tab — never binary text in Monaco. */
export type MediaViewKind = MediaKind | 'unsupported';

const KIND_BY_EXT: Record<string, MediaKind> = {
  // images Chromium can decode
  png: 'image', jpg: 'image', jpeg: 'image', jpe: 'image', jfif: 'image',
  gif: 'image', webp: 'image', bmp: 'image', ico: 'image', avif: 'image',
  // video containers Chromium can decode (codec permitting)
  mp4: 'video', m4v: 'video', webm: 'video', ogv: 'video', mov: 'video', mkv: 'video',
  // PDF renders through Electron's built-in viewer
  pdf: 'pdf',
};

/** Recognized as media, but Chromium cannot render it — external app fallback. */
const UNDECODABLE_EXTS = new Set([
  'tif', 'tiff', 'heic', 'heif',
  'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'm2ts', '3gp',
]);

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
};

/** Lower-case extension without the dot; '' when the name has none. */
export function extensionOf(filePath: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Viewer kind for a path, or null when the file should open in the editor. */
export function mediaKindForPath(filePath: string): MediaViewKind | null {
  const ext = extensionOf(filePath);
  return KIND_BY_EXT[ext] ?? (UNDECODABLE_EXTS.has(ext) ? 'unsupported' : null);
}

/** True when the file is a media tab of any tier (including external-only). */
export function isMediaPath(filePath: string): boolean {
  return mediaKindForPath(filePath) !== null;
}

/**
 * MIME type for a previewable file, or null when cockpit-media:// must not
 * serve it. The protocol only ever streams these three families: the renderer
 * never needs HTML/JS/text through the scheme, so a workspace file cannot use
 * it to smuggle active content past the CSP.
 */
export function mediaMimeType(filePath: string): string | null {
  if (mediaKindForPath(filePath) === null) return null;
  return MIME_BY_EXT[extensionOf(filePath)] ?? null;
}
