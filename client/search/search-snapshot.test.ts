import { describe, expect, it, vi } from "vitest";
import type { SearchPage } from "../../shared/saved-views";
import { countSearchUpdates, loadSearchSnapshot, createSearchSnapshots, seenRevision, type SearchSnapshot } from "./search-snapshot";

function item(id: string): SearchPage["items"][number] {
  return {
    id, number: 1, title: id, url: "", repository: "team/repo",
    updatedAt: "2026-09-18", createdAt: "2026-09-01", lastCommitAt: null,
    commentsCount: 0, labels: [], author: "viewer", detail: null,
    owner: "team", relations: [], linkedIssues: [], checks: null,
    state: "OPEN", isDraft: false, additions: 10, deletions: 2, headOid: "a",
  };
}

function page(ids: string[], overrides: Partial<SearchPage> = {}): SearchPage {
  return {
    items: ids.map(item), login: "viewer", total: ids.length,
    hasNextPage: false, endCursor: null, resolvedQuery: "is:pr",
    effectiveDate: "2026-09-18", fetchedAt: "2026-09-18T12:00:00Z",
    repositoryProjects: {}, ...overrides,
  };
}

function snapshot(ids: string[], revision = "1"): SearchSnapshot {
  return { pages: [page(ids)], revision };
}

describe("staged search snapshots", () => {
  it("acknowledges only the revision actually seen, and never an incomplete or capped result", () => {
    const store = createSearchSnapshots();
    store.stage(snapshot(["a"], "seen"));
    store.stage(snapshot(["a", "b"], "pending"));
    expect(seenRevision(store.getSnapshot().seen)).toBe("seen");
    store.apply();
    expect(seenRevision(store.getSnapshot().seen)).toBe("pending");
    const incomplete = snapshot(["a"]);
    incomplete.pages[0]!.total = 2;
    expect(seenRevision(incomplete)).toBeNull();
    incomplete.pages[0]!.total = 201;
    expect(seenRevision(incomplete)).toBeNull();
    incomplete.pages[0]!.total = 1;
    incomplete.pages[0]!.hasNextPage = true;
    expect(seenRevision(incomplete)).toBeNull();
  });
  it("keeps rows and metadata unchanged until applying the cached update synchronously", () => {
    const store = createSearchSnapshots();
    const first = snapshot(["a", "b"]);
    const next = snapshot(["b", "c"], "2");
    store.stage(first);
    expect(store.getSnapshot().displayed).toBe(first);
    store.stage(next);
    expect(store.getSnapshot()).toMatchObject({ displayed: first, pending: next, updateCount: 2, seen: first });
    store.apply();
    expect(store.getSnapshot()).toEqual({ displayed: next, pending: null, updateCount: 0, seen: next });
  });

  it.each([
    { state: "MERGED" as const }, { isDraft: true }, { additions: 30 },
    { deletions: 20 }, { headOid: "different-commit-same-line-counts" },
    { prReview: "approved" as const }, { checks: { passed: 1, failed: 0, pending: 0 } },
    { labels: ["bug"] }, { title: "Changed" }, { commentsCount: 2 },
  ])("counts changes to existing data: %o", (change) => {
    const before = snapshot(["a"]);
    const after = snapshot(["a"]);
    Object.assign(after.pages[0]!.items[0]!, change);
    expect(countSearchUpdates(before, after)).toBe(1);
  });

  it("counts each affected item once, ignoring row order, label order and fetch metadata", () => {
    const before = snapshot(["a", "b"]);
    before.pages[0]!.items[0]!.labels = ["bug", "ready"];
    const after = snapshot(["b", "a"]);
    after.pages[0]!.items[1]!.labels = ["ready", "bug"];
    after.pages[0]!.fetchedAt = "later";
    expect(countSearchUpdates(before, after)).toBe(0);
    Object.assign(after.pages[0]!.items[1]!, { title: "Changed", additions: 80, state: "CLOSED" });
    expect(countSearchUpdates(before, after)).toBe(1);
  });

  it("compares repeated checks against displayed data and removes reverted updates", () => {
    const store = createSearchSnapshots();
    const first = snapshot(["a"]);
    store.stage(first);
    store.stage(snapshot(["a", "b"]));
    store.stage(snapshot(["a", "b", "c"]));
    expect(store.getSnapshot().updateCount).toBe(2);
    store.stage(snapshot(["a"], "4"));
    expect(store.getSnapshot().updateCount).toBe(0);
    expect(store.getSnapshot().displayed).toBe(first);
    expect(store.getSnapshot().seen?.revision).toBe("4");
  });

  it("counts an in-flight result against a snapshot applied while it was loading", () => {
    const store = createSearchSnapshots();
    store.stage(snapshot(["a"]));
    store.stage(snapshot(["a", "b"]));
    store.apply();
    store.stage(snapshot(["a", "b", "c"]));
    expect(store.getSnapshot().updateCount).toBe(1);
  });

  it("does not compare across GitHub accounts", () => {
    const store = createSearchSnapshots();
    store.stage(snapshot(["private-a"]));
    const next = snapshot(["private-b"]);
    next.pages[0]!.login = "other-viewer";
    store.stage(next);
    expect(store.getSnapshot()).toMatchObject({ displayed: next, pending: null, updateCount: 0 });
  });
});

