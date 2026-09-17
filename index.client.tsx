import {
  createBackgroundClient,
  type BackgroundClient,
} from "./client/search/background-client";
import type {
  PluginClientContext,
  PluginSurfaceProps,
} from "@getpaseo/plugin/client";
import { SavedViews } from "./client/search/saved-views";
import { useStyles } from "./client/theme/use-styles";
import { BoardTimelineCard } from "./client/timeline";
import { BoardTimelineItemSchema } from "./shared/board";
import {
  BOARD_ITEM_TIMELINE_KIND,
  BOARD_ITEM_TIMELINE_VERSION,
} from "./shared/timeline";

function PullRequestViews(
  props: PluginSurfaceProps & { background: BackgroundClient },
) {
  const styles = useStyles(props);
  return (
    <SavedViews props={props} styles={styles} background={props.background} />
  );
}

export default function contribute(client: PluginClientContext) {
  const background = createBackgroundClient(client);
  client.addSurface("views", (props) => (
    <PullRequestViews {...props} background={background} />
  ));
  let marked = false;
  const sidebar = (unread: boolean) =>
    client.addSidebarItem({
      id: "views",
      title: unread ? "GitHub PRs 🟢" : "GitHub PRs",
      icon: "GitPullRequest",
      surface: "views",
    });
  let removeSidebar = sidebar(false);
  const unsubscribe = background.subscribe(() => {
    const unread = Object.values(background.getSnapshot()).some(
      (status) => status.unread,
    );
    if (unread === marked) return;
    marked = unread;
    void removeSidebar();
    removeSidebar = sidebar(unread);
  });
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
    background.dispose();
    void removeSidebar();
  };
}
