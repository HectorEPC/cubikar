// js/core/realtimeSync.js
// Sincronización en tiempo real vía WebSockets (Supabase Realtime) y Colaboración en vivo

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { state } from '../state/store.js';
import {
  getCurrentUser,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  getProjectsList,
  saveProjectsList,
  countTreeConcepts,
  countTreePartidas,
  calculateTreeTotal,
  markProjectDeleted,
  isProjectMarkedDeleted,
  saveCurrentUser
} from '../modules/portal/projectService.js';
import { getActiveProjectId, getStorageKey, getSettingsKey } from '../config/constants.js';
import { findNodeById } from '../modules/catalog/treeService.js';
import { showToast } from '../ui/notifications.js';

let activeChannel = null;
let currentSubscribedProjectId = null;
let broadcastDebounceTimer = null;

let onRemoteConceptUpdated = null;
let onPresenceSyncCallback = null;

// Canal de transmisión local de baja latencia (0ms) entre pestañas y ventanas del mismo navegador
export const localBroadcastChannel = (typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function')
  ? new window.BroadcastChannel('cubikar_realtime_local_v1')
  : null;

if (localBroadcastChannel) {
  localBroadcastChannel.onmessage = (event) => {
    if (!event || !event.data) return;
    const { type, payload } = event.data;
    if (type === 'proyecto_actualizado') {
      handleIncomingProjectUpdate(payload);
    } else if (type === 'proyecto_eliminado') {
      handleIncomingProjectDeleted(payload);
    } else if (type === 'chat_mensaje_nuevo') {
      handleIncomingChatMessage(payload);
    } else if (type === 'chat_mensaje_eliminado') {
      handleIncomingChatDelete(payload);
    }
  };
}

/**
 * Aplicar mutación granular a un árbol de conceptos en memoria o almacenamiento local
 */
export function applyTreePatch(tree, patch) {
  if (!Array.isArray(tree) || !patch || typeof patch !== 'object') return false;

  const type = patch.type;
  if (type === 'update_field') {
    const node = findNodeById(tree, patch.id);
    if (!node) return false;
    const f = patch.field;
    if (f === 'cantidad' || f === 'precioUnitario' || f === 'costoDirecto') {
      node[f] = Math.round(((Number(patch.value) || 0) + Number.EPSILON) * 100) / 100;
    } else {
      node[f] = patch.value;
    }
    return true;
  }

  if (type === 'add_root_row') {
    if (patch.node && patch.node.id) {
      const exists = tree.some(n => n.id === patch.node.id);
      if (!exists) {
        tree.push(patch.node);
        return true;
      }
    }
    return false;
  }

  if (type === 'add_child_row') {
    const parent = findNodeById(tree, patch.parentId);
    if (parent && patch.node && patch.node.id) {
      if (!Array.isArray(parent.children)) parent.children = [];
      const exists = parent.children.some(n => n.id === patch.node.id);
      if (!exists) {
        parent.children.push(patch.node);
        parent.expanded = true;
        return true;
      }
    }
    return false;
  }

  if (type === 'delete_node') {
    function removeRecursive(nodes) {
      const idx = nodes.findIndex(n => n.id === patch.id);
      if (idx !== -1) {
        nodes.splice(idx, 1);
        return true;
      }
      for (let n of nodes) {
        if (Array.isArray(n.children) && removeRecursive(n.children)) return true;
      }
      return false;
    }
    return removeRecursive(tree);
  }

  if (type === 'delete_nodes') {
    const idsSet = new Set(Array.isArray(patch.ids) ? patch.ids : []);
    function removeMultiple(nodes) {
      let changed = false;
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (idsSet.has(nodes[i].id)) {
          nodes.splice(i, 1);
          changed = true;
        } else if (Array.isArray(nodes[i].children)) {
          if (removeMultiple(nodes[i].children)) changed = true;
        }
      }
      return changed;
    }
    return removeMultiple(tree);
  }

  if (type === 'duplicate_node') {
    function insertCloned(nodes) {
      const idx = nodes.findIndex(n => n.id === patch.id);
      if (idx !== -1 && patch.clonedNode) {
        nodes.splice(idx + 1, 0, patch.clonedNode);
        return true;
      }
      for (let n of nodes) {
        if (Array.isArray(n.children) && insertCloned(n.children)) return true;
      }
      return false;
    }
    return insertCloned(tree);
  }

  if (type === 'move_node') {
    function moveInArray(nodes) {
      const idx = nodes.findIndex(n => n.id === patch.id);
      if (idx !== -1) {
        if (patch.direction === 'up' && idx > 0) {
          const temp = nodes[idx - 1];
          nodes[idx - 1] = nodes[idx];
          nodes[idx] = temp;
          return true;
        } else if (patch.direction === 'down' && idx < nodes.length - 1) {
          const temp = nodes[idx + 1];
          nodes[idx + 1] = nodes[idx];
          nodes[idx] = temp;
          return true;
        }
        return false;
      }
      for (let n of nodes) {
        if (Array.isArray(n.children) && moveInArray(n.children)) return true;
      }
      return false;
    }
    return moveInArray(tree);
  }

  if (type === 'update_color') {
    const node = findNodeById(tree, patch.id);
    if (node) {
      node.customColor = patch.color;
      return true;
    }
  }

  return false;
}

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
      broadcast: { ack: true },
      presence: {
        key: getCurrentUser()?.id || `user_${Math.random().toString(36).substring(2, 7)}`
      }
    }
  });

  // 1. Escuchar actualizaciones completas del proyecto en tiempo real (P2P < 30ms)
  activeChannel.on('broadcast', { event: 'proyecto_actualizado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingProjectUpdate(payload.payload);
    }
  });

  // Escuchar transmisiones directas de un concepto editado
  activeChannel.on('broadcast', { event: 'concepto_editado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingConceptUpdate(payload.payload);
    }
  });

  // Escuchar mensajes de chat del proyecto en tiempo real (<30ms)
  activeChannel.on('broadcast', { event: 'chat_mensaje_nuevo' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatMessage(payload.payload);
    }
  });

  // Escuchar eliminación de mensajes de chat en tiempo real
  activeChannel.on('broadcast', { event: 'chat_mensaje_eliminado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatDelete(payload.payload);
    }
  });

  // Escuchar eliminación de esta obra en tiempo real
  activeChannel.on('broadcast', { event: 'proyecto_eliminado' }, (payload) => {
    if (payload?.payload) {
      handleIncomingProjectDeleted(payload.payload);
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
      hydrateProjectChatFromCloud(projectId);
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
 * Emitir broadcast de mutación de proyecto en tiempo real (cambio de texto, adición, eliminación de fila, APU)
 * a todos los colaboradores y anfitriones conectados al canal de la obra y global.
 */
export function broadcastProjectMutation({
  projectId,
  treeData,
  settings,
  immediate = false,
  changeType = 'general',
  highlightId = null,
  changeDescription = 'cambios en el catálogo',
  patch = null
} = {}) {
  const pId = projectId || currentSubscribedProjectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  if (!pId) return;

  const currentUser = getCurrentUser();
  const author = {
    id: currentUser?.id || null,
    name: currentUser?.name || 'Colaborador',
    email: (currentUser?.email || '').toLowerCase().trim(),
    avatar: currentUser?.avatar || ''
  };

  const sendPayload = () => {
    let safeTreeData = null;
    if (Array.isArray(treeData)) {
      try {
        const raw = JSON.stringify(treeData);
        if (raw.length < 180000) {
          safeTreeData = treeData;
        }
      } catch (_) {}
    }

    const payload = {
      projectId: pId,
      treeData: safeTreeData,
      patch: patch || null,
      settings: settings && typeof settings === 'object' ? settings : null,
      summary: {
        totalPresupuesto: typeof calculateTreeTotal === 'function' && Array.isArray(treeData) ? calculateTreeTotal(treeData) : 0,
        conceptCount: typeof countTreeConcepts === 'function' && Array.isArray(treeData) ? countTreeConcepts(treeData) : 0,
        partidasCount: typeof countTreePartidas === 'function' && Array.isArray(treeData) ? countTreePartidas(treeData) : 0,
        factorSobrecosto: settings?.applySobrecosto ? (Number(settings?.factorSobrecosto) || 1.2584) : 1.0
      },
      changeType,
      highlightId,
      changeDescription,
      author,
      timestamp: Date.now()
    };

    // 0. Enviar localmente a otras pestañas/ventanas del navegador (0ms latencia)
    if (localBroadcastChannel) {
      try {
        localBroadcastChannel.postMessage({
          type: 'proyecto_actualizado',
          payload
        });
      } catch (_) {}
    }

    const sb = getSupabaseClient();
    if (!isSupabaseConfigured() || !sb) return;

    // 1. Enviar vía canal de la obra activa (latencia < 30ms para quienes tienen la obra abierta)
    if (activeChannel && currentSubscribedProjectId === pId) {
      try {
        activeChannel.send({
          type: 'broadcast',
          event: 'proyecto_actualizado',
          payload
        });
      } catch (err) {
        console.warn('[Realtime] Aviso al emitir en canal de obra:', err);
      }
    }

    // 2. Enviar vía canal global para sincronizar ventanas, dashboard y todos los colaboradores
    if (!globalSyncChannel) initGlobalRealtimeSync();
    if (globalSyncChannel) {
      try {
        globalSyncChannel.send({
          type: 'broadcast',
          event: 'proyecto_actualizado_global',
          payload
        });
      } catch (err) {
        console.warn('[Realtime] Aviso al emitir en canal global:', err);
      }
    }
  };

  if (immediate) {
    if (broadcastDebounceTimer) {
      clearTimeout(broadcastDebounceTimer);
      broadcastDebounceTimer = null;
    }
    sendPayload();
    return;
  }

  if (broadcastDebounceTimer) clearTimeout(broadcastDebounceTimer);
  broadcastDebounceTimer = setTimeout(() => {
    broadcastDebounceTimer = null;
    sendPayload();
  }, 300);
}

/**
 * Procesar actualización entrante de proyecto emitida por otro usuario en tiempo real
 */
export function handleIncomingProjectUpdate(data) {
  if (!data || !data.projectId) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const authorEmail = (data.author?.email || '').toLowerCase().trim();

  // Si el cambio fue emitido por nosotros mismos, ignorar para evitar bucles de actualización
  if (authorEmail && authorEmail === myEmail) {
    return;
  }

  const projectId = data.projectId;
  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;

  const allProjects = getProjectsList();
  let projIdx = allProjects.findIndex(p => p.id === projectId || (p.cloudId && p.cloudId === projectId));

  // Si el proyecto no está aún en la lista pero fue emitido por un colaborador o anfitrión, agregarlo
  if (projIdx < 0 && data.project && data.project.id) {
    allProjects.unshift(data.project);
    projIdx = 0;
  }

  let proj = projIdx >= 0 ? allProjects[projIdx] : null;

  // Actualizar resumen en la lista de proyectos
  if (proj) {
    if (data.summary) {
      if (data.summary.totalPresupuesto !== undefined) proj.totalPresupuesto = data.summary.totalPresupuesto;
      if (data.summary.conceptCount !== undefined) proj.conceptCount = data.summary.conceptCount;
      if (data.summary.partidasCount !== undefined) proj.partidasCount = data.summary.partidasCount;
      if (data.summary.factorSobrecosto !== undefined) proj.factorSobrecosto = data.summary.factorSobrecosto;
    }
    proj.updatedAt = new Date().toISOString();
    saveProjectsList(allProjects);
  }

  const isCurrentActive = Boolean(currentPId && (currentPId === projectId || (proj && proj.cloudId === currentPId)));

  // 1. Aplicar mutación al árbol local (memoria y localStorage)
  let treeMutated = false;
  if (data.patch) {
    if (isCurrentActive && Array.isArray(state.treeData)) {
      treeMutated = applyTreePatch(state.treeData, data.patch);
    }
    try {
      const storageKey = getStorageKey(projectId);
      const rawTree = localStorage.getItem(storageKey);
      if (rawTree) {
        const parsedTree = JSON.parse(rawTree);
        if (Array.isArray(parsedTree)) {
          if (applyTreePatch(parsedTree, data.patch)) {
            localStorage.setItem(storageKey, JSON.stringify(parsedTree));
          }
        }
      }
    } catch (_) {}
  }

  if (Array.isArray(data.treeData)) {
    try {
      localStorage.setItem(getStorageKey(projectId), JSON.stringify(data.treeData));
    } catch (_) {}
    if (isCurrentActive) {
      state.treeData = JSON.parse(JSON.stringify(data.treeData));
      treeMutated = true;
    }
  }

  if (data.settings && typeof data.settings === 'object') {
    try {
      localStorage.setItem(getSettingsKey(projectId), JSON.stringify(data.settings));
    } catch (_) {}
    if (isCurrentActive) {
      state.settings = Object.assign({}, state.settings, data.settings);
    }
  }

  // Si el usuario tiene actualmente abierta esta misma obra en el espacio de trabajo
  if (isCurrentActive) {
    if (typeof window.recalculateClaves === 'function' && Array.isArray(state.treeData)) {
      try { window.recalculateClaves(state.treeData); } catch (_) {}
    }
    if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
    if (typeof window.renderTAB1 === 'function') window.renderTAB1();

    const targetHighlight = data.highlightId || (data.patch && data.patch.id);
    if (targetHighlight && typeof window.highlightCatalogRowInPlace === 'function') {
      window.highlightCatalogRowInPlace(targetHighlight);
    }

    if (state.activeSelectedId) {
      const stillExists = typeof findNodeById === 'function' ? findNodeById(state.treeData, state.activeSelectedId) : null;
      if (stillExists) {
        if (typeof window.renderInsumosUnitarios === 'function') window.renderInsumosUnitarios(stillExists);
      } else {
        if (typeof window.closeApuPanel === 'function') window.closeApuPanel();
      }
    }
  }

  if (typeof window.refreshProjectsGridUI === 'function') {
    window.refreshProjectsGridUI();
  }

  const authorName = data.author?.name || data.author?.email || 'Un colaborador';
  const desc = data.changeDescription || 'cambios en el catálogo';
  showToast(`🔄 ${authorName} actualizó ${desc} en tiempo real`, 'info');

  // Si somos el anfitrión/propietario, respaldar automáticamente el nuevo estado en la nube
  const isOwner = proj && (proj.ownerEmail || '').toLowerCase().trim() === myEmail;
  if (isOwner) {
    try {
      if (typeof window.triggerDebouncedCloudStateSync === 'function') {
        window.triggerDebouncedCloudStateSync();
      }
    } catch (_) {}
  }
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

  // 7. Escuchar actualizaciones completas de proyectos en tiempo real (P2P global)
  globalSyncChannel.on('broadcast', { event: 'proyecto_actualizado_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingProjectUpdate(payload.payload);
    }
  });

  // 8. Escuchar mensajes de chat globales (notificaciones y sincronización de fondo)
  globalSyncChannel.on('broadcast', { event: 'chat_mensaje_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatMessage(payload.payload);
    }
  });

  // 9. Escuchar eliminación global de mensajes de chat
  globalSyncChannel.on('broadcast', { event: 'chat_mensaje_eliminado_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingChatDelete(payload.payload);
    }
  });

  // 10. Escuchar eliminación global de proyectos en tiempo real
  globalSyncChannel.on('broadcast', { event: 'proyecto_eliminado_global' }, (payload) => {
    if (payload?.payload) {
      handleIncomingProjectDeleted(payload.payload);
    }
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

  let localTree = null;
  let localSettings = null;
  if (project && project.id) {
    try {
      const rawTree = localStorage.getItem(getStorageKey(project.id));
      if (rawTree) localTree = JSON.parse(rawTree);
      const rawSettings = localStorage.getItem(getSettingsKey(project.id));
      if (rawSettings) localSettings = JSON.parse(rawSettings);
    } catch (_) {}
  }

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
        createdAt: project.createdAt,
        treeData: localTree,
        settings: localSettings
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

    // Guardar catálogo y configuración para que el invitado tenga acceso inmediato completo
    if (Array.isArray(project.treeData)) {
      try {
        localStorage.setItem(getStorageKey(project.id), JSON.stringify(project.treeData));
      } catch (_) {}
    }
    if (project.settings && typeof project.settings === 'object') {
      try {
        localStorage.setItem(getSettingsKey(project.id), JSON.stringify(project.settings));
      } catch (_) {}
    }
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
 * Emitir broadcast cuando un proyecto es eliminado definitivamente
 */
export function broadcastProjectDeleted(projectId, ownerEmail = null) {
  if (!projectId) return;
  const currentUser = getCurrentUser();
  const payload = {
    projectId,
    ownerEmail: (ownerEmail || currentUser?.email || '').toLowerCase().trim(),
    deletedBy: (currentUser?.email || '').toLowerCase().trim(),
    timestamp: Date.now()
  };

  // 0. Enviar localmente a otras pestañas/ventanas del navegador (0ms latencia)
  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage({
        type: 'proyecto_eliminado',
        payload
      });
    } catch (_) {}
  }

  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) return;

  // 1. Enviar vía canal de la obra si está activo
  if (activeChannel && currentSubscribedProjectId === projectId) {
    try {
      activeChannel.send({
        type: 'broadcast',
        event: 'proyecto_eliminado',
        payload
      });
    } catch (err) {
      console.warn('[Realtime] Aviso al emitir eliminación en canal de obra:', err);
    }
  }

  // 2. Enviar vía canal global para sincronizar ventanas, dashboard y todos los colaboradores
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (globalSyncChannel) {
    try {
      globalSyncChannel.send({
        type: 'broadcast',
        event: 'proyecto_eliminado_global',
        payload
      });
    } catch (err) {
      console.warn('[Realtime] Aviso al emitir eliminación en canal global:', err);
    }
  }
}

