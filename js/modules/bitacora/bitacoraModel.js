// js/modules/bitacora/bitacoraModel.js
// Modelo de datos, folios correlativos, métricas de obra y reglas legales de inviolabilidad (LOPSRM / BESOP)

import { state } from '../../state/store.js';
import { getActiveProjectId } from '../../config/constants.js';
import { getCurrentUser, getProjectById } from '../portal/projectService.js';
import { getScheduleSettings, extractScheduleItems, parseDate, formatDate, diffDays } from '../calendario/calendarioModel.js';
import { scheduleBitacoraCloudSync, stripInlineBinaryPayloads } from '../../core/cloudModulesSyncService.js';

const STORAGE_KEY_PREFIX = 'adm_const_bitacora_';

export const BITACORA_NOTE_TYPES = [
  {
    id: 'Apertura',
    label: 'Apertura',
    icon: 'fa-door-open',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    accentBorder: 'border-l-emerald-500',
    dotClass: 'bg-emerald-500 ring-emerald-200',
    pdfColor: [16, 185, 129]
  },
  {
    id: 'Instrucción de Supervisión',
    label: 'Instrucción de Supervisión',
    icon: 'fa-clipboard-check',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    accentBorder: 'border-l-amber-500',
    dotClass: 'bg-amber-500 ring-amber-200',
    pdfColor: [217, 119, 6]
  },
  {
    id: 'Solicitud del Contratista',
    label: 'Solicitud del Contratista',
    icon: 'fa-file-signature',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    accentBorder: 'border-l-purple-500',
    dotClass: 'bg-purple-500 ring-purple-200',
    pdfColor: [147, 51, 234]
  },
  {
    id: 'Avance de Obra',
    label: 'Avance de Obra',
    icon: 'fa-person-digging',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
    accentBorder: 'border-l-blue-500',
    dotClass: 'bg-blue-500 ring-blue-200',
    pdfColor: [37, 99, 235]
  },
  {
    id: 'Suspensión/Clima',
    label: 'Suspensión / Clima',
    icon: 'fa-cloud-showers-heavy',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
    accentBorder: 'border-l-orange-500',
    dotClass: 'bg-orange-500 ring-orange-200',
    pdfColor: [234, 88, 12]
  },
  {
    id: 'Incidencia',
    label: 'Incidencia',
    icon: 'fa-triangle-exclamation',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    accentBorder: 'border-l-rose-500',
    dotClass: 'bg-rose-500 ring-rose-200',
    pdfColor: [225, 29, 72]
  },
  {
    id: 'Cierre',
    label: 'Cierre',
    icon: 'fa-flag-checkered',
    badgeClass: 'bg-slate-200 text-slate-800 border-slate-400',
    accentBorder: 'border-l-slate-600',
    dotClass: 'bg-slate-600 ring-slate-200',
    pdfColor: [71, 85, 105]
  }
];

export const BITACORA_WEATHER_OPTIONS = [
  { id: 'Soleado', label: 'Soleado', icon: 'fa-sun', emoji: '☀️' },
  { id: 'Parcialmente Nublado', label: 'Parcialmente Nublado', icon: 'fa-cloud-sun', emoji: '⛅' },
  { id: 'Nublado', label: 'Nublado', icon: 'fa-cloud', emoji: '☁️' },
  { id: 'Lluvia Ligera', label: 'Lluvia Ligera', icon: 'fa-cloud-rain', emoji: '🌦️' },
  { id: 'Lluvia Fuerte', label: 'Lluvia Fuerte / Tormenta', icon: 'fa-cloud-showers-heavy', emoji: '⛈️' },
  { id: 'Viento Fuerte', label: 'Viento Fuerte', icon: 'fa-wind', emoji: '💨' },
  { id: 'Condiciones Adversas', label: 'Inhabitable / Suspensión', icon: 'fa-triangle-exclamation', emoji: '⚠️' }
];

export const BITACORA_SIGNER_ROLES = [
  'Residente de Obra',
  'Supervisor de Obra',
  'Superintendente de Construcción',
  'Director Responsable de Obra (DRO)',
  'Contratista / Representante Legal',
  'Coordinador de Obra'
];

