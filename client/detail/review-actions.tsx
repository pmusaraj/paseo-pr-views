import { Pressable, Text } from "react-native";

import type { BoardItem, ItemDetails, ReviewState } from "../../shared/board";
import type { Styles } from "../theme/use-styles";

/**
 * What Approve says. A button nobody is allowed to press names the reason
 * instead of the action: the press would fail on GitHub either way, and this
 * way the panel answers the question before it is asked.
 */
export function approveLabel(review: ReviewState): string {
  if (review.viewerHasApproved) return "Approved";
  if (review.viewerDidAuthor) return "Your pull request";
  return "Approve";
}

/** Approval is available once GitHub reports the viewer's capabilities. */
export function ReviewActions({
  item,
  details,
  styles,
  busy,
  approving,
  onApprove,
}: {
  item: BoardItem;
  details: ItemDetails;
  styles: Styles;
  busy: boolean;
  approving: boolean;
  onApprove: () => void;
}) {
  const review = details.review;
  if (review === null) return null;
  const canApprove = review.viewerCanApprove && !review.viewerHasApproved && !busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Approve ${item.repository} #${item.number}`}
      disabled={!canApprove}
      style={({ pressed }) => [
        styles.ghostButton,
        canApprove ? null : styles.buttonDisabled,
        pressed ? styles.sendButtonPressed : null,
      ]}
      onPress={onApprove}
    >
      <Text style={styles.ghostButtonLabel}>{approving ? "Approving…" : approveLabel(review)}</Text>
    </Pressable>
  );
}
