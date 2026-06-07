import React from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function TrendChart({ data = [], year, uploadId }) {
  const chartData = data.map(d => ({
    period: `${parseInt(d.year)} Q${parseInt(d.quarter)}`,
    estimated: Math.round(parseFloat(d.estimated_hrs || 0)),
    actual: Math.round(parseFloat(d.actual_hrs || 0)),
    saved: Math.round(parseFloat(d.effort_saved || 0)),
  }));

  if (!chartData.length) {
    const reason = year
      ? `No programs with baseline dates found for FY ${year}${uploadId ? ' in the selected upload version' : ''}.`
      : uploadId
        ? 'No baseline date data found in the selected upload version.'
        : 'No baseline date data available across any upload.';
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2">
        <p className="text-sm text-gray-400">No quarterly trend data to display</p>
        <p className="text-xs text-gray-300 dark:text-gray-600 max-w-sm text-center">{reason}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="colorEst" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#1E3246" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#1E3246" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorAct" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#19AA6E" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#19AA6E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-gray-700" />
        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v} />
        <Tooltip
          formatter={(v, n) => [v.toLocaleString() + ' hrs', n]}
          contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
        <Area type="monotone" dataKey="estimated" stroke="#1E3246" fill="url(#colorEst)" name="Estimated Hrs" strokeWidth={2} />
        <Area type="monotone" dataKey="actual" stroke="#19AA6E" fill="url(#colorAct)" name="Actual Hrs" strokeWidth={2} />
        <Line type="monotone" dataKey="saved" stroke="#DC3223" name="Effort Saved" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
