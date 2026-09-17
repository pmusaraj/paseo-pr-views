import { Text, View } from "react-native";

import type { BoardItem, ColumnId, ItemDetails } from "../../shared/board";
import { ChecksPills } from "../board/item-row";
import { linkedIssueLabel } from "../lib/formatting";
import { absoluteDate } from "../lib/time";
import type { Styles } from "../theme/use-styles";
import { openExternalUrl } from "../web";
import { MarkdownBody } from "./markdown";

/** What a card is called in the panel, by the column it came from. */
export function kindLabel(type: ColumnId): string {
  if (type === "issues") return "Issue";
  if (type === "discussions") return "Discussion";
  return "Pull request";
}

/**
 * The card's own summary, shown whether or not its full details have loaded
 * yet: title, the meta line, the branches a pull request merges between, and
 * the checks/linked-issue/label row.
 */
export function DetailSummary({
  item,
  type,
  details,
  styles,
}: {
  item: BoardItem;
  type: ColumnId;
  details: ItemDetails | null;
  styles: Styles;
}) {
  const meta = [
    `${kindLabel(type)} #${item.number}`,
    item.author === null ? null : `@${item.author}`,
    `${item.commentsCount} ${item.commentsCount === 1 ? "comment" : "comments"}`,
    item.detail,
    details === null || details.createdAt === ""
      ? null
      : `opened ${absoluteDate(details.createdAt)}`,
  ]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");

  return (
    <>
      <Text accessibilityRole="header" style={styles.detailTitle}>
        {item.title}
      </Text>
      <Text style={styles.detailMeta}>{meta}</Text>
      {(details?.approvedBy ?? []).map((login) => (
        <Text key={login} style={styles.detailMeta}>
          Approved by {login}
        </Text>
      ))}
      {details?.branches ? (
        <Text style={styles.detailMeta}>
          {details.branches.head} → {details.branches.base}
        </Text>
      ) : null}
      {item.labels.length > 0 || item.linkedIssues.length > 0 || item.checks !== null ? (
        <View style={styles.detailLabels}>
          {item.checks !== null ? <ChecksPills checks={item.checks} styles={styles} /> : null}
          {item.linkedIssues.map((issue) => (
            <Text key={issue.id} style={styles.linkedIssue}>
              {linkedIssueLabel(issue, item.repository)}
            </Text>
          ))}
          {item.labels.map((label) => (
            <Text key={label} style={styles.label}>
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

/**
 * The card's written content, once its details have loaded: a refresh error
 * above the body it kept, the description itself, and the assignees. The
 * panel only renders this once `details` is non-null; see `ItemDetailPanel`.
 */
export function DetailDescription({
  details,
  error,
  styles,
  renderImage,
}: {
  details: ItemDetails;
  error: string | null;
  styles: Styles;
  renderImage: (image: { url: string; alt: string }) => React.JSX.Element;
}) {
  return (
    <>
      {/* A failed refresh keeps the body it had and says so above it. */}
      {error !== null ? <Text style={styles.danger}>{error}</Text> : null}
      {details.body.trim() === "" ? (
        <Text style={styles.empty}>No description was written.</Text>
      ) : (
        <MarkdownBody
          source={details.body}
          styles={styles}
          onOpenLink={openExternalUrl}
          renderImage={renderImage}
        />
      )}
      {details.assignees.length > 0 ? (
        <>
          <View style={styles.detailDivider} />
          <Text style={styles.detailMeta}>
            Assignees: {details.assignees.map((login) => `@${login}`).join(", ")}
          </Text>
        </>
      ) : null}
    </>
  );
}
