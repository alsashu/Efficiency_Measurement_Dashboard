import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { programsApi, uploadsApi, yearsApi } from '../../services/api';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useSyncStore } from '../../store/useStore';
import { idb } from '../../utils/indexedDB';
import { Plus, Save, Edit2, Trash2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  dept: z.string().min(1, 'Department required'),
  program_name: z.string().min(1, 'Program name required'),
  pm_responsible: z.string().optional(),
  program_code: z.string().optional(),
  baseline: z.string().optional(),
  baseline_start: z.string().optional(),
  baseline_end: z.string().optional(),
  funding_source: z.string().optional(),
  estimated_hrs: z.coerce.number().optional(),
  actual_hrs: z.coerce.number().optional(),
  effort_variance: z.coerce.number().optional(),
  productivity_index: z.coerce.number().optional(),
  total_effort_saved: z.coerce.number().optional(),
  total_cost_saved: z.coerce.number().optional(),
  ai_copilot: z.coerce.number().optional(),
  automation_testing: z.coerce.number().optional(),
  automation_cicd: z.coerce.number().optional(),
  efficiency_pct: z.coerce.number().optional(),
  remarks: z.string().optional(),
});

const Field = ({ label, name, register, errors, type = 'text', required }) => (
  <div>
    <label className="label">{label}{required && <span className="text-vibrant ml-1">*</span>}</label>
    <input {...register(name)} type={type} className="input-field" placeholder={label} step="any" />
    {errors[name] && <p className="text-xs text-vibrant mt-1">{errors[name].message}</p>}
  </div>
);

