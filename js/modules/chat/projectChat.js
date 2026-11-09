// js/modules/chat/projectChat.js
// Ventana de Chat independiente por Proyecto (plegable y desplegable abajo a la derecha)
// conectada con Partidas de Nivel 1 (icono de alta visibilidad fa-comments),
// Usuarios Asignados (@), Estimaciones (#), Reportes (!) y Notificaciones de Menciones en la barra lateral izquierda.

import { state } from '../../state/store.js';
import { getActiveProjectId } from '../../config/constants.js';
import { getProjectById, getProjectsList, getCurrentUser, getLastKnownUser, AVATARS_BY_SEX } from '../portal/projectService.js';
import { loadEstimacionesData, setActiveEstimacionId } from '../estimaciones/estimacionesModel.js';
import { showToast } from '../../ui/notifications.js';

let isChatDockExpanded = false; // Inicia como pequeño círculo flotante abajo a la derecha
let isChatMaximized = false; // Permite maximizar o restaurar el tamaño de la ventana del chat
let activeChatFilter = 'all'; // 'all' | 'mentions' | 'estimaciones' | 'reportes'
let activePartidaFilterId = null; // ID de Partida Nivel 1 cuando se filtra con el botón de comentarios
let activeTagPickerKind = null; // 'user' | 'partida' | 'estimacion' | 'reporte' | null
let selectedAuthorHandle = null;
let selectedNotificationsHandle = 'all'; // 'all' (todos los usuarios etiquetados) o @Usuario específico
let isNotificationsPopoverOpen = false;
let highlightedMessageId = null;

let pendingComposerTags = {
  partidaId: null,
  mentions: [],
  estimaciones: [],
  reportes: []
};

let onExternalRefreshCallback = null;
let isRefreshingFromChat = false;

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

function getChatStorageKey(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  return `adm_const_project_chat_${pid}`;
}