export function getNoteTypeMeta(tipo) {
  return BITACORA_NOTE_TYPES.find(t => t.id === tipo) || BITACORA_NOTE_TYPES[3];
}

export function getWeatherMeta(clima) {
  return BITACORA_WEATHER_OPTIONS.find(w => w.id === clima) || BITACORA_WEATHER_OPTIONS[0];
}

export function getBitacoraStorageKey(projectId = null) {
  const pId = projectId || getActiveProjectId() || 'default';
  return `${STORAGE_KEY_PREFIX}${pId}`;
}

export function formatFolioCode(folioNum) {
  const n = Math.max(1, parseInt(folioNum, 10) || 1);
  return `#${String(n).padStart(3, '0')}`;
}

export function getDefaultBitacoraData() {
  const user = getCurrentUser();
  const sched = getScheduleSettings();
  return {
    config: {
      obraInicio: sched?.startDate || formatDate(new Date()),
      obraFinProgramada: '',
      contratoNumero: '',
      contratistaNombre: state.settings?.companyName || '',
      supervisionNombre: '',
      residenteDefault: user?.name || '',
      residenteCargoDefault: 'Residente de Obra',
      residenteCedulaDefault: '',
      climaHoy: 'Soleado',
      climaFecha: formatDate(new Date())
    },
    notes: []
  };
}

export function loadBitacoraData(projectId = null) {
  const defaults = getDefaultBitacoraData();
  try {
    const raw = localStorage.getItem(getBitacoraStorageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      const mergedConfig = Object.assign({}, defaults.config, parsed?.config || {});
      mergedConfig.driveConfig = Object.assign({}, defaults.config.driveConfig, parsed?.config?.driveConfig || {});
      return {
        config: mergedConfig,
        notes: Array.isArray(parsed?.notes) ? parsed.notes : []
      };
    }
  } catch (err) {
    console.warn('[BitacoraModel] Error al leer datos de bitácora:', err);
  }
  return defaults;
}

export function saveBitacoraData(data, projectId = null) {
  const defaults = getDefaultBitacoraData();
  const cleanNotes = (Array.isArray(data?.notes) ? data.notes : []).map((note) => {
    const next = { ...note };
    if (Array.isArray(next.evidencias)) {
      next.evidencias = stripInlineBinaryPayloads(next.evidencias);
    }
    if (next.pdfDoc && (next.pdfDoc.mediaId || next.pdfDoc.s3Key)) {
      const pdfCopy = { ...next.pdfDoc };
      delete pdfCopy.localDataUrl;
      next.pdfDoc = pdfCopy;
    }
    return next;
  });
  const clean = {
    config: Object.assign({}, defaults.config, data?.config || {}),
    notes: cleanNotes
  };
  try {
    localStorage.setItem(getBitacoraStorageKey(projectId), JSON.stringify(clean));
    scheduleBitacoraCloudSync(projectId);
  } catch (err) {
    console.error('[BitacoraModel] Error al guardar en localStorage (posible exceso de tamaño):', err);
    throw new Error('No se pudo guardar en almacenamiento local. Verifica el peso de las imágenes adjuntas.');
  }
  return clean;
}

export function getBitacoraConfig(projectId = null) {
  return loadBitacoraData(projectId).config;
}

export function updateBitacoraConfig(partialConfig, projectId = null) {
  const data = loadBitacoraData(projectId);
  data.config = Object.assign({}, data.config, partialConfig);
  saveBitacoraData(data, projectId);
  return data.config;
}

export function getBitacoraNotes(projectId = null) {
  return loadBitacoraData(projectId).notes || [];
}

export function getBitacoraNoteById(noteId, projectId = null) {
  if (!noteId) return null;
  const notes = getBitacoraNotes(projectId);
  return notes.find(n => n.id === noteId) || null;
}

export function getNextFolioNumber(notes = null) {
  const list = Array.isArray(notes) ? notes : getBitacoraNotes();
  const sealed = list.filter(n => n.estado === 'sealed' && Number.isFinite(Number(n.folioNumber)));
  if (sealed.length === 0) return 1;
  const maxNum = sealed.reduce((max, n) => Math.max(max, Number(n.folioNumber) || 0), 0);
  return maxNum + 1;
}

