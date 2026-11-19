// js/mobile/mobileCompras.js
// Control de Compras y Gastos: Resumen, Órdenes, Explosión 7/15 días, Base vs Real, Evidencia S3 y Envío a Almacén

import { formatMoney, formatQty, round2 } from '../core/formatters.js?v=20261117_cf30';
import {
  getExpensesRecords,
  saveExpenseRecord,
  saveExpenseRecordsBatch,
  deleteExpenseRecord,
  toggleRecordPaymentStatus,
  getExpensesSuppliers,
  saveSupplier
} from '../modules/compras/expensesModel.js?v=20261117_cf30';
import { getExpensesKpiMetrics, getInsumosBudgetVsActualComparison, getAllBudgetInsumosExplosion } from '../modules/compras/expensesCalculations.js?v=20261117_cf30';
import { getCalendarUpcomingConceptsSummary, explodeWeeklyConceptsBasket } from '../modules/compras/conceptExplosionHelper.js?v=20261117_cf30';
import { processExpenseEvidenceUpload, openExpenseEvidence } from '../modules/compras/driveExpenseService.js?v=20261117_cf30';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261117_cf30';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261117_cf30';
import { showToast } from '../ui/notifications.js?v=20261117_cf30';
import { escapeHtml, isBodegueroRestricted } from './mobileBridge.js?v=20261117_cf30';

let subTab = 'ordenes'; // 'resumen' | 'ordenes' | 'explosion' | 'comparativa'
let statusFilter = 'all'; // 'all' | 'pending' | 'paid' | 'warehouse' | 'direct'
let searchQuery = '';
let explosionDays = 7;

export function setComprasExplosionMode(days = 7) {
  subTab = 'explosion';
  explosionDays = days === 15 ? 15 : 7;
}

