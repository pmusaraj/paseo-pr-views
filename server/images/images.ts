import type { z } from "zod";
import type { loadImage } from "../../shared/board";
import { isGitHubImageHost } from "../../shared/image-host";
import { gh } from "../github/gh";

/**
 * An image out of a comment, fetched here because the app cannot: a
 * `github.com/user-attachments/assets/…` URL on a private repository answers
 * 404 to anyone without the token, and with it answers a 302 to a signed S3
 * URL good for five minutes. The redirect is followed by hand
 * (`fetchFollowingRedirects` below) rather than left to `fetch`'s own
 * `redirect: "follow"`: the Authorization header must never reach that S3
 * leg, and asserting that here is safer than trusting undici to keep
 * dropping it across origins forever.
 *
 * Only GitHub hosts, and only the `/user-attachments/` path this proxy
 * exists to serve, checked again here rather than trusted from the client,
 * because this is the daemon fetching a URL that a comment's author chose.
 */
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_CACHE_ENTRIES = 24;
const MAX_IMAGE_REDIRECTS = 5;

/**
 * `gh auth token`, remembered for five minutes so opening several images in
 * a row does not shell out to `gh` for each one. Kept in a plain
 * module-local variable rather than the disk-backed `Cache` every other
 * feature in this plugin uses: unlike every other cached answer, this one
 * *is* the credential, and persisting it would write the account's GitHub
 * token to a file on every daemon restart — a strict downgrade from `gh`'s
 * own 0600 `hosts.yml`. A five-minute memo needs no file to unlink either,
 * because nothing here ever reaches disk.
 */
const TOKEN_TTL_MS = 5 * 60_000;
let cachedToken: { value: string; storedAt: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

async function ghToken(): Promise<string> {
  if (cachedToken !== null && Date.now() - cachedToken.storedAt < TOKEN_TTL_MS) {
    return cachedToken.value;
  }
  if (tokenInFlight !== null) return tokenInFlight;
  tokenInFlight = (async () => {
    try {
      const token = (await gh(["auth", "token"])).trim();
      if (token === "") throw new Error("GitHub CLI has no token for this account.");
      cachedToken = { value: token, storedAt: Date.now() };
      return token;
    } finally {
      tokenInFlight = null;
    }
  })();
  return tokenInFlight;
}

/**
 * Follows a redirect chain one hop at a time instead of handing `redirect:
 * "follow"` to `fetch`: the Authorization header is attached only while the
 * next hop is still an allowed GitHub image host, so the signed S3 URL a
 * `user-attachments` redirect resolves to is fetched without it — asserted
 * here rather than relied on as `fetch`'s cross-origin behaviour.
 */
async function fetchFollowingRedirects(url: string): Promise<Response> {
  let target = url;
  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
    const carryToken = isGitHubImageHost(target);
    const response = await fetch(target, {
      headers: carryToken ? { Authorization: `token ${await ghToken()}` } : {},
      redirect: "manual",
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (location === null) return response;
    target = new URL(location, target).toString();
  }
  throw new Error("Too many redirects fetching this image.");
}

async function fetchImage(url: string): Promise<string> {
  if (!isGitHubImageHost(url)) {
    throw new Error("Only images hosted on GitHub are fetched through the daemon.");
  }
  const response = await fetchFollowingRedirects(url);
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for this image.`);
  }
  const type = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!type.startsWith("image/")) {
    throw new Error(`Not an image: GitHub answered with ${type || "no content type"}.`);
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > IMAGE_MAX_BYTES) {
    throw new Error("This image is too large to show here.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new Error("This image is too large to show here.");
  }
  return `data:${type};base64,${bytes.toString("base64")}`;
}

/**
 * A handful of images, by URL, so scrolling back through a thread does not
 * fetch a screenshot twice. Bounded by count rather than time, unlike every
 * other cache in this plugin: each entry is a whole image rather than
 * something with a meaningful staleness window, so a plain count-bounded map
 * is kept here instead of routing through the shared TTL cache.
 */
const cachedImages = new Map<string, string>();

export async function loadImageHandler({
  url,
}: z.output<typeof loadImage.input>): Promise<z.input<typeof loadImage.output>> {
  const hit = cachedImages.get(url);
  if (hit !== undefined) return { dataUrl: hit };
  const dataUrl = await fetchImage(url);
  cachedImages.set(url, dataUrl);
  if (cachedImages.size > IMAGE_CACHE_ENTRIES) {
    const oldest = cachedImages.keys().next().value;
    if (oldest !== undefined) cachedImages.delete(oldest);
  }
  return { dataUrl };
}
