import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaseo, useRpc } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { Keyboard } from "react-native";

import type { BoardItem, Isolation, LaunchDefaults } from "../../shared/board";
import { sendOptions, sendToChat } from "../../shared/board";
import { parseLaunchPreferences } from "../lib/launch-preferences";
import { readHostLaunchPreferences } from "../web";
import type { Choice, ModelChoice, PickerId, ProviderChoice } from "./pickers";

/**
 * One entry of the host's provider snapshot — every provider it knows about,
 * with the models and permission modes each one offers. Derived from the API
 * rather than imported from `@getpaseo/protocol`, because a plugin client bundle
 * may only import the host-provided modules, which `@getpaseo/protocol` is not.
 */
export type ProviderEntry = Awaited<
  ReturnType<ReturnType<typeof usePaseo>["providers"]["snapshot"]>
>["entries"][number];

/** What one agent is launched with, once every field has been checked against the host. */
export interface Configuration {
  provider: string;
  model: string;
  modeId: string | null;
  thinkingOptionId: string | null;
}

/** A configuration as it was *asked for*: any field may be missing or stale. */
export type DesiredConfiguration = Omit<LaunchDefaults, "isolation">;

export function toChoice(option: {
  id: string;
  label: string;
  description?: string | undefined;
}): Choice {
  return {
    id: option.id,
    label: option.label,
    description: option.description ?? null,
  };
}

/**
 * The providers this dialog can actually launch, in the host's own order.
 *
 * A provider with no selectable model is dropped rather than shown with a
 * "Default" row: the SDK creates agents by `provider/model` and rejects a bare
 * provider, so a row that cannot name a model is a row that cannot be sent.
 * Providers that are disabled, or still discovering, simply have nothing to
 * offer yet — a snapshot update brings them in when they do.
 */
export function readProviders(
  entries: readonly ProviderEntry[],
): ProviderChoice[] {
  const providers: ProviderChoice[] = [];
  for (const entry of entries) {
    if (entry.enabled === false) continue;
    const models = (entry.models ?? [])
      .filter((model) => model.isSelectable !== false)
      .map((model) => ({
        ...toChoice(model),
        isDefault: model.isDefault === true,
        thinkingOptions: (model.thinkingOptions ?? []).map(toChoice),
        defaultThinkingOptionId: model.defaultThinkingOptionId ?? null,
      }));
    if (models.length === 0) continue;
    providers.push({
      id: entry.provider,
      label: entry.label ?? entry.provider,
      description: entry.description ?? null,
      models,
      modes: (entry.modes ?? []).map(toChoice),
      defaultModeId: entry.defaultModeId ?? null,
    });
  }
  return providers;
}

/**
 * Settles a wish into something launchable: what was asked for where the host
 * still offers it, and the host's own default where it does not. That is what
 * lets a saved preference survive a model being renamed or a provider being
 * uninstalled, instead of failing the send.
 */
export function resolveConfiguration(
  providers: readonly ProviderChoice[],
  desired: DesiredConfiguration,
): Configuration | null {
  const provider =
    providers.find((entry) => entry.id === desired.provider) ?? providers[0];
  if (provider === undefined) return null;
  const model =
    provider.models.find((entry) => entry.id === desired.model) ??
    provider.models.find((entry) => entry.isDefault) ??
    provider.models[0];
  if (model === undefined) return null;
  const thinking =
    model.thinkingOptions.find(
      (option) => option.id === desired.thinkingOptionId,
    ) ??
    model.thinkingOptions.find(
      (option) => option.id === model.defaultThinkingOptionId,
    ) ??
    model.thinkingOptions[0];
  const mode =
    provider.modes.find((option) => option.id === desired.modeId) ??
    provider.modes.find((option) => option.id === provider.defaultModeId) ??
    provider.modes[0];
  return {
    provider: provider.id,
    model: model.id,
    thinkingOptionId: thinking?.id ?? null,
    modeId: mode?.id ?? null,
  };
}

export interface SendProject {
  id: string;
  name: string;
  rootPath: string;
  supportsWorktree: boolean;
}

export interface LaunchResult {
  workspaceId: string;
  workspaceName: string;
  projectName: string;
  agentId: string;
}

