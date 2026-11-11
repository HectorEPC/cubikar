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

// Estructura predeterminada para un nuevo proyecto
function getDefaultEstimacionesState() {
  const todayStr = formatDate(new Date());
  const endStr = formatDate(addDays(new Date(), 14));
  return {
    activeEstimacionId: 'est_1',
    anticipoPct: 30, // Porcentaje de anticipo pactado por defecto (30%)
    ivaPct: 16,      // Porcentaje de IVA por defecto (16%)
    estimaciones: [
      {
        id: 'est_1',
        numero: 1,
        nombre: 'Estimación No. 1',
        fechaInicio: todayStr,
        fechaFin: endStr,
        fechaCorte: endStr,
        notas: 'Estimación inicial de avance de obra',
        conceptos: {} // { [conceptId]: cantidadEjecutada }
      }
    ]
  };
}

// Cargar estado de estimaciones desde localStorage
export function loadEstimacionesData() {
  try {
    const raw = localStorage.getItem(getEstimacionesStorageKey());
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data.estimaciones) && data.estimaciones.length > 0) {
        if (!data.activeEstimacionId || !data.estimaciones.some(e => e.id === data.activeEstimacionId)) {
          data.activeEstimacionId = data.estimaciones[0].id;
        }
        if (typeof data.anticipoPct !== 'number' || isNaN(data.anticipoPct)) {
          data.anticipoPct = 30; // Predeterminado 30%
        }
        if (typeof data.ivaPct !== 'number' || isNaN(data.ivaPct)) {
          data.ivaPct = 16; // Predeterminado 16%
        }
        return data;
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
  const active = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (active && active.locked) return data.anticipoPct;
  const val = Math.max(0, Math.min(100, Number(pct) || 0));
  data.anticipoPct = Math.round((val + Number.EPSILON) * 100) / 100;
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

// Alternar el candado de bloqueo de la estimación activa actual
export function toggleActiveEstimacionLockState() {
  const data = loadEstimacionesData();
  const est = data.estimaciones.find(e => e.id === data.activeEstimacionId) || data.estimaciones[0];
  if (!est) return { locked: false, est: null };
  est.locked = !est.locked;
  saveEstimacionesData(data);
  return { locked: est.locked, est };
}

// Obtener estimación activa actual
export function getActiveEstimacion() {
  const data = loadEstimacionesData();
  const current = data.estimaciones.find(e => e.id === data.activeEstimacionId);
  return current || data.estimaciones[0];
}

// Cambiar la estimación activa
export function setActiveEstimacionId(estimacionId) {
  const data = loadEstimacionesData();
  if (data.estimaciones.some(e => e.id === estimacionId)) {
    data.activeEstimacionId = estimacionId;
    saveEstimacionesData(data);
  }
}

// Crear una nueva estimación secuencial (Estimación No. N+1)
export function createNewEstimacion(customName = null, fechaInicio = null, fechaFin = null) {
  const data = loadEstimacionesData();
  const nextNum = data.estimaciones.length + 1;
  const newId = `est_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  
  let sDate = fechaInicio;
  let eDate = fechaFin;
  
  if (!sDate) {
    const last = data.estimaciones[data.estimaciones.length - 1];
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
    nombre: customName || `Estimación No. ${nextNum}`,
    fechaInicio: sDate,
    fechaFin: eDate,
    fechaCorte: eDate,
    notas: '',
    conceptos: {}
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

// Eliminar una estimación
export function deleteEstimacion(estId) {
  const data = loadEstimacionesData();
  if (data.estimaciones.length <= 1) {
    return false; // Al menos debe quedar una estimación
  }
  const target = data.estimaciones.find(e => e.id === estId);
  if (target && target.locked) {
    return false; // No permitir eliminar una estimación bloqueada
  }
  if (target?.fotos && typeof target.fotos === 'object') {
    Object.values(target.fotos).flat().forEach((foto) => {
      if (foto && (foto.mediaId || foto.s3Key || foto.archivoId)) {
        deleteManagedFile(foto).catch((err) => console.warn('Cleanup estimación foto S3:', err));
      }
    });
  }
  data.estimaciones = data.estimaciones.filter(e => e.id !== estId);
  // Re-enumerar secuencialmente
  data.estimaciones.forEach((e, idx) => {
    e.numero = idx + 1;
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
  const current = data.estimaciones.find(e => e.id === data.activeEstimacionId);
  if (!current || current.locked) return false;

  if (!current.conceptos) current.conceptos = {};
  const val = Number(cantEje);
  if (isNaN(val) || val <= 0) {
    delete current.conceptos[conceptId];
  } else {
    current.conceptos[conceptId] = Math.round((val + Number.EPSILON) * 100) / 100;
  }
  saveEstimacionesData(data);
  return true;
}

// Normalizar enlaces externos de imágenes para visualización directa en <img>
export function normalizeCloudImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  // Dropbox: convertir ?dl=0 a ?raw=1
  if (/dropbox\.com/i.test(url)) {
    if (url.includes('?dl=0')) return url.replace('?dl=0', '?raw=1');
    if (!url.includes('raw=1')) return url + (url.includes('?') ? '&raw=1' : '?raw=1');
  }

  // OneDrive: convertir /embed? a /download? cuando sea enlace embed de OneDrive
  if (/onedrive\.live\.com\/embed\?/i.test(url)) {
    return url.replace(/\/embed\?/i, '/download?');
  }

  return url;
}

function normalizeEstimacionFotoItem(item) {
  if (!item || typeof item !== 'object') return null;
  const url = String(item.url || '').trim();
  const mediaId = String(item.mediaId || '').trim();
  const s3Key = String(item.s3Key || '').trim();
  const archivoId = String(item.archivoId || '').trim();
  if (!url && !mediaId && !s3Key) return null;

  return {
    url,
    displayUrl: url ? normalizeCloudImageUrl(url) : '',
    nota: String(item.nota || '').trim(),
    mediaId,
    s3Key,
    archivoId,
    fileName: String(item.fileName || '').trim(),
    sizeLabel: String(item.sizeLabel || '').trim()
  };
}

// Obtener los registros de fotos (1 o 2) asociados a un concepto en una estimación
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

// Guardar los registros de fotos (máximo 2) de un concepto en la estimación activa
export function setConceptoFotosEstimacion(conceptId, fotosList = []) {
  const data = loadEstimacionesData();
  const current = data.estimaciones.find(e => e.id === data.activeEstimacionId);
  if (!current || current.locked) return false;

  if (!current.fotos) current.fotos = {};
  const previousList = Array.isArray(current.fotos[conceptId]) ? current.fotos[conceptId] : [];
  const cleaned = (Array.isArray(fotosList) ? fotosList : [])
    .map((item) => {
      const url = String(item?.url || '').trim();
      const mediaId = String(item?.mediaId || '').trim();
      const s3Key = String(item?.s3Key || '').trim();
      const archivoId = String(item?.archivoId || '').trim();
      if (!url && !mediaId && !s3Key) return null;
      return {
        url,
        nota: String(item?.nota || '').trim(),
        mediaId,
        s3Key,
        archivoId,
        fileName: String(item?.fileName || '').trim(),
        sizeLabel: String(item?.sizeLabel || '').trim()
      };
    })
    .filter(Boolean)
    .slice(0, 2);

  // Limpiar archivos S3/IndexedDB que fueron removidos del concepto
  const keptKeys = new Set(
    cleaned.flatMap((it) => [it.mediaId, it.s3Key].filter(Boolean))
  );
  previousList.forEach((prev) => {
    if (!prev || (!prev.mediaId && !prev.s3Key && !prev.archivoId)) return;
    const stillKept = (prev.mediaId && keptKeys.has(prev.mediaId)) || (prev.s3Key && keptKeys.has(prev.s3Key));
    if (!stillKept) {
      deleteManagedFile(prev).catch((err) => console.warn('Cleanup estimación foto S3:', err));
    }
  });

  if (cleaned.length === 0) {
    delete current.fotos[conceptId];
  } else {
    current.fotos[conceptId] = cleaned;
  }
  saveEstimacionesData(data);
  return true;
}

// Aplanar el árbol de catálogo respetando jerarquía y calcular subtotales de estimación
export function getEstimacionesCalculatedData() {
  const estData = loadEstimacionesData();
  const activeEst = estData.estimaciones.find(e => e.id === estData.activeEstimacionId) || estData.estimaciones[0];
  const allEstimaciones = estData.estimaciones;

  // Encontrar todas las estimaciones anteriores a la activa para calcular el acumulado anterior
  const priorEstimaciones = allEstimaciones.filter(e => e.numero < activeEst.numero);

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

      // Cantidad ejecutada en esta estimación
      const cantEje = (activeEst.conceptos && activeEst.conceptos[node.id]) ? Number(activeEst.conceptos[node.id]) || 0 : 0;
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

    // Partida / Agrupador
    const currentPartidaLabel = `${node.clave || ''} ${node.descripcion || ''}`.trim() || parentPartidaLabel;
    const childrenRows = [];
    let partImporteBase = 0;
    let partImporteAnt = 0;
    let partTotalEje = 0;
    let partTotalAcum = 0;
    let partTotalSaldo = 0;
    let descendantCount = 0;

    (node.children || []).forEach(child => {
      const rows = traverseNode(child, level + 1, currentPartidaLabel);
      rows.forEach(r => {
        childrenRows.push(r);
        if (!r.isParent) {
          descendantCount++;
          partImporteBase += r.importeBase;
          partImporteAnt += r.importeAnt;
          partTotalEje += r.totalEje;
          partTotalAcum += r.totalAcum;
          partTotalSaldo += r.totalSaldo;
        }
      });
    });

    const partPctAvanceAcum = partImporteBase > 0 ? (partTotalAcum / partImporteBase) * 100 : 0;
    const partPctAvanceEsta = partImporteBase > 0 ? (partTotalEje / partImporteBase) * 100 : 0;

    const parentRow = {
      id: node.id,
      clave: node.clave || 'PART',
      descripcion: node.descripcion || 'Partida',
      unidad: '',
      isParent: true,
      level,
      color,
      expanded,
      descendantCount,
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
  const anticipoPct = typeof estData.anticipoPct === 'number' ? estData.anticipoPct : 30;
  const totalAnticipoContratado = Math.round(((grandTotalBase * (anticipoPct / 100)) + Number.EPSILON) * 100) / 100;

  // Ordenar cronológicamente todas las estimaciones para simular la amortización estricta acumulada
  const sortedEsts = [...allEstimaciones].sort((a, b) => a.numero - b.numero);

  let saldoAnticipoDisponible = totalAnticipoContratado;
  let amortizadoAnterior = 0;
  let amortizacionEsta = 0;

  sortedEsts.forEach(est => {
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
    // La amortización real se limita a no sobrepasar el saldo disponible de anticipo (hasta cubrir el 100%)
    const amortReal = Math.min(amortTeorica, saldoAnticipoDisponible);
    saldoAnticipoDisponible = Math.max(0, Math.round(((saldoAnticipoDisponible - amortReal) + Number.EPSILON) * 100) / 100);

    if (est.numero < activeEst.numero) {
      amortizadoAnterior += amortReal;
    } else if (est.numero === activeEst.numero) {
      amortizacionEsta = amortReal;
    }
  });

  amortizadoAnterior = Math.round((amortizadoAnterior + Number.EPSILON) * 100) / 100;
  amortizacionEsta = Math.round((amortizacionEsta + Number.EPSILON) * 100) / 100;
  const amortizadoAcumulado = Math.round(((amortizadoAnterior + amortizacionEsta) + Number.EPSILON) * 100) / 100;
  const saldoAnticipoPendiente = Math.max(0, Math.round(((totalAnticipoContratado - amortizadoAcumulado) + Number.EPSILON) * 100) / 100);
  const pctAnticipoAmortizado = totalAnticipoContratado > 0 
    ? Math.min(100, Math.round((((amortizadoAcumulado / totalAnticipoContratado) * 100) + Number.EPSILON) * 100) / 100) 
    : 100;
  const is100Covered = saldoAnticipoPendiente <= 0 || pctAnticipoAmortizado >= 100;
  const netoEstaEstimacion = Math.max(0, Math.round(((grandTotalEjecutado - amortizacionEsta) + Number.EPSILON) * 100) / 100);

  // ============================================================
  // CÁLCULO DE IVA Y TOTAL FACTURABLE (OPCIÓN 16% / PERSONALIZADO)
  // ============================================================
  const ivaPct = typeof estData.ivaPct === 'number' ? estData.ivaPct : 16;
  const ivaTotalContratado = Math.round(((grandTotalBase * (ivaPct / 100)) + Number.EPSILON) * 100) / 100;
  const ivaEstaEstimacion = Math.round(((netoEstaEstimacion * (ivaPct / 100)) + Number.EPSILON) * 100) / 100;
  const totalFacturadoConIva = Math.round(((netoEstaEstimacion + ivaEstaEstimacion) + Number.EPSILON) * 100) / 100;

  return {
    activeEst,
    estimacionesList: allEstimaciones,
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
        amortizadoAcumulado,
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
          if (est && est.conceptos && est.conceptos[node.id] !== undefined) {
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

  return {
    totalBase: baseForPct,
    totalEstimado: grandTotalEstimado,
    pctAvance,
    barWidthPct,
    estimacionesCount: estimaciones.length
  };
}
