import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";

/**
 * The GitHub-style list `item-row.tsx` renders: the row frame itself, its
 * pressed/selected states, the icon/title/meta layout, and the trailing
 * checks pills, linked-issue and label chips a row can carry. Composed into
 * `buildBoardStyles` alongside the other board feature groups.
 */
export function buildBoardRowStyles(
  { layout }: PluginSurfaceProps,
  { colors, separator }: ThemeTokens,
) {
  return {
    rowList: { flex: 1 },
    rowListContent: { paddingBottom: layout.compact ? 32 : 8 },
    /**
     * One line of the GitHub-style list: an icon, the title and its meta, and
     * — on the wide layout only — the trailing checks/comments/labels. A
     * border under the row stands in for the card frame the grid used to draw.
     */
    itemRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: layout.compact ? 10 : 12,
      paddingHorizontal: layout.compact ? 12 : 16,
      paddingVertical: layout.compact ? 12 : 10,
      borderBottomWidth: 1,
      borderBottomColor: separator,
    },
    itemRowPressed: { backgroundColor: withAlpha(colors.foregroundMuted, "1a") },
    /** The row whose details are open, so the panel reads as *its* panel. */
    itemRowSelected: { backgroundColor: withAlpha(colors.accent, "0d") },
    itemRowIcon: { width: 20, alignItems: "center" as const, paddingTop: 2 },
    itemRowMain: { flex: 1, minWidth: 0, gap: 2 },
    itemRowTitleLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      flexWrap: "wrap" as const,
      gap: 8,
    },
    itemRowTitle: {
      flexShrink: 1,
      color: colors.foreground,
      fontSize: layout.compact ? 15 : 14,
      fontWeight: "600" as const,
    },
    /** A pull request folded into the merged list, marked the way its own column used to name it. */
    itemRowDraftPill: {
      color: colors.foregroundMuted,
      fontSize: 10,
      fontWeight: "600" as const,
      overflow: "hidden" as const,
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    itemRowMeta: { color: colors.foregroundMuted, fontSize: 12 },
    /** Checks, comment count and labels, wide layout only — compact wraps them under the title instead. */
    itemRowTrailing: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    itemRowTrailingCompact: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      flexWrap: "wrap" as const,
      gap: 6,
      marginTop: 6,
    },
    /** Hidden until the row or the action itself is hovered; see `sendButtonHidden`. */
    itemRowActionHidden: { opacity: 0 },
    label: {
      color: colors.foregroundMuted,
      fontSize: layout.compact ? 11 : 10,
      overflow: "hidden" as const,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: layout.compact ? 3 : 1,
      borderWidth: 1,
      borderColor: separator,
    },
    // Accent-tinted so a folded-in issue reads as a link to other work rather
    // than as one more label on the pull request.
    linkedIssue: {
      color: colors.accent,
      fontSize: layout.compact ? 11 : 10,
      fontWeight: "600" as const,
      overflow: "hidden" as const,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: layout.compact ? 3 : 1,
      borderWidth: 1,
      borderColor: withAlpha(colors.accent, "66"),
      backgroundColor: withAlpha(colors.accent, "1a"),
    },
    /**
     * One pill per outcome, grouped so they read as a single summary the way
     * Paseo's own checks row does. It leads the footer rather than trailing
     * it: the footer wraps, so anything appended lands on a second line, and
     * the Send button covers the bottom-right corner where it would sit.
     */
    checksGroup: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: separator,
      paddingHorizontal: 6,
      paddingVertical: layout.compact ? 3 : 1,
    },
    /**
     * Danger is the only status colour the plugin theme offers, so failure
     * takes it and the other two are spelled in what is left: accent for work
     * still running, muted for the checks that are simply done. Glyphs carry
     * the meaning where colour cannot, which is also what makes the summary
     * readable to anyone who does not separate red from grey.
     */
    checksFailed: {
      color: colors.statusDanger,
      fontSize: layout.compact ? 11 : 10,
      fontWeight: "600" as const,
    },
    checksPending: {
      color: colors.accent,
      fontSize: layout.compact ? 11 : 10,
      fontWeight: "600" as const,
    },
    checksPassed: {
      color: colors.foregroundMuted,
      fontSize: layout.compact ? 11 : 10,
      fontWeight: "600" as const,
    },
    /** The count of labels the card had no room for; see `Card`. */
    labelMore: {
      color: colors.foregroundMuted,
      fontSize: layout.compact ? 11 : 10,
      paddingHorizontal: 2,
    },
  };
}
