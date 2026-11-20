/**
 * js/modules/portal/projectPackageService.js
 * Servicio de exportación e importación de paquetes completos (.zip) para Cubikar Construcción.
 * Incluye configuración, catálogo APU, módulos operativos (bitácora, estimaciones, compras,
 * almacén, cronograma, chat, candados) y todos los archivos binarios (fotos, PDFs, XMLs, logos)
 * almacenados en IndexedDB / AWS S3, remapeando IDs y cuotas al importar en otra cuenta.
 */

import {
  getStorageKey,
  getSettingsKey,
  getActiveProjectId
} from '../../config/constants.js?v=20261119_cf37';
import { defaultSettings } from '../../config/defaultData.js?v=20261119_cf37';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js?v=20261119_cf37';
import {
  generateUUID,
  isValidUUID,
  resolveCloudProjectId,
  loadProjectTreeFromCloud,
  syncProjectToCloud,
  invalidateCloudProjectsCache
} from '../../core/cloudProjectService.js?v=20261119_cf37';
import {
  hydrateProjectModulesFromCloud,
  syncBitacoraNow,
  syncExpensesNow,
  syncAlmacenNow,
  syncEstimacionesNow,
  syncCronogramaNow,
  syncChatNow
} from '../../core/cloudModulesSyncService.js?v=20261119_cf37';
import {
  AVATARS_BY_SEX,
  getCurrentUser,
  getProjectsList,
  saveProjectsList,
  getProjectById,
  getUserPlanId,
  getPlanLimits,
  canUserCreateProject,
  resolveCleanHostName,
  calculateTreeTotal,
  countTreeConcepts,
  countTreePartidas
} from './projectService.js?v=20261119_cf37';
import {
  getAllCachedMediaRecords,
  getCachedMediaRecord,
  putCachedMediaBlob
} from '../../services/mediaCacheDb.js?v=20261119_cf37';
import {
  uploadManagedFile,
  resolveManagedFileUrl
} from '../../services/s3StorageService.js?v=20261119_cf37';
import {
  getPlanStorageSpec,
  getHostStorageSummary,
  refreshAllStorageMeters,
  notifyStorageUsageChanged
} from '../../services/storageQuotaService.js?v=20261119_cf37';
import {
  blobToDataUrl,
  computeSha256Hex,
  dataUrlToBlob,
  formatBytes,
  getFileExtension
} from '../../utils/fileCompressor.js?v=20261119_cf37';
import { showToast } from '../../ui/notifications.js?v=20261119_cf37';

const PACKAGE_SCHEMA = 'cubikar.project.package';
const PACKAGE_FORMAT_VERSION = 1;
const SOURCE_APP_ID = 'const';
const MODAL_ROOT_ID = 'cubikar-project-package-modal';
const PROGRESS_OVERLAY_ID = 'cubikar-project-package-progress';

const ALLOWED_MEDIA_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'gif', 'svg',
  'pdf', 'xml', 'xlsx', 'xls', 'csv', 'txt', 'json'
]);

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  bmp: 'image/bmp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  xml: 'application/xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  txt: 'text/plain',
  json: 'application/json'
};

const NODE_REF_KEYS = new Set([
  'conceptId',
  'conceptoId',
  'partidaId',
  'nodeId',
  'entregableId',
  'parentId',
  'parent_id',
  'targetNodeId'
]);

const SUPPLIER_REF_KEYS = new Set([
  'supplierId',
  'proveedorId',
  'proveedorElegidoId'
]);

let packageOperationBusy = false;
let currentImportState = null;

const multiSelectState = {
  active: false,
  selectedIds: new Set(),
  escBound: false
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonParse(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function slugifyFileName(str, fallback = 'proyecto') {
  const cleaned = String(str || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return cleaned || fallback;
}

function sanitizeZipSegment(str, fallback = 'archivo') {
  const cleaned = String(str || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 90);
  return cleaned || fallback;
}

function inferExtensionFromMime(mimeType = '') {
  const m = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('xml')) return 'xml';
  if (m.includes('spreadsheetml') || m.includes('excel')) return 'xlsx';
  if (m === 'text/csv') return 'csv';
  if (m === 'application/json') return 'json';
  return 'bin';
}

function ensureSafeFileName(fileName, mimeType = '', fallbackBase = 'archivo') {
  const rawName = sanitizeZipSegment(fileName || fallbackBase, fallbackBase);
  let ext = getFileExtension(rawName);
  if (!ext || !ALLOWED_MEDIA_EXTENSIONS.has(ext)) {
    const inferred = inferExtensionFromMime(mimeType);
    ext = ALLOWED_MEDIA_EXTENSIONS.has(inferred) ? inferred : 'bin';
    return `${rawName.replace(/\.+$/, '')}.${ext}`;
  }
  return rawName;
}

function inferMimeType(fileName, explicitMime = '') {
  if (explicitMime && typeof explicitMime === 'string' && explicitMime.includes('/')) {
    return explicitMime.split(';')[0].trim();
  }
  const ext = getFileExtension(fileName);
  return MIME_BY_EXTENSION[ext] || 'application/octet-stream';
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
      a.remove();
    } catch (_) {}
  }, 1500);
}

function showPackageProgressOverlay({ title = 'Procesando paquete...', subtitle = '', pct = 5 } = {}) {
  let overlay = document.getElementById(PROGRESS_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = PROGRESS_OVERLAY_ID;
    overlay.className = 'fixed inset-0 z-[10050] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4';
    document.body.appendChild(overlay);
  }
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  overlay.innerHTML = `
    <div class="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-file-zipper text-blue-400 animate-pulse"></i>
        </div>
        <div class="min-w-0">
          <h3 class="text-sm font-bold text-white truncate">${escapeHtml(title)}</h3>
          <p id="${PROGRESS_OVERLAY_ID}-sub" class="text-xs text-slate-400 truncate mt-0.5">${escapeHtml(subtitle)}</p>
        </div>
      </div>
      <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/70">
        <div id="${PROGRESS_OVERLAY_ID}-bar" class="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-200" style="width:${clamped}%"></div>
      </div>
      <div class="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>Empaquetado portátil Cubikar</span>
        <span id="${PROGRESS_OVERLAY_ID}-pct" class="font-mono text-blue-300 font-semibold">${clamped}%</span>
      </div>
    </div>
  `;
}

function updatePackageProgressOverlay(subtitle, pct) {
  const subEl = document.getElementById(`${PROGRESS_OVERLAY_ID}-sub`);
  const barEl = document.getElementById(`${PROGRESS_OVERLAY_ID}-bar`);
  const pctEl = document.getElementById(`${PROGRESS_OVERLAY_ID}-pct`);
  const clamped = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  if (subEl && subtitle !== undefined) subEl.textContent = String(subtitle);
  if (barEl) barEl.style.width = `${clamped}%`;
  if (pctEl) pctEl.textContent = `${clamped}%`;
}

function closePackageProgressOverlay() {
  const overlay = document.getElementById(PROGRESS_OVERLAY_ID);
  if (overlay) overlay.remove();
}

function calculateFactorFromSettingsObj(settingsObj) {
  if (!settingsObj || !settingsObj.applySobrecosto) return 1.0;
  const fInd = 1 + ((parseFloat(settingsObj.pctIndirectos) || 0) / 100);
  const fFin = 1 + ((parseFloat(settingsObj.pctFinanciamiento) || 0) / 100);
  const fUtil = 1 + ((parseFloat(settingsObj.pctUtilidad) || 0) / 100);
  const fCarg = 1 + ((parseFloat(settingsObj.pctAdicionales) || 0) / 100);
  const fSeg = 1 + ((parseFloat(settingsObj.pctSegurosFianzas) || 0) / 100);
  return fInd * fFin * fUtil * fCarg * fSeg;
}

/**
 * Hidrata desde Supabase la configuración, árbol de catálogo y módulos de un proyecto
 * si faltan localmente o están desactualizados, para garantizar exportación completa desde el portal.
 */
async function ensureProjectDataHydratedForExport(project) {
  const pid = project.id;
  const cloudUuid = resolveCloudProjectId(pid);
  const canQueryCloud = isSupabaseConfigured() && (isValidUUID(cloudUuid) || project.isCloudSynced);

  let settings = safeJsonParse(localStorage.getItem(getSettingsKey(pid)), null);
  let treeData = safeJsonParse(localStorage.getItem(getStorageKey(pid)), null);

  if (canQueryCloud) {
    try {
      const sb = getSupabaseClient();
      const targetUuid = isValidUUID(cloudUuid) ? cloudUuid : pid;

      // 1. Árbol de catálogo si no existe en localStorage o está vacío
      if (!Array.isArray(treeData) || treeData.length === 0) {
        const cloudTree = await loadProjectTreeFromCloud(targetUuid);
        if (Array.isArray(cloudTree) && cloudTree.length > 0) {
          treeData = cloudTree;
          try {
            localStorage.setItem(getStorageKey(pid), JSON.stringify(cloudTree));
          } catch (_) {}
        }
      }

      // 2. Configuración desde Supabase proyectos.configuracion si falta settings local
      if (sb && isValidUUID(targetUuid)) {
        const { data: projRow } = await sb
          .from('proyectos')
          .select('nombre, cliente, ubicacion, tipo_obra, moneda, simbolo_moneda, factor_sobrecosto, configuracion, created_at, updated_at')
          .eq('id', targetUuid)
          .maybeSingle();

        if (projRow) {
          const rawCfg = (projRow.configuracion && typeof projRow.configuracion === 'object') ? projRow.configuracion : {};
          const cloudSettings = (rawCfg.settings && typeof rawCfg.settings === 'object') ? rawCfg.settings : rawCfg;
          if (!settings) {
            settings = Object.assign({}, defaultSettings, cloudSettings, {
              projectName: cloudSettings.projectName || projRow.nombre || project.projectName,
              companyName: cloudSettings.companyName || projRow.cliente || project.companyName,
              projectLocation: cloudSettings.projectLocation || projRow.ubicacion || project.projectLocation,
              currency: cloudSettings.currency || projRow.moneda || project.currency || 'MXN',
              currencySymbol: cloudSettings.currencySymbol || projRow.simbolo_moneda || project.currencySymbol || '$'
            });
            try {
              localStorage.setItem(getSettingsKey(pid), JSON.stringify(settings));
            } catch (_) {}
          }
          if (rawCfg.tabLocks && !localStorage.getItem(`adm_const_tab_locks_${pid}`)) {
            try {
              localStorage.setItem(`adm_const_tab_locks_${pid}`, JSON.stringify(rawCfg.tabLocks));
            } catch (_) {}
          }
        }
      }

      // 3. Módulos operativos desde Supabase (bitácora, compras, almacén, estimaciones, cronograma, chat)
      await hydrateProjectModulesFromCloud(pid, { force: true });
    } catch (err) {
      console.warn('[ProjectPackage] Advertencia hidratando proyecto desde nube:', err?.message || err);
    }
  }

  return {
    settings: Object.assign({}, defaultSettings, settings || {}, {
      companyName: settings?.companyName || project.companyName || defaultSettings.companyName,
      companyLogo: settings?.companyLogo || project.companyLogo || '',
      projectName: settings?.projectName || project.projectName || 'Proyecto',
      projectLocation: settings?.projectLocation || project.projectLocation || '',
      currency: settings?.currency || project.currency || 'MXN',
      currencySymbol: settings?.currencySymbol || project.currencySymbol || '$'
    }),
    treeData: Array.isArray(treeData) ? treeData : []
  };
}

function collectModulePayloadsConst(pid) {
  const rawOrNull = (key) => safeJsonParse(localStorage.getItem(key), null);
  return {
    estimaciones: rawOrNull(`estimaciones_data_${pid}`),
    expenses: rawOrNull(`expenses_control_${pid}`),
    almacen: rawOrNull(`adm_const_almacen_${pid}`),
    calendarioCfg: rawOrNull(`calendario_cfg_${pid}`),
    calendarioWorkdays: rawOrNull(`calendario_workdays_${pid}`),
    bitacora: rawOrNull(`adm_const_bitacora_${pid}`),
    chat: rawOrNull(`adm_const_project_chat_${pid}`),
    tabLocks: rawOrNull(`adm_const_tab_locks_${pid}`),
    signatures: rawOrNull(`adm_const_signatures_${pid}`)
  };
}