export default function ManualEntry() {
  const qc = useQueryClient();
  const { isOnline } = useSyncStore();
  const [selectedUploadId, setSelectedUploadId] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: years } = useQuery({ queryKey: ['years'], queryFn: () => yearsApi.getAll(), select: r => r.data });
  const { data: uploads } = useQuery({
    queryKey: ['uploads', selectedYear],
    queryFn: () => uploadsApi.getAll({ year: selectedYear }),
    select: r => r.data,
  });
  const { data: programs, isLoading } = useQuery({
    queryKey: ['programs-manual', selectedUploadId],
    queryFn: () => programsApi.getAll({ uploadId: selectedUploadId, limit: 100 }),
    select: r => r.data,
    enabled: !!selectedUploadId,
  });

  const { register, handleSubmit, reset, watch, formState: { errors, isDirty } } = useForm({ resolver: zodResolver(schema) });
  const formData = watch();

  const createMutation = useMutation({
    mutationFn: (data) => isOnline
      ? programsApi.create({ ...data, uploadId: selectedUploadId })
      : idb.addToSyncQueue({ operation: 'create', entityType: 'programs', payload: { ...data, uploadId: selectedUploadId } }).then(() => idb.saveProgram({ ...data, id: Date.now(), upload_id: selectedUploadId })),
    onSuccess: () => { toast.success('Record created'); qc.invalidateQueries({ queryKey: ['programs-manual'] }); reset(); setShowForm(false); },
    onError: err => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => programsApi.update(id, data),
    onSuccess: () => { toast.success('Record updated'); qc.invalidateQueries({ queryKey: ['programs-manual'] }); setEditingId(null); },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => programsApi.delete(id),
    onSuccess: () => { toast.success('Record deleted'); qc.invalidateQueries({ queryKey: ['programs-manual'] }); },
    onError: err => toast.error(err.message),
  });

  const { isSaving } = useAutoSave({
    data: formData,
    saveFn: (data) => editingId ? programsApi.update(editingId, data) : Promise.resolve(),
    enabled: !!editingId && isDirty,
  });

  const onSubmit = (data) => {
    if (editingId) updateMutation.mutate({ id: editingId, data });
    else createMutation.mutate(data);
  };

  const startEdit = (prog) => {
    setEditingId(prog.id);
    setShowForm(true);
    reset({
      dept: prog.dept, program_name: prog.program_name, pm_responsible: prog.pm_responsible,
      program_code: prog.program_code, baseline: prog.baseline,
      baseline_start: prog.baseline_start?.split('T')[0], baseline_end: prog.baseline_end?.split('T')[0],
      funding_source: prog.funding_source, estimated_hrs: prog.estimated_hrs, actual_hrs: prog.actual_hrs,
      effort_variance: prog.effort_variance, productivity_index: prog.productivity_index,
      total_effort_saved: prog.total_effort_saved, total_cost_saved: prog.total_cost_saved,
      ai_copilot: prog.ai_copilot, automation_testing: prog.automation_testing,
      automation_cicd: prog.automation_cicd, efficiency_pct: prog.efficiency_pct, remarks: prog.remarks,
    });
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl">
      {/* Setup */}
      <div className="card p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Fiscal Year *</label>
          <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="input-field w-28">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Dataset / Upload *</label>
          <select value={selectedUploadId} onChange={e => setSelectedUploadId(e.target.value)} className="input-field w-56">
            <option value="">Select dataset...</option>
            {uploads?.map(u => <option key={u.id} value={u.id}>v{u.upload_version} — {u.dataset_name || u.original_name}</option>)}
          </select>
        </div>
        {selectedUploadId && (
          <button onClick={() => { setShowForm(true); setEditingId(null); reset({}); }} className="btn-primary">
            <Plus size={14} /> Add Record
          </button>
        )}
        {isSaving && <span className="text-xs text-gray-400 animate-pulse">Auto-saving...</span>}
      </div>

      {!selectedUploadId && (
        <div className="card p-12 text-center text-gray-400">
          <p>Select a year and dataset to start entering data</p>
        </div>
      )}

      {selectedUploadId && showForm && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-white">{editingId ? 'Edit Record' : 'New Record'}</h3>
            <div className="flex items-center gap-2">
              {editingId && <span className="text-xs text-gray-400">Auto-save {isSaving ? 'saving...' : 'enabled'}</span>}
              <button onClick={() => { setShowForm(false); setEditingId(null); reset({}); }} className="btn-secondary text-xs"><X size={12} /> Cancel</button>
            </div>
          </div>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <Field label="Department" name="dept" register={register} errors={errors} required />
              <Field label="Program Name" name="program_name" register={register} errors={errors} required />
              <Field label="PM Responsible" name="pm_responsible" register={register} errors={errors} />
              <Field label="Program Code" name="program_code" register={register} errors={errors} />
              <Field label="Baseline" name="baseline" register={register} errors={errors} />
              <Field label="Baseline Start" name="baseline_start" register={register} errors={errors} type="date" />
              <Field label="Baseline End" name="baseline_end" register={register} errors={errors} type="date" />
              <Field label="Funding Source" name="funding_source" register={register} errors={errors} />
              <Field label="Estimated Hours" name="estimated_hrs" register={register} errors={errors} type="number" />
              <Field label="Actual Hours" name="actual_hrs" register={register} errors={errors} type="number" />
              <Field label="Effort Variance" name="effort_variance" register={register} errors={errors} type="number" />
              <Field label="Productivity Index" name="productivity_index" register={register} errors={errors} type="number" />
              <Field label="Total Effort Saved" name="total_effort_saved" register={register} errors={errors} type="number" />
              <Field label="Total Cost Saved (€)" name="total_cost_saved" register={register} errors={errors} type="number" />
              <Field label="AI/Copilot Hrs" name="ai_copilot" register={register} errors={errors} type="number" />
              <Field label="Test Automation Hrs" name="automation_testing" register={register} errors={errors} type="number" />
              <Field label="CI/CD Hrs" name="automation_cicd" register={register} errors={errors} type="number" />
              <Field label="% Efficiency" name="efficiency_pct" register={register} errors={errors} type="number" />
              <div className="col-span-2 md:col-span-4">
                <label className="label">Remarks</label>
                <textarea {...register('remarks')} className="input-field" rows={2} />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="btn-primary">
                <Save size={14} /> {editingId ? 'Update' : 'Create'} Record
              </button>
              {!isOnline && <span className="badge-warning text-xs self-center">Offline — will sync later</span>}
            </div>
          </form>
        </div>
      )}

      {selectedUploadId && !showForm && programs?.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {['Dept','Program Name','Baseline','Est Hrs','Act Hrs','PI','Efficiency','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {programs.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-2.5">{p.dept}</td>
                    <td className="px-4 py-2.5 font-medium">{p.program_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{p.baseline}</td>
                    <td className="px-4 py-2.5">{parseInt(p.estimated_hrs||0).toLocaleString()}</td>
                    <td className="px-4 py-2.5">{parseInt(p.actual_hrs||0).toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <span className={`badge ${parseFloat(p.productivity_index||0)>=1?'badge-success':'badge-danger'}`}>{parseFloat(p.productivity_index||0).toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-2.5">{(parseFloat(p.efficiency_pct||0)*100).toFixed(1)}%</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-carbon hover:bg-carbon/5 rounded transition-colors"><Edit2 size={13} /></button>
                        <button onClick={() => { if(confirm('Delete this record?')) deleteMutation.mutate(p.id); }} className="p-1.5 text-gray-400 hover:text-vibrant hover:bg-vibrant/5 rounded transition-colors"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
