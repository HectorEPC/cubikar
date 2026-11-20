// js/modules/almacen/almacenExporter.js
// Exportación a Excel e Impresión PDF de Vales de Salida, Recepciones e Inventario Físico (Cero montos/precios $)

import { state } from '../../state/store.js?v=20261119_cf36';
import { formatNumber } from '../../core/formatters.js?v=20261119_cf36';
import { showToast } from '../../ui/notifications.js?v=20261119_cf36';
import { openPrintWindow } from '../io/printService.js?v=20261119_cf36';
import { resolveActivePrintBranding } from '../io/printBrandingService.js?v=20261119_cf36';
import { getActiveProjectId } from '../../config/constants.js?v=20261119_cf36';
import { archiveGeneratedWorkbookReport } from '../../services/s3StorageService.js?v=20261119_cf36';
import {
  getAlmacenSignatures,
  getWarehouseStockSummary,
  getWarehouseMovements
} from './almacenModel.js?v=20261119_cf36';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderAlmacenBrandHeader(companyName, companyLogo, projectName, projectLocation) {
  const logoHtml = companyLogo
    ? `<img src="${companyLogo}" alt="Logo" style="height:46px;width:46px;object-fit:contain;border-radius:6px;border:1px solid #cbd5e1;padding:2px;background:#fff;flex-shrink:0;">`
    : '';
  return `
    <div style="display:flex;align-items:center;gap:10px;">
      ${logoHtml}
      <div>
        <div style="font-size:18px;font-weight:800;color:#0f172a;text-transform:uppercase;">${escapeHtml(companyName)}</div>
        <div style="font-size:12px;font-weight:700;color:#0284c7;margin-top:2px;">OBRA: ${escapeHtml(projectName)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:1px;">UBICACIÓN: ${escapeHtml(projectLocation)}</div>
      </div>
    </div>
  `;
}

export function renderAlmacenPrintSignaturesBlock() {
  const sigs = getAlmacenSignatures();
  if (!Array.isArray(sigs) || sigs.length === 0) return '';
  const cols = Math.min(Math.max(sigs.length, 1), 5);
  return `
    <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 20px; text-align: center; margin-top: 28px; page-break-inside: avoid;">
      ${sigs.map(s => `
        <div style="border-top: 1.5px solid #0f172a; padding-top: 6px; min-width: 0;">
          <div style="font-size: 10px; font-weight: 800; color: #0f172a; text-transform: uppercase;">${escapeHtml(s.rol || 'FIRMA')}</div>
          ${s.nombre ? `<div style="font-size: 11px; font-weight: bold; color: #1e293b; margin-top: 3px;">${escapeHtml(s.nombre)}</div>` : '<div style="height: 16px;"></div>'}
          <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${escapeHtml(s.cargo || '')}</div>
        </div>
      `).join('')}
    </div>
  `;
}

const KIND_LABELS = {
  exit: 'VALE DE SALIDA DE ALMACÉN',
  tool_loan: 'VALE DE PRÉSTAMO / RESGUARDO DE HERRAMIENTA',
  return: 'NOTA DE DEVOLUCIÓN A BODEGA',
  transfer_out: 'ORDEN DE TRASPASO / SALIDA EXTERNA',
  adjustment: 'AJUSTE FÍSICO DE INVENTARIO'
};

/**
 * Imprimir Vale de Salida / Préstamo / Movimiento individual (sin precios $)
 */
