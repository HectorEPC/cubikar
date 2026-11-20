// js/modules/almacen/almacenModel.js
// Modelo de datos y lógica física para el módulo opcional de ALMACÉN DE OBRA (Aislado de costos/precios para el Bodeguero)

import { state } from '../../state/store.js?v=20261119_cf40';
import { getActiveProjectId } from '../../config/constants.js?v=20261119_cf40';
import { round2, round5 } from '../../core/formatters.js?v=20261119_cf40';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js?v=20261119_cf40';
import { getExactOpusInsumosForClave } from '../io/casaLauraData.js?v=20261119_cf40';
import { normalizeInsumoText, normalizeConsolidatedTipo, getInsumoConsolidationKey } from '../insumosGenerales/insumosConsolidator.js?v=20261119_cf40';
import { getExpensesRecords, getSupplierById } from '../compras/expensesModel.js?v=20261119_cf40';
import { scheduleAlmacenCloudSync, stripInlineBinaryPayloads } from '../../core/cloudModulesSyncService.js?v=20261119_cf40';

const STORAGE_KEY_PREFIX = 'adm_const_almacen_';

export function getAlmacenStorageKey(projectId = null) {
  const pId = projectId || getActiveProjectId() || 'default';
  return `${STORAGE_KEY_PREFIX}${pId}`;
}

export function getDefaultAlmacenSignatures() {
  return [
    { rol: 'ALMACENISTA / BODEGA', nombre: '', cargo: 'Entregó / Recibió' },
    { rol: 'RESIDENCIA DE OBRA', nombre: '', cargo: 'Autorizó' },
    { rol: 'FRENTE / CUADRILLA', nombre: '', cargo: 'Recibió en Obra' }
  ];
}

export function getDefaultAlmacenData() {
  return {
    config: {
      signatures: getDefaultAlmacenSignatures()
    },
    receptions: [], // Confirmaciones físicas vinculadas a expenseId con destination === 'warehouse'
    movements: []   // Vales de salida, devoluciones, préstamos de herramienta, traspasos y ajustes
  };
}

export function loadAlmacenData(projectId = null) {
  const defaults = getDefaultAlmacenData();
  try {
    const raw = localStorage.getItem(getAlmacenStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        config: Object.assign({}, defaults.config, parsed?.config || {}),
        receptions: Array.isArray(parsed?.receptions) ? parsed.receptions : [],
        movements: Array.isArray(parsed?.movements) ? parsed.movements : [],
        updatedAt: parsed?.updatedAt || ''
      };
    }
  } catch (err) {
    console.warn('[AlmacenModel] Error leyendo datos de almacén:', err);
  }
  return defaults;
}

