import Board from './Board';
import Header from './Header';
import React, { useState } from "react";

const zip = (a: Array<any>, b: Array<any>): Array<[any, any]> => a.map((v: any, i: number): [any, any] => [v, b[i]]);

function App() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState({});
  const [startedColumns, setStartedColumns] = useState([]);
  const [completedColumns, setCompletedColumns] = useState([]);
  const [dateFormat, setDateFormat] = useState('');

  window.addEventListener('message', event => {
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
    setDateFormat(event.data.dateFormat);
  });

  return (
    <div>
      <Header
        name={name}
        description={description}
      />
      <Board
        columns={columns}
        startedColumns={startedColumns}
        completedColumns={completedColumns}
        dateFormat={dateFormat}
      />
    </div>
  );
}

export default App;
