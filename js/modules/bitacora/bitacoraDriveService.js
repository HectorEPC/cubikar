// js/modules/bitacora/bitacoraDriveService.js
// Servicio de Almacenamiento Unificado (AWS S3 + IndexedDB + Cuotas) para Bitácora de Obra.
// Reemplaza por completo la antigua integración con Google Drive manteniendo propiedad única del Anfitrión.

import { state } from '../../state/store.js';
import { getActiveProjectId } from '../../config/constants.js';
import { getCurrentUser, getProjectById } from '../portal/projectService.js';
import { showToast } from '../../ui/notifications.js';
import {
  downloadManagedFileToDevice,
  resolveManagedFileDataUrl,
  resolveManagedFileUrl,
  syncPendingMediaUploads,
  uploadManagedFile
} from '../../services/s3StorageService.js';
import {
  getHostStorageSummary,
  resolveHostStorageContext
} from '../../services/storageQuotaService.js';
import {
  attachCloudArtifactsToSealedNote,
  getBitacoraNotes
} from './bitacoraModel.js';

/**
 * Determina el propietario/anfitrión real del proyecto y si el usuario actual es ese anfitrión.
 */
export function getHostOwnershipStatus() {
  const user = getCurrentUser();
  const project = getProjectById(getActiveProjectId());
  const ctx = resolveHostStorageContext();

  const currentEmail = (user?.email || '').toLowerCase().trim();
  const hostEmail = ctx.ownerEmail || currentEmail;
  const isHost = !ctx.isCollaborator;

  return {
    currentEmail,
    hostEmail,
    hostName: project?.ownerName || user?.name || 'Usuario Anfitrión',
    isHost,
    projectName: state.settings?.projectName || project?.projectName || project?.name || 'Obra_Sin_Nombre',
    projectId: ctx.projectId
  };
}

/**
 * Genera el nombre reglamentario para el PDF oficial de una nota sellada.
 */
export function buildBitacoraPdfFileName(note) {
  const hostStatus = getHostOwnershipStatus();
  const projectSlug = String(hostStatus.projectName || 'Obra')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Obra';
  const folio = (note?.folioCode || 'FOLIO').replace('#', 'Folio_');
  const tipo = String(note?.tipo || 'Nota')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_');
  const fecha = (note?.fecha || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, '');
  return `${projectSlug}_${folio}_${tipo}_${fecha}.pdf`;
}

/**
 * Procesa, comprime (<canvas> 1280px @ 75%), valida cuota y respalda una fotografía en IndexedDB + AWS S3.
 */
export async function uploadBitacoraEvidenceFile(file, noteId = '') {
  const res = await uploadManagedFile({
    file,
    modulo: 'bitacora',
    categoria: 'project_files',
    entidadId: String(noteId || ''),
    preset: 'photo',
    showFeedback: true,
    includeDataUrl: false
  });

  if (!res.ok) {
    throw new Error(res.reason || 'No se pudo cargar la fotografía.');
  }

  const user = getCurrentUser();
  return {
    id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mediaId: res.mediaId || '',
    archivoId: res.archivoId || '',
    s3Key: res.s3Key || '',
    bucket: res.bucket || '',
    fileName: res.fileName,
    mimeType: res.mimeType,
    extension: res.extension,
    originalBytes: res.originalBytes,
    finalBytes: res.finalBytes,
    compressed: Boolean(res.compressed),
    savedBytes: res.savedBytes || 0,
    reductionPct: res.reductionPct || 0,
    summaryText: res.summaryText || '',
    sizeLabel: res.sizeLabel || '',
    caption: '',
    cloudSynced: Boolean(res.cloudSynced),
    pendingSync: Boolean(res.pendingSync),
    uploadedBy: user?.email || '',
    uploadedAt: new Date().toISOString()
  };
}

/**
 * Sube el PDF oficial firmado de una nota a AWS S3 (módulo bitacora/reportes, sin compresión).
 */
