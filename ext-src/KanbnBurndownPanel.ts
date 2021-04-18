import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import { v4 as uuidv4 } from "uuid";

export default class KanbnBurndownPanel {
  private static readonly viewType = "react";
  private static panels: KanbnBurndownPanel[] = [];

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: typeof import("@basementuniverse/kanbn/src/main");
  private sprintMode: boolean = true;
  private sprint: string = '';
  private startDate: string = '';
  private endDate: string = '';
  private assigned: string = '';
  private _disposables: vscode.Disposable[] = [];

  public static async show(
    extensionPath: string,
    workspacePath: string,
    kanbn: typeof import("@basementuniverse/kanbn/src/main")
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // Create a panel
    const burndownPanel = new KanbnBurndownPanel(
      extensionPath,
      workspacePath,
      column || vscode.ViewColumn.One,
      kanbn
    );
    KanbnBurndownPanel.panels.push(burndownPanel);
  }

  public static async updateAll() {
    if (KanbnBurndownPanel.panels.length === 0) {
      return;
    }
    const { index, tasks } = await KanbnBurndownPanel.panels[0].getKanbnIndexAndTasks();
    KanbnBurndownPanel.panels.forEach((panel) => panel._update(index, tasks));
  }

  private constructor(
    extensionPath: string,
    workspacePath: string,
    column: vscode.ViewColumn,
    kanbn: typeof import("@basementuniverse/kanbn/src/main")
  ) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;
    this._kanbn = kanbn;

    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnBurndownPanel.viewType, "Burndown Chart", column, {
      // Enable javascript in the webview
      enableScripts: true,

      // Retain state even when hidden
      retainContextWhenHidden: true,

      // Restrict the webview to only loading content from allowed paths
      localResourceRoots: [
        vscode.Uri.file(path.join(this._extensionPath, "build")),
        vscode.Uri.file(path.join(this._workspacePath, this._kanbn.getFolderName())),
        vscode.Uri.file(path.join(this._extensionPath, "node_modules", "vscode-codicons", "dist")),
      ],
    });
    (this._panel as any).iconPath = {
      light: vscode.Uri.file(path.join(this._extensionPath, "resources", "burndown_light.svg")),
      dark: vscode.Uri.file(path.join(this._extensionPath, "resources", "burndown_dark.svg")),
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

          // Refresh the kanbn chart
          case 'kanbn.refreshBurndownData':
            this.sprintMode = message.sprintMode;
            this.sprint = message.sprint;
            this.startDate = message.startDate;
            this.endDate = message.endDate;
            this.assigned = message.assigned;
            KanbnBurndownPanel.updateAll();
            return;
        }
      },
      null,
      this._disposables
    );
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

  private async _update(index: any|null, tasks: any[]|null) {
    if (!index && !tasks) {
      ({ index, tasks } = await this.getKanbnIndexAndTasks());
    }
    this._panel.webview.postMessage({
      type: "burndown",
      index,
      tasks,
      dateFormat: this._kanbn.getDateFormat(index),
      burndownData: await this._kanbn.burndown(
        (this.sprintMode && this.sprint) ? [this.sprint] : null,
        (!this.sprintMode && this.startDate && this.endDate)
          ? [
            new Date(Date.parse(this.startDate)),
            new Date(Date.parse(this.endDate))
          ]
          : null,
        this.assigned || null
      )
    });
  }

  private async getKanbnIndexAndTasks(): Promise<{ index: any|null, tasks: any[]|null }> {
    let index: any;
    try {
      index = await this._kanbn.getIndex();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
      return { index: null, tasks: null };
    }
    let tasks: any[];
    try {
      tasks = (await this._kanbn.loadAllTrackedTasks(index)).map((task) => this._kanbn.hydrateTask(index, task));
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
      return { index: null, tasks: null };
    }
    return { index, tasks };
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
      path.join(this._workspacePath, this._kanbn.getFolderName(), "board.css")
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
