import { idb } from './indexedDB';
import { programsApi } from '../services/api';

export const refreshPendingCount = async (setPendingCount) => {
  const items = await idb.getPendingSyncItems();
  setPendingCount(items.length);
  return items.length;
};

export const syncPendingChanges = async ({ setSyncStatus, setPendingCount, setLastSyncTime }) => {
  const pending = await idb.getPendingSyncItems();
  if (!pending.length) {
    setSyncStatus('synced');
    setPendingCount(0);
    if (setLastSyncTime) setLastSyncTime(new Date().toISOString());
    return 0;
  }

  setSyncStatus('syncing');
  let synced = 0;

  for (const item of pending) {
    try {
      if (item.operation === 'create') await programsApi.create(item.payload);
      else if (item.operation === 'update') await programsApi.update(item.entityId, item.payload);
      else if (item.operation === 'delete') await programsApi.delete(item.entityId);
      await idb.markSynced(item.clientId);
      synced++;
    } catch (err) {
      await idb.markSyncFailed(item.clientId, err.message);
    }
  }

  const remaining = await idb.getPendingSyncItems();
  setPendingCount(remaining.length);
  setSyncStatus(remaining.length > 0 ? 'error' : 'synced');
  if (setLastSyncTime) setLastSyncTime(new Date().toISOString());
  return synced;
};
