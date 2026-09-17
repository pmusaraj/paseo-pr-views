import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";

import type { ItemDetails } from "../../shared/board";
import type { Styles } from "../theme/use-styles";

export function stateLabel(state: ItemDetails["state"]): string {
  if (state === "open") return "Open";
  if (state === "draft") return "Draft";
  if (state === "merged") return "Merged";
  return "Closed";
}

/**
 * The panel's own chrome, above the scrolling body: the repository name, the
 * state pill once the details have loaded, and the reload/close buttons.
 * Neither button owns its own busy state — the panel passes down whichever
 * of its own fetches is still running, so Reload disables the same way
 * whether the item or its comments are the one still in flight.
 */
export function DetailHeader({
  repository,
  state,
  styles,
  foregroundColor,
  busy,
  onRefresh,
  onClose,
}: {
  repository: string;
  state: ItemDetails["state"] | null;
  styles: Styles;
  foregroundColor: string;
  busy: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.detailHeader}>
      <Text style={styles.detailRepo} numberOfLines={1}>
        {repository}
      </Text>
      {state !== null ? (
        <Text
          style={[
            styles.statePill,
            state === "open"
              ? styles.statePillOpen
              : state === "closed"
                ? styles.statePillClosed
                : styles.statePillSettled,
          ]}
        >
          {stateLabel(state)}
        </Text>
      ) : null}
      <View style={styles.headerSpacer} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reload details"
        style={({ pressed }) => [
          styles.iconButton,
          busy ? styles.buttonDisabled : null,
          pressed ? styles.cardPressed : null,
        ]}
        onPress={onRefresh}
        disabled={busy}
      >
        <Icon name="RefreshCw" size={14} color={foregroundColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close details"
        style={({ pressed }) => [styles.iconButton, pressed ? styles.cardPressed : null]}
        onPress={onClose}
      >
        <Icon name="X" size={16} color={foregroundColor} />
      </Pressable>
    </View>
  );
}
