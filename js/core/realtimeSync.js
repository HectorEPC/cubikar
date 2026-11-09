// js/core/realtimeSync.js
// Sincronización en tiempo real vía WebSockets (Supabase Realtime) y Colaboración en vivo

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { state } from '../state/store.js';
import {
  getCurrentUser,
  getStoredInvitations,
  saveStoredInvitations,
  getProjectsList,
  saveProjectsList
} from '../modules/portal/projectService.js';
import { showToast } from '../ui/notifications.js';

let activeChannel = null;
let currentSubscribedProjectId = null;

let onRemoteConceptUpdated = null;
let onPresenceSyncCallback = null;

export function registerRealtimeCallbacks({ onConceptUpdate, onPresenceSync }) {
  if (onConceptUpdate) onRemoteConceptUpdated = onConceptUpdate;
  if (onPresenceSync) onPresenceSyncCallback = onPresenceSync;
}

/**
 * Actualiza los avatares e indicador visual de presencia en la cabecera
 */
export function updateRealtimePresenceUI(activeUsers = []) {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('header-supabase-realtime');
  const label = document.getElementById('header-supabase-realtime-label');
  const avatarsEl = document.getElementById('header-realtime-active-avatars');

  if (!badge) return;

  const count = activeUsers.length;
  if (label) {
    label.textContent = count > 1 ? `En Vivo (${count})` : 'En Vivo';
  }

  if (avatarsEl) {
    avatarsEl.innerHTML = activeUsers.slice(0, 4).map(u => {
      const name = u.name || u.email || 'Usuario';
      const initial = name.charAt(0).toUpperCase();
      if (u.avatar) {
        return `<img src="${u.avatar}" title="${name} (activo ahora)" class="w-4 h-4 rounded-full border border-slate-900 object-cover">`;
      }
      return `<div title="${name} (activo ahora)" class="w-4 h-4 rounded-full bg-blue-600 border border-slate-900 text-[8px] font-bold text-white flex items-center justify-center">${initial}</div>`;
    }).join('');
  }
}

/**
 * Conectar al canal en tiempo real de una obra en particular
 */
export function subscribeToProjectRealtime(projectId) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId) {
    return;
  }

  // Evitar suscripciones duplicadas al mismo proyecto
  if (activeChannel && currentSubscribedProjectId === projectId) {
    return;
  }

  unsubscribeFromProjectRealtime();
  currentSubscribedProjectId = projectId;
  const channelName = `obra_${projectId}`;

  activeChannel = sb.channel(channelName, {
    config: {
      presence: {
        key: getCurrentUser()?.id || `user_${Math.random().toString(36).substring(2, 7)}`
      }
    }
  });

  // 1. Escuchar transmisiones instantáneas (Broadcast P2P en vivo < 30ms)
  activeChannel.on('broadcast', { event: 'concepto_editado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingConceptUpdate(payload.payload);
    }
  });

  // 2. Escuchar cambios de base de datos en 'catalogo_conceptos' (Postgres CDC)
  activeChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'catalogo_conceptos',
      filter: `proyecto_id=eq.${projectId}`
    },
    (payload) => {
      if (payload?.new) {
        handleIncomingConceptUpdate(payload.new);
      }
    }
  );

  // 3. Escuchar cambios en matrices de insumos APU
  activeChannel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'insumos_apu'
    },
    (payload) => {
      window.dispatchEvent(new CustomEvent('remote-apu-change', { detail: payload }));
    }
  );

  // 4. Sincronización de presencia de usuarios (quién está en la obra)
  activeChannel.on('presence', { event: 'sync' }, () => {
    if (!activeChannel) return;
    const presenceState = activeChannel.presenceState();
    const activeUsers = Object.values(presenceState).flat();
    updateRealtimePresenceUI(activeUsers);
    if (onPresenceSyncCallback) {
      onPresenceSyncCallback(activeUsers);
    }
  });

  activeChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      console.info(`[Realtime] Conectado al canal WebSocket de la obra: ${projectId}`);
      const user = getCurrentUser();
      if (user) {
        await activeChannel.track({
          userId: user.id || user.email,
          name: user.name || 'Usuario de Obra',
          email: user.email || '',
          avatar: user.avatar || '',
          joinedAt: new Date().toISOString()
        });
      }
    }
  });
}

/**
 * Emitir broadcast instantáneo a otros usuarios conectados a la misma obra
 */
