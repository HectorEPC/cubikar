import { getStorageKey, getSettingsKey, getActiveProjectId, STORAGE_KEY_CLIPBOARD } from '../config/constants.js?v=20261119_cf40';
import { defaultTreeData, defaultSettings } from '../config/defaultData.js?v=20261119_cf40';
import { syncActiveProjectSummary, getProjectById, getProjectsList, saveProjectsList, isProjectMarkedDeleted, canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf40';
import { syncProjectToCloud, loadProjectTreeFromCloud } from '../core/cloudProjectService.js?v=20261119_cf40';
import { broadcastProjectMutation } from '../core/realtimeSync.js?v=20261119_cf40';
import { sanitizeCatalogNodes } from '../core/textSanitizer.js?v=20261119_cf40';
import { CASA_LAURA_PROJECT } from '../modules/io/casaLauraData.js?v=20261119_cf40';
import { recalcTreeFromMatrices, computeFactorSobrecosto } from '../core/matrixMath.js?v=20261119_cf40';

// Estado global reactivo y centralizado de la aplicación
export const state = {
  treeData: [],
  settings: Object.assign({}, defaultSettings),
  activeSelectedId: null,
  currentFilter: 'Todos',
  currentMatrizFilter: 'Todos',
  clipboardNode: null,
  clipboardMeta: null
};

let localTreeMutationSeq = 0;
export function bumpLocalTreeMutationSeq() {
  localTreeMutationSeq++;
  return localTreeMutationSeq;
}
export function getLocalTreeMutationSeq() {
  return localTreeMutationSeq;
}

function ensureLocalTreeUuids(nodes) {
  let mutated = false;
  const genUuid = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  };
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((n) => {
      if (!n || typeof n !== 'object') return;
      if (!n.uuid || !/^[0-9a-f]{8}-/i.test(String(n.uuid))) {
        n.uuid = (n.id && /^[0-9a-f]{8}-/i.test(String(n.id))) ? n.id : genUuid();
        mutated = true;
      }
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach((ins) => {
          if (!ins || typeof ins !== 'object') return;
          if (!ins.uuid || !/^[0-9a-f]{8}-/i.test(String(ins.uuid))) {
            ins.uuid = (ins.id && /^[0-9a-f]{8}-/i.test(String(ins.id))) ? ins.id : genUuid();
            mutated = true;
          }
        });
      }
      if (Array.isArray(n.children)) walk(n.children);
    });
  };
  walk(nodes);
  return mutated;
}

// Sincronizar portapapeles compartido entre proyectos desde localStorage
export function syncClipboardFromStorage() {
  try {
    const rawClip = localStorage.getItem(STORAGE_KEY_CLIPBOARD);
    if (rawClip) {
      const parsed = JSON.parse(rawClip);
      state.clipboardNode = parsed.concept || parsed;
      state.clipboardMeta = {
        sourceProjectId: parsed.sourceProjectId || null,
        sourceProjectName: parsed.sourceProjectName || '',
        insumosCount: parsed.insumosCount || (parsed.concept?.insumos?.length || 0),
        copiedAt: parsed.copiedAt || null
      };
    } else {
      state.clipboardNode = null;
      state.clipboardMeta = null;
    }
  } catch (e) {
    state.clipboardNode = null;
    state.clipboardMeta = null;
  }
}

