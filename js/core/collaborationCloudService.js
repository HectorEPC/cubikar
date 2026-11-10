// js/core/collaborationCloudService.js
// Sincronización en la nube (Supabase Auth user_metadata) de invitaciones aceptadas,
// membresías de anfitriones y proyectos colaborados entre múltiples computadoras/dispositivos.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import {
  getCurrentUser,
  saveCurrentUser,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  getProjectsList,
  saveProjectsList
} from '../modules/portal/projectService.js';
import { getSettingsKey, getStorageKey } from '../config/constants.js';

/**
 * Sincroniza hacia Supabase Cloud (en user_metadata) el estado completo de:
 * 1. Invitaciones aceptadas de este usuario
 * 2. Invitaciones al plan de anfitriones aceptadas
 * 3. Proyectos en los que participa como colaborador o propietario
 */
export async function syncUserCollaborationToCloud(user = null) {
  const sb = getSupabaseClient();
  if (!sb || !isSupabaseConfigured()) return false;

  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;
  const myEmail = (currentUser.email || '').toLowerCase().trim();

  try {
    const allInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
    const myAcceptedInvs = allInvs.filter(i => 
      (i.email || '').toLowerCase().trim() === myEmail && i.status === 'accepted'
    );

    const allPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
    const myPlanInvs = allPlanInvs.filter(pi => 
      (pi.email || '').toLowerCase().trim() === myEmail
    );

    const allProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];
    const myProjects = allProjects.filter(p => {
      const isOwner = (p.ownerEmail || '').toLowerCase().trim() === myEmail;
      const isCollab = Array.isArray(p.members) && p.members.some(m => 
        (m.email || '').toLowerCase().trim() === myEmail && m.status === 'active'
      );
      return isCollab || isOwner;
    }).map(p => {
      let localSettings = null;
      let localTree = null;
      try {
        const rawSet = localStorage.getItem(getSettingsKey(p.id));
        if (rawSet) localSettings = JSON.parse(rawSet);
        const rawTree = localStorage.getItem(getStorageKey(p.id));
        if (rawTree) {
          const parsedTree = JSON.parse(rawTree);
          if (Array.isArray(parsedTree) && parsedTree.length <= 150) {
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
        members: p.members || [],
        createdAt: p.createdAt || new Date().toISOString(),
        settings: localSettings,
        treeData: localTree
      };
    });

    // Guardar también invitaciones emitidas por este usuario hacia otros (si es anfitrión)
    const mySentPlanInvs = allPlanInvs.filter(pi => (pi.ownerEmail || '').toLowerCase().trim() === myEmail);
    const mySentProjectInvs = allInvs.filter(i => (i.ownerEmail || '').toLowerCase().trim() === myEmail);

    const collaborationPayload = {
      acceptedInvitations: myAcceptedInvs,
      planInvitations: myPlanInvs,
      collaboratedProjects: myProjects,
      sentPlanInvitations: mySentPlanInvs,
      sentProjectInvitations: mySentProjectInvs,
      updatedAt: new Date().toISOString()
    };

    // Actualizar metadatos en Supabase Auth
    const { data, error } = await sb.auth.updateUser({
      data: {
        cubikar_collaboration_v1: collaborationPayload
      }
    });

    if (error) {
      console.warn('[CollaborationCloud] Error guardando colaboración en Supabase:', error.message);
      return false;
    }

    // Mantener sincronizado el usuario en memoria local
    if (currentUser) {
      if (!currentUser.user_metadata) currentUser.user_metadata = {};
      currentUser.user_metadata.cubikar_collaboration_v1 = collaborationPayload;
      saveCurrentUser(currentUser);
    }

    console.info('[CollaborationCloud] Colaboraciones sincronizadas con la nube exitosamente.');
    return true;
  } catch (err) {
    console.warn('[CollaborationCloud] Excepción al sincronizar colaboraciones en la nube:', err);
    return false;
  }
}

/**
 * Restaura en localStorage el estado de colaboraciones recuperado de user_metadata
 */
export function restoreUserCollaborationFromCloud(user = null) {
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;
  const myEmail = (currentUser.email || '').toLowerCase().trim();

  // Buscar el payload en user_metadata
  const collabData = currentUser.user_metadata?.cubikar_collaboration_v1;
  if (!collabData || typeof collabData !== 'object') return false;

  let hasChanges = false;

  // 1. Restaurar invitaciones aceptadas
  if (Array.isArray(collabData.acceptedInvitations) && collabData.acceptedInvitations.length > 0) {
    const localInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
    let invsChanged = false;
    collabData.acceptedInvitations.forEach(cloudInv => {
      const idx = localInvs.findIndex(li => 
        li.id === cloudInv.id || 
        (li.projectId === cloudInv.projectId && (li.email || '').toLowerCase().trim() === myEmail)
      );
      if (idx === -1) {
        localInvs.unshift(cloudInv);
        invsChanged = true;
      } else if (localInvs[idx].status !== 'accepted') {
        localInvs[idx].status = 'accepted';
        localInvs[idx].acceptedAt = cloudInv.acceptedAt || new Date().toISOString();
        invsChanged = true;
      }
    });
    if (invsChanged && typeof saveStoredInvitations === 'function') {
      saveStoredInvitations(localInvs);
      hasChanges = true;
    }
  }

  // 2. Restaurar invitaciones al plan del anfitrión
  if (Array.isArray(collabData.planInvitations) && collabData.planInvitations.length > 0) {
    const localPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
    let planChanged = false;
    collabData.planInvitations.forEach(cloudPlanInv => {
      const idx = localPlanInvs.findIndex(lpi => 
        lpi.id === cloudPlanInv.id || 
        ((lpi.ownerEmail || '').toLowerCase().trim() === (cloudPlanInv.ownerEmail || '').toLowerCase().trim() && (lpi.email || '').toLowerCase().trim() === myEmail)
      );
      if (idx === -1) {
        localPlanInvs.unshift(cloudPlanInv);
        planChanged = true;
      } else {
        if (localPlanInvs[idx].status !== cloudPlanInv.status) {
          localPlanInvs[idx].status = cloudPlanInv.status;
          planChanged = true;
        }
        if (cloudPlanInv.role && localPlanInvs[idx].role !== cloudPlanInv.role) {
          localPlanInvs[idx].role = cloudPlanInv.role;
          planChanged = true;
        }
      }
    });
    if (planChanged && typeof saveStoredPlanInvitations === 'function') {
      saveStoredPlanInvitations(localPlanInvs);
      hasChanges = true;
    }
  }

  // 3. Restaurar proyectos colaborados
  if (Array.isArray(collabData.collaboratedProjects) && collabData.collaboratedProjects.length > 0) {
    const localProjects = typeof getProjectsList === 'function' ? getProjectsList() : [];
    let projChanged = false;
    collabData.collaboratedProjects.forEach(cp => {
      const idx = localProjects.findIndex(lp => lp.id === cp.id);
      if (idx === -1) {
        localProjects.unshift(cp);
        projChanged = true;
      } else {
        // Asegurar que el usuario sea miembro activo
        if (Array.isArray(cp.members)) {
          const userMem = cp.members.find(m => (m.email || '').toLowerCase().trim() === myEmail);
          if (userMem) {
            if (!Array.isArray(localProjects[idx].members)) localProjects[idx].members = [];
            const localMemIdx = localProjects[idx].members.findIndex(m => (m.email || '').toLowerCase().trim() === myEmail);
            if (localMemIdx === -1) {
              localProjects[idx].members.push(userMem);
              projChanged = true;
            } else if (localProjects[idx].members[localMemIdx].status !== 'active') {
              localProjects[idx].members[localMemIdx].status = 'active';
              projChanged = true;
            }
          }
        }
      }

      // Restaurar árbol de catálogo y configuración si vinieron incluidos y no existen localmente
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
      saveProjectsList(localProjects);
      hasChanges = true;
    }
  }

  // 4. Restaurar invitaciones emitidas por este usuario (si es anfitrión)
  if (Array.isArray(collabData.sentPlanInvitations) && collabData.sentPlanInvitations.length > 0) {
    const localPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
    let sentChanged = false;
    collabData.sentPlanInvitations.forEach(spi => {
      if (!localPlanInvs.some(lpi => lpi.id === spi.id)) {
        localPlanInvs.unshift(spi);
        sentChanged = true;
      }
    });
    if (sentChanged && typeof saveStoredPlanInvitations === 'function') {
      saveStoredPlanInvitations(localPlanInvs);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    console.info('[CollaborationCloud] Colaboraciones restauradas desde la nube en este dispositivo.');
  }
  return hasChanges;
}

/**
 * Sincronización automática de arranque:
 * 1. Restaura lo que haya en la nube a localStorage.
 * 2. Si localStorage tiene más datos o son más recientes, los sube a la nube.
 */
export async function autoSyncCollaborationOnStartup(user = null) {
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  // Paso 1: Restaurar de la nube si existen datos en user_metadata
  restoreUserCollaborationFromCloud(currentUser);

  // Paso 2: Si hay invitaciones aceptadas o colaboraciones locales, asegurar respaldo en la nube
  const myEmail = (currentUser.email || '').toLowerCase().trim();
  const allInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
  const myAcceptedInvs = allInvs.filter(i => (i.email || '').toLowerCase().trim() === myEmail && i.status === 'accepted');

  const allPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
  const myPlanInvs = allPlanInvs.filter(pi => (pi.email || '').toLowerCase().trim() === myEmail);

  const cloudCollab = currentUser.user_metadata?.cubikar_collaboration_v1;
  const cloudAcceptedCount = Array.isArray(cloudCollab?.acceptedInvitations) ? cloudCollab.acceptedInvitations.length : 0;
  const cloudPlanCount = Array.isArray(cloudCollab?.planInvitations) ? cloudCollab.planInvitations.length : 0;

  if ((myAcceptedInvs.length > cloudAcceptedCount) || (myPlanInvs.length > cloudPlanCount) || !cloudCollab) {
    await syncUserCollaborationToCloud(currentUser);
  }
}

if (typeof window !== 'undefined') {
  window.syncUserCollaborationToCloud = syncUserCollaborationToCloud;
  window.restoreUserCollaborationFromCloud = restoreUserCollaborationFromCloud;
  window.autoSyncCollaborationOnStartup = autoSyncCollaborationOnStartup;
}

