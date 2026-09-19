import { backgroundStatus, acknowledgeView } from "./shared/background";
import { ViewMonitor, CHECK_INTERVAL_MS } from "./server/background/monitor";
import {
  readViews,
  readChecks,
  writeChecks,
} from "./server/background/storage";
import { fetchViewIds } from "./server/background/search";
import { resolveViewerLogin } from "./server/github/gh";
import { listSavedViews, savedViewsSettings, searchPullRequests } from "./shared/saved-views";
import { searchPullRequestsHandler } from "./server/search/handler";
import type { PluginServerContext } from "@getpaseo/plugin/server";

import { listLabelsHandler, toggleLabelHandler } from "./server/items/labels";
import { loadCommentsHandler } from "./server/items/comments";
import { approveHandler, mergeHandler } from "./server/items/review";
import { loadItemHandler } from "./server/items/details";
import { loadImageHandler } from "./server/images/images";
import { sendOptionsHandler, sendToChatHandler } from "./server/launch/handler";
import {
  approvePullRequest,
  listLabels,
  loadComments,
  loadImage,
  loadItem,
  mergePullRequest,
  sendOptions,
  sendToChat,
  toggleLabel,
} from "./shared/board";
import { displaySettings, promptSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const monitor = new ViewMonitor({
    views: readViews,
    read: readChecks,
    write: writeChecks,
    fetch: fetchViewIds,
    login: resolveViewerLogin,
    now: Date.now,
  });
  const check = () => {
    void monitor
      .check()
      .catch((error) =>
        console.warn("[pr-views] background check failed", error),
      );
  };
  const timer = setInterval(check, CHECK_INTERVAL_MS);
  check();
  server.handle(backgroundStatus, async () => {
    check();
    return monitor.status();
  });
  server.handle(acknowledgeView, (input) => monitor.acknowledge(input));
  server.handle(searchPullRequests, searchPullRequestsHandler);
  server.handle(listSavedViews, readViews);
  server.registerSettings(savedViewsSettings);
  server.handle(loadItem, loadItemHandler);
  server.handle(loadComments, loadCommentsHandler);
  server.handle(loadImage, loadImageHandler);
  server.handle(sendOptions, sendOptionsHandler);
  server.handle(sendToChat, sendToChatHandler);
  server.handle(listLabels, listLabelsHandler);
  server.handle(toggleLabel, toggleLabelHandler);
  server.handle(approvePullRequest, approveHandler);
  server.handle(mergePullRequest, mergeHandler);

  // Storage lives on the host; registering the definitions is what makes the
  // client's `useSettings` reads and writes valid for this installation.
  server.registerSettings(displaySettings);
  server.registerSettings(promptSettings);

  return () => {
    clearInterval(timer);
    monitor.stop();
  };
}
