import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { SavedView } from "../../shared/saved-views";
import { SavedViewSchema } from "../../shared/saved-views";
import type { Styles } from "../theme/use-styles";

export function ViewEditor({
  initial,
  styles,
  busy,
  onSave,
  onBackgroundCheckChange,
  onPreview,
  onCancel,
}: {
  initial: SavedView;
  styles: Styles;
  busy: boolean;
  onSave: (view: SavedView) => Promise<boolean>;
  onBackgroundCheckChange: ((enabled: boolean) => Promise<boolean>) | null;
  onPreview: (query: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [query, setQuery] = useState(initial.query);
  const [backgroundCheck, setBackgroundCheck] = useState(
    initial.backgroundCheck ?? false,
  );
  const [updatingCheck, setUpdatingCheck] = useState(false);
  const disabled = busy || updatingCheck;
  const [error, setError] = useState<string | null>(null);
  const toggleBackgroundCheck = async () => {
    if (disabled) return;
    const next = !backgroundCheck;
    setBackgroundCheck(next);
    setError(null);
    if (onBackgroundCheckChange === null) return;
    setUpdatingCheck(true);
    try {
      if (!(await onBackgroundCheckChange(next))) {
        setBackgroundCheck(!next);
        setError("The background check setting could not be saved. Try again.");
      }
    } catch (cause) {
      setBackgroundCheck(!next);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setUpdatingCheck(false);
    }
  };
  const save = async function save() {
    const parsed = SavedViewSchema.safeParse({
      id: initial.id,
      name,
      query,
      backgroundCheck,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    if (await onSave(parsed.data)) onCancel();
  };
  return (
    <ScrollView
      style={{ maxHeight: 320 }}
      contentContainerStyle={styles.settingsBody}
    >
      <Text style={styles.fieldLabel}>View name</Text>
      <TextInput
        accessibilityLabel="View name"
        value={name}
        onChangeText={setName}
        style={styles.loginInput}
        maxLength={100}
      />
      <Text style={styles.fieldLabel}>GitHub search query</Text>
      <TextInput
        accessibilityLabel="GitHub search query"
        value={query}
        onChangeText={setQuery}
        style={styles.templateInput}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={2000}
      />
      <Text style={styles.sectionHint}>
        GitHub keywords, AND/OR and parentheses are supported. Date filters
        accept @today and @today-Nd (UTC). Results contain pull requests only
        and follow GitHub’s search order.
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: backgroundCheck, disabled }}
        disabled={disabled}
        onPress={() => void toggleBackgroundCheck()}
        style={[styles.scopeRow, { alignItems: "center" }]}
      >
        <Text style={styles.fieldLabel}>
          {backgroundCheck ? "☑" : "☐"} Add background check
        </Text>
      </Pressable>
      <Text style={styles.sectionHint}>
        {updatingCheck
          ? "Saving background check…"
          : onBackgroundCheckChange === null
            ? "Checks every 10 minutes. Enabled when you save this new view."
            : "Checks every 10 minutes. This checkbox saves immediately."}
      </Text>
      {error === null ? null : <Text style={styles.danger}>{error}</Text>}
      <View style={styles.scopeRow}>
        <Pressable
          accessibilityRole="button"
          style={styles.ghostButton}
          disabled={disabled || query.trim() === ""}
          onPress={() => onPreview(query)}
        >
          <Text style={styles.ghostButtonLabel}>Preview</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          disabled={disabled}
          onPress={() => void save()}
        >
          <Text style={styles.buttonLabel}>Save</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.ghostButton}
          disabled={disabled}
          onPress={onCancel}
        >
          <Text style={styles.ghostButtonLabel}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
