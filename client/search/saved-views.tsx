import { checkFor, useViewChecks } from "./use-view-checks";
import type { BackgroundClient } from "./background-client";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { SEARCH_SCOPE, type ForegroundClient } from "./foreground-client";
import { type PluginSurfaceProps, useSettings } from "@getpaseo/plugin/client";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Board } from "../../shared/board";
import {
  savedViewsSettings,
  selectedView,
  type SavedView,
} from "../../shared/saved-views";
import { BoardBody } from "../board/board-body";
import { BoardDialogs } from "../board/board-dialogs";
import { useBoardOverlays } from "../board/use-board-overlays";
import { useBoardSettings } from "../board/use-board-settings";
import { DEFAULT_SORT_ORDER, type BoardRow } from "../lib/sort";
import type { Styles } from "../theme/use-styles";
import { ResultsToolbar } from "./results-toolbar";
import { useSearchResults } from "./use-search-results";
import { ViewEditor } from "./view-editor";

export function SavedViews({
  props,
  styles,
  background,
  foreground,
}: {
  props: PluginSurfaceProps;
  styles: Styles;
  background: BackgroundClient;
  foreground: ForegroundClient;
}) {
  const settings = useSettings(savedViewsSettings);
  useEffect(() => {
    if (settings.status === "ready") foreground.setViews(settings.values.views);
  }, [foreground, settings]);
  const foregroundStatus = useSyncExternalStore(foreground.subscribe, foreground.getSnapshot);
  const boardSettings = useBoardSettings();
  const [editor, setEditor] = useState<SavedView | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selected =
    settings.status === "ready" ? selectedView(settings.values) : null;
  const search = useSearchResults(
    preview ?? selected?.query ?? null,
    SEARCH_SCOPE,
    preview === null ? selected?.id ?? null : null,
    background,
    settings.status === "ready" ? settings.values.views : [],
  );
  const { checks, selectedCheck } = useViewChecks(
    background,
    selected,
    preview,
    search.seen,
    setSaveError,
  );
  const rows = useMemo<BoardRow[]>(
    () =>
      search.items.map((item) => ({
        item,
        type: item.isDraft && item.state === "OPEN" ? "draft-prs" : "open-prs",
      })),
    [search.items],
  );
  const board = useMemo<Board | null>(
    () =>
      search.page === null
        ? null
        : {
            login: search.page.login,
            fetchedAt: search.page.fetchedAt,
            repositoryProjects: (search.data?.pages ?? []).reduce<
              Record<string, string>
            >(
              (projects, page) => ({ ...projects, ...page.repositoryProjects }),
              {},
            ),
            columns: [
              {
                id: "open-prs",
                title: "Search",
                items: search.items,
                error: null,
              },
            ],
          },
    [search.page, search.items, search.data],
  );
  // Mutation RPCs invalidate search membership; ordinary board patches cannot infer it.
  const ignoreBoardPatch = useCallback(() => {}, []);
  const overlays = useBoardOverlays(props, styles, {
    board,
    promptValues: boardSettings.promptValues,
    mutateBoardCache: ignoreBoardPatch,
    activeOrder: DEFAULT_SORT_ORDER,
  });
  const persist = async function persist(
    views: SavedView[],
    selectedId: string | null,
  ) {
    if (settings.status !== "ready") return false;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await settings.save(
        { views, selectedId },
        settings.revision,
      );
      if (!saved)
        setSaveError(
          "Could not save views. Settings may have changed on another device; try again.",
        );
      if (saved) void background.refresh();
      return saved;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveView = async function saveView(view: SavedView) {
    if (settings.status !== "ready") return false;
    const views = settings.values.views;
    if (
      editor !== null &&
      views.some(
        (entry) =>
          entry.id === editor.id &&
          (entry.name !== editor.name ||
            entry.query !== editor.query ||
            entry.backgroundCheck !== editor.backgroundCheck),
      )
    ) {
      setSaveError(
        "This view changed on another device. Reopen the editor before saving.",
      );
      return false;
    }
    return persist(
      views.some((entry) => entry.id === view.id)
        ? views.map((entry) => (entry.id === view.id ? view : entry))
        : [...views, view],
      view.id,
    );
  };
  const saveBackgroundCheck = async (backgroundCheck: boolean) => {
    if (settings.status !== "ready" || editor === null) return false;
    const id = editor.id;
    if (!settings.values.views.some((view) => view.id === id)) return false;
    const saved = await persist(
      settings.values.views.map((view) =>
        view.id === id ? { ...view, backgroundCheck } : view,
      ),
      settings.values.selectedId,
    );
    if (saved)
      setEditor((current) =>
        current?.id === id ? { ...current, backgroundCheck } : current,
      );
    return saved;
  };
  const editingSavedView =
    settings.status === "ready" &&
    settings.values.views.some((view) => view.id === editor?.id);
  const closeEditor = () => {
    setEditor(null);
    setPreview(null);
  };
  const remove = async function remove() {
    if (settings.status !== "ready" || selected === null) return;
    const remaining = settings.values.views.filter(
      (view) => view.id !== selected.id,
    );
    if (await persist(remaining, remaining[0]?.id ?? null)) setDeleting(false);
  };
  const error = search.error === null ? null : search.error.message;
  return (
    <View ref={overlays.rootRef} style={styles.screen}>
      <View style={styles.banner}>
        <ScrollView style={{ maxHeight: 120, flexGrow: 0 }}>
          <View style={styles.scopeRow}>
            {(settings.status === "ready" ? settings.values.views : []).map(
              (view) => (
                <Pressable
                  key={view.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected?.id === view.id }}
                  disabled={saving}
                  style={
                    selected?.id === view.id
                      ? styles.button
                      : styles.ghostButton
                  }
                  onPress={() => {
                    closeEditor();
                    setDeleting(false);
                    overlays.closeDetails();
                    if (settings.status === "ready")
                      void persist(settings.values.views, view.id);
                  }}
                >
                  <Text
                    style={
                      selected?.id === view.id
                        ? styles.buttonLabel
                        : styles.ghostButtonLabel
                    }
                  >
                    {view.name}
                    {checkFor(view, checks)?.unread || foregroundStatus.newViewIds.includes(view.id) ? (
                      <Text
                        accessibilityLabel="New pull requests"
                        style={{ color: styles.prStatusColors.approved }}
                      >
                        {" "}
                        ●
                      </Text>
                    ) : null}
                  </Text>
                </Pressable>
              ),
            )}
            <Pressable
              accessibilityRole="button"
              disabled={saving || settings.status !== "ready"}
              style={styles.ghostButton}
              onPress={() => {
                setPreview(null);
                setDeleting(false);
                setEditor({
                  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  name: "",
                  query: "",
                });
              }}
            >
              <Text style={styles.ghostButtonLabel}>New view</Text>
            </Pressable>
            {selected === null ? null : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  style={styles.ghostButton}
                  onPress={() => {
                    setEditor(selected);
                    setDeleting(false);
                  }}
                >
                  <Text style={styles.ghostButtonLabel}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  style={styles.ghostButton}
                  onPress={() => setDeleting(true)}
                >
                  <Text style={styles.ghostButtonLabel}>Delete</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
        {deleting ? (
          <View style={styles.scopeRow}>
            <Text style={styles.sectionHint}>Delete “{selected?.name}”?</Text>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              style={styles.ghostButton}
              onPress={() => void remove()}
            >
              <Text style={styles.danger}>Delete view</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              style={styles.ghostButton}
              onPress={() => setDeleting(false)}
            >
              <Text style={styles.ghostButtonLabel}>Keep view</Text>
            </Pressable>
          </View>
        ) : null}
        {saveError === null ? null : (
          <Text style={styles.danger}>{saveError}</Text>
        )}
        {settings.status === "ready" || settings.status === "loading" ? null : (
          <Text style={styles.danger}>Saved views could not be loaded.</Text>
        )}
      </View>
      {editor === null ? null : (
        <ViewEditor
          key={editor.id}
          initial={editor}
          styles={styles}
          busy={saving}
          onSave={saveView}
          onBackgroundCheckChange={
            editingSavedView ? saveBackgroundCheck : null
          }
          onPreview={(query) => {
            overlays.closeDetails();
            if (query === (preview ?? selected?.query)) void search.refresh();
            setPreview(query);
          }}
          onCancel={closeEditor}
        />
      )}
      {selectedCheck?.error ? (
        <Text style={styles.danger}>
          Background check: {selectedCheck.error}
        </Text>
      ) : null}
      <ResultsToolbar
        search={search}
        canRefresh={preview !== null || selected !== null}
        styles={styles}
      />
      <BoardBody
        surfaceProps={props}
        styles={styles}
        busy={search.isInitialLoading}
        board={board}
        displayRows={rows}
        renderRow={overlays.renderRow}
        modeRows={{ rows, error }}
        refresh={search.refresh}
        bodyWidth={overlays.bodyWidth}
        setBodyWidth={overlays.setBodyWidth}
        detailTarget={overlays.detailTarget}
        detailItem={overlays.detailItem}
        detailProgress={overlays.detailProgress}
        closeDetails={overlays.closeDetails}
        savedFraction={boardSettings.savedFraction}
        commitWidth={boardSettings.commitWidth}
        openSendDialog={overlays.openSendDialog}
        dropItem={overlays.dropItem}
      />
      <BoardDialogs props={props} styles={styles} overlays={overlays} />
    </View>
  );
}
