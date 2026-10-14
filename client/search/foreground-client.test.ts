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

function setup() {
  vi.useFakeTimers();
  const client = new QueryClient();
  let views: SavedView[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: String(i), query: `repo:team/${i}`, backgroundCheck: i !== 1 }));
  let status: import("../../shared/background").BackgroundStatus = {};
  const listeners = new Set<() => void>();
  const load = vi.fn(async (_input: { query: string }) => page);
  const rpc = vi.fn(async (contract, input) => contract === listSavedViews ? views : load(input));
  const background = {
    getSnapshot: () => status,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  } as unknown as BackgroundClient;
  const foreground = createForegroundClient({ rpc } as Pick<PluginClientContext, "rpc">, client, background);
  cleanups.push(() => foreground.dispose());
  return {
    client, foreground, load, rpc,
    get views() { return views; },
    setViews(next: SavedView[]) { views = next; foreground.setViews(next); },
    checked(id: string, time = "2026-10-14T12:00:00Z") {
      status = { ...status, [id]: { query: views.find(v => v.id === id)!.query, checkedAt: time, revision: time, unread: false, error: null } };
      for (const listener of listeners) listener();
    },
    store(id: string) {
      const view = views.find((entry) => entry.id === id)!;
      return searchRequest(client, SEARCH_SCOPE, id, view.query, load, background).snapshots;
    },
  };
}

describe("daemon-driven result refresh", () => {
  it("refreshes only enabled views after a successful daemon check, including the sixth view", async () => {
    const ctx = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).not.toHaveBeenCalled();
    ctx.checked("1");
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).not.toHaveBeenCalled();
    ctx.checked("5");
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load.mock.calls.map(([input]) => input.query)).toEqual([ctx.views[5]!.query]);
    ctx.checked("5");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctx.load).toHaveBeenCalledOnce();
    ctx.checked("5", "2026-10-14T12:02:00Z");
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledTimes(2);
  });

  it("stages updates without changing viewed results and clears the marker when applied", async () => {
    const ctx = setup();
    ctx.checked("0");
    await vi.advanceTimersByTimeAsync(0);
    const store = ctx.store("0");
    store.markViewed();
    const original = store.getSnapshot().displayed;
    ctx.load.mockResolvedValue({ ...page, items: [newItem], total: 1 });
    ctx.checked("0", "2026-10-14T12:02:00Z");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot()).toMatchObject({ displayed: original, updateCount: 1 });
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual(["0"]);
    store.apply();
    expect(ctx.foreground.getSnapshot().newViewIds).toEqual([]);
  });

  it("does not retry a failed result load on every status poll and stops on disposal", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = setup();
    ctx.load.mockRejectedValue(new Error("offline"));
    ctx.checked("0");
    await vi.advanceTimersByTimeAsync(0);
    ctx.checked("0");
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledOnce();
    ctx.foreground.dispose();
    ctx.checked("5");
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.load).toHaveBeenCalledOnce();
  });
});
