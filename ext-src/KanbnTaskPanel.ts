import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import { v4 as uuidv4 } from "uuid";
import type { KanbnApi } from "./KanbnApi";

type KanbnAutoSaveMode = "off" | "afterDelay" | "onFocusChange" | "onWindowChange";
type KanbnAutoSaveSetting = KanbnAutoSaveMode | "inherit";

function normalizeAutoSaveMode(value: unknown): KanbnAutoSaveMode {
  switch (value) {
    case "afterDelay":
    case "onFocusChange":
    case "onWindowChange":
      return value;
    default:
      return "off";
  }
}

function getTaskEditorAutoSaveSettings() {
  const kanbnConfiguration = vscode.workspace.getConfiguration("kanbn");
  const filesConfiguration = vscode.workspace.getConfiguration("files");
  const kanbnAutoSave = kanbnConfiguration.get<KanbnAutoSaveSetting>("autoSave", "inherit");
  const inheritedMode = normalizeAutoSaveMode(filesConfiguration.get("autoSave", "off"));
  const autoSaveMode = kanbnAutoSave === "inherit"
    ? inheritedMode
    : normalizeAutoSaveMode(kanbnAutoSave);
  const defaultDelay = Number(kanbnConfiguration.get("autoSaveDelay", 1000));
  const inheritedDelay = Number(filesConfiguration.get("autoSaveDelay", defaultDelay));
  const autoSaveDelay = autoSaveMode === "afterDelay" && kanbnAutoSave === "inherit"
    ? inheritedDelay
    : defaultDelay;

  return {
    autoSaveMode,
    autoSaveDelay: Number.isFinite(autoSaveDelay) && autoSaveDelay >= 0
      ? autoSaveDelay
      : 1000,
  };
}

function transformTaskData(
  taskData: any,
  customFields: { name: string, type: 'boolean' | 'date' | 'number' | 'string'}[]
) {
  const result = {
    id: taskData.id,
    name: taskData.name,
    description: taskData.description,
    metadata: {
      created: taskData.metadata.created ? new Date(taskData.metadata.created) : new Date(),
      updated: new Date(),
      assigned: taskData.metadata.assigned,
      progress: taskData.progress,
      tags: taskData.metadata.tags,
    } as any,
    relations: taskData.relations,
    subTasks: taskData.subTasks,
    history: (taskData.history || []).map((historyEvent: any) => ({
      ...historyEvent,
      date: historyEvent.date ? new Date(Date.parse(historyEvent.date)) : historyEvent.date,
    })),
    comments: taskData.comments.map((comment: any) => ({
      author: comment.author,
      date: new Date(Date.parse(comment.date)),
      text: comment.text,
    })),
  } as any;

  // Add assigned
  if (taskData.metadata.assigned) {
    result.metadata["assigned"] = taskData.metadata.assigned;
  }

  // Add progress
  if (taskData.progress > 0) {
    result.metadata["progress"] = taskData.progress;
  }

  // Add tags
  if (taskData.metadata.tags.length) {
    result.metadata["tags"] = taskData.metadata.tags;
  }

  // Add due timeline dates if present
  if (taskData.metadata.due) {
    result.metadata["due"] = new Date(Date.parse(taskData.metadata.due));
  }
  if (taskData.metadata.plannedStart) {
    result.metadata["plannedStart"] = new Date(Date.parse(taskData.metadata.plannedStart));
  }
  if (taskData.metadata.plannedFinish) {
    result.metadata["plannedFinish"] = new Date(Date.parse(taskData.metadata.plannedFinish));
  }
  if (taskData.metadata.started) {
    result.metadata["started"] = new Date(Date.parse(taskData.metadata.started));
  }
  if (taskData.metadata.completed) {
    result.metadata["completed"] = new Date(Date.parse(taskData.metadata.completed));
  }

  // Add custom fields
  for (let customField of customFields) {
    if (customField.name in taskData.metadata && taskData.metadata[customField.name] !== null) {
      if (customField.type === 'date') {
        result.metadata[customField.name] = new Date(Date.parse(taskData.metadata[customField.name]));
      } else {
        result.metadata[customField.name] = taskData.metadata[customField.name];
      }
    }
  }

  return result;
}

