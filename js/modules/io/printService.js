// js/modules/io/printService.js
// Servicio de Impresión de Formatos Profesionales para TAB1-CAT-BASE y MATRIZ / INSUMOS UNITARIOS

import { state } from '../../state/store.js';
import { formatMoney, formatCurrency, formatQty, formatMatrixQty, getCurrencySymbol, getCurrencyCode, round2, round5 } from '../../core/formatters.js';
import { getFactorSobrecosto, calculateParentTotal, calculateParentDirectTotal } from '../../core/calculations.js';
import { findNodeById } from '../catalog/treeService.js';
import { showToast } from '../../ui/notifications.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import { getConsolidatedDataMap } from '../insumosGenerales/insumosConsolidator.js';
import {
  extractScheduleItems,
  getScheduleSettings,
  generateTimePeriods,
  calculateScheduleDistribution,
  ensureInitialDates,
  parseDate,
  formatDate,
  diffDays,
  addDays,
  getGanttTodayDate,
  getWorkdaysSettings,
  getDateWorkdayInfo
} from '../calendario/calendarioModel.js';
import { getEstimacionesCalculatedData } from '../estimaciones/estimacionesModel.js';
import { resolveManagedFileDataUrl } from '../../services/s3StorageService.js';
import { resolveActivePrintBranding } from './printBrandingService.js';
import { getBudgetSignatures } from '../catalog/signaturesModal.js';

// Escapar caracteres especiales en texto HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Estilos CSS compartidos optimizados para impresión estándar (Carta / A4)
const PRINT_BASE_STYLES = `
  @page {
    size: letter portrait;
    margin: 12mm 12mm 15mm 12mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    background-color: #f8fafc;
    margin: 0;
    padding: 0;
    font-size: 9pt;
    line-height: 1.4;
  }
  .no-print {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #0f172a;
    color: #ffffff;
    padding: 10px 20px;
    position: sticky;
    top: 0;
    z-index: 9999;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
  }
  .no-print button {
    cursor: pointer;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.15s ease;
  }
  .btn-print {
    background-color: #2563eb;
    color: white;
  }
  .btn-print:hover {
    background-color: #1d4ed8;
  }
  .btn-close {
    background-color: #334155;
    color: #e2e8f0;
  }
  .btn-close:hover {
    background-color: #475569;
  }
  .page-container {
    max-width: 960px;
    margin: 20px auto;
    background-color: #ffffff;
    padding: 30px 35px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
    border-radius: 8px;
  }
  @media print {
    body {
      background-color: #ffffff !important;
    }
    .no-print {
      display: none !important;
    }
    .page-container {
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border-radius: 0 !important;
    }
    .page-break {
      page-break-before: always;
      break-before: page;
    }
  }
  /* Tablas de Reporte */
  table.report-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    margin-bottom: 12px;
    font-size: 8pt;
  }
  table.report-table thead {
    display: table-header-group;
  }
  table.report-table tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  table.report-table th {
    background-color: #f1f5f9 !important;
    color: #334155;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 7.5pt;
    border: 1px solid #cbd5e1;
    padding: 6px 8px;
    letter-spacing: 0.02em;
  }
  table.report-table td {
    border: 1px solid #cbd5e1;
    padding: 5px 7px;
    vertical-align: top;
  }
  .text-justify {
    text-align: justify !important;
    text-justify: inter-word !important;
    hyphens: auto;
    word-break: break-word;
  }
  .font-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  }
  .font-bold {
    font-weight: 700 !important;
  }
  .text-center { text-align: center !important; }
  .text-right { text-align: right !important; }
  .text-left { text-align: left !important; }
  
  /* Bloques de encabezado y firmas */
  .doc-header {
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .doc-title {
    font-size: 12pt;
    font-weight: 900;
    color: #0f172a;
    margin: 0;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
  .doc-subtitle {
    font-size: 10pt;
    font-weight: 600;
    color: #475569;
    margin: 0;
  }
  .doc-meta {
    text-align: right;
    font-size: 8pt;
    color: #64748b;
    line-height: 1.4;
  }
  .meta-tag {
    display: inline-block;
    padding: 2px 7px;
    background-color: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    font-weight: 600;
    color: #334155;
    margin-top: 3px;
  }
  .concept-card {
    background-color: #f8fafc;
    border: 1px solid #cbd5e1;
    border-left: 4px solid #2563eb;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 14px;
  }
  .section-banner {
    background-color: #0f172a;
    color: #ffffff;
    padding: 6px 12px;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-radius: 4px 4px 0 0;
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .rubro-row {
    background-color: #e2e8f0 !important;
    font-weight: 700;
    color: #1e293b;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .summary-card {
    margin-top: 10px;
    margin-left: auto;
    width: 320px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    overflow: hidden;
    font-size: 8.5pt;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 10px;
    border-bottom: 1px solid #e2e8f0;
  }
  .summary-row:last-child {
    border-bottom: none;
  }
  .summary-total {
    background-color: #f1f5f9;
    font-weight: 800;
    font-size: 10pt;
    color: #0f172a;
    border-top: 2px solid #cbd5e1;
  }
  .signatures-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 35px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .signature-box {
    text-align: center;
    border-top: 1px solid #94a3b8;
    padding-top: 8px;
    font-size: 8pt;
    color: #475569;
  }
  .signature-box strong {
    display: block;
    color: #0f172a;
    font-size: 8.5pt;
    margin-bottom: 2px;
  }
`;

// Construir HTML completo del documento imprimible aplicando branding por plan
export function buildPrintableHtmlDocument(docTitle, bodyContent, orientation = 'portrait', options = {}) {
  const extraToolbarHtml = options.extraToolbarHtml || '';
  const extraScripts = options.extraScripts || '';
  const shouldAutoPrint = options.autoPrint !== false;
  const branding = options.branding || resolveActivePrintBranding(state?.settings, options.projectId || null);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(docTitle)}</title>
  <style>
    ${PRINT_BASE_STYLES}
    ${branding.watermarkCss || ''}
    ${orientation === 'landscape' 
      ? '@page { size: letter landscape !important; margin: 5mm 6mm 6mm 6mm !important; } .page-container { max-width: 100% !important; padding: 10px 14px !important; margin: 0 auto !important; } @media print { .page-container { max-width: 100% !important; padding: 0 !important; margin: 0 !important; } }'
      : '@page { size: letter portrait !important; margin: 12mm 12mm 15mm 12mm !important; } .page-container { max-width: 960px !important; padding: 30px 35px !important; }'}
  </style>
</head>
<body>
  ${branding.watermarkLayerHtml || ''}
  <!-- Barra de Acciones Flotante (Oculta al Imprimir) -->
  <div class="no-print" style="flex-wrap: wrap; gap: 10px;">
    <div style="font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
      <span>📄 ${escapeHtml(docTitle)}</span>
    </div>
    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
      ${extraToolbarHtml}
      <button class="btn-print" onclick="window.print()">
        🖨️ Imprimir / Guardar como PDF
      </button>
      <button class="btn-close" onclick="window.close()">
        ✖️ Cerrar
      </button>
    </div>
  </div>

  <!-- Contenedor Principal Imprimible -->
  <div class="page-container">
    ${branding.headerBadgeHtml || ''}
    ${bodyContent}
    ${branding.watermarkFooterHtml || ''}
  </div>

  <script>
    ${extraScripts}
    ${shouldAutoPrint ? `
    // Auto-disparar diálogo de impresión tras breve render
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 350);
    });
    ` : `
    window.addEventListener('DOMContentLoaded', () => {
      window.focus();
    });
    `}
  </script>
