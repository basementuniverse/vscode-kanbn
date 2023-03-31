/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import React, { useEffect, useState, useCallback } from 'react'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import formatDate from 'dateformat'
import vscode from './vscode'
import { paramCase } from '@basementuniverse/kanbn/src/utility'
// import ReactMarkdown from 'react-markdown'
// import TextareaAutosize from 'react-textarea-autosize'
// import remarkMath from 'remark-math'
// import rehypeKatex from 'rehype-katex'
// import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import 'katex/dist/katex.min.css'

// const Markdown = (props): JSX.Element => {
//   const components = {
//     code ({ node, inline, className, children, ...props }) {
//       const match = /language-(\w+)/.exec(className ?? '')
//       return inline !== false && (match != null)
//         ? (
//       <SyntaxHighlighter
//         style={{}}
//         useInlineStyles={false}
//         language={match[1]}
//         PreTag="div"
//         {...props}>
//           {String(children).replace(/\n$/, '')}
//         </SyntaxHighlighter>
//           )
//         : (
//       <code className={className} {...props}>
//         {children}
//       </code>
//           )
//     }
//   }

//   return (<ReactMarkdown {...{
//     remarkPlugins: [remarkMath],
//     rehypePlugins: [rehypeKatex],
//     components,
//     ...props
//   }} />)
// }

interface Metadata {
  created: Date
  updated: Date
  started: Date | null
  due: Date | null
  completed: Date | null
  assigned: string
  tags: string[]
}

interface CustomField {
  name: string
  type: string
}

interface EditorState {
  name: string
  description: string
  column: string
  progress: number
  metadata: Metadata
  relations: string[]
  subTasks: string[]
  comments: string[]
  customFields: CustomField[]
  // Not sure about the types of these yet.
  focusedOn: string
  dirty: string[]
  touched: string[]
}

interface Task {
  id: string
}

interface TaskState {
  name: string
  dateFormat: string
  taskCreated: boolean
  tasks: Record<string, Task>
  columnNames: string[]
  createdDate: Date | null
  updatedDate: Date | null
  customFields: CustomField[]
}

// interface Comment {
//   author: string
//   date: Date
// }

