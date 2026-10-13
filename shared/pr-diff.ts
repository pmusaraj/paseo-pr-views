import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const DiffFileSchema = z.object({
  filename: z.string(),
  previous_filename: z.string().optional(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().optional(),
});
export type DiffFile = z.output<typeof DiffFileSchema>;

export const loadPullRequestDiff = defineRpc({
  name: "board.diff",
  input: z.object({
    repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    number: z.number().int().positive(),
  }),
  output: z.object({ files: z.array(DiffFileSchema), truncated: z.boolean() }),
});
