import React, { useEffect, useRef, useState } from 'react';

export type FilterValues = Record<string, any>;

export type CustomField = { name: string, type: 'boolean' | 'date' | 'number' | 'string' };

// Kanbn's computed values. Each is a tri-state here, because leaving a filter off is different from
// filtering on false: `--overdue`, `--no-overdue` and not passing it at all are three answers
export const BOOLEAN_FILTERS: Array<{ key: string, label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'is-started', label: 'Started' },
  { key: 'is-completed', label: 'Completed' },
  { key: 'in-started-column', label: 'In a started column' },
  { key: 'in-completed-column', label: 'In a completed column' },
];

export const DATE_FILTERS: Array<{ key: string, label: string }> = [
  { key: 'due', label: 'Due' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
  { key: 'started', label: 'Started' },
  { key: 'completed', label: 'Completed' },
  { key: 'plannedStart', label: 'Planned start' },
  { key: 'plannedFinish', label: 'Planned finish' },
];

const NUMBER_FILTERS: Array<{ key: string, label: string, step?: number, hint?: string }> = [
  { key: 'workload', label: 'Workload' },
  { key: 'count-sub-tasks', label: 'Sub-tasks' },
  { key: 'count-tags', label: 'Tags' },
  { key: 'count-comments', label: 'Comments' },
  { key: 'count-relations', label: 'Relations' },
];

// A date input gives a whole day, so an open-ended range is expressed as a range against a bound far
// outside any board's data rather than as a one-sided comparison kanbn's filter model doesn't have
const FAR_PAST = '1970-01-01T00:00:00.000Z';

const endOfDay = (value: string) => `${value}T23:59:59.999`;
const startOfDay = (value: string) => `${value}T00:00:00.000`;
const farFuture = () => `${new Date().getFullYear() + 200}-01-01T00:00:00.000Z`;

/**
 * Build the date range a From/To pair means. Kanbn matches a single date against the calendar day
 * and two dates as an inclusive range, so a one-sided range needs an outer bound
 */
export const dateRange = (from: string, to: string): string[] | null => {
  if (from && to) {
    return [startOfDay(from), endOfDay(to)];
  }
  if (from) {
    return [startOfDay(from), farFuture()];
  }
  if (to) {
    return [FAR_PAST, endOfDay(to)];
  }
  return null;
};

/** Read a From/To pair back out of a stored range, for redisplay */
const rangeToInputs = (value: any): { from: string, to: string } => {
  if (!Array.isArray(value) || !value.length) {
    return { from: '', to: '' };
  }
  const day = (v: any) => (typeof v === 'string' ? v.slice(0, 10) : '');
  const from = day(value[0]);
  const to = day(value[1]);
  return {
    from: from === FAR_PAST.slice(0, 10) ? '' : from,
    to: to && Number(to.slice(0, 4)) > new Date().getFullYear() + 100 ? '' : to,
  };
};

const TriState = ({ value, onChange, label }: {
  value: boolean | undefined,
  onChange: (value: boolean | undefined) => void,
  label: string
}) => (
  <div className="kanbn-filter-row kanbn-filter-row-tristate">
    <span className="kanbn-filter-label">{label}</span>
    <div className="kanbn-filter-tristate" role="group" aria-label={label}>
      {([
        { v: undefined as boolean | undefined, text: 'Any' },
        { v: true as boolean | undefined, text: 'Yes' },
        { v: false as boolean | undefined, text: 'No' },
      ]).map(option => (
        <button
          key={String(option.text)}
          type="button"
          aria-pressed={value === option.v}
          className={[
            'kanbn-filter-tristate-button',
            value === option.v ? 'kanbn-filter-tristate-button-active' : null,
          ].filter(i => i).join(' ')}
          onClick={() => onChange(option.v)}
        >
          {option.text}
        </button>
      ))}
    </div>
  </div>
);

const CheckList = ({ label, options, selected, onChange }: {
  label: string,
  options: string[],
  selected: string[],
  onChange: (values: string[]) => void
}) => {
  if (!options.length) {
    return null;
  }
  return (
    <div className="kanbn-filter-row">
      <span className="kanbn-filter-label">{label}</span>
      <div className="kanbn-filter-checklist">
        {options.map(option => (
          <label className="kanbn-filter-check" key={option}>
            <input
              type="checkbox"
              checked={selected.indexOf(option) !== -1}
              onChange={e => {
                onChange(e.target.checked
                  ? [...selected, option]
                  : selected.filter(value => value !== option));
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

const BoardFilter = ({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  columns,
  tags,
  customFields,
  contributors,
  filterError,
  matchCount,
  totalCount,
}: {
  search: string,
  onSearchChange: (value: string) => void,
  filters: FilterValues,
  onFiltersChange: (filters: FilterValues) => void,
  columns: string[],
  tags: string[],
  customFields: CustomField[],
  contributors: Array<{ name: string, displayName: string }>,
  filterError: string | null,
  matchCount: number,
  totalCount: number,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the panel the way every other popover does, rather than trapping the user in it
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const setFilter = (key: string, value: any) => {
    const next = { ...filters };
    const empty = value === undefined
      || value === null
      || value === ''
      || (Array.isArray(value) && !value.length);
    if (empty) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onFiltersChange(next);
  };

  const activeKeys = Object.keys(filters);
  const hasFilters = activeKeys.length > 0 || search.trim() !== '';

  // One chip per active filter, described in the words of the control that set it
  const describe = (key: string): string => {
    const value = filters[key];
    const booleanFilter = BOOLEAN_FILTERS.filter(f => f.key === key)[0];
    if (booleanFilter) {
      return value === true ? booleanFilter.label : `Not ${booleanFilter.label.toLowerCase()}`;
    }
    const dateFilter = DATE_FILTERS.filter(f => f.key === key)[0];
    if (dateFilter) {
      const { from, to } = rangeToInputs(value);
      if (from && to) { return `${dateFilter.label} ${from} → ${to}`; }
      if (from) { return `${dateFilter.label} from ${from}`; }
      if (to) { return `${dateFilter.label} until ${to}`; }
      return dateFilter.label;
    }
    const numberFilter = NUMBER_FILTERS.filter(f => f.key === key)[0];
    if (numberFilter && Array.isArray(value)) {
      return value[0] === value[1]
        ? `${numberFilter.label} ${value[0]}`
        : `${numberFilter.label} ${value[0]}–${value[1]}`;
    }
    if (key === 'progress' && Array.isArray(value)) {
      return `Progress ${Math.round(value[0] * 100)}–${Math.round(value[1] * 100)}%`;
    }
    if (key === 'assigned') {
      return value === '@me' ? 'Assigned to me' : `Assigned: ${value}`;
    }
    const shown = Array.isArray(value) ? value.join(', ') : String(value);
    const named: Record<string, string> = {
      column: 'Column',
      tag: 'Tag',
      name: 'Name',
      description: 'Description',
      'sub-task': 'Sub-task',
      relation: 'Relation',
      comment: 'Comment',
    };
    return `${named[key] || key}: ${shown}`;
  };

  const numberRange = (key: string, label: string, scale = 1, suffix = '') => {
    const value = Array.isArray(filters[key]) ? filters[key] : [];
    const shown = (i: number) => (value[i] === undefined ? '' : String(Math.round(value[i] * scale)));
    const update = (i: number, raw: string) => {
      const next = [
        i === 0 ? raw : shown(0),
        i === 1 ? raw : shown(1),
      ];
      if (next[0] === '' && next[1] === '') {
        setFilter(key, undefined);
        return;
      }
      // One bound on its own means "exactly this", which is what kanbn does with a single number
      const low = next[0] === '' ? next[1] : next[0];
      const high = next[1] === '' ? next[0] : next[1];
      setFilter(key, [Number(low) / scale, Number(high) / scale]);
    };
    return (
      <div className="kanbn-filter-row" key={key}>
        <span className="kanbn-filter-label">{label}</span>
        <div className="kanbn-filter-range">
          <input
            type="number"
            className="kanbn-filter-input-small"
            aria-label={`Minimum ${label.toLowerCase()}`}
            placeholder="min"
            value={shown(0)}
            onChange={e => update(0, e.target.value)}
          />
          <span className="kanbn-filter-range-sep">–</span>
          <input
            type="number"
            className="kanbn-filter-input-small"
            aria-label={`Maximum ${label.toLowerCase()}`}
            placeholder="max"
            value={shown(1)}
            onChange={e => update(1, e.target.value)}
          />
          {suffix && <span className="kanbn-filter-suffix">{suffix}</span>}
        </div>
      </div>
    );
  };

  const dateRow = (key: string, label: string) => {
    const { from, to } = rangeToInputs(filters[key]);
    const update = (nextFrom: string, nextTo: string) => {
      setFilter(key, dateRange(nextFrom, nextTo) || undefined);
    };
    return (
      <div className="kanbn-filter-row" key={key}>
        <span className="kanbn-filter-label">{label}</span>
        <div className="kanbn-filter-range">
          <input
            type="date"
            className="kanbn-filter-input-small"
            aria-label={`${label} from`}
            value={from}
            onChange={e => update(e.target.value, to)}
          />
          <span className="kanbn-filter-range-sep">→</span>
          <input
            type="date"
            className="kanbn-filter-input-small"
            aria-label={`${label} until`}
            value={to}
            onChange={e => update(from, e.target.value)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="kanbn-filter" ref={containerRef}>
      <div className="kanbn-filter-bar">
        <input
          className="kanbn-filter-input"
          placeholder="Search tasks"
          title={'Searches id, name and description.\nSupports the older field:value syntax, e.g. tag:bug'}
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
        <button
          type="button"
          className={[
            'kanbn-header-button',
            'kanbn-header-button-filter',
            activeKeys.length ? 'kanbn-header-button-filter-active' : null,
          ].filter(i => i).join(' ')}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title="Filter tasks"
        >
          <i className="codicon codicon-filter"></i>
          {activeKeys.length > 0 && <span className="kanbn-filter-count">{activeKeys.length}</span>}
        </button>
        {
          hasFilters &&
          <button
            type="button"
            className="kanbn-header-button kanbn-header-button-clear-filter"
            onClick={() => { onFiltersChange({}); onSearchChange(''); }}
            title="Clear all filters"
          >
            <i className="codicon codicon-clear-all"></i>
          </button>
        }
      </div>

      {
        (hasFilters || filterError) &&
        <div className="kanbn-filter-chips">
          {filterError && <span className="kanbn-filter-chip kanbn-filter-chip-error">{filterError}</span>}
          {activeKeys.map(key => (
            <button
              type="button"
              className="kanbn-filter-chip"
              key={key}
              onClick={() => setFilter(key, undefined)}
              title={`Remove this filter`}
            >
              {describe(key)}
              <i className="codicon codicon-close"></i>
            </button>
          ))}
          {
            !filterError &&
            <span className="kanbn-filter-summary">
              {matchCount === totalCount ? `${totalCount} tasks` : `${matchCount} of ${totalCount}`}
            </span>
          }
        </div>
      }

      {
        open &&
        <div className="kanbn-filter-panel">
          <div className="kanbn-filter-group">
            <h3 className="kanbn-filter-group-title">Flags</h3>
            {BOOLEAN_FILTERS.map(flag => (
              <TriState
                key={flag.key}
                label={flag.label}
                value={filters[flag.key]}
                onChange={value => setFilter(flag.key, value)}
              />
            ))}
          </div>

          <div className="kanbn-filter-group">
            <h3 className="kanbn-filter-group-title">Who and where</h3>
            <div className="kanbn-filter-row">
              <span className="kanbn-filter-label">Assigned</span>
              <div className="kanbn-filter-range">
                <input
                  className="kanbn-filter-input-small kanbn-filter-input-grow"
                  placeholder="Anyone"
                  list={contributors.length ? 'kanbn-filter-contributors' : undefined}
                  value={filters.assigned || ''}
                  onChange={e => setFilter('assigned', e.target.value)}
                />
                <button
                  type="button"
                  className="kanbn-filter-shortcut"
                  onClick={() => setFilter('assigned', '@me')}
                  title="Assigned to me"
                >
                  @me
                </button>
              </div>
              {
                contributors.length > 0 &&
                <datalist id="kanbn-filter-contributors">
                  {contributors.map(c => (
                    <option key={c.name} value={c.name}>
                      {c.displayName !== c.name ? c.displayName : ''}
                    </option>
                  ))}
                </datalist>
              }
            </div>
            <CheckList
              label="Column"
              options={columns}
              selected={filters.column || []}
              onChange={values => setFilter('column', values)}
            />
            <CheckList
              label="Tag"
              options={tags}
              selected={filters.tag || []}
              onChange={values => setFilter('tag', values)}
            />
          </div>

          <div className="kanbn-filter-group">
            <h3 className="kanbn-filter-group-title">Amounts</h3>
            {numberRange('workload', 'Workload')}
            {numberRange('progress', 'Progress', 100, '%')}
            {NUMBER_FILTERS.filter(f => f.key !== 'workload').map(f => numberRange(f.key, f.label))}
          </div>

          <div className="kanbn-filter-group">
            <h3 className="kanbn-filter-group-title">Dates</h3>
            {DATE_FILTERS.map(f => dateRow(f.key, f.label))}
          </div>

          {
            customFields.length > 0 &&
            <div className="kanbn-filter-group">
              <h3 className="kanbn-filter-group-title">Custom fields</h3>
              {customFields.map(field => {
                if (field.type === 'boolean') {
                  return (
                    <TriState
                      key={field.name}
                      label={field.name}
                      value={filters[field.name]}
                      onChange={value => setFilter(field.name, value)}
                    />
                  );
                }
                if (field.type === 'date') {
                  return dateRow(field.name, field.name);
                }
                if (field.type === 'number') {
                  return numberRange(field.name, field.name);
                }
                return (
                  <div className="kanbn-filter-row" key={field.name}>
                    <span className="kanbn-filter-label">{field.name}</span>
                    <input
                      className="kanbn-filter-input-small kanbn-filter-input-grow"
                      value={filters[field.name] || ''}
                      onChange={e => setFilter(field.name, e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          }
        </div>
      }
    </div>
  );
};

export default BoardFilter;
