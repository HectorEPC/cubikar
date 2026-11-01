import { state } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney, formatQty, getCurrencySymbol, round2 } from '../../core/formatters.js';
import { getFactorSobrecosto, updateGrandTotal } from '../../core/calculations.js';
import { getConsolidatedDataMap } from './insumosConsolidator.js';
import { renderTAB1 } from '../catalog/catalogView.js';

let globalConsolidatedMap = {};

// Renderizado global de la pestaña de Insumos Generales
export function renderInsumosGenerales() {
  globalConsolidatedMap = getConsolidatedDataMap();
  let grandTotalGeneral = 0;

  const countMsgEl = document.getElementById('insumos-selected-count-msg');
  const selCount = globalConsolidatedMap._selectedConceptsCount || 0;
  if (countMsgEl) {
    if (selCount > 0) {
      countMsgEl.innerHTML = `Suma consolidada de <strong class="text-blue-700 font-bold">${selCount}</strong> concepto${selCount > 1 ? 's' : ''} marcado${selCount > 1 ? 's' : ''} con checkbox en TAB1-CAT-BASE.`;
    } else {
      countMsgEl.innerHTML = `<span class="text-amber-600 font-semibold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Ningún concepto seleccionado con checkbox en TAB1-CAT-BASE. Marca las casillas en la tabla de presupuesto para ver sus insumos.</span>`;
    }
  }

  const categories = [
    { tipo: 'Material', bodyId: 'body-insumos-materiales', sumId: 'cat-sum-materiales' },
    { tipo: 'Mano de Obra', bodyId: 'body-insumos-mo', sumId: 'cat-sum-mo' },
    { tipo: 'Equipo', bodyId: 'body-insumos-equipo', sumId: 'cat-sum-equipo' },
    { tipo: 'Subcontrato', bodyId: 'body-insumos-subcontratos', sumId: 'cat-sum-subcontratos' }
  ];

  categories.forEach(cat => {
    grandTotalGeneral = round2(grandTotalGeneral + renderCategoryTableWithSearchAndCheck(cat.tipo, cat.bodyId, cat.sumId));
  });

  const grandTotalEl = document.getElementById('insumos-generales-grand-total');
  if (grandTotalEl) grandTotalEl.innerText = formatMoney(grandTotalGeneral);
}

