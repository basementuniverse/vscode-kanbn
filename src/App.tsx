import Burndown from './Burndown'
import TaskEditor from './TaskEditor'
import React, { useState, useEffect, useCallback } from 'react'
import vscode from './vscode'

function App (): JSX.Element {
  const vscodeState = vscode.getState() ?? {
    type: '',
    name: '',
    customFields: [],
    dateFormat: '',
    task: {},
    tasks: {},
    columnName: '',
    columnNames: [] as string[],
    panelUuid: '',
    sprints: [],
    burndownData: { series: [] }
  }
  const [state, setState] = useState(vscodeState)
  const processMessage = useCallback(event => {
    const newState: any = {}
    const tasks = Object.fromEntries((event.data.tasks ?? []).map(task => [task.id, task]))
    switch (event.data.type) {
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
  }, [])
  return (
    <React.Fragment>
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
        />
      }
      {
        state.type === 'burndown' &&
        <Burndown
          name={state.name}
          sprints={state.sprints}
          burndownData={state.burndownData}
          dateFormat={state.dateFormat}
        />
      }
    </React.Fragment>
  )
}

export default App
