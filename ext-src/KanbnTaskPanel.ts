import * as path from 'path'
import * as vscode from 'vscode'
import getNonce from './getNonce'
import { v4 as uuidv4 } from 'uuid'
import { Kanbn } from '@basementuniverse/kanbn/src/main'

function transformTaskData (
  taskData: any,
  customFields: Array<{ name: string, type: 'boolean' | 'date' | 'number' | 'string' }>
): any {
  const result = {
    id: taskData.id,
    name: taskData.name,
    description: taskData.description,
    metadata: {
      created: taskData.metadata.created !== '' ? new Date(taskData.metadata.created) : new Date(),
      updated: new Date(),
      assigned: taskData.metadata.assigned,
      progress: taskData.progress,
      tags: taskData.metadata.tags
    } as any,
    relations: taskData.relations,
    subTasks: taskData.subTasks,
    comments: taskData.comments.map((comment: any) => ({
      author: comment.author,
      date: new Date(Date.parse(comment.date)),
      text: comment.text
    }))
  } as any

  // Add assigned
  if (taskData.metadata.assigned !== '') {
    result.metadata.assigned = taskData.metadata.assigned
  }

  // Add progress
  if (taskData.progress > 0) {
    result.metadata.progress = taskData.progress
  }

  // Add tags
  if (taskData.metadata.tags.length > 0) {
    result.metadata.tags = taskData.metadata.tags
  }

  // Add due, started and completed dates if present
  if (taskData.metadata.due !== '') {
    result.metadata.due = new Date(Date.parse(taskData.metadata.due))
  }
  if (taskData.metadata.started !== '') {
    result.metadata.started = new Date(Date.parse(taskData.metadata.started))
  }
  if (taskData.metadata.completed !== '') {
    result.metadata.completed = new Date(Date.parse(taskData.metadata.completed))
  }

  // Add custom fields
  for (const customField of customFields) {
    if (customField.name in taskData.metadata && taskData.metadata[customField.name] !== null) {
      if (customField.type === 'date') {
        result.metadata[customField.name] = new Date(Date.parse(taskData.metadata[customField.name]))
      } else {
        result.metadata[customField.name] = taskData.metadata[customField.name]
      }
    }
  }

  return result
}

export default class KanbnTaskPanel {
  private static readonly viewType = 'react'

  private readonly _panel: vscode.WebviewPanel
  private readonly _extensionPath: string
  private readonly _workspacePath: string
  private readonly _kanbn: Kanbn
  private readonly _kanbnFolderName: string
  private readonly _panelUuid: string
  private _taskId: string | null
  private readonly _defaultColumn: string | null
  private readonly _disposables: vscode.Disposable[] = []

  public async show (): Promise<void> {
    void this.update()
    this._panel.reveal()
  }

  constructor (
    extensionPath: string,
    workspacePath: string,
    kanbn: Kanbn,
    kanbnFolderName: string,
    taskId: string | null,
    defaultColumn: string | null,
    taskCache: Map<string, KanbnTaskPanel>
  ) {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
    this._extensionPath = extensionPath
    this._workspacePath = workspacePath
    this._kanbn = kanbn
    this._kanbnFolderName = kanbnFolderName
    this._taskId = taskId
    this._defaultColumn = defaultColumn
    this._panelUuid = uuidv4()

    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnTaskPanel.viewType, 'New task', column, {
      // Enable javascript in the webview
      enableScripts: true,

      // Restrict the webview to only loading content from allowed paths
      localResourceRoots: [
        vscode.Uri.file(path.join(this._extensionPath, 'build')),
        vscode.Uri.file(path.join(this._workspacePath, this._kanbnFolderName)),
        vscode.Uri.file(path.join(this._extensionPath, 'node_modules', 'vscode-codicons', 'dist'))
      ]
    })

    if (this._taskId !== null) {
      this._panel.onDidDispose((e) => { if (this._taskId !== null) taskCache.delete(this._taskId) })
    }

    (this._panel as any).iconPath = {
      light: vscode.Uri.file(path.join(this._extensionPath, 'resources', 'task_light.svg')),
      dark: vscode.Uri.file(path.join(this._extensionPath, 'resources', 'task_dark.svg'))
    }

    // Set the webview's title to the kanbn task name
    if (this._taskId !== null) {
      void this._kanbn.getTask(this._taskId).then((task) => {
        this._panel.title = task.name
      })
    }

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview()

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          // Display error message
          case 'error':
            void vscode.window.showErrorMessage(message.text)
            return

