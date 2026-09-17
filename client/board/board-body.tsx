import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

import type { Board, BoardItem, ColumnId } from "../../shared/board";
import { ItemDetailPanel } from "../detail/detail-panel";
import type { BoardRow } from "../lib/sort";
import type { Styles } from "../theme/use-styles";

/**
 * Everything below the header and the toolbar: the settings screen when it is
 * open, or the board itself — the list for the active mode, the Projects tab,
 * and the detail panel it can open a card into — when it is not. Kept as one
 * component because the two share the one `styles.body` region the surface
 * lays them into.
 */
export function BoardBody({
  surfaceProps,
  styles,
  busy,
  board,
  displayRows,
  renderRow,
  modeRows,
  refresh,
  bodyWidth,
  setBodyWidth,
  detailTarget,
  detailItem,
  detailProgress,
  closeDetails,
  savedFraction,
  commitWidth,
  openSendDialog,
  dropItem,
}: {
  surfaceProps: PluginSurfaceProps;
  styles: Styles;
  busy: boolean;
  board: Board | null;
  displayRows: readonly BoardRow[];
  renderRow: (info: { item: BoardRow }) => React.JSX.Element;
  modeRows: { rows: BoardRow[]; error: string | null };
  refresh: (login?: string, force?: boolean) => Promise<void>;
  bodyWidth: number | null;
  setBodyWidth: (next: number | null) => void;
  detailTarget: { item: BoardItem; type: ColumnId } | null;
  detailItem: BoardItem | null;
  detailProgress: Animated.Value;
  closeDetails: () => void;
  savedFraction: number | null;
  commitWidth: (fraction: number) => void;
  openSendDialog: (item: BoardItem, type: ColumnId) => void;
  dropItem: (itemId: string) => void;
}) {
  return (
    <View
      style={styles.body}
      onLayout={(event) => setBodyWidth(event.nativeEvent.layout.width)}
    >
      {board === null ? (
        <View style={styles.centered}>
          {busy ? (
            <ActivityIndicator color={surfaceProps.theme.colors.accent} />
          ) : null}
        </View>
      ) : (
        <FlatList
          style={styles.rowList}
          data={displayRows}
          keyExtractor={(row) => row.item.id}
          renderItem={renderRow}
          ListEmptyComponent={
            modeRows.error !== null ? (
              <Text style={[styles.danger, styles.empty]}>
                {modeRows.error}
              </Text>
            ) : modeRows.rows.length === 0 ? (
              <Text style={styles.empty}>Nothing here.</Text>
            ) : (
              <Text style={styles.empty}>
                No items match the current filters.
              </Text>
            )
          }
          contentContainerStyle={styles.rowListContent}
          refreshControl={
            surfaceProps.layout.compact ? (
              <RefreshControl
                refreshing={busy}
                onRefresh={() => void refresh(undefined, true)}
              />
            ) : undefined
          }
        />
      )}
      {/* Last in the body, so it paints over the list by order alone;
          the header above keeps its own zIndex and stays reachable. The
          scrim only exists where the panel leaves board to blur. */}
      {detailTarget !== null &&
      detailItem !== null &&
      !surfaceProps.layout.compact ? (
        <Animated.View
          style={[styles.detailScrim, { opacity: detailProgress }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close details"
            style={styles.menuScrim}
            onPress={closeDetails}
          />
        </Animated.View>
      ) : null}
      {detailTarget !== null && detailItem !== null ? (
        <ItemDetailPanel
          // Keyed by card, so a second card never shows the first one's
          // body while its own loads.
          key={detailItem.id}
          item={detailItem}
          type={detailTarget.type}
          styles={styles}
          accentColor={surfaceProps.theme.colors.accent}
          foregroundColor={surfaceProps.theme.colors.foreground}
          bodyWidth={surfaceProps.layout.compact ? null : bodyWidth}
          widthFraction={savedFraction}
          onWidthCommitted={commitWidth}
          progress={detailProgress}
          onClose={closeDetails}
          onSend={openSendDialog}
          onMerged={dropItem}
        />
      ) : null}
    </View>
  );
}
