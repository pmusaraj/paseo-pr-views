import { prStatusIcon, type PrStatusColors } from "../lib/pr-status";
import type { BoardItem, CheckSummary, ColumnId } from "../../shared/board";
import type { SortOrder } from "../lib/sort";

/**
 * The three counts in words, for the card's accessibility label and nothing
 * else — the pills themselves are glyph and number, which a screen reader would
 * otherwise read out as punctuation.
 */
export function checksSentence(checks: CheckSummary): string {
  const parts: string[] = [];
  if (checks.passed > 0) parts.push(`${checks.passed} passed`);
  if (checks.failed > 0) parts.push(`${checks.failed} failed`);
  if (checks.pending > 0) parts.push(`${checks.pending} running`);
  return parts.join(", ");
}

/** Everything `ItemRow` derives from its props before it renders, gathered in one place because each field depends on a different subset of them. */
export interface RowDisplay {
  stampLabel: string;
  stampDate: string;
  /** The state glyph's name and colour, chosen from the column type. */
  iconName: string;
  iconColor: string;
  /** The row's author, or null for the viewer's own work — see the byline's own reasoning below. */
  byline: string | null;
  accessibilityLabel: string;
  accessibilityHint: string | undefined;
}

/**
 * Derives everything `ItemRow` needs to render but cannot read straight off a
 * prop: the meta line's date and label for the active ordering (a row with no
 * date for it still has to say something, and `updatedAt` is the one date
 * every card carries), the state glyph, the byline (named only when it is not
 * the viewer's own work, since most of the board is), and the accessibility
 * label and hint a sighted reader gets for free from the glyph, the trailing
 * pills and the meta line.
 */
export function describeRow({
  item,
  viewerLogin,
  order,
  type,
  accentColor,
  mutedColor,
  statusColors,
  closes,
  hasLabelMenu,
  isWeb,
}: {
  item: BoardItem;
  viewerLogin: string;
  order: SortOrder;
  type: ColumnId;
  accentColor: string;
  mutedColor: string;
  statusColors: PrStatusColors;
  /** The linked issues this row closes, already joined for the label. */
  closes: string;
  hasLabelMenu: boolean;
  isWeb: boolean;
}): RowDisplay {
  const stamp = order.date(item);
  const stampMissing = stamp === null || stamp === "";
  const stampLabel = stampMissing ? "updated" : order.rowLabel;
  const stampDate = stampMissing ? item.updatedAt : stamp;

  const pr =
    type === "draft-prs" || type === "open-prs" ? prStatusIcon(item, type, statusColors) : null;
  const iconName = pr?.iconName ?? (type === "discussions" ? "MessageSquare" : "CircleDot");
  const iconColor = pr?.iconColor ?? (type === "discussions" ? mutedColor : accentColor);

  const byline = item.author !== null && item.author !== viewerLogin ? item.author : null;

  const openedBy = byline === null ? "" : `, opened by ${byline}`;
  const linkedTo = closes === "" ? "" : `, closes ${closes}`;
  const checksLabel = item.checks === null ? "" : `, checks ${checksSentence(item.checks)}`;
  const accessibilityLabel = `${item.repository} #${item.number}: ${item.title}${pr === null ? "" : `, ${pr.label}`}${openedBy}${linkedTo}${checksLabel}`;

  let accessibilityHint: string | undefined;
  if (hasLabelMenu) {
    accessibilityHint = isWeb ? "Right-click to edit labels." : "Press and hold to edit labels.";
  }

  return {
    stampLabel,
    stampDate,
    iconName,
    iconColor,
    byline,
    accessibilityLabel,
    accessibilityHint,
  };
}
