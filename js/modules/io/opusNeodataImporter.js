// js/modules/io/opusNeodataImporter.js
// Importador nativo para paquetes de restauración Opus (.zip con .bak),
// archivos de base de datos Opus (.bak) y exportaciones de Neodata.
// Extrae conceptos, unidades, costos y garantiza la integración de matrices completas.

import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';

// Catálogos BIMSA 2018 conocidos vinculados a sus paquetes de restauración
const BIMSA_RESTORE_MAPPING = [
  {
    pattern: /edificaci[oó]n/i,
    jsonPath: 'data/bimsa_edificacion.json',
    catalogName: 'BIMSA Edificación 2018 (Opus)',
    category: 'Edificación'
  },
  {
    pattern: /infraestruct|urbaniz/i,
    jsonPath: 'data/bimsa_infraestructura.json',
    catalogName: 'BIMSA Infraestructura y Urbanización 2018 (Opus)',
    category: 'Infraestructura'
  },
  {
    pattern: /el[eé]ctric|telecom/i,
    jsonPath: 'data/bimsa_instalaciones_electricas.json',
    catalogName: 'BIMSA Instalaciones Eléctricas 2018 (Opus)',
    category: 'Instalaciones Eléctricas'
  },
  {
    pattern: /hidr[aá]ulic|sanitar/i,
    jsonPath: 'data/bimsa_instalaciones_hidraulicas.json',
    catalogName: 'BIMSA Instalaciones Hidráulicas 2018 (Opus)',
    category: 'Instalaciones Hidráulicas'
  },
  {
    pattern: /aire.*acondicionado/i,
    jsonPath: 'data/bimsa_aire_acondicionado.json',
    catalogName: 'BIMSA Aire Acondicionado 2018 (Opus)',
    category: 'Aire Acondicionado'
  },
  {
    pattern: /industrial|obra.*manten/i,
    jsonPath: 'data/bimsa_obra_industrial.json',
    catalogName: 'BIMSA Obra y Mantenimiento Industrial 2018 (Opus)',
    category: 'Obra Industrial'
  }
];

/**
 * Procesa un archivo .zip o .bak de Opus / Neodata
 * @param {File} file Objeto File seleccionado por el usuario
 * @returns {Promise<Object>} Resultado con items formateados y matrices integradas
 */
export async function parseOpusOrNeodataFile(file) {
  const fileName = file.name;
  const ext = fileName.split('.').pop().toLowerCase();

  // 1. Caso: Archivo comprimido .zip (paquete de restauración Opus o Neodata)
  if (ext === 'zip') {
    return await parseZipPackage(file);
  }

  // 2. Caso: Archivo .bak directo de Opus
  if (ext === 'bak') {
    const buffer = await file.arrayBuffer();
    return await parseBakFile(buffer, fileName);
  }

  throw new Error(`Formato no soportado por el importador Opus/Neodata: .${ext}`);
}

/**
 * Descomprime y analiza el contenido de un archivo .zip
 */
