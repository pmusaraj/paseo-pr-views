import { Icon } from "@getpaseo/plugin/client/react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { ItemComment } from "../../shared/board";
import { absoluteDate } from "../lib/time";
import type { Styles } from "../theme/use-styles";
import { openExternalUrl } from "../web";
import { MarkdownBody } from "./markdown";

/**
 * The comments section: the "Load comments" button before the first request,
 * a spinner or error while it is in flight, and the thread itself once it
 * lands. Renders only once the item's own details have loaded, which the
 * panel enforces before mounting this.
 */
export function DetailComments({
  commentsCount,
  requested,
  comments,
  commentsError,
  foregroundColor,
  accentColor,
  styles,
  renderImage,
  onRequest,
}: {
  commentsCount: number;
  requested: boolean;
  comments: { comments: ItemComment[]; truncated: boolean } | null;
  commentsError: string | null;
  foregroundColor: string;
  accentColor: string;
  styles: Styles;
  renderImage: (image: { url: string; alt: string }) => React.JSX.Element;
  onRequest: () => void;
}) {
  if (!requested) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Load ${commentsCount} comments`}
        style={({ pressed }) => [styles.loadCommentsButton, pressed ? styles.cardPressed : null]}
        onPress={onRequest}
      >
        <Icon name="MessageSquare" size={14} color={foregroundColor} />
        <Text style={styles.ghostButtonLabel}>
          {commentsCount === 0 ? "Load comments" : `Load ${commentsCount} ${commentsCount === 1 ? "comment" : "comments"}`}
        </Text>
      </Pressable>
    );
  }
  if (comments === null) {
    if (commentsError !== null) return <Text style={styles.danger}>{commentsError}</Text>;
    return (
      <View style={styles.centeredRow}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }
  return (
    <>
      {commentsError !== null ? <Text style={styles.danger}>{commentsError}</Text> : null}
      {comments.comments.length === 0 ? (
        <Text style={styles.empty}>No comments yet.</Text>
      ) : (
        comments.comments.map((comment) => (
          <View
            key={comment.id}
            style={[styles.commentCard, comment.depth > 0 ? styles.commentReply : null]}
          >
            <Text style={styles.commentHeader}>
              {comment.author === null ? "deleted account" : `@${comment.author}`}
              {comment.createdAt === "" ? "" : ` · ${absoluteDate(comment.createdAt)}`}
            </Text>
            {comment.body.trim() === "" ? (
              <Text style={styles.empty}>Empty comment.</Text>
            ) : (
              <MarkdownBody
                source={comment.body}
                styles={styles}
                onOpenLink={openExternalUrl}
                renderImage={renderImage}
              />
            )}
          </View>
        ))
      )}
      {comments.truncated ? (
        <Text style={styles.detailMeta}>
          Only the first comments are shown here. Open on GitHub for the rest.
        </Text>
      ) : null}
    </>
  );
}
