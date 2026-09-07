# Kanbn Extension for Visual Studio Code

This extension adds a [Kanbn](https://www.npmjs.com/package/@basementuniverse/kanbn)-powered kanban board to Visual Studio Code.

![Kanbn](docs/preview.gif "Kanbn")

## What is Kanbn?

Kanbn is a CLI kanban application that stores the kanban board and tasks inside your repository as markdown files. This makes it easy to view and edit tasks using any editor, and it means you can benefit from Git's version control and collaboration features when doing project management.

You don't need to have Kanbn installed to use this extension.

[Check here](https://www.npmjs.com/package/@basementuniverse/kanbn) for more information about Kanbn.

## How do I install this extension?

To install the extension, open the Extensions view, search for `kanbn` to filter results and select 'Kanbn Extension for Visual Studio Code'.

## What does this extension add?

When you open a workspace, there will be a new item in the status bar. If Kanbn isn't already initialised in the open workspace, clicking this item will allow you to initialise a new Kanbn project.

![Kanbn status bar item](docs/status-bar-item.png "Kanbn status bar item")

If Kanbn is initialised, the status bar item will display the total number of tasks, the number of tasks that have been started and the number of completed tasks. Click on the status bar item to open the Kanbn board.

On the Kanbn board, you can move tasks between columns, filter visible tasks and create new tasks.

Click on a task's title to open the task editor in a new tab. From here, you can modify or delete tasks.

You can also modify the index or task files directly, or by using Kanbn CLI commands, and the Kanbn board should update automatically to reflect these changes.

## Commands

The following commands are available:

- `Kanbn: Initialise Kanbn` will initialise Kanbn in the open workspace.
- `Kanbn: Open board` will open open the Kanbn board.
- `Kanbn: Open burndown chart` will open a burndown chart.
- `Kanbn: Add task` will open the task editor.
- `Kanbn: Archive tasks` will send tasks to the archive.
- `Kanbn: Restore tasks` will restore tasks from the archive.

## Configuration settings

The following configuration settings are available:

- `kanbn.showUninitialisedStatusBarItem` when set to `true`, the status bar item will be displayed in workspaces where Kanbn has not yet been initialised. If set to `false`, Kanbn can still be initialised using the `Kanbn: Initialise Kanbn` command.
- `kanbn.showTaskNotifications` when set to `true`, notifications will be displayed when a task is created, updated or deleted.
- `kanbn.autoSave` can be set to `inherit`, `off`, `afterDelay`, `onWindowChange` or `onWindowChangeWithoutDelay`. This setting controls when task edits will be automatically saved. If set to `inherit`, the setting will be inherited from the global VS Code settings.
- `kanbn.autoSaveDelay` when `kanbn.autoSave` is set to `afterDelay`, this setting controls the delay (in milliseconds) before task edits are automatically saved.
- `kanbn.showSprintButton` when set to `true`, a 'Start sprint` button will will appear above the Kanbn board. This button will show the current sprint name if a sprint is currently active, and can be used to start a new sprint.
- `kanbn.showBurndownButton` when set to `true`, a 'Show burndown chart` button will appear above the Kanbn board.
- `kanbn.showGanttButton` when set to `true`, a 'Show Gantt chart` button will appear above the Kanbn board.

## Filtering the Kanbn board

At the top-right of the Kanbn board there is a filter input. To filter visible tasks, enter a filter string and click the filter button (or press Enter).

### Filter string syntax

Text entered into the filter string input will be tested against each task's `id` and `name` fields. To filter on other fields, try the following:

- `overdue` will filter all tasks that have a due date in the past
- `description:search-string` will filter for tasks that contain `search-string` in their description or sub-tasks
- `assigned:search-string` will filter for tasks that contain `search-string` in their assigned user
- `tag:search-string` will filter for tasks that contain `search-string` in one of their tags
- `relation:search-string` will filter for tasks that contain `search-string` in one of their relations (either the relation type or related task id)
- `subtask:search-string` will filter for tasks that contain `search-string` in one of their sub-tasks
- `comment:search-string` will filter for tasks that contain `search-string` in one of their comments (either the comment author or text)
- `{custom field name}:search-string` will filter for tasks that have a custom field in their metadata that contains `search-string` in its value
- `{boolean custom field name}` will filter for tasks that have a boolean custom field in their metadata set to true

#### Examples

For these examples, assume we have a string custom field 'MyCustomField' and a boolean custom field 'MyCustomFlag' defined in the project options, i.e. `index.md` will contain:
```yaml
customFields:
  - name: MyCustomField
    type: string
  - name: MyCustomFlag
    type: boolean
```

(See https://github.com/basementuniverse/kanbn/blob/master/docs/index-structure.md for more information on custom fields)

- `assigned:testperson tag:large mycustomflag` will show tasks that are assigned to `testperson` and have a tag `Large` (search terms are case-insensitive) and have `MyCustomFlag` set to true
- `mycustomfield:test123 some title` will show tasks that have both `some` and `title` in their name/id and have a `MyCustomField` field that contains `test123`

## Views

A view is a saved board layout: its own columns, lanes and filters over the same tasks, without moving anything or changing the board's columns. Views are configured in the board file (or in `kanbn.yml` / `kanbn.json`) — [check here](https://github.com/basementuniverse/kanbn/blob/master/docs/views.md) for how to write one.

If a board has views configured, a picker appears in the board header next to the filter input. Select a view to show it, or 'Board' to go back to the normal board.

A view is read-only. Its columns are filters with a label on them rather than the board's own columns, so there's no move that corresponds to dragging a card from one to another — tasks can't be dragged while a view is showing, and the header says so. Everything else still works: you can search and filter within a view, and clicking a task's title opens it in the task editor as usual.

A view with lanes is drawn as a stack of lanes under one row of column headings, one row per lane. Tasks that don't match any lane aren't shown, and a task that matches more than one column or lane appears in each of them.

## Writing task descriptions

Task descriptions and comments are markdown. Each one has a formatting toolbar above it while you're editing, and an Edit/Preview button to switch between the markdown source and the rendered result.

The toolbar covers bold, italic, strikethrough, headings (via a dropdown for the level), links, images, block quotes, inline code, bulleted/numbered/task lists, code blocks, tables, horizontal rules and maths. `Ctrl+B`, `Ctrl+I` and `Ctrl+K` are bound to bold, italic and link. Toolbar edits go onto the same undo stack as your typing, so `Ctrl+Z` steps back through them.

As well as the usual markdown, descriptions support:

- **Tables**, task lists (`- [ ]`), strikethrough and automatic links, via GitHub-flavoured markdown
- **Maths**, written as `$inline$` or `$$display$$`, rendered with KaTeX
- **Syntax-highlighted code blocks** — the colours can be themed, see [Styling the Kanbn board](#styling-the-kanbn-board)

### Links and images

Links and images can point at web addresses or at files in your project. Because task files live inside the Kanbn folder rather than at the root of your workspace, it matters which prefix you use:

| What you write | Where it resolves to | Notes |
| --- | --- | --- |
| `workspace:docs/plan.md` | `docs/plan.md` in the **workspace** folder | Recommended for project files. `project:` does the same thing |
| `notes/setup.md` | `notes/setup.md` inside the **Kanbn** folder | A plain relative path is relative to the Kanbn folder, so `../docs/plan.md` reaches the workspace |
| `/home/me/notes.md`, `file:///home/me/notes.md` | that exact path | Images only display if the file is inside the workspace |
| `https://example.com`, `mailto:me@example.com` | opened in your browser or mail client | |

So a screenshot stored at `docs/shot.png` in your project is written as:

```markdown
![Screenshot](workspace:docs/shot.png)
```

Clicking a link in the preview opens it: web addresses in your browser, local files in the editor (images and PDFs open in their own viewer rather than as text).

Images are only displayed if they're inside your workspace folder — a webview isn't allowed to read files from anywhere else, so an image outside it shows its alt text instead. It still works as a link.

If a path contains spaces, wrap it in angle brackets so markdown reads the whole thing:

```markdown
[The spec](<workspace:design docs/spec.md>)
```

### Dragging files into a description

You can drag a file onto a description or comment while editing it, and a link to it is inserted at the cursor. Images are inserted as images, everything else as a link, and the file's name becomes the label. Dropping several files at once inserts one per line.

Dragging from the Explorer panel is the most reliable source; drags from a file manager or from a browser usually work too, as they carry the file's location with them. Some applications hand over only a file's contents and no path at all — if that happens you'll get a message saying so, rather than a broken link.

A file inside the workspace is written as a `workspace:` path, so it keeps working no matter where the task file ends up.

## Styling the Kanbn board

This extension has been tested using various themes (light, dark and high-contrast), so it should always look somewhat presentable. However, if you'd like to set your own styles you can do so by creating a CSS file called `board.css` in the Kanbn directory. [Check here](docs/styles.md) for more information.
