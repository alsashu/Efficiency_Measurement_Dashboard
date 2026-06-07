import { useEffect, useRef } from 'react';
import { useSyncStore } from '../store/useStore';
import { syncPendingChanges, refreshPendingCount } from '../utils/syncService';
import toast from 'react-hot-toast';

// Probe the backend health endpoint to determine true connectivity.
// navigator.onLine only reflects OS-level network state — not backend reachability.
const probeBackend = async () => {
  if (!navigator.onLine) return false;
  try {
    const res = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
};

export const useOnlineStatus = () => {
  const { isOnline, setOnline, setSyncStatus, setPendingCount, setLastSyncTime } = useSyncStore();
  // Keep a ref so event handlers always read the latest isOnline value without stale closure
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const handleSync = async () => {
    const count = await syncPendingChanges({ setSyncStatus, setPendingCount, setLastSyncTime });
    if (count > 0) toast.success(`Synced ${count} offline changes`);
  };

  useEffect(() => {
    let intervalId;

    const checkAndUpdate = async () => {
      const reachable = await probeBackend();
      const wasOnline = isOnlineRef.current;

      setOnline(reachable);

      if (reachable && !wasOnline) {
        // Transitioned offline → online
        toast.success('Back online — syncing...', { id: 'online' });
        handleSync();
      } else if (!reachable && wasOnline) {
        // Transitioned online → offline
        setSyncStatus('idle');
        toast.error('Server unreachable. Changes will sync when reconnected.', {
          id: 'offline',
          duration: 5000,
        });
      }
    };

    const handleBrowserOnline = () => checkAndUpdate();
    const handleBrowserOffline = () => {
      setOnline(false);
      setSyncStatus('idle');
      if (isOnlineRef.current) {
        toast.error('You are offline. Changes will sync when reconnected.', {
          id: 'offline',
          duration: 5000,
        });
      }
    };

    window.addEventListener('online', handleBrowserOnline);
    window.addEventListener('offline', handleBrowserOffline);

    // Initial probe on mount
    checkAndUpdate();
    refreshPendingCount(setPendingCount);

    // Poll every 5 seconds to detect backend failures quickly
    intervalId = setInterval(checkAndUpdate, 5000);

    return () => {
      window.removeEventListener('online', handleBrowserOnline);
      window.removeEventListener('offline', handleBrowserOffline);
      clearInterval(intervalId);
    };
  }, []);
};
