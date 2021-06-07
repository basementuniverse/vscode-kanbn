import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import KanbnTaskPanel from "./KanbnTaskPanel";
import KanbnBurndownPanel from "./KanbnBurndownPanel";

const sortByFields: { [key: string]: string } = {
  'Name': 'name',
  'Created': 'created',
  'Updated': 'updated',
  'Started': 'started',
  'Completed': 'completed',
  'Due': 'due',
  'Assigned': 'assigned',
  'Count sub-tasks': 'countSubTasks',
  'Count tags': 'countTags',
  'Count relations': 'countRelations',
  'Count comments': 'countComments',
  'Workload': 'workload',
};

export default class KanbnBoardPanel {
  public static currentPanel: KanbnBoardPanel | undefined;

  private static readonly viewType = "react";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: typeof import("@basementuniverse/kanbn/src/main");
  private readonly _kanbnFolderName: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionPath: string,
    workspacePath: string,
    kanbn: typeof import("@basementuniverse/kanbn/src/main"),
    kanbnFolderName: string
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it, otherwise create a new panel
    if (KanbnBoardPanel.currentPanel) {
      KanbnBoardPanel.currentPanel._panel.reveal(column);
    } else {
      KanbnBoardPanel.currentPanel = new KanbnBoardPanel(
        extensionPath,
        workspacePath,
        column || vscode.ViewColumn.One,
        kanbn,
        kanbnFolderName
      );
    }
  }

  public static async update() {
    if (KanbnBoardPanel.currentPanel) {
      let index: any;
      try {
        index = await KanbnBoardPanel.currentPanel._kanbn.getIndex();
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
        return;
      }
      let tasks: any[];
      try {
        tasks = (await KanbnBoardPanel.currentPanel._kanbn.loadAllTrackedTasks(index)).map((task) =>
          KanbnBoardPanel.currentPanel!._kanbn.hydrateTask(index, task)
        );
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
        return;
      }
      KanbnBoardPanel.currentPanel._panel.webview.postMessage({
        type: "index",
        index,
        tasks,
        hiddenColumns: index.options.hiddenColumns ?? [],
        startedColumns: index.options.startedColumns ?? [],
        completedColumns: index.options.completedColumns ?? [],
        columnSorting: index.options.columnSorting ?? {},
        customFields: index.options.customFields ?? [],
        dateFormat: KanbnBoardPanel.currentPanel._kanbn.getDateFormat(index),
        showBurndownButton: vscode.workspace.getConfiguration("kanbn").get("showBurndownButton"),
        showSprintButton: vscode.workspace.getConfiguration("kanbn").get("showSprintButton"),
      });
    }
  }

  private constructor(
    extensionPath: string,
    workspacePath: string,
    column: vscode.ViewColumn,
    kanbn: typeof import("@basementuniverse/kanbn/src/main"),
    kanbnFolderName: string
  ) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;
    this._kanbn = kanbn;
    this._kanbnFolderName = kanbnFolderName;

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
        vscode.Uri.file(path.join(this._extensionPath, "node_modules", "vscode-codicons", "dist")),
      ],
    });
    (this._panel as any).iconPath = {
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

          // Open a task in the editor
          case "kanbn.task":
            KanbnTaskPanel.show(
              this._extensionPath,
              this._workspacePath,
              this._kanbn,
              this._kanbnFolderName,
              message.taskId,
              message.columnName
            );
            return;

          // Move a task
          case "kanbn.move":
            try {
              await kanbn.moveTask(message.task, message.columnName, message.position);
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
              message.columnName
            );
            return;

          // Sort a column
          case "kanbn.sortColumn":
            // Load the index
            const index = await this._kanbn.getIndex();
            let customFields = [];
            if ('customFields' in index.options) {
              customFields = index.options.customFields.map(
                (customField: { name: string, type: string }) => customField.name
              );
            }
            // Prompt for a task property to sort by
            const sortBy: string = await vscode.window.showQuickPick(
              [
                'None',
                ...Object.keys(sortByFields),
                ...customFields,
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

              // Prompt for sort direction and save settings
              const sortDirection = await vscode.window.showQuickPick(
                [
                  'Ascending',
                  'Descending',
                ],
                {
                  placeHolder: 'Sort direction',
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
                        field: sortBy in sortByFields ? sortByFields[sortBy] : sortBy,
                        order: sortDirection === 'Descending' ? 'descending' : 'ascending',
                      }
                    ],
                    saveSort === 'Yes'
                  );
                  KanbnBoardPanel.update();
                }
              }
            }
            return;

          // Open a burndown chart
          case "kanbn.burndown":
            KanbnBurndownPanel.createOrShow(
              this._extensionPath,
              this._workspacePath,
              this._kanbn,
              this._kanbnFolderName
            );
            KanbnBurndownPanel.update();
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
                await kanbn.sprint(newSprintName, "", new Date());
              } catch (e) {
                vscode.window.showErrorMessage(e.message);
              }
            }
            KanbnBurndownPanel.update();
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    KanbnBoardPanel.currentPanel = undefined;

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
    const scriptUri = vscode.Uri.file(path.join(this._extensionPath, "build", mainScript)).with({
      scheme: "vscode-resource",
    });
    const styleUri = vscode.Uri.file(path.join(this._extensionPath, "build", mainStyle)).with({
      scheme: "vscode-resource",
    });
    const customStyleUri = vscode.Uri.file(
      path.join(this._workspacePath, this._kanbnFolderName, "board.css")
    ).with({ scheme: "vscode-resource" });
    const codiconsUri = vscode.Uri.file(
      path.join(this._extensionPath, "node_modules", "vscode-codicons", "dist", "codicon.css")
    ).with({ scheme: "vscode-resource" });

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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}'; font-src vscode-resource:; style-src vscode-resource: 'unsafe-inline' http: https: data:;">
<base href="${vscode.Uri.file(path.join(this._extensionPath, "build")).with({ scheme: "vscode-resource" })}/">
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
