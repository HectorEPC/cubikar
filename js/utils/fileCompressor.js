/**
 * Utilidad compartida de compresión automática de imágenes en cliente (<canvas>)
 * y manejo binario intacto para documentos (.pdf, .xml, .xlsx, .json, etc.).
 */

export const PHOTO_PRESET = {
  maxDimension: 1280,
  quality: 0.75,
  targetMaxBytes: 350 * 1024,
  outputMime: 'image/jpeg'
};

export const AVATAR_PRESET = {
  maxDimension: 512,
  quality: 0.75,
  targetMaxBytes: 150 * 1024,
  outputMime: 'image/webp'
};

export const BRANDING_LOGO_PRESET = {
  maxDimension: 800,
  quality: 0.75,
  targetMaxBytes: 220 * 1024,
  outputMime: 'image/webp'
};

const PROTECTED_EXTENSIONS = new Set(['pdf', 'xml', 'xlsx', 'xls', 'csv', 'json', 'gz']);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp']);

/**
 * Formatea un tamaño en bytes de manera legible (B, KB, MB, GB).
 */
export function formatBytes(bytes, decimals = 1) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value === 0) return '0 KB';
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(decimals)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function getFileExtension(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : (fileOrName?.name || '');
  const parts = String(name).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop().trim() : '';
}

export function isProtectedDocumentFile(file) {
  const ext = getFileExtension(file);
  const mime = String(file?.type || '').toLowerCase();
  if (PROTECTED_EXTENSIONS.has(ext)) return true;
  if (mime === 'application/pdf' || mime.includes('xml')) return true;
  return false;
}

export function isCompressibleImageFile(file) {
  if (!file || isProtectedDocumentFile(file)) return false;
  const mime = String(file.type || '').toLowerCase();
  const ext = getFileExtension(file);
  if (mime.startsWith('image/') && !mime.includes('svg')) return true;
  return IMAGE_EXTENSIONS.has(ext);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo en navegador.'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl) {
  const str = String(dataUrl || '');
  const [header, base64] = str.split(',');
  if (!base64) return new Blob([], { type: 'application/octet-stream' });
  const mimeMatch = /data:([^;]+);/i.exec(header || '');
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export function dataUrlToFile(dataUrl, fileName = 'archivo.jpg') {
  const blob = dataUrlToBlob(dataUrl);
  return new File([blob], fileName, { type: blob.type || 'application/octet-stream', lastModified: Date.now() });
}

export async function computeSha256Hex(blobOrBuffer) {
  try {
    if (!globalThis.crypto?.subtle) return '';
    const buf = blobOrBuffer instanceof ArrayBuffer
      ? blobOrBuffer
      : await blobOrBuffer.arrayBuffer();
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buf);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

function loadImageElementFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`No se pudo decodificar la imagen "${file.name || 'foto'}".`));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function replaceFileExtension(fileName, mimeType) {
  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const base = String(fileName || 'imagen').replace(/\.[^.]+$/, '');
  return `${base}.${ext}`;
}

/**
 * Comprime y redimensiona una imagen usando HTML5 <canvas>.
 * Reglas: máx 1280px lado más largo, JPEG/WebP calidad 0.75, objetivo <= 350 KB.
 */
