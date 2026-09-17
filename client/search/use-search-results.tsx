import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { searchPullRequests } from "../../shared/saved-views";
import { mergeSearchPages, SEARCH_KEY } from "../lib/search-pages";

export function useSearchResults(query: string | null, hostId: string) {
  const load = useRpc(searchPullRequests);
  const client = useQueryClient();
  const force = useRef(false);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const timer = setInterval(() => setDay(new Date().toISOString().slice(0, 10)), 30_000);
    return () => clearInterval(timer);
  }, []);
  const result = useInfiniteQuery({
    queryKey: [SEARCH_KEY, hostId, query, day],
    enabled: query !== null,
    staleTime: 5 * 60_000,
    initialPageParam: undefined as { cursor: string; effectiveDate: string } | undefined,
    queryFn: ({ pageParam }) => {
      const bypass = force.current;
      force.current = false;
      return load({ query: query ?? "", ...pageParam, force: bypass });
    },
    getNextPageParam: (last, pages) => {
      const count = pages.reduce((sum, page) => sum + page.items.length, 0);
      return last.hasNextPage && last.endCursor !== null && count < 1000
        ? { cursor: last.endCursor, effectiveDate: last.effectiveDate }
        : undefined;
    },
  });
  const items = useMemo(() => mergeSearchPages(result.data?.pages ?? []), [result.data]);
  const refresh = useCallback(
    async function refresh() {
      force.current = true;
      await client.resetQueries({ queryKey: [SEARCH_KEY, hostId, query, day], exact: true });
    },
    [client, hostId, query, day],
  );
  return { ...result, items, page: result.data?.pages[0] ?? null, refresh };
}
