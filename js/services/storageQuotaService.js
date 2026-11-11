import { getActiveProjectId } from '../config/constants.js';
import { getSupabaseClient, isSupabaseConfigured } from '../core/supabaseClient.js';
import { getCurrentUser, getProjectById, getUserPlanId } from '../modules/portal/projectService.js';
import { recordStorageUsage } from '../modules/admin/cubikarAdmin.js';
import { formatBytes } from '../utils/fileCompressor.js';
import { getLocalMediaStats } from './mediaCacheDb.js';

export const MB_BYTES = 1024 * 1024;
export const GB_BYTES = 1024 * MB_BYTES;

/**
 * Especificaciones unificadas de almacenamiento por plan de suscripción del Anfitrión.
 * Incluye apartado reservado para Catálogo Maestro (6 / 50 / 200 MB) dentro de la cuota global (200 MB / 2 GB / 5 GB).
 */
export const UNIFIED_STORAGE_PLANS = {
  free: {
    planId: 'free',
    name: 'Gratuita',
    label: 'Plan Gratuito',
    totalMb: 200,
    totalBytes: 200 * MB_BYTES,
    catalogReservedMb: 6,
    catalogReservedBytes: 6 * MB_BYTES,
    projectFilesCapMb: 194,
    projectFilesCapBytes: 194 * MB_BYTES,
    maxFileMb: 5,
    maxFileBytes: 5 * MB_BYTES,
    maxMembers: 3
  },
  plus: {
    planId: 'plus',
    name: 'Plus',
    label: 'Plan Plus',
    totalMb: 2048,
    totalBytes: 2 * GB_BYTES,
    catalogReservedMb: 50,
    catalogReservedBytes: 50 * MB_BYTES,
    projectFilesCapMb: 1998,
    projectFilesCapBytes: (2 * GB_BYTES) - (50 * MB_BYTES),
    maxFileMb: 15,
    maxFileBytes: 15 * MB_BYTES,
    maxMembers: 10
  },
  pro: {
    planId: 'pro',
    name: 'Pro',
    label: 'Plan Pro',
    totalMb: 5120,
    totalBytes: 5 * GB_BYTES,
    catalogReservedMb: 200,
    catalogReservedBytes: 200 * MB_BYTES,
    projectFilesCapMb: 4920,
    projectFilesCapBytes: (5 * GB_BYTES) - (200 * MB_BYTES),
    maxFileMb: 25,
    maxFileBytes: 25 * MB_BYTES,
    maxMembers: 30
  }
};

const STORAGE_EVENT_NAME = 'cubikar:storage-updated';
const mountedTargets = new Map();
let lastQuotaCache = null;

export function normalizePlanId(rawPlan) {
  const key = String(rawPlan || 'free').trim().toLowerCase();
  if (key === 'enterprise') return 'pro';
  return UNIFIED_STORAGE_PLANS[key] ? key : 'free';
}

export function getPlanStorageSpec(planId) {
  return UNIFIED_STORAGE_PLANS[normalizePlanId(planId)];
}

/**
 * Resuelve el dueño/anfitrión responsable de la cuota del proyecto activo o de la sesión actual.
 */
export function resolveHostStorageContext(projectIdOverride = '') {
  const user = getCurrentUser();
  const activeId = projectIdOverride || getActiveProjectId();
  const project = activeId ? getProjectById(activeId) : null;

  const ownerEmail = String(
    project?.ownerEmail ||
    project?.hostEmail ||
    project?.owner_email ||
    user?.email ||
    'local@cubikar.app'
  ).trim().toLowerCase();

  const rawPlanId = project?.ownerPlanId || getUserPlanId(ownerEmail) || getUserPlanId(user);
  const planId = normalizePlanId(rawPlanId);
  const spec = getPlanStorageSpec(planId);

  return {
    ownerEmail,
    projectId: activeId || '',
    projectName: project?.name || 'Cuenta / Proyecto Actual',
    planId,
    spec,
    isCollaborator: Boolean(user?.email && ownerEmail && user.email.toLowerCase() !== ownerEmail)
  };
}

