import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { findNodeById, getSelectedLeafConcepts } from '../catalog/treeService.js';
import { renderAPUInsumos, renderInsumosUnitarios, toggleApuSection } from './apuView.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { guardTabUnlocked } from '../../ui/tabLockController.js';
import { round2, round5 } from '../../core/formatters.js';

// Filtro de botones en la tabla Matriz APU
export function filterMatriz(tipo) {
  state.currentMatrizFilter = tipo;
  
  const filterKeys = ['Todos', 'Material', 'Mano-de-Obra', 'Herramienta', 'Equipo', 'Maquinaria', 'Subcontrato'];
  filterKeys.forEach(key => {
    const btn = document.getElementById(`filter-matriz-${key}`);
    if (btn) {
      btn.className = "px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 shadow-xs transition font-medium";
    }
  });

  const activeBtnKey = tipo.replace(/ /g, '-');
  const activeBtn = document.getElementById(`filter-matriz-${activeBtnKey}`);
  if (activeBtn) {
    activeBtn.className = "px-2 py-0.5 rounded bg-blue-600 text-white border border-blue-600 shadow-xs transition font-semibold";
  }

  if (state.activeSelectedId) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) renderAPUInsumos(node);
  }
}

// Filtro de insumos en la tabla inferior (Resumen Obra)
export function filterInsumos(tipo) {
  state.currentFilter = tipo;
  
  const filterKeys = ['Todos', 'Material', 'Mano-de-Obra', 'Equipo', 'Subcontrato'];
  filterKeys.forEach(key => {
    const btn = document.getElementById(`filter-${key}`);
    if (btn) {
      btn.className = "px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200";
    }
  });

  const activeBtnKey = tipo.replace(/ /g, '-');
  const activeBtn = document.getElementById(`filter-${activeBtnKey}`);
  if (activeBtn) {
    activeBtn.className = "px-1.5 py-0.5 rounded bg-blue-600 text-white border border-blue-600 font-bold";
  }

  if (state.activeSelectedId) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) renderInsumosUnitarios(node);
  }
}

// Agregar nuevo insumo a la matriz del concepto activo
export function addInsumo() {
  if (!guardTabUnlocked('cat')) return;
  if (!state.activeSelectedId) return;
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) return;
  if (node.children && node.children.length > 0) {
    showToast('Restricción: Esta fila contiene sub-conceptos y no puede tener matriz de insumos.', 'warning');
    return;
  }
  saveState();
  toggleApuSection('matriz', true);
  if (!node.insumos) node.insumos = [];
  const defaultTipo = (state.currentMatrizFilter && state.currentMatrizFilter !== 'Todos') ? state.currentMatrizFilter : 'Material';
  node.isMatrixCustomized = true;
  node.userClearedMatrix = false;
  node.insumos.push({
    clave: `INS-0${node.insumos.length + 1}`,
    tipo: defaultTipo,
    descripcion: 'Nuevo Insumo',
    unidad: 'pza',
    cantidad: 1.00,
    costoUnitario: 0.00
  });
  renderAPUInsumos(node);
  renderInsumosUnitarios(node);
}

// Actualizar un campo de un insumo (descripcion, tipo, unidad, cantidad, costoUnitario)
export function updateInsumo(index, field, value) {
  if (!guardTabUnlocked('cat')) {
    const node = findNodeById(state.treeData, state.activeSelectedId);
    if (node) renderAPUInsumos(node);
    return;
  }
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (node && node.insumos && node.insumos[index]) {
    node.isMatrixCustomized = true;
    const ins = node.insumos[index];
    if (field === 'cantidad') {
      ins.cantidad = round5(value);
    } else if (field === 'costoUnitario') {
      ins.costoUnitario = round2(value);
    } else {
      ins[field] = value;
    }
    renderAPUInsumos(node);
    renderInsumosUnitarios(node);
  }
}

// Eliminar un insumo de la matriz
export function removeInsumo(index) {
  if (!guardTabUnlocked('cat')) return;
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (node && node.insumos) {
    const idx = parseInt(index, 10);
    if (!isNaN(idx) && idx >= 0 && idx < node.insumos.length) {
      saveState();
      node.isMatrixCustomized = true;
      node.insumos.splice(idx, 1);
      if (node.insumos.length === 0) {
        node.userClearedMatrix = true;
      }
      persistLocalData();
      renderAPUInsumos(node);
      renderInsumosUnitarios(node);
      showToast('Insumo eliminado de la matriz', 'info');
    }
  }
}

