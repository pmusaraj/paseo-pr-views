import { memo, useCallback, useState } from "react";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Pressable, Text, View } from "react-native";

import type { BoardItem, ColumnId } from "../../shared/board";
import { linkedIssueLabel } from "../lib/formatting";
import { relativeTime } from "../lib/time";
import type { SortOrder } from "../lib/sort";
import type { Styles } from "../theme/use-styles";
import { describeRow } from "./item-row-format";
import { openExternalUrl } from "../web";
import { ItemRowTrailing } from "./item-row-trailing";

export { checksSentence } from "./item-row-format";
export { ChecksPills } from "./item-row-trailing";

/**
 * Where a right-click or a long-press landed, in the coordinate space
 * `measureInWindow` reports — which is what the surface converts against.
 *
 * A React Native gesture carries `pageX` on its `nativeEvent`; a DOM
 * `MouseEvent` is read as `clientX`, deliberately in preference to its own
 * `pageX`, because `pageX` counts document scroll and the surface's measured
 * origin does not.
 */
function pointerPoint(event: unknown): { x: number; y: number } | null {
  if (typeof event !== "object" || event === null) return null;

  const nativeEvent = Reflect.get(event, "nativeEvent");
  if (typeof nativeEvent === "object" && nativeEvent !== null) {
    const pageX = Reflect.get(nativeEvent, "pageX");
    const pageY = Reflect.get(nativeEvent, "pageY");
    if (typeof pageX === "number" && typeof pageY === "number")
      return { x: pageX, y: pageY };
  }

  const clientX = Reflect.get(event, "clientX");
  const clientY = Reflect.get(event, "clientY");
  if (typeof clientX === "number" && typeof clientY === "number")
    return { x: clientX, y: clientY };
  return null;
}

/**
 * One line of the GitHub-style list: a state glyph, the title with a Draft
 * pill when it is a folded-in draft pull request, a meta line naming where it
 * lives and who opened it, and — on the wide layout — the trailing checks,
 * comment count and labels a card used to spread across its footer. Compact
 * wraps that trailing group onto a second line instead of dropping it.
 *
 * Memoized: a board with thousands of rows re-renders this component for
 * every visible one on each parent state change (a filter, a search
 * keystroke), and only the rows whose own props actually changed need to.
 */
