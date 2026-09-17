import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";

/**
 * The board's column/kanban layout: the columns row, the compact tab bar
 * that picks one column at a time, and each column's own header and body.
 * No current board mode renders this layout — the surface switched to the
 * single scrolling list `board-row.styles.ts` covers — but a style split is
 * not licensed to delete code, so these stay intact and reachable rather
 * than lost. Composed into `buildBoardStyles` alongside the other board
 * feature groups.
 */
export function buildBoardGridStyles(
  { layout }: PluginSurfaceProps,
  { colors, gap, separator }: ThemeTokens,
) {
  return {
    columns: { flexDirection: "row" as const, flex: 1, gap },
    columnsContent: { padding: gap, gap },
    /**
     * Compact shows one column at a time, chosen from the tab bar, so the
     * column is the whole body and drops the frame it needed when it sat
     * beside three others.
     */
    column: {
      flex: 1,
      borderWidth: layout.compact ? 0 : 1,
      borderColor: separator,
      borderRadius: layout.compact ? 0 : 10,
      overflow: "hidden" as const,
    },
    /**
     * The compact column picker. Horizontally scrollable because four titles
     * with counts do not fit a phone, and `flexGrow: 0` because a horizontal
     * ScrollView in a column parent otherwise claims the height the list
     * needs. It keeps every column's count on screen while you are inside
     * one of them, which is what a board is for.
     */
    tabBar: {
      flexGrow: 0,
      flexShrink: 0,
      borderBottomWidth: 1,
      borderBottomColor: separator,
    },
    tabBarContent: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    tab: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      minHeight: 36,
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    tabLabel: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
    tabLabelActive: { color: colors.accentForeground },
    tabCount: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const },
    tabCountActive: { color: colors.accentForeground },
    /**
     * A column that failed to load holds no items, and a count of 0 would
     * read as "nothing to do" rather than "this did not load".
     */
    tabError: { color: colors.statusDanger, fontSize: 12, fontWeight: "700" as const },
    columnHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: separator,
    },
    columnTitle: { color: colors.foreground, fontSize: 14, fontWeight: "600" as const },
    countPill: {
      color: colors.foregroundMuted,
      fontSize: 12,
      overflow: "hidden" as const,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      backgroundColor: withAlpha(colors.foregroundMuted, "22"),
    },
    columnBody: {
      padding: layout.compact ? 12 : 8,
      gap: layout.compact ? 10 : 8,
      // Clears the home indicator, and leaves somewhere to pull from.
      paddingBottom: layout.compact ? 32 : 8,
    },
  };
}
