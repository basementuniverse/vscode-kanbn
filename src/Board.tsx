import { DragDropContext, Droppable } from "react-beautiful-dnd";
import React, { useEffect, useMemo, useRef, useState } from "react";
import BoardFilter, { FilterValues } from "./BoardFilter";
import SimpleTaskItem, { SimpleTask } from "./SimpleTaskItem";
import TaskItem from "./TaskItem";
import { paramCase } from "@basementuniverse/kanbn/src/utility";
import { nameToLabel } from "./labels";
import VSCodeApi from "./VSCodeApi";
import formatDate from "dateformat";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import "katex/dist/katex.min.css";

const createMarkdownComponents = (vscode: VSCodeApi) => ({
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    return !inline && match ? (
      <SyntaxHighlighter
        style=""
        useInlineStyles={false}
        language={match[1]}
        PreTag="div"
        children={String(children).replace(/\n$/, "")}
        {...props}
      />
    ) : (
      <code className={className} children={children} {...props} />
    );
  },
  a(props: any) {
    const { href, children, ...rest } = props;
    return (
      <button
        type="button"
        className={rest.className}
        onClick={(event) => {
          if (!href || href.charAt(0) === "#") {
            return;
          }

          event.preventDefault();
          vscode.postMessage({
            command: "kanbn.openLink",
            href,
          });
        }}
        {...rest}
        style={{
          appearance: "none",
          background: "none",
          border: 0,
          color: "var(--vscode-textLink-foreground)",
          cursor: "pointer",
          font: "inherit",
          padding: 0,
          textDecoration: "underline",
          textAlign: "left",
        }}
      >
        {children}
      </button>
    );
  },
});

