import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Auth store
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('tc_token', token);
        localStorage.setItem('tc_user', JSON.stringify(user));
        set({ user, token });
      },
      logout: () => {
        localStorage.removeItem('tc_token');
        localStorage.removeItem('tc_user');
        set({ user: null, token: null });
      },
      isAuthenticated: () => !!get().token,
      hasRole: (role) => get().user?.role === role,
      canEdit: () => ['admin', 'manager'].includes(get().user?.role),
    }),
    { name: 'tc_auth', partialize: (state) => ({ user: state.user, token: state.token }) }
  )
);

// Theme store
export const useThemeStore = create(
  persist(
    (set) => ({
      theme: 'light',
      toggleTheme: () => set((s) => {
        const next = s.theme === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', next === 'dark');
        return { theme: next };
      }),
      initTheme: () => {
        const stored = localStorage.getItem('tc_theme');
        const theme = stored ? JSON.parse(stored).state?.theme : 'light';
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },
    }),
    { name: 'tc_theme' }
  )
);

// Filter/Selection store (global filters shared across pages)
export const useFilterStore = create((set) => ({
  selectedYear: null,
  selectedUploadId: null,
  selectedDept: null,
  setYear: (year) => set({ selectedYear: year }),
  setUploadId: (id) => set({ selectedUploadId: id }),
  setDept: (dept) => set({ selectedDept: dept }),
  reset: () => set({ selectedYear: null, selectedUploadId: null, selectedDept: null }),
}));

// Offline/Sync store
export const useSyncStore = create(
  persist(
    (set) => ({
      isOnline: navigator.onLine,
      syncStatus: 'idle', // idle | syncing | synced | error
      pendingCount: 0,
      offlineModeEnabled: false,
      lastSyncTime: null,
      setOnline: (v) => set({ isOnline: v }),
      setSyncStatus: (s) => set({ syncStatus: s }),
      setPendingCount: (n) => set({ pendingCount: n }),
      setOfflineMode: (enabled) => set({ offlineModeEnabled: enabled }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),
    }),
    {
      name: 'tc_connectivity',
      partialize: (state) => ({
        offlineModeEnabled: state.offlineModeEnabled,
        lastSyncTime: state.lastSyncTime,
      }),
    }
  )
);

// Sidebar store
export const useSidebarStore = create((set) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}));
