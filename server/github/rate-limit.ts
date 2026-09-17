/** One reading of GitHub's GraphQL budget, as `rateLimit { ... }` reports it on every request this plugin makes. */
export interface RateLimitReading {
  cost: number;
  remaining: number;
  limit: number;
  resetAt: string;
}

/**
 * Below this many points left, a sweep is refused outright rather than spent
 * on a request that risks tripping GitHub's own limit mid-flight and losing
 * whatever partial answer it would otherwise have given back.
 */
const RATE_LIMIT_FLOOR = 100;

let latestReading: RateLimitReading | null = null;

/** The most recent budget GitHub reported, for the surface to show — kept here rather than per-request. */
export function currentRateLimit(): RateLimitReading | null {
  return latestReading;
}

/**
 * Refuses to spend more budget once the last known reading is below the
 * floor, naming when GitHub gives the budget back — the same fact a caller
 * would need to decide whether to wait rather than retry immediately.
 */
export function assertBudget(): void {
  if (latestReading !== null && latestReading.remaining < RATE_LIMIT_FLOOR) {
    throw new Error(
      `GitHub's GraphQL budget is at ${latestReading.remaining} points, below the ${RATE_LIMIT_FLOOR}-point floor this plugin keeps in reserve. It resets at ${latestReading.resetAt}.`,
    );
  }
}

function toReading(raw: unknown): RateLimitReading | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { cost, remaining, limit, resetAt } = raw as Record<string, unknown>;
  if (
    typeof cost !== "number" ||
    typeof remaining !== "number" ||
    typeof limit !== "number" ||
    typeof resetAt !== "string"
  ) {
    return null;
  }
  return { cost, remaining, limit, resetAt };
}

/**
 * Reads the `rateLimit` sibling `injectRateLimit` added to the query, and
 * remembers it for the next `assertBudget` call. Logged every time, because
 * the cost of one query is exactly the kind of thing nobody looks at until
 * the budget it draws from is already gone.
 */
export function recordRateLimit(data: Record<string, unknown> | null | undefined): void {
  const reading = toReading(data?.rateLimit);
  if (reading === null) return;
  latestReading = reading;
  console.log(
    `[pr-views] graphql cost=${reading.cost} remaining=${reading.remaining}/${reading.limit} resetAt=${reading.resetAt}`,
  );
}

/** Finds the matching `}` for the `{` at `openIndex`, by brace depth. */
function matchingBrace(text: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unbalanced braces in a GraphQL query while adding rateLimit.");
}

const FRAGMENT_HEADER = /^\s*fragment\s+\w+\s+on\s+\w+\s*\{/;

/** Skips past every leading `fragment Name on Type { ... }` block, to where the operation itself begins. */
function skipFragments(query: string): number {
  let index = 0;
  for (;;) {
    const match = FRAGMENT_HEADER.exec(query.slice(index));
    if (match === null) return index;
    const braceStart = index + match[0].length - 1;
    index = matchingBrace(query, braceStart) + 1;
  }
}

/**
 * Adds `rateLimit { cost remaining limit resetAt }` as a sibling of the
 * operation's own root fields, so every request this plugin makes reports its
 * own cost and the budget left over. Inserted textually — every query here is
 * a hand-written string passed straight to `gh api graphql`, never built with
 * a real GraphQL parser — immediately after the operation's opening brace,
 * which is why any leading fragment definitions are skipped first: their own
 * opening brace is not the one this must land beside.
 */
export function injectRateLimit(query: string): string {
  const operationStart = skipFragments(query);
  const braceIndex = query.indexOf("{", operationStart);
  if (braceIndex === -1) return query;
  return `${query.slice(0, braceIndex + 1)}\n  rateLimit { cost remaining limit resetAt }${query.slice(braceIndex + 1)}`;
}

/**
 * Rewrites a `gh api graphql` call's own `-f query=…` field to carry the
 * `rateLimit` sibling above. Shared by both request helpers in `./gh` and
 * `./graphql`, which otherwise duplicate nothing about how a query is passed
 * to the CLI.
 */
export function prepareGraphqlArgs(args: readonly string[]): string[] {
  const next = [...args];
  for (let index = 0; index < next.length - 1; index += 1) {
    const value = next[index + 1];
    if (next[index] === "-f" && value !== undefined && value.startsWith("query=")) {
      next[index + 1] = `query=${injectRateLimit(value.slice("query=".length))}`;
      break;
    }
  }
  return next;
}
