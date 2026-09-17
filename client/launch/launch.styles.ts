import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";

/**
 * The send dialog's own styles: its body rhythm, the provider/model/
 * thinking/permission-mode control rows, and the popovers those controls
 * open. Composed into the one `Styles` object by `theme/use-styles`.
 */
export function buildLaunchStyles({ layout }: PluginSurfaceProps, { colors, separator }: ThemeTokens) {
  return {
      // --- New workspace dialog ---
      /**
       * The host's sheet owns the frame, the backdrop, the header and the
       * safe-area clearance, so this is only the body's own rhythm. The default
       * `Modal.Content` padding is 24 and gap 16; 16 and 12 keep the dialog as
       * tight as it was, which matters most on a phone where the prompt field
       * is competing with the keyboard.
       */
      dialogBody: { padding: 16, gap: 12 },
      /**
       * A row of chips, and the anchor its popover hangs off. `zIndex` puts both
       * rows above the scrim that closes an open popover, so the chips stay
       * pressable and the popover stays on top of everything between them.
       */
      controlRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        gap: 6,
        zIndex: 2,
      },
      /**
       * The row whose popover is open, lifted over the other one. Without it the
       * two rows sit at the same level and paint order decides, which puts the
       * bottom row's chips on top of a menu the top row opened downward.
       */
      controlRowRaised: { zIndex: 3 },
      chipButtonDisabled: { opacity: 0.5 },
      promptInput: {
        color: colors.foreground,
        borderWidth: 1,
        borderColor: separator,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        lineHeight: 18,
        // The one part of the card that gives up height when the keyboard takes
        // it. Multiline inputs scroll themselves, so a prompt longer than what
        // is left stays reachable rather than being cut off.
        flexShrink: 1,
        minHeight: layout.compact ? 88 : 120,
        textAlignVertical: "top" as const,
      },
      /**
       * Covers the card between the two control rows while a popover is open, so
       * the press that dismisses it cannot land in the prompt underneath. Below
       * both rows in `zIndex`, so it never swallows a press on a chip.
       */
      cardScrim: {
        position: "absolute" as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1,
      },
      /**
       * The floating menu itself. Bounded so it stays inside the card: Android
       * clips whatever leaves the parent's box, and a menu the user cannot see
       * the bottom of is worse than one that scrolls.
       */
      popover: {
        position: "absolute" as const,
        left: 0,
        minWidth: 280,
        maxWidth: 380,
        // Sized to fit above the bottom row without leaving the card, which
        // Android would clip.
        maxHeight: 240,
        backgroundColor: colors.surface0,
        borderWidth: 1,
        borderColor: separator,
        borderRadius: 10,
        overflow: "hidden" as const,
      },
      popoverUp: { bottom: "100%" as const, marginBottom: 6 },
      popoverDown: { top: "100%" as const, marginTop: 6 },
      popoverHeader: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: separator,
      },
      popoverBack: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: separator,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      popoverBackLabel: { color: colors.foreground, fontSize: 14, lineHeight: 16 },
      popoverHeaderLabel: {
        flexShrink: 1,
        color: colors.foreground,
        fontSize: 13,
        fontWeight: "600" as const,
      },
      popoverSearch: {
        color: colors.foreground,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        borderBottomWidth: 1,
        borderBottomColor: separator,
      },
      popoverScroll: { flexShrink: 1 },
      popoverList: { paddingVertical: 4 },
      popoverSection: {
        color: colors.foregroundMuted,
        fontSize: 11,
        paddingHorizontal: 10,
        paddingTop: 6,
        paddingBottom: 2,
      },
      popoverRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
      },
      popoverRowSelected: { backgroundColor: withAlpha(colors.accent, "22") },
      popoverRowPressed: { backgroundColor: withAlpha(colors.foregroundMuted, "1a") },
      /**
       * Label and detail on one line, the way Paseo's own model rows read
       * ("Opus 5 — Opus 5 · Latest release"). `minWidth: 0` is what lets the
       * detail truncate instead of shoving the tick out of the row.
       */
      popoverRowText: {
        flex: 1,
        minWidth: 0,
        flexDirection: "row" as const,
        alignItems: "baseline" as const,
        gap: 6,
      },
      popoverTrailing: { color: colors.foregroundMuted, fontSize: 11 },
      popoverTick: { color: colors.accent, fontSize: 12, fontWeight: "700" as const },
      popoverEmpty: { color: colors.foregroundMuted, fontSize: 12, padding: 12 },
      optionLabel: { color: colors.foreground, fontSize: 13, flexShrink: 0 },
      optionDescription: {
        flexShrink: 1,
        color: colors.foregroundMuted,
        fontSize: 11,
        lineHeight: 15,
      },
      dialogActionsSpacer: { flex: 1 },
  };
}
