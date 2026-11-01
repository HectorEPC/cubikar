import { state } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney, formatQty, getCurrencySymbol, round2 } from '../../core/formatters.js';
import { getFactorSobrecosto, updateGrandTotal } from '../../core/calculations.js';
import { getConsolidatedDataMap, normalizeInsumoText } from './insumosConsolidator.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { findNodeById } from '../catalog/treeService.js';
import { renderAPUInsumos, renderInsumosUnitarios } from '../apu/apuView.js';
import { updateModalIfOpen } from '../apu/matrizModal.js';

let globalConsolidatedMap = {};
let activeCombinarContext = null;

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

// Iniciar flujo interactivo para combinar insumos seleccionados
export function combinarInsumosSeleccionados(tipo) {
  const checkboxes = document.querySelectorAll(`.row-checkbox-${tipo}:checked`);
  if (checkboxes.length < 2) {
    showToast(`Selecciona al menos 2 insumos de ${tipo} con casilla Checkbox para poder combinarlos`, 'warning');
    return;
  }

  const itemsMap = globalConsolidatedMap[tipo] || {};
  const selectedItems = [];

  checkboxes.forEach(cb => {
    const key = cb.dataset.key;
    const item = itemsMap[key];
    if (item && !selectedItems.some(i => i.key === item.key)) {
      selectedItems.push(item);
    }
  });

  if (selectedItems.length < 2) {
    showToast('No se encontraron suficientes insumos válidos seleccionados', 'warning');
    return;
  }

  openCombinarModal(tipo, selectedItems);
}

