import { state } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { findNodeById } from '../catalog/treeService.js';
import { renderAPUInsumos, renderInsumosUnitarios, toggleApuSection } from './apuView.js';

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
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (node && node.insumos && node.insumos[index]) {
    const ins = node.insumos[index];
    if (field === 'cantidad' || field === 'costoUnitario') {
      ins[field] = Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
    } else {
      ins[field] = value;
    }
    renderAPUInsumos(node);
    renderInsumosUnitarios(node);
  }
}

// Eliminar un insumo de la matriz
export function removeInsumo(index) {
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (node && node.insumos) {
    saveState();
    node.insumos.splice(index, 1);
    renderAPUInsumos(node);
    renderInsumosUnitarios(node);
  }
}
