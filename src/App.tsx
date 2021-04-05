import Header from './Header';
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
  const [columnName, setColumnName] = useState('');
  const [columnNames, setColumnNames] = useState([] as string[]);

  window.addEventListener('message', event => {
    switch (event.data.type) {
      case 'index':
        const tasks = Object.fromEntries(event.data.tasks.map(task => [task.id, task]));
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
        <React.Fragment>
          <Header
            name={name}
            description={description}
          />
          <Board
            columns={columns}
            startedColumns={startedColumns}
            completedColumns={completedColumns}
            dateFormat={dateFormat}
            vscode={vscode}
          />
        </React.Fragment>
      }
      {
        type === 'task' &&
        <TaskEditor
          task={task as KanbnTask|null}
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
