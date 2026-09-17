// A hand-rolled TypeScript/TSX tokenizer shared by this repository's own lint
// checks (see ../check-*.mjs). It is deliberately not a real parser: the four
// project rules it backs only need two facts about a source file — which
// characters are inside a comment versus real code, and where a `{` block
// that starts at a given index actually ends — so a full AST is weight these
// checks do not need. Everything below exists to answer those two questions
// correctly in the presence of strings, template literals with `${}`
// interpolation, and regex literals (all of which can contain `{`, `}`, `/`
// or `//` that must not be mistaken for real code or the start of a comment).
//
// Known limitation: JSX text nodes (the text between `>` and `<` in TSX) are
// classified as ordinary code, not as opaque text, because this tokenizer
// has no notion of JSX at all. A literal unescaped `}` in JSX text would
// therefore be miscounted as closing a brace. In practice this codebase's
// JSX text is prose, not stray punctuation, so the risk is theoretical; a
// real parser would remove it, at the cost of the dependency this repo does
// not want for four rules.

import { readdirSync } from "node:fs";
import { join, extname } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "result", "dist", "build"]);

/** Recursively lists files under `roots` whose extension is in `extensions`. */
export function listSourceFiles(roots, extensions) {
  const out = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // the directory does not exist yet (e.g. a sibling hasn't created it)
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (extensions.includes(extname(entry.name))) {
        out.push(full);
      }
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export const CATEGORY = { CODE: "X", OPAQUE: "O", COMMENT: "C" };

// A `/` right after one of these words starts a regex literal, not a
// division: each of them is a keyword that is always followed by an
// expression, never by a value that could itself be divided.
const REGEX_PRECEDING_WORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "yield", "throw", "case", "do", "else", "extends",
]);
// A `/` right after `)` or `]` is division far more often than not (closing
// a call, an index, or a grouped expression that produced a value); every
// other preceding punctuation can only be followed by a value, so `/` there
// starts a regex.
const DIVISION_ONLY_PUNCT = new Set([")", "]"]);

/**
 * Classifies every character of `source` as `COMMENT`, `OPAQUE` (string or
 * template text, or a regex literal — real code, but its `{`/`}` do not
 * participate in brace matching), or `CODE`. A `${}` template interpolation
 * is real code, so the two characters that open and close it are `CODE` and
 * their contents are classified again from scratch.
 */
