import { expect, it, vi } from "vitest";
import { fetchItemDetails } from "./details";

const response = (states: string[], more: boolean, offset = 0) =>
  JSON.stringify({
    data: {
      node: {
        state: "OPEN",
        headRefName: "feature",
        baseRefName: "main",
        latestOpinionatedReviews: {
          nodes: states.map((state, i) => ({ state, author: { login: `reviewer${i + offset}` } })),
          pageInfo: { hasNextPage: more, endCursor: more ? "next" : null },
        },
      },
    },
  });

it("loads all pages of current reviewers and excludes dismissed approvals", async () => {
  const execute = vi
    .fn()
    .mockResolvedValueOnce(response(["DISMISSED", "APPROVED"], true))
    .mockResolvedValueOnce(response(["APPROVED"], false, 2));
  const details = await fetchItemDetails("pr-id", execute);
  expect(details.approvedBy).toEqual(["reviewer1", "reviewer2"]);
  expect(execute.mock.calls[1]?.[0]).toContain("cursor=next");
});

it("does not interpret issue or discussion metadata as PR reviews", async () => {
  const execute = vi.fn().mockResolvedValue(JSON.stringify({ data: { node: { state: "OPEN" } } }));
  expect((await fetchItemDetails("issue-id", execute)).review).toBeNull();
  expect(execute).toHaveBeenCalledTimes(1);
});
