// js/modules/apu/matrizModal.js
// Controlador de la Ventana Maximizada de Matriz APU (Estilo Configuración del Sistema)

import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney, formatQty, getCurrencySymbol, round2 } from '../../core/formatters.js';
import { getFactorSobrecosto } from '../../core/calculations.js';
import { findNodeById } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { renderAPUInsumos, renderInsumosUnitarios } from './apuView.js';
import { addInsumo, removeInsumo, updateInsumo, filterMatriz } from './apuService.js';

let currentMatrizModalTab = 'matriz'; // 'matriz' | 'explosion'

// Abrir la ventana modal maximizada de Matriz APU
export function openMatrizModal() {
  if (!state.activeSelectedId) {
    showToast('Selecciona primero un concepto en la tabla para ver su matriz maximizada.', 'warning');
    return;
  }

  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) {
    showToast('No se encontró el concepto seleccionado.', 'error');
    return;
  }

  if (node.children && node.children.length > 0) {
    showToast('Esta fila es una partida principal agrupada y no tiene matriz directa de insumos.', 'warning');
    return;
  }

  const modalEl = document.getElementById('matriz-modal');
  if (modalEl) {
    modalEl.classList.remove('hidden');
    renderModalMatriz(node);
  }
}

// Cerrar la ventana modal maximizada de Matriz APU
export function closeMatrizModal() {
  const modalEl = document.getElementById('matriz-modal');
  if (modalEl) {
    modalEl.classList.add('hidden');
  }

  // Sincronizar vista lateral y tabla principal al cerrar
  if (state.activeSelectedId) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) {
      renderAPUInsumos(node);
      renderInsumosUnitarios(node);
    }
  }
  renderTAB1();
}

// Cambiar de pestaña dentro de la ventana maximizada (Estilo Configuración del Sistema)
export function switchMatrizModalTab(tab) {
  currentMatrizModalTab = tab;
  const viewMatriz = document.getElementById('modal-view-matriz');
  const viewExplosion = document.getElementById('modal-view-explosion');
  const tabBtnMatriz = document.getElementById('modal-matriz-tab-matriz');
  const tabBtnExplosion = document.getElementById('modal-matriz-tab-explosion');

  if (tab === 'matriz') {
    if (viewMatriz) viewMatriz.classList.remove('hidden');
    if (viewExplosion) viewExplosion.classList.add('hidden');
    if (tabBtnMatriz) tabBtnMatriz.className = "py-2.5 px-4 border-b-2 border-blue-600 text-blue-600 flex items-center gap-2 font-semibold";
    if (tabBtnExplosion) tabBtnExplosion.className = "py-2.5 px-4 border-b-2 border-transparent text-slate-600 hover:text-slate-900 flex items-center gap-2 font-semibold";
  } else {
    if (viewMatriz) viewMatriz.classList.add('hidden');
    if (viewExplosion) viewExplosion.classList.remove('hidden');
    if (tabBtnMatriz) tabBtnMatriz.className = "py-2.5 px-4 border-b-2 border-transparent text-slate-600 hover:text-slate-900 flex items-center gap-2 font-semibold";
    if (tabBtnExplosion) tabBtnExplosion.className = "py-2.5 px-4 border-b-2 border-blue-600 text-blue-600 flex items-center gap-2 font-semibold";
  }
}

// Filtrar rubro de insumos en la ventana maximizada
export function filterModalMatriz(tipo) {
  filterMatriz(tipo);
  updateModalFilterButtons(tipo);

  if (state.activeSelectedId) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) renderModalMatriz(node);
  }
}

// Actualizar aspecto de los botones de filtro dentro de la ventana modal
function updateModalFilterButtons(activeTipo) {
  const filterKeys = ['Todos', 'Material', 'Mano-de-Obra', 'Equipo', 'Subcontrato'];
  filterKeys.forEach(key => {
    const btn = document.getElementById(`modal-filter-${key}`);
    if (btn) {
      btn.className = "px-2.5 py-1 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 shadow-xs transition";
    }
  });

  const activeKey = activeTipo.replace(/ /g, '-');
  const activeBtn = document.getElementById(`modal-filter-${activeKey}`);
  if (activeBtn) {
    activeBtn.className = "px-2.5 py-1 rounded bg-blue-600 text-white border border-blue-600 shadow-xs transition font-semibold";
  }
}

