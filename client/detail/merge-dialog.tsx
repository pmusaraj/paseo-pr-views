import { Modal } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text } from "react-native";

import type { BoardItem, MergeMethod } from "../../shared/board";
import type { Styles } from "../theme/use-styles";

/**
 * GitHub's own wording for the three ways a pull request lands, because the
 * repository's settings and its merge button say the same, and a board that
 * renamed them would leave the user guessing which setting they map to.
 */
export const MERGE_METHOD_LABELS: Record<MergeMethod, string> = {
  squash: "Squash and merge",
  merge: "Create a merge commit",
  rebase: "Rebase and merge",
};


/**
 * The merge confirmation, which is also the method picker: each button is one
 * way to land the pull request, so the press that confirms is the press that
 * chooses, and there is no selected-but-not-yet-confirmed state to misread.
 *
 * Only the methods the repository allows are offered, so a squash-only
 * repository shows one button rather than three, two of which would fail.
 */
export function MergeDialog({
  item,
  methods,
  busy,
  styles,
  onCancel,
  onMerge,
}: {
  item: BoardItem;
  methods: readonly MergeMethod[];
  busy: boolean;
  styles: Styles;
  onCancel: () => void;
  onMerge: (method: MergeMethod) => void;
}) {
  return (
    <Modal
      title={`Merge #${item.number}`}
      open
      onOpenChange={(next: boolean) => {
        if (!next && !busy) onCancel();
      }}
    >
      <Modal.Content contentContainerStyle={styles.dialogBody}>
        <Text style={styles.subtle} numberOfLines={2}>
          {item.repository} · {item.title}
        </Text>
        <Text style={styles.detailMeta}>
          This lands on the base branch straight away. Paseo cannot undo it.
        </Text>
        {methods.map((method) => (
          <Pressable
            key={method}
            accessibilityRole="button"
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              busy ? styles.buttonDisabled : null,
              pressed ? styles.sendButtonPressed : null,
            ]}
            onPress={() => onMerge(method)}
          >
            <Text style={styles.buttonLabel}>{MERGE_METHOD_LABELS[method]}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={({ pressed }) => [
            styles.ghostButton,
            busy ? styles.buttonDisabled : null,
            pressed ? styles.sendButtonPressed : null,
          ]}
          onPress={onCancel}
        >
          <Text style={styles.ghostButtonLabel}>Cancel</Text>
        </Pressable>
      </Modal.Content>
    </Modal>
  );
}
