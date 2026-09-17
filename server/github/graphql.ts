import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gh, describeGhFailure, MAX_OUTPUT_BYTES } from "./gh";
import { assertBudget, prepareGraphqlArgs, recordRateLimit } from "./rate-limit";

const execFileAsync = promisify(execFile);

export interface GraphqlError {
  type?: string;
  path?: unknown[];
  message: string;
}

export interface GraphqlResult {
  /**
   * Null only when every field GitHub tried to run failed before execution
   * even started, e.g. a scope the token lacks — see `needsProjectScope`.
   * A per-field runtime failure (a deleted owner) still comes back with
   * `data`, just missing that one field.
   */
  data: Record<string, unknown> | null;
  errors: GraphqlError[];
}

export function toGraphqlResult(parsed: unknown): GraphqlResult {
  if (typeof parsed !== "object" || parsed === null) return { data: null, errors: [] };
  // The response envelope: only these two top keys are asserted here, whatever
  // they hold is narrowed field by field below.
  const { data, errors }: { data?: unknown; errors?: unknown } = parsed;
  // GraphQL data keys are the request's own aliases, never known ahead of time.
  const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  // Just proved to be an array; each entry's own fields are read via typeof below.
  const list = Array.isArray(errors) ? (errors as GraphqlError[]) : [];
  return { data: record, errors: list };
}

/** `execFile`'s promisified rejection carries the process's stdout here, same as its stderr. */
function readErrorStdout(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const { stdout }: { stdout?: unknown } = error;
  return typeof stdout === "string" ? stdout : "";
}

/**
 * `gh api graphql` exits non-zero the moment a response carries any `errors`
 * at all, even when every field the caller actually wanted came back fine —
 * so the plain `gh()` helper, which keeps only the failure's message, would
 * throw away a perfectly good answer over one bad owner. This reads the
 * partial body off the failed call instead, and only gives up on the request
 * when GitHub sent no body back at all (an auth or network failure, not a
 * GraphQL one).
 */
export async function ghGraphqlRaw(args: readonly string[]): Promise<GraphqlResult> {
  assertBudget();
  try {
    const { stdout } = await execFileAsync("gh", prepareGraphqlArgs(args), {
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    const result = toGraphqlResult(JSON.parse(stdout));
    recordRateLimit(result.data);
    return result;
  } catch (error) {
    const stdout = readErrorStdout(error);
    if (stdout.trim() === "") throw new Error(describeGhFailure(error));
    try {
      const result = toGraphqlResult(JSON.parse(stdout));
      recordRateLimit(result.data);
      return result;
    } catch {
      throw new Error(describeGhFailure(error));
    }
  }
}

/** Nodes off a GraphQL connection field, or none when the field itself is absent. */
export function nodesOf(result: unknown): unknown[] {
  const nodes = (result as { nodes?: unknown } | undefined)?.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

/** GraphQL aliases cannot contain a hyphen, so relation buckets get plain numeric names. */
export function aliasName(index: number): string {
  return `b${index}`;
}

/**
 * A mutation, and the errors GitHub reports in a 200 body rather than as an
 * exit status. `gh` usually fails the process on those, but a partial error
 * beside partial data does not, and a merge that silently did nothing is the
 * one outcome this must never report as success.
 */
export async function ghMutation(query: string, variables: Record<string, string>): Promise<void> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [name, value] of Object.entries(variables)) {
    args.push("-f", `${name}=${value}`);
  }
  const parsed: unknown = JSON.parse(await gh(args));
  const errors =
    typeof parsed === "object" && parsed !== null && "errors" in parsed ? parsed.errors : null;
  if (!Array.isArray(errors) || errors.length === 0) return;
  const message = errors
    .map((entry) =>
      typeof entry === "object" && entry !== null && "message" in entry ? entry.message : null,
    )
    .filter((entry): entry is string => typeof entry === "string" && entry !== "")
    .join("; ");
  throw new Error(message === "" ? "GitHub rejected the request." : message);
}
