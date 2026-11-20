// js/mobile/mobileApp.js
// Punto de entrada paralelo para la versión móvil y tablet de cubikar Construcción

import { getActiveProjectId, setActiveProjectId } from '../config/constants.js?v=20261119_cf37';
import { initStore } from '../state/store.js?v=20261119_cf37';
import {
  initAuthListener,
  hasPendingIncomingSsoSession,
  hydrateIncomingSsoSession,
  hasOversizedLocalJwt,
  ensureCompactAuthSession
} from '../core/authService.js?v=20261119_cf37';
import { fetchCloudProjects } from '../core/cloudProjectService.js?v=20261119_cf37';
import { hydrateProjectModulesFromCloud } from '../core/cloudModulesSyncService.js?v=20261119_cf37';
import { isSupabaseConfigured } from '../core/supabaseClient.js?v=20261119_cf37';
import { initGlobalRealtimeSync, subscribeToProjectRealtime } from '../core/realtimeSync.js?v=20261119_cf37';
import { syncPendingMediaUploads } from '../services/s3StorageService.js?v=20261119_cf37';
import {
  enforceGlobalSessionRevocation,
  getCurrentUser,
  getProjectById,
  getProjectsList,
  saveProjectsList
} from '../modules/portal/projectService.js?v=20261119_cf37';
import { initThemeMode, setThemeRenderCallback } from '../ui/themeController.js?v=20261119_cf37';
import { setTabLockRenderCallback } from '../ui/tabLockController.js?v=20261119_cf37';
import { setProjectChatRefreshCallback } from '../modules/chat/projectChat.js?v=20261119_cf37';
import { showToast } from '../ui/notifications.js?v=20261119_cf37';
import { registerMobileBridgeHooks, syncThemeDataset, isBodegueroRestricted } from './mobileBridge.js?v=20261119_cf37';
import { renderShell, setMobileRoute, refreshCurrentMobileView } from './mobileShell.js?v=20261118_c2';
import { openMobileProjectById } from './mobileProjects.js?v=20261119_cf37';

async function bootstrapMobileConst() {
  initThemeMode();
  syncThemeDataset();
  setThemeRenderCallback(() => {
    syncThemeDataset();
  });
  setTabLockRenderCallback(() => refreshCurrentMobileView());
  setProjectChatRefreshCallback(() => refreshCurrentMobileView());

  registerMobileBridgeHooks({
    onWorkspaceRefresh: () => refreshCurrentMobileView(),
    onPortalRefresh: () => refreshCurrentMobileView(),
    onChatRefresh: () => refreshCurrentMobileView(),
    onShowPortalView: (view, projId = '') => {
      setMobileRoute({
        nextScreen: view === 'login' ? 'auth' : 'projects',
        returnProjectId: projId || ''
      });
    },
    onOpenProject: (projId) => {
      openMobileProjectById(projId, (_id, nextTab) => {
        setMobileRoute({ nextScreen: 'workspace', nextTab });
      });
    },
    onGoProjects: () => {
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: 'projects' });
    }
  });

  if (hasPendingIncomingSsoSession() || hasOversizedLocalJwt()) {
    try {
      await Promise.race([
        (async () => {
          if (hasPendingIncomingSsoSession()) await hydrateIncomingSsoSession();
          await ensureCompactAuthSession();
        })(),
        new Promise(resolve => setTimeout(resolve, 6000))
      ]);
    } catch (_) {}
  }

  initAuthListener((user) => {
    if (!user) {
      setActiveProjectId(null);
      setMobileRoute({ nextScreen: 'auth' });
    } else {
      refreshCurrentMobileView();
    }
  });

  enforceGlobalSessionRevocation();
  try { initGlobalRealtimeSync(); } catch (_) {}

  const urlParams = new URLSearchParams(window.location.search);
  const projIdFromUrl = urlParams.get('project');
  const requestedTab = urlParams.get('tab');
  const user = getCurrentUser();

  if (projIdFromUrl) {
    if (!user) {
      setMobileRoute({ nextScreen: 'auth', returnProjectId: projIdFromUrl });
      return;
    }
    let proj = getProjectById(projIdFromUrl);
    if (!proj && isSupabaseConfigured()) {
      try {
        const cloudList = await fetchCloudProjects();
        if (Array.isArray(cloudList) && cloudList.length > 0) {
          const cur = getProjectsList();
          cloudList.forEach(cp => {
            const i = cur.findIndex(lp => lp.id === cp.id || lp.cloudId === cp.id);
            if (i === -1) cur.unshift(cp);
            else cur[i] = { ...cur[i], ...cp, isCloudSynced: true };
          });
          saveProjectsList(cur, { skipCloudSync: true });
          proj = getProjectById(projIdFromUrl);
        }
      } catch (_) {}
    }
    if (proj) {
      setActiveProjectId(proj.id);
      initStore();
      try { subscribeToProjectRealtime(proj.id); } catch (_) {}
      hydrateProjectModulesFromCloud(proj.id).catch(() => {});
      syncPendingMediaUploads(proj.id).catch(() => {});
      const fallbackTab = isBodegueroRestricted(proj.id) ? 'almacen' : 'presupuesto';
      setMobileRoute({ nextScreen: 'workspace', nextTab: requestedTab || fallbackTab });
      return;
    }
    showToast('No se encontró la obra especificada.', 'warning');
  }

  setActiveProjectId(null);
  if (user) {
    setMobileRoute({ nextScreen: 'projects' });
  } else {
    setMobileRoute({ nextScreen: 'auth' });
  }
}

window.addEventListener('online', () => {
  const activePId = getActiveProjectId();
  if (activePId) {
    syncPendingMediaUploads(activePId).then(res => {
      if (res?.synced > 0) showToast(`Nube sincronizada: ${res.synced} archivo(s) subidos.`, 'success');
    }).catch(() => {});
  }
});

bootstrapMobileConst();
