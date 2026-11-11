// js/ui/tabLockController.js
// Controlador de Candado de Bloqueo por Pestaña (Catálogo Base, Insumos Base, Calendario de Obra)
// y por Estimación Individual en la pestaña Estimaciones.
// Cuando está bloqueado, solo permite consultar e imprimir la información (sin cambiar, mover ni editar).

import { getActiveProjectId } from '../config/constants.js';
import { showToast } from './notifications.js';
import { isEstimacionLocked, toggleActiveEstimacionLockState, setEstimacionLocked } from '../modules/estimaciones/estimacionesModel.js';

const STORAGE_KEY_TAB_LOCKS_PREFIX = 'adm_const_tab_locks_';

const TAB_LABELS = {
  cat: 'Catálogo Base',
  insumos: 'Insumos Base',
  calendario: 'Calendario de Obra',
  estimaciones: 'Estimaciones',
  compras: 'Compras y Pagos',
  bitacora: 'Bitácora de Obra'
};

let lockRenderCallback = null;

export function setTabLockRenderCallback(cb) {
  lockRenderCallback = cb;
}

export function getTabLocksStorageKey(projectId = null) {
  const pId = projectId || getActiveProjectId() || 'default';
  return `${STORAGE_KEY_TAB_LOCKS_PREFIX}${pId}`;
}

export function loadProjectTabLocks(projectId = null) {
  try {
    const raw = localStorage.getItem(getTabLocksStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        cat: Boolean(parsed?.cat),
        insumos: Boolean(parsed?.insumos),
        calendario: Boolean(parsed?.calendario),
        compras: Boolean(parsed?.compras),
        bitacora: Boolean(parsed?.bitacora)
      };
    }
  } catch (err) {
    console.warn('Error al leer bloqueo de pestañas:', err);
  }
  return { cat: false, insumos: false, calendario: false, compras: false, bitacora: false };
}

export function saveProjectTabLocks(locks, projectId = null) {
  try {
    const clean = {
      cat: Boolean(locks?.cat),
      insumos: Boolean(locks?.insumos),
      calendario: Boolean(locks?.calendario),
      compras: Boolean(locks?.compras),
      bitacora: Boolean(locks?.bitacora)
    };
    localStorage.setItem(getTabLocksStorageKey(projectId), JSON.stringify(clean));
    return clean;
  } catch (err) {
    console.warn('Error al guardar bloqueo de pestañas:', err);
    return { cat: false, insumos: false, calendario: false, compras: false, bitacora: false };
  }
}

export function isTabLocked(tabKey) {
  if (tabKey === 'estimaciones') {
    return isEstimacionLocked();
  }
  const locks = loadProjectTabLocks();
  return Boolean(locks[tabKey]);
}

export function setTabLocked(tabKey, locked, { notify = true, rerender = true } = {}) {
  const isLocked = Boolean(locked);

  if (tabKey === 'estimaciones') {
    setEstimacionLocked(null, isLocked);
  } else {
    const locks = loadProjectTabLocks();
    locks[tabKey] = isLocked;
    saveProjectTabLocks(locks);
  }

  if (rerender && typeof lockRenderCallback === 'function') {
    lockRenderCallback(tabKey, isLocked);
  }
  applyTabLocksToDOM();

  if (notify) {
    const label = TAB_LABELS[tabKey] || tabKey;
    if (isLocked) {
      showToast(`🔒 ${label} bloqueada: modo solo consulta e impresión`, 'warning');
    } else {
      showToast(`🔓 ${label} desbloqueada: edición habilitada`, 'info');
    }
  }

  return isLocked;
}

