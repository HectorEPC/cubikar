import { state } from '../../state/store.js';
import { formatMoney, formatQty, getCurrencySymbol, round2 } from '../../core/formatters.js';
import { getHierarchyColor } from '../../core/colors.js';
import { calculateParentTotal, updateGrandTotal, updateSobrecostoBadge } from '../../core/calculations.js';
import { findNodeById } from './treeService.js';
import { renderAPUInsumos, renderInsumosUnitarios } from '../apu/apuView.js';
import { APU_WIDTH_KEY } from '../../config/constants.js';

// Renderizado de la tabla principal de catálogo (TAB1-CAT-BASE)
export function renderTAB1() {
  const tbody = document.getElementById('tb1-body');
  if (!tbody) return;

  const fragment = document.createDocumentFragment();
  let totalCount = 0;
  let selectedCount = 0;

  function traverse(nodes, level = 1, inheritedColor = null, parentColorLevel = 1) {
    nodes.forEach((node) => {
      totalCount++;
      if (node.selected) selectedCount++;

      const isParent = node.children && node.children.length > 0;
      if (isParent && node.unidad !== 'lote') {
        node.unidad = 'lote';
      }
      const hasMatriz = node.insumos && node.insumos.length > 0;
      const calculatedTotal = isParent 
        ? calculateParentTotal(node) 
        : round2((node.cantidad || 0) * (node.precioUnitario || 0));

      // Color jerárquico progresivo (con caché memoizada)
      const activeColor = node.color || inheritedColor;
      const colorOriginLevel = node.color ? level : parentColorLevel;
      const depthOffset = activeColor ? Math.max(0, level - colorOriginLevel) : 0;
      const rowBgColor = activeColor ? getHierarchyColor(activeColor, depthOffset) : '';

      const isSelected = state.activeSelectedId === node.id;
      const tr = document.createElement('tr');
      tr.className = `cursor-pointer transition duration-150 ${isSelected ? 'selected-row' : 'hover:brightness-95'}`;
      if (!isSelected && rowBgColor) {
        tr.style.backgroundColor = rowBgColor;
      }
      tr.onclick = (e) => {
        if (
          e.target.tagName !== 'INPUT' && 
          e.target.tagName !== 'TEXTAREA' && 
          e.target.tagName !== 'BUTTON' && 
          !e.target.closest('button') &&
          !e.target.closest('.dropdown-container')
        ) {
          closeAllDropdownMenus();
          selectRow(node.id);
        }
      };

      const paddingIndent = (level - 1) * 12;

      tr.innerHTML = `
        <td class="p-1 text-center align-top pt-2">
          <div class="relative inline-flex items-center justify-center">
            <label class="cursor-pointer flex items-center justify-center m-0 p-0" title="${node.color ? 'Color propio: ' + node.color + ' (clic para cambiar)' : (activeColor ? 'Color heredado del nivel superior (clic para personalizar)' : 'Elegir color para esta partida y sus sub-conceptos')}">
              <input type="color" value="${node.color || activeColor || '#3b82f6'}" 
                     onchange="updateNodeColor('${node.id}', this.value, event)" 
                     class="color-picker-dot w-4 h-4 rounded-full cursor-pointer border ${node.color ? 'border-slate-500 ring-1 ring-slate-400' : (activeColor ? 'border-slate-400 opacity-75' : 'border-slate-300 opacity-30 hover:opacity-100')}">
            </label>
            ${node.color ? `
              <button type="button" onclick="clearNodeColor('${node.id}', event)" 
                      title="Quitar color propio" 
                      class="absolute -top-1.5 -right-1.5 bg-white hover:bg-red-600 hover:text-white text-slate-500 rounded-full w-3.5 h-3.5 flex items-center justify-center border border-slate-300 text-[7px] shadow-xs transition leading-none">
                <i class="fa-solid fa-xmark"></i>
              </button>
            ` : ''}
          </div>
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          <input type="checkbox" ${node.selected ? 'checked' : ''} onchange="toggleSelectNode('${node.id}', this.checked, event)" class="rounded text-blue-600 focus:ring-blue-500 cursor-pointer">
        </td>
        <td class="p-1.5 text-center font-sans text-slate-400 text-[10px] align-top pt-2">${level}</td>
        <td class="p-1.5 font-semibold text-slate-700 align-top pt-2">${node.clave}</td>
        <td class="p-1.5 align-top text-justify">
          <div class="flex items-start" style="padding-left: ${paddingIndent}px">
            ${isParent ? `
              <button onclick="toggleExpand('${node.id}', event)" class="mr-1 text-slate-500 hover:text-slate-800 w-3 text-center shrink-0 mt-1">
                <i class="fa-solid fa-chevron-${node.expanded ? 'down' : 'right'} text-[9px]"></i>
              </button>
            ` : '<span class="w-4 inline-block shrink-0"></span>'}
            <textarea onchange="updateNode('${node.id}', 'descripcion', this.value)" 
                      class="desc-input w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white px-1 py-0.5 rounded text-xs font-sans text-justify leading-snug break-words whitespace-normal font-sans">${node.descripcion || ''}</textarea>
          </div>
        </td>
        <td class="p-1.5 text-right align-top pt-2">
          ${!isParent ? `
            <input type="number" step="0.01" value="${Number(node.cantidad || 0).toFixed(2)}" onchange="updateNode('${node.id}', 'cantidad', parseFloat(this.value) || 0)" 
                   class="w-16 text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white py-0.5 rounded text-xs font-mono">
          ` : `<span class="text-slate-400 font-mono">${formatQty(node.cantidad)}</span>`}
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          ${isParent ? `
            <span class="text-slate-600 font-medium text-xs font-mono">lote</span>
          ` : `
            <input type="text" value="${node.unidad || 'pza'}" onchange="updateNode('${node.id}', 'unidad', this.value)" 
                   class="w-10 text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white py-0.5 rounded text-xs">
          `}
        </td>
        <td class="p-1.5 text-right align-top pt-2">
          ${!isParent ? `
            <div class="flex items-center justify-end">
              <span class="text-slate-500 mr-0.5 font-semibold">${getCurrencySymbol()}</span>
              <input type="number" step="0.01" value="${Number(node.precioUnitario || 0).toFixed(2)}" onchange="updateNode('${node.id}', 'precioUnitario', parseFloat(this.value) || 0)" 
                     class="w-20 text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:bg-white py-0.5 rounded text-xs font-semibold text-blue-700 font-mono">
            </div>
          ` : '<span class="text-slate-400">-</span>'}
        </td>
        <td class="p-1.5 text-right font-bold text-slate-800 align-top pt-2">
          ${formatMoney(calculatedTotal)}
        </td>
        <td class="p-1.5 text-center align-top pt-2">
          <div class="flex items-center justify-center space-x-1">
            <button onclick="addChildRow('${node.id}', event)" 
                    title="${hasMatriz ? 'Restringido: Este concepto ya cuenta con matriz de insumos. No se pueden agregar sub-filas.' : 'Agregar Sub-renglón'}" 
                    class="${hasMatriz ? 'text-slate-300 hover:text-amber-600 p-1 transition' : 'text-blue-600 hover:text-blue-800 p-1'}">
              <i class="fa-solid fa-plus-circle text-xs ${hasMatriz ? 'opacity-35 hover:opacity-100' : ''}"></i>
            </button>
            <div class="relative dropdown-container" id="dropdown-container-${node.id}">
              <button type="button" 
                      onclick="toggleDropdownMenu('${node.id}', event)" 
                      title="Opciones de fila" 
                      class="dropdown-trigger text-slate-500 hover:text-slate-800 p-1 rounded hover:bg-slate-200 transition focus:outline-none">
                <i class="fa-solid fa-ellipsis-vertical text-xs pointer-events-none"></i>
              </button>
              <div id="dropdown-menu-${node.id}" class="dropdown-menu absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded shadow-lg z-50 text-left py-1 text-[11px] font-sans">
                <button onclick="duplicarNode('${node.id}', event); closeAllDropdownMenus();" class="w-full text-left px-3 py-1 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2">
                  <i class="fa-solid fa-clone text-[10px]"></i> Duplicar
                </button>
                <button onclick="copiarNode('${node.id}', event); closeAllDropdownMenus();" class="w-full text-left px-3 py-1 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2" title="Copiar este concepto junto con toda su matriz APU para pegarlo aquí o en otro proyecto">
                  <i class="fa-solid fa-copy text-[10px]"></i> Copiar con Matriz
                </button>
                <button onclick="pegarNode('${node.id}', event); closeAllDropdownMenus();" class="w-full text-left px-3 py-1 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 ${!state.clipboardNode ? 'opacity-40 cursor-not-allowed' : ''}" title="${state.clipboardNode ? `Pegar concepto copiado [${state.clipboardNode.clave || ''}] con su matriz APU` : 'No hay concepto en el portapapeles'}">
                  <i class="fa-solid fa-paste text-[10px]"></i> Pegar debajo
                </button>
                <div class="border-t border-slate-100 my-0.5"></div>
                <button onclick="moverNode('${node.id}', 'up', event); closeAllDropdownMenus();" class="w-full text-left px-3 py-1 hover:bg-slate-100 flex items-center gap-2">
                  <i class="fa-solid fa-arrow-up text-[10px]"></i> Mover Arriba
                </button>
                <button onclick="moverNode('${node.id}', 'down', event); closeAllDropdownMenus();" class="w-full text-left px-3 py-1 hover:bg-slate-100 flex items-center gap-2">
                  <i class="fa-solid fa-arrow-down text-[10px]"></i> Mover Abajo
                </button>
                <div class="border-t border-slate-100 my-0.5"></div>
                <button onclick="deleteNode('${node.id}', event); closeAllDropdownMenus();" class="w-full text-left px-3 py-1 hover:bg-red-50 text-red-600 flex items-center gap-2">
                  <i class="fa-solid fa-trash text-[10px]"></i> Eliminar
                </button>
              </div>
            </div>
          </div>
        </td>
      `;

      fragment.appendChild(tr);

      if (isParent && node.expanded) {
        traverse(node.children, level + 1, activeColor, colorOriginLevel);
      }
    });
  }

  traverse(state.treeData);
  tbody.replaceChildren(fragment);

  const totalItemsEl = document.getElementById('total-items');
  if (totalItemsEl) totalItemsEl.innerText = `${totalCount} renglones`;

  const selBadge = document.getElementById('selected-items-badge');
  if (selBadge) {
    if (selectedCount > 0) {
      selBadge.classList.remove('hidden');
      selBadge.innerText = `${selectedCount} sel.`;
    } else {
      selBadge.classList.add('hidden');
    }
  }

  const selectAllHeader = document.getElementById('select-all-checkbox');
  if (selectAllHeader) {
    selectAllHeader.checked = (totalCount > 0 && selectedCount === totalCount);
  }

  const statusSpan = document.getElementById('selected-row-status');
  if (statusSpan) {
    if (state.activeSelectedId) {
      const selNode = findNodeById(state.treeData, state.activeSelectedId);
      if (selNode) {
        const isGroup = selNode.children && selNode.children.length > 0;
        const hasM = selNode.insumos && selNode.insumos.length > 0;
        const badgeInfo = isGroup ? '(Partida agrupada - sin matriz)' : (hasM ? '(Concepto con matriz)' : '(Concepto sin matriz)');
        statusSpan.innerText = `Seleccionado: [${selNode.clave}] ${(selNode.descripcion || '').substring(0, 22)}... ${badgeInfo}`;
      }
    } else {
      statusSpan.innerText = `Seleccione una fila para acciones`;
    }
  }

  updateGrandTotal();
  updateSobrecostoBadge();
}

