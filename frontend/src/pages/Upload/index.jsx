import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadsApi, yearsApi } from '../../services/api';
import { Upload, FileSpreadsheet, Trash2, Eye, GitCompare, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber } from '../../utils/exportUtils';
import { format } from 'date-fns';

export default function UploadPage() {
  const qc = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [datasetName, setDatasetName] = useState('');
  const [notes, setNotes] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [compare1, setCompare1] = useState('');
  const [compare2, setCompare2] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');
  const fileRef = useRef();

  const { data: years } = useQuery({ queryKey: ['years'], queryFn: () => yearsApi.getAll() });
  const { data: uploadsData, isLoading } = useQuery({
    queryKey: ['uploads', selectedYear],
    queryFn: () => uploadsApi.getAll({ year: selectedYear }),
    select: r => r.data,
  });

  const uploadMutation = useMutation({
    mutationFn: (formData) => uploadsApi.upload(formData),
    onSuccess: (res) => {
      toast.success(res.message || 'File uploaded successfully');
      qc.invalidateQueries({ queryKey: ['uploads'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => uploadsApi.delete(id),
    onSuccess: () => { toast.success('Upload deleted'); qc.invalidateQueries({ queryKey: ['uploads'] }); },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', selectedYear);
    fd.append('datasetName', datasetName || file.name);
    if (notes) fd.append('notes', notes);
    uploadMutation.mutate(fd);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleCompare = async () => {
    if (!compare1 || !compare2) { toast.error('Select two uploads to compare'); return; }
    try {
      const res = await uploadsApi.compare(compare1, compare2);
      setCompareResult(res.data);
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {['upload','history','compare'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Upload area */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                dragOver ? 'border-carbon bg-carbon/5' : 'border-gray-200 dark:border-gray-700 hover:border-carbon/50'
              } ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-carbon/10 dark:bg-carbon/20 rounded-full flex items-center justify-center">
                  {uploadMutation.isPending ? (
                    <div className="animate-spin w-8 h-8 border-2 border-carbon border-t-transparent rounded-full" />
                  ) : (
                    <FileSpreadsheet size={28} className="text-carbon dark:text-blue-400" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {uploadMutation.isPending ? 'Uploading & parsing...' : 'Drop Excel file here'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">or click to browse — .xlsx, .xls supported</p>
                </div>
              </div>
            </div>

            {uploadMutation.isSuccess && (
              <div className="flex items-center gap-2 p-3 bg-greenline/10 rounded-lg text-greenline text-sm">
                <CheckCircle size={16} />
                {uploadMutation.data?.message}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Upload Options</h3>
              <div>
                <label className="label">Fiscal Year *</label>
                <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="input-field">
                  {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Dataset Name</label>
                <input value={datasetName} onChange={e => setDatasetName(e.target.value)}
                  className="input-field" placeholder="e.g. Q1 2026 Data" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  className="input-field" rows={3} placeholder="Optional notes..." />
              </div>
            </div>

            <div className="card p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Requirements</p>
              {['Excel file (.xlsx or .xls)','Max 50 MB file size','Must contain Dept & Program Name columns','Rows with blank Dept/Program are skipped'].map((r,i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <CheckCircle size={12} className="text-greenline flex-shrink-0" /> {r}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="label mb-0">Filter by Year:</label>
            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="input-field w-32">
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_,i) => (
              <div key={i} className="card p-4 animate-pulse h-16 bg-gray-100 dark:bg-gray-800" />
            ))}</div>
          ) : !uploadsData?.length ? (
            <div className="card p-12 text-center text-gray-400">
              <Upload size={32} className="mx-auto mb-3 opacity-30" />
              <p>No uploads found for {selectedYear}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uploadsData.map((u, i) => (
                <div key={u.id} className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                  <div className="w-8 h-8 bg-carbon/10 dark:bg-carbon/20 rounded-lg flex items-center justify-center text-carbon dark:text-blue-400 font-bold text-sm">
                    v{u.upload_version}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{u.dataset_name || u.original_name}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Clock size={10} /> {u.created_at ? format(new Date(u.created_at), 'dd MMM yyyy HH:mm') : '—'}</span>
                      <span>{formatNumber(u.record_count)} records</span>
                      <span>by {u.uploaded_by_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${u.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{u.status}</span>
                    <button onClick={() => { if (confirm('Delete this upload?')) deleteMutation.mutate(u.id); }}
                      className="p-1.5 text-gray-400 hover:text-vibrant hover:bg-vibrant/5 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'compare' && (
        <div className="space-y-6 max-w-2xl">
          <div className="card p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><GitCompare size={16} /> Compare Versions</h3>
            <div className="grid grid-cols-2 gap-4">
              {[['Base (older)', compare1, setCompare1], ['Comparison (newer)', compare2, setCompare2]].map(([label, val, setter]) => (
                <div key={label}>
                  <label className="label">{label}</label>
                  <select value={val} onChange={e => setter(e.target.value)} className="input-field">
                    <option value="">Select upload...</option>
                    {uploadsData?.map(u => <option key={u.id} value={u.id}>v{u.upload_version} — {u.dataset_name || u.original_name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={handleCompare} className="btn-primary"><GitCompare size={14} /> Compare</button>
          </div>

          {compareResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {[['Added', compareResult.summary.added, 'badge-success'],['Modified', compareResult.summary.modified, 'badge-warning'],['Removed', compareResult.summary.removed, 'badge-danger']].map(([l,v,c]) => (
                  <div key={l} className="card p-4 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{v}</p>
                    <span className={c + ' mt-1'}>{l}</span>
                  </div>
                ))}
              </div>
              {compareResult.modified?.length > 0 && (
                <div className="card p-4">
                  <p className="font-medium text-gray-900 dark:text-white mb-3">Modified Records ({compareResult.modified.length})</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {compareResult.modified.map((r, i) => (
                      <div key={i} className="p-3 bg-gold/5 rounded-lg border border-gold/20">
                        <p className="text-sm font-medium text-gray-800 dark:text-white">{r.program_name} — {r.baseline}</p>
                        {Object.entries(r.changes || {}).map(([field, change]) => (
                          <p key={field} className="text-xs text-gray-500 mt-1">
                            <span className="font-medium">{field}</span>: {change.from.toLocaleString()} → {change.to.toLocaleString()}
                            <span className={change.delta >= 0 ? 'text-greenline ml-1' : 'text-vibrant ml-1'}>({change.delta >= 0 ? '+' : ''}{change.delta.toLocaleString()})</span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
