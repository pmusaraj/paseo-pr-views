import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { cacheDataDir } from "./paths";

/** One cached answer, timestamped so a caller's own TTL decides whether it is still good. */
interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

/**
 * The one cache this plugin uses everywhere an answer is worth remembering: a
 * TTL supplied by the caller rather than baked into the cache, single-flight
 * so two callers racing the same key share one sweep, and disk persistence so
 * a `paseo plugin reload` or a daemon restart resumes from the last answer
 * instead of re-asking GitHub.
 *
 * Generic over the stored value, and requires it to be JSON-safe — this is
 * what makes the persistence guarantee possible at all — so a value that
 * needs a `Map` or similar is built as a plain object instead (see
 * `ProjectIndex`).
 *
 * One instance per feature (the board, project summaries, one project's
 * items, repository labels, item details, …), each keyed by whatever
 * distinguishes its own queries — a login and its watched owners, an
 * `owner/number` pair, a node id.
 */
export class Cache<T> {
  private readonly memory = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly file: string;
  private hydrated: Promise<void> | null = null;
  private hardenedFile = false;
  private generation = 0;

  constructor(name: string) {
    this.file = join(cacheDataDir(), `${name}.json`);
  }

  /**
   * Reads the persisted file once per process, lazily: most cache instances
   * are never asked for anything before their first `get`, so paying for a
   * read at construction time would cost every handler a disk hit it may not
   * need. A corrupt or unreadable file is a cache miss, never a crash — the
   * daemon starts the same whether this is a fresh install, a missing file,
   * or one an older version wrote in a shape this one no longer recognises.
   */
  private hydrate(): Promise<void> {
    if (this.hydrated === null) {
      this.hydrated = (async () => {
        try {
          const parsed: unknown = JSON.parse(await readFile(this.file, "utf8"));
          if (typeof parsed !== "object" || parsed === null) return;
          for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof entry !== "object" || entry === null) continue;
            const { value, storedAt } = entry as { value?: unknown; storedAt?: unknown };
            if (typeof storedAt !== "number" || value === undefined) continue;
            this.memory.set(key, { value: value as T, storedAt });
          }
        } catch {
          // No file yet, or one this process cannot parse; start empty.
        }
      })();
    }
    return this.hydrated;
  }

  private async persist(): Promise<void> {
    const serialized: Record<string, CacheEntry<T>> = {};
    for (const [key, entry] of this.memory) serialized[key] = entry;
    try {
      // These files hold private issue and PR titles, bodies and comment
      // threads (and, for the token cache this class no longer sees, the
      // account's own GitHub token) — a directory and a mode the creating
      // call gets right from the start, rather than a default 0755/0644
      // anyone on the machine can read.
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      await writeFile(this.file, JSON.stringify(serialized), { encoding: "utf8", mode: 0o600 });
      if (!this.hardenedFile) {
        // `writeFile`'s `mode` option only takes effect the moment it
        // creates the file: a cache file an older build already wrote at
        // 0644 keeps that mode forever unless something chmods it. One
        // `chmod` per process, the first time this instance persists, is
        // enough to bring a pre-existing file back in line without paying
        // the syscall on every single write.
        await chmod(this.file, 0o600);
        this.hardenedFile = true;
      }
    } catch (error) {
      // Persistence is a resume optimisation, not a correctness requirement:
      // a read-only disk should not fail the request that triggered the write.
      console.warn(
        `[pr-views] could not persist cache "${this.file}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Answers from memory when a live entry is younger than `ttl`, otherwise
   * runs `load` and remembers what it returns. Two concurrent callers for the
   * same key while nothing live is cached await the same `load` — the second
   * caller never starts a second sweep, forced or not.
   *
   * `shouldCache` lets a caller decline to remember a particular answer — the
   * board does this for a sweep where any column failed, so the failure does
   * not linger on screen for the whole TTL window when a retry might succeed.
   * Omitted, every answer is cached.
   */
  async get(
    key: string,
    ttl: number,
    load: () => Promise<T>,
    options?: { force?: boolean; shouldCache?: (value: T) => boolean },
  ): Promise<T> {
    await this.hydrate();
    if (options?.force !== true) {
      const cached = this.memory.get(key);
      if (cached !== undefined && Date.now() - cached.storedAt < ttl) return cached.value;
    }
    const running = this.inFlight.get(key);
    if (running !== undefined) return running;

    const generation = this.generation;
    const promise = (async () => {
      try {
        const value = await load();
        if (generation === this.generation && options?.shouldCache?.(value) !== false) {
          this.memory.set(key, { value, storedAt: Date.now() });
          await this.persist();
        }
        return value;
      } finally {
        if (generation === this.generation) this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, promise);
    return promise;
  }

  /** In-flight answers from before a mutation must not repopulate the cache. */
  async clear(): Promise<void> {
    await this.hydrate();
    this.generation++;
    this.memory.clear();
    this.inFlight.clear();
    await this.persist();
  }

  /** Stores a value the caller already has — a mutation's own response — bypassing `load`. */
  async set(key: string, value: T): Promise<void> {
    await this.hydrate();
    this.memory.set(key, { value, storedAt: Date.now() });
    await this.persist();
  }

  /** Drops one entry, so the next `get` for it runs a fresh sweep regardless of its age. */
  async invalidate(key: string): Promise<void> {
    await this.hydrate();
    if (!this.memory.delete(key)) return;
    await this.persist();
  }

  /**
   * Rewrites every currently cached entry in place, for a mutation that knows
   * what changed but not which cache key the affected value was stored under
   * — a label toggled or a pull request merged patches whatever board is
   * cached rather than looking up a key it was never given. The entry's own
   * age is kept: a patch is not a fresh answer from GitHub.
   */
  async patchAll(updater: (value: T) => T): Promise<void> {
    await this.hydrate();
    if (this.memory.size === 0) return;
    for (const [key, entry] of this.memory) {
      this.memory.set(key, { value: updater(entry.value), storedAt: entry.storedAt });
    }
    await this.persist();
  }
}
