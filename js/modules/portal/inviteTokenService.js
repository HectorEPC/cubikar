// js/modules/portal/inviteTokenService.js
// Flujo completo de Invitaciones por Correo Electrónico con Tokens 256-bit (SHA-256 en servidor)
// Compartido entre Desktop (portalController.js) y Móvil (mobileApp.js / mobileAuth.js / mobileProjects.js)

import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js?v=20261119_cf43';
import {
  isValidUUID,
  resolveCloudProjectId,
  syncProjectToCloud,
  invalidateCloudProjectsCache,
  fetchCloudProjects
} from '../../core/cloudProjectService.js?v=20261119_cf43';
import {
  getCurrentUser,
  getProjectsList,
  saveProjectsList,
  getStoredInvitations,
  canUserInviteToProject,
  createProjectInvitation,
  rejectProjectInvitation,
  isProjectMarkedDeleted
} from './projectService.js?v=20261119_cf43';
import { showToast } from '../../ui/notifications.js?v=20261119_cf43';

const APP_ORIGIN = 'const';
export const INVITE_TOKEN_STORAGE_KEY = 'cubikar_pending_invite_token_v1';
const INVITE_META_STORAGE_KEY = 'cubikar_pending_invite_meta_v1';
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

const ROLE_LABELS = {
  editar: { label: 'Editar', desc: 'Control total de la obra, conceptos/APU, estimaciones y configuración.', color: '#2563eb' },
  escribir: { label: 'Escribir', desc: 'Captura y edición de conceptos, avances e insumos según pestañas autorizadas.', color: '#059669' },
  leer: { label: 'Leer', desc: 'Solo consulta y descarga de reportes sin modificar datos de la obra.', color: '#d97706' }
};

const TAB_LABELS_CONST = {
  cat: 'Catálogo',
  insumos: 'Insumos',
  calendario: 'Calendario',
  compras: 'Compras',
  almacen: 'Almacén',
  estimaciones: 'Estimaciones',
  bitacora: 'Bitácora'
};

const TAB_LABELS_ARQ = {
  alcances: 'Alcances',
  presupuesto: 'Presupuesto',
  seguimiento: 'Seguimiento',
  calendario: 'Calendario',
  estimaciones: 'Estimaciones'
};