export function broadcastConceptChange(concept) {
  if (!activeChannel || !concept) return;

  const currentUser = getCurrentUser();
  const payload = {
    id: concept.id,
    clave: concept.clave,
    descripcion: concept.descripcion,
    unidad: concept.unidad,
    cantidad: concept.cantidad,
    precioUnitario: concept.precioUnitario,
    costoDirecto: concept.costoDirecto,
    autor: currentUser?.name || 'Colaborador',
    autorId: currentUser?.id || null,
    timestamp: Date.now()
  };

  activeChannel.send({
    type: 'broadcast',
    event: 'concepto_editado',
    payload: payload
  });
}

/**
 * Actualizar nodo local cuando otro usuario modifica un concepto en la nube
 */
function handleIncomingConceptUpdate(data) {
  if (!data || !data.id) return;
  const currentUser = getCurrentUser();

  // Si el cambio fue emitido por nosotros mismos, ignorar
  if (data.autorId && currentUser && data.autorId === currentUser.id) {
    return;
  }

  function findAndMutate(nodes) {
    if (!Array.isArray(nodes)) return false;
    for (let node of nodes) {
      if (node.id === data.id || (data.clave && node.clave === data.clave)) {
        if (data.cantidad !== undefined) node.cantidad = Number(data.cantidad) || 0;
        if (data.precioUnitario !== undefined) node.precioUnitario = Number(data.precioUnitario) || 0;
        if (data.precio_unitario !== undefined) node.precioUnitario = Number(data.precio_unitario) || 0;
        if (data.costoDirecto !== undefined) node.costoDirecto = Number(data.costoDirecto) || 0;
        if (data.costo_directo !== undefined) node.costoDirecto = Number(data.costo_directo) || 0;
        if (data.descripcion !== undefined) node.descripcion = data.descripcion;
        if (data.unidad !== undefined) node.unidad = data.unidad;
        return true;
      }
      if (Array.isArray(node.children) && findAndMutate(node.children)) {
        return true;
      }
    }
    return false;
  }

  const updated = findAndMutate(state.treeData);
  if (updated) {
    // Recalcular y refrescar la tabla si la función global está disponible
    if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
    if (typeof window.renderTAB1 === 'function') window.renderTAB1();
    if (typeof window.highlightCatalogRowInPlace === 'function') window.highlightCatalogRowInPlace(data.id);

    const autorNombre = data.autor || 'Otro usuario';
    showToast(`🔄 Concepto "${data.clave || ''}" actualizado en vivo por ${autorNombre}`, 'info');

    if (onRemoteConceptUpdated) {
      onRemoteConceptUpdated(data);
    }
  }
}

/**
 * Enviar actualización de un concepto a Supabase en la tabla catalogo_conceptos
 */
export async function pushConceptUpdateToSupabase(concept) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !concept?.id) return;

  try {
    const { error } = await sb
      .from('catalogo_conceptos')
      .update({
        descripcion: concept.descripcion,
        cantidad: concept.cantidad,
        precio_unitario: concept.precioUnitario,
        costo_directo: concept.costoDirecto,
        updated_at: new Date().toISOString()
      })
      .eq('id', concept.id);

    if (error) {
      console.warn('[Realtime] Aviso al actualizar concepto en Supabase:', error.message);
    }
  } catch (err) {
    console.warn('[Realtime] Fallo en pushConceptUpdateToSupabase:', err);
  }
}

/**
 * Desconectar del canal en tiempo real
 */
export function unsubscribeFromProjectRealtime() {
  const sb = getSupabaseClient();
  if (activeChannel && sb) {
    sb.removeChannel(activeChannel);
    activeChannel = null;
    currentSubscribedProjectId = null;
  }
}

// =========================================================================
// CANAL GLOBAL DE INVITACIONES Y COLABORACIÓN EN TIEMPO REAL
// =========================================================================
let globalSyncChannel = null;

export function initGlobalRealtimeSync() {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) return null;

  if (globalSyncChannel) return globalSyncChannel;

  globalSyncChannel = sb.channel('cubikar_global_sync', {
    config: {
      broadcast: { self: false }
    }
  });

  // 1. Escuchar invitaciones en tiempo real
  globalSyncChannel.on('broadcast', { event: 'nueva_invitacion' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingInvitation(payload.payload);
  });

  // 2. Escuchar aceptación de invitaciones
  globalSyncChannel.on('broadcast', { event: 'invitacion_aceptada' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingInvitationAccepted(payload.payload);
  });

  // 3. Escuchar rechazo o eliminación de invitaciones
  globalSyncChannel.on('broadcast', { event: 'invitacion_rechazada' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingInvitationRejected(payload.payload);
  });

  // 4. Escuchar creación de nuevos proyectos
  globalSyncChannel.on('broadcast', { event: 'nuevo_proyecto' }, (payload) => {
    if (!payload?.payload) return;
    handleIncomingNewProject(payload.payload);
  });

  // 5. Escuchar peticiones de sincronización peer
  globalSyncChannel.on('broadcast', { event: 'solicitar_sincronizacion_peer' }, (payload) => {
    if (!payload?.payload) return;
    handlePeerSyncRequest(payload.payload);
  });

  // 6. Escuchar respuesta de sincronización peer
  globalSyncChannel.on('broadcast', { event: 'responder_sincronizacion_peer' }, (payload) => {
    if (!payload?.payload) return;
    handlePeerSyncResponse(payload.payload);
  });

  globalSyncChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.info('[Realtime] Canal global WebSocket conectado exitosamente.');
      requestPeerSync();
    }
  });

  return globalSyncChannel;
}

