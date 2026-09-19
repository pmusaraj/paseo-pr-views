import { REFRESH_INTERVAL_MS } from "./search-snapshot";

/** Plugin-wide schedule: resume an overdue sweep on focus, without catch-up bursts. */
export function scheduleForegroundRefresh({
  isFocused,
  subscribe,
  refresh,
}: {
  isFocused: () => boolean;
  subscribe: (listener: () => void) => () => void;
  refresh: () => void;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextCheckAt = 0;
  const tick = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!isFocused()) return;
    if (Date.now() >= nextCheckAt) {
      nextCheckAt = Date.now() + REFRESH_INTERVAL_MS;
      refresh();
    }
    timer = setTimeout(tick, Math.max(0, nextCheckAt - Date.now()));
  };
  const unsubscribe = subscribe(tick);
  tick();
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