// Seleccionar fila y abrir panel APU si corresponde
export function selectRow(id) {
  state.activeSelectedId = id;
  const node = findNodeById(state.treeData, id);
  renderTAB1();

  if (!node) return;

  const apuPanel = document.getElementById('apu-panel');
  const panelResizer = document.getElementById('panel-resizer');

  // Restricción: Si la fila tiene sub-filas (partida agrupada), NO mostrar la tabla de matrices
  const hasChildren = node.children && node.children.length > 0;
  if (hasChildren) {
    if (apuPanel) apuPanel.classList.add('hidden');
    if (panelResizer) panelResizer.classList.add('hidden');
    return;
  }

  if (apuPanel) apuPanel.classList.remove('hidden');
  if (panelResizer) panelResizer.classList.remove('hidden');

  // Restaurar ancho guardado en localStorage
  const savedWidth = localStorage.getItem(APU_WIDTH_KEY);
  if (savedWidth && apuPanel) {
    const parsed = parseInt(savedWidth, 10);
    if (!isNaN(parsed) && parsed >= 320) {
      apuPanel.style.width = `${parsed}px`;
    }
  }

  const apuClave = document.getElementById('apu-clave');
  if (apuClave) apuClave.innerText = node.clave || '';
  const apuTitle = document.getElementById('apu-title');
  if (apuTitle) apuTitle.innerText = node.descripcion || 'Sin descripción';
  const apuDesc = document.getElementById('apu-desc');
  if (apuDesc) apuDesc.innerText = `Unidad: ${node.unidad || 'pza'} | Cantidad: ${node.cantidad || 0}`;

  renderAPUInsumos(node);
  renderInsumosUnitarios(node);
}

