// js/mobile/mobileProjects.js
// Lista real de Proyectos ("Mis Proyectos" vs "Invitado"), invitaciones pendientes, papelera y creación de obra

import { setActiveProjectId, getStorageKey, getSettingsKey } from '../config/constants.js?v=20261119_cf43';
import { initStore } from '../state/store.js?v=20261119_cf43';
import { fetchCloudProjects } from '../core/cloudProjectService.js?v=20261119_cf43';
import { hydrateProjectModulesFromCloud } from '../core/cloudModulesSyncService.js?v=20261119_cf43';
import { isSupabaseConfigured } from '../core/supabaseClient.js?v=20261119_cf43';
import { subscribeToProjectRealtime, broadcastInvitationAccepted, broadcastInvitationRejected, requestPeerSync } from '../core/realtimeSync.js?v=20261119_cf43';
import { autoSyncCollaborationOnStartup, syncHostWorkspaceProjects } from '../core/collaborationCloudService.js?v=20261119_cf43';
import {
  getCurrentUser,
  getProjectsList,
  saveProjectsList,
  getProjectsForUser,
  getWorkspaceInviters,
  setActiveWorkspaceData,
  getPendingInvitationsForUser,
  acceptProjectInvitation,
  rejectProjectInvitation,
  canUserCreateProject,
  canUserInviteToProject,
  createNewProject,
  duplicateProject,
  loadSampleResidentialZipCatalog,
  getPlanLimits,
  getUserPlanId,
  getUserRoleInProject,
  getProjectById,
  getDeletedProjectsList
} from '../modules/portal/projectService.js?v=20261119_cf43';
import { openProjectTeamInvitesSheet } from '../modules/portal/inviteTokenService.js?v=20261119_cf43';
import {
  moveProjectToTrash,
  fetchTrashedProjectsForHost,
  restoreProjectFromTrash,
  permanentlyDeleteTrashedProject,
  getCachedTrashCount
} from '../modules/portal/trashService.js?v=20261119_cf43';
import { showToast } from '../ui/notifications.js?v=20261119_cf43';
import { escapeHtml, isBodegueroRestricted } from './mobileBridge.js?v=20261119_cf43';

let scopeTab = 'owned'; // 'owned' | 'invited'
let selectedInviterEmail = 'all';
let searchQuery = '';
let lastCloudRefreshAt = 0;

export function openMobileProjectById(projId, onEntered) {
  setActiveProjectId(projId);
  initStore();
  try { subscribeToProjectRealtime(projId); } catch (_) {}
  hydrateProjectModulesFromCloud(projId).catch(() => {});
  const nextTab = isBodegueroRestricted(projId) ? 'almacen' : 'presupuesto';
  onEntered?.(projId, nextTab);
}

