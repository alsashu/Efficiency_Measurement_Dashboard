import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export default function PlanTrendChart({ data = [] }) {
  if (!data.length) {
    return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No trend data available</div>;
  }

  const chartData = data.map(d => ({
    label: `${d.year} Q${d.quarter}`,
    estimated: Math.round(parseFloat(d.estimated_hrs || 0)),
    actual: Math.round(parseFloat(d.actual_hrs || 0)),
    saved: Math.round(parseFloat(d.effort_saved_hrs || 0)),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={40} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip formatter={v => v.toLocaleString() + ' hrs'} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Line type="monotone" dataKey="estimated" stroke="#1E3246" strokeWidth={2} dot name="Estimated Hrs" />
        <Line type="monotone" dataKey="actual" stroke="#19AA6E" strokeWidth={2} dot name="Actual Hrs" />
        <Line type="monotone" dataKey="saved" stroke="#DC3223" strokeWidth={2} dot name="Effort Saved Hrs" />
      </LineChart>
    </ResponsiveContainer>
  );
}
