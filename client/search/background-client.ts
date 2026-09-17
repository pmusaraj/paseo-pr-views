import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
  acknowledgeView,
  backgroundStatus,
  type BackgroundStatus,
} from "../../shared/background";

export function createBackgroundClient(client: PluginClientContext) {
  let snapshot: BackgroundStatus = {};
  const listeners = new Set<() => void>();
  let disposed = false;
  let polling = false;
  let acknowledging = 0;
  let generation = 0;
  const publish = (next: BackgroundStatus) => {
    if (disposed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const poll = async () => {
    if (disposed || polling || acknowledging) return;
    polling = true;
    const version = generation;
    try {
      const result = await client.rpc(backgroundStatus, {});
      if (version === generation) publish(result);
    } catch (error) {
      console.warn("[pr-views] could not read background status", error);
    } finally {
      polling = false;
    }
  };
  const timer = setInterval(() => void poll(), 15_000);
  void poll();
  return {
    getSnapshot: () => snapshot,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async acknowledge(id: string, query: string, revision: string) {
      generation++;
      acknowledging++;
      try {
        publish(await client.rpc(acknowledgeView, { id, query, revision }));
      } finally {
        acknowledging--;
      }
    },
    refresh: poll,
    dispose() {
      disposed = true;
      clearInterval(timer);
      listeners.clear();
    },
  };
}
export type BackgroundClient = ReturnType<typeof createBackgroundClient>;
