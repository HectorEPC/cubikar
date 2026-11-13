import { printEstimacionesFormat } from '../io/printService.js';
import { renderTabAssignedAvatars } from '../portal/portalController.js';
// js/modules/estimaciones/estimacionesView.js
// Renderizador y controlador de eventos para la pestaña ESTIMACIONES DE OBRA
// Sincronizado reactivamente con Catálogo Base, con soporte multiestimaciones,
// amortización progresiva de anticipo al 100%, reflejo de cantidades acumuladas,
// justificación de conceptos, encabezados en una sola línea y resizer vertical de columna de concepto.

import { state } from '../../state/store.js';
import { formatCurrency, formatNumber } from '../../core/formatters.js';
import { showToast } from '../../ui/notifications.js';
import {
  getEstimacionesCalculatedData,
  getActiveEstimacion,
  setActiveEstimacionId,
  createNewEstimacion,
  updateEstimacionMeta,
  deleteEstimacion,
  setConceptoCantidadEjecutada,
  setEstimacionesAnticipoPct,
  setEstimacionesIvaPct,
  isEstimacionLocked,
  normalizeCloudImageUrl,
  getConceptoFotosEstimacion,
  setConceptoFotosEstimacion,
  updateEstimacionAnticipoZero,
  updateEstimacionFactura,
  loadEstimacionesData,
  saveEstimacionesData,
  createDefaultFacturaData
} from './estimacionesModel.js';
import { guardTabUnlocked, applyTabLocksToDOM, toggleTabLock } from '../../ui/tabLockController.js';
import { renderPartidaNivel1ChatButton, renderProjectChatDock } from '../chat/projectChat.js';
import { getActiveProjectId } from '../../config/constants.js';
import { uploadManagedFile, resolveManagedFileUrl, deleteManagedFile, downloadManagedFileToDevice } from '../../services/s3StorageService.js';
import { mountStorageMeter } from '../../services/storageQuotaService.js';

let estimacionesSearchTerm = '';
let estimacionesCollapsedMap = {}; // { [nodeId]: boolean }
let selectedEstimacionRowId = null;

// Seleccionar y pintar fila en la tabla de Estimaciones (mismo color y estilo que Catálogo Base)
export function selectEstimacionRow(rowId, event = null) {
  selectedEstimacionRowId = String(rowId);
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#estimaciones-main-table tbody tr[data-est-row]').forEach((rowEl) => {
    if (String(rowEl.getAttribute('data-est-row')) === selectedEstimacionRowId) {
      rowEl.classList.add('selected-row');
    } else {
      rowEl.classList.remove('selected-row');
    }
  });
}

// Ancho persistente de la columna de conceptos (mínimo 140px, máximo 850px, estándar compacto 310px)
let estimacionesConceptoColWidth = parseInt(localStorage.getItem('adm_estimaciones_concepto_width'), 10) || 310;

// Aplicar dinámicamente el ancho de la columna de concepto mediante CSS reactivo sin redibujar el DOM
export function applyConceptoColumnWidth(widthPx) {
  estimacionesConceptoColWidth = Math.max(140, Math.min(850, Math.round(widthPx)));
  let styleEl = document.getElementById('estimaciones-dynamic-col-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'estimaciones-dynamic-col-style';
    document.head.appendChild(styleEl);
  }
  const claveW = 46;
  const unidW = 48;
  const leftTotalW = claveW + estimacionesConceptoColWidth + unidW;

  styleEl.textContent = `
    .col-estimaciones-clave {
      width: ${claveW}px !important;
      min-width: ${claveW}px !important;
      max-width: ${claveW}px !important;
      left: 0px !important;
    }
    .col-estimaciones-concepto {
      width: ${estimacionesConceptoColWidth}px !important;
      min-width: ${estimacionesConceptoColWidth}px !important;
      max-width: ${estimacionesConceptoColWidth}px !important;
      left: ${claveW}px !important;
    }
    .col-estimaciones-unid {
      width: ${unidW}px !important;
      min-width: ${unidW}px !important;
      max-width: ${unidW}px !important;
      left: ${claveW + estimacionesConceptoColWidth}px !important;
    }
    .col-estimaciones-header-cat {
      width: ${leftTotalW}px !important;
      min-width: ${leftTotalW}px !important;
      max-width: ${leftTotalW}px !important;
      left: 0px !important;
    }
    .estimaciones-fixed-left-width {
      width: ${leftTotalW}px !important;
      min-width: ${leftTotalW}px !important;
      max-width: ${leftTotalW}px !important;
    }
    .estimaciones-concepto-desc {
      text-align: justify !important;
      text-justify: inter-word !important;
      hyphens: auto;
      word-break: break-word;
      overflow-wrap: break-word;
      font-size: 11px !important;
      line-height: 1.35;
    }
  `;

  if (typeof updateEstimacionesThumbUI === 'function') {
    updateEstimacionesThumbUI();
  }
}

// Ajuste rápido con botones de incremento / decremento
export function adjustConceptoColumnWidth(deltaPx) {
  const newW = estimacionesConceptoColWidth + deltaPx;
  applyConceptoColumnWidth(newW);
  localStorage.setItem('adm_estimaciones_concepto_width', estimacionesConceptoColWidth);
}

// Restablecer al ancho estándar recomendado
export function resetConceptoColumnWidth() {
  applyConceptoColumnWidth(310);
  localStorage.setItem('adm_estimaciones_concepto_width', 310);
  showToast('Ancho de columna de concepto restablecido a 310px');
}

