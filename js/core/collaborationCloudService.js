// js/core/collaborationCloudService.js
// Sincronización integral en la nube (Supabase Auth user_metadata) para garantizar
// persistencia total de proyectos, anfitriones, invitaciones y membresías
// al iniciar sesión en cualquier computadora, navegador o dispositivo.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261116_cf17';
import { syncProjectToCloud, fetchCloudProjects, invalidateCloudProjectsCache } from './cloudProjectService.js?v=20261116_cf17';
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
} from '../modules/portal/projectService.js?v=20261116_cf17';
import { getSettingsKey, getStorageKey } from '../config/constants.js?v=20261116_cf17';
import { getChatStorageKey } from '../modules/chat/projectChat.js?v=20261116_cf17';

let syncDebounceTimer = null;
let isCloudSyncInFlight = false;
let pendingCloudSync = false;
let pendingCloudSyncUser = null;
let lastCloudSyncSignature = '';
let lastManifestSignature = '';
let lastCloudUpdateAt = 0;
let lastInternalCloudUpdateAt = 0;
let consecutiveCloudUpdateFailures = 0;
let nextCloudUpdateAllowedAt = 0;
let startupSyncInFlightPromise = null;
let startupSyncUserId = '';
let lastStartupSyncAt = 0;
let lastStartupSyncUserId = '';
let inFlightReconcilePromise = null;
let lastReconcileAt = 0;
let nextReconcileAllowedAt = 0;
const inFlightHostSyncByEmail = new Map();
const lastHostSyncAtByEmail = new Map();

const MIN_CLOUD_UPDATE_INTERVAL_MS = 12000;
const BASE_FAILURE_BACKOFF_MS = 5000;
const MAX_FAILURE_BACKOFF_MS = 120000;
const MAX_METADATA_DELETED_IDS = 15;

function slimCloudInvitationEntry(inv) {
  if (!inv || typeof inv !== 'object') return inv;
  const out = { ...inv };
  delete out.avatar;
  delete out.companyLogo;
  delete out.allowedTabs;
  return out;
}

function compactCloudStatePayload(rawPayload) {
  const payload = { ...rawPayload };
  if (payload.subscription && typeof payload.subscription === 'object') {
    const cleanSub = { ...payload.subscription };
    delete cleanSub.companyLogo;
    delete cleanSub.logo;
    payload.subscription = cleanSub;
  }
  if (Array.isArray(payload.planInvitations)) {
    payload.planInvitations = payload.planInvitations.slice(-12).map(slimCloudInvitationEntry);
  }
  if (Array.isArray(payload.acceptedInvitations)) {
    payload.acceptedInvitations = payload.acceptedInvitations.slice(-12).map(slimCloudInvitationEntry);
  }
  if (Array.isArray(payload.sentPlanInvitations)) {
    payload.sentPlanInvitations = payload.sentPlanInvitations.slice(-12).map(slimCloudInvitationEntry);
  }
  if (Array.isArray(payload.sentProjectInvitations)) {
    payload.sentProjectInvitations = payload.sentProjectInvitations.slice(-12).map(slimCloudInvitationEntry);
  }
  if (Array.isArray(payload.deletedProjectIds) && payload.deletedProjectIds.length > MAX_METADATA_DELETED_IDS) {
    payload.deletedProjectIds = payload.deletedProjectIds.slice(-MAX_METADATA_DELETED_IDS);
  }
  if (JSON.stringify(payload).length > 1800) {
    payload.deletedProjectIds = Array.isArray(payload.deletedProjectIds) ? payload.deletedProjectIds.slice(-10) : [];
    payload.sentPlanInvitations = Array.isArray(payload.sentPlanInvitations) ? payload.sentPlanInvitations.slice(-4) : [];
    payload.sentProjectInvitations = Array.isArray(payload.sentProjectInvitations) ? payload.sentProjectInvitations.slice(-4) : [];
  }
  if (JSON.stringify(payload).length > 1800) {
    payload.sentPlanInvitations = [];
    payload.sentProjectInvitations = [];
    payload.planInvitations = Array.isArray(payload.planInvitations) ? payload.planInvitations.slice(-8) : [];
    payload.acceptedInvitations = Array.isArray(payload.acceptedInvitations) ? payload.acceptedInvitations.slice(-5) : [];
  }
  return payload;
}

