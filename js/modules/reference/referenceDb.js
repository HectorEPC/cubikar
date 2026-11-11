// js/modules/reference/referenceDb.js
// Gestor de base de datos local IndexedDB para Catálogos Maestros de Referencia

import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import {
  STORAGE_KEY_USER,
  STORAGE_KEY_ACTIVE_WORKSPACE,
  STORAGE_KEY_SUBSCRIPTION
} from '../../config/constants.js';

const DB_NAME = 'APU_REFERENCE_DB';
const DB_VERSION = 1;

let dbInstance = null;

// ========================================================
// RESTRICCIONES DE ALMACENAMIENTO RESERVADO PARA CATÁLOGO MAESTRO (EN MB)
// Dentro de la cuota unificada global del plan: 200 MB / 2 GB / 5 GB.
// ========================================================
export const PLAN_STORAGE_MB = {
  free: { planId: 'free', name: 'Gratuita', storageMb: 6, totalQuotaMb: 200 },
  plus: { planId: 'plus', name: 'Plus', storageMb: 50, totalQuotaMb: 2048 },
  pro: { planId: 'pro', name: 'Pro', storageMb: 200, totalQuotaMb: 5120 }
};

// Obtener plan de suscripción para un propietario específico
export function getWorkspacePlanInfo(ownerEmail) {
  const normEmail = (ownerEmail || '').toLowerCase().trim();
  try {
    if (normEmail && typeof localStorage !== 'undefined') {
      const rawUserSub = localStorage.getItem(`adm_const_subscription_${normEmail}`);
      if (rawUserSub) {
        const parsed = JSON.parse(rawUserSub);
        if (parsed?.planId && PLAN_STORAGE_MB[parsed.planId]) {
          return PLAN_STORAGE_MB[parsed.planId];
        }
      }
      const rawReg = localStorage.getItem('control_obra_registered_accounts_v1');
      if (rawReg) {
        const regList = JSON.parse(rawReg);
        const acc = regList.find(a => (a.email || '').toLowerCase().trim() === normEmail);
        if (acc?.subscription?.planId && PLAN_STORAGE_MB[acc.subscription.planId]) {
          return PLAN_STORAGE_MB[acc.subscription.planId];
        }
      }
      const rawProj = localStorage.getItem('control_obra_projects_v1');
      if (rawProj) {
        const projList = JSON.parse(rawProj);
        const hp = projList.find(p => (p.ownerEmail || '').toLowerCase().trim() === normEmail && p.ownerPlanId);
        if (hp?.ownerPlanId && PLAN_STORAGE_MB[hp.ownerPlanId]) {
          return PLAN_STORAGE_MB[hp.ownerPlanId];
        }
      }
    }

    if (typeof localStorage !== 'undefined') {
      const rawUser = localStorage.getItem(STORAGE_KEY_USER);
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u?.email && u.email.toLowerCase().trim() === normEmail) {
          if (u.subscription?.planId && PLAN_STORAGE_MB[u.subscription.planId]) {
            return PLAN_STORAGE_MB[u.subscription.planId];
          }
          const rawGlobalSub = localStorage.getItem(STORAGE_KEY_SUBSCRIPTION);
          if (rawGlobalSub) {
            const parsed = JSON.parse(rawGlobalSub);
            if (parsed?.planId && PLAN_STORAGE_MB[parsed.planId]) {
              return PLAN_STORAGE_MB[parsed.planId];
            }
          }
        }
      }
    }
  } catch (e) {}

  return PLAN_STORAGE_MB.free;
}