/**
 * Procesar eliminación entrante de proyecto emitida por otro usuario en tiempo real
 */
export function handleIncomingProjectDeleted(data) {
  if (!data || !data.projectId) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const deletedBy = (data.deletedBy || '').toLowerCase().trim();

  // Si fue emitido por nosotros mismos, ignorar (ya se procesó en deleteProject)
  if (deletedBy && deletedBy === myEmail) {
    return;
  }

  const projectId = data.projectId;
  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;

  // 1. Marcar como eliminado localmente para que getProjectsList() nunca lo vuelva a incluir
  if (typeof markProjectDeleted === 'function') {
    markProjectDeleted(projectId);
  } else {
    try {
      const raw = localStorage.getItem('cubikar_deleted_projects_v1');
      let list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      if (!list.includes(projectId)) {
        list.push(projectId);
        localStorage.setItem('cubikar_deleted_projects_v1', JSON.stringify(list));
      }
    } catch (_) {}
  }

  // 2. Limpiar de la lista en memoria y localStorage
  const allProjects = getProjectsList();
  const filtered = allProjects.filter(p => p.id !== projectId && p.cloudId !== projectId);
  if (filtered.length !== allProjects.length) {
    saveProjectsList(filtered);
  }

  // 3. Limpiar almacenamiento asociado
  try {
    localStorage.removeItem(getSettingsKey(projectId));
    localStorage.removeItem(getStorageKey(projectId));
    localStorage.removeItem(`estimaciones_data_${projectId}`);
    localStorage.removeItem(`adm_const_chat_${projectId}`);
    localStorage.removeItem(`control_obra_chat_${projectId}`);
    localStorage.removeItem(`adm_const_signatures_${projectId}`);
    localStorage.removeItem(`adm_const_bitacora_${projectId}`);
    localStorage.removeItem(`adm_const_expenses_${projectId}`);
    localStorage.removeItem(`adm_const_suppliers_${projectId}`);
  } catch (_) {}

  // 4. Limpiar del cubikar_cloud_state_v2 del usuario
  if (currentUser.user_metadata?.cubikar_cloud_state_v2) {
    const cs = currentUser.user_metadata.cubikar_cloud_state_v2;
    let modified = false;
    if (Array.isArray(cs.collaboratedProjects)) {
      const prevLen = cs.collaboratedProjects.length;
      cs.collaboratedProjects = cs.collaboratedProjects.filter(p => p.id !== projectId && p.cloudId !== projectId);
      if (cs.collaboratedProjects.length !== prevLen) modified = true;
    }
    if (Array.isArray(cs.ownedProjects)) {
      const prevLen = cs.ownedProjects.length;
      cs.ownedProjects = cs.ownedProjects.filter(p => p.id !== projectId && p.cloudId !== projectId);
      if (cs.ownedProjects.length !== prevLen) modified = true;
    }
    if (modified) {
      saveCurrentUser(currentUser);
      if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
        window.syncUserCollaborationToCloud(currentUser);
      }
    }
  }

  // 5. Si el usuario estaba dentro de este proyecto, expulsarlo cordialmente al portal
  if (currentPId && (currentPId === projectId)) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Este proyecto fue eliminado por su propietario.', 'warning');
    }
    setTimeout(() => {
      if (typeof window.exitProjectToPortal === 'function') {
        window.exitProjectToPortal();
      } else {
        window.location.reload();
      }
    }, 1200);
  }

  // 6. Refrescar interfaz del dashboard de proyectos inmediatamente
  if (typeof window !== 'undefined') {
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
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

  // Buscar proyectos donde targetEmail sea miembro O donde targetEmail sea el dueño y yo sea miembro
  const allProjects = getProjectsList();
  const myProjectsForTarget = allProjects.filter(p => {
    const isTargetMember = Array.isArray(p.members) && p.members.some(m => (m.email || '').toLowerCase().trim() === targetEmail);
    const isTargetOwner = (p.ownerEmail || '').toLowerCase().trim() === targetEmail;
    return isTargetMember || isTargetOwner;
  }).map(p => {
    let localTree = null;
    let localSettings = null;
    let localChat = null;
    try {
      const rawTree = localStorage.getItem(getStorageKey(p.id));
      if (rawTree) localTree = JSON.parse(rawTree);
      const rawSettings = localStorage.getItem(getSettingsKey(p.id));
      if (rawSettings) localSettings = JSON.parse(rawSettings);
      const rawChat = localStorage.getItem(resolveChatStorageKey(p.id));
      if (rawChat) localChat = JSON.parse(rawChat);
    } catch (_) {}
    return {
      ...p,
      treeData: localTree,
      settings: localSettings,
      chatMessages: localChat
    };
  });

  // Incluir también invitaciones al plan
  const allPlanInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
  const myPlanInvsForTarget = allPlanInvs.filter(i => (i.email || '').toLowerCase().trim() === targetEmail);
  if (myPlanInvsForTarget.length > 0) {
    myPlanInvsForTarget.forEach(pi => {
      myProjectsForTarget.forEach(p => {
        if (!myInvsForTarget.some(inv => inv.projectId === p.id)) {
          myInvsForTarget.push({
            id: 'plan-inv-' + p.id + '-' + pi.id,
            projectId: p.id,
            projectName: p.projectName,
            companyName: p.companyName || '',
            ownerEmail: currentUser.email.toLowerCase().trim(),
            ownerName: currentUser.name || 'Anfitrión',
            ownerPlanId: pi.ownerPlanId || 'free',
            email: targetEmail,
            name: pi.name,
            role: pi.role || 'editar',
            status: 'pending',
            createdAt: pi.invitedAt || new Date().toISOString()
          });
        }
      });
    });
  }

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

  // Mergear proyectos (nuevos o actualizados por colaboradores)
  if (Array.isArray(projects) && projects.length > 0) {
    const currentProjs = getProjectsList();
    let projChanged = false;
    projects.forEach(p => {
      const idx = currentProjs.findIndex(cp => cp.id === p.id);
      if (idx < 0) {
        currentProjs.unshift(p);
        projChanged = true;
      } else {
        const localProj = currentProjs[idx];
        const localUpdated = localProj.updatedAt ? new Date(localProj.updatedAt).getTime() : 0;
        const incomingUpdated = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
        if (incomingUpdated >= localUpdated || (Array.isArray(p.treeData) && p.treeData.length > 0)) {
          currentProjs[idx] = Object.assign({}, localProj, p);
          projChanged = true;
        }
      }

      if (Array.isArray(p.treeData) && p.treeData.length > 0) {
        try {
          localStorage.setItem(getStorageKey(p.id), JSON.stringify(p.treeData));
          if (typeof getActiveProjectId === 'function' && getActiveProjectId() === p.id) {
            state.treeData = JSON.parse(JSON.stringify(p.treeData));
            if (typeof window.updateGrandTotal === 'function') window.updateGrandTotal();
            if (typeof window.renderTAB1 === 'function') window.renderTAB1();
          }
        } catch (_) {}
      }
      if (p.settings && typeof p.settings === 'object') {
        try {
          localStorage.setItem(getSettingsKey(p.id), JSON.stringify(p.settings));
          if (typeof getActiveProjectId === 'function' && getActiveProjectId() === p.id) {
            state.settings = Object.assign({}, state.settings, p.settings);
          }
        } catch (_) {}
      }
      if (Array.isArray(p.chatMessages) && p.chatMessages.length > 0) {
        try {
          const chatKey = resolveChatStorageKey(p.id);
          let curChat = [];
          const rawChat = localStorage.getItem(chatKey);
          if (rawChat) curChat = JSON.parse(rawChat);
          if (!Array.isArray(curChat)) curChat = [];
          const msgMap = new Map();
          curChat.forEach(m => msgMap.set(m.id, m));
          p.chatMessages.forEach(m => msgMap.set(m.id, m));
          localStorage.setItem(chatKey, JSON.stringify(Array.from(msgMap.values())));
          if (typeof getActiveProjectId === 'function' && getActiveProjectId() === p.id) {
            if (typeof window !== 'undefined' && typeof window.renderProjectChatDock === 'function') {
              window.renderProjectChatDock();
            }
          }
        } catch (_) {}
      }
    });
    if (projChanged) {
      saveProjectsList(currentProjs);
      changed = true;
    }
  }

  if (changed) {
    try {
      if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
        window.syncUserCollaborationToCloud(currentUser);
      }
    } catch (_) {}
    if (typeof window.renderSidebarNotificationsUI === 'function') {
      window.renderSidebarNotificationsUI();
    }
    if (typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
  }
}

