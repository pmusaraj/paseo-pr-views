import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { Animated, Easing, Platform, StatusBar, View } from "react-native";

import type { Board, BoardItem, ColumnId, PromptSettings } from "../../shared/board";
import type { LaunchResult } from "../launch/send-dialog";
import { renderTemplate, templateFor } from "../lib/templates";
import type { BoardRow, SortOrder } from "../lib/sort";
import { DETAIL_CLOSE_MS, DETAIL_OPEN_MS } from "../detail/constants";
import { ItemRow } from "./item-row";
import type { Styles } from "../theme/use-styles";
import { LABEL_MENU_MAX_HEIGHT, LABEL_MENU_WIDTH, MENU_MARGIN } from "./label-menu";
import type { LabelMenuTarget } from "./label-menu";

/**
 * What `useBoardOverlays` needs from the other board hooks, threaded through
 * rather than reached for.
 */
export interface UseBoardOverlaysInputs {
  board: Board | null;
  promptValues: PromptSettings | null;
  mutateBoardCache: (updater: (current: Board) => Board) => void;
  /** The active sort's row label and date accessor, for `ItemRow`'s meta line. */
  activeOrder: SortOrder;
}

/** What `useBoardOverlays` exposes to the surface. */
export interface UseBoardOverlaysResult {
  bodyWidth: number | null;
  setBodyWidth: (next: number | null) => void;
  detailTarget: { item: BoardItem; type: ColumnId } | null;
  detailItem: BoardItem | null;
  detailProgress: Animated.Value;
  closeDetails: () => void;
  openSendDialog: (item: BoardItem, type: ColumnId) => void;
  dropItem: (itemId: string) => void;
  labelTarget: LabelMenuTarget | null;
  setLabelTarget: (next: LabelMenuTarget | null) => void;
  applyItemLabels: (itemId: string, labels: string[]) => void;
  sendTarget: { item: BoardItem; prompt: string } | null;
  setSendTarget: (next: { item: BoardItem; prompt: string } | null) => void;
  handleLaunched: (result: LaunchResult) => void;
  rootRef: React.RefObject<View | null>;
  showSettings: boolean;
  setShowSettings: (next: boolean) => void;
  renderRow: (info: { item: BoardRow }) => React.JSX.Element;
}

/**
 * The overlays the board shows one of at a time — the detail panel, the
 * label menu, the launch dialog, the settings screen — and the two mutations
 * a label edit or a merge applies to the board already on screen: opening
 * one records where it should draw and, for the detail panel, drives the
 * slide animation between open and closed; applying a mutation patches
 * `useBoardQuery`'s cache in place so the change appears without a refetch.
 */
