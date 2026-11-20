// js/mobile/mobileBitacora.js
// Bitácora de Obra: Notas diarias, clima, conceptos vinculados, fotos S3 y firma autógrafa digital con SHA-256

import {
  loadBitacoraData,
  getBitacoraConfig,
  saveBitacoraDraftNote,
  deleteBitacoraDraftNote,
  sealAndSignBitacoraNote,
  computeNoteIntegrityHash,
  getCatalogConceptsForBitacora,
  getBitacoraWorkSummary,
  getNoteTypeMeta,
  getWeatherMeta
} from '../modules/bitacora/bitacoraModel.js?v=20261119_cf40';
import { uploadBitacoraEvidenceFile } from '../modules/bitacora/bitacoraDriveService.js?v=20261119_cf40';
import { resolveManagedFileUrl, deleteManagedFile } from '../services/s3StorageService.js?v=20261119_cf40';
import { canCurrentUserEditProject, getCurrentUser } from '../modules/portal/projectService.js?v=20261119_cf40';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261119_cf40';
import { showToast } from '../ui/notifications.js?v=20261119_cf40';
import { escapeHtml } from './mobileBridge.js?v=20261119_cf40';

const MAX_BITACORA_EVIDENCIAS = 6;
let filterState = 'all'; // 'all' | 'draft' | 'sealed'

