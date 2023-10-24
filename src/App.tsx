import Board from "./Board";
import Burndown from "./Burndown";
import TaskEditor from "./TaskEditor";
import React, { useState, useEffect, useCallback } from "react";
import VSCodeApi from "./VSCodeApi";

declare var acquireVsCodeApi: Function;
const vscode: VSCodeApi = acquireVsCodeApi();

const zip = (a: Array<any>, b: Array<any>): Array<[any, any]> => a.map((v: any, i: number): [any, any] => [v, b[i]]);

function App() {
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState({});
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [startedColumns, setStartedColumns] = useState([]);
  const [completedColumns, setCompletedColumns] = useState([]);
  const [columnSorting, setColumnSorting] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [dateFormat, setDateFormat] = useState("");
  const [task, setTask] = useState({});
  const [tasks, setTasks] = useState({});
  const [columnName, setColumnName] = useState("");
  const [columnNames, setColumnNames] = useState([] as string[]);
  const [panelUuid, setPanelUuid] = useState("");
  const [showBurndownButton, setShowBurndownButton] = useState(false);
  const [showSprintButton, setShowSprintButton] = useState(false);
  const [sprints, setSprints] = useState([]);
  const [currentSprint, setCurrentSprint] = useState(null);
  const [burndownData, setBurndownData] = useState({ series: [] });

  const processMessage = useCallback((event) => {
    const tasks = event.data.tasks ? Object.fromEntries(event.data.tasks.map((task) => [task.id, task])) : {};
    switch (event.data.type) {
      case "index":
        setName(event.data.index.name);
        setDescription(event.data.index.description);
        setColumns(
          Object.fromEntries(
            zip(
              Object.keys(event.data.index.columns),
              Object.values(event.data.index.columns).map((column) =>
                (column as string[]).map((taskId) => tasks[taskId])
              )
            )
          )
        );
        setHiddenColumns(event.data.hiddenColumns);
        setStartedColumns(event.data.startedColumns);
        setCompletedColumns(event.data.completedColumns);
        setColumnSorting(event.data.columnSorting);
        setCustomFields(event.data.customFields);
        setShowBurndownButton(event.data.showBurndownButton);
        setShowSprintButton(event.data.showSprintButton);

        // Get current sprint
        let sprint = null;
        if ("sprints" in event.data.index.options && event.data.index.options.sprints.length) {
          sprint = event.data.index.options.sprints[event.data.index.options.sprints.length - 1];
        }
        setCurrentSprint(sprint);
        break;

      case "task":
        setTask(event.data.task);
        setTasks(tasks);
        setColumnName(event.data.columnName);
        setColumnNames(Object.keys(event.data.index.columns));
        setCustomFields(event.data.customFields);
        setPanelUuid(event.data.panelUuid);
        break;

      case "burndown":
        setName(event.data.index.name);
        setTasks(tasks);
        setSprints("sprints" in event.data.index.options ? event.data.index.options.sprints : []);
        setBurndownData(event.data.burndownData);
        break;
    }
    setType(event.data.type);
    setDateFormat(event.data.dateFormat);
  }, []);

  useEffect(() => {
    window.addEventListener("message", processMessage);
    return () => {
      window.removeEventListener("message", processMessage);
    };
  });

  return (
    <React.Fragment>
      {type === "index" && (
        <Board
          name={name}
          description={description}
          columns={columns}
          hiddenColumns={hiddenColumns}
          startedColumns={startedColumns}
          completedColumns={completedColumns}
          columnSorting={columnSorting}
          customFields={customFields}
          dateFormat={dateFormat}
          showBurndownButton={showBurndownButton}
          showSprintButton={showSprintButton}
          currentSprint={currentSprint}
          vscode={vscode}
        />
      )}
      {type === "task" && (
        <TaskEditor
          task={task as KanbnTask | null}
          tasks={tasks}
          columnName={columnName}
          columnNames={columnNames}
          customFields={customFields}
          dateFormat={dateFormat}
          panelUuid={panelUuid}
          vscode={vscode}
        />
      )}
      {type === "burndown" && (
        <Burndown name={name} sprints={sprints} burndownData={burndownData} dateFormat={dateFormat} vscode={vscode} />
      )}
    </React.Fragment>
  );
}

export default App;
