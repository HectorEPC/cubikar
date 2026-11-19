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
} from '../modules/bitacora/bitacoraModel.js?v=20261117_cf30';
import { uploadBitacoraEvidenceFile } from '../modules/bitacora/bitacoraDriveService.js?v=20261117_cf30';
import { resolveManagedFileUrl } from '../services/s3StorageService.js?v=20261117_cf30';
import { canCurrentUserEditProject, getCurrentUser } from '../modules/portal/projectService.js?v=20261117_cf30';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261117_cf30';
import { showToast } from '../ui/notifications.js?v=20261117_cf30';
import { escapeHtml } from './mobileBridge.js?v=20261117_cf30';

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
        ${concepts.length > 0 ? `
          <div>
            <label class="m-label" for="m-b-conc">Concepto vinculado (opcional)</label>
            <select id="m-b-conc" class="m-select" ${editable ? '' : 'disabled'}>
              <option value="">-- Ninguno --</option>
              ${concepts.slice(0, 60).map(c => `
                <option value="${escapeHtml(c.id)}">${escapeHtml(c.clave || '')} ${escapeHtml(c.descripcion || '')}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}
        <div>
          <label class="m-label" for="m-b-desc">Descripción / Hechos / Acuerdos *</label>
          <textarea id="m-b-desc" rows="4" required class="m-textarea" placeholder="Describe actividades ejecutadas, personal en obra, instrucciones o incidencias..." ${editable ? '' : 'readonly'}>${escapeHtml(existingNote?.descripcion || '')}</textarea>
        </div>

        <div class="m-row-between">
          <span style="font-size:11.5px;font-weight:700;">Evidencias fotográficas (<span id="m-b-ev-count">${evidencias.length}</span>)</span>
          ${editable ? `
            <label class="m-btn m-btn-soft m-btn-sm" style="cursor:pointer;">
              <i class="fa-solid fa-camera"></i> Adjuntar Foto (S3)
              <input type="file" id="m-b-photo" accept="image/*" style="display:none;">
            </label>
          ` : ''}
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

  document.getElementById('m-b-photo')?.addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const up = await uploadBitacoraEvidenceFile(f, existingNote?.id || '');
      evidencias.push(up);
      document.getElementById('m-b-ev-count').textContent = String(evidencias.length);
      showToast('Foto adjunta a bitácora.', 'success');
    } catch (err) {
      showToast(err?.message || 'Error al subir foto.', 'error');
    }
  });

  const buildPayload = () => {
    const concId = document.getElementById('m-b-conc')?.value || '';
    const conc = concepts.find(c => String(c.id) === String(concId));
    return {
      id: existingNote?.id || null,
      tipo: document.getElementById('m-b-tipo').value,
      clima: document.getElementById('m-b-clima').value,
      fecha: document.getElementById('m-b-fecha').value,
      ubicacion: document.getElementById('m-b-ubi').value.trim(),
      conceptosVinculados: conc ? [{ id: conc.id, clave: conc.clave, descripcion: conc.descripcion }] : [],
      descripcion: document.getElementById('m-b-desc').value.trim(),
      evidencias
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
      evidenciasActualizadas: evidencias
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