// Inicializar el resizer vertical arrastrable (Splitter en el borde de Catálogo y Concepto de Obra)
export function initEstimacionesColumnResizer() {
  applyConceptoColumnWidth(estimacionesConceptoColWidth);

  const handleN1 = document.getElementById('estimaciones-resizer-handle-n1');
  const handleN2 = document.getElementById('estimaciones-resizer-handle-n2');
  const guideLine = document.getElementById('estimaciones-resizer-guide-line');
  const container = document.getElementById('estimaciones-table-container');

  function updateGuidePosition() {
    const unidTh = document.getElementById('estimaciones-th-unid');
    if (unidTh && guideLine && container) {
      const rect = unidTh.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const left = rect.right - contRect.left + container.scrollLeft;
      guideLine.style.left = `${left - 1}px`;
      guideLine.style.height = `${Math.max(container.scrollHeight, container.clientHeight)}px`;
    }
  }

  function setHighlight(active) {
    [handleN1, handleN2].forEach(h => {
      if (!h) return;
      if (active) {
        h.classList.add('bg-blue-600', 'ring-2', 'ring-blue-400', 'shadow-md');
      } else {
        h.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-400', 'shadow-md');
      }
    });
  }

  let isDragging = false;

  function bindDragHandle(handle) {
    if (!handle) return;

    handle.onmouseenter = () => {
      setHighlight(true);
      if (guideLine) {
        updateGuidePosition();
        guideLine.classList.remove('hidden');
      }
    };

    handle.onmouseleave = () => {
      if (!isDragging) {
        setHighlight(false);
        if (guideLine) guideLine.classList.add('hidden');
      }
    };

    handle.onmousedown = (e) => {
      e.preventDefault();
      isDragging = true;
      const startX = e.clientX;
      const startW = estimacionesConceptoColWidth;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      setHighlight(true);
      if (guideLine) {
        updateGuidePosition();
        guideLine.classList.remove('hidden');
      }

      function onMouseMove(ev) {
        const delta = ev.clientX - startX;
        const newW = startW + delta;
        applyConceptoColumnWidth(newW);
        updateGuidePosition();
      }

      function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setHighlight(false);
        if (guideLine) guideLine.classList.add('hidden');
        localStorage.setItem('adm_estimaciones_concepto_width', estimacionesConceptoColWidth);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    handle.ondblclick = (e) => {
      e.preventDefault();
      resetConceptoColumnWidth();
      updateGuidePosition();
    };
  }

  bindDragHandle(handleN1);
  bindDragHandle(handleN2);
}

// Contenido interno del pie de tabla (tfoot) para actualización reactiva sin perder el foco en CANT EJE
function renderEstimacionesTfootContentHTML(kpis, currencySymbol) {
  return `
            <!-- Renglón 1: Totales de la Obra (Fondo Blanco Puro con Números de Alto Contraste) -->
            <tr class="font-bold bg-white text-slate-800 border-b border-slate-200">
              <td colspan="3" class="py-2.5 px-2.5 font-extrabold text-right uppercase text-[11px] text-slate-700 font-sans bg-white border-r-2 border-slate-400 whitespace-nowrap sticky left-0 z-25 col-estimaciones-header-cat shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                TOTALES DE LA OBRA:
              </td>
              <!-- Base -->
              <td class="py-2.5 px-1 text-center text-[9px] text-slate-300 bg-white">---</td>
              <td class="py-2.5 px-1 text-center text-[9px] text-slate-300 bg-white">---</td>
              <td class="py-2.5 px-1.5 text-right font-black text-slate-900 bg-white border-r-2 border-blue-200 whitespace-nowrap text-[11px]" title="Presupuesto Base">${formatCurrency(kpis.grandTotalBase, currencySymbol)}</td>

              <!-- Anterior -->
              <td class="py-2.5 px-1 text-center text-[9px] text-slate-300 bg-white">---</td>
              <td class="py-2.5 px-1.5 text-right font-bold text-purple-900 bg-white border-r-2 border-purple-200 whitespace-nowrap text-[11px]">${formatCurrency(kpis.grandTotalAnterior, currencySymbol)}</td>

              <!-- Esta Estimación -->
              <td class="py-2.5 px-1 text-center text-[9px] text-emerald-400 bg-white">---</td>
              <td class="py-2.5 px-1.5 text-right font-black text-emerald-700 bg-white border-r-2 border-emerald-300 whitespace-nowrap text-[11px]" title="Esta Estimación">${formatCurrency(kpis.grandTotalEjecutado, currencySymbol)}</td>

              <!-- Acumulado Actual -->
              <td class="py-2.5 px-1 text-center text-[9px] text-slate-300 bg-white">---</td>
              <td class="py-2.5 px-1.5 text-right font-bold text-slate-900 bg-white whitespace-nowrap text-[11px]">${formatCurrency(kpis.grandTotalAcumulado, currencySymbol)}</td>
              <td class="py-2.5 px-1 text-center text-[11px] font-black text-blue-700 bg-white border-r-2 border-cyan-200 whitespace-nowrap">${kpis.pctAvanceGlobal.toFixed(2)}%</td>

              <!-- Saldo Restante -->
              <td class="py-2.5 px-1 text-center text-[9px] text-slate-300 bg-white">---</td>
              <td class="py-2.5 px-1.5 text-right font-black text-amber-800 bg-white whitespace-nowrap text-[11px]" title="Saldo x Ejecutar">${formatCurrency(kpis.grandTotalSaldo, currencySymbol)}</td>
            </tr>

            <!-- Renglón 2: Desglose de Amortización de Anticipo y Líquido a Cobrar (Rectángulo Blanco Puro Unificado) -->
            <tr class="bg-white text-[11px] font-sans">
              <td colspan="8" class="py-2.5 px-2.5 text-slate-700 font-mono bg-white">
                <span class="text-amber-800 font-bold uppercase mr-1 text-[10.5px]" title="Amortización de Anticipo:">ANTICIPO (${kpis.anticipo.pct}%):</span>
                <span>Contratado: <strong class="text-slate-900">${formatCurrency(kpis.anticipo.totalContratado, currencySymbol)}</strong></span>
                <span class="mx-1 text-slate-300">|</span>
                <span>Amortizado Anterior: <strong class="text-slate-700">${formatCurrency(kpis.anticipo.amortizadoAnterior, currencySymbol)}</strong></span>
                <span class="mx-1 text-slate-300">|</span>
                <span>Saldo x Amortizar: <strong class="text-amber-800">${formatCurrency(kpis.anticipo.saldoPendiente, currencySymbol)}</strong></span>
              </td>
              
              <!-- Celda Amortización en Esta Estimación (Fondo Blanco Puro con Tipografía Roja de Alto Contraste) -->
              <td colspan="3" class="py-2.5 px-2 text-right font-mono bg-white border-l-2 border-slate-200 text-rose-700 whitespace-nowrap">
                <div class="leading-tight">
                  <span class="text-[9.5px] font-bold uppercase block text-rose-600" title="Amortización de Anticipo:">Amortización en Esta Estimación:</span>
                  <span class="text-[11px] font-black">${kpis.anticipo.amortizacionEsta > 0 ? '-' : ''}${formatCurrency(kpis.anticipo.amortizacionEsta, currencySymbol)}</span>
                </div>
              </td>
              
              <!-- Celda NETO A COBRAR (Fondo Blanco Puro con Tipografía Verde de Alto Contraste) -->
              <td colspan="4" class="py-2.5 px-2.5 text-right font-mono bg-white border-l-2 border-slate-200 whitespace-nowrap">
                <div class="flex items-center justify-end gap-2.5">
                  <div>
                    <span class="text-emerald-800 font-bold text-[11px] uppercase font-sans mr-1" title="Neto a Cobrar:">NETO A COBRAR:</span>
                    <span class="text-emerald-700 text-sm font-black">${formatCurrency(kpis.anticipo.netoEstaEstimacion, currencySymbol)}</span>
                  </div>
                  ${kpis.iva.pct > 0 ? `
                    <div class="pl-2 border-l border-slate-300 text-left font-sans" title="IVA de la estimación: ${formatCurrency(kpis.iva.estaEstimacion, currencySymbol)}">
                      <span class="text-[7.5px] text-emerald-700 uppercase block font-bold">+IVA (${kpis.iva.pct}%):</span>
                      <span class="text-[11px] font-black text-emerald-800 font-mono">${formatCurrency(kpis.iva.totalConIva, currencySymbol)}</span>
                    </div>
                  ` : ''}
                </div>
              </td>
            </tr>
  `;
}

// =========================================================================
// VENTANA MODAL FLOTANTE DE GESTIÓN Y VISTA DE FACTURA
// =========================================================================
export function openFacturaModal(estId = null) {
  const data = getEstimacionesCalculatedData();
  const targetId = estId || data.activeEst.id;
  const est = data.estimacionesList.find(e => e.id === targetId) || data.activeEst;
  if (!est) return;

  const modal = document.getElementById('modal-factura-estimacion');
  const titleEl = document.getElementById('modal-factura-title');
  const subtitleEl = document.getElementById('modal-factura-subtitle');
  const bodyEl = document.getElementById('modal-factura-body');
  if (!modal || !bodyEl) return;

  const factura = est.factura || {
    folio: '',
    fechaEmision: '',
    fechaPago: '',
    status: 'pendiente',
    pdfUrl: '',
    pdfFileName: '',
    xmlUrl: '',
    xmlFileName: ''
  };

  const hasPdf = Boolean(factura.pdfUrl || factura.pdfFileRef || factura.pdfFileName);
  const hasXml = Boolean(factura.xmlUrl || factura.xmlFileRef || factura.xmlFileName);
  const isCobrada = factura.status === 'cobrada';

  if (titleEl) {
    titleEl.textContent = `Comprobante Fiscal — ${est.numero === 0 ? 'Est. 0 (Anticipo)' : est.nombre}`;
  }
  if (subtitleEl) {
    subtitleEl.textContent = hasPdf ? `Factura adjunta: ${factura.pdfFileName || 'Factura.pdf'}` : 'Sin factura cargada actualmente';
  }

  bodyEl.innerHTML = `
    <!-- Barra de Estado de Cobro -->
    <div class="p-3 rounded-xl ${isCobrada ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'} flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="w-8 h-8 rounded-lg ${isCobrada ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'} flex items-center justify-center font-bold text-sm">
          <i class="fa-solid ${isCobrada ? 'fa-circle-check' : 'fa-clock'}"></i>
        </span>
        <div>
          <span class="font-bold text-xs ${isCobrada ? 'text-emerald-900' : 'text-amber-900'} block">
            Estado: ${isCobrada ? 'COBRADA / PAGADA' : 'PENDIENTE DE PAGO'}
          </span>
          <span class="text-[11px] text-slate-500">
            ${isCobrada ? 'Esta estimación ya fue liquidada' : 'Pendiente de cobro'}
          </span>
        </div>
      </div>

      <button type="button" onclick="toggleEstimacionCobroStatus('${est.id}'); openFacturaModal('${est.id}')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer ${isCobrada ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}">
        ${isCobrada ? 'Marcar como Pendiente' : 'Marcar como Cobrada'}
      </button>
    </div>

    <!-- Metadatos de la Factura -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
      <div>
        <label class="block font-bold text-slate-700 text-[11px] mb-1">
          <i class="fa-solid fa-hashtag text-indigo-600 mr-1"></i> Folio / UUID:
        </label>
        <input type="text" value="${factura.folio || ''}" placeholder="Ej: F-1025..."
               onchange="onFacturaFieldChange('${est.id}', 'folio', this.value.trim())"
               class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500">
      </div>
      <div>
        <label class="block font-bold text-slate-700 text-[11px] mb-1">
          <i class="fa-regular fa-calendar text-indigo-600 mr-1"></i> Fecha de Emisión:
        </label>
        <input type="date" value="${factura.fechaEmision || ''}"
               onchange="onFacturaFieldChange('${est.id}', 'fechaEmision', this.value)"
               class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-indigo-500">
      </div>
      <div>
        <label class="block font-bold text-slate-700 text-[11px] mb-1">
          <i class="fa-solid fa-calendar-check text-emerald-600 mr-1"></i> Fecha de Pago:
        </label>
        <input type="date" value="${factura.fechaPago || ''}"
               onchange="onFacturaFieldChange('${est.id}', 'fechaPago', this.value)"
               class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-indigo-500">
      </div>
    </div>

    <!-- Gestión de Archivos (Factura PDF y XML SAT) -->
    <div class="space-y-3">
      <h4 class="font-extrabold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
        <i class="fa-solid fa-folder-open text-indigo-600"></i> Archivos Adjuntos del Comprobante
      </h4>

      <!-- Tarjeta FACTURA PDF -->
      <div class="p-4 rounded-xl border ${hasPdf ? 'bg-rose-50/40 border-rose-200' : 'bg-slate-50 border-dashed border-slate-300'} flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-10 h-10 rounded-xl ${hasPdf ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 text-slate-400'} flex items-center justify-center text-lg font-bold shrink-0">
              <i class="fa-solid fa-file-pdf"></i>
            </span>
            <div class="min-w-0">
              <span class="font-bold text-slate-800 text-xs block">Factura en Formato PDF</span>
              <span class="text-[11px] text-slate-500 truncate block font-mono">
                ${factura.pdfFileName || 'Sin archivo PDF adjunto'}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            ${hasPdf ? `
              <button type="button" onclick="viewFacturaFile('${est.id}', 'pdf')"
                      class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      title="Ver y abrir PDF en pantalla completa">
                <i class="fa-solid fa-eye"></i> <span>Ver Factura</span>
              </button>

              <button type="button" onclick="removeFacturaFile('${est.id}', 'pdf'); openFacturaModal('${est.id}')"
                      class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                      title="Eliminar este archivo PDF">
                <i class="fa-solid fa-trash-can"></i> <span>Eliminar</span>
              </button>
            ` : ''}

            <label class="px-3 py-1.5 rounded-lg ${hasPdf ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'} font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>${hasPdf ? 'Sustituir / Subir Otra' : 'Subir Factura PDF'}</span>
              <input type="file" accept="application/pdf" class="hidden"
                     onchange="if(this.files[0]) {
                       onFacturaFileUpload('${est.id}', 'pdf', this.files[0]).then(() => openFacturaModal('${est.id}'));
                     }">
            </label>
          </div>
        </div>

        ${hasPdf && factura.pdfUrl ? `
          <!-- Visor / Enlace directo embebido -->
          <div class="bg-white rounded-lg border border-rose-200 p-2.5 flex items-center justify-between gap-2 text-[11px]">
            <span class="text-slate-600 truncate flex items-center gap-1.5">
              <i class="fa-solid fa-link text-rose-500"></i> Enlace listo para consulta o auditoría fiscal
            </span>
            <button type="button" onclick="viewFacturaFile('${est.id}', 'pdf')" class="text-rose-600 hover:text-rose-800 font-bold underline cursor-pointer shrink-0">
              Abrir visor externo ↗
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Tarjeta ARCHIVO XML DEL SAT -->
      <div class="p-4 rounded-xl border ${hasXml ? 'bg-blue-50/40 border-blue-200' : 'bg-slate-50 border-dashed border-slate-300'} flex flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-10 h-10 rounded-xl ${hasXml ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400'} flex items-center justify-center text-lg font-bold shrink-0">
              <i class="fa-solid fa-file-code"></i>
            </span>
            <div class="min-w-0">
              <span class="font-bold text-slate-800 text-xs block">Comprobante Fiscal SAT (XML)</span>
              <span class="text-[11px] text-slate-500 truncate block font-mono">
                ${factura.xmlFileName || 'Sin archivo XML adjunto'}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            ${hasXml ? `
              <button type="button" onclick="viewFacturaFile('${est.id}', 'xml')"
                      class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                      title="Descargar archivo XML oficial del SAT">
                <i class="fa-solid fa-download"></i> <span>Descargar XML</span>
              </button>

              <button type="button" onclick="removeFacturaFile('${est.id}', 'xml'); openFacturaModal('${est.id}')"
                      class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                      title="Eliminar este archivo XML">
                <i class="fa-solid fa-trash-can"></i> <span>Eliminar</span>
              </button>
            ` : ''}

            <label class="px-3 py-1.5 rounded-lg ${hasXml ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'} font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>${hasXml ? 'Sustituir XML' : 'Subir Archivo XML'}</span>
              <input type="file" accept=".xml,text/xml,application/xml" class="hidden"
                     onchange="if(this.files[0]) {
                       onFacturaFileUpload('${est.id}', 'xml', this.files[0]).then(() => openFacturaModal('${est.id}'));
                     }">
            </label>
          </div>
        </div>
      </div>

    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeFacturaModal() {
  const modal = document.getElementById('modal-factura-estimacion');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Renderizado principal de la pestaña ESTIMACIONES
// =========================================================================
// RENDERIZADO: COMPONENTE DE FACTURACIÓN Y COMPROBANTE FISCAL POR ESTIMACIÓN
// =========================================================================
let estimacionesFacturaExpandedMap = {}; // { [estId]: boolean }

export function toggleEstimacionCobroStatus(estId) {
  try {
    const data = loadEstimacionesData();
    const targetId = estId || data.activeEstimacionId;
    const est = data.estimaciones.find(e => e.id === targetId) || data.estimaciones[0];
    if (!est) return;

    if (!est.factura || typeof est.factura !== 'object') {
      est.factura = createDefaultFacturaData();
    }

    const currentStatus = est.factura.status || 'pendiente';
    const newStatus = currentStatus === 'cobrada' ? 'pendiente' : 'cobrada';
    
    est.factura.status = newStatus;
    est.factura.fechaPago = newStatus === 'cobrada' ? (est.factura.fechaPago || new Date().toISOString().split('T')[0]) : '';

    saveEstimacionesData(data);
    renderEstimacionesView();
    showToast(newStatus === 'cobrada' ? '✅ Estimación marcada como COBRADA / PAGADA' : '⏳ Estimación marcada como PENDIENTE DE PAGO', newStatus === 'cobrada' ? 'success' : 'info');
  } catch (err) {
    console.error('Error al alternar estado de cobro:', err);
    showToast('Error al cambiar estado de cobro', 'error');
  }
}

export function toggleEstimacionFacturaCard(estId) {
  toggleEstimacionCobroStatus(estId);
}

function renderFacturaCardHTML(est, isLocked) {
  const factura = est.factura || {
    folio: '',
    fechaEmision: '',
    fechaPago: '',
    status: 'pendiente',
    pdfUrl: '',
    pdfFileName: '',
    xmlUrl: '',
    xmlFileName: ''
  };

  const isExpanded = Boolean(estimacionesFacturaExpandedMap[est.id]);
  const isCobrada = factura.status === 'cobrada';
  const hasPdf = Boolean(factura.pdfUrl || factura.pdfFileRef || factura.pdfFileName);
  const hasXml = Boolean(factura.xmlUrl || factura.xmlFileRef || factura.xmlFileName);

  if (!isExpanded) {
    return ''; // Completamente oculto si no está desplegado, no genera tarjeta duplicada
  }

  return `
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 mb-2">
      <!-- Barra Cabecera Colapsable -->
      <div class="px-3 py-2 bg-gradient-to-r from-slate-50 via-blue-50/40 to-slate-50 flex items-center justify-between gap-2 cursor-pointer select-none border-b border-slate-200/80"
           onclick="toggleEstimacionFacturaCard('${est.id}')">
        
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-6 h-6 rounded-lg ${isCobrada ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'} flex items-center justify-center text-xs shrink-0 font-bold shadow-2xs">
            <i class="fa-solid fa-file-invoice"></i>
          </span>
          <div class="min-w-0">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
              Detalle Fiscal de Factura y SAT
              ${factura.folio ? `<span class="px-2 py-0.2 rounded font-mono text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Folio: ${factura.folio}</span>` : ''}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Botón cerrar colapsar -->
          <button type="button" onclick="toggleEstimacionFacturaCard('${est.id}')" class="text-slate-400 hover:text-slate-700 text-xs p-1" title="Cerrar detalles fiscales">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
      </div>

      <!-- Contenido Desplegable -->
      <div class="p-3.5 bg-slate-50/50 space-y-3 border-t border-slate-100 text-xs">
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <!-- Folio de Factura -->
          <div>
            <label class="block font-semibold text-slate-700 text-[11px] mb-1">
              <i class="fa-solid fa-hashtag text-blue-600 mr-1"></i> Folio / UUID Fiscal:
            </label>
            <input type="text"
                   ${isLocked ? 'disabled readonly' : ''}
                   value="${factura.folio || ''}"
                   onchange="onFacturaFieldChange('${est.id}', 'folio', this.value.trim())"
                   placeholder="Ej: F-1025 o UUID..."
                   class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100">
          </div>

          <!-- Fecha de Emisión -->
          <div>
            <label class="block font-semibold text-slate-700 text-[11px] mb-1">
              <i class="fa-regular fa-calendar text-blue-600 mr-1"></i> Fecha de Emisión:
            </label>
            <input type="date"
                   ${isLocked ? 'disabled readonly' : ''}
                   value="${factura.fechaEmision || ''}"
                   onchange="onFacturaFieldChange('${est.id}', 'fechaEmision', this.value)"
                   class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500 disabled:bg-slate-100">
          </div>

          <!-- Fecha de Pago -->
          <div>
            <label class="block font-semibold text-slate-700 text-[11px] mb-1">
              <i class="fa-solid fa-calendar-check text-emerald-600 mr-1"></i> Fecha de Pago / Cobro:
            </label>
            <input type="date"
                   ${isLocked ? 'disabled readonly' : ''}
                   value="${factura.fechaPago || ''}"
                   onchange="onFacturaFieldChange('${est.id}', 'fechaPago', this.value)"
                   class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500 disabled:bg-slate-100">
          </div>

          <!-- Estado de Cobro -->
          <div>
            <label class="block font-semibold text-slate-700 text-[11px] mb-1">
              <i class="fa-solid fa-coins text-amber-500 mr-1"></i> Estado de Cobro:
            </label>
            <select ${isLocked ? 'disabled' : ''}
                    onchange="onFacturaFieldChange('${est.id}', 'status', this.value)"
                    class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 disabled:bg-slate-100">
              <option value="pendiente" ${!isCobrada ? 'selected' : ''}>⏳ Pendiente de Pago</option>
              <option value="cobrada" ${isCobrada ? 'selected' : ''}>✅ Cobrada / Pagada</option>
            </select>
          </div>
        </div>

        <!-- Área de Archivos Adjuntos: Factura PDF y Archivo XML SAT -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
          
          <!-- TARJETA FACTURA PDF -->
          <div class="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-sm shrink-0">
                  <i class="fa-solid fa-file-pdf"></i>
                </span>
                <div class="min-w-0">
                  <span class="font-bold text-slate-800 block text-xs">Factura PDF Oficial</span>
                  <span class="text-[10px] text-slate-500 block truncate" title="${factura.pdfFileName || 'Sin archivo PDF adjunto'}">
                    ${factura.pdfFileName || 'Sin archivo adjunto'}
                  </span>
                </div>
              </div>

              ${hasPdf ? `
                <div class="flex items-center gap-1.5">
                  <button type="button" onclick="viewFacturaFile('${est.id}', 'pdf')"
                          class="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10.5px] shadow-2xs transition flex items-center gap-1 cursor-pointer"
                          title="Abrir y ver la factura en PDF">
                    <i class="fa-solid fa-eye"></i> Ver PDF
                  </button>
                  ${!isLocked ? `
                    <button type="button" onclick="removeFacturaFile('${est.id}', 'pdf')"
                            class="text-rose-500 hover:text-rose-700 p-1 text-xs cursor-pointer"
                            title="Eliminar PDF">
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  ` : ''}
                </div>
              ` : ''}
            </div>

            ${!hasPdf && !isLocked ? `
              <label class="w-full border-2 border-dashed border-rose-300 hover:border-rose-500 bg-rose-50/50 hover:bg-rose-50 rounded-lg p-2 text-center text-[11px] text-rose-700 font-bold cursor-pointer transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-cloud-arrow-up text-sm"></i>
                <span>Adjuntar Factura PDF</span>
                <input type="file" accept="application/pdf" class="hidden"
                       onchange="if(this.files[0]) onFacturaFileUpload('${est.id}', 'pdf', this.files[0])">
              </label>
            ` : ''}
          </div>

          <!-- TARJETA ARCHIVO XML (SAT) -->
          <div class="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                  <i class="fa-solid fa-file-code"></i>
                </span>
                <div class="min-w-0">
                  <span class="font-bold text-slate-800 block text-xs">Comprobante Fiscal Digital (XML)</span>
                  <span class="text-[10px] text-slate-500 block truncate" title="${factura.xmlFileName || 'Sin archivo XML adjunto'}">
                    ${factura.xmlFileName || 'Sin archivo adjunto'}
                  </span>
                </div>
              </div>

              ${hasXml ? `
                <div class="flex items-center gap-1.5">
                  <button type="button" onclick="viewFacturaFile('${est.id}', 'xml')"
                          class="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10.5px] shadow-2xs transition flex items-center gap-1 cursor-pointer"
                          title="Descargar o ver archivo XML del SAT">
                    <i class="fa-solid fa-download"></i> Descargar XML
                  </button>
                  ${!isLocked ? `
                    <button type="button" onclick="removeFacturaFile('${est.id}', 'xml')"
                            class="text-rose-500 hover:text-rose-700 p-1 text-xs cursor-pointer"
                            title="Eliminar XML">
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  ` : ''}
                </div>
              ` : ''}
            </div>

            ${!hasXml && !isLocked ? `
              <label class="w-full border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50 rounded-lg p-2 text-center text-[11px] text-blue-700 font-bold cursor-pointer transition flex items-center justify-center gap-2">
                <i class="fa-solid fa-cloud-arrow-up text-sm"></i>
                <span>Adjuntar Archivo XML</span>
                <input type="file" accept=".xml,text/xml,application/xml" class="hidden"
                       onchange="if(this.files[0]) onFacturaFileUpload('${est.id}', 'xml', this.files[0])">
              </label>
            ` : ''}
          </div>

        </div>

      </div>
    </div>
  `;
}

// =========================================================================
// RENDERIZADO: FICHA EJECUTIVA DE COBRO DE ANTICIPO (ESTIMACIÓN 0)
// =========================================================================
function renderEstimacionZeroViewHTML(data, currencySymbol) {
  const { activeEst, kpis } = data;
  const isLocked = Boolean(activeEst.locked);
  const anticipoKpi = kpis.anticipo;
  const ivaKpi = kpis.iva;

  // Cálculos monetarios del anticipo pactado
  const montoBase = kpis.grandTotalBase;
  const subtotalAnticipo = anticipoKpi.totalContratado;
  const ivaAnticipo = Math.round((subtotalAnticipo * (ivaKpi.pct / 100) + Number.EPSILON) * 100) / 100;
  const totalCobradoAnticipo = Math.round((subtotalAnticipo + ivaAnticipo + Number.EPSILON) * 100) / 100;

  // Métricas de amortización
  const totalRecibido = subtotalAnticipo;
  const amortizadoEnAvance = anticipoKpi.amortizadoTotalHistorico || 0;
  const saldoPendiente = anticipoKpi.saldoPendiente || 0;
  const pctAmortizado = anticipoKpi.pctAmortizado || 0;

  return `
    <div class="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-100 custom-scroll space-y-3">
      
      <!-- Componente de Facturación Fiscal de la Est. 0 -->
      ${renderFacturaCardHTML(activeEst, isLocked)}

      <!-- Tarjeta Principal de la Ficha Ejecutiva -->
      <div class="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
        
        <!-- Cuerpo de Datos y Campos Ejecutivos -->
        <div class="p-4 space-y-4">
          
          <!-- Grid de Métricas Principales -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            <!-- Monto Contratado Base -->
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Monto Contratado Base (Obra)
              </span>
              <div class="text-xl font-black text-slate-800 font-mono">
                ${formatCurrency(montoBase, currencySymbol)}
              </div>
              <span class="text-[10px] text-slate-400 block">
                Total a Costo Directo / Venta del Catálogo Base
              </span>
            </div>

            <!-- Porcentaje y Subtotal de Anticipo -->
            <div class="p-4 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                  Anticipo Pactado
                </span>
                <span class="text-xs font-black text-amber-700 bg-amber-200/80 px-2 py-0.5 rounded-full font-mono">
                  ${anticipoKpi.pct}%
                </span>
              </div>
              <div class="text-xl font-black text-amber-800 font-mono">
                ${formatCurrency(subtotalAnticipo, currencySymbol)}
              </div>
              <span class="text-[10px] text-amber-700 block">
                Subtotal antes de IVA
              </span>
            </div>

            <!-- Importe Total con IVA -->
            <div class="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-1">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-emerald-900 uppercase tracking-wider block">
                  Total Cobrado con IVA (${ivaKpi.pct}%)
                </span>
                <span class="text-[10px] font-bold text-emerald-700 bg-emerald-200/80 px-1.5 py-0.5 rounded">
                  IVA: +${formatCurrency(ivaAnticipo, currencySymbol)}
                </span>
              </div>
              <div class="text-xl font-black text-emerald-800 font-mono">
                ${formatCurrency(totalCobradoAnticipo, currencySymbol)}
              </div>
              <span class="text-[10px] text-emerald-700 block">
                Importe Bruto Depositado por el Cliente
              </span>
            </div>

          </div>

          <!-- Formulario de Configuración del Cobro de Anticipo -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <h3 class="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <i class="fa-solid fa-sliders text-amber-600"></i> Parámetros y Fianza del Anticipo
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              
              <!-- Porcentaje de Anticipo Editable -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">
                  % Anticipo Pactado:
                </label>
                <div class="relative">
                  <input type="number" min="0" max="100" step="any"
                         ${isLocked ? 'disabled readonly' : ''}
                         value="${activeEst.anticipoPct !== undefined ? activeEst.anticipoPct : anticipoKpi.pct}"
                         onchange="onAnticipoZeroFieldChange('anticipoPct', this.value)"
                         class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-amber-500 disabled:bg-slate-100">
                  <span class="absolute right-2.5 top-1.5 text-xs font-bold text-slate-400">%</span>
                </div>
              </div>

              <!-- Fecha de Cobro / Pago -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">
                  Fecha de Cobro / Pago:
                </label>
                <input type="date"
                       ${isLocked ? 'disabled readonly' : ''}
                       value="${activeEst.fechaCobro || activeEst.fechaInicio || ''}"
                       onchange="onAnticipoZeroFieldChange('fechaCobro', this.value)"
                       class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500 disabled:bg-slate-100">
              </div>

              <!-- Póliza de Fianza -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">
                  Póliza de Fianza de Anticipo (Opcional):
                </label>
                <input type="text"
                       ${isLocked ? 'disabled readonly' : ''}
                       value="${activeEst.fianzaPoliza || ''}"
                       onchange="onAnticipoZeroFieldChange('fianzaPoliza', this.value.trim())"
                       placeholder="Ej: FIAN-88912-A"
                       class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-amber-500 disabled:bg-slate-100">
              </div>

              <!-- Afianzadora -->
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">
                  Compañía Afianzadora:
                </label>
                <input type="text"
                       ${isLocked ? 'disabled readonly' : ''}
                       value="${activeEst.fianzaAfianzadora || ''}"
                       onchange="onAnticipoZeroFieldChange('fianzaAfianzadora', this.value.trim())"
                       placeholder="Ej: Afianzadora Aserta..."
                       class="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 disabled:bg-slate-100">
              </div>

            </div>

            <!-- Notas de la Estimación 0 -->
            <div>
              <label class="block text-[11px] font-bold text-slate-700 mb-1">
                Notas / Observaciones del Anticipo:
              </label>
              <textarea ${isLocked ? 'disabled readonly' : ''}
                        rows="2"
                        onchange="onAnticipoZeroFieldChange('notas', this.value.trim())"
                        placeholder="Observaciones de contrato, condiciones del anticipo o entrega de fianza..."
                        class="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-amber-500 disabled:bg-slate-100">${activeEst.notas || ''}</textarea>
            </div>
          </div>

          <!-- MONITOREO EN TIEMPO REAL: BARRA VISUAL DE AMORTIZACIÓN PROGRESIVA -->
          <div class="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white space-y-3.5 shadow-md">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-sm">
                  <i class="fa-solid fa-chart-pie"></i>
                </span>
                <div>
                  <h4 class="text-sm font-black text-white">Monitoreo de Amortización del Anticipo</h4>
                  <span class="text-[11px] text-slate-300">Progreso acumulado a lo largo de las estimaciones de avance físico (Est. 1 a N)</span>
                </div>
              </div>

              <div class="text-right">
                <span class="text-xs text-slate-300 block">Amortizado Total</span>
                <span class="text-lg font-black text-amber-400 font-mono">${pctAmortizado.toFixed(2)}%</span>
              </div>
            </div>

            <!-- Barra de Progreso -->
            <div class="w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700 p-0.5">
              <div class="h-full bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400 rounded-full transition-all duration-500"
                   style="width: ${Math.min(100, Math.max(0, pctAmortizado))}%;"></div>
            </div>

            <!-- Desglose de los 3 valores clave -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-xs">
              <div class="space-y-0.5">
                <span class="text-[10.5px] text-slate-400 block font-bold">1. ANTICIPO TOTAL RECIBIDO:</span>
                <span class="text-sm font-black font-mono text-white">${formatCurrency(totalRecibido, currencySymbol)}</span>
              </div>

              <div class="space-y-0.5">
                <span class="text-[10.5px] text-amber-300 block font-bold">2. AMORTIZADO EN ESTIMACIONES:</span>
                <span class="text-sm font-black font-mono text-amber-400">-${formatCurrency(amortizadoEnAvance, currencySymbol)}</span>
              </div>

              <div class="space-y-0.5">
                <span class="text-[10.5px] text-emerald-300 block font-bold">3. SALDO PENDIENTE POR AMORTIZAR:</span>
                <span class="text-sm font-black font-mono ${saldoPendiente <= 0 ? 'text-emerald-400' : 'text-rose-400'}">
                  ${formatCurrency(saldoPendiente, currencySymbol)} ${saldoPendiente <= 0 ? '🎉 (100% Cubierto)' : ''}
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  `;
}


export function renderEstimacionesView() {
  const container = document.getElementById('view-estimaciones');
  if (!container) return;

  const currencySymbol = state.settings?.currencySymbol || '$';
  const data = getEstimacionesCalculatedData();
  const { activeEst, estimacionesList, rows, kpis } = data;

  // Asegurar que el estilo CSS dinámico esté activo
  applyConceptoColumnWidth(estimacionesConceptoColWidth);

  // Filtrado de filas si hay término de búsqueda
  const term = estimacionesSearchTerm.trim().toLowerCase();

  // Filtrar visibilidad según estado colapsado de partidas y búsqueda
  const visibleRows = [];
  const parentStack = [];

  rows.forEach(r => {
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].level >= r.level) {
      parentStack.pop();
    }

    const isHiddenByParent = parentStack.some(p => estimacionesCollapsedMap[p.id] === true);

    if (r.isParent) {
      parentStack.push(r);
    }

    if (!isHiddenByParent) {
      if (!term || r.clave.toLowerCase().includes(term) || r.descripcion.toLowerCase().includes(term)) {
        visibleRows.push(r);
      }
    }
  });

  const isEstLocked = Boolean(activeEst.locked);
  applyTabLocksToDOM();

  // Renderizado condicional si la estimación activa es la Est. 0 (Anticipo)
  const isEstZero = activeEst.numero === 0 || activeEst.tipo === 'anticipo';

  container.innerHTML = `
    <div id="estimaciones-container" class="flex-1 bg-white rounded-lg shadow border border-slate-200 flex flex-col overflow-hidden transition-all duration-300">
      
      <!-- ENCABEZADO SUPERIOR: ALINEACIÓN PERFECTA SEGÚN INDICACIONES DEL USUARIO -->
      <div class="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col gap-2 shrink-0">
        
        <!-- Fila 1: 3 Bloques (Izquierda: Proyecto/Herramientas, Centro: Fechas Del/Al, Derecha: Grid 2x2 Estimación/Anticipo/IVA) -->
        <div class="flex flex-wrap items-start justify-between gap-3">
          
          <!-- Bloque 1 (Izquierda): Proyecto, Ubicación y Barra de Herramientas -->
          <div class="flex flex-col gap-1.5 flex-1 min-w-[320px]">
            <!-- Renglón 1: Proyecto -->
            <div class="flex items-center gap-1.5 text-xs text-slate-800">
              <span class="font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1 text-[11px] shrink-0">
                <i class="fa-solid fa-folder-tree text-blue-600"></i> PROYECTO:
              </span>
              <span class="font-bold text-xs sm:text-sm text-slate-800 truncate" title="${state.settings?.projectName || 'Proyecto de Obra Base'}">
                ${state.settings?.projectName || 'Proyecto de Obra Base'}
              </span>
              <span class="text-slate-300">•</span>
            </div>

            <!-- Renglón 2: Ubicación -->
            <div class="flex items-center gap-1.5 text-xs text-slate-600">
              <span class="font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1 text-[11px] shrink-0">
                <i class="fa-solid fa-location-dot text-rose-500"></i> UBICACIÓN:
              </span>
              <span class="font-medium text-xs text-slate-700 truncate" title="${state.settings?.projectLocation || 'Ciudad de México, CDMX'}">
                ${state.settings?.projectLocation || 'Ciudad de México, CDMX'}
              </span>
            </div>

            <!-- Renglón 3: Herramientas (Buscador al lado izquierdo, Candado al lado izquierdo de Agrupar, Desagrupar, Imprimir, Sync) -->
            <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
              <!-- Buscador (En el lado izquierdo) -->
              <div class="relative">
                <i class="fa-solid fa-magnifying-glass absolute left-2.5 top-2 text-slate-400 text-[10px]"></i>
                <input type="text" id="estimaciones-search-input" value="${estimacionesSearchTerm}" oninput="onSearchEstimaciones(this.value)" placeholder="Buscar concepto o clave..." class="w-44 sm:w-52 bg-white border border-slate-300 focus:border-blue-500 rounded px-2.5 py-1 pl-6 text-xs text-slate-800 shadow-2xs outline-none transition">
                ${estimacionesSearchTerm ? `
                  <button onclick="onSearchEstimaciones('')" class="absolute right-2 top-1.5 text-slate-400 hover:text-slate-700 text-xs"><i class="fa-solid fa-xmark"></i></button>
                ` : ''}
              </div>

              <!-- Botón Candado de Bloqueo por Estimación (Al lado izquierdo de Agrupar) -->
              <button type="button" onclick="toggleActiveEstimacionLock()" id="btn-lock-estimaciones"
                      class="${isEstLocked ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-700 font-bold' : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium'} text-[11px] p-1.5 rounded flex items-center justify-center shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
                      title="${isEstLocked ? `🔒 ${activeEst.nombre} bloqueada (Solo consulta e impresión) — Haz clic para desbloquear esta estimación` : `Bloquear ${activeEst.nombre} (Permitir solo consulta e impresión en esta estimación)`}">
                <i class="fa-solid ${isEstLocked ? 'fa-lock text-white' : 'fa-lock-open text-slate-600'} text-xs"></i>
              </button>

              <!-- Agrupar -->
              <button type="button" onclick="collapseAllEstimacionesPartidas()" id="btn-agrupar-estimaciones" class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-2xs transition active:scale-95 cursor-pointer" title="Agrupar partidas (Colapsar)">
                <i class="fa-solid fa-layer-group text-xs text-amber-600"></i>
              </button>
              
              <!-- Desagrupar -->
              <button type="button" onclick="expandAllEstimacionesPartidas()" id="btn-desagrupar-estimaciones" class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-2xs transition active:scale-95 cursor-pointer" title="Desagrupar partidas (Expandir todos los conceptos)">
                <i class="fa-solid fa-arrows-split-up-and-left text-xs text-blue-600"></i>
              </button>

              <!-- Imprimir Estimación -->
              <button type="button" onclick="printEstimacionActual()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold shadow-sm transition active:scale-95 cursor-pointer" title="Imprimir Formato de Estimación con Carátula">
                <i class="fa-solid fa-print text-[10px]"></i> <span>Imprimir Estimación</span>
              </button>

              <!-- Indicador Sync -->
              <span class="text-[10px] text-slate-400 hidden xl:flex items-center gap-1 font-sans">
                <i class="fa-solid fa-floppy-disk text-emerald-500"></i> Sincronizado con Catálogo Base
              </span>
            </div>
          </div>

          <!-- Bloque 2 (Centro): Fechas del Período con Logos de Calendario Visibles -->
          <div class="flex flex-col gap-1.5 shrink-0 bg-white p-2 rounded-lg border border-slate-300 shadow-2xs">
            <div class="flex items-center gap-1.5 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 focus-within:border-blue-500 rounded px-2 py-0.5 transition shadow-2xs">
              <span class="text-slate-500 text-[11px] font-sans font-bold w-6">Del</span>
              <button type="button" ${isEstLocked ? 'disabled' : ''}
                      onclick="const inp=this.nextElementSibling; if(inp && !inp.disabled){if(inp.showPicker)inp.showPicker();else inp.focus();}" 
                      class="text-blue-600 hover:text-blue-700 transition cursor-pointer p-0.5 flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed" 
                      title="Abrir selector de fecha">
                <i class="fa-solid fa-calendar-days text-xs text-blue-600"></i>
              </button>
              <input type="date" ${isEstLocked ? 'disabled readonly' : ''}
                     value="${activeEst.fechaInicio || ''}" 
                     onchange="onChangeEstimacionDate('${activeEst.id}', 'fechaInicio', this.value)" 
                     class="estimaciones-date-input bg-transparent border-0 text-xs text-slate-800 font-mono outline-none cursor-pointer w-32 disabled:opacity-60 disabled:cursor-not-allowed">
            </div>
            <div class="flex items-center gap-1.5 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 focus-within:border-blue-500 rounded px-2 py-0.5 transition shadow-2xs">
              <span class="text-slate-500 text-[11px] font-sans font-bold w-6">al</span>
              <button type="button" ${isEstLocked ? 'disabled' : ''}
                      onclick="const inp=this.nextElementSibling; if(inp && !inp.disabled){if(inp.showPicker)inp.showPicker();else inp.focus();}" 
                      class="text-blue-600 hover:text-blue-700 transition cursor-pointer p-0.5 flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed" 
                      title="Abrir selector de fecha">
                <i class="fa-solid fa-calendar-days text-xs text-blue-600"></i>
              </button>
              <input type="date" ${isEstLocked ? 'disabled readonly' : ''}
                     value="${activeEst.fechaFin || ''}" 
                     onchange="onChangeEstimacionDate('${activeEst.id}', 'fechaFin', this.value)" 
                     class="estimaciones-date-input bg-transparent border-0 text-xs text-slate-800 font-mono outline-none cursor-pointer w-32 disabled:opacity-60 disabled:cursor-not-allowed">
            </div>
          </div>

          <!-- Bloque 3 (Derecha): 2 Filas de Botones Limpios y Perfectamente Alineados -->
          <div class="flex flex-col gap-2 w-auto shrink-0">
            
            <!-- Fila 1: Estimación + + Nueva Estimación + Asignar -->
            <div class="flex items-center gap-2 justify-end">
              <!-- Selector Desplegable de Estimación -->
              <div class="bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs flex items-center justify-between gap-1.5 min-w-[210px]">
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                  <i class="fa-solid fa-file-invoice-dollar text-blue-600 text-xs shrink-0"></i>
                  <span class="text-[11px] font-bold text-slate-700 shrink-0">Estimación:</span>
                  <select onchange="onSwitchActiveEstimacion(this.value)" class="w-full bg-transparent text-slate-800 font-bold text-xs outline-none cursor-pointer font-mono truncate">
                    ${estimacionesList.map(est => `
                      <option value="${est.id}" ${est.id === activeEst.id ? 'selected' : ''}>
                        ${est.locked ? '🔒 ' : ''}${est.numero === 0 ? '💰 ' : ''}${est.nombre}
                      </option>
                    `).join('')}
                  </select>
                </div>
              </div>

              <!-- Botón Nueva Estimación y Eliminar -->
              <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" onclick="promptCreateNewEstimacion()" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1 shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap" title="Crear nueva estimación consecutiva">
                  <i class="fa-solid fa-plus text-[10px]"></i> <span>+ Nueva Estimación</span>
                </button>

                ${(activeEst.numero > 0 && estimacionesList.filter(e => e.numero > 0).length > 1) ? `
                  <button type="button" ${isEstLocked ? 'disabled' : ''} onclick="confirmDeleteCurrentEstimacion('${activeEst.id}', '${activeEst.nombre}')" class="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs p-1.5 rounded-lg transition active:scale-95 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed" title="${isEstLocked ? 'Estimación bloqueada: desbloquee el candado para poder eliminarla' : `Eliminar ${activeEst.nombre}`}">
                    <i class="fa-solid fa-trash text-xs"></i>
                  </button>
                ` : ''}
              </div>

              <!-- Botón Asignar (Al lado de + Nueva Estimación) -->
              <div id="tab-members-estimaciones" class="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-0.5 shadow-2xs shrink-0">
                <div id="tab-avatars-estimaciones" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('estimaciones')" title="Ver colaboradores con acceso a Estimaciones"></div>
                <button type="button" onclick="openTabMembersAssignModal('estimaciones')" class="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded px-2 py-1 transition flex items-center gap-1.5 cursor-pointer" title="Asignar miembros invitados a la pestaña Estimaciones">
                  <i class="fa-solid fa-user-gear text-[10px]"></i> Asignar
                </button>
              </div>
            </div>

            <!-- Fila 2: % Anticipo + % IVA (alineados con Fila 1) -->
            <div class="flex items-center gap-2 justify-end">
              <!-- Recuadro % Anticipo -->
              <div class="bg-white border border-slate-300 hover:border-amber-400 px-2.5 py-1 rounded-lg shadow-2xs text-xs transition flex items-center justify-between gap-1.5 min-w-[210px]">
                <div class="flex items-center gap-1 text-amber-600 font-bold shrink-0">
                  <i class="fa-solid fa-hand-holding-dollar text-xs"></i>
                  <span class="text-[11px] uppercase tracking-wider text-slate-700">% Anticipo:</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <input type="number" ${isEstLocked ? 'disabled readonly' : ''}
                         min="0" 
                         max="100" 
                         step="any" 
                         value="${kpis.anticipo.pct}" 
                         onchange="onEstimacionesAnticipoInput(this.value)" 
                         class="w-14 text-center font-mono font-bold text-xs text-amber-800 bg-slate-50 border border-slate-200 hover:border-amber-400 focus:bg-white focus:border-amber-500 rounded px-1 py-0.5 outline-none cursor-text transition disabled:opacity-60 disabled:cursor-not-allowed">
                  <span class="font-bold text-slate-600">%</span>
                  <span class="text-[10px] text-slate-500 font-mono font-bold ml-0.5">
                    (${formatCurrency(kpis.anticipo.totalContratado, currencySymbol)})
                  </span>
                </div>
              </div>

              <!-- Recuadro % IVA -->
              <div class="bg-white border border-slate-300 hover:border-blue-400 px-2.5 py-1 rounded-lg shadow-2xs text-xs transition flex items-center justify-between gap-1.5 min-w-[210px]">
                <div class="flex items-center gap-1 text-blue-600 font-bold shrink-0">
                  <i class="fa-solid fa-receipt text-xs"></i>
                  <span class="text-[11px] uppercase tracking-wider text-slate-700">% IVA:</span>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <input type="number" ${isEstLocked ? 'disabled readonly' : ''}
                         min="0" 
                         max="100" 
                         step="any" 
                         value="${kpis.iva.pct}" 
                         onchange="onEstimacionesIvaInput(this.value)" 
                         class="w-14 text-center font-mono font-bold text-xs text-blue-800 bg-slate-50 border border-slate-200 hover:border-blue-400 focus:bg-white focus:border-blue-500 rounded px-1 py-0.5 outline-none cursor-text transition disabled:opacity-60 disabled:cursor-not-allowed"
                         title="Porcentaje de IVA aplicable">
                  <span class="font-bold text-slate-600">%</span>
                  <span class="text-[10px] text-slate-500 font-mono font-bold ml-0.5">
                    (${formatCurrency(kpis.iva.totalContratado, currencySymbol)})
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

        <!-- Fila 2: Sub-encabezado limpio con Título a la izquierda y Botones de Factura / Estado a la derecha -->
        <div class="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/60 flex-wrap">
          <!-- Izquierda: Título de Estimación Activa -->
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-extrabold text-slate-800 text-xs uppercase tracking-wide">
              ${activeEst.numero === 0 ? 'FICHA DE COBRO: ANTICIPO INICIAL' : `ESTIMACIÓN DE OBRA: ${activeEst.nombre.toUpperCase()}`}
            </span>
            ${activeEst.numero > 0 ? `
              <span class="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold">
                ${visibleRows.length} items
              </span>
            ` : `
              <span class="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold font-mono">
                Anticipo ${kpis.anticipo.pct}%
              </span>
            `}
            ${isEstLocked ? `
              <span class="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1" title="Esta estimación tiene activado el candado: solo se puede consultar e imprimir">
                <i class="fa-solid fa-lock text-[9px]"></i> Bloqueada (Solo consulta e impresión)
              </span>
            ` : ''}
          </div>

          <!-- Derecha: Botón Factura / Subir Factura + PENDIENTE DE PAGO (Exactamente como en el diseño) -->
          <div class="ml-auto flex items-center gap-2 flex-wrap justify-end">
            ${(activeEst.factura?.pdfUrl || activeEst.factura?.pdfFileRef || activeEst.factura?.xmlUrl || activeEst.factura?.xmlFileRef) ? `
              <!-- Si ya se subió la factura: Botón que abre el modal flotante para verla, sustituirla o eliminarla -->
              <button type="button" onclick="openFacturaModal('${activeEst.id}')"
                      class="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-2xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      title="Ver factura, cambiarla o eliminarla">
                <i class="fa-solid fa-file-invoice text-xs"></i>
                <span>Ver / Gestionar Factura</span>
              </button>
            ` : `
              <!-- Si NO se ha subido factura: Botón directo para subirla -->
              <label class="px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-2xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                     title="Subir Factura PDF o XML de esta ${activeEst.numero === 0 ? 'apertura de anticipo' : 'estimación'}">
                <i class="fa-solid fa-cloud-arrow-up text-xs"></i>
                <span>Subir Factura</span>
                <input type="file" accept="application/pdf,.xml,text/xml" class="hidden"
                       onchange="if(this.files[0]) {
                         const f = this.files[0];
                         const type = f.name.toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
                         onFacturaFileUpload('${activeEst.id}', type, f).then(() => openFacturaModal('${activeEst.id}'));
                       }">
              </label>
            `}

            <!-- Botón Estado de Cobro (Alterna entre Pendiente y Cobrada con un solo clic) -->
            <button type="button" onclick="toggleEstimacionCobroStatus('${activeEst.id}')"
                    class="px-3 py-1 rounded-lg text-xs font-bold tracking-wide flex items-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer whitespace-nowrap ${activeEst.factura?.status === 'cobrada' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'}"
                    title="Haz clic para alternar entre Pendiente de Pago y Cobrada / Pagada">
              <i class="fa-solid ${activeEst.factura?.status === 'cobrada' ? 'fa-circle-check text-emerald-600' : 'fa-clock text-amber-600'}"></i>
              <span>${activeEst.factura?.status === 'cobrada' ? 'COBRADA / PAGADA' : 'PENDIENTE DE PAGO'}</span>
            </button>
          </div>
        </div>

      </div>

      ${isEstZero ? `
        <!-- VISTA EXCLUSIVA: FICHA EJECUTIVA DE COBRO DE ANTICIPO (EST. 0) -->
        ${renderEstimacionZeroViewHTML(data, currencySymbol)}
      ` : `
        <!-- VISTA DE ESTIMACIÓN DE AVANCE FÍSICO (EST. 1 A N) -->
        <div class="flex-1 flex flex-col overflow-hidden bg-slate-50">
          
          <!-- Bloque de Comprobantes Fiscales por Estimación -->
          <div class="p-2 sm:px-3.5 sm:pt-2.5 sm:pb-1">
            ${renderFacturaCardHTML(activeEst, isEstLocked)}
          </div>

          <!-- TABLA DE GENERADORES Y ESTIMACIONES CON ENCABEZADOS EN COLORES FUERTES Y LETRAS BLANCAS -->
          <div class="flex-1 overflow-auto bg-white custom-scroll calendario-premiere-scroll relative" id="estimaciones-table-container">
        <!-- Línea guía vertical interactiva a todo lo largo de la columna al redimensionar -->
        <div id="estimaciones-resizer-guide-line" class="hidden absolute top-0 bottom-0 w-0.5 bg-blue-500 shadow-md z-40 pointer-events-none transition-opacity"></div>

        <table id="estimaciones-main-table" class="w-full text-left text-[11px] border-collapse min-w-[940px]">
          
          <!-- Encabezado de Dos Niveles en Colores Fuertes con Letras Blancas en UNA SOLA LÍNEA (TEXTOS COMPACTOS) -->
          <thead class="sticky top-0 z-20 shadow-md select-none text-white whitespace-nowrap">
            
            <!-- Nivel 1: Agrupadores Principales en Colores Sólidos Fuertes (TODO EN UNA SOLA LÍNEA) -->
            <tr class="text-[9px] uppercase tracking-wider font-extrabold text-white whitespace-nowrap">
              <!-- 1. Catálogo y Concepto: Gris Oscuro / Slate-800 (Fijo con botones de ajuste rápido) -->
              <th colspan="3" class="py-1.5 px-2 text-center border-r-2 border-slate-700 bg-slate-800 text-white whitespace-nowrap select-none sticky left-0 z-35 col-estimaciones-header-cat" title="Catálogo y Concepto de Obra (Fijo)">
                <div class="flex items-center justify-center gap-1.5 px-1">
                  <span>CATÁLOGO Y CONCEPTO DE OBRA</span>
                  <div class="inline-flex items-center gap-0.5 bg-slate-700/80 rounded px-1 py-0.5 text-[8.5px] opacity-80 hover:opacity-100 transition">
                    <button type="button" onclick="adjustConceptoColumnWidth(-30)" class="hover:text-blue-300 px-1 cursor-pointer font-mono font-bold" title="Reducir ancho de Catálogo y Concepto">-</button>
                    <button type="button" onclick="resetConceptoColumnWidth()" class="hover:text-blue-300 px-1 cursor-normal text-[8px]" title="Restablecer ancho a 310px">↔</button>
                    <button type="button" onclick="adjustConceptoColumnWidth(30)" class="hover:text-blue-300 px-1 cursor-pointer font-mono font-bold" title="Aumentar ancho de Catálogo y Concepto">+</button>
                  </div>
                </div>
              </th>

              <!-- 2. Presupuesto Base: Azul Fuerte Corporativo / Blue-700 (Una sola línea) -->
              <th colspan="3" class="py-1.5 px-1.5 text-center border-r-2 border-blue-900 bg-blue-700 text-white whitespace-nowrap" title="Presupuesto Base Contratado">
                <i class="fa-solid fa-file-contract mr-1 text-blue-200"></i>PRESUPUESTO BASE CONTRATADO
              </th>

              <!-- 3. Acumulado Anterior: Morado / Púrpura Fuerte / Purple-800 (Una sola línea) -->
              <th colspan="2" class="py-1.5 px-1.5 text-center border-r-2 border-purple-950 bg-purple-800 text-white whitespace-nowrap" title="Acumulado Anterior (Reflejado)">
                <i class="fa-solid fa-clock-rotate-left mr-1 text-purple-200"></i>ACUMULADO ANTERIOR (REFLEJADO)
              </th>

              <!-- 4. Esta Estimación: Verde Esmeralda Fuerte / Emerald-700 (Una sola línea) -->
              <th colspan="2" class="py-1.5 px-1.5 text-center border-r-2 border-emerald-900 bg-emerald-700 text-white font-black whitespace-nowrap" title="Esta Estimación (Actual)">
                <i class="fa-solid fa-pencil mr-1 text-emerald-200"></i>ESTA ESTIMACIÓN (ACTUAL)
              </th>

              <!-- 5. Acumulado al Corte: Cyan / Azul Marino Profundo / Cyan-800 (Una sola línea) -->
              <th colspan="3" class="py-1.5 px-1.5 text-center border-r-2 border-cyan-950 bg-cyan-800 text-white font-extrabold whitespace-nowrap" title="Acumulado al Corte">
                <i class="fa-solid fa-chart-line mr-1 text-cyan-200"></i>ACUMULADO AL CORTE
              </th>

              <!-- 6. Saldo por Ejecutar: Ámbar / Bronce Fuerte / Amber-700 (Una sola línea) -->
              <th colspan="2" class="py-1.5 px-1.5 text-center bg-amber-700 text-white font-extrabold whitespace-nowrap" title="Saldo por Ejecutar">
                <i class="fa-solid fa-coins mr-1 text-amber-200"></i>SALDO POR EJECUTAR
              </th>
            </tr>

            <!-- Nivel 2: Columnas Específicas Coordinadas en Tonos Sólidos con Letras Blancas (TEXTOS MÁS CHICOS) -->
            <tr class="text-[8.5px] font-bold text-white uppercase border-b-2 border-slate-400 whitespace-nowrap select-none">
              <!-- Catálogo: CLAVE (Fija en la columna izquierda) -->
              <th class="py-1.5 px-1 text-center border-r border-slate-700 bg-slate-750 bg-[#27354a] text-white whitespace-nowrap sticky top-[28px] z-35 col-estimaciones-clave">CLAVE</th>
              
              <!-- Catálogo: DESCRIPCIÓN DEL CONCEPTO -->
              <th class="py-1.5 px-2 border-r border-slate-700 bg-slate-750 bg-[#27354a] text-white whitespace-nowrap col-estimaciones-concepto select-none sticky top-[28px] z-35" title="Descripción del Concepto de Obra">
                <div class="flex items-center justify-between">
                  <span>DESCRIPCIÓN DEL CONCEPTO</span>
                  <span class="text-[7.5px] text-slate-300 font-normal opacity-70">↕ Justificado</span>
                </div>
              </th>

              <!-- Catálogo: UNID (con botón/manija en su lado derecho para arrastrar hacia los lados) -->
              <th id="estimaciones-th-unid" class="py-1.5 pl-1.5 pr-3.5 text-center border-r-2 border-slate-400 bg-slate-750 bg-[#27354a] text-white whitespace-nowrap relative select-none sticky top-[28px] z-35 col-estimaciones-unid shadow-[4px_0_8px_-2px_rgba(0,0,0,0.18)]" title="Unidad de Medida">
                <span>UNID</span>
                <!-- Manija Vertical de Ajuste de Columna al lado derecho de UNID -->
                <div id="estimaciones-resizer-handle-n2" class="absolute right-0 top-0 bottom-0 w-2.5 hover:w-3 bg-slate-600/70 hover:bg-blue-500 active:bg-blue-400 cursor-col-resize flex items-center justify-center transition-all z-30 group" title="Arrastra hacia los lados para agrandar o achicar Catálogo y Concepto de Obra">
                  <div class="w-0.5 h-3 bg-white/70 group-hover:bg-white rounded-full"></div>
                </div>
              </th>
              
              <!-- Presupuesto Base -->
              <th class="py-1.5 px-1 min-w-[50px] text-right border-r border-blue-800 bg-blue-800 text-white whitespace-nowrap" title="Cant Base">CANT BASE</th>
              <th class="py-1.5 px-1 min-w-[58px] text-right border-r border-blue-800 bg-blue-800 text-white whitespace-nowrap" title="Precio Unitario contratado (Solo lectura)">P.U. ($)</th>
              <th class="py-1.5 px-1.5 min-w-[70px] text-right border-r-2 border-blue-900 bg-blue-850 bg-[#173fa8] text-white font-extrabold whitespace-nowrap" title="Importe base contratado (Solo lectura)">IMPORTE BASE ($)</th>

              <!-- Acumulado Anterior -->
              <th class="py-1.5 px-1 min-w-[50px] text-right border-r border-purple-850 bg-purple-850 bg-[#581c87] text-white whitespace-nowrap" title="Cant Ant">CANT ANT</th>
              <th class="py-1.5 px-1.5 min-w-[70px] text-right border-r-2 border-purple-950 bg-purple-900 text-white font-extrabold whitespace-nowrap" title="Total Ant ($)">TOTAL ANT ($)</th>

              <!-- Esta Estimación (Zona de Captura) -->
              <th class="py-1.5 px-1.5 min-w-[58px] text-center border-r border-emerald-800 bg-emerald-800 text-white font-black whitespace-nowrap" title="CANT EJE">
                <span class="whitespace-nowrap"><i class="fa-solid fa-pencil text-[8px] text-emerald-200 mr-1"></i>CANT EJE</span>
              </th>
              <th class="py-1.5 px-1.5 min-w-[70px] text-right border-r-2 border-emerald-900 bg-emerald-850 bg-[#065f46] text-white font-black whitespace-nowrap" title="TOTAL EJE ($)">
                TOTAL EJE ($)
              </th>

              <!-- Acumulado Actual -->
              <th class="py-1.5 px-1 min-w-[50px] text-right border-r border-cyan-850 bg-cyan-850 bg-[#155e75] text-white whitespace-nowrap" title="Cant Acum">CANT ACUM</th>
              <th class="py-1.5 px-1.5 min-w-[70px] text-right border-r border-cyan-850 bg-cyan-850 bg-[#155e75] text-white font-extrabold whitespace-nowrap" title="Total Acum ($)">TOTAL ACUM ($)</th>
              <th class="py-1.5 px-1 min-w-[48px] text-center border-r-2 border-cyan-950 bg-cyan-900 text-white font-black whitespace-nowrap" title="% AVANCE">% AVANCE</th>

              <!-- Saldo Restante -->
              <th class="py-1.5 px-1 min-w-[50px] text-right border-r border-amber-800 bg-amber-800 text-white whitespace-nowrap" title="Cant Saldo">CANT SALDO</th>
              <th class="py-1.5 px-1.5 min-w-[70px] text-right bg-amber-850 bg-[#92400e] text-white font-black whitespace-nowrap" title="SALDO ($)">SALDO ($)</th>
            </tr>

          </thead>

          <!-- Cuerpo con Renglones de Partidas y Conceptos Diferenciados por Apartado con TEXTO JUSTIFICADO Y COMPACTO -->
          <tbody class="divide-y divide-slate-100 font-mono text-[11px]">
            ${visibleRows.map(row => {
              const isSelectedRow = String(selectedEstimacionRowId) === String(row.id);
              if (row.isParent) {
                const isLevel1 = row.level === 1;
                const indentPx = (row.level - 1) * 12 + 8;
                const isCollapsed = estimacionesCollapsedMap[row.id] === true;

                return `
                  <tr data-est-row="${row.id}" onclick="selectEstimacionRow('${row.id}', event)" onfocusin="selectEstimacionRow('${row.id}', event)" class="${isLevel1 ? 'bg-slate-50/90 font-bold text-slate-800 border-y-2 border-slate-200' : 'bg-slate-50/60 font-semibold text-slate-800 border-y border-slate-200'} ${isSelectedRow ? 'selected-row' : 'hover:bg-slate-100'} cursor-pointer transition select-none">
                    <td class="py-1 px-1 text-center text-blue-700 font-mono font-bold text-[10.5px] sticky z-15 bg-slate-50 border-r border-slate-200 col-estimaciones-clave">${row.clave || '1'}</td>
                    
                    <td class="py-1 px-2 uppercase tracking-wide font-sans text-[11px] sticky z-15 bg-slate-50 border-r border-slate-200 col-estimaciones-concepto" style="padding-left: ${indentPx}px">
                      <div class="flex items-start gap-1 min-w-0">
                        <button type="button" onclick="toggleEstimacionesGroup('${row.id}')" class="w-4 h-4 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 inline-flex items-center justify-center transition cursor-pointer shrink-0 mt-0.5" title="${isCollapsed ? 'Desagrupar partida (mostrar conceptos)' : 'Agrupar partida (ocultar conceptos)'}">
                          <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} text-[9px]"></i>
                        </button>
                        <span class="estimaciones-concepto-desc flex-1 ${isLevel1 ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}" style="text-align: justify; text-justify: inter-word;">${row.descripcion}</span>
                        <span class="ml-1 shrink-0 self-center">${renderPartidaNivel1ChatButton(row.id, row.clave, row.descripcion)}</span>
                        ${isCollapsed ? `<span class="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[8.5px] font-mono border border-blue-200 ml-1.5 shrink-0 font-normal self-center whitespace-nowrap">Agrupado (${row.descendantCount} conc.)</span>` : ''}
                      </div>
                    </td>
                    <td class="py-1 px-1 text-center text-[9px] text-slate-400 border-r-2 border-slate-400 bg-slate-100 sticky z-15 col-estimaciones-unid shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">---</td>

                    <!-- Presupuesto Base de partida (Diferenciado con fondo celeste muy sutil) -->
                    <td class="py-1 px-1 text-center text-[9px] text-slate-300 bg-blue-50/15">---</td>
                    <td class="py-1 px-1 text-center text-[9px] text-slate-300 bg-blue-50/15">---</td>
                    <td class="py-1 px-1.5 text-right font-bold text-slate-900 bg-blue-50/25 border-r-2 border-blue-100 whitespace-nowrap text-[11px]">${formatCurrency(row.importeBase, currencySymbol)}</td>

                    <!-- Acumulado Anterior de partida (Diferenciado con fondo violeta muy sutil) -->
                    <td class="py-1 px-1 text-center text-[9px] text-slate-300 bg-purple-50/15">---</td>
                    <td class="py-1 px-1.5 text-right font-bold text-purple-900 bg-purple-50/25 border-r-2 border-purple-100 whitespace-nowrap text-[11px]">${formatCurrency(row.importeAnt, currencySymbol)}</td>

                    <!-- Esta Estimación de partida (Diferenciado con fondo verde esmeralda) -->
                    <td class="py-1 px-1 text-center text-[9px] text-emerald-400 bg-emerald-50/30">---</td>
                    <td id="est-part-tot-eje-${row.id}" class="py-1 px-1.5 text-right font-black text-emerald-700 bg-emerald-50/40 border-r-2 border-emerald-200 whitespace-nowrap text-[11px]">${formatCurrency(row.totalEje, currencySymbol)}</td>

                    <!-- Acumulado Actual de partida (Diferenciado con fondo cyan muy sutil) -->
                    <td class="py-1 px-1 text-center text-[9px] text-slate-300 bg-cyan-50/15">---</td>
                    <td id="est-part-tot-acum-${row.id}" class="py-1 px-1.5 text-right font-bold text-slate-900 bg-cyan-50/20 whitespace-nowrap text-[11px]">${formatCurrency(row.totalAcum, currencySymbol)}</td>
                    <td id="est-part-pct-acum-${row.id}" class="py-1 px-1 text-center text-[10.5px] font-bold text-blue-700 bg-cyan-50/25 border-r-2 border-cyan-100 whitespace-nowrap">${row.pctAvanceAcum.toFixed(1)}%</td>

                    <!-- Saldo de partida (Diferenciado con fondo ámbar muy sutil) -->
                    <td class="py-1 px-1 text-center text-[9px] text-slate-300 bg-amber-50/15">---</td>
                    <td id="est-part-tot-saldo-${row.id}" class="py-1 px-1.5 text-right font-bold text-amber-800 bg-amber-50/25 whitespace-nowrap text-[11px]">${formatCurrency(row.totalSaldo, currencySymbol)}</td>
                  </tr>
                `;
              } else {
                const indentPx = (row.level - 1) * 12 + 14;

                return `
                  <tr data-est-row="${row.id}" onclick="selectEstimacionRow('${row.id}', event)" onfocusin="selectEstimacionRow('${row.id}', event)" class="${isSelectedRow ? 'selected-row' : 'hover:bg-blue-50/40'} text-[11px] cursor-pointer transition bg-white">
                    <td class="py-1 px-1 text-center font-mono text-blue-600 font-bold text-[10.5px] sticky z-15 bg-white border-r border-slate-100 col-estimaciones-clave">${row.clave}</td>
                    
                    <!-- TEXTO DE CONCEPTOS JUSTIFICADO Y COLUMNA REDIMENSIONABLE (COMPACTO Y FIJO A LA IZQUIERDA) -->
                    <td class="py-1 px-2 text-slate-800 font-normal font-sans text-[11px] sticky z-15 bg-white border-r border-slate-100 col-estimaciones-concepto" style="padding-left: ${indentPx}px">
                      <div class="flex items-start gap-1.5 min-w-0">
                        <span class="w-1.5 h-1.5 rounded-full mt-1 shrink-0" style="background-color: ${row.color.bar};"></span>
                        <span class="estimaciones-concepto-desc flex-1 text-slate-800 font-sans" style="text-align: justify; text-justify: inter-word;">${row.descripcion}</span>
                        <span class="ml-1 shrink-0 self-center">${renderPartidaNivel1ChatButton(row.id, row.clave, row.descripcion)}</span>
                      </div>
                    </td>

                    <td class="py-1 px-1 text-center text-slate-600 font-mono text-[10px] border-r-2 border-slate-400 sticky z-15 col-estimaciones-unid bg-slate-50 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">${row.unidad}</td>
                    
                    <!-- Presupuesto Base (Fondo azul celeste muy suave) -->
                    <td class="py-1 px-1 text-right font-mono text-slate-600 bg-blue-50/10 whitespace-nowrap text-[11px]">${formatNumber(row.cantBase, 2)}</td>
                    <td class="py-1 px-1 text-right font-mono text-slate-600 bg-blue-50/10 whitespace-nowrap text-[11px]">${formatCurrency(row.pu, currencySymbol)}</td>
                    <td class="py-1 px-1.5 min-w-[70px] text-right font-mono font-bold text-slate-900 bg-blue-50/20 border-r-2 border-blue-100 whitespace-nowrap text-[11px]">${formatCurrency(row.importeBase, currencySymbol)}</td>

                    <!-- Acumulado Anterior (Fondo violeta muy suave) -->
                    <td class="py-1 px-1 text-right font-mono bg-purple-50/10 whitespace-nowrap text-[11px] ${row.cantAnt > 0 ? 'text-purple-900 font-semibold' : 'text-slate-400'}">
                      ${formatNumber(row.cantAnt, 2)}
                    </td>
                    <td class="py-1 px-1.5 min-w-[70px] text-right font-mono bg-purple-50/20 border-r-2 border-purple-100 whitespace-nowrap text-[11px] ${row.importeAnt > 0 ? 'text-purple-900 font-bold' : 'text-slate-400'}">
                      ${formatCurrency(row.importeAnt, currencySymbol)}
                    </td>

                    <!-- Esta Estimación (Zona de Captura con Verde Esmeralda + Enlaces de Fotos Nube) -->
                    <td class="py-0.5 px-1 text-center bg-emerald-50/40 border-r border-emerald-200">
                      <div class="flex items-center justify-center gap-1">
                        <input type="text" 
                               inputmode="decimal"
                               ${isEstLocked ? 'disabled readonly' : ''}
                               data-est-cant-input="${row.id}"
                               value="${row.cantEje > 0 ? Number(row.cantEje).toFixed(2) : ''}" 
                               placeholder="0.00"
                               oninput="onEstimacionCantEjeInput('${row.id}', this.value, this)"
                               onblur="onEstimacionCantEjeBlur('${row.id}', this)"
                               onchange="onEstimacionCantEjeBlur('${row.id}', this)"
                               onkeydown="if(event.key==='Enter'){event.preventDefault(); onEstimacionCantEjeBlur('${row.id}', this); const list=Array.from(document.querySelectorAll('[data-est-cant-input]')); const i=list.indexOf(this); if(i>=0 && list[i+1]) list[i+1].focus(); else this.blur();}"
                               class="w-full min-w-[44px] text-center font-mono font-bold text-[11px] text-emerald-800 bg-white border border-emerald-300 focus:border-emerald-600 focus:bg-emerald-50/50 rounded px-1 py-0.5 outline-none transition shadow-2xs disabled:opacity-65 disabled:cursor-not-allowed">
                        <button type="button"
                                onclick="openEstimacionConceptPhotosModal('${row.id}')"
                                title="${(row.fotos && row.fotos.length > 0) ? `${row.fotos.length} foto(s) de evidencia adjunta(s)` : 'Subir o vincular 1 o 2 fotos de evidencia (AWS S3)'}"
                                class="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[9.5px] font-bold transition cursor-pointer ${(row.fotos && row.fotos.length > 0) ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-700 shadow-2xs' : 'bg-white hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 border-slate-300 hover:border-indigo-300'}">
                          <i class="fa-solid fa-camera text-[9.5px]"></i>
                          ${(row.fotos && row.fotos.length > 0) ? `<span class="font-mono leading-none">${row.fotos.length}</span>` : ''}
                        </button>
                      </div>
                    </td>
                    <td id="est-cell-tot-eje-${row.id}" class="py-1 px-1.5 min-w-[70px] text-right font-mono font-black bg-emerald-50/50 border-r-2 border-emerald-300 whitespace-nowrap text-[11px] ${row.totalEje > 0 ? 'text-emerald-700' : 'text-slate-400'}">
                      ${formatCurrency(row.totalEje, currencySymbol)}
                    </td>

                    <!-- Acumulado Actual (Fondo cyan muy suave) -->
                    <td id="est-cell-cant-acum-${row.id}" class="py-1 px-1 text-right font-mono bg-cyan-50/10 whitespace-nowrap text-[11px] ${row.cantAcum > 0 ? 'text-cyan-900 font-semibold' : 'text-slate-400'}">
                      ${formatNumber(row.cantAcum, 2)}
                    </td>
                    <td id="est-cell-tot-acum-${row.id}" class="py-1 px-1.5 min-w-[70px] text-right font-mono font-bold text-slate-800 bg-cyan-50/20 whitespace-nowrap text-[11px]">
                      ${formatCurrency(row.totalAcum, currencySymbol)}
                    </td>
                    <td id="est-cell-pct-acum-${row.id}" class="py-1 px-1 text-center font-mono font-bold text-[10.5px] bg-cyan-50/25 border-r-2 border-cyan-200 whitespace-nowrap ${row.pctAvanceAcum >= 100 ? 'text-emerald-700 font-black' : row.pctAvanceAcum > 0 ? 'text-blue-700' : 'text-slate-400'}">
                      ${row.pctAvanceAcum.toFixed(1)}%
                    </td>

                    <!-- Saldo Restante (Fondo ámbar muy suave) -->
                    <td id="est-cell-cant-saldo-${row.id}" class="py-1 px-1 text-right font-mono bg-amber-50/15 whitespace-nowrap text-[11px] ${row.cantSaldo <= 0 ? 'text-slate-400' : 'text-slate-600'}">
                      ${formatNumber(row.cantSaldo, 2)}
                    </td>
                    <td id="est-cell-tot-saldo-${row.id}" class="py-1 px-1.5 min-w-[70px] text-right font-mono font-bold bg-amber-50/25 whitespace-nowrap text-[11px] ${row.totalSaldo <= 0 ? 'text-slate-400' : 'text-amber-800'}">
                      ${formatCurrency(row.totalSaldo, currencySymbol)}
                    </td>
                  </tr>
                `;
              }
            }).join('')}
          </tbody>

          <!-- TOTALES INFERIORES: RECTÁNGULO BLANCO CON LÍNEA GRIS GRUESA ENCABEZANDO SEGÚN INDICACIÓN DEL USUARIO -->
          <tfoot id="estimaciones-tfoot" class="bg-white text-slate-800 font-mono sticky bottom-0 z-20 shadow-2xl divide-y divide-slate-200 text-[11px] border-t-[6px] border-slate-500" style="box-shadow: 0 -6px 0 0 #64748b, 0 -12px 24px -4px rgba(0, 0, 0, 0.12);">
            ${renderEstimacionesTfootContentHTML(kpis, currencySymbol)}
          </tfoot>

        </table>
      </div>

      <!-- SECCIÓN DE DESPLAZAMIENTO HORIZONTAL EXCLUSIVA AL LADO DERECHO DE "CATÁLOGO Y CONCEPTO DE OBRA" -->
      <div id="estimaciones-displacement-bar" class="h-7 bg-slate-100 border-t border-slate-300 flex items-center select-none shrink-0 z-25">
        <!-- Espacio izquierdo sincronizado exactamente con el ancho de Catálogo y Concepto de Obra (Clave + Concepto + Unid) -->
        <div id="estimaciones-displacement-left-spacer" class="h-full bg-slate-200/80 border-r-2 border-slate-400 px-2.5 flex items-center justify-between text-[10px] text-slate-600 font-mono shrink-0 estimaciones-fixed-left-width">
          <span class="truncate font-semibold flex items-center gap-1.5" title="Columna fija: Catálogo y Concepto de Obra">
            <i class="fa-solid fa-thumbtack text-blue-600 text-[9px]"></i> Catálogo y Concepto Fijo
          </span>
          <span class="text-slate-400 text-[9px]">→</span>
        </div>

        <!-- Sección Derecha: Barra de Desplazamiento al lado derecho de Catálogo y Concepto de Obra -->
        <div id="estimaciones-displacement-right-zone" class="flex-1 h-full px-2 flex items-center gap-2 min-w-0 bg-slate-50">
          <button type="button"
                  id="estimaciones-scroll-btn-left"
                  onclick="scrollEstimacionesTableStep(-1)"
                  class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0"
                  title="Desplazar columnas numéricas hacia la izquierda (◀)">
            <i class="fa-solid fa-chevron-left"></i>
          </button>

          <div id="estimaciones-scroll-track"
               class="flex-1 h-4 bg-slate-200/90 hover:bg-slate-300/80 rounded-full border border-slate-300 relative cursor-pointer overflow-hidden shadow-inner flex items-center"
               title="Haz clic o arrastra para desplazar las secciones a la derecha de Catálogo y Concepto de Obra">
            <div id="estimaciones-scroll-thumb"
                 class="absolute h-3 rounded-full bg-slate-500 hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-2xs flex items-center justify-center gap-0.5 cursor-grab"
                 style="left: 0px; width: 35%;">
              <span class="w-0.5 h-1.5 bg-white/80 rounded-full pointer-events-none"></span>
              <span class="w-0.5 h-1.5 bg-white/80 rounded-full pointer-events-none"></span>
              <span class="w-0.5 h-1.5 bg-white/80 rounded-full pointer-events-none"></span>
            </div>
          </div>

          <button type="button"
                  id="estimaciones-scroll-btn-right"
                  onclick="scrollEstimacionesTableStep(1)"
                  class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0"
                  title="Desplazar columnas numéricas hacia la derecha (▶)">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        </div>
      </div>
      </div>
      `}

    </div>`;

  // Inicializar manija vertical de redimensionamiento de Catálogo y Conceptos y barra de desplazamiento derecha
  initEstimacionesColumnResizer();
  initEstimacionesDisplacementBar();
  renderTabAssignedAvatars('estimaciones');
}

// ==========================================
// BARRA DE DESPLAZAMIENTO AL LADO DERECHO DE "CATÁLOGO Y CONCEPTO DE OBRA"
// ==========================================
export function updateEstimacionesThumbUI() {
  const container = document.getElementById('estimaciones-table-container');
  const track = document.getElementById('estimaciones-scroll-track');
  const thumb = document.getElementById('estimaciones-scroll-thumb');
  if (!container || !track || !thumb) return;

  const scrollW = Math.max(1, container.scrollWidth || 1000);
  const clientW = Math.max(1, container.clientWidth || 800);
  const trackW = Math.max(60, track.clientWidth || 400);
  const maxScroll = Math.max(0, scrollW - clientW);

  if (maxScroll <= 2) {
    thumb.style.left = '0px';
    thumb.style.width = `${trackW}px`;
    return;
  }

  const ratio = Math.min(1, Math.max(0.15, clientW / scrollW));
  const thumbW = Math.max(36, Math.round(trackW * ratio));
  const maxThumbLeft = Math.max(0, trackW - thumbW);
  const scrollFraction = Math.min(1, Math.max(0, (container.scrollLeft || 0) / maxScroll));
  const thumbLeft = Math.round(scrollFraction * maxThumbLeft);

  thumb.style.width = `${thumbW}px`;
  thumb.style.left = `${thumbLeft}px`;
}

export function scrollEstimacionesTableStep(direction = 1) {
  const container = document.getElementById('estimaciones-table-container');
  if (!container) return;
  const step = 220 * (direction >= 0 ? 1 : -1);
  container.scrollLeft = Math.max(0, (container.scrollLeft || 0) + step);
  updateEstimacionesThumbUI();
}

export function initEstimacionesDisplacementBar() {
  const container = document.getElementById('estimaciones-table-container');
  const track = document.getElementById('estimaciones-scroll-track');
  const thumb = document.getElementById('estimaciones-scroll-thumb');
  if (!container || !track || !thumb) return;

  updateEstimacionesThumbUI();

  container.onscroll = () => {
    updateEstimacionesThumbUI();
  };

  track.onmousedown = (e) => {
    if (e.target === thumb || (thumb.contains && thumb.contains(e.target))) return;
    if (!track.getBoundingClientRect) return;
    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackW = Math.max(1, rect.width);
    const maxScroll = Math.max(0, (container.scrollWidth || 0) - (container.clientWidth || 0));
    const fraction = Math.max(0, Math.min(1, clickX / trackW));
    container.scrollLeft = Math.round(fraction * maxScroll);
    updateEstimacionesThumbUI();
  };

  thumb.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startScroll = container.scrollLeft || 0;
    const trackW = Math.max(1, track.clientWidth || 400);
    const thumbW = Math.max(24, thumb.offsetWidth || 80);
    const maxThumbLeft = Math.max(1, trackW - thumbW);
    const maxScroll = Math.max(0, (container.scrollWidth || 0) - (container.clientWidth || 0));

    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const scrollDelta = (dx / maxThumbLeft) * maxScroll;
      container.scrollLeft = Math.max(0, Math.min(maxScroll, startScroll + scrollDelta));
      updateEstimacionesThumbUI();
    }

    function onUp() {
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
}

// ==========================================
// CONTROLADORES DE EVENTOS DE USUARIO
// ==========================================

export function onSwitchActiveEstimacion(estimacionId) {
  setActiveEstimacionId(estimacionId);
  renderEstimacionesView();
  showToast('Estimación cambiada');
}

export function promptCreateNewEstimacion() {
  const data = getEstimacionesCalculatedData();
  const nextNum = data.estimacionesList.length + 1;
  const nombre = prompt(`Nombre de la nueva estimación:`, `Estimación No. ${nextNum}`);
  if (!nombre) return;

  const newEst = createNewEstimacion(nombre.trim());
  renderEstimacionesView();
  showToast(`Creada exitosamente: ${newEst.nombre}`, 'success');
}

export function toggleActiveEstimacionLock() {
  const locked = toggleTabLock('estimaciones');
  renderEstimacionesView();
  return locked;
}

export function confirmDeleteCurrentEstimacion(estId, estNombre) {
  if (!guardTabUnlocked('estimaciones')) return;
  if (!confirm(`¿Estás seguro de eliminar "${estNombre}"? Esta acción no se puede deshacer.`)) {
    return;
  }
  const ok = deleteEstimacion(estId);
  if (ok) {
    renderEstimacionesView();
    showToast(`Se ha eliminado ${estNombre}`);
  } else {
    showToast('No se puede eliminar la única estimación del proyecto', 'warning');
  }
}

export function onChangeEstimacionDate(estId, field, val) {
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  if (!val) return;
  updateEstimacionMeta(estId, { [field]: val, fechaCorte: val });
  renderEstimacionesView();
  showToast('Período de estimación actualizado');
}

// Formatea cualquier cantidad positiva de CANT EJE a 2 decimales exactos (ej. "5" -> "5.00", "5.3" -> "5.30")
export function formatCantEjeTwoDecimals(rawVal) {
  const cleaned = String(rawVal ?? '').replace(/,/g, '.').replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return '';
  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return '';
  const rounded = Math.round((num + Number.EPSILON) * 100) / 100;
  return rounded.toFixed(2);
}

// Sanitiza mientras el usuario escribe sin interrumpir la captura, limitando a máximo 2 decimales después del punto
function sanitizeCantEjeWhileTyping(rawVal) {
  let cleaned = String(rawVal ?? '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const dotIdx = cleaned.indexOf('.');
  if (dotIdx !== -1) {
    const intPart = cleaned.slice(0, dotIdx);
    const decPart = cleaned.slice(dotIdx + 1).replace(/\./g, '').slice(0, 2);
    cleaned = `${intPart}.${decPart}`;
  }
  return cleaned;
}

export function onEstimacionCantEjeInput(conceptId, val, inputEl = null) {
  selectEstimacionRow(conceptId);
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  const sanitized = sanitizeCantEjeWhileTyping(val);
  if (inputEl && typeof inputEl === 'object' && inputEl.value !== sanitized) {
    inputEl.value = sanitized;
  }

  setConceptoCantidadEjecutada(conceptId, sanitized);

  if (typeof document === 'undefined') return;
  const currencySymbol = state.settings?.currencySymbol || '$';
  const { rows, kpis } = getEstimacionesCalculatedData();

  // Actualización reactiva quirúrgica de celdas y totales sin recrear el <input> activo (mantiene el foco en la casilla)
  rows.forEach(r => {
    if (r.isParent) {
      const partEjeEl = document.getElementById(`est-part-tot-eje-${r.id}`);
      if (partEjeEl) partEjeEl.textContent = formatCurrency(r.totalEje, currencySymbol);

      const partAcumEl = document.getElementById(`est-part-tot-acum-${r.id}`);
      if (partAcumEl) partAcumEl.textContent = formatCurrency(r.totalAcum, currencySymbol);

      const partPctEl = document.getElementById(`est-part-pct-acum-${r.id}`);
      if (partPctEl) partPctEl.textContent = `${r.pctAvanceAcum.toFixed(1)}%`;

      const partSaldoEl = document.getElementById(`est-part-tot-saldo-${r.id}`);
      if (partSaldoEl) partSaldoEl.textContent = formatCurrency(r.totalSaldo, currencySymbol);
    } else {
      const totEjeEl = document.getElementById(`est-cell-tot-eje-${r.id}`);
      if (totEjeEl) {
        totEjeEl.textContent = formatCurrency(r.totalEje, currencySymbol);
        totEjeEl.className = `py-1 px-1.5 min-w-[70px] text-right font-mono font-black bg-emerald-50/50 border-r-2 border-emerald-300 whitespace-nowrap text-[11px] ${r.totalEje > 0 ? 'text-emerald-700' : 'text-slate-400'}`;
      }

      const cantAcumEl = document.getElementById(`est-cell-cant-acum-${r.id}`);
      if (cantAcumEl) {
        cantAcumEl.textContent = formatNumber(r.cantAcum, 2);
        cantAcumEl.className = `py-1 px-1 text-right font-mono bg-cyan-50/10 whitespace-nowrap text-[11px] ${r.cantAcum > 0 ? 'text-cyan-900 font-semibold' : 'text-slate-400'}`;
      }

      const totAcumEl = document.getElementById(`est-cell-tot-acum-${r.id}`);
      if (totAcumEl) {
        totAcumEl.textContent = formatCurrency(r.totalAcum, currencySymbol);
      }

      const pctAcumEl = document.getElementById(`est-cell-pct-acum-${r.id}`);
      if (pctAcumEl) {
        pctAcumEl.textContent = `${r.pctAvanceAcum.toFixed(1)}%`;
        pctAcumEl.className = `py-1 px-1 text-center font-mono font-bold text-[10.5px] bg-cyan-50/25 border-r-2 border-cyan-200 whitespace-nowrap ${r.pctAvanceAcum >= 100 ? 'text-emerald-700 font-black' : r.pctAvanceAcum > 0 ? 'text-blue-700' : 'text-slate-400'}`;
      }

      const cantSaldoEl = document.getElementById(`est-cell-cant-saldo-${r.id}`);
      if (cantSaldoEl) {
        cantSaldoEl.textContent = formatNumber(r.cantSaldo, 2);
        cantSaldoEl.className = `py-1 px-1 text-right font-mono bg-amber-50/15 whitespace-nowrap text-[11px] ${r.cantSaldo <= 0 ? 'text-slate-400' : 'text-slate-600'}`;
      }

      const totSaldoEl = document.getElementById(`est-cell-tot-saldo-${r.id}`);
      if (totSaldoEl) {
        totSaldoEl.textContent = formatCurrency(r.totalSaldo, currencySymbol);
        totSaldoEl.className = `py-1 px-1.5 min-w-[70px] text-right font-mono font-bold bg-amber-50/25 whitespace-nowrap text-[11px] ${r.totalSaldo <= 0 ? 'text-slate-400' : 'text-amber-800'}`;
      }
    }
  });

  const tfootEl = document.getElementById('estimaciones-tfoot');
  if (tfootEl) {
    tfootEl.innerHTML = renderEstimacionesTfootContentHTML(kpis, currencySymbol);
  }
}

// Al terminar de capturar en CANT EJE (blur / change / Enter), completa automáticamente .00 o el segundo decimal (.X0)
export function onEstimacionCantEjeBlur(conceptId, inputEl) {
  if (isEstimacionLocked()) return '';
  const rawVal = inputEl && typeof inputEl === 'object' ? inputEl.value : inputEl;
  const formatted = formatCantEjeTwoDecimals(rawVal);
  if (inputEl && typeof inputEl === 'object') {
    inputEl.value = formatted;
  }
  onEstimacionCantEjeInput(conceptId, formatted || '0');
  return formatted;
}

export function onEstimacionesAnticipoInput(val) {
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  setEstimacionesAnticipoPct(val);
  renderEstimacionesView();
  showToast('Porcentaje de anticipo actualizado');
}

export function onSearchEstimaciones(term) {
  estimacionesSearchTerm = term;
  renderEstimacionesView();
  if (typeof document !== 'undefined') {
    const searchEl = document.getElementById('estimaciones-search-input');
    if (searchEl && typeof searchEl.focus === 'function') {
      searchEl.focus();
      if (typeof searchEl.setSelectionRange === 'function') {
        const len = searchEl.value.length;
        searchEl.setSelectionRange(len, len);
      }
    }
  }
}

export function toggleEstimacionesGroup(nodeId) {
  estimacionesCollapsedMap[nodeId] = !estimacionesCollapsedMap[nodeId];
  renderEstimacionesView();
}

export function collapseAllEstimacionesPartidas() {
  const data = getEstimacionesCalculatedData();
  data.rows.forEach(r => {
    if (r.isParent) {
      estimacionesCollapsedMap[r.id] = true;
    }
  });
  renderEstimacionesView();
  showToast('Todas las partidas agrupadas en estimaciones');
}

export function expandAllEstimacionesPartidas() {
  estimacionesCollapsedMap = {};
  renderEstimacionesView();
  showToast('Todas las partidas desagrupadas en estimaciones');
}

// Imprimir formato de Estimación (Carátula ejecutiva y tabla de generadores)
export function printEstimacionActual() {
  printEstimacionesFormat();
}

export function onEstimacionesIvaInput(val) {
  if (!guardTabUnlocked('estimaciones')) {
    renderEstimacionesView();
    return;
  }
  setEstimacionesIvaPct(val);
  renderEstimacionesView();
  showToast('Porcentaje de IVA actualizado');
}

// =========================================================================
// MODAL DE REPORTE FOTOGRÁFICO DE ESTIMACIONES (AWS S3 + ENLACE OPCIONAL)
// =========================================================================
let activePhotoModalConceptId = null;
let activePhotoModalSlots = [null, null];

function emptyFotoSlot() {
  return { url: '', displayUrl: '', nota: '', mediaId: '', s3Key: '', archivoId: '', fileName: '', sizeLabel: '', __isNewTempUpload: false };
}

function renderEstimacionPhotoSlotCard(slotIdx, fotoObj, isLocked, placeholderNota) {
  const f = fotoObj || emptyFotoSlot();
  const hasManaged = Boolean(f.mediaId || f.s3Key);
  const badgeText = hasManaged
    ? (f.s3Key ? `AWS S3 • ${f.fileName || 'imagen.jpg'}${f.sizeLabel ? ` (${f.sizeLabel})` : ''}` : `Caché local • ${f.fileName || 'imagen.jpg'}${f.sizeLabel ? ` (${f.sizeLabel})` : ''}`)
    : (f.url ? 'Enlace URL externo vinculado' : '');

  return `
    <div class="p-3 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs">
      <div class="flex items-center justify-between">
        <span class="font-bold text-slate-800 flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold inline-flex items-center justify-center">${slotIdx}</span>
          <span>Fotografía ${slotIdx}${slotIdx === 2 ? ' (Opcional)' : ''}</span>
        </span>
        ${!isLocked ? `
          <button type="button" onclick="clearEstimacionConceptPhotoSlot(${slotIdx})" class="text-[10.5px] text-rose-600 hover:underline cursor-pointer">
            Limpiar
          </button>
        ` : ''}
      </div>

      ${!isLocked ? `
        <div class="space-y-1">
          <label class="inline-flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] cursor-pointer transition">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>Subir Foto a AWS S3 (auto-compresión ≤1280px)</span>
            <input type="file" id="est-foto-file-${slotIdx}"
                   accept=".jpg,.jpeg,.png,.webp,image/*"
                   onchange="onEstimacionPhotoFileSelected(${slotIdx}, this.files && this.files[0] ? this.files[0] : null)"
                   class="hidden">
          </label>
          <div id="est-foto-status-${slotIdx}" class="text-[10px] font-medium ${badgeText ? 'text-emerald-700' : 'text-slate-400'} truncate">
            ${badgeText || 'Sin archivo en AWS S3 todavía'}
          </div>
        </div>
      ` : `
        <div id="est-foto-status-${slotIdx}" class="text-[10px] font-medium text-slate-500 truncate">${badgeText || 'Sin archivo'}</div>
      `}

      <div class="space-y-1">
        <label class="text-[10.5px] font-semibold text-slate-600 block">O pegar enlace URL externo (opcional):</label>
        <input type="url" id="est-foto-url-${slotIdx}"
               ${isLocked ? 'disabled readonly' : ''}
               value="${String(f.url || '').replace(/"/g, '&quot;')}"
               oninput="onEstimacionPhotoUrlPreviewInput(${slotIdx})"
               placeholder="https://..."
               class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-600 disabled:bg-slate-100">
      </div>

      <div class="space-y-1">
        <label class="text-[10.5px] font-semibold text-slate-600 block">Pie de foto / Descripción:</label>
        <input type="text" id="est-foto-nota-${slotIdx}"
               ${isLocked ? 'disabled readonly' : ''}
               value="${String(f.nota || '').replace(/"/g, '&quot;')}"
               placeholder="${placeholderNota}"
               class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-600 disabled:bg-slate-100">
      </div>

      <div class="h-36 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden relative">
        <img id="est-foto-preview-${slotIdx}"
             src="${String(f.displayUrl || '').replace(/"/g, '&quot;')}"
             referrerpolicy="no-referrer"
             alt="Vista previa Foto ${slotIdx}"
             class="${f.displayUrl ? '' : 'hidden'} w-full h-full object-contain bg-white"
             onerror="this.classList.add('hidden'); document.getElementById('est-foto-empty-${slotIdx}').classList.remove('hidden');">
        <div id="est-foto-empty-${slotIdx}" class="${f.displayUrl ? 'hidden' : ''} text-center p-2 text-slate-400 text-[11px]">
          <i class="fa-regular fa-image text-lg block mb-1"></i>
          <span>${hasManaged ? 'Cargando vista previa...' : `Sin vista previa de Foto ${slotIdx}`}</span>
        </div>
      </div>
    </div>
  `;
}

export function openEstimacionConceptPhotosModal(conceptId) {
  const data = getEstimacionesCalculatedData();
  const row = data.rows.find(r => !r.isParent && String(r.id) === String(conceptId));
  if (!row) return;

  activePhotoModalConceptId = String(conceptId);
  const activeEst = data.activeEst;
  const isLocked = Boolean(activeEst && activeEst.locked);
  const fotos = getConceptoFotosEstimacion(conceptId);
  activePhotoModalSlots = [
    fotos[0] ? { ...emptyFotoSlot(), ...fotos[0], __isNewTempUpload: false } : emptyFotoSlot(),
    fotos[1] ? { ...emptyFotoSlot(), ...fotos[1], __isNewTempUpload: false } : emptyFotoSlot()
  ];

  let modalEl = document.getElementById('estimacion-fotos-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'estimacion-fotos-modal';
    modalEl.className = 'no-print fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3';
    document.body.appendChild(modalEl);
  }
  modalEl.classList.remove('hidden');

  modalEl.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
      
      <!-- Encabezado del Modal -->
      <div class="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white px-5 py-3.5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="w-9 h-9 rounded-xl bg-indigo-500/25 border border-indigo-400/40 text-amber-300 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-camera-retro text-base"></i>
          </span>
          <div class="min-w-0">
            <h3 class="text-sm font-bold text-white truncate">Reporte Fotográfico — ${activeEst.nombre}</h3>
            <p class="text-[11px] text-indigo-200 truncate">
              Clave <strong>${row.clave}</strong> • Cant. Eje: <strong>${Number(row.cantEje || 0).toFixed(2)} ${row.unidad}</strong> (Almacenamiento seguro AWS S3)
            </p>
          </div>
        </div>
        <button type="button" onclick="closeEstimacionConceptPhotosModal()" class="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 cursor-pointer transition">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- Cuerpo del Modal -->
      <div class="p-4 overflow-y-auto space-y-3.5 text-xs">
        
        <!-- Resumen del Concepto -->
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <div class="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Partida: <strong class="text-slate-700 font-sans">${row.partidaNombre || 'General'}</strong></span>
            <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Cant. Eje: ${Number(row.cantEje || 0).toFixed(2)} ${row.unidad}</span>
          </div>
          <p class="text-xs font-semibold text-slate-800 leading-snug">${row.descripcion}</p>
        </div>

        <!-- Medidor de Cuota Unificada -->
        <div id="estimaciones-photos-storage-meter"></div>

        <!-- Guía rápida -->
        <div class="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 text-[11px] text-blue-900 flex items-start gap-2">
          <i class="fa-solid fa-cloud-arrow-up text-blue-600 mt-0.5 shrink-0"></i>
          <div>
            <strong>Compresión automática y almacenamiento AWS S3:</strong> Sube fotos directo desde tu cámara o galería (JPEG/PNG/WebP se optimizan a ≤1280px y 150–350 KB) o pega una URL externa. Se incluirán automáticamente en la hoja fotográfica al imprimir la estimación.
          </div>
        </div>

        <!-- Grid de las 2 Fotografías -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          ${renderEstimacionPhotoSlotCard(1, activePhotoModalSlots[0], isLocked, 'Ej. Vista de armado y cimbrado en eje A-C...')}
          ${renderEstimacionPhotoSlotCard(2, activePhotoModalSlots[1], isLocked, 'Ej. Colado terminado y nivelado...')}
        </div>
      </div>

      <!-- Pie del Modal -->
      <div class="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
        <span class="text-[11px] text-slate-500">
          ${isLocked ? '🔒 Estimación bloqueada (Modo solo consulta)' : 'Al imprimir la estimación, este concepto tendrá su hoja fotográfica en el Resumen.'}
        </span>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeEstimacionConceptPhotosModal()"
                  class="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition">
            Cerrar
          </button>
          ${!isLocked ? `
            <button type="button" onclick="saveEstimacionConceptPhotosModal()"
                    class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm cursor-pointer transition flex items-center gap-1.5">
              <i class="fa-solid fa-floppy-disk"></i> Guardar Fotos
            </button>
          ` : ''}
        </div>
      </div>

    </div>
  `;

  mountStorageMeter('estimaciones-photos-storage-meter', { compact: true, showUpgradeButton: true });

  // Hidratar vistas previas almacenadas en IndexedDB / AWS S3
  [1, 2].forEach(async (slotIdx) => {
    const slot = activePhotoModalSlots[slotIdx - 1];
    if (slot && (slot.mediaId || slot.s3Key)) {
      const resolvedUrl = await resolveManagedFileUrl(slot, { cacheRemote: true });
      if (resolvedUrl && activePhotoModalConceptId === String(conceptId)) {
        slot.displayUrl = resolvedUrl;
        const imgEl = document.getElementById(`est-foto-preview-${slotIdx}`);
        const emptyEl = document.getElementById(`est-foto-empty-${slotIdx}`);
        if (imgEl && emptyEl) {
          imgEl.src = resolvedUrl;
          imgEl.classList.remove('hidden');
          emptyEl.classList.add('hidden');
        }
      }
    }
  });
}

