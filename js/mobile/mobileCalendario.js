// js/mobile/mobileCalendario.js
// Programa de Obra (Calendario): Ruta Crítica CPM, duraciones, fechas, avance ejecutado y explosión a Compras

import { state } from '../state/store.js?v=20261117_cf30';
import { formatMoney, formatQty, round2 } from '../core/formatters.js?v=20261117_cf30';
import {
  extractScheduleItems,
  ensureInitialDates,
  recalculateScheduleCPM,
  getScheduleSettings,
  autoDistributeAllSchedule,
  updateConceptDatesInModel,
  parseDate
} from '../modules/calendario/calendarioModel.js?v=20261117_cf30';
import { getEstimacionesCalculatedData } from '../modules/estimaciones/estimacionesModel.js?v=20261117_cf30';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261117_cf30';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261117_cf30';
import { showToast } from '../ui/notifications.js?v=20261117_cf30';
import { escapeHtml, isBodegueroRestricted } from './mobileBridge.js?v=20261117_cf30';

let calFilter = 'all'; // 'all' | 'critical' | 'upcoming'

export function renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion }) {
  if (!container) return;

  if (isBodegueroRestricted()) {
    container.innerHTML = '<div class="m-card" style="text-align:center;padding:24px;"><i class="fa-solid fa-lock"></i> Pestaña restringida.</div>';
    return;
  }

  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('calendario');
  const editable = canEditRole && !locked;

  const cfg = getScheduleSettings();
  const items = extractScheduleItems(state.treeData || []);
  ensureInitialDates(items, cfg.startDate);
  const cpmSummary = recalculateScheduleCPM(items);

  const concepts = items.filter(it => it.tipo === 'concepto');
  const criticalCount = concepts.filter(c => c.isCritical).length;
  const estData = getEstimacionesCalculatedData();
  const estRowMap = new Map((estData.rows || []).filter(r => !r.isParent).map(r => [String(r.id), r]));

  const today = new Date();
  const next7 = new Date(today.getTime() + 7 * 86400000);
  let visible = concepts;
  if (calFilter === 'critical') {
    visible = concepts.filter(c => c.isCritical);
  } else if (calFilter === 'upcoming') {
    visible = concepts.filter(c => {
      const s = parseDate(c.startDate);
      const e = parseDate(c.endDate);
      return (s <= next7 && e >= today) || (s >= today && s <= next7);
    });
  }

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">
          ${!canEditRole ? 'Solo lectura' : (locked ? 'Calendario protegido' : 'Edición de fechas activa')}
        </span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-cal-lock-btn" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">
          ${locked ? 'Desbloquear' : 'Proteger'}
        </button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Inicio / Fin Obra</div>
        <div class="m-kpi-value m-mono" style="font-size:13px;">${escapeHtml(cpmSummary?.projectStartDate || cfg.startDate || '-')} &rarr; ${escapeHtml(cpmSummary?.projectEndDate || '-')}</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Ruta Crítica CPM</div>
        <div class="m-kpi-value" style="color:var(--danger);font-size:14px;">${criticalCount} crítica${criticalCount === 1 ? '' : 's'} &bull; ${Number(cpmSummary?.totalDurationDays || 0)}d</div>
      </div>
    </div>

    <div class="m-row-between">
      <div class="m-chip-bar" style="flex:1;">
        <button type="button" data-cal-f="all" class="m-chip ${calFilter === 'all' ? 'is-active' : ''}">Todos (${concepts.length})</button>
        <button type="button" data-cal-f="critical" class="m-chip ${calFilter === 'critical' ? 'is-active' : ''}">
          <i class="fa-solid fa-fire"></i> Crítica (${criticalCount})
        </button>
        <button type="button" data-cal-f="upcoming" class="m-chip ${calFilter === 'upcoming' ? 'is-active' : ''}">Próx. 7d</button>
      </div>
      <button type="button" id="m-cal-buy-7d" class="m-btn m-btn-soft m-btn-sm">
        <i class="fa-solid fa-cart-shopping"></i> Pedir 7d
      </button>
    </div>

    ${editable ? `
      <div class="m-row-between">
        <span style="font-size:11.5px;color:var(--muted);">Toca un concepto para ajustar fecha de inicio o duración</span>
        <button type="button" id="m-cal-auto" class="m-btn m-btn-outline m-btn-sm">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Auto-programar
        </button>
      </div>
    ` : ''}

    ${visible.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">
        <i class="fa-solid fa-calendar-days" style="font-size:26px;margin-bottom:8px;display:block;"></i>
        No hay conceptos en este filtro de programa.
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${visible.map(c => {
          const estRow = estRowMap.get(String(c.id));
          const execTotal = estRow ? round2((estRow.cantAnt || 0) + (estRow.cantEje || 0)) : 0;
          const baseCant = round2(c.node?.cantidad || 0);
          const pct = baseCant > 0 ? Math.min(100, Math.round((execTotal / baseCant) * 100)) : 0;
          return `
            <div class="m-card" ${editable ? `data-edit-cal="${escapeHtml(c.id)}" style="cursor:pointer;"` : ''}>
              <div class="m-row-between" style="margin-bottom:4px;">
                <span class="m-pill ${c.isCritical ? 'm-pill-red' : 'm-pill-blue'} m-mono">
                  ${c.isCritical ? '<i class="fa-solid fa-fire"></i> ' : ''}${escapeHtml(c.clave || '')}
                </span>
                <span class="m-mono" style="font-size:11.5px;font-weight:800;">${Number(c.durationDays || 1)} días</span>
              </div>
              <div style="font-size:12.5px;font-weight:700;line-height:1.35;">${escapeHtml(c.descripcion || '')}</div>
              <div class="m-row-between" style="margin-top:6px;font-size:11px;color:var(--muted);">
                <span class="m-mono"><i class="fa-regular fa-calendar"></i> ${escapeHtml(c.startDate || '-')} &rarr; ${escapeHtml(c.endDate || '-')}</span>
                <span class="m-mono" style="font-weight:700;color:var(--text-soft);">${escapeHtml(formatMoney(c.importe || 0))}</span>
              </div>
              <div style="margin-top:7px;">
                <div class="m-row-between" style="font-size:10.5px;color:var(--muted);margin-bottom:3px;">
                  <span>Avance estimado: ${pct}%</span>
                  <span class="m-mono">${escapeHtml(formatQty(execTotal))} / ${escapeHtml(formatQty(baseCant))} ${escapeHtml(c.node?.unidad || '')}</span>
                </div>
                <div class="m-progress-track">
                  <div class="m-progress-fill" style="width:${pct}%;background:${c.isCritical ? 'var(--danger)' : 'var(--primary)'};"></div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  container.querySelector('#m-cal-lock-btn')?.addEventListener('click', () => {
    setTabLocked('calendario', !locked);
    renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
  });

  container.querySelectorAll('[data-cal-f]').forEach(btn => {
    btn.addEventListener('click', () => {
      calFilter = btn.dataset.calF;
      renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
    });
  });

  container.querySelector('#m-cal-buy-7d')?.addEventListener('click', () => {
    onJumpComprasExplosion?.(7);
  });

  container.querySelector('#m-cal-auto')?.addEventListener('click', () => {
    autoDistributeAllSchedule(cfg.startDate);
    showToast('Programa auto-calculado secuencialmente.', 'success');
    renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
  });

  container.querySelectorAll('[data-edit-cal]').forEach(card => {
    card.addEventListener('click', () => {
      const target = concepts.find(c => String(c.id) === String(card.dataset.editCal));
      if (!target) return;
      openSheet({
        title: `Programar ${target.clave || ''}`,
        bodyHtml: `
          <form id="m-cal-edit-form" style="display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:12.5px;font-weight:700;">${escapeHtml(target.descripcion || '')}</div>
            <div class="m-grid-2">
              <div>
                <label class="m-label" for="m-ce-start">Fecha inicio</label>
                <input id="m-ce-start" type="date" required class="m-input" value="${escapeHtml(target.startDate || cfg.startDate || '')}">
              </div>
              <div>
                <label class="m-label" for="m-ce-dur">Duración (días)</label>
                <input id="m-ce-dur" type="number" min="1" step="1" required class="m-input m-mono" value="${Number(target.durationDays || 3)}">
              </div>
            </div>
          </form>
        `,
        footerHtml: `
          <button type="button" id="m-ce-cancel" class="m-btn m-btn-outline">Cancelar</button>
          <button type="submit" form="m-cal-edit-form" class="m-btn m-btn-primary">Guardar</button>
        `
      });
      document.getElementById('m-ce-cancel')?.addEventListener('click', closeSheet);
      document.getElementById('m-cal-edit-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const s = document.getElementById('m-ce-start').value;
        const d = parseInt(document.getElementById('m-ce-dur').value, 10) || 1;
        updateConceptDatesInModel(target.id, s, d);
        closeSheet();
        showToast('Fechas actualizadas.', 'success');
        renderMobileCalendario(container, { openSheet, closeSheet, onJumpComprasExplosion });
      });
    });
  });
}
