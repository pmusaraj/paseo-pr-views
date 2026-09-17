import type { LinkedIssue } from "../../shared/board";

/**
 * The repository is spelled out only when the issue lives somewhere other than
 * the pull request; within one repository the number alone is how GitHub itself
 * reads.
 */
export function linkedIssueLabel(issue: LinkedIssue, repository: string): string {
  return issue.repository === repository || issue.repository === ""
    ? `Issue #${issue.number}`
    : `Issue ${issue.repository}#${issue.number}`;
}
