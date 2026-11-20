// js/modules/chat/projectChat.js
// Ventana de Chat independiente por Proyecto (plegable y desplegable abajo a la derecha)
// conectada con Partidas de Nivel 1 (icono de alta visibilidad fa-comments),
// Usuarios Asignados (@), Estimaciones (#), Reportes (!) y Notificaciones de Menciones en la barra lateral izquierda.

import { state } from '../../state/store.js?v=20261119_cf41';
import { getActiveProjectId } from '../../config/constants.js?v=20261119_cf41';
import {
  getProjectById,
  getProjectByIdReadOnly,
  getProjectsList,
  getProjectsListReadOnly,
  getCurrentUser,
  saveCurrentUser,
  getLastKnownUser,
  AVATARS_BY_SEX,
  getPendingInvitationsForUser,
  acceptProjectInvitation,
  rejectProjectInvitation,
  getStoredInvitations,
  saveStoredInvitations,
  getStoredPlanInvitations,
  saveStoredPlanInvitations,
  getDeletedProjectsList,
  canCurrentUserEditProject,
  getUserRoleInProject
} from '../portal/projectService.js?v=20261119_cf41';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js?v=20261119_cf41';
import { buildFallbackAvatarSvg } from '../../core/authService.js?v=20261119_cf41';
import { loadEstimacionesData, setActiveEstimacionId } from '../estimaciones/estimacionesModel.js?v=20261119_cf41';
import { getExpensesRecords } from '../compras/expensesModel.js?v=20261119_cf41';
import { getWarehouseStockSummary } from '../almacen/almacenModel.js?v=20261119_cf41';
import { showToast } from '../../ui/notifications.js?v=20261119_cf41';
import { getActiveUserConsumptionAlert } from '../admin/cubikarAdmin.js?v=20261119_cf41';
import { openSubscriptionModal } from '../portal/subscriptionModal.js?v=20261119_cf41';
import { scheduleChatCloudSync } from '../../core/cloudModulesSyncService.js?v=20261119_cf41';
import { broadcastChatMessage, broadcastChatDelete } from '../../core/realtimeSync.js?v=20261119_cf41';

export const ALL_PROJECT_PERMISSION_TABS = ['cat', 'insumos', 'calendario', 'compras', 'almacen', 'estimaciones', 'bitacora'];

export const CHAT_CHANNEL_META = {
  todos: {
    id: 'todos',
    label: 'Todo',
    icon: 'fa-layer-group',
    iconColor: 'text-amber-400',
    activeBtn: 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200',
    btnClass: 'bg-slate-700 hover:bg-slate-600',
    dotClass: 'bg-slate-700',
    badgeClass: 'bg-slate-700',
    emptyBg: 'bg-slate-100 text-slate-700',
    subtitle: 'Canal general del proyecto (Todos los invitados)',
    placeholder: 'Escribe en Todo (visible para todos los invitados)...',
    emptyDesc: 'Conversación general abierta para <strong>todos los colaboradores</strong> del proyecto.',
    printTitle: 'BITÁCORA INTEGRAL DEL PROYECTO (TODOS LOS CANALES)',
    printSubtitle: 'Presupuesto • Calendario • Compras • Almacén • Estimaciones • Bitácora',
    filterBtnLabel: '! Reportes',
    filterBtnColor: 'bg-slate-800 text-white'
  },
  presupuesto: {
    id: 'presupuesto',
    label: 'Presupuesto',
    icon: 'fa-coins',
    iconColor: 'text-blue-400',
    activeBtn: 'bg-blue-600 text-white shadow-xs',
    btnClass: 'bg-blue-600 hover:bg-blue-500',
    dotClass: 'bg-blue-600',
    badgeClass: 'bg-blue-700',
    emptyBg: 'bg-blue-50 text-blue-600',
    subtitle: 'Catálogo Base • Insumos Base • Matrices APU',
    placeholder: 'Asiento de Presupuesto (Catálogo, Insumos, APU)...',
    emptyDesc: 'Registra acuerdos sobre <strong>Catálogo Base</strong>, <strong>Matrices APU</strong> o <strong>Insumos</strong>.',
    printTitle: 'BITÁCORA DE PRESUPUESTO BASE E INSUMOS',
    printSubtitle: 'Catálogo Base • Matrices APU • Explosión General de Insumos',
    filterBtnLabel: '! Plan de Obra',
    filterBtnColor: 'bg-blue-600 text-white'
  },
  calendario: {
    id: 'calendario',
    label: 'Calendario',
    icon: 'fa-calendar-days',
    iconColor: 'text-amber-300',
    activeBtn: 'bg-amber-600 text-white shadow-xs',
    btnClass: 'bg-amber-600 hover:bg-amber-500',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-700',
    emptyBg: 'bg-amber-50 text-amber-600',
    subtitle: 'Calendario de Obra • Cronograma Gantt',
    placeholder: 'Asiento de Calendario de Obra / Gantt...',
    emptyDesc: 'Registra acuerdos sobre <strong>Programación</strong>, <strong>Frentes</strong> y <strong>Ruta Crítica</strong>.',
    printTitle: 'BITÁCORA DE CALENDARIO Y PROGRAMACIÓN DE OBRA',
    printSubtitle: 'Cronograma Gantt • Frentes de Obra • Ruta Crítica',
    filterBtnLabel: '! Calendario',
    filterBtnColor: 'bg-amber-600 text-white'
  },
  compras: {
    id: 'compras',
    label: 'Compras',
    icon: 'fa-cart-shopping',
    iconColor: 'text-indigo-300',
    activeBtn: 'bg-indigo-600 text-white shadow-xs',
    btnClass: 'bg-indigo-600 hover:bg-indigo-500',
    dotClass: 'bg-indigo-600',
    badgeClass: 'bg-indigo-700',
    emptyBg: 'bg-indigo-50 text-indigo-600',
    subtitle: 'Compras y Pagos • Órdenes • Proveedores',
    placeholder: 'Asiento de Compras, Órdenes de Compra o Pagos...',
    emptyDesc: 'Registra autorizaciones de <strong>Órdenes de Compra</strong>, <strong>Proveedores</strong> y <strong>Pagos</strong>.',
    printTitle: 'BITÁCORA DE COMPRAS, ÓRDENES Y PAGOS',
    printSubtitle: 'Control de Egresos • Órdenes de Compra • Proveedores',
    filterBtnLabel: '$ Compras / Pagos',
    filterBtnColor: 'bg-indigo-600 text-white'
  },
  almacen: {
    id: 'almacen',
    label: 'Almacén',
    icon: 'fa-warehouse',
    iconColor: 'text-sky-300',
    activeBtn: 'bg-sky-600 text-white shadow-xs',
    btnClass: 'bg-sky-600 hover:bg-sky-500',
    dotClass: 'bg-sky-600',
    badgeClass: 'bg-sky-700',
    emptyBg: 'bg-sky-50 text-sky-600',
    subtitle: 'Almacén Físico • Recepciones • Vales de Salida',
    placeholder: 'Asiento de Almacén (Recepciones, Vales de Salida, Stock)...',
    emptyDesc: 'Registra recepciones, <strong>Vales de Salida</strong>, <strong>Resguardos de herramienta</strong> y existencias físicas.',
    printTitle: 'BITÁCORA FÍSICA DE ALMACÉN Y BODEGA',
    printSubtitle: 'Recepciones Físicas • Existencias en Bodega • Vales de Salida (Sin precios)',
    filterBtnLabel: '📦 Materiales / Reporte',
    filterBtnColor: 'bg-sky-600 text-white'
  },
  estimaciones: {
    id: 'estimaciones',
    label: 'Estimaciones',
    icon: 'fa-file-invoice-dollar',
    iconColor: 'text-emerald-300',
    activeBtn: 'bg-emerald-600 text-white shadow-xs',
    btnClass: 'bg-emerald-600 hover:bg-emerald-500',
    dotClass: 'bg-emerald-600',
    badgeClass: 'bg-emerald-700',
    emptyBg: 'bg-emerald-50 text-emerald-600',
    subtitle: 'Estimaciones de Avance • Generadores • Cobros',
    placeholder: 'Asiento de Estimaciones de Obra...',
    emptyDesc: 'Registra revisiones y autorizaciones de <strong>Estimaciones</strong> y <strong>Avances de Obra</strong>.',
    printTitle: 'BITÁCORA DE ESTIMACIONES DE OBRA',
    printSubtitle: 'Estimaciones de Avance • Volúmenes Cobrados',
    filterBtnLabel: '# Estimaciones',
    filterBtnColor: 'bg-emerald-600 text-white'
  },
  bitacora: {
    id: 'bitacora',
    label: 'Bitácora',
    icon: 'fa-book-bookmark',
    iconColor: 'text-teal-300',
    activeBtn: 'bg-teal-600 text-white shadow-xs',
    btnClass: 'bg-teal-600 hover:bg-teal-500',
    dotClass: 'bg-teal-600',
    badgeClass: 'bg-teal-700',
    emptyBg: 'bg-teal-50 text-teal-600',
    subtitle: 'Bitácora de Obra Digital y Legal',
    placeholder: 'Comentario sobre notas de Bitácora de Obra...',
    emptyDesc: 'Coordina observaciones de campo y seguimiento de <strong>Bitácora de Obra</strong>.',
    printTitle: 'BITÁCORA DE SEGUIMIENTO DE OBRA (NOTAS DE CAMPO)',
    printSubtitle: 'Bitácora de Obra Digital y Legal',
    filterBtnLabel: '! Notas Bitácora',
    filterBtnColor: 'bg-teal-600 text-white'
  }
};

let isChatDockExpanded = false; // Inicia como pequeño círculo flotante abajo a la derecha
let isChatMaximized = false; // Permite maximizar o restaurar el tamaño de la ventana del chat
let activeChatSection = 'presupuesto'; // 'todos' | 'presupuesto' | 'calendario' | 'compras' | 'almacen' | 'estimaciones' | 'bitacora'
let lastSpecificChatSection = 'presupuesto';
let userPinnedTodosSection = false;
let todoComposeTargetSection = 'todos'; // Cuando está en 'todos', permite enviar solo a 'todos' o directo a un canal específico
let activeChatFilter = 'all'; // 'all' | 'mentions' | 'estimaciones' | 'reportes'
let activePartidaFilterId = null; // ID de Partida Nivel 1 cuando se filtra con el botón de comentarios
let activeTagPickerKind = null; // 'user' | 'partida' | 'estimacion' | 'compra' | 'almacen' | 'reporte' | null
let selectedAuthorHandle = null;
let selectedNotificationsHandle = '__self__'; // '__self__' (usuario actual), 'all' o @Usuario específico
let isNotificationsPopoverOpen = false;
let highlightedMessageId = null;
let activeMentionAutocomplete = {
  open: false,
  query: '',
  matchStart: -1,
  matchEnd: -1,
  highlightIdx: 0
};
let isChannelMenuOpen = false;
let isTodoTargetMenuOpen = false;

let pendingComposerTags = {
  partidaId: null,
  mentions: [],
  estimaciones: [],
  compras: [],
  almacen: [],
  reportes: []
};

let onExternalRefreshCallback = null;
let isRefreshingFromChat = false;
let lastSentChatGuard = { text: '', ts: 0 };

export function setProjectChatRefreshCallback(cb) {
  onExternalRefreshCallback = cb;
}

function triggerExternalChatRefresh() {
  if (typeof onExternalRefreshCallback !== 'function') return;
  isRefreshingFromChat = true;
  try {
    onExternalRefreshCallback();
  } finally {
    isRefreshingFromChat = false;
  }
}

export function normalizeChatMsgId(rawId) {
  return String(rawId || '').replace(/^.*?(?:__|::)/, '');
}

function normalizeMentionToken(val) {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveCanonicalChatPid(projectId = null) {
  const rawPid = projectId || getActiveProjectId() || 'proj-default-01';
  try {
    const projects = getProjectsListReadOnly();
    if (Array.isArray(projects)) {
      const match = projects.find(p => p && (p.id === rawPid || p.cloudId === rawPid));
      if (match && match.id) return match.id;
    }
  } catch (_) {}
  return rawPid;
}

function getScopedNotifStorageKey(baseKey) {
  try {
    const email = ((getCurrentUser() || getLastKnownUser())?.email || '').toLowerCase().trim();
    return email ? `${baseKey}__${email}` : baseKey;
  } catch (_) {
    return baseKey;
  }
}

function getChatMsgTimestampMs(msg, cleanId = '') {
  if (msg && msg.createdAt) {
    const parsed = new Date(msg.createdAt).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  const idStr = cleanId || normalizeChatMsgId(msg?.id);
  const match = idStr.match(/^msg_(\d+)_/);
  if (match) return Number(match[1]);
  return NaN;
}

export function dedupeChatMessages(list) {
  if (!Array.isArray(list)) return [];
  const seenIds = new Set();
  const seenFingerprints = new Map();
  const result = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const cleanId = normalizeChatMsgId(item.id) || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (seenIds.has(cleanId)) continue;

    const authorKey = String(item.authorEmail || item.authorHandle || '').toLowerCase().trim();
    const textKey = String(item.text || '').trim();
    const timeKey = String(item.time || '').trim();
    const fp = `${authorKey}|${textKey}|${timeKey}`;
    const itemTs = getChatMsgTimestampMs(item, cleanId);

    if (textKey && seenFingerprints.has(fp)) {
      const prevTs = seenFingerprints.get(fp);
      if (!isNaN(itemTs) && !isNaN(prevTs) && Math.abs(itemTs - prevTs) < 2000) {
        continue;
      }
    }

    seenIds.add(cleanId);
    if (textKey) {
      seenFingerprints.set(fp, itemTs);
    }
    result.push({
      ...item,
      id: cleanId
    });
  }
  return result;
}

export function getChatStorageKey(projectId = null) {
  const pid = resolveCanonicalChatPid(projectId);
  return `adm_const_project_chat_${pid}`;
}

export function loadProjectChatMessages(projectId = null) {
  const pid = resolveCanonicalChatPid(projectId);
  const candidatePids = Array.from(new Set([pid, projectId || ''].filter(Boolean)));
  try {
    const pObj = getProjectByIdReadOnly(pid);
    if (pObj?.cloudId && !candidatePids.includes(pObj.cloudId)) candidatePids.push(pObj.cloudId);
  } catch (_) {}
  try {
    let raw = null;
    for (const cPid of candidatePids) {
      raw = localStorage.getItem(`adm_const_project_chat_${cPid}`);
      if (raw) break;
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return dedupeChatMessages(parsed);
    }
  } catch (e) {}
  return [];
}

export function saveProjectChatMessages(messages, projectId = null, opts = {}) {
  const pid = resolveCanonicalChatPid(projectId);
  try {
    const deduped = dedupeChatMessages(messages || []);
    localStorage.setItem(getChatStorageKey(pid), JSON.stringify(deduped));
    if (!opts?.skipCloudSync) {
      scheduleChatCloudSync(pid);
    }
  } catch (e) {}
}

export function isChatMessageReadForCurrentUser(m, projectId = null, myEmailOverride = null, readSetOverride = null) {
  if (!m || typeof m !== 'object') return true;
  const pid = resolveCanonicalChatPid(projectId);
  const myEmail = (myEmailOverride !== null
    ? myEmailOverride
    : ((getCurrentUser() || getLastKnownUser())?.email || '')
  ).toLowerCase().trim();
  const authorEmail = String(m.authorEmail || '').toLowerCase().trim();
  if (myEmail && authorEmail && authorEmail === myEmail) return true;

  const userKey = myEmail || '__local__';
  if ((m.localReadBy && m.localReadBy[userKey]) || (m.localDismissedBy && m.localDismissedBy[userKey])) {
    return true;
  }

  const readSet = readSetOverride || new Set(getReadMentionIds());
  const cleanId = normalizeChatMsgId(m.id);
  if (
    readSet.has(`${pid}:${cleanId}`) ||
    readSet.has(cleanId) ||
    readSet.has(`${pid}:${m.id}`) ||
    readSet.has(String(m.id)) ||
    (projectId && readSet.has(`${projectId}:${cleanId}`))
  ) {
    return true;
  }

  const readBy = Array.isArray(m.readBy) ? m.readBy : [];
  if (myEmail && readBy.some(r => String(r || '').toLowerCase().trim() === myEmail)) {
    return true;
  }

  if (!m.perUserRead && readBy.includes('__all__')) return true;
  if (!m.perUserRead && Boolean(m.dismissed)) return true;
  return false;
}

export function markActiveProjectChatMessagesAsRead(projectId = null) {
  try {
    const pid = resolveCanonicalChatPid(projectId);
    const currentUser = getCurrentUser() || getLastKnownUser();
    const myEmail = (currentUser?.email || '').toLowerCase().trim();
    const userKey = myEmail || '__local__';
    const msgs = loadProjectChatMessages(pid);
    if (!Array.isArray(msgs) || msgs.length === 0) return false;
    const allowedSet = new Set(getAllowedChatChannelsForUser(pid, currentUser));
    if (allowedSet.size === 0) return false;
    const readList = getReadMentionIds();
    const readSet = new Set(readList);
    let changed = false;
    let readKeysAdded = false;

    const nextMsgs = msgs.map(m => {
      if (!m || !isChatMessageVisibleToUser(m, pid, currentUser, allowedSet)) return m;
      const authorEmail = String(m.authorEmail || m.autorEmail || m.autor_email || '').toLowerCase().trim();
      if (myEmail && authorEmail && authorEmail === myEmail) {
        return m;
      }
      const cleanId = normalizeChatMsgId(m.id);
      const k1 = `${pid}:${cleanId}`;
      if (!readSet.has(k1)) {
        readSet.add(k1);
        readList.push(k1);
        readKeysAdded = true;
      }
      if (cleanId && !readSet.has(cleanId)) {
        readSet.add(cleanId);
        readList.push(cleanId);
        readKeysAdded = true;
      }
      const prevReadBy = Array.isArray(m.readBy) ? m.readBy : [];
      const hadWildcard = prevReadBy.includes('__all__');
      const needsEmail = Boolean(myEmail && !prevReadBy.some(r => r !== '__all__' && String(r || '').toLowerCase().trim() === myEmail));
      const prevLocalReadBy = (m.localReadBy && typeof m.localReadBy === 'object') ? m.localReadBy : {};
      const needsLocalRead = !prevLocalReadBy[userKey];
      if (!hadWildcard && !needsEmail && !needsLocalRead && m.perUserRead) {
        return m;
      }
      const nextReadBy = hadWildcard ? prevReadBy.filter(r => r !== '__all__') : [...prevReadBy];
      if (needsEmail) nextReadBy.push(myEmail);
      changed = true;
      return {
        ...m,
        perUserRead: true,
        localReadBy: { ...prevLocalReadBy, [userKey]: true },
        readBy: nextReadBy
      };
    });

    if (readKeysAdded && typeof localStorage !== 'undefined') {
      if (readList.length > 500) readList.splice(0, readList.length - 500);
      localStorage.setItem(getScopedNotifStorageKey(READ_MENTIONS_KEY), JSON.stringify(readList));
    }
    if (changed) {
      saveProjectChatMessages(nextMsgs, pid, { skipCloudSync: true });
    }
    if (changed || readKeysAdded) {
      syncNotificationStateToCloud();
    }
    return changed || readKeysAdded;
  } catch (e) {
    return false;
  }
}

let partidaCountsCache = null;

function getPartidaChatCountsSnapshot(rawProjectId = null) {
  const pid = resolveCanonicalChatPid(rawProjectId);
  if (!pid) return null;
  const currentUser = getCurrentUser() || getLastKnownUser();
  const myEmail = (currentUser?.email || '').toLowerCase().trim();
  const allowedChannels = getAllowedChatChannelsForUser(pid, currentUser);
  if (allowedChannels.length === 0) return null;

  let rawChat = '';
  try {
    const candidatePids = [pid];
    const pObj = getProjectByIdReadOnly(pid);
    if (pObj?.cloudId && pObj.cloudId !== pid) candidatePids.push(pObj.cloudId);
    for (const cPid of candidatePids) {
      const val = typeof localStorage !== 'undefined' ? localStorage.getItem(`adm_const_project_chat_${cPid}`) : '';
      if (val) {
        rawChat = val;
        break;
      }
    }
  } catch (_) {}

  if (!rawChat) return null;

  let rawRead = '';
  try {
    if (typeof localStorage !== 'undefined') {
      rawRead = localStorage.getItem(getScopedNotifStorageKey(READ_MENTIONS_KEY)) || '';
    }
  } catch (_) {}

  const cacheKey = `${pid}|${myEmail}|${allowedChannels.join(',')}|${rawRead}|${rawChat}`;
  if (partidaCountsCache && partidaCountsCache.key === cacheKey) {
    return partidaCountsCache;
  }

  const unreadByPartida = new Map();
  const totalByPartida = new Map();
  try {
    const parsed = JSON.parse(rawChat);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const messages = dedupeChatMessages(parsed);
      const allowedSet = new Set(allowedChannels);
      const readSet = new Set(getReadMentionIds());
      for (const m of messages) {
        if (!m || m.partidaId === null || m.partidaId === undefined || m.partidaId === '') continue;
        if (!isChatMessageVisibleToUser(m, pid, currentUser, allowedSet)) continue;
        const k = String(m.partidaId);
        totalByPartida.set(k, (totalByPartida.get(k) || 0) + 1);
        if (!isChatMessageReadForCurrentUser(m, pid, myEmail, readSet)) {
          unreadByPartida.set(k, (unreadByPartida.get(k) || 0) + 1);
        }
      }
    }
  } catch (_) {}

  partidaCountsCache = { key: cacheKey, unreadByPartida, totalByPartida };
  return partidaCountsCache;
}

