declare type KanbnTask = {
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
    assigned?: string,
    tags?: string[]
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
