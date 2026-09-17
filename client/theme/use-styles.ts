import { prStatusColors } from "./pr-colors";
import { useMemo } from "react";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

import { buildBoardStyles } from "../board/board.styles";
import { buildDetailStyles } from "../detail/detail.styles";
import { buildLaunchStyles } from "../launch/launch.styles";
import { buildSettingsStyles } from "../settings/settings.styles";
import { computeThemeTokens } from "./tokens";

/**
 * The whole surface's stylesheet, recomputed only when the theme or the
 * compact/wide layout changes. Each feature keeps its own slice of this
 * object next to the components that use it; this is only where the slices
 * are merged back into the single `styles` prop every component still
 * receives, so moving a style to its feature never touched a call site.
 */
export function useStyles(props: PluginSurfaceProps) {
  return useMemo(() => {
    const tokens = computeThemeTokens(props);
    return {
      prStatusColors: prStatusColors(props.theme.colors),
      ...buildBoardStyles(props, tokens),
      ...buildLaunchStyles(props, tokens),
      ...buildSettingsStyles(props, tokens),
      ...buildDetailStyles(props, tokens),
    };
  }, [props.theme, props.layout.compact]);
}

export type Styles = ReturnType<typeof useStyles>;
