import * as vscode from 'vscode';
import KanbnStatusBarItem from './KanbnStatusBarItem';
import KanbnBoardPanel from './KanbnBoardPanel';
import KanbnTaskPanel from './KanbnTaskPanel';

let kanbnStatusBarItem: KanbnStatusBarItem;

export async function activate(context: vscode.ExtensionContext) {

  // Register a command to initialise Kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where Kanbn isn't already initialised.
  context.subscriptions.push(vscode.commands.registerCommand('kanbn.init', async () => {

    // If no workspace folder is opened, we can't initialise kanbn
    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showErrorMessage('You need to open a workspace before initialising Kanbn.');
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
      vscode.window.showInformationMessage(`Initialised Kanbn project '${newProjectName}'.`);
      KanbnBoardPanel.update();
    }
    kanbnStatusBarItem.update();
  }));

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  context.subscriptions.push(vscode.commands.registerCommand('kanbn.board', async () => {

    // If no workspace folder is opened, we can't open the kanbn board
    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showErrorMessage('You need to open a workspace before viewing the Kanbn board.');
      return;
    }

    // Set the node process directory and import kanbn
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath);
    const kanbn = await import('@basementuniverse/kanbn/src/main');

    // If kanbn is initialised, view the kanbn board
    if (await kanbn.initialised()) {
      KanbnBoardPanel.createOrShow(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        kanbn
      );
      KanbnBoardPanel.update();
    } else {
      vscode.window.showErrorMessage('You need to initialise Kanbn before viewing the Kanbn board.');
    }
    kanbnStatusBarItem.update();
  }));

  // Register a command to add a new kanbn task.
  context.subscriptions.push(vscode.commands.registerCommand('kanbn.addTask', async () => {

    // If no workspace folder is opened, we can't add a new task
    if (vscode.workspace.workspaceFolders === undefined) {
      vscode.window.showErrorMessage('You need to open a workspace before adding a new task.');
      return;
    }

    // Set the node process directory and import kanbn
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath);
    const kanbn = await import('@basementuniverse/kanbn/src/main');

    // If kanbn is initialised, open the task webview
    if (await kanbn.initialised()) {
      KanbnTaskPanel.show(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        kanbn,
        null,
        null
      );
    } else {
      vscode.window.showErrorMessage('You need to initialise Kanbn before adding a new task.');
    }
  }));

  // Register a command to open a burndown chart.
  context.subscriptions.push(vscode.commands.registerCommand('kanbn.burndown', async () => {

    // TODO open burndown chart singleton webview panel
    vscode.window.showErrorMessage('Not implemented yet!');
  }));

  // If a workspace folder is open, add a status bar item and start watching for file changes
  if (vscode.workspace.workspaceFolders !== undefined) {

    // Set the node process directory and import kanbn
    process.chdir(vscode.workspace.workspaceFolders[0].uri.fsPath);
    const kanbn = await import('@basementuniverse/kanbn/src/main');

    // Create status bar item
    kanbnStatusBarItem = new KanbnStatusBarItem(context, kanbn);
    kanbnStatusBarItem.update();
    KanbnBoardPanel.update();

    // Initialise file watcher
    const uri = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const fileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(
      uri,
      `${kanbn.getFolderName()}/**.*`
    ));
    fileWatcher.onDidChange(() => {
      kanbnStatusBarItem.update();
      KanbnBoardPanel.update();
    });
  }

  // Handle configuration changes
  vscode.workspace.onDidChangeConfiguration(e => {
    kanbnStatusBarItem.update();
    KanbnBoardPanel.update();
  });
}
