import { Pressable, Text, View } from "react-native";
import type { Styles } from "../theme/use-styles";
import { openExternalUrl } from "../web";
import type { useSearchResults } from "./use-search-results";
import { RESULT_LIMIT } from "./search-snapshot";

export function ResultsToolbar({
  search,
  canRefresh,
  styles,
}: {
  search: ReturnType<typeof useSearchResults>;
  canRefresh: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.banner}>
      {search.error === null ? null : <Text style={styles.danger}>{search.error.message}</Text>}
      <View style={[styles.scopeRow, { alignItems: "center" }]}>
        {canRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: search.isFetching, busy: search.isFetching }}
            disabled={search.isFetching}
            style={styles.ghostButton}
            onPress={() => {
              if (search.isFetching) return;
              if (search.updateCount > 0) search.applyUpdates();
              else void search.refresh();
            }}
          >
            <Text style={styles.ghostButtonLabel}>
              {search.isFetching
                ? "Checking for Updates…"
                : search.updateCount > 0
                  ? `Show updates (${search.updateCount})`
                  : "Refresh results"}
            </Text>
          </Pressable>
        ) : null}
        {search.page === null ? null : (
          <Pressable
            accessibilityRole="button"
            style={styles.ghostButton}
            onPress={() =>
              openExternalUrl(
                `https://github.com/issues?q=${encodeURIComponent(search.page?.resolvedQuery ?? "")}`,
              )
            }
          >
            <Text style={styles.ghostButtonLabel}>Open search on GitHub</Text>
          </Pressable>
        )}
        {search.page === null ? null : (
          <Text style={styles.sectionHint}>
            {`${search.items.length} of ${search.page.total} results${search.page.total > RESULT_LIMIT ? ` (limit ${RESULT_LIMIT})` : ""}`}
          </Text>
        )}
      </View>
    </View>
  );
}
