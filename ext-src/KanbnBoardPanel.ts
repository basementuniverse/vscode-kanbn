import * as path from 'path'
import * as vscode from 'vscode'
import getNonce from './getNonce'
import KanbnTaskPanel from './KanbnTaskPanel'
import KanbnBurndownPanel from './KanbnBurndownPanel'
import { Kanbn } from '@basementuniverse/kanbn/src/main'

const sortByFields: Record<string, string> = {
  Name: 'name',
  Created: 'created',
  Updated: 'updated',
  Started: 'started',
  Completed: 'completed',
  Due: 'due',
  Assigned: 'assigned',
  'Count sub-tasks': 'countSubTasks',
  'Count tags': 'countTags',
  'Count relations': 'countRelations',
  'Count comments': 'countComments',
  Workload: 'workload'
}

export default class KanbnBoardPanel {
  private static readonly viewType = 'react'
  // Maps a kanbn task ID to the KanbnTaskPanel instance
  private readonly openedTaskPanels = new Map<string, KanbnTaskPanel>()
  private readonly _extensionPath: string
  private readonly _workspacePath: string
  private readonly column: vscode.ViewColumn
  private readonly _kanbnFolderName: string
  private readonly _kanbn: Kanbn
  private readonly _kanbnBurndownPanel: KanbnBurndownPanel
  private _panel: vscode.WebviewPanel | null = null

  public show (): void {
    if (this._panel == null) {
      this.setUpPanel()
    }
    this._panel?.reveal(this.column)
    void this.update()
  }

  public showTaskPanel (taskId: string | null, column: string | null = null): void {
    let panel: KanbnTaskPanel
    if (taskId == null || !this.openedTaskPanels.has(taskId)) {
      panel = new KanbnTaskPanel(this._extensionPath, this._workspacePath, this._kanbn, this._kanbnFolderName, taskId, column, this.openedTaskPanels)
      if (taskId != null) {
        this.openedTaskPanels.set(taskId, panel)
      }
    } else {
      panel = this.openedTaskPanels.get(taskId) as KanbnTaskPanel
    }
    void panel.show()
  }

  public async update (): Promise<void> {
    let index: any
    try {
      index = await this._kanbn.getIndex()
    } catch (error) {
      if (error instanceof Error) {
        void vscode.window.showErrorMessage(error.message)
      } else {
        throw error
      }
      return
    }
    let tasks: any[]
    try {
      tasks = (await this._kanbn.loadAllTrackedTasks(index)).map((task) =>
        this._kanbn.hydrateTask(index, task)
      )
    } catch (error) {
      if (error instanceof Error) {
        void vscode.window.showErrorMessage(error.message)
      } else {
        throw error
      }
      return
    }
    void this._panel?.webview.postMessage({
      type: 'index',
      index,
      tasks,
      hiddenColumns: index.options.hiddenColumns ?? [],
      startedColumns: index.options.startedColumns ?? [],
      completedColumns: index.options.completedColumns ?? [],
      columnSorting: index.options.columnSorting ?? {},
      customFields: index.options.customFields ?? [],
      dateFormat: this._kanbn.getDateFormat(index),
      showBurndownButton: vscode.workspace.getConfiguration('kanbn').get('showBurndownButton'),
      showSprintButton: vscode.workspace.getConfiguration('kanbn').get('showSprintButton')
    })
  }

  private setUpPanel (): void {
    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnBoardPanel.viewType, 'Kanbn Board', this.column, {
      // Enable javascript in the webview
      enableScripts: true,

      // Restrict the webview to only loading content from allowed paths
      localResourceRoots: [
        vscode.Uri.file(path.join(this._extensionPath, 'build')),
        vscode.Uri.file(path.join(this._workspacePath, this._kanbnFolderName)),
        vscode.Uri.file(path.join(this._extensionPath, 'node_modules', 'vscode-codicons', 'dist'))
      ]
    });
    (this._panel as any).iconPath = {
      light: vscode.Uri.file(path.join(this._extensionPath, 'resources', 'project_light.svg')),
      dark: vscode.Uri.file(path.join(this._extensionPath, 'resources', 'project_dark.svg'))
    }

