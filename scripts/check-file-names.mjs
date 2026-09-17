#!/usr/bin/env node
// Rule: every source file is named in lowercase kebab-case.
//
// `github-board.tsx`, never `GitHubBoard.tsx`. The reason is not taste: the
// repository is developed on Linux and consumed on macOS and Windows, whose
// filesystems are case-insensitive by default, so a rename that only changes
// case is invisible to git there and a stale import keeps resolving on one
// machine while failing on another. Holding every name to one case removes
// the class of bug entirely, and makes an import path predictable from the
// module it points at.
//
// The two runtime entries Paseo requires are the only fixed names, and they
// already obey the rule; they are listed rather than special-cased so the
// intent is readable.
const ENTRY_FILES = ["index.client.tsx", "index.server.ts"];

// A leading lowercase letter or digit, then lowercase letters, digits and
// hyphens. Dots are allowed before the extension so a compound suffix such as
// `.styles.ts` or `.test.ts` stays legal; two dots in a row are not.
const NAME_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*\.[a-z]+$/;

import { relative } from "node:path";
import { listSourceFiles } from "./lib/scan.mjs";

const ROOT = process.cwd();
const roots = ["client", "server", "shared", "scripts"].map((d) => `${ROOT}/${d}`);
const files = listSourceFiles(roots, [".ts", ".tsx", ".mjs", ".js"]);
for (const entry of ENTRY_FILES) {
  files.push(`${ROOT}/${entry}`);
}

const violations = [];
for (const file of files) {
  const path = relative(ROOT, file);
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (!NAME_PATTERN.test(name)) {
    violations.push(`  ${path}: "${name}" is not lowercase kebab-case`);
  }
}

if (violations.length > 0) {
  console.error(`file-names: ${violations.length} file(s) break the naming rule`);
  for (const violation of violations) console.error(violation);
  console.error("  expected names like github-board.tsx, use-board-query.tsx, board.styles.ts");
  process.exit(1);
}

console.log("file-names: ok (every source file is lowercase kebab-case)");
