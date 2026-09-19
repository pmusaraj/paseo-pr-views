import type { LinkedIssue } from "../../shared/board";
import type { GhSearchNode } from "./types";

/**
 * Pull requests carry `closingIssuesReferences` — the link from a pull request
 * to the issues it closes, and the only source that sees both closing keywords
 * in the body and issues attached by hand from the Development panel. The board
 * needs it to fold an issue into the pull request that closes it.
 */
export const PULL_REQUEST_SELECTION = `... on PullRequest {
  id
  number
  title
  url
  updatedAt
  createdAt
  isDraft
  state
  additions
  deletions
  headRefOid
  reviewDecision
  latestOpinionatedReviews(first: 100) {
    nodes { state }
    pageInfo { hasNextPage endCursor }
  }
  author { login }
  comments { totalCount }
  labels(first: 20) { nodes { name } }
  repository { nameWithOwner isArchived }
  closingIssuesReferences(first: 20) {
    nodes { id number repository { nameWithOwner } }
  }
  commits(last: 1) {
    nodes { commit { committedDate } }
  }
}`;

export interface GhPullRequestNode extends GhSearchNode {
  isDraft?: unknown;
  state?: unknown;
  closingIssuesReferences?: { nodes?: unknown };
  commits?: { nodes?: unknown };
}

export function toLinkedIssues(node: GhPullRequestNode): LinkedIssue[] {
  const nodes = node.closingIssuesReferences?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter(
      (issue): issue is Record<string, unknown> =>
        typeof issue === "object" && issue !== null,
    )
    .map((issue) => ({
      id: typeof issue.id === "string" ? issue.id : "",
      number: typeof issue.number === "number" ? issue.number : 0,
      repository:
        typeof (issue.repository as { nameWithOwner?: unknown } | undefined)
          ?.nameWithOwner === "string"
          ? (issue.repository as { nameWithOwner: string }).nameWithOwner
          : "",
    }))
    .filter((issue) => issue.id !== "");
}

/**
 * The head commit's date, from the single `commits(last: 1)` node requested
 * on every pull request. Null when GitHub reports no commit at all, which
 * happens on a pull request whose branch was force-pushed away underneath it.
 */
export function toLastCommitAt(node: GhPullRequestNode): string | null {
  const nodes = node.commits?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const commit = (
    nodes[0] as { commit?: { committedDate?: unknown } } | undefined
  )?.commit;
  return typeof commit?.committedDate === "string"
    ? commit.committedDate
    : null;
}
