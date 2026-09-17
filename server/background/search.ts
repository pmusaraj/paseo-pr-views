import { z } from "zod";
import { resolveSearchQuery } from "../../shared/search-query";
import { ghGraphqlRaw } from "../github/graphql";

const PageSchema = z.object({
  issueCount: z.number(),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    endCursor: z.string().nullable(),
  }),
  nodes: z.array(z.object({ id: z.string() }).nullable()),
});
const QUERY = `query($search: String!, $cursor: String) {
  search(query: $search, type: ISSUE_ADVANCED, first: 100, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { id } }
  }
}`;

export async function fetchViewIds(
  query: string,
  execute = ghGraphqlRaw,
): Promise<string[]> {
  const search = resolveSearchQuery(
    query,
    new Date().toISOString().slice(0, 10),
  );
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${QUERY}`,
      "-f",
      `search=${search}`,
    ];
    if (cursor !== null) args.push("-f", `cursor=${cursor}`);
    const result = await execute(args);
    if (result.errors.length)
      throw new Error(result.errors.map((error) => error.message).join("; "));
    const page = PageSchema.parse(result.data?.search);
    if (page.issueCount > 1000)
      throw new Error(
        "Narrow this view to at most 1,000 results for background checks.",
      );
    for (const node of page.nodes) if (node) ids.add(node.id);
    if (!page.pageInfo.hasNextPage) return [...ids];
    cursor = page.pageInfo.endCursor;
    if (cursor === null || cursors.has(cursor))
      throw new Error("GitHub returned an incomplete search page.");
    cursors.add(cursor);
  }
  throw new Error("GitHub returned too many search pages.");
}
