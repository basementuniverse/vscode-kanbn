/**
 * Turn the task editor's form values back into the task data kanbn saves.
 *
 * This has no dependency on vscode, so the save path can be exercised against the real library in
 * tests.
 */

const DATE_METADATA_FIELDS = ["due", "plannedStart", "plannedFinish", "started", "completed"];

function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  // A date input carries a calendar day and nothing else. Date.parse() reads a bare "yyyy-mm-dd"
  // as UTC midnight, which lands on the day before for anyone west of Greenwich
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (parts) {
    return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// The editor shows a timestamp as the calendar day it falls on, so writing back what it sends would
// flatten the time of day out of every date the user never touched. Keep the stored timestamp
// whenever the day on screen is still the day it belongs to
function resolveDateField(value: unknown, original: unknown): Date | null {
  const parsed = parseDateInput(value);
  if (parsed === null) {
    return null;
  }

  const originalDate = parseDateInput(original);
  if (originalDate !== null && isSameLocalDay(originalDate, parsed)) {
    return originalDate;
  }

  return parsed;
}

export function transformTaskData(
  taskData: any,
  customFields: { name: string, type: 'boolean' | 'date' | 'number' | 'string'}[],
  originalMetadata: Record<string, any> = {}
) {
  // Only the fields every task has go in here. Everything else is added below if the editor
  // actually carries a value for it - listing them here as well wrote `assigned: ""`, `progress: 0`
  // and `tags: []` onto tasks that had none of them
  const result = {
    id: taskData.id,
    name: taskData.name,
    description: taskData.description,
    metadata: {
      created: taskData.metadata.created ? new Date(taskData.metadata.created) : new Date(),
      updated: new Date(),
    } as any,
    relations: taskData.relations,
    subTasks: taskData.subTasks,
    history: (taskData.history || []).map((historyEvent: any) => ({
      ...historyEvent,
      date: historyEvent.date ? new Date(Date.parse(historyEvent.date)) : historyEvent.date,
    })),
    comments: taskData.comments.map((comment: any) => ({
      author: comment.author,
      date: new Date(Date.parse(comment.date)),
      text: comment.text,
    })),
  } as any;

  // Add assigned
  if (taskData.metadata.assigned) {
    result.metadata["assigned"] = taskData.metadata.assigned;
  }

  // Add progress
  if (taskData.progress > 0) {
    result.metadata["progress"] = taskData.progress;
  }

  // Add tags
  if (taskData.metadata.tags.length) {
    result.metadata["tags"] = taskData.metadata.tags;
  }

  // Add due timeline dates if present
  for (const field of DATE_METADATA_FIELDS) {
    const value = resolveDateField(taskData.metadata[field], originalMetadata[field]);
    if (value !== null) {
      result.metadata[field] = value;
    }
  }

  // Add custom fields
  for (let customField of customFields) {
    if (customField.name in taskData.metadata && taskData.metadata[customField.name] !== null) {
      if (customField.type === 'date') {
        const value = resolveDateField(
          taskData.metadata[customField.name],
          originalMetadata[customField.name]
        );
        if (value !== null) {
          result.metadata[customField.name] = value;
        }
      } else {
        result.metadata[customField.name] = taskData.metadata[customField.name];
      }
    }
  }

  return result;
}
