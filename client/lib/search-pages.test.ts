import { expect, it } from "vitest";
import { mergeSearchPages } from "./search-pages";
import type { SearchPage } from "../../shared/saved-views";

it("deduplicates moving search results across pages without changing GitHub order", () => {
  const page = (ids: string[]): SearchPage => ({
    items: ids.map((id) => ({
      id,
      number: 1,
      title: id,
      url: "",
      repository: "",
      updatedAt: "",
      createdAt: "",
      lastCommitAt: null,
      commentsCount: 0,
      labels: [],
      author: null,
      detail: null,
      owner: "",
      relations: [],
      linkedIssues: [],
      checks: null,
      state: "OPEN",
      isDraft: false,
    })),
    login: "viewer",
    total: 4,
    hasNextPage: false,
    endCursor: null,
    resolvedQuery: "is:pr",
    effectiveDate: "2026-09-16",
    fetchedAt: "",
    repositoryProjects: {},
  });
  expect(mergeSearchPages([page(["b", "a"]), page(["a", "c"])]).map((item) => item.id)).toEqual([
    "b",
    "a",
    "c",
  ]);
});
