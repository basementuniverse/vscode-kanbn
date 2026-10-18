/** @jest-environment node */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { KanbnApi } from '../ext-src/KanbnApi';
import { findTaskFile, relatedTaskIds, resolveRelationTargets } from '../ext-src/KanbnRelations';
import { transformTaskData } from '../ext-src/taskData';

// marked's entry point is a .cjs file, which CRA's Jest config hands to its file transform as if it
// were an image - so kanbn would get the string "marked.cjs" back. Node's own require loads it as-is
jest.mock('marked', () => require('module')
  .createRequire(require('path').join(require('process').cwd(), 'package.json'))('marked'));

const { Kanbn } = require('@basementuniverse/kanbn/src/main');

/**
 * These run the extension's relation lookups and save path against the real kanbn library, on a
 * throwaway workspace laid out like the manual test: task-b blocks task-a, task-c depends on it
 */

let root: string;
let kanbn: KanbnApi;

const taskFilePath = async (taskId: string) => path.join(await kanbn.getTaskFolderPath(), `${taskId}.md`);
const readTaskFile = async (taskId: string) => fs.readFileSync(await taskFilePath(taskId), 'utf8');

// Everything from the Relations heading up to the next section or the end of the file
const relationsSection = (markdown: string) => {
  const match = /## Relations\n[\s\S]*?(?=\n## |\s*$)/.exec(markdown);
  return match ? match[0] : null;
};

const boardTaskIds = async () => {
  const index = await kanbn.getIndex();
  return new Set<string>(([] as string[]).concat(...(Object.values(index.columns) as string[][])));
};

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kanbn-relations-'));
  kanbn = new Kanbn(root);
  await kanbn.initialise({ name: 'Relations' });
  await kanbn.createTask({ name: 'Task A' }, 'Backlog');
  await kanbn.createTask({
    name: 'Task B',
    relations: [
      { type: 'blocks', task: 'task-a' },
      { type: 'see also', task: 'task-c' },
      { type: '', task: 'no-such-task' },
    ],
  }, 'Backlog');
  await kanbn.createTask({ name: 'Task C', relations: [{ type: 'depends-on', task: 'task-a' }] }, 'Todo');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a live task related to an archived task', () => {
  it('resolves the related task in the archive', async () => {
    await kanbn.archiveTask('task-a');

    const taskFile = await findTaskFile(kanbn, 'task-a');
    expect(taskFile).toEqual({
      path: path.join(await kanbn.getArchiveFolderPath(), 'task-a.md'),
      archived: true,
    });

    const targets = await resolveRelationTargets(
      kanbn,
      relatedTaskIds([await kanbn.getTask('task-b'), await kanbn.getTask('task-c')]),
      await boardTaskIds(),
      true
    );
    expect(targets['task-a']).toEqual({ status: 'archived' });
    expect(targets['task-c']).toEqual({ status: 'board' });
  });

  it('keeps the relation in both tasks', async () => {
    await kanbn.archiveTask('task-a');

    expect((await kanbn.getTask('task-b')).relations).toContainEqual({ type: 'blocks', task: 'task-a' });
    expect((await kanbn.getTask('task-c')).relations).toEqual([{ type: 'depends-on', task: 'task-a' }]);
  });

  it("isn't reported by validation, and doesn't stop the gantt chart", async () => {
    await kanbn.archiveTask('task-a');

    const warnings = await kanbn.findRelationWarnings();
    expect(warnings.filter(warning => warning.relation.task === 'task-a')).toEqual([]);
    await expect((kanbn as any).gantt(null, null, null, null)).resolves.toBeDefined();
  });
});

describe('an archived task related to a live task', () => {
  it('keeps its relations, and they resolve to the tasks folder', async () => {
    await kanbn.archiveTask('task-c');
    await kanbn.archiveTask('task-b');

    const archived = await kanbn.loadArchivedTask('task-b') as any;
    expect(archived.relations).toEqual([
      { type: 'blocks', task: 'task-a' },
      { type: 'see also', task: 'task-c' },
      { type: '', task: 'no-such-task' },
    ]);

    // Resolved from a board that task-a isn't on, so its board has to be looked up
    const targets = await resolveRelationTargets(kanbn, relatedTaskIds([archived]), new Set(), true);
    expect(targets['task-a']).toEqual({
      status: 'live',
      boards: Object.keys(await kanbn.findTaskBoards('task-a')),
    });
    expect(targets['task-c']).toEqual({ status: 'archived' });
    expect(targets['no-such-task']).toEqual({ status: 'missing' });
  });
});