export async function compressImageFile(file, options = {}) {
  const preset = options.preset === 'avatar'
    ? AVATAR_PRESET
    : (options.preset === 'branding' ? BRANDING_LOGO_PRESET : PHOTO_PRESET);

  const maxDimension = Number(options.maxDimension || preset.maxDimension);
  const initialQuality = Number(options.quality || preset.quality);
  const targetMaxBytes = Number(options.targetMaxBytes || preset.targetMaxBytes);
  const preferredMime = options.mimeType || preset.outputMime;
  const originalBytes = Number(file.size || 0);

  const img = await loadImageElementFromFile(file);
  const srcWidth = img.naturalWidth || img.width || 1;
  const srcHeight = img.naturalHeight || img.height || 1;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D no disponible para compresión de imagen.');
  }

  let currentMaxDim = maxDimension;
  let currentQuality = initialQuality;
  let bestBlob = null;
  let finalWidth = srcWidth;
  let finalHeight = srcHeight;
  let outMime = preferredMime;

  const renderAttempt = async (dimLimit, quality, mime) => {
    const scale = Math.min(1, dimLimit / Math.max(srcWidth, srcHeight));
    const targetW = Math.max(1, Math.round(srcWidth * scale));
    const targetH = Math.max(1, Math.round(srcHeight * scale));
    canvas.width = targetW;
    canvas.height = targetH;

    ctx.clearRect(0, 0, targetW, targetH);
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let encoded = await canvasToBlob(canvas, mime, quality);
    // Fallback a JPEG si el navegador no soporta codificación WebP en toBlob
    if (!encoded || (mime === 'image/webp' && encoded.type !== 'image/webp')) {
      outMime = 'image/jpeg';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);
      encoded = await canvasToBlob(canvas, 'image/jpeg', quality);
    }
    finalWidth = targetW;
    finalHeight = targetH;
    return encoded;
  };

  bestBlob = await renderAttempt(currentMaxDim, currentQuality, outMime);

  // Refinamiento ligero si supera el objetivo (ej. 350 KB en fotos de alta textura)
  const passes = [
    { dim: currentMaxDim, q: 0.66 },
    { dim: Math.min(currentMaxDim, 1024), q: 0.60 },
    { dim: Math.min(currentMaxDim, 960), q: 0.54 }
  ];

  for (const pass of passes) {
    if (!bestBlob || bestBlob.size <= targetMaxBytes) break;
    const nextBlob = await renderAttempt(pass.dim, pass.q, outMime);
    if (nextBlob && nextBlob.size < bestBlob.size) {
      bestBlob = nextBlob;
    }
  }

  // Si por algún caso extremo un archivo tiny ya pesaba menos que el resultado y no cambió escala, conservar el menor
  const finalBlob = (bestBlob && (bestBlob.size < originalBytes || Math.max(srcWidth, srcHeight) > maxDimension))
    ? bestBlob
    : new Blob([await file.arrayBuffer()], { type: file.type || outMime });

  const finalMime = finalBlob.type || outMime;
  const finalName = finalMime === file.type
    ? (file.name || 'imagen.jpg')
    : replaceFileExtension(file.name, finalMime);

  const outputFile = new File([finalBlob], finalName, {
    type: finalMime,
    lastModified: Date.now()
  });

  const dataUrl = options.includeDataUrl === false ? '' : await blobToDataUrl(finalBlob);
  const finalBytes = outputFile.size;
  const savedBytes = Math.max(0, originalBytes - finalBytes);
  const reductionPct = originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0;

  return {
    file: outputFile,
    blob: finalBlob,
    dataUrl,
    fileName: finalName,
    mimeType: finalMime,
    extension: getFileExtension(finalName),
    width: finalWidth,
    height: finalHeight,
    originalBytes,
    finalBytes,
    compressed: true,
    savedBytes,
    reductionPct,
    summaryText: `de ${formatBytes(originalBytes)} ➔ ${formatBytes(finalBytes)}`
  };
}

/**
 * Punto único de entrada antes de validar cuota o subir a S3:
 * - Imágenes: comprime en <canvas> a max 1280px y 75%.
 * - PDF / XML / otros documentos: mantiene el contenido binario intacto.
 */
export async function processFileForUpload(file, options = {}) {
  if (!file) {
    throw new Error('No se recibió ningún archivo para procesar.');
  }

  if (isCompressibleImageFile(file)) {
    return compressImageFile(file, options);
  }

  const originalBytes = Number(file.size || 0);
  const mimeType = file.type || (getFileExtension(file) === 'pdf'
    ? 'application/pdf'
    : (getFileExtension(file) === 'xml' ? 'application/xml' : 'application/octet-stream'));

  return {
    file,
    blob: file,
    dataUrl: '',
    fileName: file.name || 'documento',
    mimeType,
    extension: getFileExtension(file),
    width: null,
    height: null,
    originalBytes,
    finalBytes: originalBytes,
    compressed: false,
    savedBytes: 0,
    reductionPct: 0,
    summaryText: formatBytes(originalBytes)
  };
}
