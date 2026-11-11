// js/modules/compras/expensesExporter.js
// Exportación a Excel (.xlsx) y generación de formatos imprimibles oficiales de Orden de Compra y Reportes

import { state } from '../../state/store.js';
import { formatCurrency, formatNumber } from '../../core/formatters.js';
import { showToast } from '../../ui/notifications.js';
import { openPrintWindow } from '../io/printService.js';
import { getExpensesRecords, getExpensesSuppliers, getSupplierById } from './expensesModel.js';
import { getExpensesKpiMetrics, getInsumosBudgetVsActualComparison } from './expensesCalculations.js';
import { getActiveProjectId } from '../../config/constants.js';
import { archiveGeneratedWorkbookReport } from '../../services/s3StorageService.js';
import { resolveActivePrintBranding } from '../io/printBrandingService.js';

function renderExpensesBrandHeaderBlock(companyName, companyLogo, projectName, projectLocation, compact = false) {
  const logoHtml = companyLogo
    ? `<img src="${companyLogo}" alt="Logo" style="height:${compact ? 44 : 52}px;width:${compact ? 44 : 52}px;object-fit:contain;border-radius:6px;border:1px solid #cbd5e1;padding:2px;background:#fff;flex-shrink:0;">`
    : '';
  return `
    <div style="display:flex;align-items:center;gap:10px;">
      ${logoHtml}
      <div>
        <div style="font-size:${compact ? 18 : 20}px;font-weight:800;color:#0f172a;text-transform:${compact ? 'none' : 'uppercase'};letter-spacing:${compact ? '0' : '0.5px'};">${companyName}</div>
        <div style="font-size:${compact ? 12 : 13}px;font-weight:${compact ? 'bold' : '600'};color:#2563eb;margin-top:2px;">${compact ? 'OBRA' : 'PROYECTO'}: ${projectName}</div>
        <div style="font-size:${compact ? 10 : 11}px;color:#64748b;margin-top:1px;">UBICACIÓN: ${projectLocation}</div>
      </div>
    </div>
  `;
}

/**
 * Exportar Bitácora de Gastos, Comparativa Presupuestal y Proveedores a Microsoft Excel (.xlsx)
 */
