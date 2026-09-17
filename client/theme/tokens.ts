import { Platform } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

/**
 * Each platform's own monospace face. There is no cross-platform name: iOS
 * has no `monospace` alias, and Android has no Menlo.
 */
export const MONOSPACE = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/**
 * The theme exposes six opaque tokens and no border or hover colour, so
 * separators are the muted foreground at low opacity. Tokens are documented as
 * hex, but a theme that contributes anything else is passed through untouched
 * rather than turned into an invalid colour string.
 */
export function withAlpha(color: string, alpha: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}

/**
 * What every feature's style builder shares: the theme's colours, the compact
 * spacing unit, and the one separator colour the theme does not itself
 * provide. Computed once per `useStyles` call and threaded to every builder
 * rather than recomputed per feature, so the four files agree on the same
 * `separator` down to the object identity.
 */
export interface ThemeTokens {
  colors: PluginSurfaceProps["theme"]["colors"];
  gap: number;
  separator: string;
}

export function computeThemeTokens({ theme, layout }: PluginSurfaceProps): ThemeTokens {
  const { colors } = theme;
  const gap = layout.compact ? 8 : 12;
  const separator = withAlpha(colors.foregroundMuted, "33");
  return { colors, gap, separator };
}
