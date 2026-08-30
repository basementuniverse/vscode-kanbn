import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import type { KanbnApi } from "./KanbnApi";

export default class KanbnBurndownPanel {
  // One panel per board, keyed by resolved board slug - burndown charts are board-scoped
  private static panels: Record<string, KanbnBurndownPanel> = {};

  private static readonly viewType = "react";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: KanbnApi;
  private readonly _kanbnFolderName: string;
  private readonly _boardSlug: string;
  private sprintMode: boolean = true;
  private sprint: string = '';
  private startDate: string = '';
  private endDate: string = '';
  private _disposables: vscode.Disposable[] = [];

  /**
   * Whether a board can have a burndown chart at all. A board that declares no startedColumns has no
   * notion of work in progress, and kanbn refuses to chart it rather than drawing an empty one
   */
  public static async canChart(kanbn: KanbnApi): Promise<string | null> {
    let index: any;
    try {
      index = await kanbn.getIndex();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    const startedColumns = index.options.startedColumns ?? [];
    if (!startedColumns.length) {
      return `"${index.name}" declares no started columns, so it has no work in progress to burn down.`;
    }
    return null;
  }

  public static async createOrShow(
    extensionPath: string,
    workspacePath: string,
    kanbn: KanbnApi,
    kanbnFolderName: string,
    boardSlug: string
  ) {
    const reason = await KanbnBurndownPanel.canChart(kanbn);
    if (reason !== null) {
      vscode.window.showInformationMessage(reason);
      return;
    }

    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If this board already has a panel, show it, otherwise create a new one
    const existingPanel = KanbnBurndownPanel.panels[boardSlug];
    if (existingPanel) {
      existingPanel._panel.reveal(column);
    } else {
      KanbnBurndownPanel.panels[boardSlug] = new KanbnBurndownPanel(
        extensionPath,
        workspacePath,
        column || vscode.ViewColumn.One,
        kanbn,
        kanbnFolderName,
        boardSlug
      );
    }
  }

  public static async update(boardSlug?: string) {
    const panels = boardSlug === undefined
      ? Object.values(KanbnBurndownPanel.panels)
      : [KanbnBurndownPanel.panels[boardSlug]].filter((panel) => panel !== undefined);
    for (const panel of panels) {
      await panel.refresh();
    }
  }

  private async refresh() {
    let index: any;
    try {
      index = await this._kanbn.getIndex();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    let burndownData: any;
    try {
      burndownData = await this._kanbn.burndown(
        (this.sprintMode && this.sprint) ? [this.sprint] : null,
        (!this.sprintMode && this.startDate && this.endDate)
          ? [
            new Date(Date.parse(this.startDate)),
            new Date(Date.parse(this.endDate))
          ]
          : null,
        null,
        null,
        'auto'
      );
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    this._panel.webview.postMessage({
      type: "burndown",
      index,
      boardSlug: this._boardSlug,
      dateFormat: this._kanbn.getDateFormat(index),
      burndownData
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
    this._panel = vscode.window.createWebviewPanel(KanbnBurndownPanel.viewType, "Burndown Chart", column, {
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

          // The webview has registered its message listener
          case "kanbn.webviewReady":
            await this.refresh();
            return;

          // Refresh the kanbn chart
          case 'kanbn.refreshBurndownData':
            this.sprintMode = message.sprintMode;
            this.sprint = message.sprint;
            this.startDate = message.startDate;
            this.endDate = message.endDate;
            KanbnBurndownPanel.update(this._boardSlug);
            return;
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    delete KanbnBurndownPanel.panels[this._boardSlug];

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
