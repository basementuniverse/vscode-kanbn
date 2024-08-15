import * as vscode from 'vscode'
import * as path from 'path'
import KanbnStatusBarItem from './KanbnStatusBarItem'
import KanbnBoardPanel from './KanbnBoardPanel'
import KanbnBurndownPanel from './KanbnBurndownPanel'
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
      this.kanbnBoardPanel = new KanbnBoardPanel(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        this.kanbn,
        boardLocation,
        this.kanbnBurnDownPanel)
    }
  }

  async function chooseBoard (): Promise<string | undefined> {
    if (boardCache.size === 0) {
      void vscode.window.showErrorMessage(
        'No boards detected. Open a workspace with Kanbn boards or add Additional Boards to the global user configuration'
      )
      return
    }
    const boardNames: string[] = [...boardCache.keys()]
    const options: vscode.QuickPickOptions = { placeHolder: 'Select a board to open', canPickMany: false }
    const item: string | undefined = await vscode.window.showQuickPick(
      boardNames,
      options
    )
    return item
  }

  function populateBoardCache (): void {
    const boardLocations = new Set<string>()

    // Get globally accessible board locations.
    vscode.workspace.getConfiguration('kanbn', null).get<string[]>('additionalBoards')?.forEach(boardLocation => {
      boardLocations.add(path.resolve(boardLocation))
    })

    // Get standard board locations.
    for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
      // Get workspace specific board locations.
      vscode.workspace.getConfiguration('kanbn', workspaceFolder.uri).get<string[]>('additionalBoards')?.forEach(boardLocation => {
        boardLocations.add(path.resolve(boardLocation))
      })

      // For backwards compatibility, check the old kanbn directory (which is just the current workspace directory).
      const oldKanbnPath = `${workspaceFolder.uri.fsPath}`
      if (fs.existsSync(`${oldKanbnPath}/.kanbn`)) {
        boardLocations.add(path.resolve(oldKanbnPath))
      }
      // Populate boards in the standard workspace location.
      const kanbnPath = `${workspaceFolder.uri.fsPath}/.kanbn_boards`
      if (fs.existsSync(kanbnPath)) {
        for (const kanbnBoardPath of fs.readdirSync(kanbnPath)) {
          boardLocations.add(path.resolve(`${kanbnPath}/${kanbnBoardPath}`))
        }
      }
    }
    for (const boardLocation of boardLocations) {
      const kanbnTuple = new KanbnTuple(boardLocation)
      boardCache.set(boardLocation, kanbnTuple)

      // Initialise file watcher
      const fileWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(vscode.Uri.file(`${boardLocation}/.kanbn`), '**')
      )

      fileWatcher.onDidChange(() => {
        void kanbnStatusBarItem.update(kanbnTuple.kanbn)
        void kanbnTuple.kanbnBoardPanel.update()
        void kanbnTuple.kanbnBurnDownPanel.update()
      })
    }
  }
  populateBoardCache()

  // Register a command to initialise Kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where Kanbn isn't already initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.createBoard', async () => {
      // If no workspace folder is opened, we can't initialise kanbn
      if (vscode.workspace.workspaceFolders === undefined) {
        void vscode.window.showErrorMessage('You need to open a workspace before initialising Kanbn.')
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
        const boardLocation: string = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.kanbn_boards/${boardName}`
        if (fs.existsSync(boardLocation)) {
          void vscode.window.showErrorMessage('A board with that name already exists. Pick a different name.')
          boardName = await getNewBoardName()
          continue
        }
        fs.mkdirSync(boardLocation, { recursive: true })
        kanbnTuple = new KanbnTuple(boardLocation)
        void kanbnTuple.kanbn.initialise({
          name: boardName
        })
        // Initialise file watcher
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], `.kanbn_boards/${boardName}/**.*`)
        )
        fileWatcher.onDidChange(() => {
          void kanbnStatusBarItem.update(kanbnTuple.kanbn)
          void kanbnTuple.kanbnBoardPanel.update()
          void kanbnTuple.kanbnBurnDownPanel.update()
        })
        boardCache.set(boardName, kanbnTuple)
        void vscode.window.showInformationMessage(`Created Kanbn board '${boardLocation}'.`)
        break
      }
    })
  )

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.openBoard', async () => {
      const board = await chooseBoard()
      if (board === undefined) { return }

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      // If kanbn is initialised, view the kanbn board
      void kanbnTuple.kanbnBoardPanel.show()
      void kanbnStatusBarItem.update(kanbnTuple.kanbn)
    })
  )

  // Register a command to add a new kanbn task.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.addTask', async () => {
      // Choose board to add task to
      const board = await chooseBoard()
      if (board === undefined) return

      // Set the node process directory and import kanbn
      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      // Open the task webview
      kanbnTuple.kanbnBoardPanel.showTaskPanel(null)
    })
  )

  // Register a command to open an existing kanbn task.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.openTask', async () => {
      // If no workspace folder is opened, we can't open a task
      if (vscode.workspace.workspaceFolders === undefined) {
        void vscode.window.showErrorMessage('You need to open a workspace before opening a task.')
        return
      }

      // Choose board to open a task from
      const board = await chooseBoard()
      if (board === undefined) return

      // Set the node process directory and import kanbn
      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      const index = await kanbnTuple.kanbn.getIndex()
      const startedColumns: string[] = index.options?.startedColumns ?? []
      const completedColumns: string[] = index.options?.completedColumns ?? []
      const otherColumns: string[] = Object.keys(index.columns).filter(c => !(startedColumns?.includes(c) || completedColumns?.includes(c)))

      const tasksByColumns = await Promise.all([...startedColumns, ...otherColumns, ...completedColumns]
        .map(async columnName => ({
          columnName,
          tasks: await Promise.all(index.columns[columnName].map(async taskId => await kanbnTuple.kanbn.getTask(taskId)))
        })))

      // Create QuickPickItems for each task mangled with separators for each column
      const quickPickItems: vscode.QuickPickItem[] = tasksByColumns.flatMap(column => [
        {
          kind: vscode.QuickPickItemKind.Separator,
          label: column.columnName
        },
        ...column.tasks.map(task => ({
          label: task.name,
          detail: task.id
        }))])

      // Show QuickPick
      const qp = await vscode.window.showQuickPick(quickPickItems)
      if (qp?.detail !== undefined) {
        // Open the task webview
        kanbnTuple.kanbnBoardPanel.showTaskPanel(qp?.detail)
      }
    })
  )

  // Register a command to open a burndown chart.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.burndown', async () => {
      const board = await chooseBoard()
      if (board === undefined) return

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) return

      // If kanbn is initialised, view the burndown chart
      kanbnTuple.kanbnBurnDownPanel.show()
      void kanbnTuple.kanbnBurnDownPanel.update()
      void kanbnStatusBarItem.update(kanbnTuple.kanbn)
    })
  )

  // Register a command to archive tasks.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.archiveTasks', async () => {
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
        void vscode.window.showInformationMessage('There are no tasks to archive.')
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
          void kanbnTuple.kanbn.archiveTask(archiveTaskId)
        }
        void kanbnTuple.kanbnBoardPanel.update()
        void kanbnStatusBarItem.update(kanbnTuple.kanbn)
        if (vscode.workspace.getConfiguration('kanbn').get<boolean>('showTaskNotifications') === true) {
          void vscode.window.showInformationMessage(
            `Archived ${archiveTaskIds.length} task${archiveTaskIds.length === 1 ? '' : 's'}.`
          )
        }
      }
    })
  )

  // Register a command to restore a task from the archive.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.restoreTasks', async () => {
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
        void vscode.window.showInformationMessage('There are no archived tasks to restore.')
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
          void kanbnTuple.kanbnBoardPanel.update()
          void kanbnStatusBarItem.update(kanbnTuple.kanbn)
          if (vscode.workspace.getConfiguration('kanbn').get('showTaskNotifications') === true) {
            void vscode.window.showInformationMessage(
              `Restored ${restoreTaskIds.length} task${restoreTaskIds.length === 1 ? '' : 's'}.`
            )
          }
        }
      }
    })
  )

  // Handle configuration changes.
  vscode.workspace.onDidChangeConfiguration((e) => {
    populateBoardCache()
    // Update all board panels in case we need to show/hide certain buttons.
    for (const [, kanbnTuple] of boardCache) {
      void kanbnTuple.kanbnBoardPanel.update()
    }
  })
}
