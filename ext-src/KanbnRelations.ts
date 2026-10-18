import * as fs from "fs";
import * as path from "path";
import type { KanbnApi } from "./KanbnApi";
import type { RelationTarget } from "../src/relationTargets";

export type { RelationTarget };

/**
 * Relations are keyed on task id. The link target written next to the id is `<id>.md` relative to
 * whichever folder the file sits in, so it stops resolving the moment either end of the relation is
 * archived - the data is fine, only following the link is wrong. Everything here goes by id instead:
 * the tasks folder first, then the archive. Nothing in here reads relations out of markdown or
 * writes a task file.
 *
 * This has no dependency on vscode, so it can be exercised against the real library in tests.
 */

export type TaskFile = { path: string, archived: boolean };

/**
 * A relation's id is whatever followed the last space in the link text, so it is only a task id if
 * it couldn't also be a path - otherwise `[blocks ../../notes](...)` would resolve outside the
 * kanbn folder
 */
function isTaskId(taskId: unknown): taskId is string {
  return typeof taskId === "string"
    && taskId !== ""
    && taskId !== "."
    && taskId !== ".."
    && !/[\\/]/.test(taskId);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Find the file for a task id, looking in the tasks folder and then the archive folder
 *
 * @return The file path and whether it's archived, or null if the task doesn't exist in either
 */
export async function findTaskFile(kanbn: KanbnApi, taskId: string): Promise<TaskFile | null> {
  if (!isTaskId(taskId)) {
    return null;
  }

  const taskPath = path.join(await kanbn.getTaskFolderPath(), `${taskId}.md`);
  if (await fileExists(taskPath)) {
    return { path: taskPath, archived: false };
  }

  // An archive folder that doesn't exist yet is just one with nothing in it
  const archivedTaskPath = path.join(await kanbn.getArchiveFolderPath(), `${taskId}.md`);
  if (await fileExists(archivedTaskPath)) {
    return { path: archivedTaskPath, archived: true };
  }

  return null;
}

/**
 * Collect the distinct, non-empty ids that a list of tasks relate to
 */
export function relatedTaskIds(tasks: Array<{ relations?: Array<{ task?: string }> }>): string[] {
  const ids = new Set<string>();
  for (const task of tasks) {
    for (const relation of task.relations || []) {
      if (relation && relation.task) {
        ids.add(relation.task);
      }
    }
  }
  return Array.from(ids);
}

/**
 * Work out where each related task is
 *
 * @param kanbn A kanbn instance - any board's will do, the tasks and archive folders are shared
 * @param taskIds The ids the relations point at
 * @param boardTaskIds The ids of the tasks on the board showing the relations
 * @param includeBoards Whether to look up which boards a task that isn't on this board is on. This
 * reads every board, so it's worth doing for one task being edited but not for a whole board
 */
export async function resolveRelationTargets(
  kanbn: KanbnApi,
  taskIds: string[],
  boardTaskIds: Set<string>,
  includeBoards: boolean
): Promise<Record<string, RelationTarget>> {
  const targets: Record<string, RelationTarget> = {};
  for (const taskId of taskIds) {
    if (!taskId || Object.prototype.hasOwnProperty.call(targets, taskId)) {
      continue;
    }

    if (boardTaskIds.has(taskId)) {
      targets[taskId] = { status: "board" };
      continue;
    }

    const taskFile = await findTaskFile(kanbn, taskId);
    if (taskFile === null) {
      targets[taskId] = { status: "missing" };
      continue;
    }

    if (taskFile.archived) {
      targets[taskId] = { status: "archived" };
      continue;
    }

    let boards: string[] | null = null;
    if (includeBoards) {
      try {
        boards = Object.keys(await kanbn.findTaskBoards(taskId));
      } catch (error) {
        // Board membership only refines the label - the task is there either way
        boards = null;
      }
    }
    targets[taskId] = { status: "live", boards };
  }
  return targets;
}
