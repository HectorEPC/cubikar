// js/core/realtimeSync.js
// Sincronización en tiempo real vía WebSockets (Supabase Realtime) y Colaboración en vivo

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { state } from '../state/store.js';
import { getCurrentUser } from '../modules/portal/projectService.js';
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
