// js/modules/compras/conceptExplosionHelper.js
// Motor de Explosión Semanal por Concepto(s), Proyección desde Calendario, Histórico de Precios y Seguimiento por Concepto

import { state } from '../../state/store.js?v=20261119_cf35';
import { round2, round5 } from '../../core/formatters.js?v=20261119_cf35';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js?v=20261119_cf35';
import { explodeInsumoQty } from '../../core/matrixMath.js?v=20261119_cf35';
import { getExactOpusInsumosForClave } from '../io/casaLauraData.js?v=20261119_cf35';
import { normalizeConsolidatedTipo, normalizeInsumoText, getInsumoConsolidationKey } from '../insumosGenerales/insumosConsolidator.js?v=20261119_cf35';
import { getExpensesRecords, getSupplierById, getUnitFactorForInsumo } from './expensesModel.js?v=20261119_cf35';
import { resolveInsumoTipo, getInsumosBudgetVsActualComparison } from './expensesCalculations.js?v=20261119_cf35';
import { getWarehouseMovements, getWarehouseNetConsumptionMap } from '../almacen/almacenModel.js?v=20261119_cf35';
import { loadEstimacionesData } from '../estimaciones/estimacionesModel.js?v=20261119_cf35';
import {
  extractScheduleItems,
  ensureInitialDates,
  getGanttTodayDate,
  parseDate,
  formatDate,
  addDays,
  diffDays
} from '../calendario/calendarioModel.js?v=20261119_cf35';

function buildRecordMatcherKey(r) {
  if (r.insumoId && r.insumoId !== 'EXTRA' && !String(r.insumoId).startsWith('extra_')) {
    return String(r.insumoId);
  }
  return `${normalizeInsumoText(r.description || '')}_${normalizeInsumoText(r.unit || 'pza')}`;
}

/**
 * Obtiene el historial de precios reales pagados por proveedor para un insumo específico
 */
export function getSupplierPriceHistoryForInsumo(insumoKey = '', insumoClave = '', description = '') {
  const records = getExpensesRecords().filter(r => r && r.paymentStatus !== 'cancelled' && (parseFloat(r.unitPrice) || 0) > 0);
  const cleanDesc = normalizeInsumoText(description);
  const cleanClave = String(insumoClave || '').trim().toLowerCase();
  const map = new Map();

  records.forEach(r => {
    const matchByKey = insumoKey && r.insumoId === insumoKey;
    const matchByClave = cleanClave && r.insumoClave && r.insumoClave.trim().toLowerCase() === cleanClave;
    const matchByDesc = cleanDesc && r.description && normalizeInsumoText(r.description) === cleanDesc;
    if (!matchByKey && !matchByClave && !matchByDesc) return;

    const sup = r.supplierId ? getSupplierById(r.supplierId) : null;
    const supId = r.supplierId || `name_${normalizeInsumoText(r.supplierName || 'varios')}`;
    const supName = sup ? sup.name : (r.supplierName || 'Varios');
    const pu = round2(parseFloat(r.unitPrice) || 0);
    const dt = String(r.date || '');

    if (!map.has(supId)) {
      map.set(supId, {
        supplierId: r.supplierId || '',
        supplierName: supName,
        lastPrice: pu,
        lastDate: dt,
        minPrice: pu,
        maxPrice: pu,
        count: 0
      });
    }

    const entry = map.get(supId);
    entry.count++;
    entry.minPrice = Math.min(entry.minPrice, pu);
    entry.maxPrice = Math.max(entry.maxPrice, pu);
    if (!entry.lastDate || (dt && dt >= entry.lastDate)) {
      entry.lastDate = dt;
      entry.lastPrice = pu;
    }
  });

  return Array.from(map.values()).sort((a, b) => a.lastPrice - b.lastPrice);
}

/**
 * Recopila todos los conceptos finales del catálogo con su techo presupuestado,
 * cantidad ya requisitada/comprada por explosión, surtido de almacén, estimaciones y gasto acumulado.
 */
