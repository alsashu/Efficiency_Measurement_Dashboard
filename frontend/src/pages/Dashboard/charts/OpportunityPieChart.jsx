import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#1E3246','#DC3223','#19AA6E','#9B875F','#4B5A69','#73CDAA','#E15A50','#AFA082','#264058','#2dc484'];

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold">{`${(percent * 100).toFixed(0)}%`}</text>;
};

export default function OpportunityPieChart({ data = [] }) {
  const chartData = data.filter(d => d.value > 0).map(d => ({
    name: d.name,
    value: Math.round(d.value),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={chartData} cx="50%" cy="50%" outerRadius={100} dataKey="value" labelLine={false} label={renderLabel}>
          {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip
          formatter={(value) => [value.toLocaleString() + ' hrs', 'Hours Saved']}
          contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
