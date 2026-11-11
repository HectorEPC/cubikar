// js/modules/compras/driveExpenseService.js
// Servicio de Almacenamiento Unificado (AWS S3 + Caché IndexedDB + Cuotas) para Comprobantes de Compras y Gastos.
// Reemplaza por completo la antigua integración con Google Drive.

import { showToast } from '../../ui/notifications.js';
import {
  deleteManagedFile,
  resolveManagedFileUrl,
  uploadManagedFile
} from '../../services/s3StorageService.js';

/**
 * Procesa, comprime (imágenes <canvas> 1280px @ 75%) o conserva intactos (PDF/XML),
 * valida la cuota del Anfitrión y almacena el comprobante en IndexedDB + AWS S3.
 */
export async function processExpenseEvidenceUpload(file, projectName = 'Obra_General', recordId = '') {
  if (!file) throw new Error('Archivo no válido.');

  const result = await uploadManagedFile({
    file,
    modulo: 'compras',
    categoria: 'project_files',
    entidadId: String(recordId || ''),
    preset: 'photo',
    showFeedback: true,
    includeDataUrl: false,
    metadata: {
      projectName: String(projectName || '')
    }
  });

  if (!result.ok) {
    throw new Error(result.reason || 'No se pudo cargar el comprobante.');
  }

  return {
    mediaId: result.mediaId || '',
    archivoId: result.archivoId || '',
    s3Key: result.s3Key || '',
    bucket: result.bucket || '',
    fileName: result.fileName,
    mimeType: result.mimeType,
    extension: result.extension,
    originalBytes: result.originalBytes,
    finalBytes: result.finalBytes,
    fileSize: result.finalBytes,
    compressed: Boolean(result.compressed),
    savedBytes: result.savedBytes || 0,
    reductionPct: result.reductionPct || 0,
    summaryText: result.summaryText || '',
    sizeLabel: result.sizeLabel || '',
    cloudSynced: Boolean(result.cloudSynced),
    pendingSync: Boolean(result.pendingSync),
    uploadedAt: new Date().toISOString()
  };
}

/**
 * Abre o visualiza el comprobante desde IndexedDB local o mediante URL prefirmada GET de AWS S3.
 */
export async function openExpenseEvidence(evidence) {
  if (!evidence) {
    showToast('No hay comprobante adjunto en este registro.', 'info');
    return;
  }

  const resolvedUrl = await resolveManagedFileUrl(evidence, { cacheRemote: true });
  if (!resolvedUrl) {
    showToast('Comprobante no disponible offline ni en la nube AWS S3.', 'warning');
    return;
  }

  const mime = String(evidence.mimeType || '').toLowerCase();
  const isImage = mime.startsWith('image/') || resolvedUrl.startsWith('data:image/');
  const isPdf = mime.includes('pdf') || String(evidence.extension || '').toLowerCase() === 'pdf';

  if (isImage) {
    const html = `
      <html>
        <head><title>${evidence.fileName || 'Comprobante'}</title></head>
        <body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;">
          <img src="${resolvedUrl}" style="max-width:96vw;max-height:94vh;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.6);" />
        </body>
      </html>
    `;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      return;
    }
  }

  if (isPdf) {
    const win = window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    if (win) return;
  }

  const link = document.createElement('a');
  link.href = resolvedUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.download = evidence.fileName || 'comprobante';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Elimina un comprobante de IndexedDB, AWS S3 y Supabase archivos_almacen.
 */
export async function deleteExpenseEvidence(evidence) {
  if (!evidence) return false;
  return deleteManagedFile(evidence);
}
