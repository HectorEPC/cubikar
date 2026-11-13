// js/modules/io/universalImporter.js
// Importador Universal compatible con .xlsx, .xls, .csv, .json

import { state, persistLocalData, persistSettings } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney, round2, round5, parseFlexibleNumber } from '../../core/formatters.js';
import { updateGrandTotal, updateSobrecostoBadge } from '../../core/calculations.js';
import { recalculateClaves, findNodeById, guardConceptLimit } from '../catalog/treeService.js';
import { CASA_LAURA_PROJECT, getExactOpusInsumosForClave } from './casaLauraData.js';
import { countTreeConcepts, loadSampleResidentialZipCatalog } from '../portal/projectService.js';
import { defaultTreeData } from '../../config/defaultData.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { saveReferenceCatalog, getReferenceDatabaseStats, canImportReferenceCatalog } from '../reference/referenceDb.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import { parseOpusOrNeodataFile } from './opusNeodataImporter.js';
import { cleanMojibake, sanitizeCatalogNodes, readBlobAsTextSmart } from '../../core/textSanitizer.js';

let currentParsedData = null; // Almacena el resultado del parsing del archivo actual
let currentWorkbook = null;
let currentFileName = '';

// Normalizar nombres de columnas para detección automática
function normalizeColName(name) {
  if (!name) return '';
  return name.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]/g, '');
}


// Extraer nivel jerárquico de cualquier celda (soporta 0, 1, 2, "1.1", "1.1.1", "-- 2", "· 1", romanos)
export function extractNivel(val) {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim();
  if (!str) return null;

  // Si contiene formato jerárquico como "1.1", "1.1.2", "01.02.03"
  if (/^\d+(\.\d+)+$/.test(str)) {
    return str.split('.').length;
  }

  // Si es un número entero simple (incluyendo 0)
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // Si contiene números precedidos o seguidos de caracteres decorativos (ej. "-- 2", "· 1", "Nivel 2", "Nv. 2")
  const numMatch = str.match(/\b\d+\b/);
  if (numMatch) {
    return parseInt(numMatch[0], 10);
  }

  // Números romanos si aplica (I, II, III, IV, V, VI, VII, VIII, IX, X...)
  const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10 };
  const upper = str.toUpperCase().replace(/[^IVX]/g, '');
  if (romanMap[upper]) {
    return romanMap[upper];
  }

  return null;
}

