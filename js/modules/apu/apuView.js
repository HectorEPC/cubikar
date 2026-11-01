import { state, persistLocalData } from '../../state/store.js';
import { formatMoney, formatQty, getCurrencySymbol, round2 } from '../../core/formatters.js';
import { getFactorSobrecosto } from '../../core/calculations.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import { updateModalIfOpen } from './matrizModal.js';

// Renderizar tabla Matriz APU del concepto seleccionado
export function renderAPUInsumos(node) {
  if (!node) return;
  if (!node.insumos) node.insumos = [];

  // Si es un concepto final de obra con costo pero sin insumos aún, integrar su matriz automáticamente
  const isLeaf = !node.children || node.children.length === 0;
  if (isLeaf && node.insumos.length === 0 && (parseFloat(node.precioUnitario) > 0 || parseFloat(node.costoDirecto) > 0)) {
    node.insumos = generateIntegratedMatrixForConcept(node);
    persistLocalData();
  }

  const tbody = document.getElementById('apu-insumos-body');
  if (!tbody) return;

  // Actualizar encabezado dinámicamente con la unidad del concepto (ej. Cant. para 1 m2)
  const thCant = document.getElementById('th-apu-cantidad');
  if (thCant) {
    const cUnid = node.unidad || 'ud';
    thCant.innerText = `Cant. (1 ${cUnid})`;
    thCant.title = `Consumo o rendimiento unitario necesario para elaborar exactamente 1 ${cUnid} de concepto`;
  }

  const fragment = document.createDocumentFragment();

  let sumMat = 0, sumMO = 0, sumHerr = 0, sumEq = 0, sumMaq = 0, sumSub = 0;
  let visibleCount = 0;

  node.insumos.forEach((ins, idx) => {
    const cant = round2(ins.cantidad || 0);
    const costo = round2(ins.costoUnitario || 0);
    const total = round2(cant * costo);
    
    if (ins.tipo === 'Material') sumMat = round2(sumMat + total);
    else if (ins.tipo === 'Mano de Obra') sumMO = round2(sumMO + total);
    else if (ins.tipo === 'Herramienta') sumHerr = round2(sumHerr + total);
    else if (ins.tipo === 'Equipo') sumEq = round2(sumEq + total);
    else if (ins.tipo === 'Maquinaria') sumMaq = round2(sumMaq + total);
    else if (ins.tipo === 'Subcontrato') sumSub = round2(sumSub + total);

    // Filtro activo por tipo en la matriz
    if (state.currentMatrizFilter !== 'Todos' && ins.tipo !== state.currentMatrizFilter) {
      return;
    }

    visibleCount++;

    // Fila principal del insumo (sin sub-filas)
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="p-1 border-b border-slate-100 min-w-[200px] text-justify align-top">
        <textarea onchange="updateInsumo(${idx}, 'descripcion', this.value)" 
                  class="desc-input w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white px-1 py-0.5 rounded text-[10px] font-sans text-justify leading-snug break-words whitespace-normal font-medium block" 
                  placeholder="Descripción insumo">${ins.descripcion || ''}</textarea>
        <div class="flex items-center gap-2 mt-0.5">
          <input type="text" value="${ins.clave || ''}" onchange="updateInsumo(${idx}, 'clave', this.value)" 
                 placeholder="Clave" title="Clave del insumo" 
                 class="w-16 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 font-mono text-[8px] font-semibold text-slate-700 px-0.5">
          <select onchange="updateInsumo(${idx}, 'tipo', this.value)" class="text-[8px] text-slate-500 bg-transparent cursor-pointer">
            <option value="Material" ${ins.tipo === 'Material' ? 'selected' : ''}>Material</option>
            <option value="Mano de Obra" ${ins.tipo === 'Mano de Obra' ? 'selected' : ''}>M. Obra</option>
            <option value="Herramienta" ${ins.tipo === 'Herramienta' ? 'selected' : ''}>Herramienta</option>
            <option value="Equipo" ${ins.tipo === 'Equipo' ? 'selected' : ''}>Equipo</option>
            <option value="Maquinaria" ${ins.tipo === 'Maquinaria' ? 'selected' : ''}>Maquinaria</option>
            <option value="Subcontrato" ${ins.tipo === 'Subcontrato' ? 'selected' : ''}>Subcontrato</option>
          </select>
        </div>
      </td>
      <td class="p-1 border-b border-slate-100 text-center w-14 min-w-[50px] align-top pt-1.5">
        <input type="text" value="${ins.unidad || 'pza'}" onchange="updateInsumo(${idx}, 'unidad', this.value)" class="w-full bg-transparent text-center text-[10px] focus:bg-white focus:ring-1 focus:ring-blue-500 rounded">
      </td>
      <td class="p-1 border-b border-slate-100 text-right w-16 min-w-[65px] align-top pt-1.5">
        <input type="number" step="0.01" min="0" value="${Number(ins.cantidad || 0).toFixed(2)}" 
                title="Consumo unitario para 1 ${node.unidad || 'ud'} de concepto" 
                onchange="updateInsumo(${idx}, 'cantidad', parseFloat(this.value)||0)" 
                class="w-full bg-transparent text-right text-[10px] font-mono focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1">
      </td>
      <td class="p-1 border-b border-slate-100 text-right w-24 min-w-[90px] align-top pt-1.5">
        <div class="flex items-center justify-end">
          <span class="text-slate-500 mr-0.5 text-[9px] font-semibold">${getCurrencySymbol()}</span>
          <input type="number" step="0.01" value="${Number(ins.costoUnitario || 0).toFixed(2)}" onchange="updateInsumo(${idx}, 'costoUnitario', parseFloat(this.value)||0)" class="w-16 text-right bg-transparent text-[10px] font-semibold font-mono focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-1">
        </div>
      </td>
      <td class="p-1 border-b border-slate-100 text-right font-bold text-slate-700 font-mono w-20 min-w-[80px] align-top pt-1.5">
        ${formatMoney(total)}
      </td>
      <td class="p-0.5 border-b border-slate-100 text-center w-6 min-w-[24px] align-top pt-1.5">
        <button onclick="removeInsumo(${idx})" class="text-slate-300 hover:text-red-600 hover:bg-red-50 rounded p-1 transition" title="Eliminar insumo">
          <i class="fa-solid fa-trash-can text-[9px]"></i>
        </button>
      </td>
    `;
    fragment.appendChild(tr);
  });

  if (visibleCount === 0) {
    const emptyTr = document.createElement('tr');
    emptyTr.innerHTML = `
      <td colspan="6" class="p-4 text-center text-slate-400 italic text-[10px]">
        ${node.insumos.length === 0 ? 'Sin insumos en la matriz. Haz clic en "+ Insumo" o "IA" para agregar.' : `No hay insumos del tipo "${state.currentMatrizFilter}".`}
      </td>
    `;
    fragment.appendChild(emptyTr);
  }

  tbody.replaceChildren(fragment);

  const totalCD = round2(sumMat + sumMO + sumHerr + sumEq + sumMaq + sumSub);
  node.costoDirecto = totalCD;

  const factor = getFactorSobrecosto();
  const totalPU = round2(totalCD * factor);
  const sobrecostoAmount = round2(totalPU - totalCD);

  const sumMatEl = document.getElementById('apu-sum-mat');
  if (sumMatEl) sumMatEl.innerText = formatMoney(sumMat);
  const sumMoEl = document.getElementById('apu-sum-mo');
  if (sumMoEl) sumMoEl.innerText = formatMoney(sumMO);
  const sumHerrEl = document.getElementById('apu-sum-herr');
  if (sumHerrEl) sumHerrEl.innerText = formatMoney(sumHerr);
  const sumEqEl = document.getElementById('apu-sum-eq');
  if (sumEqEl) sumEqEl.innerText = formatMoney(sumEq);
  const sumMaqEl = document.getElementById('apu-sum-maq');
  if (sumMaqEl) sumMaqEl.innerText = formatMoney(sumMaq);
  const sumSubEl = document.getElementById('apu-sum-sub');
  if (sumSubEl) sumSubEl.innerText = formatMoney(sumSub);
  
  const cdEl = document.getElementById('apu-calculated-cd');
  if (cdEl) cdEl.innerText = formatMoney(totalCD);

  const rowSobrecosto = document.getElementById('apu-sobrecosto-row');
  if (rowSobrecosto) {
    if (state.settings.applySobrecosto) {
      rowSobrecosto.classList.remove('hidden');
      const pct = ((factor - 1) * 100).toFixed(2);
      const tagEl = document.getElementById('apu-sobrecosto-tag');
      if (tagEl) tagEl.innerText = `Sobrecosto (+${pct}%):`;
      const sobreEl = document.getElementById('apu-calculated-sobrecosto');
      if (sobreEl) sobreEl.innerText = `+${formatMoney(sobrecostoAmount)}`;
    } else {
      rowSobrecosto.classList.add('hidden');
    }
  }

  const puEl = document.getElementById('apu-calculated-pu');
  if (puEl) puEl.innerText = formatMoney(totalPU);

  // Renderizar recuadro de Google Search Grounding si hay búsquedas o fuentes
  const groundingBox = document.getElementById('apu-grounding-box');
  if (groundingBox) {
    const queriesContainer = document.getElementById('apu-grounding-queries-container');
    const queriesEl = document.getElementById('apu-grounding-queries');
    const sourcesContainer = document.getElementById('apu-grounding-sources-container');
    const sourcesEl = document.getElementById('apu-grounding-sources');
    const tipsContainer = document.getElementById('apu-grounding-tips-container');
    const tipsEl = document.getElementById('apu-grounding-tips');

    const hasQueries = node.googleSearchQueries && node.googleSearchQueries.length > 0;
    const hasSources = node.googleSources && node.googleSources.length > 0;
    const hasTips = node.aiTips && node.aiTips.trim().length > 0;

    if (hasQueries || hasSources || hasTips) {
      groundingBox.classList.remove('hidden');

      if (hasQueries && queriesContainer && queriesEl) {
        queriesContainer.classList.remove('hidden');
        queriesEl.innerHTML = node.googleSearchQueries.map(q => 
          `<span class="bg-blue-100 text-blue-900 text-[8px] font-mono px-1.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
             <i class="fa-solid fa-magnifying-glass text-[7px] text-blue-500"></i> ${q}
           </span>`
        ).join('');
      } else if (queriesContainer) {
        queriesContainer.classList.add('hidden');
      }

      if (hasSources && sourcesContainer && sourcesEl) {
        sourcesContainer.classList.remove('hidden');
        sourcesEl.innerHTML = node.googleSources.map(s => 
          `<a href="${s.uri}" target="_blank" class="bg-indigo-100 text-indigo-900 hover:text-blue-700 hover:underline text-[8px] px-1.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1 max-w-[160px] truncate" title="${s.title} (${s.uri})">
             <i class="fa-solid fa-arrow-up-right-from-square text-[7px] text-indigo-500"></i> ${s.title}
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
      groundingBox.classList.add('hidden');
    }
  }

  node.precioUnitario = totalPU;
  const matrizBadge = document.getElementById('matriz-collapsed-badge');
  if (matrizBadge) {
    matrizBadge.innerText = `P.U.: ${formatMoney(totalPU)}`;
  }
  persistLocalData();
  renderTAB1();
  updateModalIfOpen(node);
}

