// js/modules/compras/xmlCfdiParser.js
// Lector y extractor nativo en navegador para facturas XML CFDI (SAT 3.3 / 4.0)

function round2(n) {
  return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
}

function getAttr(el, names = []) {
  if (!el) return '';
  for (const name of names) {
    if (typeof el.getAttribute === 'function') {
      const val = el.getAttribute(name);
      if (val !== null && val !== undefined && val !== '') return val;
    } else if (el.attrs && el.attrs[name] !== undefined && el.attrs[name] !== '') {
      return el.attrs[name];
    }
  }
  return '';
}

function parseAttributesFallback(attrStr) {
  const attrs = {};
  if (!attrStr) return attrs;
  const re = /([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
  return attrs;
}

function parseTagFallback(xmlText, localTagName) {
  const results = [];
  const re = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${localTagName}\\b([^>]*?)/?>`, 'gi');
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    results.push({ attrs: parseAttributesFallback(m[1]) });
  }
  return results;
}

function findElements(doc, xmlText, localName) {
  if (doc && typeof doc.getElementsByTagNameNS === 'function') {
    const nsMatches = doc.getElementsByTagNameNS('*', localName);
    if (nsMatches && nsMatches.length > 0) return Array.from(nsMatches);
    const plainMatches = doc.getElementsByTagName(localName);
    if (plainMatches && plainMatches.length > 0) return Array.from(plainMatches);
    const prefixed = doc.getElementsByTagName(`cfdi:${localName}`);
    if (prefixed && prefixed.length > 0) return Array.from(prefixed);
  }
  return parseTagFallback(xmlText, localName);
}

/**
 * Extrae datos fiscales y partidas de una cadena XML CFDI (SAT 3.3 / 4.0)
 * Funciona con DOMParser en navegador y con parser ligero de respaldo en entornos Node/test.
 */
export function parseMexicanCfdiXml(xmlText) {
  const raw = String(xmlText || '').trim();
  if (!raw || (!raw.includes('<') && !raw.includes('Comprobante'))) {
    throw new Error('El archivo no contiene un XML CFDI válido.');
  }

  let doc = null;
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const parsed = parser.parseFromString(raw, 'application/xml');
      if (parsed && !parsed.getElementsByTagName('parsererror')?.length) {
        doc = parsed;
      }
    } catch (_) {
      doc = null;
    }
  }

  const comprobante = findElements(doc, raw, 'Comprobante')[0];
  if (!comprobante) {
    throw new Error('No se encontró el nodo Comprobante en el XML.');
  }

  const emisor = findElements(doc, raw, 'Emisor')[0];
  const timbre = findElements(doc, raw, 'TimbreFiscalDigital')[0];
  const conceptosNodes = findElements(doc, raw, 'Concepto');

  const serie = getAttr(comprobante, ['Serie', 'serie']);
  const folio = getAttr(comprobante, ['Folio', 'folio']);
  const fechaRaw = getAttr(comprobante, ['Fecha', 'fecha']);
  const fecha = fechaRaw ? fechaRaw.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const subtotal = round2(getAttr(comprobante, ['SubTotal', 'subTotal', 'Subtotal']) || 0);
  const descuento = round2(getAttr(comprobante, ['Descuento', 'descuento']) || 0);
  const total = round2(getAttr(comprobante, ['Total', 'total']) || 0);
  const moneda = getAttr(comprobante, ['Moneda', 'moneda']) || 'MXN';
  const formaPagoSat = getAttr(comprobante, ['FormaPago', 'formaPago']);
  const metodoPagoSat = getAttr(comprobante, ['MetodoPago', 'metodoPago']);

  const uuid = getAttr(timbre, ['UUID', 'uuid']);
  const rfcEmisor = getAttr(emisor, ['Rfc', 'rfc', 'RFC']).toUpperCase();
  const nombreEmisor = getAttr(emisor, ['Nombre', 'nombre']) || rfcEmisor;

  // Calcular IVA trasladado explícito o por diferencia
  let tax = 0;
  const impuestosNodes = findElements(doc, raw, 'Impuestos');
  for (const impEl of impuestosNodes) {
    const totImp = getAttr(impEl, ['TotalImpuestosTrasladados', 'totalImpuestosTrasladados']);
    if (totImp !== '') {
      tax = round2(totImp);
    }
  }
  if (tax === 0 && total > 0 && subtotal > 0 && total > (subtotal - descuento)) {
    tax = round2(total - (subtotal - descuento));
  }

  const conceptos = conceptosNodes.map((cEl, idx) => {
    const cantidad = Number(getAttr(cEl, ['Cantidad', 'cantidad'])) || 1;
    const valorUnitario = round2(getAttr(cEl, ['ValorUnitario', 'valorUnitario']) || 0);
    const importe = round2(getAttr(cEl, ['Importe', 'importe']) || (cantidad * valorUnitario));
    const claveProdServ = getAttr(cEl, ['ClaveProdServ', 'claveProdServ']);
    const noIdentificacion = getAttr(cEl, ['NoIdentificacion', 'noIdentificacion']);
    const unidad = getAttr(cEl, ['Unidad', 'unidad']) || getAttr(cEl, ['ClaveUnidad', 'claveUnidad']) || 'pza';
    const descripcion = getAttr(cEl, ['Descripcion', 'descripcion']) || `Concepto XML #${idx + 1}`;

    return {
      index: idx + 1,
      claveProdServ,
      noIdentificacion,
      cantidad,
      unidad,
      descripcion,
      valorUnitario,
      importe
    };
  });

  // Mapeo práctico a método de pago del módulo
  let paymentMethod = 'transfer';
  if (formaPagoSat === '01') paymentMethod = 'cash';
  else if (formaPagoSat === '04' || formaPagoSat === '28') paymentMethod = 'card';
  else if (formaPagoSat === '02') paymentMethod = 'check';

  const paymentStatus = metodoPagoSat === 'PPD' ? 'pending' : 'paid';
  const invoiceNumber = [serie, folio].filter(Boolean).join('-') || (uuid ? uuid.slice(0, 8).toUpperCase() : '');

  return {
    uuid,
    serie,
    folio,
    invoiceNumber,
    fecha,
    rfcEmisor,
    nombreEmisor,
    moneda,
    subtotal: round2(subtotal - descuento),
    descuento,
    tax,
    total,
    formaPagoSat,
    metodoPagoSat,
    paymentMethod,
    paymentStatus,
    conceptos
  };
}
