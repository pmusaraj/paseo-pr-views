import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { Styles } from "../theme/use-styles";
import { ModelPopover } from "./model-popover";
import { ChoicePopover, ControlChip } from "./pickers";
import type { Choice, ModelChoice, PickerId, ProviderChoice } from "./pickers";
import type { Configuration } from "./use-send-dialog";

/** The model chip: always present, since a card always launches with some agent. */
function ModelChip({
  styles,
  model,
  providers,
  onToggle,
}: {
  styles: Styles;
  model: ModelChoice | null;
  providers: readonly ProviderChoice[] | null;
  onToggle: () => void;
}) {
  const label =
    model !== null ? model.label : providers === null ? "Loading agents…" : "Select model";
  return (
    <ControlChip
      styles={styles}
      label={label}
      disabled={providers === null || providers.length === 0}
      onPress={onToggle}
    />
  );
}

/** The thinking-level chip, hidden entirely for a model with no thinking levels of its own. */
function ThinkingChip({
  styles,
  configuration,
  thinkingOptions,
  onToggle,
}: {
  styles: Styles;
  configuration: Configuration | null;
  thinkingOptions: readonly Choice[];
  onToggle: () => void;
}) {
  if (thinkingOptions.length === 0) return null;
  const label =
    thinkingOptions.find((option) => option.id === configuration?.thinkingOptionId)?.label ??
    "Thinking";
  return <ControlChip styles={styles} label={label} onPress={onToggle} />;
}

/** The permission-mode chip, hidden entirely for a provider with no modes of its own. */
function ModeChip({
  styles,
  configuration,
  modes,
  onToggle,
}: {
  styles: Styles;
  configuration: Configuration | null;
  modes: readonly Choice[];
  onToggle: () => void;
}) {
  if (modes.length === 0) return null;
  const label = modes.find((option) => option.id === configuration?.modeId)?.label ?? "Permission mode";
  return <ControlChip styles={styles} label={label} onPress={onToggle} />;
}

/**
 * The three model/thinking/mode popovers, in the position their row already
 * reserves for them: after the buttons, since only one is ever open — `picker`
 * admits a single value — and a floating panel is positioned absolutely
 * against the row regardless of where in it it is declared.
 */
function LaunchPopovers({
  styles,
  picker,
  providers,
  configuration,
  thinkingOptions,
  modes,
  selectedModelId,
  onSelectModel,
  onSelectThinking,
  onSelectMode,
}: {
  styles: Styles;
  picker: PickerId | null;
  providers: readonly ProviderChoice[] | null;
  configuration: Configuration | null;
  thinkingOptions: readonly Choice[];
  modes: readonly Choice[];
  selectedModelId: string | null;
  onSelectModel: (provider: string, model: string) => void;
  onSelectThinking: (id: string) => void;
  onSelectMode: (id: string) => void;
}) {
  return (
    <>
      {picker === "model" && providers !== null ? (
        <ModelPopover
          styles={styles}
          providers={providers}
          selectedId={selectedModelId}
          onSelect={onSelectModel}
        />
      ) : null}
      {picker === "thinking" ? (
        <ChoicePopover
          styles={styles}
          direction="up"
          options={thinkingOptions}
          selectedId={configuration?.thinkingOptionId ?? null}
          onSelect={onSelectThinking}
        />
      ) : null}
      {picker === "mode" ? (
        <ChoicePopover
          styles={styles}
          direction="up"
          options={modes}
          selectedId={configuration?.modeId ?? null}
          onSelect={onSelectMode}
        />
      ) : null}
    </>
  );
}

/**
 * The dialog's second control row: the model, thinking and permission chips,
 * the busy spinner, and Cancel/Send — plus the three popovers those chips
 * open, which stay in this row rather than in `SendDialog` itself, the same
 * way the isolation popover stays with its own row.
 */
export function LaunchControls({
  styles,
  accentColor,
  picker,
  onTogglePicker,
  model,
  providers,
  configuration,
  thinkingOptions,
  modes,
  selectedModelId,
  onSelectModel,
  onSelectThinking,
  onSelectMode,
  busy,
  ready,
  onCancel,
  onSend,
}: {
  styles: Styles;
  accentColor: string;
  picker: PickerId | null;
  onTogglePicker: (id: PickerId) => void;
  model: ModelChoice | null;
  providers: readonly ProviderChoice[] | null;
  configuration: Configuration | null;
  thinkingOptions: readonly Choice[];
  modes: readonly Choice[];
  selectedModelId: string | null;
  onSelectModel: (provider: string, model: string) => void;
  onSelectThinking: (id: string) => void;
  onSelectMode: (id: string) => void;
  busy: boolean;
  ready: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  return (
    <View style={[styles.controlRow, picker === "isolation" ? null : styles.controlRowRaised]}>
      <ModelChip
        styles={styles}
        model={model}
        providers={providers}
        onToggle={() => onTogglePicker("model")}
      />
      <ThinkingChip
        styles={styles}
        configuration={configuration}
        thinkingOptions={thinkingOptions}
        onToggle={() => onTogglePicker("thinking")}
      />
      <ModeChip
        styles={styles}
        configuration={configuration}
        modes={modes}
        onToggle={() => onTogglePicker("mode")}
      />

      {busy ? <ActivityIndicator color={accentColor} /> : null}
      <View style={styles.dialogActionsSpacer} />
      <Pressable
        accessibilityRole="button"
        style={styles.ghostButton}
        onPress={onCancel}
        disabled={busy}
      >
        <Text style={styles.ghostButtonLabel}>Cancel</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={[styles.button, ready && !busy ? null : styles.buttonDisabled]}
        onPress={onSend}
        disabled={!ready || busy}
      >
        <Text style={styles.buttonLabel}>{busy ? "Starting…" : "Send"}</Text>
      </Pressable>

      <LaunchPopovers
        styles={styles}
        picker={picker}
        providers={providers}
        configuration={configuration}
        thinkingOptions={thinkingOptions}
        modes={modes}
        selectedModelId={selectedModelId}
        onSelectModel={onSelectModel}
        onSelectThinking={onSelectThinking}
        onSelectMode={onSelectMode}
      />
    </View>
  );
}
