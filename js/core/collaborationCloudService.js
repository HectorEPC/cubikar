// js/core/collaborationCloudService.js
// Sincronización integral en la nube (Supabase Auth user_metadata) para garantizar
// persistencia total de proyectos, anfitriones, invitaciones y membresías
// al iniciar sesión en cualquier computadora, navegador o dispositivo.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261116_cf4';
import { syncProjectToCloud, fetchCloudProjects } from './cloudProjectService.js?v=20261116_cf4';
import {
  getCurrentUser,
  saveCurrentUser,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  getProjectsList,
  saveProjectsList,
  getUserPlanId,
  isInvalidUserName,
  resolveCleanHostName,
  markProjectDeleted,
  isProjectMarkedDeleted,
  getDeletedProjectsList
} from '../modules/portal/projectService.js?v=20261116_cf4';
import { getSettingsKey, getStorageKey } from '../config/constants.js?v=20261116_cf4';
import { getChatStorageKey } from '../modules/chat/projectChat.js?v=20261116_cf4';

let syncDebounceTimer = null;
let isCloudSyncInFlight = false;
let pendingCloudSync = false;
let pendingCloudSyncUser = null;
let lastCloudSyncSignature = '';
let lastInternalCloudUpdateAt = 0;

function computeCloudStateSignature(cloudState) {
  if (!cloudState || typeof cloudState !== 'object') return '';
  try {
    const { updatedAt: _ignored, ...rest } = cloudState;
    return JSON.stringify(rest);
  } catch (_) {
    return '';
  }
}

export function isRecentInternalCloudAuthUpdate(windowMs = 6000) {
  return lastInternalCloudUpdateAt > 0 && (Date.now() - lastInternalCloudUpdateAt) < windowMs;
}

/**
 * Sincroniza hacia la nube de Supabase (user_metadata para perfil/suscripción/invitaciones/lápidas
 * y public.proyectos como única fuente de verdad para los proyectos).
 */
