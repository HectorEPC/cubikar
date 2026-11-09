/**
 * textSanitizer.js
 * Limpieza profunda y restauración de caracteres en español (acentos, ñ, signos).
 * Convierte secuencias mojibake (UTF-8 malinterpretado como Windows-1252/ISO-8859-1)
 * a texto perfectamente legible en español.
 */

export function cleanMojibake(str) {
  if (typeof str !== 'string' || !str) return str;
  if (!/[\u00C2\u00C3\u00E2]/.test(str)) return str;

  return str
    .replace(/\u00C3\u00A1/g, 'á').replace(/\u00C3\u0081/g, 'Á')
    .replace(/\u00C3\u00A9/g, 'é').replace(/\u00C3\u0089/g, 'É')
    .replace(/\u00C3\u00AD/g, 'í').replace(/\u00C3\u008D/g, 'Í')
    .replace(/\u00C3\u00B3/g, 'ó').replace(/\u00C3\u0093/g, 'Ó')
    .replace(/\u00C3\u00BA/g, 'ú').replace(/\u00C3\u009A/g, 'Ú')
    .replace(/\u00C3\u00B1/g, 'ñ').replace(/\u00C3\u0091/g, 'Ñ')
    .replace(/\u00C3\u00BC/g, 'ü').replace(/\u00C3\u009C/g, 'Ü')
    .replace(/\u00C2\u00B0/g, '°')
    .replace(/\u00C2\u00BF/g, '¿')
    .replace(/\u00C2\u00A1/g, '¡')
    .replace(/\u00E2\u0080\u0093/g, '–')
    .replace(/\u00E2\u0080\u0094/g, '—')
    .replace(/\u00E2\u0080\u009C/g, '“')
    .replace(/\u00E2\u0080\u009D/g, '”')
    .replace(/\u00E2\u0080\u0098/g, '‘')
    .replace(/\u00E2\u0080\u0099/g, '’');
}

export function sanitizeCatalogNodes(nodes) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach(n => {
    if (n.descripcion) n.descripcion = cleanMojibake(n.descripcion);
    if (n.unidad) n.unidad = cleanMojibake(n.unidad);
    if (n.clave) n.clave = cleanMojibake(n.clave);
    if (Array.isArray(n.insumos)) {
      n.insumos.forEach(ins => {
        if (ins.descripcion) ins.descripcion = cleanMojibake(ins.descripcion);
        if (ins.unidad) ins.unidad = cleanMojibake(ins.unidad);
        if (ins.clave) ins.clave = cleanMojibake(ins.clave);
        if (ins.tipo) ins.tipo = cleanMojibake(ins.tipo);
      });
    }
    if (Array.isArray(n.children)) {
      sanitizeCatalogNodes(n.children);
    }
  });
}

/**
 * Lee un archivo (File o Blob) detectando si está en UTF-8 o en Windows-1252/ANSI.
 * Esto es crítico para archivos CSV o TXT exportados directamente por Opus o Neodata en Windows.
 */
export async function readBlobAsTextSmart(file) {
  const buffer = await file.arrayBuffer();
  // Intentar decodificar como UTF-8 estricto
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(buffer);
    return cleanMojibake(text);
  } catch (e) {
    // Si falla UTF-8, decodificar con Windows-1252 (ANSI latinoamericano estándar de Opus/Neodata)
    try {
      const ansiDecoder = new TextDecoder('windows-1252');
      const text = ansiDecoder.decode(buffer);
      return cleanMojibake(text);
    } catch (err) {
      const fallbackDecoder = new TextDecoder();
      return cleanMojibake(fallbackDecoder.decode(buffer));
    }
  }
}
