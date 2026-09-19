import type { QueryClient } from "@tanstack/react-query";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { listSavedViews, searchPullRequests, type SavedView } from "../../shared/saved-views";
import { mergeSearchPages } from "../lib/search-pages";
import type { BackgroundClient } from "./background-client";
import { searchRequest } from "./search-cache";
import { scheduleForegroundRefresh } from "./foreground-refresh";
import type { LoadPage } from "./search-snapshot";

// Each contribution owns its own QueryClient and is already bound to one host.
export const SEARCH_SCOPE = "plugin-host";

export function createForegroundClient(
  client: Pick<PluginClientContext, "rpc">,
  queryClient: QueryClient,
  background: BackgroundClient,
  focus: {
    isFocused: () => boolean;
    subscribe: (listener: () => void) => () => void;
  },
) {
  let views: readonly SavedView[] = [];
  let version = 0;
  let disposed = false;
  let checking = false;
  let activeKey: readonly unknown[] | null = null;
  let snapshot = { newViewIds: [] as string[] };
  const listeners = new Set<() => void>();
  const subscriptions = new Map<string, () => void>();
  const load: LoadPage = (input) =>
    client.rpc(searchPullRequests, input);
  const requestFor = (view: SavedView) => searchRequest(queryClient, SEARCH_SCOPE, view.id, view.query, load, background);
  const publish = () => {
    if (disposed) return;
    const newViewIds = views.filter((view) => {
      const { displayed, pending } = requestFor(view).snapshots.getSnapshot();
      if (!displayed || !pending) return false;
      const known = new Set(mergeSearchPages(displayed.pages).map((item) => item.id));
      return mergeSearchPages(pending.pages).some((item) => !known.has(item.id));
    }).map((view) => view.id);
    if (JSON.stringify(newViewIds) === JSON.stringify(snapshot.newViewIds)) return;
    snapshot = { newViewIds };
    for (const listener of listeners) listener();
  };
  const setViews = (next: readonly SavedView[]) => {
    if (disposed || JSON.stringify(next) === JSON.stringify(views)) return;
    views = next;
    version++;
    const keys = new Set(views.map((view) => JSON.stringify([view.id, view.query])));
    for (const [key, unsubscribe] of subscriptions) {
      if (!keys.has(key)) {
        unsubscribe();
        subscriptions.delete(key);
      }
    }
    for (const view of views) {
      const key = JSON.stringify([view.id, view.query]);
      if (!subscriptions.has(key)) subscriptions.set(key, requestFor(view).snapshots.subscribe(publish));
    }
    publish();
  };
  const refresh = async () => {
    if (disposed || checking || !focus.isFocused()) return;
    checking = true;
    try {
      const revision = version;
      const nextViews = await client.rpc(listSavedViews, {});
      if (disposed) return;
      if (version === revision) setViews(nextViews);
      for (const view of views.slice(0, 5)) {
        if (disposed || !focus.isFocused()) break;
        if (!views.slice(0, 5).some((entry) => entry.id === view.id && entry.query === view.query)) continue;
        try {
          // Share in-flight work and very recent focus checks with the visible surface.
          const request = requestFor(view);
          activeKey = request.options.queryKey;
          await queryClient.fetchQuery({ ...request.options, staleTime: 30_000 });
        } catch (error) {
          if (!disposed && focus.isFocused()) console.warn("[pr-views] foreground view refresh failed", error);
        } finally {
          activeKey = null;
        }
      }
    } catch (error) {
      if (!disposed) console.warn("[pr-views] could not load views for foreground refresh", error);
    } finally {
      checking = false;
    }
  };
  // Keep QueryClient's connectivity subscriptions alive with the PR surface closed.
  queryClient.mount();
  const stop = scheduleForegroundRefresh({ ...focus, refresh: () => { void refresh(); } });
  const stopFocus = focus.subscribe(() => {
    if (!focus.isFocused() && activeKey)
      void queryClient.cancelQueries({ queryKey: activeKey, exact: true });
  });
  return {
    queryClient,
    setViews,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      stopFocus();
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      listeners.clear();
      queryClient.clear();
      queryClient.unmount();
    },
  };
}
export type ForegroundClient = ReturnType<typeof createForegroundClient>;
