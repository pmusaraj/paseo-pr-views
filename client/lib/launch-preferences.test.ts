import { describe, expect, it } from "vitest";
import { parseLaunchPreferences } from "./launch-preferences";

describe("Paseo launch preferences", () => {
  it("uses the current provider's model, mode and model-specific thinking choice", () => {
    expect(
      parseLaunchPreferences(
        JSON.stringify({
          provider: "codex",
          isolation: "worktree",
          providerPreferences: {
            codex: {
              model: "model-a",
              mode: "full-auto",
              thinkingByModel: { "model-a": "high", "model-b": "low" },
            },
            other: { model: "wrong" },
          },
        }),
      ),
    ).toEqual({
      provider: "codex",
      model: "model-a",
      modeId: "full-auto",
      thinkingOptionId: "high",
      isolation: "worktree",
    });
  });

  it("does not carry a model preference across providers or thinking across models", () => {
    expect(
      parseLaunchPreferences(
        JSON.stringify({
          provider: "other",
          providerPreferences: { codex: { model: "model-a" } },
        }),
      ).model,
    ).toBeNull();
    expect(
      parseLaunchPreferences(
        JSON.stringify({
          provider: "codex",
          providerPreferences: {
            codex: { model: "model-b", thinkingByModel: { "model-a": "high" } },
          },
        }),
      ).thinkingOptionId,
    ).toBeNull();
  });

  it("falls back to live provider defaults when preferences are absent or malformed", () => {
    for (const raw of [null, "{", "null", '{"provider":1}']) {
      expect(parseLaunchPreferences(raw)).toEqual({
        provider: null,
        model: null,
        modeId: null,
        thinkingOptionId: null,
        isolation: "local",
      });
    }
  });
});
