import { SEARCH_KEY } from "../lib/search-pages";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView as SheetScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardItem, RepositoryLabel } from "../../shared/board";
import { listLabels, toggleLabel } from "../../shared/board";
import type { Styles } from "../theme/use-styles";
import { STALE_AFTER_MS } from "./constants";

/**
 * The label menu's footprint, needed *before* it renders: opening at the
 * pointer means deciding on which side of the pointer it fits, and the answer
 * cannot wait for a layout pass the user would see happen.
 */
export const LABEL_MENU_WIDTH = 260;
export const LABEL_MENU_MAX_HEIGHT = 300;
/** Kept off the surface's own edges, whichever way the menu opens. */
export const MENU_MARGIN = 8;

/** Where the menu was opened, in coordinates local to the surface. */
export interface LabelMenuTarget {
  item: BoardItem;
  left: number;
  /** Exactly one of these is set: the menu hangs from whichever fits. */
  top: number | null;
  bottom: number | null;
}

/**
 * The labels of one issue or pull request, opened where the user clicked.
 *
 * Each press is applied on its own, immediately, and the row waits on GitHub
 * rather than assuming: the answer to a toggle *is* the item's new label set,
 * so a label someone else added in the meantime lands on the card instead of
 * being quietly dropped.
 */
export function LabelMenu({
  target,
  styles,
  accentColor,
  onClose,
  onChanged,
}: {
  target: LabelMenuTarget;
  styles: Styles;
  accentColor: string;
  onClose: () => void;
  /** Reports the item's labels as GitHub now has them, for the card behind. */
  onChanged: (itemId: string, labels: string[]) => void;
}) {
  const { item } = target;
  const list = useRpc(listLabels);
  const apply = useRpc(toggleLabel);
  const queryClient = useQueryClient();

  /**
   * Each repository's label catalogue, keyed by `owner/name`. A label set
   * changes far more slowly than the work it is put on, and the menu is
   * reopened card after card on the same handful of repositories, so the
   * second open should not wait on a round trip. The query client's cache
   * outlives this component the same way the module-scope cache it replaces
   * did: the surface unmounts on every workspace switch, the cache does not.
   */
  const labelsQuery = useQuery({
    queryKey: ["repository-labels", item.repository],
    queryFn: () => list({ repository: item.repository }).then((result) => result.labels),
    staleTime: STALE_AFTER_MS,
  });
  const labels = labelsQuery.data ?? null;
  const [applied, setApplied] = useState<ReadonlySet<string>>(() => new Set(item.labels));
  /** Label ids with a toggle in flight; a row will not fire twice. */
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  /** A toggle's own failure, distinct from the catalogue query's; either shows in the banner below. */
  const [pressError, setPressError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const queryErrorMessage =
    labelsQuery.error == null
      ? null
      : labelsQuery.error instanceof Error
        ? labelsQuery.error.message
        : String(labelsQuery.error);
  const error = pressError ?? queryErrorMessage;

  const press = useCallback(
    (label: RepositoryLabel) => {
      if (pending.has(label.id)) return;
      const add = !applied.has(label.name);
      setPending((current) => new Set(current).add(label.id));
      setPressError(null);
      apply({ itemId: item.id, labelId: label.id, add })
        .then((result) => {
          setApplied(new Set(result.labels));
          void queryClient.resetQueries({ queryKey: [SEARCH_KEY] });
          onChanged(item.id, result.labels);
        })
        .catch((cause: unknown) => {
          setPressError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => {
          setPending((current) => {
            const next = new Set(current);
            next.delete(label.id);
            return next;
          });
        });
    },
    [applied, apply, item.id, onChanged, pending, queryClient],
  );

  const shown = useMemo(() => {
    if (labels === null) return [];
    const needle = query.trim().toLowerCase();
    if (needle === "") return labels;
    return labels.filter((label) => label.name.toLowerCase().includes(needle));
  }, [labels, query]);

  /**
   * A filter only once the list is long enough to need one: on a repository
   * with six labels it would be one more thing between the pointer and the
   * label it came for.
   */
  const searchable = labels !== null && labels.length > 8;

  return (
    <View
      accessibilityViewIsModal
      style={[
        styles.labelMenu,
        { left: target.left },
        target.top !== null ? { top: target.top } : { bottom: target.bottom ?? MENU_MARGIN },
      ]}
    >
      <Text style={styles.labelMenuTitle} numberOfLines={1}>
        Labels · {item.repository} #{item.number}
      </Text>
      {searchable ? (
        <TextInput
          style={styles.popoverSearch}
          placeholder="Filter labels…"
          placeholderTextColor={styles.popoverEmpty.color}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}
      {labels === null ? (
        <View style={styles.centeredRow}>
          <ActivityIndicator color={accentColor} />
        </View>
      ) : shown.length === 0 ? (
        <Text style={styles.popoverEmpty}>
          {labels.length === 0 ? "This repository defines no labels." : "No label matches."}
        </Text>
      ) : (
        <SheetScrollView style={styles.popoverScroll} contentContainerStyle={styles.popoverList}>
          {shown.map((label) => {
            const on = applied.has(label.name);
            return (
              <Pressable
                key={label.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${label.name}${on ? ", applied" : ""}`}
                onPress={() => press(label)}
                style={({ pressed }) => [
                  styles.popoverRow,
                  pending.has(label.id) ? styles.labelRowPending : null,
                  pressed ? styles.popoverRowPressed : null,
                ]}
              >
                <View style={[styles.labelDot, { backgroundColor: `#${label.color}` }]} />
                <Text style={styles.labelName} numberOfLines={1}>
                  {label.name}
                </Text>
                {on ? <Text style={styles.popoverTick}>✓</Text> : null}
              </Pressable>
            );
          })}
        </SheetScrollView>
      )}
      {error !== null ? <Text style={styles.labelMenuError}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close labels menu"
        onPress={onClose}
        style={styles.menuCloseRow}
      >
        <Text style={styles.popoverTrailing}>Close</Text>
      </Pressable>
    </View>
  );
}