// Obtener contexto del espacio de trabajo activo (titular, email y cuota de almacenamiento)
export function getActiveWorkspaceContext() {
  let currentUserEmail = 'admin.general@constructora.com';
  let currentUserName = 'Hepc 90';

  try {
    if (typeof localStorage !== 'undefined') {
      const rawUser = localStorage.getItem(STORAGE_KEY_USER);
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u?.email) {
          currentUserEmail = u.email;
          currentUserName = u.name || u.email;
        }
      }
    }
  } catch (e) {}

  let effectiveOwnerEmail = currentUserEmail;
  let effectiveOwnerName = currentUserName;
  let isInvitedWorkspace = false;

  try {
    if (typeof localStorage !== 'undefined') {
      const rawWs = localStorage.getItem(STORAGE_KEY_ACTIVE_WORKSPACE);
      if (rawWs) {
        let wsData = null;
        try {
          wsData = JSON.parse(rawWs);
        } catch (err) {
          if (typeof rawWs === 'string' && rawWs.startsWith('owner:')) {
            wsData = { ownerEmail: rawWs.replace('owner:', '').trim() };
          }
        }

        if (wsData?.ownerEmail) {
          effectiveOwnerEmail = wsData.ownerEmail.trim();
          effectiveOwnerName = wsData.ownerName || effectiveOwnerEmail;
          if (effectiveOwnerEmail.toLowerCase() !== currentUserEmail.toLowerCase()) {
            isInvitedWorkspace = true;
          }
        }
      }
    }
  } catch (e) {}

  const plan = getWorkspacePlanInfo(effectiveOwnerEmail);

  return {
    currentUserEmail: currentUserEmail.toLowerCase(),
    currentUserName,
    ownerEmail: effectiveOwnerEmail.toLowerCase(),
    ownerName: effectiveOwnerName,
    isInvitedWorkspace,
    planId: plan.planId,
    planName: plan.name,
    maxStorageMb: plan.storageMb
  };
}

// Helper rápido para obtener el email del titular del espacio activo
export function getActiveWorkspaceOwnerEmail() {
  return getActiveWorkspaceContext().ownerEmail;
}

// Verificar si la importación cabe en el almacenamiento del plan del espacio de trabajo
export async function canImportReferenceCatalog(estimatedBytes = 0, targetOwnerEmail = null) {
  const context = getActiveWorkspaceContext();
  const owner = (targetOwnerEmail || context.ownerEmail).toLowerCase().trim();
  const stats = await getReferenceDatabaseStats(owner);

  const neededBytes = Math.max(0, estimatedBytes);
  const totalAfterBytes = stats.totalBytes + neededBytes;
  const maxBytes = stats.maxStorageMb * 1024 * 1024;
  const allowed = totalAfterBytes <= maxBytes;

  return {
    allowed,
    ownerEmail: owner,
    ownerName: stats.ownerName,
    planName: stats.planName,
    currentBytes: stats.totalBytes,
    currentMb: stats.totalMb,
    neededBytes,
    neededMb: parseFloat((neededBytes / (1024 * 1024)).toFixed(2)),
    afterMb: parseFloat((totalAfterBytes / (1024 * 1024)).toFixed(2)),
    maxStorageMb: stats.maxStorageMb,
    usagePct: stats.maxStorageMb > 0 ? Math.min(100, Math.round((stats.totalBytes / maxBytes) * 100)) : 0
  };
}