// Cargar estado inicial desde localStorage
export function initStore() {
  // Sincronizar portapapeles compartido de conceptos entre proyectos
  syncClipboardFromStorage();

  // Cargar configuración (priorizando localStorage, luego metadatos del proyecto descargado)
  let hadSavedSettings = false;
  let bootProjMeta = null;
  try {
    const activeSettingsPid = getActiveProjectId();
    bootProjMeta = activeSettingsPid ? getProjectById(activeSettingsPid) : null;
    const savedSettings = localStorage.getItem(getSettingsKey());
    if (savedSettings) {
      hadSavedSettings = true;
      state.settings = Object.assign({}, defaultSettings, JSON.parse(savedSettings));
    } else {
      const cloudOverrides = {};
      if (bootProjMeta && typeof bootProjMeta === 'object') {
        const metaKeys = [
          'companyName', 'companySubtitle', 'companyLogo', 'projectName', 'projectLocation',
          'currency', 'currencySymbol', 'applySobrecosto',
          'pctIndirectos', 'pctFinanciamiento', 'pctUtilidad',
          'pctAdicionales', 'pctSegurosFianzas', 'pctFasar', 'anticipoPct', 'ivaPct', 'createdAt'
        ];
        metaKeys.forEach((k) => {
          if (bootProjMeta[k] !== undefined) cloudOverrides[k] = bootProjMeta[k];
        });
        if (Array.isArray(bootProjMeta.budgetSignatures)) {
          cloudOverrides.budgetSignatures = JSON.parse(JSON.stringify(bootProjMeta.budgetSignatures));
        }
      }
      state.settings = Object.assign({}, defaultSettings, cloudOverrides);
    }
  } catch (e) {
    console.error('Error cargando configuración:', e);
    state.settings = Object.assign({}, defaultSettings);
  }

  // Auto-sanitizar firmas del presupuesto si estuviesen corruptas en localStorage
  if (Array.isArray(state.settings?.budgetSignatures)) {
    const sanitizeMojibake = (str) => {
      if (typeof str !== 'string' || !str) return str || '';
      return str
        .replace(/Ã“|Ã\u201c|Ã\u0093/g, 'Ó')
        .replace(/Ã³/g, 'ó')
        .replace(/Ã­|Ã\u00ad/g, 'í')
        .replace(/Ã‰/g, 'É')
        .replace(/Ã©/g, 'é')
        .replace(/Ã |Ã\u0081/g, 'Á')
        .replace(/Ã¡/g, 'á')
        .replace(/Ãš/g, 'Ú')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã‘/g, 'Ñ')
        .replace(/Ã±/g, 'ñ')
        .replace(/Ã(?=[a-zA-ZáéíóúñÁÉÍÓÚÑ])/g, 'í')
        .replace(/Â¿/g, '¿')
        .replace(/Â¡/g, '¡');
    };
    state.settings.budgetSignatures = state.settings.budgetSignatures.map(s => ({
      rol: sanitizeMojibake(s.rol || 'FIRMA'),
      nombre: sanitizeMojibake(s.nombre || ''),
      cargo: sanitizeMojibake(s.cargo || '')
    }));
  }

  // Cargar árbol de catálogo
  try {
    const activePId = getActiveProjectId();
    const savedData = localStorage.getItem(getStorageKey());
    if (savedData) {
      state.treeData = JSON.parse(savedData);
    } else if (!activePId) {
      state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
    } else {
      state.treeData = [];
    }
    if (Array.isArray(state.treeData) && ensureLocalTreeUuids(state.treeData) && activePId) {
      try { localStorage.setItem(getStorageKey(activePId), JSON.stringify(state.treeData)); } catch (_) {}
    }

    // Si el proyecto está activo, sincronizar con Supabase SIN pisar mutaciones locales concurrentes durante la carga
    if (activePId) {
      const bootMutationSeq = localTreeMutationSeq;
      const prevSettingsRaw = typeof localStorage !== 'undefined' ? (localStorage.getItem(getSettingsKey(activePId)) || '') : '';
      loadProjectTreeFromCloud(activePId).then(cloudTree => {
        if (localTreeMutationSeq !== bootMutationSeq) {
          triggerDebouncedCloudSync();
          return;
        }
        let hasPendingInitial = false;
        try { hasPendingInitial = sessionStorage.getItem(`cubikar_pending_initial_upload_${activePId}`) === '1'; } catch (_) {}
        let didSettingsChange = false;
        try {
          const nextSettingsRaw = localStorage.getItem(getSettingsKey(activePId)) || '';
          if (nextSettingsRaw && (nextSettingsRaw !== prevSettingsRaw || !hadSavedSettings)) {
            state.settings = Object.assign({}, defaultSettings, JSON.parse(nextSettingsRaw));
            didSettingsChange = true;
          }
        } catch (_) {}

        if (Array.isArray(cloudTree) && cloudTree.length > 0) {
          const currentProjMeta = getProjectById(activePId);
          const localHasNodes = savedData && Array.isArray(state.treeData) && state.treeData.length > 0;
          if (localHasNodes && isCloudDirty(activePId)) {
            if (didSettingsChange && typeof window !== 'undefined') {
              if (typeof window.renderBrandingUI === 'function') window.renderBrandingUI();
              if (typeof window.updateSobrecostoBadge === 'function') window.updateSobrecostoBadge();
            }
            triggerDebouncedCloudSync();
            return;
          }
          if ((hasPendingInitial || !currentProjMeta?.isCloudSynced) && localHasNodes && cloudTree.length < state.treeData.length) {
            if (didSettingsChange && typeof window !== 'undefined') {
              if (typeof window.renderBrandingUI === 'function') window.renderBrandingUI();
              if (typeof window.updateSobrecostoBadge === 'function') window.updateSobrecostoBadge();
            }
            triggerDebouncedCloudSync();
            return;
          }
          const currentJson = JSON.stringify(state.treeData || []);
          const incomingJson = JSON.stringify(cloudTree);
          const treeChanged = currentJson !== incomingJson;
          if (treeChanged) {
            state.treeData = cloudTree;
            localStorage.setItem(getStorageKey(activePId), incomingJson);
          }
          if (treeChanged || didSettingsChange) {
            try { recalcTreeFromMatrices(state.treeData, computeFactorSobrecosto(state.settings)); } catch (_) {}
            if (typeof window !== 'undefined') {
              if (typeof window.renderBrandingUI === 'function') window.renderBrandingUI();
              if (typeof window.updateSobrecostoBadge === 'function') window.updateSobrecostoBadge();
              if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
              if (typeof window.renderTAB1 === 'function') window.renderTAB1();
            }
          }
          if (currentProjMeta?.isCloudSynced && !hasPendingInitial) {
            rememberSyncedTreeFingerprint(activePId, fingerprintTree(state.treeData));
          }
        } else if (Array.isArray(cloudTree) && cloudTree.length === 0) {
          if (didSettingsChange) {
            try { recalcTreeFromMatrices(state.treeData, computeFactorSobrecosto(state.settings)); } catch (_) {}
            if (typeof window !== 'undefined') {
              if (typeof window.renderBrandingUI === 'function') window.renderBrandingUI();
              if (typeof window.updateSobrecostoBadge === 'function') window.updateSobrecostoBadge();
              if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
              if (typeof window.renderTAB1 === 'function') window.renderTAB1();
            }
          }
          if (Array.isArray(state.treeData) && state.treeData.length > 0) {
            // Si la obra es recién creada y en la nube aún no terminaron de subirse sus conceptos, respaldarlos de inmediato
            triggerDebouncedCloudSync();
          } else if (getProjectById(activePId)?.isCloudSynced && !hasPendingInitial) {
            rememberSyncedTreeFingerprint(activePId, fingerprintTree(state.treeData));
          }
        } else if (didSettingsChange) {
          try { recalcTreeFromMatrices(state.treeData, computeFactorSobrecosto(state.settings)); } catch (_) {}
          if (typeof window !== 'undefined') {
            if (typeof window.renderBrandingUI === 'function') window.renderBrandingUI();
            if (typeof window.updateSobrecostoBadge === 'function') window.updateSobrecostoBadge();
            if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
            if (typeof window.renderTAB1 === 'function') window.renderTAB1();
          }
        }
      }).catch(err => console.warn('[CloudSync] Fallo al refrescar árbol desde la nube:', err));
    }
  } catch (e) {
    console.error('Error cargando treeData:', e);
    state.treeData = [];
  }

  // Quitar sub-filas heredadas o almacenadas en insumos de matrices
  function stripSubInsumos(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach(ins => {
          if (ins.subInsumos) delete ins.subInsumos;
          if (ins.expanded !== undefined) delete ins.expanded;
        });
      }
      if (Array.isArray(n.children)) {
        stripSubInsumos(n.children);
      }
    });
  }
  stripSubInsumos(state.treeData);

  // Sanitizar todos los números para asegurar estrictamente 2 decimales
  function roundNodesTo2Decimals(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (n.cantidad !== undefined) {
        n.cantidad = Math.round(((Number(n.cantidad) || 0) + Number.EPSILON) * 100) / 100;
      }
      if (n.precioUnitario !== undefined) {
        n.precioUnitario = Math.round(((Number(n.precioUnitario) || 0) + Number.EPSILON) * 100) / 100;
      }
      if (n.costoDirecto !== undefined) {
        n.costoDirecto = Math.round(((Number(n.costoDirecto) || 0) + Number.EPSILON) * 100) / 100;
      }
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach(ins => {
          if (ins.cantidad !== undefined) {
            // Las cantidades de las matrices APU consideran estrictamente 5 decimales
            ins.cantidad = Math.round(((Number(ins.cantidad) || 0) + Number.EPSILON) * 100000) / 100000;
          }
          if (ins.costoUnitario !== undefined) {
            ins.costoUnitario = Math.round(((Number(ins.costoUnitario) || 0) + Number.EPSILON) * 100) / 100;
          }
        });
      }
      if (Array.isArray(n.children)) {
        roundNodesTo2Decimals(n.children);
      }
    });
  }
  roundNodesTo2Decimals(state.treeData);
  
  // Sincronizar automáticamente matrices con el catálogo exacto de Opus 2014
  function syncOpusExactMatrices(nodes) {
    if (!Array.isArray(nodes) || !CASA_LAURA_PROJECT) return;
    const exactMap = new Map();
    let hasOpusConcepts = false;
    CASA_LAURA_PROJECT.forEach(p => {
      (p.children || []).forEach(c => {
        if (c.clave && Array.isArray(c.insumos) && c.insumos.length > 0) {
          exactMap.set(c.clave.trim().toUpperCase(), c);
        }
      });
    });

    function walk(list) {
      list.forEach(n => {
        if (n.clave) {
          const exact = exactMap.get(n.clave.trim().toUpperCase());
          if (exact) {
            hasOpusConcepts = true;
            // Solo sincronizar con Opus si el nodo aún no ha sido personalizado por el usuario y carece de matriz
            if (!n.isMatrixCustomized && !n.userClearedMatrix && (!Array.isArray(n.insumos) || n.insumos.length === 0)) {
              n.insumos = JSON.parse(JSON.stringify(exact.insumos));
              n.precioUnitario = exact.precioUnitario;
              n.costoDirecto = exact.costoDirecto;
              n.unidad = exact.unidad || n.unidad;
              if (exact.descripcion && (!n.descripcion || n.descripcion.length < 10)) {
                n.descripcion = exact.descripcion;
              }
            }
          }
        }
        if (Array.isArray(n.children)) walk(n.children);
      });
    }
    walk(nodes);

    // Si el proyecto actual es Casa Laura o contiene conceptos Opus sin sobrecosto explícito, desactivar sobrecosto para reflejar el catálogo exacto de Opus
    const projName = (state.settings.projectName || '').toLowerCase();
    if (
      hasOpusConcepts &&
      !hadSavedSettings &&
      !bootProjMeta?.applySobrecosto &&
      state.settings.applySobrecosto !== true &&
      (projName.includes('laura') || projName.includes('opus') || projName.includes('residencial') || projName.includes('muestra'))
    ) {
      state.settings.applySobrecosto = false;
    }
  }
  syncOpusExactMatrices(state.treeData);

  // Regla APU: cada concepto con matriz refleja exactamente su matriz (CD = Σ insumos, PU = CD × factor)
  try { recalcTreeFromMatrices(state.treeData, computeFactorSobrecosto(state.settings)); } catch (_) {}

  sanitizeCatalogNodes(state.treeData);
}