export function renderMobileBitacora(container, { openSheet, closeSheet }) {
  if (!container) return;

  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('bitacora');
  const editable = canEditRole && !locked;

  const data = loadBitacoraData();
  const summary = getBitacoraWorkSummary();
  const notesAll = [...(data.notes || [])].reverse();
  const notes = notesAll.filter(n => {
    if (filterState === 'draft') return n.estado !== 'sealed';
    if (filterState === 'sealed') return n.estado === 'sealed';
    return true;
  });

  const sealedCount = notesAll.filter(n => n.estado === 'sealed').length;
  const draftCount = notesAll.filter(n => n.estado !== 'sealed').length;

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">
          ${!canEditRole ? 'Solo lectura' : (locked ? 'Bitácora protegida' : 'Bitácora abierta para registro')}
        </span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-bit-lock-btn" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">
          ${locked ? 'Desbloquear' : 'Proteger'}
        </button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Folios Asentados</div>
        <div class="m-kpi-value" style="color:var(--success);">${sealedCount} sellada${sealedCount === 1 ? '' : 's'}</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">Borradores / Avance</div>
        <div class="m-kpi-value">${draftCount} borr. &bull; ${Number(summary?.pctAvance || 0).toFixed(0)}%</div>
      </div>
    </div>

    <div class="m-row-between">
      <div class="m-chip-bar" style="flex:1;">
        <button type="button" data-bit-f="all" class="m-chip ${filterState === 'all' ? 'is-active' : ''}">Todas (${notesAll.length})</button>
        <button type="button" data-bit-f="draft" class="m-chip ${filterState === 'draft' ? 'is-active' : ''}">Borradores (${draftCount})</button>
        <button type="button" data-bit-f="sealed" class="m-chip ${filterState === 'sealed' ? 'is-active' : ''}">Selladas (${sealedCount})</button>
      </div>
      ${editable ? `
        <button type="button" id="m-bit-new" class="m-btn m-btn-primary m-btn-sm">
          <i class="fa-solid fa-plus"></i> Nota
        </button>
      ` : ''}
    </div>

    ${notes.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:26px;color:var(--muted);font-size:13px;">
        <i class="fa-solid fa-book-bookmark" style="font-size:28px;margin-bottom:8px;display:block;"></i>
        Sin notas en la bitácora bajo este filtro.
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${notes.map(note => {
          const sealed = note.estado === 'sealed';
          const tipoMeta = getNoteTypeMeta(note.tipo);
          const climaMeta = getWeatherMeta(note.clima);
          const evCount = Array.isArray(note.evidencias) ? note.evidencias.length : 0;
          return `
            <div class="m-card" data-open-note="${escapeHtml(note.id)}" style="cursor:pointer;display:flex;flex-direction:column;gap:6px;">
              <div class="m-row-between">
                <span class="m-pill ${sealed ? 'm-pill-green' : 'm-pill-warn'} m-mono">
                  <i class="fa-solid ${sealed ? 'fa-shield-halved' : 'fa-pen'}"></i> ${escapeHtml(note.folioCode || 'BORRADOR')}
                </span>
                <span style="font-size:11px;color:var(--muted);">
                  <i class="${escapeHtml(climaMeta?.icon || 'fa-solid fa-sun')}"></i> ${escapeHtml(note.fecha || '')} ${escapeHtml(note.hora || '')}
                </span>
              </div>
              <div style="font-size:12.5px;font-weight:800;color:var(--primary);">${escapeHtml(tipoMeta?.label || note.tipo || 'Nota de Obra')}</div>
              <div style="font-size:12.5px;line-height:1.4;color:var(--text-soft);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
                ${escapeHtml(note.descripcion || '')}
              </div>
              <div class="m-row-between" style="font-size:11px;color:var(--muted);padding-top:4px;border-top:1px solid var(--border);">
                <span>${escapeHtml(note.creadoPor?.name || 'Residente')}${note.ubicacion ? ' &bull; ' + escapeHtml(note.ubicacion) : ''}</span>
                ${evCount > 0 ? `<span class="m-pill m-pill-blue"><i class="fa-solid fa-camera"></i> ${evCount}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  container.querySelector('#m-bit-lock-btn')?.addEventListener('click', () => {
    setTabLocked('bitacora', !locked);
    renderMobileBitacora(container, { openSheet, closeSheet });
  });

  container.querySelectorAll('[data-bit-f]').forEach(b => {
    b.addEventListener('click', () => {
      filterState = b.dataset.bitF;
      renderMobileBitacora(container, { openSheet, closeSheet });
    });
  });

  container.querySelector('#m-bit-new')?.addEventListener('click', () => {
    openBitacoraComposerSheet(null, editable, container, { openSheet, closeSheet });
  });

  container.querySelectorAll('[data-open-note]').forEach(card => {
    card.addEventListener('click', () => {
      const n = notesAll.find(x => x.id === card.dataset.openNote);
      if (!n) return;
      if (n.estado === 'sealed') {
        openSealedNoteViewer(n, { openSheet, closeSheet });
      } else {
        openBitacoraComposerSheet(n, editable, container, { openSheet, closeSheet });
      }
    });
  });
}

async function openSealedNoteViewer(note, ctx) {
  const photos = await Promise.all((note.evidencias || []).map(async ev => ({
    ...ev,
    url: await resolveManagedFileUrl(ev, { cacheRemote: true }).catch(() => '')
  })));

  ctx.openSheet({
    title: `${note.folioCode || 'Nota Sellada'}`,
    bodyHtml: `
      <div class="m-card-alt" style="display:flex;flex-direction:column;gap:5px;">
        <div class="m-row-between">
          <span class="m-pill m-pill-green"><i class="fa-solid fa-lock"></i> Asentada y Sellada</span>
          <span class="m-mono" style="font-size:11px;color:var(--muted);">${escapeHtml(note.fecha)} ${escapeHtml(note.hora)}</span>
        </div>
        <div style="font-size:13px;font-weight:800;">${escapeHtml(note.tipo)}</div>
        ${note.ubicacion ? `<div style="font-size:11.5px;color:var(--muted);">Ubicación: ${escapeHtml(note.ubicacion)}</div>` : ''}
      </div>
      <div class="m-card" style="font-size:13px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(note.descripcion || '')}</div>
      ${photos.filter(p => p.url).map(p => `
        <img src="${escapeHtml(p.url)}" alt="${escapeHtml(p.fileName || '')}" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;border:1px solid var(--border);">
      `).join('')}
      ${note.firma ? `
        <div class="m-card-alt">
          <div style="font-size:11.5px;font-weight:800;margin-bottom:4px;">Firma Digital</div>
          ${note.firma.dataUrl ? `<img src="${escapeHtml(note.firma.dataUrl)}" alt="Firma" style="max-height:90px;background:#fff;border-radius:8px;padding:4px;border:1px solid var(--border);">` : ''}
          <div style="font-size:11.5px;margin-top:4px;"><strong>${escapeHtml(note.firma.autorNombre || '')}</strong> &bull; ${escapeHtml(note.firma.autorCargo || '')}</div>
          ${note.firma.sha256 ? `<div class="m-mono" style="font-size:10px;color:var(--muted);word-break:break-all;margin-top:3px;">SHA-256: ${escapeHtml(note.firma.sha256)}</div>` : ''}
        </div>
      ` : ''}
    `,
    footerHtml: '<button type="button" id="m-bs-close" class="m-btn m-btn-outline">Cerrar</button>'
  });
  document.getElementById('m-bs-close')?.addEventListener('click', ctx.closeSheet);
}

function openBitacoraComposerSheet(existingNote, editable, container, ctx) {
  const cfg = getBitacoraConfig();
  const user = getCurrentUser();
  const concepts = getCatalogConceptsForBitacora() || [];
  let evidencias = Array.isArray(existingNote?.evidencias) ? [...existingNote.evidencias] : [];
  let signaturePad = null;

  ctx.openSheet({
    title: existingNote ? `Editar ${existingNote.folioCode || 'Borrador'}` : 'Nueva Nota de Bitácora',
    bodyHtml: `
      <form id="m-bit-form" style="display:flex;flex-direction:column;gap:10px;">
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-b-tipo">Tipo de Nota</label>
            <select id="m-b-tipo" class="m-select" ${editable ? '' : 'disabled'}>
              ${['Avance de Obra', 'Supervisión', 'Seguridad e Higiene', 'Control de Calidad', 'Incidencia / Retraso', 'Instrucción / Acuerdo'].map(t => `
                <option value="${escapeHtml(t)}" ${(existingNote?.tipo || 'Avance de Obra') === t ? 'selected' : ''}>${escapeHtml(t)}</option>
              `).join('')}
            </select>
          </div>
          <div>
            <label class="m-label" for="m-b-clima">Clima en Obra</label>
            <select id="m-b-clima" class="m-select" ${editable ? '' : 'disabled'}>
              ${['Soleado', 'Nublado', 'Lluvia Ligera', 'Tormenta / Suspensión', 'Viento Fuerte'].map(c => `
                <option value="${escapeHtml(c)}" ${(existingNote?.clima || cfg.climaHoy || 'Soleado') === c ? 'selected' : ''}>${escapeHtml(c)}</option>
              `).join('')}
            </select>
          </div>
        </div>
        <div class="m-grid-2">
          <div>
            <label class="m-label" for="m-b-fecha">Fecha</label>
            <input id="m-b-fecha" type="date" class="m-input" value="${escapeHtml(existingNote?.fecha || new Date().toISOString().slice(0, 10))}" ${editable ? '' : 'readonly'}>
          </div>
          <div>
            <label class="m-label" for="m-b-ubi">Ubicación / Frente</label>
            <input id="m-b-ubi" class="m-input" placeholder="Ej. Nivel 2, Ejes A-D" value="${escapeHtml(existingNote?.ubicacion || '')}" ${editable ? '' : 'readonly'}>
          </div>
        </div>
        ${(concepts.length > 0 || (existingNote?.conceptosVinculados || []).length > 0) ? `
          <div>
            <label class="m-label" for="m-b-conc">Concepto vinculado (opcional)</label>
            <select id="m-b-conc" class="m-select" ${editable ? '' : 'disabled'}>
              <option value="">-- Ninguno --</option>
              ${(() => {
                const firstId = String(existingNote?.conceptosVinculados?.[0]?.id || '');
                const baseList = concepts.slice(0, 60);
                const mergedList = [...baseList];
                if (firstId && !mergedList.some(c => String(c.id) === firstId)) {
                  const fullMatch = concepts.find(c => String(c.id) === firstId);
                  mergedList.unshift(fullMatch || existingNote.conceptosVinculados[0]);
                }
                return mergedList.map(c => `
                  <option value="${escapeHtml(c.id)}" ${String(c.id) === firstId ? 'selected' : ''}>${escapeHtml(c.clave || '')} ${escapeHtml(c.descripcion || '')}</option>
                `).join('');
              })()}
            </select>
          </div>
        ` : ''}
        <div>
          <label class="m-label" for="m-b-desc">Descripción / Hechos / Acuerdos *</label>
          <textarea id="m-b-desc" rows="4" required class="m-textarea" placeholder="Describe actividades ejecutadas, personal en obra, instrucciones o incidencias..." ${editable ? '' : 'readonly'}>${escapeHtml(existingNote?.descripcion || '')}</textarea>
        </div>

        <div class="m-card-alt" style="display:flex;flex-direction:column;gap:8px;">
          <div class="m-row-between">
            <span style="font-size:11.5px;font-weight:700;">Evidencias (<span id="m-b-ev-count">${evidencias.length}/${MAX_BITACORA_EVIDENCIAS}</span>)</span>
            ${editable ? `
              <div class="m-row" style="gap:6px;">
                <label id="m-b-cam-lbl" class="m-btn m-btn-soft m-btn-sm" style="cursor:pointer;">
                  <i class="fa-solid fa-camera"></i> Tomar foto
                  <input type="file" id="m-b-cam" accept="image/*" capture="environment" style="display:none;">
                </label>
                <label id="m-b-photo-lbl" class="m-btn m-btn-soft m-btn-sm" style="cursor:pointer;">
                  <i class="fa-solid fa-images"></i> Galería
                  <input type="file" id="m-b-photo" accept="image/*" multiple style="display:none;">
                </label>
              </div>
            ` : ''}
          </div>
          <div id="m-b-ev-list" style="display:flex;flex-direction:column;gap:8px;"></div>
        </div>

        ${editable ? `
          <div class="m-card-alt" style="display:flex;flex-direction:column;gap:8px;">
            <div class="m-row-between">
              <span style="font-size:12px;font-weight:800;"><i class="fa-solid fa-signature"></i> Firma autógrafa para sellar folio</span>
              <button type="button" id="m-b-clear-sig" class="m-btn m-btn-outline m-btn-sm">Limpiar</button>
            </div>
            <input id="m-b-signer" class="m-input" placeholder="Nombre del firmante" value="${escapeHtml(cfg.residenteDefault || user?.name || 'Residente de Obra')}">
            <input id="m-b-role" class="m-input" placeholder="Cargo (ej. Residente de Obra / DRO)" value="${escapeHtml(cfg.residenteCargoDefault || 'Residente de Obra')}">
            <canvas id="m-b-canvas" class="m-signature-canvas"></canvas>
          </div>
        ` : ''}
      </form>
    `,
    footerHtml: editable ? `
      ${existingNote ? `<button type="button" id="m-b-del" class="m-btn m-btn-danger m-btn-sm" style="margin-right:auto;"><i class="fa-solid fa-trash"></i></button>` : ''}
      <button type="button" id="m-b-save-draft" class="m-btn m-btn-outline">Guardar Borrador</button>
      <button type="button" id="m-b-seal" class="m-btn m-btn-success"><i class="fa-solid fa-shield-halved"></i> Sellar Folio</button>
    ` : '<button type="button" id="m-b-close" class="m-btn m-btn-outline">Cerrar</button>'
  });

  document.getElementById('m-b-close')?.addEventListener('click', ctx.closeSheet);

  const canvas = document.getElementById('m-b-canvas');
  if (canvas) {
    signaturePad = attachTouchSignatureCanvas(canvas);
    document.getElementById('m-b-clear-sig')?.addEventListener('click', () => signaturePad.clear());
  }

  async function renderMobileEvidences() {
    const countEl = document.getElementById('m-b-ev-count');
    const camLbl = document.getElementById('m-b-cam-lbl');
    const photoLbl = document.getElementById('m-b-photo-lbl');
    const camInp = document.getElementById('m-b-cam');
    const photoInp = document.getElementById('m-b-photo');
    const listEl = document.getElementById('m-b-ev-list');
    const atLimit = evidencias.length >= MAX_BITACORA_EVIDENCIAS;

    if (countEl) countEl.textContent = `${evidencias.length}/${MAX_BITACORA_EVIDENCIAS}`;
    [camInp, photoInp].forEach(inp => { if (inp) inp.disabled = atLimit; });
    [camLbl, photoLbl].forEach(lbl => {
      if (!lbl) return;
      lbl.style.opacity = atLimit ? '0.45' : '';
      lbl.style.pointerEvents = atLimit ? 'none' : '';
    });

    if (!listEl) return;
    if (evidencias.length === 0) {
      listEl.innerHTML = `<div style="font-size:11.5px;color:var(--muted);text-align:center;padding:8px 4px;">Máximo ${MAX_BITACORA_EVIDENCIAS} fotos por nota (cámara directa o galería múltiple).</div>`;
      return;
    }

    const urls = await Promise.all(evidencias.map(ev => resolveManagedFileUrl(ev, { cacheRemote: true }).catch(() => '')));
    listEl.innerHTML = evidencias.map((ev, i) => `
      <div class="m-card" style="padding:8px;display:flex;gap:8px;align-items:flex-start;">
        ${urls[i] ? `<img src="${escapeHtml(urls[i])}" alt="Foto ${i + 1}" style="width:58px;height:58px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--border);">` : `<div style="width:58px;height:58px;border-radius:8px;background:var(--surface);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-image"></i></div>`}
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;">
          <div class="m-row-between">
            <span style="font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Foto ${i + 1}: ${escapeHtml(ev.fileName || 'Evidencia')}</span>
            ${editable ? `<button type="button" data-del-bev="${i}" class="m-icon-btn" style="width:26px;height:26px;font-size:11px;color:var(--danger);" title="Quitar"><i class="fa-solid fa-trash-can"></i></button>` : ''}
          </div>
          <input type="text" data-cap-bev="${i}" class="m-input" style="padding:6px 8px;font-size:11.5px;" placeholder="Pie de foto (opcional)" value="${escapeHtml(ev.caption || '')}" ${editable ? '' : 'readonly'}>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-del-bev]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.delBev, 10);
        const removed = evidencias[idx];
        if (!removed) return;
        if (removed.__isNewTempUpload) deleteManagedFile(removed).catch(() => {});
        evidencias.splice(idx, 1);
        renderMobileEvidences();
      });
    });

    listEl.querySelectorAll('[data-cap-bev]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.capBev, 10);
        if (evidencias[idx]) evidencias[idx].caption = inp.value;
      });
    });
  }

  async function handleMobileBitacoraFiles(fileList, inputEl) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const remaining = Math.max(0, MAX_BITACORA_EVIDENCIAS - evidencias.length);
    if (remaining <= 0) {
      showToast(`Límite alcanzado: máximo ${MAX_BITACORA_EVIDENCIAS} fotos por nota.`, 'warning');
      if (inputEl) inputEl.value = '';
      return;
    }

    const allowed = files.slice(0, remaining);
    if (files.length > remaining) {
      showToast(`Solo se agregaron ${remaining} foto(s) para respetar el máximo de ${MAX_BITACORA_EVIDENCIAS} por nota.`, 'warning');
    }

    for (const file of allowed) {
      try {
        const up = await uploadBitacoraEvidenceFile(file, existingNote?.id || '');
        up.__isNewTempUpload = true;
        evidencias.push(up);
      } catch (err) {
        showToast(err?.message || `Error al subir "${file.name}".`, 'error');
      }
    }

    if (inputEl) inputEl.value = '';
    await renderMobileEvidences();
  }

  renderMobileEvidences();
  document.getElementById('m-b-cam')?.addEventListener('change', (ev) => handleMobileBitacoraFiles(ev.target.files, ev.target));
  document.getElementById('m-b-photo')?.addEventListener('change', (ev) => handleMobileBitacoraFiles(ev.target.files, ev.target));

  const firstExistingId = String(existingNote?.conceptosVinculados?.[0]?.id || '');
  const buildPayload = () => {
    const concEl = document.getElementById('m-b-conc');
    const concId = concEl?.value || '';
    const conc = concepts.find(c => String(c.id) === String(concId))
      || (existingNote?.conceptosVinculados || []).find(c => String(c.id) === String(concId));
    const nextConceptos = !concEl
      ? (existingNote?.conceptosVinculados || [])
      : (concId && concId === firstExistingId && Array.isArray(existingNote?.conceptosVinculados) && existingNote.conceptosVinculados.length > 0
          ? existingNote.conceptosVinculados
          : (conc ? [{ id: conc.id, clave: conc.clave, descripcion: conc.descripcion }] : []));
    const cleanEvidencias = evidencias.slice(0, MAX_BITACORA_EVIDENCIAS).map(({ __isNewTempUpload, ...clean }) => clean);
    return {
      id: existingNote?.id || null,
      tipo: document.getElementById('m-b-tipo').value,
      clima: document.getElementById('m-b-clima').value,
      fecha: document.getElementById('m-b-fecha').value,
      ubicacion: document.getElementById('m-b-ubi').value.trim(),
      conceptosVinculados: nextConceptos,
      descripcion: document.getElementById('m-b-desc').value.trim(),
      evidencias: cleanEvidencias
    };
  };

  document.getElementById('m-b-save-draft')?.addEventListener('click', () => {
    const payload = buildPayload();
    if (!payload.descripcion) {
      showToast('Escribe la descripción de la nota.', 'warning');
      return;
    }
    saveBitacoraDraftNote(payload);
    ctx.closeSheet();
    showToast('Borrador guardado.', 'success');
    renderMobileBitacora(container, ctx);
  });

  document.getElementById('m-b-seal')?.addEventListener('click', async () => {
    const payload = buildPayload();
    if (!payload.descripcion) {
      showToast('Escribe la descripción antes de sellar.', 'warning');
      return;
    }
    if (!signaturePad?.hasDrawing()) {
      showToast('Dibuja tu firma en el recuadro antes de sellar.', 'warning');
      return;
    }
    const savedDraft = saveBitacoraDraftNote(payload);
    const autorNombre = document.getElementById('m-b-signer').value.trim() || user?.name || 'Residente';
    const autorCargo = document.getElementById('m-b-role').value.trim() || 'Residente de Obra';
    const sha256 = await computeNoteIntegrityHash({ ...savedDraft, autorNombre, autorCargo }).catch(() => '');
    const dataUrl = signaturePad.toDataURL();
    sealAndSignBitacoraNote(savedDraft.id, {
      firma: {
        autorNombre,
        autorCargo,
        dataUrl,
        sha256,
        firmadoEn: new Date().toISOString()
      },
      pdfDoc: {
        fileName: `${savedDraft.id}.pdf`,
        createdAt: new Date().toISOString()
      },
      evidenciasActualizadas: payload.evidencias
    });
    ctx.closeSheet();
    showToast('Folio asentado y firmado digitalmente.', 'success');
    renderMobileBitacora(container, ctx);
  });

  document.getElementById('m-b-del')?.addEventListener('click', () => {
    if (!existingNote || !confirm('¿Eliminar este borrador?')) return;
    deleteBitacoraDraftNote(existingNote.id);
    ctx.closeSheet();
    showToast('Borrador eliminado.', 'info');
    renderMobileBitacora(container, ctx);
  });
}

function attachTouchSignatureCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, Math.round(rect.width || 320));
  const height = 150;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0f172a';
  let drawing = false;
  let drew = false;

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / (r.width || 1)) * canvas.width,
      y: ((ev.clientY - r.top) / (r.height || 1)) * canvas.height
    };
  };

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    drawing = true;
    const p = pos(ev);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drawing) return;
    const p = pos(ev);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drew = true;
  });
  canvas.addEventListener('pointerup', () => { drawing = false; });
  canvas.addEventListener('pointercancel', () => { drawing = false; });

  return {
    clear: () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drew = false;
    },
    hasDrawing: () => drew,
    toDataURL: () => canvas.toDataURL('image/png')
  };
}
