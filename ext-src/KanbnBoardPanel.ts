import * as path from 'path';
import * as vscode from 'vscode';

export default class KanbnBoardPanel {
  public static currentPanel: KanbnBoardPanel | undefined;

  private static readonly viewType = 'react';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionPath: string;
  private readonly _workspacePath: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionPath: string, workspacePath: string) {
    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

    // If we already have a panel, show it.
    // Otherwise, create a new panel.
    if (KanbnBoardPanel.currentPanel) {
      KanbnBoardPanel.currentPanel._panel.reveal(column);
    } else {
      KanbnBoardPanel.currentPanel = new KanbnBoardPanel(
        extensionPath,
        workspacePath,
        column || vscode.ViewColumn.One
      );
    }
  }

  private constructor(extensionPath: string, workspacePath: string, column: vscode.ViewColumn) {
    this._extensionPath = extensionPath;
    this._workspacePath = workspacePath;

    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(KanbnBoardPanel.viewType, "Kanbn Board", column, {
      // Enable javascript in the webview
      enableScripts: true,

      // Restrict the webview to only loading content from our extension's `media` directory.
      localResourceRoots: [
        vscode.Uri.file(path.join(this._extensionPath, 'build'))
      ]
    });

    // Set the webview's initial html content
    this._panel.webview.html = this._getHtmlForWebview();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'error':
          vscode.window.showErrorMessage(message.text);
          return;
      }
    }, null, this._disposables);
  }

  public dispose() {
    KanbnBoardPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _getHtmlForWebview() {
    const manifest = require(path.join(this._extensionPath, 'build', 'asset-manifest.json'));
    const mainScript = manifest['main.js'];
    const mainStyle = manifest['main.css'];

    const scriptPathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'build', mainScript));
    const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
    const stylePathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'build', mainStyle));
    const styleUri = stylePathOnDisk.with({ scheme: 'vscode-resource' });

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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}';style-src vscode-resource: 'unsafe-inline' http: https: data:;">
<base href="${vscode.Uri.file(path.join(this._extensionPath, 'build')).with({ scheme: 'vscode-resource' })}/">
</head>
<body>
<noscript>You need to enable JavaScript to run this app.</noscript>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
