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
      <div class="welcome-body" style="padding-top:0">
        <div style="padding:12px 0;font-size:12px;font-family:var(--font);color:var(--secondary);line-height:1.6">
          A canvas-based IDE with AI copilot.<br>
          Art Nouveau × Floating design.
        </div>
        <button class="welcome-btn" id="about-close" style="margin-top:8px">Close</button>
      </div>
    `;

    this.overlay.appendChild(this.el);
    document.body.appendChild(this.overlay);

    this.el.querySelector('#about-close')?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
  }

  open(): void { this.overlay.style.display = 'flex'; }
  private close(): void { this.overlay.style.display = 'none'; }
}
