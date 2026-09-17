import { describe, expect, it } from "vitest";
import { resolveSearchQuery } from "./search-query";

describe("saved PR search queries", () => {
  it("scopes both OR branches to pull requests without changing their sort", () => {
    const query = "(org:alpha OR org:beta) (author:alice OR author:bob) sort:created-asc";
    expect(resolveSearchQuery(query, "2026-09-16")).toBe(`is:pr AND (${query})`);
  });

  it("resolves relative date comparisons and ranges using UTC calendar days", () => {
    expect(resolveSearchQuery("created:>@today-90d updated:@today-2d..@today", "2026-09-16")).toBe(
      "is:pr AND (created:>2026-06-18 updated:2026-09-14..2026-09-16)",
    );
    expect(resolveSearchQuery("closed:<=@today-1d", "2024-03-01")).toBe(
      "is:pr AND (closed:<=2024-02-29)",
    );
    expect(resolveSearchQuery("merged:@today-1d", "2026-01-01")).toBe(
      "is:pr AND (merged:2025-12-31)",
    );
  });

  it("leaves quoted examples, escaped quotes, and unrelated terms untouched", () => {
    const query = '"created:>@today-90d (example)" label:"say \\"hi\\"" @today';
    expect(resolveSearchQuery(query, "2026-09-16")).toBe(`is:pr AND (${query})`);
  });

  it.each([
    "created:@today-2w",
    "updated:@today+1d",
    "closed:@today-nope",
    "merged:@today-999999999d",
  ])("rejects unsupported relative date syntax %s", (query) => {
    expect(() => resolveSearchQuery(query, "2026-09-16")).toThrow();
  });

  it.each(['"unclosed', "(org:alpha", "org:alpha)", ")(org:alpha"])(
    "rejects unbalanced search syntax %s",
    (query) => {
      expect(() => resolveSearchQuery(query, "2026-09-16")).toThrow();
    },
  );

  it("rejects impossible dates and moves the resolved query at UTC midnight", () => {
    expect(() => resolveSearchQuery("created:@today", "2026-02-30")).toThrow();
    expect(resolveSearchQuery("created:@today", "2026-09-16")).not.toBe(
      resolveSearchQuery("created:@today", "2026-09-17"),
    );
  });
});
