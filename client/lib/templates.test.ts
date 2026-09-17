import { describe, expect, it } from "vitest";
import type { BoardItem, PromptSettings } from "../../shared/board";
import { renderTemplate, templateFor } from "./templates";

function makeItem(overrides: Partial<BoardItem>): BoardItem {
  return {
    id: "node-1",
    number: 42,
    title: "Fix the thing",
    url: "https://github.com/owner/repo/issues/42",
    repository: "owner/repo",
    updatedAt: "2024-01-01T00:00:00Z",
    createdAt: "2024-01-01T00:00:00Z",
    lastCommitAt: null,
    commentsCount: 0,
    labels: [],
    author: null,
    detail: null,
    owner: "owner",
    relations: ["author"],
    linkedIssues: [],
    checks: null,
    ...overrides,
  };
}

function makePrompts(overrides: Partial<PromptSettings>): PromptSettings {
  return {
    byType: {
      issues: "type template issues",
      "draft-prs": "type template draft-prs",
      "open-prs": "type template open-prs",
      discussions: "type template discussions",
    },
    byProject: {},
    ...overrides,
  };
}

describe("renderTemplate", () => {
  it("substitutes every known placeholder from the item", () => {
    const item = makeItem({
      url: "https://github.com/owner/repo/issues/42",
      title: "Fix the thing",
      number: 42,
      repository: "owner/repo",
    });
    const result = renderTemplate("{title} (#{number}) {repository} {url}", item);
    expect(result).toBe(
      "Fix the thing (#42) owner/repo https://github.com/owner/repo/issues/42",
    );
  });

  it("leaves an unrecognised placeholder standing instead of blanking it", () => {
    const item = makeItem({ title: "Fix the thing" });
    const result = renderTemplate("{title} {nonsense} {url}", item);
    expect(result).toBe(`Fix the thing {nonsense} ${item.url}`);
  });
});

describe("templateFor", () => {
  it("prefers the project override over the type template", () => {
    const prompts = makePrompts({
      byProject: { "project-1": { issues: "override for this project" } },
    });
    expect(templateFor(prompts, "issues", "project-1")).toBe("override for this project");
  });

  it("falls back to the type template when the override is blank", () => {
    const prompts = makePrompts({
      byProject: { "project-1": { issues: "   " } },
    });
    expect(templateFor(prompts, "issues", "project-1")).toBe("type template issues");
  });

  it("falls back to the type template when there is no project or no matching entry", () => {
    const prompts = makePrompts({
      byProject: { "project-1": { issues: "override" } },
    });
    expect(templateFor(prompts, "issues", null)).toBe("type template issues");
    expect(templateFor(prompts, "issues", "project-2")).toBe("type template issues");
    expect(templateFor(prompts, "draft-prs", "project-1")).toBe("type template draft-prs");
  });
});
