import { describe, expect, it, vi } from "vitest";
import { fetchViewIds } from "./search";

const page = (ids: string[], next: string | null, total = ids.length) => ({
  data: {
    search: {
      issueCount: total,
      nodes: ids.map((id) => ({ id })),
      pageInfo: { hasNextPage: next !== null, endCursor: next },
    },
  },
  errors: [],
});

describe("background search", () => {
  it("checks all pages with minimal fields, preserves PR scope, and deduplicates IDs", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(page(["a"], "page2", 2))
      .mockResolvedValueOnce(page(["a", "b"], null, 2));
    expect(await fetchViewIds("org:team OR author:@me", execute)).toEqual([
      "a",
      "b",
    ]);
    expect(execute.mock.calls[0]?.[0]).toContain(
      "search=is:pr AND (org:team OR author:@me)",
    );
    expect(execute.mock.calls[1]?.[0]).toContain("cursor=page2");
  });

  it("rejects truncated results, repeated cursors and API errors rather than treating them as new baselines", async () => {
    await expect(
      fetchViewIds("is:pr", vi.fn().mockResolvedValue(page(["a"], null, 1001))),
    ).rejects.toThrow("1,000");
    await expect(
      fetchViewIds("is:pr", vi.fn().mockResolvedValue(page(["a"], "same"))),
    ).rejects.toThrow("incomplete");
    await expect(
      fetchViewIds(
        "is:pr",
        vi
          .fn()
          .mockResolvedValue({
            data: null,
            errors: [{ message: "Rate limited" }],
          }),
      ),
    ).rejects.toThrow("Rate limited");
  });
});
