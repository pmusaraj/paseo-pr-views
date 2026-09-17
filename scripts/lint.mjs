#!/usr/bin/env node
// Runs every project lint check and reports all of them, rather than
// stopping at the first failure: a reviewer wants the whole picture from
// one `npm run lint`, not four separate invocations.
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

const steps = [
  { name: "file-names", command: ["node", "scripts/check-file-names.mjs"] },
  { name: "max-lines", command: ["node", "scripts/check-max-lines.mjs"] },
  { name: "duplicate-functions", command: ["node", "scripts/check-duplicate-functions.mjs"] },
  { name: "import-boundaries", command: ["node", "scripts/check-import-boundaries.mjs"] },
  {
    name: "oxlint",
    command: ["node_modules/.bin/oxlint", "--type-aware", "."],
  },
];

let failed = false;
for (const step of steps) {
  console.log(`\n> ${step.name}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) failed = true;
}

console.log(`\nlint: ${failed ? "FAILED" : "ok"}`);
process.exit(failed ? 1 : 0);
