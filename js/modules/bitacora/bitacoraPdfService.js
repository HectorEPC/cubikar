// js/modules/bitacora/bitacoraPdfService.js
// Motor de generación de PDF foliado inmutable (LOPSRM / BESOP)
// Genera:
//  1) PDF oficial individual por cada nota asentada (con fotos y firma digital)
//  2) Libro Completo de Bitácora Compilado (Carátula, Índice y Notas cronológicas)

import { state } from '../../state/store.js';
import { getBitacoraConfig, getBitacoraWorkSummary, getNoteTypeMeta } from './bitacoraModel.js';
import { buildBitacoraPdfFileName } from './bitacoraDriveService.js';
import {
  resolveManagedFileDataUrl,
  resolveManagedFileUrl,
  uploadManagedFile
} from '../../services/s3StorageService.js';
import { resolveActivePrintBranding, getCubikarLogoPngDataUrl } from '../io/printBrandingService.js';

const JSPDF_CDN_FALLBACK = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

/**
 * Asegurar que jsPDF esté cargado en window.jspdf
 */
export async function ensureJsPdfLoaded() {
  if (typeof window !== 'undefined' && window.jspdf?.jsPDF) {
    return window.jspdf.jsPDF;
  }

  // Cargar dinámicamente si no se cargó al inicio
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jspdf-loader="1"]');
    if (existing) {
      existing.addEventListener('load', resolve);
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = JSPDF_CDN_FALLBACK;
    script.setAttribute('data-jspdf-loader', '1');
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar la librería jsPDF. Verifica tu conexión a internet.'));
    document.head.appendChild(script);
  });

  if (!window.jspdf?.jsPDF) {
    throw new Error('jsPDF no está disponible en el navegador.');
  }
  return window.jspdf.jsPDF;
}

/**
 * Sanitizar texto para fuentes estándar de jsPDF (WinAnsi / Latin-1)
 * Elimina emojis y caracteres fuera de rango manteniendo acentos en español y ñ.
 */
function pdfText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/gu, '')
    .replace(/\uFE0F/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\t/g, '  ')
    .trim();
}

/**
 * Cargar dimensiones reales y formato de imagen DataURL para mantener proporción exacta en PDF
 */
function loadImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof Image === 'undefined') {
      resolve({ width: 800, height: 600, format: 'JPEG' });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const format = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      resolve({
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 600,
        format
      });
    };
    img.onerror = () => {
      resolve({ width: 800, height: 600, format: 'JPEG' });
    };
    img.src = dataUrl;
  });
}

/**
 * Convertir Blob a Data URL base64
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Obtener contexto general de obra para encabezados de PDF
 */
export function getPdfProjectContext() {
  const cfg = getBitacoraConfig();
  const summary = getBitacoraWorkSummary();
  const branding = resolveActivePrintBranding(state?.settings);
  return {
    projectName: pdfText(summary.projectName || state.settings?.projectName || 'Obra Sin Nombre'),
    projectLocation: pdfText(summary.projectLocation || state.settings?.projectLocation || 'Ubicación no especificada'),
    companyName: pdfText(branding.isFree ? branding.companyName : (summary.companyName || branding.companyName)),
    companyLogo: branding.companyLogo || '',
    isFreePlan: Boolean(branding.isFree),
    planId: branding.planId || 'free',
    contratoNumero: pdfText(cfg.contratoNumero || 'N/A'),
    contratistaNombre: pdfText(cfg.contratistaNombre || summary.companyName || 'Contratista'),
    supervisionNombre: pdfText(cfg.supervisionNombre || 'Supervisión Técnica'),
    startDate: summary.startDate || '',
    endDate: summary.endDate || ''
  };
}

async function resolveBrandingPngForPdf(ctx) {
  if (ctx?.isFreePlan) {
    return await getCubikarLogoPngDataUrl(192);
  }
  const logo = String(ctx?.companyLogo || '').trim();
  if (!logo) return null;
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(logo)) {
    return logo;
  }
  if (typeof document !== 'undefined' && typeof Image !== 'undefined') {
    return await new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || 192;
            c.height = img.naturalHeight || 192;
            const g = c.getContext('2d');
            if (!g) return resolve(null);
            g.drawImage(img, 0, 0);
            resolve(c.toDataURL('image/png'));
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = logo;
      } catch {
        resolve(null);
      }
    });
  }
  return null;
}

