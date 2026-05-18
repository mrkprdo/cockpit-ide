export class AboutModal {
  private el: HTMLDivElement;
  private overlay: HTMLDivElement;
  private onCloseCb: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.display = 'none';

    this.el = document.createElement('div');
    this.el.className = 'about-modal';

    const v = (window as any).electronAPI?.versions || {};
    const specs: { key: string; val: string }[] = [
      { key: 'VERSION', val: '0.0.1' },
      ...(v.electron ? [{ key: 'ELECTRON', val: v.electron.split('.')[0] }] : []),
      ...(v.node ? [{ key: 'NODE', val: v.node.split('.')[0] }] : []),
    ];
    
    this.el.innerHTML = `
      <div class="about-head">
        <div class="about-name">COCKPIT IDE</div>
        <div class="about-tagline">The IDE for developers who thinks spatialy</div>
      </div>
      <div class="about-sep"></div>
      <div class="about-specs">
        ${specs.map(s =>
          `<div class="about-spec">
            <span class="about-spec-key">${s.key}</span>
            <span class="about-spec-val">${s.val}</span>
          </div>`
        ).join('')}
      </div>
      <div class="about-sep"></div>
      <div class="about-foot">
        <span class="about-link" id="about-design-link" style="cursor:pointer">design.md</span>
        <button class="about-close-btn" id="about-close">CLOSE</button>
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

  open(onClose?: () => void): void {
    this.onCloseCb = onClose ?? null;
    this.overlay.style.display = 'flex';
  }
  private close(): void {
    this.overlay.style.display = 'none';
    this.onCloseCb?.();
    this.onCloseCb = null;
  }
}
