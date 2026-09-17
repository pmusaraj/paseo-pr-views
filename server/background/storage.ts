import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { SavedViewsSchema } from "../../shared/saved-views";
import { ViewCheckSchema } from "../../shared/background";
import { cacheDataDir } from "../cache/paths";

export const CheckRecordSchema = ViewCheckSchema.extend({
  login: z.string(),
  ids: z.array(z.string()),
});
export type CheckRecord = z.output<typeof CheckRecordSchema>;
export type CheckRecords = Record<string, CheckRecord>;
const statePath = () => join(cacheDataDir(), "view-checks.json");

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readViews() {
  // Paseo 0.8 exposes settings registration but no server-side settings reader.
  const path = join(
    process.env.PASEO_HOME ?? join(homedir(), ".paseo"),
    "plugin-settings",
    "pr-views",
    "saved-views.json",
  );
  const stored = await readJson(path);
  if (stored === null) return SavedViewsSchema.parse({}).views;
  const envelope = z
    .object({ version: z.literal(1), values: SavedViewsSchema })
    .parse(stored);
  return envelope.values.views;
}

export async function readChecks(): Promise<CheckRecords> {
  return z
    .record(z.string(), CheckRecordSchema)
    .parse((await readJson(statePath())) ?? {});
}

export async function writeChecks(records: CheckRecords) {
  const path = statePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(records), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
