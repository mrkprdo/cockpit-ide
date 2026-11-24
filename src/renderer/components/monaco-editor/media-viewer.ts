// In-app viewers for Explorer media tabs: image, video and PDF share one
// surface below the tab bar. Loaded through cockpit-media:// (streamed by the
// main process, workspace-scoped) rather than the fs text bridge.
//
// One element is kept while a tab stays active so hide/show (switching tabs and
// back) preserves a video's position; switching to a different file rebuilds.

import type { MediaViewKind } from '../../../shared/media';
import { showToast } from '../toast';

export interface MediaTabInfo {
  name: string;
  originalPath: string;
  kind: MediaViewKind;
}

export function mediaAssetUrl(filePath: string, token = 0): string {
  const cacheBust = token ? `&v=${token}` : '';
  return `cockpit-media://local/?path=${encodeURIComponent(filePath)}${cacheBust}`;
}

export class MediaViewer {
  private el: HTMLDivElement;
  private bodyEl: HTMLDivElement;
  private mediaEl: HTMLImageElement | HTMLVideoElement | HTMLIFrameElement | null = null;
  private current: MediaTabInfo | null = null;
  private visible = false;
  private token = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'media-preview-area';

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'media-preview-body';
    this.el.appendChild(this.bodyEl);
    parent.appendChild(this.el);
  }

  show(tab: MediaTabInfo): void {
    const same = this.current
      && this.current.originalPath === tab.originalPath
      && this.current.kind === tab.kind;
    if (same) {
      this.el.style.display = 'block';
      this.visible = true;
      return;
    }
    this.clear();
    this.current = tab;
    this.el.style.display = 'block';
    this.visible = true;
    this.el.classList.toggle('is-pdf', tab.kind === 'pdf');

    if (tab.kind === 'unsupported') {
      this.showError(tab, 'This format cannot be previewed in Cockpit.');
      return;
    }
    // The PDF viewer paints its own chrome and its iframe load timing is
    // extension-controlled — show it immediately rather than risk a veil that
    // never lifts. Images/video have dependable load events.
    if (tab.kind === 'pdf') {
      this.mountPdf(tab);
      return;
    }
    this.mountStatus();
    if (tab.kind === 'image') this.mountImage(tab);
    else this.mountVideo(tab);
  }

  /** Hide without unloading — switching back keeps the video where it was. */
  hide(): void {
    this.el.style.display = 'none';
    this.visible = false;
    if (this.mediaEl instanceof HTMLVideoElement) this.mediaEl.pause();
  }

  /** Re-read the file on disk (watcher reported a change). */
  refresh(filePath?: string): void {
    const tab = this.current;
    if (!tab) return;
    if (filePath && tab.originalPath !== filePath) return;
    const wasVisible = this.visible;
    this.clear();
    this.show(tab);
    // A refresh must not pop a hidden tab's viewer over the active source tab.
    if (!wasVisible) this.hide();
  }

  destroy(): void {
    this.clear();
    this.el.remove();
  }

  /** Unload and reset (tab closed / no tabs left). */
  clear(): void {
    this.removeMedia();
    this.bodyEl.innerHTML = '';
    this.current = null;
    this.visible = false;
    this.el.style.display = 'none';
    this.el.classList.remove('is-pdf');
  }

  private removeMedia(): void {
    if (this.mediaEl instanceof HTMLVideoElement) this.mediaEl.pause();
    if (this.mediaEl) {
      this.mediaEl.removeAttribute('src');
      this.mediaEl.remove();
    }
    this.mediaEl = null;
  }

  private mountStatus(): void {
    const status = document.createElement('div');
    status.className = 'media-preview-status';
    status.textContent = 'Loading preview…';
    this.bodyEl.appendChild(status);
  }

  private reveal(el: HTMLElement): void {
    if (this.mediaEl !== el) return; // a stale load finished after a tab switch
    this.bodyEl.querySelector('.media-preview-status')?.remove();
    el.style.visibility = '';
  }

  private mountImage(tab: MediaTabInfo): void {
    const img = document.createElement('img');
    img.className = 'media-preview-media media-preview-img';
    img.alt = tab.name;
    img.decoding = 'async';
    img.style.visibility = 'hidden';
    img.addEventListener('load', () => this.reveal(img));
    img.addEventListener('error', () => this.previewFailed(tab));
    img.src = mediaAssetUrl(tab.originalPath, ++this.token);
    this.bodyEl.appendChild(img);
    this.mediaEl = img;
  }

  private mountVideo(tab: MediaTabInfo): void {
    const video = document.createElement('video');
    video.className = 'media-preview-media media-preview-video';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.style.visibility = 'hidden';
    video.addEventListener('loadedmetadata', () => this.reveal(video));
    video.addEventListener('error', () => this.previewFailed(tab));
    video.src = mediaAssetUrl(tab.originalPath, ++this.token);
    this.bodyEl.appendChild(video);
    this.mediaEl = video;
  }

  private mountPdf(tab: MediaTabInfo): void {
    const frame = document.createElement('iframe');
    frame.className = 'media-preview-media media-preview-frame';
    frame.title = tab.name;
    frame.src = mediaAssetUrl(tab.originalPath, ++this.token);
    this.bodyEl.appendChild(frame);
    this.mediaEl = frame;
  }

  private previewFailed(tab: MediaTabInfo): void {
    if (this.current !== tab) return;
    this.removeMedia();
    this.bodyEl.innerHTML = '';
    this.showError(tab, 'The file could not be decoded by the built-in viewer.');
  }

  private showError(tab: MediaTabInfo, message: string): void {
    const wrap = document.createElement('div');
    wrap.className = 'media-preview-message';

    const title = document.createElement('div');
    title.className = 'media-preview-message-title';
    title.textContent = tab.name;

    const detail = document.createElement('div');
    detail.className = 'media-preview-message-detail';
    detail.textContent = message;

    const action = document.createElement('button');
    action.className = 'media-preview-action';
    action.type = 'button';
    action.textContent = 'Open with default app';
    action.addEventListener('click', async () => {
      const ok = await window.electronAPI?.shell.openPath(tab.originalPath);
      if (!ok) showToast(`Could not open ${tab.name} with the default app.`, 'error');
    });

    wrap.appendChild(title);
    wrap.appendChild(detail);
    wrap.appendChild(action);
    this.bodyEl.appendChild(wrap);
  }
}