async function fetchMyCloudCollaborationWorkspaces(sb, myEmail) {
  if (!sb || !myEmail || !isSupabaseConfigured()) return { ok: false, rows: [] };
  if (typeof window !== 'undefined' && window.__cubikarOversizedJwtBlocked) {
    return { ok: false, rows: [] };
  }
  try {
    if (typeof sb.rpc === 'function') {
      const { data: rpcRows, error: rpcErr } = await sb.rpc('get_my_collaboration_workspaces');
      if (!rpcErr && Array.isArray(rpcRows)) {
        return { ok: true, rows: rpcRows, fromRpc: true };
      }
    }
    const { data: pcRows, error: pcErr } = await sb
      .from('proyecto_colaboradores')
      .select('proyecto_id, email_colaborador, nombre_colaborador, rol, estado_invitacion, updated_at')
      .ilike('email_colaborador', myEmail);
    if (!pcErr && Array.isArray(pcRows)) {
      return { ok: true, rows: pcRows, fromRpc: false };
    }
  } catch (_) {}
  return { ok: false, rows: [] };
}

let inFlightCloudRestorePromise = null;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    consecutiveCloudUpdateFailures = 0;
    nextCloudUpdateAllowedAt = 0;
  });
}

function canonicalizeForSignature(val) {
  if (Array.isArray(val)) return val.map(canonicalizeForSignature);
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) {
      if (val[k] !== undefined) out[k] = canonicalizeForSignature(val[k]);
    }
    return out;
  }
  return val;
}

function computeCloudStateSignature(cloudState) {
  if (!cloudState || typeof cloudState !== 'object') return '';
  try {
    const { updatedAt: _ignored, ...rest } = cloudState;
    return JSON.stringify(canonicalizeForSignature(rest));
  } catch (_) {
    return '';
  }
}

export function markInternalCloudAuthUpdate() {
  lastInternalCloudUpdateAt = Date.now();
}

export function isRecentInternalCloudAuthUpdate(windowMs = 12000) {
  return lastInternalCloudUpdateAt > 0 && (Date.now() - lastInternalCloudUpdateAt) < windowMs;
}

/**
 * Sincroniza hacia la nube de Supabase (user_metadata para perfil/suscripción/invitaciones/lápidas
 * y public.proyectos como única fuente de verdad para los proyectos).
 */
