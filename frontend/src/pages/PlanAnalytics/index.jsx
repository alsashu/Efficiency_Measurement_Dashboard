import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { planAnalyticsApi } from '../../services/planApi';
import { usePlanFilterStore } from '../../store/useStore';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { formatNumber } from '../../utils/exportUtils';
import { RefreshCw, Calendar } from 'lucide-react';

const COLORS = ['#1E3246', '#DC3223', '#19AA6E', '#9B875F', '#4B5A69', '#73CDAA', '#E15A50'];

const ChartCard = ({ title, subtitle, children, span = 1 }) => (
  <div className={`chart-container ${span === 2 ? 'lg:col-span-2' : ''}`}>
    <p className="section-title">{title}</p>
    {subtitle && <p className="section-subtitle mb-4">{subtitle}</p>}
    {children}
  </div>
);

const PERIOD_OPTIONS = [
  { value: 'calendar', label: 'Calendar Year' },
  { value: 'financial', label: 'Financial Year' },
];

export default function PlanAnalytics() {
  const { periodType, periodYear, selectedUploadId, setPeriodType, setPeriodYear } = usePlanFilterStore();
  const [activeTab, setActiveTab] = useState('departments');

  const { data: yearOpts } = useQuery({
    queryKey: ['plan-period-options'],
    queryFn: () => planAnalyticsApi.getPeriodOptions(),
    select: r => r.data,
  });

  const params = { periodType, periodYear: periodYear || undefined, uploadId: selectedUploadId || undefined };

  const { data: byDept } = useQuery({
    queryKey: ['plan-analytics-dept', params],
    queryFn: () => planAnalyticsApi.getByDepartment(params),
    select: r => r.data,
  });

  const { data: byProgram } = useQuery({
    queryKey: ['plan-analytics-program', params],
    queryFn: () => planAnalyticsApi.getByProgram(params),
    select: r => r.data,
  });

  const { data: trends } = useQuery({
    queryKey: ['plan-analytics-trends', params],
    queryFn: () => planAnalyticsApi.getTrends(params),
    select: r => r.data,
  });

  const currentYearOptions = periodType === 'financial'
    ? (yearOpts?.financialYears || [])
    : (yearOpts?.calendarYears || []).map(y => ({ value: y, label: String(y) }));

  const deptData = (byDept || []).map(d => ({
    name: d.dept,
    estimated: Math.round(parseFloat(d.estimated_hrs || 0)),
    actual: Math.round(parseFloat(d.actual_hrs || 0)),
    saved: Math.round(parseFloat(d.effort_saved_hrs || 0)),
    pi: parseFloat(d.avg_pi || 0).toFixed(2),
  }));

  const programData = (byProgram || []).map(p => ({
    name: p.program_name,
    estimated: Math.round(parseFloat(p.estimated_hrs || 0)),
    actual: Math.round(parseFloat(p.actual_hrs || 0)),
    saved: Math.round(parseFloat(p.effort_saved_hrs || 0)),
    pi: parseFloat(p.avg_pi || 0).toFixed(2),
  }));

  const yearlyTrend = (trends?.yearly || []).map(d => ({
    year: d.year,
    estimated: Math.round(parseFloat(d.estimated_hrs || 0)),
    actual: Math.round(parseFloat(d.actual_hrs || 0)),
    saved: Math.round(parseFloat(d.effort_saved_hrs || 0)),
  }));

  const TABS = ['departments', 'programs', 'trends'];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="label">View by</label>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setPeriodType(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  periodType === opt.value ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{periodType === 'financial' ? 'Financial Year' : 'Calendar Year'}</label>
          <select value={periodYear || ''} onChange={e => setPeriodYear(e.target.value ? parseInt(e.target.value) : null)} className="input-field w-36">
            <option value="">All</option>
            {currentYearOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <button onClick={() => { setPeriodType('calendar'); setPeriodYear(null); }} className="btn-secondary text-xs mt-5">
          <RefreshCw size={12} /> Reset
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Estimated vs Actual vs Effort Saved by Department" span={2}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={v => v.toLocaleString() + ' hrs'} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="estimated" fill="#1E3246" name="Est Hrs" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" fill="#4B5A69" name="Act Hrs" radius={[3, 3, 0, 0]} />
                <Bar dataKey="saved" fill="#19AA6E" name="Effort Saved Hrs" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Avg Productivity Index by Department" subtitle="PI ≥ 1 is on or under budget">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={deptData} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                <ReferenceLine y={1} stroke="#9B875F" strokeDasharray="4 4" label={{ value: 'PI=1', fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="pi" radius={[3, 3, 0, 0]} name="Avg PI">
                  {deptData.map((e, i) => <Cell key={i} fill={parseFloat(e.pi) >= 1 ? '#19AA6E' : '#DC3223'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {activeTab === 'programs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Estimated vs Actual Hours by Program" span={2}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={programData.slice(0, 15)} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={v => v.toLocaleString() + ' hrs'} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="estimated" fill="#1E3246" name="Estimated Hrs" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" fill="#19AA6E" name="Actual Hrs" radius={[3, 3, 0, 0]} />
                <Bar dataKey="saved" fill="#DC3223" name="Effort Saved Hrs" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="grid grid-cols-1 gap-4">
          <ChartCard title="Year-over-Year Trends" subtitle="Annual effort hours by year">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={yearlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={v => v.toLocaleString() + ' hrs'} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="estimated" stroke="#1E3246" strokeWidth={2} dot name="Est Hrs" />
                <Line type="monotone" dataKey="actual" stroke="#19AA6E" strokeWidth={2} dot name="Act Hrs" />
                <Line type="monotone" dataKey="saved" stroke="#DC3223" strokeWidth={2} dot name="Effort Saved Hrs" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
