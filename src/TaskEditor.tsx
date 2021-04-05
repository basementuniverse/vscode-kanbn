import React from 'react';
import { Formik } from 'formik';
import formatDate from 'dateformat';
import VSCodeApi from './VSCodeApi';
import { paramCase } from 'param-case';
import * as gitUsername from 'git-user-name';

const TaskEditor = ({ task, columnName, columnNames, dateFormat, vscode }: {
  task: KanbnTask|null,
  columnName: string,
  columnNames: string[],
  dateFormat: string,
  vscode: VSCodeApi
}) => {
  const editing = task !== null;

  // Called when the name field is changed
  const handleUpdateName = ({ target: { value }}, values) => {

    // Update the id preview
    values.id = paramCase(value);

    // Update the webview panel title
    vscode.postMessage({
      command: 'kanbn.updatePanelTitle',
      title: value || 'Untitled task'
    });
  };

  return (
    <div className="kanbn-task-editor">
      <h1 className="kanbn-task-editor-title">{editing ? 'Update task' : 'Create new task'}</h1>
      <Formik
        initialValues={{
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
        }}
        validate={values => {
          const errors: { name?: string } = {};
          // if (!values.email) {
          //   errors.email = 'Required';
          // } else if (
          //   !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(values.email)
          // ) {
          //   errors.email = 'Invalid email address';
          // }
          return errors;
        }}
        onSubmit={(values, { setSubmitting }) => {
          if (editing) {
            vscode.postMessage({
              command: 'kanbn.update'
            });
          } else {
            vscode.postMessage({
              command: 'kanbn.create'
            });
          }
          console.log(values);
          setSubmitting(false);
        }}
      >
        {({
          values,
          errors,
          touched,
          handleChange,
          handleBlur,
          handleSubmit,
          isSubmitting
        }) => (
          <form onSubmit={handleSubmit}>
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
                      value={values.name}
                      onChange={e => {
                        handleChange(e);
                        handleUpdateName(e, values);
                      }}
                      onBlur={handleBlur}
                    ></input>
                  </label>
                  {errors.name && touched.name && errors.name}
                  <span className="kanbn-task-id">{values.id}</span>
                </div>
                <div className="kanbn-task-field kanbn-task-field-description">
                  <label className="kanbn-task-field-label">
                    <p>Description</p>
                    <textarea
                      className="kanbn-task-field-textarea"
                      placeholder="Description"
                      name="description"
                      value={values.description}
                      onChange={handleChange}
                      onBlur={handleBlur}
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
                    disabled={isSubmitting}
                  >Save</button>
                  <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                    title="Delete"
                  >Delete</button>
                </div>
                <div className="kanbn-task-field kanbn-task-field-column">
                  <label className="kanbn-task-field-label">
                    <p>Column</p>
                    <select
                      className="kanbn-task-field-select"
                      name="column"
                      value={values.column}
                      onChange={handleChange}
                      onBlur={handleBlur}
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
                      placeholder="Assigned to"
                      name="metadata.assigned"
                      value={values.metadata.assigned}
                      onChange={handleChange}
                      onBlur={handleBlur}
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
                      value={values.metadata.due}
                      onChange={handleChange}
                      onBlur={handleBlur}
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
                      value={values.progress}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      min="0"
                      max="1"
                      step="0.05"
                    ></input>
                  </label>
                </div>
              </div>
            </div>
          </form>
        )}
      </Formik>
    </div>
  );
};

export default TaskEditor;
