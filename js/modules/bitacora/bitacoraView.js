// js/modules/bitacora/bitacoraView.js
// Interfaz completa de Bitácora de Obra Digital y Legal (LOPSRM / BESOP)
// Incluye: KPIs de obra, Timeline cronológico con filtros, Redacción con conceptos y fotos,
// Canvas táctil de firma digital, Configuración S3 del Anfitrión y Lightbox de evidencias.

import { state } from '../../state/store.js';
import { showToast } from '../../ui/notifications.js';
import { guardTabUnlocked, isTabLocked, toggleTabLock } from '../../ui/tabLockController.js';
import { getCurrentUser, resolveWorkspacePlanContext } from '../portal/projectService.js';

function isLegalBitacoraAllowed() {
  const planId = resolveWorkspacePlanContext()?.planId || 'free';
  return planId === 'plus' || planId === 'pro';
}
import { renderTabAssignedAvatars } from '../portal/portalController.js';
import { formatDate } from '../calendario/calendarioModel.js';
import { mountStorageMeter } from '../../services/storageQuotaService.js';
import { deleteManagedFile, downloadManagedFileToDevice } from '../../services/s3StorageService.js';
import {
  BITACORA_NOTE_TYPES,
  BITACORA_WEATHER_OPTIONS,
  BITACORA_SIGNER_ROLES,
  getNoteTypeMeta,
  getWeatherMeta,
  getBitacoraConfig,
  updateBitacoraConfig,
  getBitacoraNotes,
  getBitacoraNoteById,
  getNextFolioNumber,
  formatFolioCode,
  saveBitacoraDraftNote,
  deleteBitacoraDraftNote,
  computeNoteIntegrityHash,
  sealAndSignBitacoraNote,
  getCatalogConceptsForBitacora,
  getBitacoraWorkSummary
} from './bitacoraModel.js';
import {
  getStorageConnectionSummary,
  uploadBitacoraEvidenceFile,
  uploadBitacoraOfficialPdf,
  openBitacoraPdfArtifact,
  resolveBitacoraPhotoUrl,
  syncPendingBitacoraArtifactsToCloud
} from './bitacoraDriveService.js';
import {
  generateNotePdfArtifact,
  downloadSingleNotePdf,
  generateAndDownloadFullBitacoraBook
} from './bitacoraPdfService.js';

// Estado de UI y filtros del Timeline
let searchFilter = '';
let typeFilter = 'all';
let statusFilter = 'all';
let dateFromFilter = '';
let dateToFilter = '';
let sortOrder = 'desc'; // 'desc' (más recientes) | 'asc' (orden correlativo #001)

// Estado del modal de descargas de bitácoras
let downloadsSearchFilter = '';
let downloadsStatusFilter = 'all'; // 'all' | 'sealed' | 'draft'
let downloadsTypeFilter = 'all';

// Estado temporal del modal de creación/edición de nota
let activeDraftId = null;
let tempSelectedConcepts = [];
let tempEvidences = [];
let tempFeDeErratasSource = null;
let conceptSearchQuery = '';

// Estado del modal de firma digital
let signingNoteId = null;
let signatureHasStroke = false;
let isDrawingSignature = false;
let lastSigPoint = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Hidrata de forma asíncrona imágenes cargadas en IndexedDB / AWS S3 dentro de un contenedor DOM.
 */
async function hydrateBitacoraMediaImages(rootEl) {
  if (!rootEl) return;
  const imgs = rootEl.querySelectorAll('img[data-media-id], img[data-s3-key]');
  for (const img of imgs) {
    const curSrc = img.getAttribute('src') || '';
    if (curSrc && !curSrc.startsWith('data:,')) continue;
    const mediaId = img.getAttribute('data-media-id') || '';
    const s3Key = img.getAttribute('data-s3-key') || '';
    if (!mediaId && !s3Key) continue;
    resolveBitacoraPhotoUrl({ mediaId, s3Key })
      .then((resolved) => {
        if (resolved && img.isConnected) {
          img.src = resolved;
        }
      })
      .catch(() => {});
  }
}

/**
 * Filtrar y ordenar notas según controles de barra superior
 */
