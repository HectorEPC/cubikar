// js/mobile/mobileChat.js
// Chat de Obra en Tiempo Real: Canales por permiso, menciones @Usuario, etiquetas a conceptos y mensajes sin leer

import { getActiveProjectId } from '../config/constants.js?v=20261119_cf39';
import { state } from '../state/store.js?v=20261119_cf39';
import { getCurrentUser, canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf39';
import {
  getAllowedChatChannelsForUser,
  getMessageSection,
  isChatMessageVisibleToUser,
  loadProjectChatMessages,
  saveProjectChatMessages,
  markActiveProjectChatMessagesAsRead,
  getUsersForChatSection,
  deleteProjectChatMessage,
  canUserDeleteChatMessage,
  isChatMessageReadForCurrentUser
} from '../modules/chat/projectChat.js?v=20261119_cf39';
import { broadcastChatMessage, hydrateProjectChatFromCloud } from '../core/realtimeSync.js?v=20261119_cf39';
import { showToast } from '../ui/notifications.js?v=20261119_cf39';
import { escapeHtml } from './mobileBridge.js?v=20261119_cf39';

const CHANNEL_META = [
  { id: 'general', label: 'General', icon: 'fa-solid fa-comments' },
  { id: 'presupuesto', label: 'Presupuesto', icon: 'fa-solid fa-coins' },
  { id: 'calendario', label: 'Calendario', icon: 'fa-solid fa-calendar-days' },
  { id: 'compras', label: 'Compras', icon: 'fa-solid fa-cart-shopping' },
  { id: 'almacen', label: 'Almacén', icon: 'fa-solid fa-warehouse' },
  { id: 'estimaciones', label: 'Estimaciones', icon: 'fa-solid fa-file-invoice-dollar' },
  { id: 'bitacora', label: 'Bitácora', icon: 'fa-solid fa-book-bookmark' }
];

let activeChannel = 'general';
let conceptFilterId = null;
let conceptFilterLabel = '';

export function setChatConceptFilter(node) {
  if (!node) {
    conceptFilterId = null;
    conceptFilterLabel = '';
    return;
  }
  activeChannel = 'presupuesto';
  conceptFilterId = String(node.id);
  conceptFilterLabel = `${node.clave || ''} ${node.descripcion || ''}`.trim();
}

export function getUnreadChatCount(projectId = null) {
  const pId = projectId || getActiveProjectId();
  if (!pId) return 0;
  const msgs = loadProjectChatMessages(pId) || [];
  let unread = 0;
  for (const m of msgs) {
    if (isChatMessageVisibleToUser(m, pId) && !isChatMessageReadForCurrentUser(m, pId)) {
      unread++;
    }
  }
  return unread;
}

export function renderMobileChat(container, { onCloseChat }) {
  if (!container) return;
  const pId = getActiveProjectId();
  if (!pId) return;

  hydrateProjectChatFromCloud(pId).catch(() => {});

  const allowed = getAllowedChatChannelsForUser(pId) || ['general'];
  if (!allowed.includes(activeChannel)) {
    activeChannel = allowed[0] || 'general';
  }

  markActiveProjectChatMessagesAsRead(pId);

  const allMsgs = loadProjectChatMessages(pId) || [];
  const visibleMsgs = allMsgs.filter(m => {
    if (!isChatMessageVisibleToUser(m, pId)) return false;
    if (getMessageSection(m) !== activeChannel) return false;
    if (conceptFilterId && String(m.partidaId || '') !== conceptFilterId) return false;
    return true;
  });

  const channelUsers = getUsersForChatSection(activeChannel, pId) || [];
  const currentUser = getCurrentUser();
  const myEmail = (currentUser?.email || '').toLowerCase().trim();
  const canWriteChat = canCurrentUserEditProject(pId);

  container.innerHTML = `
    <div class="m-row-between">
      <div class="m-row">
        <button type="button" id="m-chat-back" class="m-btn m-btn-outline m-btn-sm"><i class="fa-solid fa-arrow-left"></i> Volver</button>
        <h2 class="m-title" style="font-size:15.5px;">Chat de Obra</h2>
      </div>
      <span class="m-pill m-pill-blue"><i class="fa-solid fa-circle-dot"></i> En vivo</span>
    </div>

    <div class="m-chip-bar">
      ${CHANNEL_META.filter(ch => allowed.includes(ch.id)).map(ch => `
        <button type="button" data-chat-ch="${ch.id}" class="m-chip ${activeChannel === ch.id ? 'is-active' : ''}">
          <i class="${ch.icon}"></i> ${ch.label}
        </button>
      `).join('')}
    </div>

    ${conceptFilterId ? `
      <div class="m-card-alt m-row-between" style="border-color:var(--primary);padding:8px 10px;">
        <span style="font-size:11.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <i class="fa-solid fa-tag" style="color:var(--primary);"></i> Concepto: ${escapeHtml(conceptFilterLabel)}
        </span>
        <button type="button" id="m-chat-clear-conc" class="m-btn m-btn-outline m-btn-sm">Quitar</button>
      </div>
    ` : ''}

    <div id="m-chat-stream" class="m-card" style="min-height:260px;max-height:52dvh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
      ${visibleMsgs.length === 0 ? `
        <div style="text-align:center;margin:auto;color:var(--muted);font-size:12.5px;padding:24px 8px;">
          <i class="fa-regular fa-comment-dots" style="font-size:26px;display:block;margin-bottom:6px;"></i>
          Sin mensajes en #${escapeHtml(activeChannel)}. Escribe el primero abajo.
        </div>
      ` : visibleMsgs.map(msg => {
        const mine = myEmail && String(msg.authorEmail || '').toLowerCase().trim() === myEmail;
        return `
          <div class="m-card-alt" style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:88%;border-color:${mine ? 'var(--primary)' : 'var(--border)'};background:${mine ? 'var(--primary-soft)' : 'var(--card-alt)'};">
            <div class="m-row-between" style="gap:10px;margin-bottom:3px;">
              <strong style="font-size:11px;color:${mine ? 'var(--primary)' : 'var(--text)'};">${escapeHtml(msg.authorName || 'Usuario')}</strong>
              <span style="font-size:10px;color:var(--muted);">${escapeHtml(msg.time || '')}</span>
            </div>
            <div style="font-size:12.5px;line-height:1.4;white-space:pre-wrap;">${escapeHtml(msg.text || '')}</div>
            ${canUserDeleteChatMessage(msg, pId) ? `
              <div style="text-align:right;margin-top:3px;">
                <button type="button" data-del-msg="${escapeHtml(msg.id)}" style="border:none;background:none;color:var(--muted);font-size:10px;cursor:pointer;">Eliminar</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>

    ${canWriteChat && channelUsers.length > 0 ? `
      <div class="m-chip-bar">
        ${channelUsers.map(u => `
          <button type="button" data-mention="${escapeHtml(u.shortHandle || u.handle || u.name)}" class="m-chip" style="padding:4px 9px;font-size:11px;">
            @${escapeHtml(u.name || u.email)}
          </button>
        `).join('')}
      </div>
    ` : ''}

    ${canWriteChat ? `
      <form id="m-chat-form" class="m-row" style="gap:8px;">
        <input id="m-chat-input" class="m-input" required placeholder="Escribir en #${escapeHtml(activeChannel)}..." style="flex:1;">
        <button type="submit" class="m-btn m-btn-primary">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </form>
    ` : `
      <div class="m-card-alt" style="text-align:center;font-size:12px;color:var(--muted);">
        <i class="fa-solid fa-eye"></i> Modo solo lectura en chat.
      </div>
    `}
  `;

  const stream = container.querySelector('#m-chat-stream');
  if (stream) stream.scrollTop = stream.scrollHeight;

  container.querySelector('#m-chat-back')?.addEventListener('click', () => onCloseChat?.());
  container.querySelector('#m-chat-clear-conc')?.addEventListener('click', () => {
    conceptFilterId = null;
    conceptFilterLabel = '';
    renderMobileChat(container, { onCloseChat });
  });

  container.querySelectorAll('[data-chat-ch]').forEach(b => {
    b.addEventListener('click', () => {
      if (!allowed.includes(b.dataset.chatCh)) return;
      activeChannel = b.dataset.chatCh;
      renderMobileChat(container, { onCloseChat });
    });
  });

  container.querySelectorAll('[data-mention]').forEach(b => {
    b.addEventListener('click', () => {
      const inp = container.querySelector('#m-chat-input');
      if (!inp) return;
      const handle = b.dataset.mention.startsWith('@') ? b.dataset.mention : `@${b.dataset.mention}`;
      inp.value = `${inp.value ? inp.value + ' ' : ''}${handle} `;
      inp.focus();
    });
  });

  container.querySelectorAll('[data-del-msg]').forEach(b => {
    b.addEventListener('click', () => {
      deleteProjectChatMessage(b.dataset.delMsg);
      renderMobileChat(container, { onCloseChat });
    });
  });

  container.querySelector('#m-chat-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!canCurrentUserEditProject(pId)) {
      showToast('🔒 Modo solo lectura: no puedes enviar comentarios.', 'warning');
      return;
    }
    const inp = container.querySelector('#m-chat-input');
    const text = (inp?.value || '').trim();
    if (!text) return;

    const extractedMentions = [];
    const txtLower = text.toLowerCase();
    const rawTags = text.match(/@[\w.\u00C0-\u017F-]+/g) || [];
    rawTags.forEach(t => {
      if (!extractedMentions.some(m => m.toLowerCase() === t.toLowerCase())) {
        extractedMentions.push(t);
      }
    });
    channelUsers.forEach(u => {
      const hFull = u.handle ? String(u.handle) : '';
      const hShort = u.shortHandle ? String(u.shortHandle) : '';
      const matchFull = hFull && txtLower.includes(hFull.toLowerCase());
      const matchShort = hShort && txtLower.includes(hShort.toLowerCase());
      const alreadyPresent = extractedMentions.some(m => {
        const ml = m.toLowerCase();
        return (hFull && ml === hFull.toLowerCase()) || (hShort && ml === hShort.toLowerCase());
      });
      if ((matchFull || matchShort) && !alreadyPresent) {
        extractedMentions.push(hShort || hFull);
      }
    });

    const u = getCurrentUser();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
    const authorName = u?.name || u?.email || 'Usuario';
    const handle = '@' + authorName.split(' ')[0].toLowerCase();

    const newMsg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      section: activeChannel,
      authorName,
      authorHandle: handle,
      authorRole: u?.roleLabel || 'Usuario',
      authorInitials: authorName.slice(0, 2).toUpperCase(),
      authorEmail: u?.email || '',
      authorAvatar: u?.avatar || '',
      time: `${dateStr} • ${timeStr}`,
      createdAt: now.toISOString(),
      partidaId: conceptFilterId || null,
      mentions: extractedMentions,
      estimaciones: [],
      compras: [],
      almacen: [],
      reportes: [],
      perUserRead: true,
      isRead: true,
      readBy: [u?.email || ''],
      text
    };

    const msgs = loadProjectChatMessages(pId) || [];
    msgs.push(newMsg);
    saveProjectChatMessages(msgs, pId, { skipCloudSync: true });
    try { broadcastChatMessage(pId, newMsg); } catch (_) {}
    renderMobileChat(container, { onCloseChat });
  });
}