async function fetchRemoteHostUsage(ownerEmail) {
  try {
    if (!isSupabaseConfigured()) return null;
    const client = await getSupabaseClient();
    if (!client) return null;

    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session?.access_token) return null;

    const { data, error } = await client.rpc('obtener_consumo_almacen_anfitrion', {
      p_owner_email: ownerEmail
    });

    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
      planId: row.plan_id ? normalizePlanId(row.plan_id) : null,
      projectFilesBytes: Number(row.project_files_bytes || 0),
      masterCatalogBytes: Number(row.master_catalog_bytes || 0),
      totalBytes: Number(row.total_bytes || 0),
      filesCount: Number(row.files_count || 0),
      source: 'supabase'
    };
  } catch {
    return null;
  }
}

function withTimeout(promise, ms, fallbackValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms))
  ]);
}

async function fetchLocalCatalogUsageBytes(ownerEmail = '') {
  try {
    const mod = await import('../modules/reference/referenceDb.js');
    if (typeof mod.getReferenceDatabaseStats === 'function') {
      const stats = await mod.getReferenceDatabaseStats(ownerEmail || null);
      return Number(stats?.totalBytes ?? stats?.estimatedBytes ?? 0);
    }
  } catch {
    // Fallback silencioso si IndexedDB aún no inicializa
  }
  return 0;
}

/**
 * Calcula el resumen completo de consumo y disponibilidad del Anfitrión.
 */
export async function getHostStorageSummary({ projectId = '', forceRefresh = false } = {}) {
  const ctx = resolveHostStorageContext(projectId);

  const [remote, localMedia, localCatalogBytes] = await Promise.all([
    forceRefresh !== false ? withTimeout(fetchRemoteHostUsage(ctx.ownerEmail), 2500, null) : Promise.resolve(null),
    withTimeout(getLocalMediaStats(ctx.ownerEmail), 2000, { pendingBytes: 0, pendingCatalogBytes: 0, cachedBytes: 0, pendingCount: 0, cachedCount: 0 }),
    withTimeout(fetchLocalCatalogUsageBytes(ctx.ownerEmail), 1500, 0)
  ]);

  const effectivePlanId = remote?.planId || ctx.planId;
  const spec = getPlanStorageSpec(effectivePlanId);

  const projectFilesBytes = (remote?.projectFilesBytes || 0) + (localMedia?.pendingBytes || 0);
  const masterCatalogBytes = Math.max(remote?.masterCatalogBytes || 0, localCatalogBytes) + (localMedia?.pendingCatalogBytes || 0);
  const totalUsedBytes = projectFilesBytes + masterCatalogBytes;

  const projectUsagePct = Math.min(100, Math.round((projectFilesBytes / spec.projectFilesCapBytes) * 1000) / 10);
  const catalogUsagePct = Math.min(100, Math.round((masterCatalogBytes / spec.catalogReservedBytes) * 1000) / 10);
  const totalUsagePct = Math.min(100, Math.round((totalUsedBytes / spec.totalBytes) * 1000) / 10);

  const remainingProjectBytes = Math.max(0, spec.projectFilesCapBytes - projectFilesBytes);
  const remainingCatalogBytes = Math.max(0, spec.catalogReservedBytes - masterCatalogBytes);
  const remainingTotalBytes = Math.max(0, spec.totalBytes - totalUsedBytes);

  const level = totalUsagePct >= 100 || projectUsagePct >= 100
    ? 'blocked'
    : (totalUsagePct >= 90 || projectUsagePct >= 90 ? 'amber' : 'ok');

  const summary = {
    ownerEmail: ctx.ownerEmail,
    projectId: ctx.projectId,
    projectName: ctx.projectName,
    isCollaborator: ctx.isCollaborator,
    planId: spec.planId,
    spec,
    projectFilesBytes,
    masterCatalogBytes,
    totalUsedBytes,
    remainingProjectBytes,
    remainingCatalogBytes,
    remainingTotalBytes,
    projectUsagePct,
    catalogUsagePct,
    totalUsagePct,
    pendingCount: localMedia?.pendingCount || 0,
    remoteFilesCount: remote?.filesCount || 0,
    level,
    source: remote ? 'cloud+local' : 'local',
    formatted: {
      used: formatBytes(totalUsedBytes),
      quota: spec.totalMb >= 1024 ? `${(spec.totalMb / 1024).toFixed(0)} GB` : `${spec.totalMb} MB`,
      projectUsed: formatBytes(projectFilesBytes),
      projectCap: spec.projectFilesCapMb >= 1024 ? `${(spec.projectFilesCapMb / 1024).toFixed(2)} GB` : `${spec.projectFilesCapMb} MB`,
      catalogUsed: formatBytes(masterCatalogBytes),
      catalogCap: `${spec.catalogReservedMb} MB`,
      maxFile: `${spec.maxFileMb} MB`
    }
  };

  lastQuotaCache = summary;

  try {
    if (ctx.ownerEmail && ctx.ownerEmail !== 'local@cubikar.app') {
      recordStorageUsage(ctx.ownerEmail, Number((totalUsedBytes / MB_BYTES).toFixed(2)));
    }
  } catch {
    // No bloquear por métricas administrativas
  }

  return summary;
}