export async function syncUserCollaborationToCloud(user = null, opts = {}) {
  const sb = getSupabaseClient();
  if (!sb || !isSupabaseConfigured()) return false;

  const now = Date.now();
  const force = Boolean(opts?.force);
  if (!force && nextCloudUpdateAllowedAt > now) {
    return false;
  }

  if (isCloudSyncInFlight) {
    if (!nextCloudUpdateAllowedAt || nextCloudUpdateAllowedAt <= now) {
      pendingCloudSync = true;
      pendingCloudSyncUser = user || getCurrentUser();
    }
    return false;
  }

  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;
  const myEmail = (currentUser.email || '').toLowerCase().trim();

  isCloudSyncInFlight = true;
  let syncFailed = false;
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
    const cloudPayload = compactCloudStatePayload({
      version: 2,
      subscription: currentSub,
      ownedProjects: [],
      collaboratedProjects: [],
      planInvitations: myPlanInvs,
      acceptedInvitations: myAcceptedInvs,
      sentPlanInvitations: mySentPlanInvs,
      sentProjectInvitations: mySentProjectInvs,
      deletedProjectIds: Array.isArray(deletedList) ? deletedList.slice(-MAX_METADATA_DELETED_IDS) : [],
      updatedAt: new Date().toISOString()
    });

    const nextSignature = computeCloudStateSignature(cloudPayload);
    const remoteState = sessionUser?.user_metadata?.cubikar_cloud_state_v2 || currentUser?.user_metadata?.cubikar_cloud_state_v2;
    const remoteSignature = computeCloudStateSignature(remoteState);
    const hasLegacyV1Remote = Boolean(sessionUser?.user_metadata?.cubikar_collaboration_v1 || currentUser?.user_metadata?.cubikar_collaboration_v1);

    let didWriteAny = false;
    if (!hasLegacyV1Remote && nextSignature && (nextSignature === lastCloudSyncSignature || nextSignature === remoteSignature)) {
      lastCloudSyncSignature = nextSignature;
      if (currentUser && remoteState) {
        if (!currentUser.user_metadata) currentUser.user_metadata = {};
        if (!currentUser.user_metadata.cubikar_cloud_state_v2) {
          currentUser.user_metadata.cubikar_cloud_state_v2 = remoteState;
          saveCurrentUser(currentUser);
        }
      }
    } else if (!force && lastCloudUpdateAt > 0 && (Date.now() - lastCloudUpdateAt) < MIN_CLOUD_UPDATE_INTERVAL_MS) {
      // Enfriamiento mínimo entre escrituras a Supabase Auth para evitar saturación de red
      return false;
    } else {
      markInternalCloudAuthUpdate();
      const { error } = await sb.auth.updateUser({
        data: {
          cubikar_collaboration_v1: null,
          cubikar_cloud_state_v2: cloudPayload
        }
      });
      markInternalCloudAuthUpdate();
      if (currentUser?.user_metadata && 'cubikar_collaboration_v1' in currentUser.user_metadata) {
        delete currentUser.user_metadata.cubikar_collaboration_v1;
      }

      if (error) {
        syncFailed = true;
        consecutiveCloudUpdateFailures++;
        const backoffMs = Math.min(MAX_FAILURE_BACKOFF_MS, BASE_FAILURE_BACKOFF_MS * Math.pow(2, consecutiveCloudUpdateFailures - 1));
        nextCloudUpdateAllowedAt = Date.now() + backoffMs;
        if (consecutiveCloudUpdateFailures <= 3) {
          console.warn(`[CloudSync] Aviso al guardar estado en Supabase (reintento en ${Math.round(backoffMs / 1000)}s):`, error.message);
        }
        return false;
      }

      didWriteAny = true;
      consecutiveCloudUpdateFailures = 0;
      nextCloudUpdateAllowedAt = 0;
      lastCloudUpdateAt = Date.now();
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
          didWriteAny = true;
        }
      } catch (e) {
        console.warn('[CloudSync] Aviso al sincronizar proyecto individual con PostgreSQL:', e);
      }
    }
    if (localProjectsUpdated && typeof saveProjectsList === 'function') {
      saveProjectsList(allProjects, { skipCloudSync: true });
    }

    // Publicar manifiesto de proyectos activos del anfitrión en Supabase para sincronización inter-usuarios (solo si cambió)
    if (myEmail) {
      try {
        const manifestUpdated = await recordHostActiveManifest(myEmail, myOwnedActiveProjects.map(p => p.cloudId || p.id));
        if (manifestUpdated) didWriteAny = true;
      } catch (_) {}
    }

    if (didWriteAny) {
      console.info(`[CloudSync] Estado respaldado en la nube con éxito (${myOwnedActiveProjects.length} propias activas, ${myPlanInvs.length} anfitriones).`);
    }
    return true;
  } catch (err) {
    syncFailed = true;
    consecutiveCloudUpdateFailures++;
    const backoffMs = Math.min(MAX_FAILURE_BACKOFF_MS, BASE_FAILURE_BACKOFF_MS * Math.pow(2, consecutiveCloudUpdateFailures - 1));
    nextCloudUpdateAllowedAt = Date.now() + backoffMs;
    if (consecutiveCloudUpdateFailures <= 3) {
      console.warn('[CloudSync] Excepción al respaldar en la nube:', err);
    }
    return false;
  } finally {
    isCloudSyncInFlight = false;
    if (pendingCloudSync) {
      const nextUser = pendingCloudSyncUser || getCurrentUser();
      pendingCloudSync = false;
      pendingCloudSyncUser = null;
      if (!syncFailed && nextCloudUpdateAllowedAt <= Date.now()) {
        setTimeout(() => { syncUserCollaborationToCloud(nextUser); }, 1500);
      }
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

  // Buscar payload v2 o v1 en user_metadata (respaldo opcional; Postgres es siempre obligatorio)
  const rawState = currentUser.user_metadata?.cubikar_cloud_state_v2 || currentUser.user_metadata?.cubikar_collaboration_v1;
  try {
    if (typeof window !== 'undefined' && typeof window.hydrateNotificationStateFromCloud === 'function') {
      window.hydrateNotificationStateFromCloud(currentUser);
    }
  } catch (_) {}
  const state = (rawState && typeof rawState === 'object') ? rawState : {};

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
      saveProjectsList(surviving, { skipCloudSync: true });
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
      saveStoredPlanInvitations(localPlanInvs, { skipCloudSync: true });
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
      saveStoredInvitations(localInvs, { skipCloudSync: true });
      hasChanges = true;
    }
  }

  // Consultar proyectos y espacios de colaboración en Supabase PostgreSQL
  if (isSupabaseConfigured()) {
    const sb = getSupabaseClient();
    inFlightCloudRestorePromise = (async () => {
      try {
        let [cloudList, wsResult] = await Promise.all([
          fetchCloudProjects(),
          fetchMyCloudCollaborationWorkspaces(sb, myEmail)
        ]);

        if (wsResult?.ok && Array.isArray(wsResult.rows) && wsResult.rows.length > 0) {
          const localPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
          const localInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
          let planChanged = false;
          let invsChanged = false;
          let promotedAny = false;

          for (const row of wsResult.rows) {
            const projId = row?.proyecto_id;
            if (!projId || isDeleted(projId)) continue;
            const hostEm = (row?.owner_email || '').toLowerCase().trim();
            if (hostEm === myEmail) continue;
            const st = (row?.estado_invitacion || '').toLowerCase().trim();
            const role = row?.rol || 'editar';
            if (st === 'rejected') continue;

            const existingAcceptedPlan = hostEm
              ? localPlanInvs.find(pi =>
                  (pi.ownerEmail || '').toLowerCase().trim() === hostEm &&
                  (pi.email || '').toLowerCase().trim() === myEmail &&
                  (pi.status === 'accepted' || pi.status === 'active')
                )
              : null;

            if (st === 'pending' && existingAcceptedPlan && typeof window !== 'undefined' && typeof window.addCollaboratorToCloud === 'function') {
              try {
                const promoRes = await window.addCollaboratorToCloud(projId, myEmail, role, 'accepted');
                if (promoRes?.success) promotedAny = true;
              } catch (_) {}
            } else if (st === 'accepted' || st === 'active') {
              if (hostEm) {
                const pIdx = localPlanInvs.findIndex(pi =>
                  (pi.ownerEmail || '').toLowerCase().trim() === hostEm &&
                  (pi.email || '').toLowerCase().trim() === myEmail
                );
                if (pIdx === -1) {
                  localPlanInvs.unshift({
                    id: `plan-inv-cloud-${hostEm}`,
                    ownerEmail: hostEm,
                    ownerName: resolveCleanHostName(hostEm, row?.owner_name, null, myEmail),
                    ownerPlanId: 'pro',
                    email: myEmail,
                    name: currentUser.name || myEmail.split('@')[0],
                    role,
                    status: 'accepted',
                    acceptedAt: row?.updated_at || new Date().toISOString()
                  });
                  planChanged = true;
                } else if (localPlanInvs[pIdx].status !== 'accepted') {
                  localPlanInvs[pIdx].status = 'accepted';
                  localPlanInvs[pIdx].acceptedAt = localPlanInvs[pIdx].acceptedAt || row?.updated_at || new Date().toISOString();
                  if (row?.owner_name && !localPlanInvs[pIdx].ownerName) localPlanInvs[pIdx].ownerName = row.owner_name;
                  planChanged = true;
                }
              }
              const iIdx = localInvs.findIndex(li =>
                li.projectId === projId && (li.email || '').toLowerCase().trim() === myEmail
              );
              if (iIdx >= 0 && localInvs[iIdx].status !== 'accepted') {
                localInvs[iIdx].status = 'accepted';
                localInvs[iIdx].acceptedAt = localInvs[iIdx].acceptedAt || row?.updated_at || new Date().toISOString();
                invsChanged = true;
              }
            } else if (st === 'pending' && hostEm) {
              const iIdx = localInvs.findIndex(li =>
                li.projectId === projId && (li.email || '').toLowerCase().trim() === myEmail
              );
              if (iIdx === -1) {
                localInvs.unshift({
                  id: `inv-cloud-${projId}-${myEmail}`,
                  projectId: projId,
                  projectName: row?.nombre || 'Proyecto de Obra',
                  companyName: row?.company_name || '',
                  ownerEmail: hostEm,
                  ownerName: resolveCleanHostName(hostEm, row?.owner_name, null, myEmail),
                  email: myEmail,
                  name: currentUser.name || myEmail.split('@')[0],
                  role,
                  status: 'pending',
                  createdAt: row?.updated_at || new Date().toISOString()
                });
                invsChanged = true;
              }
            }
          }

          if (planChanged && typeof saveStoredPlanInvitations === 'function') {
            saveStoredPlanInvitations(localPlanInvs, { skipCloudSync: true });
          }
          if (invsChanged && typeof saveStoredInvitations === 'function') {
            saveStoredInvitations(localInvs, { skipCloudSync: true });
          }
          if (promotedAny) {
            try { invalidateCloudProjectsCache(); } catch (_) {}
            cloudList = await fetchCloudProjects({ force: true });
          }
          if ((planChanged || invsChanged) && typeof window !== 'undefined') {
            if (typeof window.renderSidebarNotificationsUI === 'function') window.renderSidebarNotificationsUI();
            if (typeof window.refreshProjectsGridUI === 'function') window.refreshProjectsGridUI();
          }
        }

        if (!Array.isArray(cloudList)) return;
        const activeCloud = cloudList;
        const curList = typeof getProjectsList === 'function' ? getProjectsList() : [];
        let updated = false;

        // Reconciliar planInvitations aceptadas desde los proyectos devueltos por PostgreSQL (respaldo Multi-PC)
        try {
          const curPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
          let addedHostFromProjects = false;
          activeCloud.forEach(cp => {
            if (!cp || isDeleted(cp.id) || isDeleted(cp.cloudId)) return;
            const cpOwner = (cp.ownerEmail || '').toLowerCase().trim();
            if (!cpOwner || cpOwner === myEmail) return;
            const myMem = Array.isArray(cp.members) && cp.members.find(m =>
              (m?.email || '').toLowerCase().trim() === myEmail &&
              (m.status === 'accepted' || m.status === 'active' || !m.status)
            );
            if (!myMem) return;
            const idx = curPlanInvs.findIndex(pi =>
              (pi.ownerEmail || '').toLowerCase().trim() === cpOwner &&
              (pi.email || '').toLowerCase().trim() === myEmail
            );
            if (idx === -1) {
              curPlanInvs.unshift({
                id: `plan-inv-cloud-${cpOwner}`,
                ownerEmail: cpOwner,
                ownerName: resolveCleanHostName(cpOwner, cp.ownerName, cp, myEmail),
                ownerPlanId: cp.ownerPlanId || 'pro',
                email: myEmail,
                name: currentUser.name || myEmail.split('@')[0],
                role: myMem.role || 'editar',
                status: 'accepted',
                acceptedAt: cp.updatedAt || new Date().toISOString()
              });
              addedHostFromProjects = true;
            } else if (curPlanInvs[idx].status !== 'accepted') {
              curPlanInvs[idx].status = 'accepted';
              addedHostFromProjects = true;
            }
          });
          if (addedHostFromProjects && typeof saveStoredPlanInvitations === 'function') {
            saveStoredPlanInvitations(curPlanInvs, { skipCloudSync: true });
          }
        } catch (_) {}

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
            const prevJson = JSON.stringify(curList[idx]);
            const localMems = Array.isArray(curList[idx].members) ? curList[idx].members : [];
            const mergedMembers = Array.isArray(cp.members)
              ? cp.members.map(cm => {
                  const cmEmail = (cm?.email || '').toLowerCase().trim();
                  const lm = localMems.find(m => (m?.email || '').toLowerCase().trim() === cmEmail);
                  if (lm && (lm.status === 'active' || lm.status === 'accepted') && cm.status === 'pending') {
                    return { ...cm, status: lm.status };
                  }
                  return cm;
                })
              : localMems;
            const merged = {
              ...curList[idx],
              ...cp,
              id: curList[idx].id || cp.id,
              cloudId: cp.id,
              members: mergedMembers,
              isCloudSynced: true
            };
            if (JSON.stringify(merged) !== prevJson) {
              curList[idx] = merged;
              updated = true;
            }
          }
        });

        // 2. RECONCILIACIÓN DE PROYECTOS COLABORADOS:
        const activeCloudIds = new Set(activeCloud.map(cp => cp.id));
        const activePId = typeof window !== 'undefined' && window.location?.search ? new URLSearchParams(window.location.search).get('project') : null;
        let prunedCollab = 0;
        const cleanList = curList.filter(p => {
          const pOwner = (p.ownerEmail || '').toLowerCase().trim();
          if (!pOwner || pOwner === myEmail || p.isSample || (typeof p.id === 'string' && (p.id.startsWith('proj-default') || p.id.startsWith('proj-demo')))) {
            return true;
          }
          if (activePId && (p.id === activePId || p.cloudId === activePId)) {
            return true;
          }
          if (isProjectMarkedDeleted(p.id) || (p.cloudId && isProjectMarkedDeleted(p.cloudId))) {
            prunedCollab++;
            return false;
          }
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
          saveProjectsList(cleanList, { skipCloudSync: true });
          if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
            window.refreshProjectsGridUI();
          }
        }
      } catch (err) {
        console.warn('[CloudSync] Aviso al reconciliar proyectos con Supabase:', err);
      } finally {
        inFlightCloudRestorePromise = null;
      }
    })();
  }

  if (hasChanges) {
    console.info('[CloudSync] Estado restaurado desde la nube en este navegador con éxito.');
  }
  return hasChanges;
}

