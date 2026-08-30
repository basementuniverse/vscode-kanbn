import React, { useEffect, useRef, useState } from 'react';
import { Formik, Form, Field, ErrorMessage, FieldArray } from 'formik';
import formatDate from 'dateformat';
import VSCodeApi from './VSCodeApi';
import { paramCase } from '@basementuniverse/kanbn/src/utility';
import { nameToLabel, nameToLowerLabel } from './labels';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import 'katex/dist/katex.min.css';

interface KanbnTaskValidationOutput {
  name: string,
  metadata: {
    tags: string[]
  },
  subTasks: Array<{
    text: string
  }>,
  comments: Array<{
    text: string
  }>
}

interface KanbnTaskValidationInput extends KanbnTaskValidationOutput {
  id: string
}

type AutoSaveMode = 'off' | 'afterDelay' | 'onFocusChange' | 'onWindowChange';
type SaveStatus = 'idle' | 'saving' | 'saved';

const AUTO_SAVE_STATUS_DURATION = 1500;
const AUTO_SAVE_ENABLED_FOR_NEW_TASKS = false;

const CONTRIBUTORS_LIST_ID = 'kanbn-contributors';
const EDITING_DESCRIPTION_STORAGE_PREFIX = 'kanbn.taskEditor.editingDescription.';
const PENDING_FOCUS_STORAGE_PREFIX = 'kanbn.taskEditor.pendingFocus.';

type SavedFocus = {
  name?: string,
  id?: string,
  selectionStart?: number,
  selectionEnd?: number,
};

const escapeAttributeValue = (value: string): string => value.replace(/"/g, '\\"');

const readSavedFocus = (): SavedFocus | null => {
  const activeElement = document.activeElement;

  if (!(activeElement instanceof HTMLInputElement)
    && !(activeElement instanceof HTMLTextAreaElement)
    && !(activeElement instanceof HTMLSelectElement)) {
    return null;
  }

  const name = activeElement.getAttribute('name') || undefined;
  const id = activeElement.id || undefined;

  if (!name && !id) {
    return null;
  }

  const savedFocus: SavedFocus = {
    name,
    id,
  };

  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    savedFocus.selectionStart = activeElement.selectionStart === null ? undefined : activeElement.selectionStart;
    savedFocus.selectionEnd = activeElement.selectionEnd === null ? undefined : activeElement.selectionEnd;
  }

  return savedFocus;
};

const tryRestoreFocus = (savedFocus: SavedFocus | null) => {
  if (!savedFocus) {
    return;
  }

  let target: Element | null = null;

  if (savedFocus.name) {
    target = document.querySelector(`[name="${escapeAttributeValue(savedFocus.name)}"]`);
  }

  if (!target && savedFocus.id) {
    target = document.getElementById(savedFocus.id);
  }

  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.focus();

  if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
    && savedFocus.selectionStart !== undefined
    && savedFocus.selectionEnd !== undefined) {
    const valueLength = target.value.length;
    const selectionStart = Math.min(savedFocus.selectionStart, valueLength);
    const selectionEnd = Math.min(savedFocus.selectionEnd, valueLength);
    target.setSelectionRange(selectionStart, selectionEnd);
  }
};

const hasValidationErrors = (errors: any): boolean => {
  if (!errors) {
    return false;
  }

  if (typeof errors === 'string') {
    return !!errors;
  }

  if (Array.isArray(errors)) {
    return errors.some(error => hasValidationErrors(error));
  }

  if (typeof errors === 'object') {
    return Object.values(errors).some(error => hasValidationErrors(error));
  }

  return false;
};

const createMarkdownComponents = (vscode: VSCodeApi) => ({
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <SyntaxHighlighter
        style=""
        useInlineStyles={false}
        language={match[1]}
        PreTag="div"
        children={String(children).replace(/\n$/, '')}
        {...props}
      />
    ) : (
      <code className={className} children={children} {...props} />
    );
  },
  a(props: any) {
    const { href, children, ...rest } = props;
    return (
      <button
        type="button"
        className={rest.className}
        onClick={(event) => {
          if (!href || href.charAt(0) === '#') {
            return;
          }

          event.preventDefault();
          vscode.postMessage({
            command: 'kanbn.openLink',
            href,
          });
        }}
        {...rest}
        style={{
          appearance: 'none',
          background: 'none',
          border: 0,
          color: 'var(--vscode-textLink-foreground)',
          cursor: 'pointer',
          font: 'inherit',
          padding: 0,
          textDecoration: 'underline',
          textAlign: 'left',
        }}
      >
        {children}
      </button>
    );
  }
});