// Renderizar tabla de Insumos Unitarios (Resumen de la Obra)
export function renderInsumosUnitarios(node) {
  const tbody = document.getElementById('insumos-unitarios-body');
  const totalEl = document.getElementById('insumos-unitarios-total');
  if (!tbody) return;

  const fragment = document.createDocumentFragment();

  if (!node || !node.insumos || node.insumos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-2 text-center text-slate-400 text-[9px] italic">Sin insumos registrados</td></tr>';
    if (totalEl) totalEl.innerText = '$0.00';
    const iuBadge = document.getElementById('insumos-unitarios-collapsed-badge');
    if (iuBadge) iuBadge.innerText = 'Total: $0.00';
    return;
  }

  const conceptoCantidad = round2(node.cantidad || 0);

  const filteredInsumos = node.insumos.filter(item => {
    if (state.currentFilter === 'Todos') return true;
    return item.tipo === state.currentFilter;
  });

  if (filteredInsumos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-2 text-center text-slate-400 text-[9px] italic">No hay insumos para este filtro</td></tr>';
    if (totalEl) totalEl.innerText = '$0.00';
    return;
  }

  let grandTotalInsumosObra = 0;

  filteredInsumos.forEach(ins => {
    const cant = round2(ins.cantidad || 0);
    const cantidadTotalObra = round2(cant * conceptoCantidad);
    const costoUnit = round2(ins.costoUnitario || 0);
    const totalImporteObra = round2(cantidadTotalObra * costoUnit);
    grandTotalInsumosObra = round2(grandTotalInsumosObra + totalImporteObra);

    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50";
    tr.innerHTML = `
      <td class="p-1 border-b border-slate-100 font-semibold text-slate-700 text-[9px] align-top">
        ${ins.clave || (ins.tipo ? ins.tipo.substring(0, 3).toUpperCase() : 'INS')}
      </td>
      <td class="p-1 border-b border-slate-100 text-[9px] text-slate-700 text-justify leading-snug break-words align-top" title="${ins.descripcion || ''}">
        ${ins.descripcion || 'Sin descripción'}
      </td>
      <td class="p-1 border-b border-slate-100 text-right text-[9px] font-bold text-blue-900 align-top">
        ${formatQty(cantidadTotalObra)}
      </td>
      <td class="p-1 border-b border-slate-100 text-center text-[9px] text-slate-500 align-top">
        ${ins.unidad || 'pza'}
      </td>
      <td class="p-1 border-b border-slate-100 text-right text-[9px] font-bold text-slate-800 align-top">
        ${formatMoney(totalImporteObra)}
      </td>
    `;
    fragment.appendChild(tr);
  });

  tbody.replaceChildren(fragment);
  if (totalEl) totalEl.innerText = formatMoney(grandTotalInsumosObra);
  const iuBadge = document.getElementById('insumos-unitarios-collapsed-badge');
  if (iuBadge) iuBadge.innerText = `Total: ${formatMoney(grandTotalInsumosObra)}`;
}

