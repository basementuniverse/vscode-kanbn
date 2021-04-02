import React from "react";
import formatDate from 'dateformat';
import VSCodeApi from "./VSCodeApi";

const TaskEditor = ({ task, columnName, dateFormat, vscode }: {
  task: KanbnTask|null,
  columnName: string,
  dateFormat: string,
  vscode: VSCodeApi
}) => {
  return (
    <div>
      Viewing or editing task: {task ? task.name : '(creating new task)'}<br />
      Column: {columnName}
    </div>
  );
}

export default TaskEditor;