// Renderizado de tabla por categoría con búsqueda y selección múltiple
export function renderCategoryTableWithSearchAndCheck(tipo, bodyId, sumId) {
  const tbody = document.getElementById(bodyId);
  if (!tbody) return 0;

  const fragment = document.createDocumentFragment();
  const itemsMap = globalConsolidatedMap[tipo] || {};
  const items = Object.values(itemsMap);
  
  const searchInput = document.getElementById(`search-${tipo}`);
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const filteredItems = items.filter(item => {
    if (!query) return true;
    return (item.descripcion || '').toLowerCase().includes(query) || (item.insumoName || '').toLowerCase().includes(query);
  });

  let catSum = 0;

  if (filteredItems.length === 0) {
    const isZeroSel = (globalConsolidatedMap._selectedConceptsCount || 0) === 0;
    const msg = isZeroSel 
      ? '<span class="text-amber-600 font-medium"><i class="fa-solid fa-square-check text-amber-500 mr-1.5"></i>Sin conceptos seleccionados. Marca los checkboxes en TAB1-CAT-BASE para incluir sus insumos.</span>' 
      : (query ? `No se encontraron insumos que coincidan con "${query}"` : 'Sin insumos de esta categoría en los conceptos seleccionados');
    tbody.innerHTML = `<tr><td colspan="7" class="p-3 text-center text-slate-400 text-xs italic">${msg}</td></tr>`;
    const sumEl = document.getElementById(sumId);
    if (sumEl) sumEl.innerText = '$0.00';
    return 0;
  }

  filteredItems.forEach((item) => {
    catSum = round2(catSum + item.totalImporte);
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 group";
    tr.dataset.itemKey = item.key;

    tr.innerHTML = `
      <td class="p-2 text-center align-middle sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200">
        <input type="checkbox" data-tipo="${tipo}" data-key="${item.key}" class="row-checkbox-${tipo} rounded text-blue-600 focus:ring-blue-500 cursor-pointer">
      </td>
      <td class="p-2 font-semibold text-slate-700 align-middle whitespace-nowrap">${item.clave}</td>
      <td class="p-2 text-slate-700 align-middle min-w-[280px]">
        <div class="font-medium leading-snug">${item.descripcion}</div>
        <div class="text-[10px] text-slate-400 mt-1 flex flex-wrap items-center gap-1.5 font-sans">
          <span class="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200 font-mono font-semibold text-[9px]">
            <i class="fa-solid fa-calculator text-[8px] mr-0.5"></i> ${item.sources.length} ${item.sources.length === 1 ? 'matriz' : 'matrices'}
          </span>
          <span class="truncate max-w-sm text-slate-500 cursor-help" title="${item.sources.map(s => `• [${s.nodeClave}] ${s.nodeDesc}: ${formatQty(s.cantConcepto)} ${s.nodeUnidad} obra × ${formatQty(s.cantUnitaria)} ${item.unidad}/ud = ${formatQty(s.cantTotal)} ${item.unidad}`).join('\n')}">
            Partidas: ${item.sources.map(s => s.nodeClave).filter(Boolean).slice(0, 4).join(', ')}${item.sources.length > 4 ? '...' : ''}
          </span>
        </div>
      </td>
      <td class="p-2 text-right font-mono font-semibold text-slate-700 align-middle whitespace-nowrap">
        <div class="flex items-center justify-end">
          <span class="text-slate-500 mr-0.5">${getCurrencySymbol()}</span>
          <input type="number" step="0.01" value="${Number(item.costoUnitario || 0).toFixed(2)}" 
                 onchange="updateCostoUnitarioGeneral('${tipo}', '${item.key}', parseFloat(this.value) || 0)" 
                 class="w-20 text-right bg-transparent border border-slate-200 hover:border-slate-400 focus:border-blue-500 focus:bg-white px-1 py-0.5 rounded text-xs font-semibold text-blue-700 font-mono">
        </div>
      </td>
      <td class="p-2 text-center text-slate-500 align-middle whitespace-nowrap">${item.unidad}</td>
      <td class="p-2 text-right font-bold text-blue-900 align-middle whitespace-nowrap" title="Suma total en obra: ${formatQty(item.cantidadTotal)} ${item.unidad}&#10;Suma unitaria directa: ${formatQty(item.sumCantUnitaria || 0)} ${item.unidad}">
        <div>${formatQty(item.cantidadTotal)}</div>
        ${item.sources.length > 1 ? `<div class="text-[9px] text-slate-400 font-normal font-sans" title="Suma directa de consumos unitarios de las ${item.sources.length} matrices">Σ unit: ${formatQty(item.sumCantUnitaria || 0)}</div>` : ''}
      </td>
      <td class="p-2 text-right font-bold text-slate-800 align-middle whitespace-nowrap">${formatMoney(item.totalImporte)}</td>
    `;
    fragment.appendChild(tr);
  });

  tbody.replaceChildren(fragment);
  const sumEl = document.getElementById(sumId);
  if (sumEl) sumEl.innerText = formatMoney(catSum);
  return catSum;
}

// Filtrar tabla de categoría por campo de búsqueda
export function filterInsumosGeneralesTable(tipo) {
  const sumId = tipo === 'Material' ? 'cat-sum-materiales' : (tipo === 'Mano de Obra' ? 'cat-sum-mo' : (tipo === 'Equipo' ? 'cat-sum-equipo' : 'cat-sum-subcontratos'));
  const bodyId = tipo === 'Material' ? 'body-insumos-materiales' : (tipo === 'Mano de Obra' ? 'body-insumos-mo' : (tipo === 'Equipo' ? 'body-insumos-equipo' : 'body-insumos-subcontratos'));
  renderCategoryTableWithSearchAndCheck(tipo, bodyId, sumId);
}

// Seleccionar todas las casillas de una categoría
export function toggleSelectAllInsumos(tipo, isChecked) {
  const checkboxes = document.querySelectorAll(`.row-checkbox-${tipo}`);
  checkboxes.forEach(cb => cb.checked = isChecked);
}

