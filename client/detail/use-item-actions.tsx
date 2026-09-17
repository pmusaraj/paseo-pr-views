import { useQueryClient } from "@tanstack/react-query";
import { SEARCH_KEY } from "../lib/search-pages";
import { useCallback, useState } from "react";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useRpc } from "@getpaseo/plugin/client";

import type { BoardItem, ItemDetails, MergeMethod } from "../../shared/board";
import { approvePullRequest, mergePullRequest } from "../../shared/board";

/** What `useItemActions` exposes to the panel. */
export interface UseItemActionsResult {
  /** One write at a time, and both buttons off while it is in flight. */
  acting: boolean;
  mergeOpen: boolean;
  setMergeOpen: (next: boolean) => void;
  runApprove: () => void;
  runMerge: (method: MergeMethod) => void;
}

/**
 * The two write actions a pull request's details support: approving it, and
 * merging it once a method is chosen from the confirmation dialog. Both
 * repaint from what GitHub answers after the mutation, via `onDetailsChanged`,
 * rather than from the state this client assumed going in.
 */
export function useItemActions({
  item,
  onDetailsChanged,
  onMerged,
}: {
  item: BoardItem;
  onDetailsChanged: (next: ItemDetails) => void;
  onMerged: (itemId: string) => void;
}): UseItemActionsResult {
  const queryClient = useQueryClient();
  const approve = useRpc(approvePullRequest);
  const merge = useRpc(mergePullRequest);
  const toast = useToast();
  const [acting, setActing] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const runApprove = useCallback(() => {
    setActing(true);
    approve({ id: item.id, body: "" })
      .then((next) => {
        void queryClient.resetQueries({ queryKey: [SEARCH_KEY] });
        onDetailsChanged(next);
        toast.show(`Approved ${item.repository} #${item.number}.`, { variant: "success" });
      })
      .catch((cause: unknown) => {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setActing(false));
  }, [approve, item.id, item.number, item.repository, onDetailsChanged, toast, queryClient]);

  const runMerge = useCallback(
    (method: MergeMethod) => {
      setActing(true);
      merge({ id: item.id, method })
        .then((next) => {
          void queryClient.resetQueries({ queryKey: [SEARCH_KEY] });
          onDetailsChanged(next);
          setMergeOpen(false);
          onMerged(item.id);
          toast.show(`Merged ${item.repository} #${item.number}.`, { variant: "success" });
        })
        .catch((cause: unknown) => {
          toast.error(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => setActing(false));
    },
    [item.id, item.number, item.repository, merge, onDetailsChanged, onMerged, toast, queryClient],
  );

  return { acting, mergeOpen, setMergeOpen, runApprove, runMerge };
}