/**
 * Emitir broadcast de una nueva invitación a un colaborador
 */
export function broadcastNewInvitation(invitation, project) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !invitation) return;

  globalSyncChannel.send({
    type: 'broadcast',
    event: 'nueva_invitacion',
    payload: {
      invitation,
      project: project ? {
        id: project.id,
        projectName: project.projectName,
        companyName: project.companyName,
        companyLogo: project.companyLogo,
        projectLocation: project.projectLocation,
        tipoObra: project.tipoObra,
        currency: project.currency,
        currencySymbol: project.currencySymbol,
        factorSobrecosto: project.factorSobrecosto,
        totalPresupuesto: project.totalPresupuesto,
        conceptCount: project.conceptCount,
        partidasCount: project.partidasCount,
        ownerEmail: project.ownerEmail,
        ownerPlanId: project.ownerPlanId,
        members: project.members,
        createdAt: project.createdAt
      } : null
    }
  });
}

function handleIncomingInvitation({ invitation, project }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email || !invitation) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = (invitation.email || '').toLowerCase().trim();

  // Si la invitación no es para mí, ignorar
  if (myEmail !== targetEmail) return;

  // 1. Guardar la invitación en el almacenamiento local del invitado
  const invs = getStoredInvitations();
  const exists = invs.some(i => i.id === invitation.id || (i.projectId === invitation.projectId && (i.email || '').toLowerCase() === myEmail));
  if (!exists) {
    invs.unshift(invitation);
    saveStoredInvitations(invs);
  }

  // 2. Si viene el proyecto adjunto, guardarlo o actualizarlo en su lista local
  if (project && project.id) {
    const list = getProjectsList();
    const pIdx = list.findIndex(p => p.id === project.id);
    if (pIdx >= 0) {
      list[pIdx] = Object.assign({}, list[pIdx], project);
    } else {
      list.unshift(project);
    }
    saveProjectsList(list);
  }

  // 3. Notificar al usuario
  showToast(`🔔 ¡Has recibido una invitación de ${invitation.ownerName || 'un anfitrión'} para colaborar en "${invitation.projectName}"!`, 'info');

  // 4. Refrescar interfaz de notificaciones y dashboard
  if (typeof window.renderSidebarNotificationsUI === 'function') {
    window.renderSidebarNotificationsUI();
  }
  if (typeof window.refreshProjectsGridUI === 'function') {
    window.refreshProjectsGridUI();
  }
}

/**
 * Emitir broadcast cuando una invitación es aceptada
 */
export function broadcastInvitationAccepted(invitation, user) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !invitation) return;

  globalSyncChannel.send({
    type: 'broadcast',
    event: 'invitacion_aceptada',
    payload: {
      invitationId: invitation.id,
      projectId: invitation.projectId,
      projectName: invitation.projectName,
      ownerEmail: invitation.ownerEmail,
      user: {
        name: user?.name || invitation.name,
        email: user?.email || invitation.email,
        avatar: user?.avatar || ''
      }
    }
  });
}

function handleIncomingInvitationAccepted({ projectId, projectName, ownerEmail, user }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const targetOwner = (ownerEmail || '').toLowerCase().trim();

  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return;

  if ((proj.ownerEmail || '').toLowerCase().trim() === myEmail || myEmail === targetOwner) {
    if (Array.isArray(proj.members)) {
      const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === (user.email || '').toLowerCase().trim());
      if (mem) {
        mem.status = 'active';
        mem.name = user.name || mem.name;
        mem.avatar = user.avatar || mem.avatar;
      } else {
        proj.members.push({
          id: 'mem-' + Date.now(),
          name: user.name || 'Colaborador',
          email: user.email,
          avatar: user.avatar || '',
          role: 'editar',
          status: 'active'
        });
      }
      saveProjectsList(list);
    }

    showToast(`👤 ${user.name || user.email} ha aceptado la invitación al proyecto "${projectName}"`, 'info');

    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderHeaderCollaborators === 'function') {
      window.renderHeaderCollaborators();
    }
  }
}

