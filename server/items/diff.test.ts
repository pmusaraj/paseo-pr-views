import { beforeEach, expect, it, vi } from "vitest";
import { gh } from "../github/gh";
import { loadPullRequestDiffHandler } from "./diff";
import { loadPullRequestDiff } from "../../shared/pr-diff";
vi.mock("../github/gh", () => ({ gh: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
const file = { filename: "a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+new" };

it("loads patches, renames, and files without text patches", async () => {
  const files = [file, { ...file, filename: "renamed.ts", previous_filename: "old.ts" }, { ...file, filename: "image.png", patch: undefined }];
  vi.mocked(gh).mockResolvedValue(JSON.stringify(files));
  expect(await loadPullRequestDiffHandler({ repository: "team/repo", number: 12 })).toEqual({ files, truncated: false });
  expect(gh).toHaveBeenCalledWith(["api", "repos/team/repo/pulls/12/files?per_page=100"]);
});
it("bounds patches and flags a full page", async () => {
  vi.mocked(gh).mockResolvedValue(JSON.stringify(Array.from({ length: 100 }, () => ({ ...file, patch: "x".repeat(2000) }))));
  const result = await loadPullRequestDiffHandler({ repository: "team/repo", number: 12 });
  expect(result.truncated).toBe(true);
  expect(result.files.reduce((sum, entry) => sum + (entry.patch?.length ?? 0), 0)).toBe(100_000);
});
it("rejects invalid repository paths and PR numbers", () => {
  expect(loadPullRequestDiff.input.safeParse({ repository: "../repo/extra", number: 1 }).success).toBe(false);
  expect(loadPullRequestDiff.input.safeParse({ repository: "team/repo", number: 0 }).success).toBe(false);
});
