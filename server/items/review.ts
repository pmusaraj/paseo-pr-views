import { searchCache } from "../search/cache";
import type { z } from "zod";
import type { ItemDetails, MergeMethod, approvePullRequest, mergePullRequest } from "../../shared/board";
import { ghMutation } from "../github/graphql";
import { dropCachedItem } from "../board/cache";
import { detailsCache, fetchItemDetails } from "./details";

const APPROVE_MUTATION = `mutation($id: ID!, $body: String!) {
  addPullRequestReview(input: { pullRequestId: $id, event: APPROVE, body: $body }) {
    pullRequestReview { state }
  }
}`;

const MERGE_MUTATION = `mutation($id: ID!, $method: PullRequestMergeMethod!) {
  mergePullRequest(input: { pullRequestId: $id, mergeMethod: $method }) {
    pullRequest { state }
  }
}`;

const MERGE_METHOD_NAMES: Record<MergeMethod, string> = {
  merge: "MERGE",
  squash: "SQUASH",
  rebase: "REBASE",
};

/**
 * Re-reads the item past the cache and stores what came back, so the panel
 * repaints from GitHub's state after the write rather than from the caller's
 * assumption about it.
 */
async function refreshDetails(id: string): Promise<ItemDetails> {
  const details = await fetchItemDetails(id);
  await detailsCache.set(id, details);
  return details;
}

export async function approveHandler({
  id,
  body,
}: z.output<typeof approvePullRequest.input>): Promise<z.input<typeof approvePullRequest.output>> {
  await ghMutation(APPROVE_MUTATION, { id, body });
  await searchCache.clear();
  return refreshDetails(id);
}

export async function mergeHandler({
  id,
  method,
}: z.output<typeof mergePullRequest.input>): Promise<z.input<typeof mergePullRequest.output>> {
  await ghMutation(MERGE_MUTATION, { id, method: MERGE_METHOD_NAMES[method] });
  await searchCache.clear();
  const details = await refreshDetails(id);
  await dropCachedItem(id);
  return details;
}
