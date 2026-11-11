// js/modules/compras/expensesCalculations.js
// Motor de cálculos financieros, KPIs de obra y cruce con la Explosión de Insumos

import { state } from '../../state/store.js';
import { round2, round5 } from '../../core/formatters.js';
import { getFactorSobrecosto } from '../../core/calculations.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import { getExactOpusInsumosForClave } from '../io/casaLauraData.js';
import { normalizeConsolidatedTipo, normalizeInsumoText, getInsumoConsolidationKey } from '../insumosGenerales/insumosConsolidator.js';
import { loadEstimacionesData } from '../estimaciones/estimacionesModel.js';
import { getExpensesRecords, getExpensesConfig } from './expensesModel.js';

/**
 * Obtener Monto Total Contratado / Presupuestado de la obra
 */
export function getContractedBudgetTotal() {
  let totalDirecto = 0;
  let totalVenta = 0;
  const factor = getFactorSobrecosto();

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(node => {
      const isParent = Boolean(node.children && node.children.length > 0);
      if (!isParent) {
        const cant = parseFloat(node.cantidad) || 0;
        const pu = parseFloat(node.precioUnitario) || 0;
        const cd = parseFloat(node.costoDirecto) || pu;
        
        totalDirecto += (cant * cd);
        totalVenta += (cant * pu);
      } else {
        walk(node.children);
      }
    });
  }

  walk(state.treeData);

  const applySobrecosto = Boolean(state.settings?.applySobrecosto);
  const presupuestoFinal = applySobrecosto && factor > 0 ? (totalDirecto * factor) : totalVenta;

  return {
    totalDirecto: round2(totalDirecto),
    totalPresupuesto: round2(presupuestoFinal > 0 ? presupuestoFinal : totalDirecto),
    factorSobrecosto: factor
  };
}

/**
 * Obtener Total Facturado / Estimado (Cobrado o en proceso) desde Estimaciones
 */
export function getTotalEstimacionesCobrado() {
  try {
    const estData = loadEstimacionesData();
    if (!estData || !Array.isArray(estData.estimaciones)) {
      return 0;
    }

    const anticipoPct = (typeof estData.anticipoPct === 'number') ? estData.anticipoPct : 30;
    const ivaPct = (typeof estData.ivaPct === 'number') ? estData.ivaPct : 16;
    let totalAcumuladoEstimado = 0;

    // Mapa de precios unitarios de conceptos
    const priceMap = new Map();
    function mapPrices(nodes) {
      if (!Array.isArray(nodes)) return;
      nodes.forEach(n => {
        if (!n.children || n.children.length === 0) {
          priceMap.set(String(n.id), parseFloat(n.precioUnitario) || 0);
        } else {
          mapPrices(n.children);
        }
      });
    }
    mapPrices(state.treeData);

    estData.estimaciones.forEach(est => {
      let subtotalEst = 0;
      if (est.conceptos && typeof est.conceptos === 'object') {
        Object.entries(est.conceptos).forEach(([cId, cantEjec]) => {
          const pu = priceMap.get(String(cId)) || 0;
          subtotalEst += ((parseFloat(cantEjec) || 0) * pu);
        });
      }
      
      const amort = subtotalEst * (anticipoPct / 100);
      const subNeto = subtotalEst - amort;
      const iva = subNeto * (ivaPct / 100);
      const totalEst = subNeto + iva;
      totalAcumuladoEstimado += totalEst;
    });

    return round2(totalAcumuladoEstimado);
  } catch (err) {
    console.warn('[ExpensesCalculations] Error al leer estimaciones:', err);
    return 0;
  }
}

/**
 * Cálculo integral de KPIs y Dashboard Financiero
 */