/** What `useSendDialogState` exposes to the dialog's own layout. */
export interface UseSendDialogResult {
  prompt: string;
  setPrompt: (next: string) => void;
  project: SendProject | null;
  error: string | null;
  busy: boolean;
  picker: PickerId | null;
  togglePicker: (id: PickerId) => void;
  closePicker: () => void;
  requestClose: (next: boolean) => void;
  isolation: Isolation;
  selectIsolation: (id: string) => void;
  providers: readonly ProviderChoice[] | null;
  provider: ProviderChoice | null;
  model: ModelChoice | null;
  configuration: Configuration | null;
  selectedModelId: string | null;
  selectModel: (nextProvider: string, nextModel: string) => void;
  selectThinking: (id: string) => void;
  selectMode: (id: string) => void;
  thinkingOptions: readonly Choice[];
  modes: readonly Choice[];
  ready: boolean;
  send: () => void;
}

/**
 * Everything `SendDialog` needs beyond its own layout: the project and host
 * defaults this card resolves to, the live provider snapshot and the
 * configuration it settles into, which of the four popovers is open, and the
 * launch call itself. Kept as one hook, not the component, so the dialog's own
 * JSX reads exactly as it did before the split — every name it references is
 * simply destructured off this hook's return instead of declared inline.
 */
