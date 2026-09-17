import { View } from "react-native";

import type { Isolation } from "../../shared/board";
import type { Styles } from "../theme/use-styles";
import { ChoicePopover, ControlChip, ISOLATION_CHOICES } from "./pickers";
import type { SendProject } from "./use-send-dialog";

/**
 * Where the workspace is cut: the dialog's first control row, and one of its
 * four popovers. A non-git project has no worktree to cut, so the chip reads
 * Local and the press is disabled rather than offering a choice that fails.
 *
 * Its own row, out-stacking the scrim so its popover stays clickable — the
 * row raises above the second control row's while its own popover is open.
 */
export function IsolationControl({
  styles,
  project,
  isolation,
  open,
  onToggle,
  onSelect,
}: {
  styles: Styles;
  project: SendProject | null;
  isolation: Isolation;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={[styles.controlRow, open ? styles.controlRowRaised : null]}>
      <ControlChip
        styles={styles}
        label={isolation === "worktree" ? "New worktree" : "Local"}
        disabled={project === null || !project.supportsWorktree}
        onPress={onToggle}
      />
      {open ? (
        <ChoicePopover
          styles={styles}
          direction="down"
          options={ISOLATION_CHOICES}
          selectedId={isolation}
          onSelect={onSelect}
        />
      ) : null}
    </View>
  );
}