export const ItemRow = memo(function ItemRow({
  item,
  viewerLogin,
  styles,
  platform,
  compact,
  selected,
  accentColor,
  mutedColor,
  onOpen,
  onSend,
  onLabels,
  type,
  order,
}: {
  item: BoardItem;
  /** The login the board was queried for, so a row of someone else's reads as one. */
  viewerLogin: string;
  styles: Styles;
  /**
   * Decides two things the row cannot ask about itself: whether hovering
   * exists at all, and whether a long press is the way to open a menu or the
   * duplicate of a right-click that already did.
   */
  platform: PluginSurfaceProps["layout"]["platform"];
  /** Wraps the trailing checks/comments/labels onto their own line instead of the row's right edge. */
  compact: boolean;
  /** True while this row's details are open in the panel. */
  selected: boolean;
  /** The state glyph's colour for an open pull request or issue. */
  accentColor: string;
  /** The state glyph's colour for a draft or a discussion, and the send icon's. */
  mutedColor: string;
  /** A press: opens the row in the detail panel, never the browser. */
  onOpen: (item: BoardItem, type: ColumnId) => void;
  onSend: (item: BoardItem, type: ColumnId) => void;
  /** Null where labels cannot be edited, which takes the gesture away entirely. */
  onLabels: ((item: BoardItem, point: { x: number; y: number }) => void) | null;
  /** Chooses the prompt template, the state glyph, and the Draft pill. */
  type: ColumnId;
  /** The active ordering, so the meta line reports the date the list is sorted on. */
  order: SortOrder;
}) {
  /** Nothing hovers on a touch platform, and the action would hide forever. */
  const isWeb = platform === "web";
  /**
   * Two hover states, not one. The action sits inside the row, and moving onto
   * it takes the pointer off the row as far as the row's own hover is
   * concerned — so tracking only the row would hide the action the moment the
   * user reached for it. Either one being hovered keeps it revealed.
   */
  const [rowHovered, setRowHovered] = useState(false);
  const [actionHovered, setActionHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  /**
   * Revealed by style rather than by mounting: an action that unmounts under the
   * cursor can never report the hover that would have kept it alive.
   */
  const revealed = !isWeb || rowHovered || actionHovered || focused;

  const open = useCallback(() => {
    onOpen(item, type);
  }, [item, onOpen, type]);

  // No in-flight state: the press opens the launch dialog, which owns every
  // wait from there on.
  const send = useCallback(() => {
    onSend(item, type);
  }, [item, onSend, type]);

  const openLabels = useCallback(
    (event: unknown) => {
      const point = pointerPoint(event);
      if (point === null || onLabels === null) return;
      onLabels(item, point);
    },
    [item, onLabels],
  );

  /**
   * Web only, and `preventDefault` first: without it the browser's own menu
   * opens on top of this one. The left-click that opens the row is a separate
   * handler, so a right-click never opens the panel.
   */
  const openLabelsFromContextMenu = useCallback(
    (event: unknown) => {
      if (typeof event === "object" && event !== null) {
        const preventDefault = Reflect.get(event, "preventDefault");
        if (typeof preventDefault === "function") preventDefault.call(event);
      }
      openLabels(event);
    },
    [openLabels],
  );

  const closes = item.linkedIssues
    .map((issue) => linkedIssueLabel(issue, item.repository))
    .join(", ");

  const display = describeRow({
    item,
    viewerLogin,
    order,
    type,
    accentColor,
    mutedColor,
    statusColors: styles.prStatusColors,
    closes,
    hasLabelMenu: onLabels !== null,
    isWeb,
  });

  const trailing = <ItemRowTrailing item={item} styles={styles} />;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={display.accessibilityLabel}
      accessibilityHint={display.accessibilityHint}
      onPress={open}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // A web long press is a *held* left click, which right-click already
      // covers — wiring both would open the menu twice on the same gesture.
      onLongPress={onLabels === null || isWeb ? undefined : openLabels}
      onHoverIn={() => setRowHovered(true)}
      onHoverOut={() => setRowHovered(false)}
      // @ts-expect-error - onContextMenu is web-only and absent from the React Native types.
      onContextMenu={onLabels === null ? undefined : openLabelsFromContextMenu}
      style={({ pressed }) => [
        styles.itemRow,
        selected ? styles.itemRowSelected : null,
        pressed ? styles.itemRowPressed : null,
      ]}
    >
      <View style={styles.itemRowIcon}>
        <Icon name={display.iconName} size={16} color={display.iconColor} />
      </View>
      <View style={styles.itemRowMain}>
        <View style={styles.itemRowTitleLine}>
          <Text style={styles.itemRowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {type === "draft-prs" ? (
            <Text style={styles.itemRowDraftPill}>Draft</Text>
          ) : null}
        </View>
        <Text style={styles.itemRowMeta} numberOfLines={1}>
          {item.repository} #{item.number} · {display.stampLabel}{" "}
          {relativeTime(display.stampDate)}
          {display.byline !== null ? ` by ${display.byline}` : ""}
        </Text>
        {compact ? (
          <View style={styles.itemRowTrailingCompact}>{trailing}</View>
        ) : null}
      </View>
      {compact ? null : <View style={styles.itemRowTrailing}>{trailing}</View>}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Send ${item.repository} #${item.number} to a new workspace chat`}
        onPress={(event) => {
          event.stopPropagation();
          send();
        }}
        onHoverIn={() => setActionHovered(true)}
        onHoverOut={() => setActionHovered(false)}
        style={({ pressed }) => [
          styles.iconButton,
          revealed ? null : styles.itemRowActionHidden,
          pressed ? styles.cardPressed : null,
        ]}
      >
        <Icon name="Send" size={14} color={mutedColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.repository} #${item.number} on GitHub`}
        onPress={(event) => {
          event.stopPropagation();
          openExternalUrl(item.url);
        }}
        onHoverIn={() => setActionHovered(true)}
        onHoverOut={() => setActionHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.iconButton,
          revealed ? null : styles.itemRowActionHidden,
        ]}
      >
        <Icon name="ExternalLink" size={14} color={mutedColor} />
      </Pressable>
    </Pressable>
  );
});