export function closeEstimacionConceptPhotosModal(discardTemp = true) {
  if (discardTemp && Array.isArray(activePhotoModalSlots)) {
    activePhotoModalSlots.forEach((slot) => {
      if (slot?.__isNewTempUpload && (slot.mediaId || slot.s3Key || slot.archivoId)) {
        deleteManagedFile(slot).catch((err) => console.warn('Cleanup cancel estimación foto:', err));
      }
    });
  }
  const modalEl = document.getElementById('estimacion-fotos-modal');
  if (modalEl) modalEl.classList.add('hidden');
  activePhotoModalConceptId = null;
  activePhotoModalSlots = [emptyFotoSlot(), emptyFotoSlot()];
}

export async function onEstimacionPhotoFileSelected(slotIdx, file) {
  if (!file || !activePhotoModalConceptId) return;
  if (!guardTabUnlocked('estimaciones')) return;

  const idx = slotIdx - 1;
  const statusEl = document.getElementById(`est-foto-status-${slotIdx}`);
  if (statusEl) {
    statusEl.textContent = 'Optimizando y subiendo imagen...';
    statusEl.className = 'text-[10px] font-medium text-indigo-600 truncate';
  }

  const res = await uploadManagedFile({
    file,
    modulo: 'estimaciones',
    categoria: 'project_files',
    proyectoId: getActiveProjectId(),
    entidadId: `${activePhotoModalConceptId}_slot${slotIdx}`,
    preset: 'photo',
    showFeedback: true,
    includeDataUrl: true
  });

  if (!res.ok) {
    if (statusEl) {
      statusEl.textContent = res.reason || 'Subida bloqueada o fallida';
      statusEl.className = 'text-[10px] font-medium text-rose-600 truncate';
    }
    return;
  }

  const prev = activePhotoModalSlots[idx];
  if (prev?.__isNewTempUpload && (prev.mediaId || prev.s3Key || prev.archivoId)) {
    deleteManagedFile(prev).catch((err) => console.warn('Cleanup replaced estimación temp foto:', err));
  }

  const displayUrl = res.dataUrl || await resolveManagedFileUrl(res, { cacheRemote: true });
  activePhotoModalSlots[idx] = {
    url: '',
    displayUrl,
    nota: document.getElementById(`est-foto-nota-${slotIdx}`)?.value || '',
    mediaId: res.mediaId,
    s3Key: res.s3Key || '',
    archivoId: res.archivoId || '',
    fileName: res.fileName,
    sizeLabel: res.sizeLabel,
    __isNewTempUpload: true
  };

  const urlEl = document.getElementById(`est-foto-url-${slotIdx}`);
  if (urlEl) urlEl.value = '';

  const imgEl = document.getElementById(`est-foto-preview-${slotIdx}`);
  const emptyEl = document.getElementById(`est-foto-empty-${slotIdx}`);
  if (imgEl && emptyEl && displayUrl) {
    imgEl.src = displayUrl;
    imgEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
  }

  if (statusEl) {
    statusEl.textContent = `${res.cloudSynced ? 'AWS S3' : 'Cola local'} • ${res.fileName} (${res.sizeLabel})`;
    statusEl.className = 'text-[10px] font-semibold text-emerald-700 truncate';
  }
  mountStorageMeter('estimaciones-photos-storage-meter', { compact: true, showUpgradeButton: true });
}

