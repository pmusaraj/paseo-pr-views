import { describe, expect, it } from "vitest";
import {
  MINE_VIEW,
  SavedViewsSchema,
  SavedViewSchema,
  selectedView,
  searchPullRequests,
} from "./saved-views";

describe("saved view settings", () => {
  const first = {
    id: "first",
    name: "Team reviews",
    query: "org:example review:required",
  };
  const second = { id: "second", name: "Mine", query: "author:@me" };

  it("starts with Mine and falls back when the selected view has been deleted", () => {
    expect(selectedView(SavedViewsSchema.parse({}))).toEqual(MINE_VIEW);
    expect(
      selectedView(SavedViewsSchema.parse({ views: [], selectedId: null })),
    ).toBeNull();
    expect(
      selectedView({ views: [first, second], selectedId: "second" }),
    ).toEqual(second);
    expect(selectedView({ views: [first], selectedId: "second" })).toEqual(
      first,
    );
  });

  it("keeps editable query syntax intact and validates names and limits", () => {
    expect(
      SavedViewSchema.parse({
        ...first,
        query: 'created:>@today-30d label:"needs review"',
      }).query,
    ).toBe('created:>@today-30d label:"needs review"');
    expect(SavedViewSchema.safeParse({ ...first, name: " " }).success).toBe(
      false,
    );
    expect(
      SavedViewSchema.safeParse({ ...first, query: "a".repeat(2001) }).success,
    ).toBe(false);
    expect(SavedViewsSchema.safeParse({ views: [first, first] }).success).toBe(
      false,
    );
    expect(
      SavedViewsSchema.safeParse({
        views: Array.from({ length: 51 }, (_, id) => ({
          ...first,
          id: String(id),
        })),
      }).success,
    ).toBe(false);
  });

  it("keeps existing views opted out and saves an explicit background-check choice", () => {
    expect(SavedViewSchema.parse(first).backgroundCheck).toBeUndefined();
    expect(
      SavedViewSchema.parse({ ...first, backgroundCheck: true })
        .backgroundCheck,
    ).toBe(true);
    expect(
      SavedViewSchema.safeParse({ ...first, backgroundCheck: "yes" }).success,
    ).toBe(false);
  });

  it("validates search input at the RPC boundary", () => {
    expect(searchPullRequests.input.safeParse({ query: "" }).success).toBe(
      false,
    );
    expect(
      searchPullRequests.input.safeParse({
        query: first.query,
        effectiveDate: "yesterday",
      }).success,
    ).toBe(false);
  });
});
