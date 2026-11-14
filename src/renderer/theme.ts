export interface ThemeColors {
  bg: string;
  surface: string;
  panel: string;
  primary: string;
  secondary: string;
  tertiary: string;
  border: string;
  accent: string;
  accent2: string;
  green: string;
  amber: string;
  red: string;
  onAccent: string;
  scrim: string;
}

/* Contrast contract (asserted in theme.test.ts):
   primary/secondary/tertiary ≥4.5:1 on bg *and* surface, accent/onAccent ≥4.5,
   accent2 ≥4.5 on bg. onAccent is the ink for accent/amber/red fills, so it is
   a near-black in every dark palette (white only where the fill is dark). */
export const defaultDarkTheme: ThemeColors = {
  bg: '#161C24',
  surface: '#1C2538',
  panel: '#243248',
  primary: '#C8D6E5',
  secondary: '#78909C',
  tertiary: '#7894A3', // WCAG AA vs surface (#1C2538): 4.79:1 — was #6E8A99 at 4.20:1
  border: '#2A3A4A',
  accent: '#4B9EB5',
  accent2: '#9A8CC4', // 4.26:1 on --panel, 5.65:1 on bg — was #7B6FA0 at 2.85/3.77
  green: '#4C9A6E',
  amber: '#C68B00',
  red: '#D44F4F',
  onAccent: '#0B1118', // 6.19 on accent, 6.41 on amber, 4.54 on red
  scrim: 'rgba(8,14,22,0.72)',
};

export const defaultLightTheme: ThemeColors = {
  bg: '#f8f8f8',
  surface: '#eeeeee',
  panel: '#e0e0e0',
  primary: '#1a1a1a',
  secondary: '#3a3a3a',
  tertiary: '#6a6a6a',
  border: '#bbbbbb',
  accent: '#24707F', // 4.89:1 on surface — was #2A7A8C at 4.25
  accent2: '#5A4F7A',
  green: '#2F6647',
  amber: '#7E5600', // 6.53:1 with white onAccent
  red: '#B03030',   // 6.34:1 with white onAccent
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.35)',
};

export const monokaiDarkTheme: ThemeColors = {
  bg: '#272822',
  surface: '#2e2e29',
  panel: '#383830',
  primary: '#f8f8f2',
  secondary: '#a09f8c',
  tertiary: '#9B957F', // 4.55:1 on surface — was #75715e at 2.78
  border: '#49483e',
  accent: '#A6E22E',
  accent2: '#FF6D9C', // 4.46:1 on panel, 5.61:1 on bg — was #F92672 at 3.12/3.93
  green: '#86C020',
  amber: '#E6DB74',
  red: '#FF6D9C',
  onAccent: '#272822',
  scrim: 'rgba(0,0,0,0.55)',
};

export const monokaiLightTheme: ThemeColors = {
  bg: '#e2dfd0',
  surface: '#d6d3c4',
  panel: '#cbc8b8',
  primary: '#272822',
  secondary: '#4E4C42',
  tertiary: '#5E5B49', // 4.55:1 on surface — was #8c8878 at 2.37
  border: '#9c9988',
  accent: '#3D650F', // 4.56:1 on surface, 6.85:1 against white — was #66A622 at 1.98
  accent2: '#A31146', // 5.76:1 on bg — was #C8145A at 4.24
  green: '#3D650F',
  amber: '#7A6200',
  red: '#A31146',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.3)',
};

export const idolDarkTheme: ThemeColors = {
  bg: '#040408',
  surface: '#1c2222',
  panel: '#101418',
  primary: '#d0d0d0',
  secondary: '#a0a0b8',
  tertiary: '#8A9A9A', // 5.51:1 on surface — was #5A6A6A at 2.85
  border: '#5a4a3a',
  accent: '#e86a6a',
  accent2: '#e870b0',
  green: '#4C9A6E',
  amber: '#D4A000',
  red: '#e86a6a',
  onAccent: '#0B1118', // 6.05 on accent, 7.97 on amber, 6.05 on red
  scrim: 'rgba(0,0,0,0.6)',
};

export const idolLightTheme: ThemeColors = {
  bg: '#f0fcfc',
  surface: '#e8eaea',
  panel: '#e4e8e8',
  primary: '#2a2a2a',
  secondary: '#3a3a4a',
  tertiary: '#4E6B5C', // 4.85:1 on surface — was #6A8A7A at 3.14
  border: '#b8a088',
  accent: '#C42B2B', // 4.66:1 on surface, 5.63:1 against white — was #e85a5a at 2.88
  accent2: '#B02A6E', // 5.89:1 on bg — was #e060a0 at 3.15
  green: '#2F6647',
  amber: '#7E5600',
  red: '#C42B2B',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.3)',
};

export const carbonDarkTheme: ThemeColors = {
  bg: '#000000',
  surface: '#0A0A0A',
  panel: '#141414',
  primary: '#E6E6E6',
  secondary: '#9A9A9A',
  tertiary: '#7E7E7E', // 4.88:1 on surface — was #6E6E6E at 3.88
  border: '#262626',
  accent: '#FF7A1A',
  accent2: '#FFA94D',
  green: '#4C9A6E',
  amber: '#D4A000',
  red: '#D44F4F',
  onAccent: '#0B1118', // 7.27 on accent, 7.97 on amber, 4.54 on red
  scrim: 'rgba(0,0,0,0.85)',
};

