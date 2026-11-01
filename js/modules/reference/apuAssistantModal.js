// js/modules/reference/apuAssistantModal.js
// Asistente de Insumos para Matrices de Precios Unitarios (Opción 2)

import { state } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney, round2 } from '../../core/formatters.js';
import { findNodeById } from '../catalog/treeService.js';
import { renderAPUInsumos, renderInsumosUnitarios, toggleApuSection } from '../apu/apuView.js';
import { searchReferenceItems, listReferenceCatalogs } from './referenceDb.js';

let apuSearchDebounce = null;
let currentApuSearchResults = [];

// Abrir modal de asistente de insumos para el concepto activo
export async function openApuReferenceModal() {
  if (!state.activeSelectedId) {
    showToast('Selecciona primero un concepto en la tabla para editar su matriz APU.', 'warning');
    return;
  }

  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) return;

  if (node.children && node.children.length > 0) {
    showToast('Esta fila contiene sub-conceptos (partida resumen) y no admite matriz de insumos.', 'warning');
    return;
  }

  const modal = document.getElementById('apu-reference-modal');
  if (!modal) return;

  // Actualizar encabezado con el concepto activo
  const targetLabel = document.getElementById('apu-assistant-target-name');
  if (targetLabel) {
    targetLabel.textContent = `${node.clave || ''} ${node.descripcion || 'Sin descripción'}`;
  }

  const thQty = document.getElementById('th-apu-assistant-qty');
  if (thQty && node) {
    thQty.innerHTML = `Cant. (1 ${node.unidad || 'ud'})`;
    thQty.title = `Consumo unitario necesario para elaborar exactamente 1 ${node.unidad || 'ud'} de concepto`;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Ajustar filtro por defecto según la pestaña activa en la matriz
  const filterType = (state.currentMatrizFilter && state.currentMatrizFilter !== 'Todos') 
    ? state.currentMatrizFilter 
    : 'Material';
  
  setApuAssistantFilter(filterType);
}

