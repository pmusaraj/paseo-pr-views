import type { QueryClient } from "@tanstack/react-query";
import type { SavedView } from "../../shared/saved-views";
import { SEARCH_KEY } from "../lib/search-pages";
import { createSearchSnapshots, loadSearchSnapshot, type SearchSnapshots, type LoadPage } from "./search-snapshot";
import type { BackgroundClient } from "./background-client";

const stores = new WeakMap<QueryClient, Map<string, SearchSnapshots>>();

function snapshotsFor(client: QueryClient, key: string) {
  let entries = stores.get(client);
  if (!entries) {
    entries = new Map();
    stores.set(client, entries);
    const cacheEntries = entries;
    // Match snapshot lifetime to the corresponding network query's cache lifetime.
    client.getQueryCache().subscribe((event) => {
      if (event.type === "removed" && event.query.queryKey[0] === SEARCH_KEY) {
        const key = JSON.stringify(event.query.queryKey);
        if (!cacheEntries.get(key)?.hasSubscribers()) cacheEntries.delete(key);
      }
    });
  }
  let snapshots = entries.get(key);
  if (!snapshots) {
    snapshots = createSearchSnapshots();
    entries.set(key, snapshots);
  }
  return snapshots;
}

export function searchRequest(
  client: QueryClient,
  hostId: string,
  viewId: string | null,
  query: string | null,
  load: LoadPage,
  background: BackgroundClient,
) {
  const queryKey = [SEARCH_KEY, hostId, viewId, query];
  const snapshots = snapshotsFor(client, JSON.stringify(queryKey));
  return {
    snapshots,
    options: {
      queryKey,
      gcTime: 60 * 60_000,
      retry: false as const,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const check = viewId === null ? undefined : background.getSnapshot()[viewId];
        const revision = check?.query === query && check.unread ? check.revision : null;
        const next = await loadSearchSnapshot(load, query ?? "", signal, revision);
        if (signal.aborted) throw new Error("Search cancelled.");
        snapshots.stage(next);
        return next;
      },
    },
  };
}

export function nextSavedView(views: readonly SavedView[], selectedId: string | null) {
  const index = views.findIndex((view) => view.id === selectedId);
  return index < 0 ? null : views[index + 1] ?? null;
}

/** Seed only an empty next view; successful empty searches count as cached data. */
export async function preloadSearch(client: QueryClient, request: ReturnType<typeof searchRequest>) {
  if (request.snapshots.getSnapshot().displayed !== null) return;
  const state = client.getQueryState(request.options.queryKey);
  // No retry loop for speculative work; selecting the view still retries normally.
  if (state?.status === "error") return;
  await client.prefetchQuery({ ...request.options, staleTime: Infinity });
}
