import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";

/**
 * Every way the board narrows what it shows: the repository/owner dropdown
 * (`repo-owner-filters.tsx`), the relation chips (`relation-filter-bar.tsx`),
 * the sort dropdown (`sort-filter.tsx`), the free-text search box, the
 * segmented mode switcher, and the filter bar row that holds them all.
 * Composed into `buildBoardStyles` alongside the other board feature groups.
 */
export function buildBoardFilterStyles(
  { layout }: PluginSurfaceProps,
  { colors, separator }: ThemeTokens,
) {
  return {
    filterAnchor: { position: "relative" as const },
    dropdown: {
      position: "absolute" as const,
      top: "100%" as const,
      left: 0,
      marginTop: 4,
      minWidth: layout.compact ? 260 : 220,
      maxHeight: layout.compact ? 380 : 320,
      backgroundColor: colors.surface0,
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 8,
      overflow: "hidden" as const,
    },
    dropdownActions: {
      flexDirection: "row" as const,
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: separator,
    },
    chipButton: {
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: layout.compact ? 6 : 3,
    },
    chipLabel: { color: colors.foreground, fontSize: 12 },
    dropdownList: { paddingVertical: 4 },
    dropdownRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: 10,
      // A row is a touch target on compact, not just a line of text.
      paddingVertical: layout.compact ? 10 : 6,
    },
    checkbox: {
      width: layout.compact ? 18 : 14,
      height: layout.compact ? 18 : 14,
      borderRadius: 3,
      borderWidth: 1,
      borderColor: separator,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
    checkmark: {
      color: colors.accentForeground,
      fontSize: 9,
      lineHeight: 12,
      fontWeight: "700" as const,
    },
    dropdownLabel: {
      flex: 1,
      minWidth: 0,
      color: colors.foreground,
      fontSize: layout.compact ? 14 : 12,
    },
    /** An owner's heading inside the repository list: bolder, and its own toggle. */
    dropdownGroupLabel: {
      flex: 1,
      minWidth: 0,
      color: colors.foreground,
      fontSize: layout.compact ? 14 : 12,
      fontWeight: "600" as const,
    },
    /** The count beside an owner, so a collapsed-looking group still says how much it holds. */
    dropdownGroupCount: { color: colors.foregroundMuted, fontSize: 11 },
    /** A repository under its owner, indented by one checkbox's width plus the row gap. */
    dropdownChildRow: { paddingLeft: layout.compact ? 36 : 32 },
    /**
     * A group whose repositories are only partly shown. Filled like a checked
     * box but carrying a dash, because "some" is not "none" and a blank box
     * would say the owner is hidden entirely.
     */
    checkboxPartial: { backgroundColor: colors.foregroundMuted, borderColor: colors.foregroundMuted },
    /** The segmented control choosing which of the four modes fills the body. */
    modeBar: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 8,
      paddingHorizontal: layout.compact ? 12 : 20,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: separator,
    },
    modeButton: {
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: layout.compact ? 8 : 6,
    },
    modeButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    modeButtonLabel: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
    modeButtonLabelActive: { color: colors.accentForeground },
    empty: { color: colors.foregroundMuted, fontSize: 12, padding: 12 },
    /**
     * The relation chips, the owner and repository dropdowns, and the free-text
     * search all live in one wrapping row: `zIndex` keeps a dropdown opened from
     * here above the body underneath it, the same way the header already
     * out-stacks the columns for the repository filter.
     */
    filterBar: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 8,
      paddingHorizontal: layout.compact ? 12 : 20,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: separator,
      zIndex: 25,
    },
    relationRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    relationChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: layout.compact ? 6 : 4,
    },
    relationChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    relationChipLabel: { color: colors.foreground, fontSize: 12 },
    relationChipLabelActive: { color: colors.accentForeground },
    relationChipCount: { color: colors.foregroundMuted, fontSize: 11 },
    /** The owner dropdown's per-row count; the repository dropdown has none. */
    dropdownCount: { color: colors.foregroundMuted, fontSize: 11 },
    searchInput: {
      flexGrow: 1,
      minWidth: layout.compact ? 140 : 180,
      color: colors.foreground,
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: layout.compact ? 8 : 6,
      fontSize: 13,
    },
  };
}