function detectModuloFromPath(pathParts = [], obj = null) {
  if (obj?.modulo && typeof obj.modulo === 'string') return obj.modulo;
  const joined = pathParts.join('.').toLowerCase();
  if (joined.includes('bitacora')) return 'bitacora';
  if (joined.includes('estimaciones')) return 'estimaciones';
  if (joined.includes('expenses') || joined.includes('compras')) return 'compras';
  if (joined.includes('almacen')) return 'almacen';
  if (joined.includes('chat')) return 'otros';
  if (joined.includes('logo') || joined.includes('branding') || joined.includes('settings')) return 'branding';
  return 'otros';
}

function isMediaRefObject(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
  return Boolean(
    (typeof val.mediaId === 'string' && val.mediaId.trim()) ||
    (typeof val.s3Key === 'string' && val.s3Key.trim()) ||
    (typeof val.archivoId === 'string' && val.archivoId.trim())
  );
}

function isBinaryDataUrl(val) {
  if (typeof val !== 'string') return false;
  const s = val.trim();
  if (!s.startsWith('data:')) return false;
  // Conservar SVGs ligeros inline sin volverlos archivos separados, salvo logos grandes
  if (s.startsWith('data:image/svg+xml') && s.length < 16384) return false;
  return /^data:(image\/|application\/pdf|application\/xml|text\/xml|application\/vnd\.|text\/csv)/i.test(s);
}

/**
 * Escanea recursivamente settings, treeData y todos los módulos para descubrir:
 * - Referencias gestionadas (mediaId / s3Key / archivoId)
 * - Payloads inline tipo data:... (fotos legacy, logos PNG/WebP/JPEG, XML/PDF embebidos)
 */
function scanStructuredMediaReferences(rootsBySection) {
  const managedRefsMap = new Map();
  const inlineDataMap = new Map();

  const registerManagedRef = (obj, pathParts) => {
    const mediaId = String(obj.mediaId || '').trim();
    const s3Key = String(obj.s3Key || '').trim();
    const archivoId = String(obj.archivoId || '').trim();
    const dedupeKey = mediaId || s3Key || archivoId;
    if (!dedupeKey) return;

    const existing = managedRefsMap.get(dedupeKey);
    const dataUrlHint = obj.localDataUrl || obj.dataUrl || (isBinaryDataUrl(obj.url) ? obj.url : '') || '';
    const modulo = detectModuloFromPath(pathParts, obj);
    const fileName = obj.fileName || obj.originalName || obj.name || `${modulo}_archivo`;
    const mimeType = obj.mimeType || obj.type || '';

    if (!existing) {
      managedRefsMap.set(dedupeKey, {
        refKey: dedupeKey,
        mediaId,
        s3Key,
        archivoId,
        bucket: obj.bucket || '',
        modulo,
        categoria: obj.categoria || (modulo === 'branding' ? 'branding' : 'project_files'),
        entidadId: obj.entidadId || '',
        fileName,
        mimeType,
        dataUrlHint,
        metadata: (obj.metadata && typeof obj.metadata === 'object') ? obj.metadata : {}
      });
    } else if (dataUrlHint && !existing.dataUrlHint) {
      existing.dataUrlHint = dataUrlHint;
    }
  };

  const walk = (node, pathParts) => {
    if (!node) return;
    if (typeof node === 'string') {
      if (isBinaryDataUrl(node)) {
        const semiIdx = node.indexOf(';');
        const mimeHeader = node.slice(5, semiIdx > 5 ? semiIdx : 64);
        const keyHint = `inline::${pathParts.join('.')}`;
        inlineDataMap.set(keyHint, {
          inlineKey: keyHint,
          pathParts: [...pathParts],
          dataUrl: node,
          modulo: detectModuloFromPath(pathParts),
          fileName: `${sanitizeZipSegment(pathParts[pathParts.length - 1] || 'archivo')}.${inferExtensionFromMime(mimeHeader)}`
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, [...pathParts, String(idx)]));
      return;
    }
    if (typeof node === 'object') {
      if (isMediaRefObject(node)) {
        registerManagedRef(node, pathParts);
        // También recoger campos internos no duplicados (por ej. factura con pdfFileRef + xmlFileRef en objeto hijo)
        for (const [k, v] of Object.entries(node)) {
          if (k === 'localDataUrl' || k === 'dataUrl' || k === 'url') continue;
          if (v && typeof v === 'object') walk(v, [...pathParts, k]);
        }
        return;
      }
      for (const [k, v] of Object.entries(node)) {
        walk(v, [...pathParts, k]);
      }
    }
  };

  for (const [sectionName, payload] of Object.entries(rootsBySection)) {
    walk(payload, [sectionName]);
  }

  return { managedRefsMap, inlineDataMap };
}

/**
 * Descarga u obtiene el Blob binario real de una referencia (IndexedDB local -> S3 presign -> fallback dataUrl).
 */
async function fetchBinaryBlobForRef(ref, projectId) {
  const lookupKey = ref.mediaId || ref.s3Key;
  if (lookupKey) {
    try {
      const cached = await getCachedMediaRecord(lookupKey);
      if (cached?.blob instanceof Blob && cached.blob.size > 0) {
        return {
          blob: cached.blob,
          fileName: cached.fileName || ref.fileName,
          mimeType: cached.mimeType || cached.blob.type || ref.mimeType
        };
      }
      if (cached?.dataUrl && isBinaryDataUrl(cached.dataUrl)) {
        const b = dataUrlToBlob(cached.dataUrl);
        return {
          blob: b,
          fileName: cached.fileName || ref.fileName,
          mimeType: cached.mimeType || b.type || ref.mimeType
        };
      }
    } catch (_) {}
  }

  if (ref.s3Key) {
    try {
      const resolvedUrl = await resolveManagedFileUrl({
        mediaId: ref.mediaId,
        s3Key: ref.s3Key,
        archivoId: ref.archivoId,
        proyectoId: projectId,
        fileName: ref.fileName,
        mimeType: ref.mimeType
      }, { cacheRemote: false });

      if (resolvedUrl) {
        const resp = await fetch(resolvedUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob && blob.size > 0) {
            return {
              blob,
              fileName: ref.fileName,
              mimeType: blob.type || ref.mimeType
            };
          }
        }
      }
    } catch (err) {
      console.warn('[ProjectPackage] No se pudo descargar desde S3:', ref.s3Key, err?.message || err);
    }
  }

  if (ref.dataUrlHint && isBinaryDataUrl(ref.dataUrlHint)) {
    const b = dataUrlToBlob(ref.dataUrlHint);
    return {
      blob: b,
      fileName: ref.fileName,
      mimeType: ref.mimeType || b.type
    };
  }

  return null;
}

/**
 * Consulta archivos adicionales registrados para el proyecto en IndexedDB o Supabase archivos_almacen
 * (por ej. Libro Completo PDF o reportes XLSX archivados) que no estén referenciados directamente inline.
 */
async function collectExtraProjectArchiveRefs(project, knownRefKeys) {
  const pid = project.id;
  const cloudUuid = resolveCloudProjectId(pid);
  const candidatePids = new Set([pid, cloudUuid].filter(Boolean));
  const extras = [];
  const seenKeys = new Set(knownRefKeys);

  try {
    const cachedAll = await getAllCachedMediaRecords();
    for (const rec of cachedAll) {
      if (!rec || !candidatePids.has(String(rec.proyectoId || ''))) continue;
      const key = rec.mediaId || rec.s3Key || rec.archivoId;
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      extras.push({
        refKey: key,
        mediaId: rec.mediaId || '',
        s3Key: rec.s3Key || '',
        archivoId: rec.archivoId || '',
        modulo: rec.modulo || 'otros',
        categoria: rec.categoria || 'project_files',
        entidadId: rec.entidadId || '',
        fileName: rec.fileName || 'archivo',
        mimeType: rec.mimeType || '',
        metadata: rec.metadata || {},
        directBlob: rec.blob instanceof Blob ? rec.blob : null
      });
    }
  } catch (_) {}

  if (isSupabaseConfigured() && isValidUUID(cloudUuid)) {
    try {
      const sb = getSupabaseClient();
      if (sb) {
        const { data: rows } = await sb
          .from('archivos_almacen')
          .select('*')
          .eq('proyecto_id', cloudUuid)
          .is('deleted_at', null);

        for (const r of (rows || [])) {
          const s3Key = String(r?.s3_key || '').trim();
          const archivoId = String(r?.id || '').trim();
          const key = s3Key || archivoId;
          if (!key || seenKeys.has(key)) continue;
          // Evitar duplicar si ya tenemos esa s3Key en managedRefs por mediaId
          const dupByS3 = Array.from(seenKeys).some(k => k === s3Key || k === archivoId);
          if (dupByS3) continue;
          seenKeys.add(key);
          extras.push({
            refKey: key,
            mediaId: '',
            s3Key,
            archivoId,
            modulo: r.modulo || 'reportes',
            categoria: r.categoria || 'project_files',
            entidadId: r.entidad_id || '',
            fileName: r.nombre_original || 'archivo',
            mimeType: r.mime_type || '',
            metadata: (r.metadata && typeof r.metadata === 'object') ? r.metadata : {}
          });
        }
      }
    } catch (err) {
      console.warn('[ProjectPackage] No se pudo consultar archivos_almacen extra:', err?.message || err);
    }
  }

  return extras;
}

/**
 * Genera el Blob .zip completo y portátil para un proyecto (datos, módulos y binarios reales).
 */
