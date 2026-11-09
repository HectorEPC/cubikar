// js/modules/calendario/calendarioModel.js
// Modelo y cálculos del Calendario de Obra (Gantt, Flujo Financiero y Curva S)
// Sincronizado 100% con state.treeData del Catálogo Base

import { state, persistLocalData } from '../../state/store.js';
import { getActiveProjectId, getStorageKey } from '../../config/constants.js';
import { getHierarchyColor } from '../../core/colors.js';

// Colores modernos por partida para las barras del cronograma Gantt
export const PARTIDA_COLORS = [
  { bg: 'bg-blue-500', bar: '#3b82f6', border: 'border-blue-600', text: 'text-blue-700', light: 'bg-blue-50' },
  { bg: 'bg-emerald-500', bar: '#10b981', border: 'border-emerald-600', text: 'text-emerald-700', light: 'bg-emerald-50' },
  { bg: 'bg-violet-500', bar: '#8b5cf6', border: 'border-violet-600', text: 'text-violet-700', light: 'bg-violet-50' },
  { bg: 'bg-amber-500', bar: '#f59e0b', border: 'border-amber-600', text: 'text-amber-700', light: 'bg-amber-50' },
  { bg: 'bg-cyan-500', bar: '#06b6d4', border: 'border-cyan-600', text: 'text-cyan-700', light: 'bg-cyan-50' },
  { bg: 'bg-rose-500', bar: '#f43f5e', border: 'border-rose-600', text: 'text-rose-700', light: 'bg-rose-50' },
  { bg: 'bg-indigo-500', bar: '#6366f1', border: 'border-indigo-600', text: 'text-indigo-700', light: 'bg-indigo-50' },
  { bg: 'bg-teal-500', bar: '#14b8a6', border: 'border-teal-600', text: 'text-teal-700', light: 'bg-teal-50' },
  { bg: 'bg-orange-500', bar: '#f97316', border: 'border-orange-600', text: 'text-orange-700', light: 'bg-orange-50' },
  { bg: 'bg-fuchsia-500', bar: '#d946ef', border: 'border-fuchsia-600', text: 'text-fuchsia-700', light: 'bg-fuchsia-50' }
];

export function getPartidaColor(index = 0) {
  return PARTIDA_COLORS[index % PARTIDA_COLORS.length];
}

// ==========================================
// UTILIDADES DE FECHAS
// ==========================================
export function parseDate(str) {
  if (!str) return new Date();
  if (str instanceof Date) return isNaN(str.getTime()) ? new Date() : str;
  const parts = String(str).split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function formatDate(d) {
  if (!d) d = new Date();
  const dt = (d instanceof Date && !isNaN(d.getTime())) ? d : parseDate(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d, days) {
  const dt = parseDate(d);
  const res = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  res.setDate(res.getDate() + (parseInt(days, 10) || 0));
  return res;
}

export function diffDays(d1, d2) {
  const dt1 = parseDate(d1);
  const dt2 = parseDate(d2);
  const ms1 = Date.UTC(dt1.getFullYear(), dt1.getMonth(), dt1.getDate());
  const ms2 = Date.UTC(dt2.getFullYear(), dt2.getMonth(), dt2.getDate());
  return Math.round((ms2 - ms1) / (1000 * 60 * 60 * 24));
}

// Configuración persistente del calendario por proyecto
export function getScheduleSettings() {
  const defaults = {
    startDate: '2026-05-01',
    currentDate: 'auto', // 'auto' (hoy real diario) o fecha específica 'YYYY-MM-DD'
    scale: 'dias',       // 'dias' | 'semanas' | 'meses'
    viewMode: 'gantt',    // 'gantt' | 'financiero' | 'curva_s'
    selectedPartida: 'all',
    dayWidth: 34,
    panelWidth: 510,
    showCriticalPath: true,
    respectWorkdays: true,
    justifyConcepts: false
  };
  const key = 'calendario_cfg_' + (getActiveProjectId() || 'default');
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return Object.assign({}, defaults, parsed);
      }
    }
  } catch (e) {}

  return defaults;
}

// Obtener la fecha del día actual / corte (actualizada diariamente o desplazada por el usuario)
export function getGanttTodayDate() {
  const cfg = getScheduleSettings();
  if (cfg.currentDate && cfg.currentDate !== 'auto') {
    return cfg.currentDate;
  }
  return formatDate(new Date());
}

// Establecer fecha de corte desplazada (días anteriores o futuros)
export function setGanttTodayDate(newDateStr) {
  saveScheduleSettings({ currentDate: newDateStr });
  return newDateStr;
}

// Restablecer al día de hoy actual en tiempo real
export function resetGanttTodayDate() {
  saveScheduleSettings({ currentDate: 'auto' });
  return formatDate(new Date());
}

export function saveScheduleSettings(cfg) {
  const key = 'calendario_cfg_' + (getActiveProjectId() || 'default');
  try {
    const current = getScheduleSettings();
    const updated = Object.assign({}, current, cfg);
    localStorage.setItem(key, JSON.stringify(updated));
    return updated;
  } catch (e) {
    return cfg;
  }
}

// ==========================================
// CONFIGURACIÓN DE JORNADA LABORAL Y DÍAS INHÁBILES
// ==========================================

// Función auxiliar para obtener el n-ésimo día de la semana en un mes
function getNthDayOfWeekInMonth(year, month, dayOfWeek, n) {
  let count = 0;
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    if (d.getDay() === dayOfWeek) {
      count++;
      if (count === n) return d;
    }
    d.setDate(d.getDate() + 1);
  }
  return new Date(year, month, 1);
}

// Festivos Oficiales de Ley en México (LFT) calculados dinámicamente por año
export function getMexicanHolidaysForYear(year = 2026) {
  const y = parseInt(year, 10) || 2026;
  return [
    { date: `${y}-01-01`, name: 'Año Nuevo' },
    { date: formatDate(getNthDayOfWeekInMonth(y, 1, 1, 1)), name: 'Día de la Constitución Mexicana (5 Feb)' },
    { date: formatDate(getNthDayOfWeekInMonth(y, 2, 1, 3)), name: 'Natalicio de Benito Juárez (21 Mar)' },
    { date: `${y}-05-01`, name: 'Día del Trabajo' },
    { date: `${y}-09-16`, name: 'Día de la Independencia de México' },
    { date: formatDate(getNthDayOfWeekInMonth(y, 10, 1, 3)), name: 'Revolución Mexicana (20 Nov)' },
    { date: `${y}-12-25`, name: 'Navidad' }
  ];
}

// Configuración de jornada laboral, días festivos y lluvias persistente por proyecto
export function getWorkdaysSettings() {
  const key = 'calendario_workdays_' + (getActiveProjectId() || 'default');
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          nonWorkingDaysOfWeek: Array.isArray(parsed.nonWorkingDaysOfWeek) ? parsed.nonWorkingDaysOfWeek : [0],
          festivos: Array.isArray(parsed.festivos) ? parsed.festivos : getMexicanHolidaysForYear(2026),
          lluvias: Array.isArray(parsed.lluvias) ? parsed.lluvias : []
        };
      }
    }
  } catch (e) {}

  return {
    nonWorkingDaysOfWeek: [0], // 0: Domingo día de descanso semanal predeterminado
    festivos: getMexicanHolidaysForYear(2026),
    lluvias: []
  };
}

export function saveWorkdaysSettings(cfg) {
  const key = 'calendario_workdays_' + (getActiveProjectId() || 'default');
  try {
    const dataToSave = {
      nonWorkingDaysOfWeek: Array.isArray(cfg?.nonWorkingDaysOfWeek) ? cfg.nonWorkingDaysOfWeek : [0],
      festivos: Array.isArray(cfg?.festivos) ? cfg.festivos : [],
      lluvias: Array.isArray(cfg?.lluvias) ? cfg.lluvias : []
    };
    localStorage.setItem(key, JSON.stringify(dataToSave));
    return dataToSave;
  } catch (e) {
    return cfg;
  }
}

