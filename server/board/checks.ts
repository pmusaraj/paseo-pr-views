import type { BoardItem, CheckSummary } from "../../shared/board";
import { gh } from "../github/gh";

/**
 * The checks on each pull request's head commit, by node id.
 *
 * A **separate request** from the search, deliberately. A token without the
 * Checks permission — a fine-grained PAT, typically — answers
 * `statusCheckRollup` with "Resource not accessible", and `gh api graphql`
 * treats any GraphQL error as a failed command. Asking for it inside the search
 * would turn that into a blank Draft PRs *and* Open PRs column; asking for it
 * separately costs pills nobody could have seen anyway.
 *
 * `nodes(ids:)` takes at most 100 ids, which the caller cannot exceed: it asks
 * only for the open pull requests, and the merged list was already cut to
 * `limit`, whose own ceiling is 100.
 */
const CHECKS_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on PullRequest {
      id
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes {
                  __typename
                  ... on CheckRun {
                    name
                    status
                    conclusion
                    startedAt
                    completedAt
                    checkSuite { workflowRun { databaseId } }
                  }
                  ... on StatusContext {
                    context
                    state
                    createdAt
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Where one check lands in the summary. `ignored` is the fourth outcome that is
 * neither a result nor a wait — a skipped or cancelled run says nothing about
 * whether the pull request is healthy, so it is counted nowhere, exactly as
 * Paseo's own checks summary drops it.
 */
type CheckOutcome = "passed" | "failed" | "pending" | "ignored";

/**
 * Mirrors Paseo's `mapCheckRunStatus` so the board and the sidebar cannot
 * disagree about the same pull request, with one deliberate difference:
 * `STARTUP_FAILURE` and `STALE` are terminal, so reporting them as `pending`
 * would show a run still going that will never report again.
 */
function checkRunOutcome(status: unknown, conclusion: unknown): CheckOutcome {
  if (status !== "COMPLETED") return "pending";
  switch (conclusion) {
    case "SUCCESS":
      return "passed";
    case "FAILURE":
    case "TIMED_OUT":
    case "ACTION_REQUIRED":
    case "STARTUP_FAILURE":
      return "failed";
    case "CANCELLED":
    case "SKIPPED":
    case "NEUTRAL":
    case "STALE":
      return "ignored";
    default:
      return "pending";
  }
}

/** The commit-status half of the rollup, which has states rather than conclusions. */
function statusContextOutcome(state: unknown): CheckOutcome {
  switch (state) {
    case "SUCCESS":
      return "passed";
    case "FAILURE":
    case "ERROR":
      return "failed";
    default:
      return "pending";
  }
}

function parseTime(value: unknown): number {
  if (typeof value !== "string") return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface CountedCheck {
  name: string;
  outcome: CheckOutcome;
  /** Higher wins when the same name appears twice; see `foldChecks`. */
  recency: number;
}

function toCountedCheck(node: Record<string, unknown>): CountedCheck | null {
  if (node.__typename === "CheckRun") {
    const workflowRunId = (
      node.checkSuite as { workflowRun?: { databaseId?: unknown } } | undefined
    )?.workflowRun?.databaseId;
    return {
      name: typeof node.name === "string" ? node.name : "",
      outcome: checkRunOutcome(node.status, node.conclusion),
      // A re-run gets a higher run id than the run it replaced, so the id
      // orders attempts even before either of them has a timestamp.
      recency:
        typeof workflowRunId === "number"
          ? workflowRunId
          : parseTime(node.completedAt ?? node.startedAt),
    };
  }
  if (node.__typename === "StatusContext") {
    return {
      name: typeof node.context === "string" ? node.context : "",
      outcome: statusContextOutcome(node.state),
      recency: parseTime(node.createdAt),
    };
  }
  // A rollup entry of some type this query did not ask for.
  return null;
}

/**
 * Folds one commit's rollup into the three counts a card shows.
 *
 * Deduplicated by check name, keeping the most recent: a re-run leaves the
 * attempt it replaced in the rollup, and counting both would report a check
 * that failed and then passed as one of each.
 *
 * Null rather than three zeroes when nothing reported at all, so "no CI here"
 * and "every check was skipped" both render as no pills instead of as an empty
 * summary.
 */
function foldChecks(nodes: readonly unknown[]): CheckSummary | null {
  const latest = new Map<string, CountedCheck>();
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const check = toCountedCheck(node as Record<string, unknown>);
    if (check === null) continue;
    const existing = latest.get(check.name);
    if (existing === undefined || check.recency >= existing.recency) latest.set(check.name, check);
  }
  if (latest.size === 0) return null;

  const summary = { passed: 0, failed: 0, pending: 0 };
  for (const check of latest.values()) {
    if (check.outcome === "passed") summary.passed += 1;
    else if (check.outcome === "failed") summary.failed += 1;
    else if (check.outcome === "pending") summary.pending += 1;
  }
  return summary.passed + summary.failed + summary.pending === 0 ? null : summary;
}

function rollupContexts(node: unknown): unknown[] {
  const commits = (node as { commits?: { nodes?: unknown } } | undefined)?.commits?.nodes;
  if (!Array.isArray(commits)) return [];
  // `commits(last: 1)` is the head commit, which is the only one whose checks
  // describe the pull request as it stands.
  const commit = (commits[0] as { commit?: unknown } | undefined)?.commit;
  const contexts = (
    commit as { statusCheckRollup?: { contexts?: { nodes?: unknown } } } | undefined
  )?.statusCheckRollup?.contexts?.nodes;
  return Array.isArray(contexts) ? contexts : [];
}

async function fetchChecks(ids: readonly string[]): Promise<Map<string, CheckSummary>> {
  const raw = await gh([
    "api",
    "graphql",
    "-f",
    `query=${CHECKS_QUERY}`,
    // gh spells a list variable as a repeated `name[]=` field.
    ...ids.flatMap((id) => ["-f", `ids[]=${id}`]),
  ]);
  const parsed: unknown = JSON.parse(raw);
  const nodes = (parsed as { data?: { nodes?: unknown } }).data?.nodes;
  const summaries = new Map<string, CheckSummary>();
  if (!Array.isArray(nodes)) return summaries;
  for (const node of nodes) {
    if (typeof node !== "object" || node === null) continue;
    const id = (node as { id?: unknown }).id;
    if (typeof id !== "string") continue;
    const summary = foldChecks(rollupContexts(node));
    if (summary !== null) summaries.set(id, summary);
  }
  return summaries;
}

/**
 * Checks are a second round trip, so a failure here must cost the pills and
 * nothing else — the pull requests themselves already loaded. The reason is
 * written to the plugin log rather than dropped, because a permanently
 * pill-less board with no explanation is the one outcome worse than no pills.
 */
export async function attachChecks(items: readonly BoardItem[]): Promise<BoardItem[]> {
  const ids = items.map((item) => item.id).filter((id) => id !== "");
  if (ids.length === 0) return [...items];
  let summaries: Map<string, CheckSummary>;
  try {
    summaries = await fetchChecks(ids);
  } catch (error) {
    console.warn(
      `[pr-views] pull request checks unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return [...items];
  }
  return items.map((item) => ({ ...item, checks: summaries.get(item.id) ?? null }));
}
