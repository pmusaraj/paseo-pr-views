import type { SearchPage } from "../../shared/saved-views";
import { mergeSearchPages } from "../lib/search-pages";

export const RESULT_LIMIT = 200;
export const REFRESH_INTERVAL_MS = 5 * 60_000;
export interface SearchSnapshot {
  pages: SearchPage[];
  revision: string | null;
}

/** A capped or incomplete search cannot acknowledge a daemon's full membership check. */
export function seenRevision(snapshot: SearchSnapshot | null): string | null {
  if (snapshot === null) return null;
  const first = snapshot.pages[0];
  const last = snapshot.pages.at(-1);
  if (!first || !last || last.hasNextPage || first.total > RESULT_LIMIT) return null;
  return mergeSearchPages(snapshot.pages).length >= first.total ? snapshot.revision : null;
}

export type LoadPage = (input: {
  query: string;
  force: boolean;
  cursor?: string;
  effectiveDate?: string;
}) => Promise<SearchPage>;

/** A replacement always owns its cursors and date, including across midnight. */
export async function loadSearchSnapshot(
  load: LoadPage,
  query: string,
  signal: AbortSignal,
  revision: string | null,
): Promise<SearchSnapshot> {
  const pages: SearchPage[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let effectiveDate: string | undefined;
  let count = 0;
  do {
    if (signal.aborted) throw new Error("Search cancelled.");
    const page = await load({
      query,
      force: true,
      ...(cursor === undefined ? {} : { cursor }),
      ...(effectiveDate === undefined ? {} : { effectiveDate }),
    });
    if (signal.aborted) throw new Error("Search cancelled.");
    if (pages[0] && page.login !== pages[0].login)
      throw new Error("GitHub account changed while loading. Please refresh again.");
    pages.push({ ...page, items: page.items.slice(0, RESULT_LIMIT - count) });
    count += page.items.length;
    effectiveDate = page.effectiveDate;
    if (!page.hasNextPage || count >= RESULT_LIMIT) break;
    if (page.endCursor === null) throw new Error("Search returned an incomplete page.");
    if (pages.length >= 10) throw new Error("Search returned too many incomplete pages.");
    if (cursors.has(page.endCursor)) throw new Error("Search returned a repeated page cursor.");
    cursors.add(page.endCursor);
    cursor = page.endCursor;
  } while (count < RESULT_LIMIT);
  return { pages, revision };
}

function fingerprint(item: SearchPage["items"][number]) {
  return JSON.stringify({
    ...item,
    labels: [...item.labels].sort(),
    relations: [...item.relations].sort(),
    linkedIssues: [...item.linkedIssues].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

/** Count each added, removed or changed item once; order and page metadata aren't updates. */
export function countSearchUpdates(before: SearchSnapshot, after: SearchSnapshot) {
  const previous = new Map(mergeSearchPages(before.pages).map((item) => [item.id, fingerprint(item)]));
  let count = 0;
  for (const item of mergeSearchPages(after.pages)) {
    if (previous.get(item.id) !== fingerprint(item)) count++;
    previous.delete(item.id);
  }
  return count + previous.size;
}

interface SnapshotState {
  displayed: SearchSnapshot | null;
  pending: SearchSnapshot | null;
  seen: SearchSnapshot | null;
  updateCount: number;
}

/** Keep unseen results current; once viewed, hold replacements until explicitly applied. */
export function createSearchSnapshots() {
  let viewed = false;
  let state: SnapshotState = { displayed: null, pending: null, seen: null, updateCount: 0 };
  const listeners = new Set<() => void>();
  const publish = (next: SnapshotState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    hasSubscribers: () => listeners.size > 0,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markViewed() {
      if (viewed) return;
      viewed = true;
      if (state.displayed !== null) publish({ ...state, seen: state.displayed });
    },
    stage(next: SearchSnapshot) {
      const displayed = state.displayed;
      if (!viewed || displayed === null || displayed.pages[0]?.login !== next.pages[0]?.login) {
        publish({ displayed: next, pending: null, seen: viewed ? next : null, updateCount: 0 });
        return;
      }
      const updateCount = countSearchUpdates(displayed, next);
      publish({ displayed, pending: next, updateCount, seen: updateCount === 0 ? next : state.seen });
    },
    apply: () => {
      if (state.pending === null) return;
      publish({ displayed: state.pending, seen: state.pending, pending: null, updateCount: 0 });
    },
  };
}
export type SearchSnapshots = ReturnType<typeof createSearchSnapshots>;
