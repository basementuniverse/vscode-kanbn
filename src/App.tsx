import Board from './Board';
import Burndown from './Burndown';
import Gantt from './Gantt';
import TaskEditor from './TaskEditor';
import React, { useState, useEffect, useCallback } from "react";
import VSCodeApi from "./VSCodeApi";

declare var acquireVsCodeApi: Function;
const vscode: VSCodeApi = acquireVsCodeApi();

const zip = (a: Array<any>, b: Array<any>): Array<[any, any]> => a.map((v: any, i: number): [any, any] => [v, b[i]]);

function App() {
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState({});
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [startedColumns, setStartedColumns] = useState([]);
  const [completedColumns, setCompletedColumns] = useState([]);
  const [columnSorting, setColumnSorting] = useState({});
  const [boards, setBoards] = useState([] as Array<{ slug: string, name: string, main: boolean }>);
  const [boardSlug, setBoardSlug] = useState('');
  const [startedField, setStartedField] = useState('started');
  const [completedField, setCompletedField] = useState('completed');
  const [taskBoards, setTaskBoards] = useState({} as Record<string, string>);
  const [contributors, setContributors] = useState(
    [] as Array<{ name: string, displayName: string, colour?: string }>
  );
  const [currentUser, setCurrentUser] = useState('');
  const [simpleTasks, setSimpleTasks] = useState(
    [] as Array<{ column: string, position: number, text: string, raw: string }>
  );
  const [filteredTaskIds, setFilteredTaskIds] = useState<string[] | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [views, setViews] = useState([] as string[]);
  const [view, setView] = useState<BoardView | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState([]);
  const [dateFormat, setDateFormat] = useState('');
  const [task, setTask] = useState({});
  const [tasks, setTasks] = useState({});
  const [columnName, setColumnName] = useState('');
  const [columnNames, setColumnNames] = useState([] as string[]);
  const [panelUuid, setPanelUuid] = useState('');
  const [autoSaveMode, setAutoSaveMode] = useState('off');
  const [autoSaveDelay, setAutoSaveDelay] = useState(1000);
  const [showBurndownButton, setShowBurndownButton] = useState(false);
  const [showGanttButton, setShowGanttButton] = useState(false);
  const [showSprintButton, setShowSprintButton] = useState(false);
  const [sprints, setSprints] = useState([]);
  const [currentSprint, setCurrentSprint] = useState(null);
  const [burndownData, setBurndownData] = useState({ series: [] });
  const [ganttData, setGanttData] = useState({
    from: null,
    to: null,
    dependencyCycleDetected: false,
    dependencyCycleTaskIds: [],
    cycleFallbackTaskIds: [],
    tasks: []
  });
  const taskKey = `${panelUuid}:${(task as any) && (task as any).uuid ? (task as any).uuid : 'new'}`;

  const processMessage = useCallback(event => {
    const tasks = event.data.tasks
      ? Object.fromEntries(event.data.tasks.map(task => [task.id, task]))
      : {};
    switch (event.data.type) {
      case 'index':
        setName(event.data.index.name);
        setDescription(event.data.index.description);
        setColumns(Object.fromEntries(
          zip(
            Object.keys(event.data.index.columns),
            Object.values(event.data.index.columns).map(column => (column as string[]).map(taskId => tasks[taskId]))
          )
        ));
        setHiddenColumns(event.data.hiddenColumns);
        setStartedColumns(event.data.startedColumns);
        setCompletedColumns(event.data.completedColumns);
        setColumnSorting(event.data.columnSorting);
        setCustomFields(event.data.customFields);
        setBoards(event.data.boards || []);
        setBoardSlug(event.data.boardSlug || '');
        setStartedField(event.data.startedField || 'started');
        setCompletedField(event.data.completedField || 'completed');
        setSimpleTasks(event.data.simpleTasks || []);
        setFilteredTaskIds(
          event.data.filteredTaskIds === undefined ? null : event.data.filteredTaskIds
        );
        setFilterError(event.data.filterError === undefined ? null : event.data.filterError);
        setViews(event.data.views || []);

        // A view arrives as ids, since its columns and lanes are drawn from the same tasks the rest
        // of the board is. The same task can appear in more than one cell if it matches more than
        // one filter set, which is often the point of a view
        setView(event.data.view
          ? {
            name: event.data.view.name,
            headings: event.data.view.headings,
            lanes: event.data.view.lanes.map(lane => ({
              name: lane.name,
              columns: lane.columns.map(
                (taskIds: string[]) => taskIds.map(taskId => tasks[taskId]).filter(task => task)
              )
            }))
          }
          : null);
        setViewError(event.data.viewError === undefined ? null : event.data.viewError);
        setContributors(event.data.contributors || []);
        setShowBurndownButton(event.data.showBurndownButton);
        setShowGanttButton(event.data.showGanttButton);
        setShowSprintButton(event.data.showSprintButton);

        // Get current sprint
        let sprint = null;
        if ('sprints' in event.data.index.options && event.data.index.options.sprints.length) {
          sprint = event.data.index.options.sprints[event.data.index.options.sprints.length - 1];
        }
        setCurrentSprint(sprint);
        break;

      case 'task':
        setTask(event.data.task);
        setTasks(tasks);
        setTaskBoards(event.data.taskBoards || {});
        setContributors(event.data.contributors || []);
        setCurrentUser(event.data.currentUser || '');
        setBoardSlug(event.data.boardSlug || '');
        setColumnName(event.data.columnName);
        setColumnNames(Object.keys(event.data.index.columns));
        setCustomFields(event.data.customFields);
        setPanelUuid(event.data.panelUuid);
        setAutoSaveMode(event.data.autoSaveMode || 'off');
        setAutoSaveDelay(event.data.autoSaveDelay || 1000);
        break;

      case 'burndown':
        setName(event.data.index.name);
        setTasks(tasks);
        setSprints(
          'sprints' in event.data.index.options
            ? event.data.index.options.sprints
            : []
        );
        setBurndownData(event.data.burndownData);
        break;

      case 'gantt':
        setName(event.data.index.name);
        setSprints(
          event.data.index && event.data.index.options && event.data.index.options.sprints
            ? event.data.index.options.sprints
            : []
        );
        setGanttData(event.data.ganttData);
        break;
    }
    setType(event.data.type);
    setDateFormat(event.data.dateFormat);
  }, []);

  useEffect(() => {
    window.addEventListener('message', processMessage);
    return () => {
      window.removeEventListener('message', processMessage);
    };
  });

  // Tell the extension we're listening. Messages posted before this point are lost - postMessage
  // isn't buffered - and the panel would sit empty until something else triggered a refresh
  useEffect(() => {
    vscode.postMessage({ command: 'kanbn.webviewReady' });
  }, []);

  return (
    <React.Fragment>
      {
        type === 'index' &&
        <Board
          name={name}
          description={description}
          columns={columns}
          hiddenColumns={hiddenColumns}
          startedColumns={startedColumns}
          completedColumns={completedColumns}
          columnSorting={columnSorting}
          customFields={customFields}
          boards={boards}
          boardSlug={boardSlug}
          startedField={startedField}
          completedField={completedField}
          simpleTasks={simpleTasks}
          filteredTaskIds={filteredTaskIds}
          filterError={filterError}
          views={views}
          view={view}
          viewError={viewError}
          contributors={contributors}
          dateFormat={dateFormat}
          showBurndownButton={showBurndownButton}
          showGanttButton={showGanttButton}
          showSprintButton={showSprintButton}
          currentSprint={currentSprint}
          vscode={vscode}
        />
      }
      {
        type === 'task' &&
        <TaskEditor
          key={taskKey}
          task={task as KanbnTask|null}
          tasks={tasks}
          columnName={columnName}
          columnNames={columnNames}
          customFields={customFields}
          taskBoards={taskBoards}
          contributors={contributors}
          currentUser={currentUser}
          boardSlug={boardSlug}
          dateFormat={dateFormat}
          panelUuid={panelUuid}
          autoSaveMode={autoSaveMode as 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange'}
          autoSaveDelay={autoSaveDelay}
          vscode={vscode}
        />
      }
      {
        type === 'burndown' &&
        <Burndown
          name={name}
          sprints={sprints}
          burndownData={burndownData}
          dateFormat={dateFormat}
          vscode={vscode}
        />
      }
      {
        type === 'gantt' &&
        <Gantt
          name={name}
          ganttData={ganttData}
          dateFormat={dateFormat}
          vscode={vscode}
        />
      }
    </React.Fragment>
  );
}

export default App;