export async function syncUserCollaborationToCloud(user = null) {
  const sb = getSupabaseClient();
  if (!sb || !isSupabaseConfigured()) return false;
  if (isCloudSyncInFlight) {
    pendingCloudSync = true;
    pendingCloudSyncUser = user || getCurrentUser();
    return false;
  }

  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;
  const myEmail = (currentUser.email || '').toLowerCase().trim();

  isCloudSyncInFlight = true;
  try {
    const { data: sessionData, error: sessionErr } = await sb.auth.getSession();
    const sessionUser = sessionData?.session?.user;
    if (sessionErr || !sessionUser) {
      return false;
    }

    const allInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
    const allPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
    const allProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];

    // Solo usar public.proyectos como fuente de verdad; filtrar eliminados para el manifiesto
    const myOwnedActiveProjects = allProjects.filter(p => {
      const oEmail = (p.ownerEmail || '').toLowerCase().trim();
      return oEmail === myEmail && !isProjectMarkedDeleted(p.id) && !isProjectMarkedDeleted(p.cloudId);
    });

    // 3. Invitaciones al plan de anfitriones recibidas/aceptadas
    const myPlanInvs = allPlanInvs.filter(pi => 
      (pi.email || '').toLowerCase().trim() === myEmail
    );

    // 4. Invitaciones formales de proyectos recibidas/aceptadas
    const myAcceptedInvs = allInvs.filter(i => 
      (i.email || '').toLowerCase().trim() === myEmail
    );

    // 5. Invitaciones emitidas por este usuario hacia otros (como anfitrión)
    const mySentPlanInvs = allPlanInvs.filter(pi => 
      (pi.ownerEmail || '').toLowerCase().trim() === myEmail
    );
    const mySentProjectInvs = allInvs.filter(i => 
      (i.ownerEmail || '').toLowerCase().trim() === myEmail
    );

    // 6. Suscripción activa del usuario
    let currentSub = currentUser.subscription;
    if (!currentSub && typeof localStorage !== 'undefined') {
      try {
        const rawSub = localStorage.getItem(`adm_const_subscription_${myEmail}`);
        if (rawSub) currentSub = JSON.parse(rawSub);
      } catch (_) {}
    }
    if (!currentSub) {
      currentSub = { planId: getUserPlanId(currentUser) || 'free', billingCycle: 'monthly' };
    }

    const deletedList = typeof getDeletedProjectsList === 'function' ? getDeletedProjectsList() : [];
    const cloudPayload = {
      version: 2,
      subscription: currentSub,
      ownedProjects: [],
      collaboratedProjects: [],
      planInvitations: myPlanInvs,
      acceptedInvitations: myAcceptedInvs,
      sentPlanInvitations: mySentPlanInvs,
      sentProjectInvitations: mySentProjectInvs,
      deletedProjectIds: Array.isArray(deletedList) ? deletedList.slice(-500) : [],
      updatedAt: new Date().toISOString()
    };

    const nextSignature = computeCloudStateSignature(cloudPayload);
    const remoteState = sessionUser?.user_metadata?.cubikar_cloud_state_v2 || currentUser?.user_metadata?.cubikar_cloud_state_v2;
    const remoteSignature = computeCloudStateSignature(remoteState);

    if (nextSignature && (nextSignature === lastCloudSyncSignature || nextSignature === remoteSignature)) {
      lastCloudSyncSignature = nextSignature;
      if (currentUser && remoteState) {
        if (!currentUser.user_metadata) currentUser.user_metadata = {};
        if (!currentUser.user_metadata.cubikar_cloud_state_v2) {
          currentUser.user_metadata.cubikar_cloud_state_v2 = remoteState;
          saveCurrentUser(currentUser);
        }
      }
    } else {
      lastInternalCloudUpdateAt = Date.now();
      const { error } = await sb.auth.updateUser({
        data: {
          cubikar_cloud_state_v2: cloudPayload
        }
      });

      if (error) {
        console.warn('[CloudSync] Aviso al guardar estado en Supabase:', error.message);
        return false;
      }

      lastCloudSyncSignature = nextSignature;

      if (currentUser) {
        if (!currentUser.user_metadata) currentUser.user_metadata = {};
        currentUser.user_metadata.cubikar_cloud_state_v2 = cloudPayload;
        saveCurrentUser(currentUser);
      }
    }

    // Persistir proyectos nuevos del propietario que aún no han sido sincronizados a PostgreSQL
    const rawProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === myEmail && !p.isCloudSynced && !isProjectMarkedDeleted(p.id) && !isProjectMarkedDeleted(p.cloudId));
    let localProjectsUpdated = false;
    for (const p of rawProjects) {
      try {
        let tree = null;
        let setts = null;
        const rawT = localStorage.getItem(getStorageKey(p.id));
        const rawS = localStorage.getItem(getSettingsKey(p.id));
        if (rawT) tree = JSON.parse(rawT);
        if (rawS) setts = JSON.parse(rawS);
        const res = await syncProjectToCloud(p, setts, tree);
        if (res && res.success) {
          p.isCloudSynced = true;
          if (res.projectId) p.cloudId = res.projectId;
          localProjectsUpdated = true;
        }
      } catch (e) {
        console.warn('[CloudSync] Aviso al sincronizar proyecto individual con PostgreSQL:', e);
      }
    }
    if (localProjectsUpdated && typeof saveProjectsList === 'function') {
      saveProjectsList(allProjects);
    }

    // Publicar manifiesto de proyectos activos del anfitrión en Supabase para sincronización inter-usuarios
    if (myEmail) {
      try {
        await recordHostActiveManifest(myEmail, myOwnedActiveProjects.map(p => p.cloudId || p.id));
      } catch (_) {}
    }

    console.info(`[CloudSync] Estado respaldado en la nube con éxito (${myOwnedActiveProjects.length} propias activas, ${myPlanInvs.length} anfitriones).`);
    return true;
  } catch (err) {
    console.warn('[CloudSync] Excepción al respaldar en la nube:', err);
    return false;
  } finally {
    isCloudSyncInFlight = false;
    if (pendingCloudSync) {
      const nextUser = pendingCloudSyncUser || getCurrentUser();
      pendingCloudSync = false;
      pendingCloudSyncUser = null;
      setTimeout(() => { syncUserCollaborationToCloud(nextUser); }, 50);
    }
  }
}

/**
 * Mapea y comprime los datos de un proyecto para almacenamiento en la nube
 */
