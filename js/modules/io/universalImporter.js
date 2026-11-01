// js/modules/io/universalImporter.js
// Importador Universal compatible con .xlsx, .xls, .csv, .json

import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney, round2 } from '../../core/formatters.js';
import { recalculateClaves } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { saveReferenceCatalog, getReferenceDatabaseStats } from '../reference/referenceDb.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import { parseOpusOrNeodataFile } from './opusNeodataImporter.js';

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

// Analizar y mapear filas a un formato estándar
export function parseSheetData(rawRows, fileName = '') {
  if (!rawRows || rawRows.length === 0) return null;

  // Buscar fila de encabezados dentro de las primeras 10 filas
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
    familia: -1,
    tipo: -1
  };

  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const rowNorm = row.map(cell => normalizeColName(cell));

    // Comprobamos si esta fila contiene indicadores de encabezado
    const hasDesc = rowNorm.some(c => c.includes('descrip') || c.includes('concepto') || c.includes('detalle'));
    const hasClave = rowNorm.some(c => c.includes('clave') || c.includes('codigo') || c === 'c' || c === 'id');
    const hasPrecio = rowNorm.some(c => c.includes('costo') || c.includes('precio') || c.includes('pu') || c.includes('importe'));

    if ((hasDesc && hasPrecio) || (hasDesc && hasClave)) {
      headerIndex = r;
      headers = row;
      rowNorm.forEach((c, idx) => {
        if (colMap.nivel === -1 && (c === 'nivel' || c === 'level' || c === 'niv')) colMap.nivel = idx;
        if (colMap.clave === -1 && (c === 'clave' || c === 'codigo' || c === 'cve' || c === 'id' || c === 'partida' || c === 'c')) colMap.clave = idx;
        if (colMap.descripcion === -1 && (c.includes('descrip') || c.includes('concepto') || c.includes('detalle') || c === 'nombre')) colMap.descripcion = idx;
        if (colMap.unidad === -1 && (c === 'unidad' || c === 'unid' || c === 'um' || c === 'medida')) colMap.unidad = idx;
        if (colMap.cantidad === -1 && (c === 'cantidad' || c === 'cant' || c === 'volumen')) colMap.cantidad = idx;
        if (colMap.precioZ1 === -1 && c.includes('precioz1')) colMap.precioZ1 = idx;
        if (colMap.precioZ2 === -1 && c.includes('precioz2')) colMap.precioZ2 = idx;
        if (colMap.precioZ3 === -1 && c.includes('precioz3')) colMap.precioZ3 = idx;
        if (colMap.precio === -1 && (c.includes('costounitario') || c.includes('preciounitario') || c === 'costo' || c === 'precio' || c === 'pu' || c.includes('puot'))) colMap.precio = idx;
        if (colMap.familia === -1 && (c.includes('familia') || c.includes('categoria') || c.includes('grupo') || c.includes('rubro'))) colMap.familia = idx;
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

    // Extraer descripción
    const desc = colMap.descripcion !== -1 ? String(row[colMap.descripcion] || '').trim() : '';
    const clave = colMap.clave !== -1 ? String(row[colMap.clave] || '').trim() : '';

    if (!desc && !clave) continue; // Omitir filas en blanco

    // Extraer unidad
    const unid = colMap.unidad !== -1 ? String(row[colMap.unidad] || '').trim() : 'pza';

    // Extraer cantidad
    let cant = 1.00;
    if (colMap.cantidad !== -1 && row[colMap.cantidad] !== undefined) {
      cant = round2(parseFloat(String(row[colMap.cantidad]).replace(/[^0-9.-]+/g, '')) || 1);
    }

    // Extraer precio
    let precio = 0.00;
    let preciosZonas = null;

    if (colMap.precioZ1 !== -1) {
      const z1 = round2(parseFloat(String(row[colMap.precioZ1] || '').replace(/[^0-9.-]+/g, '')) || 0);
      const z2 = colMap.precioZ2 !== -1 ? (round2(parseFloat(String(row[colMap.precioZ2] || '').replace(/[^0-9.-]+/g, '')) || z1)) : z1;
      const z3 = colMap.precioZ3 !== -1 ? (round2(parseFloat(String(row[colMap.precioZ3] || '').replace(/[^0-9.-]+/g, '')) || z2)) : z2;
      preciosZonas = { z1, z2, z3 };
      precio = z1;
    } else if (colMap.precio !== -1 && row[colMap.precio] !== undefined) {
      precio = round2(parseFloat(String(row[colMap.precio]).replace(/[^0-9.-]+/g, '')) || 0);
    }

    // Extraer nivel jerárquico si existe
    let nivel = 1;
    if (colMap.nivel !== -1 && row[colMap.nivel] !== undefined) {
      nivel = parseInt(row[colMap.nivel]) || 1;
    }

    const familia = colMap.familia !== -1 ? String(row[colMap.familia] || '').trim() : '';

    items.push({
      nivel,
      clave,
      descripcion: desc,
      unidad: unid || 'pza',
      cantidad: cant,
      precioUnitario: precio,
      costoUnitario: precio,
      preciosZonas,
      familia,
      tipo: defaultTipo
    });
  }

  return {
    detectedTypeLabel,
    defaultTipo,
    hasZones: colMap.precioZ1 !== -1,
    hasLevels: colMap.nivel !== -1,
    items,
    totalRows: items.length
  };
}

// Abrir el selector de archivos desde cualquier botón
export function openImportModal() {
  const modal = document.getElementById('universal-import-modal');
  if (modal) {
    resetImportModalUI();
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

function resetImportModalUI() {
  currentParsedData = null;
  currentWorkbook = null;
  currentFileName = '';

  const dropZone = document.getElementById('import-dropzone');
  const previewSection = document.getElementById('import-preview-section');
  const fileInput = document.getElementById('universal-file-input');
  
  if (dropZone) dropZone.classList.remove('hidden');
  if (previewSection) previewSection.classList.add('hidden');
  if (fileInput) fileInput.value = '';
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
      displayParsedPreview({
        detectedTypeLabel: parsed.tipoDetectado || 'Base Opus / Neodata',
        defaultTipo: 'Concepto',
        hasZones: false,
        hasLevels: false,
        items: parsed.items,
        totalRows: parsed.items.length
      }, file.name);
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

  const countEl = document.getElementById('import-rows-count-badge');
  if (countEl) countEl.textContent = `${parsedData.totalRows.toLocaleString()} registros detectados`;

  const typeEl = document.getElementById('import-detected-type');
  if (typeEl) typeEl.textContent = parsedData.detectedTypeLabel;

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

  // Renderizar tabla de muestra (primeras 5 filas)
  const tbody = document.getElementById('import-preview-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    const sample = parsedData.items.slice(0, 5);
    sample.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100 text-[11px]';
      const hasMatrix = Array.isArray(item.insumos) && item.insumos.length > 0;
      tr.innerHTML = `
        <td class="p-1.5 font-mono text-blue-700 font-semibold align-top whitespace-nowrap">${item.clave || '-'}</td>
        <td class="p-1.5 text-slate-800 align-top">
          <div class="line-clamp-2 leading-snug" title="${item.descripcion}">${item.descripcion || '-'}</div>
          ${hasMatrix ? `<div class="mt-1"><span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-sans text-[9px] inline-flex items-center gap-1 font-semibold"><i class="fa-solid fa-layer-group text-[8px]"></i> Matriz integrada (${item.insumos.length} insumos)</span></div>` : ''}
        </td>
        <td class="p-1.5 text-center font-mono align-top">${item.unidad || 'pza'}</td>
        <td class="p-1.5 text-right font-mono font-bold text-slate-700 align-top whitespace-nowrap">${formatMoney(item.precioUnitario || 0)}</td>
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
    // Si tiene selector de zona de gobierno (Z1, Z2, Z3)
    const selectedZone = document.getElementById('import-zone-select')?.value || 'z1';
    const finalItems = currentParsedData.items.map(item => {
      let finalPrice = item.precioUnitario;
      if (item.preciosZonas && item.preciosZonas[selectedZone] !== undefined) {
        finalPrice = item.preciosZonas[selectedZone];
      }
      const overrideType = document.getElementById('import-item-type-select')?.value || item.tipo;
      return {
        ...item,
        tipo: overrideType,
        precioUnitario: finalPrice,
        costoUnitario: finalPrice
      };
    });

    if (destination === 'reference') {
      // Guardar en la base de datos de referencia (IndexedDB)
      const catName = document.getElementById('import-cat-name')?.value || currentFileName || 'Catálogo de Referencia';
      const catCategory = document.getElementById('import-cat-category')?.value || 'General';
      const itemType = document.getElementById('import-item-type-select')?.value || 'mixto';

      await saveReferenceCatalog({
        name: catName,
        category: catCategory,
        type: itemType,
        sourceFileName: currentFileName
      }, finalItems);

      showToast(`¡Éxito! ${finalItems.length.toLocaleString()} registros guardados en el Catálogo Maestro "${catName}"`, 'success');
      closeImportModal();
      
      // Actualizar contadores si existe la ventana del catálogo abierta
      if (window.refreshMasterCatalogList) {
        window.refreshMasterCatalogList();
      }
    } else {
      // Cargar directamente al Presupuesto de Obra Activo (TAB1-CAT-BASE)
      const budgetMode = document.querySelector('input[name="budget-import-mode"]:checked')?.value || 'append'; // 'replace' o 'append'

      saveState();

      if (budgetMode === 'replace') {
        state.treeData = [];
      }

      // Convertir items planos a nodos jerárquicos
      const newNodes = [];
      const stack = [];

      finalItems.forEach(item => {
        const level = item.nivel || 1;
        const integratedInsumos = (Array.isArray(item.insumos) && item.insumos.length > 0)
          ? JSON.parse(JSON.stringify(item.insumos))
          : generateIntegratedMatrixForConcept(item);

        const newNode = {
          id: '_' + Math.random().toString(36).substr(2, 9),
          clave: item.clave || '',
          descripcion: item.descripcion || 'Concepto importado',
          unidad: item.unidad || 'pza',
          cantidad: item.cantidad || 1,
          precioUnitario: item.precioUnitario || 0,
          costoDirecto: item.costoUnitario || item.precioUnitario || 0,
          expanded: true,
          selected: true,
          insumos: integratedInsumos,
          children: []
        };

        if (level === 1) {
          newNodes.push(newNode);
          stack.length = 0;
          stack.push({ level: 1, node: newNode });
        } else {
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }
          if (stack.length > 0) {
            stack[stack.length - 1].node.children.push(newNode);
          } else {
            newNodes.push(newNode);
          }
          stack.push({ level, node: newNode });
        }
      });

      if (budgetMode === 'replace') {
        state.treeData = newNodes;
      } else {
        state.treeData = state.treeData.concat(newNodes);
      }

      recalculateClaves(state.treeData);
      persistLocalData();
      renderTAB1();

      showToast(`Presupuesto actualizado: ${finalItems.length.toLocaleString()} conceptos cargados`, 'success');
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
