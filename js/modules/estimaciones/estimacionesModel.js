// js/modules/estimaciones/estimacionesModel.js
// Modelo de datos y lógica de cálculo para ESTIMACIONES DE OBRA
// Sincronizado reactivamente con state.treeData (Catálogo Base)

import { state } from '../../state/store.js';
import { getActiveProjectId, getStorageKey } from '../../config/constants.js';
import { formatDate, parseDate, addDays, diffDays } from '../calendario/calendarioModel.js';
import { scheduleEstimacionesCloudSync, stripInlineBinaryPayloads } from '../../core/cloudModulesSyncService.js';
import { deleteManagedFile } from '../../services/s3StorageService.js';

const STORAGE_KEY_PREFIX = 'estimaciones_data_';

export function getEstimacionesStorageKeyForProject(projectId = null) {
  const pId = projectId || getActiveProjectId();
  return `${STORAGE_KEY_PREFIX}${pId}`;
}

function getEstimacionesStorageKey() {
  return getEstimacionesStorageKeyForProject();
}

// Estructura limpia para el comprobante fiscal de una estimación
export function createDefaultFacturaData() {
  return {
    folio: '',
    fechaEmision: '',
    fechaPago: '',
    status: 'pendiente', // 'pendiente' | 'cobrada'
    pdfUrl: '',
    pdfFileName: '',
    pdfFileRef: null,   // Referencia managed S3 / IndexedDB si aplica
    xmlUrl: '',
    xmlFileName: '',
    xmlFileRef: null
  };
}

// Estructura predeterminada de la Estimación 0 (Anticipo)
export function createDefaultEstimacionZero(anticipoPct = 30) {
  const todayStr = formatDate(new Date());
  return {
    id: 'est_0',
    numero: 0,
    tipo: 'anticipo',
    nombre: 'Est. 0 (Anticipo)',
    fechaInicio: todayStr,
    fechaFin: todayStr,
    fechaCorte: todayStr,
    fechaCobro: todayStr,
    anticipoPct: Number(anticipoPct) || 30,
    montoAnticipo: 0,
    fianzaPoliza: '',
    fianzaAfianzadora: '',
    notas: 'Registro de cobro de anticipo inicial pactado',
    locked: false,
    factura: createDefaultFacturaData()
  };
}

// Estructura predeterminada para un nuevo proyecto
function getDefaultEstimacionesState() {
  const todayStr = formatDate(new Date());
  const endStr = formatDate(addDays(new Date(), 14));
  return {
    activeEstimacionId: 'est_0',
    anticipoPct: 30, // Porcentaje de anticipo pactado por defecto (30%)
    ivaPct: 16,      // Porcentaje de IVA por defecto (16%)
    estimaciones: [
      createDefaultEstimacionZero(30),
      {
        id: 'est_1',
        numero: 1,
        tipo: 'avance',
        nombre: 'Estimación No. 1',
        fechaInicio: todayStr,
        fechaFin: endStr,
        fechaCorte: endStr,
        notas: 'Estimación inicial de avance de obra',
        conceptos: {}, // { [conceptId]: cantidadEjecutada }
        locked: false,
        factura: createDefaultFacturaData()
      }
    ]
  };
}