export function renderMobileProjects(container, { openSheet, closeSheet, onOpenProject }) {
  if (!container) return;
  const user = getCurrentUser();
  if (!user) return;

  const uEmail = (user.email || '').toLowerCase().trim();
  const now = Date.now();
  if (now - lastCloudRefreshAt > 12000) {
    lastCloudRefreshAt = now;
    try { autoSyncCollaborationOnStartup(user); } catch (_) {}
    try { requestPeerSync(); } catch (_) {}
    if (isSupabaseConfigured() && user?.id) {
      reconcileProjectsFromCloud(user, () => renderMobileProjects(container, { openSheet, closeSheet, onOpenProject }));
    }
  }

  const allProjects = getProjectsForUser(user);
  const ownedProjects = allProjects.filter(p => {
    const owner = (p.ownerEmail || '').toLowerCase().trim();
    return !owner || owner === uEmail || owner === 'admin@constructora.com' || owner === 'local@cubikar.app';
  });
  const invitedProjects = allProjects.filter(p => {
    const owner = (p.ownerEmail || '').toLowerCase().trim();
    return Boolean(owner && owner !== uEmail && owner !== 'admin@constructora.com' && owner !== 'local@cubikar.app');
  });
  const inviters = getWorkspaceInviters(user, allProjects);
  const pendingInvites = getPendingInvitationsForUser(uEmail);

  const planId = getUserPlanId(user);
  const planLimits = getPlanLimits(planId);
  const createCheck = canUserCreateProject(user, scopeTab === 'owned' ? 'owned' : (selectedInviterEmail !== 'all' ? `owner:${selectedInviterEmail}` : 'owned'));
  const trashCount = getCachedTrashCount();

  let visible = scopeTab === 'owned' ? ownedProjects : invitedProjects;
  if (scopeTab === 'invited' && selectedInviterEmail !== 'all') {
    visible = visible.filter(p => (p.ownerEmail || '').toLowerCase().trim() === selectedInviterEmail);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    visible = visible.filter(p =>
      String(p.projectName || p.name || '').toLowerCase().includes(q)
      || String(p.companyName || '').toLowerCase().includes(q)
      || String(p.projectLocation || '').toLowerCase().includes(q)
    );
  }

  container.innerHTML = `
    <div class="m-row-between">
      <div>
        <h1 class="m-title">Proyectos de Obra</h1>
        <p class="m-subtitle">Plan ${escapeHtml(planLimits.name)} &bull; ${ownedProjects.length}/${planLimits.maxProjects} obras propias</p>
      </div>
      <div class="m-row">
        <button type="button" id="m-btn-trash" class="m-icon-btn" title="Papelera (${trashCount})">
          <i class="fa-solid fa-trash-can"></i>
          ${trashCount > 0 ? `<span class="m-badge">${trashCount > 99 ? '99+' : trashCount}</span>` : ''}
        </button>
        <button type="button" id="m-btn-new-proj" class="m-btn m-btn-primary m-btn-sm">
          <i class="fa-solid fa-plus"></i> Nuevo
        </button>
      </div>
    </div>

    ${pendingInvites.length > 0 ? `
      <div class="m-card" style="border-color:var(--primary);background:var(--primary-soft);">
        <div class="m-row-between" style="margin-bottom:8px;">
          <span style="font-size:12.5px;font-weight:800;color:var(--primary);">
            <i class="fa-solid fa-envelope-open-text"></i> Invitaciones pendientes (${pendingInvites.length})
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${pendingInvites.map(inv => `
            <div class="m-card-alt" style="padding:10px;">
              <div style="font-size:12.5px;font-weight:800;">${escapeHtml(inv.projectName || 'Obra compartida')}</div>
              <div style="font-size:11px;color:var(--muted);margin:2px 0 8px;">
                Invitado por <strong>${escapeHtml(inv.invitedByName || inv.invitedByEmail || 'Anfitrión')}</strong> &bull; Rol: ${escapeHtml(inv.roleLabel || inv.role || 'Colaborador')}
              </div>
              <div class="m-row">
                <button type="button" data-accept-inv="${escapeHtml(inv.id)}" class="m-btn m-btn-success m-btn-sm" style="flex:1;">
                  <i class="fa-solid fa-check"></i> Aceptar
                </button>
                <button type="button" data-reject-inv="${escapeHtml(inv.id)}" class="m-btn m-btn-outline m-btn-sm">
                  <i class="fa-solid fa-xmark"></i> Rechazar
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="m-segmented">
      <button type="button" data-scope-tab="owned" class="m-seg-btn ${scopeTab === 'owned' ? 'is-active' : ''}">
        <i class="fa-solid fa-crown"></i> Mis Proyectos (${ownedProjects.length})
      </button>
      <button type="button" data-scope-tab="invited" class="m-seg-btn ${scopeTab === 'invited' ? 'is-active' : ''}">
        <i class="fa-solid fa-users"></i> Invitado (${invitedProjects.length})
      </button>
    </div>

    ${scopeTab === 'invited' && inviters.length > 0 ? `
      <div class="m-chip-bar">
        <button type="button" data-inviter="all" class="m-chip ${selectedInviterEmail === 'all' ? 'is-active' : ''}">
          <i class="fa-solid fa-layer-group"></i> Todos (${invitedProjects.length})
        </button>
        ${inviters.map(inv => `
          <button type="button" data-inviter="${escapeHtml(inv.email)}" class="m-chip ${selectedInviterEmail === inv.email ? 'is-active' : ''}">
            <i class="fa-solid fa-briefcase"></i> ${escapeHtml(inv.name || inv.email)}
          </button>
        `).join('')}
      </div>
    ` : ''}

    <div style="position:relative;">
      <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px;"></i>
      <input type="search" id="m-proj-search" class="m-input" value="${escapeHtml(searchQuery)}" placeholder="Buscar obra, empresa o ubicación..." style="padding-left:34px;">
    </div>

    ${visible.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:28px 16px;">
        <i class="fa-solid fa-folder-open" style="font-size:28px;color:var(--muted);margin-bottom:8px;"></i>
        <div style="font-size:14px;font-weight:800;">${scopeTab === 'owned' ? 'Sin obras propias todavía' : 'Sin obras compartidas aquí'}</div>
        <p class="m-subtitle" style="margin-bottom:14px;">
          ${scopeTab === 'owned' ? 'Crea una nueva obra desde aquí y se sincronizará también con tu versión PC.' : 'Las obras donde te inviten otros arquitectos o constructoras aparecerán aquí.'}
        </p>
        ${scopeTab === 'owned' ? `<button type="button" id="m-empty-new-proj" class="m-btn m-btn-primary m-btn-sm"><i class="fa-solid fa-plus"></i> Crear primera obra</button>` : ''}
      </div>
    ` : `
      <div class="m-grid-cards">
        ${visible.map(proj => renderProjectCardHtml(proj, user)).join('')}
      </div>
    `}
  `;

  container.querySelectorAll('[data-scope-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      scopeTab = btn.dataset.scopeTab;
      if (scopeTab === 'owned') {
        selectedInviterEmail = 'all';
        setActiveWorkspaceData(uEmail, user.name || uEmail);
      }
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  container.querySelectorAll('[data-inviter]').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedInviterEmail = btn.dataset.inviter;
      if (selectedInviterEmail === 'all') {
        setActiveWorkspaceData(uEmail, user.name || uEmail);
      } else {
        const host = inviters.find(i => i.email === selectedInviterEmail);
        setActiveWorkspaceData(selectedInviterEmail, host?.name || selectedInviterEmail);
        syncHostWorkspaceProjects(selectedInviterEmail).catch(() => {});
      }
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  const searchInput = container.querySelector('#m-proj-search');
  searchInput?.addEventListener('input', (ev) => {
    searchQuery = ev.target.value;
    const caret = ev.target.selectionStart;
    renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    const nextInput = container.querySelector('#m-proj-search');
    if (nextInput) {
      nextInput.focus();
      try { nextInput.setSelectionRange(caret, caret); } catch (_) {}
    }
  });

  container.querySelectorAll('[data-accept-inv]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const invId = btn.dataset.acceptInv;
      btn.disabled = true;
      try {
        const res = await acceptProjectInvitation(invId, user);
        if (res) {
          try { broadcastInvitationAccepted(res.invitation || { id: invId }, user); } catch (_) {}
          showToast('Invitación aceptada. Obra disponible.', 'success');
          lastCloudRefreshAt = 0;
          renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
        }
      } catch (err) {
        showToast(err?.message || 'Error al aceptar invitación.', 'error');
        btn.disabled = false;
      }
    });
  });

  container.querySelectorAll('[data-reject-inv]').forEach(btn => {
    btn.addEventListener('click', () => {
      const invId = btn.dataset.rejectInv;
      const rej = rejectProjectInvitation(invId);
      if (rej) {
        try { broadcastInvitationRejected(rej, user); } catch (_) {}
      }
      showToast('Invitación rechazada.', 'info');
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  container.querySelectorAll('[data-open-proj]').forEach(btn => {
    btn.addEventListener('click', () => {
      openMobileProjectById(btn.dataset.openProj, onOpenProject);
    });
  });

  container.querySelectorAll('[data-team-proj]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const proj = getProjectById(btn.dataset.teamProj);
      if (proj) {
        openProjectTeamInvitesSheet(proj, {
          openSheet,
          closeSheet,
          onChanged: () => renderMobileProjects(container, { openSheet, closeSheet, onOpenProject })
        });
      }
    });
  });

  container.querySelectorAll('[data-dup-proj]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const dup = duplicateProject(btn.dataset.dupProj);
      if (dup) {
        showToast(`Obra "${dup.projectName}" duplicada.`, 'success');
        renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
      }
    });
  });

  container.querySelectorAll('[data-trash-proj]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const pId = btn.dataset.trashProj;
      const name = btn.dataset.trashName || 'esta obra';
      if (!confirm(`¿Mover "${name}" a la papelera de reciclaje?`)) return;
      const res = await moveProjectToTrash(pId);
      if (!res?.success) {
        showToast(res?.reason || 'No se pudo mover la obra a la papelera.', 'error');
        return;
      }
      showToast('Obra movida a la papelera.', 'info');
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  const triggerCreate = () => {
    if (!createCheck.allowed) {
      showToast(createCheck.reason || 'Límite de obras alcanzado para tu plan.', 'warning');
      return;
    }
    openCreateProjectSheet({ container, openSheet, closeSheet, onOpenProject, check: createCheck });
  };

  container.querySelector('#m-btn-new-proj')?.addEventListener('click', triggerCreate);
  container.querySelector('#m-empty-new-proj')?.addEventListener('click', triggerCreate);
  container.querySelector('#m-btn-trash')?.addEventListener('click', () => {
    openTrashSheet({ container, openSheet, closeSheet, onOpenProject });
  });
}

function renderProjectCardHtml(proj, user) {
  const uEmail = (user.email || '').toLowerCase().trim();
  const owner = (proj.ownerEmail || '').toLowerCase().trim();
  const isOwner = !owner || owner === uEmail || owner === 'admin@constructora.com';
  const roleInfo = getUserRoleInProject(proj.id, user);
  const hideMoney = isBodegueroRestricted(proj.id, user);
  const sym = proj.currencySymbol || '$';
  const totalTxt = hideMoney
    ? '<span class="m-pill m-pill-neutral"><i class="fa-solid fa-warehouse"></i> Modo Almacén</span>'
    : `<span class="m-mono" style="font-size:14px;font-weight:800;color:var(--primary);">${escapeHtml(sym)}${Number(proj.totalAmount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
  const logoHtml = proj.companyLogo
    ? `<img src="${escapeHtml(proj.companyLogo)}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover;border:1px solid var(--border);">`
    : `<div style="width:40px;height:40px;border-radius:10px;background:var(--primary-soft);color:var(--primary);font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px;">${escapeHtml((proj.projectName || 'O')[0].toUpperCase())}</div>`;

  const badgeRole = isOwner
    ? '<span class="m-pill m-pill-blue"><i class="fa-solid fa-crown"></i> Propio</span>'
    : `<span class="m-pill m-pill-green"><i class="fa-solid fa-user-check"></i> ${escapeHtml(roleInfo?.label || 'Colaborador')}</span>`;

  return `
    <div class="m-card" style="display:flex;flex-direction:column;gap:10px;">
      <div class="m-row" style="align-items:flex-start;cursor:pointer;" data-open-proj="${escapeHtml(proj.id)}">
        ${logoHtml}
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:800;line-height:1.25;">${escapeHtml(proj.projectName || proj.name || 'Sin nombre')}</div>
          <div style="font-size:11.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(proj.companyName || 'Constructora')} ${proj.projectLocation ? '&bull; ' + escapeHtml(proj.projectLocation) : ''}
          </div>
        </div>
        ${badgeRole}
      </div>

      <div class="m-row-between" style="padding-top:8px;border-top:1px solid var(--border);">
        <div>
          <div style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;">${escapeHtml(proj.tipoObra || 'Edificación')} &bull; ${Number(proj.conceptsCount || 0)} conc.</div>
          <div style="margin-top:2px;">${totalTxt}</div>
        </div>
        <div class="m-row">
          ${canUserInviteToProject(proj.id, user).allowed ? `
            <button type="button" data-team-proj="${escapeHtml(proj.id)}" class="m-icon-btn" style="width:32px;height:32px;font-size:12px;color:var(--primary);" title="Equipo e invitaciones">
              <i class="fa-solid fa-user-plus"></i>
            </button>
          ` : ''}
          ${isOwner ? `
            <button type="button" data-dup-proj="${escapeHtml(proj.id)}" class="m-icon-btn" style="width:32px;height:32px;font-size:12px;" title="Duplicar">
              <i class="fa-regular fa-copy"></i>
            </button>
            <button type="button" data-trash-proj="${escapeHtml(proj.id)}" data-trash-name="${escapeHtml(proj.projectName || '')}" class="m-icon-btn" style="width:32px;height:32px;font-size:12px;color:var(--danger);" title="Mover a papelera">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          ` : ''}
          <button type="button" data-open-proj="${escapeHtml(proj.id)}" class="m-btn m-btn-primary m-btn-sm">
            Abrir <i class="fa-solid fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function openCreateProjectSheet({ container, openSheet, closeSheet, onOpenProject, check }) {
  openSheet({
    title: 'Nueva Obra',
    bodyHtml: `
      <form id="m-create-proj-form" style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <label class="m-label" for="m-cp-name">Nombre de la obra *</label>
          <input id="m-cp-name" class="m-input" required placeholder="Ej. Residencia Valle Real">
        </div>
        <div>
          <label class="m-label" for="m-cp-company">Empresa o responsable</label>
          <input id="m-cp-company" class="m-input" placeholder="Ej. Constructora Cubikar S.A." value="${escapeHtml(check.isHostContext ? check.hostName : '')}">
        </div>
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-cp-loc">Ubicación</label>
            <input id="m-cp-loc" class="m-input" placeholder="Ciudad, Estado">
          </div>
          <div>
            <label class="m-label" for="m-cp-tipo">Tipo de obra</label>
            <select id="m-cp-tipo" class="m-select">
              <option value="Edificación">Edificación</option>
              <option value="Residencial">Residencial</option>
              <option value="Comercial">Comercial</option>
              <option value="Urbanización">Urbanización</option>
              <option value="Remodelación">Remodelación</option>
            </select>
          </div>
        </div>
        <div>
          <label class="m-label" for="m-cp-tpl">Plantilla inicial</label>
          <select id="m-cp-tpl" class="m-select">
            <option value="demo">Catálogo base de muestra (Residencial APU)</option>
            <option value="blank">Obra en blanco (desde cero)</option>
          </select>
        </div>
        <label class="m-row" style="font-size:12px;color:var(--text-soft);cursor:pointer;">
          <input type="checkbox" id="m-cp-sobre" checked style="width:16px;height:16px;">
          <span>Aplicar factor de sobrecosto base (Indirectos 12% + Utilidad 10%)</span>
        </label>
      </form>
    `,
    footerHtml: `
      <button type="button" id="m-cp-cancel" class="m-btn m-btn-outline">Cancelar</button>
      <button type="submit" form="m-create-proj-form" id="m-cp-save" class="m-btn m-btn-primary">
        <i class="fa-solid fa-check"></i> Crear y Abrir
      </button>
    `
  });

  document.getElementById('m-cp-cancel')?.addEventListener('click', closeSheet);
  document.getElementById('m-create-proj-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const saveBtn = document.getElementById('m-cp-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';
    }
    const tpl = document.getElementById('m-cp-tpl')?.value || 'demo';
    const applySobre = Boolean(document.getElementById('m-cp-sobre')?.checked);
    let sampleTree = null;
    if (tpl === 'demo') {
      try { sampleTree = await loadSampleResidentialZipCatalog(); } catch (_) {}
    }
    const payload = {
      projectName: document.getElementById('m-cp-name').value.trim(),
      companyName: document.getElementById('m-cp-company').value.trim() || 'Constructora',
      projectLocation: document.getElementById('m-cp-loc').value.trim(),
      tipoObra: document.getElementById('m-cp-tipo').value,
      currency: 'MXN',
      currencySymbol: '$',
      applySobrecosto: applySobre,
      pctIndirectos: applySobre ? 12 : 0,
      pctFinanciamiento: 0,
      pctUtilidad: applySobre ? 10 : 0,
      pctAdicionales: 0,
      pctSegurosFianzas: 1,
      pctFasar: 70,
      template: tpl,
      treeData: sampleTree
    };
    if (check.isHostContext && check.hostEmail) {
      payload.ownerEmail = check.hostEmail;
      payload.ownerPlanId = check.planId;
      payload.hostName = check.hostName;
    }
    const created = createNewProject(payload);
    closeSheet();
    showToast(`Obra "${created.projectName}" creada.`, 'success');
    openMobileProjectById(created.id, onOpenProject);
  });
}

async function openTrashSheet({ container, openSheet, closeSheet, onOpenProject }) {
  openSheet({
    title: 'Papelera de Proyectos',
    bodyHtml: '<div style="text-align:center;padding:24px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando papelera...</div>',
    footerHtml: '<button type="button" id="m-trash-close" class="m-btn m-btn-outline">Cerrar</button>'
  });
  document.getElementById('m-trash-close')?.addEventListener('click', closeSheet);

  const items = await fetchTrashedProjectsForHost({ force: true }).catch(() => []);
  const body = document.querySelector('#m-sheet-body');
  if (!body) return;

  if (!items || items.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;"><i class="fa-solid fa-trash-can" style="font-size:26px;margin-bottom:8px;display:block;"></i>La papelera está vacía.</div>';
    return;
  }

  body.innerHTML = items.map(item => `
    <div class="m-card-alt m-row-between">
      <div style="min-width:0;flex:1;">
        <div style="font-size:13px;font-weight:800;">${escapeHtml(item.projectName || item.name || 'Obra')}</div>
        <div style="font-size:11px;color:var(--muted);">Eliminado: ${escapeHtml(String(item.trashedAt || '').slice(0, 10))}</div>
      </div>
      <div class="m-row">
        <button type="button" data-restore-id="${escapeHtml(item.id)}" class="m-btn m-btn-success m-btn-sm"><i class="fa-solid fa-rotate-left"></i> Restaurar</button>
        <button type="button" data-purge-id="${escapeHtml(item.id)}" class="m-btn m-btn-danger m-btn-sm"><i class="fa-solid fa-fire"></i></button>
      </div>
    </div>
  `).join('');

  body.querySelectorAll('[data-restore-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await restoreProjectFromTrash(btn.dataset.restoreId);
      if (!res?.success) {
        showToast(res?.reason || 'No se pudo restaurar la obra.', 'error');
        return;
      }
      closeSheet();
      showToast('Obra restaurada.', 'success');
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });

  body.querySelectorAll('[data-purge-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar permanentemente esta obra? Esta acción no se puede deshacer.')) return;
      const res = await permanentlyDeleteTrashedProject(btn.dataset.purgeId);
      if (!res?.success) {
        showToast(res?.reason || 'No se pudo eliminar definitivamente la obra.', 'error');
        return;
      }
      closeSheet();
      showToast('Obra eliminada permanentemente.', 'info');
      renderMobileProjects(container, { openSheet, closeSheet, onOpenProject });
    });
  });
}

function reconcileProjectsFromCloud(user, onUpdated) {
  fetchCloudProjects().then(cloudList => {
    if (!Array.isArray(cloudList)) return;
    const deletedList = getDeletedProjectsList();
    const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);
    const localList = getProjectsList();
    const myEmail = (user.email || '').toLowerCase().trim();
    const cloudIds = new Set(cloudList.map(cp => cp.id));
    let changed = false;

    const cleaned = localList.filter(lp => {
      if (isDeleted(lp.id) || isDeleted(lp.cloudId)) {
        try {
          localStorage.removeItem(getSettingsKey(lp.id));
          localStorage.removeItem(getStorageKey(lp.id));
        } catch (_) {}
        changed = true;
        return false;
      }
      const owner = (lp.ownerEmail || '').toLowerCase().trim();
      const isMine = !owner || owner === myEmail || owner === 'admin@constructora.com' || owner === 'local@cubikar.app';
      if (!isMine && lp.isCloudSynced && !cloudIds.has(lp.id) && !cloudIds.has(lp.cloudId)) {
        changed = true;
        return false;
      }
      return true;
    });

    cloudList.forEach(cp => {
      if (isDeleted(cp.id) || isDeleted(cp.cloudId)) return;
      const idx = cleaned.findIndex(lp => lp.id === cp.id || lp.cloudId === cp.id);
      if (idx === -1) {
        cleaned.unshift(cp);
        changed = true;
      } else {
        const merged = { ...cleaned[idx], ...cp, isCloudSynced: true };
        if (JSON.stringify(merged) !== JSON.stringify(cleaned[idx])) {
          cleaned[idx] = merged;
          changed = true;
        }
      }
    });

    if (changed || cleaned.length !== localList.length) {
      saveProjectsList(cleaned, { skipCloudSync: true });
      onUpdated?.();
    }
  }).catch(() => {});
}
