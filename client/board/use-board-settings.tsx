import { useCallback } from "react";
import { type SettingsState, useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import type { SettingsDefinition } from "@getpaseo/plugin";

import type { PromptSettings } from "../../shared/board";
import {
  displaySettings,
  normalizePrompts,
  promptSettings,
} from "../../shared/settings";

/** The Zod schema `displaySettings` was defined with, recovered so `display`'s type below need not repeat it. */
type DisplaySchema =
  typeof displaySettings extends SettingsDefinition<infer Schema>
    ? Schema
    : never;

/** What `useBoardSettings` exposes to the surface and to the other board hooks. */
export interface UseBoardSettingsResult {
  display: SettingsState<DisplaySchema>;
  savedFraction: number | null;
  /** The organisations and users to sweep beyond the viewer's own buckets. */
  watchedOwners: readonly string[];
  promptValues: PromptSettings | null;
  applyPrompts: (next: PromptSettings) => Promise<void>;
  /**
   * The panel's width, once per drag. A failure is logged and not shown: the
   * width the user just chose is on screen regardless, and a setting that did
   * not save is not a problem with the card in front of them.
   */
  commitWidth: (fraction: number) => void;
}

/**
 * How this client draws the board, kept by the host rather than by the
 * daemon: the filter and the panel width are read only to paint, so they no
 * longer ride along on `board.load` and no longer cost an RPC to save. The
 * host pushes a change to every connected client on its own.
 */
export function useBoardSettings(): UseBoardSettingsResult {
  const display = useSettings(displaySettings);
  const prompts = useSettings(promptSettings);
  const savedFraction =
    display.status === "ready" ? display.values.detailWidthFraction : null;
  const watchedOwners =
    display.status === "ready" ? display.values.watchedOwners : [];
  const toast = useToast();
  const promptValues = prompts.status === "ready" ? prompts.values : null;

  const commitWidth = useCallback(
    (fraction: number) => {
      if (display.status !== "ready") return;
      void display
        .save(
          { ...display.values, detailWidthFraction: fraction },
          display.revision,
        )
        .then((saved) => {
          if (!saved) console.warn("[pr-views] could not save the panel width");
        });
    },
    [display],
  );

  const applyPrompts = useCallback(
    // Async function expression, not an async arrow — see `use-board-query.tsx`.
    async function applyPrompts(next: PromptSettings) {
      if (prompts.status !== "ready") return;
      // Normalised here rather than in the schema, so the editor's draft can
      // hold a blank field while it is being cleared and only the *saved*
      // document reads a blank as "inherit".
      const saved = await prompts.save(
        normalizePrompts(next),
        prompts.revision,
      );
      if (!saved)
        toast.error(prompts.saveError ?? "The templates were not saved.");
    },
    [prompts, toast],
  );

  return {
    display,
    savedFraction,
    watchedOwners,
    promptValues,
    applyPrompts,
    commitWidth,
  };
}
