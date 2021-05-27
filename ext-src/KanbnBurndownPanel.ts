import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";

export default class KanbnBurndownPanel {
  public static currentPanel: KanbnBurndownPanel | undefined;

  private static readonly viewType = "react";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: typeof import("@basementuniverse/kanbn/src/main");
  private readonly _kanbnFolderName: string;
  private sprintMode: boolean = true;
  private sprint: string = '';
  private startDate: string = '';
  private endDate: string = '';
  private _disposables: vscode.Disposable[] = [];

  public static async createOrShow(
    extensionPath: string,
    workspacePath: string,
    kanbn: typeof import("@basementuniverse/kanbn/src/main"),
    kanbnFolderName: string
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it, otherwise create a new panel
    if (KanbnBurndownPanel.currentPanel) {
      KanbnBurndownPanel.currentPanel._panel.reveal(column);
    } else {
      KanbnBurndownPanel.currentPanel = new KanbnBurndownPanel(
        extensionPath,
        workspacePath,
        column || vscode.ViewColumn.One,
        kanbn,
        kanbnFolderName
      );
    }
  }

  public static async update() {
    if (KanbnBurndownPanel.currentPanel) {
      let index: any;
      try {
        index = await KanbnBurndownPanel.currentPanel._kanbn.getIndex();
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
        return;
      }
      KanbnBurndownPanel.currentPanel._panel.webview.postMessage({
        type: "burndown",
        index,
        dateFormat: KanbnBurndownPanel.currentPanel._kanbn.getDateFormat(index),
        burndownData: await KanbnBurndownPanel.currentPanel._kanbn.burndown(
          (KanbnBurndownPanel.currentPanel.sprintMode && KanbnBurndownPanel.currentPanel.sprint)
            ? [KanbnBurndownPanel.currentPanel.sprint]
            : null,
          (
            !KanbnBurndownPanel.currentPanel.sprintMode &&
            KanbnBurndownPanel.currentPanel.startDate &&
            KanbnBurndownPanel.currentPanel.endDate
          )
            ? [
              new Date(Date.parse(KanbnBurndownPanel.currentPanel.startDate)),
              new Date(Date.parse(KanbnBurndownPanel.currentPanel.endDate))
            ]
            : null,
          null,
          null,
          'auto'
        )
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
    this._panel = vscode.window.createWebviewPanel(KanbnBurndownPanel.viewType, "Burndown Chart", column, {
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
            KanbnBurndownPanel.update();
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    KanbnBurndownPanel.currentPanel = undefined;

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