export function getCachedStorageSummary() {
  return lastQuotaCache;
}

/**
 * Valida un archivo antes de comprimirlo (límite por archivo individual y cuota ya agotada al 100%).
 */
export async function validatePreCompressionFile(file, { projectId = '', categoria = 'project_files' } = {}) {
  const summary = await getHostStorageSummary({ projectId });
  const { spec } = summary;
  const rawBytes = Number(file?.size || 0);

  if (rawBytes > spec.maxFileBytes) {
    return {
      allowed: false,
      reason: `"${file?.name || 'Archivo'}" pesa ${formatBytes(rawBytes)} y supera el máximo de ${spec.maxFileMb} MB por archivo para el ${spec.label}.`,
      summary
    };
  }

  const isCatalog = categoria === 'master_catalog';
  const isAtCap = isCatalog ? summary.catalogUsagePct >= 100 : (summary.projectUsagePct >= 100 || summary.totalUsagePct >= 100);
  if (isAtCap) {
    return {
      allowed: false,
      blockedByQuota: true,
      reason: isCatalog
        ? `Tu espacio apartado de Catálogo Maestro (${spec.catalogReservedMb} MB en ${spec.label}) está lleno. Libera catálogos o actualiza tu plan.`
        : `Has alcanzado el 100% de tu cuota de almacenamiento (${summary.formatted.used} / ${summary.formatted.quota} en ${spec.label}). Libera espacio o actualiza tu plan.`,
      summary
    };
  }

  return { allowed: true, summary };
}

/**
 * Valida que el archivo ya procesado (comprimido) quepa dentro del espacio disponible del anfitrión.
 */
export async function validatePostCompressionQuota(finalBytes, { projectId = '', categoria = 'project_files' } = {}) {
  const summary = await getHostStorageSummary({ projectId });
  const { spec } = summary;
  const isCatalog = categoria === 'master_catalog';
  const incoming = Math.max(0, Number(finalBytes || 0));

  const poolUsed = isCatalog ? summary.masterCatalogBytes : summary.projectFilesBytes;
  const poolLimit = isCatalog ? spec.catalogReservedBytes : spec.projectFilesCapBytes;
  const projected = poolUsed + incoming;
  const pctAfter = Math.round((projected / poolLimit) * 1000) / 10;

  if (projected > poolLimit) {
    const remaining = Math.max(0, poolLimit - poolUsed);
    return {
      allowed: false,
      blockedByQuota: true,
      level: 'blocked',
      usagePctAfter: pctAfter,
      reason: isCatalog
        ? `Este catálogo (${formatBytes(incoming)}) supera el espacio apartado disponible (${formatBytes(remaining)} libres de ${spec.catalogReservedMb} MB en ${spec.label}).`
        : `Espacio insuficiente: este archivo (${formatBytes(incoming)}) excede tu espacio disponible (${formatBytes(remaining)} libres en ${spec.label}). Actualiza tu plan o libera archivos.`,
      summary
    };
  }

  const warning90 = pctAfter >= 90;
  return {
    allowed: true,
    blockedByQuota: false,
    warning90,
    level: warning90 ? 'amber' : 'ok',
    usagePctAfter: pctAfter,
    warningMessage: warning90
      ? `Advertencia: estás usando el ${pctAfter}% de tu espacio de ${isCatalog ? 'Catálogo Maestro' : 'Almacenamiento'} (${spec.label}). Considera liberar espacio o actualizar plan.`
      : '',
    summary
  };
}

