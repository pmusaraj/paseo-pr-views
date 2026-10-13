import { REFRESH_INTERVAL_MS } from "./search-snapshot";

const VIEW_COUNT = 4;
const VIEW_OFFSET_MS = 10_000;

/** Each view keeps its own minute cadence; focus never starts a request. */
export function scheduleForegroundRefresh({ isFocused, refresh }: {
  isFocused: () => boolean;
  refresh: (index: number) => void;
}) {
  const intervals: ReturnType<typeof setInterval>[] = [];
  const starts = Array.from({ length: VIEW_COUNT }, (_, index) => {
    const tick = () => { if (!isFocused()) refresh(index); };
    return setTimeout(() => {
      tick();
      intervals.push(setInterval(tick, REFRESH_INTERVAL_MS));
    }, index * VIEW_OFFSET_MS);
  });
  return () => {
    starts.forEach(clearTimeout);
    intervals.forEach(clearInterval);
  };
}