export function getPartidaChatCount(partidaId) {
  if (!partidaId) return 0;
  const pid = getActiveProjectId();
  if (!pid) return 0;
  const snap = getPartidaChatCountsSnapshot(pid);
  return snap ? (snap.unreadByPartida.get(String(partidaId)) || 0) : 0;
}

export function getPartidaTotalChatCount(partidaId) {
  if (!partidaId) return 0;
  const pid = getActiveProjectId();
  if (!pid) return 0;
  const snap = getPartidaChatCountsSnapshot(pid);
  return snap ? (snap.totalByPartida.get(String(partidaId)) || 0) : 0;
}

export function isPartidaChatActive(partidaId) {
  return Boolean(isChatDockExpanded && activePartidaFilterId && String(activePartidaFilterId) === String(partidaId));
}

function escapeChatHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeChatJsArg(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Helper que devuelve el HTML del botón de comentarios de alta visibilidad para cualquier concepto o partida
export function renderPartidaNivel1ChatButton(nodeId, clave = '', descripcion = '') {
  const unreadCount = getPartidaChatCount(nodeId);
  const totalCount = getPartidaTotalChatCount(nodeId);
  const isActive = isPartidaChatActive(nodeId);
  const safeClave = escapeChatHtml(clave || '');
  const safeDesc = escapeChatHtml(String(descripcion || '').slice(0, 40));
  const safeNodeId = escapeChatJsArg(nodeId || '');

  // Diseño de alto contraste con icono vectorial fa-comments; el número solo muestra comentarios NO leídos
  let btnClasses = '';
  let iconClasses = '';
  let badgeHtml = '';

  if (isActive) {
    btnClasses = 'bg-amber-500 hover:bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-300';
    iconClasses = 'fa-solid fa-comments text-white text-[11px]';
    badgeHtml = unreadCount > 0 ? `<span class="px-1.5 py-0.2 rounded-full bg-white text-amber-800 font-mono text-[10px] font-extrabold leading-tight">${unreadCount}</span>` : '';
  } else if (unreadCount > 0) {
    btnClasses = 'bg-blue-600 hover:bg-blue-500 text-white border-blue-700 shadow-sm';
    iconClasses = 'fa-solid fa-comments text-amber-300 text-[11px]';
    badgeHtml = `<span class="px-1.5 py-0.2 rounded-full bg-white text-blue-900 font-mono text-[10px] font-extrabold leading-tight">${unreadCount}</span>`;
  } else if (totalCount > 0) {
    btnClasses = 'bg-blue-600 hover:bg-blue-500 text-white border-blue-700 shadow-sm';
    iconClasses = 'fa-solid fa-comments text-amber-300 text-[11px]';
    badgeHtml = '';
  } else {
    btnClasses = 'bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border-blue-300 hover:border-blue-700 shadow-2xs';
    iconClasses = 'fa-solid fa-comments text-[11px]';
    badgeHtml = '';
  }

  return `
    <button type="button"
            onclick="openProjectChatForPartida('${safeNodeId}', event)"
            title="Comentarios (${unreadCount > 0 ? `${unreadCount} no leídos` : `${totalCount} leídos`}): ${safeClave} ${safeDesc}"
            class="no-print inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-sans font-bold transition cursor-pointer shrink-0 ${btnClasses}">
      <i class="${iconClasses}"></i>
      ${badgeHtml}
    </button>
  `;
}

export function formatAbbreviatedUserName(fullName = '', email = '') {
  const raw = String(fullName || '').trim() || String(email || '').split('@')[0] || 'Usuario';
  const parts = raw.split(/\s+/).filter(Boolean).map(w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
  if (parts.length === 0) return 'Usuario';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} ${parts[1].charAt(0)}.`;
  const surnameCandidate = parts.length >= 4 ? parts[2] : parts[1];
  return `${parts[0]} ${surnameCandidate.charAt(0)}.`;
}

export function buildShortMentionHandle(fullName = '', email = '') {
  const shortDisp = formatAbbreviatedUserName(fullName, email);
  return '@' + shortDisp.replace(/\.$/, '').replace(/\s+/g, '.').replace(/\.+/g, '.');
}

// Obtener usuarios asignados e invitados al proyecto (incluyendo foto de perfil, nombre abreviado y pestañas)
function getAssignedProjectUsers(projectId = null) {
  const pid = resolveCanonicalChatPid(projectId);
  const proj = getProjectByIdReadOnly(pid);
  const currentUser = getCurrentUser() || getLastKnownUser();
  const curEmailLower = String(currentUser?.email || '').toLowerCase().trim();
  const seenEmails = new Set();
  const rawMembers = [];

  const pushRawMember = (m) => {
    if (!m || typeof m !== 'object') return;
    const em = String(m.email || '').toLowerCase().trim();
    if (em) {
      if (seenEmails.has(em)) return;
      seenEmails.add(em);
    }
    rawMembers.push(m);
  };

  if (proj && proj.ownerEmail) {
    const ownerEm = String(proj.ownerEmail || '').toLowerCase().trim();
    const ownerMatchesCur = curEmailLower && curEmailLower === ownerEm;
    pushRawMember({
      id: `mem-${proj.ownerEmail}`,
      name: (ownerMatchesCur && currentUser?.name) || proj.ownerName || proj.ownerEmail.split('@')[0],
      email: proj.ownerEmail,
      avatar: (ownerMatchesCur && currentUser?.avatar) || proj.ownerAvatar || '',
      role: 'editar',
      isOwner: true,
      status: 'accepted',
      allowedTabs: [...ALL_PROJECT_PERMISSION_TABS]
    });
  }
  if (proj && Array.isArray(proj.members)) {
    proj.members.forEach(pushRawMember);
  }
  // Complementar con invitaciones registradas aún pendientes de sincronizarse en proj.members
  try {
    const storedInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
    (Array.isArray(storedInvs) ? storedInvs : []).forEach(inv => {
      if (!inv || inv.status === 'rejected') return;
      const invPid = resolveCanonicalChatPid(inv.projectId || '');
      if (invPid !== pid && inv.projectId !== proj?.cloudId) return;
      pushRawMember({
        id: `inv-${inv.id || inv.toEmail || inv.email}`,
        name: inv.toName || inv.name || (inv.toEmail || inv.email || 'Invitado').split('@')[0],
        email: inv.toEmail || inv.email || '',
        avatar: inv.avatar || '',
        role: inv.role || 'escribir',
        status: inv.status || 'pending',
        allowedTabs: Array.isArray(inv.allowedTabs) ? [...inv.allowedTabs] : null
      });
    });
  } catch (_) {}

  if (rawMembers.length === 0) {
    pushRawMember({
      id: 'mem-owner',
      name: (currentUser && currentUser.name) || 'Administrador de Obra',
      email: (currentUser && currentUser.email) || 'admin@constructora.com',
      avatar: (currentUser && currentUser.avatar) || '',
      role: 'editar',
      isOwner: true,
      status: 'accepted',
      allowedTabs: [...ALL_PROJECT_PERMISSION_TABS]
    });
  }

  return rawMembers.map(m => {
    const cleanName = (m.name || 'Usuario').trim();
    const shortName = formatAbbreviatedUserName(cleanName, m.email);
    const shortHandle = buildShortMentionHandle(cleanName, m.email);
    const fullHandle = '@' + cleanName.replace(/\s+/g, '.');
    const parts = cleanName.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : cleanName.slice(0, 2).toUpperCase();
    const roleLabel = m.isOwner
      ? 'Propietario'
      : (m.role === 'editar' ? 'Editar' : (m.role === 'escribir' ? 'Escribir' : 'Consultar'));
    const allowedTabs = Array.isArray(m.allowedTabs)
      ? m.allowedTabs
      : (m.role === 'editar' ? [...ALL_PROJECT_PERMISSION_TABS] : []);
    const isFullMember = Boolean(m.isOwner) || ALL_PROJECT_PERMISSION_TABS.every(t =>
      t === 'presupuesto'
        ? (allowedTabs.includes('presupuesto') || allowedTabs.includes('cat') || allowedTabs.includes('insumos'))
        : allowedTabs.includes(t)
    );
    const areaLabels = [];
    if (allowedTabs.includes('cat') || allowedTabs.includes('insumos') || allowedTabs.includes('presupuesto')) areaLabels.push('Presupuesto');
    if (allowedTabs.includes('calendario')) areaLabels.push('Calendario');
    if (allowedTabs.includes('compras')) areaLabels.push('Compras');
    if (allowedTabs.includes('almacen')) areaLabels.push('Almacén');
    if (allowedTabs.includes('estimaciones')) areaLabels.push('Estimaciones');
    if (allowedTabs.includes('bitacora')) areaLabels.push('Bitácora');

    const emLower = String(m.email || '').toLowerCase().trim();
    const resolvedAvatar = m.avatar ||
      (curEmailLower && emLower === curEmailLower && currentUser?.avatar) ||
      buildFallbackAvatarSvg(cleanName, m.email) ||
      AVATARS_BY_SEX['Masculino'];

    return {
      id: m.id || m.email || cleanName,
      name: cleanName,
      shortName,
      shortHandle,
      handle: fullHandle,
      email: m.email || '',
      avatar: resolvedAvatar,
      initials,
      role: m.role || 'leer',
      roleLabel,
      status: m.status || 'accepted',
      isOwner: Boolean(m.isOwner),
      allowedTabs,
      isFullMember,
      tabsSummary: isFullMember ? 'Todas' : (areaLabels.join(', ') || 'Sin pestañas')
    };
  });
}

// Usuarios autorizados o invitados específicamente en una pestaña / canal de chat
export function getUsersForChatSection(section = null, projectId = null) {
  const pid = resolveCanonicalChatPid(projectId);
  const allUsers = getAssignedProjectUsers(pid);
  const targetSection = section || activeChatSection || 'todos';
  return allUsers.filter(u => {
    if (u.status === 'rejected') return false;
    if (targetSection === 'todos') return true;
    if (u.isOwner) return true;
    const tabs = Array.isArray(u.allowedTabs) ? u.allowedTabs : [];
    if (targetSection === 'presupuesto') {
      return tabs.includes('presupuesto') || tabs.includes('cat') || tabs.includes('insumos');
    }
    return tabs.includes(targetSection);
  });
}

function sortChatMessagesChronologically(list = []) {
  return [...(Array.isArray(list) ? list : [])]
    .map((m, idx) => ({ m, idx, ts: getChatMsgTimestampMs(m) }))
    .sort((a, b) => {
      const aOk = !isNaN(a.ts);
      const bOk = !isNaN(b.ts);
      if (aOk && bOk && a.ts !== b.ts) return a.ts - b.ts;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return a.idx - b.idx;
    })
    .map(x => x.m);
}

// Obtener el @handle del usuario activo
function getActiveUserHandle(users = null) {
  const list = users || getAssignedProjectUsers();
  const currentUser = getCurrentUser() || getLastKnownUser();
  if (selectedNotificationsHandle && list.some(u => u.handle === selectedNotificationsHandle)) {
    return selectedNotificationsHandle;
  }
  if ( currentUser ) {
    const byEmail = list.find(u => u.email && currentUser.email && u.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim());
    if (byEmail) return byEmail.handle;
    const byName = list.find(u => u.name && currentUser.name && u.name.toLowerCase().trim() === currentUser.name.toLowerCase().trim());
    if (byName) return byName.handle;
  }
  if (selectedAuthorHandle && list.some(u => u.handle === selectedAuthorHandle)) {
    return selectedAuthorHandle;
  }
  return list[0] ? list[0].handle : '@Admin';
}

// Obtener todos los nodos (partidas, sub-partidas y conceptos de cualquier nivel) del catálogo activo
function getAllCatalogNodes() {
  const result = [];
  function walk(nodes, level = 1) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((node) => {
      if (!node) return;
      const isParent = Array.isArray(node.children) && node.children.length > 0;
      result.push({
        id: String(node.id),
        clave: node.clave || String(level),
        descripcion: node.descripcion || (level === 1 ? 'PARTIDA NIVEL 1' : 'CONCEPTO'),
        level,
        isParent
      });
      if (isParent) {
        walk(node.children, level + 1);
      }
    });
  }
  walk(state.treeData, 1);
  return result;
}

function evaluateProjTabAccess(proj, tabId, user) {
  if (!user || !user.email) {
    return !proj || !proj.ownerEmail;
  }
  const uEmail = String(user.email).toLowerCase().trim();
  if (!proj) return false;

  const ownerEmail = String(proj.ownerEmail || '').toLowerCase().trim();
  if (ownerEmail && ownerEmail === uEmail) return true;

  if (!Array.isArray(proj.members) || proj.members.length === 0) return false;
  const mem = proj.members.find(m => m && m.email && String(m.email).toLowerCase().trim() === uEmail);
  if (!mem || mem.status === 'pending' || mem.status === 'rejected') return false;

  if (Array.isArray(mem.allowedTabs)) {
    if (tabId === 'presupuesto') {
      return mem.allowedTabs.includes('presupuesto') || mem.allowedTabs.includes('cat') || mem.allowedTabs.includes('insumos');
    }
    return mem.allowedTabs.includes(tabId);
  }
  return mem.role === 'editar';
}

// Validar acceso de un usuario a una pestaña del proyecto (consistente con portalController.canCurrentUserAccessTab)
export function canUserAccessTabInProject(tabId, projectId = null, userOverride = null) {
  const user = userOverride || getCurrentUser() || getLastKnownUser();
  const pid = resolveCanonicalChatPid(projectId);
  const proj = getProjectByIdReadOnly(pid);
  return evaluateProjTabAccess(proj, tabId, user);
}

// El usuario solo tiene acceso a "Todo" el chat si posee acceso a TODAS las pestañas del proyecto
export function hasFullChatAccess(projectId = null, userOverride = null) {
  const user = userOverride || getCurrentUser() || getLastKnownUser();
  const pid = resolveCanonicalChatPid(projectId);
  const proj = getProjectByIdReadOnly(pid);

  if (!user || !user.email) {
    return !proj || !proj.ownerEmail;
  }
  const uEmail = String(user.email).toLowerCase().trim();
  if (!proj) return false;

  const ownerEmail = String(proj.ownerEmail || '').toLowerCase().trim();
  if (ownerEmail && ownerEmail === uEmail) return true;

  return ALL_PROJECT_PERMISSION_TABS.every(tabId => evaluateProjTabAccess(proj, tabId, user));
}

// Determina si el usuario es propietario o miembro/invitado del proyecto (habilitado para canal general "Todo")
export function isUserProjectMemberOrOwner(projectId = null, userOverride = null) {
  const user = userOverride || getCurrentUser() || getLastKnownUser();
  const pid = resolveCanonicalChatPid(projectId);
  const proj = getProjectByIdReadOnly(pid);

  if (!user || !user.email) {
    return !proj || !proj.ownerEmail;
  }
  const uEmail = String(user.email).toLowerCase().trim();
  if (!proj) return false;

  const ownerEmail = String(proj.ownerEmail || '').toLowerCase().trim();
  if (ownerEmail && ownerEmail === uEmail) return true;

  if (!Array.isArray(proj.members)) return false;
  const mem = proj.members.find(m => m && m.email && String(m.email).toLowerCase().trim() === uEmail);
  return Boolean(mem && mem.status !== 'pending' && mem.status !== 'rejected');
}

// Canales de chat permitidos para el usuario activo según sus pestañas asignadas
// La pestaña "Todo" siempre está disponible para todo invitado/miembro del proyecto
const CHANNEL_ORDER = ['todos', 'presupuesto', 'calendario', 'compras', 'almacen', 'estimaciones', 'bitacora'];
const SPECIFIC_CHANNEL_TABS = ['presupuesto', 'calendario', 'compras', 'almacen', 'estimaciones', 'bitacora'];

export function getAllowedChatChannelsForUser(projectId = null, userOverride = null) {
  const pid = resolveCanonicalChatPid(projectId);
  const user = userOverride || getCurrentUser() || getLastKnownUser();
  const proj = getProjectByIdReadOnly(pid);

  if (!user || !user.email) {
    return (!proj || !proj.ownerEmail) ? [...CHANNEL_ORDER] : [];
  }
  if (!proj) return [];

  const uEmail = String(user.email).toLowerCase().trim();
  const ownerEmail = String(proj.ownerEmail || '').toLowerCase().trim();
  if (ownerEmail && ownerEmail === uEmail) {
    return [...CHANNEL_ORDER];
  }

  if (!Array.isArray(proj.members)) return [];
  const mem = proj.members.find(m => m && m.email && String(m.email).toLowerCase().trim() === uEmail);
  if (!mem || mem.status === 'pending' || mem.status === 'rejected') {
    return [];
  }

  const channels = ['todos'];
  if (Array.isArray(mem.allowedTabs)) {
    const allowedSet = new Set(mem.allowedTabs);
    if (allowedSet.has('presupuesto') || allowedSet.has('cat') || allowedSet.has('insumos')) {
      channels.push('presupuesto');
    }
    for (let i = 1; i < SPECIFIC_CHANNEL_TABS.length; i++) {
      const ch = SPECIFIC_CHANNEL_TABS[i];
      if (allowedSet.has(ch)) channels.push(ch);
    }
  } else if (mem.role === 'editar') {
    channels.push(...SPECIFIC_CHANNEL_TABS);
  }
  return channels;
}

export function ensureValidActiveChatSection(projectId = null) {
  const pid = resolveCanonicalChatPid(projectId);
  const allowed = getAllowedChatChannelsForUser(pid);
  if (allowed.length === 0) return null;
  if (!allowed.includes(activeChatSection)) {
    const firstNonTodos = allowed.find(c => c !== 'todos');
    activeChatSection = firstNonTodos || allowed[0];
    userPinnedTodosSection = false;
  }
  return activeChatSection;
}

// Clasificar el canal/pestaña de chat al que pertenece cada mensaje (con retrocompatibilidad tecnico/financiero)
export function getMessageSection(msg) {
  const rawSec = String(msg?.section || '').trim().toLowerCase();
  if (rawSec === 'todos' || rawSec === 'general') return 'todos';
  if (['presupuesto', 'calendario', 'compras', 'almacen', 'estimaciones', 'bitacora'].includes(rawSec)) {
    return rawSec;
  }
  if (Array.isArray(msg?.almacen) && msg.almacen.length > 0) {
    return 'almacen';
  }
  if (rawSec === 'financiero') {
    const hasEst = Array.isArray(msg?.estimaciones) && msg.estimaciones.length > 0;
    const hasCompras = Array.isArray(msg?.compras) && msg.compras.length > 0;
    const hasCompraRep = Array.isArray(msg?.reportes) && msg.reportes.some(r => String(r).toLowerCase().includes('compra'));
    if ((hasCompras || hasCompraRep) && !hasEst) return 'compras';
    return 'estimaciones';
  }
  if (rawSec === 'tecnico') {
    if (Array.isArray(msg?.reportes)) {
      if (msg.reportes.some(r => {
        const l = String(r).toLowerCase();
        return l.includes('calendario') || l.includes('gantt');
      })) return 'calendario';
      if (msg.reportes.some(r => String(r).toLowerCase().includes('bitacora') || String(r).toLowerCase().includes('bitácora'))) {
        return 'bitacora';
      }
    }
    return 'presupuesto';
  }
  if (msg && Array.isArray(msg.estimaciones) && msg.estimaciones.length > 0) return 'estimaciones';
  if (msg && Array.isArray(msg.compras) && msg.compras.length > 0) return 'compras';
  return 'presupuesto';
}

export function isChatMessageVisibleToUser(msg, projectId = null, userOverride = null, allowedChannelsSetOverride = null) {
  if (!msg) return false;
  const sec = getMessageSection(msg);
  if (allowedChannelsSetOverride) {
    if (allowedChannelsSetOverride.size === 0) return false;
    return allowedChannelsSetOverride.has(sec);
  }
  const pid = resolveCanonicalChatPid(projectId);
  const allowed = getAllowedChatChannelsForUser(pid, userOverride);
  if (allowed.length === 0) return false;
  return allowed.includes(sec);
}

// Obtener las Estimaciones reales del proyecto activo
function getProjectEstimacionesTags() {
  try {
    const estData = loadEstimacionesData();
    if (estData && Array.isArray(estData.estimaciones)) {
      return estData.estimaciones.map(e => ({
        id: e.id,
        numero: e.numero,
        label: `#Estimación No. ${e.numero}`,
        locked: Boolean(e.locked)
      }));
    }
  } catch (e) {}
  return [{ id: 'est_1', numero: 1, label: '#Estimación No. 1', locked: false }];
}

// Obtener compras/pagos recientes para etiquetar en el canal de Compras
function getProjectComprasTags() {
  try {
    const records = getExpensesRecords() || [];
    if (Array.isArray(records) && records.length > 0) {
      return records.slice(0, 15).map(r => ({
        id: r.id,
        label: `$${r.id.toUpperCase()}: ${(r.concept || r.description || 'Gasto/Compra').slice(0, 24)}`,
        status: r.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'
      }));
    }
  } catch (e) {}
  return [
    { id: 'compra_gral', label: '$Compras y Egresos de Obra', status: 'General' }
  ];
}

