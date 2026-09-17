/**
 * The four ways the board can be viewed, one at a time, in the order the
 * switcher shows them. Replaces the four columns that used to sit side by
 * side: a phone never had room for all of them, and on a wide window the
 * chosen mode is now the same single control either way.
 */
export const BOARD_MODES = [
  { id: "pull-requests", label: "Pull requests" },
  { id: "issues", label: "Issues" },
  { id: "discussions", label: "Discussions" },
  { id: "saved-views", label: "Saved views" },
  { id: "projects", label: "Projects" },
] as const;

export type BoardMode = (typeof BOARD_MODES)[number]["id"];