function mapProjectForCloudSync(p) {
  let localSettings = null;
  let localTree = null;
  let localChat = null;
  try {
    const rawSet = localStorage.getItem(getSettingsKey(p.id));
    if (rawSet) localSettings = JSON.parse(rawSet);
    const rawTree = localStorage.getItem(getStorageKey(p.id));
    if (rawTree) {
      const parsedTree = JSON.parse(rawTree);
      // Incluir catálogo si no supera 200 conceptos para mantener tamaño ágil
      if (Array.isArray(parsedTree) && parsedTree.length <= 200) {
        localTree = parsedTree;
      }
    }
    const rawChat = localStorage.getItem(getChatStorageKey(p.id));
    if (rawChat) {
      const parsedChat = JSON.parse(rawChat);
      if (Array.isArray(parsedChat)) {
        localChat = parsedChat.slice(-150);
      }
    }
  } catch (_) {}

  return {
    id: p.id,
    projectName: p.projectName,
    companyName: p.companyName || '',
    companyLogo: p.companyLogo || '',
    projectLocation: p.projectLocation || '',
    tipoObra: p.tipoObra || 'Edificación',
    currency: p.currency || 'MXN',
    currencySymbol: p.currencySymbol || '$',
    factorSobrecosto: p.factorSobrecosto || 1.0,
    totalPresupuesto: p.totalPresupuesto || 0,
    conceptCount: p.conceptCount || 0,
    partidasCount: p.partidasCount || 0,
    ownerEmail: p.ownerEmail,
    ownerName: (p.ownerName && !isInvalidUserName(p.ownerName, p.ownerEmail, p))
      ? p.ownerName
      : resolveCleanHostName(p.ownerEmail, '', p),
    ownerPlanId: p.ownerPlanId || 'free',
    members: Array.isArray(p.members) ? p.members : [],
    createdAt: p.createdAt || new Date().toISOString(),
    settings: localSettings,
    treeData: localTree,
    chatMessages: localChat
  };
}

/**
 * Restaura en localStorage el estado completo recuperado de Supabase Auth user_metadata
 */
