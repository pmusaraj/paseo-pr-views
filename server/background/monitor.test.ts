import { describe, expect, it, vi } from "vitest";
import { CHECK_INTERVAL_MS, ViewMonitor } from "./monitor";
import type { SavedView } from "../../shared/saved-views";
import type { CheckRecords } from "./storage";

function setup() {
  let now = Date.parse("2026-09-17T12:00:00Z");
  let views: SavedView[] = [
    { id: "mine", name: "Mine", query: "author:@me", backgroundCheck: true },
  ];
  let disk: CheckRecords = {};
  const fetch = vi.fn(async (_query: string) => ["a", "b"]);
  const dependencies = {
    views: async () => views,
    read: async () => structuredClone(disk),
    write: vi.fn(async (value: CheckRecords) => {
      disk = structuredClone(value);
    }),
    login: vi.fn(async () => "viewer"),
    fetch,
    now: () => now,
  };
  return {
    monitor: new ViewMonitor(dependencies),
    dependencies,
    fetch,
    advance(this: void) {
      now += CHECK_INTERVAL_MS;
    },
    setViews(this: void, value: SavedView[]) {
      views = value;
    },
  };
}

describe("background view monitor", () => {
  it("baselines quietly, checks every ten minutes, and ignores reordering and removals", async () => {
    const { monitor, fetch, advance } = setup();
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(false);
    await monitor.check();
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(["b", "a"]);
    advance();
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(false);
    fetch.mockResolvedValue(["a"]);
    advance();
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(false);
    fetch.mockResolvedValue(["a", "new"]);
    advance();
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(true);
  });

  it("persists unread markers and clears only the acknowledged view and revision", async () => {
    const { monitor, dependencies, fetch, advance, setViews } = setup();
    setViews([
      { id: "mine", name: "Mine", query: "author:@me", backgroundCheck: true },
      { id: "team", name: "Team", query: "org:team", backgroundCheck: true },
    ]);
    await monitor.check();
    fetch.mockResolvedValue(["a", "b", "new"]);
    advance();
    await monitor.check();
    const before = (await monitor.status()).mine!;
    const restarted = new ViewMonitor(dependencies);
    expect((await restarted.status()).mine?.unread).toBe(true);
    await restarted.acknowledge({
      id: "mine",
      query: before.query,
      revision: before.revision,
    });
    expect((await restarted.status()).mine?.unread).toBe(false);
    expect((await restarted.status()).team?.unread).toBe(true);
    fetch.mockResolvedValue(["a", "b", "new", "newer"]);
    advance();
    await restarted.check();
    await restarted.acknowledge({
      id: "mine",
      query: before.query,
      revision: before.revision,
    });
    expect((await restarted.status()).mine?.unread).toBe(true);
  });

  it("does not replace a baseline on failure or erase an unread marker", async () => {
    const { monitor, fetch, advance } = setup();
    await monitor.check();
    fetch.mockRejectedValue(new Error("Offline"));
    advance();
    await monitor.check();
    expect((await monitor.status()).mine).toMatchObject({
      unread: false,
      error: "Offline",
    });
    fetch.mockResolvedValue(["a", "b", "new"]);
    advance();
    await monitor.check();
    expect((await monitor.status()).mine).toMatchObject({
      unread: true,
      error: null,
    });
    fetch.mockRejectedValue(new Error("Rate limited"));
    advance();
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(true);
  });

  it("baselines after an initial failure and when the query or account changes", async () => {
    const { monitor, dependencies, fetch, advance, setViews } = setup();
    fetch.mockRejectedValueOnce(new Error("Offline"));
    await monitor.check();
    await monitor.check();
    expect(fetch).toHaveBeenCalledTimes(1);
    advance();
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(false);
    setViews([
      { id: "mine", name: "Mine", query: "org:changed", backgroundCheck: true },
    ]);
    fetch.mockResolvedValue(["different"]);
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(false);
    dependencies.login.mockResolvedValue("another-account");
    fetch.mockResolvedValue(["private"]);
    advance();
    await monitor.check();
    expect((await monitor.status()).mine?.unread).toBe(false);
  });

  it("drops disabled and deleted views and does not query GitHub when none are enabled", async () => {
    const { monitor, dependencies, setViews } = setup();
    await monitor.check();
    setViews([
      { id: "mine", name: "Mine", query: "author:@me", backgroundCheck: false },
    ]);
    expect(await monitor.status()).toEqual({});
    await monitor.check();
    expect(dependencies.login).toHaveBeenCalledTimes(1);
    setViews([]);
    await monitor.check();
    expect(await monitor.status()).toEqual({});
  });

  it("coalesces overlapping checks and discards in-flight results after shutdown", async () => {
    const { monitor, fetch, dependencies } = setup();
    let finish!: (ids: string[]) => void;
    fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = monitor.check();
    expect(monitor.check()).toBe(first);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    monitor.stop();
    finish(["a"]);
    await first;
    expect(dependencies.write).not.toHaveBeenCalled();
  });
});
