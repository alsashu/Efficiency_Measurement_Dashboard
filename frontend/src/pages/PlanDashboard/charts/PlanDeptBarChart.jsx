import React from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useThemeStore } from '../../../store/useStore';

// Estimated/Actual are bars on the primary (left) axis; Effort Saved is a line
// on its own secondary (right) axis so it stays readable even though its
// values are an order of magnitude smaller — matches the Excel reference
// (screenshot/line denoting effert saved.jpeg) this was modeled on.
const COLORS = {
  estimated: { light: '#2a78d6', dark: '#3987e5' },
  actual: { light: '#eb6834', dark: '#d95926' },
  saved: { light: '#4a3aa7', dark: '#9085e9' },
};

function CustomTooltip({ active, payload, label, isDark }) {
  if (!active || !payload?.length) return null;
  const rows = [
    { key: 'estimated', label: 'Estimated Hrs', color: isDark ? COLORS.estimated.dark : COLORS.estimated.light },
    { key: 'actual', label: 'Actual Hrs', color: isDark ? COLORS.actual.dark : COLORS.actual.light },
    { key: 'saved', label: 'Effort Saved Hrs', color: isDark ? COLORS.saved.dark : COLORS.saved.light },
  ];
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{label}</p>
      {rows.map(r => {
        const entry = payload.find(p => p.dataKey === r.key);
        if (!entry) return null;
        return (
          <p key={r.key} className="flex items-center gap-2">
            <span className="inline-block w-3 h-0.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
            <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{entry.value.toLocaleString()} hrs</span>
            <span className="text-gray-500">{r.label}</span>
          </p>
        );
      })}
    </div>
  );
}

export default function PlanDeptBarChart({ data = [] }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';

  if (!data.length) {
    return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No department data available</div>;
  }

  const chartData = data.map(d => ({
    name: d.dept,
    estimated: Math.round(parseFloat(d.estimated_hrs || 0)),
    actual: Math.round(parseFloat(d.actual_hrs || 0)),
    saved: Math.round(parseFloat(d.effort_saved_hrs || 0)),
  }));

  const estimatedColor = isDark ? COLORS.estimated.dark : COLORS.estimated.light;
  const actualColor = isDark ? COLORS.actual.dark : COLORS.actual.light;
  const savedColor = isDark ? COLORS.saved.dark : COLORS.saved.light;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-gray-700" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={45} />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11 }}
          tickFormatter={v => `${(v / 1000).toFixed(0)}K`}
          label={{ value: 'Estimated / Actual Hrs', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={v => v.toLocaleString()}
          label={{ value: 'Effort Saved Hrs', angle: 90, position: 'insideRight', fontSize: 10, fill: '#9ca3af' }}
        />
        <Tooltip content={<CustomTooltip isDark={isDark} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
        <Bar yAxisId="left" dataKey="estimated" fill={estimatedColor} name="Estimated Hrs" barSize={24} radius={[3, 3, 0, 0]} />
        <Bar yAxisId="left" dataKey="actual" fill={actualColor} name="Actual Hrs" barSize={24} radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="saved"
          name="Effort Saved Hrs"
          stroke={savedColor}
          strokeWidth={2}
          dot={{ r: 4, fill: savedColor, stroke: isDark ? '#111827' : '#ffffff', strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
