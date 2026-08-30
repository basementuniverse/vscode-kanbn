import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import KanbnTaskPanel from "./KanbnTaskPanel";
import KanbnBurndownPanel from "./KanbnBurndownPanel";
import KanbnGanttPanel from "./KanbnGanttPanel";
import type { KanbnApi } from "./KanbnApi";
import { reportActionWarnings } from "./KanbnOutput";
import { nameToLabel } from "../src/labels";

// Every field kanbn can sort by. The sorter name written to the index isn't always the label, and
// the computed values at the end are booleans, which sort false before true - so they're offered as
// "matching first" rather than as a direction, which reads as nonsense for a yes/no field
const sortByFields: { [label: string]: { field: string, boolean?: true } } = {
  'Id': { field: 'id' },
  'Name': { field: 'name' },
  'Description': { field: 'description' },
  'Created': { field: 'created' },
  'Updated': { field: 'updated' },
  'Started': { field: 'started' },
  'Completed': { field: 'completed' },
  'Due': { field: 'due' },
  'Planned start': { field: 'plannedStart' },
  'Planned finish': { field: 'plannedFinish' },
  'Assigned': { field: 'assigned' },
  'Workload': { field: 'workload' },
  'Progress': { field: 'progress' },
  'Sub-tasks': { field: 'subTasks' },
  'Count sub-tasks': { field: 'countSubTasks' },
  'Tags': { field: 'tags' },
  'Count tags': { field: 'countTags' },
  'Relations': { field: 'relations' },
  'Count relations': { field: 'countRelations' },
  'Comments': { field: 'comments' },
  'Count comments': { field: 'countComments' },
  'Overdue': { field: 'overdue', boolean: true },
  'Is started': { field: 'isStarted', boolean: true },
  'Is completed': { field: 'isCompleted', boolean: true },
  'In started column': { field: 'inStartedColumn', boolean: true },
  'In completed column': { field: 'inCompletedColumn', boolean: true },
};

// Filter fields whose values are dates. The webview sends ISO strings; kanbn compares Date objects
const DATE_FILTER_FIELDS = [
  'created', 'updated', 'started', 'completed', 'due', 'plannedStart', 'plannedFinish'
];

// Filter fields whose values are numbers
const NUMBER_FILTER_FIELDS = [
  'workload', 'progress', 'count-sub-tasks', 'count-tags', 'count-relations', 'count-comments'
];

// Computed values, matched by exact equality against true or false
const BOOLEAN_FILTER_FIELDS = [
  'overdue', 'is-started', 'is-completed', 'in-started-column', 'in-completed-column'
];

export default class KanbnBoardPanel {
  // One panel per board, keyed by resolved board slug, so that several boards can be open at once
  private static panels: Record<string, KanbnBoardPanel> = {};

  private static readonly viewType = "react";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: KanbnApi;
  private readonly _kanbnFolderName: string;
  private readonly _boardSlug: string;

