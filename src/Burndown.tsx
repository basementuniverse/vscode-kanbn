import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import VSCodeApi from "./VSCodeApi";
import formatDate from 'dateformat';
import dateFormat from 'dateformat';

const Burndown = ({ name, tasks, sprints, burndownData, dateFormat, vscode }: {
  name: string,
  tasks: Record<string, KanbnTask>,
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
  const [sprint, setSprint] = useState(sprintMode ? burndownData.series[0].sprint.name : '');
  const [startDate, setStartDate] = useState(sprintMode ? '' : formatDate(burndownData.series[0].from, 'yyyy-mm-dd'));
  const [endDate, setEndDate] = useState(sprintMode ? '' : formatDate(burndownData.series[0].to, 'yyyy-mm-dd'));
  const [assigned, setAssigned] = useState('');

  const refreshBurndownData = () => {
    vscode.postMessage({
      command: 'kanbn.refreshBurndownData',
      sprintMode,
      sprint,
      startDate,
      endDate,
      assigned
    });
  };

  const handleChangeSprint = ({ target: { value }}) => {
    setSprint(value);
    refreshBurndownData();
  };

  const handleChangeStartDate = ({ target: { value }}) => {
    setStartDate(value);
    refreshBurndownData();
  };

  const handleChangeEndDate = ({ target: { value }}) => {
    setEndDate(value);
    refreshBurndownData();
  };

  const handleClickSprintMode = () => {
    setSprintMode(true);
    refreshBurndownData();
  };

  const handleClickDateMode = () => {
    setSprintMode(false);
    refreshBurndownData();
  };

  const chartMin = Date.parse(burndownData.series[0].from);
  const chartMax = Date.parse(burndownData.series[0].to);
  const chartData = burndownData.series[0].dataPoints.map(dataPoint => ({
    x: Date.parse(dataPoint.x),
    y: dataPoint.y,
    'Active tasks': dataPoint.count,
    'Activity': dataPoint.tasks.map(task => `${task.eventType} ${task.taskId}`).join('\n')
  }));

  const formatXAxis = date => formatDate(date, dateFormat);

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
            <Line className="kanbn-burndown-line" type="monotone" dataKey="y" />
            <CartesianGrid className="kanbn-burndown-grid" strokeDasharray="5 5" vertical={false} />
            <XAxis dataKey="x" type="number" domain={[chartMin, chartMax]} tickFormatter={formatXAxis} />
            <YAxis />
            <Tooltip />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </React.Fragment>
  );
};

export default Burndown;
