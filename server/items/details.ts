import { approvalLogins, OpinionatedReviewsSchema } from "../../shared/pr-review";
import type { z } from "zod";
import type { ItemDetails, MergeMethod, ReviewState, loadItem } from "../../shared/board";
import { gh } from "../github/gh";
import { Cache } from "../cache/cache";

/**
 * The body of one card, fetched when its panel opens rather than with the
 * board: a body is the largest field an item has, and thirty of them per column
 * would weigh down a refresh for text the user reads one at a time.
 *
 * `node(id:)` resolves any node type, so one query serves all three kinds and
 * the inline fragments decide which fields come back. A discussion carries no
 * assignees on GitHub, and only a pull request has branches.
 */
const ITEM_QUERY = `query($id: ID!, $cursor: String) {
  node(id: $id) {
    ... on Issue {
      body state createdAt
      assignees(first: 20) { nodes { login } }
    }
    ... on PullRequest {
      body state isDraft createdAt baseRefName headRefName
      viewerDidAuthor mergeable
      viewerLatestReview { state }
      latestOpinionatedReviews(first: 100, after: $cursor) {
        nodes { state author { login } }
        pageInfo { hasNextPage endCursor }
      }
      assignees(first: 20) { nodes { login } }
      repository {
        viewerPermission
        mergeCommitAllowed
        squashMergeAllowed
        rebaseMergeAllowed
      }
    }
    ... on Discussion { body closed createdAt }
  }
}`;

interface GhItemNode {
  latestOpinionatedReviews?: unknown;
  body?: unknown;
  state?: unknown;
  isDraft?: unknown;
  closed?: unknown;
  createdAt?: unknown;
  baseRefName?: unknown;
  headRefName?: unknown;
  assignees?: { nodes?: unknown };
  viewerLatestReview?: { state?: unknown };
  viewerDidAuthor?: unknown;
  mergeable?: unknown;
  repository?: {
    viewerPermission?: unknown;
    mergeCommitAllowed?: unknown;
    squashMergeAllowed?: unknown;
    rebaseMergeAllowed?: unknown;
  };
}

function itemStateOf(node: GhItemNode): ItemDetails["state"] {
  if (node.state === "MERGED") return "merged";
  if (node.state === "CLOSED" || node.closed === true) return "closed";
  if (node.isDraft === true) return "draft";
  return "open";
}

/** Repository permissions that let the viewer press Merge. */
const MERGE_PERMISSIONS: Record<string, true> = { ADMIN: true, MAINTAIN: true, WRITE: true };

/**
 * GitHub answers `UNKNOWN` while it computes the test merge, for a few seconds
 * after a push, so an unknown is a "not yet" rather than a conflict. Merge
 * stays off for both, because only `MERGEABLE` is a merge that would land.
 */
function mergeableOf(value: unknown): ReviewState["mergeable"] {
  if (value === "MERGEABLE") return "mergeable";
  if (value === "CONFLICTING") return "conflicting";
  return "unknown";
}

/** Squash first because it is the common default, then merge, then rebase. */
function mergeMethodsOf(repository: GhItemNode["repository"]): MergeMethod[] {
  const candidates: readonly (readonly [MergeMethod, unknown])[] = [
    ["squash", repository?.squashMergeAllowed],
    ["merge", repository?.mergeCommitAllowed],
    ["rebase", repository?.rebaseMergeAllowed],
  ];
  return candidates.filter(([, allowed]) => allowed === true).map(([method]) => method);
}

/**
 * What the panel is allowed to do with this pull request, decided here rather
 * than on the client so the buttons and the mutations cannot disagree.
 *
 * A draft can be reviewed, so Approve stays on for one; it cannot be merged
 * without being marked ready, which is a decision this board does not make, so
 * Merge stays off rather than offering a press that always fails.
 */
