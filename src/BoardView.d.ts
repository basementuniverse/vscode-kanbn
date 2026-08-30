// A view resolved by the extension host: the columns and lanes a view describes, filled with the
// tasks that matched each cell. A task can appear in more than one cell, since a view's filters
// aren't required to partition the board
declare type BoardView = {
  name: string,
  headings: string[],
  lanes: Array<{
    name: string,
    columns: KanbnTask[][]
  }>
};