export function restoreUserCollaborationFromCloud(user = null) {
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;
  const myEmail = (currentUser.email || '').toLowerCase().trim();

  // Buscar payload v2 o v1 en user_metadata
  const state = currentUser.user_metadata?.cubikar_cloud_state_v2 || currentUser.user_metadata?.cubikar_collaboration_v1;
  try {
    if (typeof window !== 'undefined' && typeof window.hydrateNotificationStateFromCloud === 'function') {
      window.hydrateNotificationStateFromCloud(currentUser);
    }
  } catch (_) {}
  if (!state || typeof state !== 'object') return false;

  let hasChanges = false;

  // 1. Restaurar suscripción en localStorage de esta computadora
  if (state.subscription && state.subscription.planId) {
    try {
      localStorage.setItem(`adm_const_subscription_${myEmail}`, JSON.stringify(state.subscription));
      if (!currentUser.subscription || currentUser.subscription.planId !== state.subscription.planId) {
        currentUser.subscription = state.subscription;
        saveCurrentUser(currentUser);
        hasChanges = true;
      }
    } catch (_) {}
  }

  // 1B. Restaurar lista de IDs de proyectos eliminados desde user_metadata antes de reconciliar con Supabase
  if (Array.isArray(state.deletedProjectIds) && state.deletedProjectIds.length > 0 && typeof markProjectDeleted === 'function') {
    state.deletedProjectIds.forEach(delId => {
      if (delId) markProjectDeleted(delId);
    });
  }

  // Usar únicamente public.proyectos + public.proyectos_eliminados como fuente de verdad
  // (no reinyectar state.ownedProjects ni state.collaboratedProjects desde user_metadata).
  const deletedList = typeof getDeletedProjectsList === 'function' ? getDeletedProjectsList() : [];
  const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

  // Limpiar copias obsoletas en localStorage según lápidas conocidas
  try {
    const localProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];
    const surviving = localProjects.filter(lp => lp && !isDeleted(lp.id) && !(lp.cloudId && isDeleted(lp.cloudId)));
    if (surviving.length !== localProjects.length && typeof saveProjectsList === 'function') {
      saveProjectsList(surviving);
      hasChanges = true;
    }
  } catch (_) {}

  // 3. Restaurar invitaciones al plan (tanto recibidas como emitidas)
  const cloudPlanInvs = [];
  if (Array.isArray(state.planInvitations)) cloudPlanInvs.push(...state.planInvitations);
  if (Array.isArray(state.sentPlanInvitations)) cloudPlanInvs.push(...state.sentPlanInvitations);

  if (cloudPlanInvs.length > 0) {
    const localPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
    let planChanged = false;

    cloudPlanInvs.forEach(cpi => {
      const idx = localPlanInvs.findIndex(lpi => 
        lpi.id === cpi.id || 
        ((lpi.ownerEmail || '').toLowerCase().trim() === (cpi.ownerEmail || '').toLowerCase().trim() && (lpi.email || '').toLowerCase().trim() === (cpi.email || '').toLowerCase().trim())
      );
      if (idx === -1) {
        localPlanInvs.unshift(cpi);
        planChanged = true;
      } else {
        if (localPlanInvs[idx].status !== cpi.status) {
          localPlanInvs[idx].status = cpi.status;
          planChanged = true;
        }
        if (cpi.role && localPlanInvs[idx].role !== cpi.role) {
          localPlanInvs[idx].role = cpi.role;
          planChanged = true;
        }
      }
    });

    if (planChanged && typeof saveStoredPlanInvitations === 'function') {
      saveStoredPlanInvitations(localPlanInvs);
      hasChanges = true;
    }
  }

  // 4. Restaurar invitaciones formales de proyectos
  const cloudProjectInvs = [];
  if (Array.isArray(state.acceptedInvitations)) cloudProjectInvs.push(...state.acceptedInvitations);
  if (Array.isArray(state.sentProjectInvitations)) cloudProjectInvs.push(...state.sentProjectInvitations);

  if (cloudProjectInvs.length > 0) {
    const localInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
    let invsChanged = false;

    cloudProjectInvs.forEach(ci => {
      const idx = localInvs.findIndex(li => 
        li.id === ci.id || 
        (li.projectId === ci.projectId && (li.email || '').toLowerCase().trim() === (ci.email || '').toLowerCase().trim())
      );
      if (idx === -1) {
        localInvs.unshift(ci);
        invsChanged = true;
      } else if (localInvs[idx].status !== ci.status) {
        localInvs[idx].status = ci.status;
        localInvs[idx].acceptedAt = ci.acceptedAt || localInvs[idx].acceptedAt;
        invsChanged = true;
      }
    });

    if (invsChanged && typeof saveStoredInvitations === 'function') {
      saveStoredInvitations(localInvs);
      hasChanges = true;
    }
  }

  // Consultar proyectos en Supabase PostgreSQL (public.proyectos + public.proyecto_colaboradores)
  if (isSupabaseConfigured()) {
    fetchCloudProjects().then(cloudList => {
      const activeCloud = Array.isArray(cloudList) ? cloudList : [];
      const curList = typeof getProjectsList === 'function' ? getProjectsList() : [];
      let updated = false;

      // 1. Agregar o actualizar proyectos vigentes devueltos por Supabase
      const migrateLocalProjectKeys = (oldId, newId) => {
        if (!oldId || !newId || oldId === newId || typeof localStorage === 'undefined') return;
        const keyPairs = [
          [getStorageKey(oldId), getStorageKey(newId)],
          [getSettingsKey(oldId), getSettingsKey(newId)],
          [getChatStorageKey(oldId), getChatStorageKey(newId)],
          [`estimaciones_data_${oldId}`, `estimaciones_data_${newId}`],
          [`adm_const_bitacora_${oldId}`, `adm_const_bitacora_${newId}`],
          [`expenses_control_${oldId}`, `expenses_control_${newId}`],
          [`calendario_cfg_${oldId}`, `calendario_cfg_${newId}`],
          [`calendario_workdays_${oldId}`, `calendario_workdays_${newId}`]
        ];
        keyPairs.forEach(([fromKey, toKey]) => {
          try {
            const oldVal = localStorage.getItem(fromKey);
            if (oldVal !== null && localStorage.getItem(toKey) === null) {
              localStorage.setItem(toKey, oldVal);
            }
          } catch (_) {}
        });
      };

      activeCloud.forEach(cp => {
        if (isDeleted(cp.id) || isDeleted(cp.cloudId)) return;
        const idx = curList.findIndex(lp => lp.id === cp.id || lp.cloudId === cp.id);
        if (idx === -1) {
          curList.unshift(cp);
          updated = true;
        } else {
          if (curList[idx].id && cp.id && curList[idx].id !== cp.id) {
            migrateLocalProjectKeys(curList[idx].id, cp.id);
          }
          curList[idx] = { ...curList[idx], ...cp, isCloudSynced: true };
          updated = true;
        }
      });

      // 2. RECONCILIACIÓN DE PROYECTOS COLABORADOS:
      // No marcar como eliminado permanentemente (markProjectDeleted) un proyecto colaborado si no vino en esta consulta
      // (podría estar recién creado o con invitación pendiente). Tampoco purgar jamás el proyecto activo en el workspace.
      const activeCloudIds = new Set(activeCloud.map(cp => cp.id));
      const activePId = typeof window !== 'undefined' && window.location?.search ? new URLSearchParams(window.location.search).get('project') : null;
      let prunedCollab = 0;
      const cleanList = curList.filter(p => {
        const pOwner = (p.ownerEmail || '').toLowerCase().trim();
        if (!pOwner || pOwner === myEmail || p.isSample || (typeof p.id === 'string' && (p.id.startsWith('proj-default') || p.id.startsWith('proj-demo')))) {
          return true;
        }
        // Nunca purgar el proyecto que el usuario tiene abierto actualmente
        if (activePId && (p.id === activePId || p.cloudId === activePId)) {
          return true;
        }
        // Si fue explícitamente eliminado por lápida, purgarlo
        if (isProjectMarkedDeleted(p.id) || (p.cloudId && isProjectMarkedDeleted(p.cloudId))) {
          prunedCollab++;
          return false;
        }
        // Si el usuario es miembro activo o pendiente en p.members, conservarlo aunque Supabase tarde en indexarlo
        if (Array.isArray(p.members) && p.members.some(m => (m.email || '').toLowerCase().trim() === myEmail && (m.status === 'active' || m.status === 'accepted' || m.status === 'pending'))) {
          return true;
        }
        if (!activeCloudIds.has(p.id) && !activeCloudIds.has(p.cloudId)) {
          prunedCollab++;
          return false;
        }
        return true;
      });

      if (prunedCollab > 0) {
        updated = true;
        if (currentUser && currentUser.user_metadata?.cubikar_cloud_state_v2) {
          const cs = currentUser.user_metadata.cubikar_cloud_state_v2;
          if (Array.isArray(cs.collaboratedProjects)) {
            cs.collaboratedProjects = cs.collaboratedProjects.filter(p => !isProjectMarkedDeleted(p.id) && !isProjectMarkedDeleted(p.cloudId));
            saveCurrentUser(currentUser);
          }
        }
      }

      if (updated && typeof saveProjectsList === 'function') {
        saveProjectsList(cleanList);
        if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
          window.refreshProjectsGridUI();
        }
      }
    }).catch(err => {
      console.warn('[CloudSync] Aviso al reconciliar proyectos con Supabase:', err);
    });
  }

  if (hasChanges) {
    console.info('[CloudSync] Estado restaurado desde la nube en este navegador con éxito.');
  }
  return hasChanges;
}