export function getExpensesKpiMetrics() {
  const records = getExpensesRecords();
  const config = getExpensesConfig();
  const { totalPresupuesto, totalDirecto } = getContractedBudgetTotal();
  const totalFacturadoEstimado = getTotalEstimacionesCobrado();

  let totalEgresosReales = 0;       // Estatus: paid
  let totalEgresosPorPagar = 0;      // Estatus: pending
  let totalEgresosComprometidos = 0; // paid + pending
  let totalCancelados = 0;

  const byType = {
    material: { count: 0, subtotal: 0, tax: 0, total: 0, paid: 0 },
    labor: { count: 0, subtotal: 0, tax: 0, total: 0, paid: 0 },
    equipment: { count: 0, subtotal: 0, tax: 0, total: 0, paid: 0 },
    indirect: { count: 0, subtotal: 0, tax: 0, total: 0, paid: 0 }
  };

  records.forEach(rec => {
    if (rec.paymentStatus === 'cancelled') {
      totalCancelados += (rec.total || 0);
      return;
    }

    const t = rec.type || 'material';
    if (!byType[t]) {
      byType[t] = { count: 0, subtotal: 0, tax: 0, total: 0, paid: 0 };
    }

    const recTotal = parseFloat(rec.total) || 0;
    const recSub = parseFloat(rec.subtotal) || 0;
    const recTax = parseFloat(rec.tax) || 0;

    byType[t].count++;
    byType[t].subtotal = round2(byType[t].subtotal + recSub);
    byType[t].tax = round2(byType[t].tax + recTax);
    byType[t].total = round2(byType[t].total + recTotal);

    if (rec.paymentStatus === 'paid') {
      totalEgresosReales = round2(totalEgresosReales + recTotal);
      byType[t].paid = round2(byType[t].paid + recTotal);
    } else {
      totalEgresosPorPagar = round2(totalEgresosPorPagar + recTotal);
    }

    totalEgresosComprometidos = round2(totalEgresosComprometidos + recTotal);
  });

  // Utilidad en caja inmediata = Ingresos cobrados por estimación - Egresos pagados
  const utilidadEnCaja = round2(totalFacturadoEstimado - totalEgresosReales);

  // Proyección de utilidad al cierre = Presupuesto contratado - Total de egresos comprometidos
  const proyeccionUtilidadCierre = round2(totalPresupuesto - totalEgresosComprometidos);
  const margenUtilidadProyectado = totalPresupuesto > 0 
    ? round2((proyeccionUtilidadCierre / totalPresupuesto) * 100) 
    : 0;

  // Semáforo Financiero de la Obra
  const alertThreshold = config.alertThresholdPercent || 10;
  const pctGastadoDelPresupuesto = totalPresupuesto > 0 
    ? round2((totalEgresosComprometidos / totalPresupuesto) * 100) 
    : 0;

  let semaforo = {
    color: 'emerald', // 'emerald' | 'amber' | 'rose'
    badgeText: 'Saludable / En Presupuesto',
    icon: 'fa-circle-check',
    description: 'Los egresos reales están dentro de los márgenes contratados.',
    pctGastado: pctGastadoDelPresupuesto
  };

  if (totalPresupuesto > 0) {
    if (totalEgresosComprometidos > totalPresupuesto) {
      semaforo = {
        color: 'rose',
        badgeText: 'Sobrepaso Presupuestal',
        icon: 'fa-triangle-exclamation',
        description: `Los egresos ($${round2(totalEgresosComprometidos).toLocaleString()}) superan el presupuesto contratado en un ${round2(pctGastadoDelPresupuesto - 100)}%.`,
        pctGastado: pctGastadoDelPresupuesto
      };
    } else if (pctGastadoDelPresupuesto >= (100 - alertThreshold)) {
      semaforo = {
        color: 'amber',
        badgeText: 'Alerta de Límite Presupuestal',
        icon: 'fa-circle-exclamation',
        description: `Se ha ejercido el ${pctGastadoDelPresupuesto}% del presupuesto total de la obra.`,
        pctGastado: pctGastadoDelPresupuesto
      };
    }
  }

  return {
    presupuestoContratado: totalPresupuesto,
    costoDirectoPresupuestado: totalDirecto,
    totalFacturadoEstimado: totalFacturadoEstimado,
    totalEgresosReales: totalEgresosReales,
    totalEgresosPorPagar: totalEgresosPorPagar,
    totalEgresosComprometidos: totalEgresosComprometidos,
    utilidadEnCaja: utilidadEnCaja,
    proyeccionUtilidadCierre: proyeccionUtilidadCierre,
    margenUtilidadProyectado: margenUtilidadProyectado,
    byType: byType,
    semaforo: semaforo,
    totalRegistros: records.length,
    currency: config.currency || 'MXN'
  };
}

