import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { planAnalyticsApi, planUploadsApi } from '../../services/planApi';
import { usePlanFilterStore } from '../../store/useStore';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import PlanKpiCard from '../PlanDashboard/PlanKpiCard';
import PlanOpportunityDonutChart from '../PlanDashboard/charts/PlanOpportunityDonutChart';
import EffortSavedImpact from '../../components/plan/EffortSavedImpact';
import {
  Clock, Activity, TrendingUp, Target, Layers, BarChart3, RefreshCw, Calendar,
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

export default function PlanOverview() {
  const {
    periodType, periodYear, selectedUploadId,
    setPeriodType, setPeriodYear, setUploadId, reset,
  } = usePlanFilterStore();

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

  // Shared detail source for KPI tooltip breakdowns
  const { data: kpiDetail } = useQuery({
    queryKey: ['plan-kpi-detail', params],
    queryFn: () => planAnalyticsApi.getKpiDetail(params),
    select: r => r.data,
    enabled: !loadingSummary,
    staleTime: 60_000,
  });

  const { data: opportunityData, isLoading: loadingOpportunity } = useQuery({
    queryKey: ['plan-opportunities', params],
    queryFn: () => planAnalyticsApi.getOpportunityBreakdown(params),
    select: r => r.data,
  });

  const s = summary || {};
  const hasData = parseInt(s.total_baselines || 0) > 0;

  const currentYearOptions = periodType === 'financial'
    ? (yearOpts?.financialYears || [])
    : (yearOpts?.calendarYears || []).map(y => ({ value: y, label: String(y) }));

  // Card order fixed per spec: Departments & Programs, Total Est. Hours, Total Actual Hours,
  // Effort Variance, Effort Saved (Hrs)
  const kpiCards = [
    {
      kpiKey: 'depts_programs',
      title: 'Departments & Programs',
      icon: Layers, color: 'carbon',
      dualValues: [
        { label: 'Departments', value: formatNumber(s.total_departments), sub: 'Unique depts' },
        { label: 'Programs', value: formatNumber(s.total_programs), sub: `${formatNumber(s.total_baselines)} baselines` },
      ],
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
      kpiKey: 'effort_saved_hrs',
      title: 'Effort Saved (Hrs)',
      value: formatNumber(s.total_effort_saved_hrs),
      subtitle: 'from opportunities',
      icon: Target, color: 'green',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Dashboard — Plan Data Overview</h2>
          <p className="text-xs text-gray-500 mt-0.5">Source of truth: uploaded Excel plan data (14-column core + 10 opportunity-category columns)</p>
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

      {(loadingSummary || hasData) && (
        <>
          {/* KPI grid — 5 cards per spec */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {loadingSummary
              ? Array(5).fill(0).map((_, i) => <SkeletonCard key={i} />)
              : kpiCards.map(card => (
                <PlanKpiCard
                  key={card.kpiKey}
                  {...card}
                  loading={loadingSummary}
                  tooltipData={kpiDetail || null}
                />
              ))}
          </div>

          {/* Opportunity Categories donut */}
          <div className="chart-container">
            <p className="section-title">Opportunity Categories</p>
            <p className="section-subtitle mb-4">Distribution of effort saved by category</p>
            {loadingOpportunity
              ? <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              : <PlanOpportunityDonutChart data={opportunityData || []} consolidate />}
          </div>

          {/* Effort Saved Impact — hard-coded values */}
          <EffortSavedImpact />
        </>
      )}
    </div>
  );
}