// Obtener materiales físicos disponibles en bodega (SIN precios ni montos) para etiquetar en Almacén
function getProjectAlmacenTags() {
  try {
    const stockSummary = getWarehouseStockSummary();
    const items = Array.isArray(stockSummary?.items) ? stockSummary.items : [];
    if (items.length > 0) {
      return items.slice(0, 20).map(item => ({
        id: item.insumoKey,
        label: `📦 ${(item.description || 'Material').slice(0, 26)}`,
        stockLabel: `${Number(item.availableStock || 0).toFixed(2)} ${item.unit || 'pza'}`
      }));
    }
  } catch (e) {}
  return [
    { id: 'alm_gral', label: '📦 Control Físico de Bodega', stockLabel: 'Almacén' }
  ];
}

// Reportes disponibles para etiquetar según canal
function getProjectReportesTags(section = 'presupuesto') {
  if (section === 'todos') {
    return [
      { id: 'cat', label: '!Catálogo Base / Matrices APU' },
      { id: 'insumos', label: '!Explosión General de Insumos' },
      { id: 'calendario', label: '!Calendario de Obra / Gantt' },
      { id: 'compras', label: '!Reporte de Compras y Pagos' },
      { id: 'almacen', label: '!Inventario Físico y Vales Almacén' },
      { id: 'estimaciones', label: '!Reporte de Estimaciones y Cobros' },
      { id: 'bitacora', label: '!Bitácora de Obra' }
    ];
  }
  if (section === 'calendario') {
    return [{ id: 'calendario', label: '!Calendario de Obra / Gantt' }];
  }
  if (section === 'compras') {
    return [{ id: 'compras', label: '!Reporte de Egresos, Compras y Pagos' }];
  }
  if (section === 'almacen') {
    return [
      { id: 'almacen', label: '!Inventario Físico en Bodega' },
      { id: 'almacen', label: '!Vales de Salida y Recepciones' }
    ];
  }
  if (section === 'estimaciones') {
    return [{ id: 'estimaciones', label: '!Reporte de Estimaciones y Cobros' }];
  }
  if (section === 'bitacora') {
    return [{ id: 'bitacora', label: '!Bitácora de Obra Digital y Legal' }];
  }
  return [
    { id: 'cat', label: '!Catálogo Base / Matrices APU' },
    { id: 'insumos', label: '!Explosión General de Insumos' }
  ];
}

// Obtener todos los proyectos registrados + proyecto activo + cualquier clave de chat existente en localStorage
function getAllProjectsForNotifications() {
  const activePid = getActiveProjectId();
  const seenIds = new Set();
  const projects = [];
  const deletedList = getDeletedProjectsList();
  const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

  const addProj = (id, name) => {
    if (!id || seenIds.has(id) || isDeleted(id)) return;
    seenIds.add(id);
    projects.push({
      id,
      projectName: name || 'Proyecto de Obra'
    });
  };

  try {
    const list = getProjectsListReadOnly() || [];
    list.forEach(p => {
      if (p && p.id && !isDeleted(p.id) && !isDeleted(p.cloudId)) {
        addProj(p.id, p.projectName);
      }
    });
  } catch (e) {}

  if (activePid) {
    const activeProjObj = getProjectByIdReadOnly(activePid);
    if (!isDeleted(activePid)) {
      addProj(activePid, activeProjObj?.projectName || state.settings?.projectName || 'Proyecto Activo');
    }
  }

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.length === 'number') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('adm_const_project_chat_') || k.startsWith('adm_const_chat_') || k.startsWith('control_obra_chat_'))) {
          const pid = k.replace('adm_const_project_chat_', '').replace('adm_const_chat_', '').replace('control_obra_chat_', '');
          if (pid && !seenIds.has(pid) && !isDeleted(pid)) {
            const pObj = getProjectByIdReadOnly(pid);
            if (pObj) {
              addProj(pid, pObj?.projectName || `Proyecto (${pid})`);
            }
          }
        }
      }
    }
  } catch (e) {}

  return projects;
}

// Extraer todas las menciones (@Usuario) de un mensaje (tanto del arreglo m.mentions como del texto)
function extractMentionsFromMessage(m) {
  if (!m) return [];
  const seen = new Set();
  const list = [];

  const pushTag = (raw) => {
    const clean = String(raw || '').trim().replace(/[.,;:!?)\]]+$/, '');
    if (!clean.startsWith('@') || clean.length < 2) return;
    const lower = normalizeMentionToken(clean);
    if (!seen.has(lower)) {
      seen.add(lower);
      list.push(clean);
    }
  };

  if (Array.isArray(m.mentions)) {
    m.mentions.forEach(pushTag);
  }

  if (m.text && typeof m.text === 'string') {
    const matches = m.text.match(/@[A-Za-z0-9_.\-áéíóúÁÉÍÓÚñÑ]+/g);
    if (matches) {
      matches.forEach(pushTag);
    }
  }

  return list;
}

// Obtener lista consolidada de usuarios asignados en el proyecto activo y en todos los proyectos (para el centro de notificaciones en Mis Proyectos de Obra y en el área de trabajo)
function getAllNotificationsUsers(scope = 'all') {
  const seen = new Set();
  const merged = [];

  const addList = (list) => {
    list.forEach(u => {
      const key = String(u.handle || '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(u);
      }
    });
  };

  addList(getAssignedProjectUsers());

  if (scope === 'all') {
    try {
      const projects = getAllProjectsForNotifications();
      projects.forEach(p => {
        if (p && p.id) {
          addList(getAssignedProjectUsers(p.id));
        }
      });
    } catch (e) {}
  }

  // También incluir cualquier @Usuario que haya sido mencionado en los mensajes del alcance
  const targetProjects = scope === 'current'
    ? [{ id: getActiveProjectId() || 'proj-default-01' }]
    : getAllProjectsForNotifications();

  targetProjects.forEach(p => {
    const msgs = loadProjectChatMessages(p.id);
    if (msgs.length === 0) return;
    const allowedSet = new Set(getAllowedChatChannelsForUser(p.id));
    if (allowedSet.size === 0) return;
    msgs.forEach(m => {
      if (!isChatMessageVisibleToUser(m, p.id, null, allowedSet)) return;
      extractMentionsFromMessage(m).forEach(tag => {
        const key = tag.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          merged.push({
            id: tag,
            name: tag.slice(1).replace(/\./g, ' '),
            handle: tag,
            roleLabel: 'Etiquetado'
          });
        }
      });
    });
  });

  return merged;
}

// =========================================================================
// NOTIFICACIONES DE MENCIONES (EN "MIS PROYECTOS DE OBRA" Y BARRA LATERAL IZQUIERDA)
// =========================================================================
const DISMISSED_NOTIFICATIONS_KEY = 'cubikar_dismissed_notifications_v1';
const READ_MENTIONS_KEY = 'cubikar_read_mentions_v1';
let notifCloudSyncTimer = null;

export function getDismissedNotificationIds() {
  try {
    if (typeof localStorage !== 'undefined') {
      const scopedKey = getScopedNotifStorageKey(DISMISSED_NOTIFICATIONS_KEY);
      const raw = localStorage.getItem(scopedKey) || (scopedKey === DISMISSED_NOTIFICATIONS_KEY ? null : localStorage.getItem(DISMISSED_NOTIFICATIONS_KEY));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}
  return [];
}

export function getReadMentionIds() {
  try {
    if (typeof localStorage !== 'undefined') {
      const scopedKey = getScopedNotifStorageKey(READ_MENTIONS_KEY);
      const raw = localStorage.getItem(scopedKey) || (scopedKey === READ_MENTIONS_KEY ? null : localStorage.getItem(READ_MENTIONS_KEY));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}
  return [];
}

let lastNotifSyncSignature = '';
let consecutiveNotifSyncFailures = 0;
let nextNotifSyncAllowedAt = 0;

export function syncNotificationStateToCloud() {
  if (typeof window === 'undefined') return;
  if (notifCloudSyncTimer) clearTimeout(notifCloudSyncTimer);
  const now = Date.now();
  const baseDelay = 1500;
  const delay = nextNotifSyncAllowedAt > now ? Math.max(baseDelay, nextNotifSyncAllowedAt - now) : baseDelay;
  notifCloudSyncTimer = setTimeout(async () => {
    notifCloudSyncTimer = null;
    try {
      const sb = getSupabaseClient();
      if (!isSupabaseConfigured() || !sb || typeof sb.auth?.updateUser !== 'function') return;
      const currentUser = getCurrentUser();
      if (!currentUser || !currentUser.id) return;

      // Mantener payload compacto en user_metadata (< 2 KB) para no inflar el JWT en cada request HTTP
      const dismissed = getDismissedNotificationIds().slice(-20).map(v => String(v || '').slice(0, 64)).filter(Boolean);
      const readIds = getReadMentionIds().slice(-20).map(v => String(v || '').slice(0, 64)).filter(Boolean);

      const nextSig = JSON.stringify({ dismissed, readIds });
      const remoteMeta = currentUser.user_metadata || {};
      const remoteDismissed = Array.isArray(remoteMeta.cubikar_dismissed_notifications) ? remoteMeta.cubikar_dismissed_notifications : [];
      const remoteRead = Array.isArray(remoteMeta.cubikar_read_mentions) ? remoteMeta.cubikar_read_mentions : [];
      const remoteHasArr = Array.isArray(remoteMeta.cubikar_dismissed_notifications) || Array.isArray(remoteMeta.cubikar_read_mentions);
      const remoteIsCompact = remoteDismissed.length <= 20 && remoteRead.length <= 20;
      const remoteSig = (remoteHasArr && remoteIsCompact)
        ? JSON.stringify({ dismissed: remoteDismissed, readIds: remoteRead })
        : '';

      if (nextSig === lastNotifSyncSignature || nextSig === remoteSig) {
        lastNotifSyncSignature = nextSig;
        return;
      }

      if (!currentUser.user_metadata) currentUser.user_metadata = {};
      currentUser.user_metadata.cubikar_dismissed_notifications = dismissed;
      currentUser.user_metadata.cubikar_read_mentions = readIds;
      if (typeof saveCurrentUser === 'function') saveCurrentUser(currentUser);

      if (typeof window.markInternalCloudAuthUpdate === 'function') {
        window.markInternalCloudAuthUpdate();
      }
      const { error } = await sb.auth.updateUser({
        data: {
          cubikar_dismissed_notifications: dismissed,
          cubikar_read_mentions: readIds
        }
      });
      if (typeof window.markInternalCloudAuthUpdate === 'function') {
        window.markInternalCloudAuthUpdate();
      }

      if (error) {
        consecutiveNotifSyncFailures++;
        const backoff = Math.min(120000, 5000 * Math.pow(2, consecutiveNotifSyncFailures - 1));
        nextNotifSyncAllowedAt = Date.now() + backoff;
        return;
      }
      consecutiveNotifSyncFailures = 0;
      nextNotifSyncAllowedAt = 0;
      lastNotifSyncSignature = nextSig;
    } catch (_) {
      consecutiveNotifSyncFailures++;
      const backoff = Math.min(120000, 5000 * Math.pow(2, consecutiveNotifSyncFailures - 1));
      nextNotifSyncAllowedAt = Date.now() + backoff;
    }
  }, delay);
}

export async function hydrateNotificationStateFromCloud(authUser = null) {
  try {
    let userMeta = authUser?.user_metadata || getCurrentUser()?.user_metadata || null;
    if (!userMeta) {
      const sb = getSupabaseClient();
      if (isSupabaseConfigured() && sb && typeof sb.auth?.getUser === 'function') {
        const { data } = await sb.auth.getUser();
        userMeta = data?.user?.user_metadata || null;
      }
    }
    if (!userMeta || typeof userMeta !== 'object') return false;

    let changed = false;
    if (Array.isArray(userMeta.cubikar_dismissed_notifications) && userMeta.cubikar_dismissed_notifications.length > 0) {
      const curDismissed = getDismissedNotificationIds();
      const mergedDismissed = Array.from(new Set([...curDismissed, ...userMeta.cubikar_dismissed_notifications])).slice(-500);
      if (mergedDismissed.length !== curDismissed.length && typeof localStorage !== 'undefined') {
        localStorage.setItem(getScopedNotifStorageKey(DISMISSED_NOTIFICATIONS_KEY), JSON.stringify(mergedDismissed));
        changed = true;
      }
    }
    if (Array.isArray(userMeta.cubikar_read_mentions) && userMeta.cubikar_read_mentions.length > 0) {
      const curRead = getReadMentionIds();
      const mergedRead = Array.from(new Set([...curRead, ...userMeta.cubikar_read_mentions])).slice(-500);
      if (mergedRead.length !== curRead.length && typeof localStorage !== 'undefined') {
        localStorage.setItem(getScopedNotifStorageKey(READ_MENTIONS_KEY), JSON.stringify(mergedRead));
        changed = true;
      }
    }
    if (changed) {
      renderSidebarNotificationsUI();
    }
    return changed;
  } catch (_) {
    return false;
  }
}

export function markNotificationDismissed(notifKey) {
  if (!notifKey) return;
  try {
    const list = getDismissedNotificationIds();
    if (!list.includes(notifKey)) {
      list.push(notifKey);
      if (list.length > 500) list.splice(0, list.length - 500);
      localStorage.setItem(getScopedNotifStorageKey(DISMISSED_NOTIFICATIONS_KEY), JSON.stringify(list));
    }
    syncNotificationStateToCloud();
  } catch (_) {}
}

export function markMentionReadKey(readKey) {
  if (!readKey) return;
  try {
    const list = getReadMentionIds();
    if (!list.includes(readKey)) {
      list.push(readKey);
      if (list.length > 500) list.splice(0, list.length - 500);
      localStorage.setItem(getScopedNotifStorageKey(READ_MENTIONS_KEY), JSON.stringify(list));
    }
    syncNotificationStateToCloud();
  } catch (_) {}
}

function getSelfMentionTokens(users = []) {
  const curUser = getCurrentUser() || getLastKnownUser();
  if (!curUser) return [];
  const tokens = new Set();
  const addTok = (val) => {
    const raw = String(val || '').toLowerCase().trim();
    const norm = normalizeMentionToken(val);
    if (raw) tokens.add(raw);
    if (norm) tokens.add(norm);
  };
  const myEmail = String(curUser.email || '').toLowerCase().trim();
  const myName = String(curUser.name || '').trim();
  const myNameNorm = normalizeMentionToken(myName);
  if (myEmail) {
    (users || []).filter(u => String(u?.email || '').toLowerCase().trim() === myEmail)
      .forEach(u => {
        if (u.handle) addTok(u.handle);
        if (u.shortHandle) addTok(u.shortHandle);
        if (u.shortName) addTok('@' + u.shortName);
      });
    const prefix = myEmail.split('@')[0];
    if (prefix) addTok('@' + prefix);
    addTok(myEmail);
  }
  if (myName) {
    (users || []).filter(u => normalizeMentionToken(u?.name) === myNameNorm)
      .forEach(u => {
        if (u.handle) addTok(u.handle);
        if (u.shortHandle) addTok(u.shortHandle);
      });
    addTok('@' + myName.replace(/\s+/g, '.'));
    addTok('@' + myName.replace(/\s+/g, ''));
    const myShort = formatAbbreviatedUserName(myName, myEmail);
    addTok(buildShortMentionHandle(myName, myEmail));
    addTok('@' + myShort);
  }
  tokens.add('@todos');
  return Array.from(tokens);
}

// scope = 'current' -> Notificaciones filtradas en el proyecto activo (Barra lateral del proyecto)
// scope = 'all'     -> Notificaciones filtradas en todos los proyectos ("Mis Proyectos de Obra")
export function getUserMentionsNotifications(targetHandle = null, scope = 'all') {
  const filterHandle = targetHandle || selectedNotificationsHandle || '__self__';
  const isAllHandles = String(filterHandle).toLowerCase() === 'all';
  const isSelfHandle = filterHandle === '__self__';
  const handleLower = normalizeMentionToken(filterHandle);
  const dismissedSet = new Set(getDismissedNotificationIds());
  const readMentionsSet = new Set(getReadMentionIds());

  const activePid = resolveCanonicalChatPid(getActiveProjectId() || 'proj-default-01');
  const activeProjObj = getProjectByIdReadOnly(activePid);
  const currentUser = getCurrentUser() || getLastKnownUser();
  const myEmail = String(currentUser?.email || '').toLowerCase().trim();
  const userKey = myEmail || '__local__';
  const projects = scope === 'current'
    ? [{
        id: activePid,
        projectName: activeProjObj?.projectName || state.settings?.projectName || 'Proyecto Activo'
      }]
    : getAllProjectsForNotifications();

  const results = [];
  projects.forEach(proj => {
    const msgs = loadProjectChatMessages(proj.id);
    if (msgs.length === 0) return;
    const allowedSet = new Set(getAllowedChatChannelsForUser(proj.id, currentUser));
    if (allowedSet.size === 0) return;
    const selfTokens = isSelfHandle ? getSelfMentionTokens(getAssignedProjectUsers(proj.id)) : [];
    msgs.forEach(m => {
      if (!isChatMessageVisibleToUser(m, proj.id, currentUser, allowedSet)) return;
      const cleanId = normalizeChatMsgId(m.id);
      if (
        (m.localDismissedBy && m.localDismissedBy[userKey]) ||
        (!m.perUserRead && m.dismissed) ||
        dismissedSet.has(`${proj.id}:${cleanId}`) ||
        dismissedSet.has(`${proj.id}:${m.id}`) ||
        dismissedSet.has(cleanId) ||
        dismissedSet.has(String(m.id))
      ) return;
      const authorEmail = String(m.authorEmail || '').toLowerCase().trim();
      if (isSelfHandle && myEmail && authorEmail && authorEmail === myEmail) return;
      const mentionsList = extractMentionsFromMessage(m);
      if (mentionsList.length === 0) return;

      const isMentioned = isAllHandles
        ? mentionsList.length > 0
        : (isSelfHandle
            ? (selfTokens.length > 0 && (
                mentionsList.some(tag => selfTokens.includes(normalizeMentionToken(tag))) ||
                (myEmail && m.text && String(m.text).toLowerCase().split(/\s+/).includes(myEmail))
              ))
            : (mentionsList.some(tag => normalizeMentionToken(tag) === handleLower)));

      if (isMentioned) {
        const readBy = Array.isArray(m.readBy) ? m.readBy : [];
        const isReadForMe = isChatMessageReadForCurrentUser(m, proj.id, myEmail, readMentionsSet);
        const isRead = isSelfHandle
          ? (isReadForMe || selfTokens.some(tok => readBy.some(h => normalizeMentionToken(h) === tok)))
          : (isReadForMe
              || (isAllHandles
                ? mentionsList.every(tag => readBy.some(h => normalizeMentionToken(h) === normalizeMentionToken(tag)))
                : readBy.some(h => normalizeMentionToken(h) === handleLower)));

        results.push({
          projectId: proj.id,
          projectName: proj.projectName || 'Proyecto de Obra',
          isCurrentProject: proj.id === activePid,
          message: m,
          mentions: mentionsList,
          isRead
        });
      }
    });
  });

  // Ordenar de más reciente a más antiguo
  return results.reverse();
}

export function toggleMentionNotificationsPopover(event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  isNotificationsPopoverOpen = !isNotificationsPopoverOpen;
  renderSidebarNotificationsUI();
}

export function closeMentionNotificationsPopover() {
  if (!isNotificationsPopoverOpen) return;
  isNotificationsPopoverOpen = false;
  renderSidebarNotificationsUI();
}

export function onNotificationsUserFilterChange(handle) {
  selectedNotificationsHandle = handle || '__self__';
  renderSidebarNotificationsUI();
}

export function markAllMentionsAsRead(scope = 'all') {
  const filterHandle = selectedNotificationsHandle || '__self__';
  const isAllHandles = String(filterHandle).toLowerCase() === 'all';
  const isSelfHandle = filterHandle === '__self__';
  const handleLower = normalizeMentionToken(filterHandle);
  const currentUser = getCurrentUser() || getLastKnownUser();
  const myEmail = String(currentUser?.email || '').toLowerCase().trim();
  const userKey = myEmail || '__local__';

  const activePid = resolveCanonicalChatPid(getActiveProjectId() || 'proj-default-01');
  const projects = scope === 'current'
    ? [{ id: activePid }]
    : getAllProjectsForNotifications();

  projects.forEach(proj => {
    const msgs = loadProjectChatMessages(proj.id);
    if (msgs.length === 0) return;
    const allowedSet = new Set(getAllowedChatChannelsForUser(proj.id, currentUser));
    if (allowedSet.size === 0) return;
    const selfTokens = isSelfHandle ? getSelfMentionTokens(getAssignedProjectUsers(proj.id)) : [];
    let changed = false;
    msgs.forEach(m => {
      if (!isChatMessageVisibleToUser(m, proj.id, currentUser, allowedSet)) return;
      const mentionsList = extractMentionsFromMessage(m);
      if (mentionsList.length === 0) return;

      const isMentioned = isAllHandles
        ? true
        : (isSelfHandle
            ? (selfTokens.length > 0 && (
                mentionsList.some(tag => selfTokens.includes(normalizeMentionToken(tag))) ||
                (myEmail && m.text && String(m.text).toLowerCase().split(/\s+/).includes(myEmail))
              ))
            : (mentionsList.some(tag => normalizeMentionToken(tag) === handleLower)));

      if (isMentioned) {
        const cleanId = normalizeChatMsgId(m.id);
        if (!Array.isArray(m.readBy)) m.readBy = [];
        m.readBy = m.readBy.filter(r => r !== '__all__');
        markMentionReadKey(`${proj.id}:${cleanId}`);
        markMentionReadKey(cleanId);
        m.perUserRead = true;
        if (!m.localReadBy || typeof m.localReadBy !== 'object') m.localReadBy = {};
        m.localReadBy[userKey] = true;
        if (isAllHandles || isSelfHandle) {
          if (myEmail && !m.readBy.some(r => String(r || '').toLowerCase().trim() === myEmail)) {
            m.readBy.push(myEmail);
          }
          changed = true;
        } else if (!m.readBy.some(h => normalizeMentionToken(h) === handleLower)) {
          m.readBy.push(filterHandle);
          changed = true;
        }
      }
    });
    if (changed) saveProjectChatMessages(msgs, proj.id, { skipCloudSync: true });
  });

  syncNotificationStateToCloud();
  renderSidebarNotificationsUI();
}

/**
 * Descartar / eliminar una notificación individual de mención
 */
export function dismissMentionNotification(projectId, msgId, event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const pid = resolveCanonicalChatPid(projectId);
  const cleanId = normalizeChatMsgId(msgId);
  const currentUser = getCurrentUser() || getLastKnownUser();
  const myEmail = String(currentUser?.email || '').toLowerCase().trim();
  const userKey = myEmail || '__local__';

  markNotificationDismissed(`${pid}:${cleanId}`);
  markNotificationDismissed(cleanId);
  markMentionReadKey(`${pid}:${cleanId}`);
  markMentionReadKey(cleanId);
  const msgs = loadProjectChatMessages(pid);
  const target = msgs.find(m => normalizeChatMsgId(m.id) === cleanId || String(m.id) === String(msgId));
  if (target) {
    target.perUserRead = true;
    if (!target.localReadBy || typeof target.localReadBy !== 'object') target.localReadBy = {};
    if (!target.localDismissedBy || typeof target.localDismissedBy !== 'object') target.localDismissedBy = {};
    target.localReadBy[userKey] = true;
    target.localDismissedBy[userKey] = true;
    if (!Array.isArray(target.readBy)) target.readBy = [];
    target.readBy = target.readBy.filter(r => r !== '__all__');
    if (myEmail && !target.readBy.includes(myEmail)) target.readBy.push(myEmail);
    saveProjectChatMessages(msgs, pid, { skipCloudSync: true });
  }
  syncNotificationStateToCloud();
  renderSidebarNotificationsUI();
  showToast('Notificación eliminada', 'info');
}

/**
 * Purgar notificaciones respetando el scope ('current' = obra actual; 'all' = todas)
 * SIN destruir ni rechazar las invitaciones reales en BD.
 */
export function purgeAllNotifications(scope = 'all') {
  const user = getCurrentUser();
  const uEmail = (user?.email || '').toLowerCase().trim();
  const userKey = uEmail || '__local__';
  const isCurrentOnly = scope === 'current';
  const activePid = resolveCanonicalChatPid(getActiveProjectId() || 'proj-default-01');

  // 1. Ocultar avisos de invitaciones únicamente en scope='all' (sin borrar ni rechazar invitaciones reales)
  if (!isCurrentOnly) {
    try {
      const pendingInvs = uEmail ? getPendingInvitationsForUser(uEmail) : [];
      pendingInvs.forEach(inv => {
        if (inv && inv.id) markNotificationDismissed(`inv:${inv.id}`);
        if (inv && inv.projectId) markNotificationDismissed(`inv_proj:${inv.projectId}:${uEmail}`);
      });
    } catch (_) {}
  }

  // 2. Marcar como leídos y descartados SOLO localmente para este usuario en el alcance seleccionado
  const targetProjects = isCurrentOnly
    ? [{ id: activePid }]
    : getAllProjectsForNotifications();

  targetProjects.forEach(proj => {
    try {
      const msgs = loadProjectChatMessages(proj.id);
      let changed = false;
      msgs.forEach(m => {
        const cleanId = normalizeChatMsgId(m.id);
        markNotificationDismissed(`${proj.id}:${cleanId}`);
        markNotificationDismissed(cleanId);
        markMentionReadKey(`${proj.id}:${cleanId}`);
        markMentionReadKey(cleanId);
        m.perUserRead = true;
        if (!m.localReadBy || typeof m.localReadBy !== 'object') m.localReadBy = {};
        if (!m.localDismissedBy || typeof m.localDismissedBy !== 'object') m.localDismissedBy = {};
        m.localReadBy[userKey] = true;
        m.localDismissedBy[userKey] = true;
        if (!Array.isArray(m.readBy)) m.readBy = [];
        m.readBy = m.readBy.filter(r => r !== '__all__');
        if (uEmail && !m.readBy.includes(uEmail)) m.readBy.push(uEmail);
        changed = true;
      });
      if (changed) saveProjectChatMessages(msgs, proj.id, { skipCloudSync: true });
    } catch (_) {}
  });

  // 3. Purgar claves locales de chat huérfanas de proyectos eliminados (solo scope='all')
  if (!isCurrentOnly) {
    try {
      if (typeof localStorage !== 'undefined') {
        const validPids = new Set(getProjectsListReadOnly().flatMap(p => [p?.id, p?.cloudId]).filter(Boolean));
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && (
            k.startsWith('adm_const_project_chat_') ||
            k.startsWith('adm_arq_project_chat_') ||
            k.startsWith('adm_const_chat_') ||
            k.startsWith('control_obra_chat_') ||
            k.startsWith('adm_arq_chat_')
          )) {
            const pid = k
              .replace('adm_const_project_chat_', '')
              .replace('adm_arq_project_chat_', '')
              .replace('adm_const_chat_', '')
              .replace('control_obra_chat_', '')
              .replace('adm_arq_chat_', '');
            if (!validPids.has(pid)) {
              localStorage.removeItem(k);
            }
          }
        }
      }
    } catch (_) {}
  }

  // 4. Sincronizar estado de lectura/descartes en la nube
  syncNotificationStateToCloud();

  // 5. Refrescar interfaz de la campana inmediatamente
  renderSidebarNotificationsUI();
  showToast('Notificaciones limpiadas exitosamente', 'info');
}

