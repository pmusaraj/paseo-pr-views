import type { z } from "zod";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { sendOptions, sendToChat } from "../../shared/board";
import {
  BOARD_ITEM_TIMELINE_KIND,
  BOARD_ITEM_TIMELINE_VERSION,
} from "../../shared/timeline";
import { findProject, repositoryIdFor } from "./project-index";
import type { PaseoApi, ProjectRecord } from "./project-index";

/** Workspace titles are capped at the same length the daemon caps agent titles. */
const MAX_TITLE_CHARS = 200;

/**
 * The project one card can be sent to, or a refusal that says what to do about
 * it. Both handlers below start here, so "no project" reads the same whether
 * the dialog is opening or the send is running.
 */
async function requireProject(
  paseo: PaseoApi,
  repository: string,
  url: string,
): Promise<ProjectRecord> {
  const repositoryId = repositoryIdFor(repository, url);
  if (repositoryId === null) {
    throw new Error(
      `${repository} has no repository URL to match a project against.`,
    );
  }

  const project = await findProject(paseo, repositoryId);
  if (project === undefined) {
    throw new Error(
      `No Paseo project has a git remote pointing at ${repository}. Add it as a project — or add it as a remote on the fork you already have — then send this card again.`,
    );
  }
  return project;
}

export async function sendOptionsHandler(
  { repository, url }: z.output<typeof sendOptions.input>,
  { paseo }: PluginHandlerContext,
): Promise<z.input<typeof sendOptions.output>> {
  const project = await requireProject(paseo, repository, url);
  const supportsWorktree = project.kind === "git";
  return {
    project: {
      id: project.projectId,
      name: project.displayName,
      rootPath: project.rootPath,
      supportsWorktree,
    },
    defaults: {
      provider: null,
      model: null,
      modeId: null,
      thinkingOptionId: null,
      isolation: "local",
    },
  };
}

export async function sendToChatHandler(
  {
    repository,
    number,
    title,
    url,
    author,
    labels,
    prompt,
    isolation,
    provider,
    model,
    modeId,
    thinkingOptionId,
  }: z.output<typeof sendToChat.input>,
  { paseo }: PluginHandlerContext,
): Promise<z.input<typeof sendToChat.output>> {
  const project = await requireProject(paseo, repository, url);
  if (isolation === "worktree" && project.kind !== "git") {
    throw new Error(
      `${project.displayName} is not a git checkout, so it cannot be worktreed.`,
    );
  }

  const trimmed = title.trim();
  /**
   * `firstAgentContext` is passed here and *only* here, because this handler
   * really does create the agent it promises. The daemon reads it two ways: as
   * naming context for the workspace and its branch, and as `expectsInitialAgent`,
   * which flips the new workspace to an optimistic `running`. A caller that
   * passes it and then creates nothing leaves a workspace spinning until it
   * settles on `done`.
   */
  const workspace = await paseo.workspaces.create({
    title: (trimmed === "" ? `${repository} #${number}` : trimmed).slice(
      0,
      MAX_TITLE_CHARS,
    ),
    firstAgentContext: { prompt, attachments: [] },
    source:
      isolation === "worktree"
        ? {
            // No `worktreeSlug`: the daemon mints a mnemonic one, and then
            // renames the branch after the prompt once the agent is running.
            kind: "worktree",
            cwd: project.rootPath,
            projectId: project.projectId,
          }
        : {
            kind: "directory",
            path: project.rootPath,
            projectId: project.projectId,
          },
  });

  /**
   * The agent is created *in* the workspace, so the SDK places it on the
   * workspace's own directory — the worktree's path, not the project root, when
   * one was cut. `prompt` rides along as the first message rather than being
   * sent afterwards, so there is no window where the workspace exists with a
   * silent agent in it.
   */
  const agent = await workspace.agents
    .create({
      config: {
        // `provider/model`, which is the only spelling the SDK accepts.
        provider: `${provider}/${model}`,
        ...(modeId === null ? {} : { modeId }),
        ...(thinkingOptionId === null ? {} : { thinkingOptionId }),
      },
      prompt,
    })
    .catch((cause: unknown) => {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `Workspace “${workspace.name ?? project.displayName}” was created, but the agent could not be started: ${detail}`,
      );
    });

  /**
   * The card the agent is working on, as a persisted row in its own transcript.
   *
   * It lands *after* the opening prompt rather than above it, because the prompt
   * rides along with `agents.create` and there is no agent to append to until
   * that has resolved. That ordering is the price of not opening a window where
   * the workspace exists with a silent agent in it, which matters more.
   *
   * Deliberately not fatal. By this point the workspace and the agent both
   * exist and the prompt has been delivered — the send the user asked for has
   * happened. Failing it here would report an error for a launch that worked and
   * invite the user to send the card a second time, which would cut a second
   * worktree. A missing row costs the transcript its header and nothing else.
   */
  await agent.timeline
    .append({
      type: "plugin",
      id: `${BOARD_ITEM_TIMELINE_KIND}:${repository}#${number}`,
      kind: BOARD_ITEM_TIMELINE_KIND,
      version: BOARD_ITEM_TIMELINE_VERSION,
      data: { repository, number, title, url, author, labels },
    })
    .catch((cause: unknown) => {
      console.warn("[pr-views] could not append the timeline row", cause);
    });

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name ?? project.displayName,
    projectName: project.displayName,
    agentId: agent.id,
  };
}
