#!/usr/bin/env node
// Rule: no duplicate functions ("não pode ter funções duplicadas").
//
// Finds function declarations, named function expressions, object/class
// method shorthand, and block-bodied arrow functions across the repository,
// normalises each body (strips comments, then strips all remaining
// whitespace, so reformatting cannot hide or manufacture a duplicate), and
// hashes the result. Two functions whose hashes collide have byte-identical
// logic and are reported together.
//
// A duplicate body under this many *lines* is very likely two short guards
// or getters that coincide by chance (`return null;`, a one-line default),
// not real duplication worth extracting into a shared helper. Line count in
// the original body is used as a cheap proxy for statement count: this is a
// one-statement-per-line codebase by convention, so it tracks well enough
// without a real statement-level parse.
const MIN_BODY_LINES = 4;

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { createHash } from "node:crypto";
import {
  listSourceFiles,
  classify,
  findMatchingBracket,
  skipToBodyBrace,
  skipToArrowBrace,
  lineOf,
  CATEGORY,
} from "./lib/scan.mjs";

// Names that can precede `(...)  {` the same way a method does, but are
// control flow rather than a function definition. Filtering on the name
// this way (rather than trying to perfectly recognise declaration context)
// is what keeps the method-shorthand scan below simple.
const NOT_A_METHOD_NAME = new Set([
  "if", "for", "while", "switch", "catch", "do", "with", "else", "function",
  "return", "yield", "typeof", "new", "delete", "void", "in", "of",
  "instanceof", "try", "finally", "throw", "case", "default",
]);

const MODIFIER_KEYWORDS =
  "(?:public|private|protected|readonly|static|async|override|get|set)";

const FUNCTION_KEYWORD_RE = /\bfunction\b(\s*\*)?\s*([A-Za-z_$][\w$]*)?\s*(<[^<>(]*>)?\s*\(/g;
const METHOD_SHORTHAND_RE = new RegExp(
  `(^|[{;,}])[ \\t]*(${MODIFIER_KEYWORDS}\\s+)*(\\*\\s*)?([A-Za-z_$][\\w$]*)\\s*(<[^<>(]*>)?\\s*\\(`,
  "gm",
);

function isAllCode(mask, start, end) {
  for (let i = start; i < end; i++) if (mask[i] !== CATEGORY.CODE) return false;
  return true;
}

function normalizeBody(source, mask, start, end) {
  let out = "";
  for (let i = start; i < end; i++) {
    if (mask[i] === CATEGORY.COMMENT) continue;
    if (/\s/.test(source[i])) continue;
    out += source[i];
  }
  return out;
}

function bodyLineSpan(source, start, end) {
  return lineOf(source, end) - lineOf(source, start) + 1;
}

function findCandidates(file, source) {
  const mask = classify(source);
  const claimed = new Set(); // body-open indices already reported, to dedupe overlapping scans
  const candidates = [];

  const addCandidate = (label, openBrace) => {
    if (claimed.has(openBrace)) return;
    const closeBrace = findMatchingBracket(source, mask, openBrace, "{", "}");
    if (closeBrace === -1) return;
    claimed.add(openBrace);
    const bodyStart = openBrace + 1;
    const bodyEnd = closeBrace;
    if (bodyEnd <= bodyStart) return;
    if (bodyLineSpan(source, bodyStart, bodyEnd) < MIN_BODY_LINES) return;
    const normalized = normalizeBody(source, mask, bodyStart, bodyEnd);
    if (normalized.length === 0) return;
    const hash = createHash("sha256").update(normalized).digest("hex");
    candidates.push({ file, line: lineOf(source, openBrace), label, hash });
  };

  // Function declarations and expressions, named or anonymous.
  for (const match of source.matchAll(FUNCTION_KEYWORD_RE)) {
    const end = match.index + match[0].length;
    if (!isAllCode(mask, match.index, end)) continue;
    const openParen = end - 1;
    const closeParen = findMatchingBracket(source, mask, openParen, "(", ")");
    if (closeParen === -1) continue;
    const bodyBrace = skipToBodyBrace(source, mask, closeParen + 1);
    if (bodyBrace === -1) continue;
    const name = match[2] ?? "<anonymous function>";
    addCandidate(`function ${name}()`, bodyBrace);
  }

  // Object/class method shorthand.
  for (const match of source.matchAll(METHOD_SHORTHAND_RE)) {
    const end = match.index + match[0].length;
    if (!isAllCode(mask, match.index, end)) continue;
    const name = match[4];
    if (NOT_A_METHOD_NAME.has(name)) continue;
    const openParen = end - 1;
    const closeParen = findMatchingBracket(source, mask, openParen, "(", ")");
    if (closeParen === -1) continue;
    const bodyBrace = skipToBodyBrace(source, mask, closeParen + 1);
    if (bodyBrace === -1) continue;
    addCandidate(`method ${name}()`, bodyBrace);
  }

  // Block-bodied arrow functions, named or inline.
  for (let i = 0; i < source.length - 1; i++) {
    if (mask[i] !== CATEGORY.CODE || source[i] !== "=" || source[i + 1] !== ">") continue;
    const bodyBrace = skipToArrowBrace(source, mask, i);
    if (bodyBrace === -1) continue;
    const lineStart = source.lastIndexOf("\n", i) + 1;
    const lineEnd = source.indexOf("\n", i);
    const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim();
    const label = line.length > 70 ? `${line.slice(0, 67)}...` : line;
    addCandidate(`arrow: ${label}`, bodyBrace);
  }

  return candidates;
}

const ROOT = process.cwd();
const roots = ["client", "server", "shared"].map((d) => `${ROOT}/${d}`);
const files = listSourceFiles(roots, [".ts", ".tsx"]);
for (const extra of ["index.client.tsx", "index.server.ts"]) {
  files.push(`${ROOT}/${extra}`);
}

const byHash = new Map();
for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const candidate of findCandidates(relative(ROOT, file), source)) {
    if (!byHash.has(candidate.hash)) byHash.set(candidate.hash, []);
    byHash.get(candidate.hash).push(candidate);
  }
}

const groups = [...byHash.values()].filter((g) => g.length >= 2);
// Stable, readable order: by file of the first occurrence.
groups.sort((a, b) => a[0].file.localeCompare(b[0].file) || a[0].line - b[0].line);

if (groups.length === 0) {
  console.log("duplicate-functions: ok (no identical function bodies found)");
  process.exit(0);
}

console.error(`duplicate-functions: ${groups.length} duplicate group(s) found`);
for (const group of groups) {
  console.error("  duplicate body:");
  for (const occ of group) {
    console.error(`    ${occ.file}:${occ.line}: ${occ.label}`);
  }
}
process.exit(1);
