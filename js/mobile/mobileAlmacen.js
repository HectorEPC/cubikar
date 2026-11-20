// js/mobile/mobileAlmacen.js
// Almacén de Obra — CERO precios ni montos monetarios (apto 100% para perfil aislado de Bodeguero)

import { formatQty, round2 } from '../core/formatters.js?v=20261119_cf41';
import {
  getWarehouseStockSummary,
  getWarehouseReceptionsView,
  getWarehouseMovements,
  confirmWarehouseReception,
  createWarehouseMovement,
  markToolLoanReturned,
  cancelWarehouseMovement,
  getConceptCatalogForWarehouse
} from '../modules/almacen/almacenModel.js?v=20261119_cf41';
import { processExpenseEvidenceUpload, openExpenseEvidence } from '../modules/compras/driveExpenseService.js?v=20261119_cf41';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf41';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261119_cf41';
import { showToast } from '../ui/notifications.js?v=20261119_cf41';
import { escapeHtml } from './mobileBridge.js?v=20261119_cf41';

let subTab = 'stock'; // 'stock' | 'recepciones' | 'salidas' | 'herramienta'
let searchTerm = '';

export function renderMobileAlmacen(container, { openSheet, closeSheet }) {
  if (!container) return;

  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('almacen');
  const editable = canEditRole && !locked;

  const summary = getWarehouseStockSummary();
  const pendingRec = summary.pendingReceptionsCount || 0;
  const stockCount = (summary.items || []).filter(i => i.availableStock > 0).length;
  const activeTools = (summary.activeToolLoans || []).length;
  const exitsCount = getWarehouseMovements().filter(m => m.kind === 'exit' && m.status !== 'cancelled').length;

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">
          ${!canEditRole ? 'Almacén solo lectura' : (locked ? 'Almacén protegido (Solo consulta)' : 'Captura de Almacén activa')}
        </span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-alm-lock-btn" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">
          ${locked ? 'Desbloquear' : 'Proteger'}
        </button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">En Existencia</div>
        <div class="m-kpi-value" style="color:var(--primary);">${stockCount} insumos</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Pend. Recepción</div>
        <div class="m-kpi-value" style="color:${pendingRec > 0 ? 'var(--warn)' : 'var(--success)'};">${pendingRec} órdenes</div>
      </div>
    </div>

    <div class="m-chip-bar">
      <button type="button" data-alm-sub="stock" class="m-chip ${subTab === 'stock' ? 'is-active' : ''}">Inventario (${stockCount})</button>
      <button type="button" data-alm-sub="recepciones" class="m-chip ${subTab === 'recepciones' ? 'is-active' : ''}">Recepción (${pendingRec})</button>
      <button type="button" data-alm-sub="salidas" class="m-chip ${subTab === 'salidas' ? 'is-active' : ''}">Vales Salida (${exitsCount})</button>
      <button type="button" data-alm-sub="herramienta" class="m-chip ${subTab === 'herramienta' ? 'is-active' : ''}">Herram. (${activeTools})</button>
    </div>

    <div id="m-alm-body" style="display:flex;flex-direction:column;gap:10px;"></div>
  `;

  container.querySelector('#m-alm-lock-btn')?.addEventListener('click', () => {
    setTabLocked('almacen', !locked);
    renderMobileAlmacen(container, { openSheet, closeSheet });
  });

  container.querySelectorAll('[data-alm-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      subTab = btn.dataset.almSub;
      renderMobileAlmacen(container, { openSheet, closeSheet });
    });
  });

  const body = container.querySelector('#m-alm-body');
  if (subTab === 'recepciones') {
    renderReceptions(body, container, { editable, openSheet, closeSheet });
  } else if (subTab === 'salidas') {
    renderExits(body, container, { editable, openSheet, closeSheet });
  } else if (subTab === 'herramienta') {
    renderToolsAndAdjustments(body, container, summary, { editable, openSheet, closeSheet });
  } else {
    renderStock(body, summary);
  }
}

function renderStock(body, summary) {
  const q = searchTerm.trim().toLowerCase();
  const items = (summary.items || []).filter(i =>
    !q || String(i.description || '').toLowerCase().includes(q) || String(i.insumoClave || '').toLowerCase().includes(q)
  );

  body.innerHTML = `
    <input type="search" id="m-alm-search" class="m-input" value="${escapeHtml(searchTerm)}" placeholder="Buscar insumo en bodega...">
    ${items.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:24px;color:var(--muted);">Sin movimientos en bodega todavía.</div>
    ` : items.map(it => `
      <div class="m-card">
        <div class="m-row-between">
          <span style="font-size:13px;font-weight:700;flex:1;min-width:0;">${escapeHtml(it.description || '')}</span>
          <span class="m-pill ${it.availableStock > 0 ? 'm-pill-green' : 'm-pill-neutral'} m-mono">
            ${escapeHtml(formatQty(it.availableStock))} ${escapeHtml(it.unit || 'pza')}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;font-size:11px;text-align:center;">
          <div class="m-card-alt" style="padding:5px;"><div style="color:var(--muted);">Entradas</div><strong class="m-mono">${escapeHtml(formatQty(it.totalEnteredQty ?? it.enteredQty ?? 0))}</strong></div>
          <div class="m-card-alt" style="padding:5px;"><div style="color:var(--muted);">Salidas</div><strong class="m-mono">${escapeHtml(formatQty(it.totalExitedQty ?? it.exitedQty ?? 0))}</strong></div>
          <div class="m-card-alt" style="padding:5px;"><div style="color:var(--muted);">Saldo</div><strong class="m-mono">${escapeHtml(formatQty(it.availableStock || 0))}</strong></div>
        </div>
      </div>
    `).join('')}
  `;

  const inp = body.querySelector('#m-alm-search');
  inp?.addEventListener('input', (ev) => {
    searchTerm = ev.target.value;
    const pos = ev.target.selectionStart;
    renderStock(body, getWarehouseStockSummary());
    const next = body.querySelector('#m-alm-search');
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch (_) {}
    }
  });
}

