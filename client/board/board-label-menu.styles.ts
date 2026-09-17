import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";
import { LABEL_MENU_MAX_HEIGHT, LABEL_MENU_WIDTH } from "./label-menu";

/**
 * The label popover `label-menu.tsx` opens from a row's context menu: the
 * layer and scrim behind it, the menu itself, its search list, and the
 * closing row. Composed into `buildBoardStyles` alongside the other board
 * feature groups.
 */
export function buildBoardLabelMenuStyles(
  _props: PluginSurfaceProps,
  { colors, separator }: ThemeTokens,
) {
  return {
    /**
     * The context menu's own layer. It clears the repository filter's
     * backdrop (20) and the header (30) but stays under the launch dialog
     * (40), which is modal and must never have a menu floating over it.
     */
    menuLayer: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 35,
    },
    /**
     * Transparent, unlike the modal backdrop: a context menu dismisses on the
     * next press without dimming what it is a menu *about*.
     */
    menuScrim: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    /** Positioned at the pointer; `left` plus `top` or `bottom` come inline. */
    labelMenu: {
      position: "absolute" as const,
      width: LABEL_MENU_WIDTH,
      maxHeight: LABEL_MENU_MAX_HEIGHT,
      backgroundColor: colors.surface0,
      borderWidth: 1,
      borderColor: separator,
      borderRadius: 10,
      overflow: "hidden" as const,
    },
    labelMenuTitle: {
      color: colors.foregroundMuted,
      fontSize: 11,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: separator,
    },
    /**
     * A label's own colour, straight from GitHub. It is the label's identity
     * rather than a theme decision — the same dot the forge draws — which is
     * why this is the one place the surface paints with a colour the theme
     * did not give it. The name next to it carries the meaning on its own.
     */
    labelDot: { width: 10, height: 10, borderRadius: 5 },
    labelName: { flex: 1, minWidth: 0, color: colors.foreground, fontSize: 13 },
    /** Dimmed while its toggle is in flight, so a second press reads as ignored. */
    labelRowPending: { opacity: 0.5 },
    labelMenuError: {
      color: colors.statusDanger,
      fontSize: 11,
      lineHeight: 15,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: separator,
    },
    /** Holds the spinner while the repository's label catalogue loads. */
    centeredRow: { padding: 16, alignItems: "center" as const },
    /**
     * An explicit dismissal, because a plugin surface gets no key events —
     * there is no Escape to fall back on, and on a touch platform "press
     * outside the menu" is a guess rather than an affordance.
     */
    menuCloseRow: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: "flex-end" as const,
      borderTopWidth: 1,
      borderTopColor: separator,
    },
  };
}