let verifyInFlightPromise = null;
let lastVerifiedSignature = '';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function maskEmailAddress(email) {
  const clean = String(email || '').toLowerCase().trim();
  const at = clean.indexOf('@');
  if (at <= 0) return '•••••';
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}•••••@${domain}`;
}

export function getInviteAppOrigin() {
  return APP_ORIGIN;
}

export function getPendingInviteToken() {
  try {
    const t = String(localStorage.getItem(INVITE_TOKEN_STORAGE_KEY) || '').trim();
    return TOKEN_RE.test(t) ? t : '';
  } catch (_) {
    return '';
  }
}

export function hasPendingInviteToken() {
  return Boolean(getPendingInviteToken());
}

export function getPendingInviteMeta() {
  try {
    const raw = localStorage.getItem(INVITE_META_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function savePendingInviteMeta(meta) {
  try {
    if (!meta) localStorage.removeItem(INVITE_META_STORAGE_KEY);
    else localStorage.setItem(INVITE_META_STORAGE_KEY, JSON.stringify(meta));
  } catch (_) {}
}

export function clearPendingInviteToken({ cleanUrl = true } = {}) {
  lastVerifiedSignature = '';
  try { localStorage.removeItem(INVITE_TOKEN_STORAGE_KEY); } catch (_) {}
  try { localStorage.removeItem(INVITE_META_STORAGE_KEY); } catch (_) {}
  if (cleanUrl && typeof window !== 'undefined' && window.history?.replaceState) {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('invite')) {
        url.searchParams.delete('invite');
        const nextSearch = url.searchParams.toString();
        window.history.replaceState({}, document.title, url.pathname + (nextSearch ? '?' + nextSearch : '') + (url.hash || ''));
      }
    } catch (_) {}
  }
}

export function captureInviteTokenFromUrl() {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    const rawInvite = String(url.searchParams.get('invite') || '').trim();
    if (rawInvite) {
      // Nunca aceptar el viejo ?invite=1 inseguro
      if (rawInvite === '1') {
        url.searchParams.delete('invite');
        const nextSearch = url.searchParams.toString();
        window.history.replaceState({}, document.title, url.pathname + (nextSearch ? '?' + nextSearch : '') + (url.hash || ''));
        return getPendingInviteToken();
      }
      localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, rawInvite);
      return rawInvite;
    }
  } catch (_) {}
  return getPendingInviteToken();
}

export function getInviteRedirectUrl(explicitToken = null) {
  const token = explicitToken || getPendingInviteToken();
  if (typeof window === 'undefined') return '';
  try {
    const base = window.location.protocol.startsWith('http')
      ? `${window.location.origin}/`
      : window.location.href.split('#')[0].split('?')[0];
    const url = new URL(base);
    if (token) url.searchParams.set('invite', token);
    return url.toString();
  } catch (_) {
    return window.location.origin;
  }
}

export async function getVerifiedSupabaseAccessToken() {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb?.auth) return '';
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) return '';
    return String(data?.session?.access_token || '').trim();
  } catch (_) {
    return '';
  }
}

async function callInviteApi(endpoint, payload = {}, { requireJwt = false } = {}) {
  const jwt = await getVerifiedSupabaseAccessToken();
  if (requireJwt && !jwt) {
    return { ok: false, status: 401, data: { ok: false, error: 'Inicia sesión con una cuenta verificada para continuar.' } };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: text || 'Respuesta inválida del servidor.' }; }
  return { ok: res.ok, status: res.status, data };
}

export async function sendProjectInviteApi({
  projectId,
  projectName = '',
  companyName = '',
  inviteeEmail,
  inviteeName = '',
  role = 'editar',
  allowedTabs = []
}) {
  const res = await callInviteApi('/api/invites/send', {
    action: 'send',
    projectId,
    projectName,
    companyName,
    inviteeEmail,
    inviteeName,
    role,
    allowedTabs,
    appOrigin: APP_ORIGIN
  }, { requireJwt: true });
  return { status: res.status, ...(res.data || {}) };
}

export async function verifyPendingInviteApi(token) {
  const res = await callInviteApi('/api/invites/verify', { action: 'verify', token }, { requireJwt: false });
  return { status: res.status, ...(res.data || {}) };
}

export async function respondToInviteApi(token, action) {
  const res = await callInviteApi('/api/invites/respond', { action, token }, { requireJwt: true });
  return { status: res.status, ...(res.data || {}) };
}

export async function listProjectInvitesApi(projectId) {
  const res = await callInviteApi('/api/invites/list', { action: 'list', projectId }, { requireJwt: true });
  return { status: res.status, ...(res.data || {}) };
}

export async function revokeProjectInviteApi(projectId, inviteId) {
  const res = await callInviteApi('/api/invites/revoke', { action: 'revoke', projectId, inviteId }, { requireJwt: true });
  return { status: res.status, ...(res.data || {}) };
}

export function renderInviteAuthBannerHtml() {
  const token = getPendingInviteToken();
  if (!token) return '';
  const meta = getPendingInviteMeta();
  const masked = meta?.maskedEmail ? `<code>${escapeHtml(meta.maskedEmail)}</code>` : 'la cuenta invitada';
  return `
    <div id="cubikar-invite-auth-banner" style="margin:12px 16px 4px;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:#ffffff;border:1px solid rgba(147,197,253,0.45);box-shadow:0 8px 20px rgba(30,58,138,0.22);text-align:left;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,0.16);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
          <i class="fa-solid fa-envelope-open-text" style="font-size:13px;color:#bfdbfe;"></i>
        </span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:800;letter-spacing:-0.01em;">Invitación personal pendiente</div>
          <div id="cubikar-invite-auth-banner-text" style="font-size:11.5px;line-height:1.45;color:#dbeafe;margin-top:2px;">
            Este enlace único es exclusivo para <strong style="color:#ffffff;">${masked}</strong>. Inicia sesión o regístrate exactamente con ese correo para ver la invitación y aceptarla o rechazarla.
          </div>
          <button type="button" id="cubikar-invite-banner-cancel" style="margin-top:7px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.32);color:#ffffff;border-radius:8px;padding:4px 9px;font-size:10.5px;font-weight:700;cursor:pointer;">
            Ignorar enlace y entrar normal
          </button>
        </div>
      </div>
    </div>
  `;
}

export function bindInviteAuthBannerActions({ onDismiss } = {}) {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('cubikar-invite-banner-cancel');
  if (btn && !btn.dataset.boundInviteCancel) {
    btn.dataset.boundInviteCancel = '1';
    btn.addEventListener('click', () => {
      clearPendingInviteToken({ cleanUrl: true });
      document.getElementById('cubikar-invite-auth-banner')?.remove();
      onDismiss?.();
    });
  }
}

const cachedInviteUrls = new Map();

export function getCachedInviteUrl(projectId, email) {
  const key = `${String(projectId || '').trim()}|${String(email || '').toLowerCase().trim()}`;
  return cachedInviteUrls.get(key) || '';
}

export function getAnyLatestCachedInviteUrl(projectId, cloudId = '') {
  const p = String(projectId || '').trim();
  const c = String(cloudId || '').trim();
  let last = '';
  for (const [k, url] of cachedInviteUrls.entries()) {
    if (k.startsWith(p + '|') || (c && k.startsWith(c + '|'))) {
      last = url;
    }
  }
  return last;
}

export function copyTextWithFeedback(text, successMsg = '¡Enlace copiado al portapapeles!') {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }).catch(() => {
      try { prompt('Copia este enlace personal de invitación:', text); } catch (_) {}
    });
    return true;
  }
  try { prompt('Copia este enlace personal de invitación:', text); } catch (_) {}
  return true;
}

export async function ensureSyncedProjectCloudUuid(proj) {
  if (!proj) return '';
  const current = resolveCloudProjectId(proj.cloudId || proj.id);
  if (isValidUUID(current) && proj.isCloudSynced) return current;

  const syncRes = await syncProjectToCloud(proj, {
    projectName: proj.projectName,
    projectLocation: proj.projectLocation,
    companyName: proj.companyName
  }, null, { syncHeader: true });

  const resolved = syncRes?.projectId || resolveCloudProjectId(proj.cloudId || proj.id);
  if (!syncRes?.success || !isValidUUID(resolved)) {
    throw new Error(syncRes?.reason || 'No se pudo sincronizar la obra en Supabase antes de generar la invitación.');
  }

  const list = getProjectsList();
  const idx = list.findIndex((p) => p.id === proj.id || p.cloudId === resolved);
  if (idx >= 0) {
    list[idx].cloudId = resolved;
    list[idx].isCloudSynced = true;
    saveProjectsList(list, { skipCloudSync: true });
  }
  return resolved;
}

export async function sendSecureProjectInvitation({
  proj,
  email,
  name,
  role = 'editar',
  allowedTabs = [],
  invitedBy = null,
  avatar = null
}) {
  if (!proj) return { ok: false, error: 'Proyecto no encontrado.' };
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return { ok: false, error: 'Ingresa un correo electrónico válido.' };

  let cloudUuid;
  try {
    cloudUuid = await ensureSyncedProjectCloudUuid(proj);
  } catch (err) {
    return { ok: false, error: err?.message || 'Error al sincronizar el proyecto con la nube.' };
  }

  const apiRes = await sendProjectInviteApi({
    projectId: cloudUuid,
    projectName: proj.projectName || 'Proyecto de Obra',
    companyName: proj.companyName || '',
    inviteeEmail: cleanEmail,
    inviteeName: name || cleanEmail.split('@')[0],
    role,
    allowedTabs
  });

  if (!apiRes?.ok) {
    return apiRes;
  }

  if (apiRes.inviteUrl) {
    cachedInviteUrls.set(`${proj.id}|${cleanEmail}`, apiRes.inviteUrl);
    cachedInviteUrls.set(`${cloudUuid}|${cleanEmail}`, apiRes.inviteUrl);
  }

  const inv = createProjectInvitation({
    projectId: proj.id,
    email: cleanEmail,
    name: name || cleanEmail.split('@')[0],
    role,
    allowedTabs,
    invitedBy,
    avatar,
    skipCloudCollaboratorPush: true,
    id: apiRes.invitation?.id || undefined
  });

  return {
    ...apiRes,
    cloudProjectId: cloudUuid,
    localInvitation: inv
  };
}

export function formatInviteStatusBadge(estado, expiresAt = null) {
  const st = String(estado || 'pending').toLowerCase().trim();
  const expired = st === 'pending' && expiresAt && new Date(expiresAt).getTime() <= Date.now();
  if (expired) return { label: 'Expirada', cls: 'bg-slate-200 text-slate-600 border-slate-300', style: 'background:#e2e8f0;color:#475569;' };
  if (st === 'accepted') return { label: 'Aceptada', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', style: 'background:#d1fae5;color:#065f46;' };
  if (st === 'rejected') return { label: 'Rechazada', cls: 'bg-rose-100 text-rose-800 border-rose-300', style: 'background:#ffe4e6;color:#9f1239;' };
  if (st === 'cancelled') return { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500 border-slate-300', style: 'background:#f1f5f9;color:#64748b;' };
  return { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800 border-amber-300', style: 'background:#fef3c7;color:#92400e;' };
}

export function closeInviteDecisionOverlay() {
  if (typeof document === 'undefined') return;
  document.getElementById('cubikar-invite-decision-overlay')?.remove();
}

function ensureOverlayRoot() {
  closeInviteDecisionOverlay();
  const root = document.createElement('div');
  root.id = 'cubikar-invite-decision-overlay';
  root.style.cssText = 'position:fixed;inset:0;z-index:100005;background:rgba(2,6,23,0.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
  document.body.appendChild(root);
  return root;
}

function renderCardShell({ badgeText = 'Invitación de Proyecto', headerBg = 'linear-gradient(135deg,#0f172a,#1e3a8a)', bodyHtml = '', footerHtml = '' }) {
  const root = ensureOverlayRoot();
  root.innerHTML = `
    <div style="width:100%;max-width:500px;background:#ffffff;color:#0f172a;border-radius:20px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.45);border:1px solid #cbd5e1;font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;">
      <div style="background:${headerBg};color:#ffffff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="min-width:0;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#93c5fd;">cubikar &bull; ${APP_ORIGIN === 'arq' ? 'Arquitectura' : 'Construcción'}</div>
          <div style="font-size:16px;font-weight:800;margin-top:2px;">${escapeHtml(badgeText)}</div>
        </div>
        <img src="assets/branding/cubikar_icon_transparent.png" alt="cubikar" style="width:36px;height:36px;object-fit:contain;flex-shrink:0;">
      </div>
      <div style="padding:20px;font-size:13px;line-height:1.5;color:#1e293b;">
        ${bodyHtml}
      </div>
      ${footerHtml ? `<div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;">${footerHtml}</div>` : ''}
    </div>
  `;
  return root;
}

function formatFriendlyDate(iso) {
  if (!iso) return '---';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) {
    return String(iso).slice(0, 10);
  }
}

export async function processPendingInviteFlow({
  isMobile = false,
  onAuthRequired = null,
  onSwitchAccount = null,
  onGoDashboard = null,
  onAcceptedOpenProject = null
} = {}) {
  const token = captureInviteTokenFromUrl() || getPendingInviteToken();
  if (!token) return { active: false };

  const currentJwt = await getVerifiedSupabaseAccessToken();
  const sig = `${token}|${currentJwt ? currentJwt.slice(-16) : 'anon'}`;
  if (verifyInFlightPromise && lastVerifiedSignature === sig) {
    return verifyInFlightPromise;
  }
  lastVerifiedSignature = sig;

  verifyInFlightPromise = (async () => {
    let verifyRes;
    try {
      verifyRes = await verifyPendingInviteApi(token);
    } catch (err) {
      showToast('No se pudo validar el enlace de invitación. Revisa tu conexión e intenta de nuevo.', 'error');
      return { active: true, state: 'NETWORK_ERROR' };
    }

    const state = verifyRes.state || verifyRes.code || '';

    if (verifyRes.maskedEmail) {
      savePendingInviteMeta({
        maskedEmail: verifyRes.maskedEmail,
        appOrigin: verifyRes.appOrigin || APP_ORIGIN,
        expiresAt: verifyRes.expiresAt || null
      });
    }

    // 1. Token inválido / expirado / ya usado o rechazado
    if (state === 'INVALID_TOKEN' || state === 'TOKEN_EXPIRED_OR_USED') {
      const isInvalid = state === 'INVALID_TOKEN';
      renderCardShell({
        badgeText: isInvalid ? 'Enlace Inválido' : 'Invitación No Disponible',
        headerBg: 'linear-gradient(135deg,#7f1d1d,#991b1b)',
        bodyHtml: `
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <span style="width:40px;height:40px;border-radius:12px;background:#fee2e2;color:#dc2626;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fa-solid ${isInvalid ? 'fa-link-slash' : 'fa-clock-rotate-left'}" style="font-size:17px;"></i>
            </span>
            <div>
              <div style="font-weight:800;font-size:14.5px;color:#0f172a;">${escapeHtml(verifyRes.error || (isInvalid ? 'Enlace inválido.' : 'Este enlace ya fue utilizado, rechazado o expiró.'))}</div>
              <p style="margin:6px 0 0;font-size:12px;color:#475569;">
                Por seguridad, cada invitación funciona una sola vez y vence después de 7 días. Solicita al administrador del proyecto que te envíe una nueva invitación.
              </p>
            </div>
          </div>
        `,
        footerHtml: `
          <button type="button" id="inv-modal-back-panel" style="padding:10px 16px;border-radius:10px;border:none;background:#0f172a;color:#ffffff;font-weight:700;font-size:12.5px;cursor:pointer;">
            Volver a mi panel
          </button>
        `
      });
      document.getElementById('inv-modal-back-panel')?.addEventListener('click', () => {
        clearPendingInviteToken({ cleanUrl: true });
        closeInviteDecisionOverlay();
        onGoDashboard?.();
      });
      return { active: true, state };
    }

    // 2. Sesión abierta con OTRO correo distinto al invitado -> BLOQUEO TOTAL sin filtrar datos del proyecto
    if (state === 'WRONG_ACCOUNT') {
      renderCardShell({
        badgeText: 'Acceso Denegado — Cuenta Incorrecta',
        headerBg: 'linear-gradient(135deg,#7c2d12,#b91c1c)',
        bodyHtml: `
          <div style="padding:14px;border-radius:14px;background:#fef2f2;border:1px solid #fecaca;color:#7f1d1d;">
            <div style="font-weight:800;font-size:13.5px;margin-bottom:6px;">
              🔒 Acceso denegado
            </div>
            <div style="font-size:12.5px;line-height:1.5;">
              Esta invitación es personal para <strong style="font-family:monospace;background:#ffffff;padding:2px 6px;border-radius:6px;border:1px solid #fca5a5;">${escapeHtml(verifyRes.maskedEmail || 'otra cuenta')}</strong>, pero tienes sesión iniciada como <strong style="font-family:monospace;">${escapeHtml(verifyRes.currentEmail || '')}</strong>.
            </div>
          </div>
          <p style="margin:12px 0 0;font-size:12px;color:#475569;">
            Por confidencialidad de la obra, los detalles del proyecto permanecen ocultos hasta que inicies sesión exactamente con el correo invitado.
          </p>
        `,
        footerHtml: `
          <button type="button" id="inv-wrong-back" style="padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;font-weight:700;font-size:12px;cursor:pointer;">
            Volver a mi panel
          </button>
          <button type="button" id="inv-wrong-switch" style="padding:10px 16px;border-radius:10px;border:none;background:#1d4ed8;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;">
            Cerrar sesión e iniciar con la cuenta invitada
          </button>
        `
      });

      document.getElementById('inv-wrong-back')?.addEventListener('click', () => {
        clearPendingInviteToken({ cleanUrl: true });
        closeInviteDecisionOverlay();
        onGoDashboard?.();
      });

      document.getElementById('inv-wrong-switch')?.addEventListener('click', async () => {
        const btn = document.getElementById('inv-wrong-switch');
        if (btn) { btn.disabled = true; btn.textContent = 'Cerrando sesión...'; }
        // Conservar el token en localStorage mientras se limpian sesión Supabase, tokens locales y cookie SSO
        const preservedToken = getPendingInviteToken();
        const preservedMeta = getPendingInviteMeta();
        try {
          if (typeof onSwitchAccount === 'function') {
            await onSwitchAccount(preservedToken, preservedMeta);
          }
        } finally {
          if (preservedToken) {
            try { localStorage.setItem(INVITE_TOKEN_STORAGE_KEY, preservedToken); } catch (_) {}
          }
          if (preservedMeta) savePendingInviteMeta(preservedMeta);
          closeInviteDecisionOverlay();
        }
      });
      return { active: true, state };
    }

    // 3a. No hay sesión Supabase válida -> mostrar banner en Login/Registro
    if (state === 'AUTH_REQUIRED') {
      closeInviteDecisionOverlay();
      const bannerTextEl = document.getElementById('cubikar-invite-auth-banner-text');
      if (bannerTextEl && verifyRes.maskedEmail) {
        bannerTextEl.innerHTML = `Este enlace único es exclusivo para <strong style="color:#ffffff;font-family:monospace;">${escapeHtml(verifyRes.maskedEmail)}</strong>. Inicia sesión o regístrate exactamente con ese correo para ver la invitación y aceptarla o rechazarla.`;
      }
      onAuthRequired?.({ maskedEmail: verifyRes.maskedEmail, token });
      return { active: true, state };
    }

    // 3b. Correo coincide pero aún no está confirmado (email_confirmed_at IS NULL)
    if (state === 'EMAIL_NOT_CONFIRMED') {
      renderCardShell({
        badgeText: 'Confirma tu Correo Electrónico',
        headerBg: 'linear-gradient(135deg,#92400e,#b45309)',
        bodyHtml: `
          <div style="padding:14px;border-radius:14px;background:#fffbeb;border:1px solid #fde68a;color:#78350f;">
            <div style="font-weight:800;font-size:13.5px;margin-bottom:6px;">
              ✉️ Verificación de correo pendiente
            </div>
            <div style="font-size:12.5px;line-height:1.5;">
              Iniciaste sesión como <strong style="font-family:monospace;">${escapeHtml(verifyRes.currentEmail || '')}</strong>, pero tu dirección de correo aún no ha sido confirmada. Abre el correo de verificación enviado a tu bandeja de entrada y haz clic en el enlace para continuar.
            </div>
          </div>
        `,
        footerHtml: `
          <button type="button" id="inv-unconf-back" style="padding:10px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;font-weight:700;font-size:12px;cursor:pointer;">
            Volver a mi panel
          </button>
          <button type="button" id="inv-unconf-resend" style="padding:10px 14px;border-radius:10px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;font-weight:700;font-size:12px;cursor:pointer;">
            Reenviar correo
          </button>
          <button type="button" id="inv-unconf-retry" style="padding:10px 16px;border-radius:10px;border:none;background:#0f172a;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;">
            Ya confirmé, verificar
          </button>
        `
      });

      document.getElementById('inv-unconf-back')?.addEventListener('click', () => {
        clearPendingInviteToken({ cleanUrl: true });
        closeInviteDecisionOverlay();
        onGoDashboard?.();
      });
      document.getElementById('inv-unconf-resend')?.addEventListener('click', async () => {
        const sb = getSupabaseClient();
        if (!sb?.auth || !verifyRes.currentEmail) return;
        try {
          const { error } = await sb.auth.resend({
            type: 'signup',
            email: verifyRes.currentEmail,
            options: { emailRedirectTo: getInviteRedirectUrl(token) }
          });
          if (error) throw error;
          showToast('Correo de confirmación reenviado. Revisa tu bandeja o spam.', 'success');
        } catch (err) {
          showToast(err?.message || 'No se pudo reenviar el correo.', 'error');
        }
      });
      document.getElementById('inv-unconf-retry')?.addEventListener('click', async () => {
        const sb = getSupabaseClient();
        try { await sb?.auth?.refreshSession(); } catch (_) {}
        lastVerifiedSignature = '';
        await processPendingInviteFlow({ isMobile, onAuthRequired, onSwitchAccount, onGoDashboard, onAcceptedOpenProject });
      });
      return { active: true, state };
    }

    // 4. Correo confirmado y coincidente: MOSTRAR TARJETA FORMAL DE DECISIÓN (nunca auto-aceptar)
    if (state === 'READY' && verifyRes.invitation) {
      const inv = verifyRes.invitation;
      const roleMeta = ROLE_LABELS[inv.role] || ROLE_LABELS.leer;
      const appLabel = inv.appOrigin === 'arq' ? 'Cubikar Arquitectura' : 'Cubikar Construcción';
      const tabDict = inv.appOrigin === 'arq' ? TAB_LABELS_ARQ : TAB_LABELS_CONST;
      const tabsList = Array.isArray(inv.allowedTabs)
        ? inv.allowedTabs.map((t) => tabDict[t] || t).filter(Boolean)
        : [];

      renderCardShell({
        badgeText: 'Tarjeta de Decisión — Invitación',
        headerBg: inv.appOrigin === 'arq' ? 'linear-gradient(135deg,#0f172a,#0369a1)' : 'linear-gradient(135deg,#0f172a,#1d4ed8)',
        bodyHtml: `
          <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="padding:12px 14px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.04em;">Proyecto</div>
              <div style="font-size:16px;font-weight:800;color:#0f172a;margin-top:2px;">${escapeHtml(inv.projectName || 'Proyecto de Obra')}</div>
              ${inv.companyName ? `<div style="font-size:12px;color:#475569;margin-top:2px;"><i class="fa-solid fa-building" style="color:#3b82f6;margin-right:4px;"></i> ${escapeHtml(inv.companyName)}</div>` : ''}
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <div style="padding:10px 12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
                <div style="font-size:10.5px;color:#64748b;font-weight:700;text-transform:uppercase;">Quién te invita</div>
                <div style="font-size:12.5px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(inv.ownerName || inv.ownerEmail)}</div>
                <div style="font-size:11px;color:#64748b;font-family:monospace;word-break:break-all;">${escapeHtml(inv.ownerEmail || '')}</div>
              </div>
              <div style="padding:10px 12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
                <div style="font-size:10.5px;color:#64748b;font-weight:700;text-transform:uppercase;">Aplicación y fecha</div>
                <div style="font-size:12.5px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(appLabel)}</div>
                <div style="font-size:11px;color:#64748b;">Enviada: ${escapeHtml(formatFriendlyDate(inv.createdAt))}</div>
              </div>
            </div>

            <div style="padding:12px 14px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:#1e40af;">Rol asignado</span>
                <span style="padding:3px 10px;border-radius:999px;background:${roleMeta.color};color:#ffffff;font-size:11.5px;font-weight:800;">${escapeHtml(roleMeta.label)}</span>
              </div>
              <p style="margin:6px 0 0;font-size:12px;color:#1e3a8a;">${escapeHtml(roleMeta.desc)}</p>
              ${tabsList.length > 0 ? `<div style="margin-top:8px;font-size:11px;color:#334155;"><strong>Módulos autorizados:</strong> ${tabsList.map(t => `<span style="display:inline-block;background:#ffffff;border:1px solid #cbd5e1;border-radius:6px;padding:1px 7px;margin:2px 4px 0 0;font-weight:600;">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            </div>

            <div style="font-size:11.5px;color:#475569;display:flex;align-items:center;gap:6px;">
              <i class="fa-solid fa-shield-check" style="color:#059669;"></i>
              <span>Cuenta verificada: <strong style="font-family:monospace;">${escapeHtml(inv.inviteeEmail)}</strong></span>
            </div>
          </div>
        `,
        footerHtml: `
          <button type="button" id="inv-decision-reject" style="padding:11px 16px;border-radius:11px;border:1px solid #fecaca;background:#fff1f2;color:#be123c;font-weight:800;font-size:12.5px;cursor:pointer;flex:${isMobile ? '1' : '0 0 auto'};">
            Rechazar
          </button>
          <button type="button" id="inv-decision-accept" style="padding:11px 18px;border-radius:11px;border:none;background:#16a34a;color:#ffffff;font-weight:800;font-size:12.5px;cursor:pointer;flex:${isMobile ? '1.3' : '0 0 auto'};box-shadow:0 6px 16px rgba(22,163,74,0.28);">
            ✓ Aceptar Invitación
          </button>
        `
      });

      const btnAccept = document.getElementById('inv-decision-accept');
      const btnReject = document.getElementById('inv-decision-reject');

      btnAccept?.addEventListener('click', async () => {
        if (btnAccept) { btnAccept.disabled = true; btnAccept.textContent = 'Aceptando...'; }
        if (btnReject) btnReject.disabled = true;
        try {
          const res = await respondToInviteApi(token, 'accept');
          if (!res?.ok) {
            showToast(res?.error || 'No se pudo aceptar la invitación.', 'error');
            if (btnAccept) { btnAccept.disabled = false; btnAccept.textContent = '✓ Aceptar Invitación'; }
            if (btnReject) btnReject.disabled = false;
            return;
          }

          clearPendingInviteToken({ cleanUrl: true });
          invalidateCloudProjectsCache();
          try {
            const cloudList = await fetchCloudProjects({ force: true });
            if (Array.isArray(cloudList) && cloudList.length > 0) {
              const curList = getProjectsList();
              cloudList.forEach((cp) => {
                if (!cp || isProjectMarkedDeleted(cp.id)) return;
                const idx = curList.findIndex((lp) => lp.id === cp.id || lp.cloudId === cp.id);
                if (idx === -1) curList.unshift(cp);
                else curList[idx] = { ...curList[idx], ...cp, id: curList[idx].id || cp.id, cloudId: cp.id, isCloudSynced: true };
              });
              saveProjectsList(curList, { skipCloudSync: true });
            }
          } catch (_) {}

          try {
            const curUser = getCurrentUser();
            if (typeof window !== 'undefined' && window.CubikarRealtime?.broadcastInvitationAccepted) {
              window.CubikarRealtime.broadcastInvitationAccepted({
                id: res.invitationId || inv.id,
                projectId: res.projectId,
                projectName: res.projectName,
                ownerEmail: res.ownerEmail,
                email: inv.inviteeEmail,
                name: curUser?.name || inv.inviteeName,
                role: res.role || inv.role
              }, curUser);
            }
          } catch (_) {}

          showToast(`¡Invitación aceptada! Abriendo "${res.projectName || inv.projectName}"...`, 'success');
          closeInviteDecisionOverlay();

          if (typeof onAcceptedOpenProject === 'function') {
            await onAcceptedOpenProject(res);
          } else {
            window.location.href = `${window.location.pathname}?project=${encodeURIComponent(res.projectId)}`;
          }
        } catch (err) {
          showToast(err?.message || 'Error aceptando la invitación.', 'error');
          if (btnAccept) { btnAccept.disabled = false; btnAccept.textContent = '✓ Aceptar Invitación'; }
          if (btnReject) btnReject.disabled = false;
        }
      });

      btnReject?.addEventListener('click', async () => {
        if (btnReject) { btnReject.disabled = true; btnReject.textContent = 'Rechazando...'; }
        if (btnAccept) btnAccept.disabled = true;
        try {
          const res = await respondToInviteApi(token, 'reject');
          if (!res?.ok) {
            showToast(res?.error || 'No se pudo rechazar la invitación.', 'error');
            if (btnReject) { btnReject.disabled = false; btnReject.textContent = 'Rechazar'; }
            if (btnAccept) btnAccept.disabled = false;
            return;
          }

          try { rejectProjectInvitation(res.invitationId || inv.id); } catch (_) {}
          try {
            const curUser = getCurrentUser();
            if (typeof window !== 'undefined' && window.CubikarRealtime?.broadcastInvitationRejected) {
              window.CubikarRealtime.broadcastInvitationRejected({
                id: res.invitationId || inv.id,
                projectId: res.projectId,
                ownerEmail: res.ownerEmail,
                email: inv.inviteeEmail
              }, curUser);
            }
          } catch (_) {}

          clearPendingInviteToken({ cleanUrl: true });
          showToast('Invitación rechazada. El enlace ha quedado inutilizado.', 'info');
          closeInviteDecisionOverlay();
          onGoDashboard?.(res);
        } catch (err) {
          showToast(err?.message || 'Error al rechazar la invitación.', 'error');
          if (btnReject) { btnReject.disabled = false; btnReject.textContent = 'Rechazar'; }
          if (btnAccept) btnAccept.disabled = false;
        }
      });

      return { active: true, state };
    }

    return { active: true, state };
  })().finally(() => {
    verifyInFlightPromise = null;
  });

  return verifyInFlightPromise;
}

export function showAwaitEmailConfirmationOverlay({ email = '', onGoDashboard = null } = {}) {
  const token = getPendingInviteToken();
  const masked = maskEmailAddress(email);
  renderCardShell({
    badgeText: 'Confirma tu Correo para Continuar',
    headerBg: 'linear-gradient(135deg,#0f172a,#1d4ed8)',
    bodyHtml: `
      <div style="padding:14px;border-radius:14px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;">
        <div style="font-weight:800;font-size:14px;margin-bottom:6px;">
          ✉️ Revisa tu bandeja de entrada
        </div>
        <p style="margin:0;font-size:12.5px;line-height:1.5;">
          Enviamos un correo de confirmación a <strong style="font-family:monospace;">${escapeHtml(email || masked)}</strong>. Haz clic en el enlace de confirmación dentro del correo para regresar automáticamente a tu invitación y poder aceptarla o rechazarla.
        </p>
      </div>
      <p style="margin:10px 0 0;font-size:11.5px;color:#475569;">
        Revisa también tu carpeta de Spam o Promociones si no lo ves en 1 minuto.
      </p>
    `,
    footerHtml: `
      <button type="button" id="inv-confirm-wait-back" style="padding:9px 14px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;font-weight:700;font-size:12px;cursor:pointer;">
        Volver al acceso
      </button>
      <button type="button" id="inv-confirm-wait-resend" style="padding:9px 16px;border-radius:10px;border:none;background:#1d4ed8;color:#ffffff;font-weight:700;font-size:12px;cursor:pointer;">
        Reenviar confirmación
      </button>
    `
  });

  document.getElementById('inv-confirm-wait-back')?.addEventListener('click', () => {
    closeInviteDecisionOverlay();
    onGoDashboard?.();
  });
  document.getElementById('inv-confirm-wait-resend')?.addEventListener('click', async () => {
    const sb = getSupabaseClient();
    if (!sb?.auth || !email) return;
    try {
      const { error } = await sb.auth.resend({
        type: 'signup',
        email: String(email).trim(),
        options: { emailRedirectTo: getInviteRedirectUrl(token) }
      });
      if (error) throw error;
      showToast('Correo de confirmación reenviado.', 'success');
    } catch (err) {
      showToast(err?.message || 'No se pudo reenviar el correo.', 'error');
    }
  });
}

export async function renderProjectInviteStatusesInto(containerEl, proj, {
  onLinkGenerated = null,
  onMutated = null,
  defaultTabs = ['cat', 'insumos', 'calendario', 'compras', 'almacen', 'estimaciones', 'bitacora']
} = {}) {
  if (!containerEl || !proj) return;
  const cloudUuid = resolveCloudProjectId(proj.cloudId || proj.id);

  containerEl.innerHTML = `<div style="font-size:11.5px;color:#64748b;padding:8px 0;">Consultando estado real de invitaciones...</div>`;

  let items = [];
  let apiError = '';
  if (isValidUUID(cloudUuid)) {
    try {
      const res = await listProjectInvitesApi(cloudUuid);
      if (res?.ok && Array.isArray(res.invitations)) {
        items = res.invitations;
      } else if (res?.error) {
        apiError = res.error;
      }
    } catch (err) {
      apiError = err?.message || 'No se pudo consultar la nube.';
    }
  }

  if (items.length === 0) {
    const localStored = (getStoredInvitations() || []).filter(
      (i) => i && (i.projectId === proj.id || (cloudUuid && i.projectId === cloudUuid))
    );
    items = localStored.map((i) => ({
      id: i.id,
      invitee_email: i.email,
      invitee_name: i.name || i.email,
      rol: i.role || 'leer',
      allowed_tabs: Array.isArray(i.allowedTabs) ? i.allowedTabs : defaultTabs,
      estado: i.status || 'pending',
      expires_at: i.expiresAt || null,
      created_at: i.createdAt || null
    }));
  }

  if (items.length === 0) {
    containerEl.innerHTML = `<div style="font-size:11.5px;color:#64748b;padding:6px 2px;">${
      apiError ? escapeHtml(apiError) : 'Aún no hay invitaciones por correo enviadas para este proyecto.'
    }</div>`;
    return;
  }

  containerEl.innerHTML = items.map((row) => {
    const email = String(row.invitee_email || '').toLowerCase().trim();
    const name = row.invitee_name || email;
    const roleLabel = ROLE_LABELS[row.rol]?.label || row.rol || 'Leer';
    const badge = formatInviteStatusBadge(row.estado, row.expires_at);
    const cachedUrl = getCachedInviteUrl(cloudUuid || proj.id, email) || getCachedInviteUrl(proj.id, email);
    const st = String(row.estado || 'pending').toLowerCase().trim();
    const isExpired = st === 'pending' && row.expires_at && new Date(row.expires_at).getTime() <= Date.now();
    const isPendingLive = st === 'pending' && !isExpired;
    const encodedTabs = encodeURIComponent(JSON.stringify(Array.isArray(row.allowed_tabs) && row.allowed_tabs.length ? row.allowed_tabs : defaultTabs));

    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:9px 11px;border-radius:12px;background:#ffffff;border:1px solid #cbd5e1;margin-bottom:6px;color:#0f172a;">
        <div style="min-width:0;flex:1 1 180px;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:12px;font-weight:700;color:#0f172a;">${escapeHtml(name)}</span>
            <span style="padding:2px 7px;border-radius:999px;font-size:10px;font-weight:800;${badge.style}">${escapeHtml(badge.label)}</span>
            <span style="font-size:10px;font-weight:700;color:#334155;background:#f1f5f9;padding:1px 6px;border-radius:6px;">${escapeHtml(roleLabel)}</span>
          </div>
          <div style="font-size:11px;color:#64748b;font-family:monospace;word-break:break-all;margin-top:2px;">${escapeHtml(email)}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:1px;">Enviada: ${escapeHtml(formatFriendlyDate(row.created_at))}${row.expires_at && isPendingLive ? ` &bull; Expira: ${escapeHtml(formatFriendlyDate(row.expires_at))}` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
          ${cachedUrl && isPendingLive ? `
            <button type="button" data-inv-act="copy" data-inv-url="${escapeHtml(cachedUrl)}" style="padding:5px 8px;border-radius:8px;border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46;font-size:10.5px;font-weight:700;cursor:pointer;">
              Copiar enlace
            </button>
          ` : ''}
          ${st !== 'accepted' ? `
            <button type="button" data-inv-act="resend" data-inv-email="${escapeHtml(email)}" data-inv-name="${escapeHtml(name)}" data-inv-role="${escapeHtml(row.rol || 'leer')}" data-inv-tabs="${encodedTabs}" style="padding:5px 8px;border-radius:8px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:10.5px;font-weight:700;cursor:pointer;">
              Reenviar
            </button>
          ` : ''}
          ${isPendingLive && isValidUUID(cloudUuid) ? `
            <button type="button" data-inv-act="revoke" data-inv-id="${escapeHtml(row.id)}" data-inv-email="${escapeHtml(email)}" style="padding:5px 8px;border-radius:8px;border:1px solid #fecaca;background:#fff1f2;color:#be123c;font-size:10.5px;font-weight:700;cursor:pointer;">
              Cancelar
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  containerEl.querySelectorAll('[data-inv-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.invAct;
      if (act === 'copy') {
        copyTextWithFeedback(btn.dataset.invUrl || '');
        return;
      }
      if (act === 'revoke') {
        if (!confirm(`¿Cancelar la invitación enviada a ${btn.dataset.invEmail}? Su enlace dejará de funcionar de inmediato.`)) return;
        btn.disabled = true;
        btn.textContent = 'Cancelando...';
        try {
          const res = await revokeProjectInviteApi(cloudUuid, btn.dataset.invId);
          if (!res?.ok) throw new Error(res?.error || 'No se pudo cancelar la invitación.');
          try { rejectProjectInvitation(btn.dataset.invId); } catch (_) {}
          showToast('Invitación cancelada. El enlace quedó anulado.', 'info');
          await renderProjectInviteStatusesInto(containerEl, proj, { onLinkGenerated, onMutated, defaultTabs });
          onMutated?.();
        } catch (err) {
          showToast(err?.message || 'Error al cancelar invitación.', 'error');
          btn.disabled = false;
          btn.textContent = 'Cancelar';
        }
        return;
      }
      if (act === 'resend') {
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
          let parsedTabs = defaultTabs;
          try { parsedTabs = JSON.parse(decodeURIComponent(btn.dataset.invTabs || '')); } catch (_) {}
          const curUser = getCurrentUser();
          const res = await sendSecureProjectInvitation({
            proj,
            email: btn.dataset.invEmail,
            name: btn.dataset.invName,
            role: btn.dataset.invRole || 'leer',
            allowedTabs: Array.isArray(parsedTabs) ? parsedTabs : defaultTabs,
            invitedBy: curUser
          });
          if (!res?.ok) throw new Error(res?.error || 'No se pudo reenviar la invitación.');
          if (res.emailSent) {
            showToast(`Nuevo enlace enviado por correo a ${btn.dataset.invEmail}.`, 'success');
          } else {
            showToast(`Nuevo enlace único generado${res.emailError ? ` (${res.emailError})` : ''}. Cópialo manualmente.`, 'warning');
          }
          onLinkGenerated?.({ email: btn.dataset.invEmail, inviteUrl: res.inviteUrl });
          await renderProjectInviteStatusesInto(containerEl, proj, { onLinkGenerated, onMutated, defaultTabs });
          onMutated?.();
        } catch (err) {
          showToast(err?.message || 'Error al reenviar invitación.', 'error');
          btn.disabled = false;
          btn.textContent = 'Reenviar';
        }
      }
    });
  });
}

