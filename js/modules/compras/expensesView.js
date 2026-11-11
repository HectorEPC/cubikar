// js/modules/compras/expensesView.js
// Renderizador y controlador de eventos para la pestaña COMPRAS Y PAGOS (Control de Gastos y ERP Financiero)

import { state } from '../../state/store.js';
import { formatCurrency, formatNumber, round2 } from '../../core/formatters.js';
import { showToast } from '../../ui/notifications.js';
import { normalizeInsumoText } from '../insumosGenerales/insumosConsolidator.js';
import {
  loadExpensesData,
  saveExpensesData,
  getExpensesRecords,
  getExpenseRecordById,
  saveExpenseRecord,
  deleteExpenseRecord,
  toggleRecordPaymentStatus,
  getExpensesSuppliers,
  getSupplierById,
  saveSupplier,
  deleteSupplier,
  getExpensesConfig,
  updateExpensesConfig
} from './expensesModel.js';
import {
  getExpensesKpiMetrics,
  getAllBudgetInsumosExplosion,
  getInsumosBudgetVsActualComparison
} from './expensesCalculations.js';
import {
  processExpenseEvidenceUpload,
  openExpenseEvidence,
  deleteExpenseEvidence
} from './driveExpenseService.js';
import { mountStorageMeter, resolveHostStorageContext } from '../../services/storageQuotaService.js';
import {
  exportExpensesToExcel,
  printSingleOrdenCompra,
  printExpensesActiveReport
} from './expensesExporter.js';
import { renderTabAssignedAvatars } from '../portal/portalController.js';
import { resolveWorkspacePlanContext } from '../portal/projectService.js';

function isAdvancedExpensesAllowed() {
  const planId = resolveWorkspacePlanContext()?.planId || 'free';
  return planId === 'plus' || planId === 'pro';
}

let activeExpensesSubTab = 'tablero'; // 'tablero' | 'bitacora' | 'comparativa'
let expensesSearchTerm = '';
let expensesTypeFilter = 'all';
let expensesStatusFilter = 'all';

let comparativaSearchTerm = '';
let comparativaTypeFilter = 'all';
let comparativaAlertFilter = 'all';

let activeEditingExpenseId = null;
let currentTempEvidence = null;

/**
 * Obtener clases CSS enmarcadas para las sub-pestañas
 */
function getSubTabButtonClass(targetTab) {
  const isActive = activeExpensesSubTab === targetTab;
  return isActive 
    ? 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 border-2 border-blue-600 shadow-sm transition flex items-center gap-2 cursor-pointer'
    : 'px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white/90 text-slate-700 border border-slate-300 hover:border-slate-400 hover:bg-white hover:text-slate-900 shadow-2xs transition flex items-center gap-2 cursor-pointer';
}

/**
 * Función principal para renderizar la vista de Compras y Pagos
 */
export function renderExpensesView() {
  const container = document.getElementById('view-compras');
  if (!container) return;

  const advExpensesAllowed = isAdvancedExpensesAllowed();
  if (!advExpensesAllowed && activeExpensesSubTab !== 'bitacora') {
    activeExpensesSubTab = 'bitacora';
  }

  const kpis = getExpensesKpiMetrics();

  container.innerHTML = `
    <div class="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden rounded-xl border border-slate-200/90 shadow-xs">
      
      <!-- Barra Superior de Sub-Navegación (Pestañas Principales del Módulo Hasta Arriba) -->
      <div class="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <!-- Pestañas Internas Enmarcadas de Compras y Pagos -->
        <div class="inline-flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border-2 border-slate-300/90 shadow-xs">
          <button onclick="switchExpensesSubTab('tablero')" id="subtab-btn-tablero" class="${getSubTabButtonClass('tablero')}${!advExpensesAllowed ? ' opacity-75' : ''}" title="${advExpensesAllowed ? 'Dashboard Financiero ERP' : 'Disponible desde Plan Plus'}">
            <i class="fa-solid fa-chart-pie text-xs ${activeExpensesSubTab === 'tablero' ? 'text-blue-600' : 'text-slate-500'}"></i>
            <span>Tablero Resumen (Dashboard)</span>
            ${!advExpensesAllowed ? '<i class="fa-solid fa-lock text-[10px] text-amber-500"></i>' : ''}
          </button>
          <button onclick="switchExpensesSubTab('bitacora')" id="subtab-btn-bitacora" class="${getSubTabButtonClass('bitacora')}">
            <i class="fa-solid fa-receipt text-xs ${activeExpensesSubTab === 'bitacora' ? 'text-blue-600' : 'text-slate-500'}"></i>
            <span>${advExpensesAllowed ? 'Bitácora de Egresos & Órdenes' : 'Control de Gastos Básicos'}</span>
          </button>
          <button onclick="switchExpensesSubTab('comparativa')" id="subtab-btn-comparativa" class="${getSubTabButtonClass('comparativa')}${!advExpensesAllowed ? ' opacity-75' : ''}" title="${advExpensesAllowed ? 'Comparativa Presupuesto Base vs. Real' : 'Disponible desde Plan Plus'}">
            <i class="fa-solid fa-scale-balanced text-xs ${activeExpensesSubTab === 'comparativa' ? 'text-blue-600' : 'text-slate-500'}"></i>
            <span>Presupuesto Base vs. Real</span>
            ${!advExpensesAllowed ? '<i class="fa-solid fa-lock text-[10px] text-amber-500"></i>' : ''}
          </button>
        </div>

        <!-- Widget: Miembros Asignados a Compras y Pagos (Arriba a la Derecha) -->
        <div id="tab-members-compras" class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs shrink-0">
          <span class="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
            <i class="fa-solid fa-users text-blue-600 text-[10px]"></i> Asignados:
          </span>
          <div id="tab-avatars-compras" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('compras')" title="Ver colaboradores con acceso a Compras y Pagos"></div>
          <button type="button" onclick="openTabMembersAssignModal('compras')" class="text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5 transition flex items-center gap-1 cursor-pointer" title="Asignar miembros invitados a la pestaña Compras y Pagos">
            <i class="fa-solid fa-user-gear text-[9px]"></i> Asignar
          </button>
        </div>
      </div>

      <!-- Barra de Acciones y Herramientas (Debajo de las Pestañas) -->
      <div class="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        
        <!-- Botones de Acción (Izquierda) -->
        <div class="flex items-center gap-2 flex-wrap">
          <button onclick="openNewExpenseModal()" class="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-plus text-[11px]"></i>
            <span>Nueva Compra / Gasto</span>
          </button>
          
          <button onclick="openSuppliersListModal()" class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition shadow-2xs flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-truck-field text-[11px] text-indigo-600"></i>
            <span>Proveedores</span>
          </button>

          <button onclick="exportExpensesExcelAction()" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer" title="Exportar a Excel (.xlsx)">
            <i class="fa-solid fa-file-excel text-[11px]"></i>
            <span>Excel</span>
          </button>

          <div class="h-4 w-[1px] bg-slate-300 mx-0.5 hidden sm:block"></div>

          <!-- Botones Agrupar y Desagrupar (Al lado izquierdo del botón Imprimir) -->
          <button onclick="agruparComprasAction()" id="btn-agrupar-compras" type="button" class="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-1.5 rounded-lg flex items-center justify-center font-medium shadow-2xs transition active:scale-95 cursor-pointer shrink-0" title="Agrupar todo (Colapsar tablas / categorías)">
            <i class="fa-solid fa-layer-group text-xs text-amber-600"></i>
          </button>
          <button onclick="desagruparComprasAction()" id="btn-desagrupar-compras" type="button" class="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-1.5 rounded-lg flex items-center justify-center font-medium shadow-2xs transition active:scale-95 cursor-pointer shrink-0" title="Desagrupar todo (Expandir todas las tablas / categorías)">
            <i class="fa-solid fa-arrows-split-up-and-left text-xs text-blue-600"></i>
          </button>

          <!-- Botón Imprimir Reporte -->
          <button onclick="printExpensesActiveReportAction()" id="btn-compras-imprimir" type="button" class="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 hover:border-slate-400 text-slate-800 text-xs font-bold transition shadow-2xs flex items-center gap-1.5 cursor-pointer" title="Imprimir reporte de la vista activa (Tablero, Bitácora o Comparativa)">
            <i class="fa-solid fa-print text-slate-600 text-xs"></i>
            <span>Imprimir</span>
          </button>
        </div>

        <!-- Semáforo Financiero de Estado de Obra (Abajo a la Derecha) -->
        <div class="flex items-center gap-2 text-xs text-slate-600 font-medium bg-white border border-slate-200/90 rounded-lg px-3 py-1 shadow-2xs shrink-0">
          <span class="flex items-center gap-1.5">
            <i class="fa-solid fa-circle text-[9px] text-${kpis.semaforo.color}-500"></i>
            <span class="text-slate-500 text-[11px] font-semibold">Estado de Obra:</span>
            <strong class="font-bold text-${kpis.semaforo.color}-700">${kpis.semaforo.badgeText}</strong>
          </span>
        </div>
      </div>

      <!-- Contenedor Dinámico de Sub-Vistas -->
      <div id="expenses-subview-container" class="flex-1 overflow-y-auto custom-scroll p-4">
        ${renderActiveExpensesSubView(activeExpensesSubTab, kpis)}
      </div>

    </div>
  `;

  // Renderizar avatares de miembros asignados a Compras y Pagos
  if (typeof renderTabAssignedAvatars === 'function') {
    renderTabAssignedAvatars('compras');
  }

  // Montar medidor de cuota unificada S3 en Compras
  const meterId = 'expenses-storage-meter';
  if (!document.getElementById(meterId)) {
    const subviewEl = document.getElementById('expenses-subview-container');
    if (subviewEl && subviewEl.parentElement) {
      const meterHost = document.createElement('div');
      meterHost.id = meterId;
      meterHost.className = 'px-4 pt-2 shrink-0';
      subviewEl.parentElement.insertBefore(meterHost, subviewEl);
    }
  }
  mountStorageMeter(meterId, { compact: true }).catch(() => {});
}

/**
 * Imprimir Reporte de la Sub-Vista Activa de Compras y Pagos
 */
export function printExpensesActiveReportAction() {
  printExpensesActiveReport(activeExpensesSubTab);
}

/**
 * Agrupar todo en Compras y Pagos (Colapsar todas las categorías de comparativa)
 */
