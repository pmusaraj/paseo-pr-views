import {
  createBackgroundClient,
  type BackgroundClient,
} from "./client/search/background-client";
import type {
  PluginClientContext,
  PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createForegroundClient, type ForegroundClient } from "./client/search/foreground-client";
import { isAppFocused, observeAppVisibility } from "./client/web";
import { SavedViews } from "./client/search/saved-views";
import { useStyles } from "./client/theme/use-styles";
import { BoardTimelineCard } from "./client/timeline";
import { BoardTimelineItemSchema } from "./shared/board";
import {
  BOARD_ITEM_TIMELINE_KIND,
  BOARD_ITEM_TIMELINE_VERSION,
} from "./shared/timeline";

function PullRequestViews(
  props: PluginSurfaceProps & { background: BackgroundClient; foreground: ForegroundClient },
) {
  const styles = useStyles(props);
  return (
    <SavedViews props={props} styles={styles} background={props.background} foreground={props.foreground} />
  );
}

export default function contribute(client: PluginClientContext) {
  const background = createBackgroundClient(client);
  const foreground = createForegroundClient(client, new QueryClient(), background, {
    isFocused: isAppFocused,
    subscribe: observeAppVisibility,
  });
  client.addSurface("views", (props) => (
    <QueryClientProvider client={foreground.queryClient}>
      <PullRequestViews {...props} background={background} foreground={foreground} />
    </QueryClientProvider>
  ));
  let marked = false;
  const sidebar = (unread: boolean) =>
    client.addSidebarItem({
      id: "views",
      title: "GitHub PRs",
      icon: unread ? "BellDot" : "GitPullRequest",
      surface: "views",
    });
  let removeSidebar = sidebar(false);
  const updateSidebar = () => {
    const unread = foreground.getSnapshot().newViewIds.length > 0 || Object.values(background.getSnapshot()).some(
      (status) => status.unread,
    );
    if (unread === marked) return;
    marked = unread;
    void removeSidebar();
    removeSidebar = sidebar(unread);
  };
  const unsubscribe = background.subscribe(updateSidebar);
  const unsubscribeForeground = foreground.subscribe(updateSidebar);
  client.addCommandCenterItem({
    id: "open-views",
    title: "Open GitHub PR views",
    icon: "GitPullRequest",
    keywords: ["github", "pull requests", "views"],
    context: "global",
    onSelect(context) {
      context.openSurface("views");
    },
  });
  client.addTimelineRenderer({
    kind: BOARD_ITEM_TIMELINE_KIND,
    version: BOARD_ITEM_TIMELINE_VERSION,
    schema: BoardTimelineItemSchema,
    Component: BoardTimelineCard,
  });
  return () => {
    unsubscribe();
    unsubscribeForeground();
    foreground.dispose();
    background.dispose();
    void removeSidebar();
  };
}