// Analizar y mapear filas a un formato estándar
export function parseSheetData(rawRows, fileName = '') {
  if (!rawRows || rawRows.length === 0) return null;

  // Buscar fila de encabezados dentro de las primeras 35 filas
  let headerIndex = -1;
  let headers = [];
  let colMap = {
    nivel: -1,
    clave: -1,
    descripcion: -1,
    unidad: -1,
    cantidad: -1,
    precio: -1,
    precioZ1: -1,
    precioZ2: -1,
    precioZ3: -1,
    importe: -1,
    familia: -1,
    tipo: -1
  };

  for (let r = 0; r < Math.min(35, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const rowNorm = row.map(cell => normalizeColName(cell));

    // Comprobamos si esta fila contiene indicadores de encabezado
    const hasDesc = rowNorm.some(c => (
      c.includes('descrip') || c.includes('concepto') || c.includes('detalle') ||
      c === 'nombre' || c.includes('especific') || c.includes('texto') || c.includes('partida')
    ));
    const hasClave = rowNorm.some(c => (
      c.includes('clave') || c.includes('codigo') || c === 'c' || c === 'id' || c === 'item' || c === 'no' || c === 'num'
    ));
    const hasPrecio = rowNorm.some(c => (
      c.includes('costo') || c.includes('precio') || c.includes('pu') || c.includes('importe') || c.includes('total')
    ));

    if ((hasDesc && hasPrecio) || (hasDesc && hasClave) || (hasClave && hasPrecio)) {
      headerIndex = r;
      headers = row;
      rowNorm.forEach((c, idx) => {
        // Nivel / Jerarquía
        if (colMap.nivel === -1 && (
          c === 'nivel' || c === 'level' || c === 'niv' || c === 'nv' || c === 'wbs' ||
          c.includes('jerarq') || c === 'indent' || c === 'fase' || c === 'nodo' ||
          c === 'capitulo' || c === 'subpartida' || c === 'subagrupador'
        )) {
          colMap.nivel = idx;
        }

        // Clave / Código
        if (colMap.clave === -1 && (
          c === 'clave' || c === 'codigo' || c === 'cve' || c === 'id' || c === 'partida' ||
          c === 'c' || c === 'item' || c === 'cod' || c === 'referencia' || c === 'no' ||
          c === 'num' || c === 'numero' || c === 'pos' || c === 'renglon'
        ) && !c.includes('descrip') && !c.includes('concepto') && !c.includes('nombre')) {
          colMap.clave = idx;
        }

        // Descripción
        if (colMap.descripcion === -1 && (
          c.includes('descrip') || c.includes('concepto') || c.includes('detalle') ||
          c === 'nombre' || c.includes('especific') || c.includes('texto') ||
          c.includes('trabajo') || c.includes('actividad')
        ) && !c.includes('clave') && !c.includes('codigo') && !c.includes('tipo') && !c.includes('costo') && !c.includes('precio')) {
          colMap.descripcion = idx;
        }

        // Unidad
        if (colMap.unidad === -1 && (c === 'unidad' || c === 'unid' || c === 'um' || c === 'medida' || c === 'u')) {
          colMap.unidad = idx;
        }

        // Cantidad
        if (colMap.cantidad === -1 && (c === 'cantidad' || c === 'cant' || c === 'volumen' || c === 'vol')) {
          colMap.cantidad = idx;
        }

        // Zonas de gobierno
        if (colMap.precioZ1 === -1 && c.includes('precioz1')) colMap.precioZ1 = idx;
        if (colMap.precioZ2 === -1 && c.includes('precioz2')) colMap.precioZ2 = idx;
        if (colMap.precioZ3 === -1 && c.includes('precioz3')) colMap.precioZ3 = idx;

        // Precio unitario
        if (colMap.precio === -1 && (
          c.includes('costounitario') || c.includes('preciounitario') || c === 'costo' ||
          c === 'precio' || c === 'pu' || c === 'punit' || c.includes('puot') ||
          c === 'preciounit' || c.includes('costounit') || c === 'punitario'
        )) {
          colMap.precio = idx;
        }

        // Total / Importe
        if (colMap.importe === -1 && (
          c.includes('importe') || c.includes('total') || c.includes('monto') ||
          c === 'subtotal' || c.includes('importetotal')
        )) {
          colMap.importe = idx;
        }

        // Familia / Rubro
        if (colMap.familia === -1 && (c.includes('familia') || c.includes('categoria') || c.includes('grupo') || c.includes('rubro'))) {
          colMap.familia = idx;
        }

        // Tipo de insumo / componente
        if (colMap.tipo === -1 && (c === 'tipo' || c === 'tipoinsumo' || c === 'tiporubro' || c === 'componente' || c === 'comp')) {
          colMap.tipo = idx;
        }
      });
      break;
    }
  }

  // Si no se detectó una fila de encabezado explícita pero hay datos estructurados
  if (headerIndex === -1 && rawRows.length > 0) {
    headerIndex = 0;
    // Asignación posicional heurística
    colMap.clave = 0;
    colMap.descripcion = 1;
    colMap.unidad = 2;
    colMap.precio = 3;
  }

  // Determinar tipo por nombre de archivo o estructura
  const fn = fileName.toLowerCase();
  let defaultTipo = 'Concepto';
  let detectedTypeLabel = 'Conceptos / Matrices';

  if (fn.includes('material')) {
    defaultTipo = 'Material';
    detectedTypeLabel = 'Insumos - Materiales';
  } else if (fn.includes('mano de obra') || fn.includes('mo') || fn.includes('cuadrilla') || fn.includes('salario')) {
    defaultTipo = 'Mano de Obra';
    detectedTypeLabel = 'Insumos - Mano de Obra';
  } else if (fn.includes('maquinaria') || fn.includes('equipo') || fn.includes('herramienta')) {
    defaultTipo = 'Equipo';
    detectedTypeLabel = 'Insumos - Maquinaria y Equipo';
  } else if (fn.includes('subcontrat')) {
    defaultTipo = 'Subcontrato';
    detectedTypeLabel = 'Insumos - Subcontratos';
  } else if (colMap.precioZ1 !== -1) {
    detectedTypeLabel = 'Catálogo Oficial de Gobierno (Zonas Z1, Z2, Z3)';
  } else if (colMap.nivel !== -1) {
    detectedTypeLabel = 'Presupuesto Jerárquico (Niveles de Obra)';
  }

  // Procesar filas de datos
  const items = [];
  const startRow = headerIndex + 1;

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;

    let desc = colMap.descripcion !== -1 ? String(row[colMap.descripcion] || '').trim() : '';
    let clave = colMap.clave !== -1 ? String(row[colMap.clave] || '').trim() : '';

    // Salvaguarda: si no hay descripción pero clave tiene texto largo (>15 caracteres o espacios)
    if (!desc && clave && (clave.length > 15 || clave.includes(' '))) {
      desc = clave;
      clave = '';
    }

    if (!desc && !clave) continue; // Omitir filas en blanco

    // Extraer unidad
    let unid = colMap.unidad !== -1 ? cleanMojibake(String(row[colMap.unidad] || '').trim()) : '';

    // Extraer cantidad (tolerante a formato con coma latina y preservando 5 decimales de matrices)
    let cant = 1.00;
    let hasExplicitCant = false;
    if (colMap.cantidad !== -1 && row[colMap.cantidad] !== undefined && String(row[colMap.cantidad]).trim() !== '') {
      cant = round5(parseFlexibleNumber(row[colMap.cantidad], 0));
      hasExplicitCant = true;
    }

    // Extraer precio
    let precio = 0.00;
    let hasExplicitPrecio = false;
    let preciosZonas = null;

    if (colMap.precioZ1 !== -1) {
      const z1 = round2(parseFlexibleNumber(row[colMap.precioZ1], 0));
      const z2 = colMap.precioZ2 !== -1 ? round2(parseFlexibleNumber(row[colMap.precioZ2], z1)) : z1;
      const z3 = colMap.precioZ3 !== -1 ? round2(parseFlexibleNumber(row[colMap.precioZ3], z2)) : z2;
      preciosZonas = { z1, z2, z3 };
      precio = z1;
      hasExplicitPrecio = true;
    } else if (colMap.precio !== -1 && row[colMap.precio] !== undefined && String(row[colMap.precio]).trim() !== '') {
      precio = round2(parseFlexibleNumber(row[colMap.precio], 0));
      hasExplicitPrecio = true;
    }

    // Extraer importe si existe
    let importe = 0.00;
    if (colMap.importe !== -1 && row[colMap.importe] !== undefined && String(row[colMap.importe]).trim() !== '') {
      importe = round2(parseFlexibleNumber(row[colMap.importe], 0));
      if (!hasExplicitPrecio && hasExplicitCant && cant > 0 && importe > 0) {
        precio = round2(importe / cant);
        hasExplicitPrecio = true;
      }
    }

    // Extraer nivel jerárquico
    let nivel = null;
    if (colMap.nivel !== -1 && row[colMap.nivel] !== undefined) {
      nivel = extractNivel(row[colMap.nivel]);
    }

    // Si no hay nivel explícito, inferir por puntos en clave o por sangría en la descripción
    if (nivel === null) {
      if (clave && /^\d+(\.\d+)+$/.test(clave)) {
        nivel = clave.split('.').length;
      } else {
        const rawCellDesc = colMap.descripcion !== -1 ? String(row[colMap.descripcion] || '') : '';
        const leadingSpaces = (rawCellDesc.match(/^[\s\t]+/) || [''])[0].length;
        if (leadingSpaces >= 2) {
          nivel = 1 + Math.floor(leadingSpaces / 2);
        }
      }
    }

    // Detectar si la fila es intrínsecamente una Partida o Agrupador
    const looksLikePartida = (!unid || unid.toLowerCase() === 'lote' || unid.toLowerCase() === 'partida') &&
                             (!hasExplicitPrecio || precio === 0) &&
                             (!hasExplicitCant || cant === 0 || cant === 1);

    // Extraer tipo si la columna está presente
    let rowTipo = defaultTipo;
    if (colMap.tipo !== -1 && row[colMap.tipo] !== undefined) {
      const rawT = String(row[colMap.tipo]).trim().toLowerCase();
      if (rawT.includes('material') || rawT === 'mat' || rawT === '1') rowTipo = 'Material';
      else if (rawT.includes('obra') || rawT.includes('mo') || rawT === '2') rowTipo = 'Mano de Obra';
      else if (rawT.includes('herramienta') || rawT === 'herr' || rawT === '3') rowTipo = 'Herramienta';
      else if (rawT.includes('maquinaria') || rawT === 'maq' || rawT === '4') rowTipo = 'Maquinaria';
      else if (rawT.includes('equipo') || rawT === 'eq' || rawT === '5') rowTipo = 'Equipo';
      else if (rawT.includes('subcontrat') || rawT === 'sub' || rawT === '6') rowTipo = 'Subcontrato';
      else if (rawT.includes('partida') || rawT === 'p') rowTipo = 'Partida';
      else if (rawT.includes('concepto') || rawT === 'c') rowTipo = 'Concepto';
    } else if (looksLikePartida && defaultTipo === 'Concepto') {
      rowTipo = 'Partida';
    }

    const familia = colMap.familia !== -1 ? String(row[colMap.familia] || '').trim() : '';

    items.push({
      nivel,
      clave,
      descripcion: desc,
      unidad: unid || (rowTipo === 'Partida' ? 'lote' : 'pza'),
      cantidad: cant,
      precioUnitario: precio,
      costoUnitario: precio,
      importe: importe || round2(cant * precio),
      preciosZonas,
      familia,
      tipo: rowTipo
    });
  }

  // Segunda pasada: inferir niveles faltantes si algunos quedaron nulos
  let currentGroupLevel = 1;
  items.forEach(it => {
    if (it.nivel === null) {
      if (it.tipo === 'Partida') {
        it.nivel = currentGroupLevel;
      } else {
        it.nivel = currentGroupLevel + 1;
      }
    } else {
      if (it.tipo === 'Partida') {
        currentGroupLevel = it.nivel;
      }
    }
  });

  // Normalización para que el nivel mínimo absoluto comience en 1
  let minDetectedNivel = Infinity;
  items.forEach(it => {
    if (typeof it.nivel === 'number' && !isNaN(it.nivel)) {
      if (it.nivel < minDetectedNivel) minDetectedNivel = it.nivel;
    }
  });

  if (minDetectedNivel !== Infinity && minDetectedNivel <= 0) {
    const shift = 1 - minDetectedNivel;
    items.forEach(it => {
      if (typeof it.nivel === 'number') it.nivel += shift;
    });
  } else if (minDetectedNivel !== Infinity && minDetectedNivel > 1) {
    const shift = minDetectedNivel - 1;
    items.forEach(it => {
      if (typeof it.nivel === 'number') it.nivel -= shift;
    });
  }

  const hasLevels = colMap.nivel !== -1 || items.some(it => it.nivel > 1);

  return {
    detectedTypeLabel,
    defaultTipo,
    hasZones: colMap.precioZ1 !== -1,
    hasLevels: hasLevels,
    items,
    totalRows: items.length
  };
}

