import { searchCache } from "../search/cache";
import type { z } from "zod";
import type { RepositoryLabel, listLabels, toggleLabel } from "../../shared/board";
import { gh } from "../github/gh";
import { Cache } from "../cache/cache";
import { patchCachedLabels } from "../board/cache";

/**
 * The labels a repository defines, cached the way the board is: a label set
 * changes far more slowly than the work it is put on, and the menu is opened
 * card by card on repositories the user keeps returning to.
 */
const LABELS_TTL_MS = 5 * 60_000;

const labelsCache = new Cache<RepositoryLabel[]>("repository-labels");

/**
 * First 100 by name, which is every label on all but a deliberately elaborate
 * repository. Paging past that would mean a cursor loop for a menu nobody can
 * read anyway; a label past the hundredth is edited on GitHub.
 */
const LABELS_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    labels(first: 100, orderBy: { field: NAME, direction: ASC }) {
      nodes { id name color description }
    }
  }
}`;

/** `owner/name` as every card spells it, and the only form these handlers take. */
function splitRepository(repository: string): { owner: string; name: string } {
  const [owner, name, ...rest] = repository.split("/");
  if (owner === undefined || owner === "" || name === undefined || name === "" || rest.length > 0) {
    throw new Error(`"${repository}" is not an owner/name repository.`);
  }
  return { owner, name };
}

async function fetchRepositoryLabels(repository: string): Promise<RepositoryLabel[]> {
  const { owner, name } = splitRepository(repository);
  const raw = await gh([
    "api",
    "graphql",
    "-f",
    `query=${LABELS_QUERY}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `name=${name}`,
  ]);
  const parsed: unknown = JSON.parse(raw);
  const nodes = (parsed as { data?: { repository?: { labels?: { nodes?: unknown } } } }).data
    ?.repository?.labels?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((node): node is Record<string, unknown> => typeof node === "object" && node !== null)
    .map((node) => ({
      id: typeof node.id === "string" ? node.id : "",
      name: typeof node.name === "string" ? node.name : "",
      color: typeof node.color === "string" ? node.color : "",
      description:
        typeof node.description === "string" && node.description !== "" ? node.description : null,
    }))
    .filter((label) => label.id !== "" && label.name !== "");
}

export async function listLabelsHandler({
  repository,
}: z.output<typeof listLabels.input>): Promise<z.input<typeof listLabels.output>> {
  const labels = await labelsCache.get(repository, LABELS_TTL_MS, () => fetchRepositoryLabels(repository));
  return { labels };
}

/**
 * Both mutations answer with the labelable they changed, so the item's new
 * labels come back in the same round trip that set them — no read-after-write,
 * and no window where the card and GitHub disagree.
 *
 * `Labelable` is an interface, so the labels have to be selected through an
 * inline fragment per concrete type; issues and pull requests are the two the
 * board offers this on.
 */
const LABELABLE_SELECTION = `labelable {
      ... on Issue { labels(first: 20) { nodes { name } } }
      ... on PullRequest { labels(first: 20) { nodes { name } } }
    }`;

const ADD_LABEL_MUTATION = `mutation($item: ID!, $label: ID!) {
  addLabelsToLabelable(input: { labelableId: $item, labelIds: [$label] }) {
    ${LABELABLE_SELECTION}
  }
}`;

const REMOVE_LABEL_MUTATION = `mutation($item: ID!, $label: ID!) {
  removeLabelsFromLabelable(input: { labelableId: $item, labelIds: [$label] }) {
    ${LABELABLE_SELECTION}
  }
}`;

function labelNamesOf(result: unknown): string[] {
  const nodes = (
    result as { labelable?: { labels?: { nodes?: unknown } } } | undefined
  )?.labelable?.labels?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((node) => (node as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string");
}

export async function toggleLabelHandler({
  itemId,
  labelId,
  add,
}: z.output<typeof toggleLabel.input>): Promise<z.input<typeof toggleLabel.output>> {
  const raw = await gh([
    "api",
    "graphql",
    "-f",
    `query=${add ? ADD_LABEL_MUTATION : REMOVE_LABEL_MUTATION}`,
    "-f",
    `item=${itemId}`,
    "-f",
    `label=${labelId}`,
  ]);
  const parsed: unknown = JSON.parse(raw);
  const data = (parsed as { data?: Record<string, unknown> }).data;
  const labels = labelNamesOf(add ? data?.addLabelsToLabelable : data?.removeLabelsFromLabelable);
  await searchCache.clear();
  await patchCachedLabels(itemId, labels);
  return { labels };
}
