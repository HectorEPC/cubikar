// js/modules/io/printService.js
// Servicio de Impresión de Formatos Profesionales para TAB1-CAT-BASE y MATRIZ / INSUMOS UNITARIOS

import { state } from '../../state/store.js';
import { formatMoney, formatQty, getCurrencySymbol, getCurrencyCode, round2 } from '../../core/formatters.js';
import { getFactorSobrecosto, calculateParentTotal, calculateParentDirectTotal } from '../../core/calculations.js';
import { findNodeById } from '../catalog/treeService.js';
import { showToast } from '../../ui/notifications.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';
import { getConsolidatedDataMap } from '../insumosGenerales/insumosConsolidator.js';

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

// Abrir documento e invocar diálogo de impresión
function openPrintWindow(docTitle, bodyContent) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('El navegador bloqueó la ventana de impresión. Por favor permite ventanas emergentes en esta página.', 'warning');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(docTitle)}</title>
  <style>
    ${PRINT_BASE_STYLES}
  </style>
</head>
<body>
  <!-- Barra de Acciones Flotante (Oculta al Imprimir) -->
  <div class="no-print">
    <div style="font-size: 14px; font-weight: 600; display: flex; items-center; gap: 8px;">
      <span>📄 ${escapeHtml(docTitle)}</span>
    </div>
    <div style="display: flex; gap: 10px;">
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
    ${bodyContent}
  </div>

  <script>
    // Auto-disparar diálogo de impresión tras breve render
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 350);
    });
  </script>
</body>
</html>`;

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
  const companyName = (state.settings && state.settings.companyName) || 'Sistema de Control de Obra';
  const companyLogo = (state.settings && state.settings.companyLogo) || '';
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

    <!-- Área de Firmas Institucionales -->
    <div class="signatures-grid">
      <div class="signature-box">
        <strong>ELABORÓ</strong>
        <span>Departamento de Precios Unitarios y Presupuestos</span>
      </div>
      <div class="signature-box">
        <strong>REVISÓ</strong>
        <span>Coordinación de Costos e Ingeniería</span>
      </div>
      <div class="signature-box">
        <strong>AUTORIZÓ / CLIENTE</strong>
        <span>Dirección de Obra y Supervisión</span>
      </div>
    </div>
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
  const companyName = (state.settings && state.settings.companyName) || 'Sistema de Control de Obra';
  const companyLogo = (state.settings && state.settings.companyLogo) || '';
  const projectName = (state.settings && state.settings.projectName) || 'Proyecto de Obra Base';
  const projectLocation = (state.settings && state.settings.projectLocation) || '';

  const insumos = Array.isArray(node.insumos) ? node.insumos : [];
  const conceptoCantidad = parseFloat(node.cantidad) || 0;
  const conceptoUnidad = node.unidad || 'pza';

  // Clasificar insumos por rubros
  const rubros = [
    { key: 'Material', label: '1. MATERIALES', icon: '📦' },
    { key: 'Mano de Obra', label: '2. MANO DE OBRA', icon: '👷' },
    { key: 'Equipo', label: '3. MAQUINARIA, EQUIPO Y HERRAMIENTA', icon: '🚜' },
    { key: 'Subcontrato', label: '4. SUBCONTRATOS Y TRABAJOS ESPECIALIZADOS', icon: '📑' }
  ];

  let totalCostoDirecto = 0;
  const matrizRowsHtml = [];

  rubros.forEach(rubro => {
    const items = insumos.filter(ins => (ins.tipo || 'Material') === rubro.key);
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
        const cantUnit = round2(ins.cantidad || 0);
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
      <span style="font-size: 7.5pt; font-weight: 600; text-transform: none;">Cant. Concepto × Consumo Unitario</span>
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
    { key: 'Equipo', label: '3. MAQUINARIA, EQUIPO Y HERRAMIENTA', icon: '🚜' },
    { key: 'Subcontrato', label: '4. SUBCONTRATOS Y TRABAJOS ESPECIALIZADOS', icon: '📑' }
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
  const companyName = (state.settings && state.settings.companyName) || 'Sistema de Control de Obra';
  const companyLogo = (state.settings && state.settings.companyLogo) || '';
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
