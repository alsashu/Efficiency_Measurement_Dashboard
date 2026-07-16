import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { useSidebarStore, useThemeStore } from '../../store/useStore';
import clsx from 'clsx';

const PAGE_TITLES = {
  '/': 'Dashboard — Legacy',
  '/upload': 'Excel Upload — Legacy',
  '/data-viewer': 'Data Viewer — Legacy',
  '/analytics': 'Analytics — Legacy',
  '/manual-entry': 'Manual Data Entry — Legacy',
  '/audit': 'Audit Trail',
  '/health': 'System Health',
  '/settings': 'Settings',
  '/plan': 'Dashboard — Plan Data',
  '/plan/upload': 'Excel Upload — Plan Data',
  '/plan/data-viewer': 'Data Viewer — Plan Data',
  '/plan/analytics': 'Analytics — Plan Data',
  '/plan/manual-entry': 'Manual Entry — Plan Data',
};

export default function AppLayout() {
  const { collapsed } = useSidebarStore();
  const { initTheme } = useThemeStore();
  const location = useLocation();

  useEffect(() => { initTheme(); }, []);

  const title = PAGE_TITLES[location.pathname] || 'TC Efficiency Dashboard';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar />
      <Header title={title} />
      <main className={clsx(
        'pt-16 min-h-screen transition-all duration-300',
        collapsed ? 'pl-16' : 'pl-64'
      )}>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
