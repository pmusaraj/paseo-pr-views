import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { BoardItemSchema } from "./board";

export const SearchQuerySchema = z.string().trim().min(1).max(2000);
export const SavedViewSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  query: SearchQuerySchema,
  backgroundCheck: z.boolean().optional(),
});
export type SavedView = z.output<typeof SavedViewSchema>;

export const MINE_VIEW: SavedView = {
  id: "mine",
  name: "Mine",
  query: "is:pr author:@me state:open archived:false sort:updated-desc",
};

export const SavedViewsSchema = z
  .object({
    views: z.array(SavedViewSchema).max(50).default([MINE_VIEW]),
    selectedId: z.string().nullable().default("mine"),
  })
  .refine(
    (value) =>
      new Set(value.views.map((view) => view.id)).size === value.views.length,
    {
      message: "View IDs must be unique.",
    },
  );

export const savedViewsSettings = defineSettings({
  id: "saved-views",
  scope: "host",
  version: 1,
  schema: SavedViewsSchema,
});

export const SearchItemSchema = BoardItemSchema.extend({
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
});

export const SearchPageSchema = z.object({
  items: z.array(SearchItemSchema),
  login: z.string(),
  total: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
  resolvedQuery: z.string(),
  effectiveDate: z.string(),
  fetchedAt: z.string(),
  repositoryProjects: z.record(z.string(), z.string()),
});
export type SearchPage = z.output<typeof SearchPageSchema>;

export const searchPullRequests = defineRpc({
  name: "search.pull-requests",
  input: z.object({
    query: SearchQuerySchema,
    cursor: z.string().max(1000).optional(),
    effectiveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    force: z.boolean().default(false),
  }),
  output: SearchPageSchema,
});

export function selectedView(
  values: z.output<typeof SavedViewsSchema>,
): SavedView | null {
  return (
    values.views.find((view) => view.id === values.selectedId) ??
    values.views[0] ??
    null
  );
}