export default class KanbnTaskPanel {
  private static readonly viewType = "react";
  private static panels: Record<string, KanbnTaskPanel> = {};
  private static taskIdToPanelUuid: Record<string, string> = {};

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private readonly _kanbn: KanbnApi;
  private readonly _kanbnFolderName: string;
  private readonly _panelUuid: string;
  private _taskId: string | null;
  private _columnName: string | null;
  private _isDisposed = false;
  private _disposables: vscode.Disposable[] = [];

  private static getPanelForTask(taskId: string) {
    const panelUuid = KanbnTaskPanel.taskIdToPanelUuid[taskId];
    if (!panelUuid) {
      return null;
    }

    const panel = KanbnTaskPanel.panels[panelUuid];
    if (!panel || panel._isDisposed) {
      delete KanbnTaskPanel.taskIdToPanelUuid[taskId];
      return null;
    }

    return panel;
  }

  private static registerTaskId(taskId: string | null, panelUuid: string) {
    if (!taskId) {
      return;
    }

    KanbnTaskPanel.taskIdToPanelUuid[taskId] = panelUuid;
  }

  private static unregisterTaskId(taskId: string | null, panelUuid: string) {
    if (!taskId) {
      return;
    }

    if (KanbnTaskPanel.taskIdToPanelUuid[taskId] === panelUuid) {
      delete KanbnTaskPanel.taskIdToPanelUuid[taskId];
    }
  }

  public static async show(
    extensionPath: string,
    workspacePath: string,
    kanbn: KanbnApi,
    kanbnFolderName: string,
    taskId: string | null,
    columnName: string | null
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (taskId) {
      const existingPanel = KanbnTaskPanel.getPanelForTask(taskId);
      if (existingPanel) {
        existingPanel._columnName = columnName;
        existingPanel._panel.reveal(column || existingPanel._panel.viewColumn);
        await existingPanel.update();
        return;
      }
    }

    // Create a new panel
    const panelUuid = uuidv4();
    const taskPanel = new KanbnTaskPanel(
      extensionPath,
      workspacePath,
      column || vscode.ViewColumn.One,
      kanbn,
      kanbnFolderName,
      taskId,
      columnName,
      panelUuid
    );
    KanbnTaskPanel.panels[panelUuid] = taskPanel;
    KanbnTaskPanel.registerTaskId(taskId, panelUuid);
    await taskPanel.update();
  }

  private constructor(
    extensionPath: string,
    workspacePath: string,
    column: vscode.ViewColumn,
    kanbn: KanbnApi,
    kanbnFolderName: string,
    taskId: string | null,
    columnName: string | null,
    panelUuid: string
  ) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;
    this._kanbn = kanbn;
    this._kanbnFolderName = kanbnFolderName;
    this._taskId = taskId;
    this._columnName = columnName;
    this._panelUuid = panelUuid;

    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnTaskPanel.viewType, "New task", column, {
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
    (this._panel as any).iconPath = {
      light: vscode.Uri.file(path.join(this._extensionPath, "resources", "task_light.svg")),
      dark: vscode.Uri.file(path.join(this._extensionPath, "resources", "task_dark.svg")),
    };

    // Set the webview's title to the kanbn task name
    if (this._taskId !== null) {
      this._kanbn.getTask(this._taskId).then((task) => {
        this._panel.title = task.name;
      });
    }

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this._cleanup(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {

          // Display error message
          case "error":
            vscode.window.showErrorMessage(message.text);
            return;

          // Update the task webview panel title
          case "kanbn.updatePanelTitle":
            this._panel.title = message.title;
            return;

          case "kanbn.openLink":
            await this._openMarkdownLink(message.href);
            return;

          // Create a task
          case "kanbn.create":
            await this._kanbn.createTask(
              transformTaskData(message.taskData, message.customFields),
              message.taskData.column
            );
            KanbnTaskPanel.bindPanelToTask(
              message.panelUuid,
              message.taskData.id,
              message.taskData.column
            );
            await KanbnTaskPanel.panels[message.panelUuid]?.update();
            if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
              vscode.window.showInformationMessage(`Created task '${message.taskData.name}'.`);
            }
            return;

          // Update a task
          case "kanbn.update":
            await this._kanbn.updateTask(
              message.taskId,
              transformTaskData(message.taskData, message.customFields),
              message.taskData.column
            );
            KanbnTaskPanel.bindPanelToTask(
              message.panelUuid,
              message.taskData.id,
              message.taskData.column
            );
            await KanbnTaskPanel.panels[message.panelUuid]?.update();
            if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
              vscode.window.showInformationMessage(`Updated task '${message.taskData.name}'.`);
            }
            return;

          // Delete a task and close the webview panel
          case "kanbn.delete":
            vscode.window
              .showInformationMessage(`Delete task '${message.taskData.name}'?`, "Yes", "No")
              .then(async (value) => {
                if (value === "Yes") {
                  await this._kanbn.deleteTask(message.taskId, true);
                  KanbnTaskPanel.panels[message.panelUuid]?.dispose();
                  if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
                    vscode.window.showInformationMessage(`Deleted task '${message.taskData.name}'.`);
                  }
                }
              });
            return;