function renderReceptions(body, container, ctx) {
  const recs = getWarehouseReceptionsView() || [];
  if (recs.length === 0) {
    body.innerHTML = '<div class="m-card" style="text-align:center;padding:24px;color:var(--muted);">Sin órdenes de compra pendientes de recepción.</div>';
    return;
  }

  body.innerHTML = recs.map(r => {
    const isComplete = r.status === 'complete' || r.receptionStatus === 'complete';
    const expected = r.expectedQty ?? r.orderedQty ?? 0;
    return `
      <div class="m-card" style="display:flex;flex-direction:column;gap:7px;">
        <div class="m-row-between">
          <span class="m-pill ${isComplete ? 'm-pill-green' : 'm-pill-warn'}">${isComplete ? 'Recibido completo' : 'Pendiente / Parcial'}</span>
          <span class="m-mono" style="font-size:12px;font-weight:800;">
            ${escapeHtml(formatQty(r.receivedQty || 0))} / ${escapeHtml(formatQty(expected))} ${escapeHtml(r.unit || 'pza')}
          </span>
        </div>
        <div style="font-size:13px;font-weight:700;">${escapeHtml(r.description || '')}</div>
        <div style="font-size:11.5px;color:var(--muted);">Proveedor: ${escapeHtml(r.supplierName || 'No especificado')}</div>
        <div class="m-row-between" style="padding-top:6px;border-top:1px solid var(--border);">
          <div>
            ${r.evidence ? `<button type="button" data-rec-ev="${escapeHtml(r.expenseId)}" class="m-btn m-btn-soft m-btn-sm"><i class="fa-solid fa-image"></i> Remisión</button>` : ''}
          </div>
          ${ctx.editable && !isComplete ? `
            <button type="button" data-open-rec="${escapeHtml(r.expenseId)}" class="m-btn m-btn-primary m-btn-sm">
              <i class="fa-solid fa-truck-ramp-box"></i> Recibir
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  body.querySelectorAll('[data-rec-ev]').forEach(b => {
    b.addEventListener('click', () => {
      const target = recs.find(x => x.expenseId === b.dataset.recEv);
      if (target?.evidence) openExpenseEvidence(target.evidence);
    });
  });

  body.querySelectorAll('[data-open-rec]').forEach(b => {
    b.addEventListener('click', () => {
      const target = recs.find(x => x.expenseId === b.dataset.openRec);
      if (!target) return;
      let evObj = null;
      const expected = target.expectedQty ?? target.orderedQty ?? 0;
      const pending = target.pendingQty ?? Math.max(0, round2(expected - (target.receivedQty || 0)));
      ctx.openSheet({
        title: 'Confirmar Recepción',
        bodyHtml: `
          <form id="m-rec-form" style="display:flex;flex-direction:column;gap:10px;">
            <div style="font-size:13px;font-weight:700;">${escapeHtml(target.description || '')}</div>
            <div class="m-grid-2">
              <div>
                <label class="m-label" for="m-r-qty">Cantidad recibida (${escapeHtml(target.unit || 'pza')}) *</label>
                <input id="m-r-qty" type="number" step="0.01" min="0.01" required class="m-input m-mono" value="${pending}">
              </div>
              <div>
                <label class="m-label" for="m-r-rem">No. Remisión / Nota</label>
                <input id="m-r-rem" class="m-input" placeholder="Folio remisión">
              </div>
            </div>
            <div>
              <label class="m-label" for="m-r-by">Recibió</label>
              <input id="m-r-by" class="m-input" placeholder="Nombre del almacenista">
            </div>
            <label class="m-btn m-btn-outline m-btn-sm" style="cursor:pointer;">
              <i class="fa-solid fa-camera"></i> <span id="m-r-ev-lbl">Foto de llegada (S3)</span>
              <input type="file" id="m-r-ev" accept="image/*" style="display:none;">
            </label>
          </form>
        `,
        footerHtml: `
          <button type="button" id="m-r-cancel" class="m-btn m-btn-outline">Cancelar</button>
          <button type="submit" form="m-rec-form" class="m-btn m-btn-success"><i class="fa-solid fa-check"></i> Confirmar</button>
        `
      });
      document.getElementById('m-r-cancel')?.addEventListener('click', ctx.closeSheet);
      document.getElementById('m-r-ev')?.addEventListener('change', async (ev) => {
        const f = ev.target.files?.[0];
        if (!f) return;
        try {
          evObj = await processExpenseEvidenceUpload(f, 'Obra', target.expenseId);
          document.getElementById('m-r-ev-lbl').textContent = `Foto lista: ${evObj.fileName}`;
        } catch (err) {
          showToast(err?.message || 'Error al subir foto.', 'error');
        }
      });
      document.getElementById('m-rec-form')?.addEventListener('submit', (ev) => {
        ev.preventDefault();
        try {
          confirmWarehouseReception(target.expenseId, document.getElementById('m-r-qty').value, {
            remisionNumber: document.getElementById('m-r-rem').value,
            receivedBy: document.getElementById('m-r-by').value,
            evidence: evObj
          });
          ctx.closeSheet();
          showToast('Recepción registrada en inventario.', 'success');
          renderMobileAlmacen(container, ctx);
        } catch (err) {
          showToast(err?.message || 'Error al registrar recepción.', 'error');
        }
      });
    });
  });
}

function renderExits(body, container, ctx) {
  const movs = getWarehouseMovements().filter(m => m.kind === 'exit');
  body.innerHTML = `
    <div class="m-row-between">
      <span style="font-size:12px;color:var(--muted);">Registro de entregas por concepto o frente</span>
      ${ctx.editable ? `
        <button type="button" id="m-new-exit" class="m-btn m-btn-primary m-btn-sm">
          <i class="fa-solid fa-plus"></i> Nuevo Vale
        </button>
      ` : ''}
    </div>
    ${movs.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:24px;color:var(--muted);">Sin vales de salida emitidos.</div>
    ` : movs.map(m => `
      <div class="m-card" style="${m.status === 'cancelled' ? 'opacity:0.55;' : ''}">
        <div class="m-row-between">
          <span class="m-pill m-pill-blue m-mono">${escapeHtml(m.folio || 'VS')}</span>
          <span style="font-size:11px;color:var(--muted);">${escapeHtml(m.date || '')}</span>
        </div>
        <div style="font-size:12.5px;font-weight:700;margin:5px 0;">
          ${escapeHtml(m.conceptDesc || m.frontName || 'Salida general')}
        </div>
        <div style="font-size:11.5px;color:var(--muted);">Recibió: ${escapeHtml(m.recipientName || 'Personal de obra')}</div>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;font-size:11.5px;">
          ${(m.items || []).map(it => `
            <div class="m-row-between">
              <span>${escapeHtml(it.description)}</span>
              <strong class="m-mono">${escapeHtml(formatQty(it.qty))} ${escapeHtml(it.unit)}</strong>
            </div>
          `).join('')}
        </div>
        ${ctx.editable && m.status !== 'cancelled' ? `
          <div style="text-align:right;margin-top:8px;">
            <button type="button" data-cancel-mov="${escapeHtml(m.id)}" class="m-btn m-btn-outline m-btn-sm" style="color:var(--danger);">Cancelar Vale</button>
          </div>
        ` : ''}
      </div>
    `).join('')}
  `;

  body.querySelector('#m-new-exit')?.addEventListener('click', () => openNewExitSheet(container, ctx));
  body.querySelectorAll('[data-cancel-mov]').forEach(b => {
    b.addEventListener('click', () => {
      cancelWarehouseMovement(b.dataset.cancelMov);
      showToast('Vale cancelado; stock reintegrado.', 'info');
      renderMobileAlmacen(container, ctx);
    });
  });
}

function openNewExitSheet(container, ctx) {
  const stockItems = (getWarehouseStockSummary().items || []).filter(i => i.availableStock > 0);
  const concepts = getConceptCatalogForWarehouse() || [];

  ctx.openSheet({
    title: 'Nuevo Vale de Salida',
    bodyHtml: `
      <form id="m-exit-form" style="display:flex;flex-direction:column;gap:10px;">
        ${concepts.length > 0 ? `
          <div>
            <label class="m-label" for="m-ex-conc">Concepto de obra (opcional)</label>
            <select id="m-ex-conc" class="m-select">
              <option value="">-- Salida general --</option>
              ${concepts.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.clave || '')} - ${escapeHtml(c.descripcion || '')}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <div>
          <label class="m-label" for="m-ex-item">Material en bodega *</label>
          <select id="m-ex-item" required class="m-select">
            ${stockItems.length === 0
              ? '<option value="">Sin stock disponible en bodega</option>'
              : stockItems.map((it, idx) => `<option value="${idx}">${escapeHtml(it.description)} (Disp: ${formatQty(it.availableStock)} ${escapeHtml(it.unit)})</option>`).join('')}
          </select>
        </div>
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-ex-qty">Cantidad *</label>
            <input id="m-ex-qty" type="number" step="0.01" min="0.01" required class="m-input m-mono" value="1">
          </div>
          <div>
            <label class="m-label" for="m-ex-rec">Recibe *</label>
            <input id="m-ex-rec" required class="m-input" placeholder="Cabo / Residente">
          </div>
        </div>
        <div>
          <label class="m-label" for="m-ex-front">Frente / Ubicación</label>
          <input id="m-ex-front" class="m-input" placeholder="Ej. Nivel 1, Cimentación">
        </div>
      </form>
    `,
    footerHtml: `
      <button type="button" id="m-ex-cancel" class="m-btn m-btn-outline">Cancelar</button>
      <button type="submit" form="m-exit-form" class="m-btn m-btn-primary" ${stockItems.length === 0 ? 'disabled' : ''}>Emitir Vale</button>
    `
  });

  document.getElementById('m-ex-cancel')?.addEventListener('click', ctx.closeSheet);
  document.getElementById('m-exit-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const sel = stockItems[parseInt(document.getElementById('m-ex-item').value, 10)];
    if (!sel) return;
    const concId = document.getElementById('m-ex-conc')?.value || '';
    const conc = concepts.find(c => String(c.id) === String(concId));
    try {
      createWarehouseMovement({
        kind: 'exit',
        conceptId: conc?.id || '',
        conceptClave: conc?.clave || '',
        conceptDesc: conc?.descripcion || '',
        frontName: document.getElementById('m-ex-front').value.trim(),
        recipientName: document.getElementById('m-ex-rec').value.trim(),
        items: [{
          insumoKey: sel.insumoKey,
          insumoClave: sel.insumoClave,
          description: sel.description,
          unit: sel.unit,
          qty: parseFloat(document.getElementById('m-ex-qty').value) || 0
        }]
      });
      ctx.closeSheet();
      showToast('Vale de salida registrado.', 'success');
      renderMobileAlmacen(container, ctx);
    } catch (err) {
      showToast(err?.message || 'Error al registrar salida.', 'error');
    }
  });
}