export function openMentionNotification(projectId, msgId, partidaId = '', event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }

  const activePid = resolveCanonicalChatPid(getActiveProjectId() || 'proj-default-01');
  const targetPid = resolveCanonicalChatPid(projectId || activePid);
  const cleanId = normalizeChatMsgId(msgId);
  const currentUser = getCurrentUser() || getLastKnownUser();
  const myEmail = String(currentUser?.email || '').toLowerCase().trim();
  const userKey = myEmail || '__local__';

  // Marcar este mensaje como leído SOLO para este usuario y persistir en su user_metadata
  markMentionReadKey(`${targetPid}:${cleanId}`);
  markMentionReadKey(cleanId);
  const msgs = loadProjectChatMessages(targetPid);
  const targetMsg = msgs.find(m => normalizeChatMsgId(m.id) === cleanId || String(m.id) === String(msgId));
  if (targetMsg && !isChatMessageVisibleToUser(targetMsg, targetPid)) {
    showToast('🔒 No tienes acceso al canal de chat de este mensaje.', 'warning');
    return;
  }
  const targetSection = targetMsg ? getMessageSection(targetMsg) : null;
  if (targetMsg) {
    targetMsg.perUserRead = true;
    if (!targetMsg.localReadBy || typeof targetMsg.localReadBy !== 'object') targetMsg.localReadBy = {};
    targetMsg.localReadBy[userKey] = true;
    if (!Array.isArray(targetMsg.readBy)) targetMsg.readBy = [];
    targetMsg.readBy = targetMsg.readBy.filter(r => r !== '__all__');
    if (myEmail && !targetMsg.readBy.includes(myEmail)) {
      targetMsg.readBy.push(myEmail);
    }
    saveProjectChatMessages(msgs, targetPid, { skipCloudSync: true });
  }
  syncNotificationStateToCloud();

  isNotificationsPopoverOpen = false;

  // Verificar si el usuario está en la pantalla "Mis Proyectos de Obra" (#view-portal) o en otro proyecto
  const portalEl = document.getElementById('view-portal');
  const workspaceEl = document.getElementById('workspace-container');
  const isPortalVisible = Boolean(
    portalEl &&
    !portalEl.classList.contains('hidden') &&
    portalEl.style.display !== 'none' &&
    (!workspaceEl || workspaceEl.classList.contains('hidden'))
  );

  if (targetPid !== activePid || isPortalVisible) {
    // Guardar intención de abrir el chat en ese mensaje cuando el proyecto cargue en el área de trabajo
    try {
      localStorage.setItem('adm_const_pending_chat_open', JSON.stringify({
        projectId: targetPid,
        msgId,
        section: targetSection || '',
        partidaId: partidaId || ''
      }));
    } catch (e) {}

    if (typeof window.openProjectInWorkspace === 'function') {
      window.openProjectInWorkspace(targetPid);
    }
  }

  // En el área de proyectos activa: abrir inmediatamente el chat al frente y enfocar el mensaje donde mencionaron al usuario
  isChatDockExpanded = true;
  if (targetSection) {
    const allowedTarget = getAllowedChatChannelsForUser(targetPid);
    if (allowedTarget.includes(targetSection)) {
      activeChatSection = targetSection;
    } else if (allowedTarget.length > 0) {
      activeChatSection = allowedTarget[0];
    }
  } else {
    ensureValidActiveChatSection(targetPid);
  }
  markActiveProjectChatMessagesAsRead(targetPid);
  activeChatFilter = 'all';
  activePartidaFilterId = null;
  if (partidaId) {
    pendingComposerTags.partidaId = String(partidaId);
  }
  highlightedMessageId = msgId;

  renderProjectChatDock();
  triggerExternalChatRefresh();

  setTimeout(() => {
    const msgEl = document.getElementById(`chat-msg-item-${msgId}`);
    if (msgEl && typeof msgEl.scrollIntoView === 'function') {
      msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const inp = document.getElementById('project-chat-input');
    if (inp && typeof inp.focus === 'function') {
      inp.focus();
    }
  }, 60);
}

let isAcceptInvitationInFlight = false;

export async function handleAcceptInvitationAction(invId) {
  if (isAcceptInvitationInFlight) return;
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showToast('Inicia sesión para aceptar la invitación', 'warning');
    return;
  }
  isAcceptInvitationInFlight = true;
  let result;
  try {
    result = await acceptProjectInvitation(invId, currentUser);
  } finally {
    isAcceptInvitationInFlight = false;
  }
  if (result?.ok) {
    showToast(`🎉 ¡Invitación aceptada! Accediendo a "${result.projectName}"...`);
    renderSidebarNotificationsUI();
    if (typeof window.refreshProjectsGridUI === 'function') {
      try { window.refreshProjectsGridUI(); } catch (_) {}
    }
    if (typeof window.renderPortalDashboard === 'function') {
      try { window.renderPortalDashboard(); } catch (_) {}
    }
    setTimeout(() => {
      if (result.projectId && result.projectId !== 'plan-access') {
        window.location.href = `${window.location.pathname}?project=${encodeURIComponent(result.projectId)}`;
      } else {
        window.location.reload();
      }
    }, 350);
  } else {
    showToast(result?.error || 'No se pudo aceptar la invitación', 'warning');
  }
}

export function handleRejectInvitationAction(invId) {
  markNotificationDismissed(`inv:${invId}`);
  const ok = rejectProjectInvitation(invId);
  if (ok) {
    showToast('Notificación de invitación eliminada', 'info');
    renderSidebarNotificationsUI();
    if (typeof window.refreshProjectsGridUI === 'function') {
      try { window.refreshProjectsGridUI(); } catch (_) {}
    }
    if (typeof window.renderPortalDashboard === 'function') {
      try { window.renderPortalDashboard(); } catch (_) {}
    }
  } else {
    renderSidebarNotificationsUI();
    showToast('Notificación eliminada', 'info');
  }
}

if (typeof window !== 'undefined') {
  window.handleAcceptInvitationAction = handleAcceptInvitationAction;
  window.handleRejectInvitationAction = handleRejectInvitationAction;
  window.purgeAllNotifications = purgeAllNotifications;
  window.dismissMentionNotification = dismissMentionNotification;
}

