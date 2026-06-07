import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, LogOut, Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useThemeStore, useAuthStore, useSyncStore } from '../../store/useStore';
import { authApi } from '../../services/api';
import { useSidebarStore } from '../../store/useStore';
import Tooltip from '../ui/Tooltip';
import clsx from 'clsx';

export default function Header({ title = 'Dashboard' }) {
  const { theme, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { collapsed } = useSidebarStore();
  const { isOnline, syncStatus, pendingCount, offlineModeEnabled } = useSyncStore();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    logout();
    navigate('/login');
  };

  const syncLabel = {
    idle: null,
    syncing: { icon: <RefreshCw size={12} className="animate-spin" />, tip: 'Syncing offline changes to server…' },
    synced: { icon: <CheckCircle size={12} />, tip: 'All changes synced' },
    error: { icon: <AlertCircle size={12} className="text-vibrant" />, tip: `${pendingCount} change(s) failed to sync` },
  }[syncStatus];

  // Effectively offline when: actual network is down OR user has manually enabled Offline Mode
  const effectivelyOnline = isOnline && !offlineModeEnabled;

  const onlineTooltip = offlineModeEnabled
    ? isOnline ? 'Offline Mode enabled — using cached data (server is reachable)' : 'Offline Mode enabled — using cached data'
    : isOnline ? 'Connected — live server data' : 'Disconnected — no network connection';

  return (
    <header className={clsx(
      'fixed top-0 right-0 z-30 h-16 bg-white dark:bg-gray-900',
      'border-b border-gray-100 dark:border-gray-800 flex items-center px-6 gap-4 shadow-sm',
      'transition-all duration-300',
      collapsed ? 'left-16' : 'left-64'
    )}>
      <div className="flex-1">
        <h1 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Online / sync status */}
        <Tooltip content={onlineTooltip} placement="bottom">
          <div className={clsx(
            'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full cursor-default',
            effectivelyOnline ? 'bg-greenline/10 text-greenline' : 'bg-vibrant/10 text-vibrant'
          )}>
            {effectivelyOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span className="hidden sm:inline">{effectivelyOnline ? 'Online' : 'Offline'}</span>
            {syncLabel && (
              <Tooltip content={syncLabel.tip} placement="bottom">
                <span className="ml-0.5">{syncLabel.icon}</span>
              </Tooltip>
            )}
          </div>
        </Tooltip>

        {/* Theme toggle */}
        <Tooltip content={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} placement="bottom">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </Tooltip>

        {/* User menu */}
        <div className="relative">
          <Tooltip content={`Signed in as ${user?.username} (${user?.role})`} placement="bottom">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-carbon flex items-center justify-center text-white text-xs font-bold">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-200">{user?.username}</span>
            </button>
          </Tooltip>
          {showUserMenu && (
            <div className="absolute right-0 top-10 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-lg py-1 w-44 z-50">
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-medium text-gray-900 dark:text-white">{user?.username}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-vibrant hover:bg-vibrant/5 transition-colors"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
