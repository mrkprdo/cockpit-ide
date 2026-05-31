export class StatusBar {
  private sbZoom: HTMLSpanElement | null = null;
  private sbLocked: HTMLSpanElement | null = null;
  private sbWorkspace: HTMLSpanElement | null = null;
  private lockToggleCb: (() => void) | null = null;
  private fitAllCb: (() => void) | null = null;

  init(): void {
    const sb = document.getElementById('statusbar');
    if (!sb || sb.children.length > 0) return;

    const sep = (): HTMLSpanElement => {
      const s = document.createElement('span');
      s.className = 'status-sep';
      sb.appendChild(s);
      return s;
    };

    this.sbZoom = document.createElement('span');
    this.sbZoom.className = 'status-item';
    sb.appendChild(this.sbZoom);
    this.sbZoom.addEventListener('click', () => this.lockToggleCb?.());

    this.sbLocked = document.createElement('span');
    this.sbLocked.className = 'status-item status-locked';
    this.sbLocked.textContent = 'Locked';
    this.sbLocked.style.display = 'none';
    sb.appendChild(this.sbLocked);

    this.sbWorkspace = document.createElement('span');
    this.sbWorkspace.className = 'status-item';
    sb.appendChild(this.sbWorkspace);

    const fillL = document.createElement('span');
    fillL.className = 'status-spacer';
    sb.appendChild(fillL);

    const center = document.createElement('span');
    center.id = 'statusbar-center';
    sb.appendChild(center);

    const fillR = document.createElement('span');
    fillR.className = 'status-spacer';
    sb.appendChild(fillR);

    sep();
    const viewAllBtn = document.createElement('button');
    viewAllBtn.className = 'status-btn';
    viewAllBtn.textContent = 'view all';
    viewAllBtn.addEventListener('click', () => this.fitAllCb?.());
    sb.appendChild(viewAllBtn);
  }

  update(locked: boolean, scale: number, workspaceName: string, onLockToggle: (() => void) | null, fitAll: () => void): void {
    this.lockToggleCb = onLockToggle;
    this.fitAllCb = fitAll;
    if (this.sbZoom) {
      const icon = locked
        ? '<svg class="status-locked" width="14" height="14" viewBox="0 0 512 512" style="vertical-align:middle;fill:currentColor;cursor:pointer"><path d="M368 192h-16v-80a96 96 0 10-192 0v80h-16a64.07 64.07 0 00-64 64v176a64.07 64.07 0 0064 64h224a64.07 64.07 0 0064-64V256a64.07 64.07 0 00-64-64zm-48 0H192v-80a64 64 0 11128 0z"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 512 512" style="vertical-align:middle;fill:var(--tertiary);cursor:pointer"><path d="M368 192H192v-80a64 64 0 11128 0 16 16 0 0032 0 96 96 0 10-192 0v80h-16a64.07 64.07 0 00-64 64v176a64.07 64.07 0 0064 64h224a64.07 64.07 0 0064-64V256a64.07 64.07 0 00-64-64z"/></svg>';
      this.sbZoom.innerHTML = `Zoom: ${Math.round(scale * 100)}% ${icon}`;
    }
    if (this.sbLocked) this.sbLocked.style.display = 'none';
    if (this.sbWorkspace) this.sbWorkspace.textContent = workspaceName;
  }
}
