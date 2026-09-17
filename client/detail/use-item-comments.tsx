import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";

import type { ItemComment } from "../../shared/board";
import { loadComments } from "../../shared/board";

/** What `useItemComments` exposes to the panel. */
export interface UseItemCommentsResult {
  /** Null until the load button is pressed; see the hook's own doc comment. */
  requested: boolean;
  comments: { comments: ItemComment[]; truncated: boolean } | null;
  commentsBusy: boolean;
  commentsError: string | null;
  /** Requests the comments for the first time. */
  request: () => void;
  /** Re-requests already-loaded comments, bypassing the server's own cache; a no-op before the first request. */
  refresh: () => void;
}

/**
 * The panel's comments, loaded lazily: most panels open for the description,
 * so the request waits for the "Load comments" button rather than riding
 * along with the item itself. Refresh only re-requests them if they have
 * already been asked for once.
 */
export function useItemComments(itemId: string): UseItemCommentsResult {
  /**
   * Null until the button at the bottom is pressed: comments are the long
   * tail of an item, and most panels are opened for the description. Refresh
   * re-requests them with `force` only once they have been asked for.
   */
  const [commentsRequest, setCommentsRequest] = useState<{ force: boolean } | null>(null);
  const [comments, setComments] = useState<{
    comments: ItemComment[];
    truncated: boolean;
  } | null>(null);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const listComments = useRpc(loadComments);

  useEffect(() => {
    if (commentsRequest === null) return;
    let live = true;
    setCommentsBusy(true);
    setCommentsError(null);
    listComments({ id: itemId, force: commentsRequest.force })
      .then((result) => {
        if (live) setComments(result);
      })
      .catch((cause: unknown) => {
        if (live) setCommentsError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (live) setCommentsBusy(false);
      });
    return () => {
      live = false;
    };
  }, [commentsRequest, itemId, listComments]);

  const request = useCallback(() => setCommentsRequest({ force: false }), []);
  const refresh = useCallback(
    () => setCommentsRequest((current) => (current === null ? null : { force: true })),
    [],
  );

  return {
    requested: commentsRequest !== null,
    comments,
    commentsBusy,
    commentsError,
    request,
    refresh,
  };
}