// Obtener estado laboral de una fecha específica
export function getDateWorkdayInfo(dateInput, workdaysCfg = null) {
  const dt = parseDate(dateInput);
  const dateStr = formatDate(dt);
  const dayOfWeek = dt.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  const cfg = workdaysCfg || getWorkdaysSettings();

  const isNonWorkingDayOfWeek = (cfg.nonWorkingDaysOfWeek || []).includes(dayOfWeek);

  const festivo = (cfg.festivos || []).find(f => f.date === dateStr);
  const isFestivo = !!festivo;
  const festivoName = festivo ? festivo.name : '';

  const lluvia = (cfg.lluvias || []).find(l => l.date === dateStr);
  const isLluvia = !!lluvia;
  const lluviaReason = lluvia ? (lluvia.reason || lluvia.name || 'Lluvia / Mal tiempo') : '';

  const isWorkingDay = !isNonWorkingDayOfWeek && !isFestivo && !isLluvia;

  let statusType = 'laboral';
  if (isLluvia) {
    statusType = 'lluvia';
  } else if (isFestivo) {
    statusType = 'festivo';
  } else if (isNonWorkingDayOfWeek) {
    statusType = 'descanso';
  }

  return {
    dateStr,
    dayOfWeek,
    isNonWorkingDayOfWeek,
    isFestivo,
    festivoName,
    isLluvia,
    lluviaReason,
    isWorkingDay,
    statusType
  };
}

// Calcular resumen estadístico de días en un rango de fechas
export function calculateWorkdaysSummary(startDate, endDate, workdaysCfg = null) {
  const dtStart = parseDate(startDate);
  const dtEnd = parseDate(endDate);
  const cfg = workdaysCfg || getWorkdaysSettings();

  if (dtEnd < dtStart) {
    return {
      totalNaturalDays: 0,
      workingDays: 0,
      weeklyRestDays: 0,
      festivosCount: 0,
      lluviasCount: 0,
      nonWorkingTotal: 0
    };
  }

  let totalNaturalDays = 0;
  let workingDays = 0;
  let weeklyRestDays = 0;
  let festivosCount = 0;
  let lluviasCount = 0;

  const curr = new Date(dtStart.getFullYear(), dtStart.getMonth(), dtStart.getDate());
  const limit = new Date(dtEnd.getFullYear(), dtEnd.getMonth(), dtEnd.getDate());

  while (curr <= limit) {
    totalNaturalDays++;
    const info = getDateWorkdayInfo(curr, cfg);
    if (info.isWorkingDay) {
      workingDays++;
    } else {
      if (info.isLluvia) {
        lluviasCount++;
      } else if (info.isFestivo) {
        festivosCount++;
      } else if (info.isNonWorkingDayOfWeek) {
        weeklyRestDays++;
      }
    }
    curr.setDate(curr.getDate() + 1);
  }

  return {
    totalNaturalDays,
    workingDays,
    weeklyRestDays,
    festivosCount,
    lluviasCount,
    nonWorkingTotal: totalNaturalDays - workingDays
  };
}

// ==========================================
// EXTRACCIÓN Y SINCRONIZACIÓN DE CONCEPTOS
// ==========================================
export function extractScheduleItems(tree = state.treeData) {
  const items = [];
  let rootPartidaIndex = 0;

  function walk(nodes, parentItem = null, level = 1, currentPartidaColor = null, activeHexColor = null, depthOffset = 0) {
    if (!Array.isArray(nodes)) return;

    nodes.forEach(node => {
      // Garantizar que el nodo tenga id único
      if (!node.id) {
        node.id = '_' + Math.random().toString(36).substr(2, 9);
      }

      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const cant = Math.round(((Number(node.cantidad) || 0) + Number.EPSILON) * 100) / 100;
      const pu = Math.round(((Number(node.precioUnitario) || 0) + Number.EPSILON) * 100) / 100;
      const imp = hasChildren ? 0 : Math.round(((cant * pu) + Number.EPSILON) * 100) / 100;

      let color = currentPartidaColor;
      if (level === 1) {
        color = getPartidaColor(rootPartidaIndex++);
      } else if (!color) {
        color = getPartidaColor(0);
      }

      // Cálculo de color jerárquico idéntico a Catálogo Base (catalogView.js)
      let currentHexColor = activeHexColor;
      let currentOffset = depthOffset;
      if (node.color) {
        currentHexColor = node.color;
        currentOffset = 0;
      } else if (activeHexColor) {
        currentOffset = depthOffset + 1;
      }
      const rowBgColor = currentHexColor ? getHierarchyColor(currentHexColor, currentOffset) : '';

      // Determinar tipo: Si tiene hijos es partida o subpartida según nivel. Si no, es concepto.
      const tipo = hasChildren ? (level === 1 ? 'partida' : 'subpartida') : 'concepto';

      // expanded por defecto es true si no está explícitamente en false
      const expanded = node.expanded !== false;

      // Lista de ancestros para cálculo de visibilidad jerárquica
      const ancestorIds = parentItem ? [...parentItem.ancestorIds, parentItem.id] : [];
      const parentPartidaName = level === 1 ? node.descripcion : (parentItem ? parentItem.parentPartidaName : '');

      const rawPreds = Array.isArray(node.schedule?.predecessors)
        ? node.schedule.predecessors.map(p => String(p)).filter(Boolean)
        : [];

      const item = {
        node,
        id: String(node.id),
        tipo,
        isParent: hasChildren,
        level,
        clave: node.clave || '',
        descripcion: node.descripcion || '',
        unidad: hasChildren ? 'lote' : (node.unidad || 'pza'),
        cantidad: cant,
        precioUnitario: pu,
        importe: imp,
        color,
        rowBgColor,
        customColor: currentHexColor || '',
        expanded,
        parentId: parentItem ? parentItem.id : null,
        parentPartidaName: parentPartidaName || '',
        ancestorIds,
        childrenCount: hasChildren ? node.children.length : 0,
        descendantConceptCount: 0,
        totalImporte: imp,
        startDate: node.schedule?.startDate || '',
        endDate: node.schedule?.endDate || '',
        durationDays: node.schedule?.durationDays || 0,
        predecessors: hasChildren ? [] : rawPreds,
        minAllowedStartDate: '',
        blockingClaves: [],
        slackDays: 0,
        isCritical: false,
        criticalSuccIds: [],
        hasCriticalChildren: false
      };

      items.push(item);

      if (hasChildren) {
        walk(node.children, item, level + 1, color, currentHexColor, currentOffset);
      }
    });
  }

  walk(tree, null, 1, null, null, 0);

  // Calcular totales acumulados y conteos de conceptos descendientes para cada partida / subpartida
  items.forEach(item => {
    if (item.isParent) {
      const descendants = items.filter(other => !other.isParent && other.ancestorIds.includes(item.id));
      item.descendantConceptCount = descendants.length;
      item.totalImporte = Math.round((descendants.reduce((sum, d) => sum + (d.importe || 0), 0) + Number.EPSILON) * 100) / 100;
    }
  });

  return items;
}

// ==========================================
// MOTOR DE DEPENDENCIAS FIN-A-INICIO Y RUTA CRÍTICA (CPM)
// ==========================================

// Avanza al siguiente día laborable si respectWorkdays está activo (con guarda de seguridad contra bucles)
export function getNextWorkingDate(dateInput, workdaysCfg = null, respectWorkdays = true) {
  let cur = parseDate(dateInput);
  cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
  if (!respectWorkdays) return cur;

  const cfg = workdaysCfg || getWorkdaysSettings();
  let safety = 0;
  while (safety < 45) {
    const info = getDateWorkdayInfo(cur, cfg);
    if (info.isWorkingDay) break;
    cur = addDays(cur, 1);
    safety++;
  }
  return cur;
}

