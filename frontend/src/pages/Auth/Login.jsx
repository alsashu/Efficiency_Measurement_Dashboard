import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi } from '../../services/api';
import { useAuthStore, useThemeStore } from '../../store/useStore';
import { Zap, Eye, EyeOff, Sun, Moon, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

const schema = z.object({
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
});

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await authApi.login(data);
      setAuth(res.data.user, res.data.token);
      toast.success(`Welcome, ${res.data.user.username}!`);
      navigate('/plan/overview');
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4 relative">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-carbon rounded-2xl mb-4 shadow-lg">
            <Zap size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">TC Efficiency</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Technology Center Dashboard</p>
        </div>

        <div className="card p-6 shadow-xl">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Sign in to continue</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input {...register('username')} className="input-field" placeholder="Enter username" autoComplete="username" />
              {errors.username && <p className="text-xs text-vibrant mt-1">{errors.username.message}</p>}
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  className="input-field pr-10"
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-vibrant mt-1">{errors.password.message}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 text-center mb-2">Click a role to fill credentials</p>
            <div className="grid grid-cols-3 gap-1 text-xs">
              {[['admin','Admin@123456','Admin'],['manager','Manager@123','Manager'],['viewer','Viewer@123','Viewer']].map(([u,p,r]) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => { setValue('username', u); setValue('password', p); }}
                  className="bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-gray-700 rounded p-1.5 text-center transition-colors cursor-pointer border border-transparent hover:border-carbon"
                >
                  <p className="font-semibold text-carbon dark:text-blue-400">{r}</p>
                  <p className="text-gray-500 dark:text-gray-400 font-mono">{u}</p>
                  <p className="text-gray-400 dark:text-gray-500 font-mono truncate" title={p}>{p}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
