import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import VSCodeApi from "./VSCodeApi";
import formatDate from 'dateformat';

const Burndown = ({ name, tasks, sprints, burndownData, vscode }: {
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
        y: number
      }>
    }>
  },
  vscode: VSCodeApi
}) => {
  const [sprintMode, setSprintMode] = useState(sprints.length > 0);
  const [sprint, setSprint] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const data = [
    {name: 'one', uv: 20},
    {name: 'two', uv: 80},
    {name: 'three', uv: 45},
    {name: 'four', uv: 32}
  ];

  return (
    <React.Fragment>
      <div className="kanbn-header">
        <h1 className="kanbn-header-name">
          <p>{name}</p>
          <div className="kanbn-burndown-settings">
            <form>
              {
                sprintMode
                  ? <select className="kanbn-burndown-settings-sprint-select" onChange={e => { console.log(e); }}>
                    {
                      sprints.length > 0
                        ? sprints.map((sprint, i) => {
                            return (
                              <option value={i}>{sprint.name}</option>
                            );
                          })
                        : <option disabled>No sprints</option>
                    }
                    </select>
                  : <React.Fragment>
                      <input
                        type="date"
                        className="kanbn-burndown-settings-input kanbn-burndown-settings-start-date"
                        onChange={e => { console.log(e); }}
                      />
                      <input
                        type="date"
                        className="kanbn-burndown-settings-input kanbn-burndown-settings-end-date"
                        onChange={e => { console.log(e); }}
                      />
                    </React.Fragment>
              }
              <button
                type="button"
                className={[
                  'kanbn-header-button',
                  'kanbn-burndown-settings-sprint-mode',
                  sprintMode ? 'kanbn-header-button-active' : 'kanbn-header-button-inactive'
                ].join(' ')}
                onClick={() => {
                  setSprintMode(true);
                  // update burndown chart
                }}
                title="View sprint burndown"
              >
                <i className="codicon codicon-rocket"></i>
              </button>
              <button
                type="button"
                className={[
                  'kanbn-header-button',
                  'kanbn-burndown-settings-date-mode',
                  sprintMode ? 'kanbn-header-button-inactive' : 'kanbn-header-button-active'
                ].join(' ')}
                onClick={() => {
                  setSprintMode(false);
                  // update burndown chart
                }}
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
          <LineChart data={data}>
            <Line type="monotone" dataKey="uv" stroke="#8884d8" />
            <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </React.Fragment>
  );
};

export default Burndown;