// =========================================================================
// SINCRONIZACIÓN DE CHAT DE PROYECTO EN TIEMPO REAL & PERSISTENCIA EN ANFITRIÓN
// =========================================================================

export function resolveChatStorageKey(projectId = null) {
  const pid = projectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null) || 'proj-default-01';
  const isArq = typeof window !== 'undefined' && (
    (window.location?.hostname || '').includes('arq') ||
    (window.location?.pathname || '').includes('ADM_ARQ')
  );
  return `${isArq ? 'adm_arq' : 'adm_const'}_project_chat_${pid}`;
}

export function handleIncomingChatMessage(data) {
  if (!data || !data.projectId || !data.message) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const authorEmail = (data.author?.email || data.message?.authorEmail || '').toLowerCase().trim();

  // Si fue emitido por nosotros mismos, ignorar (ya se guardó y renderizó localmente)
  if (authorEmail && authorEmail === myEmail) {
    return;
  }

  const projectId = data.projectId;
  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === projectId);
  if (!proj) return;

  const isOwner = (proj.ownerEmail || '').toLowerCase().trim() === myEmail;
  const isMember = Array.isArray(proj.members) && proj.members.some(m => (m.email || '').toLowerCase().trim() === myEmail);
  if (!isOwner && !isMember) return;

  // 1. Guardar mensaje en el almacenamiento local de este proyecto
  const chatKey = resolveChatStorageKey(projectId);
  let messages = [];
  try {
    const raw = localStorage.getItem(chatKey);
    if (raw) messages = JSON.parse(raw);
    if (!Array.isArray(messages)) messages = [];
  } catch (_) {
    messages = [];
  }

  // Deduplicar por id
  const exists = messages.some(m => m.id === data.message.id);
  if (!exists) {
    messages.push(data.message);
    try {
      localStorage.setItem(chatKey, JSON.stringify(messages));
    } catch (_) {}
  }

  // 2. Si el usuario actual es el anfitrión, respaldar en su estado en la nube
  if (isOwner) {
    persistChatMessageToHostCloud(projectId, data.message, proj);
  }

  // 3. Si la obra está abierta actualmente en pantalla, actualizar la interfaz del dock
  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
  if (currentPId && currentPId === projectId) {
    if (typeof window !== 'undefined' && typeof window.renderProjectChatDock === 'function') {
      window.renderProjectChatDock();
    }
    // Auto-scroll si el contenedor de mensajes existe
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        const listEl = document.getElementById('project-chat-messages-list');
        if (listEl) listEl.scrollTop = listEl.scrollHeight;
      }, 50);
    }

    // Mostrar toast informativo si el mensaje menciona al usuario
    const mentions = Array.isArray(data.message.mentions) ? data.message.mentions : [];
    const myHandle = (currentUser.name || currentUser.email).replace(/\s+/g, '');
    const isMentioned = mentions.some(m => m.toLowerCase().includes(myHandle.toLowerCase()) || m.toLowerCase().includes(myEmail));
    if (isMentioned) {
      showToast(`💬 ${data.author?.name || 'Un colaborador'} te mencionó en el chat`, 'info');
    }
  }
}

