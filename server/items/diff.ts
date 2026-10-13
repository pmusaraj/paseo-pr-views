import { z } from "zod";
import { DiffFileSchema, type loadPullRequestDiff } from "../../shared/pr-diff";
import { gh } from "../github/gh";

/** Bound the panel's payload; large and binary diffs remain available on GitHub. */
export async function loadPullRequestDiffHandler({ repository, number }: z.output<typeof loadPullRequestDiff.input>) {
  const raw = await gh(["api", `repos/${repository}/pulls/${number}/files?per_page=100`]);
  const files = z.array(DiffFileSchema).parse(JSON.parse(raw));
  let remaining = 100_000;
  let truncated = files.length === 100;
  return {
    files: files.map((file) => {
      if (file.patch === undefined) return file;
      const patch = file.patch.slice(0, remaining);
      remaining -= patch.length;
      if (patch.length < file.patch.length) truncated = true;
      return { ...file, patch: patch || undefined };
    }),
    truncated,
  };
}
