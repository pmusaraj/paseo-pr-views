import { htmlToMarkdown, MAX_NESTING_DEPTH } from "./html";

/**
 * Parses the Markdown an issue body is written in into the block tree
 * `markdown.tsx` renders.
 *
 * A client bundle may import only the modules the host provides, so no
 * Markdown library is reachable from here. Rather than dump raw Markdown in
 * the panel, this covers the handful of constructs an issue or pull request
 * body actually uses — headings, lists, task lists, fenced code, quotes,
 * rules, collapsible details, and bold, code and links inline — and treats
 * anything else as a plain paragraph. Tables become rows of cells, because a
 * side-by-side of screenshots is one. HTML is rewritten into the Markdown
 * spelling first (`html.tsx`), because a bot's body — Dependabot's, most of
 * all — is written in it.
 *
 * This module carries no React or React Native import on purpose: it is pure
 * parsing, kept separate from `markdown.tsx`'s rendering so it can be
 * exercised directly in a test without pulling react-native's Flow-typed
 * sources into the test runner.
 */

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: ListItem[] }
  | { kind: "code"; text: string }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "rule" }
  | { kind: "details"; summary: string; open: boolean; blocks: Block[] }
  | { kind: "image"; alt: string; url: string }
  | { kind: "table"; header: string[]; rows: string[][] };

/**
 * `<details>` on a line of its own, as `htmlToMarkdown` leaves it. The
 * attributes survive because `open` decides whether it starts expanded.
 */
const DETAILS_OPEN = /^\s*<details\b([^>]*)>\s*$/i;
const DETAILS_CLOSE = /^\s*<\/details>\s*$/i;
const SUMMARY_LINE = /^\s*<summary>([\s\S]*?)<\/summary>\s*$/i;
/**
 * A link reference definition, `[label]: url`. GitHub shows none of them, and
 * `[//]: # (comment)` is the idiom bots use for a comment.
 */
const REFERENCE_DEFINITION = /^\s*\[[^\]]+\]:\s+\S/;

interface ListItem {
  marker: string;
  /** Nesting depth from the item's indentation, two spaces per level. */
  depth: number;
  text: string;
}

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
/**
 * A line that is one image and nothing else, in either spelling GitHub
 * accepts: Markdown, or the `<img>` tag its editor pastes for a resized one.
 * Only a whole line becomes an image block; an image inside a sentence stays
 * a link, because there is no inline image in a `Text`.
 */
const IMAGE_LINE = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
const IMG_TAG_LINE = /^\s*<img\b([^>]*)>\s*$/i;

/**
 * A pipe table, GitHub's only table syntax: a header row, a `|---|` line, then
 * rows. Cells are split on unescaped pipes; a cell may be any inline text, or
 * an image, which is what most tables in a review thread are for.
 *
 * The leading `\s*(?:\|\s*)?` reads as one greedy run of whitespace followed
 * by an optional pipe and its own whitespace, rather than the `\s*\|?\s*` a
 * table separator's own syntax first suggests: two adjacent `\s*` around an
 * optional literal both need to explain the same missing pipe, which is
 * exactly the ambiguity that made rejecting a long whitespace-only line
 * (no pipe, no dash, so the whole pattern fails) quadratic — the engine
 * retried every way of splitting the run between the two groups before
 * giving up. A single greedy prefix has only one way to split.
 */
export const TABLE_SEPARATOR = /^\s*(?:\|\s*)?:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export function imageOf(line: string): { alt: string; url: string } | null {
  const markdown = IMAGE_LINE.exec(line);
  if (markdown !== null) return { alt: markdown[1] ?? "", url: markdown[2] ?? "" };
  const tag = IMG_TAG_LINE.exec(line);
  if (tag === null) return null;
  const attributes = tag[1] ?? "";
  const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes);
  if (src === null) return null;
  const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(attributes);
  return { alt: alt?.[1] ?? "", url: src[1] ?? "" };
}
const TASK_PREFIX = /^\[([ xX])\]\s+/;

function listItemOf(line: string): ListItem | null {
  const match = LIST_LINE.exec(line);
  if (match === null) return null;
  const indent = match[1] ?? "";
  const marker = match[2] ?? "-";
  let text = match[3] ?? "";
  let glyph = /^\d/.test(marker) ? marker.replace(")", ".") : "•";
  const task = TASK_PREFIX.exec(text);
  if (task !== null) {
    glyph = task[1] === " " ? "☐" : "☑";
    text = text.slice(task[0].length);
  }
  return { marker: glyph, depth: Math.floor(indent.replace(/\t/g, "  ").length / 2), text };
}

/**
 * Collects a fenced code block's own lines, starting just after the opening
 * fence, up to (and past) the line that closes it.
 */
function consumeFence(lines: string[], start: number, fence: string): { text: string; next: number } {
  let index = start;
  const code: string[] = [];
  while (index < lines.length && !(lines[index] ?? "").trim().startsWith(fence)) {
    code.push(lines[index] ?? "");
    index += 1;
  }
  index += 1; // the closing fence, if there was one
  return { text: code.join("\n"), next: index };
}

/**
 * Collects a `<details>` block's own lines, starting just after the opening
 * tag, up to the `</details>` that matches it past any nested pair.
 */
