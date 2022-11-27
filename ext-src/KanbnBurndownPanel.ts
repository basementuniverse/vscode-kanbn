import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import {Kanbn} from "@basementuniverse/kanbn/src/main"

export default class KanbnBurndownPanel {
  private static readonly viewType = "react";

  private readonly column: vscode.ViewColumn;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: Kanbn;
  private readonly _kanbnFolderName: string;
  private _panel: vscode.WebviewPanel | null = null;
  private sprintMode: boolean = true;
  private sprint: string = '';
  private startDate: string = '';
  private endDate: string = '';

  public show() {
    if(!this._panel) {
      this.setUpPanel();
    }
    this._panel!.reveal();
    this.update();
  }

  private setUpPanel() {
    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnBurndownPanel.viewType, "Burndown Chart", this.column, {
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
      this._panel!.title = index.name;
    });

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => {this._panel = null});

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
            this.update();
            return;
        }
      });
  }

  public static create(
    extensionPath: string,
    workspacePath: string,
    kanbn: Kanbn,
    kanbnFolderName: string
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
    return new KanbnBurndownPanel(
      extensionPath,
      workspacePath,
      column || vscode.ViewColumn.One,
      kanbn,
      kanbnFolderName
    );
  }

  public async update() {
    let index: any;
    try {
      index = await this._kanbn.getIndex();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : error);
      return;
    }
    if(this._panel){
    this._panel.webview.postMessage({
      type: "burndown",
      index,
      dateFormat: this._kanbn.getDateFormat(index),
      burndownData: await this._kanbn.burndown(
        (this.sprintMode && this.sprint)
          ? [this.sprint]
          : null,
        (
          !this.sprintMode &&
          this.startDate &&
          this.endDate
        )
          ? [
            new Date(Date.parse(this.startDate)),
            new Date(Date.parse(this.endDate))
          ]
          : null,
        null,
        null,
        'auto'
      )
    });}
  }

  private constructor(
    extensionPath: string,
    workspacePath: string,
    column: vscode.ViewColumn,
    kanbn: Kanbn,
    kanbnFolderName: string
  ) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;
    this._kanbn = kanbn;
    this._kanbnFolderName = kanbnFolderName;
    this.column = column;
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