export function getLeafConceptsCatalogSummary() {
  const records = getExpensesRecords().filter(r => r && r.paymentStatus !== 'cancelled');
  const movements = getWarehouseMovements().filter(m => m && m.status !== 'cancelled' && m.kind === 'exit');

  // Estimaciones ejecutadas por concepto
  const estByConcept = new Map();
  try {
    const estData = loadEstimacionesData();
    (estData?.estimaciones || []).forEach(est => {
      if (est.numero === 0 || !est.conceptos) return;
      for (const [cid, qty] of Object.entries(est.conceptos)) {
        const val = parseFloat(qty) || 0;
        if (val > 0) estByConcept.set(cid, round2((estByConcept.get(cid) || 0) + val));
      }
    });
  } catch (_) {}

  // Rastrear avance requisitado y materiales ya vinculados por cada concepto
  const conceptStats = new Map();
  const ensureStat = (cid) => {
    if (!conceptStats.has(cid)) {
      conceptStats.set(cid, {
        requisitadaQty: 0,
        seenBatchTokens: new Set(),
        directSubtotal: 0,
        directTotal: 0,
        warehouseExitsConceptQty: 0,
        materialsUsedMap: new Map()
      });
    }
    return conceptStats.get(cid);
  };

  const addMaterialEntry = (stat, key, clave, desc, unit, qty, sourceLabel, date) => {
    if (!stat.materialsUsedMap.has(key)) {
      stat.materialsUsedMap.set(key, {
        key,
        clave: clave || '',
        descripcion: desc || '',
        unidad: unit || 'pza',
        cantidadTotal: 0,
        fuentes: new Set(),
        ultimaFecha: date || ''
      });
    }
    const m = stat.materialsUsedMap.get(key);
    m.cantidadTotal = round2(m.cantidadTotal + (parseFloat(qty) || 0));
    if (sourceLabel) m.fuentes.add(sourceLabel);
    if (date && (!m.ultimaFecha || date > m.ultimaFecha)) m.ultimaFecha = date;
  };

  records.forEach(r => {
    const links = Array.isArray(r.conceptLinks) && r.conceptLinks.length > 0
      ? r.conceptLinks
      : (r.conceptId ? [{
          conceptId: r.conceptId,
          conceptClave: r.conceptClave || '',
          qtyCovered: r.conceptCoverageQty || 0,
          moveType: r.conceptMoveType || 'advance',
          shareRatio: 1
        }] : []);

    if (links.length === 0) return;

    const batchTokenBase = r.conceptExplosionBatchId || r.orderGroupId || r.id;
    const totalRatio = links.reduce((a, b) => a + (Number(b.shareRatio) || 0), 0) || links.length;

    links.forEach(lk => {
      if (!lk.conceptId) return;
      const st = ensureStat(lk.conceptId);
      const token = `${batchTokenBase}::${lk.conceptId}`;
      if (lk.moveType !== 'replacement' && Number(lk.qtyCovered) > 0 && !st.seenBatchTokens.has(token)) {
        st.seenBatchTokens.add(token);
        st.requisitadaQty = round2(st.requisitadaQty + Number(lk.qtyCovered));
      }

      const ratio = Number(lk.shareRatio) > 0 ? (Number(lk.shareRatio) / totalRatio) : (1 / links.length);
      st.directSubtotal = round2(st.directSubtotal + ((parseFloat(r.subtotal) || 0) * ratio));
      st.directTotal = round2(st.directTotal + ((parseFloat(r.total) || 0) * ratio));

      const matKey = buildRecordMatcherKey(r);
      addMaterialEntry(
        st,
        matKey,
        r.insumoClave || '',
        r.description || '',
        r.unit || 'pza',
        (parseFloat(r.quantity) || 0) * ratio,
        r.destination === 'warehouse' ? 'Compra (Almacén)' : 'Compra Directa',
        r.date || ''
      );
    });
  });

  movements.forEach(m => {
    if (!m.conceptId) return;
    const st = ensureStat(m.conceptId);
    if (Number(m.conceptQty) > 0) {
      st.warehouseExitsConceptQty = round2(st.warehouseExitsConceptQty + Number(m.conceptQty));
    }
    (m.items || []).forEach(it => {
      addMaterialEntry(
        st,
        it.insumoKey || it.insumoId || buildRecordMatcherKey(it),
        it.insumoClave || '',
        it.description || '',
        it.unit || 'pza',
        it.qty || 0,
        `Vale ${m.folio || 'Almacén'}`,
        m.date || ''
      );
    });
  });

  const concepts = [];

  function walk(nodes, path = []) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(node => {
      const isParent = Boolean(node.children && node.children.length > 0);
      if (!isParent) {
        if ((!node.insumos || node.insumos.length === 0) && (parseFloat(node.precioUnitario) > 0 || parseFloat(node.costoDirecto) > 0)) {
          const opusInsumos = getExactOpusInsumosForClave(node.clave);
          if (opusInsumos && opusInsumos.length > 0) {
            node.insumos = JSON.parse(JSON.stringify(opusInsumos));
          } else {
            node.insumos = generateIntegratedMatrixForConcept(node);
          }
        }

        const hasExplicitCant = node.cantidad !== undefined && node.cantidad !== null && String(node.cantidad).trim() !== '' && Number.isFinite(Number(node.cantidad));
        const cantPresup = hasExplicitCant ? Math.max(0, round2(Number(node.cantidad))) : 1.00;
        const pu = round2(parseFloat(node.precioUnitario) || 0);
        const cd = round2(parseFloat(node.costoDirecto) || pu);
        const st = conceptStats.get(node.id);
        const cantReq = st ? st.requisitadaQty : 0;
        const cantSurtAlm = st ? st.warehouseExitsConceptQty : 0;
        const cantComprometida = Math.max(cantReq, cantSurtAlm);
        const cantDisp = round2(cantPresup - cantReq);
        const cantEstimada = estByConcept.get(node.id) || 0;
        const materialsUsed = st
          ? Array.from(st.materialsUsedMap.values()).map(m => ({ ...m, fuentes: Array.from(m.fuentes) }))
          : [];

        concepts.push({
          id: node.id,
          clave: node.clave || '',
          descripcion: node.descripcion || 'Concepto sin descripción',
          unidad: node.unidad || 'ud',
          partida: path[0] || 'General',
          rutaPartida: path.join(' › ') || 'General',
          cantidadPresupuestada: cantPresup,
          cantidadRequisitada: cantReq,
          cantidadSurtidaAlmacen: cantSurtAlm,
          cantidadComprometida: cantComprometida,
          cantidadDisponible: cantDisp,
          cantidadEstimada: cantEstimada,
          puPresupuestado: pu,
          costoDirectoUnitario: cd,
          importePresupuestadoCD: round2(cantPresup * cd),
          importePresupuestadoVenta: round2(cantPresup * pu),
          gastoAcumuladoSubtotal: st ? st.directSubtotal : 0,
          gastoAcumuladoTotal: st ? st.directTotal : 0,
          pctRequisitado: cantPresup > 0 ? round2((cantReq / cantPresup) * 100) : 0,
          isMatrixCustomized: Boolean(node.isMatrixCustomized),
          insumos: Array.isArray(node.insumos) ? node.insumos : [],
          materialsUsed
        });
      } else {
        walk(node.children, [...path, node.descripcion || 'Partida']);
      }
    });
  }

  walk(state.treeData);
  return concepts;
}