/**
 * Crear o actualizar una nota en estado BORRADOR.
 * Bloquea estrictamente cualquier intento de edición sobre una nota ya asentada ('sealed').
 */
export function saveBitacoraDraftNote(noteInput, projectId = null) {
  const data = loadBitacoraData(projectId);
  const user = getCurrentUser();
  const nowIso = new Date().toISOString();

  if (noteInput.id) {
    const idx = data.notes.findIndex(n => n.id === noteInput.id);
    if (idx >= 0) {
      const existing = data.notes[idx];
      if (existing.estado === 'sealed') {
        throw new Error('BLOQUEO LEGAL: Esta nota ya fue asentada y firmada. No puede modificarse; crea una nota de Aclaración / Fe de Erratas.');
      }

      const updated = Object.assign({}, existing, {
        tipo: noteInput.tipo || existing.tipo || 'Avance de Obra',
        fecha: noteInput.fecha || existing.fecha,
        hora: noteInput.hora || existing.hora,
        clima: noteInput.clima || existing.clima || 'Soleado',
        ubicacion: (noteInput.ubicacion ?? existing.ubicacion ?? '').trim(),
        conceptosVinculados: Array.isArray(noteInput.conceptosVinculados) ? noteInput.conceptosVinculados : (existing.conceptosVinculados || []),
        descripcion: (noteInput.descripcion ?? existing.descripcion ?? '').trim(),
        evidencias: Array.isArray(noteInput.evidencias) ? noteInput.evidencias : (existing.evidencias || []),
        notaReferenciaId: noteInput.notaReferenciaId ?? existing.notaReferenciaId ?? null,
        notaReferenciaFolio: noteInput.notaReferenciaFolio ?? existing.notaReferenciaFolio ?? '',
        esFeDeErratas: Boolean(noteInput.esFeDeErratas ?? existing.esFeDeErratas),
        estado: 'draft',
        actualizadoEn: nowIso
      });

      data.notes[idx] = updated;
      saveBitacoraData(data, projectId);
      return updated;
    }
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  const newNote = {
    id: `bit_note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    folioNumber: null,
    folioCode: 'BORRADOR',
    tipo: noteInput.tipo || 'Avance de Obra',
    estado: 'draft',
    fecha: noteInput.fecha || formatDate(now),
    hora: noteInput.hora || `${hh}:${mm}`,
    clima: noteInput.clima || data.config.climaHoy || 'Soleado',
    ubicacion: (noteInput.ubicacion || '').trim(),
    conceptosVinculados: Array.isArray(noteInput.conceptosVinculados) ? noteInput.conceptosVinculados : [],
    descripcion: (noteInput.descripcion || '').trim(),
    evidencias: Array.isArray(noteInput.evidencias) ? noteInput.evidencias : [],
    notaReferenciaId: noteInput.notaReferenciaId || null,
    notaReferenciaFolio: noteInput.notaReferenciaFolio || '',
    esFeDeErratas: Boolean(noteInput.esFeDeErratas),
    creadoPor: {
      name: user?.name || 'Residente de Obra',
      email: user?.email || ''
    },
    creadoEn: nowIso,
    actualizadoEn: nowIso,
    firma: null,
    pdfDoc: null
  };

  data.notes.push(newNote);
  saveBitacoraData(data, projectId);
  return newNote;
}

/**
 * Eliminar una nota únicamente si sigue en estado BORRADOR.
 */
export function deleteBitacoraDraftNote(noteId, projectId = null) {
  const data = loadBitacoraData(projectId);
  const target = data.notes.find(n => n.id === noteId);
  if (!target) return false;
  if (target.estado === 'sealed') {
    throw new Error('BLOQUEO LEGAL: No es posible eliminar una nota asentada y firmada.');
  }
  data.notes = data.notes.filter(n => n.id !== noteId);
  saveBitacoraData(data, projectId);
  return true;
}

/**
 * Calcular huella criptográfica determinística (SHA-256) para el sello legal de la nota.
 */
export async function computeNoteIntegrityHash(notePayload) {
  const canonical = JSON.stringify({
    folioCode: notePayload.folioCode,
    tipo: notePayload.tipo,
    fecha: notePayload.fecha,
    hora: notePayload.hora,
    clima: notePayload.clima,
    ubicacion: notePayload.ubicacion,
    descripcion: notePayload.descripcion,
    conceptos: (notePayload.conceptosVinculados || []).map(c => c.clave || c.id),
    evidencias: (notePayload.evidencias || []).map(e => `${e.fileName}:${e.caption || ''}`),
    autorNombre: notePayload.firma?.autorNombre || '',
    autorCedula: notePayload.firma?.autorCedula || '',
    firmadoEn: notePayload.firma?.firmadoEn || ''
  });

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
      const arr = Array.from(new Uint8Array(buf));
      return arr.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch (_) {}
  }

  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `BIT-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

/**
 * Sellar y firmar permanentemente una nota (pasa de 'draft' a 'sealed' de solo lectura).
 */
export function sealAndSignBitacoraNote(noteId, { firma, pdfDoc, evidenciasActualizadas = null }, projectId = null) {
  const data = loadBitacoraData(projectId);
  const idx = data.notes.findIndex(n => n.id === noteId);
  if (idx < 0) throw new Error('No se encontró la nota para asentar.');

  const existing = data.notes[idx];
  if (existing.estado === 'sealed') {
    throw new Error('Esta nota ya fue asentada previamente.');
  }

  const nextFolioNum = getNextFolioNumber(data.notes);
  const nextFolioCode = formatFolioCode(nextFolioNum);

  const sealedNote = Object.assign({}, existing, {
    folioNumber: nextFolioNum,
    folioCode: nextFolioCode,
    estado: 'sealed',
    evidencias: Array.isArray(evidenciasActualizadas) ? evidenciasActualizadas : existing.evidencias,
    firma: Object.assign({}, firma),
    pdfDoc: Object.assign({}, pdfDoc),
    sealedAt: firma?.firmadoEn || new Date().toISOString(),
    actualizadoEn: new Date().toISOString()
  });

  data.notes[idx] = sealedNote;

  // Recordar datos del último firmante como predeterminados para agilidad
  if (firma?.autorNombre) {
    data.config.residenteDefault = firma.autorNombre;
  }
  if (firma?.autorCargo) {
    data.config.residenteCargoDefault = firma.autorCargo;
  }
  if (firma?.autorCedula !== undefined) {
    data.config.residenteCedulaDefault = firma.autorCedula;
  }

  saveBitacoraData(data, projectId);
  return sealedNote;
}

/**
 * Actualizar únicamente los metadatos de sincronización en nube (AWS S3) en una nota ya sellada
 * (sin modificar jamás el contenido legal, folio, texto, fecha o firma).
 */
export function attachCloudArtifactsToSealedNote(noteId, { pdfDocPatch = null, evidenciasPatch = null }, projectId = null) {
  const data = loadBitacoraData(projectId);
  const idx = data.notes.findIndex(n => n.id === noteId);
  if (idx < 0) return null;

  const existing = data.notes[idx];
  const updated = Object.assign({}, existing);

  if (pdfDocPatch && existing.pdfDoc) {
    updated.pdfDoc = Object.assign({}, existing.pdfDoc, pdfDocPatch);
  }

  if (Array.isArray(evidenciasPatch) && Array.isArray(existing.evidencias)) {
    updated.evidencias = existing.evidencias.map(ev => {
      const match = evidenciasPatch.find(p => p.id === ev.id);
      if (!match) return ev;
      return Object.assign({}, ev, {
        mediaId: match.mediaId || ev.mediaId || '',
        archivoId: match.archivoId || ev.archivoId || '',
        s3Key: match.s3Key || ev.s3Key || '',
        cloudSynced: Boolean(match.cloudSynced ?? ev.cloudSynced),
        pendingSync: Boolean(match.pendingSync)
      });
    });
  }

  data.notes[idx] = updated;
  saveBitacoraData(data, projectId);
  return updated;
}

/**
 * Extraer lista plana de conceptos del Catálogo Base del proyecto para vincular en Bitácora.
 */
export function getCatalogConceptsForBitacora() {
  const concepts = [];
  function walk(nodes, pathParts = []) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(node => {
      if (!node) return;
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      if (hasChildren) {
        const label = node.clave ? `${node.clave} ${node.descripcion || ''}`.trim() : (node.descripcion || '');
        walk(node.children, [...pathParts, label]);
      } else {
        concepts.push({
          id: node.id,
          clave: node.clave || 'S/C',
          descripcion: node.descripcion || 'Concepto sin descripción',
          unidad: node.unidad || 'pza',
          cantidad: Number(node.cantidad) || 0,
          partidaPath: pathParts.join(' > ')
        });
      }
    });
  }
  walk(state.treeData || []);
  return concepts;
}

/**
 * Obtener resumen ejecutivo de tiempos de obra y métricas de bitácora.
 */
export function getBitacoraWorkSummary(projectId = null) {
  const data = loadBitacoraData(projectId);
  const notes = data.notes || [];
  const cfg = data.config || {};
  const schedCfg = getScheduleSettings();
  const projectObj = getProjectById(projectId || getActiveProjectId());

  let startDateStr = cfg.obraInicio || schedCfg?.startDate || formatDate(new Date());
  let endDateStr = cfg.obraFinProgramada || '';

  // Inferir fechas programadas del Calendario Gantt si existen actividades programadas
  try {
    const items = extractScheduleItems();
    const leafItems = (items || []).filter(i => !i.isGroup && i.startDate && i.endDate);
    if (leafItems.length > 0) {
      let minStart = leafItems[0].startDate;
      let maxEnd = leafItems[0].endDate;
      leafItems.forEach(it => {
        if (it.startDate < minStart) minStart = it.startDate;
        if (it.endDate > maxEnd) maxEnd = it.endDate;
      });
      if (!cfg.obraInicio) startDateStr = minStart;
      if (!cfg.obraFinProgramada) endDateStr = maxEnd;
    }
  } catch (_) {}

  const todayStr = formatDate(new Date());
  const startDt = parseDate(startDateStr);
  const todayDt = parseDate(todayStr);
  const elapsedRaw = diffDays(startDt, todayDt);
  const elapsedDays = Math.max(0, elapsedRaw + (elapsedRaw >= 0 ? 1 : 0));

  let totalProgrammedDays = 0;
  let remainingDays = null;
  let elapsedPercent = 0;

  if (endDateStr) {
    const endDt = parseDate(endDateStr);
    totalProgrammedDays = Math.max(1, diffDays(startDt, endDt) + 1);
    remainingDays = diffDays(todayDt, endDt);
    elapsedPercent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalProgrammedDays) * 100)));
  }

  const sealedNotes = notes.filter(n => n.estado === 'sealed').sort((a, b) => (a.folioNumber || 0) - (b.folioNumber || 0));
  const draftNotes = notes.filter(n => n.estado !== 'sealed');
  const incidentNotes = notes.filter(n => n.tipo === 'Incidencia' || n.tipo === 'Suspensión/Clima');
  const pendingCloudNotes = sealedNotes.filter(n =>
    n.pdfDoc?.pendingSync ||
    (n.pdfDoc && !n.pdfDoc.s3Key) ||
    (Array.isArray(n.evidencias) && n.evidencias.some(ev => ev.pendingSync || !ev.s3Key))
  );

  // Actualizar fecha de clima si cambió el día
  const climaHoy = (cfg.climaFecha === todayStr && cfg.climaHoy) ? cfg.climaHoy : (cfg.climaHoy || 'Soleado');

  return {
    projectName: state.settings?.projectName || projectObj?.projectName || 'Obra Sin Nombre',
    projectLocation: state.settings?.projectLocation || projectObj?.projectLocation || '',
    companyName: state.settings?.companyName || projectObj?.companyName || '',
    startDate: startDateStr,
    endDate: endDateStr,
    todayDate: todayStr,
    totalProgrammedDays,
    elapsedDays,
    remainingDays,
    elapsedPercent,
    climaHoy,
    totalNotes: notes.length,
    sealedCount: sealedNotes.length,
    draftCount: draftNotes.length,
    incidentCount: incidentNotes.length,
    pendingCloudSyncCount: pendingCloudNotes.length,
    lastFolioCode: sealedNotes.length > 0 ? sealedNotes[sealedNotes.length - 1].folioCode : '---',
    nextFolioCode: formatFolioCode(getNextFolioNumber(notes))
  };
}
