// js/modules/compras/conceptExplosionUI.js
// Controlador visual de Compras por Explosión de Concepto(s), Proyección de Calendario y Seguimiento por Concepto

import { formatCurrency, formatNumber, round2 } from '../../core/formatters.js?v=20261119_cf35';
import { showToast } from '../../ui/notifications.js?v=20261119_cf35';
import {
  getExpensesSuppliers,
  getSupplierById,
  saveExpenseRecordsBatch,
  generateNextOrderGroupId,
  getExpensesRecords
} from './expensesModel.js?v=20261119_cf35';
import {
  getLeafConceptsCatalogSummary,
  explodeWeeklyConceptsBasket,
  getCalendarUpcomingConceptsSummary,
  getConceptCostTrackingReport
} from './conceptExplosionHelper.js?v=20261119_cf35';

let weeklyBasket = []; // [{ conceptId, qtyToExecute, moveType }]
let explodedRows = []; // Filas editables generadas de weeklyBasket
let conceptPickerSearch = '';
let selectedConceptId = '';
let conceptPickerQtyDraft = '';
let conceptPickerMoveType = 'advance';
let comparativaConceptSearch = '';
let comparativaConceptShowAll = false;

let batchHeader = {
  date: new Date().toISOString().slice(0, 10),
  destination: 'direct',
  supplierId: '',
  paymentStatus: 'paid',
  paymentMethod: 'transfer',
  dueDate: '',
  applyTax: true,
  notes: ''
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function resetConceptExplosionPanel(preselectedConceptId = null) {
  weeklyBasket = [];
  explodedRows = [];
  conceptPickerSearch = '';
  selectedConceptId = '';
  conceptPickerQtyDraft = '';
  conceptPickerMoveType = 'advance';
  batchHeader = {
    date: new Date().toISOString().slice(0, 10),
    destination: 'direct',
    supplierId: '',
    paymentStatus: 'paid',
    paymentMethod: 'transfer',
    dueDate: '',
    applyTax: true,
    notes: ''
  };

  if (preselectedConceptId) {
    const concepts = getLeafConceptsCatalogSummary();
    const target = concepts.find(c => c.id === preselectedConceptId || c.clave === preselectedConceptId);
    if (target) {
      const defQty = target.cantidadDisponible > 0 ? target.cantidadDisponible : 1;
      weeklyBasket.push({
        conceptId: target.id,
        qtyToExecute: defQty,
        moveType: target.cantidadDisponible > 0 ? 'advance' : 'replacement'
      });
    }
  }

  recomputeExplodedRows(true);
  renderConceptExplosionPanel();
}

function recomputeExplodedRows(resetSelections = false) {
  if (weeklyBasket.length === 0) {
    explodedRows = [];
    return;
  }

  const prevMap = new Map();
  if (!resetSelections) {
    explodedRows.forEach(r => prevMap.set(r.insumoKey, r));
  }

  const result = explodeWeeklyConceptsBasket(weeklyBasket);
  explodedRows = (result.insumos || []).map(item => {
    const prev = prevMap.get(item.insumoKey);
    return {
      ...item,
      checked: prev ? prev.checked : item.checkedDefault,
      qtyToOrder: item.cantidadCalculada,
      unitPriceToOrder: prev ? prev.unitPriceToOrder : round2(item.suggestedPrice || item.puPresupuestado || 0),
      supplierId: prev ? prev.supplierId : batchHeader.supplierId,
      hasUnreviewedMatrix: result.hasUnreviewedMatrices
    };
  });
}

export function renderConceptExplosionPanel() {
  const container = document.getElementById('expense-mode-concept-panel');
  if (!container) return;

  const concepts = getLeafConceptsCatalogSummary();
  const suppliers = getExpensesSuppliers();
  const q = (conceptPickerSearch || '').trim().toLowerCase();
  const filteredConcepts = q
    ? concepts.filter(c =>
        (c.clave || '').toLowerCase().includes(q)
        || (c.descripcion || '').toLowerCase().includes(q)
        || (c.partida || '').toLowerCase().includes(q)
      )
    : concepts;

  const activePickerConcept = selectedConceptId
    ? (concepts.find(c => String(c.id) === String(selectedConceptId)) || null)
    : null;
  const activeBudgetQtyDisplay = activePickerConcept ? formatNumber(activePickerConcept.cantidadPresupuestada) : '';
  const activeUnitDisplay = activePickerConcept ? (activePickerConcept.unidad || 'ud') : '';

  const basketSummary = explodeWeeklyConceptsBasket(weeklyBasket);
  const selectedRows = explodedRows.filter(r => r.checked && (parseFloat(r.qtyToOrder) || 0) > 0);
  const subTotal = round2(selectedRows.reduce((s, r) => s + ((parseFloat(r.qtyToOrder) || 0) * (parseFloat(r.unitPriceToOrder) || 0)), 0));
  const taxTotal = batchHeader.applyTax ? round2(subTotal * 0.16) : 0;
  const grandTotal = round2(subTotal + taxTotal);

  // Contar cuántas Órdenes Agrupadas por proveedor saldrán
  const distinctSuppliers = new Set(selectedRows.map(r => r.supplierId || '__varios__'));

  container.innerHTML = `
    <div class="space-y-3 text-xs">
      <!-- Paso 1: Selector de Conceptos y Proyección de Calendario -->
      <div class="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-extrabold text-indigo-950 flex items-center gap-1.5">
            <i class="fa-solid fa-diagram-project text-indigo-600"></i> 1. Elige Concepto(s) del Frente Semanal:
          </span>
          <div class="flex items-center gap-1.5">
            <button type="button" onclick="loadCalendarSuggestionsIntoBasket(7)" class="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 text-[10.5px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs" title="Cargar conceptos programados en Calendario para los próximos 7 días">
              <i class="fa-solid fa-calendar-week text-amber-600"></i> Proyectar Próx. 7 días
            </button>
            <button type="button" onclick="loadCalendarSuggestionsIntoBasket(15)" class="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 text-[10.5px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs" title="Cargar conceptos programados para los próximos 15 días">
              <i class="fa-solid fa-calendar-days text-amber-600"></i> 15 días
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <div class="sm:col-span-5">
              <input type="text" id="concept-picker-search-input" value="${escapeHtml(conceptPickerSearch)}"
                     oninput="onConceptPickerSearchInput(this.value)"
                     placeholder="Filtrar concepto por clave o nombre (ej: Castillo C-1, Trabe)..."
                     class="w-full px-2.5 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs text-slate-800">
            </div>
            <div class="sm:col-span-7">
              <select id="concept-picker-select" onchange="onConceptPickerSelectChange()" class="w-full bg-white border border-indigo-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800">
                <option value="">-- Seleccionar concepto del catálogo (${filteredConcepts.length}) --</option>
                ${filteredConcepts.map(c => `
                  <option value="${escapeHtml(c.id)}" ${String(c.id) === String(selectedConceptId) ? 'selected' : ''} data-disp="${c.cantidadDisponible}" data-unit="${escapeHtml(c.unidad)}" data-pres="${c.cantidadPresupuestada}">
                    [${escapeHtml(c.clave)}] ${escapeHtml(c.descripcion)}
                  </option>
                `).join('')}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
            <div class="col-span-1 sm:col-span-3">
              <label for="concept-picker-budget-qty" class="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1" title="Cantidad total considerada en el presupuesto (no editable)">
                <i class="fa-solid fa-lock text-[9px] text-slate-400"></i>
                <span>Cant. Presupuesto:</span>
              </label>
              <input type="text" id="concept-picker-budget-qty"
                     value="${escapeHtml(activeBudgetQtyDisplay)}"
                     placeholder="—"
                     readonly disabled tabindex="-1"
                     aria-label="Cantidad considerada en el presupuesto (solo lectura)"
                     title="Cantidad considerada en el presupuesto (valor fijo no editable)"
                     class="w-full bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-2 font-mono font-bold text-right text-slate-600 cursor-not-allowed select-none">
            </div>
            <div class="col-span-1 sm:col-span-2">
              <label for="concept-picker-unit" class="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1" title="Unidad por defecto del presupuesto (no editable)">
                <i class="fa-solid fa-lock text-[9px] text-slate-400"></i>
                <span>Unidad:</span>
              </label>
              <input type="text" id="concept-picker-unit"
                     value="${escapeHtml(activeUnitDisplay)}"
                     placeholder="—"
                     readonly disabled tabindex="-1"
                     aria-label="Unidad del concepto por defecto en el presupuesto (solo lectura)"
                     title="Unidad por defecto del concepto en el presupuesto (valor fijo no editable)"
                     class="w-full bg-slate-100 border border-slate-300 rounded-lg px-2 py-2 font-mono font-bold text-center text-slate-600 cursor-not-allowed select-none">
            </div>
            <div class="col-span-1 sm:col-span-3">
              <label for="concept-picker-qty-input" class="block text-[10px] font-bold text-indigo-950 mb-1">Cant. a hacer:</label>
              <input type="number" id="concept-picker-qty-input" min="0" step="any" placeholder="Ej: 40"
                     value="${escapeHtml(conceptPickerQtyDraft)}"
                     oninput="onConceptPickerQtyInput(this.value)"
                     class="w-full bg-white border border-indigo-300 rounded-lg px-2.5 py-2 font-mono font-bold text-right text-slate-900 focus:outline-none focus:border-indigo-500">
            </div>
            <div class="col-span-1 sm:col-span-2">
              <label for="concept-picker-movetype" class="block text-[10px] font-bold text-slate-600 mb-1">Tipo:</label>
              <select id="concept-picker-movetype" onchange="onConceptPickerMoveTypeChange(this.value)" class="w-full bg-white border border-indigo-200 rounded-lg p-2 text-[11px] font-semibold text-slate-800">
                <option value="advance" ${conceptPickerMoveType === 'advance' ? 'selected' : ''}>Avance nuevo</option>
                <option value="replacement" ${conceptPickerMoveType === 'replacement' ? 'selected' : ''}>Reposición (0 m)</option>
              </select>
            </div>
            <div class="col-span-2 sm:col-span-2">
              <button type="button" onclick="addConceptToWeeklyBasket()" class="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-xs">
                + Agregar
              </button>
            </div>
          </div>
        </div>

        ${weeklyBasket.length > 0 ? `
          <div class="pt-2 border-t border-indigo-200/70 space-y-1.5">
            <div class="text-[10.5px] font-bold text-indigo-900 uppercase tracking-wide">Conceptos en esta Requisición (${weeklyBasket.length}):</div>
            <div class="space-y-1">
              ${basketSummary.concepts.map((c, idx) => `
                <div class="flex flex-wrap items-center justify-between gap-2 bg-white border ${c.exceedsLimit ? 'border-rose-300 bg-rose-50/40' : 'border-indigo-200'} rounded-lg px-2.5 py-1.5">
                  <div class="min-w-0 flex-1">
                    <div class="font-bold text-slate-900 truncate">[${escapeHtml(c.conceptClave)}] ${escapeHtml(c.conceptDesc)}</div>
                    <div class="text-[10px] ${c.exceedsLimit ? 'text-rose-700 font-bold' : 'text-slate-500'}">
                      Presup: <strong>${formatNumber(c.cantidadPresupuestada)} ${escapeHtml(c.unidad)}</strong> ·
                      Disponible: ${formatNumber(c.cantidadDisponible)} ${escapeHtml(c.unidad)} ·
                      ${c.moveType === 'replacement' ? 'Modo: Reposición/Extra (no suma avance)' : (c.exceedsLimit ? '⚠️ Excede el disponible presupuestado' : 'Modo: Avance nuevo')}
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <input type="number" value="${c.qtyToExecute}" min="0" step="any"
                           onchange="updateWeeklyBasketQty(${idx}, this.value)"
                           class="w-20 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-right font-mono font-bold text-slate-900">
                    <span class="text-[10.5px] font-bold text-slate-600 w-8">${escapeHtml(c.unidad)}</span>
                    <button type="button" onclick="removeConceptFromWeeklyBasket(${idx})" class="text-slate-400 hover:text-rose-600 p-1 cursor-pointer" title="Quitar">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
            ${basketSummary.hasUnreviewedMatrices ? `
              <div class="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[10.5px] text-amber-800 flex items-center gap-1.5">
                <i class="fa-solid fa-triangle-exclamation text-amber-600"></i>
                <span>Al menos un concepto usa una matriz base generada automáticamente; verifica las cantidades calculadas antes de emitir tu orden.</span>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Paso 2: Configuración de Orden y Destino -->
      ${explodedRows.length > 0 ? `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-extrabold text-slate-900">2. Insumos Explotados (${explodedRows.length}) — Ajusta cantidades, proveedor y destino:</span>
            <div class="flex items-center gap-1 text-[10.5px]">
              <button type="button" onclick="selectExplodedRowsByFilter('materials')" class="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold cursor-pointer">Solo Materiales</button>
              <button type="button" onclick="selectExplodedRowsByFilter('all')" class="px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold cursor-pointer">Todos (físicos)</button>
              <button type="button" onclick="selectExplodedRowsByFilter('none')" class="px-2 py-1 rounded bg-white hover:bg-slate-100 text-slate-500 border border-slate-300 cursor-pointer">Ninguno</button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div>
              <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Destino Compra:</label>
              <select onchange="updateBatchHeaderField('destination', this.value)" class="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-[11px] font-bold text-slate-800">
                <option value="direct" ${batchHeader.destination === 'direct' ? 'selected' : ''}>🏗️ Directo a Obra</option>
                <option value="warehouse" ${batchHeader.destination === 'warehouse' ? 'selected' : ''}>📦 Enviar a Almacén</option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Proveedor General:</label>
              <select onchange="applyBatchDefaultSupplier(this.value)" class="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-[11px] text-slate-800">
                <option value="">-- Varios / Por fila --</option>
                ${suppliers.map(s => `<option value="${escapeHtml(s.id)}" ${batchHeader.supplierId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Fecha:</label>
              <input type="date" value="${escapeHtml(batchHeader.date)}" onchange="updateBatchHeaderField('date', this.value)" class="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-[11px]">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Pago:</label>
              <select onchange="updateBatchHeaderField('paymentStatus', this.value)" class="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-[11px] font-bold">
                <option value="paid" ${batchHeader.paymentStatus === 'paid' ? 'selected' : ''}>✅ Pagado</option>
                <option value="pending" ${batchHeader.paymentStatus === 'pending' ? 'selected' : ''}>⏳ Por Pagar</option>
              </select>
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-600 mb-0.5">Vencimiento / IVA:</label>
              <div class="flex items-center gap-1.5">
                <input type="date" value="${escapeHtml(batchHeader.dueDate)}" onchange="updateBatchHeaderField('dueDate', this.value)" title="Vencimiento crédito (opcional)" class="w-full bg-white border border-slate-300 rounded-lg p-1.5 text-[10px] ${batchHeader.paymentStatus !== 'pending' ? 'opacity-50' : ''}">
                <label class="flex items-center gap-1 text-[10px] font-bold text-slate-700 shrink-0 cursor-pointer">
                  <input type="checkbox" ${batchHeader.applyTax ? 'checked' : ''} onchange="updateBatchHeaderField('applyTax', this.checked)"> IVA
                </label>
              </div>
            </div>
          </div>

          <!-- Lista de Insumos Explotados -->
          <div class="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div class="max-h-60 overflow-y-auto custom-scroll">
              <table class="w-full text-left text-[11px] border-collapse">
                <thead class="bg-slate-800 text-white sticky top-0 z-10">
                  <tr>
                    <th class="p-1.5 w-7 text-center">✓</th>
                    <th class="p-1.5 min-w-[180px]">Insumo / Saldo Obra & Bodega</th>
                    <th class="p-1.5 w-24 text-right">Cantidad</th>
                    <th class="p-1.5 w-14 text-center">Unid.</th>
                    <th class="p-1.5 w-36">Proveedor</th>
                    <th class="p-1.5 w-24 text-right">P.U. ($)</th>
                    <th class="p-1.5 w-24 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${explodedRows.map((row, idx) => {
                    const rowSub = round2((parseFloat(row.qtyToOrder) || 0) * (parseFloat(row.unitPriceToOrder) || 0));
                    const overBudgetPU = row.puPresupuestado > 0 && (parseFloat(row.unitPriceToOrder) || 0) > row.puPresupuestado * 1.001;
                    const bestHist = row.priceHistory && row.priceHistory[0];
                    return `
                      <tr class="${row.checked ? 'bg-white' : 'bg-slate-50 opacity-60'} hover:bg-blue-50/40">
                        <td class="p-1.5 text-center">
                          <input type="checkbox" ${row.checked ? 'checked' : ''} onchange="updateExplodedRowField(${idx}, 'checked', this.checked)" class="cursor-pointer rounded text-blue-600">
                        </td>
                        <td class="p-1.5">
                          <div class="font-bold text-slate-900 leading-tight">${escapeHtml(row.descripcion)}</div>
                          <div class="text-[9.5px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span class="px-1 rounded bg-slate-100 text-slate-700 font-semibold">${escapeHtml(row.tipo)}</span>
                            <span>Calc: <strong>${formatNumber(row.cantidadCalculada)}</strong></span>
                            ${row.stockEnBodega > 0 ? `<span class="px-1 rounded bg-sky-100 text-sky-800 font-bold">Bodega: ${formatNumber(row.stockEnBodega)}</span>` : ''}
                            <span class="${row.budgetSaldoQty < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700'}">Disp. Obra: ${formatNumber(row.budgetSaldoQty)}</span>
                            ${bestHist ? `<span class="text-indigo-700" title="Último precio pagado">Hist: ${formatCurrency(bestHist.lastPrice)}</span>` : ''}
                          </div>
                        </td>
                        <td class="p-1.5">
                          <input type="number" value="${row.qtyToOrder}" min="0" step="any"
                                 oninput="updateExplodedRowField(${idx}, 'qtyToOrder', this.value)"
                                 class="w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-1 text-right font-mono font-bold text-slate-900">
                        </td>
                        <td class="p-1.5 text-center font-mono text-slate-600">${escapeHtml(row.unidad)}</td>
                        <td class="p-1.5">
                          <select onchange="updateExplodedRowField(${idx}, 'supplierId', this.value)" class="w-full bg-slate-50 border border-slate-300 rounded px-1 py-1 text-[10.5px]">
                            <option value="">Varios</option>
                            ${suppliers.map(s => `<option value="${escapeHtml(s.id)}" ${row.supplierId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
                          </select>
                        </td>
                        <td class="p-1.5">
                          <input type="number" value="${row.unitPriceToOrder}" min="0" step="any"
                                 oninput="updateExplodedRowField(${idx}, 'unitPriceToOrder', this.value)"
                                 title="Presup. Base: ${formatCurrency(row.puPresupuestado)}"
                                 class="w-full ${overBudgetPU ? 'bg-rose-50 border-rose-400 text-rose-800' : 'bg-slate-50 border-slate-300 text-slate-900'} border rounded px-1.5 py-1 text-right font-mono font-bold">
                        </td>
                        <td class="p-1.5 text-right font-mono font-bold text-slate-900">${formatCurrency(rowSub)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div class="text-slate-600">
              Seleccionados: <strong>${selectedRows.length}</strong> insumo(s) → Generará <strong>${distinctSuppliers.size || 0}</strong> Orden(es) de Compra
            </div>
            <div class="flex items-center gap-4 font-mono">
              <span>Sub: <strong>${formatCurrency(subTotal)}</strong></span>
              <span>IVA: <strong>${formatCurrency(taxTotal)}</strong></span>
              <span class="text-sm font-black text-blue-800">Total: ${formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>
      ` : `
        <div class="p-6 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
          <i class="fa-solid fa-cubes-stacked text-2xl text-slate-300 mb-1.5 block"></i>
          Agrega uno o más conceptos arriba (o usa <strong>Proyectar Próx. 7 días</strong> desde tu Calendario) para explotar automáticamente sus matrices.
        </div>
      `}
    </div>
  `;
}

export function onConceptPickerSearchInput(val) {
  conceptPickerSearch = val;
  renderConceptExplosionPanel();
  const input = document.getElementById('concept-picker-search-input');
  if (input) {
    input.focus();
    input.setSelectionRange(val.length, val.length);
  }
}

export function onConceptPickerQtyInput(val) {
  conceptPickerQtyDraft = val;
}

export function onConceptPickerMoveTypeChange(val) {
  conceptPickerMoveType = val || 'advance';
}

export function onConceptPickerSelectChange() {
  const sel = document.getElementById('concept-picker-select');
  const opt = sel?.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
  const qtyInput = document.getElementById('concept-picker-qty-input');
  const budgetQtyInput = document.getElementById('concept-picker-budget-qty');
  const unitInput = document.getElementById('concept-picker-unit');

  selectedConceptId = sel?.value || '';

  if (selectedConceptId) {
    let pres = NaN;
    let disp = NaN;
    let unit = '';
    if (opt && opt.value === selectedConceptId) {
      disp = parseFloat(opt.getAttribute('data-disp'));
      pres = parseFloat(opt.getAttribute('data-pres'));
      unit = opt.getAttribute('data-unit') || '';
    }
    if (isNaN(pres) || !unit) {
      const conceptObj = getLeafConceptsCatalogSummary().find(c => String(c.id) === String(selectedConceptId));
      if (conceptObj) {
        if (isNaN(pres)) pres = conceptObj.cantidadPresupuestada;
        if (isNaN(disp)) disp = conceptObj.cantidadDisponible;
        if (!unit) unit = conceptObj.unidad || 'ud';
      }
    }
    const safePres = isNaN(pres) ? 0 : pres;
    const nextQty = (!isNaN(disp) && disp > 0) ? disp : (safePres > 0 ? safePres : 1);
    conceptPickerQtyDraft = String(nextQty);
    if (qtyInput) qtyInput.value = conceptPickerQtyDraft;
    if (budgetQtyInput) budgetQtyInput.value = formatNumber(safePres);
    if (unitInput) unitInput.value = unit || 'ud';
  } else {
    conceptPickerQtyDraft = '';
    if (qtyInput) qtyInput.value = '';
    if (budgetQtyInput) budgetQtyInput.value = '';
    if (unitInput) unitInput.value = '';
  }
}

export function addConceptToWeeklyBasket() {
  const conceptId = document.getElementById('concept-picker-select')?.value;
  const qty = parseFloat(document.getElementById('concept-picker-qty-input')?.value) || 0;
  const moveType = document.getElementById('concept-picker-movetype')?.value || conceptPickerMoveType || 'advance';
  if (!conceptId || qty <= 0) {
    showToast('Selecciona un concepto y captura una cantidad mayor a 0.', 'warning');
    return;
  }

  const existing = weeklyBasket.find(b => b.conceptId === conceptId && b.moveType === moveType);
  if (existing) {
    existing.qtyToExecute = round2(existing.qtyToExecute + qty);
  } else {
    weeklyBasket.push({ conceptId, qtyToExecute: round2(qty), moveType });
  }
  selectedConceptId = '';
  conceptPickerQtyDraft = '';
  conceptPickerMoveType = 'advance';
  recomputeExplodedRows(false);
  renderConceptExplosionPanel();
}

export function loadCalendarSuggestionsIntoBasket(days = 7) {
  const suggestions = getCalendarUpcomingConceptsSummary(days);
  if (suggestions.length === 0) {
    showToast(`No hay conceptos pendientes programados en el Calendario para los próximos ${days} días.`, 'info');
    return;
  }
  suggestions.forEach(sug => {
    const existing = weeklyBasket.find(b => b.conceptId === sug.conceptId);
    if (!existing) {
      weeklyBasket.push({
        conceptId: sug.conceptId,
        qtyToExecute: sug.suggestedQty,
        moveType: 'advance'
      });
    }
  });
  recomputeExplodedRows(false);
  renderConceptExplosionPanel();
  showToast(`${suggestions.length} concepto(s) cargados desde el Calendario (${days} días).`, 'success');
}

export function updateWeeklyBasketQty(idx, val) {
  if (!weeklyBasket[idx]) return;
  weeklyBasket[idx].qtyToExecute = Math.max(0, round2(parseFloat(val) || 0));
  recomputeExplodedRows(false);
  renderConceptExplosionPanel();
}

export function removeConceptFromWeeklyBasket(idx) {
  weeklyBasket.splice(idx, 1);
  recomputeExplodedRows(false);
  renderConceptExplosionPanel();
}

export function selectExplodedRowsByFilter(mode) {
  explodedRows.forEach(r => {
    if (mode === 'materials') {
      r.checked = r.tipo === 'Material' && !r.isPercentUnit;
    } else if (mode === 'all') {
      r.checked = !r.isPercentUnit;
    } else {
      r.checked = false;
    }
  });
  renderConceptExplosionPanel();
}

export function updateBatchHeaderField(field, value) {
  batchHeader[field] = value;
  if (field === 'applyTax' || field === 'paymentStatus') {
    renderConceptExplosionPanel();
  }
}

export function applyBatchDefaultSupplier(supId) {
  batchHeader.supplierId = supId;
  explodedRows.forEach(r => { r.supplierId = supId; });
  renderConceptExplosionPanel();
}

export function updateExplodedRowField(idx, field, value) {
  const row = explodedRows[idx];
  if (!row) return;
  if (field === 'checked') {
    row.checked = Boolean(value);
    renderConceptExplosionPanel();
  } else if (field === 'qtyToOrder') {
    row.qtyToOrder = Math.max(0, parseFloat(value) || 0);
  } else if (field === 'unitPriceToOrder') {
    row.unitPriceToOrder = Math.max(0, parseFloat(value) || 0);
  } else if (field === 'supplierId') {
    row.supplierId = value;
    // Si tiene historial para este proveedor y no se ha editado manualmente, sugerir su último precio
    const hist = (row.priceHistory || []).find(h => h.supplierId === value);
    if (hist && hist.lastPrice > 0) {
      row.unitPriceToOrder = hist.lastPrice;
    }
    renderConceptExplosionPanel();
  }
}

export function saveConceptExplosionOrders() {
  const chosen = explodedRows.filter(r => r.checked && (parseFloat(r.qtyToOrder) || 0) > 0);
  if (chosen.length === 0) {
    showToast('Selecciona al menos un insumo con cantidad mayor a 0 para generar órdenes.', 'warning');
    return false;
  }

  const summary = explodeWeeklyConceptsBasket(weeklyBasket);
  const conceptBatchId = `expbatch_${Date.now()}`;
  const totalConceptAmt = summary.concepts.length;
  const conceptLinksBase = summary.concepts.map(c => ({
    conceptId: c.conceptId,
    conceptClave: c.conceptClave,
    conceptDesc: c.conceptDesc,
    qtyCovered: c.qtyToExecute,
    moveType: c.moveType,
    shareRatio: totalConceptAmt > 0 ? (1 / totalConceptAmt) : 1
  }));
  const primaryConcept = summary.concepts[0] || null;
  const catLabel = summary.concepts.map(c => c.partida).filter((v, i, a) => v && a.indexOf(v) === i).join(', ') || 'Explosión Semanal';

  const typeMap = {
    'Material': 'material',
    'Mano de Obra': 'labor',
    'Herramienta': 'tool',
    'Equipo': 'equipment',
    'Maquinaria': 'machinery',
    'Subcontrato': 'subcontract',
    'Indirecto': 'indirect'
  };

  // Agrupar filas seleccionadas por Proveedor para emitir 1 OC por proveedor
  const groupsBySup = new Map();
  chosen.forEach(r => {
    const k = r.supplierId || '__varios__';
    if (!groupsBySup.has(k)) groupsBySup.set(k, []);
    groupsBySup.get(k).push(r);
  });

  const existingRecords = getExpensesRecords();
  let nextOrderSeq = generateNextOrderGroupId(existingRecords);
  const year = new Date().getFullYear();
  let seqNum = parseInt(nextOrderSeq.replace(`OC-${year}-`, ''), 10) || 1;
  const createdFolios = [];

  for (const [supKey, rows] of groupsBySup.entries()) {
    const supId = supKey === '__varios__' ? '' : supKey;
    const supObj = supId ? getSupplierById(supId) : null;
    const groupFolio = `OC-${year}-${String(seqNum++).padStart(4, '0')}`;
    createdFolios.push(groupFolio);

    const recordsBatch = rows.map(r => {
      const qty = round2(parseFloat(r.qtyToOrder) || 0);
      const pu = round2(parseFloat(r.unitPriceToOrder) || 0);
      const sub = round2(qty * pu);
      const tax = batchHeader.applyTax ? round2(sub * 0.16) : 0;
      const tot = round2(sub + tax);

      // Si este insumo vino solo de ciertos conceptos en la explosión, ajustar shareRatio
      const relevantSources = Array.isArray(r.sources) && r.sources.length > 0
        ? r.sources.map(s => ({
            conceptId: s.conceptId,
            conceptClave: s.conceptClave,
            conceptDesc: s.conceptDesc,
            qtyCovered: s.qtyConcept,
            moveType: s.moveType,
            shareRatio: 1 / r.sources.length
          }))
        : conceptLinksBase;

      return {
        orderGroupId: groupFolio,
        conceptExplosionBatchId: conceptBatchId,
        destination: batchHeader.destination,
        date: batchHeader.date,
        dueDate: batchHeader.paymentStatus === 'pending' ? batchHeader.dueDate : '',
        type: typeMap[r.tipo] || 'material',
        category: catLabel,
        insumoId: r.insumoKey,
        insumoClave: r.clave,
        description: r.descripcion,
        supplierId: supId,
        supplierName: supObj ? supObj.name : 'Varios',
        invoiceNumber: '',
        quantity: qty,
        unit: r.unidad,
        unitPrice: pu,
        subtotal: sub,
        tax,
        total: tot,
        applyTax: batchHeader.applyTax,
        paymentStatus: batchHeader.paymentStatus,
        paymentMethod: batchHeader.paymentMethod,
        conceptId: primaryConcept ? primaryConcept.conceptId : '',
        conceptClave: primaryConcept ? primaryConcept.conceptClave : '',
        conceptDesc: primaryConcept ? primaryConcept.conceptDesc : '',
        conceptCoverageQty: primaryConcept ? primaryConcept.qtyToExecute : 0,
        conceptMoveType: primaryConcept ? primaryConcept.moveType : 'advance',
        conceptLinks: relevantSources,
        notes: summary.concepts.map(c => `[${c.conceptClave}: ${c.qtyToExecute} ${c.unidad}]`).join(', ')
      };
    });

    saveExpenseRecordsBatch(recordsBatch, { orderGroupId: groupFolio });
  }

  showToast(`✅ ¡${createdFolios.length} Orden(es) de Compra generada(s): ${createdFolios.join(', ')}!`, 'success');
  return true;
}

// =============================================================================
// SUB-VISTA DE COMPARATIVA: CONTROL POR CONCEPTO
// =============================================================================

export function onComparativaConceptSearchChange(val) {
  comparativaConceptSearch = val;
  if (typeof window.refreshComparativaSubView === 'function') {
    window.refreshComparativaSubView();
  }
}

export function toggleComparativaConceptShowAll() {
  comparativaConceptShowAll = !comparativaConceptShowAll;
  if (typeof window.refreshComparativaSubView === 'function') {
    window.refreshComparativaSubView();
  }
}

export function renderComparativaByConceptView() {
  const allConcepts = getConceptCostTrackingReport();
  const q = (comparativaConceptSearch || '').trim().toLowerCase();

  let list = comparativaConceptShowAll
    ? allConcepts
    : allConcepts.filter(c => c.hasActivity);

  // Si no hay ninguno con actividad aún, mostrar los primeros 30 del catálogo para que pueda explotar directo
  if (!comparativaConceptShowAll && list.length === 0) {
    list = allConcepts;
  }

  if (q) {
    list = list.filter(c =>
      (c.clave || '').toLowerCase().includes(q)
      || (c.descripcion || '').toLowerCase().includes(q)
      || (c.partida || '').toLowerCase().includes(q)
    );
  }

  const withActivityCount = allConcepts.filter(c => c.hasActivity).length;

  return `
    <div class="space-y-3">
      <div class="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div class="relative flex-1 min-w-[220px]">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" value="${escapeHtml(comparativaConceptSearch)}" oninput="onComparativaConceptSearchChange(this.value)"
                 placeholder="Buscar concepto por clave, nombre o partida (ej: Castillo C-1)..."
                 class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span class="text-slate-500 font-medium">${withActivityCount} concepto(s) con consumo registrado</span>
          <button type="button" onclick="toggleComparativaConceptShowAll()" class="px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${comparativaConceptShowAll ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'}">
            ${comparativaConceptShowAll ? 'Mostrar solo con actividad' : `Ver todo el catálogo (${allConcepts.length})`}
          </button>
        </div>
      </div>

      <div class="space-y-2">
        ${list.length === 0 ? `
          <div class="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-400">
            No hay conceptos que coincidan con la búsqueda.
          </div>
        ` : list.map(c => {
          const pct = c.cantidadPresupuestada > 0 ? Math.min(100, round2((c.cantidadComprometida / c.cantidadPresupuestada) * 100)) : 0;
          const overVol = c.cantidadRequisitada > c.cantidadPresupuestada;
          const overCost = c.importePresupuestadoCD > 0 && c.costoRealAcumulado > c.importePresupuestadoCD;
          return `
            <div class="bg-white rounded-xl border ${overVol || overCost ? 'border-rose-300' : 'border-slate-200'} p-3.5 shadow-2xs space-y-2">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-[10.5px]">${escapeHtml(c.clave || 'CONC')}</span>
                    <span class="text-[10px] font-semibold text-slate-500 uppercase">${escapeHtml(c.partida)}</span>
                  </div>
                  <h4 class="font-bold text-slate-900 text-xs mt-1">${escapeHtml(c.descripcion)}</h4>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button type="button" onclick="openNewExpenseModalForConcept('${escapeHtml(c.id)}')"
                          class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-2xs">
                    <i class="fa-solid fa-cubes text-[10px]"></i> Comprar / Explotar
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1.5 border-t border-slate-100 text-[11px]">
                <div>
                  <span class="text-[9.5px] text-slate-500 uppercase block">En Catálogo</span>
                  <strong class="font-mono text-slate-900">${formatNumber(c.cantidadPresupuestada)} ${escapeHtml(c.unidad)}</strong>
                </div>
                <div>
                  <span class="text-[9.5px] text-slate-500 uppercase block">Requisitado / Surtido</span>
                  <strong class="font-mono ${overVol ? 'text-rose-600' : 'text-blue-700'}">${formatNumber(c.cantidadComprometida)} ${escapeHtml(c.unidad)} (${pct}%)</strong>
                </div>
                <div>
                  <span class="text-[9.5px] text-slate-500 uppercase block">Pendiente Físico</span>
                  <strong class="font-mono ${c.cantidadDisponible < 0 ? 'text-rose-600' : 'text-emerald-700'}">${formatNumber(c.cantidadDisponible)} ${escapeHtml(c.unidad)}</strong>
                </div>
                <div>
                  <span class="text-[9.5px] text-slate-500 uppercase block">Costo Directo Presup.</span>
                  <strong class="font-mono text-slate-700">${formatCurrency(c.importePresupuestadoCD)}</strong>
                </div>
                <div>
                  <span class="text-[9.5px] text-slate-500 uppercase block">Costo Real Acumulado</span>
                  <strong class="font-mono ${overCost ? 'text-rose-600' : 'text-slate-900'}">${formatCurrency(c.costoRealAcumulado)}</strong>
                </div>
              </div>

              ${c.materialsUsed && c.materialsUsed.length > 0 ? `
                <div class="pt-2 border-t border-slate-100">
                  <div class="text-[10px] font-bold text-slate-500 uppercase mb-1">Materiales e insumos ya registrados en este concepto:</div>
                  <div class="flex flex-wrap gap-1.5">
                    ${c.materialsUsed.map(m => `
                      <span class="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10.5px] text-slate-800">
                        <strong>${escapeHtml(m.descripcion)}</strong>: <span class="font-mono font-bold text-blue-700">${formatNumber(m.cantidadTotal)} ${escapeHtml(m.unidad)}</span>
                        <span class="text-[9px] text-slate-500">(${escapeHtml((m.fuentes || []).join(', '))})</span>
                      </span>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

if (typeof window !== 'undefined') {
  window.onConceptPickerSearchInput = onConceptPickerSearchInput;
  window.onConceptPickerSelectChange = onConceptPickerSelectChange;
  window.onConceptPickerQtyInput = onConceptPickerQtyInput;
  window.onConceptPickerMoveTypeChange = onConceptPickerMoveTypeChange;
  window.addConceptToWeeklyBasket = addConceptToWeeklyBasket;
  window.loadCalendarSuggestionsIntoBasket = loadCalendarSuggestionsIntoBasket;
  window.updateWeeklyBasketQty = updateWeeklyBasketQty;
  window.removeConceptFromWeeklyBasket = removeConceptFromWeeklyBasket;
  window.selectExplodedRowsByFilter = selectExplodedRowsByFilter;
  window.updateBatchHeaderField = updateBatchHeaderField;
  window.applyBatchDefaultSupplier = applyBatchDefaultSupplier;
  window.updateExplodedRowField = updateExplodedRowField;
  window.onComparativaConceptSearchChange = onComparativaConceptSearchChange;
  window.toggleComparativaConceptShowAll = toggleComparativaConceptShowAll;
}