export function onEstimacionPhotoUrlPreviewInput(slotIdx) {
  const urlEl = document.getElementById(`est-foto-url-${slotIdx}`);
  const imgEl = document.getElementById(`est-foto-preview-${slotIdx}`);
  const emptyEl = document.getElementById(`est-foto-empty-${slotIdx}`);
  if (!urlEl || !imgEl || !emptyEl) return;

  const idx = slotIdx - 1;
  const normalized = normalizeCloudImageUrl(urlEl.value);
  if (normalized) {
    if (activePhotoModalSlots[idx]) {
      if (activePhotoModalSlots[idx].__isNewTempUpload && (activePhotoModalSlots[idx].mediaId || activePhotoModalSlots[idx].s3Key)) {
        deleteManagedFile(activePhotoModalSlots[idx]).catch(() => {});
      }
      activePhotoModalSlots[idx] = { ...emptyFotoSlot(), url: urlEl.value.trim(), displayUrl: normalized };
    }
    imgEl.src = normalized;
    imgEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
  } else if (activePhotoModalSlots[idx] && (activePhotoModalSlots[idx].mediaId || activePhotoModalSlots[idx].s3Key)) {
    imgEl.src = activePhotoModalSlots[idx].displayUrl || '';
  } else {
    imgEl.src = '';
    imgEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
  }
}