/**
 * Registrar lápida (tombstone) de proyecto eliminado en Supabase (tabla chat_mensajes)
 * para asegurar que usuarios desconectados o en otros navegadores lo eliminen al reconectar.
 */
export async function recordDeletedProjectTombstone(projectId, ownerEmail = null, opts = {}) {
  if (!projectId) return false;
  const sb = getSupabaseClient();
  if (!sb || typeof sb.from !== 'function') return false;

  const user = getCurrentUser();
  const deletedBy = String(opts?.deletedByEmail || user?.email || '').toLowerCase().trim();
  const oEmail = String(ownerEmail || user?.email || '').toLowerCase().trim();
  const pidStr = String(projectId).trim();
  const rowId = `__tombstone__${pidStr}`;
  const nowIso = new Date().toISOString();

  try {
    const collabEmails = Array.isArray(opts?.collaboratorEmails)
      ? Array.from(new Set(opts.collaboratorEmails.map(e => String(e || '').toLowerCase().trim()).filter(Boolean)))
      : [];

    const { error: peErr } = await sb.from('proyectos_eliminados').upsert({
      proyecto_id: pidStr,
      owner_email: oEmail || deletedBy || null,
      deleted_by_email: deletedBy || oEmail || null,
      collaborator_emails: collabEmails,
      deleted_at: nowIso
    }, { onConflict: 'proyecto_id' });
    if (peErr) {
      console.warn('[CloudSync] Aviso al registrar en proyectos_eliminados:', peErr.message || peErr);
    }

    await sb.from('chat_mensajes').upsert({
      id: rowId,
      proyecto_id: '__cubikar_tombstones__',
      autor_nombre: user?.name || 'Sistema',
      autor_email: user?.email || oEmail || deletedBy,
      mensaje: pidStr,
      payload_json: {
        projectId: pidStr,
        ownerEmail: oEmail,
        deletedByEmail: deletedBy,
        deletedAt: nowIso
      },
      created_at: nowIso
    }, { onConflict: 'id' });
    return true;
  } catch (err) {
    console.warn('[CloudSync] Error al registrar lápida de eliminación:', err);
    return false;
  }
}

/**
 * Publicar manifiesto de proyectos activos del anfitrión en Supabase (tabla chat_mensajes).
 * Contiene la lista autoritativa de IDs de proyectos vigentes de este anfitrión.
 */
