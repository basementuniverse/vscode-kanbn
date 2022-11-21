import * as vscode from "vscode";
import KanbnStatusBarItem from "./KanbnStatusBarItem";
import KanbnBoardPanel from "./KanbnBoardPanel";
import KanbnBurndownPanel from "./KanbnBurndownPanel";
import KanbnTaskPanel from "./KanbnTaskPanel";
import {Kanbn} from "@basementuniverse/kanbn/src/main"
import * as fs from 'fs';


export async function activate(context: vscode.ExtensionContext) {
  let kanbnStatusBarItem: KanbnStatusBarItem = new KanbnStatusBarItem(context, null);
  let currentBoard: string | null = null;
  let boardCache = new Map<string, Kanbn>();
  
  function populateBoardCache() {
    boardCache.clear();
    for (const workspaceFolder of vscode.workspace.workspaceFolders || []) {
      const kanbnPath = `${workspaceFolder.uri.fsPath}/.kanbnBoards`;
      if (fs.existsSync(kanbnPath)) {
        for(const kanbnBoardPath of fs.readdirSync(kanbnPath)) {
          const kanbn = new Kanbn(`${kanbnPath}/${kanbnBoardPath}`);
          boardCache.set(kanbnBoardPath, kanbn);

          // Initialise file watcher
          const fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, `.kanbnBoards/${kanbnBoardPath}/**.*`)
          );
          fileWatcher.onDidChange(() => {
            kanbnStatusBarItem.update(kanbn!);
            KanbnBoardPanel.update(kanbn!);
            KanbnBurndownPanel.update(kanbn!);
          });
          }
      }
    }
  }
  populateBoardCache()

  // Register a command to initialise Kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where Kanbn isn't already initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand("kanbn.createBoard", async () => {
      // If no workspace folder is opened, we can't initialise kanbn
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage("You need to open a workspace before initialising Kanbn.");
        return;
      }
      console.log("Creating Kanbn Board");

      const a = 100
      const b = 200
      // Prompt for a new project name
      const getNewBoardName = () => {
        const newBoardName = vscode.window.showInputBox({
          placeHolder: "The project name.",
          validateInput: (text) => {
            return text.length < 1 ? "The project name cannot be empty." : null;
          },
        });
        return newBoardName;

      }
      let boardName = await getNewBoardName()
      let kanbn: Kanbn | null = null;
      // If the input prompt wasn't cancelled, initialise kanbn
      while (boardName) {
        let boardLocation: string = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.kanbnBoards/${boardName}`
        console.log("this is the board location", boardLocation)
        if(fs.existsSync(boardLocation)) {
          vscode.window.showErrorMessage("A board with that name already exists. Pick a different name.");
          boardName = await getNewBoardName()
          continue;
        }
        fs.mkdirSync(boardLocation, { recursive: true })
        kanbn = new Kanbn(boardLocation);
        kanbn.initialise({
          name: boardName,
        });
        // Initialise file watcher
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.workspace.workspaceFolders[0].uri.fsPath, `.kanbnBoards/${boardName}/**.*`)
        );
        fileWatcher.onDidChange(() => {
          kanbnStatusBarItem.update(kanbn!);
          KanbnBoardPanel.update(kanbn!);
          KanbnBurndownPanel.update(kanbn!);
        });
        boardCache.set(boardName, kanbn);
        vscode.window.showInformationMessage(`Created Kanbn board '${boardLocation}'.`);
        break;
      }
      KanbnBoardPanel.update(kanbn!);
      kanbnStatusBarItem.update(kanbn!);
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

      let boardNames: string[] = [...boardCache.keys()]
      let options: vscode.QuickPickOptions = {placeHolder: "Select a board to open", canPickMany: false}
      const item: string | undefined = await vscode.window.showQuickPick(
        boardNames,
        options
      );
      if(!item)
        return;
      
      currentBoard = item;
      const kanbn = boardCache.get(currentBoard!)!;

      // If kanbn is initialised, view the kanbn board
      if (await kanbn.initialised()) {
        KanbnBoardPanel.createOrShow(
          context.extensionPath,
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          kanbn,
          await kanbn.getFolderName()
        );
        KanbnBoardPanel.update(kanbn);
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before viewing the Kanbn board.");
      }
      kanbnStatusBarItem.update(kanbn);
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

      if(!currentBoard) return;

      // Set the node process directory and import kanbn
      const kanbn = boardCache.get(currentBoard!)!;

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

      if(!currentBoard) return;
      const kanbn = boardCache.get(currentBoard!)!;

      // If kanbn is initialised, view the burndown chart
      if (await kanbn.initialised()) {
        KanbnBurndownPanel.createOrShow(
          context.extensionPath,
          vscode.workspace.workspaceFolders[0].uri.fsPath,
          kanbn,
          await kanbn.getFolderName()
        );
        KanbnBurndownPanel.update(kanbn);
      } else {
        vscode.window.showErrorMessage("You need to initialise Kanbn before viewing the burndown chart.");
      }
      kanbnStatusBarItem.update(kanbn);
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

      if(!currentBoard) return;
      const kanbn = boardCache.get(currentBoard!)!;

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
          kanbn.archiveTask(archiveTaskId);
        }
        KanbnBoardPanel.update(kanbn);
        kanbnStatusBarItem.update(kanbn);
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

      if(!currentBoard) return;
      const kanbn = boardCache.get(currentBoard!)!;

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
          KanbnBoardPanel.update(kanbn);
          kanbnStatusBarItem.update(kanbn);
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
    if(currentBoard) {
      const kanbn = boardCache.get(currentBoard!)!;

      // Create status bar item
      kanbnStatusBarItem.update(kanbn);
      KanbnBoardPanel.update(kanbn);
    }
  }

  // Handle configuration changes
  vscode.workspace.onDidChangeConfiguration((e) => {
    if(currentBoard) {
      const kanbn = boardCache.get(currentBoard!)!;
      kanbnStatusBarItem.update(kanbn);
      KanbnBoardPanel.update(kanbn);
    }
  });
}