// Cuenta días hábiles efectivos entre dos fechas inclusive
export function countWorkingDaysInclusive(startDt, endDt, workdaysCfg = null, respectWorkdays = true) {
  const s = parseDate(startDt);
  const e = parseDate(endDt);
  const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const limit = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  if (cur > limit) return 0;
  if (!respectWorkdays) return diffDays(cur, limit) + 1;

  const cfg = workdaysCfg || getWorkdaysSettings();
  let count = 0;
  while (cur <= limit) {
    if (getDateWorkdayInfo(cur, cfg).isWorkingDay) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Detecta si vincular candidatePredId como predecesora de targetId formaría un ciclo
export function wouldCreateScheduleCycle(targetId, candidatePredId, items = null) {
  const tId = String(targetId || '');
  const pId = String(candidatePredId || '');
  if (!tId || !pId) return false;
  if (tId === pId) return true;

  const allItems = items || extractScheduleItems(state.treeData);
  const byId = new Map();
  allItems.forEach(it => {
    if (it.tipo === 'concepto') byId.set(String(it.id), it);
  });

  const visited = new Set();
  const stack = [pId];
  while (stack.length > 0) {
    const currId = stack.pop();
    if (currId === tId) return true;
    if (visited.has(currId)) continue;
    visited.add(currId);
    const nodeItem = byId.get(currId);
    const preds = nodeItem
      ? (Array.isArray(nodeItem.predecessors) ? nodeItem.predecessors : (nodeItem.node?.schedule?.predecessors || []))
      : [];
    preds.forEach(nextPred => stack.push(String(nextPred)));
  }
  return false;
}

// Recalcula cascada Fin-a-Inicio (Forward Pass) y Ruta Crítica / Holguras (Backward Pass)
export function recalculateScheduleCPM(items, options = {}) {
  const cfg = getScheduleSettings();
  const respectWorkdays = options.respectWorkdays !== undefined
    ? Boolean(options.respectWorkdays)
    : (cfg.respectWorkdays !== false);
  const workdaysCfg = options.workdaysCfg || getWorkdaysSettings();

  const concepts = items.filter(it => it.tipo === 'concepto');
  if (concepts.length === 0) {
    computeAggregatedDates(items);
    return { totalConcepts: 0, criticalCount: 0, linkedCount: 0 };
  }

  const byId = new Map();
  const byClave = new Map();
  concepts.forEach(c => {
    byId.set(String(c.id), c);
    if (c.clave) byClave.set(String(c.clave), c);
  });

  // Normalizar predecesoras válidas y sin auto-referencias ni ciclos
  const sanitizedMap = new Map();
  concepts.forEach(c => {
    const rawPreds = Array.isArray(c.node?.schedule?.predecessors)
      ? c.node.schedule.predecessors
      : (Array.isArray(c.predecessors) ? c.predecessors : []);
    const clean = [];
    rawPreds.forEach(rawId => {
      const target = byId.get(String(rawId)) || byClave.get(String(rawId));
      if (!target || String(target.id) === String(c.id)) return;
      if (clean.includes(String(target.id))) return;
      clean.push(String(target.id));
    });
    sanitizedMap.set(String(c.id), clean);
  });

  // Eliminar cualquier ciclo accidental preservando enlaces previos válidos
  const activeGraph = new Map();
  concepts.forEach(c => activeGraph.set(String(c.id), []));

  function createsCycleInActiveGraph(targetId, predId) {
    if (targetId === predId) return true;
    const vis = new Set();
    const st = [predId];
    while (st.length > 0) {
      const cur = st.pop();
      if (cur === targetId) return true;
      if (vis.has(cur)) continue;
      vis.add(cur);
      (activeGraph.get(cur) || []).forEach(p => st.push(p));
    }
    return false;
  }

  concepts.forEach(c => {
    const cid = String(c.id);
    const candidateList = sanitizedMap.get(cid) || [];
    const safeList = [];
    candidateList.forEach(pid => {
      if (!createsCycleInActiveGraph(cid, pid)) {
        safeList.push(pid);
        activeGraph.set(cid, [...safeList]);
      }
    });
    c.predecessors = safeList;
    if (!c.node.schedule) c.node.schedule = {};
    c.node.schedule.predecessors = [...safeList];
  });

  // 1. FORWARD PASS: Empuje automático Fin-a-Inicio en cascada
  const resolvedEarly = new Set();
  const visitingEarly = new Set();
  let cascadedChanges = 0;

  function resolveEarly(c) {
    const cid = String(c.id);
    if (resolvedEarly.has(cid) || visitingEarly.has(cid)) return;
    visitingEarly.add(cid);

    const dur = Math.max(3, parseInt(c.node.schedule?.durationDays || c.durationDays, 10) || 3);
    const preds = c.predecessors || [];

    if (preds.length > 0) {
      let maxPredEndDt = null;
      preds.forEach(pid => {
        const pItem = byId.get(pid);
        if (pItem) {
          resolveEarly(pItem);
          const pEnd = parseDate(pItem.endDate);
          if (!maxPredEndDt || pEnd > maxPredEndDt) {
            maxPredEndDt = pEnd;
          }
        }
      });

      if (maxPredEndDt) {
        const maxPredEndStr = formatDate(maxPredEndDt);
        const blockingClaves = preds
          .map(pid => byId.get(pid))
          .filter(p => p && p.endDate === maxPredEndStr)
          .map(p => p.clave || 'CONC');

        const minStartDt = getNextWorkingDate(addDays(maxPredEndDt, 1), workdaysCfg, respectWorkdays);
        const minStartStr = formatDate(minStartDt);
        c.minAllowedStartDate = minStartStr;
        c.blockingClaves = blockingClaves;

        const lagDays = Math.max(0, parseInt(c.node.schedule?.lagDays, 10) || 0);
        const effectiveStartDt = lagDays > 0
          ? getNextWorkingDate(addDays(minStartDt, lagDays), workdaysCfg, respectWorkdays)
          : minStartDt;
        const effectiveStartStr = formatDate(effectiveStartDt);
        const effectiveEndStr = formatDate(addDays(effectiveStartDt, dur - 1));

        if (c.node.schedule.startDate !== effectiveStartStr || c.node.schedule.endDate !== effectiveEndStr) {
          cascadedChanges++;
        }

        c.node.schedule.startDate = effectiveStartStr;
        c.node.schedule.endDate = effectiveEndStr;
        c.node.schedule.durationDays = dur;
        c.startDate = effectiveStartStr;
        c.endDate = effectiveEndStr;
        c.durationDays = dur;
      }
    } else {
      c.minAllowedStartDate = '';
      c.blockingClaves = [];
      const sDt = parseDate(c.node.schedule.startDate || cfg.startDate || '2026-05-01');
      const eDt = addDays(sDt, dur - 1);
      c.node.schedule.startDate = formatDate(sDt);
      c.node.schedule.endDate = formatDate(eDt);
      c.node.schedule.durationDays = dur;
      c.startDate = c.node.schedule.startDate;
      c.endDate = c.node.schedule.endDate;
      c.durationDays = dur;
    }

    c.schedule = c.node.schedule;
    visitingEarly.delete(cid);
    resolvedEarly.add(cid);
  }

  concepts.forEach(c => resolveEarly(c));

  // 2. BACKWARD PASS: Cálculo de Holguras (Slack) y Ruta Crítica
  let projectMaxEndDt = null;
  concepts.forEach(c => {
    const eDt = parseDate(c.endDate);
    if (!projectMaxEndDt || eDt > projectMaxEndDt) {
      projectMaxEndDt = eDt;
    }
  });
  if (!projectMaxEndDt) projectMaxEndDt = parseDate(cfg.startDate || '2026-05-01');

  const succMap = new Map();
  concepts.forEach(c => succMap.set(String(c.id), []));
  concepts.forEach(c => {
    (c.predecessors || []).forEach(pid => {
      if (succMap.has(pid)) succMap.get(pid).push(c);
    });
  });

  function getLinkFreeFloatDays(predEndStr, succStartStr) {
    const gapStart = addDays(predEndStr, 1);
    const gapEnd = addDays(succStartStr, -1);
    if (gapStart > gapEnd) return 0;
    return countWorkingDaysInclusive(gapStart, gapEnd, workdaysCfg, respectWorkdays);
  }

  const resolvedLate = new Set();
  const visitingLate = new Set();

  function resolveLate(c) {
    const cid = String(c.id);
    if (resolvedLate.has(cid) || visitingLate.has(cid)) return;
    visitingLate.add(cid);

    const succs = succMap.get(cid) || [];
    if (succs.length === 0) {
      const calDiff = diffDays(c.endDate, projectMaxEndDt);
      if (calDiff <= 0) {
        c.slackDays = 0;
      } else {
        const wFloat = countWorkingDaysInclusive(addDays(c.endDate, 1), projectMaxEndDt, workdaysCfg, respectWorkdays);
        c.slackDays = Math.max(1, wFloat);
      }
      c.criticalSuccIds = [];
    } else {
      let minTotalFloat = Infinity;
      succs.forEach(s => {
        resolveLate(s);
        const linkFloat = getLinkFreeFloatDays(c.endDate, s.startDate);
        const candidateFloat = linkFloat + (s.slackDays || 0);
        if (candidateFloat < minTotalFloat) {
          minTotalFloat = candidateFloat;
        }
      });
      c.slackDays = Math.max(0, isFinite(minTotalFloat) ? minTotalFloat : 0);
      c.criticalSuccIds = [];
    }

    c.isCritical = (c.slackDays === 0);
    visitingLate.delete(cid);
    resolvedLate.add(cid);
  }

  concepts.forEach(c => resolveLate(c));

  // Marcar enlaces críticos exactos (flechas rojas de Ruta Crítica)
  concepts.forEach(c => {
    const succs = succMap.get(String(c.id)) || [];
    c.criticalSuccIds = succs
      .filter(s => c.isCritical && s.isCritical && getLinkFreeFloatDays(c.endDate, s.startDate) === 0)
      .map(s => String(s.id));
  });

  // Actualizar fechas agregadas y bandera crítica en partidas padre
  computeAggregatedDates(items);

  const criticalCount = concepts.filter(c => c.isCritical).length;
  const linkedCount = concepts.filter(c => c.predecessors && c.predecessors.length > 0).length;

  return {
    totalConcepts: concepts.length,
    criticalCount,
    linkedCount,
    cascadedChanges,
    projectEndDate: formatDate(projectMaxEndDt)
  };
}

// Asegurar fechas iniciales lógicas en los conceptos si aún no tienen y recalcular CPM
export function ensureInitialDates(items, projectStartDateStr = '2026-05-01') {
  let currDate = parseDate(projectStartDateStr);
  let conceptIndex = 0;

  items.forEach(item => {
    if (item.tipo === 'concepto') {
      const node = item.node;
      if (!node.schedule) {
        node.schedule = {};
      }
      if (!Array.isArray(node.schedule.predecessors)) {
        node.schedule.predecessors = [];
      }

      if (!node.schedule.startDate) {
        const imp = item.importe || 0;
        let dur = Math.max(3, Math.min(25, Math.round(imp / 8000)));
        if (isNaN(dur) || dur < 3) dur = 3;

        const offsetDays = conceptIndex * 2;
        const sDate = addDays(currDate, offsetDays);
        const eDate = addDays(sDate, dur - 1);

        node.schedule.startDate = formatDate(sDate);
        node.schedule.endDate = formatDate(eDate);
        node.schedule.durationDays = dur;
        node.schedule.isManual = false;
        node.schedule.periods = {};
        conceptIndex++;
      } else {
        const s = parseDate(node.schedule.startDate);
        const e = parseDate(node.schedule.endDate || node.schedule.startDate);
        let dur = Math.max(3, diffDays(s, e) + 1);
        node.schedule.durationDays = dur;
        node.schedule.endDate = formatDate(addDays(s, dur - 1));
      }

      item.predecessors = [...node.schedule.predecessors];
      item.startDate = node.schedule.startDate;
      item.endDate = node.schedule.endDate;
      item.durationDays = node.schedule.durationDays;
      item.schedule = node.schedule;
    }
  });

  // Recalcular dependencias Fin-a-Inicio, Ruta Crítica y fechas agregadas de partidas
  recalculateScheduleCPM(items);
}

// Calcula las fechas mínimas y máximas para partidas / subpartidas
export function computeAggregatedDates(items) {
  items.forEach(parentItem => {
    if (parentItem.isParent) {
      const descendants = items.filter(other => !other.isParent && other.ancestorIds.includes(parentItem.id));
      let minDate = null;
      let maxDate = null;
      let sumImp = 0;
      let anyCritical = false;

      descendants.forEach(d => {
        sumImp += (d.importe || 0);
        if (d.isCritical) anyCritical = true;
        if (d.startDate && d.endDate) {
          const s = parseDate(d.startDate);
          const e = parseDate(d.endDate);
          if (!minDate || s < minDate) minDate = s;
          if (!maxDate || e > maxDate) maxDate = e;
        }
      });

      parentItem.totalImporte = Math.round((sumImp + Number.EPSILON) * 100) / 100;
      parentItem.hasCriticalChildren = anyCritical;
      if (minDate && maxDate) {
        parentItem.startDate = formatDate(minDate);
        parentItem.endDate = formatDate(maxDate);
        parentItem.durationDays = Math.max(1, diffDays(minDate, maxDate) + 1);
      } else {
        parentItem.startDate = '';
        parentItem.endDate = '';
        parentItem.durationDays = 0;
      }
    }
  });
}

// Determinar si un elemento es visible según el estado colapsado/expandido de sus ancestros
export function isItemVisible(item, allItems) {
  if (!item.ancestorIds || item.ancestorIds.length === 0) return true;
  for (const aId of item.ancestorIds) {
    const parentItem = allItems.find(it => String(it.id) === String(aId));
    if (parentItem && parentItem.node && parentItem.node.expanded === false) {
      return false;
    }
  }
  return true;
}

// Alternar agrupar/desagrupar de un nodo específico
export function toggleCalendarioNodeExpand(nodeId) {
  function findAndToggle(nodes) {
    if (!Array.isArray(nodes)) return false;
    for (const n of nodes) {
      if (String(n.id) === String(nodeId)) {
        n.expanded = (n.expanded === false) ? true : false;
        return true;
      }
      if (Array.isArray(n.children) && findAndToggle(n.children)) {
        return true;
      }
    }
    return false;
  }

  const res = findAndToggle(state.treeData);
  if (res) {
    persistLocalData(true);
  }
  return res;
}

// Desagrupar (expandir) todos los grupos del catálogo
export function expandAllCalendarioNodes() {
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (Array.isArray(n.children) && n.children.length > 0) {
        n.expanded = true;
        walk(n.children);
      }
    });
  }
  walk(state.treeData);
  persistLocalData(true);
}

