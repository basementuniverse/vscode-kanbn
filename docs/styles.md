# Styles

The Kanbn board has a default style which is based on the current vscode theme, however you can override this by creating a CSS file `.kanbn/board.css`. A reference of class names is provided below.

You can view the default stylesheet [here](https://github.com/basementuniverse/vscode-kanbn/blob/main/src/index.css).

Visual Studio Code will add `vscode-light`, `vscode-dark` and `vscode-high-contrast` class names to the `body` tag, depending on the current theme.

Various Codicon icons have been used in this extension. Check [here](https://code.visualstudio.com/api/references/icons-in-labels) for a listing of available icons.

## CSS classes

### Kanbn board

- `kanbn-header`
- `kanbn-header-name`
- `kanbn-filter`
- `kanbn-filter-input`
- `kanbn-header-button`
- `kanbn-header-button-filter`
- `kanbn-header-button-clear-filter`
- `kanbn-header-button-sprint`
- `kanbn-header-button-burndown`
- `kanbn-header-description`
- `kanbn-board`
- `kanbn-column`
- `kanbn-column-{Column name in snake-case}`
- `kanbn-column-name`
- `kanbn-column-count`
- `kanbn-create-task-button`
- `kanbn-column-task-list-container`
- `kanbn-column-task-list`
- `kanbn-column-task-list.drag-over`
- `kanbn-task`
- `kanbn-task-row`
- `kanbn-task-name`
- `kanbn-task-data`
- `kanbn-task-tags`
- `kanbn-task-tag`
- `kanbn-task-tag-{Tag name in snake-case}`
- `kanbn-task-assigned`
- `kanbn-task-date`
- `kanbn-task-workload`
- `kanbn-task-progress`
- `kanbn-task-overdue`
- `kanbn-task-comments`
- `kanbn-task-sub-tasks`

### Task editor

- `kanbn-task-editor`
- `kanbn-task-editor-title`
- `kanbn-task-editor-dirty`
- `kanbn-task-editor-dates`
- `kanbn-task-editor-form`
- `kanbn-task-editor-column-left`
- `kanbn-task-editor-field`
- `kanbn-task-editor-field-name`
- `kanbn-task-editor-field-label`
- `kanbn-task-editor-field-input`
- `kanbn-task-editor-id`
- `kanbn-task-editor-field-description`
- `kanbn-task-editor-field-textarea`
- `kanbn-task-editor-field-subtasks`
- `kanbn-task-editor-row`
- `kanbn-task-editor-row-subtask`
- `kanbn-task-editor-column`
- `kanbn-task-editor-field-subtask-completed`
- `kanbn-task-editor-field-checkbox`
- `kanbn-task-editor-field-subtask-text`
- `kanbn-task-editor-column-buttons`
- `kanbn-task-editor-button`
- `kanbn-task-editor-button-delete`
- `kanbn-task-editor-buttons`
- `kanbn-task-editor-button-add`
- `kanbn-task-editor-field-relations`
- `kanbn-task-editor-row-relation`
- `kanbn-task-editor-field-relation-type`
- `kanbn-task-editor-field-relation-task`
- `kanbn-task-editor-field-select`
- `kanbn-task-editor-field-comments`
- `kanbn-task-editor-row-comment`
- `kanbn-task-editor-field-comment-author`
- `kanbn-task-editor-field-comment-date`
- `kanbn-task-editor-field-comment-text`
- `kanbn-task-editor-column-right`
- `kanbn-task-editor-button-submit`
- `kanbn-task-editor-field-column`
- `kanbn-task-editor-field-assigned`
- `kanbn-task-editor-field-started`
- `kanbn-task-editor-field-due`
- `kanbn-task-overdue`
- `kanbn-task-editor-field-completed`
- `kanbn-task-editor-field-progress`
- `kanbn-task-progress`
- `kanbn-task-editor-field-tags`
- `kanbn-task-editor-row-tag`
- `kanbn-task-editor-field-tag`
- `kanbn-task-editor-tag-highlight`
- `kanbn-task-tag-{Tag name in snake-case}`

### Burndown chart

- `kanbn-burndown`
- `kanbn-burndown-settings`
- `kanbn-burndown-settings-sprint-select`
- `kanbn-burndown-settings-start-date`
- `kanbn-burndown-settings-end-date`
- `kanbn-burndown-settings-sprint-mode`
- `kanbn-burndown-settings-date-mode`
- `kanbn-header-button-active`
- `kanbn-header-button-inactive`
- `kanbn-burndown-grid`
- `kanbn-burndown-line`
