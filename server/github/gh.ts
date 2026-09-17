import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertBudget, prepareGraphqlArgs, recordRateLimit } from "./rate-limit";

const execFileAsync = promisify(execFile);

/** gh search caps out well under this; the ceiling only guards a runaway page. */
export const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function describeGhFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
    return "GitHub CLI (gh) is not installed or not on the daemon's PATH.";
  }
  const stderr = extractStderr(error);
  if (stderr.includes("gh auth login") || stderr.toLowerCase().includes("authentication")) {
    return "GitHub CLI is not authenticated. Run `gh auth login` on the daemon machine.";
  }
  if (stderr !== "") return stderr;
  return error instanceof Error ? error.message : String(error);
}

/**
 * `execFile`'s rejection carries `stderr` typed as `unknown`: narrowing it to
 * the two shapes Node actually produces (a string, or a `Buffer` when no
 * encoding was requested) is what lets this stringify it safely, rather than
 * risking `[object Object]` from calling `String()` on whatever shape a
 * different failure happened to carry.
 */
function extractStderr(error: unknown): string {
  if (typeof error !== "object" || error === null || !("stderr" in error)) return "";
  const { stderr } = error;
  if (typeof stderr === "string") return stderr.trim();
  if (Buffer.isBuffer(stderr)) return stderr.toString("utf8").trim();
  return "";
}

/** The `data` object of a parsed `gh api graphql` response body, if this call's stdout was one to parse. */
function peekRateLimitData(stdout: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const data = (parsed as { data?: unknown }).data;
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function gh(args: readonly string[]): Promise<string> {
  const graphql = args[0] === "api" && args[1] === "graphql";
  if (graphql) assertBudget();
  try {
    const { stdout } = await execFileAsync("gh", graphql ? prepareGraphqlArgs(args) : [...args], {
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    if (graphql) recordRateLimit(peekRateLimitData(stdout));
    return stdout;
  } catch (error) {
    throw new Error(describeGhFailure(error));
  }
}

/**
 * `@me` resolves differently per search type and is opaque in the UI, so every
 * query runs against a concrete login instead.
 */
export async function resolveViewerLogin(): Promise<string> {
  const raw = await gh(["api", "graphql", "-f", "query={ viewer { login } }"]);
  const parsed: unknown = JSON.parse(raw);
  const login = (parsed as { data?: { viewer?: { login?: unknown } } }).data?.viewer?.login;
  if (typeof login !== "string" || login === "") {
    throw new Error("GitHub did not return a login for the authenticated account.");
  }
  return login;
}