// Cerrar modal
export function closeApuReferenceModal() {
  const modal = document.getElementById('apu-reference-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Cambiar filtro de tipo en el asistente (Material, Mano de Obra, Equipo, Todos)
export function setApuAssistantFilter(tipo) {
  const filterSelect = document.getElementById('apu-assistant-tipo-filter');
  if (filterSelect) {
    filterSelect.value = tipo;
  }

  const filterBtns = ['Todos', 'Material', 'Mano-de-Obra', 'Herramienta', 'Equipo', 'Maquinaria', 'Subcontrato'];
  filterBtns.forEach(key => {
    const btn = document.getElementById(`apu-filter-btn-${key}`);
    if (btn) {
      btn.className = "px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition";
    }
  });

  const activeKey = tipo.replace(/ /g, '-');
  const activeBtn = document.getElementById(`apu-filter-btn-${activeKey}`);
  if (activeBtn) {
    activeBtn.className = "px-2.5 py-1 rounded-md text-xs font-bold bg-blue-600 text-white shadow-xs transition";
  }

  triggerApuAssistantSearch();
}

// Búsqueda con debounce en el asistente
export function onApuAssistantSearchInput() {
  clearTimeout(apuSearchDebounce);
  apuSearchDebounce = setTimeout(() => {
    triggerApuAssistantSearch();
  }, 250);
}

// Ejecutar búsqueda de insumos en la base de referencia
export async function triggerApuAssistantSearch() {
  const query = document.getElementById('apu-assistant-search-input')?.value || '';
  const tipo = document.getElementById('apu-assistant-tipo-filter')?.value || 'all';
  const tbody = document.getElementById('apu-assistant-results-body');
  const countBadge = document.getElementById('apu-assistant-count-badge');

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-slate-400">
          <i class="fa-solid fa-spinner fa-spin text-lg text-blue-600 mb-1"></i>
          <p class="text-xs">Buscando insumos en catálogos de referencia...</p>
        </td>
      </tr>
    `;
  }

  try {
    const results = await searchReferenceItems({
      tipo: tipo === 'Todos' ? 'all' : tipo,
      query: query,
      limit: 100
    });

    currentApuSearchResults = results;

    if (countBadge) {
      countBadge.textContent = `${results.length} insumos encontrados`;
    }

    renderApuAssistantResults(results);
  } catch (err) {
    console.error('Error buscando insumos:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="p-4 text-center text-red-500 text-xs">
            Error al consultar insumos: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

// Renderizar tabla de resultados en el asistente APU
function renderApuAssistantResults(items) {
  const tbody = document.getElementById('apu-assistant-results-body');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-slate-400">
          <i class="fa-solid fa-box-open text-2xl text-slate-300 mb-2"></i>
          <p class="text-xs font-semibold text-slate-600">No se encontraron insumos.</p>
          <p class="text-[11px] text-slate-400 mt-1">Intenta con otra palabra clave o importa catálogos con el botón "Importar Archivo".</p>
        </td>
      </tr>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  const node = findNodeById(state.treeData, state.activeSelectedId);
  const nodeUnit = (node ? (node.unidad || 'ud') : 'ud').toLowerCase();

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50 border-b border-slate-100 text-xs transition';

    let tipoColor = 'text-blue-700 bg-blue-50 border-blue-200';
    if (item.tipo === 'Mano de Obra') tipoColor = 'text-amber-700 bg-amber-50 border-amber-200';
    else if (item.tipo === 'Herramienta') tipoColor = 'text-orange-700 bg-orange-50 border-orange-200';
    else if (item.tipo === 'Equipo') tipoColor = 'text-purple-700 bg-purple-50 border-purple-200';
    else if (item.tipo === 'Maquinaria') tipoColor = 'text-rose-700 bg-rose-50 border-rose-200';
    else if (item.tipo === 'Subcontrato') tipoColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';

    // Rendimiento o consumo sugerido para 1 unidad de concepto
    let defaultQty = '1.0000';
    const itemUnit = (item.unidad || '').toLowerCase().trim();
    if (item.tipo === 'Mano de Obra') {
      defaultQty = '0.0800';
    } else if (item.tipo === 'Equipo' && (itemUnit === '%' || (item.descripcion || '').includes('%'))) {
      defaultQty = '0.0300';
    } else if (itemUnit.includes('m3') && nodeUnit.includes('m2')) {
      defaultQty = '0.1050';
    } else if (itemUnit.includes('m2') && nodeUnit.includes('m2')) {
      defaultQty = '1.1000';
    } else if (itemUnit.includes('kg') && nodeUnit.includes('kg')) {
      defaultQty = '1.0500';
    }

    tr.innerHTML = `
      <td class="p-2 align-middle w-24">
        <span class="font-mono text-[11px] font-bold text-slate-700 block">${item.clave || '-'}</span>
        <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded border ${tipoColor} inline-block mt-0.5">${item.tipo || 'Insumo'}</span>
      </td>
      <td class="p-2 align-middle">
        <div class="font-medium text-slate-800 line-clamp-2" title="${item.descripcion}">${item.descripcion}</div>
        <div class="text-[10px] text-slate-400 mt-0.5">${item.catalogName || 'Catálogo'}</div>
      </td>
      <td class="p-2 align-middle text-center font-mono w-14 text-slate-600">
        ${item.unidad || 'pza'}
      </td>
      <td class="p-2 align-middle text-right font-mono font-bold text-slate-800 w-24">
        ${formatMoney(item.precioUnitario || 0)}
      </td>
      <td class="p-2 align-middle text-right w-40">
        <div class="flex items-center justify-end gap-1.5">
          <input type="number" id="apu-qty-input-${index}" value="${Number(defaultQty || 1).toFixed(2)}" step="0.01" min="0.01" 
                 class="w-16 border border-slate-300 rounded px-1.5 py-1 text-xs font-mono text-right focus:ring-1 focus:ring-blue-500" 
                 title="Consumo unitario necesario para 1 ${node ? (node.unidad || 'ud') : 'ud'} de concepto">
          <button onclick="addInsumoToApuMatrix(${index})" id="btn-add-apu-${index}" 
                  class="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2.5 py-1 rounded flex items-center gap-1 font-medium shadow-xs transition active:scale-95" 
                  title="Agregar a la matriz activa con este consumo">
            <i class="fa-solid fa-plus text-[10px]"></i> Agregar
          </button>
        </div>
      </td>
    `;
    fragment.appendChild(tr);
  });

  tbody.replaceChildren(fragment);
}

// Agregar el insumo seleccionado directamente a la matriz del concepto activo
export function addInsumoToApuMatrix(resultIndex) {
  const item = currentApuSearchResults[resultIndex];
  if (!item || !state.activeSelectedId) return;

  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) return;

  const qtyInput = document.getElementById(`apu-qty-input-${resultIndex}`);
  const cantidad = qtyInput ? round2(parseFloat(qtyInput.value) || 1) : 1.00;

  saveState();
  toggleApuSection('matriz', true);

  if (!node.insumos) node.insumos = [];

  // Mapear al tipo estándar de la app
  let normalizedTipo = 'Material';
  if (item.tipo === 'Mano de Obra') normalizedTipo = 'Mano de Obra';
  else if (item.tipo === 'Herramienta') normalizedTipo = 'Herramienta';
  else if (item.tipo === 'Equipo') normalizedTipo = 'Equipo';
  else if (item.tipo === 'Maquinaria') normalizedTipo = 'Maquinaria';
  else if (item.tipo === 'Subcontrato') normalizedTipo = 'Subcontrato';

  node.insumos.push({
    clave: item.clave || `INS-${node.insumos.length + 1}`,
    tipo: normalizedTipo,
    descripcion: item.descripcion || 'Insumo de referencia',
    unidad: item.unidad || 'pza',
    cantidad: cantidad,
    costoUnitario: round2(item.precioUnitario || 0)
  });

  // Re-renderizar APU y recalcular
  renderAPUInsumos(node);
  renderInsumosUnitarios(node);

  // Efecto visual en el botón
  const btn = document.getElementById(`btn-add-apu-${resultIndex}`);
  if (btn) {
    const originalText = btn.innerHTML;
    btn.className = "bg-emerald-600 text-white text-xs px-2.5 py-1 rounded flex items-center gap-1 font-medium shadow-xs";
    btn.innerHTML = '<i class="fa-solid fa-check text-[10px]"></i> Agregado';
    setTimeout(() => {
      if (btn) {
        btn.className = "bg-blue-600 hover:bg-blue-500 text-white text-xs px-2.5 py-1 rounded flex items-center gap-1 font-medium shadow-xs transition active:scale-95";
        btn.innerHTML = originalText;
      }
    }, 1200);
  }

  showToast(`Insumo "${item.clave || item.descripcion.slice(0, 20)}" agregado a la matriz`, 'success');
}
