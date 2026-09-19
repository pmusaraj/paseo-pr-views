import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { listSavedViews, type SavedView, type SearchPage } from "../../shared/saved-views";
import { createForegroundClient, SEARCH_SCOPE } from "./foreground-client";
import type { BackgroundClient } from "./background-client";
import { searchRequest } from "./search-cache";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const background = { getSnapshot: () => ({}) } as unknown as BackgroundClient;
const page: SearchPage = {
  items: [], login: "viewer", total: 0, hasNextPage: false, endCursor: null,
  resolvedQuery: "is:pr", effectiveDate: "2026-09-18", fetchedAt: "now", repositoryProjects: {},
};
const newItem: SearchPage["items"][number] = {
  id: "new", number: 1, title: "New PR", url: "", repository: "team/repo",
  updatedAt: "now", createdAt: "now", lastCommitAt: null, commentsCount: 0,
  labels: [], author: "viewer", detail: null, owner: "team", relations: [],
  linkedIssues: [], checks: null, state: "OPEN", isDraft: false,
};

function setup(initialFocus = true) {
  vi.useFakeTimers();
  const client = new QueryClient();
  let views: SavedView[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: String(i), query: `repo:team/${i}` }));
  let focused = initialFocus;
  const listeners = new Set<() => void>();
  const load = vi.fn(async (_input: { query: string }) => page);
  const rpc = vi.fn(async (contract, input) => contract === listSavedViews ? views : load(input));
  const foreground = createForegroundClient({ rpc } as Pick<PluginClientContext, "rpc">, client, background, {
    isFocused: () => focused,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
  cleanups.push(() => foreground.dispose());
  return {
    client, foreground, load, rpc,
    get views() { return views; },
    setViews(next: SavedView[]) { views = next; foreground.setViews(next); },
    focus(next: boolean) { focused = next; for (const listener of listeners) listener(); },
    store(id: string) {
      const view = views.find((entry) => entry.id === id)!;
      return searchRequest(client, SEARCH_SCOPE, id, view.query, load, background).snapshots;
    },
  };
}

describe("plugin-wide foreground refresh", () => {
  it("loads only the first five views without a mounted PR screen, then repeats every five minutes", async () => {
    const ctx = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load.mock.calls.map(([input]) => input.query)).toEqual(ctx.views.slice(0, 5).map((view) => view.query));
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual([]);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(ctx.load).toHaveBeenCalledTimes(10);
    expect(ctx.store("5").getSnapshot().displayed).toBeNull();
  });

  it("stays idle without focus and resumes an overdue sweep on focus", async () => {
    const ctx = setup(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(ctx.rpc).not.toHaveBeenCalled();
    ctx.focus(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledTimes(5);
    ctx.focus(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(ctx.load).toHaveBeenCalledTimes(5);
    ctx.focus(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledTimes(10);
  });

  it("stages new items without changing displayed data and clears only views actually applied", async () => {
    const ctx = setup();
    await vi.advanceTimersByTimeAsync(0);
    const original = ctx.store("0").getSnapshot().displayed;
    ctx.load.mockResolvedValue({ ...page, items: [newItem], total: 1 });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual(["0", "1", "2", "3", "4"]);
    expect(ctx.store("0").getSnapshot().displayed).toBe(original);
    ctx.store("0").apply();
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual(["1", "2", "3", "4"]);
    for (const id of ["1", "2", "3", "4"]) ctx.store(id).apply();
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual([]);
  });

  it("reports new items in a sixth view fetched on demand, but not status-only changes", async () => {
    const ctx = setup();
    await vi.advanceTimersByTimeAsync(0);
    const store = ctx.store("5");
    store.stage({ pages: [page], revision: null });
    store.stage({ pages: [{ ...page, items: [newItem], total: 1 }], revision: null });
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual(["5"]);
    store.apply();
    store.stage({ pages: [{ ...page, items: [{ ...newItem, state: "MERGED" }], total: 1 }], revision: null });
    expect(store.getSnapshot().updateCount).toBe(1);
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual([]);
  });

  it("uses the latest view order and removes deleted views from unread state", async () => {
    const ctx = setup();
    await vi.advanceTimersByTimeAsync(0);
    ctx.store("0").stage({ pages: [{ ...page, items: [newItem], total: 1 }], revision: null });
    ctx.setViews(ctx.views.slice(1).reverse());
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual([]);
    ctx.load.mockClear();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(ctx.load.mock.calls.map(([input]) => input.query)).toEqual(ctx.views.map((view) => view.query));
  });

  it("cancels in-flight staging on loss of focus without proceeding to other views", async () => {
    const ctx = setup();
    let finish!: (result: SearchPage) => void;
    ctx.load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledOnce();
    ctx.focus(false);
    finish(page);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledOnce();
    expect(ctx.store("0").getSnapshot().displayed).toBeNull();
  });

  it("continues other views after a failure and stops all work on disposal", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = setup();
    ctx.load.mockRejectedValueOnce(new Error("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledTimes(5);
    expect(ctx.store("0").getSnapshot().displayed).toBeNull();
    expect(ctx.store("1").getSnapshot().displayed).not.toBeNull();
    ctx.foreground.dispose();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    ctx.focus(true);
    expect(ctx.load).toHaveBeenCalledTimes(5);
  });
});
