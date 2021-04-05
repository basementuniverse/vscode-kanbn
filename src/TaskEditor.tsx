import React from 'react';
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik';
import formatDate from 'dateformat';
import VSCodeApi from './VSCodeApi';
import { paramCase } from 'param-case';
import gitUsername from 'git-user-name';

const TaskEditor = ({ task, tasks, columnName, columnNames, dateFormat, vscode }: {
  task: KanbnTask|null,
  tasks: Record<string, KanbnTask>,
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

  // Called when the delete task button is clicked
  const handleRemoveTask = () => {
    vscode.postMessage({
      command: 'kanbn.delete',
      taskId: task!.id
    });
  };

  // TODO progress bar below progress input
  // TODO auto-colour tags while typing
  // TODO comments
  // TODO make sure all buttons have title attributes, maybe remove labels from array delete buttons?

  return (
    <div className="kanbn-task-editor">
      <h1 className="kanbn-task-editor-title">{editing ? 'Update task' : 'Create new task'}</h1>
      <Formik
        initialValues={{
          uuid: task ? task.uuid : '',
          id: task ? task.id : '',
          name: task ? task.name : '',
          description: task ? task.description : '',
          column: columnName,
          progress: task ? task.progress : 0,
          metadata: {
            due: (task && 'due' in task.metadata) ? formatDate(new Date(task.metadata.due!), 'yyyy-mm-dd') : '',
            assigned: (task && 'assigned' in task.metadata) ? task.metadata.assigned : (gitUsername() || ''),
            tags: (task && 'tags' in task.metadata) ? task.metadata.tags : []
          },
          relations: task ? task.relations : [],
          subTasks: task ? task.subTasks : [],
          comments: task ? task.comments : []
        }}
        validate={values => {
          const errors: { name?: string } = {};

          // TODO validation

          // Task name cannot be empty
          if (!values.name) {
            errors.name = 'Task name is required.';
          }

          // Check if the id is already in use
          if (values.id in tasks && tasks[values.id].uuid !== values.uuid) {
            errors.name = 'There is already a task with the same name or id.';
          }
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
          handleChange,
          isSubmitting
        }) => (
          <Form>
            <div className="kanbn-task-editor-form">
              <div className="kanbn-task-editor-column-left">
                <div className="kanbn-task-editor-field kanbn-task-editor-field-name">
                  <label className="kanbn-task-editor-field-label">
                    <p>Name</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      name="name"
                      placeholder="Name"
                      onChange={e => {
                        handleChange(e);
                        handleUpdateName(e, values);
                      }}
                    />
                  </label>
                  <div className="kanbn-task-editor-id">{values.id}</div>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="name"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-description">
                  <label className="kanbn-task-editor-field-label">
                    <p>Description</p>
                    <Field
                      className="kanbn-task-editor-field-textarea"
                      as="textarea"
                      name="description"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="description"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-relations">
                  <h2 className="kanbn-task-editor-title">Relations</h2>
                  <FieldArray name="relations">
                    {({ insert, remove, push }) => (
                      <div>
                        {values.relations.length > 0 && values.relations.map((relation, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-relation" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-relation-type">
                              <Field
                                className="kanbn-task-editor-field-input"
                                name={`relations.${index}.type`}
                                placeholder="Relation type"
                              />
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`relations.${index}.type`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-relation-task">
                              <Field
                                className="kanbn-task-editor-field-select"
                                as="select"
                                name={`relations.${index}.task`}
                              >
                                {Object.keys(tasks).map(t => <option value={t}>{t}</option>)}
                              </Field>
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`relations.${index}.task`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>Delete
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            onClick={() => push({ type: '', task: '' })}
                          >
                            <i className="codicon codicon-plus"></i>Add relation
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-subtasks">
                  <h2 className="kanbn-task-editor-title">Sub-tasks</h2>
                  <FieldArray name="subTasks">
                    {({ insert, remove, push }) => (
                      <div>
                        {values.subTasks.length > 0 && values.subTasks.map((subTask, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-subtask" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-subtask-completed">
                              <Field
                                className="kanbn-task-editor-field-checkbox"
                                type="checkbox"
                                name={`subTasks.${index}.completed`}
                              />
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`subTasks.${index}.completed`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-subtask-text">
                              <Field
                                className="kanbn-task-editor-field-input"
                                name={`subTasks.${index}.text`}
                                placeholder="Sub-task text"
                              />
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`subTasks.${index}.text`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>Delete
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            onClick={() => push({ completed: false, text: '' })}
                          >
                            <i className="codicon codicon-plus"></i>Add sub-task
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
              </div>
              <div className="kanbn-task-editor-column-right">
                <div className="kanbn-task-editor-buttons">
                  {editing && <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                    title="Delete"
                    onClick={handleRemoveTask}
                  >
                    <i className="codicon codicon-trash"></i>Delete
                  </button>}
                  <button
                    type="submit"
                    className="kanbn-task-editor-button kanbn-task-editor-button-submit"
                    title="Save"
                    disabled={isSubmitting}
                  >
                    <i className="codicon codicon-save"></i>Save
                  </button>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-column">
                  <label className="kanbn-task-editor-field-label">
                    <p>Column</p>
                    <Field
                      className="kanbn-task-editor-field-select"
                      as="select"
                      name="column"
                    >
                      {columnNames.map(c => <option value={c}>{c}</option>)}
                    </Field>
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="column"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-assigned">
                  <label className="kanbn-task-editor-field-label">
                    <p>Assigned to</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      name="metadata.assigned"
                      placeholder="Assigned to"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.assigned"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-due">
                  <label className="kanbn-task-editor-field-label">
                    <p>Due date</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      type="date"
                      name="metadata.due"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.due"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-progress">
                  <label className="kanbn-task-editor-field-label">
                    <p>Progress</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      type="number"
                      name="progress"
                      min="0"
                      max="1"
                      step="0.05"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="progress"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-tags">
                  <label className="kanbn-task-editor-field-label">
                    <p>Tags</p>
                  </label>
                  <FieldArray name="metadata.tags">
                    {({ insert, remove, push }) => (
                      <div>
                        {(
                          'tags' in values.metadata &&
                          values.metadata.tags!.length > 0
                        ) && values.metadata.tags!.map((tag, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-tag" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-tag">
                              <Field
                                className="kanbn-task-editor-field-input"
                                name={`metadata.tags.${index}`}
                              />
                              <ErrorMessage
                                className="kanbn-task-editor-field-errors"
                                component="div"
                                name={`metadata.tags.${index}`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>Delete
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            onClick={() => push('')}
                          >
                            <i className="codicon codicon-plus"></i>Add tag
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
              </div>
            </div>
          </Form>
        )}
      </Formik>
    </div>
  );
};

export default TaskEditor;
