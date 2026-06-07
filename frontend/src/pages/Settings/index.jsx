import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../services/api';
import { useAuthStore, useSyncStore } from '../../store/useStore';
import { useForm } from 'react-hook-form';
import {
  Plus, Edit2, Trash2, UserCog, X,
  Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle, Clock, Database,
} from 'lucide-react';
import { syncPendingChanges, refreshPendingCount } from '../../utils/syncService';
import { idb } from '../../utils/indexedDB';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const ROLES = ['admin', 'manager', 'viewer'];

export default function Settings() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const {
    isOnline, syncStatus, pendingCount, offlineModeEnabled, lastSyncTime,
    setOfflineMode, setSyncStatus, setPendingCount, setLastSyncTime,
  } = useSyncStore();

  const effectivelyOnline = isOnline && !offlineModeEnabled;

  const [showUserForm, setShowUserForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

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

  const handleSyncNow = async () => {
    if (!effectivelyOnline) { toast.error(offlineModeEnabled ? 'Disable Offline Mode to sync' : 'Cannot sync — no network connection'); return; }
    if (syncing) return;
    setSyncing(true);
    try {
      const count = await syncPendingChanges({ setSyncStatus, setPendingCount, setLastSyncTime });
      toast.success(count > 0 ? `Synced ${count} pending change(s)` : 'All changes are already up to date');
    } catch (err) {
      toast.error('Sync failed: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm('Clear all locally cached data? Offline copies of programs and analytics will be removed. This cannot be undone.')) return;
    setClearingCache(true);
    try {
      await idb.clearAll();
      await refreshPendingCount(setPendingCount);
      toast.success('Local cache cleared');
    } catch (err) {
      toast.error('Failed to clear cache: ' + err.message);
    } finally {
      setClearingCache(false);
    }
  };

  const syncStatusConfig = {
    idle: { icon: <Clock size={14} />, label: 'Idle', desc: 'No sync in progress', cls: 'text-gray-500 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
    syncing: { icon: <RefreshCw size={14} className="animate-spin" />, label: 'Syncing', desc: 'Uploading offline changes…', cls: 'text-gold bg-gold/5 border-gold/20' },
    synced: { icon: <CheckCircle size={14} />, label: 'Synced', desc: 'All changes are up to date', cls: 'text-greenline bg-greenline/5 border-greenline/20' },
    error: { icon: <AlertCircle size={14} />, label: 'Error', desc: `${pendingCount} change(s) failed`, cls: 'text-vibrant bg-vibrant/5 border-vibrant/20' },
  }[syncStatus] || {};

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

      {/* ── Connectivity & Sync ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Wifi size={18} className="text-carbon dark:text-blue-400" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Connectivity &amp; Sync</h2>
        </div>

        <div className="card p-5 space-y-5">

          {/* Offline Mode toggle */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Offline Mode</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm leading-relaxed">
                Cache data locally so the application works without internet access. Any changes made while offline are queued and synced automatically when connectivity is restored.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={offlineModeEnabled}
              onClick={() => {
                setOfflineMode(!offlineModeEnabled);
                toast.success(offlineModeEnabled ? 'Offline Mode disabled — using live data' : 'Offline Mode enabled — data will be cached locally');
              }}
              title={offlineModeEnabled ? 'Click to disable Offline Mode' : 'Click to enable Offline Mode'}
              className={clsx(
                'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-carbon',
                offlineModeEnabled ? 'bg-carbon' : 'bg-gray-300 dark:bg-gray-600'
              )}
            >
              <span
                className={clsx(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200',
                  offlineModeEnabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          {/* Status cards */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Current Status</p>
            <div className="grid grid-cols-3 gap-3">

              {/* Connection */}
              <div className={clsx(
                'rounded-lg p-3 border',
                effectivelyOnline
                  ? 'bg-greenline/5 border-greenline/20 text-greenline'
                  : 'bg-vibrant/5 border-vibrant/20 text-vibrant'
              )}>
                <div className="flex items-center gap-1.5 mb-1">
                  {effectivelyOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                  <span className="text-xs font-semibold">{effectivelyOnline ? 'Online' : 'Offline'}</span>
                </div>
                <p className="text-xs opacity-70">
                  {effectivelyOnline ? 'Live server data available' : offlineModeEnabled ? 'Using locally cached data' : 'No network connection'}
                </p>
              </div>

              {/* Pending changes */}
              <div className={clsx(
                'rounded-lg p-3 border',
                pendingCount > 0
                  ? 'bg-gold/5 border-gold/20 text-gold'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
              )}>
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertCircle size={14} />
                  <span className="text-xs font-semibold">{pendingCount} Pending</span>
                </div>
                <p className="text-xs opacity-70">{pendingCount > 0 ? 'Changes awaiting sync' : 'No unsynced changes'}</p>
              </div>

              {/* Sync status */}
              <div className={clsx('rounded-lg p-3 border', syncStatusConfig.cls)}>
                <div className="flex items-center gap-1.5 mb-1">
                  {syncStatusConfig.icon}
                  <span className="text-xs font-semibold">{syncStatusConfig.label}</span>
                </div>
                <p className="text-xs opacity-70">
                  {lastSyncTime
                    ? `Last synced ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : syncStatusConfig.desc}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={handleSyncNow}
              disabled={syncing || !effectivelyOnline}
              title={offlineModeEnabled ? 'Disable Offline Mode to sync' : !isOnline ? 'Connect to the internet to sync' : 'Push all pending offline changes to the server'}
              className="btn-primary text-sm"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button
              onClick={handleClearCache}
              disabled={clearingCache}
              title="Remove all locally cached data from this browser (programs, analytics, sync queue)"
              className="btn-secondary text-sm"
            >
              <Database size={14} /> {clearingCache ? 'Clearing…' : 'Clear Cache'}
            </button>
            {!effectivelyOnline && (
              <p className="text-xs text-gray-400 ml-1">
                {offlineModeEnabled ? 'Disable Offline Mode to push changes' : 'Reconnect to internet to push offline changes'}
              </p>
            )}
            {offlineModeEnabled && isOnline && pendingCount === 0 && (
              <p className="text-xs text-greenline ml-1">Offline Mode active — data is being cached locally</p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
