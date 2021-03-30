import { DragDropContext, Droppable } from "react-beautiful-dnd";
import React, { useState } from "react";
import Task from './Task';

declare var acquireVsCodeApi: any;
const vscode = acquireVsCodeApi();

const onDragEnd = (result, columns, setColumns) => {

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
    column: destination.droppableId,
    position: destination.index
  });
};

const Board = ({ columns, startedColumns, completedColumns }: {
  columns: Record<string, KanbnTask[]>,
  startedColumns: string[],
  completedColumns: string[]
}) => {
  const [, setColumns] = useState(columns);
  return (
    <div
      className="kanbn-board"
      style={{
        display: "flex"
      }}
    >
      <DragDropContext
        onDragEnd={result => onDragEnd(result, columns, setColumns)}
      >
        {Object.entries(columns).map(([columnName, column]) => {
          return (
            <div
              className="kanbn-column"
              style={{
                flex: 1
              }}
              key={columnName}
            >
              <h2 className="kanbn-column-name">
                {columnName}
                <span className="kanbn-column-count">{column.length || ''}</span>
                <button
                  type="button"
                  className="kanbn-create-task-button"
                  onClick={e => null}
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
                        {column.map((task, index) => <Task task={task} index={index} />)}
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