export async function uploadBitacoraOfficialPdf(pdfBlob, fileName, note = null) {
  if (!pdfBlob) {
    return { uploaded: false, pendingSync: true };
  }

  try {
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
    const res = await uploadManagedFile({
      file,
      modulo: 'reportes',
      categoria: 'project_files',
      entidadId: String(note?.id || ''),
      showFeedback: false,
      metadata: {
        submodulo: 'bitacora',
        folioCode: note?.folioCode || '',
        fecha: note?.fecha || ''
      }
    });

    if (!res.ok) {
      return { uploaded: false, pendingSync: true, reason: res.reason };
    }

    return {
      uploaded: Boolean(res.cloudSynced),
      pendingSync: !res.cloudSynced,
      mediaId: res.mediaId || '',
      archivoId: res.archivoId || '',
      s3Key: res.s3Key || '',
      fileName: res.fileName,
      sizeBytes: res.finalBytes || 0
    };
  } catch (err) {
    console.warn('[BitacoraStorage] PDF retenido en caché local:', err?.message);
    return { uploaded: false, pendingSync: true };
  }
}

export async function openBitacoraPdfArtifact(pdfDoc, fallbackNote = null) {
  if (!pdfDoc && !fallbackNote) return false;
  const resolved = pdfDoc ? await resolveManagedFileUrl(pdfDoc, { cacheRemote: true }) : '';
  if (resolved) {
    const win = window.open(resolved, '_blank', 'noopener,noreferrer');
    if (win) return true;
    await downloadManagedFileToDevice(pdfDoc, pdfDoc.fileName || buildBitacoraPdfFileName(fallbackNote));
    return true;
  }
  return false;
}

export async function resolveBitacoraPhotoUrl(ev) {
  return resolveManagedFileUrl(ev, { cacheRemote: true });
}

export async function resolveBitacoraPhotoDataUrl(ev) {
  return resolveManagedFileDataUrl(ev);
}

/**
 * Sincroniza hacia AWS S3 todas las fotografías y PDFs oficiales en cola offline.
 */
export async function syncPendingBitacoraArtifactsToCloud({ generatePdfFn = null, silent = false } = {}) {
  const projectId = getActiveProjectId();
  const queueRes = await syncPendingMediaUploads(projectId);
  let syncedCount = queueRes?.synced || 0;

  const sealed = getBitacoraNotes().filter((n) => n.estado === 'sealed');
  for (const note of sealed) {
    const needsPdfUpload = !note.pdfDoc?.s3Key;
    if (!needsPdfUpload || typeof generatePdfFn !== 'function') continue;

    try {
      const pdfArtifact = await generatePdfFn(note);
      const pdfRes = await uploadBitacoraOfficialPdf(pdfArtifact.blob, pdfArtifact.fileName, note);
      if (pdfRes.uploaded) {
        attachCloudArtifactsToSealedNote(note.id, {
          pdfDocPatch: {
            mediaId: pdfRes.mediaId,
            archivoId: pdfRes.archivoId,
            s3Key: pdfRes.s3Key,
            fileName: pdfRes.fileName,
            cloudSynced: true,
            pendingSync: false
          }
        });
        syncedCount += 1;
      }
    } catch (err) {
      console.warn('[BitacoraStorage] Error sincronizando PDF pendiente:', note.folioCode, err?.message);
    }
  }

  if (!silent) {
    if (syncedCount > 0) {
      showToast(`☁️ Sincronizados ${syncedCount} artefacto(s) de Bitácora en AWS S3.`, 'success');
    } else {
      showToast('No hay archivos pendientes por sincronizar o AWS S3 aún no está disponible.', 'info');
    }
  }

  return { syncedCount };
}

/**
 * Resumen de almacenamiento S3 y titularidad para la UI de Bitácora.
 */
export function getStorageConnectionSummary() {
  const hostStatus = getHostOwnershipStatus();
  const hostCtx = resolveHostStorageContext();
  return {
    isHost: hostStatus.isHost,
    hostEmail: hostStatus.hostEmail,
    hostName: hostStatus.hostName,
    projectName: hostStatus.projectName,
    planLabel: hostCtx.spec.label,
    maxFileMb: hostCtx.spec.maxFileMb
  };
}

export async function getBitacoraQuotaSummary() {
  return getHostStorageSummary();
}