/**
 * Dibujar una nota individual completa dentro de una instancia jsPDF activa.
 */
async function renderSingleNoteIntoPdfDoc(doc, note, ctx) {
  const pageWidth = doc.internal.pageSize.getWidth();   // 215.9 mm (Letter)
  const pageHeight = doc.internal.pageSize.getHeight(); // 279.4 mm (Letter)
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 18;

  let y = 14;

  const ensureSpace = (neededMm) => {
    if (y + neededMm > bottomLimit) {
      doc.addPage();
      y = 16;
      // Micro encabezado de continuación
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfText(`${ctx.projectName} — BITÁCORA DE OBRA | ${note.folioCode} (Continuación)`), margin, y);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + 2, pageWidth - margin, y + 2);
      y += 7;
    }
  };

  // ========================================================
  // 1. ENCABEZADO INSTITUCIONAL DE LA NOTA
  // ========================================================
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  const logoPng = ctx.resolvedLogoPng !== undefined ? ctx.resolvedLogoPng : await resolveBrandingPngForPdf(ctx);
  let headerTextX = margin + 5;
  if (logoPng) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin + 3.5, y + 3.5, 17, 17, 1.5, 1.5, 'F');
      doc.addImage(logoPng, 'PNG', margin + 4.5, y + 4.5, 15, 15);
      headerTextX = margin + 23.5;
    } catch {}
  }

  // Título izquierdo
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('BITÁCORA DE OBRA DIGITAL', headerTextX, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(pdfText(ctx.companyName).slice(0, 58), headerTextX, y + 13.5);
  doc.text(pdfText(`Obra: ${ctx.projectName}`).slice(0, 62), headerTextX, y + 18.5);

  // Recuadro derecho de Folio Oficial
  const folioBoxW = 46;
  const folioBoxX = pageWidth - margin - folioBoxW - 3;
  doc.setFillColor(30, 64, 175); // Blue 800
  doc.roundedRect(folioBoxX, y + 3, folioBoxW, 18, 1.5, 1.5, 'F');

  doc.setTextColor(191, 219, 254);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('FOLIO OFICIAL', folioBoxX + folioBoxW / 2, y + 7.5, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(pdfText(`NOTA ${note.folioCode || '#001'}`), folioBoxX + folioBoxW / 2, y + 14.5, { align: 'center' });

  doc.setFontSize(6.5);
  doc.setTextColor(167, 243, 208);
  doc.text(note.estado === 'sealed' ? 'ASENTADA E INMUTABLE' : 'BORRADOR NO FIRMADO', folioBoxX + folioBoxW / 2, y + 19, { align: 'center' });

  y += 28;

  // ========================================================
  // 2. BANDA DE TIPO DE NOTA + REFERENCIA FE DE ERRATAS
  // ========================================================
  const typeMeta = getNoteTypeMeta(note.tipo);
  const rgb = typeMeta.pdfColor || [37, 99, 235];

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 24, 1.5, 1.5, 'FD');

  // Franja de color lateral
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(margin, y, 2.5, 24, 'F');

  const col1X = margin + 6;
  const col2X = margin + 72;
  const col3X = margin + 132;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TIPO DE NOTA', col1X, y + 5.5);
  doc.text('FECHA Y HORA', col2X, y + 5.5);
  doc.text('CONDICIÓN CLIMÁTICA', col3X, y + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfText(note.tipo || 'Avance de Obra'), col1X, y + 10.5);
  doc.text(pdfText(`${note.fecha || '---'}  ${note.hora || ''} hrs`), col2X, y + 10.5);
  doc.text(pdfText(note.clima || 'Soleado'), col3X, y + 10.5);

  // Segunda fila dentro del cuadro de metadatos
  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 3, y + 13.5, pageWidth - margin - 3, y + 13.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('UBICACIÓN / FRENTE DE TRABAJO / EJES', col1X, y + 17.5);
  doc.text('CONTRATO / UBICACIÓN GENERAL', col3X, y + 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(pdfText(note.ubicacion || 'Frente general de obra').slice(0, 56), col1X, y + 21.8);
  doc.text(pdfText(`${ctx.contratoNumero !== 'N/A' ? `Cto: ${ctx.contratoNumero} | ` : ''}${ctx.projectLocation}`).slice(0, 34), col3X, y + 21.8);

  y += 28;

  // Aviso de Aclaración / Fe de Erratas si aplica
  if (note.esFeDeErratas && note.notaReferenciaFolio) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(margin, y, contentWidth, 9, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(146, 64, 14);
    doc.text(pdfText(`NOTA DE ACLARACIÓN / FE DE ERRATAS EN REFERENCIA A LA NOTA ${note.notaReferenciaFolio}`), margin + 4, y + 5.8);
    y += 12;
  }

  // ========================================================
  // 3. CONCEPTOS DE PRESUPUESTO VINCULADOS (OPCIONAL)
  // ========================================================
  const conceptos = Array.isArray(note.conceptosVinculados) ? note.conceptosVinculados : [];
  if (conceptos.length > 0) {
    ensureSpace(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138);
    doc.text(`CONCEPTOS DE PRESUPUESTO VINCULADOS (${conceptos.length})`, margin, y + 3);
    y += 5;

    // Cabecera de tabla
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 6.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('CLAVE', margin + 2, y + 4.4);
    doc.text('DESCRIPCIÓN DEL CONCEPTO', margin + 28, y + 4.4);
    doc.text('UNIDAD', pageWidth - margin - 18, y + 4.4);
    y += 6.5;

    for (const c of conceptos) {
      const descLines = doc.splitTextToSize(pdfText(c.descripcion || ''), contentWidth - 52);
      const rowH = Math.max(6, descLines.length * 4 + 2.5);
      ensureSpace(rowH + 2);
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, rowH);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);
      doc.text(pdfText(c.clave || 'S/C').slice(0, 14), margin + 2, y + 4.3);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(descLines, margin + 28, y + 4.3);
      doc.text(pdfText(c.unidad || ''), pageWidth - margin - 18, y + 4.3);
      y += rowH;
    }
    y += 5;
  }

  // ========================================================
  // 4. CUERPO DESCRIPTIVO TÉCNICO DE LA NOTA
  // ========================================================
  ensureSpace(16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('DESCRIPCIÓN TÉCNICA / ASIENTO EN BITÁCORA', margin, y + 3);
  doc.setDrawColor(148, 163, 184);
  doc.line(margin, y + 4.5, pageWidth - margin, y + 4.5);
  y += 8.5;

  const bodyText = pdfText(note.descripcion || 'Sin descripción registrada.');
  const paragraphs = bodyText.split(/\r?\n/);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);

  for (const para of paragraphs) {
    if (!para.trim()) {
      y += 3.5;
      continue;
    }
    const wrapped = doc.splitTextToSize(para, contentWidth - 2);
    for (const line of wrapped) {
      ensureSpace(6);
      doc.text(line, margin + 1, y);
      y += 4.8;
    }
    y += 1.5;
  }
  y += 4;

  // ========================================================
  // 5. GALERÍA DE EVIDENCIAS FOTOGRÁFICAS
  // ========================================================
  const rawEvidencias = Array.isArray(note.evidencias) ? note.evidencias : [];
  const evidencias = [];
  for (const ev of rawEvidencias) {
    const resolvedDataUrl = ev.localDataUrl || (await resolveManagedFileDataUrl(ev));
    if (resolvedDataUrl) {
      evidencias.push({ ...ev, _pdfDataUrl: resolvedDataUrl });
    }
  }
  if (evidencias.length > 0) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`EVIDENCIA FOTOGRÁFICA INTEGRADA (${evidencias.length})`, margin, y + 3);
    doc.setDrawColor(148, 163, 184);
    doc.line(margin, y + 4.5, pageWidth - margin, y + 4.5);
    y += 8;

    const colGap = 6;
    const cardW = (contentWidth - colGap) / 2;
    const maxImgH = 54;

    for (let i = 0; i < evidencias.length; i += 2) {
      const pair = evidencias.slice(i, i + 2);

      // Preparar metadatos de altura antes de dibujar la fila de 2 fotos
      const prepared = [];
      let rowMaxH = 0;

      for (let j = 0; j < pair.length; j++) {
        const ev = pair[j];
        const dims = await loadImageDimensions(ev._pdfDataUrl);
        const ratio = dims.width / Math.max(1, dims.height);
        let imgW = cardW - 6;
        let imgH = imgW / Math.max(0.25, ratio);
        if (imgH > maxImgH) {
          imgH = maxImgH;
          imgW = imgH * ratio;
        }
        const captionStr = pdfText(ev.caption || ev.fileName || `Evidencia fotográfica ${i + j + 1}`);
        const captionLines = doc.splitTextToSize(`Foto ${i + j + 1}: ${captionStr}`, cardW - 6);
        const cardH = maxImgH + 8 + captionLines.length * 3.8;
        rowMaxH = Math.max(rowMaxH, cardH);
        prepared.push({ ev, dims, imgW, imgH, captionLines, cardH });
      }

      ensureSpace(rowMaxH + 4);

      for (let j = 0; j < prepared.length; j++) {
        const item = prepared[j];
        const x = margin + j * (cardW + colGap);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(x, y, cardW, rowMaxH, 1.5, 1.5, 'FD');

        // Centrar imagen dentro del recuadro
        const imgX = x + (cardW - item.imgW) / 2;
        const imgY = y + 3 + (maxImgH - item.imgH) / 2;

        try {
          doc.addImage(item.ev._pdfDataUrl, item.dims.format, imgX, imgY, item.imgW, item.imgH, undefined, 'MEDIUM');
        } catch (imgErr) {
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text('[Imagen no renderizable en PDF]', x + cardW / 2, y + maxImgH / 2, { align: 'center' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        doc.text(item.captionLines, x + 3, y + maxImgH + 6.5);
      }

      y += rowMaxH + 5;
    }
  }

  // ========================================================
  // 6. BLOQUE OFICIAL DE FIRMA DIGITAL Y SELLO LEGAL
  // ========================================================
  ensureSpace(56);
  y += 3;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(100, 116, 139);
  doc.roundedRect(margin, y, contentWidth, 48, 2, 2, 'FD');

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('VALIDACIÓN Y FIRMA ELECTRÓNICA DEL ASIENTO EN BITÁCORA', margin + 4, y + 4.8);

  const firma = note.firma || {};
  const sigBoxX = margin + 6;
  const sigBoxY = y + 10;
  const sigBoxW = 72;
  const sigBoxH = 26;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.rect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 'FD');

  if (firma.firmaDataUrl) {
    try {
      doc.addImage(firma.firmaDataUrl, 'PNG', sigBoxX + 2, sigBoxY + 2, sigBoxW - 4, sigBoxH - 4, undefined, 'FAST');
    } catch (_) {}
  } else {
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Sin firma estampada', sigBoxX + sigBoxW / 2, sigBoxY + sigBoxH / 2, { align: 'center' });
  }

  // Datos del firmante a la derecha del recuadro de firma
  const infoX = sigBoxX + sigBoxW + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(pdfText(firma.autorNombre || note.creadoPor?.name || 'Responsable Técnico'), infoX, sigBoxY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(37, 99, 235);
  doc.text(pdfText(firma.autorCargo || 'Residente de Obra'), infoX, sigBoxY + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(pdfText(`Cédula / Registro Prof.: ${firma.autorCedula || 'N/E'}`), infoX, sigBoxY + 15);
  doc.text(pdfText(`Fecha/Hora de Asentamiento: ${firma.firmadoEn ? new Date(firma.firmadoEn).toLocaleString('es-MX') : '---'}`), infoX, sigBoxY + 20);

  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(pdfText(`Sello de Integridad: ${(firma.selloHash || 'NO-SELLADO').slice(0, 48)}`), infoX, sigBoxY + 25);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Nota inmutable conforme a lineamientos LOPSRM / BESOP. Cualquier aclaración deberá realizarse mediante nota subsecuente de Fe de Erratas.',
    margin + 4,
    y + 44.5
  );
}

/**
 * Estampar pie de página uniforme en todas las páginas del documento jsPDF
 */
function stampFootersOnAllPages(doc, leftLabel, ctx = null) {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const isFree = Boolean(ctx?.isFreePlan);
  const footerText = isFree ? `${leftLabel}  |  cubikar (Plan Gratuita)` : leftLabel;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
    let textX = margin;
    if (isFree && ctx?.resolvedLogoPng) {
      try {
        doc.addImage(ctx.resolvedLogoPng, 'PNG', margin, pageHeight - 11.2, 4.5, 4.5);
        textX = margin + 6;
      } catch {}
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfText(footerText).slice(0, 95), textX, pageHeight - 8);
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }
}