</body>
</html>`;
}

// Abrir documento e invocar diálogo de impresión
export function openPrintWindow(docTitle, bodyContent, orientation = 'portrait', options = {}) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('El navegador bloqueó la ventana de impresión. Por favor permite ventanas emergentes en esta página.', 'warning');
    return;
  }

  const html = buildPrintableHtmlDocument(docTitle, bodyContent, orientation, options);

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

// -------------------------------------------------------------
// 1. IMPRIMIR FORMATO TAB1-CAT-BASE (CATÁLOGO DE PRESUPUESTO)
// -------------------------------------------------------------
export function printTab1Catalog() {
  if (!state.treeData || state.treeData.length === 0) {
    showToast('No hay conceptos en el Catálogo Base (TAB1-CAT-BASE) para imprimir.', 'warning');
    return;
  }

  const currentDate = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const currencySymbol = getCurrencySymbol();
  const currencyCode = getCurrencyCode();
  const factorSobrecosto = getFactorSobrecosto();
  const applySobrecosto = state.settings.applySobrecosto;
  const pctSobrecosto = ((factorSobrecosto - 1) * 100).toFixed(2);
  const _printBranding = resolveActivePrintBranding(state.settings);
  const companyName = _printBranding.companyName;
  const companyLogo = _printBranding.companyLogo;
  const projectName = (state.settings && state.settings.projectName) || 'Proyecto de Obra Base';
  const projectLocation = (state.settings && state.settings.projectLocation) || '';

  // Aplanar el árbol jerárquico preservando niveles y cálculos
  const flatItems = [];
  function flattenNodes(nodes, level = 1) {
    for (const node of nodes) {
      const isParent = Boolean(node.children && node.children.length > 0);
      const calculatedTotal = isParent 
        ? calculateParentTotal(node) 
        : ((node.cantidad || 0) * (node.precioUnitario || 0));
      const directTotal = isParent 
        ? calculateParentDirectTotal(node) 
        : ((node.cantidad || 0) * (node.costoDirecto !== undefined ? node.costoDirecto : node.precioUnitario || 0));

      flatItems.push({
        ...node,
        level,
        isParent,
        total: calculatedTotal,
        directTotal
      });

      if (isParent) {
        flattenNodes(node.children, level + 1);
      }
    }
  }
  flattenNodes(state.treeData, 1);

  // Totales generales
  const grandTotal = state.treeData.reduce((sum, root) => sum + calculateParentTotal(root), 0);
  const grandDirectTotal = state.treeData.reduce((sum, root) => sum + calculateParentDirectTotal(root), 0);
  const sobrecostoMonto = grandTotal - grandDirectTotal;

  // Generar filas de la tabla
  const tableRows = flatItems.map(item => {
    const isParent = item.isParent;
    const indentPx = (item.level - 1) * 14;

    // Resaltado jerárquico elegante
    let rowStyle = '';
    let claveStyle = 'font-weight: 600; color: #1e293b;';
    let descStyle = 'line-height: 1.4;';

    if (item.level === 1) {
      rowStyle = 'background-color: #f1f5f9; font-weight: 700;';
      claveStyle = 'font-weight: 800; color: #0f172a;';
      descStyle = 'font-weight: 700; text-transform: uppercase; color: #0f172a;';
    } else if (item.level === 2 && isParent) {
      rowStyle = 'background-color: #f8fafc; font-weight: 600;';
      claveStyle = 'font-weight: 700; color: #1e293b;';
      descStyle = 'font-weight: 600; color: #1e293b;';
    }

    const unidad = isParent ? 'lote' : (item.unidad || 'pza');
    const cantidad = isParent ? '-' : formatQty(item.cantidad || 0);
    const pu = isParent ? '-' : formatMoney(item.precioUnitario || 0);
    const total = formatMoney(item.total || 0);

    return `
      <tr style="${rowStyle}">
        <td class="text-center font-mono" style="font-size: 7.5pt; color: #64748b; width: 32px;">${item.level}</td>
        <td class="font-mono" style="${claveStyle} width: 75px; white-space: nowrap;">${escapeHtml(item.clave || '-')}</td>
        <td class="text-justify" style="${descStyle} padding-left: ${indentPx + 6}px;">
          ${escapeHtml(item.descripcion || 'Sin descripción')}
        </td>
        <td class="text-right font-mono" style="width: 75px;">${cantidad}</td>
        <td class="text-center font-mono" style="width: 48px;">${escapeHtml(unidad)}</td>
        <td class="text-right font-mono" style="width: 95px;">${pu}</td>
        <td class="text-right font-mono font-bold" style="width: 105px; color: #0f172a;">${total}</td>
      </tr>
    `;
  }).join('');

  // Contenido HTML completo del presupuesto
  const bodyContent = `
    <!-- Encabezado del Documento -->
    <div class="doc-header">
      <!-- Lado Izquierdo: Logotipo y 3 Filas -->
      <div style="display: flex; align-items: center; gap: 14px;">
        ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
        <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px;">
          <!-- Fila 1: Nombre de la Empresa -->
          <div style="font-size: 11pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
            ${escapeHtml(companyName)}
          </div>
          <!-- Fila 2: CATÁLOGO Y PRESUPUESTO DE OBRA BASE -->
          <h1 class="doc-title" style="font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
            CATÁLOGO Y PRESUPUESTO DE OBRA BASE
          </h1>
          <!-- Fila 3: Nombre de Proyecto -->
          <div style="font-size: 9.5pt; font-weight: 700; color: #475569; line-height: 1.2;">
            <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8.5pt;">Proyecto: </span>${escapeHtml(projectName)}
          </div>
        </div>
      </div>

      <!-- Lado Derecho: 4 Filas de Metadatos -->
      <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px; text-align: right; font-size: 8pt; line-height: 1.35;">
        <!-- Fila 1: Fecha de emisión -->
        <div><strong>Fecha de emisión:</strong> ${currentDate}</div>
        <!-- Fila 2: Proyecto -->
        <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
        <!-- Fila 3: Ubicación -->
        <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span></div>
        <!-- Fila 4: Moneda de trabajo y Sobrecosto -->
        <div><strong>Moneda de trabajo:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span> &nbsp;<strong>Sobrecosto:</strong> ${applySobrecosto ? `<span class="meta-tag" style="background:#fef3c7; border-color:#fde68a; color:#92400e; font-size: 7.5pt; padding: 1px 6px;">+${pctSobrecosto}%</span>` : '<span class="meta-tag" style="font-size: 7.5pt; padding: 1px 6px;">Costo Directo</span>'}</div>
      </div>
    </div>

    <!-- Tabla Principal de Conceptos -->
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 32px;" class="text-center">Niv</th>
          <th style="width: 75px;" class="text-left">Clave</th>
          <th class="text-left">Descripción de Concepto de Obra</th>
          <th style="width: 75px;" class="text-right">Cant.</th>
          <th style="width: 48px;" class="text-center">Unid</th>
          <th style="width: 95px;" class="text-right">Precio Unit.</th>
          <th style="width: 105px;" class="text-right">Importe Total</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>

    <!-- Resumen Económico Final -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 14px;">
      <div style="font-size: 8pt; color: #64748b; max-width: 480px; line-height: 1.5;">
        <p style="margin: 0 0 4px 0;"><strong>Notas generales:</strong></p>
        <p style="margin: 0;">• Los importes expresados incluyen todos los materiales, mano de obra, equipo, herramienta y cargos directos e indirectos correspondientes para la correcta ejecución de los trabajos según catálogo de conceptos.</p>
        <p style="margin: 3px 0 0 0;">• Total de partidas y conceptos procesados: <strong>${flatItems.length}</strong> registros.</p>
      </div>

      <div class="summary-card">
        ${applySobrecosto ? `
          <div class="summary-row">
            <span style="color: #475569;">Costo Directo Total:</span>
            <span class="font-mono font-bold">${formatMoney(grandDirectTotal)}</span>
          </div>
          <div class="summary-row" style="background-color: #fffbeb; color: #92400e;">
            <span>Factor Sobrecosto (+${pctSobrecosto}%):</span>
            <span class="font-mono font-bold">+${formatMoney(sobrecostoMonto)}</span>
          </div>
        ` : ''}
        <div class="summary-row summary-total">
          <span>MONTO TOTAL PRESUPUESTADO:</span>
          <span class="font-mono" style="color: #047857;">${formatMoney(grandTotal)}</span>
        </div>
      </div>
    </div>

    <!-- Área de Firmas Institucionales y Responsables de Obra -->
    ${(() => {
      const budgetSignatures = getBudgetSignatures();
      const sigCols = Math.min(Math.max(budgetSignatures.length, 1), 5);
      const signaturesHtml = budgetSignatures.map(sig => `
        <div class="signature-box">
          <strong>${escapeHtml(sig.rol || 'FIRMA')}</strong>
          ${sig.nombre ? `<div style="font-weight: 700; color: #0f172a; font-size: 8.5pt; margin: 3px 0 2px 0;">${escapeHtml(sig.nombre)}</div>` : '<div style="height: 14px;"></div>'}
          <span>${escapeHtml(sig.cargo || '')}</span>
        </div>
      `).join('');
      return `
        <div class="signatures-grid" style="grid-template-columns: repeat(${sigCols}, 1fr);">
          ${signaturesHtml}
        </div>
      `;
    })()}
  `;

  openPrintWindow('Presupuesto de Obra - TAB1-CAT-BASE', bodyContent);
}

// -------------------------------------------------------------
// 2. IMPRIMIR FORMATO "MATRIZ" Y "INSUMOS UNITARIOS"
// -------------------------------------------------------------
export function printApuMatrix() {
  if (!state.activeSelectedId) {
    showToast('Selecciona primero un concepto en TAB1-CAT-BASE para imprimir su Matriz APU e Insumos.', 'warning');
    return;
  }

  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) {
    showToast('No se encontró el concepto seleccionado.', 'error');
    return;
  }

  if (node.children && node.children.length > 0) {
    showToast('Esta fila es una partida resumen con sub-conceptos. Selecciona un concepto final de obra para imprimir su matriz.', 'info');
    return;
  }

  // Si no tiene insumos pero tiene costo, generar automáticamente la matriz congruente
  if ((!node.insumos || node.insumos.length === 0) && (parseFloat(node.precioUnitario) > 0 || parseFloat(node.costoDirecto) > 0)) {
    node.insumos = generateIntegratedMatrixForConcept(node);
  }

  const currentDate = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const currencySymbol = getCurrencySymbol();
  const currencyCode = getCurrencyCode();
  const factorSobrecosto = getFactorSobrecosto();
  const applySobrecosto = state.settings.applySobrecosto;
  const pctSobrecosto = ((factorSobrecosto - 1) * 100).toFixed(2);
  const _printBranding = resolveActivePrintBranding(state.settings);
  const companyName = _printBranding.companyName;
  const companyLogo = _printBranding.companyLogo;
  const projectName = (state.settings && state.settings.projectName) || 'Proyecto de Obra Base';
  const projectLocation = (state.settings && state.settings.projectLocation) || '';

  const insumos = Array.isArray(node.insumos) ? node.insumos : [];
  const conceptoCantidad = parseFloat(node.cantidad) || 0;
  const conceptoUnidad = node.unidad || 'pza';

  // Clasificar insumos por rubros
  const rubros = [
    { key: 'Material', label: '1. MATERIALES', icon: '📦' },
    { key: 'Mano de Obra', label: '2. MANO DE OBRA', icon: '👷' },
    { key: 'Herramienta', label: '3. HERRAMIENTA', icon: '🔧' },
    { key: 'Equipo', label: '4. EQUIPO', icon: '🛠️' },
    { key: 'Maquinaria', label: '5. MAQUINARIA', icon: '🚜' },
    { key: 'Subcontrato', label: '6. SUBCONTRATOS Y TRABAJOS ESPECIALIZADOS', icon: '📑' }
  ];

  let totalCostoDirecto = 0;
  const matrizRowsHtml = [];

  rubros.forEach(rubro => {
    const items = insumos.filter(ins => (ins.tipo || 'Material') === rubro.key);
    // Si es maquinaria o subcontrato y no tiene insumos, no saturar el formato impreso
    if (items.length === 0 && (rubro.key === 'Maquinaria' || rubro.key === 'Subcontrato')) {
      return;
    }
    let subtotalRubro = 0;

    matrizRowsHtml.push(`
      <tr class="rubro-row">
        <td colspan="6" style="padding: 5px 8px;">
          ${rubro.icon} ${rubro.label}
        </td>
      </tr>
    `);

    if (items.length === 0) {
      matrizRowsHtml.push(`
        <tr>
          <td colspan="6" class="text-center" style="color: #94a3b8; font-style: italic; font-size: 7.5pt; padding: 4px;">
            Sin insumos registrados en este rubro
          </td>
        </tr>
      `);
    } else {
      items.forEach(ins => {
        const cantUnit = round5(ins.cantidad || 0);
        const costoUnit = round2(ins.costoUnitario || 0);
        const importeUnit = round2(cantUnit * costoUnit);
        subtotalRubro = round2(subtotalRubro + importeUnit);

        matrizRowsHtml.push(`
          <tr>
            <td class="font-mono text-center" style="width: 75px; font-weight: 600; color: #1e293b;">
              ${escapeHtml(ins.clave || '-')}
            </td>
            <td class="text-justify" style="line-height: 1.35;">
              ${escapeHtml(ins.descripcion || 'Sin descripción')}
            </td>
            <td class="text-center font-mono" style="width: 45px;">
              ${escapeHtml(ins.unidad || 'pza')}
            </td>
            <td class="text-right font-mono" style="width: 75px;">
              ${formatQty(cantUnit)}
            </td>
            <td class="text-right font-mono" style="width: 85px;">
              ${formatMoney(costoUnit)}
            </td>
            <td class="text-right font-mono font-bold" style="width: 95px; color: #0f172a;">
              ${formatMoney(importeUnit)}
            </td>
          </tr>
        `);
      });
    }

    totalCostoDirecto = round2(totalCostoDirecto + subtotalRubro);

    // Subtotal de rubro
    matrizRowsHtml.push(`
      <tr style="background-color: #f8fafc; font-weight: 700;">
        <td colspan="5" class="text-right" style="font-size: 7.5pt; color: #475569; text-transform: uppercase;">
          Subtotal ${rubro.label.split('. ')[1] || rubro.label}:
        </td>
        <td class="text-right font-mono font-bold" style="color: #1e293b;">
          ${formatMoney(subtotalRubro)}
        </td>
      </tr>
    `);
  });

  const sobrecostoMonto = applySobrecosto ? round2(totalCostoDirecto * (factorSobrecosto - 1)) : 0;
  const precioUnitarioFinal = applySobrecosto ? round2(totalCostoDirecto * factorSobrecosto) : totalCostoDirecto;
  const importeTotalPresupuesto = round2(conceptoCantidad * precioUnitarioFinal);

  // -----------------------------------------------------------
  // TABLA 2: INSUMOS UNITARIOS (EXPLOSIÓN TOTAL DE OBRA)
  // -----------------------------------------------------------
  let totalImporteObra = 0;
  const insumosUnitariosRows = insumos.map(ins => {
    const cantUnit = round2(ins.cantidad || 0);
    const costoUnit = round2(ins.costoUnitario || 0);
    const cantidadTotalObra = round2(cantUnit * conceptoCantidad);
    const importeObra = round2(cantidadTotalObra * costoUnit);
    totalImporteObra = round2(totalImporteObra + importeObra);

    return `
      <tr>
        <td class="font-mono text-center" style="width: 75px; font-weight: 600; color: #1e293b;">
          ${escapeHtml(ins.clave || '-')}
        </td>
        <td class="text-center font-mono" style="width: 65px; font-size: 7pt; color: #475569;">
          ${escapeHtml(ins.tipo || 'Material')}
        </td>
        <td class="text-justify" style="line-height: 1.35;">
          ${escapeHtml(ins.descripcion || 'Sin descripción')}
        </td>
        <td class="text-right font-mono font-bold" style="width: 80px; color: #1e40af;">
          ${formatQty(cantidadTotalObra)}
        </td>
        <td class="text-center font-mono" style="width: 45px;">
          ${escapeHtml(ins.unidad || 'pza')}
        </td>
        <td class="text-right font-mono" style="width: 85px;">
          ${formatMoney(costoUnit)}
        </td>
        <td class="text-right font-mono font-bold" style="width: 95px; color: #047857;">
          ${formatMoney(importeObra)}
        </td>
      </tr>
    `;
  }).join('');

  // Contenido HTML completo de Matriz e Insumos Unitarios
  const bodyContent = `
    <!-- Encabezado del Documento -->
    <div class="doc-header">
      <!-- Lado Izquierdo: Logotipo y 3 Filas -->
      <div style="display: flex; align-items: center; gap: 14px;">
        ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
        <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px;">
          <!-- Fila 1: Nombre de la Empresa -->
          <div style="font-size: 11pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
            ${escapeHtml(companyName)}
          </div>
          <!-- Fila 2: ANÁLISIS DE PRECIO UNITARIO (APU) -->
          <h1 class="doc-title" style="font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
            ANÁLISIS DE PRECIO UNITARIO (APU)
          </h1>
          <!-- Fila 3: Nombre de Proyecto -->
          <div style="font-size: 9.5pt; font-weight: 700; color: #475569; line-height: 1.2;">
            <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8.5pt;">Proyecto: </span>${escapeHtml(projectName)}
          </div>
        </div>
      </div>

      <!-- Lado Derecho: 4 Filas de Metadatos -->
      <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px; text-align: right; font-size: 8pt; line-height: 1.35;">
        <!-- Fila 1: Fecha de emisión -->
        <div><strong>Fecha de emisión:</strong> ${currentDate}</div>
        <!-- Fila 2: Proyecto -->
        <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
        <!-- Fila 3: Ubicación -->
        <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span></div>
        <!-- Fila 4: Moneda de trabajo y Sobrecosto -->
        <div><strong>Moneda de trabajo:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span> &nbsp;<strong>Factor Sobrecosto:</strong> ${applySobrecosto ? `<span class="meta-tag font-mono" style="background:#fef3c7; border-color:#fde68a; color:#92400e; font-size: 7.5pt; padding: 1px 6px;">+${pctSobrecosto}%</span>` : '<span class="meta-tag" style="font-size: 7.5pt; padding: 1px 6px;">Costo Directo</span>'}</div>
      </div>
    </div>

    <!-- Ficha Técnica del Concepto Seleccionado -->
    <div class="concept-card">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
        <div>
          <span style="font-size: 8pt; font-weight: 700; color: #475569; text-transform: uppercase;">Clave de Concepto:</span>
          <span class="font-mono font-bold" style="font-size: 11pt; color: #1d4ed8; margin-left: 6px;">${escapeHtml(node.clave || '-')}</span>
        </div>
        <div style="display: flex; gap: 15px; font-size: 8.5pt;">
          <span>Unidad: <strong class="font-mono">${escapeHtml(conceptoUnidad)}</strong></span>
          <span>Volumen Obra: <strong class="font-mono">${formatQty(conceptoCantidad)}</strong></span>
          <span>P.U. Final: <strong class="font-mono" style="color: #1d4ed8;">${formatMoney(precioUnitarioFinal)}</strong></span>
        </div>
      </div>

      <div style="font-size: 8.5pt; color: #1e293b;">
        <span style="font-size: 7.5pt; font-weight: 700; color: #64748b; display: block; text-transform: uppercase; margin-bottom: 3px;">
          Descripción Detallada del Concepto:
        </span>
        <div class="text-justify" style="line-height: 1.45; font-size: 9pt;">
          ${escapeHtml(node.descripcion || 'Sin descripción')}
        </div>
      </div>
    </div>

    <!-- SECCIÓN 1: MATRIZ DE PRECIO UNITARIO -->
    <div class="section-banner">
      <span>1. Matriz de Análisis de Precio Unitario (Consumo por 1 ${escapeHtml(conceptoUnidad)})</span>
      <span style="font-size: 7.5pt; font-weight: 600; text-transform: none;">Base: 1 ${escapeHtml(conceptoUnidad)}</span>
    </div>

    <table class="report-table" style="margin-top: 0; border-top: none;">
      <thead>
        <tr>
          <th style="width: 75px;" class="text-center">Clave</th>
          <th class="text-left">Descripción del Insumo / Cuadrilla / Maquinaria</th>
          <th style="width: 45px;" class="text-center">Unidad</th>
          <th style="width: 75px;" class="text-right">Rdto./Cant.</th>
          <th style="width: 85px;" class="text-right">Costo Unit.</th>
          <th style="width: 95px;" class="text-right">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${matrizRowsHtml.join('')}
      </tbody>
    </table>

    <!-- Resumen Analítico del Precio Unitario -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 8px;">
      <div style="font-size: 8pt; color: #64748b; max-width: 460px; line-height: 1.45;">
        <p style="margin: 0;">• Rendimientos y consumos analizados estrictamente para producir <strong>1 ${escapeHtml(conceptoUnidad)}</strong> del concepto justificado arriba.</p>
        <p style="margin: 3px 0 0 0;">• Total de insumos intervinientes en la matriz: <strong>${insumos.length}</strong> insumos.</p>
      </div>

      <div class="summary-card">
        <div class="summary-row">
          <span style="color: #475569;">Costo Directo (C.D.):</span>
          <span class="font-mono font-bold">${formatMoney(totalCostoDirecto)}</span>
        </div>
        ${applySobrecosto ? `
          <div class="summary-row" style="background-color: #fffbeb; color: #92400e;">
            <span>Sobrecosto (+${pctSobrecosto}%):</span>
            <span class="font-mono font-bold">+${formatMoney(sobrecostoMonto)}</span>
          </div>
        ` : ''}
        <div class="summary-row summary-total">
          <span>PRECIO UNITARIO FINAL:</span>
          <span class="font-mono" style="color: #1d4ed8;">${formatMoney(precioUnitarioFinal)}</span>
        </div>
      </div>
    </div>

    <!-- SECCIÓN 2: INSUMOS UNITARIOS (EXPLOSIÓN TOTAL DE OBRA) -->
    <div class="section-banner" style="margin-top: 24px; background-color: #1e3a8a;">
      <span>2. Insumos Unitarios — Totales Requeridos para la Obra (${formatQty(conceptoCantidad)} ${escapeHtml(conceptoUnidad)})</span>
    </div>

    <table class="report-table" style="margin-top: 0; border-top: none;">
      <thead>
        <tr>
          <th style="width: 75px;" class="text-center">Clave</th>
          <th style="width: 65px;" class="text-center">Rubro</th>
          <th class="text-left">Descripción del Insumo</th>
          <th style="width: 80px;" class="text-right">Cant. Obra</th>
          <th style="width: 45px;" class="text-center">Unidad</th>
          <th style="width: 85px;" class="text-right">Costo Unit.</th>
          <th style="width: 95px;" class="text-right">Importe Obra</th>
        </tr>
      </thead>
      <tbody>
        ${insumosUnitariosRows.length > 0 ? insumosUnitariosRows : '<tr><td colspan="7" class="text-center" style="color: #94a3b8; font-style: italic; padding: 6px;">Sin insumos registrados</td></tr>'}
      </tbody>
      <tfoot>
        <tr style="background-color: #f1f5f9; font-weight: 800;">
          <td colspan="6" class="text-right" style="text-transform: uppercase; font-size: 8pt; color: #0f172a;">
            Total Importe en Obra para este Concepto:
          </td>
          <td class="text-right font-mono font-bold" style="color: #047857; font-size: 8.5pt;">
            ${formatMoney(totalImporteObra)}
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Área de Firmas Técnicas -->
    <div class="signatures-grid">
      <div class="signature-box">
        <strong>ANALIZÓ Y CALCULÓ</strong>
        <span>Especialista en Costos y Precios Unitarios</span>
      </div>
      <div class="signature-box">
        <strong>REVISÓ</strong>
        <span>Coordinador de Presupuestos e Ingeniería</span>
      </div>
      <div class="signature-box">
        <strong>AUTORIZÓ</strong>
        <span>Dirección Técnica / Contratista</span>
      </div>
    </div>
  `;

  const docTitle = `APU_${node.clave || 'Concepto'}_Matriz_e_Insumos`;
  openPrintWindow(docTitle, bodyContent);
}

// -------------------------------------------------------------
// 3. IMPRIMIR FORMATO "INSUMOS GENERALES" (CONSOLIDADO TOTAL DE OBRA)
// -------------------------------------------------------------
export function printInsumosGenerales() {
  const consolidated = getConsolidatedDataMap();

  const rubros = [
    { key: 'Material', label: '1. MATERIALES', icon: '📦' },
    { key: 'Mano de Obra', label: '2. MANO DE OBRA', icon: '👷' },
    { key: 'Herramienta', label: '3. HERRAMIENTA MENOR Y EQUIPO DE SEGURIDAD', icon: '🔧' },
    { key: 'Equipo', label: '4. EQUIPO', icon: '⚙️' },
    { key: 'Maquinaria', label: '5. MAQUINARIA Y EQUIPO PESADO', icon: '🚜' },
    { key: 'Subcontrato', label: '6. SUBCONTRATOS Y TRABAJOS ESPECIALIZADOS', icon: '📑' }
  ];

  let totalItemsCount = 0;
  let grandTotalGeneral = 0;
  rubros.forEach(r => {
    const list = Object.values(consolidated[r.key] || {});
    totalItemsCount += list.length;
    list.forEach(item => {
      grandTotalGeneral += (item.totalImporte || 0);
    });
  });

  const selectedCount = consolidated._selectedConceptsCount || 0;
  if (selectedCount === 0 || totalItemsCount === 0) {
    showToast('No hay conceptos seleccionados con checkbox en TAB1-CAT-BASE para imprimir insumos.', 'warning');
    return;
  }

  const currentDate = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const currencySymbol = getCurrencySymbol();
  const currencyCode = getCurrencyCode();
  const _printBranding = resolveActivePrintBranding(state.settings);
  const companyName = _printBranding.companyName;
  const companyLogo = _printBranding.companyLogo;
  const projectName = (state.settings && state.settings.projectName) || 'Proyecto de Obra Base';
  const projectLocation = (state.settings && state.settings.projectLocation) || '';

  // Generar filas agrupadas por categoría
  const tableRowsHtml = [];
  const categoryTotals = {};

  rubros.forEach(rubro => {
    const items = Object.values(consolidated[rubro.key] || {});
    let subtotalRubro = 0;

    tableRowsHtml.push(`
      <tr class="rubro-row">
        <td colspan="6" style="padding: 6px 8px;">
          ${rubro.icon} ${rubro.label} (${items.length} insumos)
        </td>
      </tr>
    `);

    if (items.length === 0) {
      tableRowsHtml.push(`
        <tr>
          <td colspan="6" class="text-center" style="color: #94a3b8; font-style: italic; font-size: 7.5pt; padding: 4px;">
            Sin insumos registrados en este rubro
          </td>
        </tr>
      `);
    } else {
      // Ordenar por clave o descripción
      items.sort((a, b) => (a.clave || '').localeCompare(b.clave || '') || (a.descripcion || '').localeCompare(b.descripcion || ''));

      items.forEach(item => {
        const cant = round2(item.cantidadTotal || 0);
        const costo = round2(item.costoUnitario || 0);
        const imp = round2(item.totalImporte || (cant * costo));
        subtotalRubro = round2(subtotalRubro + imp);

        tableRowsHtml.push(`
          <tr>
            <td class="font-mono text-center" style="width: 80px; font-weight: 600; color: #1e293b;">
              ${escapeHtml(item.clave || '-')}
            </td>
            <td class="text-justify" style="line-height: 1.35;">
              ${escapeHtml(item.descripcion || item.insumoName || 'Sin descripción')}
            </td>
            <td class="text-right font-mono font-bold" style="width: 85px; color: #1e40af;">
              ${formatQty(cant)}
            </td>
            <td class="text-center font-mono" style="width: 48px;">
              ${escapeHtml(item.unidad || 'pza')}
            </td>
            <td class="text-right font-mono" style="width: 90px;">
              ${formatMoney(costo)}
            </td>
            <td class="text-right font-mono font-bold" style="width: 105px; color: #047857;">
              ${formatMoney(imp)}
            </td>
          </tr>
        `);
      });
    }

    categoryTotals[rubro.key] = subtotalRubro;

    // Fila de subtotal por categoría
    tableRowsHtml.push(`
      <tr style="background-color: #f8fafc; font-weight: 700;">
        <td colspan="5" class="text-right" style="font-size: 7.5pt; color: #475569; text-transform: uppercase;">
          Subtotal ${rubro.label.split('. ')[1] || rubro.label}:
        </td>
        <td class="text-right font-mono font-bold" style="color: #0f172a; font-size: 8.5pt;">
          ${formatMoney(subtotalRubro)}
        </td>
      </tr>
    `);
  });

  const bodyContent = `
    <!-- Encabezado del Documento -->
    <div class="doc-header">
      <!-- Lado Izquierdo: Logotipo y 3 Filas -->
      <div style="display: flex; align-items: center; gap: 14px;">
        ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
        <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px;">
          <!-- Fila 1: Nombre de la Empresa -->
          <div style="font-size: 11pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
            ${escapeHtml(companyName)}
          </div>
          <!-- Fila 2: EXPLOSIÓN DE INSUMOS GENERALES DE OBRA -->
          <h1 class="doc-title" style="font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
            EXPLOSIÓN DE INSUMOS GENERALES DE OBRA
          </h1>
          <!-- Fila 3: Nombre de Proyecto -->
          <div style="font-size: 9.5pt; font-weight: 700; color: #475569; line-height: 1.2;">
            <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8.5pt;">Proyecto: </span>${escapeHtml(projectName)}
          </div>
        </div>
      </div>

      <!-- Lado Derecho: 4 Filas de Metadatos -->
      <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px; text-align: right; font-size: 8pt; line-height: 1.35;">
        <!-- Fila 1: Fecha de emisión -->
        <div><strong>Fecha de emisión:</strong> ${currentDate}</div>
        <!-- Fila 2: Proyecto -->
        <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
        <!-- Fila 3: Ubicación -->
        <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span></div>
        <!-- Fila 4: Moneda de trabajo y Total de insumos -->
        <div><strong>Moneda de trabajo:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span> &nbsp;<strong>Total Insumos:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${totalItemsCount} registros</span></div>
      </div>
    </div>

    <!-- Tabla Principal de Insumos Consolidados -->
    <table class="report-table">
      <thead>
        <tr>
          <th style="width: 80px;" class="text-center">Clave</th>
          <th class="text-left">Descripción del Insumo Consolidado</th>
          <th style="width: 85px;" class="text-right">Cantidad Obra</th>
          <th style="width: 48px;" class="text-center">Unidad</th>
          <th style="width: 90px;" class="text-right">Costo Ref.</th>
          <th style="width: 105px;" class="text-right">Importe Total</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml.join('')}
      </tbody>
    </table>

    <!-- Resumen Económico Final -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 14px;">
      <div style="font-size: 8pt; color: #64748b; max-width: 480px; line-height: 1.5;">
        <p style="margin: 0 0 4px 0;"><strong>Notas del consolidado de insumos:</strong></p>
        <p style="margin: 0;">• Las cantidades totales representan la multiplicación de los rendimientos unitarios analizados en las matrices de precios por los volúmenes totales presupuestados de cada concepto.</p>
        <p style="margin: 3px 0 0 0;">• Este reporte consolida compras globales de materiales, asignación de cuadrillas y requerimientos de maquinaria para la obra.</p>
      </div>

      <div class="summary-card">
        <div class="summary-row">
          <span style="color: #475569;">Subtotal Materiales:</span>
          <span class="font-mono font-bold">${formatMoney(categoryTotals['Material'] || 0)}</span>
        </div>
        <div class="summary-row">
          <span style="color: #475569;">Subtotal Mano de Obra:</span>
          <span class="font-mono font-bold">${formatMoney(categoryTotals['Mano de Obra'] || 0)}</span>
        </div>
        <div class="summary-row">
          <span style="color: #475569;">Subtotal Equipo / Maq.:</span>
          <span class="font-mono font-bold">${formatMoney(categoryTotals['Equipo'] || 0)}</span>
        </div>
        <div class="summary-row">
          <span style="color: #475569;">Subtotal Subcontratos:</span>
          <span class="font-mono font-bold">${formatMoney(categoryTotals['Subcontrato'] || 0)}</span>
        </div>
        <div class="summary-row summary-total">
          <span>TOTAL GENERAL DE INSUMOS:</span>
          <span class="font-mono" style="color: #047857;">${formatMoney(grandTotalGeneral)}</span>
        </div>
      </div>
    </div>

    <!-- Área de Firmas Institucionales -->
    <div class="signatures-grid">
      <div class="signature-box">
        <strong>CUANTIFICÓ Y ANALIZÓ</strong>
        <span>Departamento de Costos y Presupuestos</span>
      </div>
      <div class="signature-box">
        <strong>REVISÓ</strong>
        <span>Coordinador de Obra y Compras</span>
      </div>
      <div class="signature-box">
        <strong>AUTORIZÓ</strong>
        <span>Dirección de Operaciones / Residencia</span>
      </div>
    </div>
  `;

  openPrintWindow('Explosion_Insumos_Generales_Obra', bodyContent);
}


function formatPrintDate(str) {
  if (!str) return '-';
  const parts = str.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
  }
  return str;
}

function normalizePrintScale(rawScale) {
  const s = String(rawScale || 'dias').toLowerCase().trim();
  if (s === 'meses' || s === 'months' || s === 'month' || s === 'mes') return 'meses';
  if (s === 'semanas' || s === 'weeks' || s === 'week' || s === 'semana') return 'semanas';
  return 'dias';
}

function getScaleLabel(scale) {
  const norm = normalizePrintScale(scale);
  if (norm === 'meses') return 'Mensual (Meses)';
  if (norm === 'semanas') return 'Semanal (Semanas)';
  return 'Diaria (Días)';
}

// Generar subdivisiones exactas de escala temporal (Días, Semanas o Meses) para el Diagrama de Gantt de impresión
function generatePrintGanttTimeline(minDate, maxDate, scale = 'dias') {
  const normScale = normalizePrintScale(scale);
  const totalDays = Math.max(1, diffDays(minDate, maxDate) + 1);
  const months = [];
  const workdaysCfg = getWorkdaysSettings();
  
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const dayLetters = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  let currY = minDate.getFullYear();
  let currM = minDate.getMonth();
  const endY = maxDate.getFullYear();
  const endM = maxDate.getMonth();

  let globalWeekCounter = 1;
  const allWeeks = [];
  const allDays = [];

  while (currY < endY || (currY === endY && currM <= endM)) {
    const firstOfMonth = new Date(currY, currM, 1);
    const lastOfMonth = new Date(currY, currM + 1, 0);

    const effStart = firstOfMonth < minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : firstOfMonth;
    const effEnd = lastOfMonth > maxDate ? new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()) : lastOfMonth;
    const daysInMonth = Math.max(1, diffDays(effStart, effEnd) + 1);
    const pct = (daysInMonth / totalDays) * 100;

    // Semanas exactas del mes (Semana 1: 1-7, Semana 2: 8-14, Semana 3: 15-21, Semana 4: 22-28, Semana 5: 29-fin)
    const weeks = [];
    for (let w = 1; w <= 5; w++) {
      const wRawStart = (w - 1) * 7 + 1;
      if (wRawStart > lastOfMonth.getDate()) break;
      const wRawEnd = w === 5 ? lastOfMonth.getDate() : Math.min(lastOfMonth.getDate(), w * 7);
      const sDay = Math.max(effStart.getDate(), wRawStart);
      const eDay = Math.min(effEnd.getDate(), wRawEnd);

      if (sDay <= eDay) {
        const wDays = eDay - sDay + 1;
        const wPct = (wDays / totalDays) * 100;
        const weekObj = {
          num: w,
          globalNum: globalWeekCounter++,
          label: `S${w}`,
          semLabel: `Sem ${w}`,
          fullLabel: `${monthNames[currM]} ${currY} - Semana ${w}`,
          range: `${sDay}-${eDay}`,
          daysCount: wDays,
          pct: wPct,
          startDate: new Date(currY, currM, sDay),
          endDate: new Date(currY, currM, eDay)
        };
        weeks.push(weekObj);
        allWeeks.push(weekObj);
      }
    }

    // Días individuales exactos de este mes (para escala 'dias')
    const monthDaysList = [];
    let dayCursor = new Date(effStart.getFullYear(), effStart.getMonth(), effStart.getDate());
    const effEndClean = new Date(effEnd.getFullYear(), effEnd.getMonth(), effEnd.getDate());
    while (dayCursor <= effEndClean) {
      const dNum = dayCursor.getDate();
      const dDow = dayCursor.getDay();
      const wInfo = getDateWorkdayInfo(dayCursor, workdaysCfg);
      const dObj = {
        dateStr: formatDate(dayCursor),
        dayNum: dNum,
        letter: dayLetters[dDow],
        isWeekend: (dDow === 0 || dDow === 6),
        isNonWorking: !wInfo.isWorkingDay,
        statusType: wInfo.statusType,
        pct: (1 / totalDays) * 100
      };
      monthDaysList.push(dObj);
      allDays.push(dObj);
      dayCursor = addDays(dayCursor, 1);
    }

    months.push({
      year: currY,
      month: currM,
      monthName: monthNames[currM],
      title: `${monthNames[currM].toUpperCase()} ${currY}`,
      shortTitle: `${monthNames[currM].slice(0, 3).toUpperCase()} '${String(currY).slice(-2)}`,
      effStart,
      effEnd,
      daysInMonth,
      pct,
      weeks,
      days: monthDaysList
    });

    currM++;
    if (currM > 11) {
      currM = 0;
      currY++;
    }
  }

  return { months, allWeeks, allDays, totalDays, scale: normScale };
}

