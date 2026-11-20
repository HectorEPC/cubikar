// js/modules/portal/trashService.js
// Papelera de Reciclaje de Proyectos (Retención 7 días - Exclusiva del Anfitrión)
// Soporta borrado lógico en Supabase PostgreSQL, respaldo ZIP antes de purga, restauración segura y respaldo local offline.

import {
  setActiveProjectId,
  getActiveProjectId,
  getStorageKey,
  getSettingsKey
} from '../../config/constants.js?v=20261119_cf37';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js?v=20261119_cf37';
import { showToast } from '../../ui/notifications.js?v=20261119_cf37';
import {
  getCurrentUser,
  saveCurrentUser,
  getProjectsList,
  saveProjectsList,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  canUserCreateProject,
  markProjectDeleted,
  unmarkProjectDeleted,
  markProjectTrashedLocal,
  unmarkProjectTrashedLocal
} from './projectService.js?v=20261119_cf37';
import {
  isValidUUID,
  resolveCloudProjectId,
  deleteProjectFromCloud,
  invalidateCloudProjectsCache,
  fetchCloudProjects,
  getCachedTrashedCloudProjects
} from '../../core/cloudProjectService.js?v=20261119_cf37';
import { deleteManagedFile } from '../../services/s3StorageService.js?v=20261119_cf37';

export const TRASH_RETENTION_DAYS = 7;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const STORAGE_KEY_LOCAL_TRASH = 'cubikar_local_trash_v1';
const APP_LABEL = 'Construccion';

let cachedTrashCount = 0;
let cachedTrashItems = [];
let isTrashLoading = false;
let trashEscListenerBound = false;

const PROJECT_LOCAL_PREFIXES = [
  'estimaciones_data_',
  'expenses_control_',
  'calendario_cfg_',
  'calendario_workdays_',
  'calendario_arq_cfg_',
  'adm_const_project_chat_',
  'adm_arq_project_chat_',
  'adm_const_chat_',
  'adm_arq_chat_',
  'control_obra_chat_',
  'adm_const_signatures_',
  'adm_arq_signatures_',
  'adm_const_bitacora_',
  'adm_arq_bitacora_',
  'adm_const_expenses_',
  'adm_arq_expenses_',
  'adm_const_suppliers_',
  'adm_arq_suppliers_',
  'adm_arq_seguimiento_',
  'seguimiento_data_'
];

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvEsc(val) {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isMissingRpcOrColumnError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return code === 'PGRST202' || code === '42883' || code === '42703' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist');
}

/**
 * Verifica estrictamente si el usuario actual es el anfitrión (propietario) del proyecto.
 */
export function isProjectHostOwner(proj, user = null) {
  const u = user || getCurrentUser();
  const uEmail = String(u?.email || '').toLowerCase().trim();
  const pOwner = String(proj?.ownerEmail || proj?.owner_email || '').toLowerCase().trim();
  if (!uEmail) {
    return !pOwner || pOwner === 'local@cubikar.app' || pOwner === 'admin.general@constructora.com';
  }
  if (!pOwner) return true;
  return pOwner === uEmail;
}

function collectProjectStorageKeys(pid) {
  const keys = [getSettingsKey(pid), getStorageKey(pid)];
  for (const prefix of PROJECT_LOCAL_PREFIXES) {
    keys.push(`${prefix}${pid}`);
  }
  return keys;
}

function removeProjectWorkspaceStorage(ids) {
  ids.forEach((pid) => {
    collectProjectStorageKeys(pid).forEach((k) => {
      try { localStorage.removeItem(k); } catch (_) {}
    });
  });
}

function readLocalTrashEntries() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_TRASH);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocalTrashEntries(entries) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_LOCAL_TRASH, JSON.stringify(Array.isArray(entries) ? entries : []));
  } catch (_) {}
}

export function purgeExpiredLocalTrashEntries() {
  const now = Date.now();
  const entries = readLocalTrashEntries();
  const kept = [];
  let changed = false;
  for (const entry of entries) {
    if (!entry || !entry.id) {
      changed = true;
      continue;
    }
    const deletedMs = entry.deletedAt ? new Date(entry.deletedAt).getTime() : 0;
    const expiresMs = entry.expiresAt ? new Date(entry.expiresAt).getTime() : (deletedMs + TRASH_RETENTION_MS);
    if (!expiresMs || expiresMs <= now) {
      changed = true;
      try {
        unmarkProjectTrashedLocal(entry.id);
        if (entry.cloudId) unmarkProjectTrashedLocal(entry.cloudId);
        markProjectDeleted(entry.id);
        if (entry.cloudId) markProjectDeleted(entry.cloudId);
      } catch (_) {}
    } else {
      kept.push(entry);
    }
  }
  if (changed) writeLocalTrashEntries(kept);
  return kept;
}

function saveLocalProjectSnapshotToTrash(proj, idsToCapture, user) {
  const now = Date.now();
  const deletedIso = new Date(now).toISOString();
  const expiresIso = new Date(now + TRASH_RETENTION_MS).toISOString();
  const snapshotData = {};
  idsToCapture.forEach((pid) => {
    collectProjectStorageKeys(pid).forEach((k) => {
      try {
        const val = localStorage.getItem(k);
        if (val !== null) snapshotData[k] = val;
      } catch (_) {}
    });
  });

  const uEmail = String(user?.email || proj?.ownerEmail || '').toLowerCase().trim();
  const entry = {
    id: proj.id,
    cloudId: proj.cloudId || null,
    isCloudSynced: false,
    isLocalSnapshot: true,
    projectName: proj.projectName || 'Proyecto sin título',
    companyName: proj.companyName || 'Constructora',
    companyLogo: proj.companyLogo || '',
    ownerEmail: uEmail,
    ownerName: proj.ownerName || user?.name || '',
    projectLocation: proj.projectLocation || '',
    tipoObra: proj.tipoObra || 'Edificación',
    currency: proj.currency || 'MXN',
    currencySymbol: proj.currencySymbol || '$',
    deletedAt: deletedIso,
    deletedByEmail: uEmail,
    expiresAt: expiresIso,
    createdAt: proj.createdAt || deletedIso.slice(0, 10),
    updatedAt: proj.updatedAt || deletedIso,
    projectObject: { ...proj },
    storageSnapshot: snapshotData
  };

  const entries = purgeExpiredLocalTrashEntries().filter(
    e => e.id !== entry.id && (!entry.cloudId || e.cloudId !== entry.cloudId)
  );
  entries.unshift(entry);
  writeLocalTrashEntries(entries);
  return entry;
}

