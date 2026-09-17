export const DEFAULT_DETAIL_FRACTION = 0.5;
/** Narrow enough for a phone-sized column of text; wide enough that a table of three screenshots still reads. */
export const DETAIL_MIN_WIDTH = 320;
/** What the board keeps, at least: one column's worth of cards. */
export const BOARD_MIN_WIDTH = 260;
/**
 * The panel's slide and the scrim's fade share one progress value, so they
 * can never be out of step. Opening is a touch slower than closing: arriving
 * content deserves a beat, a dismissal should just be gone.
 */
export const DETAIL_OPEN_MS = 220;
export const DETAIL_CLOSE_MS = 160;
/** Before the panel has been laid out, it slides from this far right at least. */
export const DETAIL_OFFSCREEN_FALLBACK = 800;
