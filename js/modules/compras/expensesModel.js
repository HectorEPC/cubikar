// js/modules/compras/expensesModel.js
// Modelo de datos y persistencia para CONTROL DE GASTOS, COMPRAS Y ERP FINANCIERO
// Cumple con la especificación técnica de expensesControl (Opción B)

import { getActiveProjectId } from '../../config/constants.js?v=20261119_cf41';
import { scheduleExpensesCloudSync, stripInlineBinaryPayloads } from '../../core/cloudModulesSyncService.js?v=20261119_cf41';

const STORAGE_KEY_PREFIX = 'expenses_control_';

export function getExpensesStorageKey(projectId = null) {
  const pId = projectId || getActiveProjectId() || 'default';
  return `${STORAGE_KEY_PREFIX}${pId}`;
}

export function getDefaultExpensesSignatures() {
  return [
    { rol: 'CONTROL DE COSTOS / COMPRAS', nombre: '', cargo: 'Elaboró' },
    { rol: 'RESIDENCIA DE OBRA', nombre: '', cargo: 'Revisó' },
    { rol: 'DIRECCIÓN GENERAL / SUPERVISIÓN', nombre: '', cargo: 'Autorizó' }
  ];
}

const SAMPLE_EXPENSES_PROJECT_PREFIXES = ['proj-default', 'proj-demo', 'proj-opus-casa-laura'];

function isSampleExpensesProjectId(projectId = null) {
  const pid = String(projectId || getActiveProjectId() || '').trim().toLowerCase();
  if (!pid || pid === 'default') return true;
  return SAMPLE_EXPENSES_PROJECT_PREFIXES.some(prefix => pid.startsWith(prefix));
}

export function getDefaultExpensesData(projectId = null) {
  const includeSampleSuppliers = isSampleExpensesProjectId(projectId);
  return {
    config: {
      currency: 'MXN',
      alertThresholdPercent: 10,
      signatures: getDefaultExpensesSignatures(),
      unitFactors: {}
    },
    suppliers: includeSampleSuppliers ? [
      {
        id: 'prov-001',
        name: 'Materiales Construrama del Norte',
        rfc: 'MCN800101XYZ',
        phone: '8181234567',
        email: 'ventas@construrama.com',
        contactPerson: 'Ing. Roberto Garza',
        address: 'Av. Industrial 123, Parque Industrial'
      },
      {
        id: 'prov-002',
        name: 'Aceros y Perfiles de México S.A.',
        rfc: 'APM850312AB1',
        phone: '8189876543',
        email: 'pedidos@acerosmexico.com',
        contactPerson: 'Lic. Claudia Salinas',
        address: 'Calzada del Valle 450'
      },
      {
        id: 'prov-003',
        name: 'Cuadrilla Maestro Don Lupe (Destajos)',
        rfc: 'LUPE750404H10',
        phone: '8114567890',
        email: 'donlupe.albañileria@gmail.com',
        contactPerson: 'J. Guadalupe Rodríguez',
        address: 'Col. Obrera, Monterrey'
      }
    ] : [],
    records: []
  };
}

/**
 * Cargar estado de Control de Gastos y Compras desde localStorage
 */
export function loadExpensesData(projectId = null) {
  const defaults = getDefaultExpensesData(projectId);
  try {
    const raw = localStorage.getItem(getExpensesStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        config: Object.assign({}, defaults.config, parsed?.config || {}),
        suppliers: Array.isArray(parsed?.suppliers) ? parsed.suppliers : defaults.suppliers,
        records: Array.isArray(parsed?.records) ? parsed.records : []
      };
    }
  } catch (err) {
    console.warn('[ExpensesModel] Error al leer datos de gastos:', err);
  }
  return defaults;
}

/**
 * Guardar estado de Control de Gastos y Compras en localStorage
 */