// -------------------------------------------------------------
// CONSTRUCTOR 1: IMPRESIÓN MODO DIAGRAMA DE GANTT (LANDSCAPE)
// Respeta estrictamente la escala seleccionada: Días, Semanas o Meses
// -------------------------------------------------------------
function buildGanttPrintHtml({
  scheduleData,
  minDate,
  maxDate,
  scale,
  cfg,
  companyName,
  companyLogo,
  projectName,
  projectLocation,
  currentDate,
  currencySymbol,
  currencyCode
}) {
  const normScale = normalizePrintScale(scale);
  const minDateStr = formatDate(minDate);
  const maxDateStr = formatDate(maxDate);
  const totalDurationDays = Math.max(1, diffDays(minDate, maxDate) + 1);

  const grandTotal = scheduleData.items.reduce((sum, it) => !it.isParent ? sum + (it.importe || 0) : sum, 0);
  const partidasCount = scheduleData.items.filter(it => it.isParent && it.level === 1).length;
  const conceptosCount = scheduleData.items.filter(it => !it.isParent).length;

  // Dividir horizontalmente en hojas equilibradas solo si la cantidad de columnas de la escala elegida
  // rebasa el ancho legible de una hoja Carta Horizontal, respetando SIEMPRE Días, Semanas o Meses.
  const fullTimeline = generatePrintGanttTimeline(minDate, maxDate, normScale);
  const sheetSlices = [];

  if (normScale === 'dias') {
    const MAX_DAYS_PER_SHEET = 42;
    const totalSheets = Math.max(1, Math.ceil(totalDurationDays / MAX_DAYS_PER_SHEET));
    const daysPerSheet = Math.ceil(totalDurationDays / totalSheets);
    for (let i = 0; i < totalSheets; i++) {
      const sStart = addDays(minDate, i * daysPerSheet);
      const sEnd = (i === totalSheets - 1) ? maxDate : addDays(sStart, daysPerSheet - 1);
      if (sStart <= maxDate) {
        sheetSlices.push({ startDate: sStart, endDate: sEnd > maxDate ? maxDate : sEnd });
      }
    }
  } else if (normScale === 'semanas') {
    const MAX_WEEKS_PER_SHEET = 26;
    const wTotal = fullTimeline.allWeeks.length;
    const totalSheets = Math.max(1, Math.ceil(wTotal / MAX_WEEKS_PER_SHEET));
    const weeksPerSheet = Math.ceil(wTotal / totalSheets);
    for (let i = 0; i < totalSheets; i++) {
      const chunk = fullTimeline.allWeeks.slice(i * weeksPerSheet, Math.min(wTotal, (i + 1) * weeksPerSheet));
      if (chunk.length > 0) {
        sheetSlices.push({ startDate: chunk[0].startDate, endDate: chunk[chunk.length - 1].endDate });
      }
    }
  } else {
    // normScale === 'meses'
    const MAX_MONTHS_PER_SHEET = 18;
    const mTotal = fullTimeline.months.length;
    const totalSheets = Math.max(1, Math.ceil(mTotal / MAX_MONTHS_PER_SHEET));
    const monthsPerSheet = Math.ceil(mTotal / totalSheets);
    for (let i = 0; i < totalSheets; i++) {
      const chunk = fullTimeline.months.slice(i * monthsPerSheet, Math.min(mTotal, (i + 1) * monthsPerSheet));
      if (chunk.length > 0) {
        sheetSlices.push({ startDate: chunk[0].effStart, endDate: chunk[chunk.length - 1].effEnd });
      }
    }
  }

  if (sheetSlices.length === 0) {
    sheetSlices.push({ startDate: minDate, endDate: maxDate });
  }

  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);
  const totalSheetsCount = sheetSlices.length;

  const sheetsHtml = sheetSlices.map((slice, sheetIdx) => {
    const isFirstSheet = (sheetIdx === 0);
    const isLastSheet = (sheetIdx === totalSheetsCount - 1);
    const sliceStart = slice.startDate;
    const sliceEnd = slice.endDate;
    const sliceStartStr = formatDate(sliceStart);
    const sliceEndStr = formatDate(sliceEnd);

    const { months, allWeeks, allDays, totalDays } = generatePrintGanttTimeline(sliceStart, sliceEnd, normScale);

    const todayOffset = diffDays(sliceStart, todayDate);
    const showTodayLine = todayOffset >= 0 && todayOffset < totalDays;
    const todayPct = (((todayOffset + 0.5) / totalDays) * 100).toFixed(2);

    const colSpanCount = normScale === 'meses'
      ? months.length
      : (normScale === 'semanas' ? allWeeks.length : allDays.length);

    const headerRowsCount = normScale === 'meses' ? 2 : 3;

    // Generar filas unificadas de Catálogo + Diagrama de Gantt para esta hoja
    const tableRows = scheduleData.items.map(item => {
      const isParent = item.isParent;
      const isLevel1 = item.level === 1;
      const isLevel2 = item.level === 2 && isParent;
      const indentPx = (item.level - 1) * 12 + 4;

      let rowBg = '#ffffff';
      let claveStyle = 'font-weight: 600; color: #1e293b;';
      let descStyle = 'line-height: 1.35; color: #334155;';

      if (isLevel1) {
        rowBg = '#f1f5f9';
        claveStyle = 'font-weight: 800; color: #0f172a;';
        descStyle = 'font-weight: 800; text-transform: uppercase; color: #0f172a; letter-spacing: 0.02em;';
      } else if (isLevel2) {
        rowBg = '#f8fafc';
        claveStyle = 'font-weight: 700; color: #1e293b;';
        descStyle = 'font-weight: 700; color: #1e293b;';
      }

      const unidad = isParent ? '-' : (item.unidad || 'pza');
      const cantidad = isParent ? '-' : formatQty(item.cantidad || 0);
      const duracion = item.durationDays ? `${item.durationDays}d` : '-';
      const sDateFormatted = formatPrintDate(item.startDate);
      const eDateFormatted = formatPrintDate(item.endDate);

      // Cálculo matemático exacto de la barra Gantt dentro del tramo de esta hoja [sliceStart, sliceEnd]
      let barHtml = '';
      if (item.startDate && item.endDate) {
        const sDate = parseDate(item.startDate);
        const eDate = parseDate(item.endDate);
        const fullBarDays = Math.max(1, item.durationDays || (diffDays(sDate, eDate) + 1));

        if (eDate >= sliceStart && sDate <= sliceEnd) {
          const visStart = sDate < sliceStart ? sliceStart : sDate;
          const visEnd = eDate > sliceEnd ? sliceEnd : eDate;
          const offsetDays = Math.max(0, diffDays(sliceStart, visStart));
          const visBarDays = Math.max(1, diffDays(visStart, visEnd) + 1);
          const leftPct = Math.max(0, Math.min(99.5, (offsetDays / totalDays) * 100)).toFixed(2);
          const widthPct = Math.max(1.2, Math.min(100 - Number(leftPct), (visBarDays / totalDays) * 100)).toFixed(2);
          const radiusL = sDate < sliceStart ? '0px' : '3px';
          const radiusR = eDate > sliceEnd ? '0px' : '3px';
          const borderRadiusCss = `${radiusL} ${radiusR} ${radiusR} ${radiusL}`;

          if (isLevel1) {
            barHtml = `
              <div style="position: absolute; top: 4px; bottom: 4px; left: ${leftPct}%; width: ${widthPct}%; min-width: 6px; background: linear-gradient(90deg, #1e3a8a 0%, #2563eb 100%); border-radius: ${borderRadiusCss}; border: 1px solid #1e40af; display: flex; align-items: center; justify-content: space-between; padding: 0 4px; overflow: hidden; z-index: 3; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                <span style="font-size: 6.5pt; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; letter-spacing: 0.02em;">
                  ${escapeHtml(item.descripcion)}
                </span>
                <span style="font-size: 6.5pt; font-family: monospace; font-weight: 700; color: #93c5fd; white-space: nowrap; margin-left: 4px;">
                  ${fullBarDays}d
                </span>
              </div>
            `;
          } else if (isLevel2) {
            barHtml = `
              <div style="position: absolute; top: 5px; bottom: 5px; left: ${leftPct}%; width: ${widthPct}%; min-width: 5px; background: linear-gradient(90deg, #475569 0%, #64748b 100%); border-radius: ${borderRadiusCss}; border: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; padding: 0 3px; overflow: hidden; z-index: 2; box-shadow: 0 1px 2px rgba(0,0,0,0.15);">
                <span style="font-size: 6pt; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(item.descripcion)}
                </span>
                <span style="font-size: 6pt; font-family: monospace; font-weight: 600; color: #e2e8f0; white-space: nowrap; margin-left: 2px;">
                  ${fullBarDays}d
                </span>
              </div>
            `;
          } else {
            const barColor = item.isCritical
              ? '#dc2626'
              : (item.customColor || (item.color && item.color.bar) || '#2563eb');
            let labelInside = '';
            if (Number(widthPct) >= 7) {
              labelInside = `<span style="font-size: 6pt; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 3px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${escapeHtml(item.clave)} (${fullBarDays}d)</span>`;
            } else if (Number(widthPct) >= 3.5) {
              labelInside = `<span style="font-size: 6pt; font-family: monospace; font-weight: 700; color: #ffffff; white-space: nowrap; padding: 0 2px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${fullBarDays}d</span>`;
            }

            barHtml = `
              <div style="position: absolute; top: 5px; bottom: 5px; left: ${leftPct}%; width: ${widthPct}%; min-width: 4px; background-color: ${barColor}; border-radius: ${borderRadiusCss}; border: 1px solid rgba(0,0,0,0.25); display: flex; align-items: center; justify-content: center; overflow: hidden; z-index: 2; box-shadow: 0 1px 2px rgba(0,0,0,0.12);"
                   title="${escapeHtml(item.clave)} - ${escapeHtml(item.descripcion)}: ${item.startDate} al ${item.endDate} (${fullBarDays} días)">
                ${labelInside}
              </div>
            `;
          }
        }
      }

      // Cuadrícula de fondo respetando estrictamente la escala seleccionada (Días, Semanas o Meses)
      let gridLinesHtml = '';
      if (normScale === 'meses') {
        gridLinesHtml = months.map((m, idx) => `
          <div style="width: ${m.pct}%; height: 100%; border-right: ${idx < months.length - 1 ? '1px dashed #cbd5e1' : 'none'};"></div>
        `).join('');
      } else if (normScale === 'semanas') {
        gridLinesHtml = allWeeks.map((w, idx) => `
          <div style="width: ${w.pct}%; height: 100%; border-right: ${idx < allWeeks.length - 1 ? '1px dashed #cbd5e1' : 'none'};"></div>
        `).join('');
      } else {
        gridLinesHtml = allDays.map((d, idx) => `
          <div style="width: ${d.pct}%; height: 100%; border-right: ${idx < allDays.length - 1 ? '1px dotted #cbd5e1' : 'none'}; ${d.isNonWorking ? 'background-color: rgba(254,243,199,0.45);' : (d.isWeekend ? 'background-color: rgba(241,245,249,0.45);' : '')}"></div>
        `).join('');
      }

      return `
        <tr style="background-color: ${rowBg};">
          <td class="text-center font-mono" style="font-size: 7pt; color: #64748b; width: 22px;">${item.level}</td>
          <td class="font-mono text-center" style="${claveStyle} width: 48px; white-space: nowrap; font-size: 7.5pt;">${escapeHtml(item.clave || '-')}</td>
          <td class="text-justify" style="${descStyle} padding-left: ${indentPx}px; min-width: 155px; max-width: 210px;">
            ${escapeHtml(item.descripcion || 'Sin descripción')}
          </td>
          <td class="text-center font-mono" style="width: 28px; font-size: 7pt;">${escapeHtml(unidad)}</td>
          <td class="text-right font-mono" style="width: 38px; font-size: 7pt;">${cantidad}</td>
          <td class="text-center font-mono" style="width: 46px; font-size: 6.8pt; color: #1e3a8a; white-space: nowrap;">${sDateFormatted}</td>
          <td class="text-center font-mono" style="width: 46px; font-size: 6.8pt; color: #1e3a8a; white-space: nowrap;">${eDateFormatted}</td>
          <td class="text-center font-mono font-bold" style="width: 28px; font-size: 7pt; color: #0f172a;">${duracion}</td>
          
          <!-- Celda del Diagrama de Gantt en el Timeline -->
          <td colspan="${colSpanCount}" class="gantt-timeline-cell" style="position: relative; padding: 0 !important; height: 25px; border: 1px solid #cbd5e1; background-color: ${rowBg}; vertical-align: middle;">
            <!-- Cuadrícula de Fondo -->
            <div style="position: absolute; inset: 0; display: flex; pointer-events: none; height: 100%;">
              ${gridLinesHtml}
            </div>

            <!-- Línea de HOY (Corte) si está dentro del tramo -->
            ${showTodayLine ? `
              <div style="position: absolute; top: 0; bottom: 0; left: ${todayPct}%; width: 2px; background-color: #ef4444; z-index: 4;" title="Fecha de corte / Hoy: ${todayStr}"></div>
            ` : ''}

            <!-- Barra de Gantt -->
            ${barHtml}
          </td>
        </tr>
      `;
    }).join('');

    // Encabezado temporal respetando estrictamente Días, Semanas o Meses
    const TIMELINE_SHARE_PCT = 58;
    let scaleHeaderHtml = '';
    if (normScale === 'meses') {
      scaleHeaderHtml = `
        <tr class="gantt-scale-row-months" style="background-color: #e2e8f0; font-size: 7pt;">
          ${months.map(m => `
            <th class="gantt-scale-month-th" style="width: ${(m.pct * TIMELINE_SHARE_PCT / 100).toFixed(3)}%; text-align: center; border: 1px solid #cbd5e1; background-color: #f8fafc;" title="${m.title} (${m.daysInMonth} días)">
              <div style="font-weight: 800; color: #1e3a8a; font-size: 7pt; text-transform: uppercase; white-space: nowrap;">${months.length <= 8 ? m.title : m.shortTitle}</div>
              <div style="font-size: 6pt; color: #64748b; font-weight: 600; white-space: nowrap;">${m.daysInMonth} días</div>
            </th>
          `).join('')}
        </tr>
      `;
    } else if (normScale === 'semanas') {
      scaleHeaderHtml = `
        <tr class="gantt-scale-row-months" style="background-color: #e2e8f0; font-size: 6.5pt;">
          ${months.map(m => `
            <th colspan="${m.weeks.length}" class="gantt-scale-month-th" style="text-align: center; border: 1px solid #cbd5e1; background-color: #f1f5f9; font-weight: 800; color: #1e3a8a; text-transform: uppercase; white-space: nowrap;">
              ${m.weeks.length >= 3 ? m.title : m.shortTitle} (${m.daysInMonth}d)
            </th>
          `).join('')}
        </tr>
        <tr class="gantt-scale-row-weeks" style="background-color: #f8fafc; font-size: 6pt;">
          ${allWeeks.map(w => `
            <th class="gantt-scale-week-th" style="width: ${(w.pct * TIMELINE_SHARE_PCT / 100).toFixed(3)}%; text-align: center; border: 1px solid #cbd5e1;" title="${w.fullLabel} (${w.range})">
              <div style="font-weight: 800; color: #1e293b; white-space: nowrap;">${allWeeks.length <= 14 ? w.semLabel : w.label}</div>
              <div style="font-size: 5.3pt; color: #64748b; font-family: monospace; white-space: nowrap;">${w.range}</div>
            </th>
          `).join('')}
        </tr>
      `;
    } else {
      // Escala DÍAS: SIEMPRE muestra Meses arriba + cada Día del mes y su letra (L, M, M, J, V, S, D) abajo
      scaleHeaderHtml = `
        <tr class="gantt-scale-row-months" style="background-color: #e2e8f0; font-size: 6.5pt;">
          ${months.map(m => `
            <th colspan="${m.days.length}" class="gantt-scale-month-th" style="text-align: center; border: 1px solid #cbd5e1; background-color: #f1f5f9; font-weight: 800; color: #1e3a8a; text-transform: uppercase; white-space: nowrap;">
              ${m.days.length >= 10 ? m.title : m.shortTitle}
            </th>
          `).join('')}
        </tr>
        <tr class="gantt-scale-row-days" style="background-color: #f8fafc; font-size: 5.5pt;">
          ${allDays.map(d => `
            <th class="gantt-scale-day-th" style="width: ${(d.pct * TIMELINE_SHARE_PCT / 100).toFixed(3)}%; text-align: center; border: 1px solid #cbd5e1; ${d.isNonWorking ? 'background-color: #fef3c7; color: #b45309;' : (d.isWeekend ? 'background-color: #f1f5f9; color: #475569;' : 'color: #1e293b;')}" title="${d.dateStr}">
              <div style="font-weight: 800; font-family: monospace; line-height: 1.05;">${d.dayNum}</div>
              <div style="font-size: 5pt; font-weight: 800; line-height: 1.05;">${d.letter}</div>
            </th>
          `).join('')}
        </tr>
      `;
    }

    return `
      <div class="gantt-print-sheet" style="width: 100%; box-sizing: border-box;">
        <!-- Encabezado Institucional -->
        <div class="doc-header">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
            <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px;">
              <div style="font-size: 11pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
                ${escapeHtml(companyName)}
              </div>
              <h1 class="doc-title" style="font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
                PROGRAMA DE OBRA Y DIAGRAMA DE GANTT
              </h1>
              <div style="font-size: 9.5pt; font-weight: 700; color: #475569; line-height: 1.2;">
                <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8.5pt;">Proyecto: </span>${escapeHtml(projectName)}
                ${totalSheetsCount > 1 ? `<span style="margin-left: 8px; color: #1e40af; font-weight: 800; font-size: 8pt;">• HOJA ${sheetIdx + 1} DE ${totalSheetsCount} (${sliceStartStr} al ${sliceEndStr})</span>` : ''}
              </div>
            </div>
          </div>

          <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px; text-align: right; font-size: 8pt; line-height: 1.35;">
            <div><strong>Fecha de emisión:</strong> ${currentDate}</div>
            <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
            <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span> &nbsp;<strong>Escala:</strong> <span class="meta-tag font-bold" style="color: #0369a1; background: #e0f2fe; border-color: #bae6fd; font-size: 7.5pt; padding: 1px 6px;">${getScaleLabel(normScale)}</span></div>
            <div><strong>Plazo Contractual:</strong> <span class="meta-tag font-mono font-bold" style="font-size: 7.5pt; padding: 1px 6px; background:#eff6ff; color:#1e40af; border-color:#bfdbfe;">${totalDurationDays} días naturales</span> &nbsp;<strong>Moneda:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span></div>
          </div>
        </div>

        ${isFirstSheet ? `
          <!-- Bloque de Tarjetas Resumen Ejecutivo -->
          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px;">
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
              <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Presupuesto Base</span>
              <div style="font-size: 10pt; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">${formatMoney(grandTotal)}</div>
              <span style="font-size: 6.5pt; color: #94a3b8;">100% Contratado</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
              <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Fecha de Inicio</span>
              <div style="font-size: 10pt; font-weight: 800; color: #1e40af; font-family: monospace; margin-top: 2px;">${minDateStr}</div>
              <span style="font-size: 6.5pt; color: #94a3b8;">Arranque de obra</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
              <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Fecha Conclusión</span>
              <div style="font-size: 10pt; font-weight: 800; color: #1e40af; font-family: monospace; margin-top: 2px;">${maxDateStr}</div>
              <span style="font-size: 6.5pt; color: #94a3b8;">Entrega contractual</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
              <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Plazo de Ejecución</span>
              <div style="font-size: 10pt; font-weight: 900; color: #047857; font-family: monospace; margin-top: 2px;">${totalDurationDays} días</div>
              <span style="font-size: 6.5pt; color: #94a3b8;">Días naturales (${getScaleLabel(normScale)})</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
              <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Total Actividades</span>
              <div style="font-size: 10pt; font-weight: 800; color: #475569; font-family: monospace; margin-top: 2px;">${scheduleData.items.length}</div>
              <span style="font-size: 6.5pt; color: #94a3b8;">${partidasCount} partidas • ${conceptosCount} conc.</span>
            </div>
          </div>
        ` : ''}

        <!-- Tabla Unificada: Catálogo de Obra + Diagrama de Gantt -->
        <table class="report-table gantt-print-table" style="width: 100%; border-collapse: collapse; font-size: 7.5pt;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a;">
              <th rowspan="${headerRowsCount}" style="width: 22px;" class="text-center">Niv</th>
              <th rowspan="${headerRowsCount}" style="width: 48px;" class="text-center">Clave</th>
              <th rowspan="${headerRowsCount}" class="text-left" style="min-width: 155px;">Concepto de Obra / Descripción</th>
              <th rowspan="${headerRowsCount}" style="width: 28px;" class="text-center">Unid</th>
              <th rowspan="${headerRowsCount}" style="width: 38px;" class="text-right">Volumen</th>
              <th rowspan="${headerRowsCount}" style="width: 46px;" class="text-center">Inicio</th>
              <th rowspan="${headerRowsCount}" style="width: 46px;" class="text-center">Fin</th>
              <th rowspan="${headerRowsCount}" style="width: 28px;" class="text-center">Días</th>
              <th colspan="${colSpanCount}" class="text-center" style="background-color: #0f172a !important; color: #ffffff !important; font-weight: 800; letter-spacing: 0.04em; padding: 4px 6px !important;">
                CRONOGRAMA GENERAL - ${getScaleLabel(normScale).toUpperCase()} (${totalSheetsCount > 1 ? `DEL ${sliceStartStr} AL ${sliceEndStr} • ${totalDays} DÍAS` : `${totalDurationDays} DÍAS NATURALES`})
              </th>
            </tr>
            ${scaleHeaderHtml}
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot>
            <tr style="background-color: #0f172a; color: #ffffff; font-weight: 800; white-space: nowrap !important;">
              <td colspan="5" class="text-right" style="white-space: nowrap !important; text-transform: uppercase; font-size: 7pt; color: #ffffff; padding: 5px 6px; border: 1px solid #1e293b;">
                TOTALES CONSOLIDADOS DEL PROGRAMA DE OBRA:
              </td>
              <td class="text-center font-mono" style="white-space: nowrap !important; color: #ffffff; font-size: 7pt; font-weight: 800; border: 1px solid #1e293b; padding: 5px 3px;">${formatPrintDate(minDateStr)}</td>
              <td class="text-center font-mono" style="white-space: nowrap !important; color: #ffffff; font-size: 7pt; font-weight: 800; border: 1px solid #1e293b; padding: 5px 3px;">${formatPrintDate(maxDateStr)}</td>
              <td class="text-center font-mono" style="white-space: nowrap !important; color: #ffffff; font-size: 7pt; font-weight: 800; border: 1px solid #1e293b; padding: 5px 3px;">${totalDurationDays}d</td>
              <td colspan="${colSpanCount}" class="text-center" style="white-space: nowrap !important; padding: 5px 6px; background-color: #0f172a; color: #ffffff; vertical-align: middle; border: 1px solid #1e293b;">
                <span style="white-space: nowrap !important; font-size: 6.5pt; font-weight: 800; color: #ffffff; letter-spacing: 0.01em; text-transform: uppercase; display: inline-block;">
                  PLAZO TOTAL: ${totalDurationDays} DÍAS NATURALES (${minDateStr} AL ${maxDateStr}) • ESCALA: ${getScaleLabel(normScale).toUpperCase()}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>

        ${isLastSheet ? `
          <!-- Resumen y Notas Generales -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px;">
            <div style="font-size: 7.5pt; color: #64748b; max-width: 680px; line-height: 1.45;">
              <p style="margin: 0 0 3px 0;"><strong>Consideraciones técnicas del programa de obra:</strong></p>
              <p style="margin: 0;">• Las fechas de inicio y terminación han sido calendarizadas considerando rendimientos oficiales de cuadrillas, tiempos de fraguado, secuencias constructivas y suministro continuo de materiales.</p>
              <p style="margin: 2px 0 0 0;">• Las actividades críticas deberán ser supervisadas periódicamente para evitar desviaciones sobre la ruta crítica del proyecto.</p>
              <p style="margin: 2px 0 0 0;">• Cronograma emitido bajo escala <strong>${getScaleLabel(normScale)}</strong> comprendiendo un plazo total de <strong>${totalDurationDays} días naturales</strong>.</p>
            </div>

            <div class="summary-card" style="width: 290px;">
              <div class="summary-row">
                <span style="color: #475569;">Fecha Arranque:</span>
                <span class="font-mono font-bold">${minDateStr}</span>
              </div>
              <div class="summary-row">
                <span style="color: #475569;">Fecha Entrega:</span>
                <span class="font-mono font-bold">${maxDateStr}</span>
              </div>
              <div class="summary-row">
                <span style="color: #475569;">Plazo Contractual:</span>
                <span class="font-mono font-bold" style="color: #1e40af;">${totalDurationDays} días naturales</span>
              </div>
              <div class="summary-row summary-total">
                <span>MONTO PROGRAMADO:</span>
                <span class="font-mono" style="color: #047857;">${formatMoney(grandTotal)}</span>
              </div>
            </div>
          </div>

          <!-- Área de Firmas Institucionales -->
          <div class="signatures-grid">
            <div class="signature-box">
              <strong>PROGRAMÓ Y CONTROLÓ</strong>
              <span>Departamento de Programación y Control de Obra</span>
            </div>
            <div class="signature-box">
              <strong>REVISÓ</strong>
              <span>Coordinación de Costos e Ingeniería de Obra</span>
            </div>
            <div class="signature-box">
              <strong>AUTORIZÓ / RESIDENCIA</strong>
              <span>Dirección General de Obra y Supervisión</span>
            </div>
          </div>
        ` : `
          <div class="gantt-page-break" style="page-break-after: always; break-after: page; height: 0; margin: 0; padding: 0;"></div>
        `}
      </div>
    `;
  });

  return `
    <style>
      @media print {
        @page {
          size: letter landscape !important;
          margin: 6mm 8mm 8mm 8mm !important;
        }
        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          background-color: #ffffff !important;
        }
        .page-container {
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .gantt-page-break {
          page-break-after: always !important;
          break-after: page !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      }
      .gantt-print-table th, .gantt-print-table td {
        padding: 3px 4px !important;
        font-size: 7pt !important;
      }
      .gantt-print-table th.gantt-scale-day-th {
        padding: 1.5px 0px !important;
        font-size: 5.5pt !important;
      }
      .gantt-print-table th.gantt-scale-week-th {
        padding: 2px 1px !important;
        font-size: 5.8pt !important;
      }
      .gantt-print-table th.gantt-scale-month-th {
        padding: 2.5px 2px !important;
        font-size: 6.5pt !important;
      }
      .gantt-print-table td.gantt-timeline-cell {
        padding: 0 !important;
      }
      .gantt-print-table tfoot tr, .gantt-print-table tfoot td {
        white-space: nowrap !important;
      }
    </style>

    ${sheetsHtml.join('')}
  `;
}