// Agrupar (colapsar) todos los grupos del catálogo
export function collapseAllCalendarioNodes() {
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (Array.isArray(n.children) && n.children.length > 0) {
        n.expanded = false;
        walk(n.children);
      }
    });
  }
  walk(state.treeData);
  persistLocalData(true);
}

// ==========================================
// GENERACIÓN DE PERÍODOS TEMPORALES
// ==========================================
export function generateTimePeriods(items, scale = 'meses', customStart = null) {
  // Encontrar rango general de fechas de la obra
  let minDate = customStart ? parseDate(customStart) : null;
  let maxDate = null;

  items.forEach(item => {
    if (item.tipo === 'concepto' && item.startDate && item.endDate) {
      const s = parseDate(item.startDate);
      const e = parseDate(item.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });

  if (!minDate) minDate = parseDate('2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const periods = [];

  if (scale === 'meses') {
    // Generar mes a mes desde minDate hasta maxDate
    let curr = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const endLimit = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);

    let periodIndex = 1;
    const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    while (curr <= endLimit) {
      const y = curr.getFullYear();
      const m = curr.getMonth();
      const pStart = new Date(y, m, 1);
      const pEnd = new Date(y, m + 1, 0); // último día del mes
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;

      const short3 = MONTH_NAMES[m].slice(0, 3).toUpperCase();
      const yearShort = `'${String(y).slice(-2)}`;

      periods.push({
        key,
        index: periodIndex,
        label: `${MONTH_NAMES[m]} ${y}`,
        fullLabel: `Mes ${periodIndex}: ${MONTH_FULL[m]} ${y}`,
        shortLabel: `${short3} ${yearShort}`,
        startDate: pStart,
        endDate: pEnd,
        days: pEnd.getDate()
      });

      curr.setMonth(curr.getMonth() + 1);
      periodIndex++;
    }
  } else if (scale === 'semanas') {
    // Generar semana a semana (7 días)
    let curr = new Date(minDate);
    let weekIndex = 1;

    while (curr <= maxDate || weekIndex <= 4) {
      const pStart = new Date(curr);
      const pEnd = addDays(pStart, 6);
      const key = `W${weekIndex}_${formatDate(pStart)}`;

      const startLabel = `${String(pStart.getDate()).padStart(2, '0')}/${String(pStart.getMonth() + 1).padStart(2, '0')}`;
      const endLabel = `${String(pEnd.getDate()).padStart(2, '0')}/${String(pEnd.getMonth() + 1).padStart(2, '0')}`;

      periods.push({
        key,
        index: weekIndex,
        label: `Sem ${weekIndex} (${startLabel})`,
        fullLabel: `Semana ${weekIndex}: ${startLabel} al ${endLabel}`,
        shortLabel: `S${weekIndex}`,
        startDate: pStart,
        endDate: pEnd,
        days: 7
      });

      curr = addDays(curr, 7);
      weekIndex++;
      if (weekIndex > 52) break; // Límite de seguridad
    }
  } else {
    // Escala por Días (muestra hasta 60 días o días de ejecución)
    let curr = new Date(minDate);
    let dayIndex = 1;
    const totalDays = Math.min(90, Math.max(15, diffDays(minDate, maxDate) + 1));

    for (let i = 0; i < totalDays; i++) {
      const pStart = new Date(curr);
      const pEnd = new Date(curr);
      const key = formatDate(pStart);
      const dateLabel = `${String(pStart.getDate()).padStart(2, '0')}/${String(pStart.getMonth() + 1).padStart(2, '0')}`;

      periods.push({
        key,
        index: dayIndex,
        label: dateLabel,
        fullLabel: `Día ${dayIndex}: ${formatDate(pStart)}`,
        shortLabel: `${pStart.getDate()}`,
        startDate: pStart,
        endDate: pEnd,
        days: 1
      });

      curr = addDays(curr, 1);
      dayIndex++;
    }
  }

  return periods;
}

// ==========================================
// GENERACIÓN DE ESCALAS TEMPORALES PARA EL GANTT (DÍAS, SEMANAS, MESES)
// ==========================================
export function generateGanttTimeScale(minDate, maxDate, scale = 'dias', baseDayWidth = 34) {
  const dStart = parseDate(minDate);
  const dEnd = parseDate(maxDate);

  // Normalizar rango: inicio en el primer día del mes inicial, fin en el último día del mes final
  const timelineStart = new Date(dStart.getFullYear(), dStart.getMonth(), 1);
  const timelineEnd = new Date(dEnd.getFullYear(), dEnd.getMonth() + 1, 0);

  const totalDays = Math.max(1, diffDays(timelineStart, timelineEnd) + 1);

  // Proporción de píxeles por día según escala seleccionada
  let pxPerDay;
  if (scale === 'dias') {
    pxPerDay = Math.max(16, baseDayWidth || 34);
  } else if (scale === 'semanas') {
    // Escala semanas: cada semana de 7 días mide ~90-120px para ser legible con "Semana 1, 2, 3, 4"
    pxPerDay = Math.max(10, Math.round((baseDayWidth || 34) * 0.45));
  } else {
    // Escala meses: cada mes mide ~120-180px para ver el horizonte completo con nombre de mes
    pxPerDay = Math.max(3, Math.round((baseDayWidth || 34) * 0.16));
  }

  const totalTimelineWidth = Math.max(800, totalDays * pxPerDay);

  const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const MONTH_SHORT = [
    'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
    'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'
  ];

  const monthGroups = [];
  let currMonth = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);

  while (currMonth <= timelineEnd) {
    const y = currMonth.getFullYear();
    const m = currMonth.getMonth();
    const mStart = new Date(y, m, 1);
    const mEnd = new Date(y, m + 1, 0);
    const daysInMonth = mEnd.getDate();
    const mWidth = daysInMonth * pxPerDay;
    const short3 = MONTH_SHORT[m];
    const yearShort = `'${String(y).slice(-2)}`;

    // Generar semanas del mes (Semana 1, Semana 2, Semana 3, Semana 4, Semana 5)
    const weeks = [];
    let dCur = 1;
    let wNum = 1;
    while (dCur <= daysInMonth) {
      const sDay = dCur;
      const eDay = Math.min(daysInMonth, dCur + 6);
      const wDays = eDay - sDay + 1;
      const wWidth = wDays * pxPerDay;

      weeks.push({
        num: wNum,
        label: `Semana ${wNum}`,
        shortLabel: `Sem ${wNum}`,
        ultraShortLabel: `S${wNum}`,
        rangeLabel: `${sDay} al ${eDay}`,
        shortRange: `${sDay}-${eDay}`,
        daysCount: wDays,
        widthPx: wWidth
      });

      dCur += 7;
      wNum++;
    }

    monthGroups.push({
      key: `${y}-${m}`,
      label: `${MONTH_NAMES[m]} ${y}`,
      shortLabel: `${short3} ${y}`,
      shortWithYear: `${short3} ${yearShort}`,
      short3,
      monthName: MONTH_NAMES[m],
      year: y,
      yearShort,
      startDate: mStart,
      endDate: mEnd,
      daysCount: daysInMonth,
      widthPx: mWidth,
      weeks
    });

    currMonth.setMonth(currMonth.getMonth() + 1);
  }

  // Generar lista de días (utilizada principalmente en la escala 'dias')
  const workdaysCfg = getWorkdaysSettings();
  const days = [];
  let currDay = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), timelineStart.getDate());
  const endLimit = new Date(timelineEnd.getFullYear(), timelineEnd.getMonth(), timelineEnd.getDate());

  while (currDay <= endLimit) {
    const d = currDay.getDate();
    const dayOfWeek = currDay.getDay();
    const letter = DAY_LETTERS[dayOfWeek];
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const dateStr = formatDate(currDay);
    const wInfo = getDateWorkdayInfo(currDay, workdaysCfg);

    days.push({
      dateStr,
      dayNum: d,
      letter,
      isWeekend,
      dayOfWeek,
      monthKey: `${currDay.getFullYear()}-${currDay.getMonth()}`,
      isNonWorkingDayOfWeek: wInfo.isNonWorkingDayOfWeek,
      isFestivo: wInfo.isFestivo,
      festivoName: wInfo.festivoName,
      isLluvia: wInfo.isLluvia,
      lluviaName: wInfo.lluviaReason,
      isWorkingDay: wInfo.isWorkingDay,
      statusType: wInfo.statusType
    });

    currDay.setDate(currDay.getDate() + 1);
  }

  return {
    timelineStart,
    timelineEnd,
    scale,
    pxPerDay,
    totalTimelineWidth,
    monthGroups,
    days
  };
}

