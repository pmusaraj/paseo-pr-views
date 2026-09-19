import { useEffect, useSyncExternalStore } from "react";
import type { SavedView } from "../../shared/saved-views";
import type { BackgroundStatus } from "../../shared/background";
import type { BackgroundClient } from "./background-client";
import { seenRevision, type SearchSnapshot } from "./search-snapshot";

export function checkFor(view: SavedView | null, checks: BackgroundStatus) {
  if (!view?.backgroundCheck) return undefined;
  const check = checks[view.id];
  return check?.query === view.query ? check : undefined;
}

export function useViewChecks(
  background: BackgroundClient,
  selected: SavedView | null,
  preview: string | null,
  seen: SearchSnapshot | null,
  onError: (error: string) => void,
) {
  const checks = useSyncExternalStore(
    background.subscribe,
    background.getSnapshot,
  );
  const selectedCheck = checkFor(selected, checks);
  const selectedId = selected?.id;
  const selectedQuery = selected?.query;
  // A daemon check can cover more than the displayed result cap. Do not clear
  // its marker unless this snapshot covers the whole search and that revision.
  const revision = seenRevision(seen);
  useEffect(() => {
    if (preview !== null || !selectedId || !selectedQuery || !revision) return;
    void background
      .acknowledge(selectedId, selectedQuery, revision)
      .catch((error) => {
        onError(
          `Could not clear the new items marker: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }, [
    background,
    selectedId,
    selectedQuery,
    revision,
    preview,
    onError,
  ]);
  return { checks, selectedCheck };
}
