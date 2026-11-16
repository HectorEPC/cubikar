// js/core/collaborationCloudService.js
// Sincronización integral en la nube (Supabase Auth user_metadata) para garantizar
// persistencia total de proyectos, anfitriones, invitaciones y membresías
// al iniciar sesión en cualquier computadora, navegador o dispositivo.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { syncProjectToCloud, fetchCloudProjects } from './cloudProjectService.js';
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
} from '../modules/portal/projectService.js?v=20261116_v24_sync_fix';
import { getSettingsKey, getStorageKey } from '../config/constants.js';
import { getChatStorageKey } from '../modules/chat/projectChat.js';

let syncDebounceTimer = null;
let isCloudSyncInFlight = false;
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
 * Sincroniza hacia la nube de Supabase (user_metadata) todo el ecosistema de trabajo:
 * 1. Proyectos propios creados por el usuario
 * 2. Proyectos donde participa como colaborador invitado
 * 3. Invitaciones al plan de anfitriones (aceptadas y pendientes)
 * 4. Invitaciones emitidas hacia colaboradores
 * 5. Invitaciones formales a proyectos
 * 6. Suscripción activa del usuario
 */
export async function syncUserCollaborationToCloud(user = null) {
  const sb = getSupabaseClient();
  if (!sb || !isSupabaseConfigured() || isCloudSyncInFlight) return false;

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

    // 1. Proyectos propios creados por el usuario (o bajo su propiedad)
    const myOwnedProjects = allProjects.filter(p => {
      const oEmail = (p.ownerEmail || '').toLowerCase().trim();
      return oEmail === myEmail;
    }).map(mapProjectForCloudSync);

    // 2. Proyectos en los que participa como colaborador de un anfitrión
    const myCollaboratedProjects = allProjects.filter(p => {
      const oEmail = (p.ownerEmail || '').toLowerCase().trim();
      if (oEmail === myEmail) return false;
      return Array.isArray(p.members) && p.members.some(m => 
        (m.email || '').toLowerCase().trim() === myEmail && m.status === 'active'
      );
    }).map(mapProjectForCloudSync);

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
      ownedProjects: myOwnedProjects,
      collaboratedProjects: myCollaboratedProjects,
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
      return true;
    }

    lastInternalCloudUpdateAt = Date.now();
    // Actualizar metadatos en Supabase Auth (persistencia nativa en auth.users)
    const { data, error } = await sb.auth.updateUser({
      data: {
        cubikar_cloud_state_v2: cloudPayload
      }
    });

    if (error) {
      console.warn('[CloudSync] Aviso al guardar estado en Supabase:', error.message);
      return false;
    }

    lastCloudSyncSignature = nextSignature;

    // Actualizar usuario en memoria local
    if (currentUser) {
      if (!currentUser.user_metadata) currentUser.user_metadata = {};
      currentUser.user_metadata.cubikar_cloud_state_v2 = cloudPayload;
      saveCurrentUser(currentUser);
    }

    // Persistir únicamente proyectos nuevos del propietario que aún no han sido sincronizados a PostgreSQL
    const rawProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === myEmail && !p.isCloudSynced && !isProjectMarkedDeleted(p.id) && !isProjectMarkedDeleted(p.cloudId));
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
        }
      } catch (e) {
        console.warn('[CloudSync] Aviso al sincronizar proyecto individual con PostgreSQL:', e);
      }
    }

    // Publicar manifiesto de proyectos activos del anfitrión en Supabase para sincronización inter-usuarios
    if (myEmail) {
      try {
        await recordHostActiveManifest(myEmail, myOwnedProjects.map(p => p.id));
      } catch (_) {}
    }

    console.info(`[CloudSync] Estado respaldado en la nube con éxito (${myOwnedProjects.length} propias, ${myCollaboratedProjects.length} colaboradas, ${myPlanInvs.length} anfitriones).`);
    return true;
  } catch (err) {
    console.warn('[CloudSync] Excepción al respaldar en la nube:', err);
    return false;
  } finally {
    isCloudSyncInFlight = false;
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

  // 1B. Restaurar lista de IDs de proyectos eliminados desde user_metadata antes de restaurar proyectos
  if (Array.isArray(state.deletedProjectIds) && state.deletedProjectIds.length > 0 && typeof markProjectDeleted === 'function') {
    state.deletedProjectIds.forEach(delId => {
      if (delId) markProjectDeleted(delId);
    });
  }

  // 2. Restaurar proyectos propios y colaborados en STORAGE_KEY_PROJECTS
  const deletedList = typeof getDeletedProjectsList === 'function' ? getDeletedProjectsList() : [];
  const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

  const cloudProjectsToRestore = [];
  if (Array.isArray(state.ownedProjects)) {
    cloudProjectsToRestore.push(...state.ownedProjects.filter(p => !isDeleted(p.id) && !isDeleted(p.cloudId)));
  }
  if (Array.isArray(state.collaboratedProjects)) {
    cloudProjectsToRestore.push(...state.collaboratedProjects.filter(p => !isDeleted(p.id) && !isDeleted(p.cloudId)));
  }

  if (cloudProjectsToRestore.length > 0) {
    const localProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];
    let projChanged = false;

    // Si el usuario tiene proyectos auténticos en la nube, remover las plantillas dummy iniciales
    const hasRealCloudProjects = cloudProjectsToRestore.some(p => p.id !== 'proj-default-01' && p.id !== 'proj-default-02');
    let filteredLocal = localProjects;
    if (hasRealCloudProjects) {
      filteredLocal = localProjects.filter(p => p.id !== 'proj-default-01' && p.id !== 'proj-default-02');
      if (filteredLocal.length !== localProjects.length) {
        projChanged = true;
      }
    }

    cloudProjectsToRestore.forEach(cp => {
      const idx = filteredLocal.findIndex(lp => lp.id === cp.id);
      if (idx === -1) {
        filteredLocal.unshift(cp);
        projChanged = true;
      } else {
        // Respetar la lista de miembros de cp (incluso si está vacía, no restaurar miembros viejos)
        if (Array.isArray(cp.members)) {
          filteredLocal[idx].members = cp.members;
          projChanged = true;
        }
        if (cp.ownerEmail && filteredLocal[idx].ownerEmail !== cp.ownerEmail) {
          filteredLocal[idx].ownerEmail = cp.ownerEmail;
          filteredLocal[idx].ownerName = cp.ownerName || filteredLocal[idx].ownerName;
          filteredLocal[idx].ownerPlanId = cp.ownerPlanId || filteredLocal[idx].ownerPlanId;
          projChanged = true;
        }
      }

      // Restaurar árbol de catálogo, configuración y mensajes de chat en localStorage si vinieron incluidos
      try {
        if (cp.settings && !localStorage.getItem(getSettingsKey(cp.id))) {
          localStorage.setItem(getSettingsKey(cp.id), JSON.stringify(cp.settings));
        }
        if (cp.treeData && !localStorage.getItem(getStorageKey(cp.id))) {
          localStorage.setItem(getStorageKey(cp.id), JSON.stringify(cp.treeData));
        }
        if (Array.isArray(cp.chatMessages) && cp.chatMessages.length > 0) {
          const chatKey = getChatStorageKey(cp.id);
          const rawChat = localStorage.getItem(chatKey);
          let curChat = rawChat ? JSON.parse(rawChat) : [];
          if (!Array.isArray(curChat)) curChat = [];
          const map = new Map();
          curChat.forEach(m => map.set(m.id, m));
          cp.chatMessages.forEach(m => map.set(m.id, m));
          localStorage.setItem(chatKey, JSON.stringify(Array.from(map.values())));
        }
      } catch (_) {}
    });

    if (projChanged && typeof saveProjectsList === 'function') {
      saveProjectsList(filteredLocal);
      hasChanges = true;
    }
  }

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
      activeCloud.forEach(cp => {
        if (isDeleted(cp.id) || isDeleted(cp.cloudId)) return;
        const idx = curList.findIndex(lp => lp.id === cp.id || lp.cloudId === cp.id);
        if (idx === -1) {
          curList.unshift(cp);
          updated = true;
        } else {
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
export async function recordDeletedProjectTombstone(projectId, ownerEmail = null) {
  if (!projectId) return false;
  const sb = getSupabaseClient();
  if (!sb || typeof sb.from !== 'function') return false;

  const user = getCurrentUser();
  const oEmail = (ownerEmail || user?.email || '').toLowerCase().trim();
  const rowId = `__tombstone__${projectId}`;

  try {
    await sb.from('chat_mensajes').upsert({
      id: rowId,
      proyecto_id: '__cubikar_tombstones__',
      autor_nombre: user?.name || 'Sistema',
      autor_email: user?.email || oEmail,
      mensaje: projectId,
      payload_json: {
        projectId,
        ownerEmail: oEmail,
        deletedAt: new Date().toISOString()
      },
      created_at: new Date().toISOString()
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
    const { data: tombstones, error: tErr } = await sb
      .from('chat_mensajes')
      .select('mensaje, payload_json')
      .eq('proyecto_id', '__cubikar_tombstones__')
      .limit(500);

    let changed = false;
    if (!tErr && Array.isArray(tombstones) && tombstones.length > 0) {
      tombstones.forEach(t => {
        const pid = t.payload_json?.projectId || t.mensaje;
        if (pid) {
          if (!isProjectMarkedDeleted(pid)) {
            markProjectDeleted(pid);
            changed = true;
          }
        }
      });
    }

    if (changed) {
      const current = getProjectsList();
      saveProjectsList(current);

      const user = getCurrentUser();
      if (user && user.user_metadata?.cubikar_cloud_state_v2) {
        const cs = user.user_metadata.cubikar_cloud_state_v2;
        const isDel = (id) => isProjectMarkedDeleted(id);
        if (Array.isArray(cs.collaboratedProjects)) {
          cs.collaboratedProjects = cs.collaboratedProjects.filter(p => !isDel(p.id) && !isDel(p.cloudId));
        }
        if (Array.isArray(cs.ownedProjects)) {
          cs.ownedProjects = cs.ownedProjects.filter(p => !isDel(p.id) && !isDel(p.cloudId));
        }
        saveCurrentUser(user);
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
 * 1. Restaura lo que haya en la nube a localStorage.
 * 2. Si localStorage contiene datos nuevos o más completos, los respalda a la nube.
 * 3. Reconcilia lápidas de proyectos eliminados.
 */
export async function autoSyncCollaborationOnStartup(user = null) {
  if (isCloudSyncInFlight || isRecentInternalCloudAuthUpdate(3000)) return;
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  // Paso 1: Reconciliar lápidas de proyectos eliminados en la nube
  try {
    await reconcileDeletedProjectsWithCloud();
  } catch (_) {}

  // Paso 2: Restaurar de la nube si existen datos en user_metadata
  const didRestore = restoreUserCollaborationFromCloud(currentUser);

  // Paso 3: Verificar si localStorage local contiene obras o invitaciones no respaldadas aún
  const myEmail = (currentUser.email || '').toLowerCase().trim();
  const allProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];
  const localOwned = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === myEmail);
  const localCollab = allProjects.filter(p => {
    const oEmail = (p.ownerEmail || '').toLowerCase().trim();
    return oEmail !== myEmail && Array.isArray(p.members) && p.members.some(m => (m.email || '').toLowerCase().trim() === myEmail && m.status === 'active');
  });

  const allPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
  const myPlanInvs = allPlanInvs.filter(pi => (pi.email || '').toLowerCase().trim() === myEmail);

  const cloudState = currentUser.user_metadata?.cubikar_cloud_state_v2;
  const cloudOwnedCount = Array.isArray(cloudState?.ownedProjects) ? cloudState.ownedProjects.length : 0;
  const cloudCollabCount = Array.isArray(cloudState?.collaboratedProjects) ? cloudState.collaboratedProjects.length : 0;
  const cloudPlanCount = Array.isArray(cloudState?.planInvitations) ? cloudState.planInvitations.length : 0;

  // Si local tiene items y la nube no los tiene, subirlos
  if (
    !cloudState ||
    localOwned.length > cloudOwnedCount ||
    localCollab.length > cloudCollabCount ||
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