// Compatibilidad hacia atrás para 3 niveles en escala días
export function generateGanttDays(minDate, maxDate) {
  const s = generateGanttTimeScale(minDate, maxDate, 'dias', 34);
  return {
    timelineStart: s.timelineStart,
    timelineEnd: s.timelineEnd,
    days: s.days,
    monthGroups: s.monthGroups
  };
}

// ==========================================
// CÁLCULO DE DISTRIBUCIÓN POR PERÍODO
// ==========================================
export function calculateScheduleDistribution(items, periods) {
  // Inicializar totales de períodos
  const periodTotals = {};
  periods.forEach(p => {
    periodTotals[p.key] = {
      importe: 0,
      pctPeriodo: 0,
      importeAcumulado: 0,
      pctAcumulado: 0
    };
  });

  let grandTotalObra = 0;

  // Calcular distribución para cada concepto
  items.forEach(item => {
    if (item.tipo !== 'concepto') return;

    grandTotalObra = Math.round(((grandTotalObra + (item.importe || 0)) + Number.EPSILON) * 100) / 100;

    const s = parseDate(item.startDate);
    const e = parseDate(item.endDate);
    const totalDays = Math.max(1, diffDays(s, e) + 1);

    item.periodData = {};

    periods.forEach(p => {
      // Si el concepto tiene valores manuales guardados para este período
      if (item.schedule && item.schedule.isManual && item.schedule.periods && item.schedule.periods[p.key] !== undefined) {
        const man = item.schedule.periods[p.key];
        const cant = Number(man.cantidad) || 0;
        const imp = Number(man.importe) || (cant * (item.precioUnitario || 0));
        const pct = item.importe > 0 ? (imp / item.importe) * 100 : 0;

        item.periodData[p.key] = {
          cantidad: cant,
          importe: imp,
          pct: pct,
          overlapDays: 0,
          isManual: true
        };
        periodTotals[p.key].importe += imp;
      } else {
        // Distribución automática proporcional a los días de solapamiento
        const overlapStart = s > p.startDate ? s : p.startDate;
        const overlapEnd = e < p.endDate ? e : p.endDate;
        const overlapDays = Math.max(0, diffDays(overlapStart, overlapEnd) + 1);

        if (overlapDays > 0 && totalDays > 0) {
          const ratio = Math.min(1, overlapDays / totalDays);
          const cant = (item.cantidad || 0) * ratio;
          const imp = (item.importe || 0) * ratio;
          const pct = ratio * 100;

          item.periodData[p.key] = {
            cantidad: cant,
            importe: imp,
            pct: pct,
            overlapDays,
            isManual: false
          };
          periodTotals[p.key].importe += imp;
        } else {
          item.periodData[p.key] = {
            cantidad: 0,
            importe: 0,
            pct: 0,
            overlapDays: 0,
            isManual: false
          };
        }
      }
    });
  });

  // Calcular porcentajes y acumulados de la obra
  let accImporte = 0;
  let picoPeriod = null;
  let picoMonto = -1;

  periods.forEach(p => {
    const tot = periodTotals[p.key];
    tot.pctPeriodo = grandTotalObra > 0 ? (tot.importe / grandTotalObra) * 100 : 0;
    accImporte += tot.importe;
    tot.importeAcumulado = accImporte;
    tot.pctAcumulado = grandTotalObra > 0 ? (accImporte / grandTotalObra) * 100 : 0;

    if (tot.importe > picoMonto) {
      picoMonto = tot.importe;
      picoPeriod = p;
    }
  });

  // Calcular agregados de períodos para partidas y subpartidas a partir de sus conceptos descendientes
  items.forEach(parentItem => {
    if (parentItem.isParent) {
      parentItem.periodData = {};
      periods.forEach(p => {
        parentItem.periodData[p.key] = { cantidad: 0, importe: 0, pct: 0 };
      });

      const descendants = items.filter(other => !other.isParent && other.ancestorIds.includes(parentItem.id));
      descendants.forEach(d => {
        periods.forEach(p => {
          const val = d.periodData ? d.periodData[p.key] : null;
          if (val && val.importe > 0) {
            parentItem.periodData[p.key].importe += val.importe;
          }
        });
      });

      if (parentItem.totalImporte > 0) {
        periods.forEach(p => {
          const d = parentItem.periodData[p.key];
          d.pct = (d.importe / parentItem.totalImporte) * 100;
        });
      }
    }
  });

  return {
    items,
    periods,
    periodTotals,
    grandTotalObra,
    picoPeriod,
    picoMonto
  };
}

