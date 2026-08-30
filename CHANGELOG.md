# 1.2.0

* Fixed the task editor losing sub-tasks, relations and anything else typed while a save was in flight. Every save is followed by a refresh from the extension, and the editor was rebuilt from scratch each time one arrived, so any edit made between pressing Save and the refresh landing was discarded — silently, and with the "unsaved changes" marker cleared, so the next Save then had nothing new to write. The editor now keeps its identity across refreshes and takes new data only when there is nothing unsaved to lose; a refresh that would overwrite in-progress edits is dropped, and the next one after the user saves picks the same data up. The gap grows with the size of the board, which is why this was much easier to hit on a real board than a small one
* A save blocked by validation now raises a notification naming what needs fixing, and the editor header says how many problems there are. Formik quietly does nothing when a form doesn't validate, so a save could fail with no feedback beyond an inline message that might be scrolled out of view — including for problems that were already in the task, such as an empty tag or a comment with no text, which blocked every save of that task
* The relation task dropdown now has an explicit empty option, and a relation with no task is reported instead of saved. A new relation started with no task selected, and with no option matching that the dropdown showed the first task on the board while holding an empty value — so it looked chosen and was written out as a broken link
* Saving a task no longer writes `assigned`, `progress` and `tags` onto tasks that never had them. Opening an unassigned task and saving it quietly assigned it to whoever opened it, and saving a task from a completed column stamped `progress: 1` into its front matter — along with a progress event in its history — because the editor was sending back the progress kanbn derives from the column rather than the one the task stores
* Date fields no longer lose their time of day. The editor shows a timestamp as a calendar day, and saving wrote that day back as UTC midnight, discarding the time and shifting the date by a day for anyone west of Greenwich
* Updated kanbn dependency to 2.5.1
* Added a "Kanbn: Validate board" command, which runs the same checks as `kanbn validate` and writes a report to a Kanbn output channel: files that don't parse, tasks whose dates don't match the column they're in, lines in columns that aren't task links, names used in tasks that aren't known contributors, action rules that probably don't do what they mean, and — on a workspace with more than one board — options stranded in a board file, boards that don't parse, and sprints out of order
* Where a task's missing started or completed date can be recovered from its own history, the validation report offers to fill it in
* Action rules that get skipped during a drag, an edit, an archive or a restore are now reported instead of failing silently. Rules already fired on everything the extension writes; there was just no way to tell when one didn't
* Simple tasks — lines written straight into a board file rather than linked task files — are now shown on the board, dimmed at the end of the column they were written in, with a tick box where the line has one. They're read-only here: they have no id, no metadata and no dates, and are edited in the board file or with the kanbn CLI. They don't count towards a column's task count, and they're hidden when a field filter is active, because a line has no fields to match — though searching for its text still finds it
* Kanbn views are now available on the board. A board with views configured gets a picker in its header; selecting a view lays the board out the way the view describes — its own columns, its own lanes, its own filters — over the same tasks. Views are resolved by kanbn's own filter model, so the board shows exactly what `kanbn board --view` does. A view is read-only, since a view column is a filter rather than a board column and there's no move that a drag between them would mean, so the board says so and turns dragging off while one is showing. Searching and filtering still work within a view, and boards with no views configured are unaffected
* The task count in a column heading now reflects what the filter is showing, rather than everything in the column
* Replaced the "Filter tasks" box with a filter panel: yes/no/any toggles for overdue, started, completed and started/completed columns; assigned with contributor autocomplete and an `@me` shortcut; column and tag pickers; workload, progress, sub-task, tag, comment and relation ranges; from/to pickers for all seven date fields; and custom fields typed as they're declared. Active filters show as chips you can click to remove, with a count of what matched
* Filtering now uses kanbn's own filter model rather than the extension's own approximation of it, so the board filters exactly like `kanbn find` — including regular expressions, date and number ranges, and the computed values
* The search box now searches ids, names and descriptions. The older `field:value` syntax still works as a shortcut, so `tag:bug` does what it always did
* Column sorting now offers every field kanbn can sort by, up from twelve of them: id, description, progress, planned dates, the multi-value fields, and the computed values (overdue, started, completed, in a started/completed column). Yes/no fields ask for "matching first" rather than a direction, which is easy to get backwards
* Names that come from a board's config are now shown as readable labels, rather than as the identifiers they're usually written as. A custom field declared as `designSignedOffAt` reads as "Design signed off at" in the task editor, on cards and in the filter panel, and as "DESIGN SIGNED OFF AT" where labels are uppercased, instead of running together into one word. The column sort list and a column's sort tooltip show field names the same way
* "Assigned to" and the comment author now autocomplete over the workspace's contributors, when any are declared. Both remain free text — contributors are a convenience list, and nothing validates against them
* The extension now works out who you are the same way kanbn does: `KANBN_USER`, then a contributor matched on your git email or name, then your git username. On a workspace that declares contributors it writes the agreed spelling rather than whatever git happens to say, so the extension and the CLI no longer disagree. Workspaces without contributors see exactly the git username they saw before
* Removed the `git-user-name` dependency, which pulled in a version of `parse-git-config` with an unpatched prototype pollution advisory
* Fixed completed tasks showing as overdue on the board. A task that was finished late kept its overdue styling, and the `overdue` filter kept matching it. The board now uses kanbn's own answer rather than re-deriving it from the due date
* Fixed the gantt chart treating a task as started or completed because of the column it sits in. Since kanbn 2.0 a column causes a date to be written but is no longer a substitute for one, so a task moved by hand or by a merge was drawn with a state it didn't have
* Boards that track their own started or completed state in custom metadata fields (`startedField` / `completedField`) now render correctly. Cards read the fields the board actually uses, and those fields are no longer also listed as custom fields on the same card
* Fixed board, task, burndown and gantt panels sometimes opening blank. The extension sent a panel its data as soon as the panel was created, but a webview can't receive anything until its scripts have loaded, and the message was dropped if it arrived first. Panels now send their data when the webview says it is ready
* Added support for workspaces with multiple boards. Every command that acts on a board now asks which one, each board opens in its own tab, and a board switcher appears in the board header. Workspaces with a single board are unaffected and never see a prompt
* Deleting a task that appears on several boards now offers to remove it from the current board or delete it everywhere, instead of failing
* The task editor lists the boards a task appears on, and its column on each, when there is more than one
* Burndown charts report why a board with no started columns can't be charted, instead of opening an empty chart
* Restoring archived tasks can now target every board a task was on, or just the current one, and reports boards that no longer exist
* Fixed the file watcher never seeing task files: its glob only matched the top level of the kanbn folder, so edits made outside the extension (from the CLI, or in a text editor) didn't refresh an open board
* Fixed config file changes never reaching the extension. `kanbn.yml` / `kanbn.json` sit outside the kanbn folder so weren't watched at all, and kanbn caches them, so they needed a window reload to take effect
* Board refreshes are now debounced, and the file watcher is disposed on deactivate
* Pinned `glob` to v7, because kanbn's `glob-promise` dependency needs it and a fresh install would otherwise resolve an incompatible v13, breaking the status bar and the archive commands
* Raised the minimum VS Code version to 1.70, which is the first release shipping a Node version that satisfies kanbn 2.5.0's `node >= 16.13.0` requirement
* Migrated the webviews from the legacy `vscode-resource:` URI scheme to `Webview.asWebviewUri` and `Webview.cspSource`. VS Code only rewrites the old scheme for extensions declaring `engines.vscode` below 1.60, so raising the engine would otherwise have left every panel blank
* Replaced the deprecated `vscode` dev dependency (and its `postinstall` step) with `@types/vscode`
* Task create, update, delete and archive now report errors instead of failing silently

# 1.1.0

* Fixed autosave issues in Task Editor, now saves shortly after the user stops typing, will not autosave when creating a new task, and will not defocus inputs when autosaving
* Fixed various filter issues in the Burndown and Gantt chart views

# 1.0.0

* Updated kanbn dependency and added support for new kanbn features
* Added interactive Gantt charts
* Added event history to tasks
* Fixed links not working in task descriptions, we can now link to local files and folders using relative paths, and to external websites using absolute paths
* Added auto-save for tasks (see README for configuration settings)
* Fixed idempotent task opening - if a task is already open, it will now be focused instead of opening a new instance of the same task
* Fixed some rendering issues, e.g. overflow on description preview panel

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