/**
 * Explota una canasta de 1 o varios conceptos semanales consolidando insumos idénticos
 * y enriqueciendo con saldo de presupuesto, stock actual en bodega, historial de precios y unidades comerciales.
 */
export function explodeWeeklyConceptsBasket(basketItems = []) {
  const concepts = getLeafConceptsCatalogSummary();
  const conceptById = new Map(concepts.map(c => [c.id, c]));

  const comparison = getInsumosBudgetVsActualComparison();
  const compByKey = new Map((comparison.items || []).map(i => [i.key, i]));
  const whNetMap = getWarehouseNetConsumptionMap();

  const consolidatedMap = new Map();
  const activeConcepts = [];

  basketItems.forEach(b => {
    const c = conceptById.get(b.conceptId);
    const qtyExec = Math.max(0, round2(parseFloat(b.qtyToExecute) || 0));
    if (!c || qtyExec <= 0) return;

    const moveType = b.moveType === 'replacement' ? 'replacement' : 'advance';
    activeConcepts.push({
      conceptId: c.id,
      conceptClave: c.clave,
      conceptDesc: c.descripcion,
      unidad: c.unidad,
      partida: c.partida,
      qtyToExecute: qtyExec,
      moveType,
      cantidadDisponible: c.cantidadDisponible,
      exceedsLimit: moveType === 'advance' && qtyExec > (c.cantidadDisponible + 0.001)
    });

    (c.insumos || []).forEach(ins => {
      const tipo = resolveInsumoTipo(ins);
      const key = getInsumoConsolidationKey({ ...ins, tipo });
      const cantUnit = round5(ins.cantidad || 0);
      if (cantUnit <= 0) return;

      const qtyRequired = explodeInsumoQty(ins, qtyExec);
      const costoUnitMatrix = round2(ins.costoUnitario || 0);

      if (!consolidatedMap.has(key)) {
        const compItem = compByKey.get(key);
        const whItem = whNetMap.byKey.get(key)
          || (ins.clave ? whNetMap.byClave.get(ins.clave.trim().toLowerCase()) : null)
          || whNetMap.byDesc.get(normalizeInsumoText(ins.descripcion || ''));
        const unitFactor = getUnitFactorForInsumo(key);
        const priceHistory = getSupplierPriceHistoryForInsumo(key, ins.clave || '', ins.descripcion || '');
        const bestHistoryPrice = priceHistory.length > 0 ? priceHistory[0].lastPrice : 0;
        const unitStr = String(ins.unidad || 'pza').trim();
        const isPercentUnit = unitStr === '%' || unitStr.toLowerCase().includes('% mo');

        consolidatedMap.set(key, {
          insumoKey: key,
          clave: ins.clave || `${tipo.substring(0, 3).toUpperCase()}-01`,
          tipo,
          descripcion: ins.descripcion || 'Sin descripción',
          unidad: unitStr,
          puPresupuestado: compItem?.puPresupuestado || costoUnitMatrix,
          suggestedPrice: bestHistoryPrice > 0 ? bestHistoryPrice : (compItem?.puPresupuestado || costoUnitMatrix),
          budgetTotalQty: compItem?.cantidadPresupuestada || 0,
          budgetSaldoQty: compItem?.saldoDisponible ?? 0,
          stockEnBodega: whItem ? Math.max(0, whItem.stockEnBodega) : 0,
          priceHistory,
          unitFactor,
          cantidadCalculada: 0,
          checkedDefault: !isPercentUnit && (tipo === 'Material' || tipo === 'Subcontrato' || tipo === 'Equipo' || tipo === 'Maquinaria'),
          isPercentUnit,
          sources: []
        });
      }

      const row = consolidatedMap.get(key);
      row.cantidadCalculada = round5(row.cantidadCalculada + qtyRequired);
      row.sources.push({
        conceptId: c.id,
        conceptClave: c.clave,
        conceptDesc: c.descripcion,
        qtyConcept: qtyExec,
        qtyInsumo: qtyRequired,
        moveType
      });
    });
  });

  // Ordenar por rubro estándar para mejor lectura
  const orderRank = {
    'Material': 1,
    'Subcontrato': 2,
    'Equipo': 3,
    'Maquinaria': 4,
    'Mano de Obra': 5,
    'Herramienta': 6,
    'Indirecto': 7
  };

  const rows = Array.from(consolidatedMap.values()).sort((a, b) => {
    const rA = orderRank[a.tipo] || 9;
    const rB = orderRank[b.tipo] || 9;
    if (rA !== rB) return rA - rB;
    return a.descripcion.localeCompare(b.descripcion);
  });

  return {
    concepts: activeConcepts,
    insumos: rows,
    hasUnreviewedMatrices: activeConcepts.some(ac => {
      const full = conceptById.get(ac.conceptId);
      return full && !full.isMatrixCustomized;
    })
  };
}