async function upsertChatAuxRowSafe(sb, row) {
  let payload = { ...row };
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await sb.from('chat_mensajes').upsert(payload, { onConflict: 'id' });
    if (!res?.error) return true;
    const msg = String(res.error?.message || '');
    const missingMatch = msg.match(/Could not find the '([^']+)' column/i);
    if (missingMatch && missingMatch[1] && Object.prototype.hasOwnProperty.call(payload, missingMatch[1])) {
      delete payload[missingMatch[1]];
      continue;
    }
    if (/payload_json/i.test(msg) && Object.prototype.hasOwnProperty.call(payload, 'payload_json')) {
      delete payload.payload_json;
      continue;
    }
    return false;
  }
  return false;
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

    await upsertChatAuxRowSafe(sb, {
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
    });
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
export async function recordHostActiveManifest(ownerEmail, activeProjectIds = [], opts = {}) {
  if (!ownerEmail) return false;
  const sb = getSupabaseClient();
  if (!sb || typeof sb.from !== 'function') return false;

  const oEmail = ownerEmail.toLowerCase().trim();
  const rowId = `__manifest__${oEmail}`;
  const ids = Array.isArray(activeProjectIds) ? activeProjectIds : [];
  const manifestSig = `${oEmail}|${[...ids].sort().join(',')}`;
  if (!opts?.force && manifestSig === lastManifestSignature) {
    return false;
  }

  try {
    const ok = await upsertChatAuxRowSafe(sb, {
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
    });
    if (ok) lastManifestSignature = manifestSig;
    return ok;
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
  if (inFlightHostSyncByEmail.has(targetHost)) {
    return inFlightHostSyncByEmail.get(targetHost);
  }
  const prevAt = lastHostSyncAtByEmail.get(targetHost) || 0;
  if (prevAt > 0 && (Date.now() - prevAt) < 6000) {
    return false;
  }

  const reqPromise = (async () => {
    lastHostSyncAtByEmail.set(targetHost, Date.now());
    const user = getCurrentUser();
    const myEmail = (user?.email || '').toLowerCase().trim();

    try {
    // Consultar proyectos desde el servicio unificado con caché + deduplicación single-flight
    const allCloud = await fetchCloudProjects();
    if (!Array.isArray(allCloud)) {
      return false;
    }

    const mappedHostProjects = allCloud.filter(cp =>
      cp &&
      (cp.ownerEmail || '').toLowerCase().trim() === targetHost &&
      !isProjectMarkedDeleted(cp.id) &&
      !(cp.cloudId && isProjectMarkedDeleted(cp.cloudId))
    );
    const activeIdsSet = new Set(mappedHostProjects.map(p => p.id));

    // Si la consulta directa a proyectos devolvió vacío, consultar también el manifiesto del anfitrión
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

    const currentList = getProjectsList();
    let changedCount = 0;

    // 1. Inyectar o actualizar proyectos vigentes del anfitrión desde la nube (soporte Multi-PC)
    mappedHostProjects.forEach(cloudProj => {
      const idx = currentList.findIndex(p => p.id === cloudProj.id || p.cloudId === cloudProj.id);
      if (idx === -1) {
        currentList.unshift(cloudProj);
        changedCount++;
      } else {
        const prevJson = JSON.stringify(currentList[idx]);
        const localMems = Array.isArray(currentList[idx].members) ? currentList[idx].members : [];
        const mergedMembers = Array.isArray(cloudProj.members)
          ? cloudProj.members.map(cm => {
              const cmEmail = (cm?.email || '').toLowerCase().trim();
              const lm = localMems.find(m => (m?.email || '').toLowerCase().trim() === cmEmail);
              if (lm && (lm.status === 'active' || lm.status === 'accepted') && cm.status === 'pending') {
                return { ...cm, status: lm.status };
              }
              return cm;
            })
          : localMems;
        const merged = {
          ...currentList[idx],
          ...cloudProj,
          id: currentList[idx].id || cloudProj.id,
          cloudId: cloudProj.id,
          members: mergedMembers,
          isCloudSynced: true
        };
        if (JSON.stringify(merged) !== prevJson) {
          currentList[idx] = merged;
          changedCount++;
        }
      }
    });

    // Asegurar entrada en planInvitations si el anfitrión tiene proyectos activos compartidos
    if (mappedHostProjects.length > 0 && myEmail && myEmail !== targetHost && typeof getStoredPlanInvitations === 'function' && typeof saveStoredPlanInvitations === 'function') {
      try {
        const planInvs = getStoredPlanInvitations();
        const pIdx = planInvs.findIndex(pi => (pi?.ownerEmail || '').toLowerCase().trim() === targetHost && (pi?.email || '').toLowerCase().trim() === myEmail);
        if (pIdx === -1) {
          const sampleHost = mappedHostProjects[0];
          const myMem = Array.isArray(sampleHost.members) && sampleHost.members.find(m => (m?.email || '').toLowerCase().trim() === myEmail);
          planInvs.unshift({
            id: `plan-inv-cloud-${targetHost}`,
            ownerEmail: targetHost,
            ownerName: resolveCleanHostName(targetHost, sampleHost.ownerName, sampleHost, myEmail),
            ownerPlanId: sampleHost.ownerPlanId || 'pro',
            email: myEmail,
            name: user?.name || myEmail.split('@')[0],
            role: myMem?.role || 'editar',
            status: 'accepted',
            acceptedAt: sampleHost.updatedAt || new Date().toISOString()
          });
          saveStoredPlanInvitations(planInvs, { skipCloudSync: true });
          changedCount++;
        }
      } catch (_) {}
    }

    let prunedCount = 0;
    const activePId = typeof window !== 'undefined' && window.location?.search ? new URLSearchParams(window.location.search).get('project') : null;

    const updatedList = currentList.filter(p => {
      const pOwner = (p.ownerEmail || '').toLowerCase().trim();
      if (pOwner === targetHost) {
        if (activePId && (p.id === activePId || p.cloudId === activePId)) {
          return true;
        }
        if (isProjectMarkedDeleted(p.id) || (p.cloudId && isProjectMarkedDeleted(p.cloudId))) {
          prunedCount++;
          return false;
        }
        if (activeIdsSet.size > 0 && !activeIdsSet.has(p.id) && !activeIdsSet.has(p.cloudId)) {
          const hasLocalMem = Array.isArray(p.members) && p.members.some(m => (m.email || '').toLowerCase().trim() === myEmail && (m.status === 'active' || m.status === 'accepted' || m.status === 'pending'));
          if (!hasLocalMem) {
            prunedCount++;
            return false;
          }
        }
        const cloudP = mappedHostProjects.find(cp => cp.id === p.id || cp.id === p.cloudId);
        if (cloudP && Array.isArray(cloudP.members)) {
          const myMem = cloudP.members.find(m => (m.email || '').toLowerCase().trim() === myEmail);
          if (myMem && myMem.status === 'rejected') {
            prunedCount++;
            return false;
          }
        }
      }
      return true;
    });

    if (changedCount > 0 || prunedCount > 0) {
      saveProjectsList(updatedList, { skipCloudSync: true });
      if (prunedCount > 0) {
        console.info(`[HostWorkspaceSync] Se purgaron ${prunedCount} proyectos inexistentes o sin permiso del anfitrión ${targetHost}.`);
      }
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
  })();
  inFlightHostSyncByEmail.set(targetHost, reqPromise);
  try {
    return await reqPromise;
  } finally {
    inFlightHostSyncByEmail.delete(targetHost);
  }
}

/**
 * Reconciliar lápidas globales de proyectos eliminados en la nube
 */
export async function reconcileDeletedProjectsWithCloud(opts = {}) {
  const sb = getSupabaseClient();
  if (!sb || typeof sb.from !== 'function') return false;

  const force = Boolean(opts?.force);
  if (inFlightReconcilePromise) {
    return inFlightReconcilePromise;
  }
  const now = Date.now();
  if (!force && ((nextReconcileAllowedAt > now) || (lastReconcileAt > 0 && (now - lastReconcileAt) < 15000))) {
    return false;
  }

  inFlightReconcilePromise = (async () => {
  try {
    lastReconcileAt = Date.now();
    const [{ data: cloudDeletedRows, error: cdErr }, { data: tombstones, error: tErr }] = await Promise.all([
      sb.from('proyectos_eliminados').select('proyecto_id, owner_email, deleted_by_email, deleted_at').limit(500),
      sb.from('chat_mensajes').select('mensaje, payload_json').eq('proyecto_id', '__cubikar_tombstones__').limit(500)
    ]);

    if (cdErr && tErr) {
      nextReconcileAllowedAt = Date.now() + 8000;
      return false;
    }

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
      saveProjectsList(current, { skipCloudSync: true });

      const user = getCurrentUser();
      if (user && (user.user_metadata?.cubikar_cloud_state_v2 || user.user_metadata?.cubikar_collaboration_v1)) {
        const hadLegacyV1 = Boolean(user.user_metadata?.cubikar_collaboration_v1);
        const cs = compactCloudStatePayload(user.user_metadata.cubikar_cloud_state_v2 || { version: 2 });
        const hadLegacyArrays = (Array.isArray(user.user_metadata?.cubikar_cloud_state_v2?.collaboratedProjects) && user.user_metadata.cubikar_cloud_state_v2.collaboratedProjects.length > 0) ||
          (Array.isArray(user.user_metadata?.cubikar_cloud_state_v2?.ownedProjects) && user.user_metadata.cubikar_cloud_state_v2.ownedProjects.length > 0);
        const hadBloatedDelIds = Array.isArray(user.user_metadata?.cubikar_cloud_state_v2?.deletedProjectIds) && user.user_metadata.cubikar_cloud_state_v2.deletedProjectIds.length > MAX_METADATA_DELETED_IDS;
        cs.collaboratedProjects = [];
        cs.ownedProjects = [];
        const deletedIds = typeof getDeletedProjectsList === 'function' ? getDeletedProjectsList() : [];
        cs.deletedProjectIds = Array.isArray(deletedIds) ? deletedIds.slice(-MAX_METADATA_DELETED_IDS) : [];
        if (user.user_metadata) {
          delete user.user_metadata.cubikar_collaboration_v1;
          user.user_metadata.cubikar_cloud_state_v2 = cs;
        }
        saveCurrentUser(user);
        if (hadLegacyV1 || hadLegacyArrays || hadBloatedDelIds) {
          try {
            markInternalCloudAuthUpdate();
            await sb.auth.updateUser({ data: { cubikar_collaboration_v1: null, cubikar_cloud_state_v2: cs } });
            markInternalCloudAuthUpdate();
          } catch (_) {}
        }
      }

      if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    }
    return changed;
  } catch (err) {
    nextReconcileAllowedAt = Date.now() + 8000;
    console.warn('[CloudSync] Error al reconciliar lápidas:', err);
    return false;
  }
  })();

  try {
    return await inFlightReconcilePromise;
  } finally {
    inFlightReconcilePromise = null;
  }
}

/**
 * Sincronización automática de arranque (con deduplicación single-flight estricta y cooldown de 15s)
 */
export async function autoSyncCollaborationOnStartup(user = null, opts = {}) {
  const force = Boolean(opts?.force);
  const manual = Boolean(opts?.manual);
  if (!manual && (isCloudSyncInFlight || isRecentInternalCloudAuthUpdate(4000))) return;

  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return;
  const uid = String(currentUser.id || currentUser.email);

  if (startupSyncInFlightPromise && startupSyncUserId === uid) {
    return startupSyncInFlightPromise;
  }
  const now = Date.now();
  if (!manual && lastStartupSyncUserId === uid && lastStartupSyncAt > 0 && (now - lastStartupSyncAt) < 15000) {
    return;
  }

  lastStartupSyncAt = now;
  lastStartupSyncUserId = uid;
  startupSyncUserId = uid;
  startupSyncInFlightPromise = (async () => {
    // Paso 1: Reconciliar lápidas de proyectos eliminados en la nube
    try {
      await reconcileDeletedProjectsWithCloud({ force: manual });
    } catch (_) {}

    const hadLocalProjectsAtBoot = typeof getProjectsList === 'function' && getProjectsList().length > 0;

    // Paso 2: Restaurar de la nube (public.proyectos + proyecto_colaboradores + invitaciones)
    restoreUserCollaborationFromCloud(currentUser);
    if (!hadLocalProjectsAtBoot && inFlightCloudRestorePromise) {
      try { await inFlightCloudRestorePromise; } catch (_) {}
    }

    // Paso 3: Verificar si localStorage local contiene obras no respaldadas o metadata legado por limpiar
    const myEmail = (currentUser.email || '').toLowerCase().trim();
    const allProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];
    const localOwned = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === myEmail);

    const allPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
    const myPlanInvs = allPlanInvs.filter(pi => (pi.email || '').toLowerCase().trim() === myEmail);

    const cloudState = currentUser.user_metadata?.cubikar_cloud_state_v2;
    const hasLegacyV1 = Boolean(currentUser.user_metadata?.cubikar_collaboration_v1);
    const hasLegacyArrays = (Array.isArray(cloudState?.ownedProjects) && cloudState.ownedProjects.length > 0) ||
      (Array.isArray(cloudState?.collaboratedProjects) && cloudState.collaboratedProjects.length > 0);
    const hasBloatedDelIds = Array.isArray(cloudState?.deletedProjectIds) && cloudState.deletedProjectIds.length > MAX_METADATA_DELETED_IDS;
    const hasUnsyncedLocal = localOwned.some(p => !p.isCloudSynced && !isProjectMarkedDeleted(p.id) && !isProjectMarkedDeleted(p.cloudId));
    const cloudPlanCount = Array.isArray(cloudState?.planInvitations) ? cloudState.planInvitations.length : 0;

    if (
      !cloudState ||
      hasLegacyV1 ||
      hasLegacyArrays ||
      hasBloatedDelIds ||
      hasUnsyncedLocal ||
      myPlanInvs.length > cloudPlanCount
    ) {
      await syncUserCollaborationToCloud(currentUser, { force });
    }
    if (inFlightCloudRestorePromise) {
      try { await inFlightCloudRestorePromise; } catch (_) {}
    }
    if (typeof window !== 'undefined' && typeof window.hydrateAllUserProjectsChatFromCloud === 'function') {
      window.hydrateAllUserProjectsChatFromCloud(false).catch(() => {});
    }
  })().finally(() => {
    startupSyncInFlightPromise = null;
    startupSyncUserId = '';
  });

  return startupSyncInFlightPromise;
}

/**
 * Disparador con debounce y respeto de backoff para evitar saturar Supabase Auth
 */
export function triggerDebouncedCloudStateSync(user = null) {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  const now = Date.now();
  const baseDelay = 1500;
  const delay = nextCloudUpdateAllowedAt > now ? Math.max(baseDelay, nextCloudUpdateAllowedAt - now) : baseDelay;
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    syncUserCollaborationToCloud(user);
  }, delay);
}

if (typeof window !== 'undefined') {
  window.syncUserCollaborationToCloud = syncUserCollaborationToCloud;
  window.restoreUserCollaborationFromCloud = restoreUserCollaborationFromCloud;
  window.autoSyncCollaborationOnStartup = autoSyncCollaborationOnStartup;
  window.triggerDebouncedCloudStateSync = triggerDebouncedCloudStateSync;
  window.markInternalCloudAuthUpdate = markInternalCloudAuthUpdate;
  window.recordDeletedProjectTombstone = recordDeletedProjectTombstone;
  window.recordHostActiveManifest = recordHostActiveManifest;
  window.syncHostWorkspaceProjects = syncHostWorkspaceProjects;
  window.reconcileDeletedProjectsWithCloud = reconcileDeletedProjectsWithCloud;
}
