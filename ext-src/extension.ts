import * as kanbn from '@basementuniverse/kanbn/src/main';
import * as vscode from 'vscode';
import ReactPanel from './ReactPanel';

let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {

  // Register a command to initialise kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where kanbn isn't already initialised.
  const initialiseCommandId = 'kanbn.init';
  context.subscriptions.push(vscode.commands.registerCommand(initialiseCommandId, async () => {

    // If no workspace folder is opened, we can't initialise kanbn
    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showErrorMessage('You need to open a workspace before initialising kanbn.');
      return;
    }

    // Otherwise, check if kanbn is already initialised in the current workspace
    console.log(kanbn.getMainFolder());
    // Prints /home/gordon/.kanbn because presumably vscode runs extension code with process.cwd() as /home/<user>
    // TODO update kanbn to inject root (see const ROOT in kanbn/src/main.js) into every method that needs it...

    // if (vscode.workspace.workspaceFolders !== undefined) {
    //   const name = await vscode.window.showInputBox({
    //     value: '',
    //     placeHolder: 'The project name.',
    //     validateInput: text => {
    //       return text.length < 1 ? 'The project name cannot be empty.' : null;
    //     }
    //   });
    //   if (name !== undefined) {
    //     vscode.window.showInformationMessage(`creating with ${name}`);
    //   }
    // }
    // TODO initialise kanbn board
    // updateStatusBarItem();
    // console.log(kanbn);
    // console.log(`kanbn initialised: ${await kanbn.initialised()}`);
  }));

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  const openBoardCommandId = 'kanbn.open';
  context.subscriptions.push(vscode.commands.registerCommand(openBoardCommandId, () => {
    ReactPanel.createOrShow(context.extensionPath);
  }));

  // If a workspace folder is open, add a status bar item and start watching for file changes
  if (vscode.workspace.workspaceFolders !== undefined) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    statusBarItem.command = openBoardCommandId;
    context.subscriptions.push(statusBarItem);
    updateStatusBarItem();

    const uri = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, '.kanbn/*'));
    fileWatcher.onDidChange(e => {
      // TODO update kanbn board
      updateStatusBarItem();
      console.log(e);
    });
  }
}

export function deactivate(): void {
  //
}

function updateStatusBarItem(): void {
  if (statusBarItem === undefined) {
    return;
  }
  statusBarItem.text = `$(project) Not initialised`;
  statusBarItem.show();
}
