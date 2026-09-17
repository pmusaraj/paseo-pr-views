import { z } from "zod";
import type { LaunchDefaults } from "../../shared/board";

const PreferencesSchema = z.object({
  provider: z.string().optional(),
  isolation: z.enum(["local", "worktree"]).optional(),
  providerPreferences: z
    .record(
      z.string(),
      z.object({
        model: z.string().optional(),
        mode: z.string().optional(),
        thinkingByModel: z.record(z.string(), z.string()).optional(),
      }),
    )
    .optional(),
});

export function parseLaunchPreferences(raw: string | null): LaunchDefaults {
  const empty: LaunchDefaults = {
    provider: null,
    model: null,
    modeId: null,
    thinkingOptionId: null,
    isolation: "local",
  };
  if (raw === null) return empty;
  try {
    const parsed = PreferencesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return empty;
    const { provider, providerPreferences, isolation } = parsed.data;
    const preference = provider ? providerPreferences?.[provider] : undefined;
    return {
      provider: provider ?? null,
      model: preference?.model ?? null,
      modeId: preference?.mode ?? null,
      thinkingOptionId: preference?.model
        ? (preference.thinkingByModel?.[preference.model] ?? null)
        : null,
      isolation: isolation ?? "local",
    };
  } catch {
    return empty;
  }
}
