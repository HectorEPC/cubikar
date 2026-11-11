import { resolveUserEmpresaId } from '../core/cloudProjectService.js';
import { getSupabaseClient, isSupabaseConfigured } from '../core/supabaseClient.js';
import { getCurrentUser } from '../modules/portal/projectService.js';
import { showToast } from '../ui/notifications.js';
import {
  computeSha256Hex,
  formatBytes,
  getFileExtension,
  processFileForUpload
} from '../utils/fileCompressor.js';
import {
  deleteCachedMediaRecord,
  getCachedMediaDataUrl,
  getCachedMediaObjectUrl,
  getCachedMediaRecord,
  listPendingUploads,
  markMediaUploaded,
  putCachedMediaBlob
} from './mediaCacheDb.js';
import {
  notifyStorageUsageChanged,
  resolveHostStorageContext,
  validatePostCompressionQuota,
  validatePreCompressionFile
} from './storageQuotaService.js';

function getPresignApiUrl() {
  const customBase = (typeof window !== 'undefined' && window.__CUBIKAR_API_BASE__) ? String(window.__CUBIKAR_API_BASE__).replace(/\/+$/, '') : '';
  return `${customBase}/api/s3-presign`;
}

async function getSupabaseAccessToken() {
  if (!isSupabaseConfigured()) return null;
  const sb = await getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
}

async function callPresignEndpoint(payload, accessToken = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(getPresignApiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Consulta si las variables de AWS S3 ya están activas en el servidor Vercel.
 */
export async function getS3BackendStatus() {
  try {
    const res = await callPresignEndpoint({ action: 'status' });
    if (!res.ok) return { configured: false };
    return res.data;
  } catch {
    return { configured: false };
  }
}

async function registerArchivoEnSupabase({
  s3Key,
  bucket,
  modulo,
  categoria,
  proyectoId,
  entidadId,
  ownerEmail,
  uploadedByEmail,
  fileName,
  mimeType,
  extension,
  originalBytes,
  finalBytes,
  sha256,
  metadata = {}
}) {
  if (!isSupabaseConfigured()) return '';
  const sb = await getSupabaseClient();
  if (!sb) return '';

  const { data: userRes } = await sb.auth.getUser();
  const user = userRes?.user || null;
  const empresaId = user ? await resolveUserEmpresaId(sb, user) : null;

  const row = {
    empresa_id: empresaId || null,
    proyecto_id: String(proyectoId || ''),
    owner_email: String(ownerEmail || user?.email || 'local@cubikar.app').toLowerCase(),
    uploaded_by_email: String(uploadedByEmail || user?.email || '').toLowerCase(),
    modulo,
    categoria,
    entidad_id: String(entidadId || ''),
    nombre_original: fileName,
    mime_type: mimeType,
    extension: extension || getFileExtension(fileName),
    s3_bucket: bucket || '',
    s3_key: s3Key,
    tamano_original_bytes: Number(originalBytes || finalBytes || 0),
    tamano_bytes: Number(finalBytes || 0),
    sha256: sha256 || '',
    metadata: metadata || {}
  };

  const { data, error } = await sb
    .from('archivos_almacen')
    .upsert(row, { onConflict: 's3_key' })
    .select('id')
    .single();

  if (error) {
    console.warn('[s3StorageService] Error registrando archivo en archivos_almacen:', error.message);
    return '';
  }

  return data?.id || '';
}

async function attemptDirectS3Upload({
  blob,
  fileName,
  mimeType,
  modulo,
  categoria,
  proyectoId,
  entidadId,
  ownerEmail,
  originalBytes,
  finalBytes,
  sha256,
  metadata
}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { uploaded: false, reason: 'offline' };
  }

  const token = await getSupabaseAccessToken();
  if (!token) {
    return { uploaded: false, reason: 'no_auth' };
  }

  const presign = await callPresignEndpoint({
    action: 'upload',
    fileName,
    mimeType,
    fileSizeBytes: finalBytes,
    originalBytes,
    modulo,
    categoria,
    proyectoId,
    ownerEmail
  }, token);

  if (!presign.ok) {
    if (presign.status === 413 || presign.data?.code === 'QUOTA_EXCEEDED') {
      throw new Error(presign.data?.error || 'Cuota de almacenamiento en la nube alcanzada.');
    }
    return {
      uploaded: false,
      reason: presign.data?.code || `http_${presign.status}`,
      message: presign.data?.error || ''
    };
  }

  const putRes = await fetch(presign.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob
  });

  if (!putRes.ok) {
    throw new Error(`Error al transferir archivo a AWS S3 (HTTP ${putRes.status}).`);
  }

  const user = getCurrentUser();
  const archivoId = await registerArchivoEnSupabase({
    s3Key: presign.data.s3Key,
    bucket: presign.data.bucket,
    modulo,
    categoria,
    proyectoId,
    entidadId,
    ownerEmail,
    uploadedByEmail: user?.email || ownerEmail,
    fileName,
    mimeType,
    extension: getFileExtension(fileName),
    originalBytes,
    finalBytes,
    sha256,
    metadata
  });

  return {
    uploaded: true,
    s3Key: presign.data.s3Key,
    bucket: presign.data.bucket,
    archivoId,
    quota: presign.data.quota || null
  };
}