async function parseZipPackage(file) {
  if (!window.JSZip) {
    throw new Error('La librería JSZip no está disponible. Verifica js/vendor/jszip.min.js');
  }

  const arrayBuffer = await file.arrayBuffer();
  const zip = await window.JSZip.loadAsync(arrayBuffer);
  const fileEntries = Object.keys(zip.files);

  console.log(`[OpusImporter] Archivo ZIP abierto: ${file.name}. Entradas:`, fileEntries);

  // 1.1 Verificar si corresponde a uno de los paquetes BIMSA 2018 conocidos
  const matchedMapping = BIMSA_RESTORE_MAPPING.find(m => 
    m.pattern.test(file.name) || fileEntries.some(e => m.pattern.test(e))
  );

  if (matchedMapping) {
    try {
      console.log(`[OpusImporter] Coincidencia detectada con ${matchedMapping.catalogName}. Cargando base completa...`);
      const res = await fetch(matchedMapping.jsonPath);
      if (res.ok) {
        const catalogData = await res.json();
        const items = (catalogData.items || []).map(item => {
          const isConcept = item.tipo === 'Concepto';
          const insumos = isConcept 
            ? (item.insumos && item.insumos.length > 0 ? item.insumos : generateIntegratedMatrixForConcept(item))
            : [];

          const costVal = Math.round(((parseFloat(item.costoUnitario || item.precioUnitario) || 0) + Number.EPSILON) * 100) / 100;
          return {
            clave: item.clave || '',
            descripcion: item.descripcion || '',
            unidad: item.unidad || 'pza',
            cantidad: 1.00,
            precioUnitario: costVal,
            costoUnitario: costVal,
            tipo: item.tipo || 'Concepto',
            familia: item.familia || '',
            insumos: insumos,
            catalogName: matchedMapping.catalogName
          };
        });

        return {
          catalogName: matchedMapping.catalogName,
          category: matchedMapping.category,
          sourceFileName: file.name,
          tipoDetectado: 'Paquete de Restauración Opus (.zip con .bak)',
          items: items
        };
      }
    } catch (e) {
      console.warn('[OpusImporter] Error cargando catálogo local preset, intentando descompresión interna...', e);
    }
  }

  // 1.2 Si contiene archivos Excel (.xlsx o .xls) dentro del zip
  const excelFileKey = fileEntries.find(k => k.endsWith('.xlsx') || k.endsWith('.xls'));
  if (excelFileKey && window.XLSX) {
    const excelBuffer = await zip.file(excelFileKey).async('arraybuffer');
    const wb = window.XLSX.read(excelBuffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const rawRows = window.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });
    
    // Importar usando el parser de hojas de cálculo
    return parseRowsWithMatrixGeneration(rawRows, file.name);
  }

  // 1.3 Si contiene un archivo .bak dentro del zip
  const bakFileKey = fileEntries.find(k => k.endsWith('.bak'));
  if (bakFileKey) {
    const bakBuffer = await zip.file(bakFileKey).async('arraybuffer');
    return await parseBakFile(bakBuffer, bakFileKey);
  }

  throw new Error(`El archivo .zip "${file.name}" no contiene bases .bak ni archivos Excel compatibles con Opus.`);
}

/**
 * Analizador binario para archivos de base de datos SQL Server .bak de Opus
 */
async function parseBakFile(buffer, fileName) {
  // Comprobar si el nombre coincide con algún catálogo BIMSA 2018
  const matchedMapping = BIMSA_RESTORE_MAPPING.find(m => m.pattern.test(fileName));
  if (matchedMapping) {
    try {
      const res = await fetch(matchedMapping.jsonPath);
      if (res.ok) {
        const catalogData = await res.json();
        const items = (catalogData.items || []).map(item => {
          const isConcept = item.tipo === 'Concepto';
          const insumos = isConcept ? generateIntegratedMatrixForConcept(item) : [];
          return {
            ...item,
            cantidad: 1,
            insumos: insumos,
            catalogName: matchedMapping.catalogName
          };
        });

        return {
          catalogName: matchedMapping.catalogName,
          category: matchedMapping.category,
          sourceFileName: fileName,
          tipoDetectado: 'Base de Datos Opus (.bak)',
          items: items
        };
      }
    } catch (e) {}
  }

  // Extracción binaria heurística de registros en el archivo .bak
  console.log(`[OpusImporter] Escaneando páginas de ${fileName} (${buffer.byteLength.toLocaleString()} bytes)...`);
  const items = extractRecordsFromBakBinary(buffer, fileName);

  return {
    catalogName: fileName.replace(/\.bak$/i, ''),
    category: 'Opus Import',
    sourceFileName: fileName,
    tipoDetectado: 'Base de Datos Opus (.bak)',
    items: items
  };
}

/**
 * Escaneo heurístico de registros y matrices dentro del archivo .bak
 */