function toReviewState(node: GhItemNode, state: ItemDetails["state"]): ReviewState {
  const viewerDidAuthor = node.viewerDidAuthor === true;
  const mergeable = mergeableOf(node.mergeable);
  const settled = state === "merged" || state === "closed";
  const permission = node.repository?.viewerPermission;
  const canWrite = typeof permission === "string" && MERGE_PERMISSIONS[permission] === true;
  const mergeMethods = mergeMethodsOf(node.repository);
  // The viewer's own latest review is the only thing that answers "have I
  // approved this?": a review someone else left is not it, and a dismissed or
  // superseded one is not either.
  const viewerHasApproved = node.viewerLatestReview?.state === "APPROVED";
  return {
    viewerHasApproved,
    viewerDidAuthor,
    viewerCanApprove: !viewerDidAuthor && !settled,
    viewerCanMerge:
      canWrite && state === "open" && mergeable === "mergeable" && mergeMethods.length > 0,
    mergeable,
    mergeMethods,
  };
}

function toItemDetails(node: GhItemNode): ItemDetails {
  const assigneeNodes = node.assignees?.nodes;
  const assignees = Array.isArray(assigneeNodes)
    ? assigneeNodes
        .map((assignee) => (assignee as { login?: unknown }).login)
        .filter((login): login is string => typeof login === "string")
    : [];
  const state = itemStateOf(node);
  const branches =
    typeof node.headRefName === "string" && typeof node.baseRefName === "string"
      ? { head: node.headRefName, base: node.baseRefName }
      : null;
  return {
    state,
    body: typeof node.body === "string" ? node.body : "",
    createdAt: typeof node.createdAt === "string" ? node.createdAt : "",
    assignees,
    branches,
    // Branches are what makes it a pull request: an issue has none, and a
    // discussion has neither branches nor anything to approve.
    review: branches === null ? null : toReviewState(node, state),
  };
}

export async function fetchItemDetails(id: string, execute = gh): Promise<ItemDetails> {
  const raw = await execute(["api", "graphql", "-f", `query=${ITEM_QUERY}`, "-f", `id=${id}`]);
  const parsed: unknown = JSON.parse(raw);
  const node = (parsed as { data?: { node?: unknown } }).data?.node;
  if (typeof node !== "object" || node === null) {
    throw new Error("GitHub no longer has this item, or the account cannot see it.");
  }
  const details = toItemDetails(node as GhItemNode);
  if (details.branches === null) return details;
  let page = OpinionatedReviewsSchema.parse(Reflect.get(node, "latestOpinionatedReviews"));
  const opinions = [...page.nodes];
  const cursors = new Set<string>();
  while (page.pageInfo.hasNextPage) {
    const cursor = page.pageInfo.endCursor;
    if (cursor === null || cursors.has(cursor))
      throw new Error("GitHub returned an invalid review cursor.");
    cursors.add(cursor);
    const next: unknown = JSON.parse(
      await execute([
        "api",
        "graphql",
        "-f",
        `query=${ITEM_QUERY}`,
        "-f",
        `id=${id}`,
        "-f",
        `cursor=${cursor}`,
      ]),
    );
    if (typeof next !== "object" || next === null)
      throw new Error("Invalid GitHub review response.");
    const data: unknown = Reflect.get(next, "data");
    const nextNode: unknown =
      typeof data === "object" && data !== null ? Reflect.get(data, "node") : null;
    page = OpinionatedReviewsSchema.parse(
      typeof nextNode === "object" && nextNode !== null
        ? Reflect.get(nextNode, "latestOpinionatedReviews")
        : null,
    );
    opinions.push(...page.nodes);
  }
  return { ...details, approvedBy: approvalLogins(opinions) };
}

/**
 * Cached like the board, and for the same reason: the panel is reopened on the
 * same few cards, and each open would otherwise be a `gh` subprocess. `force`
 * is the panel's Refresh button, for a body edited on GitHub in the meantime.
 */
export const DETAILS_TTL_MS = 5 * 60_000;

export const detailsCache = new Cache<ItemDetails>("item-details-reviews-v1");

export async function loadItemHandler({
  id,
  force,
}: z.output<typeof loadItem.input>): Promise<z.input<typeof loadItem.output>> {
  return detailsCache.get(id, DETAILS_TTL_MS, () => fetchItemDetails(id), { force });
}
