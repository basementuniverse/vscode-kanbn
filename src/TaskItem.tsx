import React from "react";
import { Draggable } from "react-beautiful-dnd";
import formatDate from 'dateformat';
import { paramCase } from '@basementuniverse/kanbn/src/utility';
import { nameToLabel } from './labels';
import VSCodeApi from "./VSCodeApi";

const TaskItem = ({
  task,
  columnName,
  customFields,
  startedField,
  completedField,
  position,
  dateFormat,
  vscode
}: {
  task: KanbnTask,
  columnName: string,
  customFields: { name: string, type: 'boolean' | 'date' | 'number' | 'string' }[],
  startedField: string,
  completedField: string,
  position: number,
  dateFormat: string,
  vscode: VSCodeApi
}) => {
  const createdDate = 'created' in task.metadata ? formatDate(task.metadata.created, dateFormat) : null;
  const updatedDate = 'updated' in task.metadata ? formatDate(task.metadata.updated, dateFormat) : null;
  const dueDate = 'due' in task.metadata ? formatDate(task.metadata.due, dateFormat) : null;

  // A board can point its started/completed state at custom metadata fields, so read the fields this
  // board actually uses rather than assuming 'started' and 'completed'
  const startedDate = startedField in task.metadata
    ? formatDate(task.metadata[startedField], dateFormat)
    : null;
  const completedDate = completedField in task.metadata
    ? formatDate(task.metadata[completedField], dateFormat)
    : null;

  // Those fields are already shown as this board's started/completed dates, so showing them again in
  // the custom field list would just be the same date twice
  const stateFields = [startedField, completedField];

  // Kanbn computes this during hydration, and only attaches dueData to a task with a due date. A
  // completed task is never overdue, however late it was
  const checkOverdue = (task: KanbnTask) => !!(task.dueData && task.dueData.overdue);

  return (
    <Draggable
      key={task.id}
      draggableId={task.id}
      index={position}
    >
      {(provided, snapshot) => {
        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={[
              'kanbn-task',
              `kanbn-task-column-${paramCase(columnName)}`,
              checkOverdue(task) ? 'kanbn-task-overdue' : null,
              !!completedDate ? 'kanbn-task-completed' : null,
              snapshot.isDragging ? 'drag' : null
            ].filter(i => i).join(' ')}
            style={{
              userSelect: "none",
              ...provided.draggableProps.style
            }}
          >
            <div className="kanbn-task-data kanbn-task-data-name">
              <button
                type="button"
                onClick={() => {
                  vscode.postMessage({
                    command: 'kanbn.task',
                    taskId: task.id,
                    columnName: task.column
                  });
                }}
                title={task.id}
              >
                {task.name}
              </button>
            </div>
            {
              'tags' in task.metadata &&
              task.metadata.tags!.length > 0 &&
              <div className="kanbn-task-data kanbn-task-data-tags">
                {task.metadata.tags!.map(tag => {
                  return (
                    <span className={[
                      'kanbn-task-tag',
                      `kanbn-task-tag-${paramCase(tag)}`
                    ].join(' ')}>
                      {tag}
                    </span>
                  );
                })}
              </div>
            }
            {
              customFields.map(customField => {
                if (
                  customField.name in task.metadata &&
                  stateFields.indexOf(customField.name) === -1
                ) {
                  return (
                    <div className={[
                      'kanbn-task-data kanbn-task-data-custom-field',
                      `kanbn-task-data-${paramCase(customField.name)}`
                    ].join(' ')}>
                      {
                        customField.type === 'boolean'
                          ? (
                            <>
                              <i className={`codicon codicon-${task.metadata[customField.name]
                                ? 'pass-filled'
                                : 'circle-large-outline'}`}></i>
                              {nameToLabel(customField.name)}
                            </>
                          ) : (
                            <>
                              <i className="codicon codicon-json"></i>
                              <span title={nameToLabel(customField.name)}>
                                {customField.type === 'date'
                                  ? formatDate(task.metadata[customField.name], dateFormat)
                                  : task.metadata[customField.name]}
                              </span>
                            </>
                          )
                      }
                    </div>
                  );
                }
                return (<></>);
              })
            }
            {
              'assigned' in task.metadata &&
              !!task.metadata.assigned &&
              <div className="kanbn-task-data kanbn-task-data-assigned">
                <i className="codicon codicon-account"></i>{task.metadata.assigned}
              </div>
            }
            {
              createdDate &&
              <div className="kanbn-task-data kanbn-task-data-created" title={`Created ${createdDate}`}>
                <i className="codicon codicon-clock"></i>{createdDate}
              </div>
            }
            {
              updatedDate &&
              <div className="kanbn-task-data kanbn-task-data-updated" title={`Updated ${updatedDate}`}>
                <i className="codicon codicon-clock"></i>{updatedDate}
              </div>
            }
            {
              startedDate &&
              <div className="kanbn-task-data kanbn-task-data-started" title={`Started ${startedDate}`}>
                <i className="codicon codicon-run"></i>{startedDate}
              </div>
            }
            {
              dueDate &&
              <div className="kanbn-task-data kanbn-task-data-due" title={`Due ${dueDate}`}>
                <i className="codicon codicon-watch"></i>{dueDate}
              </div>
            }
            {
              completedDate &&
              <div className="kanbn-task-data kanbn-task-data-completed" title={`Completed ${completedDate}`}>
                <i className="codicon codicon-check"></i>{completedDate}
              </div>
            }
            {
              task.comments.length > 0 &&
              <div className="kanbn-task-data kanbn-task-data-comments">
                <i className="codicon codicon-comment"></i>{task.comments.length}
              </div>
            }
            {
              task.subTasks.length > 0 &&
              <div className="kanbn-task-data kanbn-task-data-sub-tasks">
                <i className="codicon codicon-tasklist"></i>
                {task.subTasks.filter(subTask => subTask.completed).length} / {task.subTasks.length}
              </div>
            }
            {
              task.workload !== undefined &&
              <div className="kanbn-task-data kanbn-task-data-workload">
                <i className="codicon codicon-run"></i>{task.workload}
              </div>
            }
            {
              task.relations.length > 0 &&
              task.relations.map(relation => (
                <div className={[
                  'kanbn-task-data kanbn-task-data-relation',
                  relation.type ? `kanbn-task-data-relation-${relation.type}` : null,
                ].join(' ')}>
                  <i className="codicon codicon-link"></i>
                  <span className="kanbn-task-data-label">
                    {relation.type}
                  </span> {relation.task}
                </div>
              ))
            }
            {
              task.workload !== undefined &&
              task.progress !== undefined &&
              <div className="kanbn-task-progress" style={{
                width: `${Math.min(1, Math.max(0, task.progress)) * 100}%`
              }}></div>
            }
          </div>
        );
      }}
    </Draggable>
  );
}

export default TaskItem;
