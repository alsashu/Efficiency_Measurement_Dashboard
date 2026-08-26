import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../services/api';
import { useAuthStore } from '../../store/useStore';
import { useForm } from 'react-hook-form';
import { Plus, Edit2, Trash2, UserCog, X } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLES = ['admin', 'manager', 'viewer'];

export default function Settings() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const [showUserForm, setShowUserForm] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll(),
    select: r => r.data,
  });
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: () => usersApi.getRoles(), select: r => r.data });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const createMutation = useMutation({
    mutationFn: (data) => editUser
      ? usersApi.update(editUser.id, { ...data, isActive: data.isActive === 'true' })
      : usersApi.create(data),
    onSuccess: () => {
      toast.success(editUser ? 'User updated' : 'User created');
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowUserForm(false);
      setEditUser(null);
      reset();
    },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => usersApi.delete(id),
    onSuccess: () => { toast.success('User deleted'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: err => toast.error(err.message),
  });

  const startEdit = (u) => {
    setEditUser(u);
    setShowUserForm(true);
    reset({ email: u.email, roleId: u.role_id, firstName: u.first_name, lastName: u.last_name, isActive: String(u.is_active) });
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">

      {/* ── User Management ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCog size={18} className="text-carbon dark:text-blue-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">User Management</h2>
          </div>
          <button onClick={() => { setShowUserForm(true); setEditUser(null); reset({}); }} className="btn-primary text-sm">
            <Plus size={14} /> Add User
          </button>
        </div>

        {showUserForm && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">{editUser ? 'Edit User' : 'New User'}</h3>
              <button onClick={() => { setShowUserForm(false); setEditUser(null); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit(data => createMutation.mutate(data))}>
              <div className="grid grid-cols-2 gap-4">
                {!editUser && (
                  <div>
                    <label className="label">Username *</label>
                    <input {...register('username', { required: !editUser })} className="input-field" placeholder="username" />
                  </div>
                )}
                <div>
                  <label className="label">Email</label>
                  <input {...register('email')} className="input-field" placeholder="email@company.com" type="email" />
                </div>
                {!editUser && (
                  <div>
                    <label className="label">Password *</label>
                    <input {...register('password', { required: !editUser })} className="input-field" placeholder="Min 8 chars" type="password" />
                  </div>
                )}
                <div>
                  <label className="label">First Name</label>
                  <input {...register('firstName')} className="input-field" placeholder="First name" />
                </div>
                <div>
                  <label className="label">Last Name</label>
                  <input {...register('lastName')} className="input-field" placeholder="Last name" />
                </div>
                <div>
                  <label className="label">Role *</label>
                  <select {...register('roleId', { required: true })} className="input-field">
                    <option value="">Select role…</option>
                    {roles?.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                {editUser && (
                  <div>
                    <label className="label">Status</label>
                    <select {...register('isActive')} className="input-field">
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {editUser ? 'Update User' : 'Create User'}
                </button>
                <button type="button" onClick={() => { setShowUserForm(false); setEditUser(null); }} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="card overflow-hidden">
          {isLoading ? <div className="p-8 text-center text-gray-400">Loading users…</div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {['Username', 'Email', 'Name', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users?.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">{u.first_name} {u.last_name}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'manager' ? 'badge-warning' : 'badge-info'}`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-warning'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(u)} title="Edit user" className="p-1.5 text-gray-400 hover:text-carbon rounded"><Edit2 size={13} /></button>
                        {u.id !== parseInt(user?.id) && (
                          <button onClick={() => { if (confirm('Delete user?')) deleteMutation.mutate(u.id); }} title="Delete user" className="p-1.5 text-gray-400 hover:text-vibrant rounded"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