export async function openProjectTeamInvitesSheet(proj, { openSheet, closeSheet, onChanged } = {}) {
  if (!proj || typeof openSheet !== 'function') return;
  const currentUser = getCurrentUser();
  const check = canUserInviteToProject(proj.id, currentUser);
  if (!check?.allowed) {
    showToast(`🔒 ${check?.reason || 'Solo el propietario o un Editor puede invitar colaboradores.'}`, 'warning');
    return;
  }

  const tabDict = APP_ORIGIN === 'arq' ? TAB_LABELS_ARQ : TAB_LABELS_CONST;
  const defaultTabs = Object.keys(tabDict);

  openSheet({
    title: `Equipo e Invitaciones — ${proj.projectName || 'Obra'}`,
    bodyHtml: `
      <form id="m-sheet-invite-form" style="display:flex;flex-direction:column;gap:10px;">
        <div class="m-card-alt" style="display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:12px;font-weight:800;">Enviar invitación única por correo</div>
          <div>
            <label class="m-label" for="m-inv-name">Nombre del colaborador *</label>
            <input id="m-inv-name" type="text" required class="m-input" placeholder="Ej. Ing. Juan Pérez">
          </div>
          <div>
            <label class="m-label" for="m-inv-email">Correo electrónico *</label>
            <input id="m-inv-email" type="email" required class="m-input" placeholder="usuario@gmail.com">
          </div>
          <div>
            <label class="m-label" for="m-inv-role">Rol asignado *</label>
            <select id="m-inv-role" class="m-input">
              <option value="editar">Editar — Control total</option>
              <option value="escribir">Escribir — Captura en módulos autorizados</option>
              <option value="leer">Leer — Solo consulta</option>
            </select>
          </div>
          <div>
            <label class="m-label">Módulos autorizados</label>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
              ${defaultTabs.map((key) => `
                <label class="m-row" style="font-size:11.5px;padding:5px 7px;border-radius:8px;border:1px solid var(--border);background:var(--surface);">
                  <input type="checkbox" name="m-inv-tab" value="${escapeHtml(key)}" checked style="width:15px;height:15px;">
                  <span>${escapeHtml(tabDict[key])}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <button type="submit" id="m-inv-submit-btn" class="m-btn m-btn-primary" style="width:100%;">
            <i class="fa-solid fa-paper-plane"></i> Enviar Invitación por Correo
          </button>
        </div>

        <div id="m-sheet-last-link" style="display:none;padding:10px;border-radius:12px;background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-size:11px;font-weight:800;">Enlace único para <span id="m-sheet-last-email" style="font-family:monospace;"></span></span>
            <button type="button" id="m-sheet-copy-last-btn" class="m-btn m-btn-sm" style="background:#059669;color:#ffffff;border:none;">Copiar</button>
          </div>
          <input id="m-sheet-last-url" type="text" readonly class="m-input" style="font-size:10.5px;font-family:monospace;background:#ffffff;color:#0f172a;">
        </div>

        <div>
          <div style="font-size:12px;font-weight:800;margin-bottom:6px;">Invitaciones enviadas</div>
          <div id="m-sheet-invite-statuses"></div>
        </div>
      </form>
    `,
    footerHtml: '<button type="button" id="m-inv-close-btn" class="m-btn m-btn-outline" style="width:100%;">Cerrar</button>'
  });

  document.getElementById('m-inv-close-btn')?.addEventListener('click', () => closeSheet?.());

  const showMobileBanner = (email, inviteUrl) => {
    if (!inviteUrl) return;
    const box = document.getElementById('m-sheet-last-link');
    const emEl = document.getElementById('m-sheet-last-email');
    const inpEl = document.getElementById('m-sheet-last-url');
    if (emEl) emEl.textContent = email || '';
    if (inpEl) inpEl.value = inviteUrl;
    if (box) box.style.display = 'flex';
  };

  document.getElementById('m-sheet-copy-last-btn')?.addEventListener('click', () => {
    const val = document.getElementById('m-sheet-last-url')?.value || '';
    if (val) copyTextWithFeedback(val, '¡Enlace personal copiado!');
  });

  const statusHost = document.getElementById('m-sheet-invite-statuses');
  const reloadStatuses = () => renderProjectInviteStatusesInto(statusHost, proj, {
    defaultTabs,
    onLinkGenerated: ({ email, inviteUrl }) => showMobileBanner(email, inviteUrl),
    onMutated: () => onChanged?.()
  });

  reloadStatuses().catch(() => {});

  document.getElementById('m-sheet-invite-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = String(document.getElementById('m-inv-name')?.value || '').trim();
    const email = String(document.getElementById('m-inv-email')?.value || '').trim().toLowerCase();
    const role = String(document.getElementById('m-inv-role')?.value || 'editar');
    const allowedTabs = Array.from(document.querySelectorAll('input[name="m-inv-tab"]:checked')).map((c) => c.value);
    if (!name || !email) return;

    const btn = document.getElementById('m-inv-submit-btn');
    const prevHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
    }
    try {
      const res = await sendSecureProjectInvitation({
        proj,
        email,
        name,
        role,
        allowedTabs,
        invitedBy: getCurrentUser()
      });
      if (!res?.ok) {
        showToast(res?.error || 'No se pudo enviar la invitación.', 'error');
        return;
      }
      showMobileBanner(email, res.inviteUrl);
      if (res.emailSent) {
        showToast(`Invitación enviada por correo a ${email}.`, 'success');
      } else {
        showToast(`Enlace único generado${res.emailError ? ` (${res.emailError})` : ''}. Cópialo manualmente.`, 'warning');
      }
      const nameEl = document.getElementById('m-inv-name');
      const emailEl = document.getElementById('m-inv-email');
      if (nameEl) nameEl.value = '';
      if (emailEl) emailEl.value = '';
      await reloadStatuses();
      onChanged?.();
    } catch (err) {
      showToast(err?.message || 'Error al enviar la invitación.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = prevHtml;
      }
    }
  });
}