// Renderizar todo el contenido de la ventana modal maximizada
export function renderModalMatriz(node) {
  if (!node) {
    if (state.activeSelectedId) {
      node = findNodeById(state.treeData, state.activeSelectedId);
    }
  }
  if (!node) return;

  const modalEl = document.getElementById('matriz-modal');
  if (!modalEl || modalEl.classList.contains('hidden')) return;

  if (!node.insumos) node.insumos = [];

  // 1. Cabecera del concepto
  const claveEl = document.getElementById('modal-matriz-clave');
  if (claveEl) claveEl.innerText = node.clave || '---';

  const descEl = document.getElementById('modal-matriz-desc');
  if (descEl) descEl.innerText = node.descripcion || 'Sin descripción';

  const badgeUnidad = document.getElementById('modal-matriz-badge-unidad');
  if (badgeUnidad) badgeUnidad.innerText = `Unidad: ${node.unidad || 'pza'}`;

  const badgeVolumen = document.getElementById('modal-matriz-badge-volumen');
  if (badgeVolumen) badgeVolumen.innerText = `Volumen de Obra: ${formatQty(node.cantidad)} ${node.unidad || 'pza'}`;

  const thCant = document.getElementById('modal-th-apu-cantidad');
  if (thCant) {
    const cUnid = node.unidad || 'ud';
    thCant.innerText = `Cant. (1 ${cUnid})`;
    thCant.title = `Consumo o rendimiento unitario necesario para elaborar exactamente 1 ${cUnid} de concepto`;
  }

  // 2. Cálculos de subtotales por rubro
  let sumMat = 0, sumMO = 0, sumEq = 0, sumSub = 0;
  let visibleCount = 0;

  node.insumos.forEach(ins => {
    const cant = round2(ins.cantidad || 0);
    const costo = round2(ins.costoUnitario || 0);
    const total = round2(cant * costo);

    if (ins.tipo === 'Material') sumMat = round2(sumMat + total);
    else if (ins.tipo === 'Mano de Obra') sumMO = round2(sumMO + total);
    else if (ins.tipo === 'Equipo') sumEq = round2(sumEq + total);
    else if (ins.tipo === 'Subcontrato') sumSub = round2(sumSub + total);
  });

  // Actualizar tarjetas de desglose
  const sumMatEl = document.getElementById('modal-apu-sum-mat');
  if (sumMatEl) sumMatEl.innerText = formatMoney(sumMat);
  const sumMoEl = document.getElementById('modal-apu-sum-mo');
  if (sumMoEl) sumMoEl.innerText = formatMoney(sumMO);
  const sumEqEl = document.getElementById('modal-apu-sum-eq');
  if (sumEqEl) sumEqEl.innerText = formatMoney(sumEq);
  const sumSubEl = document.getElementById('modal-apu-sum-sub');
  if (sumSubEl) sumSubEl.innerText = formatMoney(sumSub);

  // 3. Renderizar Filas de Matriz de Insumos Unitarios (TAB 1)
  const tbody = document.getElementById('modal-apu-insumos-body');
  if (tbody) {
    const fragment = document.createDocumentFragment();

    node.insumos.forEach((ins, idx) => {
      // Filtro activo
      if (state.currentMatrizFilter !== 'Todos' && ins.tipo !== state.currentMatrizFilter) {
        return;
      }

      visibleCount++;
      const cant = round2(ins.cantidad || 0);
      const costo = round2(ins.costoUnitario || 0);
      const total = round2(cant * costo);

      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
      tr.innerHTML = `
        <td class="p-2 align-top pt-2.5">
          <input type="text" value="${ins.clave || ''}" 
                 onchange="updateModalInsumo(${idx}, 'clave', this.value)" 
                 placeholder="Clave" title="Clave del insumo" 
                 class="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 font-mono text-xs font-semibold text-slate-700 px-1 py-0.5 rounded focus:bg-white">
        </td>
        <td class="p-2 align-top pt-2.5">
          <select onchange="updateModalInsumo(${idx}, 'tipo', this.value)" 
                  class="text-xs text-slate-700 bg-transparent border border-slate-200 hover:border-slate-300 rounded px-1.5 py-1 focus:bg-white focus:ring-1 focus:ring-blue-500 font-sans cursor-pointer w-full">
            <option value="Material" ${ins.tipo === 'Material' ? 'selected' : ''}>Material</option>
            <option value="Mano de Obra" ${ins.tipo === 'Mano de Obra' ? 'selected' : ''}>Mano de Obra</option>
            <option value="Equipo" ${ins.tipo === 'Equipo' ? 'selected' : ''}>Equipo / Herr.</option>
            <option value="Subcontrato" ${ins.tipo === 'Subcontrato' ? 'selected' : ''}>Subcontrato</option>
          </select>
        </td>
        <td class="p-2 align-top min-w-[260px]">
          <textarea onchange="updateModalInsumo(${idx}, 'descripcion', this.value)" 
                    class="desc-input w-full bg-transparent border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white px-2 py-1 rounded text-xs font-sans text-justify leading-snug break-words whitespace-normal font-medium block" 
                    rows="2" placeholder="Descripción detallada del insumo">${ins.descripcion || ''}</textarea>
        </td>
        <td class="p-2 align-top pt-2.5 text-center">
          <input type="text" value="${ins.unidad || 'pza'}" 
                 onchange="updateModalInsumo(${idx}, 'unidad', this.value)" 
                 class="w-16 bg-transparent text-center text-xs border border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white rounded px-1 py-1 font-mono">
        </td>
        <td class="p-2 align-top pt-2.5 text-right">
          <input type="number" step="0.01" min="0" value="${Number(cant).toFixed(2)}" 
                 title="Consumo unitario necesario para elaborar exactamente 1 ${node.unidad || 'ud'} de concepto" 
                 onchange="updateModalInsumo(${idx}, 'cantidad', parseFloat(this.value)||0)" 
                 class="w-24 text-right bg-transparent border border-slate-200 hover:border-slate-400 focus:border-blue-500 focus:bg-white rounded px-2 py-1 text-xs font-mono font-semibold text-slate-800">
        </td>
        <td class="p-2 align-top pt-2.5 text-right">
          <div class="flex items-center justify-end">
            <span class="text-slate-500 mr-1 text-xs font-semibold">${getCurrencySymbol()}</span>
            <input type="number" step="0.01" value="${Number(costo).toFixed(2)}" 
                   onchange="updateModalInsumo(${idx}, 'costoUnitario', parseFloat(this.value)||0)" 
                   class="w-28 text-right bg-transparent border border-slate-200 hover:border-slate-400 focus:border-blue-500 focus:bg-white rounded px-2 py-1 text-xs font-semibold text-blue-700 font-mono">
          </div>
        </td>
        <td class="p-2 align-top pt-3 text-right font-bold text-slate-800 font-mono text-xs">
          ${formatMoney(total)}
        </td>
        <td class="p-2 align-top pt-2.5 text-center">
          <button onclick="removeModalInsumo(${idx})" 
                  class="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded p-1.5 transition" 
                  title="Eliminar insumo de la matriz">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      `;
      fragment.appendChild(tr);
    });

    if (visibleCount === 0) {
      const emptyTr = document.createElement('tr');
      emptyTr.innerHTML = `
        <td colspan="8" class="p-6 text-center text-slate-400 italic text-xs">
          ${node.insumos.length === 0 ? 'Sin insumos en la matriz. Haz clic en "+ Insumo", "+ Catálogo" o "Google IA" para agregar.' : `No hay insumos del tipo "${state.currentMatrizFilter}".`}
        </td>
      `;
      fragment.appendChild(emptyTr);
    }

    tbody.replaceChildren(fragment);
  }

  // 4. Totales Financieros
  const totalCD = round2(sumMat + sumMO + sumEq + sumSub);
  node.costoDirecto = totalCD;

  const factor = getFactorSobrecosto();
  const totalPU = round2(totalCD * factor);
  const sobrecostoAmount = round2(totalPU - totalCD);
  const conceptoCantidad = round2(node.cantidad || 0);
  const totalPartidaObra = round2(conceptoCantidad * totalPU);

  node.precioUnitario = totalPU;

  const cdEl = document.getElementById('modal-apu-calculated-cd');
  if (cdEl) cdEl.innerText = formatMoney(totalCD);

  const containerSobrecosto = document.getElementById('modal-apu-sobrecosto-container');
  if (containerSobrecosto) {
    if (state.settings.applySobrecosto) {
      containerSobrecosto.classList.remove('hidden');
      const pct = ((factor - 1) * 100).toFixed(2);
      const tagEl = document.getElementById('modal-apu-sobrecosto-tag');
      if (tagEl) tagEl.innerText = `Sobrecosto (+${pct}%):`;
      const sobreEl = document.getElementById('modal-apu-calculated-sobrecosto');
      if (sobreEl) sobreEl.innerText = `+${formatMoney(sobrecostoAmount)}`;
    } else {
      containerSobrecosto.classList.add('hidden');
    }
  }

  const puEl = document.getElementById('modal-apu-calculated-pu');
  if (puEl) puEl.innerText = formatMoney(totalPU);

  const obraEl = document.getElementById('modal-apu-calculated-total-obra');
  if (obraEl) obraEl.innerText = formatMoney(totalPartidaObra);

  // 5. Renderizar vista TAB 2 (Explosión de Insumos en Obra)
  renderModalExplosion(node);

  // 6. Sincronizar recuadro de Google Search Grounding si existe
  renderModalGroundingBox(node);

  updateModalFilterButtons(state.currentMatrizFilter || 'Todos');
}

