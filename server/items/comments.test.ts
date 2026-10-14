import { beforeEach, expect, it, vi } from "vitest";
import { gh } from "../github/gh";
import { loadCommentsHandler } from "./comments";
import { loadComments } from "../../shared/board";

vi.mock("../github/gh", () => ({ gh: vi.fn() }));
vi.mock("../cache/cache", () => ({
  Cache: class {
    get(_key: string, _ttl: number, load: () => Promise<unknown>) { return load(); }
  },
}));
beforeEach(() => vi.resetAllMocks());

const comment = (id: string, day = 1) => ({
  id, body: `Body ${id}`, createdAt: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z`, author: { login: "reviewer" },
});
const connection = (nodes: unknown[], totalCount = nodes.length) => ({ nodes, totalCount });
async function load(node: unknown) {
  vi.mocked(gh).mockResolvedValue(JSON.stringify({ data: { node } }));
  return loadCommentsHandler({ id: "PR_1", force: true });
}

it("loads conversation, review summaries and inline threads while keeping replies together", async () => {
  const result = await load({
    comments: connection([comment("conversation", 3)]),
    reviews: connection([
      { ...comment("summary", 2), state: "CHANGES_REQUESTED" },
      { ...comment("approval"), body: "  ", state: "APPROVED" },
      { ...comment("draft"), state: "PENDING" },
    ]),
    reviewThreads: connection([
      { comments: connection([
        { ...comment("inline"), path: "src/app.ts", line: 12 },
        { ...comment("reply", 4), path: "src/app.ts", line: 12 },
      ]) },
      { comments: connection([{ ...comment("outdated", 5), path: "old.ts", line: null, originalLine: 9 }]) },
    ]),
  });
  expect(result.comments.map(({ id, depth }) => [id, depth])).toEqual([
    ["inline", 0], ["reply", 1], ["summary", 0], ["conversation", 0], ["outdated", 0],
  ]);
  expect(result.comments[0]?.location).toBe("src/app.ts:12");
  expect(result.comments[4]?.location).toBe("old.ts:9 (outdated)");
  expect(result.truncated).toBe(false);
  expect(loadComments.output.safeParse(result).success).toBe(true);
  expect(vi.mocked(gh).mock.calls[0]?.[0].join(" ")).toContain("reviewThreads(first: $first)");
});

it.each([
  { comments: connection([], 51) },
  { reviews: connection([], 51) },
  { reviewThreads: connection([], 51) },
  { reviewThreads: connection([{ comments: connection([comment("inline")], 21) }]) },
  { comments: connection([{ ...comment("discussion"), replies: connection([], 21) }]) },
])("flags omitted comments in every connection: %j", async (node) => {
  expect((await load(node)).truncated).toBe(true);
});

it("preserves issue comments and discussion replies, including deleted authors", async () => {
  const result = await load({ comments: connection([
    { ...comment("parent"), author: null, replies: connection([comment("reply")]) },
    null,
  ]) });
  expect(result.comments.map(({ id, author, depth }) => ({ id, author, depth }))).toEqual([
    { id: "parent", author: null, depth: 0 },
    { id: "reply", author: "reviewer", depth: 1 },
  ]);
  expect(result.truncated).toBe(false);
});

it("reports inaccessible items", async () => {
  await expect(load(null)).rejects.toThrow("GitHub no longer has this item");
});
