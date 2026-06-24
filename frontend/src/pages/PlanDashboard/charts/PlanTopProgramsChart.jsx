import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const COLORS = ['#1E3246','#DC3223','#19AA6E','#9B875F','#4B5A69','#73CDAA','#E15A50','#3B82F6','#F59E0B','#8B5CF6'];

export default function PlanTopProgramsChart({ data = [] }) {
  if (!data.length) {
    return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No program data available</div>;
  }

  const chartData = data.slice(0, 10).map(d => ({
    name: d.program_name?.length > 20 ? d.program_name.substring(0, 20) + '…' : d.program_name,
    fullName: d.program_name,
    value: Math.round(parseFloat(d.metric_value || 0)),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={150} />
        <Tooltip
          formatter={(v, name, props) => [v.toLocaleString() + ' hrs', props.payload.fullName]}
          contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