export function printWarehouseExitVoucher(movementId) {
  const mov = getWarehouseMovements().find(m => m.id === movementId);
  if (!mov) {
    showToast('No se encontró el movimiento de almacén para imprimir.', 'warning');
    return;
  }

  const branding = resolveActivePrintBranding(state?.settings);
  const projectName = state?.settings?.projectName || 'Obra Principal';
  const projectLocation = state?.settings?.projectLocation || 'En sitio';
  const kindTitle = KIND_LABELS[mov.kind] || 'VALE DE ALMACÉN';

  const itemsRows = (mov.items || []).map((it, idx) => `
    <tr>
      <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${idx + 1}</td>
      <td style="padding: 7px 8px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #0284c7;">${escapeHtml(it.insumoClave || 'MAT')}</td>
      <td style="padding: 7px 8px; border: 1px solid #cbd5e1; font-weight: 600; color: #0f172a;">${escapeHtml(it.description)}</td>
      <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center;">${escapeHtml(it.tipo || 'Material')}</td>
      <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: 600;">${escapeHtml(it.unit || 'pza')}</td>
      <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: 800; font-size: 12px;">${formatNumber(it.qty)}</td>
    </tr>
  `).join('');

  const conceptLine = mov.conceptClave || mov.conceptDesc
    ? `[${escapeHtml(mov.conceptClave || 'CONC')}] ${escapeHtml(mov.conceptDesc)}${mov.conceptQty > 0 ? ` (${formatNumber(mov.conceptQty)} ${escapeHtml(mov.conceptUnit || '')})` : ''}`
    : 'No vinculado a concepto específico';

  const bodyContent = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
      ${renderAlmacenBrandHeader(branding.companyName, branding.companyLogo, projectName, projectLocation)}
      <div style="text-align: right; border: 1.5px solid #0f172a; border-radius: 8px; padding: 8px 14px; background: #f8fafc;">
        <div style="font-size: 11px; font-weight: 900; color: #0f172a; letter-spacing: 0.6px;">${kindTitle}</div>
        <div style="font-size: 15px; font-weight: 800; color: #0284c7; font-family: monospace; margin-top: 2px;">FOLIO: ${escapeHtml(mov.folio || mov.id)}</div>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">FECHA: <strong>${escapeHtml(mov.date || '')}</strong></div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
      <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px;">
        <div style="font-size: 10px; font-weight: 800; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 5px;">DESTINO EN OBRA / APLICACIÓN</div>
        <table style="width: 100%; font-size: 11px; line-height: 1.45;">
          <tr><td style="color:#64748b; width:85px;">Concepto:</td><td><strong>${conceptLine}</strong></td></tr>
          <tr><td style="color:#64748b;">Frente / Área:</td><td>${escapeHtml(mov.frontName || 'Frente general de obra')}</td></tr>
          ${mov.targetProjectName ? `<tr><td style="color:#64748b;">Destino ext.:</td><td><strong>${escapeHtml(mov.targetProjectName)}</strong></td></tr>` : ''}
        </table>
      </div>
      <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px;">
        <div style="font-size: 10px; font-weight: 800; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 5px;">RESPONSABLES DE ENTREGA Y RECEPCIÓN</div>
        <table style="width: 100%; font-size: 11px; line-height: 1.45;">
          <tr><td style="color:#64748b; width:85px;">Recibe:</td><td><strong>${escapeHtml(mov.recipientName || 'Encargado de Frente')}</strong></td></tr>
          <tr><td style="color:#64748b;">Autorizó:</td><td>${escapeHtml(mov.authorizedBy || 'Residencia de Obra')}</td></tr>
          <tr><td style="color:#64748b;">Estatus:</td><td><strong style="color:${mov.status === 'cancelled' ? '#dc2626' : '#059669'};">${mov.status === 'cancelled' ? 'CANCELADO' : (mov.kind === 'tool_loan' ? (mov.toolStatus === 'returned' ? `DEVUELTO (${mov.toolReturnedAt})` : 'EN PRÉSTAMO ACTIVO') : 'ENTREGADO EN SITIO')}</strong></td></tr>
        </table>
      </div>
    </div>

    <table class="report-table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff; text-align: left;">
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 35px; text-align: center;">#</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 90px;">CLAVE</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a;">MATERIAL / HERRAMIENTA / INSUMO</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 95px; text-align: center;">RUBRO</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 55px; text-align: center;">UNID.</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 85px; text-align: right;">CANTIDAD</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    ${mov.notes ? `
      <div style="border: 1px dashed #94a3b8; border-radius: 6px; padding: 8px 10px; margin-bottom: 20px; font-size: 10px; color: #475569; background: #f8fafc;">
        <strong>OBSERVACIONES DE ALMACÉN:</strong> ${escapeHtml(mov.notes)}
      </div>
    ` : ''}

    ${renderAlmacenPrintSignaturesBlock()}
  `;

  openPrintWindow(`${kindTitle} - ${mov.folio}`, bodyContent, 'portrait');
}

/**
 * Imprimir reporte general de Almacén según la subpestaña activa (100% sin precios $)
 */
export function printAlmacenActiveReport(subTab = 'stock') {
  const branding = resolveActivePrintBranding(state?.settings);
  const projectName = state?.settings?.projectName || 'Obra Principal';
  const projectLocation = state?.settings?.projectLocation || 'En sitio';
  const todayStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const stockSummary = getWarehouseStockSummary();
  const movements = getWarehouseMovements();

  let titleLabel = 'INVENTARIO FÍSICO ACTUAL EN BODEGA';
  let tableHtml = '';

  if (subTab === 'recepciones') {
    titleLabel = 'CONTROL DE RECEPCIONES DE MATERIAL EN ALMACÉN';
    const rows = stockSummary.receptions.map((r, idx) => `
      <tr>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:center;">${idx + 1}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;font-family:monospace;">${escapeHtml(r.expenseId)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;">${escapeHtml(r.date)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;font-weight:600;">${escapeHtml(r.description)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;">${escapeHtml(r.supplierName)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:center;">${escapeHtml(r.unit)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${formatNumber(r.expectedQty)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;font-weight:bold;">${formatNumber(r.receivedQty)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;color:${r.pendingQty > 0 ? '#d97706' : '#059669'};font-weight:bold;">${formatNumber(r.pendingQty)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:center;">${r.status === 'complete' ? 'COMPLETO' : r.status === 'partial' ? 'PARCIAL' : 'PENDIENTE'}</td>
      </tr>
    `).join('');

    tableHtml = `
      <table class="report-table" style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:16px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:6px;border:1px solid #0f172a;">#</th>
            <th style="padding:6px;border:1px solid #0f172a;">Ref. Compra</th>
            <th style="padding:6px;border:1px solid #0f172a;">Fecha</th>
            <th style="padding:6px;border:1px solid #0f172a;">Material / Insumo</th>
            <th style="padding:6px;border:1px solid #0f172a;">Proveedor</th>
            <th style="padding:6px;border:1px solid #0f172a;">Unid.</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Esperado</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Recibido</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Por Llegar</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:center;">Estatus</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="10" style="padding:12px;text-align:center;color:#64748b;">Sin recepciones registradas</td></tr>'}</tbody>
      </table>
    `;
  } else if (subTab === 'salidas' || subTab === 'herramienta') {
    titleLabel = subTab === 'herramienta'
      ? 'RESGUARDO DE HERRAMIENTA Y MOVIMIENTOS DE AJUSTE'
      : 'BITÁCORA DE ÓRDENES Y VALES DE SALIDA DE ALMACÉN';

    const list = subTab === 'herramienta'
      ? movements.filter(m => m.kind === 'tool_loan' || m.kind === 'return' || m.kind === 'transfer_out' || m.kind === 'adjustment')
      : movements.filter(m => m.kind === 'exit');

    const rows = list.map((m, idx) => `
      <tr>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:center;">${idx + 1}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;color:#0284c7;">${escapeHtml(m.folio)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;">${escapeHtml(m.date)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;">${escapeHtml(m.conceptClave ? `[${m.conceptClave}] ${m.conceptDesc}` : (m.frontName || 'Obra General'))}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;">${(m.items || []).map(it => `${escapeHtml(it.description)} (${formatNumber(it.qty)} ${escapeHtml(it.unit)})`).join(', ')}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;">${escapeHtml(m.recipientName || '---')}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:center;">${m.status === 'cancelled' ? 'CANCELADO' : (m.kind === 'tool_loan' ? (m.toolStatus === 'returned' ? 'DEVUELTO' : 'EN PRÉSTAMO') : 'ACTIVO')}</td>
      </tr>
    `).join('');

    tableHtml = `
      <table class="report-table" style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:16px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:6px;border:1px solid #0f172a;">#</th>
            <th style="padding:6px;border:1px solid #0f172a;">Folio</th>
            <th style="padding:6px;border:1px solid #0f172a;">Fecha</th>
            <th style="padding:6px;border:1px solid #0f172a;">Concepto / Frente</th>
            <th style="padding:6px;border:1px solid #0f172a;">Materiales / Cantidades</th>
            <th style="padding:6px;border:1px solid #0f172a;">Recibió</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:center;">Estatus</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7" style="padding:12px;text-align:center;color:#64748b;">Sin movimientos registrados</td></tr>'}</tbody>
      </table>
    `;
  } else {
    const rows = stockSummary.items.map((it, idx) => `
      <tr>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:center;">${idx + 1}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;color:#0284c7;">${escapeHtml(it.insumoClave || '---')}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;font-weight:600;">${escapeHtml(it.description)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:center;">${escapeHtml(it.unit)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${formatNumber(it.totalEnteredQty)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${formatNumber(it.totalExitedQty)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${formatNumber(it.totalReturnedFromSiteQty)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;">${formatNumber(it.totalTransferredOutQty)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;font-weight:900;color:${it.availableStock <= 0 ? '#dc2626' : '#059669'};">${formatNumber(it.availableStock)}</td>
        <td style="padding:5px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;color:#d97706;">${formatNumber(it.pendingArrivalQty)}</td>
      </tr>
    `).join('');

    tableHtml = `
      <table class="report-table" style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:16px;">
        <thead>
          <tr style="background:#0f172a;color:#fff;">
            <th style="padding:6px;border:1px solid #0f172a;">#</th>
            <th style="padding:6px;border:1px solid #0f172a;">Clave</th>
            <th style="padding:6px;border:1px solid #0f172a;">Material / Herramienta</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:center;">Unid.</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Entradas</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Salidas Obra</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Dev. Obra</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Traspasos</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Stock Bodega</th>
            <th style="padding:6px;border:1px solid #0f172a;text-align:right;">Por Llegar</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="10" style="padding:12px;text-align:center;color:#64748b;">No hay materiales registrados en almacén</td></tr>'}</tbody>
      </table>
    `;
  }

  const bodyContent = `
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
      ${renderAlmacenBrandHeader(branding.companyName, branding.companyLogo, projectName, projectLocation)}
      <div style="text-align: right;">
        <div style="font-size: 13px; font-weight: 900; color: #0f172a;">${titleLabel}</div>
        <div style="font-size: 10px; color: #475569;">FECHA: <strong>${todayStr}</strong></div>
      </div>
    </div>
    ${tableHtml}
    ${renderAlmacenPrintSignaturesBlock()}
  `;

  openPrintWindow(`${titleLabel} - ${projectName}`, bodyContent, 'landscape');
}

/**
 * Exportar Almacén a Excel (100% libre de montos y precios $)
 */
export function exportAlmacenToExcel() {
  if (typeof window === 'undefined' || !window.XLSX) {
    showToast('Librería XLSX no disponible para exportar.', 'error');
    return;
  }

  const XLSX = window.XLSX;
  const stockSummary = getWarehouseStockSummary();
  const movements = getWarehouseMovements();
  const projectName = state.settings?.projectName || 'Obra';

  const invRows = [
    ['Clave', 'Material / Insumo', 'Rubro', 'Unidad', 'Pedido a Bodega', 'Entradas Confirmadas', 'Salidas a Obra', 'Devoluciones Obra', 'Traspasos / Bajas', 'Ajustes', 'Stock Disponible en Bodega', 'Por Llegar']
  ];
  stockSummary.items.forEach(it => {
    invRows.push([
      it.insumoClave || '',
      it.description || '',
      it.tipo || 'Material',
      it.unit || 'pza',
      it.orderedToWarehouseQty,
      it.totalEnteredQty,
      it.totalExitedQty,
      it.totalReturnedFromSiteQty,
      it.totalTransferredOutQty,
      it.totalAdjustedQty,
      it.availableStock,
      it.pendingArrivalQty
    ]);
  });

  const movRows = [
    ['Folio', 'Tipo Movimiento', 'Fecha', 'Concepto / Frente', 'Cant. Concepto', 'Clave Insumo', 'Material', 'Unidad', 'Cantidad', 'Recibió', 'Autorizó', 'Estatus', 'Notas']
  ];
  movements.forEach(m => {
    (m.items || []).forEach(it => {
      movRows.push([
        m.folio || m.id,
        KIND_LABELS[m.kind] || m.kind,
        m.date || '',
        m.conceptClave ? `[${m.conceptClave}] ${m.conceptDesc}` : (m.frontName || 'General'),
        m.conceptQty || 0,
        it.insumoClave || '',
        it.description || '',
        it.unit || '',
        it.qty || 0,
        m.recipientName || '',
        m.authorizedBy || '',
        m.status === 'cancelled' ? 'CANCELADO' : (m.toolStatus === 'returned' ? 'DEVUELTO' : 'ACTIVO'),
        m.notes || ''
      ]);
    });
  });

  const recRows = [
    ['Ref. Compra', 'Fecha Orden', 'Proveedor', 'Clave', 'Material', 'Unidad', 'Cant. Esperada', 'Cant. Recibida', 'Pendiente', 'Estatus', 'No. Remisión', 'Última Recepción', 'Recibió en Bodega']
  ];
  stockSummary.receptions.forEach(r => {
    recRows.push([
      r.expenseId,
      r.date,
      r.supplierName,
      r.insumoClave,
      r.description,
      r.unit,
      r.expectedQty,
      r.receivedQty,
      r.pendingQty,
      r.status,
      r.remisionNumber,
      r.receivedDate,
      r.receivedBy
    ]);
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), 'Inventario Bodega');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(movRows), 'Vales y Movimientos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recRows), 'Recepciones');

  const cleanName = projectName.replace(/[\\/:*?"<>|]/g, '_');
  const todayStr = new Date().toISOString().slice(0, 10);
  const fileName = `Almacen_Obra_${cleanName}_${todayStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
  archiveGeneratedWorkbookReport(XLSX, wb, fileName, {
    modulo: 'reportes',
    entidadId: 'almacen_excel',
    proyectoId: getActiveProjectId(),
    metadata: { tipo: 'almacen_fisico', movimientos: movements.length }
  });
  showToast(`Archivo Excel "${fileName}" generado exitosamente.`, 'success');
}
