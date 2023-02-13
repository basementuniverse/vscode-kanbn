import * as path from 'path'
import * as vscode from 'vscode'
import getNonce from './getNonce'
import { Kanbn } from '@basementuniverse/kanbn/src/main'

export default class KanbnBurndownPanel {
  private static readonly viewType = 'react'

  private readonly column: vscode.ViewColumn
  private readonly _extensionPath: string
  private readonly _workspacePath: string
  private readonly _kanbn: Kanbn
  private readonly _kanbnFolderName: string
  private _panel: vscode.WebviewPanel | null = null
  private sprintMode: boolean = true
  private sprint: string = ''
  private startDate: string = ''
  private endDate: string = ''

  public show (): void {
    if (this._panel === null) {
      this.setUpPanel()
    }
    this._panel?.reveal()
    void this.update()
  }

  private setUpPanel (): void {
    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnBurndownPanel.viewType, 'Burndown Chart', this.column, {
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
      light: vscode.Uri.file(path.join(this._extensionPath, 'resources', 'burndown_light.svg')),
      dark: vscode.Uri.file(path.join(this._extensionPath, 'resources', 'burndown_dark.svg'))
    }

    // Set the webview's title to the kanbn project name
    void this._kanbn.getIndex().then((index) => {
      if (this._panel !== null) this._panel.title = index.name
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

          // Refresh the kanbn chart
          case 'kanbn.refreshBurndownData':
            this.sprintMode = message.sprintMode
            this.sprint = message.sprint
            this.startDate = message.startDate
            this.endDate = message.endDate
            void this.update()
        }
      })
  }

  public static create (
    extensionPath: string,
    workspacePath: string,
    kanbn: Kanbn,
    kanbnFolderName: string
  ): KanbnBurndownPanel {
    const column = (vscode.window.activeTextEditor != null) ? vscode.window.activeTextEditor.viewColumn : undefined
    return new KanbnBurndownPanel(
      extensionPath,
      workspacePath,
      column ?? vscode.ViewColumn.One,
      kanbn,
      kanbnFolderName
    )
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
    if (this._panel != null) {
      void this._panel.webview.postMessage({
        type: 'burndown',
        index,
        dateFormat: this._kanbn.getDateFormat(index),
        burndownData: await this._kanbn.burndown(
          (this.sprintMode && this.sprint !== '')
            ? [this.sprint]
            : null,
          (
            !this.sprintMode &&
            this.startDate !== '' &&
            this.endDate !== ''
          )
            ? [
                new Date(Date.parse(this.startDate)),
                new Date(Date.parse(this.endDate))
              ]
            : null,
          null,
          null,
          'auto'
        )
      })
    }
  }

  private constructor (
    extensionPath: string,
    workspacePath: string,
    column: vscode.ViewColumn,
    kanbn: Kanbn,
    kanbnFolderName: string
  ) {
    this._extensionPath = extensionPath
    this._workspacePath = workspacePath
    this._kanbn = kanbn
    this._kanbnFolderName = kanbnFolderName
    this.column = column
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
<base href="${webview.asWebviewUri(vscode.Uri.file(path.join(this._extensionPath, 'build'))).toString()}/">
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root-burndown"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`
  }
}
