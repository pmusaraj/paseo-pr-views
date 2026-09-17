import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { ThemeTokens } from "../theme/tokens";

/**
 * The prompt editor's own styles: the account field, the project scope
 * chips, and the four template fields. Composed into the one `Styles`
 * object by `theme/use-styles`.
 */
export function buildSettingsStyles({ layout }: PluginSurfaceProps, { colors, separator }: ThemeTokens) {
  return {
      // --- Configure prompts view ---
      settingsBody: { padding: layout.compact ? 12 : 20, gap: 20, paddingBottom: 40 },
      section: { gap: 8 },
      sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "600" as const },
      sectionHint: { color: colors.foregroundMuted, fontSize: 12, lineHeight: 17 },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      /** Wraps rather than scrolls: every scope stays reachable without a gesture. */
      scopeRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 },
      scopeChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
      scopeLabelSelected: { color: colors.accentForeground, fontSize: 12 },
      fieldLabel: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
      /**
       * `textAlignVertical` is the Android spelling for top-aligning multiline
       * text; the other platforms already do it.
       */
      templateInput: {
        color: colors.foreground,
        borderWidth: 1,
        borderColor: separator,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 13,
        lineHeight: 18,
        minHeight: 64,
        textAlignVertical: "top" as const,
      },
      inheritedNote: { color: colors.foregroundMuted, fontSize: 11, fontStyle: "italic" as const },
      buttonDisabled: { opacity: 0.5 },
  };
}