// Cerrar panel lateral de APU
export function closeApuPanel() {
  state.activeSelectedId = null;
  const apuPanel = document.getElementById('apu-panel');
  if (apuPanel) apuPanel.classList.add('hidden');
  const panelResizer = document.getElementById('panel-resizer');
  if (panelResizer) panelResizer.classList.add('hidden');
  const matrizModal = document.getElementById('matriz-modal');
  if (matrizModal) matrizModal.classList.add('hidden');
  renderTAB1();
}

// Abrir / cerrar menú desplegable de opciones de fila
export function toggleDropdownMenu(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const menu = document.getElementById(`dropdown-menu-${id}`);
  const container = document.getElementById(`dropdown-container-${id}`);
  if (!menu || !container) return;

  const wasOpen = menu.classList.contains('show') || container.classList.contains('is-open');

  // Cerrar cualquier otro menú antes de abrir
  closeAllDropdownMenus();

  if (!wasOpen) {
    // Detectar si está cerca del límite inferior para desplegar hacia arriba
    const rect = container.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 220 && rect.top > 200) {
      menu.classList.add('dropdown-menu-up');
    } else {
      menu.classList.remove('dropdown-menu-up');
    }

    menu.classList.add('show');
    container.classList.add('is-open');
  }
}

// Cerrar todos los menús desplegables abiertos
export function closeAllDropdownMenus() {
  document.querySelectorAll('.dropdown-menu.show').forEach((menu) => {
    menu.classList.remove('show', 'dropdown-menu-up');
  });
  document.querySelectorAll('.dropdown-container.is-open').forEach((container) => {
    container.classList.remove('is-open');
  });
}

// Manejadores globales para cerrar menús al hacer clic fuera o presionar Escape
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-container')) {
      closeAllDropdownMenus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdownMenus();
    }
  });
}
