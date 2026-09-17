/**
 * Shared, so it lands in both bundles: the client uses it to decide whether an
 * image needs the daemon, and the server to refuse anything else. Like every
 * `shared/` module it must stay free of Node and React imports.
 */
/**
 * Hosts whose images the server fetches on the client's behalf. An attachment
 * on a private repository answers 404 without the `gh` token, and the token
 * lives on the daemon — the app never sees it. Anything else the app loads
 * itself: sending the daemon after an arbitrary URL from a comment anyone
 * could have written is a fetch nobody asked for.
 *
 * `github.com` is narrowed to the `/user-attachments/` prefix this proxy
 * exists to serve: the host check alone would let a comment's author pick
 * any `github.com` path and have the daemon fetch it carrying the account's
 * token, which is a forced authenticated request nobody asked the daemon to
 * make. `*.githubusercontent.com` needs no such narrowing — it never receives
 * the token (see `server/images/images.ts`'s redirect handling) and is where
 * every other GitHub-hosted image, including raw content, actually lives.
 */
export function isGitHubImageHost(url: string): boolean {
  // Parsed, never matched. A regex over the raw string decides on different
  // text than `fetch` does: WHATWG ends the host at a backslash too, so
  // `https://evil.example\.githubusercontent.com/a.png` reads as the
  // attacker's host to `fetch` and as a GitHub subdomain to a pattern, which
  // is the daemon handing `gh auth token` to whoever wrote the comment.
  let host: URL;
  try {
    host = new URL(url);
  } catch {
    return false;
  }
  if (host.protocol !== "https:") return false;
  // Credentials in the URL are refused rather than parsed around: they carry
  // no meaning for a GitHub attachment and they are the other half of every
  // host-confusion trick.
  if (host.username !== "" || host.password !== "") return false;
  const name = host.hostname.toLowerCase();
  if (name.endsWith(".githubusercontent.com")) return true;
  return name === "github.com" && host.pathname.startsWith("/user-attachments/");
}

