import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#1E3246','#DC3223','#19AA6E','#9B875F','#4B5A69','#73CDAA','#E15A50'];

export default function DeptBarChart({ data = [] }) {
  const chartData = data.map(d => ({
    name: d.dept,
    saved: Math.round(parseFloat(d.effort_saved || 0)),
    efficiency: parseFloat(d.avg_efficiency || 0).toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-gray-700" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
        <Tooltip
          formatter={(value, name) => [value.toLocaleString() + ' hrs', 'Effort Saved']}
          contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="saved" radius={[4, 4, 0, 0]}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
