import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi, yearsApi, uploadsApi } from '../../services/api';
import { useFilterStore } from '../../store/useStore';
import KpiCard from '../../components/ui/KpiCard';
import { SkeletonCard } from '../../components/ui/LoadingSpinner';
import DeptBarChart from './charts/DeptBarChart';
import OpportunityPieChart from './charts/OpportunityPieChart';
import TrendChart from './charts/TrendChart';
import TopProgramsChart from './charts/TopProgramsChart';
import AiInsights from './AiInsights';
import {
  Clock, Activity, TrendingUp, DollarSign, Target, Layers,
  Cpu, BarChart3, RefreshCw
} from 'lucide-react';
import { formatNumber, formatPct } from '../../utils/exportUtils';

export default function Dashboard() {
  const { selectedYear, selectedUploadId, setYear, setUploadId, reset } = useFilterStore();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: years } = useQuery({ queryKey: ['years'], queryFn: () => yearsApi.getAll() });

  const { data: uploads } = useQuery({
    queryKey: ['uploads', selectedYear],
    queryFn: () => uploadsApi.getAll({ year: selectedYear || undefined }),
    select: r => r.data,
  });
  const params = { year: selectedYear, uploadId: selectedUploadId };

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['analytics-summary', params],
    queryFn: () => analyticsApi.getSummary(params),
    select: r => r.data,
  });

  const { data: deptData, isLoading: loadingDept } = useQuery({
    queryKey: ['analytics-dept', params],
    queryFn: () => analyticsApi.getByDepartment(params),
    select: r => r.data,
  });

  const { data: oppData, isLoading: loadingOpp } = useQuery({
    queryKey: ['analytics-opp', params],
    queryFn: () => analyticsApi.getOpportunities(params),
    select: r => r.data,
  });

  const { data: trendData } = useQuery({
    queryKey: ['analytics-trends', params],
    queryFn: () => analyticsApi.getTrends(params),
    select: r => r.data,
  });

  const { data: topData } = useQuery({
    queryKey: ['analytics-top', params],
    queryFn: () => analyticsApi.getTopPrograms({ ...params, metric: 'effort_saved', limit: 10 }),
    select: r => r.data,
  });

  const s = summary || {};
  const budgetSaved = (parseFloat(s.total_approved_budget_ke||0) - parseFloat(s.total_actual_budget_ke||0)).toFixed(0);
  const budgetSavedPct = parseFloat(s.total_approved_budget_ke||0) > 0
    ? ((parseFloat(s.total_approved_budget_ke||0) - parseFloat(s.total_actual_budget_ke||0)) / parseFloat(s.total_approved_budget_ke||0) * 100).toFixed(1)
    : 0;

  const TABS = ['overview', 'charts', 'ai insights'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Filters bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Fiscal Year</label>
          <select
            value={selectedYear || ''}
            onChange={e => { setYear(e.target.value || null); setUploadId(null); }}
            className="input-field w-32"
          >
            <option value="">All Years</option>
            {years?.data?.map(y => <option key={y.year} value={y.year}>{y.year}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Upload Version</label>
          <select
            value={selectedUploadId || ''}
            onChange={e => setUploadId(e.target.value || null)}
            className="input-field w-52"
          >
            <option value="">All Uploads</option>
            {uploads?.map(u => (
              <option key={u.id} value={u.id}>
                v{u.upload_version} — {u.dataset_name || u.original_name}
              </option>
            ))}
          </select>
        </div>
        <button onClick={() => reset()} className="btn-secondary text-xs" title="Reset all filters to All Years / All Uploads">
          <RefreshCw size={12} /> Reset
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {loadingSummary ? Array(8).fill(0).map((_,i) => <SkeletonCard key={i} />) : <>
              <KpiCard title="Total Programs" value={formatNumber(s.total_programs)} subtitle={`${s.total_baselines} baselines`} icon={Layers} color="carbon"
                tooltip="Distinct program names in the current filter. A program may have multiple baselines (versions)." />
              <KpiCard title="Total Est. Hours" value={formatNumber(s.total_estimated_hrs)} subtitle="Planned capacity" icon={Clock} color="steel"
                tooltip="Sum of all planned/estimated effort hours across the filtered programs. Represents total capacity allocated." />
              <KpiCard title="Total Actual Hours" value={formatNumber(s.total_actual_hrs)} subtitle="Delivered" icon={Activity} color="green"
                tooltip="Sum of actual effort hours delivered. Compare with Estimated Hours to assess delivery accuracy." />
              <KpiCard title="Effort Variance" value={formatNumber(s.total_effort_variance)} subtitle="Hrs under/over estimate" icon={TrendingUp} trend={parseFloat(s.total_effort_variance||0)>=0?'up':'down'} color="gold"
                tooltip="Estimated Hours − Actual Hours. Positive = delivered under budget (hours saved). Negative = overrun (more hours used than planned)." />
              <KpiCard title="Effort Saved" value={formatNumber(s.total_effort_saved)} subtitle="via opportunities" icon={Target} color="green" trendValue={`${formatPct(s.avg_efficiency_pct)} avg efficiency`}
                tooltip="Total hours saved through efficiency opportunities: AI/Copilot, test automation, CI/CD, SDLC improvements, reuse libraries, and tooling." />
              <KpiCard title="Cost Saved" value={`€${formatNumber(s.total_cost_saved)}`} subtitle="Material & other savings" icon={DollarSign} color="gold"
                tooltip="Monetary savings in Euros from material cost reductions and other cost categories (licenses, infrastructure, tooling)." />
              <KpiCard title="Avg Productivity Index" value={parseFloat(s.avg_productivity_index||0).toFixed(2)} subtitle={`${s.onbudget_count} on budget | ${s.overbudget_count} over`} icon={BarChart3} color={parseFloat(s.avg_productivity_index||0)>=1?'green':'red'}
                tooltip="Productivity Index (PI) = Estimated Hours ÷ Actual Hours. PI ≥ 1.0 means on or under budget. PI < 1.0 means over budget. Higher is better." />
              <KpiCard title="AI/Copilot Hours" value={formatNumber(s.total_ai_hrs)} subtitle="AI-driven savings" icon={Cpu} color="carbon"
                tooltip="Hours saved specifically by AI-assisted coding tools (e.g. GitHub Copilot, AI code review, AI test generation). Subset of total Effort Saved." />
            </>}
          </div>

          {/* Dept & Opportunity charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="chart-container">
              <p className="section-title">Effort Saved by Department</p>
              <p className="section-subtitle mb-4">Total hours saved per department</p>
              {loadingDept ? <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /> : <DeptBarChart data={deptData} />}
            </div>
            <div className="chart-container">
              <p className="section-title">Opportunity Categories</p>
              <p className="section-subtitle mb-4">Distribution of effort saved by category</p>
              {loadingOpp ? <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" /> : <OpportunityPieChart data={oppData} />}
            </div>
          </div>
        </>
      )}

      {activeTab === 'charts' && (
        <div className="space-y-4">
          <div className="chart-container">
            <p className="section-title">Quarterly Trends</p>
            <p className="section-subtitle mb-4">Estimated vs Actual Hours & Effort Saved over time</p>
            <TrendChart data={trendData?.quarterly} year={selectedYear} uploadId={selectedUploadId} />
          </div>
          <div className="chart-container">
            <p className="section-title">Top 10 Programs by Effort Saved</p>
            <p className="section-subtitle mb-4">Ranked by total efficiency hours gained</p>
            <TopProgramsChart data={topData?.top} />
          </div>
        </div>
      )}

      {activeTab === 'ai insights' && <AiInsights params={params} />}
    </div>
  );
}
