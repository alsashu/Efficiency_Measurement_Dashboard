import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, yearsApi } from '../../services/api';
import { useFilterStore } from '../../store/useStore';
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell, ReferenceLine
} from 'recharts';
import { formatNumber, formatPct } from '../../utils/exportUtils';
import { RefreshCw } from 'lucide-react';

const COLORS = ['#1E3246','#DC3223','#19AA6E','#9B875F','#4B5A69','#73CDAA','#E15A50'];

const ChartCard = ({ title, subtitle, children, span = 1 }) => (
  <div className={`chart-container ${span === 2 ? 'lg:col-span-2' : ''}`}>
    <p className="section-title">{title}</p>
    {subtitle && <p className="section-subtitle mb-4">{subtitle}</p>}
    {children}
  </div>
);

export default function Analytics() {
  const { selectedYear, setYear } = useFilterStore();
  const [activeTab, setActiveTab] = useState('programs');
  const params = { year: selectedYear };

  const { data: years } = useQuery({ queryKey: ['years'], queryFn: () => yearsApi.getAll(), select: r => r.data });
  const { data: byProgram } = useQuery({ queryKey: ['analytics-program', params], queryFn: () => analyticsApi.getByProgram(params), select: r => r.data });
  const { data: byDept } = useQuery({ queryKey: ['analytics-dept', params], queryFn: () => analyticsApi.getByDepartment(params), select: r => r.data });
  const { data: trends } = useQuery({ queryKey: ['analytics-trends', params], queryFn: () => analyticsApi.getTrends(params), select: r => r.data });
  const { data: opps } = useQuery({ queryKey: ['analytics-opp', params], queryFn: () => analyticsApi.getOpportunities(params), select: r => r.data });
  const { data: topData } = useQuery({ queryKey: ['analytics-top-eff', params], queryFn: () => analyticsApi.getTopPrograms({ ...params, metric: 'efficiency', limit: 10 }), select: r => r.data });

  const progChartData = byProgram?.map(p => ({
    name: p.program_name,
    estimated: Math.round(parseFloat(p.estimated_hrs||0)),
    actual: Math.round(parseFloat(p.actual_hrs||0)),
    saved: Math.round(parseFloat(p.effort_saved||0)),
    efficiency: parseFloat(p.avg_efficiency||0).toFixed(1),
    pi: parseFloat(p.avg_pi||0).toFixed(2),
  })) || [];

  const deptChartData = byDept?.map(d => ({
    name: d.dept,
    estimated: Math.round(parseFloat(d.estimated_hrs||0)),
    actual: Math.round(parseFloat(d.actual_hrs||0)),
    saved: Math.round(parseFloat(d.effort_saved||0)),
    efficiency: parseFloat(d.avg_efficiency||0).toFixed(1),
  })) || [];

  const yearlyTrend = trends?.yearly?.map(d => ({
    year: d.year,
    estimated: Math.round(parseFloat(d.estimated_hrs||0)),
    actual: Math.round(parseFloat(d.actual_hrs||0)),
    saved: Math.round(parseFloat(d.effort_saved||0)),
    cost: parseFloat(d.cost_saved||0),
  })) || [];

  const TABS = ['programs','departments','trends','opportunities'];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="label">Fiscal Year</label>
          <select value={selectedYear||''} onChange={e => setYear(e.target.value||null)} className="input-field w-28">
            <option value="">All</option>
            {years?.map(y => <option key={y.year} value={y.year}>{y.year}</option>)}
          </select>
        </div>
        <button onClick={() => setYear(null)} className="btn-secondary text-xs mt-5"><RefreshCw size={12} /> Reset</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${activeTab===tab?'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm':'text-gray-500'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'programs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Estimated vs Actual Hours by Program" subtitle="Per program comparison" span={2}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={progChartData} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip formatter={v => v.toLocaleString() + ' hrs'} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="estimated" fill="#1E3246" name="Estimated Hrs" radius={[3,3,0,0]} />
                <Bar dataKey="actual" fill="#19AA6E" name="Actual Hrs" radius={[3,3,0,0]} />
                <Bar dataKey="saved" fill="#DC3223" name="Effort Saved" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Effort Variance by Program" subtitle="Hours under/over estimate">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={progChartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                <ReferenceLine x={0} stroke="#666" />
                <Tooltip formatter={v => v.toLocaleString() + ' hrs'} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="saved" radius={[0,3,3,0]}>
                  {progChartData.map((e, i) => <Cell key={i} fill={e.saved >= 0 ? '#19AA6E' : '#DC3223'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Productivity Index by Program" subtitle="PI ≥ 1 is on or under budget">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={progChartData} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                <ReferenceLine y={1} stroke="#9B875F" strokeDasharray="4 4" label={{ value: 'Target PI=1', fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="pi" radius={[3,3,0,0]} name="Productivity Index">
                  {progChartData.map((e, i) => <Cell key={i} fill={parseFloat(e.pi)>=1?'#19AA6E':'#DC3223'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Department Efficiency Comparison" span={2}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={deptChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="hrs" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <YAxis yAxisId="eff" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar yAxisId="hrs" dataKey="estimated" fill="#1E3246" name="Est Hrs" radius={[3,3,0,0]} />
                <Bar yAxisId="hrs" dataKey="actual" fill="#4B5A69" name="Act Hrs" radius={[3,3,0,0]} />
                <Bar yAxisId="hrs" dataKey="saved" fill="#19AA6E" name="Saved Hrs" radius={[3,3,0,0]} />
                <Line yAxisId="eff" type="monotone" dataKey="efficiency" stroke="#DC3223" name="% Efficiency" strokeWidth={2} dot />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="grid grid-cols-1 gap-4">
          <ChartCard title="Year-over-Year Trends" subtitle="Annual hours and cost performance">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={yearlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="hrs" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `€${(v/1000).toFixed(0)}K`} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line yAxisId="hrs" type="monotone" dataKey="estimated" stroke="#1E3246" strokeWidth={2} dot name="Est Hrs" />
                <Line yAxisId="hrs" type="monotone" dataKey="actual" stroke="#19AA6E" strokeWidth={2} dot name="Act Hrs" />
                <Line yAxisId="hrs" type="monotone" dataKey="saved" stroke="#DC3223" strokeWidth={2} dot name="Saved Hrs" />
                <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="#9B875F" strokeWidth={2} dot name="Cost Saved €" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {activeTab === 'opportunities' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Opportunity Category Breakdown" span={2}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={opps?.filter(o => o.value > 0)} layout="vertical" margin={{ left: 160 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={155} />
                <Tooltip formatter={v => [v.toLocaleString() + ' hrs', 'Hours Saved']} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[0,4,4,0]}>
                  {opps?.filter(o => o.value > 0).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
