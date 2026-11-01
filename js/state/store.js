import { getStorageKey, getSettingsKey, getActiveProjectId, STORAGE_KEY_CLIPBOARD } from '../config/constants.js';
import { defaultTreeData, defaultSettings } from '../config/defaultData.js';
import { syncActiveProjectSummary } from '../modules/portal/projectService.js';

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

  // Cargar árbol de catálogo
  try {
    const savedData = localStorage.getItem(getStorageKey());
    if (savedData) {
      state.treeData = JSON.parse(savedData);
    } else {
      state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
    }
  } catch (e) {
    console.error('Error cargando treeData:', e);
    state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
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
            ins.cantidad = Math.round(((Number(ins.cantidad) || 0) + Number.EPSILON) * 100) / 100;
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
}

// Persistencia de configuración en localStorage
export function persistSettings() {
  try {
    localStorage.setItem(getSettingsKey(), JSON.stringify(state.settings));
    syncActiveProjectSummary(getActiveProjectId(), state.treeData, state.settings);
  } catch (e) {
    console.error('Error guardando configuración:', e);
  }
}

// Persistencia en localStorage con debounce de 300ms
let persistTimer = null;
export function persistLocalData(immediate = false) {
  if (immediate) {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(getActiveProjectId(), state.treeData, state.settings);
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(state.treeData));
      syncActiveProjectSummary(getActiveProjectId(), state.treeData, state.settings);
    } catch (e) {
      console.error('Error guardando en localStorage:', e);
    }
    persistTimer = null;
  }, 300);
}

// Guardado forzado al cerrar o recargar ventana
window.addEventListener('beforeunload', () => persistLocalData(true));
