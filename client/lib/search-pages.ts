import type { SearchPage } from "../../shared/saved-views";

export const SEARCH_KEY = "saved-pr-search";

export function mergeSearchPages(pages: readonly SearchPage[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) =>
    page.items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  );
}
