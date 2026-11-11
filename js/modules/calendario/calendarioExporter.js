// js/modules/calendario/calendarioExporter.js
// Exportación profesional del Programa de Obra Físico y Financiero a Microsoft Excel (.xlsx)

import { formatCurrency, formatNumber } from '../../core/formatters.js';
import { showToast } from '../../ui/notifications.js';
import { getActiveProjectId } from '../../config/constants.js';
import { archiveGeneratedWorkbookReport } from '../../services/s3StorageService.js';

export function exportScheduleToExcel(scheduleData, settings = {}) {
  if (typeof window.XLSX === 'undefined') {
    showToast('La biblioteca de Excel (SheetJS) no está cargada.', false);
    return;
  }

  const { items, periods, periodTotals, grandTotalObra } = scheduleData;
  const projectName = settings.projectName || 'Proyecto de Obra';
  const companyName = settings.companyName || 'Constructora';
  const currencySymbol = settings.currencySymbol || '$';

  const rows = [];

  // 1. Encabezado del Reporte Oficial
  rows.push([companyName.toUpperCase()]);
  rows.push([`PROGRAMA GENERAL DE EJECUCIÓN FÍSICO Y FINANCIERO DE LOS TRABAJOS`]);
  rows.push([`PROYECTO: ${projectName}`, '', '', '', `UBICACIÓN: ${settings.projectLocation || 'México'}`]);
  rows.push([`MONEDA: ${settings.currency || 'MXN'} (${currencySymbol})`, '', '', '', `FECHA DE EMISIÓN: ${new Date().toLocaleDateString('es-MX')}`]);
  rows.push([]); // Espacio en blanco

  // 2. Encabezados de Columnas
  const headerRow1 = ['NIVEL', 'CLAVE', 'DESCRIPCIÓN DEL CONCEPTO', 'UNIDAD', 'CANTIDAD TOTAL', 'P.U. ($)', 'IMPORTE TOTAL ($)'];
  const headerRow2 = ['', '', '', '', '', '', ''];

  periods.forEach(p => {
    headerRow1.push(p.label.toUpperCase(), '');
    headerRow2.push('CANTIDAD', 'IMPORTE ($)');
  });

  headerRow1.push('TOTAL PROGRAMADO ($)', '% POND.');
  headerRow2.push('', '');

  rows.push(headerRow1);
  rows.push(headerRow2);

  // 3. Filas de Conceptos y Partidas
  items.forEach(item => {
    if (item.tipo === 'partida') {
      const pRow = [
        'PARTIDA',
        item.clave,
        item.descripcion.toUpperCase(),
        '',
        '',
        '',
        item.totalImporte || 0
      ];

      periods.forEach(p => {
        const d = item.periodData ? item.periodData[p.key] : null;
        pRow.push('', d ? d.importe : 0);
      });

      const pctTotal = grandTotalObra > 0 ? ((item.totalImporte || 0) / grandTotalObra) * 100 : 0;
      pRow.push(item.totalImporte || 0, pctTotal.toFixed(2) + '%');
      rows.push(pRow);
    } else if (item.tipo === 'subpartida') {
      const sRow = [
        'SUBPARTIDA',
        item.clave,
        `  ${item.descripcion}`,
        '',
        '',
        '',
        item.totalImporte || 0
      ];

      periods.forEach(p => {
        const d = item.periodData ? item.periodData[p.key] : null;
        sRow.push('', d ? d.importe : 0);
      });

      const pctTotal = grandTotalObra > 0 ? ((item.totalImporte || 0) / grandTotalObra) * 100 : 0;
      sRow.push(item.totalImporte || 0, pctTotal.toFixed(2) + '%');
      rows.push(sRow);
    } else if (item.tipo === 'concepto') {
      const cRow = [
        'CONCEPTO',
        item.clave,
        `    ${item.descripcion}`,
        item.unidad,
        item.cantidad,
        item.precioUnitario,
        item.importe
      ];

      periods.forEach(p => {
        const d = item.periodData ? item.periodData[p.key] : null;
        cRow.push(d ? d.cantidad : 0, d ? d.importe : 0);
      });

      const pctTotal = grandTotalObra > 0 ? ((item.importe || 0) / grandTotalObra) * 100 : 0;
      cRow.push(item.importe, pctTotal.toFixed(2) + '%');
      rows.push(cRow);
    }
  });

  // 4. Filas Totalizadoras (Erogación mensual y acumulada)
  rows.push([]); // Separador

  const totalPeriodoRow = ['TOTALES', '', 'TOTAL DEL PERÍODO ($)', '', '', '', grandTotalObra];
  periods.forEach(p => {
    const tot = periodTotals[p.key];
    totalPeriodoRow.push('', tot ? tot.importe : 0);
  });
  totalPeriodoRow.push(grandTotalObra, '100.00%');
  rows.push(totalPeriodoRow);

  const pctPeriodoRow = ['PORCENTAJES', '', '% DE AVANCE DEL PERÍODO', '', '', '', '100.00%'];
  periods.forEach(p => {
    const tot = periodTotals[p.key];
    pctPeriodoRow.push('', tot ? tot.pctPeriodo.toFixed(2) + '%' : '0.00%');
  });
  pctPeriodoRow.push('100.00%', '');
  rows.push(pctPeriodoRow);

  const acumuladoRow = ['ACUMULADO', '', 'TOTAL ACUMULADO ($)', '', '', '', grandTotalObra];
  periods.forEach(p => {
    const tot = periodTotals[p.key];
    acumuladoRow.push('', tot ? tot.importeAcumulado : 0);
  });
  acumuladoRow.push(grandTotalObra, '100.00%');
  rows.push(acumuladoRow);

  const pctAcumuladoRow = ['% ACUMULADO', '', '% DE AVANCE ACUMULADO', '', '', '', '100.00%'];
  periods.forEach(p => {
    const tot = periodTotals[p.key];
    pctAcumuladoRow.push('', tot ? tot.pctAcumulado.toFixed(2) + '%' : '0.00%');
  });
  pctAcumuladoRow.push('100.00%', '');
  rows.push(pctAcumuladoRow);

  // Crear Workbook con SheetJS
  const ws = window.XLSX.utils.aoa_to_sheet(rows);

  // Configurar anchos de columna
  const colWidths = [
    { wch: 12 }, // Nivel
    { wch: 16 }, // Clave
    { wch: 45 }, // Descripción
    { wch: 8 },  // Unidad
    { wch: 14 }, // Cantidad Total
    { wch: 14 }, // P.U.
    { wch: 16 }  // Importe Total
  ];
  periods.forEach(() => {
    colWidths.push({ wch: 12 }, { wch: 15 });
  });
  colWidths.push({ wch: 18 }, { wch: 12 });
  ws['!cols'] = colWidths;

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Programa de Obra');

  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Programa_Obra_${safeName}.xlsx`;
  window.XLSX.writeFile(wb, filename);
  archiveGeneratedWorkbookReport(window.XLSX, wb, filename, {
    modulo: 'reportes',
    entidadId: 'cronograma_excel',
    proyectoId: getActiveProjectId(),
    metadata: { tipo: 'programa_obra' }
  });

  showToast(`Archivo Excel descargado: ${filename}`);
}
