/**
 * How long a cached answer is trusted before a remount or a settings change
 * refetches it, for the board itself and for the per-repository label
 * catalogue the label menu keeps alongside it.
 */
export const STALE_AFTER_MS = 5 * 60_000;
