import Board from './Board';
import TaskEditor from './TaskEditor';
import React, { useState } from "react";
import VSCodeApi from "./VSCodeApi";

declare var acquireVsCodeApi: Function;
const vscode: VSCodeApi = acquireVsCodeApi();

const zip = (a: Array<any>, b: Array<any>): Array<[any, any]> => a.map((v: any, i: number): [any, any] => [v, b[i]]);

function App() {
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState({});
  const [startedColumns, setStartedColumns] = useState([]);
  const [completedColumns, setCompletedColumns] = useState([]);
  const [dateFormat, setDateFormat] = useState('');
  const [task, setTask] = useState({});
  const [tasks, setTasks] = useState({});
  const [columnName, setColumnName] = useState('');
  const [columnNames, setColumnNames] = useState([] as string[]);

  window.addEventListener('message', event => {
    const tasks = Object.fromEntries(event.data.tasks.map(task => [task.id, task]));
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
        setStartedColumns(event.data.startedColumns);
        setCompletedColumns(event.data.completedColumns);
        break;

      case 'task':
        setTask(event.data.task);
        setTasks(tasks);
        setColumnName(event.data.columnName);
        setColumnNames(Object.keys(event.data.index.columns));
        break;
    }
    setType(event.data.type);
    setDateFormat(event.data.dateFormat);
  });

  return (
    <React.Fragment>
      {
        type === 'index' &&
        <Board
          name={name}
          description={description}
          columns={columns}
          startedColumns={startedColumns}
          completedColumns={completedColumns}
          dateFormat={dateFormat}
          vscode={vscode}
        />
      }
      {
        type === 'task' &&
        <TaskEditor
          task={task as KanbnTask|null}
          tasks={tasks}
          columnName={columnName}
          columnNames={columnNames}
          dateFormat={dateFormat}
          vscode={vscode}
        />
      }
    </React.Fragment>
  );
}

export default App;
