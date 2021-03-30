import React from "react";
import { Draggable } from "react-beautiful-dnd";

const Task = ({ task, index }: { task: KanbnTask, index: number }) => {
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
            <button
              type="button"
              onClick={e => null} // TODO open task editor webview panel when clicked
              title={task.id}
            >
              {task.name}
            </button>
            {/*
            // TODO add task info
            truncated description (?),
            progress as %-filled bottom border,
            created/updated (updated date, fallback to created),
            tags (provide default colours in css, put tagname in className),
            count sub-tasks (if >0),
            count comments (if >0)
            */}
          </div>
        );
      }}
    </Draggable>
  );
}

export default Task;