async function buildProjectPackageZipBlob(projectId, { onProgress } = {}) {
  const report = (sub, pct) => {
    if (typeof onProgress === 'function') onProgress(sub, pct);
  };

  if (typeof window === 'undefined' || typeof window.JSZip !== 'function') {
    throw new Error('JSZip no está disponible en el navegador. Recarga la página.');
  }
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error('No se encontró el proyecto seleccionado.');
  }

  report('Sincronizando datos y módulos desde la nube...', 8);
  const zip = new window.JSZip();
  const { settings, treeData } = await ensureProjectDataHydratedForExport(project);
  const modules = collectModulePayloadsConst(project.id);

  report('Analizando referencias de fotos, PDFs y documentos...', 24);
  const structuredRoots = {
    project: { companyLogo: project.companyLogo || '' },
    settings,
    treeData,
    modules
  };
  const { managedRefsMap, inlineDataMap } = scanStructuredMediaReferences(structuredRoots);

  const knownKeys = new Set();
  managedRefsMap.forEach((v) => {
    if (v.mediaId) knownKeys.add(v.mediaId);
    if (v.s3Key) knownKeys.add(v.s3Key);
    if (v.archivoId) knownKeys.add(v.archivoId);
  });

  const extraArchiveRefs = await collectExtraProjectArchiveRefs(project, knownKeys);
  const totalMediaWork = managedRefsMap.size + inlineDataMap.size + extraArchiveRefs.length;
  let processedMedia = 0;
  const bumpMediaProgress = (label) => {
    processedMedia += 1;
    const ratio = totalMediaWork > 0 ? processedMedia / totalMediaWork : 1;
    report(label, 26 + Math.round(ratio * 50));
  };

  const usedArchivePaths = new Set();
  const allocateUniqueZipPath = (modulo, fileName, mimeType) => {
    const safeMod = sanitizeZipSegment(modulo || 'otros', 'otros');
    const safeName = ensureSafeFileName(fileName, mimeType, 'archivo');
    let candidate = `media/${safeMod}/${safeName}`;
    let counter = 2;
    while (usedArchivePaths.has(candidate)) {
      const dotIdx = safeName.lastIndexOf('.');
      const base = dotIdx > 0 ? safeName.slice(0, dotIdx) : safeName;
      const ext = dotIdx > 0 ? safeName.slice(dotIdx) : '';
      candidate = `media/${safeMod}/${base}_${counter}${ext}`;
      counter += 1;
    }
    usedArchivePaths.add(candidate);
    return candidate;
  };

  const mediaManifest = [];
  const warnings = [];

  for (const ref of managedRefsMap.values()) {
    bumpMediaProgress(`Descargando: ${ref.fileName}`);
    const binary = await fetchBinaryBlobForRef(ref, project.id);
    if (!binary || !(binary.blob instanceof Blob) || binary.blob.size === 0) {
      warnings.push(`No se pudo obtener el binario de "${ref.fileName}" (${ref.s3Key || ref.mediaId}).`);
      continue;
    }
    const archivePath = allocateUniqueZipPath(ref.modulo, binary.fileName || ref.fileName, binary.mimeType);
    const mimeType = inferMimeType(archivePath, binary.mimeType || ref.mimeType);
    const sha256 = await computeSha256Hex(binary.blob);
    zip.file(archivePath, binary.blob, { binary: true });

    mediaManifest.push({
      kind: 'managed',
      archivePath,
      refKey: ref.refKey,
      originalMediaId: ref.mediaId,
      originalS3Key: ref.s3Key,
      originalArchivoId: ref.archivoId,
      modulo: ref.modulo || 'otros',
      categoria: ref.categoria || 'project_files',
      entidadId: ref.entidadId || '',
      fileName: ensureSafeFileName(binary.fileName || ref.fileName, mimeType),
      mimeType,
      bytes: binary.blob.size,
      sha256,
      metadata: ref.metadata || {}
    });
  }

  const extraArchiveManifest = [];
  for (const extra of extraArchiveRefs) {
    bumpMediaProgress(`Empaquetando adjunto adicional: ${extra.fileName}`);
    const binary = extra.directBlob
      ? { blob: extra.directBlob, fileName: extra.fileName, mimeType: extra.mimeType || extra.directBlob.type }
      : await fetchBinaryBlobForRef(extra, project.id);

    if (!binary || !(binary.blob instanceof Blob) || binary.blob.size === 0) {
      warnings.push(`No se pudo incluir adjunto adicional "${extra.fileName}".`);
      continue;
    }
    const archivePath = allocateUniqueZipPath(extra.modulo || 'reportes', binary.fileName || extra.fileName, binary.mimeType);
    const mimeType = inferMimeType(archivePath, binary.mimeType || extra.mimeType);
    const sha256 = await computeSha256Hex(binary.blob);
    zip.file(archivePath, binary.blob, { binary: true });

    extraArchiveManifest.push({
      kind: 'extra_archive',
      archivePath,
      modulo: extra.modulo || 'reportes',
      categoria: extra.categoria || 'project_files',
      entidadId: extra.entidadId || '',
      fileName: ensureSafeFileName(binary.fileName || extra.fileName, mimeType),
      mimeType,
      bytes: binary.blob.size,
      sha256,
      metadata: extra.metadata || {}
    });
  }

  const inlineManifest = [];
  for (const inlineItem of inlineDataMap.values()) {
    bumpMediaProgress(`Extrayendo recurso embebido: ${inlineItem.fileName}`);
    const blob = dataUrlToBlob(inlineItem.dataUrl);
    if (!blob || blob.size === 0) continue;
    const archivePath = allocateUniqueZipPath(inlineItem.modulo, inlineItem.fileName, blob.type);
    const mimeType = inferMimeType(archivePath, blob.type);
    const sha256 = await computeSha256Hex(blob);
    zip.file(archivePath, blob, { binary: true });
    inlineManifest.push({
      kind: 'inline_data',
      inlineKey: inlineItem.inlineKey,
      pathParts: inlineItem.pathParts,
      archivePath,
      modulo: inlineItem.modulo,
      fileName: ensureSafeFileName(inlineItem.fileName, mimeType),
      mimeType,
      bytes: blob.size,
      sha256
    });
  }

  const cleanProjectMeta = {
    id: project.id,
    companyName: settings.companyName || project.companyName || '',
    companyLogo: settings.companyLogo || project.companyLogo || '',
    projectName: settings.projectName || project.projectName || 'Proyecto',
    projectLocation: settings.projectLocation || project.projectLocation || '',
    tipoObra: project.tipoObra || 'Edificación',
    currency: settings.currency || project.currency || 'MXN',
    currencySymbol: settings.currencySymbol || project.currencySymbol || '$',
    factorSobrecosto: calculateFactorFromSettingsObj(settings) || project.factorSobrecosto || 1,
    totalPresupuesto: calculateTreeTotal(treeData) || project.totalPresupuesto || 0,
    conceptCount: countTreeConcepts(treeData),
    partidasCount: countTreePartidas(treeData),
    createdAt: project.createdAt || new Date().toISOString().slice(0, 10)
  };

  const allMediaItems = [...mediaManifest, ...extraArchiveManifest, ...inlineManifest];
  const totalMediaBytes = allMediaItems.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);

  const manifest = {
    schema: PACKAGE_SCHEMA,
    formatVersion: PACKAGE_FORMAT_VERSION,
    sourceApp: SOURCE_APP_ID,
    sourceAppLabel: 'Cubikar Construcción',
    exportedAt: new Date().toISOString(),
    project: cleanProjectMeta,
    stats: {
      partidasCount: cleanProjectMeta.partidasCount,
      conceptCount: cleanProjectMeta.conceptCount,
      totalPresupuesto: cleanProjectMeta.totalPresupuesto,
      bitacoraNotesCount: Array.isArray(modules.bitacora?.notes) ? modules.bitacora.notes.length : 0,
      estimacionesCount: Array.isArray(modules.estimaciones?.estimaciones) ? modules.estimaciones.estimaciones.length : 0,
      expensesCount: Array.isArray(modules.expenses?.records) ? modules.expenses.records.length : 0,
      suppliersCount: Array.isArray(modules.expenses?.suppliers) ? modules.expenses.suppliers.length : 0,
      almacenMovesCount: (modules.almacen?.receptions?.length || 0) + (modules.almacen?.movements?.length || 0),
      chatMessagesCount: Array.isArray(modules.chat) ? modules.chat.length : 0,
      mediaCount: allMediaItems.length,
      totalMediaBytes
    },
    media: mediaManifest,
    extraArchiveFiles: extraArchiveManifest,
    inlineDataRefs: inlineManifest,
    warnings
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify(cleanProjectMeta, null, 2));
  zip.file('settings.json', JSON.stringify(settings, null, 2));
  zip.file('treeData.json', JSON.stringify(treeData, null, 2));

  const modulesFolder = zip.folder('modules');
  Object.entries(modules).forEach(([modKey, payload]) => {
    if (payload !== null && payload !== undefined) {
      modulesFolder.file(`${modKey}.json`, JSON.stringify(payload, null, 2));
    }
  });

  const readmeLines = [
    'PAQUETE PORTATIL DE PROYECTO - CUBIKAR CONSTRUCCION',
    '===================================================',
    `Proyecto: ${cleanProjectMeta.projectName}`,
    `Empresa: ${cleanProjectMeta.companyName || 'N/A'}`,
    `Ubicación: ${cleanProjectMeta.projectLocation || 'N/A'}`,
    `Exportado: ${manifest.exportedAt}`,
    `Conceptos APU: ${cleanProjectMeta.conceptCount} | Partidas: ${cleanProjectMeta.partidasCount}`,
    `Archivos adjuntos incluidos en media/: ${allMediaItems.length} (${formatBytes(totalMediaBytes)})`,
    '',
    'Para restaurarlo en otra cuenta:',
    '1. Inicia sesión en const.cubikar.app con la cuenta receptora.',
    '2. En "Mis proyectos", haz clic en "Importar (.zip)".',
    '3. Selecciona este archivo .zip (o varios a la vez) y confirma la importación.',
    '',
    ...(warnings.length ? ['Advertencias:', ...warnings.map(w => `- ${w}`)] : [])
  ];
  zip.file('LEEME.txt', readmeLines.join('\n'));

  report('Comprimiendo paquete portátil .zip...', 80);
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    },
    (meta) => {
      const pct = 80 + Math.round((Number(meta?.percent || 0) / 100) * 19);
      report('Generando archivo .zip comprimido...', pct);
    }
  );

  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `${slugifyFileName(cleanProjectMeta.projectName)}_Cubikar_CONST_${dateTag}.zip`;

  return { zipBlob, fileName, mediaCount: allMediaItems.length, warnings };
}

/**
 * Empaqueta y descarga un proyecto completo en formato .zip portátil (datos + binarios reales).
 */
export async function exportFullProjectZipAction(projectId, event = null) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  const menuEl = document.getElementById(`menu-card-${projectId}`);
  if (menuEl) menuEl.classList.add('hidden');

  if (packageOperationBusy) {
    showToast('Ya hay una operación de paquete en curso. Espera un momento.', 'info');
    return;
  }

  const project = getProjectById(projectId);
  if (!project) {
    showToast('No se encontró el proyecto seleccionado.', 'error');
    return;
  }

  packageOperationBusy = true;
  showPackageProgressOverlay({
    title: `Exportando "${project.projectName || 'Proyecto'}"`,
    subtitle: 'Iniciando exportación...',
    pct: 5
  });

  try {
    const { zipBlob, fileName, mediaCount, warnings } = await buildProjectPackageZipBlob(projectId, {
      onProgress: (sub, pct) => updatePackageProgressOverlay(sub, pct)
    });
    triggerBlobDownload(zipBlob, fileName);
    updatePackageProgressOverlay('¡Paquete listo!', 100);

    if (warnings.length > 0) {
      showToast(
        `Proyecto descargado con ${mediaCount} archivo(s), aunque ${warnings.length} adjunto(s) no se pudieron obtener de la nube.`,
        'warning',
        6000
      );
    } else {
      showToast(
        `Proyecto completo descargado en "${fileName}" (${mediaCount} archivo(s) incluidos).`,
        'success',
        5000
      );
    }
  } catch (err) {
    console.error('[ProjectPackage] Error exportando proyecto:', err);
    showToast(`No se pudo generar el paquete .zip: ${err?.message || err}`, 'error', 5500);
  } finally {
    packageOperationBusy = false;
    closePackageProgressOverlay();
  }
}

// ==========================================
// MODO SELECCIÓN TEMPORAL (FORMA B - GOOGLE DRIVE)
// ==========================================

function getVisibleProjectElements() {
  const cards = Array.from(document.querySelectorAll('.project-card[data-project-id]')).filter(el => (
    el.style.display !== 'none' && !el.classList.contains('hidden')
  ));
  const rows = Array.from(document.querySelectorAll('.table-project-row[data-project-id]')).filter(el => (
    el.style.display !== 'none' && !el.classList.contains('hidden')
  ));
  return { cards, rows };
}

function getVisibleProjectIds() {
  const { cards, rows } = getVisibleProjectElements();
  const ids = new Set();
  const listView = document.getElementById('projectsTable');
  const isTableVisible = listView && !listView.classList.contains('hidden');
  (isTableVisible && rows.length ? rows : cards).forEach((el) => {
    const pid = el.getAttribute('data-project-id');
    if (pid) ids.add(pid);
  });
  return Array.from(ids);
}

function handleMultiSelectEscKey(e) {
  if (e.key === 'Escape' && multiSelectState.active && !packageOperationBusy) {
    exitProjectMultiSelectMode();
  }
}

function renderFloatingMultiSelectBar() {
  const existing = document.getElementById('cubikar-multiselect-bar');
  if (!multiSelectState.active) {
    if (existing) existing.remove();
    return;
  }

  let bar = existing;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cubikar-multiselect-bar';
    document.body.appendChild(bar);
  }

  const visibleIds = getVisibleProjectIds();
  const selectedCount = multiSelectState.selectedIds.size;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => multiSelectState.selectedIds.has(id));

  bar.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[9990] max-w-[95vw] px-4 py-2.5 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl flex flex-wrap items-center justify-center gap-2.5 text-xs';
  bar.innerHTML = `
    <span class="font-bold text-white flex items-center gap-2 pr-1">
      <span class="min-w-[22px] h-[22px] px-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center font-mono text-[11px]">${selectedCount}</span>
      <span>seleccionado${selectedCount === 1 ? '' : 's'}</span>
    </span>
    <div class="h-4 w-px bg-slate-700 hidden sm:block"></div>
    <button type="button" onclick="selectAllVisibleProjectsAction()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 transition cursor-pointer">
      ${allVisibleSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
    </button>
    <button type="button" onclick="downloadSelectedProjectsZipAction()" ${selectedCount === 0 ? 'disabled' : ''} class="px-3.5 py-1.5 rounded-xl ${selectedCount > 0 ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} font-bold flex items-center gap-1.5 transition">
      <i class="fa-solid fa-file-zipper"></i>
      <span>Descargar por separado (.zip)</span>
    </button>
    <button type="button" onclick="exitProjectMultiSelectMode()" class="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-medium border border-slate-700/80 transition cursor-pointer">
      Cancelar
    </button>
  `;
}

