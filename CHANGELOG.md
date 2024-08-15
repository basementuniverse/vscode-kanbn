# 0.14.1

Fix to the colour scheme of butttons on light themes: [#25](https://github.com/samgiz/vscode-kanbn/pull/25).

# 0.14.0

* New `Open Task` command to open an existing task to edit.
* All commands now allow selecting a board even if no workspaces are open, when there are global boards configured through `Additional Boards` in User settings.

# 0.13.2

* Fixed issue with custom `board.css` not being loaded by the extension. The custom styles should now work in all panels.
* Added task counters to the top of all columns. This used to be a feature in the past and I had accidentally removed it.
* Fix a bug where a task wouldn't save if it had a progress value set.

# 0.13.1

* Fixed a few of issues with mapping between the extension server and task editor panel that disallowed saving a task that had tags, subtasks or custom fields.
* Fixed a name validation issue that didn't allow saving tasks unless the task name had changed.
* Fixed rendering of dates in the task editor.
* Fixed small rendering issues of custom fields in the board panel.

# 0.13.0

A number of changes to the task editor:
* Editor state is now saved even when the editor is hidden, and restored once the editor is shown again. Previously hiding an editor would discard any user changes to the task being edited if it wasn't saved.
* A revamp to markdown components in the task editor: `Edit` buttons are no more. Instead simply click on the text area to enter editing mode; click away to see the resulting markdown.
* Moved away from `Formik` to `react-hook-form`, which should result in a small performance improvement.
* Some other small visual changes.

Other changes:
* Fixed functionality of the kanbn status bar item. Clicking on it used to throw an error, now it shows a choice of boards to open (same as the Open Board command from the command palette).

# 0.12.1

* Fixed an issue with not being able to update titles more than one letter at a time when writing titles.

# 0.12.0

* Added support for multiple boards. New boards are stored under `.kanbn_boards/<board_name>/.kanbn`, though the legacy location `.kanbn` is still supported. Use the new `createBoard` and `openBoard` commands to choose which board you want to open at any given point, or even open all of them at once!
* Added user and workspace options called `additionalBoards` that allow specifying non-standard board locations to be accessible from a workspace or globally.
* The extension webview panels now take up much less memory when hidden.
* Updated most of the dependencies.

# 0.11.0

* KaTeX support in task markdown (description and comments) using `$$...$$` for blocks and `$...$` for inline
* Syntax highlighting for code blocks in task markdown (description and comments)
* Columns can now be sorted, with the ability to optionally save sort settings per column
* Added relations and custom fields to task cards
* Task cards can be customised using `board.css`
* Custom fields can be modified using task editor
* Board can be filtered by custom field values

# 0.10.0

* Added task archive, tasks can now be sent to the archive folder and restored from the archive folder
* Added commands to archive and restore multiple tasks
* Fixed debounced updates on burndown chart

# 0.9.3

* Fixed performance issue where React app would keep adding event listeners every time the board was re-rendered

# 0.9.2

* Update kanbn dependency, fixes some bugs in paramCase converter that were causing task ids to not generate correctly (which would have broken lots of boards and required manual fixing... this should sort out most if not all of the problems)

# 0.9.1

* Update kanbn dependency, now has support for non-latin characters in task ids. _Note: task ids should be generated from the task name the same as before, but there might be edge-cases where this doesn't happen. You might need to manually rename some tasks and update their links in `index.md` accordingly. Use `kanbn validate` to quickly find issues. Please let me know via Github issues if this occurs!

# 0.9.0

* Update kanbn dependency, markdown inside task comments will be parsed correctly (previously any markdown inside comments would be incorrectly compiled into the task description)
* Task comments will be rendered as markdown instead of raw text
* Better visual feedback when a task comment is being edited (the button icon and tooltip will change)
* Textarea inputs will automatically resize based on their contents
* Changed 'Started Column' icon to make it more consistent with the status bar icons

# 0.8.0

* Update kanbn dependency, now using auto-normalisation for burndown chart datapoints, see [here](https://github.com/basementuniverse/kanbn/blob/master/docs/commands/burndown.txt) for more information

# 0.7.3

* Speculative fix for no_case bug when parsing & converting task names

# 0.7.2

* Updated kanbn dependency, task workload calculations are now working correctly on burndown chart
* Task creation events are now reported correctly on burndown chart

# 0.7.1

* Fixed bug where task editor would reset to Create mode after renaming a task
* Updated default stylesheet to make tag text easier to see on some background colours

# 0.7.0

* Markdown preview for task descriptions
* Task comments now render as comments, toggle comment editing by clicking the edit button next to each comment

# 0.6.0

* Update kanbn dependency, folder names and index filename can now be configured, see [here](https://github.com/basementuniverse/kanbn/blob/master/docs/advanced-configuration.md) for more information

# 0.5.0

* Update kanbn dependency, now using YAML front matter for index options and task metadata

# 0.4.0

* Added button to clear filters
* Added configuration setting to hide status bar icon when uninitialised
* Added configuration setting to hide task notifications
* Added button for starting a new sprint, shows current sprint
* Added burndown chart
* Fixed id field one-change-behind bug in task editor

# 0.3.2

* Fixed issue with pruned node_modules files, turns out some of them actually _were_ necessary...

# 0.3.1

* Fixed typo in .vscodeignore file
* Pruned lots of unnecessary node_modules files

# 0.3.0

* Finished writing documentation, fixed some links and typos
* Fixed task titles from being center-aligned to left-aligned
* Description filter now includes sub-task text

# 0.2.0

* Initial release version
