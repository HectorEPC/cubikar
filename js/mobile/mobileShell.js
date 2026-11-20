// js/mobile/mobileShell.js
// Cascarón móvil/tablet persistente: Header superior con icono de Cubikar, botón Día/Noche, Chat, Mi Cuenta y Bottom Nav (6 pestañas PC)

import { getActiveProjectId, setActiveProjectId } from '../config/constants.js?v=20261119_cf42';
import { state } from '../state/store.js?v=20261119_cf42';
import { signOut } from '../core/authService.js?v=20261119_cf42';
import { appendSsoToUrlFromStorage } from '../core/ssoHelper.js?v=20261119_cf42';
import { unsubscribeFromProjectRealtime } from '../core/realtimeSync.js?v=20261119_cf42';
import {
  getCurrentUser,
  saveCurrentUser,
  saveRegisteredUserAccount,
  getProjectByIdReadOnly,
  markSessionClosed,
  getPlanLimits,
  getUserPlanId
} from '../modules/portal/projectService.js?v=20261119_cf42';
import { isNightMode, toggleThemeMode } from '../ui/themeController.js?v=20261119_cf42';
import { showToast } from '../ui/notifications.js?v=20261119_cf42';
import { uploadManagedFile } from '../services/s3StorageService.js?v=20261119_cf42';
import { escapeHtml, syncThemeDataset, canAccessTab, renderAvatarHtml } from './mobileBridge.js?v=20261119_cf42';
import { renderMobileAuth } from './mobileAuth.js?v=20261119_cf42';
import { renderMobileProjects, openMobileProjectById } from './mobileProjects.js?v=20261119_cf42';
import { renderMobilePresupuesto } from './mobilePresupuesto.js?v=20261119_cf42';
import { renderMobileCalendario } from './mobileCalendario.js?v=20261119_cf42';
import { renderMobileCompras, setComprasExplosionMode } from './mobileCompras.js?v=20261119_cf42';
import { renderMobileAlmacen } from './mobileAlmacen.js?v=20261119_cf42';
import { renderMobileEstimaciones } from './mobileEstimaciones.js?v=20261119_cf42';
import { renderMobileBitacora } from './mobileBitacora.js?v=20261119_cf42';
import { renderMobileChat, setChatConceptFilter, getUnreadChatCount } from './mobileChat.js?v=20261119_cf42';

export const CONST_TABS = [
  { id: 'presupuesto', label: 'Presupuesto', icon: 'fa-solid fa-coins' },
  { id: 'calendario', label: 'Calendario', icon: 'fa-solid fa-calendar-days' },
  { id: 'compras', label: 'Compras', icon: 'fa-solid fa-cart-shopping' },
  { id: 'almacen', label: 'Almacén', icon: 'fa-solid fa-warehouse' },
  { id: 'estimaciones', label: 'Estimaciones', icon: 'fa-solid fa-file-invoice-dollar' },
  { id: 'bitacora', label: 'Bitácora', icon: 'fa-solid fa-book-bookmark' }
];

let screen = 'auth'; // 'auth' | 'projects' | 'workspace' | 'chat'
let activeTab = 'presupuesto';
let pendingReturnProjectId = '';

export function setMobileRoute({ nextScreen, nextTab, returnProjectId = '' }) {
  if (nextScreen) screen = nextScreen;
  if (nextTab) activeTab = nextTab;
  if (returnProjectId !== undefined) pendingReturnProjectId = returnProjectId;
  renderShell();
}

export function getMobileScreenState() {
  return { screen, activeTab };
}