// Normalizar y garantizar retrocompatibilidad: Est. 0 fija al inicio y campos de factura en cada estimación
function sanitizeEstimacionesState(data) {
  if (!data || !Array.isArray(data.estimaciones)) {
    return getDefaultEstimacionesState();
  }

  // 1. Verificar si existe la Estimación 0 (Anticipo)
  let estZeroIndex = data.estimaciones.findIndex(e => e.numero === 0 || e.id === 'est_0' || e.tipo === 'anticipo');
  let estZero = null;

  if (estZeroIndex >= 0) {
    estZero = data.estimaciones[estZeroIndex];
    // Asegurar estructura
    estZero.id = 'est_0';
    estZero.numero = 0;
    estZero.tipo = 'anticipo';
    if (!estZero.nombre) estZero.nombre = 'Est. 0 (Anticipo)';
    if (typeof estZero.anticipoPct !== 'number') estZero.anticipoPct = Number(data.anticipoPct) || 30;
    if (!estZero.factura || typeof estZero.factura !== 'object') {
      estZero.factura = createDefaultFacturaData();
    }
    // Remover de su posición actual para situarla al frente
    data.estimaciones.splice(estZeroIndex, 1);
  } else {
    estZero = createDefaultEstimacionZero(data.anticipoPct || 30);
  }

  // 2. Normalizar las estimaciones de avance (número >= 1)
  const estimacionesAvance = data.estimaciones.filter(e => e.numero !== 0 && e.id !== 'est_0');
  if (estimacionesAvance.length === 0) {
    const todayStr = formatDate(new Date());
    const endStr = formatDate(addDays(new Date(), 14));
    estimacionesAvance.push({
      id: 'est_1',
      numero: 1,
      tipo: 'avance',
      nombre: 'Estimación No. 1',
      fechaInicio: todayStr,
      fechaFin: endStr,
      fechaCorte: endStr,
      notas: 'Estimación inicial de avance de obra',
      conceptos: {},
      locked: false,
      factura: createDefaultFacturaData()
    });
  }

  // Re-enumerar secuencialmente 1..N
  estimacionesAvance.forEach((e, idx) => {
    e.numero = idx + 1;
    e.tipo = 'avance';
    if (!e.factura || typeof e.factura !== 'object') {
      e.factura = createDefaultFacturaData();
    }
  });

  // Reensamblar con est_0 siempre en la posición 0
  data.estimaciones = [estZero, ...estimacionesAvance];

  if (!data.activeEstimacionId || !data.estimaciones.some(e => e.id === data.activeEstimacionId)) {
    data.activeEstimacionId = data.estimaciones[0].id;
  }
  if (typeof data.anticipoPct !== 'number' || isNaN(data.anticipoPct)) {
    data.anticipoPct = estZero.anticipoPct || 30;
  }
  if (typeof data.ivaPct !== 'number' || isNaN(data.ivaPct)) {
    data.ivaPct = 16;
  }

  return data;
}

// Cargar estado de estimaciones desde localStorage
export function loadEstimacionesData() {
  try {
    const raw = localStorage.getItem(getEstimacionesStorageKey());
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.estimaciones) && data.estimaciones.length > 0) {
        return sanitizeEstimacionesState(data);
      }
    }
  } catch (e) {
    console.error('Error al cargar datos de estimaciones:', e);
  }
  return getDefaultEstimacionesState();
}

// Guardar estado de estimaciones en localStorage
export function saveEstimacionesData(data) {
  try {
    if (data && Array.isArray(data.estimaciones)) {
      data.estimaciones = data.estimaciones.map((est) => {
        const next = { ...est };
        if (Array.isArray(next.fotos)) {
          next.fotos = stripInlineBinaryPayloads(next.fotos);
        } else if (next.fotos && typeof next.fotos === 'object') {
          const sanitizedFotos = {};
          for (const [k, list] of Object.entries(next.fotos)) {
            sanitizedFotos[k] = stripInlineBinaryPayloads(Array.isArray(list) ? list : []);
          }
          next.fotos = sanitizedFotos;
        }
        if (next.conceptPhotos && typeof next.conceptPhotos === 'object') {
          const sanitized = {};
          for (const [k, list] of Object.entries(next.conceptPhotos)) {
            sanitized[k] = stripInlineBinaryPayloads(Array.isArray(list) ? list : []);
          }
          next.conceptPhotos = sanitized;
        }
        return next;
      });
    }
    localStorage.setItem(getEstimacionesStorageKey(), JSON.stringify(data));
    scheduleEstimacionesCloudSync();
  } catch (e) {
    console.error('Error al guardar datos de estimaciones:', e);
  }
}

// Configurar porcentaje de anticipo pactado
export function setEstimacionesAnticipoPct(pct) {
  const data = loadEstimacionesData();
  const estZero = data.estimaciones.find(e => e.numero === 0) || data.estimaciones[0];
  if (estZero && estZero.locked) return data.anticipoPct;
  const val = Math.max(0, Math.min(100, Number(pct) || 0));
  const rounded = Math.round((val + Number.EPSILON) * 100) / 100;
  data.anticipoPct = rounded;
  if (estZero) {
    estZero.anticipoPct = rounded;
  }
  saveEstimacionesData(data);
  return data.anticipoPct;
}

// Configurar porcentaje de IVA aplicable
export function setEstimacionesIvaPct(pct) {
  const data = loadEstimacionesData();
  const active = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (active && active.locked) return data.ivaPct;
  const val = Math.max(0, Math.min(100, Number(pct) || 0));
  data.ivaPct = Math.round((val + Number.EPSILON) * 100) / 100;
  saveEstimacionesData(data);
  return data.ivaPct;
}

