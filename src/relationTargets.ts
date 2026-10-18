/**
 * Where a related task is, from the point of view of the board showing the relation:
 *   - board     the task is on this board
 *   - live      the task file is in the tasks folder but the task isn't on this board. `boards`
 *               lists the boards it is on (possibly none), or is null when that wasn't looked up
 *   - archived  the task file is in the archive folder
 *   - missing   there is no task file with this id anywhere
 *
 * The extension works this out (ext-src/KanbnRelations.ts) and the webview only labels it. Whatever
 * the answer, a relation is shown and saved exactly as it was written - this never decides whether
 * a relation exists, only how it looks
 */
export type RelationTarget =
  | { status: 'board' }
  | { status: 'live', boards: string[] | null }
  | { status: 'archived' }
  | { status: 'missing' };

export type RelationTargets = Record<string, RelationTarget>;

export type RelationTargetDescription = {
  status: 'live' | 'archived' | 'missing',
  label: string,
  title: string,
};

// The task lists are plain objects keyed on id, so `in` or a bare lookup would also find whatever is
// on Object.prototype - a relation to a task called "constructor" has to read as itself
const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/**
 * Look up what the extension reported about a related task
 *
 * @return The target, or null if the extension hasn't reported on this id
 */
export const findRelationTarget = (relationTargets: RelationTargets, taskId: string): RelationTarget | null =>
  (taskId && hasOwn(relationTargets, taskId)) ? relationTargets[taskId] : null;

/**
 * Find where a related task is
 *
 * The extension's answer wins over the board's task list, since the list can be a refresh behind a
 * task that was archived while the editor was open
 *
 * @return The target, or null for a relation that doesn't point at a task yet
 */
export const getRelationTarget = (
  taskId: string,
  boardTasks: object,
  relationTargets: RelationTargets
): RelationTarget | null => {
  if (!taskId) {
    return null;
  }
  const reported = findRelationTarget(relationTargets, taskId);
  if (reported !== null) {
    return reported;
  }
  if (hasOwn(boardTasks, taskId)) {
    return { status: 'board' };
  }

  // A task the extension hasn't reported on, which only happens until its next refresh
  return { status: 'live', boards: null };
};

/**
 * Describe a related task that isn't on this board, for a badge and its tooltip
 *
 * @return The description, or null for a task on this board, which needs no explaining
 */
export const describeRelationTarget = (target: RelationTarget | null): RelationTargetDescription | null => {
  if (target === null || target.status === 'board') {
    return null;
  }

  switch (target.status) {
    case 'archived':
      return {
        status: 'archived',
        label: 'archived',
        title: 'This task is archived. The relation is kept, and works again if the task is restored.',
      };

    case 'missing':
      return {
        status: 'missing',
        label: 'missing',
        title: 'There is no task with this id in the tasks folder or the archive. The relation is kept as it is.',
      };

    default:
      if (target.boards === null) {
        return {
          status: 'live',
          label: 'not on this board',
          title: "This task isn't on this board.",
        };
      }
      if (target.boards.length === 0) {
        return {
          status: 'live',
          label: 'not on any board',
          title: "This task's file exists, but it isn't on any board.",
        };
      }
      return {
        status: 'live',
        label: `on ${target.boards.join(', ')}`,
        title: `This task is on ${target.boards.length === 1 ? 'board' : 'boards'} ${target.boards.join(', ')}.`,
      };
  }
};

/**
 * The options for a relation's task dropdown
 *
 * New relations can only be pointed at tasks on this board, so those are the candidates. A relation
 * that already points somewhere else - an archived task, one on another board, one that doesn't
 * exist - gets its current value added as an extra option. Without it the dropdown has nothing to
 * show for the value it holds and falls back to the placeholder, which reads as an empty relation
 * even though the relation is still there and still saved
 */
export const relationTaskOptions = (
  boardTaskIds: string[],
  value: string,
  description: RelationTargetDescription | null
): Array<{ value: string, label: string }> => {
  const options = [{ value: '', label: 'Choose a task...' }];
  const labelled = (taskId: string) => (taskId === value && description !== null)
    ? `${taskId} (${description.label})`
    : taskId;

  if (value && boardTaskIds.indexOf(value) === -1) {
    options.push({ value, label: labelled(value) });
  }
  for (const taskId of boardTaskIds) {
    options.push({ value: taskId, label: labelled(taskId) });
  }
  return options;
};
