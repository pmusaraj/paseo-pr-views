import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Pressable, View } from "react-native";
import { SendDialog } from "../launch/send-dialog";
import { LabelMenu } from "./label-menu";
import type { Styles } from "../theme/use-styles";
import type { UseBoardOverlaysResult } from "./use-board-overlays";

export function BoardDialogs({
  props,
  styles,
  overlays,
}: {
  props: PluginSurfaceProps;
  styles: Styles;
  overlays: Pick<
    UseBoardOverlaysResult,
    | "labelTarget"
    | "setLabelTarget"
    | "applyItemLabels"
    | "sendTarget"
    | "setSendTarget"
    | "handleLaunched"
  >;
}) {
  const {
    labelTarget,
    setLabelTarget,
    applyItemLabels,
    sendTarget,
    setSendTarget,
    handleLaunched,
  } = overlays;
  return (
    <>
      {labelTarget !== null ? (
        <View style={styles.menuLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close labels menu"
            style={styles.menuScrim}
            onPress={() => setLabelTarget(null)}
          />
          <LabelMenu
            // Keyed by card: opening the menu on a second card must not inherit
            // the first one's applied set or its in-flight toggles.
            key={labelTarget.item.id}
            target={labelTarget}
            styles={styles}
            accentColor={props.theme.colors.accent}
            onClose={() => setLabelTarget(null)}
            onChanged={applyItemLabels}
          />
        </View>
      ) : null}

      {sendTarget !== null ? (
        <SendDialog
          // Keyed by card, so opening a second one never inherits the first
          // one's prompt or its half-made choices.
          key={sendTarget.item.id}
          item={sendTarget.item}
          initialPrompt={sendTarget.prompt}
          hostLabel={props.host.label}
          styles={styles}
          accentColor={props.theme.colors.accent}
          onCancel={() => setSendTarget(null)}
          onLaunched={handleLaunched}
        />
      ) : null}
    </>
  );
}