// Actualizar campos específicos de la Estimación 0 (Ficha de cobro de anticipo)
export function updateEstimacionAnticipoZero(updates = {}) {
  const data = loadEstimacionesData();
  const estZero = data.estimaciones.find(e => e.numero === 0 || e.id === 'est_0');
  if (!estZero || estZero.locked) return false;

  if (updates.anticipoPct !== undefined) {
    const val = Math.max(0, Math.min(100, Number(updates.anticipoPct) || 0));
    estZero.anticipoPct = Math.round((val + Number.EPSILON) * 100) / 100;
    data.anticipoPct = estZero.anticipoPct;
  }
  if (updates.fechaCobro !== undefined) estZero.fechaCobro = String(updates.fechaCobro || '');
  if (updates.fechaCorte !== undefined) estZero.fechaCorte = String(updates.fechaCorte || '');
  if (updates.fianzaPoliza !== undefined) estZero.fianzaPoliza = String(updates.fianzaPoliza || '').trim();
  if (updates.fianzaAfianzadora !== undefined) estZero.fianzaAfianzadora = String(updates.fianzaAfianzadora || '').trim();
  if (updates.notas !== undefined) estZero.notas = String(updates.notas || '');

  saveEstimacionesData(data);
  return true;
}

// Actualizar datos de facturación / comprobante fiscal de cualquier estimación (0..N)
// Nota: permitimos registrar factura y cobro incluso si la estimación tiene candado de conceptos,
// a menos que forceLock esté explícitamente indicado.
export function updateEstimacionFactura(estId, facturaUpdates = {}) {
  const data = loadEstimacionesData();
  const target = data.estimaciones.find(e => e.id === estId);
  if (!target) return false;

  if (!target.factura || typeof target.factura !== 'object') {
    target.factura = createDefaultFacturaData();
  }

  Object.assign(target.factura, facturaUpdates);
  saveEstimacionesData(data);
  return true;
}

// Verificar si una estimación (o la estimación activa) se encuentra bloqueada con candado
export function isEstimacionLocked(estId = null) {
  const data = loadEstimacionesData();
  const targetId = estId || data.activeEstimacionId;
  const est = data.estimaciones.find(e => e.id === targetId) || data.estimaciones[0];
  return Boolean(est && est.locked);
}

// Establecer estado de bloqueo en una estimación específica (o la activa)
export function setEstimacionLocked(estId = null, locked = true) {
  const data = loadEstimacionesData();
  const targetId = estId || data.activeEstimacionId;
  const est = data.estimaciones.find(e => e.id === targetId) || data.estimaciones[0];
  if (!est) return false;
  est.locked = Boolean(locked);
  saveEstimacionesData(data);
  return est.locked;
}

// Alternar candado de bloqueo de la estimación activa
export function toggleActiveEstimacionLockState() {
  const data = loadEstimacionesData();
  const active = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (!active) return false;
  active.locked = !active.locked;
  saveEstimacionesData(data);
  return active.locked;
}

// Obtener estimación activa
export function getActiveEstimacion() {
  const data = loadEstimacionesData();
  return data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
}

// Cambiar la estimación activa
export function setActiveEstimacionId(estimacionId) {
  const data = loadEstimacionesData();
  if (data.estimaciones.some(e => e.id === estimacionId)) {
    data.activeEstimacionId = estimacionId;
    saveEstimacionesData(data);
    return true;
  }
  return false;
}