export function useBoardOverlays(
  props: PluginSurfaceProps,
  styles: Styles,
  { board, promptValues, mutateBoardCache, activeOrder }: UseBoardOverlaysInputs,
): UseBoardOverlaysResult {
  const toast = useToast();

  /** The surface shows one of two things; plugins cannot route between surfaces. */
  const [showSettings, setShowSettings] = useState(false);
  /** The card the launch dialog is open on, with its prompt already rendered. */
  const [sendTarget, setSendTarget] = useState<{ item: BoardItem; prompt: string } | null>(null);
  /** The card the label menu is open on, and where on this surface to draw it. */
  const [labelTarget, setLabelTarget] = useState<LabelMenuTarget | null>(null);
  /** The card the detail panel is open on. Its column picks the send template. */
  const [detailTarget, setDetailTarget] = useState<{ item: BoardItem; type: ColumnId } | null>(
    null,
  );
  /**
   * Whether the panel is meant to be on screen. Separate from `detailTarget`,
   * which is kept while the panel slides out so there is still something to
   * draw; it is cleared when the closing animation finishes.
   */
  const [detailOpen, setDetailOpen] = useState(false);
  const detailProgress = useRef(new Animated.Value(0)).current;
  /** The body's width, for clamping the panel's drag. Null until laid out. */
  const [bodyWidth, setBodyWidth] = useState<number | null>(null);

  useEffect(() => {
    const animation = Animated.timing(detailProgress, {
      toValue: detailOpen ? 1 : 0,
      duration: detailOpen ? DETAIL_OPEN_MS : DETAIL_CLOSE_MS,
      easing: detailOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      // The web renderer drives every animation from JavaScript, and a layout
      // property could not go through the native driver anyway.
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      // Only a *finished* close unmounts: one interrupted by a reopen must
      // leave the panel where the reopening finds it.
      if (finished && !detailOpen) setDetailTarget(null);
    });
    return () => animation.stop();
  }, [detailOpen, detailProgress]);

  const closeDetails = useCallback(() => setDetailOpen(false), []);
  /**
   * The surface's own view, measured when a menu opens. A right-click reports
   * where it happened in the window; the menu is positioned inside this view,
   * so the two have to be reconciled — and only this view knows where it sits.
   */
  const rootRef = useRef<View | null>(null);

  /**
   * Opens the label menu where the user clicked.
   *
   * `measureInWindow` is asynchronous, so the point is converted in its
   * callback rather than from a remembered layout — a column that has been
   * scrolled, or a window that has been resized, would make a remembered one
   * wrong. The menu is then clamped to the surface: it opens rightwards and
   * downwards from the pointer unless that would take it off the edge, and
   * hanging it from `bottom` when it opens upward anchors the menu's foot at
   * the pointer whatever height it turns out to have.
   *
   * Android needs the status bar added to the gesture's `pageY`: the window a
   * view is measured in includes it, and a touch's page coordinates do not.
   * Paseo's own `ContextMenuTrigger` corrects the same offset the same way.
   */
  const openLabelMenu = useCallback((item: BoardItem, point: { x: number; y: number }) => {
    const node = rootRef.current;
    if (node === null) return;
    const statusBar = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
    node.measureInWindow((originX, originY, width, height) => {
      const x = point.x - originX;
      const y = point.y + statusBar - originY;
      const rightmost = Math.max(MENU_MARGIN, width - LABEL_MENU_WIDTH - MENU_MARGIN);
      const left = Math.min(Math.max(x, MENU_MARGIN), rightmost);
      const opensUp = y + LABEL_MENU_MAX_HEIGHT + MENU_MARGIN > height;
      setLabelTarget({
        item,
        left,
        top: opensUp ? null : y,
        bottom: opensUp ? Math.max(MENU_MARGIN, height - y) : null,
      });
    });
  }, []);

  /**
   * Adopts the labels GitHub reported after a toggle. Patched straight into
   * `useBoardQuery`'s cache, or the next remount — which happens on every
   * workspace switch — would repaint the labels the edit replaced.
   */
  const applyItemLabels = useCallback(
    (itemId: string, labels: string[]) => {
      mutateBoardCache((current) => ({
        ...current,
        columns: current.columns.map((column) => ({
          ...column,
          items: column.items.map((item) => (item.id === itemId ? { ...item, labels } : item)),
        })),
      }));
    },
    [mutateBoardCache],
  );

  /**
   * Takes one card off the board, for a pull request that has just been
   * merged: the columns are a `state:open` search, so it no longer belongs to
   * any of them. Patched into `useBoardQuery`'s cache for the same reason the
   * label edit does it, and the open panel survives on the item it was
   * given, now reading "Merged".
   */
  const dropItem = useCallback(
    (itemId: string) => {
      mutateBoardCache((current) => ({
        ...current,
        columns: current.columns.map((column) => ({
          ...column,
          items: column.items.filter((item) => item.id !== itemId),
        })),
      }));
    },
    [mutateBoardCache],
  );

  const openDetails = useCallback((item: BoardItem, type: ColumnId) => {
    setDetailTarget({ item, type });
    setDetailOpen(true);
  }, []);

  /**
   * The open card as the board has it *now*, not as it was when pressed: a
   * label edited from the context menu while the panel is up lands on the
   * board, and the panel should repaint with it rather than keep a copy. The
   * pressed item stands in if a refresh has since dropped it from the board.
   */
  const detailItem = useMemo(() => {
    if (detailTarget === null || board === null) return null;
    for (const column of board.columns) {
      const hit = column.items.find((item) => item.id === detailTarget.item.id);
      if (hit !== undefined) return hit;
    }
    return detailTarget.item;
  }, [board, detailTarget]);

  const selectedId = detailItem?.id ?? null;

  /**
   * Opens the launch dialog on this card, with the card's template already
   * rendered into the first message. Everything else — the project lookup, the
   * provider snapshot, the send itself — belongs to the dialog.
   */
  const openSendDialog = useCallback(
    (item: BoardItem, type: ColumnId) => {
      const projectId = board?.repositoryProjects[item.repository] ?? null;
      const template =
        promptValues === null ? item.url : templateFor(promptValues, type, projectId);
      setSendTarget({ item, prompt: renderTemplate(template, item) });
    },
    [board, promptValues],
  );

  /**
   * The workspace exists and its agent already has the prompt, so the last
   * thing to do is put the user in front of it. The notice is set first and
   * deliberately: if the app does not route — an old shell, a platform without
   * the app's own scheme — the surface still says where the work went instead of
   * looking like nothing happened.
   *
   * `navigation` is the host's own agent navigation, so `openAgent` alone lands
   * on the workspace *and* opens that agent's tab, because it runs the app's own
   * `navigateToAgent` against the host rendering the surface.
   *
   * The prop is still typed optional because hosts before 0.7.0-beta.3 passed
   * nothing. This plugin now requires Paseo >=0.8.0, and each app checks that
   * against its *own* version before it evaluates this bundle, so every client
   * that can run this code passes it. The `undefined` branch therefore only
   * leaves the notice standing — which already names the workspace the work went
   * to — instead of the hand-built `paseo://` route this used to fall back on.
   */
  const handleLaunched = useCallback(
    (result: LaunchResult) => {
      setSendTarget(null);
      toast.show(`Created “${result.workspaceName}” in ${result.projectName}. Opening it…`, {
        variant: "success",
      });
      props.navigation?.openAgent({ agentId: result.agentId });
    },
    [props.navigation, toast],
  );

  const renderRow = useCallback(
    ({ item: row }: { item: BoardRow }) => (
      <ItemRow
        item={row.item}
        viewerLogin={board?.login ?? ""}
        styles={styles}
        platform={props.layout.platform}
        compact={props.layout.compact}
        selected={row.item.id === selectedId}
        accentColor={props.theme.colors.accent}
        mutedColor={props.theme.colors.foregroundMuted}
        onOpen={openDetails}
        onSend={openSendDialog}
        onLabels={row.type === "discussions" ? null : openLabelMenu}
        type={row.type}
        order={activeOrder}
      />
    ),
    [
      board?.login,
      styles,
      props.layout.platform,
      props.layout.compact,
      selectedId,
      props.theme.colors.accent,
      props.theme.colors.foregroundMuted,
      openDetails,
      openSendDialog,
      openLabelMenu,
      activeOrder,
    ],
  );

  return {
    bodyWidth,
    setBodyWidth,
    detailTarget,
    detailItem,
    detailProgress,
    closeDetails,
    openSendDialog,
    dropItem,
    labelTarget,
    setLabelTarget,
    applyItemLabels,
    sendTarget,
    setSendTarget,
    handleLaunched,
    rootRef,
    showSettings,
    setShowSettings,
    renderRow,
  };
}