export function exportExpensesToExcel() {
  if (typeof window === 'undefined' || !window.XLSX) {
    showToast('Librería XLSX no disponible para exportar.', 'error');
    return;
  }

  const XLSX = window.XLSX;
  const records = getExpensesRecords();
  const suppliers = getExpensesSuppliers();
  const comparison = getInsumosBudgetVsActualComparison();
  const projectName = state.settings?.projectName || 'Obra';

  // 1. Hoja 1: Bitácora de Gastos y Órdenes de Compra
  const recordsRows = [
    [
      'Folio / ID',
      'Fecha',
      'Tipo de Gasto',
      'Categoría / Partida',
      'Clave Insumo',
      'Descripción del Insumo / Gasto',
      'Proveedor',
      'No. Factura / Remisión',
      'Cantidad',
      'Unidad',
      'Precio Unitario',
      'Subtotal',
      'IVA (16%)',
      'Total Egresos',
      'Estatus de Pago',
      'Método de Pago',
      'Comprobante AWS S3 / Archivo',
      'Notas y Observaciones'
    ]
  ];

  const typeLabels = {
    material: 'Material',
    labor: 'Mano de Obra / Raya',
    equipment: 'Equipo / Maquinaria',
    indirect: 'Gasto Indirecto'
  };

  const statusLabels = {
    paid: 'PAGADO',
    pending: 'POR PAGAR',
    cancelled: 'CANCELADO'
  };

  records.forEach(r => {
    const sup = r.supplierId ? getSupplierById(r.supplierId) : null;
    const supName = sup ? sup.name : (r.supplierName || 'Varios');
    const driveLink = r.evidence?.s3Key
      ? `S3: ${r.evidence.fileName || r.evidence.s3Key}`
      : (r.evidence?.fileName ? `Adjunto (${r.evidence.fileName})` : 'Sin comprobante');

    recordsRows.push([
      r.id || '',
      r.date || '',
      typeLabels[r.type] || r.type || 'Material',
      r.category || '',
      r.insumoClave || r.insumoId || '',
      r.description || '',
      supName,
      r.invoiceNumber || '',
      parseFloat(r.quantity) || 0,
      r.unit || 'pza',
      parseFloat(r.unitPrice) || 0,
      parseFloat(r.subtotal) || 0,
      parseFloat(r.tax) || 0,
      parseFloat(r.total) || 0,
      statusLabels[r.paymentStatus] || r.paymentStatus || 'PAGADO',
      r.paymentMethod || 'Transferencia',
      driveLink,
      r.notes || ''
    ]);
  });

  // 2. Hoja 2: Comparativa Presupuestado vs Real
  const compRows = [
    [
      'Clave',
      'Tipo',
      'Descripción del Insumo',
      'Unidad',
      'Cant. Presupuestada',
      'Cant. Comprada',
      'Saldo Disponible',
      'P.U. Presupuestado',
      'P.U. Real Promedio',
      'Variación P.U.',
      'Importe Presupuestado',
      'Importe Comprado Real',
      'Desviación de Importe',
      '% Consumido',
      'Semáforo Presupuestal'
    ]
  ];

  comparison.items.forEach(i => {
    compRows.push([
      i.clave || '',
      i.tipo || 'Material',
      i.descripcion || '',
      i.unidad || '',
      parseFloat(i.cantidadPresupuestada) || 0,
      parseFloat(i.cantidadComprada) || 0,
      parseFloat(i.saldoDisponible) || 0,
      parseFloat(i.puPresupuestado) || 0,
      parseFloat(i.puRealPromedio) || 0,
      parseFloat(i.variacionPrecio) || 0,
      parseFloat(i.importePresupuestado) || 0,
      parseFloat(i.importeComprado) || 0,
      parseFloat(i.desviacionImporte) || 0,
      parseFloat(i.pctConsumido) || 0,
      i.alertReason || 'Normal'
    ]);
  });

  // 3. Hoja 3: Directorio de Proveedores
  const supRows = [
    ['ID Proveedor', 'Razón Social / Nombre', 'RFC', 'Teléfono', 'Correo Electrónico', 'Persona de Contacto', 'Dirección']
  ];

  suppliers.forEach(s => {
    supRows.push([
      s.id || '',
      s.name || '',
      s.rfc || '',
      s.phone || '',
      s.email || '',
      s.contactPerson || '',
      s.address || ''
    ]);
  });

  // Crear libro de trabajo
  const wb = XLSX.utils.book_new();

  const wsRecords = XLSX.utils.aoa_to_sheet(recordsRows);
  const wsComp = XLSX.utils.aoa_to_sheet(compRows);
  const wsSups = XLSX.utils.aoa_to_sheet(supRows);

  XLSX.utils.book_append_sheet(wb, wsRecords, 'Bitácora Egresos');
  XLSX.utils.book_append_sheet(wb, wsComp, 'Presupuesto vs Real');
  XLSX.utils.book_append_sheet(wb, wsSups, 'Proveedores');

  const cleanName = projectName.replace(/[\\/:*?"<>|]/g, '_');
  const todayStr = new Date().toISOString().slice(0, 10);
  const fileName = `Control_Gastos_y_Compras_${cleanName}_${todayStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
  archiveGeneratedWorkbookReport(XLSX, wb, fileName, {
    modulo: 'reportes',
    entidadId: 'compras_excel',
    proyectoId: getActiveProjectId(),
    metadata: { tipo: 'compras_y_gastos', registros: records.length }
  });
  showToast(`¡Archivo Excel "${fileName}" generado exitosamente!`, 'success');
}

/**
 * Imprimir formato corporativo oficial de Orden de Compra
 */
export function printSingleOrdenCompra(record) {
  if (!record) {
    showToast('Selecciona una orden de compra para imprimir.', 'warning');
    return;
  }

  const branding = resolveActivePrintBranding(state.settings);
  const companyName = branding.companyName;
  const companyLogo = branding.companyLogo;
  const projectName = state.settings?.projectName || 'Obra Principal';
  const projectLocation = state.settings?.projectLocation || 'En sitio';
  const currency = state.settings?.currency || 'MXN';

  const sup = record.supplierId ? getSupplierById(record.supplierId) : null;
  const supName = sup ? sup.name : (record.supplierName || 'Proveedor General');
  const supRfc = sup?.rfc || 'XAXX010101000';
  const supPhone = sup?.phone || 'Sin registrar';
  const supEmail = sup?.email || 'Sin registrar';
  const supAddress = sup?.address || 'Domicilio conocido';
  const supContact = sup?.contactPerson || 'Representante de Ventas';

  const docTitle = `Orden de Compra - ${record.id} - ${supName}`;

  const bodyContent = `
    <!-- Encabezado Corporativo Oficial -->
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
      ${renderExpensesBrandHeaderBlock(companyName, companyLogo, projectName, projectLocation, false)}
      <div style="text-align: right; border: 1.5px solid #0f172a; border-radius: 8px; padding: 8px 14px; background: #f8fafc;">
        <div style="font-size: 14px; font-weight: 900; color: #0f172a; letter-spacing: 1px;">ORDEN DE COMPRA</div>
        <div style="font-size: 15px; font-weight: 800; color: #2563eb; font-family: monospace;">FOLIO: ${record.id}</div>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">FECHA: <strong>${record.date || new Date().toISOString().slice(0, 10)}</strong></div>
      </div>
    </div>

    <!-- Cajas de Información: Proveedor y Obra -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
      <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #ffffff;">
        <div style="font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
          DATOS DEL PROVEEDOR
        </div>
        <table style="width: 100%; font-size: 11px; line-height: 1.4;">
          <tr><td style="color:#64748b; width:75px;">Razón Social:</td><td><strong>${supName}</strong></td></tr>
          <tr><td style="color:#64748b;">R.F.C.:</td><td style="font-family:monospace;">${supRfc}</td></tr>
          <tr><td style="color:#64748b;">Atención:</td><td>${supContact}</td></tr>
          <tr><td style="color:#64748b;">Teléfono:</td><td>${supPhone}</td></tr>
          <tr><td style="color:#64748b;">Correo:</td><td>${supEmail}</td></tr>
          <tr><td style="color:#64748b;">Dirección:</td><td>${supAddress}</td></tr>
        </table>
      </div>

      <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #ffffff;">
        <div style="font-size: 11px; font-weight: 800; color: #1e293b; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
          CONDICIONES DE LA COMPRA Y ENTREGA
        </div>
        <table style="width: 100%; font-size: 11px; line-height: 1.4;">
          <tr><td style="color:#64748b; width:95px;">Tipo de Gasto:</td><td><strong style="text-transform:uppercase;">${record.type || 'MATERIAL'}</strong></td></tr>
          <tr><td style="color:#64748b;">Partida / Rubro:</td><td>${record.category || 'General de Obra'}</td></tr>
          <tr><td style="color:#64748b;">Método Pago:</td><td><span style="text-transform:capitalize;">${record.paymentMethod || 'Transferencia'}</span></td></tr>
          <tr><td style="color:#64748b;">Estado Pago:</td><td><strong style="color:${record.paymentStatus === 'paid' ? '#059669' : '#d97706'};">${record.paymentStatus === 'paid' ? 'PAGADO' : 'POR PAGAR / CRÉDITO'}</strong></td></tr>
          <tr><td style="color:#64748b;">Factura / Rem.:</td><td style="font-family:monospace; font-weight:bold;">${record.invoiceNumber || 'Pendiente'}</td></tr>
          <tr><td style="color:#64748b;">Moneda:</td><td>${currency}</td></tr>
        </table>
      </div>
    </div>

    <!-- Tabla de Conceptos / Insumos Suministrados -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff; text-align: left;">
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 35px; text-align:center;">#</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 90px;">CLAVE</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a;">DESCRIPCIÓN DETALLADA DEL MATERIAL / SERVICIO</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 50px; text-align:center;">UNID.</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 65px; text-align:right;">CANT.</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 90px; text-align:right;">P. UNITARIO</th>
          <th style="padding: 7px 8px; border: 1px solid #0f172a; width: 95px; text-align:right;">SUBTOTAL</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align:center; font-weight:bold;">1</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; font-family:monospace; font-weight:bold; color:#2563eb;">${record.insumoClave || record.insumoId || 'MAT-01'}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1;">
            <div style="font-weight: 700; color:#0f172a;">${record.description || 'Suministro de insumos'}</div>
            ${record.notes ? `<div style="font-size:10px; color:#64748b; margin-top:2px; font-style:italic;">Nota: ${record.notes}</div>` : ''}
          </td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align:center; font-weight:600;">${record.unit || 'pza'}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align:right; font-family:monospace; font-weight:bold;">${formatNumber(record.quantity)}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align:right; font-family:monospace;">${formatCurrency(record.unitPrice)}</td>
          <td style="padding: 8px; border: 1px solid #cbd5e1; text-align:right; font-family:monospace; font-weight:bold;">${formatCurrency(record.subtotal)}</td>
        </tr>
      </tbody>
    </table>

    <!-- Resumen Financiero: Subtotal, IVA, Total -->
    <div style="display: flex; justify-content: flex-end; margin-bottom: 24px;">
      <div style="width: 260px; border: 1.5px solid #0f172a; border-radius: 6px; overflow: hidden;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <tr style="background:#f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 6px 10px; font-weight:bold; color:#475569;">SUBTOTAL:</td>
            <td style="padding: 6px 10px; text-align:right; font-family:monospace; font-weight:bold;">${formatCurrency(record.subtotal)}</td>
          </tr>
          <tr style="background:#f8fafc; border-bottom: 1px solid #0f172a;">
            <td style="padding: 6px 10px; font-weight:bold; color:#475569;">I.V.A. (16%):</td>
            <td style="padding: 6px 10px; text-align:right; font-family:monospace; font-weight:bold;">${formatCurrency(record.tax)}</td>
          </tr>
          <tr style="background:#0f172a; color:#ffffff;">
            <td style="padding: 8px 10px; font-size: 12px; font-weight:900;">TOTAL M.N.:</td>
            <td style="padding: 8px 10px; text-align:right; font-size: 13px; font-family:monospace; font-weight:900; color:#38bdf8;">${formatCurrency(record.total)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Notas de Entrega y Cláusulas Operativas -->
    <div style="border: 1px dashed #94a3b8; border-radius: 6px; padding: 8px 12px; margin-bottom: 30px; font-size: 10px; color: #475569; background: #f8fafc;">
      <strong>CLÁUSULAS Y CONDICIONES DE RECEPCIÓN:</strong>
      <ol style="margin: 4px 0 0 16px; padding: 0;">
        <li>Todo material debe entregarse a pie de obra debidamente empacado y con su nota de remisión o factura original.</li>
        <li>No se recibirán materiales dañados, caducos o con especificaciones distintas a las indicadas en esta orden.</li>
        <li>Indispensable citar el Folio <strong>${record.id}</strong> en su factura electrónica (CFDI).</li>
      </ol>
    </div>

    <!-- Firmas Oficiales de Control y Autorización -->
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; margin-top: 40px; page-break-inside: avoid;">
      <div style="border-top: 1.5px solid #0f172a; padding-top: 6px;">
        <div style="font-size: 11px; font-weight: 800; color: #0f172a;">ELABORÓ</div>
        <div style="font-size: 10px; color: #64748b;">Depto. de Compras / Costos</div>
      </div>
      <div style="border-top: 1.5px solid #0f172a; padding-top: 6px;">
        <div style="font-size: 11px; font-weight: 800; color: #0f172a;">AUTORIZÓ</div>
        <div style="font-size: 10px; color: #64748b;">Residente de Obra / Dirección</div>
      </div>
      <div style="border-top: 1.5px solid #0f172a; padding-top: 6px;">
        <div style="font-size: 11px; font-weight: 800; color: #0f172a;">RECIBIÓ PROVEEDOR</div>
        <div style="font-size: 10px; color: #64748b;">Nombre, Firma y Fecha</div>
      </div>
    </div>
  `;

  openPrintWindow(docTitle, bodyContent, 'portrait');
}

/**
 * Imprimir Reporte General según la vista activa de Compras y Pagos
 */
export function printExpensesActiveReport(activeSubTab = 'tablero') {
  const branding = resolveActivePrintBranding(state.settings);
  const companyName = branding.companyName;
  const companyLogo = branding.companyLogo;
  const projectName = state.settings?.projectName || 'Obra Principal';
  const projectLocation = state.settings?.projectLocation || 'En sitio';
  const todayStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  if (activeSubTab === 'tablero') {
    const kpis = getExpensesKpiMetrics();
    const docTitle = `Reporte Financiero ERP - ${projectName}`;
    const sem = kpis.semaforo;

    const bodyContent = `
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
        ${renderExpensesBrandHeaderBlock(companyName, companyLogo, projectName, projectLocation, false)}
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 900; color: #0f172a;">DASHBOARD FINANCIERO ERP</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">FECHA: <strong>${todayStr}</strong></div>
          <div style="font-size: 11px; font-weight: bold; color: ${sem.color === 'emerald' ? '#059669' : sem.color === 'amber' ? '#d97706' : '#dc2626'}; margin-top: 3px;">
            SEMÁFORO: ${sem.badgeText.toUpperCase()}
          </div>
        </div>
      </div>

      <!-- Resumen Ejecutivo KPI -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px;">
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Presupuesto Obra</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 4px;">${formatCurrency(kpis.presupuestoContratado)}</div>
          <div style="font-size: 9.5px; color: #64748b;">Monto contratado base</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Facturado / Cobrado</div>
          <div style="font-size: 16px; font-weight: 900; color: #059669; font-family: monospace; margin-top: 4px;">${formatCurrency(kpis.totalFacturadoEstimado)}</div>
          <div style="font-size: 9.5px; color: #64748b;">Avance en estimaciones</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Egresos Pagados</div>
          <div style="font-size: 16px; font-weight: 900; color: #dc2626; font-family: monospace; margin-top: 4px;">${formatCurrency(kpis.totalEgresosReales)}</div>
          <div style="font-size: 9.5px; color: #64748b;">Compras y nóminas liquidadas</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Cuentas por Pagar</div>
          <div style="font-size: 16px; font-weight: 900; color: #d97706; font-family: monospace; margin-top: 4px;">${formatCurrency(kpis.totalEgresosPorPagar)}</div>
          <div style="font-size: 9.5px; color: #64748b;">Pendientes de liquidar</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Utilidad en Caja</div>
          <div style="font-size: 16px; font-weight: 900; color: ${kpis.utilidadEnCaja >= 0 ? '#4338ca' : '#dc2626'}; font-family: monospace; margin-top: 4px;">${formatCurrency(kpis.utilidadEnCaja)}</div>
          <div style="font-size: 9.5px; color: #64748b;">Cobrado − Egresos</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; background: #f8fafc;">
          <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Utilidad Proyectada</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 4px;">${formatCurrency(kpis.proyeccionUtilidadCierre)}</div>
          <div style="font-size: 9.5px; color: #64748b;">Margen estimado: ${kpis.margenUtilidadProyectado}%</div>
        </div>
      </div>

      <!-- Tabla de Egresos por Rubro -->
      <div style="font-size: 12px; font-weight: 800; color: #1e293b; margin-bottom: 6px; text-transform: uppercase;">
        DISTRIBUCIÓN DE EGRESOS POR RUBRO DE COSTO
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 11px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff;">
            <th style="padding: 7px 10px; border: 1px solid #0f172a; text-align: left;">Rubro de Gasto</th>
            <th style="padding: 7px 10px; border: 1px solid #0f172a; text-align: center; width: 80px;">Registros</th>
            <th style="padding: 7px 10px; border: 1px solid #0f172a; text-align: right; width: 110px;">Subtotal</th>
            <th style="padding: 7px 10px; border: 1px solid #0f172a; text-align: right; width: 100px;">IVA (16%)</th>
            <th style="padding: 7px 10px; border: 1px solid #0f172a; text-align: right; width: 120px;">Total Egresos</th>
            <th style="padding: 7px 10px; border: 1px solid #0f172a; text-align: right; width: 120px;">Pagado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold;">📦 Materiales de Construcción</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${kpis.byType.material.count}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.material.subtotal)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.material.tax)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(kpis.byType.material.total)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; color: #059669; font-weight: bold;">${formatCurrency(kpis.byType.material.paid)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold;">👷 Mano de Obra / Raya de Cuadrillas</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${kpis.byType.labor.count}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.labor.subtotal)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.labor.tax)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(kpis.byType.labor.total)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; color: #059669; font-weight: bold;">${formatCurrency(kpis.byType.labor.paid)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold;">🚜 Equipos, Fletes y Maquinaria</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${kpis.byType.equipment.count}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.equipment.subtotal)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.equipment.tax)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(kpis.byType.equipment.total)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; color: #059669; font-weight: bold;">${formatCurrency(kpis.byType.equipment.paid)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: bold;">📑 Gastos Indirectos y Administración</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center;">${kpis.byType.indirect.count}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.indirect.subtotal)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.indirect.tax)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(kpis.byType.indirect.total)}</td>
            <td style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; color: #059669; font-weight: bold;">${formatCurrency(kpis.byType.indirect.paid)}</td>
          </tr>
          <tr style="background: #f1f5f9; font-weight: bold;">
            <td style="padding: 7px 10px; border: 1px solid #cbd5e1;">TOTAL CONSOLIDADO:</td>
            <td style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: center;">${kpis.totalRegistros}</td>
            <td style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.totalEgresosComprometidos - (kpis.byType.material.tax + kpis.byType.labor.tax + kpis.byType.equipment.tax + kpis.byType.indirect.tax))}</td>
            <td style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(kpis.byType.material.tax + kpis.byType.labor.tax + kpis.byType.equipment.tax + kpis.byType.indirect.tax)}</td>
            <td style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 12px; color: #0f172a;">${formatCurrency(kpis.totalEgresosComprometidos)}</td>
            <td style="padding: 7px 10px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 12px; color: #059669;">${formatCurrency(kpis.totalEgresosReales)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Firmas Oficiales -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; margin-top: 40px; page-break-inside: avoid;">
        <div style="border-top: 1.5px solid #0f172a; padding-top: 6px;">
          <div style="font-size: 11px; font-weight: 800; color: #0f172a;">CONTROL DE COSTOS</div>
          <div style="font-size: 10px; color: #64748b;">Elaboró</div>
        </div>
        <div style="border-top: 1.5px solid #0f172a; padding-top: 6px;">
          <div style="font-size: 11px; font-weight: 800; color: #0f172a;">RESIDENTE DE OBRA</div>
          <div style="font-size: 10px; color: #64748b;">Revisó</div>
        </div>
        <div style="border-top: 1.5px solid #0f172a; padding-top: 6px;">
          <div style="font-size: 11px; font-weight: 800; color: #0f172a;">DIRECCIÓN GENERAL</div>
          <div style="font-size: 10px; color: #64748b;">Autorizó</div>
        </div>
      </div>
    `;

    openPrintWindow(docTitle, bodyContent, 'portrait');
  } else if (activeSubTab === 'bitacora') {
    const records = getExpensesRecords();
    const docTitle = `Bitácora de Egresos y Compras - ${projectName}`;

    const rowsHtml = records.map((r, i) => {
      const sup = r.supplierId ? getSupplierById(r.supplierId) : null;
      const supName = sup ? sup.name : (r.supplierName || 'Varios');
      const isPaid = r.paymentStatus === 'paid';
      return `
        <tr>
          <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center;">${i + 1}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #2563eb;">${r.id}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1;">${r.date || '---'}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; text-transform: capitalize;">${r.type || 'Material'}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: 600;">${r.description || 'Sin descripción'}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1;">${supName}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; font-family: monospace;">${r.invoiceNumber || '---'}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatNumber(r.quantity)} ${r.unit || 'pza'}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(r.unitPrice)}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(r.total)}</td>
          <td style="padding: 5px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${isPaid ? '#059669' : '#d97706'};">
            ${isPaid ? 'PAGADO' : 'POR PAGAR'}
          </td>
        </tr>
      `;
    }).join('');

    const totalSub = records.reduce((a, b) => a + (b.subtotal || 0), 0);
    const totalTax = records.reduce((a, b) => a + (b.tax || 0), 0);
    const totalAll = records.reduce((a, b) => a + (b.total || 0), 0);

    const bodyContent = `
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
        ${renderExpensesBrandHeaderBlock(companyName, companyLogo, projectName, projectLocation, true)}
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 900; color: #0f172a;">BITÁCORA DE GASTOS Y COMPRAS</div>
          <div style="font-size: 10px; color: #475569;">FECHA: <strong>${todayStr}</strong></div>
          <div style="font-size: 10px; color: #64748b;">TOTAL REGISTROS: <strong>${records.length}</strong></div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 16px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff;">
            <th style="padding: 6px; border: 1px solid #0f172a; width: 25px;">#</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 75px;">Folio OC</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 65px;">Fecha</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 60px;">Tipo</th>
            <th style="padding: 6px; border: 1px solid #0f172a;">Descripción del Insumo / Gasto</th>
            <th style="padding: 6px; border: 1px solid #0f172a;">Proveedor</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 65px;">Factura</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 60px; text-align: right;">Cant.</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 65px; text-align: right;">P.U.</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 75px; text-align: right;">Total</th>
            <th style="padding: 6px; border: 1px solid #0f172a; width: 65px; text-align: center;">Estatus</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr style="background: #f1f5f9; font-weight: bold;">
            <td colspan="7" style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">TOTALES ACUMULADOS:</td>
            <td colspan="2" style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">Sub: ${formatCurrency(totalSub)}</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-size: 11px; color: #0f172a;">${formatCurrency(totalAll)}</td>
            <td style="padding: 6px; border: 1px solid #cbd5e1;"></td>
          </tr>
        </tbody>
      </table>

      <!-- Firmas -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; margin-top: 30px; page-break-inside: avoid;">
        <div style="border-top: 1px solid #0f172a; padding-top: 4px; font-size: 10px;">
          <strong>ELABORÓ</strong><br><span style="color:#64748b;">Compras</span>
        </div>
        <div style="border-top: 1px solid #0f172a; padding-top: 4px; font-size: 10px;">
          <strong>REVISÓ</strong><br><span style="color:#64748b;">Control de Costos</span>
        </div>
        <div style="border-top: 1px solid #0f172a; padding-top: 4px; font-size: 10px;">
          <strong>AUTORIZÓ</strong><br><span style="color:#64748b;">Residente de Obra</span>
        </div>
      </div>
    `;

    openPrintWindow(docTitle, bodyContent, 'landscape');
  } else {
    // Comparativa dividida formalmente por rubros (Materiales, Mano de Obra, Herramienta, Equipo, Maquinaria, Subcontratos)
    const comp = getInsumosBudgetVsActualComparison();
    const docTitle = `Comparativa Presupuesto vs Real por Rubro - ${projectName}`;

    const categoryTablesHtml = comp.categories.filter(c => c.items.length > 0).map(cat => {
      const rows = cat.items.map((i, idx) => `
        <tr>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #2563eb;">${i.clave || '---'}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; font-weight: 600;">${i.descripcion || 'Sin descripción'}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center;">${i.unidad || 'pza'}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatNumber(i.cantidadPresupuestada)}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold;">${formatNumber(i.cantidadComprada)}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; color: ${i.saldoDisponible < 0 ? '#dc2626' : '#059669'}; font-weight: bold;">${formatNumber(i.saldoDisponible)}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${formatCurrency(i.puPresupuestado)}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">${i.cantidadComprada > 0 ? formatCurrency(i.puRealPromedio) : '---'}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(i.importeComprado)}</td>
          <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: ${i.alertLevel === 'danger' ? '#dc2626' : i.alertLevel === 'warning' ? '#d97706' : '#059669'};">
            ${i.alertReason}
          </td>
        </tr>
      `).join('');

      return `
        <div style="background: #0f172a; color: #ffffff; padding: 5px 8px; font-weight: 800; font-size: 10px; margin-top: 14px; margin-bottom: 2px; display: flex; justify-content: space-between; border-radius: 3px;">
          <span>${cat.label.toUpperCase()} (${cat.items.length} insumos)</span>
          <span>Presupuesto: ${formatCurrency(cat.totalPresupuestado)} | Real: ${formatCurrency(cat.totalComprado)} | Saldo: ${formatCurrency(cat.saldoDisponible)}</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; margin-bottom: 8px;">
          <thead>
            <tr style="background: #f1f5f9; color: #334155; font-size: 9px;">
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 25px;">#</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 80px;">Clave</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1;">Descripción Insumo</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">Unid.</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 65px; text-align: right;">Cant. Pres.</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 65px; text-align: right;">Cant. Real</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 65px; text-align: right;">Saldo Disp.</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 65px; text-align: right;">P.U. Pres.</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 65px; text-align: right;">P.U. Real</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 75px; text-align: right;">Importe Real</th>
              <th style="padding: 4px 6px; border: 1px solid #cbd5e1; width: 85px; text-align: center;">Semáforo</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr style="background: #f8fafc; font-weight: bold; font-size: 9.5px;">
              <td colspan="4" style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right;">SUBTOTAL ${cat.shortLabel.toUpperCase()}:</td>
              <td colspan="3" style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace;">Presupuesto: ${formatCurrency(cat.totalPresupuestado)}</td>
              <td colspan="3" style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; color: #0f172a;">Real: ${formatCurrency(cat.totalComprado)}</td>
              <td style="padding: 4px 6px; border: 1px solid #cbd5e1; text-align: center; font-family: monospace; color: ${cat.saldoDisponible < 0 ? '#dc2626' : '#059669'};">Saldo: ${formatCurrency(cat.saldoDisponible)}</td>
            </tr>
          </tfoot>
        </table>
      `;
    }).join('');

    const bodyContent = `
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
        ${renderExpensesBrandHeaderBlock(companyName, companyLogo, projectName, projectLocation, true)}
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 900; color: #0f172a;">PRESUPUESTO DIRECTO VS. COMPRAS REALES</div>
          <div style="font-size: 10px; color: #475569;">FECHA: <strong>${todayStr}</strong></div>
          <div style="font-size: 10px; color: #64748b;">TOTAL INSUMOS CONTROLADOS: <strong>${comp.items.length}</strong></div>
        </div>
      </div>

      ${categoryTablesHtml}

      <!-- Resumen General -->
      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 14px; margin-bottom: 16px;">
        <tr style="background: #0f172a; color: white; font-weight: bold;">
          <td style="padding: 6px 10px; text-align: left;">GRAN TOTAL CONSOLIDADO DE LA OBRA:</td>
          <td style="padding: 6px 10px; text-align: right; font-family: monospace;">Presupuesto: ${formatCurrency(comp.resumen.totalPresupuestadoInsumos)}</td>
          <td style="padding: 6px 10px; text-align: right; font-family: monospace;">Real: ${formatCurrency(comp.resumen.totalCompradoInsumos)}</td>
          <td style="padding: 6px 10px; text-align: right; font-family: monospace; color: ${(comp.resumen.totalPresupuestadoInsumos - comp.resumen.totalCompradoInsumos) < 0 ? '#fca5a5' : '#86efac'};">Saldo: ${formatCurrency(comp.resumen.totalPresupuestadoInsumos - comp.resumen.totalCompradoInsumos)}</td>
        </tr>
      </table>

      <!-- Firmas -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; margin-top: 30px; page-break-inside: avoid;">
        <div style="border-top: 1px solid #0f172a; padding-top: 4px; font-size: 10px;">
          <strong>CONTROL DE COSTOS</strong>
        </div>
        <div style="border-top: 1px solid #0f172a; padding-top: 4px; font-size: 10px;">
          <strong>RESIDENTE DE OBRA</strong>
        </div>
        <div style="border-top: 1px solid #0f172a; padding-top: 4px; font-size: 10px;">
          <strong>DIRECCIÓN GENERAL</strong>
        </div>
      </div>
    `;

    openPrintWindow(docTitle, bodyContent, 'landscape');
  }
}
