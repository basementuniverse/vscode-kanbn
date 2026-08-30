import React from "react";
import { paramCase } from '@basementuniverse/kanbn/src/utility';

export type SimpleTask = {
  column: string,
  position: number,
  text: string,
  raw: string
};

// A simple task written as a checkbox item keeps the box in its raw line, while `text` holds just
// the title. A checked box is worth showing; anything else is a plain line
const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]/;

/**
 * A line written straight into a board column that isn't a link to a task file.
 *
 * It has no id, no metadata and no dates, takes no part in workload, burndown, gantt or sprints, and
 * can't be moved or edited from here - kanbn's own board shows these dimmed at the end of a column,
 * and this matches that. They're edited by hand, or with `kanbn move` / `kanbn edit` on the CLI.
 */
const SimpleTaskItem = ({ simpleTask, columnName }: {
  simpleTask: SimpleTask,
  columnName: string
}) => {
  const checkbox = CHECKBOX.exec(simpleTask.raw);
  const checked = checkbox !== null && checkbox[1].toLowerCase() === 'x';

  return (
    <div
      className={[
        'kanbn-simple-task',
        `kanbn-simple-task-column-${paramCase(columnName)}`,
        checked ? 'kanbn-simple-task-checked' : null,
      ].filter(i => i).join(' ')}
      title={'Written directly in the board file. Edit it there, or with the kanbn CLI.'}
    >
      {
        checkbox !== null &&
        <i className={`codicon codicon-${checked ? 'pass-filled' : 'circle-large-outline'}`}></i>
      }
      <span className="kanbn-simple-task-text">{simpleTask.text}</span>
    </div>
  );
};

export default SimpleTaskItem;