export function agruparComprasAction() {
  if (!isAdvancedExpensesAllowed()) {
    switchExpensesSubTab('comparativa');
    return;
  }
  if (activeExpensesSubTab !== 'comparativa') {
    switchExpensesSubTab('comparativa');
  }
  toggleAllComparativaCategories(true);
  showToast('Categorías de compras agrupadas (colapsadas)');
}

/**
 * Desagrupar todo en Compras y Pagos (Expandir todas las categorías de comparativa)
 */
export function desagruparComprasAction() {
  if (!isAdvancedExpensesAllowed()) {
    switchExpensesSubTab('comparativa');
    return;
  }
  if (activeExpensesSubTab !== 'comparativa') {
    switchExpensesSubTab('comparativa');
  }
  toggleAllComparativaCategories(false);
  showToast('Categorías de compras desagrupadas (expandidas)');
}

/**
 * Cambiar entre sub-pestañas internas
 */
export function switchExpensesSubTab(subTab) {
  const validTabs = ['tablero', 'bitacora', 'comparativa'];
  const normalizedTab = validTabs.includes(subTab)
    ? subTab
    : (isAdvancedExpensesAllowed() ? 'tablero' : 'bitacora');
  if ((normalizedTab === 'tablero' || normalizedTab === 'comparativa') && !isAdvancedExpensesAllowed()) {
    showToast('🔒 El Dashboard Financiero ERP y la Comparativa Presupuesto vs. Real están disponibles desde el Plan Plus. Tu Plan Gratuita incluye Control de Gastos básicos.', 'warning');
    if (typeof window !== 'undefined') window.openSubscriptionModal?.();
    return;
  }
  activeExpensesSubTab = normalizedTab;
  const container = document.getElementById('expenses-subview-container');
  if (container) {
    const kpis = getExpensesKpiMetrics();
    container.innerHTML = renderActiveExpensesSubView(activeExpensesSubTab, kpis);
  }
  
  // Actualizar estilos de botones enmarcados
  ['tablero', 'bitacora', 'comparativa'].forEach(t => {
    const btn = document.getElementById(`subtab-btn-${t}`);
    if (btn) {
      btn.className = getSubTabButtonClass(t);
      const icon = btn.querySelector('i');
      if (icon) {
        const iconName = t === 'tablero' ? 'fa-chart-pie' : t === 'bitacora' ? 'fa-receipt' : 'fa-scale-balanced';
        icon.className = `fa-solid ${iconName} text-xs ${t === subTab ? 'text-blue-600' : 'text-slate-500'}`;
      }
    }
  });
}

/**
 * Renderizador de la Sub-Vista Activa
 */
function renderActiveExpensesSubView(subTab, kpis) {
  if (subTab === 'tablero') {
    return renderTableroDashboardView(kpis);
  } else if (subTab === 'bitacora') {
    return renderBitacoraEgresosView();
  } else if (subTab === 'comparativa') {
    return renderComparativaInsumosView();
  }
  return isAdvancedExpensesAllowed() ? renderTableroDashboardView(kpis) : renderBitacoraEgresosView();
}

/**
 * VISTA 1: TABLERO RESUMEN (DASHBOARD FINANCIERO ERP)
 */
function renderTableroDashboardView(kpis) {
  const sem = kpis.semaforo;
  const isHealthy = sem.color === 'emerald';
  const isWarning = sem.color === 'amber';
  const isDanger = sem.color === 'rose';

  const semBg = isHealthy ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : isWarning ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900';
  const semIconColor = isHealthy ? 'text-emerald-600' : isWarning ? 'text-amber-600' : 'text-rose-600';

  return `
    <div class="space-y-4 max-w-7xl mx-auto">
      
      <!-- Fila 1: Tarjetas KPI Superiores -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        <!-- Tarjeta 1: Presupuesto Contratado -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div class="flex items-center justify-between text-slate-500">
            <span class="text-[11px] font-bold uppercase tracking-wider">Presupuesto Obra</span>
            <i class="fa-solid fa-file-contract text-blue-600 text-sm"></i>
          </div>
          <div class="text-lg font-black font-mono text-slate-900 tracking-tight">
            ${formatCurrency(kpis.presupuestoContratado)}
          </div>
          <p class="text-[10px] text-slate-400">Total contratado base</p>
        </div>

        <!-- Tarjeta 2: Total Facturado / Estimado -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div class="flex items-center justify-between text-slate-500">
            <span class="text-[11px] font-bold uppercase tracking-wider">Cobrado / Estimado</span>
            <i class="fa-solid fa-hand-holding-dollar text-emerald-600 text-sm"></i>
          </div>
          <div class="text-lg font-black font-mono text-emerald-700 tracking-tight">
            ${formatCurrency(kpis.totalFacturadoEstimado)}
          </div>
          <p class="text-[10px] text-slate-400">Avance acumulado estimado</p>
        </div>

        <!-- Tarjeta 3: Total Egresos Reales (Pagados) -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div class="flex items-center justify-between text-slate-500">
            <span class="text-[11px] font-bold uppercase tracking-wider">Egresos Pagados</span>
            <i class="fa-solid fa-money-bill-wave text-rose-600 text-sm"></i>
          </div>
          <div class="text-lg font-black font-mono text-rose-700 tracking-tight">
            ${formatCurrency(kpis.totalEgresosReales)}
          </div>
          <p class="text-[10px] text-slate-400">Compras y rayas liquidadas</p>
        </div>

        <!-- Tarjeta 4: Utilidad en Caja Inmediata -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div class="flex items-center justify-between text-slate-500">
            <span class="text-[11px] font-bold uppercase tracking-wider">Utilidad en Caja</span>
            <i class="fa-solid fa-piggy-bank text-indigo-600 text-sm"></i>
          </div>
          <div class="text-lg font-black font-mono ${kpis.utilidadEnCaja >= 0 ? 'text-indigo-700' : 'text-rose-600'} tracking-tight">
            ${formatCurrency(kpis.utilidadEnCaja)}
          </div>
          <p class="text-[10px] text-slate-400">Ingresos Cobrados − Egresos</p>
        </div>

        <!-- Tarjeta 5: Proyección de Utilidad al Cierre -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1">
          <div class="flex items-center justify-between text-slate-500">
            <span class="text-[11px] font-bold uppercase tracking-wider">Utilidad Proyectada</span>
            <i class="fa-solid fa-chart-line text-amber-600 text-sm"></i>
          </div>
          <div class="text-lg font-black font-mono ${kpis.proyeccionUtilidadCierre >= 0 ? 'text-slate-900' : 'text-rose-600'} tracking-tight">
            ${formatCurrency(kpis.proyeccionUtilidadCierre)}
          </div>
          <div class="flex items-center justify-between text-[10px] text-slate-500">
            <span>Margen: <strong class="font-mono ${kpis.margenUtilidadProyectado >= 10 ? 'text-emerald-700' : 'text-amber-700'}">${kpis.margenUtilidadProyectado}%</strong></span>
          </div>
        </div>

      </div>

      <!-- Fila 2: Semáforo Financiero y Desglose de Gastos -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        <!-- Tarjeta Semáforo Financiero -->
        <div class="p-4 rounded-xl border ${semBg} space-y-3 flex flex-col justify-between">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-extrabold uppercase tracking-wider">Semáforo Financiero</span>
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/80 shadow-2xs flex items-center gap-1">
                <i class="fa-solid ${sem.icon} ${semIconColor}"></i>
                <span>${sem.badgeText}</span>
              </span>
            </div>
            <p class="text-xs leading-relaxed opacity-90">${sem.description}</p>
          </div>

          <div class="space-y-1.5 pt-2 border-t border-current/15">
            <div class="flex items-center justify-between text-[11px] font-bold">
              <span>Porcentaje del Presupuesto Ejercido:</span>
              <span class="font-mono text-sm">${sem.pctGastado}%</span>
            </div>
            <div class="w-full bg-white/70 h-3 rounded-full overflow-hidden p-0.5 border border-current/20">
              <div class="h-full rounded-full ${isHealthy ? 'bg-emerald-600' : isWarning ? 'bg-amber-500' : 'bg-rose-600'} transition-all duration-500" style="width: ${Math.min(100, sem.pctGastado)}%"></div>
            </div>
            <div class="flex justify-between text-[9.5px] opacity-75">
              <span>0%</span>
              <span>50%</span>
              <span>100% (Límite Presupuestal)</span>
            </div>
          </div>
        </div>

        <!-- Tarjeta Desglose por Tipo de Egresos -->
        <div class="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Distribución de Gastos por Rubro</h3>
            <span class="text-[11px] text-slate-500 font-mono">Total Comprometido: <strong>${formatCurrency(kpis.totalEgresosComprometidos)}</strong></span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            <!-- Materiales -->
            <div class="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-1">
              <div class="flex items-center justify-between text-blue-700">
                <span class="text-[11px] font-bold">Materiales</span>
                <i class="fa-solid fa-boxes-stacked text-xs"></i>
              </div>
              <div class="text-sm font-bold font-mono text-slate-900">${formatCurrency(kpis.byType.material.total)}</div>
              <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-blue-200/50">
                <span>${kpis.byType.material.count} compras</span>
                <span class="text-emerald-600 font-bold font-mono">Pagado: ${formatCurrency(kpis.byType.material.paid)}</span>
              </div>
            </div>

            <!-- Mano de Obra / Raya -->
            <div class="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-1">
              <div class="flex items-center justify-between text-purple-700">
                <span class="text-[11px] font-bold">Mano de Obra</span>
                <i class="fa-solid fa-users-gear text-xs"></i>
              </div>
              <div class="text-sm font-bold font-mono text-slate-900">${formatCurrency(kpis.byType.labor.total)}</div>
              <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-purple-200/50">
                <span>${kpis.byType.labor.count} nóminas</span>
                <span class="text-emerald-600 font-bold font-mono">Pagado: ${formatCurrency(kpis.byType.labor.paid)}</span>
              </div>
            </div>

            <!-- Equipos y Maquinaria -->
            <div class="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1">
              <div class="flex items-center justify-between text-amber-700">
                <span class="text-[11px] font-bold">Equipos / Fletes</span>
                <i class="fa-solid fa-truck-ramp-box text-xs"></i>
              </div>
              <div class="text-sm font-bold font-mono text-slate-900">${formatCurrency(kpis.byType.equipment.total)}</div>
              <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-amber-200/50">
                <span>${kpis.byType.equipment.count} rentas</span>
                <span class="text-emerald-600 font-bold font-mono">Pagado: ${formatCurrency(kpis.byType.equipment.paid)}</span>
              </div>
            </div>

            <!-- Gastos Indirectos -->
            <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div class="flex items-center justify-between text-slate-700">
                <span class="text-[11px] font-bold">Indirectos</span>
                <i class="fa-solid fa-clipboard-check text-xs"></i>
              </div>
              <div class="text-sm font-bold font-mono text-slate-900">${formatCurrency(kpis.byType.indirect.total)}</div>
              <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200">
                <span>${kpis.byType.indirect.count} gastos</span>
                <span class="text-emerald-600 font-bold font-mono">Pagado: ${formatCurrency(kpis.byType.indirect.paid)}</span>
              </div>
            </div>

          </div>

          <!-- Barra de Estatus de Pagos Pendientes vs Pagados -->
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span class="text-slate-600">Total Liquidado: <strong class="font-mono text-slate-900">${formatCurrency(kpis.totalEgresosReales)}</strong></span>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-amber-500"></span>
                <span class="text-slate-600">Cuentas por Pagar: <strong class="font-mono text-amber-700">${formatCurrency(kpis.totalEgresosPorPagar)}</strong></span>
              </div>
            </div>
            <button onclick="switchExpensesSubTab('bitacora')" class="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1 cursor-pointer">
              <span>Ver bitácora detallada</span>
              <i class="fa-solid fa-arrow-right text-[10px]"></i>
            </button>
          </div>

        </div>

      </div>

    </div>
  `;
}