function cleanActiveUserStateAfterRemoval(idsToClean, targetObj, user) {
  const currentList = getProjectsList();
  const remainingList = currentList.filter(
    p => !idsToClean.includes(p.id) && !(p.cloudId && idsToClean.includes(p.cloudId))
  );
  saveProjectsList(remainingList, { skipCloudSync: true });

  const activeId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
  if (activeId && idsToClean.includes(activeId)) {
    setActiveProjectId(null);
  }

  try {
    const currentInvs = getStoredInvitations();
    const cleanedInvs = currentInvs.filter(i => !idsToClean.includes(i.projectId));
    if (cleanedInvs.length !== currentInvs.length) saveStoredInvitations(cleanedInvs, { skipCloudSync: true });

    const currentPlanInvs = getStoredPlanInvitations();
    const cleanedPlan = currentPlanInvs.filter(pi => !idsToClean.includes(pi.projectId));
    if (cleanedPlan.length !== currentPlanInvs.length) saveStoredPlanInvitations(cleanedPlan, { skipCloudSync: true });
  } catch (_) {}

  try {
    if (typeof window !== 'undefined' && typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
  } catch (_) {}

  if (user && user.user_metadata?.cubikar_cloud_state_v2) {
    const cs = user.user_metadata.cubikar_cloud_state_v2;
    let modified = false;
    if (Array.isArray(cs.ownedProjects) && cs.ownedProjects.length > 0) {
      cs.ownedProjects = [];
      modified = true;
    }
    if (Array.isArray(cs.collaboratedProjects) && cs.collaboratedProjects.length > 0) {
      cs.collaboratedProjects = [];
      modified = true;
    }
    if (modified) saveCurrentUser(user);
  }

  return remainingList;
}

/**
 * Enviar un proyecto a la Papelera (retención de 7 días). Solo el anfitrión puede ejecutarlo.
 */
export async function moveProjectToTrash(projectId) {
  if (!projectId) return { success: false, reason: 'ID de proyecto inválido.' };

  const user = getCurrentUser();
  const myEmail = String(user?.email || '').toLowerCase().trim();
  const currentList = getProjectsList();
  const targetObj = currentList.find(p => p.id === projectId || p.cloudId === projectId) || null;

  if (targetObj && !isProjectHostOwner(targetObj, user)) {
    return {
      success: false,
      forbidden: true,
      reason: 'Solo el anfitrión (propietario) del proyecto puede enviarlo a la papelera.'
    };
  }

  const rawId = String(projectId).trim();
  const cloudId = targetObj?.cloudId || null;
  const resolvedUuid = resolveCloudProjectId(rawId);
  const targetUuid = resolvedUuid || (cloudId && isValidUUID(String(cloudId)) ? String(cloudId).trim() : '');
  const idsToClean = Array.from(new Set([rawId, cloudId, targetUuid].filter(Boolean)));

  const sb = getSupabaseClient();
  const useCloud = Boolean(isSupabaseConfigured() && sb && user?.id && isValidUUID(targetUuid));

  let movedInCloud = false;
  let needsSqlMigrationFallback = false;

  if (useCloud) {
    try {
      const { data: rpcRes, error: rpcErr } = await sb.rpc('mover_proyecto_a_papelera', {
        p_proyecto_id: targetUuid
      });

      if (!rpcErr) {
        if (rpcRes && rpcRes.ok === false) {
          if (/no encontrado/i.test(String(rpcRes.error || ''))) {
            // El proyecto solo existe localmente (p. ej. fallo 403/offline o ya purgado en nube): permitir enviarlo a papelera local
            movedInCloud = false;
          } else {
            return { success: false, reason: rpcRes.error || 'No se pudo mover el proyecto a la papelera.' };
          }
        } else {
          movedInCloud = true;
        }
      } else if (isMissingRpcOrColumnError(rpcErr)) {
        const nowIso = new Date().toISOString();
        const { error: updErr } = await sb
          .from('proyectos')
          .update({ deleted_at: nowIso, deleted_by_email: myEmail, updated_at: nowIso })
          .eq('id', targetUuid);

        if (!updErr) {
          movedInCloud = true;
        } else if (isMissingRpcOrColumnError(updErr)) {
          needsSqlMigrationFallback = true;
        } else {
          return { success: false, reason: updErr.message || 'No tienes permiso para eliminar este proyecto.' };
        }
      } else {
        return { success: false, reason: rpcErr.message || 'No tienes permiso para eliminar este proyecto.' };
      }
    } catch (err) {
      return { success: false, reason: err?.message || 'Error al mover el proyecto a la papelera.' };
    }
  }

  // Para proyectos locales (sin nube o si falta ejecutar SQL en Supabase), conservar copia íntegra 7 días en almacenamiento local
  if (!movedInCloud && targetObj) {
    saveLocalProjectSnapshotToTrash(targetObj, idsToClean, user);
  }

  idsToClean.forEach(pid => markProjectTrashedLocal(pid));
  removeProjectWorkspaceStorage(idsToClean);
  const remainingList = cleanActiveUserStateAfterRemoval(idsToClean, targetObj, user);

  // Notificar en tiempo real a otras pestañas y colaboradores
  try {
    const rt = typeof window !== 'undefined' ? window.CubikarRealtime : null;
    if (rt?.broadcastProjectTrashed) {
      rt.broadcastProjectTrashed(rawId, myEmail);
      if (targetUuid && targetUuid !== rawId) rt.broadcastProjectTrashed(targetUuid, myEmail);
    } else if (typeof window !== 'undefined' && typeof window.broadcastProjectTrashed === 'function') {
      window.broadcastProjectTrashed(rawId, myEmail);
      if (targetUuid && targetUuid !== rawId) window.broadcastProjectTrashed(targetUuid, myEmail);
    }
  } catch (_) {}

  // Actualizar manifiesto de obras activas del anfitrión
  try {
    if (myEmail && typeof window !== 'undefined' && typeof window.recordHostActiveManifest === 'function') {
      const myActiveIds = remainingList
        .filter(p => String(p.ownerEmail || '').toLowerCase().trim() === myEmail)
        .map(p => p.cloudId || p.id);
      await window.recordHostActiveManifest(myEmail, myActiveIds, { force: true });
    }
  } catch (_) {}

  invalidateCloudProjectsCache();
  await fetchTrashedProjectsForHost({ force: true, silent: true }).catch(() => {});

  return {
    success: true,
    movedInCloud,
    needsSqlMigrationFallback
  };
}

function mapTrashRow(row, user) {
  const myEmail = String(user?.email || '').toLowerCase().trim();
  const cfg = (row?.configuracion && typeof row.configuracion === 'object') ? row.configuracion : {};
  const deletedIso = row.deleted_at || row.deletedAt || new Date().toISOString();
  const deletedMs = new Date(deletedIso).getTime();
  const expiresIso = row.expires_at || row.expiresAt || new Date(deletedMs + TRASH_RETENTION_MS).toISOString();
  return {
    id: row.id,
    cloudId: row.cloudId || row.id,
    isCloudSynced: !row.isLocalSnapshot,
    isLocalSnapshot: Boolean(row.isLocalSnapshot),
    projectName: row.nombre || row.projectName || 'Proyecto sin título',
    companyName: cfg.companyName || row.companyName || row.cliente || 'Constructora',
    companyLogo: cfg.companyLogo || row.companyLogo || '',
    ownerEmail: String(row.owner_email || row.ownerEmail || myEmail).toLowerCase().trim(),
    ownerName: cfg.ownerName || row.ownerName || user?.name || '',
    projectLocation: row.ubicacion || row.projectLocation || '',
    tipoObra: row.tipo_obra || row.tipoObra || 'Edificación',
    currency: row.moneda || row.currency || 'MXN',
    currencySymbol: row.simbolo_moneda || row.currencySymbol || '$',
    deletedAt: deletedIso,
    deletedByEmail: row.deleted_by_email || row.deletedByEmail || myEmail,
    expiresAt: expiresIso,
    createdAt: row.created_at ? String(row.created_at).slice(0, 10) : (row.createdAt || ''),
    updatedAt: row.updated_at || row.updatedAt || deletedIso,
    storageSnapshot: row.storageSnapshot || null,
    projectObject: row.projectObject || null
  };
}

/**
 * Obtiene la lista de proyectos en la papelera del anfitrión actual (con limpieza automática > 7 días).
 */
export async function fetchTrashedProjectsForHost(opts = {}) {
  const user = getCurrentUser();
  const myEmail = String(user?.email || '').toLowerCase().trim();
  const localEntries = purgeExpiredLocalTrashEntries().filter(e => isProjectHostOwner(e, user));

  let cloudItems = [];
  const sb = getSupabaseClient();
  if (isSupabaseConfigured() && sb && user?.id && myEmail) {
    try {
      const { data: rpcRows, error: rpcErr } = await sb.rpc('listar_papelera_anfitrion');
      if (!rpcErr && Array.isArray(rpcRows)) {
        cloudItems = rpcRows.map(r => mapTrashRow(r, user)).filter(item => isProjectHostOwner(item, user));
      } else if (rpcErr && isMissingRpcOrColumnError(rpcErr)) {
        const cached = getCachedTrashedCloudProjects();
        cloudItems = cached.map(r => mapTrashRow(r, user)).filter(item => isProjectHostOwner(item, user));
      } else {
        const cached = getCachedTrashedCloudProjects();
        cloudItems = cached.map(r => mapTrashRow(r, user)).filter(item => isProjectHostOwner(item, user));
      }
    } catch (_) {
      cloudItems = getCachedTrashedCloudProjects().map(r => mapTrashRow(r, user)).filter(item => isProjectHostOwner(item, user));
    }
  }

  const seenIds = new Set(cloudItems.flatMap(i => [i.id, i.cloudId].filter(Boolean)));
  const merged = [...cloudItems];
  for (const loc of localEntries) {
    if (!seenIds.has(loc.id) && (!loc.cloudId || !seenIds.has(loc.cloudId))) {
      merged.push(mapTrashRow(loc, user));
    }
  }

  const now = Date.now();
  const activeTrash = merged
    .filter(item => {
      const expMs = new Date(item.expiresAt).getTime();
      return !Number.isNaN(expMs) && expMs > now;
    })
    .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

  cachedTrashItems = activeTrash;
  cachedTrashCount = activeTrash.length;
  updateTrashBadgeUI();
  return activeTrash;
}

export function getCachedTrashCount() {
  const user = getCurrentUser();
  const cloudCount = getCachedTrashedCloudProjects().filter(p => isProjectHostOwner(p, user)).length;
  const localCount = purgeExpiredLocalTrashEntries().filter(p => isProjectHostOwner(p, user)).length;
  return Math.max(cachedTrashCount, cloudCount, localCount);
}

export function updateTrashBadgeUI() {
  const badge = document.getElementById('portal-trash-badge');
  if (!badge) return;
  const count = cachedTrashItems.length > 0 ? cachedTrashCount : getCachedTrashCount();
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '0';
    badge.classList.add('hidden');
  }
}

