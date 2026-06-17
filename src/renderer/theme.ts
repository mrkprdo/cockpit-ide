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

export const defaultDarkTheme: ThemeColors = {
  bg: '#161C24',
  surface: '#1C2538',
  panel: '#243248',
  primary: '#C8D6E5',
  secondary: '#78909C',
  tertiary: '#6E8A99',
  border: '#2A3A4A',
  accent: '#4B9EB5',
  accent2: '#7B6FA0',
  green: '#4C9A6E',
  amber: '#C68B00',
  red: '#D44F4F',
  onAccent: 'oklch(97% 0.006 20)',
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
  accent: '#2A7A8C',
  accent2: '#5A4F7A',
  green: '#3A7A56',
  amber: '#9A6B00',
  red: '#C04040',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.35)',
};

export const monokaiDarkTheme: ThemeColors = {
  bg: '#272822',
  surface: '#2e2e29',
  panel: '#383830',
  primary: '#f8f8f2',
  secondary: '#a09f8c',
  tertiary: '#75715e',
  border: '#49483e',
  accent: '#A6E22E',
  accent2: '#F92672',
  green: '#86C020',
  amber: '#E6DB74',
  red: '#F92672',
  onAccent: '#272822',
  scrim: 'rgba(0,0,0,0.55)',
};

export const monokaiLightTheme: ThemeColors = {
  bg: '#e2dfd0',
  surface: '#d6d3c4',
  panel: '#cbc8b8',
  primary: '#272822',
  secondary: '#5e5c50',
  tertiary: '#8c8878',
  border: '#9c9988',
  accent: '#66A622',
  accent2: '#C8145A',
  green: '#5A8A30',
  amber: '#B8990A',
  red: '#C8145A',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.3)',
};

export const idolDarkTheme: ThemeColors = {
  bg: '#040408',
  surface: '#1c2222',
  panel: '#101418',
  primary: '#d0d0d0',
  secondary: '#a0a0b8',
  tertiary: '#5A6A6A',
  border: '#5a4a3a',
  accent: '#e86a6a',
  accent2: '#e870b0',
  green: '#4C9A6E',
  amber: '#D4A000',
  red: '#e86a6a',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.6)',
};

export const idolLightTheme: ThemeColors = {
  bg: '#f0fcfc',
  surface: '#e8eaea',
  panel: '#e4e8e8',
  primary: '#2a2a2a',
  secondary: '#3a3a4a',
  tertiary: '#6A8A7A',
  border: '#b8a088',
  accent: '#e85a5a',
  accent2: '#e060a0',
  green: '#3A7A56',
  amber: '#9A6B00',
  red: '#e85a5a',
  onAccent: '#ffffff',
  scrim: 'rgba(0,0,0,0.3)',
};

const palettes: Record<string, Record<string, ThemeColors>> = {
  default: { dark: defaultDarkTheme, light: defaultLightTheme },
  monokai: { dark: monokaiDarkTheme, light: monokaiLightTheme },
  idol: { dark: idolDarkTheme, light: idolLightTheme },
};

class Theme {
  private _base: 'default' | 'monokai' | 'idol' = 'default';
  private _mode: 'dark' | 'light' = 'dark';

  get base(): string { return this._base; }
  get mode(): string { return this._mode; }
  get themeName(): string { return `${this._base}-${this._mode}`; }
  get isDark(): boolean { return this._mode === 'dark'; }
  get colors(): ThemeColors { return palettes[this._base]?.[this._mode] || defaultDarkTheme; }

  setBase(base: string): void {
    if (palettes[base]) {
      this._base = base as 'default' | 'monokai' | 'idol';
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
      this._base = base as 'default' | 'monokai' | 'idol';
      this._mode = mode as 'dark' | 'light';
    } else if (palettes[base]?.[this._mode]) {
      this._base = base as 'default' | 'monokai' | 'idol';
    } else {
      const mapped = this.parseLegacy(base);
      if (mapped && palettes[mapped.base]?.[mapped.mode]) {
        this._base = mapped.base as 'default' | 'monokai' | 'idol';
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
  }
}

export const theme = new Theme();
theme.apply();