export function renderShell() {
  const root = document.getElementById('mobile-app-root');
  if (!root) return;

  const user = getCurrentUser();
  const pId = getActiveProjectId();
  const proj = pId ? getProjectByIdReadOnly(pId) : null;

  if (!user && screen !== 'auth') {
    screen = 'auth';
  }
  if (user && screen === 'auth') {
    screen = proj ? 'workspace' : 'projects';
  }
  if ((screen === 'workspace' || screen === 'chat') && !proj) {
    screen = user ? 'projects' : 'auth';
  }

  const showBottomNav = screen === 'workspace' && Boolean(proj);
  const unreadChat = proj ? getUnreadChatCount(proj.id) : 0;
  const night = isNightMode();

  root.innerHTML = `
    <div class="m-app-shell">
      <header class="m-topbar">
        <button type="button" id="top-brand-btn" class="m-brand-btn" title="Ir a Mis Proyectos" aria-label="cubikar">
          <img src="assets/branding/cubikar_icon_transparent.png" alt="cubikar">
        </button>

        ${proj && (screen === 'workspace' || screen === 'chat') ? `
          <button type="button" id="top-proj-pill" class="m-proj-pill" title="Cambiar de proyecto">
            <i class="fa-solid fa-building" style="color:var(--primary);font-size:12px;"></i>
            <span class="m-proj-pill-title">${escapeHtml(state.settings?.projectName || proj.projectName || 'Obra')}</span>
            <i class="fa-solid fa-chevron-down" style="font-size:10px;color:var(--muted);"></i>
          </button>
        ` : `<div style="flex:1;min-width:0;"></div>`}

        <div class="m-topbar-actions">
          <button type="button" id="phone-theme-btn" class="m-icon-btn" aria-label="${night ? 'Cambiar a modo día' : 'Cambiar a modo noche'}">
            <i class="fa-solid ${night ? 'fa-moon' : 'fa-sun'}"></i>
          </button>

          ${proj && user ? `
            <button type="button" id="top-chat-btn" class="m-icon-btn ${screen === 'chat' ? 'is-active' : ''}" title="Chat del proyecto">
              <i class="fa-solid fa-comments"></i>
              ${unreadChat > 0 ? `<span class="m-badge">${unreadChat > 99 ? '99+' : unreadChat}</span>` : ''}
            </button>
          ` : ''}

          ${user ? `
            <button type="button" id="top-user-btn" class="m-avatar-btn" title="Mi Cuenta Cubikar">
              ${renderAvatarHtml(user, 36)}
            </button>
          ` : ''}
        </div>
      </header>

      <main id="mobile-main" class="m-main ${showBottomNav ? '' : 'no-bottom-nav'}"></main>

      ${showBottomNav ? `
        <nav class="m-bottom-nav" aria-label="Módulos de obra">
          ${CONST_TABS.map(t => {
            const allowed = canAccessTab(t.id);
            const active = activeTab === t.id;
            return `
              <button type="button" data-nav-tab="${t.id}" class="m-nav-item ${active ? 'is-active' : ''} ${allowed ? '' : 'is-locked'}">
                <i class="${t.icon}"></i>
                <span>${t.label}</span>
              </button>
            `;
          }).join('')}
        </nav>
      ` : ''}
    </div>
    <div id="m-sheet-root"></div>
  `;

  syncThemeDataset();

  document.getElementById('top-brand-btn')?.addEventListener('click', () => {
    if (!getCurrentUser()) return;
    exitWorkspaceToProjects();
  });

  document.getElementById('top-proj-pill')?.addEventListener('click', () => {
    exitWorkspaceToProjects();
  });

  document.getElementById('phone-theme-btn')?.addEventListener('click', () => {
    toggleThemeMode();
    syncThemeDataset();
  });

  document.getElementById('top-chat-btn')?.addEventListener('click', () => {
    screen = screen === 'chat' ? 'workspace' : 'chat';
    renderShell();
  });

  document.getElementById('top-user-btn')?.addEventListener('click', () => {
    openAccountSheet();
  });

  document.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.navTab;
      if (!canAccessTab(targetTab)) {
        showToast('No tienes permiso para acceder a esta pestaña.', 'warning');
        return;
      }
      activeTab = targetTab;
      renderShell();
    });
  });

  const main = document.getElementById('mobile-main');
  const sheetCtx = { openSheet, closeSheet };

  if (screen === 'auth') {
    renderMobileAuth(main, {
      returnProjectId: pendingReturnProjectId,
      onAuthSuccess: (retId) => {
        if (retId) {
          openMobileProjectById(retId, (id, nextTab) => {
            screen = 'workspace';
            activeTab = nextTab || 'presupuesto';
            renderShell();
          });
        } else {
          screen = 'projects';
          renderShell();
        }
      }
    });
    return;
  }

  if (screen === 'projects') {
    renderMobileProjects(main, {
      ...sheetCtx,
      onOpenProject: (id, nextTab) => {
        screen = 'workspace';
        activeTab = nextTab || 'presupuesto';
        renderShell();
      }
    });
    return;
  }

  if (screen === 'chat') {
    renderMobileChat(main, {
      onCloseChat: () => {
        screen = 'workspace';
        renderShell();
      }
    });
    return;
  }

  // Ensure user actually has access to activeTab
  if (!canAccessTab(activeTab)) {
    const firstAllowed = CONST_TABS.find(t => canAccessTab(t.id));
    activeTab = firstAllowed ? firstAllowed.id : 'almacen';
  }

  if (activeTab === 'presupuesto') {
    renderMobilePresupuesto(main, {
      ...sheetCtx,
      onOpenConceptChat: (node) => {
        setChatConceptFilter(node);
        screen = 'chat';
        renderShell();
      }
    });
  } else if (activeTab === 'calendario') {
    renderMobileCalendario(main, {
      ...sheetCtx,
      onJumpComprasExplosion: (days) => {
        setComprasExplosionMode(days);
        activeTab = 'compras';
        renderShell();
      }
    });
  } else if (activeTab === 'compras') {
    renderMobileCompras(main, sheetCtx);
  } else if (activeTab === 'almacen') {
    renderMobileAlmacen(main, sheetCtx);
  } else if (activeTab === 'estimaciones') {
    renderMobileEstimaciones(main, sheetCtx);
  } else if (activeTab === 'bitacora') {
    renderMobileBitacora(main, sheetCtx);
  }
}

