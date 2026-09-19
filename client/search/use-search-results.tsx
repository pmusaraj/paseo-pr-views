import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchPullRequests, type SavedView } from "../../shared/saved-views";
import { mergeSearchPages } from "../lib/search-pages";
import { observeAppVisibility, isAppFocused } from "../web";
import type { SearchSnapshots } from "./search-snapshot";
import type { BackgroundClient } from "./background-client";
import { nextSavedView, preloadSearch, searchRequest } from "./search-cache";

export function useSearchResults(
  query: string | null,
  hostId: string,
  viewId: string | null,
  background: BackgroundClient,
  views: readonly SavedView[],
) {
  const load = useRpc(searchPullRequests);
  const client = useQueryClient();
  const request = useMemo(
    () => searchRequest(client, hostId, viewId, query, load, background),
    [client, hostId, viewId, query, load, background],
  );
  const { snapshots, options } = request;
  const queryKey = options.queryKey;
  const state = useSyncExternalStore(snapshots.subscribe, snapshots.getSnapshot);
  const activeSnapshots = useRef<SearchSnapshots | null>(snapshots);
  useEffect(() => {
    activeSnapshots.current = snapshots;
    return () => { activeSnapshots.current = null; };
  }, [snapshots]);
  const visible = useSyncExternalStore(observeAppVisibility, isAppFocused);
  const result = useQuery({
    ...options,
    enabled: query !== null && visible,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });
  const nextView = nextSavedView(views, viewId);
  const nextId = nextView?.id;
  const nextQuery = nextView?.query;
  useEffect(() => {
    if (!visible || state.displayed === null || result.isFetching || !nextId || !nextQuery) return;
    void preloadSearch(client, searchRequest(client, hostId, nextId, nextQuery, load, background));
  }, [visible, state.displayed, result.isFetching, nextId, nextQuery, client, hostId, load, background]);
  const { refetch } = result;
  useEffect(() => {
    if (query === null) return;
    return observeAppVisibility(() => {
      if (isAppFocused()) void refetch({ cancelRefetch: false });
    });
  }, [queryKey, query, refetch]);
  const refresh = useCallback(async () => {
    const next = await refetch({ cancelRefetch: false });
    if (next.isSuccess && activeSnapshots.current === snapshots) snapshots.apply();
  }, [refetch, snapshots]);
  const data = state.displayed;
  const items = useMemo(() => mergeSearchPages(data?.pages ?? []), [data]);
  return {
    data,
    items,
    page: data?.pages[0] ?? null,
    error: result.error,
    isFetching: result.isFetching,
    isInitialLoading: data === null && result.isFetching,
    refresh,
    applyUpdates: snapshots.apply,
    updateCount: state.updateCount,
    seen: state.seen,
  };
}