/**
 * Restaura un proyecto desde la Papelera. Exclusivo del Anfitrión y sujeto al límite de su plan.
 */
export async function restoreProjectFromTrash(projectId) {
  if (!projectId) return { success: false, reason: 'ID de proyecto inválido.' };

  const user = getCurrentUser();
  const myEmail = String(user?.email || '').toLowerCase().trim();
  const items = cachedTrashItems.length > 0 ? cachedTrashItems : await fetchTrashedProjectsForHost();
  const target = items.find(i => i.id === projectId || i.cloudId === projectId);

  if (!target) {
    return { success: false, reason: 'No se encontró el proyecto en la papelera o ya expiró.' };
  }
  if (!isProjectHostOwner(target, user)) {
    return { success: false, forbidden: true, reason: 'Solo el anfitrión del proyecto puede restaurarlo.' };
  }

  const check = canUserCreateProject(user, 'owned');
  if (!check.allowed) {
    return {
      success: false,
      limitReached: true,
      reason: `Límite de obras activas alcanzado (${check.currentProjects}/${check.maxProjects}). Elimina o libera un proyecto activo o mejora tu plan para restaurar "${target.projectName}".`
    };
  }

  const sb = getSupabaseClient();
  const targetUuid = isValidUUID(String(target.cloudId || target.id)) ? String(target.cloudId || target.id).trim() : '';
  let restoredInCloud = false;

  if (target.isCloudSynced && isSupabaseConfigured() && sb && user?.id && targetUuid) {
    const { data: rpcRes, error: rpcErr } = await sb.rpc('restaurar_proyecto_de_papelera', {
      p_proyecto_id: targetUuid
    });

    if (!rpcErr) {
      if (rpcRes && rpcRes.ok === false) {
        return { success: false, reason: rpcRes.error || 'No se pudo restaurar el proyecto.' };
      }
      restoredInCloud = true;
    } else if (isMissingRpcOrColumnError(rpcErr)) {
      const { error: updErr } = await sb
        .from('proyectos')
        .update({ deleted_at: null, deleted_by_email: '', updated_at: new Date().toISOString() })
        .eq('id', targetUuid);
      if (updErr) {
        return { success: false, reason: updErr.message || 'No se pudo restaurar el proyecto en la nube.' };
      }
      await sb.from('proyectos_eliminados').delete().eq('proyecto_id', targetUuid);
      restoredInCloud = true;
    } else {
      return { success: false, reason: rpcErr.message || 'No tienes permiso para restaurar este proyecto.' };
    }
  }

  // Limpiar marcas de eliminado/papelera locales
  const idsToUnmark = Array.from(new Set([projectId, target.id, target.cloudId, targetUuid].filter(Boolean)));
  idsToUnmark.forEach((pid) => {
    unmarkProjectTrashedLocal(pid);
    unmarkProjectDeleted(pid);
  });

  // Quitar de denied local si existiera
  try {
    const rawDenied = localStorage.getItem('cubikar_cloud_denied_projects_v1');
    if (rawDenied) {
      const deniedArr = JSON.parse(rawDenied);
      if (Array.isArray(deniedArr)) {
        localStorage.setItem(
          'cubikar_cloud_denied_projects_v1',
          JSON.stringify(deniedArr.filter(d => !idsToUnmark.includes(String(d || '').trim())))
        );
      }
    }
  } catch (_) {}

  // Si tenía snapshot local, restaurar sus claves y quitar de cubikar_local_trash_v1
  if (target.storageSnapshot && typeof target.storageSnapshot === 'object') {
    Object.entries(target.storageSnapshot).forEach(([k, v]) => {
      try { localStorage.setItem(k, v); } catch (_) {}
    });
  }
  const remainingLocalTrash = readLocalTrashEntries().filter(
    e => !idsToUnmark.includes(e.id) && !(e.cloudId && idsToUnmark.includes(e.cloudId))
  );
  writeLocalTrashEntries(remainingLocalTrash);

  // Reintegrar a control_obra_projects_v1
  invalidateCloudProjectsCache();
  let restoredObj = target.projectObject || null;
  if (restoredInCloud) {
    try {
      const cloudList = await fetchCloudProjects({ force: true });
      if (Array.isArray(cloudList)) {
        const match = cloudList.find(cp => cp.id === targetUuid || cp.cloudId === targetUuid);
        if (match) restoredObj = match;
      }
    } catch (_) {}
  }

  const curProjects = getProjectsList();
  if (restoredObj && !curProjects.some(p => p.id === restoredObj.id || (restoredObj.cloudId && p.cloudId === restoredObj.cloudId))) {
    curProjects.unshift(restoredObj);
    saveProjectsList(curProjects, { skipCloudSync: true });
  }

  try {
    const rt = typeof window !== 'undefined' ? window.CubikarRealtime : null;
    if (rt?.broadcastProjectRestored) {
      rt.broadcastProjectRestored(targetUuid || target.id, myEmail);
    } else if (typeof window !== 'undefined' && typeof window.broadcastProjectRestored === 'function') {
      window.broadcastProjectRestored(targetUuid || target.id, myEmail);
    }
  } catch (_) {}

  try {
    if (myEmail && typeof window !== 'undefined' && typeof window.recordHostActiveManifest === 'function') {
      const myActiveIds = getProjectsList()
        .filter(p => String(p.ownerEmail || '').toLowerCase().trim() === myEmail)
        .map(p => p.cloudId || p.id);
      await window.recordHostActiveManifest(myEmail, myActiveIds, { force: true });
    }
  } catch (_) {}

  await fetchTrashedProjectsForHost({ force: true, silent: true }).catch(() => {});
  return { success: true, project: restoredObj || target };
}

