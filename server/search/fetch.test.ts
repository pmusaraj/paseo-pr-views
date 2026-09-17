import { describe, expect, it, vi } from "vitest";
import { fetchSearchPage } from "./fetch";
import type { BoardItem } from "../../shared/board";

function response() {
  return {
    data: {
      search: {
        issueCount: 45,
        pageInfo: { hasNextPage: true, endCursor: "next" },
        nodes: [
          {
            id: "older",
            state: "OPEN",
            isDraft: false,
            additions: 123,
            deletions: 45,
            updatedAt: "2026-01-01",
            repository: { nameWithOwner: "team/project" },
          },
          {
            additions: 0,
            deletions: 12,
            id: "newer",
            state: "MERGED",
            isDraft: false,
            updatedAt: "2026-02-01",
          },
          {
            additions: 7,
            deletions: 0,
            id: "draft",
            state: "OPEN",
            isDraft: true,
          },
          null,
        ],
      },
    },
    errors: [],
  };
}

describe("fetchSearchPage", () => {
  it("uses advanced search variables and keeps result order and cursor metadata", async () => {
    const execute = vi.fn().mockResolvedValue(response());
    const checks = vi.fn(async (items: readonly BoardItem[]) =>
      items.map((item) => ({
        ...item,
        checks: { passed: 2, failed: 0, pending: 0 },
      })),
    );
    const query = "is:pr AND (org:alpha OR org:beta) sort:created-asc";
    const result = await fetchSearchPage(query, "previous", execute, checks);
    expect(execute.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        "api",
        "graphql",
        `search=${query}`,
        "cursor=previous",
        expect.stringContaining("type: ISSUE_ADVANCED"),
      ]),
    );
    expect(result.items.map((item) => item.id)).toEqual([
      "older",
      "newer",
      "draft",
    ]);
    expect(result.items[0]).toMatchObject({
      repository: "team/project",
      additions: 123,
      deletions: 45,
      relations: [],
      checks: { passed: 2 },
    });
    expect(result.items[1]).toMatchObject({
      state: "MERGED",
      prState: "MERGED",
      checks: null,
    });
    expect(checks.mock.calls[0]?.[0].map((item) => item.id)).toEqual(["older"]);
    expect(result).toMatchObject({
      total: 45,
      hasNextPage: true,
      endCursor: "next",
    });
  });

  it("surfaces GitHub errors and malformed responses instead of reporting zero matches", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({
        data: null,
        errors: [{ message: "Invalid query" }],
      });
    await expect(fetchSearchPage("bad", undefined, execute)).rejects.toThrow(
      "Invalid query",
    );
    execute.mockResolvedValue({ data: {}, errors: [] });
    await expect(fetchSearchPage("bad", undefined, execute)).rejects.toThrow();
  });

  it("returns an empty search without fetching checks for nonexistent PRs", async () => {
    const execute = vi.fn().mockResolvedValue({
      data: {
        search: {
          issueCount: 0,
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [],
        },
      },
      errors: [],
    });
    const checks = vi.fn(async (items: readonly BoardItem[]) => [...items]);
    const result = await fetchSearchPage("is:pr", undefined, execute, checks);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(checks).not.toHaveBeenCalled();
  });
});
