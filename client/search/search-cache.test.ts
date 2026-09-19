import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { SearchPage } from "../../shared/saved-views";
import type { BackgroundClient } from "./background-client";
import { nextSavedView, preloadSearch, searchRequest } from "./search-cache";

const clients: QueryClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });
const background = { getSnapshot: () => ({}) } as unknown as BackgroundClient;
const emptyPage: SearchPage = {
  items: [], login: "viewer", total: 0, hasNextPage: false, endCursor: null,
  resolvedQuery: "is:pr", effectiveDate: "2026-09-18", fetchedAt: "now", repositoryProjects: {},
};
function setup() {
  const client = new QueryClient();
  clients.push(client);
  const load = vi.fn(async () => emptyPage);
  const request = searchRequest(client, "host", "next", "is:pr", load, background);
  return { client, load, request };
}

describe("next-view preloading", () => {
  it("chooses only the following saved view, without wrapping or preview preloads", () => {
    const views = ["a", "b", "c"].map((id) => ({ id, name: id, query: "is:pr" }));
    expect(nextSavedView(views, "a")).toBe(views[1]);
    expect(nextSavedView(views, "b")).toBe(views[2]);
    expect(nextSavedView(views, "c")).toBeNull();
    expect(nextSavedView(views, null)).toBeNull();
    expect(nextSavedView([], "a")).toBeNull();
  });

  it("makes prefetched data immediately available when selecting the view, including empty searches", async () => {
    const { client, load, request } = setup();
    await preloadSearch(client, request);
    const selected = searchRequest(client, "host", "next", "is:pr", load, background);
    expect(selected.snapshots).toBe(request.snapshots);
    expect(selected.snapshots.getSnapshot().displayed?.pages).toEqual([emptyPage]);
    await preloadSearch(client, selected);
    expect(load).toHaveBeenCalledOnce();
    expect(selected.snapshots.getSnapshot().updateCount).toBe(0);
  });

  it("shares an in-flight preload with focus loading, rather than issuing another request", async () => {
    const { client, load, request } = setup();
    let finish!: (page: SearchPage) => void;
    load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const preload = preloadSearch(client, request);
    const observer = new QueryObserver(client, { ...request.options, staleTime: 0 });
    const unsubscribe = observer.subscribe(() => {});
    expect(load).toHaveBeenCalledOnce();
    finish(emptyPage);
    await preload;
    expect(observer.getCurrentResult().data?.pages).toEqual([emptyPage]);
    expect(request.snapshots.getSnapshot().displayed?.pages).toEqual([emptyPage]);
    unsubscribe();
  });

  it("does not replace cached or pending snapshots during another preload attempt", async () => {
    const { client, load, request } = setup();
    await preloadSearch(client, request);
    const pending = { pages: [{ ...emptyPage, fetchedAt: "later" }], revision: null };
    request.snapshots.stage(pending);
    const state = request.snapshots.getSnapshot();
    await preloadSearch(client, request);
    expect(request.snapshots.getSnapshot()).toBe(state);
    expect(load).toHaveBeenCalledOnce();
  });

  it("isolates caches by host, view and query", async () => {
    const { client, load, request } = setup();
    await preloadSearch(client, request);
    for (const [host, view, query] of [
      ["other-host", "next", "is:pr"], ["host", "other-view", "is:pr"], ["host", "next", "is:pr is:open"],
    ] as const) {
      const other = searchRequest(client, host, view, query, load, background);
      expect(other.snapshots.getSnapshot().displayed).toBeNull();
      await preloadSearch(client, other);
    }
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("does not loop on preload failures, but retries normally on focus", async () => {
    const { client, load, request } = setup();
    load.mockRejectedValueOnce(new Error("offline"));
    await preloadSearch(client, request);
    expect(request.snapshots.getSnapshot().displayed).toBeNull();
    await preloadSearch(client, request);
    expect(load).toHaveBeenCalledOnce();
    await client.fetchQuery({ ...request.options, staleTime: 0 });
    expect(request.snapshots.getSnapshot().displayed?.pages).toEqual([emptyPage]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
