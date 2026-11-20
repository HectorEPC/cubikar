// js/modules/almacen/almacenView.js
// Interfaz gráfica de la 6ª pestaña principal ALMACÉN (Cero precios/costos $, apta para rol aislado de Bodeguero)

import { state } from '../../state/store.js?v=20261119_cf36';
import { formatNumber, round2, round5 } from '../../core/formatters.js?v=20261119_cf36';
import { showToast } from '../../ui/notifications.js?v=20261119_cf36';
import { guardTabUnlocked } from '../../ui/tabLockController.js?v=20261119_cf36';
import { canCurrentUserEditProject, getCurrentUser } from '../portal/projectService.js?v=20261119_cf36';
import { renderTabAssignedAvatars } from '../portal/portalController.js?v=20261119_cf36';
import { processExpenseEvidenceUpload, openExpenseEvidence } from '../compras/driveExpenseService.js?v=20261119_cf36';
import {
  getAlmacenSignatures,
  saveAlmacenSignatures,
  getDefaultAlmacenSignatures,
  getWarehouseStockSummary,
  getWarehouseReceptionsView,
  getWarehouseMovements,
  confirmWarehouseReception,
  createWarehouseMovement,
  markToolLoanReturned,
  cancelWarehouseMovement,
  deleteWarehouseMovement,
  getConceptCatalogForWarehouse
} from './almacenModel.js?v=20261119_cf36';
import {
  printWarehouseExitVoucher,
  printAlmacenActiveReport,
  exportAlmacenToExcel
} from './almacenExporter.js?v=20261119_cf36';

let activeAlmacenSubTab = 'stock'; // 'stock' | 'recepciones' | 'salidas' | 'herramienta'
let almacenSearchTerm = '';
let draftExitItems = [];
let draftExitKind = 'exit';
let activeReceptionExpenseId = null;
let currentReceptionEvidence = null;
let draftAlmacenSignatures = [];

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAlmacenSubTabBtnClass(tab) {
  const active = activeAlmacenSubTab === tab;
  return active
    ? 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-sky-700 border-2 border-sky-600 shadow-sm transition flex items-center gap-1.5 cursor-pointer shrink-0'
    : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-white hover:text-slate-900 shadow-2xs transition flex items-center gap-1.5 cursor-pointer shrink-0';
}