export async function recordHostActiveManifest(ownerEmail, activeProjectIds = []) {
  if (!ownerEmail) return false;
  const sb = getSupabaseClient();
  if (!sb || typeof sb.from !== 'function') return false;

  const oEmail = ownerEmail.toLowerCase().trim();
  const rowId = `__manifest__${oEmail}`;
  const ids = Array.isArray(activeProjectIds) ? activeProjectIds : [];

  try {
    await sb.from('chat_mensajes').upsert({
      id: rowId,
      proyecto_id: '__cubikar_host_manifest__',
      autor_nombre: 'Manifiesto de Proyectos',
      autor_email: oEmail,
      mensaje: JSON.stringify(ids),
      payload_json: {
        ownerEmail: oEmail,
        activeProjectIds: ids,
        count: ids.length,
        updatedAt: new Date().toISOString()
      },
      created_at: new Date().toISOString()
    }, { onConflict: 'id' });
    return true;
  } catch (err) {
    console.warn('[CloudSync] Error al registrar manifiesto del anfitrión:', err);
    return false;
  }
}

/**
 * Sincroniza y purga en la máquina del usuario invitado cualquier proyecto de un anfitrión
 * que ya haya sido eliminado por dicho anfitrión.
 */
export async function syncHostWorkspaceProjects(hostEmail) {
  if (!hostEmail) return false;
  const sb = getSupabaseClient();
  if (!sb || typeof sb.from !== 'function') return false;

  const targetHost = hostEmail.toLowerCase().trim();
  const user = getCurrentUser();
  const myEmail = (user?.email || '').toLowerCase().trim();

  try {
    // Consultar proyectos del anfitrión directamente desde la tabla public.proyectos en Supabase.
    // RLS de Supabase devuelve únicamente las obras de este anfitrión donde el usuario
    // actual tiene permiso activo aceptado.
    const { data: hostProjects, error } = await sb
      .from('proyectos')
      .select('*, proyecto_colaboradores(*)')
      .ilike('owner_email', targetHost);

    if (error) {
      console.warn('[HostWorkspaceSync] Error al consultar proyectos del anfitrión en Supabase:', error.message);
      return false;
    }

    const currentList = getProjectsList();
    const activeCloudProjects = Array.isArray(hostProjects) ? hostProjects : [];
    const activeIdsSet = new Set(activeCloudProjects.map(p => p.id));

    // Si la consulta directa a proyectos devolvió vacío o incompleto, consultar también el manifiesto del anfitrión
    if (activeIdsSet.size === 0) {
      try {
        const { data: manifestRow } = await sb
          .from('chat_mensajes')
          .select('mensaje, payload_json')
          .eq('id', `__manifest__${targetHost}`)
          .maybeSingle();
        if (manifestRow?.payload_json?.activeProjectIds && Array.isArray(manifestRow.payload_json.activeProjectIds)) {
          manifestRow.payload_json.activeProjectIds.forEach(id => activeIdsSet.add(id));
        } else if (manifestRow?.mensaje) {
          try {
            const parsed = JSON.parse(manifestRow.mensaje);
            if (Array.isArray(parsed)) parsed.forEach(id => activeIdsSet.add(id));
          } catch (_) {}
        }
      } catch (_) {}
    }

    if (typeof window !== 'undefined') {
      if (!window.__hostActiveManifest) window.__hostActiveManifest = {};
      window.__hostActiveManifest[targetHost] = Array.from(activeIdsSet);
    }
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`cubikar_host_manifest_${targetHost}`, JSON.stringify(Array.from(activeIdsSet)));
      }
    } catch (_) {}

    let prunedCount = 0;
    const activePId = typeof window !== 'undefined' && window.location?.search ? new URLSearchParams(window.location.search).get('project') : null;

    const updatedList = currentList.filter(p => {
      const pOwner = (p.ownerEmail || '').toLowerCase().trim();
      if (pOwner === targetHost) {
        if (activePId && (p.id === activePId || p.cloudId === activePId)) {
          return true;
        }
        // Si fue eliminado por lápida, purgarlo
        if (isProjectMarkedDeleted(p.id) || (p.cloudId && isProjectMarkedDeleted(p.cloudId))) {
          prunedCount++;
          return false;
        }
        if (activeIdsSet.size > 0 && !activeIdsSet.has(p.id) && !activeIdsSet.has(p.cloudId)) {
          // Si no vino en activeIdsSet y no es miembro pendiente local, remover de la lista
          const hasLocalMem = Array.isArray(p.members) && p.members.some(m => (m.email || '').toLowerCase().trim() === myEmail && (m.status === 'active' || m.status === 'accepted' || m.status === 'pending'));
          if (!hasLocalMem) {
            prunedCount++;
            return false;
          }
        }

        // Si existe en la nube, permitir estado 'accepted', 'active' o 'pending'
        const cloudP = activeCloudProjects.find(cp => cp.id === p.id || cp.id === p.cloudId);
        if (cloudP && Array.isArray(cloudP.proyecto_colaboradores)) {
          const myMem = cloudP.proyecto_colaboradores.find(
            c => (c.email_colaborador || '').toLowerCase().trim() === myEmail
          );
          if (!myMem || (myMem.estado_invitacion !== 'accepted' && myMem.estado_invitacion !== 'active' && myMem.estado_invitacion !== 'pending')) {
            prunedCount++;
            return false;
          }
        }
      }
      return true;
    });

    const remainingHostProjects = updatedList.filter(p => {
      const pOwner = (p.ownerEmail || '').toLowerCase().trim();
      return pOwner === targetHost && !isProjectMarkedDeleted(p.id) && !(p.cloudId && isProjectMarkedDeleted(p.cloudId));
    });

    if (activeIdsSet.size === 0 && remainingHostProjects.length === 0) {
      try {
        const planInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
        const cleanedPlanInvs = planInvs.filter(pi => (pi.ownerEmail || '').toLowerCase().trim() !== targetHost);
        if (cleanedPlanInvs.length !== planInvs.length && typeof saveStoredPlanInvitations === 'function') {
          saveStoredPlanInvitations(cleanedPlanInvs);
        }
        if (user && user.user_metadata?.cubikar_cloud_state_v2 && Array.isArray(user.user_metadata.cubikar_cloud_state_v2.planInvitations)) {
          user.user_metadata.cubikar_cloud_state_v2.planInvitations = user.user_metadata.cubikar_cloud_state_v2.planInvitations.filter(
            pi => (pi.ownerEmail || '').toLowerCase().trim() !== targetHost
          );
          saveCurrentUser(user);
        }
      } catch (_) {}
    }

    if (prunedCount > 0) {
      saveProjectsList(updatedList);
      if (user && user.user_metadata?.cubikar_cloud_state_v2) {
        const cs = user.user_metadata.cubikar_cloud_state_v2;
        if (Array.isArray(cs.collaboratedProjects)) {
          cs.collaboratedProjects = cs.collaboratedProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() !== targetHost || activeIdsSet.has(p.id) || (p.cloudId && activeIdsSet.has(p.cloudId)));
          saveCurrentUser(user);
        }
      }
      console.info(`[HostWorkspaceSync] Se purgaron ${prunedCount} proyectos inexistentes o sin permiso del anfitrión ${targetHost}.`);
      if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
      return true;
    } else {
      if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    }
  } catch (err) {
    console.warn('[HostWorkspaceSync] Error al sincronizar proyectos del anfitrión:', err);
  }
  return false;
}