export function syncProjectMultiSelectUI() {
  const { cards, rows } = getVisibleProjectElements();

  cards.forEach((card) => {
    const pid = card.getAttribute('data-project-id');
    const existingBadge = card.querySelector('.cubikar-ms-card-badge');

    if (!multiSelectState.active) {
      if (existingBadge) existingBadge.remove();
      card.classList.remove('ring-2', 'ring-emerald-400', 'border-emerald-500/80', 'cursor-pointer');
      return;
    }

    const isSelected = Boolean(pid && multiSelectState.selectedIds.has(pid));
    if (!card.dataset.msBound) {
      card.dataset.msBound = '1';
      card.addEventListener('click', (e) => {
        if (!multiSelectState.active) return;
        if (e.target.closest('button, a, input, select, label, [id^="menu-card-"]')) return;
        e.preventDefault();
        e.stopPropagation();
        toggleProjectMultiSelect(card.getAttribute('data-project-id'));
      });
    }

    card.classList.add('cursor-pointer');
    card.classList.toggle('ring-2', isSelected);
    card.classList.toggle('ring-emerald-400', isSelected);
    card.classList.toggle('border-emerald-500/80', isSelected);

    let badge = existingBadge;
    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'cubikar-ms-card-badge absolute -top-2.5 -left-2.5 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center shadow-lg transition cursor-pointer';
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleProjectMultiSelect(pid);
      });
      card.appendChild(badge);
    }
    badge.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    badge.className = `cubikar-ms-card-badge absolute -top-2.5 -left-2.5 z-20 w-6 h-6 rounded-full border-2 flex items-center justify-center shadow-lg transition cursor-pointer ${
      isSelected
        ? 'bg-emerald-500 border-emerald-300 text-slate-950 scale-105'
        : 'bg-slate-900/95 border-slate-500 text-transparent hover:border-emerald-400'
    }`;
    badge.innerHTML = isSelected ? '<i class="fa-solid fa-check text-[11px] font-bold"></i>' : '';
  });

  rows.forEach((row) => {
    const pid = row.getAttribute('data-project-id');
    const firstCell = row.querySelector('td');
    const existingRowBadge = row.querySelector('.cubikar-ms-row-badge');
    if (!multiSelectState.active) {
      if (existingRowBadge) existingRowBadge.remove();
      row.classList.remove('bg-emerald-950/25');
      return;
    }
    const isSelected = Boolean(pid && multiSelectState.selectedIds.has(pid));
    row.classList.toggle('bg-emerald-950/25', isSelected);
    if (firstCell) {
      let badge = existingRowBadge;
      if (!badge) {
        badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'cubikar-ms-row-badge inline-flex w-5 h-5 mr-2 rounded-md border items-center justify-center align-middle transition cursor-pointer';
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleProjectMultiSelect(pid);
        });
        firstCell.prepend(badge);
      }
      badge.className = `cubikar-ms-row-badge inline-flex w-5 h-5 mr-2 rounded-md border items-center justify-center align-middle transition cursor-pointer ${
        isSelected ? 'bg-emerald-500 border-emerald-300 text-slate-950' : 'bg-slate-900 border-slate-600 text-transparent'
      }`;
      badge.innerHTML = isSelected ? '<i class="fa-solid fa-check text-[10px]"></i>' : '';
    }
  });

  renderFloatingMultiSelectBar();
}

export function enterProjectMultiSelectMode(initialProjectId = null, event = null) {
  if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  if (initialProjectId) {
    const menuEl = document.getElementById(`menu-card-${initialProjectId}`);
    if (menuEl) menuEl.classList.add('hidden');
  }
  multiSelectState.active = true;
  if (initialProjectId) {
    multiSelectState.selectedIds.add(String(initialProjectId));
  }
  if (!multiSelectState.escBound && typeof document !== 'undefined') {
    multiSelectState.escBound = true;
    document.addEventListener('keydown', handleMultiSelectEscKey);
  }
  syncProjectMultiSelectUI();
}

export function exitProjectMultiSelectMode() {
  multiSelectState.active = false;
  multiSelectState.selectedIds.clear();
  if (multiSelectState.escBound && typeof document !== 'undefined') {
    multiSelectState.escBound = false;
    document.removeEventListener('keydown', handleMultiSelectEscKey);
  }
  syncProjectMultiSelectUI();
}

export function toggleProjectMultiSelect(projectId) {
  if (!projectId) return;
  const key = String(projectId);
  if (multiSelectState.selectedIds.has(key)) {
    multiSelectState.selectedIds.delete(key);
  } else {
    multiSelectState.selectedIds.add(key);
  }
  syncProjectMultiSelectUI();
}

export function selectAllVisibleProjectsAction() {
  const visibleIds = getVisibleProjectIds();
  if (visibleIds.length === 0) return;
  const allSelected = visibleIds.every(id => multiSelectState.selectedIds.has(id));
  if (allSelected) {
    visibleIds.forEach(id => multiSelectState.selectedIds.delete(id));
  } else {
    visibleIds.forEach(id => multiSelectState.selectedIds.add(id));
  }
  syncProjectMultiSelectUI();
}

/**
 * Descarga todos los proyectos seleccionados como paquetes .zip independientes (guardados en carpeta elegida
 * cuando el navegador soporta File System Access API, o en descargas secuenciales individuales como respaldo).
 */
export async function downloadSelectedProjectsZipAction() {
  if (packageOperationBusy) {
    showToast('Ya hay una operación de paquete en curso. Espera un momento.', 'info');
    return;
  }

  const selectedIds = Array.from(multiSelectState.selectedIds).filter(id => Boolean(getProjectById(id)));
  if (selectedIds.length === 0) {
    showToast('Selecciona al menos un proyecto para descargar.', 'warning');
    return;
  }

  let dirHandle = null;
  if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (err?.name === 'AbortError') {
        showToast('Descarga múltiple cancelada.', 'info');
        return;
      }
      // Si el contexto bloquea showDirectoryPicker (p.ej. iframe/política), continuar con descarga secuencial
      dirHandle = null;
    }
  }

  packageOperationBusy = true;
  showPackageProgressOverlay({
    title: `Exportando ${selectedIds.length} proyecto(s) por separado`,
    subtitle: dirHandle ? 'Guardando paquetes individuales en la carpeta seleccionada...' : 'Preparando descargas secuenciales...',
    pct: 2
  });

  const usedBatchNames = new Set();
  const makeUniqueBatchName = (fileName) => {
    let candidate = fileName;
    let idx = 2;
    while (usedBatchNames.has(candidate)) {
      candidate = fileName.replace(/\.zip$/i, `_${idx}.zip`);
      idx += 1;
    }
    usedBatchNames.add(candidate);
    return candidate;
  };

  let okCount = 0;
  let totalWarnings = 0;
  const failedProjects = [];

  try {
    for (let i = 0; i < selectedIds.length; i++) {
      const pid = selectedIds[i];
      const proj = getProjectById(pid);
      const projTitle = proj?.projectName || `Proyecto ${i + 1}`;
      const basePct = Math.round((i / selectedIds.length) * 100);

      try {
        const { zipBlob, fileName, warnings } = await buildProjectPackageZipBlob(pid, {
          onProgress: (sub, innerPct) => {
            const overall = Math.min(99, Math.round(((i + (Number(innerPct || 0) / 100)) / selectedIds.length) * 100));
            updatePackageProgressOverlay(`[${i + 1}/${selectedIds.length}] ${projTitle}: ${sub}`, overall || basePct);
          }
        });

        const uniqueFileName = makeUniqueBatchName(fileName);
        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(uniqueFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(zipBlob);
          await writable.close();
        } else {
          triggerBlobDownload(zipBlob, uniqueFileName);
          if (i < selectedIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 650));
          }
        }

        okCount += 1;
        totalWarnings += warnings.length;
      } catch (err) {
        console.error(`[ProjectPackage] Error exportando "${projTitle}":`, err);
        failedProjects.push(projTitle);
      }
    }

    updatePackageProgressOverlay('¡Exportación múltiple completada!', 100);
    exitProjectMultiSelectMode();

    if (failedProjects.length > 0) {
      showToast(
        `Se exportaron ${okCount} de ${selectedIds.length} proyectos. Fallaron: ${failedProjects.join(', ')}.`,
        'warning',
        6500
      );
    } else if (totalWarnings > 0) {
      showToast(
        `Se ${dirHandle ? 'guardaron' : 'descargaron'} ${okCount} paquetes .zip separados (${totalWarnings} adjunto(s) con advertencia de nube).`,
        'warning',
        6000
      );
    } else {
      showToast(
        `¡Se ${dirHandle ? 'guardaron en tu carpeta' : 'descargaron'} ${okCount} proyecto(s) en paquetes .zip separados!`,
        'success',
        5500
      );
    }
  } finally {
    packageOperationBusy = false;
    closePackageProgressOverlay();
  }
}

/**
 * Resuelve la información de cuota S3 y límite de proyectos considerando Modo Anfitrión si aplica.
 */
async function evaluateRecipientQuotas(targetScope, requiredBytes, maxSingleFileBytes) {
  const user = getCurrentUser();
  const projectCheck = canUserCreateProject(user, targetScope);
  const hostEmail = (targetScope && typeof targetScope === 'string' && targetScope.startsWith('owner:'))
    ? targetScope.replace('owner:', '').toLowerCase().trim()
    : (user?.email || '').toLowerCase().trim();

  const effectivePlanId = getUserPlanId(hostEmail || user);
  const spec = getPlanStorageSpec(effectivePlanId);

  let usedProjectBytes = 0;
  let remainingProjectBytes = spec.projectFilesCapBytes;
  let quotaSource = 'local';

  try {
    const isOwnScope = !hostEmail || hostEmail === (user?.email || '').toLowerCase().trim();
    if (isOwnScope) {
      const summary = await getHostStorageSummary({ projectId: '', forceRefresh: true });
      usedProjectBytes = summary.projectFilesBytes || 0;
      remainingProjectBytes = summary.remainingProjectBytes ?? Math.max(0, spec.projectFilesCapBytes - usedProjectBytes);
      quotaSource = summary.source || 'summary';
    } else if (isSupabaseConfigured()) {
      const sb = getSupabaseClient();
      const { data: sessionData } = sb ? await sb.auth.getSession() : { data: null };
      if (sb && sessionData?.session?.access_token) {
        const { data } = await sb.rpc('obtener_consumo_almacen_anfitrion', { p_owner_email: hostEmail });
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          usedProjectBytes = Number(row.project_files_bytes || 0);
          remainingProjectBytes = Math.max(0, spec.projectFilesCapBytes - usedProjectBytes);
          quotaSource = 'supabase';
        }
      }
    }
  } catch (_) {}

  const exceedsProjectCap = requiredBytes > 0 && requiredBytes > remainingProjectBytes;
  const exceedsSingleFileLimit = maxSingleFileBytes > 0 && maxSingleFileBytes > spec.maxFileBytes;

  return {
    projectCheck,
    hostEmail,
    planSpec: spec,
    usedProjectBytes,
    remainingProjectBytes,
    quotaSource,
    exceedsProjectCap,
    exceedsSingleFileLimit,
    storageAllowed: !exceedsProjectCap && !exceedsSingleFileLimit
  };
}

