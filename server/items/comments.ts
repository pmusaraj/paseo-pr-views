import type { z } from "zod";
import type { ItemComment, loadComments } from "../../shared/board";
import { gh } from "../github/gh";
import { Cache } from "../cache/cache";

/**
 * The conversation on one card. `comments` on an issue or a pull request is
 * the flat conversation. Discussions and PR review threads also include
 * replies, flattened with `depth: 1`. The page sizes are what a
 * panel can be scrolled through — anything longer is read on GitHub, which
 * `truncated` tells the panel to say.
 */
const COMMENTS_PAGE = 50;
const REPLIES_PAGE = 20;

const COMMENT_FIELDS = "id body createdAt author { login }";

const COMMENTS_QUERY = `query($id: ID!, $first: Int!, $replies: Int!) {
  node(id: $id) {
    ... on Issue {
      comments(first: $first) { totalCount nodes { ${COMMENT_FIELDS} } }
    }
    ... on PullRequest {
      comments(first: $first) { totalCount nodes { ${COMMENT_FIELDS} } }
      reviews(first: $first) {
        totalCount
        nodes { ${COMMENT_FIELDS} state }
      }
      reviewThreads(first: $first) {
        totalCount
        nodes {
          comments(first: $replies) {
            totalCount
            nodes { ${COMMENT_FIELDS} path line originalLine }
          }
        }
      }
    }
    ... on Discussion {
      comments(first: $first) {
        totalCount
        nodes {
          ${COMMENT_FIELDS}
          replies(first: $replies) { totalCount nodes { ${COMMENT_FIELDS} } }
        }
      }
    }
  }
}`;

interface GhCommentNode {
  id?: unknown;
  body?: unknown;
  createdAt?: unknown;
  author?: { login?: unknown };
  state?: unknown;
  path?: unknown;
  line?: unknown;
  originalLine?: unknown;
  comments?: unknown;
  replies?: { totalCount?: unknown; nodes?: unknown };
}

function toComment(node: GhCommentNode, depth: number): ItemComment {
  return {
    id: typeof node.id === "string" ? node.id : "",
    author: typeof node.author?.login === "string" ? node.author.login : null,
    createdAt: typeof node.createdAt === "string" ? node.createdAt : "",
    body: typeof node.body === "string" ? node.body : "",
    depth,
  };
}

function commentNodesOf(value: unknown): GhCommentNode[] {
  const nodes = (value as { nodes?: unknown } | undefined)?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(
    (node): node is GhCommentNode => typeof node === "object" && node !== null,
  );
}

function countOf(value: unknown): number {
  const total = (value as { totalCount?: unknown } | undefined)?.totalCount;
  return typeof total === "number" ? total : 0;
}

async function fetchComments(id: string): Promise<{ comments: ItemComment[]; truncated: boolean }> {
  const raw = await gh([
    "api",
    "graphql",
    "-f",
    `query=${COMMENTS_QUERY}`,
    "-f",
    `id=${id}`,
    "-F",
    `first=${COMMENTS_PAGE}`,
    "-F",
    `replies=${REPLIES_PAGE}`,
  ]);
  const parsed: unknown = JSON.parse(raw);
  const node = (parsed as { data?: { node?: unknown } }).data?.node;
  if (typeof node !== "object" || node === null) {
    throw new Error("GitHub no longer has this item, or the account cannot see it.");
  }
  const connections = node as { comments?: unknown; reviews?: unknown; reviewThreads?: unknown };
  const connection = connections.comments;
  const groups: ItemComment[][] = [];
  let truncated = countOf(connection) > COMMENTS_PAGE;
  for (const commentNode of commentNodesOf(connection)) {
    const group = [toComment(commentNode, 0)];
    // Discussion replies stay beside their parent.
    if (countOf(commentNode.replies) > REPLIES_PAGE) truncated = true;
    for (const reply of commentNodesOf(commentNode.replies)) {
      group.push(toComment(reply, 1));
    }
    groups.push(group);
  }
  truncated ||= countOf(connections.reviews) > COMMENTS_PAGE || countOf(connections.reviewThreads) > COMMENTS_PAGE;
  for (const review of commentNodesOf(connections.reviews)) {
    const comment = toComment(review, 0);
    // Empty approvals have no comment body; pending reviews are unpublished.
    if (review.state !== "PENDING" && comment.body.trim() !== "") groups.push([comment]);
  }
  for (const thread of commentNodesOf(connections.reviewThreads)) {
    if (countOf(thread.comments) > REPLIES_PAGE) truncated = true;
    const group = commentNodesOf(thread.comments).map((entry, index) => ({
      ...toComment(entry, index === 0 ? 0 : 1),
      ...(typeof entry.path === "string" ? {
        location: `${entry.path}${typeof entry.line === "number" ? `:${entry.line}` : typeof entry.originalLine === "number" ? `:${entry.originalLine} (outdated)` : ""}`,
      } : {}),
    }));
    if (group.length > 0) groups.push(group);
  }
  // Sort whole threads so later replies never become detached from their parent.
  groups.sort((a, b) => a[0]!.createdAt.localeCompare(b[0]!.createdAt));
  return { comments: groups.flat().filter((comment) => comment.id !== ""), truncated };
}

/** Cached like the body, and for as long; `force` is the same Refresh button. */
const COMMENTS_TTL_MS = 5 * 60_000;

const commentsCache = new Cache<{ comments: ItemComment[]; truncated: boolean }>("item-comments-v2");

export async function loadCommentsHandler({
  id,
  force,
}: z.output<typeof loadComments.input>): Promise<z.input<typeof loadComments.output>> {
  return commentsCache.get(id, COMMENTS_TTL_MS, () => fetchComments(id), { force });
}