/**
 * Reconciliar lápidas globales de proyectos eliminados en la nube
 */
export async function reconcileDeletedProjectsWithCloud() {
  const sb = getSupabaseClient();
  if (!sb || typeof sb.from !== 'function') return false;

  try {
    const [{ data: cloudDeletedRows, error: cdErr }, { data: tombstones, error: tErr }] = await Promise.all([
      sb.from('proyectos_eliminados').select('proyecto_id, owner_email, deleted_by_email, deleted_at').limit(500),
      sb.from('chat_mensajes').select('mensaje, payload_json').eq('proyecto_id', '__cubikar_tombstones__').limit(500)
    ]);

    let changed = false;
    const newlyDeletedIds = [];
    const registerDeletedId = (pid) => {
      const cleanPid = pid ? String(pid).trim() : '';
      if (!cleanPid) return;
      if (!isProjectMarkedDeleted(cleanPid)) {
        markProjectDeleted(cleanPid);
        newlyDeletedIds.push(cleanPid);
        changed = true;
      }
    };

    if (!cdErr && Array.isArray(cloudDeletedRows)) {
      cloudDeletedRows.forEach(r => registerDeletedId(r?.proyecto_id));
    }

    if (!tErr && Array.isArray(tombstones) && tombstones.length > 0) {
      tombstones.forEach(t => {
        const pid = t.payload_json?.projectId || t.mensaje;
        registerDeletedId(pid);
      });
    }

    if (changed) {
      newlyDeletedIds.forEach(pid => {
        try {
          localStorage.removeItem(getSettingsKey(pid));
          localStorage.removeItem(getStorageKey(pid));
          localStorage.removeItem(`estimaciones_data_${pid}`);
          localStorage.removeItem(`expenses_control_${pid}`);
          localStorage.removeItem(`calendario_cfg_${pid}`);
          localStorage.removeItem(`calendario_workdays_${pid}`);
          localStorage.removeItem(`adm_const_project_chat_${pid}`);
          localStorage.removeItem(`adm_const_bitacora_${pid}`);
          localStorage.removeItem(`adm_const_signatures_${pid}`);
          localStorage.removeItem(`adm_const_expenses_${pid}`);
          localStorage.removeItem(`adm_const_suppliers_${pid}`);
          localStorage.removeItem(`adm_arq_project_chat_${pid}`);
        } catch (_) {}
      });

      const current = getProjectsList();
      saveProjectsList(current);

      const user = getCurrentUser();
      if (user && user.user_metadata?.cubikar_cloud_state_v2) {
        const cs = user.user_metadata.cubikar_cloud_state_v2;
        const hadLegacyArrays = (Array.isArray(cs.collaboratedProjects) && cs.collaboratedProjects.length > 0) ||
          (Array.isArray(cs.ownedProjects) && cs.ownedProjects.length > 0);
        cs.collaboratedProjects = [];
        cs.ownedProjects = [];
        const deletedIds = typeof getDeletedProjectsList === 'function' ? getDeletedProjectsList() : [];
        cs.deletedProjectIds = Array.isArray(deletedIds) ? deletedIds.slice(-500) : [];
        saveCurrentUser(user);
        if (hadLegacyArrays) {
          try {
            lastInternalCloudUpdateAt = Date.now();
            await sb.auth.updateUser({ data: { cubikar_cloud_state_v2: cs } });
          } catch (_) {}
        }
      }

      if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    }
    return changed;
  } catch (err) {
    console.warn('[CloudSync] Error al reconciliar lápidas:', err);
    return false;
  }
}

