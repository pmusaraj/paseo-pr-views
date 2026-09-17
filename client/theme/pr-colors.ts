import type { PluginTheme } from "@getpaseo/plugin";
import type { PrStatusColors } from "../lib/pr-status";

/** GitHub's state hues stay distinct even when a Paseo theme uses a purple accent. */
export function prStatusColors(colors: PluginTheme["colors"]): PrStatusColors {
  const hex = /^#([0-9a-f]{6})$/i.exec(colors.surface0)?.[1];
  const brightness =
    hex === undefined
      ? 255
      : 0.2126 * parseInt(hex.slice(0, 2), 16) +
        0.7152 * parseInt(hex.slice(2, 4), 16) +
        0.0722 * parseInt(hex.slice(4, 6), 16);
  return brightness < 128
    ? {
        approved: "#3fb950",
        changesRequested: "#db6d28",
        closed: "#f85149",
        merged: "#a371f7",
        neutral: colors.foregroundMuted,
      }
    : {
        approved: "#1a7f37",
        changesRequested: "#bc4c00",
        closed: "#d1242f",
        merged: "#8250df",
        neutral: colors.foregroundMuted,
      };
}
