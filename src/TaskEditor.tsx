/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable react/jsx-key */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable react/no-children-prop */
import React, { useState } from 'react'
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik'
import formatDate from 'dateformat'
import VSCodeApi from './VSCodeApi'
import { paramCase } from '@basementuniverse/kanbn/src/utility'
import ReactMarkdown from 'react-markdown'
import TextareaAutosize from 'react-textarea-autosize'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import 'katex/dist/katex.min.css'

interface KanbnTaskValidationOutput {
  name: string
  metadata: {
    tags: string[]
    created?: string | Date | undefined
    updated?: string | null | undefined
    started?: string
    due?: string
    completed?: string
    assigned?: string | undefined
  }
  subTasks: Array<{
    text: string
  }>
  comments: Array<{
    author?: string
    date?: string
    text: string
  }>
}

interface KanbnTaskValidationInput extends KanbnTaskValidationOutput {
  description: any
  relations: any
  progress: number | undefined
  id: string
  column: string
}

const components = {
  code ({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? '')
    return inline !== false && (match != null)
      ? (
      <SyntaxHighlighter
        style={{}}
        useInlineStyles={false}
        language={match[1]}
        PreTag="div"
        children={String(children).replace(/\n$/, '')}
        {...props}
      />
        )
      : (
      <code className={className} children={children} {...props} />
        )
  }
}

const Markdown = props => (<ReactMarkdown {...{
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeKatex],
  components,
  ...props
}} />)

