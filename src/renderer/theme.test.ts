import { describe, it, expect, beforeEach } from 'vitest';
import { theme, defaultDarkTheme, defaultLightTheme, monokaiDarkTheme, monokaiLightTheme, idolDarkTheme, idolLightTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    theme.setDark(true);
  });

  it('starts in default-dark mode', () => {
    expect(theme.base).toBe('default');
    expect(theme.mode).toBe('dark');
    expect(theme.isDark).toBe(true);
  });

  it('returns default-dark color palette by default', () => {
    expect(theme.colors).toBe(defaultDarkTheme);
    expect(theme.colors.bg).toBe('#161C24');
    expect(theme.colors.primary).toBe('#C8D6E5');
  });

  it('setMode switches to light', () => {
    theme.setMode('light');
    expect(theme.base).toBe('default');
    expect(theme.mode).toBe('light');
    expect(theme.isDark).toBe(false);
    expect(theme.colors).toBe(defaultLightTheme);
    expect(theme.colors.bg).toBe('#f8f8f8');
  });

  it('setBase switches to monokai keeping current mode', () => {
    theme.setBase('monokai');
    expect(theme.base).toBe('monokai');
    expect(theme.mode).toBe('dark');
    expect(theme.colors).toBe(monokaiDarkTheme);
  });

  it('setTheme(base, mode) switches both', () => {
    theme.setTheme('monokai', 'light');
    expect(theme.base).toBe('monokai');
    expect(theme.mode).toBe('light');
    expect(theme.colors).toBe(monokaiLightTheme);
  });

  it('setTheme with single string (legacy) maps dark to default-dark', () => {
    theme.setTheme('dark');
    expect(theme.base).toBe('default');
    expect(theme.mode).toBe('dark');
  });

  it('setTheme with single string maps light to default-light', () => {
    theme.setTheme('light');
    expect(theme.base).toBe('default');
    expect(theme.mode).toBe('light');
  });

  it('setTheme with single string maps monokai to monokai-dark', () => {
    theme.setTheme('monokai');
    expect(theme.base).toBe('monokai');
    expect(theme.mode).toBe('dark');
  });

  it('setTheme with unknown base falls back gracefully', () => {
    theme.setTheme('nonexistent');
    expect(theme.base).toBe('default');
    expect(theme.mode).toBe('dark');
  });

  it('toggle flips between dark and light mode', () => {
    theme.setDark(true);
    expect(theme.mode).toBe('dark');
    theme.toggle();
    expect(theme.mode).toBe('light');
    theme.toggle();
    expect(theme.mode).toBe('dark');
  });

  it('toggle preserves base theme', () => {
    theme.setTheme('monokai', 'light');
    theme.toggle();
    expect(theme.base).toBe('monokai');
    expect(theme.mode).toBe('dark');
    expect(theme.colors).toBe(monokaiDarkTheme);
  });

  it('apply sets CSS custom properties on documentElement', () => {
    theme.setDark(true);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#161C24');
    expect(root.style.getPropertyValue('--primary')).toBe('#C8D6E5');
    expect(root.style.getPropertyValue('--border')).toBe('#2A3A4A');
    expect(root.style.getPropertyValue('--accent')).toBe('#4B9EB5');
  });

  it('apply sets light CSS properties on toggle', () => {
    theme.toggle();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#f8f8f8');
    expect(root.style.getPropertyValue('--primary')).toBe('#1a1a1a');
  });

  it('apply sets monokai-dark CSS properties', () => {
    theme.setTheme('monokai', 'dark');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#272822');
    expect(root.style.getPropertyValue('--primary')).toBe('#f8f8f2');
    expect(root.style.getPropertyValue('--secondary')).toBe('#a09f8c');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#75715e');
    expect(root.style.getPropertyValue('--border')).toBe('#49483e');
    expect(root.style.getPropertyValue('--accent')).toBe('#A6E22E');
    expect(root.style.getPropertyValue('--accent2')).toBe('#F92672');
  });

  it('apply sets monokai-light CSS properties', () => {
    theme.setTheme('monokai', 'light');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#e2dfd0');
    expect(root.style.getPropertyValue('--primary')).toBe('#272822');
    expect(root.style.getPropertyValue('--secondary')).toBe('#5e5c50');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#8c8878');
    expect(root.style.getPropertyValue('--border')).toBe('#9c9988');
  });

  it('defaultDarkTheme has all required color keys', () => {
    const keys: (keyof typeof defaultDarkTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border', 'accent', 'accent2'];
    for (const k of keys) expect(defaultDarkTheme[k]).toBeDefined();
  });

  it('defaultLightTheme has all required color keys', () => {
    const keys: (keyof typeof defaultLightTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border', 'accent', 'accent2'];
    for (const k of keys) expect(defaultLightTheme[k]).toBeDefined();
  });

  it('monokaiDarkTheme has all required color keys', () => {
    const keys: (keyof typeof monokaiDarkTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border', 'accent', 'accent2'];
    for (const k of keys) expect(monokaiDarkTheme[k]).toBeDefined();
  });

  it('monokaiLightTheme has all required color keys', () => {
    const keys: (keyof typeof monokaiLightTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border', 'accent', 'accent2'];
    for (const k of keys) expect(monokaiLightTheme[k]).toBeDefined();
  });

  it('idolDarkTheme has all required color keys', () => {
    const keys: (keyof typeof idolDarkTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border', 'accent', 'accent2'];
    for (const k of keys) expect(idolDarkTheme[k]).toBeDefined();
  });

  it('idolLightTheme has all required color keys', () => {
    const keys: (keyof typeof idolLightTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border', 'accent', 'accent2'];
    for (const k of keys) expect(idolLightTheme[k]).toBeDefined();
  });

  it('apply sets idol-dark CSS properties', () => {
    theme.setTheme('idol', 'dark');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#040408');
    expect(root.style.getPropertyValue('--primary')).toBe('#d0d0d0');
    expect(root.style.getPropertyValue('--secondary')).toBe('#a0a0b8');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#008855');
    expect(root.style.getPropertyValue('--border')).toBe('#5a4a3a');
    expect(root.style.getPropertyValue('--accent')).toBe('#e86a6a');
    expect(root.style.getPropertyValue('--accent2')).toBe('#e870b0');
  });

  it('apply sets idol-light CSS properties', () => {
    theme.setTheme('idol', 'light');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#f0fcfc');
    expect(root.style.getPropertyValue('--primary')).toBe('#2a2a2a');
    expect(root.style.getPropertyValue('--secondary')).toBe('#3a3a4a');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#5a9a7a');
    expect(root.style.getPropertyValue('--border')).toBe('#b8a088');
    expect(root.style.getPropertyValue('--accent')).toBe('#e85a5a');
    expect(root.style.getPropertyValue('--accent2')).toBe('#e060a0');
  });

  it('setTheme idol+dark switches correctly', () => {
    theme.setTheme('idol', 'dark');
    expect(theme.base).toBe('idol');
    expect(theme.mode).toBe('dark');
    expect(theme.colors).toBe(idolDarkTheme);
  });

  it('setTheme idol+light switches correctly', () => {
    theme.setTheme('idol', 'light');
    expect(theme.base).toBe('idol');
    expect(theme.mode).toBe('light');
    expect(theme.colors).toBe(idolLightTheme);
  });

  it('setBase idol keeps current mode', () => {
    theme.setMode('light');
    theme.setBase('idol');
    expect(theme.base).toBe('idol');
    expect(theme.mode).toBe('light');
    expect(theme.colors).toBe(idolLightTheme);
  });

  it('all six palettes are distinct', () => {
    const bgs = [
      defaultDarkTheme.bg, defaultLightTheme.bg,
      monokaiDarkTheme.bg, monokaiLightTheme.bg,
      idolDarkTheme.bg, idolLightTheme.bg,
    ];
    const unique = new Set(bgs);
    expect(unique.size).toBe(6);
  });
});
