import * as vscode from 'vscode';
import type { KanbnApi } from './KanbnApi';
import { resolveExistingBoardSlug } from './KanbnBoards';

export default class KanbnStatusBarItem {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private readonly _kanbn: KanbnApi;

  constructor(
    context: vscode.ExtensionContext,
    kanbn: KanbnApi
  ) {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    context.subscriptions.push(this._statusBarItem);
    this._kanbn = kanbn;
  }

  /**
   * Refresh the status bar item.
   *
   * Never rejects: this item is how people reach the board, and the callers treat it as
   * fire-and-forget, so a board that won't load has to leave something clickable behind rather than
   * removing the extension from the status bar altogether
   */
  async update(): Promise<void> {
    if (this._statusBarItem === undefined) {
      return;
    }
    try {
      await this.refresh();
    } catch (error) {
      this._statusBarItem.text = '$(project)';
      this._statusBarItem.tooltip = `Kanbn: ${error instanceof Error ? error.message : String(error)}`;
      this._statusBarItem.command = 'kanbn.board';
      this._statusBarItem.show();
    }
  }

  private async refresh(): Promise<void> {
    if (await this._kanbn.workspaceInitialised()) {
      // Resolve the target board exactly as the CLI does - KANBN_BOARD, then defaultBoard, then the
      // main board - rather than assuming the main board is the interesting one. A target that
      // doesn't exist falls back to the main board, quietly here: the commands say so out loud
      let board = this._kanbn;
      let boardName: string | null = null;
      try {
        const { slug } = await resolveExistingBoardSlug(this._kanbn);
        board = this._kanbn.board(slug);
        const boards = await this._kanbn.listBoards();
        if (boards.length > 1) {
          boardName = (boards.find((b) => b.slug === slug) ?? { name: slug }).name;
        }
      } catch (error) {
        board = this._kanbn;
      }

      const status = (await board.status(true)) as {
        tasks: number,
        columnTasks: Record<string, number>,
        startedTasks?: number,
        completedTasks?: number
      };
      const text = [
        `$(project) ${status.tasks}`
      ];
      let tooltip: string[] = boardName !== null ? [boardName] : [];
      if (status.tasks > 0) {
        tooltip = [
          ...tooltip,
          `${status.tasks} task${status.tasks === 1 ? '' : 's'}`
        ];
        if ('startedTasks' in status && status.startedTasks! > 0) {
          text.push(`$(play) ${status.startedTasks}`);
          tooltip.push(`${status.startedTasks} started task${status.startedTasks === 1 ? '' : 's'}`);
        }
        if ('completedTasks' in status && status.completedTasks! > 0) {
          text.push(`$(check) ${status.completedTasks}`);
          tooltip.push(`${status.completedTasks} completed task${status.completedTasks === 1 ? '' : 's'}`);
        }
      } else {
        tooltip.push('No tasks');
      }
      this._statusBarItem.text = text.join(' ');
      this._statusBarItem.tooltip = tooltip.join('\n');
      this._statusBarItem.command = 'kanbn.board';
      this._statusBarItem.show();
    } else {
      this._statusBarItem.text = '$(project)';
      this._statusBarItem.tooltip = 'Initialise Kanbn';
      this._statusBarItem.command = 'kanbn.init';
      if (vscode.workspace.getConfiguration('kanbn').get('showUninitialisedStatusBarItem')) {
        this._statusBarItem.show();
      } else {
        this._statusBarItem.hide();
      }
    }
  }
}