// Crear una nueva estimación de avance consecutivo (Est. 1, Est. 2, ...)
export function createNewEstimacion(customName = null, fechaInicio = null, fechaFin = null) {
  const data = loadEstimacionesData();
  const estimacionesAvance = data.estimaciones.filter(e => e.numero > 0);
  const nextNum = estimacionesAvance.length + 1;
  const newId = `est_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  
  let sDate = fechaInicio;
  let eDate = fechaFin;
  
  if (!sDate) {
    const last = estimacionesAvance[estimacionesAvance.length - 1];
    if (last && last.fechaFin) {
      const d = parseDate(last.fechaFin);
      sDate = formatDate(addDays(d, 1));
      eDate = formatDate(addDays(d, 15));
    } else {
      sDate = formatDate(new Date());
      eDate = formatDate(addDays(new Date(), 14));
    }
  }
  if (!eDate) {
    eDate = formatDate(addDays(parseDate(sDate), 14));
  }

  const newEst = {
    id: newId,
    numero: nextNum,
    tipo: 'avance',
    nombre: customName || `Estimación No. ${nextNum}`,
    fechaInicio: sDate,
    fechaFin: eDate,
    fechaCorte: eDate,
    notas: '',
    conceptos: {},
    locked: false,
    factura: createDefaultFacturaData()
  };

  data.estimaciones.push(newEst);
  data.activeEstimacionId = newId;
  saveEstimacionesData(data);
  return newEst;
}

// Actualizar datos generales de una estimación (fechas, nombre, notas)
export function updateEstimacionMeta(estId, updates) {
  const data = loadEstimacionesData();
  const est = data.estimaciones.find(e => e.id === estId);
  if (!est || est.locked) return false;
  Object.assign(est, updates);
  saveEstimacionesData(data);
  return true;
}

// Eliminar una estimación (la Est. 0 no se puede eliminar)
export function deleteEstimacion(estId) {
  const data = loadEstimacionesData();
  const target = data.estimaciones.find(e => e.id === estId);
  if (!target) return false;

  // La Estimación 0 (Anticipo) es fija e indestructible
  if (target.numero === 0 || target.id === 'est_0' || target.tipo === 'anticipo') {
    return false;
  }

  const estimacionesAvance = data.estimaciones.filter(e => e.numero > 0);
  if (estimacionesAvance.length <= 1) {
    return false; // Al menos debe quedar una estimación de avance
  }

  if (target.locked) {
    return false; // No permitir eliminar una estimación bloqueada
  }

  if (target?.fotos && typeof target.fotos === 'object') {
    Object.values(target.fotos).flat().forEach((foto) => {
      if (foto && (foto.mediaId || foto.s3Key || foto.archivoId)) {
        deleteManagedFile(foto).catch((err) => console.warn('Cleanup estimación foto S3:', err));
      }
    });
  }

  // Eliminar referencias a factura si existen archivos manejados
  if (target.factura) {
    if (target.factura.pdfFileRef) deleteManagedFile(target.factura.pdfFileRef).catch(() => {});
    if (target.factura.xmlFileRef) deleteManagedFile(target.factura.xmlFileRef).catch(() => {});
  }

  data.estimaciones = data.estimaciones.filter(e => e.id !== estId);

  // Re-enumerar secuencialmente solo las estimaciones de avance
  let counter = 1;
  data.estimaciones.forEach((e) => {
    if (e.numero > 0 && e.id !== 'est_0') {
      e.numero = counter++;
    }
  });

  if (data.activeEstimacionId === estId) {
    data.activeEstimacionId = data.estimaciones[0].id;
  }
  saveEstimacionesData(data);
  return true;
}

// Actualizar la cantidad ejecutada de un concepto en la estimación activa
export function setConceptoCantidadEjecutada(conceptId, cantEje) {
  const data = loadEstimacionesData();
  const active = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (!active || active.locked || active.numero === 0) return false;

  if (!active.conceptos) {
    active.conceptos = {};
  }
  const val = Number(cantEje) || 0;
  if (val <= 0) {
    delete active.conceptos[conceptId];
  } else {
    active.conceptos[conceptId] = Math.round((val + Number.EPSILON) * 100) / 100;
  }
  saveEstimacionesData(data);
  return true;
}

// Normalizar enlaces compartidos desde Google Drive, OneDrive o Dropbox
export function normalizeCloudImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  const gdriveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i)
    || url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i)
    || url.match(/drive\.google\.com\/uc\?(?:export=[a-z]+&)?id=([a-zA-Z0-9_-]+)/i)
    || url.match(/drive\.google\.com\/thumbnail\?id=([a-zA-Z0-9_-]+)/i);
  if (gdriveFileMatch && gdriveFileMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${gdriveFileMatch[1]}&sz=w1600`;
  }

  if (/dropbox\.com/i.test(url)) {
    if (url.includes('?dl=0')) return url.replace('?dl=0', '?raw=1');
    if (!url.includes('raw=1')) return url + (url.includes('?') ? '&raw=1' : '?raw=1');
  }

  if (/onedrive\.live\.com\/embed\?/i.test(url)) {
    return url.replace('/embed?', '/download?');
  }

  return url;
}

function normalizeEstimacionFotoItem(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    const raw = String(item).trim();
    if (!raw) return null;
    return {
      url: raw,
      displayUrl: normalizeCloudImageUrl(raw),
      nota: ''
    };
  }

  const rawUrl = String(item.displayUrl || item.url || item.cloudUrl || '').trim();
  return {
    mediaId: item.mediaId || '',
    archivoId: item.archivoId || '',
    s3Key: item.s3Key || '',
    bucket: item.bucket || '',
    fileName: item.fileName || '',
    url: String(item.url || rawUrl).trim(),
    displayUrl: normalizeCloudImageUrl(rawUrl),
    nota: String(item.nota || '').trim()
  };
}

// Obtener los enlaces de fotos (1 o 2) asociados a un concepto en una estimación
export function getConceptoFotosEstimacion(conceptId, estId = null) {
  const data = loadEstimacionesData();
  const targetId = estId || data.activeEstimacionId;
  const est = data.estimaciones.find(e => e.id === targetId) || data.estimaciones[0];
  if (!est || !est.fotos || !Array.isArray(est.fotos[conceptId])) return [];
  return est.fotos[conceptId]
    .map(normalizeEstimacionFotoItem)
    .filter(Boolean)
    .slice(0, 2);
}