// Renderizar tabla de Explosión de Obra dentro de la ventana maximizada
function renderModalExplosion(node) {
  const tbody = document.getElementById('modal-insumos-unitarios-body');
  const txtVolumen = document.getElementById('modal-explosion-volumen-txt');
  const txtTotal = document.getElementById('modal-explosion-total-txt');
  if (!tbody) return;

  const conceptoCantidad = round2(node.cantidad || 0);
  if (txtVolumen) {
    txtVolumen.innerText = `${formatQty(conceptoCantidad)} ${node.unidad || 'pza'}`;
  }

  if (!node.insumos || node.insumos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400 text-xs italic">Sin insumos registrados para explosionar.</td></tr>';
    if (txtTotal) txtTotal.innerText = 'Total: $0.00';
    return;
  }

  const fragment = document.createDocumentFragment();
  let grandTotalObra = 0;

  node.insumos.forEach(ins => {
    const cantUnit = round2(ins.cantidad || 0);
    const cantidadTotalObra = round2(cantUnit * conceptoCantidad);
    const costoUnit = round2(ins.costoUnitario || 0);
    const totalImporteObra = round2(cantidadTotalObra * costoUnit);
    grandTotalObra = round2(grandTotalObra + totalImporteObra);

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 transition border-b border-slate-100";
    tr.innerHTML = `
      <td class="p-2.5 font-semibold text-slate-700 text-xs align-middle">
        ${ins.clave || '-'}
      </td>
      <td class="p-2.5 text-xs text-slate-600 align-middle">
        <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-sans font-medium">
          ${ins.tipo || 'Material'}
        </span>
      </td>
      <td class="p-2.5 text-xs text-slate-800 text-justify leading-snug font-sans align-middle">
        ${ins.descripcion || 'Sin descripción'}
      </td>
      <td class="p-2.5 text-right text-xs font-bold text-blue-900 align-middle font-mono">
        ${formatQty(cantidadTotalObra)}
      </td>
      <td class="p-2.5 text-center text-xs text-slate-500 align-middle font-mono">
        ${ins.unidad || 'pza'}
      </td>
      <td class="p-2.5 text-right text-xs font-semibold text-slate-700 align-middle font-mono">
        ${formatMoney(costoUnit)}
      </td>
      <td class="p-2.5 text-right text-xs font-bold text-slate-800 align-middle font-mono">
        ${formatMoney(totalImporteObra)}
      </td>
    `;
    fragment.appendChild(tr);
  });

  tbody.replaceChildren(fragment);
  if (txtTotal) txtTotal.innerText = `Total Obra: ${formatMoney(grandTotalObra)}`;
}

