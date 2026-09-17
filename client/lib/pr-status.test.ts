import { expect, it } from "vitest";
import { prStatusIcon } from "./pr-status";
import type { BoardItem } from "../../shared/board";

const item: BoardItem = {
  id: "pr",
  number: 1,
  title: "Example",
  url: "",
  repository: "example/project",
  owner: "example",
  updatedAt: "",
  createdAt: "",
  lastCommitAt: null,
  commentsCount: 0,
  labels: [],
  author: null,
  detail: null,
  relations: [],
  linkedIssues: [],
  checks: null,
};
const colors = {
  approved: "green",
  changesRequested: "orange",
  closed: "red",
  merged: "purple",
  neutral: "gray",
};

it("keeps PR icons with accessible review colors without adding list text", () => {
  expect(prStatusIcon({ ...item, prReview: "approved" }, "open-prs", colors)).toEqual({
    iconName: "GitPullRequest",
    iconColor: "green",
    label: "Approved",
  });
  expect(prStatusIcon({ ...item, prReview: "changes-requested" }, "open-prs", colors)).toEqual({
    iconName: "GitPullRequest",
    iconColor: "orange",
    label: "Changes requested",
  });
  expect(prStatusIcon(item, "open-prs", colors)).toMatchObject({
    iconName: "GitPullRequest",
    iconColor: "gray",
  });
});

it("gives terminal and draft state precedence over old reviews", () => {
  expect(
    prStatusIcon(
      { ...item, prState: "MERGED", prReview: "changes-requested" },
      "draft-prs",
      colors,
    ),
  ).toMatchObject({ iconName: "GitMerge", iconColor: "purple" });
  expect(
    prStatusIcon({ ...item, prState: "CLOSED", prReview: "approved" }, "open-prs", colors),
  ).toMatchObject({ iconName: "GitPullRequestClosed", iconColor: "red" });
  expect(prStatusIcon({ ...item, prReview: "approved" }, "draft-prs", colors)).toMatchObject({
    iconName: "GitPullRequestDraft",
    iconColor: "gray",
  });
});
