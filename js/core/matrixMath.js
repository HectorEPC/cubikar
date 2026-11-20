// js/core/matrixMath.js
// Motor canónico de cálculo de Matrices APU (Análisis de Precios Unitarios).
// Módulo SIN dependencias para poder usarse desde store, vistas, impresión, compras y móvil
// garantizando que TODO el sistema calcule exactamente igual:
//
//   • Los consumos (cantidad) de cada insumo son por 1 unidad del concepto (rendimiento unitario).
//   • Importe del insumo        = round2( round5(cantidad) × round2(costoUnitario) )
//   • Insumos en porcentaje (%) = fracción de la Mano de Obra del concepto (ej. 0.03 = 3% MO).
//     Su costo unitario se recalcula SIEMPRE como la suma vigente de Mano de Obra, por lo que
//     herramienta menor, equipo de seguridad, andamios, etc. nunca quedan desfasados.
//   • Costo directo (CD)        = round2( Σ importes )
//   • Precio unitario (PU)      = round2( CD × factor de sobrecosto )
//   • Importe del concepto      = round2( round2(cantidad concepto) × round2(PU) )
//   • Explosión de insumos      = round5( cantidad insumo × cantidad concepto )

export const mRound2 = (val) => {
  const n = Number(val) || 0;
  return Math.round((n + (n >= 0 ? 1e-12 : -1e-12)) * 100) / 100;
};

export const mRound5 = (val) => {
  const n = Number(val) || 0;
  return Math.round((n + (n >= 0 ? 1e-12 : -1e-12)) * 100000) / 100000;
};

const MO_TIPO = 'Mano de Obra';

// Insumo expresado como porcentaje de la mano de obra: unidades '%', '%mo', '(%)MO', '% MO', etc.
export function isPercentInsumo(ins) {
  return /%/.test(String(ins?.unidad ?? ''));
}

export function insumoImporte(ins) {
  return mRound2(mRound5(ins?.cantidad) * mRound2(ins?.costoUnitario));
}

// Suma de mano de obra (base de los insumos en %), excluyendo filas porcentuales
export function getManoObraBase(insumos) {
  if (!Array.isArray(insumos)) return 0;
  let base = 0;
  for (const ins of insumos) {
    if (!ins || ins.tipo !== MO_TIPO || isPercentInsumo(ins)) continue;
    base += insumoImporte(ins);
  }
  return mRound2(base);
}

// Recalcula el costo unitario de los insumos en % = suma vigente de MO. Devuelve true si cambió algo.
export function syncPercentInsumos(insumos) {
  if (!Array.isArray(insumos) || insumos.length === 0) return false;
  if (!insumos.some(isPercentInsumo)) return false;
  const base = getManoObraBase(insumos);
  let changed = false;
  for (const ins of insumos) {
    if (!isPercentInsumo(ins)) continue;
    if (mRound2(ins.costoUnitario) !== base) {
      ins.costoUnitario = base;
      changed = true;
    }
  }
  return changed;
}

// Desglose por rubro + costo directo total. Todo insumo suma al CD (incluso sin rubro reconocido).
export function computeMatrixBreakdown(insumos, { syncPercent = true } = {}) {
  const out = { mat: 0, mo: 0, herr: 0, eq: 0, maq: 0, sub: 0, otros: 0, cd: 0 };
  if (!Array.isArray(insumos) || insumos.length === 0) return out;
  if (syncPercent) syncPercentInsumos(insumos);
  for (const ins of insumos) {
    if (!ins) continue;
    const imp = insumoImporte(ins);
    switch (ins.tipo) {
      case 'Material': out.mat += imp; break;
      case MO_TIPO: out.mo += imp; break;
      case 'Herramienta': out.herr += imp; break;
      case 'Equipo': out.eq += imp; break;
      case 'Maquinaria': out.maq += imp; break;
      case 'Subcontrato': case 'Flete': case 'Auxiliar': out.sub += imp; break;
      default: out.otros += imp;
    }
  }
  for (const k of ['mat', 'mo', 'herr', 'eq', 'maq', 'sub', 'otros']) out[k] = mRound2(out[k]);
  out.cd = mRound2(out.mat + out.mo + out.herr + out.eq + out.maq + out.sub + out.otros);
  return out;
}

export function computeMatrixDirectCost(insumos, opts) {
  return computeMatrixBreakdown(insumos, opts).cd;
}

export function computeFactorSobrecosto(settings) {
  if (!settings || !settings.applySobrecosto) return 1.0;
  const f = (k) => 1 + ((parseFloat(settings[k]) || 0) / 100);
  return f('pctIndirectos') * f('pctFinanciamiento') * f('pctUtilidad') * f('pctAdicionales') * f('pctSegurosFianzas');
}

function isLeafWithMatrix(node) {
  return node && (!Array.isArray(node.children) || node.children.length === 0)
    && Array.isArray(node.insumos) && node.insumos.length > 0;
}

// El concepto es el resultado de su matriz: CD = Σ matriz y PU = CD × factor. Devuelve true si cambió.
export function recalcConceptFromMatrix(node, factor = 1) {
  if (!isLeafWithMatrix(node)) return false;
  const before = `${node.costoDirecto}|${node.precioUnitario}`;
  const pctChanged = syncPercentInsumos(node.insumos);
  const cd = computeMatrixDirectCost(node.insumos, { syncPercent: false });
  node.costoDirecto = cd;
  node.precioUnitario = mRound2(cd * (Number(factor) || 1));
  return pctChanged || before !== `${node.costoDirecto}|${node.precioUnitario}`;
}

export function recalcTreeFromMatrices(nodes, factor = 1) {
  let changed = 0;
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const n of list) {
      if (!n) continue;
      if (Array.isArray(n.children) && n.children.length > 0) walk(n.children);
      else if (recalcConceptFromMatrix(n, factor)) changed++;
    }
  };
  walk(nodes);
  return changed;
}

export function leafImporte(node) {
  return mRound2(mRound2(node?.cantidad) * mRound2(node?.precioUnitario));
}

export function leafDirectImporte(node) {
  const cd = (node?.costoDirecto !== undefined && node?.costoDirecto !== null) ? node.costoDirecto : node?.precioUnitario;
  return mRound2(mRound2(node?.cantidad) * mRound2(cd));
}

// Cantidad total de un insumo para ejecutar `conceptQty` unidades del concepto
export function explodeInsumoQty(ins, conceptQty) {
  return mRound5(mRound5(ins?.cantidad) * mRound2(conceptQty));
}

// Importe total de un insumo para `conceptQty` unidades del concepto
export function explodeInsumoImporte(ins, conceptQty) {
  return mRound2(explodeInsumoQty(ins, conceptQty) * mRound2(ins?.costoUnitario));
}