/**
 * VISTA 2: BITÁCORA DE GASTOS Y ÓRDENES DE COMPRA
 */
function renderBitacoraEgresosView() {
  const records = getExpensesRecords();

  // Contadores por rubro para los botones
  const countByType = {
    all: records.length,
    material: records.filter(r => r.type === 'material').length,
    labor: records.filter(r => r.type === 'labor').length,
    tool: records.filter(r => r.type === 'tool').length,
    equipment: records.filter(r => r.type === 'equipment').length,
    machinery: records.filter(r => r.type === 'machinery').length,
    subcontract: records.filter(r => r.type === 'subcontract').length,
    indirect: records.filter(r => r.type === 'indirect').length
  };

  // Filtrar registros
  const filtered = records.filter(r => {
    // 1. Tipo / Rubro
    if (expensesTypeFilter !== 'all' && r.type !== expensesTypeFilter) {
      return false;
    }
    // 2. Estatus de Pago
    if (expensesStatusFilter !== 'all' && r.paymentStatus !== expensesStatusFilter) {
      return false;
    }
    // 3. Búsqueda de texto libre
    if (expensesSearchTerm) {
      const q = expensesSearchTerm.toLowerCase();
      const sup = r.supplierId ? getSupplierById(r.supplierId) : null;
      const supName = (sup ? sup.name : (r.supplierName || '')).toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const folio = (r.id || '').toLowerCase();
      const fact = (r.invoiceNumber || '').toLowerCase();
      const clave = (r.insumoClave || '').toLowerCase();
      if (!supName.includes(q) && !desc.includes(q) && !folio.includes(q) && !fact.includes(q) && !clave.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const rubroTitleMap = {
    material: 'Materiales de Construcción',
    labor: 'Mano de Obra / Raya y Destajos',
    tool: 'Herramienta Menor y Especializada',
    equipment: 'Equipo y Fletes',
    machinery: 'Maquinaria Pesada y Renta',
    subcontract: 'Subcontratos de Obra',
    indirect: 'Gastos Indirectos y Varios'
  };
  const activeRubroDesc = rubroTitleMap[expensesTypeFilter] ? ` | Filtrado por rubro: ${rubroTitleMap[expensesTypeFilter]}` : ' | Todos los rubros';

  return `
    <div class="space-y-3.5 max-w-7xl mx-auto">
      
      <!-- Título de Sección y Alcance -->
      <div class="flex items-center justify-between text-xs text-slate-700 px-1">
        <div class="flex items-center gap-2">
          <span class="font-extrabold text-slate-800 uppercase tracking-wide">
            ${expensesTypeFilter === 'labor' ? 'Control Semanal de Raya & Destajos' : (expensesStatusFilter === 'paid' ? 'Historial de Egresos & Cuentas Liquidadas' : 'Bitácora de Órdenes de Compra & Historial de Egresos')}
          </span>
          <span class="text-[11px] text-slate-500 font-normal hidden sm:inline">${activeRubroDesc}</span>
        </div>
      </div>

      <!-- Barra de Filtros, Búsqueda y Barra de Rubros -->
      <div class="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
        
        <!-- Fila 1: Búsqueda en Vivo -->
        <div class="relative w-full">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" id="expenses-search-input" value="${expensesSearchTerm}" oninput="onExpensesSearchChange(this.value)" placeholder="Buscar por descripción, folio OC, factura, proveedor..." class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition">
        </div>

        <!-- Fila 2: BARRA DE BOTONES DE FILTRO POR RUBRO Y ESTADO DE PAGO (En la misma fila) -->
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto custom-scroll py-0.5">
          
          <!-- Botonera de Rubros (Izquierda) -->
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-[11px] font-bold text-slate-600 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
              <i class="fa-solid fa-shapes text-blue-600 text-[11px]"></i> Rubro:
            </span>

            <!-- Todos -->
            <button type="button" onclick="onExpensesTypeFilterChange('all')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}">
              <i class="fa-solid fa-layer-group text-[10px]"></i>
              <span>Todos (${countByType.all})</span>
            </button>

            <!-- Materiales -->
            <button type="button" onclick="onExpensesTypeFilterChange('material')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'material' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50/70 hover:bg-blue-100 text-blue-800 border border-blue-200'}">
              <i class="fa-solid fa-box text-[10px]"></i>
              <span>Materiales (${countByType.material})</span>
            </button>

            <!-- Mano de Obra -->
            <button type="button" onclick="onExpensesTypeFilterChange('labor')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'labor' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50/70 hover:bg-amber-100 text-amber-800 border border-amber-200'}">
              <i class="fa-solid fa-user-group text-[10px]"></i>
              <span>Mano de Obra (${countByType.labor})</span>
            </button>

            <!-- Herramienta -->
            <button type="button" onclick="onExpensesTypeFilterChange('tool')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'tool' ? 'bg-orange-600 text-white shadow-xs' : 'bg-orange-50/70 hover:bg-orange-100 text-orange-800 border border-orange-200'}">
              <i class="fa-solid fa-screwdriver-wrench text-[10px]"></i>
              <span>Herramienta (${countByType.tool})</span>
            </button>

            <!-- Equipo -->
            <button type="button" onclick="onExpensesTypeFilterChange('equipment')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'equipment' ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-50/70 hover:bg-purple-100 text-purple-800 border border-purple-200'}">
              <i class="fa-solid fa-truck text-[10px]"></i>
              <span>Equipo (${countByType.equipment})</span>
            </button>

            <!-- Maquinaria -->
            <button type="button" onclick="onExpensesTypeFilterChange('machinery')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'machinery' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50/70 hover:bg-rose-100 text-rose-800 border border-rose-200'}">
              <i class="fa-solid fa-tractor text-[10px]"></i>
              <span>Maquinaria (${countByType.machinery})</span>
            </button>

            <!-- Subcontratos -->
            <button type="button" onclick="onExpensesTypeFilterChange('subcontract')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'subcontract' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'}">
              <i class="fa-solid fa-handshake text-[10px]"></i>
              <span>Subcontratos (${countByType.subcontract})</span>
            </button>

            ${countByType.indirect > 0 ? `
              <!-- Indirectos -->
              <button type="button" onclick="onExpensesTypeFilterChange('indirect')" 
                      class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${expensesTypeFilter === 'indirect' ? 'bg-slate-700 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'}">
                <i class="fa-solid fa-file-invoice text-[10px]"></i>
                <span>Indirectos (${countByType.indirect})</span>
              </button>
            ` : ''}
          </div>

          <!-- Filtro Estatus de Pago & Botón Limpiar (En la misma fila) -->
          <div class="flex items-center gap-1.5 shrink-0">
            <div class="flex items-center gap-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shrink-0">
              <span class="text-slate-600 font-bold">Estado:</span>
              <select id="expenses-filter-status" onchange="onExpensesStatusFilterChange(this.value)" class="bg-transparent border-0 text-[11px] text-slate-700 font-semibold focus:outline-none cursor-pointer">
                <option value="all" ${expensesStatusFilter === 'all' ? 'selected' : ''}>Todos los pagos</option>
                <option value="paid" ${expensesStatusFilter === 'paid' ? 'selected' : ''}>✅ Pagados</option>
                <option value="pending" ${expensesStatusFilter === 'pending' ? 'selected' : ''}>⏳ Por Pagar</option>
                <option value="cancelled" ${expensesStatusFilter === 'cancelled' ? 'selected' : ''}>❌ Cancelados</option>
              </select>
            </div>

            <!-- Botón de Limpiar Filtros -->
            ${(expensesSearchTerm || expensesTypeFilter !== 'all' || expensesStatusFilter !== 'all') ? `
              <button onclick="clearExpensesFilters()" class="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 underline font-semibold cursor-pointer shrink-0">
                Limpiar
              </button>
            ` : ''}
          </div>

        </div>

      </div>

      <!-- Tabla de Registros -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div class="overflow-x-auto custom-scroll">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-900 text-white font-bold border-b border-slate-800 text-[11px]">
                <th class="py-2.5 px-3 w-28">Folio OC</th>
                <th class="py-2.5 px-3 w-24">Fecha</th>
                <th class="py-2.5 px-3 w-28">Rubro</th>
                <th class="py-2.5 px-3 min-w-[200px]">Descripción / Insumo</th>
                <th class="py-2.5 px-3 min-w-[150px]">Proveedor</th>
                <th class="py-2.5 px-3 w-24">Factura</th>
                <th class="py-2.5 px-3 w-20 text-right">Cant.</th>
                <th class="py-2.5 px-3 w-24 text-right">P. Unitario</th>
                <th class="py-2.5 px-3 w-24 text-right">Subtotal</th>
                <th class="py-2.5 px-3 w-28 text-right">Total</th>
                <th class="py-2.5 px-3 w-28 text-center">Estado Pago</th>
                <th class="py-2.5 px-3 w-24 text-center">Comprobante</th>
                <th class="py-2.5 px-3 w-28 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-sans">
              ${filtered.length === 0 ? `
                <tr>
                  <td colspan="13" class="py-8 text-center text-slate-400">
                    <div class="flex flex-col items-center justify-center gap-2">
                      <i class="fa-solid fa-receipt text-3xl text-slate-300"></i>
                      <p class="font-semibold text-slate-500">No hay registros de compras o gastos que coincidan.</p>
                      <button onclick="openNewExpenseModal()" class="mt-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition cursor-pointer">
                        + Registrar primera compra
                      </button>
                    </div>
                  </td>
                </tr>
              ` : filtered.map(r => renderExpenseRowHtml(r)).join('')}
            </tbody>
          </table>
        </div>

        <!-- Barra Inferior de Totales de la Tabla -->
        <div class="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600">
          <div>
            Mostrando <strong>${filtered.length}</strong> de <strong>${records.length}</strong> registros
          </div>
          <div class="flex items-center gap-4 font-mono">
            <span>Suma Subtotal: <strong>${formatCurrency(filtered.reduce((a, b) => a + (b.subtotal || 0), 0))}</strong></span>
            <span>Total Egresos: <strong class="text-slate-900 font-bold">${formatCurrency(filtered.reduce((a, b) => a + (b.total || 0), 0))}</strong></span>
          </div>
        </div>

      </div>

    </div>
  `;
}

/**
 * Renderizar una fila en la Bitácora de Egresos
 */
function renderExpenseRowHtml(r) {
  const sup = r.supplierId ? getSupplierById(r.supplierId) : null;
  const supName = sup ? sup.name : (r.supplierName || 'Varios / Obra');

  const typeConfig = {
    material: { label: 'Material', bg: 'bg-blue-50 text-blue-700 border-blue-200' },
    labor: { label: 'Mano de Obra', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    tool: { label: 'Herramienta', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
    equipment: { label: 'Equipo', bg: 'bg-purple-50 text-purple-700 border-purple-200' },
    machinery: { label: 'Maquinaria', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
    subcontract: { label: 'Subcontrato', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    indirect: { label: 'Indirecto', bg: 'bg-slate-100 text-slate-700 border-slate-300' }
  };
  const tCfg = typeConfig[r.type] || typeConfig.material;

  const isPaid = r.paymentStatus === 'paid';
  const isCancelled = r.paymentStatus === 'cancelled';
  const statusBadge = isCancelled 
    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">Cancelado</span>`
    : isPaid
    ? `<button onclick="toggleExpenseStatusAction('${r.id}')" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition cursor-pointer" title="Clic para cambiar a Por Pagar">✓ Pagado</button>`
    : `<button onclick="toggleExpenseStatusAction('${r.id}')" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition cursor-pointer" title="Clic para marcar como Pagado">⏳ Por Pagar</button>`;

  // Comprobante
  const hasEvidence = Boolean(
    r.evidence?.s3Key ||
    r.evidence?.mediaId ||
    r.evidence?.gdriveWebViewLink ||
    r.evidence?.localDataUrl ||
    r.evidence?.fileName
  );
  const evidenceBtn = hasEvidence
    ? `<button onclick="openEvidenceAction('${r.id}')" class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition flex items-center justify-center gap-1 mx-auto cursor-pointer" title="Ver comprobante adjunto">
        <i class="fa-solid fa-paperclip text-[9px]"></i>
        <span>Ver</span>
       </button>`
    : `<span class="text-[10px] text-slate-300 italic">Sin archivo</span>`;

  return `
    <tr class="hover:bg-blue-50/40 transition">
      <td class="py-2.5 px-3 font-mono font-bold text-blue-700">
        ${r.id}
      </td>
      <td class="py-2.5 px-3 text-slate-600 font-mono">
        ${r.date || '---'}
      </td>
      <td class="py-2.5 px-3">
        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${tCfg.bg}">
          ${tCfg.label}
        </span>
      </td>
      <td class="py-2.5 px-3">
        <div class="font-bold text-slate-900">${r.description || 'Sin descripción'}</div>
        <div class="text-[10px] text-slate-400 flex items-center gap-2">
          ${r.insumoClave ? `<span class="font-mono text-blue-600 font-semibold">${r.insumoClave}</span>` : ''}
          ${r.category ? `<span>• ${r.category}</span>` : ''}
        </div>
      </td>
      <td class="py-2.5 px-3 text-slate-700 font-medium">
        ${supName}
      </td>
      <td class="py-2.5 px-3 font-mono text-slate-600">
        ${r.invoiceNumber || '---'}
      </td>
      <td class="py-2.5 px-3 text-right font-mono">
        <strong>${formatNumber(r.quantity)}</strong> <span class="text-slate-400 text-[10px] font-sans">${r.unit || 'pza'}</span>
      </td>
      <td class="py-2.5 px-3 text-right font-mono text-slate-600">
        ${formatCurrency(r.unitPrice)}
      </td>
      <td class="py-2.5 px-3 text-right font-mono text-slate-700">
        ${formatCurrency(r.subtotal)}
      </td>
      <td class="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
        ${formatCurrency(r.total)}
      </td>
      <td class="py-2.5 px-3 text-center">
        ${statusBadge}
      </td>
      <td class="py-2.5 px-3 text-center">
        ${evidenceBtn}
      </td>
      <td class="py-2.5 px-3 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="printExpensePurchaseOrder('${r.id}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 transition flex items-center justify-center cursor-pointer" title="Generar Orden de Compra PDF">
            <i class="fa-solid fa-print text-[10px]"></i>
          </button>
          <button onclick="openNewExpenseModal('${r.id}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 transition flex items-center justify-center cursor-pointer" title="Editar registro">
            <i class="fa-solid fa-pen-to-square text-[10px]"></i>
          </button>
          <button onclick="deleteExpenseAction('${r.id}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 transition flex items-center justify-center cursor-pointer" title="Eliminar registro">
            <i class="fa-solid fa-trash-can text-[10px]"></i>
          </button>
        </div>
      </td>
    </tr>
  `;
}

let comparativaCollapsedCategories = new Set();

/**
 * Colapsar o expandir un rubro específico en la comparativa
 */
export function toggleComparativaCategoryCollapse(catKey) {
  if (comparativaCollapsedCategories.has(catKey)) {
    comparativaCollapsedCategories.delete(catKey);
  } else {
    comparativaCollapsedCategories.add(catKey);
  }
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'comparativa') {
    container.innerHTML = renderComparativaInsumosView();
  }
}

/**
 * Colapsar o expandir todos los rubros en la comparativa
 */
export function toggleAllComparativaCategories(collapse = false) {
  if (collapse) {
    ['Material', 'Mano de Obra', 'Herramienta', 'Equipo', 'Maquinaria', 'Subcontrato', 'Indirecto'].forEach(k => {
      comparativaCollapsedCategories.add(k);
    });
  } else {
    comparativaCollapsedCategories.clear();
  }
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'comparativa') {
    container.innerHTML = renderComparativaInsumosView();
  }
}

/**
 * VISTA 3: COMPARATIVA PRESUPUESTO BASE VS. REAL POR INSUMO
 * Dividida formalmente en los 6 rubros: Materiales, Mano de Obra, Herramienta, Equipo, Maquinaria y Subcontratos
 */
function renderComparativaInsumosView() {
  const comp = getInsumosBudgetVsActualComparison();
  const res = comp.resumen;
  const term = (comparativaSearchTerm || '').toLowerCase().trim();

  const totalAlertas = comp.items.filter(i => i.alertLevel === 'danger' || i.alertLevel === 'warning').length;
  const totalDanger = comp.items.filter(i => i.alertLevel === 'danger').length;
  const totalWarning = comp.items.filter(i => i.alertLevel === 'warning').length;
  const totalSuccess = comp.items.filter(i => i.alertLevel === 'success').length;
  const totalNeutral = comp.items.filter(i => i.alertLevel === 'neutral' || !i.cantidadComprada).length;

  // Filtrar los insumos por texto dentro de cada categoría
  let categoriesToDisplay = comp.categories.map(cat => {
    let filteredItems = cat.items;

    if (term) {
      filteredItems = filteredItems.filter(i =>
        (i.clave && i.clave.toLowerCase().includes(term)) ||
        (i.descripcion && i.descripcion.toLowerCase().includes(term))
      );
    }

    // Filtrar por Estado / Alertas
    if (comparativaAlertFilter === 'alerts') {
      filteredItems = filteredItems.filter(i => i.alertLevel === 'danger' || i.alertLevel === 'warning');
    } else if (comparativaAlertFilter === 'danger') {
      filteredItems = filteredItems.filter(i => i.alertLevel === 'danger');
    } else if (comparativaAlertFilter === 'warning') {
      filteredItems = filteredItems.filter(i => i.alertLevel === 'warning');
    } else if (comparativaAlertFilter === 'success') {
      filteredItems = filteredItems.filter(i => i.alertLevel === 'success');
    } else if (comparativaAlertFilter === 'neutral') {
      filteredItems = filteredItems.filter(i => i.alertLevel === 'neutral' || !i.cantidadComprada);
    }

    const catPresup = round2(filteredItems.reduce((acc, i) => acc + (i.importePresupuestado || 0), 0));
    const catComp = round2(filteredItems.reduce((acc, i) => acc + (i.importeComprado || 0), 0));
    const catSaldo = round2(catPresup - catComp);
    const catAlertas = filteredItems.filter(i => i.alertLevel === 'danger' || i.alertLevel === 'warning').length;

    return {
      ...cat,
      items: filteredItems,
      filteredPresup: catPresup,
      filteredComp: catComp,
      filteredSaldo: catSaldo,
      filteredAlertas: catAlertas
    };
  });

  // Si hay filtro por rubro específico
  if (comparativaTypeFilter !== 'all') {
    categoriesToDisplay = categoriesToDisplay.filter(c => c.key === comparativaTypeFilter);
  }

  // Si hay búsqueda por texto o filtro de alerta activo, ocultar categorías sin coincidencias
  if (term || comparativaAlertFilter !== 'all') {
    categoriesToDisplay = categoriesToDisplay.filter(c => c.items.length > 0);
  }

  const categoryColorThemes = {
    'Material': { badgeBg: 'bg-blue-600', pillBg: 'bg-blue-600 text-white', text: 'text-blue-700', border: 'border-blue-200' },
    'Mano de Obra': { badgeBg: 'bg-amber-600', pillBg: 'bg-amber-600 text-white', text: 'text-amber-700', border: 'border-amber-200' },
    'Herramienta': { badgeBg: 'bg-orange-600', pillBg: 'bg-orange-600 text-white', text: 'text-orange-700', border: 'border-orange-200' },
    'Equipo': { badgeBg: 'bg-purple-600', pillBg: 'bg-purple-600 text-white', text: 'text-purple-700', border: 'border-purple-200' },
    'Maquinaria': { badgeBg: 'bg-rose-600', pillBg: 'bg-rose-600 text-white', text: 'text-rose-700', border: 'border-rose-200' },
    'Subcontrato': { badgeBg: 'bg-emerald-600', pillBg: 'bg-emerald-600 text-white', text: 'text-emerald-700', border: 'border-emerald-200' },
    'Indirecto': { badgeBg: 'bg-slate-700', pillBg: 'bg-slate-700 text-white', text: 'text-slate-700', border: 'border-slate-200' }
  };

  const getCatCount = (key) => (comp.categories.find(c => c.key === key)?.items || []).length;

  return `
    <div class="space-y-2.5 max-w-7xl mx-auto">
      
      <!-- Título de Sección -->
      <div class="flex flex-wrap items-center justify-between text-xs text-slate-700 px-1 gap-2">
        <div class="flex items-center gap-2">
          <span class="font-extrabold text-slate-900 uppercase tracking-wide">
            Presupuesto Base Directo vs. Compras & Control de Costos
          </span>
          <span class="text-[11px] text-slate-500 font-normal hidden sm:inline">| Cruce con Explosión de Insumos dividida por Rubro</span>
        </div>
      </div>

      <!-- Barra Resumen de Alertas Presupuestales (Versión Compacta) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div class="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
          <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide block leading-tight">Insumos Controlados</span>
          <div class="text-xs sm:text-sm font-bold font-mono text-slate-900 leading-tight">${res.totalInsumos}</div>
          <span class="text-[9px] text-slate-400 block leading-tight">Divididos en los 6 rubros</span>
        </div>

        <div class="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
          <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide block leading-tight">Presupuesto en Insumos</span>
          <div class="text-xs sm:text-sm font-bold font-mono text-blue-700 leading-tight">${formatCurrency(res.totalPresupuestadoInsumos)}</div>
          <span class="text-[9px] text-slate-400 block leading-tight">Costo directo calculado</span>
        </div>

        <div class="bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
          <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide block leading-tight">Total Real Comprado</span>
          <div class="text-xs sm:text-sm font-bold font-mono text-slate-900 leading-tight">${formatCurrency(res.totalCompradoInsumos)}</div>
          <span class="text-[9px] text-slate-400 block leading-tight">${res.conCompras} insumos con compras</span>
        </div>

        <div class="bg-white px-2.5 py-1.5 rounded-lg border ${res.conAlertaSobrepaso > 0 ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200'} shadow-2xs">
          <span class="text-[9px] font-bold ${res.conAlertaSobrepaso > 0 ? 'text-rose-700' : 'text-slate-500'} uppercase tracking-wide block leading-tight">Alertas de Sobrecosto</span>
          <div class="text-xs sm:text-sm font-bold font-mono ${res.conAlertaSobrepaso > 0 ? 'text-rose-700' : 'text-emerald-700'} leading-tight">
            ${res.conAlertaSobrepaso > 0 ? `⚠️ ${res.conAlertaSobrepaso} con sobrecosto` : '✓ En orden'}
          </div>
          <span class="text-[9px] text-slate-400 block leading-tight">Exceso en precio o volumen</span>
        </div>
      </div>

      <!-- Barra de Filtros, Búsqueda y Rubros -->
      <div class="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
        
        <!-- Fila 1: Búsqueda en Vivo a todo lo ancho -->
        <div class="relative w-full">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input type="text" value="${comparativaSearchTerm}" oninput="onComparativaSearchChange(this.value)" placeholder="Buscar insumo por clave o descripción en todos los rubros..." class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition">
        </div>

        <!-- Fila 2: BARRA EN UNA MISMA FILA: BOTONES DE RUBRO + ESTADO Y ALERTAS (Entran todos juntos) -->
        <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 overflow-x-auto custom-scroll py-0.5">
          
          <!-- Botonera de Rubros (Izquierda) -->
          <div class="flex items-center gap-1 shrink-0">
            <span class="text-[11px] font-bold text-slate-600 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
              <i class="fa-solid fa-shapes text-blue-600 text-[11px]"></i> Rubro:
            </span>

            <!-- Todos -->
            <button type="button" onclick="onComparativaTypeFilterChange('all')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${comparativaTypeFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'}">
              <i class="fa-solid fa-layer-group text-[10px]"></i>
              <span>Todos (${comp.items.length})</span>
            </button>

            <!-- Materiales -->
            <button type="button" onclick="onComparativaTypeFilterChange('Material')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${comparativaTypeFilter === 'Material' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50/70 hover:bg-blue-100 text-blue-800 border border-blue-200'}">
              <i class="fa-solid fa-box text-[10px]"></i>
              <span>Materiales (${getCatCount('Material')})</span>
            </button>

            <!-- Mano de Obra -->
            <button type="button" onclick="onComparativaTypeFilterChange('Mano de Obra')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${comparativaTypeFilter === 'Mano de Obra' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50/70 hover:bg-amber-100 text-amber-800 border border-amber-200'}">
              <i class="fa-solid fa-user-group text-[10px]"></i>
              <span>Mano de Obra (${getCatCount('Mano de Obra')})</span>
            </button>

            <!-- Herramienta -->
            <button type="button" onclick="onComparativaTypeFilterChange('Herramienta')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${comparativaTypeFilter === 'Herramienta' ? 'bg-orange-600 text-white shadow-xs' : 'bg-orange-50/70 hover:bg-orange-100 text-orange-800 border border-orange-200'}">
              <i class="fa-solid fa-screwdriver-wrench text-[10px]"></i>
              <span>Herramienta (${getCatCount('Herramienta')})</span>
            </button>

            <!-- Equipo -->
            <button type="button" onclick="onComparativaTypeFilterChange('Equipo')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${comparativaTypeFilter === 'Equipo' ? 'bg-purple-600 text-white shadow-xs' : 'bg-purple-50/70 hover:bg-purple-100 text-purple-800 border border-purple-200'}">
              <i class="fa-solid fa-truck text-[10px]"></i>
              <span>Equipo (${getCatCount('Equipo')})</span>
            </button>

            <!-- Maquinaria -->
            <button type="button" onclick="onComparativaTypeFilterChange('Maquinaria')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${comparativaTypeFilter === 'Maquinaria' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50/70 hover:bg-rose-100 text-rose-800 border border-rose-200'}">
              <i class="fa-solid fa-tractor text-[10px]"></i>
              <span>Maquinaria (${getCatCount('Maquinaria')})</span>
            </button>

            <!-- Subcontratos -->
            <button type="button" onclick="onComparativaTypeFilterChange('Subcontrato')" 
                    class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs ${comparativaTypeFilter === 'Subcontrato' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'}">
              <i class="fa-solid fa-handshake text-[10px]"></i>
              <span>Subcontratos (${getCatCount('Subcontrato')})</span>
            </button>
          </div>

          <!-- Filtro por Estado y Alertas (En la misma fila a la derecha) -->
          <div class="flex items-center gap-1.5 shrink-0">
            <div class="flex items-center gap-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shrink-0">
              <label for="comparativa-alert-filter" class="text-slate-600 font-bold flex items-center gap-1 cursor-pointer shrink-0">
                <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs"></i>
                <span>Estado y Alertas:</span>
              </label>
              <select id="comparativa-alert-filter" onchange="onComparativaAlertFilterChange(this.value)" class="bg-transparent border-0 text-[11px] text-slate-700 font-semibold focus:outline-none cursor-pointer">
                <option value="all" ${comparativaAlertFilter === 'all' ? 'selected' : ''}>Todos los estados (${comp.items.length})</option>
                <option value="alerts" ${comparativaAlertFilter === 'alerts' ? 'selected' : ''}>⚠️ Con Alerta (${totalAlertas})</option>
                <option value="danger" ${comparativaAlertFilter === 'danger' ? 'selected' : ''}>🔴 Sobrecosto (${totalDanger})</option>
                <option value="warning" ${comparativaAlertFilter === 'warning' ? 'selected' : ''}>🟡 Al Límite (${totalWarning})</option>
                <option value="success" ${comparativaAlertFilter === 'success' ? 'selected' : ''}>🟢 En Orden (${totalSuccess})</option>
                <option value="neutral" ${comparativaAlertFilter === 'neutral' ? 'selected' : ''}>⚪ Sin Compras (${totalNeutral})</option>
              </select>
            </div>
          </div>

        </div>
      </div>

      <!-- SECCIONES DIVIDIDAS POR CADA RUBRO -->
      ${categoriesToDisplay.length === 0 ? `
        <div class="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 font-medium">
          No se encontraron insumos para la búsqueda o filtro seleccionado.
        </div>
      ` : categoriesToDisplay.map(cat => {
        const isCollapsed = comparativaCollapsedCategories.has(cat.key);
        const theme = categoryColorThemes[cat.key] || categoryColorThemes.Material;

        return `
          <div class="bg-white rounded-xl border ${theme.border} shadow-2xs overflow-hidden">
            
            <!-- Encabezado del Rubro -->
            <div class="px-4 py-2.5 bg-slate-50 border-b ${theme.border} flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none" onclick="toggleComparativaCategoryCollapse('${cat.key}')">
              <div class="flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-lg ${theme.badgeBg} text-white flex items-center justify-center text-xs shadow-2xs">
                  <i class="fa-solid ${cat.icon}"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-xs font-black uppercase text-slate-900 tracking-wide">${cat.label}</h3>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${cat.badgeBg}">
                      ${cat.items.length} insumos
                    </span>
                    ${cat.filteredAlertas > 0 ? `
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        ⚠️ ${cat.filteredAlertas} sobrecosto
                      </span>
                    ` : ''}
                  </div>
                </div>
              </div>

              <!-- Métricas Resumen del Rubro -->
              <div class="flex items-center gap-3 text-xs">
                <div class="hidden sm:flex items-center gap-4 font-mono text-[11px]">
                  <span>Presupuesto: <strong class="text-blue-700">${formatCurrency(cat.filteredPresup)}</strong></span>
                  <span>Comprado: <strong class="text-slate-900">${formatCurrency(cat.filteredComp)}</strong></span>
                  <span>Saldo: <strong class="${cat.filteredSaldo < 0 ? 'text-rose-600' : 'text-emerald-700'}">${formatCurrency(cat.filteredSaldo)}</strong></span>
                </div>
                <button type="button" class="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition text-xs">
                  <i class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                </button>
              </div>
            </div>

            <!-- Tabla de Insumos del Rubro -->
            <div class="${isCollapsed ? 'hidden' : ''} overflow-x-auto custom-scroll">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="bg-slate-900 text-white font-bold border-b border-slate-800 text-[11px]">
                    <th class="py-2 px-3 w-28">Clave</th>
                    <th class="py-2 px-3 min-w-[220px]">Descripción del Insumo</th>
                    <th class="py-2 px-3 w-16 text-center">Unid.</th>
                    <th class="py-2 px-3 w-24 text-right">Cant. Presup.</th>
                    <th class="py-2 px-3 w-24 text-right">Cant. Comprada</th>
                    <th class="py-2 px-3 w-28 text-right">Saldo Disp.</th>
                    <th class="py-2 px-3 w-24 text-right">P.U. Presup.</th>
                    <th class="py-2 px-3 w-24 text-right">P.U. Real</th>
                    <th class="py-2 px-3 w-24 text-right">Variación P.U.</th>
                    <th class="py-2 px-3 w-28 text-right">Importe Real</th>
                    <th class="py-2 px-3 w-32 text-center">Estado / Alerta</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 font-sans">
                  ${cat.items.length === 0 ? `
                    <tr>
                      <td colspan="11" class="py-6 text-center text-slate-400 italic">
                        No se registran insumos en este rubro ${term ? 'que coincidan con la búsqueda' : 'en el presupuesto actual'}.
                      </td>
                    </tr>
                  ` : cat.items.map(item => renderComparativaRowHtml(item)).join('')}
                </tbody>
                ${cat.items.length > 0 ? `
                  <tfoot>
                    <tr class="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-800">
                      <td colspan="3" class="py-2 px-3 text-right uppercase text-[10px] text-slate-500 font-bold">
                        Subtotal ${cat.shortLabel}:
                      </td>
                      <td class="py-2 px-3 text-right font-mono text-slate-700">${formatNumber(cat.items.reduce((a, b) => a + (b.cantidadPresupuestada || 0), 0))}</td>
                      <td class="py-2 px-3 text-right font-mono text-slate-900">${formatNumber(cat.items.reduce((a, b) => a + (b.cantidadComprada || 0), 0))}</td>
                      <td class="py-2 px-3 text-right font-mono ${cat.filteredSaldo < 0 ? 'text-rose-600' : 'text-emerald-700'}">${formatNumber(cat.items.reduce((a, b) => a + (b.saldoDisponible || 0), 0))}</td>
                      <td colspan="3" class="py-2 px-3 text-right font-mono text-blue-700 text-[11px]">Presup: ${formatCurrency(cat.filteredPresup)}</td>
                      <td class="py-2 px-3 text-right font-mono text-slate-900 font-bold">${formatCurrency(cat.filteredComp)}</td>
                      <td class="py-2 px-3 text-center text-[10px] font-mono ${cat.filteredSaldo < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}">
                        Saldo: ${formatCurrency(cat.filteredSaldo)}
                      </td>
                    </tr>
                  </tfoot>
                ` : ''}
              </table>
            </div>

          </div>
        `;
      }).join('')}

    </div>
  `;
}

/**
 * Renderizar una fila en la tabla de comparativa
 */
function renderComparativaRowHtml(item) {
  const isDanger = item.alertLevel === 'danger';
  const isWarning = item.alertLevel === 'warning';
  const rowClass = isDanger ? 'bg-rose-50/60 hover:bg-rose-50' : isWarning ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50';

  const badgeClass = isDanger
    ? 'bg-rose-100 text-rose-800 border-rose-300'
    : isWarning
    ? 'bg-amber-100 text-amber-800 border-amber-300'
    : item.cantidadComprada > 0
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : 'bg-slate-100 text-slate-600 border-slate-200';

  const variacionColor = item.variacionPrecio > 0 ? 'text-rose-600 font-bold' : item.variacionPrecio < 0 ? 'text-emerald-600 font-bold' : 'text-slate-500';

  return `
    <tr class="${rowClass} transition">
      <td class="py-2 px-3 font-mono font-bold text-blue-700">
        ${item.clave || '---'}
      </td>
      <td class="py-2 px-3 font-medium text-slate-900">
        <div>${item.descripcion || 'Sin descripción'}</div>
        ${item.isExtraordinario ? `<span class="text-[9.5px] font-bold text-rose-600 uppercase">Gasto Extraordinario</span>` : ''}
      </td>
      <td class="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
        ${item.unidad || 'pza'}
      </td>
      <td class="py-2 px-3 text-right font-mono text-slate-700">
        ${formatNumber(item.cantidadPresupuestada)}
      </td>
      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">
        ${formatNumber(item.cantidadComprada)}
      </td>
      <td class="py-2 px-3 text-right font-mono ${item.saldoDisponible < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-semibold'}">
        ${formatNumber(item.saldoDisponible)}
      </td>
      <td class="py-2 px-3 text-right font-mono text-slate-600">
        ${formatCurrency(item.puPresupuestado)}
      </td>
      <td class="py-2 px-3 text-right font-mono font-semibold text-slate-900">
        ${item.cantidadComprada > 0 ? formatCurrency(item.puRealPromedio) : '---'}
      </td>
      <td class="py-2 px-3 text-right font-mono ${variacionColor}">
        ${item.cantidadComprada > 0 ? (item.variacionPrecio > 0 ? `+${formatCurrency(item.variacionPrecio)}` : formatCurrency(item.variacionPrecio)) : '---'}
      </td>
      <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">
        ${formatCurrency(item.importeComprado)}
      </td>
      <td class="py-2 px-3 text-center">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}">
          ${item.alertReason}
        </span>
      </td>
    </tr>
  `;
}

// ==========================================
// CONTROLADORES DE EVENTOS Y FILTROS
// ==========================================

export function onExpensesSearchChange(val) {
  expensesSearchTerm = val;
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'bitacora') {
    container.innerHTML = renderBitacoraEgresosView();
  }
}

export function onExpensesTypeFilterChange(val) {
  expensesTypeFilter = val;
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'bitacora') {
    container.innerHTML = renderBitacoraEgresosView();
  }
}

export function onExpensesStatusFilterChange(val) {
  expensesStatusFilter = val;
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'bitacora') {
    container.innerHTML = renderBitacoraEgresosView();
  }
}

export function clearExpensesFilters() {
  expensesSearchTerm = '';
  expensesTypeFilter = 'all';
  expensesStatusFilter = 'all';
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'bitacora') {
    container.innerHTML = renderBitacoraEgresosView();
  }
}

export function onComparativaSearchChange(val) {
  comparativaSearchTerm = val;
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'comparativa') {
    container.innerHTML = renderComparativaInsumosView();
  }
}

export function onComparativaTypeFilterChange(val) {
  comparativaTypeFilter = val;
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'comparativa') {
    container.innerHTML = renderComparativaInsumosView();
  }
}

