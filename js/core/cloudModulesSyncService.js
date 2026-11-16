import { getActiveProjectId } from '../config/constants.js?v=20261116_cf11';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261116_cf11';
import { isValidUUID, resolveUserEmpresaId } from './cloudProjectService.js?v=20261116_cf11';
import { getCurrentUser, getProjectById } from '../modules/portal/projectService.js?v=20261116_cf11';

const pendingTimers = new Map();

function scopedRowId(projectId, localId) {
  const pid = String(projectId || 'default');
  const cleanLocal = String(localId || '').replace(/^.*?(?:__|::)/, '');
  return `${pid}::${cleanLocal}`;
}

function unscopeRowId(projectId, storedId) {
  return String(storedId || '').replace(/^.*?(?:__|::)/, '');
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
  const cloudUuid = isValidUUID(project?.cloudId)
    ? String(project.cloudId).trim()
    : (isValidUUID(projectId) ? projectId : '');
  const currentUser = getCurrentUser();
  const ownerEmail = String(
    project?.ownerEmail ||
    project?.hostEmail ||
    currentUser?.email ||
    user.email ||
    ''
  ).trim().toLowerCase();

  const empresaId = await resolveUserEmpresaId(sb, user);

  return { sb, user, projectId, cloudUuid, project, ownerEmail, empresaId };
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

  const targetPid = ctx.cloudUuid || ctx.projectId;
  const candidatePids = Array.from(new Set([targetPid, ctx.projectId, ctx.cloudUuid].filter(Boolean)));
  const raw = localStorage.getItem(`adm_const_bitacora_${ctx.projectId}`);
  if (!raw) return { ok: true, empty: true };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const cfg = data?.config || {};
  const syncTs = new Date().toISOString();
  const cleanCfg = {
    ...cfg,
    updatedAt: cfg.updatedAt || syncTs,
    driveConfig: undefined
  };

  await ctx.sb.from('bitacora_config').upsert({
    proyecto_id: targetPid,
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

  const notes = (Array.isArray(data?.notes) ? data.notes : [])
    .filter((note) => note && note.id && !String(note.id).startsWith('__'));
  const rows = notes.map((note) => {
    const cleanPhotos = stripInlineBinaryPayloads(Array.isArray(note.evidencias) ? note.evidencias : []);
    const pdfArtifact = note.pdfArtifact || note.driveArtifacts?.pdf || {};
    const cleanPayload = {
      ...note,
      updatedAt: note.updatedAt || note.createdAt || syncTs,
      evidencias: cleanPhotos,
      driveArtifacts: undefined
    };
    return {
      id: scopedRowId(targetPid, note.id),
      proyecto_id: targetPid,
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

  if (rows.length > 0) {
    await ctx.sb.from('bitacora_notas').upsert(rows, { onConflict: 'id' });
  } else {
    await ctx.sb.from('bitacora_notas').delete().eq('proyecto_id', targetPid);
  }

  const { data: existingRemoteNotes } = await ctx.sb
    .from('bitacora_notas')
    .select('id')
    .in('proyecto_id', candidatePids);

  if (Array.isArray(existingRemoteNotes)) {
    const activeNoteSet = new Set(rows.map((r) => r.id));
    const notesToDelete = existingRemoteNotes.map((r) => r.id).filter((id) => !activeNoteSet.has(id));
    if (notesToDelete.length > 0) {
      await ctx.sb.from('bitacora_notas').delete().in('id', notesToDelete);
    }
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

  const targetPid = ctx.cloudUuid || ctx.projectId;
  const candidatePids = Array.from(new Set([targetPid, ctx.projectId, ctx.cloudUuid].filter(Boolean)));
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
    id: scopedRowId(targetPid, s.id),
    proyecto_id: targetPid,
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
  } else {
    await ctx.sb.from('proveedores').delete().eq('proyecto_id', targetPid);
  }

  const { data: existingRemoteSups } = await ctx.sb
    .from('proveedores')
    .select('id')
    .in('proyecto_id', candidatePids);

  if (Array.isArray(existingRemoteSups)) {
    const activeSupSet = new Set(supplierRows.map((row) => row.id));
    const supsToDelete = existingRemoteSups.map((row) => row.id).filter((id) => !activeSupSet.has(id));
    if (supsToDelete.length > 0) {
      await ctx.sb.from('proveedores').delete().in('id', supsToDelete);
    }
  }

  const records = Array.isArray(data?.records) ? data.records : [];
  const recordRows = records.map((r) => {
    const cleanEvidence = stripInlineBinaryPayloads(r.evidence || null);
    return {
      id: scopedRowId(targetPid, r.id),
      proyecto_id: targetPid,
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
  } else {
    await ctx.sb.from('compras_gastos').delete().eq('proyecto_id', targetPid);
  }

  // Limpiar registros eliminados en este proyecto
  const { data: existingRemote } = await ctx.sb
    .from('compras_gastos')
    .select('id')
    .in('proyecto_id', candidatePids);

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
  const estProjectId = ctx?.cloudUuid || '';
  if (!ctx || !isValidUUID(estProjectId)) return { ok: false, skipped: true };

  const raw = localStorage.getItem(`estimaciones_data_${ctx.projectId}`);
  if (!raw) return { ok: true, empty: true };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  const ests = Array.isArray(data?.estimaciones) ? data.estimaciones : [];
  if (ests.length === 0) {
    await ctx.sb.from('estimaciones').delete().eq('proyecto_id', estProjectId);
    return { ok: true, count: 0 };
  }

  const validStates = new Set(['borrador', 'presentada', 'aprobada', 'pagada']);
  const syncTimestamp = new Date().toISOString();
  const rows = ests.map((est, idx) => {
    const cleanConceptPhotos = {};
    if (est.conceptPhotos && typeof est.conceptPhotos === 'object') {
      for (const [cid, list] of Object.entries(est.conceptPhotos)) {
        cleanConceptPhotos[cid] = stripInlineBinaryPayloads(Array.isArray(list) ? list : []);
      }
    }
    const cleanFotos = stripInlineBinaryPayloads(Array.isArray(est.fotos) ? est.fotos : []);
    const estado = validStates.has(est.estado) ? est.estado : (est.locked ? 'aprobada' : 'borrador');
    const today = syncTimestamp.slice(0, 10);
    const estNumero = Number.isFinite(Number(est.numero)) ? Number(est.numero) : (idx + 1);

    return {
      proyecto_id: estProjectId,
      numero: estNumero,
      nombre: String(est.nombre || `Estimación No. ${estNumero}`),
      fecha_inicio: est.fechaInicio || today,
      fecha_fin: est.fechaFin || today,
      fecha_corte: est.fechaCorte || est.fechaFin || today,
      notas: String(est.notas || ''),
      estado,
      locked: Boolean(est.locked),
      fotos: cleanFotos,
      resumen: {
        id: est.id,
        tipo: est.tipo || (estNumero === 0 ? 'anticipo' : 'avance'),
        factura: est.factura || null,
        updatedAt: data.updatedAt || syncTimestamp,
        activeEstimacionId: data.activeEstimacionId,
        anticipoPct: Number(data.anticipoPct ?? 30),
        ivaPct: Number(data.ivaPct ?? 16),
        conceptPhotos: cleanConceptPhotos
      },
      detalles_json: est.conceptos || {}
    };
  });

  const { error } = await ctx.sb.from('estimaciones').upsert(rows, { onConflict: 'proyecto_id,numero' });
  if (error) {
    console.warn('[cloudModulesSyncService] Error sincronizando estimaciones:', error.message || error);
    return { ok: false, error };
  }

  const { data: existingRemoteEsts } = await ctx.sb
    .from('estimaciones')
    .select('numero')
    .eq('proyecto_id', estProjectId);

  if (Array.isArray(existingRemoteEsts)) {
    const activeNumeros = new Set(rows.map((r) => Number(r.numero)));
    const numsToDelete = existingRemoteEsts
      .map((r) => Number(r.numero))
      .filter((num) => !activeNumeros.has(num));
    if (numsToDelete.length > 0) {
      await ctx.sb
        .from('estimaciones')
        .delete()
        .eq('proyecto_id', estProjectId)
        .in('numero', numsToDelete);
    }
  }

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

  const targetPid = ctx.cloudUuid || ctx.projectId;
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
    proyecto_id: targetPid,
    empresa_id: ctx.empresaId || null,
    owner_email: ctx.ownerEmail,
    config_json: {
      scheduleSettings,
      workdaysSettings,
      updatedAt: new Date().toISOString()
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

  const targetChatPid = ctx.cloudUuid || ctx.projectId;
  const raw = localStorage.getItem(`adm_const_project_chat_${ctx.projectId}`);
  if (!raw) return { ok: true, empty: true };

  let messages;
  try {
    messages = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!Array.isArray(messages) || messages.length === 0) return { ok: true, count: 0 };

  const rows = messages.map((m) => {
    const cleanId = String(m.id || '').replace(/^.*?(?:__|::)/, '');
    return {
      id: `${targetChatPid}__${cleanId}`,
      proyecto_id: targetChatPid,
      autor_nombre: String(m.authorName || m.autorNombre || 'Usuario'),
      autor_email: String(m.authorEmail || m.autorEmail || ''),
      autor_avatar_url: String(m.authorAvatar || ''),
      mensaje: String(m.text || m.mensaje || ''),
      partida_id: m.partidaId ? String(m.partidaId) : null,
      etiquetas: Array.isArray(m.mentions) ? m.mentions : [],
      payload_json: { ...m, id: cleanId }
    };
  });

  const { error } = await ctx.sb.from('chat_mensajes').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.warn('[cloudModulesSyncService] Error sincronizando chat:', error.message || error);
    return { ok: false, error };
  }
  return { ok: true, count: rows.length };
}

// ============================================================================
// HIDRATACIÓN DESDE SUPABASE AL ABRIR PROYECTO
// ============================================================================

export async function hydrateProjectModulesFromCloud(projectIdOverride = '') {
  const ctx = await getCloudSyncContext(projectIdOverride);
  if (!ctx) return { ok: false, skipped: true };

  const pid = ctx.projectId;
  const queryPids = Array.from(new Set([pid, ctx.cloudUuid].filter(Boolean)));
  const hydrated = {};

  try {
    const [{ data: bCfg }, { data: bNotes }] = await Promise.all([
      ctx.sb.from('bitacora_config').select('*').in('proyecto_id', queryPids).limit(1).maybeSingle(),
      ctx.sb.from('bitacora_notas').select('*').in('proyecto_id', queryPids).order('folio', { ascending: true })
    ]);

    if (bCfg || (Array.isArray(bNotes) && bNotes.length > 0)) {
      const localRaw = localStorage.getItem(`adm_const_bitacora_${pid}`);
      const localObj = localRaw ? JSON.parse(localRaw) : { config: {}, notes: [] };
      const remoteNotes = (bNotes || [])
        .map((row) => ({
          ...(row.payload_json || {}),
          id: unscopeRowId(pid, row.id),
          estado: row.estado || row.payload_json?.estado || 'draft',
          updatedAt: row.payload_json?.updatedAt || row.updated_at || row.created_at || '',
          fotos: undefined,
          evidencias: Array.isArray(row.fotos) ? row.fotos : (row.payload_json?.evidencias || [])
        }))
        .filter((n) => n.id && !String(n.id).startsWith('__'));

      const mergedMap = new Map();
      for (const n of remoteNotes) mergedMap.set(n.id, n);
      for (const n of (localObj.notes || [])) {
        if (!n || !n.id || String(n.id).startsWith('__')) continue;
        const remote = mergedMap.get(n.id);
        if (!remote) {
          mergedMap.set(n.id, n);
          continue;
        }
        // Proteger notas asentadas/firmadas: jamás sobrescribir una nota 'sealed' con un borrador local
        if (remote.estado === 'sealed') continue;
        if (n.estado === 'sealed') {
          mergedMap.set(n.id, n);
          continue;
        }
        const localTs = Date.parse(n.updatedAt || n.createdAt || '') || 0;
        const remoteTs = Date.parse(remote.updatedAt || remote.createdAt || '') || 0;
        if (localTs > remoteTs) {
          mergedMap.set(n.id, n);
        }
      }

      const remoteCfg = bCfg?.config_json || {};
      const remoteCfgTs = Date.parse(remoteCfg.updatedAt || bCfg?.updated_at || '') || 0;
      const localCfgTs = Date.parse(localObj?.config?.updatedAt || '') || 0;
      const mergedConfig = remoteCfgTs >= localCfgTs
        ? Object.assign({}, localObj.config || {}, remoteCfg)
        : Object.assign({}, remoteCfg, localObj.config || {});

      const nextBitacora = {
        config: mergedConfig,
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
      ctx.sb.from('proveedores').select('*').in('proyecto_id', queryPids),
      ctx.sb.from('compras_gastos').select('*').in('proyecto_id', queryPids).order('created_at', { ascending: false })
    ]);

    if ((supRows && supRows.length > 0) || (recRows && recRows.length > 0)) {
      const localRaw = localStorage.getItem(`expenses_control_${pid}`);
      const localObj = localRaw ? JSON.parse(localRaw) : { config: { currency: 'MXN', alertThresholdPercent: 10 }, suppliers: [], records: [] };
      const lastPullTs = Date.parse(localObj.lastCloudSyncAt || '') || 0;
      const nowIso = new Date().toISOString();

      if (Array.isArray(recRows)) {
        const localRecMap = new Map();
        (localObj.records || []).forEach((rec) => {
          if (rec && rec.id && !String(rec.id).startsWith('__')) localRecMap.set(rec.id, rec);
        });
        const mergedRecMap = new Map();
        for (const row of recRows) {
          const cid = unscopeRowId(pid, row.id);
          if (!cid || cid.startsWith('__')) continue;
          const remoteRec = {
            ...(row.payload_json || {}),
            id: cid,
            updatedAt: row.payload_json?.updatedAt || row.updated_at || row.created_at || '',
            evidence: Object.keys(row.evidencia_json || {}).length ? row.evidencia_json : (row.payload_json?.evidence || null)
          };
          const localRec = localRecMap.get(cid);
          const localTs = localRec ? (Date.parse(localRec.updatedAt || localRec.createdAt || '') || 0) : 0;
          const remoteTs = Date.parse(remoteRec.updatedAt || '') || 0;
          mergedRecMap.set(cid, (localRec && localTs > remoteTs) ? localRec : remoteRec);
        }
        // Conservar únicamente registros locales nuevos aún no enviados a la nube tras la última sincronización
        for (const [cid, rec] of localRecMap.entries()) {
          if (mergedRecMap.has(cid)) continue;
          const localTs = Date.parse(rec.updatedAt || rec.createdAt || '') || 0;
          if (!lastPullTs || localTs > lastPullTs) {
            mergedRecMap.set(cid, rec);
          }
        }
        localObj.records = Array.from(mergedRecMap.values());
      }

      if (Array.isArray(supRows) && supRows.length > 0) {
        const localSupMap = new Map();
        (localObj.suppliers || []).forEach((s) => {
          if (s && s.id && !String(s.id).startsWith('__')) localSupMap.set(s.id, s);
        });
        const mergedSupMap = new Map();
        for (const row of supRows) {
          const sid = unscopeRowId(pid, row.id);
          if (!sid || sid.startsWith('__')) continue;
          const remoteSup = {
            ...(row.payload_json || {}),
            id: sid,
            updatedAt: row.payload_json?.updatedAt || row.updated_at || row.created_at || ''
          };
          const localSup = localSupMap.get(sid);
          const localTs = localSup ? (Date.parse(localSup.updatedAt || '') || 0) : 0;
          const remoteTs = Date.parse(remoteSup.updatedAt || '') || 0;
          mergedSupMap.set(sid, (localSup && localTs > remoteTs) ? localSup : remoteSup);
        }
        for (const [sid, s] of localSupMap.entries()) {
          if (!mergedSupMap.has(sid)) mergedSupMap.set(sid, s);
        }
        localObj.suppliers = Array.from(mergedSupMap.values());
      }

      localObj.lastCloudSyncAt = nowIso;
      localStorage.setItem(`expenses_control_${pid}`, JSON.stringify(localObj));
      hydrated.expenses = localObj.records?.length || 0;
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando compras:', err?.message);
  }

  try {
    const estProjectId = ctx.cloudUuid || '';
    if (isValidUUID(estProjectId)) {
      const { data: estRows } = await ctx.sb
        .from('estimaciones')
        .select('*')
        .eq('proyecto_id', estProjectId)
        .order('numero', { ascending: true });

      if (Array.isArray(estRows) && estRows.length > 0) {
        const localRaw = localStorage.getItem(`estimaciones_data_${pid}`);
        let localObj = null;
        try { localObj = localRaw ? JSON.parse(localRaw) : null; } catch { localObj = null; }
        const remoteMaxTs = estRows.reduce((maxTs, row) => Math.max(maxTs, Date.parse(row.updated_at || row.resumen?.updatedAt || '') || 0), 0);
        const localTs = Date.parse(localObj?.updatedAt || '') || 0;

        if (!localObj || remoteMaxTs >= localTs) {
          const firstRes = estRows[0]?.resumen || {};
          const payload = {
            activeEstimacionId: firstRes.activeEstimacionId || firstRes.id || 'est_1',
            anticipoPct: Number(firstRes.anticipoPct ?? 30),
            ivaPct: Number(firstRes.ivaPct ?? 16),
            updatedAt: remoteMaxTs > 0 ? new Date(remoteMaxTs).toISOString() : new Date().toISOString(),
            estimaciones: estRows.map((row) => ({
              id: row.resumen?.id || `est_${row.numero}`,
              numero: row.numero,
              tipo: row.resumen?.tipo || (Number(row.numero) === 0 ? 'anticipo' : 'avance'),
              nombre: row.nombre,
              fechaInicio: row.fecha_inicio,
              fechaFin: row.fecha_fin,
              fechaCorte: row.fecha_corte,
              notas: row.notas || '',
              locked: Boolean(row.locked),
              factura: row.resumen?.factura || null,
              fotos: Array.isArray(row.fotos) ? row.fotos : [],
              conceptPhotos: row.resumen?.conceptPhotos || {},
              conceptos: row.detalles_json || {}
            }))
          };
          localStorage.setItem(`estimaciones_data_${pid}`, JSON.stringify(payload));
          hydrated.estimaciones = payload.estimaciones.length;
        }
      }
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando estimaciones:', err?.message);
  }

  try {
    const { data: cCfg } = await ctx.sb
      .from('cronograma_config')
      .select('config_json, updated_at')
      .in('proyecto_id', queryPids)
      .limit(1)
      .maybeSingle();

    if (cCfg?.config_json) {
      const remoteTs = Date.parse(cCfg.config_json.updatedAt || cCfg.updated_at || '') || 0;
      const localCfgRaw = localStorage.getItem(`calendario_cfg_${pid}`);
      let localCfgObj = null;
      try { localCfgObj = localCfgRaw ? JSON.parse(localCfgRaw) : null; } catch { localCfgObj = null; }
      const localTs = Date.parse(localCfgObj?.updatedAt || '') || 0;

      if (cCfg.config_json.scheduleSettings && (!localCfgObj || remoteTs >= localTs)) {
        const nextCfg = { ...cCfg.config_json.scheduleSettings, updatedAt: cCfg.config_json.updatedAt || cCfg.updated_at || new Date().toISOString() };
        localStorage.setItem(`calendario_cfg_${pid}`, JSON.stringify(nextCfg));
      }
      const localWdRaw = localStorage.getItem(`calendario_workdays_${pid}`);
      let localWdObj = null;
      try { localWdObj = localWdRaw ? JSON.parse(localWdRaw) : null; } catch { localWdObj = null; }
      const localWdTs = Date.parse(localWdObj?.updatedAt || '') || 0;
      if (cCfg.config_json.workdaysSettings && (!localWdObj || remoteTs >= localWdTs)) {
        const nextWd = { ...cCfg.config_json.workdaysSettings, updatedAt: cCfg.config_json.updatedAt || cCfg.updated_at || new Date().toISOString() };
        localStorage.setItem(`calendario_workdays_${pid}`, JSON.stringify(nextWd));
      }
      hydrated.cronograma = true;
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando cronograma:', err?.message);
  }

  try {
    if (!String(pid).startsWith('__')) {
      const chatIds = Array.from(new Set([pid, ctx.cloudUuid].filter(v => v && !String(v).startsWith('__'))));
      const { data: chatRows } = await ctx.sb
        .from('chat_mensajes')
        .select('*')
        .in('proyecto_id', chatIds)
        .order('created_at', { ascending: true });

      if (Array.isArray(chatRows) && chatRows.length > 0) {
        const localRaw = localStorage.getItem(`adm_const_project_chat_${pid}`);
        const localMsgs = localRaw ? JSON.parse(localRaw) : [];
        const localMap = new Map();
        if (Array.isArray(localMsgs)) {
          for (const m of localMsgs) {
            if (m && m.id) {
              const cleanLocalId = String(m.id || '').replace(/^.*?(?:__|::)/, '');
              localMap.set(cleanLocalId, { ...m, id: cleanLocalId });
            }
          }
        }
        const merged = new Map();
        for (const r of chatRows) {
          if (!r || (r.id && String(r.id).startsWith('__'))) continue;
          const cleanId = String(r.payload_json?.id || r.id || '').replace(/^.*?(?:__|::)/, '');
          if (!cleanId) continue;
          const remoteMsg = { ...(r.payload_json || {}), id: cleanId };
          const prev = localMap.get(remoteMsg.id);
          if (prev) {
            merged.set(remoteMsg.id, {
              ...remoteMsg,
              isRead: Boolean(prev.isRead || remoteMsg.isRead),
              dismissed: Boolean(prev.dismissed || remoteMsg.dismissed),
              readBy: Array.isArray(prev.readBy) && prev.readBy.length > 0 ? prev.readBy : (remoteMsg.readBy || [])
            });
          } else {
            merged.set(remoteMsg.id, remoteMsg);
          }
        }
        for (const [mId, m] of localMap.entries()) {
          if (!merged.has(mId)) merged.set(mId, m);
        }
        const finalMsgs = Array.from(merged.values());
        localStorage.setItem(`adm_const_project_chat_${pid}`, JSON.stringify(finalMsgs));
        hydrated.chat = finalMsgs.length;
      }
    }
  } catch (err) {
    console.warn('[cloudModulesSyncService] Error hidratando chat:', err?.message);
  }

  if (typeof window !== 'undefined' && Object.keys(hydrated).length > 0) {
    window.dispatchEvent(new CustomEvent('cubikar:cloud-modules-hydrated', { detail: { projectId: pid, hydrated } }));
  }

  return { ok: true, projectId: pid, hydrated };
}
