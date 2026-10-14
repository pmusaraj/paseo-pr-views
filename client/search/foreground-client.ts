import type { QueryClient } from "@tanstack/react-query";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { listSavedViews, searchPullRequests, type SavedView } from "../../shared/saved-views";
import { mergeSearchPages } from "../lib/search-pages";
import type { BackgroundClient } from "./background-client";
import { searchRequest } from "./search-cache";
import type { LoadPage } from "./search-snapshot";

// Each contribution owns its own QueryClient and is already bound to one host.
export const SEARCH_SCOPE = "plugin-host";

export function createForegroundClient(
  client: Pick<PluginClientContext, "rpc">,
  queryClient: QueryClient,
  background: BackgroundClient,
) {
  let views: readonly SavedView[] = [];
  let version = 0;
  let disposed = false;
  const checking = new Set<string>();
  const attempted = new Map<string, string>();
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
    if (disposed) return;
    try {
      const revision = version;
      const nextViews = await client.rpc(listSavedViews, {});
      if (disposed) return;
      if (version === revision) setViews(nextViews);
      const status = background.getSnapshot();
      await Promise.all(views.filter((view) => view.backgroundCheck).map(async (view) => {
        const check = status[view.id];
        if (!check?.checkedAt || check.query !== view.query || check.error) return;
        const token = JSON.stringify([view.query, check.checkedAt]);
        if (checking.has(view.id) || attempted.get(view.id) === token) return;
        checking.add(view.id);
        attempted.set(view.id, token);
        try {
          const request = requestFor(view);
          await queryClient.fetchQuery({ ...request.options, staleTime: 0 });
        } catch (error) {
          if (!disposed) console.warn("[pr-views] background view refresh failed", error);
        } finally {
          checking.delete(view.id);
        }
      }));
    } catch (error) {
      if (!disposed) console.warn("[pr-views] could not load background views", error);
    }
  };
  // The daemon owns the cadence; its successful checks drive cached result updates.
  queryClient.mount();
  const stop = background.subscribe(() => { void refresh(); });
  void refresh();
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
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      listeners.clear();
      queryClient.clear();
      queryClient.unmount();
    },
  };
}
export type ForegroundClient = ReturnType<typeof createForegroundClient>;
