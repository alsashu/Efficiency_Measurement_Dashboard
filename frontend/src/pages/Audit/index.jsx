import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../../services/api';
import { format } from 'date-fns';
import { Search, RefreshCw, Shield } from 'lucide-react';

const ACTION_COLORS = {
  LOGIN: 'badge-success', LOGOUT: 'badge-info', UPLOAD: 'badge-success',
  CREATE_PROGRAM: 'badge-success', UPDATE_PROGRAM: 'badge-warning', DELETE_PROGRAM: 'badge-danger',
  DELETE_UPLOAD: 'badge-danger', CREATE_USER: 'badge-success', UPDATE_USER: 'badge-warning',
  DELETE_USER: 'badge-danger', CHANGE_PASSWORD: 'badge-warning',
};

export default function Audit() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', page, search, entityType],
    queryFn: () => auditApi.getLogs({ page, limit: 50, action: search || undefined, entityType: entityType || undefined }),
    select: r => r,
  });

  return (
    <div className="space-y-4 animate-fade-in max-w-5xl">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 max-w-xs">
          <label className="label">Search Action</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-8" placeholder="e.g. LOGIN, UPLOAD..." />
          </div>
        </div>
        <div>
          <label className="label">Entity Type</label>
          <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} className="input-field w-40">
            <option value="">All</option>
            {['user','uploaded_files','programs'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={() => refetch()} className="btn-secondary"><RefreshCw size={14} /></button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Shield size={16} className="text-carbon dark:text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Audit Trail</h3>
          <span className="ml-auto text-xs text-gray-500">{data?.pagination?.total?.toLocaleString() || 0} entries</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center text-gray-400">No audit entries found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {['Timestamp','User','Action','Entity','Details','IP'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.data.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {log.created_at ? format(new Date(log.created_at), 'dd MMM yy HH:mm:ss') : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{log.username || `#${log.user_id}`}</td>
                    <td className="px-4 py-2.5">
                      <span className={`badge ${ACTION_COLORS[log.action] || 'badge-info'}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details).substring(0, 80) + '...' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-400">{log.ip_address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data?.pagination && (
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <p className="text-xs text-gray-500">Page {data.pagination.page} of {data.pagination.pages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="btn-secondary text-xs disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(p => p+1)} disabled={page >= data.pagination.pages} className="btn-secondary text-xs disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
