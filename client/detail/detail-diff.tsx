import { useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { loadPullRequestDiff, type DiffFile } from "../../shared/pr-diff";
import type { BoardItem } from "../../shared/board";
import type { Styles } from "../theme/use-styles";
import { openExternalUrl } from "../web";

export function DetailDiff({ item, generation, styles, accentColor }: {
  item: BoardItem;
  generation: number;
  styles: Styles;
  accentColor: string;
}) {
  const load = useRpc(loadPullRequestDiff);
  const [result, setResult] = useState<{ files: DiffFile[]; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setResult(null);
    setError(null);
    void load({ repository: item.repository, number: item.number }).then(
      (next) => { if (live) setResult(next); },
      (cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); },
    );
    return () => { live = false; };
  }, [load, item.repository, item.number, generation, attempt]);
  return (
    <View style={styles.mdNested}>
      <DiffHeading result={result} item={item} styles={styles} />
      {error ? (
        <>
          <Text style={styles.danger}>{error}</Text>
          <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={() => setAttempt((n) => n + 1)}>
            <Text style={styles.ghostButtonLabel}>Retry diff</Text>
          </Pressable>
        </>
      ) : result === null ? <ActivityIndicator color={accentColor} /> : (
        <>
          {result.files.length === 0 ? <Text style={styles.detailMeta}>No changed files.</Text> : null}
          {result.files.map((file) => <DiffFileView key={file.filename} file={file} styles={styles} />)}
          {result.truncated ? <Text style={styles.detailMeta}>Diff preview is limited. View all changes on GitHub.</Text> : null}
        </>
      )}
      <Pressable accessibilityRole="link" onPress={() => openExternalUrl(`${item.url}/files`)}>
        <Text style={styles.mdLink}>View full diff on GitHub</Text>
      </Pressable>
    </View>
  );
}

function DiffFileView({ file, styles }: { file: DiffFile; styles: Styles }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.commentCard}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)}>
        <Text style={styles.commentHeader}>
          {expanded ? "▾" : "▸"} {file.filename} · <DiffCounts additions={file.additions} deletions={file.deletions} styles={styles} />
        </Text>
        {file.previous_filename ? <Text style={styles.detailMeta}>Renamed from {file.previous_filename}</Text> : null}
      </Pressable>
      {expanded ? file.patch ? (
        <ScrollView horizontal>
          <Text selectable style={styles.mdCodeText}>
            {file.patch.split("\n").map((line, index) => (
              <Text key={index} style={line.startsWith("+") ? { color: styles.prStatusColors.approved } : line.startsWith("-") ? { color: styles.danger.color } : line.startsWith("@@") ? styles.mdLink : undefined}>
                {line}{"\n"}
              </Text>
            ))}
          </Text>
        </ScrollView>
      ) : <Text style={styles.detailMeta}>No text preview available. View this file on GitHub.</Text> : null}
    </View>
  );
}

function DiffCounts({ additions, deletions, styles }: {
  additions: number;
  deletions: number;
  styles: Styles;
}) {
  return (
    <>
      <Text style={{ color: styles.prStatusColors.approved }}>+{additions}</Text>
      {" "}
      <Text style={{ color: styles.danger.color }}>−{deletions}</Text>
    </>
  );
}

function DiffHeading({ result, item, styles }: {
  result: { files: DiffFile[] } | null;
  item: BoardItem;
  styles: Styles;
}) {
  const totals = result?.files.reduce(
    (sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }),
    { additions: 0, deletions: 0 },
  );
  // The preview stops at 100 files; search results carry whole-PR totals.
  const capped = result?.files.length === 100;
  const additions = capped ? item.additions ?? totals?.additions : totals?.additions;
  const deletions = capped ? item.deletions ?? totals?.deletions : totals?.deletions;
  return (
    <Text style={styles.mdHeading}>
        Changes{result ? ` (${result.files.length} files)` : ""}
        {additions !== undefined && deletions !== undefined ? (
          <>
            {" · "}<DiffCounts additions={additions} deletions={deletions} styles={styles} />
            {capped && (item.additions === undefined || item.deletions === undefined) ? " shown" : ""}
          </>
        ) : null}
      </Text>
  );
}