export const carbonLightTheme: ThemeColors = {
  bg: '#d5d7da',
  surface: '#c9cbd0',
  panel: '#bdc0c6',
  primary: '#1c1f24',
  secondary: '#3f444c',
  tertiary: '#4D525A', // 4.85:1 on surface — was #6b727c at 2.99
  border: '#a4a9b0',
  accent: '#8B4100', // 4.53:1 on surface, 7.36:1 against white — was #E86A00 at 1.99
  accent2: '#6A4800', // 5.73:1 on bg, 4.54:1 on panel — was #FF8C33 at 1.43/1.27
  green: '#2F6647',
  amber: '#7E5600',
  red: '#B03030',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.35)',
};

export const alienDarkTheme: ThemeColors = {
  bg: '#394330',
  surface: '#45523A',
  panel: '#406059',
  primary: '#EDF2E6',
  secondary: '#C6D4BC', // 5.37:1 on surface — was #A9BD9E at 4.15
  tertiary: '#B6C3AF', // 4.53:1 on surface — was #7E8F76 at 2.41
  border: '#54684B',
  accent: '#AFCE8D', // 4.77:1 on surface — was #A1C27F at 4.18
  accent2: '#F2C9A8', // 4.51:1 on panel, 6.78:1 on bg — was #D7894E at 2.50/3.75
  green: '#AFCE8D',
  amber: '#D9974E',
  red: '#E08A7B',
  onAccent: '#22301F',
  scrim: 'rgba(24,30,20,0.78)',
};

export const alienLightTheme: ThemeColors = {
  bg: '#F4F7EF',
  surface: '#E8EEDE',
  panel: '#DDE8D2',
  primary: '#2E3A2A',
  secondary: '#455A4F',
  tertiary: '#5A6B54', // 4.83:1 on surface — was #74886D at 3.23
  border: '#C2CEB4',
  accent: '#44632E', // 5.77:1 on surface — was #5E8540 at 3.61
  accent2: '#8F5220', // 5.71:1 on bg — was #B06A2E at 3.92
  green: '#44632E',
  amber: '#7E5600',
  red: '#A8463C',
  onAccent: '#ffffff',
  scrim: 'rgba(28,36,24,0.35)',
};

const palettes: Record<string, Record<string, ThemeColors>> = {
  default: { dark: defaultDarkTheme, light: defaultLightTheme },
  monokai: { dark: monokaiDarkTheme, light: monokaiLightTheme },
  idol: { dark: idolDarkTheme, light: idolLightTheme },
  carbon: { dark: carbonDarkTheme, light: carbonLightTheme },
  alien: { dark: alienDarkTheme, light: alienLightTheme },
};

type ThemeBase = 'default' | 'monokai' | 'idol' | 'carbon' | 'alien';

class Theme {
  private _base: ThemeBase = 'default';
  private _mode: 'dark' | 'light' = 'dark';

  get base(): string { return this._base; }
  get mode(): string { return this._mode; }
  get themeName(): string { return `${this._base}-${this._mode}`; }
  get isDark(): boolean { return this._mode === 'dark'; }
  get colors(): ThemeColors { return palettes[this._base]?.[this._mode] || defaultDarkTheme; }

  setBase(base: string): void {
    if (palettes[base]) {
      this._base = base as ThemeBase;
      this.apply();
    }
  }

  setMode(mode: string): void {
    if (mode === 'dark' || mode === 'light') {
      this._mode = mode;
      this.apply();
    }
  }

  private parseLegacy(name: string): { base: string; mode: string } | null {
    const legacy: Record<string, { base: string; mode: string }> = {
      'dark': { base: 'default', mode: 'dark' },
      'light': { base: 'default', mode: 'light' },
      'monokai': { base: 'monokai', mode: 'dark' },
    };
    return legacy[name] || null;
  }

  setTheme(base: string, mode?: string): void {
    if (mode && palettes[base]?.[mode]) {
      this._base = base as ThemeBase;
      this._mode = mode as 'dark' | 'light';
    } else if (palettes[base]?.[this._mode]) {
      this._base = base as ThemeBase;
    } else {
      const mapped = this.parseLegacy(base);
      if (mapped && palettes[mapped.base]?.[mapped.mode]) {
        this._base = mapped.base as ThemeBase;
        this._mode = mapped.mode as 'dark' | 'light';
      }
    }
    this.apply();
  }

  setDark(dark: boolean): void {
    this._base = 'default';
    this._mode = dark ? 'dark' : 'light';
    this.apply();
  }

  toggle(): void {
    this._mode = this._mode === 'dark' ? 'light' : 'dark';
    this.apply();
  }

  apply(): void {
    const c = this.colors;
    const root = document.documentElement;
    root.style.setProperty('--bg', c.bg);
    root.style.setProperty('--surface', c.surface);
    root.style.setProperty('--panel', c.panel);
    root.style.setProperty('--primary', c.primary);
    root.style.setProperty('--secondary', c.secondary);
    root.style.setProperty('--tertiary', c.tertiary);
    root.style.setProperty('--border', c.border);
    root.style.setProperty('--accent', c.accent);
    root.style.setProperty('--accent2', c.accent2);
    root.style.setProperty('--green', c.green);
    root.style.setProperty('--amber', c.amber);
    root.style.setProperty('--red', c.red);
    root.style.setProperty('--onAccent', c.onAccent);
    root.style.setProperty('--scrim', c.scrim);
    // Native chrome (select popups, scrollbars) follows the active mode; the
    // attribute lets styles-base.css pick mode-specific tokens (--border-strong).
    root.style.setProperty('color-scheme', this._mode);
    root.dataset.themeMode = this._mode;
  }
}

export const theme = new Theme();
theme.apply();