// vscode state is task data as shown in the form, and the state of the form
// react state is all the other stuff, like the available columnNames, tasks, task, dateFormat, name.
const TaskEditor = (): JSX.Element => {
  // vscode state will store the form data when the editor is hidden
  const [state, setState] = useState<TaskState | null>(null)

  // Called when the name field is changed
  // const handleFormValuesChange = (e, values): void => {
  //   console.log(e)
  //   console.log(values)
  //   const newState = { ...state, taskData: values }
  //   setState(newState)
  //   vscode.setState(values)
  // }

  // Called when the form is submitted
  const handleTaskSave = (values): void => {
    const newValues = { ...values, id: paramCase(values.name ?? '') }
    vscode.postMessage({
      command: 'kanbn.updateOrCreate',
      taskData: newValues
    })
  }
  // Called when the delete task button is clicked
  const handleRemoveTask = (): void => {
    vscode.postMessage({
      command: 'kanbn.delete'
    })
  }

  // Called when the archive task button is clicked
  const handleArchiveTask = (): void => {
    vscode.postMessage({
      command: 'kanbn.archive'
    })
  }

  // Check if a task's due date is in the past
  // const checkOverdue = (values: { metadata: { due?: string } }): boolean => {
  //   if ('due' in values.metadata && values.metadata.due !== undefined) {
  //     return Date.parse(values.metadata.due) < (new Date()).getTime()
  //   }
  //   return false
  // }

  // Validate form data
  const validateName = (name: string): boolean => {
    if (state === null) { return false }
    if (paramCase(name ?? '') in state.tasks && paramCase(name ?? '') !== paramCase(state.name ?? '')) { return false }
    return true
  }

  useEffect(() => {
    vscode.postMessage({
      command: 'kanbn.updateMe'
    })
  }, [])

  // TODO: set default values here.
  const { control, register, handleSubmit, formState: { isDirty, isSubmitting } } = useForm()
  const {
    fields: commentFields,
    append: appendComment,
    // prepend: prependComment,
    remove: removeComment
    // swap: swapComment,
    // move: moveComment,
    // insert: insertComment
  } = useFieldArray({
    control, // control props comes from useForm (optional: if you are using FormContext)
    name: 'comments' // unique name for your Field Array
  })
  // subtasks
  const {
    fields: subtaskFields,
    append: appendSubtask,
    // prepend: prependComment,
    remove: removeSubtask
    // swap: swapComment,
    // move: moveComment,
    // insert: insertComment
  } = useFieldArray({
    control, // control props comes from useForm (optional: if you are using FormContext)
    name: 'subtasks' // unique name for your Field Array
  })
  // relations
  const {
    fields: relationFields,
    append: appendRelation,
    // prepend: prependComment,
    remove: removeRelation
    // swap: swapComment,
    // move: moveComment,
    // insert: insertComment
  } = useFieldArray({
    control, // control props comes from useForm (optional: if you are using FormContext)
    name: 'relations' // unique name for your Field Array
  })
  // tags
  const {
    fields: tagFields,
    append: appendTag,
    // prepend: prependComment,
    remove: removeTag
    // swap: swapComment,
    // move: moveComment,
    // insert: insertComment
  } = useFieldArray({
    control, // control props comes from useForm (optional: if you are using FormContext)
    name: 'tags' // unique name for your Field Array
  })

  const watchedProgress = useWatch({
    control,
    name: 'progress'
  })
  const setEditorState = (editorState: EditorState): void => {

  }
  // const getEditorState = (): EditorState => {
  //   return {
  //     name: '',
  //     description: '',
  //     column: '',
  //     progress: 0,
  //     metadata: {
  //       created: new Date(),
  //       updated: new Date(),
  //       started: new Date(),
  //       due: new Date(),
  //       completed: new Date(),
  //       assigned: '',
  //       tags: []
  //     },
  //     relations: [],
  //     subTasks: [],
  //     comments: [],
  //     customFields: [],
  //     focusedOn: '',
  //     dirty: [],
  //     touched: []
  //   }
  // }
  const initialEditorState: EditorState | undefined = vscode.getState()
  if (initialEditorState !== undefined) {
    useEffect(() => {
      setEditorState(initialEditorState)
    }, [])
  }

  const processMessage = useCallback(event => {
    console.log('Received message from webview', event.data)
    const tasks = Object.fromEntries((event.data.tasks ?? []).map(task => [task.id, task]))
    const newState: TaskState = {
      // TODO: Not sure yet if name is necessary. Definitely won't be necessary in the future
      name: event.data.name,
      taskCreated: event.data.task !== null,
      tasks,
      columnNames: Object.keys(event.data.index.columns),
      // TODO: might be able to get this directly from a configuration
      dateFormat: event.data.dateFormat,
      createdDate: event.data.task?.metadata?.created ?? null,
      updatedDate: event.data.task?.metadata?.updated ?? null,
      customFields: event.data.customFields ?? []
    }
    if (vscode.getState() === undefined) {
      setEditorState({
        name: event.data.task?.name ?? '',
        description: event.data.task?.description ?? '',
        column: event.data.columnName,
        progress: event.data.task?.progress ?? 0,
        metadata: {
          created: event.data.task?.metadata?.created ?? null,
          updated: event.data.task?.metadata?.updated ?? null,
          started: event.data.task?.metadata?.started ?? null,
          due: event.data.task?.metadata?.due ?? null,
          completed: event.data.task?.metadata?.completed ?? null,
          assigned: event.data.task?.metadata?.assigned ?? '',
          tags: event.data.task?.metadata?.tags ?? []
        },
        relations: event.data.task?.relations ?? [],
        subTasks: event.data.task?.subTasks ?? [],
        comments: event.data.task?.comments ?? [],
        customFields: event.data.task?.customFields ?? [],
        focusedOn: '',
        dirty: [],
        touched: []
      })
    }
    setState(newState)
  }, [])

  useEffect(() => {
    window.addEventListener('message', processMessage)
    return () => {
      window.removeEventListener('message', processMessage)
    }
  })

  const vscodeState = vscode.getState()
  // Set the initial state of the form once
  if (vscodeState !== undefined) {
    useEffect(() => {
      setEditorState(vscodeState)
    }, [])
  }

  if (state === null) {
    return <div className="kanbn-task-editor">Loading...</div>
  }
  return (
    <div className="kanbn-task-editor">
      <form onSubmit={handleSubmit(handleTaskSave)}>
        {/* initialValues={state.taskData}
        enableReinitialize
        onSubmit={(values, { setSubmitting, resetForm }) => {
          handleSubmit(values, setSubmitting, resetForm)
        }} */}
      {/* > */}
        {/* {({
          dirty,
          values,
          handleChange,
          isSubmitting
        }) => ( */}
          {/* <Form
          onChange={(e) => {
            handleChange(e)
            handleFormValuesChange(e, values)
          }}> */}
            <h1 className="kanbn-task-editor-title">
              {state.taskCreated ? 'Update task' : 'Create new task'}
              {isDirty && <span className="kanbn-task-editor-dirty">*</span>}
            </h1>
            <div className="kanbn-task-editor-buttons kanbn-task-editor-main-buttons">
              {state.taskCreated && <button
                type="button"
                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                title="Delete task"
                onClick={() => {
                  handleRemoveTask()
                }}
              >
                <i className="codicon codicon-trash"></i>Delete
              </button>}
              {state.taskCreated && <button
                type="button"
                className="kanbn-task-editor-button kanbn-task-editor-button-archive"
                title="Archive task"
                onClick={() => {
                  handleArchiveTask()
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
            {state.taskCreated && <span className="kanbn-task-editor-dates">
              {
                [
                  state.createdDate ? `Created ${formatDate(state.createdDate, state.dateFormat)}` : null,
                  state.updatedDate ? `Updated ${formatDate(state.updatedDate, state.dateFormat)}` : null
                ].filter(i => i).join(', ')
              }
            </span>}
            <div className="kanbn-task-editor-form">
              <div className="kanbn-task-editor-column-left">
                <div className="kanbn-task-editor-field kanbn-task-editor-field-name">
                  <label className="kanbn-task-editor-field-label">
                    <p>Name</p>
                    <input
                      {...register('name', { required: true, validate: validateName })}
                      className="kanbn-task-editor-field-input"
                      placeholder="Name"
                    />
                  </label>
                  <div className="kanbn-task-editor-id">{(paramCase(state.name ?? ''))}</div>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-description">
                  <label
                    className="kanbn-task-editor-field-label kanbn-task-editor-field-label-description"
                    htmlFor="description-input"
                  >
                    <p>Description</p>
                  </label>
                  {/* <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-edit-description"
                    title="Edit description"
                    // TODO: make the text box the button
                    // onClick={() => {
                    //   setEditingDescription(!state.editingDescription)
                    // }}
                  > */}
                    {/* {
                      state.editingDescription
                        ? <><i className="codicon codicon-preview"></i> Preview</> */}
                        {/* <><i className="codicon codicon-edit"></i> Edit</> */}
                    {/* } */}
                  {/* </button> */}
                  {
                    // state.editingDescription
                      <textarea
                        {...register('description')}
                        className="kanbn-task-editor-field-textarea"
                        id="description-input"
                        // TODO: figure out how to replace the TextareaAutosize component
                        // as={TextareaAutosize}
                        // name="description"
                      />
                      // TODO: temporarily disabling markup at the moment
                      // : <Markdown className="kanbn-task-editor-description-preview">
                      //   {state.taskData?.description ?? ''}
                      // </Markdown>
                  }
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-subtasks">
                  <h2 className="kanbn-task-editor-title">Sub-tasks</h2>
                  {/* <FieldArray name="subTasks"> */}<>
                    {/* {({ insert, remove, push }) => ( */}
                      <div>
                        {subtaskFields.map((subTask: any, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-subtask" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-subtask-completed">
                              <input
                                {...register(`subTasks.${index}.completed`, { required: true })}
                                defaultValue={subTask.completed}
                                className="kanbn-task-editor-field-checkbox"
                                type="checkbox"
                                // name={`subTasks.${index}.completed`}
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-subtask-text">
                              <input
                                {...register(`subTasks.${index}.text`)}
                                defaultValue={subTask.text}
                                className="kanbn-task-editor-field-input"
                                // name={`subTasks.${index}.text`}
                                placeholder="Sub-task text"
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                title="Remove sub-task"
                                onClick={() => removeSubtask(index)}
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
                            onClick={() => appendSubtask({ completed: false, text: '' })}
                          >
                            <i className="codicon codicon-tasklist"></i>Add sub-task
                          </button>
                        </div>
                      </div>
                    {/* )} */}
                  {/* </FieldArray> */}</>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-relations">
                  <h2 className="kanbn-task-editor-title">Relations</h2>
                  {/* <FieldArray name="relations"> */}<>
                    {/* {({ insert, remove, push }) => ( */}
                      <div>
                        {relationFields.map((relation: any, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-relation" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-relation-type">
                              <input
                                {...register(`relations.${index}.type`)}
                                className="kanbn-task-editor-field-input"
                                defaultValue={relation.type}
                                // name={`relations.${index}.type`}
                                placeholder="Relation type"
                              />
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-relation-task">
                              <select
                                {...register(`relations.${index}.task`)}
                                defaultValue={relation.task}
                                className="kanbn-task-editor-field-select"
                                // as="select"
                                // name={`relations.${index}.task`}
                              >
                                {Object.keys(state.tasks).map(t => <option key={state.tasks[t].id} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                title="Remove relation"
                                onClick={() => removeRelation(index)}
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
                            onClick={() => appendRelation({ type: '', task: '' })}
                          >
                            <i className="codicon codicon-link"></i>Add relation
                          </button>
                        </div>
                      </div>
                    {/* )} */}
                  {/* </FieldArray> */}</>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-comments">
                  <h2 className="kanbn-task-editor-title">Comments</h2>
                  {/* <FieldArray name="comments"> */}<>
                    {/* {({ insert, remove, push }) => ( */}
                      <div>
                        {commentFields.map((comment: any, index) => (
                          <div className="kanbn-task-editor-row-comment" key={index}>
                            <div className="kanbn-task-editor-row">
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-author">
                                {
                                  // state.editingComment === index
                                    <>
                                      <input
                                        {...register(`comments.${index}.author`, { required: true })}
                                        className="kanbn-task-editor-field-input"
                                        // name={`comments.${index}.author`}
                                        placeholder="Comment author"
                                        defaultValue={comment.author}
                                      />
                                    </>
                                    // : <div className="kanbn-task-editor-field-comment-author-value">
                                    //   <i className="codicon codicon-account"></i>
                                    //   {comment.author ?? 'Anonymous'}
                                    // </div>
                                }
                              </div>
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-date">
                                {formatDate(comment.date, state.dateFormat)}
                              </div>
                              <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                                <button
                                  type="button"
                                  className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                  title="Remove comment"
                                  onClick={() => removeComment(index)}
                                >
                                  <i className="codicon codicon-trash"></i>
                                </button>
                                {/* <button
                                  type="button"
                                  className="kanbn-task-editor-button kanbn-task-editor-button-edit"
                                  title={state.editingComment === index ? 'View comment' : 'Edit comment'}
                                  onClick={() => {
                                    setEditingComment(state.editingComment !== index ? index : -1)
                                  }}
                                >
                                  {
                                    state.editingComment === index
                                      ? <i className="codicon codicon-preview"></i>
                                      : <i className="codicon codicon-edit"></i>
                                  }
                                </button> */}
                              </div>
                            </div>
                            <div className="kanbn-task-editor-row">
                              <div className="kanbn-task-editor-column kanbn-task-editor-field-comment-text">
                                {
                                  // state.editingComment === index
                                     <>
                                      <input
                                        {...register(`comments.${index}.text`)}
                                        className="kanbn-task-editor-field-textarea"
                                        defaultValue={comment.text}
                                        // as={TextareaAutosize}
                                        // name={`comments.${index}.text`}
                                      />
                                    </>
                                    // TODO: show markdown again
                                    // : <Markdown className="kanbn-task-editor-comment-text">
                                    //   {comment.text}
                                    // </Markdown>
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
                              appendComment({ text: '', date: new Date(), author: '' })
                              // setEditingComment(values.comments.length)
                            }}
                          >
                            <i className="codicon codicon-comment"></i>Add comment
                          </button>
                        </div>
                      </div>
                    {/* )} */}
                  {/* </FieldArray> */}</>
                </div>
              </div>
              <div className="kanbn-task-editor-column-right">
                <div className="kanbn-task-editor-field kanbn-task-editor-field-column">
                  <label className="kanbn-task-editor-field-label">
                    <p>Column</p>
                    <select
                      {...register('column')}
                      className="kanbn-task-editor-field-select"
                      // as="select"
                      // name="column"
                    >
                      {state.columnNames.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-assigned">
                  <label className="kanbn-task-editor-field-label">
                    <p>Assigned to</p>
                    <input
                      {...register('metadata.assigned')}
                      className="kanbn-task-editor-field-input"
                      // name="metadata.assigned"
                      placeholder="Assigned to"
                    />
                  </label>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-started">
                  <label className="kanbn-task-editor-field-label">
                    <p>Started date</p>
                    <input
                      {...register('metadata.started')}
                      className="kanbn-task-editor-field-input"
                      type="date"
                      // name="metadata.started"
                    />
                  </label>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-due">
                  <label className="kanbn-task-editor-field-label">
                    <p>Due date</p>
                    <input
                      {...register('metadata.due')}
                      className={[
                        'kanbn-task-editor-field-input'
                        // TODO: fix this
                        // checkOverdue(values) ? 'kanbn-task-overdue' : null
                      ].filter(i => i).join(' ')}
                      type="date"
                      // name="metadata.due"
                    />
                  </label>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-completed">
                  <label className="kanbn-task-editor-field-label">
                    <p>Completed date</p>
                    <input
                      {...register('metadata.completed')}
                      className="kanbn-task-editor-field-input"
                      type="date"
                      // name="metadata.completed"
                    />
                  </label>
                </div>
                <div className="kanbn-task-editor-field kanbn-task-editor-field-progress">
                  <label className="kanbn-task-editor-field-label">
                    <p>Progress</p>
                    <input
                      {...register('progress')}
                      className="kanbn-task-editor-field-input"
                      type="number"
                      // name="progress"
                      min="0"
                      max="1"
                      step="0.05"
                    />
                    <div className="kanbn-task-progress" style={{
                      width: `${Math.min(1, Math.max(0, watchedProgress ?? 0)) * 100}%`
                    }}></div>
                  </label>
                </div>
                {
                  state.customFields.map(customField => (
                    <div key={(customField).name} className={[
                      'kanbn-task-editor-field kanbn-task-editor-custom-field',
                      `kanbn-task-editor-custom-field-${paramCase(customField.name ?? '')}`
                    ].join(' ')}>
                      <label className="kanbn-task-editor-field-label">
                        {(customField).type === 'boolean'
                          ? (
                            <>
                              <input
                                {...register(`metadata.${(customField).name}`)}
                                className="kanbn-task-editor-field-input kanbn-task-editor-custom-checkbox"
                                type="checkbox"
                                // name={`metadata.${(customField as any).name}`}
                              /><p>{(customField).name}</p>
                            </>
                            )
                          : (
                            <>
                              <p>{(customField).name}</p>
                              <input
                                {...register(`metadata.${(customField).name}`)}
                                className="kanbn-task-editor-field-input"
                                type={{
                                  date: 'date',
                                  number: 'number',
                                  string: 'text'
                                }[customField.type]}
                                // name={`metadata.${(customField as any).name}`}
                              />
                            </>
                            )}
                      </label>
                    </div>
                  ))
                }
                <div className="kanbn-task-editor-field kanbn-task-editor-field-tags">
                  <label className="kanbn-task-editor-field-label">
                    <p>Tags</p>
                  </label>
                  {/* <FieldArray name="metadata.tags"> */}<>
                    {/* {({ insert, remove, push }) => ( */}
                      <div>
                        {tagFields.map((tag, index) => (
                          <div className="kanbn-task-editor-row kanbn-task-editor-row-tag" key={index}>
                            <div className="kanbn-task-editor-column kanbn-task-editor-field-tag">
                              <input
                                {...register(`metadata.tags.${index}`, { required: true })}
                                className="kanbn-task-editor-field-input"
                                // name={`metadata.tags.${index}`}
                                placeholder="Tag name"
                              />
                              <div
                                className={[
                                  'kanbn-task-editor-tag-highlight',
                                  `kanbn-task-tag-${paramCase(tag ?? '')}`
                                ].join(' ')}
                              ></div>
                            </div>
                            <div className="kanbn-task-editor-column kanbn-task-editor-column-buttons">
                              <button
                                type="button"
                                className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                                title="Remove tag"
                                onClick={() => removeTag(index)}
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
                            onClick={() => appendTag('')}
                          >
                            <i className="codicon codicon-tag"></i>Add tag
                          </button>
                        </div>
                      </div>
                    {/* )} */}
                  {/* </FieldArray> */}</>
                </div>
              </div>
            </div>
          {/* </Form> */}
        {/* )} */}
      </form>
    </div>
  )
}

export default TaskEditor
