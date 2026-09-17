import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { formatNumber, formatPct } from '../../utils/exportUtils';

function toDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-xl shadow-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden" style={{ width: 280 }}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-carbon">
        <span className="text-[13px] font-bold text-white tracking-wide">Efficiency Plan</span>
        <span className="text-[11px] font-medium text-white/70">{d.program_name}{d.dept ? ` | ${d.dept}` : ''}</span>
      </div>
      <div className="px-4 py-3 space-y-1">
        <Row label="Baseline (BL)" value={d.label} />
        <Row label="Estimated Hrs" value={`${formatNumber(d.estimated_hrs)} Hrs`} />
        <Row label="Actual Hrs" value={`${formatNumber(d.actual_hrs)} Hrs`} />
        <Row label="Variance" value={`${formatNumber(d.effort_variance)} Hrs`} warn={parseFloat(d.effort_variance) < 0} />
        <div className="my-1.5 border-t border-gray-100 dark:border-gray-700" />
        <Row label="Savings" value={`${formatNumber(d.savings)} Hrs`} />
        <Row label="Efficiency" value={d.efficiency != null ? formatPct(d.efficiency) : '—'} />
      </div>
    </div>
  );
}

function Row({ label, value, warn }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-[12.5px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums text-right ${warn ? 'text-rose-600 dark:text-rose-400' : 'text-gray-800 dark:text-gray-100'}`}>
        {value}
      </span>
    </div>
  );
}

export default function EfficiencySavingsChart({ programs, startDate, endDate, isDark }) {
  const { chartData, baselinePct } = useMemo(() => {
    const intervalStart = startDate ? startOfDay(startDate) : null;
    const intervalEnd = endDate ? endOfDay(endDate) : null;

    const flat = [];
    for (const p of programs || []) {
      for (const r of p.planRecords || []) {
        const start = toDate(r.baseline_start);
        const end = toDate(r.baseline_end);
        if (!start || !end) continue;
        if (intervalStart && end < intervalStart) continue;
        if (intervalEnd && start > intervalEnd) continue;
        flat.push({
          _start: start,
          label: r.baseline || '—',
          dept: p.dept,
          program_name: p.program_name,
          efficiency: r.efficiency_pct != null ? parseFloat(r.efficiency_pct) : 0,
          savings: parseFloat(r.savings_hrs) || 0,
          estimated_hrs: r.estimated_hrs,
          actual_hrs: r.actual_hrs,
          effort_variance: r.effort_variance,
        });
      }
    }
    flat.sort((a, b) => a._start - b._start);

    // Baseline (%) reference line = Achieved Efficiency over the same filtered
    // baselines shown in this chart (locked rule): ΣSavings ÷ ΣEstimated × 100.
    const totalSavings = flat.reduce((s, r) => s + (parseFloat(r.savings) || 0), 0);
    const totalEstimated = flat.reduce((s, r) => s + (parseFloat(r.estimated_hrs) || 0), 0);
    const baselinePct = totalEstimated > 0 ? parseFloat(((totalSavings / totalEstimated) * 100).toFixed(1)) : 0;

    return { chartData: flat, baselinePct };
  }, [programs, startDate, endDate]);

  const axisColor = isDark ? '#9ca3af' : '#6b7280';
  const gridColor = isDark ? '#374151' : '#e5e7eb';

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 size={18} className="text-carbon dark:text-blue-400" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Efficiency, Savings and Baseline</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Efficiency (%) with Savings (Hrs) and Baseline, per Efficiency Plan baseline
      </p>

      {!chartData.length ? (
        <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
          No Efficiency Plan baselines in the selected filters
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={380}>
          <ComposedChart data={chartData} margin={{ top: 28, right: 30, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: axisColor }}
              angle={-20}
              textAnchor="end"
              height={55}
              label={{ value: 'Baseline', position: 'insideBottom', offset: -32, fontSize: 12, fill: axisColor }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: axisColor }}
              tickFormatter={v => `${v}%`}
              label={{ value: 'Efficiency (%)', angle: -90, position: 'insideLeft', fontSize: 12, fill: axisColor }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: axisColor }}
              tickFormatter={v => formatNumber(v)}
              label={{ value: 'Savings (Hrs)', angle: 90, position: 'insideRight', fontSize: 12, fill: axisColor }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <ReferenceLine
              yAxisId="left"
              y={baselinePct}
              stroke="#DC3223"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: `Baseline: ${baselinePct}%`, position: 'insideTopRight', fontSize: 10, fill: '#DC3223' }}
            />
            <Bar yAxisId="left" dataKey="efficiency" name="Efficiency (%)" fill="#1E3246" radius={[4, 4, 0, 0]} maxBarSize={56}>
              <LabelList dataKey="efficiency" position="top" formatter={v => `${v.toFixed(1)}%`} fontSize={10} fill={axisColor} />
            </Bar>
            <Line yAxisId="right" dataKey="savings" name="Savings (Hrs)" stroke="#19AA6E" strokeWidth={2.5} dot={{ r: 4, fill: '#19AA6E' }}>
              <LabelList dataKey="savings" position="top" formatter={v => formatNumber(v)} fontSize={10} fill="#19AA6E" />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
