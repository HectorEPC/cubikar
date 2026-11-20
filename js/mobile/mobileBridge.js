// js/mobile/mobileBridge.js
// Puente aislado entre los modelos/servicios reales de PC y el entorno móvil/tablet.

import { getActiveProjectId } from '../config/constants.js?v=20261119_cf40';
import { getCurrentUser, getProjectByIdReadOnly, canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf40';
import { isNightMode } from '../ui/themeController.js?v=20261119_cf40';
import { isTabLocked } from '../ui/tabLockController.js?v=20261119_cf40';
import { autoSyncCollaborationOnStartup, syncHostWorkspaceProjects, triggerDebouncedCloudStateSync } from '../core/collaborationCloudService.js?v=20261119_cf40';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function syncThemeDataset() {
  if (typeof document === 'undefined') return;
  const night = isNightMode();
  document.documentElement.setAttribute('data-theme', night ? 'night' : 'day');
  document.documentElement.classList.toggle('dark-mode', night);
  const btn = document.getElementById('phone-theme-btn');
  if (btn) {
    btn.innerHTML = night
      ? '<i class="fa-solid fa-moon"></i>'
      : '<i class="fa-solid fa-sun"></i>';
    btn.setAttribute('aria-label', night ? 'Cambiar a modo día' : 'Cambiar a modo noche');
    btn.title = night ? 'Modo noche activo (tocar para modo día)' : 'Modo día activo (tocar para modo noche)';
  }
}

export function canAccessTab(tabId, projectId = null) {
  const user = getCurrentUser();
  const pId = projectId || getActiveProjectId();
  const proj = getProjectByIdReadOnly(pId);

  if (!user || !user.email) {
    return !proj || !proj.ownerEmail;
  }
  const uEmail = user.email.toLowerCase().trim();
  if (!proj) return false;

  const ownerEmail = (proj.ownerEmail || '').toLowerCase().trim();
  if (ownerEmail && ownerEmail === uEmail) return true;

  if (!Array.isArray(proj.members) || proj.members.length === 0) return false;
  const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === uEmail);
  if (!mem || mem.status === 'pending' || mem.status === 'rejected') return false;

  if (Array.isArray(mem.allowedTabs)) {
    if (tabId === 'presupuesto') {
      return mem.allowedTabs.includes('presupuesto') || mem.allowedTabs.includes('cat') || mem.allowedTabs.includes('insumos');
    }
    return mem.allowedTabs.includes(tabId);
  }
  return mem.role === 'editar';
}

export function isBodegueroRestricted(projectId = null, userOverride = null) {
  const user = userOverride || getCurrentUser();
  const pId = projectId || getActiveProjectId();
  const proj = getProjectByIdReadOnly(pId);
  if (!user || !user.email || !proj) return false;

  const uEmail = user.email.toLowerCase().trim();
  const ownerEmail = (proj.ownerEmail || '').toLowerCase().trim();
  if (!ownerEmail || ownerEmail === uEmail) return false;

  const mem = Array.isArray(proj.members)
    ? proj.members.find(m => (m.email || '').toLowerCase().trim() === uEmail)
    : null;
  if (!mem || mem.status === 'pending' || mem.status === 'rejected') return false;

  if (Array.isArray(mem.allowedTabs)) {
    const financialTabs = ['presupuesto', 'cat', 'insumos', 'compras', 'estimaciones'];
    const hasFinance = financialTabs.some(t => mem.allowedTabs.includes(t));
    if (!hasFinance && mem.allowedTabs.includes('almacen')) return true;
  }
  return mem.role === 'almacenista' || mem.role === 'bodeguero';
}

export function canEditTab(tabId, projectId = null) {
  const pId = projectId || getActiveProjectId();
  if (!canCurrentUserEditProject(pId)) return false;
  if (!canAccessTab(tabId, pId)) return false;
  const lockKey = tabId === 'presupuesto' ? 'cat' : tabId;
  return !isTabLocked(lockKey);
}

export function userInitials(name = '', email = '') {
  const base = String(name || email || 'U').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase() || 'U';
}

export function safeAvatarUrl(user) {
  const raw = user?.avatar || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '';
  return trimmed;
}

export function renderAvatarHtml(user, sizePx = 34) {
  const url = safeAvatarUrl(user);
  if (url) {
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(user?.name || 'Usuario')}" style="width:${sizePx}px;height:${sizePx}px;object-fit:cover;border-radius:999px;display:block;">`;
  }
  return `<span>${escapeHtml(userInitials(user?.name, user?.email))}</span>`;
}

export function registerMobileBridgeHooks(handlers = {}) {
  if (typeof window === 'undefined') return;

  window.autoSyncCollaborationOnStartup = autoSyncCollaborationOnStartup;
  window.syncHostWorkspaceProjects = syncHostWorkspaceProjects;
  window.triggerDebouncedCloudStateSync = triggerDebouncedCloudStateSync;
  window.canCurrentUserAccessTab = (tabId) => canAccessTab(tabId);
  window.canCurrentUserEditProject = (pId) => canCurrentUserEditProject(pId);

  const rerenderWorkspace = () => handlers.onWorkspaceRefresh?.();
  const rerenderPortal = () => handlers.onPortalRefresh?.();

  window.updateGrandTotal = rerenderWorkspace;
  window.renderTAB1 = rerenderWorkspace;
  window.onRemoteComprasOrAlmacenChange = rerenderWorkspace;
  window.applyTabLocksToDOM = rerenderWorkspace;
  window.renderPortalDashboard = rerenderPortal;
  window.refreshProjectsGridUI = rerenderPortal;
  window.renderSidebarNotificationsUI = () => handlers.onChatRefresh?.();
  window.renderProjectChatDock = () => handlers.onChatRefresh?.();
  window.showPortalView = (view, projId) => handlers.onShowPortalView?.(view, projId);
  window.openProjectInWorkspace = (projId) => handlers.onOpenProject?.(projId);
  window.goToProjectsDashboard = () => handlers.onGoProjects?.();
  window.exitProjectToPortal = () => handlers.onGoProjects?.();

  window.addEventListener('cubikar:cloud-modules-hydrated', () => {
    rerenderWorkspace();
    handlers.onChatRefresh?.();
  });
}