/**
 * Elimina definitivamente un proyecto desde la Papelera. Exclusivo del Anfitrión.
 */
export async function permanentlyDeleteTrashedProject(projectId) {
  if (!projectId) return { success: false, reason: 'ID de proyecto inválido.' };

  const user = getCurrentUser();
  const myEmail = String(user?.email || '').toLowerCase().trim();
  const items = cachedTrashItems.length > 0 ? cachedTrashItems : await fetchTrashedProjectsForHost();
  const target = items.find(i => i.id === projectId || i.cloudId === projectId);

  if (!target) {
    return { success: false, reason: 'No se encontró el proyecto en la papelera.' };
  }
  if (!isProjectHostOwner(target, user)) {
    return { success: false, forbidden: true, reason: 'Solo el anfitrión del proyecto puede eliminarlo definitivamente.' };
  }

  const sb = getSupabaseClient();
  const targetUuid = isValidUUID(String(target.cloudId || target.id)) ? String(target.cloudId || target.id).trim() : '';
  const idsToPurge = Array.from(new Set([projectId, target.id, target.cloudId, targetUuid].filter(Boolean)));

  if (target.isCloudSynced && isSupabaseConfigured() && sb && user?.id && targetUuid) {
    const { data: rpcRes, error: rpcErr } = await sb.rpc('eliminar_proyecto_definitivamente', {
      p_proyecto_id: targetUuid
    });

    if (!rpcErr) {
      if (rpcRes && rpcRes.ok === false) {
        return { success: false, reason: rpcRes.error || 'No se pudo eliminar el proyecto.' };
      }
      const s3Keys = Array.isArray(rpcRes?.s3_keys) ? rpcRes.s3_keys : [];
      if (s3Keys.length > 0) {
        await Promise.allSettled(s3Keys.map(k => deleteManagedFile({ s3Key: k })));
      }
    } else if (isMissingRpcOrColumnError(rpcErr)) {
      await deleteProjectFromCloud(targetUuid, {
        project: target,
        cloudId: targetUuid,
        ownerEmail: target.ownerEmail || myEmail,
        deletedByEmail: myEmail
      });
    } else {
      return { success: false, reason: rpcErr.message || 'No tienes permiso para eliminar este proyecto.' };
    }
  }

  idsToPurge.forEach((pid) => {
    unmarkProjectTrashedLocal(pid);
    markProjectDeleted(pid);
  });
  removeProjectWorkspaceStorage(idsToPurge);

  const remainingLocalTrash = readLocalTrashEntries().filter(
    e => !idsToPurge.includes(e.id) && !(e.cloudId && idsToPurge.includes(e.cloudId))
  );
  writeLocalTrashEntries(remainingLocalTrash);

  try {
    if (typeof window !== 'undefined' && typeof window.recordDeletedProjectTombstone === 'function') {
      await window.recordDeletedProjectTombstone(targetUuid || target.id, target.ownerEmail || myEmail, {
        deletedByEmail: myEmail
      });
    }
    const rt = typeof window !== 'undefined' ? window.CubikarRealtime : null;
    if (rt?.broadcastProjectDeleted) {
      rt.broadcastProjectDeleted(targetUuid || target.id, myEmail);
    }
  } catch (_) {}

  invalidateCloudProjectsCache();
  await fetchTrashedProjectsForHost({ force: true, silent: true }).catch(() => {});
  return { success: true };
}

