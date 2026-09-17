import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { MAX_OUTPUT_BYTES } from "../github/gh";
import { Cache } from "../cache/cache";

const execFileAsync = promisify(execFile);

/**
 * The host API a handler is given. Every project lookup below needs it, so it
 * is threaded down from the handler rather than reached for globally.
 */
export type PaseoApi = PluginHandlerContext["paseo"];

/**
 * Paseo's own project registry, as the daemon reports it. Only the fields this
 * plugin matches on are named; the descriptor carries more.
 *
 * A project with a git remote is keyed `remote:<host>/<owner>/<name>`, always
 * lowercased, which is exactly the identity a board card carries — so a card is
 * matched to a project by that key rather than by guessing at directory names.
 * A project without a remote is keyed `host:<serverId>:<path>` and can never
 * match, which is correct: the board only ever shows remote repositories. The
 * key is optional on the wire, and a project missing one simply matches
 * nothing by key — its git remotes still get their turn.
 */
export interface ProjectRecord {
  projectId: string;
  rootPath: string;
  displayName: string;
  projectKey: string;
  /**
   * `git`, `non_git`, or `directory`, as the daemon records it. Paseo offers a
   * worktree for exactly the git ones (`workspace-structure.ts`), so this is
   * what decides whether the launch dialog can offer one.
   */
  kind: string;
}

/**
 * Every project Paseo knows about, asked of the daemon rather than read off
 * disk. `projects.list` is the daemon's own view: it covers projects that have
 * no workspace open, it drops archived ones for us, and its display name is the
 * one the user renamed the project to — none of which reading `projects.json`
 * gave us. Requested without a `sync` cursor, so the answer is always the whole
 * list rather than a diff against a cursor this plugin does not keep.
 */
async function readProjects(paseo: PaseoApi): Promise<ProjectRecord[]> {
  const { projects } = await paseo.projects.list();
  return projects.map((project) => ({
    projectId: project.projectId,
    rootPath: project.projectRootPath,
    displayName: project.projectDisplayName,
    projectKey: project.projectKey ?? "",
    kind: project.projectKind,
  }));
}

/**
 * A repository's identity as both a project key and a git remote spell it:
 * `<host>/<owner>/<name>`, lowercased. The host comes from the item's own URL
 * rather than a hardcoded `github.com`, so a GitHub Enterprise card matches the
 * enterprise project and not a same-named repository on github.com.
 */
export function repositoryIdFor(repository: string, url: string): string | null {
  if (!repository.includes("/")) return null;
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  if (host === "") return null;
  return `${host}/${repository}`.toLowerCase();
}

/**
 * Normalises any git remote URL to the same `<host>/<owner>/<name>` form,
 * covering the scp-like `git@host:owner/name.git` that `new URL` cannot parse
 * alongside the `https://` and `ssh://` spellings.
 */
function normalizeRemoteUrl(remote: string): string | null {
  const trimmed = remote.trim();
  if (trimmed === "") return null;

  let host: string;
  let path: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      host = parsed.host;
      path = parsed.pathname;
    } catch {
      return null;
    }
  } else {
    const scp = /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(trimmed);
    if (scp === null || scp[1] === undefined || scp[2] === undefined) return null;
    host = scp[1];
    path = scp[2];
  }

  const name = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  if (host === "" || name === "") return null;
  return `${host}/${name}`.toLowerCase();
}

/**
 * Every repository the checkout at `root` points at, not just `origin`. A fork
 * conventionally keeps the repository it was forked from as `upstream`, and a
 * card always names the repository the issue or pull request lives in — the
 * parent — so `origin` alone cannot match work done from a fork.
 *
 * A directory that is not a git checkout, or has gone missing, contributes
 * nothing rather than failing the search for every other project.
 */
async function gitRemotes(root: string): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("git", ["-C", root, "remote", "-v"], {
      maxBuffer: MAX_OUTPUT_BYTES,
    }));
  } catch {
    return [];
  }
  const seen = new Set<string>();
  for (const line of stdout.split("\n")) {
    const url = line.trim().split(/\s+/)[1];
    if (url === undefined) continue;
    const normalized = normalizeRemoteUrl(url);
    if (normalized !== null) seen.add(normalized);
  }
  return [...seen];
}

/**
 * Every live project, and every repository id that reaches one. Built once and
 * shared by the board (which labels each card's project) and by the send button
 * (which needs the project's directory), so the `git` subprocess per project is
 * paid once rather than per lookup.
 *
 * `byRepositoryId` is a plain object rather than a `Map`: this whole value is
 * persisted to disk by the generic cache, which round-trips through
 * `JSON.stringify`, and a `Map` would come back as `{}`.
 */
export interface ProjectIndex {
  projects: ProjectRecord[];
  /** `<host>/<owner>/<name>` to the project it belongs to. */
  byRepositoryId: Record<string, ProjectRecord>;
}

const PROJECT_INDEX_TTL_MS = 5 * 60_000;
const PROJECT_INDEX_KEY = "index";

const projectIndexCache = new Cache<ProjectIndex>("project-index");

async function buildProjectIndex(paseo: PaseoApi): Promise<ProjectIndex> {
  const projects = await readProjects(paseo);
  const byRepositoryId: Record<string, ProjectRecord> = {};

  // `projectKey` first, across all projects, because it is the repository Paseo
  // itself considers a project's home. Only then the other remotes, and only
  // where nothing has claimed the id — so a repository that is one project's
  // origin and another's upstream resolves to the one it belongs to.
  for (const project of projects) {
    const key = project.projectKey.toLowerCase();
    if (!key.startsWith("remote:")) continue;
    const repositoryId = key.slice("remote:".length);
    if (byRepositoryId[repositoryId] === undefined) byRepositoryId[repositoryId] = project;
  }

  const scanned = await Promise.all(
    projects.map(async (project) => ({ project, remotes: await gitRemotes(project.rootPath) })),
  );
  for (const { project, remotes } of scanned) {
    for (const repositoryId of remotes) {
      if (byRepositoryId[repositoryId] === undefined) byRepositoryId[repositoryId] = project;
    }
  }

  return { projects, byRepositoryId };
}

export async function loadProjectIndex(paseo: PaseoApi, force = false): Promise<ProjectIndex> {
  return projectIndexCache.get(PROJECT_INDEX_KEY, PROJECT_INDEX_TTL_MS, () => buildProjectIndex(paseo), {
    force,
  });
}

/**
 * A miss is retried against a freshly built index, so a project added moments
 * ago is found instead of being denied for the rest of the cache window.
 */
export async function findProject(
  paseo: PaseoApi,
  repositoryId: string,
): Promise<ProjectRecord | undefined> {
  const cached = await loadProjectIndex(paseo);
  const hit = cached.byRepositoryId[repositoryId];
  if (hit !== undefined) return hit;
  const fresh = await loadProjectIndex(paseo, true);
  return fresh.byRepositoryId[repositoryId];
}
