import { Pressable, Text, View } from "react-native";

import type { BoardItem, ColumnId, ItemDetails } from "../../shared/board";
import type { Styles } from "../theme/use-styles";
import { openExternalUrl } from "../web";
import { ReviewActions } from "./review-actions";

/** Approve a PR, send it to chat, or open it on GitHub. */
export function DetailActionsRow({
  item,
  type,
  details,
  styles,
  acting,
  approving,
  onApprove,
  onSend,
}: {
  item: BoardItem;
  type: ColumnId;
  details: ItemDetails | null;
  styles: Styles;
  acting: boolean;
  approving: boolean;
  onApprove: () => void;
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
          approving={approving}
          onApprove={onApprove}
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