export function renderMobileCompras(container, { openSheet, closeSheet }) {
  if (!container) return;

  if (isBodegueroRestricted()) {
    container.innerHTML = '<div class="m-card" style="text-align:center;padding:24px;"><i class="fa-solid fa-lock"></i> Pestaña restringida para rol Almacenista.</div>';
    return;
  }

  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('compras');
  const editable = canEditRole && !locked;

  const kpis = getExpensesKpiMetrics();
  const records = getExpensesRecords();

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">
          ${!canEditRole ? 'Solo lectura' : (locked ? 'Compras protegidas' : 'Edición de compras activa')}
        </span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-comp-lock-btn" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">
          ${locked ? 'Desbloquear' : 'Proteger'}
        </button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Total Comprado</div>
        <div class="m-kpi-value" style="color:var(--primary);">${escapeHtml(formatMoney(kpis.totalEgresosComprometidos || kpis.totalEgresosReales || 0))}</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Por Pagar</div>
        <div class="m-kpi-value" style="color:var(--warn);">${escapeHtml(formatMoney(kpis.totalEgresosPorPagar || 0))}</div>
      </div>
    </div>

    <div class="m-chip-bar">
      <button type="button" data-comp-sub="ordenes" class="m-chip ${subTab === 'ordenes' ? 'is-active' : ''}">Órdenes (${records.length})</button>
      <button type="button" data-comp-sub="resumen" class="m-chip ${subTab === 'resumen' ? 'is-active' : ''}">Resumen</button>
      <button type="button" data-comp-sub="explosion" class="m-chip ${subTab === 'explosion' ? 'is-active' : ''}">Explosión 7/15d</button>
      <button type="button" data-comp-sub="comparativa" class="m-chip ${subTab === 'comparativa' ? 'is-active' : ''}">Base vs Real</button>
    </div>

    <div id="m-comp-body" style="display:flex;flex-direction:column;gap:10px;"></div>
  `;

  container.querySelector('#m-comp-lock-btn')?.addEventListener('click', () => {
    setTabLocked('compras', !locked);
    renderMobileCompras(container, { openSheet, closeSheet });
  });

  container.querySelectorAll('[data-comp-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      subTab = btn.dataset.compSub;
      renderMobileCompras(container, { openSheet, closeSheet });
    });
  });

  const body = container.querySelector('#m-comp-body');
  if (subTab === 'resumen') {
    renderComprasResumen(body, kpis);
  } else if (subTab === 'explosion') {
    renderComprasExplosion(body, container, { editable, openSheet, closeSheet });
  } else if (subTab === 'comparativa') {
    renderComprasComparativa(body);
  } else {
    renderComprasOrdenes(body, container, records, { editable, openSheet, closeSheet });
  }
}

function renderComprasResumen(body, kpis) {
  body.innerHTML = `
    <div class="m-card" style="display:flex;flex-direction:column;gap:10px;">
      <div style="font-size:13.5px;font-weight:800;">Estado Financiero de Compras</div>
      <div class="m-row-between"><span>Presupuesto Contratado</span><strong class="m-mono">${escapeHtml(formatMoney(kpis.presupuestoContratado || 0))}</strong></div>
      <div class="m-row-between"><span>Total Comprado (Comprometido)</span><strong class="m-mono" style="color:var(--primary);">${escapeHtml(formatMoney(kpis.totalEgresosComprometidos || 0))}</strong></div>
      <div class="m-row-between"><span>Pagado Real</span><strong class="m-mono" style="color:var(--success);">${escapeHtml(formatMoney(kpis.totalEgresosReales || 0))}</strong></div>
      <div class="m-row-between"><span>Saldo Pendiente por Pagar</span><strong class="m-mono" style="color:var(--warn);">${escapeHtml(formatMoney(kpis.totalEgresosPorPagar || 0))}</strong></div>
      <div class="m-row-between"><span>Valor en Almacén</span><strong class="m-mono">${escapeHtml(formatMoney(kpis.valorInventarioBodega || 0))}</strong></div>
    </div>
  `;
}

function renderComprasOrdenes(body, container, records, ctx) {
  let list = records;
  if (statusFilter === 'pending') list = list.filter(r => r.paymentStatus === 'pending' || r.paymentStatus === 'partial');
  else if (statusFilter === 'paid') list = list.filter(r => r.paymentStatus === 'paid');
  else if (statusFilter === 'warehouse') list = list.filter(r => r.destination === 'warehouse');
  else if (statusFilter === 'direct') list = list.filter(r => r.destination !== 'warehouse');

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(r =>
      String(r.description || '').toLowerCase().includes(q)
      || String(r.supplierName || '').toLowerCase().includes(q)
      || String(r.folio || r.orderGroupId || '').toLowerCase().includes(q)
    );
  }

  body.innerHTML = `
    <div class="m-row">
      <input type="search" id="m-comp-search" class="m-input" value="${escapeHtml(searchQuery)}" placeholder="Buscar material, proveedor o folio..." style="flex:1;">
      ${ctx.editable ? `
        <button type="button" id="m-comp-new" class="m-btn m-btn-primary m-btn-sm">
          <i class="fa-solid fa-plus"></i> Compra
        </button>
      ` : ''}
    </div>
    <div class="m-chip-bar">
      ${[
        ['all', 'Todas'],
        ['pending', 'Por pagar'],
        ['paid', 'Pagadas'],
        ['warehouse', 'A Almacén'],
        ['direct', 'Directo Obra']
      ].map(([k, lbl]) => `
        <button type="button" data-comp-st="${k}" class="m-chip ${statusFilter === k ? 'is-active' : ''}">${lbl}</button>
      `).join('')}
    </div>
    ${list.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">
        <i class="fa-solid fa-cart-shopping" style="font-size:26px;margin-bottom:8px;display:block;"></i>
        Sin órdenes registradas en este filtro.
      </div>
    ` : list.map(rec => {
      const unitVal = Number(rec.unitPrice ?? rec.unitCost ?? 0);
      const total = round2(rec.total || rec.totalAmount || (Number(rec.quantity || 0) * unitVal));
      const paid = rec.paymentStatus === 'paid';
      const toWh = rec.destination === 'warehouse';
      return `
        <div class="m-card" style="display:flex;flex-direction:column;gap:7px;">
          <div class="m-row-between">
            <div class="m-row">
              <span class="m-pill ${toWh ? 'm-pill-blue' : 'm-pill-neutral'}">${toWh ? '<i class="fa-solid fa-warehouse"></i> Almacén' : 'Directo Obra'}</span>
              <span class="m-pill ${paid ? 'm-pill-green' : 'm-pill-warn'}">${paid ? 'Pagada' : 'Pendiente'}</span>
            </div>
            <span class="m-mono" style="font-size:13.5px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(total))}</span>
          </div>
          <div style="font-size:13px;font-weight:700;">${escapeHtml(rec.description || 'Insumo')}</div>
          <div class="m-row-between" style="font-size:11.5px;color:var(--muted);">
            <span>${escapeHtml(rec.supplierName || 'Sin proveedor')} &bull; ${escapeHtml(String(rec.date || '').slice(0, 10))}</span>
            <span class="m-mono">${escapeHtml(formatQty(rec.quantity || 0))} ${escapeHtml(rec.unit || 'pza')} &times; ${escapeHtml(formatMoney(unitVal))}</span>
          </div>
          <div class="m-row-between" style="padding-top:6px;border-top:1px solid var(--border);">
            <div class="m-row">
              ${rec.evidence ? `
                <button type="button" data-view-ev="${escapeHtml(rec.id)}" class="m-btn m-btn-soft m-btn-sm">
                  <i class="fa-solid fa-image"></i> Ticket
                </button>
              ` : (ctx.editable ? `
                <label class="m-btn m-btn-outline m-btn-sm" style="cursor:pointer;">
                  <i class="fa-solid fa-camera"></i> Subir Ticket
                  <input type="file" data-up-ev="${escapeHtml(rec.id)}" accept="image/*,.pdf" style="display:none;">
                </label>
              ` : '')}
            </div>
            ${ctx.editable ? `
              <div class="m-row">
                <button type="button" data-toggle-paid="${escapeHtml(rec.id)}" class="m-btn m-btn-outline m-btn-sm">
                  <i class="fa-solid ${paid ? 'fa-rotate-left' : 'fa-check'}"></i> ${paid ? 'Pendiente' : 'Pagar'}
                </button>
                <button type="button" data-del-rec="${escapeHtml(rec.id)}" class="m-icon-btn" style="width:30px;height:30px;color:var(--danger);" title="Eliminar">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('')}
  `;

  const sInput = body.querySelector('#m-comp-search');
  sInput?.addEventListener('input', (ev) => {
    searchQuery = ev.target.value;
    const pos = ev.target.selectionStart;
    renderComprasOrdenes(body, container, getExpensesRecords(), ctx);
    const next = body.querySelector('#m-comp-search');
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  body.querySelectorAll('[data-comp-st]').forEach(b => {
    b.addEventListener('click', () => {
      statusFilter = b.dataset.compSt;
      renderComprasOrdenes(body, container, getExpensesRecords(), ctx);
    });
  });

  body.querySelector('#m-comp-new')?.addEventListener('click', () => {
    openNewPurchaseSheet(container, ctx);
  });

  body.querySelectorAll('[data-toggle-paid]').forEach(b => {
    b.addEventListener('click', () => {
      toggleRecordPaymentStatus(b.dataset.togglePaid);
      showToast('Estado de pago actualizado.', 'success');
      renderMobileCompras(container, ctx);
    });
  });

  body.querySelectorAll('[data-del-rec]').forEach(b => {
    b.addEventListener('click', () => {
      if (!confirm('¿Eliminar esta orden de compra?')) return;
      deleteExpenseRecord(b.dataset.delRec);
      showToast('Compra eliminada.', 'info');
      renderMobileCompras(container, ctx);
    });
  });

  body.querySelectorAll('[data-view-ev]').forEach(b => {
    b.addEventListener('click', () => {
      const rec = getExpensesRecords().find(r => r.id === b.dataset.viewEv);
      if (rec?.evidence) openExpenseEvidence(rec.evidence);
    });
  });

  body.querySelectorAll('[data-up-ev]').forEach(inp => {
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      const recId = inp.dataset.upEv;
      const rec = getExpensesRecords().find(r => r.id === recId);
      if (!file || !rec) return;
      try {
        const evidence = await processExpenseEvidenceUpload(file, 'Obra', recId);
        saveExpenseRecord({ ...rec, evidence });
        showToast('Comprobante guardado en AWS S3.', 'success');
        renderMobileCompras(container, ctx);
      } catch (err) {
        showToast(err?.message || 'Error al subir comprobante.', 'error');
      }
    });
  });
}

function renderComprasExplosion(body, container, ctx) {
  const upcoming = getCalendarUpcomingConceptsSummary(explosionDays);
  const basket = (upcoming || []).map(c => ({ conceptId: c.conceptId || c.id, qtyToExecute: round2(c.suggestedQty || c.cantidad || 1) }));
  const expRes = basket.length > 0 ? explodeWeeklyConceptsBasket(basket) : { insumos: [] };
  const exploded = Array.isArray(expRes) ? expRes : (expRes?.insumos || []);

  body.innerHTML = `
    <div class="m-segmented">
      <button type="button" data-exp-d="7" class="m-seg-btn ${explosionDays === 7 ? 'is-active' : ''}">Próximos 7 días</button>
      <button type="button" data-exp-d="15" class="m-seg-btn ${explosionDays === 15 ? 'is-active' : ''}">Próximos 15 días</button>
    </div>

    ${exploded.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">
        No hay conceptos programados en el calendario para los próximos ${explosionDays} días.
      </div>
    ` : `
      <div class="m-card-alt m-row-between">
        <span style="font-size:12px;font-weight:700;">${exploded.length} insumos sugeridos desde Calendario</span>
        ${ctx.editable ? `
          <button type="button" id="m-exp-gen-all" class="m-btn m-btn-primary m-btn-sm">
            <i class="fa-solid fa-bolt"></i> Generar Órdenes a Almacén
          </button>
        ` : ''}
      </div>
      ${exploded.map(row => {
        const qtyReq = round2(row.cantidadCalculada ?? row.suggestedQty ?? 0);
        const unitP = round2(row.suggestedPrice ?? row.puPresupuestado ?? 0);
        return `
          <div class="m-card">
            <div class="m-row-between">
              <span class="m-pill m-pill-blue">${escapeHtml(row.tipo || row.category || 'Material')}</span>
              <span class="m-mono" style="font-size:12.5px;font-weight:800;">${escapeHtml(formatMoney(round2(qtyReq * unitP)))}</span>
            </div>
            <div style="font-size:12.5px;font-weight:700;margin:4px 0;">${escapeHtml(row.descripcion || row.description || '')}</div>
            <div class="m-mono" style="font-size:11px;color:var(--muted);">
              Req: ${escapeHtml(formatQty(qtyReq))} ${escapeHtml(row.unidad || row.unit || 'pza')} &bull; P.U. Base: ${escapeHtml(formatMoney(unitP))}
            </div>
          </div>
        `;
      }).join('')}
    `}
  `;

  body.querySelectorAll('[data-exp-d]').forEach(b => {
    b.addEventListener('click', () => {
      explosionDays = parseInt(b.dataset.expD, 10) || 7;
      renderComprasExplosion(body, container, ctx);
    });
  });

  body.querySelector('#m-exp-gen-all')?.addEventListener('click', () => {
    const batch = exploded.map(r => ({
      insumoId: r.insumoKey || '',
      insumoClave: r.clave || '',
      description: r.descripcion || r.description || '',
      category: r.tipo || r.category || 'Material',
      unit: r.unidad || r.unit || 'pza',
      quantity: round2(r.cantidadCalculada ?? r.suggestedQty ?? 1),
      unitPrice: round2(r.suggestedPrice ?? r.puPresupuestado ?? 0),
      tax: 0,
      destination: 'warehouse',
      paymentStatus: 'pending',
      date: new Date().toISOString().slice(0, 10)
    }));
    saveExpenseRecordsBatch(batch);
    showToast(`${batch.length} partidas enviadas a Órdenes (Almacén).`, 'success');
    subTab = 'ordenes';
    renderMobileCompras(container, ctx);
  });
}

function renderComprasComparativa(body) {
  const cmp = getInsumosBudgetVsActualComparison();
  const rows = Array.isArray(cmp) ? cmp : (cmp?.items || []);
  if (rows.length === 0) {
    body.innerHTML = '<div class="m-card" style="text-align:center;padding:24px;color:var(--muted);">Sin insumos comparables todavía.</div>';
    return;
  }
  body.innerHTML = rows.slice(0, 80).map(r => {
    const budgetAmt = r.importePresupuestado ?? r.budgetAmount ?? 0;
    const actualAmt = r.importeComprado ?? r.actualAmount ?? 0;
    const diff = round2(budgetAmt - actualAmt);
    const ok = diff >= 0;
    return `
      <div class="m-card">
        <div class="m-row-between">
          <div style="font-size:12.5px;font-weight:700;flex:1;min-width:0;">${escapeHtml(r.descripcion || r.description || '')}</div>
          <span class="m-pill ${ok ? 'm-pill-green' : 'm-pill-red'} m-mono">${ok ? '+' : ''}${escapeHtml(formatMoney(diff))}</span>
        </div>
        <div class="m-row-between" style="margin-top:6px;font-size:11px;color:var(--muted);">
          <span class="m-mono">Base: ${escapeHtml(formatMoney(budgetAmt))}</span>
          <span class="m-mono">Real: ${escapeHtml(formatMoney(actualAmt))}</span>
        </div>
      </div>
    `;
  }).join('');
}

function openNewPurchaseSheet(container, ctx) {
  const budgetInsumos = getAllBudgetInsumosExplosion() || [];
  const suppliers = getExpensesSuppliers() || [];
  let attachedEvidence = null;

  ctx.openSheet({
    title: 'Nueva Compra / Gasto',
    bodyHtml: `
      <form id="m-new-buy-form" style="display:flex;flex-direction:column;gap:10px;">
        ${budgetInsumos.length > 0 ? `
          <div>
            <label class="m-label" for="m-nb-pick">Cargar insumo del presupuesto (opcional)</label>
            <select id="m-nb-pick" class="m-select">
              <option value="">-- Captura manual --</option>
              ${budgetInsumos.map((ins, i) => `
                <option value="${i}">${escapeHtml(ins.descripcion || ins.description || '')} (${escapeHtml(ins.unidad || ins.unit || 'pza')})</option>
              `).join('')}
            </select>
          </div>
        ` : ''}
        <div>
          <label class="m-label" for="m-nb-desc">Material / Concepto *</label>
          <input id="m-nb-desc" class="m-input" required placeholder="Ej. Cemento Portland Gris 50kg">
        </div>
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-nb-cat">Rubro</label>
            <select id="m-nb-cat" class="m-select">
              <option value="Material">Material</option>
              <option value="Mano de Obra">Mano de Obra</option>
              <option value="Herramienta">Herramienta</option>
              <option value="Equipo">Equipo</option>
              <option value="Maquinaria">Maquinaria</option>
              <option value="Subcontrato">Subcontrato</option>
            </select>
          </div>
          <div>
            <label class="m-label" for="m-nb-unid">Unidad</label>
            <input id="m-nb-unid" class="m-input" value="pza" required>
          </div>
        </div>
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-nb-qty">Cantidad *</label>
            <input id="m-nb-qty" type="number" step="0.01" min="0.01" required class="m-input m-mono" value="1">
          </div>
          <div>
            <label class="m-label" for="m-nb-cu">Precio Unitario *</label>
            <input id="m-nb-cu" type="number" step="0.01" min="0" required class="m-input m-mono" value="0">
          </div>
        </div>
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-nb-dest">Destino</label>
            <select id="m-nb-dest" class="m-select">
              <option value="warehouse">Enviar a Almacén</option>
              <option value="direct">Directo a Obra</option>
            </select>
          </div>
          <div>
            <label class="m-label" for="m-nb-status">Pago</label>
            <select id="m-nb-status" class="m-select">
              <option value="pending">Por pagar</option>
              <option value="paid">Pagado</option>
            </select>
          </div>
        </div>
        <div>
          <label class="m-label" for="m-nb-sup">Proveedor</label>
          <input id="m-nb-sup" class="m-input" list="m-sup-datalist" placeholder="Nombre del proveedor">
          <datalist id="m-sup-datalist">
            ${suppliers.map(s => `<option value="${escapeHtml(s.name)}"></option>`).join('')}
          </datalist>
        </div>
        <div>
          <label class="m-btn m-btn-outline m-btn-sm" style="cursor:pointer;width:100%;">
            <i class="fa-solid fa-camera"></i> <span id="m-nb-ev-lbl">Adjuntar foto / ticket (S3)</span>
            <input type="file" id="m-nb-ev" accept="image/*,.pdf" style="display:none;">
          </label>
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" id="m-nb-cancel" class="m-btn m-btn-outline">Cancelar</button>
      <button type="submit" form="m-new-buy-form" class="m-btn m-btn-primary">
        <i class="fa-solid fa-floppy-disk"></i> Guardar Compra
      </button>
    `
  });

  document.getElementById('m-nb-cancel')?.addEventListener('click', ctx.closeSheet);
  let pickedInsumo = null;
  document.getElementById('m-nb-pick')?.addEventListener('change', (ev) => {
    const idx = parseInt(ev.target.value, 10);
    const ins = budgetInsumos[idx];
    pickedInsumo = ins || null;
    if (!ins) return;
    document.getElementById('m-nb-desc').value = ins.descripcion || ins.description || '';
    document.getElementById('m-nb-cat').value = ins.tipo || ins.category || 'Material';
    document.getElementById('m-nb-unid').value = ins.unidad || ins.unit || 'pza';
    document.getElementById('m-nb-cu').value = round2(ins.puPresupuestado ?? ins.budgetUnitCost ?? 0);
  });

  document.getElementById('m-nb-ev')?.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      attachedEvidence = await processExpenseEvidenceUpload(file, 'Obra', `cmp_${Date.now()}`);
      document.getElementById('m-nb-ev-lbl').textContent = `Adjunto: ${attachedEvidence.fileName}`;
    } catch (err) {
      showToast(err?.message || 'No se pudo subir comprobante.', 'error');
    }
  });

  document.getElementById('m-new-buy-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const supName = document.getElementById('m-nb-sup').value.trim();
    let supObj = suppliers.find(s => (s.name || '').toLowerCase() === supName.toLowerCase());
    if (supName && !supObj) {
      supObj = saveSupplier({ name: supName });
    }
    saveExpenseRecord({
      insumoId: pickedInsumo?.key || '',
      insumoClave: pickedInsumo?.clave || '',
      description: document.getElementById('m-nb-desc').value.trim(),
      category: document.getElementById('m-nb-cat').value,
      unit: document.getElementById('m-nb-unid').value.trim() || 'pza',
      quantity: round2(parseFloat(document.getElementById('m-nb-qty').value) || 0),
      unitPrice: round2(parseFloat(document.getElementById('m-nb-cu').value) || 0),
      tax: 0,
      destination: document.getElementById('m-nb-dest').value,
      paymentStatus: document.getElementById('m-nb-status').value,
      supplierId: supObj?.id || '',
      supplierName: supObj?.name || supName || '',
      evidence: attachedEvidence,
      date: new Date().toISOString().slice(0, 10)
    });
    ctx.closeSheet();
    showToast('Compra guardada y sincronizada.', 'success');
    renderMobileCompras(container, ctx);
  });
}
