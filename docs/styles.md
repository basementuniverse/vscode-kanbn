# Styles

The Kanbn board has a default style which is based on the current vscode theme, however you can override this by creating a CSS file called `board.css` inside the Kanbn directory (by default this is `.kanbn/`). A reference of class names is provided below.

You can view the default stylesheet [here](https://github.com/basementuniverse/vscode-kanbn/blob/main/src/index.css).

Visual Studio Code will add `vscode-light`, `vscode-dark` and `vscode-high-contrast` class names to the `body` tag, depending on the current theme.

Various Codicon icons have been used in this extension. Check [here](https://code.visualstudio.com/api/references/icons-in-labels) for a listing of available icons.

## Column and tag configuration

Each column is given a CSS class containing the column name in param-case. You can use this to apply custom styles to specific columns.

For example, say we have a column called 'In Progress'. We can apply a custom border colour like so:
```css
.kanbn-column-in-progress .kanbn-column-task-list {
    border-color: #ff0;
}
```

Similarly, each tag is given a CSS class containing the tag name in param-case.

For example, say we have tags called 'QA required' and 'Breaking Change'. We can apply custom styles like so:
```css
.kanbn-task-tag-qa-required {
    background-color: #418;
}

.kanbn-task-tag-breaking-change {
    background-color: #900;
    color: #eee;
    font-size: 1.5em;
}
```

## Task card configuration

The task cards that appear on the Kanbn board can be configured by showing or hiding different elements, or by applying alternative styles to them.

The following elements are hidden by default (but can be re-enabled by adding a custom board style):
- Updated date
- Started date
- Due date
- Completed date
- Number of comments
- Relations

Task fields are generally contained within a `.kanbn-task-data` element, most of which have `display: inline-block` by default. Additionally, the outer-container of a task card is given CSS classes containing the task's column name, completed status and overdue status.

Here's an example of a task card style using some of the above features:
```css
.kanbn-task-data-relation {
    display: block; /* this will display task relations, one per line */
}

.kanbn-task-data-relation-blocks {
    color: #900;
    font-weight: bold;  /* this will highlight task relations of type 'blocks' */
}

.kanbn-task-completed .kanbn-task-data-completed {
    display: inline-block; /* this will show the completed date only for tasks that have been completed */
}
```

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
- `kanbn-column-{Column name in param-case}`
- `kanbn-column-name`
- `kanbn-column-count`
- `kanbn-column-button`
- `kanbn-create-task-button`
- `kanbn-sort-column-button`
- `kanbn-column-sorted`
- `kanbn-column-task-list-container`
- `kanbn-column-task-list`
- `kanbn-column-task-list.drag-over`
- `kanbn-task`
- `kanbn-task-{Column name in param-case}`
- `kanbn-task-overdue`
- `kanbn-task-completed`
- `drag`
- `kanbn-task-data`
- `kanbn-task-data-label`
- `kanbn-task-data-name`
- `kanbn-task-data-tags`
- `kanbn-task-tag`
- `kanbn-task-tag-{Tag name in param-case}`
- `kanbn-task-data-custom-field`
- `kanbn-task-data-{Custom field name in param-case}
- `kanbn-task-data-assigned`
- `kanbn-task-data-created`
- `kanbn-task-data-updated`
- `kanbn-task-data-started`
- `kanbn-task-data-due`
- `kanbn-task-data-completed`
- `kanbn-task-data-comments`
- `kanbn-task-data-sub-tasks`
- `kanbn-task-data-relation`
- `kanbn-task-data-relation-{Relation type in param-case}`
- `kanbn-task-data-workload`
- `kanbn-task-progress`

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
- `kanbn-task-editor-field-label-description`
- `kanbn-task-editor-field-input`
- `kanbn-task-editor-id`
- `kanbn-task-editor-description-preview`
- `kanbn-task-editor-button-edit-description`
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
- `kanbn-task-editor-button-edit`
- `kanbn-task-editor-field-relations`
- `kanbn-task-editor-row-relation`
- `kanbn-task-editor-field-relation-type`
- `kanbn-task-editor-field-relation-task`
- `kanbn-task-editor-field-select`
- `kanbn-task-editor-field-comments`
- `kanbn-task-editor-row-comment`
- `kanbn-task-editor-field-comment-author`
- `kanbn-task-editor-field-comment-author-value`
- `kanbn-task-editor-field-comment-date`
- `kanbn-task-editor-field-comment-text`
- `kanbn-task-editor-comment-text`
- `kanbn-task-editor-column-right`
- `kanbn-task-editor-button-submit`
- `kanbn-task-editor-button-archive`
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
- `kanbn-task-tag-{Tag name in param-case}`

### Burndown chart

- `kanbn-burndown`
- `kanbn-burndown-settings`
- `kanbn-burndown-settings-sprint-select`
- `kanbn-burndown-settings-input`
- `kanbn-burndown-settings-start-date`
- `kanbn-burndown-settings-end-date`
- `kanbn-burndown-settings-sprint-mode`
- `kanbn-burndown-settings-date-mode`
- `kanbn-header-button-active`
- `kanbn-header-button-inactive`
- `kanbn-burndown-chart`
- `kanbn-burndown-line`
- `kanbn-burndown-point`
- `kanbn-burndown-grid`
- `kanbn-burndown-tooltip`
- `kanbn-burndown-tooltip-date`
- `kanbn-burndown-tooltip-workload`
- `kanbn-burndown-tooltip-count`
- `kanbn-burndown-tooltip-task`

### Syntax highlighting

See [index.css](https://github.com/basementuniverse/vscode-kanbn/blob/main/src/index.css) for built-in syntax highlighting styles and token class-names.
