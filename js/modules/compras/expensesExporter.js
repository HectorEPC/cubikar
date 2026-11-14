// js/modules/compras/expensesExporter.js
// Exportación a Excel (.xlsx) y generación de formatos imprimibles oficiales de Orden de Compra y Reportes

import { state } from '../../state/store.js';
import { formatCurrency, formatNumber, round2 } from '../../core/formatters.js';
import { showToast } from '../../ui/notifications.js';
import { openPrintWindow } from '../io/printService.js';
import { getExpensesRecords, getExpensesSuppliers, getSupplierById, getExpensesSignatures } from './expensesModel.js';
import { getExpensesKpiMetrics, getInsumosBudgetVsActualComparison } from './expensesCalculations.js';
import { getActiveProjectId } from '../../config/constants.js';
import { archiveGeneratedWorkbookReport } from '../../services/s3StorageService.js';
import { resolveActivePrintBranding } from '../io/printBrandingService.js';

/**
 * Renderizar bloque dinámico de firmas configuradas para los reportes de Compras y Pagos
 */
export function renderExpensesPrintSignaturesBlock(customSignatures = null, isDarkTheme = false) {
  const sigs = customSignatures || getExpensesSignatures();
  if (!Array.isArray(sigs) || sigs.length === 0) return '';

  const cols = Math.min(Math.max(sigs.length, 1), 5);
  const borderColor = isDarkTheme ? '#334155' : '#0f172a';
  const roleColor = isDarkTheme ? '#38bdf8' : '#0f172a';
  const nameColor = isDarkTheme ? '#ffffff' : '#1e293b';
  const cargoColor = isDarkTheme ? '#94a3b8' : '#64748b';

  const itemsHtml = sigs.map(s => `
    <div style="border-top: 1.5px solid ${borderColor}; padding-top: 6px; min-width: 0; text-align: center;">
      <div style="font-size: 10px; font-weight: 800; color: ${roleColor}; text-transform: uppercase; letter-spacing: 0.3px;">${s.rol || 'FIRMA'}</div>
      ${s.nombre ? `<div style="font-size: 11px; font-weight: bold; color: ${nameColor}; margin-top: 3px;">${s.nombre}</div>` : '<div style="height: 14px;"></div>'}
      <div style="font-size: 9px; color: ${cargoColor}; margin-top: 2px;">${s.cargo || ''}</div>
    </div>
  `).join('');

  return `
    <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 20px; text-align: center; margin-top: 24px; page-break-inside: avoid;">
      ${itemsHtml}
    </div>
  `;
}

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
    ${renderExpensesPrintSignaturesBlock()}
  `;

  openPrintWindow(docTitle, bodyContent, 'portrait');
}

/**
 * Imprimir Reporte General según la vista activa de Compras y Pagos
 */

/**
 * Renderizar el Tablero Resumen Financiero ERP en formato imprimible idéntico al Dashboard
 */
export function renderPrintableExecutiveDashboardHTML(kpis, branding) {
  const sem = kpis?.semaforo || { color: 'emerald', badgeText: 'Saludable / En Presupuesto', icon: 'fa-circle-check', description: '' };
  const isHealthy = sem.color === 'emerald';
  const isWarning = sem.color === 'amber';

  const pctCobrado = (kpis?.presupuestoContratado || 0) > 0 
    ? round2(((kpis?.totalFacturadoEstimado || 0) / kpis.presupuestoContratado) * 100) 
    : 0;
  const pctGastado = sem.pctGastado || 0;

  const comp = getInsumosBudgetVsActualComparison();
  const categories = comp?.categories || [];
  const records = getExpensesRecords() || [];
  const suppliers = getExpensesSuppliers() || [];

  const rubroMeta = {
    'Material': { label: 'Materiales', color: '#06b6d4', grad: 'from-cyan-500 to-blue-500', icon: 'fa-box', textColor: 'text-cyan-400' },
    'Mano de Obra': { label: 'Mano de Obra', color: '#a855f7', grad: 'from-purple-500 to-pink-500', icon: 'fa-user-group', textColor: 'text-purple-400' },
    'Herramienta': { label: 'Herramienta', color: '#f59e0b', grad: 'from-amber-500 to-orange-500', icon: 'fa-screwdriver-wrench', textColor: 'text-amber-400' },
    'Equipo': { label: 'Equipo / Fletes', color: '#6366f1', grad: 'from-indigo-500 to-blue-500', icon: 'fa-truck', textColor: 'text-indigo-400' },
    'Maquinaria': { label: 'Maquinaria', color: '#ec4899', grad: 'from-pink-500 to-rose-500', icon: 'fa-tractor', textColor: 'text-rose-400' },
    'Subcontrato': { label: 'Subcontratos', color: '#10b981', grad: 'from-emerald-500 to-teal-500', icon: 'fa-handshake', textColor: 'text-emerald-400' },
    'Indirecto': { label: 'Indirectos', color: '#94a3b8', grad: 'from-slate-500 to-slate-600', icon: 'fa-file-lines', textColor: 'text-slate-400' }
  };

  const totalSpendComprometido = categories.reduce((sum, c) => sum + (c.totalComprado || 0), 0);
  const totalBudgetDirecto = categories.reduce((sum, c) => sum + (c.totalPresupuestado || 0), 0);
  const chartBasis = totalSpendComprometido > 0 ? totalSpendComprometido : (totalBudgetDirecto > 0 ? totalBudgetDirecto : 1);

  // Generar SVG Donut
  const donutR = 52;
  const donutC = 2 * Math.PI * donutR;
  let accumulatedDonutLen = 0;

  const donutSlicesSvg = categories.map(cat => {
    const val = totalSpendComprometido > 0 ? cat.totalComprado : cat.totalPresupuestado;
    const share = chartBasis > 0 ? (val / chartBasis) : 0;
    const arcLen = round2(share * donutC);
    const gap = round2(donutC - arcLen);
    const meta = rubroMeta[cat.key] || rubroMeta['Material'];
    const strokeDash = `${arcLen} ${gap}`;
    const strokeOffset = -accumulatedDonutLen;
    accumulatedDonutLen += arcLen;

    if (arcLen <= 0.5) return '';
    return `
      <circle cx="90" cy="90" r="${donutR}" fill="none" stroke="${meta.color}" stroke-width="18"
              stroke-dasharray="${strokeDash}" stroke-dashoffset="${strokeOffset}" stroke-linecap="butt">
      </circle>
    `;
  }).join('');

  // Velocímetro SVG
  const gaugeR = 68;
  const gaugeLen = Math.PI * gaugeR;
  const clampedGaugePct = Math.min(100, Math.max(0, pctGastado));
  const gaugeDashOffset = round2(gaugeLen * (1 - clampedGaugePct / 100));
  const needleAngle = round2(-90 + (clampedGaugePct / 100) * 180);

  const semBadgeClass = isHealthy 
    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
    : isWarning 
      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' 
      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30';

  const semPulseColor = isHealthy ? 'bg-emerald-400' : isWarning ? 'bg-amber-400' : 'bg-rose-400';

  // Top 4 Proveedores
  const supplierSpendMap = new Map();
  records.forEach(r => {
    if (r.paymentStatus === 'cancelled') return;
    const supId = r.supplierId || 'general';
    const supName = r.supplierName || (getSupplierById(r.supplierId)?.name) || 'Proveedor General';
    if (!supplierSpendMap.has(supId)) {
      supplierSpendMap.set(supId, { id: supId, name: supName, count: 0, total: 0, paid: 0, pending: 0 });
    }
    const item = supplierSpendMap.get(supId);
    item.count++;
    item.total = round2(item.total + (parseFloat(r.total) || 0));
    if (r.paymentStatus === 'paid') {
      item.paid = round2(item.paid + (parseFloat(r.total) || 0));
    } else {
      item.pending = round2(item.pending + (parseFloat(r.total) || 0));
    }
  });

  let topSuppliers = Array.from(supplierSpendMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);

  if (topSuppliers.length === 0 && suppliers.length > 0) {
    topSuppliers = suppliers.slice(0, 3).map(s => ({
      id: s.id,
      name: s.name,
      count: 0,
      total: 0,
      paid: 0,
      pending: 0,
      contactPerson: s.contactPerson || s.phone || 'Registrado'
    }));
  }

  const companyLogo = branding?.companyLogo || '';
  const companyName = branding?.companyName || 'Constructora';
  const projectName = state?.settings?.projectName || 'Obra Principal';
  const projectLocation = state?.settings?.projectLocation || 'En sitio';
  const todayStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <div class="space-y-3.5 max-w-full mx-auto bg-[#0b1329] text-slate-100 p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl" style="font-family: system-ui, -apple-system, sans-serif;">
      
      <!-- ENCABEZADO INSTITUCIONAL Y DEL DASHBOARD EJECUTIVO -->
      <div class="flex items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
            <i class="fa-solid fa-chart-pie text-white text-base"></i>
          </div>
          <div>
            <h1 class="text-base font-black text-white tracking-wide flex items-center gap-2">
              <span>TABLERO RESUMEN FINANCIERO ERP</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">En Tiempo Real</span>
            </h1>
            <p class="text-[11px] text-slate-400 font-medium">Control ejecutivo de costos, presupuesto contratado, ingresos por estimación y egresos por rubro</p>
          </div>
        </div>

        <div class="flex items-center gap-3 text-right shrink-0">
          <div>
            <div class="text-xs font-black uppercase tracking-wider text-white">${companyName}</div>
            <div class="text-[11px] font-bold text-cyan-400">${projectName}</div>
            <div class="text-[9.5px] text-slate-400">Ubicación: ${projectLocation} | Fecha: ${todayStr}</div>
          </div>
          ${companyLogo ? `
            <img src="${companyLogo}" alt="Logo" class="h-10 w-10 object-contain rounded-lg border border-slate-700 bg-white/5 p-1 shrink-0">
          ` : ''}
        </div>
      </div>

      <!-- FILA 1: 5 TARJETAS KPI SUPERIORES CON DEGRADADOS NEÓN -->
      <div class="grid grid-cols-5 gap-3">
        
        <!-- Tarjeta 1: Presupuesto Obra -->
        <div class="bg-[#121c38] border border-slate-800 rounded-xl p-3 space-y-1 relative overflow-hidden shadow-md">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[9.5px] font-bold uppercase tracking-wider">Presupuesto Obra</span>
            <span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30">BASE VENTA</span>
          </div>
          <div class="text-base font-black font-mono text-white tracking-tight">
            ${formatCurrency(kpis?.presupuestoContratado || 0)}
          </div>
          <div class="text-[9.5px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Directo: <strong class="text-slate-300 font-mono">${formatCurrency(kpis?.costoDirectoPresupuestado || 0)}</strong></span>
            <i class="fa-solid fa-file-contract text-cyan-400 text-[10px]"></i>
          </div>
        </div>

        <!-- Tarjeta 2: Cobrado / Estimado -->
        <div class="bg-[#121c38] border border-slate-800 rounded-xl p-3 space-y-1 relative overflow-hidden shadow-md">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[9.5px] font-bold uppercase tracking-wider">Cobrado / Estimado</span>
            <span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-0.5">
              <i class="fa-solid fa-arrow-up text-[7px]"></i> ${pctCobrado}%
            </span>
          </div>
          <div class="text-base font-black font-mono text-cyan-300 tracking-tight">
            ${formatCurrency(kpis?.totalFacturadoEstimado || 0)}
          </div>
          <div class="text-[9.5px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Avance acumulado</span>
            <i class="fa-solid fa-hand-holding-dollar text-cyan-400 text-[10px]"></i>
          </div>
        </div>

        <!-- Tarjeta 3: Egresos Pagados -->
        <div class="bg-[#121c38] border border-slate-800 rounded-xl p-3 space-y-1 relative overflow-hidden shadow-md">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[9.5px] font-bold uppercase tracking-wider">Egresos Pagados</span>
            <span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
              ${kpis?.totalRegistros || 0} ÓRDENES
            </span>
          </div>
          <div class="text-base font-black font-mono text-rose-400 tracking-tight">
            ${formatCurrency(kpis?.totalEgresosReales || 0)}
          </div>
          <div class="text-[9.5px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Por Pagar: <strong class="text-amber-400 font-mono">${formatCurrency(kpis?.totalEgresosPorPagar || 0)}</strong></span>
            <i class="fa-solid fa-money-bill-wave text-rose-400 text-[10px]"></i>
          </div>
        </div>

        <!-- Tarjeta 4: Utilidad en Caja -->
        <div class="bg-[#121c38] border border-slate-800 rounded-xl p-3 space-y-1 relative overflow-hidden shadow-md">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[9.5px] font-bold uppercase tracking-wider">Utilidad en Caja</span>
            <span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold ${(kpis?.utilidadEnCaja || 0) >= 0 ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'}">
              FLUJO NETO
            </span>
          </div>
          <div class="text-base font-black font-mono ${(kpis?.utilidadEnCaja || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'} tracking-tight">
            ${formatCurrency(kpis?.utilidadEnCaja || 0)}
          </div>
          <div class="text-[9.5px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Cobrado - Egresos</span>
            <i class="fa-solid fa-piggy-bank text-emerald-400 text-[10px]"></i>
          </div>
        </div>

        <!-- Tarjeta 5: Utilidad Proyectada -->
        <div class="bg-[#121c38] border border-slate-800 rounded-xl p-3 space-y-1 relative overflow-hidden shadow-md">
          <div class="flex items-center justify-between text-slate-400">
            <span class="text-[9.5px] font-bold uppercase tracking-wider">Utilidad Proyectada</span>
            <span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold ${(kpis?.margenUtilidadProyectado || 0) >= 10 ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'}">
              ${kpis?.margenUtilidadProyectado || 0}% MARGEN
            </span>
          </div>
          <div class="text-base font-black font-mono ${(kpis?.proyeccionUtilidadCierre || 0) >= 0 ? 'text-amber-300' : 'text-rose-400'} tracking-tight">
            ${formatCurrency(kpis?.proyeccionUtilidadCierre || 0)}
          </div>
          <div class="text-[9.5px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
            <span>Presupuesto - Gasto</span>
            <i class="fa-solid fa-chart-line text-amber-400 text-[10px]"></i>
          </div>
        </div>

      </div>

      <!-- FILA 2: VELOCÍMETRO (GAUGE) Y DONUT CHART DE 6 RUBROS -->
      <div class="grid grid-cols-12 gap-3.5">
        
        <!-- Panel Izquierdo: Velocímetro / Gauge Radial del Semáforo (cols 5/12) -->
        <div class="col-span-5 bg-[#121c38] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-md relative overflow-hidden">
          <div class="flex items-center justify-between pb-1.5 border-b border-slate-800/70">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-black uppercase tracking-wider text-white">Semáforo Presupuestal</span>
              <span class="w-2 h-2 rounded-full ${semPulseColor}"></span>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[9.5px] font-bold ${semBadgeClass} flex items-center gap-1">
              <i class="fa-solid ${sem.icon}"></i>
              <span>${sem.badgeText}</span>
            </span>
          </div>

          <!-- Velocímetro SVG -->
          <div class="py-1.5 flex flex-col items-center justify-center">
            <svg viewBox="0 0 200 120" class="w-full max-w-[240px] mx-auto overflow-visible">
              <defs>
                <linearGradient id="print-gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#06b6d4"/>
                  <stop offset="50%" stop-color="#10b981"/>
                  <stop offset="75%" stop-color="#f59e0b"/>
                  <stop offset="100%" stop-color="#ef4444"/>
                </linearGradient>
              </defs>
              <path d="M 32 95 A 68 68 0 0 1 168 95" fill="none" stroke="#1e293b" stroke-width="12" stroke-linecap="round"/>
              <path d="M 32 95 A 68 68 0 0 1 168 95" fill="none" stroke="url(#print-gauge-gradient)" stroke-width="12" stroke-linecap="round"
                    stroke-dasharray="213.63" stroke-dashoffset="${gaugeDashOffset}"/>
              <g transform="rotate(${needleAngle} 100 95)">
                <polygon points="98,95 100,32 102,95" fill="#f8fafc"/>
              </g>
              <circle cx="100" cy="95" r="7" fill="#06b6d4" stroke="#0b1329" stroke-width="2.5"/>
              <circle cx="100" cy="95" r="2.5" fill="#ffffff"/>
              <text x="28" y="112" font-size="8.5" font-weight="700" fill="#64748b" text-anchor="middle">0%</text>
              <text x="100" y="20" font-size="8.5" font-weight="700" fill="#64748b" text-anchor="middle">50%</text>
              <text x="172" y="112" font-size="8.5" font-weight="700" fill="#64748b" text-anchor="middle">100%</text>
            </svg>

            <div class="text-center space-y-0.5 mt-0.5">
              <div class="text-2xl font-black font-mono text-white tracking-tight">${pctGastado}%</div>
              <p class="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Del Presupuesto Total Ejercido</p>
            </div>
          </div>

          <!-- Barra de Detalles -->
          <div class="p-2 bg-[#0e162e] rounded-lg border border-slate-800 space-y-1 text-xs">
            <div class="flex items-center justify-between text-[10.5px]">
              <span class="text-slate-400 font-semibold">Total Comprometido:</span>
              <span class="font-mono font-bold text-white">${formatCurrency(kpis?.totalEgresosComprometidos || 0)}</span>
            </div>
            <div class="flex items-center justify-between text-[10.5px]">
              <span class="text-slate-400 font-semibold">Límite Contratado:</span>
              <span class="font-mono font-bold text-cyan-300">${formatCurrency(kpis?.presupuestoContratado || 0)}</span>
            </div>
            <p class="text-[9px] text-slate-400 leading-tight pt-1 border-t border-slate-800/80">${sem.description || 'Monitoreo de gasto activo.'}</p>
          </div>
        </div>

        <!-- Panel Derecho: Donut Chart & Distribución de los 6 Rubros (cols 7/12) -->
        <div class="col-span-7 bg-[#121c38] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-md">
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800/70">
            <div>
              <h3 class="text-xs font-black uppercase tracking-wider text-white">Distribución por Rubro</h3>
              <p class="text-[9.5px] text-slate-400">Proporción de gasto en los 6 rubros constructivos</p>
            </div>
            <span class="text-[10px] font-mono font-bold px-2 py-0.5 bg-slate-800 text-cyan-300 rounded-md border border-slate-700">
              ${totalSpendComprometido > 0 ? 'Gasto: ' + formatCurrency(totalSpendComprometido) : 'Base: ' + formatCurrency(totalBudgetDirecto)}
            </span>
          </div>

          <div class="grid grid-cols-12 gap-3 items-center py-1.5">
            <!-- Donut SVG (cols 5/12) -->
            <div class="col-span-5 flex flex-col items-center justify-center relative">
              <svg viewBox="0 0 180 180" class="w-36 h-36 transform -rotate-90">
                <circle cx="90" cy="90" r="${donutR}" fill="none" stroke="#1e293b" stroke-width="18"/>
                ${donutSlicesSvg}
              </svg>
              <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span class="text-[11px] font-black font-mono text-white leading-tight">
                  ${totalSpendComprometido > 0 ? formatCurrency(totalSpendComprometido) : formatCurrency(totalBudgetDirecto)}
                </span>
                <span class="text-[8.5px] font-bold uppercase tracking-wider text-cyan-400">
                  ${comp?.resumen?.totalInsumos || 0} INSUMOS
                </span>
              </div>
            </div>

            <!-- Leyenda de 6 Rubros (cols 7/12) -->
            <div class="col-span-7 grid grid-cols-2 gap-1.5 text-xs">
              ${categories.map(cat => {
                const meta = rubroMeta[cat.key] || rubroMeta['Material'];
                const val = totalSpendComprometido > 0 ? cat.totalComprado : cat.totalPresupuestado;
                const pct = chartBasis > 0 ? round2((val / chartBasis) * 100) : 0;
                return `
                  <div class="p-1.5 bg-[#0e162e] rounded-lg border border-slate-800 space-y-0.5">
                    <div class="flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-xs shrink-0" style="background-color: ${meta.color};"></span>
                      <span class="text-[9.5px] font-bold text-slate-300 truncate">${meta.label}</span>
                    </div>
                    <div class="font-mono font-bold text-[10px] text-white">${formatCurrency(val)}</div>
                    <div class="text-[8.5px] text-slate-400 flex items-center justify-between">
                      <span>${cat.items.length} insumos</span>
                      <strong class="font-mono ${meta.textColor}">${pct}%</strong>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="pt-1.5 border-t border-slate-800/70 text-[9.5px] text-slate-400 flex justify-between">
            <span>6 rubros consolidados calculados desde la explosión de insumos</span>
            <span class="text-cyan-400 font-bold font-mono">Total: ${formatCurrency(totalSpendComprometido > 0 ? totalSpendComprometido : totalBudgetDirecto)}</span>
          </div>
        </div>

      </div>

      <!-- FILA 3: AVANCE PRESUPUESTAL POR RUBRO & FLUJO DE CAJA / TOP PROVEEDORES -->
      <div class="grid grid-cols-12 gap-3.5">
        
        <!-- Panel Izquierdo: Barras de Avance Presupuestal por Rubro (cols 6/12) -->
        <div class="col-span-6 bg-[#121c38] border border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-md">
          <div class="flex items-center justify-between pb-1 border-b border-slate-800/70">
            <div>
              <h3 class="text-xs font-black uppercase tracking-wider text-white">Avance Presupuestal por Rubro</h3>
              <p class="text-[9px] text-slate-400">Comparativa del gasto comprometido contra el presupuesto asignado</p>
            </div>
            <span class="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Gasto / Base</span>
          </div>

          <div class="space-y-1.5">
            ${categories.map(cat => {
              const meta = rubroMeta[cat.key] || rubroMeta['Material'];
              const compVal = cat.totalComprado || 0;
              const presup = cat.totalPresupuestado || 0;
              const pctUsed = presup > 0 ? round2((compVal / presup) * 100) : (compVal > 0 ? 100 : 0);
              const isOver = pctUsed > 100;
              return `
                <div class="space-y-0.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-[10px] font-bold text-slate-200 flex items-center gap-1.5">
                      <i class="fa-solid ${meta.icon} ${meta.textColor} text-[9px]"></i>
                      <span>${meta.label}</span>
                    </span>
                    <div class="flex items-center gap-2 font-mono text-[9px]">
                      <span class="text-white font-bold">${formatCurrency(compVal)}</span>
                      <span class="text-slate-500">/</span>
                      <span class="text-slate-400">${formatCurrency(presup)}</span>
                      <span class="px-1.5 py-0.2 rounded text-[8.5px] font-bold ${isOver ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-cyan-300'}">
                        ${pctUsed}%
                      </span>
                    </div>
                  </div>
                  <div class="w-full bg-[#0e162e] h-1.5 rounded-full overflow-hidden p-0.2 border border-slate-800">
                    <div class="h-full rounded-full bg-gradient-to-r ${meta.grad}" style="width: ${Math.min(100, pctUsed)}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Panel Derecho: Flujo de Caja & Top Proveedores (cols 6/12) -->
        <div class="col-span-6 bg-[#121c38] border border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-md flex flex-col justify-between">
          
          <!-- Flujo de Caja y Liquidez -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between pb-1 border-b border-slate-800/70">
              <h3 class="text-xs font-black uppercase tracking-wider text-white">Flujo de Caja y Liquidez</h3>
              <span class="text-[9.5px] font-bold uppercase tracking-wider text-cyan-400 font-mono">
                Caja Neta: ${formatCurrency(kpis?.utilidadEnCaja || 0)}
              </span>
            </div>

            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="p-1.5 bg-[#0e162e] rounded-lg border border-slate-800">
                <span class="text-[8.5px] font-bold text-slate-400 uppercase block">Ingreso Cobrado</span>
                <span class="font-mono font-bold text-[11px] text-cyan-300">${formatCurrency(kpis?.totalFacturadoEstimado || 0)}</span>
              </div>
              <div class="p-1.5 bg-[#0e162e] rounded-lg border border-slate-800">
                <span class="text-[8.5px] font-bold text-slate-400 uppercase block">Egresos Pagados</span>
                <span class="font-mono font-bold text-[11px] text-rose-400">${formatCurrency(kpis?.totalEgresosReales || 0)}</span>
              </div>
              <div class="p-1.5 bg-[#0e162e] rounded-lg border border-slate-800">
                <span class="text-[8.5px] font-bold text-slate-400 uppercase block">Cuentas por Pagar</span>
                <span class="font-mono font-bold text-[11px] text-amber-400">${formatCurrency(kpis?.totalEgresosPorPagar || 0)}</span>
              </div>
            </div>
          </div>

          <!-- Top Proveedores -->
          <div class="space-y-1">
            <div class="flex items-center justify-between pb-0.5 border-b border-slate-800/70">
              <h4 class="text-xs font-black uppercase tracking-wider text-white">Top Proveedores & Contratistas</h4>
              <span class="text-[9px] text-slate-400">Mayor volumen de compra</span>
            </div>

            <div class="grid grid-cols-2 gap-1.5">
              ${topSuppliers.slice(0, 4).map(sup => `
                <div class="p-1.5 bg-[#0e162e] rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <div class="w-5 h-5 rounded bg-blue-600/20 text-cyan-400 flex items-center justify-center shrink-0 text-[9px] font-bold">
                      <i class="fa-solid fa-truck-field"></i>
                    </div>
                    <div class="min-w-0">
                      <p class="font-bold text-slate-200 truncate text-[10px]">${sup.name}</p>
                      <p class="text-[8.5px] text-slate-400 truncate">${sup.count} órdenes</p>
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div class="font-mono font-bold text-white text-[10px]">${formatCurrency(sup.total)}</div>
                    <span class="px-1 py-0.2 rounded text-[7.5px] font-bold ${sup.pending > 0 ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}">
                      ${sup.pending > 0 ? 'Pendiente' : 'Al Corriente'}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </div>

      </div>

      <!-- BLOQUE DE FIRMAS OFICIALES DE CONTROL Y RESPONSABLES (ESTILO EJECUTIVO OSCURO) -->
      ${renderExpensesPrintSignaturesBlock(null, true)}

    </div>
  `;
}

export function printExpensesActiveReport(activeSubTab = 'tablero') {
  try {
  const branding = resolveActivePrintBranding(state?.settings);
  const companyName = branding.companyName;
  const companyLogo = branding.companyLogo;
  const projectName = state?.settings?.projectName || 'Obra Principal';
  const projectLocation = state?.settings?.projectLocation || 'En sitio';
  const todayStr = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

  if (activeSubTab === 'tablero') {
    const kpis = getExpensesKpiMetrics();
    const docTitle = `Tablero Resumen Financiero ERP - ${projectName}`;
    const bodyContent = renderPrintableExecutiveDashboardHTML(kpis, branding);

    openPrintWindow(docTitle, bodyContent, 'landscape', {
      theme: 'dark',
      extraStyles: `
        @media print {
          @page {
            size: letter landscape !important;
            margin: 4mm 5mm 4mm 5mm !important;
          }
          body {
            background-color: #0b1329 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .page-container {
            background-color: #0b1329 !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            box-shadow: none !important;
          }
        }
      `
    });
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

      <!-- Firmas Oficiales -->
      ${renderExpensesPrintSignaturesBlock()}
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

      <!-- Firmas Oficiales -->
      ${renderExpensesPrintSignaturesBlock()}
    `;

    openPrintWindow(docTitle, bodyContent, 'landscape');
  }

  } catch (err) {
    console.error('[printExpensesActiveReport] Error al generar reporte de compras:', err);
    showToast('Error al preparar impresión de Compras: ' + (err.message || 'Error desconocido'), 'error');
  }
}

// Exponer función de impresiÃ³n de compras globalmente
if (typeof window !== 'undefined') {
  window.printExpensesActiveReport = printExpensesActiveReport;
}