const Markdown = ({ vscode, children, ...props }) => (
  <ReactMarkdown
    remarkPlugins={[remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={createMarkdownComponents(vscode)}
    {...props}
  >
    {children}
  </ReactMarkdown>
);

// Called when a task item has finished being dragged
const onDragEnd = (result, columns, setColumns, vscode: VSCodeApi) => {
  // No destination means the item was dragged to an invalid location
  if (!result.destination) {
    return;
  }

  // Get the source and destination columns
  const { source, destination } = result;

  // The item that was moved
  let removed: KanbnTask;

  // The task was dragged from one column to another
  if (source.droppableId !== destination.droppableId) {
    const sourceItems = columns[source.droppableId];
    const destItems = columns[destination.droppableId];
    [removed] = sourceItems.splice(source.index, 1);
    destItems.splice(destination.index, 0, removed);
    setColumns({
      ...columns,
      [source.droppableId]: sourceItems,
      [destination.droppableId]: destItems,
    });

    // The task was dragged into the same column
  } else {
    // If the task was dragged to the same position that it currently occupies, don't move it (this will
    // prevent unnecessarily setting the task's updated date)
    if (source.index === destination.index) {
      return;
    }
    const copiedItems = columns[source.droppableId];
    [removed] = copiedItems.splice(source.index, 1);
    copiedItems.splice(destination.index, 0, removed);
    setColumns({
      ...columns,
      [source.droppableId]: copiedItems,
    });
  }

  // Post a message back to the extension so we can move the task in the index
  vscode.postMessage({
    command: "kanbn.move",
    task: removed.id,
    columnName: destination.droppableId,
    position: destination.index,
  });
};

// The older `field:value` search syntax, kept as a shortcut. These map onto kanbn's filter field
// names, which aren't always what the syntax called them
const LEGACY_SEARCH_FIELDS: Record<string, string> = {
  description: "description",
  assigned: "assigned",
  tag: "tag",
  relation: "relation",
  subtask: "sub-task",
  comment: "comment",
};

/**
 * Split the search box into structured filters and plain words. Kanbn filter sets are combined with
 * AND, so "match the id or the name or the description" can't be expressed as one - the free text
 * stays here and is applied on top of whatever the host matched
 */
const parseSearch = (
  search: string,
  customFields: { name: string; type: "boolean" | "date" | "number" | "string" }[],
): { searchFilters: FilterValues; freeText: string } => {
  const searchFilters: FilterValues = {};
  const words: string[] = [];
  const customFieldsByName = new Map(customFields.map((field) => [field.name.toLowerCase(), field]));

  for (const token of search.split(" ").filter((part) => part !== "")) {
    const separator = token.indexOf(":");
    if (separator > 0) {
      const key = token.slice(0, separator).toLowerCase();
      const value = token.slice(separator + 1);
      if (value !== "") {
        if (key in LEGACY_SEARCH_FIELDS) {
          const field = LEGACY_SEARCH_FIELDS[key];
          searchFilters[field] = field in searchFilters ? ([] as string[]).concat(searchFilters[field], value) : value;
          continue;
        }
        const customField = customFieldsByName.get(key);
        if (customField) {
          searchFilters[customField.name] = customField.type === "number" ? Number(value) : value;
          continue;
        }
      }
    }

    if (token.toLowerCase() === "overdue") {
      searchFilters.overdue = true;
      continue;
    }
    const booleanField = customFieldsByName.get(token.toLowerCase());
    if (booleanField && booleanField.type === "boolean") {
      searchFilters[booleanField.name] = true;
      continue;
    }
    words.push(token);
  }

  return { searchFilters, freeText: words.join(" ").toLowerCase() };
};

const Board = ({
  name,
  description,
  columns,
  hiddenColumns,
  startedColumns,
  completedColumns,
  columnSorting,
  customFields,
  boards,
  boardSlug,
  startedField,
  completedField,
  simpleTasks,
  filteredTaskIds,
  filterError,
  views,
  view,
  viewError,
  contributors,
  dateFormat,
  showBurndownButton,
  showGanttButton,
  showSprintButton,
  currentSprint,
  vscode,
}: {
  name: string;
  description: string;
  columns: Record<string, KanbnTask[]>;
  hiddenColumns: string[];
  startedColumns: string[];
  completedColumns: string[];
  columnSorting: { [columnName: string]: { field: string; order: "ascending" | "descending" }[] };
  customFields: { name: string; type: "boolean" | "date" | "number" | "string" }[];
  boards: Array<{ slug: string; name: string; main: boolean }>;
  boardSlug: string;
  startedField: string;
  completedField: string;
  simpleTasks: SimpleTask[];
  filteredTaskIds: string[] | null;
  filterError: string | null;
  views: string[];
  view: BoardView | null;
  viewError: string | null;
  contributors: Array<{ name: string; displayName: string }>;
  dateFormat: string;
  showBurndownButton: boolean;
  showGanttButton: boolean;
  showSprintButton: boolean;
  currentSprint: KanbnSprint | null;
  vscode: VSCodeApi;
}) => {
  const [, setColumns] = useState(columns);
  const [filters, setFilters] = useState<FilterValues>({});
  const [search, setSearch] = useState("");

  const { searchFilters, freeText } = useMemo(() => parseSearch(search, customFields), [search, customFields]);

  // A filter set from the panel wins over the same field typed into the search box
  const effectiveFilters = useMemo(() => ({ ...searchFilters, ...filters }), [searchFilters, filters]);

  // Filtering happens in the extension host, so that it's kanbn's filter model rather than a second
  // implementation of it. Debounced, because every change costs a board reload
  const lastSentFilters = useRef("{}");
  useEffect(() => {
    const serialised = JSON.stringify(effectiveFilters);
    if (lastSentFilters.current === serialised) {
      return;
    }
    const timer = setTimeout(() => {
      lastSentFilters.current = serialised;
      vscode.postMessage({ command: "kanbn.setFilters", filters: effectiveFilters });
    }, 200);
    return () => clearTimeout(timer);
  }, [effectiveFilters, vscode]);

  const matchingIds = useMemo(() => (filteredTaskIds === null ? null : new Set(filteredTaskIds)), [filteredTaskIds]);

  const visible = (task: KanbnTask) => {
    if (!task) {
      return false;
    }
    if (matchingIds !== null && !matchingIds.has(task.id)) {
      return false;
    }
    if (freeText) {
      const haystack = [task.id, task.name, task.description].join(" ").toLowerCase();
      if (haystack.indexOf(freeText) === -1) {
        return false;
      }
    }
    return true;
  };

  // A simple task has no fields, so it can't match a field filter - views leave them out for the
  // same reason. Free text is different: the line has text, and searching for it should find it
  const simpleTasksByColumn = useMemo(() => {
    const structurallyFiltered = Object.keys(effectiveFilters).length > 0;
    const grouped: Record<string, SimpleTask[]> = {};
    if (structurallyFiltered) {
      return grouped;
    }
    for (const simpleTask of simpleTasks) {
      if (freeText && simpleTask.text.toLowerCase().indexOf(freeText) === -1) {
        continue;
      }
      if (!(simpleTask.column in grouped)) {
        grouped[simpleTask.column] = [];
      }
      grouped[simpleTask.column].push(simpleTask);
    }
    return grouped;
  }, [simpleTasks, effectiveFilters, freeText]);

  const allTasks = useMemo(
    () => ([] as KanbnTask[]).concat(...Object.values(columns)).filter((task) => task),
    [columns],
  );

  // Every tag in use on this board, so the panel can offer them rather than asking people to
  // remember which ones exist
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const task of allTasks) {
      for (const tag of task.metadata.tags || []) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }, [allTasks]);

  // A view is drawn as a stack of lanes under one row of column headings, rather than as columns of
  // their own, so that the columns line up across every lane. The headings are the view's columns;
  // a lane repeats all of them, filtered down to that lane
  const renderView = (view: BoardView) => (
    <div className="kanbn-board kanbn-board-view">
      <div className="kanbn-view-headings">
        {view.headings.map((heading, columnIndex) => (
          <div
            className={["kanbn-column", `kanbn-column-${paramCase(heading)}`].join(" ")}
            key={`heading-${columnIndex}`}
          >
            <h2 className="kanbn-column-name">
              {
                // A view column is a filter with a label on it, but where that label happens to name
                // one of the board's own columns it means the same thing, so mark it the same way
                startedColumns.indexOf(heading) > -1 && <i className="codicon codicon-play"></i>
              }
              {completedColumns.indexOf(heading) > -1 && <i className="codicon codicon-check"></i>}
              {heading}
              <span className="kanbn-column-count">
                {view.lanes.reduce(
                  (total, lane) => total + (lane.columns[columnIndex] || []).filter(visible).length,
                  0,
                ) || ""}
              </span>
            </h2>
          </div>
        ))}
      </div>
      {view.lanes.map((lane, laneIndex) => (
        <div className="kanbn-lane" key={`lane-${laneIndex}`}>
          {
            // A view without lanes resolves to a single unnamed band, which is just the columns
            lane.name !== "" && (
              <h3 className="kanbn-lane-name">
                {lane.name}
                <span className="kanbn-lane-count">
                  {lane.columns.reduce((total, tasks) => total + tasks.filter(visible).length, 0) || ""}
                </span>
              </h3>
            )
          }
          <div className="kanbn-lane-columns">
            {lane.columns.map((tasks, columnIndex) => (
              <div
                className={["kanbn-column", `kanbn-column-${paramCase(view.headings[columnIndex])}`].join(" ")}
                key={`lane-${laneIndex}-column-${columnIndex}`}
              >
                <div className="kanbn-column-task-list-container">
                  <div className="kanbn-column-task-list">
                    {tasks.filter(visible).map((task, position) => (
                      <TaskItem
                        // A view's filters don't have to partition the board, so the same task can
                        // turn up in more than one cell - the key has to say which one
                        key={`lane-${laneIndex}-column-${columnIndex}-${task.id}`}
                        task={task}
                        // The heading above is a label chosen by the view, so the card is styled by
                        // the column the task is actually in
                        columnName={task.column}
                        customFields={customFields}
                        startedField={startedField}
                        completedField={completedField}
                        position={position}
                        dateFormat={dateFormat}
                        draggable={false}
                        vscode={vscode}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <React.Fragment>
      <div className="kanbn-header">
        <h1 className="kanbn-header-name">
          <p>{name}</p>
          <div className="kanbn-header-controls">
            {
              // A workspace with a single board has nothing to switch between, so the control
              // only appears once there is more than one. Picking a board opens its own panel
              // rather than replacing this one, so several boards can be viewed side by side
              boards.length > 1 && (
                <select
                  className="kanbn-header-board-select"
                  value={boardSlug}
                  title="Open another board"
                  onChange={(e) => {
                    const slug = e.target.value;
                    if (slug !== boardSlug) {
                      vscode.postMessage({
                        command: "kanbn.openBoard",
                        boardSlug: slug,
                      });
                    }
                  }}
                >
                  {boards.map((board) => (
                    <option key={board.slug} value={board.slug}>
                      {board.name}
                    </option>
                  ))}
                </select>
              )
            }
            {
              // A view's columns are filter sets rather than index columns, so there's no move that
              // corresponds to dragging a card from one to another. Say so, rather than leaving the
              // board looking like a drag that didn't take
              view !== null && (
                <span
                  className="kanbn-view-readonly"
                  title={[
                    `Showing the "${view.name}" view.`,
                    "A view's columns and lanes are filters over the same tasks, so tasks can't be",
                    "moved here. Switch back to Board to move tasks.",
                  ].join("\n")}
                >
                  <i className="codicon codicon-eye"></i>
                  Read-only
                </span>
              )
            }
            {
              // Views are a saved board layout, configured in the board file. A board with none
              // configured never sees this control, and behaves exactly as it did before
              views.length > 0 && (
                <select
                  className="kanbn-header-view-select"
                  value={view ? view.name : ""}
                  title="Show a view"
                  onChange={(e) => {
                    vscode.postMessage({
                      command: "kanbn.setView",
                      view: e.target.value,
                    });
                  }}
                >
                  <option value="">Board</option>
                  {views.map((viewName) => (
                    <option key={viewName} value={viewName}>
                      {viewName}
                    </option>
                  ))}
                </select>
              )
            }
            <BoardFilter
              search={search}
              onSearchChange={setSearch}
              filters={filters}
              onFiltersChange={setFilters}
              columns={Object.keys(columns)}
              tags={allTags}
              customFields={customFields}
              contributors={contributors}
              filterError={filterError}
              matchCount={allTasks.filter(visible).length}
              totalCount={allTasks.length}
            />
            {showSprintButton && (
              <button
                type="button"
                className="kanbn-header-button kanbn-header-button-sprint"
                onClick={() => {
                  vscode.postMessage({
                    command: "kanbn.sprint",
                  });
                }}
                title={[
                  "Start a new sprint",
                  currentSprint
                    ? `Current sprint:\n  ${currentSprint.name}\n  Started ${formatDate(currentSprint.start, dateFormat)}`
                    : "",
                ].join("\n")}
              >
                <i className="codicon codicon-rocket"></i>
                {currentSprint ? currentSprint.name : "No sprint"}
              </button>
            )}
            {showBurndownButton && (
              <button
                type="button"
                className="kanbn-header-button kanbn-header-button-burndown"
                onClick={() => {
                  vscode.postMessage({
                    command: "kanbn.burndown",
                  });
                }}
                title="Open burndown chart"
              >
                <i className="codicon codicon-graph-line"></i>
              </button>
            )}
            {showGanttButton && (
              <button
                type="button"
                className="kanbn-header-button kanbn-header-button-gantt"
                onClick={() => {
                  vscode.postMessage({
                    command: "kanbn.gantt",
                  });
                }}
                title="Open gantt chart"
              >
                <i className="codicon codicon-symbol-structure"></i>
              </button>
            )}
          </div>
        </h1>
        <Markdown vscode={vscode} className="kanbn-header-description" children={description} />
      </div>
      {
        // A view is resolved by the extension host, so a view that doesn't resolve is a problem with
        // the board's own config rather than with anything typed here
        viewError !== null && (
          <div className="kanbn-view-error">
            <i className="codicon codicon-warning"></i>
            {viewError}
          </div>
        )
      }
      {view !== null ? (
        renderView(view)
      ) : (
        <div className="kanbn-board">
          <DragDropContext onDragEnd={(result) => onDragEnd(result, columns, setColumns, vscode)}>
            {Object.entries(columns).map(([columnName, column]) => {
              if (hiddenColumns.indexOf(columnName) !== -1) {
                return false;
              }
              return (
                <div className={["kanbn-column", `kanbn-column-${paramCase(columnName)}`].join(" ")} key={columnName}>
                  <h2 className="kanbn-column-name">
                    {startedColumns.indexOf(columnName) > -1 && <i className="codicon codicon-play"></i>}
                    {completedColumns.indexOf(columnName) > -1 && <i className="codicon codicon-check"></i>}
                    {columnName}
                    <span className="kanbn-column-count">{column.filter(visible).length || ""}</span>
                    <button
                      type="button"
                      className="kanbn-column-button kanbn-create-task-button"
                      title={`Create task in ${columnName}`}
                      onClick={() => {
                        vscode.postMessage({
                          command: "kanbn.addTask",
                          columnName,
                        });
                      }}
                    >
                      <i className="codicon codicon-add"></i>
                    </button>
                    {((columnIsSorted, columnSortSettings) => (
                      <button
                        type="button"
                        className={[
                          "kanbn-column-button",
                          "kanbn-sort-column-button",
                          columnIsSorted ? "kanbn-column-sorted" : null,
                        ]
                          .filter((i) => i)
                          .join(" ")}
                        title={`Sort ${columnName}${
                          columnIsSorted
                            ? `\nCurrently sorted by:\n${columnSortSettings
                                .map((sorter) => `${nameToLabel(sorter.field)} (${sorter.order})`)
                                .join("\n")}`
                            : ""
                        }`}
                        onClick={() => {
                          vscode.postMessage({
                            command: "kanbn.sortColumn",
                            columnName,
                          });
                        }}
                      >
                        <i className="codicon codicon-list-filter"></i>
                      </button>
                    ))(columnName in columnSorting, columnSorting[columnName] || [])}
                  </h2>
                  <div className="kanbn-column-task-list-container">
                    <Droppable droppableId={columnName} key={columnName}>
                      {(provided, snapshot) => {
                        return (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={["kanbn-column-task-list", snapshot.isDraggingOver ? "drag-over" : null]
                              .filter((i) => i)
                              .join(" ")}
                          >
                            {column.filter(visible).map((task, position) => (
                              <TaskItem
                                task={task}
                                columnName={columnName}
                                customFields={customFields}
                                startedField={startedField}
                                completedField={completedField}
                                position={position}
                                dateFormat={dateFormat}
                                vscode={vscode}
                              />
                            ))}
                            {provided.placeholder}
                          </div>
                        );
                      }}
                    </Droppable>
                    {(simpleTasksByColumn[columnName] || []).length > 0 && (
                      <div className="kanbn-column-simple-tasks">
                        {(simpleTasksByColumn[columnName] || []).map((simpleTask) => (
                          <SimpleTaskItem
                            key={`${simpleTask.column}:${simpleTask.position}`}
                            simpleTask={simpleTask}
                            columnName={columnName}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </DragDropContext>
        </div>
      )}
    </React.Fragment>
  );
};

export default Board;
