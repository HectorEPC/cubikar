// js/core/localDataIsolation.js
// Aislamiento de datos locales por cuenta en navegadores compartidos.
// Si en este navegador inicia sesión una cuenta distinta a la dueña de los datos locales,
// se eliminan del dispositivo los proyectos, módulos, cachés y bases IndexedDB de la cuenta anterior
// antes de cargar nada, para que ninguna información confidencial quede visible para otro usuario.

const OWNER_KEY = 'cubikar_local_data_owner_v1';
const RELOAD_GUARD_KEY = 'cubikar_local_data_purged_reload';

const USER_DATA_KEY_RE = new RegExp([
  '^control_obra_(projects|settings|treeData|invitations|plan_invitations|workspace_invites|active_workspace|chat|read_mentions|clipboard_concept|featured|registered_accounts)',
  '^expenses_control_',
  '^estimaciones_',
  '^calendario_(cfg|workdays|arq_cfg|arq_workdays)',
  '^seguimiento_data_',
  '^adm_(const|arq)_(almacen|bitacora|chat|project_chat|expenses|signatures|suppliers|tab_locks|subscription|state|seguimiento|compras|proveedores|pending_chat_open)',
  '^cubikar_(deleted_projects|local_trash|trashed_project_ids|cloud_denied_projects|host_manifest|collaboration|pending_initial_upload|tree_sync_fp_|settings_sync_fp_|read_mentions|user_consumption|dismissed_notifications|realtime_local|co_administrators|admin_sync|active_project_id|dirty_|hydrated_)'
].join('|'));

const USER_INDEXED_DBS = ['ADM_CONST_MEDIA_DB', 'APU_REFERENCE_DB'];

// Tras la recarga posterior a una purga, liberar la guarda para futuros cambios de cuenta en esta pestaña
try {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RELOAD_GUARD_KEY);
} catch (_) {}

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function purgeStorage(storage) {
  if (!storage) return 0;
  const toRemove = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && USER_DATA_KEY_RE.test(k)) toRemove.push(k);
  }
  toRemove.forEach(k => { try { storage.removeItem(k); } catch (_) {} });
  return toRemove.length;
}

export function purgePreviousAccountLocalData() {
  let removed = 0;
  try { removed += purgeStorage(typeof localStorage !== 'undefined' ? localStorage : null); } catch (_) {}
  try { removed += purgeStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : null); } catch (_) {}
  try {
    if (typeof indexedDB !== 'undefined') {
      USER_INDEXED_DBS.forEach(name => { try { indexedDB.deleteDatabase(name); } catch (_) {} });
    }
  } catch (_) {}
  return removed;
}

/**
 * Registra la cuenta dueña de los datos locales. Si cambió respecto a la anterior,
 * purga los datos de la cuenta previa y recarga una sola vez para iniciar limpio.
 * @returns {boolean} true si se purgaron datos de otra cuenta
 */
export function enforceLocalDataOwner(email) {
  const current = normalizeEmail(email);
  if (!current || typeof localStorage === 'undefined') return false;
  let previous = '';
  try { previous = normalizeEmail(localStorage.getItem(OWNER_KEY)); } catch (_) { previous = ''; }
  if (previous === current) return false;
  try { localStorage.setItem(OWNER_KEY, current); } catch (_) {}
  // Primera vez con esta protección: se adopta el estado local existente sin borrar nada
  if (!previous) return false;
  const removed = purgePreviousAccountLocalData();
  console.info(`[Privacidad] Se eliminaron ${removed} registros locales de la cuenta anterior en este navegador.`);
  try {
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      setTimeout(() => { try { window.location.reload(); } catch (_) {} }, 50);
    }
  } catch (_) {}
  return true;
}