function renderToolsAndAdjustments(body, container, summary, ctx) {
  const loans = summary.activeToolLoans || [];
  body.innerHTML = `
    <div class="m-row-between">
      <span style="font-size:12px;color:var(--muted);">Resguardos de herramienta activos</span>
      ${ctx.editable ? `
        <button type="button" id="m-new-tool" class="m-btn m-btn-primary m-btn-sm">
          <i class="fa-solid fa-plus"></i> Préstamo
        </button>
      ` : ''}
    </div>
    ${loans.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:24px;color:var(--muted);">No hay herramientas prestadas en este momento.</div>
    ` : loans.map(l => `
      <div class="m-card">
        <div class="m-row-between">
          <span class="m-pill m-pill-warn m-mono">${escapeHtml(l.folio || 'PH')}</span>
          <span style="font-size:11px;color:var(--muted);">${escapeHtml(l.date || '')}</span>
        </div>
        <div style="font-size:12.5px;font-weight:700;margin-top:4px;">Responsable: ${escapeHtml(l.recipientName || '')}</div>
        <div style="font-size:11.5px;color:var(--muted);margin:4px 0;">
          ${(l.items || []).map(it => `${escapeHtml(it.description)} (${formatQty(it.qty)} ${escapeHtml(it.unit)})`).join(', ')}
        </div>
        ${ctx.editable ? `
          <button type="button" data-ret-tool="${escapeHtml(l.id)}" class="m-btn m-btn-success m-btn-sm" style="margin-top:4px;">
            <i class="fa-solid fa-check"></i> Marcar Devuelto
          </button>
        ` : ''}
      </div>
    `).join('')}
  `;

  body.querySelectorAll('[data-ret-tool]').forEach(b => {
    b.addEventListener('click', () => {
      markToolLoanReturned(b.dataset.retTool);
      showToast('Herramienta devuelta a bodega.', 'success');
      renderMobileAlmacen(container, ctx);
    });
  });

  body.querySelector('#m-new-tool')?.addEventListener('click', () => {
    ctx.openSheet({
      title: 'Préstamo de Herramienta',
      bodyHtml: `
        <form id="m-tool-form" style="display:flex;flex-direction:column;gap:10px;">
          <div>
            <label class="m-label" for="m-tl-desc">Herramienta / Equipo *</label>
            <input id="m-tl-desc" required class="m-input" placeholder="Ej. Revolvedora 1 saco / Rotomartillo">
          </div>
          <div class="m-grid-2">
            <div>
              <label class="m-label" for="m-tl-qty">Cantidad *</label>
              <input id="m-tl-qty" type="number" step="1" min="1" required class="m-input m-mono" value="1">
            </div>
            <div>
              <label class="m-label" for="m-tl-who">Responsable *</label>
              <input id="m-tl-who" required class="m-input" placeholder="Nombre trabajador">
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button type="button" id="m-tl-cancel" class="m-btn m-btn-outline">Cancelar</button>
        <button type="submit" form="m-tool-form" class="m-btn m-btn-primary">Registrar Préstamo</button>
      `
    });
    document.getElementById('m-tl-cancel')?.addEventListener('click', ctx.closeSheet);
    document.getElementById('m-tool-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      createWarehouseMovement({
        kind: 'tool_loan',
        allowNegativeStock: true,
        recipientName: document.getElementById('m-tl-who').value.trim(),
        items: [{
          description: document.getElementById('m-tl-desc').value.trim(),
          unit: 'pza',
          tipo: 'Herramienta',
          qty: parseFloat(document.getElementById('m-tl-qty').value) || 1
        }]
      });
      ctx.closeSheet();
      showToast('Préstamo registrado.', 'success');
      renderMobileAlmacen(container, ctx);
    });
  });
}