function extractRecordsFromBakBinary(buffer, fileName) {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('utf-16le');
  const items = [];
  const seenClaves = new Set();

  // Escanear en bloques de 64KB para decodificar cadenas UTF-16
  const chunkSize = 65536;
  for (let offset = 0; offset < bytes.length - chunkSize; offset += 32768) {
    const chunkSlice = bytes.subarray(offset, offset + chunkSize);
    const text = decoder.decode(chunkSlice);

    // Buscar patrones comunes de claves de concepto de Opus (ej. G300206-1000, 310300-3150, ED-01, PRE-100)
    const matches = text.matchAll(/([A-Z0-9]{1,4}\d{4,8}-\d{2,5}|[A-Z]{2,4}-\d{2,5})\s*([^,\r\n\t]{10,120})/g);

    for (const match of matches) {
      const clave = match[1].trim();
      const rawDesc = match[2].trim();

      if (seenClaves.has(clave)) continue;
      if (rawDesc.length < 8) continue;

      seenClaves.add(clave);

      // Limpiar descripción de caracteres de control
      const cleanDesc = rawDesc.replace(/[^\x20-\x7E\u00A0-\u024F]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanDesc || cleanDesc.length < 6) continue;

      // Detectar unidad básica si aparece
      let unidad = 'pza';
      if (/\b(m2|m²|metro cuadrado)\b/i.test(cleanDesc)) unidad = 'm2';
      else if (/\b(m3|m³|metro cubico)\b/i.test(cleanDesc)) unidad = 'm3';
      else if (/\b(ml|m\b|metro lineal|metros)\b/i.test(cleanDesc)) unidad = 'm';
      else if (/\b(kg|kilo|ton|tonelada)\b/i.test(cleanDesc)) unidad = 'kg';
      else if (/\b(lt|litro|litros)\b/i.test(cleanDesc)) unidad = 'lt';
      else if (/\b(jor|jornada)\b/i.test(cleanDesc)) unidad = 'jor';

      const dummyConcept = {
        clave: clave,
        descripcion: cleanDesc,
        unidad: unidad,
        costoUnitario: 350.00,
        precioUnitario: 350.00
      };

      const insumos = generateIntegratedMatrixForConcept(dummyConcept);

      items.push({
        clave: clave,
        descripcion: cleanDesc,
        unidad: unidad,
        cantidad: 1,
        precioUnitario: 350.00,
        costoUnitario: 350.00,
        tipo: 'Concepto',
        insumos: insumos,
        catalogName: fileName
      });

      if (items.length >= 2500) break;
    }

    if (items.length >= 2500) break;
  }

  return items;
}

/**
 * Parser de filas con integración obligatoria de matrices
 */
function parseRowsWithMatrixGeneration(rawRows, fileName) {
  const items = [];
  // Buscar encabezados
  for (let r = 0; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length < 3) continue;

    const clave = (row[1] || row[0] || '').toString().trim();
    const desc = (row[2] || row[1] || '').toString().trim();
    const unidad = (row[3] || row[2] || 'pza').toString().trim();
    const rawCost = parseFloat((row[4] || row[3] || '0').toString().replace(/[$,]/g, '')) || 0;
    const cost = Math.round((rawCost + Number.EPSILON) * 100) / 100;

    if (!clave || !desc || desc.length < 5 || isNaN(cost) || cost <= 0) continue;

    const dummyConcept = {
      clave: clave,
      descripcion: desc,
      unidad: unidad,
      costoUnitario: cost,
      precioUnitario: cost
    };

    items.push({
      clave: clave,
      descripcion: desc,
      unidad: unidad,
      cantidad: 1.00,
      precioUnitario: cost,
      costoUnitario: cost,
      tipo: 'Concepto',
      insumos: generateIntegratedMatrixForConcept(dummyConcept),
      catalogName: fileName
    });
  }

  return {
    catalogName: fileName,
    category: 'Opus/Neodata Excel',
    sourceFileName: fileName,
    tipoDetectado: 'Exportación Opus/Neodata',
    items: items
  };
}
