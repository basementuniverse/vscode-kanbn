import React, { useState } from "react";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";

export type task = {
  id: string,
  name: string,
  description: string,
  column: string,
  workload?: number,
  remainingWorkload?: number,
  progress?: number,
  metadata: {
    created: Date,
    updated?: Date,
    completed?: Date,
    assigned?: string
  },
  relations: Array<{
    type: string,
    task: string
  }>,
  subTasks: Array<{
    text: string,
    completed: boolean
  }>,
  comments: Array<{
    author: string,
    date: Date,
    text: string
  }>
};

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
  let removed: task;

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

const Board = ({ columns }) => {
  const [, setColumns] = useState(columns);
  return (
    <div style={{ display: "flex", justifyContent: "center", height: "100%" }}>
      <DragDropContext
        onDragEnd={result => onDragEnd(result, columns, setColumns)}
      >
        {Object.entries(columns).map(([columnId, column]) => {
          return (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
              }}
              key={columnId}
            >
              <h2>{columnId}</h2>
              <div style={{ margin: 8 }}>
                <Droppable droppableId={columnId} key={columnId}>
                  {(provided, snapshot) => {
                    return (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        style={{
                          background: snapshot.isDraggingOver
                            ? "lightblue"
                            : "lightgrey",
                          padding: 4,
                          width: 250,
                          minHeight: 500
                        }}
                      >
                        {(column as task[]).map((item, index) => {
                          return (
                            <Draggable
                              key={item.id}
                              draggableId={item.id}
                              index={index}
                            >
                              {(provided, snapshot) => {
                                return (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    style={{
                                      userSelect: "none",
                                      padding: 16,
                                      margin: "0 0 8px 0",
                                      minHeight: "50px",
                                      backgroundColor: snapshot.isDragging
                                        ? "#263B4A"
                                        : "#456C86",
                                      color: "white",
                                      ...provided.draggableProps.style
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                );
                              }}
                            </Draggable>
                          );
                        })}
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
