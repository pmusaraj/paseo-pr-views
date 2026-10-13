import { beforeEach, expect, it, vi } from "vitest";
import { approveHandler } from "./review";
import { ghMutation } from "../github/graphql";
import { fetchItemDetails } from "./details";
import type { ItemDetails } from "../../shared/board";

const caches = vi.hoisted(() => ({ set: vi.fn(), clear: vi.fn() }));

vi.mock("../github/graphql", () => ({ ghMutation: vi.fn() }));
vi.mock("./details", () => ({ detailsCache: { set: caches.set }, fetchItemDetails: vi.fn() }));
vi.mock("../search/cache", () => ({ searchCache: { clear: caches.clear } }));
vi.mock("../board/cache", () => ({ dropCachedItem: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it("submits an approval without a comment and returns refreshed review state", async () => {
  const details: ItemDetails = {
    state: "open", body: "", createdAt: "now", assignees: [], branches: { head: "feature", base: "main" },
    review: { viewerHasApproved: true, viewerDidAuthor: false, viewerCanApprove: true, viewerCanMerge: false, mergeable: "unknown", mergeMethods: [] },
  };
  vi.mocked(fetchItemDetails).mockResolvedValue(details);
  expect(await approveHandler({ id: "PR_1", body: "" })).toBe(details);
  expect(ghMutation).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("event: APPROVE"), { id: "PR_1", body: "" });
  expect(caches.clear).toHaveBeenCalledOnce();
  expect(caches.set).toHaveBeenCalledWith("PR_1", details);
});

it("reports rejected approvals without updating caches", async () => {
  vi.mocked(ghMutation).mockRejectedValue(new Error("Cannot approve your own PR"));
  await expect(approveHandler({ id: "PR_1", body: "" })).rejects.toThrow("Cannot approve your own PR");
  expect(caches.clear).not.toHaveBeenCalled();
  expect(fetchItemDetails).not.toHaveBeenCalled();
});