    // Set the webview's title to the kanbn project name
    void this._kanbn.getIndex().then((index) => {
      if (this._panel != null) {
        this._panel.title = index.name
      }
    })

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview()

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => { this._panel = null })

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          // Display error message
          case 'error':
            void vscode.window.showErrorMessage(message.text)
            return

          // Open an already existing task in the editor
          case 'kanbn.task':
            this.showTaskPanel(message.taskId, message.columnName)
            return

          // Move a task
          case 'kanbn.move':
            try {
              await this._kanbn.moveTask(message.task, message.columnName, message.position)
            } catch (e) {
              if (e instanceof Error) {
                void vscode.window.showErrorMessage(e.message)
              } else {
                throw e
              }
            }
            return

          // Open a webview for a new task (with no ID)
          case 'kanbn.addTask':
            this.showTaskPanel(null, message.columnName)
            return

          // Sort a column
          case 'kanbn.sortColumn': {
            // Load the index
            const index = await this._kanbn.getIndex()
            let customFields = []
            if ('customFields' in index.options) {
              customFields = index.options.customFields.map(
                (customField: { name: string, type: string }) => customField.name
              )
            }
            // Prompt for a task property to sort by
            const sortBy: string | undefined = await vscode.window.showQuickPick(
              [
                'None',
                ...Object.keys(sortByFields),
                ...customFields
              ],
              {
                placeHolder: 'Sort this column by...',
                canPickMany: false
              }
            )
            if (sortBy !== undefined) {
              // Clear any saved sort settings for this column
              if (sortBy === 'None') {
                await this._kanbn.sort(message.columnName, [], false)
                return
              }

              // Prompt for sort direction and save settings
              const sortDirection = await vscode.window.showQuickPick(
                [
                  'Ascending',
                  'Descending'
                ],
                {
                  placeHolder: 'Sort direction',
                  canPickMany: false
                }
              )
              if (sortDirection !== undefined) {
                const saveSort = await vscode.window.showQuickPick(
                  [
                    'Yes',
                    'No'
                  ],
                  {
                    placeHolder: 'Save sort settings for this column?',
                    canPickMany: false
                  }
                )
                if (saveSort !== undefined) {
                  await this._kanbn.sort(
                    message.columnName,
                    [
                      {
                        field: sortBy in sortByFields ? sortByFields[sortBy] : sortBy,
                        order: sortDirection === 'Descending' ? 'descending' : 'ascending'
                      }
                    ],
                    saveSort === 'Yes'
                  )
                  void this.update()
                }
              }
            }
            return
          }
          // Open a burndown chart
          case 'kanbn.burndown':
            this._kanbnBurndownPanel.show()
            void this.update()
            return

            // Start a new sprint
          case 'kanbn.sprint': {
            // Prompt for a sprint name
            const newSprintName = await vscode.window.showInputBox({
              placeHolder: 'The sprint name.'
            })

            // If the input prompt wasn't cancelled, start a new sprint
            if (newSprintName !== undefined) {
              try {
                await this._kanbn.sprint(newSprintName, '', new Date())
              } catch (e) {
                if (e instanceof Error) {
                  void vscode.window.showErrorMessage(e.message)
                } else {
                  throw e
                }
              }
            }
            void this._kanbnBurndownPanel.update()
          }
        }
      })
  }

  constructor (
    extensionPath: string,
    workspacePath: string,
    kanbn: Kanbn,
    kanbnFolderName: string,
    kanbnBurndownPanel: KanbnBurndownPanel
  ) {
    this._extensionPath = extensionPath
    this._workspacePath = workspacePath
    this._kanbn = kanbn
    this.column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
    this._kanbnFolderName = kanbnFolderName
    this._kanbnBurndownPanel = kanbnBurndownPanel
  }

  private _getHtmlForWebview (): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manifest = require(path.join(this._extensionPath, 'build', 'asset-manifest.json'))
    const mainScript = manifest.files['main.js']
    const mainStyle = manifest.files['main.css']
    if (this._panel === null) {
      throw new Error('panel is undefined')
    }
    const webview = this._panel.webview
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionPath, 'build', mainScript)))
    const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionPath, 'build', mainStyle)))
    const customStyleUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(this._workspacePath, this._kanbnFolderName, 'board.css')
    ))
    const codiconsUri = webview.asWebviewUri(vscode.Uri.file(
      path.join(this._extensionPath, 'node_modules', 'vscode-codicons', 'dist', 'codicon.css')
    ))

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
<meta name="theme-color" content="#000000">
<title>Kanbn Board</title>
<link rel="stylesheet" type="text/css" href="${styleUri.toString()}">
<link rel="stylesheet" type="text/css" href="${customStyleUri.toString()}">
<link rel="stylesheet" type="text/css" href="${codiconsUri.toString()}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-webview-resource: https:; script-src 'nonce-${nonce}'; font-src vscode-webview-resource:; style-src vscode-webview-resource: 'unsafe-inline' http: https: data:;">
<base href="${webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionPath, 'build'))).toString()})}/">
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`
  }
}
