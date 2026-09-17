import type { z } from "zod";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { searchPullRequests } from "../../shared/saved-views";
import { resolveSearchQuery } from "../../shared/search-query";
import { resolveViewerLogin } from "../github/gh";
import { describeRepositoryProjects } from "../board/handler";
import { fetchSearchPage } from "./fetch";
import { searchCache } from "./cache";

export async function searchPullRequestsHandler(
  input: z.output<typeof searchPullRequests.input>,
  { paseo }: PluginHandlerContext,
) {
  const login = await resolveViewerLogin();
  const effectiveDate = input.effectiveDate ?? new Date().toISOString().slice(0, 10);
  const resolvedQuery = resolveSearchQuery(input.query, effectiveDate);
  const key = JSON.stringify([login, resolvedQuery, input.cursor ?? null]);
  return searchCache.get(
    key,
    5 * 60_000,
    async () => {
      const page = await fetchSearchPage(resolvedQuery, input.cursor);
      const projects = await describeRepositoryProjects(paseo, [
        {
          id: "open-prs",
          title: "Search",
          items: page.items,
          error: null,
        },
      ]);
      return {
        ...page,
        ...projects,
        login,
        effectiveDate,
        resolvedQuery,
        fetchedAt: new Date().toISOString(),
      };
    },
    { force: input.force },
  );
}