/**
 * Emitir broadcast cuando se rechaza una invitación
 */
export function broadcastInvitationRejected(invitation, user) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !invitation) return;

  globalSyncChannel.send({
    type: 'broadcast',
    event: 'invitacion_rechazada',
    payload: {
      invitationId: invitation.id,
      projectId: invitation.projectId,
      ownerEmail: invitation.ownerEmail,
      email: user?.email || invitation.email
    }
  });
}

function handleIncomingInvitationRejected({ projectId, email }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = (email || '').toLowerCase().trim();

  // Si soy el usuario rechazado, eliminar de mis invitaciones
  if (myEmail === targetEmail) {
    const invs = getStoredInvitations().filter(i => i.projectId !== projectId);
    saveStoredInvitations(invs);
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    return;
  }

  // Si soy el anfitrión, actualizar el miembro del proyecto
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (proj && Array.isArray(proj.members)) {
    proj.members = proj.members.filter(m => (m.email || '').toLowerCase().trim() !== targetEmail);
    saveProjectsList(list);

    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
  }
}

/**
 * Emitir broadcast cuando un usuario crea un nuevo proyecto
 */
export function broadcastNewProject(project) {
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (!globalSyncChannel || !project) return;

  const currentUser = getCurrentUser();
  globalSyncChannel.send({
    type: 'broadcast',
    event: 'nuevo_proyecto',
    payload: {
      project,
      creatorName: currentUser?.name || 'Editor',
      creatorEmail: currentUser?.email || ''
    }
  });
}

function handleIncomingNewProject({ project, creatorName, creatorEmail }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email || !project) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const ownerEmail = (project.ownerEmail || '').toLowerCase().trim();
  const isMember = Array.isArray(project.members) && project.members.some(m => (m.email || '').toLowerCase().trim() === myEmail);

  // Si soy el dueño o un miembro del proyecto
  if (ownerEmail === myEmail || isMember) {
    const list = getProjectsList();
    const exists = list.some(p => p.id === project.id);
    if (!exists) {
      list.unshift(project);
      saveProjectsList(list);

      showToast(`🏢 ¡Nuevo proyecto "${project.projectName}" creado por ${creatorName || creatorEmail}!`, 'info');

      if (typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    }
  }
}

/**
 * Solicitar sincronización peer a otros usuarios conectados
 */
export function requestPeerSync() {
  if (!globalSyncChannel) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  globalSyncChannel.send({
    type: 'broadcast',
    event: 'solicitar_sincronizacion_peer',
    payload: {
      email: currentUser.email.toLowerCase().trim()
    }
  });
}

function handlePeerSyncRequest({ email }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email || !email) return;

  const targetEmail = email.toLowerCase().trim();
  if (targetEmail === currentUser.email.toLowerCase().trim()) return;

  // Buscar invitaciones que yo (anfitrión) haya hecho hacia este email
  const allInvs = getStoredInvitations();
  const myInvsForTarget = allInvs.filter(i => (i.email || '').toLowerCase().trim() === targetEmail);

  // Buscar proyectos míos donde este email sea miembro
  const allProjects = getProjectsList();
  const myProjectsForTarget = allProjects.filter(p =>
    Array.isArray(p.members) && p.members.some(m => (m.email || '').toLowerCase().trim() === targetEmail)
  );

  if (myInvsForTarget.length > 0 || myProjectsForTarget.length > 0) {
    globalSyncChannel.send({
      type: 'broadcast',
      event: 'responder_sincronizacion_peer',
      payload: {
        targetEmail,
        invitations: myInvsForTarget,
        projects: myProjectsForTarget
      }
    });
  }
}

function handlePeerSyncResponse({ targetEmail, invitations, projects }) {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  if (targetEmail.toLowerCase().trim() !== currentUser.email.toLowerCase().trim()) return;

  let changed = false;

  // Mergear invitaciones
  if (Array.isArray(invitations) && invitations.length > 0) {
    const currentInvs = getStoredInvitations();
    invitations.forEach(inv => {
      if (!currentInvs.some(ci => ci.id === inv.id)) {
        currentInvs.unshift(inv);
        changed = true;
      }
    });
    if (changed) {
      saveStoredInvitations(currentInvs);
    }
  }

  // Mergear proyectos
  if (Array.isArray(projects) && projects.length > 0) {
    const currentProjs = getProjectsList();
    let projChanged = false;
    projects.forEach(p => {
      const idx = currentProjs.findIndex(cp => cp.id === p.id);
      if (idx < 0) {
        currentProjs.unshift(p);
        projChanged = true;
      }
    });
    if (projChanged) {
      saveProjectsList(currentProjs);
      changed = true;
    }
  }

  if (changed) {
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
  }
}