// Guardar los enlaces de fotos (máximo 2) de un concepto en la estimación activa
export function setConceptoFotosEstimacion(conceptId, fotosList = []) {
  const data = loadEstimacionesData();
  const current = data.estimaciones.find(e => e.id === data.activeEstimacionId);
  if (!current || current.locked || current.numero === 0) return false;

  if (!current.fotos) current.fotos = {};
  const cleaned = (Array.isArray(fotosList) ? fotosList : [])
    .map(normalizeEstimacionFotoItem)
    .filter(Boolean)
    .slice(0, 2);

  if (cleaned.length === 0) {
    delete current.fotos[conceptId];
  } else {
    current.fotos[conceptId] = cleaned;
  }
  saveEstimacionesData(data);
  return true;
}

// Obtener todos los datos calculados de la estimación activa y consolidados
export function getEstimacionesCalculatedData() {
  const estData = loadEstimacionesData();
  const activeEst = estData.estimaciones.find(e => e.id === estData.activeEstimacionId) || estData.estimaciones[0];
  const allEstimaciones = estData.estimaciones;

  // Filtrar estimaciones de avance (número > 0)
  const estimacionesAvance = allEstimaciones.filter(e => e.numero > 0);
  const priorEstimaciones = estimacionesAvance.filter(e => e.numero < activeEst.numero);

  let grandTotalBase = 0;
  let grandTotalEjecutado = 0;
  let grandTotalAnterior = 0;
  let grandTotalAcumulado = 0;
  let grandTotalSaldo = 0;
  const puMap = new Map();

  function traverseNode(node, level = 1, parentPartidaLabel = '') {
    const isParent = Array.isArray(node.children) && node.children.length > 0;
    const color = node.color ? (typeof node.color === 'object' ? node.color : { bar: node.color }) : { bar: '#3b82f6' };
    const expanded = node.expanded !== false;

    if (!isParent) {
      // Concepto final ejecutable
      const cantBase = Math.round(((Number(node.cantidad) || 0) + Number.EPSILON) * 100) / 100;
      const pu = Math.round(((Number(node.precioUnitario) || 0) + Number.EPSILON) * 100) / 100;
      const importeBase = Math.round((cantBase * pu) * 100) / 100;
      puMap.set(node.id, pu);

      // Cantidad acumulada en estimaciones anteriores
      let cantAnt = 0;
      priorEstimaciones.forEach(pe => {
        if (pe.conceptos && pe.conceptos[node.id]) {
          cantAnt += Number(pe.conceptos[node.id]) || 0;
        }
      });
      cantAnt = Math.round((cantAnt + Number.EPSILON) * 100) / 100;
      const importeAnt = Math.round((cantAnt * pu) * 100) / 100;

      // Cantidad ejecutada en esta estimación (si es la Est. 0, cantEje es siempre 0)
      const cantEje = (activeEst.numero > 0 && activeEst.conceptos && activeEst.conceptos[node.id]) 
        ? Number(activeEst.conceptos[node.id]) || 0 
        : 0;
      const totalEje = Math.round((cantEje * pu) * 100) / 100;

      // Acumulado actual
      const cantAcum = Math.round(((cantAnt + cantEje) + Number.EPSILON) * 100) / 100;
      const totalAcum = Math.round((cantAcum * pu) * 100) / 100;

      // % Avance
      const pctAvanceEsta = cantBase > 0 ? (cantEje / cantBase) * 100 : 0;
      const pctAvanceAcum = cantBase > 0 ? (cantAcum / cantBase) * 100 : 0;

      // Saldo por ejecutar
      const cantSaldo = Math.max(0, Math.round(((cantBase - cantAcum) + Number.EPSILON) * 100) / 100);
      const totalSaldo = Math.round((cantSaldo * pu) * 100) / 100;
      const isExceeded = cantAcum > cantBase;

      const rawFotos = (activeEst.fotos && Array.isArray(activeEst.fotos[node.id])) ? activeEst.fotos[node.id] : [];
      const fotos = rawFotos
        .map(normalizeEstimacionFotoItem)
        .filter(Boolean)
        .slice(0, 2);

      grandTotalBase += importeBase;
      grandTotalEjecutado += totalEje;
      grandTotalAnterior += importeAnt;
      grandTotalAcumulado += totalAcum;
      grandTotalSaldo += totalSaldo;

      return [{
        id: node.id,
        clave: node.clave || '',
        descripcion: node.descripcion || '',
        unidad: node.unidad || 'LOTE',
        partidaNombre: parentPartidaLabel,
        fotos,
        isParent: false,
        level,
        color,
        expanded: true,
        cantBase,
        pu,
        importeBase,
        cantAnt,
        importeAnt,
        cantEje,
        totalEje,
        cantAcum,
        totalAcum,
        pctAvanceEsta,
        pctAvanceAcum,
        cantSaldo,
        totalSaldo,
        isExceeded
      }];
    }

    // Partida agrupadora
    const currentPartidaLabel = node.descripcion || node.clave || 'Partida';
    let partImporteBase = 0;
    let partImporteAnt = 0;
    let partTotalEje = 0;
    let partTotalAcum = 0;
    let partTotalSaldo = 0;

    const childrenRows = [];
    (node.children || []).forEach(child => {
      const rows = traverseNode(child, level + 1, currentPartidaLabel);
      childrenRows.push(...rows);
    });

    childrenRows.forEach(row => {
      if (!row.isParent) {
        partImporteBase += row.importeBase;
        partImporteAnt += row.importeAnt;
        partTotalEje += row.totalEje;
        partTotalAcum += row.totalAcum;
        partTotalSaldo += row.totalSaldo;
      }
    });

    partImporteBase = Math.round((partImporteBase + Number.EPSILON) * 100) / 100;
    partImporteAnt = Math.round((partImporteAnt + Number.EPSILON) * 100) / 100;
    partTotalEje = Math.round((partTotalEje + Number.EPSILON) * 100) / 100;
    partTotalAcum = Math.round((partTotalAcum + Number.EPSILON) * 100) / 100;
    partTotalSaldo = Math.round((partTotalSaldo + Number.EPSILON) * 100) / 100;

    const partPctAvanceEsta = partImporteBase > 0 ? (partTotalEje / partImporteBase) * 100 : 0;
    const partPctAvanceAcum = partImporteBase > 0 ? (partTotalAcum / partImporteBase) * 100 : 0;

    const parentRow = {
      id: node.id,
      clave: node.clave || '',
      descripcion: node.descripcion || 'Sin descripción',
      unidad: '',
      partidaNombre: parentPartidaLabel,
      fotos: [],
      isParent: true,
      level,
      color,
      expanded,
      cantBase: 0,
      pu: 0,
      importeBase: partImporteBase,
      cantAnt: 0,
      importeAnt: partImporteAnt,
      cantEje: 0,
      totalEje: partTotalEje,
      cantAcum: 0,
      totalAcum: partTotalAcum,
      pctAvanceEsta: partPctAvanceEsta,
      pctAvanceAcum: partPctAvanceAcum,
      cantSaldo: 0,
      totalSaldo: partTotalSaldo,
      isExceeded: partTotalAcum > partImporteBase
    };

    return [parentRow, ...childrenRows];
  }

  const allRows = [];
  (state.treeData || []).forEach(root => {
    allRows.push(...traverseNode(root, 1));
  });

  const pctAvanceGlobal = grandTotalBase > 0 ? (grandTotalAcumulado / grandTotalBase) * 100 : 0;
  const pctAvanceEstaEstimacion = grandTotalBase > 0 ? (grandTotalEjecutado / grandTotalBase) * 100 : 0;

  // ============================================================
  // CÁLCULO DE ANTICIPO Y AMORTIZACIÓN PROGRESIVA HASTA EL 100%
  // ============================================================
  const estZero = allEstimaciones.find(e => e.numero === 0) || allEstimaciones[0];
  const anticipoPct = typeof estData.anticipoPct === 'number' 
    ? estData.anticipoPct 
    : (estZero?.anticipoPct !== undefined ? estZero.anticipoPct : 30);
  
  const totalAnticipoContratado = Math.round(((grandTotalBase * (anticipoPct / 100)) + Number.EPSILON) * 100) / 100;

  // Actualizar en estZero el monto de anticipo calculado si no está fijado
  if (estZero) {
    estZero.montoAnticipo = totalAnticipoContratado;
  }

  // Ordenar cronológicamente estimaciones de avance (número >= 1)
  const sortedAvanceEsts = [...estimacionesAvance].sort((a, b) => a.numero - b.numero);

  let saldoAnticipoDisponible = totalAnticipoContratado;
  let amortizadoAnterior = 0;
  let amortizacionEsta = 0;
  let amortizadoTotalHistorico = 0;

  sortedAvanceEsts.forEach(est => {
    let estTotal = 0;
    if (est.conceptos) {
      Object.entries(est.conceptos).forEach(([cId, cant]) => {
        const pu = puMap.get(cId) || 0;
        estTotal += (Number(cant) || 0) * pu;
      });
    }
    estTotal = Math.round((estTotal + Number.EPSILON) * 100) / 100;

    // Amortización teórica proporcional al % de anticipo
    const amortTeorica = Math.round(((estTotal * (anticipoPct / 100)) + Number.EPSILON) * 100) / 100;
    // La amortización real se limita a no sobrepasar el saldo disponible de anticipo
    const amortReal = Math.min(amortTeorica, saldoAnticipoDisponible);
    saldoAnticipoDisponible = Math.max(0, Math.round(((saldoAnticipoDisponible - amortReal) + Number.EPSILON) * 100) / 100);
    amortizadoTotalHistorico += amortReal;

    if (est.numero < activeEst.numero) {
      amortizadoAnterior += amortReal;
    } else if (est.numero === activeEst.numero) {
      amortizacionEsta = amortReal;
    }
  });

  amortizadoAnterior = Math.round((amortizadoAnterior + Number.EPSILON) * 100) / 100;
  amortizacionEsta = Math.round((amortizacionEsta + Number.EPSILON) * 100) / 100;
  amortizadoTotalHistorico = Math.round((amortizadoTotalHistorico + Number.EPSILON) * 100) / 100;

  const amortizadoAcumulado = (activeEst.numero === 0)
    ? 0
    : Math.round(((amortizadoAnterior + amortizacionEsta) + Number.EPSILON) * 100) / 100;

  const saldoAnticipoPendiente = Math.max(0, Math.round(((totalAnticipoContratado - (activeEst.numero === 0 ? amortizadoTotalHistorico : amortizadoAcumulado)) + Number.EPSILON) * 100) / 100);
  
  const pctAnticipoAmortizado = totalAnticipoContratado > 0 
    ? Math.min(100, Math.round(((((activeEst.numero === 0 ? amortizadoTotalHistorico : amortizadoAcumulado) / totalAnticipoContratado) * 100) + Number.EPSILON) * 100) / 100) 
    : 100;
  
  const is100Covered = saldoAnticipoPendiente <= 0 || pctAnticipoAmortizado >= 100;
  const netoEstaEstimacion = (activeEst.numero === 0)
    ? totalAnticipoContratado
    : Math.max(0, Math.round(((grandTotalEjecutado - amortizacionEsta) + Number.EPSILON) * 100) / 100);

  // ============================================================
  // CÁLCULO DE IVA Y TOTAL FACTURABLE (OPCIÓN 16% / PERSONALIZADO)
  // ============================================================
  const ivaPct = typeof estData.ivaPct === 'number' ? estData.ivaPct : 16;
  const ivaTotalContratado = Math.round(((grandTotalBase * (ivaPct / 100)) + Number.EPSILON) * 100) / 100;
  const ivaEstaEstimacion = Math.round(((netoEstaEstimacion * (ivaPct / 100)) + Number.EPSILON) * 100) / 100;
  const totalFacturadoConIva = Math.round(((netoEstaEstimacion + ivaEstaEstimacion) + Number.EPSILON) * 100) / 100;

  // ============================================================
  // SUMA DE INGRESOS TOTALES COBRADOS DE LA OBRA
  // Ingresos Totales = Anticipo (si cobrado) + Líquidos netos cobrados (Est. 1..N)
  // ============================================================
  let ingresosTotalesCobrados = 0;
  let ingresosTotalesFacturados = 0;

  allEstimaciones.forEach(est => {
    const isCobrada = est.factura?.status === 'cobrada';
    let estNeto = 0;

    if (est.numero === 0) {
      estNeto = totalAnticipoContratado;
    } else {
      let estTotal = 0;
      if (est.conceptos) {
        Object.entries(est.conceptos).forEach(([cId, cant]) => {
          const pu = puMap.get(cId) || 0;
          estTotal += (Number(cant) || 0) * pu;
        });
      }
      estTotal = Math.round((estTotal + Number.EPSILON) * 100) / 100;
      const amortTeorica = Math.round(((estTotal * (anticipoPct / 100)) + Number.EPSILON) * 100) / 100;
      estNeto = Math.max(0, estTotal - amortTeorica);
    }

    const estIva = Math.round(((estNeto * (ivaPct / 100)) + Number.EPSILON) * 100) / 100;
    const estLiquidoConIva = estNeto + estIva;

    ingresosTotalesFacturados += estLiquidoConIva;
    if (isCobrada) {
      ingresosTotalesCobrados += estLiquidoConIva;
    }
  });

  ingresosTotalesCobrados = Math.round((ingresosTotalesCobrados + Number.EPSILON) * 100) / 100;
  ingresosTotalesFacturados = Math.round((ingresosTotalesFacturados + Number.EPSILON) * 100) / 100;

  return {
    activeEst,
    estZero,
    estimacionesList: allEstimaciones,
    estimacionesAvance,
    rows: allRows,
    kpis: {
      grandTotalBase,
      grandTotalEjecutado,
      grandTotalAnterior,
      grandTotalAcumulado,
      grandTotalSaldo,
      pctAvanceGlobal,
      pctAvanceEstaEstimacion,
      anticipo: {
        pct: anticipoPct,
        totalContratado: totalAnticipoContratado,
        amortizadoAnterior,
        amortizacionEsta,
        amortizadoAcumulado: (activeEst.numero === 0) ? amortizadoTotalHistorico : amortizadoAcumulado,
        amortizadoTotalHistorico,
        saldoPendiente: saldoAnticipoPendiente,
        pctAmortizado: pctAnticipoAmortizado,
        is100Covered,
        netoEstaEstimacion
      },
      iva: {
        pct: ivaPct,
        totalContratado: ivaTotalContratado,
        estaEstimacion: ivaEstaEstimacion,
        totalConIva: totalFacturadoConIva
      },
      ingresos: {
        totalesCobrados: ingresosTotalesCobrados,
        totalesFacturados: ingresosTotalesFacturados,
        saldoPorCobrarContrato: Math.max(0, Math.round(((grandTotalBase + ivaTotalContratado) - ingresosTotalesCobrados) * 100) / 100)
      }
    }
  };
}