/**
 * Flujo unificado de subida:
 * 1. Valida límite por archivo (5/15/25 MB) y cuota disponible.
 * 2. Comprime imágenes (<canvas> 1280px, JPEG/WebP 0.75) o deja PDF/XML intactos.
 * 3. Muestra toast de optimización al usuario.
 * 4. Valida cuota resultante (alerta ámbar >= 90%, bloqueo >= 100%).
 * 5. Guarda en IndexedDB y sube vía URL prefirmada a AWS S3 + registra en Supabase.
 */
export async function uploadManagedFile({
  file,
  modulo = 'otros',
  categoria = '',
  proyectoId = '',
  entidadId = '',
  preset = 'photo',
  mimeType = '',
  showFeedback = true,
  includeDataUrl = false,
  metadata = {}
} = {}) {
  if (!file) {
    return { ok: false, reason: 'No se seleccionó ningún archivo.' };
  }

  const resolvedCat = categoria || (
    modulo === 'catalogos_maestros'
      ? 'master_catalog'
      : (modulo === 'branding' || modulo === 'avatares' ? 'branding' : 'project_files')
  );
  const hostCtx = resolveHostStorageContext(proyectoId);
  const effectiveProjectId = String(proyectoId || hostCtx.projectId || '');

  // Etapa 1: Límite individual y bloqueo previo si ya está al 100%
  const preCheck = await validatePreCompressionFile(file, {
    projectId: effectiveProjectId,
    categoria: resolvedCat
  });
  if (!preCheck.allowed) {
    if (showFeedback) {
      showToast(preCheck.reason, preCheck.blockedByQuota ? 'error' : 'warning', 5500);
    }
    return { ok: false, blocked: true, reason: preCheck.reason, summary: preCheck.summary };
  }

  // Etapa 2: Compresión en cliente (PDF/XML quedan intactos)
  const processed = await processFileForUpload(file, {
    preset,
    mimeType,
    includeDataUrl
  });

  if (showFeedback && processed.compressed) {
    showToast(`Optimizando imagen (${processed.summaryText})...`, 'info', 3500);
  }

  // Etapa 3: Validación contra cuota restante después de comprimir
  const postCheck = await validatePostCompressionQuota(processed.finalBytes, {
    projectId: effectiveProjectId,
    categoria: resolvedCat
  });

  if (!postCheck.allowed) {
    if (showFeedback) {
      showToast(postCheck.reason, 'error', 6000);
    }
    return { ok: false, blocked: true, reason: postCheck.reason, summary: postCheck.summary };
  }

  if (showFeedback && postCheck.warning90 && postCheck.warningMessage) {
    showToast(postCheck.warningMessage, 'warning', 5500);
  }

  const sha256 = await computeSha256Hex(processed.blob);

  // Etapa 4: Guardar binario en IndexedDB local (caché instantánea + cola offline)
  const cachedRecord = await putCachedMediaBlob({
    proyectoId: effectiveProjectId,
    ownerEmail: hostCtx.ownerEmail,
    modulo,
    categoria: resolvedCat,
    entidadId,
    fileName: processed.fileName,
    mimeType: processed.mimeType,
    originalBytes: processed.originalBytes,
    finalBytes: processed.finalBytes,
    sha256,
    blob: processed.blob,
    metadata,
    status: 'pending_upload'
  });

  // Etapa 5: Intentar transferencia a AWS S3 mediante URL prefirmada
  let cloudResult = { uploaded: false, reason: 'local_only' };
  try {
    cloudResult = await attemptDirectS3Upload({
      blob: processed.blob,
      fileName: processed.fileName,
      mimeType: processed.mimeType,
      modulo,
      categoria: resolvedCat,
      proyectoId: effectiveProjectId,
      entidadId,
      ownerEmail: hostCtx.ownerEmail,
      originalBytes: processed.originalBytes,
      finalBytes: processed.finalBytes,
      sha256,
      metadata
    });

    if (cloudResult.uploaded) {
      await markMediaUploaded(cachedRecord.mediaId, {
        s3Key: cloudResult.s3Key,
        archivoId: cloudResult.archivoId
      });
    }
  } catch (err) {
    // Error explícito de cuota en servidor o fallo de S3 PUT
    const isQuotaErr = String(err?.message || '').toLowerCase().includes('cuota') ||
      String(err?.message || '').toLowerCase().includes('espacio');
    if (isQuotaErr) {
      await deleteCachedMediaRecord(cachedRecord.mediaId);
      if (showFeedback) showToast(err.message, 'error', 5500);
      return { ok: false, blocked: true, reason: err.message };
    }
    console.warn('[s3StorageService] Archivo retenido en cola local IndexedDB:', err?.message || err);
  }

  notifyStorageUsageChanged({
    modulo,
    proyectoId: effectiveProjectId,
    cloudSynced: cloudResult.uploaded
  });

  return {
    ok: true,
    cloudSynced: Boolean(cloudResult.uploaded),
    pendingSync: !cloudResult.uploaded,
    pendingReason: cloudResult.reason || '',
    mediaId: cachedRecord.mediaId,
    archivoId: cloudResult.archivoId || '',
    s3Key: cloudResult.s3Key || '',
    bucket: cloudResult.bucket || '',
    fileName: processed.fileName,
    mimeType: processed.mimeType,
    extension: processed.extension,
    width: processed.width,
    height: processed.height,
    originalBytes: processed.originalBytes,
    finalBytes: processed.finalBytes,
    compressed: processed.compressed,
    savedBytes: processed.savedBytes,
    reductionPct: processed.reductionPct,
    summaryText: processed.summaryText,
    sizeLabel: formatBytes(processed.finalBytes),
    blob: processed.blob,
    dataUrl: processed.dataUrl
  };
}

