import React, { useState, useRef } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import VSCodeApi from "./VSCodeApi";
import formatDate from 'dateformat';
import { debounce } from 'throttle-debounce';

const Burndown = ({ name, sprints, burndownData, dateFormat, vscode }: {
  name: string,
  sprints: KanbnSprint[],
  burndownData: {
    series: Array<{
      sprint: KanbnSprint,
      from: string,
      to: string,
      dataPoints: Array<{
        x: string,
        y: number,
        count: number,
        tasks: Array<{
          eventType: string,
          taskId: string
        }>
      }>
    }>
  },
  dateFormat: string,
  vscode: VSCodeApi
}) => {
  const hasSprints = sprints.length > 0;
  const [sprintMode, setSprintMode] = useState(hasSprints);
  const [sprint, setSprint] = useState((sprintMode && hasSprints) ? sprints[sprints.length - 1].name : '');
  const [startDate, setStartDate] = useState(
    (sprintMode && burndownData.series.length > 0)
      ? ''
      : formatDate(burndownData.series[0].from, 'yyyy-mm-dd')
  );
  const [endDate, setEndDate] = useState(
    (sprintMode && burndownData.series.length > 0)
      ? ''
      : formatDate(burndownData.series[0].to, 'yyyy-mm-dd')
  );

  const refreshBurndownData = useRef(debounce(500, settings => {
    vscode.postMessage({
      command: 'kanbn.refreshBurndownData',
      ...settings
    });
  })).current;

  const handleChangeSprint = ({ target: { value }}) => {
    setSprint(value);
    refreshBurndownData(
      Object.assign(
        {
          sprintMode,
          sprint,
          startDate,
          endDate
        },
        {
          sprint: value
        }
      )
    );
  };

  const handleChangeStartDate = ({ target: { value }}) => {
    setStartDate(value);
    refreshBurndownData(
      Object.assign(
        {
          sprintMode,
          sprint,
          startDate,
          endDate
        },
        {
          startDate: value
        }
      )
    );
  };

  const handleChangeEndDate = ({ target: { value }}) => {
    setEndDate(value);
    refreshBurndownData(
      Object.assign(
        {
          sprintMode,
          sprint,
          startDate,
          endDate
        },
        {
          endDate: value
        }
      )
    );
  };

  const handleClickSprintMode = () => {
    setSprintMode(true);
    refreshBurndownData(
      Object.assign(
        {
          sprintMode,
          sprint,
          startDate,
          endDate
        },
        {
          sprintMode: true
        }
      )
    );
  };

  const handleClickDateMode = () => {
    setSprintMode(false);
    refreshBurndownData(
      Object.assign(
        {
          sprintMode,
          sprint,
          startDate,
          endDate
        },
        {
          sprintMode: false
        }
      )
    );
  };

  const chartData = burndownData.series.length > 0
    ? burndownData.series[0].dataPoints.map(dataPoint => ({
        x: Date.parse(dataPoint.x),
        y: dataPoint.y,
        count: dataPoint.count,
        tasks: dataPoint.tasks,
      }))
    : [];

  const formatXAxis = date => formatDate(date, dateFormat);

  const renderTooltip = e => {
    if (e.active && e.payload && e.payload.length) {
      const data = e.payload[0].payload;
      return (
        <div className="kanbn-burndown-tooltip">
          <p className="kanbn-burndown-tooltip-date">{formatDate(data.x, dateFormat)}</p>
          <p className="kanbn-burndown-tooltip-workload">Total workload: {data.y}</p>
          <p className="kanbn-burndown-tooltip-count">Active tasks: {data.count}</p>
          {data.tasks.map(task => (
            <p className="kanbn-burndown-tooltip-task">
              {{ created: 'Created', started: 'Started', completed: 'Completed' }[task.eventType]} {task.task.name}
            </p>
          ))}
        </div>
      )
    }
    return null;
  };

  return (
    <React.Fragment>
      <div className="kanbn-header">
        <h1 className="kanbn-header-name">
          <p>{name}</p>
          <div className="kanbn-burndown-settings">
            <form>
              {
                sprintMode
                  ? <select
                      value={sprint}
                      className="kanbn-burndown-settings-sprint-select"
                      onChange={handleChangeSprint}
                    >
                    {
                      sprints.length > 0
                        ? sprints.map(sprint => {
                            return (
                              <option value={sprint.name}>{sprint.name}</option>
                            );
                          })
                        : <option disabled>No sprints</option>
                    }
                    </select>
                  : <React.Fragment>
                      <input
                        type="date"
                        value={startDate}
                        className="kanbn-burndown-settings-input kanbn-burndown-settings-start-date"
                        onChange={handleChangeStartDate}
                      />
                      <input
                        type="date"
                        value={endDate}
                        className="kanbn-burndown-settings-input kanbn-burndown-settings-end-date"
                        onChange={handleChangeEndDate}
                      />
                    </React.Fragment>
              }
              {hasSprints && <button
                type="button"
                className={[
                  'kanbn-header-button',
                  'kanbn-burndown-settings-sprint-mode',
                  sprintMode ? 'kanbn-header-button-active' : 'kanbn-header-button-inactive'
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
                  sprintMode ? 'kanbn-header-button-inactive' : 'kanbn-header-button-active'
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
            <XAxis
              dataKey="x"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              tickCount={6}
            />
            <YAxis />
            <Tooltip content={renderTooltip} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </React.Fragment>
  );
};

export default Burndown;