function consumeDetailsBody(lines: string[], start: number): { body: string[]; next: number } {
  let index = start;
  const body: string[] = [];
  let depth = 1;
  while (index < lines.length && depth > 0) {
    const inner = lines[index] ?? "";
    index += 1;
    if (DETAILS_OPEN.test(inner)) depth += 1;
    else if (DETAILS_CLOSE.test(inner)) depth -= 1;
    if (depth > 0) body.push(inner);
  }
  return { body, next: index };
}

/** Collects a pipe table's data rows, starting just after its header separator. */
function consumeTableRows(lines: string[], start: number): { rows: string[][]; next: number } {
  let index = start;
  const rows: string[][] = [];
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.includes("|") || line.trim() === "") break;
    rows.push(tableCells(line));
    index += 1;
  }
  return { rows, next: index };
}

/**
 * Splits the source into blocks. HTML comments go first — they are how issue
 * templates carry their instructions, and GitHub does not show them either —
 * then the HTML that remains is rewritten as Markdown.
 */
export function parseMarkdown(source: string): Block[] {
  const markdown = htmlToMarkdown(
    source.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, ""),
  );
  return parseBlocks(markdown.split("\n").filter((line) => !REFERENCE_DEFINITION.test(line)));
}

/**
 * Everything is decided line by line: a fence opens a code block that runs to
 * the next fence, `<details>` opens a block that runs to its `</details>`, a
 * blank line ends whatever else is open, and any line that is not a heading,
 * list item, quote or rule is paragraph text. Quotes and details hold blocks
 * of their own, parsed by the same rules.
 *
 * A long dispatch is the honest shape for a line-based scanner like this one:
 * every branch below is a distinct Markdown construct with its own single
 * line of detection logic, and splitting the dispatch itself across files
 * would only replace one long function with a chain of calls carrying the
 * same `index`/`paragraph`/`list`/`quote` state between them. The three
 * multi-line constructs (fenced code, `<details>`, tables) already extract
 * into their own named helpers above; what is left is the dispatch itself.
 */
// oxlint-disable-next-line complexity -- a line-based dispatch over N block kinds is one function by nature; see the doc comment above.
function parseBlocks(lines: string[], depth = 0): Block[] {
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let list: ListItem[] = [];
  let quote: string[] = [];

  function flush(): void {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
    if (list.length > 0) {
      blocks.push({ kind: "list", items: list });
      list = [];
    }
    if (quote.length > 0) {
      // Past the cap, the remainder is literal text with no further
      // wrapping, rather than one more recursive call: see
      // MAX_NESTING_DEPTH's doc comment in html.tsx for why a hostile body
      // needs that limit.
      if (depth >= MAX_NESTING_DEPTH) {
        blocks.push({ kind: "paragraph", text: quote.join("\n") });
      } else {
        blocks.push({ kind: "quote", blocks: parseBlocks(quote, depth + 1) });
      }
      quote = [];
    }
  }

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    index += 1;

    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence !== null) {
      flush();
      const { text, next } = consumeFence(lines, index, fence[1] ?? "```");
      index = next;
      blocks.push({ kind: "code", text });
      continue;
    }

    const details = DETAILS_OPEN.exec(line);
    if (details !== null) {
      flush();
      const { body, next } = consumeDetailsBody(lines, index);
      index = next;
      const first = body.findIndex((inner) => inner.trim() !== "");
      const summary = first === -1 ? null : SUMMARY_LINE.exec(body[first] ?? "");
      if (summary !== null) body.splice(first, 1);
      if (depth >= MAX_NESTING_DEPTH) {
        blocks.push({ kind: "paragraph", text: body.join("\n") });
      } else {
        blocks.push({
          kind: "details",
          // "Details" is what a browser shows for a <details> with no summary.
          summary: summary?.[1]?.trim() || "Details",
          open: /\bopen\b/i.test(details[1] ?? ""),
          blocks: parseBlocks(body, depth + 1),
        });
      }
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      flush();
      blocks.push({ kind: "heading", level: (heading[1] ?? "#").length, text: heading[2] ?? "" });
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }

    const image = imageOf(line);
    if (image !== null) {
      flush();
      blocks.push({ kind: "image", ...image });
      continue;
    }

    if (line.includes("|") && line.trim() !== "" && TABLE_SEPARATOR.test(lines[index] ?? "")) {
      flush();
      const header = tableCells(line);
      index += 1; // the separator
      const { rows, next } = consumeTableRows(lines, index);
      index = next;
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const item = listItemOf(line);
    if (item !== null) {
      if (paragraph.length > 0 || quote.length > 0) flush();
      list.push(item);
      continue;
    }

    if (line.startsWith(">")) {
      if (paragraph.length > 0 || list.length > 0) flush();
      quote.push(line.replace(/^>\s?/, ""));
      continue;
    }

    // A wrapped continuation of the list item above it, which GitHub also
    // treats as the item's text rather than as a new paragraph.
    if (list.length > 0 && /^\s+/.test(line)) {
      const last = list[list.length - 1];
      if (last !== undefined) last.text = `${last.text}\n${line.trim()}`;
      continue;
    }

    if (list.length > 0 || quote.length > 0) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}