/**
 * Clasificar o resolver el rubro exacto del insumo entre los 6 tipos estándar:
 * Material, Mano de Obra, Herramienta, Equipo, Maquinaria, Subcontrato (o Indirecto)
 */
export function resolveInsumoTipo(ins) {
  if (!ins) return 'Material';
  let t = (ins.tipo || '').toString().trim();
  const lowerDesc = (ins.descripcion || '').toLowerCase();
  const lowerClave = (ins.clave || '').toLowerCase();

  // Si ya es un tipo exacto válido
  if (t === 'Material' || t === 'Mano de Obra' || t === 'Herramienta' || t === 'Equipo' || t === 'Maquinaria' || t === 'Subcontrato') {
    // Si viene catalogado genéricamente como 'Equipo', refinar si es Herramienta o Maquinaria
    if (t === 'Equipo') {
      if (lowerDesc.includes('herramienta') || lowerClave.includes('herr') || lowerDesc.includes('seguridad') || lowerDesc.includes('menor') || lowerDesc.includes('manual')) {
        return 'Herramienta';
      }
      if (lowerDesc.includes('maquinaria') || lowerClave.includes('maq') || lowerDesc.includes('retro') || lowerDesc.includes('revolvedora') || lowerDesc.includes('camion') || lowerDesc.includes('camión') || lowerDesc.includes('tractor') || lowerDesc.includes('compactador') || lowerDesc.includes('vibro') || lowerDesc.includes('excavadora') || lowerDesc.includes('motoniveladora') || lowerDesc.includes('grua') || lowerDesc.includes('grúa')) {
        return 'Maquinaria';
      }
    }
    return t;
  }

  const lower = t.toLowerCase();
  if (lower.includes('herramienta') || lower.includes('herr') || lowerDesc.includes('herramienta') || lowerClave.includes('herr')) return 'Herramienta';
  if (lower.includes('maquinaria') || lower.includes('maq') || lowerDesc.includes('maquinaria') || lowerClave.includes('maq') || lowerDesc.includes('retro') || lowerDesc.includes('revolvedora')) return 'Maquinaria';
  if (lower.includes('equipo')) return 'Equipo';
  if (lower.includes('mano') || lower.includes('obra') || lowerDesc.includes('cuadrilla') || lowerDesc.includes('peon') || lowerDesc.includes('albañil') || lowerDesc.includes('oficial')) return 'Mano de Obra';
  if (lower.includes('subcontrat') || lowerDesc.includes('subcontrato')) return 'Subcontrato';
  if (lower.includes('indirect') || lowerDesc.includes('indirecto')) return 'Indirecto';

  return normalizeConsolidatedTipo(t);
}

/**
 * Obtener explosión completa de insumos de TODO el catálogo del proyecto activo
 * (sin depender de si tienen checkbox seleccionado o no)
 */
export function getAllBudgetInsumosExplosion() {
  const insumosMap = new Map();

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(node => {
      const isParent = Boolean(node.children && node.children.length > 0);
      if (!isParent) {
        const rawCant = round2(node.cantidad);
        const cantConcepto = (!isNaN(rawCant) && rawCant > 0) ? rawCant : 1.00;

        // Si el concepto tiene costo pero carece de insumos en matriz, generar o consultar Opus
        if (!node.insumos || node.insumos.length === 0) {
          if (parseFloat(node.precioUnitario) > 0 || parseFloat(node.costoDirecto) > 0) {
            const opusInsumos = getExactOpusInsumosForClave(node.clave);
            if (opusInsumos && opusInsumos.length > 0) {
              node.insumos = JSON.parse(JSON.stringify(opusInsumos));
            } else {
              node.insumos = generateIntegratedMatrixForConcept(node);
            }
          }
        }

        if (Array.isArray(node.insumos)) {
          node.insumos.forEach(ins => {
            const tipo = resolveInsumoTipo(ins);
            const key = getInsumoConsolidationKey({ ...ins, tipo });
            const costoUnit = round2(ins.costoUnitario || 0);
            const cantUnitaria = round5(ins.cantidad || 0);
            const cantTotal = round2(cantUnitaria * cantConcepto);
            const importe = round2(cantTotal * costoUnit);

            if (!insumosMap.has(key)) {
              insumosMap.set(key, {
                id: key,
                key: key,
                clave: ins.clave || `${tipo.substring(0, 3).toUpperCase()}-01`,
                tipo: tipo,
                descripcion: ins.descripcion || 'Sin descripción',
                unidad: ins.unidad || 'pza',
                puPresupuestado: costoUnit,
                cantidadPresupuestada: 0,
                importePresupuestado: 0,
                conceptosCount: 0
              });
            }

            const item = insumosMap.get(key);
            item.cantidadPresupuestada = round2(item.cantidadPresupuestada + cantTotal);
            item.importePresupuestado = round2(item.importePresupuestado + importe);
            item.conceptosCount++;
            if (item.puPresupuestado === 0 && costoUnit > 0) {
              item.puPresupuestado = costoUnit;
            }
          });
        }
      } else {
        walk(node.children);
      }
    });
  }

  walk(state.treeData);

  return Array.from(insumosMap.values());
}

