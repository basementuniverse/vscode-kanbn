import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts'
import vscode from './vscode'
import formatDate from 'dateformat'
import { debounce } from 'throttle-debounce'

const Burndown = (): JSX.Element => {
  const [state, setState] = useState(vscode.getState() ?? {
    name: '',
    dateFormat: 'yyyy-mm-dd',
    sprints: [],
    burndownData: { series: [] },
    sprintMode: false,
    sprint: '',
    startDate: '',
    endDate: ''
  })
  const processMessage = useCallback(event => {
    const newState: any = {}
    newState.name = event.data.index.name
    newState.sprints = 'sprints' in event.data.index.options
      ? event.data.index.options.sprints
      : []
    newState.burndownData = event.data.burndownData
    newState.dateFormat = event.data.dateFormat
    newState.sprintMode = state.sprintMode
    newState.sprint = state.sprint
    newState.startDate = state.startDate
    if (newState.sprintMode === false && newState.burndownData.series.length > 0 && newState.startDate === '') {
      newState.startDate = formatDate(newState.burndownData.series[0].from, state.dateFormat)
    }
    newState.endDate = state.endDate
    if (newState.sprintMode === false && newState.burndownData.series.length > 0 && newState.endDate === '') {
      newState.endDate = formatDate(newState.burndownData.series[0].to, state.dateFormat)
    }
    vscode.setState(newState)
    setState(newState)
  }, [])

  useEffect(() => {
    window.addEventListener('message', processMessage)
    return () => {
      window.removeEventListener('message', processMessage)
    }
  }, [])
  const hasSprints = state.sprints.length > 0
  const setSprintMode = (sprintMode): void => {
    const newState = { ...state, sprintMode }
    setState(newState)
    vscode.setState(newState)
  }
  const setSprint = (sprint): void => {
    const newState = { ...state, sprint }
    setState(newState)
    vscode.setState(newState)
  }
  const setStartDate = (startDate): void => {
    const newState = { ...state, startDate }
    setState(newState)
    vscode.setState(newState)
  }
  const setEndDate = (endDate): void => {
    const newState = { ...state, endDate }
    setState(newState)
    vscode.setState(newState)
  }

  const refreshBurndownData = useRef(debounce(500, settings => {
    vscode.postMessage({
      command: 'kanbn.refreshBurndownData',
      ...settings
    })
  })).current

  const handleChangeSprint = ({ target: { value } }): void => {
    setSprint(value)
    refreshBurndownData(
      Object.assign(
        {
          sprintMode: state.sprintMode,
          sprint: value,
          startDate: state.startDate,
          endDate: state.endDate
        }
      )
    )
  }

  const handleChangeStartDate = ({ target: { value } }): void => {
    setStartDate(value)
    refreshBurndownData(
      Object.assign(
        {
          sprintMode: state.sprintMode,
          sprint: state.sprint,
          startDate: value,
          endDate: state.endDate
        }
      )
    )
  }

  const handleChangeEndDate = ({ target: { value } }): void => {
    setEndDate(value)
    refreshBurndownData(
      {
        sprintMode: state.sprintMode,
        sprint: state.sprint,
        startDate: state.startDate,
        endDate: value
      }
    )
  }

  const handleClickSprintMode = (): void => {
    setSprintMode(true)
    refreshBurndownData(
      Object.assign(
        {
          sprintMode: true,
          sprint: state.sprint,
          startDate: state.value,
          endDate: state.endDate
        }
      )
    )
  }

  const handleClickDateMode = (): void => {
    setSprintMode(false)
    refreshBurndownData(
      {
        sprintMode: false,
        sprint: state.sprint,
        startDate: state.startDate,
        endDate: state.endDate
      }
    )
  }

  const chartData = state.burndownData.series.length > 0
    ? state.burndownData.series[0].dataPoints.map(dataPoint => ({
      x: Date.parse(dataPoint.x),
      y: dataPoint.y,
      count: dataPoint.count,
      tasks: dataPoint.tasks
    }))
    : []

  const formatXAxis = (date): string => {
    return formatDate(date, state.dateFormat)
  }
  const renderTooltip = (e): JSX.Element | null => {
    if (e.active === true && e.payload !== undefined && e.payload.length > 0) {
      const data = e.payload[0].payload
      return (
        <div className="kanbn-burndown-tooltip">
          <p className="kanbn-burndown-tooltip-date">{formatDate(data.x, state.dateFormat)}</p>
          <p className="kanbn-burndown-tooltip-workload">Total workload: {data.y}</p>
          <p className="kanbn-burndown-tooltip-count">Active tasks: {data.count}</p>
          {data.tasks.map(task => (
            <p className="kanbn-burndown-tooltip-task" key={task.id}>
              {{ created: 'Created', started: 'Started', completed: 'Completed' }[task.eventType]} {task.task.name}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  useEffect(() => {
    vscode.postMessage({ command: 'kanbn.updateMe' })
  }, [])

  return (
    <>
      <div className="kanbn-header">
        <h1 className="kanbn-header-name">
          <p>{state.name}</p>
          <div className="kanbn-burndown-settings">
            <form>
              {
                state.sprintMode as boolean
                  ? <select
                      value={state.sprint}
                      className="kanbn-burndown-settings-sprint-select"
                      onChange={handleChangeSprint}
                    >
                    {
                      state.sprints.length > 0
                        ? state.sprints.map(sprint => {
                          return (
                              <option key={sprint.start} value={sprint.name}>{sprint.name}</option>
                          )
                        })
                        : <option disabled>No sprints</option>
                    }
                    </select>
                  : <>
                      <input
                        type="date"
                        value={state.startDate}
                        className="kanbn-burndown-settings-input kanbn-burndown-settings-start-date"
                        onChange={handleChangeStartDate}
                      />
                      <input
                        type="date"
                        value={state.endDate}
                        className="kanbn-burndown-settings-input kanbn-burndown-settings-end-date"
                        onChange={handleChangeEndDate}
                      />
                    </>
              }
              {hasSprints && <button
                type="button"
                className={[
                  'kanbn-header-button',
                  'kanbn-burndown-settings-sprint-mode',
                  state.sprintMode as boolean ? 'kanbn-header-button-active' : 'kanbn-header-button-inactive'
                ].join(' ')}
                onClick={handleClickSprintMode}
                title="View sprint burndown"
              >
                <i className="codicon codicon-rocket"></i>
              </button>}
              <button
                type="button"
                className={[
                  'kanbn-header-button',
                  'kanbn-burndown-settings-date-mode',
                  state.sprintMode as boolean ? 'kanbn-header-button-inactive' : 'kanbn-header-button-active'
                ].join(' ')}
                onClick={handleClickDateMode}
                title="View date-range burndown"
              >
                <i className="codicon codicon-clock"></i>
              </button>
            </form>
          </div>
        </h1>
      </div>
      <div className="kanbn-burndown">
        <ResponsiveContainer width="100%" height="100%" className="kanbn-burndown-chart">
          <LineChart data={chartData}>
            <Line
              className="kanbn-burndown-line"
              type="stepAfter"
              dataKey="y"
              strokeWidth={2}
              dot={{ className: 'kanbn-burndown-point' }}
              isAnimationActive={false}
            />
            <CartesianGrid className="kanbn-burndown-grid" strokeDasharray="5 5" vertical={false} />
            {chartData.length > 0 && <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              tickCount={6}
            />}
            <YAxis />
            <Tooltip content={renderTooltip} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

export default Burndown
