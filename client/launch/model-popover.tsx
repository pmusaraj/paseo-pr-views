import { useMemo, useState } from "react";
import { Pressable, ScrollView as SheetScrollView, Text, TextInput, View } from "react-native";

import type { ProviderChoice } from "./pickers";
import { Popover, PopoverRow } from "./pickers";
import type { Styles } from "../theme/use-styles";

/**
 * Ranks one row against a search query the way Paseo's model browser does —
 * over the model's label, its id, its provider's label and its description —
 * without `@getpaseo/protocol/search/text-match`, which a plugin client bundle
 * cannot import. An earlier match wins over a later one, and an earlier field
 * over a later one, which is what puts a name match above a description match.
 */
export function scoreFields(fields: readonly string[], query: string): number | null {
  let best: number | null = null;
  for (const [position, field] of fields.entries()) {
    const index = field.toLowerCase().indexOf(query);
    if (index < 0) continue;
    const score = index * 10 + position;
    if (best === null || score < best) best = score;
  }
  return best;
}

/** One model as the picker lists it, carrying the provider it came from. */
export interface ModelRow {
  /** `provider/model`, the id the dialog selects by. */
  id: string;
  providerId: string;
  providerLabel: string;
  modelId: string;
  label: string;
  description: string | null;
}

export function modelRowsFor(provider: ProviderChoice): ModelRow[] {
  return provider.models.map((model) => ({
    id: `${provider.id}/${model.id}`,
    providerId: provider.id,
    providerLabel: provider.label,
    modelId: model.id,
    label: model.label,
    description: model.description,
  }));
}

export function rankModelRows(rows: readonly ModelRow[], query: string): ModelRow[] {
  if (query === "") return [...rows];
  return rows
    .map((row) => ({
      row,
      score: scoreFields([row.label, row.modelId, row.providerLabel, row.description ?? ""], query),
    }))
    .filter((entry): entry is { row: ModelRow; score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score || left.row.label.localeCompare(right.row.label))
    .map((entry) => entry.row);
}

type ModelView = { kind: "all" } | { kind: "provider"; id: string };

/**
 * The model picker, in the two steps Paseo's own model browser uses: the
 * providers, then one provider's models behind a back arrow. A flat list of
 * every model on the host is unreadable once a provider ships fourteen of them.
 *
 * Where it opens follows `resolveInitialModelBrowserView`: a lone provider skips
 * the redundant provider step, and an already-chosen provider opens on its own
 * models. Searching from the provider step ranks across *all* providers, which
 * is why its placeholder says so.
 */
export function ModelPopover({
  styles,
  providers,
  selectedId,
  onSelect,
}: {
  styles: Styles;
  providers: readonly ProviderChoice[];
  /** `provider/model`, or null before the first snapshot lands. */
  selectedId: string | null;
  onSelect: (providerId: string, modelId: string) => void;
}) {
  const [view, setView] = useState<ModelView>(() => {
    const only = providers.length === 1 ? providers[0] : undefined;
    if (only !== undefined) return { kind: "provider", id: only.id };
    const selectedProvider = selectedId?.slice(0, selectedId.indexOf("/"));
    return selectedProvider !== undefined &&
      providers.some((provider) => provider.id === selectedProvider)
      ? { kind: "provider", id: selectedProvider }
      : { kind: "all" };
  });
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const provider =
    view.kind === "provider" ? providers.find((entry) => entry.id === view.id) : undefined;

  const rows = useMemo(() => {
    if (provider !== undefined) return rankModelRows(modelRowsFor(provider), normalized);
    if (normalized === "") return [];
    return rankModelRows(
      providers.flatMap((entry) => modelRowsFor(entry)),
      normalized,
    );
  }, [normalized, provider, providers]);

  // Cross-provider results name the provider up front, because the same model
  // label ships on more than one of them.
  const describe = (row: ModelRow): string | null =>
    provider !== undefined
      ? row.description
      : row.description === null
        ? row.providerLabel
        : `${row.providerLabel} · ${row.description}`;

  const browsing = provider === undefined && normalized === "";

  return (
    <Popover styles={styles} direction="up">
      {provider === undefined ? null : (
        <View style={styles.popoverHeader}>
          {providers.length > 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to providers"
              onPress={() => setView({ kind: "all" })}
              style={styles.popoverBack}
            >
              <Text style={styles.popoverBackLabel}>‹</Text>
            </Pressable>
          ) : null}
          <Text style={styles.popoverHeaderLabel} numberOfLines={1}>
            {provider.label}
          </Text>
        </View>
      )}
      <TextInput
        accessibilityLabel="Search models"
        style={styles.popoverSearch}
        value={query}
        onChangeText={setQuery}
        placeholder={provider === undefined ? "Search all models…" : "Search models…"}
        placeholderTextColor={styles.subtle.color}
        autoCorrect={false}
      />
      <SheetScrollView style={styles.popoverScroll} contentContainerStyle={styles.popoverList}>
        {browsing ? (
          <>
            <Text style={styles.popoverSection}>Providers</Text>
            {providers.map((entry) => (
              <PopoverRow
                key={entry.id}
                styles={styles}
                label={entry.label}
                description={null}
                selected={false}
                trailing={`${entry.models.length} ${
                  entry.models.length === 1 ? "model" : "models"
                } ›`}
                onPress={() => setView({ kind: "provider", id: entry.id })}
              />
            ))}
          </>
        ) : rows.length === 0 ? (
          <Text style={styles.popoverEmpty}>
            {normalized === ""
              ? "This provider offers no models."
              : `No models match “${query.trim()}”`}
          </Text>
        ) : (
          rows.map((row) => (
            <PopoverRow
              key={row.id}
              styles={styles}
              label={row.label}
              description={describe(row)}
              selected={row.id === selectedId}
              onPress={() => onSelect(row.providerId, row.modelId)}
            />
          ))
        )}
      </SheetScrollView>
    </Popover>
  );
}
