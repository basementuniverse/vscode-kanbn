import React from "react";
import { Draggable } from "react-beautiful-dnd";
import formatDate from 'dateformat';
import VSCodeApi from "./VSCodeApi";

const Task = ({ task, index, dateFormat, vscode }: {
  task: KanbnTask,
  index: number,
  dateFormat: string,
  vscode: VSCodeApi
}) => {
  const createdDate = 'created' in task.metadata ? formatDate(task.metadata.created, dateFormat) : '';
  const updatedDate = 'updated' in task.metadata ? formatDate(task.metadata.updated, dateFormat) : '';
  const startedDate = 'started' in task.metadata ? formatDate(task.metadata.started, dateFormat) : '';
  const completedDate = 'completed' in task.metadata ? formatDate(task.metadata.completed, dateFormat) : '';
  return (
    <Draggable
      key={task.id}
      draggableId={task.id}
      index={index}
    >
      {(provided, snapshot) => {
        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={[
              'kanbn-task',
              snapshot.isDragging ? 'drag' : null
            ].filter(i => i).join(' ')}
            style={{
              userSelect: "none",
              ...provided.draggableProps.style
            }}
          >
            <div className="kanbn-task-row">
              <button
                type="button"
                className="kanbn-task-name"
                onClick={() => {
                  vscode.postMessage({
                    command: 'kanbn.task',
                    taskId: task.id
                  })
                }}
                title={task.id}
              >
                {task.name}
              </button>
            </div>
            <div className="kanbn-task-row">
              {
                'tags' in task.metadata &&
                <div className="kanbn-task-data kanbn-task-tags">
                  {task.metadata.tags!.map(tag => {
                    return (
                      <span className={[
                        'kanbn-task-tag',
                        `kanbn-task-tag-${tag}`
                      ].join(' ')}>
                        {tag}
                      </span>
                    );
                  })}
                </div>
              }
            </div>
            <div className="kanbn-task-row">
              {
                'assigned' in task.metadata &&
                <div className="kanbn-task-data kanbn-task-assigned">
                  <i className="codicon codicon-account"></i>{task.metadata.assigned}
                </div>
              }
              {
                (createdDate || updatedDate) &&
                <div className="kanbn-task-data kanbn-task-date" title={[
                  createdDate ? `Created ${createdDate}` : null,
                  updatedDate ? `Updated ${updatedDate}` : null,
                  startedDate ? `Started ${startedDate}` : null,
                  completedDate ? `Completed ${completedDate}` : null
                ].filter(i => i).join('\n')}>
                  <i className="codicon codicon-clock"></i>{updatedDate || createdDate}
                </div>
              }
              {
                task.comments.length > 0 &&
                <div className="kanbn-task-data kanbn-task-comments">
                  <i className="codicon codicon-comment"></i>{task.comments.length}
                </div>
              }
              {
                task.subTasks.length > 0 &&
                <div className="kanbn-task-data kanbn-task-sub-tasks">
                  <i className="codicon codicon-tasklist"></i>
                  {task.subTasks.filter(subTask => subTask.completed).length} / {task.subTasks.length}
                </div>
              }
              {
                task.workload !== undefined &&
                <div className="kanbn-task-data kanbn-task-workload">
                  <i className="codicon codicon-run"></i>{task.workload}
                </div>
              }
              {
                task.workload !== undefined &&
                task.progress !== undefined &&
                <div className="kanbn-task-progress" style={{
                  width: `${task.progress * 100}%`
                }}></div>
              }
            </div>
          </div>
        );
      }}
    </Draggable>
  );
}

export default Task;
