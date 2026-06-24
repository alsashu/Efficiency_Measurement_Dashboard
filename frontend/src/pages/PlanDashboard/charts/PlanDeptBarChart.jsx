import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

const COLORS = ['#1E3246','#DC3223','#19AA6E','#9B875F','#4B5A69','#73CDAA','#E15A50'];

export default function PlanDeptBarChart({ data = [] }) {
  if (!data.length) {
    return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No department data available</div>;
  }

  const chartData = data.map(d => ({
    name: d.dept,
    estimated: Math.round(parseFloat(d.estimated_hrs || 0)),
    actual: Math.round(parseFloat(d.actual_hrs || 0)),
    saved: Math.round(parseFloat(d.effort_saved_hrs || 0)),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ left: 0, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={45} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip formatter={(v, name) => [v.toLocaleString() + ' hrs', name]} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
        <Bar dataKey="estimated" fill="#1E3246" name="Estimated Hrs" radius={[3, 3, 0, 0]} />
        <Bar dataKey="actual" fill="#19AA6E" name="Actual Hrs" radius={[3, 3, 0, 0]} />
        <Bar dataKey="saved" fill="#DC3223" name="Effort Saved Hrs" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
