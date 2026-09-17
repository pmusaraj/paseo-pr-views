import type { z } from "zod";
import type { ItemComment, loadComments } from "../../shared/board";
import { gh } from "../github/gh";
import { Cache } from "../cache/cache";

/**
 * The conversation on one card. `comments` on an issue or a pull request is
 * the flat conversation; a discussion threads one level deep, so its replies
 * are selected too and flattened with `depth: 1`. The page sizes are what a
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
  const connection = (node as { comments?: unknown }).comments;
  const comments: ItemComment[] = [];
  let truncated = countOf(connection) > COMMENTS_PAGE;
  for (const commentNode of commentNodesOf(connection)) {
    comments.push(toComment(commentNode, 0));
    // Replies are a discussion's second level; issues and pull requests have none.
    if (countOf(commentNode.replies) > REPLIES_PAGE) truncated = true;
    for (const reply of commentNodesOf(commentNode.replies)) {
      comments.push(toComment(reply, 1));
    }
  }
  return { comments: comments.filter((comment) => comment.id !== ""), truncated };
}

/** Cached like the body, and for as long; `force` is the same Refresh button. */
const COMMENTS_TTL_MS = 5 * 60_000;

const commentsCache = new Cache<{ comments: ItemComment[]; truncated: boolean }>("item-comments");

export async function loadCommentsHandler({
  id,
  force,
}: z.output<typeof loadComments.input>): Promise<z.input<typeof loadComments.output>> {
  return commentsCache.get(id, COMMENTS_TTL_MS, () => fetchComments(id), { force });
}
