import { blobToDataUrl } from '../utils/fileCompressor.js';

const DB_NAME = 'ADM_CONST_MEDIA_DB';
const DB_VERSION = 1;
const STORE_MEDIA = 'media_files';

const memoryFallbackStore = new Map();
const objectUrlCache = new Map();

let dbPromise = null;

function openMediaDb() {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };
    const timer = setTimeout(() => finish(null), 1500);
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          const store = db.createObjectStore(STORE_MEDIA, { keyPath: 'mediaId' });
          store.createIndex('s3Key', 's3Key', { unique: false });
          store.createIndex('proyectoId', 'proyectoId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('ownerEmail', 'ownerEmail', { unique: false });
        }
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        finish(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        finish(null);
      };
      req.onblocked = () => {
        clearTimeout(timer);
        finish(null);
      };
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });

  return dbPromise;
}

function makeMediaId() {
  if (globalThis.crypto?.randomUUID) {
    return `med_${globalThis.crypto.randomUUID()}`;
  }
  return `med_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Guarda un blob comprimido o documento en IndexedDB para lectura instantánea
 * y cola de reintentos sin saturar localStorage.
 */
export async function putCachedMediaBlob(entry = {}) {
  const mediaId = String(entry.mediaId || makeMediaId());
  const record = {
    mediaId,
    s3Key: String(entry.s3Key || ''),
    archivoId: String(entry.archivoId || ''),
    proyectoId: String(entry.proyectoId || ''),
    ownerEmail: String(entry.ownerEmail || '').toLowerCase(),
    modulo: String(entry.modulo || 'otros'),
    categoria: String(entry.categoria || 'project_files'),
    entidadId: String(entry.entidadId || ''),
    fileName: String(entry.fileName || 'archivo'),
    mimeType: String(entry.mimeType || entry.blob?.type || 'application/octet-stream'),
    originalBytes: Number(entry.originalBytes || entry.blob?.size || 0),
    finalBytes: Number(entry.finalBytes || entry.blob?.size || 0),
    sha256: String(entry.sha256 || ''),
    status: entry.status || (entry.s3Key ? 'synced' : 'pending_upload'),
    blob: entry.blob || null,
    metadata: entry.metadata || {},
    createdAt: entry.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  if (objectUrlCache.has(mediaId)) {
    URL.revokeObjectURL(objectUrlCache.get(mediaId));
    objectUrlCache.delete(mediaId);
  }

  const db = await openMediaDb();
  if (!db) {
    memoryFallbackStore.set(mediaId, record);
    return record;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      const store = tx.objectStore(STORE_MEDIA);
      store.put(record);
      tx.oncomplete = () => resolve(record);
      const fallback = () => {
        memoryFallbackStore.set(mediaId, record);
        resolve(record);
      };
      tx.onerror = fallback;
      tx.onabort = fallback;
    } catch {
      memoryFallbackStore.set(mediaId, record);
      resolve(record);
    }
  });
}

export async function getCachedMediaRecord(mediaIdOrS3Key) {
  const key = String(mediaIdOrS3Key || '').trim();
  if (!key) return null;

  const db = await openMediaDb();
  if (!db) {
    if (memoryFallbackStore.has(key)) return memoryFallbackStore.get(key);
    for (const rec of memoryFallbackStore.values()) {
      if (rec.s3Key === key) return rec;
    }
    return null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const store = tx.objectStore(STORE_MEDIA);
    const byIdReq = store.get(key);
    byIdReq.onsuccess = () => {
      if (byIdReq.result) {
        resolve(byIdReq.result);
        return;
      }
      const idx = store.index('s3Key');
      const byS3Req = idx.get(key);
      byS3Req.onsuccess = () => resolve(byS3Req.result || null);
      byS3Req.onerror = () => resolve(null);
    };
    byIdReq.onerror = () => resolve(null);
  });
}

export async function getCachedMediaObjectUrl(mediaIdOrS3Key) {
  const record = await getCachedMediaRecord(mediaIdOrS3Key);
  if (!record?.blob) return '';
  if (objectUrlCache.has(record.mediaId)) {
    return objectUrlCache.get(record.mediaId);
  }
  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(record.mediaId, url);
  return url;
}

export async function getCachedMediaDataUrl(mediaIdOrS3Key) {
  const record = await getCachedMediaRecord(mediaIdOrS3Key);
  if (!record?.blob) return '';
  return blobToDataUrl(record.blob);
}

export async function markMediaUploaded(mediaId, { s3Key, archivoId = '' } = {}) {
  const existing = await getCachedMediaRecord(mediaId);
  if (!existing) return null;
  return putCachedMediaBlob({
    ...existing,
    s3Key: s3Key || existing.s3Key,
    archivoId: archivoId || existing.archivoId,
    status: 'synced'
  });
}

export async function deleteCachedMediaRecord(mediaIdOrS3Key) {
  const record = await getCachedMediaRecord(mediaIdOrS3Key);
  if (!record) return false;

  if (objectUrlCache.has(record.mediaId)) {
    URL.revokeObjectURL(objectUrlCache.get(record.mediaId));
    objectUrlCache.delete(record.mediaId);
  }

  const db = await openMediaDb();
  if (!db) {
    return memoryFallbackStore.delete(record.mediaId);
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_MEDIA, 'readwrite');
    tx.objectStore(STORE_MEDIA).delete(record.mediaId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function getAllCachedMediaRecords() {
  const db = await openMediaDb();
  if (!db) {
    return Array.from(memoryFallbackStore.values());
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_MEDIA, 'readonly');
    const req = tx.objectStore(STORE_MEDIA).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => resolve([]);
  });
}

export async function listPendingUploads(proyectoId = '') {
  const all = await getAllCachedMediaRecords();
  return all.filter((item) => {
    if (item.status !== 'pending_upload' || !item.blob) return false;
    if (proyectoId && item.proyectoId && item.proyectoId !== proyectoId) return false;
    return true;
  });
}

export async function getLocalMediaStats(ownerEmail = '') {
  const normalized = String(ownerEmail || '').trim().toLowerCase();
  const all = await getAllCachedMediaRecords();
  let pendingBytes = 0;
  let pendingCatalogBytes = 0;
  let cachedBytes = 0;
  let pendingCount = 0;
  let cachedCount = 0;

  for (const item of all) {
    if (normalized && item.ownerEmail && item.ownerEmail !== normalized) continue;
    const size = Number(item.finalBytes || item.blob?.size || 0);
    cachedBytes += size;
    cachedCount += 1;
    if (item.status === 'pending_upload') {
      pendingCount += 1;
      if (item.categoria === 'master_catalog') {
        pendingCatalogBytes += size;
      } else {
        pendingBytes += size;
      }
    }
  }

  return {
    pendingBytes,
    pendingCatalogBytes,
    cachedBytes,
    pendingCount,
    cachedCount
  };
}
