import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import KanbnTaskPanel from "./KanbnTaskPanel";
import type { KanbnApi } from "./KanbnApi";
import { reportActionWarnings } from "./KanbnOutput";

export default class KanbnGanttPanel {
  // One panel per board, keyed by resolved board slug - gantt charts are board-scoped
  private static panels: Record<string, KanbnGanttPanel> = {};

  private static readonly viewType = "react";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: KanbnApi;
  private readonly _kanbnFolderName: string;
  private readonly _boardSlug: string;
  private startDate: string = '';
  private endDate: string = '';
  private _latestUpdateId = 0;
  private _disposables: vscode.Disposable[] = [];

  private static parseDate(value: any): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "string") {
      const parsed = new Date(Date.parse(value));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  private getDateFilter(): Date[] | null {
    const startDate = KanbnGanttPanel.parseDate(this.startDate);
    const endDate = KanbnGanttPanel.parseDate(this.endDate);
    if (startDate && endDate) {
      return [startDate, endDate];
    }

    if (startDate) {
      return [startDate];
    }

    if (endDate) {
      return [endDate];
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
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If this board already has a panel, show it, otherwise create a new one
    const existingPanel = KanbnGanttPanel.panels[boardSlug];
    if (existingPanel) {
      existingPanel._panel.reveal(column);
    } else {
      KanbnGanttPanel.panels[boardSlug] = new KanbnGanttPanel(
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
      ? Object.values(KanbnGanttPanel.panels)
      : [KanbnGanttPanel.panels[boardSlug]].filter((panel) => panel !== undefined);
    for (const panel of panels) {
      await panel.refresh();
    }
  }

  private async refresh() {
    const updateId = ++this._latestUpdateId;
    let index: any;
    try {
      index = await this._kanbn.getIndex();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    let ganttData: any;
    try {
      ganttData = await (this._kanbn as any).gantt(
        null,
        null,
        this.getDateFilter(),
        null,
      );
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    // Ignore stale async updates when several refreshes are triggered in quick succession, and give
    // up entirely if this panel was closed while its data was loading
    if (!KanbnGanttPanel.panels[this._boardSlug] || updateId !== this._latestUpdateId) {
      return;
    }

    this._panel.webview.postMessage({
      type: "gantt",
      index,
      boardSlug: this._boardSlug,
      dateFormat: this._kanbn.getDateFormat(index),
      ganttData
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
    this._panel = vscode.window.createWebviewPanel(KanbnGanttPanel.viewType, "Gantt Chart", column, {
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
      light: vscode.Uri.file(path.join(this._extensionPath, "resources", "gantt_light.svg")),
      dark: vscode.Uri.file(path.join(this._extensionPath, "resources", "gantt_dark.svg")),
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

          // Refresh the gantt chart
          case 'kanbn.refreshGanttData':
            this.startDate = message.startDate;
            this.endDate = message.endDate;
            KanbnGanttPanel.update(this._boardSlug);
            return;

          // Persist gantt drag/resize updates
          case "kanbn.gantt.updatePlannedDates": {
            const task = await this._kanbn.getTask(message.taskId);
            if (!task || typeof task !== "object") {
              return;
            }

            if (!task.metadata || typeof task.metadata !== "object") {
              task.metadata = {};
            }

            let hasChanges = false;

            if (typeof message.plannedStart === "string") {
              const plannedStartDate = new Date(Date.parse(message.plannedStart));
              if (!Number.isNaN(plannedStartDate.getTime())) {
                const currentValue = task.metadata.plannedStart instanceof Date
                  ? task.metadata.plannedStart.getTime()
                  : (task.metadata.plannedStart ? Date.parse(task.metadata.plannedStart) : NaN);
                if (Number.isNaN(currentValue) || Math.abs(currentValue - plannedStartDate.getTime()) > 1000) {
                  task.metadata.plannedStart = plannedStartDate;
                  hasChanges = true;
                }
              }
            }

            if (typeof message.plannedFinish === "string") {
              const plannedFinishDate = new Date(Date.parse(message.plannedFinish));
              if (!Number.isNaN(plannedFinishDate.getTime())) {
                const currentValue = task.metadata.plannedFinish instanceof Date
                  ? task.metadata.plannedFinish.getTime()
                  : (task.metadata.plannedFinish ? Date.parse(task.metadata.plannedFinish) : NaN);
                if (Number.isNaN(currentValue) || Math.abs(currentValue - plannedFinishDate.getTime()) > 1000) {
                  task.metadata.plannedFinish = plannedFinishDate;
                  hasChanges = true;
                }
              }
            }

            if (!hasChanges) {
              return;
            }

            await this._kanbn.updateTask(message.taskId, task);
            reportActionWarnings(this._kanbn, `updating ${message.taskId}`);
            KanbnGanttPanel.update(this._boardSlug);
            return;
          }
        }
      },
      null,
      this._disposables
    );
  }

  public dispose() {
    delete KanbnGanttPanel.panels[this._boardSlug];

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
