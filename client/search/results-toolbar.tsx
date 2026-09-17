import { Pressable, Text, View } from "react-native";
import type { Styles } from "../theme/use-styles";
import { openExternalUrl } from "../web";
import type { useSearchResults } from "./use-search-results";

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
            disabled={search.isFetching}
            style={styles.ghostButton}
            onPress={() => void search.refresh()}
          >
            <Text style={styles.ghostButtonLabel}>Refresh results</Text>
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
        {search.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            disabled={search.isFetching}
            style={styles.ghostButton}
            onPress={() => void search.fetchNextPage()}
          >
            <Text style={styles.ghostButtonLabel}>Load more</Text>
          </Pressable>
        ) : null}
        {search.page === null ? null : (
          <Text style={styles.sectionHint}>
            {`${search.items.length} of ${search.page.total} results`}
          </Text>
        )}
      </View>
    </View>
  );
}
