import Board from './Board'
import Burndown from './Burndown'
import TaskEditor from './TaskEditor'
import React, { useState, useEffect, useCallback } from 'react'
import VSCodeApi from './VSCodeApi'

declare let acquireVsCodeApi: Function
const vscode: VSCodeApi = acquireVsCodeApi()

const zip = (a: any[], b: any[]): Array<[any, any]> => a.map((v: any, i: number): [any, any] => [v, b[i]])

function App (): JSX.Element {
  const state = vscode.getState() ?? {
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
  const [type, setType] = useState(state.type)
  const [name, setName] = useState(state.name)
  const [description, setDescription] = useState(state.description)
  const [columns, setColumns] = useState(state.columns)
  const [hiddenColumns, setHiddenColumns] = useState(state.hiddenColumns)
  const [startedColumns, setStartedColumns] = useState(state.startedColumns)
  const [completedColumns, setCompletedColumns] = useState(state.completedColumns)
  const [columnSorting, setColumnSorting] = useState(state.columnSorting)
  const [customFields, setCustomFields] = useState(state.customFields)
  const [dateFormat, setDateFormat] = useState(state.dateFormat)
  const [task, setTask] = useState(state.task)
  const [tasks, setTasks] = useState(state.tasks)
  const [columnName, setColumnName] = useState(state.columnName)
  const [columnNames, setColumnNames] = useState(state.columnNames)
  const [panelUuid, setPanelUuid] = useState(state.panelUuid)
  const [showBurndownButton, setShowBurndownButton] = useState(state.showBurndownButton)
  const [showSprintButton, setShowSprintButton] = useState(state.showSprintButton)
  const [sprints, setSprints] = useState(state.sprints)
  const [currentSprint, setCurrentSprint] = useState(state.currentSprint)
  const [burndownData, setBurndownData] = useState(state.burndownData)
  const processMessage = useCallback(event => {
    const tasks = Object.fromEntries((event.data.tasks ?? []).map(task => [task.id, task]))
    switch (event.data.type) {
      case 'index': {
        setName(event.data.index.name)
        state.name = event.data.index.name
        setDescription(event.data.index.description)
        state.description = event.data.index.description
        const columns = Object.fromEntries(
          zip(
            Object.keys(event.data.index.columns),
            Object.values(event.data.index.columns).map(column => (column as string[]).map(taskId => tasks[taskId]))
          )
        )
        setColumns(columns)
        state.columns = columns
        setHiddenColumns(event.data.hiddenColumns)
        state.hiddenColumns = event.data.hiddenColumns
        setStartedColumns(event.data.startedColumns)
        state.startedColumns = event.data.startedColumns
        setCompletedColumns(event.data.completedColumns)
        state.completedColumns = event.data.completedColumns
        setColumnSorting(event.data.columnSorting)
        state.columnSorting = event.data.columnSorting
        setCustomFields(event.data.customFields)
        state.customFields = event.data.customFields
        setShowBurndownButton(event.data.showBurndownButton)
        state.showBurndownButton = event.data.showBurndownButton
        setShowSprintButton(event.data.showSprintButton)
        state.showSprintButton = event.data.showSprintButton

        // Get current sprint
        let sprint = null
        if ('sprints' in event.data.index.options && event.data.index.options.sprints.length > 0) {
          sprint = event.data.index.options.sprints[event.data.index.options.sprints.length - 1]
        }
        setCurrentSprint(sprint)
        state.currentSprint = sprint
        break
      }

      case 'task':
        setTask(event.data.task)
        state.task = event.data.task
        setTasks(tasks)
        state.tasks = tasks
        setColumnName(event.data.columnName)
        state.columnName = event.data.columnName
        setColumnNames(Object.keys(event.data.index.columns))
        state.columnNames = Object.keys(event.data.index.columns)
        setCustomFields(event.data.customFields)
        state.customFields = event.data.customFields
        setPanelUuid(event.data.panelUuid)
        state.panelUuid = event.data.panelUuid
        break

      case 'burndown':
        setName(event.data.index.name)
        state.name = event.data.index.name
        setTasks(tasks)
        state.tasks = tasks
        setSprints(
          'sprints' in event.data.index.options
            ? event.data.index.options.sprints
            : []
        )
        state.sprints = 'sprints' in event.data.index.options
          ? event.data.index.options.sprints
          : []
        setBurndownData(event.data.burndownData)
        state.burndownData = event.data.burndownData
        break
    }
    setType(event.data.type)
    state.type = event.data.type
    setDateFormat(event.data.dateFormat)
    state.dateFormat = event.data.dateFormat
    vscode.setState(state)
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
        type === 'index' &&
        <Board
          name={name}
          description={description}
          columns={columns}
          hiddenColumns={hiddenColumns}
          startedColumns={startedColumns}
          completedColumns={completedColumns}
          columnSorting={columnSorting}
          customFields={customFields}
          dateFormat={dateFormat}
          showBurndownButton={showBurndownButton}
          showSprintButton={showSprintButton}
          currentSprint={currentSprint}
          vscode={vscode}
        />
      }
      {
        type === 'task' &&
        <TaskEditor
          task={task as KanbnTask | null}
          tasks={tasks}
          columnName={columnName}
          columnNames={columnNames}
          customFields={customFields}
          dateFormat={dateFormat}
          panelUuid={panelUuid}
          vscode={vscode}
        />
      }
      {
        type === 'burndown' &&
        <Burndown
          name={name}
          sprints={sprints}
          burndownData={burndownData}
          dateFormat={dateFormat}
          vscode={vscode}
        />
      }
    </React.Fragment>
  )
}

export default App
