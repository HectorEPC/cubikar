import { state } from '../state/store.js';
import { formatMoney, round2 } from './formatters.js';

// Cálculo del Factor de Sobrecosto (FSR/Indirectos/Financiamiento/Utilidad)
export function getFactorSobrecosto() {
  if (!state.settings.applySobrecosto) return 1.0;
  const fInd = 1 + ((parseFloat(state.settings.pctIndirectos) || 0) / 100);
  const fFin = 1 + ((parseFloat(state.settings.pctFinanciamiento) || 0) / 100);
  const fUtil = 1 + ((parseFloat(state.settings.pctUtilidad) || 0) / 100);
  const fCarg = 1 + ((parseFloat(state.settings.pctAdicionales) || 0) / 100);
  return fInd * fFin * fUtil * fCarg;
}

// Actualizar indicador visual de Sobrecosto en cabecera
export function updateSobrecostoBadge() {
  const badge = document.getElementById('badge-sobrecosto');
  const label = document.getElementById('label-factor-sobrecosto');
  const cdContainer = document.getElementById('costo-directo-total-container');

  if (!badge || !label) return;

  if (state.settings.applySobrecosto) {
    const factor = getFactorSobrecosto();
    const pctIncremento = ((factor - 1) * 100).toFixed(2);
    badge.className = "text-xs px-2.5 py-1 rounded border border-amber-600 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1.5 transition font-mono";
    label.innerText = `Sobrecosto: +${pctIncremento}%`;
    if (cdContainer) cdContainer.classList.remove('hidden');
  } else {
    badge.className = "text-xs px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-400 hover:bg-slate-700 flex items-center gap-1.5 transition";
    label.innerText = `Sobrecosto: Inactivo`;
    if (cdContainer) cdContainer.classList.add('hidden');
  }
}

// Total de una partida recursiva (sumatoria de hijos o concepto)
export function calculateParentTotal(node) {
  if (!node.children || node.children.length === 0) {
    const cant = round2(node.cantidad || 0);
    const pu = round2(node.precioUnitario || 0);
    return round2(cant * pu);
  }
  const sum = node.children.reduce((acc, child) => acc + calculateParentTotal(child), 0);
  return round2(sum);
}

// Costo directo de una partida recursiva
export function calculateParentDirectTotal(node) {
  if (!node.children || node.children.length === 0) {
    const cant = round2(node.cantidad || 0);
    const cd = node.costoDirecto !== undefined ? node.costoDirecto : node.precioUnitario;
    const cdVal = round2(cd || 0);
    return round2(cant * cdVal);
  }
  const sum = node.children.reduce((acc, child) => acc + calculateParentDirectTotal(child), 0);
  return round2(sum);
}

// Actualizar totales generales en barra superior
export function updateGrandTotal() {
  const grandTotal = round2(state.treeData.reduce((sum, root) => sum + calculateParentTotal(root), 0));
  const grandEl = document.getElementById('grand-total');
  if (grandEl) grandEl.innerText = formatMoney(grandTotal);

  const directTotal = round2(state.treeData.reduce((sum, root) => sum + calculateParentDirectTotal(root), 0));
  const directEl = document.getElementById('direct-total');
  if (directEl) directEl.innerText = formatMoney(directTotal);
}