// Abrir el selector de archivos desde cualquier botón
export function openImportModal() {
  const modal = document.getElementById('universal-import-modal');
  if (modal) {
    resetImportModalUI();
    modal.style.setProperty('z-index', '100000', 'important');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closeImportModal() {
  const modal = document.getElementById('universal-import-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    resetImportModalUI();
  }
}

// Alternar formulario según destino (Catálogo Maestro vs Presupuesto Activo)
export function toggleImportDestination(destination) {
  const optsRef = document.getElementById('import-opts-reference');
  const optsBudget = document.getElementById('import-opts-budget');
  if (destination === 'budget') {
    if (optsRef) optsRef.classList.add('hidden');
    if (optsBudget) optsBudget.classList.remove('hidden');
  } else {
    if (optsRef) optsRef.classList.remove('hidden');
    if (optsBudget) optsBudget.classList.add('hidden');
  }
}

export function resetImportModalUI() {
  currentParsedData = null;
  currentWorkbook = null;
  currentFileName = '';

  const dropZone = document.getElementById('import-dropzone');
  const previewSection = document.getElementById('import-preview-section');
  const fileInput = document.getElementById('universal-file-input');
  const totalEl = document.getElementById('import-budget-total-amount');
  const tableTotalEl = document.getElementById('import-preview-table-total');
  
  if (dropZone) dropZone.classList.remove('hidden');
  if (previewSection) previewSection.classList.add('hidden');
  if (fileInput) fileInput.value = '';
  if (totalEl) totalEl.textContent = '$0.00';
  if (tableTotalEl) tableTotalEl.textContent = '$0.00';
}

export function onZoneSelectChange() {
  if (!currentParsedData || !currentParsedData.items) return;
  const selectedZone = document.getElementById('import-zone-select')?.value || 'z1';
  const totalBudget = calculateParsedBudgetTotal(currentParsedData.items, selectedZone);
  const totalEl = document.getElementById('import-budget-total-amount');
  if (totalEl) totalEl.textContent = formatMoney(totalBudget);
  const tableTotalEl = document.getElementById('import-preview-table-total');
  if (tableTotalEl) tableTotalEl.textContent = formatMoney(totalBudget);
}

// Manejar selección o drop de archivo
export async function handleUniversalFileSelect(event) {
  const file = event.target?.files?.[0] || event.dataTransfer?.files?.[0];
  if (!file) return;

  currentFileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();

  try {
    showToast(`Leyendo archivo "${file.name}"...`, 'info');

    if (ext === 'zip' || ext === 'bak') {
      const parsed = await parseOpusOrNeodataFile(file);
      const hasHierarchy = parsed.hasHierarchy || (parsed.items && parsed.items.some(i => i.children && i.children.length > 0));
      displayParsedPreview({
        detectedTypeLabel: parsed.tipoDetectado || 'Base Opus / Neodata',
        defaultTipo: 'Concepto',
        hasZones: false,
        hasLevels: hasHierarchy,
        items: parsed.items,
        totalRows: parsed.items.length
      }, file.name);

      // Si es un proyecto completo con partidas jerárquicas, preseleccionar Presupuesto Activo y Reemplazar
      if (hasHierarchy) {
        const destBudgetRadio = document.querySelector('input[name="import-destination"][value="budget"]');
        if (destBudgetRadio) {
          destBudgetRadio.checked = true;
          toggleImportDestination('budget');
        }
        const replaceRadio = document.querySelector('input[name="budget-import-mode"][value="replace"]');
        if (replaceRadio) {
          replaceRadio.checked = true;
        }
      }
      return;
    } else if (ext === 'json') {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      let items = Array.isArray(jsonData) ? jsonData : (jsonData.items || jsonData.conceptos || []);
      displayParsedPreview({
        detectedTypeLabel: 'Formato Estructurado JSON',
        defaultTipo: 'Concepto',
        hasZones: false,
        hasLevels: false,
        items: items,
        totalRows: items.length
      }, file.name);
    } else if (ext === 'csv' || ext === 'txt') {
      // Usar SheetJS o FileReader
      const text = await file.text();
      if (window.XLSX) {
        const wb = window.XLSX.read(text, { type: 'string' });
        const firstSheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[firstSheetName];
        const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const parsed = parseSheetData(rows, file.name);
        displayParsedPreview(parsed, file.name);
      } else {
        // Fallback básico para CSV si no está SheetJS
        const rows = text.split(/\r?\n/).map(line => line.split(','));
        const parsed = parseSheetData(rows, file.name);
        displayParsedPreview(parsed, file.name);
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      if (!window.XLSX) {
        throw new Error('La librería SheetJS no está cargada. Asegúrate de incluir js/vendor/xlsx.full.min.js');
      }
      const data = await file.arrayBuffer();
      currentWorkbook = window.XLSX.read(data, { type: 'array' });
      
      const sheetSelector = document.getElementById('import-sheet-select');
      if (sheetSelector) {
        sheetSelector.innerHTML = '';
        currentWorkbook.SheetNames.forEach(name => {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          sheetSelector.appendChild(opt);
        });
      }

      loadWorkbookSheet(currentWorkbook.SheetNames[0]);
    } else {
      showToast('Formato no soportado. Usa archivos .xlsx, .xls, .csv o .json', 'error');
    }
  } catch (err) {
    console.error('Error procesando archivo:', err);
    showToast(`Error al procesar el archivo: ${err.message}`, 'error');
  }
}

// Cargar hoja específica del Excel
export function onSheetSelectChange() {
  const sheetSelector = document.getElementById('import-sheet-select');
  if (!sheetSelector || !currentWorkbook) return;
  loadWorkbookSheet(sheetSelector.value);
}

function loadWorkbookSheet(sheetName) {
  if (!currentWorkbook || !currentWorkbook.Sheets[sheetName]) return;
  const sheet = currentWorkbook.Sheets[sheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const parsed = parseSheetData(rows, currentFileName);
  displayParsedPreview(parsed, currentFileName);
}

// Funciones auxiliares para manejo de jerarquías de presupuestos (Opus / Neodata / Excel)

// Contar recursivamente partidas y conceptos
function countRecursiveItems(items) {
  let partidas = 0;
  let conceptos = 0;
  function traverse(list) {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      if (item.tipo === 'Partida' || hasChildren) {
        partidas++;
        if (hasChildren) traverse(item.children);
      } else {
        conceptos++;
      }
    }
  }
  traverse(items);
  return { partidas, conceptos, total: partidas + conceptos };
}

// Aplanar árbol para guardar solo conceptos e insumos en Catálogo Maestro
function flattenTreeItems(items) {
  let flat = [];
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      flat = flat.concat(flattenTreeItems(item.children));
    } else {
      flat.push(item);
    }
  }
  return flat;
}

// Detectar si los nodos contienen claves personalizadas (alfanuméricas o Opus como G140100-5005, TEMP*7)
function hasCustomClaves(nodes) {
  for (const n of nodes) {
    if (n.clave && !/^\d+(\.\d+)*$/.test(n.clave)) return true;
    if (n.children && n.children.length > 0 && hasCustomClaves(n.children)) return true;
  }
  return false;
}

// Llenar claves faltantes sin sobreescribir las existentes
function fillMissingClaves(nodes, prefix = '') {
  nodes.forEach((n, idx) => {
    if (!n.clave) {
      n.clave = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
    }
    if (n.children && n.children.length > 0) {
      fillMissingClaves(n.children, n.clave);
    }
  });
}

// Asegurar que las partidas con hijos tengan unidad 'lote', cantidad 1 y costos en cero
function enforceParentUnits(nodes) {
  nodes.forEach(n => {
    if (n.children && n.children.length > 0) {
      n.tipo = 'Partida';
      n.unidad = 'lote';
      n.cantidad = 1;
      n.precioUnitario = 0;
      n.costoDirecto = 0;
      enforceParentUnits(n.children);
    }
  });
}

// Convertir estructura jerárquica con .children en nodos para state.treeData
function convertTreeNodes(items, selectedZone, overrideType) {
  return items.map(item => {
    let finalPrice = item.precioUnitario || 0;
    if (item.preciosZonas && item.preciosZonas[selectedZone] !== undefined) {
      finalPrice = item.preciosZonas[selectedZone];
    }

    const hasChildren = Array.isArray(item.children) && item.children.length > 0;
    const isPartida = item.tipo === 'Partida' || hasChildren;

    let finalTipo = item.tipo || (isPartida ? 'Partida' : 'Concepto');
    if (!isPartida && overrideType && overrideType !== 'mixto') {
      finalTipo = overrideType;
    }

    let integratedInsumos = [];
    if (!isPartida) {
      if (Array.isArray(item.insumos) && item.insumos.length > 0) {
        integratedInsumos = JSON.parse(JSON.stringify(item.insumos));
      } else {
        const exactOpus = getExactOpusInsumosForClave(item.clave);
        integratedInsumos = exactOpus ? JSON.parse(JSON.stringify(exactOpus)) : generateIntegratedMatrixForConcept(item);
      }
    if (Array.isArray(integratedInsumos)) {
      integratedInsumos.forEach(ins => {
        if (ins.cantidad !== undefined) ins.cantidad = round5(parseFlexibleNumber(ins.cantidad, 1.0));
        if (ins.costoUnitario !== undefined) ins.costoUnitario = round2(parseFlexibleNumber(ins.costoUnitario, 0));
      });
    }
    }

    const node = {
      id: item.id || ('_' + Math.random().toString(36).substr(2, 9)),
      clave: item.clave || '',
      descripcion: item.descripcion || (isPartida ? 'Partida' : 'Concepto importado'),
      unidad: isPartida ? 'lote' : (item.unidad || 'pza'),
      cantidad: isPartida ? 1 : (item.cantidad !== undefined ? round5(parseFlexibleNumber(item.cantidad, 1)) : 1),
      precioUnitario: isPartida ? 0 : Number(finalPrice || 0),
      costoDirecto: isPartida ? 0 : Number(item.costoUnitario || finalPrice || 0),
      expanded: true,
      selected: true,
      tipo: isPartida ? 'Partida' : finalTipo,
      insumos: integratedInsumos,
      children: []
    };

    if (hasChildren) {
      node.children = convertTreeNodes(item.children, selectedZone, overrideType);
      node.tipo = 'Partida';
      node.unidad = 'lote';
      node.cantidad = 1;
      node.precioUnitario = 0;
      node.costoDirecto = 0;
    }

    return node;
  });
}

// Convertir lista plana con .nivel a árbol jerárquico multinivel (preservando sub-filas y sub-conceptos)
function convertFlatToTreeNodes(items, selectedZone, overrideType) {
  if (!items || items.length === 0) return [];

  // Calcular el nivel mínimo del conjunto
  let minLevel = Infinity;
  items.forEach(it => {
    const n = (typeof it.nivel === 'number' && !isNaN(it.nivel)) ? it.nivel : 1;
    if (n < minLevel) minLevel = n;
  });
  if (minLevel === Infinity) minLevel = 1;

  const rootLevel = minLevel;
  const newNodes = [];
  const stack = []; // Array de { level, node }

  items.forEach(item => {
    const level = (typeof item.nivel === 'number' && !isNaN(item.nivel)) ? item.nivel : rootLevel;
    let finalPrice = item.precioUnitario || 0;
    if (item.preciosZonas && item.preciosZonas[selectedZone] !== undefined) {
      finalPrice = item.preciosZonas[selectedZone];
    }

    const isExplicitPartida = item.tipo === 'Partida';
    let finalTipo = item.tipo || (isExplicitPartida ? 'Partida' : 'Concepto');
    if (!isExplicitPartida && overrideType && overrideType !== 'mixto') {
      finalTipo = overrideType;
    }

    let integratedInsumos = [];
    if (!isExplicitPartida) {
      if (Array.isArray(item.insumos) && item.insumos.length > 0) {
        integratedInsumos = JSON.parse(JSON.stringify(item.insumos));
      } else {
        const exactOpus = getExactOpusInsumosForClave(item.clave);
        integratedInsumos = exactOpus ? JSON.parse(JSON.stringify(exactOpus)) : generateIntegratedMatrixForConcept(item);
      }
    }
    if (Array.isArray(integratedInsumos)) {
      integratedInsumos.forEach(ins => {
        if (ins.cantidad !== undefined) ins.cantidad = round5(parseFlexibleNumber(ins.cantidad, 1.0));
        if (ins.costoUnitario !== undefined) ins.costoUnitario = round2(parseFlexibleNumber(ins.costoUnitario, 0));
      });
    }

    const newNode = {
      id: item.id || ('_' + Math.random().toString(36).substr(2, 9)),
      clave: item.clave || '',
      descripcion: item.descripcion || (isExplicitPartida ? 'Partida' : 'Concepto importado'),
      unidad: isExplicitPartida ? 'lote' : (item.unidad || 'pza'),
      cantidad: isExplicitPartida ? 1 : (item.cantidad !== undefined ? round5(parseFlexibleNumber(item.cantidad, 1)) : 1),
      precioUnitario: isExplicitPartida ? 0 : Number(finalPrice || 0),
      costoDirecto: isExplicitPartida ? 0 : Number(item.costoUnitario || finalPrice || 0),
      expanded: true, // Siempre expandido para que las sub-filas sean visibles de inmediato
      selected: true,
      tipo: isExplicitPartida ? 'Partida' : finalTipo,
      insumos: integratedInsumos,
      children: []
    };

    if (level <= rootLevel) {
      newNodes.push(newNode);
      stack.length = 0;
      stack.push({ level, node: newNode });
    } else {
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      if (stack.length > 0) {
        const parentNode = stack[stack.length - 1].node;
        if (!parentNode._origPU && parentNode.precioUnitario > 0) {
          parentNode._origPU = parentNode.precioUnitario;
          parentNode._origCD = parentNode.costoDirecto;
          parentNode._origUnid = parentNode.unidad;
          parentNode._origCant = parentNode.cantidad;
        }
        parentNode.children.push(newNode);
        parentNode.expanded = true; // Asegurar que el padre esté expandido
        // El nodo padre ahora contiene sub-filas
        parentNode.tipo = 'Partida';
        parentNode.unidad = 'lote';
        parentNode.cantidad = 1;
        parentNode.precioUnitario = 0;
        parentNode.costoDirecto = 0;
        parentNode.insumos = []; // La matriz y costo se calculan dinámicamente desde sus sub-filas
      } else {
        newNodes.push(newNode);
      }
      stack.push({ level, node: newNode });
    }
  });

  // Salvaguarda: si un nodo padre tenía sub-filas meramente descriptivas (con costo 0), restaurar su PU propio
  function checkEmptyParentCosts(nodes) {
    nodes.forEach(n => {
      if (n.children && n.children.length > 0) {
        checkEmptyParentCosts(n.children);
        const childTotal = n.children.reduce((acc, c) => acc + ((c.cantidad || 0) * (c.precioUnitario || 0)), 0);
        if (childTotal === 0 && n._origPU && n._origPU > 0) {
          n.precioUnitario = n._origPU;
          n.costoDirecto = n._origCD || n._origPU;
          n.unidad = n._origUnid || 'pza';
          n.cantidad = n._origCant || 1;
        }
        delete n._origPU;
        delete n._origCD;
        delete n._origUnid;
        delete n._origCant;
      }
    });
  }
  checkEmptyParentCosts(newNodes);

  return newNodes;
}

// Calcular el monto total acumulado del presupuesto a importar
export function calculateParsedBudgetTotal(items, selectedZone = 'z1') {
  if (!Array.isArray(items) || items.length === 0) return 0;

  const hasChildren = items.some(i => Array.isArray(i.children) && i.children.length > 0);

  function calcNode(node) {
    if (Array.isArray(node.children) && node.children.length > 0) {
      const childSum = node.children.reduce((acc, c) => acc + calcNode(c), 0);
      if (childSum === 0 && (node.precioUnitario || 0) > 0 && (node.cantidad || 0) > 0) {
        return round2((node.cantidad || 0) * (node.precioUnitario || 0));
      }
      return round2(childSum);
    }
    const cant = (typeof node.cantidad === 'number' && !isNaN(node.cantidad)) ? node.cantidad : 0;
    let pu = (typeof node.precioUnitario === 'number' && !isNaN(node.precioUnitario)) ? node.precioUnitario : 0;
    if (node.preciosZonas && node.preciosZonas[selectedZone] !== undefined) {
      pu = Number(node.preciosZonas[selectedZone]) || pu;
    } else if (pu === 0 && typeof node.costoUnitario === 'number' && !isNaN(node.costoUnitario)) {
      pu = node.costoUnitario;
    }
    if (cant * pu === 0 && typeof node.importe === 'number' && !isNaN(node.importe) && node.importe > 0) {
      return round2(node.importe);
    }
    return round2(cant * pu);
  }

  if (hasChildren) {
    return round2(items.reduce((acc, root) => acc + calcNode(root), 0));
  } else {
    // Si tiene partidas y conceptos en lista plana
    const hasPartidas = items.some(it => it.tipo === 'Partida');
    const hasLevels = items.some(it => typeof it.nivel === 'number' && it.nivel > 1);

    if (hasLevels || hasPartidas) {
      // Sumar solo conceptos hoja (no partidas para no duplicar montos de grupos)
      const leafSum = items.reduce((acc, it) => {
        if (it.tipo === 'Partida') return acc;
        const cant = (typeof it.cantidad === 'number' && !isNaN(it.cantidad)) ? it.cantidad : 1;
        let pu = (typeof it.precioUnitario === 'number' && !isNaN(it.precioUnitario)) ? it.precioUnitario : (it.costoUnitario || 0);
        if (it.preciosZonas && it.preciosZonas[selectedZone] !== undefined) {
          pu = Number(it.preciosZonas[selectedZone]) || pu;
        }
        if (it.importe && typeof it.importe === 'number' && it.importe > 0 && cant * pu === 0) {
          return acc + round2(it.importe);
        }
        return acc + round2(cant * pu);
      }, 0);
      if (leafSum > 0) return round2(leafSum);
    }

    // Fallback general para catálogo simple
    return round2(items.reduce((acc, it) => {
      const cant = (typeof it.cantidad === 'number' && !isNaN(it.cantidad)) ? it.cantidad : 1;
      let pu = (typeof it.precioUnitario === 'number' && !isNaN(it.precioUnitario)) ? it.precioUnitario : (it.costoUnitario || 0);
      if (it.preciosZonas && it.preciosZonas[selectedZone] !== undefined) {
        pu = Number(it.preciosZonas[selectedZone]) || pu;
      }
      if (it.importe && typeof it.importe === 'number' && it.importe > 0 && cant * pu === 0) {
        return acc + round2(it.importe);
      }
      return acc + round2(cant * pu);
    }, 0));
  }
}

// Mostrar vista previa en la interfaz
function displayParsedPreview(parsedData, fileName) {
  if (!parsedData || !parsedData.items || parsedData.items.length === 0) {
    showToast('No se encontraron registros válidos en el archivo', 'warning');
    return;
  }

  currentParsedData = parsedData;

  const dropZone = document.getElementById('import-dropzone');
  const previewSection = document.getElementById('import-preview-section');
  if (dropZone) dropZone.classList.add('hidden');
  if (previewSection) previewSection.classList.remove('hidden');

  // Metadatos y etiquetas
  const nameEl = document.getElementById('import-file-name-label');
  if (nameEl) nameEl.textContent = fileName;

  const counts = countRecursiveItems(parsedData.items);
  const countEl = document.getElementById('import-rows-count-badge');
  if (countEl) {
    if (counts.partidas > 0) {
      countEl.textContent = `${counts.partidas} partidas, ${counts.conceptos} conceptos (${counts.total} total)`;
    } else {
      countEl.textContent = `${parsedData.totalRows.toLocaleString()} registros detectados`;
    }
  }

  const typeEl = document.getElementById('import-detected-type');
  if (typeEl) typeEl.textContent = parsedData.detectedTypeLabel;

  // Monto total del presupuesto a importar
  const selectedZone = document.getElementById('import-zone-select')?.value || 'z1';
  const totalBudget = calculateParsedBudgetTotal(parsedData.items, selectedZone);

  const totalEl = document.getElementById('import-budget-total-amount');
  if (totalEl) totalEl.textContent = formatMoney(totalBudget);

  const tableTotalEl = document.getElementById('import-preview-table-total');
  if (tableTotalEl) tableTotalEl.textContent = formatMoney(totalBudget);

  // Icono dinámico según extensión
  const iconEl = document.getElementById('import-file-icon');
  if (iconEl) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (ext === 'zip' || ext === 'bak') {
      iconEl.className = 'fa-solid fa-box-archive text-amber-600';
    } else if (ext === 'json') {
      iconEl.className = 'fa-solid fa-code text-indigo-600';
    } else if (ext === 'csv' || ext === 'txt') {
      iconEl.className = 'fa-solid fa-file-csv text-blue-600';
    } else {
      iconEl.className = 'fa-solid fa-file-excel text-emerald-600';
    }
  }

  // Prellenar nombre sugerido para Catálogo de Referencia
  const catNameInput = document.getElementById('import-cat-name');
  if (catNameInput) {
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    catNameInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  }

  // Prellenar selector de tipo de insumo
  const itemTypeSelect = document.getElementById('import-item-type-select');
  if (itemTypeSelect) {
    itemTypeSelect.value = parsedData.defaultTipo || 'Concepto';
  }

  // Zona de precios (si aplica)
  const zoneContainer = document.getElementById('import-zone-container');
  if (zoneContainer) {
    if (parsedData.hasZones) {
      zoneContainer.classList.remove('hidden');
    } else {
      zoneContainer.classList.add('hidden');
    }
  }

  // Renderizar tabla de muestra (hasta 8 filas incluyendo partidas y conceptos con sangría)
  const tbody = document.getElementById('import-preview-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    const sample = [];
    function collectSample(list, depth = 0) {
      for (const item of list) {
        if (sample.length >= 8) break;
        sample.push({ ...item, _depth: depth });
        if (item.children && item.children.length > 0) {
          collectSample(item.children, depth + 1);
        }
      }
    }
    collectSample(parsedData.items);
    sample.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 text-[11px]';
      const isPartida = item.tipo === 'Partida' || (item.children && item.children.length > 0);
      const hasMatrix = Array.isArray(item.insumos) && item.insumos.length > 0;
      const indent = (item._depth || 0) * 12;
      tr.innerHTML = `
        <td class="p-1.5 font-mono text-blue-700 font-semibold align-top whitespace-nowrap">${item.clave || '-'}</td>
        <td class="p-1.5 text-slate-800 align-top">
          <div style="padding-left: ${indent}px">
            <span class="${isPartida ? 'font-bold text-slate-900' : ''}">${item.descripcion || '-'}</span>
            ${isPartida ? `<span class="ml-2 text-[9px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded">Partida</span>` : ''}
            ${hasMatrix ? `<div class="mt-1"><span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-sans text-[9px] inline-flex items-center gap-1 font-semibold"><i class="fa-solid fa-layer-group text-[8px]"></i> Matriz integrada (${item.insumos.length} insumos)</span></div>` : ''}
          </div>
        </td>
        <td class="p-1.5 text-center font-mono align-top">${isPartida ? 'lote' : (item.unidad || 'pza')}</td>
        <td class="p-1.5 text-right font-mono font-bold text-slate-700 align-top whitespace-nowrap">${isPartida ? '-' : formatMoney(item.precioUnitario || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// Ejecutar importación final según la opción elegida por el usuario
export async function executeImport() {
  if (!currentParsedData || !currentParsedData.items || currentParsedData.items.length === 0) {
    showToast('No hay datos para importar', 'warning');
    return;
  }

  const destRadio = document.querySelector('input[name="import-destination"]:checked');
  const destination = destRadio ? destRadio.value : 'reference'; // 'reference' o 'budget'

  const btn = document.getElementById('btn-confirm-import');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando...';
  }

  try {
    const selectedZone = document.getElementById('import-zone-select')?.value || 'z1';

    if (destination === 'reference') {
      // Guardar en la base de datos de referencia (IndexedDB)
      const hasChildren = currentParsedData.items.some(i => Array.isArray(i.children) && i.children.length > 0);
      const itemsToSave = hasChildren ? flattenTreeItems(currentParsedData.items) : currentParsedData.items;

      const catName = document.getElementById('import-cat-name')?.value || currentFileName || 'Catálogo de Referencia';
      const catCategory = document.getElementById('import-cat-category')?.value || 'General';
      const itemType = document.getElementById('import-item-type-select')?.value || 'mixto';

      const finalItems = itemsToSave.map(item => {
        let finalPrice = item.precioUnitario;
        if (item.preciosZonas && item.preciosZonas[selectedZone] !== undefined) {
          finalPrice = item.preciosZonas[selectedZone];
        }
        const overrideType = (item.tipo !== 'Partida' && itemType && itemType !== 'mixto') ? itemType : (item.tipo || 'Concepto');
        return {
          ...item,
          tipo: overrideType,
          precioUnitario: finalPrice,
          costoUnitario: finalPrice
        };
      });

      // Calcular peso estimado en bytes de la importación
      let estimatedBytes = 0;
      try {
        const jsonStr = JSON.stringify(finalItems);
        estimatedBytes = new Blob([jsonStr]).size;
      } catch (e) {
        estimatedBytes = finalItems.length * 450;
      }

      // Validar si cabe en la cuota de almacenamiento del plan del espacio de trabajo
      const quotaCheck = await canImportReferenceCatalog(estimatedBytes);
      if (!quotaCheck.allowed) {
        showToast(`No es posible importar: El catálogo (${quotaCheck.neededMb} MB) supera el límite de tu Plan ${quotaCheck.planName} (${quotaCheck.maxStorageMb} MB). Actualmente tienes en uso ${quotaCheck.currentMb} MB. Actualiza a Plan Plus o Pro para importar más catálogos.`, 'warning', 7000);
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Confirmar e Importar al Catálogo Maestro';
        }
        return;
      }

      await saveReferenceCatalog({
        name: catName,
        category: catCategory,
        type: itemType,
        sourceFileName: currentFileName
      }, finalItems, quotaCheck.ownerEmail);

      showToast(`¡Éxito! ${finalItems.length.toLocaleString()} registros guardados en el Catálogo Maestro "${catName}"`, 'success');
      closeImportModal();
      
      // Actualizar contadores si existe la ventana del catálogo abierta
      if (window.refreshMasterCatalogList) {
        window.refreshMasterCatalogList();
      }
    } else {
      // Cargar directamente al Presupuesto de Obra Activo (TAB1-CAT-BASE)
      const budgetMode = document.querySelector('input[name="budget-import-mode"]:checked')?.value || 'append';
      const importedConceptsCount = countTreeConcepts(newNodes);
      if (!guardConceptLimit(importedConceptsCount, { replaceExisting: budgetMode === 'replace' })) {
        return;
      }
      saveState();

      const hasChildren = currentParsedData.items.some(i => Array.isArray(i.children) && i.children.length > 0);
      let newNodes = [];

      if (hasChildren) {
        newNodes = convertTreeNodes(currentParsedData.items, selectedZone, null);
      } else {
        newNodes = convertFlatToTreeNodes(currentParsedData.items, selectedZone, null);
      }

      const isCustomClaves = hasCustomClaves(newNodes);
      if (isCustomClaves) {
        fillMissingClaves(newNodes);
      }

      if (budgetMode === 'replace') {
        state.treeData = newNodes;
      } else {
        state.treeData = state.treeData.concat(newNodes);
      }

      // Solo renumerar si no tenían claves personalizadas de Opus o código alfanumérico
      if (!isCustomClaves) {
        recalculateClaves(state.treeData);
      }

      // Asegurar unidad 'lote' en partidas que tienen sub-filas
      enforceParentUnits(state.treeData);

      // Seleccionar primer nodo cargado si existe
      if (newNodes.length > 0) {
        state.activeSelectedId = newNodes[0].id;
      }

      // Recalcular gran total de obra, persistir en LocalStorage y renderizar tabla
      if (currentParsedData && currentParsedData.tipoDetectado && /opus|neodata|bak/i.test(currentParsedData.tipoDetectado)) {
        state.settings.applySobrecosto = false;
        persistSettings();
        updateSobrecostoBadge();
      }
      updateGrandTotal();
      persistLocalData();
      renderTAB1();

      const counts = countRecursiveItems(newNodes);
      showToast(`¡Presupuesto actualizado! ${counts.partidas} partidas y ${counts.conceptos} conceptos cargados`, 'success');
      closeImportModal();
    }
  } catch (err) {
    console.error('Error durante la importación:', err);
    showToast(`Error al importar: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Confirmar e Importar';
    }
  }
}


// Carga directa del Catálogo Muestra - Proyecto Residencial (desde Catalogo_Muestra_Proyecto_Residencial_APU.zip) con 12 partidas y 102 conceptos exactos
export async function loadCasaLauraOpusDirectly() {
  saveState();
  let rawCopy = null;
  try {
    rawCopy = await loadSampleResidentialZipCatalog();
  } catch (e) {}
  if (!rawCopy || rawCopy.length === 0) {
    rawCopy = JSON.parse(JSON.stringify(defaultTreeData));
  }

  function ensureTreeStructure(nodes) {
    nodes.forEach(n => {
      if (!n.id) n.id = '_' + Math.random().toString(36).substr(2, 9);
      n.expanded = true;
      n.selected = true;
      if (Array.isArray(n.insumos)) {
        n.insumos.forEach(ins => {
          if (ins.cantidad !== undefined) ins.cantidad = round5(ins.cantidad);
          if (ins.costoUnitario !== undefined) ins.costoUnitario = round2(ins.costoUnitario);
        });
      }
      if (Array.isArray(n.children) && n.children.length > 0) {
        n.tipo = 'Partida';
        n.unidad = 'lote';
        n.cantidad = 1;
        n.precioUnitario = 0;
        n.costoDirecto = 0;
        ensureTreeStructure(n.children);
      }
    });
  }
  ensureTreeStructure(rawCopy);
  if (!guardConceptLimit(countTreeConcepts(rawCopy), { replaceExisting: true })) {
    return;
  }

  state.treeData = rawCopy;
  state.settings.projectName = 'Catálogo Muestra - Proyecto Residencial';
  state.settings.companyName = 'Constructora Opus México';
  state.settings.projectLocation = 'Fraccionamiento Residencial, Puebla, Pue.';
  state.settings.applySobrecosto = false;
  state.settings.currency = 'MXN';
  state.settings.currencySymbol = '$';

  // Buscar concepto CBK-RES-0001 o primer concepto disponible
  let targetId = null;
  function findConcept(nodes) {
    for (const n of nodes) {
      if (n.clave === 'CBK-RES-0001' || n.clave === 'G970110-1010') return n.id;
      if (!n.children || n.children.length === 0) {
        if (!targetId) targetId = n.id;
      } else {
        const found = findConcept(n.children);
        if (found) return found;
      }
    }
    return targetId;
  }
  state.activeSelectedId = findConcept(state.treeData);

  persistSettings();
  persistLocalData(true);
  updateSobrecostoBadge();
  updateGrandTotal();
  renderTAB1();

  if (state.activeSelectedId) {
    const selNode = findNodeById(state.treeData, state.activeSelectedId);
    if (selNode) {
      const apuClave = document.getElementById('apu-clave');
      if (apuClave) apuClave.innerText = selNode.clave || '';
      const apuTitle = document.getElementById('apu-title');
      if (apuTitle) apuTitle.innerText = selNode.descripcion || '';
    }
  }

  closeImportModal();
  showToast('¡Catálogo Muestra - Proyecto Residencial cargado con 12 partidas, 102 conceptos y matrices exactas!', 'success');
}
export const loadSampleResidentialDirectly = loadCasaLauraOpusDirectly;