describe('a relation to a task that exists nowhere', () => {
  it('resolves as missing and is reported by validation', async () => {
    expect(await findTaskFile(kanbn, 'no-such-task')).toBeNull();

    const targets = await resolveRelationTargets(kanbn, ['no-such-task'], await boardTaskIds(), true);
    expect(targets).toEqual({ 'no-such-task': { status: 'missing' } });

    const warnings = await kanbn.findRelationWarnings();
    expect(warnings).toEqual([
      expect.objectContaining({ task: 'task-b', type: 'missing-related-task', relation: { type: '', task: 'no-such-task' } }),
    ]);
  });

  it("never resolves an id that's really a path", async () => {
    // tasks/../index.md is the board file, which exists
    expect(await findTaskFile(kanbn, '../index')).toBeNull();
    expect(await findTaskFile(kanbn, '..')).toBeNull();
    expect(await resolveRelationTargets(kanbn, ['../index'], new Set(), true))
      .toEqual({ '../index': { status: 'missing' } });
  });
});

describe('archiving and then restoring a related task', () => {
  it('makes the relation work again without touching the task that holds it', async () => {
    const before = await readTaskFile('task-b');

    await kanbn.archiveTask('task-a');
    expect((await resolveRelationTargets(kanbn, ['task-a'], await boardTaskIds(), true))['task-a'])
      .toEqual({ status: 'archived' });

    await kanbn.restoreTask('task-a');
    expect(await findTaskFile(kanbn, 'task-a')).toEqual({ path: await taskFilePath('task-a'), archived: false });
    expect((await resolveRelationTargets(kanbn, ['task-a'], await boardTaskIds(), true))['task-a'])
      .toEqual({ status: 'board' });

    expect(await readTaskFile('task-b')).toBe(before);
  });
});

describe('saving a task with a relation to an archived task', () => {
  it('writes the relations back byte-for-byte when an unrelated field is edited', async () => {
    await kanbn.archiveTask('task-a');
    const before = await readTaskFile('task-b');

    // What the task panel sends the editor, as it arrives on the other side of postMessage
    const index = await kanbn.getIndex();
    const tasks = (await kanbn.loadAllTrackedTasks(index)).map(task => kanbn.hydrateTask(index, task));
    const task = JSON.parse(JSON.stringify(tasks.find(t => t.id === 'task-b')));

    // The editor's form values, with only the description changed
    const values = {
      ...task,
      description: 'An edit that has nothing to do with relations',
      metadata: { ...task.metadata, tags: task.metadata.tags || [] },
      comments: task.comments || [],
    };
    const original = await kanbn.getTask('task-b');
    await kanbn.updateTask('task-b', transformTaskData(values, [], original.metadata), task.column);

    const after = await readTaskFile('task-b');
    expect(after).toContain('An edit that has nothing to do with relations');
    expect(relationsSection(after)).not.toBeNull();
    expect(relationsSection(after)).toBe(relationsSection(before));
    expect(relationsSection(after)).toBe([
      '## Relations',
      '',
      '- [blocks task-a](task-a.md)',
      '- [see also task-c](task-c.md)',
      '- [no-such-task](no-such-task.md)',
      '',
    ].join('\n'));
  });
});

describe('a related task on another board only', () => {
  it('resolves as live, with the boards it is on', async () => {
    await kanbn.createBoard('ops', { name: 'Ops' });
    const ops = kanbn.board('ops');
    await ops.createTask({ name: 'Task D' }, Object.keys((await ops.getIndex()).columns)[0]);

    const targets = await resolveRelationTargets(kanbn, ['task-d'], await boardTaskIds(), true);
    expect(targets).toEqual({ 'task-d': { status: 'live', boards: ['ops'] } });
  });
});
