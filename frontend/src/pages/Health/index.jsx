import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthApi } from '../../services/api';
import { CheckCircle, AlertCircle, RefreshCw, Database, Server, FileText, ExternalLink } from 'lucide-react';

const StatusBadge = ({ status }) => {
  const ok = status === 'ok' || status === 'healthy';
  return <span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>{status}</span>;
};

const MetricRow = ({ label, value }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
    <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
    <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">{value}</span>
  </div>
);

export default function Health() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.get(),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['health-stats'],
    queryFn: () => healthApi.getStats(),
    select: r => r.data,
    refetchInterval: 60000,
  });

  const h = data || {};

  return (
    <div className="space-y-5 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={h.status || 'loading'} />
          <span className="text-sm text-gray-500">Last checked: {h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : '—'}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs"><ExternalLink size={12} /> Swagger Docs</a>
          <button onClick={() => refetch()} disabled={isFetching} className="btn-secondary text-xs">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Total Programs', stats.total_programs?.toLocaleString()],
            ['Total Uploads', stats.total_uploads?.toLocaleString()],
            ['Active Users', stats.active_users?.toLocaleString()],
            ['Events (24h)', stats.audit_events_24h?.toLocaleString()],
          ].map(([l,v]) => (
            <div key={l} className="card p-4 text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{v || '0'}</p>
              <p className="text-xs text-gray-500 mt-1">{l}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Services */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server size={16} className="text-carbon dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Services</h3>
          </div>
          {h.services && Object.entries(h.services).map(([name, svc]) => (
            <div key={name} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
              <div className="flex items-center gap-2">
                {svc.status === 'ok' ? <CheckCircle size={14} className="text-greenline" /> : <AlertCircle size={14} className="text-vibrant" />}
                <span className="text-sm capitalize">{name}</span>
              </div>
              <div className="flex items-center gap-2">
                {svc.latency_ms !== undefined && <span className="text-xs text-gray-400">{svc.latency_ms}ms</span>}
                <StatusBadge status={svc.status} />
              </div>
            </div>
          ))}
        </div>

        {/* System */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database size={16} className="text-carbon dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">System</h3>
          </div>
          {h.system && <>
            <MetricRow label="Node.js" value={h.system.node_version} />
            <MetricRow label="Platform" value={`${h.system.platform} / ${h.system.arch}`} />
            <MetricRow label="Heap Used" value={`${h.system.memory?.heap_used_mb} MB`} />
            <MetricRow label="Heap Total" value={`${h.system.memory?.heap_total_mb} MB`} />
            <MetricRow label="System Memory" value={`${h.system.memory?.system_free_gb}/${h.system.memory?.system_total_gb} GB free`} />
            <MetricRow label="CPU Cores" value={h.system.cpu_cores} />
            <MetricRow label="Uptime" value={`${Math.round(h.uptime / 60)} min`} />
            <MetricRow label="Environment" value={h.environment} />
          </>}
        </div>

        {/* Log Files */}
        <div className="card p-5 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-carbon dark:text-blue-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Log Files</h3>
          </div>
          {h.logs?.length ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {h.logs.map(log => (
                <div key={log.name} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{log.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{log.size}</p>
                  <p className="text-xs text-gray-400">{log.modified ? new Date(log.modified).toLocaleDateString() : '—'}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">No log files found</p>}
        </div>
      </div>
    </div>
  );
}
