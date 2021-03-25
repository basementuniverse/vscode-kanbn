import * as vscode from 'vscode';
import ReactPanel from './ReactPanel';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {

  // Register a command to initialise kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where kanbn isn't already initialised.
  context.subscriptions.push(vscode.commands.registerCommand('kanbn.init', async () => {

    // If no workspace folder is opened, we can't initialise kanbn
    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showErrorMessage('You need to open a workspace before initialising kanbn.');
      return;
    }

    // Set the node process directory and import kanbn
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath);
    const kanbn = await import('@basementuniverse/kanbn/src/main');

    // If kanbn is already initialised, get the project name
    let projectName = '';
    if (await kanbn.initialised()) {
      projectName = (await kanbn.getIndex()).name;
    }

    // Prompt for a new project name
    const newProjectName = await vscode.window.showInputBox({
      value: projectName,
      placeHolder: 'The project name.',
      validateInput: text => {
        return text.length < 1 ? 'The project name cannot be empty.' : null;
      }
    });

    // If the input prompt wasn't cancelled, initialise kanbn
    if (newProjectName !== undefined) {
      await kanbn.initialise({
        name: newProjectName
      });
      vscode.window.showInformationMessage(`Initialised kanbn project '${newProjectName}'.`);
      updateStatusBarItem(kanbn);
    }
  }));

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  context.subscriptions.push(vscode.commands.registerCommand('kanbn.board', async () => {

    // If no workspace folder is opened, we can't open the kanbn board
    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showErrorMessage('You need to open a workspace before viewing the kanbn board.');
      return;
    }

    // Set the node process directory and import kanbn
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath);
    const kanbn = await import('@basementuniverse/kanbn/src/main');

    // If kanbn is initialised, view the kanbn board
    if (await kanbn.initialised()) {
      ReactPanel.createOrShow(context.extensionPath);
    } else {
      vscode.window.showErrorMessage('You need to initialise kanbn before viewing the kanbn board.');
    }
  }));

  // If a workspace folder is open, add a status bar item and start watching for file changes
  if (vscode.workspace.workspaceFolders !== undefined) {

    // Set the node process directory and import kanbn
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath);
    const kanbn = await import('@basementuniverse/kanbn/src/main');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    context.subscriptions.push(statusBarItem);
    updateStatusBarItem(kanbn);

    // Initialise file watcher
    const uri = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, '.kanbn/*'));
    fileWatcher.onDidChange(() => {
      updateStatusBarItem(kanbn);
      // TODO update kanbn board
    });
  }
}

export function deactivate(): void {
  //
}

async function updateStatusBarItem(kanbn: typeof import('@basementuniverse/kanbn/src/main')): Promise<void> {
  if (statusBarItem === undefined) {
    return;
  }
  const initialised = await kanbn.initialised();
  const text = initialised ? await getStatusBarText(kanbn) : 'Not initialised';
  statusBarItem.text = `$(project) ${text}`;
  statusBarItem.command = initialised ? 'kanbn.board' : 'kanbn.init';
  statusBarItem.show();
}

async function getStatusBarText(kanbn: typeof import('@basementuniverse/kanbn/src/main')): Promise<string> {
  const status = await kanbn.status(true);
  return Object.values(status.columnTasks).join(' / ');
}
