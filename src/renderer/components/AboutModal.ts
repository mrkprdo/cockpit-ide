const badgeSrc = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNzEiIGhlaWdodD0iMjAiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0iREVTSUdOLk1EIEFydCBOb3V2ZWF1IMOXIEZsb2F0aW5nIj4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYnM2IiB4Mj0iMCIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iLjciLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIuMSIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIuMSIvPgogICAgICA8c3RvcCBvZmZzZXQ9Ii45IiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjAiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9Ii4xIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGNsaXBQYXRoIGlkPSJicjYiPgogICAgICA8cmVjdCB3aWR0aD0iMjcxIiBoZWlnaHQ9IjIwIiByeD0iMyIgZmlsbD0iI2ZmZiIvPgogICAgPC9jbGlwUGF0aD4KICAgIDxnIGNsaXAtcGF0aD0idXJsKCNicjYpIj4KICAgICAgPHJlY3Qgd2lkdGg9Ijc5IiBoZWlnaHQ9IjIwIiBmaWxsPSIjNTU1Ii8+CiAgICAgIDxyZWN0IHg9Ijc5IiB3aWR0aD0iMTkyIiBoZWlnaHQ9IjIwIiBmaWxsPSIjMWExYTFhIi8+CiAgICAgIDxyZWN0IHdpZHRoPSIyNzEiIGhlaWdodD0iMjAiIGZpbGw9InVybCgjYnM2KSIvPgogICAgPC9nPgogICAgPGcgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InN5c3RlbS11aSxzYW5zLXNlcmlmIiBmb250LXNpemU9IjExIiBmb250LXdlaWdodD0iNjAwIj4KICAgICAgPHRleHQgeD0iMzkuNSIgeT0iMTQiPkRFU0lHTi5NRDwvdGV4dD4KICAgICAgPHRleHQgeD0iMTc1IiB5PSIxNCI+QXJ0IE5vdXZlYXUgw5cgRmxvYXRpbmc8L3RleHQ+CiAgICA8L2c+CiAgPC9zdmc+';

export class AboutModal {
  private el: HTMLDivElement;
  private overlay: HTMLDivElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:none;align-items:center;justify-content:center';

    this.el = document.createElement('div');
    this.el.className = 'welcome-modal';
    this.el.innerHTML = `
      <div class="welcome-header">
        <div class="welcome-title">COCKPIT IDE</div>
        <div class="welcome-sub">v1.0.0</div>
      </div>
      <div class="welcome-body" style="padding-top:0;text-align:center">
        <div style="padding:12px 0;font-size:12px;font-family:var(--font);color:var(--secondary);line-height:1.6">
          A canvas-based IDE with AI copilot.
        </div>
        <img src="${badgeSrc}" alt="DESIGN.MD Art Nouveau × Floating" style="display:inline-block;margin:4px 0 12px">
        <div style="font-size:10px;font-family:var(--font);color:var(--tertiary);margin-bottom:12px">
          <span class="about-link" id="about-design-link" style="color:var(--accent,#00E5FF);cursor:pointer;text-decoration:underline">design.md</span>
        </div>
        <button class="welcome-btn" id="about-close">Close</button>
      </div>
    `;

    this.overlay.appendChild(this.el);
    document.body.appendChild(this.overlay);

    this.el.querySelector('#about-close')?.addEventListener('click', () => this.close());
    this.el.querySelector('#about-design-link')?.addEventListener('click', () => {
      window.electronAPI?.shell.openExternal('https://www.usedesign.md/?mash=1&p=noir&c=Art+Nouveau&s=Floating&b=dashed+border&r=8px&f=%27Space+Mono%27%2C+%27Courier+New%27%2C+monospace&sh=rgba%280%2C0%2C0%2C0.06%29+0+2px+8px%2C+rgba%280%2C0%2C0%2C0.04%29+0+4px+16px&shs=noir&mode=light');
    });
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
  }

  open(): void { this.overlay.style.display = 'flex'; }
  private close(): void { this.overlay.style.display = 'none'; }
}
