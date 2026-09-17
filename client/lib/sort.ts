import type { BoardItem, ColumnId } from "../../shared/board";
import type { BoardMode } from "./board-modes";

/** A row in the merged list: the item plus which column supplied it, for the prompt template, the state glyph, and the Draft pill. */
export interface BoardRow {
  item: BoardItem;
  type: ColumnId;
}

/**
 * The board's sort orders, in the order the dropdown lists them. Each entry
 * names the field a row is ranked by, newest first; `modes` restricts an
 * entry the same way `RELATION_FILTERS` restricts a chip — `lastCommitAt` is
 * null on anything that is not a pull request, so "Last commit" would sort a
 * whole list to the bottom with no way to tell why.
 */
export type SortOrder = {
  id: string;
  label: string;
  modes?: readonly BoardMode[];
  date: (item: BoardItem) => string | null;
  /**
   * The verb the card's meta line uses for this ordering's date. A list
   * ordered by one date while every row reports another reads as unsorted, so
   * the row follows the ordering rather than always saying "updated".
   */
  rowLabel: string;
};

/**
 * "Recently updated" on its own name, not just `SORT_ORDERS[0]`: every mode
 * offers it, so it doubles as the safe fallback wherever a lookup by id
 * cannot fail in practice but `noUncheckedIndexedAccess` still asks for one.
 */
export const DEFAULT_SORT_ORDER: SortOrder = {
  id: "updated",
  label: "Recently updated",
  date: (item) => item.updatedAt,
  rowLabel: "updated",
};

export const SORT_ORDERS: readonly SortOrder[] = [
  DEFAULT_SORT_ORDER,
  {
    id: "created",
    label: "Recently created",
    date: (item) => item.createdAt,
    rowLabel: "opened",
  },
  {
    id: "commit",
    label: "Last commit",
    modes: ["pull-requests"],
    date: (item) => item.lastCommitAt,
    rowLabel: "committed",
  },
];

/** Whether a saved or freshly-picked string is one of the orderings this build knows. */
export function isSortId(value: string): value is (typeof SORT_ORDERS)[number]["id"] {
  return SORT_ORDERS.some((order) => order.id === value);
}

/**
 * Ranks two rows by one ordering's date, newest first. A row missing that
 * date — an empty `updatedAt`/`createdAt` should not happen, but a null
 * `lastCommitAt` does on plenty of pull requests — sorts to the end no matter
 * which side of the comparison it lands on, so it never reads as "oldest"
 * and jumps to the top of a descending list.
 */
export function compareBySortDate(
  order: (typeof SORT_ORDERS)[number],
  a: BoardRow,
  b: BoardRow,
): number {
  const left = order.date(a.item);
  const right = order.date(b.item);
  if (left === null || left === "") return right === null || right === "" ? 0 : 1;
  if (right === null || right === "") return -1;
  if (left === right) return 0;
  return left < right ? 1 : -1;
}