export function useSendDialogState({
  item,
  initialPrompt,
  onCancel,
  onLaunched,
}: {
  item: BoardItem;
  initialPrompt: string;
  onCancel: () => void;
  onLaunched: (result: LaunchResult) => void;
}): UseSendDialogResult {
  const paseo = usePaseo();
  const loadOptions = useRpc(sendOptions);
  const launch = useRpc(sendToChat);
  const toast = useToast();

  const [prompt, setPrompt] = useState(initialPrompt);
  const [project, setProject] = useState<SendProject | null>(null);
  const [defaults, setDefaults] = useState<LaunchDefaults | null>(null);
  const [entries, setEntries] = useState<readonly ProviderEntry[] | null>(null);
  const [configuration, setConfiguration] = useState<Configuration | null>(
    null,
  );
  const [isolation, setIsolation] = useState<Isolation>("local");
  const [picker, setPicker] = useState<PickerId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const closePicker = useCallback(() => setPicker(null), []);

  /**
   * Opening a menu puts the keyboard away first. The popovers are sized to the
   * card, and the card is sized to what the keyboard leaves — so a menu opened
   * while typing would be choosing between the smallest card of the session and
   * the field the user was typing into. Dismissing costs the prompt nothing: it
   * is state, not the field's own value.
   */
  const togglePicker = useCallback((id: PickerId) => {
    Keyboard.dismiss();
    setPicker((current) => (current === id ? null : id));
  }, []);

  /**
   * What the host's own dismissals — backdrop, Escape, the platform back
   * action, the compact sheet's swipe — are allowed to do.
   *
   * An open popover swallows the press the way every menu does. A send in
   * flight is not interruptible. And an *edited* prompt is not thrown away on
   * a gesture: the dialog opens with a message the user is expected to rewrite,
   * and on a phone the backdrop is most of the screen, so losing that edit to a
   * stray thumb is a matter of time rather than of luck. Cancel is still the
   * way out and still says so — the toast points at it, because a modal that
   * silently refuses to close reads as broken.
   *
   * An untouched prompt has nothing to lose, so those gestures close it
   * normally, which is what makes this a modal rather than a trap.
   */
  const requestClose = useCallback(
    (next: boolean) => {
      if (next) return;
      if (picker !== null) {
        setPicker(null);
        return;
      }
      if (busy) return;
      if (prompt !== initialPrompt) {
        toast.show("Press Cancel to discard your message.", {
          variant: "info",
        });
        return;
      }
      onCancel();
    },
    [busy, initialPrompt, onCancel, picker, prompt, toast],
  );

  // Which project this card belongs to, and what the last send was set to.
  useEffect(() => {
    let cancelled = false;
    loadOptions({ repository: item.repository, url: item.url })
      .then((result) => {
        if (cancelled) return;
        setProject(result.project);
        const current = parseLaunchPreferences(readHostLaunchPreferences());
        setDefaults(current);
        setIsolation(
          result.project.supportsWorktree ? current.isolation : "local",
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [item.repository, item.url, loadOptions]);

  /**
   * The snapshot is taken against the project's checkout rather than the
   * daemon's cwd, because a provider can offer different models per directory —
   * the same reason Paseo's own composer passes one.
   */
  const cwd = project?.rootPath ?? null;
  useEffect(() => {
    if (cwd === null) return undefined;
    let cancelled = false;
    paseo.providers
      .snapshot({ cwd })
      .then((snapshot) => {
        if (!cancelled) setEntries(snapshot.entries);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(`Could not load providers: ${cause instanceof Error ? cause.message : String(cause)}`);
      });
    // Discovery is lazy on the daemon, so a provider still loading when the
    // snapshot was taken arrives later as an update rather than as a second
    // reply. An update for another directory is not ours to adopt.
    const unsubscribe = paseo.providers.subscribe((update) => {
      if (cancelled) return;
      if (update.cwd !== undefined && update.cwd !== cwd) return;
      setEntries(update.entries);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [cwd, paseo]);

  const providers = useMemo(
    () => (entries === null ? null : readProviders(entries)),
    [entries],
  );

  // Re-settled whenever the host's offering changes, keeping whatever the user
  // has already picked wherever it is still on offer.
  useEffect(() => {
    if (providers === null || defaults === null) return;
    setConfiguration((current) =>
      resolveConfiguration(providers, current ?? defaults),
    );
  }, [defaults, providers]);

  const provider = useMemo(
    () =>
      providers?.find((entry) => entry.id === configuration?.provider) ?? null,
    [configuration?.provider, providers],
  );
  const model = useMemo(
    () =>
      provider?.models.find((entry) => entry.id === configuration?.model) ??
      null,
    [configuration?.model, provider],
  );

  const selectedModelId =
    configuration === null
      ? null
      : `${configuration.provider}/${configuration.model}`;

  const selectModel = useCallback(
    (nextProvider: string, nextModel: string) => {
      setConfiguration((current) =>
        providers === null
          ? current
          : resolveConfiguration(providers, {
              provider: nextProvider,
              model: nextModel,
              modeId: current?.modeId ?? null,
              // Dropped on purpose: thinking levels belong to the model, so a
              // new model takes its own default rather than the old one's.
              thinkingOptionId: null,
            }),
      );
      setPicker(null);
    },
    [providers],
  );

  const selectIsolation = useCallback((id: string) => {
    setIsolation(id === "worktree" ? "worktree" : "local");
    setPicker(null);
  }, []);

  const selectThinking = useCallback((id: string) => {
    setConfiguration((current) =>
      current === null ? current : { ...current, thinkingOptionId: id },
    );
    setPicker(null);
  }, []);

  const selectMode = useCallback((id: string) => {
    setConfiguration((current) =>
      current === null ? current : { ...current, modeId: id },
    );
    setPicker(null);
  }, []);

  const send = useCallback(() => {
    if (configuration === null || busy) return;
    const text = prompt.trim();
    if (text === "") return;
    setBusy(true);
    setError(null);
    setPicker(null);
    launch({
      repository: item.repository,
      number: item.number,
      title: item.title,
      url: item.url,
      // Not read by the launch — these ride along for the timeline row the
      // handler appends to the new agent.
      author: item.author,
      labels: item.labels,
      prompt: text,
      isolation,
      provider: configuration.provider,
      model: configuration.model,
      modeId: configuration.modeId,
      thinkingOptionId: configuration.thinkingOptionId,
    })
      .then(onLaunched)
      .catch((cause: unknown) => {
        // Left open on failure, with everything still typed in: the workspace
        // may or may not exist, but the user's prompt certainly should not be
        // thrown away.
        setBusy(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, [busy, configuration, isolation, item, launch, onLaunched, prompt]);

  const ready =
    configuration !== null && project !== null && prompt.trim() !== "";
  const thinkingOptions = model?.thinkingOptions ?? [];
  const modes = provider?.modes ?? [];

  return {
    prompt,
    setPrompt,
    project,
    error,
    busy,
    picker,
    togglePicker,
    closePicker,
    requestClose,
    isolation,
    selectIsolation,
    providers,
    provider,
    model,
    configuration,
    selectedModelId,
    selectModel,
    selectThinking,
    selectMode,
    thinkingOptions,
    modes,
    ready,
    send,
  };
}
