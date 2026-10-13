import { afterEach, expect, it, vi } from "vitest";
import { scheduleForegroundRefresh } from "./foreground-refresh";

afterEach(() => vi.useRealTimers());

it("starts four views ten seconds apart, with each repeating every minute", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const calls: [number, number][] = [];
  const stop = scheduleForegroundRefresh({
    isFocused: () => false,
    refresh: (index) => calls.push([index, Date.now()]),
  });
  await vi.advanceTimersByTimeAsync(119_999);
  expect(calls).toEqual([
    [0, 0], [1, 10_000], [2, 20_000], [3, 30_000],
    [0, 60_000], [1, 70_000], [2, 80_000], [3, 90_000],
  ]);
  stop();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(calls).toHaveLength(8);
});

it("skips focused slots without catch-up requests and cancels pending starts", async () => {
  vi.useFakeTimers();
  let focused = false;
  const refresh = vi.fn();
  const stop = scheduleForegroundRefresh({ isFocused: () => focused, refresh });
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledExactlyOnceWith(0);
  focused = true;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(refresh).toHaveBeenCalledOnce();
  focused = false;
  await vi.advanceTimersByTimeAsync(9_999);
  expect(refresh).toHaveBeenCalledOnce();
  stop();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(refresh).toHaveBeenCalledOnce();
});

it("does not start requests while focused", async () => {
  vi.useFakeTimers();
  const refresh = vi.fn();
  const stop = scheduleForegroundRefresh({ isFocused: () => true, refresh });
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(refresh).not.toHaveBeenCalled();
  stop();
});
