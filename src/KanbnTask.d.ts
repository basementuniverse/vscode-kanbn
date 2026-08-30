// Note that Date properties will be converted to strings (ISO) when a task is serialized and passed as a prop
declare type KanbnTask = {
  id: string,
  name: string,
  description: string,
  column: string,
  workload?: number,
  remainingWorkload?: number,
  progress?: number,
  // Populated by kanbn's hydrateTask, but only for tasks that have a due date. 'completed' and
  // 'overdue' are resolved against the board's own completedField, so they're the values to trust
  dueData?: {
    completed: boolean,
    completedDate: string | null,
    dueDate: string,
    overdue: boolean,
    dueDelta: number,
    dueMessage: string
  },
  metadata: {
    created?: string,
    updated?: string,
    started?: string,
    plannedStart?: string,
    plannedFinish?: string,
    due?: string,
    completed?: string,
    assigned?: string,
    tags?: string[],
    // The stored progress, if the task sets one. Distinct from the top-level `progress`, which
    // kanbn derives from the column the task is in
    progress?: number
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
    date: string,
    text: string
  }>,
  history?: Array<{
    date: string,
    type?: string,
    column?: string,
    fromColumn?: string,
    toColumn?: string,
    fromProgress?: number,
    toProgress?: number
  }>
};