export function openReferenceDb() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store para metadatos de los catálogos importados
      if (!db.objectStoreNames.contains('catalogs')) {
        const catStore = db.createObjectStore('catalogs', { keyPath: 'id' });
        catStore.createIndex('name', 'name', { unique: false });
        catStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Store para los conceptos e insumos de referencia
      if (!db.objectStoreNames.contains('items')) {
        const itemStore = db.createObjectStore('items', { keyPath: 'id' });
        itemStore.createIndex('catalogId', 'catalogId', { unique: false });
        itemStore.createIndex('tipo', 'tipo', { unique: false });
        itemStore.createIndex('clave', 'clave', { unique: false });
        itemStore.createIndex('catalogAndTipo', ['catalogId', 'tipo'], { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Error abriendo IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Guardar un catálogo nuevo con todos sus elementos (conceptos o insumos)
export async function saveReferenceCatalog(catalogMeta, itemsList, targetOwnerEmail = null) {
  const db = await openReferenceDb();
  const context = getActiveWorkspaceContext();
  const ownerEmail = (targetOwnerEmail || context.ownerEmail).toLowerCase().trim();

  // Calcular tamaño real en bytes del catálogo importado
  let sizeBytes = 0;
  try {
    const jsonStr = JSON.stringify(itemsList);
    sizeBytes = new Blob([jsonStr]).size;
  } catch (e) {
    sizeBytes = itemsList.length * 450;
  }
  const sizeMb = parseFloat((sizeBytes / (1024 * 1024)).toFixed(2));

  const catalogId = catalogMeta.id || 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const catalogRecord = {
    id: catalogId,
    name: catalogMeta.name || 'Catálogo de Referencia',
    category: catalogMeta.category || 'General', // Edificación, Instalaciones, Gobierno, etc.
    type: catalogMeta.type || 'mixto', // conceptos, materiales, mano_obra, maquinaria, mixto
    sourceFileName: catalogMeta.sourceFileName || '',
    itemsCount: itemsList.length,
    sizeBytes: sizeBytes,
    sizeMb: sizeMb,
    ownerEmail: ownerEmail,
    createdAt: new Date().toISOString()
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['catalogs', 'items'], 'readwrite');
    const catStore = tx.objectStore('catalogs');
    const itemStore = tx.objectStore('items');

    catStore.put(catalogRecord);

    itemsList.forEach((item, index) => {
      const itemRecord = {
        id: `${catalogId}_${index}_${item.clave || ''}`,
        catalogId: catalogId,
        catalogName: catalogRecord.name,
        tipo: item.tipo || 'Concepto', // Concepto, Material, Mano de Obra, Equipo, Subcontrato
        clave: (item.clave || '').toString().trim(),
        descripcion: (item.descripcion || '').toString().trim(),
        unidad: (item.unidad || 'pza').toString().trim(),
        precioUnitario: parseFloat(item.precioUnitario || item.costoUnitario || 0) || 0,
        familia: (item.familia || '').toString().trim(),
        preciosZonas: item.preciosZonas || null,
        ownerEmail: ownerEmail,
        insumos: (Array.isArray(item.insumos) && item.insumos.length > 0) ? item.insumos : (item.insumos || null)
      };
      itemStore.put(itemRecord);
    });

    tx.oncomplete = () => {
      backupMasterCatalogToCloud(catalogRecord, itemsList).catch(() => {});
      import('../../services/storageQuotaService.js')
        .then((m) => m.notifyStorageUsageChanged({ modulo: 'catalogos_maestros' }))
        .catch(() => {});
      resolve(catalogRecord);
    };

    tx.onerror = (e) => {
      console.error('Error guardando catálogo en IndexedDB:', e.target.error);
      reject(e.target.error);
    };
  });
}

// Obtener la lista de todos los catálogos guardados para el titular del espacio de trabajo
export async function listReferenceCatalogs(ownerEmail = null) {
  const db = await openReferenceDb();
  const targetOwner = (ownerEmail || getActiveWorkspaceOwnerEmail()).toLowerCase().trim();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('catalogs', 'readonly');
    const store = tx.objectStore('catalogs');
    const request = store.getAll();

    request.onsuccess = () => {
      const allCatalogs = request.result || [];
      const filtered = allCatalogs.filter(c => {
        const catOwner = (c.ownerEmail || 'admin.general@constructora.com').toLowerCase().trim();
        return catOwner === targetOwner;
      });
      resolve(filtered);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

// Eliminar un catálogo y todos sus items asociados (local IndexedDB + AWS S3 + Supabase)
export async function deleteReferenceCatalog(catalogId) {
  const db = await openReferenceDb();

  const existingRecord = await new Promise((resolve) => {
    try {
      const readTx = db.transaction('catalogs', 'readonly');
      const req = readTx.objectStore('catalogs').get(catalogId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['catalogs', 'items'], 'readwrite');
    const catStore = tx.objectStore('catalogs');
    const itemStore = tx.objectStore('items');

    catStore.delete(catalogId);

    const index = itemStore.index('catalogId');
    const request = index.openCursor(IDBKeyRange.only(catalogId));

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      deleteMasterCatalogFromCloud(catalogId, existingRecord).catch(() => {});
      import('../../services/storageQuotaService.js')
        .then((m) => m.notifyStorageUsageChanged({ modulo: 'catalogos_maestros', deleted: true }))
        .catch(() => {});
      resolve(true);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function updateCatalogCloudMetadata(catalogId, patch) {
  try {
    const db = await openReferenceDb();
    const tx = db.transaction('catalogs', 'readwrite');
    const store = tx.objectStore('catalogs');
    const req = store.get(catalogId);
    req.onsuccess = () => {
      if (req.result) {
        store.put({ ...req.result, ...patch });
      }
    };
  } catch {
    // No bloquear por actualización de metadata
  }
}

async function backupMasterCatalogToCloud(catalogRecord, itemsList) {
  try {
    const [{ isSupabaseConfigured, getSupabaseClient }, { resolveUserEmpresaId }, { uploadManagedFile }] = await Promise.all([
      import('../../core/supabaseClient.js'),
      import('../../core/cloudProjectService.js'),
      import('../../services/s3StorageService.js')
    ]);

    const payloadJson = JSON.stringify({ meta: catalogRecord, items: itemsList });
    const file = new File([payloadJson], `${catalogRecord.id}.json`, { type: 'application/json' });

    const uploadRes = await uploadManagedFile({
      file,
      modulo: 'catalogos_maestros',
      categoria: 'master_catalog',
      proyectoId: '',
      entidadId: catalogRecord.id,
      showFeedback: false,
      metadata: {
        name: catalogRecord.name,
        category: catalogRecord.category,
        itemsCount: catalogRecord.itemsCount
      }
    });

    if (uploadRes?.ok) {
      await updateCatalogCloudMetadata(catalogRecord.id, {
        mediaId: uploadRes.mediaId || '',
        s3Key: uploadRes.s3Key || '',
        archivoId: uploadRes.archivoId || ''
      });
    }

    if (!isSupabaseConfigured()) return;
    const sb = await getSupabaseClient();
    if (!sb) return;
    const { data: userRes } = await sb.auth.getUser();
    const user = userRes?.user;
    if (!user) return;
    const empresaId = await resolveUserEmpresaId(sb, user);

    await sb.from('catalogos_maestros').upsert({
      id: catalogRecord.id,
      empresa_id: empresaId || null,
      owner_email: catalogRecord.ownerEmail,
      nombre: catalogRecord.name,
      version: '1.0',
      total_conceptos: catalogRecord.itemsCount,
      tamano_bytes: catalogRecord.sizeBytes,
      s3_key: uploadRes?.s3Key || '',
      archivo_id: uploadRes?.archivoId || null,
      resumen_json: {
        category: catalogRecord.category,
        type: catalogRecord.type,
        sourceFileName: catalogRecord.sourceFileName,
        mediaId: uploadRes?.mediaId || ''
      }
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('[referenceDb] Respaldo en nube de catálogo maestro omitido/pendiente:', err?.message || err);
  }
}

async function deleteMasterCatalogFromCloud(catalogId, existingRecord) {
  try {
    const [{ isSupabaseConfigured, getSupabaseClient }, { deleteManagedFile }] = await Promise.all([
      import('../../core/supabaseClient.js'),
      import('../../services/s3StorageService.js')
    ]);

    if (existingRecord?.mediaId || existingRecord?.s3Key) {
      await deleteManagedFile({
        mediaId: existingRecord.mediaId || '',
        s3Key: existingRecord.s3Key || '',
        archivoId: existingRecord.archivoId || ''
      });
    }

    if (!isSupabaseConfigured()) return;
    const sb = await getSupabaseClient();
    if (!sb) return;
    await sb.from('catalogos_maestros')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', catalogId);
  } catch (err) {
    console.warn('[referenceDb] Error limpiando catálogo en nube:', err?.message || err);
  }
}

/**
 * Descarga desde AWS S3 / Supabase los catálogos maestros guardados por el anfitrión
 * que todavía no existan en este navegador (IndexedDB).
 */
export async function syncMasterCatalogsFromCloud(ownerEmail = null) {
  try {
    const [{ isSupabaseConfigured, getSupabaseClient }, { resolveManagedFileUrl }] = await Promise.all([
      import('../../core/supabaseClient.js'),
      import('../../services/s3StorageService.js')
    ]);

    if (!isSupabaseConfigured()) return { restored: 0 };
    const sb = await getSupabaseClient();
    if (!sb) return { restored: 0 };
    const { data: sessionRes } = await sb.auth.getSession();
    if (!sessionRes?.session) return { restored: 0 };

    const targetOwner = (ownerEmail || getActiveWorkspaceOwnerEmail()).toLowerCase().trim();
    const { data: cloudCats, error } = await sb
      .from('catalogos_maestros')
      .select('*')
      .ilike('owner_email', targetOwner)
      .is('deleted_at', null);

    if (error || !Array.isArray(cloudCats) || cloudCats.length === 0) {
      return { restored: 0 };
    }

    const localCats = await listReferenceCatalogs(targetOwner);
    const localIds = new Set(localCats.map((c) => c.id));
    let restored = 0;

    for (const remoteCat of cloudCats) {
      if (localIds.has(remoteCat.id) || !remoteCat.s3_key) continue;
      const downloadUrl = await resolveManagedFileUrl({ s3Key: remoteCat.s3_key });
      if (!downloadUrl) continue;
      const resp = await fetch(downloadUrl);
      if (!resp.ok) continue;
      const parsed = await resp.json().catch(() => null);
      if (!parsed || !Array.isArray(parsed.items)) continue;

      const db = await openReferenceDb();
      await new Promise((resolve) => {
        const tx = db.transaction(['catalogs', 'items'], 'readwrite');
        tx.objectStore('catalogs').put({
          ...(parsed.meta || {}),
          id: remoteCat.id,
          name: remoteCat.nombre,
          ownerEmail: targetOwner,
          s3Key: remoteCat.s3_key,
          archivoId: remoteCat.archivo_id || ''
        });
        const itemStore = tx.objectStore('items');
        for (const item of parsed.items) {
          itemStore.put({ ...item, catalogId: remoteCat.id, ownerEmail: targetOwner });
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
      restored += 1;
    }

    return { restored };
  } catch (err) {
    console.warn('[referenceDb] Sync desde nube fallido:', err?.message || err);
    return { restored: 0 };
  }
}

// Buscar en la base de datos de referencia con filtros y texto (estrictamente filtrado por titular)
export async function searchReferenceItems({ catalogId = 'all', tipo = 'all', query = '', limit = 100, ownerEmail = null }) {
  const allowedCatalogs = await listReferenceCatalogs(ownerEmail);
  const allowedCatIds = new Set(allowedCatalogs.map(c => c.id));

  // Si el titular no tiene catálogos cargados para este espacio de trabajo, retornar vacío de inmediato
  if (allowedCatIds.size === 0) {
    return [];
  }

  // Si especificó un catálogo que no pertenece al espacio activo, no mostrar resultados ajenos
  if (catalogId !== 'all' && !allowedCatIds.has(catalogId)) {
    return [];
  }

  const db = await openReferenceDb();
  const searchTerms = (query || '').toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const results = [];

    let request;
    if (catalogId !== 'all' && tipo !== 'all') {
      const index = store.index('catalogAndTipo');
      request = index.openCursor(IDBKeyRange.only([catalogId, tipo]));
    } else if (catalogId !== 'all') {
      const index = store.index('catalogId');
      request = index.openCursor(IDBKeyRange.only(catalogId));
    } else if (tipo !== 'all') {
      const index = store.index('tipo');
      request = index.openCursor(IDBKeyRange.only(tipo));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const item = cursor.value;

        // Validar pertenencia estricta a un catálogo del titular activo
        if (!allowedCatIds.has(item.catalogId)) {
          cursor.continue();
          return;
        }

        // Comprobación de términos de búsqueda en clave y descripción
        let matches = true;
        if (searchTerms.length > 0) {
          const itemText = `${item.clave} ${item.descripcion} ${item.familia || ''}`.toLowerCase();
          for (const term of searchTerms) {
            if (!itemText.includes(term)) {
              matches = false;
              break;
            }
          }
        }

        if (matches) {
          if (item.tipo === 'Concepto' && (!item.insumos || item.insumos.length === 0)) {
            item.insumos = generateIntegratedMatrixForConcept(item);
          }
          results.push(item);
          if (results.length >= limit) {
            return resolve(results);
          }
        }

        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// Conteo total de items, catálogos y MB ocupados del titular activo
export async function getReferenceDatabaseStats(ownerEmail = null) {
  const context = getActiveWorkspaceContext();
  const targetOwner = (ownerEmail || context.ownerEmail).toLowerCase().trim();
  const catalogs = await listReferenceCatalogs(targetOwner);

  let totalItems = 0;
  let totalBytes = 0;

  catalogs.forEach(c => {
    totalItems += (c.itemsCount || 0);
    const catBytes = c.sizeBytes || ((c.itemsCount || 0) * 450);
    totalBytes += catBytes;
  });

  const totalMb = parseFloat((totalBytes / (1024 * 1024)).toFixed(2));
  const plan = getWorkspacePlanInfo(targetOwner);
  const maxStorageMb = plan.storageMb;
  const maxBytes = maxStorageMb * 1024 * 1024;
  const usagePct = maxBytes > 0 ? Math.min(100, Math.round((totalBytes / maxBytes) * 100)) : 0;

  return {
    catalogsCount: catalogs.length,
    totalItems: totalItems,
    totalBytes: totalBytes,
    totalMb: totalMb,
    maxStorageMb: maxStorageMb,
    usagePct: usagePct,
    ownerEmail: targetOwner,
    ownerName: (targetOwner === context.ownerEmail) ? context.ownerName : targetOwner,
    planId: plan.planId,
    planName: plan.name,
    catalogs: catalogs
  };
}

// Obtener todos los items para los catálogos seleccionados del titular
export async function getItemsByCatalogIds(catalogIds = 'all', ownerEmail = null) {
  const allowedCatalogs = await listReferenceCatalogs(ownerEmail);
  const userCatIds = new Set(allowedCatalogs.map(c => c.id));
  if (userCatIds.size === 0) return [];

  let allowedCatalogIds = null;
  if (Array.isArray(catalogIds)) {
    allowedCatalogIds = new Set(catalogIds.filter(id => userCatIds.has(id)));
  } else if (catalogIds && catalogIds !== 'all') {
    allowedCatalogIds = userCatIds.has(catalogIds) ? new Set([catalogIds]) : new Set();
  } else {
    allowedCatalogIds = userCatIds;
  }

  if (allowedCatalogIds.size === 0) return [];

  const db = await openReferenceDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const results = [];

    let request;
    if (allowedCatalogIds && allowedCatalogIds.size === 1) {
      const singleId = Array.from(allowedCatalogIds)[0];
      const index = store.index('catalogId');
      request = index.openCursor(IDBKeyRange.only(singleId));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const item = cursor.value;
        if (!allowedCatalogIds || allowedCatalogIds.has(item.catalogId)) {
          results.push(item);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// Buscar insumos y componentes reales en todos los catálogos cargados en Catálogo Maestro para el titular
export async function searchSuppliesInLoadedCatalogs({ query = '', keywords = [], tipos = [], catalogId = 'all', catalogIds = 'all', limit = 15, ownerEmail = null }) {
  const allowedCatalogs = await listReferenceCatalogs(ownerEmail);
  const userCatIds = new Set(allowedCatalogs.map(c => c.id));
  if (userCatIds.size === 0) return [];

  const db = await openReferenceDb();

  const cleanQuery = (query || '').toLowerCase().trim();
  const rawTerms = [
    ...cleanQuery.replace(/[^a-záéíóúüñ0-9/.-]/g, ' ').split(/\s+/).filter(t => t.length > 1),
    ...(keywords || []).map(k => (k || '').toLowerCase().replace(/[^a-záéíóúüñ0-9/.-]/g, ' ').trim()).filter(k => k.length > 1)
  ];
  const uniqueTerms = Array.from(new Set(rawTerms));

  const tiposSet = tipos && tipos.length > 0 ? new Set(tipos.map(t => t.toLowerCase())) : null;

  // Filtrado de catálogos considerados respetando titular
  let allowedCatalogIds = null;
  const rawCats = catalogIds !== 'all' ? catalogIds : catalogId;
  if (Array.isArray(rawCats)) {
    allowedCatalogIds = new Set(rawCats.filter(id => userCatIds.has(id)));
  } else if (rawCats && rawCats !== 'all') {
    allowedCatalogIds = userCatIds.has(rawCats) ? new Set([rawCats]) : new Set();
  } else {
    allowedCatalogIds = userCatIds;
  }

  if (allowedCatalogIds.size === 0) return [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const scoredResults = [];

    let request;
    if (allowedCatalogIds && allowedCatalogIds.size === 1) {
      const singleId = Array.from(allowedCatalogIds)[0];
      const index = store.index('catalogId');
      request = index.openCursor(IDBKeyRange.only(singleId));
    } else {
      request = store.openCursor();
    }

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const item = cursor.value;

        // Comprobar catálogo permitido
        if (!allowedCatalogIds.has(item.catalogId)) {
          cursor.continue();
          return;
        }

        const itemTipo = (item.tipo || '').toLowerCase();

        // Filtrar por tipos si se especificó
        let tipoMatches = true;
        if (tiposSet) {
          tipoMatches = tiposSet.has(itemTipo);
          if (!tipoMatches) {
            if (tiposSet.has('material') && (itemTipo.includes('mat') || itemTipo.includes('insumo') || itemTipo.includes('básico') || itemTipo.includes('basico'))) tipoMatches = true;
            if (tiposSet.has('mano de obra') && (itemTipo.includes('obra') || itemTipo.includes('cuadrilla') || itemTipo.includes('mo'))) tipoMatches = true;
            if (tiposSet.has('equipo') && (itemTipo.includes('equipo') || itemTipo.includes('maq') || itemTipo.includes('herr'))) tipoMatches = true;
          }
        }

        if (tipoMatches) {
          const itemDesc = (item.descripcion || '').toLowerCase();
          const itemClave = (item.clave || '').toLowerCase();
          const itemText = `${itemClave} ${itemDesc} ${(item.familia || '')}`.toLowerCase();

          let score = 0;

          // Coincidencia exacta de frase
          if (cleanQuery.length > 2 && itemDesc.includes(cleanQuery)) {
            score += 25;
          }

          // Coincidencia por términos individuales
          let matchedTermsCount = 0;
          for (const term of uniqueTerms) {
            if (itemText.includes(term)) {
              matchedTermsCount++;
              score += term.length >= 4 ? 4 : 2;
            }
          }

          // Si coincide con al menos 1 término importante o la consulta estaba vacía
          if (uniqueTerms.length === 0 || matchedTermsCount > 0) {
            const pu = parseFloat(item.precioUnitario || item.costoUnitario || 0);
            if (pu > 0) {
              score += 2;
            }
            if (Array.isArray(item.insumos) && item.insumos.length > 0) {
              score += 15;
            }

            scoredResults.push({ item, score, matchedTermsCount });
          }
        }

        cursor.continue();
      } else {
        scoredResults.sort((a, b) => b.score - a.score || b.matchedTermsCount - a.matchedTermsCount);
        const topResults = scoredResults.slice(0, limit).map(r => r.item);
        resolve(topResults);
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

// Buscar si un concepto con matriz completa ya existe en los catálogos cargados del titular
export async function findDirectConceptWithInsumos(conceptDesc, conceptUnit, catalogIds = 'all', ownerEmail = null) {
  const allowedCatalogs = await listReferenceCatalogs(ownerEmail);
  const userCatIds = new Set(allowedCatalogs.map(c => c.id));
  if (userCatIds.size === 0) return null;

  const db = await openReferenceDb();
  const cDesc = (conceptDesc || '').toLowerCase().trim();
  const cUnit = (conceptUnit || '').toLowerCase().trim();
  const words = cDesc.replace(/[^a-záéíóúüñ0-9/.-]/g, ' ').split(/\s+/).filter(w => w.length > 3);

  let allowedCatalogIds = null;
  if (Array.isArray(catalogIds)) {
    allowedCatalogIds = new Set(catalogIds.filter(id => userCatIds.has(id)));
  } else if (catalogIds && catalogIds !== 'all') {
    allowedCatalogIds = userCatIds.has(catalogIds) ? new Set([catalogIds]) : new Set();
  } else {
    allowedCatalogIds = userCatIds;
  }

  if (allowedCatalogIds.size === 0) return null;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const index = store.index('tipo');
    const request = index.openCursor(IDBKeyRange.only('Concepto'));

    let bestConcept = null;
    let bestScore = 0;

    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const item = cursor.value;

        if (!allowedCatalogIds.has(item.catalogId)) {
          cursor.continue();
          return;
        }

        const iDesc = (item.descripcion || '').toLowerCase();
        const iUnit = (item.unidad || '').toLowerCase().trim();

        let score = 0;
        for (const w of words) {
          if (iDesc.includes(w)) score += 2;
        }

        if (cUnit && iUnit && cUnit === iUnit) score += 3;
        if (Array.isArray(item.insumos) && item.insumos.length > 0) score += 10;

        if (score > bestScore && score >= 12) {
          bestScore = score;
          bestConcept = item;
        }

        cursor.continue();
      } else {
        resolve(bestConcept);
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}