/**
 * Consulta el Calendario de Obra (Gantt) para sugerir conceptos programados
 * en los próximos `daysAhead` días (7 o 15 días) y estimar su volumen proporcional.
 */
export function getCalendarUpcomingConceptsSummary(daysAhead = 7) {
  const concepts = getLeafConceptsCatalogSummary();
  const conceptById = new Map(concepts.map(c => [c.id, c]));

  const schedItems = extractScheduleItems(state.treeData);
  const leafSched = schedItems.filter(it => !it.isParent);
  if (leafSched.length === 0) return [];

  const anyHasDates = leafSched.some(it => Boolean(it.startDate));
  if (!anyHasDates) {
    ensureInitialDates(schedItems);
  }

  const todayStr = getGanttTodayDate();
  const winStart = parseDate(todayStr);
  const winEnd = addDays(winStart, Math.max(1, Number(daysAhead) || 7) - 1);
  const winStartStr = formatDate(winStart);
  const winEndStr = formatDate(winEnd);

  const suggestions = [];

  schedItems.forEach(it => {
    if (it.isParent) return;
    const sStr = it.node?.schedule?.startDate || it.startDate;
    const eStr = it.node?.schedule?.endDate || it.endDate || sStr;
    if (!sStr) return;

    const cStart = parseDate(sStr);
    const cEnd = parseDate(eStr);
    if (cEnd < winStart || cStart > winEnd) return;

    const conceptMeta = conceptById.get(it.id);
    if (!conceptMeta || conceptMeta.cantidadDisponible <= 0) return;

    const totalDays = Math.max(1, diffDays(cStart, cEnd) + 1);
    const ovStart = cStart > winStart ? cStart : winStart;
    const ovEnd = cEnd < winEnd ? cEnd : winEnd;
    const overlapDays = Math.max(1, diffDays(ovStart, ovEnd) + 1);

    const proportionalQty = round2((conceptMeta.cantidadPresupuestada * overlapDays) / totalDays);
    const suggestedQty = Math.min(conceptMeta.cantidadDisponible, Math.max(0.01, proportionalQty));

    suggestions.push({
      conceptId: conceptMeta.id,
      clave: conceptMeta.clave,
      descripcion: conceptMeta.descripcion,
      unidad: conceptMeta.unidad,
      partida: conceptMeta.partida,
      startDate: sStr,
      endDate: eStr,
      windowLabel: `${winStartStr} a ${winEndStr}`,
      cantidadPresupuestada: conceptMeta.cantidadPresupuestada,
      cantidadDisponible: conceptMeta.cantidadDisponible,
      suggestedQty
    });
  });

  return suggestions;
}

