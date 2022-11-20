import * as vscode from "vscode";
import KanbnStatusBarItem from "./KanbnStatusBarItem";
import KanbnBoardPanel from "./KanbnBoardPanel";
import KanbnBurndownPanel from "./KanbnBurndownPanel";
import KanbnTaskPanel from "./KanbnTaskPanel";
import {Kanbn} from "@basementuniverse/kanbn/src/main"

let kanbnStatusBarItem: KanbnStatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
  // Register a command to initialise Kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where Kanbn isn't already initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.createBoard", async () => {
      // If no workspace folder is opened, we can't initialise kanbn
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("You need to open a workspace before initialising Kanbn.");
        return;
      }

      // Set the node process directory and import kanbn
      const kanbn = new Kanbn(vscode.workspace.workspaceFolders[0].uri.fsPath);

      // If kanbn is already initialised, get the project name
      let projectName = "";
      if (await kanbn.initialised()) {
        projectName = (await kanbn.getIndex()).name;
      }

      // Prompt for a new project name
      const newProjectName = await vscode.window.showInputBox({
        value: projectName,
        placeHolder: "The project name.",
        validateInput: (text) => {
          return text.length < 1 ? "The project name cannot be empty." : null;
        },
      });

      // If the input prompt wasn't cancelled, initialise kanbn
      if (newProjectName !== undefined) {
        await kanbn.initialise({
          name: newProjectName,
        });
        vscode.window.showInformationMessage(`Initialised Kanbn project '${newProjectName}'.`);
        KanbnBoardPanel.update();
      }
      kanbnStatusBarItem.update();
    })
  );

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.openBoard", async () => {
      // If no workspace folder is opened, we can't open the kanbn board
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("You need to open a workspace before viewing the Kanbn board.");
        return;
      }

      // Set the node process directory and import kanbn
      const kanbn = new Kanbn(vscode.workspace.workspaceFolders[0].uri.fsPath);

      // If kanbn is initialised, view the kanbn board
      if (await kanbn.initialised()) {
        KanbnBoardPanel.createOrShow(
          context.extensionPath,
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          kanbn,
          await kanbn.getFolderName()
        );
        KanbnBoardPanel.update();
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before viewing the Kanbn board.");
      }
      kanbnStatusBarItem.update();
    })
  );

  // Register a command to add a new kanbn task.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.addTask", async () => {
      // If no workspace folder is opened, we can't add a new task
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("You need to open a workspace before adding a new task.");
        return;
      }

      // Set the node process directory and import kanbn
      const kanbn = new Kanbn(vscode.workspace.workspaceFolders[0].uri.fsPath);

      // If kanbn is initialised, open the task webview
      if (await kanbn.initialised()) {
        KanbnTaskPanel.show(
          context.extensionPath,
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          kanbn,
          await kanbn.getFolderName(),
          null,
          null
        );
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before adding a new task.");
      }
    })
  );

  // Register a command to open a burndown chart.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.burndown", async () => {
      // If no workspace folder is opened, we can't open the burndown chart
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("You need to open a workspace before viewing the burndown chart.");
        return;
      }

      // Set the node process directory and import kanbn
      const kanbn = new Kanbn(vscode.workspace.workspaceFolders[0].uri.fsPath);

      // If kanbn is initialised, view the burndown chart
      if (await kanbn.initialised()) {
        KanbnBurndownPanel.createOrShow(
          context.extensionPath,
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          kanbn,
          await kanbn.getFolderName()
        );
        KanbnBurndownPanel.update();
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before viewing the burndown chart.");
      }
      kanbnStatusBarItem.update();
    })
  );

  // Register a command to archive tasks.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.archiveTasks", async () => {
      // If no workspace folder is opened, we can't archive tasks
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("You need to open a workspace before sending tasks to the archive.");
        return;
      }

      // Set the node process directory and import kanbn
      const kanbn = new Kanbn(vscode.workspace.workspaceFolders[0].uri.fsPath);

      // Get a list of tracked tasks
      let tasks: string[] = [];
      try {
        tasks = [...(await kanbn.findTrackedTasks())];
      } catch (e) {}
      if (tasks.length === 0) {
        vscode.window.showInformationMessage("There are no tasks to archive.");
        return;
      }

      // Prompt for a selection of tasks to archive
      const archiveTaskIds = await vscode.window.showQuickPick(
        tasks,
        {
          placeHolder: 'Select tasks to archive...',
          canPickMany: true,
        }
      );
      if (archiveTaskIds !== undefined && archiveTaskIds.length > 0) {
        for (let archiveTaskId of archiveTaskIds) {
          await kanbn.archiveTask(archiveTaskId);
        }
        KanbnBoardPanel.update();
        kanbnStatusBarItem.update();
        if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
          vscode.window.showInformationMessage(
            `Archived ${archiveTaskIds.length} task${archiveTaskIds.length === 1 ? '' : 's'}.`
          );
        }
      }
    })
  );

  // Register a command to restore a task from the archive.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.restoreTasks", async () => {
      // If no workspace folder is opened, we can't restore tasks from the archive
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("You need to open a workspace before restoring tasks from the archive.");
        return;
      }

      // Set the node process directory and import kanbn
      const kanbn = new Kanbn(vscode.workspace.workspaceFolders[0].uri.fsPath);

      // Get a list of archived tasks
      let archivedTasks: string[] = [];
      try {
        archivedTasks = await kanbn.listArchivedTasks();
      } catch (e) {}
      if (archivedTasks.length === 0) {
        vscode.window.showInformationMessage("There are no archived tasks to restore.");
        return;
      }

      // Prompt for a selection of tasks to restore
      const restoreTaskIds = await vscode.window.showQuickPick(
        archivedTasks,
        {
          placeHolder: 'Select tasks to restore...',
          canPickMany: true,
        }
      );
      if (restoreTaskIds !== undefined && restoreTaskIds.length > 0) {

        // Load index
        const index = await kanbn.getIndex();

        // Prompt for a column to restore the tasks into
        const restoreColumn = await vscode.window.showQuickPick(
          [
            'None (use original)',
            ...Object.keys(index.columns)
          ],
          {
            canPickMany: false
          }
        );
        if (restoreColumn !== undefined) {
          for (let restoreTaskId of restoreTaskIds) {
            await kanbn.restoreTask(restoreTaskId, restoreColumn === 'None (use original)' ? null : restoreColumn);
          }
          KanbnBoardPanel.update();
          kanbnStatusBarItem.update();
          if (vscode.workspace.getConfiguration("kanbn").get("showTaskNotifications")) {
            vscode.window.showInformationMessage(
              `Restored ${restoreTaskIds.length} task${restoreTaskIds.length === 1 ? '' : 's'}.`
            );
          }
        }
      }
    })
  );

  // If a workspace folder is open, add a status bar item and start watching for file changes
  if (vscode.workspace.workspaceFolders !== undefined) {
    // Set the node process directory and import kanbn
    const kanbn = new Kanbn(vscode.workspace.workspaceFolders[0].uri.fsPath);

    // Create status bar item
    kanbnStatusBarItem = new KanbnStatusBarItem(context, kanbn);
    kanbnStatusBarItem.update();
    KanbnBoardPanel.update();

    // Initialise file watcher
    const uri = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const kanbnFolderName = await kanbn.getFolderName();
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(uri, `${kanbnFolderName}/**.*`)
    );
    fileWatcher.onDidChange(() => {
      kanbnStatusBarItem.update();
      KanbnBoardPanel.update();
      KanbnBurndownPanel.update();
    });
  }

  // Handle configuration changes
  vscode.workspace.onDidChangeConfiguration((e) => {
    kanbnStatusBarItem.update();
    KanbnBoardPanel.update();
  });
}