// ==========================================
// HISTORIAL DE DESHACER (UNDO) Y REHACER (REDO) DE PROGRAMACIÓN DE OBRA
// ==========================================
const MAX_SCHEDULE_HISTORY = 40;
const scheduleUndoStacksByProject = new Map();
const scheduleRedoStacksByProject = new Map();

function buildCurrentScheduleSnapshot(label = 'Cambio en cronograma') {
  const cfg = getScheduleSettings();
  const workdays = getWorkdaysSettings();
  const items = extractScheduleItems(state.treeData);
  return {
    label,
    timestamp: Date.now(),
    startDate: cfg.startDate,
    respectWorkdays: cfg.respectWorkdays !== false,
    workdaysSettings: JSON.parse(JSON.stringify(workdays || {})),
    concepts: items
      .filter(it => it.tipo === 'concepto')
      .map(it => ({
        id: String(it.id),
        schedule: JSON.parse(JSON.stringify(it.node?.schedule || {}))
      }))
  };
}

function applyScheduleSnapshotState(snapshot) {
  if (!snapshot) return;

  if (snapshot.startDate) {
    saveScheduleSettings({
      startDate: snapshot.startDate,
      respectWorkdays: snapshot.respectWorkdays !== false
    });
  }
  if (snapshot.workdaysSettings && typeof snapshot.workdaysSettings === 'object') {
    saveWorkdaysSettings(snapshot.workdaysSettings);
  }

  const snapMap = new Map();
  (snapshot.concepts || []).forEach(entry => snapMap.set(String(entry.id), entry.schedule));

  function restoreWalk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      if (snapMap.has(String(n.id))) {
        n.schedule = JSON.parse(JSON.stringify(snapMap.get(String(n.id)) || {}));
      }
      if (Array.isArray(n.children)) restoreWalk(n.children);
    });
  }

  restoreWalk(state.treeData);
  const freshItems = extractScheduleItems(state.treeData);
  recalculateScheduleCPM(freshItems);
  persistLocalData(true);
}

export function saveScheduleUndoSnapshot(label = 'Cambio en cronograma') {
  const projKey = getActiveProjectId() || 'default';
  const snapshot = buildCurrentScheduleSnapshot(label);
  if (!scheduleUndoStacksByProject.has(projKey)) {
    scheduleUndoStacksByProject.set(projKey, []);
  }
  const undoStack = scheduleUndoStacksByProject.get(projKey);
  undoStack.push(snapshot);
  if (undoStack.length > MAX_SCHEDULE_HISTORY) {
    undoStack.shift();
  }
  // Al realizar una nueva acción, limpiar la pila de Rehacer
  scheduleRedoStacksByProject.set(projKey, []);
  return snapshot;
}

export function hasScheduleUndoSnapshot() {
  const projKey = getActiveProjectId() || 'default';
  const stack = scheduleUndoStacksByProject.get(projKey);
  return Boolean(stack && stack.length > 0);
}

export function hasScheduleRedoSnapshot() {
  const projKey = getActiveProjectId() || 'default';
  const stack = scheduleRedoStacksByProject.get(projKey);
  return Boolean(stack && stack.length > 0);
}

export function undoLastScheduleChange() {
  const projKey = getActiveProjectId() || 'default';
  const undoStack = scheduleUndoStacksByProject.get(projKey);
  if (!undoStack || undoStack.length === 0) return false;

  const snapshotToRestore = undoStack.pop();
  if (!scheduleRedoStacksByProject.has(projKey)) {
    scheduleRedoStacksByProject.set(projKey, []);
  }
  const redoStack = scheduleRedoStacksByProject.get(projKey);
  redoStack.push(buildCurrentScheduleSnapshot(snapshotToRestore.label || 'Cambio en cronograma'));
  if (redoStack.length > MAX_SCHEDULE_HISTORY) {
    redoStack.shift();
  }

  applyScheduleSnapshotState(snapshotToRestore);
  return snapshotToRestore;
}

export function redoLastScheduleChange() {
  const projKey = getActiveProjectId() || 'default';
  const redoStack = scheduleRedoStacksByProject.get(projKey);
  if (!redoStack || redoStack.length === 0) return false;

  const snapshotToRestore = redoStack.pop();
  if (!scheduleUndoStacksByProject.has(projKey)) {
    scheduleUndoStacksByProject.set(projKey, []);
  }
  const undoStack = scheduleUndoStacksByProject.get(projKey);
  undoStack.push(buildCurrentScheduleSnapshot(snapshotToRestore.label || 'Cambio en cronograma'));
  if (undoStack.length > MAX_SCHEDULE_HISTORY) {
    undoStack.shift();
  }

  applyScheduleSnapshotState(snapshotToRestore);
  return snapshotToRestore;
}

