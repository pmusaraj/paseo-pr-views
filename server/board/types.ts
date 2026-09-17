import type { Relation } from "../../shared/board";
import { RELATION_IDS } from "../../shared/board";

/** The fields every relation-bucket search selection asks for, regardless of item type. */
export interface GhSearchNode {
  state?: unknown;
  reviewDecision?: unknown;
  latestOpinionatedReviews?: unknown;
  id?: unknown;
  number?: unknown;
  title?: unknown;
  url?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  author?: { login?: unknown };
  comments?: { totalCount?: unknown };
  labels?: { nodes?: unknown };
  repository?: { nameWithOwner?: unknown; isArchived?: unknown };
}

/**
 * An archived repository is read-only, so its open issues and pull requests can
 * never be closed and sit on the board forever. The qualifier filters them out
 * server-side; discussions have no such qualifier and are filtered on the
 * response.
 */
export const UNARCHIVED_ONLY = "archived:false";

/** One relation the viewer can have to an item, and the search qualifier that finds it. */
export interface RelationBucket {
  relation: Relation;
  qualifier: string;
}

/** One relation bucket's results, or omitted entirely when its search failed. */
export interface BucketResult {
  relation: Relation;
  nodes: unknown[];
}

/**
 * `RELATION_IDS`'s own order, precomputed once instead of an `indexOf` scan
 * per comparison. The initial value is empty only until the loop below fills
 * every key `RELATION_IDS` declares; the cast just names that guarantee once.
 */
export const RELATION_ORDER = RELATION_IDS.reduce(
  (order, relation, index) => {
    order[relation] = index;
    return order;
  },
  {} as Record<Relation, number>,
);
