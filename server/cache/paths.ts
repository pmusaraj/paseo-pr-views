import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where a persisted cache entry lives between daemon restarts.
 *
 * `PluginHandlerContext` — the only host object a handler is ever given —
 * exposes nothing that names a per-plugin data directory (see
 * `@getpaseo/plugin/server`'s `contracts.d.ts` and `lifecycle.d.ts`: a handler
 * gets `{ paseo }` and nothing else). Absent that, this falls back to the XDG
 * state directory a well-behaved daemon already uses for its own state, under
 * a directory named for this plugin rather than for GitHub in general, so a
 * stray file here cannot be mistaken for one the daemon itself wrote.
 */
export function cacheDataDir(): string {
  const base = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  return join(base, "paseo-pr-views", "cache");
}