/**
 * Reporte administrativo completo de avance y consumo por concepto
 */
export function getConceptCostTrackingReport() {
  const concepts = getLeafConceptsCatalogSummary();
  const whSummary = getWarehouseNetConsumptionMap();
  const budgetExplosion = getInsumosBudgetVsActualComparison();
  const puMap = new Map((budgetExplosion.items || []).map(i => [i.key, i.puRealPromedio || i.puPresupuestado || 0]));

  // Complementar valor estimado de salidas de almacén hacia cada concepto
  const movements = getWarehouseMovements().filter(m => m && m.status !== 'cancelled' && m.kind === 'exit' && m.conceptId);
  const warehouseCostByConcept = new Map();
  movements.forEach(m => {
    let val = 0;
    (m.items || []).forEach(it => {
      const pu = puMap.get(it.insumoKey) || 0;
      val += (parseFloat(it.qty) || 0) * pu;
    });
    warehouseCostByConcept.set(m.conceptId, round2((warehouseCostByConcept.get(m.conceptId) || 0) + val));
  });

  return concepts
    .map(c => {
      const whCost = warehouseCostByConcept.get(c.id) || 0;
      const totalCostoRealEstimado = round2(c.gastoAcumuladoSubtotal + whCost);
      const hasActivity = c.cantidadRequisitada > 0 || c.cantidadSurtidaAlmacen > 0 || c.materialsUsed.length > 0 || c.cantidadEstimada > 0;
      const desviacionConcepto = round2(c.importePresupuestadoCD - totalCostoRealEstimado);

      return {
        ...c,
        costoSalidasAlmacenEst: whCost,
        costoRealAcumulado: totalCostoRealEstimado,
        saldoCostoDirecto: desviacionConcepto,
        hasActivity,
        whStockAvailableHint: whSummary.rawItems?.length || 0
      };
    });
}
