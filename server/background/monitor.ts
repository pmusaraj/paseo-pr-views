import { randomUUID } from "node:crypto";
import type { SavedView } from "../../shared/saved-views";
import type { BackgroundStatus } from "../../shared/background";
import type { CheckRecords } from "./storage";

export const CHECK_INTERVAL_MS = 10 * 60_000;
interface Dependencies {
  views(): Promise<SavedView[]>;
  read(): Promise<CheckRecords>;
  write(records: CheckRecords): Promise<void>;
  login(): Promise<string>;
  fetch(query: string): Promise<string[]>;
  now(): number;
}

export class ViewMonitor {
  private records: CheckRecords | null = null;
  private loading: Promise<CheckRecords> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private checking: Promise<void> | null = null;
  private attempts = new Map<string, { query: string; time: number }>();
  private stopped = false;

  constructor(private readonly dependencies: Dependencies) {}

  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run);
    this.queue = next.catch(() => {});
    return next;
  }

  private async load() {
    if (this.records) return this.records;
    this.loading ??= this.dependencies
      .read()
      .then((records) => (this.records = records))
      .catch((error) => {
        this.loading = null;
        throw error;
      });
    return this.loading;
  }

  async status(): Promise<BackgroundStatus> {
    const [records, views] = await Promise.all([
      this.load(),
      this.dependencies.views(),
    ]);
    return Object.fromEntries(
      views
        .filter(
          (view) =>
            view.backgroundCheck && records[view.id]?.query === view.query,
        )
        .map((view) => {
          const { login: _login, ids: _ids, ...status } = records[view.id]!;
          return [view.id, status];
        }),
    );
  }

  check(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.checking) return this.checking;
    this.checking = this.serialize(() => this.scan()).finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  private async scan() {
    const records = await this.load();
    const views = (await this.dependencies.views()).filter(
      (view) => view.backgroundCheck,
    );
    const active = new Set(views.map((view) => view.id));
    const removed = Object.keys(records).some((id) => !active.has(id));
    for (const id of Object.keys(records))
      if (!active.has(id)) {
        delete records[id];
        this.attempts.delete(id);
      }
    const now = this.dependencies.now();
    const due = views.filter((view) => {
      const attempt = this.attempts.get(view.id);
      const previous = records[view.id];
      const last =
        attempt?.query === view.query
          ? attempt.time
          : previous?.query === view.query && previous.checkedAt
            ? Date.parse(previous.checkedAt)
            : 0;
      return (
        !previous ||
        previous.query !== view.query ||
        now - last >= CHECK_INTERVAL_MS
      );
    });
    if (!due.length && !removed) return;
    let login: string | undefined;
    for (const view of due) {
      if (this.stopped) return;
      this.attempts.set(view.id, { query: view.query, time: now });
      await this.checkView(
        view,
        records,
        async () => (login ??= await this.dependencies.login()),
        now,
      );
    }
    if (!this.stopped) await this.dependencies.write(records);
  }

  private async checkView(
    view: SavedView,
    records: CheckRecords,
    getLogin: () => Promise<string>,
    now: number,
  ) {
    const previous = records[view.id];
    try {
      const login = await getLogin();
      const ids = await this.dependencies.fetch(view.query);
      if (this.stopped) return;
      const current = (await this.dependencies.views()).find(
        (item) => item.id === view.id,
      );
      if (!current?.backgroundCheck || current.query !== view.query) {
        delete records[view.id];
        return;
      }
      const baseline =
        previous?.query === view.query &&
        previous.login === login &&
        previous.checkedAt !== null;
      const known = new Set(baseline ? previous.ids : []);
      const added = baseline && ids.some((id) => !known.has(id));
      records[view.id] = {
        query: view.query,
        login,
        ids,
        revision: added || !baseline ? randomUUID() : previous.revision,
        unread: baseline && (previous.unread || added),
        checkedAt: new Date(now).toISOString(),
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      records[view.id] =
        previous?.query === view.query
          ? { ...previous, error: message }
          : {
              query: view.query,
              login: "",
              ids: [],
              revision: randomUUID(),
              unread: false,
              checkedAt: null,
              error: message,
            };
    }
  }

  acknowledge(input: {
    id: string;
    query: string;
    revision: string;
  }): Promise<BackgroundStatus> {
    return this.serialize(async () => {
      const records = await this.load();
      const record = records[input.id];
      if (record?.query === input.query && record.revision === input.revision) {
        record.unread = false;
        await this.dependencies.write(records);
      }
      return this.status();
    });
  }

  stop() {
    this.stopped = true;
  }
}
