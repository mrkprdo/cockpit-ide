import { describe, it, expect, beforeEach } from 'vitest';
import { theme, defaultDarkTheme, defaultLightTheme, monokaiDarkTheme, monokaiLightTheme, idolDarkTheme, idolLightTheme, carbonDarkTheme, carbonLightTheme, alienDarkTheme, alienLightTheme } from './theme';
import type { ThemeColors } from './theme';

/** WCAG 2.x relative luminance for a #rrggbb colour. */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const PALETTES: Array<[string, ThemeColors]> = [
  ['default-dark', defaultDarkTheme],
  ['default-light', defaultLightTheme],
  ['monokai-dark', monokaiDarkTheme],
  ['monokai-light', monokaiLightTheme],
  ['idol-dark', idolDarkTheme],
  ['idol-light', idolLightTheme],
  ['carbon-dark', carbonDarkTheme],
  ['carbon-light', carbonLightTheme],
  ['alien-dark', alienDarkTheme],
  ['alien-light', alienLightTheme],
];

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
    expect(root.style.getPropertyValue('--accent2')).toBe('#9A8CC4');
    expect(root.style.getPropertyValue('--onAccent')).toBe('#0B1118');
  });

  it('apply marks the document mode and color-scheme for native chrome', () => {
    theme.setDark(true);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(root.dataset.themeMode).toBe('dark');
    theme.toggle();
    expect(root.style.getPropertyValue('color-scheme')).toBe('light');
    expect(root.dataset.themeMode).toBe('light');
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
    expect(root.style.getPropertyValue('--tertiary')).toBe('#9B957F');
    expect(root.style.getPropertyValue('--border')).toBe('#49483e');
    expect(root.style.getPropertyValue('--accent')).toBe('#A6E22E');
    expect(root.style.getPropertyValue('--accent2')).toBe('#FF6D9C');
  });

  it('apply sets monokai-light CSS properties', () => {
    theme.setTheme('monokai', 'light');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#e2dfd0');
    expect(root.style.getPropertyValue('--primary')).toBe('#272822');
    expect(root.style.getPropertyValue('--secondary')).toBe('#4E4C42');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#5E5B49');
    expect(root.style.getPropertyValue('--border')).toBe('#9c9988');
  });

  const allKeys: (keyof typeof defaultDarkTheme)[] = ['bg', 'surface', 'panel', 'primary', 'secondary', 'tertiary', 'border', 'accent', 'accent2', 'green', 'amber', 'red', 'onAccent', 'scrim'];

  it('defaultDarkTheme has all required color keys', () => {
    for (const k of allKeys) expect(defaultDarkTheme[k]).toBeDefined();
  });

  it('defaultLightTheme has all required color keys', () => {
    for (const k of allKeys) expect(defaultLightTheme[k]).toBeDefined();
  });

  it('monokaiDarkTheme has all required color keys', () => {
    for (const k of allKeys) expect(monokaiDarkTheme[k]).toBeDefined();
  });

  it('monokaiLightTheme has all required color keys', () => {
    for (const k of allKeys) expect(monokaiLightTheme[k]).toBeDefined();
  });

  it('idolDarkTheme has all required color keys', () => {
    for (const k of allKeys) expect(idolDarkTheme[k]).toBeDefined();
  });

  it('idolLightTheme has all required color keys', () => {
    for (const k of allKeys) expect(idolLightTheme[k]).toBeDefined();
  });

  it('carbonDarkTheme has all required color keys', () => {
    for (const k of allKeys) expect(carbonDarkTheme[k]).toBeDefined();
  });

  it('carbonLightTheme has all required color keys', () => {
    for (const k of allKeys) expect(carbonLightTheme[k]).toBeDefined();
  });

  it('alienDarkTheme has all required color keys', () => {
    for (const k of allKeys) expect(alienDarkTheme[k]).toBeDefined();
  });

  it('alienLightTheme has all required color keys', () => {
    for (const k of allKeys) expect(alienLightTheme[k]).toBeDefined();
  });

  it('apply sets idol-dark CSS properties', () => {
    theme.setTheme('idol', 'dark');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#040408');
    expect(root.style.getPropertyValue('--primary')).toBe('#d0d0d0');
    expect(root.style.getPropertyValue('--secondary')).toBe('#a0a0b8');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#8A9A9A');
    expect(root.style.getPropertyValue('--border')).toBe('#5a4a3a');
    expect(root.style.getPropertyValue('--accent')).toBe('#e86a6a');
    expect(root.style.getPropertyValue('--accent2')).toBe('#e870b0');
    expect(root.style.getPropertyValue('--onAccent')).toBe('#0B1118');
  });

  it('apply sets idol-light CSS properties', () => {
    theme.setTheme('idol', 'light');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#f0fcfc');
    expect(root.style.getPropertyValue('--primary')).toBe('#2a2a2a');
    expect(root.style.getPropertyValue('--secondary')).toBe('#3a3a4a');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#4E6B5C');
    expect(root.style.getPropertyValue('--border')).toBe('#b8a088');
    expect(root.style.getPropertyValue('--accent')).toBe('#C42B2B');
    expect(root.style.getPropertyValue('--accent2')).toBe('#B02A6E');
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

  it('setTheme carbon+dark switches correctly', () => {
    theme.setTheme('carbon', 'dark');
    expect(theme.base).toBe('carbon');
    expect(theme.mode).toBe('dark');
    expect(theme.colors).toBe(carbonDarkTheme);
  });

  it('setTheme carbon+light switches correctly', () => {
    theme.setTheme('carbon', 'light');
    expect(theme.base).toBe('carbon');
    expect(theme.mode).toBe('light');
    expect(theme.colors).toBe(carbonLightTheme);
  });

  it('setBase carbon keeps current mode', () => {
    theme.setMode('dark');
    theme.setBase('carbon');
    expect(theme.base).toBe('carbon');
    expect(theme.mode).toBe('dark');
    expect(theme.colors).toBe(carbonDarkTheme);
  });

  it('setTheme alien+dark switches correctly', () => {
    theme.setTheme('alien', 'dark');
    expect(theme.base).toBe('alien');
    expect(theme.mode).toBe('dark');
    expect(theme.colors).toBe(alienDarkTheme);
  });

  it('setTheme alien+light switches correctly', () => {
    theme.setTheme('alien', 'light');
    expect(theme.base).toBe('alien');
    expect(theme.mode).toBe('light');
    expect(theme.colors).toBe(alienLightTheme);
  });

  it('setBase alien keeps current mode', () => {
    theme.setMode('dark');
    theme.setBase('alien');
    expect(theme.base).toBe('alien');
    expect(theme.mode).toBe('dark');
    expect(theme.colors).toBe(alienDarkTheme);
  });

  it('toggle preserves alien base theme', () => {
    theme.setTheme('alien', 'dark');
    theme.toggle();
    expect(theme.base).toBe('alien');
    expect(theme.mode).toBe('light');
    expect(theme.colors).toBe(alienLightTheme);
  });

  it('apply sets carbon-dark CSS properties', () => {
    theme.setTheme('carbon', 'dark');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#000000');
    expect(root.style.getPropertyValue('--surface')).toBe('#0A0A0A');
    expect(root.style.getPropertyValue('--panel')).toBe('#141414');
    expect(root.style.getPropertyValue('--primary')).toBe('#E6E6E6');
    expect(root.style.getPropertyValue('--border')).toBe('#262626');
    expect(root.style.getPropertyValue('--accent')).toBe('#FF7A1A');
    expect(root.style.getPropertyValue('--accent2')).toBe('#FFA94D');
  });

  it('apply sets carbon-light CSS properties', () => {
    theme.setTheme('carbon', 'light');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#d5d7da');
    expect(root.style.getPropertyValue('--primary')).toBe('#1c1f24');
    expect(root.style.getPropertyValue('--accent')).toBe('#8B4100');
  });

  it('apply sets alien-dark CSS properties', () => {
    theme.setTheme('alien', 'dark');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#394330');
    expect(root.style.getPropertyValue('--surface')).toBe('#45523A');
    expect(root.style.getPropertyValue('--panel')).toBe('#406059');
    expect(root.style.getPropertyValue('--primary')).toBe('#EDF2E6');
    expect(root.style.getPropertyValue('--secondary')).toBe('#C6D4BC');
    expect(root.style.getPropertyValue('--tertiary')).toBe('#B6C3AF');
    expect(root.style.getPropertyValue('--border')).toBe('#54684B');
    expect(root.style.getPropertyValue('--accent')).toBe('#AFCE8D');
    expect(root.style.getPropertyValue('--accent2')).toBe('#F2C9A8');
    expect(root.style.getPropertyValue('--green')).toBe('#AFCE8D');
    expect(root.style.getPropertyValue('--amber')).toBe('#D9974E');
    expect(root.style.getPropertyValue('--red')).toBe('#E08A7B');
  });

  it('apply sets alien-light CSS properties', () => {
    theme.setTheme('alien', 'light');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#F4F7EF');
    expect(root.style.getPropertyValue('--primary')).toBe('#2E3A2A');
    expect(root.style.getPropertyValue('--accent')).toBe('#44632E');
    expect(root.style.getPropertyValue('--accent2')).toBe('#8F5220');
  });

  it('apply sets green, amber, red, onAccent, scrim CSS custom properties', () => {
    theme.setDark(true);
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--green')).toBe('#4C9A6E');
    expect(root.style.getPropertyValue('--amber')).toBe('#C68B00');
    expect(root.style.getPropertyValue('--red')).toBe('#D44F4F');
    expect(root.style.getPropertyValue('--onAccent')).toBeTruthy();
    expect(root.style.getPropertyValue('--scrim')).toBeTruthy();
  });

  it('default-light border differs from primary', () => {
    expect(defaultLightTheme.border).not.toBe(defaultLightTheme.primary);
  });

  it('idol-dark tertiary is a muted neutral, not saturated green', () => {
    expect(idolDarkTheme.tertiary).toBe('#8A9A9A');
  });

  it('alien-dark palette anchors match the core five-color palette', () => {
    expect(alienDarkTheme.bg).toBe('#394330');
    expect(alienDarkTheme.panel).toBe('#406059');
    expect(alienDarkTheme.accent).toBe('#AFCE8D');
    expect(alienDarkTheme.accent2).toBe('#F2C9A8');
    expect(alienLightTheme.tertiary).toBe('#5A6B54');
  });

  it('all ten palettes are distinct', () => {
    const bgs = [
      defaultDarkTheme.bg, defaultLightTheme.bg,
      monokaiDarkTheme.bg, monokaiLightTheme.bg,
      idolDarkTheme.bg, idolLightTheme.bg,
      carbonDarkTheme.bg, carbonLightTheme.bg,
      alienDarkTheme.bg, alienLightTheme.bg,
    ];
    const unique = new Set(bgs);
    expect(unique.size).toBe(10);
  });
});

describe('palette contrast (WCAG AA regression guard)', () => {
  it('computes the WCAG contrast extremes correctly', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it.each(PALETTES)('%s clears 4.5:1 for every text/boundary pair', (_name, palette) => {
    const pairs: Array<[string, string, string]> = [
      ['primary on bg', palette.primary, palette.bg],
      ['primary on surface', palette.primary, palette.surface],
      ['secondary on bg', palette.secondary, palette.bg],
      ['secondary on surface', palette.secondary, palette.surface],
      ['tertiary on bg', palette.tertiary, palette.bg],
      ['tertiary on surface', palette.tertiary, palette.surface],
      ['accent/onAccent', palette.accent, palette.onAccent],
      ['accent2 on bg', palette.accent2, palette.bg],
    ];
    for (const [label, fg, bg] of pairs) {
      const ratio = contrastRatio(fg, bg);
      expect(ratio, `${label} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(PALETTES)('%s keeps --onAccent legible on accent, amber and red fills', (_name, palette) => {
    for (const fill of [palette.accent, palette.amber, palette.red]) {
      const ratio = contrastRatio(palette.onAccent, fill);
      expect(ratio, `onAccent on ${fill} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