describe("loading replacement snapshots", () => {
  it("stops at 200 results, using fresh cursors and a fixed date for every page", async () => {
    const ids = (start: number) => Array.from({ length: 100 }, (_, index) => String(start + index));
    const load = vi.fn()
      .mockResolvedValueOnce(page(ids(0), { total: 1000, hasNextPage: true, endCursor: "second" }))
      .mockResolvedValueOnce(page(ids(100), { total: 1000, hasNextPage: true, endCursor: "third" }));
    const result = await loadSearchSnapshot(load, "is:pr", new AbortController().signal, "revision");
    expect(load.mock.calls).toEqual([
      [{ query: "is:pr", force: true }],
      [{ query: "is:pr", force: true, cursor: "second", effectiveDate: "2026-09-18" }],
    ]);
    expect(result.pages.flatMap((entry) => entry.items)).toHaveLength(200);
    expect(result.revision).toBe("revision");
  });

  it("trims a page crossing the limit, including older cached page sizes", async () => {
    let index = 0;
    const load = vi.fn(async () => page(Array.from({ length: 30 }, () => String(index++)), {
      total: 1000, hasNextPage: true, endCursor: String(index),
    }));
    const result = await loadSearchSnapshot(load, "is:pr", new AbortController().signal, null);
    expect(result.pages.flatMap((entry) => entry.items)).toHaveLength(200);
    expect(load).toHaveBeenCalledTimes(7);
  });

  it("leaves both displayed and pending data intact when a replacement fails partway", async () => {
    const store = createSearchSnapshots();
    store.stage(snapshot(["a"]));
    store.stage(snapshot(["a", "b"]));
    const state = store.getSnapshot();
    const load = vi.fn()
      .mockResolvedValueOnce(page(["c"], { hasNextPage: true, endCursor: "next" }))
      .mockRejectedValueOnce(new Error("rate limit"));
    await expect(loadSearchSnapshot(load, "is:pr", new AbortController().signal, null)
      .then((next) => store.stage(next))).rejects.toThrow("rate limit");
    expect(store.getSnapshot()).toBe(state);
  });

  it("discards a late response after switching views and does not request another page", async () => {
    const controller = new AbortController();
    let finish!: (result: SearchPage) => void;
    const load = vi.fn(() => new Promise<SearchPage>((resolve) => { finish = resolve; }));
    const stage = vi.fn();
    const request = loadSearchSnapshot(load, "is:pr", controller.signal, null).then(stage);
    controller.abort();
    finish(page(["late"], { hasNextPage: true, endCursor: "next" }));
    await expect(request).rejects.toThrow("cancelled");
    expect(stage).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();
  });

  it("rejects repeated cursors and mixed-account pages", async () => {
    const load = vi.fn().mockResolvedValue(page(["a"], { hasNextPage: true, endCursor: "same" }));
    await expect(loadSearchSnapshot(load, "is:pr", new AbortController().signal, null))
      .rejects.toThrow("repeated page cursor");
    load.mockReset().mockResolvedValueOnce(page(["a"], { hasNextPage: true, endCursor: "next" }))
      .mockResolvedValueOnce(page(["b"], { login: "other" }));
    await expect(loadSearchSnapshot(load, "is:pr", new AbortController().signal, null))
      .rejects.toThrow("account changed");
  });

  it("does not publish an incomplete page or loop indefinitely on empty pages", async () => {
    const load = vi.fn().mockResolvedValue(page(["a"], { hasNextPage: true, endCursor: null }));
    await expect(loadSearchSnapshot(load, "is:pr", new AbortController().signal, null))
      .rejects.toThrow("incomplete page");
    let index = 0;
    load.mockReset().mockImplementation(async () => page([], { hasNextPage: true, endCursor: String(index++) }));
    await expect(loadSearchSnapshot(load, "is:pr", new AbortController().signal, null))
      .rejects.toThrow("too many incomplete pages");
    expect(load).toHaveBeenCalledTimes(10);
  });
});
