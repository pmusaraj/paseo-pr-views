import { describe, expect, it } from "vitest";
import type { BoardItem } from "../../shared/board";
import { compareBySortDate, SORT_ORDERS, type BoardRow } from "./sort";

function makeItem(overrides: Partial<BoardItem>): BoardItem {
  return {
    id: "node-1",
    number: 1,
    title: "An item",
    url: "https://github.com/owner/repo/pull/1",
    repository: "owner/repo",
    updatedAt: "2024-01-01T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
    lastCommitAt: null,
    commentsCount: 0,
    labels: [],
    author: null,
    detail: null,
    owner: "owner",
    relations: ["author"],
    linkedIssues: [],
    checks: null,
    ...overrides,
  };
}

function makeRow(overrides: Partial<BoardItem>): BoardRow {
  return { item: makeItem(overrides), type: "open-prs" };
}

const commitOrder = SORT_ORDERS.find((order) => order.id === "commit");
if (commitOrder === undefined) throw new Error("expected a 'commit' sort order to exist");

describe("compareBySortDate", () => {
  it("ranks the more recent date first, descending", () => {
    const newer = makeRow({ updatedAt: "2024-06-01T00:00:00Z" });
    const older = makeRow({ updatedAt: "2024-01-01T00:00:00Z" });
    const updatedOrder = SORT_ORDERS.find((order) => order.id === "updated");
    if (updatedOrder === undefined) throw new Error("expected an 'updated' sort order");
    expect(compareBySortDate(updatedOrder, newer, older)).toBeLessThan(0);
    expect(compareBySortDate(updatedOrder, older, newer)).toBeGreaterThan(0);
  });

  it("sorts a row with no commit date last regardless of comparison side", () => {
    const withCommit = makeRow({ lastCommitAt: "2024-01-01T00:00:00Z" });
    const withoutCommit = makeRow({ lastCommitAt: null });
    expect(compareBySortDate(commitOrder, withoutCommit, withCommit)).toBeGreaterThan(0);
    expect(compareBySortDate(commitOrder, withCommit, withoutCommit)).toBeLessThan(0);
  });

  it("does not let a commitless pull request reach the top of the list", () => {
    const withCommit = makeRow({
      id: "with-commit",
      lastCommitAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });
    const withoutCommit = makeRow({
      id: "without-commit",
      lastCommitAt: null,
      updatedAt: "2024-06-01T00:00:00Z",
    });

    // Regardless of which order they start in, the commitless row must end
    // up last: a naive `left < right` comparison treats `null` as smaller
    // than any date string and would instead put it first.
    const sortedFromEnd = [withoutCommit, withCommit].sort((a, b) =>
      compareBySortDate(commitOrder, a, b),
    );
    const sortedFromStart = [withCommit, withoutCommit].sort((a, b) =>
      compareBySortDate(commitOrder, a, b),
    );
    expect(sortedFromEnd.map((row) => row.item.id)).toEqual(["with-commit", "without-commit"]);
    expect(sortedFromStart.map((row) => row.item.id)).toEqual(["with-commit", "without-commit"]);
  });

  it("treats two equally-missing dates as tied", () => {
    const a = makeRow({ lastCommitAt: null });
    const b = makeRow({ lastCommitAt: null });
    expect(compareBySortDate(commitOrder, a, b)).toBe(0);
  });
});