// Actualizar costo unitario general y propagar a todas las matrices donde se use
export function updateCostoUnitarioGeneral(tipo, key, newCosto) {
  saveState();
  const itemGroup = globalConsolidatedMap[tipo] && globalConsolidatedMap[tipo][key];
  const parsedCosto = round2(newCosto);
  if (itemGroup && itemGroup.sources) {
    itemGroup.sources.forEach(src => {
      src.insumo.costoUnitario = parsedCosto;
      if (src.node && src.node.insumos) {
        const cd = round2(src.node.insumos.reduce((s, i) => s + round2((i.cantidad || 0) * (i.costoUnitario || 0)), 0));
        src.node.costoDirecto = cd;
        src.node.precioUnitario = round2(cd * getFactorSobrecosto());
      }
    });
    showToast('Costo unitario actualizado en todas las matrices vinculadas', 'success');
  }
  renderInsumosGenerales();
  updateGrandTotal();
}

// Unificar insumos seleccionados bajo el primero
export function combinarInsumosSeleccionados(tipo) {
  const checkboxes = document.querySelectorAll(`.row-checkbox-${tipo}:checked`);
  if (checkboxes.length < 2) {
    showToast('Selecciona al menos 2 renglones con casillas Checkbox', 'warning');
    return;
  }

  if (!confirm(`¿Deseas unificar los ${checkboxes.length} insumos seleccionados? Se agruparán bajo la descripción y costo del primer elemento.`)) {
    return;
  }

  saveState();
  const itemsMap = globalConsolidatedMap[tipo];
  let primaryItem = null;
  let targetSources = [];

  checkboxes.forEach((cb, idx) => {
    const key = cb.dataset.key;
    const item = itemsMap[key];
    if (item) {
      if (idx === 0) {
        primaryItem = item;
      } else {
        targetSources = targetSources.concat(item.sources);
      }
    }
  });

  if (primaryItem && targetSources.length > 0) {
    targetSources.forEach(src => {
      src.insumo.descripcion = primaryItem.descripcion;
      src.insumo.unidad = primaryItem.unidad;
      src.insumo.costoUnitario = round2(primaryItem.costoUnitario);
      src.insumo.clave = primaryItem.clave;
      if (src.node && src.node.insumos) {
        const cd = round2(src.node.insumos.reduce((s, i) => s + round2((i.cantidad || 0) * (i.costoUnitario || 0)), 0));
        src.node.costoDirecto = cd;
        src.node.precioUnitario = round2(cd * getFactorSobrecosto());
      }
    });
    showToast('Insumos combinados con éxito', 'success');
  }

  renderInsumosGenerales();
  renderTAB1();
}

// Filtrar visualización de tarjetas de categorías
export function filterInsumosCategoryView(selectedCat) {
  const cats = [
    { id: 'Material', key: 'Material' },
    { id: 'Mano-de-Obra', key: 'Mano de Obra' },
    { id: 'Equipo', key: 'Equipo' },
    { id: 'Subcontrato', key: 'Subcontrato' }
  ];
  const btnMap = {
    'all': 'btn-view-cat-all',
    'Material': 'btn-view-cat-Material',
    'Mano de Obra': 'btn-view-cat-MO',
    'Equipo': 'btn-view-cat-Equipo',
    'Subcontrato': 'btn-view-cat-Sub'
  };

  Object.keys(btnMap).forEach(k => {
    const btn = document.getElementById(btnMap[k]);
    if (!btn) return;
    if (k === selectedCat) {
      btn.className = "px-2.5 py-1 rounded bg-white text-slate-900 font-semibold shadow-sm transition";
    } else {
      btn.className = "px-2.5 py-1 rounded text-slate-600 hover:text-slate-900 transition";
    }
  });

  cats.forEach(c => {
    const card = document.getElementById(`card-insumos-${c.id}`);
    if (!card) return;
    if (selectedCat === 'all' || selectedCat === c.key) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
}

// Plegar / desplegar tarjeta individual de categoría
export function toggleInsumoCard(catId) {
  const body = document.getElementById(`card-body-${catId}`);
  const icon = document.getElementById(`card-chevron-${catId}`);
  if (!body) return;
  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    if (icon) icon.className = "fa-solid fa-chevron-up text-xs";
  } else {
    body.classList.add('hidden');
    if (icon) icon.className = "fa-solid fa-chevron-down text-xs";
  }
}