function getPackageModalContainer() {
  let el = document.getElementById(MODAL_ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = MODAL_ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

export function closeImportProjectZipModal() {
  if (packageOperationBusy) return;
  currentImportState = null;
  const el = document.getElementById(MODAL_ROOT_ID);
  if (el) el.remove();
}

function renderImportModalShell(bodyHtml) {
  const root = getPackageModalContainer();
  root.className = 'fixed inset-0 z-[10040] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto';
  root.onclick = (e) => {
    if (e.target === root) closeImportProjectZipModal();
  };
  root.innerHTML = `
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 my-auto" onclick="event.stopPropagation()">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <i class="fa-solid fa-file-zipper text-emerald-400"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-white">Importar Proyecto Completo (.zip)</h2>
            <p class="text-xs text-slate-400">Restaura catálogo, bitácora, estimaciones, compras, almacén, fotos y PDFs en esta cuenta</p>
          </div>
        </div>
        <button type="button" onclick="closeImportProjectZipModal()" class="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer" aria-label="Cerrar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="p-6">${bodyHtml}</div>
    </div>
  `;
}

function computeRemainingSlots(projectCheck) {
  if (!projectCheck || !projectCheck.allowed) return 0;
  const raw = Number(projectCheck.maxProjects || 0) - Number(projectCheck.currentProjects || 0);
  return raw > 0 ? raw : 999;
}

/**
 * Abre el modal unificado para seleccionar e inspeccionar 1 o varios paquetes .zip antes de importarlos.
 */
export function openImportProjectZipModal(scopeOverride = null) {
  const user = getCurrentUser();
  if (!user || !user.email) {
    showToast('Debes iniciar sesión para importar un proyecto.', 'warning');
    return;
  }
  const targetScope = scopeOverride || 'owned';
  currentImportState = { mode: 'idle', targetScope, zip: null, manifest: null, items: [] };

  renderImportModalShell(`
    <label id="cubikar-import-dropzone" class="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500/60 bg-slate-950/50 rounded-2xl p-7 text-center cursor-pointer transition group">
      <input id="cubikar-import-zip-input" type="file" accept=".zip,application/zip" multiple class="hidden">
      <div class="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mb-2.5 group-hover:scale-105 transition">
        <i class="fa-solid fa-cloud-arrow-up text-xl text-blue-400"></i>
      </div>
      <p class="text-sm font-semibold text-white">Haz clic o arrastra uno o varios paquetes <span class="text-blue-400 font-mono">.zip</span></p>
      <p class="text-xs text-slate-400 mt-1 max-w-md">Si eliges 1 verás su vista previa detallada; si eliges varios se mostrarán en cola para importarlos juntos.</p>
    </label>
    <div id="cubikar-import-preview" class="mt-4"></div>
  `);

  const input = document.getElementById('cubikar-import-zip-input');
  const dropzone = document.getElementById('cubikar-import-dropzone');
  if (input) {
    input.addEventListener('change', (e) => {
      const files = Array.from(e.target?.files || []);
      if (files.length > 0) inspectSelectedProjectZips(files);
    });
  }
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-blue-500', 'bg-blue-500/10');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-blue-500', 'bg-blue-500/10');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-blue-500', 'bg-blue-500/10');
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) inspectSelectedProjectZips(files);
    });
  }
}

async function parseSinglePackageCandidate(file, maxFileLimitBytes) {
  try {
    const zip = await window.JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return { fileName: file.name, valid: false, incompatible: false, error: 'Sin manifest.json válido de Cubikar.' };
    }
    const manifest = safeJsonParse(await manifestFile.async('string'), null);
    if (!manifest || manifest.schema !== PACKAGE_SCHEMA) {
      return { fileName: file.name, valid: false, incompatible: false, error: 'Formato .zip no reconocido.' };
    }
    if (manifest.sourceApp !== SOURCE_APP_ID) {
      const originLabel = manifest.sourceApp === 'arq' ? 'Cubikar Arquitectura' : (manifest.sourceAppLabel || manifest.sourceApp);
      return {
        fileName: file.name,
        valid: false,
        incompatible: true,
        manifest,
        desiredName: manifest.project?.projectName || file.name.replace(/\.zip$/i, ''),
        error: `Pertenece a ${originLabel}`
      };
    }

    const mediaList = [
      ...(Array.isArray(manifest.media) ? manifest.media : []),
      ...(Array.isArray(manifest.extraArchiveFiles) ? manifest.extraArchiveFiles : []),
      ...(Array.isArray(manifest.inlineDataRefs) ? manifest.inlineDataRefs : [])
    ];
    const totalMediaBytes = mediaList.reduce((acc, m) => acc + (Number(m?.bytes) || 0), 0);
    const maxSingleFileBytes = mediaList.reduce((maxB, m) => Math.max(maxB, Number(m?.bytes) || 0), 0);
    const exceedsSingleFile = maxFileLimitBytes > 0 && maxSingleFileBytes > maxFileLimitBytes;

    return {
      fileName: file.name,
      valid: !exceedsSingleFile,
      incompatible: false,
      exceedsSingleFile,
      error: exceedsSingleFile ? `Archivo de ${formatBytes(maxSingleFileBytes)} supera límite del plan (${formatBytes(maxFileLimitBytes)})` : '',
      zip,
      manifest,
      stats: manifest.stats || {},
      mediaList,
      totalMediaBytes,
      maxSingleFileBytes,
      desiredName: (manifest.project?.projectName || file.name.replace(/\.zip$/i, '') || 'Proyecto Importado').trim(),
      selected: !exceedsSingleFile,
      status: exceedsSingleFile ? 'error' : 'ready'
    };
  } catch (err) {
    return {
      fileName: file.name,
      valid: false,
      incompatible: false,
      error: err?.message || 'Archivo .zip inválido o dañado.'
    };
  }
}

async function inspectSelectedProjectZips(fileList) {
  const previewEl = document.getElementById('cubikar-import-preview');
  if (!previewEl) return;

  if (typeof window === 'undefined' || typeof window.JSZip !== 'function') {
    previewEl.innerHTML = `<div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">JSZip no está disponible en el navegador.</div>`;
    return;
  }

  const files = Array.from(fileList || []).filter(Boolean);
  if (files.length === 0) return;

  if (files.length === 1) {
    return inspectSingleProjectZip(files[0], previewEl);
  }

  previewEl.innerHTML = `
    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 flex items-center gap-3">
      <i class="fa-solid fa-spinner fa-spin text-blue-400"></i>
      <span>Analizando <strong>${files.length} paquetes .zip</strong>...</span>
    </div>
  `;

  try {
    const targetScope = currentImportState?.targetScope || 'owned';
    const baseQuota = await evaluateRecipientQuotas(targetScope, 0, 0);
    const items = [];
    for (const f of files) {
      items.push(await parseSinglePackageCandidate(f, baseQuota.planSpec.maxFileBytes));
    }

    currentImportState = {
      mode: 'batch',
      targetScope,
      quota: baseQuota,
      remainingSlots: computeRemainingSlots(baseQuota.projectCheck),
      items
    };

    renderBatchImportPreview();
  } catch (err) {
    console.error('[ProjectPackage] Error analizando lote:', err);
    previewEl.innerHTML = `
      <div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200">
        No se pudieron analizar los archivos .zip: ${escapeHtml(err?.message || err)}
      </div>
    `;
  }
}

function getBatchRowStatusBadgeHtml(item) {
  if (item.status === 'importing') {
    return `<span class="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-semibold"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Importando</span>`;
  }
  if (item.status === 'done') {
    return `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold"><i class="fa-solid fa-check mr-1"></i>Importado</span>`;
  }
  if (item.status === 'error' || !item.valid) {
    return `<span class="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">${escapeHtml(item.incompatible ? 'Otra app' : 'Omitido')}</span>`;
  }
  return `<span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-medium">En cola</span>`;
}

function renderBatchImportPreview() {
  const previewEl = document.getElementById('cubikar-import-preview');
  const st = currentImportState;
  if (!previewEl || !st || st.mode !== 'batch') return;

  const { items, quota, remainingSlots, importing, completed } = st;
  const selectedItems = items.filter(it => it.valid && it.selected);
  const selectedCount = selectedItems.length;
  const selectedMediaBytes = selectedItems.reduce((sum, it) => sum + (Number(it.totalMediaBytes) || 0), 0);

  const slotsExceeded = selectedCount > remainingSlots;
  const projectBlocked = !quota.projectCheck.allowed || slotsExceeded;
  const storageBlocked = selectedMediaBytes > quota.remainingProjectBytes;
  const canConfirm = !importing && !completed && selectedCount > 0 && !projectBlocked && !storageBlocked;

  previewEl.innerHTML = `
    <div class="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div>
          <span class="text-xs font-bold text-white">${items.length} paquetes detectados</span>
          <span class="text-[11px] text-slate-400 ml-2">(${selectedCount} seleccionado${selectedCount === 1 ? '' : 's'} para importar)</span>
        </div>
        <div class="text-[11px] text-slate-300">
          Obras disponibles: <strong class="${slotsExceeded ? 'text-rose-400' : 'text-emerald-400'}">${remainingSlots >= 999 ? 'Ilimitado' : remainingSlots}</strong>
          • S3 libre: <strong class="${storageBlocked ? 'text-rose-400' : 'text-emerald-400'}">${escapeHtml(formatBytes(quota.remainingProjectBytes))}</strong>
          <span class="text-slate-400">(Req: ${escapeHtml(formatBytes(selectedMediaBytes))})</span>
        </div>
      </div>

      <div class="max-h-64 overflow-y-auto space-y-2 pr-1">
        ${items.map((it, idx) => `
          <div id="cubikar-batch-row-${idx}" class="p-2.5 rounded-xl bg-slate-900/90 border ${!it.valid ? 'border-rose-500/30 opacity-75' : (it.selected ? 'border-blue-500/40' : 'border-slate-800')} flex items-center gap-3 text-xs">
            <input type="checkbox"
                   ${it.selected ? 'checked' : ''}
                   ${(!it.valid || importing || completed) ? 'disabled' : ''}
                   onchange="toggleBatchImportItem(${idx})"
                   class="w-4 h-4 rounded accent-emerald-500 cursor-pointer shrink-0">
            <div class="flex-1 min-w-0">
              ${it.valid ? `
                <input type="text"
                       value="${escapeHtml(it.desiredName)}"
                       ${(importing || completed) ? 'disabled' : ''}
                       oninput="updateBatchImportItemName(${idx}, this.value)"
                       class="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700/80 text-xs font-semibold text-white focus:border-blue-500 focus:outline-none">
              ` : `
                <div class="font-semibold text-slate-300 truncate">${escapeHtml(it.desiredName || it.fileName)}</div>
              `}
              <div class="text-[11px] ${it.valid ? 'text-slate-400' : 'text-rose-300'} mt-0.5 truncate">
                ${it.valid
                  ? `${escapeHtml(it.stats?.conceptCount || 0)} conceptos • ${it.mediaList?.length || 0} archivo(s) (${escapeHtml(formatBytes(it.totalMediaBytes))}) • ${escapeHtml(it.fileName)}`
                  : `${escapeHtml(it.error || 'Archivo inválido')} • ${escapeHtml(it.fileName)}`}
              </div>
            </div>
            <div id="cubikar-batch-badge-${idx}" class="shrink-0">${getBatchRowStatusBadgeHtml(it)}</div>
          </div>
        `).join('')}
      </div>

      ${projectBlocked ? `
        <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
          <span><i class="fa-solid fa-lock mr-1 text-rose-400"></i>${
            !quota.projectCheck.allowed
              ? escapeHtml(quota.projectCheck.reason)
              : `Seleccionaste ${selectedCount} proyectos pero solo quedan ${remainingSlots} espacio(s) disponible(s) en tu plan.`
          }</span>
          ${!quota.projectCheck.isHostContext ? `<button type="button" onclick="closeImportProjectZipModal(); openSubscriptionModal?.();" class="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-500/30 cursor-pointer">Mejorar Plan</button>` : ''}
        </div>
      ` : ''}

      ${storageBlocked ? `
        <div class="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-2">
          <span><i class="fa-solid fa-hard-drive mr-1 text-rose-400"></i>Los archivos seleccionados (${escapeHtml(formatBytes(selectedMediaBytes))}) superan tu espacio S3 disponible (${escapeHtml(formatBytes(quota.remainingProjectBytes))}).</span>
          <button type="button" onclick="closeImportProjectZipModal(); openSubscriptionModal?.();" class="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-500/30 cursor-pointer">Ver Planes</button>
        </div>
      ` : ''}

      <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
        ${completed ? `
          <button type="button" onclick="closeImportProjectZipModal()" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">
            Listo (Cerrar)
          </button>
        ` : `
          <button type="button" ${importing ? 'disabled' : ''} onclick="closeImportProjectZipModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer">
            Cancelar
          </button>
          <button id="cubikar-confirm-import-btn" type="button" ${canConfirm ? '' : 'disabled'}
                  onclick="executeConfirmedBatchZipImport()"
                  class="px-5 py-2 rounded-xl ${canConfirm ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} text-xs font-bold flex items-center gap-2 transition">
            <i class="fa-solid ${importing ? 'fa-spinner fa-spin' : 'fa-file-import'}"></i>
            <span>${importing ? 'Importando lote...' : `Importar ${selectedCount} proyecto${selectedCount === 1 ? '' : 's'}`}</span>
          </button>
        `}
      </div>
    </div>
  `;
}