function buildNotificationsPopoverHTML(mentionsList, unreadCount, users, filterHandle, partidas, scope = 'current', pendingInvitations = [], consumptionAlert = null) {
  const isPortalScope = scope === 'all';
  const headerTitle = isPortalScope
    ? 'Notificaciones de Todos los Proyectos'
    : 'Menciones en este Proyecto';
  const headerSubtitle = isPortalScope
    ? `${unreadCount} nueva(s) • ${mentionsList.length} en todos los proyectos`
    : `${unreadCount} nueva(s) • ${mentionsList.length} en esta obra`;

  const safeFilterLabel = escapeChatHtml(filterHandle === '__self__' ? 'ti' : filterHandle);
  const emptyTitle = filterHandle === 'all'
    ? (isPortalScope ? 'Sin menciones en los proyectos' : 'Sin menciones en este proyecto')
    : `Sin menciones para ${safeFilterLabel}`;

  const emptyDesc = filterHandle === 'all'
    ? (isPortalScope
        ? 'Cuando etiqueten a un <strong>@Usuario</strong> en el Chat de cualquier proyecto, se recopilará aquí.'
        : 'Cuando etiqueten a un <strong>@Usuario</strong> en el Chat del proyecto, aparecerá aquí y al darle clic te enviará al chat.')
    : `Cuando alguien etiquete a <strong>${safeFilterLabel}</strong> en el Chat de Obra, aparecerá aquí el aviso directo.`;

  return `
    <!-- Encabezado del centro de notificaciones de menciones -->
    <div onclick="event.stopPropagation()" class="px-3.5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-400 inline-flex items-center justify-center shrink-0">
          <i class="fa-solid fa-bell text-xs"></i>
        </span>
        <div class="min-w-0">
          <h4 class="text-xs font-bold text-white truncate">${headerTitle}</h4>
          <span class="text-[10px] text-slate-400 block">${headerSubtitle}</span>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" onclick="event.stopPropagation(); purgeAllNotifications('${escapeChatHtml(escapeChatJsArg(scope))}')"
                class="px-2 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 border border-rose-500/35 text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                title="Eliminar todas las notificaciones de la campana">
          <i class="fa-solid fa-trash-can text-[9px]"></i> Eliminar todas
        </button>
        ${unreadCount > 0 ? `
          <button type="button" onclick="event.stopPropagation(); markAllMentionsAsRead('${escapeChatHtml(escapeChatJsArg(scope))}')"
                  class="px-2 py-1 rounded-lg bg-blue-600/25 hover:bg-blue-600/40 text-blue-300 border border-blue-500/30 text-[10px] font-bold cursor-pointer transition"
                  title="Marcar todas las menciones como leídas">
            ✓ Leídas
          </button>
        ` : ''}
        <button type="button" onclick="event.stopPropagation(); closeMentionNotificationsPopover()"
                class="w-6 h-6 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white inline-flex items-center justify-center cursor-pointer transition">
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>
    </div>

    <!-- ALERTA DE CONSUMO DEL PLAN (85%+) -->
    ${consumptionAlert ? `
      <div onclick="event.stopPropagation()" class="p-3 bg-gradient-to-r from-amber-950/95 via-slate-900 to-amber-950/90 border-b border-amber-500/50 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-extrabold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
            <i class="fa-solid fa-triangle-exclamation text-amber-400"></i>
            Aviso de Consumo del Plan (${Number(consumptionAlert.pct) || 0}%)
          </span>
          <span class="text-[9.5px] bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">
            ${escapeChatHtml(consumptionAlert.planName || '')}
          </span>
        </div>
        <p class="text-[11px] text-slate-200 leading-snug">
          ${escapeChatHtml(consumptionAlert.message || '')}
        </p>
        <div class="pt-1">
          <button type="button" onclick="closeMentionNotificationsPopover(); openSubscriptionModal()"
                  class="w-full py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-crown text-[11px]"></i>
            <span>${escapeChatHtml(consumptionAlert.actionLabel || 'Ver Planes')}</span>
          </button>
        </div>
      </div>
    ` : ''}

    <!-- SECCIÓN DE INVITACIONES PENDIENTES (Si hay invitaciones recibidas) -->
    ${pendingInvitations && pendingInvitations.length > 0 ? `
      <div onclick="event.stopPropagation()" class="p-3 bg-gradient-to-r from-blue-950/90 via-indigo-950/80 to-slate-900 border-b border-blue-500/40 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-extrabold text-blue-300 flex items-center gap-1.5 uppercase tracking-wider">
            <i class="fa-solid fa-envelope-open-text text-amber-400"></i>
            Invitaciones Pendientes (${pendingInvitations.length})
          </span>
          <span class="text-[9.5px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-1.5 py-0.2 rounded-full font-bold">
            Entrar a la Obra
          </span>
        </div>

        <div class="space-y-2 max-h-56 overflow-y-auto custom-scroll pr-1">
          ${pendingInvitations.map(inv => `
            <div class="p-2.5 bg-slate-950/90 border border-blue-500/40 rounded-xl space-y-2 shadow-lg">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h5 class="text-xs font-bold text-white truncate" title="${escapeChatHtml(inv.projectName || '')}">
                    📁 ${escapeChatHtml(inv.projectName || 'Proyecto')}
                  </h5>
                  <span class="text-[10.5px] text-slate-300 block truncate">
                    Invitado por: <strong class="text-amber-300">${escapeChatHtml(inv.ownerName || 'Anfitrión')}</strong>
                  </span>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${inv.role === 'editar' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-purple-500/20 text-purple-300 border border-purple-500/40'}">
                  ${inv.role === 'editar' ? '⭐ Rol: Editor' : (inv.role === 'escribir' ? '✍️ Rol: Escribir' : '👁️ Rol: Leer')}
                </span>
              </div>

              <div class="flex items-center justify-between pt-1.5 border-t border-slate-800/80 gap-2 text-xs">
                <span class="text-[10px] text-slate-400 truncate">
                  Membresía: <b class="text-slate-200">${inv.ownerPlanId ? `Plan ${escapeChatHtml(String(inv.ownerPlanId).toUpperCase())}` : 'Plan Anfitrión'}</b>
                </span>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" onclick="event.stopPropagation(); handleRejectInvitationAction('${escapeChatHtml(escapeChatJsArg(inv.id))}')"
                          class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-[10.5px] font-semibold transition cursor-pointer flex items-center gap-1"
                          title="Eliminar y descartar esta notificación de invitación">
                    <i class="fa-solid fa-trash-can text-[9px]"></i> Eliminar
                  </button>
                  <button type="button" onclick="handleAcceptInvitationAction('${escapeChatHtml(escapeChatJsArg(inv.id))}')"
                          class="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10.5px] transition shadow shadow-blue-600/30 active:scale-95 cursor-pointer flex items-center gap-1">
                    <i class="fa-solid fa-check text-[10px]"></i> Aceptar y Entrar
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Selector de usuario para consultar todas las menciones o las de un usuario en específico -->
    <div onclick="event.stopPropagation()" class="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
      <span class="text-[10.5px] text-slate-400 font-medium">Filtrar usuario:</span>
      <select onchange="onNotificationsUserFilterChange(this.value)"
              class="bg-slate-800 border border-slate-700 text-amber-300 rounded-lg px-2 py-1 text-[11px] font-bold outline-none cursor-pointer max-w-[210px]">
        <option value="__self__" ${filterHandle === '__self__' ? 'selected' : ''}>Mis menciones (@)</option>
        <option value="all" ${filterHandle === 'all' ? 'selected' : ''}>Todos los etiquetados (@)</option>
        ${users.map(u => `
          <option value="${escapeChatHtml(u.handle)}" ${u.handle === filterHandle ? 'selected' : ''}>${escapeChatHtml(u.handle)} (${escapeChatHtml(u.roleLabel || 'Asignado')})</option>
        `).join('')}
      </select>
    </div>

    <!-- Lista de notificaciones donde mencionaron al usuario -->
    <div onclick="event.stopPropagation()" class="max-h-80 overflow-y-auto custom-scroll divide-y divide-slate-800/80 bg-slate-900">
      ${mentionsList.length === 0 ? `
        <div class="p-6 text-center space-y-1.5">
          <div class="w-10 h-10 rounded-full bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <i class="fa-regular fa-bell-slash text-base"></i>
          </div>
          <p class="text-xs font-bold text-slate-300">${emptyTitle}</p>
          <p class="text-[11px] text-slate-400">${emptyDesc}</p>
        </div>
      ` : mentionsList.map(item => {
        const m = item.message;
        const pObj = m.partidaId ? partidas.find(p => String(p.id) === String(m.partidaId)) : null;
        const mentionedTags = item.mentions && item.mentions.length > 0 ? item.mentions : (m.mentions || []);
        const safeProjArg = escapeChatHtml(escapeChatJsArg(item.projectId));
        const safeMsgArg = escapeChatHtml(escapeChatJsArg(m.id));
        const safePartArg = escapeChatHtml(escapeChatJsArg(m.partidaId || ''));
        return `
          <div onclick="openMentionNotification('${safeProjArg}', '${safeMsgArg}', '${safePartArg}', event)"
               class="p-3 hover:bg-slate-800/90 transition cursor-pointer flex items-start gap-2.5 ${!item.isRead ? 'bg-blue-950/40' : ''}"
               title="Clic para abrir el chat en este mensaje">
            <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 relative">
              ${escapeChatHtml(m.authorInitials || 'US')}
              ${!item.isRead ? `<span class="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900 absolute -top-0.5 -right-0.5"></span>` : ''}
            </div>
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center justify-between gap-1.5">
                <span class="text-[11px] font-bold text-white truncate">${escapeChatHtml(m.authorHandle || m.authorName || 'Usuario')}</span>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span class="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                    <span>${escapeChatHtml(m.time || '')}</span>
                    <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                  </span>
                  <button type="button" onclick="event.stopPropagation(); dismissMentionNotification('${safeProjArg}', '${safeMsgArg}', event)"
                          class="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-slate-700/80 hover:border-rose-500/40 inline-flex items-center gap-1 text-[9.5px] font-semibold transition cursor-pointer"
                          title="Eliminar esta notificación">
                    <i class="fa-solid fa-trash-can text-[8.5px]"></i> Eliminar
                  </button>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1">
                <span class="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-800 text-slate-200 border border-slate-700 truncate max-w-[155px]">
                  📁 ${escapeChatHtml(item.projectName)}
                </span>
                ${mentionedTags.map(tag => `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-blue-500/25 text-blue-300 border border-blue-400/40">
                    🔔 ${escapeChatHtml(tag)}
                  </span>
                `).join('')}
                ${pObj ? `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 truncate max-w-[140px]">
                    /${escapeChatHtml(pObj.clave)} ${escapeChatHtml(pObj.descripcion)}
                  </span>
                ` : ''}
                ${(m.estimaciones || []).map(est => `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ${escapeChatHtml(est)}
                  </span>
                `).join('')}
              </div>

              <p class="text-xs text-slate-200 leading-snug line-clamp-2 break-words">${escapeChatHtml(m.text)}</p>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function renderSidebarNotificationsUI() {
  const badgeEl = document.getElementById('sidebar-bell-badge');
  const bellIconEl = document.getElementById('sidebar-bell-icon');
  const popoverEl = document.getElementById('sidebar-notifications-popover');

  const portalBadgeEl = document.getElementById('portal-bell-badge');
  const portalBellIconEl = document.getElementById('portal-bell-icon');
  const portalPopoverEl = document.getElementById('portal-notifications-popover');

  if (!badgeEl && !portalBadgeEl) return;

  const sessionUser = getCurrentUser();
  const currentUser = sessionUser || getLastKnownUser() || { name: 'Administrador de Obra', email: 'admin@constructora.com' };
  const notifWrapper = document.getElementById('portal-notifications-wrapper');

  // Control de visibilidad del contenedor de campana en el portal
  if (notifWrapper) {
    if (!sessionUser && !getLastKnownUser()) {
      notifWrapper.classList.add('hidden');
    } else {
      notifWrapper.classList.remove('hidden');
    }
  }

  const filterHandle = selectedNotificationsHandle || '__self__';

  // Determinar si estamos en el portal ("Mis Proyectos de Obra") o en el espacio de trabajo del proyecto
  const portalEl = document.getElementById('view-portal');
  const workspaceEl = document.getElementById('workspace-container');
  const isPortalExplicitlyHidden = Boolean(portalEl && (portalEl.classList.contains('hidden') || portalEl.style.display === 'none'));
  const isPortalVisible = Boolean(
    portalEl &&
    !portalEl.classList.contains('hidden') &&
    portalEl.style.display !== 'none' &&
    (!workspaceEl || workspaceEl.classList.contains('hidden'))
  );

  // Obtener invitaciones pendientes hacia el usuario conectado
  const pendingInvitations = (currentUser && currentUser.email) ? getPendingInvitationsForUser(currentUser.email) : [];
  const pendingInvsCount = pendingInvitations.length;
  const consumptionAlert = (currentUser && currentUser.email) ? getActiveUserConsumptionAlert(currentUser.email) : null;
  const consumptionAlertCount = consumptionAlert ? 1 : 0;

  // 1) Campana en el Área de Proyectos (barra lateral izquierda): solo calcula si el espacio de trabajo está visible o no hay portal
  let projectMentions = null;
  let projectUnreadCount = 0;
  if (badgeEl && (!isPortalVisible || isNotificationsPopoverOpen)) {
    projectMentions = getUserMentionsNotifications(filterHandle, 'current');
    projectUnreadCount = projectMentions.filter(item => !item.isRead).length + pendingInvsCount + consumptionAlertCount;
    const projectBadgeText = projectUnreadCount > 99 ? '99+' : String(projectUnreadCount);
    if (projectUnreadCount > 0) {
      badgeEl.classList.remove('hidden');
      badgeEl.textContent = projectBadgeText;
      if (bellIconEl && bellIconEl.classList) bellIconEl.classList.add('text-amber-400');
    } else {
      badgeEl.classList.add('hidden');
      badgeEl.textContent = '0';
      if (bellIconEl && bellIconEl.classList) bellIconEl.classList.remove('text-amber-400');
    }
  }

  // 2) Campana en "Mis Proyectos de Obra" (portal): evitar escanear TODOS los proyectos mientras el portal está oculto
  let allProjectsMentions = null;
  let allProjectsUnreadCount = 0;
  if (portalBadgeEl && (!isPortalExplicitlyHidden || (isPortalVisible && isNotificationsPopoverOpen))) {
    allProjectsMentions = getUserMentionsNotifications(filterHandle, 'all');
    allProjectsUnreadCount = allProjectsMentions.filter(item => !item.isRead).length + pendingInvsCount + consumptionAlertCount;
    const portalBadgeText = allProjectsUnreadCount > 99 ? '99+' : String(allProjectsUnreadCount);
    if (allProjectsUnreadCount > 0) {
      portalBadgeEl.classList.remove('hidden');
      portalBadgeEl.textContent = portalBadgeText;
      if (portalBellIconEl && portalBellIconEl.classList) portalBellIconEl.classList.add('text-amber-400');
    } else {
      portalBadgeEl.classList.add('hidden');
      portalBadgeEl.textContent = '0';
      if (portalBellIconEl && portalBellIconEl.classList) portalBellIconEl.classList.remove('text-amber-400');
    }
  }

  if (!isNotificationsPopoverOpen) {
    if (popoverEl) popoverEl.classList.add('hidden');
    if (portalPopoverEl) portalPopoverEl.classList.add('hidden');
    return;
  }

  const partidas = getAllCatalogNodes();

  if (isPortalVisible) {
    if (popoverEl) popoverEl.classList.add('hidden');
    if (portalPopoverEl) {
      if (!allProjectsMentions) {
        allProjectsMentions = getUserMentionsNotifications(filterHandle, 'all');
        allProjectsUnreadCount = allProjectsMentions.filter(item => !item.isRead).length + pendingInvsCount + consumptionAlertCount;
      }
      const allUsers = getAllNotificationsUsers('all');
      portalPopoverEl.classList.remove('hidden');
      portalPopoverEl.innerHTML = buildNotificationsPopoverHTML(
        allProjectsMentions,
        allProjectsUnreadCount,
        allUsers,
        filterHandle,
        partidas,
        'all',
        pendingInvitations,
        consumptionAlert
      );
    }
  } else {
    if (portalPopoverEl) portalPopoverEl.classList.add('hidden');
    if (popoverEl) {
      if (!projectMentions) {
        projectMentions = getUserMentionsNotifications(filterHandle, 'current');
        projectUnreadCount = projectMentions.filter(item => !item.isRead).length + pendingInvsCount + consumptionAlertCount;
      }
      const projectUsers = getAllNotificationsUsers('current');
      popoverEl.classList.remove('hidden');
      popoverEl.innerHTML = buildNotificationsPopoverHTML(
        projectMentions,
        projectUnreadCount,
        projectUsers,
        filterHandle,
        partidas,
        'current',
        pendingInvitations,
        consumptionAlert
      );
    }
  }
}

// =========================================================================
// CONTROLES DE LA VENTANA DE CHAT (ABAJO A LA DERECHA)
// =========================================================================
export function toggleProjectChatDock(forceState = null) {
  if (typeof forceState === 'boolean') {
    isChatDockExpanded = forceState;
  } else {
    isChatDockExpanded = !isChatDockExpanded;
  }
  if (isChatDockExpanded) {
    markActiveProjectChatMessagesAsRead();
  }
  renderProjectChatDock();
  if (isChatDockExpanded) {
    setTimeout(() => {
      const inp = document.getElementById('project-chat-input');
      if (inp) inp.focus();
    }, 60);
  }
}

export function toggleProjectChatMaximize(event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  isChatMaximized = !isChatMaximized;
  isChatDockExpanded = true;
  renderProjectChatDock();
  setTimeout(() => {
    const inp = document.getElementById('project-chat-input');
    if (inp) inp.focus();
  }, 40);
}

export function printProjectChatReport(sectionFilter = null, event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }

  const allowedChannels = getAllowedChatChannelsForUser();
  if (allowedChannels.length === 0) {
    showToast('🔒 No tienes acceso a ningún canal de chat para imprimir en este proyecto.', 'warning');
    return;
  }

  // Validar que la sección solicitada esté autorizada; 'todos' solo está disponible con acceso completo
  const requestedSection = sectionFilter || activeChatSection || allowedChannels[0];
  const targetSection = allowedChannels.includes(requestedSection)
    ? requestedSection
    : (allowedChannels.find(c => c !== 'todos') || allowedChannels[0]);

  const companyName = state.settings?.companyName || 'Constructora / Empresa';
  const companySubtitle = state.settings?.companySubtitle || 'Bitácora y Seguimiento de Obra';
  const projectName = state.settings?.projectName || 'Proyecto de Obra';
  const projectLocation = state.settings?.projectLocation || 'Ubicación no especificada';
  const logoSrc = state.settings?.companyLogo || '';

  const users = getAssignedProjectUsers();
  const partidas = getAllCatalogNodes();
  const allMessages = sortChatMessagesChronologically(
    loadProjectChatMessages().filter(m => isChatMessageVisibleToUser(m))
  );

  // Filtrar según contexto base (partida/tipo) y dejar el filtro por sección listo para el toolbar interactivo del reporte
  const baseMessages = allMessages.filter(m => {
    if (activePartidaFilterId && String(m.partidaId) !== String(activePartidaFilterId)) return false;
    if (activeChatFilter === 'mentions') return Array.isArray(m.mentions) && m.mentions.includes(selectedAuthorHandle);
    if (activeChatFilter === 'estimaciones') return Array.isArray(m.estimaciones) && m.estimaciones.length > 0;
    if (activeChatFilter === 'reportes') return Array.isArray(m.reportes) && m.reportes.length > 0;
    return true;
  });

  const filteredMessages = baseMessages.filter(m => {
    const sec = getMessageSection(m);
    if (targetSection !== 'todos' && sec !== targetSection) return false;
    return true;
  });

  const activePartidaObj = activePartidaFilterId
    ? partidas.find(p => String(p.id) === String(activePartidaFilterId))
    : null;

  const chMeta = CHAT_CHANNEL_META[targetSection] || CHAT_CHANNEL_META.presupuesto;
  const sectionTitle = chMeta.printTitle || 'BITÁCORA DE OBRA';
  const sectionSubtitle = chMeta.printSubtitle || chMeta.subtitle || '';

  let filterLabel = targetSection === 'todos' ? 'Bitácora Integral Completa' : `Canal ${chMeta.label}`;
  if (activePartidaObj) {
    filterLabel += ` • Concepto (N${activePartidaObj.level}): /${activePartidaObj.clave} ${activePartidaObj.descripcion}`;
  } else if (activeChatFilter === 'mentions') {
    filterLabel += ` • Menciones de ${selectedAuthorHandle || 'usuario'}`;
  } else if (activeChatFilter === 'estimaciones') {
    filterLabel += ' • Comentarios etiquetados con #Estimaciones';
  } else if (activeChatFilter === 'reportes') {
    filterLabel += ' • Comentarios etiquetados con !Reportes';
  }

  const fechaImpresion = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Resumen de participantes e interacciones
  const participantStats = new Map();
  filteredMessages.forEach(m => {
    const handle = m.authorHandle || m.authorName || 'Usuario';
    if (!participantStats.has(handle)) {
      participantStats.set(handle, {
        name: m.authorName || handle,
        handle: handle,
        role: m.authorRole || 'Asignado',
        initials: m.authorInitials || 'US',
        count: 0,
        firstTime: m.time,
        lastTime: m.time
      });
    }
    const stat = participantStats.get(handle);
    stat.count++;
    stat.lastTime = m.time;
  });

  const participantsList = Array.from(participantStats.values());

  const participantsTableHtml = participantsList.length === 0
    ? `<div style="font-size:8pt; color:#64748b; font-style:italic;">No se registran intervenciones activas de usuarios en este periodo.</div>`
    : `
      <table style="margin-bottom:14px;">
        <thead>
          <tr>
            <th style="width:30px; text-align:center;">#</th>
            <th style="width:160px;">Usuario / Autor</th>
            <th style="width:120px;">Rol Oficial</th>
            <th style="width:90px; text-align:center;">Notas Registradas</th>
            <th>Rango de Intervención</th>
          </tr>
        </thead>
        <tbody>
          ${participantsList.map((p, idx) => `
            <tr>
              <td style="text-align:center; font-weight:700; color:#475569;">${idx + 1}</td>
              <td><strong>${escapeChatHtml(p.name)}</strong> <span style="font-size:7.5pt; color:#2563eb;">(${escapeChatHtml(p.handle)})</span></td>
              <td><span style="font-size:7.5pt; padding:1px 6px; border-radius:4px; background:#e2e8f0; font-weight:700; color:#334155;">${escapeChatHtml(p.role)}</span></td>
              <td style="text-align:center; font-weight:800; color:#0f172a;">${p.count}</td>
              <td style="font-family:monospace; font-size:7.5pt; color:#475569;">${escapeChatHtml(p.firstTime || '-')} &rarr; ${escapeChatHtml(p.lastTime || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  const printSectionBadgeMap = {
    todos: { cls: 'tag-sec-tec', text: '📑 General' },
    presupuesto: { cls: 'tag-sec-tec', text: '📐 Presupuesto' },
    calendario: { cls: 'tag-partida', text: '📅 Calendario' },
    compras: { cls: 'tag-sec-fin', text: '🛒 Compras' },
    almacen: { cls: 'tag-sec-alm', text: '🏭 Almacén' },
    estimaciones: { cls: 'tag-est', text: '📊 Estimaciones' },
    bitacora: { cls: 'tag-compra', text: '📓 Bitácora' }
  };

  const rowsHtml = baseMessages.length === 0
    ? `<tr><td colspan="5" style="text-align:center; padding:18px; color:#64748b;">No hay asientos ni comentarios registrados en este canal para imprimir.</td></tr>`
    : baseMessages.map((m, idx) => {
        const sec = getMessageSection(m);
        const pObj = m.partidaId ? partidas.find(p => String(p.id) === String(m.partidaId)) : null;
        const secInfo = printSectionBadgeMap[sec] || printSectionBadgeMap.presupuesto;
        const tags = [`<span class="tag ${secInfo.cls}">${escapeChatHtml(secInfo.text)}</span>`];
        if (pObj) tags.push(`<span class="tag tag-partida">/${escapeChatHtml(pObj.clave)} ${escapeChatHtml(pObj.descripcion)}</span>`);
        (m.mentions || []).forEach(u => tags.push(`<span class="tag tag-user">${escapeChatHtml(u)}</span>`));
        (m.estimaciones || []).forEach(e => tags.push(`<span class="tag tag-est">${escapeChatHtml(e)}</span>`));
        (m.compras || []).forEach(c => tags.push(`<span class="tag tag-compra">${escapeChatHtml(c)}</span>`));
        (m.almacen || []).forEach(a => tags.push(`<span class="tag tag-sec-alm">${escapeChatHtml(a)}</span>`));
        (m.reportes || []).forEach(r => tags.push(`<span class="tag tag-rep">${escapeChatHtml(r)}</span>`));

        const hiddenAttr = (targetSection !== 'todos' && sec !== targetSection) ? ' style="display:none;"' : '';
        return `
          <tr class="chat-print-row" data-sec="${escapeChatHtml(sec)}"${hiddenAttr}>
            <td class="chat-row-idx" style="text-align:center; font-weight:700; color:#475569;">${idx + 1}</td>
            <td style="white-space:nowrap; font-family:monospace; font-size:8pt; color:#334155;">${escapeChatHtml(m.time || '-')}</td>
            <td>
              <div style="font-weight:700; color:#0f172a;">${escapeChatHtml(m.authorHandle || m.authorName || 'Usuario')}</div>
              <div style="font-size:7.5pt; color:#64748b;">${escapeChatHtml(m.authorName || '')} (${escapeChatHtml(m.authorRole || 'Asignado')})</div>
            </td>
            <td>${tags.join(' ')}</td>
            <td style="color:#0f172a; line-height:1.45;">${escapeChatHtml(m.text || '')}</td>
          </tr>
        `;
      }).join('');

  const toolbarButtonsHtml = allowedChannels.map(chId => {
    const meta = CHAT_CHANNEL_META[chId];
    const safeChJs = escapeChatHtml(escapeChatJsArg(chId));
    return `<button class="btn-filter ${targetSection === chId ? 'active' : ''}" data-filter-sec="${escapeChatHtml(chId)}" onclick="filterPrintSection('${safeChJs}')">${escapeChatHtml(meta ? meta.label : chId)}</button>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeChatHtml(sectionTitle)} - ${escapeChatHtml(projectName)}</title>
  <style>
    @page { size: letter portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 18px; color: #0f172a; background: #f8fafc; font-size: 8.5pt; }
    .toolbar {
      display: flex; justify-content: space-between; align-items: center;
      background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px;
    }
    .toolbar-left { display: flex; align-items: center; gap: 10px; }
    .toolbar-buttons { display: flex; align-items: center; gap: 6px; }
    .toolbar button {
      border: none; border-radius: 6px; padding: 6px 12px; font-weight: 700; font-size: 8.5pt; cursor: pointer; transition: 0.15s;
    }
    .btn-print { background: #2563eb; color: #fff; }
    .btn-print:hover { background: #1d4ed8; }
    .btn-filter { background: #334155; color: #e2e8f0; }
    .btn-filter.active { background: #0284c7; color: #fff; ring: 2px ring #38bdf8; }
    .btn-close { background: #475569; color: #f1f5f9; }
    .sheet {
      background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px;
      max-width: 960px; margin: 0 auto; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { max-height: 48px; max-width: 90px; object-fit: contain; }
    .meta-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 8.5pt;
    }
    .section-title {
      font-size: 9pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase;
      letter-spacing: 0.5px; border-left: 3px solid #2563eb; padding-left: 6px; margin: 14px 0 6px 0;
    }
    table { width: 100%; max-width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 8pt; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th {
      background: #0f172a; color: #fff; text-transform: uppercase; font-size: 7.5pt;
      letter-spacing: 0.3px; padding: 6px 8px; border: 1px solid #0f172a; text-align: left;
    }
    td { padding: 6px 8px; border: 1px solid #cbd5e1; vertical-align: top; font-size: 8pt; overflow-wrap: anywhere; word-break: break-word; }
    tr:nth-child(even) td { background: #f8fafc; }
    .tag {
      display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 7pt; font-weight: 700; margin: 1px 2px 1px 0;
    }
    .tag-sec-tec { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
    .tag-sec-fin { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .tag-sec-alm { background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; }
    .tag-partida { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .tag-user { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .tag-est { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .tag-compra { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .tag-rep { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
    .signatures {
      display: flex; justify-content: space-around; margin-top: 44px; padding-top: 20px; page-break-inside: avoid;
    }
    .sig-box { width: 30%; border-top: 1.5px solid #334155; text-align: center; padding-top: 6px; font-size: 7.5pt; color: #334155; }
    @media print {
      body { background: #fff !important; padding: 0 !important; margin: 0 !important; }
      .toolbar { display: none !important; }
      .sheet { border: none !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; box-shadow: none !important; border-radius: 0 !important; }
      .meta-grid, .signatures { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <strong>${escapeChatHtml(sectionTitle)}</strong>
      <span id="chat-print-toolbar-count" style="font-size:8pt; color:#94a3b8;">(${filteredMessages.length} asiento(s) de bitácora)</span>
    </div>
    <div class="toolbar-buttons">
      ${toolbarButtonsHtml}
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir / PDF</button>
      <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header">
      <div class="brand">
        ${logoSrc ? `<img src="${escapeChatHtml(logoSrc)}" alt="Logo">` : ''}
        <div>
          <div style="font-size:12.5pt; font-weight:800; color:#0f172a;">${escapeChatHtml(companyName)}</div>
          <div style="font-size:8pt; color:#475569;">${escapeChatHtml(companySubtitle)}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10pt; font-weight:800; color:#1e3a8a;">${escapeChatHtml(sectionTitle)}</div>
        <div style="font-size:7.5pt; color:#64748b;">${escapeChatHtml(sectionSubtitle)}</div>
        <div style="font-size:7.5pt; color:#64748b; margin-top:2px;">Fecha de emisión: ${escapeChatHtml(fechaImpresion)}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div><strong>Proyecto:</strong> ${escapeChatHtml(projectName)}</div>
        <div><strong>Ubicación:</strong> ${escapeChatHtml(projectLocation)}</div>
        <div><strong>Ámbito Documental:</strong> <span style="font-weight:700; color:#1e3a8a;">${escapeChatHtml(chMeta.printSubtitle || chMeta.subtitle || 'Bitácora de Obra')}</span></div>
      </div>
      <div>
        <div><strong>Filtro aplicado:</strong> ${escapeChatHtml(filterLabel)}</div>
        <div><strong>Participantes en el periodo:</strong> ${participantsList.length} involucrado(s)</div>
        <div><strong>Total de asientos:</strong> <span id="chat-print-meta-count">${filteredMessages.length}</span> registro(s)</div>
      </div>
    </div>

    <div class="section-title">1. Resumen de Participantes e Intervenciones Registradas</div>
    ${participantsTableHtml}

    <div class="section-title">2. Asientos Cronológicos de Bitácora y Mensajes de Seguimiento</div>
    <table>
      <thead>
        <tr>
          <th style="width:28px; text-align:center;">#</th>
          <th style="width:13%;">Fecha / Hora</th>
          <th style="width:17%;">Autor / Emisor</th>
          <th style="width:25%;">Ámbito y Referencias</th>
          <th>Asiento Oficial / Comentario de Seguimiento</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="signatures">
      <div class="sig-box">
        <strong>RESIDENCIA DE OBRA</strong><br>
        <span>Nombre, Firma y Cédula Profesional</span>
      </div>
      <div class="sig-box">
        <strong>SUPERVISIÓN TÉCNICA</strong><br>
        <span>Nombre y Firma de Aprobación</span>
      </div>
      <div class="sig-box">
        <strong>ADMINISTRACIÓN Y FINANZAS</strong><br>
        <span>Nombre y Firma de Validación</span>
      </div>
    </div>
  </div>

  <script>
    window.filterPrintSection = function(sec) {
      var rows = document.querySelectorAll('.chat-print-row');
      var visible = 0;
      rows.forEach(function(tr) {
        var rSec = tr.getAttribute('data-sec');
        var show = (sec === 'todos' || rSec === sec);
        tr.style.display = show ? '' : 'none';
        if (show) {
          visible++;
          var idxCell = tr.querySelector('.chat-row-idx');
          if (idxCell) idxCell.textContent = String(visible);
        }
      });
      document.querySelectorAll('.btn-filter[data-filter-sec]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-filter-sec') === sec);
      });
      var tbCount = document.getElementById('chat-print-toolbar-count');
      if (tbCount) tbCount.textContent = '(' + visible + ' asiento(s) de bitácora)';
      var metaCount = document.getElementById('chat-print-meta-count');
      if (metaCount) metaCount.textContent = String(visible);
    };
    window.filterPrintSection('${escapeChatJsArg(targetSection)}');
  </script>
</body>
</html>`;

  const printWin = window.open('', '_blank', 'width=1000,height=760,scrollbars=yes');
  if (!printWin) {
    showToast('Permite las ventanas emergentes para imprimir la bitácora del proyecto.', 'warning');
    return;
  }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

export function openProjectChatForPartida(partidaId, event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
  const allowed = getAllowedChatChannelsForUser();
  if (allowed.length === 0) {
    showToast('🔒 No tienes pestañas autorizadas para usar el chat de este proyecto.', 'warning');
    return;
  }
  const pidStr = String(partidaId);
  if (isChatDockExpanded && activePartidaFilterId === pidStr) {
    clearProjectChatPartidaFilter();
    return;
  }
  isChatDockExpanded = true;
  if (allowed.includes('presupuesto')) {
    activeChatSection = 'presupuesto';
    userPinnedTodosSection = false;
  } else {
    ensureValidActiveChatSection();
  }
  markActiveProjectChatMessagesAsRead();
  activePartidaFilterId = pidStr;
  pendingComposerTags.partidaId = pidStr;
  activeTagPickerKind = null;
  renderProjectChatDock();
  triggerExternalChatRefresh();
  setTimeout(() => {
    const inp = document.getElementById('project-chat-input');
    if (inp) inp.focus();
  }, 60);
}

export function clearProjectChatPartidaFilter() {
  activePartidaFilterId = null;
  pendingComposerTags.partidaId = null;
  renderProjectChatDock();
  triggerExternalChatRefresh();
}

export function setProjectChatFilter(filterType) {
  activeChatFilter = filterType || 'all';
  renderProjectChatDock();
}

export function onProjectChatAuthorChange(handle) {
  if (!hasFullChatAccess()) return;
  selectedAuthorHandle = handle;
  renderProjectChatDock();
  renderSidebarNotificationsUI();
}

export function toggleProjectChatTagPicker(kind) {
  if (activeTagPickerKind === kind) {
    activeTagPickerKind = null;
  } else {
    activeTagPickerKind = kind;
  }
  renderProjectChatDock();
}

export function toggleProjectChatChannelMenu(event = null) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  isChannelMenuOpen = !isChannelMenuOpen;
  isTodoTargetMenuOpen = false;
  renderProjectChatDock();
}

export function toggleProjectChatTodoTargetMenu(event = null) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  isTodoTargetMenuOpen = !isTodoTargetMenuOpen;
  isChannelMenuOpen = false;
  renderProjectChatDock();
}

export function switchProjectChatSection(section) {
  const allowed = getAllowedChatChannelsForUser();
  if (!allowed.includes(section)) {
    showToast('🔒 No tienes acceso a este canal del chat.', 'warning');
    return;
  }
  activeChatSection = section;
  if (section !== 'todos') {
    lastSpecificChatSection = section;
    todoComposeTargetSection = 'todos';
  }
  userPinnedTodosSection = section === 'todos';
  activeChatFilter = 'all';
  activeTagPickerKind = null;
  activeMentionAutocomplete.open = false;
  isChannelMenuOpen = false;
  isTodoTargetMenuOpen = false;
  renderProjectChatDock();
}

export function toggleProjectChatTodoMode() {
  const allowed = getAllowedChatChannelsForUser();
  if (!allowed.includes('todos')) return;
  if (activeChatSection === 'todos') {
    const fallback = (lastSpecificChatSection !== 'todos' && allowed.includes(lastSpecificChatSection))
      ? lastSpecificChatSection
      : (allowed.find(c => c !== 'todos') || 'todos');
    switchProjectChatSection(fallback);
  } else {
    switchProjectChatSection('todos');
  }
}

export function onTodoComposeTargetChange(targetSection) {
  const allowed = getAllowedChatChannelsForUser();
  if (!allowed.includes(targetSection)) return;
  todoComposeTargetSection = targetSection;
  activeMentionAutocomplete.highlightIdx = 0;
  activeTagPickerKind = null;
  isTodoTargetMenuOpen = false;
  renderProjectChatDock();
}

export function getEffectiveComposeSection(section = null) {
  const sec = section || ensureValidActiveChatSection();
  const allowed = getAllowedChatChannelsForUser();
  if (sec === 'todos') {
    if (allowed.includes(todoComposeTargetSection)) return todoComposeTargetSection;
    return 'todos';
  }
  return sec;
}

export function getMentionAutocompleteCandidates(query = '', composeSec = null) {
  const targetSec = composeSec || getEffectiveComposeSection();
  const usersInChannel = getUsersForChatSection(targetSec);
  const qNorm = normalizeMentionToken(String(query || '').replace(/^@+/, ''));
  if (!qNorm) return usersInChannel;
  return usersInChannel.filter(u =>
    normalizeMentionToken(u.name).includes(qNorm) ||
    normalizeMentionToken(u.shortName).includes(qNorm) ||
    normalizeMentionToken(u.shortHandle).includes(qNorm) ||
    normalizeMentionToken(u.handle).includes(qNorm) ||
    normalizeMentionToken(u.email).includes(qNorm)
  );
}

function renderMentionAutocompletePopoverHTML() {
  if (!activeMentionAutocomplete.open) return '';
  const effectiveSec = getEffectiveComposeSection();
  const secMeta = CHAT_CHANNEL_META[effectiveSec] || CHAT_CHANNEL_META.presupuesto;
  const candidates = getMentionAutocompleteCandidates(activeMentionAutocomplete.query, effectiveSec);

  if (candidates.length === 0) {
    return `
      <div class="mb-1.5 rounded-xl border border-slate-200 bg-white shadow-lg p-2.5 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Sin usuarios en <strong>${escapeChatHtml(secMeta.label)}</strong> para "@${escapeChatHtml(activeMentionAutocomplete.query)}"</span>
      </div>
    `;
  }

  const clampedIdx = Math.min(Math.max(0, activeMentionAutocomplete.highlightIdx), candidates.length - 1);
  activeMentionAutocomplete.highlightIdx = clampedIdx;

  return `
    <div class="mb-1.5 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden max-h-48 overflow-y-auto custom-scroll">
      <div class="px-2.5 py-1 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-500">
        <span class="flex items-center gap-1.5">
          <i class="fa-solid ${secMeta.icon} text-[10px]"></i>
          <span>${escapeChatHtml(secMeta.label)} (${candidates.length})</span>
        </span>
        <span class="text-[9.5px] font-normal">↑↓ / Enter o clic</span>
      </div>
      ${candidates.map((u, idx) => {
        const isSel = idx === clampedIdx;
        const safeHandleJs = escapeChatHtml(escapeChatJsArg(u.shortHandle || u.handle));
        return `
          <button type="button"
                  title="${escapeChatHtml(u.name)}"
                  onmousedown="event.preventDefault(); applyProjectChatMentionSuggestion('${safeHandleJs}')"
                  class="w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-xs transition cursor-pointer ${isSel ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'}">
            <span class="flex items-center gap-2 min-w-0">
              <img src="${escapeChatHtml(u.avatar)}" alt="${escapeChatHtml(u.shortName)}"
                   class="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0">
              <span class="font-bold truncate">${escapeChatHtml(u.shortName)}</span>
            </span>
            ${u.status === 'pending' ? `<span class="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9.5px] font-bold shrink-0">Invitado</span>` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function updateMentionAutocompleteDOM() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('project-chat-mention-autocomplete');
  if (!container) return;
  container.innerHTML = renderMentionAutocompletePopoverHTML();
}

export function triggerProjectChatAtMention() {
  const inp = typeof document !== 'undefined' ? document.getElementById('project-chat-input') : null;
  if (!inp) return;
  const val = String(inp.value || '');
  const caret = typeof inp.selectionStart === 'number' ? inp.selectionStart : val.length;
  const prefix = val.slice(0, caret);
  const needsSpace = prefix.length > 0 && !/\s$/.test(prefix);
  const insert = needsSpace ? ' @' : '@';
  inp.value = `${prefix}${insert}${val.slice(caret)}`;
  const nextPos = prefix.length + insert.length;
  if (typeof inp.focus === 'function') inp.focus();
  if (typeof inp.setSelectionRange === 'function') inp.setSelectionRange(nextPos, nextPos);
  onProjectChatInput(inp);
}

export function onProjectChatInput(inputEl = null) {
  const inp = inputEl || (typeof document !== 'undefined' ? document.getElementById('project-chat-input') : null);
  if (!inp) return;
  const val = String(inp.value || '');
  const caret = typeof inp.selectionStart === 'number' ? inp.selectionStart : val.length;
  const beforeCaret = val.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([^\s@]*)$/);
  if (match) {
    const query = match[1] || '';
    const atIndex = caret - query.length - 1;
    activeMentionAutocomplete = {
      open: true,
      query,
      matchStart: atIndex,
      matchEnd: caret,
      highlightIdx: 0
    };
  } else {
    activeMentionAutocomplete.open = false;
  }
  updateMentionAutocompleteDOM();
}

export function applyProjectChatMentionSuggestion(handle) {
  const inp = typeof document !== 'undefined' ? document.getElementById('project-chat-input') : null;
  if (!handle) return;
  if (inp) {
    const val = String(inp.value || '');
    const start = activeMentionAutocomplete.open && activeMentionAutocomplete.matchStart >= 0
      ? activeMentionAutocomplete.matchStart
      : val.length;
    const end = activeMentionAutocomplete.open && activeMentionAutocomplete.matchEnd >= start
      ? activeMentionAutocomplete.matchEnd
      : val.length;
    const prefix = val.slice(0, start);
    const suffix = val.slice(end).replace(/^\s+/, '');
    const inserted = `${handle} `;
    inp.value = `${prefix}${inserted}${suffix}`;
    const nextPos = prefix.length + inserted.length;
    if (typeof inp.focus === 'function') inp.focus();
    if (typeof inp.setSelectionRange === 'function') {
      inp.setSelectionRange(nextPos, nextPos);
    }
  }
  activeMentionAutocomplete = { open: false, query: '', matchStart: -1, matchEnd: -1, highlightIdx: 0 };
  updateMentionAutocompleteDOM();
}

export function handleProjectChatInputKeydown(event) {
  if (!event) return;
  if (activeMentionAutocomplete.open) {
    const candidates = getMentionAutocompleteCandidates(activeMentionAutocomplete.query, getEffectiveComposeSection());
    if (event.key === 'ArrowDown' && candidates.length > 0) {
      event.preventDefault();
      activeMentionAutocomplete.highlightIdx = (activeMentionAutocomplete.highlightIdx + 1) % candidates.length;
      updateMentionAutocompleteDOM();
      return;
    }
    if (event.key === 'ArrowUp' && candidates.length > 0) {
      event.preventDefault();
      activeMentionAutocomplete.highlightIdx = (activeMentionAutocomplete.highlightIdx - 1 + candidates.length) % candidates.length;
      updateMentionAutocompleteDOM();
      return;
    }
    if ((event.key === 'Enter' || event.key === 'Tab') && candidates.length > 0) {
      event.preventDefault();
      const idx = Math.min(Math.max(0, activeMentionAutocomplete.highlightIdx), candidates.length - 1);
      const chosen = candidates[idx];
      applyProjectChatMentionSuggestion(chosen.shortHandle || chosen.handle);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      activeMentionAutocomplete.open = false;
      updateMentionAutocompleteDOM();
      return;
    }
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    sendProjectChatMessage();
  }
}

function mapWorkspaceTabToChatSection(tab) {
  if (tab === 'cat' || tab === 'insumos' || tab === 'presupuesto') return 'presupuesto';
  if (tab === 'calendario') return 'calendario';
  if (tab === 'compras') return 'compras';
  if (tab === 'almacen') return 'almacen';
  if (tab === 'estimaciones') return 'estimaciones';
  if (tab === 'bitacora') return 'bitacora';
  return 'presupuesto';
}

export function autoSwitchChatSectionFromTab(tab) {
  const allowed = getAllowedChatChannelsForUser();
  if (allowed.length === 0) {
    renderProjectChatDock();
    return;
  }
  const targetChannel = mapWorkspaceTabToChatSection(tab);
  if (allowed.includes(targetChannel)) {
    lastSpecificChatSection = targetChannel;
    activeChatSection = targetChannel;
    todoComposeTargetSection = 'todos';
    userPinnedTodosSection = false;
  } else {
    ensureValidActiveChatSection();
  }
  activeChatFilter = 'all';
  activeTagPickerKind = null;
  activeMentionAutocomplete.open = false;
  isChannelMenuOpen = false;
  isTodoTargetMenuOpen = false;
  if (isChatDockExpanded) {
    markActiveProjectChatMessagesAsRead();
  }
  renderProjectChatDock();
}

export function addProjectChatPendingTag(kind, val) {
  if (kind === 'user') {
    if (!pendingComposerTags.mentions.includes(val)) pendingComposerTags.mentions.push(val);
  } else if (kind === 'partida') {
    pendingComposerTags.partidaId = String(val);
  } else if (kind === 'estimacion') {
    if (!pendingComposerTags.estimaciones.includes(val)) pendingComposerTags.estimaciones.push(val);
  } else if (kind === 'compra') {
    if (!Array.isArray(pendingComposerTags.compras)) pendingComposerTags.compras = [];
    if (!pendingComposerTags.compras.includes(val)) pendingComposerTags.compras.push(val);
  } else if (kind === 'almacen') {
    if (!Array.isArray(pendingComposerTags.almacen)) pendingComposerTags.almacen = [];
    if (!pendingComposerTags.almacen.includes(val)) pendingComposerTags.almacen.push(val);
  } else if (kind === 'reporte') {
    if (!pendingComposerTags.reportes.includes(val)) pendingComposerTags.reportes.push(val);
  }
  activeTagPickerKind = null;
  renderProjectChatDock();
  setTimeout(() => {
    const inp = document.getElementById('project-chat-input');
    if (inp) inp.focus();
  }, 30);
}

export function removeProjectChatPendingTag(kind, val) {
  if (kind === 'partida') pendingComposerTags.partidaId = null;
  if (kind === 'user') pendingComposerTags.mentions = pendingComposerTags.mentions.filter(x => x !== val);
  if (kind === 'estimacion') pendingComposerTags.estimaciones = pendingComposerTags.estimaciones.filter(x => x !== val);
  if (kind === 'compra') pendingComposerTags.compras = (pendingComposerTags.compras || []).filter(x => x !== val);
  if (kind === 'almacen') pendingComposerTags.almacen = (pendingComposerTags.almacen || []).filter(x => x !== val);
  if (kind === 'reporte') pendingComposerTags.reportes = pendingComposerTags.reportes.filter(x => x !== val);
  renderProjectChatDock();
}

export function sendProjectChatMessage() {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: tu rol solo permite consultar comentarios del chat.', 'warning');
    return;
  }
  const activeChannel = ensureValidActiveChatSection();
  if (!activeChannel) {
    showToast('🔒 No tienes permiso para escribir en ningún canal del chat.', 'warning');
    return;
  }
  const targetChannel = getEffectiveComposeSection(activeChannel);

  const inp = document.getElementById('project-chat-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  activeMentionAutocomplete.open = false;

  if (lastSentChatGuard.text === text && (Date.now() - lastSentChatGuard.ts) < 1500) return;
  lastSentChatGuard = { text, ts: Date.now() };

  const users = getAssignedProjectUsers();
  const currentUser = getCurrentUser() || getLastKnownUser();
  const defaultAuthor = users.find(u => currentUser && u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) || users[0];
  const authorObj = defaultAuthor;

  // Detectar etiquetas @Usuario escritas o elegidas del desplegable
  const mergedMentions = extractMentionsFromMessage({
    mentions: pendingComposerTags.mentions,
    text
  });
  users.forEach(u => {
    const txtLower = text.toLowerCase();
    const matchFull = txtLower.includes(u.handle.toLowerCase());
    const matchShort = u.shortHandle && txtLower.includes(u.shortHandle.toLowerCase());
    const alreadyPresent = mergedMentions.some(m => {
      const ml = m.toLowerCase();
      return ml === u.handle.toLowerCase() || (u.shortHandle && ml === u.shortHandle.toLowerCase());
    });
    if ((matchFull || matchShort) && !alreadyPresent) {
      mergedMentions.push(u.shortHandle || u.handle);
    }
  });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  const messages = loadProjectChatMessages();
  const newMsg = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    section: targetChannel,
    authorName: authorObj.name,
    authorHandle: authorObj.handle,
    authorRole: authorObj.roleLabel,
    authorInitials: authorObj.initials,
    authorEmail: currentUser?.email || '',
    authorAvatar: authorObj.avatar || '',
    time: `${dateStr} • ${timeStr}`,
    createdAt: now.toISOString(),
    partidaId: pendingComposerTags.partidaId || activePartidaFilterId || null,
    mentions: mergedMentions,
    estimaciones: [...pendingComposerTags.estimaciones],
    compras: [...(pendingComposerTags.compras || [])],
    almacen: [...(pendingComposerTags.almacen || [])],
    reportes: [...pendingComposerTags.reportes],
    perUserRead: true,
    isRead: false,
    readBy: [],
    text
  };
  messages.push(newMsg);

  saveProjectChatMessages(messages, null, { skipCloudSync: true });
  broadcastChatMessage(getActiveProjectId(), newMsg);
  pendingComposerTags = {
    partidaId: activePartidaFilterId || null,
    mentions: [],
    estimaciones: [],
    compras: [],
    almacen: [],
    reportes: []
  };
  activeTagPickerKind = null;

  renderProjectChatDock();
  triggerExternalChatRefresh();

  setTimeout(() => {
    const listEl = document.getElementById('project-chat-messages-list');
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  }, 40);
}

export function canUserDeleteChatMessage(target, projectId = null) {
  if (!target) return false;
  if (!canCurrentUserEditProject(projectId)) return false;
  if (!isChatMessageVisibleToUser(target, projectId)) return false;
  const pid = resolveCanonicalChatPid(projectId);
  const currentUser = getCurrentUser() || getLastKnownUser();
  const uEmail = String(currentUser?.email || '').toLowerCase().trim();
  const proj = getProjectByIdReadOnly(pid);
  const ownerEmail = String(proj?.ownerEmail || '').toLowerCase().trim();
  if (!uEmail || !ownerEmail || ownerEmail === uEmail) return true;
  const role = getUserRoleInProject(pid, currentUser);
  if (role === 'editar') return true;
  const targetEmail = String(target.authorEmail || '').toLowerCase().trim();
  if (targetEmail && targetEmail === uEmail) return true;
  return false;
}

export function deleteProjectChatMessage(msgId) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: tu rol no permite eliminar comentarios del chat.', 'warning');
    return;
  }
  const cleanId = normalizeChatMsgId(msgId);
  const messages = loadProjectChatMessages();
  const target = messages.find(m => normalizeChatMsgId(m.id) === cleanId);
  if (!target) return;
  if (!isChatMessageVisibleToUser(target)) {
    showToast('🔒 No tienes permiso para eliminar mensajes de este canal.', 'warning');
    return;
  }
  if (!canUserDeleteChatMessage(target)) {
    showToast('🔒 Solo el autor del comentario o el administrador del proyecto puede eliminarlo.', 'warning');
    return;
  }
  const next = messages.filter(m => normalizeChatMsgId(m.id) !== cleanId);
  saveProjectChatMessages(next);
  broadcastChatDelete(getActiveProjectId(), cleanId);
  renderProjectChatDock();
  triggerExternalChatRefresh();
}

export function jumpToProjectChatTag(kind, value) {
  if (kind === 'partida') {
    if (!canUserAccessTabInProject('presupuesto')) {
      showToast('🔒 No tienes acceso a Presupuesto.', 'warning');
      return;
    }
    activePartidaFilterId = String(value);
    pendingComposerTags.partidaId = String(value);
    if (getAllowedChatChannelsForUser().includes('presupuesto')) {
      activeChatSection = 'presupuesto';
      userPinnedTodosSection = false;
    }
    renderProjectChatDock();
    triggerExternalChatRefresh();
    const pObj = getAllCatalogNodes().find(p => p.id === String(value));
    if (pObj) {
      showToast(`Filtrando comentarios de: ${pObj.clave} ${pObj.descripcion}`, 'info');
    }
  } else if (kind === 'estimacion') {
    if (!canUserAccessTabInProject('estimaciones')) {
      showToast('🔒 No tienes acceso a Estimaciones.', 'warning');
      return;
    }
    activeChatSection = 'estimaciones';
    userPinnedTodosSection = false;
    const ests = getProjectEstimacionesTags();
    const found = ests.find(e => e.label === value || e.id === value);
    if (found) {
      setActiveEstimacionId(found.id);
    }
    if (typeof window.switchTab === 'function') {
      window.switchTab('estimaciones');
    }
    showToast(`Abriendo ${value} en la pestaña Estimaciones`, 'info');
  } else if (kind === 'compra') {
    if (!canUserAccessTabInProject('compras')) {
      showToast('🔒 No tienes acceso a Compras y Pagos.', 'warning');
      return;
    }
    activeChatSection = 'compras';
    userPinnedTodosSection = false;
    if (typeof window.switchTab === 'function') {
      window.switchTab('compras');
    }
    showToast(`Navegando a Compras y Pagos para ${value}`, 'info');
  } else if (kind === 'almacen') {
    if (!canUserAccessTabInProject('almacen')) {
      showToast('🔒 No tienes acceso a Almacén.', 'warning');
      return;
    }
    activeChatSection = 'almacen';
    userPinnedTodosSection = false;
    if (typeof window.switchTab === 'function') {
      window.switchTab('almacen');
    }
    showToast(`Navegando a Almacén para ${value}`, 'info');
  } else if (kind === 'reporte') {
    const reps = getProjectReportesTags(activeChatSection);
    const found = reps.find(r => r.label === value || r.id === value);
    const fallbackTab = mapWorkspaceTabToChatSection(activeChatSection);
    const targetTab = found ? found.id : (fallbackTab === 'presupuesto' ? 'cat' : fallbackTab);
    if (typeof window.switchTab === 'function') {
      window.switchTab(targetTab);
    }
  }
}

// Renderizar el contenedor acoplado abajo a la derecha dentro de #workspace-container y el botón en la barra vertical izquierda
export function renderProjectChatDock() {
  if (isRefreshingFromChat) return;

  const activePidForAccess = getActiveProjectId() || 'proj-default-01';
  const allowedChannels = getAllowedChatChannelsForUser(activePidForAccess);
  const fullAccess = hasFullChatAccess(activePidForAccess);

  // Consumir apertura pendiente si el usuario hizo clic en una notificación desde "Mis Proyectos de Obra"
  let pendingScrollMsgId = null;
  try {
    const rawPending = localStorage.getItem('adm_const_pending_chat_open');
    if (rawPending) {
      const pending = JSON.parse(rawPending);
      if (pending && (!pending.projectId || pending.projectId === activePidForAccess)) {
        localStorage.removeItem('adm_const_pending_chat_open');
        if (allowedChannels.length > 0) {
          isChatDockExpanded = true;
          activeChatFilter = 'all';
          activePartidaFilterId = null;
          if (pending.section && allowedChannels.includes(pending.section)) {
            activeChatSection = pending.section;
            userPinnedTodosSection = pending.section === 'todos';
          }
          if (pending.partidaId && canUserAccessTabInProject('presupuesto', activePidForAccess)) {
            pendingComposerTags.partidaId = String(pending.partidaId);
          }
          if (pending.msgId) {
            highlightedMessageId = pending.msgId;
            pendingScrollMsgId = pending.msgId;
          }
        }
      }
    }
  } catch (e) {}

  const activeSection = ensureValidActiveChatSection(activePidForAccess);

  if (isChatDockExpanded) {
    markActiveProjectChatMessagesAsRead();
  }

  renderSidebarNotificationsUI();

  const workspaceEl = document.getElementById('workspace-container');
  if (!workspaceEl) return;

  let dockEl = document.getElementById('project-chat-dock');
  if (!dockEl) {
    dockEl = document.createElement('div');
    dockEl.id = 'project-chat-dock';
    workspaceEl.appendChild(dockEl);
  }

  // Preservar el texto que el usuario estaba escribiendo si se re-renderiza
  const prevInputEl = document.getElementById('project-chat-input');
  const draftText = prevInputEl ? prevInputEl.value : '';

  const projectName = state.settings?.projectName || 'Proyecto de Obra';
  const allowedSet = new Set(allowedChannels);
  const allMessages = loadProjectChatMessages();
  const visibleRaw = allMessages.filter(m => isChatMessageVisibleToUser(m, activePidForAccess, null, allowedSet));

  // Calcular conteo de no leídos SOLO cuando el dock está minimizado (evita trabajo innecesario al escribir o renderizar)
  let unreadCount = 0;
  if (!isChatDockExpanded) {
    const currentUserMin = getCurrentUser() || getLastKnownUser();
    const myEmailMin = (currentUserMin?.email || '').toLowerCase().trim();
    const readSetMin = new Set(getReadMentionIds());
    for (let i = 0; i < visibleRaw.length; i++) {
      if (!isChatMessageReadForCurrentUser(visibleRaw[i], activePidForAccess, myEmailMin, readSetMin)) {
        unreadCount++;
      }
    }
  }

  // Actualizar el botón del Chat en la barra vertical izquierda (debajo de la campana de notificaciones)
  const sidebarChatBtn = document.getElementById('btn-sidebar-project-chat');
  const sidebarChatIcon = document.getElementById('sidebar-chat-icon');
  const sidebarChatBadge = document.getElementById('sidebar-chat-badge');

  if (sidebarChatBtn) {
    sidebarChatBtn.title = `${isChatDockExpanded ? 'Cerrar' : 'Abrir'} Chat y Bitácora de Obra: ${projectName} (${visibleRaw.length} notas visibles)`;
    sidebarChatBtn.className = isChatDockExpanded
      ? 'w-11 h-11 rounded-xl flex items-center justify-center bg-blue-600/25 text-blue-300 border border-blue-500/60 shadow-md transition active:scale-95 cursor-pointer relative group'
      : 'w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition active:scale-95 cursor-pointer relative group';
  }
  if (sidebarChatIcon) {
    sidebarChatIcon.className = isChatDockExpanded
      ? 'fa-solid fa-comments text-lg text-amber-300 transition'
      : 'fa-solid fa-comments text-lg group-hover:text-blue-400 transition';
  }
  if (sidebarChatBadge) {
    if (!isChatDockExpanded && unreadCount > 0) {
      sidebarChatBadge.classList.remove('hidden');
      sidebarChatBadge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    } else {
      sidebarChatBadge.classList.add('hidden');
      sidebarChatBadge.textContent = '0';
    }
  }

  // Si está plegado (cerrado), salir antes de construir listas de catálogo, stock o usuarios
  if (!isChatDockExpanded) {
    dockEl.className = 'hidden';
    dockEl.innerHTML = '';
    return;
  }

  const currentUser = getCurrentUser() || getLastKnownUser();
  const visibleMessages = sortChatMessagesChronologically(visibleRaw);
  const unreadByChannel = {};
  allowedChannels.forEach(ch => { unreadByChannel[ch] = 0; });

  const users = getAssignedProjectUsers();
  const canSeePresupuesto = allowedSet.has('presupuesto');
  const canSeeEstimaciones = allowedSet.has('estimaciones');
  const canSeeCompras = allowedSet.has('compras');
  const canSeeAlmacen = allowedSet.has('almacen');

  let _partidasCache = null;
  let _partidasByIdMap = null;
  const getPartidasList = () => {
    if (_partidasCache === null) _partidasCache = getAllCatalogNodes();
    return _partidasCache;
  };
  const findPartidaById = (pidVal) => {
    if (pidVal === null || pidVal === undefined || pidVal === '') return null;
    if (_partidasByIdMap === null) {
      _partidasByIdMap = new Map(getPartidasList().map(p => [String(p.id), p]));
    }
    return _partidasByIdMap.get(String(pidVal)) || null;
  };

  const estimaciones = (activeTagPickerKind === 'estimacion' && canSeeEstimaciones) ? getProjectEstimacionesTags() : [];
  const compras = (activeTagPickerKind === 'compra' && canSeeCompras) ? getProjectComprasTags() : [];
  const almacenTags = (activeTagPickerKind === 'almacen' && canSeeAlmacen) ? getProjectAlmacenTags() : [];
  const reportes = (activeTagPickerKind === 'reporte' && activeSection) ? getProjectReportesTags(activeSection) : [];

  // Siempre al frente de toda la información en todas las pestañas (z-index: 9990)
  dockEl.style.zIndex = '9990';
  dockEl.className = isChatMaximized
    ? 'no-print fixed bottom-0 right-5 z-50 w-[820px] max-w-[calc(100vw-1.5rem)] shadow-2xl rounded-t-2xl border border-b-0 border-slate-300 bg-white overflow-hidden transition-all duration-200 font-sans'
    : 'no-print fixed bottom-0 right-5 z-50 w-[410px] sm:w-[465px] max-w-[calc(100vw-1.5rem)] shadow-2xl rounded-t-xl border border-b-0 border-slate-300 bg-white overflow-hidden transition-all duration-200 font-sans';

  const defaultAuthor = users.find(u => currentUser && u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) || users[0] || {
    name: currentUser?.name || 'Usuario',
    handle: '@Usuario',
    initials: 'US',
    roleLabel: 'Asignado'
  };

  selectedAuthorHandle = defaultAuthor.handle;

  // Si el usuario no tiene ninguna pestaña asignada
  if (!activeSection || allowedChannels.length === 0) {
    dockEl.innerHTML = `
      <div onclick="toggleProjectChatDock(false)"
           class="px-3 py-2 bg-slate-900 text-white flex items-center justify-between gap-2 cursor-pointer select-none">
        <span class="text-xs font-bold truncate">Chat • ${escapeChatHtml(projectName)}</span>
        <button type="button" onclick="event.stopPropagation(); toggleProjectChatDock(false);"
                class="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white text-[10.5px] font-bold cursor-pointer">
          Plegar
        </button>
      </div>
      <div class="p-6 text-center bg-white space-y-2">
        <i class="fa-solid fa-lock text-2xl text-slate-400"></i>
        <p class="text-xs font-bold text-slate-700">Sin canales de chat autorizados</p>
        <p class="text-[11px] text-slate-500">Solicita al administrador que te asigne al menos una pestaña del proyecto.</p>
      </div>
    `;
    return;
  }

  const chMeta = CHAT_CHANNEL_META[activeSection] || CHAT_CHANNEL_META.todos || CHAT_CHANNEL_META.presupuesto;

  // Filtrar mensajes del canal autorizado ('todos' muestra todos los mensajes visibles para el usuario según sus permisos)
  const sectionMessages = activeSection === 'todos'
    ? visibleMessages
    : visibleMessages.filter(m => getMessageSection(m) === activeSection);

  const filteredMessages = sectionMessages.filter(m => {
    if (activePartidaFilterId && String(m.partidaId) !== String(activePartidaFilterId)) return false;
    if (activeChatFilter === 'mentions') return extractMentionsFromMessage(m).length > 0;
    if (activeChatFilter === 'estimaciones') {
      return (Array.isArray(m.estimaciones) && m.estimaciones.length > 0) ||
             (Array.isArray(m.compras) && m.compras.length > 0) ||
             (Array.isArray(m.almacen) && m.almacen.length > 0);
    }
    if (activeChatFilter === 'reportes') return Array.isArray(m.reportes) && m.reportes.length > 0;
    return true;
  });

  const activePartidaObj = activePartidaFilterId
    ? findPartidaById(activePartidaFilterId)
    : null;

  const effectiveComposeSec = getEffectiveComposeSection(activeSection);
  const composeMeta = CHAT_CHANNEL_META[effectiveComposeSec] || chMeta;

  // Menú flotante de etiquetas no-usuario según canal y permisos (sin panel de usuarios integrado)
  let tagPickerHtml = '';
  if (activeTagPickerKind === 'partida' && (canSeePresupuesto || canSeeAlmacen || activeSection === 'compras' || fullAccess)) {
    const allNodesForTag = getPartidasList();
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll shadow-inner">
        ${allNodesForTag.length > 0 ? allNodesForTag.map(p => `
          <button type="button" onclick="addProjectChatPendingTag('partida', '${escapeChatHtml(escapeChatJsArg(p.id))}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer truncate max-w-full">
            <span class="opacity-65 mr-0.5">N${Number(p.level) || 1}</span>/${escapeChatHtml(p.clave)} ${escapeChatHtml(p.descripcion)}
          </button>
        `).join('') : `<span class="text-[11px] text-slate-400">Sin conceptos en el catálogo</span>`}
      </div>
    `;
  } else if (activeTagPickerKind === 'estimacion' && canSeeEstimaciones) {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll shadow-inner">
        ${estimaciones.map(e => `
          <button type="button" onclick="addProjectChatPendingTag('estimacion', '${escapeChatHtml(escapeChatJsArg(e.label))}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
            ${escapeChatHtml(e.label)} ${e.locked ? '🔒' : ''}
          </button>
        `).join('')}
      </div>
    `;
  } else if (activeTagPickerKind === 'compra' && canSeeCompras) {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll shadow-inner">
        ${compras.map(c => `
          <button type="button" onclick="addProjectChatPendingTag('compra', '${escapeChatHtml(escapeChatJsArg(c.label))}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 cursor-pointer">
            ${escapeChatHtml(c.label)} <span class="text-[9.5px] opacity-75">(${escapeChatHtml(c.status)})</span>
          </button>
        `).join('')}
      </div>
    `;
  } else if (activeTagPickerKind === 'almacen' && canSeeAlmacen) {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll shadow-inner">
        ${almacenTags.map(a => `
          <button type="button" onclick="addProjectChatPendingTag('almacen', '${escapeChatHtml(escapeChatJsArg(a.label))}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 cursor-pointer">
            ${escapeChatHtml(a.label)} <span class="text-[9.5px] opacity-75">(${escapeChatHtml(a.stockLabel)})</span>
          </button>
        `).join('')}
      </div>
    `;
  } else if (activeTagPickerKind === 'reporte') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 shadow-inner">
        ${reportes.map(r => `
          <button type="button" onclick="addProjectChatPendingTag('reporte', '${escapeChatHtml(escapeChatJsArg(r.label))}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 cursor-pointer">
            ${escapeChatHtml(r.label)}
          </button>
        `).join('')}
      </div>
    `;
  }

  // Chips de etiquetas listas para enviarse en el mensaje actual
  const activeTagChips = [];
  if (pendingComposerTags.partidaId) {
    const p = findPartidaById(pendingComposerTags.partidaId);
    if (p) {
      activeTagChips.push(`
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          /${escapeChatHtml(p.clave)} ${escapeChatHtml(String(p.descripcion || '').slice(0, 22))}
          <button type="button" onclick="removeProjectChatPendingTag('partida', '${escapeChatHtml(escapeChatJsArg(p.id))}')" class="hover:text-amber-950 cursor-pointer">✕</button>
        </span>
      `);
    }
  }
  pendingComposerTags.mentions.forEach(m => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
        ${escapeChatHtml(m)}
        <button type="button" onclick="removeProjectChatPendingTag('user', '${escapeChatHtml(escapeChatJsArg(m))}')" class="hover:text-blue-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  pendingComposerTags.estimaciones.forEach(e => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
        ${escapeChatHtml(e)}
        <button type="button" onclick="removeProjectChatPendingTag('estimacion', '${escapeChatHtml(escapeChatJsArg(e))}')" class="hover:text-emerald-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  (pendingComposerTags.compras || []).forEach(c => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
        ${escapeChatHtml(String(c || '').slice(0, 22))}
        <button type="button" onclick="removeProjectChatPendingTag('compra', '${escapeChatHtml(escapeChatJsArg(c))}')" class="hover:text-indigo-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  (pendingComposerTags.almacen || []).forEach(a => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
        ${escapeChatHtml(String(a || '').slice(0, 24))}
        <button type="button" onclick="removeProjectChatPendingTag('almacen', '${escapeChatHtml(escapeChatJsArg(a))}')" class="hover:text-sky-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  pendingComposerTags.reportes.forEach(r => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
        ${escapeChatHtml(r)}
        <button type="button" onclick="removeProjectChatPendingTag('reporte', '${escapeChatHtml(escapeChatJsArg(r))}')" class="hover:text-purple-950 cursor-pointer">✕</button>
      </span>
    `);
  });

  const channelDropdownItemsHtml = allowedChannels.map(chId => {
    const meta = CHAT_CHANNEL_META[chId];
    if (!meta) return '';
    const chUnread = unreadByChannel[chId] || 0;
    const isSel = activeSection === chId;
    return `
      <button type="button"
              role="option"
              aria-selected="${isSel ? 'true' : 'false'}"
              data-channel-option="${escapeChatHtml(chId)}"
              onclick="event.stopPropagation(); switchProjectChatSection('${escapeChatHtml(escapeChatJsArg(chId))}')"
              class="w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-[11px] font-bold transition cursor-pointer ${isSel ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}">
        <span class="flex items-center gap-2 min-w-0">
          <i class="fa-solid ${meta.icon} ${isSel ? 'text-white' : (meta.iconColor || 'text-slate-300')} text-[11px] w-4 text-center shrink-0"></i>
          <span class="truncate">${escapeChatHtml(meta.label)}</span>
        </span>
        ${chUnread > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold ${isSel ? 'bg-white/25 text-white' : 'bg-amber-400 text-slate-950'} shrink-0">${chUnread}</span>` : ''}
      </button>
    `;
  }).join('');

  const todoTargetChannels = allowedChannels.filter(c => c !== 'todos');
  const todoTargetChoices = ['todos', ...todoTargetChannels];
  const todoTargetMenuItemsHtml = todoTargetChoices.map(chId => {
    const meta = CHAT_CHANNEL_META[chId];
    if (!meta) return '';
    const isSel = effectiveComposeSec === chId;
    const itemLabel = chId === 'todos' ? 'Todo (Todos los invitados)' : meta.label;
    return `
      <button type="button"
              role="option"
              aria-selected="${isSel ? 'true' : 'false'}"
              data-todo-target="${escapeChatHtml(chId)}"
              onclick="event.stopPropagation(); onTodoComposeTargetChange('${escapeChatHtml(escapeChatJsArg(chId))}')"
              class="w-full px-2.5 py-1.5 text-left flex items-center gap-2 text-[11px] font-bold transition cursor-pointer ${isSel ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}">
        <i class="fa-solid ${meta.icon} ${isSel ? 'text-white' : (meta.iconColor || 'text-slate-300')} text-[11px] w-4 text-center shrink-0"></i>
        <span class="truncate">${escapeChatHtml(itemLabel)}</span>
      </button>
    `;
  }).join('');

  const showConceptButton = ['todos', 'presupuesto', 'calendario', 'compras', 'almacen', 'bitacora'].includes(effectiveComposeSec);
  const showEstButton = (effectiveComposeSec === 'estimaciones' || effectiveComposeSec === 'todos') && canSeeEstimaciones;
  const showCompraButton = (effectiveComposeSec === 'compras' || effectiveComposeSec === 'todos') && canSeeCompras;
  const showAlmacenButton = (effectiveComposeSec === 'almacen' || effectiveComposeSec === 'todos') && canSeeAlmacen;

  dockEl.innerHTML = `
    <!-- BARRA SUPERIOR DE LA VENTANA DESPLEGADA -->
    <div onclick="toggleProjectChatDock(false)"
         class="px-3 py-2 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 hover:from-slate-800 hover:to-blue-700 text-white flex items-center justify-between gap-2 cursor-pointer select-none transition">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 inline-flex items-center justify-center shadow-xs shrink-0">
          <i class="fa-solid fa-comments text-xs"></i>
        </span>
        <span class="text-xs font-bold truncate" title="Chat y Bitácora: ${escapeChatHtml(projectName)}">
          Chat • ${escapeChatHtml(projectName)}
        </span>
        ${unreadCount > 0 ? `
        <span class="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 leading-none shrink-0"
              title="Mensajes no leídos">
          ${unreadCount}
        </span>` : ''}
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button type="button"
                id="btn-project-chat-print"
                onclick="event.stopPropagation(); printProjectChatReport('${escapeChatHtml(escapeChatJsArg(activeSection))}', event);"
                title="Imprimir reporte de chat (${escapeChatHtml(chMeta.label)})"
                class="w-6 h-6 rounded bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center cursor-pointer transition">
          <i class="fa-solid fa-print text-[11px]"></i>
        </button>
        <button type="button"
                id="btn-project-chat-maximize"
                onclick="event.stopPropagation(); toggleProjectChatMaximize(event);"
                title="${isChatMaximized ? 'Restaurar tamaño del chat' : 'Maximizar ventana del chat'}"
                class="w-6 h-6 rounded bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center cursor-pointer transition">
          <i class="fa-solid ${isChatMaximized ? 'fa-compress' : 'fa-expand'} text-[11px]"></i>
        </button>
        <button type="button"
                id="btn-project-chat-minimize"
                onclick="event.stopPropagation(); toggleProjectChatDock(false);"
                title="Minimizar al círculo flotante"
                class="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition">
          <span>Plegar</span>
          <i class="fa-solid fa-chevron-down text-[9px]"></i>
        </button>
      </div>
    </div>

    <!-- SELECTOR DE CANAL CON LOS MISMOS ÍCONOS DE LAS PESTAÑAS BASE -->
    <div class="bg-slate-900 px-2.5 py-1.5 flex items-center justify-between border-b border-slate-700/80 gap-2 select-none relative">
      <div class="flex items-center gap-1.5 min-w-0 flex-1">
        ${allowedChannels.length === 1 ? `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${chMeta.activeBtn}">
            <i class="fa-solid ${chMeta.icon} text-[10.5px]"></i>
            <span>${escapeChatHtml(chMeta.label)}</span>
            ${(unreadByChannel[activeSection] || 0) > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] bg-black/20">${unreadByChannel[activeSection]}</span>` : ''}
          </span>
        ` : `
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Canal:</span>
          <div id="project-chat-channel-dropdown" class="relative flex-1 min-w-0">
            <button type="button"
                    id="project-chat-channel-btn"
                    onclick="toggleProjectChatChannelMenu(event)"
                    aria-expanded="${isChannelMenuOpen ? 'true' : 'false'}"
                    class="w-full bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-lg px-2.5 py-1 text-[11px] font-bold flex items-center justify-between gap-2 cursor-pointer transition">
              <span class="flex items-center gap-1.5 min-w-0">
                <i class="fa-solid ${chMeta.icon} ${chMeta.iconColor || 'text-slate-300'} text-[11px] shrink-0"></i>
                <span class="truncate">${escapeChatHtml(chMeta.label)}</span>
                ${(unreadByChannel[activeSection] || 0) > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-400 text-slate-950 shrink-0">${unreadByChannel[activeSection]}</span>` : ''}
              </span>
              <i class="fa-solid fa-chevron-down text-[9px] text-slate-400 shrink-0 transition-transform ${isChannelMenuOpen ? 'rotate-180' : ''}"></i>
            </button>
            ${isChannelMenuOpen ? `
              <div id="project-chat-channel-menu"
                   role="listbox"
                   class="absolute left-0 right-0 top-full mt-1 z-30 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto custom-scroll">
                ${channelDropdownItemsHtml}
              </div>
            ` : ''}
          </div>
        `}
      </div>
      ${((allowedChannels.includes('todos') && allowedChannels.length > 1) || fullAccess) ? `
        <div class="flex items-center gap-1 shrink-0">
          ${(allowedChannels.includes('todos') && allowedChannels.length > 1) ? `
            <button type="button" onclick="toggleProjectChatTodoMode()"
                    title="${activeSection === 'todos' ? 'Volver al canal específico anterior' : 'Abrir canal general Todo (todos los invitados)'}"
                    class="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition border ${activeSection === 'todos' ? 'bg-white text-slate-950 border-white shadow-xs' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'}">
              <i class="fa-solid fa-layer-group text-[9px]"></i>
              <span>Todo</span>
            </button>
          ` : ''}
          ${fullAccess ? `
            <button type="button"
                    id="btn-project-chat-libro"
                    onclick="printProjectChatReport('todos', event)"
                    title="Imprimir libro completo de todas las pestañas ordenado cronológicamente"
                    class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 shrink-0 border border-slate-700 cursor-pointer transition">
              <i class="fa-solid fa-book text-[9px] text-amber-400"></i>
              <span>Libro</span>
            </button>
          ` : ''}
        </div>
      ` : ''}
    </div>

    <!-- CUERPO DESPLEGABLE DEL CHAT DEL PROYECTO -->
    <div id="project-chat-body" class="flex flex-col bg-white">
      
      <!-- Sub-encabezado: Canal Activo + Filtros rápidos (sin usuarios integrados) -->
      <div class="p-2.5 bg-slate-50 border-b border-slate-200 space-y-2">
        <div class="flex items-center justify-between gap-2 min-w-0">
          <span class="text-[10px] text-slate-500 font-semibold flex items-center gap-1.5 min-w-0 flex-1">
            <span class="inline-block w-2 h-2 rounded-full shrink-0 ${chMeta.dotClass}"></span>
            <span class="truncate" title="${escapeChatHtml(chMeta.subtitle)}">${escapeChatHtml(chMeta.subtitle)}</span>
          </span>
        </div>

        <!-- Barra de filtros rápidos -->
        <div class="flex flex-wrap items-center gap-1">
          <button type="button" onclick="setProjectChatFilter('all')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition ${activeChatFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            Todos
          </button>
          <button type="button" onclick="setProjectChatFilter('mentions')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition ${activeChatFilter === 'mentions' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            @ Menciones
          </button>
          <button type="button" onclick="setProjectChatFilter('reportes')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition ${activeChatFilter === 'reportes' ? chMeta.filterBtnColor : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            ! Reportes
          </button>
          ${activePartidaObj ? `
            <button type="button" onclick="clearProjectChatPartidaFilter()"
                    title="Quitar filtro de concepto / partida"
                    class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-500 text-white hover:bg-amber-600 cursor-pointer transition truncate max-w-[160px]">
              /${escapeChatHtml(activePartidaObj.clave)} ${escapeChatHtml(activePartidaObj.descripcion)} ✕
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Lista de Mensajes del Canal Autorizado -->
      <div id="project-chat-messages-list" class="p-2.5 space-y-2 ${isChatMaximized ? 'h-[58vh]' : 'h-[230px]'} overflow-y-auto custom-scroll bg-white">
        ${filteredMessages.length === 0 ? `
          <div class="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
            <span class="w-9 h-9 rounded-full ${chMeta.emptyBg} flex items-center justify-center mb-1.5">
              <i class="fa-solid ${chMeta.icon} text-sm"></i>
            </span>
            <p class="font-semibold text-slate-600">Sin mensajes en ${escapeChatHtml(chMeta.label)}</p>
            <p class="text-[11px] text-slate-400 mt-0.5">
              ${chMeta.emptyDesc}
            </p>
          </div>
        ` : (() => {
          const usersByEmail = new Map();
          const usersByHandle = new Map();
          const usersByName = new Map();
          users.forEach(u => {
            if (u.email) usersByEmail.set(u.email.toLowerCase(), u);
            if (u.handle) usersByHandle.set(u.handle.toLowerCase(), u);
            if (u.shortHandle) usersByHandle.set(u.shortHandle.toLowerCase(), u);
            if (u.shortName) usersByHandle.set(`@${u.shortName.toLowerCase()}`, u);
            if (u.name) usersByName.set(u.name.toLowerCase(), u);
          });
          const fallbackAvatarCache = new Map();
          const getCachedFallbackAvatar = (nameVal, emailVal) => {
            const k = `${nameVal}|${emailVal}`;
            let svg = fallbackAvatarCache.get(k);
            if (!svg) {
              svg = buildFallbackAvatarSvg(nameVal, emailVal);
              fallbackAvatarCache.set(k, svg);
            }
            return svg;
          };
          return filteredMessages.map(m => {
          const pObj = m.partidaId ? findPartidaById(m.partidaId) : null;
          const isHighlighted = highlightedMessageId && m.id === highlightedMessageId;
          const msgSec = getMessageSection(m);
          const msgMeta = CHAT_CHANNEL_META[msgSec] || CHAT_CHANNEL_META.todos || CHAT_CHANNEL_META.presupuesto;
          const safeMsgIdJs = escapeChatHtml(escapeChatJsArg(m.id));
          const matchedAuthorUser =
            (m.authorEmail && usersByEmail.get(m.authorEmail.toLowerCase())) ||
            (m.authorHandle && usersByHandle.get(m.authorHandle.toLowerCase())) ||
            (m.authorName && usersByName.get(m.authorName.toLowerCase())) ||
            null;
          const authorAvatarSrc = m.authorAvatar || matchedAuthorUser?.avatar || getCachedFallbackAvatar(m.authorName || 'Usuario', m.authorEmail || '');
          const authorShortDisp = formatAbbreviatedUserName(m.authorName || matchedAuthorUser?.name || m.authorHandle || '', m.authorEmail || '');
          return `
            <div id="chat-msg-item-${escapeChatHtml(m.id)}" class="p-2.5 rounded-lg border ${isHighlighted ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-300' : 'border-slate-200 bg-slate-50/70'} space-y-1.5 group transition">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <img src="${escapeChatHtml(authorAvatarSrc)}" alt="${escapeChatHtml(authorShortDisp)}"
                       class="w-5 h-5 rounded-full object-cover border border-slate-300 shrink-0">
                  <span class="text-[11px] font-bold text-slate-800 truncate" title="${escapeChatHtml(m.authorName || authorShortDisp)}">${escapeChatHtml(authorShortDisp)}</span>
                  ${activeSection === 'todos' ? `
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold ${msgMeta.emptyBg} border border-slate-200 shrink-0">
                      <i class="fa-solid ${msgMeta.icon} text-[8.5px]"></i>
                      <span>${escapeChatHtml(msgMeta.label)}</span>
                    </span>
                  ` : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="text-[10px] text-slate-400">${escapeChatHtml(m.time || '')}</span>
                  ${canUserDeleteChatMessage(m) ? `
                    <button type="button" onclick="deleteProjectChatMessage('${safeMsgIdJs}')"
                            title="Eliminar comentario"
                            class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 text-[10px] px-1 cursor-pointer transition">
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  ` : ''}
                </div>
              </div>

              <!-- Etiquetas clicables -->
              ${(pObj || (m.mentions && m.mentions.length) || (m.estimaciones && m.estimaciones.length) || (m.compras && m.compras.length) || (m.almacen && m.almacen.length) || (m.reportes && m.reportes.length)) ? `
                <div class="flex flex-wrap items-center gap-1">
                  ${pObj ? `
                    <button type="button" onclick="jumpToProjectChatTag('partida', '${escapeChatHtml(escapeChatJsArg(pObj.id))}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 cursor-pointer">
                      /${escapeChatHtml(pObj.clave)} ${escapeChatHtml(String(pObj.descripcion || '').slice(0, 24))}
                    </button>
                  ` : ''}
                  ${(m.mentions || []).map(uTag => {
                    const uTagL = String(uTag || '').toLowerCase();
                    const matchedTagUser = usersByHandle.get(uTagL);
                    const dispTag = matchedTagUser?.shortHandle || uTag;
                    return `
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        ${escapeChatHtml(dispTag)}
                      </span>
                    `;
                  }).join('')}
                  ${(m.estimaciones || []).map(est => `
                    <button type="button" onclick="jumpToProjectChatTag('estimacion', '${escapeChatHtml(escapeChatJsArg(est))}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 cursor-pointer">
                      ${escapeChatHtml(est)} ↗
                    </button>
                  `).join('')}
                  ${(m.compras || []).map(comp => `
                    <button type="button" onclick="jumpToProjectChatTag('compra', '${escapeChatHtml(escapeChatJsArg(comp))}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 hover:bg-indigo-200 cursor-pointer">
                      ${escapeChatHtml(String(comp || '').slice(0, 24))} ↗
                    </button>
                  `).join('')}
                  ${(m.almacen || []).map(alm => `
                    <button type="button" onclick="jumpToProjectChatTag('almacen', '${escapeChatHtml(escapeChatJsArg(alm))}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 cursor-pointer">
                      ${escapeChatHtml(String(alm || '').slice(0, 24))} ↗
                    </button>
                  `).join('')}
                  ${(m.reportes || []).map(rep => `
                    <button type="button" onclick="jumpToProjectChatTag('reporte', '${escapeChatHtml(escapeChatJsArg(rep))}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200 cursor-pointer">
                      ${escapeChatHtml(rep)} ↗
                    </button>
                  `).join('')}
                </div>
              ` : ''}

              <p class="text-xs text-slate-800 leading-snug break-words">${escapeChatHtml(m.text)}</p>
            </div>
          `;
        }).join('');
        })()}
      </div>

      <!-- Barra inferior para etiquetar y enviar comentario según el canal activo -->
      <div class="p-2.5 bg-slate-50 border-t border-slate-200 space-y-1.5">
        <div class="flex flex-wrap items-center gap-1">
          ${showConceptButton ? `
            <button type="button" onclick="toggleProjectChatTagPicker('partida')"
                    class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer">
              / Concepto
            </button>
          ` : ''}
          ${showEstButton ? `
            <button type="button" onclick="toggleProjectChatTagPicker('estimacion')"
                    class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
              # Estimación
            </button>
          ` : ''}
          ${showCompraButton ? `
            <button type="button" onclick="toggleProjectChatTagPicker('compra')"
                    class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 cursor-pointer">
              $ Compra/Pago
            </button>
          ` : ''}
          ${showAlmacenButton ? `
            <button type="button" onclick="toggleProjectChatTagPicker('almacen')"
                    class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 cursor-pointer">
              📦 Material / Stock
            </button>
          ` : ''}
          <button type="button" onclick="toggleProjectChatTagPicker('reporte')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 cursor-pointer">
            ! Reporte
          </button>
        </div>

        ${tagPickerHtml}

        ${activeSection === 'todos' && todoTargetChannels.length > 0 ? `
          <div class="flex items-center justify-between gap-2 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 relative">
            <span class="text-[10px] font-bold text-slate-600 shrink-0">Publicar en:</span>
            <div id="project-chat-todo-target-dropdown" class="relative flex-1 min-w-0">
              <button type="button"
                      id="project-chat-todo-target-btn"
                      onclick="toggleProjectChatTodoTargetMenu(event)"
                      aria-expanded="${isTodoTargetMenuOpen ? 'true' : 'false'}"
                      class="w-full bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded px-2 py-0.5 text-[10.5px] font-bold flex items-center justify-between gap-1.5 cursor-pointer transition">
                <span class="flex items-center gap-1.5 min-w-0">
                  <i class="fa-solid ${composeMeta.icon} ${composeMeta.iconColor || 'text-slate-300'} text-[10px] shrink-0"></i>
                  <span class="truncate">${escapeChatHtml(effectiveComposeSec === 'todos' ? 'Todo (Todos los invitados)' : composeMeta.label)}</span>
                </span>
                <i class="fa-solid fa-chevron-down text-[8.5px] text-slate-400 shrink-0 transition-transform ${isTodoTargetMenuOpen ? 'rotate-180' : ''}"></i>
              </button>
              ${isTodoTargetMenuOpen ? `
                <div id="project-chat-todo-target-menu"
                     role="listbox"
                     class="absolute left-0 right-0 bottom-full mb-1 z-30 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto custom-scroll">
                  ${todoTargetMenuItemsHtml}
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}

        ${activeTagChips.length > 0 ? `
          <div class="flex flex-wrap items-center gap-1 pt-0.5">
            ${activeTagChips.join('')}
          </div>
        ` : ''}

        <div id="project-chat-mention-autocomplete" class="relative">
          ${renderMentionAutocompletePopoverHTML()}
        </div>

        <div class="flex items-center gap-1.5">
          <button type="button"
                  id="btn-project-chat-at-trigger"
                  onclick="triggerProjectChatAtMention()"
                  title="Mencionar usuario con @"
                  class="px-2 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-xs font-extrabold text-blue-700 cursor-pointer transition shrink-0">
            @
          </button>
          <input id="project-chat-input"
                 type="text"
                 value="${draftText.replace(/"/g, '&quot;')}"
                 placeholder="${escapeChatHtml(composeMeta.placeholder)} (escribe @ para mencionar)"
                 oninput="onProjectChatInput(this)"
                 onkeydown="handleProjectChatInputKeydown(event)"
                 class="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500">
          <button type="button"
                  onclick="sendProjectChatMessage()"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold ${composeMeta.btnClass} text-white cursor-pointer transition shrink-0 shadow-xs">
            Enviar
          </button>
        </div>
      </div>

    </div>
  `;

  if (pendingScrollMsgId) {
    setTimeout(() => {
      const msgEl = document.getElementById(`chat-msg-item-${pendingScrollMsgId}`);
      if (msgEl && typeof msgEl.scrollIntoView === 'function') {
        msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  }
}

// Cerrar popovers y menús desplegables del chat cuando se hace clic fuera
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (e) => {
    if (isNotificationsPopoverOpen) {
      const sidebarWrap = document.getElementById('sidebar-notifications-wrapper');
      const portalWrap = document.getElementById('portal-notifications-wrapper');
      const clickedInsideSidebar = Boolean(sidebarWrap && typeof sidebarWrap.contains === 'function' && sidebarWrap.contains(e.target));
      const clickedInsidePortal = Boolean(portalWrap && typeof portalWrap.contains === 'function' && portalWrap.contains(e.target));
      if (!clickedInsideSidebar && !clickedInsidePortal) {
        closeMentionNotificationsPopover();
      }
    }
    if (isChannelMenuOpen || isTodoTargetMenuOpen) {
      const chWrap = document.getElementById('project-chat-channel-dropdown');
      const todoWrap = document.getElementById('project-chat-todo-target-dropdown');
      const insideCh = Boolean(chWrap && typeof chWrap.contains === 'function' && chWrap.contains(e.target));
      const insideTodo = Boolean(todoWrap && typeof todoWrap.contains === 'function' && todoWrap.contains(e.target));
      let changed = false;
      if (isChannelMenuOpen && !insideCh) { isChannelMenuOpen = false; changed = true; }
      if (isTodoTargetMenuOpen && !insideTodo) { isTodoTargetMenuOpen = false; changed = true; }
      if (changed) renderProjectChatDock();
    }
  });
}

// Limpiar historial de chat y menciones en almacenamiento local
export function clearAllChatHistory() {
  try {
    if (typeof localStorage !== 'undefined') {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('control_obra_chat_') || k.startsWith('control_obra_read_mentions_'))) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch (e) {}
}


// Exponer funciones globales de notificaciones y chat para eventos HTML inline
if (typeof window !== 'undefined') {
  window.toggleMentionNotificationsPopover = toggleMentionNotificationsPopover;
  window.closeMentionNotificationsPopover = closeMentionNotificationsPopover;
  window.onNotificationsUserFilterChange = onNotificationsUserFilterChange;
  window.markAllMentionsAsRead = markAllMentionsAsRead;
  window.openMentionNotification = openMentionNotification;
  window.renderSidebarNotificationsUI = renderSidebarNotificationsUI;
  window.toggleProjectChatDock = toggleProjectChatDock;
  window.toggleProjectChatMaximize = toggleProjectChatMaximize;
  window.printProjectChatReport = printProjectChatReport;
  window.openProjectChatForPartida = openProjectChatForPartida;
  window.clearProjectChatPartidaFilter = clearProjectChatPartidaFilter;
  window.setProjectChatFilter = setProjectChatFilter;
  window.onProjectChatAuthorChange = onProjectChatAuthorChange;
  window.toggleProjectChatTagPicker = toggleProjectChatTagPicker;
  window.addProjectChatPendingTag = addProjectChatPendingTag;
  window.removeProjectChatPendingTag = removeProjectChatPendingTag;
  window.sendProjectChatMessage = sendProjectChatMessage;
  window.deleteProjectChatMessage = deleteProjectChatMessage;
  window.jumpToProjectChatTag = jumpToProjectChatTag;
  window.switchProjectChatSection = switchProjectChatSection;
  window.toggleProjectChatChannelMenu = toggleProjectChatChannelMenu;
  window.toggleProjectChatTodoTargetMenu = toggleProjectChatTodoTargetMenu;
  window.triggerProjectChatAtMention = triggerProjectChatAtMention;
  window.formatAbbreviatedUserName = formatAbbreviatedUserName;
  window.toggleProjectChatTodoMode = toggleProjectChatTodoMode;
  window.onTodoComposeTargetChange = onTodoComposeTargetChange;
  window.onProjectChatInput = onProjectChatInput;
  window.handleProjectChatInputKeydown = handleProjectChatInputKeydown;
  window.applyProjectChatMentionSuggestion = applyProjectChatMentionSuggestion;
  window.getUsersForChatSection = getUsersForChatSection;
  window.autoSwitchChatSectionFromTab = autoSwitchChatSectionFromTab;
  window.onGlobalActiveTabChange = autoSwitchChatSectionFromTab;
  window.renderProjectChatDock = renderProjectChatDock;
  window.canCurrentUserViewChatMessage = isChatMessageVisibleToUser;
  window.getAllowedChatChannelsForUser = getAllowedChatChannelsForUser;
  window.hasFullChatAccess = hasFullChatAccess;
  window.handleAcceptInvitationAction = handleAcceptInvitationAction;
  window.handleRejectInvitationAction = handleRejectInvitationAction;
  window.purgeAllNotifications = purgeAllNotifications;
  window.dismissMentionNotification = dismissMentionNotification;
  window.hydrateNotificationStateFromCloud = hydrateNotificationStateFromCloud;
  window.syncNotificationStateToCloud = syncNotificationStateToCloud;
  setTimeout(() => { try { hydrateNotificationStateFromCloud(); } catch (_) {} }, 800);
  window.addEventListener('cubikar:cloud-modules-hydrated', () => {
    try { hydrateNotificationStateFromCloud(); } catch (_) {}
    try { renderProjectChatDock(); } catch (_) {}
    try { renderSidebarNotificationsUI(); } catch (_) {}
  });
}