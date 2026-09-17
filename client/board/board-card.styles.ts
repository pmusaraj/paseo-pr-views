import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";

/**
 * The card frame and its pressed/selected states — shared well beyond the
 * board itself, by `client/timeline.tsx`'s activity card and the detail
 * panel's own send action — plus the card body's own metadata line and its
 * inline send affordance. Composed into `buildBoardStyles` alongside the
 * other board feature groups.
 */
export function buildBoardCardStyles(
  { layout }: PluginSurfaceProps,
  { colors, separator }: ThemeTokens,
) {
  return {
    card: {
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 8,
      padding: layout.compact ? 12 : 10,
      gap: layout.compact ? 8 : 6,
    },
    cardPressed: { backgroundColor: withAlpha(colors.foregroundMuted, "1a") },
    /** The card whose details are open, so the panel reads as *its* panel. */
    cardSelected: {
      borderColor: colors.accent,
      backgroundColor: withAlpha(colors.accent, "0d"),
    },
    // Bottom-right and out of flow, so revealing it on hover never reflows the
    // card and never nudges the cards below it. It sits over the footer's
    // trailing labels, so it is opaque rather than tinted.
    sendButton: {
      position: "absolute" as const,
      right: 8,
      bottom: 8,
      backgroundColor: colors.accent,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    // Hidden, never disabled. It keeps taking pointer events so it can report
    // its own hover, and a pointer cannot reach it without first crossing the
    // card and revealing it — so there is no invisible click target.
    sendButtonHidden: { opacity: 0 },
    sendButtonPressed: { opacity: 0.75 },
    sendButtonLabel: {
      color: colors.accentForeground,
      fontSize: 11,
      fontWeight: "600" as const,
    },
    /**
     * Compact takes the action out of the corner and gives it a row. The
     * overlay only ever worked because hover kept it out of the way until it
     * was wanted; where nothing hovers it is permanently on top of the
     * footer's trailing labels, hiding the card's own metadata.
     */
    cardActions: {
      flexDirection: "row" as const,
      justifyContent: "flex-end" as const,
      borderTopWidth: 1,
      borderTopColor: separator,
      paddingTop: 8,
    },
    sendButtonInline: {
      backgroundColor: colors.accent,
      borderRadius: 6,
      minHeight: 34,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    sendButtonInlineLabel: {
      color: colors.accentForeground,
      fontSize: 13,
      fontWeight: "600" as const,
    },
    cardRepo: { color: colors.foregroundMuted, fontSize: layout.compact ? 12 : 11 },
    // Muted like the rest of the footer but weighted, so "someone else's"
    // reads at a glance without competing with the title above it.
    cardAuthor: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const },
    cardTitle: {
      color: colors.foreground,
      fontSize: layout.compact ? 15 : 13,
      lineHeight: layout.compact ? 21 : 18,
    },
    cardFooter: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      flexWrap: "wrap" as const,
      gap: 6,
    },
  };
}