/**
 * Comparativa Presupuestado vs. Real por Insumo (Desviación Presupuestal)
 * Cruza la explosión de insumos con los registros de compra/gasto
 */
export function getInsumosBudgetVsActualComparison() {
  const budgetInsumos = getAllBudgetInsumosExplosion();
  const records = getExpensesRecords();

  // Indexar insumos presupuestados por key y por clave normalizada
  const comparisonMap = new Map();

  budgetInsumos.forEach(ins => {
    comparisonMap.set(ins.key, {
      ...ins,
      cantidadComprada: 0,
      importeComprado: 0,
      puRealPromedio: 0,
      saldoDisponible: ins.cantidadPresupuestada,
      variacionPrecio: 0,
      desviacionImporte: 0,
      pctConsumido: 0,
      comprasCount: 0,
      isExtraordinario: false
    });
  });

  // Cruzar con registros de compras/gastos
  const unmatchedRecords = [];

  records.forEach(rec => {
    if (rec.paymentStatus === 'cancelled') return;

    let matchedItem = null;

    // 1. Coincidencia por ID/Key explícito
    if (rec.insumoId && comparisonMap.has(rec.insumoId)) {
      matchedItem = comparisonMap.get(rec.insumoId);
    }

    // 2. Coincidencia por clave de insumo
    if (!matchedItem && rec.insumoClave) {
      for (const item of comparisonMap.values()) {
        if (item.clave && item.clave.trim().toLowerCase() === rec.insumoClave.trim().toLowerCase()) {
          matchedItem = item;
          break;
        }
      }
    }

    // 3. Coincidencia por descripción normalizada
    if (!matchedItem && rec.description) {
      const cleanRecDesc = normalizeInsumoText(rec.description);
      for (const item of comparisonMap.values()) {
        if (normalizeInsumoText(item.descripcion) === cleanRecDesc) {
          matchedItem = item;
          break;
        }
      }
    }

    const qty = parseFloat(rec.quantity) || 0;
    const sub = parseFloat(rec.subtotal) || 0;

    if (matchedItem) {
      matchedItem.cantidadComprada = round2(matchedItem.cantidadComprada + qty);
      matchedItem.importeComprado = round2(matchedItem.importeComprado + sub);
      matchedItem.comprasCount++;
    } else {
      unmatchedRecords.push(rec);
    }
  });

  // Procesar cálculos derivados para insumos del presupuesto
  for (const item of comparisonMap.values()) {
    item.saldoDisponible = round2(item.cantidadPresupuestada - item.cantidadComprada);
    item.puRealPromedio = item.cantidadComprada > 0 ? round2(item.importeComprado / item.cantidadComprada) : 0;
    item.variacionPrecio = item.puRealPromedio > 0 ? round2(item.puRealPromedio - item.puPresupuestado) : 0;
    item.desviacionImporte = round2(item.importeComprado - (item.puPresupuestado * item.cantidadComprada));
    item.pctConsumido = item.cantidadPresupuestada > 0 
      ? round2((item.cantidadComprada / item.cantidadPresupuestada) * 100) 
      : 0;

    // Clasificación de alerta
    if (item.cantidadComprada > item.cantidadPresupuestada) {
      item.alertLevel = 'danger'; // Sobrepaso de cantidad
      item.alertReason = 'Exceso de volumen físico';
    } else if (item.variacionPrecio > 0 && (item.variacionPrecio / (item.puPresupuestado || 1)) > 0.05) {
      item.alertLevel = 'danger'; // Sobrecosto en P.U. > 5%
      item.alertReason = 'P.U. comprado mayor al estimado';
    } else if (item.pctConsumido >= 90) {
      item.alertLevel = 'warning'; // Casi agotado (90-100%)
      item.alertReason = 'Consumo próximo al límite';
    } else if (item.cantidadComprada > 0) {
      item.alertLevel = 'success'; // Comprado dentro de margen
      item.alertReason = 'En orden';
    } else {
      item.alertLevel = 'neutral'; // Sin compras aún
      item.alertReason = 'Sin compras';
    }
  }

  // Agrupar registros extraordinarios (no presupuestados)
  const extraItemsMap = new Map();
  unmatchedRecords.forEach(rec => {
    const key = `extra_${normalizeInsumoText(rec.description || 'extra')}_${rec.unit || 'pza'}`;
    const qty = parseFloat(rec.quantity) || 0;
    const sub = parseFloat(rec.subtotal) || 0;

    if (!extraItemsMap.has(key)) {
      let mappedTipo = 'Material';
      const recType = (rec.type || '').toLowerCase();
      if (recType === 'labor') mappedTipo = 'Mano de Obra';
      else if (recType === 'tool') mappedTipo = 'Herramienta';
      else if (recType === 'subcontract') mappedTipo = 'Subcontrato';
      else if (recType === 'equipment') {
        const lowerDesc = (rec.description || '').toLowerCase();
        if (lowerDesc.includes('herramienta') || lowerDesc.includes('herr')) mappedTipo = 'Herramienta';
        else if (lowerDesc.includes('maquinaria') || lowerDesc.includes('maq') || lowerDesc.includes('retro') || lowerDesc.includes('excavadora')) mappedTipo = 'Maquinaria';
        else mappedTipo = 'Equipo';
      } else if (recType === 'machinery') {
        mappedTipo = 'Maquinaria';
      } else if (recType === 'indirect') {
        mappedTipo = 'Indirecto';
      } else {
        mappedTipo = normalizeConsolidatedTipo(rec.category || rec.description || 'Material');
      }

      extraItemsMap.set(key, {
        id: key,
        key: key,
        clave: rec.insumoClave || 'EXTRA',
        tipo: mappedTipo,
        descripcion: rec.description || 'Gasto no presupuestado',
        unidad: rec.unit || 'pza',
        puPresupuestado: 0,
        cantidadPresupuestada: 0,
        importePresupuestado: 0,
        cantidadComprada: 0,
        importeComprado: 0,
        puRealPromedio: 0,
        saldoDisponible: 0,
        variacionPrecio: 0,
        desviacionImporte: 0,
        pctConsumido: 100,
        comprasCount: 0,
        isExtraordinario: true,
        alertLevel: 'danger',
        alertReason: 'Gasto Extraordinario no previsto'
      });
    }

    const item = extraItemsMap.get(key);
    item.cantidadComprada = round2(item.cantidadComprada + qty);
    item.importeComprado = round2(item.importeComprado + sub);
    item.saldoDisponible = round2(-item.cantidadComprada);
    item.desviacionImporte = round2(item.importeComprado);
    item.puRealPromedio = item.cantidadComprada > 0 ? round2(item.importeComprado / item.cantidadComprada) : 0;
    item.comprasCount++;
  });

  const allItems = [...comparisonMap.values(), ...extraItemsMap.values()];

  // Definición formal de los 6 rubros de insumos del proyecto
  const CATEGORIES_CONFIG = [
    { key: 'Material', label: 'Materiales de Construcción', shortLabel: 'Materiales', icon: 'fa-box', color: 'blue', border: 'border-blue-200', bg: 'bg-blue-50/60', badgeBg: 'bg-blue-100 text-blue-800' },
    { key: 'Mano de Obra', label: 'Mano de Obra / Raya y Destajos', shortLabel: 'Mano de Obra', icon: 'fa-user-group', color: 'amber', border: 'border-amber-200', bg: 'bg-amber-50/60', badgeBg: 'bg-amber-100 text-amber-800' },
    { key: 'Herramienta', label: 'Herramienta Menor y Especializada', shortLabel: 'Herramienta', icon: 'fa-screwdriver-wrench', color: 'orange', border: 'border-orange-200', bg: 'bg-orange-50/60', badgeBg: 'bg-orange-100 text-orange-800' },
    { key: 'Equipo', label: 'Equipo de Apoyo y Transporte', shortLabel: 'Equipo', icon: 'fa-truck', color: 'purple', border: 'border-purple-200', bg: 'bg-purple-50/60', badgeBg: 'bg-purple-100 text-purple-800' },
    { key: 'Maquinaria', label: 'Maquinaria Pesada y Renta', shortLabel: 'Maquinaria', icon: 'fa-tractor', color: 'rose', border: 'border-rose-200', bg: 'bg-rose-50/60', badgeBg: 'bg-rose-100 text-rose-800' },
    { key: 'Subcontrato', label: 'Subcontratos de Obra', shortLabel: 'Subcontratos', icon: 'fa-handshake', color: 'emerald', border: 'border-emerald-200', bg: 'bg-emerald-50/60', badgeBg: 'bg-emerald-100 text-emerald-800' }
  ];

  const categoryMap = new Map();
  CATEGORIES_CONFIG.forEach(cat => {
    categoryMap.set(cat.key, {
      ...cat,
      items: [],
      totalPresupuestado: 0,
      totalComprado: 0,
      saldoDisponible: 0,
      alertasCount: 0,
      conComprasCount: 0
    });
  });

  let indirectCategory = null;

  allItems.forEach(item => {
    const normalizedTipo = resolveInsumoTipo(item);
    let catObj = categoryMap.get(normalizedTipo);

    if (!catObj) {
      if (item.tipo === 'Indirecto' || normalizedTipo === 'Indirecto') {
        if (!indirectCategory) {
          indirectCategory = {
            key: 'Indirecto',
            label: 'Gastos Indirectos y Varios',
            shortLabel: 'Indirectos',
            icon: 'fa-file-lines',
            color: 'slate',
            border: 'border-slate-200',
            bg: 'bg-slate-50/60',
            badgeBg: 'bg-slate-100 text-slate-800',
            items: [],
            totalPresupuestado: 0,
            totalComprado: 0,
            saldoDisponible: 0,
            alertasCount: 0,
            conComprasCount: 0
          };
        }
        catObj = indirectCategory;
      } else {
        catObj = categoryMap.get('Material');
      }
    }

    catObj.items.push(item);
    catObj.totalPresupuestado = round2(catObj.totalPresupuestado + (item.importePresupuestado || 0));
    catObj.totalComprado = round2(catObj.totalComprado + (item.importeComprado || 0));
    catObj.saldoDisponible = round2(catObj.totalPresupuestado - catObj.totalComprado);
    if (item.alertLevel === 'danger' || item.alertLevel === 'warning') {
      catObj.alertasCount++;
    }
    if (item.cantidadComprada > 0) {
      catObj.conComprasCount++;
    }
  });

  const categoriesResult = Array.from(categoryMap.values());
  if (indirectCategory && indirectCategory.items.length > 0) {
    categoriesResult.push(indirectCategory);
  }

  // Resumen de la comparativa
  const resumen = {
    totalInsumos: allItems.length,
    conCompras: allItems.filter(i => i.cantidadComprada > 0).length,
    conAlertaSobrepaso: allItems.filter(i => i.alertLevel === 'danger').length,
    conAlertaLimite: allItems.filter(i => i.alertLevel === 'warning').length,
    totalPresupuestadoInsumos: round2(budgetInsumos.reduce((acc, i) => acc + (i.importePresupuestado || 0), 0)),
    totalCompradoInsumos: round2(allItems.reduce((acc, i) => acc + (i.importeComprado || 0), 0))
  };

  return {
    items: allItems,
    categories: categoriesResult,
    resumen: resumen
  };
}
