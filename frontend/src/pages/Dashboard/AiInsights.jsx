import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../../services/api';
import { Brain, AlertTriangle, Lightbulb, CheckCircle2, Target, RefreshCw } from 'lucide-react';
import { PageLoader } from '../../components/ui/LoadingSpinner';

const Section = ({ icon: Icon, title, items, iconColor }) => (
  <div className="card p-5">
    <div className="flex items-center gap-2 mb-3">
      <Icon size={18} className={iconColor} />
      <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
    </div>
    <ul className="space-y-2">
      {items?.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  </div>
);

export default function AiInsights({ params }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ai-insights', params],
    queryFn: () => analyticsApi.getAiInsights(params),
    select: r => r.data,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={20} className="text-carbon dark:text-blue-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">AI-Driven Insights</h2>
          <span className="badge-info">Automated Analysis</span>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary text-xs">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Executive Summary */}
      <div className="card p-5 border-l-4 border-carbon">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Executive Summary</p>
        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{data?.executiveSummary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section icon={CheckCircle2} title="Key Observations" items={data?.keyObservations} iconColor="text-greenline" />
        <Section icon={AlertTriangle} title="Risks" items={data?.risks} iconColor="text-vibrant" />
        <Section icon={Lightbulb} title="Opportunities" items={data?.opportunities} iconColor="text-gold" />
        <Section icon={Target} title="Recommendations" items={data?.recommendations} iconColor="text-carbon dark:text-blue-400" />
      </div>

      <p className="text-xs text-gray-400 text-right">
        Generated: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}
      </p>
    </div>
  );
}