export function onComparativaAlertFilterChange(val) {
  comparativaAlertFilter = val;
  const container = document.getElementById('expenses-subview-container');
  if (container && activeExpensesSubTab === 'comparativa') {
    container.innerHTML = renderComparativaInsumosView();
  }
}

export function toggleExpenseStatusAction(recordId) {
  const updated = toggleRecordPaymentStatus(recordId);
  if (updated) {
    showToast(`Estado actualizado: ${updated.paymentStatus === 'paid' ? 'Pagado' : 'Por Pagar'}`, 'info');
    renderExpensesView();
  }
}

export function deleteExpenseAction(recordId) {
  if (confirm(`¿Estás seguro de eliminar el registro de gasto ${recordId}? Esta acción no se puede deshacer.`)) {
    const rec = getExpenseRecordById(recordId);
    if (rec?.evidence) {
      deleteExpenseEvidence(rec.evidence).catch(() => {});
    }
    deleteExpenseRecord(recordId);
    showToast(`Registro ${recordId} eliminado`, 'info');
    renderExpensesView();
  }
}

export function printExpensePurchaseOrder(recordId) {
  const rec = getExpenseRecordById(recordId);
  if (rec) {
    printSingleOrdenCompra(rec);
  } else {
    showToast('Registro de orden no encontrado.', 'warning');
  }
}

