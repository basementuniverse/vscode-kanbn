import React from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

const Burndown = ({ name, tasks, sprints, burndownData }: {
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
  }
}) => {
  const data = [
    {name: 'one', uv: 20},
    {name: 'two', uv: 80},
    {name: 'three', uv: 45},
    {name: 'four', uv: 32}
  ];

  return (
    <React.Fragment>
      <div>burndown chart</div>
      <LineChart width={600} height={300} data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <Line type="monotone" dataKey="uv" stroke="#8884d8" />
        <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
      </LineChart>
    </React.Fragment>
  );
};

export default Burndown;