// Calcular el avance estimado real de cualquier proyecto sumando TODAS sus Estimaciones registradas
export function calculateProjectTotalEstimacionesSummary(projectId, fallbackTotalPresupuesto = 0) {
  let treeNodes = [];
  try {
    if (projectId && projectId === getActiveProjectId() && Array.isArray(state.treeData) && state.treeData.length > 0) {
      treeNodes = state.treeData;
    } else if (typeof localStorage !== 'undefined') {
      const rawTree = localStorage.getItem(getStorageKey(projectId));
      if (rawTree) {
        const parsedTree = JSON.parse(rawTree);
        if (Array.isArray(parsedTree)) treeNodes = parsedTree;
      }
    }
  } catch (e) {
    treeNodes = [];
  }

  let estimaciones = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const rawEst = localStorage.getItem(getEstimacionesStorageKeyForProject(projectId));
      if (rawEst) {
        const parsedEst = JSON.parse(rawEst);
        if (Array.isArray(parsedEst?.estimaciones)) {
          estimaciones = parsedEst.estimaciones;
        }
      }
    }
  } catch (e) {
    estimaciones = [];
  }

  let grandTotalBase = 0;
  let grandTotalEstimado = 0;

  function walkNodes(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(node => {
      const isParent = Array.isArray(node.children) && node.children.length > 0;
      if (isParent) {
        walkNodes(node.children);
      } else {
        const cantBase = Math.round(((Number(node.cantidad) || 0) + Number.EPSILON) * 100) / 100;
        const pu = Math.round(((Number(node.precioUnitario) || 0) + Number.EPSILON) * 100) / 100;
        const importeBase = Math.round((cantBase * pu) * 100) / 100;

        let cantTotalEst = 0;
        estimaciones.forEach(est => {
          // Solo sumar avance físico de estimaciones de obra (numero > 0)
          if (est && est.numero > 0 && est.conceptos && est.conceptos[node.id] !== undefined) {
            cantTotalEst += Number(est.conceptos[node.id]) || 0;
          }
        });
        cantTotalEst = Math.round((cantTotalEst + Number.EPSILON) * 100) / 100;
        const importeTotalEst = Math.round((cantTotalEst * pu) * 100) / 100;

        grandTotalBase += importeBase;
        grandTotalEstimado += importeTotalEst;
      }
    });
  }

  walkNodes(treeNodes);

  grandTotalBase = Math.round((grandTotalBase + Number.EPSILON) * 100) / 100;
  grandTotalEstimado = Math.round((grandTotalEstimado + Number.EPSILON) * 100) / 100;

  const baseForPct = grandTotalBase > 0 ? grandTotalBase : (Number(fallbackTotalPresupuesto) || 0);
  const pctAvance = baseForPct > 0
    ? Math.round((((grandTotalEstimado / baseForPct) * 100) + Number.EPSILON) * 100) / 100
    : 0;
  const barWidthPct = Math.max(0, Math.min(100, pctAvance));

  const estimacionesAvanceCount = estimaciones.filter(e => e.numero > 0).length;

  return {
    totalBase: baseForPct,
    totalEstimado: grandTotalEstimado,
    pctAvance,
    barWidthPct,
    estimacionesCount: estimacionesAvanceCount || estimaciones.length
  };
}
