import * as path from "path";
import * as vscode from "vscode";
import getNonce from "./getNonce";
import { v4 as uuidv4 } from "uuid";
import type { KanbnApi } from "./KanbnApi";
import { reportActionWarnings } from "./KanbnOutput";
import { describeBoardError } from "./KanbnBoards";
import { transformTaskData } from "./taskData";
import { findTaskFile, resolveRelationTargets } from "./KanbnRelations";
import {
  markdownLocalResourceRoots,
  markdownRootAttributes,
  openMarkdownLink,
} from "./markdownResources";

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
      localResourceRoots: markdownLocalResourceRoots(this._extensionPath, this._workspacePath),
    });
    this._panel.iconPath = {
      light: vscode.Uri.file(path.join(this._extensionPath, "resources", "task_light.svg")),
      dark: vscode.Uri.file(path.join(this._extensionPath, "resources", "task_dark.svg")),
    };

    // Set the webview's title to the kanbn task name
    if (this._taskId !== null) {
      this._kanbn.getTask(this._taskId).then((task) => {
        this._panel.title = task.name;
      }, () => {
        // A task that can't be loaded keeps the default title - update() reports the problem
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
            await openMarkdownLink(this._workspacePath, this._kanbnFolderName, message.href);
            return;

          // Open the task's markdown file for direct editing. The path is built from the task this
          // panel is bound to rather than anything the webview sends, so an unsaved rename in the
          // form still opens the file that's actually on disk
          case "kanbn.openTaskFile": {
            if (!this._taskId) {
              return;
            }
            try {
              // The task may have been archived since this panel opened
              const taskFile = await findTaskFile(this._kanbn, this._taskId);
              if (taskFile === null) {
                vscode.window.showErrorMessage(`No task file found with id "${this._taskId}".`);
              } else if (taskFile.archived) {
                await this.openArchivedTask(this._taskId, taskFile.path);
              } else {
                await vscode.window.showTextDocument(
                  await vscode.workspace.openTextDocument(vscode.Uri.file(taskFile.path))
                );
              }
            } catch (error) {
              vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            }
            return;
          }

          // Open a related task, wherever it is
          case "kanbn.task":
            try {
              await this.openRelatedTask(message.taskId);
            } catch (error) {
              vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
            }
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

  /**
   * Open the task a relation points at. A related task can be on another board, archived, or gone
   * altogether, and none of those is an error in the task holding the relation - so each one opens
   * whatever there is to see rather than an empty "new task" form bound to an id that has no task
   */
  private async openRelatedTask(taskId: string) {
    const taskFile = await findTaskFile(this._kanbn, taskId);
    if (taskFile === null) {
      vscode.window.showWarningMessage(
        `There is no task "${taskId}" in the tasks folder or the archive. The relation is kept as ` +
        "it is - remove it from this task if it's no longer needed."
      );
      return;
    }

    if (taskFile.archived) {
      await this.openArchivedTask(taskId, taskFile.path);
      return;
    }

    // The same task file is shared by every board it's on, so prefer this board and otherwise open
    // it from the first board that has it
    let boards: Record<string, string> = {};
    try {
      boards = await this._kanbn.findTaskBoards(taskId);
    } catch (error) {
      boards = {};
    }
    const boardSlug = Object.prototype.hasOwnProperty.call(boards, this._boardSlug)
      ? this._boardSlug
      : Object.keys(boards)[0];
    if (boardSlug === undefined) {
      vscode.window.showInformationMessage(
        `Task "${taskId}" isn't on any board, so it's opened as a file.`
      );
      await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(vscode.Uri.file(taskFile.path))
      );
      return;
    }

    await KanbnTaskPanel.show(
      this._extensionPath,
      this._workspacePath,
      boardSlug === this._boardSlug ? this._kanbn : this._kanbn.board(boardSlug),
      this._kanbnFolderName,
      taskId,
      boards[boardSlug],
      boardSlug
    );
  }

  /**
   * Show an archived task's file. The task editor only works on tasks that are on a board, and an
   * edit made straight to the archived file would be easy to lose track of, so it opens read-only
   * with the option of bringing the task back
   */
  private async openArchivedTask(taskId: string, taskPath: string) {
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(vscode.Uri.file(taskPath)),
      { preview: true }
    );
    try {
      await vscode.commands.executeCommand("workbench.action.files.setActiveEditorReadonlyInSession");
    } catch (error) {
      // VS Code before 1.79 has no read-only mode for a file editor, so it just opens normally
    }

    const choice = await vscode.window.showInformationMessage(
      `Task "${taskId}" is archived. Its file is open read-only.`,
      "Restore task"
    );
    if (choice !== "Restore task") {
      return;
    }

    try {
      await this._kanbn.restoreTask(taskId);
      reportActionWarnings(this._kanbn, `restoring ${taskId}`);
    } catch (error) {
      vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    // Boards that have been deleted since the task was archived are skipped rather than failing
    // the restore, and it's worth saying so
    const warnings = this._kanbn.lastRestoreWarnings;
    if (warnings.length) {
      vscode.window.showWarningMessage(
        `Some boards were skipped while restoring: ${[...new Set(warnings)].join(", ")}.`
      );
    }
    if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
      vscode.window.showInformationMessage(`Restored task '${taskId}'.`);
    }

    await KanbnTaskPanel.refreshRelationTargets();
    await this.openRelatedTask(taskId);
  }

  /**
   * Re-check where every open editor's related tasks are. Archiving or restoring a task moves its
   * file without touching the tasks related to it, so their editors need telling. Only the relation
   * status is sent - the form itself is left alone
   */
  public static async refreshRelationTargets() {
    for (const panel of Object.values(KanbnTaskPanel.panels)) {
      if (panel._isDisposed || !panel._taskId) {
        continue;
      }
      try {
        panel._panel.webview.postMessage({
          type: "relationTargets",
          relationTargets: await panel.resolveRelationTargets(),
        });
      } catch (error) {
        // Relation status is informational - a panel that can't work it out keeps what it has
      }
    }
  }

  /**
   * Work out where the related tasks of the task this panel is showing are
   */
  private async resolveRelationTargets() {
    if (!this._taskId) {
      return {};
    }
    const index = await this._kanbn.getIndex();
    const boardTaskIds = new Set<string>();
    for (const columnTaskIds of Object.values(index.columns) as string[][]) {
      columnTaskIds.forEach((id) => boardTaskIds.add(id));
    }
    const task = await this._kanbn.getTask(this._taskId);
    return resolveRelationTargets(
      this._kanbn,
      (task.relations || []).map((relation: { task: string }) => relation.task),
      boardTaskIds,
      true
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

    // Where each related task is - on this board, another one, the archive, or nowhere. The editor
    // still shows and saves every relation whatever the answer; this only decides how it's labelled
    let relationTargets = {};
    if (task) {
      try {
        relationTargets = await resolveRelationTargets(
          this._kanbn,
          (task.relations || []).map((relation: { task: string }) => relation.task),
          new Set(tasks.map((t) => t.id)),
          true
        );
      } catch (error) {
        // Without it every relation still renders, just without a status
      }
    }

    // Send task data to the webview
    this._panel.webview.postMessage({
      type: "task",
      index,
      task,
      tasks,
      taskBoards,
      relationTargets,
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

    // Tells the webview where to resolve relative image paths written in markdown
    const markdownAttributes = markdownRootAttributes(webview, this._workspacePath, this._kanbnFolderName);

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
<div id="root" ${markdownAttributes}></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
