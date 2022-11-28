import { Kanbn } from '@basementuniverse/kanbn/src/main'
import * as vscode from 'vscode'

export default class KanbnStatusBarItem {
  private readonly _statusBarItem: vscode.StatusBarItem
  private _kanbn: Kanbn | null

  constructor (
    context: vscode.ExtensionContext,
    kanbn: Kanbn | null
  ) {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0)
    context.subscriptions.push(this._statusBarItem)
    this._kanbn = kanbn
  }

  async update (kanbn: Kanbn): Promise<void> {
    if (this._statusBarItem === undefined) {
      return
    }
    this._kanbn = kanbn
    if (await this._kanbn.initialised()) {
      const status = (await this._kanbn.status(true)) as {
        tasks: number
        columnTasks: Record<string, number>
        startedTasks?: number
        completedTasks?: number
      }
      const text = [
        `$(project) ${status.tasks}`
      ]
      let tooltip: string[] = []
      if (status.tasks > 0) {
        tooltip = [
          `${status.tasks} task${status.tasks === 1 ? '' : 's'}`
        ]
        if ('startedTasks' in status && status.startedTasks !== undefined && status.startedTasks > 0) {
          text.push(`$(play) ${status.startedTasks}`)
          tooltip.push(`${status.startedTasks} started task${status.startedTasks === 1 ? '' : 's'}`)
        }
        if ('completedTasks' in status && status.completedTasks !== undefined && status.completedTasks > 0) {
          text.push(`$(check) ${status.completedTasks}`)
          tooltip.push(`${status.completedTasks} completed task${status.completedTasks === 1 ? '' : 's'}`)
        }
      } else {
        tooltip.push('No tasks')
      }
      this._statusBarItem.text = text.join(' ')
      this._statusBarItem.tooltip = tooltip.join('\n')
      this._statusBarItem.command = 'kanbn.board'
      this._statusBarItem.show()
    } else {
      this._statusBarItem.text = '$(project)'
      this._statusBarItem.tooltip = 'Initialise Kanbn'
      this._statusBarItem.command = 'kanbn.init'
      if (vscode.workspace.getConfiguration('kanbn').get('showUninitialisedStatusBarItem') === true) {
        this._statusBarItem.show()
      } else {
        this._statusBarItem.hide()
      }
    }
  }
}
