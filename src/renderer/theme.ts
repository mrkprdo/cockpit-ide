export interface ThemeColors {
  bg: string;
  surface: string;
  panel: string;
  primary: string;
  secondary: string;
  tertiary: string;
  border: string;
}

export const defaultDarkTheme: ThemeColors = {
  bg: '#161C24',
  surface: '#1C2538',
  panel: '#243248',
  primary: '#C8D6E5',
  secondary: '#78909C',
  tertiary: '#546E7A',
  border: '#2A3A4A',
};

export const defaultLightTheme: ThemeColors = {
  bg: '#f8f8f8',
  surface: '#eeeeee',
  panel: '#e0e0e0',
  primary: '#1a1a1a',
  secondary: '#2a2a2a',
  tertiary: '#6a6a6a',
  border: '#1a1a1a',
};

export const monokaiDarkTheme: ThemeColors = {
  bg: '#272822',
  surface: '#2e2e29',
  panel: '#383830',
  primary: '#f8f8f2',
  secondary: '#a09f8c',
  tertiary: '#75715e',
  border: '#49483e',
};

export const monokaiLightTheme: ThemeColors = {
  bg: '#e2dfd0',
  surface: '#d6d3c4',
  panel: '#cbc8b8',
  primary: '#272822',
  secondary: '#5e5c50',
  tertiary: '#8c8878',
  border: '#9c9988',
};

const palettes: Record<string, Record<string, ThemeColors>> = {
  default: { dark: defaultDarkTheme, light: defaultLightTheme },
  monokai: { dark: monokaiDarkTheme, light: monokaiLightTheme },
};

class Theme {
  private _base: 'default' | 'monokai' = 'default';
  private _mode: 'dark' | 'light' = 'dark';

  get base(): string { return this._base; }
  get mode(): string { return this._mode; }
  get themeName(): string { return `${this._base}-${this._mode}`; }
  get isDark(): boolean { return this._mode === 'dark'; }
  get colors(): ThemeColors { return palettes[this._base]?.[this._mode] || defaultDarkTheme; }

  setBase(base: string): void {
    if (palettes[base]) {
      this._base = base as 'default' | 'monokai';
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
      this._base = base as 'default' | 'monokai';
      this._mode = mode as 'dark' | 'light';
    } else if (palettes[base]?.[this._mode]) {
      this._base = base as 'default' | 'monokai';
    } else {
      const mapped = this.parseLegacy(base);
      if (mapped && palettes[mapped.base]?.[mapped.mode]) {
        this._base = mapped.base as 'default' | 'monokai';
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
  }
}

export const theme = new Theme();
theme.apply();
