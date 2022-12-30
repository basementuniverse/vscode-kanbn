/* eslint-disable @typescript-eslint/no-floating-promises */
import * as vscode from 'vscode'
import KanbnStatusBarItem from './KanbnStatusBarItem'
import KanbnBoardPanel from './KanbnBoardPanel'
import KanbnBurndownPanel from './KanbnBurndownPanel'
import KanbnTaskPanel from './KanbnTaskPanel'
import { Kanbn } from '@basementuniverse/kanbn/src/main'
import * as fs from 'fs'

export async function activate (context: vscode.ExtensionContext): Promise<void> {
  const kanbnStatusBarItem: KanbnStatusBarItem = new KanbnStatusBarItem(context, null)
  const boardCache = new Map<string, KanbnTuple>()
  class KanbnTuple {
    kanbn: Kanbn
    kanbnBoardPanel: KanbnBoardPanel
    kanbnBurnDownPanel: KanbnBurndownPanel
    constructor (boardLocation: string) {
      if (vscode.workspace.workspaceFolders == null) {
        throw new Error('A workspace folder should be open when creating Kanbn board panels')
      }
      this.kanbn = new Kanbn(boardLocation)
      this.kanbnBurnDownPanel = KanbnBurndownPanel.create(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        this.kanbn,
        boardLocation)
      this.kanbnBoardPanel = KanbnBoardPanel.create(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        this.kanbn,
        boardLocation,
        this.kanbnBurnDownPanel)
    }
  }

  async function chooseBoard (): Promise<string | undefined> {
    const boardNames: string[] = [...boardCache.keys()]
    const options: vscode.QuickPickOptions = { placeHolder: 'Select a board to open', canPickMany: false }
    const item: string | undefined = await vscode.window.showQuickPick(
      boardNames,
      options
    )
    return item
  }

  function populateBoardCache (): void {
    boardCache.clear()
    if (vscode.workspace.workspaceFolders == null) {
      return
    }
    // Populate globally accessible boards.
    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
      // Populate boards in the standard workspace location.
      const kanbnPath = `${workspaceFolder.uri.fsPath}/.kanbnBoards`
      if (fs.existsSync(kanbnPath)) {
        for (const kanbnBoardPath of fs.readdirSync(kanbnPath)) {
          const kanbnTuple = new KanbnTuple(`${kanbnPath}/${kanbnBoardPath}`)
          boardCache.set(kanbnBoardPath, kanbnTuple)

          // Initialise file watcher
          const fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceFolder, `.kanbnBoards/${kanbnBoardPath}/**`)
          )
          fileWatcher.onDidChange(() => {
            kanbnStatusBarItem.update(kanbnTuple.kanbn)
            kanbnTuple.kanbnBoardPanel.update()
            kanbnTuple.kanbnBurnDownPanel.update()
          })
        }
      }
      // // Populate boards in additional workspace locations.
      // const boardLocations: string[] = vscode.workspace.getConfiguration('kanbn').get('additionalBoards')
      // for (const location of boardLocations) {
    }
  }
  populateBoardCache()

  // Register a command to initialise Kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where Kanbn isn't already initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.createBoard', async () => {
      // If no workspace folder is opened, we can't initialise kanbn
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage('You need to open a workspace before initialising Kanbn.')
        return
      }
      // Prompt for a new project name
      const getNewBoardName = (): Thenable<string | undefined> => {
        const newBoardName = vscode.window.showInputBox({
          placeHolder: 'The project name.',
          validateInput: (text) => {
            return text.length < 1 ? 'The project name cannot be empty.' : null
          }
        })
        return newBoardName
      }
      let boardName = await getNewBoardName()
      let kanbnTuple: KanbnTuple
      // If the input prompt wasn't cancelled, initialise kanbn
      while (boardName !== undefined) {
        const boardLocation: string = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.kanbnBoards/${boardName}`
        if (fs.existsSync(boardLocation)) {
          vscode.window.showErrorMessage('A board with that name already exists. Pick a different name.')
          boardName = await getNewBoardName()
          continue
        }
        fs.mkdirSync(boardLocation, { recursive: true })
        kanbnTuple = new KanbnTuple(boardLocation)
        kanbnTuple.kanbn.initialise({
          name: boardName
        })
        // Initialise file watcher
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], `.kanbnBoards/${boardName}/**.*`)
        )
        fileWatcher.onDidChange(() => {
          kanbnStatusBarItem.update(kanbnTuple.kanbn)
          kanbnTuple.kanbnBoardPanel.update()
          kanbnTuple.kanbnBurnDownPanel.update()
        })
        boardCache.set(boardName, kanbnTuple)
        vscode.window.showInformationMessage(`Created Kanbn board '${boardLocation}'.`)
        break
      }
    })
  )

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.openBoard', async () => {
      // If no workspace folder is opened, we can't open the kanbn board
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage('You need to open a workspace before viewing the Kanbn board.')
        return
      }

      const board = await chooseBoard()
      if (board === undefined) { return }

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      // If kanbn is initialised, view the kanbn board
      kanbnTuple.kanbnBoardPanel.show()
      kanbnStatusBarItem.update(kanbnTuple.kanbn)
    })
  )

  // Register a command to add a new kanbn task.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.addTask', async () => {
      // If no workspace folder is opened, we can't add a new task
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage('You need to open a workspace before adding a new task.')
        return
      }

      // Choose board to add task to
      const board = await chooseBoard()
      if (board === undefined) return

      // Set the node process directory and import kanbn
      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      // If kanbn is initialised, open the task webview
      KanbnTaskPanel.show(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        kanbnTuple.kanbn,
        await kanbnTuple.kanbn.getFolderName(),
        null,
        null
      )
    })
  )

  // Register a command to open a burndown chart.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.burndown', async () => {
      // If no workspace folder is opened, we can't open the burndown chart
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage('You need to open a workspace before viewing the burndown chart.')
        return
      }

      const board = await chooseBoard()
      if (board === undefined) return

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) return

      // If kanbn is initialised, view the burndown chart
      kanbnTuple.kanbnBurnDownPanel.show()
      kanbnTuple.kanbnBurnDownPanel.update()
      kanbnStatusBarItem.update(kanbnTuple.kanbn)
    })
  )

  // Register a command to archive tasks.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.archiveTasks', async () => {
      // If no workspace folder is opened, we can't archive tasks
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage('You need to open a workspace before sending tasks to the archive.')
        return
      }

      const board = await chooseBoard()
      if (board === undefined) return

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) return

      // Get a list of tracked tasks
      let tasks: string[] = []
      try {
        tasks = [...await kanbnTuple.kanbn.findTrackedTasks()]
      } catch (e) {}
      if (tasks.length === 0) {
        vscode.window.showInformationMessage('There are no tasks to archive.')
        return
      }

      // Prompt for a selection of tasks to archive
      const archiveTaskIds = await vscode.window.showQuickPick(
        tasks,
        {
          placeHolder: 'Select tasks to archive...',
          canPickMany: true
        }
      )
      if (archiveTaskIds !== undefined && archiveTaskIds.length > 0) {
        for (const archiveTaskId of archiveTaskIds) {
          kanbnTuple.kanbn.archiveTask(archiveTaskId)
        }
        kanbnTuple.kanbnBoardPanel.update()
        kanbnStatusBarItem.update(kanbnTuple.kanbn)
        if (vscode.workspace.getConfiguration('kanbn').get<boolean>('showTaskNotifications') === true) {
          vscode.window.showInformationMessage(
            `Archived ${archiveTaskIds.length} task${archiveTaskIds.length === 1 ? '' : 's'}.`
          )
        }
      }
    })
  )

  // Register a command to restore a task from the archive.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.restoreTasks', async () => {
      // If no workspace folder is opened, we can't restore tasks from the archive
      if (vscode.workspace.workspaceFolders === undefined) {
        vscode.window.showErrorMessage('You need to open a workspace before restoring tasks from the archive.')
        return
      }

      const board = await chooseBoard()
      if (board === undefined) return
      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) return

      // Get a list of archived tasks
      let archivedTasks: string[] = []
      try {
        archivedTasks = await kanbnTuple.kanbn.listArchivedTasks()
      } catch (e) {}
      if (archivedTasks.length === 0) {
        vscode.window.showInformationMessage('There are no archived tasks to restore.')
        return
      }

      // Prompt for a selection of tasks to restore
      const restoreTaskIds = await vscode.window.showQuickPick(
        archivedTasks,
        {
          placeHolder: 'Select tasks to restore...',
          canPickMany: true
        }
      )
      if (restoreTaskIds !== undefined && restoreTaskIds.length > 0) {
        // Load index
        const index = await kanbnTuple.kanbn.getIndex()

        // Prompt for a column to restore the tasks into
        const restoreColumn = await vscode.window.showQuickPick(
          [
            'None (use original)',
            ...Object.keys(index.columns)
          ],
          {
            canPickMany: false
          }
        )
        if (restoreColumn !== undefined) {
          for (const restoreTaskId of restoreTaskIds) {
            await kanbnTuple.kanbn.restoreTask(restoreTaskId, restoreColumn === 'None (use original)' ? null : restoreColumn)
          }
          kanbnTuple.kanbnBoardPanel.update()
          kanbnStatusBarItem.update(kanbnTuple.kanbn)
          if (vscode.workspace.getConfiguration('kanbn').get('showTaskNotifications') === true) {
            vscode.window.showInformationMessage(
              `Restored ${restoreTaskIds.length} task${restoreTaskIds.length === 1 ? '' : 's'}.`
            )
          }
        }
      }
    })
  )

  // Handle configuration changes.
  vscode.workspace.onDidChangeConfiguration((e) => {
    // Update all board panels in case we need to show/hide certain buttons.
    for (const [, kanbnTuple] of boardCache) {
      kanbnTuple.kanbnBoardPanel.update()
    }
  })
}
