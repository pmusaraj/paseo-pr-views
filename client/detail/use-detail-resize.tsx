import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  type GestureResponderHandlers,
  type LayoutChangeEvent,
} from "react-native";

import {
  BOARD_MIN_WIDTH,
  DEFAULT_DETAIL_FRACTION,
  DETAIL_MIN_WIDTH,
  DETAIL_OFFSCREEN_FALLBACK,
} from "./constants";
import { trackPointerOnDocument } from "../web";

/** What `useDetailResize` needs from the panel around it. */
export interface UseDetailResizeArgs {
  /** The board body's width, for clamping the panel's drag. Null until laid out. */
  bodyWidth: number | null;
  /** The saved share of the body this panel should occupy. Null until the settings read lands. */
  widthFraction: number | null;
  /** Drives the slide-in/out animation; interpolated here into a horizontal offset. */
  progress: Animated.Value;
  /** Persists the share once per drag, not per move. */
  onWidthCommitted: (fraction: number) => void;
}

/** What `useDetailResize` exposes to the panel. */
export interface UseDetailResizeResult {
  clampedWidth: number | null;
  translateX: Animated.AnimatedInterpolation<number>;
  resizing: boolean;
  panHandlers: GestureResponderHandlers;
  onPanelLayout: (event: LayoutChangeEvent) => void;
}

/**
 * The panel's own width: the drag that resizes it, the share that survives a
 * remount, and the slide animation the width rides along with while the
 * panel opens or closes. Kept apart from the panel's data and its chrome —
 * neither needs to know the drag exists, only the width it settles on.
 */
export function useDetailResize({
  bodyWidth,
  widthFraction,
  progress,
  onWidthCommitted,
}: UseDetailResizeArgs): UseDetailResizeResult {
  /**
   * The drag's own value, seeded from the saved share. Local rather than read
   * straight from settings on every move: a write per pixel is a write per
   * pixel however it is spelled, so the drag runs on state and settles once.
   */
  const [fraction, setFraction] = useState<number | null>(widthFraction);
  /**
   * Adopt a share saved elsewhere — another client, or this one before the
   * panel mounted — but never while a drag is in flight, which would yank the
   * edge out from under the pointer.
   */
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setFraction(widthFraction);
  }, [widthFraction]);
  /**
   * The laid-out width, which is how far the panel has to travel to be
   * off-screen. Until the first layout it travels the fallback, which is at
   * least as far; the first frame is off-screen either way.
   */
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  /**
   * The width when the drag began, read by the move handler. A ref rather than
   * state because the responder is created once and must see the latest value
   * without being rebuilt per render.
   */
  const dragStart = useRef<{ width: number; bodyWidth: number; x: number } | null>(null);
  const panelWidth = useRef<number>(0);
  const bodyWidthRef = useRef(bodyWidth);
  bodyWidthRef.current = bodyWidth;
  /** Detaches the document listeners a web drag installed; a no-op elsewhere. */
  const stopTracking = useRef<() => void>(() => {});

  useEffect(() => () => stopTracking.current(), []);

  const resizer = useMemo(() => {
    // Anchored to the right edge, so a pointer moving left grows the panel.
    // Kept as a share of the body from the first move, so nothing converts
    // on release and the remount and the next daemon start agree.
    let latest: number | null = null;
    const applyDelta = (dx: number) => {
      const start = dragStart.current;
      if (start === null || start.bodyWidth <= 0) return;
      const widest = Math.max(DETAIL_MIN_WIDTH, start.bodyWidth - BOARD_MIN_WIDTH);
      const next = Math.min(widest, Math.max(DETAIL_MIN_WIDTH, start.width - dx));
      latest = Math.min(1, next / start.bodyWidth);
      setFraction(latest);
    };
    const finish = () => {
      stopTracking.current();
      stopTracking.current = () => {};
      const dragged = dragStart.current !== null;
      dragStart.current = null;
      dragging.current = false;
      setResizing(false);
      // Once per drag, not per move: a save per move is a write per pixel.
      if (dragged && latest !== null) onWidthCommitted(latest);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      /**
       * Never hand the gesture over. Every scroll view the pointer crosses on
       * its way left asks for the responder, and the default answer — yes —
       * is why widening used to stop partway.
       */
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        const x = event.nativeEvent.pageX;
        dragStart.current = {
          width: panelWidth.current,
          bodyWidth: bodyWidthRef.current ?? panelWidth.current,
          x,
        };
        dragging.current = true;
        setResizing(true);
        // Document-level tracking is the web's belt and braces: it keeps the
        // drag alive past the handle, past the columns and past the window.
        stopTracking.current = trackPointerOnDocument(
          (clientX) => applyDelta(clientX - x),
          finish,
        );
      },
      onPanResponderMove: (_event, gesture) => applyDelta(gesture.dx),
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
  }, [onWidthCommitted]);

  /**
   * The share turned back into pixels against the body as it is *now*, and
   * clamped the same way a drag is: a share that made sense on a wide window
   * can leave less than a column of board on a narrow one. Null before the
   * body has been laid out, when the stylesheet's half stands in.
   */
  const clampedWidth =
    bodyWidth === null
      ? null
      : Math.min(
          Math.max(DETAIL_MIN_WIDTH, (fraction ?? DEFAULT_DETAIL_FRACTION) * bodyWidth),
          Math.max(DETAIL_MIN_WIDTH, bodyWidth - BOARD_MIN_WIDTH),
        );

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [Math.max(measuredWidth ?? 0, DETAIL_OFFSCREEN_FALLBACK), 0],
  });

  const onPanelLayout = useCallback((event: LayoutChangeEvent) => {
    panelWidth.current = event.nativeEvent.layout.width;
    setMeasuredWidth(event.nativeEvent.layout.width);
  }, []);

  return { clampedWidth, translateX, resizing, panHandlers: resizer.panHandlers, onPanelLayout };
}