export function exportExpensesExcelAction() {
  exportExpensesToExcel();
}

export function openEvidenceAction(recordId) {
  const rec = recordId && recordId !== 'null' ? getExpenseRecordById(recordId) : null;
  const target = rec?.evidence || currentTempEvidence;
  if (target) {
    openExpenseEvidence(target);
  } else {
    showToast('No hay archivo adjunto en este registro.', 'info');
  }
}

// ==========================================
// MODAL 1: NUEVA COMPRA / GASTO
// ==========================================

export function openNewExpenseModal(editId = null) {
  activeEditingExpenseId = editId;
  currentTempEvidence = null;

  const modal = document.getElementById('modal-nueva-compra');
  if (!modal) return;

  const titleEl = document.getElementById('modal-expense-title');
  const existing = editId ? getExpenseRecordById(editId) : null;

  if (titleEl) {
    titleEl.textContent = existing ? `Editar Compra / Gasto (${existing.id})` : 'Nueva Compra / Registro de Gasto';
  }

  // Resetear campo de búsqueda de insumos
  const searchInput = document.getElementById('expense-form-insumo-search');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('expense-form-insumo-search-clear');
  if (clearBtn) clearBtn.classList.add('hidden');

  // Cargar lista de insumos del presupuesto para el autocomplete
  populateInsumosDropdown(existing?.insumoId || '', '');

  // Cargar lista de proveedores
  populateSuppliersDropdown(existing?.supplierId || '');

  // Llenar campos
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('expense-form-date').value = existing?.date || today;
  document.getElementById('expense-form-type').value = existing?.type || 'material';
  document.getElementById('expense-form-category').value = existing?.category || '';
  document.getElementById('expense-form-desc').value = existing?.description || '';
  document.getElementById('expense-form-invoice').value = existing?.invoiceNumber || '';
  document.getElementById('expense-form-quantity').value = existing ? existing.quantity : 1;
  document.getElementById('expense-form-unit').value = existing?.unit || 'pza';
  document.getElementById('expense-form-price').value = existing ? existing.unitPrice : 0;
  document.getElementById('expense-form-subtotal').value = existing ? existing.subtotal : 0;
  document.getElementById('expense-form-tax').value = existing ? existing.tax : 0;
  document.getElementById('expense-form-total').value = existing ? existing.total : 0;
  document.getElementById('expense-form-status').value = existing?.paymentStatus || 'paid';
  document.getElementById('expense-form-method').value = existing?.paymentMethod || 'transfer';
  document.getElementById('expense-form-notes').value = existing?.notes || '';

  // Actualizar tarjeta del lado izquierdo de Cantidad y Unidad de Proyecto
  const insSelect = document.getElementById('expense-form-insumo-select');
  if (insSelect) {
    updateProjectQtyDisplay(insSelect.options[insSelect.selectedIndex]);
  }

  // Evidencia
  currentTempEvidence = existing?.evidence || null;
  updateEvidenceUI();

  calculateExpenseModalTotals();

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeNewExpenseModal(discardTemp = true) {
  if (discardTemp && currentTempEvidence?.__isNewTempUpload) {
    deleteExpenseEvidence(currentTempEvidence).catch(() => {});
  }
  const modal = document.getElementById('modal-nueva-compra');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  activeEditingExpenseId = null;
  currentTempEvidence = null;
}

export function populateInsumosDropdown(selectedKey = '', searchTerm = '') {
  const select = document.getElementById('expense-form-insumo-select');
  if (!select) return;

  const budgetInsumos = getAllBudgetInsumosExplosion();
  const comparison = getInsumosBudgetVsActualComparison();
  const compMap = new Map();
  if (comparison && Array.isArray(comparison.items)) {
    comparison.items.forEach(c => compMap.set(c.key, c));
  }

  const query = (searchTerm || '').trim().toLowerCase();
  const clearBtn = document.getElementById('expense-form-insumo-search-clear');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  let filteredInsumos = budgetInsumos;
  if (query) {
    const cleanQ = normalizeInsumoText(query);
    filteredInsumos = budgetInsumos.filter(ins => {
      const desc = normalizeInsumoText(ins.descripcion || '');
      const cve = normalizeInsumoText(ins.clave || '');
      const tipo = normalizeInsumoText(ins.tipo || '');
      return desc.includes(cleanQ) || cve.includes(cleanQ) || tipo.includes(cleanQ);
    });
  }

  const badgeEl = document.getElementById('expense-form-insumos-count-badge');
  if (badgeEl) {
    if (query) {
      badgeEl.textContent = `${filteredInsumos.length} de ${budgetInsumos.length} insumos encontrados`;
      badgeEl.className = 'text-[10px] font-bold ' + (filteredInsumos.length > 0 ? 'text-blue-700' : 'text-amber-600');
    } else {
      badgeEl.textContent = `Cruce automático vs Presupuesto (${budgetInsumos.length} insumos)`;
      badgeEl.className = 'text-[10px] text-blue-700 font-semibold';
    }
  }

  let html = `<option value="">-- Seleccionar Insumo del Presupuesto (Opcional) --</option>`;
  html += `<option value="EXTRA" ${selectedKey === 'EXTRA' ? 'selected' : ''}>⚠️ Gasto Extraordinario / No Presupuestado</option>`;

  let selectedFound = (selectedKey === '' || selectedKey === 'EXTRA');

  filteredInsumos.forEach(ins => {
    const isSel = (ins.key === selectedKey || ins.clave === selectedKey);
    if (isSel) selectedFound = true;
    const compItem = compMap.get(ins.key);
    const saldo = compItem ? compItem.saldoDisponible : ins.cantidadPresupuestada;

    html += `<option value="${ins.key}" data-clave="${ins.clave}" data-desc="${ins.descripcion}" data-unit="${ins.unidad}" data-cant="${ins.cantidadPresupuestada}" data-saldo="${saldo}" data-pu="${ins.puPresupuestado}" data-tipo="${ins.tipo}" ${isSel ? 'selected' : ''}>
      [${ins.clave}] ${ins.descripcion.slice(0, 52)} | Obra: ${formatNumber(ins.cantidadPresupuestada)} ${ins.unidad} (Disp: ${formatNumber(saldo)}) - $${ins.puPresupuestado}
    </option>`;
  });

  // Si había un insumo seleccionado que no entró en el filtro actual, conservarlo en el selector
  if (!selectedFound && selectedKey) {
    const item = budgetInsumos.find(ins => ins.key === selectedKey || ins.clave === selectedKey);
    if (item) {
      const compItem = compMap.get(item.key);
      const saldo = compItem ? compItem.saldoDisponible : item.cantidadPresupuestada;
      html += `<option value="${item.key}" data-clave="${item.clave}" data-desc="${item.descripcion}" data-unit="${item.unidad}" data-cant="${item.cantidadPresupuestada}" data-saldo="${saldo}" data-pu="${item.puPresupuestado}" data-tipo="${item.tipo}" selected>
        [${item.clave}] ${item.descripcion.slice(0, 52)} | Obra: ${formatNumber(item.cantidadPresupuestada)} ${item.unidad} (Disp: ${formatNumber(saldo)}) - $${item.puPresupuestado}
      </option>`;
    }
  }

  select.innerHTML = html;
}

export function filterInsumosDropdown(searchTerm) {
  const select = document.getElementById('expense-form-insumo-select');
  const currentKey = select ? select.value : '';
  populateInsumosDropdown(currentKey, searchTerm);
}

export function clearInsumoSearch() {
  const searchInput = document.getElementById('expense-form-insumo-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  const select = document.getElementById('expense-form-insumo-select');
  const currentKey = select ? select.value : '';
  populateInsumosDropdown(currentKey, '');
}

export function updateProjectQtyDisplay(opt = null) {
  const qtyEl = document.getElementById('expense-form-project-qty');
  const unitEl = document.getElementById('expense-form-project-unit');
  const saldoEl = document.getElementById('expense-form-project-saldo');
  if (!qtyEl || !unitEl || !saldoEl) return;

  if (!opt || !opt.value) {
    qtyEl.textContent = '---';
    unitEl.textContent = '';
    saldoEl.textContent = 'Sin vincular';
    saldoEl.className = 'text-[9.5px] text-blue-600/90 font-medium truncate';
    return;
  }

  if (opt.value === 'EXTRA') {
    qtyEl.textContent = 'N/A';
    unitEl.textContent = 'EXTRA';
    saldoEl.textContent = '⚠️ Gasto no presupuestado';
    saldoEl.className = 'text-[9.5px] text-amber-700 font-bold truncate';
    return;
  }

  const cant = parseFloat(opt.getAttribute('data-cant')) || 0;
  const unit = opt.getAttribute('data-unit') || 'pza';
  const saldo = parseFloat(opt.getAttribute('data-saldo'));
  const saldoVal = isNaN(saldo) ? cant : saldo;

  qtyEl.textContent = formatNumber(cant);
  unitEl.textContent = unit;

  if (saldoVal <= 0) {
    saldoEl.innerHTML = `<span class="text-rose-600 font-bold">⚠️ Agotado (Disp: ${formatNumber(saldoVal)})</span>`;
  } else {
    saldoEl.innerHTML = `<span class="text-emerald-700 font-semibold">Disponible: <strong>${formatNumber(saldoVal)} ${unit}</strong></span>`;
  }
}

export function copyProjectQtyToInput() {
  const select = document.getElementById('expense-form-insumo-select');
  if (!select) return;
  const opt = select.options[select.selectedIndex];
  if (!opt || !opt.value || opt.value === 'EXTRA') {
    showToast('Selecciona primero un insumo del catálogo para copiar su cantidad.', 'warning');
    return;
  }

  const saldo = parseFloat(opt.getAttribute('data-saldo'));
  const cant = parseFloat(opt.getAttribute('data-cant')) || 1;
  const qtyToUse = (!isNaN(saldo) && saldo > 0) ? saldo : cant;

  const qtyInput = document.getElementById('expense-form-quantity');
  if (qtyInput) {
    qtyInput.value = qtyToUse;
    calculateExpenseModalTotals();
    showToast(`Cantidad presupuestada aplicada: ${formatNumber(qtyToUse)}`, 'info');
  }
}

export function onExpenseInsumoSelectChange(selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  updateProjectQtyDisplay(opt);

  if (!opt || !opt.value) return;

  if (opt.value === 'EXTRA') {
    document.getElementById('expense-form-category').value = 'Extraordinarios / Imprevistos';
    return;
  }

  const clave = opt.getAttribute('data-clave') || '';
  const desc = opt.getAttribute('data-desc') || '';
  const unit = opt.getAttribute('data-unit') || 'pza';
  const pu = parseFloat(opt.getAttribute('data-pu')) || 0;
  const tipo = opt.getAttribute('data-tipo') || 'Material';
  const cant = parseFloat(opt.getAttribute('data-cant')) || 0;
  const saldo = parseFloat(opt.getAttribute('data-saldo'));

  const descInput = document.getElementById('expense-form-desc');
  if (!descInput.value || descInput.value.length < 5) {
    descInput.value = desc;
  }

  document.getElementById('expense-form-unit').value = unit;
  
  const priceInput = document.getElementById('expense-form-price');
  if (parseFloat(priceInput.value) === 0 && pu > 0) {
    priceInput.value = pu;
  }

  // Si la cantidad actual es 1 o 0 (valor default), sugerir la cantidad del presupuesto
  const qtyInput = document.getElementById('expense-form-quantity');
  if (qtyInput && (parseFloat(qtyInput.value) === 1 || parseFloat(qtyInput.value) === 0)) {
    const suggestedQty = (!isNaN(saldo) && saldo > 0) ? saldo : cant;
    if (suggestedQty > 0) {
      qtyInput.value = suggestedQty;
    }
  }

  const typeMap = {
    'Material': 'material',
    'Mano de Obra': 'labor',
    'Herramienta': 'tool',
    'Equipo': 'equipment',
    'Maquinaria': 'machinery',
    'Subcontrato': 'subcontract'
  };
  if (typeMap[tipo]) {
    document.getElementById('expense-form-type').value = typeMap[tipo];
  }

  calculateExpenseModalTotals();
}

function populateSuppliersDropdown(selectedId = '') {
  const select = document.getElementById('expense-form-supplier-select');
  if (!select) return;

  const suppliers = getExpensesSuppliers();
  let html = `<option value="">-- Seleccionar Proveedor --</option>`;
  
  suppliers.forEach(s => {
    html += `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>
      ${s.name} ${s.rfc ? `(${s.rfc})` : ''}
    </option>`;
  });

  select.innerHTML = html;
}

export function calculateExpenseModalTotals() {
  const qty = Math.max(0, parseFloat(document.getElementById('expense-form-quantity')?.value) || 0);
  const price = Math.max(0, parseFloat(document.getElementById('expense-form-price')?.value) || 0);
  
  const subtotal = Math.round(((qty * price) + Number.EPSILON) * 100) / 100;
  const applyTax = document.getElementById('expense-form-apply-tax')?.checked !== false;
  
  const tax = applyTax ? Math.round(((subtotal * 0.16) + Number.EPSILON) * 100) / 100 : 0;
  const total = Math.round(((subtotal + tax) + Number.EPSILON) * 100) / 100;

  const subInput = document.getElementById('expense-form-subtotal');
  const taxInput = document.getElementById('expense-form-tax');
  const totInput = document.getElementById('expense-form-total');

  if (subInput) subInput.value = subtotal;
  if (taxInput) taxInput.value = tax;
  if (totInput) totInput.value = total;
}

export async function onEvidenceFileInputChange(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;

  try {
    const projectName = state.settings?.projectName || 'Obra';
    const prevTemp = currentTempEvidence;
    const uploaded = await processExpenseEvidenceUpload(file, projectName, activeEditingExpenseId || '');
    if (prevTemp?.__isNewTempUpload) {
      deleteExpenseEvidence(prevTemp).catch(() => {});
    }
    uploaded.__isNewTempUpload = true;
    currentTempEvidence = uploaded;
    updateEvidenceUI();
    const syncTag = uploaded.cloudSynced ? 'respaldado en AWS S3' : 'guardado en caché local';
    const optTag = uploaded.compressed ? ` (${uploaded.summaryText})` : ` (${uploaded.sizeLabel || ''})`;
    showToast(`Comprobante "${uploaded.fileName}" ${syncTag}${optTag}.`, 'success');
  } catch (err) {
    showToast(`Error con comprobante: ${err.message}`, 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

export function removeTempEvidence() {
  if (currentTempEvidence?.__isNewTempUpload) {
    deleteExpenseEvidence(currentTempEvidence).catch(() => {});
  }
  currentTempEvidence = null;
  const fileInput = document.getElementById('expense-form-evidence-file');
  if (fileInput) fileInput.value = '';
  updateEvidenceUI();
}

function updateEvidenceUI() {
  const container = document.getElementById('expense-evidence-preview-zone');
  if (!container) return;

  if (currentTempEvidence && (currentTempEvidence.fileName || currentTempEvidence.s3Key || currentTempEvidence.mediaId || currentTempEvidence.localDataUrl)) {
    const hasCloud = Boolean(currentTempEvidence.cloudSynced || currentTempEvidence.s3Key);
    const metaLabel = [
      hasCloud ? '☁️ Respaldado en AWS S3' : '💾 Guardado en caché local',
      currentTempEvidence.sizeLabel || ''
    ].filter(Boolean).join(' · ');

    container.innerHTML = `
      <div class="flex items-center justify-between p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
        <div class="flex items-center gap-2 truncate">
          <i class="fa-solid fa-file-invoice text-indigo-600 text-base shrink-0"></i>
          <div class="truncate">
            <span class="font-bold text-slate-800 block truncate">${currentTempEvidence.fileName || 'Comprobante adjunto'}</span>
            <span class="text-[10px] text-slate-500">${metaLabel}</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="openEvidenceAction('${activeEditingExpenseId}')" class="px-2 py-1 rounded bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 font-bold text-[10px] transition cursor-pointer">
            Ver
          </button>
          <button type="button" onclick="removeTempEvidence()" class="px-2 py-1 rounded bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-bold text-[10px] transition cursor-pointer">
            Quitar
          </button>
        </div>
      </div>
    `;
  } else {
    const hostCtx = resolveHostStorageContext();
    const maxMb = hostCtx?.spec?.maxFileMb || 5;
    container.innerHTML = `
      <div class="border-2 border-dashed border-slate-300 rounded-lg p-3 text-center hover:bg-slate-50 transition cursor-pointer" onclick="document.getElementById('expense-form-evidence-file').click()">
        <i class="fa-solid fa-cloud-arrow-up text-slate-400 text-lg mb-1"></i>
        <p class="text-[11px] font-semibold text-slate-600">Arrastra factura / nota de remisión o haz clic para subir</p>
        <p class="text-[9.5px] text-slate-400">Formatos: PDF, XML, JPG, JPEG, PNG, WEBP · Máx. ${maxMb} MB (${hostCtx?.spec?.label || 'Plan'}) · Compresión automática</p>
      </div>
    `;
  }
}

export function saveExpenseModalForm() {
  const desc = document.getElementById('expense-form-desc')?.value.trim();
  if (!desc) {
    showToast('Ingresa una descripción para la compra o gasto.', 'warning');
    document.getElementById('expense-form-desc')?.focus();
    return;
  }

  const insumoSelect = document.getElementById('expense-form-insumo-select');
  const selectedOpt = insumoSelect?.options[insumoSelect.selectedIndex];
  const insumoId = insumoSelect?.value || '';
  const insumoClave = selectedOpt?.getAttribute('data-clave') || (insumoId === 'EXTRA' ? 'EXTRA' : '');

  const supplierSelect = document.getElementById('expense-form-supplier-select');
  const supplierId = supplierSelect?.value || '';
  const supplierObj = supplierId ? getSupplierById(supplierId) : null;

  const recordData = {
    id: activeEditingExpenseId || undefined,
    date: document.getElementById('expense-form-date')?.value || new Date().toISOString().slice(0, 10),
    type: document.getElementById('expense-form-type')?.value || 'material',
    category: document.getElementById('expense-form-category')?.value.trim() || 'General',
    insumoId: insumoId,
    insumoClave: insumoClave,
    description: desc,
    supplierId: supplierId,
    supplierName: supplierObj ? supplierObj.name : 'Varios',
    invoiceNumber: document.getElementById('expense-form-invoice')?.value.trim() || '',
    quantity: parseFloat(document.getElementById('expense-form-quantity')?.value) || 1,
    unit: document.getElementById('expense-form-unit')?.value.trim() || 'pza',
    unitPrice: parseFloat(document.getElementById('expense-form-price')?.value) || 0,
    subtotal: parseFloat(document.getElementById('expense-form-subtotal')?.value) || 0,
    tax: parseFloat(document.getElementById('expense-form-tax')?.value) || 0,
    total: parseFloat(document.getElementById('expense-form-total')?.value) || 0,
    paymentStatus: document.getElementById('expense-form-status')?.value || 'paid',
    paymentMethod: document.getElementById('expense-form-method')?.value || 'transfer',
    notes: document.getElementById('expense-form-notes')?.value.trim() || '',
    evidence: currentTempEvidence
      ? (({ __isNewTempUpload, ...clean }) => clean)(currentTempEvidence)
      : null
  };

  const saved = saveExpenseRecord(recordData);
  showToast(`¡Registro ${saved.id} guardado exitosamente!`, 'success');
  closeNewExpenseModal(false);
  renderExpensesView();
}

// ==========================================
// MODAL 2: GESTIÓN DE PROVEEDORES
// ==========================================

export function openSuppliersListModal() {
  const modal = document.getElementById('modal-lista-proveedores');
  if (!modal) return;

  renderSuppliersListTable();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeSuppliersListModal() {
  const modal = document.getElementById('modal-lista-proveedores');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function renderSuppliersListTable() {
  const container = document.getElementById('suppliers-table-body');
  if (!container) return;

  const suppliers = getExpensesSuppliers();
  if (suppliers.length === 0) {
    container.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No hay proveedores registrados aún.</td></tr>`;
    return;
  }

  container.innerHTML = suppliers.map(s => `
    <tr class="hover:bg-slate-50 transition border-b border-slate-100">
      <td class="p-2.5 font-bold text-slate-900">${s.name}</td>
      <td class="p-2.5 font-mono text-slate-600">${s.rfc || '---'}</td>
      <td class="p-2.5 font-mono text-slate-600">${s.phone || '---'}</td>
      <td class="p-2.5 text-slate-600">${s.email || '---'}</td>
      <td class="p-2.5 text-slate-600">${s.contactPerson || '---'}</td>
      <td class="p-2.5 text-center">
        <div class="flex items-center justify-center gap-1">
          <button onclick="openSupplierModal('${s.id}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 transition flex items-center justify-center cursor-pointer" title="Editar">
            <i class="fa-solid fa-pen text-[10px]"></i>
          </button>
          <button onclick="deleteSupplierAction('${s.id}')" class="w-6 h-6 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 transition flex items-center justify-center cursor-pointer" title="Eliminar">
            <i class="fa-solid fa-trash text-[10px]"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

let activeEditingSupplierId = null;

export function openSupplierModal(editId = null) {
  activeEditingSupplierId = editId;
  const modal = document.getElementById('modal-nuevo-proveedor');
  if (!modal) return;

  const sup = editId ? getSupplierById(editId) : null;
  document.getElementById('supplier-form-title').textContent = sup ? 'Editar Proveedor' : 'Nuevo Proveedor';
  document.getElementById('supplier-form-name').value = sup ? sup.name : '';
  document.getElementById('supplier-form-rfc').value = sup ? sup.rfc : '';
  document.getElementById('supplier-form-phone').value = sup ? sup.phone : '';
  document.getElementById('supplier-form-email').value = sup ? sup.email : '';
  document.getElementById('supplier-form-contact').value = sup ? sup.contactPerson : '';
  document.getElementById('supplier-form-address').value = sup ? sup.address : '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeSupplierModal() {
  const modal = document.getElementById('modal-nuevo-proveedor');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  activeEditingSupplierId = null;
}

export function saveSupplierModalForm() {
  const name = document.getElementById('supplier-form-name')?.value.trim();
  if (!name) {
    showToast('Ingresa la razón social o nombre del proveedor.', 'warning');
    document.getElementById('supplier-form-name')?.focus();
    return;
  }

  const supplierData = {
    id: activeEditingSupplierId || undefined,
    name: name,
    rfc: document.getElementById('supplier-form-rfc')?.value.trim() || '',
    phone: document.getElementById('supplier-form-phone')?.value.trim() || '',
    email: document.getElementById('supplier-form-email')?.value.trim() || '',
    contactPerson: document.getElementById('supplier-form-contact')?.value.trim() || '',
    address: document.getElementById('supplier-form-address')?.value.trim() || ''
  };

  const saved = saveSupplier(supplierData);
  showToast(`Proveedor "${saved.name}" guardado exitosamente.`, 'success');
  closeSupplierModal();
  renderSuppliersListTable();
  populateSuppliersDropdown(saved.id);
}

export function deleteSupplierAction(supplierId) {
  const sup = getSupplierById(supplierId);
  if (confirm(`¿Deseas eliminar al proveedor "${sup?.name || supplierId}"?`)) {
    deleteSupplier(supplierId);
    showToast('Proveedor eliminado.', 'info');
    renderSuppliersListTable();
  }
}
