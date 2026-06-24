import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planProgramsApi, planUploadsApi } from '../../services/planApi';
import { Plus, Save, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatNumber } from '../../utils/exportUtils';

const schema = z.object({
  dept: z.string().min(1, 'Department required'),
  program_name: z.string().min(1, 'Program name required'),
  pm_responsible: z.string().optional(),
  program_code: z.string().optional(),
  baseline: z.string().optional(),
  baseline_start: z.string().optional(),
  baseline_end: z.string().optional(),
  estimated_hrs: z.coerce.number().optional(),
  actual_hrs: z.coerce.number().optional(),
  effort_variance: z.coerce.number().optional(),
  productivity_index: z.coerce.number().optional(),
  total_effort_saved_hrs: z.coerce.number().optional(),
  total_effort_saved_euros: z.coerce.number().optional(),
  total_cost_saved_euros: z.coerce.number().optional(),
});

const Field = ({ label, name, register, errors, type = 'text', required, colSpan }) => (
  <div className={colSpan ? `col-span-${colSpan}` : ''}>
    <label className="label">{label}{required && <span className="text-vibrant ml-1">*</span>}</label>
    <input {...register(name)} type={type} className="input-field" placeholder={label} step="any" />
    {errors[name] && <p className="text-xs text-vibrant mt-1">{errors[name].message}</p>}
  </div>
);

export default function PlanManualEntry() {
  const qc = useQueryClient();
  const [selectedUploadId, setSelectedUploadId] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const { data: uploads } = useQuery({
    queryKey: ['plan-uploads-all'],
    queryFn: () => planUploadsApi.getAll({}),
    select: r => r.data,
  });

  const { data: programs, isLoading } = useQuery({
    queryKey: ['plan-programs-manual', selectedUploadId],
    queryFn: () => planProgramsApi.getAll({ uploadId: selectedUploadId, limit: 500 }),
    select: r => r.data,
    enabled: !!selectedUploadId,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: (data) => planProgramsApi.create({ ...data, uploadId: selectedUploadId || null }),
    onSuccess: () => {
      toast.success('Record created');
      qc.invalidateQueries({ queryKey: ['plan-programs-manual'] });
      reset(); setShowForm(false);
    },
    onError: err => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => planProgramsApi.update(id, data),
    onSuccess: () => {
      toast.success('Record updated');
      qc.invalidateQueries({ queryKey: ['plan-programs-manual'] });
      setEditingId(null); setShowForm(false);
    },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => planProgramsApi.delete(id),
    onSuccess: () => {
      toast.success('Record deleted');
      qc.invalidateQueries({ queryKey: ['plan-programs-manual'] });
    },
    onError: err => toast.error(err.message),
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
      estimated_hrs: prog.estimated_hrs, actual_hrs: prog.actual_hrs,
      effort_variance: prog.effort_variance, productivity_index: prog.productivity_index,
      total_effort_saved_hrs: prog.total_effort_saved_hrs,
      total_effort_saved_euros: prog.total_effort_saved_euros,
      total_cost_saved_euros: prog.total_cost_saved_euros,
    });
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-6xl">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Plan Data — Manual Entry</h2>
          <p className="text-xs text-gray-500">Enter records using the 14-column Plan Data format</p>
        </div>
      </div>

      {/* Setup */}
      <div className="card p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label">Dataset / Upload</label>
          <select value={selectedUploadId} onChange={e => setSelectedUploadId(e.target.value)} className="input-field w-64">
            <option value="">Select dataset (or create unlinked record)…</option>
            {uploads?.map(u => (
              <option key={u.id} value={u.id}>v{u.upload_version} — {u.dataset_name || u.original_name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); reset({}); }}
          className="btn-primary"
        >
          <Plus size={14} /> Add Record
        </button>
      </div>

      {showForm && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900 dark:text-white">{editingId ? 'Edit Record' : 'New Record'}</h3>
            <button
              onClick={() => { setShowForm(false); setEditingId(null); reset({}); }}
              className="btn-secondary text-xs"
            >
              <X size={12} /> Cancel
            </button>
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
              <Field label="Estimated Hrs" name="estimated_hrs" register={register} errors={errors} type="number" />
              <Field label="Actual Hrs" name="actual_hrs" register={register} errors={errors} type="number" />
              <Field label="Effort Variance (Hrs)" name="effort_variance" register={register} errors={errors} type="number" />
              <Field label="Productivity Index" name="productivity_index" register={register} errors={errors} type="number" />
              <Field label="Effort Saved (Hrs)" name="total_effort_saved_hrs" register={register} errors={errors} type="number" />
              <Field label="Effort Saved (€)" name="total_effort_saved_euros" register={register} errors={errors} type="number" />
              <Field label="Cost Saved (€)" name="total_cost_saved_euros" register={register} errors={errors} type="number" />
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="btn-primary"
              >
                <Save size={14} /> {editingId ? 'Update' : 'Create'} Record
              </button>
            </div>
          </form>
        </div>
      )}

      {programs?.length > 0 && !showForm && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {['Dept','Program','Code','Baseline','BL Start','BL End','Est Hrs','Act Hrs','Effort Var','PI','Effort Saved Hrs','Effort Saved €','Cost Saved €','Actions'].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {programs.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <td className="px-3 py-2">{p.dept}</td>
                    <td className="px-3 py-2 font-medium max-w-[140px] truncate" title={p.program_name}>{p.program_name}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{p.program_code}</td>
                    <td className="px-3 py-2 text-gray-500">{p.baseline}</td>
                    <td className="px-3 py-2 text-xs">{p.baseline_start?.split('T')[0] || '—'}</td>
                    <td className="px-3 py-2 text-xs">{p.baseline_end?.split('T')[0] || '—'}</td>
                    <td className="px-3 py-2">{formatNumber(p.estimated_hrs)}</td>
                    <td className="px-3 py-2">{formatNumber(p.actual_hrs)}</td>
                    <td className="px-3 py-2">{formatNumber(p.effort_variance)}</td>
                    <td className="px-3 py-2">
                      <span className={`badge ${parseFloat(p.productivity_index || 0) >= 1 ? 'badge-success' : 'badge-danger'}`}>
                        {parseFloat(p.productivity_index || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatNumber(p.total_effort_saved_hrs)}</td>
                    <td className="px-3 py-2">{formatNumber(p.total_effort_saved_euros)}</td>
                    <td className="px-3 py-2">{formatNumber(p.total_cost_saved_euros)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(p)} className="p-1.5 text-gray-400 hover:text-carbon hover:bg-carbon/5 rounded transition-colors">
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => { if (confirm('Delete this record?')) deleteMutation.mutate(p.id); }}
                          className="p-1.5 text-gray-400 hover:text-vibrant hover:bg-vibrant/5 rounded transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!programs?.length && !showForm && !isLoading && (
        <div className="card p-12 text-center text-gray-400">
          <p>No records yet. Click "Add Record" to create the first entry.</p>
        </div>
      )}
    </div>
  );
}
