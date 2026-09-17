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

/** The same for Merge, whose blockers are the branch rather than the author. */
export function mergeLabel(review: ReviewState, state: ItemDetails["state"]): string {
  if (state === "merged") return "Merged";
  if (state === "closed") return "Closed";
  if (state === "draft") return "Draft";
  if (review.mergeable === "conflicting") return "Conflicts";
  // GitHub computes the test merge asynchronously and answers UNKNOWN until it
  // has. Refresh is what resolves it, so the label points at waiting.
  if (review.mergeable === "unknown") return "Checking...";
  if (review.mergeMethods.length === 0) return "No method allowed";
  if (!review.viewerCanMerge) return "No merge access";
  return "Merge";
}

/**
 * The two write actions on a pull request, beside the two that were always
 * there. Rendered only for a pull request, because `review` is null on
 * anything else, and disabled from the server's own capability flags rather
 * than from a guess made here.
 */
export function ReviewActions({
  item,
  details,
  styles,
  busy,
  onApprove,
  onMerge,
}: {
  item: BoardItem;
  details: ItemDetails;
  styles: Styles;
  busy: boolean;
  onApprove: () => void;
  onMerge: () => void;
}) {
  const review = details.review;
  if (review === null) return null;
  const canApprove = review.viewerCanApprove && !review.viewerHasApproved && !busy;
  const canMerge = review.viewerCanMerge && !busy;
  return (
    <>
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
        <Text style={styles.ghostButtonLabel}>{approveLabel(review)}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Merge ${item.repository} #${item.number}`}
        disabled={!canMerge}
        style={({ pressed }) => [
          styles.ghostButton,
          canMerge ? null : styles.buttonDisabled,
          pressed ? styles.sendButtonPressed : null,
        ]}
        onPress={onMerge}
      >
        <Text style={styles.ghostButtonLabel}>{mergeLabel(review, details.state)}</Text>
      </Pressable>
    </>
  );
}