export function toggleBatchImportItem(index) {
  if (!currentImportState || currentImportState.mode !== 'batch' || currentImportState.importing) return;
  const item = currentImportState.items[index];
  if (!item || !item.valid) return;
  item.selected = !item.selected;
  renderBatchImportPreview();
}

export function updateBatchImportItemName(index, value) {
  if (!currentImportState || currentImportState.mode !== 'batch' || currentImportState.importing) return;
  const item = currentImportState.items[index];
  if (item) item.desiredName = String(value || '');
}

async function inspectSingleProjectZip(file, previewEl) {
  previewEl.innerHTML = `
    <div class="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 flex items-center gap-3">
      <i class="fa-solid fa-spinner fa-spin text-blue-400"></i>
      <span>Analizando paquete <strong>${escapeHtml(file.name)}</strong> (${escapeHtml(formatBytes(file.size))})...</span>
    </div>
  `;

  try {
    const zip = await window.JSZip.loadAsync(file);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      throw new Error('El archivo .zip no contiene manifest.json válido de Cubikar.');
    }
    const manifest = safeJsonParse(await manifestFile.async('string'), null);
    if (!manifest || manifest.schema !== PACKAGE_SCHEMA) {
      throw new Error('El paquete no corresponde al formato portátil oficial de Cubikar.');
    }

    if (manifest.sourceApp !== SOURCE_APP_ID) {
      const originLabel = manifest.sourceApp === 'arq' ? 'Cubikar Arquitectura' : (manifest.sourceAppLabel || manifest.sourceApp);
      previewEl.innerHTML = `
        <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 space-y-2">
          <div class="font-bold flex items-center gap-2 text-amber-300">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>Paquete incompatible con Cubikar Construcción</span>
          </div>
          <p>Este archivo fue exportado desde <strong>${escapeHtml(originLabel)}</strong> (${escapeHtml(manifest.project?.projectName || 'Proyecto')}). Ábrelo e impórtalo directamente dentro de esa aplicación.</p>
        </div>
      `;
      return;
    }

    const stats = manifest.stats || {};
    const mediaList = [
      ...(Array.isArray(manifest.media) ? manifest.media : []),
      ...(Array.isArray(manifest.extraArchiveFiles) ? manifest.extraArchiveFiles : []),
      ...(Array.isArray(manifest.inlineDataRefs) ? manifest.inlineDataRefs : [])
    ];
    const totalMediaBytes = mediaList.reduce((acc, m) => acc + (Number(m?.bytes) || 0), 0);
    const maxSingleFileBytes = mediaList.reduce((maxB, m) => Math.max(maxB, Number(m?.bytes) || 0), 0);

    const targetScope = currentImportState?.targetScope || 'owned';
    const quota = await evaluateRecipientQuotas(targetScope, totalMediaBytes, maxSingleFileBytes);

    currentImportState = {
      mode: 'single',
      targetScope,
      zip,
      manifest,
      quota,
      mediaList,
      totalMediaBytes
    };

    const projectBlocked = !quota.projectCheck.allowed;
    const storageBlocked = !quota.storageAllowed;
    const canConfirm = !projectBlocked && !storageBlocked;

    const moduleBadges = [
      { label: 'Conceptos APU', count: stats.conceptCount || 0, icon: 'fa-list-check', color: 'text-blue-400' },
      { label: 'Bitácora', count: stats.bitacoraNotesCount || 0, icon: 'fa-book', color: 'text-amber-400' },
      { label: 'Estimaciones', count: stats.estimacionesCount || 0, icon: 'fa-file-invoice-dollar', color: 'text-emerald-400' },
      { label: 'Compras/Gastos', count: stats.expensesCount || 0, icon: 'fa-receipt', color: 'text-purple-400' },
      { label: 'Almacén', count: stats.almacenMovesCount || 0, icon: 'fa-boxes-stacked', color: 'text-cyan-400' },
      { label: 'Mensajes Chat', count: stats.chatMessagesCount || 0, icon: 'fa-comments', color: 'text-pink-400' }
    ];

    const projMeta = manifest.project || {};
    previewEl.innerHTML = `
      <div class="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div>
            <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
              <i class="fa-solid fa-hard-hat"></i> ${escapeHtml(manifest.sourceAppLabel || 'Cubikar Construcción')}
            </span>
            <p class="text-[11px] text-slate-400 mt-1">Exportado el ${escapeHtml((manifest.exportedAt || '').slice(0, 16).replace('T', ' '))} • ${escapeHtml(projMeta.companyName || 'Sin empresa')} • ${escapeHtml(projMeta.projectLocation || 'Sin ubicación')}</p>
          </div>
          <div class="text-right">
            <div class="text-[11px] text-slate-400">Adjuntos binarios</div>
            <div class="text-sm font-bold text-white">${mediaList.length} archivo(s) <span class="text-xs font-normal text-slate-400">(${escapeHtml(formatBytes(totalMediaBytes))})</span></div>
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">Nombre del proyecto al importar</label>
          <input id="cubikar-import-project-name" type="text" value="${escapeHtml(projMeta.projectName || 'Proyecto Importado')}"
                 class="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-blue-500 focus:outline-none">
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          ${moduleBadges.map(b => `
            <div class="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
              <span class="flex items-center gap-1.5 text-slate-300"><i class="fa-solid ${b.icon} ${b.color}"></i> ${b.label}</span>
              <span class="font-bold text-white">${b.count}</span>
            </div>
          `).join('')}
        </div>

        <div class="p-3 rounded-xl bg-slate-900/90 border ${storageBlocked ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-800'} text-xs space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-slate-300 font-medium">Espacio en la nube (${escapeHtml(quota.planSpec.label)})</span>
            <span class="${storageBlocked ? 'text-rose-300 font-bold' : 'text-emerald-400 font-semibold'}">
              Disponible: ${escapeHtml(formatBytes(quota.remainingProjectBytes))}
            </span>
          </div>
          <p class="text-[11px] text-slate-400">
            Requerido por fotos/PDFs del paquete: <strong class="text-slate-200">${escapeHtml(formatBytes(totalMediaBytes))}</strong>
            ${maxSingleFileBytes > 0 ? ` • Archivo máximo: ${escapeHtml(formatBytes(maxSingleFileBytes))} (Límite plan: ${escapeHtml(formatBytes(quota.planSpec.maxFileBytes))})` : ''}
          </p>
        </div>

        ${projectBlocked ? `
          <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-3">
            <span><i class="fa-solid fa-lock mr-1.5 text-rose-400"></i>${escapeHtml(quota.projectCheck.reason)}</span>
            ${!quota.projectCheck.isHostContext ? `<button type="button" onclick="closeImportProjectZipModal(); openSubscriptionModal?.();" class="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-500/30 cursor-pointer">Mejorar Plan</button>` : ''}
          </div>
        ` : ''}

        ${storageBlocked ? `
          <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-3">
            <span><i class="fa-solid fa-hard-drive mr-1.5 text-rose-400"></i>${quota.exceedsSingleFileLimit ? 'Uno o más archivos superan el límite por archivo de tu plan actual.' : 'La cuota de almacenamiento AWS S3 disponible es insuficiente para importar todos los adjuntos.'}</span>
            <button type="button" onclick="closeImportProjectZipModal(); openSubscriptionModal?.();" class="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-semibold hover:bg-amber-500/30 cursor-pointer">Ver Planes</button>
          </div>
        ` : ''}

        <div class="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-200">
          <i class="fa-solid fa-shield-halved mr-1 text-blue-400"></i>
          Se generarán nuevos identificadores internos y la propiedad pasará a tu cuenta sin heredar colaboradores anteriores.
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button type="button" onclick="closeImportProjectZipModal()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer">
            Cancelar
          </button>
          <button id="cubikar-confirm-import-btn" type="button" ${canConfirm ? '' : 'disabled'}
                  onclick="executeConfirmedProjectZipImport()"
                  class="px-5 py-2 rounded-xl ${canConfirm ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25 cursor-pointer' : 'bg-slate-800 text-slate-500 cursor-not-allowed'} text-xs font-bold flex items-center gap-2 transition">
            <i class="fa-solid fa-file-import"></i>
            <span>Confirmar e Importar Proyecto</span>
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('[ProjectPackage] Error leyendo zip:', err);
    previewEl.innerHTML = `
      <div class="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-xs text-rose-200">
        <i class="fa-solid fa-circle-exclamation mr-1.5 text-rose-400"></i>
        No se pudo leer el paquete: ${escapeHtml(err?.message || 'Archivo .zip inválido o dañado.')}
      </div>
    `;
  }
}

function cloneTreeAssigningFreshIds(nodes, nodeIdMap) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(n => n && typeof n === 'object').map((node) => {
    const freshId = generateUUID();
    [node.id, node.uuid].forEach((oldId) => {
      if (oldId !== undefined && oldId !== null && String(oldId).trim()) {
        nodeIdMap.set(String(oldId).trim(), freshId);
      }
    });
    const copy = { ...node, id: freshId, uuid: freshId };
    if (Array.isArray(node.insumos)) {
      copy.insumos = node.insumos.map((ins) => {
        if (!ins || typeof ins !== 'object') return ins;
        const insId = generateUUID();
        return { ...ins, id: insId, uuid: insId };
      });
    }
    if (Array.isArray(node.children)) {
      copy.children = cloneTreeAssigningFreshIds(node.children, nodeIdMap);
    }
    return copy;
  });
}

function remapDictionaryKeys(dict, idMap) {
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return dict;
  const out = {};
  for (const [k, v] of Object.entries(dict)) {
    const mappedKey = idMap.get(String(k)) || k;
    out[mappedKey] = v;
  }
  return out;
}

const SKIP_UUID_REMAP_KEYS = new Set([
  'mediaId',
  's3Key',
  'archivoId',
  'bucket',
  'cloudUuid'
]);

/**
 * Remapea referencias de nodos, proveedores y diccionarios de conceptos en cualquier módulo.
 */
function remapStructuralIdsRecursive(obj, nodeIdMap, supplierIdMap = new Map(), parentKey = '') {
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (trimmed.length >= 8 && !SKIP_UUID_REMAP_KEYS.has(parentKey) && nodeIdMap.has(trimmed)) {
      return nodeIdMap.get(trimmed);
    }
    return obj;
  }
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => remapStructuralIdsRecursive(item, nodeIdMap, supplierIdMap, parentKey));
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NODE_REF_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      const mapped = nodeIdMap.get(String(v).trim());
      out[k] = mapped || v;
    } else if (SUPPLIER_REF_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number')) {
      const mappedSup = supplierIdMap.get(String(v).trim());
      out[k] = mappedSup || v;
    } else if ((k === 'conceptos' || k === 'conceptPhotos') && v && typeof v === 'object' && !Array.isArray(v)) {
      const remappedDict = remapDictionaryKeys(v, nodeIdMap);
      out[k] = remapStructuralIdsRecursive(remappedDict, nodeIdMap, supplierIdMap, k);
    } else {
      out[k] = remapStructuralIdsRecursive(v, nodeIdMap, supplierIdMap, k);
    }
  }
  return out;
}

function refreshModuleEntityIdsForNewProject(modules) {
  const expenseIdMap = new Map();
  const supplierIdMap = new Map();

  if (modules.expenses && typeof modules.expenses === 'object') {
    if (Array.isArray(modules.expenses.suppliers)) {
      modules.expenses.suppliers = modules.expenses.suppliers.map((sup) => {
        if (!sup || typeof sup !== 'object') return sup;
        const freshId = generateUUID();
        if (sup.id) supplierIdMap.set(String(sup.id), freshId);
        return { ...sup, id: freshId, cloudUuid: freshId };
      });
    }
    if (Array.isArray(modules.expenses.records)) {
      modules.expenses.records = modules.expenses.records.map((rec) => {
        if (!rec || typeof rec !== 'object') return rec;
        const freshId = generateUUID();
        if (rec.id) expenseIdMap.set(String(rec.id), freshId);
        const mappedSup = rec.supplierId ? (supplierIdMap.get(String(rec.supplierId)) || rec.supplierId) : rec.supplierId;
        return { ...rec, id: freshId, cloudUuid: freshId, supplierId: mappedSup };
      });
    }
  }

  if (modules.almacen && typeof modules.almacen === 'object') {
    const receptionIdMap = new Map();
    if (Array.isArray(modules.almacen.receptions)) {
      modules.almacen.receptions = modules.almacen.receptions.map((r) => {
        if (!r || typeof r !== 'object') return r;
        const freshId = generateUUID();
        if (r.id) receptionIdMap.set(String(r.id), freshId);
        const mappedExp = r.expenseId ? (expenseIdMap.get(String(r.expenseId)) || r.expenseId) : r.expenseId;
        const mappedSup = r.supplierId ? (supplierIdMap.get(String(r.supplierId)) || r.supplierId) : r.supplierId;
        return { ...r, id: freshId, cloudUuid: freshId, expenseId: mappedExp, supplierId: mappedSup };
      });
    }
    if (Array.isArray(modules.almacen.movements)) {
      modules.almacen.movements = modules.almacen.movements.map((m) => {
        if (!m || typeof m !== 'object') return m;
        const freshId = generateUUID();
        const mappedRec = m.receptionId ? (receptionIdMap.get(String(m.receptionId)) || m.receptionId) : m.receptionId;
        return { ...m, id: freshId, cloudUuid: freshId, receptionId: mappedRec };
      });
    }
  }

  if (modules.bitacora && Array.isArray(modules.bitacora.notes)) {
    modules.bitacora.notes = modules.bitacora.notes.map((n) => {
      if (!n || typeof n !== 'object') return n;
      const freshId = generateUUID();
      return { ...n, id: freshId, cloudUuid: freshId };
    });
  }

  if (modules.estimaciones && Array.isArray(modules.estimaciones.estimaciones)) {
    modules.estimaciones.estimaciones = modules.estimaciones.estimaciones.map((est) => {
      if (!est || typeof est !== 'object') return est;
      const next = { ...est };
      delete next.cloudUuid;
      next.cloudUuid = generateUUID();
      return next;
    });
  }

  if (Array.isArray(modules.chat)) {
    modules.chat = modules.chat.map((msg) => {
      if (!msg || typeof msg !== 'object') return msg;
      return { ...msg, id: generateUUID() };
    });
  }

  return { expenseIdMap, supplierIdMap };
}

function setValueAtPath(root, pathParts, newValue) {
  if (!root || !Array.isArray(pathParts) || pathParts.length === 0) return;
  let cur = root;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const key = pathParts[i];
    if (!cur || typeof cur !== 'object') return;
    cur = cur[key];
  }
  const lastKey = pathParts[pathParts.length - 1];
  if (cur && typeof cur === 'object') {
    cur[lastKey] = newValue;
  }
}

/**
 * Reemplaza todas las referencias antiguas de mediaId/s3Key/archivoId con los nuevos IDs subidos en la cuenta receptora.
 */
function rebindMediaReferencesRecursive(node, uploadedByOldRefKey) {
  if (typeof node === 'string') {
    const trimmed = node.trim();
    if (trimmed && uploadedByOldRefKey.has(trimmed)) {
      const matched = uploadedByOldRefKey.get(trimmed);
      return trimmed.includes('/') ? (matched.s3Key || matched.mediaId) : matched.mediaId;
    }
    return node;
  }
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) {
    return node.map(item => rebindMediaReferencesRecursive(item, uploadedByOldRefKey));
  }
  if (isMediaRefObject(node)) {
    const lookupKeys = [node.mediaId, node.s3Key, node.archivoId].filter(Boolean).map(v => String(v).trim());
    let match = null;
    for (const k of lookupKeys) {
      if (uploadedByOldRefKey.has(k)) {
        match = uploadedByOldRefKey.get(k);
        break;
      }
    }
    if (match) {
      const updated = {
        ...node,
        mediaId: match.mediaId,
        s3Key: match.s3Key || '',
        archivoId: match.archivoId || '',
        bucket: match.bucket || '',
        cloudSynced: Boolean(match.cloudSynced),
        pendingSync: !match.cloudSynced,
        fileName: match.fileName || node.fileName,
        mimeType: match.mimeType || node.mimeType,
        finalBytes: match.finalBytes || node.finalBytes
      };
      delete updated.localDataUrl;
      delete updated.dataUrl;
      return updated;
    }
    // Limpiar referencias muertas de la cuenta origen para evitar errores 403 cross-tenant
    const sanitized = { ...node, s3Key: '', archivoId: '', cloudSynced: false };
    return sanitized;
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = rebindMediaReferencesRecursive(v, uploadedByOldRefKey);
  }
  return out;
}

/**
 * Lógica nuclear reutilizable para importar un proyecto completo desde un objeto zip/manifest ya validado.
 */
async function importSingleZipPackageIntoAccount({
  zip,
  manifest,
  desiredName,
  targetScope = 'owned',
  finalProjectCheck,
  user,
  onProgress,
  skipUiRefresh = false
}) {
  const report = (sub, pct) => {
    if (typeof onProgress === 'function') onProgress(sub, pct);
  };

  const readZipJson = async (path, fallback) => {
    const f = zip.file(path);
    if (!f) return fallback;
    const text = await f.async('string');
    return safeJsonParse(text, fallback);
  };

  report('Preparando catálogo y estructura del proyecto...', 8);
  const origProject = (await readZipJson('project.json', manifest.project || {})) || {};
  const rawSettings = Object.assign({}, defaultSettings, (await readZipJson('settings.json', {})) || {});
  const rawTree = (await readZipJson('treeData.json', [])) || [];

  const rawModules = {
    estimaciones: await readZipJson('modules/estimaciones.json', null),
    expenses: await readZipJson('modules/expenses.json', null),
    almacen: await readZipJson('modules/almacen.json', null),
    calendarioCfg: await readZipJson('modules/calendarioCfg.json', null),
    calendarioWorkdays: await readZipJson('modules/calendarioWorkdays.json', null),
    bitacora: await readZipJson('modules/bitacora.json', null),
    chat: await readZipJson('modules/chat.json', null),
    tabLocks: await readZipJson('modules/tabLocks.json', null),
    signatures: await readZipJson('modules/signatures.json', null)
  };

  const newProjectId = generateUUID();
  const nodeIdMap = new Map();
  const freshTree = cloneTreeAssigningFreshIds(rawTree, nodeIdMap);
  const { supplierIdMap } = refreshModuleEntityIdsForNewProject(rawModules);

  const remappedSettings = remapStructuralIdsRecursive(deepClone(rawSettings), nodeIdMap, supplierIdMap);
  remappedSettings.projectName = desiredName;

  const remappedModules = {};
  for (const [k, val] of Object.entries(rawModules)) {
    remappedModules[k] = val ? remapStructuralIdsRecursive(deepClone(val), nodeIdMap, supplierIdMap) : null;
  }

  // Determinar propietario limpio en la cuenta receptora (sin heredar colaboradores previos)
  const uEmail = (user.email || '').toLowerCase().trim();
  const isHostContext = Boolean(finalProjectCheck.isHostContext && finalProjectCheck.hostEmail);
  const targetOwnerEmail = isHostContext ? finalProjectCheck.hostEmail.toLowerCase().trim() : uEmail;
  const targetOwnerName = isHostContext
    ? resolveCleanHostName(targetOwnerEmail, finalProjectCheck.hostName || '', null, uEmail)
    : resolveCleanHostName(uEmail, user.name || '', null, uEmail);
  const targetOwnerPlanId = isHostContext
    ? (finalProjectCheck.planId || getUserPlanId(targetOwnerEmail))
    : getUserPlanId(user);

  const freshMembers = [
    {
      id: 'mem-' + targetOwnerEmail,
      name: targetOwnerName || (isHostContext ? 'Propietario' : (user.name || 'Administrador')),
      email: targetOwnerEmail,
      avatar: (!isHostContext && user.avatar) ? user.avatar : AVATARS_BY_SEX['Masculino'],
      role: 'editar',
      status: 'active'
    }
  ];
  if (isHostContext && uEmail !== targetOwnerEmail) {
    freshMembers.push({
      id: 'mem-' + uEmail,
      name: user.name || 'Editor de Obra',
      email: uEmail,
      avatar: user.avatar || AVATARS_BY_SEX['Masculino'],
      role: 'editar',
      status: 'active'
    });
  }

  const newProjectEntry = {
    id: newProjectId,
    cloudId: newProjectId,
    isCloudSynced: false,
    companyName: remappedSettings.companyName || origProject.companyName || 'Constructora',
    companyLogo: remappedSettings.companyLogo || origProject.companyLogo || '',
    projectName: desiredName,
    projectLocation: remappedSettings.projectLocation || origProject.projectLocation || '',
    tipoObra: origProject.tipoObra || 'Edificación',
    currency: remappedSettings.currency || origProject.currency || 'MXN',
    currencySymbol: remappedSettings.currencySymbol || origProject.currencySymbol || '$',
    factorSobrecosto: calculateFactorFromSettingsObj(remappedSettings) || Number(origProject.factorSobrecosto) || 1,
    totalPresupuesto: calculateTreeTotal(freshTree),
    conceptCount: countTreeConcepts(freshTree),
    partidasCount: countTreePartidas(freshTree),
    ownerEmail: targetOwnerEmail,
    ownerName: targetOwnerName,
    ownerPlanId: targetOwnerPlanId,
    createdByEmail: uEmail,
    members: freshMembers,
    createdAt: origProject.createdAt || new Date().toISOString().slice(0, 10)
  };

  const existingList = getProjectsList();
  existingList.unshift(newProjectEntry);
  saveProjectsList(existingList, { skipCloudSync: true });

  const mediaList = Array.isArray(manifest.media) ? manifest.media : [];
  const extraArchiveFiles = Array.isArray(manifest.extraArchiveFiles) ? manifest.extraArchiveFiles : [];
  const inlineDataRefs = Array.isArray(manifest.inlineDataRefs) ? manifest.inlineDataRefs : [];
  const totalUploads = mediaList.length + extraArchiveFiles.length + inlineDataRefs.length;
  let uploadDone = 0;
  const uploadWarnings = [];
  const uploadedByOldRefKey = new Map();

  const uploadEntryFromZip = async (item) => {
    uploadDone += 1;
    const ratio = totalUploads > 0 ? uploadDone / totalUploads : 1;
    report(`Subiendo archivo (${uploadDone}/${totalUploads}): ${item.fileName}`, 18 + Math.round(ratio * 58));

    const zipEntry = zip.file(item.archivePath);
    if (!zipEntry) {
      uploadWarnings.push(`No se encontró "${item.archivePath}" dentro del .zip.`);
      return null;
    }

    const arrayBuf = await zipEntry.async('arraybuffer');
    const mimeType = inferMimeType(item.fileName, item.mimeType);
    const fileObj = new File([arrayBuf], item.fileName || 'archivo', {
      type: mimeType,
      lastModified: Date.now()
    });

    try {
      const res = await uploadManagedFile({
        file: fileObj,
        modulo: item.modulo || 'otros',
        categoria: item.categoria || (item.modulo === 'branding' ? 'branding' : 'project_files'),
        proyectoId: newProjectId,
        entidadId: String(nodeIdMap.get(String(item.entidadId || '')) || item.entidadId || ''),
        mimeType,
        skipCompression: true,
        showFeedback: false,
        metadata: item.metadata || {}
      });

      if (!res?.ok) {
        const blob = new Blob([arrayBuf], { type: mimeType });
        const fallbackCached = await putCachedMediaBlob({
          proyectoId: newProjectId,
          ownerEmail: targetOwnerEmail,
          modulo: item.modulo || 'otros',
          categoria: item.categoria || 'project_files',
          entidadId: item.entidadId || '',
          fileName: item.fileName || 'archivo',
          mimeType,
          originalBytes: blob.size,
          finalBytes: blob.size,
          sha256: item.sha256 || '',
          blob,
          metadata: item.metadata || {},
          status: 'pending_upload'
        });
        uploadWarnings.push(`"${item.fileName}": ${res?.reason || 'retenido localmente'}`);
        return {
          mediaId: fallbackCached.mediaId,
          s3Key: '',
          archivoId: '',
          bucket: '',
          cloudSynced: false,
          fileName: fallbackCached.fileName,
          mimeType,
          finalBytes: blob.size
        };
      }

      return res;
    } catch (err) {
      uploadWarnings.push(`Error subiendo "${item.fileName}": ${err?.message || err}`);
      return null;
    }
  };

  for (const item of mediaList) {
    const uploaded = await uploadEntryFromZip(item);
    if (!uploaded) continue;
    [item.refKey, item.originalMediaId, item.originalS3Key, item.originalArchivoId]
      .filter(Boolean)
      .forEach(k => uploadedByOldRefKey.set(String(k).trim(), uploaded));
  }

  for (const extra of extraArchiveFiles) {
    await uploadEntryFromZip(extra);
  }

  const finalSettings = rebindMediaReferencesRecursive(remappedSettings, uploadedByOldRefKey);
  const finalModules = {};
  for (const [k, val] of Object.entries(remappedModules)) {
    finalModules[k] = val ? rebindMediaReferencesRecursive(val, uploadedByOldRefKey) : null;
  }

  const restoreTargets = { project: newProjectEntry, settings: finalSettings, treeData: freshTree, modules: finalModules };
  for (const inlineRef of inlineDataRefs) {
    uploadDone += 1;
    report(`Restaurando recurso embebido: ${inlineRef.fileName}`, 18 + Math.round((uploadDone / Math.max(1, totalUploads)) * 58));
    const zipEntry = zip.file(inlineRef.archivePath);
    if (!zipEntry) continue;
    const rawBuf = await zipEntry.async('arraybuffer');
    const restoredMime = inferMimeType(inlineRef.archivePath, inlineRef.mimeType);
    const blob = new Blob([rawBuf], { type: restoredMime });
    const dataUrl = await blobToDataUrl(blob);
    setValueAtPath(restoreTargets, inlineRef.pathParts, dataUrl);
  }

  finalSettings.projectName = desiredName;
  newProjectEntry.companyLogo = finalSettings.companyLogo || newProjectEntry.companyLogo || '';

  report('Guardando tablas y configuración del proyecto...', 80);
  localStorage.setItem(getSettingsKey(newProjectId), JSON.stringify(finalSettings));
  localStorage.setItem(getStorageKey(newProjectId), JSON.stringify(freshTree));

  const moduleStorageMap = [
    ['estimaciones', `estimaciones_data_${newProjectId}`],
    ['expenses', `expenses_control_${newProjectId}`],
    ['almacen', `adm_const_almacen_${newProjectId}`],
    ['calendarioCfg', `calendario_cfg_${newProjectId}`],
    ['calendarioWorkdays', `calendario_workdays_${newProjectId}`],
    ['bitacora', `adm_const_bitacora_${newProjectId}`],
    ['chat', `adm_const_project_chat_${newProjectId}`],
    ['tabLocks', `adm_const_tab_locks_${newProjectId}`],
    ['signatures', `adm_const_signatures_${newProjectId}`]
  ];
  moduleStorageMap.forEach(([modKey, storageKey]) => {
    if (finalModules[modKey] !== null && finalModules[modKey] !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(finalModules[modKey]));
    }
  });

  const listNow = getProjectsList();
  const pIdx = listNow.findIndex(p => p.id === newProjectId);
  if (pIdx >= 0) {
    listNow[pIdx] = newProjectEntry;
    saveProjectsList(listNow, { skipCloudSync: true });
  }

  if (isSupabaseConfigured()) {
    report('Sincronizando catálogo y módulos con la nube Supabase...', 88);
    try {
      const cloudProjRes = await syncProjectToCloud(newProjectEntry, finalSettings, freshTree, { immediate: true });
      if (cloudProjRes?.success) {
        newProjectEntry.isCloudSynced = true;
        newProjectEntry.lastCloudSyncAt = new Date().toISOString();
        const refreshed = getProjectsList();
        const rIdx = refreshed.findIndex(p => p.id === newProjectId);
        if (rIdx >= 0) {
          refreshed[rIdx] = newProjectEntry;
          saveProjectsList(refreshed, { skipCloudSync: true });
        }

        await Promise.allSettled([
          finalModules.bitacora ? syncBitacoraNow(newProjectId) : Promise.resolve(),
          finalModules.expenses ? syncExpensesNow(newProjectId) : Promise.resolve(),
          finalModules.almacen ? syncAlmacenNow(newProjectId) : Promise.resolve(),
          finalModules.estimaciones ? syncEstimacionesNow(newProjectId) : Promise.resolve(),
          (finalModules.calendarioCfg || finalModules.calendarioWorkdays) ? syncCronogramaNow(newProjectId) : Promise.resolve(),
          Array.isArray(finalModules.chat) && finalModules.chat.length > 0 ? syncChatNow(newProjectId) : Promise.resolve()
        ]);
      }
      invalidateCloudProjectsCache();
    } catch (syncErr) {
      console.warn('[ProjectPackage] Error sincronizando proyecto importado a la nube:', syncErr?.message || syncErr);
    }
  }

  if (!skipUiRefresh) {
    report('Actualizando tablero de proyectos...', 98);
    notifyStorageUsageChanged({ projectId: newProjectId, cloudSynced: true });
    try { await refreshAllStorageMeters(); } catch (_) {}
    if (typeof window !== 'undefined' && typeof window.renderPortalDashboard === 'function') {
      window.renderPortalDashboard();
    }
  }

  return {
    projectEntry: newProjectEntry,
    mediaCount: totalUploads,
    uploadWarnings
  };
}

/**
 * Ejecuta la importación confirmada de un único paquete .zip.
 */
export async function executeConfirmedProjectZipImport() {
  if (packageOperationBusy) return;
  if (!currentImportState || !currentImportState.zip || !currentImportState.manifest) {
    showToast('Selecciona un archivo .zip válido primero.', 'warning');
    return;
  }

  const stateSnap = currentImportState;
  const user = getCurrentUser();
  if (!user || !user.email) {
    showToast('Debes iniciar sesión para importar.', 'warning');
    return;
  }

  const nameInput = document.getElementById('cubikar-import-project-name');
  const desiredName = (nameInput?.value || stateSnap.manifest.project?.projectName || 'Proyecto Importado').trim();
  const targetScope = stateSnap.targetScope || 'owned';

  const finalProjectCheck = canUserCreateProject(user, targetScope);
  if (!finalProjectCheck.allowed) {
    showToast(finalProjectCheck.reason || 'Límite de proyectos alcanzado.', 'warning');
    return;
  }

  packageOperationBusy = true;
  closeImportProjectZipModal();
  showPackageProgressOverlay({
    title: `Importando "${desiredName}"`,
    subtitle: 'Iniciando restauración...',
    pct: 5
  });

  try {
    const res = await importSingleZipPackageIntoAccount({
      zip: stateSnap.zip,
      manifest: stateSnap.manifest,
      desiredName,
      targetScope,
      finalProjectCheck,
      user,
      onProgress: (sub, pct) => updatePackageProgressOverlay(sub, pct)
    });

    if (res.uploadWarnings.length > 0) {
      showToast(
        `Proyecto "${desiredName}" importado con ${res.uploadWarnings.length} advertencia(s) al subir adjuntos.`,
        'warning',
        6500
      );
    } else {
      showToast(
        `¡Proyecto "${desiredName}" importado tal cual con ${res.mediaCount} archivo(s) adjuntos!`,
        'success',
        5500
      );
    }
  } catch (err) {
    console.error('[ProjectPackage] Error en importación:', err);
    showToast(`No se pudo completar la importación: ${err?.message || err}`, 'error', 6000);
  } finally {
    packageOperationBusy = false;
    currentImportState = null;
    closePackageProgressOverlay();
  }
}

/**
 * Ejecuta la importación secuencial de múltiples paquetes .zip seleccionados en el modal unificado.
 */
export async function executeConfirmedBatchZipImport() {
  if (packageOperationBusy) return;
  if (!currentImportState || currentImportState.mode !== 'batch') return;

  const user = getCurrentUser();
  if (!user || !user.email) {
    showToast('Debes iniciar sesión para importar.', 'warning');
    return;
  }

  const st = currentImportState;
  const selectedIndices = [];
  st.items.forEach((it, idx) => {
    if (it.valid && it.selected) selectedIndices.push(idx);
  });
  if (selectedIndices.length === 0) return;

  const initialCheck = canUserCreateProject(user, st.targetScope);
  if (!initialCheck.allowed || selectedIndices.length > computeRemainingSlots(initialCheck)) {
    showToast('Los proyectos seleccionados exceden el límite disponible de tu plan.', 'warning');
    return;
  }

  packageOperationBusy = true;
  st.importing = true;
  renderBatchImportPreview();

  let successCount = 0;
  let errorCount = 0;

  try {
    for (const idx of selectedIndices) {
      const item = st.items[idx];
      item.status = 'importing';
      const badgeEl = document.getElementById(`cubikar-batch-badge-${idx}`);
      if (badgeEl) badgeEl.innerHTML = getBatchRowStatusBadgeHtml(item);

      try {
        const freshCheck = canUserCreateProject(user, st.targetScope);
        if (!freshCheck.allowed) {
          throw new Error(freshCheck.reason || 'Límite de proyectos alcanzado.');
        }
        const desiredName = (item.desiredName || item.manifest?.project?.projectName || 'Proyecto Importado').trim();
        await importSingleZipPackageIntoAccount({
          zip: item.zip,
          manifest: item.manifest,
          desiredName,
          targetScope: st.targetScope,
          finalProjectCheck: freshCheck,
          user,
          skipUiRefresh: true
        });
        item.status = 'done';
        item.zip = null;
        successCount += 1;
      } catch (err) {
        console.error(`[ProjectPackage] Error importando "${item.desiredName}":`, err);
        item.status = 'error';
        item.error = err?.message || 'Error al importar';
        errorCount += 1;
      }

      const doneBadgeEl = document.getElementById(`cubikar-batch-badge-${idx}`);
      if (doneBadgeEl) doneBadgeEl.innerHTML = getBatchRowStatusBadgeHtml(item);
    }

    st.completed = true;
    notifyStorageUsageChanged({ cloudSynced: true });
    try { await refreshAllStorageMeters(); } catch (_) {}
    if (typeof window !== 'undefined' && typeof window.renderPortalDashboard === 'function') {
      window.renderPortalDashboard();
    }

    if (errorCount > 0) {
      showToast(`Lote finalizado: ${successCount} importado(s), ${errorCount} con error.`, 'warning', 6000);
    } else {
      showToast(`¡Se importaron ${successCount} proyecto(s) correctamente!`, 'success', 5500);
    }
  } finally {
    st.importing = false;
    packageOperationBusy = false;
    renderBatchImportPreview();
  }
}