export function classify(source) {
  const n = source.length;
  // Pre-sized on purpose: every index is written exactly once below, never
  // grown or read before being set.
  // oxlint-disable-next-line unicorn/no-new-array
  const mask = new Array(n);
  const braceStack = []; // "brace" | "templateExpr", pushed on `{` / `${`
  let mode = "code";
  let stringQuote = null;
  let prevWord = ""; // last identifier/keyword seen in code mode
  let prevPunct = ""; // last non-space punctuation char seen in code mode

  const isRegexPosition = () => {
    if (prevPunct === "" && prevWord === "") return true; // start of file/expression
    if (prevWord !== "") return REGEX_PRECEDING_WORDS.has(prevWord);
    return !DIVISION_ONLY_PUNCT.has(prevPunct);
  };

  let i = 0;
  while (i < n) {
    const c = source[i];
    const c2 = i + 1 < n ? source[i + 1] : "";

    if (mode === "line-comment") {
      mask[i] = CATEGORY.COMMENT;
      if (c === "\n") mode = "code";
      i++;
      continue;
    }
    if (mode === "block-comment") {
      mask[i] = CATEGORY.COMMENT;
      if (c === "*" && c2 === "/") {
        mask[i + 1] = CATEGORY.COMMENT;
        mode = "code";
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (mode === "string") {
      mask[i] = CATEGORY.OPAQUE;
      if (c === "\\") {
        if (i + 1 < n) mask[i + 1] = CATEGORY.OPAQUE;
        i += 2;
        continue;
      }
      if (c === stringQuote) mode = "code";
      i++;
      continue;
    }
    if (mode === "template") {
      if (c === "\\") {
        mask[i] = CATEGORY.OPAQUE;
        if (i + 1 < n) mask[i + 1] = CATEGORY.OPAQUE;
        i += 2;
        continue;
      }
      if (c === "`") {
        mask[i] = CATEGORY.OPAQUE;
        mode = "code";
        i++;
        continue;
      }
      if (c === "$" && c2 === "{") {
        mask[i] = CATEGORY.CODE;
        mask[i + 1] = CATEGORY.CODE;
        braceStack.push("templateExpr");
        mode = "code";
        prevPunct = "{";
        prevWord = "";
        i += 2;
        continue;
      }
      mask[i] = CATEGORY.OPAQUE;
      i++;
      continue;
    }
    if (mode === "regex" || mode === "regex-class") {
      mask[i] = CATEGORY.OPAQUE;
      if (c === "\\") {
        if (i + 1 < n) mask[i + 1] = CATEGORY.OPAQUE;
        i += 2;
        continue;
      }
      if (mode === "regex" && c === "[") {
        mode = "regex-class";
        i++;
        continue;
      }
      if (mode === "regex-class" && c === "]") {
        mode = "regex";
        i++;
        continue;
      }
      if (mode === "regex" && c === "/") {
        i++;
        while (i < n && /[a-z]/i.test(source[i])) {
          mask[i] = CATEGORY.OPAQUE;
          i++;
        }
        mode = "code";
        continue;
      }
      if (c === "\n") {
        mode = "code"; // unterminated regex on this line; do not eat the rest of the file
        continue;
      }
      i++;
      continue;
    }

    // mode === "code"
    if (c === "/" && c2 === "/") {
      mask[i] = CATEGORY.COMMENT;
      mask[i + 1] = CATEGORY.COMMENT;
      mode = "line-comment";
      i += 2;
      continue;
    }
    if (c === "/" && c2 === "*") {
      mask[i] = CATEGORY.COMMENT;
      mask[i + 1] = CATEGORY.COMMENT;
      mode = "block-comment";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      mask[i] = CATEGORY.OPAQUE;
      mode = "string";
      stringQuote = c;
      i++;
      continue;
    }
    if (c === "`") {
      mask[i] = CATEGORY.OPAQUE;
      mode = "template";
      i++;
      continue;
    }
    if (c === "/" && isRegexPosition()) {
      mask[i] = CATEGORY.OPAQUE;
      mode = "regex";
      i++;
      continue;
    }
    if (c === "{") {
      mask[i] = CATEGORY.CODE;
      braceStack.push("brace");
      prevPunct = "{";
      prevWord = "";
      i++;
      continue;
    }
    if (c === "}") {
      mask[i] = CATEGORY.CODE;
      const top = braceStack.pop();
      if (top === "templateExpr") mode = "template";
      prevPunct = "}";
      prevWord = "";
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      mask[i] = CATEGORY.CODE;
      i++;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j++;
      for (let k = i; k < j; k++) mask[k] = CATEGORY.CODE;
      prevWord = source.slice(i, j);
      prevPunct = "";
      i = j;
      continue;
    }
    mask[i] = CATEGORY.CODE;
    prevPunct = c;
    prevWord = "";
    i++;
  }
  return mask.join("");
}

/** True when a line has no character classified as real code or string/regex text. */
export function isBlankOrCommentLine(lineText, lineMask) {
  for (let i = 0; i < lineText.length; i++) {
    if (/\s/.test(lineText[i])) continue;
    if (lineMask[i] !== CATEGORY.COMMENT) return false;
  }
  return true;
}

/**
 * Finds the index of the bracket matching the one at `openIndex`, counting
 * only characters classified as `CODE` in `mask` (so a bracket char inside a
 * string, comment, or regex literal is correctly ignored).
 */
export function findMatchingBracket(source, mask, openIndex, openChar, closeChar) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (mask[i] !== CATEGORY.CODE) continue;
    if (source[i] === openChar) depth++;
    else if (source[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Scans forward from `fromIndex` (just past a parameter list's `)`) to the
 * `{` that opens a function body, skipping an optional return-type
 * annotation. Returns -1 if a `;` is hit first (an ambient declaration or
 * overload signature with no body).
 */
export function skipToBodyBrace(source, mask, fromIndex) {
  let i = fromIndex;
  let angle = 0;
  let paren = 0;
  let bracket = 0;
  while (i < source.length) {
    if (mask[i] !== CATEGORY.CODE) {
      i++;
      continue;
    }
    const c = source[i];
    if (c === "<") angle++;
    else if (c === ">" && angle > 0) angle--;
    else if (c === "(") paren++;
    else if (c === ")" && paren > 0) paren--;
    else if (c === "[") bracket++;
    else if (c === "]" && bracket > 0) bracket--;
    else if (c === "{" && angle === 0 && paren === 0 && bracket === 0) return i;
    else if (c === ";" && angle === 0 && paren === 0 && bracket === 0) return -1;
    i++;
  }
  return -1;
}

/**
 * Scans forward from `fromIndex` for a depth-0 `=>` followed by `{`, the
 * shape of an arrow function with a block body. Returns -1 for an
 * expression-bodied arrow (no `{` right after `=>`) or if none is found.
 */
export function skipToArrowBrace(source, mask, fromIndex) {
  let i = fromIndex;
  let angle = 0;
  let paren = 0;
  let bracket = 0;
  while (i < source.length - 1) {
    if (mask[i] !== CATEGORY.CODE) {
      i++;
      continue;
    }
    const c = source[i];
    if (c === "<") angle++;
    else if (c === ">" && angle > 0) angle--;
    else if (c === "(") paren++;
    else if (c === ")" && paren > 0) paren--;
    else if (c === "[") bracket++;
    else if (c === "]" && bracket > 0) bracket--;
    else if (c === "=" && source[i + 1] === ">" && angle === 0 && paren === 0 && bracket === 0) {
      let j = i + 2;
      while (j < source.length && /\s/.test(source[j])) j++;
      return j < source.length && source[j] === "{" && mask[j] === CATEGORY.CODE ? j : -1;
    }
    i++;
  }
  return -1;
}

/** 1-based line number of `index` within `source`. */
export function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}
