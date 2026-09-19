import { afterEach, expect, it, vi } from "vitest";
import { scheduleForegroundRefresh } from "./foreground-refresh";

afterEach(() => vi.useRealTimers());

it("checks immediately and every five focused minutes, preserving the deadline across brief focus changes", async () => {
  vi.useFakeTimers();
  let focused = true;
  let notify!: () => void;
  const refresh = vi.fn();
  const unsubscribe = vi.fn();
  const stop = scheduleForegroundRefresh({
    isFocused: () => focused,
    subscribe: (listener) => { notify = listener; return unsubscribe; },
    refresh,
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(299_999);
  expect(refresh).toHaveBeenCalledTimes(1);
  focused = false;
  notify();
  focused = true;
  notify();
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(2);
  focused = false;
  notify();
  await vi.advanceTimersByTimeAsync(30 * 60_000);
  expect(refresh).toHaveBeenCalledTimes(2);
  focused = true;
  notify();
  expect(refresh).toHaveBeenCalledTimes(3);
  notify();
  expect(refresh).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(refresh).toHaveBeenCalledTimes(4);
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(20 * 60_000);
  expect(refresh).toHaveBeenCalledTimes(4);
});

it("does not start requests while unfocused", async () => {
  vi.useFakeTimers();
  const refresh = vi.fn();
  const stop = scheduleForegroundRefresh({
    isFocused: () => false,
    subscribe: () => () => {},
    refresh,
  });
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(refresh).not.toHaveBeenCalled();
  stop();
});
