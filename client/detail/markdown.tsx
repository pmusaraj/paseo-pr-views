import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { imageOf, parseMarkdown, type Block } from "./markdown-parse";

/**
 * A small renderer for the Markdown an issue body is written in.
 *
 * Parsing lives in `markdown-parse.ts`, kept free of React and React Native
 * imports so it can be exercised directly in a test; this module turns the
 * block tree that produces into the `Text`/`View` tree the panel actually
 * shows. Nested emphasis is left as the text it was written as; the panel's
 * **Open on GitHub** button is there for the rest.
 *
 * Single newlines break lines, the way GitHub renders an issue body (its
 * comment flavour of GFM turns a newline into `<br>`), so a paragraph keeps
 * the author's line breaks instead of reflowing them.
 */

/** The styles the renderer needs; the surface's `useStyles` provides them. */
export interface MarkdownStyles {
  mdParagraph: object;
  mdHeading: object;
  mdHeadingLarge: object;
  mdListRow: object;
  mdListMarker: object;
  mdListText: object;
  mdCodeBlock: object;
  mdCodeText: object;
  mdQuote: object;
  mdRule: object;
  mdBold: object;
  mdInlineCode: object;
  mdLink: object;
  mdTable: object;
  mdTableRow: object;
  mdTableCell: object;
  mdTableHeader: object;
  /** Blocks nested inside a quote or a details block, spaced like the body. */
  mdNested: object;
  mdDetailsSummary: object;
  mdDetailsMarker: object;
}

/**
 * Bold, inline code, links and images, in one pass. An image becomes a link
 * to itself, named after its alt text, because the panel cannot show it and a
 * bare URL would say nothing about what it was.
 */
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|!?\[[^\]\n]*\]\([^)\s]+\))/g;

function renderInline(
  text: string,
  styles: MarkdownStyles,
  onOpenLink: (url: string) => void,
): ReactNode[] {
  // Splitting on a capturing group interleaves plain text (even indexes) with
  // the tokens it matched (odd indexes). `.map` rather than a loop, because a
  // link's press handler closes over its URL and a closure made in a `for…of`
  // body captures the binding's final value under Hermes.
  return text.split(INLINE).map((part, index) => {
    if (index % 2 === 0 || part === "") return part;
    if (part.startsWith("`")) {
      return (
        <Text key={index} style={styles.mdInlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith("**") || part.startsWith("__")) {
      return (
        <Text key={index} style={styles.mdBold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    const link = /^(!?)\[([^\]]*)\]\(([^)]+)\)$/.exec(part);
    const url = link?.[3] ?? part;
    const label = link?.[2] === undefined || link[2] === "" ? url : link[2];
    // A label may itself be code or bold — `<a><code>@login</code></a>` is
    // how release notes credit an author — so it goes through the same pass.
    return (
      <Text key={index} accessibilityRole="link" style={styles.mdLink} onPress={() => onOpenLink(url)}>
        {link?.[1] === "!" ? `[image: ${label}]` : renderInline(label, styles, onOpenLink)}
      </Text>
    );
  });
}

interface RenderContext {
  styles: MarkdownStyles;
  /** Every link goes through the caller, which knows how to leave the app. */
  onOpenLink: (url: string) => void;
  /**
   * Draws an image that stands on its own line. The caller owns it because
   * fetching one may need the daemon; this module only knows the URL.
   */
  renderImage: (image: { url: string; alt: string }) => ReactNode;
}

/**
 * A `<details>` block: the summary is a row that toggles the body, collapsed
 * unless the author wrote `open`, which is how GitHub shows it too.
 */
function DetailsBlock({
  summary,
  open,
  blocks,
  context,
}: {
  summary: string;
  open: boolean;
  blocks: Block[];
  context: RenderContext;
}) {
  const [expanded, setExpanded] = useState(open);
  const { styles } = context;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.mdDetailsSummary}
        onPress={() => setExpanded((value) => !value)}
      >
        <Text style={styles.mdDetailsMarker}>{expanded ? "▾" : "▸"}</Text>
        <Text style={[styles.mdParagraph, styles.mdListText]}>
          {renderInline(summary, styles, context.onOpenLink)}
        </Text>
      </Pressable>
      {expanded ? <View style={styles.mdNested}>{renderBlocks(blocks, context)}</View> : null}
    </View>
  );
}

export function MarkdownBody({
  source,
  styles,
  onOpenLink,
  renderImage,
}: { source: string } & RenderContext) {
  return <>{renderBlocks(parseMarkdown(source), { styles, onOpenLink, renderImage })}</>;
}

function renderBlocks(blocks: Block[], context: RenderContext): ReactNode[] {
  const { styles, onOpenLink, renderImage } = context;
  // `.map`, not `for…of`: a closure made in a loop body captures the binding's
  // final value under Hermes, and every link handler here is one.
  return blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <Text
                key={index}
                accessibilityRole="header"
                style={block.level <= 2 ? styles.mdHeadingLarge : styles.mdHeading}
              >
                {renderInline(block.text, styles, onOpenLink)}
              </Text>
            );
          case "list":
            return (
              <View key={index}>
                {block.items.map((item, itemIndex) => (
                  <View
                    key={itemIndex}
                    style={[styles.mdListRow, { paddingLeft: item.depth * 16 }]}
                  >
                    <Text style={styles.mdListMarker}>{item.marker}</Text>
                    <Text style={[styles.mdParagraph, styles.mdListText]}>
                      {renderInline(item.text, styles, onOpenLink)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case "code":
            return (
              <View key={index} style={styles.mdCodeBlock}>
                <Text style={styles.mdCodeText}>{block.text}</Text>
              </View>
            );
          case "quote":
            return (
              <View key={index} style={[styles.mdQuote, styles.mdNested]}>
                {renderBlocks(block.blocks, context)}
              </View>
            );
          case "rule":
            return <View key={index} style={styles.mdRule} />;
          case "details":
            return (
              <DetailsBlock
                key={index}
                summary={block.summary}
                open={block.open}
                blocks={block.blocks}
                context={context}
              />
            );
          case "image":
            return <View key={index}>{renderImage({ url: block.url, alt: block.alt })}</View>;
          case "table":
            return (
              <View key={index} style={styles.mdTable}>
                {[block.header, ...block.rows].map((cells, rowIndex) => (
                  <View key={rowIndex} style={styles.mdTableRow}>
                    {cells.map((cell, cellIndex) => {
                      const image = imageOf(cell);
                      return (
                        <View key={cellIndex} style={styles.mdTableCell}>
                          {image !== null ? (
                            renderImage(image)
                          ) : (
                            <Text
                              style={[
                                styles.mdParagraph,
                                rowIndex === 0 ? styles.mdTableHeader : null,
                              ]}
                            >
                              {renderInline(cell, styles, onOpenLink)}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          default:
            return (
              <Text key={index} style={styles.mdParagraph}>
                {renderInline(block.text, styles, onOpenLink)}
              </Text>
            );
        }
  });
}
