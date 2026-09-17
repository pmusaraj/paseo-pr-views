import type { BoardColumn } from "../../shared/board";
import { Cache } from "../cache/cache";

/**
 * A board costs three `gh` subprocesses and a round trip to GitHub, so one is
 * reused for a short window — the surface remounts on every workspace switch
 * and should not pay that each time. The Refresh button sends `force`.
 */
export const BOARD_TTL_MS = 5 * 60_000;

export interface CachedBoard {
  columns: BoardColumn[];
  fetchedAt: string;
}

/** Keyed by login, limit and the watched owners — see `loadBoardHandler`. */
export const boardCache = new Cache<CachedBoard>("board-reviews-v1");

/**
 * Keeps the cached board honest. Without this a label edited now would be
 * undone on screen by the next cache hit — the board is remembered for five
 * minutes, and a surface remounts on every workspace switch.
 */
export async function patchCachedLabels(itemId: string, labels: readonly string[]): Promise<void> {
  await boardCache.patchAll((cached) => ({
    ...cached,
    columns: cached.columns.map((column) => ({
      ...column,
      items: column.items.map((item) => (item.id === itemId ? { ...item, labels: [...labels] } : item)),
    })),
  }));
}

/**
 * Drops one card from the cached board. A merged pull request no longer
 * answers the `state:open` search the board runs, so leaving it in the cache
 * would show it as open again for up to five minutes after it landed.
 */
export async function dropCachedItem(itemId: string): Promise<void> {
  await boardCache.patchAll((cached) => ({
    ...cached,
    columns: cached.columns.map((column) => ({
      ...column,
      items: column.items.filter((item) => item.id !== itemId),
    })),
  }));
}