// ==========================================
// EDICIÓN BIDIRECCIONAL Y ENLACES FIN-A-INICIO (OPCIÓN C + CPM)
// ==========================================

// 1. Edición desde el Gantt: Actualizar Fecha de Inicio o Duración con bloqueo por predecesoras y cascada
export function updateConceptDatesInModel(conceptId, startDateStr, durationDays) {
  let targetNode = null;

  function findNode(nodes) {
    if (!Array.isArray(nodes) || targetNode) return;
    for (const n of nodes) {
      if (String(n.id) === String(conceptId) || String(n.clave) === String(conceptId)) {
        targetNode = n;
        return;
      }
      if (Array.isArray(n.children)) findNode(n.children);
    }
  }

  findNode(state.treeData);
  if (!targetNode) return false;

  saveScheduleUndoSnapshot('Edición de fechas/días');

  const cfg = getScheduleSettings();
  const preItems = extractScheduleItems(state.treeData);
  ensureInitialDates(preItems, cfg.startDate);

  const beforeDates = new Map();
  preItems.forEach(it => {
    if (it.tipo === 'concepto') {
      beforeDates.set(String(it.id), `${it.startDate}|${it.endDate}`);
    }
  });

  const targetItem = preItems.find(it => String(it.id) === String(targetNode.id));
  const dur = Math.max(3, parseInt(durationDays, 10) || 3);
  const requestedStartDt = parseDate(startDateStr);
  const requestedStartStr = formatDate(requestedStartDt);

  if (!targetNode.schedule) targetNode.schedule = {};
  if (!Array.isArray(targetNode.schedule.predecessors)) {
    targetNode.schedule.predecessors = [];
  }

  let effectiveStartDt = requestedStartDt;
  let clampedByPredecessor = false;
  let minAllowedDate = '';
  let blockingClaves = [];

  if (targetItem && targetItem.predecessors && targetItem.predecessors.length > 0 && targetItem.minAllowedStartDate) {
    minAllowedDate = targetItem.minAllowedStartDate;
    blockingClaves = targetItem.blockingClaves || [];
    const minStartDt = parseDate(minAllowedDate);

    if (diffDays(minStartDt, requestedStartDt) < 0) {
      // Bloquear inicio anterior al término de las predecesoras
      clampedByPredecessor = true;
      effectiveStartDt = minStartDt;
      targetNode.schedule.lagDays = 0;
    } else {
      if (requestedStartStr === targetItem.startDate) {
        // Solo cambió la duración: preservar desfase previo (0 por defecto)
        targetNode.schedule.lagDays = Math.max(0, parseInt(targetNode.schedule.lagDays, 10) || 0);
      } else {
        targetNode.schedule.lagDays = Math.max(0, diffDays(minStartDt, requestedStartDt));
      }
      effectiveStartDt = requestedStartDt;
    }
  } else {
    targetNode.schedule.lagDays = 0;
  }

  const effectiveEndDt = addDays(effectiveStartDt, dur - 1);
  targetNode.schedule.startDate = formatDate(effectiveStartDt);
  targetNode.schedule.endDate = formatDate(effectiveEndDt);
  targetNode.schedule.durationDays = dur;
  targetNode.schedule.isManual = false; // Vuelve a distribución proporcional al mover fechas
  targetNode.schedule.periods = {};

  // Recalcular cascada de todos los conceptos dependientes
  const postItems = extractScheduleItems(state.treeData);
  recalculateScheduleCPM(postItems);

  let cascadedCount = 0;
  postItems.forEach(it => {
    if (it.tipo === 'concepto' && String(it.id) !== String(targetNode.id)) {
      const prev = beforeDates.get(String(it.id));
      if (prev && prev !== `${it.startDate}|${it.endDate}`) {
        cascadedCount++;
      }
    }
  });

  persistLocalData(true);
  return {
    ok: true,
    clampedByPredecessor,
    minAllowedDate,
    blockingClaves,
    startDate: targetNode.schedule.startDate,
    endDate: targetNode.schedule.endDate,
    durationDays: dur,
    cascadedCount
  };
}

// Establecer lista de predecesoras (Fin-a-Inicio) para un concepto validando que no existan ciclos
export function setConceptPredecessorsInModel(conceptId, predecessorIds = []) {
  const cfg = getScheduleSettings();
  const items = extractScheduleItems(state.treeData);
  ensureInitialDates(items, cfg.startDate);

  const targetItem = items.find(it => it.tipo === 'concepto' && (String(it.id) === String(conceptId) || String(it.clave) === String(conceptId)));
  if (!targetItem) {
    return { ok: false, error: 'Concepto no encontrado.' };
  }

  const cleanIds = [];
  for (const rawId of (Array.isArray(predecessorIds) ? predecessorIds : [])) {
    if (!rawId) continue;
    const predItem = items.find(it => it.tipo === 'concepto' && (String(it.id) === String(rawId) || String(it.clave) === String(rawId)));
    if (!predItem) continue;
    if (String(predItem.id) === String(targetItem.id)) {
      return { ok: false, cycleError: true, error: 'Un concepto no puede depender de sí mismo.' };
    }
    if (wouldCreateScheduleCycle(targetItem.id, predItem.id, items)) {
      return {
        ok: false,
        cycleError: true,
        error: `Enlace inválido: "${predItem.clave}" ya depende directa o indirectamente de "${targetItem.clave}" (evita ciclos infinitos).`
      };
    }
    if (!cleanIds.includes(String(predItem.id))) {
      cleanIds.push(String(predItem.id));
    }
  }

  saveScheduleUndoSnapshot('Cambio de predecesoras');

  if (!targetItem.node.schedule) targetItem.node.schedule = {};
  targetItem.node.schedule.predecessors = cleanIds;
  targetItem.node.schedule.lagDays = 0;
  targetItem.node.schedule.isManual = false;
  targetItem.node.schedule.periods = {};

  const freshItems = extractScheduleItems(state.treeData);
  const cpmSummary = recalculateScheduleCPM(freshItems);
  const updatedTarget = freshItems.find(it => String(it.id) === String(targetItem.id));

  persistLocalData(true);
  return {
    ok: true,
    conceptId: targetItem.id,
    clave: targetItem.clave,
    predecessors: cleanIds,
    startDate: updatedTarget?.startDate || targetItem.startDate,
    endDate: updatedTarget?.endDate || targetItem.endDate,
    cpmSummary
  };
}

// Alternar (agregar o quitar) una predecesora específica (útil al vincular con clic en barras)
export function toggleConceptPredecessorInModel(targetConceptId, predConceptId) {
  const items = extractScheduleItems(state.treeData);
  const targetItem = items.find(it => it.tipo === 'concepto' && String(it.id) === String(targetConceptId));
  const predItem = items.find(it => it.tipo === 'concepto' && String(it.id) === String(predConceptId));
  if (!targetItem || !predItem) {
    return { ok: false, error: 'Concepto no encontrado.' };
  }
  const current = Array.isArray(targetItem.node?.schedule?.predecessors)
    ? [...targetItem.node.schedule.predecessors.map(String)]
    : [];
  const pid = String(predItem.id);
  let action = 'added';
  let nextPreds;
  if (current.includes(pid)) {
    nextPreds = current.filter(x => x !== pid);
    action = 'removed';
  } else {
    nextPreds = [...current, pid];
  }
  const res = setConceptPredecessorsInModel(targetItem.id, nextPreds);
  return Object.assign({}, res, { action, predClave: predItem.clave, targetClave: targetItem.clave });
}