// Abrir ventana modal con las opciones de insumos a combinar
export function openCombinarModal(tipo, selectedItems) {
  activeCombinarContext = { tipo, selectedItems };
  const modal = document.getElementById('modal-combinar-insumos');
  if (!modal) return;

  const badgeTipo = document.getElementById('combinar-modal-badge-tipo');
  if (badgeTipo) {
    badgeTipo.innerText = tipo;
    const colorClasses = {
      'Material': 'bg-blue-600 text-white',
      'Mano de Obra': 'bg-amber-600 text-white',
      'Equipo': 'bg-purple-600 text-white',
      'Subcontrato': 'bg-emerald-600 text-white'
    };
    badgeTipo.className = `text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded shadow-xs ${colorClasses[tipo] || 'bg-blue-600 text-white'}`;
  }

  const countEl = document.getElementById('combinar-modal-count');
  if (countEl) countEl.innerText = `${selectedItems.length} insumos seleccionados`;

  const listEl = document.getElementById('combinar-modal-items-list');
  if (listEl) {
    listEl.innerHTML = selectedItems.map((item, idx) => `
      <label class="combinar-item-card flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition select-none ${idx === 0 ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-300' : 'border-slate-200 hover:border-slate-300 bg-white'}" onclick="selectCombinarTarget('${item.key}')">
        <input type="radio" name="target-insumo-key" value="${item.key}" ${idx === 0 ? 'checked' : ''} class="mt-1 text-blue-600 focus:ring-blue-500 cursor-pointer" onchange="selectCombinarTarget('${item.key}')">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">${item.clave}</span>
            <span class="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">${item.unidad}</span>
            <span class="text-xs font-bold font-mono text-blue-700 ml-auto">${getCurrencySymbol()}${Number(item.costoUnitario || 0).toFixed(2)} / ${item.unidad}</span>
          </div>
          <div class="font-semibold text-slate-800 text-xs leading-snug break-words">${item.descripcion}</div>
          <div class="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 flex-wrap font-sans">
            <span class="flex items-center gap-1 text-slate-600 font-medium">
              <i class="fa-solid fa-cubes text-[10px] text-slate-400"></i> Vol. en obra: <strong class="text-slate-800 font-mono">${formatQty(item.cantidadTotal)} ${item.unidad}</strong>
            </span>
            <span class="flex items-center gap-1 text-slate-600 font-medium">
              <i class="fa-solid fa-calculator text-[10px] text-slate-400"></i> Matrices: <strong class="text-blue-700">${item.sources.length}</strong>
            </span>
            <span class="font-mono font-bold text-slate-700 ml-auto">
              Importe total: ${formatMoney(item.totalImporte)}
            </span>
          </div>
        </div>
      </label>
    `).join('');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

// Cerrar ventana modal de combinación
export function closeCombinarModal() {
  const modal = document.getElementById('modal-combinar-insumos');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  activeCombinarContext = null;
}

// Selección visual y de radio button del concepto definitivo
export function selectCombinarTarget(key) {
  const radio = document.querySelector(`input[name="target-insumo-key"][value="${key}"]`);
  if (radio) radio.checked = true;

  const cards = document.querySelectorAll('.combinar-item-card');
  cards.forEach(card => {
    const r = card.querySelector('input[type="radio"]');
    if (r && r.checked) {
      card.className = "combinar-item-card flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition select-none border-blue-500 bg-blue-50/50 ring-1 ring-blue-300";
    } else {
      card.className = "combinar-item-card flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition select-none border-slate-200 hover:border-slate-300 bg-white";
    }
  });
}

// Ejecutar combinación: el concepto elegido reemplaza a los demás en sus espacios de matriz, conservando su cantidad
export function ejecutarCombinacionInsumos() {
  if (!activeCombinarContext) return;
  const { tipo, selectedItems } = activeCombinarContext;

  const selectedRadio = document.querySelector('input[name="target-insumo-key"]:checked');
  if (!selectedRadio) {
    showToast('Selecciona el concepto con el que deseas quedarte', 'warning');
    return;
  }

  const chosenKey = selectedRadio.value;
  const chosenItem = selectedItems.find(i => i.key === chosenKey);
  if (!chosenItem) {
    showToast('Concepto elegido no encontrado', 'error');
    return;
  }

  const mergeSameMatrix = Boolean(document.getElementById('combinar-merge-same-matrix')?.checked);

  // Guardar estado actual en el historial para permitir Deshacer (Ctrl+Z)
  saveState();

  const otherItems = selectedItems.filter(i => i.key !== chosenKey);
  const affectedNodes = new Set();
  let totalReplacedSlots = 0;

  // 1. Reemplazar los insumos a eliminar en los espacios de cada matriz manteniendo su cantidad
  otherItems.forEach(item => {
    (item.sources || []).forEach(src => {
      if (src.insumo && src.node) {
        src.insumo.clave = chosenItem.clave;
        src.insumo.descripcion = chosenItem.descripcion;
        src.insumo.unidad = chosenItem.unidad;
        src.insumo.costoUnitario = round2(chosenItem.costoUnitario);
        src.insumo.tipo = chosenItem.tipo || tipo;
        // src.insumo.cantidad se conserva intacta con el valor que tenía en su respectivo espacio

        affectedNodes.add(src.node);
        totalReplacedSlots++;
      }
    });
  });

  // 2. Si se activó fusionar en la misma matriz APU
  if (mergeSameMatrix) {
    affectedNodes.forEach(node => {
      if (!Array.isArray(node.insumos) || node.insumos.length <= 1) return;

      const cleanChosenDesc = normalizeInsumoText(chosenItem.descripcion);
      const matches = node.insumos.filter(ins => 
        ins.clave === chosenItem.clave && 
        normalizeInsumoText(ins.descripcion) === cleanChosenDesc &&
        (ins.tipo || tipo) === (chosenItem.tipo || tipo)
      );

      if (matches.length > 1) {
        const primary = matches[0];
        let sumQty = round2(primary.cantidad || 0);

        for (let i = 1; i < matches.length; i++) {
          sumQty = round2(sumQty + round2(matches[i].cantidad || 0));
          const idx = node.insumos.indexOf(matches[i]);
          if (idx !== -1) {
            node.insumos.splice(idx, 1);
          }
        }
        primary.cantidad = sumQty;
      }
    });
  }

  // 3. Recalcular costos directos y precios unitarios en todos los nodos afectados
  affectedNodes.forEach(node => {
    if (Array.isArray(node.insumos)) {
      const cd = round2(node.insumos.reduce((sum, i) => sum + round2((i.cantidad || 0) * (i.costoUnitario || 0)), 0));
      node.costoDirecto = cd;
      node.precioUnitario = round2(cd * getFactorSobrecosto());
    }
  });

  // Cerrar el modal
  closeCombinarModal();

  // 4. Actualizar vistas globales y tablas
  updateGrandTotal();
  renderInsumosGenerales();
  renderTAB1();

  // Si hay un concepto abierto en la vista o modal de APU, actualizarlo
  if (state.activeSelectedId) {
    const activeNode = findNodeById(state.treeData, state.activeSelectedId);
    if (activeNode) {
      renderAPUInsumos(activeNode);
      renderInsumosUnitarios(activeNode);
      updateModalIfOpen(activeNode);
    }
  }

  showToast(`Insumos combinados con éxito: se conservó "${chosenItem.descripcion.slice(0, 32)}..." reemplazando en ${totalReplacedSlots} espacios y preservando sus cantidades.`, 'success');
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

// Cerrar modal de combinación con tecla Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal-combinar-insumos');
    if (modal && !modal.classList.contains('hidden')) {
      closeCombinarModal();
    }
  }
});