export function saveExpensesData(data, projectId = null) {
  try {
    const cleanRecords = (Array.isArray(data?.records) ? data.records : []).map((rec) => {
      if (!rec?.evidence) return rec;
      return { ...rec, evidence: stripInlineBinaryPayloads(rec.evidence) };
    });
    const clean = {
      config: data?.config || getDefaultExpensesData().config,
      suppliers: Array.isArray(data?.suppliers) ? data.suppliers : [],
      records: cleanRecords,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(getExpensesStorageKey(projectId), JSON.stringify(clean));
    scheduleExpensesCloudSync(projectId);
    return clean;
  } catch (err) {
    console.error('[ExpensesModel] Error al guardar datos de gastos:', err);
    return data;
  }
}

/**
 * Obtener configuración actual
 */
export function getExpensesConfig() {
  const data = loadExpensesData();
  return data.config;
}

/**
 * Actualizar configuración
 */
export function updateExpensesConfig(newConfig) {
  const data = loadExpensesData();
  data.config = Object.assign({}, data.config, newConfig);
  saveExpensesData(data);
  return data.config;
}

/**
 * Obtener firmas oficiales configuradas para Compras y Pagos
 */
export function getExpensesSignatures() {
  const config = getExpensesConfig();
  if (Array.isArray(config?.signatures) && config.signatures.length > 0) {
    return config.signatures;
  }
  return getDefaultExpensesSignatures();
}

/**
 * Guardar firmas oficiales de Compras y Pagos
 */
export function saveExpensesSignatures(signatures) {
  const cleanSignatures = (Array.isArray(signatures) && signatures.length > 0)
    ? signatures.map(s => ({
        rol: (s.rol || '').trim().toUpperCase() || 'FIRMA',
        nombre: (s.nombre || '').trim(),
        cargo: (s.cargo || '').trim()
      }))
    : getDefaultExpensesSignatures();

  updateExpensesConfig({ signatures: cleanSignatures });
  return cleanSignatures;
}

/**
 * Obtener lista de proveedores
 */
export function getExpensesSuppliers() {
  const data = loadExpensesData();
  return data.suppliers || [];
}

/**
 * Obtener proveedor por ID
 */
export function getSupplierById(supplierId) {
  const suppliers = getExpensesSuppliers();
  return suppliers.find(s => s.id === supplierId) || null;
}

/**
 * Guardar o actualizar proveedor
 */
export function saveSupplier(supplierData) {
  const data = loadExpensesData();
  if (!supplierData.id) {
    supplierData.id = generateNextSupplierId(data.suppliers);
  }
  const idx = data.suppliers.findIndex(s => s.id === supplierData.id);
  if (idx >= 0) {
    data.suppliers[idx] = Object.assign({}, data.suppliers[idx], supplierData);
  } else {
    data.suppliers.push(supplierData);
  }
  saveExpensesData(data);
  return supplierData;
}

/**
 * Eliminar proveedor
 */
export function deleteSupplier(supplierId) {
  const data = loadExpensesData();
  data.suppliers = data.suppliers.filter(s => s.id !== supplierId);
  saveExpensesData(data);
  return true;
}

/**
 * Obtener todos los registros de egresos / compras
 */
export function getExpensesRecords() {
  const data = loadExpensesData();
  return data.records || [];
}

/**
 * Obtener registro por ID
 */
export function getExpenseRecordById(recordId) {
  const records = getExpensesRecords();
  return records.find(r => r.id === recordId) || null;
}

function normalizeExpenseRecordPayload(recordData, existingRecords = []) {
  const rec = { ...recordData };
  if (!rec.id) {
    rec.id = generateNextExpenseId(existingRecords);
  }

  rec.destination = rec.destination === 'warehouse' ? 'warehouse' : 'direct';
  rec.quantity = Math.max(0, parseFloat(rec.quantity) || 0);
  rec.unitPrice = Math.max(0, parseFloat(rec.unitPrice) || 0);
  rec.subtotal = Math.round(((rec.quantity * rec.unitPrice) + Number.EPSILON) * 100) / 100;

  if (rec.tax === undefined || rec.tax === null) {
    rec.tax = Math.round(((rec.subtotal * 0.16) + Number.EPSILON) * 100) / 100;
  } else {
    rec.tax = Math.max(0, parseFloat(rec.tax) || 0);
  }

  rec.total = Math.round(((rec.subtotal + rec.tax) + Number.EPSILON) * 100) / 100;

  if (rec.paymentStatus === 'paid') {
    rec.amountPaid = rec.total;
  } else if (rec.paymentStatus === 'cancelled') {
    rec.amountPaid = 0;
  } else {
    rec.amountPaid = Math.min(rec.total, Math.max(0, parseFloat(rec.amountPaid) || 0));
  }

  if (rec.conceptCoverageQty !== undefined && rec.conceptCoverageQty !== null) {
    rec.conceptCoverageQty = Math.max(0, parseFloat(rec.conceptCoverageQty) || 0);
  }
  rec.updatedAt = new Date().toISOString();
  return rec;
}

/**
 * Guardar o actualizar registro de compra / gasto
 */
export function saveExpenseRecord(recordData) {
  const data = loadExpensesData();
  const normalized = normalizeExpenseRecordPayload(recordData, data.records);

  const idx = data.records.findIndex(r => r.id === normalized.id);
  if (idx >= 0) {
    data.records[idx] = Object.assign({}, data.records[idx], normalized);
  } else {
    data.records.unshift(normalized); // Insertar al inicio para mostrar el más reciente
  }

  saveExpensesData(data);
  return normalized;
}

/**
 * Guardar múltiples partidas de una Orden de Compra agrupada (ej. explosión de concepto)
 */
export function saveExpenseRecordsBatch(recordsArray = [], options = {}) {
  if (!Array.isArray(recordsArray) || recordsArray.length === 0) return [];
  const data = loadExpensesData();
  const sharedGroupId = options.orderGroupId || (recordsArray.length > 1 ? generateNextOrderGroupId(data.records) : '');
  const savedList = [];

  // Iterar en reversa para mantener el orden visual al insertar al principio
  for (let i = recordsArray.length - 1; i >= 0; i--) {
    const raw = recordsArray[i];
    const withGroup = sharedGroupId && !raw.orderGroupId
      ? { ...raw, orderGroupId: sharedGroupId }
      : { ...raw };
    const workingRecords = [...data.records, ...savedList];
    const normalized = normalizeExpenseRecordPayload(withGroup, workingRecords);

    const idx = data.records.findIndex(r => r.id === normalized.id);
    if (idx >= 0) {
      data.records[idx] = Object.assign({}, data.records[idx], normalized);
    } else {
      data.records.unshift(normalized);
    }
    savedList.unshift(normalized);
  }

  saveExpensesData(data);
  return savedList;
}

/**
 * Obtener todas las partidas pertenecientes a un mismo folio de Orden de Compra agrupada
 */
export function getExpenseRecordsByOrderGroup(orderGroupId) {
  if (!orderGroupId) return [];
  return getExpensesRecords().filter(r => r.orderGroupId === orderGroupId);
}

/**
 * Verificar si existe otra compra con el mismo UUID fiscal CFDI
 */
export function findDuplicateCfdiUuid(cfdiUuid, excludeRecordId = null) {
  const cleanUuid = String(cfdiUuid || '').trim().toUpperCase();
  if (!cleanUuid) return null;
  return getExpensesRecords().find(r =>
    r.id !== excludeRecordId &&
    r.paymentStatus !== 'cancelled' &&
    String(r.cfdiUuid || '').trim().toUpperCase() === cleanUuid
  ) || null;
}

/**
 * Obtener o guardar factor de conversión comercial por insumo (ej. 1 bulto = 0.05 ton)
 */
export function getUnitFactorForInsumo(insumoKey) {
  if (!insumoKey) return null;
  const cfg = getExpensesConfig();
  const factors = cfg?.unitFactors || {};
  return factors[insumoKey] || null;
}

export function saveUnitFactorForInsumo(insumoKey, factorData) {
  if (!insumoKey) return null;
  const cfg = getExpensesConfig();
  const factors = { ...(cfg?.unitFactors || {}) };
  if (!factorData || !factorData.purchaseUnit || !(Number(factorData.factorToCatalog) > 0)) {
    delete factors[insumoKey];
  } else {
    factors[insumoKey] = {
      purchaseUnit: String(factorData.purchaseUnit).trim(),
      factorToCatalog: Number(factorData.factorToCatalog)
    };
  }
  updateExpensesConfig({ unitFactors: factors });
  return factors[insumoKey] || null;
}

/**
 * Eliminar registro de gasto
 */
export function deleteExpenseRecord(recordId) {
  const data = loadExpensesData();
  data.records = data.records.filter(r => r.id !== recordId);
  saveExpensesData(data);
  return true;
}

/**
 * Alternar estado de pago (paid <-> pending)
 */
export function toggleRecordPaymentStatus(recordId) {
  const data = loadExpensesData();
  const rec = data.records.find(r => r.id === recordId);
  if (rec) {
    rec.paymentStatus = rec.paymentStatus === 'paid' ? 'pending' : 'paid';
    rec.amountPaid = rec.paymentStatus === 'paid' ? (Number(rec.total) || 0) : 0;
    rec.updatedAt = new Date().toISOString();
    saveExpensesData(data);
    return rec;
  }
  return null;
}

/**
 * Registrar pago o abono parcial en un registro a crédito
 */
export function registerExpensePaymentInstallment(recordId, paidAmountNow) {
  const data = loadExpensesData();
  const rec = data.records.find(r => r.id === recordId);
  if (!rec) return null;
  const total = Math.max(0, Number(rec.total) || 0);
  const currentPaid = Math.max(0, Number(rec.amountPaid) || 0);
  const addAmt = Math.max(0, Number(paidAmountNow) || 0);
  const nextPaid = Math.min(total, Math.round(((currentPaid + addAmt) + Number.EPSILON) * 100) / 100);
  rec.amountPaid = nextPaid;
  rec.paymentStatus = nextPaid >= total - 0.01 ? 'paid' : 'pending';
  rec.updatedAt = new Date().toISOString();
  saveExpensesData(data);
  return rec;
}

/**
 * Generador consecutivo de folio de Orden de Compra agrupada (ej: OC-2026-0001)
 */
export function generateNextOrderGroupId(records = null) {
  const recs = records || getExpensesRecords();
  const year = new Date().getFullYear();
  let maxSeq = 0;
  recs.forEach(r => {
    const gId = String(r.orderGroupId || '');
    if (gId.startsWith(`OC-${year}-`)) {
      const num = parseInt(gId.replace(`OC-${year}-`, ''), 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  });
  return `OC-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
}

/**
 * Generador consecutivo de ID de gasto (ej: exp-2026-0001)
 */
export function generateNextExpenseId(records = null) {
  const recs = records || getExpensesRecords();
  const year = new Date().getFullYear();
  let maxSeq = 0;
  recs.forEach(r => {
    if (r.id && r.id.startsWith(`exp-${year}-`)) {
      const seqStr = r.id.replace(`exp-${year}-`, '');
      const num = parseInt(seqStr, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });
  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `exp-${year}-${nextSeq}`;
}

/**
 * Generador consecutivo de ID de proveedor (ej: prov-004)
 */
export function generateNextSupplierId(suppliers = null) {
  const sups = suppliers || getExpensesSuppliers();
  let maxSeq = 0;
  sups.forEach(s => {
    if (s.id && s.id.startsWith('prov-')) {
      const num = parseInt(s.id.replace('prov-', ''), 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  });
  return `prov-${String(maxSeq + 1).padStart(3, '0')}`;
}
