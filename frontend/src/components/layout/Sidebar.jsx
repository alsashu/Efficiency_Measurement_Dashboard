import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Upload, Table2, BarChart3, PenSquare,
  Users, ClipboardList, Activity, Settings, ChevronLeft, ChevronRight,
  Zap, Database, FileBarChart2,
} from 'lucide-react';
import { useSidebarStore, useAuthStore } from '../../store/useStore';
import clsx from 'clsx';

const LEGACY_NAV = [
  // { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  // { path: '/upload', label: 'Excel Upload', icon: Upload, roles: ['admin', 'manager'] },
  // { path: '/data-viewer', label: 'Data Viewer', icon: Table2 },
  // { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  // { path: '/manual-entry', label: 'Manual Entry', icon: PenSquare, roles: ['admin', 'manager'] },
  // { path: '/audit', label: 'Audit Trail', icon: ClipboardList, roles: ['admin', 'manager'] },
  // { path: '/health', label: 'Health', icon: Activity },
  // { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

const PLAN_NAV = [
  { path: '/plan/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/plan', label: 'Dashboard', icon: FileBarChart2 },
  { path: '/plan/upload', label: 'Excel Upload', icon: Upload, roles: ['admin', 'manager'] },
  { path: '/plan/data-viewer', label: 'Data Viewer', icon: Table2 },
  { path: '/plan/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'manager'] },
  { path: '/plan/manual-entry', label: 'Manual Entry', icon: PenSquare, roles: ['admin', 'manager'] },
  { path: '/audit', label: 'Audit Trail', icon: ClipboardList, roles: ['admin', 'manager'] },
  { path: '/health', label: 'Health', icon: Activity, roles: ['admin', 'manager'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

function NavSection({ title, items, collapsed, userRole }) {
  const visible = items.filter(item => !item.roles || item.roles.includes(userRole));

  return (
    <div>
      {!collapsed && title && (
        <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-white/30 uppercase tracking-widest">{title}</p>
      )}
      {collapsed && title && <div className="my-1 mx-3 border-t border-white/10" />}
      <div className="space-y-0.5">
        {visible.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === '/' || path === '/plan'}>
            {({ isActive }) => (
              <div className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer relative',
                'transition-all duration-150 group',
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/50 hover:bg-white/8 hover:text-white/90'
              )}>
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
                {collapsed && (
                  <div className="absolute left-16 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg
                                  opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {label}
                  </div>
                )}
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { collapsed, toggle } = useSidebarStore();
  const { user } = useAuthStore();

  return (
    <aside className={clsx(
      'fixed left-0 top-0 h-full bg-carbon dark:bg-gray-950 border-r border-white/10 z-40',
      'flex flex-col transition-all duration-300 shadow-xl',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <div className="w-8 h-8 bg-vibrant rounded-lg flex items-center justify-center flex-shrink-0">
          <Zap size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-bold text-sm leading-tight">TC Efficiency</p>
            <p className="text-white/50 text-xs">Dashboard</p>
          </div>
        )}
        <button onClick={toggle} className="ml-auto text-white/40 hover:text-white transition-colors">
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* <NavSection
          title="Existing Dashboard (Legacy)"
          items={LEGACY_NAV}
          collapsed={collapsed}
          userRole={user?.role}
        /> */}
        <NavSection
          title="New Dashboard (Plan Data)"
          items={PLAN_NAV}
          collapsed={collapsed}
          userRole={user?.role}
        />
      </nav>

      {/* User info */}
      {!collapsed && user && (
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-vibrant flex items-center justify-center text-white text-xs font-bold">
              {user.username?.[0]?.toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-white text-xs font-medium truncate">{user.username}</p>
              <p className="text-white/40 text-xs capitalize">{user.role}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