function flattenTreeToCsv(nodes, parentPath = '', out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const isConcept = n.type === 'concept' || !Array.isArray(n.children) || n.children.length === 0;
    if (isConcept && (n.code || n.clave || n.description || n.descripcion || n.title)) {
      const qty = Number(n.quantity ?? n.cantidad ?? 0);
      const pu = Number(n.unitPrice ?? n.precioUnitario ?? n.precio_unitario ?? 0);
      const imp = Number(n.total ?? n.importe ?? (qty * pu)) || 0;
      out.push([
        csvEsc(parentPath || n.partida || ''),
        csvEsc(n.code || n.clave || n.id || ''),
        csvEsc(n.description || n.descripcion || n.title || n.name || ''),
        csvEsc(n.unit || n.unidad || ''),
        qty.toFixed(4),
        pu.toFixed(4),
        imp.toFixed(2)
      ].join(','));
    }
    if (Array.isArray(n.children) && n.children.length > 0) {
      const lbl = n.code ? `${n.code} ${n.description || n.title || ''}`.trim() : (n.description || n.title || parentPath);
      flattenTreeToCsv(n.children, lbl, out);
    }
  }
  return out;
}

/**
 * Genera y descarga un archivo .ZIP con el respaldo íntegro de uno o todos los proyectos en la papelera.
 */
