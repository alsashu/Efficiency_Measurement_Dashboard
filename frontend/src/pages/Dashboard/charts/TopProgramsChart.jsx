import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function TopProgramsChart({ data = [] }) {
  const chartData = data.map(d => ({
    name: d.program_name,
    saved: Math.round(parseFloat(d.metric_value || 0)),
    dept: d.dept,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
        <Tooltip
          formatter={(v, n) => [v.toLocaleString() + ' hrs', 'Effort Saved']}
          contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
        />
        <Bar dataKey="saved" radius={[0, 4, 4, 0]}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={`hsl(${200 + i * 15}, 60%, ${45 - i * 2}%)`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
