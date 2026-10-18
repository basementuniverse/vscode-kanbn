import {
  describeRelationTarget,
  findRelationTarget,
  getRelationTarget,
  relationTaskOptions,
} from './relationTargets';

const BOARD_TASKS = { 'task-b': {}, 'task-c': {} };
const BOARD_TASK_IDS = Object.keys(BOARD_TASKS);

describe('getRelationTarget', () => {
  it('reads a task on this board as on the board', () => {
    expect(getRelationTarget('task-b', BOARD_TASKS, {})).toEqual({ status: 'board' });
  });

  it("prefers the extension's answer over a task list that may be a refresh behind", () => {
    expect(getRelationTarget('task-b', BOARD_TASKS, { 'task-b': { status: 'archived' } }))
      .toEqual({ status: 'archived' });
  });

  it("treats a task the extension hasn't reported on as somewhere else", () => {
    expect(getRelationTarget('task-x', BOARD_TASKS, {})).toEqual({ status: 'live', boards: null });
  });

  it("doesn't find a relation to a task called after something on Object.prototype", () => {
    expect(getRelationTarget('constructor', {}, {})).toEqual({ status: 'live', boards: null });
    expect(findRelationTarget({}, 'constructor')).toBeNull();
    expect(findRelationTarget({}, 'toString')).toBeNull();
  });

  it('has nothing to say about a relation with no task yet', () => {
    expect(getRelationTarget('', BOARD_TASKS, {})).toBeNull();
  });
});

describe('describeRelationTarget', () => {
  it('leaves a task on this board unmarked', () => {
    expect(describeRelationTarget({ status: 'board' })).toBeNull();
    expect(describeRelationTarget(null)).toBeNull();
  });

  it('marks archived and missing tasks', () => {
    expect(describeRelationTarget({ status: 'archived' })).toMatchObject({ status: 'archived', label: 'archived' });
    expect(describeRelationTarget({ status: 'missing' })).toMatchObject({ status: 'missing', label: 'missing' });
  });

  it('names the boards a task elsewhere is on', () => {
    expect(describeRelationTarget({ status: 'live', boards: ['ops'] })).toMatchObject({ label: 'on ops' });
    expect(describeRelationTarget({ status: 'live', boards: [] })).toMatchObject({ label: 'not on any board' });
    expect(describeRelationTarget({ status: 'live', boards: null })).toMatchObject({ label: 'not on this board' });
  });
});

describe('relationTaskOptions', () => {
  const values = (options: Array<{ value: string }>) => options.map(option => option.value);

  it('offers only tasks on this board for a new relation', () => {
    expect(values(relationTaskOptions(BOARD_TASK_IDS, '', null))).toEqual(['', 'task-b', 'task-c']);
  });

  it('keeps an option for a relation to an archived task, so the dropdown shows what it holds', () => {
    const options = relationTaskOptions(
      BOARD_TASK_IDS,
      'task-a',
      describeRelationTarget({ status: 'archived' })
    );
    expect(options).toContainEqual({ value: 'task-a', label: 'task-a (archived)' });
    expect(values(options)).toEqual(['', 'task-a', 'task-b', 'task-c']);
  });

  it('keeps an option for a relation to a task that exists nowhere', () => {
    const options = relationTaskOptions(
      BOARD_TASK_IDS,
      'no-such-task',
      describeRelationTarget({ status: 'missing' })
    );
    expect(options).toContainEqual({ value: 'no-such-task', label: 'no-such-task (missing)' });
  });

  it('labels a board task that the extension says has since been archived', () => {
    const options = relationTaskOptions(
      BOARD_TASK_IDS,
      'task-b',
      describeRelationTarget({ status: 'archived' })
    );
    expect(values(options)).toEqual(['', 'task-b', 'task-c']);
    expect(options).toContainEqual({ value: 'task-b', label: 'task-b (archived)' });
  });

  it('leaves the labels alone for a relation to a task on this board', () => {
    expect(relationTaskOptions(BOARD_TASK_IDS, 'task-b', null)).toEqual([
      { value: '', label: 'Choose a task...' },
      { value: 'task-b', label: 'task-b' },
      { value: 'task-c', label: 'task-c' },
    ]);
  });
});
