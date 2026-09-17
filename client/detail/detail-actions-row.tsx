import { Pressable, Text, View } from "react-native";

import type { BoardItem, ColumnId, ItemDetails } from "../../shared/board";
import type { Styles } from "../theme/use-styles";
import { openExternalUrl } from "../web";
import { ReviewActions } from "./review-actions";

/**
 * The row of things a panel lets you do with a card: approve and merge it
 * (pull requests only, and only once its details have loaded), send it to a
 * chat, or open it on GitHub. `onMergeOpen` only opens the confirmation
 * dialog — the merge itself is `useItemActions.runMerge`, wired up by the
 * panel once a method is chosen there.
 */
export function DetailActionsRow({
  item,
  type,
  details,
  styles,
  acting,
  onApprove,
  onMergeOpen,
  onSend,
}: {
  item: BoardItem;
  type: ColumnId;
  details: ItemDetails | null;
  styles: Styles;
  acting: boolean;
  onApprove: () => void;
  onMergeOpen: () => void;
  onSend: (item: BoardItem, type: ColumnId) => void;
}) {
  return (
    <View style={styles.detailActions}>
      {details !== null ? (
        <ReviewActions
          item={item}
          details={details}
          styles={styles}
          busy={acting}
          onApprove={onApprove}
          onMerge={onMergeOpen}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Send ${item.repository} #${item.number} to a new workspace chat`}
        style={({ pressed }) => [styles.button, pressed ? styles.sendButtonPressed : null]}
        onPress={() => onSend(item, type)}
      >
        <Text style={styles.buttonLabel}>Send to chat</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${item.repository} #${item.number} on GitHub`}
        style={styles.ghostButton}
        onPress={() => openExternalUrl(item.url)}
      >
        <Text style={styles.ghostButtonLabel}>Open on GitHub</Text>
      </Pressable>
    </View>
  );
}
