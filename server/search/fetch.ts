import { z } from "zod";
import type { SearchPage } from "../../shared/saved-views";
import {
  PULL_REQUEST_SELECTION,
  toLastCommitAt,
  toLinkedIssues,
} from "../board/pull-requests";
import { toItem } from "../board/item";
import { ghGraphqlRaw } from "../github/graphql";
import { attachChecks } from "../board/checks";

const ConnectionSchema = z.object({
  issueCount: z.number().int().nonnegative(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
  }),
  nodes: z.array(
    z
      .object({
        id: z.string(),
        state: z.enum(["OPEN", "CLOSED", "MERGED"]),
        isDraft: z.boolean(),
        additions: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
        headRefOid: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable(),
  ),
});

export const SEARCH_QUERY = `query($search: String!, $cursor: String) {
  search(query: $search, type: ISSUE_ADVANCED, first: 100, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ${PULL_REQUEST_SELECTION} }
  }
}`;

export async function fetchSearchPage(
  query: string,
  cursor: string | undefined,
  execute = ghGraphqlRaw,
  checks = attachChecks,
): Promise<Pick<SearchPage, "items" | "total" | "hasNextPage" | "endCursor">> {
  const args = [
    "api",
    "graphql",
    "-f",
    `query=${SEARCH_QUERY}`,
    "-f",
    `search=${query}`,
  ];
  if (cursor !== undefined) args.push("-f", `cursor=${cursor}`);
  const result = await execute(args);
  if (result.errors.length > 0)
    throw new Error(result.errors.map((error) => error.message).join("; "));
  const connection = ConnectionSchema.parse(result.data?.search);
  const items = connection.nodes.flatMap((node) =>
    node === null
      ? []
      : [
          {
            ...toItem(node, null, toLastCommitAt(node)),
            linkedIssues: toLinkedIssues(node),
            additions: node.additions,
            deletions: node.deletions,
            headOid: node.headRefOid ?? null,
            state: node.state,
            prState: node.state,
            isDraft: node.isDraft,
          },
        ],
  );
  const eligible = items.filter(
    (item) => item.state === "OPEN" && !item.isDraft,
  );
  const checked = eligible.length === 0 ? [] : await checks(eligible);
  const byId = new Map(checked.map((item) => [item.id, item.checks]));
  return {
    items: items.map((item) => ({
      ...item,
      checks: byId.get(item.id) ?? null,
    })),
    total: connection.issueCount,
    hasNextPage: connection.pageInfo.hasNextPage,
    endCursor: connection.pageInfo.endCursor,
  };
}
