import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createBackgroundClient } from "./background-client";

const marked = {
  mine: {
    query: "author:@me",
    revision: "1",
    unread: true,
    checkedAt: null,
    error: null,
  },
};
const cleared = { mine: { ...marked.mine, unread: false } };
afterEach(() => vi.useRealTimers());

describe("background status client", () => {
  it("polls while the surface is closed and publishes acknowledgements immediately", async () => {
    vi.useFakeTimers();
    const rpc = vi.fn().mockResolvedValue(marked);
    const client = createBackgroundClient({
      rpc,
    } as unknown as PluginClientContext);
    const listener = vi.fn();
    client.subscribe(listener);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot()).toEqual(marked);
    expect(listener).toHaveBeenCalledOnce();
    rpc.mockResolvedValue(cleared);
    await client.acknowledge("mine", "author:@me", "1");
    expect(client.getSnapshot()).toEqual(cleared);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(rpc).toHaveBeenCalledTimes(3);
    client.dispose();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("does not let an old poll reinstate an acknowledged marker", async () => {
    vi.useFakeTimers();
    let finish!: (result: typeof marked) => void;
    const rpc = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(cleared);
    const client = createBackgroundClient({
      rpc,
    } as unknown as PluginClientContext);
    await client.acknowledge("mine", "author:@me", "1");
    finish(marked);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.getSnapshot()).toEqual(cleared);
    client.dispose();
  });
});
