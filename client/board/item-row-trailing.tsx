import { Text, View } from "react-native";

import type { BoardItem, CheckSummary } from "../../shared/board";
import { linkedIssueLabel } from "../lib/formatting";
import type { Styles } from "../theme/use-styles";

/**
 * A pull request's checks, as Paseo's sidebar hover card spells them: a count
 * per outcome rather than one verdict, because "12 passed, 1 failed" is the
 * fact a reader acts on and "failed" alone is not.
 *
 * An outcome nobody has is left out entirely — a green pull request shows one
 * pill, not two zeroes — and a pull request with no checks at all arrives with
 * `checks` null and shows nothing.
 */
export function ChecksPills({
  checks,
  styles,
}: {
  checks: CheckSummary;
  styles: Styles;
}) {
  return (
    <View style={styles.checksGroup}>
      {checks.passed > 0 ? (
        <Text style={styles.checksPassed}>✓ {checks.passed}</Text>
      ) : null}
      {checks.failed > 0 ? (
        <Text style={styles.checksFailed}>✕ {checks.failed}</Text>
      ) : null}
      {checks.pending > 0 ? (
        <Text style={styles.checksPending}>● {checks.pending}</Text>
      ) : null}
    </View>
  );
}

/**
 * The row's trailing group: checks, comment count, linked issues, the detail
 * a folded-in draft carries, and up to three labels with an overflow count.
 * Rendered twice by `ItemRow` — inline on the wide layout, wrapped onto its
 * own line when compact — so it is one component rather than duplicated JSX.
 */
export function ItemRowTrailing({
  item,
  styles,
}: {
  item: BoardItem;
  styles: Styles;
}) {
  return (
    <>
      {item.checks !== null ? (
        <ChecksPills checks={item.checks} styles={styles} />
      ) : null}
      {item.commentsCount > 0 ? (
        <Text style={styles.subtle}>{item.commentsCount} comments</Text>
      ) : null}
      {item.linkedIssues.map((issue) => (
        <Text key={issue.id} style={styles.linkedIssue}>
          {linkedIssueLabel(issue, item.repository)}
        </Text>
      ))}
      {item.detail !== null ? (
        <Text style={styles.label}>{item.detail}</Text>
      ) : null}
      {item.labels.slice(0, 3).map((label) => (
        <Text key={label} style={styles.label}>
          {label}
        </Text>
      ))}
      {/* Labels are editable now, so the row has to admit when it is not
          showing all of them rather than look like the edit did nothing. */}
      {item.labels.length > 3 ? (
        <Text style={styles.labelMore}>+{item.labels.length - 3}</Text>
      ) : null}
      {item.additions !== undefined && item.deletions !== undefined ? (
        <View
          style={styles.checksGroup}
          accessibilityLabel={`${item.additions} lines added, ${item.deletions} lines deleted`}
        >
          <Text style={[styles.checksPassed, { color: styles.prStatusColors.approved }]}>
            +{item.additions}
          </Text>
          <Text style={styles.checksFailed}>−{item.deletions}</Text>
        </View>
      ) : null}
    </>
  );
}