/**
 * Resuelve la URL utilizable de un archivo: primero desde IndexedDB local (cero descarga repetida),
 * después vía URL prefirmada GET de AWS S3, y finalmente cualquier legado en localDataUrl.
 */
export async function resolveManagedFileUrl(ref = {}, options = {}) {
  const normalized = typeof ref === 'string'
    ? (ref.includes('/') ? { s3Key: ref } : { mediaId: ref })
    : (ref || {});

  const key = normalized.mediaId || normalized.s3Key;
  if (key) {
    const localUrl = await getCachedMediaObjectUrl(key);
    if (localUrl) return localUrl;
  }

  if (normalized.s3Key) {
    const token = await getSupabaseAccessToken();
    if (token) {
      const presign = await callPresignEndpoint({
        action: 'download',
        s3Key: normalized.s3Key,
        download: Boolean(options.download)
      }, token);

      if (presign.ok && presign.data?.downloadUrl) {
        if (options.cacheRemote) {
          try {
            const resp = await fetch(presign.data.downloadUrl);
            if (resp.ok) {
              const downloadedBlob = await resp.blob();
              const cached = await putCachedMediaBlob({
                mediaId: normalized.mediaId || undefined,
                s3Key: normalized.s3Key,
                archivoId: normalized.archivoId || '',
                proyectoId: normalized.proyectoId || '',
                fileName: normalized.fileName || 'archivo',
                mimeType: downloadedBlob.type || normalized.mimeType,
                originalBytes: downloadedBlob.size,
                finalBytes: downloadedBlob.size,
                blob: downloadedBlob,
                status: 'synced'
              });
              return getCachedMediaObjectUrl(cached.mediaId);
            }
          } catch {
            // Devolver URL prefirmada directa si falla cacheo
          }
        }
        return presign.data.downloadUrl;
      }
    }
  }

  return normalized.localDataUrl || normalized.dataUrl || normalized.url || '';
}

/**
 * Obtiene un DataURL (útil para incrustar imágenes en jsPDF o cropper) desde IndexedDB o S3.
 */
export async function resolveManagedFileDataUrl(ref = {}) {
  const normalized = typeof ref === 'string'
    ? (ref.includes('/') ? { s3Key: ref } : { mediaId: ref })
    : (ref || {});

  const lookup = normalized.mediaId || normalized.s3Key;
  if (lookup) {
    const localDataUrl = await getCachedMediaDataUrl(lookup);
    if (localDataUrl) return localDataUrl;
  }

  if (normalized.s3Key) {
    const token = await getSupabaseAccessToken();
    if (token) {
      const presign = await callPresignEndpoint({
        action: 'download',
        s3Key: normalized.s3Key
      }, token);
      if (presign.ok && presign.data?.downloadUrl) {
        try {
          const resp = await fetch(presign.data.downloadUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            await putCachedMediaBlob({
              mediaId: normalized.mediaId || undefined,
              s3Key: normalized.s3Key,
              proyectoId: normalized.proyectoId || '',
              fileName: normalized.fileName || 'archivo',
              mimeType: blob.type || normalized.mimeType,
              originalBytes: blob.size,
              finalBytes: blob.size,
              blob,
              status: 'synced'
            });
            return await getCachedMediaDataUrl(normalized.mediaId || normalized.s3Key);
          }
        } catch {
          // Continuar al fallback
        }
      }
    }
  }

  return normalized.localDataUrl || normalized.dataUrl || '';
}