// Limpiar todo el contenido de la matriz del concepto seleccionado
export function limpiarMatrizConceptoSeleccionado() {
  if (!guardTabUnlocked('cat')) return;
  if (!state.activeSelectedId) {
    showToast('Selecciona primero un concepto en la tabla para limpiar su matriz.', 'warning');
    return;
  }
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) {
    showToast('No se encontró el concepto seleccionado.', 'warning');
    return;
  }

  if (node.children && node.children.length > 0) {
    showToast('Esta fila contiene sub-conceptos (partida agrupada) y no tiene matriz de insumos.', 'warning');
    return;
  }

  if (!node.insumos || node.insumos.length === 0) {
    showToast('La matriz de este concepto ya está vacía.', 'info');
    return;
  }

  const claveDisplay = node.clave ? `[${node.clave}] ` : '';
  const count = node.insumos.length;
  const confirmMsg = `¿Deseas vaciar toda la matriz del concepto seleccionado?\n\n${claveDisplay}${node.descripcion}\n\nSe eliminarán los ${count} insumos que la conforman.`;
  if (!confirm(confirmMsg)) {
    return;
  }

  saveState();

  node.insumos = [];
  node.isMatrixCustomized = true;
  node.userClearedMatrix = true;
  node.costoDirecto = 0;
  node.precioUnitario = 0;
  node.aiTips = '';
  node.googleSources = [];
  node.googleSearchQueries = [];
  node._generationMode = null;

  persistLocalData();
  renderAPUInsumos(node);
  renderInsumosUnitarios(node);
  renderTAB1();

  showToast(`Matriz de ${claveDisplay}${node.descripcion.substring(0, 35)}... vaciada exitosamente.`, 'success');
}

// Limpiar matrices APU de todos los conceptos que tengan casilla seleccionada
export function limpiarMatricesCasillas() {
  if (!guardTabUnlocked('cat')) return;

  let targets = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
  if (targets.length === 0 && state.activeSelectedId) {
    const active = findNodeById(state.treeData, state.activeSelectedId);
    if (active && (!active.children || active.children.length === 0)) {
      active.selected = true;
      targets = [active];
      persistLocalData();
      renderTAB1();
    }
  }

  if (targets.length === 0) {
    showToast('Selecciona con la casilla (checkbox) los conceptos cuyas matrices deseas limpiar.', 'warning');
    return;
  }

  const withInsumos = targets.filter(node => node.insumos && node.insumos.length > 0);
  if (withInsumos.length === 0) {
    showToast('Ninguno de los conceptos seleccionados con casilla tiene matriz de insumos.', 'info');
    return;
  }

  const count = withInsumos.length;
  const msg = targets.length === 1
    ? `¿Deseas vaciar la matriz del concepto seleccionado con casilla?\n\n[${targets[0].clave || ''}] ${targets[0].descripcion}\n\nSe eliminarán los ${targets[0].insumos.length} insumos de su matriz.`
    : `¿Estás seguro de que deseas vaciar las matrices de los ${count} conceptos seleccionados con casilla?\n\nEsta acción eliminará todos sus insumos y restablecerá sus costos directos y precios unitarios a $0.00.`;

  if (!confirm(msg)) {
    return;
  }

  saveState();

  for (const node of targets) {
    node.insumos = [];
    node.isMatrixCustomized = true;
    node.userClearedMatrix = true;
    node.costoDirecto = 0;
    node.precioUnitario = 0;
    node.aiTips = '';
    node.googleSources = [];
    node.googleSearchQueries = [];
    node._generationMode = null;
  }

  persistLocalData();
  renderTAB1();

  if (state.activeSelectedId) {
    const activeNode = findNodeById(state.treeData, state.activeSelectedId);
    if (activeNode) {
      renderAPUInsumos(activeNode);
      renderInsumosUnitarios(activeNode);
    }
  }

  const resultMsg = targets.length === 1
    ? '¡Matriz del concepto vaciada correctamente!'
    : `✅ Se vaciaron las matrices de ${count} conceptos seleccionados correctamente.`;
  showToast(resultMsg, 'success');
}