// Ocultar caja informativa de Google Search Grounding
export function dismissGroundingBox() {
  const box = document.getElementById('apu-grounding-box');
  if (box) box.classList.add('hidden');
}

// Plegar / desplegar secciones del panel APU (Matriz e Insumos Unitarios)
export function toggleApuSection(section, forceState = null) {
  const isMatriz = section === 'matriz';
  const contentEl = document.getElementById(isMatriz ? 'matriz-section-content' : 'insumos-unitarios-section-content');
  const chevronEl = document.getElementById(isMatriz ? 'matriz-chevron' : 'insumos-unitarios-chevron');
  const badgeEl = document.getElementById(isMatriz ? 'matriz-collapsed-badge' : 'insumos-unitarios-collapsed-badge');

  if (!contentEl) return;

  const willBeOpen = forceState !== null ? forceState : contentEl.classList.contains('hidden');

  if (willBeOpen) {
    contentEl.classList.remove('hidden');
    if (chevronEl) {
      chevronEl.classList.remove('-rotate-90');
      chevronEl.classList.add('rotate-0');
    }
    if (badgeEl) badgeEl.classList.add('hidden');
  } else {
    contentEl.classList.add('hidden');
    if (chevronEl) {
      chevronEl.classList.remove('rotate-0');
      chevronEl.classList.add('-rotate-90');
    }
    if (badgeEl) badgeEl.classList.remove('hidden');
  }
}
