import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { planAnalyticsApi, planUploadsApi } from '../../services/planApi';
import { usePlanFilterStore } from '../../store/useStore';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import PlanKpiCard from './PlanKpiCard';
import PlanDeptBarChart from './charts/PlanDeptBarChart';
import PlanTopProgramsChart from './charts/PlanTopProgramsChart';
import PlanTrendChart from './charts/PlanTrendChart';
import {
  Clock, Activity, TrendingUp, DollarSign, Target,
  Layers, BarChart3, RefreshCw, Calendar,
} from 'lucide-react';
import { formatNumber } from '../../utils/exportUtils';

const PERIOD_TYPE_OPTIONS = [
  { value: 'calendar', label: 'Calendar Year', description: 'Jan 1 – Dec 31' },
  { value: 'financial', label: 'Financial Year', description: 'Apr 1 – Mar 31' },
];

function PeriodBadge({ periodType, periodYear }) {
  const label = periodType === 'financial'
    ? `FY ${periodYear}-${String(parseInt(periodYear) + 1).slice(-2)}`
    : `CY ${periodYear}`;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-carbon/10 dark:bg-carbon/20 text-carbon dark:text-blue-300 rounded-full text-xs font-semibold">
      <Calendar size={12} /> {label}
    </span>
  );
}