export function saveAlmacenData(data, projectId = null) {
  try {
    const cleanReceptions = (Array.isArray(data?.receptions) ? data.receptions : []).map(r => {
      if (!r?.evidence) return r;
      return { ...r, evidence: stripInlineBinaryPayloads(r.evidence) };
    });
    const cleanMovements = (Array.isArray(data?.movements) ? data.movements : []).map(m => {
      if (!m?.evidence) return m;
      return { ...m, evidence: stripInlineBinaryPayloads(m.evidence) };
    });
    const clean = {
      config: data?.config || getDefaultAlmacenData().config,
      receptions: cleanReceptions,
      movements: cleanMovements,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(getAlmacenStorageKey(projectId), JSON.stringify(clean));
    scheduleAlmacenCloudSync(projectId);
    return clean;
  } catch (err) {
    console.error('[AlmacenModel] Error guardando datos de almacén:', err);
    return data;
  }
}

export function getAlmacenSignatures() {
  const data = loadAlmacenData();
  if (Array.isArray(data?.config?.signatures) && data.config.signatures.length > 0) {
    return data.config.signatures;
  }
  return getDefaultAlmacenSignatures();
}

export function saveAlmacenSignatures(signatures) {
  const cleanSignatures = (Array.isArray(signatures) && signatures.length > 0)
    ? signatures.map(s => ({
        rol: (s.rol || '').trim().toUpperCase() || 'FIRMA',
        nombre: (s.nombre || '').trim(),
        cargo: (s.cargo || '').trim()
      }))
    : getDefaultAlmacenSignatures();

  const data = loadAlmacenData();
  data.config = Object.assign({}, data.config || {}, { signatures: cleanSignatures });
  saveAlmacenData(data);
  return cleanSignatures;
}

const CANONICAL_INSUMO_KEY_RE = /^(Material|Mano de Obra|Herramienta|Equipo|Maquinaria|Subcontrato)_(cve|desc)_/i;

function mapExpenseOrRawTipo(rawTipo) {
  const lower = String(rawTipo || '').trim().toLowerCase();
  if (lower === 'equipment' || lower === 'machinery') return 'Equipo';
  if (lower === 'tool' || lower === 'tools') return 'Herramienta';
  if (lower === 'labor') return 'Mano de Obra';
  if (lower === 'subcontract') return 'Subcontrato';
  if (lower === 'material') return 'Material';
  return normalizeConsolidatedTipo(rawTipo || 'Material');
}

export function resolveWarehouseInsumoKey(item) {
  if (!item) return '';
  if (item.insumoKey && CANONICAL_INSUMO_KEY_RE.test(String(item.insumoKey))) {
    return String(item.insumoKey);
  }
  if (item.insumoId && CANONICAL_INSUMO_KEY_RE.test(String(item.insumoId))) {
    return String(item.insumoId);
  }
  const clave = String(item.insumoClave || item.clave || '').trim();
  const desc = String(item.description || item.descripcion || '').trim();
  if (clave || desc) {
    const tipo = mapExpenseOrRawTipo(item.tipo || item.type || 'Material');
    return getInsumoConsolidationKey({
      tipo,
      clave,
      descripcion: desc,
      unidad: item.unit || item.unidad || 'pza'
    });
  }
  if (item.insumoKey) return String(item.insumoKey);
  if (item.insumoId && item.insumoId !== 'EXTRA' && !String(item.insumoId).startsWith('extra_')) {
    return String(item.insumoId);
  }
  return '';
}

/**
 * Proyección estrictamente FÍSICA (sin montos, precios unitarios, facturas ni impuestos)
 * de todas las compras cuyo destino es 'warehouse'.
 */
export function getWarehouseReceptionsView() {
  const records = getExpensesRecords().filter(r => r && r.destination === 'warehouse' && r.paymentStatus !== 'cancelled');
  const almacen = loadAlmacenData();
  const receptionMap = new Map();
  (almacen.receptions || []).forEach(rec => {
    if (rec && rec.expenseId) receptionMap.set(rec.expenseId, rec);
  });

  return records.map(r => {
    const sup = r.supplierId ? getSupplierById(r.supplierId) : null;
    const supName = sup ? sup.name : (r.supplierName || 'Proveedor');
    const saved = receptionMap.get(r.id);
    const expectedQty = round2(parseFloat(r.quantity) || 0);
    const receivedQty = round2(Math.max(0, parseFloat(saved?.receivedQty) || 0));
    const pendingQty = round2(Math.max(0, expectedQty - receivedQty));
    const status = receivedQty >= expectedQty && expectedQty > 0
      ? 'complete'
      : receivedQty > 0
      ? 'partial'
      : 'pending';

    return {
      expenseId: r.id,
      orderGroupId: r.orderGroupId || '',
      date: r.date || '',
      supplierName: supName,
      insumoId: r.insumoId || '',
      insumoKey: resolveWarehouseInsumoKey(r),
      insumoClave: r.insumoClave || '',
      description: r.description || 'Material sin descripción',
      unit: r.unit || 'pza',
      tipo: r.type || 'material',
      expectedQty,
      receivedQty,
      pendingQty,
      status,
      remisionNumber: saved?.remisionNumber || '',
      receivedDate: saved?.receivedDate || '',
      receivedBy: saved?.receivedBy || '',
      notes: saved?.notes || r.notes || '',
      evidence: saved?.evidence || null,
      receiptHistory: Array.isArray(saved?.receiptHistory) ? saved.receiptHistory : [],
      conceptId: r.conceptId || '',
      conceptClave: r.conceptClave || '',
      conceptDesc: r.conceptDesc || ''
    };
  });
}

/**
 * Confirmar recepción física total o parcial de una compra enviada a Almacén
 */
export function confirmWarehouseReception(expenseId, qtyReceivedNow, meta = {}) {
  const records = getExpensesRecords();
  const targetOrder = records.find(r => r.id === expenseId && r.destination === 'warehouse' && r.paymentStatus !== 'cancelled');
  if (!targetOrder) {
    throw new Error('No se encontró la orden enviada a almacén.');
  }

  const addQty = round2(Math.max(0, parseFloat(qtyReceivedNow) || 0));
  if (addQty <= 0) {
    throw new Error('Ingresa una cantidad recibida mayor a 0.');
  }

  const data = loadAlmacenData();
  let rec = data.receptions.find(x => x.expenseId === expenseId);
  const expectedQty = round2(parseFloat(targetOrder.quantity) || 0);
  const prevReceived = round2(parseFloat(rec?.receivedQty) || 0);
  const nextReceived = round2(prevReceived + addQty);

  const histEntry = {
    date: meta.receivedDate || new Date().toISOString().slice(0, 10),
    qty: addQty,
    remisionNumber: String(meta.remisionNumber || '').trim(),
    receivedBy: String(meta.receivedBy || '').trim(),
    notes: String(meta.notes || '').trim(),
    createdAt: new Date().toISOString()
  };

  if (!rec) {
    rec = {
      id: `rec_${expenseId}`,
      expenseId,
      insumoId: targetOrder.insumoId || '',
      insumoKey: resolveWarehouseInsumoKey(targetOrder),
      insumoClave: targetOrder.insumoClave || '',
      description: targetOrder.description || '',
      unit: targetOrder.unit || 'pza',
      receivedQty: nextReceived,
      status: nextReceived >= expectedQty ? 'complete' : 'partial',
      receivedDate: histEntry.date,
      remisionNumber: histEntry.remisionNumber,
      receivedBy: histEntry.receivedBy,
      notes: histEntry.notes,
      evidence: meta.evidence || null,
      receiptHistory: [histEntry],
      updatedAt: new Date().toISOString()
    };
    data.receptions.unshift(rec);
  } else {
    rec.receivedQty = nextReceived;
    rec.status = nextReceived >= expectedQty ? 'complete' : 'partial';
    rec.receivedDate = histEntry.date;
    if (histEntry.remisionNumber) rec.remisionNumber = histEntry.remisionNumber;
    if (histEntry.receivedBy) rec.receivedBy = histEntry.receivedBy;
    if (histEntry.notes) rec.notes = histEntry.notes;
    if (meta.evidence) rec.evidence = meta.evidence;
    rec.receiptHistory = Array.isArray(rec.receiptHistory) ? [...rec.receiptHistory, histEntry] : [histEntry];
    rec.updatedAt = new Date().toISOString();
  }

  saveAlmacenData(data);
  return rec;
}

export function getWarehouseMovements() {
  const data = loadAlmacenData();
  return data.movements || [];
}

function generateNextWarehouseFolio(kind = 'exit', movements = []) {
  const year = new Date().getFullYear();
  const prefix = kind === 'tool_loan'
    ? `HER-${year}-`
    : kind === 'transfer_out' || kind === 'adjustment' || kind === 'return'
    ? `MOV-${year}-`
    : `VAL-${year}-`;

  let maxSeq = 0;
  movements.forEach(m => {
    const f = String(m.folio || m.id || '');
    if (f.startsWith(prefix)) {
      const n = parseInt(f.replace(prefix, ''), 10);
      if (!isNaN(n) && n > maxSeq) maxSeq = n;
    }
  });
  return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
}

/**
 * Resumen físico de inventario actual en Bodega (SIN precios ni dinero)
 */
export function getWarehouseStockSummary() {
  const receptions = getWarehouseReceptionsView();
  const movements = getWarehouseMovements();
  const stockMap = new Map();

  const ensureEntry = (raw) => {
    const key = resolveWarehouseInsumoKey(raw);
    if (!key) return null;
    if (!stockMap.has(key)) {
      stockMap.set(key, {
        insumoKey: key,
        insumoId: raw.insumoId || key,
        insumoClave: raw.insumoClave || raw.clave || '',
        description: raw.description || raw.descripcion || 'Material sin descripción',
        unit: raw.unit || raw.unidad || 'pza',
        tipo: raw.tipo || 'Material',
        orderedToWarehouseQty: 0,
        pendingArrivalQty: 0,
        totalEnteredQty: 0,
        totalExitedQty: 0,
        totalReturnedFromSiteQty: 0,
        totalTransferredOutQty: 0,
        totalAdjustedQty: 0,
        availableStock: 0,
        lastMoveDate: ''
      });
    }
    return stockMap.get(key);
  };

  receptions.forEach(r => {
    const entry = ensureEntry(r);
    if (!entry) return;
    entry.orderedToWarehouseQty = round2(entry.orderedToWarehouseQty + r.expectedQty);
    entry.pendingArrivalQty = round2(entry.pendingArrivalQty + r.pendingQty);
    entry.totalEnteredQty = round2(entry.totalEnteredQty + r.receivedQty);
    if (r.receivedDate && (!entry.lastMoveDate || r.receivedDate > entry.lastMoveDate)) {
      entry.lastMoveDate = r.receivedDate;
    }
  });

  movements.forEach(m => {
    if (!m || m.status === 'cancelled') return;
    const items = Array.isArray(m.items) ? m.items : [];
    items.forEach(item => {
      const entry = ensureEntry(item);
      if (!entry) return;
      const qty = round2(Math.max(0, parseFloat(item.qty) || 0));
      if (m.kind === 'exit') {
        entry.totalExitedQty = round2(entry.totalExitedQty + qty);
      } else if (m.kind === 'return') {
        entry.totalReturnedFromSiteQty = round2(entry.totalReturnedFromSiteQty + qty);
      } else if (m.kind === 'transfer_out') {
        entry.totalTransferredOutQty = round2(entry.totalTransferredOutQty + qty);
      } else if (m.kind === 'adjustment') {
        const signedQty = round2(parseFloat(item.qty) || 0);
        entry.totalAdjustedQty = round2(entry.totalAdjustedQty + signedQty);
      } else if (m.kind === 'tool_loan' && m.toolStatus !== 'returned') {
        entry.totalExitedQty = round2(entry.totalExitedQty + qty);
      }
      if (m.date && (!entry.lastMoveDate || m.date > entry.lastMoveDate)) {
        entry.lastMoveDate = m.date;
      }
    });
  });

  for (const entry of stockMap.values()) {
    entry.availableStock = round2(
      entry.totalEnteredQty +
      entry.totalReturnedFromSiteQty +
      entry.totalAdjustedQty -
      entry.totalExitedQty -
      entry.totalTransferredOutQty
    );
  }

  const activeToolLoans = movements.filter(m => m.kind === 'tool_loan' && m.status !== 'cancelled' && m.toolStatus !== 'returned');
  const returnedToolLoans = movements.filter(m => m.kind === 'tool_loan' && m.status !== 'cancelled' && m.toolStatus === 'returned');

  return {
    items: Array.from(stockMap.values()),
    receptions,
    pendingReceptionsCount: receptions.filter(r => r.pendingQty > 0).length,
    activeToolLoans,
    returnedToolLoans
  };
}

/**
 * Mapa resumido para cruzar con Presupuesto Base vs. Real sin circularidad
 */
export function getWarehouseNetConsumptionMap() {
  const stockSummary = getWarehouseStockSummary();
  const byKey = new Map();
  const byClave = new Map();
  const byDesc = new Map();

  stockSummary.items.forEach(item => {
    const netExited = round2(Math.max(0, item.totalExitedQty - item.totalReturnedFromSiteQty));
    const payload = {
      insumoKey: item.insumoKey,
      orderedToWarehouseQty: item.orderedToWarehouseQty,
      confirmedReceivedQty: item.totalEnteredQty,
      netExitedToSiteQty: netExited,
      transferredOutQty: item.totalTransferredOutQty,
      stockEnBodega: Math.max(0, item.availableStock)
    };
    byKey.set(item.insumoKey, payload);
    if (item.insumoClave) byClave.set(item.insumoClave.trim().toLowerCase(), payload);
    if (item.description) byDesc.set(normalizeInsumoText(item.description), payload);
  });

  return { byKey, byClave, byDesc, rawItems: stockSummary.items };
}

/**
 * Crear Vale de Salida, Devolución, Préstamo de Herramienta, Traspaso o Ajuste
 */
export function createWarehouseMovement(payload) {
  const kind = payload?.kind || 'exit';
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const validItems = rawItems
    .map(it => ({
      insumoId: it.insumoId || '',
      insumoKey: resolveWarehouseInsumoKey(it),
      insumoClave: String(it.insumoClave || '').trim(),
      description: String(it.description || '').trim(),
      unit: String(it.unit || 'pza').trim(),
      tipo: String(it.tipo || 'Material').trim(),
      qty: kind === 'adjustment' ? round2(parseFloat(it.qty) || 0) : round2(Math.max(0, parseFloat(it.qty) || 0))
    }))
    .filter(it => it.description && (kind === 'adjustment' ? it.qty !== 0 : it.qty > 0));

  if (validItems.length === 0) {
    throw new Error('Agrega al menos un material/insumo con cantidad válida.');
  }

  // Validar existencia suficiente para salidas y traspasos (si no es ajuste/devolución ni override explícito)
  if ((kind === 'exit' || kind === 'transfer_out') && !payload.allowNegativeStock) {
    const stockSummary = getWarehouseStockSummary();
    const stockByKey = new Map(stockSummary.items.map(s => [s.insumoKey, s]));
    for (const item of validItems) {
      const current = stockByKey.get(item.insumoKey);
      const disp = current ? current.availableStock : 0;
      if (item.qty > disp + 0.001) {
        throw new Error(`Stock insuficiente en bodega para "${item.description}". Disponible: ${disp} ${item.unit}, solicitado: ${item.qty} ${item.unit}.`);
      }
    }
  }

  const data = loadAlmacenData();
  const folio = payload.folio || generateNextWarehouseFolio(kind, data.movements);
  const newMov = {
    id: `alm_mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    folio,
    kind,
    date: payload.date || new Date().toISOString().slice(0, 10),
    conceptId: payload.conceptId || '',
    conceptClave: payload.conceptClave || '',
    conceptDesc: payload.conceptDesc || '',
    conceptQty: round2(parseFloat(payload.conceptQty) || 0),
    conceptUnit: payload.conceptUnit || '',
    frontName: String(payload.frontName || '').trim(),
    recipientName: String(payload.recipientName || '').trim(),
    authorizedBy: String(payload.authorizedBy || '').trim(),
    targetProjectName: String(payload.targetProjectName || '').trim(),
    toolStatus: kind === 'tool_loan' ? 'loaned' : '',
    toolReturnedAt: '',
    items: validItems,
    notes: String(payload.notes || '').trim(),
    evidence: payload.evidence || null,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  data.movements.unshift(newMov);
  saveAlmacenData(data);
  return newMov;
}

export function markToolLoanReturned(movementId, returnMeta = {}) {
  const data = loadAlmacenData();
  const mov = data.movements.find(m => m.id === movementId && m.kind === 'tool_loan');
  if (!mov) return null;
  mov.toolStatus = 'returned';
  mov.toolReturnedAt = returnMeta.returnedDate || new Date().toISOString().slice(0, 10);
  mov.returnNotes = String(returnMeta.notes || '').trim();
  mov.updatedAt = new Date().toISOString();
  saveAlmacenData(data);
  return mov;
}

export function cancelWarehouseMovement(movementId) {
  const data = loadAlmacenData();
  const mov = data.movements.find(m => m.id === movementId);
  if (!mov) return false;
  const reactivating = mov.status === 'cancelled';
  if (reactivating && (mov.kind === 'exit' || mov.kind === 'transfer_out') && !mov.allowNegativeStock) {
    const stockSummary = getWarehouseStockSummary();
    const stockByKey = new Map(stockSummary.items.map(s => [s.insumoKey, s]));
    for (const item of (mov.items || [])) {
      const current = stockByKey.get(item.insumoKey);
      const disp = current ? current.availableStock : 0;
      const qty = parseFloat(item.qty) || 0;
      if (qty > disp + 0.001) {
        throw new Error(`Stock insuficiente para reactivar "${item.description}". Disponible: ${disp} ${item.unit}, requerido: ${qty} ${item.unit}.`);
      }
    }
  }
  mov.status = reactivating ? 'active' : 'cancelled';
  mov.updatedAt = new Date().toISOString();
  saveAlmacenData(data);
  return true;
}

export function deleteWarehouseMovement(movementId) {
  const data = loadAlmacenData();
  data.movements = data.movements.filter(m => m.id !== movementId);
  saveAlmacenData(data);
  return true;
}

/**
 * Catálogo de conceptos ESTRICTAMENTE SIN PRECIOS ni montos financieros para Vales de Salida del Bodeguero
 */
export function getConceptCatalogForWarehouse() {
  const movements = getWarehouseMovements().filter(m => m.status !== 'cancelled' && m.kind === 'exit' && m.conceptId);
  const directExpenses = getExpensesRecords().filter(r => r.paymentStatus !== 'cancelled' && r.destination !== 'warehouse' && r.conceptMoveType !== 'replacement' && (r.conceptId || (Array.isArray(r.conceptLinks) && r.conceptLinks.length > 0)));

  const deliveredByConcept = new Map();
  movements.forEach(m => {
    const qty = parseFloat(m.conceptQty) || 0;
    if (qty > 0) {
      deliveredByConcept.set(m.conceptId, round2((deliveredByConcept.get(m.conceptId) || 0) + qty));
    }
  });
  const countedBatchTokens = new Set();
  directExpenses.forEach(r => {
    const links = Array.isArray(r.conceptLinks) && r.conceptLinks.length > 0
      ? r.conceptLinks
      : (r.conceptId ? [{ conceptId: r.conceptId, qtyCovered: r.conceptCoverageQty || 0, moveType: r.conceptMoveType || 'advance' }] : []);
    const batchBase = r.conceptExplosionBatchId || r.orderGroupId || r.id;
    links.forEach(lk => {
      if (!lk.conceptId || lk.moveType === 'replacement') return;
      const token = `${batchBase}::${lk.conceptId}`;
      if (countedBatchTokens.has(token)) return;
      countedBatchTokens.add(token);
      const qty = parseFloat(lk.qtyCovered) || 0;
      if (qty > 0) {
        deliveredByConcept.set(lk.conceptId, round2((deliveredByConcept.get(lk.conceptId) || 0) + qty));
      }
    });
  });

  const concepts = [];

  function walk(nodes, parentPath = []) {
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

        const cQty = round2(Math.max(0, Number(node.cantidad) || 0));
        const usedQty = deliveredByConcept.get(node.id) || 0;
        const safeInsumos = (Array.isArray(node.insumos) ? node.insumos : []).map(ins => ({
          insumoKey: getInsumoConsolidationKey({ ...ins, tipo: normalizeConsolidatedTipo(ins.tipo) }),
          clave: ins.clave || '',
          tipo: normalizeConsolidatedTipo(ins.tipo),
          descripcion: ins.descripcion || 'Sin descripción',
          unidad: ins.unidad || 'pza',
          cantidadUnitaria: round5(ins.cantidad || 0)
        }));

        concepts.push({
          id: node.id,
          clave: node.clave || '',
          descripcion: node.descripcion || '',
          unidad: node.unidad || 'ud',
          partida: parentPath[0] || 'General',
          cantidadPresupuestada: cQty,
          cantidadSurtida: usedQty,
          cantidadDisponible: round2(Math.max(0, cQty - usedQty)),
          insumos: safeInsumos
        });
      } else {
        walk(node.children, [...parentPath, node.descripcion || 'Partida']);
      }
    });
  }

  walk(state.treeData);
  return concepts;
}