/**
 * Genera el HTML reutilizable del medidor de espacio:
 * "Espacio utilizado: 1.2 GB / 2 GB (Plan Plus)" + barra de progreso + apartado Catálogo Maestro.
 */
export function renderStorageMeterHtml(summary, options = {}) {
  const s = summary;
  if (!s) return '';

  const compact = Boolean(options.compact);
  const pct = Math.min(100, s.totalUsagePct);
  const barColor = s.level === 'blocked'
    ? 'bg-rose-600'
    : (s.level === 'amber' ? 'bg-amber-500' : 'bg-indigo-600');
  const badgeStyle = s.level === 'blocked'
    ? 'bg-rose-100 text-rose-800 border-rose-200'
    : (s.level === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200');

  const upgradeBtn = options.showUpgradeButton !== false
    ? `<button type="button" onclick="window.openSubscriptionModal?.()" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] transition cursor-pointer shrink-0">Mejorar Plan</button>`
    : '';

  return `
    <div class="cubikar-storage-meter p-3 rounded-xl border ${s.level === 'amber' ? 'border-amber-300 bg-amber-50/40' : (s.level === 'blocked' ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-slate-50/80')}">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="text-[11.5px] font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
            <i class="fa-solid fa-cloud text-indigo-600"></i>
            <span>Espacio utilizado: <strong>${s.formatted.used}</strong> / ${s.formatted.quota} (${s.spec.label})</span>
            <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}">${pct.toFixed(1)}%</span>
          </div>
          ${!compact ? `
            <p class="text-[10.5px] text-slate-500 mt-0.5">
              Proyectos S3: <strong>${s.formatted.projectUsed}</strong> / ${s.formatted.projectCap} ·
              Catálogo Maestro reservado: <strong>${s.formatted.catalogUsed}</strong> / ${s.formatted.catalogCap} ·
              Máx/archivo: <strong>${s.formatted.maxFile}</strong>
            </p>
          ` : ''}
        </div>
        ${upgradeBtn}
      </div>
      <div class="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div class="h-full ${barColor} transition-all duration-300 rounded-full" style="width:${Math.max(pct > 0 ? 2 : 0, pct)}%"></div>
      </div>
      ${s.level === 'amber' ? `
        <p class="mt-1.5 text-[10.5px] font-semibold text-amber-700 flex items-center gap-1">
          <i class="fa-solid fa-triangle-exclamation"></i> Has superado el 90% de tu cuota. Considera liberar archivos o actualizar tu plan.
        </p>
      ` : ''}
      ${s.level === 'blocked' ? `
        <p class="mt-1.5 text-[10.5px] font-semibold text-rose-700 flex items-center gap-1">
          <i class="fa-solid fa-circle-xmark"></i> Cuota al 100%. Nuevas subidas bloqueadas hasta liberar espacio o cambiar de plan.
        </p>
      ` : ''}
      ${s.pendingCount > 0 ? `
        <p class="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
          <i class="fa-solid fa-clock-rotate-left text-amber-500"></i> ${s.pendingCount} archivo(s) en caché local pendientes de sincronizar a S3.
        </p>
      ` : ''}
    </div>
  `;
}

export async function mountStorageMeter(containerOrId, options = {}) {
  const el = typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
  if (!el) return null;
  mountedTargets.set(el, options);
  const summary = await getHostStorageSummary({ projectId: options.projectId || '' });
  el.innerHTML = renderStorageMeterHtml(summary, options);
  return summary;
}

export async function refreshAllStorageMeters() {
  for (const [el, options] of mountedTargets.entries()) {
    if (!document.body?.contains(el)) {
      mountedTargets.delete(el);
      continue;
    }
    try {
      const summary = await getHostStorageSummary({ projectId: options.projectId || '' });
      el.innerHTML = renderStorageMeterHtml(summary, options);
    } catch {
      // Ignorar elemento desmontado
    }
  }
}

export function notifyStorageUsageChanged(detail = {}) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT_NAME, { detail }));
  }
  refreshAllStorageMeters().catch(() => {});
}
