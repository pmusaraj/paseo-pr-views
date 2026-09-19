import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { createSearchSnapshots } from "./search-snapshot";

const engine = ["osx-bin", "linux64-bin"]
  .map((directory) => resolve("node_modules/react-native/sdks/hermesc", directory, "hermes"))
  .find((binary) => existsSync(binary));

// Plugins are evaluated from strings, bypassing Metro's native syntax transforms.
// Run on installations shipping the Hermes interpreter; other platforms retain
// the engine-independent snapshot tests.
it.skipIf(!engine)("creates and subscribes to a snapshot store through Hermes eval", () => {
  const directory = mkdtempSync(join(tmpdir(), "pr-views-hermes-"));
  try {
    const script = join(directory, "smoke.js");
    writeFileSync(script, `
      var create = (0, eval)(${JSON.stringify(`(${createSearchSnapshots.toString()})`)});
      var store = create();
      var notifications = 0;
      var unsubscribe = store.subscribe(function () { notifications++; });
      var first = { pages: [], revision: null };
      store.stage(first);
      if (store.getSnapshot().displayed !== first || notifications !== 1)
        throw new Error('First snapshot was not published');
      unsubscribe();
      store.apply();
      print('snapshot store ready');
    `);
    expect(execFileSync(engine!, [script], { encoding: "utf8", timeout: 10_000 }))
      .toContain("snapshot store ready");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
