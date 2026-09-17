import { Modal, TextInput as SheetTextInput } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text } from "react-native";

import type { BoardItem } from "../../shared/board";
import type { Styles } from "../theme/use-styles";
import { IsolationControl } from "./isolation-control";
import { LaunchControls } from "./launch-controls";
import {
  type Configuration,
  type DesiredConfiguration,
  type LaunchResult,
  type ProviderEntry,
  readProviders,
  resolveConfiguration,
  type SendProject,
  toChoice,
  useSendDialogState,
} from "./use-send-dialog";

export type { Configuration, DesiredConfiguration, LaunchResult, ProviderEntry, SendProject };
export { readProviders, resolveConfiguration, toChoice };

/**
 * What Paseo's own New workspace screen asks before it starts a chat, for one
 * card: where the workspace is cut, which agent runs it, how hard it thinks,
 * which permission mode it runs under, and the first message.
 *
 * The host is not a choice here. A plugin surface is bound to the daemon that
 * contributed it — `usePaseo()` is that daemon's client and nothing reaches
 * another one — and the board itself is that host's `gh`. Switching hosts is the
 * surface header's job, so the dialog names the host rather than offering it.
 *
 * The dialog's own state — the project, the provider snapshot, the settled
 * configuration, which popover is open, the launch call — lives in
 * `useSendDialogState`; this component only lays the result out, in the two
 * control rows `IsolationControl` and `LaunchControls` own.
 */
export function SendDialog({
  item,
  initialPrompt,
  hostLabel,
  styles,
  accentColor,
  onCancel,
  onLaunched,
}: {
  item: BoardItem;
  /** The card's prompt template, already rendered. The user may rewrite it. */
  initialPrompt: string;
  hostLabel: string;
  styles: Styles;
  accentColor: string;
  onCancel: () => void;
  onLaunched: (result: LaunchResult) => void;
}) {
  const dialog = useSendDialogState({ item, initialPrompt, onCancel, onLaunched });

  return (
    <Modal title="New workspace" open onOpenChange={dialog.requestClose}>
      <Modal.Content contentContainerStyle={styles.dialogBody}>
        <Text style={styles.subtle} numberOfLines={1}>
          {hostLabel}
          {dialog.project === null ? "" : ` · ${dialog.project.name}`}
        </Text>
        <Text style={styles.modalBody} numberOfLines={2}>
          {item.repository} #{item.number} — {item.title}
        </Text>

        <IsolationControl
          styles={styles}
          project={dialog.project}
          isolation={dialog.isolation}
          open={dialog.picker === "isolation"}
          onToggle={() => dialog.togglePicker("isolation")}
          onSelect={dialog.selectIsolation}
        />

        {/* The host's input, not React Native's: it registers focus with the
            sheet, so the keyboard raises the form instead of covering it. That
            is what retired `useKeyboardInset`, which only ever ran on iOS. */}
        <SheetTextInput
          accessibilityLabel="First message"
          style={styles.promptInput}
          value={dialog.prompt}
          onChangeText={dialog.setPrompt}
          multiline
          editable={!dialog.busy}
          placeholder="What should the agent do?"
          placeholderTextColor={styles.subtle.color}
        />

        {dialog.error === null ? null : <Text style={styles.danger}>{dialog.error}</Text>}

        {/* Catches the press that closes an open popover, everywhere the popover
            and the control rows are not. It sits above the header and the prompt
            and below both rows, so a press there closes the menu instead of
            landing in the field underneath it. */}
        {dialog.picker === null ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={styles.cardScrim}
            onPress={dialog.closePicker}
          />
        )}

        <LaunchControls
          styles={styles}
          accentColor={accentColor}
          picker={dialog.picker}
          onTogglePicker={dialog.togglePicker}
          model={dialog.model}
          providers={dialog.providers}
          configuration={dialog.configuration}
          thinkingOptions={dialog.thinkingOptions}
          modes={dialog.modes}
          selectedModelId={dialog.selectedModelId}
          onSelectModel={dialog.selectModel}
          onSelectThinking={dialog.selectThinking}
          onSelectMode={dialog.selectMode}
          busy={dialog.busy}
          ready={dialog.ready}
          onCancel={onCancel}
          onSend={dialog.send}
        />
      </Modal.Content>
    </Modal>
  );
}
