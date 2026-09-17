import type { BoardItem, ColumnId } from "../../shared/board";

export interface PrStatusColors {
  approved: string;
  changesRequested: string;
  closed: string;
  merged: string;
  neutral: string;
}

/** Terminal state and draft status take precedence over earlier review opinions. */
export function prStatusIcon(
  item: Pick<BoardItem, "prState" | "prReview">,
  type: ColumnId,
  colors: PrStatusColors,
) {
  if (item.prState === "MERGED")
    return { iconName: "GitMerge", iconColor: colors.merged, label: "Merged" };
  if (item.prState === "CLOSED")
    return {
      iconName: "GitPullRequestClosed",
      iconColor: colors.closed,
      label: "Closed",
    };
  if (type === "draft-prs")
    return {
      iconName: "GitPullRequestDraft",
      iconColor: colors.neutral,
      label: "Draft",
    };
  if (item.prReview === "changes-requested")
    return {
      iconName: "GitPullRequest",
      iconColor: colors.changesRequested,
      label: "Changes requested",
    };
  if (item.prReview === "approved")
    return {
      iconName: "GitPullRequest",
      iconColor: colors.approved,
      label: "Approved",
    };
  return {
    iconName: "GitPullRequest",
    iconColor: colors.neutral,
    label: item.prReview === "review-required" ? "Review required" : "Open",
  };
}