const TaskEditor = ({ task, tasks, columnName, columnNames, customFields, dateFormat, panelUuid, vscode }: {
  task: KanbnTask | null
  tasks: Record<string, KanbnTask>
  columnName: string
  columnNames: string[]
  customFields: Array<{ name: string, type: 'boolean' | 'date' | 'number' | 'string' }>
  dateFormat: string
  panelUuid: string
  vscode: VSCodeApi
}) => {
  const editing = task !== null
  const [taskData, setTaskData] = useState({
    id: (task != null) ? task.id : '',
    name: (task != null) ? task.name : '',
    description: (task != null) ? task.description : '',
    column: columnName,
    progress: (task != null) ? task.progress : 0,
    metadata: {
      created: ((task != null) && 'created' in task.metadata) ? task.metadata.created : new Date(),
      updated: ((task != null) && 'updated' in task.metadata) ? task.metadata.updated : null,
      started: ((task != null) && 'started' in task.metadata) ? formatDate(task.metadata.started, 'yyyy-mm-dd') : '',
      due: ((task != null) && 'due' in task.metadata) ? formatDate(task.metadata.due, 'yyyy-mm-dd') : '',
      completed: ((task != null) && 'completed' in task.metadata) ? formatDate(task.metadata.completed, 'yyyy-mm-dd') : '',
      assigned: ((task != null) && 'assigned' in task.metadata) ? task.metadata.assigned : '',
      tags: ((task != null) && 'tags' in task.metadata) ? (task.metadata.tags ?? []) : [],
      ...Object.fromEntries(
        customFields.map(customField => [
          customField.name,
          ((task != null) && customField.name in task.metadata)
            ? (customField.type === 'date'
                ? formatDate(task.metadata[customField.name], 'yyyy-mm-dd')
                : task.metadata[customField.name]
              )
            : null
        ])
      )
    },
    relations: (task != null) ? task.relations : [],
    subTasks: (task != null) ? task.subTasks : [],
    comments: (task != null) ? task.comments : []
  })
  const [editingDescription, setEditingDescription] = useState(!editing)
  const [editingComment, setEditingComment] = useState(-1)

  // Called when the name field is changed
  const handleUpdateName = ({ target: { value } }, values) => {
    const id = paramCase(value)

    // Update the id preview
    setTaskData({
      ...taskData,
      id
    })

    // Update values
    values.id = id

    // Update the webview panel title
    vscode.postMessage({
      command: 'kanbn.updatePanelTitle',
      title: value ?? 'Untitled task'
    })
  }

  // Called when the form is submitted
  const handleSubmit = (values, setSubmitting, resetForm) => {
    if (editing) {
      vscode.postMessage({
        command: 'kanbn.update',
        taskId: task.id,
        taskData: values,
        customFields,
        panelUuid
      })
    } else {
      vscode.postMessage({
        command: 'kanbn.create',
        taskData: values,
        customFields,
        panelUuid
      })
    }
    setTaskData(values)
    resetForm({ values })
    setSubmitting(false)
  }

  // Called when the delete task button is clicked
  const handleRemoveTask = values => {
    vscode.postMessage({
      command: 'kanbn.delete',
      taskId: task?.id,
      taskData: values,
      panelUuid
    })
  }

  // Called when the archive task button is clicked
  const handleArchiveTask = values => {
    vscode.postMessage({
      command: 'kanbn.archive',
      taskId: task?.id,
      taskData: values,
      panelUuid
    })
  }

  // Check if a task's due date is in the past
  const checkOverdue = (values: { metadata: { due?: string } }) => {
    if ('due' in values.metadata && values.metadata.due !== undefined) {
      return Date.parse(values.metadata.due) < (new Date()).getTime()
    }
    return false
  }

  // Validate form data
  const validate = (values: KanbnTaskValidationInput): KanbnTaskValidationOutput | {} => {
    let hasErrors = false
    const errors: KanbnTaskValidationOutput = {
      name: '',
      metadata: {
        tags: []
      },
      subTasks: [],
      comments: []
    }

    // Task name cannot be empty
    if (values.name === '') {
      errors.name = 'Task name is required.'
      hasErrors = true
    }

    // Check if the id is already in use
    if (taskData.id in tasks && tasks[taskData.id].uuid !== ((task != null) ? task.uuid : '')) {
      errors.name = 'There is already a task with the same name or id.'
      hasErrors = true
    }

    // Tag names cannot be empty
    for (let i = 0; i < values.metadata.tags.length; i++) {
      if (values.metadata.tags[i] === '') {
        errors.metadata.tags[i] = 'Tag cannot be empty.'
        hasErrors = true
      }
    }

    // Sub-tasks text cannot be empty
    for (let i = 0; i < values.subTasks.length; i++) {
      if (values.subTasks[i].text === '') {
        errors.subTasks[i] = {
          text: 'Sub-task text cannot be empty.'
        }
        hasErrors = true
      }
    }

    // Comments text cannot be empty
    for (let i = 0; i < values.comments.length; i++) {
      if (values.comments[i].text === '') {
        errors.comments[i] = {
          text: 'Comment text cannot be empty.'
        }
        hasErrors = true
      }
    }

    return hasErrors ? errors : {}
  }

  return (
    <div className="kanbn-task-editor">
      <Formik
        initialValues={taskData}
        validate={validate}
        onSubmit={(values, { setSubmitting, resetForm }) => {
          handleSubmit(values, setSubmitting, resetForm)
        }}
      >
        {({
          dirty,
          values,
          handleChange,
          isSubmitting
        }) => (
          <Form>
            <h1 className="kanbn-task-editor-title">
              {editing ? 'Update task' : 'Create new task'}
              {dirty && <span className="kanbn-task-editor-dirty">*</span>}
            </h1>
            <div className="kanbn-task-editor-buttons kanbn-task-editor-main-buttons">
              {editing && <button
                type="button"
                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                title="Delete task"
                onClick={() => {
                  handleRemoveTask(values)
                }}
              >
                <i className="codicon codicon-trash"></i>Delete
              </button>}
              {editing && <button
                type="button"
                className="kanbn-task-editor-button kanbn-task-editor-button-archive"
                title="Archive task"
                onClick={() => {
                  handleArchiveTask(values)
                }}
              >
                <i className="codicon codicon-archive"></i>Archive
              </button>}
              <button
                type="submit"
                className="kanbn-task-editor-button kanbn-task-editor-button-submit"
                title="Save task"
                disabled={isSubmitting}
              >
                <i className="codicon codicon-save"></i>Save
              </button>
            </div>
            {editing && <span className="kanbn-task-editor-dates">
              {
                [
                  'created' in task.metadata ? `Created ${formatDate(task.metadata.created, dateFormat)}` : null,
                  'updated' in task.metadata ? `Updated ${formatDate(task.metadata.updated, dateFormat)}` : null
                ].filter(i => i).join(', ')
              }
            </span>}
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
                        handleChange(e)
                        handleUpdateName(e, values)
                      }}
                    />
                  </label>
                  <div className="kanbn-task-editor-id">{taskData.id}</div>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="name"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-description">
                  <label
                    className="kanbn-task-editor-field-label kanbn-task-editor-field-label-description"
                    htmlFor="description-input"
                  >
                    <p>Description</p>
                  </label>
                  <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-edit-description"
                    title="Edit description"
                    onClick={() => {
                      setEditingDescription(!editingDescription)
                    }}
                  >
                    {
                      editingDescription
                        ? <React.Fragment><i className="codicon codicon-preview"></i> Preview</React.Fragment>
                        : <React.Fragment><i className="codicon codicon-edit"></i> Edit</React.Fragment>
                    }
                  </button>
                  {
                    editingDescription
                      ? <Field
                        className="kanbn-task-editor-field-textarea"
                        id="description-input"
                        as={TextareaAutosize}
                        name="description"
                      />
                      : <Markdown className="kanbn-task-editor-description-preview" children={values.description} />
                  }
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="description"
                  />
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
                                title="Remove sub-task"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add sub-task"
                            onClick={() => push({ completed: false, text: '' })}
                          >
                            <i className="codicon codicon-tasklist"></i>Add sub-task
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
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
                                title="Remove relation"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add relation"
                            onClick={() => push({ type: '', task: '' })}
                          >
                            <i className="codicon codicon-link"></i>Add relation
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-comments">
                  <h2 className="kanbn-task-editor-title">Comments</h2>
                  <FieldArray name="comments">
                    {({ insert, remove, push }) => (
                      <div>
                        {values.comments.length > 0 && values.comments.map((comment, index) => (
                          <div className="kanbn-task-editor-row-comment" key={index}>
                            <div className="kanbn-task-editor-row">
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-author">
                                {
                                  editingComment === index
                                    ? <React.Fragment>
                                      <Field
                                        className="kanbn-task-editor-field-input"
                                        name={`comments.${index}.author`}
                                        placeholder="Comment author"
                                      />
                                      <ErrorMessage
                                        className="kanbn-task-editor-field-errors"
                                        component="div"
                                        name={`comments.${index}.author`}
                                      />
                                    </React.Fragment>
                                    : <div className="kanbn-task-editor-field-comment-author-value">
                                      <i className="codicon codicon-account"></i>
                                      {comment.author ?? 'Anonymous'}
                                    </div>
                                }
                              </div>
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-date">
                                {formatDate(comment.date, dateFormat)}
                              </div>
                              <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                                <button
                                  type="button"
                                  className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                  title="Remove comment"
                                  onClick={() => remove(index)}
                                >
                                  <i className="codicon codicon-trash"></i>
                                </button>
                                <button
                                  type="button"
                                  className="kanbn-task-editor-button kanbn-task-editor-button-edit"
                                  title={editingComment === index ? 'View comment' : 'Edit comment'}
                                  onClick={() => {
                                    setEditingComment(editingComment !== index ? index : -1)
                                  }}
                                >
                                  {
                                    editingComment === index
                                      ? <i className="codicon codicon-preview"></i>
                                      : <i className="codicon codicon-edit"></i>
                                  }
                                </button>
                              </div>
                            </div>
                            <div className="kanbn-task-editor-row">
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-text">
                                {
                                  editingComment === index
                                    ? <React.Fragment>
                                      <Field
                                        className="kanbn-task-editor-field-textarea"
                                        as={TextareaAutosize}
                                        name={`comments.${index}.text`}
                                      />
                                      <ErrorMessage
                                        className="kanbn-task-editor-field-errors"
                                        component="div"
                                        name={`comments.${index}.text`}
                                      />
                                    </React.Fragment>
                                    : <Markdown className="kanbn-task-editor-comment-text" children={comment.text} />
                                }
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add comment"
                            onClick={() => {
                              push({ text: '', date: new Date(), author: '' })
                              setEditingComment(values.comments.length)
                            }}
                          >
                            <i className="codicon codicon-comment"></i>Add comment
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
              </div>
              <div className="kanbn-task-editor-column-right">
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
                <div className="kanbn-task-editor-field kanbn-task-editor-field-started">
                  <label className="kanbn-task-editor-field-label">
                    <p>Started date</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      type="date"
                      name="metadata.started"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.started"
                  />
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-due">
                  <label className="kanbn-task-editor-field-label">
                    <p>Due date</p>
                    <Field
                      className={[
                        'kanbn-task-editor-field-input',
                        checkOverdue(values) ? 'kanbn-task-overdue' : null
                      ].filter(i => i).join(' ')}
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
                <div className="kanbn-task-editor-field kanbn-task-editor-field-completed">
                  <label className="kanbn-task-editor-field-label">
                    <p>Completed date</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      type="date"
                      name="metadata.completed"
                    />
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.completed"
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
                    <div className="kanbn-task-progress" style={{
                      width: `${Math.min(1, Math.max(0, values.progress ?? 0)) * 100}%`
                    }}></div>
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="progress"
                  />
                </div>
                {
                  customFields.map(customField => (
                    <div className={[
                      'kanbn-task-editor-field kanbn-task-editor-custom-field',
                      `kanbn-task-editor-custom-field-${paramCase(customField.name)}`
                    ].join(' ')}>
                      <label className="kanbn-task-editor-field-label">
                        {customField.type === 'boolean'
                          ? (
                            <>
                              <Field
                                className="kanbn-task-editor-field-input kanbn-task-editor-custom-checkbox"
                                type="checkbox"
                                name={`metadata.${customField.name}`}
                              /><p>{customField.name}</p>
                            </>
                            )
                          : (
                            <>
                              <p>{customField.name}</p>
                              <Field
                                className="kanbn-task-editor-field-input"
                                type={{
                                  date: 'date',
                                  number: 'number',
                                  string: 'text'
                                }[customField.type]}
                                name={`metadata.${customField.name}`}
                              />
                            </>
                            )}
                      </label>
                      <ErrorMessage
                        className="kanbn-task-editor-field-errors"
                        component="div"
                        name={`metadata.${customField.name}`}
                      />
                    </div>
                  ))
                }
                <div className="kanbn-task-editor-field kanbn-task-editor-field-tags">
                  <label className="kanbn-task-editor-field-label">
                    <p>Tags</p>
                  </label>
                  <FieldArray name="metadata.tags">
                    {({ insert, remove, push }) => (
                      <div>
                        {(
                          'tags' in values.metadata &&
                          values.metadata.tags.length > 0
                        ) && values.metadata.tags.map((tag, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-tag" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-tag">
                              <Field
                                className="kanbn-task-editor-field-input"
                                name={`metadata.tags.${index}`}
                                placeholder="Tag name"
                              />
                              <div
                                className={[
                                  'kanbn-task-editor-tag-highlight',
                                  `kanbn-task-tag-${paramCase(values.metadata.tags[index])}`
                                ].join(' ')}
                              ></div>
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
                                title="Remove tag"
                                onClick={() => remove(index)}
                              >
                                <i className="codicon codicon-trash"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="kanbn-task-editor-buttons">
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-add"
                            title="Add tag"
                            onClick={() => push('')}
                          >
                            <i className="codicon codicon-tag"></i>Add tag
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
  )
}

export default TaskEditor
