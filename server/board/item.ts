import { reviewStatus } from "../../shared/pr-review";
import type { BoardItem } from "../../shared/board";
import type { GhSearchNode } from "./types";

/** GitHub returns a label as `{ name }`; every list of them needs the same narrowing. */
export function labelNodeNames(nodes: unknown): string[] {
  if (!Array.isArray(nodes)) return [];
  const names: string[] = [];
  for (const raw of nodes) {
    if (typeof raw !== "object" || raw === null) continue;
    const label = raw as { name?: unknown };
    if (typeof label.name === "string") names.push(label.name);
  }
  return names;
}

export function toItem(
  node: GhSearchNode,
  detail: string | null,
  lastCommitAt: string | null = null,
): BoardItem {
  const labels = labelNodeNames(node.labels?.nodes);
  const comments = node.comments?.totalCount;
  const repository =
    typeof node.repository?.nameWithOwner === "string" ? node.repository.nameWithOwner : "";
  const ownerSeparator = repository.indexOf("/");
  return {
    ...(node.state === "OPEN" || node.state === "CLOSED" || node.state === "MERGED" ? { prState: node.state } : {}),
    prReview: reviewStatus(node.reviewDecision, node.latestOpinionatedReviews),
    id: typeof node.id === "string" ? node.id : String(node.url),
    number: typeof node.number === "number" ? node.number : 0,
    title: typeof node.title === "string" ? node.title : "",
    url: typeof node.url === "string" ? node.url : "",
    repository,
    updatedAt: typeof node.updatedAt === "string" ? node.updatedAt : "",
    createdAt: typeof node.createdAt === "string" ? node.createdAt : "",
    // Null on anything that is not a pull request, or a pull request GitHub
    // reports no head commit for; only fetchPullRequests' mapper passes one in.
    lastCommitAt,
    commentsCount: typeof comments === "number" ? comments : 0,
    labels,
    // Null rather than empty for a deleted account, which GitHub returns as no
    // author at all; the card shows nothing instead of an authorless byline.
    author: typeof node.author?.login === "string" ? node.author.login : null,
    detail,
    // The owner half of `repository`, for the owner filter.
    owner: ownerSeparator === -1 ? repository : repository.slice(0, ownerSeparator),
    // Overwritten by `mergeBucketResults` the moment the item is first added;
    // never observed empty because an item only exists here as a search hit.
    relations: [],
    // Only pull requests link issues; every other caller keeps the empty list.
    linkedIssues: [],
    // Filled for open pull requests only, by fetchChecks; see attachChecks.
    checks: null,
  };
}