export function clearEstimacionConceptPhotoSlot(slotIdx) {
  const idx = slotIdx - 1;
  const prev = activePhotoModalSlots[idx];
  if (prev?.__isNewTempUpload && (prev.mediaId || prev.s3Key || prev.archivoId)) {
    deleteManagedFile(prev).catch((err) => console.warn('Cleanup cleared estimación temp foto:', err));
  }
  activePhotoModalSlots[idx] = emptyFotoSlot();

  const urlEl = document.getElementById(`est-foto-url-${slotIdx}`);
  const notaEl = document.getElementById(`est-foto-nota-${slotIdx}`);
  const fileEl = document.getElementById(`est-foto-file-${slotIdx}`);
  const statusEl = document.getElementById(`est-foto-status-${slotIdx}`);
  if (urlEl) urlEl.value = '';
  if (notaEl) notaEl.value = '';
  if (fileEl) fileEl.value = '';
  if (statusEl) {
    statusEl.textContent = 'Sin archivo en AWS S3 todavía';
    statusEl.className = 'text-[10px] font-medium text-slate-400 truncate';
  }
  onEstimacionPhotoUrlPreviewInput(slotIdx);
}

export function saveEstimacionConceptPhotosModal() {
  if (!activePhotoModalConceptId) return;
  if (!guardTabUnlocked('estimaciones')) return;

  const list = [1, 2].map((slotIdx) => {
    const slot = activePhotoModalSlots[slotIdx - 1] || emptyFotoSlot();
    const url = (document.getElementById(`est-foto-url-${slotIdx}`)?.value || '').trim();
    const nota = (document.getElementById(`est-foto-nota-${slotIdx}`)?.value || '').trim();
    if (slot.mediaId || slot.s3Key) {
      return {
        url: '',
        nota,
        mediaId: slot.mediaId,
        s3Key: slot.s3Key,
        archivoId: slot.archivoId,
        fileName: slot.fileName,
        sizeLabel: slot.sizeLabel
      };
    }
    if (url) {
      return { url, nota };
    }
    return null;
  }).filter(Boolean);

  setConceptoFotosEstimacion(activePhotoModalConceptId, list);
  closeEstimacionConceptPhotosModal(false);
  renderEstimacionesView();
  showToast(list.length > 0 ? `${list.length} foto(s) guardada(s) en el concepto` : 'Fotos eliminadas del concepto', 'success');
}


