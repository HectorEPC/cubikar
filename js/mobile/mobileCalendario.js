// js/mobile/mobileCalendario.js
// Calendario de Obra móvil/tablet para cubikar Construcción:
// Sub-vistas Agenda | Gantt | Curva S, Dependencias FS reales, bloqueo seguro y Ruta Crítica CPM.

import { state } from '../state/store.js?v=20261119_cf42';
import { formatMoney, round2 } from '../core/formatters.js?v=20261119_cf42';
import {
  extractScheduleItems,
  ensureInitialDates,
  recalculateScheduleCPM,
  getScheduleSettings,
  getWorkdaysSettings,
  getGanttTodayDate,
  updateConceptDatesInModel,
  setConceptPredecessorsInModel,
  wouldCreateScheduleCycle,
  autoDistributeAllSchedule,
  generateTimePeriods,
  calculateScheduleDistribution,
  parseDate,
  addDays,
  diffDays,
  formatDate
} from '../modules/calendario/calendarioModel.js?v=20261119_cf42';
import { getEstimacionesCalculatedData } from '../modules/estimaciones/estimacionesModel.js?v=20261119_cf42';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf42';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261119_cf42';
import { showToast } from '../ui/notifications.js?v=20261119_cf42';
import { escapeHtml, isBodegueroRestricted } from './mobileBridge.js?v=20261119_cf42';

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

let calView = 'gantt'; // 'agenda' | 'gantt' | 'curvas'
let calFilter = 'all'; // 'all' | 'critical' | 'next7'
let ganttOnlyCritical = false;
let curvaScale = 'auto'; // 'auto' | 'semanas' | 'meses'

