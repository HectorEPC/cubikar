import { getActiveProjectId } from '../config/constants.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { isValidUUID, resolveUserEmpresaId } from './cloudProjectService.js';
import { getCurrentUser, getProjectById } from '../modules/portal/projectService.js';

const pendingTimers = new Map();

function scopedRowId(projectId, localId) {
  const pid = String(projectId || 'default');
  const raw = String(localId || '');
  return raw.startsWith(`${pid}::`) ? raw : `${pid}::${raw}`;
}

function unscopeRowId(projectId, storedId) {
  const pid = String(projectId || 'default');
  const prefix = `${pid}::`;
  const raw = String(storedId || '');
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

/**
 * Elimina dataUrl/base64 pesados de objetos de evidencia antes de persistir en JSONB/Postgres.
 * Conserva s3Key, mediaId, archivoId y metadatos para resolución desde IndexedDB/S3.
 */
export function stripInlineBinaryPayloads(evidence) {
  if (!evidence || typeof evidence !== 'object') return evidence;
  if (Array.isArray(evidence)) {
    return evidence.map((item) => stripInlineBinaryPayloads(item));
  }
  const clone = { ...evidence };
  if (clone.mediaId || clone.s3Key) {
    delete clone.localDataUrl;
    delete clone.dataUrl;
    delete clone.base64;
    delete clone.blobUrl;
  } else if (typeof clone.localDataUrl === 'string' && clone.localDataUrl.length > 4000) {
    delete clone.localDataUrl;
  }
  return clone;
}

async function getCloudSyncContext(projectIdOverride = '') {
  if (!isSupabaseConfigured()) return null;
  const sb = await getSupabaseClient();
  if (!sb) return null;

  const { data: userRes } = await sb.auth.getUser();
  const user = userRes?.user || null;
  if (!user) return null;

  const projectId = String(projectIdOverride || getActiveProjectId() || '').trim();
  if (!projectId) return null;

  const project = getProjectById(projectId);
  const currentUser = getCurrentUser();
  const ownerEmail = String(
    project?.ownerEmail ||
    project?.hostEmail ||
    currentUser?.email ||
    user.email ||
    ''
  ).trim().toLowerCase();

  const empresaId = await resolveUserEmpresaId(sb, user);

  return { sb, user, projectId, project, ownerEmail, empresaId };
}

function scheduleDebouncedTask(key, delayMs, taskFn) {
  if (pendingTimers.has(key)) {
    clearTimeout(pendingTimers.get(key));
  }
  const timer = setTimeout(async () => {
    pendingTimers.delete(key);
    try {
      await taskFn();
    } catch (err) {
      console.warn(`[cloudModulesSyncService] Error en sync (${key}):`, err?.message || err);
    }
  }, delayMs);
  pendingTimers.set(key, timer);
}

// ============================================================================
// 1. BITÁCORA DE OBRA
// ============================================================================

export function scheduleBitacoraCloudSync(projectId = '') {
  const pid = String(projectId || getActiveProjectId() || '').trim();
  if (!pid) return;
  scheduleDebouncedTask(`bitacora:${pid}`, 800, () => syncBitacoraNow(pid));
}

export async function syncBitacoraNow(projectIdOverride = '') {
  const ctx = await getCloudSyncContext(projectIdOverride);
  if (!ctx) return { ok: false, skipped: true };

  const raw = localStorage.getItem(`adm_const_bitacora_${ctx.projectId}`);
  if (!raw) return { ok: true, empty: true };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const cfg = data?.config || {};
  const cleanCfg = {
    ...cfg,
    driveConfig: undefined
  };

  await ctx.sb.from('bitacora_config').upsert({
    proyecto_id: ctx.projectId,
    empresa_id: ctx.empresaId || null,
    owner_email: ctx.ownerEmail,
    titulo_obra: String(cfg.projectName || ctx.project?.name || ''),
    contrato_num: String(cfg.contractNumber || ''),
    contratista: String(cfg.contractorName || ''),
    supervision: String(cfg.supervisorOrg || ''),
    residente_nombre: String(cfg.residentName || ''),
    supervisor_nombre: String(cfg.supervisorName || ''),
    folio_actual: Number(cfg.nextFolioNumber || 1),
    config_json: cleanCfg
  }, { onConflict: 'proyecto_id' });

  const notes = Array.isArray(data?.notes) ? data.notes : [];
  if (notes.length > 0) {
    const rows = notes.map((note) => {
      const cleanPhotos = stripInlineBinaryPayloads(Array.isArray(note.evidencias) ? note.evidencias : []);
      const pdfArtifact = note.pdfArtifact || note.driveArtifacts?.pdf || {};
      const cleanPayload = {
        ...note,
        evidencias: cleanPhotos,
        driveArtifacts: undefined
      };
      return {
        id: scopedRowId(ctx.projectId, note.id),
        proyecto_id: ctx.projectId,
        empresa_id: ctx.empresaId || null,
        owner_email: ctx.ownerEmail,
        folio: Number(note.folioNumber || 0),
        fecha: note.fecha || null,
        tipo: String(note.tipo || 'seguimiento'),
        clasificacion: String(note.folioCode || 'BORRADOR'),
        titulo: String(note.folioCode || note.tipo || 'Nota de Bitácora'),
        contenido: String(note.descripcion || ''),
        autor_nombre: String(note.autorNombre || ''),
        autor_email: String(note.autorEmail || ctx.user.email || ''),
        estado: String(note.estado || 'draft'),
        fotos: cleanPhotos,
        pdf_s3_key: String(pdfArtifact.s3Key || ''),
        pdf_archivo_id: isValidUUID(pdfArtifact.archivoId) ? pdfArtifact.archivoId : null,
        sello_json: note.firmaDigital || note.sello || {},
        payload_json: cleanPayload
      };
    });

    await ctx.sb.from('bitacora_notas').upsert(rows, { onConflict: 'id' });
  }

  return { ok: true, count: notes.length };
}

// ============================================================================
// 2. COMPRAS, GASTOS Y PROVEEDORES
// ============================================================================

export function scheduleExpensesCloudSync(projectId = '') {
  const pid = String(projectId || getActiveProjectId() || '').trim();
  if (!pid) return;
  scheduleDebouncedTask(`expenses:${pid}`, 800, () => syncExpensesNow(pid));
}

export async function syncExpensesNow(projectIdOverride = '') {
  const ctx = await getCloudSyncContext(projectIdOverride);
  if (!ctx) return { ok: false, skipped: true };

  const raw = localStorage.getItem(`expenses_control_${ctx.projectId}`);
  if (!raw) return { ok: true, empty: true };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const suppliers = Array.isArray(data?.suppliers) ? data.suppliers : [];
  const supplierRows = suppliers.map((s) => ({
    id: scopedRowId(ctx.projectId, s.id),
    proyecto_id: ctx.projectId,
    empresa_id: ctx.empresaId || null,
    owner_email: ctx.ownerEmail,
    nombre: String(s.name || 'Proveedor'),
    rfc: String(s.rfc || ''),
    categoria: String(s.category || ''),
    telefono: String(s.phone || ''),
    email: String(s.email || ''),
    notas: String(s.address || ''),
    payload_json: { ...s, id: s.id }
  }));

  if (supplierRows.length > 0) {
    await ctx.sb.from('proveedores').upsert(supplierRows, { onConflict: 'id' });
  }

  const records = Array.isArray(data?.records) ? data.records : [];
  const recordRows = records.map((r) => {
    const cleanEvidence = stripInlineBinaryPayloads(r.evidence || null);
    return {
      id: scopedRowId(ctx.projectId, r.id),
      proyecto_id: ctx.projectId,
      empresa_id: ctx.empresaId || null,
      owner_email: ctx.ownerEmail,
      proveedor_id: String(r.supplierId || ''),
      concepto_id: String(r.conceptId || ''),
      fecha: r.date || null,
      tipo: String(r.type || 'compra'),
      categoria: String(r.category || 'Material'),
      descripcion: String(r.description || ''),
      folio_factura: String(r.invoiceFolio || r.folio || ''),
      subtotal: Number(r.subtotal || 0),
      iva: Number(r.tax || 0),
      total: Number(r.total || 0),
      metodo_pago: String(r.paymentMethod || ''),
      estado: String(r.paymentStatus || 'paid'),
      evidencia_s3_key: String(cleanEvidence?.s3Key || ''),
      evidencia_archivo_id: isValidUUID(cleanEvidence?.archivoId) ? cleanEvidence.archivoId : null,
      evidencia_json: cleanEvidence || {},
      payload_json: { ...r, evidence: cleanEvidence }
    };
  });

  if (recordRows.length > 0) {
    await ctx.sb.from('compras_gastos').upsert(recordRows, { onConflict: 'id' });
  }

  // Limpiar registros eliminados en este proyecto
  const { data: existingRemote } = await ctx.sb
    .from('compras_gastos')
    .select('id')
    .eq('proyecto_id', ctx.projectId);

  if (Array.isArray(existingRemote)) {
    const activeSet = new Set(recordRows.map((row) => row.id));
    const toDelete = existingRemote.map((row) => row.id).filter((id) => !activeSet.has(id));
    if (toDelete.length > 0) {
      await ctx.sb.from('compras_gastos').delete().in('id', toDelete);
    }
  }

  return { ok: true, suppliers: supplierRows.length, records: recordRows.length };
}

// ============================================================================
// 3. ESTIMACIONES DE OBRA
// ============================================================================

export function scheduleEstimacionesCloudSync(projectId = '') {
  const pid = String(projectId || getActiveProjectId() || '').trim();
  if (!pid) return;
  scheduleDebouncedTask(`estimaciones:${pid}`, 900, () => syncEstimacionesNow(pid));
}

export async function syncEstimacionesNow(projectIdOverride = '') {
  const ctx = await getCloudSyncContext(projectIdOverride);
  if (!ctx || !isValidUUID(ctx.projectId)) return { ok: false, skipped: true };

  const raw = localStorage.getItem(`estimaciones_data_${ctx.projectId}`);
  if (!raw) return { ok: true, empty: true };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const ests = Array.isArray(data?.estimaciones) ? data.estimaciones : [];
  if (ests.length === 0) return { ok: true, count: 0 };

  const validStates = new Set(['borrador', 'presentada', 'aprobada', 'pagada']);
  const rows = ests.map((est, idx) => {
    const cleanConceptPhotos = {};
    if (est.conceptPhotos && typeof est.conceptPhotos === 'object') {
      for (const [cid, list] of Object.entries(est.conceptPhotos)) {
        cleanConceptPhotos[cid] = stripInlineBinaryPayloads(Array.isArray(list) ? list : []);
      }
    }
    const cleanFotos = stripInlineBinaryPayloads(Array.isArray(est.fotos) ? est.fotos : []);
    const estado = validStates.has(est.estado) ? est.estado : (est.locked ? 'aprobada' : 'borrador');
    const today = new Date().toISOString().slice(0, 10);

    return {
      proyecto_id: ctx.projectId,
      numero: Number(est.numero || idx + 1),
      nombre: String(est.nombre || `Estimación No. ${idx + 1}`),
      fecha_inicio: est.fechaInicio || today,
      fecha_fin: est.fechaFin || today,
      fecha_corte: est.fechaCorte || est.fechaFin || today,
      notas: String(est.notas || ''),
      estado,
      locked: Boolean(est.locked),
      fotos: cleanFotos,
      resumen: {
        id: est.id,
        activeEstimacionId: data.activeEstimacionId,
        anticipoPct: Number(data.anticipoPct ?? 30),
        ivaPct: Number(data.ivaPct ?? 16),
        conceptPhotos: cleanConceptPhotos
      },
      detalles_json: est.conceptos || {}
    };
  });

  await ctx.sb.from('estimaciones').upsert(rows, { onConflict: 'proyecto_id,numero' });
  return { ok: true, count: rows.length };
}

// ============================================================================
// 4. CRONOGRAMA DE OBRA (Configuración y Jornadas)
// ============================================================================

export function scheduleCronogramaCloudSync(projectId = '') {
  const pid = String(projectId || getActiveProjectId() || '').trim();
  if (!pid) return;
  scheduleDebouncedTask(`cronograma:${pid}`, 900, () => syncCronogramaNow(pid));
}

export async function syncCronogramaNow(projectIdOverride = '') {
  const ctx = await getCloudSyncContext(projectIdOverride);
  if (!ctx) return { ok: false, skipped: true };

  let scheduleSettings = null;
  let workdaysSettings = null;

  try {
    const rawCfg = localStorage.getItem(`calendario_cfg_${ctx.projectId}`);
    if (rawCfg) scheduleSettings = JSON.parse(rawCfg);
  } catch {}

  try {
    const rawWd = localStorage.getItem(`calendario_workdays_${ctx.projectId}`);
    if (rawWd) workdaysSettings = JSON.parse(rawWd);
  } catch {}

  if (!scheduleSettings && !workdaysSettings) return { ok: true, empty: true };

  await ctx.sb.from('cronograma_config').upsert({
    proyecto_id: ctx.projectId,
    empresa_id: ctx.empresaId || null,
    owner_email: ctx.ownerEmail,
    config_json: {
      scheduleSettings,
      workdaysSettings
    }
  }, { onConflict: 'proyecto_id' });

  return { ok: true };
}

// ============================================================================
// 5. CHAT DEL PROYECTO
// ============================================================================

export function scheduleChatCloudSync(projectId = '') {
  const pid = String(projectId || getActiveProjectId() || '').trim();
  if (!pid) return;
  scheduleDebouncedTask(`chat:${pid}`, 600, () => syncChatNow(pid));
}

export async function syncChatNow(projectIdOverride = '') {
  const ctx = await getCloudSyncContext(projectIdOverride);
  if (!ctx) return { ok: false, skipped: true };

  const raw = localStorage.getItem(`adm_const_project_chat_${ctx.projectId}`);
  if (!raw) return { ok: true, empty: true };

  let messages;
  try {
    messages = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(messages) || messages.length === 0) return { ok: true, count: 0 };

  const rows = messages.map((m) => ({
    id: scopedRowId(ctx.projectId, m.id),
    proyecto_id: ctx.projectId,
    empresa_id: ctx.empresaId || null,
    owner_email: ctx.ownerEmail,
    autor_nombre: String(m.authorName || m.autorNombre || 'Usuario'),
    autor_email: String(m.authorEmail || m.autorEmail || ''),
    autor_avatar_url: String(m.authorAvatar || ''),
    mensaje: String(m.text || m.mensaje || ''),
    adjuntos: stripInlineBinaryPayloads(Array.isArray(m.attachments) ? m.attachments : []),
    payload_json: m
  }));

  await ctx.sb.from('chat_mensajes').upsert(rows, { onConflict: 'id' });
  return { ok: true, count: rows.length };
}

// ============================================================================
// HIDRATACIÓN DESDE SUPABASE AL ABRIR PROYECTO
// ============================================================================

export async function hydrateProjectModulesFromCloud(projectIdOverride = '') {
  const ctx = await getCloudSyncContext(projectIdOverride);
  if (!ctx) return { ok: false, skipped: true };

  const pid = ctx.projectId;
  const hydrated = {};

  try {
    const [{ data: bCfg }, { data: bNotes }] = await Promise.all([
      ctx.sb.from('bitacora_config').select('*').eq('proyecto_id', pid).maybeSingle(),
      ctx.sb.from('bitacora_notas').select('*').eq('proyecto_id', pid).order('folio', { ascending: true })
    ]);

    if (bCfg || (Array.isArray(bNotes) && bNotes.length > 0)) {
      const localRaw = localStorage.getItem(`adm_const_bitacora_${pid}`);
      const localObj = localRaw ? JSON.parse(localRaw) : { config: {}, notes: [] };
      const remoteNotes = (bNotes || []).map((row) => ({
        ...(row.payload_json || {}),
        id: unscopeRowId(pid, row.id),
        fotos: undefined,
        evidencias: Array.isArray(row.fotos) ? row.fotos : (row.payload_json?.evidencias || [])
      }));
      const mergedMap = new Map();
      for (const n of remoteNotes) mergedMap.set(n.id, n);
      for (const n of (localObj.notes || [])) {
        if (!mergedMap.has(n.id) || n.estado === 'draft') {
          mergedMap.set(n.id, n);
        }
      }
      const nextBitacora = {
        config: Object.assign({}, bCfg?.config_json || {}, localObj.config || {}),
        notes: Array.from(mergedMap.values())
      };
      localStorage.setItem(`adm_const_bitacora_${pid}`, JSON.stringify(nextBitacora));
      hydrated.bitacora = nextBitacora.notes.length;
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando bitácora:', err?.message);
  }

  try {
    const [{ data: supRows }, { data: recRows }] = await Promise.all([
      ctx.sb.from('proveedores').select('*').eq('proyecto_id', pid),
      ctx.sb.from('compras_gastos').select('*').eq('proyecto_id', pid).order('created_at', { ascending: false })
    ]);

    if ((supRows && supRows.length > 0) || (recRows && recRows.length > 0)) {
      const localRaw = localStorage.getItem(`expenses_control_${pid}`);
      const localObj = localRaw ? JSON.parse(localRaw) : { config: { currency: 'MXN', alertThresholdPercent: 10 }, suppliers: [], records: [] };
      if (!localObj.records?.length && Array.isArray(recRows) && recRows.length > 0) {
        localObj.records = recRows.map((row) => ({
          ...(row.payload_json || {}),
          id: unscopeRowId(pid, row.id),
          evidence: Object.keys(row.evidencia_json || {}).length ? row.evidencia_json : (row.payload_json?.evidence || null)
        }));
      }
      if (!localObj.suppliers?.length && Array.isArray(supRows) && supRows.length > 0) {
        localObj.suppliers = supRows.map((row) => ({
          ...(row.payload_json || {}),
          id: unscopeRowId(pid, row.id)
        }));
      }
      localStorage.setItem(`expenses_control_${pid}`, JSON.stringify(localObj));
      hydrated.expenses = localObj.records?.length || 0;
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando compras:', err?.message);
  }

  try {
    if (isValidUUID(pid)) {
      const { data: estRows } = await ctx.sb
        .from('estimaciones')
        .select('*')
        .eq('proyecto_id', pid)
        .order('numero', { ascending: true });

      const localRaw = localStorage.getItem(`estimaciones_data_${pid}`);
      if (!localRaw && Array.isArray(estRows) && estRows.length > 0) {
        const firstRes = estRows[0]?.resumen || {};
        const payload = {
          activeEstimacionId: firstRes.activeEstimacionId || firstRes.id || 'est_1',
          anticipoPct: Number(firstRes.anticipoPct ?? 30),
          ivaPct: Number(firstRes.ivaPct ?? 16),
          estimaciones: estRows.map((row) => ({
            id: row.resumen?.id || `est_${row.numero}`,
            numero: row.numero,
            nombre: row.nombre,
            fechaInicio: row.fecha_inicio,
            fechaFin: row.fecha_fin,
            fechaCorte: row.fecha_corte,
            notas: row.notas || '',
            locked: Boolean(row.locked),
            fotos: Array.isArray(row.fotos) ? row.fotos : [],
            conceptPhotos: row.resumen?.conceptPhotos || {},
            conceptos: row.detalles_json || {}
          }))
        };
        localStorage.setItem(`estimaciones_data_${pid}`, JSON.stringify(payload));
        hydrated.estimaciones = payload.estimaciones.length;
      }
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando estimaciones:', err?.message);
  }

  try {
    const { data: cCfg } = await ctx.sb
      .from('cronograma_config')
      .select('config_json')
      .eq('proyecto_id', pid)
      .maybeSingle();

    if (cCfg?.config_json) {
      if (cCfg.config_json.scheduleSettings && !localStorage.getItem(`calendario_cfg_${pid}`)) {
        localStorage.setItem(`calendario_cfg_${pid}`, JSON.stringify(cCfg.config_json.scheduleSettings));
      }
      if (cCfg.config_json.workdaysSettings && !localStorage.getItem(`calendario_workdays_${pid}`)) {
        localStorage.setItem(`calendario_workdays_${pid}`, JSON.stringify(cCfg.config_json.workdaysSettings));
      }
      hydrated.cronograma = true;
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando cronograma:', err?.message);
  }

  try {
    const { data: chatRows } = await ctx.sb
      .from('chat_mensajes')
      .select('*')
      .eq('proyecto_id', pid)
      .order('created_at', { ascending: true });

    if (Array.isArray(chatRows) && chatRows.length > 0) {
      const localRaw = localStorage.getItem(`adm_const_project_chat_${pid}`);
      const localMsgs = localRaw ? JSON.parse(localRaw) : [];
      const merged = new Map();
      for (const r of chatRows) {
        const msg = { ...(r.payload_json || {}), id: unscopeRowId(pid, r.id) };
        merged.set(msg.id, msg);
      }
      for (const m of localMsgs) {
        if (!merged.has(m.id)) merged.set(m.id, m);
      }
      const finalMsgs = Array.from(merged.values());
      localStorage.setItem(`adm_const_project_chat_${pid}`, JSON.stringify(finalMsgs));
      hydrated.chat = finalMsgs.length;
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando chat:', err?.message);
  }

  if (typeof window !== 'undefined' && Object.keys(hydrated).length > 0) {
    window.dispatchEvent(new CustomEvent('cubikar:cloud-modules-hydrated', { detail: { projectId: pid, hydrated } }));
  }

  return { ok: true, projectId: pid, hydrated };
}
