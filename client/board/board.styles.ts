import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";
import { buildBoardCardStyles } from "./board-card.styles";
import { buildBoardChromeStyles } from "./board-chrome.styles";
import { buildBoardFilterStyles } from "./board-filters.styles";
import { buildBoardGridStyles } from "./board-grid.styles";
import { buildBoardLabelMenuStyles } from "./board-label-menu.styles";
import { buildBoardRowStyles } from "./board-row.styles";

/**
 * The board surface's own styles: the header and its buttons, the
 * relation/owner/repository/sort filter chrome, the row list and its cards,
 * and the label menu the list row opens. Each feature keeps its own slice
 * next to the components that use it (`board-chrome.styles.ts`,
 * `board-filters.styles.ts`, `board-row.styles.ts`, `board-card.styles.ts`,
 * `board-label-menu.styles.ts`, `board-grid.styles.ts`); this is only where
 * the slices are merged back into the one object `theme/use-styles` composes
 * into the single `styles` prop every component still receives.
 */
export function buildBoardStyles(props: PluginSurfaceProps, tokens: ThemeTokens) {
  return {
    ...buildBoardChromeStyles(props, tokens),
    ...buildBoardFilterStyles(props, tokens),
    ...buildBoardGridStyles(props, tokens),
    ...buildBoardCardStyles(props, tokens),
    ...buildBoardLabelMenuStyles(props, tokens),
    ...buildBoardRowStyles(props, tokens),
  };
}
