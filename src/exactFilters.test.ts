/** @jest-environment node */
import { escapeRegExp, exactMatchPattern, toExactMatchFilters } from './exactFilters';

// marked's entry point is a .cjs file, which CRA's Jest config hands to its file transform as if it
// were an image - so kanbn would get the string "marked.cjs" back. Node's own require loads it as-is
jest.mock('marked', () => require('module')
  .createRequire(require('path').join(require('process').cwd(), 'package.json'))('marked'));

const { Kanbn } = require('@basementuniverse/kanbn/src/main');

/**
 * These run the patterns through kanbn's own filter model, since that's what reads them: the
 * extension host passes the panel's filters straight to filterAndSortTasks
 */

const task = (id: string, tags: string[]) => ({
  id,
  name: id,
  description: '',
  metadata: { tags },
  subTasks: [],
  relations: [],
  comments: [],
});

const TASKS = [
  task('phase-1', ['phase:1']),
  task('phase-10', ['phase:10']),
  task('phase-11', ['phase:11', 'urgent']),
  task('phase-1-and-bug', ['bug', 'phase:1']),
  task('cpp', ['c++']),
  task('version', ['v1.0']),
  task('version-lookalike', ['v1x0']),
  task('untagged', []),
];

const INDEX = {
  name: 'Test',
  description: '',
  options: {},
  columns: {
    'Todo': ['phase-1', 'phase-10', 'cpp', 'untagged'],
    'Not Todo': ['phase-11', 'version'],
    'Todo later': ['phase-1-and-bug', 'version-lookalike'],
  },
};

const matching = (filters: Record<string, any>): string[] => new Kanbn('.')
  .filterAndSortTasks(INDEX, TASKS, toExactMatchFilters(filters), [])
  .map((match: { id: string }) => match.id)
  .sort();

describe('tag checklist filters', () => {
  it('matches a tag exactly rather than as a prefix', () => {
    expect(matching({ tag: ['phase:1'] })).toEqual(['phase-1', 'phase-1-and-bug']);
  });

  it('finds a tag that is not the first on its task', () => {
    expect(matching({ tag: ['urgent'] })).toEqual(['phase-11']);
  });

  it('matches any of several ticked tags', () => {
    expect(matching({ tag: ['phase:10', 'urgent'] })).toEqual(['phase-10', 'phase-11']);
  });

  it('treats regex characters in a tag literally', () => {
    expect(matching({ tag: ['c++'] })).toEqual(['cpp']);
    expect(matching({ tag: ['v1.0'] })).toEqual(['version']);
  });
});

describe('column checklist filters', () => {
  it('matches a column exactly rather than as a substring', () => {
    expect(matching({ column: ['Todo'] })).toEqual(['cpp', 'phase-1', 'phase-10', 'untagged']);
  });

  it('combines with a tag filter', () => {
    expect(matching({ column: ['Todo'], tag: ['phase:1'] })).toEqual(['phase-1']);
  });
});

describe('toExactMatchFilters', () => {
  it('leaves other filters as regex searches', () => {
    expect(toExactMatchFilters({ name: 'phase', assigned: '@me', overdue: true }))
      .toEqual({ name: 'phase', assigned: '@me', overdue: true });
  });

  it('handles a single value as well as a list', () => {
    expect(toExactMatchFilters({ tag: 'bug' })).toEqual({ tag: [exactMatchPattern('bug')] });
  });

  it('does not change the filters it was given', () => {
    const filters = { tag: ['bug'] };
    toExactMatchFilters(filters);
    expect(filters).toEqual({ tag: ['bug'] });
  });
});

describe('escapeRegExp', () => {
  it('escapes every regex metacharacter', () => {
    const special = '.*+?^${}()|[]\\';
    expect(new RegExp(`^${escapeRegExp(special)}$`).test(special)).toBe(true);
  });
});