function getFilteredBitacoraNotes() {
  const all = getBitacoraNotes();
  const q = searchFilter.trim().toLowerCase();

  const filtered = all.filter(n => {
    if (typeFilter !== 'all' && n.tipo !== typeFilter) return false;
    if (statusFilter !== 'all' && n.estado !== statusFilter) return false;
    if (dateFromFilter && (n.fecha || '') < dateFromFilter) return false;
    if (dateToFilter && (n.fecha || '') > dateToFilter) return false;

    if (q) {
      const conceptsText = (n.conceptosVinculados || []).map(c => `${c.clave} ${c.descripcion}`).join(' ');
      const haystack = [
        n.folioCode,
        n.tipo,
        n.ubicacion,
        n.descripcion,
        n.clima,
        n.firma?.autorNombre,
        n.creadoPor?.name,
        conceptsText
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return filtered.sort((a, b) => {
    // Borradores arriba cuando es desc, o por fecha/folio
    if (sortOrder === 'asc') {
      if (a.estado === 'sealed' && b.estado === 'sealed') {
        return (a.folioNumber || 0) - (b.folioNumber || 0);
      }
      if (a.estado === 'sealed' && b.estado !== 'sealed') return -1;
      if (a.estado !== 'sealed' && b.estado === 'sealed') return 1;
      return (a.creadoEn || '').localeCompare(b.creadoEn || '');
    } else {
      if (a.estado !== 'sealed' && b.estado === 'sealed') return -1;
      if (a.estado === 'sealed' && b.estado !== 'sealed') return 1;
      if (a.estado === 'sealed' && b.estado === 'sealed') {
        return (b.folioNumber || 0) - (a.folioNumber || 0);
      }
      return (b.actualizadoEn || b.creadoEn || '').localeCompare(a.actualizadoEn || a.creadoEn || '');
    }
  });
}

/**
 * Asegurar que exista el contenedor global de modales de Bitácora en document.body
 */
function ensureBitacoraModalsRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById('bitacora-modals-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'bitacora-modals-root';
    document.body.appendChild(root);
  }
  return root;
}

/**
 * Renderizado principal de la pestaña BITÁCORA DE OBRA
 */
export function renderBitacoraView() {
  const container = document.getElementById('view-bitacora');
  if (!container) return;

  const summary = getBitacoraWorkSummary();
  const storageInfo = getStorageConnectionSummary();
  const notes = getFilteredBitacoraNotes();
  const locked = isTabLocked('bitacora');

  container.innerHTML = `
    <div class="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden rounded-xl border border-slate-200/90 shadow-xs">
      
      <!-- 1. BARRA DE TÍTULO, COLABORADORES Y ESTADO S3 -->
      <div class="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-emerald-700 text-white flex items-center justify-center shadow-sm shrink-0">
            <i class="fa-solid fa-book-bookmark text-sm"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                Bitácora de Obra Digital y Legal
              </h2>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-50 text-teal-800 border border-teal-200 uppercase tracking-wide">
                LOPSRM / BESOP
              </span>
              ${locked ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300"><i class="fa-solid fa-lock text-[9px] mr-1"></i>Solo Lectura</span>' : ''}
            </div>
            <p class="text-[11px] text-slate-500 truncate">
              Obra: <strong class="text-slate-700">${escapeHtml(summary.projectName)}</strong>
              ${summary.projectLocation ? ` &bull; <i class="fa-solid fa-location-dot text-[10px] text-slate-400"></i> ${escapeHtml(summary.projectLocation)}` : ''}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <!-- Candado general de pestaña -->
          <button type="button" onclick="toggleTabLock('bitacora')" class="${locked ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'} border text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold shadow-2xs transition cursor-pointer" title="${locked ? 'Desbloquear creación de borradores' : 'Bloquear pestaña en modo consulta'}">
            <i class="fa-solid ${locked ? 'fa-lock' : 'fa-lock-open'} text-[10px]"></i>
          </button>

          <!-- Widget Miembros Asignados -->
          <div id="tab-members-bitacora" class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs shrink-0">
            <span class="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <i class="fa-solid fa-users text-teal-600 text-[10px]"></i> Asignados:
            </span>
            <div id="tab-avatars-bitacora" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('bitacora')" title="Ver colaboradores con acceso a Bitácora de Obra"></div>
            <button type="button" onclick="openTabMembersAssignModal('bitacora')" class="text-[10px] font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded px-1.5 py-0.5 transition flex items-center gap-1 cursor-pointer">
              <i class="fa-solid fa-user-gear text-[9px]"></i> Asignar
            </button>
          </div>
        </div>
      </div>

      <!-- 2. BARRA DE RESUMEN DE OBRA (KPIs) -->
      <div class="px-4 py-3 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-200 shrink-0">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          
          <!-- KPI 1: Días Transcurridos vs Programados -->
          <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <div class="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
              <span class="flex items-center gap-1.5">
                <i class="fa-solid fa-hourglass-half text-blue-600"></i> Estatus de Tiempo
              </span>
              <span class="font-mono text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                Inicio: ${escapeHtml(summary.startDate)}
              </span>
            </div>
            <div class="mt-1.5 flex items-baseline justify-between gap-2">
              <div class="text-lg font-extrabold text-slate-900 font-mono">
                ${summary.elapsedDays} <span class="text-xs font-semibold text-slate-500">días transcurridos</span>
              </div>
              ${summary.totalProgrammedDays
                ? `<span class="text-[11px] font-bold text-slate-600 font-mono">/ ${summary.totalProgrammedDays} prog.</span>`
                : `<button type="button" onclick="openBitacoraConfigModal()" class="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer">Definir fin</button>`}
            </div>
            ${summary.totalProgrammedDays ? `
              <div class="mt-2">
                <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-blue-500 to-teal-500 rounded-full" style="width: ${summary.elapsedPercent}%"></div>
                </div>
                <div class="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>Avance temporal: ${summary.elapsedPercent}%</span>
                  <span>Fin: ${escapeHtml(summary.endDate)}</span>
                </div>
              </div>
            ` : `<div class="text-[10px] text-slate-400 mt-1.5">Hoy: ${escapeHtml(summary.todayDate)}</div>`}
          </div>

          <!-- KPI 2: Clima de Hoy -->
          <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <div class="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
              <span class="flex items-center gap-1.5">
                <i class="fa-solid fa-cloud-sun text-amber-500"></i> Clima de Hoy (${escapeHtml(summary.todayDate)})
              </span>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <span class="text-xl">${getWeatherMeta(summary.climaHoy).emoji}</span>
              <select onchange="onBitacoraTodayWeatherChange(this.value)" class="flex-1 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-teal-500 cursor-pointer" title="Establecer clima predeterminado de hoy">
                ${BITACORA_WEATHER_OPTIONS.map(w => `
                  <option value="${w.id}" ${summary.climaHoy === w.id ? 'selected' : ''}>${w.emoji} ${w.label}</option>
                `).join('')}
              </select>
            </div>
            <p class="text-[10px] text-slate-400 mt-1.5">Se asignará automáticamente a nuevas notas de hoy</p>
          </div>

          <!-- KPI 3: Notas Asentadas -->
          <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <div class="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
              <span class="flex items-center gap-1.5">
                <i class="fa-solid fa-lock text-emerald-600"></i> Notas Asentadas (Legales)
              </span>
              <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-mono">
                Último: ${escapeHtml(summary.lastFolioCode)}
              </span>
            </div>
            <div class="mt-1.5 flex items-baseline justify-between">
              <div class="text-2xl font-extrabold text-emerald-700 font-mono">${summary.sealedCount}</div>
              <span class="text-[11px] text-slate-500 font-medium">Próximo folio: <strong class="font-mono text-slate-800">${escapeHtml(summary.nextFolioCode)}</strong></span>
            </div>
            <p class="text-[10px] text-slate-400 mt-1">Inmutables con PDF foliado y firma digital</p>
          </div>

          <!-- KPI 4: Borradores e Incidencias -->
          <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
            <div class="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
              <span class="flex items-center gap-1.5">
                <i class="fa-solid fa-clipboard-list text-indigo-600"></i> Pendientes e Incidencias
              </span>
              ${summary.pendingCloudSyncCount > 0 ? `
                <span class="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded" title="Artefactos retenidos localmente pendientes de respaldo en AWS S3">
                  ${summary.pendingCloudSyncCount} pendiente S3
                </span>
              ` : ''}
            </div>
            <div class="mt-1.5 grid grid-cols-2 gap-2">
              <div class="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <div class="text-[10px] text-slate-500 font-semibold">Borradores</div>
                <div class="text-base font-extrabold text-slate-800 font-mono">${summary.draftCount}</div>
              </div>
              <div class="bg-rose-50/70 border border-rose-200 rounded-lg px-2.5 py-1.5">
                <div class="text-[10px] text-rose-700 font-semibold">Incidencias / Clima</div>
                <div class="text-base font-extrabold text-rose-700 font-mono">${summary.incidentCount}</div>
              </div>
            </div>
          </div>

        </div>

        <!-- BOTONES PRINCIPALES DE ACCIÓN -->
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" onclick="openBitacoraNoteModal()" class="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white text-xs font-extrabold shadow-sm transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-plus"></i>
              <span>Nueva Nota</span>
            </button>

            <button type="button" onclick="openBitacoraDownloadsModal()" class="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white text-xs font-extrabold shadow-sm transition flex items-center gap-1.5 cursor-pointer" title="Ver notas cargadas y descargar individuales o libro completo">
              <i class="fa-solid fa-folder-arrow-down"></i>
              <span>Bitácoras</span>
            </button>

            <button type="button" onclick="downloadFullBitacoraBookAction()" class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer" title="${isLegalBitacoraAllowed() ? 'Compilar todas las notas asentadas en un libro oficial PDF' : 'Disponible desde Plan Plus'}">
              <i class="fa-solid fa-book-open text-amber-400"></i>
              <span>Descargar Libro Completo de Bitácora (PDF Compilado)</span>
              ${!isLegalBitacoraAllowed() ? '<i class="fa-solid fa-lock text-[10px] text-amber-400 ml-0.5"></i>' : ''}
            </button>

            ${summary.pendingCloudSyncCount > 0 ? `
              <button type="button" onclick="syncPendingBitacoraCloudAction()" class="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-cloud-arrow-up"></i>
                <span>Sincronizar ${summary.pendingCloudSyncCount} a AWS S3</span>
              </button>
            ` : ''}
          </div>

          <button type="button" onclick="openBitacoraConfigModal()" class="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-sliders text-slate-500"></i>
            <span>Configuración de Obra y Nube S3</span>
          </button>
        </div>
      </div>

      <!-- 3. BARRA DE BÚSQUEDA Y FILTROS DEL TIMELINE -->
      <div class="px-4 py-2 bg-slate-100/80 border-b border-slate-200 flex flex-wrap items-center gap-2 shrink-0">
        <div class="relative flex-1 min-w-[200px]">
          <i class="fa-solid fa-magnifying-glass text-slate-400 text-xs absolute left-3 top-1/2 -translate-y-1/2"></i>
          <input type="text" id="bitacora-search-input" value="${escapeHtml(searchFilter)}" oninput="onBitacoraSearchChange(this.value)" placeholder="Buscar por folio (#001), frente, concepto o texto..." class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-teal-500">
        </div>

        <select id="bitacora-filter-type" onchange="onBitacoraTypeFilterChange(this.value)" class="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-teal-500 cursor-pointer">
          <option value="all" ${typeFilter === 'all' ? 'selected' : ''}>Todos los tipos</option>
          ${BITACORA_NOTE_TYPES.map(t => `<option value="${t.id}" ${typeFilter === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>

        <select id="bitacora-filter-status" onchange="onBitacoraStatusFilterChange(this.value)" class="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-teal-500 cursor-pointer">
          <option value="all" ${statusFilter === 'all' ? 'selected' : ''}>Todos los estatus</option>
          <option value="sealed" ${statusFilter === 'sealed' ? 'selected' : ''}>🔒 Asentadas (Solo Lectura)</option>
          <option value="draft" ${statusFilter === 'draft' ? 'selected' : ''}>📝 Borradores</option>
        </select>

        <div class="flex items-center gap-1 text-xs">
          <input type="date" value="${escapeHtml(dateFromFilter)}" onchange="onBitacoraDateFromChange(this.value)" class="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700" title="Fecha desde">
          <span class="text-slate-400">-</span>
          <input type="date" value="${escapeHtml(dateToFilter)}" onchange="onBitacoraDateToChange(this.value)" class="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-700" title="Fecha hasta">
        </div>

        <button type="button" onclick="toggleBitacoraSortOrder()" class="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer" title="Cambiar orden cronológico">
          <i class="fa-solid ${sortOrder === 'desc' ? 'fa-arrow-down-wide-short' : 'fa-arrow-up-short-wide'} text-teal-600"></i>
          <span>${sortOrder === 'desc' ? 'Recientes primero' : 'Folio #001 -> N'}</span>
        </button>

        ${(searchFilter || typeFilter !== 'all' || statusFilter !== 'all' || dateFromFilter || dateToFilter) ? `
          <button type="button" onclick="clearBitacoraFilters()" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer">
            Limpiar
          </button>
        ` : ''}
      </div>

      <!-- Medidor unificado de cuota AWS S3 -->
      <div id="bitacora-storage-meter" class="px-4 pt-2 bg-slate-50 border-b border-slate-200 shrink-0 pb-2"></div>

      <!-- 4. LÍNEA DE TIEMPO (TIMELINE CRONOLÓGICO) -->
      <div id="bitacora-timeline-scroll" class="flex-1 overflow-y-auto custom-scroll p-4 sm:p-6">
        ${renderBitacoraTimelineHtml(notes)}
      </div>

    </div>
  `;

  if (typeof renderTabAssignedAvatars === 'function') {
    renderTabAssignedAvatars('bitacora');
  }

  mountStorageMeter('bitacora-storage-meter', { compact: true }).catch(() => {});
  hydrateBitacoraMediaImages(container).catch(() => {});

  if (summary.pendingCloudSyncCount > 0) {
    setTimeout(() => {
      syncPendingBitacoraArtifactsToCloud({ generatePdfFn: generateNotePdfArtifact, silent: true })
        .then(res => {
          if (res?.syncedCount > 0) {
            showToast(`☁️ Sincronizados ${res.syncedCount} artefacto(s) pendientes en AWS S3.`, 'success');
            renderBitacoraView();
          }
        })
        .catch(() => {});
    }, 350);
  }
}

/**
 * Renderizar tarjetas de notas en formato Línea de Tiempo (Timeline)
 */
function renderBitacoraTimelineHtml(notes) {
  if (!notes || notes.length === 0) {
    const hasAnyNotes = getBitacoraNotes().length > 0;
    return `
      <div class="max-w-2xl mx-auto my-8 bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center shadow-2xs">
        <div class="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-3 border border-teal-200">
          <i class="fa-solid ${hasAnyNotes ? 'fa-filter-circle-xmark' : 'fa-book-journal-whills'} text-2xl"></i>
        </div>
        <h3 class="text-base font-extrabold text-slate-800">
          ${hasAnyNotes ? 'Ninguna nota coincide con los filtros actuales' : 'Bitácora de Obra lista para Apertura'}
        </h3>
        <p class="text-xs text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">
          ${hasAnyNotes
            ? 'Ajusta la búsqueda, fechas o tipo de nota para visualizar los asientos registrados.'
            : 'Inicia registrando la <strong>Nota de Apertura</strong> de la obra. Cada nota asentada y firmada quedará protegida de forma inmutable con folio correlativo y respaldo PDF seguro en AWS S3.'}
        </p>
        <div class="mt-5 flex items-center justify-center gap-2">
          ${hasAnyNotes ? `
            <button type="button" onclick="clearBitacoraFilters()" class="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold cursor-pointer hover:bg-slate-700 transition">
              Mostrar Todas las Notas
            </button>
          ` : `
            <button type="button" onclick="openBitacoraNoteModal(null, { defaultTipo: 'Apertura' })" class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold shadow-sm transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-door-open"></i>
              <span>Redactar Nota de Apertura (#001)</span>
            </button>
          `}
        </div>
      </div>
    `;
  }

  return `
    <div class="max-w-5xl mx-auto relative pl-6 sm:pl-8 space-y-5 before:content-[''] before:absolute before:left-2.5 sm:before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-300">
      ${notes.map(note => renderTimelineNoteCard(note)).join('')}
    </div>
  `;
}

function renderTimelineNoteCard(note) {
  const isSealed = note.estado === 'sealed';
  const typeMeta = getNoteTypeMeta(note.tipo);
  const weatherMeta = getWeatherMeta(note.clima);
  const evidencias = Array.isArray(note.evidencias) ? note.evidencias : [];
  const conceptos = Array.isArray(note.conceptosVinculados) ? note.conceptosVinculados : [];

  const cardSurface = isSealed
    ? `bg-white border border-slate-200 border-l-4 ${typeMeta.accentBorder} shadow-xs`
    : 'bg-amber-50/35 border-2 border-dashed border-amber-400 shadow-xs';

  const statusBadge = isSealed
    ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
         <i class="fa-solid fa-lock text-[9px]"></i> ASENTADA (SOLO LECTURA)
       </span>`
    : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
         <i class="fa-solid fa-pen-to-square text-[9px]"></i> BORRADOR EDITABLE
       </span>`;

  const folioBadge = isSealed
    ? `<span class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-extrabold tracking-wide shadow-2xs">${escapeHtml(note.folioCode)}</span>`
    : `<span class="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-mono text-[11px] font-extrabold tracking-wide">BORRADOR</span>`;

  const cloudPdfLinkHtml = isSealed
    ? (note.pdfDoc?.s3Key
        ? `<button type="button" onclick="openBitacoraPdfAction('${note.id}')" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer">
             <i class="fa-solid fa-cloud-arrow-down"></i>
             <span>PDF en AWS S3</span>
           </button>`
        : `<span class="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold flex items-center gap-1.5" title="Guardado en caché local; se sincronizará con AWS S3 en cuanto haya conexión">
             <i class="fa-solid fa-clock text-[10px]"></i>
             <span>PDF en caché local</span>
           </span>`)
    : '';

  return `
    <article id="bitacora-card-${note.id}" class="relative transition-all duration-200">
      <!-- Nodo en el riel del Timeline -->
      <span class="absolute -left-6 sm:-left-8 top-4 w-5 h-5 rounded-full ${isSealed ? typeMeta.dotClass : 'bg-amber-400 ring-amber-100'} ring-4 border-2 border-white flex items-center justify-center shadow-xs z-10">
        <i class="fa-solid ${isSealed ? typeMeta.icon : 'fa-pencil'} text-[8px] text-white"></i>
      </span>

      <div class="rounded-2xl ${cardSurface} p-4 sm:p-5">
        <!-- Cabecera de tarjeta -->
        <div class="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-200/80">
          <div class="flex flex-wrap items-center gap-2">
            ${folioBadge}
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${typeMeta.badgeClass}">
              <i class="fa-solid ${typeMeta.icon} text-[10px]"></i>
              <span>${escapeHtml(note.tipo)}</span>
            </span>
            ${statusBadge}
            ${note.esFeDeErratas && note.notaReferenciaFolio ? `
              <button type="button" onclick="scrollToBitacoraNote('${escapeHtml(note.notaReferenciaId || '')}')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 cursor-pointer" title="Ir a la nota referenciada">
                <i class="fa-solid fa-link text-[9px]"></i>
                <span>Fe de Erratas de ${escapeHtml(note.notaReferenciaFolio)}</span>
              </button>
            ` : ''}
          </div>

          <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 font-medium">
            <span class="flex items-center gap-1 font-mono bg-slate-100 px-2 py-0.5 rounded">
              <i class="fa-regular fa-calendar text-slate-500"></i> ${escapeHtml(note.fecha)}
              <i class="fa-regular fa-clock text-slate-500 ml-1"></i> ${escapeHtml(note.hora)} hrs
            </span>
            <span class="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded" title="Condición climática">
              <span>${weatherMeta.emoji}</span>
              <span>${escapeHtml(weatherMeta.label)}</span>
            </span>
          </div>
        </div>

        <!-- Frente de trabajo y Conceptos vinculados -->
        <div class="mt-3 space-y-2">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <span class="font-bold text-slate-700 flex items-center gap-1">
              <i class="fa-solid fa-location-crosshairs text-teal-600 text-[11px]"></i>
              Frente / Ubicación:
            </span>
            <span class="text-slate-800 font-semibold">${escapeHtml(note.ubicacion || 'Frente general de obra')}</span>
          </div>

          ${conceptos.length > 0 ? `
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-bold text-slate-500 mr-1">
                <i class="fa-solid fa-link text-[10px] text-blue-600"></i> Conceptos vinculados:
              </span>
              ${conceptos.map(c => `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[10.5px] font-medium" title="${escapeHtml(c.descripcion)}">
                  <strong class="font-mono font-bold">${escapeHtml(c.clave)}</strong>
                  <span class="truncate max-w-[220px]">${escapeHtml(c.descripcion)}</span>
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Cuerpo Técnico -->
        <div class="mt-3 p-3.5 rounded-xl bg-slate-50/90 border border-slate-200/80 text-xs sm:text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap">${escapeHtml(note.descripcion || '')}</div>

        <!-- Galería de Evidencias Fotográficas -->
        ${evidencias.length > 0 ? `
          <div class="mt-3.5">
            <div class="text-[11px] font-bold text-slate-600 mb-2 flex items-center gap-1.5">
              <i class="fa-solid fa-camera text-teal-600"></i>
              <span>Evidencia Fotográfica (${evidencias.length})</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              ${evidencias.map((ev, idx) => `
                <div class="group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition flex flex-col">
                  <div class="relative aspect-[4/3] bg-slate-900 overflow-hidden cursor-pointer" onclick="openBitacoraPhotoLightbox('${note.id}', ${idx})">
                    <img src="${ev.localDataUrl || ''}" data-media-id="${escapeHtml(ev.mediaId || '')}" data-s3-key="${escapeHtml(ev.s3Key || '')}" alt="${escapeHtml(ev.caption || ev.fileName)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                    <div class="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition flex items-center justify-center">
                      <i class="fa-solid fa-magnifying-glass-plus text-white opacity-0 group-hover:opacity-100 transition text-lg drop-shadow"></i>
                    </div>
                    ${ev.s3Key ? `
                      <span class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-indigo-600/90 text-white text-[9px] font-bold" title="Respaldada en AWS S3 del Anfitrión">
                        <i class="fa-solid fa-cloud"></i>
                      </span>
                    ` : ''}
                  </div>
                  <div class="p-2 text-[10.5px] text-slate-700 leading-snug bg-white flex-1">
                    <span class="font-bold text-slate-900">Foto ${idx + 1}:</span> ${escapeHtml(ev.caption || ev.fileName || 'Evidencia de campo')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Bloque de Firma (solo si está asentada) -->
        ${isSealed && note.firma ? `
          <div class="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              ${note.firma.firmaDataUrl ? `
                <div class="w-28 h-12 bg-white border border-slate-300 rounded-lg p-1 flex items-center justify-center shrink-0">
                  <img src="${note.firma.firmaDataUrl}" alt="Firma digital" class="max-h-full max-w-full object-contain">
                </div>
              ` : ''}
              <div class="text-[11px]">
                <div class="font-extrabold text-slate-900">${escapeHtml(note.firma.autorNombre)}</div>
                <div class="font-semibold text-teal-700">${escapeHtml(note.firma.autorCargo)} ${note.firma.autorCedula ? `&bull; Céd./Reg: <span class="font-mono">${escapeHtml(note.firma.autorCedula)}</span>` : ''}</div>
                <div class="text-[10px] text-slate-500 font-mono mt-0.5">
                  Sellada el ${new Date(note.firma.firmadoEn).toLocaleString('es-MX')}
                  ${note.firma.selloHash ? ` &bull; Hash: ${escapeHtml(note.firma.selloHash.slice(0, 14))}...` : ''}
                </div>
              </div>
            </div>
            <div class="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
              <i class="fa-solid fa-shield-halved"></i>
              <span>Registro Legal Inviolable</span>
            </div>
          </div>
        ` : ''}

        <!-- Barra inferior de acciones de la nota -->
        <div class="mt-4 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
          <div class="text-[10.5px] text-slate-400">
            Redactada por <strong class="text-slate-600">${escapeHtml(note.creadoPor?.name || 'Usuario')}</strong>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            ${isSealed ? `
              ${cloudPdfLinkHtml}
              <button type="button" onclick="downloadSingleNotePdfAction('${note.id}')" class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-file-pdf text-rose-600"></i>
                <span>Descargar PDF</span>
              </button>
              <button type="button" onclick="createFeDeErratasAction('${note.id}')" class="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer" title="Crear nota subsecuente de aclaración o fe de erratas">
                <i class="fa-solid fa-file-pen"></i>
                <span>Aclaración / Fe de Erratas</span>
              </button>
            ` : `
              <button type="button" onclick="openBitacoraNoteModal('${note.id}')" class="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer">
                <i class="fa-solid fa-pen"></i>
                <span>Editar Borrador</span>
              </button>
              <button type="button" onclick="openSignBitacoraNoteModal('${note.id}')" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold shadow-xs transition flex items-center gap-1.5 cursor-pointer" title="${isLegalBitacoraAllowed() ? 'Asentar e inmutabilizar nota con firma digital y folio legal' : 'Disponible desde Plan Plus'}">
                <i class="fa-solid fa-signature"></i>
                <span>Asentar y Firmar Nota</span>
                ${!isLegalBitacoraAllowed() ? '<i class="fa-solid fa-lock text-[9px] text-amber-200"></i>' : ''}
              </button>
              <button type="button" onclick="deleteBitacoraDraftAction('${note.id}')" class="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer" title="Eliminar borrador">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            `}
          </div>
        </div>
      </div>
    </article>
  `;
}

// ============================================================================
// CONTROLES DE FILTRO Y CONFIGURACIÓN RÁPIDA DE CLIMA
// ============================================================================

export function onBitacoraTodayWeatherChange(clima) {
  updateBitacoraConfig({
    climaHoy: clima,
    climaFecha: formatDate(new Date())
  });
  showToast(`Clima de hoy actualizado: ${clima}`, 'info');
}

export function onBitacoraSearchChange(val) {
  searchFilter = val || '';
  const scroller = document.getElementById('bitacora-timeline-scroll');
  if (scroller) scroller.innerHTML = renderBitacoraTimelineHtml(getFilteredBitacoraNotes());
}

export function onBitacoraTypeFilterChange(val) {
  typeFilter = val || 'all';
  renderBitacoraView();
}

export function onBitacoraStatusFilterChange(val) {
  statusFilter = val || 'all';
  renderBitacoraView();
}

export function onBitacoraDateFromChange(val) {
  dateFromFilter = val || '';
  renderBitacoraView();
}

export function onBitacoraDateToChange(val) {
  dateToFilter = val || '';
  renderBitacoraView();
}

export function toggleBitacoraSortOrder() {
  sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
  renderBitacoraView();
}

export function clearBitacoraFilters() {
  searchFilter = '';
  typeFilter = 'all';
  statusFilter = 'all';
  dateFromFilter = '';
  dateToFilter = '';
  renderBitacoraView();
}

export function scrollToBitacoraNote(noteId) {
  if (!noteId) return;
  const el = document.getElementById(`bitacora-card-${noteId}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-teal-500', 'rounded-2xl');
    setTimeout(() => el.classList.remove('ring-2', 'ring-teal-500', 'rounded-2xl'), 2000);
  } else {
    clearBitacoraFilters();
    setTimeout(() => {
      const retryEl = document.getElementById(`bitacora-card-${noteId}`);
      if (retryEl) retryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }
}

// ============================================================================
// MODAL 1: CREAR / EDITAR NOTA EN BORRADOR
// ============================================================================

export function openBitacoraNoteModal(noteId = null, options = {}) {
  if (!guardTabUnlocked('bitacora')) return;

  const existing = noteId ? getBitacoraNoteById(noteId) : null;
  if (existing && existing.estado === 'sealed') {
    showToast('🔒 Esta nota ya fue asentada y es de solo lectura. Crea una nota de Fe de Erratas para aclarar.', 'warning');
    return;
  }

  activeDraftId = existing ? existing.id : null;
  tempSelectedConcepts = existing ? JSON.parse(JSON.stringify(existing.conceptosVinculados || [])) : [];
  tempEvidences = existing ? JSON.parse(JSON.stringify(existing.evidencias || [])) : [];
  tempFeDeErratasSource = options.feDeErratasFrom
    ? options.feDeErratasFrom
    : (existing?.esFeDeErratas ? { id: existing.notaReferenciaId, folioCode: existing.notaReferenciaFolio } : null);
  conceptSearchQuery = '';

  const cfg = getBitacoraConfig();
  const now = new Date();
  const defaultDate = existing?.fecha || formatDate(now);
  const defaultTime = existing?.hora || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultWeather = existing?.clima || cfg.climaHoy || 'Soleado';
  const defaultTipo = existing?.tipo || options.defaultTipo || 'Avance de Obra';
  const defaultUbicacion = existing?.ubicacion || '';
  const defaultDesc = existing?.descripcion || (tempFeDeErratasSource
    ? `En referencia y aclaración (Fe de Erratas) a la Nota ${tempFeDeErratasSource.folioCode}, se hace constar lo siguiente:\n\n`
    : '');

  const root = ensureBitacoraModalsRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-bitacora-note" style="z-index: 100050;" class="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" onclick="if(event.target===this) closeBitacoraModal()">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden animate-fade-in" onclick="event.stopPropagation()">
        
        <!-- Header Modal -->
        <div class="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <i class="fa-solid fa-pen-nib text-sm"></i>
            </div>
            <div>
              <h3 class="font-extrabold text-sm text-white">
                ${existing ? 'Editar Borrador de Bitácora' : (tempFeDeErratasSource ? `Nueva Nota de Aclaración / Fe de Erratas (${tempFeDeErratasSource.folioCode})` : 'Nueva Nota en Bitácora de Obra')}
              </h3>
              <p class="text-[11px] text-teal-200/80">
                Próximo folio oficial al firmar: <strong class="font-mono text-white">${formatFolioCode(getNextFolioNumber())}</strong> &bull; Estado actual: Borrador editable
              </p>
            </div>
          </div>
          <button type="button" onclick="closeBitacoraModal()" class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 sm:p-5 overflow-y-auto custom-scroll space-y-4 text-xs flex-1">
          
          ${tempFeDeErratasSource ? `
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-center gap-2.5">
              <i class="fa-solid fa-scale-balanced text-amber-600 text-base"></i>
              <div>
                <strong>Aclaración / Fe de Erratas:</strong> Esta nota quedará vinculada legalmente a la <strong>Nota ${escapeHtml(tempFeDeErratasSource.folioCode)}</strong> sin alterar el asiento original.
              </div>
            </div>
          ` : ''}

          <!-- Fila 1: Tipo, Fecha, Hora, Clima -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Tipo de Nota *</label>
              <select id="bitacora-form-tipo" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white">
                ${BITACORA_NOTE_TYPES.map(t => `<option value="${t.id}" ${defaultTipo === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Fecha *</label>
              <input type="date" id="bitacora-form-fecha" value="${escapeHtml(defaultDate)}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white">
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Hora Exacta *</label>
              <input type="time" id="bitacora-form-hora" value="${escapeHtml(defaultTime)}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white">
            </div>

            <div>
              <label class="block font-bold text-slate-700 mb-1">Condición Climática *</label>
              <select id="bitacora-form-clima" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white">
                ${BITACORA_WEATHER_OPTIONS.map(w => `<option value="${w.id}" ${defaultWeather === w.id ? 'selected' : ''}>${w.emoji} ${w.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Fila 2: Frente de trabajo -->
          <div>
            <label class="block font-bold text-slate-700 mb-1">Ubicación o Frente de Trabajo (Ejes, Nivel, Tramo) *</label>
            <input type="text" id="bitacora-form-ubicacion" value="${escapeHtml(defaultUbicacion)}" placeholder="Ej: Ejes A-D / Nivel Planta Baja / Frente de Cimentación Zapatas Z-1 a Z-4" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 font-semibold focus:outline-none focus:border-teal-500 focus:bg-white">
          </div>

          <!-- Fila 3: Cuerpo descriptivo técnico -->
          <div>
            <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label class="font-bold text-slate-700">Cuerpo Técnico Descriptivo de la Nota *</label>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[10px] text-slate-400 font-semibold">Plantillas rápidas:</span>
                <button type="button" onclick="insertBitacoraTemplate('avance')" class="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10px] font-bold cursor-pointer">+ Avance / Fuerza</button>
                <button type="button" onclick="insertBitacoraTemplate('supervision')" class="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold cursor-pointer">+ Instrucción Sup.</button>
                <button type="button" onclick="insertBitacoraTemplate('incidencia')" class="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold cursor-pointer">+ Incidencia / Clima</button>
              </div>
            </div>
            <textarea id="bitacora-form-descripcion" rows="6" placeholder="Redacta de forma clara, objetiva y técnica los hechos, instrucciones, volúmenes ejecutados, fuerza de trabajo, acuerdos o incidencias..." class="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs sm:text-[13px] text-slate-800 leading-relaxed focus:outline-none focus:border-teal-500 focus:bg-white resize-y">${escapeHtml(defaultDesc)}</textarea>
          </div>

          <!-- Fila 4: Selector de Conceptos del Catálogo de Presupuesto -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <label class="font-bold text-slate-700 flex items-center gap-1.5">
                <i class="fa-solid fa-diagram-project text-blue-600"></i>
                <span>Conceptos del Presupuesto Vinculados (Opcional)</span>
              </label>
              <span id="bitacora-concepts-count-badge" class="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                ${tempSelectedConcepts.length} seleccionado(s)
              </span>
            </div>

            <div id="bitacora-selected-concepts-pills" class="flex flex-wrap gap-1.5"></div>

            <div class="relative">
              <i class="fa-solid fa-magnifying-glass text-slate-400 text-[11px] absolute left-2.5 top-1/2 -translate-y-1/2"></i>
              <input type="text" id="bitacora-concept-search" oninput="onBitacoraConceptSearch(this.value)" placeholder="Buscar concepto en el Catálogo Base por clave o descripción..." class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500">
            </div>

            <div id="bitacora-concept-results" class="max-h-36 overflow-y-auto custom-scroll border border-slate-200 rounded-lg bg-white divide-y divide-slate-100"></div>
          </div>

          <!-- Fila 5: Galería de Evidencias Fotográficas -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label class="font-bold text-slate-700 flex items-center gap-1.5">
                  <i class="fa-solid fa-images text-teal-600"></i>
                  <span>Galería de Evidencias Fotográficas</span>
                </label>
                <p class="text-[10.5px] text-slate-500">Se optimizan automáticamente (máx. 1280px, 75%) y se respaldan en AWS S3 dentro de la cuota del Anfitrión.</p>
              </div>
              <label class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs">
                <i class="fa-solid fa-camera"></i>
                <span>Agregar Fotos</span>
                <input type="file" id="bitacora-photos-input" accept=".jpg,.jpeg,.png,.webp,image/*" multiple class="hidden" onchange="onBitacoraPhotosSelected(this)">
              </label>
            </div>

            <div id="bitacora-temp-evidences-grid" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5"></div>
          </div>

        </div>

        <!-- Footer -->
        <div class="bg-slate-100 px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button type="button" onclick="closeBitacoraModal()" class="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer">
            Cancelar
          </button>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" onclick="saveBitacoraNoteFormAction(false)" class="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-floppy-disk"></i>
              <span>Guardar Borrador</span>
            </button>
            <button type="button" onclick="saveBitacoraNoteFormAction(true)" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-signature"></i>
              <span>Continuar a Firmar y Asentar</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  renderSelectedConceptsPills();
  renderCatalogConceptsPicker();
  renderTempEvidencesGrid();
}

export function closeBitacoraModal() {
  const root = document.getElementById('bitacora-modals-root');
  if (root) root.innerHTML = '';
  signingNoteId = null;
}

export function insertBitacoraTemplate(tplType) {
  const textarea = document.getElementById('bitacora-form-descripcion');
  if (!textarea) return;
  const templates = {
    avance: '• Estado de fuerza en obra: [X] oficiales, [Y] ayudantes.\n• Trabajos ejecutados durante la jornada: \n• Cumplimiento de especificaciones y calidad de materiales: Conforme a proyecto.',
    supervision: '• Se realiza recorrido conjunto con Supervisión y Residencia de Obra.\n• Instrucción técnica emitida: \n• Plazo / fecha límite de atención: ',
    incidencia: '• Descripción de la incidencia / condición extraordinaria: \n• Impacto en ruta crítica o frente de trabajo: \n• Acciones preventivas / correctivas inmediatas: '
  };
  const snippet = templates[tplType] || '';
  if (!snippet) return;
  textarea.value = textarea.value ? `${textarea.value.trimEnd()}\n\n${snippet}` : snippet;
  textarea.focus();
}

export function onBitacoraConceptSearch(val) {
  conceptSearchQuery = (val || '').trim().toLowerCase();
  renderCatalogConceptsPicker();
}

function renderSelectedConceptsPills() {
  const container = document.getElementById('bitacora-selected-concepts-pills');
  const badge = document.getElementById('bitacora-concepts-count-badge');
  if (badge) badge.textContent = `${tempSelectedConcepts.length} seleccionado(s)`;
  if (!container) return;

  if (tempSelectedConcepts.length === 0) {
    container.innerHTML = `<span class="text-[11px] text-slate-400 italic">Ningún concepto vinculado todavía.</span>`;
    return;
  }

  container.innerHTML = tempSelectedConcepts.map(c => `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold shadow-2xs">
      <strong class="font-mono">${escapeHtml(c.clave)}</strong>
      <span class="truncate max-w-[200px]">${escapeHtml(c.descripcion)}</span>
      <button type="button" onclick="toggleBitacoraConceptLink('${escapeHtml(c.id)}')" class="hover:text-rose-200 cursor-pointer ml-0.5" title="Desvincular concepto">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </span>
  `).join('');
}

function renderCatalogConceptsPicker() {
  const container = document.getElementById('bitacora-concept-results');
  if (!container) return;

  const allConcepts = getCatalogConceptsForBitacora();
  if (allConcepts.length === 0) {
    container.innerHTML = `<div class="p-3 text-center text-slate-400 text-[11px]">El catálogo de presupuesto aún no tiene conceptos cargados.</div>`;
    return;
  }

  const filtered = allConcepts.filter(c => {
    if (!conceptSearchQuery) return true;
    return `${c.clave} ${c.descripcion} ${c.partidaPath}`.toLowerCase().includes(conceptSearchQuery);
  }).slice(0, 40);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="p-3 text-center text-slate-400 text-[11px]">No se encontraron conceptos con "${escapeHtml(conceptSearchQuery)}".</div>`;
    return;
  }

  container.innerHTML = filtered.map(c => {
    const isSelected = tempSelectedConcepts.some(sc => sc.id === c.id);
    return `
      <label class="flex items-center justify-between gap-2 p-2 hover:bg-blue-50/60 cursor-pointer transition">
        <div class="flex items-center gap-2 min-w-0">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleBitacoraConceptLink('${escapeHtml(c.id)}')" class="rounded text-blue-600 focus:ring-blue-500 cursor-pointer">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-mono font-bold text-[11px] text-blue-700">${escapeHtml(c.clave)}</span>
              <span class="text-[10px] text-slate-400 truncate">${escapeHtml(c.partidaPath)}</span>
            </div>
            <div class="text-[11px] text-slate-800 truncate">${escapeHtml(c.descripcion)}</div>
          </div>
        </div>
        <span class="text-[10px] font-mono font-bold text-slate-500 shrink-0">${escapeHtml(c.unidad)}</span>
      </label>
    `;
  }).join('');
}

export function toggleBitacoraConceptLink(conceptId) {
  const idx = tempSelectedConcepts.findIndex(c => c.id === conceptId);
  if (idx >= 0) {
    tempSelectedConcepts.splice(idx, 1);
  } else {
    const all = getCatalogConceptsForBitacora();
    const found = all.find(c => c.id === conceptId);
    if (found) {
      tempSelectedConcepts.push({
        id: found.id,
        clave: found.clave,
        descripcion: found.descripcion,
        unidad: found.unidad
      });
    }
  }
  renderSelectedConceptsPills();
  renderCatalogConceptsPicker();
}

export async function onBitacoraPhotosSelected(inputEl) {
  const files = Array.from(inputEl?.files || []);
  if (files.length === 0) return;

  for (const file of files) {
    try {
      const ev = await uploadBitacoraEvidenceFile(file, activeDraftId || '');
      ev.__isNewTempUpload = true;
      tempEvidences.push(ev);
    } catch (err) {
      showToast(`No se pudo procesar "${file.name}": ${err.message}`, 'error');
    }
  }

  if (inputEl) inputEl.value = '';
  renderTempEvidencesGrid();
}

export function updateTempEvidenceCaption(evId, captionVal) {
  const ev = tempEvidences.find(e => e.id === evId);
  if (ev) ev.caption = captionVal;
}

export function removeTempBitacoraEvidence(evId) {
  const target = tempEvidences.find(e => e.id === evId);
  if (target?.__isNewTempUpload) {
    deleteManagedFile(target).catch(() => {});
  }
  tempEvidences = tempEvidences.filter(e => e.id !== evId);
  renderTempEvidencesGrid();
}

function renderTempEvidencesGrid() {
  const grid = document.getElementById('bitacora-temp-evidences-grid');
  if (!grid) return;

  if (tempEvidences.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-center text-slate-400 text-xs cursor-pointer hover:bg-white transition" onclick="document.getElementById('bitacora-photos-input')?.click()">
        <i class="fa-solid fa-cloud-arrow-up text-lg mb-1 block text-slate-400"></i>
        Haz clic en "Agregar Fotos" para adjuntar evidencias fotográficas optimizadas (.jpg, .png, .webp)
      </div>
    `;
    return;
  }

  grid.innerHTML = tempEvidences.map((ev, idx) => `
    <div class="bg-white border border-slate-200 rounded-xl p-2 flex gap-2.5 items-start shadow-2xs">
      <img src="${ev.localDataUrl || ''}" data-media-id="${escapeHtml(ev.mediaId || '')}" data-s3-key="${escapeHtml(ev.s3Key || '')}" alt="${escapeHtml(ev.fileName)}" class="w-20 h-20 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100">
      <div class="flex-1 min-w-0 space-y-1.5">
        <div class="flex items-center justify-between gap-1">
          <span class="font-bold text-[11px] text-slate-800 truncate">Foto ${idx + 1}: ${escapeHtml(ev.fileName)}</span>
          <button type="button" onclick="removeTempBitacoraEvidence('${escapeHtml(ev.id)}')" class="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer" title="Quitar fotografía">
            <i class="fa-solid fa-trash-can text-[11px]"></i>
          </button>
        </div>
        ${ev.summaryText || ev.sizeLabel ? `
          <div class="text-[10px] text-slate-500 flex items-center gap-1.5">
            <span>${ev.cloudSynced ? '☁️ S3' : '💾 Local'}</span>
            <span>·</span>
            <span class="font-mono">${escapeHtml(ev.summaryText || ev.sizeLabel)}</span>
          </div>
        ` : ''}
        <input type="text" value="${escapeHtml(ev.caption || '')}" oninput="updateTempEvidenceCaption('${escapeHtml(ev.id)}', this.value)" placeholder="Pie de foto explicativo (ej: Armado de trabe T-2 previo a colado)" class="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-[11px] text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white">
      </div>
    </div>
  `).join('');

  hydrateBitacoraMediaImages(grid).catch(() => {});
}

export function saveBitacoraNoteFormAction(proceedToSign = false) {
  if (!guardTabUnlocked('bitacora')) return;

  const tipo = document.getElementById('bitacora-form-tipo')?.value || 'Avance de Obra';
  const fecha = document.getElementById('bitacora-form-fecha')?.value || formatDate(new Date());
  const hora = document.getElementById('bitacora-form-hora')?.value || '09:00';
  const clima = document.getElementById('bitacora-form-clima')?.value || 'Soleado';
  const ubicacion = document.getElementById('bitacora-form-ubicacion')?.value.trim() || '';
  const descripcion = document.getElementById('bitacora-form-descripcion')?.value.trim() || '';

  if (!ubicacion) {
    showToast('Indica la ubicación o frente de trabajo (ejes, nivel o tramo).', 'warning');
    document.getElementById('bitacora-form-ubicacion')?.focus();
    return;
  }
  if (!descripcion) {
    showToast('Redacta la descripción técnica de la nota antes de guardar.', 'warning');
    document.getElementById('bitacora-form-descripcion')?.focus();
    return;
  }

  try {
    const saved = saveBitacoraDraftNote({
      id: activeDraftId,
      tipo,
      fecha,
      hora,
      clima,
      ubicacion,
      conceptosVinculados: tempSelectedConcepts,
      descripcion,
      evidencias: tempEvidences,
      notaReferenciaId: tempFeDeErratasSource?.id || null,
      notaReferenciaFolio: tempFeDeErratasSource?.folioCode || '',
      esFeDeErratas: Boolean(tempFeDeErratasSource)
    });

    if (proceedToSign) {
      openSignBitacoraNoteModal(saved.id);
    } else {
      showToast('Borrador guardado correctamente en la Bitácora.', 'success');
      closeBitacoraModal();
      renderBitacoraView();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export function deleteBitacoraDraftAction(noteId) {
  if (!guardTabUnlocked('bitacora')) return;
  const note = getBitacoraNoteById(noteId);
  if (!note) return;
  if (note.estado === 'sealed') {
    showToast('🔒 Esta nota está asentada y firmada; por disposición legal no puede eliminarse.', 'error');
    return;
  }
  if (!confirm('¿Deseas eliminar este borrador de nota de bitácora? Esta acción solo aplica para borradores no firmados.')) {
    return;
  }
  try {
    deleteBitacoraDraftNote(noteId);
    showToast('Borrador eliminado.', 'info');
    renderBitacoraView();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export function createFeDeErratasAction(sourceNoteId) {
  if (!guardTabUnlocked('bitacora')) return;
  const sourceNote = getBitacoraNoteById(sourceNoteId);
  if (!sourceNote || sourceNote.estado !== 'sealed') {
    showToast('Solo es posible crear Aclaración / Fe de Erratas sobre notas previamente asentadas.', 'warning');
    return;
  }
  openBitacoraNoteModal(null, {
    defaultTipo: sourceNote.tipo,
    feDeErratasFrom: {
      id: sourceNote.id,
      folioCode: sourceNote.folioCode
    }
  });
}

// ============================================================================
// MODAL 2: FIRMA DIGITAL Y ASENTAMIENTO INMUTABLE (REGLA LEGAL)
// ============================================================================

export function openSignBitacoraNoteModal(noteId) {
  if (!guardTabUnlocked('bitacora')) return;
  if (!isLegalBitacoraAllowed()) {
    showToast('🔒 La Firma Digital Legal e Inmutabilidad LOPSRM/BESOP está disponible desde el Plan Plus. Tu Plan Gratuita te permite registrar notas básicas de bitácora.', 'warning');
    if (typeof window !== 'undefined') window.openSubscriptionModal?.();
    return;
  }
  const note = getBitacoraNoteById(noteId);
  if (!note) return;
  if (note.estado === 'sealed') {
    showToast('🔒 Esta nota ya fue asentada y firmada.', 'warning');
    return;
  }

  signingNoteId = note.id;
  signatureHasStroke = false;

  const cfg = getBitacoraConfig();
  const user = getCurrentUser();
  const storageInfo = getStorageConnectionSummary();
  const nextFolio = formatFolioCode(getNextFolioNumber());

  const defaultName = cfg.residenteDefault || user?.name || '';
  const defaultCargo = cfg.residenteCargoDefault || 'Residente de Obra';
  const defaultCedula = cfg.residenteCedulaDefault || '';

  const root = ensureBitacoraModalsRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-bitacora-sign" style="z-index: 100060;" class="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden animate-fade-in">
        
        <!-- Header -->
        <div class="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <i class="fa-solid fa-file-shield text-sm"></i>
            </div>
            <div>
              <h3 class="font-extrabold text-sm text-white">Asentar y Firmar Nota de Bitácora</h3>
              <p class="text-[11px] text-emerald-200/80">Se asignará el folio oficial definitivo: <strong class="font-mono text-white">${escapeHtml(nextFolio)}</strong></p>
            </div>
          </div>
          <button type="button" onclick="closeBitacoraModal()" class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 sm:p-5 overflow-y-auto custom-scroll space-y-4 text-xs flex-1">
          
          <!-- Advertencia Legal Estricta -->
          <div class="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 flex items-start gap-3">
            <i class="fa-solid fa-triangle-exclamation text-rose-600 text-lg mt-0.5 shrink-0"></i>
            <div class="space-y-1">
              <div class="font-extrabold text-xs uppercase tracking-wide text-rose-800">Advertencia Legal de Inviolabilidad (LOPSRM / BESOP)</div>
              <p class="text-[11.5px] leading-relaxed">
                Una vez asentada y firmada, esta nota quedará <strong>permanentemente bloqueada (🔒 Solo Lectura)</strong>, <strong>NO podrá editarse ni eliminarse</strong>, y se compilará automáticamente en un documento PDF foliado. Si posteriormente requieres corregir algún dato, deberás crear una nueva nota subsecuente de <em>Aclaración / Fe de Erratas</em>.
              </p>
            </div>
          </div>

          <!-- Resumen de la nota -->
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-bold text-slate-800">${escapeHtml(note.tipo)} &bull; ${escapeHtml(note.fecha)} ${escapeHtml(note.hora)} hrs</span>
              <span class="font-mono text-[11px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-bold">${(note.evidencias || []).length} foto(s) adjunta(s)</span>
            </div>
            <div class="text-[11px] text-slate-600"><strong>Frente:</strong> ${escapeHtml(note.ubicacion)}</div>
            <div class="text-[11px] text-slate-600 line-clamp-2">${escapeHtml(note.descripcion)}</div>
          </div>

          <!-- Datos del Firmante -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Nombre del Firmante *</label>
              <input type="text" id="bitacora-sign-name" value="${escapeHtml(defaultName)}" placeholder="Ing. Juan Pérez" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Cargo en Obra *</label>
              <select id="bitacora-sign-cargo" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white">
                ${BITACORA_SIGNER_ROLES.map(r => `<option value="${r}" ${defaultCargo === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Cédula Prof. / Registro</label>
              <input type="text" id="bitacora-sign-cedula" value="${escapeHtml(defaultCedula)}" placeholder="Ej: 8451290" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white">
            </div>
          </div>

          <!-- Canvas de Firma Digital -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="font-bold text-slate-700 flex items-center gap-1.5">
                <i class="fa-solid fa-pen-fancy text-emerald-600"></i>
                <span>Firma Autógrafa Digital (Traza con ratón o dedo) *</span>
              </label>
              <button type="button" onclick="clearBitacoraSignatureCanvas()" class="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition cursor-pointer flex items-center gap-1">
                <i class="fa-solid fa-eraser"></i> Limpiar Firma
              </button>
            </div>
            <div class="relative bg-white border-2 border-slate-300 rounded-xl overflow-hidden shadow-inner" style="background-color: #ffffff !important;">
              <canvas id="bitacora-signature-canvas" class="w-full h-40 block cursor-crosshair" style="touch-action: none; background-color: #ffffff;"></canvas>
              <div class="pointer-events-none absolute bottom-2 left-4 right-4 border-b border-dashed border-slate-300 text-[10px] text-slate-400 text-center pb-0.5">
                Firma sobre esta línea
              </div>
            </div>
          </div>

          <!-- Info de destino AWS S3 del Anfitrión -->
          <div class="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] flex items-center gap-2">
            <i class="fa-solid fa-cloud-arrow-up text-sm shrink-0 text-indigo-600"></i>
            <div>
              Al confirmar, el PDF inmutable y las fotografías optimizadas se respaldarán automáticamente en <strong>AWS S3</strong> dentro de la cuota de <strong>${escapeHtml(storageInfo.hostEmail || 'tu cuenta')}</strong> (${escapeHtml(storageInfo.planLabel)}).
            </div>
          </div>

          <!-- Checkbox confirmación obligatoria -->
          <label class="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-300 cursor-pointer select-none">
            <input type="checkbox" id="bitacora-sign-confirm-check" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer">
            <span class="text-[11.5px] font-semibold text-slate-700 leading-snug">
              Confirmo bajo mi responsabilidad técnica que el contenido de esta nota es verídico y acepto que quedará <strong>bloqueada de manera permanente (Solo Lectura)</strong> al ser asentada.
            </span>
          </label>

          <!-- Indicador de progreso al firmar -->
          <div id="bitacora-sign-progress" class="hidden p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-2">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span id="bitacora-sign-progress-text">Generando PDF oficial foliado...</span>
          </div>

        </div>

        <!-- Footer -->
        <div class="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button type="button" onclick="openBitacoraNoteModal('${note.id}')" class="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer">
            &larr; Volver a Editar Borrador
          </button>
          <button type="button" id="btn-confirm-seal-bitacora" onclick="confirmAndSealBitacoraNoteAction()" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition flex items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-lock"></i>
            <span>Asentar y Firmar Nota</span>
          </button>
        </div>

      </div>
    </div>
  `;

  setTimeout(initSignatureCanvas, 30);
}

function initSignatureCanvas() {
  const canvas = document.getElementById('bitacora-signature-canvas');
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(300, Math.round(rect.width * dpr));
  canvas.height = Math.max(140, Math.round(rect.height * dpr));

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0f172a';

  const getPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - r.left,
      y: clientY - r.top
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    isDrawingSignature = true;
    try {
      if (canvas.setPointerCapture && e.pointerId !== undefined) {
        canvas.setPointerCapture(e.pointerId);
      }
    } catch (_) {}
    lastSigPoint = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastSigPoint.x, lastSigPoint.y);
  };

  const moveDraw = (e) => {
    if (!isDrawingSignature) return;
    e.preventDefault();
    const pt = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastSigPoint.x, lastSigPoint.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastSigPoint = pt;
    signatureHasStroke = true;
  };

  const endDraw = (e) => {
    if (!isDrawingSignature) return;
    isDrawingSignature = false;
    lastSigPoint = null;
    try {
      if (canvas.releasePointerCapture && e?.pointerId !== undefined) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
  };

  canvas.addEventListener('pointerdown', startDraw);
  canvas.addEventListener('pointermove', moveDraw);
  canvas.addEventListener('pointerup', endDraw);
  canvas.addEventListener('pointercancel', endDraw);
}

export function clearBitacoraSignatureCanvas() {
  const canvas = document.getElementById('bitacora-signature-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signatureHasStroke = false;
}

export async function confirmAndSealBitacoraNoteAction() {
  if (!isLegalBitacoraAllowed()) {
    showToast('🔒 La Firma Digital Legal está disponible desde el Plan Plus.', 'warning');
    if (typeof window !== 'undefined') window.openSubscriptionModal?.();
    return;
  }
  const note = getBitacoraNoteById(signingNoteId);
  if (!note || note.estado === 'sealed') return;

  const autorNombre = document.getElementById('bitacora-sign-name')?.value.trim();
  const autorCargo = document.getElementById('bitacora-sign-cargo')?.value || 'Residente de Obra';
  const autorCedula = document.getElementById('bitacora-sign-cedula')?.value.trim() || '';
  const confirmChecked = document.getElementById('bitacora-sign-confirm-check')?.checked;

  if (!autorNombre) {
    showToast('Ingresa el nombre completo del responsable que firma la nota.', 'warning');
    document.getElementById('bitacora-sign-name')?.focus();
    return;
  }
  if (!signatureHasStroke) {
    showToast('Debes trazar tu firma digital en el recuadro antes de asentar la nota.', 'warning');
    return;
  }
  if (!confirmChecked) {
    showToast('Marca la casilla de confirmación legal de inviolabilidad.', 'warning');
    return;
  }

  const canvas = document.getElementById('bitacora-signature-canvas');
  const firmaDataUrl = canvas ? canvas.toDataURL('image/png') : '';

  const btn = document.getElementById('btn-confirm-seal-bitacora');
  const progressEl = document.getElementById('bitacora-sign-progress');
  const progressText = document.getElementById('bitacora-sign-progress-text');

  if (btn) btn.disabled = true;
  if (progressEl) progressEl.classList.remove('hidden');

  try {
    const nextFolioNum = getNextFolioNumber();
    const nextFolioCode = formatFolioCode(nextFolioNum);
    const firmadoEn = new Date().toISOString();

    const provisionalFirma = {
      autorNombre,
      autorCargo,
      autorCedula,
      firmaDataUrl,
      firmadoEn,
      selloHash: ''
    };

    const noteForHash = Object.assign({}, note, {
      folioNumber: nextFolioNum,
      folioCode: nextFolioCode,
      estado: 'sealed',
      firma: provisionalFirma
    });

    provisionalFirma.selloHash = await computeNoteIntegrityHash(noteForHash);
    noteForHash.firma = provisionalFirma;

    // 1. Verificar sincronización pendiente de fotografías en AWS S3
    if (progressText) progressText.textContent = '1/3 Verificando evidencias fotográficas en caché y AWS S3...';
    await syncPendingBitacoraArtifactsToCloud({ generatePdfFn: null, silent: true }).catch(() => {});

    const updatedEvidences = (note.evidencias || []).map(ev => Object.assign({}, ev, {
      pendingSync: !ev.s3Key
    }));

    // 2. Generar PDF Inmutable con fotos + firma
    if (progressText) progressText.textContent = '2/3 Compilando documento PDF oficial foliado...';
    const pdfArtifact = await generateNotePdfArtifact(noteForHash);

    // 3. Respaldar PDF oficial en AWS S3 + IndexedDB
    if (progressText) progressText.textContent = '3/3 Respaldando PDF oficial en AWS S3 del Anfitrión...';
    const pdfUploadRes = await uploadBitacoraOfficialPdf(pdfArtifact.blob, pdfArtifact.fileName, noteForHash);

    const pdfDocRecord = {
      fileName: pdfArtifact.fileName,
      mediaId: pdfUploadRes.mediaId || '',
      archivoId: pdfUploadRes.archivoId || '',
      s3Key: pdfUploadRes.s3Key || '',
      cloudSynced: Boolean(pdfUploadRes.uploaded),
      generatedAt: firmadoEn,
      pendingSync: !pdfUploadRes.uploaded
    };

    // 4. Sellar y bloquear nota permanentemente en el modelo
    sealAndSignBitacoraNote(note.id, {
      firma: provisionalFirma,
      pdfDoc: pdfDocRecord,
      evidenciasActualizadas: updatedEvidences
    });

    closeBitacoraModal();
    renderBitacoraView();

    if (pdfUploadRes.uploaded) {
      showToast(`🔒 Nota ${nextFolioCode} asentada, firmada y respaldada en AWS S3.`, 'success');
    } else {
      showToast(`🔒 Nota ${nextFolioCode} asentada y firmada. PDF guardado en caché local (pendiente sincronización S3).`, 'info');
    }
  } catch (err) {
    console.error('[Bitacora] Error al firmar y asentar nota:', err);
    showToast(`Error al asentar nota: ${err.message}`, 'error');
    if (btn) btn.disabled = false;
    if (progressEl) progressEl.classList.add('hidden');
  }
}

// ============================================================================
// ACCIONES PDF Y ALMACENAMIENTO S3 DESDE TARJETAS / BOTONES PRINCIPALES
// ============================================================================

export async function downloadSingleNotePdfAction(noteId) {
  const note = getBitacoraNoteById(noteId);
  if (!note) return;
  try {
    showToast(`Preparando PDF de Nota ${note.folioCode}...`, 'info');
    await downloadSingleNotePdf(note);
  } catch (err) {
    showToast(`Error generando PDF: ${err.message}`, 'error');
  }
}

export async function openBitacoraPdfAction(noteId) {
  const note = getBitacoraNoteById(noteId);
  if (!note) return;
  try {
    const opened = await openBitacoraPdfArtifact(note.pdfDoc, note);
    if (!opened) {
      await downloadSingleNotePdf(note);
    }
  } catch (err) {
    showToast(`No se pudo abrir PDF: ${err.message}`, 'error');
  }
}

export async function downloadFullBitacoraBookAction() {
  if (!isLegalBitacoraAllowed()) {
    showToast('🔒 La compilación del Libro Completo de Bitácora PDF foliado está disponible desde el Plan Plus.', 'warning');
    if (typeof window !== 'undefined') window.openSubscriptionModal?.();
    return;
  }
  const notes = getBitacoraNotes();
  const sealedCount = notes.filter(n => n.estado === 'sealed').length;
  if (sealedCount === 0) {
    showToast('Debe haber al menos 1 nota asentada y firmada para generar el Libro Completo.', 'warning');
    return;
  }
  try {
    showToast(`Compilando Libro Completo de Bitácora (${sealedCount} notas)...`, 'info');
    const res = await generateAndDownloadFullBitacoraBook(notes);
    showToast(`📘 Libro "${res.fileName}" descargado con ${res.notesCount} nota(s) oficiales.`, 'success');
  } catch (err) {
    showToast(`Error compilando libro PDF: ${err.message}`, 'error');
  }
}

export async function syncPendingBitacoraCloudAction() {
  try {
    showToast('Sincronizando notas y fotografías pendientes con AWS S3...', 'info');
    const res = await syncPendingBitacoraArtifactsToCloud({
      generatePdfFn: generateNotePdfArtifact,
      silent: false
    });
    if (res?.syncedCount > 0) {
      renderBitacoraView();
    }
  } catch (err) {
    showToast(`Error al sincronizar: ${err.message}`, 'error');
  }
}

// ============================================================================
// MODAL 3: CONFIGURACIÓN DE OBRA Y ALMACENAMIENTO AWS S3 DEL ANFITRIÓN
// ============================================================================

export function openBitacoraConfigModal() {
  const cfg = getBitacoraConfig();
  const summary = getBitacoraWorkSummary();
  const storageInfo = getStorageConnectionSummary();

  const root = ensureBitacoraModalsRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-bitacora-config" style="z-index: 100050;" class="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" onclick="if(event.target===this) closeBitacoraModal()">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-fade-in" onclick="event.stopPropagation()">
        
        <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <i class="fa-solid fa-sliders text-sm"></i>
            </div>
            <div>
              <h3 class="font-extrabold text-sm text-white">Configuración de Bitácora y Nube AWS S3</h3>
              <p class="text-[11px] text-slate-300">Datos contractuales de carátula y cuota unificada del Anfitrión</p>
            </div>
          </div>
          <button type="button" onclick="closeBitacoraModal()" class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <div class="p-5 overflow-y-auto custom-scroll space-y-5 text-xs flex-1">
          
          <!-- Sección 1: Datos Contractuales -->
          <div class="space-y-3">
            <h4 class="font-extrabold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1.5">
              1. Datos Contractuales y Fechas de Obra
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-bold text-slate-700 mb-1">Fecha de Inicio de Obra</label>
                <input type="date" id="bitacora-cfg-inicio" value="${escapeHtml(cfg.obraInicio || summary.startDate || '')}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Fecha Programada de Término</label>
                <input type="date" id="bitacora-cfg-fin" value="${escapeHtml(cfg.obraFinProgramada || summary.endDate || '')}" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Número de Contrato</label>
                <input type="text" id="bitacora-cfg-contrato" value="${escapeHtml(cfg.contratoNumero || '')}" placeholder="Ej: OP-2026-045" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-mono">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-1">Contratista / Constructora</label>
                <input type="text" id="bitacora-cfg-contratista" value="${escapeHtml(cfg.contratistaNombre || summary.companyName || '')}" placeholder="Razón social del contratista" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs">
              </div>
              <div class="sm:col-span-2">
                <label class="block font-bold text-slate-700 mb-1">Supervisión Técnica / Dependencia</label>
                <input type="text" id="bitacora-cfg-supervision" value="${escapeHtml(cfg.supervisionNombre || '')}" placeholder="Ej: Supervisión Externa / Dirección de Obras" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs">
              </div>
            </div>
          </div>

          <!-- Sección 2: Almacenamiento Unificado AWS S3 del Anfitrión -->
          <div class="space-y-3">
            <h4 class="font-extrabold text-slate-800 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1.5 flex items-center justify-between">
              <span>2. Almacenamiento en Nube AWS S3 (Cuota del Anfitrión)</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-bold">
                ${escapeHtml(storageInfo.planLabel)}
              </span>
            </h4>

            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-[11px]">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span><strong>Anfitrión del Proyecto:</strong> ${escapeHtml(storageInfo.hostName)} (${escapeHtml(storageInfo.hostEmail || 'Cuenta local')})</span>
                <span class="text-slate-500">Límite máx/archivo: <strong>${storageInfo.maxFileMb} MB</strong></span>
              </div>
              <p class="text-[10.5px] text-slate-500 leading-relaxed">
                Las fotografías se comprimen automáticamente en el navegador (máx. 1280px, JPEG/WebP 75%) y los PDFs oficiales foliados se respaldan intactos en AWS S3 + caché local IndexedDB.
              </p>
            </div>

            <div id="bitacora-config-storage-meter"></div>
          </div>

        </div>

        <div class="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button type="button" onclick="closeBitacoraModal()" class="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer">
            Cerrar
          </button>
          <button type="button" onclick="saveBitacoraConfigModalAction()" class="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-floppy-disk"></i>
            <span>Guardar Configuración</span>
          </button>
        </div>

      </div>
    </div>
  `;

  mountStorageMeter('bitacora-config-storage-meter', { showUpgradeButton: true }).catch(() => {});
}

export function saveBitacoraConfigModalAction() {
  const obraInicio = document.getElementById('bitacora-cfg-inicio')?.value || '';
  const obraFinProgramada = document.getElementById('bitacora-cfg-fin')?.value || '';
  const contratoNumero = document.getElementById('bitacora-cfg-contrato')?.value.trim() || '';
  const contratistaNombre = document.getElementById('bitacora-cfg-contratista')?.value.trim() || '';
  const supervisionNombre = document.getElementById('bitacora-cfg-supervision')?.value.trim() || '';

  updateBitacoraConfig({
    obraInicio,
    obraFinProgramada,
    contratoNumero,
    contratistaNombre,
    supervisionNombre
  });

  showToast('Configuración de Bitácora guardada.', 'success');
  closeBitacoraModal();
  renderBitacoraView();
}

export function downloadBitacoraLightboxEvidenceAction(noteId, photoIdx) {
  const note = getBitacoraNoteById(noteId);
  const ev = note?.evidencias?.[photoIdx];
  if (!ev) return;
  downloadManagedFileToDevice(ev, ev.fileName || `evidencia_${photoIdx + 1}.jpg`).catch(() => {});
}

// ============================================================================
// MODAL 4: LIGHTBOX DE EVIDENCIA FOTOGRÁFICA
// ============================================================================

export function openBitacoraPhotoLightbox(noteId, photoIdx) {
  const note = getBitacoraNoteById(noteId);
  const ev = note?.evidencias?.[photoIdx];
  if (!ev) return;

  const root = ensureBitacoraModalsRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-bitacora-lightbox" style="z-index: 100002;" class="fixed inset-0 bg-slate-950/92 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target===this) closeBitacoraModal()">
      <div class="max-w-4xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        <div class="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-white">
          <div class="text-xs font-bold truncate">
            <span class="text-teal-400 font-mono mr-2">${escapeHtml(note.folioCode)}</span>
            <span>Foto ${photoIdx + 1}: ${escapeHtml(ev.fileName)}</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" onclick="downloadBitacoraLightboxEvidenceAction('${escapeHtml(noteId)}', ${photoIdx})" class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer">
              <i class="fa-solid fa-cloud-arrow-down"></i> Descargar
            </button>
            <button type="button" onclick="closeBitacoraModal()" class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div class="flex-1 bg-black flex items-center justify-center overflow-auto p-2">
          <img src="${ev.localDataUrl || ''}" data-media-id="${escapeHtml(ev.mediaId || '')}" data-s3-key="${escapeHtml(ev.s3Key || '')}" alt="${escapeHtml(ev.caption || ev.fileName)}" class="max-w-full max-h-[75vh] object-contain rounded-lg">
        </div>
        <div class="px-4 py-3 bg-slate-900 border-t border-slate-800 text-xs text-slate-200">
          <strong class="text-teal-400">Descripción / Pie de foto:</strong> ${escapeHtml(ev.caption || 'Sin pie de foto registrado.')}
        </div>
      </div>
    </div>
  `;

  hydrateBitacoraMediaImages(root).catch(() => {});
}

// ============================================================================
// MODAL 5: CENTRO DE DESCARGAS DE BITÁCORA DE OBRA
// ============================================================================

function getFilteredDownloadsNotes() {
  const all = getBitacoraNotes();
  const q = downloadsSearchFilter.trim().toLowerCase();

  return all.filter(n => {
    if (downloadsStatusFilter === 'sealed' && n.estado !== 'sealed') return false;
    if (downloadsStatusFilter === 'draft' && n.estado !== 'draft') return false;
    if (downloadsTypeFilter !== 'all' && n.tipo !== downloadsTypeFilter) return false;

    if (q) {
      const conceptsText = (n.conceptosVinculados || []).map(c => `${c.clave} ${c.descripcion}`).join(' ');
      const haystack = [
        n.folioCode,
        n.tipo,
        n.fecha,
        n.hora,
        n.ubicacion,
        n.descripcion,
        conceptsText,
        n.firma?.autorNombre,
        n.firma?.autorCargo,
        n.firma?.autorCedula
      ].filter(Boolean).join(' ').toLowerCase();

      if (!haystack.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.estado === 'sealed' && b.estado === 'sealed') {
      return (b.folioNumber || 0) - (a.folioNumber || 0);
    }
    if (a.estado === 'sealed') return -1;
    if (b.estado === 'sealed') return 1;
    return (b.fecha || '').localeCompare(a.fecha || '');
  });
}

function renderBitacoraDownloadsItemsHtml(notes) {
  if (!notes || notes.length === 0) {
    const totalAll = getBitacoraNotes().length;
    return `
      <div class="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-500 mb-3 text-lg">
          <i class="fa-solid fa-folder-open"></i>
        </div>
        <h4 class="font-extrabold text-sm text-slate-800">
          ${totalAll > 0 ? 'Ninguna bitácora coincide con los filtros' : 'No hay notas de bitácora cargadas aún'}
        </h4>
        <p class="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
          ${totalAll > 0
            ? 'Prueba modificando el texto de búsqueda o los selectores de estatus y tipo.'
            : 'Comienza redactando notas en la bitácora para visualizarlas en este panel y poder descargarlas de forma individual o en libro completo.'}
        </p>
        ${totalAll > 0 ? `
          <button type="button" onclick="onBitacoraDownloadsSearchChange(''); onBitacoraDownloadsStatusFilterChange('all'); onBitacoraDownloadsTypeFilterChange('all');" class="mt-4 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer">
            Limpiar Filtros
          </button>
        ` : `
          <button type="button" onclick="closeBitacoraModal(); openBitacoraNoteModal(null, { defaultTipo: 'Apertura' })" class="mt-4 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-plus"></i> Redactar Primera Nota
          </button>
        `}
      </div>
    `;
  }

  return notes.map(note => {
    const isSealed = note.estado === 'sealed';
    const typeMeta = getNoteTypeMeta(note.tipo);
    const weatherMeta = getWeatherMeta(note.clima);
    const evidencias = Array.isArray(note.evidencias) ? note.evidencias : [];
    const conceptos = Array.isArray(note.conceptosVinculados) ? note.conceptosVinculados : [];

    const folioHtml = isSealed
      ? `<span class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-black tracking-wide shadow-2xs">${escapeHtml(note.folioCode)}</span>`
      : `<span class="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-mono text-[11px] font-extrabold tracking-wide">BORRADOR</span>`;

    const statusBadge = isSealed
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
           <i class="fa-solid fa-lock text-[9px]"></i> Asentada
         </span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
           <i class="fa-solid fa-pen text-[9px]"></i> Borrador
         </span>`;

    const errataBadge = note.esFeDeErratas && note.notaReferenciaFolio
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
           <i class="fa-solid fa-rotate-left text-[9px]"></i> Fe de Erratas a ${escapeHtml(note.notaReferenciaFolio)}
         </span>`
      : '';

    const borderStyle = isSealed
      ? `border-l-4 ${typeMeta.accentBorder} bg-white border-slate-200`
      : 'border-l-4 border-l-amber-400 bg-amber-50/30 border-amber-200';

    return `
      <div class="rounded-xl border ${borderStyle} p-3.5 sm:p-4 shadow-2xs hover:shadow-xs transition bg-white flex flex-col md:flex-row md:items-center justify-between gap-3.5">
        
        <!-- Info Principal -->
        <div class="space-y-2 flex-1 min-w-0">
          <!-- Línea 1: Folio, Tipo, Estatus, Fecha -->
          <div class="flex items-center gap-2 flex-wrap text-xs">
            ${folioHtml}
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${typeMeta.badgeClass}">
              <i class="fa-solid ${typeMeta.icon} text-[9px]"></i>
              <span>${escapeHtml(note.tipo)}</span>
            </span>
            ${statusBadge}
            ${errataBadge}
            <span class="text-slate-400 font-medium text-[11px]">&bull;</span>
            <span class="text-slate-600 font-semibold text-[11px]">
              <i class="fa-regular fa-calendar text-[10px] text-slate-400 mr-1"></i>${escapeHtml(note.fecha || '')}
              ${note.hora ? `<span class="text-slate-400 font-mono">(${escapeHtml(note.hora)} hrs)</span>` : ''}
            </span>
            <span class="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-medium" title="${weatherMeta.label}">
              <span>${weatherMeta.emoji}</span>
              <span>${weatherMeta.label}</span>
            </span>
          </div>

          <!-- Línea 2: Ubicación / Frente -->
          <div class="text-xs text-slate-700 font-medium flex items-center gap-1.5 truncate">
            <i class="fa-solid fa-location-dot text-[11px] text-teal-600 shrink-0"></i>
            <span class="font-bold text-slate-800">Frente / Ubicación:</span>
            <span class="text-slate-600 truncate">${escapeHtml(note.ubicacion || 'Frente general de obra')}</span>
          </div>

          <!-- Línea 3: Resumen descriptivo -->
          <p class="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50/80 p-2 rounded-lg border border-slate-100">
            ${escapeHtml(note.descripcion || 'Sin descripción técnica capturada.')}
          </p>

          <!-- Línea 4: Metadatos adicionales (Conceptos, Evidencias, Firmante) -->
          <div class="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 pt-0.5">
            ${conceptos.length > 0 ? `
              <span class="inline-flex items-center gap-1 text-slate-600 font-medium">
                <i class="fa-solid fa-layer-group text-indigo-500 text-[10px]"></i>
                <strong>${conceptos.length}</strong> concepto(s) de catálogo
              </span>
            ` : ''}

            ${evidencias.length > 0 ? `
              <span class="inline-flex items-center gap-1 text-slate-600 font-medium">
                <i class="fa-solid fa-camera text-teal-500 text-[10px]"></i>
                <strong>${evidencias.length}</strong> fotografía(s) de evidencia
              </span>
            ` : ''}

            ${isSealed && note.firma ? `
              <span class="inline-flex items-center gap-1 text-emerald-800 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/80">
                <i class="fa-solid fa-signature text-emerald-600 text-[10px]"></i>
                Firmado: <strong>${escapeHtml(note.firma.autorNombre || '')}</strong>
                ${note.firma.autorCedula ? `&bull; Céd. ${escapeHtml(note.firma.autorCedula)}` : ''}
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Botones de Acción de Descarga -->
        <div class="flex flex-row md:flex-col items-stretch sm:items-end justify-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          <button type="button" onclick="downloadSingleNotePdfAction('${note.id}')" class="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-extrabold text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer" title="${isSealed ? 'Descargar documento PDF foliado oficial' : 'Descargar PDF de vista previa'}">
            <i class="fa-solid fa-file-arrow-down text-sm"></i>
            <span>Descargar PDF</span>
          </button>

          ${isSealed ? `
            <button type="button" onclick="openBitacoraPdfAction('${note.id}')" class="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer" title="Ver / Abrir documento PDF">
              <i class="fa-solid fa-eye text-slate-500 text-[11px]"></i>
              <span>Ver PDF</span>
            </button>
          ` : `
            <button type="button" onclick="closeBitacoraModal(); openBitacoraNoteModal('${note.id}')" class="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer" title="Editar este borrador para completarlo o firmarlo">
              <i class="fa-solid fa-pencil text-amber-600 text-[11px]"></i>
              <span>Editar Borrador</span>
            </button>
          `}
        </div>

      </div>
    `;
  }).join('');
}

export function renderBitacoraDownloadsList() {
  const container = document.getElementById('bitacora-downloads-list-container');
  const footerSummary = document.getElementById('bitacora-downloads-footer-summary');
  if (!container) return;

  const filtered = getFilteredDownloadsNotes();
  const allNotes = getBitacoraNotes();
  const sealedCount = allNotes.filter(n => n.estado === 'sealed').length;

  container.innerHTML = renderBitacoraDownloadsItemsHtml(filtered);

  if (footerSummary) {
    footerSummary.textContent = `Mostrando ${filtered.length} de ${allNotes.length} nota(s) registrada(s) (${sealedCount} oficial(es) asentada(s)).`;
  }

  hydrateBitacoraMediaImages(container).catch(() => {});
}

export function onBitacoraDownloadsSearchChange(val) {
  downloadsSearchFilter = val || '';
  renderBitacoraDownloadsList();
}

export function onBitacoraDownloadsStatusFilterChange(val) {
  downloadsStatusFilter = val || 'all';
  renderBitacoraDownloadsList();
}

export function onBitacoraDownloadsTypeFilterChange(val) {
  downloadsTypeFilter = val || 'all';
  renderBitacoraDownloadsList();
}

export function openBitacoraDownloadsModal() {
  const allNotes = getBitacoraNotes();
  const sealedNotes = allNotes.filter(n => n.estado === 'sealed');
  const draftNotes = allNotes.filter(n => n.estado === 'draft');
  const summary = getBitacoraWorkSummary();

  downloadsSearchFilter = '';
  downloadsStatusFilter = 'all';
  downloadsTypeFilter = 'all';

  const root = ensureBitacoraModalsRoot();
  if (!root) return;

  root.innerHTML = `
    <div id="modal-bitacora-downloads" style="z-index: 100050;" class="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-fade-in" onclick="if(event.target===this) closeBitacoraModal()">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden" onclick="event.stopPropagation()">
        
        <!-- Header -->
        <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-sm">
              <i class="fa-solid fa-folder-arrow-down text-base"></i>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-extrabold text-sm sm:text-base text-white tracking-tight">
                  Centro de Descargas de Bitácora de Obra
                </h3>
                <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-wide">
                  Expediente PDF
                </span>
              </div>
              <p class="text-[11px] text-slate-300 truncate">
                Obra: <strong class="text-white">${escapeHtml(summary.projectName)}</strong>
                ${summary.projectLocation ? ` &bull; ${escapeHtml(summary.projectLocation)}` : ''}
                &bull; <span id="bitacora-downloads-count-badge" class="font-semibold text-indigo-200">${allNotes.length} nota(s) registrada(s) (${sealedNotes.length} asentada(s))</span>
              </p>
            </div>
          </div>
          <button type="button" onclick="closeBitacoraModal()" class="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer" title="Cerrar">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 sm:p-5 overflow-y-auto custom-scroll space-y-4 text-xs flex-1 bg-slate-50/60">

          <!-- 1. Tarjeta Destacada: Descargar Libro Completo -->
          <div class="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white shadow-sm border border-slate-700/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5 sm:mt-0">
                <i class="fa-solid fa-book-bookmark text-lg"></i>
              </div>
              <div class="space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="font-extrabold text-sm text-white">Libro Completo de Bitácora (PDF Compilado)</h4>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    ${sealedNotes.length} nota(s) oficial(es)
                  </span>
                </div>
                <p class="text-[11px] text-slate-300 max-w-xl leading-relaxed">
                  Compila la carátula institucional de obra, índice foliado, firmas digitales y todas las evidencias en un solo expediente PDF oficial inmutable.
                </p>
              </div>
            </div>
            <button type="button" onclick="downloadFullBitacoraBookAction()" class="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-xs shadow-md transition flex items-center gap-2 cursor-pointer shrink-0" title="${isLegalBitacoraAllowed() ? 'Compilar y descargar libro completo en PDF' : 'Disponible desde Plan Plus'}">
              <i class="fa-solid fa-file-pdf text-sm"></i>
              <span>Descargar Libro Completo</span>
              ${!isLegalBitacoraAllowed() ? '<i class="fa-solid fa-lock text-[10px] ml-1"></i>' : ''}
            </button>
          </div>

          <!-- 2. Barra de Búsqueda y Filtros de la Lista -->
          <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2.5">
            <div class="relative flex-1 min-w-[220px]">
              <i class="fa-solid fa-magnifying-glass text-slate-400 text-xs absolute left-3 top-1/2 -translate-y-1/2"></i>
              <input type="text" id="bitacora-downloads-search" value="${escapeHtml(downloadsSearchFilter)}" oninput="onBitacoraDownloadsSearchChange(this.value)" placeholder="Buscar por folio (#001), tipo, ubicación, responsable o texto..." class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition">
            </div>

            <div class="flex items-center gap-2 flex-wrap">
              <select id="bitacora-downloads-filter-status" onchange="onBitacoraDownloadsStatusFilterChange(this.value)" class="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="all" ${downloadsStatusFilter === 'all' ? 'selected' : ''}>Todas las notas (${allNotes.length})</option>
                <option value="sealed" ${downloadsStatusFilter === 'sealed' ? 'selected' : ''}>Solo Asentadas (${sealedNotes.length})</option>
                <option value="draft" ${downloadsStatusFilter === 'draft' ? 'selected' : ''}>Solo Borradores (${draftNotes.length})</option>
              </select>

              <select id="bitacora-downloads-filter-type" onchange="onBitacoraDownloadsTypeFilterChange(this.value)" class="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="all" ${downloadsTypeFilter === 'all' ? 'selected' : ''}>Todos los tipos</option>
                ${BITACORA_NOTE_TYPES.map(t => `<option value="${t.id}" ${downloadsTypeFilter === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- 3. Contenedor de la lista de bitácoras cargadas -->
          <div id="bitacora-downloads-list-container" class="space-y-2.5">
            ${renderBitacoraDownloadsItemsHtml(getFilteredDownloadsNotes())}
          </div>

        </div>

        <!-- Footer -->
        <div class="bg-slate-100 px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <span id="bitacora-downloads-footer-summary" class="text-[11px] text-slate-500 font-medium truncate">
            Mostrando ${allNotes.length} nota(s) registrada(s) (${sealedNotes.length} asentada(s)).
          </span>
          <div class="flex items-center gap-2">
            <button type="button" onclick="closeBitacoraModal()" class="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer">
              Cerrar
            </button>
            <button type="button" onclick="downloadFullBitacoraBookAction()" class="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-book-open text-amber-400"></i>
              <span>Descargar Libro Completo</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `;

  const listContainer = document.getElementById('bitacora-downloads-list-container');
  if (listContainer) {
    hydrateBitacoraMediaImages(listContainer).catch(() => {});
  }
}

// Auto-registro directo en window para máxima resiliencia contra caché del navegador
if (typeof window !== 'undefined') {
  Object.assign(window, {
    renderBitacoraView,
    openBitacoraConfigModal,
    saveBitacoraConfigModalAction,
    onBitacoraTodayWeatherChange,
    openBitacoraNoteModal,
    closeBitacoraModal,
    insertBitacoraTemplate,
    onBitacoraConceptSearch,
    toggleBitacoraConceptLink,
    onBitacoraPhotosSelected,
    updateTempEvidenceCaption,
    removeTempBitacoraEvidence,
    saveBitacoraNoteFormAction,
    deleteBitacoraDraftAction,
    createFeDeErratasAction,
    openSignBitacoraNoteModal,
    clearBitacoraSignatureCanvas,
    confirmAndSealBitacoraNoteAction,
    downloadSingleNotePdfAction,
    openBitacoraPdfAction,
    downloadFullBitacoraBookAction,
    syncPendingBitacoraCloudAction,
    downloadBitacoraLightboxEvidenceAction,
    onBitacoraSearchChange,
    onBitacoraTypeFilterChange,
    onBitacoraStatusFilterChange,
    onBitacoraDateFromChange,
    onBitacoraDateToChange,
    toggleBitacoraSortOrder,
    clearBitacoraFilters,
    scrollToBitacoraNote,
    openBitacoraPhotoLightbox,
    openBitacoraDownloadsModal,
    renderBitacoraDownloadsList,
    onBitacoraDownloadsSearchChange,
    onBitacoraDownloadsStatusFilterChange,
    onBitacoraDownloadsTypeFilterChange
  });
}


