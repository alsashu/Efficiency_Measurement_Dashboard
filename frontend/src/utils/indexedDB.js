import { openDB } from 'idb';

const DB_NAME = 'tc_efficiency_db';
const DB_VERSION = 1;

let dbInstance = null;

const getDB = async () => {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('programs')) {
        const ps = db.createObjectStore('programs', { keyPath: 'id' });
        ps.createIndex('uploadId', 'upload_id');
        ps.createIndex('dept', 'dept');
      }
      if (!db.objectStoreNames.contains('uploads')) {
        db.createObjectStore('uploads', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const sq = db.createObjectStore('sync_queue', { keyPath: 'clientId', autoIncrement: false });
        sq.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('analytics_cache')) {
        db.createObjectStore('analytics_cache', { keyPath: 'key' });
      }
    },
  });
  return dbInstance;
};

export const idb = {
  // Programs
  async savePrograms(programs) {
    const db = await getDB();
    const tx = db.transaction('programs', 'readwrite');
    await Promise.all(programs.map(p => tx.store.put(p)));
    await tx.done;
  },
  async getPrograms(uploadId) {
    const db = await getDB();
    if (uploadId) return db.getAllFromIndex('programs', 'uploadId', uploadId);
    return db.getAll('programs');
  },
  async saveProgram(program) {
    const db = await getDB();
    await db.put('programs', { ...program, _localOnly: true, _updatedAt: Date.now() });
  },
  async deleteProgram(id) {
    const db = await getDB();
    await db.delete('programs', id);
  },

  // Uploads
  async saveUploads(uploads) {
    const db = await getDB();
    const tx = db.transaction('uploads', 'readwrite');
    await Promise.all(uploads.map(u => tx.store.put(u)));
    await tx.done;
  },
  async getUploads() {
    return (await getDB()).getAll('uploads');
  },

  // Sync queue
  async addToSyncQueue(item) {
    const db = await getDB();
    const entry = { ...item, clientId: `${Date.now()}-${Math.random()}`, status: 'pending', createdAt: Date.now() };
    await db.put('sync_queue', entry);
    return entry;
  },
  async getPendingSyncItems() {
    const db = await getDB();
    return db.getAllFromIndex('sync_queue', 'status', 'pending');
  },
  async markSynced(clientId) {
    const db = await getDB();
    const item = await db.get('sync_queue', clientId);
    if (item) await db.put('sync_queue', { ...item, status: 'completed' });
  },
  async markSyncFailed(clientId, error) {
    const db = await getDB();
    const item = await db.get('sync_queue', clientId);
    if (item) await db.put('sync_queue', { ...item, status: 'failed', error });
  },

  // Analytics cache
  async cacheAnalytics(key, data) {
    const db = await getDB();
    await db.put('analytics_cache', { key, data, cachedAt: Date.now() });
  },
  async getAnalyticsCache(key) {
    const db = await getDB();
    const cached = await db.get('analytics_cache', key);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > 5 * 60 * 1000) return null; // 5 min TTL
    return cached.data;
  },

  async clearAll() {
    const db = await getDB();
    await Promise.all(['programs','uploads','sync_queue','analytics_cache'].map(s => db.clear(s)));
  },
};