// ==========================================
// CONTROLADORES DE EVENTOS DE COMPROBANTES FISCALES Y ANTICIPO 0
// ==========================================
export function onFacturaFieldChange(estId, field, val) {
  updateEstimacionFactura(estId, { [field]: val });
  if (field === 'status') {
    renderEstimacionesView();
    showToast('Estado de cobro: ' + (val === 'cobrada' ? 'Cobrada / Pagada' : 'Pendiente'));
  }
}

export async function onFacturaFileUpload(estId, fileType, file) {
  if (!file) return;

  showToast('Subiendo ' + fileType.toUpperCase() + ' de factura a la nube...', 'info');
  try {
    const res = await uploadManagedFile({
      file,
      modulo: 'estimaciones',
      categoria: 'project_files',
      proyectoId: getActiveProjectId(),
      entidadId: `${estId}_factura_${fileType}`,
      preset: 'document',
      showFeedback: true,
      includeDataUrl: false
    });

    if (!res.ok) {
      showToast(res.reason || ('No se pudo subir el archivo ' + fileType.toUpperCase()), 'error');
      return;
    }

    const updates = {};
    if (fileType === 'pdf') {
      updates.pdfFileName = res.fileName;
      updates.pdfFileRef = res;
      updates.pdfUrl = await resolveManagedFileUrl(res, { cacheRemote: true });
    } else if (fileType === 'xml') {
      updates.xmlFileName = res.fileName;
      updates.xmlFileRef = res;
      updates.xmlUrl = await resolveManagedFileUrl(res, { cacheRemote: true });
    }

    updateEstimacionFactura(estId, updates);
    renderEstimacionesView();
    showToast('¡' + fileType.toUpperCase() + ' guardado exitosamente!', 'success');
  } catch (err) {
    console.error('Error al subir comprobante fiscal:', err);
    showToast('Error: ' + err.message, 'error');
  }
}