const Markdown = ({ vscode, children, ...props }) => (<ReactMarkdown
  remarkPlugins={[remarkMath]}
  rehypePlugins={[rehypeKatex]}
  components={createMarkdownComponents(vscode)}
  {...props}
>
  {children}
</ReactMarkdown>);

const toPercent = (value: number | undefined) => `${Math.round((value || 0) * 100)}%`;

const getHistoryEventLabel = (historyEvent: any) => {
  switch (historyEvent.type) {
    case 'created':
      return 'Created';
    case 'moved':
      return 'Moved';
    case 'progress':
      return 'Progress';
    case 'archived':
      return 'Archived';
    case 'restored':
      return 'Restored';
    default:
      return historyEvent.type ? String(historyEvent.type) : 'Event';
  }
};

const getHistoryEventIcon = (historyEvent: any) => {
  switch (historyEvent.type) {
    case 'created':
      return 'add';
    case 'moved':
      return 'arrow-swap';
    case 'progress':
      return 'graph';
    case 'archived':
      return 'archive';
    case 'restored':
      return 'history';
    default:
      return 'pulse';
  }
};

const getHistoryEventDescription = (historyEvent: any) => {
  switch (historyEvent.type) {
    case 'created': {
      const column = historyEvent.column || historyEvent.toColumn;
      if (column) {
        return `Created in ${column} at ${toPercent(historyEvent.toProgress)} progress.`;
      }
      return `Created at ${toPercent(historyEvent.toProgress)} progress.`;
    }
    case 'moved':
      return `Moved from ${historyEvent.fromColumn || 'unknown'} to ${historyEvent.toColumn || 'unknown'}.`;
    case 'progress':
      return `Progress changed from ${toPercent(historyEvent.fromProgress)} to ${toPercent(historyEvent.toProgress)}.`;
    case 'archived':
      return `Archived from ${historyEvent.fromColumn || historyEvent.column || 'unknown'}.`;
    case 'restored':
      return `Restored to ${historyEvent.toColumn || 'unknown'}.`;
    default:
      return 'Task event recorded.';
  }
};

const createInitialTaskData = (
  task: KanbnTask | null,
  columnName: string,
  customFields: { name: string, type: 'boolean' | 'date' | 'number' | 'string' }[],
  currentUser: string,
) => ({
  id: task ? task.id : '',
  name: task ? task.name : '',
  description: task ? task.description : '',
  column: columnName,
  progress: task ? task.progress : 0,
  metadata: {
    created: (task && 'created' in task.metadata) ? task.metadata.created : new Date(),
    updated: (task && 'updated' in task.metadata) ? task.metadata.updated : null,
    started: (task && 'started' in task.metadata) ? formatDate(task.metadata.started!, 'yyyy-mm-dd') : '',
    plannedStart: (task && 'plannedStart' in task.metadata) ? formatDate(task.metadata.plannedStart as string | number | Date, 'yyyy-mm-dd') : '',
    plannedFinish: (task && 'plannedFinish' in task.metadata) ? formatDate(task.metadata.plannedFinish as string | number | Date, 'yyyy-mm-dd') : '',
    due: (task && 'due' in task.metadata) ? formatDate(task.metadata.due!, 'yyyy-mm-dd') : '',
    completed: (task && 'completed' in task.metadata) ? formatDate(task.metadata.completed!, 'yyyy-mm-dd') : '',
    assigned: (task && 'assigned' in task.metadata) ? task.metadata.assigned : currentUser,
    tags: (task && 'tags' in task.metadata) ? (task.metadata.tags || []) : [],
    ...Object.fromEntries(
      customFields.map(customField => [
        customField.name,
        (task && customField.name in task.metadata)
          ? (customField.type === 'date'
            ? formatDate(task.metadata[customField.name], 'yyyy-mm-dd')
            : task.metadata[customField.name]
          ) : null,
      ]),
    )
  },
  relations: task ? task.relations : [],
  subTasks: task ? task.subTasks : [],
  comments: task ? task.comments : [],
  history: task ? (task.history || []) : []
});

