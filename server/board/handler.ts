import type { BoardColumn } from "../../shared/board";
import {
  loadProjectIndex,
  repositoryIdFor,
  type PaseoApi,
} from "../launch/project-index";

export async function describeRepositoryProjects(
  paseo: PaseoApi,
  columns: readonly BoardColumn[],
): Promise<{ repositoryProjects: Record<string, string> }> {
  const index = await loadProjectIndex(paseo);

  const repositoryProjects: Record<string, string> = {};
  for (const column of columns) {
    for (const item of column.items) {
      if (
        item.repository === "" ||
        repositoryProjects[item.repository] !== undefined
      )
        continue;
      const repositoryId = repositoryIdFor(item.repository, item.url);
      if (repositoryId === null) continue;
      const project = index.byRepositoryId[repositoryId];
      if (project !== undefined)
        repositoryProjects[item.repository] = project.projectId;
    }
  }

  return { repositoryProjects };
}
