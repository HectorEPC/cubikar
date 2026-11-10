import { state } from '../state/store.js';
import { formatMoney, round2, round5 } from './formatters.js';

export { round2, round5 };

// Cálculo del Factor de Sobrecosto (FSR/Indirectos/Financiamiento/Utilidad/Seguros y Fianzas)
export function getFactorSobrecosto() {
  if (!state.settings.applySobrecosto) return 1.0;
  const fInd = 1 + ((parseFloat(state.settings.pctIndirectos) || 0) / 100);
  const fFin = 1 + ((parseFloat(state.settings.pctFinanciamiento) || 0) / 100);
  const fUtil = 1 + ((parseFloat(state.settings.pctUtilidad) || 0) / 100);
  const fCarg = 1 + ((parseFloat(state.settings.pctAdicionales) || 0) / 100);
  const fSeg = 1 + ((parseFloat(state.settings.pctSegurosFianzas) || 0) / 100);
  return fInd * fFin * fUtil * fCarg * fSeg;
}

// Factor multiplicador de Salario Real (FASAR / IMSS-INFONAVIT) sobre mano de obra
export function getFasarFactor() {
  const p = parseFloat(state.settings?.pctFasar);
  if (isNaN(p) || p <= 0) return 1.70;
  if (p < 5.0) return p; // Por si fue capturado como multiplicador directo (ej. 1.70)
  return 1 + (p / 100);
}

// Actualizar indicador visual de Sobrecosto en cabecera
export function updateSobrecostoBadge() {
  const badge = document.getElementById('badge-sobrecosto');
  const label = document.getElementById('label-factor-sobrecosto');
  const cdContainer = document.getElementById('costo-directo-total-container');

  if (!badge || !label) return;

  if (state.settings.applySobrecosto) {
    const factor = getFactorSobrecosto();
    const pctIncremento = ((factor - 1) * 100).toFixed(1);
    badge.className = "w-11 h-11 rounded-xl border border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex flex-col items-center justify-center transition font-mono shadow-xs cursor-pointer group";
    label.innerText = `+${pctIncremento}%`;
    badge.setAttribute('title', `Sobrecosto Activo: +${pctIncremento}% (Clic para configurar)`);
    if (cdContainer) cdContainer.classList.remove('hidden');
  } else {
    badge.className = "w-11 h-11 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:bg-slate-850 hover:text-slate-200 hover:border-slate-700 flex flex-col items-center justify-center transition cursor-pointer group shadow-2xs";
    label.innerText = "Inactivo";
    badge.setAttribute('title', "Sobrecosto: Inactivo (Clic para activar/configurar)");
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
  if (sum === 0 && (node.precioUnitario || 0) > 0 && (node.cantidad || 0) > 0) {
    return round2((node.cantidad || 0) * (node.precioUnitario || 0));
  }
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
  if (sum === 0 && (node.costoDirecto || node.precioUnitario || 0) > 0 && (node.cantidad || 0) > 0) {
    const cd = node.costoDirecto !== undefined ? node.costoDirecto : node.precioUnitario;
    return round2((node.cantidad || 0) * (cd || 0));
  }
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