export function refreshCurrentMobileView() {
  if (typeof document === 'undefined') return;
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
  if (document.getElementById('m-sheet-backdrop')) return;
  renderShell();
}

function exitWorkspaceToProjects() {
  try { unsubscribeFromProjectRealtime(); } catch (_) {}
  setActiveProjectId(null);
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('project');
    window.history.replaceState({}, '', u.pathname + (u.search || ''));
  } catch (_) {}
  screen = 'projects';
  renderShell();
}

export function openSheet({ title, bodyHtml, footerHtml = '' }) {
  closeSheet();
  const root = document.getElementById('m-sheet-root');
  if (!root) return;
  root.innerHTML = `
    <div id="m-sheet-backdrop" class="m-sheet-backdrop">
      <div class="m-sheet-panel" role="dialog" aria-modal="true">
        <div class="m-sheet-header">
          <strong style="font-size:15px;">${escapeHtml(title || '')}</strong>
          <button type="button" id="m-sheet-x" class="m-icon-btn" style="width:32px;height:32px;"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="m-sheet-body" class="m-sheet-body">${bodyHtml || ''}</div>
        ${footerHtml ? `<div class="m-sheet-footer">${footerHtml}</div>` : ''}
      </div>
    </div>
  `;
  document.getElementById('m-sheet-x')?.addEventListener('click', closeSheet);
  document.getElementById('m-sheet-backdrop')?.addEventListener('click', (ev) => {
    if (ev.target.id === 'm-sheet-backdrop') closeSheet();
  });
}

export function closeSheet() {
  const root = document.getElementById('m-sheet-root');
  if (root) root.innerHTML = '';
}

function openAccountSheet() {
  const user = getCurrentUser();
  if (!user) return;
  const plan = getPlanLimits(getUserPlanId(user));
  const night = isNightMode();

  openSheet({
    title: 'Mi Cuenta Cubikar',
    bodyHtml: `
      <div class="m-card-alt m-row" style="gap:12px;">
        <div class="m-avatar-btn" style="width:46px;height:46px;flex-shrink:0;">
          ${renderAvatarHtml(user, 46)}
        </div>
        <div style="min-width:0;flex:1;">
          <div style="font-size:14px;font-weight:800;">${escapeHtml(user.name || 'Usuario')}</div>
          <div style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(user.email || '')}</div>
          <span class="m-pill m-pill-blue" style="margin-top:4px;">Plan ${escapeHtml(plan.name)}</span>
        </div>
      </div>

      <button type="button" id="m-acc-projects" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-folder-open" style="color:var(--primary);"></i> Mis Proyectos
      </button>
      <button type="button" id="m-acc-edit" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-user-pen" style="color:var(--primary);"></i> Editar Mi Perfil
      </button>
      <button type="button" id="m-acc-theme" class="m-btn m-btn-outline" style="justify-content:space-between;">
        <span><i class="fa-solid ${night ? 'fa-moon' : 'fa-sun'}" style="color:var(--warn);"></i> Tema Visual (${night ? 'Noche' : 'Día'})</span>
        <span class="m-pill m-pill-neutral">Cambiar</span>
      </button>
      <button type="button" id="m-acc-arq" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-compass-drafting" style="color:var(--primary);"></i> Ir a cubikar Arquitectura
      </button>
      <button type="button" id="m-acc-portal" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-grid-2" style="color:var(--primary);"></i> Ir al Portal Ecosistema Cubikar
      </button>
      <button type="button" id="m-acc-desktop" class="m-btn m-btn-outline" style="justify-content:flex-start;">
        <i class="fa-solid fa-desktop"></i> Ver versión PC (Escritorio)
      </button>
      <button type="button" id="m-acc-logout" class="m-btn m-btn-outline" style="justify-content:flex-start;color:var(--danger);border-color:var(--danger);">
        <i class="fa-solid fa-right-from-bracket"></i> Cerrar Sesión
      </button>
      <button type="button" id="m-acc-logout-all" class="m-btn m-btn-danger m-btn-sm">
        <i class="fa-solid fa-shield-halved"></i> Cerrar Sesión en todos los dispositivos
      </button>
    `
  });

  document.getElementById('m-acc-projects')?.addEventListener('click', () => {
    closeSheet();
    exitWorkspaceToProjects();
  });

  document.getElementById('m-acc-theme')?.addEventListener('click', () => {
    toggleThemeMode();
    syncThemeDataset();
    openAccountSheet();
  });

  document.getElementById('m-acc-edit')?.addEventListener('click', () => {
    openEditProfileSheet(user);
  });

  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  document.getElementById('m-acc-arq')?.addEventListener('click', () => {
    const dest = isLocal ? '../ADM_ARQ/mobile.html' : 'https://arq.cubikar.app/mobile.html';
    window.location.href = appendSsoToUrlFromStorage(dest);
  });
  document.getElementById('m-acc-portal')?.addEventListener('click', () => {
    const dest = isLocal ? '../Cubikar/index.html' : 'https://cubikar.app';
    window.location.href = appendSsoToUrlFromStorage(dest);
  });

  document.getElementById('m-acc-desktop')?.addEventListener('click', () => {
    try { localStorage.setItem('cubikar_force_desktop', '1'); } catch (_) {}
    const u = new URL(window.location.href);
    const params = new URLSearchParams(u.search);
    params.delete('mobile');
    params.set('desktop', '1');
    const q = params.toString();
    window.location.href = `index.html${q ? '?' + q : ''}${u.hash || ''}`;
  });

  document.getElementById('m-acc-logout')?.addEventListener('click', async () => {
    closeSheet();
    if (user?.email) markSessionClosed(user.email);
    try { await signOut({ scope: 'local' }); } catch (_) {}
    saveCurrentUser(null);
    setActiveProjectId(null);
    screen = 'auth';
    renderShell();
  });

  document.getElementById('m-acc-logout-all')?.addEventListener('click', async () => {
    if (!confirm('¿Cerrar sesión en este celular y en todos tus dispositivos conectados?')) return;
    closeSheet();
    if (user?.email) markSessionClosed(user.email);
    try { await signOut({ scope: 'global' }); } catch (_) {}
    saveCurrentUser(null);
    setActiveProjectId(null);
    screen = 'auth';
    renderShell();
  });
}

