/**
 * Rewrites the HTML a GitHub body may carry into the Markdown the renderer
 * already reads.
 *
 * Bots write HTML where Markdown has no equivalent or would be ambiguous:
 * Dependabot wraps every release-notes section in `<details>`, quotes the
 * upstream changelog as `<blockquote><h2>…<ul><li>…`, and links with
 * `<a href><code>@login</code></a>`; a human pastes `<img>` for a resized
 * screenshot or `<br>` for a hard break. GitHub renders both syntaxes into the
 * same page. There is no HTML library reachable from a client bundle, so this
 * walks the tags in order with a small stack and emits the Markdown spelling
 * of each — a heading line, a list marker with the depth's indent, a `> `
 * prefix on every line inside a quote, `[label](href)` around a link.
 *
 * `<details>` and `<summary>` are the exception: Markdown has no spelling for
 * them, so they are emitted back as tags on their own lines, normalised for
 * the parser to pick up as a block.
 *
 * Fenced code and inline code spans pass through untouched, because a tag in
 * them is the text the author meant to show. Only tags GitHub itself allows
 * are recognised, so `<dependency name>` in prose stays as written.
 */

/** HTML GitHub keeps when it sanitises a body; anything else stays text. */
const KNOWN_TAGS = new Set([
  "a", "abbr", "b", "bdo", "blockquote", "br", "caption", "center", "cite", "code", "dd",
  "del", "details", "dfn", "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2", "h3",
  "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li", "mark", "ol", "p", "picture", "pre",
  "q", "s", "samp", "section", "small", "source", "span", "strike", "strong", "sub", "summary",
  "sup", "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "tt", "u", "ul", "var",
  "video",
]);

/** Tags whose start and end each stand between blocks: a line break on both sides. */
const BLOCK_TAGS = new Set([
  "div", "section", "figure", "figcaption", "center", "caption", "thead", "tbody", "tfoot", "dl",
  "dt", "dd", "picture", "video",
]);

/**
 * How many levels of nested quoting `convertSegment` (below) and
 * `parseBlocks` (in `markdown.tsx`) will carry before they stop and treat
 * the remainder as plain text. GitHub itself never visibly nests past a
 * handful of levels, and a hostile body is free to go much further: a
 * single Markdown line of thousands of `>` characters, or thousands of
 * nested `<blockquote>` or `<details>` tags, all comfortably inside a 65 KB
 * GitHub body. Capping the depth keeps `parseBlocks`'s per-level recursion
 * from overflowing the JavaScript stack — there is no error boundary
 * anywhere in `client/`, so that throw would take down the whole board
 * rather than one comment — and keeps this file's own quote-prefix
 * rewriting, repeated once per nesting level on every line inside the
 * quote, from growing with the nesting depth instead of staying flat.
 */
export const MAX_NESTING_DEPTH = 20;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return codePoint(parseInt(body.slice(2), 16), entity);
    }
    if (body.startsWith("#")) return codePoint(parseInt(body.slice(1), 10), entity);
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/**
 * `String.fromCodePoint` throws a RangeError above U+10FFFF, and a body is
 * decoded while the detail panel renders, so `&#x110000;` in a comment anyone
 * can write would take the whole surface down with it. Out of range is not a
 * character, so it stays the text the author wrote.
 */