          // Archive a task and close the webview panel
          case 'kanbn.archive':
            await this._kanbn.archiveTask(message.taskId);
            KanbnTaskPanel.panels[message.panelUuid]?.dispose();
            if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
              vscode.window.showInformationMessage(`Archived task '${message.taskData.name}'.`);
            }
            return;
        }
      },
      null,
      this._disposables
    );
  }

  private static bindPanelToTask(panelUuid: string, taskId: string | null, columnName: string | null) {
    const panel = KanbnTaskPanel.panels[panelUuid];
    if (!panel) {
      return;
    }

    KanbnTaskPanel.unregisterTaskId(panel._taskId, panelUuid);
    panel._taskId = taskId;
    panel._columnName = columnName;
    KanbnTaskPanel.registerTaskId(taskId, panelUuid);
  }

  public dispose() {
    if (this._isDisposed) {
      return;
    }

    this._panel.dispose();
    this._cleanup();
  }

  private _cleanup() {
    if (this._isDisposed) {
      return;
    }

    this._isDisposed = true;
    KanbnTaskPanel.unregisterTaskId(this._taskId, this._panelUuid);
    delete KanbnTaskPanel.panels[this._panelUuid];

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private async _openMarkdownLink(href: string) {
    if (!href || href.charAt(0) === '#') {
      return;
    }

    try {
      const trimmedHref = href.trim();
      const prefixedPath = /^(workspace|project):/i.test(trimmedHref)
        ? trimmedHref.replace(/^(workspace|project):/i, '').replace(/^[\\/]+/, '')
        : null;

      if (prefixedPath !== null) {
        const fileUri = vscode.Uri.file(path.resolve(this._workspacePath, prefixedPath));
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fileUri));
        return;
      }

      if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedHref)) {
        const uri = vscode.Uri.parse(trimmedHref);
        if (uri.scheme === 'http' || uri.scheme === 'https' || uri.scheme === 'mailto' || uri.scheme === 'tel') {
          await (vscode.env as any).openExternal(uri);
          return;
        }

        if (uri.scheme === 'file') {
          await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
          return;
        }
      }

      const fileUri = vscode.Uri.file(path.resolve(this._workspacePath, this._kanbnFolderName, trimmedHref));
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fileUri));
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private async update() {
    let index: any;
    try {
      index = await this._kanbn.getIndex();
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    let tasks: any[];
    try {
      tasks = (await this._kanbn.loadAllTrackedTasks(index)).map((task) => ({
        uuid: uuidv4(),
        ...this._kanbn.hydrateTask(index, task),
      }));
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    let task = null;
    if (this._taskId) {
      task = tasks.find((t) => t.id === this._taskId) ?? null;
    }

    // If no columnName is specified, use the first column
    if (!this._columnName) {
      this._columnName = Object.keys(index.columns)[0];
    }

    // Send task data to the webview
    this._panel.webview.postMessage({
      type: "task",
      index,
      task,
      tasks,
      customFields: index.options.customFields ?? [],
      columnName: this._columnName,
      dateFormat: this._kanbn.getDateFormat(index),
      panelUuid: this._panelUuid,
      ...getTaskEditorAutoSaveSettings(),
    });
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
      path.join(this._extensionPath, "node_modules", "@vscode", "codicons", "dist", "codicon.css")
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