export async function backupTrashedProjectsZip(projectIds = []) {
  const JSZipRef = typeof window !== 'undefined' ? window.JSZip : undefined;
  if (!JSZipRef) {
    showToast('La librería JSZip no está disponible aún. Intenta de nuevo en un segundo.', 'warning');
    return false;
  }

  const user = getCurrentUser();
  const myEmail = String(user?.email || '').toLowerCase().trim();
  const items = cachedTrashItems.length > 0 ? cachedTrashItems : await fetchTrashedProjectsForHost();
  const idSet = new Set((Array.isArray(projectIds) ? projectIds : [projectIds]).filter(Boolean));
  const selected = idSet.size > 0 ? items.filter(i => idSet.has(i.id) || idSet.has(i.cloudId)) : items;

  if (selected.length === 0) {
    showToast('No hay proyectos seleccionados para respaldar.', 'warning');
    return false;
  }

  const zip = new JSZipRef();
  const dateStr = new Date().toISOString().split('T')[0];
  const rootName = selected.length === 1
    ? `Respaldo_Papelera_${(selected[0].projectName || 'Proyecto').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 40)}_${dateStr}`
    : `Respaldo_Papelera_Cubikar_${APP_LABEL}_${dateStr}`;
  const root = zip.folder(rootName);
  const summaryRows = ['ID,Nombre,Tipo_Obra,Empresa,Ubicacion,Moneda,Eliminado_En,Expira_En'];

  const sb = getSupabaseClient();
  const hasCloud = Boolean(isSupabaseConfigured() && sb && user?.id);

  for (const item of selected) {
    if (!isProjectHostOwner(item, user)) continue;
    const slug = `${(item.projectName || item.id).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 45) || 'Proyecto'}_${String(item.id).slice(0, 8)}`;
    const pDir = selected.length === 1 ? root : root.folder(slug);

    summaryRows.push([
      csvEsc(item.id),
      csvEsc(item.projectName),
      csvEsc(item.tipoObra),
      csvEsc(item.companyName),
      csvEsc(item.projectLocation),
      csvEsc(item.currency),
      csvEsc(item.deletedAt),
      csvEsc(item.expiresAt)
    ].join(','));

    pDir.file('proyecto_metadata.json', JSON.stringify(item, null, 2));

    const targetUuid = isValidUUID(String(item.cloudId || item.id)) ? String(item.cloudId || item.id).trim() : '';
    if (item.isCloudSynced && hasCloud && targetUuid) {
      try {
        const [
          projRes,
          concRes,
          estRes,
          cronRes,
          cronCfgRes,
          bitCfgRes,
          bitNotasRes,
          compRes,
          provRes,
          chatRes,
          colabRes
        ] = await Promise.allSettled([
          sb.from('proyectos').select('*').eq('id', targetUuid).maybeSingle(),
          sb.from('catalogo_conceptos').select('*').eq('proyecto_id', targetUuid).order('orden', { ascending: true }),
          sb.from('estimaciones').select('*').eq('proyecto_id', targetUuid),
          sb.from('cronograma_actividades').select('*').eq('proyecto_id', targetUuid),
          sb.from('cronograma_config').select('*').eq('proyecto_id', targetUuid).maybeSingle(),
          sb.from('bitacora_config').select('*').eq('proyecto_id', targetUuid).maybeSingle(),
          sb.from('bitacora_notas').select('*').eq('proyecto_id', targetUuid),
          sb.from('compras_gastos').select('*').eq('proyecto_id', targetUuid),
          sb.from('proveedores').select('*').eq('proyecto_id', targetUuid),
          sb.from('chat_mensajes').select('*').eq('proyecto_id', targetUuid),
          sb.from('proyecto_colaboradores').select('*').eq('proyecto_id', targetUuid)
        ]);

        const getVal = (r) => (r.status === 'fulfilled' && !r.value?.error ? r.value.data : null);
        const projRow = getVal(projRes);
        const concepts = getVal(concRes) || [];
        const ests = getVal(estRes) || [];

        if (projRow) pDir.file('proyecto_nube_completo.json', JSON.stringify(projRow, null, 2));
        pDir.file('catalogo_conceptos.json', JSON.stringify(concepts, null, 2));

        const csvLines = ['Clave,Nivel,Descripcion,Unidad,Cantidad,Precio_Unitario,Costo_Directo'];
        concepts.forEach(c => {
          csvLines.push([
            csvEsc(c.clave || ''),
            csvEsc(c.nivel ?? ''),
            csvEsc(c.descripcion || ''),
            csvEsc(c.unidad || ''),
            Number(c.cantidad ?? 0).toFixed(4),
            Number(c.precio_unitario ?? 0).toFixed(4),
            Number(c.costo_directo ?? 0).toFixed(4)
          ].join(','));
        });
        pDir.file('catalogo_conceptos.csv', '\uFEFF' + csvLines.join('\n'));

        const conceptIds = concepts.map(c => c.id).filter(Boolean);
        if (conceptIds.length > 0) {
          const { data: insumos } = await sb.from('insumos_apu').select('*').in('concepto_id', conceptIds);
          if (Array.isArray(insumos) && insumos.length > 0) {
            pDir.file('insumos_apu.json', JSON.stringify(insumos, null, 2));
          }
        }

        if (ests.length > 0) {
          pDir.file('estimaciones.json', JSON.stringify(ests, null, 2));
          const estIds = ests.map(e => e.id).filter(Boolean);
          if (estIds.length > 0) {
            const { data: dets } = await sb.from('estimacion_detalles').select('*').in('estimacion_id', estIds);
            if (Array.isArray(dets) && dets.length > 0) {
              pDir.file('estimacion_detalles.json', JSON.stringify(dets, null, 2));
            }
          }
        }

        const cron = getVal(cronRes);
        if (Array.isArray(cron) && cron.length > 0) pDir.file('cronograma_actividades.json', JSON.stringify(cron, null, 2));
        const cronCfg = getVal(cronCfgRes);
        if (cronCfg) pDir.file('cronograma_config.json', JSON.stringify(cronCfg, null, 2));
        const bitCfg = getVal(bitCfgRes);
        if (bitCfg) pDir.file('bitacora_config.json', JSON.stringify(bitCfg, null, 2));
        const bitNotas = getVal(bitNotasRes);
        if (Array.isArray(bitNotas) && bitNotas.length > 0) pDir.file('bitacora_notas.json', JSON.stringify(bitNotas, null, 2));
        const comp = getVal(compRes);
        if (Array.isArray(comp) && comp.length > 0) pDir.file('compras_gastos.json', JSON.stringify(comp, null, 2));
        const prov = getVal(provRes);
        if (Array.isArray(prov) && prov.length > 0) pDir.file('proveedores.json', JSON.stringify(prov, null, 2));
        const chat = getVal(chatRes);
        if (Array.isArray(chat) && chat.length > 0) pDir.file('chat_mensajes.json', JSON.stringify(chat, null, 2));
        const colabs = getVal(colabRes);
        if (Array.isArray(colabs) && colabs.length > 0) pDir.file('colaboradores.json', JSON.stringify(colabs, null, 2));
      } catch (err) {
        console.warn('[TrashService] Aviso respaldando datos de nube:', err);
      }
    } else if (item.storageSnapshot && typeof item.storageSnapshot === 'object') {
      Object.entries(item.storageSnapshot).forEach(([k, rawVal]) => {
        const cleanFileName = k.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.json';
        pDir.file(cleanFileName, rawVal);
        if (k.startsWith('control_obra_treeData_')) {
          try {
            const csvLines = ['Partida,Clave,Descripcion,Unidad,Cantidad,Precio_Unitario,Importe'];
            flattenTreeToCsv(JSON.parse(rawVal), '', csvLines);
            pDir.file('catalogo_conceptos.csv', '\uFEFF' + csvLines.join('\n'));
          } catch (_) {}
        }
      });
    }
  }

  root.file('resumen_papelera.csv', '\uFEFF' + summaryRows.join('\n'));
  root.file(
    'LEEME_RESPALDO_PAPELERA.txt',
    `RESPALDO DE PAPELERA CUBIKAR (${APP_LABEL.toUpperCase()})\n` +
    `Generado el: ${new Date().toLocaleString()}\n` +
    `Anfitrión: ${user?.name || 'Usuario'} (${myEmail || 'local'})\n` +
    `Proyectos respaldados: ${selected.length}\n`
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${rootName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Respaldo ZIP generado (${selected.length} proyecto${selected.length === 1 ? '' : 's'}).`, 'success');
  return true;
}

function formatRemainingCountdown(item) {
  const now = Date.now();
  const expMs = new Date(item.expiresAt).getTime();
  const msLeft = Math.max(0, expMs - now);
  const totalHours = Math.ceil(msLeft / (3600 * 1000));
  if (msLeft >= 24 * 3600 * 1000) {
    const days = Math.min(TRASH_RETENTION_DAYS, Math.ceil(msLeft / (24 * 3600 * 1000)));
    const cls = days <= 2
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-slate-800 text-slate-300 border-slate-700';
    return { text: `Se eliminará en ${days} día${days === 1 ? '' : 's'}`, badgeClass: cls };
  }
  return {
    text: `Se eliminará en ${Math.max(1, totalHours)} h`,
    badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
  };
}

function ensureTrashModalContainer() {
  let modal = document.getElementById('modal-papelera-proyectos');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-papelera-proyectos';
    modal.style.zIndex = '99999';
    modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[99999] hidden items-center justify-center p-3 sm:p-5';
    modal.onclick = (e) => {
      if (e.target === modal) closeTrashModal();
    };
    document.body.appendChild(modal);
  }
  if (!trashEscListenerBound && typeof document !== 'undefined') {
    trashEscListenerBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const el = document.getElementById('modal-papelera-proyectos');
        if (el && !el.classList.contains('hidden')) closeTrashModal();
      }
    });
  }
  return modal;
}

function renderTrashModalContent() {
  const modal = ensureTrashModalContainer();
  const items = cachedTrashItems;

  const listHtml = isTrashLoading
    ? `
      <div class="py-12 text-center text-slate-400 space-y-2">
        <i class="fa-solid fa-spinner fa-spin text-2xl text-blue-400"></i>
        <p class="text-xs">Cargando proyectos en papelera...</p>
      </div>
    `
    : (items.length === 0
      ? `
        <div class="py-12 px-4 text-center space-y-3">
          <div class="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
            <i class="fa-solid fa-trash-can text-2xl"></i>
          </div>
          <h4 class="text-sm font-bold text-white">Tu papelera está vacía</h4>
          <p class="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Cuando elimines uno de tus proyectos, se guardará aquí durante <strong>7 días</strong> para que puedas restaurarlo o descargar su respaldo antes de borrarse definitivamente.
          </p>
        </div>
      `
      : `
        <div class="divide-y divide-slate-800/80">
          ${items.map(item => {
            const countdown = formatRemainingCountdown(item);
            const delDate = item.deletedAt ? new Date(item.deletedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
            return `
              <div class="p-3.5 sm:p-4 hover:bg-slate-900/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-sm text-white truncate max-w-[280px]" title="${escapeHtml(item.projectName)}">${escapeHtml(item.projectName)}</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold border ${countdown.badgeClass}">${countdown.text}</span>
                    ${item.isCloudSynced
                      ? '<span class="px-1.5 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20"><i class="fa-solid fa-cloud text-[9px] mr-1"></i>Nube</span>'
                      : '<span class="px-1.5 py-0.5 rounded-md text-[10px] bg-slate-800 text-slate-300 border border-slate-700">Local</span>'}
                  </div>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span class="text-blue-400 font-medium">${escapeHtml(item.companyName)}</span>
                    ${item.projectLocation ? `<span class="truncate max-w-[220px]"><i class="fa-solid fa-location-dot text-rose-400 mr-1 text-[10px]"></i>${escapeHtml(item.projectLocation)}</span>` : ''}
                    ${delDate ? `<span><i class="fa-regular fa-clock mr-1 text-[10px]"></i>Eliminado: ${escapeHtml(delDate)}</span>` : ''}
                  </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <button type="button"
                          onclick="restoreProjectFromTrashAction('${escapeHtml(item.id)}', this)"
                          class="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                          title="Restaurar proyecto a Mis Proyectos">
                    <i class="fa-solid fa-rotate-left text-[11px]"></i>
                    <span>Restaurar</span>
                  </button>
                  <button type="button"
                          onclick="backupTrashedProjectAction('${escapeHtml(item.id)}', this)"
                          class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                          title="Descargar respaldo ZIP de este proyecto">
                    <i class="fa-solid fa-file-zipper text-[11px] text-amber-400"></i>
                    <span>Respaldar</span>
                  </button>
                  <button type="button"
                          onclick="permanentDeleteFromTrashAction('${escapeHtml(item.id)}', '${escapeHtml(item.projectName).replace(/'/g, "\\'")}', this)"
                          class="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                          title="Eliminar definitivamente ahora">
                    <i class="fa-solid fa-trash text-[11px]"></i>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `);

  modal.innerHTML = `
    <div class="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden text-slate-200 animate-in fade-in zoom-in-95 duration-150">
      <!-- Encabezado -->
      <div class="bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/40 px-5 py-4 flex items-center justify-between gap-3 border-b border-slate-800 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
            <i class="fa-solid fa-trash-can text-sm"></i>
          </div>
          <div class="min-w-0">
            <h3 class="font-bold text-sm sm:text-base text-white tracking-wide flex items-center gap-2">
              <span>Papelera de Reciclaje</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">7 días</span>
            </h3>
            <p class="text-[11px] text-slate-400 truncate">Solo tú (anfitrión) puedes restaurar, respaldar o eliminar definitivamente tus proyectos.</p>
          </div>
        </div>
        <button type="button" onclick="closeTrashModal()" class="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer" title="Cerrar">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      ${items.length > 0 ? `
        <div class="px-5 py-2.5 bg-slate-900/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <span class="text-slate-400"><strong class="text-white">${items.length}</strong> proyecto${items.length === 1 ? '' : 's'} en papelera</span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="backupAllTrashedProjectsAction(this)" class="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 font-semibold transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-download text-[11px]"></i>
              <span>Respaldar Todo (.zip)</span>
            </button>
            <button type="button" onclick="emptyTrashAction(this)" class="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 font-semibold transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-fire text-[11px]"></i>
              <span>Vaciar Papelera</span>
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Lista -->
      <div class="flex-1 overflow-y-auto custom-scroll">
        ${listHtml}
      </div>

      <!-- Pie informativo -->
      <div class="px-5 py-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-3 text-[11px] text-slate-400 shrink-0">
        <span><i class="fa-solid fa-circle-info text-blue-400 mr-1.5"></i>Los elementos se eliminan automáticamente al cumplir 7 días. No consumen espacios activos de tu plan.</span>
        <button type="button" onclick="closeTrashModal()" class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition cursor-pointer shrink-0">Cerrar</button>
      </div>
    </div>
  `;
}

export async function openTrashModal() {
  const modal = ensureTrashModalContainer();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  isTrashLoading = true;
  renderTrashModalContent();

  await fetchTrashedProjectsForHost({ force: true });
  isTrashLoading = false;
  renderTrashModalContent();
}

export function closeTrashModal() {
  const modal = document.getElementById('modal-papelera-proyectos');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export async function restoreProjectFromTrashAction(projectId, btnEl = null) {
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await restoreProjectFromTrash(projectId);
    if (!res.success) {
      showToast(res.reason || 'No se pudo restaurar el proyecto.', res.limitReached ? 'warning' : 'error');
      return;
    }
    showToast(`Proyecto "${res.project?.projectName || 'Obra'}" restaurado a Mis Proyectos.`, 'success');
    renderTrashModalContent();
    if (typeof window !== 'undefined') {
      if (typeof window.renderPortalDashboard === 'function') window.renderPortalDashboard();
      else if (typeof window.refreshProjectsGridUI === 'function') window.refreshProjectsGridUI();
    }
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

export async function permanentDeleteFromTrashAction(projectId, projectName = '', btnEl = null) {
  const label = projectName || 'este proyecto';
  if (!confirm(`¿Eliminar definitivamente "${label}"?\n\nEsta acción borrará el proyecto y todos sus datos de forma irreversible.`)) {
    return;
  }
  if (btnEl) btnEl.disabled = true;
  try {
    const res = await permanentlyDeleteTrashedProject(projectId);
    if (!res.success) {
      showToast(res.reason || 'No se pudo eliminar definitivamente.', 'error');
      return;
    }
    showToast(`Proyecto "${label}" eliminado definitivamente.`, 'info');
    renderTrashModalContent();
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

export async function backupTrashedProjectAction(projectId, btnEl = null) {
  if (btnEl) btnEl.disabled = true;
  try {
    await backupTrashedProjectsZip([projectId]);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

export async function backupAllTrashedProjectsAction(btnEl = null) {
  if (btnEl) btnEl.disabled = true;
  try {
    await backupTrashedProjectsZip([]);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

export async function emptyTrashAction(btnEl = null) {
  const items = cachedTrashItems.length > 0 ? cachedTrashItems : await fetchTrashedProjectsForHost();
  if (items.length === 0) return;
  if (!confirm(`¿Vaciar toda la papelera (${items.length} proyecto${items.length === 1 ? '' : 's'})?\n\nTodos los proyectos en papelera se eliminarán permanentemente y no podrás recuperarlos.`)) {
    return;
  }
  if (btnEl) btnEl.disabled = true;
  try {
    for (const item of [...items]) {
      await permanentlyDeleteTrashedProject(item.id);
    }
    showToast('Papelera vaciada definitivamente.', 'info');
    renderTrashModalContent();
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

if (typeof window !== 'undefined') {
  window.openTrashModal = openTrashModal;
  window.closeTrashModal = closeTrashModal;
  window.updateTrashBadgeUI = updateTrashBadgeUI;
  window.restoreProjectFromTrashAction = restoreProjectFromTrashAction;
  window.permanentDeleteFromTrashAction = permanentDeleteFromTrashAction;
  window.backupTrashedProjectAction = backupTrashedProjectAction;
  window.backupAllTrashedProjectsAction = backupAllTrashedProjectsAction;
  window.emptyTrashAction = emptyTrashAction;
  window.moveProjectToTrash = moveProjectToTrash;
}