// Sincronización automática en segundo plano con Supabase PostgreSQL (Debounce 1.2s)
let cloudSyncTimer = null;
let pendingLargeTreeBroadcast = false;
let pendingLargeTreeMeta = {};

function checkIfLargeTree(tree) {
  try {
    return Array.isArray(tree) && JSON.stringify(tree).length >= 180000;
  } catch (_) {
    return false;
  }
}

const TREE_SYNC_FINGERPRINT_PREFIX = 'cubikar_tree_sync_fp_';

function fingerprintTree(tree) {
  const json = JSON.stringify(Array.isArray(tree) ? tree : []);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${json.length}:${(hash >>> 0).toString(36)}`;
}

function readSyncedTreeFingerprint(projectId) {
  try { return sessionStorage.getItem(TREE_SYNC_FINGERPRINT_PREFIX + projectId) || ''; } catch (_) { return ''; }
}

function rememberSyncedTreeFingerprint(projectId, fingerprint) {
  try { sessionStorage.setItem(TREE_SYNC_FINGERPRINT_PREFIX + projectId, fingerprint); } catch (_) {}
}

function hasPendingInitialUpload(projectId) {
  try { return sessionStorage.getItem(`cubikar_pending_initial_upload_${projectId}`) === '1'; } catch (_) { return false; }
}


// ============================================================================
// BANDERA PERSISTENTE DE CAMBIOS PENDIENTES DE SUBIR A LA NUBE
// Si la pestaña se cierra antes de sincronizar, al volver se sube lo local en vez de
// reemplazarlo por una copia más antigua de la nube.
// ============================================================================
const CLOUD_DIRTY_PREFIX = 'cubikar_dirty_';
let pendingCloudSyncTask = null;

function markCloudDirty(projectId) {
  if (!projectId) return;
  // Solo quien puede editar genera cambios por subir (los invitados de solo lectura siempre reciben la nube)
  try { if (typeof canCurrentUserEditProject === 'function' && !canCurrentUserEditProject()) return; } catch (_) { return; }
  try { localStorage.setItem(CLOUD_DIRTY_PREFIX + projectId, String(Date.now())); } catch (_) {}
}

function clearCloudDirty(projectId) {
  if (!projectId) return;
  try { localStorage.removeItem(CLOUD_DIRTY_PREFIX + projectId); } catch (_) {}
}

export function isCloudDirty(projectId) {
  if (!projectId) return false;
  try {
    const ts = Number(localStorage.getItem(CLOUD_DIRTY_PREFIX + projectId) || 0);
    // Vigencia de 12 h: evita bloquear indefinidamente la descarga si la subida nunca se pudo completar
    return ts > 0 && (Date.now() - ts) < 12 * 60 * 60 * 1000;
  } catch (_) { return false; }
}

function notifyLocalStorageQuota(err) {
  const isQuota = err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message || '')));
  if (!isQuota) return;
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('⚠️ El almacenamiento local del navegador está lleno. Tus cambios se están respaldando directamente en la nube; libera espacio (fotos/adjuntos) para seguir trabajando sin conexión.', 'warning');
    }
  } catch (_) {}
}

export function flushPendingCloudSync() {
  if (cloudSyncTimer && pendingCloudSyncTask) {
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = null;
    const task = pendingCloudSyncTask;
    pendingCloudSyncTask = null;
    try { task(); } catch (_) {}
  }
}

export function triggerDebouncedCloudSync() {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  markCloudDirty(getActiveProjectId());
  const runSyncTask = async () => {
    cloudSyncTimer = null;
    const projectId = getActiveProjectId();
    if (!projectId) return;
    if (typeof isProjectMarkedDeleted === 'function' && isProjectMarkedDeleted(projectId)) return;
    const project = getProjectById(projectId);
    if (!project) return;
    if (typeof isProjectMarkedDeleted === 'function' && project.cloudId && isProjectMarkedDeleted(project.cloudId)) return;
    let syncSuccess = false;
    const wasCloudSynced = Boolean(project.isCloudSynced);
    const treeFingerprint = fingerprintTree(state.treeData);
    const treeChanged = !wasCloudSynced || hasPendingInitialUpload(projectId) || readSyncedTreeFingerprint(projectId) !== treeFingerprint;
    try {
      const syncRes = await syncProjectToCloud(project, state.settings, treeChanged ? state.treeData : null);
      syncSuccess = Boolean(syncRes && syncRes.success);
      if (syncSuccess) {
        clearCloudDirty(projectId);
        if (treeChanged) {
          rememberSyncedTreeFingerprint(projectId, treeFingerprint);
          try { sessionStorage.removeItem(`cubikar_pending_initial_upload_${projectId}`); } catch (_) {}
        }
        const list = getProjectsList();
        const idx = list.findIndex(p => p.id === project.id || (syncRes.projectId && p.cloudId === syncRes.projectId));
        if (idx !== -1) {
          list[idx].isCloudSynced = true;
          list[idx].cloudId = syncRes.projectId || list[idx].cloudId || list[idx].id;
          list[idx].lastCloudSyncAt = Date.now();
          saveProjectsList(list, { skipCloudSync: true });
        }
      }
    } catch (e) {
      console.warn('[CloudSync] Fallo silencioso en autosincronización:', e);
    }
    if (syncSuccess && pendingLargeTreeBroadcast) {
      pendingLargeTreeBroadcast = false;
      const committedMeta = pendingLargeTreeMeta || {};
      pendingLargeTreeMeta = {};
      if (typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: true,
          changeType: committedMeta.changeType || 'cloud_tree_synced',
          highlightId: committedMeta.highlightId || null,
          changeDescription: committedMeta.changeDescription || 'cambios en el catálogo',
          postCloudSync: true
        });
      }
    }
    try {
      if (syncSuccess && !wasCloudSynced && typeof window !== 'undefined' && typeof window.triggerDebouncedCloudStateSync === 'function') {
        window.triggerDebouncedCloudStateSync();
      }
    } catch (_) {}
  };
  pendingCloudSyncTask = runSyncTask;
  cloudSyncTimer = setTimeout(() => { pendingCloudSyncTask = null; runSyncTask(); }, 1200);
}

// Persistencia de configuración en localStorage y emisión en tiempo real
export function persistSettings(meta = {}) {
  const projectId = getActiveProjectId();
  try {
    localStorage.setItem(getSettingsKey(), JSON.stringify(state.settings));
    syncActiveProjectSummary(projectId, state.treeData, state.settings);
    triggerDebouncedCloudSync();

    if (typeof broadcastProjectMutation === 'function') {
      broadcastProjectMutation({
        projectId,
        treeData: state.treeData,
        settings: state.settings,
        immediate: false,
        changeType: 'settings_updated',
        changeDescription: 'parámetros del proyecto y sobrecosto',
        ...meta
      });
    }
  } catch (e) {
    console.error('Error guardando configuración:', e);
  }
}

// Persistencia en localStorage con debounce de 300ms y emisión en vivo vía WebSockets
let persistTimer = null;
export function persistLocalData(immediate = false, meta = {}) {
  localTreeMutationSeq++;
  const projectId = getActiveProjectId();
  const flushPersist = () => {
    try {
      ensureLocalTreeUuids(state.treeData);
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(projectId, state.treeData, state.settings);
      if (!meta?.patch && checkIfLargeTree(state.treeData)) {
        pendingLargeTreeBroadcast = true;
        pendingLargeTreeMeta = {
          changeType: meta?.changeType || 'general',
          highlightId: meta?.highlightId || null,
          changeDescription: meta?.changeDescription || 'cambios en el catálogo'
        };
      }
      const projMeta = projectId ? getProjectById(projectId) : null;
      const shouldSkipFullSync = Boolean(meta?.skipFullCloudSync) && Boolean(projMeta?.isCloudSynced);
      if (!shouldSkipFullSync) {
        triggerDebouncedCloudSync();
      }

      if (!meta?.skipBroadcast && typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: Boolean(immediate),
          ...meta
        });
      }
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
      notifyLocalStorageQuota(e);
      try { triggerDebouncedCloudSync(); } catch (_) {}
    }
  };
  if (immediate) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    flushPersist();
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    flushPersist();
    persistTimer = null;
  }, 300);
}

// Guardado forzado al cerrar o recargar ventana (solo si había escritura pendiente)
window.addEventListener('beforeunload', () => {
  if (persistTimer) persistLocalData(true);
});

// Al ocultar/cerrar la pestaña: guardar lo pendiente y enviar a la nube sin esperar el debounce
const flushOnHide = () => {
  try { if (persistTimer) persistLocalData(true); } catch (_) {}
  try { flushPendingCloudSync(); } catch (_) {}
};
window.addEventListener('pagehide', flushOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnHide();
});
