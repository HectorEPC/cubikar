import { getStorageKey, getSettingsKey, getActiveProjectId, STORAGE_KEY_CLIPBOARD } from '../config/constants.js?v=20261116_cf8';
import { defaultTreeData, defaultSettings } from '../config/defaultData.js?v=20261116_cf8';
import { syncActiveProjectSummary, getProjectById, isProjectMarkedDeleted } from '../modules/portal/projectService.js?v=20261116_cf8';
import { syncProjectToCloud, loadProjectTreeFromCloud } from '../core/cloudProjectService.js?v=20261116_cf8';
import { broadcastProjectMutation } from '../core/realtimeSync.js?v=20261116_cf8';
import { sanitizeCatalogNodes } from '../core/textSanitizer.js?v=20261116_cf8';
import { CASA_LAURA_PROJECT } from '../modules/io/casaLauraData.js?v=20261116_cf8';

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

  // Cargar configuración
  try {
    const savedSettings = localStorage.getItem(getSettingsKey());
    if (savedSettings) {
      state.settings = Object.assign({}, defaultSettings, JSON.parse(savedSettings));
    } else {
      state.settings = Object.assign({}, defaultSettings);
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

    // Si el proyecto está activo, siempre sincronizar con la versión autoritativa más reciente de Supabase PostgreSQL
    if (activePId) {
      loadProjectTreeFromCloud(activePId).then(cloudTree => {
        if (Array.isArray(cloudTree) && cloudTree.length > 0) {
          const currentJson = JSON.stringify(state.treeData || []);
          const incomingJson = JSON.stringify(cloudTree);
          if (currentJson !== incomingJson) {
            state.treeData = cloudTree;
            localStorage.setItem(getStorageKey(activePId), incomingJson);
            if (typeof window !== 'undefined') {
              if (typeof window.recalculateClaves === 'function') window.recalculateClaves(state.treeData);
              if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
              if (typeof window.renderTAB1 === 'function') window.renderTAB1();
            }
          }
        } else if (Array.isArray(cloudTree) && cloudTree.length === 0 && Array.isArray(state.treeData) && state.treeData.length > 0) {
          // Si la obra es recién creada y en la nube aún no terminaron de subirse sus conceptos, respaldarlos de inmediato
          triggerDebouncedCloudSync();
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

    // Si el proyecto actual es Casa Laura o contiene conceptos Opus, desactivar sobrecosto para reflejar el catálogo exacto de Opus
    const projName = (state.settings.projectName || '').toLowerCase();
    if (hasOpusConcepts && (projName.includes('laura') || projName.includes('opus') || projName.includes('residencial') || projName.includes('muestra'))) {
      state.settings.applySobrecosto = false;
    }
  }
  syncOpusExactMatrices(state.treeData);

  sanitizeCatalogNodes(state.treeData);
}

// Sincronización automática en segundo plano con Supabase PostgreSQL (Debounce 1.2s)
let cloudSyncTimer = null;
export function triggerDebouncedCloudSync() {
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    const projectId = getActiveProjectId();
    if (!projectId) return;
    if (typeof isProjectMarkedDeleted === 'function' && isProjectMarkedDeleted(projectId)) return;
    const project = getProjectById(projectId);
    if (!project) return;
    if (typeof isProjectMarkedDeleted === 'function' && project.cloudId && isProjectMarkedDeleted(project.cloudId)) return;
    try {
      await syncProjectToCloud(project, state.settings, state.treeData);
    } catch (e) {
      console.warn('[CloudSync] Fallo silencioso en autosincronización:', e);
    }
    try {
      if (typeof window !== 'undefined' && typeof window.triggerDebouncedCloudStateSync === 'function') {
        window.triggerDebouncedCloudStateSync();
      }
    } catch (_) {}
  }, 1200);
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
  const projectId = getActiveProjectId();
  if (immediate) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(projectId, state.treeData, state.settings);
      if (!meta?.skipFullCloudSync) {
        triggerDebouncedCloudSync();
      }

      if (typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: true,
          ...meta
        });
      }
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(projectId, state.treeData, state.settings);
      if (!meta?.skipFullCloudSync) {
        triggerDebouncedCloudSync();
      }

      if (typeof broadcastProjectMutation === 'function') {
        broadcastProjectMutation({
          projectId,
          treeData: state.treeData,
          settings: state.settings,
          immediate: false,
          ...meta
        });
      }
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
    persistTimer = null;
  }, 300);
}

// Guardado forzado al cerrar o recargar ventana
window.addEventListener('beforeunload', () => persistLocalData(true));