/**
 * Sincronización automática de arranque:
 * 1. Reconcilia lápidas de proyectos eliminados en la nube.
 * 2. Restaura lo que haya en la nube desde public.proyectos + metadatos.
 * 3. Si localStorage contiene obras no respaldadas aún o metadata legado por limpiar, sincroniza.
 */
export async function autoSyncCollaborationOnStartup(user = null) {
  if (isCloudSyncInFlight || isRecentInternalCloudAuthUpdate(3000)) return;
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  // Paso 1: Reconciliar lápidas de proyectos eliminados en la nube
  try {
    await reconcileDeletedProjectsWithCloud();
  } catch (_) {}

  // Paso 2: Restaurar de la nube (public.proyectos + invitaciones)
  restoreUserCollaborationFromCloud(currentUser);

  // Paso 3: Verificar si localStorage local contiene obras no respaldadas o metadata legado por limpiar
  const myEmail = (currentUser.email || '').toLowerCase().trim();
  const allProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];
  const localOwned = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === myEmail);

  const allPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
  const myPlanInvs = allPlanInvs.filter(pi => (pi.email || '').toLowerCase().trim() === myEmail);

  const cloudState = currentUser.user_metadata?.cubikar_cloud_state_v2;
  const hasLegacyArrays = (Array.isArray(cloudState?.ownedProjects) && cloudState.ownedProjects.length > 0) ||
    (Array.isArray(cloudState?.collaboratedProjects) && cloudState.collaboratedProjects.length > 0);
  const hasUnsyncedLocal = localOwned.some(p => !p.isCloudSynced && !isProjectMarkedDeleted(p.id) && !isProjectMarkedDeleted(p.cloudId));
  const cloudPlanCount = Array.isArray(cloudState?.planInvitations) ? cloudState.planInvitations.length : 0;

  if (
    !cloudState ||
    hasLegacyArrays ||
    hasUnsyncedLocal ||
    myPlanInvs.length > cloudPlanCount
  ) {
    await syncUserCollaborationToCloud(currentUser);
  }
}

/**
 * Disparador con debounce para evitar saturar peticiones ante múltiples guardados rápidos
 */
export function triggerDebouncedCloudStateSync(user = null) {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    syncUserCollaborationToCloud(user);
  }, 400);
}

if (typeof window !== 'undefined') {
  window.syncUserCollaborationToCloud = syncUserCollaborationToCloud;
  window.restoreUserCollaborationFromCloud = restoreUserCollaborationFromCloud;
  window.autoSyncCollaborationOnStartup = autoSyncCollaborationOnStartup;
  window.triggerDebouncedCloudStateSync = triggerDebouncedCloudStateSync;
  window.recordDeletedProjectTombstone = recordDeletedProjectTombstone;
  window.recordHostActiveManifest = recordHostActiveManifest;
  window.syncHostWorkspaceProjects = syncHostWorkspaceProjects;
  window.reconcileDeletedProjectsWithCloud = reconcileDeletedProjectsWithCloud;
}