// Limpiar todas las dependencias del proyecto (con soporte Deshacer)
export function clearAllScheduleDependenciesInModel() {
  saveScheduleUndoSnapshot('Limpiar todas las dependencias');
  const items = extractScheduleItems(state.treeData);
  items.forEach(it => {
    if (it.tipo === 'concepto' && it.node.schedule) {
      it.node.schedule.predecessors = [];
      it.node.schedule.lagDays = 0;
    }
  });
  recalculateScheduleCPM(items);
  persistLocalData(true);
  return true;
}

// Aplicar propuesta completa (IA o motor constructivo) al proyecto actual con respaldo Deshacer
export function applyScheduleProposalToModel(proposalTasks = [], projectStartDateStr = null, options = {}) {
  if (!Array.isArray(proposalTasks) || proposalTasks.length === 0) return false;
  saveScheduleUndoSnapshot('Propuesta IA de Proceso Constructivo');

  const cfg = getScheduleSettings();
  const respectWorkdays = options.respectWorkdays !== undefined
    ? Boolean(options.respectWorkdays)
    : (cfg.respectWorkdays !== false);
  const workdaysCfg = getWorkdaysSettings();
  const baseStartStr = projectStartDateStr || cfg.startDate || '2026-05-01';
  const baseStartDt = getNextWorkingDate(baseStartStr, workdaysCfg, respectWorkdays);

  if (options.respectWorkdays !== undefined) {
    saveScheduleSettings({ respectWorkdays: Boolean(options.respectWorkdays), showCriticalPath: true });
  } else {
    saveScheduleSettings({ showCriticalPath: true });
  }

  const taskById = new Map();
  proposalTasks.forEach(t => {
    if (t && t.id !== undefined) taskById.set(String(t.id), t);
  });

  const items = extractScheduleItems(state.treeData);
  items.forEach(it => {
    if (it.tipo !== 'concepto') return;
    const prop = taskById.get(String(it.id));
    if (!prop) return;

    const dur = Math.max(3, parseInt(prop.durationDays, 10) || 3);
    const preds = Array.isArray(prop.predecessors) ? prop.predecessors.map(String) : [];
    const sDt = prop.startDate ? parseDate(prop.startDate) : baseStartDt;

    it.node.schedule = {
      startDate: formatDate(sDt),
      endDate: formatDate(addDays(sDt, dur - 1)),
      durationDays: dur,
      predecessors: preds,
      lagDays: Math.max(0, parseInt(prop.lagDays, 10) || 0),
      isManual: false,
      periods: {}
    };
  });

  const freshItems = extractScheduleItems(state.treeData);
  const cpmSummary = recalculateScheduleCPM(freshItems, { respectWorkdays, workdaysCfg });
  persistLocalData(true);
  return cpmSummary;
}

// Desplazar fecha de inicio de obra preservando dependencias y duraciones si ya existen enlaces
export function shiftProjectScheduleStart(newStartDateStr) {
  if (!newStartDateStr) return false;
  const cfg = getScheduleSettings();
  const items = extractScheduleItems(state.treeData);
  const concepts = items.filter(it => it.tipo === 'concepto');
  const hasLinks = concepts.some(c => Array.isArray(c.node?.schedule?.predecessors) && c.node.schedule.predecessors.length > 0);

  if (!hasLinks) {
    saveScheduleUndoSnapshot('Cambio de inicio de obra');
    saveScheduleSettings({ startDate: newStartDateStr });
    autoDistributeAllSchedule(newStartDateStr, { skipUndo: true });
    return true;
  }

  saveScheduleUndoSnapshot('Desplazar inicio de obra con dependencias');
  saveScheduleSettings({ startDate: newStartDateStr });
  ensureInitialDates(items, cfg.startDate);

  let currentMinDt = null;
  concepts.forEach(c => {
    const s = parseDate(c.startDate);
    if (!currentMinDt || s < currentMinDt) currentMinDt = s;
  });
  if (!currentMinDt) currentMinDt = parseDate(cfg.startDate || newStartDateStr);

  const targetStartDt = getNextWorkingDate(newStartDateStr, getWorkdaysSettings(), cfg.respectWorkdays !== false);
  const delta = diffDays(currentMinDt, targetStartDt);

  concepts.forEach(c => {
    const preds = c.node?.schedule?.predecessors || [];
    if (preds.length === 0 && c.node.schedule) {
      const shiftedStart = getNextWorkingDate(addDays(c.startDate, delta), getWorkdaysSettings(), cfg.respectWorkdays !== false);
      const dur = Math.max(3, c.durationDays || 3);
      c.node.schedule.startDate = formatDate(shiftedStart);
      c.node.schedule.endDate = formatDate(addDays(shiftedStart, dur - 1));
    }
  });

  const freshItems = extractScheduleItems(state.treeData);
  recalculateScheduleCPM(freshItems);
  persistLocalData(true);
  return true;
}

// 2. Edición desde la Tabla Financiera: Modificar cantidad o importe de un período
export function updateConceptPeriodInModel(conceptId, periodKey, field, value, periods) {
  let targetNode = null;

  function findNode(nodes) {
    if (!Array.isArray(nodes) || targetNode) return;
    for (const n of nodes) {
      if (String(n.id) === String(conceptId) || String(n.clave) === String(conceptId)) {
        targetNode = n;
        return;
      }
      if (Array.isArray(n.children)) findNode(n.children);
    }
  }

  findNode(state.treeData);
  if (!targetNode) return false;

  saveScheduleUndoSnapshot('Edición financiera por período');

  const numVal = Math.max(0, parseFloat(value) || 0);
  const pu = Number(targetNode.precioUnitario) || 0;

  if (!targetNode.schedule) targetNode.schedule = {};
  if (!targetNode.schedule.periods) targetNode.schedule.periods = {};

  targetNode.schedule.isManual = true;

  if (!targetNode.schedule.periods[periodKey]) {
    targetNode.schedule.periods[periodKey] = { cantidad: 0, importe: 0 };
  }

  if (field === 'cantidad') {
    targetNode.schedule.periods[periodKey].cantidad = numVal;
    targetNode.schedule.periods[periodKey].importe = numVal * pu;
  } else {
    targetNode.schedule.periods[periodKey].importe = numVal;
    targetNode.schedule.periods[periodKey].cantidad = pu > 0 ? numVal / pu : 0;
  }

  // Auto-ajustar fechas de inicio y fin en el Gantt según los períodos activos con monto > 0
  let earliestPeriod = null;
  let latestPeriod = null;

  periods.forEach(p => {
    const val = targetNode.schedule.periods[p.key];
    if (val && val.importe > 0) {
      if (!earliestPeriod) earliestPeriod = p;
      latestPeriod = p;
    }
  });

  if (earliestPeriod && latestPeriod) {
    targetNode.schedule.startDate = formatDate(earliestPeriod.startDate);
    targetNode.schedule.endDate = formatDate(latestPeriod.endDate);
    targetNode.schedule.durationDays = Math.max(3, diffDays(earliestPeriod.startDate, latestPeriod.endDate) + 1);
  }

  const freshItems = extractScheduleItems(state.treeData);
  recalculateScheduleCPM(freshItems);
  persistLocalData(true);
  return true;
}

// Re-distribución automática de todo el calendario
export function autoDistributeAllSchedule(projectStartDateStr = '2026-05-01', options = {}) {
  if (!options.skipUndo) {
    saveScheduleUndoSnapshot('Auto-programación secuencial');
  }
  const items = extractScheduleItems(state.treeData);
  let curr = parseDate(projectStartDateStr);

  items.forEach(item => {
    if (item.tipo === 'concepto') {
      const imp = item.importe || 0;
      let dur = Math.max(3, Math.min(25, Math.round(imp / 8000)));
      if (isNaN(dur) || dur < 3) dur = 3;

      const s = new Date(curr);
      const e = addDays(s, dur - 1);

      item.node.schedule = {
        startDate: formatDate(s),
        endDate: formatDate(e),
        durationDays: dur,
        predecessors: [],
        lagDays: 0,
        isManual: false,
        periods: {}
      };

      // Desfase suave para el siguiente concepto
      curr = addDays(curr, 2);
    }
  });

  persistLocalData(true);
}