function openEditProfileSheet(user) {
  let nextAvatar = user.avatar || '';
  openSheet({
    title: 'Editar Mi Perfil',
    bodyHtml: `
      <form id="m-ep-form" style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label class="m-label" for="m-ep-name">Nombre completo *</label>
          <input id="m-ep-name" required class="m-input" value="${escapeHtml(user.name || '')}">
        </div>
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-ep-sexo">Sexo</label>
            <select id="m-ep-sexo" class="m-select">
              ${['Masculino', 'Femenino', 'Otro'].map(s => `<option value="${s}" ${user.sexo === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="m-label" for="m-ep-dob">Nacimiento</label>
            <input id="m-ep-dob" type="date" class="m-input" value="${escapeHtml(user.dob || '1992-06-15')}">
          </div>
        </div>
        <label class="m-btn m-btn-outline m-btn-sm" style="cursor:pointer;">
          <i class="fa-solid fa-camera"></i> <span id="m-ep-foto-lbl">Cambiar foto de perfil</span>
          <input type="file" id="m-ep-foto" accept="image/*" style="display:none;">
        </label>
      </form>
    `,
    footerHtml: `
      <button type="button" id="m-ep-cancel" class="m-btn m-btn-outline">Cancelar</button>
      <button type="submit" form="m-ep-form" class="m-btn m-btn-primary">Guardar</button>
    `
  });

  document.getElementById('m-ep-cancel')?.addEventListener('click', closeSheet);
  document.getElementById('m-ep-foto')?.addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const res = await uploadManagedFile({ file: f, modulo: 'avatares', categoria: 'branding', preset: 'avatar', showFeedback: true, includeDataUrl: true });
      if (res.ok && res.dataUrl) {
        nextAvatar = res.dataUrl;
        document.getElementById('m-ep-foto-lbl').textContent = 'Foto actualizada';
      }
    } catch (err) {
      showToast(err?.message || 'Error al cargar foto.', 'error');
    }
  });

  document.getElementById('m-ep-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const updated = {
      ...user,
      name: document.getElementById('m-ep-name').value.trim(),
      sexo: document.getElementById('m-ep-sexo').value,
      dob: document.getElementById('m-ep-dob').value,
      avatar: nextAvatar
    };
    saveCurrentUser(updated);
    saveRegisteredUserAccount(updated);
    closeSheet();
    showToast('Perfil actualizado.', 'success');
    renderShell();
  });
}
