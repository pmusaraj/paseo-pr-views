import type React from "react";
import { ScrollView as SheetScrollView } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";

import type { Styles } from "../theme/use-styles";

export interface Choice {
  id: string;
  label: string;
  description: string | null;
}

export interface ModelChoice extends Choice {
  isDefault: boolean;
  /** Empty for a model with no thinking levels, which hides that control. */
  thinkingOptions: readonly Choice[];
  defaultThinkingOptionId: string | null;
}

export interface ProviderChoice extends Choice {
  models: readonly ModelChoice[];
  /** Empty for a provider with no permission modes, which hides that control. */
  modes: readonly Choice[];
  defaultModeId: string | null;
}

/** Which control's popover is open; only ever one at a time. */
export type PickerId = "isolation" | "model" | "thinking" | "mode";

export const ISOLATION_CHOICES: readonly Choice[] = [
  { id: "local", label: "Local", description: "Work in the project's own checkout." },
  {
    id: "worktree",
    label: "New worktree",
    description: "Cut a fresh git worktree on its own branch.",
  },
];

/**
 * A chip on one of the dialog's control rows. Shaped like the repository
 * filter's chips so the two read as the same control, and it shows its current
 * value rather than its name — the value is what a user checks before sending.
 */
export function ControlChip({
  styles,
  label,
  disabled,
  onPress,
}: {
  styles: Styles;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled === true}
      onPress={onPress}
      style={[styles.chipButton, disabled === true ? styles.chipButtonDisabled : null]}
    >
      <Text style={styles.chipLabel}>{label} ▾</Text>
    </Pressable>
  );
}

/**
 * The floating panel a control opens, anchored to its **row** rather than to
 * the chip itself. Anchoring to the chip would need the chip's offset inside
 * the card, and a popover that opens past the card's right edge is clipped
 * outright on Android; the row's left edge is always inside the card, and one
 * consistent position reads as a menu rather than as a misplaced chip.
 *
 * `direction` keeps it inside the card too: the top row opens down over the
 * prompt, the bottom row opens up over it.
 */
export function Popover({
  styles,
  direction,
  children,
}: {
  styles: Styles;
  direction: "up" | "down";
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.popover, direction === "up" ? styles.popoverUp : styles.popoverDown]}>
      {children}
    </View>
  );
}

/** One selectable line: label, optional detail, and a tick when it is the current value. */
export function PopoverRow({
  styles,
  label,
  description,
  selected,
  trailing,
  onPress,
}: {
  styles: Styles;
  label: string;
  description: string | null;
  selected: boolean;
  /** Right-hand text, e.g. a provider's model count. */
  trailing?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.popoverRow,
        selected ? styles.popoverRowSelected : null,
        pressed ? styles.popoverRowPressed : null,
      ]}
    >
      <View style={styles.popoverRowText}>
        <Text style={styles.optionLabel} numberOfLines={1}>
          {label}
        </Text>
        {description === null ? null : (
          <Text style={styles.optionDescription} numberOfLines={1}>
            {description}
          </Text>
        )}
      </View>
      {trailing === undefined ? null : <Text style={styles.popoverTrailing}>{trailing}</Text>}
      {selected ? <Text style={styles.popoverTick}>✓</Text> : null}
    </Pressable>
  );
}

/** The isolation, thinking and permission-mode popovers: one flat list, no search. */
export function ChoicePopover({
  styles,
  direction,
  options,
  selectedId,
  onSelect,
}: {
  styles: Styles;
  direction: "up" | "down";
  options: readonly Choice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Popover styles={styles} direction={direction}>
      <SheetScrollView style={styles.popoverScroll} contentContainerStyle={styles.popoverList}>
        {options.map((option) => (
          <PopoverRow
            key={option.id}
            styles={styles}
            label={option.label}
            description={option.description}
            selected={option.id === selectedId}
            onPress={() => onSelect(option.id)}
          />
        ))}
      </SheetScrollView>
    </Popover>
  );
}
