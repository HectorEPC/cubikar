import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { calculateParentTotal, calculateParentDirectTotal } from '../../core/calculations.js';
import { recalculateClaves } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';

// Abrir modal interactivo de selección de formato de exportación
export function openExportModal() {
  const modal = document.getElementById('catalog-export-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } else {
    exportCatalogExcel();
  }
}

// Cerrar modal de exportación
export function closeExportModal() {
  const modal = document.getElementById('catalog-export-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Helper: recolectar ítems aplanados con indentación, jerarquía y niveles
function getFlattenedCatalogRows() {
  const rows = [];
  function traverse(nodes, level = 1, parentPath = '') {
    nodes.forEach((n, idx) => {
      const isParent = Boolean(n.children && n.children.length > 0);
      const rowTotal = isParent ? calculateParentTotal(n) : ((n.cantidad || 0) * (n.precioUnitario || 0));
      const rowDirectTotal = isParent ? calculateParentDirectTotal(n) : ((n.cantidad || 0) * (n.costoUnitario || n.precioUnitario || 0));
      const currentPath = parentPath ? `${parentPath} > ${n.descripcion || ''}` : (n.descripcion || '');

      rows.push({
        node: n,
        level: level,
        isParent: isParent,
        clave: n.clave || `ITEM-${level}-${idx + 1}`,
        descripcion: n.descripcion || '',
        unidad: isParent ? (n.unidad || '') : (n.unidad || 'pza'),
        cantidad: isParent ? 0 : (n.cantidad || 0),
        precioUnitario: isParent ? 0 : (n.precioUnitario || 0),
        costoUnitario: isParent ? 0 : (n.costoUnitario || n.precioUnitario || 0),
        total: rowTotal,
        directTotal: rowDirectTotal,
        path: currentPath,
        tipo: isParent ? 'Agrupador' : (n.tipo || 'Concepto'),
        familia: n.familia || '',
        selected: n.selected ? 'Sí' : 'No'
      });

      if (isParent) {
        traverse(n.children, level + 1, currentPath);
      }
    });
  }

  traverse(state.treeData || []);
  return rows;
}

// Helper: sanitizar nombres de archivo
function getSafeProjectFilename(suffix = '') {
  const projectName = (state.projectName || state.proyecto?.nombre || 'Presupuesto_Catalogo')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${projectName}_${suffix ? suffix + '_' : ''}${dateStr}`;
}

// 1. Exportación Estándar a Microsoft Excel (.xlsx) con formato ejecutivo membretado
export function exportCatalogExcel() {
  try {
    if (typeof window.XLSX === 'undefined') {
      showToast('Librería XLSX no cargada. Exportando a CSV...', 'warning');
      exportCatalogCsv();
      return;
    }

    const flatRows = getFlattenedCatalogRows();
    if (!flatRows || flatRows.length === 0) {
      showToast('El catálogo está vacío. No hay datos para exportar.', 'warning');
      return;
    }

    const projectName = state.projectName || state.proyecto?.nombre || 'Presupuesto de Obra';
    const clientName = state.clientName || state.proyecto?.cliente || '';
    const currency = state.settings?.currency || 'MXN';

    const sheetData = [];

    // Encabezado Membretado Oficial
    sheetData.push(['SISTEMA INTEGRAL DE CONTROL DE OBRA Y PRESUPUESTOS']);
    sheetData.push(['CATÁLOGO DE CONCEPTOS Y PRESUPUESTO BASE']);
    sheetData.push(['PROYECTO:', projectName]);
    if (clientName) sheetData.push(['CLIENTE:', clientName]);
    sheetData.push(['FECHA DE EMISIÓN:', new Date().toLocaleDateString('es-MX'), 'MONEDA:', currency]);
    sheetData.push([]); // Renglón de separación

    // Encabezados de Columna
    sheetData.push(['Nivel', 'Clave', 'Descripción del Concepto / Partida', 'Unidad', 'Cantidad', 'Precio Unitario', 'Importe Total', 'Tipo']);

    // Filas de Datos
    let grandTotal = 0;
    flatRows.forEach(item => {
      const indent = '  '.repeat(Math.max(0, item.level - 1));
      const descFormatted = item.isParent ? `${indent}📁 ${item.descripcion.toUpperCase()}` : `${indent}${item.descripcion}`;
      
      sheetData.push([
        item.level,
        item.clave,
        descFormatted,
        item.unidad,
        item.isParent ? '' : item.cantidad,
        item.isParent ? '' : item.precioUnitario,
        item.total,
        item.tipo
      ]);

      if (item.level === 1) {
        grandTotal += item.total;
      }
    });

    sheetData.push([]);
    sheetData.push(['', '', 'TOTAL GENERAL DEL PRESUPUESTO', '', '', '', grandTotal, '']);

    const ws = window.XLSX.utils.aoa_to_sheet(sheetData);
    ws['!cols'] = [
      { wch: 8 },   // Nivel
      { wch: 18 },  // Clave
      { wch: 60 },  // Descripción
      { wch: 10 },  // Unidad
      { wch: 14 },  // Cantidad
      { wch: 16 },  // Precio Unitario
      { wch: 18 },  // Importe Total
      { wch: 14 }   // Tipo
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto');

    const filename = `${getSafeProjectFilename('Excel')}.xlsx`;
    window.XLSX.writeFile(wb, filename);

    closeExportModal();
    showToast(`Presupuesto exportado a Excel (${flatRows.length} ítems)`, 'success');
  } catch (error) {
    console.error('Error al exportar catálogo a Excel:', error);
    showToast('Error al generar archivo Excel.', 'error');
  }
}

// 2. Exportación de Paquete de Restauración OPUS (.zip con base .bak y matrices APU)
export async function exportCatalogOpusZip() {
  try {
    const flatRows = getFlattenedCatalogRows();
    if (!flatRows || flatRows.length === 0) {
      showToast('El catálogo está vacío.', 'warning');
      return;
    }

    if (!window.JSZip) {
      showToast('Librería JSZip no encontrada. Exportando en Excel/Opus...', 'warning');
      exportCatalogExcel();
      return;
    }

    showToast('Generando paquete de restauración Opus (.zip)...', 'info');
    const zip = new window.JSZip();
    const projectName = (state.projectName || state.proyecto?.nombre || 'Obra_Opus')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();

    // A. Archivo de base de datos binaria .bak de Opus
    let bakAttached = false;
    try {
      const templateRes = await fetch('data/opus_backup_template.zip');
      if (templateRes.ok) {
        const templateBlob = await templateRes.arrayBuffer();
        const templateZip = await window.JSZip.loadAsync(templateBlob);
        const bakKey = Object.keys(templateZip.files).find(k => k.endsWith('.bak'));
        if (bakKey) {
          const bakData = await templateZip.file(bakKey).async('uint8array');
          zip.file(`${projectName}.bak`, bakData);
          bakAttached = true;
        }
      }
    } catch (e) {
      console.warn('[OpusZip] Aviso al cargar template .bak:', e);
    }

    // B. Libro Excel de doble hoja: HojaPresupuesto + DesgloseMatricesAPU
    if (typeof window.XLSX !== 'undefined') {
      const wb = window.XLSX.utils.book_new();

      // Hoja 1: HojaPresupuesto (Catálogo jerárquico normalizado para Opus)
      const presRows = [
        ['Nivel', 'Clave', 'Descripcion', 'Unidad', 'Cantidad', 'CostoUnitario', 'PrecioUnitario', 'Importe', 'Tipo']
      ];
      flatRows.forEach(item => {
        presRows.push([
          item.level,
          item.clave,
          item.descripcion,
          item.unidad,
          item.isParent ? '' : item.cantidad,
          item.isParent ? '' : item.costoUnitario,
          item.isParent ? '' : item.precioUnitario,
          item.total,
          item.isParent ? 'Partida' : 'Concepto'
        ]);
      });
      const wsPres = window.XLSX.utils.aoa_to_sheet(presRows);
      wsPres['!cols'] = [
        { wch: 8 }, { wch: 20 }, { wch: 65 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }
      ];
      window.XLSX.utils.book_append_sheet(wb, wsPres, 'HojaPresupuesto');

      // Hoja 2: DesgloseMatricesAPU (Matrices completas con todos sus insumos)
      const matrixRows = [
        ['ClaveConcepto', 'Concepto', 'ClaveInsumo', 'DescripcionInsumo', 'TipoInsumo', 'Unidad', 'CantidadRendimiento', 'CostoUnitario', 'Importe']
      ];
      flatRows.forEach(item => {
        if (!item.isParent && item.node && Array.isArray(item.node.insumos) && item.node.insumos.length > 0) {
          item.node.insumos.forEach(ins => {
            const insCant = ins.cantidad || 0;
            const insCost = ins.costoUnitario || ins.precioUnitario || 0;
            const insImporte = Math.round((insCant * insCost + Number.EPSILON) * 100) / 100;
            matrixRows.push([
              item.clave,
              item.descripcion,
              ins.clave || '',
              ins.descripcion || '',
              ins.tipo || 'Material',
              ins.unidad || 'pza',
              insCant,
              insCost,
              insImporte
            ]);
          });
        }
      });
      const wsMatrix = window.XLSX.utils.aoa_to_sheet(matrixRows);
      wsMatrix['!cols'] = [
        { wch: 18 }, { wch: 45 }, { wch: 18 }, { wch: 45 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }
      ];
      window.XLSX.utils.book_append_sheet(wb, wsMatrix, 'DesgloseMatricesAPU');

      const xlsxBuffer = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file(`${projectName}_HojaPresupuesto_Matrices.xlsx`, xlsxBuffer);
    }

    // C. Archivo de intercambio opus_project_structure.json
    const projectExportPayload = {
      sistema: 'cubikar / Opus Exchanger',
      versionOpusCompatible: 'Opus 2014-2024 (.zip restore package)',
      fechaExportacion: new Date().toISOString(),
      proyecto: {
        nombre: projectName,
        cliente: state.clientName || state.proyecto?.cliente || '',
        moneda: state.settings?.currency || 'MXN',
        totalPresupuesto: flatRows.filter(r => r.level === 1).reduce((acc, r) => acc + r.total, 0)
      },
      arbolPresupuesto: state.treeData
    };
    zip.file('opus_project_structure.json', JSON.stringify(projectExportPayload, null, 2));

    // D. Instrucciones oficiales LEEME_INSTRUCCIONES_OPUS.txt
    const readmeContent = `PAQUETE DE RESTAURACIÓN / IMPORTACIÓN OPUS
Proyecto: ${projectName}
Fecha: ${new Date().toLocaleString('es-MX')}

INSTRUCCIONES DE USO EN OPUS:
1. RESTAURACIÓN AUTOMÁTICA EN OPUS:
   - En OPUS, dirígete a: Menú Proyecto > Copia de seguridad > Restaurar.
   - Selecciona directamente este archivo .zip o el archivo "${projectName}.bak".
   - El sistema de base de datos registrará la obra completa en tu catálogo de obras.

2. IMPORTACIÓN DIRECTA DESDE EXCEL:
   - Abre o crea una obra en OPUS.
   - Ve a Menú Proyecto > Importar > Excel y selecciona el archivo "${projectName}_HojaPresupuesto_Matrices.xlsx".
   - En el asistente, mapea las columnas y activa "Copiar clave de renglón como clave de la matriz".
   - Todo tu catálogo y desgloses quedarán sincronizados.`;
    zip.file('LEEME_INSTRUCCIONES_OPUS.txt', readmeContent);

    // Descarga automática del archivo ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${getSafeProjectFilename('Respaldo_OPUS')}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);

    closeExportModal();
    showToast(`Paquete Opus (.zip con ${bakAttached ? '.bak y matrices' : 'matrices'}) generado con éxito`, 'success');
  } catch (error) {
    console.error('Error generando paquete Opus ZIP:', error);
    showToast('Error al generar paquete de restauración Opus.', 'error');
  }
}

// 3. Exportación de Paquete de Intercambio NEODATA (.zip con presupuesto y matrices APU)
export async function exportCatalogNeodataZip() {
  try {
    const flatRows = getFlattenedCatalogRows();
    if (!flatRows || flatRows.length === 0) {
      showToast('El catálogo está vacío.', 'warning');
      return;
    }

    if (!window.JSZip) {
      showToast('Librería JSZip no encontrada. Exportando en Excel...', 'warning');
      exportCatalogExcel();
      return;
    }

    showToast('Generando paquete de intercambio Neodata (.zip)...', 'info');
    const zip = new window.JSZip();
    const projectName = (state.projectName || state.proyecto?.nombre || 'Obra_Neodata')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();

    // A. Libro Excel con hojas duales: Presupuesto + Matrices_APU
    if (typeof window.XLSX !== 'undefined') {
      const wb = window.XLSX.utils.book_new();

      // Hoja Presupuesto
      const presRows = [
        ['Código', 'Nivel', 'Descripción', 'Unidad', 'Cantidad', 'P.U.', 'Importe', 'Familia']
      ];
      flatRows.forEach(item => {
        presRows.push([
          item.clave,
          item.level,
          item.descripcion,
          item.unidad,
          item.isParent ? '' : item.cantidad,
          item.isParent ? '' : item.precioUnitario,
          item.total,
          item.familia || (item.isParent ? 'PARTIDA' : 'CONCEPTO')
        ]);
      });
      const wsPres = window.XLSX.utils.aoa_to_sheet(presRows);
      wsPres['!cols'] = [
        { wch: 20 }, { wch: 8 }, { wch: 65 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 15 }
      ];
      window.XLSX.utils.book_append_sheet(wb, wsPres, 'Presupuesto');

      // Hoja Matrices_APU
      const matrixRows = [
        ['Código Concepto', 'Descripción Concepto', 'Código Insumo', 'Descripción Insumo', 'Tipo Insumo', 'Unidad', 'Cantidad / Rend.', 'Costo Directo', 'Importe']
      ];
      flatRows.forEach(item => {
        if (!item.isParent && item.node && Array.isArray(item.node.insumos) && item.node.insumos.length > 0) {
          item.node.insumos.forEach(ins => {
            const insCant = ins.cantidad || 0;
            const insCost = ins.costoUnitario || ins.precioUnitario || 0;
            const insImporte = Math.round((insCant * insCost + Number.EPSILON) * 100) / 100;
            matrixRows.push([
              item.clave,
              item.descripcion,
              ins.clave || '',
              ins.descripcion || '',
              ins.tipo || 'Material',
              ins.unidad || 'pza',
              insCant,
              insCost,
              insImporte
            ]);
          });
        }
      });
      const wsMatrix = window.XLSX.utils.aoa_to_sheet(matrixRows);
      wsMatrix['!cols'] = [
        { wch: 20 }, { wch: 45 }, { wch: 20 }, { wch: 45 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }
      ];
      window.XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matrices_APU');

      const xlsxBuffer = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file(`${projectName}_Presupuesto_Matrices_Neodata.xlsx`, xlsxBuffer);
    }

    // B. Archivo neodata_exchange_data.json
    const neodataExportPayload = {
      tipoArchivo: 'Paquete de Intercambio Neodata PU',
      obra: {
        nombre: projectName,
        cliente: state.clientName || state.proyecto?.cliente || '',
        moneda: state.settings?.currency || 'MXN',
        fecha: new Date().toLocaleDateString('es-MX')
      },
      presupuesto: flatRows.map(r => ({
        codigo: r.clave,
        nivel: r.level,
        esPartida: r.isParent,
        descripcion: r.descripcion,
        unidad: r.unidad,
        cantidad: r.cantidad,
        precioUnitario: r.precioUnitario,
        costoDirecto: r.costoUnitario,
        importe: r.total,
        insumos: (!r.isParent && r.node && r.node.insumos) ? r.node.insumos : []
      }))
    };
    zip.file('neodata_exchange_data.json', JSON.stringify(neodataExportPayload, null, 2));

    // C. Instrucciones LEEME_INSTRUCCIONES_NEODATA.txt
    const readmeNeodata = `PAQUETE DE INTERCAMBIO / RESTAURACIÓN NEODATA
Proyecto: ${projectName}
Fecha: ${new Date().toLocaleString('es-MX')}

INSTRUCCIONES EN NEODATA PRECIOS UNITARIOS:
1. En Neodata, abre o crea el catálogo de obra correspondiente.
2. Ingresa a Menú > Importar / Exportar > Archivo de Intercambio o Importar desde Excel.
3. Carga el archivo "${projectName}_Presupuesto_Matrices_Neodata.xlsx" o el paquete .zip.
4. Las partidas, conceptos y matrices de análisis quedarán asignadas a sus respectivas claves.`;
    zip.file('LEEME_INSTRUCCIONES_NEODATA.txt', readmeNeodata);

    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const zipUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${getSafeProjectFilename('Intercambio_NEODATA')}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);

    closeExportModal();
    showToast('Paquete de intercambio Neodata (.zip) generado con éxito', 'success');
  } catch (error) {
    console.error('Error generando paquete Neodata ZIP:', error);
    showToast('Error al generar paquete Neodata.', 'error');
  }
}

// Aliases para llamadas desde modal
export function exportCatalogOpus() {
  exportCatalogOpusZip();
}

export function exportCatalogNeodata() {
  exportCatalogNeodataZip();
}

// 4. Exportación Tradicional a CSV
export function exportCatalogCsv() {
  const flatRows = getFlattenedCatalogRows();
  if (!flatRows || flatRows.length === 0) {
    showToast('El catálogo está vacío.', 'warning');
    return;
  }

  // Se añade BOM UTF-8 (\uFEFF) para que Excel reconozca acentos y caracteres especiales automáticamente
  let csvContent = "\uFEFFNivel,Clave,Descripcion,Unidad,Cantidad,PrecioUnitario,Total,Seleccionado\n";
  flatRows.forEach(item => {
    const descEscaped = (item.descripcion || '').replace(/"/g, '""');
    csvContent += `"${item.level}","${item.clave}","${descEscaped}","${item.unidad}",${item.cantidad},${item.precioUnitario},${item.total},"${item.selected}"\n`;
  });

  downloadFile(csvContent, `${getSafeProjectFilename('Estandar')}.csv`, 'text/csv;charset=utf-8;');
  closeExportModal();
  showToast('Presupuesto exportado a CSV', 'success');
}

// Función auxiliar para descargar archivos generados en cliente
function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Compatibilidad con invocación original exportData()
export function exportData() {
  openExportModal();
}

// Importación y parsing de archivo CSV con reconstrucción de árbol jerárquico
export function importData(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        showToast('El archivo CSV está vacío o no es válido', 'error');
        return;
      }

      function parseCsvRow(rowText) {
        let fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < rowText.length; i++) {
          let char = rowText[i];
          if (char === '"') {
            if (inQuotes && rowText[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current.trim());
        return fields;
      }

      saveState();
      const parsedTree = [];
      const stack = []; // Stack con { level, node }

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvRow(lines[i]);
        if (cols.length < 4) continue;

        const level = parseInt(cols[0]) || 1;
        const clave = cols[1] || '';
        const desc = cols[2] || 'Concepto importado';
        const unid = cols[3] || 'pza';
        const cant = parseFloat(cols[4]) || 0;
        const pu = parseFloat(cols[5]) || 0;
        const sel = cols[7] ? cols[7].toLowerCase().includes('s') : false;

        const newNode = {
          id: 'imp_' + Date.now() + '_' + i,
          clave: clave,
          descripcion: desc,
          unidad: unid,
          cantidad: cant,
          precioUnitario: pu,
          selected: sel,
          children: []
        };

        if (level === 1) {
          parsedTree.push(newNode);
          stack.length = 0;
          stack.push({ level: 1, node: newNode });
        } else {
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }

          if (stack.length > 0) {
            const parent = stack[stack.length - 1].node;
            if (!parent.children) parent.children = [];
            parent.children.push(newNode);
          } else {
            parsedTree.push(newNode);
          }
          stack.push({ level: level, node: newNode });
        }
      }

      state.treeData = parsedTree;
      recalculateClaves();
      renderTAB1();
      persistLocalData();
      showToast(`CSV importado con éxito (${lines.length - 1} renglones)`, 'success');
    } catch (err) {
      console.error('Error importando CSV:', err);
      showToast('Error al procesar el archivo CSV', 'error');
    }
  };
  reader.readAsText(file);
}

// Importación y parsing de archivo CSV con reconstrucción de árbol jerárquico
export function importData(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length < 2) {
        showToast('El archivo CSV está vacío o no es válido', 'error');
        return;
      }

      function parseCsvRow(rowText) {
        let fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < rowText.length; i++) {
          let char = rowText[i];
          if (char === '"') {
            if (inQuotes && rowText[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current.trim());
        return fields;
      }

      saveState();
      const parsedTree = [];
      const stack = []; // Stack con { level, node }

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvRow(lines[i]);
        if (cols.length < 4) continue;

        const level = parseInt(cols[0]) || 1;
        const clave = cols[1] || '';
        const desc = cols[2] || 'Concepto importado';
        const unid = cols[3] || 'pza';
        const cant = Math.round(((parseFloat(cols[4]) || 1) + Number.EPSILON) * 100) / 100;
        const pu = Math.round(((parseFloat(cols[5]) || 0) + Number.EPSILON) * 100) / 100;
        const isSel = (cols[7] || '').toLowerCase().includes('s');

        const newNode = {
          id: '_' + Math.random().toString(36).substr(2, 9),
          clave: clave,
          descripcion: desc,
          unidad: unid,
          cantidad: cant,
          precioUnitario: pu,
          costoDirecto: pu,
          expanded: true,
          selected: isSel,
          insumos: [],
          children: []
        };

        if (level === 1) {
          parsedTree.push(newNode);
          stack.length = 0;
          stack.push({ level: 1, node: newNode });
        } else {
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }

          if (stack.length > 0) {
            stack[stack.length - 1].node.children.push(newNode);
          } else {
            parsedTree.push(newNode);
          }
          stack.push({ level: level, node: newNode });
        }
      }

      state.treeData = parsedTree;
      recalculateClaves(state.treeData);
      persistLocalData();
      renderTAB1();
      showToast(`CSV importado con éxito (${lines.length - 1} renglones)`, 'success');
    } catch (err) {
      console.error('Error importando CSV:', err);
      showToast('Error al procesar el archivo CSV', 'error');
    } finally {
      if (event.target) event.target.value = '';
    }
  };
  reader.readAsText(file);
}
