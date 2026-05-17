export interface ThemeColors {
  bg: string;
  surface: string;
  panel: string;
  primary: string;
  secondary: string;
  tertiary: string;
  border: string;
}

export const darkTheme: ThemeColors = {
  bg: '#0A0E14',
  surface: '#121820',
  panel: '#1A2430',
  primary: '#C8D6E5',
  secondary: '#78909C',
  tertiary: '#546E7A',
  border: '#2A3A4A',
};

export const lightTheme: ThemeColors = {
  bg: '#f8f8f8',
  surface: '#eeeeee',
  panel: '#e0e0e0',
  primary: '#1a1a1a',
  secondary: '#2a2a2a',
  tertiary: '#6a6a6a',
  border: '#1a1a1a',
};

class Theme {
  private _isDark = true;

  get isDark(): boolean { return this._isDark; }
  get colors(): ThemeColors { return this._isDark ? darkTheme : lightTheme; }

  setDark(dark: boolean): void {
    this._isDark = dark;
    this.apply();
  }

  toggle(): void {
    this._isDark = !this._isDark;
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
