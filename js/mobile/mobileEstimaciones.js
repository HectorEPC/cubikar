// js/mobile/mobileEstimaciones.js
// Estimaciones y Generadores: Anticipo 0, avance ejecutado +/-, fotos S3, Neto a Cobrar y bloqueo por estimación

import { formatMoney, formatQty, round2 } from '../core/formatters.js?v=20261119_cf36';
import {
  getEstimacionesCalculatedData,
  createNewEstimacion,
  setActiveEstimacionId,
  toggleActiveEstimacionLockState,
  isEstimacionLocked,
  setConceptoCantidadEjecutada,
  getConceptoFotosEstimacion,
  setConceptoFotosEstimacion,
  updateEstimacionFactura,
  setEstimacionesAnticipoPct,
  setEstimacionesIvaPct,
  normalizeCloudImageUrl
} from '../modules/estimaciones/estimacionesModel.js?v=20261119_cf36';
import { uploadManagedFile, resolveManagedFileUrl } from '../services/s3StorageService.js?v=20261119_cf36';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf36';
import { showToast } from '../ui/notifications.js?v=20261119_cf36';
import { escapeHtml, isBodegueroRestricted } from './mobileBridge.js?v=20261119_cf36';

let searchText = '';

export function renderMobileEstimaciones(container, { openSheet, closeSheet }) {
  if (!container) return;

  if (isBodegueroRestricted()) {
    container.innerHTML = '<div class="m-card" style="text-align:center;padding:24px;"><i class="fa-solid fa-lock"></i> Pestaña restringida para rol Almacenista.</div>';
    return;
  }

  const data = getEstimacionesCalculatedData();
  const activeEst = data.activeEst;
  const canEditRole = canCurrentUserEditProject();
  const locked = isEstimacionLocked(activeEst?.id);
  const editable = canEditRole && !locked;

  const isZero = activeEst?.numero === 0;
  const bruto = isZero ? (data.kpis.anticipo.totalContratado || 0) : (data.kpis.grandTotalEjecutado || 0);
  const neto = isZero ? bruto : (data.kpis.anticipo.netoEstaEstimacion || 0);
  const iva = data.kpis.iva.estaEstimacion || 0;
  const totalCobrar = round2(neto + iva);
  const isCobrada = activeEst?.factura?.status === 'cobrada';

  const leafRows = (data.rows || []).filter(r => !r.isParent).filter(r => {
    if (!searchText.trim()) return true;
    const q = searchText.trim().toLowerCase();
    return String(r.clave || '').toLowerCase().includes(q) || String(r.descripcion || '').toLowerCase().includes(q);
  });

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">
          ${!canEditRole ? 'Solo lectura' : (locked ? `${escapeHtml(activeEst?.nombre || 'Estimación')} bloqueada` : 'Captura de volúmenes activa')}
        </span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-est-lock-btn" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">
          ${locked ? 'Desbloquear' : 'Proteger'}
        </button>
      ` : ''}
    </div>

    <div class="m-chip-bar">
      ${(data.estimacionesList || []).map(est => `
        <button type="button" data-est-id="${escapeHtml(est.id)}" class="m-chip ${est.id === activeEst?.id ? 'is-active' : ''}">
          ${est.locked ? '<i class="fa-solid fa-lock"></i> ' : ''}${escapeHtml(est.nombre || `Est. ${est.numero}`)}
        </button>
      `).join('')}
      ${canEditRole ? `
        <button type="button" id="m-est-new" class="m-chip" style="border-style:dashed;color:var(--primary);">
          <i class="fa-solid fa-plus"></i> Nueva Est.
        </button>
      ` : ''}
    </div>

    <div class="m-card" style="display:flex;flex-direction:column;gap:8px;">
      <div class="m-row-between">
        <div>
          <div class="m-kpi-label">${escapeHtml(activeEst?.nombre || 'Estimación')}</div>
          <div class="m-kpi-value" style="font-size:20px;color:var(--primary);">${escapeHtml(formatMoney(totalCobrar))}</div>
          <div style="font-size:11px;color:var(--muted);">Neto + IVA (${data.kpis.iva.pct}%)</div>
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
          <span class="m-pill ${isCobrada ? 'm-pill-green' : 'm-pill-warn'}">${isCobrada ? 'Cobrada' : 'Pendiente cobro'}</span>
          ${editable ? `
            <button type="button" id="m-est-toggle-cobro" class="m-btn m-btn-outline m-btn-sm">
              ${isCobrada ? 'Marcar pendiente' : 'Marcar cobrada'}
            </button>
          ` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding-top:8px;border-top:1px solid var(--border);font-size:11px;text-align:center;">
        <div><div style="color:var(--muted);">Bruto</div><strong class="m-mono">${escapeHtml(formatMoney(bruto))}</strong></div>
        <div><div style="color:var(--muted);">Amortización</div><strong class="m-mono">${escapeHtml(formatMoney(isZero ? 0 : (data.kpis.anticipo.amortizacionEsta || 0)))}</strong></div>
        <div><div style="color:var(--muted);">Avance Global</div><strong class="m-mono">${Number(data.kpis.pctAvanceGlobal || 0).toFixed(1)}%</strong></div>
      </div>

      ${canEditRole ? `
        <div class="m-row-between" style="padding-top:6px;border-top:1px solid var(--border);">
          <span style="font-size:11px;color:var(--muted);">Anticipo ${data.kpis.anticipo.pct}% &bull; IVA ${data.kpis.iva.pct}%</span>
          <button type="button" id="m-est-cfg" class="m-btn m-btn-soft m-btn-sm"><i class="fa-solid fa-sliders"></i> Parámetros</button>
        </div>
      ` : ''}
    </div>

    ${isZero ? `
      <div class="m-card" style="text-align:center;padding:20px;">
        <i class="fa-solid fa-hand-holding-dollar" style="font-size:26px;color:var(--primary);margin-bottom:8px;"></i>
        <div style="font-size:13.5px;font-weight:800;">Estimación 0 — Anticipo de Obra</div>
        <p class="m-subtitle">Representa el ${data.kpis.anticipo.pct}% contractual por anticipo. Selecciona o crea una Estimación 1+ para capturar volúmenes de avance.</p>
      </div>
    ` : `
      <input type="search" id="m-est-search" class="m-input" value="${escapeHtml(searchText)}" placeholder="Buscar concepto a estimar...">
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${leafRows.map(row => {
          const fotosCount = Array.isArray(row.fotos) ? row.fotos.length : 0;
          const pct = row.cantBase > 0 ? Math.min(100, Math.round(((row.cantAcum || 0) / row.cantBase) * 100)) : 0;
          return `
            <div class="m-card" style="display:flex;flex-direction:column;gap:7px;">
              <div class="m-row-between">
                <span class="m-pill m-pill-blue m-mono">${escapeHtml(row.clave || '')}</span>
                <span class="m-mono" style="font-size:13px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(row.impEje || 0))}</span>
              </div>
              <div style="font-size:12.5px;font-weight:700;line-height:1.3;">${escapeHtml(row.descripcion || '')}</div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px;color:var(--muted);">
                <div>Contrato: <strong class="m-mono">${escapeHtml(formatQty(row.cantBase || 0))}</strong> ${escapeHtml(row.unidad)}</div>
                <div>Ant: <strong class="m-mono">${escapeHtml(formatQty(row.cantAnt || 0))}</strong></div>
                <div>Saldo: <strong class="m-mono">${escapeHtml(formatQty(row.cantSaldo || 0))}</strong></div>
              </div>
              <div class="m-progress-track">
                <div class="m-progress-fill" style="width:${pct}%;background:var(--success);"></div>
              </div>
              <div class="m-row-between" style="padding-top:4px;">
                <div class="m-row" style="gap:6px;">
                  ${editable ? `
                    <button type="button" data-est-step="${escapeHtml(row.id)}" data-delta="-1" class="m-icon-btn" style="width:32px;height:32px;">-</button>
                    <input type="number" step="0.01" data-est-qty="${escapeHtml(row.id)}" class="m-input m-mono" style="width:88px;padding:6px 8px;text-align:center;" value="${round2(row.cantEje || 0)}">
                    <button type="button" data-est-step="${escapeHtml(row.id)}" data-delta="1" class="m-icon-btn" style="width:32px;height:32px;">+</button>
                  ` : `
                    <span class="m-mono" style="font-size:12.5px;font-weight:800;">Esta Est: ${escapeHtml(formatQty(row.cantEje || 0))} ${escapeHtml(row.unidad)}</span>
                  `}
                </div>
                <button type="button" data-est-fotos="${escapeHtml(row.id)}" class="m-btn m-btn-sm ${fotosCount > 0 ? 'm-btn-primary' : 'm-btn-outline'}">
                  <i class="fa-solid fa-camera"></i> ${fotosCount > 0 ? fotosCount : 'Foto'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  container.querySelector('#m-est-lock-btn')?.addEventListener('click', () => {
    toggleActiveEstimacionLockState();
    renderMobileEstimaciones(container, { openSheet, closeSheet });
  });

  container.querySelectorAll('[data-est-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveEstimacionId(btn.dataset.estId);
      renderMobileEstimaciones(container, { openSheet, closeSheet });
    });
  });

  container.querySelector('#m-est-new')?.addEventListener('click', () => {
    const nextNum = (data.estimacionesAvance?.length || 0) + 1;
    const created = createNewEstimacion(`Estimación ${nextNum}`);
    if (created) {
      showToast(`${created.nombre} creada.`, 'success');
      renderMobileEstimaciones(container, { openSheet, closeSheet });
    }
  });

  container.querySelector('#m-est-toggle-cobro')?.addEventListener('click', () => {
    if (!activeEst) return;
    updateEstimacionFactura(activeEst.id, { status: isCobrada ? 'pendiente' : 'cobrada' });
    showToast(isCobrada ? 'Marcada como pendiente.' : 'Marcada como cobrada.', 'success');
    renderMobileEstimaciones(container, { openSheet, closeSheet });
  });

  container.querySelector('#m-est-cfg')?.addEventListener('click', () => {
    openSheet({
      title: 'Parámetros Financieros',
      bodyHtml: `
        <form id="m-est-cfg-form" style="display:flex;flex-direction:column;gap:10px;">
          <div class="m-grid-2">
            <div>
              <label class="m-label" for="m-ec-ant">% Anticipo</label>
              <input id="m-ec-ant" type="number" step="0.1" min="0" max="100" class="m-input m-mono" value="${data.kpis.anticipo.pct}">
            </div>
            <div>
              <label class="m-label" for="m-ec-iva">% IVA</label>
              <input id="m-ec-iva" type="number" step="0.1" min="0" max="100" class="m-input m-mono" value="${data.kpis.iva.pct}">
            </div>
          </div>
        </form>
      `,
      footerHtml: `
        <button type="button" id="m-ec-cancel" class="m-btn m-btn-outline">Cancelar</button>
        <button type="submit" form="m-est-cfg-form" class="m-btn m-btn-primary">Guardar</button>
      `
    });
    document.getElementById('m-ec-cancel')?.addEventListener('click', closeSheet);
    document.getElementById('m-est-cfg-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      setEstimacionesAnticipoPct(parseFloat(document.getElementById('m-ec-ant').value) || 0);
      setEstimacionesIvaPct(parseFloat(document.getElementById('m-ec-iva').value) || 0);
      closeSheet();
      showToast('Parámetros actualizados.', 'success');
      renderMobileEstimaciones(container, { openSheet, closeSheet });
    });
  });

  const sInp = container.querySelector('#m-est-search');
  sInp?.addEventListener('input', (ev) => {
    searchText = ev.target.value;
    const pos = ev.target.selectionStart;
    renderMobileEstimaciones(container, { openSheet, closeSheet });
    const next = container.querySelector('#m-est-search');
    if (next) {
      next.focus();
      try { next.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  container.querySelectorAll('[data-est-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cId = btn.dataset.estStep;
      const delta = parseFloat(btn.dataset.delta) || 0;
      const r = leafRows.find(x => String(x.id) === String(cId));
      if (!r) return;
      const next = Math.max(0, round2((r.cantEje || 0) + delta));
      setConceptoCantidadEjecutada(cId, next);
      renderMobileEstimaciones(container, { openSheet, closeSheet });
    });
  });

  container.querySelectorAll('[data-est-qty]').forEach(inp => {
    inp.addEventListener('change', () => {
      const val = Math.max(0, round2(parseFloat(inp.value) || 0));
      setConceptoCantidadEjecutada(inp.dataset.estQty, val);
      renderMobileEstimaciones(container, { openSheet, closeSheet });
    });
  });

  container.querySelectorAll('[data-est-fotos]').forEach(btn => {
    btn.addEventListener('click', () => {
      openPhotosSheet(btn.dataset.estFotos, editable, container, { openSheet, closeSheet });
    });
  });
}

async function openPhotosSheet(conceptId, editable, container, ctx) {
  const existing = getConceptoFotosEstimacion(conceptId) || [];
  const slots = [existing[0] ? { ...existing[0] } : null, existing[1] ? { ...existing[1] } : null];

  const resolveThumb = async (slot) => {
    if (!slot) return '';
    try {
      const url = await resolveManagedFileUrl(slot, { cacheRemote: true });
      if (url) return url;
    } catch (_) {}
    return normalizeCloudImageUrl(slot.displayUrl || slot.url || '');
  };

  const renderBody = async () => {
    const thumb0 = await resolveThumb(slots[0]);
    const thumb1 = await resolveThumb(slots[1]);
    const thumbs = [thumb0, thumb1];

    ctx.openSheet({
      title: 'Reporte Fotográfico (S3)',
      bodyHtml: [0, 1].map(idx => {
        const slot = slots[idx];
        const preview = thumbs[idx];
        return `
          <div class="m-card-alt" style="display:flex;flex-direction:column;gap:8px;">
            <div class="m-row-between">
              <strong style="font-size:12px;">Fotografía #${idx + 1}</strong>
              ${editable && slot ? `<button type="button" data-del-slot="${idx}" class="m-btn m-btn-sm m-btn-outline" style="color:var(--danger);"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
            ${preview ? `<img src="${escapeHtml(preview)}" alt="Foto ${idx + 1}" style="width:100%;max-height:190px;object-fit:cover;border-radius:10px;border:1px solid var(--border);">` : `<div style="padding:18px;text-align:center;color:var(--muted);font-size:12px;border:1px dashed var(--border-strong);border-radius:10px;">Sin fotografía cargada</div>`}
            ${editable ? `
              <label class="m-btn m-btn-soft m-btn-sm" style="cursor:pointer;">
                <i class="fa-solid fa-camera"></i> ${slot ? 'Reemplazar foto' : 'Tomar / Subir foto'}
                <input type="file" data-up-slot="${idx}" accept="image/*" style="display:none;">
              </label>
              <input type="text" data-nota-slot="${idx}" class="m-input" placeholder="Descripción o pie de foto..." value="${escapeHtml(slot?.nota || '')}">
            ` : (slot?.nota ? `<div style="font-size:12px;color:var(--text-soft);">${escapeHtml(slot.nota)}</div>` : '')}
          </div>
        `;
      }).join(''),
      footerHtml: `
        <button type="button" id="m-ef-close" class="m-btn m-btn-outline">Cerrar</button>
        ${editable ? `<button type="button" id="m-ef-save" class="m-btn m-btn-primary"><i class="fa-solid fa-floppy-disk"></i> Guardar Fotos</button>` : ''}
      `
    });

    document.getElementById('m-ef-close')?.addEventListener('click', ctx.closeSheet);
    document.querySelectorAll('[data-del-slot]').forEach(b => {
      b.addEventListener('click', () => {
        slots[parseInt(b.dataset.delSlot, 10)] = null;
        renderBody();
      });
    });
    document.querySelectorAll('[data-up-slot]').forEach(inp => {
      inp.addEventListener('change', async (ev) => {
        const f = ev.target.files?.[0];
        const idx = parseInt(inp.dataset.upSlot, 10);
        if (!f) return;
        try {
          const res = await uploadManagedFile({
            file: f, modulo: 'estimaciones', categoria: 'project_files', entidadId: conceptId, preset: 'photo', showFeedback: true, includeDataUrl: true
          });
          if (res.ok) {
            slots[idx] = {
              ...(slots[idx] || {}),
              mediaId: res.mediaId || '',
              archivoId: res.archivoId || '',
              s3Key: res.s3Key || '',
              bucket: res.bucket || '',
              fileName: res.fileName || '',
              sizeLabel: res.sizeLabel || '',
              displayUrl: res.dataUrl || '',
              nota: slots[idx]?.nota || ''
            };
            renderBody();
          }
        } catch (err) {
          showToast(err?.message || 'Error al subir foto.', 'error');
        }
      });
    });
    document.querySelectorAll('[data-nota-slot]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.notaSlot, 10);
        if (slots[idx]) slots[idx].nota = inp.value;
      });
    });
    document.getElementById('m-ef-save')?.addEventListener('click', () => {
      const clean = slots.filter(Boolean).map(s => ({
        url: s.url || '',
        displayUrl: s.s3Key ? '' : (s.displayUrl || ''),
        nota: s.nota || '',
        mediaId: s.mediaId || '',
        s3Key: s.s3Key || '',
        archivoId: s.archivoId || '',
        bucket: s.bucket || '',
        fileName: s.fileName || '',
        sizeLabel: s.sizeLabel || ''
      }));
      setConceptoFotosEstimacion(conceptId, clean);
      ctx.closeSheet();
      showToast('Reporte fotográfico guardado.', 'success');
      renderMobileEstimaciones(container, ctx);
    });
  };

  renderBody();
}