function codePoint(value: number, entity: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return entity;
  return String.fromCodePoint(value);
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(
    attributes,
  );
  if (match === null) return null;
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

/**
 * A tag. A tag name must be followed by whitespace, `/` or `>`, so
 * `<https://…>` autolinks are not tags either. Sticky (`y`), so testing a
 * position where no tag opens fails right there instead of the engine
 * scanning ahead for wherever the pattern next matches — that unbounded
 * scan is what would turn a body full of stray `<` characters into an O(n²)
 * probe.
 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*?)?\s*\/?>/y;

/** The output ends at the start of a line, past any quote prefix. */
const LINE_START = /\n(?:> )*$/;
/** …or on a line holding only a continuation indent. */
const LINE_INDENT = /(\n(?:> )*) +$/;

interface ListFrame {
  ordered: boolean;
  count: number;
}

/** An HTML table being rewritten as a pipe table, one row at a time. */
interface TableFrame {
  rows: number;
  cells: number;
  inRow: boolean;
}

/**
 * Where the code span opened by a backtick run at `start` closes: the
 * position just past the next run of backticks whose length exactly
 * matches the opener's, found with one forward scan. The single regex this
 * replaces, `` /(`+)[^`\n]*?\1/ ``, matched the same thing with a
 * backreference after a greedy quantifier — quadratic on a long
 * unterminated run, because the engine retries every possible length of
 * the opening run at every position before giving up. Counting run lengths
 * by hand instead visits each character a bounded number of times.
 */
function codeSpanEnd(html: string, start: number): number | null {
  let i = start;
  while (i < html.length && html[i] === "`") i += 1;
  const openLength = i - start;
  while (i < html.length) {
    if (html[i] !== "`") {
      i += 1;
      continue;
    }
    const runStart = i;
    while (i < html.length && html[i] === "`") i += 1;
    if (i - runStart === openLength) return i;
  }
  return null;
}

/**
 * The next token at or after `from`: a code span (reported so the caller
 * can skip over it without reading a tag spelled out inside it as a real
 * one) or a recognised HTML tag. `null` once nothing more matches before
 * the end of the string.
 */
function nextToken(
  html: string,
  from: number,
): { index: number; length: number; isCode: boolean; closing: boolean; name: string; attrs: string } | null {
  let i = from;
  while (i < html.length) {
    if (html[i] === "`") {
      const end = codeSpanEnd(html, i);
      if (end !== null) {
        return { index: i, length: end - i, isCode: true, closing: false, name: "", attrs: "" };
      }
      // No closing run anywhere ahead: this run is not a code span.
      // Skipping past all of it keeps its interior positions from each
      // being retried as their own opener.
      while (i < html.length && html[i] === "`") i += 1;
      continue;
    }
    if (html[i] === "<") {
      TAG.lastIndex = i;
      const match = TAG.exec(html);
      if (match !== null) {
        return {
          index: i,
          length: match[0].length,
          isCode: false,
          closing: match[1] === "/",
          name: match[2] ?? "",
          attrs: match[3] ?? "",
        };
      }
    }
    i += 1;
  }
  return null;
}

/**
 * Converts one stretch of text that is not inside a code fence. The output is
 * Markdown with possibly many blank lines in a row; the parser treats a run of
 * blank lines like one.
 */
function convertSegment(html: string): string {
  let out = "";
  let quoteDepth = 0;
  const lists: ListFrame[] = [];
  const links: Array<string | null> = [];
  const tables: TableFrame[] = [];
  let preDepth = 0;

  // Every newline written inside a blockquote carries the quote's prefix, so
  // the text between tags and the breaks the tags stand for both land inside
  // the quote the parser will read.
  function emit(text: string): void {
    if (quoteDepth === 0) {
      out += text;
      return;
    }
    out += text.replace(/\n/g, `\n${"> ".repeat(quoteDepth)}`);
  }

  /**
   * Starts a new line unless the output is already at the start of one — the
   * source's own newline after `</li>` and the break a tag stands for must
   * not add up to a blank line, which would end the list. A line holding
   * only a continuation indent counts as empty and loses the indent.
   */
  function newline(): void {
    if (out === "" || LINE_START.test(out)) return;
    if (LINE_INDENT.test(out)) {
      out = out.replace(LINE_INDENT, "$1");
      return;
    }
    emit("\n");
  }

  /**
   * A line break that stays inside the open list item: the parser reads an
   * indented line under an item as the item's continuation.
   */
  function lineBreak(): void {
    newline();
    if (lists.length > 0) emit("  ".repeat(lists.length));
  }

  function emitText(text: string): void {
    // Whitespace-only text between block tags is layout, not content: a
    // newline in it is at most a line break, and a space between inline tags
    // is the space between two words.
    if (preDepth === 0 && text.trim() === "") {
      // A pipe table row is one line, whatever the HTML's layout was.
      if (tables[tables.length - 1]?.inRow) return;
      if (text.includes("\n")) newline();
      else emit(text);
      return;
    }
    emit(decodeEntities(text));
  }

  /**
   * One tag, dispatched by name. A long dispatch is the honest shape here:
   * each case is a distinct HTML tag with its own one- or two-line Markdown
   * rewrite, sharing the `emit`/`newline`/`lineBreak` helpers and the
   * `lists`/`links`/`tables`/`quoteDepth` state above, so splitting it into
   * per-tag functions would only replace the switch with an equally long
   * chain of calls carrying that same state between them. The fallthrough
   * groups below (headings, inline-code tags, bold tags) are collapsed into
   * their own guards first, since those really were repetition rather than
   * dispatch.
   */
  // oxlint-disable-next-line complexity -- a tag-name dispatch over N HTML tags is one function by nature; see the doc comment above.
  function onTag(closing: boolean, name: string, attributes: string): void {
    if (preDepth > 0) {
      // Inside <pre>, only its own end matters; the <code> around the
      // contents is the HTML way of saying "this is code", already said.
      if (name === "pre" && closing) {
        preDepth -= 1;
        emit("\n```\n");
      }
      return;
    }
    if (/^h[1-6]$/.test(name)) {
      emit(closing ? "\n\n" : `\n\n${"#".repeat(Number(name[1]))} `);
      return;
    }
    if (name === "code" || name === "tt" || name === "samp" || name === "kbd") {
      emit("`");
      return;
    }
    if (name === "strong" || name === "b") {
      emit("**");
      return;
    }
    switch (name) {
      case "br":
        if (tables[tables.length - 1]?.inRow) emit(" ");
        else lineBreak();
        return;
      case "hr":
        emit("\n\n---\n\n");
        return;
      case "p":
        // Inside a list item, a paragraph is the item's text, not a block of
        // its own.
        if (lists.length > 0) {
          if (closing) lineBreak();
          return;
        }
        emit("\n\n");
        return;
      case "blockquote":
        if (closing) {
          // The line the quote leaves open carries its prefix; drop that so
          // what follows is not quoted with it.
          out = out.replace(LINE_START, "\n");
          quoteDepth = Math.max(0, quoteDepth - 1);
        } else {
          newline();
          quoteDepth = Math.min(MAX_NESTING_DEPTH, quoteDepth + 1);
          out += "> ".repeat(quoteDepth);
        }
        return;
      case "ul":
      case "ol":
        // A nested list continues the item above it, so only the outermost
        // list is set off by a break.
        if (closing) {
          lists.pop();
          if (lists.length === 0) newline();
        } else {
          if (lists.length === 0) newline();
          const start = attribute(attributes, "start");
          lists.push({
            ordered: name === "ol",
            count: start === null || !/^\d+$/.test(start) ? 0 : Number(start) - 1,
          });
        }
        return;
      case "li": {
        if (closing) return;
        const frame = lists[lists.length - 1] ?? { ordered: false, count: 0 };
        frame.count += 1;
        newline();
        emit(`${"  ".repeat(Math.max(0, lists.length - 1))}${frame.ordered ? `${frame.count}.` : "-"} `);
        return;
      }
      case "pre":
        preDepth += 1;
        emit("\n```\n");
        return;
      case "a": {
        if (closing) {
          const href = links.pop() ?? null;
          if (href !== null) emit(`](${href})`);
          return;
        }
        const href = attribute(attributes, "href");
        links.push(href);
        if (href !== null) emit("[");
        return;
      }
      case "img": {
        const src = attribute(attributes, "src");
        if (src === null) return;
        emit(`![${attribute(attributes, "alt") ?? ""}](${src})`);
        return;
      }
      // A table becomes the pipe table the parser reads: the first row is the
      // header whether or not it was <th>, because a pipe table has to have
      // one, and the parser only bolds it.
      case "table":
        newline();
        if (closing) tables.pop();
        else tables.push({ rows: 0, cells: 0, inRow: false });
        return;
      case "tr": {
        const table = tables[tables.length - 1];
        if (table === undefined) return;
        if (closing) {
          table.inRow = false;
          if (table.rows === 0) emit(`\n|${" --- |".repeat(Math.max(1, table.cells))}`);
          table.rows += 1;
          emit("\n");
        } else {
          newline();
          table.inRow = true;
          table.cells = 0;
          emit("| ");
        }
        return;
      }
      case "td":
      case "th": {
        const table = tables[tables.length - 1];
        if (table === undefined || !closing) return;
        table.cells += 1;
        emit(" | ");
        return;
      }
      case "details":
        // Kept as a tag, on its own line, attributes included: `open` decides
        // whether the block starts expanded.
        emit(closing ? "\n</details>\n" : `\n<details${attributes}>\n`);
        return;
      case "summary":
        emit(closing ? "</summary>\n" : "\n<summary>");
        return;
      default:
        if (BLOCK_TAGS.has(name)) newline();
        // Inline tags without a Markdown spelling (em, span, sub, del…) drop
        // away and leave their text.
    }
  }

  let last = 0;
  let searchFrom = 0;
  for (;;) {
    const token = nextToken(html, searchFrom);
    if (token === null) break;
    searchFrom = token.index + token.length;
    const name = token.name.toLowerCase();
    // A code span, or a tag GitHub would strip anyway, is text.
    if (token.isCode || !KNOWN_TAGS.has(name)) continue;
    emitText(html.slice(last, token.index));
    last = token.index + token.length;
    onTag(token.closing, name, token.attrs);
  }
  emitText(html.slice(last));
  return out;
}

/**
 * Rewrites HTML into Markdown across the whole body, leaving fenced code
 * alone. The result is what `parseMarkdown` reads.
 */
export function htmlToMarkdown(source: string): string {
  if (!/<[a-zA-Z]/.test(source)) return source;
  // Fenced code is kept verbatim; everything between fences is converted.
  const segments: Array<{ code: boolean; lines: string[] }> = [{ code: false, lines: [] }];
  let fence: string | null = null;
  source.split("\n").forEach((line) => {
    const current = segments[segments.length - 1] as { code: boolean; lines: string[] };
    if (fence === null) {
      const opening = /^\s*(```|~~~)/.exec(line);
      if (opening === null) {
        current.lines.push(line);
        return;
      }
      fence = opening[1] ?? "```";
      segments.push({ code: true, lines: [line] });
      return;
    }
    current.lines.push(line);
    if (line.trim().startsWith(fence)) {
      fence = null;
      segments.push({ code: false, lines: [] });
    }
  });
  return segments
    .map((segment) =>
      segment.code ? segment.lines.join("\n") : convertSegment(segment.lines.join("\n")),
    )
    .join("\n");
}
