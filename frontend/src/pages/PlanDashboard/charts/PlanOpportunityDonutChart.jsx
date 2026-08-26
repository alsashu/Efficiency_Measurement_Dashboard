import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useThemeStore } from '../../../store/useStore';

// Fixed category -> color mapping, keyed by DB field (identity), never by sort
// rank — so re-filtering the dashboard never repaints which category owns which
// hue. Slots 1-8 are a validated CVD-safe categorical theme (adjacent ΔE >= 8
// OKLab, normal-vision floor >= 15, both light & dark surfaces). 10 named
// categories exceed the 8-hue CVD-safe ceiling, so slots 9-10 reuse hue 1 & 2
// with a diagonal-hatch texture overlay (composite hue x texture encoding) —
// identity for every slice still comes from the legend/tooltip text, never
// from color alone.
const CATEGORY_META = [
  { key: 'reuse_library', light: '#2a78d6', dark: '#3987e5' },
  { key: 'tech_competency', light: '#008300', dark: '#008300' },
  { key: 'ai_copilot', light: '#e87ba4', dark: '#d55181' },
  { key: 'automation_testing', light: '#eda100', dark: '#c98500' },
  { key: 'automation_reviews', light: '#1baf7a', dark: '#199e70' },
  { key: 'automation_cicd', light: '#eb6834', dark: '#d95926' },
  { key: 'automation_others', light: '#4a3aa7', dark: '#9085e9' },
  { key: 'simulators_tools', light: '#e34948', dark: '#e66767' },
  { key: 'sdlc_improvement', light: '#2a78d6', dark: '#3987e5', textured: 'hatch-1' },
  { key: 'inefficiency_reduction', light: '#008300', dark: '#008300', textured: 'hatch-2' },
];
const META_BY_KEY = Object.fromEntries(CATEGORY_META.map(m => [m.key, m]));

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight="bold">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{d.name}</p>
      <p className="text-gray-600 dark:text-gray-300">
        Count: <span className="font-semibold text-gray-900 dark:text-white">{d.value.toLocaleString()} hrs</span>
      </p>
      <p className="text-gray-600 dark:text-gray-300">
        Percentage: <span className="font-semibold text-gray-900 dark:text-white">{d.percentage}%</span>
      </p>
    </div>
  );
}

// Legend doubles as a compact table (swatch + name + hours + %) — mitigates the
// >7-slice pie/donut concern by keeping every value reachable as text, not just
// via hover, and is click-to-toggle for slice visibility.
function InteractiveLegend({ items, hidden, onToggle, isDark }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-3 max-h-40 overflow-y-auto pr-1">
      {items.map(d => {
        const meta = META_BY_KEY[d.key];
        const color = isDark ? meta.dark : meta.light;
        const isHidden = hidden.has(d.key);
        return (
          <button
            key={d.key}
            onClick={() => onToggle(d.key)}
            className={`flex items-center gap-2 text-left text-[11px] px-1.5 py-1 rounded transition-opacity hover:bg-gray-50 dark:hover:bg-gray-800 ${isHidden ? 'opacity-40' : ''}`}
            title={isHidden ? `Show ${d.name}` : `Hide ${d.name}`}
          >
            {meta.textured ? (
              // A CSS `url(#id)` can't reach a <pattern> defined in the chart's
              // own SVG document, so the swatch carries a self-contained pattern.
              <svg width="10" height="10" className="flex-shrink-0">
                <defs>
                  <pattern id={`legend-${meta.textured}`} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
                    <rect width="4" height="4" fill={color} />
                    <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
                  </pattern>
                </defs>
                <circle cx="5" cy="5" r="5" fill={`url(#legend-${meta.textured})`} />
              </svg>
            ) : (
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
            )}
            <span className="flex-1 truncate text-gray-600 dark:text-gray-300">{d.name}</span>
            <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{d.value.toLocaleString()}</span>
            <span className="text-gray-400 tabular-nums w-10 text-right">{d.percentage}%</span>
          </button>
        );
      })}
    </div>
  );
}

export default function PlanOpportunityDonutChart({ data = [] }) {
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [hidden, setHidden] = useState(new Set());

  if (!data.length || data.every(d => parseFloat(d.value) <= 0)) {
    return <div className="h-72 flex items-center justify-center text-gray-400 text-sm">No opportunity-category data available</div>;
  }

  const toggle = (key) => {
    setHidden(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const legendItems = data.map(d => ({ ...d, value: Math.round(parseFloat(d.value || 0)) }));
  const chartData = legendItems.filter(d => d.value > 0 && !hidden.has(d.key));

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <defs>
            {['hatch-1', 'hatch-2'].map((id, i) => {
              const base = i === 0 ? (isDark ? '#3987e5' : '#2a78d6') : (isDark ? '#008300' : '#008300');
              return (
                <pattern key={id} id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={base} />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
                </pattern>
              );
            })}
          </defs>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={100}
            paddingAngle={1}
            dataKey="value"
            nameKey="name"
            labelLine={false}
            label={renderLabel}
            isAnimationActive={false}
          >
            {chartData.map((d) => {
              const meta = META_BY_KEY[d.key];
              const fill = meta.textured ? `url(#${meta.textured})` : (isDark ? meta.dark : meta.light);
              return <Cell key={d.key} fill={fill} stroke={isDark ? '#111827' : '#ffffff'} strokeWidth={2} />;
            })}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <InteractiveLegend items={legendItems} hidden={hidden} onToggle={toggle} isDark={isDark} />
    </div>
  );
}