export async function downloadManagedFileToDevice(ref = {}, suggestedName = 'archivo') {
  const normalized = typeof ref === 'string'
    ? (ref.includes('/') ? { s3Key: ref } : { mediaId: ref })
    : (ref || {});

  const url = await resolveManagedFileUrl(normalized, { download: true, cacheRemote: true });
  if (!url) {
    showToast('El archivo no está disponible en caché local ni en AWS S3.', 'warning');
    return false;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = normalized.fileName || suggestedName || 'archivo';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

export async function deleteManagedFile(ref = {}) {
  const normalized = typeof ref === 'string'
    ? (ref.includes('/') ? { s3Key: ref } : { mediaId: ref })
    : (ref || {});

  const key = normalized.mediaId || normalized.s3Key;
  const cached = key ? await getCachedMediaRecord(key) : null;
  const s3Key = normalized.s3Key || cached?.s3Key || '';
  const archivoId = normalized.archivoId || cached?.archivoId || '';

  if (key) {
    await deleteCachedMediaRecord(key);
  }

  if (s3Key) {
    try {
      const token = await getSupabaseAccessToken();
      if (token) {
        await callPresignEndpoint({ action: 'delete', s3Key }, token);
      }
    } catch (err) {
      console.warn('[s3StorageService] Error eliminando objeto S3:', err?.message || err);
    }

    if (isSupabaseConfigured()) {
      try {
        const sb = await getSupabaseClient();
        if (sb) {
          const query = archivoId
            ? sb.from('archivos_almacen').update({ deleted_at: new Date().toISOString() }).eq('id', archivoId)
            : sb.from('archivos_almacen').update({ deleted_at: new Date().toISOString() }).eq('s3_key', s3Key);
          await query;
        }
      } catch (err) {
        console.warn('[s3StorageService] Error marcando deleted_at en archivos_almacen:', err?.message || err);
      }
    }
  }

  notifyStorageUsageChanged({ deleted: true });
  return true;
}

/**
 * Reintenta subir todos los archivos retenidos en cola local IndexedDB hacia AWS S3.
 */
export async function syncPendingMediaUploads(proyectoId = '') {
  const pending = await listPendingUploads(proyectoId);
  if (!pending.length) {
    return { synced: 0, remaining: 0, processed: 0 };
  }

  let synced = 0;
  for (const item of pending) {
    try {
      const res = await attemptDirectS3Upload({
        blob: item.blob,
        fileName: item.fileName,
        mimeType: item.mimeType,
        modulo: item.modulo,
        categoria: item.categoria || 'project_files',
        proyectoId: item.proyectoId,
        entidadId: item.entidadId,
        ownerEmail: item.ownerEmail,
        originalBytes: item.originalBytes,
        finalBytes: item.finalBytes,
        sha256: item.sha256,
        metadata: item.metadata
      });

      if (res.uploaded) {
        await markMediaUploaded(item.mediaId, {
          s3Key: res.s3Key,
          archivoId: res.archivoId
        });
        synced += 1;
      }
    } catch (err) {
      console.warn('[s3StorageService] Fallo reintento de archivo pendiente:', item.fileName, err?.message);
    }
  }

  if (synced > 0) {
    notifyStorageUsageChanged({ syncedPending: synced });
  }

  return {
    processed: pending.length,
    synced,
    remaining: Math.max(0, pending.length - synced)
  };
}

/**
 * Serializa un libro SheetJS (.xlsx) a Blob y lo respalda en segundo plano en AWS S3 + IndexedDB.
 */
export async function archiveGeneratedWorkbookReport(XLSXLib, workbook, fileName, {
  modulo = 'reportes',
  entidadId = '',
  proyectoId = '',
  metadata = {}
} = {}) {
  try {
    if (!XLSXLib || !workbook) return { ok: false, reason: 'missing_workbook' };
    const buffer = XLSXLib.write(workbook, { bookType: 'xlsx', type: 'array' });
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([buffer], { type: mimeType });
    const file = new File([blob], fileName || 'reporte.xlsx', { type: mimeType });
    return await uploadManagedFile({
      file,
      modulo,
      categoria: 'project_files',
      proyectoId,
      entidadId,
      showFeedback: false,
      metadata
    });
  } catch (err) {
    console.warn('[s3StorageService] Error archivando reporte XLSX en AWS S3:', err?.message || err);
    return { ok: false, reason: err?.message || 'archive_error' };
  }
}