export default function PlanDashboard() {
  const {
    periodType, periodYear, selectedUploadId,
    setPeriodType, setPeriodYear, setUploadId, reset,
  } = usePlanFilterStore();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: yearOpts } = useQuery({
    queryKey: ['plan-period-options'],
    queryFn: () => planAnalyticsApi.getPeriodOptions(),
    select: r => r.data,
  });

  const { data: uploads } = useQuery({
    queryKey: ['plan-uploads'],
    queryFn: () => planUploadsApi.getAll({}),
    select: r => r.data,
  });

  const params = { periodType, periodYear: periodYear || undefined, uploadId: selectedUploadId || undefined };

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['plan-summary', params],
    queryFn: () => planAnalyticsApi.getSummary(params),
    select: r => r.data,
  });

  // KPI detail: programs + departments breakdown — fetched once, shared across all 8 tooltips
  const { data: kpiDetail } = useQuery({
    queryKey: ['plan-kpi-detail', params],
    queryFn: () => planAnalyticsApi.getKpiDetail(params),
    select: r => r.data,
    enabled: !loadingSummary,
    staleTime: 60_000,
  });

  const { data: deptData, isLoading: loadingDept } = useQuery({
    queryKey: ['plan-dept', params],
    queryFn: () => planAnalyticsApi.getByDepartment(params),
    select: r => r.data,
  });

  const { data: trendData } = useQuery({
    queryKey: ['plan-trends', params],
    queryFn: () => planAnalyticsApi.getTrends(params),
    select: r => r.data,
  });

  const { data: topData } = useQuery({
    queryKey: ['plan-top', params],
    queryFn: () => planAnalyticsApi.getTopPrograms({ ...params, metric: 'effort_saved', limit: 10 }),
    select: r => r.data,
  });

  const s = summary || {};
  const TABS = ['overview', 'charts'];
  const hasData = parseInt(s.total_baselines || 0) > 0;

  const currentYearOptions = periodType === 'financial'
    ? (yearOpts?.financialYears || [])
    : (yearOpts?.calendarYears || []).map(y => ({ value: y, label: String(y) }));

  // KPI cards config — kpiKey drives which tooltip content renderer is used
  const kpiCards = [
    {
      kpiKey: 'total_programs',
      title: 'Total Programs',
      value: formatNumber(s.total_programs),
      subtitle: `${formatNumber(s.total_baselines)} baselines`,
      icon: Layers, color: 'carbon',
    },
    {
      kpiKey: 'departments',
      title: 'Departments',
      value: formatNumber(s.total_departments),
      subtitle: 'Unique departments',
      icon: BarChart3, color: 'steel',
    },
    {
      kpiKey: 'est_hours',
      title: 'Total Est. Hours',
      value: formatNumber(s.total_estimated_hrs),
      subtitle: 'Planned capacity',
      icon: Clock, color: 'steel',
    },
    {
      kpiKey: 'actual_hours',
      title: 'Total Actual Hours',
      value: formatNumber(s.total_actual_hrs),
      subtitle: 'Delivered',
      icon: Activity, color: 'green',
    },
    {
      kpiKey: 'effort_variance',
      title: 'Effort Variance',
      value: formatNumber(s.total_effort_variance),
      subtitle: 'Hours (from Excel)',
      icon: TrendingUp,
      trend: parseFloat(s.total_effort_variance || 0) >= 0 ? 'up' : 'down',
      color: 'gold',
    },
    {
      kpiKey: 'avg_pi',
      title: 'Avg Productivity Index',
      value: parseFloat(s.avg_productivity_index || 0).toFixed(2),
      subtitle: `${s.onbudget_count || 0} on budget | ${s.overbudget_count || 0} over`,
      icon: Target,
      color: parseFloat(s.avg_productivity_index || 0) >= 1 ? 'green' : 'red',
    },
    {
      kpiKey: 'effort_saved_hrs',
      title: 'Effort Saved (Hrs)',
      value: formatNumber(s.total_effort_saved_hrs),
      subtitle: 'from opportunities',
      icon: Target, color: 'green',
    },
    {
      kpiKey: 'cost_saved',
      title: 'Cost Saved (€)',
      value: `€${formatNumber(s.total_cost_saved_euros)}`,
      subtitle: 'from opportunities',
      icon: DollarSign, color: 'gold',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Dashboard — Plan Data</h2>
          <p className="text-xs text-gray-500 mt-0.5">Source of truth: uploaded Excel plan data (14-column format)</p>
        </div>
        <div className="ml-auto">
          {periodYear && <PeriodBadge periodType={periodType} periodYear={periodYear} />}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">View by</label>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            {PERIOD_TYPE_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => { setPeriodType(opt.value); setUploadId(null); }}
                title={opt.description}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  periodType === opt.value
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">{periodType === 'financial' ? 'Financial Year' : 'Calendar Year'}</label>
          <select value={periodYear || ''} onChange={e => setPeriodYear(e.target.value ? parseInt(e.target.value) : null)} className="input-field w-36">
            <option value="">All Years</option>
            {currentYearOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Upload Version</label>
          <select value={selectedUploadId || ''} onChange={e => setUploadId(e.target.value || null)} className="input-field w-52">
            <option value="">All Uploads</option>
            {uploads?.map(u => (
              <option key={u.id} value={u.id}>v{u.upload_version} — {u.dataset_name || u.original_name}</option>
            ))}
          </select>
        </div>

        <button onClick={() => reset()} className="btn-secondary text-xs" title="Reset all filters">
          <RefreshCw size={12} /> Reset
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {/* No data */}
      {!loadingSummary && !hasData && (
        <div className="card p-12 text-center text-gray-400">
          <BarChart3 size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No data for the selected period</p>
          <p className="text-sm mt-1">
            {periodYear
              ? `No records found for ${periodType === 'financial' ? `FY ${periodYear}-${String(parseInt(periodYear) + 1).slice(-2)}` : `CY ${periodYear}`}.`
              : 'Upload a Plan Data Excel file to get started.'}
          </p>
        </div>
      )}

      {(loadingSummary || hasData) && activeTab === 'overview' && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {loadingSummary
              ? Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)
              : kpiCards.map(card => (
                <PlanKpiCard
                  key={card.kpiKey}
                  {...card}
                  loading={loadingSummary}
                  tooltipData={kpiDetail || null}
                />
              ))}
          </div>

          {/* Dept chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="chart-container lg:col-span-2">
              <p className="section-title">Effort by Department</p>
              <p className="section-subtitle mb-4">Estimated vs Actual vs Effort Saved hours per department</p>
              {loadingDept
                ? <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                : <PlanDeptBarChart data={deptData} />}
            </div>
          </div>
        </>
      )}

      {(loadingSummary || hasData) && activeTab === 'charts' && (
        <div className="space-y-4">
          <div className="chart-container">
            <p className="section-title">Quarterly Trends</p>
            <p className="section-subtitle mb-4">Estimated vs Actual Hours & Effort Saved over time</p>
            <PlanTrendChart data={trendData?.quarterly || []} />
          </div>
          <div className="chart-container">
            <p className="section-title">Top 10 Programs by Effort Saved</p>
            <p className="section-subtitle mb-4">Ranked by Total Effort Saved from Opportunities (Hours)</p>
            <PlanTopProgramsChart data={topData?.top || []} />
          </div>
        </div>
      )}
    </div>
  );
}