/**
 * Compilar el PDF oficial individual para una nota (retorna Blob, DataURL y fileName).
 */
export async function generateNotePdfArtifact(note) {
  const jsPDF = await ensureJsPdfLoaded();
  const ctx = getPdfProjectContext();
  ctx.resolvedLogoPng = await resolveBrandingPngForPdf(ctx);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  await renderSingleNoteIntoPdfDoc(doc, note, ctx);
  stampFootersOnAllPages(doc, `${ctx.projectName} | Bitácora de Obra Digital — Nota ${note.folioCode}`, ctx);

  const blob = doc.output('blob');
  const dataUrl = await blobToDataUrl(blob);
  const fileName = buildBitacoraPdfFileName(note);

  return {
    blob,
    dataUrl,
    fileName
  };
}

/**
 * Descargar PDF de una nota específica directamente al dispositivo
 */
export async function downloadSingleNotePdf(note) {
  if (!note) return;
  const cachedOrCloudUrl = note.pdfDoc ? await resolveManagedFileUrl(note.pdfDoc, { cacheRemote: true }) : '';
  if (cachedOrCloudUrl) {
    const a = document.createElement('a');
    a.href = cachedOrCloudUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = note.pdfDoc.fileName || buildBitacoraPdfFileName(note);
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const artifact = await generateNotePdfArtifact(note);
  const url = URL.createObjectURL(artifact.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = artifact.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Compilar y descargar el Libro Completo de Bitácora (Carátula + Índice + Todas las notas asentadas).
 */
export async function generateAndDownloadFullBitacoraBook(notesList) {
  const sealedNotes = (notesList || [])
    .filter(n => n.estado === 'sealed')
    .sort((a, b) => (a.folioNumber || 0) - (b.folioNumber || 0));

  if (sealedNotes.length === 0) {
    throw new Error('No hay notas asentadas y firmadas para compilar en el Libro de Bitácora.');
  }

  const jsPDF = await ensureJsPdfLoaded();
  const ctx = getPdfProjectContext();
  ctx.resolvedLogoPng = await resolveBrandingPngForPdf(ctx);
  const summary = getBitacoraWorkSummary();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // ========================================================
  // PÁGINA 1: CARÁTULA OFICIAL DEL LIBRO DE BITÁCORA
  // ========================================================
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 58, 'F');

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 58, pageWidth, 3, 'F');

  if (ctx.resolvedLogoPng) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth - margin - 24, 15, 24, 24, 2, 2, 'F');
      doc.addImage(ctx.resolvedLogoPng, 'PNG', pageWidth - margin - 22.5, 16.5, 21, 21);
    } catch {}
  }

  doc.setTextColor(147, 197, 253);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    ctx.isFreePlan
      ? 'cubikar (PLAN GRATUITA) — DOCUMENTO OFICIAL DE SEGUIMIENTO'
      : 'SISTEMA DE CONTROL DE OBRA — DOCUMENTO OFICIAL DE SEGUIMIENTO',
    margin,
    22
  );

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('LIBRO DE BITÁCORA DE OBRA', margin, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(226, 232, 240);
  doc.text('Registro Técnico, Legal y Cronológico de Ejecución de Obra (LOPSRM / BESOP)', margin, 45);

  let y = 78;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 95, 2.5, 2.5, 'FD');

  const metaRows = [
    ['OBRA / PROYECTO:', ctx.projectName],
    ['UBICACIÓN DE LA OBRA:', ctx.projectLocation],
    ['EMPRESA / ENTIDAD:', ctx.companyName],
    ['NÚMERO DE CONTRATO:', ctx.contratoNumero],
    ['CONTRATISTA:', ctx.contratistaNombre],
    ['SUPERVISIÓN TÉCNICA:', ctx.supervisionNombre],
    ['FECHA INICIO / TÉRMINO:', `${ctx.startDate || 'N/E'}  al  ${ctx.endDate || 'Programación abierta'}`],
    ['DÍAS TRANSCURRIDOS:', `${summary.elapsedDays} días${summary.totalProgrammedDays ? ` de ${summary.totalProgrammedDays} programados` : ''}`],
    ['TOTAL DE NOTAS ASENTADAS:', `${sealedNotes.length} notas oficiales (${sealedNotes[0].folioCode} al ${sealedNotes[sealedNotes.length - 1].folioCode})`],
    ['FECHA DE COMPILACIÓN:', new Date().toLocaleString('es-MX')]
  ];

  let ry = y + 10;
  metaRows.forEach(([label, val], idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(pdfText(label), margin + 6, ry);

    doc.setFont('helvetica', idx === 0 ? 'bold' : 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(pdfText(val).slice(0, 62), margin + 64, ry);

    if (idx < metaRows.length - 1) {
      doc.setDrawColor(226, 232, 240);
      doc.line(margin + 6, ry + 3, pageWidth - margin - 6, ry + 3);
    }
    ry += 8.6;
  });

  y += 110;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(147, 197, 253);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  doc.text('CERTIFICACIÓN DE INTEGRIDAD DOCUMENTAL', margin + 6, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  const certLines = doc.splitTextToSize(
    'Este Libro Compilado reúne exclusivamente las notas que han sido formalmente asentadas y firmadas electrónicamente en la Bitácora de Obra Digital. Cada asiento conserva su folio correlativo, fecha y hora exacta, evidencia fotográfica y firma digital inmutable.',
    contentWidth - 12
  );
  doc.text(certLines, margin + 6, y + 15);

  // ========================================================
  // PÁGINA 2: ÍNDICE CRONOLÓGICO FOLIADO
  // ========================================================
  doc.addPage();
  let iy = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('ÍNDICE CRONOLÓGICO DE NOTAS ASENTADAS', margin, iy);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.6);
  doc.line(margin, iy + 3, pageWidth - margin, iy + 3);
  doc.setLineWidth(0.2);
  iy += 10;

  const drawIndexHeader = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, iy, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('FOLIO', margin + 2, iy + 4.8);
    doc.text('FECHA / HORA', margin + 18, iy + 4.8);
    doc.text('TIPO DE NOTA', margin + 48, iy + 4.8);
    doc.text('FRENTE / UBICACIÓN', margin + 96, iy + 4.8);
    doc.text('FIRMANTE', margin + 144, iy + 4.8);
    iy += 7;
  };

  drawIndexHeader();

  for (const n of sealedNotes) {
    if (iy + 9 > pageHeight - 20) {
      doc.addPage();
      iy = 18;
      drawIndexHeader();
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, iy, contentWidth, 7.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 64, 175);
    doc.text(pdfText(n.folioCode), margin + 2, iy + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(pdfText(`${n.fecha} ${n.hora || ''}`), margin + 18, iy + 5);
    doc.text(pdfText(n.tipo).slice(0, 24), margin + 48, iy + 5);
    doc.text(pdfText(n.ubicacion || 'General').slice(0, 24), margin + 96, iy + 5);
    doc.text(pdfText(n.firma?.autorNombre || '---').slice(0, 22), margin + 144, iy + 5);
    iy += 7.5;
  }

  // ========================================================
  // PÁGINAS SIGUIENTES: CADA NOTA ASENTADA EN ORDEN FOLIADO
  // ========================================================
  for (const n of sealedNotes) {
    doc.addPage();
    await renderSingleNoteIntoPdfDoc(doc, n, ctx);
  }

  stampFootersOnAllPages(doc, `Libro Oficial de Bitácora — ${ctx.projectName}`, ctx);

  const cleanProject = String(ctx.projectName || 'Obra')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const dateTag = new Date().toISOString().slice(0, 10);
  const fileName = `Libro_Completo_Bitacora_${cleanProject}_${dateTag}.pdf`;

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  // Archivar libro compilado en AWS S3 bajo reportes del proyecto
  try {
    const pdfFile = new File([blob], fileName, { type: 'application/pdf' });
    uploadManagedFile({
      file: pdfFile,
      modulo: 'reportes',
      categoria: 'project_files',
      showFeedback: false,
      metadata: {
        submodulo: 'libro_bitacora',
        notesCount: sealedNotes.length
      }
    }).catch(() => {});
  } catch {}

  return { blob, fileName, notesCount: sealedNotes.length };
}
