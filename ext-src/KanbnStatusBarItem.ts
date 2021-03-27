import * as vscode from 'vscode';

export default class KanbnStatusBarItem {
  statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    context.subscriptions.push(this.statusBarItem);
  }

  async update(kanbn: typeof import('@basementuniverse/kanbn/src/main')): Promise<void> {
    if (this.statusBarItem === undefined) {
      return;
    }
    if (await kanbn.initialised()) {
      const status = await kanbn.status(true);
      const text = [
        `$(project) ${status.tasks}`
      ];
      const tooltip = [
        `${status.tasks} task${status.tasks === 1 ? '' : 's'}`
      ];
      if ('startedTasks' in status) {
        text.push(`$(play) ${status.startedTasks}`);
        tooltip.push(`${status.startedTasks} started task${status.startedTasks === 1 ? '' : 's'}`);
      }
      if ('completedTasks' in status) {
        text.push(`$(check) ${status.completedTasks}`);
        tooltip.push(`${status.completedTasks} completed task${status.completedTasks === 1 ? '' : 's'}`);
      }
      this.statusBarItem.text = text.join(' ');
      this.statusBarItem.tooltip = tooltip.join('\n');
      this.statusBarItem.command = 'kanbn.board';
    } else {
      this.statusBarItem.text = '$(project) Not initialised';
      this.statusBarItem.tooltip = 'Click to initialise';
      this.statusBarItem.command = 'kanbn.init';
    }
    this.statusBarItem.show();
  }
}