export function handleIncomingChatDelete(data) {
  if (!data || !data.projectId || !data.messageId) return;
  const currentUser = getCurrentUser();
  if (!currentUser || !currentUser.email) return;

  const myEmail = currentUser.email.toLowerCase().trim();
  const authorEmail = (data.authorEmail || '').toLowerCase().trim();
  if (authorEmail && authorEmail === myEmail) return;

  const projectId = data.projectId;
  const chatKey = resolveChatStorageKey(projectId);
  try {
    const raw = localStorage.getItem(chatKey);
    if (raw) {
      let messages = JSON.parse(raw);
      if (Array.isArray(messages)) {
        const next = messages.filter(m => m.id !== data.messageId);
        localStorage.setItem(chatKey, JSON.stringify(next));
      }
    }
  } catch (_) {}

  const currentPId = typeof getActiveProjectId === 'function' ? getActiveProjectId() : null;
  if (currentPId && currentPId === projectId) {
    if (typeof window !== 'undefined' && typeof window.renderProjectChatDock === 'function') {
      window.renderProjectChatDock();
    }
  }
}

export function broadcastChatMessage(projectId, message) {
  const pId = projectId || currentSubscribedProjectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  if (!pId || !message) return;

  const currentUser = getCurrentUser();
  const author = {
    id: currentUser?.id || null,
    email: currentUser?.email || message.authorEmail || '',
    name: currentUser?.name || message.authorName || 'Colaborador',
    avatar: currentUser?.avatar || message.authorAvatar || ''
  };

  const allProjects = getProjectsList();
  const proj = allProjects.find(p => p.id === pId);
  const ownerEmail = (proj?.ownerEmail || currentUser?.email || '').toLowerCase().trim();

  const payload = {
    projectId: pId,
    ownerEmail,
    author,
    message,
    timestamp: new Date().toISOString()
  };

  // 1. Broadcast en canal de la obra activa
  if (activeChannel && currentSubscribedProjectId === pId) {
    try {
      const res = activeChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_nuevo',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir mensaje de chat:', err));
      }
    } catch (_) {}
  }

  // 2. Broadcast en canal global de sincronización
  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (globalSyncChannel) {
    try {
      const res = globalSyncChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_global',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir mensaje global de chat:', err));
      }
    } catch (_) {}
  }

  // 3. Persistir en la cuenta del usuario anfitrión (DB y cloud state)
  persistChatMessageToHostCloud(pId, message, proj);
}

