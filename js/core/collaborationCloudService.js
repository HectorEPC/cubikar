// js/core/collaborationCloudService.js
// Sincronización integral en la nube (Supabase Auth user_metadata) para garantizar
// persistencia total de proyectos, anfitriones, invitaciones y membresías
// al iniciar sesión en cualquier computadora, navegador o dispositivo.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import {
  getCurrentUser,
  saveCurrentUser,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  getProjectsList,
  saveProjectsList,
  getUserPlanId
} from '../modules/portal/projectService.js';
import { getSettingsKey, getStorageKey } from '../config/constants.js';

let syncDebounceTimer = null;

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
  if (!sb || !isSupabaseConfigured()) return false;

  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;
  const myEmail = (currentUser.email || '').toLowerCase().trim();

  try {
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

    const cloudPayload = {
      version: 2,
      subscription: currentSub,
      ownedProjects: myOwnedProjects,
      collaboratedProjects: myCollaboratedProjects,
      planInvitations: myPlanInvs,
      acceptedInvitations: myAcceptedInvs,
      sentPlanInvitations: mySentPlanInvs,
      sentProjectInvitations: mySentProjectInvs,
      updatedAt: new Date().toISOString()
    };

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

    // Actualizar usuario en memoria local
    if (currentUser) {
      if (!currentUser.user_metadata) currentUser.user_metadata = {};
      currentUser.user_metadata.cubikar_cloud_state_v2 = cloudPayload;
      saveCurrentUser(currentUser);
    }

    console.info(`[CloudSync] Estado respaldado en la nube con éxito (${myOwnedProjects.length} propias, ${myCollaboratedProjects.length} colaboradas, ${myPlanInvs.length} anfitriones).`);
    return true;
  } catch (err) {
    console.warn('[CloudSync] Excepción al respaldar en la nube:', err);
    return false;
  }
}

/**
 * Mapea y comprime los datos de un proyecto para almacenamiento en la nube
 */
function mapProjectForCloudSync(p) {
  let localSettings = null;
  let localTree = null;
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
    ownerName: p.ownerName || p.companyName || 'Anfitrión',
    ownerPlanId: p.ownerPlanId || 'free',
    members: Array.isArray(p.members) ? p.members : [],
    createdAt: p.createdAt || new Date().toISOString(),
    settings: localSettings,
    treeData: localTree
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

  // 2. Restaurar proyectos propios y colaborados en STORAGE_KEY_PROJECTS
  const cloudProjectsToRestore = [];
  if (Array.isArray(state.ownedProjects)) {
    cloudProjectsToRestore.push(...state.ownedProjects);
  }
  if (Array.isArray(state.collaboratedProjects)) {
    cloudProjectsToRestore.push(...state.collaboratedProjects);
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
        // Actualizar miembros y datos si la nube tiene información más completa
        if (Array.isArray(cp.members) && cp.members.length > 0) {
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

      // Restaurar árbol de catálogo y configuración en localStorage si vinieron incluidos
      try {
        if (cp.settings && !localStorage.getItem(getSettingsKey(cp.id))) {
          localStorage.setItem(getSettingsKey(cp.id), JSON.stringify(cp.settings));
        }
        if (cp.treeData && !localStorage.getItem(getStorageKey(cp.id))) {
          localStorage.setItem(getStorageKey(cp.id), JSON.stringify(cp.treeData));
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

  if (hasChanges) {
    console.info('[CloudSync] Estado restaurado desde la nube en este navegador con éxito.');
  }
  return hasChanges;
}

/**
 * Sincronización automática de arranque:
 * 1. Restaura lo que haya en la nube a localStorage.
 * 2. Si localStorage contiene datos nuevos o más completos, los respalda a la nube.
 */
export async function autoSyncCollaborationOnStartup(user = null) {
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  // Paso 1: Restaurar de la nube si existen datos en user_metadata
  const didRestore = restoreUserCollaborationFromCloud(currentUser);

  // Paso 2: Verificar si localStorage local contiene obras o invitaciones no respaldadas aún
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
}
