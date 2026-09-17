#!/usr/bin/env node
// Rule: no source file over 400 lines.
//
// This codebase documents heavily and deliberately (see CLAUDE.md): a file
// earns its length from JSDoc-style explanation of *why*, not from doing
// more. Counting every raw line would punish that documentation, so the
// limit is measured in code lines only (see scripts/lib/scan.mjs
// `classify`): a line that is entirely comment or blank is free, and only a
// line containing at least one character of real code, a string, or a regex
// literal counts against the limit.
const MAX_CODE_LINES = 400;

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { listSourceFiles, classify, isBlankOrCommentLine } from "./lib/scan.mjs";

const ROOT = process.cwd();
const roots = ["client", "server", "shared"].map((d) => `${ROOT}/${d}`);
const files = listSourceFiles(roots, [".ts", ".tsx"]);
for (const extra of ["index.client.tsx", "index.server.ts"]) {
  files.push(`${ROOT}/${extra}`);
}

const violations = [];
for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue; // listed but not yet created (root entry files are optional here)
  }
  const mask = classify(source);
  const lines = source.split("\n");
  let codeLines = 0;
  let overflowLine = null;
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineMask = mask.slice(offset, offset + line.length);
    if (!isBlankOrCommentLine(line, lineMask)) {
      codeLines++;
      if (codeLines === MAX_CODE_LINES + 1 && overflowLine === null) {
        overflowLine = i + 1;
      }
    }
    offset += line.length + 1; // +1 for the newline split away
  }
  if (codeLines > MAX_CODE_LINES) {
    violations.push({ file: relative(ROOT, file), codeLines, overflowLine });
  }
}

if (violations.length === 0) {
  console.log("max-lines: ok (no file exceeds 400 code lines)");
  process.exit(0);
}

console.error(`max-lines: ${violations.length} file(s) exceed ${MAX_CODE_LINES} code lines`);
for (const v of violations) {
  console.error(
    `  ${v.file}:${v.overflowLine}: ${v.codeLines} code lines (limit ${MAX_CODE_LINES}); overflow starts here`,
  );
}
process.exit(1);
