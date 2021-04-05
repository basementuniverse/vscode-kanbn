import { DragDropContext, Droppable } from "react-beautiful-dnd";
import React, { useState } from "react";
import TaskItem from './TaskItem';
import { paramCase } from 'param-case';
import VSCodeApi from "./VSCodeApi";

const onDragEnd = (result, columns, setColumns, vscode: VSCodeApi) => {

  // No destination means the item was dragged to an invalid location
  if (!result.destination) {
    return;
  }

  // Get the source and destination columns
  const { source, destination } = result;

  // The item that was moved
  let removed: KanbnTask;

  // The task was dragged from one column to another
  if (source.droppableId !== destination.droppableId) {
    const sourceItems = columns[source.droppableId];
    const destItems = columns[destination.droppableId];
    [removed] = sourceItems.splice(source.index, 1);
    destItems.splice(destination.index, 0, removed);
    setColumns({
      ...columns,
      [source.droppableId]: sourceItems,
      [destination.droppableId]: destItems
    });

  // The task was dragged into the same column
  } else {

    // If the task was dragged to the same position that it currently occupies, don't move it (this will
    // prevent unnecessarily setting the task's updated date)
    if (source.index === destination.index) {
      return;
    }
    const copiedItems = columns[source.droppableId];
    [removed] = copiedItems.splice(source.index, 1);
    copiedItems.splice(destination.index, 0, removed);
    setColumns({
      ...columns,
      [source.droppableId]: copiedItems
    });
  }

  // Post a message back to the extension so we can move the task in the index
  vscode.postMessage({
    command: 'kanbn.move',
    task: removed.id,
    columnName: destination.droppableId,
    position: destination.index
  });
};

const Board = ({ columns, startedColumns, completedColumns, dateFormat, vscode }: {
  columns: Record<string, KanbnTask[]>,
  startedColumns: string[],
  completedColumns: string[],
  dateFormat: string,
  vscode: VSCodeApi
}) => {
  const [, setColumns] = useState(columns);
  return (
    <div className="kanbn-board">
      <DragDropContext
        onDragEnd={result => onDragEnd(result, columns, setColumns, vscode)}
      >
        {Object.entries(columns).map(([columnName, column]) => {
          return (
            <div
              className={[
                'kanbn-column',
                `kanbn-column-${paramCase(columnName)}`
              ].join(' ')}
              key={columnName}
            >
              <h2 className="kanbn-column-name">
                {
                  startedColumns.indexOf(columnName) > -1 &&
                  <i className="codicon codicon-chevron-right"></i>
                }
                {
                  completedColumns.indexOf(columnName) > -1 &&
                  <i className="codicon codicon-check"></i>
                }
                {columnName}
                <span className="kanbn-column-count">{column.length || ''}</span>
                <button
                  type="button"
                  className="kanbn-create-task-button"
                  onClick={() => {
                    vscode.postMessage({
                      command: 'kanbn.addTask',
                      columnName
                    })
                  }}
                  title={`Create task in ${columnName}`}
                >
                  <i className="codicon codicon-add"></i>
                </button>
              </h2>
              <div>
                <Droppable droppableId={columnName} key={columnName}>
                  {(provided, snapshot) => {
                    return (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={[
                          'kanbn-column-task-list',
                          snapshot.isDraggingOver ? 'drag-over' : null
                        ].filter(i => i).join(' ')}
                      >
                        {column.map((task, position) => <TaskItem
                          task={task}
                          position={position}
                          dateFormat={dateFormat}
                          vscode={vscode}
                        />)}
                        {provided.placeholder}
                      </div>
                    );
                  }}
                </Droppable>
              </div>
            </div>
          );
        })}
      </DragDropContext>
    </div>
  );
};

export default Board;
