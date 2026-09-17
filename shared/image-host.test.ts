import { describe, expect, it } from "vitest";
import { isGitHubImageHost } from "./image-host";

describe("isGitHubImageHost", () => {
  it("accepts a github.com user-attachments URL", () => {
    expect(isGitHubImageHost("https://github.com/user-attachments/assets/abc-123")).toBe(true);
  });

  it("accepts a githubusercontent.com URL", () => {
    expect(isGitHubImageHost("https://raw.githubusercontent.com/owner/repo/main/img.png")).toBe(true);
  });

  it("rejects a github.com path outside user-attachments", () => {
    expect(isGitHubImageHost("https://github.com/owner/repo/settings")).toBe(false);
  });

  it("rejects a non-https scheme", () => {
    expect(isGitHubImageHost("http://github.com/user-attachments/assets/abc-123")).toBe(false);
  });

  it("rejects a host-confusion attempt against githubusercontent.com", () => {
    expect(isGitHubImageHost("https://evil.example\\.githubusercontent.com/a.png")).toBe(false);
  });

  it("rejects a URL carrying credentials", () => {
    expect(isGitHubImageHost("https://user:pass@github.com/user-attachments/assets/abc")).toBe(false);
  });
});
