import Board from './Board'
import Burndown from './Burndown'
import TaskEditor from './TaskEditor'
import React, { useState, useEffect, useCallback } from 'react'
import VSCodeApi from './VSCodeApi'

declare let acquireVsCodeApi: Function
const vscode: VSCodeApi = acquireVsCodeApi()

const zip = (a: any[], b: any[]): Array<[any, any]> => a.map((v: any, i: number): [any, any] => [v, b[i]])

function App (): JSX.Element {
  const vscodeState = vscode.getState() ?? {
    type: '',
    name: '',
    description: '',
    columns: {},
    hiddenColumns: [],
    startedColumns: [],
    completedColumns: [],
    columnSorting: {},
    customFields: [],
    dateFormat: '',
    task: {},
    tasks: {},
    columnName: '',
    columnNames: [] as string[],
    panelUuid: '',
    showBurndownButton: false,
    showSprintButton: false,
    sprints: [],
    currentSprint: null,
    burndownData: { series: [] }
  }
  const [state, setState] = useState(vscodeState)
  const processMessage = useCallback(event => {
    const newState: any = {}
    const tasks = Object.fromEntries((event.data.tasks ?? []).map(task => [task.id, task]))
    switch (event.data.type) {
      case 'index': {
        newState.name = event.data.index.name
        newState.description = event.data.index.description
        const columns = Object.fromEntries(
          zip(
            Object.keys(event.data.index.columns),
            Object.values(event.data.index.columns).map(column => (column as string[]).map(taskId => tasks[taskId]))
          )
        )
        newState.columns = columns
        newState.hiddenColumns = event.data.hiddenColumns
        newState.startedColumns = event.data.startedColumns
        newState.completedColumns = event.data.completedColumns
        newState.columnSorting = event.data.columnSorting
        newState.customFields = event.data.customFields
        newState.showBurndownButton = event.data.showBurndownButton
        newState.showSprintButton = event.data.showSprintButton

        // Get current sprint
        let sprint = null
        if ('sprints' in event.data.index.options && event.data.index.options.sprints.length > 0) {
          sprint = event.data.index.options.sprints[event.data.index.options.sprints.length - 1]
        }
        newState.currentSprint = sprint
        break
      }

      case 'task':
        newState.task = event.data.task
        newState.tasks = tasks
        newState.columnName = event.data.columnName
        newState.columnNames = Object.keys(event.data.index.columns)
        newState.customFields = event.data.customFields
        newState.panelUuid = event.data.panelUuid
        break

      case 'burndown':
        newState.name = event.data.index.name
        newState.tasks = tasks
        newState.sprints = 'sprints' in event.data.index.options
          ? event.data.index.options.sprints
          : []
        newState.burndownData = event.data.burndownData
        break
    }
    newState.type = event.data.type
    newState.dateFormat = event.data.dateFormat
    vscode.setState(newState)
    setState(newState)
  }, [])

  useEffect(() => {
    window.addEventListener('message', processMessage)
    return () => {
      window.removeEventListener('message', processMessage)
    }
  })
  return (
    <React.Fragment>
      {
        state.type === 'index' &&
        <Board
          name={state.name}
          description={state.description}
          columns={state.columns}
          hiddenColumns={state.hiddenColumns}
          startedColumns={state.startedColumns}
          completedColumns={state.completedColumns}
          columnSorting={state.columnSorting}
          customFields={state.customFields}
          dateFormat={state.dateFormat}
          showBurndownButton={state.showBurndownButton}
          showSprintButton={state.showSprintButton}
          currentSprint={state.currentSprint}
          vscode={vscode}
        />
      }
      {
        state.type === 'task' &&
        <TaskEditor
          task={state.task as KanbnTask | null}
          tasks={state.tasks}
          columnName={state.columnName}
          columnNames={state.columnNames}
          customFields={state.customFields}
          dateFormat={state.dateFormat}
          panelUuid={state.panelUuid}
          vscode={vscode}
        />
      }
      {
        state.type === 'burndown' &&
        <Burndown
          name={state.name}
          sprints={state.sprints}
          burndownData={state.burndownData}
          dateFormat={state.dateFormat}
          vscode={vscode}
        />
      }
    </React.Fragment>
  )
}

export default App
