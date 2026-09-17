import { Platform } from "react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";
import { withAlpha, MONOSPACE } from "../theme/tokens";

/**
 * The detail panel's own styles: the sliding panel and its resize
 * handle, the header, the body, the state pill, comments and the image
 * frame, plus the Markdown renderer's own styles, since Markdown only
 * ever renders inside this panel. Composed into the one `Styles` object
 * by `theme/use-styles`.
 */
export function buildDetailStyles({ layout }: PluginSurfaceProps, { colors, separator }: ThemeTokens) {
  return {
      // --- The detail panel ---
      /**
       * Everything under the header, and what the detail panel is positioned
       * in: the panel covers the columns and leaves the header — the filter,
       * Refresh, the settings button — reachable while it is open.
       */
      body: { flex: 1 },
      /**
       * Half the width on the wide layout, so the columns on the other half
       * stay readable and clickable and a press on a second card swaps the
       * panel rather than closing it. Compact has no width to share, so the
       * panel takes the body and its Close button is the way back.
       */
      detailPanel: {
        position: "absolute" as const,
        top: 0,
        bottom: 0,
        right: 0,
        width: layout.compact ? ("100%" as const) : ("50%" as const),
        backgroundColor: colors.surface0,
        borderLeftWidth: layout.compact ? 0 : 1,
        borderLeftColor: separator,
      },
      /**
       * The drag handle, astride the panel's left edge: half of it hangs over
       * the board so the edge is grabbable from either side. Wide layout only;
       * a full-width panel has no edge to move.
       */
      resizeHandle: {
        position: "absolute" as const,
        top: 0,
        bottom: 0,
        left: -5,
        width: 10,
        alignItems: "center" as const,
        zIndex: 1,
        // A resize cursor on the web renderer. React Native's `cursor` type
        // allows only `auto` and `pointer`, so it goes in as an untyped extra
        // rather than by lying about the value; native has no cursor anyway.
        ...(Platform.OS === "web" ? ({ cursor: "col-resize", userSelect: "none" } as object) : {}),
      },
      /**
       * Over the board while the panel is open: a wash towards `surface0`, the
       * way the modal backdrop dims, plus a backdrop blur where the renderer
       * has one — the web and desktop renderers pass the CSS through, native
       * has no blur without a library the client bundle cannot import and
       * keeps the wash. A press on it closes the panel.
       */
      detailScrim: {
        position: "absolute" as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: withAlpha(colors.surface0, "99"),
        ...(Platform.OS === "web"
          ? ({ backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" } as object)
          : {}),
      },
      /** The visible line inside the handle, lit while a drag is in progress. */
      resizeGrip: { width: 2, flex: 1 },
      resizeGripActive: { backgroundColor: colors.accent },
      detailHeader: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: layout.compact ? 12 : 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: separator,
      },
      detailRepo: { flexShrink: 1, color: colors.foregroundMuted, fontSize: 12 },
      /**
       * Square, and 32pt on compact where it is a touch target. The glyph is
       * the whole label, so each one carries an `accessibilityLabel`.
       */
      iconButton: {
        width: layout.compact ? 32 : 28,
        height: layout.compact ? 32 : 28,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: separator,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      detailBody: {
        padding: layout.compact ? 12 : 16,
        gap: 10,
        paddingBottom: 40,
      },
      detailTitle: {
        color: colors.foreground,
        fontSize: layout.compact ? 18 : 20,
        lineHeight: layout.compact ? 24 : 27,
        fontWeight: "600" as const,
      },
      detailMeta: { color: colors.foregroundMuted, fontSize: 13, lineHeight: 18 },
      detailLabels: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        gap: 6,
      },
      detailActions: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingVertical: 4,
      },
      detailDivider: { height: 1, backgroundColor: separator, marginVertical: 6 },
      /** Icon and label side by side, in the ghost button's frame. */
      loadCommentsButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        alignSelf: "flex-start" as const,
        gap: 6,
        borderWidth: 1,
        borderColor: separator,
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
      },
      commentCard: {
        gap: 6,
        borderWidth: 1,
        borderColor: separator,
        borderRadius: 8,
        padding: 10,
      },
      /** A reply, indented under the comment it answers. Discussions only. */
      commentReply: { marginLeft: 20 },
      commentHeader: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const },
      /**
       * Sized by `aspectRatio` from the measured image, so the box is right
       * before the bitmap paints and nothing under it jumps; capped so a tall
       * phone screenshot does not become the whole panel.
       */
      imageFrame: {
        width: "100%" as const,
        maxHeight: 480,
        borderRadius: 8,
        overflow: "hidden" as const,
        backgroundColor: withAlpha(colors.foregroundMuted, "1a"),
      },
      image: { width: "100%" as const, height: "100%" as const },
      /** The frame before the size is known: a short band with a spinner in it. */
      imagePending: {
        height: 96,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      imageCaption: { color: colors.foregroundMuted, fontSize: 11, marginTop: 4 },
      /**
       * One pill per state, spelled in the tokens the theme has: accent for
       * open, danger for closed, and muted for a draft or a merge — both of
       * which are settled rather than wrong. The word carries the meaning.
       */
      statePill: {
        fontSize: 11,
        fontWeight: "600" as const,
        overflow: "hidden" as const,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderWidth: 1,
      },
      statePillOpen: {
        color: colors.accent,
        borderColor: withAlpha(colors.accent, "66"),
        backgroundColor: withAlpha(colors.accent, "1a"),
      },
      statePillClosed: {
        color: colors.statusDanger,
        borderColor: withAlpha(colors.statusDanger, "66"),
        backgroundColor: withAlpha(colors.statusDanger, "1a"),
      },
      statePillSettled: {
        color: colors.foregroundMuted,
        borderColor: separator,
        backgroundColor: withAlpha(colors.foregroundMuted, "1a"),
      },
      // --- Markdown, for the panel's body (see markdown.client.tsx) ---
      mdParagraph: { color: colors.foreground, fontSize: 14, lineHeight: 21 },
      mdHeadingLarge: {
        color: colors.foreground,
        fontSize: 17,
        lineHeight: 24,
        fontWeight: "600" as const,
        marginTop: 6,
      },
      mdHeading: {
        color: colors.foreground,
        fontSize: 15,
        lineHeight: 22,
        fontWeight: "600" as const,
        marginTop: 4,
      },
      mdListRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 8 },
      mdListMarker: { color: colors.foregroundMuted, fontSize: 14, lineHeight: 21, minWidth: 14 },
      /** Lets a long item wrap under itself instead of pushing past the panel. */
      mdListText: { flex: 1, minWidth: 0 },
      mdCodeBlock: {
        backgroundColor: withAlpha(colors.foregroundMuted, "1a"),
        borderRadius: 8,
        padding: 10,
      },
      mdCodeText: {
        color: colors.foreground,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: MONOSPACE,
      },
      mdQuote: { borderLeftWidth: 3, borderLeftColor: separator, paddingLeft: 10 },
      mdRule: { height: 1, backgroundColor: separator },
      mdBold: { fontWeight: "600" as const },
      mdInlineCode: {
        fontFamily: MONOSPACE,
        fontSize: 13,
        backgroundColor: withAlpha(colors.foregroundMuted, "1a"),
      },
      mdLink: { color: colors.accent },
      /** Cells share the row's width equally; a screenshot in one scales to fit. */
      mdTable: { borderWidth: 1, borderColor: separator, borderRadius: 8, overflow: "hidden" as const },
      mdTableRow: { flexDirection: "row" as const, borderTopWidth: 1, borderTopColor: separator },
      mdTableCell: { flex: 1, minWidth: 0, padding: 6 },
      mdTableHeader: { fontWeight: "600" as const },
      mdNested: { gap: 10 },
      /** The clickable summary row of a details block: a caret and the text. */
      mdDetailsSummary: {
        flexDirection: "row" as const,
        alignItems: "flex-start" as const,
        gap: 6,
        paddingVertical: 2,
      },
      /** Larger than the text it leads, or the caret reads as a bullet. */
      mdDetailsMarker: { color: colors.foreground, fontSize: 20, lineHeight: 21, minWidth: 14 },
  };
}
