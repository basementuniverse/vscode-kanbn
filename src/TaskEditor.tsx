import React, { useReducer, useCallback } from "react";
import formatDate from 'dateformat';
import VSCodeApi from "./VSCodeApi";
import { paramCase } from 'param-case';
import produce from 'immer';
import { set, has } from 'lodash';
import * as gitUsername from 'git-user-name';

// https://levelup.gitconnected.com/handling-complex-form-state-using-react-hooks-76ee7bc937
function reducer(state, action) {
  if (action.constructor === Function) {
    return { ...state, ...action(state) };
  }
  if (action.constructor === Object) {
    if (has(action, "_path") && has(action, "_value")) {
      const { _path, _value } = action;

      return produce(state, draft => {
        set(draft, _path, _value);
      });
    } else {
      return { ...state, ...action };
    }
  }
}

const TaskEditor = ({ task, columnName, columnNames, dateFormat, vscode }: {
  task: KanbnTask|null,
  columnName: string,
  columnNames: string[],
  dateFormat: string,
  vscode: VSCodeApi
}) => {
  const editing = task !== null;
  const [taskData, setTaskData] = useReducer(reducer, {
    id: task ? task.id : '',
    name: task ? task.name : '',
    description: task ? task.description : '',
    column: columnName,
    progress: task ? task.progress : 0,
    metadata: {
      due: (task && 'due' in task.metadata) ? formatDate(new Date(task.metadata.due!), 'yyyy-mm-dd') : '',
      assigned: (task && 'assigned' in task.metadata) ? task.metadata.assigned : gitUsername(),
      tags: (task && 'tags' in task.metadata) ? task.metadata.tags : []
    },
    relations: [],
    subTasks: [],
    comments: []
  });

  const handleChange = useCallback(({ target: { value, name, type } }) => {
    const updatePath = name.split(".");

    // Handle updating checkbox states (depends on previous state)
    if (type === 'checkbox') {
      setTaskData((previousState) => ({
        [name]: !previousState[name]
      }));
      return;
    }

    // Handle updating root-level properties
    if (updatePath.length === 1) {
      const [key] = updatePath;
      const newTaskData = {
        [key]: value
      };

      // If the name is updated, generate a new id and set the webview panel title
      if (key === 'name') {
        newTaskData['id'] = paramCase(value);
        vscode.postMessage({
          command: 'kanbn.updatePanelTitle',
          title: value || 'Untitled task'
        });
      }
      setTaskData(newTaskData);
    }

    // Handle updating nested properties using _path and _value
    if (updatePath.length > 1) {
      setTaskData({
        _path: updatePath,
        _value: value
      });
    }
  }, []);

  const handleSubmit = e => {
    e.preventDefault();
    
    // If a task prop was passed in, we're updating a task, otherwise we're creating a new task
    if (editing) {
      vscode.postMessage({
        command: 'kanbn.update'
      });
    } else {
      vscode.postMessage({
        command: 'kanbn.create'
      });
    }
    console.log(e);
  };

  return (
    <form className="kanbn-task-editor" onSubmit={handleSubmit}>
      <h1 className="kanbn-task-editor-title">{editing ? 'Update task' : 'Create new task'}</h1>
      <div
        style={{
          display: "flex"
        }}
      >
        <div className="kanbn-task-editor-column-left">
          <div className="kanbn-task-field kanbn-task-field-name">
            <label className="kanbn-task-field-label">
              <p>Name</p>
              <input
                className="kanbn-task-field-input"
                placeholder="Name"
                name="name"
                value={taskData.name}
                onChange={handleChange}
              ></input>
            </label>
            <span className="kanbn-task-id">{taskData.id}</span>
          </div>
          <div className="kanbn-task-field kanbn-task-field-description">
            <label className="kanbn-task-field-label">
              <p>Description</p>
              <textarea
                className="kanbn-task-field-textarea"
                placeholder="Description"
                name="description"
                value={taskData.description}
                onChange={handleChange}
              ></textarea>
            </label>
          </div>
        </div>
        <div className="kanbn-task-editor-column-right">
          <div>
            <button
              type="submit"
              className="kanbn-task-editor-button kanbn-task-editor-button-submit"
              title="Save"
            >
              Save
            </button>
            <button
              type="button"
              className="kanbn-task-editor-button kanbn-task-editor-button-delete"
              title="Delete"
            >
              Delete
            </button>
          </div>
          <div className="kanbn-task-field kanbn-task-field-column">
            <label className="kanbn-task-field-label">
              <p>Column</p>
              <select
                className="kanbn-task-field-select"
                name="column"
                value={taskData.column}
                onChange={handleChange}
              >
                {columnNames.map(c => <option value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="kanbn-task-field kanbn-task-field-assigned">
            <label className="kanbn-task-field-label">
              <p>Assigned to</p>
              <input
                className="kanbn-task-field-input"
                name="metadata.assigned"
                value={taskData.metadata.assigned}
                onChange={handleChange}
              ></input>
            </label>
          </div>
          <div className="kanbn-task-field kanbn-task-field-due">
            <label className="kanbn-task-field-label">
              <p>Due date</p>
              <input
                type="date"
                className="kanbn-task-field-input"
                name="metadata.due"
                value={taskData.metadata.due}
                onChange={handleChange}
              ></input>
            </label>
          </div>
          <div className="kanbn-task-field kanbn-task-field-progress">
            <label className="kanbn-task-field-label">
              <p>Progress</p>
              <input
                type="number"
                className="kanbn-task-field-input"
                name="progress"
                value={taskData.progress}
                onChange={handleChange}
                min="0"
                max="1"
                step="0.05"
              ></input>
            </label>
          </div>
        </div>
      </div>
    </form>
  );
}

export default TaskEditor;