export function loadProjectChatMessages(projectId = null) {
  try {
    const raw = localStorage.getItem(getChatStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function saveProjectChatMessages(messages, projectId = null) {
  try {
    localStorage.setItem(getChatStorageKey(projectId), JSON.stringify(messages || []));
  } catch (e) {}
}

export function getPartidaChatCount(partidaId) {
  if (!partidaId) return 0;
  const messages = loadProjectChatMessages();
  return messages.filter(m => String(m.partidaId) === String(partidaId)).length;
}

export function isPartidaChatActive(partidaId) {
  return Boolean(isChatDockExpanded && activePartidaFilterId && String(activePartidaFilterId) === String(partidaId));
}

// Helper que devuelve el HTML del botón de comentarios de alta visibilidad para cada Partida Nivel 1
export function renderPartidaNivel1ChatButton(nodeId, clave = '', descripcion = '') {
  const count = getPartidaChatCount(nodeId);
  const isActive = isPartidaChatActive(nodeId);
  const safeClave = String(clave || '').replace(/'/g, "\\'");
  const safeDesc = String(descripcion || '').slice(0, 40).replace(/'/g, "\\'");

  // Diseño de alto contraste con icono vectorial fa-comments para que destaque claramente
  let btnClasses = '';
  let iconClasses = '';
  let badgeHtml = '';

  if (isActive) {
    btnClasses = 'bg-amber-500 hover:bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-300';
    iconClasses = 'fa-solid fa-comments text-white text-[11px]';
    badgeHtml = `<span class="px-1.5 py-0.2 rounded-full bg-white text-amber-800 font-mono text-[10px] font-extrabold leading-tight">${count}</span>`;
  } else if (count > 0) {
    btnClasses = 'bg-blue-600 hover:bg-blue-500 text-white border-blue-700 shadow-sm';
    iconClasses = 'fa-solid fa-comments text-amber-300 text-[11px]';
    badgeHtml = `<span class="px-1.5 py-0.2 rounded-full bg-white text-blue-900 font-mono text-[10px] font-extrabold leading-tight">${count}</span>`;
  } else {
    btnClasses = 'bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border-blue-300 hover:border-blue-700 shadow-2xs';
    iconClasses = 'fa-solid fa-comments text-[11px]';
    badgeHtml = '';
  }

  return `
    <button type="button"
            onclick="openProjectChatForPartida('${nodeId}', event)"
            title="Comentarios de Nivel 1: ${safeClave} ${safeDesc} (${count})"
            class="no-print inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-sans font-bold transition cursor-pointer shrink-0 ${btnClasses}">
      <i class="${iconClasses}"></i>
      ${badgeHtml}
    </button>
  `;
}

// Obtener usuarios asignados al proyecto activo
function getAssignedProjectUsers(projectId = null) {
  const pid = projectId || getActiveProjectId() || 'proj-default-01';
  const proj = getProjectById(pid);
  const currentUser = getCurrentUser() || getLastKnownUser();
  const rawMembers = (proj && Array.isArray(proj.members) && proj.members.length > 0)
    ? proj.members
    : [
        {
          id: 'mem-owner',
          name: (currentUser && currentUser.name) || 'Administrador de Obra',
          email: (currentUser && currentUser.email) || 'admin@constructora.com',
          avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
          role: 'editar'
        }
      ];

  return rawMembers.map(m => {
    const cleanName = (m.name || 'Usuario').trim();
    const shortHandle = '@' + cleanName.replace(/\s+/g, '.');
    const parts = cleanName.split(/\s+/).filter(Boolean);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : cleanName.slice(0, 2).toUpperCase();
    const roleLabel = m.role === 'editar' ? 'Editar' : (m.role === 'escribir' ? 'Escribir' : 'Consultar');
    return {
      id: m.id || m.email || cleanName,
      name: cleanName,
      handle: shortHandle,
      email: m.email || '',
      avatar: m.avatar || AVATARS_BY_SEX['Masculino'],
      initials,
      roleLabel
    };
  });
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

// Obtener las Partidas Nivel 1 reales del catálogo activo
function getLevel1Partidas() {
  const roots = Array.isArray(state.treeData) ? state.treeData : [];
  return roots.map(node => ({
    id: String(node.id),
    clave: node.clave || '1',
    descripcion: node.descripcion || 'PARTIDA NIVEL 1'
  }));
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

// Reportes disponibles para etiquetar
function getProjectReportesTags() {
  return [
    { id: 'cat', label: '!Catálogo Base / APU' },
    { id: 'insumos', label: '!Explosión de Insumos' },
    { id: 'calendario', label: '!Calendario / Ruta Crítica' },
    { id: 'estimaciones', label: '!Reporte de Estimaciones' }
  ];
}

// Obtener todos los proyectos registrados + proyecto activo + cualquier clave de chat existente en localStorage
function getAllProjectsForNotifications() {
  const activePid = getActiveProjectId() || 'proj-default-01';
  const seenIds = new Set();
  const projects = [];

  const addProj = (id, name) => {
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    projects.push({
      id,
      projectName: name || 'Proyecto de Obra'
    });
  };

  try {
    const list = getProjectsList() || [];
    list.forEach(p => {
      if (p && p.id) {
        addProj(p.id, p.projectName);
      }
    });
  } catch (e) {}

  const activeProjObj = getProjectById(activePid);
  addProj(activePid, activeProjObj?.projectName || state.settings?.projectName || 'Proyecto Activo');

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.length === 'number') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('adm_const_project_chat_')) {
          const pid = k.replace('adm_const_project_chat_', '');
          if (pid && !seenIds.has(pid)) {
            const pObj = getProjectById(pid);
            addProj(pid, pObj?.projectName || `Proyecto (${pid})`);
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
    const clean = String(raw || '').trim();
    if (!clean.startsWith('@') || clean.length < 2) return;
    const lower = clean.toLowerCase();
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
    msgs.forEach(m => {
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
// scope = 'current' -> Solo notificaciones donde mencionaron usuarios en el proyecto activo (Barra lateral del proyecto)
// scope = 'all'     -> Todas las notificaciones donde etiquetaron usuarios de todos los proyectos ("Mis Proyectos de Obra")
export function getUserMentionsNotifications(targetHandle = null, scope = 'all') {
  const filterHandle = targetHandle || selectedNotificationsHandle || 'all';
  const isAllHandles = String(filterHandle).toLowerCase() === 'all';
  const handleLower = String(filterHandle || '').toLowerCase();

  const activePid = getActiveProjectId() || 'proj-default-01';
  const activeProjObj = getProjectById(activePid);
  const projects = scope === 'current'
    ? [{
        id: activePid,
        projectName: activeProjObj?.projectName || state.settings?.projectName || 'Proyecto Activo'
      }]
    : getAllProjectsForNotifications();

  const results = [];
  projects.forEach(proj => {
    const msgs = loadProjectChatMessages(proj.id);
    msgs.forEach(m => {
      const mentionsList = extractMentionsFromMessage(m);
      if (mentionsList.length === 0) return;

      const isMentioned = isAllHandles
        ? mentionsList.length > 0
        : (mentionsList.some(tag => String(tag).toLowerCase() === handleLower)
            || (m.text && String(m.text).toLowerCase().includes(handleLower)));

      if (isMentioned) {
        const readBy = Array.isArray(m.readBy) ? m.readBy : [];
        const isRead = Boolean(m.isRead)
          || readBy.includes('__all__')
          || (isAllHandles
            ? mentionsList.every(tag => readBy.some(h => String(h).toLowerCase() === String(tag).toLowerCase()))
            : readBy.some(h => String(h).toLowerCase() === handleLower));

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
  selectedNotificationsHandle = handle || 'all';
  renderSidebarNotificationsUI();
}

export function markAllMentionsAsRead(scope = 'all') {
  const filterHandle = selectedNotificationsHandle || 'all';
  const isAllHandles = String(filterHandle).toLowerCase() === 'all';
  const handleLower = String(filterHandle || '').toLowerCase();

  const activePid = getActiveProjectId() || 'proj-default-01';
  const projects = scope === 'current'
    ? [{ id: activePid }]
    : getAllProjectsForNotifications();

  projects.forEach(proj => {
    const msgs = loadProjectChatMessages(proj.id);
    let changed = false;
    msgs.forEach(m => {
      const mentionsList = extractMentionsFromMessage(m);
      if (mentionsList.length === 0) return;

      const isMentioned = isAllHandles
        ? true
        : (mentionsList.some(tag => String(tag).toLowerCase() === handleLower)
            || (m.text && String(m.text).toLowerCase().includes(handleLower)));

      if (isMentioned) {
        if (!Array.isArray(m.readBy)) m.readBy = [];
        if (isAllHandles) {
          m.isRead = true;
          if (!m.readBy.includes('__all__')) m.readBy.push('__all__');
          mentionsList.forEach(tag => {
            if (!m.readBy.some(h => String(h).toLowerCase() === String(tag).toLowerCase())) {
              m.readBy.push(tag);
            }
          });
          changed = true;
        } else if (!m.readBy.some(h => String(h).toLowerCase() === handleLower)) {
          m.readBy.push(filterHandle);
          changed = true;
        }
      }
    });
    if (changed) saveProjectChatMessages(msgs, proj.id);
  });

  renderSidebarNotificationsUI();
}

export function openMentionNotification(projectId, msgId, partidaId = '', event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }

  const activePid = getActiveProjectId() || 'proj-default-01';
  const targetPid = projectId || activePid;

  // Marcar este mensaje como leído para que la campana actualice su contador inmediatamente
  const msgs = loadProjectChatMessages(targetPid);
  const targetMsg = msgs.find(m => m.id === msgId);
  if (targetMsg) {
    targetMsg.isRead = true;
    if (!Array.isArray(targetMsg.readBy)) targetMsg.readBy = [];
    if (!targetMsg.readBy.includes('__all__')) targetMsg.readBy.push('__all__');
    extractMentionsFromMessage(targetMsg).forEach(tag => {
      if (!targetMsg.readBy.some(h => String(h).toLowerCase() === String(tag).toLowerCase())) {
        targetMsg.readBy.push(tag);
      }
    });
    saveProjectChatMessages(msgs, targetPid);
  }

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
        partidaId: partidaId || ''
      }));
    } catch (e) {}

    if (typeof window.openProjectInWorkspace === 'function') {
      window.openProjectInWorkspace(targetPid);
    }
  }

  // En el área de proyectos activa: abrir inmediatamente el chat al frente y enfocar el mensaje donde mencionaron al usuario
  isChatDockExpanded = true;
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

function buildNotificationsPopoverHTML(mentionsList, unreadCount, users, filterHandle, partidas, scope = 'current') {
  const isPortalScope = scope === 'all';
  const headerTitle = isPortalScope
    ? 'Notificaciones de Todos los Proyectos'
    : 'Menciones en este Proyecto';
  const headerSubtitle = isPortalScope
    ? `${unreadCount} nueva(s) • ${mentionsList.length} en todos los proyectos`
    : `${unreadCount} nueva(s) • ${mentionsList.length} en esta obra`;

  const emptyTitle = filterHandle === 'all'
    ? (isPortalScope ? 'Sin menciones en los proyectos' : 'Sin menciones en este proyecto')
    : `Sin menciones para ${filterHandle}`;

  const emptyDesc = filterHandle === 'all'
    ? (isPortalScope
        ? 'Cuando etiqueten a un <strong>@Usuario</strong> en el Chat de cualquier proyecto, se recopilará aquí.'
        : 'Cuando etiqueten a un <strong>@Usuario</strong> en el Chat del proyecto, aparecerá aquí y al darle clic te enviará al chat.')
    : `Cuando alguien etiquete a <strong>${filterHandle}</strong> en el Chat de Obra, aparecerá aquí el aviso directo.`;

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
        ${unreadCount > 0 ? `
          <button type="button" onclick="event.stopPropagation(); markAllMentionsAsRead('${scope}')"
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

    <!-- Selector de usuario para consultar todas las menciones o las de un usuario en específico -->
    <div onclick="event.stopPropagation()" class="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
      <span class="text-[10.5px] text-slate-400 font-medium">Filtrar usuario:</span>
      <select onchange="onNotificationsUserFilterChange(this.value)"
              class="bg-slate-800 border border-slate-700 text-amber-300 rounded-lg px-2 py-1 text-[11px] font-bold outline-none cursor-pointer max-w-[210px]">
        <option value="all" ${filterHandle === 'all' ? 'selected' : ''}>Todos los etiquetados (@)</option>
        ${users.map(u => `
          <option value="${u.handle}" ${u.handle === filterHandle ? 'selected' : ''}>${u.handle} (${u.roleLabel || 'Asignado'})</option>
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
        return `
          <div onclick="openMentionNotification('${item.projectId}', '${m.id}', '${m.partidaId || ''}', event)"
               class="p-3 hover:bg-slate-800/90 transition cursor-pointer flex items-start gap-2.5 ${!item.isRead ? 'bg-blue-950/40' : ''}"
               title="Clic para abrir el chat en este mensaje">
            <div class="w-7 h-7 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 relative">
              ${m.authorInitials || 'US'}
              ${!item.isRead ? `<span class="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900 absolute -top-0.5 -right-0.5"></span>` : ''}
            </div>
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center justify-between gap-1.5">
                <span class="text-[11px] font-bold text-white truncate">${m.authorHandle || m.authorName || 'Usuario'}</span>
                <span class="text-[10px] text-amber-400 font-semibold shrink-0 flex items-center gap-1">
                  <span>${m.time || ''}</span>
                  <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-1">
                <span class="px-1.5 py-0.2 rounded text-[9.5px] font-semibold bg-slate-800 text-slate-200 border border-slate-700 truncate max-w-[155px]">
                  📁 ${item.projectName}
                </span>
                ${mentionedTags.map(tag => `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-blue-500/25 text-blue-300 border border-blue-400/40">
                    🔔 ${tag}
                  </span>
                `).join('')}
                ${pObj ? `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 truncate max-w-[140px]">
                    /${pObj.clave} ${pObj.descripcion}
                  </span>
                ` : ''}
                ${(m.estimaciones || []).map(est => `
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ${est}
                  </span>
                `).join('')}
              </div>

              <p class="text-xs text-slate-200 leading-snug line-clamp-2 break-words">${m.text}</p>
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

  const currentUser = getCurrentUser();
  const notifWrapper = document.getElementById('portal-notifications-wrapper');

  // Si no hay sesiÃ³n iniciada, ocultar por completo la campana del portal y limpiar badges
  if (!currentUser) {
    if (notifWrapper) notifWrapper.classList.add('hidden');
    if (portalBadgeEl) {
      portalBadgeEl.classList.add('hidden');
      portalBadgeEl.textContent = '0';
    }
    if (portalPopoverEl) portalPopoverEl.classList.add('hidden');
    if (badgeEl) {
      badgeEl.classList.add('hidden');
      badgeEl.textContent = '0';
    }
    if (popoverEl) popoverEl.classList.add('hidden');
    return;
  }

  if (notifWrapper) notifWrapper.classList.remove('hidden');

  const filterHandle = selectedNotificationsHandle || 'all';

  // 1) Campana en el Área de Proyectos (barra lateral izquierda): notificaciones donde mencionaron usuarios en el proyecto activo
  const projectMentions = getUserMentionsNotifications(filterHandle, 'current');
  const projectUnreadCount = projectMentions.filter(item => !item.isRead).length;
  const projectBadgeText = projectUnreadCount > 99 ? '99+' : String(projectUnreadCount);

  if (badgeEl) {
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

  // 2) Campana en "Mis Proyectos de Obra" (portal): recopila todas las notificaciones que etiquetaron los usuarios de todos los proyectos
  const allProjectsMentions = getUserMentionsNotifications(filterHandle, 'all');
  const allProjectsUnreadCount = allProjectsMentions.filter(item => !item.isRead).length;
  const portalBadgeText = allProjectsUnreadCount > 99 ? '99+' : String(allProjectsUnreadCount);

  if (portalBadgeEl) {
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

  const partidas = getLevel1Partidas();

  if (popoverEl) {
    const projectUsers = getAllNotificationsUsers('current');
    popoverEl.classList.remove('hidden');
    popoverEl.innerHTML = buildNotificationsPopoverHTML(
      projectMentions,
      projectUnreadCount,
      projectUsers,
      filterHandle,
      partidas,
      'current'
    );
  }

  if (portalPopoverEl) {
    const allUsers = getAllNotificationsUsers('all');
    portalPopoverEl.classList.remove('hidden');
    portalPopoverEl.innerHTML = buildNotificationsPopoverHTML(
      allProjectsMentions,
      allProjectsUnreadCount,
      allUsers,
      filterHandle,
      partidas,
      'all'
    );
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

export function printProjectChatReport(event = null) {
  if (event && typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }

  const companyName = state.settings?.companyName || 'Constructora / Empresa';
  const companySubtitle = state.settings?.companySubtitle || 'Bitácora y Seguimiento de Obra';
  const projectName = state.settings?.projectName || 'Proyecto de Obra';
  const projectLocation = state.settings?.projectLocation || 'Ubicación no especificada';
  const logoSrc = state.settings?.companyLogo || '';

  const users = getAssignedProjectUsers();
  const partidas = getLevel1Partidas();
  const allMessages = loadProjectChatMessages();

  const filteredMessages = allMessages.filter(m => {
    if (activePartidaFilterId && String(m.partidaId) !== String(activePartidaFilterId)) return false;
    if (activeChatFilter === 'mentions') return Array.isArray(m.mentions) && m.mentions.includes(selectedAuthorHandle);
    if (activeChatFilter === 'estimaciones') return Array.isArray(m.estimaciones) && m.estimaciones.length > 0;
    if (activeChatFilter === 'reportes') return Array.isArray(m.reportes) && m.reportes.length > 0;
    return true;
  });

  const activePartidaObj = activePartidaFilterId
    ? partidas.find(p => String(p.id) === String(activePartidaFilterId))
    : null;

  let filterLabel = 'Todos los comentarios del proyecto';
  if (activePartidaObj) {
    filterLabel = `Partida Nivel 1: /${activePartidaObj.clave} ${activePartidaObj.descripcion}`;
  } else if (activeChatFilter === 'mentions') {
    filterLabel = `Menciones de ${selectedAuthorHandle || 'usuario'}`;
  } else if (activeChatFilter === 'estimaciones') {
    filterLabel = 'Comentarios etiquetados con #Estimaciones';
  } else if (activeChatFilter === 'reportes') {
    filterLabel = 'Comentarios etiquetados con !Reportes';
  }

  const fechaImpresion = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const rowsHtml = filteredMessages.length === 0
    ? `<tr><td colspan="5" style="text-align:center; padding:18px; color:#64748b;">No hay comentarios registrados en este filtro para imprimir.</td></tr>`
    : filteredMessages.map((m, idx) => {
        const pObj = m.partidaId ? partidas.find(p => String(p.id) === String(m.partidaId)) : null;
        const tags = [];
        if (pObj) tags.push(`<span class="tag tag-partida">/${pObj.clave} ${pObj.descripcion}</span>`);
        (m.mentions || []).forEach(u => tags.push(`<span class="tag tag-user">${u}</span>`));
        (m.estimaciones || []).forEach(e => tags.push(`<span class="tag tag-est">${e}</span>`));
        (m.reportes || []).forEach(r => tags.push(`<span class="tag tag-rep">${r}</span>`));

        return `
          <tr>
            <td style="text-align:center; font-weight:700; color:#475569;">${idx + 1}</td>
            <td style="white-space:nowrap; font-family:monospace; font-size:8pt; color:#334155;">${m.time || '-'}</td>
            <td>
              <div style="font-weight:700; color:#0f172a;">${m.authorHandle || m.authorName || 'Usuario'}</div>
              <div style="font-size:7.5pt; color:#64748b;">${m.authorName || ''} (${m.authorRole || 'Asignado'})</div>
            </td>
            <td>${tags.length > 0 ? tags.join(' ') : '<span style="color:#94a3b8; font-size:7.5pt;">General</span>'}</td>
            <td style="color:#0f172a; line-height:1.4;">${String(m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
          </tr>
        `;
      }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Chat y Seguimiento de Obra - ${projectName}</title>
  <style>
    @page { size: letter portrait; margin: 12mm; }
    * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { margin: 0; padding: 18px; color: #0f172a; background: #f8fafc; font-size: 9pt; }
    .toolbar {
      display: flex; justify-content: space-between; align-items: center;
      background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 8px; margin-bottom: 16px;
    }
    .toolbar button {
      border: none; border-radius: 6px; padding: 7px 14px; font-weight: 700; font-size: 9pt; cursor: pointer;
    }
    .btn-print { background: #2563eb; color: #fff; }
    .btn-close { background: #334155; color: #e2e8f0; margin-left: 6px; }
    .sheet {
      background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px;
      max-width: 960px; margin: 0 auto;
    }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { max-height: 48px; max-width: 90px; object-fit: contain; }
    .meta-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 14px; font-size: 8.5pt;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th {
      background: #0f172a; color: #fff; text-transform: uppercase; font-size: 7.5pt;
      letter-spacing: 0.4px; padding: 7px 8px; border: 1px solid #0f172a; text-align: left;
    }
    td { padding: 7px 8px; border: 1px solid #cbd5e1; vertical-align: top; font-size: 8.5pt; }
    tr:nth-child(even) td { background: #f8fafc; }
    .tag {
      display: inline-block; padding: 1px 5px; border-radius: 4px; font-size: 7.5pt; font-weight: 700; margin: 1px 2px 1px 0;
    }
    .tag-partida { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .tag-user { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
    .tag-est { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .tag-rep { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
    .signatures {
      display: flex; justify-content: space-around; margin-top: 40px; padding-top: 20px; page-break-inside: avoid;
    }
    .sig-box { width: 38%; border-top: 1px solid #334155; text-align: center; padding-top: 6px; font-size: 8pt; color: #334155; }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none !important; }
      .sheet { border: none; padding: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <strong>BITÁCORA DE CHAT Y SEGUIMIENTO DE OBRA</strong>
      <span style="margin-left:10px; font-size:8pt; color:#94a3b8;">${filteredMessages.length} comentario(s) en el reporte</span>
    </div>
    <div>
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
      <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
    </div>
  </div>

  <div class="sheet">
    <div class="header">
      <div class="brand">
        ${logoSrc ? `<img src="${logoSrc}" alt="Logo">` : ''}
        <div>
          <div style="font-size:13pt; font-weight:800; color:#0f172a;">${companyName}</div>
          <div style="font-size:8.5pt; color:#475569;">${companySubtitle}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:10pt; font-weight:800; color:#1e3a8a;">BITÁCORA / CHAT DE OBRA</div>
        <div style="font-size:8pt; color:#64748b;">Impreso: ${fechaImpresion}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div>
        <div><strong>Proyecto:</strong> ${projectName}</div>
        <div><strong>Ubicación:</strong> ${projectLocation}</div>
      </div>
      <div>
        <div><strong>Filtro aplicado:</strong> ${filterLabel}</div>
        <div><strong>Usuarios asignados:</strong> ${users.map(u => u.handle).join(', ')}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:36px; text-align:center;">#</th>
          <th style="width:105px;">Fecha / Hora</th>
          <th style="width:150px;">Autor</th>
          <th style="width:180px;">Etiquetas / Referencias</th>
          <th>Comentario de Seguimiento</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="signatures">
      <div class="sig-box">
        <strong>RESPONSABLE DE OBRA / RESIDENTE</strong><br>
        <span>Nombre y Firma de Conformidad</span>
      </div>
      <div class="sig-box">
        <strong>SUPERVISIÓN / ADMINISTRACIÓN</strong><br>
        <span>Nombre y Firma de Revisión</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  const printWin = window.open('', '_blank', 'width=980,height=740,scrollbars=yes');
  if (!printWin) {
    showToast('Permite las ventanas emergentes para imprimir el chat del proyecto.', 'warning');
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
  const pidStr = String(partidaId);
  if (isChatDockExpanded && activePartidaFilterId === pidStr) {
    clearProjectChatPartidaFilter();
    return;
  }
  isChatDockExpanded = true;
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

export function addProjectChatPendingTag(kind, val) {
  if (kind === 'user') {
    if (!pendingComposerTags.mentions.includes(val)) pendingComposerTags.mentions.push(val);
  } else if (kind === 'partida') {
    pendingComposerTags.partidaId = String(val);
  } else if (kind === 'estimacion') {
    if (!pendingComposerTags.estimaciones.includes(val)) pendingComposerTags.estimaciones.push(val);
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
  if (kind === 'reporte') pendingComposerTags.reportes = pendingComposerTags.reportes.filter(x => x !== val);
  renderProjectChatDock();
}

export function sendProjectChatMessage() {
  const inp = document.getElementById('project-chat-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;

  const users = getAssignedProjectUsers();
  const currentUser = getCurrentUser() || getLastKnownUser();
  const defaultAuthor = users.find(u => currentUser && u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) || users[0];
  const authorObj = users.find(u => u.handle === selectedAuthorHandle) || defaultAuthor;

  // Detectar tanto las etiquetas @Usuario agregadas con el botón como cualquier @Usuario escrito en el texto
  const mergedMentions = extractMentionsFromMessage({
    mentions: pendingComposerTags.mentions,
    text
  });
  users.forEach(u => {
    if (text.toLowerCase().includes(u.handle.toLowerCase()) && !mergedMentions.some(m => m.toLowerCase() === u.handle.toLowerCase())) {
      mergedMentions.push(u.handle);
    }
  });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  const messages = loadProjectChatMessages();
  messages.push({
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    authorName: authorObj.name,
    authorHandle: authorObj.handle,
    authorRole: authorObj.roleLabel,
    authorInitials: authorObj.initials,
    time: `${dateStr} • ${timeStr}`,
    partidaId: pendingComposerTags.partidaId || activePartidaFilterId || null,
    mentions: mergedMentions,
    estimaciones: [...pendingComposerTags.estimaciones],
    reportes: [...pendingComposerTags.reportes],
    readBy: [],
    text
  });

  saveProjectChatMessages(messages);
  inp.value = '';
  pendingComposerTags = {
    partidaId: activePartidaFilterId || null,
    mentions: [],
    estimaciones: [],
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

export function deleteProjectChatMessage(msgId) {
  const messages = loadProjectChatMessages();
  const next = messages.filter(m => m.id !== msgId);
  saveProjectChatMessages(next);
  renderProjectChatDock();
  triggerExternalChatRefresh();
}

export function jumpToProjectChatTag(kind, value) {
  if (kind === 'partida') {
    activePartidaFilterId = String(value);
    pendingComposerTags.partidaId = String(value);
    renderProjectChatDock();
    triggerExternalChatRefresh();
    const pObj = getLevel1Partidas().find(p => p.id === String(value));
    if (pObj) {
      showToast(`Filtrando comentarios de Partida Nivel 1: ${pObj.clave} ${pObj.descripcion}`, 'info');
    }
  } else if (kind === 'estimacion') {
    const ests = getProjectEstimacionesTags();
    const found = ests.find(e => e.label === value || e.id === value);
    if (found) {
      setActiveEstimacionId(found.id);
    }
    if (typeof window.switchTab === 'function') {
      window.switchTab('estimaciones');
    }
    showToast(`Abriendo ${value} en la pestaña Estimaciones`, 'info');
  } else if (kind === 'reporte') {
    const reps = getProjectReportesTags();
    const found = reps.find(r => r.label === value || r.id === value);
    const targetTab = found ? found.id : 'cat';
    if (typeof window.switchTab === 'function') {
      window.switchTab(targetTab);
    }
  }
}

// Renderizar el contenedor acoplado abajo a la derecha dentro de #workspace-container y el botón en la barra vertical izquierda
export function renderProjectChatDock() {
  if (isRefreshingFromChat) return;

  // Consumir apertura pendiente si el usuario hizo clic en una notificación desde "Mis Proyectos de Obra"
  let pendingScrollMsgId = null;
  try {
    const rawPending = localStorage.getItem('adm_const_pending_chat_open');
    if (rawPending) {
      const pending = JSON.parse(rawPending);
      const activePid = getActiveProjectId() || 'proj-default-01';
      if (pending && (!pending.projectId || pending.projectId === activePid)) {
        localStorage.removeItem('adm_const_pending_chat_open');
        isChatDockExpanded = true;
        activeChatFilter = 'all';
        activePartidaFilterId = null;
        if (pending.partidaId) {
          pendingComposerTags.partidaId = String(pending.partidaId);
        }
        if (pending.msgId) {
          highlightedMessageId = pending.msgId;
          pendingScrollMsgId = pending.msgId;
        }
      }
    }
  } catch (e) {}

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
  const users = getAssignedProjectUsers();
  const partidas = getLevel1Partidas();
  const estimaciones = getProjectEstimacionesTags();
  const reportes = getProjectReportesTags();
  const allMessages = loadProjectChatMessages();

  // Actualizar el botón del Chat en la barra vertical izquierda (debajo de la campana de notificaciones)
  const sidebarChatBtn = document.getElementById('btn-sidebar-project-chat');
  const sidebarChatIcon = document.getElementById('sidebar-chat-icon');
  const sidebarChatBadge = document.getElementById('sidebar-chat-badge');

  if (sidebarChatBtn) {
    sidebarChatBtn.title = `${isChatDockExpanded ? 'Cerrar' : 'Abrir'} Chat del Proyecto: ${projectName} (${allMessages.length} comentarios)`;
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
    if (allMessages.length > 0) {
      sidebarChatBadge.classList.remove('hidden');
      sidebarChatBadge.textContent = allMessages.length > 99 ? '99+' : String(allMessages.length);
    } else {
      sidebarChatBadge.classList.add('hidden');
      sidebarChatBadge.textContent = '0';
    }
  }

  // Si está plegado (cerrado), se abre desde el botón de la barra vertical izquierda (debajo de la campana) o desde Partida Nivel 1
  if (!isChatDockExpanded) {
    dockEl.className = 'hidden';
    dockEl.innerHTML = '';
    return;
  }

  // Siempre al frente de toda la información en todas las pestañas (z-index: 9990)
  dockEl.style.zIndex = '9990';
  dockEl.className = isChatMaximized
    ? 'no-print fixed bottom-0 right-5 z-50 w-[760px] max-w-[calc(100vw-1.5rem)] shadow-2xl rounded-t-2xl border border-b-0 border-slate-300 bg-white overflow-hidden transition-all duration-200 font-sans'
    : 'no-print fixed bottom-0 right-5 z-50 w-[360px] sm:w-[400px] max-w-[calc(100vw-1.5rem)] shadow-2xl rounded-t-xl border border-b-0 border-slate-300 bg-white overflow-hidden transition-all duration-200 font-sans';

  const currentUser = getCurrentUser() || getLastKnownUser();
  if (!selectedAuthorHandle || !users.some(u => u.handle === selectedAuthorHandle)) {
    const matched = users.find(u => currentUser && u.email && currentUser.email && u.email.toLowerCase() === currentUser.email.toLowerCase()) || users[0];
    selectedAuthorHandle = matched ? matched.handle : '@Admin';
  }

  // Filtrar mensajes según filtro activo y Partida Nivel 1
  const filteredMessages = allMessages.filter(m => {
    if (activePartidaFilterId && String(m.partidaId) !== String(activePartidaFilterId)) return false;
    if (activeChatFilter === 'mentions') return extractMentionsFromMessage(m).length > 0;
    if (activeChatFilter === 'estimaciones') return Array.isArray(m.estimaciones) && m.estimaciones.length > 0;
    if (activeChatFilter === 'reportes') return Array.isArray(m.reportes) && m.reportes.length > 0;
    return true;
  });

  const activePartidaObj = activePartidaFilterId
    ? partidas.find(p => String(p.id) === String(activePartidaFilterId))
    : null;

  // Mini avatares de asignados en la barra superior de la ventana acoplada
  const miniAvatarsHtml = users.slice(0, 4).map(u => `
    <span class="w-5 h-5 rounded-full bg-blue-800 text-white text-[9px] font-bold inline-flex items-center justify-center border border-blue-400 shrink-0"
          title="${u.name} (${u.handle} - ${u.roleLabel})">
      ${u.initials}
    </span>
  `).join('');

  // Menú flotante para insertar etiquetas (@Usuario, /Nivel 1, #Estimación, !Reporte)
  let tagPickerHtml = '';
  if (activeTagPickerKind === 'user') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll">
        ${users.map(u => `
          <button type="button" onclick="addProjectChatPendingTag('user', '${u.handle.replace(/'/g, "\\'")}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer">
            ${u.handle} <span class="text-[9.5px] opacity-75">(${u.roleLabel})</span>
          </button>
        `).join('')}
      </div>
    `;
  } else if (activeTagPickerKind === 'partida') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll">
        ${partidas.length > 0 ? partidas.map(p => `
          <button type="button" onclick="addProjectChatPendingTag('partida', '${p.id}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer truncate max-w-full">
            /${p.clave} ${p.descripcion}
          </button>
        `).join('') : `<span class="text-[11px] text-slate-400">Sin Partidas Nivel 1 en el catálogo</span>`}
      </div>
    `;
  } else if (activeTagPickerKind === 'estimacion') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1 max-h-28 overflow-y-auto custom-scroll">
        ${estimaciones.map(e => `
          <button type="button" onclick="addProjectChatPendingTag('estimacion', '${e.label}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
            ${e.label} ${e.locked ? '🔒' : ''}
          </button>
        `).join('')}
      </div>
    `;
  } else if (activeTagPickerKind === 'reporte') {
    tagPickerHtml = `
      <div class="p-2 rounded-lg border border-slate-200 bg-white flex flex-wrap gap-1">
        ${reportes.map(r => `
          <button type="button" onclick="addProjectChatPendingTag('reporte', '${r.label}')"
                  class="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 cursor-pointer">
            ${r.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  // Chips de etiquetas listas para enviarse en el mensaje actual
  const activeTagChips = [];
  if (pendingComposerTags.partidaId) {
    const p = partidas.find(x => String(x.id) === String(pendingComposerTags.partidaId));
    if (p) {
      activeTagChips.push(`
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          /${p.clave} ${p.descripcion.slice(0, 22)}
          <button type="button" onclick="removeProjectChatPendingTag('partida', '${p.id}')" class="hover:text-amber-950 cursor-pointer">✕</button>
        </span>
      `);
    }
  }
  pendingComposerTags.mentions.forEach(m => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
        ${m}
        <button type="button" onclick="removeProjectChatPendingTag('user', '${m.replace(/'/g, "\\'")}')" class="hover:text-blue-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  pendingComposerTags.estimaciones.forEach(e => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
        ${e}
        <button type="button" onclick="removeProjectChatPendingTag('estimacion', '${e}')" class="hover:text-emerald-950 cursor-pointer">✕</button>
      </span>
    `);
  });
  pendingComposerTags.reportes.forEach(r => {
    activeTagChips.push(`
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
        ${r}
        <button type="button" onclick="removeProjectChatPendingTag('reporte', '${r}')" class="hover:text-purple-950 cursor-pointer">✕</button>
      </span>
    `);
  });

  dockEl.innerHTML = `
    <!-- BARRA SUPERIOR DE LA VENTANA DESPLEGADA (CON BOTONES IMPRIMIR, MAXIMIZAR Y MINIMIZAR AL CÍRCULO FLOTANTE) -->
    <div onclick="toggleProjectChatDock(false)"
         class="px-3 py-2 bg-gradient-to-r from-slate-900 via-blue-900 to-blue-800 hover:from-slate-800 hover:to-blue-700 text-white flex items-center justify-between gap-2 cursor-pointer select-none transition">
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 inline-flex items-center justify-center shadow-xs shrink-0">
          <i class="fa-solid fa-comments text-xs"></i>
        </span>
        <span class="text-xs font-bold truncate" title="Chat del Proyecto: ${projectName}">
          Chat • ${projectName}
        </span>
        <span class="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-slate-950 leading-none shrink-0"
              title="Total de comentarios en este filtro">
          ${filteredMessages.length}
        </span>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <div class="hidden sm:flex items-center -space-x-1 mr-1">${miniAvatarsHtml}</div>
        <button type="button"
                id="btn-project-chat-print"
                onclick="event.stopPropagation(); printProjectChatReport(event);"
                title="Imprimir conversación del chat"
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

    <!-- CUERPO DESPLEGABLE DEL CHAT DEL PROYECTO -->
    <div id="project-chat-body" class="flex flex-col bg-white">
      
      <!-- Sub-encabezado: Usuario Asignado + Filtros rápidos -->
      <div class="p-2.5 bg-slate-50 border-b border-slate-200 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10.5px] text-slate-500 font-semibold flex items-center gap-1">
            <i class="fa-solid fa-user-shield text-blue-600 text-[10px]"></i> Usuarios Asignados
          </span>
          <div class="flex items-center gap-1 bg-white border border-slate-300 rounded px-1.5 py-0.5">
            <span class="text-[10px] text-slate-500">Comentar como:</span>
            <select onchange="onProjectChatAuthorChange(this.value)"
                    class="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer">
              ${users.map(u => `
                <option value="${u.handle}" ${u.handle === selectedAuthorHandle ? 'selected' : ''}>${u.handle}</option>
              `).join('')}
            </select>
          </div>
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
          <button type="button" onclick="setProjectChatFilter('estimaciones')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition ${activeChatFilter === 'estimaciones' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            # Estimaciones
          </button>
          <button type="button" onclick="setProjectChatFilter('reportes')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold cursor-pointer transition ${activeChatFilter === 'reportes' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}">
            ! Reportes
          </button>
          ${activePartidaObj ? `
            <button type="button" onclick="clearProjectChatPartidaFilter()"
                    title="Quitar filtro de Partida Nivel 1"
                    class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-500 text-white hover:bg-amber-600 cursor-pointer transition truncate max-w-[160px]">
              /${activePartidaObj.clave} ${activePartidaObj.descripcion} ✕
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Lista de Mensajes del Proyecto -->
      <div id="project-chat-messages-list" class="p-2.5 space-y-2 ${isChatMaximized ? 'h-[58vh]' : 'h-[230px]'} overflow-y-auto custom-scroll bg-white">
        ${filteredMessages.length === 0 ? `
          <div class="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
            <span class="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-1.5">
              <i class="fa-solid fa-comments text-sm"></i>
            </span>
            <p class="font-semibold text-slate-600">Sin comentarios en esta vista</p>
            <p class="text-[11px] text-slate-400 mt-0.5">
              Etiqueta a un <strong>@Usuario</strong>, una <strong>/Partida Nivel 1</strong>, una <strong>#Estimación</strong> o un <strong>!Reporte</strong>.
            </p>
          </div>
        ` : filteredMessages.map(m => {
          const pObj = m.partidaId ? partidas.find(p => String(p.id) === String(m.partidaId)) : null;
          const isHighlighted = highlightedMessageId && m.id === highlightedMessageId;
          return `
            <div id="chat-msg-item-${m.id}" class="p-2.5 rounded-lg border ${isHighlighted ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-300' : 'border-slate-200 bg-slate-50/70'} space-y-1.5 group transition">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="w-5 h-5 rounded-full bg-blue-700 text-white text-[9px] font-bold inline-flex items-center justify-center shrink-0">
                    ${m.authorInitials || 'US'}
                  </span>
                  <span class="text-[11px] font-bold text-slate-800 truncate">${m.authorHandle || m.authorName}</span>
                  <span class="px-1.5 py-0.2 rounded text-[9.5px] bg-white border border-slate-200 text-slate-500">${m.authorRole || 'Asignado'}</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <span class="text-[10px] text-slate-400">${m.time || ''}</span>
                  <button type="button" onclick="deleteProjectChatMessage('${m.id}')"
                          title="Eliminar comentario"
                          class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 text-[10px] px-1 cursor-pointer transition">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>

              <!-- Etiquetas clicables -->
              ${(pObj || (m.mentions && m.mentions.length) || (m.estimaciones && m.estimaciones.length) || (m.reportes && m.reportes.length)) ? `
                <div class="flex flex-wrap items-center gap-1">
                  ${pObj ? `
                    <button type="button" onclick="jumpToProjectChatTag('partida', '${pObj.id}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 cursor-pointer">
                      /${pObj.clave} ${pObj.descripcion.slice(0, 24)}
                    </button>
                  ` : ''}
                  ${(m.mentions || []).map(u => `
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      ${u}
                    </span>
                  `).join('')}
                  ${(m.estimaciones || []).map(est => `
                    <button type="button" onclick="jumpToProjectChatTag('estimacion', '${est}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 cursor-pointer">
                      ${est} ↗
                    </button>
                  `).join('')}
                  ${(m.reportes || []).map(rep => `
                    <button type="button" onclick="jumpToProjectChatTag('reporte', '${rep}')"
                            class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200 cursor-pointer">
                      ${rep} ↗
                    </button>
                  `).join('')}
                </div>
              ` : ''}

              <p class="text-xs text-slate-800 leading-snug break-words">${m.text}</p>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Barra inferior para etiquetar y enviar comentario -->
      <div class="p-2.5 bg-slate-50 border-t border-slate-200 space-y-1.5">
        <div class="flex flex-wrap items-center gap-1">
          <button type="button" onclick="toggleProjectChatTagPicker('user')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer">
            @ Usuario
          </button>
          <button type="button" onclick="toggleProjectChatTagPicker('partida')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 cursor-pointer">
            / Nivel 1
          </button>
          <button type="button" onclick="toggleProjectChatTagPicker('estimacion')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
            # Estimación
          </button>
          <button type="button" onclick="toggleProjectChatTagPicker('reporte')"
                  class="px-2 py-0.5 rounded text-[10.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 cursor-pointer">
            ! Reporte
          </button>
        </div>

        ${tagPickerHtml}

        ${activeTagChips.length > 0 ? `
          <div class="flex flex-wrap items-center gap-1 pt-0.5">
            ${activeTagChips.join('')}
          </div>
        ` : ''}

        <div class="flex items-center gap-1.5">
          <input id="project-chat-input"
                 type="text"
                 value="${draftText.replace(/"/g, '&quot;')}"
                 placeholder="Escribe un seguimiento de obra..."
                 onkeydown="if(event.key==='Enter'){ event.preventDefault(); sendProjectChatMessage(); }"
                 class="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500">
          <button type="button"
                  onclick="sendProjectChatMessage()"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition shrink-0 shadow-xs">
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

// Cerrar el popover de notificaciones cuando se hace clic fuera de las campanas
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (e) => {
    if (!isNotificationsPopoverOpen) return;
    const sidebarWrap = document.getElementById('sidebar-notifications-wrapper');
    const portalWrap = document.getElementById('portal-notifications-wrapper');
    const clickedInsideSidebar = Boolean(sidebarWrap && typeof sidebarWrap.contains === 'function' && sidebarWrap.contains(e.target));
    const clickedInsidePortal = Boolean(portalWrap && typeof portalWrap.contains === 'function' && portalWrap.contains(e.target));
    if (!clickedInsideSidebar && !clickedInsidePortal) {
      closeMentionNotificationsPopover();
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