          // Update the task webview panel title
          case 'kanbn.updatePanelTitle':
            this._panel.title = message.title
            return

          // Update panel once it's loaded
          case 'kanbn.updateMe':
            void this.update()
            return

          // Create a task
          case 'kanbn.create':
            await this._kanbn.createTask(
              transformTaskData(message.taskData, message.customFields),
              message.taskData.column
            )
            this._taskId = message.taskData.id
            this._panel.onDidDispose((e) => { if (this._taskId !== null) taskCache.delete(this._taskId) })
            taskCache.set(message.taskData.id, this)
            this._panel.title = message.taskData.name
            void this.update()
            if (vscode.workspace.getConfiguration('kanbn').get<boolean>('showTaskNotifications') ?? true) {
              // TODO: remove the explicit String cast once typescript bindings for kanbn are updated
              void vscode.window.showInformationMessage(`Created task '${String(message.taskData.name)}'.`)
            }
            return

          // Update a task
          case 'kanbn.update':
            await this._kanbn.updateTask(
              message.taskId,
              transformTaskData(message.taskData, message.customFields),
              message.taskData.column
            )
            if (this._taskId !== message.taskData.id) {
              taskCache.set(message.taskData.id, this)
              taskCache.delete(this._taskId ?? '')
              this._taskId = message.taskData.id
            }
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            this._panel.title = message.taskData.name
            void this.update()
            if (vscode.workspace.getConfiguration('kanbn').get<boolean>('showTaskNotifications') ?? true) {
              // TODO: remove the explicit String cast once typescript bindings for kanbn are updated
              void vscode.window.showInformationMessage(`Updated task '${String(message.taskData.name)}'.`)
            }
            return

          // Delete a task and close the webview panel
          case 'kanbn.delete':
            void vscode.window
              // TODO: remove the explicit String cast once typescript bindings for kanbn are updated
              .showInformationMessage(`Delete task '${String(message.taskData.name)}'?`, 'Yes', 'No')
              .then(async (value) => {
                if (value === 'Yes') {
                  await this._kanbn.deleteTask(message.taskId, true)
                  this.dispose()
                  if (vscode.workspace.getConfiguration('kanbn').get<boolean>('showTaskNotifications') ?? true) {
                    // TODO: remove the explicit String cast once typescript bindings for kanbn are updated
                    void vscode.window.showInformationMessage(`Deleted task '${String(message.taskData.name)}'.`)
                  }
                }
              })
            return

          // Archive a task and close the webview panel
          case 'kanbn.archive':
            await this._kanbn.archiveTask(message.taskId)
            this.dispose()
            if (vscode.workspace.getConfiguration('kanbn').get<boolean>('showTaskNotifications') ?? true) {
              // TODO: remove the explicit String cast once typescript bindings for kanbn are updated
              void vscode.window.showInformationMessage(`Archived task '${String(message.taskData.name)}'.`)
            }
        }
      },
      null,
      this._disposables
    )
  }

  public dispose (): void {
    this._panel.dispose()
    while (this._disposables.length > 0) {
      const x = this._disposables.pop()
      if (x != null) {
        x.dispose()
      }
    }
  }

  private async update (): Promise<void> {
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
      tasks = (await this._kanbn.loadAllTrackedTasks(index)).map((task) => ({
        uuid: uuidv4(),
        ...this._kanbn.hydrateTask(index, task)
      }))
    } catch (error) {
      if (error instanceof Error) {
        void vscode.window.showErrorMessage(error.message)
      } else {
        throw error
      }
      return
    }
    let task: any = null
    if (this._taskId !== null) {
      task = tasks.find((t) => t.id === this._taskId) ?? null
    }

    // Use column of task, or first column if task doesn't exist yet.
    const columnName = task?.column ?? this._defaultColumn ?? Object.keys(index.columns)[0]

    // Send task data to the webview
    void this._panel.webview.postMessage({
      type: 'task',
      index,
      task,
      tasks,
      customFields: index.options.customFields ?? [],
      columnName,
      dateFormat: this._kanbn.getDateFormat(index),
      panelUuid: this._panelUuid
    })
  }

  private _getHtmlForWebview (): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manifest = require(path.join(this._extensionPath, 'build', 'asset-manifest.json'))
    const mainScript = manifest.files['main.js']
    const mainStyle = manifest.files['main.css']
    if (this._panel === null) {
      throw new Error('Panel is not defined')
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
<base href="${webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionPath, 'build'))).toString()}/">
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root-task"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`
  }
}
