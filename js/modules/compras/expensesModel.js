// js/modules/compras/expensesModel.js
// Modelo de datos y persistencia para CONTROL DE GASTOS, COMPRAS Y ERP FINANCIERO
// Cumple con la especificación técnica de expensesControl (Opción B)

import { getActiveProjectId } from '../../config/constants.js';
import { scheduleExpensesCloudSync, stripInlineBinaryPayloads } from '../../core/cloudModulesSyncService.js';

const STORAGE_KEY_PREFIX = 'expenses_control_';

export function getExpensesStorageKey(projectId = null) {
  const pId = projectId || getActiveProjectId() || 'default';
  return `${STORAGE_KEY_PREFIX}${pId}`;
}

export function getDefaultExpensesData() {
  return {
    config: {
      currency: 'MXN',
      alertThresholdPercent: 10
    },
    suppliers: [
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
    ],
    records: []
  };
}

/**
 * Cargar estado de Control de Gastos y Compras desde localStorage
 */
export function loadExpensesData(projectId = null) {
  try {
    const raw = localStorage.getItem(getExpensesStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        config: Object.assign({}, getDefaultExpensesData().config, parsed?.config || {}),
        suppliers: Array.isArray(parsed?.suppliers) ? parsed.suppliers : getDefaultExpensesData().suppliers,
        records: Array.isArray(parsed?.records) ? parsed.records : []
      };
    }
  } catch (err) {
    console.warn('[ExpensesModel] Error al leer datos de gastos:', err);
  }
  return getDefaultExpensesData();
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
      records: cleanRecords
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

/**
 * Guardar o actualizar registro de compra / gasto
 */
export function saveExpenseRecord(recordData) {
  const data = loadExpensesData();
  if (!recordData.id) {
    recordData.id = generateNextExpenseId(data.records);
  }
  
  // Normalizar valores numéricos
  recordData.quantity = Math.max(0, parseFloat(recordData.quantity) || 0);
  recordData.unitPrice = Math.max(0, parseFloat(recordData.unitPrice) || 0);
  recordData.subtotal = Math.round(((recordData.quantity * recordData.unitPrice) + Number.EPSILON) * 100) / 100;
  
  if (recordData.tax === undefined || recordData.tax === null) {
    recordData.tax = Math.round(((recordData.subtotal * 0.16) + Number.EPSILON) * 100) / 100;
  } else {
    recordData.tax = Math.max(0, parseFloat(recordData.tax) || 0);
  }
  
  recordData.total = Math.round(((recordData.subtotal + recordData.tax) + Number.EPSILON) * 100) / 100;
  
  const idx = data.records.findIndex(r => r.id === recordData.id);
  if (idx >= 0) {
    data.records[idx] = Object.assign({}, data.records[idx], recordData);
  } else {
    data.records.unshift(recordData); // Insertar al inicio para mostrar el más reciente
  }
  
  saveExpensesData(data);
  return recordData;
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
    saveExpensesData(data);
    return rec;
  }
  return null;
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