// -------------------------------------------------------------
// CONSTRUCTOR 2: IMPRESIÓN MODO PROGRAMA FINANCIERO (LANDSCAPE)
// Adaptable Dinámicamente para Evitar Desbordamientos y Cortes
// -------------------------------------------------------------
function buildFinancialPrintHtml({
  scheduleData,
  periods,
  scale,
  cfg,
  companyName,
  companyLogo,
  projectName,
  projectLocation,
  currentDate,
  currencySymbol,
  currencyCode
}) {
  const { periodTotals, grandTotalObra, picoPeriod, picoMonto } = scheduleData;
  const n = periods.length;

  let minDate = null;
  let maxDate = null;
  scheduleData.items.forEach(it => {
    if (!it.isParent) {
      if (it.startDate) {
        const s = parseDate(it.startDate);
        if (!minDate || s < minDate) minDate = s;
      }
      if (it.endDate) {
        const e = parseDate(it.endDate);
        if (!maxDate || e > maxDate) maxDate = e;
      }
    }
  });

  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const minDateStr = formatDate(minDate);
  const maxDateStr = formatDate(maxDate);
  const totalDurationDays = Math.max(1, diffDays(minDate, maxDate) + 1);

  // Adaptación dinámica del horizonte temporal para evitar que se corte información
  // En hoja horizontal Carta (Letter Landscape):
  // Si n <= 16: se emite en 1 sola hoja ajustando zoom y compactación.
  // Si n > 16: se pagina equilibradamente por bloques de períodos (hojas secuenciales),
  // repitiendo el catálogo de conceptos a la izquierda y presentando totales consolidados en la última hoja.
  const MAX_PERIODS_PER_SHEET = 16;
  const totalSheets = Math.max(1, Math.ceil(n / MAX_PERIODS_PER_SHEET));
  const periodsPerSheet = Math.ceil(n / totalSheets);

  const sheetsHtml = [];

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    const startIdx = sheetIdx * periodsPerSheet;
    const endIdx = Math.min(n, (sheetIdx + 1) * periodsPerSheet);
    const sheetPeriods = periods.slice(startIdx, endIdx);
    const numSheetPeriods = sheetPeriods.length;
    const isFirstSheet = (sheetIdx === 0);
    const isLastSheet = (sheetIdx === totalSheets - 1);

    // Ajustes tipográficos adaptativos según la densidad de períodos en la hoja
    const isVeryCompact = numSheetPeriods > 13;
    const isCompact = numSheetPeriods > 9;
    const colFontSize = isVeryCompact ? '5.2pt' : (isCompact ? '5.8pt' : '6.5pt');
    const headerFontSize = isVeryCompact ? '5.5pt' : (isCompact ? '6pt' : '6.5pt');
    const headerSubFontSize = isVeryCompact ? '4.8pt' : (isCompact ? '5pt' : '5.5pt');
    const colPadding = isVeryCompact ? '1px 1px' : (isCompact ? '2px 2px' : '2px 3px');

    // Estimación de ancho total para cálculo de auto-escalado (zoom)
    // Ancho imprimible disponible en Letter Landscape con márgenes 5-6mm: ~1015px
    const FIXED_LEFT_COLS_WIDTH = 16 + 38 + 130 + 20 + 28 + 38 + 48; // 318px
    const FIXED_RIGHT_COLS_WIDTH = 48 + 28; // 76px (solo en última hoja)
    const periodColEstWidth = isVeryCompact ? 38 : (isCompact ? 42 : 48);
    const estimatedTableWidth = FIXED_LEFT_COLS_WIDTH + (isLastSheet ? FIXED_RIGHT_COLS_WIDTH : 0) + (numSheetPeriods * periodColEstWidth);
    const availableWidth = 1015;
    const zoomFactor = estimatedTableWidth > availableWidth
      ? Math.min(1.0, Math.max(0.70, Math.floor((availableWidth / estimatedTableWidth) * 100) / 100))
      : 1.0;

    // Título descriptivo del rango cubierto en esta hoja
    const sheetFirstPeriod = sheetPeriods[0];
    const sheetLastPeriod = sheetPeriods[sheetPeriods.length - 1];
    const sheetCoverageTitle = (sheetFirstPeriod && sheetLastPeriod)
      ? `${sheetFirstPeriod.label} al ${sheetLastPeriod.label}`
      : `Períodos ${startIdx + 1} a ${endIdx}`;

    // Filas de conceptos para esta hoja
    const tableRows = scheduleData.items.map(item => {
      const isParent = item.isParent;
      const isLevel1 = item.level === 1;
      const isLevel2 = item.level === 2 && isParent;
      const indentPx = (item.level - 1) * 8 + 3;

      let rowBg = '#ffffff';
      let claveStyle = 'font-weight: 600; color: #1e293b;';
      let descStyle = 'color: #334155;';

      if (isLevel1) {
        rowBg = '#f1f5f9';
        claveStyle = 'font-weight: 800; color: #0f172a;';
        descStyle = 'font-weight: 800; text-transform: uppercase; color: #0f172a;';
      } else if (isLevel2) {
        rowBg = '#f8fafc';
        claveStyle = 'font-weight: 700; color: #1e293b;';
        descStyle = 'font-weight: 700; color: #1e293b;';
      }

      const pctPond = grandTotalObra > 0 ? ((item.totalImporte || item.importe || 0) / grandTotalObra) * 100 : 0;
      const unidad = isParent ? '-' : (item.unidad || 'pza');
      const cantidad = isParent ? '-' : formatQty(item.cantidad || 0);
      const pu = isParent ? '-' : formatMoney(item.precioUnitario || 0);
      const totalItemImp = isParent ? (item.totalImporte || 0) : (item.importe || 0);

      // Celdas de períodos de esta hoja
      const periodCells = sheetPeriods.map(p => {
        const d = item.periodData ? item.periodData[p.key] : null;
        const imp = d ? d.importe : 0;

        if (isParent) {
          return `
            <td class="text-right font-mono font-bold" style="padding: ${colPadding}; font-size: ${colFontSize}; border: 1px solid #cbd5e1; background-color: ${rowBg}; color: ${imp > 0 ? '#1e3a8a' : '#94a3b8'}; white-space: nowrap;">
              ${imp > 0 ? formatCurrency(imp, currencySymbol) : '-'}
            </td>
          `;
        } else {
          return `
            <td class="text-right font-mono" style="padding: ${colPadding}; font-size: ${colFontSize}; border: 1px solid #cbd5e1; background-color: #ffffff; color: ${imp > 0 ? '#047857' : '#cbd5e1'}; font-weight: ${imp > 0 ? '600' : 'normal'}; white-space: nowrap;">
              ${imp > 0 ? formatCurrency(imp, currencySymbol) : '-'}
            </td>
          `;
        }
      }).join('');

      return `
        <tr style="background-color: ${rowBg};">
          <td class="text-center font-mono" style="font-size: 6pt; color: #64748b; width: 16px; border: 1px solid #cbd5e1;">${item.level}</td>
          <td class="font-mono text-center" style="${claveStyle} width: 38px; white-space: nowrap; font-size: 6.5pt; border: 1px solid #cbd5e1;">${escapeHtml(item.clave || '-')}</td>
          <td class="text-left" style="${descStyle} padding-left: ${indentPx}px; width: 130px; max-width: 140px; font-size: 6.5pt; border: 1px solid #cbd5e1; word-break: break-word; line-height: 1.25;">
            ${escapeHtml(item.descripcion || 'Sin descripción')}
          </td>
          <td class="text-center font-mono" style="width: 20px; font-size: 6pt; border: 1px solid #cbd5e1;">${escapeHtml(unidad)}</td>
          <td class="text-right font-mono" style="width: 28px; font-size: 6pt; border: 1px solid #cbd5e1;">${cantidad}</td>
          <td class="text-right font-mono" style="width: 38px; font-size: 6pt; border: 1px solid #cbd5e1;">${pu}</td>
          <td class="text-right font-mono font-bold" style="width: 48px; font-size: 6.5pt; border: 1px solid #cbd5e1; background-color: ${isLevel1 ? '#e2e8f0' : (isLevel2 ? '#f1f5f9' : '#f8fafc')}; color: #0f172a; white-space: nowrap;">
            ${formatCurrency(totalItemImp, currencySymbol)}
          </td>

          ${periodCells}

          ${isLastSheet ? `
            <td class="text-right font-mono font-bold" style="width: 48px; font-size: 6.5pt; border: 1px solid #cbd5e1; background-color: #eff6ff; color: #1e40af; white-space: nowrap;">
              ${formatCurrency(totalItemImp, currencySymbol)}
            </td>
            <td class="text-center font-mono font-bold" style="width: 28px; font-size: 6pt; border: 1px solid #cbd5e1; background-color: #eff6ff; color: #1e40af; white-space: nowrap;">
              ${pctPond.toFixed(1)}%
            </td>
          ` : ''}
        </tr>
      `;
    }).join('');

    // Encabezado de períodos (semana / día / mes) en 2 niveles compactos
    const periodHeadersHtml = sheetPeriods.map(p => {
      let mainLabel = '';
      let subLabel = '';

      if (scale === 'semanas') {
        mainLabel = `Sem ${p.index}`;
        const sDate = p.startDate;
        subLabel = `${String(sDate.getDate()).padStart(2, '0')}/${String(sDate.getMonth() + 1).padStart(2, '0')}`;
      } else if (scale === 'dias') {
        const dowNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const sDate = p.startDate;
        mainLabel = `${dowNames[sDate.getDay()]} ${p.index}`;
        subLabel = `${String(sDate.getDate()).padStart(2, '0')}/${String(sDate.getMonth() + 1).padStart(2, '0')}`;
      } else {
        // meses
        mainLabel = p.label;
        subLabel = '';
      }

      return `
        <th class="text-center font-mono font-bold" 
            style="padding: ${colPadding}; font-size: ${colFontSize}; background-color: #f8fafc; color: #1e3a8a; border: 1px solid #cbd5e1; white-space: nowrap; min-width: 34px;" 
            title="${p.fullLabel || p.label}">
          <div style="font-weight: 800; font-size: ${headerFontSize}; line-height: 1.1; white-space: nowrap;">${escapeHtml(mainLabel)}</div>
          ${subLabel ? `<div style="font-size: ${headerSubFontSize}; color: #64748b; font-weight: 600; line-height: 1.1; white-space: nowrap;">${escapeHtml(subLabel)}</div>` : ''}
        </th>
      `;
    }).join('');

    sheetsHtml.push(`
      <div class="financial-print-sheet" style="zoom: ${zoomFactor}; width: 100%; box-sizing: border-box;">
        <!-- Encabezado Institucional -->
        <div class="doc-header">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 68px; width: 68px; min-width: 68px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
            <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 68px;">
              <div style="font-size: 10.5pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
                ${escapeHtml(companyName)}
              </div>
              <h1 class="doc-title" style="font-size: 11pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
                PROGRAMA FINANCIERO DE OBRA (CALENDARIO VALORIZADO)
              </h1>
              <div style="font-size: 9pt; font-weight: 700; color: #475569; line-height: 1.2;">
                <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8pt;">Proyecto: </span>${escapeHtml(projectName)}
                ${totalSheets > 1 ? `<span style="margin-left: 8px; color: #1e40af; font-weight: 800; font-size: 8pt;">• HOJA ${sheetIdx + 1} DE ${totalSheets} (${escapeHtml(sheetCoverageTitle)})</span>` : ''}
              </div>
            </div>
          </div>

          <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 68px; text-align: right; font-size: 7.5pt; line-height: 1.35;">
            <div><strong>Fecha de emisión:</strong> ${currentDate}</div>
            <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
            <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span> &nbsp;<strong>Escala:</strong> <span class="meta-tag font-bold" style="color: #0369a1; background: #e0f2fe; border-color: #bae6fd; font-size: 7.5pt; padding: 1px 6px;">${getScaleLabel(scale)}</span></div>
            <div><strong>Plazo Contractual:</strong> <span class="meta-tag font-mono font-bold" style="font-size: 7.5pt; padding: 1px 6px; background:#eff6ff; color:#1e40af; border-color:#bfdbfe;">${totalDurationDays} días naturales</span> &nbsp;<strong>Moneda:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span></div>
          </div>
        </div>

        ${isFirstSheet ? `
          <!-- Bloque de Tarjetas Resumen Ejecutivo (En la Primera Hoja) -->
          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 10px;">
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px;">
              <span style="font-size: 6.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Presupuesto Base</span>
              <div style="font-size: 9.5pt; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 1px;">${formatCurrency(grandTotalObra, currencySymbol)}</div>
              <span style="font-size: 6pt; color: #94a3b8;">100% Contratado</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px;">
              <span style="font-size: 6.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Período Pico (Máx Inversión)</span>
              <div style="font-size: 9.5pt; font-weight: 800; color: #1e40af; font-family: monospace; margin-top: 1px;">${formatCurrency(picoMonto, currencySymbol)}</div>
              <span style="font-size: 6pt; color: #94a3b8;">${picoPeriod ? picoPeriod.label : '-'}</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px;">
              <span style="font-size: 6.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Inicio de Obra</span>
              <div style="font-size: 9.5pt; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 1px;">${minDateStr}</div>
              <span style="font-size: 6pt; color: #94a3b8;">Arranque contractual</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px;">
              <span style="font-size: 6.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Conclusión Estimada</span>
              <div style="font-size: 9.5pt; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 1px;">${maxDateStr}</div>
              <span style="font-size: 6pt; color: #94a3b8;">Entrega física de obra</span>
            </div>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px;">
              <span style="font-size: 6.5pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Horizonte Temporal</span>
              <div style="font-size: 9.5pt; font-weight: 900; color: #047857; font-family: monospace; margin-top: 1px;">${periods.length} períodos</div>
              <span style="font-size: 6pt; color: #94a3b8;">Distribuido en ${getScaleLabel(scale)}</span>
            </div>
          </div>
        ` : ''}

        <!-- Tabla del Programa Financiero para esta Hoja -->
        <table class="report-table financial-print-table" style="width: 100%; border-collapse: collapse; font-size: 6.5pt; margin-bottom: 8px;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff;">
              <th colspan="7" class="text-left" style="padding: 4px 6px; font-weight: 800; letter-spacing: 0.03em; font-size: 6.5pt;">
                CATÁLOGO GENERAL DE CONCEPTOS DE OBRA
              </th>
              <th colspan="${numSheetPeriods}" class="text-center" style="background-color: #1e3a8a; padding: 4px 6px; font-weight: 800; letter-spacing: 0.03em; font-size: 6.5pt;">
                DISTRIBUCIÓN FINANCIERA PROGRAMADA (${getScaleLabel(scale).toUpperCase()})
              </th>
              ${isLastSheet ? `
                <th colspan="2" class="text-center" style="background-color: #0f172a; padding: 4px 6px; font-weight: 800; letter-spacing: 0.03em; font-size: 6.5pt;">
                  TOTALES
                </th>
              ` : ''}
            </tr>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-size: 6pt;">
              <th style="width: 16px; min-width: 16px; max-width: 18px;" class="text-center">Niv</th>
              <th style="width: 38px; min-width: 36px; max-width: 42px;" class="text-center">Clave</th>
              <th style="width: 130px; min-width: 120px; max-width: 140px;" class="text-left">Concepto de Obra</th>
              <th style="width: 20px; min-width: 20px; max-width: 24px;" class="text-center">Unid</th>
              <th style="width: 28px; min-width: 28px; max-width: 32px;" class="text-right">Cant</th>
              <th style="width: 38px; min-width: 38px; max-width: 42px;" class="text-right">P.U. ($)</th>
              <th style="width: 48px; min-width: 46px; max-width: 52px;" class="text-right">Total Base</th>

              ${periodHeadersHtml}

              ${isLastSheet ? `
                <th style="width: 48px; min-width: 46px; max-width: 52px;" class="text-right font-bold bg-blue-50 text-blue-900">Total Prog.</th>
                <th style="width: 28px; min-width: 26px; max-width: 32px;" class="text-center font-bold bg-blue-50 text-blue-900">% Pond.</th>
              ` : ''}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
          <tfoot style="border-top: 2px solid #0f172a; white-space: nowrap !important; background-color: #ffffff;">
            <!-- Fila 1: Total Período -->
            <tr style="background-color: #ffffff; color: #0f172a; font-weight: 800; font-size: 6.5pt; border-bottom: 1px solid #cbd5e1; white-space: nowrap !important;">
              <td colspan="7" class="text-right font-bold" style="text-transform: uppercase; padding: 4px 6px; color: #0f172a; font-weight: 800; white-space: nowrap !important; border: 1px solid #cbd5e1; font-size: 6.5pt;">
                TOTAL INVERSIÓN PERÍODO ($):
              </td>
              ${sheetPeriods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td class="text-right font-mono font-bold" style="padding: ${colPadding}; font-size: ${colFontSize}; color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important;">
                    ${formatCurrency(tot ? tot.importe : 0, currencySymbol)}
                  </td>
                `;
              }).join('')}
              ${isLastSheet ? `
                <td class="text-right font-mono font-black" style="color: #0f172a; padding: 3px 4px; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6.5pt;">${formatCurrency(grandTotalObra, currencySymbol)}</td>
                <td class="text-center font-mono font-bold" style="color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6.5pt;">100%</td>
              ` : ''}
            </tr>

            <!-- Fila 2: % Avance Período -->
            <tr style="background-color: #ffffff; color: #0f172a; font-size: 6pt; font-weight: 800; border-bottom: 1px solid #cbd5e1; white-space: nowrap !important;">
              <td colspan="7" class="text-right font-bold" style="text-transform: uppercase; padding: 3px 6px; color: #0f172a; font-weight: 800; white-space: nowrap !important; border: 1px solid #cbd5e1; font-size: 6pt;">
                % AVANCE FÍSICO / FINANCIERO PERÍODO:
              </td>
              ${sheetPeriods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td class="text-right font-mono font-bold" style="padding: ${colPadding}; font-size: ${colFontSize}; color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important;">
                    ${tot ? tot.pctPeriodo.toFixed(2) : '0.00'}%
                  </td>
                `;
              }).join('')}
              ${isLastSheet ? `
                <td class="text-right font-mono font-bold" style="padding: 3px 4px; color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6pt;">100.00%</td>
                <td class="text-center font-mono font-bold" style="color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6pt;">-</td>
              ` : ''}
            </tr>

            <!-- Fila 3: Total Acumulado -->
            <tr style="background-color: #ffffff; color: #0f172a; font-weight: 800; font-size: 6.5pt; border-bottom: 1px solid #cbd5e1; white-space: nowrap !important;">
              <td colspan="7" class="text-right font-bold" style="text-transform: uppercase; padding: 4px 6px; color: #0f172a; font-weight: 800; white-space: nowrap !important; border: 1px solid #cbd5e1; font-size: 6.5pt;">
                TOTAL INVERSIÓN ACUMULADA ($):
              </td>
              ${sheetPeriods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td class="text-right font-mono font-bold" style="padding: ${colPadding}; font-size: ${colFontSize}; color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important;">
                    ${formatCurrency(tot ? tot.importeAcumulado : 0, currencySymbol)}
                  </td>
                `;
              }).join('')}
              ${isLastSheet ? `
                <td class="text-right font-mono font-black" style="color: #0f172a; padding: 3px 4px; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6.5pt;">${formatCurrency(grandTotalObra, currencySymbol)}</td>
                <td class="text-center font-mono font-bold" style="color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6.5pt;">-</td>
              ` : ''}
            </tr>

            <!-- Fila 4: % Avance Acumulado (Curva S) -->
            <tr style="background-color: #ffffff; color: #0f172a; font-weight: 800; font-size: 6.5pt; white-space: nowrap !important;">
              <td colspan="7" class="text-right font-bold" style="text-transform: uppercase; padding: 3px 6px; color: #0f172a; font-weight: 800; white-space: nowrap !important; border: 1px solid #cbd5e1; font-size: 6.5pt;">
                % AVANCE ACUMULADO (CURVA "S"):
              </td>
              ${sheetPeriods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td class="text-right font-mono font-bold" style="padding: ${colPadding}; font-size: ${colFontSize}; color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important;">
                    ${tot ? tot.pctAcumulado.toFixed(2) : '0.00'}%
                  </td>
                `;
              }).join('')}
              ${isLastSheet ? `
                <td class="text-right font-mono font-black" style="color: #0f172a; padding: 3px 4px; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6.5pt;">100.00%</td>
                <td class="text-center font-mono font-bold" style="color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1; white-space: nowrap !important; font-size: 6.5pt;">100%</td>
              ` : ''}
            </tr>
          </tfoot>
        </table>

        ${isLastSheet ? `
          <!-- Resumen y Notas Generales (Solo en la Última Hoja) -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 10px;">
            <div style="font-size: 7pt; color: #64748b; max-width: 680px; line-height: 1.4;">
              <p style="margin: 0 0 2px 0;"><strong>Consideraciones técnicas del programa financiero:</strong></p>
              <p style="margin: 0;">• Los montos programados corresponden al calendario valorizado de erogaciones y flujo de fondos requeridos para la ejecución continua del proyecto.</p>
              <p style="margin: 2px 0 0 0;">• El período de mayor exigencia financiera corresponde a <strong>${picoPeriod ? picoPeriod.label : '-'}</strong> con un importe programado de <strong>${formatCurrency(picoMonto, currencySymbol)}</strong>.</p>
              <p style="margin: 2px 0 0 0;">• Programa financiero proyectado en <strong>${getScaleLabel(scale)}</strong> para un plazo total de <strong>${totalDurationDays} días naturales</strong>.</p>
            </div>

            <div class="summary-card" style="width: 280px; padding: 8px 10px;">
              <div class="summary-row" style="font-size: 7pt; padding: 2px 0;">
                <span style="color: #475569;">Presupuesto Base:</span>
                <span class="font-mono font-bold">${formatCurrency(grandTotalObra, currencySymbol)}</span>
              </div>
              <div class="summary-row" style="font-size: 7pt; padding: 2px 0;">
                <span style="color: #475569;">Inversión Máx. (Pico):</span>
                <span class="font-mono font-bold" style="color: #1e40af;">${formatCurrency(picoMonto, currencySymbol)}</span>
              </div>
              <div class="summary-row" style="font-size: 7pt; padding: 2px 0;">
                <span style="color: #475569;">Plazo Contractual:</span>
                <span class="font-mono font-bold">${totalDurationDays} días naturales</span>
              </div>
              <div class="summary-row summary-total" style="font-size: 7.5pt; padding: 3px 0; margin-top: 2px;">
                <span>MONTO CONTRATADO:</span>
                <span class="font-mono" style="color: #047857;">${formatCurrency(grandTotalObra, currencySymbol)}</span>
              </div>
            </div>
          </div>

          <!-- Área de Firmas Institucionales -->
          <div class="signatures-grid" style="margin-top: 14px;">
            <div class="signature-box" style="padding-top: 6px;">
              <strong>PROGRAMÓ Y CONTROLÓ</strong>
              <span>Departamento de Programación y Control de Obra</span>
            </div>
            <div class="signature-box" style="padding-top: 6px;">
              <strong>REVISÓ</strong>
              <span>Coordinación de Costos e Ingeniería de Obra</span>
            </div>
            <div class="signature-box" style="padding-top: 6px;">
              <strong>AUTORIZÓ / RESIDENCIA</strong>
              <span>Dirección General de Obra y Supervisión</span>
            </div>
          </div>
        ` : ''}

        ${!isLastSheet ? `
          <div class="financial-page-break" style="page-break-after: always; break-after: page; height: 0; margin: 0; padding: 0;"></div>
        ` : ''}
      </div>
    `);
  }

  return `
    <style>
      @media print {
        @page {
          size: letter landscape !important;
          margin: 5mm 6mm 6mm 6mm !important;
        }
        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          background-color: #ffffff !important;
        }
        .page-container {
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .financial-print-sheet {
          width: 100% !important;
        }
        .financial-page-break {
          page-break-after: always !important;
          break-after: page !important;
          height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      }
      .financial-print-table th, .financial-print-table td {
        border: 1px solid #cbd5e1 !important;
      }
      .financial-print-table tfoot tr,
      .financial-print-table tfoot td {
        white-space: nowrap !important;
        background-color: #ffffff !important;
        color: #0f172a !important;
        font-weight: 800 !important;
      }
    </style>

    ${sheetsHtml.join('')}
  `;
}

