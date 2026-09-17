import { describe, expect, it } from "vitest";
import { listProjects, loadBoard } from "./board";

describe("loadBoard.input owners", () => {
  it("accepts a well-formed list of GitHub logins", () => {
    const result = loadBoard.input.safeParse({ owners: ["octocat", "my-org", "a"] });
    expect(result.success).toBe(true);
  });

  it("rejects an array past the 50-owner bound", () => {
    const owners = Array.from({ length: 51 }, (_, i) => `owner${i}`);
    const result = loadBoard.input.safeParse({ owners });
    expect(result.success).toBe(false);
  });

  it("rejects a login with a smuggled search qualifier", () => {
    const result = loadBoard.input.safeParse({ owners: ["octocat archived:false"] });
    expect(result.success).toBe(false);
  });

  it("rejects a login with a leading, trailing or doubled hyphen", () => {
    expect(loadBoard.input.safeParse({ owners: ["-octocat"] }).success).toBe(false);
    expect(loadBoard.input.safeParse({ owners: ["octocat-"] }).success).toBe(false);
    expect(loadBoard.input.safeParse({ owners: ["octo--cat"] }).success).toBe(false);
  });
});

describe("listProjects.input owners", () => {
  it("applies the same bound and login format as loadBoard", () => {
    expect(listProjects.input.safeParse({ owners: ["octocat"] }).success).toBe(true);
    const owners = Array.from({ length: 51 }, (_, i) => `owner${i}`);
    expect(listProjects.input.safeParse({ owners }).success).toBe(false);
    expect(listProjects.input.safeParse({ owners: ["not a login"] }).success).toBe(false);
  });
});
