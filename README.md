# Kanbn Extension for Visual Studio Code

[![MIT License](https://img.shields.io/github/license/basementuniverse/vscode-kanbn?color=orange)](https://opensource.org/licenses/MIT)

This extension adds a [Kanbn](https://www.npmjs.com/package/@basementuniverse/kanbn)-powered kanban board to Visual Studio Code.

This extension is a fork of the original [Kanbn Extension](https://github.com/basementuniverse/vscode-kanbn). Some documentation may be out of date. Please report any issues through [GitHub](https://github.com/samgiz/vscode-kanbn/issues/new).

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

- `Kanbn: Create board` will create a Kanbn board in the current workspace.
- `Kanbn: Open board` will open open a Kanbn board.
- `Kanbn: Open burndown chart` will open a burndown chart.
- `Kanbn: Add task` will open the task editor.
- `Kanbn: Archive tasks` will send tasks to the archive.
- `Kanbn: Restore tasks` will restore tasks from the archive.

## Configuration settings

The following configuration settings are available:

- `kanbn.showUninitialisedStatusBarItem` when set to `true`, the status bar item will be displayed in workspaces where Kanbn has not yet been initialised. If set to `false`, Kanbn can still be initialised using the `Kanbn: Initialise Kanbn` command.
- `kanbn.showTaskNotifications` when set to `true`, notifications will be displayed when a task is created, updated or deleted.
- `kanbn.showSprintButton` when set to `true`, a 'Start sprint` button will will appear above the Kanbn board. This button will show the current sprint name if a sprint is currently active, and can be used to start a new sprint.
- `kanbn.showBurndownButton` when set to `true`, a 'Show burndown chart` button will appear above the Kanbn board.

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

## Styling the Kanbn board

This extension has been tested using various themes (light, dark and high-contrast), so it should always look somewhat presentable. However, if you'd like to set your own styles you can do so by creating a CSS file called `board.css` in the Kanbn directory. [Check here](docs/styles.md) for more information.