const TaskEditorAutoSave = ({
  enabled,
  autoSaveMode,
  autoSaveDelay,
  dirty,
  errors,
  isSubmitting,
  isValid,
  values,
  onAutoSave,
  onSaving,
}: {
  enabled: boolean,
  autoSaveMode: AutoSaveMode,
  autoSaveDelay: number,
  dirty: boolean,
  errors: any,
  isSubmitting: boolean,
  isValid: boolean,
  values: any,
  onAutoSave: (values: any) => void,
  onSaving: () => void,
}) => {
  useEffect(() => {
    if (!enabled || autoSaveMode !== 'afterDelay' || !dirty || isSubmitting || !isValid || hasValidationErrors(errors)) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onSaving();
      onAutoSave(values);
    }, Math.max(0, autoSaveDelay));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoSaveDelay, autoSaveMode, dirty, enabled, errors, isSubmitting, isValid, onAutoSave, onSaving, values]);

  useEffect(() => {
    if (!enabled || autoSaveMode !== 'onFocusChange') {
      return undefined;
    }

    const handleWindowBlur = () => {
      if (!dirty || isSubmitting || !isValid || hasValidationErrors(errors)) {
        return;
      }

      onSaving();
      onAutoSave(values);
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [autoSaveMode, dirty, enabled, errors, isSubmitting, isValid, onAutoSave, onSaving, values]);

  useEffect(() => {
    if (!enabled || autoSaveMode !== 'onWindowChange') {
      return undefined;
    }

    const submitIfNeeded = () => {
      if (!dirty || isSubmitting || !isValid || hasValidationErrors(errors)) {
        return;
      }

      onSaving();
      onAutoSave(values);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        submitIfNeeded();
      }
    };

    window.addEventListener('blur', submitIfNeeded);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', submitIfNeeded);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoSaveMode, dirty, enabled, errors, isSubmitting, isValid, onAutoSave, onSaving, values]);

  return null;
};

const TaskEditor = ({
  task,
  tasks,
  columnName,
  columnNames,
  customFields,
  taskBoards,
  contributors,
  currentUser,
  boardSlug,
  dateFormat,
  panelUuid,
  autoSaveMode,
  autoSaveDelay,
  vscode,
}: {
  task: KanbnTask | null,
  tasks: Record<string, KanbnTask>,
  columnName: string,
  columnNames: string[],
  customFields: { name: string, type: 'boolean' | 'date' | 'number' | 'string' }[],
  taskBoards: Record<string, string>,
  contributors: Array<{ name: string, displayName: string, colour?: string }>,
  currentUser: string,
  boardSlug: string,
  dateFormat: string,
  panelUuid: string,
  autoSaveMode: AutoSaveMode,
  autoSaveDelay: number,
  vscode: VSCodeApi
}) => {
  const editing = task !== null;
  const autoSaveEnabled = (editing || AUTO_SAVE_ENABLED_FOR_NEW_TASKS) && autoSaveMode !== 'off';
  const [taskData, setTaskData] = useState(
    createInitialTaskData(task, columnName, customFields, currentUser)
  );
  const [editingDescription, setEditingDescription] = useState(() => {
    const storageKey = `${EDITING_DESCRIPTION_STORAGE_PREFIX}${panelUuid}`;
    const storedValue = window.sessionStorage.getItem(storageKey);

    if (storedValue !== null) {
      return storedValue === '1';
    }

    return !editing;
  });
  const [editingComment, setEditingComment] = useState(-1);
  const [showPlannedDates, setShowPlannedDates] = useState(Boolean(
    task && (
      ('plannedStart' in task.metadata && task.metadata.plannedStart) ||
      ('plannedFinish' in task.metadata && task.metadata.plannedFinish)
    )
  ));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveStatusTimeoutRef = useRef<number | null>(null);
  const pendingFocusRestoreRef = useRef<SavedFocus | null>(null);

  useEffect(() => {
    const storageKey = `${EDITING_DESCRIPTION_STORAGE_PREFIX}${panelUuid}`;
    window.sessionStorage.setItem(storageKey, editingDescription ? '1' : '0');
  }, [editingDescription, panelUuid]);

  useEffect(() => {
    const storageKey = `${PENDING_FOCUS_STORAGE_PREFIX}${panelUuid}`;
    const serializedFocus = window.sessionStorage.getItem(storageKey);

    if (!serializedFocus) {
      return;
    }

    let savedFocus: SavedFocus | null = null;

    try {
      savedFocus = JSON.parse(serializedFocus);
    } catch (error) {
      savedFocus = null;
    }

    window.sessionStorage.removeItem(storageKey);

    window.requestAnimationFrame(() => {
      tryRestoreFocus(savedFocus);
    });
  }, [panelUuid]);

  useEffect(() => () => {
    if (saveStatusTimeoutRef.current !== null) {
      window.clearTimeout(saveStatusTimeoutRef.current);
    }
  }, []);

  const scheduleSaveStatusReset = () => {
    if (saveStatusTimeoutRef.current !== null) {
      window.clearTimeout(saveStatusTimeoutRef.current);
    }

    saveStatusTimeoutRef.current = window.setTimeout(() => {
      setSaveStatus('idle');
      saveStatusTimeoutRef.current = null;
    }, AUTO_SAVE_STATUS_DURATION);
  };

  const handleUpdateName = ({ target: { value } }, values) => {
    const id = paramCase(value);

    setTaskData({
      ...taskData,
      id
    });

    values.id = id;

    vscode.postMessage({
      command: 'kanbn.updatePanelTitle',
      title: value || 'Untitled task'
    });
  };

  const handleAutoSave = (values) => {
    if (!editing) {
      return;
    }

    setSaveStatus('saving');

    const savedFocus = readSavedFocus();
    pendingFocusRestoreRef.current = savedFocus;
    window.sessionStorage.setItem(`${PENDING_FOCUS_STORAGE_PREFIX}${panelUuid}`, JSON.stringify(savedFocus));

    vscode.postMessage({
      command: 'kanbn.update',
      taskId: task!.id,
      taskData: values,
      customFields,
      panelUuid
    });

    setTaskData(values);

    window.setTimeout(() => {
      tryRestoreFocus(pendingFocusRestoreRef.current);
      pendingFocusRestoreRef.current = null;
    }, 0);

    setSaveStatus('saved');
    scheduleSaveStatusReset();
  };

  const handleSubmit = (values, setSubmitting, resetForm) => {
    setSaveStatus('saving');

    const savedFocus = readSavedFocus();
    pendingFocusRestoreRef.current = savedFocus;
    window.sessionStorage.setItem(`${PENDING_FOCUS_STORAGE_PREFIX}${panelUuid}`, JSON.stringify(savedFocus));

    if (editing) {
      vscode.postMessage({
        command: 'kanbn.update',
        taskId: task!.id,
        taskData: values,
        customFields,
        panelUuid
      });
    } else {
      vscode.postMessage({
        command: 'kanbn.create',
        taskData: values,
        customFields,
        panelUuid
      });
    }

    setTaskData(values);
    resetForm({ values });
    setSubmitting(false);

    window.setTimeout(() => {
      tryRestoreFocus(pendingFocusRestoreRef.current);
      pendingFocusRestoreRef.current = null;
    }, 0);

    setSaveStatus('saved');
    scheduleSaveStatusReset();
  };

  const handleRemoveTask = values => {
    vscode.postMessage({
      command: 'kanbn.delete',
      taskId: task!.id,
      taskData: values,
      panelUuid
    });
  };

  const handleArchiveTask = values => {
    vscode.postMessage({
      command: 'kanbn.archive',
      taskId: task!.id,
      taskData: values,
      panelUuid
    });
  };

  const checkOverdue = (values: { metadata: { due?: string } }) => {
    if ('due' in values.metadata && values.metadata.due !== undefined) {
      return Date.parse(values.metadata.due) < (new Date()).getTime();
    }
    return false;
  };

  const validate = (values: KanbnTaskValidationInput): KanbnTaskValidationOutput | {} => {
    let hasErrors = false;
    const errors: KanbnTaskValidationOutput = {
      name: '',
      metadata: {
        tags: []
      },
      subTasks: [],
      comments: []
    };

    if (!values.name) {
      errors.name = 'Task name is required.';
      hasErrors = true;
    }

    if (values.id in tasks && tasks[values.id].uuid !== (task ? task.uuid : '')) {
      errors.name = 'There is already a task with the same name or id.';
      hasErrors = true;
    }

    for (let i = 0; i < values.metadata.tags.length; i++) {
      if (!values.metadata.tags[i]) {
        errors.metadata.tags[i] = 'Tag cannot be empty.';
        hasErrors = true;
      }
    }

    for (let i = 0; i < values.subTasks.length; i++) {
      if (!values.subTasks[i].text) {
        errors.subTasks[i] = {
          text: 'Sub-task text cannot be empty.'
        };
        hasErrors = true;
      }
    }

    for (let i = 0; i < values.comments.length; i++) {
      if (!values.comments[i].text) {
        errors.comments[i] = {
          text: 'Comment text cannot be empty.'
        };
        hasErrors = true;
      }
    }

    return hasErrors ? errors : {};
  };

  const getSaveStatusText = (dirty: boolean) => {
    if (saveStatus === 'saving') {
      return 'Saving...';
    }

    if (dirty) {
      return !autoSaveEnabled ? 'Unsaved changes, auto-save off' : 'Unsaved changes';
    }

    if (saveStatus === 'saved') {
      return !autoSaveEnabled ? 'Saved manually' : 'Saved';
    }

    if (!autoSaveEnabled) {
      return 'Auto-save off';
    }

    if (autoSaveMode === 'afterDelay') {
      return `Auto-save after ${Math.max(0, autoSaveDelay)}ms`;
    }

    if (autoSaveMode === 'onFocusChange') {
      return 'Auto-save on focus change';
    }

    return 'Auto-save on window change';
  };

  return (
    <div className="kanbn-task-editor">
      <Formik
        initialValues={taskData}
        validate={validate}
        onSubmit={(values, { setSubmitting, resetForm }) => {
          handleSubmit(values, setSubmitting, resetForm);
        }}
      >
        {({
          dirty,
          errors,
          values,
          handleChange,
          setFieldValue,
          isSubmitting,
          isValid,
          submitForm,
        }) => (
          <Form>
            {
              // Autocomplete for the fields that name a person. A datalist suggests without
              // restricting, which matches kanbn: assigned and comment author are free text and are
              // never validated against the contributor list
              contributors.length > 0 &&
              <datalist id={CONTRIBUTORS_LIST_ID}>
                {contributors.map(contributor => (
                  <option key={contributor.name} value={contributor.name}>
                    {contributor.displayName !== contributor.name ? contributor.displayName : ''}
                  </option>
                ))}
              </datalist>
            }
            <TaskEditorAutoSave
              enabled={autoSaveEnabled}
              autoSaveMode={autoSaveMode}
              autoSaveDelay={autoSaveDelay}
              dirty={dirty}
              errors={errors}
              isSubmitting={isSubmitting}
              isValid={isValid}
              values={values}
              onAutoSave={handleAutoSave}
              onSaving={() => setSaveStatus('saving')}
            />
            <div className="kanbn-task-editor-header">
              <div className="kanbn-task-editor-header-main">
                <h1 className="kanbn-task-editor-title">
                  {editing ? 'Update task' : 'Create new task'}
                  {dirty && <span className="kanbn-task-editor-dirty">*</span>}
                </h1>
                <span className="kanbn-task-editor-save-status">{getSaveStatusText(dirty)}</span>
              </div>
              <div className="kanbn-task-editor-header-dates">
                {editing && <span className="kanbn-task-editor-dates">
                  {
                    [
                      'created' in task!.metadata ? `Created ${formatDate(task!.metadata.created, dateFormat)}` : null,
                      'updated' in task!.metadata ? `Updated ${formatDate(task!.metadata.updated, dateFormat)}` : null
                    ].filter(i => i).join(', ')
                  }
                </span>}
              </div>
              <div className="kanbn-task-editor-header-buttons">
                <div className="kanbn-task-editor-buttons kanbn-task-editor-main-buttons">
                  {editing && <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-delete"
                    title="Delete task"
                    onClick={() => {
                      handleRemoveTask(values);
                    }}
                  >
                    <i className="codicon codicon-trash"></i>Delete
                  </button>}
                  {editing && <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-archive"
                    title="Archive task"
                    onClick={() => {
                      handleArchiveTask(values);
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
              </div>
            </div>
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
                      setEditingDescription(!editingDescription);
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
                      : <Markdown vscode={vscode} className="kanbn-task-editor-description-preview" children={values.description} />
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
                                        list={contributors.length ? CONTRIBUTORS_LIST_ID : undefined}
                                      />
                                      <ErrorMessage
                                        className="kanbn-task-editor-field-errors"
                                        component="div"
                                        name={`comments.${index}.author`}
                                      />
                                    </React.Fragment>
                                    : <div className="kanbn-task-editor-field-comment-author-value">
                                      <i className="codicon codicon-account"></i>
                                      {comment.author || 'Anonymous'}
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
                                    setEditingComment(editingComment !== index ? index : -1);
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
                                    : <Markdown vscode={vscode} className="kanbn-task-editor-comment-text" children={comment.text} />
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
                              push({ text: '', date: new Date(), author: currentUser });
                              setEditingComment(values.comments.length);
                            }}
                          >
                            <i className="codicon codicon-comment"></i>Add comment
                          </button>
                        </div>
                      </div>
                    )}
                  </FieldArray>
                </div>
                {
                  values.history.length > 0 &&
                  <div className="kanbn-task-editor-field kanbn-task-editor-field-history">
                    <h2 className="kanbn-task-editor-title">History</h2>
                    <div className="kanbn-task-editor-history-list">
                      {
                        [...values.history]
                          .sort((a, b) => Date.parse(String(b.date)) - Date.parse(String(a.date)))
                          .map((historyEvent, index) => (
                            <div
                              className="kanbn-task-editor-history-entry"
                              key={`${historyEvent.type || 'event'}-${historyEvent.date || ''}-${index}`}
                            >
                              <div className="kanbn-task-editor-history-entry-header">
                                <span className="kanbn-task-editor-history-entry-type">
                                  <i className={`codicon codicon-${getHistoryEventIcon(historyEvent)}`}></i>
                                  {getHistoryEventLabel(historyEvent)}
                                </span>
                                <span className="kanbn-task-editor-history-entry-date">
                                  {formatDate(historyEvent.date, dateFormat)}
                                </span>
                              </div>
                              <div className="kanbn-task-editor-history-entry-description">
                                {getHistoryEventDescription(historyEvent)}
                              </div>
                            </div>
                          ))
                      }
                    </div>
                  </div>
                }
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
                {
                  // A task file is shared between boards, so it can sit in a different column on
                  // each one. Read-only: membership is changed by moving the task on that board
                  Object.keys(taskBoards).length > 1 &&
                  <div className="kanbn-task-editor-field kanbn-task-editor-field-boards">
                    <label className="kanbn-task-editor-field-label">
                      <p>On boards</p>
                    </label>
                    <ul className="kanbn-task-editor-boards">
                      {Object.entries(taskBoards).map(([slug, column]) => (
                        <li
                          key={slug}
                          className={[
                            'kanbn-task-editor-board',
                            slug === boardSlug ? 'kanbn-task-editor-board-current' : null
                          ].filter(i => i).join(' ')}
                        >
                          <span className="kanbn-task-editor-board-name">{slug}</span>
                          <span className="kanbn-task-editor-board-column">{column}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                }
                <div className="kanbn-task-editor-field kanbn-task-editor-field-assigned">
                  <label className="kanbn-task-editor-field-label">
                    <p>Assigned to</p>
                    <Field
                      className="kanbn-task-editor-field-input"
                      name="metadata.assigned"
                      placeholder="Assigned to"
                      list={contributors.length ? CONTRIBUTORS_LIST_ID : undefined}
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
                    <div className="kanbn-task-editor-date-input-wrap">
                      <Field
                        className={[
                          'kanbn-task-editor-field-input',
                          checkOverdue(values) ? 'kanbn-task-overdue' : null
                        ].filter(i => i).join(' ')}
                        type="date"
                        name="metadata.due"
                      />
                      <button
                        type="button"
                        className="kanbn-task-editor-button kanbn-task-editor-button-edit kanbn-task-editor-button-date-clear"
                        title="Clear due date"
                        aria-label="Clear due date"
                        onClick={() => setFieldValue('metadata.due', '')}
                      >
                        <i className="codicon codicon-close"></i>
                      </button>
                    </div>
                  </label>
                  <ErrorMessage
                    className="kanbn-task-editor-field-errors"
                    component="div"
                    name="metadata.due"
                  />
                </div>
                <div className="kanbn-task-editor-buttons kanbn-task-editor-buttons-show-planned-dates">
                  <button
                    type="button"
                    className="kanbn-task-editor-button kanbn-task-editor-button-edit kanbn-task-editor-button-show-planned-dates"
                    title={showPlannedDates ? 'Hide planned dates' : 'Show planned dates'}
                    aria-label={showPlannedDates ? 'Hide planned dates' : 'Show planned dates'}
                    onClick={() => setShowPlannedDates(!showPlannedDates)}
                  >
                    <i className={`codicon ${showPlannedDates ? 'codicon-chevron-up' : 'codicon-chevron-down'}`}></i>
                  </button>
                </div>
                {
                  showPlannedDates &&
                  <React.Fragment>
                    <div className="kanbn-task-editor-field kanbn-task-editor-field-planned-start">
                      <label className="kanbn-task-editor-field-label">
                        <p>Planned start date</p>
                        <div className="kanbn-task-editor-date-input-wrap">
                          <Field
                            className="kanbn-task-editor-field-input"
                            type="date"
                            name="metadata.plannedStart"
                          />
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-edit kanbn-task-editor-button-date-clear"
                            title="Clear planned start date"
                            aria-label="Clear planned start date"
                            onClick={() => setFieldValue('metadata.plannedStart', '')}
                          >
                            <i className="codicon codicon-close"></i>
                          </button>
                        </div>
                      </label>
                      <ErrorMessage
                        className="kanbn-task-editor-field-errors"
                        component="div"
                        name="metadata.plannedStart"
                      />
                    </div>
                    <div className="kanbn-task-editor-field kanbn-task-editor-field-planned-finish">
                      <label className="kanbn-task-editor-field-label">
                        <p>Planned finish date</p>
                        <div className="kanbn-task-editor-date-input-wrap">
                          <Field
                            className="kanbn-task-editor-field-input"
                            type="date"
                            name="metadata.plannedFinish"
                          />
                          <button
                            type="button"
                            className="kanbn-task-editor-button kanbn-task-editor-button-edit kanbn-task-editor-button-date-clear"
                            title="Clear planned finish date"
                            aria-label="Clear planned finish date"
                            onClick={() => setFieldValue('metadata.plannedFinish', '')}
                          >
                            <i className="codicon codicon-close"></i>
                          </button>
                        </div>
                      </label>
                      <ErrorMessage
                        className="kanbn-task-editor-field-errors"
                        component="div"
                        name="metadata.plannedFinish"
                      />
                    </div>
                  </React.Fragment>
                }
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
                      width: `${Math.min(1, Math.max(0, values.progress || 0)) * 100}%`
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
                              /><p>{nameToLabel(customField.name)}</p>
                            </>
                          ) : (
                            <>
                              <p>{nameToLabel(customField.name)}</p>
                              {
                                customField.type === 'date' &&
                                <div className="kanbn-task-editor-date-input-wrap">
                                  <Field
                                    className="kanbn-task-editor-field-input"
                                    type="date"
                                    name={`metadata.${customField.name}`}
                                  />
                                  <button
                                    type="button"
                                    className="kanbn-task-editor-button kanbn-task-editor-button-edit kanbn-task-editor-button-date-clear"
                                    title={`Clear ${nameToLowerLabel(customField.name)}`}
                                    aria-label={`Clear ${nameToLowerLabel(customField.name)}`}
                                    onClick={() => setFieldValue(`metadata.${customField.name}`, '')}
                                  >
                                    <i className="codicon codicon-close"></i>
                                  </button>
                                </div>
                              }
                              {
                                customField.type !== 'date' &&
                                <Field
                                  className="kanbn-task-editor-field-input"
                                  type={{
                                    number: 'number',
                                    string: 'text',
                                  }[customField.type]}
                                  name={`metadata.${customField.name}`}
                                />
                              }
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
                          values.metadata.tags!.length > 0
                        ) && values.metadata.tags!.map((tag, index) => (
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
                                  `kanbn-task-tag-${paramCase(values.metadata.tags![index])}`
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
  );
};

export default TaskEditor;
