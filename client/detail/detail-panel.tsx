import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { ActivityIndicator, Animated, ScrollView, Text, View } from "react-native";

import type { BoardItem, ColumnId, ItemDetails } from "../../shared/board";
import { loadItem } from "../../shared/board";
import type { Styles } from "../theme/use-styles";
import { DetailActionsRow } from "./detail-actions-row";
import { DetailComments } from "./detail-comments";
import { DetailDescription, DetailSummary } from "./detail-body";
import { DetailHeader } from "./detail-header";
import { MergeDialog } from "./merge-dialog";
import { RemoteImage } from "./remote-image";
import { useDetailResize } from "./use-detail-resize";
import { useItemActions } from "./use-item-actions";
import { useItemComments } from "./use-item-comments";

/**
 * One card, opened: what the card already shows, then the body the search
 * result linked to it. The panel is one component so the surface can key,
 * position and animate it as a single thing; internally it composes four
 * pieces that each own their own slice — the sliding chrome and its resize
 * drag (`DetailHeader`, `useDetailResize`), the item's own written content
 * (`detail-body.tsx`), its comments (`DetailComments`, `useItemComments`),
 * and the actions a pull request's details support (`DetailActionsRow`,
 * `useItemActions`). This component keeps only the one fetch every other
 * piece reads from: the item's own `details`.
 */
export function ItemDetailPanel({
  item,
  type,
  styles,
  accentColor,
  foregroundColor,
  bodyWidth,
  progress,
  widthFraction,
  onWidthCommitted,
  onClose,
  onSend,
  onMerged,
}: {
  item: BoardItem;
  type: ColumnId;
  styles: Styles;
  accentColor: string;
  foregroundColor: string;
  bodyWidth: number | null;
  progress: Animated.Value;
  widthFraction: number | null;
  onWidthCommitted: (fraction: number) => void;
  onClose: () => void;
  onSend: (item: BoardItem, type: ColumnId) => void;
  onMerged: (itemId: string) => void;
}) {
  const load = useRpc(loadItem);
  const [details, setDetails] = useState<ItemDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  /** Bumped by Refresh; anything past the first load bypasses the server cache. */
  const [generation, setGeneration] = useState(0);

  const resize = useDetailResize({ bodyWidth, widthFraction, progress, onWidthCommitted });
  const comments = useItemComments(item.id);
  const actions = useItemActions({ item, onDetailsChanged: setDetails, onMerged });

  useEffect(() => {
    let live = true;
    setBusy(true);
    setError(null);
    load({ id: item.id, force: generation > 0 })
      .then((result) => {
        if (live) setDetails(result);
      })
      .catch((cause: unknown) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [generation, item.id, load]);

  const refreshAll = useCallback(() => {
    setGeneration((current) => current + 1);
    comments.refresh();
  }, [comments]);

  const renderImage = useCallback(
    (image: { url: string; alt: string }) => (
      <RemoteImage url={image.url} alt={image.alt} styles={styles} accentColor={accentColor} />
    ),
    [accentColor, styles],
  );

  return (
    <Animated.View
      style={[
        styles.detailPanel,
        resize.clampedWidth !== null ? { width: resize.clampedWidth } : null,
        { transform: [{ translateX: resize.translateX }] },
      ]}
      onLayout={resize.onPanelLayout}
    >
      {bodyWidth === null ? null : (
        <View
          accessibilityRole="adjustable"
          accessibilityLabel="Resize the details panel"
          accessibilityHint="Drag left to widen, right to narrow"
          style={styles.resizeHandle}
          {...resize.panHandlers}
        >
          <View style={[styles.resizeGrip, resize.resizing ? styles.resizeGripActive : null]} />
        </View>
      )}
      <DetailHeader
        repository={item.repository}
        state={details?.state ?? null}
        styles={styles}
        foregroundColor={foregroundColor}
        busy={busy || comments.commentsBusy}
        onRefresh={refreshAll}
        onClose={onClose}
      />
      <ScrollView contentContainerStyle={styles.detailBody}>
        <DetailSummary item={item} type={type} details={details} styles={styles} />
        <DetailActionsRow
          item={item}
          type={type}
          details={details}
          styles={styles}
          acting={actions.acting}
          onApprove={actions.runApprove}
          onMergeOpen={() => actions.setMergeOpen(true)}
          onSend={onSend}
        />
        <View style={styles.detailDivider} />
        {details === null ? (
          error !== null ? (
            <Text style={styles.danger}>{error}</Text>
          ) : (
            <View style={styles.centeredRow}>
              <ActivityIndicator color={accentColor} />
            </View>
          )
        ) : (
          <>
            <DetailDescription
              details={details}
              error={error}
              styles={styles}
              renderImage={renderImage}
            />
            <View style={styles.detailDivider} />
            <DetailComments
              commentsCount={item.commentsCount}
              requested={comments.requested}
              comments={comments.comments}
              commentsError={comments.commentsError}
              foregroundColor={foregroundColor}
              accentColor={accentColor}
              styles={styles}
              renderImage={renderImage}
              onRequest={comments.request}
            />
          </>
        )}
      </ScrollView>
      {actions.mergeOpen && details?.review ? (
        <MergeDialog
          item={item}
          methods={details.review.mergeMethods}
          busy={actions.acting}
          styles={styles}
          onCancel={() => actions.setMergeOpen(false)}
          onMerge={actions.runMerge}
        />
      ) : null}
    </Animated.View>
  );
}
