import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Zap, TrendingDown, Target, DollarSign,
  ChevronUp, ChevronDown, ChevronsUpDown, Filter,
} from 'lucide-react';
import { PageLoader } from '../../components/ui/LoadingSpinner';

// ── Compression tier config ────────────────────────────────────────────────
const TIER_COLORS = {
  High:    '#19AA6E',
  Medium:  '#1E3246',
  Low:     '#9B875F',
  Minimal: '#4B5A69',
  Overrun: '#DC3223',
};

const TIER_LABELS = {
  High: '≥ 20%', Medium: '10–20%', Low: '5–10%', Minimal: '0–5%', Overrun: '< 0%',
};

function getTier(rate) {
  if (rate >= 20) return 'High';
  if (rate >= 10) return 'Medium';
  if (rate >= 5)  return 'Low';
  if (rate >= 0)  return 'Minimal';
  return 'Overrun';
}

function TierBadge({ tier }) {
  const cls = {
    High:    'bg-greenline/10 text-greenline',
    Medium:  'bg-carbon/10 text-carbon dark:bg-carbon/30 dark:text-blue-300',
    Low:     'bg-gold/10 text-gold',
    Minimal: 'bg-steel/10 text-steel dark:text-gray-400',
    Overrun: 'bg-vibrant/10 text-vibrant',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls[tier]}`}>
      {tier}
    </span>
  );
}

function SortIcon({ field, sortBy, dir }) {
  if (sortBy !== field) return <ChevronsUpDown size={11} className="opacity-30" />;
  return dir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
}

const RechartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs max-w-xs">
      {label && <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1 truncate">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>
          {p.name}: <span className="font-medium">{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{p.unit ?? ''}</span>
        </p>
      ))}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────
export default function ProgramCompression({ params }) {
  const [sortBy, setSortBy]     = useState('compression_rate');
  const [sortDir, setSortDir]   = useState('desc');
  const [deptFilter, setDeptFilter] = useState('');

  const { data: programData, isLoading } = useQuery({
    queryKey: ['analytics-by-program', params],
    queryFn:  () => analyticsApi.getByProgram(params),
    select:   r => r.data,
    staleTime: 2 * 60 * 1000,
  });

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary', params],
    queryFn:  () => analyticsApi.getSummary(params),
    select:   r => r.data,
  });

  const { data: oppData } = useQuery({
    queryKey: ['analytics-opp', params],
    queryFn:  () => analyticsApi.getOpportunities(params),
    select:   r => r.data,
  });

  // Enrich each program with derived compression metrics
  const programs = useMemo(() => {
    if (!programData) return [];
    return programData.map(p => {
      const est  = parseFloat(p.estimated_hrs || 0);
      const act  = parseFloat(p.actual_hrs    || 0);
      const saved = parseFloat(p.effort_saved || 0);
      const rate  = est > 0 ? (saved / est) * 100 : 0;
      return {
        ...p,
        estimated_hrs: est,
        actual_hrs:    act,
        effort_saved:  saved,
        cost_saved:    parseFloat(p.cost_saved || 0),
        avg_pi:        parseFloat(p.avg_pi    || 0),
        compression_rate: rate,
        tier: getTier(rate),
      };
    });
  }, [programData]);

  const departments = useMemo(
    () => [...new Set(programs.map(p => p.dept).filter(Boolean))].sort(),
    [programs],
  );

  const filtered = useMemo(() => {
    const base = deptFilter ? programs.filter(p => p.dept === deptFilter) : programs;
    return [...base].sort((a, b) => {
      const av = typeof a[sortBy] === 'string' ? a[sortBy] : (a[sortBy] ?? 0);
      const bv = typeof b[sortBy] === 'string' ? b[sortBy] : (b[sortBy] ?? 0);
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [programs, deptFilter, sortBy, sortDir]);

  // ── Derived values for KPI strip ─────────────────────────────────────────
  const totalEst      = parseFloat(summary?.total_estimated_hrs || 0);
  const totalSaved    = parseFloat(summary?.total_effort_saved  || 0);
  const totalCost     = parseFloat(summary?.total_cost_saved    || 0);
  const overallRate   = totalEst > 0 ? ((totalSaved / totalEst) * 100).toFixed(1) : '0.0';
  const highMedCount  = programs.filter(p => p.tier === 'High' || p.tier === 'Medium').length;

  // ── Chart datasets ────────────────────────────────────────────────────────
  const tierPieData = useMemo(() => {
    const counts = {};
    programs.forEach(p => { counts[p.tier] = (counts[p.tier] || 0) + 1; });
    return Object.entries(TIER_COLORS)
      .map(([name, fill]) => ({ name, value: counts[name] || 0, fill }))
      .filter(d => d.value > 0);
  }, [programs]);

  const topByRate = useMemo(() =>
    [...programs]
      .sort((a, b) => b.compression_rate - a.compression_rate)
      .slice(0, 15)
      .map(p => ({
        name: p.program_name?.length > 24 ? p.program_name.slice(0, 24) + '…' : (p.program_name || '—'),
        rate: parseFloat(p.compression_rate.toFixed(1)),
        tier: p.tier,
      })),
  [programs]);

  const topByVolume = useMemo(() =>
    [...programs]
      .sort((a, b) => b.estimated_hrs - a.estimated_hrs)
      .slice(0, 12)
      .map(p => ({
        name: p.program_name?.length > 18 ? p.program_name.slice(0, 18) + '…' : (p.program_name || '—'),
        estimated: Math.round(p.estimated_hrs),
        actual:    Math.round(p.actual_hrs),
      })),
  [programs]);

  const oppSources = useMemo(() =>
    (oppData || [])
      .filter(o => parseFloat(o.value) > 0)
      .slice(0, 8)
      .map(o => ({
        name:  o.name.length > 30 ? o.name.slice(0, 30) + '…' : o.name,
        value: Math.round(parseFloat(o.value)),
        pct:   parseFloat(o.percentage),
      })),
  [oppData]);

  function toggleSort(field) {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  }

  if (isLoading) return <PageLoader />;

  // ── KPI cards config ──────────────────────────────────────────────────────
  const kpis = [
    {
      label: 'Overall Compression Rate',
      value: `${overallRate}%`,
      sub: `${Math.round(totalSaved).toLocaleString()} hrs saved`,
      icon: Zap,
      border: 'border-gold',
      valueColor: 'text-gold',
    },
    {
      label: 'Total Hours Compressed',
      value: Math.round(totalSaved).toLocaleString(),
      sub: `of ${Math.round(totalEst).toLocaleString()} estimated`,
      icon: TrendingDown,
      border: 'border-greenline',
      valueColor: 'text-greenline',
    },
    {
      label: 'Programs ≥ 10% Compressed',
      value: highMedCount,
      sub: `out of ${programs.length} total`,
      icon: Target,
      border: 'border-carbon',
      valueColor: 'text-carbon dark:text-blue-400',
    },
    {
      label: 'Total Cost Saved',
      value: `€${(totalCost / 1000).toFixed(0)}K`,
      sub: 'material & other savings',
      icon: DollarSign,
      border: 'border-vibrant',
      valueColor: 'text-vibrant',
    },
  ];

  // ── Table column config ───────────────────────────────────────────────────
  const COLS = [
    { key: 'program_name',     label: 'Program Name',   align: 'left'  },
    { key: 'dept',             label: 'Department',     align: 'left'  },
    { key: 'estimated_hrs',    label: 'Est. Hrs',       align: 'right' },
    { key: 'actual_hrs',       label: 'Actual Hrs',     align: 'right' },
    { key: 'effort_saved',     label: 'Hours Saved',    align: 'right' },
    { key: 'compression_rate', label: 'Compression %',  align: 'right' },
    { key: 'avg_pi',           label: 'Prod. Index',    align: 'right' },
    { key: 'tier',             label: 'Tier',           align: 'center'},
  ];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap size={20} className="text-gold" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Program Level Compression
          </h2>
          <span className="badge-warning">Compression Analysis</span>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400" />
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="input-field w-44 text-xs"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`card p-4 border-l-4 ${k.border}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 truncate">{k.label}</p>
                <p className={`text-2xl font-bold ${k.valueColor}`}>{k.value}</p>
                <p className="text-xs text-gray-400 mt-1 truncate">{k.sub}</p>
              </div>
              <k.icon size={18} className={`${k.valueColor} opacity-50 ml-2 mt-0.5 flex-shrink-0`} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 1: Tier Donut + Top Programs by Rate ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Tier Distribution */}
        <div className="chart-container">
          <p className="section-title">Compression Tier Distribution</p>
          <p className="section-subtitle mb-4">Programs grouped by compression rate achieved</p>
          {tierPieData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-gray-400">No data available</div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={190}>
                  <PieChart>
                    <Pie
                      data={tierPieData}
                      cx="50%" cy="50%"
                      innerRadius={52} outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {tierPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg shadow-lg p-2 text-xs">
                            <p className="font-semibold" style={{ color: d.fill }}>{d.name}</p>
                            <p className="text-gray-600 dark:text-gray-300">{d.value} programs ({TIER_LABELS[d.name]})</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1 min-w-0">
                  {Object.entries(TIER_COLORS).map(([name, color]) => {
                    const found = tierPieData.find(d => d.name === name);
                    const count = found?.value ?? 0;
                    return (
                      <div key={name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-xs text-gray-600 dark:text-gray-300 truncate">{name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">{TIER_LABELS[name]}</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 flex-shrink-0">{count}</span>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between">
                    <span className="text-xs text-gray-500">Total Programs</span>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{programs.length}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top 15 by Compression Rate */}
        <div className="chart-container">
          <p className="section-title">Top Programs by Compression Rate</p>
          <p className="section-subtitle mb-4">Effort saved as % of estimated hours — colour coded by tier</p>
          {topByRate.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-gray-400">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={290}>
              <BarChart
                data={topByRate}
                layout="vertical"
                margin={{ top: 2, right: 45, left: 95, bottom: 2 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" className="dark:stroke-gray-700" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={v => `${v}%`}
                  domain={[0, 'dataMax + 5']}
                />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                <Tooltip
                  content={<RechartTooltip />}
                  formatter={(v) => [`${v}%`, 'Compression Rate']}
                />
                <Bar dataKey="rate" name="Compression Rate" radius={[0, 4, 4, 0]}
                  label={{ position: 'right', fontSize: 9, fill: '#6b7280', formatter: v => `${v}%` }}
                >
                  {topByRate.map((d, i) => <Cell key={i} fill={TIER_COLORS[d.tier]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Row 2: Estimated vs Actual Comparison ───────────────────────── */}
      <div className="chart-container">
        <p className="section-title">Estimated vs Actual Hours — Top Programs by Volume</p>
        <p className="section-subtitle mb-4">
          Side-by-side comparison of planned vs delivered effort. The gap between bars represents compression achieved.
        </p>
        {topByVolume.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-gray-400">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={topByVolume} margin={{ top: 5, right: 20, left: 10, bottom: 55 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, angle: -38, textAnchor: 'end' }}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
              />
              <Tooltip
                content={<RechartTooltip />}
                formatter={(v, n) => [`${v.toLocaleString()} hrs`, n]}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="estimated" name="Estimated Hrs" fill="#1E3246" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual"    name="Actual Hrs"    fill="#19AA6E" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Row 3: Compression Sources ──────────────────────────────────── */}
      {oppSources.length > 0 && (
        <div className="chart-container">
          <p className="section-title">Compression Sources</p>
          <p className="section-subtitle mb-4">
            Hours saved by efficiency opportunity type across all programs
          </p>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={oppSources} layout="vertical" margin={{ top: 5, right: 65, left: 155, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => v.toLocaleString()} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={150} />
              <Tooltip
                content={<RechartTooltip />}
                formatter={(v) => [`${v.toLocaleString()} hrs`, 'Hours Saved']}
              />
              <Bar dataKey="value" name="Hours Saved" radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 9, fill: '#6b7280', formatter: v => v.toLocaleString() }}
              >
                {oppSources.map((_, i) => (
                  <Cell key={i} fill={`hsl(${195 + i * 17}, ${56 - i * 2}%, ${40 + i * 2}%)`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Row 4: Program Detail Table ─────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <p className="section-title mb-0">Program Compression Detail</p>
          <p className="section-subtitle">
            {filtered.length} program{filtered.length !== 1 ? 's' : ''}
            {deptFilter ? ` · ${deptFilter}` : ''} — click column headers to sort
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {COLS.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap text-${col.align}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      {col.label}
                      <SortIcon field={col.key} sortBy={sortBy} dir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filtered.slice(0, 60).map((p, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100 max-w-[200px]">
                    <span className="block truncate" title={p.program_name}>{p.program_name || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">{p.dept || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {Math.round(p.estimated_hrs).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {Math.round(p.actual_hrs).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-greenline tabular-nums">
                    {Math.round(p.effort_saved).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums"
                    style={{ color: TIER_COLORS[p.tier] }}>
                    {p.compression_rate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {p.avg_pi.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <TierBadge tier={p.tier} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No programs match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filtered.length > 60 && (
            <p className="text-xs text-gray-400 text-center py-3 border-t border-gray-50 dark:border-gray-800">
              Showing 60 of {filtered.length} programs. Use the department filter to narrow results.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