export function renderAlmacenView() {
  const container = document.getElementById('view-almacen');
  if (!container) return;

  const summary = getWarehouseStockSummary();
  const pendingCount = summary.pendingReceptionsCount || 0;
  const stockCount = summary.items.filter(i => i.availableStock > 0).length;
  const activeToolsCount = summary.activeToolLoans.length;
  const exitsCount = getWarehouseMovements().filter(m => m.kind === 'exit' && m.status !== 'cancelled').length;

  container.innerHTML = `
    <div class="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden rounded-xl border border-slate-200/90 shadow-xs">
      <!-- Barra Superior de Sub-Navegación -->
      <div class="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div class="inline-flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border-2 border-slate-300/90 shadow-xs overflow-x-auto max-w-full">
          <button type="button" onclick="switchAlmacenSubTab('stock')" id="almacen-subtab-stock" class="${getAlmacenSubTabBtnClass('stock')}">
            <i class="fa-solid fa-boxes-stacked text-xs ${activeAlmacenSubTab === 'stock' ? 'text-sky-600' : 'text-slate-500'}"></i>
            <span>Inventario en Bodega (${stockCount})</span>
          </button>
          <button type="button" onclick="switchAlmacenSubTab('recepciones')" id="almacen-subtab-recepciones" class="${getAlmacenSubTabBtnClass('recepciones')}">
            <i class="fa-solid fa-truck-ramp-box text-xs ${activeAlmacenSubTab === 'recepciones' ? 'text-sky-600' : 'text-slate-500'}"></i>
            <span>Recepciones de Compra</span>
            ${pendingCount > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-white">${pendingCount}</span>` : ''}
          </button>
          <button type="button" onclick="switchAlmacenSubTab('salidas')" id="almacen-subtab-salidas" class="${getAlmacenSubTabBtnClass('salidas')}">
            <i class="fa-solid fa-dolly text-xs ${activeAlmacenSubTab === 'salidas' ? 'text-sky-600' : 'text-slate-500'}"></i>
            <span>Vales de Salida (${exitsCount})</span>
          </button>
          <button type="button" onclick="switchAlmacenSubTab('herramienta')" id="almacen-subtab-herramienta" class="${getAlmacenSubTabBtnClass('herramienta')}">
            <i class="fa-solid fa-screwdriver-wrench text-xs ${activeAlmacenSubTab === 'herramienta' ? 'text-sky-600' : 'text-slate-500'}"></i>
            <span>Herramienta y Ajustes ${activeToolsCount > 0 ? `(${activeToolsCount})` : ''}</span>
          </button>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button type="button"
                  onclick="openAlmacenSignaturesModal()"
                  class="bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-300 hover:border-sky-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg shadow-2xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                  title="Configurar firmas oficiales para Vales de Salida y reportes de Almacén">
            <i class="fa-solid fa-file-signature text-sky-600 text-xs"></i>
            <span>Firmas y Responsables</span>
          </button>

          <div id="tab-members-almacen" class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs shrink-0">
            <span class="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <i class="fa-solid fa-users text-sky-600 text-[10px]"></i> Asignados:
            </span>
            <div id="tab-avatars-almacen" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('almacen')" title="Ver miembros asignados a Almacén"></div>
            <button type="button" onclick="openTabMembersAssignModal('almacen')" class="text-[10px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded px-1.5 py-0.5 transition flex items-center gap-1 cursor-pointer" title="Asignar bodeguero o colaboradores a Almacén">
              <i class="fa-solid fa-user-gear text-[9px]"></i> Asignar
            </button>
          </div>
        </div>
      </div>

      <!-- Barra de Acciones Secundaria -->
      <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" onclick="openWarehouseMovementModal('exit')" class="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-plus text-[11px]"></i>
            <span>Nuevo Vale de Salida</span>
          </button>

          <button type="button" onclick="openWarehouseMovementModal('tool_loan')" class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-amber-50 hover:border-amber-300 text-slate-700 hover:text-amber-800 text-xs font-semibold transition shadow-2xs flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-screwdriver-wrench text-[11px] text-amber-600"></i>
            <span>Préstamo Herramienta</span>
          </button>

          <button type="button" onclick="openWarehouseMovementModal('transfer_out')" class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition shadow-2xs flex items-center gap-1.5 cursor-pointer" title="Registrar devolución a proveedor, retorno de obra o traspaso a otra obra">
            <i class="fa-solid fa-right-left text-[11px] text-indigo-600"></i>
            <span>Devolución / Traspaso</span>
          </button>

          <button type="button" onclick="exportAlmacenExcelAction()" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-file-excel text-[11px]"></i>
            <span>Excel</span>
          </button>

          <button type="button" onclick="printAlmacenActiveReportAction()" class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-print text-slate-600 text-xs"></i>
            <span>Imprimir</span>
          </button>
        </div>

        <div class="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1 shadow-2xs shrink-0">
          <i class="fa-solid fa-warehouse text-sky-600 text-[11px]"></i>
          <span>Control Físico de Bodega</span>
          <span class="text-slate-300">|</span>
          <strong class="${pendingCount > 0 ? 'text-amber-700' : 'text-emerald-700'}">
            ${pendingCount > 0 ? `${pendingCount} entrega(s) por recibir` : 'Recepciones al día'}
          </strong>
        </div>
      </div>

      <!-- Contenido Dinámico -->
      <div id="almacen-subview-container" class="flex-1 overflow-y-auto custom-scroll p-4">
        ${renderAlmacenSubViewContent(summary)}
      </div>
    </div>
  `;

  if (typeof renderTabAssignedAvatars === 'function') {
    renderTabAssignedAvatars('almacen');
  }
  ensureAlmacenModalsRoot();
}

export function switchAlmacenSubTab(subTab) {
  const valid = ['stock', 'recepciones', 'salidas', 'herramienta'];
  activeAlmacenSubTab = valid.includes(subTab) ? subTab : 'stock';
  renderAlmacenView();
}

export function onAlmacenSearchChange(val) {
  almacenSearchTerm = val;
  const subContainer = document.getElementById('almacen-subview-container');
  if (subContainer) {
    subContainer.innerHTML = renderAlmacenSubViewContent(getWarehouseStockSummary());
  }
}

function renderAlmacenSearchBar(placeholder) {
  return `
    <div class="relative w-full">
      <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
      <input type="text" value="${escapeHtml(almacenSearchTerm)}" oninput="onAlmacenSearchChange(this.value)"
             placeholder="${escapeHtml(placeholder)}"
             class="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-2xs transition">
    </div>
  `;
}

function renderAlmacenSubViewContent(summary) {
  const q = (almacenSearchTerm || '').trim().toLowerCase();
  const movements = getWarehouseMovements();

  if (activeAlmacenSubTab === 'recepciones') {
    const list = summary.receptions.filter(r => {
      if (!q) return true;
      return (r.description || '').toLowerCase().includes(q)
        || (r.insumoClave || '').toLowerCase().includes(q)
        || (r.supplierName || '').toLowerCase().includes(q)
        || (r.expenseId || '').toLowerCase().includes(q);
    });

    return `
      <div class="space-y-3 max-w-7xl mx-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h3 class="text-xs font-black text-slate-900 uppercase tracking-wide">Recepciones de Material en Almacén (Entradas desde Compras)</h3>
            <p class="text-[11px] text-slate-500">Confirma la llegada física total o parcial de pedidos enviados a bodega.</p>
          </div>
        </div>
        ${renderAlmacenSearchBar('Buscar material, clave, folio o proveedor...')}
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="overflow-x-auto custom-scroll">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-900 text-white font-bold text-[11px]">
                  <th class="py-2.5 px-3 w-28">Ref. Orden</th>
                  <th class="py-2.5 px-3 w-24">Fecha</th>
                  <th class="py-2.5 px-3 min-w-[200px]">Material / Insumo</th>
                  <th class="py-2.5 px-3 min-w-[140px]">Proveedor (Entrega)</th>
                  <th class="py-2.5 px-3 w-16 text-center">Unid.</th>
                  <th class="py-2.5 px-3 w-24 text-right">Esperado</th>
                  <th class="py-2.5 px-3 w-24 text-right">Recibido</th>
                  <th class="py-2.5 px-3 w-24 text-right">Pendiente</th>
                  <th class="py-2.5 px-3 w-28 text-center">Estatus</th>
                  <th class="py-2.5 px-3 w-36 text-center">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${list.length === 0 ? `
                  <tr>
                    <td colspan="10" class="py-8 text-center text-slate-400">
                      No hay compras enviadas a Almacén todavía. Cuando una orden se marque como <strong>Enviar a Almacén</strong> aparecerá aquí sin montos ni precios.
                    </td>
                  </tr>
                ` : list.map(r => {
                  const statusBadge = r.status === 'complete'
                    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">✓ Recibido</span>'
                    : r.status === 'partial'
                    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">⏳ Parcial</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">🚚 Por Llegar</span>';

                  return `
                    <tr class="hover:bg-sky-50/40 transition">
                      <td class="py-2 px-3 font-mono font-bold text-sky-700">${escapeHtml(r.orderGroupId || r.expenseId)}</td>
                      <td class="py-2 px-3 font-mono text-slate-600">${escapeHtml(r.date || '---')}</td>
                      <td class="py-2 px-3">
                        <div class="font-bold text-slate-900">${escapeHtml(r.description)}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(r.insumoClave || '')}${r.remisionNumber ? ` · Rem: ${escapeHtml(r.remisionNumber)}` : ''}</div>
                      </td>
                      <td class="py-2 px-3 text-slate-700">${escapeHtml(r.supplierName)}</td>
                      <td class="py-2 px-3 text-center font-mono text-slate-500">${escapeHtml(r.unit)}</td>
                      <td class="py-2 px-3 text-right font-mono text-slate-700">${formatNumber(r.expectedQty)}</td>
                      <td class="py-2 px-3 text-right font-mono font-bold text-emerald-700">${formatNumber(r.receivedQty)}</td>
                      <td class="py-2 px-3 text-right font-mono font-bold ${r.pendingQty > 0 ? 'text-amber-700' : 'text-slate-400'}">${formatNumber(r.pendingQty)}</td>
                      <td class="py-2 px-3 text-center">${statusBadge}</td>
                      <td class="py-2 px-3 text-center">
                        <div class="flex items-center justify-center gap-1.5">
                          ${r.pendingQty > 0 ? `
                            <button type="button" onclick="openWarehouseReceptionModal('${escapeHtml(r.expenseId)}')"
                                    class="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-bold transition cursor-pointer">
                              Recibir
                            </button>
                          ` : `<span class="text-[10px] text-emerald-700 font-bold">Completo</span>`}
                          ${r.evidence ? `
                            <button type="button" onclick="openAlmacenReceptionEvidence('${escapeHtml(r.expenseId)}')"
                                    class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer" title="Ver foto remisión">
                              <i class="fa-solid fa-paperclip"></i>
                            </button>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  if (activeAlmacenSubTab === 'salidas') {
    const list = movements.filter(m => {
      if (m.kind !== 'exit') return false;
      if (!q) return true;
      const itemsStr = (m.items || []).map(i => `${i.description} ${i.insumoClave}`).join(' ').toLowerCase();
      return (m.folio || '').toLowerCase().includes(q)
        || (m.conceptClave || '').toLowerCase().includes(q)
        || (m.conceptDesc || '').toLowerCase().includes(q)
        || (m.frontName || '').toLowerCase().includes(q)
        || (m.recipientName || '').toLowerCase().includes(q)
        || itemsStr.includes(q);
    });

    return `
      <div class="space-y-3 max-w-7xl mx-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h3 class="text-xs font-black text-slate-900 uppercase tracking-wide">Bitácora de Órdenes y Vales de Salida de Almacén</h3>
            <p class="text-[11px] text-slate-500">Registro físico de entregas de material hacia conceptos del catálogo o frentes de trabajo.</p>
          </div>
        </div>
        ${renderAlmacenSearchBar('Buscar por folio VAL, concepto, frente, material o quién recibió...')}
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="overflow-x-auto custom-scroll">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-900 text-white font-bold text-[11px]">
                  <th class="py-2.5 px-3 w-28">Folio</th>
                  <th class="py-2.5 px-3 w-24">Fecha</th>
                  <th class="py-2.5 px-3 min-w-[180px]">Concepto / Frente</th>
                  <th class="py-2.5 px-3 min-w-[240px]">Materiales Entregados</th>
                  <th class="py-2.5 px-3 w-36">Recibió</th>
                  <th class="py-2.5 px-3 w-24 text-center">Estatus</th>
                  <th class="py-2.5 px-3 w-28 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${list.length === 0 ? `
                  <tr>
                    <td colspan="7" class="py-8 text-center text-slate-400">
                      No hay vales de salida emitidos. Haz clic en <strong>+ Nuevo Vale de Salida</strong> para surtir un concepto o frente.
                    </td>
                  </tr>
                ` : list.map(m => `
                  <tr class="hover:bg-sky-50/40 transition ${m.status === 'cancelled' ? 'opacity-50' : ''}">
                    <td class="py-2.5 px-3 font-mono font-bold text-sky-700">${escapeHtml(m.folio || m.id)}</td>
                    <td class="py-2.5 px-3 font-mono text-slate-600">${escapeHtml(m.date)}</td>
                    <td class="py-2.5 px-3">
                      ${m.conceptClave || m.conceptDesc
                        ? `<div class="font-bold text-slate-900">[${escapeHtml(m.conceptClave)}] ${escapeHtml(m.conceptDesc)}</div>
                           <div class="text-[10px] text-sky-700 font-semibold">${m.conceptQty > 0 ? `Avance surtido: ${formatNumber(m.conceptQty)} ${escapeHtml(m.conceptUnit)}` : ''}${m.frontName ? ` · ${escapeHtml(m.frontName)}` : ''}</div>`
                        : `<div class="font-semibold text-slate-800">${escapeHtml(m.frontName || 'Frente General')}</div>`}
                    </td>
                    <td class="py-2.5 px-3">
                      <div class="space-y-0.5">
                        ${(m.items || []).map(it => `
                          <div class="text-[11px] flex items-center justify-between gap-2 border-b border-slate-100/80 last:border-0 pb-0.5 last:pb-0">
                            <span class="font-medium text-slate-800 truncate">${escapeHtml(it.description)}</span>
                            <span class="font-mono font-bold text-slate-900 shrink-0">${formatNumber(it.qty)} ${escapeHtml(it.unit)}</span>
                          </div>
                        `).join('')}
                      </div>
                    </td>
                    <td class="py-2.5 px-3 text-slate-700 font-medium">${escapeHtml(m.recipientName || '---')}</td>
                    <td class="py-2.5 px-3 text-center">
                      ${m.status === 'cancelled'
                        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">Cancelado</span>'
                        : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Entregado</span>'}
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      <div class="flex items-center justify-center gap-1">
                        <button type="button" onclick="printWarehouseExitAction('${escapeHtml(m.id)}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 transition flex items-center justify-center cursor-pointer" title="Imprimir Vale de Salida">
                          <i class="fa-solid fa-print text-[10px]"></i>
                        </button>
                        <button type="button" onclick="toggleCancelAlmacenMovementAction('${escapeHtml(m.id)}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 transition flex items-center justify-center cursor-pointer" title="${m.status === 'cancelled' ? 'Reactivar' : 'Cancelar'}">
                          <i class="fa-solid fa-ban text-[10px]"></i>
                        </button>
                        <button type="button" onclick="deleteAlmacenMovementAction('${escapeHtml(m.id)}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 transition flex items-center justify-center cursor-pointer" title="Eliminar">
                          <i class="fa-solid fa-trash-can text-[10px]"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  if (activeAlmacenSubTab === 'herramienta') {
    const list = movements.filter(m => {
      if (m.kind !== 'tool_loan' && m.kind !== 'return' && m.kind !== 'transfer_out' && m.kind !== 'adjustment') return false;
      if (!q) return true;
      return (m.folio || '').toLowerCase().includes(q)
        || (m.recipientName || '').toLowerCase().includes(q)
        || (m.items || []).some(i => (i.description || '').toLowerCase().includes(q));
    });
    const kindLabels = {
      tool_loan: { label: 'Préstamo Herramienta', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
      return: { label: 'Devolución a Bodega', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
      transfer_out: { label: 'Traspaso / Devolución Ext.', cls: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
      adjustment: { label: 'Ajuste Físico', cls: 'bg-slate-200 text-slate-700 border-slate-300' }
    };

    return `
      <div class="space-y-3 max-w-7xl mx-auto">
        <div class="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h3 class="text-xs font-black text-slate-900 uppercase tracking-wide">Préstamo de Herramienta, Sobrantes, Devoluciones y Traspasos</h3>
            <p class="text-[11px] text-slate-500">Control de resguardo de herramienta menor/equipo y salidas por traspaso a otras obras.</p>
          </div>
        </div>
        ${renderAlmacenSearchBar('Buscar herramienta, responsable o folio...')}
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="overflow-x-auto custom-scroll">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="bg-slate-900 text-white font-bold text-[11px]">
                  <th class="py-2.5 px-3 w-28">Folio</th>
                  <th class="py-2.5 px-3 w-24">Fecha</th>
                  <th class="py-2.5 px-3 w-40">Tipo</th>
                  <th class="py-2.5 px-3 min-w-[220px]">Material / Herramienta</th>
                  <th class="py-2.5 px-3 w-40">Responsable / Destino</th>
                  <th class="py-2.5 px-3 w-32 text-center">Estado</th>
                  <th class="py-2.5 px-3 w-36 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${list.length === 0 ? `
                  <tr>
                    <td colspan="7" class="py-8 text-center text-slate-400">
                      No hay préstamos de herramienta ni movimientos especiales registrados aún.
                    </td>
                  </tr>
                ` : list.map(m => {
                  const kCfg = kindLabels[m.kind] || kindLabels.adjustment;
                  const isTool = m.kind === 'tool_loan';
                  const isReturned = isTool && m.toolStatus === 'returned';
                  return `
                    <tr class="hover:bg-slate-50 transition ${m.status === 'cancelled' ? 'opacity-50' : ''}">
                      <td class="py-2.5 px-3 font-mono font-bold text-sky-700">${escapeHtml(m.folio || m.id)}</td>
                      <td class="py-2.5 px-3 font-mono text-slate-600">${escapeHtml(m.date)}</td>
                      <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold border ${kCfg.cls}">${kCfg.label}</span></td>
                      <td class="py-2.5 px-3">
                        ${(m.items || []).map(it => `<div class="text-[11px] font-semibold text-slate-800">${escapeHtml(it.description)} <span class="font-mono text-sky-700">(${formatNumber(it.qty)} ${escapeHtml(it.unit)})</span></div>`).join('')}
                        ${m.notes ? `<div class="text-[10px] text-slate-400 italic">${escapeHtml(m.notes)}</div>` : ''}
                      </td>
                      <td class="py-2.5 px-3 text-slate-700">${escapeHtml(m.recipientName || m.targetProjectName || m.frontName || '---')}</td>
                      <td class="py-2.5 px-3 text-center">
                        ${m.status === 'cancelled'
                          ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">Cancelado</span>'
                          : isTool
                          ? (isReturned
                              ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">✓ Devuelto ${escapeHtml(m.toolReturnedAt)}</span>`
                              : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">En Resguardo</span>')
                          : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Aplicado</span>'}
                      </td>
                      <td class="py-2.5 px-3 text-center">
                        <div class="flex items-center justify-center gap-1">
                          ${isTool && !isReturned && m.status !== 'cancelled' ? `
                            <button type="button" onclick="returnAlmacenToolAction('${escapeHtml(m.id)}')" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer">
                              Devolver
                            </button>
                          ` : ''}
                          <button type="button" onclick="printWarehouseExitAction('${escapeHtml(m.id)}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-sky-100 text-slate-600 hover:text-sky-700 flex items-center justify-center cursor-pointer" title="Imprimir Vale">
                            <i class="fa-solid fa-print text-[10px]"></i>
                          </button>
                          <button type="button" onclick="deleteAlmacenMovementAction('${escapeHtml(m.id)}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 flex items-center justify-center cursor-pointer" title="Eliminar">
                            <i class="fa-solid fa-trash-can text-[10px]"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  // Vista por defecto: 'stock' (Inventario en Bodega)
  const items = summary.items.filter(it => {
    if (!q) return true;
    return (it.description || '').toLowerCase().includes(q)
      || (it.insumoClave || '').toLowerCase().includes(q)
      || (it.tipo || '').toLowerCase().includes(q);
  });

  return `
    <div class="space-y-3 max-w-7xl mx-auto">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">Materiales con Existencia</span>
          <div class="text-lg font-black font-mono text-sky-700">${summary.items.filter(i => i.availableStock > 0).length}</div>
        </div>
        <div class="bg-white p-3 rounded-xl border ${summary.pendingReceptionsCount > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'} shadow-2xs">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">Entregas por Confirmar</span>
          <div class="text-lg font-black font-mono ${summary.pendingReceptionsCount > 0 ? 'text-amber-700' : 'text-emerald-700'}">${summary.pendingReceptionsCount}</div>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">Vales de Salida Emitidos</span>
          <div class="text-lg font-black font-mono text-slate-900">${movements.filter(m => m.kind === 'exit' && m.status !== 'cancelled').length}</div>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span class="text-[10px] font-bold text-slate-500 uppercase block">Herramienta en Resguardo</span>
          <div class="text-lg font-black font-mono text-slate-900">${summary.activeToolLoans.length}</div>
        </div>
      </div>

      ${renderAlmacenSearchBar('Buscar material o insumo en inventario por nombre, clave o rubro...')}

      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div class="overflow-x-auto custom-scroll">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-900 text-white font-bold text-[11px]">
                <th class="py-2.5 px-3 w-24">Clave</th>
                <th class="py-2.5 px-3 min-w-[220px]">Descripción del Material / Insumo</th>
                <th class="py-2.5 px-3 w-28">Rubro</th>
                <th class="py-2.5 px-3 w-16 text-center">Unid.</th>
                <th class="py-2.5 px-3 w-24 text-right">Entradas</th>
                <th class="py-2.5 px-3 w-24 text-right">Salidas Obra</th>
                <th class="py-2.5 px-3 w-24 text-right">Dev. / Tras.</th>
                <th class="py-2.5 px-3 w-28 text-right">En Bodega</th>
                <th class="py-2.5 px-3 w-24 text-right">Por Llegar</th>
                <th class="py-2.5 px-3 w-24 text-center">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${items.length === 0 ? `
                <tr>
                  <td colspan="10" class="py-10 text-center text-slate-400">
                    <i class="fa-solid fa-warehouse text-3xl text-slate-300 mb-2 block"></i>
                    <p class="font-semibold text-slate-600">El almacén de esta obra aún no tiene existencias registradas.</p>
                    <p class="text-[11px] text-slate-400 mt-1">Al registrar una compra en <strong>Compras y Pagos</strong> con destino <em>"Enviar a Almacén"</em>, las entradas aparecerán aquí.</p>
                  </td>
                </tr>
              ` : items.map(it => {
                const netDevTras = round2(it.totalReturnedFromSiteQty - it.totalTransferredOutQty + it.totalAdjustedQty);
                return `
                  <tr class="hover:bg-sky-50/40 transition">
                    <td class="py-2 px-3 font-mono font-bold text-sky-700">${escapeHtml(it.insumoClave || 'MAT')}</td>
                    <td class="py-2 px-3 font-bold text-slate-900">${escapeHtml(it.description)}</td>
                    <td class="py-2 px-3 text-[11px] text-slate-600">${escapeHtml(it.tipo)}</td>
                    <td class="py-2 px-3 text-center font-mono text-slate-500">${escapeHtml(it.unit)}</td>
                    <td class="py-2 px-3 text-right font-mono text-slate-700">${formatNumber(it.totalEnteredQty)}</td>
                    <td class="py-2 px-3 text-right font-mono text-slate-700">${formatNumber(it.totalExitedQty)}</td>
                    <td class="py-2 px-3 text-right font-mono text-slate-500">${netDevTras !== 0 ? (netDevTras > 0 ? `+${formatNumber(netDevTras)}` : formatNumber(netDevTras)) : '---'}</td>
                    <td class="py-2 px-3 text-right font-mono font-black ${it.availableStock > 0 ? 'text-emerald-700' : 'text-rose-600'}">${formatNumber(it.availableStock)}</td>
                    <td class="py-2 px-3 text-right font-mono ${it.pendingArrivalQty > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}">${it.pendingArrivalQty > 0 ? formatNumber(it.pendingArrivalQty) : '0'}</td>
                    <td class="py-2 px-3 text-center">
                      ${it.availableStock > 0 ? `
                        <button type="button" onclick="openWarehouseMovementModal('exit', '${escapeHtml(it.insumoKey)}')"
                                class="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-bold cursor-pointer">
                          Sacar
                        </button>
                      ` : `<span class="text-[10px] text-slate-300">Agotado</span>`}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// =============================================================================
// MODALES DE ALMACÉN (Recepción, Vale de Salida, Firmas)
// =============================================================================

function ensureAlmacenModalsRoot() {
  const root = document.getElementById('almacen-modals-root');
  if (!root || root.dataset.initialized === '1') return;
  root.dataset.initialized = '1';

  root.innerHTML = `
    <!-- Modal: Confirmar Recepción Física -->
    <div id="almacen-modal-reception" style="z-index: 100000;" class="fixed inset-0 bg-slate-950/80 backdrop-blur-xs hidden items-center justify-center p-3 sm:p-4">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div class="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <i class="fa-solid fa-truck-ramp-box text-sm"></i>
            </div>
            <div>
              <h3 class="font-extrabold text-sm text-white">Confirmar Recepción Física en Bodega</h3>
              <p class="text-[11px] text-slate-300">Registra llegada parcial o completa del proveedor</p>
            </div>
          </div>
          <button type="button" onclick="closeWarehouseReceptionModal()" class="text-slate-400 hover:text-white cursor-pointer p-1">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <div class="p-4 space-y-3 overflow-y-auto custom-scroll text-xs">
          <div id="alm-rec-summary-box" class="p-3 bg-sky-50 border border-sky-200 rounded-xl space-y-1"></div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Cantidad que entra hoy:</label>
              <input type="number" id="alm-rec-qty" min="0" step="any" class="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-right text-slate-900">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Fecha de Recepción:</label>
              <input type="date" id="alm-rec-date" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">No. Remisión / Guía:</label>
              <input type="text" id="alm-rec-remision" placeholder="Ej: REM-4021" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-slate-800">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Recibió en Almacén:</label>
              <input type="text" id="alm-rec-by" placeholder="Nombre almacenista" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
            </div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Foto o Nota de Remisión (Opcional):</label>
            <input type="file" id="alm-rec-file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="hidden" onchange="onAlmacenReceptionFileChange(this)">
            <div id="alm-rec-evidence-zone"></div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Observaciones:</label>
            <textarea id="alm-rec-notes" rows="2" placeholder="Condiciones del material, faltantes, etc." class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"></textarea>
          </div>
        </div>

        <div class="bg-slate-100 px-5 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button type="button" onclick="closeWarehouseReceptionModal()" class="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer">Cancelar</button>
          <button type="button" onclick="saveWarehouseReceptionModal()" class="px-4 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer">Guardar Entrada</button>
        </div>
      </div>
    </div>

    <!-- Modal: Nuevo Vale de Salida / Préstamo / Traspaso -->
    <div id="almacen-modal-movement" style="z-index: 100000;" class="fixed inset-0 bg-slate-950/80 backdrop-blur-xs hidden items-center justify-center p-3 sm:p-4">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]">
        <div class="bg-slate-900 text-white px-5 py-3.5 flex justify-between items-center shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
              <i class="fa-solid fa-dolly text-sm"></i>
            </div>
            <div>
              <h3 id="alm-mov-title" class="font-extrabold text-sm text-white">Nuevo Vale de Salida de Almacén</h3>
              <p class="text-[11px] text-slate-300">Control físico de salidas por concepto, frente de trabajo o resguardo</p>
            </div>
          </div>
          <button type="button" onclick="closeWarehouseMovementModal()" class="text-slate-400 hover:text-white cursor-pointer p-1">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>

        <div class="p-4 space-y-3 overflow-y-auto custom-scroll text-xs">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Tipo de Movimiento:</label>
              <select id="alm-mov-kind" onchange="onAlmacenMovKindChange(this.value)" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-semibold text-slate-800">
                <option value="exit">📦 Vale de Salida a Obra</option>
                <option value="tool_loan">🛠️ Préstamo de Herramienta</option>
                <option value="return">↩️ Devolución de Obra a Bodega</option>
                <option value="transfer_out">🚚 Traspaso / Devolución Externa</option>
                <option value="adjustment">⚖️ Ajuste Físico de Inventario</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Fecha:</label>
              <input type="date" id="alm-mov-date" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
            </div>
            <div>
              <label class="block font-bold text-slate-700 mb-1">Quién Recibe / Responsable:</label>
              <input type="text" id="alm-mov-recipient" placeholder="Ej: Maestro J. Guadalupe" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
            </div>
          </div>

          <!-- Surtido opcional desde Concepto del Catálogo (SIN precios) -->
          <div id="alm-mov-concept-box" class="p-3 bg-sky-50/80 border border-sky-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-bold text-sky-900 flex items-center gap-1.5">
                <i class="fa-solid fa-diagram-project text-sky-600"></i> Vincular / Explotar desde Concepto de Obra (Opcional):
              </span>
              <span class="text-[10px] text-sky-700 font-medium">Descuenta directo de bodega según matriz</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div class="sm:col-span-2">
                <select id="alm-mov-concept-select" onchange="onAlmacenConceptSelectChange()" class="w-full bg-white border border-sky-200 rounded-lg p-2 text-xs text-slate-800 font-medium">
                  <option value="">-- Salida manual (sin concepto) --</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Cantidad Concepto:</label>
                <input type="number" id="alm-mov-concept-qty" min="0" step="any" placeholder="Ej: 40" class="w-full bg-white border border-sky-200 rounded-lg p-1.5 font-mono font-bold text-right">
              </div>
              <div>
                <button type="button" onclick="explodeConceptIntoAlmacenExit()" class="w-full px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs cursor-pointer">
                  Cargar Insumos
                </button>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-700 mb-1">Frente / Ubicación en Obra:</label>
              <input type="text" id="alm-mov-front" placeholder="Ej: Eje B - Castillos Planta Baja" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
            </div>
            <div id="alm-mov-target-project-wrap" class="hidden">
              <label class="block font-bold text-slate-700 mb-1">Obra Destino / Proveedor Devolución:</label>
              <input type="text" id="alm-mov-target-project" placeholder="Ej: Obra Residencial Sur / Devolución" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
            </div>
            <div id="alm-mov-auth-wrap">
              <label class="block font-bold text-slate-700 mb-1">Autorizó Salida:</label>
              <input type="text" id="alm-mov-auth" placeholder="Residente de Obra" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
            </div>
          </div>

          <!-- Agregar material manual -->
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-bold text-slate-800">Materiales / Herramienta en este Vale:</span>
              <div class="flex items-center gap-1.5">
                <select id="alm-mov-add-stock-select" class="bg-white border border-slate-300 rounded-lg p-1.5 text-xs text-slate-800 max-w-[260px]">
                  <option value="">-- Elegir de existencia en bodega --</option>
                </select>
                <button type="button" onclick="addSelectedStockItemToDraftExit()" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold cursor-pointer">
                  + Agregar
                </button>
                <button type="button" onclick="addBlankManualItemToDraftExit()" class="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold cursor-pointer">
                  + Renglón libre
                </button>
              </div>
            </div>

            <div id="alm-mov-items-list" class="space-y-1.5 max-h-52 overflow-y-auto custom-scroll"></div>
          </div>

          <div>
            <label class="block font-bold text-slate-700 mb-1">Notas / Observaciones:</label>
            <input type="text" id="alm-mov-notes" placeholder="Opcional" class="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800">
          </div>
        </div>

        <div class="bg-slate-100 px-5 py-3 border-t border-slate-200 flex justify-end gap-2 shrink-0">
          <button type="button" onclick="closeWarehouseMovementModal()" class="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer">Cancelar</button>
          <button type="button" onclick="saveWarehouseMovementModal()" class="px-4 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white cursor-pointer">Guardar Movimiento</button>
        </div>
      </div>
    </div>

    <!-- Modal: Firmas de Almacén -->
    <div id="almacen-modal-firmas" style="z-index: 100000;" class="fixed inset-0 bg-slate-950/75 backdrop-blur-xs hidden items-center justify-center p-3 sm:p-5">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div class="bg-slate-900 text-white p-4 flex justify-between items-center shrink-0">
          <div>
            <h3 class="font-bold text-sm text-white">Firmas y Responsables de Almacén</h3>
            <p class="text-[11px] text-slate-300">Aparecerán en Vales de Salida, Recepciones e Inventarios</p>
          </div>
          <button type="button" onclick="closeAlmacenSignaturesModal()" class="text-slate-400 hover:text-white cursor-pointer p-1">
            <i class="fa-solid fa-xmark text-base"></i>
          </button>
        </div>
        <div class="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs">
          <span class="text-slate-600 font-medium">Hasta 5 firmantes:</span>
          <button type="button" onclick="addAlmacenSignatureRow()" class="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] cursor-pointer">+ Agregar</button>
        </div>
        <div id="almacen-firmas-list" class="p-4 overflow-y-auto custom-scroll space-y-2.5 flex-1 bg-slate-100/50"></div>
        <div class="bg-slate-100 p-3 border-t border-slate-200 flex justify-between items-center shrink-0">
          <button type="button" onclick="resetDefaultAlmacenSignatures()" class="text-xs text-slate-500 hover:text-slate-800 cursor-pointer">Predeterminados</button>
          <div class="flex gap-2">
            <button type="button" onclick="closeAlmacenSignaturesModal()" class="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer">Cancelar</button>
            <button type="button" onclick="saveAlmacenSignaturesModal()" class="px-4 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg cursor-pointer">Guardar Firmas</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- Handlers Recepción ---
export function openWarehouseReceptionModal(expenseId) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: no puedes confirmar recepciones.', 'warning');
    return;
  }
  if (!guardTabUnlocked('almacen')) return;
  ensureAlmacenModalsRoot();

  const rec = getWarehouseReceptionsView().find(r => r.expenseId === expenseId);
  if (!rec) return;

  activeReceptionExpenseId = expenseId;
  currentReceptionEvidence = rec.evidence || null;

  const summaryBox = document.getElementById('alm-rec-summary-box');
  if (summaryBox) {
    summaryBox.innerHTML = `
      <div class="font-bold text-slate-900">${escapeHtml(rec.description)}</div>
      <div class="text-[11px] text-slate-600">Proveedor: <strong>${escapeHtml(rec.supplierName)}</strong> · Folio Ref: <span class="font-mono">${escapeHtml(rec.orderGroupId || rec.expenseId)}</span></div>
      <div class="text-[11px] text-sky-800 font-semibold">Esperado: <strong>${formatNumber(rec.expectedQty)} ${escapeHtml(rec.unit)}</strong> · Ya recibido: <strong>${formatNumber(rec.receivedQty)}</strong> · Pendiente: <strong>${formatNumber(rec.pendingQty)}</strong></div>
    `;
  }

  document.getElementById('alm-rec-qty').value = rec.pendingQty > 0 ? rec.pendingQty : rec.expectedQty;
  document.getElementById('alm-rec-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('alm-rec-remision').value = rec.remisionNumber || '';
  document.getElementById('alm-rec-by').value = rec.receivedBy || getCurrentUser()?.name || '';
  document.getElementById('alm-rec-notes').value = '';
  renderAlmacenReceptionEvidenceUI();

  const modal = document.getElementById('almacen-modal-reception');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeWarehouseReceptionModal() {
  const modal = document.getElementById('almacen-modal-reception');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  activeReceptionExpenseId = null;
  currentReceptionEvidence = null;
}

export async function onAlmacenReceptionFileChange(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  try {
    const projectName = state.settings?.projectName || 'Obra';
    const uploaded = await processExpenseEvidenceUpload(file, projectName, activeReceptionExpenseId || '');
    currentReceptionEvidence = uploaded;
    renderAlmacenReceptionEvidenceUI();
    showToast(`Remisión "${uploaded.fileName}" adjuntada.`, 'success');
  } catch (err) {
    showToast(`Error adjuntando remisión: ${err.message}`, 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

function renderAlmacenReceptionEvidenceUI() {
  const zone = document.getElementById('alm-rec-evidence-zone');
  if (!zone) return;
  if (currentReceptionEvidence && currentReceptionEvidence.fileName) {
    zone.innerHTML = `
      <div class="flex items-center justify-between p-2 bg-sky-50 border border-sky-200 rounded-lg text-xs">
        <span class="font-bold text-slate-800 truncate">${escapeHtml(currentReceptionEvidence.fileName)}</span>
        <button type="button" onclick="currentReceptionEvidence=null;document.getElementById('alm-rec-evidence-zone').innerHTML=''" class="text-rose-600 font-bold text-[10px] cursor-pointer">Quitar</button>
      </div>
    `;
  } else {
    zone.innerHTML = `
      <div onclick="document.getElementById('alm-rec-file').click()" class="border-2 border-dashed border-slate-300 rounded-lg p-2.5 text-center hover:bg-slate-50 cursor-pointer">
        <i class="fa-solid fa-camera text-slate-400 mr-1"></i>
        <span class="text-[11px] font-semibold text-slate-600">Subir foto o PDF de nota de remisión</span>
      </div>
    `;
  }
}

export function saveWarehouseReceptionModal() {
  if (!activeReceptionExpenseId) return;
  try {
    const qty = parseFloat(document.getElementById('alm-rec-qty')?.value) || 0;
    const receivedDate = document.getElementById('alm-rec-date')?.value || new Date().toISOString().slice(0, 10);
    const remisionNumber = document.getElementById('alm-rec-remision')?.value || '';
    const receivedBy = document.getElementById('alm-rec-by')?.value || '';
    const notes = document.getElementById('alm-rec-notes')?.value || '';

    confirmWarehouseReception(activeReceptionExpenseId, qty, {
      receivedDate,
      remisionNumber,
      receivedBy,
      notes,
      evidence: currentReceptionEvidence
    });
    showToast('Entrada a bodega registrada correctamente.', 'success');
    closeWarehouseReceptionModal();
    renderAlmacenView();
  } catch (err) {
    showToast(err.message, 'warning');
  }
}

export function openAlmacenReceptionEvidence(expenseId) {
  const rec = getWarehouseReceptionsView().find(r => r.expenseId === expenseId);
  if (rec?.evidence) openExpenseEvidence(rec.evidence);
}

// --- Handlers Vale de Salida / Movimiento ---
export function openWarehouseMovementModal(kind = 'exit', preselectedInsumoKey = '') {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: no puedes emitir movimientos de almacén.', 'warning');
    return;
  }
  if (!guardTabUnlocked('almacen')) return;
  ensureAlmacenModalsRoot();

  draftExitKind = kind || 'exit';
  draftExitItems = [];

  const kindSel = document.getElementById('alm-mov-kind');
  if (kindSel) kindSel.value = draftExitKind;
  onAlmacenMovKindChange(draftExitKind);

  document.getElementById('alm-mov-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('alm-mov-recipient').value = '';
  document.getElementById('alm-mov-front').value = '';
  document.getElementById('alm-mov-target-project').value = '';
  document.getElementById('alm-mov-auth').value = getCurrentUser()?.name || '';
  document.getElementById('alm-mov-notes').value = '';
  document.getElementById('alm-mov-concept-qty').value = '';

  // Poblar selector de conceptos sin precios
  const conceptSel = document.getElementById('alm-mov-concept-select');
  if (conceptSel) {
    const concepts = getConceptCatalogForWarehouse();
    conceptSel.innerHTML = `<option value="">-- Salida manual (sin concepto) --</option>` + concepts.map(c =>
      `<option value="${escapeHtml(c.id)}" data-disp="${c.cantidadDisponible}" data-unit="${escapeHtml(c.unidad)}">[${escapeHtml(c.clave)}] ${escapeHtml(c.descripcion.slice(0, 48))} (Disp: ${formatNumber(c.cantidadDisponible)} ${escapeHtml(c.unidad)})</option>`
    ).join('');
  }

  // Poblar selector de stock en bodega
  const stockSummary = getWarehouseStockSummary();
  const stockSel = document.getElementById('alm-mov-add-stock-select');
  if (stockSel) {
    stockSel.innerHTML = `<option value="">-- Elegir material de bodega --</option>` + stockSummary.items.map(s =>
      `<option value="${escapeHtml(s.insumoKey)}">${escapeHtml(s.description.slice(0, 45))} (Stock: ${formatNumber(s.availableStock)} ${escapeHtml(s.unit)})</option>`
    ).join('');
  }

  if (preselectedInsumoKey) {
    const match = stockSummary.items.find(s => s.insumoKey === preselectedInsumoKey);
    if (match) {
      draftExitItems.push({
        insumoKey: match.insumoKey,
        insumoClave: match.insumoClave,
        description: match.description,
        unit: match.unit,
        tipo: match.tipo,
        availableStock: match.availableStock,
        qty: Math.min(1, match.availableStock > 0 ? match.availableStock : 1)
      });
    }
  }

  renderDraftExitItemsList();

  const modal = document.getElementById('almacen-modal-movement');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeWarehouseMovementModal() {
  const modal = document.getElementById('almacen-modal-movement');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  draftExitItems = [];
}

export function onAlmacenMovKindChange(kind) {
  draftExitKind = kind;
  const conceptBox = document.getElementById('alm-mov-concept-box');
  const targetProjWrap = document.getElementById('alm-mov-target-project-wrap');
  const authWrap = document.getElementById('alm-mov-auth-wrap');
  if (conceptBox) conceptBox.classList.toggle('hidden', kind !== 'exit');
  if (targetProjWrap) targetProjWrap.classList.toggle('hidden', kind !== 'transfer_out');
  if (authWrap) authWrap.classList.toggle('hidden', kind === 'transfer_out');
}

export function onAlmacenConceptSelectChange() {
  const sel = document.getElementById('alm-mov-concept-select');
  const opt = sel?.options[sel.selectedIndex];
  const qtyEl = document.getElementById('alm-mov-concept-qty');
  if (opt && opt.value && qtyEl && !qtyEl.value) {
    const disp = parseFloat(opt.getAttribute('data-disp')) || 1;
    qtyEl.value = disp > 0 ? disp : 1;
  }
}

export function explodeConceptIntoAlmacenExit() {
  const conceptId = document.getElementById('alm-mov-concept-select')?.value;
  const qtyConcept = parseFloat(document.getElementById('alm-mov-concept-qty')?.value) || 0;
  if (!conceptId || qtyConcept <= 0) {
    showToast('Selecciona un concepto y captura una cantidad mayor a 0.', 'warning');
    return;
  }
  const concept = getConceptCatalogForWarehouse().find(c => c.id === conceptId);
  if (!concept) return;

  const stockSummary = getWarehouseStockSummary();
  const stockMap = new Map(stockSummary.items.map(s => [s.insumoKey, s]));

  draftExitItems = (concept.insumos || [])
    .filter(ins => ins.tipo === 'Material' && String(ins.unidad || '').trim() !== '%')
    .map(ins => {
      const stk = stockMap.get(ins.insumoKey);
      const calcQty = round5(round5(ins.cantidadUnitaria) * round2(qtyConcept));
      return {
        insumoKey: ins.insumoKey,
        insumoClave: ins.clave,
        description: ins.descripcion,
        unit: ins.unidad,
        tipo: ins.tipo,
        availableStock: stk ? stk.availableStock : 0,
        qty: calcQty
      };
    });

  if (draftExitItems.length === 0) {
    showToast('La matriz de este concepto no tiene insumos físicos de Material listados.', 'info');
  }
  renderDraftExitItemsList();
}

export function addSelectedStockItemToDraftExit() {
  const key = document.getElementById('alm-mov-add-stock-select')?.value;
  if (!key) return;
  const match = getWarehouseStockSummary().items.find(s => s.insumoKey === key);
  if (!match) return;
  draftExitItems.push({
    insumoKey: match.insumoKey,
    insumoClave: match.insumoClave,
    description: match.description,
    unit: match.unit,
    tipo: match.tipo,
    availableStock: match.availableStock,
    qty: 1
  });
  renderDraftExitItemsList();
}

export function addBlankManualItemToDraftExit() {
  draftExitItems.push({
    insumoKey: '',
    insumoClave: 'HER',
    description: '',
    unit: 'pza',
    tipo: draftExitKind === 'tool_loan' ? 'Herramienta' : 'Material',
    availableStock: null,
    qty: 1
  });
  renderDraftExitItemsList();
}

export function updateDraftExitItem(idx, field, value) {
  if (!draftExitItems[idx]) return;
  if (field === 'qty') {
    draftExitItems[idx].qty = parseFloat(value) || 0;
  } else {
    draftExitItems[idx][field] = value;
  }
}

export function removeDraftExitItem(idx) {
  draftExitItems.splice(idx, 1);
  renderDraftExitItemsList();
}

function renderDraftExitItemsList() {
  const box = document.getElementById('alm-mov-items-list');
  if (!box) return;
  if (draftExitItems.length === 0) {
    box.innerHTML = `<div class="p-4 text-center text-slate-400 text-[11px] bg-white border border-slate-200 rounded-lg">No hay renglones aún. Carga los insumos de un concepto o agrega materiales de bodega.</div>`;
    return;
  }

  box.innerHTML = draftExitItems.map((it, idx) => {
    const lowStock = it.availableStock !== null && (draftExitKind === 'exit' || draftExitKind === 'transfer_out') && it.qty > it.availableStock;
    return `
      <div class="p-2 bg-white border ${lowStock ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'} rounded-lg grid grid-cols-12 gap-1.5 items-center text-[11px]">
        <div class="col-span-6">
          <input type="text" value="${escapeHtml(it.description)}" oninput="updateDraftExitItem(${idx}, 'description', this.value)"
                 placeholder="Descripción del material o herramienta"
                 class="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-slate-800">
          ${it.availableStock !== null ? `<div class="text-[9.5px] ${lowStock ? 'text-amber-700 font-bold' : 'text-slate-400'} mt-0.5">En bodega: ${formatNumber(it.availableStock)} ${escapeHtml(it.unit)}</div>` : ''}
        </div>
        <div class="col-span-2">
          <input type="text" value="${escapeHtml(it.unit)}" oninput="updateDraftExitItem(${idx}, 'unit', this.value)"
                 class="w-full bg-slate-50 border border-slate-200 rounded px-1.5 py-1 text-center font-mono">
        </div>
        <div class="col-span-3">
          <input type="number" value="${it.qty}" step="any" oninput="updateDraftExitItem(${idx}, 'qty', this.value)"
                 class="w-full bg-white border border-slate-300 rounded px-2 py-1 text-right font-mono font-bold text-slate-900">
        </div>
        <div class="col-span-1 text-center">
          <button type="button" onclick="removeDraftExitItem(${idx})" class="text-slate-400 hover:text-rose-600 cursor-pointer p-1">
            <i class="fa-solid fa-trash-can text-[11px]"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

export function saveWarehouseMovementModal() {
  try {
    const conceptId = draftExitKind === 'exit' ? (document.getElementById('alm-mov-concept-select')?.value || '') : '';
    const concept = conceptId ? getConceptCatalogForWarehouse().find(c => c.id === conceptId) : null;
    const conceptQty = conceptId ? (parseFloat(document.getElementById('alm-mov-concept-qty')?.value) || 0) : 0;

    const payload = {
      kind: draftExitKind,
      date: document.getElementById('alm-mov-date')?.value || new Date().toISOString().slice(0, 10),
      recipientName: document.getElementById('alm-mov-recipient')?.value || '',
      frontName: document.getElementById('alm-mov-front')?.value || '',
      authorizedBy: document.getElementById('alm-mov-auth')?.value || '',
      targetProjectName: document.getElementById('alm-mov-target-project')?.value || '',
      notes: document.getElementById('alm-mov-notes')?.value || '',
      conceptId: concept ? concept.id : '',
      conceptClave: concept ? concept.clave : '',
      conceptDesc: concept ? concept.descripcion : '',
      conceptUnit: concept ? concept.unidad : '',
      conceptQty,
      items: draftExitItems,
      allowNegativeStock: draftExitKind === 'tool_loan' || draftExitKind === 'return' || draftExitKind === 'adjustment'
    };

    const created = createWarehouseMovement(payload);
    showToast(`Movimiento ${created.folio} guardado correctamente.`, 'success');
    closeWarehouseMovementModal();
    renderAlmacenView();
  } catch (err) {
    showToast(err.message, 'warning');
  }
}

export function returnAlmacenToolAction(movementId) {
  if (!canCurrentUserEditProject() || !guardTabUnlocked('almacen')) return;
  markToolLoanReturned(movementId);
  showToast('Herramienta marcada como devuelta a bodega.', 'success');
  renderAlmacenView();
}

export function toggleCancelAlmacenMovementAction(movementId) {
  if (!canCurrentUserEditProject() || !guardTabUnlocked('almacen')) return;
  cancelWarehouseMovement(movementId);
  showToast('Estatus del movimiento actualizado.', 'info');
  renderAlmacenView();
}

export function deleteAlmacenMovementAction(movementId) {
  if (!canCurrentUserEditProject() || !guardTabUnlocked('almacen')) return;
  if (confirm('¿Eliminar este movimiento de almacén?')) {
    deleteWarehouseMovement(movementId);
    showToast('Movimiento eliminado.', 'info');
    renderAlmacenView();
  }
}

export function printWarehouseExitAction(movementId) {
  printWarehouseExitVoucher(movementId);
}

export function printAlmacenActiveReportAction() {
  printAlmacenActiveReport(activeAlmacenSubTab);
}

export function exportAlmacenExcelAction() {
  exportAlmacenToExcel();
}

// --- Handlers Firmas de Almacén ---
export function openAlmacenSignaturesModal() {
  ensureAlmacenModalsRoot();
  draftAlmacenSignatures = getAlmacenSignatures().map(s => ({ ...s }));
  renderAlmacenSignaturesForm();
  const modal = document.getElementById('almacen-modal-firmas');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeAlmacenSignaturesModal() {
  const modal = document.getElementById('almacen-modal-firmas');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function renderAlmacenSignaturesForm() {
  const container = document.getElementById('almacen-firmas-list');
  if (!container) return;
  container.innerHTML = draftAlmacenSignatures.map((sig, idx) => `
    <div class="bg-white p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
      <div class="flex justify-between items-center">
        <span class="font-bold text-slate-700">Firmante #${idx + 1}</span>
        ${draftAlmacenSignatures.length > 1 ? `<button type="button" onclick="removeAlmacenSignatureRow(${idx})" class="text-rose-600 text-[11px] cursor-pointer">Quitar</button>` : ''}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <input type="text" value="${escapeHtml(sig.rol)}" oninput="updateDraftAlmacenSignature(${idx}, 'rol', this.value)" placeholder="Rol" class="bg-slate-50 border border-slate-300 rounded px-2 py-1 font-bold uppercase">
        <input type="text" value="${escapeHtml(sig.nombre)}" oninput="updateDraftAlmacenSignature(${idx}, 'nombre', this.value)" placeholder="Nombre" class="bg-slate-50 border border-slate-300 rounded px-2 py-1">
      </div>
      <input type="text" value="${escapeHtml(sig.cargo)}" oninput="updateDraftAlmacenSignature(${idx}, 'cargo', this.value)" placeholder="Cargo" class="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1">
    </div>
  `).join('');
}

export function addAlmacenSignatureRow() {
  if (draftAlmacenSignatures.length >= 5) return;
  draftAlmacenSignatures.push({ rol: 'FIRMA', nombre: '', cargo: '' });
  renderAlmacenSignaturesForm();
}

export function removeAlmacenSignatureRow(idx) {
  if (draftAlmacenSignatures.length <= 1) return;
  draftAlmacenSignatures.splice(idx, 1);
  renderAlmacenSignaturesForm();
}

export function updateDraftAlmacenSignature(idx, field, val) {
  if (draftAlmacenSignatures[idx]) draftAlmacenSignatures[idx][field] = val;
}

export function resetDefaultAlmacenSignatures() {
  draftAlmacenSignatures = getDefaultAlmacenSignatures().map(s => ({ ...s }));
  renderAlmacenSignaturesForm();
}

export function saveAlmacenSignaturesModal() {
  saveAlmacenSignatures(draftAlmacenSignatures);
  closeAlmacenSignaturesModal();
  showToast('Firmas de Almacén guardadas.', 'success');
}

if (typeof window !== 'undefined') {
  window.renderAlmacenView = renderAlmacenView;
  window.switchAlmacenSubTab = switchAlmacenSubTab;
  window.onAlmacenSearchChange = onAlmacenSearchChange;
  window.openWarehouseReceptionModal = openWarehouseReceptionModal;
  window.closeWarehouseReceptionModal = closeWarehouseReceptionModal;
  window.onAlmacenReceptionFileChange = onAlmacenReceptionFileChange;
  window.saveWarehouseReceptionModal = saveWarehouseReceptionModal;
  window.openAlmacenReceptionEvidence = openAlmacenReceptionEvidence;
  window.openWarehouseMovementModal = openWarehouseMovementModal;
  window.closeWarehouseMovementModal = closeWarehouseMovementModal;
  window.onAlmacenMovKindChange = onAlmacenMovKindChange;
  window.onAlmacenConceptSelectChange = onAlmacenConceptSelectChange;
  window.explodeConceptIntoAlmacenExit = explodeConceptIntoAlmacenExit;
  window.addSelectedStockItemToDraftExit = addSelectedStockItemToDraftExit;
  window.addBlankManualItemToDraftExit = addBlankManualItemToDraftExit;
  window.updateDraftExitItem = updateDraftExitItem;
  window.removeDraftExitItem = removeDraftExitItem;
  window.saveWarehouseMovementModal = saveWarehouseMovementModal;
  window.returnAlmacenToolAction = returnAlmacenToolAction;
  window.toggleCancelAlmacenMovementAction = toggleCancelAlmacenMovementAction;
  window.deleteAlmacenMovementAction = deleteAlmacenMovementAction;
  window.printWarehouseExitAction = printWarehouseExitAction;
  window.printAlmacenActiveReportAction = printAlmacenActiveReportAction;
  window.exportAlmacenExcelAction = exportAlmacenExcelAction;
  window.openAlmacenSignaturesModal = openAlmacenSignaturesModal;
  window.closeAlmacenSignaturesModal = closeAlmacenSignaturesModal;
  window.addAlmacenSignatureRow = addAlmacenSignatureRow;
  window.removeAlmacenSignatureRow = removeAlmacenSignatureRow;
  window.updateDraftAlmacenSignature = updateDraftAlmacenSignature;
  window.resetDefaultAlmacenSignatures = resetDefaultAlmacenSignatures;
  window.saveAlmacenSignaturesModal = saveAlmacenSignaturesModal;
}