export async function viewFacturaFile(estId, fileType) {
  const data = getEstimacionesCalculatedData();
  const est = data.estimacionesList.find(e => e.id === estId);
  const factura = est?.factura;
  if (!factura) {
    showToast('No hay factura registrada en esta estimación', 'warning');
    return;
  }

  const fileRef = fileType === 'pdf' ? factura.pdfFileRef : factura.xmlFileRef;
  const directUrl = fileType === 'pdf' ? factura.pdfUrl : factura.xmlUrl;
  const fileName = fileType === 'pdf' ? factura.pdfFileName : factura.xmlFileName;

  let finalUrl = directUrl;
  if (fileRef) {
    finalUrl = await resolveManagedFileUrl(fileRef, { cacheRemote: true }) || directUrl;
  }

  if (!finalUrl) {
    showToast('No hay archivo ' + fileType.toUpperCase() + ' adjunto', 'warning');
    return;
  }

  if (fileType === 'pdf') {
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  } else {
    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = fileName || ('Factura_' + estId + '.xml');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export async function removeFacturaFile(estId, fileType) {
  if (!confirm('¿Deseas eliminar el archivo ' + fileType.toUpperCase() + ' de esta estimación?')) return;

  const data = getEstimacionesCalculatedData();
  const est = data.estimacionesList.find(e => e.id === estId);
  const factura = est?.factura;
  if (!factura) return;

  const fileRef = fileType === 'pdf' ? factura.pdfFileRef : factura.xmlFileRef;
  if (fileRef) {
    deleteManagedFile(fileRef).catch(() => {});
  }

  const updates = {};
  if (fileType === 'pdf') {
    updates.pdfUrl = '';
    updates.pdfFileName = '';
    updates.pdfFileRef = null;
  } else {
    updates.xmlUrl = '';
    updates.xmlFileName = '';
    updates.xmlFileRef = null;
  }

  updateEstimacionFactura(estId, updates);
  renderEstimacionesView();
  showToast('Archivo ' + fileType.toUpperCase() + ' eliminado');
}

export function onAnticipoZeroFieldChange(field, val) {
  if (isEstimacionLocked('est_0')) return;
  updateEstimacionAnticipoZero({ [field]: val });
  renderEstimacionesView();
}