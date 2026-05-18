import { describe, it, expect, beforeEach } from 'vitest';
import { theme, darkTheme, lightTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    theme.setDark(true);
  });

  it('starts in dark mode', () => {
    expect(theme.isDark).toBe(true);
  });

  it('returns dark color palette when dark', () => {
    expect(theme.colors).toBe(darkTheme);
    expect(theme.colors.bg).toBe('#161C24');
    expect(theme.colors.primary).toBe('#C8D6E5');
  });

  it('returns light color palette when light', () => {
    theme.setDark(false);
    expect(theme.isDark).toBe(false);
    expect(theme.colors).toBe(lightTheme);
    expect(theme.colors.bg).toBe('#f8f8f8');
  });

  it('toggle switches between dark and light', () => {
    expect(theme.isDark).toBe(true);
    theme.toggle();
    expect(theme.isDark).toBe(false);
    theme.toggle();
    expect(theme.isDark).toBe(true);
  });

  it('apply sets CSS custom properties on documentElement', () => {
    theme.setDark(true);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#161C24');
    expect(root.style.getPropertyValue('--primary')).toBe('#C8D6E5');
    expect(root.style.getPropertyValue('--border')).toBe('#2A3A4A');
  });

  it('apply sets light CSS properties on toggle', () => {
    theme.toggle();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#f8f8f8');
    expect(root.style.getPropertyValue('--primary')).toBe('#1a1a1a');
  });

  it('darkTheme has all required color keys', () => {
    const keys: (keyof typeof darkTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border'];
    for (const k of keys) expect(darkTheme[k]).toBeDefined();
  });

  it('lightTheme has all required color keys', () => {
    const keys: (keyof typeof lightTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border'];
    for (const k of keys) expect(lightTheme[k]).toBeDefined();
  });
});
