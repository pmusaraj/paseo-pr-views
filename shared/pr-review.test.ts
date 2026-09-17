import { describe, expect, it } from "vitest";
import { approvalLogins, reviewStatus } from "./pr-review";

const page = (states: string[], more = false) => ({
  nodes: states.map((state) => ({ state })),
  pageInfo: { hasNextPage: more, endCursor: null },
});

describe("current PR review opinions", () => {
  it("honors the aggregate decision even when some reviewers approved", () => {
    expect(reviewStatus("REVIEW_REQUIRED", page(["APPROVED"]))).toBe("review-required");
    expect(reviewStatus("CHANGES_REQUESTED", page(["APPROVED"]))).toBe("changes-requested");
    expect(reviewStatus("APPROVED", null)).toBe("approved");
  });
  it("falls back to current opinions when review requirements are absent", () => {
    expect(reviewStatus(null, page(["APPROVED"]))).toBe("approved");
    expect(reviewStatus(null, page(["APPROVED", "CHANGES_REQUESTED"]))).toBe("changes-requested");
    expect(reviewStatus(null, page(["DISMISSED", "COMMENTED", "PENDING"]))).toBeNull();
    expect(reviewStatus(null, page(["APPROVED"], true))).toBeNull();
  });
  it("attributes only current approvals, deduplicating and ignoring deleted accounts", () => {
    expect(
      approvalLogins([
        { state: "APPROVED", author: { login: "alice" } },
        { state: "APPROVED", author: { login: "alice" } },
        { state: "DISMISSED", author: { login: "bob" } },
        { state: "CHANGES_REQUESTED", author: { login: "carol" } },
        { state: "COMMENTED", author: { login: "dave" } },
        { state: "APPROVED", author: null },
        null,
      ]),
    ).toEqual(["alice"]);
  });
});