// -------------------------------------------------------------
// CONSTRUCTOR 3: IMPRESIÓN MODO CURVA "S" Y FLUJO (LANDSCAPE)
// -------------------------------------------------------------
function buildCurvaSPrintHtml({
  scheduleData,
  periods,
  scale,
  cfg,
  companyName,
  companyLogo,
  projectName,
  projectLocation,
  currentDate,
  currencySymbol,
  currencyCode
}) {
  const { periodTotals, grandTotalObra, picoPeriod, picoMonto } = scheduleData;
  const n = periods.length;

  let minDate = null;
  let maxDate = null;
  scheduleData.items.forEach(it => {
    if (!it.isParent) {
      if (it.startDate) {
        const s = parseDate(it.startDate);
        if (!minDate || s < minDate) minDate = s;
      }
      if (it.endDate) {
        const e = parseDate(it.endDate);
        if (!maxDate || e > maxDate) maxDate = e;
      }
    }
  });

  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const minDateStr = formatDate(minDate);
  const maxDateStr = formatDate(maxDate);
  const totalDurationDays = Math.max(1, diffDays(minDate, maxDate) + 1);

  // Parámetros del gráfico SVG vectorial de alta resolución para hoja horizontal
  const svgW = 1040;
  const svgH = 310;
  const padLeft = 70;
  const padRight = 70;
  const padTop = 32;
  const padBottom = 55;
  const chartW = svgW - padLeft - padRight; // 900px
  const chartH = svgH - padTop - padBottom; // 223px

  // Puntos de la Curva S y coordenadas de barras
  const maxBarMonto = Math.max(1, picoMonto);
  const points = [];
  const barElements = [];

  periods.forEach((p, idx) => {
    const tot = periodTotals[p.key] || { importe: 0, pctPeriodo: 0, importeAcumulado: 0, pctAcumulado: 0 };
    const x = padLeft + (idx / Math.max(1, n - 1)) * chartW;
    const y = padTop + chartH - (tot.pctAcumulado / 100) * chartH;

    points.push({
      x,
      y,
      pct: tot.pctAcumulado,
      pctPeriodo: tot.pctPeriodo,
      importe: tot.importe,
      importeAcumulado: tot.importeAcumulado,
      label: p.shortLabel || p.label
    });

    // Barras de flujo de fondos por periodo
    const barWidth = Math.max(6, Math.min(36, (chartW / n) * 0.52));
    const barHeight = (tot.importe / maxBarMonto) * (chartH * 0.72);
    const barY = padTop + chartH - barHeight;
    const barX = x - (barWidth / 2);

    barElements.push(`
      <rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}"
            fill="#93c5fd" fill-opacity="0.75" stroke="#2563eb" stroke-width="1.2" rx="2" />
      ${(n <= 18 && tot.importe > 0) ? `
        <text x="${x.toFixed(1)}" y="${(barY - 4).toFixed(1)}" font-size="5.5pt" font-family="monospace" font-weight="700" fill="#1e40af" text-anchor="middle">
          ${formatMoney(tot.importe)}
        </text>
      ` : ''}
    `);
  });

  const polylineStr = points.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  const areaPolygonStr = `${points[0].x.toFixed(1)},${(padTop + chartH).toFixed(1)} ${polylineStr} ${points[points.length - 1].x.toFixed(1)},${(padTop + chartH).toFixed(1)}`;

  // Línea de corte / Hoy
  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);
  let todayLineHtml = '';
  if (n > 0) {
    const pStart0 = periods[0].startDate;
    const pEndLast = periods[n - 1].endDate;
    const totalDaysCurva = Math.max(1, diffDays(pStart0, pEndLast) + 1);
    const daysOffset = diffDays(pStart0, todayDate);
    if (daysOffset >= 0 && daysOffset <= totalDaysCurva) {
      const frac = Math.max(0, Math.min(1, daysOffset / (totalDaysCurva - 1)));
      const todayX = padLeft + frac * chartW;
      todayLineHtml = `
        <line x1="${todayX.toFixed(1)}" y1="${padTop - 8}" x2="${todayX.toFixed(1)}" y2="${(padTop + chartH).toFixed(1)}" stroke="#dc2626" stroke-width="2" stroke-dasharray="4 2" />
        <rect x="${(todayX - 32).toFixed(1)}" y="${(padTop - 20).toFixed(1)}" width="64" height="15" rx="3" fill="#dc2626" />
        <text x="${todayX.toFixed(1)}" y="${(padTop - 9).toFixed(1)}" font-size="6pt" font-family="sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">
          HOY / CORTE
        </text>
      `;
    }
  }

  // Ejes horizontales y etiquetas de porcentaje
  const gridSteps = [0, 20, 40, 60, 80, 100];
  const gridLinesHtml = gridSteps.map(pctVal => {
    const yLine = padTop + chartH - (pctVal / 100) * chartH;
    const moneyVal = (grandTotalObra * (pctVal / 100));
    return `
      <line x1="${padLeft}" y1="${yLine.toFixed(1)}" x2="${padLeft + chartW}" y2="${yLine.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="${pctVal === 0 ? '0' : '3 3'}" />
      <text x="${(padLeft - 8)}" y="${(yLine + 3).toFixed(1)}" font-size="6.5pt" font-family="sans-serif" font-weight="700" fill="#475569" text-anchor="end">${pctVal}%</text>
      <text x="${(padLeft + chartW + 8)}" y="${(yLine + 3).toFixed(1)}" font-size="6.5pt" font-family="monospace" font-weight="700" fill="#047857" text-anchor="start">${formatMoney(moneyVal)}</text>
    `;
  }).join('');

  // Nodos y etiquetas de la curva S
  const nodesHtml = points.map((pt, idx) => {
    const showLabel = (n <= 20) || (idx === 0) || (idx === n - 1) || (idx % 2 === 0);
    return `
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4" fill="#1e3a8a" stroke="#ffffff" stroke-width="1.8" />
      ${showLabel ? `
        <text x="${pt.x.toFixed(1)}" y="${(pt.y - 7).toFixed(1)}" font-size="6.5pt" font-family="monospace" font-weight="800" fill="#1e3a8a" text-anchor="middle">
          ${pt.pct.toFixed(1)}%
        </text>
      ` : ''}
      <text x="${pt.x.toFixed(1)}" y="${(padTop + chartH + 16).toFixed(1)}" font-size="6pt" font-family="sans-serif" font-weight="600" fill="#475569" text-anchor="middle">
        ${escapeHtml(pt.label)}
      </text>
    `;
  }).join('');

  // Filas de la tabla de desglose periodo a periodo
  const breakdownRows = periods.map((p, idx) => {
    const tot = periodTotals[p.key] || { importe: 0, pctPeriodo: 0, importeAcumulado: 0, pctAcumulado: 0 };
    return `
      <tr>
        <td class="text-center font-mono" style="font-size: 7pt; color: #64748b; width: 32px;">${idx + 1}</td>
        <td class="text-left font-bold" style="font-size: 7pt; color: #1e3a8a;">${escapeHtml(p.fullLabel || p.label)}</td>
        <td class="text-center font-mono" style="font-size: 7pt; color: #475569;">${p.days || 7}d</td>
        <td class="text-right font-mono font-bold" style="font-size: 7pt; color: #0f172a;">${formatMoney(tot.importe)}</td>
        <td class="text-right font-mono" style="font-size: 7pt; color: #334155;">${tot.pctPeriodo.toFixed(2)}%</td>
        <td class="text-right font-mono font-bold" style="font-size: 7pt; color: #047857;">${formatMoney(tot.importeAcumulado)}</td>
        <td class="text-right font-mono font-extrabold" style="font-size: 7.5pt; color: #1e40af;">${tot.pctAcumulado.toFixed(2)}%</td>
        <td style="width: 130px; padding: 4px 8px; vertical-align: middle;">
          <div style="width: 100%; height: 9px; background-color: #e2e8f0; border-radius: 3px; overflow: hidden;">
            <div style="width: ${tot.pctAcumulado.toFixed(1)}%; height: 100%; background: linear-gradient(90deg, #2563eb 0%, #1e40af 100%);"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <style>
      @media print {
        @page {
          size: letter landscape !important;
          margin: 6mm 8mm 8mm 8mm !important;
        }
        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          background-color: #ffffff !important;
        }
        .page-container {
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
      }
      .curva-s-table th, .curva-s-table td {
        padding: 4px 6px !important;
        font-size: 7pt !important;
        border: 1px solid #cbd5e1;
      }
    </style>

    <!-- Encabezado Institucional -->
    <div class="doc-header">
      <div style="display: flex; align-items: center; gap: 14px;">
        ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
        <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px;">
          <div style="font-size: 11pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
            ${escapeHtml(companyName)}
          </div>
          <h1 class="doc-title" style="font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
            PROGRAMA DE OBRA: CURVA "S" Y FLUJO FINANCIERO DE INVERSIÓN
          </h1>
          <div style="font-size: 9.5pt; font-weight: 700; color: #475569; line-height: 1.2;">
            <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8.5pt;">Proyecto: </span>${escapeHtml(projectName)}
          </div>
        </div>
      </div>

      <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px; text-align: right; font-size: 8pt; line-height: 1.35;">
        <div><strong>Fecha de emisión:</strong> ${currentDate}</div>
        <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
        <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span> &nbsp;<strong>Escala:</strong> <span class="meta-tag font-bold" style="color: #0369a1; background: #e0f2fe; border-color: #bae6fd; font-size: 7.5pt; padding: 1px 6px;">${getScaleLabel(scale)}</span></div>
        <div><strong>Plazo Contractual:</strong> <span class="meta-tag font-mono font-bold" style="font-size: 7.5pt; padding: 1px 6px; background:#eff6ff; color:#1e40af; border-color:#bfdbfe;">${totalDurationDays} días naturales</span> &nbsp;<strong>Moneda:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span></div>
      </div>
    </div>

    <!-- Bloque de Tarjetas Resumen Ejecutivo -->
    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px;">
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
        <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Presupuesto Base</span>
        <div style="font-size: 10pt; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">${formatMoney(grandTotalObra)}</div>
        <span style="font-size: 6.5pt; color: #94a3b8;">100% Contratado</span>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
        <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Período Pico (Máx Inversión)</span>
        <div style="font-size: 10pt; font-weight: 800; color: #1e40af; font-family: monospace; margin-top: 2px;">${formatMoney(picoMonto)}</div>
        <span style="font-size: 6.5pt; color: #94a3b8;">${picoPeriod ? picoPeriod.label : '-'}</span>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
        <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Inicio de Obra</span>
        <div style="font-size: 10pt; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 2px;">${minDateStr}</div>
        <span style="font-size: 6.5pt; color: #94a3b8;">Arranque contractual</span>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
        <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Conclusión Estimada</span>
        <div style="font-size: 10pt; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 2px;">${maxDateStr}</div>
        <span style="font-size: 6.5pt; color: #94a3b8;">Entrega física de obra</span>
      </div>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
        <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Horizonte Temporal</span>
        <div style="font-size: 10pt; font-weight: 900; color: #047857; font-family: monospace; margin-top: 2px;">${periods.length} períodos</div>
        <span style="font-size: 6.5pt; color: #94a3b8;">${getScaleLabel(scale)}</span>
      </div>
    </div>

    <!-- Gráfico SVG Vectorial: Curva S y Flujo de Fondos -->
    <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
        <span style="font-size: 8.5pt; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.02em;">
          PROYECCIÓN DE AVANCE ACUMULADO (CURVA "S") Y FLUJO DE EFECTIVO PERIÓDICO
        </span>
        <!-- Leyenda Institucional -->
        <div style="display: flex; align-items: center; gap: 14px; font-size: 7pt; font-weight: 600;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 12px; height: 10px; background-color: #93c5fd; border: 1px solid #2563eb; border-radius: 2px;"></div>
            <span>Inversión por Período ($)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 16px; height: 3px; background-color: #1e3a8a; border-radius: 2px;"></div>
            <div style="width: 6px; height: 6px; background-color: #1e3a8a; border-radius: 50%; margin-left: -10px;"></div>
            <span>Curva S (% Acumulado)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <div style="width: 14px; height: 2px; background-color: #dc2626; border-top: 2px dashed #dc2626;"></div>
            <span style="color: #dc2626;">Día Actual / Corte</span>
          </div>
        </div>
      </div>

      <svg viewBox="0 0 ${svgW} ${svgH}" style="width: 100%; height: auto; max-height: 290px; display: block; overflow: visible;">
        <defs>
          <linearGradient id="printCurvaAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#2563eb" stop-opacity="0.22" />
            <stop offset="100%" stop-color="#2563eb" stop-opacity="0.02" />
          </linearGradient>
        </defs>

        <!-- Rejilla y Ejes Horizontales -->
        ${gridLinesHtml}

        <!-- Barras de Flujo de Efectivo -->
        ${barElements.join('')}

        <!-- Área Sombreada de la Curva S -->
        <polygon points="${areaPolygonStr}" fill="url(#printCurvaAreaGrad)" />

        <!-- Trazo Vectorial de la Curva S -->
        <polyline points="${polylineStr}" fill="none" stroke="#1e3a8a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Nodos y Etiquetas de Porcentaje -->
        ${nodesHtml}

        <!-- Línea de HOY / CORTE -->
        ${todayLineHtml}
      </svg>
    </div>

    <!-- Tabla Detallada Periodo a Periodo -->
    <table class="report-table curva-s-table" style="width: 100%; border-collapse: collapse; font-size: 7.5pt;">
      <thead>
        <tr style="background-color: #0f172a; color: #ffffff;">
          <th style="width: 32px;" class="text-center">#</th>
          <th class="text-left" style="min-width: 180px;">Período / Rango Temporal</th>
          <th style="width: 44px;" class="text-center">Plazo</th>
          <th style="width: 90px;" class="text-right">Inversión Período ($)</th>
          <th style="width: 60px;" class="text-right">% Parcial</th>
          <th style="width: 95px;" class="text-right">Inversión Acumulada ($)</th>
          <th style="width: 70px;" class="text-right">% Acumulado</th>
          <th style="width: 130px;" class="text-center">Avance Gráfico</th>
        </tr>
      </thead>
      <tbody>
        ${breakdownRows}
      </tbody>
      <tfoot style="background-color: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a;">
        <tr>
          <td colspan="3" class="text-right" style="text-transform: uppercase; padding: 6px 8px; color: #0f172a; font-size: 7.5pt;">
            TOTALES CONSOLIDADOS DEL PROGRAMA:
          </td>
          <td class="text-right font-mono" style="color: #047857; font-size: 8pt;">${formatMoney(grandTotalObra)}</td>
          <td class="text-right font-mono" style="color: #0f172a; font-size: 8pt;">100.00%</td>
          <td class="text-right font-mono" style="color: #047857; font-size: 8pt;">${formatMoney(grandTotalObra)}</td>
          <td class="text-right font-mono" style="color: #1e40af; font-size: 8pt;">100.00%</td>
          <td class="text-center font-mono font-bold" style="color: #1e40af; font-size: 7pt;">100% COMPLETO</td>
        </tr>
      </tfoot>
    </table>

    <!-- Resumen y Notas Generales -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px;">
      <div style="font-size: 7.5pt; color: #64748b; max-width: 680px; line-height: 1.45;">
        <p style="margin: 0 0 3px 0;"><strong>Consideraciones técnicas de la Curva S y flujo de fondos:</strong></p>
        <p style="margin: 0;">• La Curva "S" representa la trayectoria acumulada estándar de inversión y avance de obra física/financiera a lo largo del plazo contractual.</p>
        <p style="margin: 2px 0 0 0;">• Las desviaciones entre el avance real y la Curva "S" programada deberán ser reportadas en bitácora para aplicar medidas correctivas de reprogramación.</p>
        <p style="margin: 2px 0 0 0;">• Proyección temporal bajo <strong>${getScaleLabel(scale)}</strong> para un plazo total de <strong>${totalDurationDays} días naturales</strong>.</p>
      </div>

      <div class="summary-card" style="width: 290px;">
        <div class="summary-row">
          <span style="color: #475569;">Presupuesto Base:</span>
          <span class="font-mono font-bold">${formatMoney(grandTotalObra)}</span>
        </div>
        <div class="summary-row">
          <span style="color: #475569;">Inversión Máx. (Pico):</span>
          <span class="font-mono font-bold" style="color: #1e40af;">${formatMoney(picoMonto)}</span>
        </div>
        <div class="summary-row">
          <span style="color: #475569;">Plazo Contractual:</span>
          <span class="font-mono font-bold">${totalDurationDays} días naturales</span>
        </div>
        <div class="summary-row summary-total">
          <span>MONTO PROGRAMADO:</span>
          <span class="font-mono" style="color: #047857;">${formatMoney(grandTotalObra)}</span>
        </div>
      </div>
    </div>

    <!-- Área de Firmas Institucionales -->
    <div class="signatures-grid">
      <div class="signature-box">
        <strong>PROGRAMÓ Y CONTROLÓ</strong>
        <span>Departamento de Programación y Control de Obra</span>
      </div>
      <div class="signature-box">
        <strong>REVISÓ</strong>
        <span>Coordinación de Costos e Ingeniería de Obra</span>
      </div>
      <div class="signature-box">
        <strong>AUTORIZÓ / RESIDENCIA</strong>
        <span>Dirección General de Obra y Supervisión</span>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 4. IMPRIMIR FORMATO "CALENDARIO DE OBRA"
// DETECCIÓN AUTOMÁTICA DE VISTA ACTIVA (GANTT, FINANCIERO, CURVA S) Y ESCALA (DÍAS, SEMANAS, MESES)
// -------------------------------------------------------------
export function printCalendarioObraFormat() {
  if (!state.treeData || state.treeData.length === 0) {
    showToast('No hay conceptos en el Catálogo Base para generar el Calendario de Obra.', 'warning');
    return;
  }

  const currentDate = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const currencySymbol = getCurrencySymbol();
  const currencyCode = getCurrencyCode();
  const _printBranding = resolveActivePrintBranding(state.settings);
  const companyName = _printBranding.companyName;
  const companyLogo = _printBranding.companyLogo;
  const projectName = (state.settings && state.settings.projectName) || 'Proyecto de Obra Base';
  const projectLocation = (state.settings && state.settings.projectLocation) || '';

  const cfg = getScheduleSettings();
  const viewMode = cfg.viewMode || 'gantt'; // 'gantt' | 'financiero' | 'curva_s'
  const scale = normalizePrintScale(cfg.scale || cfg.timeScale || 'dias'); // 'dias' | 'semanas' | 'meses'

  const rawItems = extractScheduleItems(state.treeData);
  ensureInitialDates(rawItems, cfg.startDate);
  const periods = generateTimePeriods(rawItems, scale, cfg.startDate);
  const scheduleData = calculateScheduleDistribution(rawItems, periods);

  let minDate = null;
  let maxDate = null;
  scheduleData.items.forEach(it => {
    if (!it.isParent) {
      if (it.startDate) {
        const s = parseDate(it.startDate);
        if (!minDate || s < minDate) minDate = s;
      }
      if (it.endDate) {
        const e = parseDate(it.endDate);
        if (!maxDate || e > maxDate) maxDate = e;
      }
    }
  });

  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate < minDate) maxDate = addDays(minDate, 30);

  const cleanProjectName = projectName.replace(/[^a-zA-Z0-9_\-]/g, '_');

  let bodyContent = '';
  let docTitle = '';

  if (viewMode === 'financiero') {
    docTitle = `Programa_Financiero_${scale}_${cleanProjectName}`;
    bodyContent = buildFinancialPrintHtml({
      scheduleData,
      periods,
      scale,
      cfg,
      companyName,
      companyLogo,
      projectName,
      projectLocation,
      currentDate,
      currencySymbol,
      currencyCode
    });
  } else if (viewMode === 'curva_s') {
    docTitle = `Curva_S_Flujo_${scale}_${cleanProjectName}`;
    bodyContent = buildCurvaSPrintHtml({
      scheduleData,
      periods,
      scale,
      cfg,
      companyName,
      companyLogo,
      projectName,
      projectLocation,
      currentDate,
      currencySymbol,
      currencyCode
    });
  } else {
    // Modo por defecto: 'gantt'
    docTitle = `Programa_Obra_Gantt_${scale}_${cleanProjectName}`;
    bodyContent = buildGanttPrintHtml({
      scheduleData,
      minDate,
      maxDate,
      scale,
      cfg,
      companyName,
      companyLogo,
      projectName,
      projectLocation,
      currentDate,
      currencySymbol,
      currencyCode
    });
  }

  openPrintWindow(docTitle, bodyContent, 'landscape');
}


// -------------------------------------------------------------
// 5. IMPRIMIR FORMATO "ESTIMACIONES DE OBRA"
// Incluye:
//   - Hoja 1: RESUMEN DE LA ESTIMACIÓN (solo conceptos con cantidad > 0 en "Esta Estimación (Actual) -> Cantidad Eje")
//   - Hoja 2+ (Opcional en vista previa): CATÁLOGO GENERAL COMPLETO Y ESTADO DE CUENTA
// -------------------------------------------------------------
export async function printEstimacionesFormat() {
  const data = getEstimacionesCalculatedData();
  const { activeEst, rows, kpis } = data;

  if (!rows || rows.length === 0) {
    showToast('No hay conceptos en el Catálogo Base para generar la Estimación de Obra.', 'warning');
    return;
  }

  const currentDate = new Date().toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const currencySymbol = getCurrencySymbol();
  const currencyCode = getCurrencyCode();
  const _printBranding = resolveActivePrintBranding(state.settings);
  const companyName = _printBranding.companyName;
  const companyLogo = _printBranding.companyLogo;
  const projectName = (state.settings && state.settings.projectName) || 'Proyecto de Obra Base';
  const projectLocation = (state.settings && state.settings.projectLocation) || '';

  // =============================================================
  // A) CONSTRUIR "RESUMEN DE LA ESTIMACIÓN" (SOLO CANT EJE > 0)
  // =============================================================
  const totalLeafConcepts = rows.filter(r => !r.isParent).length;
  const resumenRows = [];
  let executedLeafCount = 0;
  let executedPartidasLevel1Count = 0;
  let sumResumenImporteAnt = 0;
  let sumResumenImporteBase = 0;
  let sumResumenTotalAcum = 0;
  let sumResumenTotalSaldo = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.isParent) {
      if (Number(row.cantEje) > 0) {
        executedLeafCount++;
        sumResumenImporteAnt += Number(row.importeAnt) || 0;
        sumResumenImporteBase += Number(row.importeBase) || 0;
        sumResumenTotalAcum += Number(row.totalAcum) || 0;
        sumResumenTotalSaldo += Number(row.totalSaldo) || 0;
        resumenRows.push(row);
      }
    } else {
      let executedCount = 0;
      let executedTotalEje = 0;
      let executedImporteBase = 0;
      let executedImporteAnt = 0;
      let executedTotalAcum = 0;
      let executedTotalSaldo = 0;

      for (let j = i + 1; j < rows.length; j++) {
        const desc = rows[j];
        if (desc.level <= row.level) break;
        if (!desc.isParent && Number(desc.cantEje) > 0) {
          executedCount++;
          executedTotalEje += Number(desc.totalEje) || 0;
          executedImporteBase += Number(desc.importeBase) || 0;
          executedImporteAnt += Number(desc.importeAnt) || 0;
          executedTotalAcum += Number(desc.totalAcum) || 0;
          executedTotalSaldo += Number(desc.totalSaldo) || 0;
        }
      }

      if (executedCount > 0) {
        if (row.level === 1) executedPartidasLevel1Count++;
        resumenRows.push({
          ...row,
          executedCount,
          executedTotalEje,
          executedImporteBase,
          executedImporteAnt,
          executedTotalAcum,
          executedTotalSaldo
        });
      }
    }
  }

  const liquidoFinalCobrar = kpis.iva && kpis.iva.pct > 0
    ? kpis.iva.totalConIva
    : kpis.anticipo.netoEstaEstimacion;

  const resumenTableRowsHtml = resumenRows.length > 0
    ? resumenRows.map(row => {
        if (row.isParent) {
          const isLevel1 = row.level === 1;
          const indentPx = (row.level - 1) * 12;
          const rowBg = isLevel1 ? '#f1f5f9' : '#f8fafc';
          const fontBold = isLevel1 ? 'font-weight: 800;' : 'font-weight: 700;';
          const textColor = isLevel1 ? '#0f172a' : '#1e293b';

          return `
            <tr style="background-color: ${rowBg}; ${fontBold} color: ${textColor};">
              <td class="text-center font-mono" style="font-size: 7pt; color: #64748b; width: 22px; border: 1px solid #cbd5e1;">${row.level}</td>
              <td class="text-center font-mono" style="width: 48px; font-weight: 800; color: #1e3a8a; border: 1px solid #cbd5e1; white-space: nowrap;">${escapeHtml(row.clave || 'PART')}</td>
              <td class="text-justify" style="padding-left: ${indentPx + 6}px; text-transform: uppercase; border: 1px solid #cbd5e1; font-size: 7pt; line-height: 1.35;">
                ${escapeHtml(row.descripcion || 'Partida')}
                <span style="font-size: 6.5pt; font-weight: 600; color: #047857; text-transform: none; margin-left: 6px;">(${row.executedCount} conc. con avance)</span>
              </td>
              <td class="text-center font-mono" style="width: 30px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
              <!-- Contratado -->
              <td class="text-center font-mono" style="width: 48px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
              <td class="text-center font-mono" style="width: 56px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
              <!-- Anterior -->
              <td class="text-center font-mono" style="width: 48px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
              <td class="text-right font-mono font-bold" style="width: 68px; color: #1e293b; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.executedImporteAnt)}</td>
              <!-- Esta Estimación (Actual) -->
              <td class="text-center font-mono" style="width: 54px; color: #047857; background-color: #ecfdf5; border: 1px solid #cbd5e1;">-</td>
              <td class="text-right font-mono font-bold" style="width: 76px; color: #047857; background-color: #ecfdf5; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.executedTotalEje)}</td>
              <!-- Acumulado y Saldo -->
              <td class="text-center font-mono" style="width: 48px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
              <td class="text-center font-mono font-bold" style="width: 38px; color: #1e3a8a; border: 1px solid #cbd5e1; white-space: nowrap;">${row.pctAvanceAcum.toFixed(1)}%</td>
              <td class="text-center font-mono" style="width: 48px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
            </tr>
          `;
        } else {
          const indentPx = (row.level - 1) * 12 + 6;
          return `
            <tr style="background-color: #ffffff;">
              <td class="text-center font-mono" style="font-size: 6.5pt; color: #64748b; width: 22px; border: 1px solid #cbd5e1;">${row.level}</td>
              <td class="text-center font-mono" style="width: 48px; font-weight: 700; color: #1e40af; border: 1px solid #cbd5e1; white-space: nowrap;">${escapeHtml(row.clave)}</td>
              <td class="text-justify" style="padding-left: ${indentPx}px; line-height: 1.35; font-size: 7pt; border: 1px solid #cbd5e1; word-break: break-word;">
                ${escapeHtml(row.descripcion || 'Sin descripción')}
              </td>
              <td class="text-center font-mono" style="width: 30px; font-size: 6.8pt; color: #475569; border: 1px solid #cbd5e1;">${escapeHtml(row.unidad || 'pza')}</td>
              <!-- Contratado -->
              <td class="text-right font-mono" style="width: 48px; font-size: 6.8pt; border: 1px solid #cbd5e1;">${formatQty(row.cantBase)}</td>
              <td class="text-right font-mono" style="width: 56px; font-size: 6.8pt; border: 1px solid #cbd5e1;">${formatMoney(row.pu)}</td>
              <!-- Acumulado Anterior -->
              <td class="text-right font-mono" style="width: 48px; font-size: 6.8pt; border: 1px solid #cbd5e1; color: #475569;">${formatQty(row.cantAnt)}</td>
              <td class="text-right font-mono font-semibold" style="width: 68px; font-size: 6.8pt; border: 1px solid #cbd5e1; color: #1e293b; white-space: nowrap;">${formatMoney(row.importeAnt)}</td>
              <!-- Esta Estimación (Actual): Cantidad Eje e Importe -->
              <td class="text-right font-mono" style="width: 54px; font-size: 7pt; font-weight: 800; color: #047857; background-color: #ecfdf5; border: 1px solid #cbd5e1;">${formatQty(row.cantEje)}</td>
              <td class="text-right font-mono" style="width: 76px; font-size: 7pt; font-weight: 800; color: #047857; background-color: #ecfdf5; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.totalEje)}</td>
              <!-- Acumulado y Saldo -->
              <td class="text-right font-mono font-bold" style="width: 48px; font-size: 6.8pt; border: 1px solid #cbd5e1; color: #0f172a;">${formatQty(row.cantAcum)}</td>
              <td class="text-center font-mono font-bold" style="width: 38px; font-size: 6.8pt; border: 1px solid #cbd5e1; color: #1e3a8a; white-space: nowrap;">${row.pctAvanceAcum.toFixed(1)}%</td>
              <td class="text-right font-mono" style="width: 48px; font-size: 6.8pt; border: 1px solid #cbd5e1; color: #b45309;">${formatQty(row.cantSaldo)}</td>
            </tr>
          `;
        }
      }).join('')
    : `
      <tr>
        <td colspan="13" class="text-center" style="padding: 18px 12px; color: #64748b; font-style: italic; font-size: 8pt; background-color: #f8fafc; border: 1px solid #cbd5e1;">
          No existen conceptos con cantidad capturada en la columna <strong>"Esta Estimación (Actual) — Cantidad Eje"</strong> para <strong>${escapeHtml(activeEst.nombre)}</strong>.
        </td>
      </tr>
    `;

  // =============================================================
  // A.2) GENERAR UNA HOJA POR CADA CONCEPTO DEL RESUMEN + SUS FOTOS DE EVIDENCIA
  // =============================================================
  const conceptosParaHojasResumen = rows.filter(r => !r.isParent && (Number(r.cantEje) > 0 || (Array.isArray(r.fotos) && r.fotos.length > 0)));
  for (const row of conceptosParaHojasResumen) {
    if (!Array.isArray(row.fotos)) continue;
    for (const foto of row.fotos) {
      if (foto && !foto.displayUrl && (foto.mediaId || foto.s3Key)) {
        try {
          foto.displayUrl = await resolveManagedFileDataUrl(foto) || '';
        } catch (err) {
          console.warn('Error resolviendo foto de estimación para impresión:', err);
        }
      }
    }
  }
  const hojasConceptosConFotosHtml = conceptosParaHojasResumen.map((row, idx) => {
    const fotos = Array.isArray(row.fotos) ? row.fotos.slice(0, 2) : [];
    const f1 = fotos[0] || null;
    const f2 = fotos[1] || null;

    const renderFotoBox = (fotoObj, numSlot) => {
      if (fotoObj && fotoObj.displayUrl) {
        return `
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background-color: #ffffff; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="background-color: #0f172a; color: #ffffff; padding: 5px 10px; font-size: 7.5pt; font-weight: 800; display: flex; justify-content: space-between; align-items: center;">
              <span>FOTOGRAFÍA ${numSlot} — CLAVE ${escapeHtml(row.clave)}</span>
              <span style="color: #94a3b8; font-weight: 600; font-size: 6.8pt;">${escapeHtml(activeEst.nombre)}</span>
            </div>
            <div style="height: 295px; background-color: #f8fafc; display: flex; align-items: center; justify-content: center; padding: 6px; overflow: hidden;">
              <img src="${escapeHtml(fotoObj.displayUrl)}"
                   referrerpolicy="no-referrer"
                   alt="Evidencia Fotográfica ${numSlot} - ${escapeHtml(row.clave)}"
                   style="max-width: 100%; max-height: 280px; width: auto; height: auto; object-fit: contain; border-radius: 4px;">
            </div>
            <div style="padding: 6px 10px; border-top: 1px solid #e2e8f0; background-color: #f8fafc; font-size: 7.5pt; color: #1e293b; min-height: 28px;">
              <strong>Descripción / Pie de foto ${numSlot}:</strong> ${escapeHtml(fotoObj.nota || `Evidencia de ejecución del concepto ${row.clave} en ${activeEst.nombre}`)}
            </div>
          </div>
        `;
      }
      return `
        <div style="border: 1px dashed #cbd5e1; border-radius: 8px; overflow: hidden; background-color: #f8fafc; display: flex; flex-direction: column; justify-content: space-between;">
          <div style="background-color: #334155; color: #ffffff; padding: 5px 10px; font-size: 7.5pt; font-weight: 700; display: flex; justify-content: space-between;">
            <span>FOTOGRAFÍA ${numSlot} — CLAVE ${escapeHtml(row.clave)}</span>
            <span style="font-size: 6.8pt; color: #cbd5e1;">Espacio de evidencia</span>
          </div>
          <div style="height: 295px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; font-size: 8pt; padding: 12px; text-align: center;">
            <span>Sin enlace fotográfico asignado en Fotografía ${numSlot}</span>
          </div>
          <div style="padding: 6px 10px; border-top: 1px solid #e2e8f0; background-color: #ffffff; font-size: 7.5pt; color: #64748b; min-height: 28px;">
            <strong>Observaciones:</strong> ____________________________________________________________________________
          </div>
        </div>
      `;
    };

    return `
      <div class="page-break hoja-concepto-fotografico" style="padding-top: 4px;">
        <div class="preview-divider-banner">
          RESUMEN DE ESTIMACIÓN — HOJA DE CONCEPTO Y REPORTE FOTOGRÁFICO (${idx + 1} DE ${conceptosParaHojasResumen.length})
        </div>

        <!-- Encabezado Institucional de la Hoja del Concepto -->
        <div class="doc-header">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 68px; width: 68px; min-width: 68px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
            <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 68px;">
              <div style="font-size: 10.5pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
                ${escapeHtml(companyName)}
              </div>
              <h2 class="doc-title" style="font-size: 11pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2;">
                RESUMEN DE ESTIMACIÓN (CONCEPTO Y REPORTE FOTOGRÁFICO) — ${escapeHtml(activeEst.nombre.toUpperCase())}
              </h2>
              <div style="font-size: 9pt; font-weight: 700; color: #475569; line-height: 1.2;">
                <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8pt;">Partida: </span>${escapeHtml(row.partidaNombre || 'General')}
              </div>
            </div>
          </div>

          <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 68px; text-align: right; font-size: 7.8pt; line-height: 1.35;">
            <div><strong>Concepto en Resumen:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">Hoja ${idx + 1} de ${conceptosParaHojasResumen.length}</span></div>
            <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #0f172a; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
            <div><strong>Período:</strong> <span class="meta-tag font-mono font-medium" style="font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(activeEst.fechaInicio)} al ${escapeHtml(activeEst.fechaFin)}</span></div>
            <div><strong>Fecha de corte:</strong> ${escapeHtml(activeEst.fechaCorte || activeEst.fechaFin || currentDate)}</div>
          </div>
        </div>

        <!-- Tabla del Concepto Único en esta Hoja -->
        <table class="report-table estimacion-print-table" style="width: 100%; border-collapse: collapse; font-size: 7.2pt; margin-bottom: 10px;">
          <thead>
            <tr style="background-color: #0f172a; color: #ffffff;">
              <th style="width: 60px; padding: 4px 6px;" class="text-center">Clave</th>
              <th class="text-left" style="padding: 4px 8px;">Descripción del Concepto de Obra a Cobrar</th>
              <th style="width: 38px; padding: 4px 4px;" class="text-center">Unid</th>
              <th style="width: 58px; padding: 4px 6px; background-color: #1e3a8a;" class="text-right">Cant Base</th>
              <th style="width: 68px; padding: 4px 6px; background-color: #1e3a8a;" class="text-right">P.U. ($)</th>
              <th style="width: 58px; padding: 4px 6px; background-color: #334155;" class="text-right">Cant Ant</th>
              <th style="width: 68px; padding: 4px 6px; background-color: #047857;" class="text-right">Cant Eje</th>
              <th style="width: 88px; padding: 4px 6px; background-color: #047857;" class="text-right">Importe Eje ($)</th>
              <th style="width: 58px; padding: 4px 6px; background-color: #1e3a8a;" class="text-right">Cant Acum</th>
              <th style="width: 48px; padding: 4px 6px; background-color: #1e3a8a;" class="text-center">% Acum</th>
              <th style="width: 58px; padding: 4px 6px; background-color: #b45309;" class="text-right">Cant Saldo</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background-color: #ffffff;">
              <td class="text-center font-mono font-bold" style="color: #1e40af; padding: 6px; border: 1px solid #cbd5e1;">${escapeHtml(row.clave)}</td>
              <td class="text-justify" style="padding: 6px 8px; line-height: 1.38; font-weight: 600; color: #0f172a; border: 1px solid #cbd5e1;">
                ${escapeHtml(row.descripcion || 'Sin descripción')}
              </td>
              <td class="text-center font-mono" style="padding: 6px 4px; border: 1px solid #cbd5e1;">${escapeHtml(row.unidad || 'pza')}</td>
              <td class="text-right font-mono" style="padding: 6px; border: 1px solid #cbd5e1;">${formatQty(row.cantBase)}</td>
              <td class="text-right font-mono" style="padding: 6px; border: 1px solid #cbd5e1;">${formatMoney(row.pu)}</td>
              <td class="text-right font-mono" style="padding: 6px; border: 1px solid #cbd5e1; color: #475569;">${formatQty(row.cantAnt)}</td>
              <td class="text-right font-mono font-black" style="padding: 6px; border: 1px solid #cbd5e1; background-color: #ecfdf5; color: #047857; font-size: 8pt;">${formatQty(row.cantEje)}</td>
              <td class="text-right font-mono font-black" style="padding: 6px; border: 1px solid #cbd5e1; background-color: #ecfdf5; color: #047857; font-size: 8pt; white-space: nowrap;">${formatMoney(row.totalEje)}</td>
              <td class="text-right font-mono font-bold" style="padding: 6px; border: 1px solid #cbd5e1;">${formatQty(row.cantAcum)}</td>
              <td class="text-center font-mono font-bold" style="padding: 6px; border: 1px solid #cbd5e1; color: #1e3a8a;">${row.pctAvanceAcum.toFixed(1)}%</td>
              <td class="text-right font-mono font-bold" style="padding: 6px; border: 1px solid #cbd5e1; color: #b45309;">${formatQty(row.cantSaldo)}</td>
            </tr>
          </tbody>
        </table>

        <!-- Recuadros de las 2 Fotografías del Concepto -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px;">
          ${renderFotoBox(f1, 1)}
          ${renderFotoBox(f2, 2)}
        </div>

        <!-- Firmas al pie de cada hoja de concepto y reporte fotográfico -->
        <div class="signatures-grid" style="margin-top: 14px;">
          <div class="signature-box">
            <strong>ELABORÓ / CONTRATISTA</strong>
            <span>Superintendencia de Construcción</span>
          </div>
          <div class="signature-box">
            <strong>REVISÓ / SUPERVISIÓN</strong>
            <span>Supervisión Externa y Control de Calidad</span>
          </div>
          <div class="signature-box">
            <strong>AUTORIZÓ / RESIDENCIA</strong>
            <span>Dirección General de Obra y Supervisión</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // =============================================================
  // B) GENERAR FILAS DEL CATÁLOGO COMPLETO (VISTA OPCIONAL)
  // =============================================================
  const tableRows = rows.map(row => {
    if (row.isParent) {
      const isLevel1 = row.level === 1;
      const indentPx = (row.level - 1) * 12;

      let rowBg = isLevel1 ? '#f1f5f9' : '#f8fafc';
      let fontBold = isLevel1 ? 'font-weight: 800;' : 'font-weight: 700;';
      let textColor = isLevel1 ? '#0f172a' : '#1e293b';

      return `
        <tr style="background-color: ${rowBg}; ${fontBold} color: ${textColor};">
          <td class="text-center font-mono" style="font-size: 6.5pt; color: #64748b; width: 16px; border: 1px solid #cbd5e1;">${row.level}</td>
          <td class="text-center font-mono" style="width: 40px; font-weight: 800; color: #1e3a8a; border: 1px solid #cbd5e1; white-space: nowrap;">${escapeHtml(row.clave || 'PART')}</td>
          <td class="text-justify" style="padding-left: ${indentPx + 6}px; text-transform: uppercase; border: 1px solid #cbd5e1; font-size: 6.5pt; line-height: 1.3;">
            ${escapeHtml(row.descripcion || 'Partida')}
          </td>
          <td class="text-center font-mono text-muted" style="width: 24px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
          <!-- Base -->
          <td class="text-center font-mono text-muted" style="width: 42px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
          <td class="text-center font-mono text-muted" style="width: 48px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
          <td class="text-right font-mono font-bold" style="width: 62px; color: #0f172a; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.importeBase)}</td>
          <!-- Acumulado Anterior -->
          <td class="text-center font-mono text-muted" style="width: 42px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
          <td class="text-right font-mono font-bold" style="width: 62px; color: #1e293b; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.importeAnt)}</td>
          <!-- Esta Estimación -->
          <td class="text-center font-mono text-muted" style="width: 42px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
          <td class="text-right font-mono font-bold" style="width: 62px; color: ${row.totalEje > 0 ? '#047857' : '#0f172a'}; background-color: ${row.totalEje > 0 ? '#ecfdf5' : rowBg}; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.totalEje)}</td>
          <!-- Acumulado al Corte -->
          <td class="text-center font-mono text-muted" style="width: 42px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
          <td class="text-right font-mono font-bold" style="width: 62px; color: #0f172a; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.totalAcum)}</td>
          <td class="text-center font-mono font-bold" style="width: 32px; color: #1e3a8a; border: 1px solid #cbd5e1; white-space: nowrap;">${row.pctAvanceAcum.toFixed(1)}%</td>
          <!-- Saldo -->
          <td class="text-center font-mono text-muted" style="width: 42px; color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
          <td class="text-right font-mono font-bold" style="width: 62px; color: #b45309; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.totalSaldo)}</td>
        </tr>
      `;
    } else {
      const indentPx = (row.level - 1) * 12 + 6;
      const hasAvanceEsta = row.cantEje > 0;

      return `
        <tr style="background-color: #ffffff;">
          <td class="text-center font-mono" style="font-size: 6pt; color: #64748b; width: 16px; border: 1px solid #cbd5e1;">${row.level}</td>
          <td class="text-center font-mono" style="width: 40px; font-weight: 600; color: #1e40af; border: 1px solid #cbd5e1; white-space: nowrap;">${escapeHtml(row.clave)}</td>
          <td class="text-justify" style="padding-left: ${indentPx}px; line-height: 1.3; font-size: 6.5pt; border: 1px solid #cbd5e1; word-break: break-word;">
            ${escapeHtml(row.descripcion || 'Sin descripción')}
          </td>
          <td class="text-center font-mono" style="width: 24px; font-size: 6.5pt; color: #475569; border: 1px solid #cbd5e1;">${escapeHtml(row.unidad || 'pza')}</td>
          <!-- Base -->
          <td class="text-right font-mono" style="width: 42px; font-size: 6pt; border: 1px solid #cbd5e1;">${formatQty(row.cantBase)}</td>
          <td class="text-right font-mono" style="width: 48px; font-size: 6pt; border: 1px solid #cbd5e1;">${formatMoney(row.pu)}</td>
          <td class="text-right font-mono font-bold" style="width: 62px; font-size: 6.5pt; border: 1px solid #cbd5e1; white-space: nowrap;">${formatMoney(row.importeBase)}</td>
          <!-- Acumulado Anterior -->
          <td class="text-right font-mono" style="width: 42px; font-size: 6pt; border: 1px solid #cbd5e1; color: #475569;">${formatQty(row.cantAnt)}</td>
          <td class="text-right font-mono font-semibold" style="width: 62px; font-size: 6.5pt; border: 1px solid #cbd5e1; color: #1e293b; white-space: nowrap;">${formatMoney(row.importeAnt)}</td>
          <!-- Esta Estimación -->
          <td class="text-right font-mono" style="width: 42px; font-size: 6pt; border: 1px solid #cbd5e1; ${hasAvanceEsta ? 'font-weight: 700; color: #047857; background-color: #ecfdf5;' : 'color: #94a3b8;'}">${hasAvanceEsta ? formatQty(row.cantEje) : '-'}</td>
          <td class="text-right font-mono" style="width: 62px; font-size: 6.5pt; border: 1px solid #cbd5e1; white-space: nowrap; ${hasAvanceEsta ? 'font-weight: 700; color: #047857; background-color: #ecfdf5;' : 'color: #94a3b8;'}">${hasAvanceEsta ? formatMoney(row.totalEje) : '-'}</td>
          <!-- Acumulado al Corte -->
          <td class="text-right font-mono font-bold" style="width: 42px; font-size: 6pt; border: 1px solid #cbd5e1; color: #0f172a;">${formatQty(row.cantAcum)}</td>
          <td class="text-right font-mono font-bold" style="width: 62px; font-size: 6.5pt; border: 1px solid #cbd5e1; color: #0f172a; white-space: nowrap;">${formatMoney(row.totalAcum)}</td>
          <td class="text-center font-mono font-bold" style="width: 32px; font-size: 6pt; border: 1px solid #cbd5e1; color: #1e3a8a; white-space: nowrap;">${row.pctAvanceAcum.toFixed(1)}%</td>
          <!-- Saldo -->
          <td class="text-right font-mono" style="width: 42px; font-size: 6pt; border: 1px solid #cbd5e1; color: #b45309;">${formatQty(row.cantSaldo)}</td>
          <td class="text-right font-mono font-bold" style="width: 62px; font-size: 6.5pt; border: 1px solid #cbd5e1; color: #b45309; white-space: nowrap;">${formatMoney(row.totalSaldo)}</td>
        </tr>
      `;
    }
  }).join('');

  const bodyContent = `
    <style>
      @media print {
        @page {
          size: letter landscape !important;
          margin: 5mm 6mm 6mm 6mm !important;
        }
        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          background-color: #ffffff !important;
        }
        .page-container {
          max-width: 100% !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        .preview-divider-banner {
          display: none !important;
        }
      }
      .estimacion-print-table th, .estimacion-print-table td {
        border: 1px solid #cbd5e1 !important;
      }
      .estimacion-print-table tfoot tr,
      .estimacion-print-table tfoot td {
        white-space: nowrap !important;
      }
      .catalogo-completo-hidden {
        display: none !important;
      }
      .preview-divider-banner {
        margin: 26px 0 18px 0;
        padding: 8px 14px;
        background-color: #e2e8f0;
        border: 1px dashed #94a3b8;
        border-radius: 6px;
        text-align: center;
        font-size: 8.5pt;
        font-weight: 700;
        color: #334155;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
    </style>

    <!-- =========================================================================
         SECCIÓN 1: HOJA DE RESUMEN DE LA ESTIMACIÓN (SOLO CONCEPTOS CON CANT EJE > 0)
         ========================================================================= -->
    <div id="seccion-resumen-estimacion">
      <!-- Encabezado Institucional del Resumen de la Estimación -->
      <div class="doc-header">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
          <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px;">
            <div style="font-size: 11pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
              ${escapeHtml(companyName)}
            </div>
            <h1 class="doc-title" style="font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
              RESUMEN DE LA ESTIMACIÓN — ${escapeHtml(activeEst.nombre.toUpperCase())}
            </h1>
            <div style="font-size: 9.5pt; font-weight: 700; color: #475569; line-height: 1.2;">
              <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8.5pt;">Proyecto: </span>${escapeHtml(projectName)}
            </div>
          </div>
        </div>

        <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px; text-align: right; font-size: 8pt; line-height: 1.35;">
          <div><strong>Fecha de corte:</strong> ${escapeHtml(activeEst.fechaCorte || activeEst.fechaFin || currentDate)}</div>
          <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
          <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span></div>
          <div><strong>Estimación:</strong> <span class="meta-tag font-bold" style="color: #047857; background:#ecfdf5; border-color:#a7f3d0; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(activeEst.nombre)}</span> &nbsp;<strong>Período:</strong> <span class="meta-tag font-mono font-medium" style="font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(activeEst.fechaInicio)} al ${escapeHtml(activeEst.fechaFin)}</span> &nbsp;<strong>Moneda:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span></div>
        </div>
      </div>

      <!-- Tarjetas KPI del Resumen de Esta Estimación -->
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 10px;">
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <span style="font-size: 7pt; font-weight: 700; color: #1e3a8a; text-transform: uppercase; display: block;">Conceptos con Avance</span>
          <div style="font-size: 10pt; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">${executedLeafCount} <span style="font-size: 7.5pt; font-weight: 600; color: #64748b;">de ${totalLeafConcepts}</span></div>
          <span style="font-size: 6.5pt; color: #64748b;">En ${executedPartidasLevel1Count} partida(s) activa(s)</span>
        </div>
        <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 7px 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 7pt; font-weight: 700; color: #047857; text-transform: uppercase;">Esta Estimación</span>
            <span style="font-size: 6.5pt; font-weight: 700; color: #047857; background: #d1fae5; padding: 1px 4px; border-radius: 3px;">${kpis.pctAvanceEstaEstimacion.toFixed(2)}%</span>
          </div>
          <div style="font-size: 10pt; font-weight: 900; color: #047857; font-family: monospace; margin-top: 2px;">${formatMoney(kpis.grandTotalEjecutado)}</div>
          <span style="font-size: 6.5pt; color: #059669;">Suma de Cantidad Eje × P.U.</span>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <span style="font-size: 7pt; font-weight: 700; color: #b91c1c; text-transform: uppercase; display: block;">Amortización Anticipo (${kpis.anticipo.pct}%)</span>
          <div style="font-size: 10pt; font-weight: 900; color: #b91c1c; font-family: monospace; margin-top: 2px;">-${formatMoney(kpis.anticipo.amortizacionEsta)}</div>
          <span style="font-size: 6.5pt; color: #64748b;">Saldo x amortizar: ${formatMoney(kpis.anticipo.saldoPendiente)}</span>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <span style="font-size: 7pt; font-weight: 700; color: #0f172a; text-transform: uppercase; display: block;">Subtotal Neto ${kpis.iva && kpis.iva.pct > 0 ? `+ IVA (${kpis.iva.pct}%)` : ''}</span>
          <div style="font-size: 10pt; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">${formatMoney(kpis.anticipo.netoEstaEstimacion)}</div>
          <span style="font-size: 6.5pt; color: #64748b;">${kpis.iva && kpis.iva.pct > 0 ? `IVA: +${formatMoney(kpis.iva.estaEstimacion)}` : 'Sin IVA configurado'}</span>
        </div>
        <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 7px 10px;">
          <span style="font-size: 7pt; font-weight: 800; color: #047857; text-transform: uppercase; display: block;">Alcance Líquido a Cobrar</span>
          <div style="font-size: 10pt; font-weight: 900; color: #047857; font-family: monospace; margin-top: 2px;">${formatMoney(liquidoFinalCobrar)}</div>
          <span style="font-size: 6.5pt; color: #059669;">Total neto de esta estimación</span>
        </div>
      </div>

      <!-- Tabla de Resumen de la Estimación (Únicamente conceptos con Cantidad Eje > 0) -->
      <table id="tabla-resumen-estimacion" class="report-table estimacion-print-table" style="width: 100%; border-collapse: collapse; font-size: 7pt; margin-bottom: 10px;">
        <thead>
          <tr style="background-color: #0f172a; color: #ffffff;">
            <th colspan="4" class="text-left" style="background-color: #0f172a; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.8pt; letter-spacing: 0.03em;">
              CONCEPTOS EJECUTADOS EN ESTA ESTIMACIÓN (CANTIDAD EJE &gt; 0)
            </th>
            <th colspan="2" class="text-center" style="background-color: #1e3a8a; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.8pt; letter-spacing: 0.03em;">
              CONTRATADO
            </th>
            <th colspan="2" class="text-center" style="background-color: #334155; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.8pt; letter-spacing: 0.03em;">
              ACUMULADO ANTERIOR
            </th>
            <th colspan="2" class="text-center" style="background-color: #047857; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.8pt; letter-spacing: 0.03em;">
              ESTA ESTIMACIÓN (ACTUAL)
            </th>
            <th colspan="3" class="text-center" style="background-color: #1e3a8a; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.8pt; letter-spacing: 0.03em;">
              ACUMULADO Y SALDO
            </th>
          </tr>
          <tr style="background-color: #f1f5f9; color: #0f172a; font-size: 6.5pt;">
            <th style="width: 22px;" class="text-center">Niv</th>
            <th style="width: 48px;" class="text-center">Clave</th>
            <th class="text-left" style="min-width: 180px;">Descripción del Concepto de Obra</th>
            <th style="width: 30px;" class="text-center">Unid</th>
            <!-- Contratado -->
            <th style="width: 48px;" class="text-right">Cant Base</th>
            <th style="width: 56px;" class="text-right">P.U. ($)</th>
            <!-- Anterior -->
            <th style="width: 48px;" class="text-right">Cant Ant</th>
            <th style="width: 68px;" class="text-right">Importe Ant</th>
            <!-- Esta Estimación (Actual) -->
            <th style="width: 54px; background-color: #ecfdf5; color: #047857;" class="text-right font-bold">Cantidad Eje</th>
            <th style="width: 76px; background-color: #ecfdf5; color: #047857;" class="text-right font-bold">Importe Eje ($)</th>
            <!-- Acumulado y Saldo -->
            <th style="width: 48px;" class="text-right">Cant Acum</th>
            <th style="width: 38px;" class="text-center">% Acum</th>
            <th style="width: 48px;" class="text-right">Cant Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${resumenTableRowsHtml}
        </tbody>
        <tfoot style="border-top: 2px solid #0f172a; background-color: #ffffff;">
          <tr style="background-color: #ffffff; color: #0f172a; font-weight: 800; font-size: 7pt; border-bottom: 1px solid #cbd5e1;">
            <td colspan="6" class="text-right font-bold" style="text-transform: uppercase; padding: 5px 8px; color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1;">
              TOTAL DE CONCEPTOS CON AVANCE EN ESTA ESTIMACIÓN (${executedLeafCount} CONCEPTOS):
            </td>
            <td class="text-center font-mono" style="color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
            <td class="text-right font-mono font-bold" style="color: #1e3a8a; padding: 4px 6px; border: 1px solid #cbd5e1;">${formatMoney(sumResumenImporteAnt)}</td>
            <td class="text-center font-mono" style="color: #047857; background-color: #ecfdf5; border: 1px solid #cbd5e1;">-</td>
            <td class="text-right font-mono font-black" style="color: #047857; background-color: #ecfdf5; padding: 4px 6px; border: 1px solid #cbd5e1; font-size: 7.5pt;">${formatMoney(kpis.grandTotalEjecutado)}</td>
            <td colspan="3" class="text-center font-mono" style="color: #475569; border: 1px solid #cbd5e1; font-size: 6.5pt;">
              Avance del período: <strong>${kpis.pctAvanceEstaEstimacion.toFixed(2)}%</strong>
            </td>
          </tr>
          <tr style="background-color: #f8fafc; color: #0f172a; font-size: 6.8pt; font-weight: 700;">
            <td colspan="6" class="text-left font-mono" style="padding: 5px 8px; color: #475569; border: 1px solid #cbd5e1;">
              Anticipo (${kpis.anticipo.pct}%): <strong>${formatMoney(kpis.anticipo.totalContratado)}</strong> | Saldo x Amortizar: <strong style="color: #b45309;">${formatMoney(kpis.anticipo.saldoPendiente)}</strong>
            </td>
            <td colspan="3" class="text-right font-mono" style="padding: 5px 8px; color: #b91c1c; border: 1px solid #cbd5e1; font-weight: 800;">
              Amortización Esta Est.: -${formatMoney(kpis.anticipo.amortizacionEsta)}
            </td>
            <td colspan="4" class="text-right font-mono font-black" style="padding: 5px 8px; background-color: #ecfdf5; color: #047857; font-size: 7.5pt; border: 1px solid #cbd5e1;">
              ALCANCE LÍQUIDO A COBRAR: ${formatMoney(liquidoFinalCobrar)}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Resumen Económico y Notas del Resumen de la Estimación -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px;">
        <div style="font-size: 7.5pt; color: #64748b; max-width: 580px; line-height: 1.45;">
          <p style="margin: 0 0 3px 0;"><strong>Notas del Resumen de la Estimación:</strong></p>
          <p style="margin: 0;">• El presente resumen incluye únicamente los <strong>${executedLeafCount} concepto(s)</strong> que registran volumen ejecutado en la columna <strong>"Esta Estimación (Actual) — Cantidad Eje"</strong> durante el período del <strong>${escapeHtml(activeEst.fechaInicio)}</strong> al <strong>${escapeHtml(activeEst.fechaFin)}</strong>.</p>
          <p style="margin: 2px 0 0 0;">• Los conceptos sin movimiento en este período se omiten en este resumen ejecutivo para facilitar la revisión y autorización de pago.</p>
          <p style="margin: 2px 0 0 0;">• Avance acumulado global de la obra al corte: <strong>${formatMoney(kpis.grandTotalAcumulado)} (${kpis.pctAvanceGlobal.toFixed(2)}%)</strong> | Saldo total por ejecutar: <strong>${formatMoney(kpis.grandTotalSaldo)}</strong>.</p>
        </div>

        <div class="summary-card" style="width: 320px;">
          <div class="summary-row">
            <span style="color: #475569;">Importe Ejecutado en el Período:</span>
            <span class="font-mono font-bold">${formatMoney(kpis.grandTotalEjecutado)}</span>
          </div>
          <div class="summary-row" style="background-color: #fef2f2; color: #991b1b;">
            <span>Amortización de Anticipo (${kpis.anticipo.pct}%):</span>
            <span class="font-mono font-bold">-${formatMoney(kpis.anticipo.amortizacionEsta)}</span>
          </div>
          <div class="summary-row">
            <span style="color: #475569;">Subtotal Neto Estimación:</span>
            <span class="font-mono font-bold">${formatMoney(kpis.anticipo.netoEstaEstimacion)}</span>
          </div>
          ${kpis.iva && kpis.iva.pct > 0 ? `
            <div class="summary-row">
              <span style="color: #475569;">I.V.A. (${kpis.iva.pct}%):</span>
              <span class="font-mono font-bold">+${formatMoney(kpis.iva.estaEstimacion)}</span>
            </div>
          ` : ''}
          <div class="summary-row summary-total">
            <span>ALCANCE LÍQUIDO A COBRAR:</span>
            <span class="font-mono" style="color: #047857;">${formatMoney(liquidoFinalCobrar)}</span>
          </div>
        </div>
      </div>

      <!-- Área de Firmas Institucionales del Resumen -->
      <div class="signatures-grid">
        <div class="signature-box">
          <strong>ELABORÓ / CONTRATISTA</strong>
          <span>Superintendencia de Construcción</span>
        </div>
        <div class="signature-box">
          <strong>REVISÓ / SUPERVISIÓN</strong>
          <span>Supervisión Externa y Control de Calidad</span>
        </div>
        <div class="signature-box">
          <strong>AUTORIZÓ / RESIDENCIA</strong>
          <span>Dirección General de Obra y Supervisión</span>
        </div>
      </div>

      <!-- Hojas individuales por cada concepto del Resumen + sus Fotografías desde la nube -->
      ${hojasConceptosConFotosHtml}
    </div>

    <!-- =========================================================================
         SECCIÓN 2 (OPCIONAL EN VISTA PREVIA): CATÁLOGO GENERAL COMPLETO
         Oculto por defecto; el usuario puede mostrarlo u ocultarlo desde la barra superior
         ========================================================================= -->
    <div id="seccion-catalogo-completo-estimacion" class="catalogo-completo-hidden page-break">
      <div class="preview-divider-banner">
        ANEXO: DETALLE COMPLETO DEL CATÁLOGO GENERAL DE CONCEPTOS (${rows.length} REGISTROS)
      </div>

      <!-- Encabezado Institucional (Homologado con Catálogo Base) -->
      <div class="doc-header">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${companyLogo ? `<img src="${companyLogo}" alt="Logo" style="height: 74px; width: 74px; min-width: 74px; aspect-ratio: 1/1; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; padding: 3px; background-color: #ffffff;">` : ''}
          <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px;">
            <div style="font-size: 11pt; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2;">
              ${escapeHtml(companyName)}
            </div>
            <h1 class="doc-title" style="font-size: 11.5pt; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; letter-spacing: -0.01em; white-space: nowrap;">
              ESTIMACIÓN DE AVANCE DE OBRA — ${escapeHtml(activeEst.nombre.toUpperCase())}
            </h1>
            <div style="font-size: 9.5pt; font-weight: 700; color: #475569; line-height: 1.2;">
              <span style="color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8.5pt;">Proyecto: </span>${escapeHtml(projectName)}
            </div>
          </div>
        </div>

        <div class="doc-meta" style="display: flex; flex-direction: column; justify-content: space-between; min-height: 74px; text-align: right; font-size: 8pt; line-height: 1.35;">
          <div><strong>Fecha de corte:</strong> ${escapeHtml(activeEst.fechaCorte || activeEst.fechaFin || currentDate)}</div>
          <div><strong>Proyecto:</strong> <span class="meta-tag font-bold" style="color: #1d4ed8; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectName)}</span></div>
          <div><strong>Ubicación:</strong> <span class="meta-tag font-medium" style="color: #334155; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(projectLocation || 'No especificada')}</span></div>
          <div><strong>Estimación:</strong> <span class="meta-tag font-bold" style="color: #047857; background:#ecfdf5; border-color:#a7f3d0; font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(activeEst.nombre)}</span> &nbsp;<strong>Período:</strong> <span class="meta-tag font-mono font-medium" style="font-size: 7.5pt; padding: 1px 6px;">${escapeHtml(activeEst.fechaInicio)} al ${escapeHtml(activeEst.fechaFin)}</span> &nbsp;<strong>Moneda:</strong> <span class="meta-tag font-mono" style="font-size: 7.5pt; padding: 1px 6px;">${currencyCode} (${currencySymbol})</span></div>
        </div>
      </div>

      <!-- Bloque de Tarjetas Resumen Ejecutivo de la Estimación -->
      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 12px;">
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <span style="font-size: 7pt; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Presupuesto Base</span>
          <div style="font-size: 10pt; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">${formatMoney(kpis.grandTotalBase)}</div>
          <span style="font-size: 6.5pt; color: #94a3b8;">Monto Total Contratado</span>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <span style="font-size: 7pt; font-weight: 700; color: #1e3a8a; text-transform: uppercase; display: block;">Acumulado Anterior</span>
          <div style="font-size: 10pt; font-weight: 800; color: #1e3a8a; font-family: monospace; margin-top: 2px;">${formatMoney(kpis.grandTotalAnterior)}</div>
          <span style="font-size: 6.5pt; color: #94a3b8;">Estimaciones previas</span>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 7pt; font-weight: 700; color: #047857; text-transform: uppercase;">Esta Estimación</span>
            <span style="font-size: 6.5pt; font-weight: 700; color: #047857; background: #d1fae5; padding: 1px 4px; border-radius: 3px;">${kpis.pctAvanceEstaEstimacion.toFixed(2)}%</span>
          </div>
          <div style="font-size: 10pt; font-weight: 900; color: #047857; font-family: monospace; margin-top: 2px;">${formatMoney(kpis.grandTotalEjecutado)}</div>
          <span style="font-size: 6.5pt; color: #059669;">Avance en este período</span>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 7pt; font-weight: 700; color: #0f172a; text-transform: uppercase;">Acumulado al Corte</span>
            <span style="font-size: 6.5pt; font-weight: 700; color: #1e3a8a; background: #e0e7ff; padding: 1px 4px; border-radius: 3px;">${kpis.pctAvanceGlobal.toFixed(2)}%</span>
          </div>
          <div style="font-size: 10pt; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">${formatMoney(kpis.grandTotalAcumulado)}</div>
          <span style="font-size: 6.5pt; color: #64748b;">Avance Total al Corte</span>
        </div>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 7pt; font-weight: 700; color: #b45309; text-transform: uppercase;">Saldo x Ejecutar</span>
            <span style="font-size: 6.5pt; font-weight: 700; color: #b45309; background: #fef3c7; padding: 1px 4px; border-radius: 3px;">${Math.max(0, 100 - kpis.pctAvanceGlobal).toFixed(2)}%</span>
          </div>
          <div style="font-size: 10pt; font-weight: 900; color: #b45309; font-family: monospace; margin-top: 2px;">${formatMoney(kpis.grandTotalSaldo)}</div>
          <span style="font-size: 6.5pt; color: #d97706;">Importe Restante de Obra</span>
        </div>
      </div>

      <!-- Banner Financiero de Estado del Anticipo y Alcance Líquido -->
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #1e3a8a; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; font-size: 8pt;">
        <div>
          <span style="font-weight: 800; color: #1e3a8a; text-transform: uppercase; margin-right: 8px;">Estado del Anticipo (${kpis.anticipo.pct}%):</span>
          <span style="color: #475569;">Total Contratado: <strong class="font-mono" style="color: #0f172a;">${formatMoney(kpis.anticipo.totalContratado)}</strong></span>
          <span style="margin: 0 6px; color: #cbd5e1;">|</span>
          <span style="color: #475569;">Amortizado Anterior: <strong class="font-mono" style="color: #1e3a8a;">${formatMoney(kpis.anticipo.amortizadoAnterior)}</strong></span>
          <span style="margin: 0 6px; color: #cbd5e1;">|</span>
          <span style="color: #475569;">Amortización Esta Est: <strong class="font-mono" style="color: #b91c1c;">-${formatMoney(kpis.anticipo.amortizacionEsta)}</strong></span>
          <span style="margin: 0 6px; color: #cbd5e1;">|</span>
          <span style="color: #475569;">Amortizado Total: <strong class="font-mono" style="color: #047857;">${formatMoney(kpis.anticipo.amortizadoAcumulado)}</strong> (${kpis.anticipo.pctAmortizado.toFixed(1)}%)</span>
          <span style="margin: 0 6px; color: #cbd5e1;">|</span>
          <span style="color: #475569;">Saldo x Amortizar: <strong class="font-mono" style="color: #b45309;">${formatMoney(kpis.anticipo.saldoPendiente)}</strong></span>
        </div>
        
        <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 12px; text-align: right;">
          <span style="font-size: 7pt; font-weight: 700; color: #475569; text-transform: uppercase; display: block;">Alcance Líquido a Pagar:</span>
          <span style="font-size: 10.5pt; font-weight: 900; color: #047857; font-family: monospace;">${formatMoney(kpis.anticipo.netoEstaEstimacion)}</span>
        </div>
      </div>

      <!-- Tabla Principal de Estimaciones y Generadores -->
      <table class="report-table estimacion-print-table" style="width: 100%; border-collapse: collapse; font-size: 6.8pt; margin-bottom: 10px;">
        <thead>
          <tr style="background-color: #0f172a; color: #ffffff;">
            <th colspan="4" class="text-left" style="background-color: #0f172a; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.5pt; letter-spacing: 0.03em;">
              CATÁLOGO GENERAL DE CONCEPTOS DE OBRA
            </th>
            <th colspan="3" class="text-center" style="background-color: #1e3a8a; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.5pt; letter-spacing: 0.03em;">
              PRESUPUESTO BASE CONTRATADO
            </th>
            <th colspan="2" class="text-center" style="background-color: #334155; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.5pt; letter-spacing: 0.03em;">
              ACUMULADO ANTERIOR
            </th>
            <th colspan="2" class="text-center" style="background-color: #047857; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.5pt; letter-spacing: 0.03em;">
              ESTA ESTIMACIÓN (${escapeHtml(activeEst.nombre)})
            </th>
            <th colspan="3" class="text-center" style="background-color: #1e3a8a; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.5pt; letter-spacing: 0.03em;">
              ACUMULADO AL CORTE
            </th>
            <th colspan="2" class="text-center" style="background-color: #475569; color: #ffffff; padding: 4px 6px; font-weight: 800; font-size: 6.5pt; letter-spacing: 0.03em;">
              SALDO POR EJECUTAR
            </th>
          </tr>
          <tr style="background-color: #f1f5f9; color: #0f172a; font-size: 6pt;">
            <th style="width: 16px; min-width: 16px; max-width: 18px;" class="text-center">Niv</th>
            <th style="width: 40px; min-width: 38px; max-width: 44px;" class="text-center">Clave</th>
            <th class="text-left" style="min-width: 130px;">Descripción del Concepto de Obra</th>
            <th style="width: 24px; min-width: 22px; max-width: 26px;" class="text-center">Unid</th>
            <th style="width: 42px;" class="text-right">Cant Base</th>
            <th style="width: 48px;" class="text-right">P.U. ($)</th>
            <th style="width: 62px;" class="text-right">Total Base</th>
            <th style="width: 42px;" class="text-right">Cant Ant</th>
            <th style="width: 62px;" class="text-right">Total Ant</th>
            <th style="width: 42px; background-color: #ecfdf5; color: #047857;" class="text-right font-bold">Cant Esta</th>
            <th style="width: 62px; background-color: #ecfdf5; color: #047857;" class="text-right font-bold">Total Esta</th>
            <th style="width: 42px;" class="text-right">Cant Acum</th>
            <th style="width: 62px;" class="text-right">Total Acum</th>
            <th style="width: 32px;" class="text-center">% Acum</th>
            <th style="width: 42px;" class="text-right">Cant Saldo</th>
            <th style="width: 62px;" class="text-right">Total Saldo</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
        <tfoot style="border-top: 2px solid #0f172a; background-color: #ffffff;">
          <tr style="background-color: #ffffff; color: #0f172a; font-weight: 800; font-size: 6.8pt; border-bottom: 1px solid #cbd5e1;">
            <td colspan="4" class="text-right font-bold" style="text-transform: uppercase; padding: 5px 8px; color: #0f172a; font-weight: 800; border: 1px solid #cbd5e1;">
              TOTALES CONSOLIDADOS DE LA ESTIMACIÓN:
            </td>
            <td class="text-center font-mono" style="color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
            <td class="text-center font-mono" style="color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
            <td class="text-right font-mono font-black" style="color: #0f172a; padding: 4px 6px; border: 1px solid #cbd5e1;">${formatMoney(kpis.grandTotalBase)}</td>
            <td class="text-center font-mono" style="color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
            <td class="text-right font-mono font-bold" style="color: #1e3a8a; padding: 4px 6px; border: 1px solid #cbd5e1;">${formatMoney(kpis.grandTotalAnterior)}</td>
            <td class="text-center font-mono" style="color: #047857; background-color: #ecfdf5; border: 1px solid #cbd5e1;">-</td>
            <td class="text-right font-mono font-black" style="color: #047857; background-color: #ecfdf5; padding: 4px 6px; border: 1px solid #cbd5e1; font-size: 7pt;">${formatMoney(kpis.grandTotalEjecutado)}</td>
            <td class="text-center font-mono" style="color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
            <td class="text-right font-mono font-black" style="color: #0f172a; padding: 4px 6px; border: 1px solid #cbd5e1;">${formatMoney(kpis.grandTotalAcumulado)}</td>
            <td class="text-center font-mono font-bold" style="color: #1e3a8a; border: 1px solid #cbd5e1;">${kpis.pctAvanceGlobal.toFixed(2)}%</td>
            <td class="text-center font-mono" style="color: #94a3b8; border: 1px solid #cbd5e1;">-</td>
            <td class="text-right font-mono font-bold" style="color: #b45309; padding: 4px 6px; border: 1px solid #cbd5e1;">${formatMoney(kpis.grandTotalSaldo)}</td>
          </tr>
          <tr style="background-color: #f8fafc; color: #0f172a; font-size: 6.5pt; font-weight: 700; border-bottom: 1px solid #cbd5e1;">
            <td colspan="7" class="text-left font-mono" style="padding: 5px 8px; color: #475569; border: 1px solid #cbd5e1;">
              Anticipo Contratado: <strong>${formatMoney(kpis.anticipo.totalContratado)}</strong> | Amort. Anterior: <strong>${formatMoney(kpis.anticipo.amortizadoAnterior)}</strong> | Saldo x Amortizar: <strong style="color: #b45309;">${formatMoney(kpis.anticipo.saldoPendiente)}</strong>
            </td>
            <td colspan="4" class="text-right font-mono" style="padding: 5px 8px; color: #b91c1c; border: 1px solid #cbd5e1; font-weight: 800;">
              Amortización en Esta Estimación: -${formatMoney(kpis.anticipo.amortizacionEsta)}
            </td>
            <td colspan="5" class="text-right font-mono font-black" style="padding: 5px 8px; background-color: #ecfdf5; color: #047857; font-size: 7.5pt; border: 1px solid #cbd5e1;">
              ALCANCE LÍQUIDO A COBRAR: ${formatMoney(kpis.anticipo.netoEstaEstimacion)}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Resumen Económico y Notas Generales del Catálogo Completo -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px;">
        <div style="font-size: 7.5pt; color: #64748b; max-width: 580px; line-height: 1.45;">
          <p style="margin: 0 0 3px 0;"><strong>Notas técnicas y consideraciones de la estimación:</strong></p>
          <p style="margin: 0;">• La presente estimación ampara los trabajos ejecutados a entera satisfacción durante el período especificado (${escapeHtml(activeEst.fechaInicio)} al ${escapeHtml(activeEst.fechaFin)}), respaldados por los números generadores, notas de bitácora y controles de calidad aplicables.</p>
          <p style="margin: 2px 0 0 0;">• Total de partidas y conceptos procesados: <strong>${rows.length}</strong> registros en la <strong>${escapeHtml(activeEst.nombre)}</strong>.</p>
          <p style="margin: 2px 0 0 0;">• El contratista acepta las retenciones y amortizaciones estipuladas conforme a las cláusulas contractuales vigentes.</p>
        </div>

        <div class="summary-card" style="width: 320px;">
          <div class="summary-row">
            <span style="color: #475569;">Importe Ejecutado en el Período:</span>
            <span class="font-mono font-bold">${formatMoney(kpis.grandTotalEjecutado)}</span>
          </div>
          <div class="summary-row" style="background-color: #fef2f2; color: #991b1b;">
            <span>Amortización de Anticipo (${kpis.anticipo.pct}%):</span>
            <span class="font-mono font-bold">-${formatMoney(kpis.anticipo.amortizacionEsta)}</span>
          </div>
          <div class="summary-row">
            <span style="color: #475569;">Subtotal Neto Estimación:</span>
            <span class="font-mono font-bold">${formatMoney(kpis.anticipo.netoEstaEstimacion)}</span>
          </div>
          ${kpis.iva && kpis.iva.pct > 0 ? `
            <div class="summary-row">
              <span style="color: #475569;">I.V.A. (${kpis.iva.pct}%):</span>
              <span class="font-mono font-bold">+${formatMoney(kpis.iva.estaEstimacion)}</span>
            </div>
          ` : ''}
          <div class="summary-row summary-total">
            <span>ALCANCE LÍQUIDO A COBRAR:</span>
            <span class="font-mono" style="color: #047857;">${formatMoney(liquidoFinalCobrar)}</span>
          </div>
        </div>
      </div>

      <!-- Área de Firmas Institucionales -->
      <div class="signatures-grid">
        <div class="signature-box">
          <strong>ELABORÓ / CONTRATISTA</strong>
          <span>Superintendencia de Construcción</span>
        </div>
        <div class="signature-box">
          <strong>REVISÓ / SUPERVISIÓN</strong>
          <span>Supervisión Externa y Control de Calidad</span>
        </div>
        <div class="signature-box">
          <strong>AUTORIZÓ / RESIDENCIA</strong>
          <span>Dirección General de Obra y Supervisión</span>
        </div>
      </div>
    </div>
  `;

  const extraToolbarHtml = `
    <span id="badge-modo-estimacion" style="font-size: 11.5px; background-color: #064e3b; color: #a7f3d0; border: 1px solid #059669; padding: 5px 10px; border-radius: 6px; font-weight: 600;">
      ✓ Resumen (${executedLeafCount} conceptos con Cantidad Eje &gt; 0)
    </span>
    <button type="button" id="btn-toggle-catalogo-completo" onclick="toggleCatalogoCompleto()" style="background-color: #1e293b; color: #e2e8f0; border: 1px solid #475569; padding: 7px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 600;">
      📋 Mostrar Catálogo Completo (${totalLeafConcepts} conceptos)
    </button>
  `;

  const extraScripts = `
    function toggleCatalogoCompleto() {
      const secCat = document.getElementById('seccion-catalogo-completo-estimacion');
      const btn = document.getElementById('btn-toggle-catalogo-completo');
      const badge = document.getElementById('badge-modo-estimacion');
      if (!secCat || !btn) return;

      const isHidden = secCat.classList.toggle('catalogo-completo-hidden');
      if (isHidden) {
        btn.innerHTML = '📋 Mostrar Catálogo Completo (${totalLeafConcepts} conceptos)';
        btn.style.backgroundColor = '#1e293b';
        btn.style.borderColor = '#475569';
        btn.style.color = '#e2e8f0';
        if (badge) {
          badge.innerHTML = '✓ Resumen (${executedLeafCount} conceptos con Cantidad Eje &gt; 0)';
        }
      } else {
        btn.innerHTML = '🙈 Ocultar Catálogo Completo';
        btn.style.backgroundColor = '#047857';
        btn.style.borderColor = '#10b981';
        btn.style.color = '#ffffff';
        if (badge) {
          badge.innerHTML = '✓ Resumen + Catálogo Completo';
        }
      }
    }
  `;

  openPrintWindow(
    `Estimacion_${activeEst.numero}_${projectName.replace(/\s+/g, '_')}`,
    bodyContent,
    'landscape',
    {
      extraToolbarHtml,
      extraScripts,
      autoPrint: false
    }
  );
}