  // The structured filters this board is showing, in kanbn's own filter vocabulary. Held per panel
  // so two boards can be filtered independently
  private _filters: Record<string, any> = {};
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionPath: string,
    workspacePath: string,
    kanbn: KanbnApi,
    kanbnFolderName: string,
    boardSlug: string
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If this board already has a panel, show it, otherwise create a new one
    const existingPanel = KanbnBoardPanel.panels[boardSlug];
    if (existingPanel) {
      existingPanel._panel.reveal(column);
    } else {
      KanbnBoardPanel.panels[boardSlug] = new KanbnBoardPanel(
        extensionPath,
        workspacePath,
        column || vscode.ViewColumn.One,
        kanbn,
        kanbnFolderName,
        boardSlug
      );
    }
  }

  /**
   * Refresh open board panels. Pass a board slug to refresh only that board, or nothing to refresh
   * every open board - which is what a file change on disk needs, since it can affect any of them
   */
  public static async update(boardSlug?: string) {
    const panels = boardSlug === undefined
      ? Object.values(KanbnBoardPanel.panels)
      : [KanbnBoardPanel.panels[boardSlug]].filter((panel) => panel !== undefined);
    for (const panel of panels) {
      await panel.refresh();
    }
  }

  /**
   * Turn the filters the webview sent into the values kanbn's filter model expects. The webview can
   * only send JSON, so dates arrive as ISO strings and have to be rebuilt
   */
  private async buildFilters(index: any): Promise<Record<string, any>> {
    const customFields: Array<{ name: string, type: string }> = index.options.customFields ?? [];
    const customFieldTypes = new Map(customFields.map((field) => [field.name, field.type]));
    const result: Record<string, any> = {};

    for (const [key, rawValue] of Object.entries(this._filters || {})) {
      // An empty value means "don't filter on this at all", which is different from filtering on
      // false - so only genuinely absent values are skipped
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        continue;
      }
      const values = (Array.isArray(rawValue) ? rawValue : [rawValue])
        .filter((value) => value !== undefined && value !== null && value !== "");
      if (!values.length) {
        continue;
      }

      const customType = customFieldTypes.get(key);
      const isDate = customType === "date" || DATE_FILTER_FIELDS.indexOf(key) !== -1;
      const isNumber = customType === "number" || NUMBER_FILTER_FIELDS.indexOf(key) !== -1;
      const isBoolean = customType === "boolean" || BOOLEAN_FILTER_FIELDS.indexOf(key) !== -1;

      if (isDate) {
        const dates = values
          .map((value) => new Date(Date.parse(String(value))))
          .filter((date) => !Number.isNaN(date.getTime()));
        if (dates.length) {
          result[key] = dates;
        }
        continue;
      }

      if (isNumber) {
        const numbers = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
        if (numbers.length) {
          result[key] = numbers;
        }
        continue;
      }

      if (isBoolean) {
        result[key] = values.map((value) => value === true || value === "true");
        continue;
      }

      // '@me' is only ever interpreted in a filter, and only for assigned. Kanbn treats an
      // unresolvable user as an error rather than a filter that quietly matches everything
      if (key === "assigned" && values.length === 1 && String(values[0]).trim() === "@me") {
        const currentUser = await this._kanbn.currentUser();
        if (!currentUser) {
          throw new Error("Can't tell who you are, so '@me' doesn't match anything. Set KANBN_USER or a git username.");
        }
        result[key] = currentUser;
        continue;
      }

      result[key] = values.map((value) => String(value));
    }

    return result;
  }

  private async refresh() {
    let index: any;
    try {
      index = await this._kanbn.getIndex();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    let tasks: any[];
    try {
      tasks = (await this._kanbn.loadAllTrackedTasks(index)).map((task) =>
        this._kanbn.hydrateTask(index, task)
      );
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    // The board switcher only appears when there's more than one board, so a single-board workspace
    // sees exactly what it always has
    let boards: { slug: string, name: string, main: boolean }[] = [];
    try {
      boards = (await this._kanbn.listBoards()).map((board) => ({
        slug: board.slug,
        name: board.name,
        main: board.main,
      }));
    } catch (error) {
      // Board discovery is a convenience here - a board that can't be listed shouldn't stop the
      // board we're actually looking at from rendering
    }

    // Filtering runs here rather than in the webview so that it's kanbn's own filter model - regex
    // string matching, date and number ranges, computed values, custom fields - rather than a second
    // implementation of it. The full task list is still sent, with the matching ids alongside, so
    // that a filtered-out task leaves a column intact rather than a hole
    let filteredTaskIds: string[] | null = null;
    let filterError: string | null = null;
    try {
      const filters = await this.buildFilters(index);
      if (Object.keys(filters).length) {
        filteredTaskIds = this._kanbn
          .filterAndSortTasks(index, tasks, filters, [])
          .map((task: any) => task.id);
      }
    } catch (error) {
      // String filters are regular expressions, so a half-typed one throws. Report it in the board
      // rather than as a notification, which would fire on every keystroke
      filterError = error instanceof Error ? error.message : String(error);
    }

    // Lines written straight into a column that aren't task links. They have no id, no metadata and
    // no dates, and count towards nothing - kanbn shows them dimmed at the end of their column, and
    // so do we. Asking kanbn which lines qualify avoids a second opinion on what a simple task is
    let simpleTasks: Array<{ column: string, position: number, text: string, raw: string }> = [];
    try {
      simpleTasks = await this._kanbn.findSimpleTasks(null, index);
    } catch (error) {
      // A board with no stray lines is the normal case, and a parse problem here shouldn't stop the
      // real tasks rendering
    }

    // Used by the filter panel to offer known names for the assigned filter
    let contributors: Array<{ name: string, displayName: string }> = [];
    try {
      contributors = await this._kanbn.getContributors();
    } catch (error) {
      // A convenience - the assigned filter still accepts free text without it
    }

    this._panel.webview.postMessage({
      type: "index",
      index,
      tasks,
      simpleTasks,
      boards,
      contributors,
      filteredTaskIds,
      filterError,
      boardSlug: this._boardSlug,
      hiddenColumns: index.options.hiddenColumns ?? [],
      startedColumns: index.options.startedColumns ?? [],
      completedColumns: index.options.completedColumns ?? [],

      // A board can track its own started/completed state in custom metadata fields, so cards have
      // to read the fields this board uses rather than assuming 'started' and 'completed'
      startedField: index.options.startedField || "started",
      completedField: index.options.completedField || "completed",
      columnSorting: index.options.columnSorting ?? {},
      customFields: index.options.customFields ?? [],
      dateFormat: this._kanbn.getDateFormat(index),
      showBurndownButton: vscode.workspace.getConfiguration("kanbn").get("showBurndownButton"),
      showGanttButton: vscode.workspace.getConfiguration("kanbn").get("showGanttButton"),
      showSprintButton: vscode.workspace.getConfiguration("kanbn").get("showSprintButton"),
    });
  }

  private constructor(
    extensionPath: string,
    workspacePath: string,
    column: vscode.ViewColumn,
    kanbn: KanbnApi,
    kanbnFolderName: string,
    boardSlug: string
  ) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;
    this._kanbn = kanbn;
    this._kanbnFolderName = kanbnFolderName;
    this._boardSlug = boardSlug;

    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnBoardPanel.viewType, "Kanbn Board", column, {
      // Enable javascript in the webview
      enableScripts: true,

      // Retain state even when hidden
      retainContextWhenHidden: true,

      // Restrict the webview to only loading content from allowed paths
      localResourceRoots: [
        vscode.Uri.file(path.join(this._extensionPath, "build")),
        vscode.Uri.file(path.join(this._workspacePath, this._kanbnFolderName)),
        vscode.Uri.file(path.join(this._extensionPath, "node_modules", "@vscode", "codicons", "dist")),
      ],
    });
    this._panel.iconPath = {
      light: vscode.Uri.file(path.join(this._extensionPath, "resources", "project_light.svg")),
      dark: vscode.Uri.file(path.join(this._extensionPath, "resources", "project_dark.svg")),
    };

    // Set the webview's title to the kanbn project name
    this._kanbn.getIndex().then((index) => {
      this._panel.title = index.name;
    });

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {

          // Display error message
          case "error":
            vscode.window.showErrorMessage(message.text);
            return;

          // The webview has registered its message listener, so it can be sent board data. Anything
          // posted before this point was dropped
          case "kanbn.webviewReady":
            await this.refresh();
            return;

          // Open a task in the editor
          case "kanbn.task":
            KanbnTaskPanel.show(
              this._extensionPath,
              this._workspacePath,
              this._kanbn,
              this._kanbnFolderName,
              message.taskId,
              message.columnName,
              this._boardSlug
            );
            return;

          // Apply structured filters to this board
          case "kanbn.setFilters":
            this._filters = message.filters || {};
            await this.refresh();
            return;

          // Open another board
          case "kanbn.openBoard":
            KanbnBoardPanel.createOrShow(
              this._extensionPath,
              this._workspacePath,
              this._kanbn.board(message.boardSlug),
              this._kanbnFolderName,
              message.boardSlug
            );
            KanbnBoardPanel.update(message.boardSlug);
            return;

          // Move a task
          case "kanbn.move":
            try {
              await this._kanbn.moveTask(message.task, message.columnName, message.position);
              reportActionWarnings(this._kanbn, `moving ${message.task}`);
            } catch (e) {
              vscode.window.showErrorMessage(e.message);
            }
            return;

          // Create a task
          case "kanbn.addTask":
            KanbnTaskPanel.show(
              this._extensionPath,
              this._workspacePath,
              this._kanbn,
              this._kanbnFolderName,
              null,
              message.columnName,
              this._boardSlug
            );
            return;

          // Sort a column
          case "kanbn.sortColumn":
            // Load the index
            const index = await this._kanbn.getIndex();
            // A board's custom fields sort by their own name, but that name is usually written as an
            // identifier, so offer them as labels like the fields above rather than switching to raw
            // config names partway down the list
            const customFieldsByLabel: { [label: string]: string } = {};
            if ('customFields' in index.options) {
              for (const customField of index.options.customFields as { name: string }[]) {
                customFieldsByLabel[nameToLabel(customField.name)] = customField.name;
              }
            }
            // Prompt for a task property to sort by
            const sortBy = await vscode.window.showQuickPick(
              [
                'None',
                ...Object.keys(sortByFields),
                ...Object.keys(customFieldsByLabel),
              ],
              {
                placeHolder: 'Sort this column by...',
                canPickMany: false,
              }
            );
            if (sortBy !== undefined) {
              // Clear any saved sort settings for this column
              if (sortBy === 'None') {
                await this._kanbn.sort(message.columnName, [], false);
                return;
              }

              // Booleans sort false before true, so "descending" is what brings matching tasks to
              // the top. Asking for a direction on a yes/no field just invites getting it backwards
              const isBooleanField = sortBy in sortByFields && sortByFields[sortBy].boolean === true;
              const sortDirection = await vscode.window.showQuickPick(
                isBooleanField
                  ? ['Matching first', 'Matching last']
                  : ['Ascending', 'Descending'],
                {
                  placeHolder: isBooleanField ? `Sort ${sortBy.toLowerCase()} tasks...` : 'Sort direction',
                  canPickMany: false,
                }
              );
              if (sortDirection !== undefined) {
                const saveSort = await vscode.window.showQuickPick(
                  [
                    "Yes",
                    "No",
                  ],
                  {
                    placeHolder: 'Save sort settings for this column?',
                    canPickMany: false,
                  }
                );
                if (saveSort !== undefined) {
                  await this._kanbn.sort(
                    message.columnName,
                    [
                      {
                        field: sortBy in sortByFields
                          ? sortByFields[sortBy].field
                          : (customFieldsByLabel[sortBy] ?? sortBy),
                        order: (sortDirection === 'Descending' || sortDirection === 'Matching first')
                          ? 'descending'
                          : 'ascending',
                      }
                    ],
                    saveSort === 'Yes'
                  );
                  KanbnBoardPanel.update(this._boardSlug);
                }
              }
            }
            return;

          // Open a burndown chart
          case "kanbn.burndown":
            await KanbnBurndownPanel.createOrShow(
              this._extensionPath,
              this._workspacePath,
              this._kanbn,
              this._kanbnFolderName,
              this._boardSlug
            );
            KanbnBurndownPanel.update(this._boardSlug);
            return;

          // Open a gantt chart
          case "kanbn.gantt":
            await KanbnGanttPanel.createOrShow(
              this._extensionPath,
              this._workspacePath,
              this._kanbn,
              this._kanbnFolderName,
              this._boardSlug
            );
            KanbnGanttPanel.update(this._boardSlug);
            return;

          // Start a new sprint
          case "kanbn.sprint":
            // Prompt for a sprint name
            const newSprintName = await vscode.window.showInputBox({
              placeHolder: "The sprint name.",
            });

            // If the input prompt wasn't cancelled, start a new sprint
            if (newSprintName !== undefined) {
              try {
                await this._kanbn.sprint(newSprintName, "", new Date());
              } catch (e) {
                vscode.window.showErrorMessage(e.message);
              }
            }
            KanbnBurndownPanel.update(this._boardSlug);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    delete KanbnBoardPanel.panels[this._boardSlug];

    // Clean up our resources
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview() {
    const manifest = require(path.join(this._extensionPath, "build", "asset-manifest.json"));
    const mainScript = manifest["main.js"];
    const mainStyle = manifest["main.css"];
    const webview = this._panel.webview;
    const toUri = (...segments: string[]) => webview.asWebviewUri(vscode.Uri.file(path.join(...segments)));
    const scriptUri = toUri(this._extensionPath, "build", mainScript);
    const styleUri = toUri(this._extensionPath, "build", mainStyle);
    const customStyleUri = toUri(this._workspacePath, this._kanbnFolderName, "board.css");
    const codiconsUri = toUri(
      this._extensionPath, "node_modules", "@vscode", "codicons", "dist", "codicon.css"
    );
    const baseUri = toUri(this._extensionPath, "build");

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
<meta name="theme-color" content="#000000">
<title>Kanbn Board</title>
<link rel="stylesheet" type="text/css" href="${styleUri}">
<link rel="stylesheet" type="text/css" href="${customStyleUri}">
<link rel="stylesheet" type="text/css" href="${codiconsUri}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline' http: https: data:;">
<base href="${baseUri}/">
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
