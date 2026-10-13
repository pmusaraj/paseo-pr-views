import { describe, expect, it } from "vitest";
import { injectRateLimit, prepareGraphqlArgs } from "./rate-limit";

const reading = "rateLimit { cost remaining limit resetAt }";

describe("GraphQL rate limit instrumentation", () => {
  it.each([
    "{ viewer { login } }",
    "query Viewer { viewer { login } }",
    "# viewer lookup\nquery Viewer { viewer { login } }",
    "fragment ViewerFields on User { login }\nquery Viewer { viewer { ...ViewerFields } }",
  ])("adds rateLimit to the query root: %s", (query) => {
    const result = injectRateLimit(query);
    expect(result).toContain(reading);
    expect(result.replace(`\n  ${reading}`, "")).toBe(query);
    expect(result.indexOf(reading)).toBeGreaterThan(result.indexOf("query Viewer"));
  });

  it.each([
    "mutation($id: ID!) { addPullRequestReview(input: { pullRequestId: $id, event: APPROVE }) { pullRequestReview { state } } }",
    "mutation { mergePullRequest(input: { pullRequestId: \"PR_1\", mergeMethod: SQUASH }) { pullRequest { state } } }",
    "# approval\nmutation Approve { approve }",
    "fragment Review on PullRequestReview { state }\n# approval\nmutation Approve { approve }",
    "subscription Updates { updates }",
  ])("leaves non-query operations unchanged: %s", (query) => {
    const args = ["api", "graphql", "-f", `query=${query}`, "-f", "id=PR_1"];
    expect(prepareGraphqlArgs(args)).toEqual(args);
    expect(injectRateLimit(query)).toBe(query);
  });

  it("preserves CLI variables and the original arguments when instrumenting queries", () => {
    const args = ["api", "graphql", "-f", "query=query($id: ID!) { node(id: $id) { id } }", "-f", "id=PR_1"];
    const result = prepareGraphqlArgs(args);
    expect(result[3]).toContain(reading);
    expect(args[3]).not.toContain(reading);
    expect(result.slice(4)).toEqual(["-f", "id=PR_1"]);
  });
});