export function broadcastChatDelete(projectId, messageId) {
  const pId = projectId || currentSubscribedProjectId || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  if (!pId || !messageId) return;

  const currentUser = getCurrentUser();
  const payload = {
    projectId: pId,
    messageId,
    authorEmail: currentUser?.email || '',
    timestamp: new Date().toISOString()
  };

  if (activeChannel && currentSubscribedProjectId === pId) {
    try {
      const res = activeChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_eliminado',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir eliminación de chat:', err));
      }
    } catch (_) {}
  }

  if (!globalSyncChannel) initGlobalRealtimeSync();
  if (globalSyncChannel) {
    try {
      const res = globalSyncChannel.send({
        type: 'broadcast',
        event: 'chat_mensaje_eliminado_global',
        payload
      });
      if (res && typeof res.catch === 'function') {
        res.catch(err => console.warn('[Realtime] Error al emitir eliminación global de chat:', err));
      }
    } catch (_) {}
  }

  deleteChatMessageFromHostCloud(pId, messageId);
}

export async function persistChatMessageToHostCloud(projectId, message, proj) {
  const sb = getSupabaseClient();
  const allProjects = proj ? [proj] : getProjectsList();
  const targetProj = proj || allProjects.find(p => p.id === projectId);
  const ownerEmail = (targetProj?.ownerEmail || message?.ownerEmail || getCurrentUser()?.email || '').toLowerCase().trim();
  if (!projectId || !message) return;

  // 1. Guardar en tabla Supabase 'chat_mensajes'
  if (sb && typeof sb.from === 'function') {
    try {
      const rowId = `${projectId}__${message.id}`;
      await sb.from('chat_mensajes').upsert({
        id: rowId,
        proyecto_id: projectId,
        empresa_id: targetProj?.empresaId || null,
        owner_email: ownerEmail,
        autor_nombre: message.authorName || 'Colaborador',
        autor_email: message.authorEmail || getCurrentUser()?.email || '',
        autor_avatar_url: message.authorAvatar || '',
        mensaje: message.text || '',
        adjuntos: (message.estimaciones || []).concat(message.reportes || []),
        payload_json: message,
        created_at: message.createdAt || new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (_) {}
  }

  // 2. Si el usuario actual es el anfitrión, respaldar en su estado en la nube
  const currentUser = getCurrentUser();
  if (currentUser && (currentUser.email || '').toLowerCase().trim() === ownerEmail) {
    try {
      if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
        window.syncUserCollaborationToCloud(currentUser);
      }
    } catch (_) {}
  }
}

export async function deleteChatMessageFromHostCloud(projectId, messageId) {
  const sb = getSupabaseClient();
  if (!sb || !projectId || !messageId) return;
  try {
    const rowId = `${projectId}__${messageId}`;
    await sb.from('chat_mensajes').delete().eq('id', rowId);
  } catch (_) {}
}

export async function hydrateProjectChatFromCloud(projectId) {
  const sb = getSupabaseClient();
  if (!sb || !projectId || typeof sb.from !== 'function') return;
  try {
    const { data, error } = await sb
      .from('chat_mensajes')
      .select('*')
      .eq('proyecto_id', projectId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      const chatKey = resolveChatStorageKey(projectId);
      let localMessages = [];
      try {
        const raw = localStorage.getItem(chatKey);
        if (raw) localMessages = JSON.parse(raw);
      } catch (_) {}
      if (!Array.isArray(localMessages)) localMessages = [];

      const map = new Map();
      localMessages.forEach(m => map.set(m.id, m));
      data.forEach(row => {
        const msg = row.payload_json || {
          id: (row.id || '').split('__')[1] || row.id,
          text: row.mensaje,
          authorName: row.autor_nombre,
          authorEmail: row.autor_email,
          authorAvatar: row.autor_avatar_url,
          time: new Date(row.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
        };
        map.set(msg.id, msg);
      });

      const merged = Array.from(map.values()).sort((a, b) => {
        const tA = new Date(a.createdAt || 0).getTime();
        const tB = new Date(b.createdAt || 0).getTime();
        return tA - tB;
      });

      localStorage.setItem(chatKey, JSON.stringify(merged));
      if (typeof window !== 'undefined' && typeof window.renderProjectChatDock === 'function') {
        window.renderProjectChatDock();
      }
    }
  } catch (_) {}
}

if (typeof window !== 'undefined') {
  window.CubikarRealtime = {
    initGlobalRealtimeSync,
    subscribeToProjectRealtime,
    unsubscribeFromProjectRealtime,
    broadcastNewInvitation,
    broadcastInvitationAccepted,
    broadcastInvitationRejected,
    broadcastNewProject,
    broadcastProjectDeleted,
    handleIncomingProjectDeleted,
    broadcastProjectMutation,
    handleIncomingProjectUpdate,
    broadcastChatMessage,
    broadcastChatDelete,
    handleIncomingChatMessage,
    handleIncomingChatDelete,
    hydrateProjectChatFromCloud,
    requestPeerSync
  };
  window.broadcastProjectDeleted = broadcastProjectDeleted;
  window.handleIncomingProjectDeleted = handleIncomingProjectDeleted;
  window.subscribeToProjectRealtime = subscribeToProjectRealtime;
  window.unsubscribeFromProjectRealtime = unsubscribeFromProjectRealtime;
  window.broadcastProjectMutation = broadcastProjectMutation;
  window.handleIncomingProjectUpdate = handleIncomingProjectUpdate;
  window.broadcastChatMessage = broadcastChatMessage;
  window.broadcastChatDelete = broadcastChatDelete;
}
