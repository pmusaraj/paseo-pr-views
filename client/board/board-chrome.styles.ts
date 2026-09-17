import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";

/**
 * The board's outer chrome: the screen background, the header bar with its
 * title and buttons, the login prompt it can show in place of the buttons,
 * and the generic error banner and centred spinner the body falls back to
 * while nothing else has rendered yet. Composed into `buildBoardStyles`
 * alongside the other board feature groups.
 */
export function buildBoardChromeStyles(
  { layout }: PluginSurfaceProps,
  { colors, gap, separator }: ThemeTokens,
) {
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap,
      paddingHorizontal: layout.compact ? 12 : 20,
      paddingVertical: layout.compact ? 10 : 14,
      borderBottomWidth: 1,
      borderBottomColor: separator,
      // The repository dropdown escapes the header, so the header has to
      // out-stack the columns it overlaps.
      zIndex: 30,
    },
    title: {
      color: colors.foreground,
      fontSize: layout.compact ? 17 : 20,
      fontWeight: "600" as const,
    },
    headerSpacer: { flex: 1 },
    subtle: { color: colors.foregroundMuted, fontSize: 12 },
    /**
     * Compact drops the Refresh button for the pull-to-refresh gesture, which
     * leaves nothing in the header saying how old the board is — so the
     * timestamp moves in, and shrinks rather than pushing Prompts off-screen.
     */
    headerAge: { color: colors.foregroundMuted, fontSize: 12, flexShrink: 1 },
    loginInput: {
      color: colors.foreground,
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 13,
      minWidth: 140,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    buttonLabel: { color: colors.accentForeground, fontSize: 13, fontWeight: "600" as const },
    ghostButton: {
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    ghostButtonLabel: { color: colors.foreground, fontSize: 13 },
    backdrop: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 20,
    },
    banner: {
      paddingHorizontal: layout.compact ? 12 : 20,
      paddingVertical: 10,
    },
    danger: { color: colors.statusDanger, fontSize: 13 },
    /**
     * Centred over the surface rather than over the whole app: a plugin owns
     * its own view and nothing else. The layer clears the header's `zIndex`
     * of 30 and the repository filter's backdrop of 20.
     */
    modalBody: { color: colors.foregroundMuted, fontSize: 13, lineHeight: 19 },
    centered: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const },
  };
}
