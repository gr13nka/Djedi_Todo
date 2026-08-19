import type { CustomThemeColors, ThemeMode } from '@shared/types';
import { THEME_COLOR_CSS_VARS, getPrebuiltTheme, isPrebuiltThemeId, type ThemeColors } from './themes';
import { contrastingText } from './contrast';
export { applyFont } from './fonts';

function setColorVars(colors: ThemeColors | CustomThemeColors) {
  const el = document.documentElement;
  for (const [key, cssVar] of THEME_COLOR_CSS_VARS) {
    el.style.setProperty(cssVar, colors[key]);
  }
}

/**
 * The single place that puts a theme on the page. Sets the 12 color tokens
 * as inline custom properties on `<html>` — the mechanism every theme
 * (prebuilt or custom) renders through — and toggles the marker classes that
 * index.css uses for dark shadows and the wax-pencil surface treatment.
 */
function setBrowserThemeColor(color: string): void {
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function applyTheme(theme: ThemeMode, customColors: CustomThemeColors): void {
  const cl = document.documentElement.classList;
  const root = document.documentElement;
  cl.remove('dark', 'custom', 'wax-pencil');

  if (theme === 'custom') {
    cl.add('custom');
    // `dark` is the marker index.css keys the dark elevation scale off, so a custom theme
    // built on a dark background has to carry it too — otherwise every surface in it stays
    // flat. Same test that already decided `color-scheme`, asked once.
    const isDark = contrastingText(customColors.bgPrimary) === '#FFFFFF';
    if (isDark) cl.add('dark');
    setColorVars(customColors);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    setBrowserThemeColor(customColors.bgPrimary);
  } else if (isPrebuiltThemeId(theme)) {
    const preset = getPrebuiltTheme(theme);
    if (preset.dark) cl.add('dark');
    if (preset.texture === 'wax-pencil') cl.add('wax-pencil');
    setColorVars(preset.colors);
    root.style.colorScheme = preset.dark ? 'dark' : 'light';
    setBrowserThemeColor(preset.colors.bgPrimary);
  }
}

/**
 * The accent pair actually in force: the user's override when they set one,
 * otherwise the active theme's own accent.
 *
 * Pure, and the single answer to "what is the accent right now" — so no
 * caller has to depend on `applyTheme` having run first. That dependency is
 * what this replaces: clearing the override used to `removeProperty` both
 * vars, which stripped the values `setColorVars` had just written and let
 * every theme fall back to index.css's `@theme` defaults (slate `#1F2937` on
 * white). Unreadable on dark themes, and near-invisible on light ones
 * because the fallback is a hair from the `light` theme's real accent.
 *
 * With no override the theme's hand-picked `accentFg` is returned rather
 * than a computed one — that pairing is already contrast-tested in
 * `contrast.test.ts`.
 */
export function resolveAccent(
  theme: ThemeMode,
  customColors: CustomThemeColors,
  accentColor: string,
): { accent: string; accentFg: string } {
  if (accentColor) return { accent: accentColor, accentFg: contrastingText(accentColor) };
  const colors = theme === 'custom' ? customColors : getPrebuiltTheme(theme).colors;
  return { accent: colors.accent, accentFg: colors.accentFg };
}

/** Writes the resolved accent onto `<html>`. Always sets both vars — never removes them. */
export function applyAccentColor(theme: ThemeMode, customColors: CustomThemeColors, accentColor: string): void {
  const { accent, accentFg } = resolveAccent(theme, customColors, accentColor);
  const el = document.documentElement;
  el.style.setProperty('--color-accent', accent);
  el.style.setProperty('--color-accent-fg', accentFg);
}

export function applyZoom(zoom: number): void {
  document.documentElement.style.fontSize = `${zoom}%`;
}
