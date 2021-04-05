# Styles

The kanbn board has a default style which is based on the current vscode theme, however this can be overridden by creating a CSS file `board.css` inside the `.kanbn/` directory.

## CSS class structure

### Kanbn board

- `div.kanbn-header`
  - `h1.kanbn-header-name`
  - `p.kanbn-header-description`
- `div.kanbn-board`
  - `div.kanbn-column.kanbn-column-{column name in snakecase}`
    - `h2.kanbn-column-name`
      - `i.codicon.codicon-{chevron-right or check}`
      - `span.kanbn-column-count`
      - `button.kanbn-create-task-button`
        - `i.codicon.codicon-add`
    - `div.kanbn-column-task-list[.drag-over when dragging a task over this column]`
      - `div.kanbn-task[.drag when being dragged]`
        - `div.kanbn-task-row`
          - `button.kanbn-task-name`
        - `div.kanbn-task-row`
          - `div.kanbn-task-data.kanbn-task-tags`
            - `span.kanbn-task-tag.kanbn-task-tag-{tag name in snakecase}`
        - `div.kanbn-task-row`
          - `div.kanbn-task-data.kanbn-task-assigned`
            - `i.codicon.codicon-account`
          - `div.kanbn-task-data.kanbn-task-date`
            - `i.codicon.codicon-clock`
          - `div.kanbn-task-data.kanbn-task-comments`
            - `i.codicon.codicon-comment`
          - `div.kanbn-task-data.kanbn-task-sub-tasks`
            - `i.codicon.codicon-tasklist`
          - `div.kanbn-task-data.kanbn-task-workload`
            - `i.codicon.codicon-run`
          - `div.kanbn-task-progress`

### Task editor

- `// TODO`
