import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import { v4 as uuidv4 } from "uuid";
import type { KanbnApi } from "./KanbnApi";
import { reportActionWarnings } from "./KanbnOutput";
import { describeBoardError } from "./KanbnBoards";

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

const DATE_METADATA_FIELDS = ["due", "plannedStart", "plannedFinish", "started", "completed"];

function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  // A date input carries a calendar day and nothing else. Date.parse() reads a bare "yyyy-mm-dd"
  // as UTC midnight, which lands on the day before for anyone west of Greenwich
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (parts) {
    return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function isSameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// The editor shows a timestamp as the calendar day it falls on, so writing back what it sends would
// flatten the time of day out of every date the user never touched. Keep the stored timestamp
// whenever the day on screen is still the day it belongs to
function resolveDateField(value: unknown, original: unknown): Date | null {
  const parsed = parseDateInput(value);
  if (parsed === null) {
    return null;
  }

  const originalDate = parseDateInput(original);
  if (originalDate !== null && isSameLocalDay(originalDate, parsed)) {
    return originalDate;
  }

  return parsed;
}

function transformTaskData(
  taskData: any,
  customFields: { name: string, type: 'boolean' | 'date' | 'number' | 'string'}[],
  originalMetadata: Record<string, any> = {}
) {
  // Only the fields every task has go in here. Everything else is added below if the editor
  // actually carries a value for it - listing them here as well wrote `assigned: ""`, `progress: 0`
  // and `tags: []` onto tasks that had none of them
  const result = {
    id: taskData.id,
    name: taskData.name,
    description: taskData.description,
    metadata: {
      created: taskData.metadata.created ? new Date(taskData.metadata.created) : new Date(),
      updated: new Date(),
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
  for (const field of DATE_METADATA_FIELDS) {
    const value = resolveDateField(taskData.metadata[field], originalMetadata[field]);
    if (value !== null) {
      result.metadata[field] = value;
    }
  }

  // Add custom fields
  for (let customField of customFields) {
    if (customField.name in taskData.metadata && taskData.metadata[customField.name] !== null) {
      if (customField.type === 'date') {
        const value = resolveDateField(
          taskData.metadata[customField.name],
          originalMetadata[customField.name]
        );
        if (value !== null) {
          result.metadata[customField.name] = value;
        }
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
  private readonly _kanbnFolderName: string;
  private readonly _panelUuid: string;

  // A task file is shared between boards - only its column is board-specific - so one task gets one
  // panel however many boards it's on, re-pointed at whichever board it was last opened from
  private _kanbn: KanbnApi;
  private _boardSlug: string;
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
    columnName: string | null,
    boardSlug: string
  ) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    if (taskId) {
      const existingPanel = KanbnTaskPanel.getPanelForTask(taskId);
      if (existingPanel) {
        // Opening the same task from another board re-points the panel at that board rather than
        // opening a second editor over the same file
        existingPanel._kanbn = kanbn;
        existingPanel._boardSlug = boardSlug;
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
      panelUuid,
      boardSlug
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
    panelUuid: string,
    boardSlug: string
  ) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;
    this._kanbn = kanbn;
    this._kanbnFolderName = kanbnFolderName;
    this._taskId = taskId;
    this._columnName = columnName;
    this._panelUuid = panelUuid;
    this._boardSlug = boardSlug;

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
    this._panel.iconPath = {
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

          // The webview has registered its message listener
          case "kanbn.webviewReady":
            await this.update();
            return;

          // Update the task webview panel title
          case "kanbn.updatePanelTitle":
            this._panel.title = message.title;
            return;

          case "kanbn.openLink":
            await this._openMarkdownLink(message.href);
            return;

          // The editor refused to save because the form doesn't validate. The messages are already
          // shown inline, but a field halfway down a long form is easy to miss when the only other
          // signal is the save quietly doing nothing
          case "kanbn.validationError": {
            const messages: string[] = (Array.isArray(message.messages) ? message.messages : [])
              .filter((text: unknown): text is string => typeof text === "string" && text.length > 0);
            if (!messages.length) {
              return;
            }

            const shown = messages.slice(0, 3);
            const remaining = messages.length - shown.length;
            vscode.window.showErrorMessage(
              `Kanbn: this task can't be saved yet. ${shown.join(" ")}`
              + (remaining > 0 ? ` (and ${remaining} more)` : "")
            );
            return;
          }

          // Create a task
          case "kanbn.create":
            try {
              await this._kanbn.createTask(
                transformTaskData(message.taskData, message.customFields),
                message.taskData.column
              );
              reportActionWarnings(this._kanbn, `saving ${message.taskData.id}`);
            } catch (error) {
              vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
              return;
            }
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
            try {
              // The editor renders a timestamp as a calendar day, so the stored task is the only
              // place the time of day still exists by the time the form values come back
              let originalMetadata: Record<string, any> = {};
              try {
                originalMetadata = (await this._kanbn.getTask(message.taskId)).metadata ?? {};
              } catch (error) {
                // A task that can't be read is one updateTask will reject too - let it report
              }
              await this._kanbn.updateTask(
                message.taskId,
                transformTaskData(message.taskData, message.customFields, originalMetadata),
                message.taskData.column
              );
              reportActionWarnings(this._kanbn, `saving ${message.taskData.id}`);
            } catch (error) {
              vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
              return;
            }
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
          case "kanbn.delete": {
            const taskName = message.taskData.name;

            // A task file is shared, so on a multi-board workspace "delete" is two different
            // operations and the user has to say which one they mean
            let otherBoards: string[] = [];
            try {
              otherBoards = Object.keys(await this._kanbn.findTaskBoards(message.taskId))
                .filter((slug) => slug !== this._boardSlug);
            } catch (error) {
              // Fall through to the single-board flow, which reports the conflict itself
            }

            let removeFile = true;
            let allBoards = false;
            if (otherBoards.length) {
              const boardList = otherBoards.join(", ");
              const choice = await vscode.window.showWarningMessage(
                `Task '${taskName}' is also on ${otherBoards.length === 1 ? "board" : "boards"} ${boardList}.`,
                { modal: true },
                "Remove from this board",
                "Delete everywhere"
              );
              if (choice === undefined) {
                return;
              }
              removeFile = choice === "Delete everywhere";
              allBoards = removeFile;
            } else {
              const choice = await vscode.window.showInformationMessage(
                `Delete task '${taskName}'?`,
                "Yes",
                "No"
              );
              if (choice !== "Yes") {
                return;
              }
            }

            try {
              await this._kanbn.deleteTask(message.taskId, removeFile, allBoards);
              reportActionWarnings(this._kanbn, `deleting ${message.taskId}`);
            } catch (error) {
              vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
              return;
            }
            KanbnTaskPanel.panels[message.panelUuid]?.dispose();
            if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
              vscode.window.showInformationMessage(
                removeFile
                  ? `Deleted task '${taskName}'.`
                  : `Removed task '${taskName}' from this board.`
              );
            }
            return;
          }

          // Archive a task and close the webview panel
          case 'kanbn.archive':
            try {
              await this._kanbn.archiveTask(message.taskId);
              reportActionWarnings(this._kanbn, `archiving ${message.taskId}`);
            } catch (error) {
              vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
              return;
            }
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
      vscode.window.showErrorMessage(await describeBoardError(this._kanbn, this._boardSlug, error));
      return;
    }
    let tasks: any[];
    try {
      tasks = (await this._kanbn.loadAllTrackedTasks(index)).map(
        (task) => this._kanbn.hydrateTask(index, task)
      );
    } catch (error) {
      vscode.window.showErrorMessage(await describeBoardError(this._kanbn, this._boardSlug, error));
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

    // The boards this task is on, and the column it occupies on each. Shown read-only, so that
    // re-pointing this panel at another board isn't a mystery
    let taskBoards: Record<string, string> = {};
    if (this._taskId) {
      try {
        taskBoards = await this._kanbn.findTaskBoards(this._taskId);
      } catch (error) {
        // Membership is informational - it shouldn't stop the task rendering
      }
    }

    // Contributors are advisory - a convenience list for autocomplete, never validated against.
    // currentUser is resolved by kanbn (KANBN_USER, then a contributor matched on git email or
    // name, then the raw git name), so the extension writes the same value the CLI would
    let contributors: Array<{ name: string, displayName: string, colour?: string }> = [];
    let currentUser: string | null = null;
    try {
      contributors = await this._kanbn.getContributors();
      currentUser = await this._kanbn.currentUser();
    } catch (error) {
      // Both are conveniences - the editor still works with free text if they can't be resolved
    }

    // Send task data to the webview
    this._panel.webview.postMessage({
      type: "task",
      index,
      task,
      tasks,
      taskBoards,
      contributors,
      currentUser,
      boardSlug: this._boardSlug,
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