// Renderizar recuadro informativo de Google Search Grounding en la ventana modal
function renderModalGroundingBox(node) {
  const box = document.getElementById('modal-apu-grounding-box');
  if (!box) return;

  const queriesContainer = document.getElementById('modal-apu-grounding-queries-container');
  const queriesEl = document.getElementById('modal-apu-grounding-queries');
  const sourcesContainer = document.getElementById('modal-apu-grounding-sources-container');
  const sourcesEl = document.getElementById('modal-apu-grounding-sources');
  const tipsContainer = document.getElementById('modal-apu-grounding-tips-container');
  const tipsEl = document.getElementById('modal-apu-grounding-tips');

  const hasQueries = node.googleSearchQueries && node.googleSearchQueries.length > 0;
  const hasSources = node.googleSources && node.googleSources.length > 0;
  const hasTips = node.aiTips && node.aiTips.trim().length > 0;

  if (hasQueries || hasSources || hasTips) {
    box.classList.remove('hidden');

    if (hasQueries && queriesContainer && queriesEl) {
      queriesContainer.classList.remove('hidden');
      queriesEl.innerHTML = node.googleSearchQueries.map(q => 
        `<span class="bg-blue-100 text-blue-900 text-[10px] font-mono px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
           <i class="fa-solid fa-magnifying-glass text-[9px] text-blue-500"></i> ${q}
         </span>`
      ).join('');
    } else if (queriesContainer) {
      queriesContainer.classList.add('hidden');
    }

    if (hasSources && sourcesContainer && sourcesEl) {
      sourcesContainer.classList.remove('hidden');
      sourcesEl.innerHTML = node.googleSources.map(s => 
        `<a href="${s.uri}" target="_blank" class="bg-indigo-100 text-indigo-900 hover:text-blue-700 hover:underline text-[10px] px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1" title="${s.title} (${s.uri})">
           <i class="fa-solid fa-arrow-up-right-from-square text-[9px] text-indigo-500"></i> ${s.title}
         </a>`
      ).join('');
    } else if (sourcesContainer) {
      sourcesContainer.classList.add('hidden');
    }

    if (hasTips && tipsContainer && tipsEl) {
      tipsContainer.classList.remove('hidden');
      tipsEl.innerText = node.aiTips;
    } else if (tipsContainer) {
      tipsContainer.classList.add('hidden');
    }
  } else {
    box.classList.add('hidden');
  }
}

// Actualizar un campo de un insumo desde la ventana maximizada
export function updateModalInsumo(index, field, value) {
  updateInsumo(index, field, value);
  if (state.activeSelectedId) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) renderModalMatriz(node);
  }
}

// Agregar nuevo insumo desde la ventana maximizada
export function addModalInsumo() {
  addInsumo();
  if (state.activeSelectedId) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) renderModalMatriz(node);
  }
}

// Eliminar un insumo desde la ventana maximizada
export function removeModalInsumo(index) {
  removeInsumo(index);
  if (state.activeSelectedId) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) renderModalMatriz(node);
  }
}

// Helper para sincronizar la ventana maximizada si está abierta mientras se actualiza el APU desde otra acción
export function updateModalIfOpen(node) {
  const modalEl = document.getElementById('matriz-modal');
  if (modalEl && !modalEl.classList.contains('hidden')) {
    renderModalMatriz(node);
  }
}

// Cerrar con tecla ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modalEl = document.getElementById('matriz-modal');
    if (modalEl && !modalEl.classList.contains('hidden')) {
      closeMatrizModal();
    }
  }
});