function buildWorkdaysSubtitle() {
  const wd = getWorkdaysSettings() || {};
  const nonWorking = Array.isArray(wd.nonWorkingDaysOfWeek) ? wd.nonWorkingDaysOfWeek : [0];
  const weekLabel = !nonWorking.includes(6)
    ? (!nonWorking.includes(0) ? 'L-D' : 'L-S')
    : 'L-V';
  const festivosCount = Array.isArray(wd.festivos) ? wd.festivos.length : 0;
  const lluviasCount = Array.isArray(wd.lluvias) ? wd.lluvias.length : 0;
  const parts = [weekLabel];
  if (festivosCount > 0) parts.push('Festivos MX');
  if (lluviasCount > 0) parts.push(`${lluviasCount} lluvia${lluviasCount > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

function formatSpanRange(d1, d2) {
  if (!d1 || !d2) return '—';
  const m1 = MONTHS_ES[d1.getMonth()];
  const m2 = MONTHS_ES[d2.getMonth()];
  if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
    return `${d1.getDate()}–${d2.getDate()} ${m1}`;
  }
  return `${d1.getDate()} ${m1}–${d2.getDate()} ${m2}`;
}

function getProgressMapFromEstimaciones() {
  const pctMap = new Map();
  let actualGlobalPct = 0;
  try {
    const estData = getEstimacionesCalculatedData();
    actualGlobalPct = Math.max(0, Math.min(100, Number(estData?.kpis?.pctAvanceGlobal) || 0));
    (estData?.rows || []).forEach(r => {
      if (!r || r.isParent) return;
      const pct = Math.max(0, Math.min(100, Math.round(Number(r.pctAvanceAcum) || 0)));
      pctMap.set(String(r.id), pct);
    });
  } catch (_) {
    // Fallback sin estimaciones activas
  }
  return { pctMap, actualGlobalPct };
}

function getConceptShortCode(c) {
  const clave = String(c?.clave || '').trim();
  if (clave) return clave;
  const desc = String(c?.descripcion || '').trim();
  return desc ? desc.slice(0, 14) : String(c?.id || '').slice(-4);
}

function computeGanttWindow(concepts, todayDt) {
  let minStart = null;
  let maxEnd = null;
  concepts.forEach(c => {
    if (c.startDate) {
      const s = parseDate(c.startDate);
      if (!minStart || s < minStart) minStart = s;
    }
    const endStr = c.endDate || c.startDate;
    if (endStr) {
      const e = parseDate(endStr);
      if (!maxEnd || e > maxEnd) maxEnd = e;
    }
  });
  if (!minStart || !maxEnd) {
    minStart = new Date(todayDt);
    maxEnd = addDays(minStart, 20);
  }
  const totalSpanDays = Math.max(3, diffDays(minStart, maxEnd) + 1);
  const segLen = Math.max(1, Math.ceil(totalSpanDays / 3));

  const cols = [0, 1, 2].map(idx => {
    const s = addDays(minStart, idx * segLen);
    const rawEnd = idx === 2 ? maxEnd : addDays(minStart, (idx + 1) * segLen - 1);
    const e = rawEnd > maxEnd ? new Date(maxEnd) : rawEnd;
    const isToday = todayDt >= s && todayDt <= e;
    return {
      label: formatSpanRange(s, e) + (isToday ? ' · Hoy' : ''),
      isToday
    };
  });

  let todayLinePct = null;
  if (todayDt >= minStart && todayDt <= maxEnd) {
    todayLinePct = Math.max(1, Math.min(99, (diffDays(minStart, todayDt) / totalSpanDays) * 100));
  }

  return { minStart, maxEnd, totalSpanDays, cols, todayLinePct };
}

function buildDependenciesHtml(concepts) {
  const byId = new Map(concepts.map(c => [String(c.id), c]));
  const chains = [];
  concepts.forEach(c => {
    if (!Array.isArray(c.predecessors) || c.predecessors.length === 0) return;
    const predLabels = c.predecessors
      .map(pid => byId.get(String(pid)))
      .filter(Boolean)
      .map(p => getConceptShortCode(p));
    if (predLabels.length > 0) {
      chains.push(`${getConceptShortCode(c)} inicia al terminar ${predLabels.join(' + ')}`);
    }
  });

  if (chains.length === 0) {
    return `
      <div class="m-dep-box">
        <strong>Dependencias:</strong> Sin dependencias configuradas. Toca una actividad para vincular predecesoras.
      </div>
    `;
  }

  const visible = chains.slice(0, 4);
  const extra = chains.length - visible.length;
  const summaryText = visible.join(', ') + (extra > 0 ? ` (+${extra} más).` : '.');
  return `
    <div class="m-dep-box">
      <strong>Dependencias:</strong> ${escapeHtml(summaryText)}
    </div>
  `;
}

function renderGanttSubView(concepts, { pctMap, todayDt, locked, canEditRole, editable, onJumpComprasExplosion }) {
  if (concepts.length === 0) {
    return `
      <div class="m-card" style="text-align:center;color:var(--muted);padding:24px;">
        Agrega conceptos en Presupuesto para visualizar el diagrama de Gantt.
      </div>
    `;
  }

  const visibleConcepts = ganttOnlyCritical ? concepts.filter(c => c.isCritical) : concepts;
  const ganttWin = computeGanttWindow(concepts, todayDt);

  const rowsHtml = visibleConcepts.length === 0
    ? '<div style="text-align:center;color:var(--muted);padding:16px;font-size:12px;">No hay actividades en ruta crítica con este filtro.</div>'
    : visibleConcepts.map(c => {
        const sDt = c.startDate ? parseDate(c.startDate) : ganttWin.minStart;
        const eDt = (c.endDate || c.startDate) ? parseDate(c.endDate || c.startDate) : sDt;
        const offsetDays = Math.max(0, diffDays(ganttWin.minStart, sDt));
        const dur = Math.max(1, Number(c.durationDays) || (diffDays(sDt, eDt) + 1));
        const rawLeft = (offsetDays / ganttWin.totalSpanDays) * 100;
        const rawWidth = (dur / ganttWin.totalSpanDays) * 100;
        const leftPct = Math.max(0, Math.min(82, Number(rawLeft.toFixed(2))));
        const maxWidth = 100 - leftPct;
        const widthPct = Math.max(Math.min(18, maxWidth), Math.min(maxWidth, Number(rawWidth.toFixed(2))));
        const pct = pctMap.get(String(c.id)) ?? 0;

        return `
          <button type="button" class="m-gantt-row m-cal-edit-trigger" data-id="${escapeHtml(c.id)}" title="${escapeHtml(c.clave ? `${c.clave} · ${c.descripcion}` : c.descripcion)}">
            <div class="m-gantt-row-top">
              <span class="m-gantt-row-name">${escapeHtml(c.descripcion || c.clave || 'Concepto')}</span>
              <span class="m-gantt-row-dur m-mono">${dur} d</span>
            </div>
            <div class="m-gantt-track">
              <div class="m-gantt-bar ${c.isCritical ? 'is-critical' : ''}" style="left:${leftPct}%;width:${widthPct}%;">
                <span>${pct}%</span>
              </div>
            </div>
          </button>
        `;
      }).join('');

  return `
    <div class="m-gantt-card">
      <div class="m-gantt-ruler">
        ${ganttWin.cols.map(col => `<div class="m-gantt-ruler-col ${col.isToday ? 'is-today' : ''}">${escapeHtml(col.label)}</div>`).join('')}
      </div>
      <div class="m-gantt-rows">
        ${ganttWin.todayLinePct !== null ? `<div class="m-gantt-today-line" style="left:${ganttWin.todayLinePct}%;"></div>` : ''}
        ${rowsHtml}
      </div>
    </div>

    ${buildDependenciesHtml(concepts)}

    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">${!canEditRole ? 'Solo lectura' : (locked ? 'Calendario protegido' : 'Edición de cronograma activa')}</span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-cal-lock" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">${locked ? 'Desbloquear' : 'Proteger'}</button>
      ` : ''}
    </div>

    <div class="m-row-between" style="flex-wrap:wrap;gap:6px;">
      <div class="m-row" style="gap:6px;">
        <button type="button" id="m-gantt-filter-crit" class="m-chip ${ganttOnlyCritical ? 'is-active' : ''}">
          <i class="fa-solid fa-fire" style="color:${ganttOnlyCritical ? '#ffffff' : 'var(--danger)'};"></i> Ruta crítica
        </button>
      </div>
      <div class="m-row" style="gap:6px;">
        ${typeof onJumpComprasExplosion === 'function' ? `
          <button type="button" id="m-cal-pedir-7d" class="m-btn m-btn-sm m-btn-soft"><i class="fa-solid fa-cart-plus"></i> Pedir 7d</button>
        ` : ''}
        ${editable ? `
          <button type="button" id="m-cal-auto" class="m-btn m-btn-sm m-btn-outline"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-programar</button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderAgendaSubView(concepts, { pctMap, todayDt, cpm, locked, canEditRole, editable, onJumpComprasExplosion }) {
  const next7Limit = addDays(todayDt, 7);
  const filtered = concepts
    .filter(c => {
      if (calFilter === 'critical') return c.isCritical;
      if (calFilter === 'next7') {
        const s = c.startDate ? parseDate(c.startDate) : null;
        return s && s >= todayDt && s <= next7Limit;
      }
      return true;
    })
    .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

  const byId = new Map(concepts.map(c => [String(c.id), c]));

  return `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">${!canEditRole ? 'Solo lectura' : (locked ? 'Calendario protegido' : 'Edición de fechas activa')}</span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-cal-lock" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">${locked ? 'Desbloquear' : 'Proteger'}</button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Fin de obra CPM</div>
        <div class="m-kpi-value" style="color:var(--primary);font-size:14px;">${escapeHtml(cpm?.projectEndDate || '—')}</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Ruta Crítica</div>
        <div class="m-kpi-value" style="color:var(--danger);">${concepts.filter(c => c.isCritical).length} act.</div>
      </div>
    </div>

    <div class="m-row-between" style="flex-wrap:wrap;">
      <div class="m-chip-bar">
        <button type="button" class="m-chip ${calFilter === 'all' ? 'is-active' : ''}" data-cal-filter="all">Todos</button>
        <button type="button" class="m-chip ${calFilter === 'critical' ? 'is-active' : ''}" data-cal-filter="critical">Crítica</button>
        <button type="button" class="m-chip ${calFilter === 'next7' ? 'is-active' : ''}" data-cal-filter="next7">Próx. 7d</button>
      </div>
      <div class="m-row" style="gap:6px;">
        ${typeof onJumpComprasExplosion === 'function' ? `
          <button type="button" id="m-cal-pedir-7d" class="m-btn m-btn-sm m-btn-soft"><i class="fa-solid fa-cart-plus"></i> Pedir 7d</button>
        ` : ''}
        ${editable ? `
          <button type="button" id="m-cal-auto" class="m-btn m-btn-sm m-btn-outline"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-programar</button>
        ` : ''}
      </div>
    </div>

    ${filtered.length === 0 ? `
      <div class="m-card" style="text-align:center;color:var(--muted);padding:24px;">No hay actividades para este filtro.</div>
    ` : filtered.map(c => {
      const pct = pctMap.get(String(c.id)) ?? 0;
      const preds = (c.predecessors || []).map(pid => byId.get(String(pid))).filter(Boolean).map(p => getConceptShortCode(p));
      return `
        <div class="m-card m-cal-edit-trigger" data-id="${escapeHtml(c.id)}" style="cursor:pointer;">
          <div class="m-row-between">
            <span class="m-pill ${c.isCritical ? 'm-pill-red' : 'm-pill-blue'}">${c.isCritical ? 'Crítica' : `Holgura ${Number(c.slackDays || 0)}d`}</span>
            <span class="m-mono" style="font-size:11px;color:var(--muted);">${escapeHtml(c.startDate || '')} · ${Number(c.durationDays || 1)}d</span>
          </div>
          <div style="font-weight:700;font-size:13.5px;margin-top:6px;">${escapeHtml(c.descripcion || 'Actividad')}</div>
          ${preds.length > 0 ? `<div style="font-size:11px;color:var(--warn);margin-top:3px;"><i class="fa-solid fa-link"></i> Depende de: ${escapeHtml(preds.join(', '))}</div>` : ''}
          <div class="m-row-between" style="margin-top:8px;font-size:11.5px;">
            <span style="color:var(--muted);">${escapeHtml(c.clave || '')}</span>
            <span class="m-mono" style="font-weight:700;color:var(--primary);">${pct}%</span>
          </div>
          <div class="m-progress-track" style="margin-top:5px;">
            <div class="m-progress-fill" style="width:${pct}%;background:${c.isCritical ? '#ef4444' : 'var(--primary)'};"></div>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

function computeCurvaSData(items, concepts, todayDt) {
  let effectiveScale = curvaScale;
  if (effectiveScale === 'auto') {
    const win = computeGanttWindow(concepts, todayDt);
    effectiveScale = win.totalSpanDays > 112 ? 'meses' : 'semanas';
  }
  const periods = generateTimePeriods(items, effectiveScale) || [];
  if (periods.length === 0) {
    return { effectiveScale, periods: [], rows: [], scheduledToDatePct: 0, realPlotIdx: 0 };
  }

  const dist = calculateScheduleDistribution(items, periods);
  const useMoney = (dist?.grandTotalObra || 0) > 0;

  let unweightedCum = 0;
  const totalConceptDays = concepts.reduce((acc, c) => acc + Math.max(1, Number(c.durationDays) || 1), 0) || 1;

  const rows = periods.map((p, idx) => {
    const pt = dist?.periodTotals?.[p.key] || { importe: 0, pctPeriodo: 0, pctAcumulado: 0 };
    let pctPeriodo = Number(pt.pctPeriodo) || 0;
    let pctAcum = Number(pt.pctAcumulado) || 0;
    if (!useMoney) {
      const pStart = parseDate(p.startDate);
      const pEnd = parseDate(p.endDate);
      let sliceDays = 0;
      concepts.forEach(c => {
        if (!c.startDate) return;
        const cS = parseDate(c.startDate);
        const cE = parseDate(c.endDate || c.startDate);
        const overlapStart = cS > pStart ? cS : pStart;
        const overlapEnd = cE < pEnd ? cE : pEnd;
        if (overlapEnd >= overlapStart) {
          sliceDays += diffDays(overlapStart, overlapEnd) + 1;
        }
      });
      pctPeriodo = round2((sliceDays / totalConceptDays) * 100);
      unweightedCum = Math.min(100, round2(unweightedCum + pctPeriodo));
      pctAcum = idx === periods.length - 1 ? 100 : unweightedCum;
    }
    return {
      key: p.key,
      label: p.shortLabel || p.label || `P${idx + 1}`,
      fullLabel: p.fullLabel || p.label || `Período ${idx + 1}`,
      startDate: p.startDate,
      endDate: p.endDate,
      importe: Number(pt.importe) || 0,
      pctPeriodo: round2(pctPeriodo),
      pctAcum: Math.min(100, Math.max(0, round2(pctAcum)))
    };
  });

  // Calcular avance programado a la fecha de hoy
  let scheduledToDatePct = 0;
  let realPlotIdx = 0;
  const firstStart = parseDate(rows[0].startDate);
  const lastEnd = parseDate(rows[rows.length - 1].endDate);
  if (todayDt < firstStart) {
    scheduledToDatePct = 0;
    realPlotIdx = 0;
  } else if (todayDt > lastEnd) {
    scheduledToDatePct = 100;
    realPlotIdx = rows.length - 1;
  } else {
    const idx = rows.findIndex(r => todayDt >= parseDate(r.startDate) && todayDt <= parseDate(r.endDate));
    realPlotIdx = idx >= 0 ? idx : 0;
    scheduledToDatePct = rows[realPlotIdx]?.pctAcum ?? 0;
  }

  return { effectiveScale, periods, rows, scheduledToDatePct, realPlotIdx };
}

function renderCurvaSSubView(items, concepts, { actualGlobalPct, todayDt }) {
  if (concepts.length === 0) {
    return `
      <div class="m-card" style="text-align:center;color:var(--muted);padding:24px;">
        Agrega conceptos para calcular la Curva S del proyecto.
      </div>
    `;
  }

  const cs = computeCurvaSData(items, concepts, todayDt);
  const rows = cs.rows;
  if (rows.length === 0) {
    return `<div class="m-card" style="text-align:center;color:var(--muted);padding:24px;">Sin períodos disponibles para Curva S.</div>`;
  }

  const W = 320;
  const H = 128;
  const padL = 28;
  const padR = 12;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = rows.length;
  const xAt = (i) => n === 1 ? padL + plotW : padL + ((i + 1) / n) * plotW;
  const yAt = (pct) => padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

  const progCoords = [`${padL.toFixed(1)},${yAt(0).toFixed(1)}`];
  rows.forEach((r, i) => progCoords.push(`${xAt(i).toFixed(1)},${yAt(r.pctAcum).toFixed(1)}`));
  const areaCoords = [...progCoords, `${xAt(n - 1).toFixed(1)},${yAt(0).toFixed(1)}`];

  const xReal = xAt(cs.realPlotIdx);
  const yReal = yAt(actualGlobalPct);
  const delta = round2(actualGlobalPct - cs.scheduledToDatePct);

  const firstLbl = rows[0]?.label || '';
  const midLbl = rows.length > 2 ? rows[Math.floor((rows.length - 1) / 2)].label : '';
  const lastLbl = rows[rows.length - 1]?.label || '';

  return `
    <div class="m-card">
      <div class="m-row-between" style="flex-wrap:wrap;gap:6px;">
        <div>
          <div style="font-weight:800;font-size:13.5px;">Curva S · Avance Acumulado</div>
          <div style="font-size:11px;color:var(--muted);">Programado vs Real (Estimaciones)</div>
        </div>
        <div class="m-segmented" style="padding:2px;">
          <button type="button" class="m-seg-btn ${cs.effectiveScale === 'semanas' ? 'is-active' : ''}" data-cs-scale="semanas" style="padding:4px 8px;font-size:10.5px;">Semanas</button>
          <button type="button" class="m-seg-btn ${cs.effectiveScale === 'meses' ? 'is-active' : ''}" data-cs-scale="meses" style="padding:4px 8px;font-size:10.5px;">Meses</button>
        </div>
      </div>

      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;margin-top:8px;">
        ${[0, 50, 100].map(g => {
          const y = yAt(g);
          return `
            <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="${g === 0 ? '' : '3 3'}"></line>
            <text x="${padL - 4}" y="${y + 3}" text-anchor="end" fill="var(--muted)" font-size="8.5" font-weight="600">${g}%</text>
          `;
        }).join('')}
        <polygon points="${areaCoords.join(' ')}" fill="var(--primary)" opacity="0.10"></polygon>
        <polyline points="${progCoords.join(' ')}" fill="none" stroke="var(--primary)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></polyline>
        <line x1="${padL}" y1="${yAt(0)}" x2="${xReal}" y2="${yReal}" stroke="var(--success)" stroke-width="2.6" stroke-linecap="round"></line>
        <circle cx="${xReal}" cy="${yReal}" r="4" fill="var(--success)" stroke="var(--card)" stroke-width="1.5"></circle>
        <text x="${padL}" y="${H - 5}" text-anchor="start" fill="var(--muted)" font-size="8.5" font-weight="600">${escapeHtml(firstLbl)}</text>
        ${midLbl ? `<text x="${padL + plotW / 2}" y="${H - 5}" text-anchor="middle" fill="var(--muted)" font-size="8.5" font-weight="600">${escapeHtml(midLbl)}</text>` : ''}
        <text x="${W - padR}" y="${H - 5}" text-anchor="end" fill="var(--muted)" font-size="8.5" font-weight="600">${escapeHtml(lastLbl)}</text>
      </svg>

      <div class="m-row-between" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;">
        <div class="m-row" style="gap:10px;">
          <span class="m-row" style="gap:5px;"><span style="width:9px;height:3px;border-radius:2px;background:var(--primary);display:inline-block;"></span> Programado</span>
          <span class="m-row" style="gap:5px;"><span style="width:9px;height:3px;border-radius:2px;background:var(--success);display:inline-block;"></span> Real (${round2(actualGlobalPct)}%)</span>
        </div>
        <span class="m-pill ${delta >= 0 ? 'm-pill-green' : 'm-pill-warn'}">${delta >= 0 ? '+' : ''}${delta}% vs hoy</span>
      </div>
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Programado a hoy</div>
        <div class="m-kpi-value" style="color:var(--primary);">${cs.scheduledToDatePct.toFixed(1)}%</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Avance Real</div>
        <div class="m-kpi-value" style="color:var(--success);">${round2(actualGlobalPct).toFixed(1)}%</div>
      </div>
    </div>

    <div class="m-card" style="padding:10px 13px;">
      <div style="font-size:11.5px;font-weight:800;margin-bottom:8px;color:var(--text-soft);">Desglose por período</div>
      <div style="display:flex;flex-direction:column;gap:7px;">
        ${rows.map((r, i) => `
          <div class="m-row-between" style="font-size:11.5px;padding-bottom:6px;${i < rows.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
            <div style="min-width:0;flex:1;">
              <div style="font-weight:700;${i === cs.realPlotIdx ? 'color:var(--primary);' : ''}">${escapeHtml(r.fullLabel)}${i === cs.realPlotIdx ? ' · Hoy' : ''}</div>
              ${r.importe > 0 ? `<div style="font-size:10.5px;color:var(--muted);">${formatMoney(r.importe)} (+${r.pctPeriodo.toFixed(1)}%)</div>` : ''}
            </div>
            <div class="m-mono" style="font-weight:800;color:var(--text);">${r.pctAcum.toFixed(1)}%</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function openConceptScheduleSheet({ target, concepts, items, pctMap, editable, canEditRole, locked, openSheet, closeSheet, container, onJumpComprasExplosion }) {
  const byId = new Map(concepts.map(c => [String(c.id), c]));
  const currentPredIds = (target.predecessors || []).map(String);
  const pct = pctMap.get(String(target.id)) ?? 0;

  if (!editable) {
    const predsLabel = currentPredIds
      .map(pid => byId.get(pid))
      .filter(Boolean)
      .map(p => `${getConceptShortCode(p)} (${p.descripcion || ''})`)
      .join(', ');

    openSheet({
      title: `${target.clave || 'Actividad'}`,
      bodyHtml: `
        <div class="m-card-alt">
          <div style="font-weight:700;font-size:13.5px;">${escapeHtml(target.descripcion || '')}</div>
          <div class="m-row" style="margin-top:8px;flex-wrap:wrap;gap:6px;">
            <span class="m-pill ${target.isCritical ? 'm-pill-red' : 'm-pill-blue'}">${target.isCritical ? 'Ruta crítica' : `Holgura ${Number(target.slackDays || 0)}d`}</span>
            <span class="m-pill m-pill-green">Avance real: ${pct}%</span>
          </div>
        </div>
        <div class="m-grid-2">
          <div class="m-kpi"><div class="m-kpi-label">Inicio</div><div class="m-kpi-value m-mono" style="font-size:13px;">${escapeHtml(target.startDate || '—')}</div></div>
          <div class="m-kpi"><div class="m-kpi-label">Duración</div><div class="m-kpi-value m-mono" style="font-size:13px;">${Number(target.durationDays || 1)} días</div></div>
        </div>
        <div style="font-size:12px;color:var(--text-soft);">
          <strong>Predecesoras:</strong> ${escapeHtml(predsLabel || 'Ninguna configurada.')}
        </div>
      `,
      footerHtml: `
        <button type="button" id="m-ce-close" class="m-btn m-btn-outline">Cerrar</button>
        ${canEditRole && locked ? `<button type="button" id="m-ce-unlock" class="m-btn m-btn-primary"><i class="fa-solid fa-lock-open"></i> Desbloquear y editar</button>` : ''}
      `
    });
    document.getElementById('m-ce-close')?.addEventListener('click', closeSheet);
    document.getElementById('m-ce-unlock')?.addEventListener('click', () => {
      setTabLocked('calendario', false, { notify: false, rerender: false });
      closeSheet();
      openConceptScheduleSheet({
        target,
        concepts,
        items,
        pctMap,
        editable: true,
        canEditRole,
        locked: false,
        openSheet,
        closeSheet,
        container,
        onJumpComprasExplosion
      });
    });
    return;
  }

  const candidatePreds = concepts.filter(c => {
    if (String(c.id) === String(target.id)) return false;
    return !wouldCreateScheduleCycle(target.id, c.id, items);
  });

  openSheet({
    title: `Editar ${target.clave || 'Actividad'}`,
    bodyHtml: `
      <form id="m-cal-edit-form" style="display:flex;flex-direction:column;gap:11px;">
        <div class="m-card-alt" style="font-size:12.5px;font-weight:700;">${escapeHtml(target.descripcion || '')}</div>
        <div class="m-grid-2">
          <div>
            <label class="m-label">Fecha de inicio</label>
            <input id="m-ce-start" type="date" required class="m-input" value="${escapeHtml(target.startDate || '')}">
          </div>
          <div>
            <label class="m-label">Duración (mín. 1 día)</label>
            <input id="m-ce-dur" type="number" min="1" required class="m-input m-mono" value="${Math.max(1, Number(target.durationDays || 1))}">
          </div>
        </div>
        <div>
          <label class="m-label">Predecesoras Fin-a-Inicio (inicia al terminar):</label>
          ${candidatePreds.length === 0 ? `
            <div style="font-size:12px;color:var(--muted);">No hay otras actividades disponibles para enlazar.</div>
          ` : `
            <div class="m-pred-list">
              ${candidatePreds.map(other => {
                const checked = currentPredIds.includes(String(other.id));
                return `
                  <label class="m-pred-opt">
                    <input type="checkbox" class="m-pred-chk" value="${escapeHtml(other.id)}" ${checked ? 'checked' : ''}>
                    <span class="m-mono" style="font-weight:700;color:var(--primary);flex-shrink:0;">${escapeHtml(getConceptShortCode(other))}</span>
                    <span style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(other.descripcion || '')}</span>
                  </label>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </form>
    `,
    footerHtml: `<button type="button" id="m-ce-cancel" class="m-btn m-btn-outline">Cancelar</button><button type="submit" form="m-cal-edit-form" class="m-btn m-btn-primary">Guardar</button>`
  });

  document.getElementById('m-ce-cancel')?.addEventListener('click', closeSheet);
  document.getElementById('m-cal-edit-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const startVal = document.getElementById('m-ce-start').value;
    const durVal = Math.max(1, parseInt(document.getElementById('m-ce-dur').value, 10) || 1);
    const checkedIds = Array.from(document.querySelectorAll('#m-cal-edit-form .m-pred-chk:checked')).map(el => el.value);

    const predChanged = checkedIds.length !== currentPredIds.length || checkedIds.some(id => !currentPredIds.includes(id));
    let startToSave = startVal;

    if (predChanged) {
      const predRes = setConceptPredecessorsInModel(target.id, checkedIds);
      if (predRes && !predRes.ok) {
        showToast(predRes.error || 'Enlace de dependencia inválido.', 'warning');
        return;
      }
      if (startVal === (target.startDate || '') && predRes?.startDate) {
        startToSave = predRes.startDate;
      }
    }

    const res = updateConceptDatesInModel(target.id, startToSave, durVal);
    closeSheet();
    if (res && res.clampedByPredecessor) {
      showToast(`Inicio ajustado a ${res.startDate} por dependencia.`, 'info');
    } else {
      showToast('Cronograma actualizado.', 'success');
    }
    renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
  });
}

export function renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion }) {
  if (!container) return;

  if (isBodegueroRestricted()) {
    container.innerHTML = '<div class="m-card" style="text-align:center;padding:24px;"><i class="fa-solid fa-lock"></i> Pestaña restringida para rol Almacenista.</div>';
    return;
  }

  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('calendario');
  const editable = canEditRole && !locked;

  const cfg = getScheduleSettings();
  const items = extractScheduleItems(state.treeData || []);
  ensureInitialDates(items, cfg.startDate);
  const cpm = recalculateScheduleCPM(items);
  const concepts = items.filter(i => i.tipo === 'concepto');

  const todayDt = parseDate(getGanttTodayDate() || formatDate(new Date()));
  const { pctMap, actualGlobalPct } = getProgressMapFromEstimaciones();

  let subViewHtml = '';
  if (calView === 'agenda') {
    subViewHtml = renderAgendaSubView(concepts, { pctMap, todayDt, cpm, locked, canEditRole, editable, onJumpComprasExplosion });
  } else if (calView === 'curvas') {
    subViewHtml = renderCurvaSSubView(items, concepts, { actualGlobalPct, todayDt });
  } else {
    subViewHtml = renderGanttSubView(concepts, { pctMap, todayDt, locked, canEditRole, editable, onJumpComprasExplosion });
  }

  container.innerHTML = `
    <div class="m-cal-head">
      <div class="m-cal-head-info">
        <h2 class="m-cal-head-title">Calendario de Obra</h2>
        <p class="m-cal-head-sub">${escapeHtml(buildWorkdaysSubtitle())}</p>
      </div>
      <div class="m-cal-tabs" role="tablist" aria-label="Vistas de Calendario">
        <button type="button" class="m-cal-tab ${calView === 'agenda' ? 'is-active' : ''}" data-cal-view="agenda">
          <i class="fa-solid fa-calendar-check"></i><span>Agenda</span>
        </button>
        <button type="button" class="m-cal-tab ${calView === 'gantt' ? 'is-active' : ''}" data-cal-view="gantt">
          <i class="fa-solid fa-chart-gantt"></i><span>Gantt</span>
        </button>
        <button type="button" class="m-cal-tab ${calView === 'curvas' ? 'is-active' : ''}" data-cal-view="curvas">
          <i class="fa-solid fa-chart-line"></i><span>Curva S</span>
        </button>
      </div>
    </div>

    ${subViewHtml}
  `;

  container.querySelectorAll('[data-cal-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      calView = btn.dataset.calView || 'gantt';
      renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
    });
  });

  document.getElementById('m-cal-lock')?.addEventListener('click', () => {
    setTabLocked('calendario', !locked, { notify: true, rerender: false });
    renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
  });

  document.getElementById('m-gantt-filter-crit')?.addEventListener('click', () => {
    ganttOnlyCritical = !ganttOnlyCritical;
    renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
  });

  container.querySelectorAll('[data-cal-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      calFilter = btn.dataset.calFilter || 'all';
      renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
    });
  });

  container.querySelectorAll('[data-cs-scale]').forEach(btn => {
    btn.addEventListener('click', () => {
      curvaScale = btn.dataset.csScale || 'semanas';
      renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
    });
  });

  document.getElementById('m-cal-pedir-7d')?.addEventListener('click', () => onJumpComprasExplosion?.());

  document.getElementById('m-cal-auto')?.addEventListener('click', () => {
    autoDistributeAllSchedule(cfg.startDate);
    showToast('Actividades auto-programadas.', 'success');
    renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
  });

  container.querySelectorAll('.m-cal-edit-trigger').forEach(row => {
    row.addEventListener('click', () => {
      const target = concepts.find(c => String(c.id) === String(row.dataset.id));
      if (!target) return;
      openConceptScheduleSheet({
        target,
        concepts,
        items,
        pctMap,
        editable,
        canEditRole,
        locked,
        openSheet,
        closeSheet,
        container,
        onJumpComprasExplosion
      });
    });
  });
}