export function toggleTabLock(tabKey) {
  if (tabKey === 'estimaciones') {
    const { locked, est } = toggleActiveEstimacionLockState();
    if (typeof lockRenderCallback === 'function') {
      lockRenderCallback('estimaciones', locked);
    }
    applyTabLocksToDOM();
    const estName = est?.nombre || 'Estimación';
    if (locked) {
      showToast(`🔒 ${estName} bloqueada: solo consulta e impresión`, 'warning');
    } else {
      showToast(`🔓 ${estName} desbloqueada: edición habilitada`, 'info');
    }
    return locked;
  }

  const nextState = !isTabLocked(tabKey);
  return setTabLocked(tabKey, nextState, { notify: true, rerender: true });
}

export function guardTabUnlocked(tabKey, customMessage = null) {
  if (!isTabLocked(tabKey)) return true;
  const label = TAB_LABELS[tabKey] || tabKey;
  const msg = customMessage || (
    tabKey === 'estimaciones'
      ? '🔒 Esta estimación está bloqueada (solo consulta e impresión). Desbloquee el candado para editar.'
      : `🔒 La pestaña "${label}" está bloqueada (solo consulta e impresión). Desbloquee el candado para realizar cambios.`
  );
  showToast(msg, 'warning');
  return false;
}

function updateStaticLockButtonUI(btnId, locked, tabLabel) {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById(btnId);
  if (!btn) return;

  if (locked) {
    btn.className = 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-700 text-[11px] px-2.5 py-1 rounded flex items-center justify-center font-bold shadow-sm transition active:scale-95 cursor-pointer shrink-0';
    btn.innerHTML = '<i class="fa-solid fa-lock text-[11px] text-white"></i>';
    btn.title = `🔒 ${tabLabel} bloqueada (Solo consulta e impresión) — Haz clic para desbloquear`;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('data-locked', 'true');
    }
  } else {
    btn.className = 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] px-2.5 py-1 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer shrink-0';
    btn.innerHTML = '<i class="fa-solid fa-lock-open text-[11px] text-slate-600"></i>';
    btn.title = `Bloquear ${tabLabel} (Permitir solo consulta e impresión)`;
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('data-locked', 'false');
    }
  }
}

export function applyTabLocksToDOM() {
  if (typeof document === 'undefined') return;

  const locks = loadProjectTabLocks();
  const estLocked = isEstimacionLocked();

  // 1. Actualizar botones estáticos en index.html (Catálogo Base e Insumos Base)
  updateStaticLockButtonUI('btn-lock-cat', locks.cat, 'Catálogo Base');
  updateStaticLockButtonUI('btn-lock-insumos', locks.insumos, 'Insumos Base');

  // 2. Atributos data-tab-locked en los contenedores de las 4 pestañas
  const viewCat = document.getElementById('view-cat');
  if (viewCat && typeof viewCat.setAttribute === 'function') {
    viewCat.setAttribute('data-tab-locked', locks.cat ? 'true' : 'false');
  }
  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && typeof viewInsumos.setAttribute === 'function') {
    viewInsumos.setAttribute('data-tab-locked', locks.insumos ? 'true' : 'false');
  }
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && typeof viewCalendario.setAttribute === 'function') {
    viewCalendario.setAttribute('data-tab-locked', locks.calendario ? 'true' : 'false');
  }
  const viewEstimaciones = document.getElementById('view-estimaciones');
  if (viewEstimaciones && typeof viewEstimaciones.setAttribute === 'function') {
    viewEstimaciones.setAttribute('data-tab-locked', estLocked ? 'true' : 'false');
  }
  const viewBitacora = document.getElementById('view-bitacora');
  if (viewBitacora && typeof viewBitacora.setAttribute === 'function') {
    viewBitacora.setAttribute('data-tab-locked', locks.bitacora ? 'true' : 'false');
  }

  // 3. Bloquear campos de encabezado de proyecto en Catálogo Base e Insumos Base cuando están bloqueados
  const catHeaderInputs = ['header-project-name', 'header-project-location', 'select-all-checkbox'];
  catHeaderInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = locks.cat;
  });

  const insumosHeaderInputs = ['insumos-project-name', 'insumos-project-location', 'btn-ai-general-insumos'];
  insumosHeaderInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = locks.insumos;
  });
}
