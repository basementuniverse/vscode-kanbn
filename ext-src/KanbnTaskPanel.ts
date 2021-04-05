import * as path from 'path';
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

export default class KanbnTaskPanel {
  private static readonly viewType = 'react';
  private static panels: KanbnTaskPanel[] = [];

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: typeof import('@basementuniverse/kanbn/src/main');
  private readonly _taskId: string|null;
  private readonly _columnName: string;
  private _disposables: vscode.Disposable[] = [];

  public static async show(
    extensionPath: string,
    workspacePath: string,
    kanbn: typeof import('@basementuniverse/kanbn/src/main'),
    taskId: string|null,
    columnName: string|null
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    let index: any;
    try {
      index = await kanbn.getIndex();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
      return;
    }
    let tasks: any[];
    try {
      tasks = (await kanbn.loadAllTrackedTasks(index)).map(
        task => ({
          uuid: uuidv4(),
          ...kanbn.hydrateTask(index, task)
        })
      );
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
      return;
    }
    let task = null;
    if (taskId) {
      task = tasks.find(t => t.id === taskId) ?? null;
    }

    // If no columnName is specified, use the first column
    if (!columnName) {
      columnName = Object.keys(index.columns)[0];
    }

    // Create a new panel
    const taskPanel = new KanbnTaskPanel(
      extensionPath,
      workspacePath,
      column || vscode.ViewColumn.One,
      kanbn,
      taskId,
      columnName
    );
    KanbnTaskPanel.panels.push(taskPanel);

    // Send task data to the webview
    taskPanel._panel.webview.postMessage({
      type: 'task',
      index,
      task,
      columnName: taskPanel._columnName,
      tasks,
      dateFormat: kanbn.getDateFormat(index)
    });
  }

  private constructor(
    extensionPath: string,
    workspacePath: string,
    column: vscode.ViewColumn,
    kanbn: typeof import('@basementuniverse/kanbn/src/main'),
    taskId: string|null,
    columnName: string
  ) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;
    this._kanbn = kanbn;
    this._taskId = taskId;
    this._columnName = columnName;

    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnTaskPanel.viewType, 'New task', column, {
      // Enable javascript in the webview
      enableScripts: true,

      // Retain state even when hidden
      retainContextWhenHidden: true,

      // Restrict the webview to only loading content from allowed paths
      localResourceRoots: [
        vscode.Uri.file(path.join(this._extensionPath, 'build')),
        vscode.Uri.file(path.join(this._workspacePath, this._kanbn.getFolderName())),
        vscode.Uri.file(path.join(this._extensionPath, 'node_modules', 'vscode-codicons', 'dist'))
      ]
    });

    // Set the webview's title to the kanbn task name
    if (this._taskId !== null) {
      this._kanbn.getTask(this._taskId).then(task => {
        this._panel.title = task.name;
      });
    }

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {

        // Display error message
        case 'error':
          vscode.window.showErrorMessage(message.text);
          return;

        // Update the task webview panel title
        case 'kanbn.updatePanelTitle':
          this._panel.title = message.title;
          return;

        // Create a task
        case 'kanbn.create':
          // TODO create task
          vscode.window.showInformationMessage('create task');
          return;

        // Update a task
        case 'kanbn.update':
          // TODO update task
          vscode.window.showInformationMessage('update task');
          return;

        // Delete a task
        case 'kanbn.delete':
          // TODO delete task
          vscode.window.showInformationMessage('delete task');
          return;
      }
    }, null, this._disposables);
  }

  public dispose() {
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview() {
    const manifest = require(path.join(this._extensionPath, 'build', 'asset-manifest.json'));
    const mainScript = manifest['main.js'];
    const mainStyle = manifest['main.css'];
    const scriptUri = vscode.Uri
      .file(path.join(this._extensionPath, 'build', mainScript))
      .with({ scheme: 'vscode-resource' });
    const styleUri = vscode.Uri
      .file(path.join(this._extensionPath, 'build', mainStyle))
      .with({ scheme: 'vscode-resource' });
    const customStyleUri = vscode.Uri
      .file(path.join(this._workspacePath, this._kanbn.getFolderName(), 'board.css'))
      .with({ scheme: 'vscode-resource' });
    const codiconsUri = vscode.Uri
      .file(path.join(this._extensionPath, 'node_modules', 'vscode-codicons', 'dist', 'codicon.css'))
      .with({ scheme: 'vscode-resource' });

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
<base href="${vscode.Uri.file(path.join(this._extensionPath, 'build')).with({ scheme: 'vscode-resource' })}/">
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
