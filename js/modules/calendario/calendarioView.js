import { printCalendarioObraFormat } from '../io/printService.js';
import { renderTabAssignedAvatars } from '../portal/portalController.js';
import { resolveWorkspacePlanContext } from '../portal/projectService.js';
// js/modules/calendario/calendarioView.js
// Renderizador y controlador de la pestaña CALENDARIO DE OBRA
// Diseño ejecutivo de alta fidelidad, interactivo y sincronizado 100% con Catálogo Base

import { state } from '../../state/store.js';
import { formatCurrency, formatNumber } from '../../core/formatters.js';
import { showToast } from '../../ui/notifications.js';
import { isNightMode } from '../../ui/themeController.js';
import { isTabLocked, guardTabUnlocked, applyTabLocksToDOM } from '../../ui/tabLockController.js';
import { renderPartidaNivel1ChatButton, renderProjectChatDock } from '../chat/projectChat.js';
import {
  extractScheduleItems,
  ensureInitialDates,
  generateTimePeriods,
  calculateScheduleDistribution,
  getScheduleSettings,
  saveScheduleSettings,
  updateConceptDatesInModel,
  updateConceptPeriodInModel,
  autoDistributeAllSchedule,
  diffDays,
  addDays,
  formatDate,
  parseDate,
  generateGanttDays,
  generateGanttTimeScale,
  getGanttTodayDate,
  setGanttTodayDate,
  resetGanttTodayDate,
  isItemVisible,
  toggleCalendarioNodeExpand,
  expandAllCalendarioNodes,
  collapseAllCalendarioNodes,
  getWorkdaysSettings,
  saveWorkdaysSettings,
  getDateWorkdayInfo,
  calculateWorkdaysSummary,
  getMexicanHolidaysForYear,
  wouldCreateScheduleCycle,
  setConceptPredecessorsInModel,
  toggleConceptPredecessorInModel,
  clearAllScheduleDependenciesInModel,
  applyScheduleProposalToModel,
  shiftProjectScheduleStart,
  saveScheduleUndoSnapshot,
  hasScheduleUndoSnapshot,
  hasScheduleRedoSnapshot,
  undoLastScheduleChange,
  redoLastScheduleChange
} from './calendarioModel.js';
import {
  WORK_TYPE_PROFILES,
  detectProjectWorkType,
  generateLocalConstructiveProposal,
  generateGeminiConstructiveProposal
} from './calendarioAiService.js';
import { exportScheduleToExcel } from './calendarioExporter.js';

let currentScheduleData = null;
let calendarioLinkClickMode = false;
let pendingLinkPredecessorId = null;
let currentAiProposalPreview = null;
let currentDepModalConceptId = null;
let calendarioInitTimer = null;
let isPremiereResizeListenerAttached = false;
let selectedCalendarioRowId = null;

// Seleccionar y pintar fila en Calendario de Obra (Vista Gantt, Programa Financiero y Curva S) igual que en Catálogo Base
export function selectCalendarioRow(rowId, event = null) {
  selectedCalendarioRowId = String(rowId);
  if (typeof document === 'undefined') return;

  // Vista Gantt (panel izquierdo y derecho sincronizados)
  document.querySelectorAll('#view-calendario [data-gantt-left-row]').forEach((el) => {
    if (String(el.getAttribute('data-gantt-left-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });
  document.querySelectorAll('#view-calendario [data-gantt-right-row]').forEach((el) => {
    if (String(el.getAttribute('data-gantt-right-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });

  // Vista Programa Financiero
  document.querySelectorAll('#view-calendario tr[data-fin-row]').forEach((el) => {
    if (String(el.getAttribute('data-fin-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });

  // Vista Curva S (Tabla Resumen Ejecutivo)
  document.querySelectorAll('#view-calendario tr[data-curva-row]').forEach((el) => {
    if (String(el.getAttribute('data-curva-row')) === selectedCalendarioRowId) {
      el.classList.add('selected-row');
    } else {
      el.classList.remove('selected-row');
    }
  });

  // Actualizar indicador de fila seleccionada en el pie/status si existe
  const statusSpan = document.getElementById('selected-row-status');
  if (statusSpan && currentScheduleData && currentScheduleData.items) {
    const foundItem = currentScheduleData.items.find(i => String(i.id) === selectedCalendarioRowId);
    if (foundItem) {
      statusSpan.textContent = `Fila seleccionada: ${foundItem.clave || 'PART'} - ${foundItem.descripcion}`;
    }
  }
}
if (typeof window !== 'undefined') {
  window.selectCalendarioRow = selectCalendarioRow;
}

// ==========================================
// RENDERIZADO PRINCIPAL DEL CALENDARIO
// ==========================================
export function renderCalendarioObra() {
  const container = document.getElementById('view-calendario');
  if (!container) return;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);

  // Asegurar fechas iniciales
  ensureInitialDates(rawItems, cfg.startDate);

  // Generar períodos según escala seleccionada (días, semanas, meses)
  const periods = generateTimePeriods(rawItems, cfg.scale, cfg.startDate);

  // Calcular distribución y totales
  const scheduleData = calculateScheduleDistribution(rawItems, periods);
  currentScheduleData = scheduleData;

  // Filtrar partidas si hay un filtro de dropdown activo
  let filteredItems = scheduleData.items;
  if (cfg.selectedPartida && cfg.selectedPartida !== 'all') {
    filteredItems = filteredItems.filter(item => {
      if (item.level === 1) return item.descripcion === cfg.selectedPartida;
      return item.parentPartidaName === cfg.selectedPartida;
    });
  }

  // Filtrar según el estado agrupado/desagrupado (visibleItems)
  const visibleItems = filteredItems.filter(item => isItemVisible(item, scheduleData.items));

  // Métricas generales
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });

  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const totalDias = Math.max(1, diffDays(minDate, maxDate) + 1);
  const workdaysSummary = calculateWorkdaysSummary(minDate, maxDate);
  const currencySymbol = state.settings.currencySymbol || '$';
  const dayWidthPx = cfg.dayWidth || 34;

  // Partidas principales de nivel 1 para el dropdown de filtro
  const partidasList = scheduleData.items.filter(it => it.level === 1 && it.isParent);
  const allConcepts = scheduleData.items.filter(it => it.tipo === 'concepto');
  const criticalConceptsCount = allConcepts.filter(it => it.isCritical).length;
  const advCalAllowed = isAdvancedCalendarioAllowed();
  const effectiveViewMode = advCalAllowed ? cfg.viewMode : 'gantt';
  const showCpm = advCalAllowed && (cfg.showCriticalPath !== false);
  const canUndo = hasScheduleUndoSnapshot();
  const canRedo = hasScheduleRedoSnapshot();
  const pendingPredConcept = pendingLinkPredecessorId
    ? allConcepts.find(it => String(it.id) === String(pendingLinkPredecessorId))
    : null;
  const isCalLocked = isTabLocked('calendario');
  const isJustifyConcepts = Boolean(cfg.justifyConcepts);
  applyTabLocksToDOM();

  container.innerHTML = `
    <div id="calendario-container" class="flex-1 bg-white border border-slate-200 rounded-lg shadow flex flex-col h-full overflow-hidden text-slate-800 transition-all duration-300">
      
      <!-- 1. BARRA DE HERRAMIENTAS Y CONTROL INTEGRADA -->
      <div class="p-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 overflow-x-auto custom-scroll w-full flex-nowrap select-none">

        <!-- Lado Izquierdo: Diagrama Gantt, Programa Financiero, Curva "S" y Flujo -->
        <div class="flex items-center gap-1.5 shrink-0 flex-nowrap">
          <!-- 1, 2, 3. Selector de Modo de Vista: Diagrama Gantt, Programa Financiero, Curva "S" y Flujo -->
          <div class="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-300 shadow-2xs shrink-0">
            <button type="button" onclick="setCalendarioViewMode('gantt')" class="px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${effectiveViewMode === 'gantt' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
              <i class="fa-solid fa-chart-gantt ${cfg.viewMode === 'gantt' ? 'text-white' : 'text-blue-600'}"></i> <span>Diagrama Gantt</span>
            </button>
            <button type="button" onclick="setCalendarioViewMode('financiero')" class="px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${effectiveViewMode === 'financiero' ? 'bg-blue-600 text-white shadow-xs' : (!advCalAllowed ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')}" title="${advCalAllowed ? 'Programa Financiero de Obra' : 'Disponible desde Plan Plus'}">
              <i class="fa-solid fa-table-columns ${cfg.viewMode === 'financiero' ? 'text-white' : 'text-blue-600'}"></i> <span>Programa Financiero</span>
            </button>
            <button type="button" onclick="setCalendarioViewMode('curva_s')" class="px-2.5 py-1 rounded text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${effectiveViewMode === 'curva_s' ? 'bg-blue-600 text-white shadow-xs' : (!advCalAllowed ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')}" title="${advCalAllowed ? 'Curva S de Inversión Acumulada' : 'Disponible desde Plan Plus'}">
              <i class="fa-solid fa-chart-line ${cfg.viewMode === 'curva_s' ? 'text-white' : 'text-blue-600'}"></i> <span>Curva "S" y Flujo</span>
            </button>
          </div>
        </div>

        <!-- Lado Derecho: Todos los botones desde "Todas las partidas" hasta "Asignados" pegados a la derecha -->
        <div id="calendario-right-toolbar-group" class="ml-auto flex items-center gap-1.5 shrink-0 flex-nowrap justify-end">

          <!-- 4. Todas las partidas (Filtro de Partidas) -->
          <select id="calendario-partida-select" onchange="filterCalendarioPartida(this.value)" class="bg-white border border-slate-300 text-slate-700 text-[11px] font-medium rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer max-w-[155px] truncate shadow-sm shrink-0">
            <option value="all">Todas las partidas (${partidasList.length})</option>
            ${partidasList.map(p => `
              <option value="${p.descripcion}" ${cfg.selectedPartida === p.descripcion ? 'selected' : ''}>${p.descripcion}</option>
            `).join('')}
          </select>

          <!-- 5. "%" Auto-Programar -->
          <button type="button" onclick="triggerAutoDistributeSchedule()" id="btn-calendario-auto-pct" ${isCalLocked ? 'disabled' : ''} class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0" title="${isCalLocked ? 'Calendario bloqueado (Solo consulta e impresión)' : 'Auto-Programar conceptos secuencialmente (%)'}">
            <i class="fa-solid fa-percent text-xs text-amber-600"></i>
          </button>

          <!-- 6. Solo icono Deshacer -->
          <button type="button" onclick="undoCalendarioScheduleAction()" id="btn-calendario-undo" ${(!canUndo || isCalLocked) ? 'disabled' : ''}
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white shrink-0"
                  title="Deshacer último cambio en Calendario de Obra (Ctrl+Z)">
            <i class="fa-solid fa-rotate-left text-xs"></i>
          </button>

          <!-- 7. Solo icono Rehacer -->
          <button type="button" onclick="redoCalendarioScheduleAction()" id="btn-calendario-redo" ${(!canRedo || isCalLocked) ? 'disabled' : ''}
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white shrink-0"
                  title="Rehacer cambio en Calendario de Obra (Ctrl+Y)">
            <i class="fa-solid fa-rotate-right text-xs"></i>
          </button>

          <!-- Botón Justificar Textos de la columna Conceptos de Obra (Al lado izquierdo del candado) -->
          <button type="button" onclick="toggleCalendarioJustifyText()" id="btn-calendario-justify"
                  class="${isJustifyConcepts ? 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-700 font-bold' : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium'} text-[11px] p-1.5 rounded flex items-center justify-center shadow-sm transition active:scale-95 cursor-pointer shrink-0"
                  title="${isJustifyConcepts ? 'Justificar textos activo en Conceptos de Obra — Haz clic para contraer a 1 línea' : 'Justificar textos de la columna Conceptos de Obra'}">
            <i class="fa-solid fa-align-justify ${isJustifyConcepts ? 'text-white' : 'text-slate-600'} text-xs"></i>
          </button>

          <!-- Botón Candado de Bloqueo (Al lado izquierdo de Agrupar) -->
          <button type="button" onclick="toggleTabLock('calendario')" id="btn-lock-calendario"
                  class="${isCalLocked ? 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-700 font-bold' : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 font-medium'} text-[11px] p-1.5 rounded flex items-center justify-center shadow-sm transition active:scale-95 cursor-pointer shrink-0"
                  title="${isCalLocked ? '🔒 Calendario de Obra bloqueado (Solo consulta e impresión) — Haz clic para desbloquear' : 'Bloquear Calendario de Obra (Permitir solo consulta e impresión)'}">
            <i class="fa-solid ${isCalLocked ? 'fa-lock text-white' : 'fa-lock-open text-slate-600'} text-xs"></i>
          </button>

          <!-- 8. Agrupar -->
          <button type="button" onclick="collapseAllCalendarioGroups()" id="btn-agrupar-calendario" 
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer shrink-0" 
                  title="Agrupar Todo (Colapsar partidas)">
            <i class="fa-solid fa-layer-group text-xs text-amber-600"></i>
          </button>

          <!-- 9. Desagrupar -->
          <button type="button" onclick="expandAllCalendarioGroups()" id="btn-desagrupar-calendario" 
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] p-1.5 rounded flex items-center justify-center font-medium shadow-sm transition active:scale-95 cursor-pointer shrink-0" 
                  title="Desagrupar Todo (Mostrar todos los conceptos)">
            <i class="fa-solid fa-arrows-split-up-and-left text-xs text-blue-600"></i>
          </button>

          <!-- 10. Imprimir -->
          <button type="button" onclick="printCalendarioObra()" id="btn-calendario-print" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] px-2.5 py-1 rounded flex items-center gap-1 font-medium shadow-sm transition active:scale-95 cursor-pointer shrink-0" title="Imprimir programa de obra">
            <i class="fa-solid fa-print text-[10px]"></i> <span>Imprimir</span>
          </button>

          <!-- 11. IA (Secuencia por Proceso Constructivo) -->
          <button type="button" onclick="openCalendarioAiModal()" id="btn-calendario-ia" ${isCalLocked ? 'disabled' : ''}
                  class="bg-violet-600 hover:bg-violet-500 text-white border border-violet-700 text-[11px] px-2 py-1 rounded flex items-center gap-1 font-bold shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  title="${isCalLocked ? 'Calendario bloqueado (Solo consulta e impresión)' : 'Generar propuesta con IA tomando en cuenta el Proceso Constructivo de cada Tipo de Obra'}">
            <i class="fa-solid fa-wand-magic-sparkles text-[11px] text-amber-200"></i>
            <span>IA</span>
          </button>

          <!-- 12. Días Inhábiles (Jornada Laboral, Festivos, Lluvias) -->
          <button type="button" onclick="openCalendarioJornadaModal()" id="btn-calendario-jornada" ${isCalLocked ? 'disabled' : ''}
                  class="bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-[11px] px-2 py-1 rounded flex items-center gap-1 font-medium shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0" 
                  title="${isCalLocked ? 'Calendario bloqueado (Solo consulta e impresión)' : 'Configurar Jornada Laboral, Días Inhábiles, Festivos y Lluvias'}">
            <i class="fa-solid fa-calendar-xmark text-amber-600 text-xs"></i> <span>Días Inhábiles</span>
          </button>

          <!-- 13. Días, Semanas, Meses (Selector de Escala Temporal) -->
          <div id="calendario-scale-selector" class="flex items-center bg-white p-0.5 rounded border border-slate-300 text-[11px] font-semibold shadow-2xs shrink-0">
            <button type="button" onclick="setCalendarioTimeScale('dias')" class="px-2 py-0.5 rounded transition cursor-pointer ${cfg.scale === 'dias' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">Días</button>
            <button type="button" onclick="setCalendarioTimeScale('semanas')" class="px-2 py-0.5 rounded transition cursor-pointer ${cfg.scale === 'semanas' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">Semanas</button>
            <button type="button" onclick="setCalendarioTimeScale('meses')" class="px-2 py-0.5 rounded transition cursor-pointer ${cfg.scale === 'meses' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">Meses</button>
          </div>

          <!-- 14. Zoom del Diagrama Gantt (Acercar / Alejar) -->
          <div class="flex items-center gap-0.5 bg-white p-0.5 rounded border border-slate-300 text-xs font-semibold shadow-2xs shrink-0 ${cfg.viewMode !== 'gantt' ? 'hidden' : ''}" id="gantt-zoom-controls">
            <button type="button" onclick="changeGanttZoom('out')" class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition cursor-pointer" title="Alejar escala diaria (-)">
              <i class="fa-solid fa-minus text-[9px]"></i>
            </button>
            <button type="button" onclick="changeGanttZoom('reset')" class="px-1.5 py-0.5 rounded text-blue-700 font-mono font-bold text-[11px] hover:bg-blue-50 transition cursor-pointer" title="Restablecer zoom normal (34px/día)">
              ${Math.round((dayWidthPx / 34) * 100)}%
            </button>
            <button type="button" onclick="changeGanttZoom('in')" class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold transition cursor-pointer" title="Acercar escala diaria (+)">
              <i class="fa-solid fa-plus text-[9px]"></i>
            </button>
          </div>

          <!-- 15. Asignados (Miembros Asignados a Calendario de Obra, al extremo derecho del mismo renglón) -->
          <div id="tab-members-calendario" class="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2 py-0.5 shadow-2xs shrink-0">
            <i class="fa-solid fa-users text-blue-600 text-[10px]" title="Colaboradores con acceso a Calendario de Obra"></i>
            <div id="tab-avatars-calendario" class="flex -space-x-1.5 overflow-hidden items-center cursor-pointer" onclick="openTabMembersAssignModal('calendario')" title="Ver colaboradores con acceso a Calendario de Obra"></div>
            <button type="button" onclick="openTabMembersAssignModal('calendario')" class="text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5 transition flex items-center gap-1 cursor-pointer" title="Asignar miembros invitados a la pestaña Calendario de Obra">
              <i class="fa-solid fa-user-gear text-[9px]"></i> Asignar
            </button>
          </div>

        </div>

      </div>

      <!-- 2. TARJETAS KPI DE RESUMEN EJECUTIVO (Diseño Claro Corporativo estilo Catálogo Base) -->
      <div class="px-2.5 py-2 bg-slate-50 border-b border-slate-200 grid grid-cols-6 gap-2 shrink-0 w-full select-none">
        
        <!-- Tarjeta 1: INICIO DE OBRA -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">INICIO DE OBRA</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-regular fa-calendar-check text-blue-600 text-xs shrink-0"></i>
            <input type="date" value="${minDate ? formatDate(minDate) : cfg.startDate}" onchange="changeProjectStartDate(this.value)" class="calendario-date-input text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer hover:text-blue-600 font-mono w-full truncate">
          </div>
        </div>

        <!-- Tarjeta 2: DÍA ACTUAL / CORTE -->
        <div class="bg-rose-50/50 border border-rose-200 hover:border-rose-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <div class="flex items-center justify-between gap-1">
            <span class="text-[9.5px] font-bold text-rose-700 uppercase tracking-wider block truncate">DÍA ACTUAL / CORTE</span>
            <button type="button" onclick="resetGanttTodayDateAction()" class="text-[8px] font-extrabold text-white bg-rose-600 hover:bg-rose-500 rounded-full px-2 py-0.5 transition cursor-pointer shrink-0 shadow-2xs flex items-center gap-1" title="Restablecer al día de hoy actual en tiempo real">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> Hoy
            </button>
          </div>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-solid fa-location-crosshairs text-rose-600 text-xs shrink-0"></i>
            <input type="date" value="${getGanttTodayDate()}" onchange="changeGanttTodayDateAction(this.value)" class="calendario-date-input text-xs font-bold text-rose-800 bg-transparent outline-none cursor-pointer hover:text-rose-600 font-mono w-full truncate" title="Fecha del día de hoy o fecha de corte desplazada">
          </div>
        </div>

        <!-- Tarjeta 3: TÉRMINO ESTIMADO -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">TÉRMINO ESTIMADO</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-solid fa-flag-checkered text-rose-500 text-xs shrink-0"></i>
            <span class="text-xs font-bold text-slate-800 font-mono truncate">${maxDate ? formatDate(maxDate) : '---'}</span>
          </div>
        </div>

        <!-- Tarjeta 4: PLAZO DE EJECUCIÓN -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">PLAZO DE EJECUCIÓN</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-regular fa-clock text-amber-600 text-xs shrink-0"></i>
            <span class="text-xs font-extrabold text-slate-800 font-mono truncate" title="${totalDias} días naturales (${workdaysSummary.workingDays} días hábiles efectivos)">
              ${totalDias}d naturales <span class="text-[10px] text-emerald-700 font-bold">(${workdaysSummary.workingDays} hábiles)</span>
            </span>
          </div>
        </div>

        <!-- Tarjeta 5: PRESUPUESTO BASE -->
        <div class="bg-emerald-50/50 border border-emerald-200 hover:border-emerald-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wider block truncate">PRESUPUESTO BASE</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0">
            <i class="fa-solid fa-coins text-emerald-600 text-xs shrink-0"></i>
            <span class="text-xs font-black text-emerald-700 font-mono truncate">${formatCurrency(scheduleData.grandTotalObra, currencySymbol)}</span>
          </div>
        </div>

        <!-- Tarjeta 6: MES PICO (MÁX INVERSIÓN) -->
        <div class="bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 flex flex-col justify-between shadow-2xs min-w-0 transition">
          <span class="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block truncate">MES PICO (MÁX INVERSIÓN)</span>
          <div class="flex items-center gap-1.5 mt-0.5 min-w-0 truncate">
            <i class="fa-solid fa-bolt text-indigo-600 text-xs shrink-0"></i>
            <span class="text-xs font-bold text-slate-800 truncate font-mono" title="${scheduleData.picoPeriod ? scheduleData.picoPeriod.fullLabel : 'N/A'}">
              ${scheduleData.picoPeriod ? scheduleData.picoPeriod.label : 'N/A'} (${formatCurrency(scheduleData.picoMonto, currencySymbol)})
            </span>
          </div>
        </div>

      </div>

      <!-- 3. ÁREA DE VISUALIZACIÓN DINÁMICA (Diagrama Gantt / Financiero / Curva S) -->
      <div class="bg-white overflow-hidden flex-1 flex flex-col relative min-h-[380px]" id="calendario-main-content">
        ${renderActiveCalendarioView(isAdvancedCalendarioAllowed() ? cfg.viewMode : 'gantt', visibleItems, periods, scheduleData, currencySymbol, minDate, maxDate)}
      </div>

    </div>
  `;

  // Inicializar resizer arrastrable manual, scroll sincronizado, arrastre de barras, zoom estilo Premiere Pro y líneas de corte (evitando acumulación de timers)
  if (calendarioInitTimer) clearTimeout(calendarioInitTimer);
  calendarioInitTimer = setTimeout(() => {
    calendarioInitTimer = null;
    initGanttResizer();
    syncGanttJustifiedRowHeights();
    syncGanttScroll();
    initGanttBarDrag();
    initPremiereZoomBar();
    initGanttTodayLineDrag();
    initFinancialTodayLineDrag();
    initCurvaSTodayLineDrag();
    renderTabAssignedAvatars('calendario');
  }, 0);
}

// ==========================================
// RENDERIZADO SEGÚN MODO SELECCIONADO
// ==========================================
function renderActiveCalendarioView(mode, items, periods, scheduleData, currencySymbol, minDate, maxDate) {
  if (mode === 'gantt') {
    return renderGanttTimelineView(items, periods, currencySymbol, minDate, maxDate);
  } else if (mode === 'financiero') {
    return renderFinancialTableView(items, periods, scheduleData, currencySymbol);
  } else {
    return renderCurvaSView(periods, scheduleData, currencySymbol);
  }
}

// ==========================================
// 1. VISTA DIAGRAMA DE GANTT (ESTILO EJECUTIVO)
// ==========================================
function renderGanttTimelineView(items, periods, currencySymbol, minDate, maxDate) {
  if (!minDate) minDate = parseDate('2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const cfg = getScheduleSettings();
  const isJustifyConcepts = Boolean(cfg.justifyConcepts);
  const savedPanelWidth = cfg.panelWidth || parseInt(localStorage.getItem('calendario_gantt_split_w'), 10) || 510;
  const showCpm = isAdvancedCalendarioAllowed() && (cfg.showCriticalPath !== false);
  const allItemsSource = currentScheduleData?.items || items;
  const allConceptItems = allItemsSource.filter(it => it.tipo === 'concepto');
  const conceptById = new Map();
  allConceptItems.forEach(c => conceptById.set(String(c.id), c));

  // Generar escala según modo seleccionado: Días (3 niveles), Semanas (Semana 1..4 + Mes arriba) o Meses (Nombre del Mes)
  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, cfg.dayWidth);
  const { timelineStart, scale, pxPerDay, totalTimelineWidth, monthGroups, days } = scaleData;

  // Cálculo de posición del día actual / fecha de corte
  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);
  const todayOffsetDays = diffDays(timelineStart, todayDate);
  const todayLeftPx = Math.round(todayOffsetDays * pxPerDay + (pxPerDay / 2));
  const showTodayLine = (todayLeftPx >= -20 && todayLeftPx <= totalTimelineWidth + 100);

  const night = isNightMode();
  const gridLineRgb = night ? '51, 65, 85' : '203, 213, 225';
  const gridBackgroundStyle = scale === 'dias'
    ? `background-size: ${pxPerDay}px 100%; background-image: linear-gradient(to right, rgba(${gridLineRgb}, 0.55) 1px, transparent 1px);`
    : (scale === 'semanas'
      ? `background-size: ${7 * pxPerDay}px 100%; background-image: linear-gradient(to right, rgba(${gridLineRgb}, 0.65) 1px, transparent 1px);`
      : `background-size: ${30 * pxPerDay}px 100%; background-image: linear-gradient(to right, rgba(${gridLineRgb}, 0.75) 1px, transparent 1px);`);

  // Precalcular altura de cada fila y geometría exacta (x, y) para trazar flechas SVG Fin-a-Inicio
  const visibleGeomMap = new Map();
  const rowHeightsMap = new Map();
  const descColWidthPx = Math.max(110, savedPanelWidth - 255);
  const charsPerLine = Math.max(16, Math.floor(descColWidthPx / 6.3));
  let cumulativeRowY = 0;

  items.forEach((it, rowIdx) => {
    let rowH = 40;
    if (isJustifyConcepts) {
      const descLen = String(it.descripcion || '').length;
      const lines = Math.max(1, Math.ceil(descLen / charsPerLine));
      rowH = it.isParent
        ? Math.max(40, lines * 16 + 16)
        : Math.max(44, lines * 15 + 24);
    }
    rowHeightsMap.set(String(it.id), rowH);

    if (it.startDate && it.endDate) {
      const sD = parseDate(it.startDate);
      const eD = parseDate(it.endDate);
      const offD = Math.max(0, diffDays(timelineStart, sD));
      const bDays = Math.max(3, it.durationDays || (diffDays(sD, eD) + 1));
      const lPx = offD * pxPerDay;
      const wPx = Math.max(3 * pxPerDay, bDays * pxPerDay);
      visibleGeomMap.set(String(it.id), {
        rowIdx,
        leftPx: lPx,
        rightPx: lPx + wPx,
        centerY: cumulativeRowY + (rowH / 2),
        rowHeight: rowH,
        item: it
      });
    }
    cumulativeRowY += rowH;
  });
  const totalRowsHeightPx = Math.max(40, cumulativeRowY);

  // Construir rutas ortogonales SVG para cada enlace Fin-a-Inicio visible
  const svgPaths = [];
  items.forEach(succItem => {
    if (succItem.isParent || !Array.isArray(succItem.predecessors) || succItem.predecessors.length === 0) return;
    const succGeom = visibleGeomMap.get(String(succItem.id));
    if (!succGeom) return;

    succItem.predecessors.forEach(predId => {
      const predGeom = visibleGeomMap.get(String(predId));
      if (!predGeom) return;
      const predConcept = conceptById.get(String(predId));
      const isCritLink = showCpm &&
        predConcept &&
        Array.isArray(predConcept.criticalSuccIds) &&
        predConcept.criticalSuccIds.includes(String(succItem.id));

      const x1 = Math.round(predGeom.rightPx);
      const y1 = Math.round(predGeom.centerY);
      const x2 = Math.round(succGeom.leftPx);
      const y2 = Math.round(succGeom.centerY);
      const targetX = Math.max(0, x2 - 2);

      let pathD = '';
      if (x2 >= x1 + 16) {
        const midX = Math.round(x1 + Math.min(18, (x2 - x1) / 2));
        pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${targetX} ${y2}`;
      } else {
        const dir = y2 >= y1 ? 1 : -1;
        const turnY = y1 + dir * 20;
        const outX = x1 + 9;
        const inX = Math.max(2, x2 - 10);
        pathD = `M ${x1} ${y1} L ${outX} ${y1} L ${outX} ${turnY} L ${inX} ${turnY} L ${inX} ${y2} L ${targetX} ${y2}`;
      }

      svgPaths.push({
        d: pathD,
        isCritLink,
        fromClave: predConcept?.clave || '',
        toClave: succItem.clave || ''
      });
    });
  });

  const visibleConceptsCount = items.filter(it => !it.isParent).length;
  const visibleCriticalCount = items.filter(it => !it.isParent && it.isCritical).length;
  const visibleLinksCount = items.filter(it => !it.isParent && it.predecessors && it.predecessors.length > 0).length;

  return `
    <div class="flex flex-1 overflow-hidden h-full relative bg-white" id="gantt-root-container">
      
      <!-- Panel Izquierdo: Conceptos, Predecesoras, Fechas y Holgura (Ancho Ajustable Manualmente mediante Divisor, estilo Catálogo Base) -->
      <div id="gantt-left-panel" 
           class="shrink-0 flex flex-col bg-white z-10 overflow-y-auto overflow-x-hidden custom-scroll border-r border-slate-200"
           style="width: ${savedPanelWidth}px; min-width: 260px; max-width: 80%;">
        
        <!-- Encabezado de la tabla izquierda (Idéntico a Catálogo Base: bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold) -->
        <div class="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-semibold px-2.5 flex items-center sticky top-0 z-20 h-16 shrink-0 shadow-2xs">
          <span class="w-14 shrink-0">Clave</span>
          <span class="flex-1 min-w-0 px-1.5">Concepto de Obra / Unidad</span>
          <span class="w-24 shrink-0 text-center" title="Concepto(s) predecesores que deben terminar antes de poder iniciar éste (Fin a Inicio)">Predec.</span>
          <span class="w-24 shrink-0 text-center">Inicio</span>
          <span class="w-12 shrink-0 text-center">Días</span>
        </div>

        <!-- Renglones de conceptos y partidas (Formato y colores de Catálogo Base) -->
        <div class="divide-y divide-slate-100 font-mono text-xs flex-1">
          ${items.map(item => {
            const rowH = rowHeightsMap.get(String(item.id)) || 40;
            const isSelectedRow = String(selectedCalendarioRowId) === String(item.id);
            if (item.isParent) {
              const isLevel1 = item.level === 1;
              const indentPx = (item.level - 1) * 14 + 8;
              const defaultParentBg = isLevel1 ? 'bg-slate-50 font-bold text-slate-800 border-y border-slate-200' : 'bg-slate-50/60 font-semibold text-slate-800 border-y border-slate-200/70';
              return `
                <div data-gantt-left-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" onfocusin="selectCalendarioRow('${item.id}', event)" class="${isJustifyConcepts ? 'min-h-[40px]' : 'h-10'} ${item.rowBgColor ? 'font-bold text-slate-800 border-y border-slate-200' : defaultParentBg} ${isSelectedRow ? 'selected-row' : 'hover:bg-slate-100/80'} py-1.5 px-2 flex items-center justify-between cursor-pointer transition select-none" style="padding-left: ${indentPx}px; ${isJustifyConcepts ? `min-height: ${rowH}px;` : ''} ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''}">
                  <div class="flex items-center min-w-0 flex-1 mr-1.5">
                    <button type="button" onclick="toggleCalendarioNodeGroup('${item.id}', event)" 
                            class="mr-1.5 w-5 h-5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 inline-flex items-center justify-center transition cursor-pointer shrink-0" 
                            title="${item.expanded ? 'Agrupar partida (colapsar)' : 'Desagrupar partida (expandir)'}">
                      <i class="fa-solid fa-chevron-${item.expanded ? 'down' : 'right'} text-[10px]"></i>
                    </button>
                    <span class="w-12 mr-1.5 text-blue-700 font-mono text-[11px] font-bold shrink-0 truncate">${item.clave || 'PART'}</span>
                    <span class="${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} font-sans ${isLevel1 ? 'uppercase text-xs tracking-wide font-extrabold text-slate-900' : 'text-xs font-bold text-slate-800'}">${item.descripcion}</span>
                    ${isLevel1 ? `<span class="ml-1.5 shrink-0">${renderPartidaNivel1ChatButton(item.id, item.clave, item.descripcion)}</span>` : ''}
                    ${!item.expanded ? `<span class="ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-mono border border-blue-200 shrink-0 font-normal">Agrupado (${item.descendantConceptCount})</span>` : ''}
                  </div>
                  <div class="flex items-center shrink-0">
                    <span class="w-24 text-center text-[9.5px]">
                      ${showCpm && item.hasCriticalChildren ? `<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 font-sans font-bold" title="Contiene actividades en Ruta Crítica">🔥 Crítica</span>` : `<span class="text-slate-400">—</span>`}
                    </span>
                    <span class="w-24 text-center text-[11px] text-slate-600 font-mono">${item.startDate || ''}</span>
                    <span class="w-12 text-center text-[11px] text-slate-800 font-bold">${item.durationDays || 0}d</span>
                  </div>
                </div>
              `;
            } else {
              const indentPx = (item.level - 1) * 14 + 12;
              const curDur = Math.max(3, item.durationDays || 3);
              const barColorHex = item.customColor || item.color.bar;
              const isCrit = showCpm && item.isCritical;
              const dotHex = isCrit ? '#dc2626' : barColorHex;
              const preds = Array.isArray(item.predecessors) ? item.predecessors : [];
              const predConcepts = preds.map(pid => conceptById.get(String(pid))).filter(Boolean);
              const predClaves = predConcepts.map(pc => pc.clave || 'CONC');
              const singlePredId = preds.length === 1 ? String(preds[0]) : '';

              let predControlHtml = '';
              if (preds.length >= 2) {
                const shortBadges = predClaves.slice(0, 2).join(', ') + (predClaves.length > 2 ? ` +${predClaves.length - 2}` : '');
                predControlHtml = `
                  <button type="button" onclick="openConceptDependenciesModal('${item.id}')"
                          class="w-full max-w-[90px] px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold truncate cursor-pointer transition flex items-center justify-center gap-1"
                          title="Depende de terminar: ${predConcepts.map(pc => `${pc.clave} (${pc.descripcion})`).join(' | ')} — Clic para editar">
                    <i class="fa-solid fa-link text-[8px] shrink-0"></i>
                    <span class="truncate">${shortBadges}</span>
                  </button>
                `;
              } else {
                predControlHtml = `
                  <select onchange="onGanttPredecessorSelect('${item.id}', this.value)"
                          class="w-full max-w-[90px] text-[10px] font-mono rounded border ${singlePredId ? 'bg-blue-50/80 border-blue-200 text-blue-800 font-bold' : 'bg-transparent hover:bg-slate-50 border-slate-200 text-slate-500'} px-1 py-0.5 outline-none focus:border-blue-500 cursor-pointer truncate"
                          title="${singlePredId ? `Depende de terminar ${predClaves[0]} antes de iniciar` : 'Sin dependencia (inicio libre). Selecciona un concepto predecesor'}">
                    <option value="">— Libre —</option>
                    ${allConceptItems
                      .filter(cand => String(cand.id) !== String(item.id) && (String(cand.id) === singlePredId || !wouldCreateScheduleCycle(item.id, cand.id, allConceptItems)))
                      .map(cand => `<option value="${cand.id}" ${String(cand.id) === singlePredId ? 'selected' : ''}>${cand.clave} • ${cand.descripcion.slice(0, 24)}</option>`)
                      .join('')}
                    <option value="__MULTI__">⚙️ Múltiples...</option>
                  </select>
                `;
              }

              const hasLock = preds.length > 0 && Boolean(item.minAllowedStartDate);

              return `
                <div data-gantt-left-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" onfocusin="selectCalendarioRow('${item.id}', event)" class="${isJustifyConcepts ? 'min-h-[40px]' : 'h-10'} py-1.5 px-2 ${item.rowBgColor ? '' : (isCrit ? 'bg-rose-50/35 hover:bg-rose-50/65' : 'bg-white hover:bg-slate-50')} ${isSelectedRow ? 'selected-row' : ''} flex items-center justify-between group cursor-pointer transition select-none" style="padding-left: ${indentPx}px; ${isJustifyConcepts ? `min-height: ${rowH}px;` : ''} ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''}">
                  <div class="flex items-center min-w-0 flex-1 mr-1.5">
                    <span class="w-2 h-2 rounded-full mr-1.5 shrink-0 border" style="background-color: ${dotHex}44; border-color: ${dotHex};"></span>
                    <span class="w-14 mr-1.5 font-mono ${isCrit ? 'text-rose-700 font-bold' : 'text-blue-700 font-semibold'} truncate text-[11px] shrink-0" title="${item.clave}">${item.clave}</span>
                    <div class="min-w-0 flex-1 font-sans">
                      <span class="block ${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} text-slate-800 text-xs font-medium" title="${item.descripcion}">${item.descripcion}</span>
                      <span class="text-[10px] text-slate-500 font-mono truncate block">${formatNumber(item.cantidad, 2)} ${item.unidad} • ${formatCurrency(item.importe, currencySymbol)}</span>
                    </div>
                  </div>
                  <div class="flex items-center shrink-0">
                    <!-- Selector de Predecesoras Fin-a-Inicio -->
                    <div class="w-24 px-0.5 flex items-center justify-center">
                      ${predControlHtml}
                    </div>
                    <!-- Input de Fecha Inicio Editable con Candado si tiene Predecesora -->
                    <div class="w-24 text-center px-0.5 flex items-center justify-center">
                      ${hasLock ? `<i class="fa-solid fa-lock text-[8.5px] text-amber-600 mr-0.5 shrink-0" title="Inicio condicionado Fin-a-Inicio: requiere terminar ${predClaves.join(', ')} (mínimo ${item.minAllowedStartDate})"></i>` : ''}
                      <input type="date" value="${item.startDate}" ${hasLock ? `min="${item.minAllowedStartDate}"` : ''} onchange="onGanttDateInput('${item.id}', this.value, ${curDur})" class="calendario-date-input text-[10.5px] bg-transparent hover:bg-white focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-blue-500 rounded-xs px-0.5 py-0.5 outline-none font-mono ${hasLock ? 'text-amber-900 font-semibold' : 'text-slate-800'} w-full text-center cursor-pointer transition" title="${hasLock ? `No puede iniciar antes de ${item.minAllowedStartDate} (depende de ${predClaves.join(', ')})` : 'Fecha de inicio del concepto'}">
                    </div>
                    <!-- Input de Duración Editable (Mínimo 3 días, Estilo Catálogo Base) -->
                    <div class="w-12 text-center">
                      <input type="number" min="3" max="999" value="${curDur}" onchange="onGanttDurationInput('${item.id}', '${item.startDate}', this.value)" class="text-[11px] bg-transparent hover:bg-white focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-blue-500 rounded-xs px-0.5 py-0.5 outline-none font-mono text-slate-800 font-bold w-10 text-center transition" title="Duración en días (mínimo 3 días). Al cambiar empuja conceptos dependientes.">
                    </div>
                  </div>
                </div>
              `;
            }
          }).join('')}
        </div>

        <!-- Pie del panel izquierdo sincronizado con la barra de navegación -->
        <div class="h-8 bg-slate-100 border-t border-slate-200 px-3 flex items-center justify-between text-[10.5px] text-slate-600 font-mono shrink-0">
          <span class="flex items-center gap-1.5 font-semibold text-slate-700"><i class="fa-solid fa-list-check text-blue-600 text-[10px]"></i> ${visibleConceptsCount} conc.</span>
          <span class="flex items-center gap-2">
            <span class="text-rose-700 font-bold" title="Conceptos en Ruta Crítica"><i class="fa-solid fa-fire-flame-curved text-[9px]"></i> ${visibleCriticalCount} crít.</span>
            <span class="text-indigo-700 font-semibold" title="Conceptos con dependencia Fin-a-Inicio"><i class="fa-solid fa-link text-[9px]"></i> ${visibleLinksCount} enl.</span>
          </span>
        </div>

      </div>

      <!-- Divisor Arrastrable (Splitter / Resizer Manual entre Conceptos y Gantt) -->
      <div id="gantt-resizer" 
           class="w-2 hover:w-2.5 bg-slate-200 hover:bg-blue-600 active:bg-blue-500 cursor-col-resize shrink-0 z-30 transition-all flex items-center justify-center group select-none shadow-2xs border-x border-slate-300"
           title="Arrastra para ajustar manualmente el ancho del panel de conceptos y el diagrama de Gantt">
        <div class="h-10 w-0.5 rounded-full bg-slate-400 group-hover:bg-white transition-colors"></div>
      </div>

      <!-- Panel Derecho: Contenedor con Timeline y Barra de Desplazamiento y Zoom -->
      <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white relative" id="gantt-right-wrapper">

        <!-- Timeline Gráfico Gantt -->
        <div id="gantt-timeline-panel" class="flex-1 overflow-x-hidden overflow-y-auto bg-white custom-scroll relative">
        
        <!-- Encabezado según Escala: Días (3 niveles), Semanas (2 niveles), Meses (Nombre del Mes) en estilo Catálogo Base -->
        <div class="sticky top-0 z-20 min-w-max bg-slate-100 shadow-2xs">
          ${scale === 'dias' ? `
            <!-- ESCALA DÍAS (3 NIVELES: Mes arriba, día del mes en medio, letra L-D abajo) -->
            <!-- NIVEL 1 (Arriba): Nombre del Mes Abreviado Inteligentemente según Ancho de Columna -->
            <div class="flex border-b border-slate-200 min-w-max h-7">
              ${monthGroups.map(m => {
                let displayLabel = `${m.monthName.toUpperCase()} ${m.year}`;
                if (m.widthPx < 48) {
                  displayLabel = m.short3 || m.monthName.slice(0, 3).toUpperCase();
                } else if (m.widthPx < 90) {
                  displayLabel = m.shortWithYear || `${m.monthName.slice(0, 3).toUpperCase()} '${String(m.year).slice(-2)}`;
                } else if (m.widthPx < 130) {
                  displayLabel = m.shortLabel || `${m.monthName.slice(0, 3).toUpperCase()} ${m.year}`;
                }
                return `
                  <div class="border-r border-slate-200 text-center py-1 px-1 bg-slate-100 font-extrabold text-[11px] text-slate-700 uppercase tracking-wider shrink-0 truncate flex items-center justify-center overflow-hidden"
                       style="width: ${m.widthPx}px;"
                       title="${m.label} (${m.daysCount} días)">
                    <span class="truncate">${displayLabel}</span>
                  </div>
                `;
              }).join('')}
            </div>

            <!-- NIVELES 2 y 3 (En medio: Número de día del mes / Abajo: Primer letra del día L, M, M, J, V, S, D) -->
            <div class="flex border-b border-slate-200 min-w-max h-9">
              ${days.map(d => {
                let cellBgClass = 'bg-slate-50 text-slate-700';
                let badgeIcon = '';
                let dayTitle = `${d.dateStr} (Día laboral)`;

                if (d.isLluvia) {
                  cellBgClass = 'bg-sky-50 text-sky-700 border-sky-200';
                  badgeIcon = '<i class="fa-solid fa-cloud-rain text-[8px] text-sky-600 leading-none"></i>';
                  dayTitle = `${d.dateStr} - DÍA DE LLUVIA: ${d.lluviaName || 'Suspensión climática'}`;
                } else if (d.isFestivo) {
                  cellBgClass = 'bg-purple-50 text-purple-700 border-purple-200';
                  badgeIcon = '<i class="fa-solid fa-star text-[8px] text-purple-600 leading-none"></i>';
                  dayTitle = `${d.dateStr} - DÍA FESTIVO: ${d.festivoName}`;
                } else if (d.isNonWorkingDayOfWeek) {
                  cellBgClass = 'bg-amber-50/90 text-amber-800';
                  dayTitle = `${d.dateStr} - DÍA NO LABORABLE (Descanso semanal)`;
                } else if (d.isWeekend) {
                  cellBgClass = 'bg-slate-100/80 text-slate-500';
                  dayTitle = `${d.dateStr} - Fin de semana`;
                }

                return `
                  <div class="border-r border-slate-200 text-center flex flex-col justify-between shrink-0 select-none py-0.5 overflow-hidden transition-colors ${cellBgClass}"
                       style="width: ${pxPerDay}px;"
                       title="${dayTitle}">
                    <div class="flex items-center justify-center gap-0.5 leading-none">
                      <span class="text-[10px] font-mono font-bold leading-none truncate">${d.dayNum}</span>
                      ${badgeIcon}
                    </div>
                    <span class="text-[9px] font-mono leading-none truncate ${d.isNonWorkingDayOfWeek ? 'font-black text-amber-700' : d.isFestivo ? 'font-black text-purple-700' : d.isLluvia ? 'font-black text-sky-700' : 'text-slate-500 font-semibold'}">${d.letter}</span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : scale === 'semanas' ? `
            <!-- ESCALA SEMANAS: Mes arriba y Semana 1, 2, 3, 4 abajo -->
            <!-- NIVEL 1 (Arriba): Nombre del Mes -->
            <div class="flex border-b border-slate-200 min-w-max h-7">
              ${monthGroups.map(m => {
                let displayLabel = `${m.monthName.toUpperCase()} ${m.year}`;
                if (m.widthPx < 55) {
                  displayLabel = m.short3 || m.monthName.slice(0, 3).toUpperCase();
                } else if (m.widthPx < 100) {
                  displayLabel = m.shortWithYear || `${m.monthName.slice(0, 3).toUpperCase()} '${String(m.year).slice(-2)}`;
                } else if (m.widthPx < 140) {
                  displayLabel = m.shortLabel || `${m.monthName.slice(0, 3).toUpperCase()} ${m.year}`;
                }
                return `
                  <div class="border-r border-slate-200 text-center py-1 px-1 bg-slate-100 font-extrabold text-[11px] text-slate-700 uppercase tracking-wider shrink-0 truncate flex items-center justify-center overflow-hidden"
                       style="width: ${m.widthPx}px;"
                       title="${m.label} (${m.daysCount} días)">
                    <span class="truncate">${displayLabel}</span>
                  </div>
                `;
              }).join('')}
            </div>

            <!-- NIVEL 2 (Abajo): Semana 1, 2, 3, 4, 5 -->
            <div class="flex border-b border-slate-200 min-w-max h-9">
              ${monthGroups.map(m => m.weeks.map(w => {
                let weekTitle = w.label;
                let weekSubtitle = w.rangeLabel;
                if (w.widthPx < 45) {
                  weekTitle = w.ultraShortLabel || `S${w.num}`;
                  weekSubtitle = w.shortRange || `${w.rangeLabel}`;
                } else if (w.widthPx < 85) {
                  weekTitle = w.shortLabel || `Sem ${w.num}`;
                  weekSubtitle = w.shortRange || `${w.rangeLabel}`;
                } else {
                  weekTitle = `Semana ${w.num}`;
                  weekSubtitle = `${w.rangeLabel}`;
                }

                return `
                  <div class="border-r border-slate-200 text-center flex flex-col justify-center shrink-0 select-none py-0.5 px-0.5 bg-slate-50 text-slate-700 overflow-hidden"
                       style="width: ${w.widthPx}px;"
                       title="${m.label} - Semana ${w.num} (${w.daysCount} días: del ${w.rangeLabel})">
                    <span class="text-[10px] font-bold leading-none text-slate-800 truncate w-full">${weekTitle}</span>
                    <span class="text-[9px] font-mono leading-none text-slate-500 mt-0.5 truncate w-full">${weekSubtitle}</span>
                  </div>
                `;
              }).join('')).join('')}
            </div>
          ` : `
            <!-- ESCALA MESES: Nombre de los Meses Abreviado con Precisión según Ancho de Celda -->
            <div class="flex border-b border-slate-200 min-w-max h-16">
              ${monthGroups.map(m => {
                let monthTitle = `${m.monthName.toUpperCase()} ${m.year}`;
                let monthSub = `${m.daysCount} días naturales`;

                if (m.widthPx < 65) {
                  monthTitle = m.short3 || m.monthName.slice(0, 3).toUpperCase();
                  monthSub = `${m.daysCount}d`;
                } else if (m.widthPx < 110) {
                  monthTitle = m.shortWithYear || `${m.monthName.slice(0, 3).toUpperCase()} '${String(m.year).slice(-2)}`;
                  monthSub = `${m.daysCount} días`;
                } else if (m.widthPx < 160) {
                  monthTitle = m.shortLabel || `${m.monthName.slice(0, 3).toUpperCase()} ${m.year}`;
                  monthSub = `${m.daysCount} días`;
                } else {
                  monthTitle = `${m.monthName.toUpperCase()} ${m.year}`;
                  monthSub = `${m.daysCount} días naturales`;
                }

                return `
                  <div class="border-r border-slate-200 text-center py-1.5 px-1 bg-slate-100 flex flex-col items-center justify-center shrink-0 overflow-hidden"
                       style="width: ${m.widthPx}px;"
                       title="${m.label} (${m.daysCount} días naturales)">
                    <span class="text-xs font-black text-blue-700 uppercase tracking-wider truncate w-full px-1">${monthTitle}</span>
                    <span class="text-[10px] text-slate-500 font-mono mt-0.5 truncate w-full px-1">${monthSub}</span>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Filas con las Barras del Gantt, Flechas SVG Fin-a-Inicio y Cuadrícula de Fondo (Estilo Claro Catálogo Base) -->
        <div class="divide-y divide-slate-100 text-xs min-w-max relative" style="width: ${totalTimelineWidth}px;">
          
          <!-- Capa SVG de Flechas de Dependencia Fin-a-Inicio y Ruta Crítica -->
          <svg id="gantt-dependency-svg"
               width="${totalTimelineWidth}"
               height="${totalRowsHeightPx}"
               class="absolute top-0 left-0 pointer-events-none z-20 overflow-visible">
            <defs>
              <marker id="gantt-arrow-crit" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#e11d48"></path>
              </marker>
              <marker id="gantt-arrow-norm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="${night ? '#94a3b8' : '#64748b'}"></path>
              </marker>
            </defs>
            ${svgPaths.map(p => `
              <path d="${p.d}"
                    fill="none"
                    stroke="${p.isCritLink ? '#e11d48' : (night ? '#94a3b8' : '#64748b')}"
                    stroke-width="${p.isCritLink ? '2' : '1.5'}"
                    stroke-linejoin="round"
                    marker-end="url(#${p.isCritLink ? 'gantt-arrow-crit' : 'gantt-arrow-norm'})"
                    opacity="${p.isCritLink ? '0.95' : '0.78'}"></path>
            `).join('')}
          </svg>

          ${items.map(item => {
            const rowH = rowHeightsMap.get(String(item.id)) || 40;
            const isSelectedRow = String(selectedCalendarioRowId) === String(item.id);
            const sDate = parseDate(item.startDate);
            const eDate = parseDate(item.endDate);
            const offsetDays = Math.max(0, diffDays(timelineStart, sDate));
            const barDays = Math.max(3, item.durationDays || (diffDays(sDate, eDate) + 1));

            const leftPx = offsetDays * pxPerDay;
            const widthPx = Math.max(3 * pxPerDay, barDays * pxPerDay);

            if (item.isParent) {
              const parentCrit = showCpm && item.hasCriticalChildren;
              return `
                <div data-gantt-right-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" class="${isJustifyConcepts ? 'min-h-[40px]' : 'h-10'} py-1.5 px-1 relative ${item.rowBgColor ? '' : 'bg-slate-50/70'} ${isSelectedRow ? 'selected-row' : ''} border-y border-slate-200/80 flex items-center cursor-pointer"
                     style="width: ${totalTimelineWidth}px; ${isJustifyConcepts ? `height: ${rowH}px;` : ''} ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''} ${gridBackgroundStyle}">
                  <div class="absolute h-6 rounded-md shadow-xs ${parentCrit ? 'bg-slate-800 border-rose-500/80' : 'bg-slate-700 border-slate-800'} hover:bg-slate-600 border hover:border-blue-500 flex items-center justify-between px-2 text-[10px] text-white font-bold truncate transition cursor-pointer select-none z-10" 
                       style="left: ${leftPx}px; width: ${widthPx}px;"
                       onclick="toggleCalendarioNodeGroup('${item.id}', event)"
                       title="${item.descripcion}: ${item.startDate} al ${item.endDate} (${barDays} días)&#10;Total: ${formatCurrency(item.totalImporte, currencySymbol)}&#10;Clic para ${item.expanded ? 'agrupar' : 'desagrupar'}">
                    <span class="truncate">${item.descripcion}</span>
                    <span class="shrink-0 text-[9px] font-mono opacity-85 ml-1">${barDays}d</span>
                  </div>
                </div>
              `;
            } else {
              const color = item.color || { bar: '#3b82f6' };
              const baseColorHex = item.customColor || color.bar;
              const isCritBar = showCpm && item.isCritical;
              const effectiveBarHex = isCritBar ? '#dc2626' : baseColorHex;
              const isPendingPred = calendarioLinkClickMode && String(pendingLinkPredecessorId) === String(item.id);
              const preds = Array.isArray(item.predecessors) ? item.predecessors : [];
              const predClaves = preds.map(pid => conceptById.get(String(pid))?.clave).filter(Boolean);
              const predTooltipLine = predClaves.length > 0
                ? `&#10;🔗 Depende de terminar: ${predClaves.join(', ')} (mín. ${item.minAllowedStartDate})`
                : '';
              const cpmTooltipLine = item.isCritical
                ? `&#10;🔥 RUTA CRÍTICA (Holgura: 0 días)`
                : `&#10;✓ Holgura disponible: +${item.slackDays || 0} día(s)`;

              return `
                <div data-gantt-right-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" class="${isJustifyConcepts ? 'min-h-[40px]' : 'h-10'} py-1.5 px-1 relative ${item.rowBgColor ? '' : (isCritBar ? 'bg-rose-50/25 hover:bg-rose-50/50' : 'bg-white hover:bg-slate-50/80')} ${isSelectedRow ? 'selected-row' : ''} transition flex items-center cursor-pointer"
                     style="width: ${totalTimelineWidth}px; ${isJustifyConcepts ? `height: ${rowH}px;` : ''} ${item.rowBgColor ? `background-color: ${item.rowBgColor};` : ''} ${gridBackgroundStyle}">
                  <div class="gantt-bar-concept ${isCritBar ? 'gantt-bar-critical ring-1 ring-rose-950/25 shadow-sm' : 'shadow-xs'} ${isPendingPred ? 'ring-2 ring-amber-400 shadow-lg' : ''} absolute h-6 rounded-md flex items-center justify-between group select-none z-10 transition-shadow"
                       data-concept-id="${item.id}"
                       data-start-date="${item.startDate}"
                       data-duration="${barDays}"
                       data-clave="${item.clave}"
                       data-desc="${item.descripcion}"
                       data-min-start-date="${item.minAllowedStartDate || ''}"
                       data-pred-claves="${predClaves.join(', ')}"
                       data-is-critical="${item.isCritical ? '1' : '0'}"
                       style="left: ${leftPx}px; width: ${widthPx}px; background-color: ${effectiveBarHex}; cursor: ${calendarioLinkClickMode ? 'pointer' : 'grab'};"
                       title="${item.clave} - ${item.descripcion}&#10;Inicio: ${item.startDate} | Fin: ${item.endDate} (${barDays} días)${predTooltipLine}${cpmTooltipLine}&#10;Monto: ${formatCurrency(item.importe, currencySymbol)}&#10;• Arrastra el centro para mover fecha&#10;• Arrastra los bordes laterales para estirar o reducir">
                    
                    <!-- Manija Izquierda: Reducir / Estirar Inicio -->
                    <div class="gantt-handle-left absolute left-0 top-0 bottom-0 w-2.5 rounded-l-md hover:bg-white/40 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                         title="Arrastra para cambiar inicio (reducir o estirar)">
                      <div class="w-0.5 h-3 bg-white/80 rounded-full pointer-events-none"></div>
                    </div>

                    <!-- Contenido Central de la Barra (Mover) -->
                    <div class="gantt-bar-body flex-1 flex items-center justify-between px-2 min-w-0 pointer-events-none select-none">
                      <span class="truncate text-[10px] text-white font-bold flex items-center gap-1">
                        ${predClaves.length > 0 ? `<i class="fa-solid fa-lock text-[8px] opacity-90 shrink-0"></i>` : ''}
                        <span class="truncate">${item.clave}</span>
                      </span>
                      <span class="text-[9px] font-mono shrink-0 hidden sm:inline text-white/95 ml-1 font-bold">${barDays}d</span>
                    </div>

                    <!-- Manija Derecha: Reducir / Estirar Fin -->
                    <div class="gantt-handle-right absolute right-0 top-0 bottom-0 w-2.5 rounded-r-md hover:bg-white/40 cursor-ew-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                         title="Arrastra para cambiar duración (reducir o estirar)">
                      <div class="w-0.5 h-3 bg-white/80 rounded-full pointer-events-none"></div>
                    </div>
                  </div>
                </div>
              `;
            }
          }).join('')}

          <!-- LÍNEA INDICADORA DE DÍA DE HOY / FECHA DE CORTE (Arrastrable a días anteriores o futuros) -->
          ${showTodayLine ? `
            <div id="gantt-today-line-container" 
                 class="absolute -top-16 bottom-0 z-30 pointer-events-none"
                 style="left: ${todayLeftPx}px;"
                 data-today-date="${todayStr}">
              
              <!-- Pin / Marcador Superior en el Encabezado (Arrastrable) -->
              <div id="gantt-today-pin" 
                   class="absolute top-1 -translate-x-1/2 pointer-events-auto cursor-ew-resize z-40 select-none group flex flex-col items-center"
                   title="Día de Hoy / Fecha de Corte: ${todayStr}&#10;• Arrastra para mover a días anteriores o futuros&#10;• Doble clic para volver al día real"
                   data-today-date="${todayStr}">
                
                <div class="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 active:bg-rose-400 text-white text-[9px] font-black uppercase tracking-wider shadow-md border border-rose-300 flex items-center gap-1 transition-transform group-hover:scale-105">
                  <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                  <span>HOY</span>
                </div>
                <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-rose-600 -mt-0.5 shadow-sm"></div>
              </div>

              <!-- Línea Vertical que atraviesa todas las filas -->
              <div class="w-0.5 h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] -translate-x-1/2 opacity-90"></div>

              <!-- Etiqueta Flotante Inferior con la fecha -->
              <div class="absolute bottom-2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-rose-600 border border-rose-700 text-white text-[9px] font-mono font-bold pointer-events-none shadow-sm">
                ${todayStr}
              </div>

            </div>
          ` : ''}

        </div>

      </div>

      <!-- Barra de Desplazamiento y Zoom Inferior (Estilo Claro Catálogo Base) -->
      <div id="gantt-premiere-zoombar-container" 
           class="h-8 bg-slate-100 border-t border-slate-200 px-2.5 flex items-center justify-between select-none z-20 gap-2 shrink-0">
        
        <!-- Botón Desplazar Izquierda (Paso suave) -->
        <button type="button" 
                id="gantt-nav-btn-left" 
                onclick="scrollGanttTimelineStep(-1)" 
                class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0" 
                title="Desplazar línea de tiempo hacia la izquierda (◀)">
          <i class="fa-solid fa-chevron-left"></i>
        </button>

        <!-- Pista de Navegación y Zoom (Track) -->
        <div id="gantt-premiere-track" 
             class="flex-1 h-5 bg-slate-200/80 hover:bg-slate-200 rounded-md border border-slate-300 relative cursor-pointer overflow-hidden shadow-inner flex items-center"
             title="Clic para saltar a esta posición en el cronograma">
          
          <!-- Líneas de referencia sutiles de la pista -->
          <div class="absolute inset-0 flex items-center justify-between px-3 pointer-events-none opacity-40">
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1 w-0.5 bg-slate-400 rounded-full"></div>
            <div class="h-1.5 w-0.5 bg-slate-400 rounded-full"></div>
          </div>

          <!-- Deslizador / Thumb de Zoom y Desplazamiento -->
          <div id="gantt-premiere-thumb" 
               class="absolute h-3.5 rounded-sm bg-gradient-to-b from-white to-slate-100 hover:from-blue-50 hover:to-blue-100 active:from-blue-600 active:to-blue-700 border border-slate-400 hover:border-blue-500 shadow-2xs flex items-center justify-between transition-colors z-10"
               style="left: 0px; width: 120px; cursor: grab;"
               title="Arrastra para desplazar la línea de tiempo; usa los bordes laterales para hacer zoom">
            
            <!-- Manija Extremo Izquierdo: Zoom In / Out desde el inicio -->
            <div id="gantt-premiere-handle-left" 
                 class="w-3.5 h-full rounded-l-sm bg-slate-300 hover:bg-blue-500 active:bg-blue-600 cursor-ew-resize flex items-center justify-center transition-colors group/hleft"
                 title="Arrastra hacia adentro para acercar (Zoom In), hacia afuera para alejar (Zoom Out)">
              <div class="w-0.5 h-2 bg-slate-600 group-hover/hleft:bg-white rounded-full pointer-events-none"></div>
            </div>

            <!-- Centro de Agarre / Desplazamiento -->
            <div id="gantt-premiere-thumb-body" 
                 class="flex-1 h-full flex items-center justify-center pointer-events-none gap-0.5 select-none opacity-70">
              <div class="w-0.5 h-1.5 bg-slate-500 rounded-full"></div>
              <div class="w-0.5 h-1.5 bg-slate-500 rounded-full"></div>
              <div class="w-0.5 h-1.5 bg-slate-500 rounded-full"></div>
            </div>

            <!-- Manija Extremo Derecho: Zoom In / Out desde el final -->
            <div id="gantt-premiere-handle-right" 
                 class="w-3.5 h-full rounded-r-sm bg-slate-300 hover:bg-blue-500 active:bg-blue-600 cursor-ew-resize flex items-center justify-center transition-colors group/hright"
                 title="Arrastra hacia adentro para acercar (Zoom In), hacia afuera para alejar (Zoom Out)">
              <div class="w-0.5 h-2 bg-slate-600 group-hover/hright:bg-white rounded-full pointer-events-none"></div>
            </div>

          </div>

        </div>

        <!-- Botón Desplazar Derecha (Paso suave) -->
        <button type="button" 
                id="gantt-nav-btn-right" 
                onclick="scrollGanttTimelineStep(1)" 
                class="w-6 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-slate-600 hover:text-slate-900 active:text-white flex items-center justify-center text-[10px] transition cursor-pointer border border-slate-300 shadow-2xs shrink-0" 
                title="Desplazar línea de tiempo hacia la derecha (▶)">
          <i class="fa-solid fa-chevron-right"></i>
        </button>

        <!-- Botón Ver Todo / Ajustar Proyecto (Fit Entire Project) -->
        <button type="button" 
                id="gantt-nav-btn-fit" 
                onclick="fitGanttTimelineEntireProject()" 
                class="px-2 h-5 rounded bg-white hover:bg-slate-200 active:bg-blue-600 text-[10px] font-mono font-bold text-slate-700 hover:text-blue-700 active:text-white transition flex items-center gap-1 border border-slate-300 shadow-2xs shrink-0 cursor-pointer" 
                title="Ajustar escala para ver la obra completa en pantalla (Fit Timeline)">
          <i class="fa-solid fa-expand text-[9px] text-blue-600"></i> <span>Ajustar</span>
        </button>

      </div>

    </div>

  </div>
`;
}

// ==========================================
// 2. VISTA PROGRAMA FINANCIERO (FORMATO Y COLORES CATÁLOGO BASE)
// ==========================================
function renderFinancialTableView(items, periods, scheduleData, currencySymbol) {
  const { periodTotals, grandTotalObra } = scheduleData;
  const cfg = getScheduleSettings();
  const isJustifyConcepts = Boolean(cfg.justifyConcepts);
  const n = periods.length;

  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);

  // Anchos fijos en px: Clave(80) + Concepto(260) + Unid(48) + Cant(80) + PU(96) + ImpTot(112) = 676px
  const fixedColsWidth = 676;
  const periodColWidth = 144; // 144px por período

  let finTodayLeftPx = fixedColsWidth + 10;
  if (n > 0) {
    const pStart0 = periods[0].startDate;
    const pEndLast = periods[n - 1].endDate;
    if (todayDate <= pStart0) {
      finTodayLeftPx = fixedColsWidth;
    } else if (todayDate >= pEndLast) {
      finTodayLeftPx = fixedColsWidth + (n * periodColWidth);
    } else {
      let foundIdx = 0;
      let fraction = 0;
      for (let i = 0; i < n; i++) {
        const p = periods[i];
        if (todayDate >= p.startDate && todayDate <= p.endDate) {
          foundIdx = i;
          const pDays = Math.max(1, diffDays(p.startDate, p.endDate));
          fraction = diffDays(p.startDate, todayDate) / pDays;
          break;
        } else if (todayDate < p.startDate) {
          foundIdx = Math.max(0, i - 1);
          fraction = 1;
          break;
        }
      }
      finTodayLeftPx = Math.round(fixedColsWidth + (foundIdx * periodColWidth) + (fraction * periodColWidth));
    }
  }

  return `
    <div class="overflow-x-auto overflow-y-auto flex-1 h-full relative bg-white custom-scroll calendario-premiere-scroll" id="financial-table-panel">
      
      <div class="relative min-w-max" id="financial-table-wrapper">
        <table class="w-full text-left border-collapse text-xs text-slate-700 bg-white" id="financial-program-table">
          
          <!-- Encabezado de la Tabla Financiera (Idéntico a Catálogo Base: bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold) -->
          <thead class="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold sticky top-0 z-20 border-b border-slate-200 shadow-2xs">
            <tr>
              <th class="py-2.5 px-3 font-bold w-20 text-center border-r border-slate-200">Clave</th>
              <th class="py-2.5 px-3 font-bold min-w-[260px] border-r border-slate-200">Concepto de Obra</th>
              <th class="py-2.5 px-2 font-bold w-12 text-center border-r border-slate-200">Unid</th>
              <th class="py-2.5 px-3 font-bold w-20 text-right border-r border-slate-200">Cant Total</th>
              <th class="py-2.5 px-3 font-bold w-24 text-right border-r border-slate-200">P.U. ($)</th>
              <th class="py-2.5 px-3 font-bold w-28 text-right border-r border-slate-300 bg-slate-200/70 text-slate-800">Importe Total</th>

              <!-- Columnas de Períodos -->
              ${periods.map((p, pIdx) => `
                <th colspan="2" 
                    id="fin-col-${p.key}"
                    data-period-idx="${pIdx}"
                    data-period-key="${p.key}"
                    data-period-start="${formatDate(p.startDate)}"
                    data-period-end="${formatDate(p.endDate)}"
                    class="py-1 px-2 text-center border-r border-slate-200 font-bold bg-slate-100 text-slate-700 min-w-[144px] w-36">
                  <span class="block text-[10.5px] truncate">${p.label}</span>
                  <div class="flex justify-between text-[9.5px] text-slate-500 font-normal px-1 mt-0.5 font-mono normal-case">
                    <span class="w-1/2 text-center">Cant</span>
                    <span class="w-1/2 text-right">Importe ($)</span>
                  </div>
                </th>
              `).join('')}

              <th class="py-2.5 px-3 font-bold w-28 text-right bg-blue-50 text-blue-800 border-l border-blue-200">Total Programado</th>
              <th class="py-2.5 px-2 font-bold w-16 text-center bg-blue-50 text-blue-800 border-l border-blue-100">% Pond</th>
            </tr>
          </thead>

          <!-- Cuerpo con Conceptos y Partidas (Estilo Catálogo Base) -->
          <tbody class="divide-y divide-slate-100 font-mono text-xs">
            ${items.map(item => {
              const isSelectedRow = String(selectedCalendarioRowId) === String(item.id);
              if (item.isParent) {
                const pctPartida = grandTotalObra > 0 ? ((item.totalImporte || 0) / grandTotalObra) * 100 : 0;
                const isLevel1 = item.level === 1;
                const indentPx = (item.level - 1) * 14 + 10;
                const defaultRowClass = isLevel1 ? 'bg-slate-50 font-bold text-slate-800 border-y-2 border-slate-200' : 'bg-slate-50/60 font-semibold text-slate-800 border-y border-slate-200';
                return `
                  <tr data-fin-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" onfocusin="selectCalendarioRow('${item.id}', event)" class="${item.rowBgColor ? 'font-bold text-slate-800 border-y border-slate-200' : defaultRowClass} ${isSelectedRow ? 'selected-row' : 'hover:bg-slate-100/80'} cursor-pointer transition select-none" ${item.rowBgColor ? `style="background-color: ${item.rowBgColor};"` : ''}>
                    <td class="py-2 px-3 text-center text-blue-700 font-mono font-bold">${item.clave || 'PART'}</td>
                    <td class="py-2 px-3 uppercase tracking-wide ${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} font-sans text-xs" colspan="4" style="padding-left: ${indentPx}px">
                      <div class="flex items-center gap-1.5">
                        <button type="button" onclick="toggleCalendarioNodeGroup('${item.id}', event)" 
                                class="w-5 h-5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 inline-flex items-center justify-center transition cursor-pointer shrink-0" 
                                title="${item.expanded ? 'Agrupar partida (colapsar)' : 'Desagrupar partida (expandir)'}">
                          <i class="fa-solid fa-chevron-${item.expanded ? 'down' : 'right'} text-[10px]"></i>
                        </button>
                        <span class="${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug' : 'truncate'} ${isLevel1 ? 'font-extrabold text-slate-900' : 'font-bold text-slate-800'}">${item.descripcion}</span>
                        ${!item.expanded ? `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[9px] font-mono border border-blue-200 ml-2 shrink-0 font-normal">Agrupado (${item.descendantConceptCount} conc.)</span>` : ''}
                      </div>
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-slate-900 bg-slate-100/80 border-x border-slate-200">${formatCurrency(item.totalImporte, currencySymbol)}</td>

                    <!-- Importes agrupados por período -->
                    ${periods.map(p => {
                      const d = item.periodData ? item.periodData[p.key] : null;
                      const imp = d ? d.importe : 0;
                      return `
                        <td class="py-2 px-1 text-center text-[10px] text-slate-400 border-l border-slate-200">---</td>
                        <td class="py-2 px-2 text-right font-mono text-xs font-bold text-slate-800 border-r border-slate-200">
                          ${imp > 0 ? formatCurrency(imp, currencySymbol) : '<span class="text-slate-400">$0.00</span>'}
                        </td>
                      `;
                    }).join('')}

                    <td class="py-2 px-3 text-right font-mono font-black text-blue-800 bg-blue-50/70 border-l border-blue-100">${formatCurrency(item.totalImporte, currencySymbol)}</td>
                    <td class="py-2 px-2 text-center text-xs font-bold text-blue-700 bg-blue-50/70">${pctPartida.toFixed(1)}%</td>
                  </tr>
                `;
              } else {
                const pctConc = grandTotalObra > 0 ? ((item.importe || 0) / grandTotalObra) * 100 : 0;
                const indentPx = (item.level - 1) * 14 + 16;
                const barColorHex = item.customColor || item.color.bar;
                return `
                  <tr data-fin-row="${item.id}" onclick="selectCalendarioRow('${item.id}', event)" onfocusin="selectCalendarioRow('${item.id}', event)" class="${item.rowBgColor ? '' : 'bg-white hover:bg-slate-50'} ${isSelectedRow ? 'selected-row' : ''} text-xs cursor-pointer transition" ${item.rowBgColor ? `style="background-color: ${item.rowBgColor};"` : ''}>
                    <td class="py-1.5 px-3 text-center font-mono text-blue-700 font-semibold">${item.clave}</td>
                    <td class="py-1.5 px-3 text-slate-800 font-medium ${isJustifyConcepts ? 'whitespace-normal break-words text-justify leading-snug min-w-[260px] max-w-[340px]' : 'truncate max-w-[280px]'} font-sans" title="${item.descripcion}" style="padding-left: ${indentPx}px">
                      <div class="flex items-start gap-1.5 min-w-0">
                        <span class="w-1.5 h-1.5 rounded-full mr-1 mt-1.5 shrink-0" style="background-color: ${barColorHex};"></span>
                        <span class="${isJustifyConcepts ? 'block whitespace-normal break-words text-justify leading-snug' : 'truncate'}">${item.descripcion}</span>
                      </div>
                    </td>
                    <td class="py-1.5 px-2 text-center text-slate-600 font-mono">${item.unidad}</td>
                    <td class="py-1.5 px-3 text-right font-mono text-slate-700">${formatNumber(item.cantidad, 2)}</td>
                    <td class="py-1.5 px-3 text-right font-mono text-slate-600">${formatCurrency(item.precioUnitario, currencySymbol)}</td>
                    <td class="py-1.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/80 border-x border-slate-200">${formatCurrency(item.importe, currencySymbol)}</td>

                    <!-- Celdas Editables por Período (Inputs estilo Catálogo Base) -->
                    ${periods.map(p => {
                      const d = item.periodData ? item.periodData[p.key] : null;
                      const cant = d ? d.cantidad : 0;
                      const imp = d ? d.importe : 0;
                      return `
                        <td class="py-1 px-1 border-l border-slate-100">
                          <input type="number" step="any" min="0" value="${cant > 0 ? cant.toFixed(2) : ''}" 
                                 placeholder="0.00"
                                 onchange="onFinancialCellEdit('${item.id}', '${p.key}', 'cantidad', this.value)"
                                 class="w-14 text-center font-mono bg-transparent hover:bg-white focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-blue-500 rounded-xs px-1 py-0.5 text-xs text-slate-700 outline-none transition">
                        </td>
                        <td class="py-1 px-2 border-r border-slate-200">
                          <input type="number" step="any" min="0" value="${imp > 0 ? imp.toFixed(2) : ''}" 
                                 placeholder="$0.00"
                                 onchange="onFinancialCellEdit('${item.id}', '${p.key}', 'importe', this.value)"
                                 class="w-20 text-right font-mono font-bold text-emerald-700 bg-transparent hover:bg-white focus:bg-white border-b border-transparent hover:border-slate-300 focus:border-blue-500 rounded-xs px-1 py-0.5 text-xs outline-none transition">
                        </td>
                      `;
                    }).join('')}

                    <td class="py-1.5 px-3 text-right font-mono font-bold text-slate-800 bg-blue-50/30 border-l border-blue-100">${formatCurrency(item.importe, currencySymbol)}</td>
                    <td class="py-1.5 px-2 text-center text-[11px] font-mono text-slate-600 bg-blue-50/30">${pctConc.toFixed(2)}%</td>
                  </tr>
                `;
              }
            }).join('')}
          </tbody>

          <!-- Totales Físicos y Financieros por Período (Estilo Pie de Tabla de Catálogo Base: bg-slate-50 border-t-2 border-slate-300) -->
          <tfoot class="bg-slate-50 text-slate-800 font-mono sticky bottom-0 z-20 border-t-2 border-slate-300 shadow-md">
            
            <!-- Renglón 1: Total Período ($) -->
            <tr class="bg-slate-50 font-bold border-b border-slate-200">
              <td colspan="6" class="py-2 px-3 font-bold text-right uppercase text-xs text-slate-700 font-sans">
                Total Período ($):
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-2 px-2 text-right font-bold text-slate-900 border-r border-slate-200 font-mono">
                    ${formatCurrency(tot ? tot.importe : 0, currencySymbol)}
                  </td>
                `;
              }).join('')}
              <td class="py-2 px-3 text-right font-black text-emerald-700 bg-emerald-50 border-l border-emerald-200">${formatCurrency(grandTotalObra, currencySymbol)}</td>
              <td class="py-2 px-2 text-center text-xs font-bold text-emerald-700 bg-emerald-50">100%</td>
            </tr>

            <!-- Renglón 2: % Avance Período -->
            <tr class="bg-white font-bold border-b border-slate-200">
              <td colspan="6" class="py-1.5 px-3 font-bold text-right uppercase text-xs text-slate-600 font-sans">
                % Avance Período:
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-1.5 px-2 text-right font-bold text-blue-700 border-r border-slate-200 font-mono">
                    ${tot ? tot.pctPeriodo.toFixed(2) : '0.00'}%
                  </td>
                `;
              }).join('')}
              <td class="py-1.5 px-3 text-right font-bold text-blue-700 bg-blue-50/50 border-l border-blue-100">100.00%</td>
              <td class="py-1.5 px-2 text-center text-xs font-bold text-slate-400 bg-blue-50/50">---</td>
            </tr>

            <!-- Renglón 3: Total Acumulado ($) -->
            <tr class="bg-slate-50 font-bold border-b border-slate-200">
              <td colspan="6" class="py-2 px-3 font-bold text-right uppercase text-xs text-slate-700 font-sans">
                Total Acumulado ($):
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-2 px-2 text-right font-bold text-emerald-700 border-r border-slate-200 font-mono">
                    ${formatCurrency(tot ? tot.importeAcumulado : 0, currencySymbol)}
                  </td>
                `;
              }).join('')}
              <td class="py-2 px-3 text-right font-black text-emerald-700 bg-emerald-50 border-l border-emerald-200">${formatCurrency(grandTotalObra, currencySymbol)}</td>
              <td class="py-2 px-2 text-center text-xs font-bold text-slate-400 bg-emerald-50">---</td>
            </tr>

            <!-- Renglón 4: % Avance Acumulado (Curva S) -->
            <tr class="bg-white font-bold">
              <td colspan="6" class="py-1.5 px-3 font-bold text-right uppercase text-xs text-slate-700 font-sans">
                % Avance Acumulado:
              </td>
              ${periods.map(p => {
                const tot = periodTotals[p.key];
                return `
                  <td colspan="2" class="py-1.5 px-2 text-right font-bold text-indigo-700 border-r border-slate-200 font-mono">
                    ${tot ? tot.pctAcumulado.toFixed(2) : '0.00'}%
                  </td>
                `;
              }).join('')}
              <td class="py-1.5 px-3 text-right font-black text-indigo-700 bg-indigo-50/60 border-l border-indigo-100">100.00%</td>
              <td class="py-1.5 px-2 text-center text-xs font-bold text-indigo-700 bg-indigo-50/60">100%</td>
            </tr>

          </tfoot>
        </table>

        <!-- LÍNEA Y PIN DE DÍA ACTUAL / CORTE EN PROGRAMA FINANCIERO -->
        <div id="financial-today-line-container" 
             class="absolute top-0 bottom-0 z-30 pointer-events-none"
             style="left: ${finTodayLeftPx}px;"
             data-today-date="${todayStr}">
          
          <!-- Pin / Marcador Superior Arrastrable -->
          <div id="financial-today-pin" 
               class="sticky top-1 -translate-x-1/2 pointer-events-auto cursor-ew-resize z-40 select-none group flex flex-col items-center"
               title="Día de Hoy / Fecha de Corte: ${todayStr}&#10;• Arrastra horizontalmente para mover a días anteriores o futuros&#10;• Doble clic para volver al día real"
               data-today-date="${todayStr}">
            
            <div class="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 active:bg-rose-400 text-white text-[9px] font-black uppercase tracking-wider shadow-md border border-rose-300 flex items-center gap-1 transition-transform group-hover:scale-105">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              <span>CORTE</span>
            </div>
            <div class="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-rose-600 -mt-0.5 shadow-sm"></div>
          </div>

          <!-- Línea Vertical que atraviesa todas las filas de la tabla -->
          <div class="w-0.5 h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] -translate-x-1/2 opacity-90"></div>

          <!-- Etiqueta Flotante en la Base con la fecha de corte -->
          <div class="sticky bottom-2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-rose-600 border border-rose-700 text-white text-[9px] font-mono font-bold pointer-events-none shadow-sm">
            ${todayStr}
          </div>

        </div>

      </div>
    </div>
  `;
}

// ==========================================
// 3. VISTA CURVA "S" Y FLUJO DE EFECTIVO (FORMATO Y COLORES CATÁLOGO BASE)
// ==========================================
function renderCurvaSView(periods, scheduleData, currencySymbol) {
  const { periodTotals, grandTotalObra } = scheduleData;
  const n = periods.length;

  if (n === 0) {
    return `<div class="p-8 text-center text-slate-400">No hay períodos para generar la curva.</div>`;
  }

  // Generar puntos SVG para la Curva S (Ancho 960 x Alto 380 con margen inferior de 100px para fechas totalmente verticales)
  const W = 960;
  const H = 380;
  const padX = 70;
  const padTop = 40;
  const padBottom = 100;
  const chartW = W - padX * 2;
  const chartH = H - padTop - padBottom; // 240px de altura útil para la curva

  // Puntos del gráfico
  const points = [];
  periods.forEach((p, idx) => {
    const tot = periodTotals[p.key];
    const pct = tot ? tot.pctAcumulado : 0;
    const x = padX + (idx / Math.max(1, n - 1)) * chartW;
    const y = padTop + chartH - (pct / 100) * chartH;
    points.push({
      x,
      y,
      pct,
      label: p.label,
      fullLabel: p.fullLabel || p.label,
      shortLabel: p.shortLabel || p.label,
      importe: tot ? tot.importeAcumulado : 0,
      impMes: tot ? tot.importe : 0,
      pctPeriodo: tot ? tot.pctPeriodo : 0
    });
  });

  const polylineStr = points.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  const areaStr = `${points[0].x},${padTop + chartH} ` + polylineStr + ` ${points[points.length - 1].x},${padTop + chartH}`;

  // Cálculo de posición de la línea de Hoy / Corte en la Curva S
  const todayStr = getGanttTodayDate();
  const todayDate = parseDate(todayStr);
  const pStart0 = periods[0].startDate;
  const pEndLast = periods[n - 1].endDate;
  const totalDaysCurva = Math.max(1, diffDays(pStart0, pEndLast) + 1);
  const daysOffset = diffDays(pStart0, todayDate);
  const fraction = Math.max(0, Math.min(1, daysOffset / (totalDaysCurva - 1)));
  const todayX = padX + fraction * chartW;
  const night = isNightMode();
  const svgGridStroke = night ? '#334155' : '#cbd5e1';
  const svgAxisTextPrimary = night ? '#cbd5e1' : '#334155';
  const svgAxisTextSecondary = night ? '#94a3b8' : '#475569';
  const svgBaseLineStroke = night ? '#475569' : '#94a3b8';
  const svgCurveStroke = night ? '#3b82f6' : '#2563eb';
  const svgPointFill = night ? '#0f172a' : '#ffffff';
  const svgBadgeFill = night ? '#1e293b' : '#ffffff';
  const svgBadgeStroke = night ? '#60a5fa' : '#2563eb';
  const svgBadgeText = night ? '#93c5fd' : '#1d4ed8';
  const svgTickStroke = night ? '#64748b' : '#64748b';

  return `
    <div class="flex-1 overflow-auto p-4 sm:p-6 space-y-6 bg-white text-slate-800 custom-scroll calendario-premiere-scroll" id="curva-s-panel">
      
      <!-- Encabezado de la Curva S -->
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 class="font-extrabold text-sm text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-chart-line text-blue-600"></i> Curva "S" de Inversión y Avance Programado
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">
            Proyección acumulada de erogaciones y porcentaje de avance físico/financiero a lo largo del tiempo.
          </p>
        </div>

        <div class="flex items-center gap-4 text-xs font-semibold">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-blue-600 inline-block"></span>
            <span class="text-slate-700">Avance Acumulado (%)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-md bg-amber-500 inline-block"></span>
            <span class="text-slate-700">Erogación del Período ($)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-rose-600 inline-block"></span>
            <span class="text-rose-700 font-bold">Corte (${todayStr})</span>
          </div>
        </div>
      </div>

      <!-- Gráfico SVG Interactivo con Fondo Claro estilo Catálogo Base -->
      <div class="bg-slate-50/70 border border-slate-200 rounded-xl p-4 shadow-2xs relative overflow-hidden">
        <svg viewBox="0 0 ${W} ${H}" class="w-full h-84 sm:h-96 select-none" id="curva-s-svg">
          
          <defs>
            <linearGradient id="curvaGradientGlobal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${svgCurveStroke}" stop-opacity="${night ? '0.32' : '0.22'}"/>
              <stop offset="100%" stop-color="${svgCurveStroke}" stop-opacity="${night ? '0.04' : '0.02'}"/>
            </linearGradient>
          </defs>

          <!-- Líneas de cuadrícula horizontal con porcentajes y montos en ambos ejes (0%, 25%, 50%, 75%, 100%) -->
          ${[0, 25, 50, 75, 100].map(pct => {
            const y = padTop + chartH - (pct / 100) * chartH;
            return `
              <line x1="${padX}" y1="${y}" x2="${padX + chartW}" y2="${y}" stroke="${svgGridStroke}" stroke-dasharray="3,3" stroke-width="1"/>
              <!-- Eje Y Izquierdo: Porcentaje destacado -->
              <text x="${padX - 12}" y="${y + 4}" fill="${svgAxisTextPrimary}" font-size="11.5" font-family="monospace" font-weight="bold" text-anchor="end">${pct}%</text>
              <!-- Eje Y Derecho: Monto de Inversión Acumulada estimada -->
              <text x="${padX + chartW + 12}" y="${y + 4}" fill="${svgAxisTextSecondary}" font-size="10" font-family="monospace" text-anchor="start">${formatCurrency((pct / 100) * grandTotalObra, currencySymbol)}</text>
            `;
          }).join('')}

          <!-- Eje horizontal base -->
          <line x1="${padX}" y1="${padTop + chartH}" x2="${padX + chartW}" y2="${padTop + chartH}" stroke="${svgBaseLineStroke}" stroke-width="1.5"/>

          <!-- Barras de Inversión del Período -->
          ${periods.map((p, idx) => {
            const tot = periodTotals[p.key];
            const imp = tot ? tot.importe : 0;
            const maxImp = scheduleData.picoMonto > 0 ? scheduleData.picoMonto : 1;
            const barH = (imp / maxImp) * (chartH * 0.7);
            const x = padX + (idx / Math.max(1, n - 1)) * chartW - 14;
            const y = padTop + chartH - barH;
            return `
              <rect x="${x}" y="${y}" width="28" height="${barH}" fill="#f59e0b" opacity="0.85" rx="4">
                <title>${p.fullLabel || p.label}: ${formatCurrency(imp, currencySymbol)} (${tot ? tot.pctPeriodo.toFixed(1) : 0}%)</title>
              </rect>
            `;
          }).join('')}

          <!-- Área sombreada Curva S -->
          <polygon points="${areaStr}" fill="url(#curvaGradientGlobal)"/>

          <!-- Línea de Curva S -->
          <polyline fill="none" stroke="${svgCurveStroke}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="${polylineStr}"/>

          <!-- Puntos y Badges de Porcentaje Claramente Visibles -->
          ${points.map(pt => `
            <g class="cursor-pointer">
              <title>${pt.fullLabel}&#10;• Avance Acumulado: ${pt.pct.toFixed(2)}% (${formatCurrency(pt.importe, currencySymbol)})&#10;• Erogación Período: ${formatCurrency(pt.impMes, currencySymbol)} (${pt.pctPeriodo.toFixed(2)}%)</title>
              
              <!-- Círculo del punto en la curva -->
              <circle cx="${pt.x}" cy="${pt.y}" r="5.5" fill="${svgPointFill}" stroke="${svgCurveStroke}" stroke-width="3" />
              
              <!-- Badge flotante con porcentaje visible -->
              <g transform="translate(${pt.x}, ${pt.y - 18})" class="pointer-events-none select-none">
                <rect x="-24" y="-11" width="48" height="17" rx="5" 
                      fill="${svgBadgeFill}" stroke="${svgBadgeStroke}" stroke-width="1.5" 
                      filter="drop-shadow(0 1px 2px rgba(0,0,0,0.22))" />
                <text x="0" y="1" fill="${svgBadgeText}" font-size="10.5" font-family="monospace" font-weight="900" 
                      text-anchor="middle" dominant-baseline="middle">
                  ${pt.pct.toFixed(1)}%
                </text>
              </g>
            </g>
          `).join('')}

          <!-- Eje X: Marcas y Fechas TOTALMENTE VERTICALES (-90°) -->
          ${points.map((pt, idx) => {
            const isDense = n > 24;
            const showLabel = !isDense || (idx % 2 === 0) || (idx === n - 1);
            return `
              <!-- Marca de graduación en el eje X -->
              <line x1="${pt.x}" y1="${padTop + chartH}" x2="${pt.x}" y2="${padTop + chartH + 6}" stroke="${svgTickStroke}" stroke-width="1.5" />
              
              ${showLabel ? `
                <!-- Etiqueta de Fecha / Período Totalmente Vertical (-90°) -->
                <g transform="translate(${pt.x}, ${padTop + chartH + 12}) rotate(-90)">
                  <text x="-4" y="0" 
                        fill="${svgAxisTextPrimary}" font-size="10" font-family="monospace" font-weight="bold" 
                        text-anchor="end" dominant-baseline="central" class="select-none">
                    ${pt.label}
                  </text>
                </g>
              ` : ''}
            `;
          }).join('')}

          <!-- LÍNEA Y PIN DE CORTE EN CURVA S (INTERACTIVA Y ARRASTRABLE) -->
          <g id="curva-s-today-group" class="cursor-ew-resize select-none" data-today-date="${todayStr}">
            <!-- Línea vertical punteada -->
            <line id="curva-s-today-line" 
                  x1="${todayX.toFixed(1)}" y1="${padTop - 10}" 
                  x2="${todayX.toFixed(1)}" y2="${padTop + chartH + 8}" 
                  stroke="#e11d48" stroke-width="2.5" stroke-dasharray="5,3" />
            
            <!-- Pin / Marcador Superior Arrastrable (CORTE / HOY) -->
            <g id="curva-s-today-pin" class="cursor-ew-resize group" transform="translate(${todayX.toFixed(1)}, ${padTop - 12})">
              <title>Día de Hoy / Fecha de Corte: ${todayStr}&#10;• Arrastra para mover la fecha de corte a días anteriores o futuros&#10;• Doble clic para volver al día real</title>
              <rect x="-24" y="-18" width="48" height="18" rx="4" fill="#e11d48" stroke="#fda4af" stroke-width="1.5" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.25))" />
              <text x="0" y="-8.5" fill="#ffffff" font-size="9" font-family="sans-serif" font-weight="900" text-anchor="middle" dominant-baseline="middle">
                CORTE
              </text>
              <polygon points="-5,0 5,0 0,6" fill="#e11d48" />
            </g>

            <!-- Badge de Fecha Flotante en la Base de la Línea de Corte -->
            <g id="curva-s-today-badge" transform="translate(${todayX.toFixed(1)}, ${padTop + chartH + 16})">
              <rect x="-32" y="0" width="64" height="17" rx="4" fill="#e11d48" stroke="#be123c" stroke-width="1" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.2))" />
              <text x="0" y="9" fill="#ffffff" font-size="9.5" font-family="monospace" font-weight="bold" text-anchor="middle" dominant-baseline="middle">
                ${todayStr}
              </text>
            </g>
          </g>

        </svg>
      </div>

      <!-- Tabla Resumen Ejecutivo de Erogaciones (Formato y colores de Catálogo Base) -->
      <div class="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <table class="w-full text-left text-xs font-mono">
          <thead class="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
            <tr>
              <th class="p-2.5">Período de Obra</th>
              <th class="p-2.5 text-right">Erogación Período ($)</th>
              <th class="p-2.5 text-center">% Período</th>
              <th class="p-2.5 text-right">Inversión Acumulada ($)</th>
              <th class="p-2.5 text-center">% Acumulado</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-slate-700">
            ${periods.map(p => {
              const tot = periodTotals[p.key];
              const curvaRowKey = `curva_${p.key}`;
              const isSelectedCurva = String(selectedCalendarioRowId) === curvaRowKey;
              return `
                <tr data-curva-row="${curvaRowKey}" onclick="selectCalendarioRow('${curvaRowKey}', event)" class="${isSelectedCurva ? 'selected-row' : 'hover:bg-slate-50'} cursor-pointer transition">
                  <td class="p-2.5 font-bold text-slate-800 font-sans">${p.fullLabel || p.label}</td>
                  <td class="p-2.5 text-right text-amber-700 font-bold">${formatCurrency(tot ? tot.importe : 0, currencySymbol)}</td>
                  <td class="p-2.5 text-center text-slate-600">${tot ? tot.pctPeriodo.toFixed(2) : 0}%</td>
                  <td class="p-2.5 text-right font-bold text-emerald-700">${formatCurrency(tot ? tot.importeAcumulado : 0, currencySymbol)}</td>
                  <td class="p-2.5 text-center font-bold text-blue-700">${tot ? tot.pctAcumulado.toFixed(2) : 0}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

    </div>
  `;
}

// ==========================================
// CONTROLADORES DE EVENTOS DE USUARIO
// ==========================================

function isAdvancedCalendarioAllowed() {
  const planId = resolveWorkspacePlanContext()?.planId || 'free';
  return planId === 'plus' || planId === 'pro';
}

export function setCalendarioViewMode(mode) {
  if ((mode === 'financiero' || mode === 'curva_s') && !isAdvancedCalendarioAllowed()) {
    showToast('🔒 El Programa Financiero y la Curva "S" están disponibles desde el Plan Plus. Tu Plan Gratuita incluye el Diagrama de Gantt básico.', 'warning');
    if (typeof window !== 'undefined') window.openSubscriptionModal?.();
    return;
  }
  saveScheduleSettings({ viewMode: mode });
  renderCalendarioObra();
}

export function setCalendarioTimeScale(scale) {
  saveScheduleSettings({ scale });
  renderCalendarioObra();
}

export function filterCalendarioPartida(partida) {
  saveScheduleSettings({ selectedPartida: partida });
  renderCalendarioObra();
}

export function changeProjectStartDate(newDateStr) {
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  if (!newDateStr) return;
  shiftProjectScheduleStart(newDateStr);
  showToast(`Fecha de inicio de obra actualizada a: ${newDateStr}`);
  renderCalendarioObra();
}

export function changeGanttTodayDateAction(newDateStr) {
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  if (!newDateStr) return;
  setGanttTodayDate(newDateStr);
  showToast(`Fecha de hoy / corte establecida en: ${newDateStr}`);
  renderCalendarioObra();
}

export function resetGanttTodayDateAction(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  if (!guardTabUnlocked('calendario')) return;
  resetGanttTodayDate();
  showToast(`Fecha de corte restablecida al día de hoy real (${formatDate(new Date())})`);
  renderCalendarioObra();
}

export function onGanttDateInput(conceptId, startDateStr, durationDays) {
  selectedCalendarioRowId = String(conceptId);
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  const dur = Math.max(3, parseInt(durationDays, 10) || 3);
  const res = updateConceptDatesInModel(conceptId, startDateStr, dur);
  if (res && res.clampedByPredecessor) {
    const clavesTxt = (res.blockingClaves && res.blockingClaves.length > 0) ? res.blockingClaves.join(', ') : 'su predecesora';
    showToast(`🔒 Inicio ajustado a ${res.minAllowedDate}: no puede iniciar antes de que termine ${clavesTxt}.`, 'error');
  } else if (res && res.cascadedCount > 0) {
    showToast(`Fecha actualizada • ${res.cascadedCount} concepto(s) dependiente(s) actualizados en cascada.`);
  }
  renderCalendarioObra();
}

export function onGanttDurationInput(conceptId, startDateStr, durationDays) {
  selectedCalendarioRowId = String(conceptId);
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  const dur = Math.max(3, parseInt(durationDays, 10) || 3);
  const res = updateConceptDatesInModel(conceptId, startDateStr, dur);
  if (res && res.cascadedCount > 0) {
    showToast(`Duración actualizada (${dur}d) • ${res.cascadedCount} concepto(s) dependiente(s) recorridos automáticamente.`);
  }
  renderCalendarioObra();
}

export function onFinancialCellEdit(conceptId, periodKey, field, value) {
  selectedCalendarioRowId = String(conceptId);
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);
  const periods = generateTimePeriods(rawItems, cfg.scale, cfg.startDate);

  updateConceptPeriodInModel(conceptId, periodKey, field, value, periods);
  renderCalendarioObra();
}

export function triggerAutoDistributeSchedule() {
  if (!guardTabUnlocked('calendario')) return;
  const cfg = getScheduleSettings();
  autoDistributeAllSchedule(cfg.startDate);
  showToast('Cronograma re-programado secuencialmente con éxito.');
  renderCalendarioObra();
}

export function exportCurrentScheduleExcel() {
  if (!currentScheduleData) {
    showToast('No hay datos de calendario cargados para exportar.', false);
    return;
  }
  exportScheduleToExcel(currentScheduleData, state.settings);
}

export function printCalendarioObra() {
  printCalendarioObraFormat();
}

// ------------------------------------------
// AGRUPAR / DESAGRUPAR (PLEGAR / DESPLEGAR)
// ------------------------------------------
export function toggleCalendarioNodeGroup(nodeId, event) {
  if (event) event.stopPropagation();
  toggleCalendarioNodeExpand(nodeId);
  renderCalendarioObra();
}

export function expandAllCalendarioGroups() {
  expandAllCalendarioNodes();
  showToast('Se desagruparon todas las partidas y conceptos de obra.');
  renderCalendarioObra();
}

export function collapseAllCalendarioGroups() {
  collapseAllCalendarioNodes();
  showToast('Se agruparon todas las partidas en niveles ejecutivos.');
  renderCalendarioObra();
}

export function toggleCalendarioJustifyText() {
  const cfg = getScheduleSettings();
  const nextState = !Boolean(cfg.justifyConcepts);
  saveScheduleSettings({ justifyConcepts: nextState });
  renderCalendarioObra();
  showToast(
    nextState
      ? 'Justificación de textos activada en la columna Conceptos de Obra.'
      : 'Vista compacta en 1 línea activada para Conceptos de Obra.',
    'info'
  );
  return nextState;
}

export function syncGanttJustifiedRowHeights() {
  const cfg = getScheduleSettings();
  if (!cfg.justifyConcepts) return;
  const leftPanel = document.getElementById('gantt-left-panel');
  const rightPanel = document.getElementById('gantt-timeline-panel');
  if (!leftPanel || !rightPanel || typeof leftPanel.querySelectorAll !== 'function') return;

  const leftRows = leftPanel.querySelectorAll('[data-gantt-left-row]');
  leftRows.forEach(leftEl => {
    const rowId = leftEl.getAttribute && leftEl.getAttribute('data-gantt-left-row');
    if (!rowId) return;
    const h = leftEl.offsetHeight;
    if (h && h >= 40) {
      const rightEl = rightPanel.querySelector(`[data-gantt-right-row="${rowId}"]`);
      if (rightEl && rightEl.style) {
        rightEl.style.height = `${h}px`;
      }
    }
  });
}

// ------------------------------------------
// ZOOM DEL DIAGRAMA DE GANTT (ACERCAR / ALEJAR)
// ------------------------------------------
export function changeGanttZoom(action) {
  const cfg = getScheduleSettings();
  const ZOOM_STEPS = [18, 24, 28, 34, 44, 56, 72, 92];
  let current = cfg.dayWidth || 34;

  if (action === 'reset') {
    current = 34;
  } else if (action === 'in') {
    const next = ZOOM_STEPS.find(s => s > current);
    current = next || ZOOM_STEPS[ZOOM_STEPS.length - 1];
  } else if (action === 'out') {
    const prev = [...ZOOM_STEPS].reverse().find(s => s < current);
    current = prev || ZOOM_STEPS[0];
  } else if (typeof action === 'number') {
    current = Math.max(16, Math.min(120, action));
  }

  saveScheduleSettings({ dayWidth: current });
  renderCalendarioObra();
}

// ------------------------------------------
// DIVISOR ARRASTRABLE (SPLITTER ENTRE CONCEPTOS Y GANTT)
// ------------------------------------------
export function initGanttResizer() {
  const resizer = document.getElementById('gantt-resizer');
  const leftPanel = document.getElementById('gantt-left-panel');
  const rootContainer = document.getElementById('gantt-root-container');
  if (!resizer || !leftPanel || !rootContainer || !leftPanel.style) return;

  const cfg = getScheduleSettings();
  const savedW = cfg.panelWidth || parseInt(localStorage.getItem('calendario_gantt_split_w'), 10) || 460;
  leftPanel.style.width = `${savedW}px`;

  let isDragging = false;
  let startX = 0;
  let startW = savedW;

  function onStart(clientX) {
    isDragging = true;
    startX = clientX;
    startW = leftPanel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('bg-blue-600', 'ring-2', 'ring-blue-400');
  }

  function onMove(clientX) {
    if (!isDragging) return;
    const dx = clientX - startX;
    const containerW = rootContainer.clientWidth;
    const minW = 260;
    const maxW = Math.max(300, Math.floor(containerW * 0.75));
    const newW = Math.max(minW, Math.min(maxW, startW + dx));
    leftPanel.style.width = `${newW}px`;
    syncGanttJustifiedRowHeights();
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizer.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-400');
    const finalW = leftPanel.offsetWidth;
    saveScheduleSettings({ panelWidth: finalW });
    localStorage.setItem('calendario_gantt_split_w', finalW);
    syncGanttJustifiedRowHeights();
  }

  // Eventos de Mouse
  resizer.onmousedown = (e) => {
    e.preventDefault();
    onStart(e.clientX);

    function mouseMoveHandler(ev) {
      onMove(ev.clientX);
    }
    function mouseUpHandler() {
      onEnd();
      window.removeEventListener('mousemove', mouseMoveHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
    }
    window.addEventListener('mousemove', mouseMoveHandler);
    window.addEventListener('mouseup', mouseUpHandler);
  };

  // Eventos Touch para pantallas táctiles
  resizer.ontouchstart = (e) => {
    if (e.touches && e.touches.length > 0) {
      onStart(e.touches[0].clientX);
    }
  };
  resizer.ontouchmove = (e) => {
    if (e.touches && e.touches.length > 0) {
      onMove(e.touches[0].clientX);
    }
  };
  resizer.ontouchend = () => {
    onEnd();
  };
}

// ------------------------------------------
// SCROLL SINCRONIZADO VERTICAL
// ------------------------------------------
export function syncGanttScroll() {
  const leftPanel = document.getElementById('gantt-left-panel');
  const rightPanel = document.getElementById('gantt-timeline-panel');
  if (!leftPanel || !rightPanel) return;

  let isSyncingLeft = false;
  let isSyncingRight = false;

  leftPanel.onscroll = () => {
    if (!isSyncingLeft) {
      isSyncingRight = true;
      rightPanel.scrollTop = leftPanel.scrollTop;
    }
    isSyncingLeft = false;
  };

  rightPanel.onscroll = () => {
    if (!isSyncingRight) {
      isSyncingLeft = true;
      leftPanel.scrollTop = rightPanel.scrollTop;
    }
    isSyncingRight = false;
  };
}

// ------------------------------------------
// ARRASTRE Y REDIMENSIONAMIENTO DE BARRAS DE GANTT (MOVER, ESTIRAR Y REDUCIR)
// ------------------------------------------
export function initGanttBarDrag() {
  if (isTabLocked('calendario')) return;
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  if (!timelinePanel || !timelinePanel.querySelectorAll) return;

  const cfg = getScheduleSettings();
  let minDate = null;
  let maxDate = null;
  const rawItems = extractScheduleItems(state.treeData);
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, cfg.dayWidth);
  const pxPerDay = scaleData.pxPerDay || 34;

  const bars = timelinePanel.querySelectorAll('.gantt-bar-concept');
  if (!bars || bars.length === 0) return;

  let tooltip = typeof document !== 'undefined' ? document.getElementById('gantt-drag-tooltip') : null;
  if (!tooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    tooltip = document.createElement('div');
    tooltip.id = 'gantt-drag-tooltip';
    tooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-blue-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(tooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!tooltip || !tooltip.style) return;
    tooltip.innerHTML = textHtml;
    tooltip.style.left = `${clientX + 14}px`;
    tooltip.style.top = `${clientY - 42}px`;
  }

  bars.forEach(bar => {
    if (!bar) return;

    bar.onmousedown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.stopPropagation) e.stopPropagation();
      if (e.preventDefault) e.preventDefault();

      const conceptId = bar.getAttribute('data-concept-id');
      const origStartStr = bar.getAttribute('data-start-date');
      const origDur = Math.max(3, parseInt(bar.getAttribute('data-duration'), 10) || 3);
      const clave = bar.getAttribute('data-clave') || 'CONC';
      const minStartStr = bar.getAttribute('data-min-start-date') || '';
      const predClavesStr = bar.getAttribute('data-pred-claves') || '';
      const origStartDate = parseDate(origStartStr);

      // Si está activo el Modo Vincular con Clic en Barras: conectar Predecesora -> Dependiente
      if (calendarioLinkClickMode) {
        handleCalendarioBarLinkClick(conceptId, clave);
        return;
      }

      const target = e.target || bar;
      const targetClass = (target.className && typeof target.className === 'string') ? target.className : '';
      const isLeft = targetClass.includes('gantt-handle-left');
      const isRight = targetClass.includes('gantt-handle-right');
      const mode = isLeft ? 'resize-left' : (isRight ? 'resize-right' : 'move');

      const startX = e.clientX || 0;
      const origLeftPx = parseFloat(bar.style.left) || 0;
      const origWidthPx = parseFloat(bar.style.width) || (origDur * pxPerDay);

      let currentDayDelta = 0;
      let finalStartDateStr = origStartStr;
      let finalDur = origDur;
      let wasBlockedByPred = false;

      if (document.body && document.body.style) {
        document.body.style.userSelect = 'none';
        document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
      }

      if (bar.classList && bar.classList.add) {
        if (mode === 'move') {
          bar.classList.add('ring-2', 'ring-white', 'shadow-2xl', 'opacity-90');
        } else {
          bar.classList.add('ring-2', 'ring-amber-400', 'shadow-2xl');
        }
      }

      if (tooltip && tooltip.classList) {
        tooltip.classList.remove('hidden');
      }

      function onMouseMove(ev) {
        const dx = (ev.clientX || 0) - startX;
        const dayDelta = Math.round(dx / pxPerDay);
        currentDayDelta = dayDelta;

        if (mode === 'move') {
          let newStart = addDays(origStartDate, dayDelta);
          let effectiveDelta = dayDelta;
          wasBlockedByPred = false;

          if (minStartStr) {
            const minStartDt = parseDate(minStartStr);
            if (diffDays(minStartDt, newStart) < 0) {
              newStart = minStartDt;
              effectiveDelta = diffDays(origStartDate, minStartDt);
              wasBlockedByPred = true;
            }
          }

          const newEnd = addDays(newStart, origDur - 1);
          finalStartDateStr = formatDate(newStart);
          finalDur = origDur;

          bar.style.left = `${origLeftPx + (effectiveDelta * pxPerDay)}px`;
          updateTooltip(ev.clientX, ev.clientY, wasBlockedByPred ? `
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <i class="fa-solid fa-lock text-[10px]"></i> Inicio Bloqueado: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-amber-200">
              Debe terminar primero <strong>${predClavesStr || 'predecesora'}</strong> (mín. ${minStartStr})
            </div>
          ` : `
            <div class="font-bold text-blue-300 flex items-center gap-1.5">
              <i class="fa-solid fa-arrows-left-right text-[10px]"></i> Mover Período: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-slate-300">
              ${finalStartDateStr} <span class="text-slate-500">→</span> ${formatDate(newEnd)} <span class="text-amber-400 font-bold">(${origDur}d)</span>
            </div>
          `);
        } else if (mode === 'resize-right') {
          // Duración mínima estricta de 3 días
          const newDur = Math.max(3, origDur + dayDelta);
          finalStartDateStr = origStartStr;
          finalDur = newDur;
          const newEnd = addDays(origStartDate, newDur - 1);

          bar.style.width = `${newDur * pxPerDay}px`;
          updateTooltip(ev.clientX, ev.clientY, `
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <i class="fa-solid fa-up-right-and-down-left-from-center text-[10px]"></i> Duración: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-slate-300">
              ${origStartStr} <span class="text-slate-500">→</span> ${formatDate(newEnd)} <span class="text-amber-400 font-bold">(${newDur} días)</span>
            </div>
          `);
        } else if (mode === 'resize-left') {
          // Cambiar inicio por extremo izquierdo (duración mínima >= 3 días y respetando predecesoras)
          const maxLeftDelta = origDur - 3;
          let cappedDelta = Math.min(dayDelta, maxLeftDelta);
          wasBlockedByPred = false;

          if (minStartStr) {
            const minAllowedDelta = diffDays(origStartDate, parseDate(minStartStr));
            if (cappedDelta < minAllowedDelta) {
              cappedDelta = minAllowedDelta;
              wasBlockedByPred = true;
            }
          }

          const newStart = addDays(origStartDate, cappedDelta);
          const newDur = Math.max(3, origDur - cappedDelta);
          finalStartDateStr = formatDate(newStart);
          finalDur = newDur;
          const newEnd = addDays(newStart, newDur - 1);

          bar.style.left = `${origLeftPx + (cappedDelta * pxPerDay)}px`;
          bar.style.width = `${newDur * pxPerDay}px`;
          updateTooltip(ev.clientX, ev.clientY, wasBlockedByPred ? `
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <i class="fa-solid fa-lock text-[10px]"></i> Inicio Bloqueado: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-amber-200">
              Depende de terminar <strong>${predClavesStr || 'predecesora'}</strong> (${minStartStr})
            </div>
          ` : `
            <div class="font-bold text-emerald-300 flex items-center gap-1.5">
              <i class="fa-solid fa-calendar-day text-[10px]"></i> Inicio: <span class="text-white">${clave}</span>
            </div>
            <div class="text-[11px] mt-0.5 text-slate-300">
              ${finalStartDateStr} <span class="text-slate-500">→</span> ${formatDate(newEnd)} <span class="text-emerald-400 font-bold">(${newDur} días)</span>
            </div>
          `);
        }
      }

      function onMouseUp() {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }

        if (document.body && document.body.style) {
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        }

        if (bar.classList && bar.classList.remove) {
          bar.classList.remove('ring-2', 'ring-white', 'ring-amber-400', 'shadow-2xl', 'opacity-90');
        }

        if (tooltip && tooltip.classList) {
          tooltip.classList.add('hidden');
        }

        if (wasBlockedByPred && finalStartDateStr === origStartStr && finalDur === origDur) {
          showToast(`🔒 ${clave} no puede iniciar antes de ${minStartStr} (depende de terminar ${predClavesStr || 'su predecesora'}).`, 'error');
          renderCalendarioObra();
          return;
        }

        if (currentDayDelta !== 0 || finalDur !== origDur || finalStartDateStr !== origStartStr) {
          const res = updateConceptDatesInModel(conceptId, finalStartDateStr, finalDur);
          if (res && res.cascadedCount > 0) {
            showToast(`Concepto ${clave} actualizado (${finalDur}d) • ${res.cascadedCount} dependiente(s) recorridos en cascada.`);
          } else {
            showToast(`Concepto ${clave} actualizado: ${finalStartDateStr} (${finalDur} días)`);
          }
          renderCalendarioObra();
        }
      }

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }
    };

    // Soporte táctil (Touch)
    bar.ontouchstart = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const startX = touch.clientX;
      const conceptId = bar.getAttribute('data-concept-id');
      const origStartStr = bar.getAttribute('data-start-date');
      const origDur = Math.max(3, parseInt(bar.getAttribute('data-duration'), 10) || 3);
      const clave = bar.getAttribute('data-clave') || 'CONC';
      const origStartDate = parseDate(origStartStr);
      const origLeftPx = parseFloat(bar.style.left) || 0;

      let currentDayDelta = 0;
      let finalStartDateStr = origStartStr;
      let finalDur = origDur;

      function onTouchMove(ev) {
        if (!ev.touches || ev.touches.length === 0) return;
        const dx = ev.touches[0].clientX - startX;
        const dayDelta = Math.round(dx / pxPerDay);
        currentDayDelta = dayDelta;
        const newStart = addDays(origStartDate, dayDelta);
        finalStartDateStr = formatDate(newStart);
        finalDur = origDur;
        bar.style.left = `${origLeftPx + (dayDelta * pxPerDay)}px`;
      }

      function onTouchEnd() {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
        }
        if (currentDayDelta !== 0) {
          updateConceptDatesInModel(conceptId, finalStartDateStr, finalDur);
          showToast(`Concepto ${clave} actualizado: ${finalStartDateStr} (${finalDur} días)`);
          renderCalendarioObra();
        }
      }

      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
      }
    };
  });
}

// ==========================================
// BARRA DE DESPLAZAMIENTO Y ZOOM ESTILO ADOBE PREMIERE PRO
// ==========================================

export function updatePremiereZoomBarUI() {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  const track = document.getElementById('gantt-premiere-track');
  const thumb = document.getElementById('gantt-premiere-thumb');
  if (!timelinePanel || !track || !thumb || !thumb.style) return;

  const trackW = track.clientWidth;
  const scrollW = timelinePanel.scrollWidth;
  const clientW = timelinePanel.clientWidth;
  const scrollL = timelinePanel.scrollLeft;

  if (trackW <= 0 || scrollW <= 0) return;

  // Proporción de contenido visible en el viewport
  const visibleRatio = Math.min(1, clientW / scrollW);
  const thumbW = Math.max(34, Math.min(trackW, Math.round(trackW * visibleRatio)));

  const maxScroll = Math.max(1, scrollW - clientW);
  const maxThumbL = Math.max(0, trackW - thumbW);

  const scrollRatio = maxScroll > 0 ? Math.max(0, Math.min(1, scrollL / maxScroll)) : 0;
  const thumbL = Math.round(scrollRatio * maxThumbL);

  thumb.style.width = `${thumbW}px`;
  thumb.style.left = `${thumbL}px`;
}

export function initPremiereZoomBar() {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  const track = document.getElementById('gantt-premiere-track');
  const thumb = document.getElementById('gantt-premiere-thumb');
  if (!timelinePanel || !track || !thumb) return;

  // Actualizar tamaño y posición inicial del thumb
  updatePremiereZoomBarUI();

  // Sincronizar automáticamente cuando el usuario haga scroll en el timeline
  timelinePanel.onscroll = () => {
    updatePremiereZoomBarUI();
  };

  if (typeof window !== 'undefined' && window.addEventListener && !isPremiereResizeListenerAttached) {
    isPremiereResizeListenerAttached = true;
    window.addEventListener('resize', updatePremiereZoomBarUI);
  }

  // Soporte Alt+Rueda o Ctrl+Rueda estilo Premiere Pro para hacer zoom
  timelinePanel.onwheel = (e) => {
    if (e.altKey || e.ctrlKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 4 : -4;
      const cfg = getScheduleSettings();
      const currentDayWidth = cfg.dayWidth || 34;
      const newDayWidth = Math.max(14, Math.min(120, currentDayWidth + zoomDelta));
      if (newDayWidth !== currentDayWidth) {
        saveScheduleSettings({ dayWidth: newDayWidth });
        renderCalendarioObra();
      }
    }
  };

  // Tooltip flotante para el zoom estilo Premiere Pro
  let zoomTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-premiere-zoom-tooltip') : null;
  if (!zoomTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    zoomTooltip = document.createElement('div');
    zoomTooltip.id = 'gantt-premiere-zoom-tooltip';
    zoomTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-[11px] px-2.5 py-1 rounded-lg border border-blue-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(zoomTooltip);
  }

  function showZoomTip(x, y, text) {
    if (!zoomTooltip || !zoomTooltip.style) return;
    zoomTooltip.innerHTML = text;
    zoomTooltip.style.left = `${x + 12}px`;
    zoomTooltip.style.top = `${y - 36}px`;
    zoomTooltip.classList.remove('hidden');
  }

  function hideZoomTip() {
    if (zoomTooltip && zoomTooltip.classList) {
      zoomTooltip.classList.add('hidden');
    }
  }

  // Control de arrastre del thumb (desplazar) y de las manijas laterales (zoom)
  thumb.onmousedown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    const target = e.target || thumb;
    const targetId = target.id || '';
    const isLeftHandle = targetId === 'gantt-premiere-handle-left' || (target.closest && target.closest('#gantt-premiere-handle-left'));
    const isRightHandle = targetId === 'gantt-premiere-handle-right' || (target.closest && target.closest('#gantt-premiere-handle-right'));

    const mode = isLeftHandle ? 'zoom-left' : (isRightHandle ? 'zoom-right' : 'pan');

    const startX = e.clientX || 0;
    const trackW = track.clientWidth || 600;
    const startThumbL = parseFloat(thumb.style.left) || 0;
    const startThumbW = thumb.offsetWidth || 100;
    const scrollW = timelinePanel.scrollWidth || 1200;
    const clientW = timelinePanel.clientWidth || 800;

    const cfg = getScheduleSettings();
    const startDayWidth = cfg.dayWidth || 34;

    let targetDayWidth = startDayWidth;
    let hasChangedZoom = false;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = mode === 'pan' ? 'grabbing' : 'ew-resize';
    }

    if (mode === 'pan') {
      thumb.classList.add('ring-2', 'ring-blue-400');
    }

    function onMouseMove(ev) {
      const dx = (ev.clientX || 0) - startX;

      if (mode === 'pan') {
        // Desplazamiento horizontal directo del thumb y del timeline
        const maxThumbL = Math.max(0, trackW - startThumbW);
        const newThumbL = Math.max(0, Math.min(maxThumbL, startThumbL + dx));
        thumb.style.left = `${newThumbL}px`;

        const ratio = maxThumbL > 0 ? newThumbL / maxThumbL : 0;
        const maxScroll = Math.max(0, scrollW - clientW);
        timelinePanel.scrollLeft = ratio * maxScroll;

        const pct = Math.round(ratio * 100);
        showZoomTip(ev.clientX, ev.clientY, `<i class="fa-solid fa-arrows-left-right text-blue-400"></i> Desplazamiento: <span class="font-bold text-white">${pct}%</span>`);

      } else if (mode === 'zoom-right') {
        // Arrastrar extremo derecho: cambiar tamaño del thumb -> ZOOM
        // Hacia adentro (dx < 0) reduce el thumb -> ZOOM IN
        // Hacia afuera (dx > 0) agranda el thumb -> ZOOM OUT
        const maxW = Math.max(34, trackW - startThumbL);
        const newThumbW = Math.max(34, Math.min(maxW, startThumbW + dx));
        thumb.style.width = `${newThumbW}px`;

        const ratio = Math.max(0.1, newThumbW / startThumbW);
        targetDayWidth = Math.max(14, Math.min(120, Math.round(startDayWidth / ratio)));
        hasChangedZoom = (targetDayWidth !== startDayWidth);

        const zoomPct = Math.round((targetDayWidth / 34) * 100);
        showZoomTip(ev.clientX, ev.clientY, `<i class="fa-solid fa-magnifying-glass text-blue-400"></i> Zoom: <span class="font-bold text-white">${zoomPct}%</span> (${targetDayWidth}px/día)`);

      } else if (mode === 'zoom-left') {
        // Arrastrar extremo izquierdo: cambiar posición y tamaño -> ZOOM
        // Hacia adentro (dx > 0) reduce el thumb -> ZOOM IN
        // Hacia afuera (dx < 0) agranda el thumb -> ZOOM OUT
        const maxL = startThumbL + startThumbW - 34;
        const newThumbL = Math.max(0, Math.min(maxL, startThumbL + dx));
        const newThumbW = Math.max(34, startThumbW - (newThumbL - startThumbL));
        thumb.style.left = `${newThumbL}px`;
        thumb.style.width = `${newThumbW}px`;

        const ratio = Math.max(0.1, newThumbW / startThumbW);
        targetDayWidth = Math.max(14, Math.min(120, Math.round(startDayWidth / ratio)));
        hasChangedZoom = (targetDayWidth !== startDayWidth);

        const zoomPct = Math.round((targetDayWidth / 34) * 100);
        showZoomTip(ev.clientX, ev.clientY, `<i class="fa-solid fa-magnifying-glass text-blue-400"></i> Zoom: <span class="font-bold text-white">${zoomPct}%</span> (${targetDayWidth}px/día)`);
      }
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      thumb.classList.remove('ring-2', 'ring-blue-400');
      hideZoomTip();

      if (hasChangedZoom && targetDayWidth !== startDayWidth) {
        saveScheduleSettings({ dayWidth: targetDayWidth });
        renderCalendarioObra();
      } else {
        updatePremiereZoomBarUI();
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };

  // Clic directo en la pista (Track): Centrar la vista en el punto cliqueado
  track.onclick = (e) => {
    if (e.target === thumb || (thumb.contains && thumb.contains(e.target))) return;

    const rect = track.getBoundingClientRect ? track.getBoundingClientRect() : { left: 0 };
    const clickX = (e.clientX || 0) - (rect.left || 0);
    const trackW = track.clientWidth || 600;
    const thumbW = thumb.offsetWidth || 100;

    const maxThumbL = Math.max(0, trackW - thumbW);
    const targetThumbL = Math.max(0, Math.min(maxThumbL, clickX - (thumbW / 2)));

    const ratio = maxThumbL > 0 ? targetThumbL / maxThumbL : 0;
    const maxScroll = Math.max(0, timelinePanel.scrollWidth - timelinePanel.clientWidth);
    timelinePanel.scrollLeft = ratio * maxScroll;
    updatePremiereZoomBarUI();
  };
}

// Desplazamiento por pasos suaves (botones ◀ y ▶)
export function scrollGanttTimelineStep(direction) {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  if (!timelinePanel) return;
  const step = (direction || 1) * Math.max(80, Math.round(timelinePanel.clientWidth * 0.2));
  timelinePanel.scrollLeft += step;
  updatePremiereZoomBarUI();
}

// Ajustar escala para ver toda la obra en pantalla (Fit Timeline)
export function fitGanttTimelineEntireProject() {
  const timelinePanel = document.getElementById('gantt-timeline-panel');
  if (!timelinePanel) return;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, 34);
  const totalDays = Math.max(1, diffDays(scaleData.timelineStart, scaleData.timelineEnd) + 1);
  const availableWidth = Math.max(400, (timelinePanel.clientWidth || 800) - 20);

  let fittedDayWidth;
  if (cfg.scale === 'dias') {
    fittedDayWidth = Math.max(14, Math.min(120, Math.round(availableWidth / totalDays)));
  } else if (cfg.scale === 'semanas') {
    fittedDayWidth = Math.max(14, Math.min(120, Math.round((availableWidth / totalDays) / 0.45)));
  } else {
    fittedDayWidth = Math.max(14, Math.min(120, Math.round((availableWidth / totalDays) / 0.16)));
  }

  saveScheduleSettings({ dayWidth: fittedDayWidth });
  showToast(`Escala ajustada a la pantalla: ${Math.round((fittedDayWidth / 34) * 100)}% (${fittedDayWidth}px/d)`);
  renderCalendarioObra();
}

// ------------------------------------------
// ARRASTRE INTERACTIVO DE LA LÍNEA DEL DÍA DE HOY / FECHA DE CORTE
// ------------------------------------------
export function initGanttTodayLineDrag() {
  const pin = document.getElementById('gantt-today-pin');
  const lineContainer = document.getElementById('gantt-today-line-container');
  if (!pin || !lineContainer) return;

  const cfg = getScheduleSettings();
  let minDate = null;
  let maxDate = null;
  const rawItems = extractScheduleItems(state.treeData);
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const scaleData = generateGanttTimeScale(minDate, maxDate, cfg.scale, cfg.dayWidth);
  const pxPerDay = scaleData.pxPerDay || 34;

  let todayTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-today-drag-tooltip') : null;
  if (!todayTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    todayTooltip = document.createElement('div');
    todayTooltip.id = 'gantt-today-drag-tooltip';
    todayTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-rose-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(todayTooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!todayTooltip || !todayTooltip.style) return;
    todayTooltip.innerHTML = textHtml;
    todayTooltip.style.left = `${clientX + 14}px`;
    todayTooltip.style.top = `${clientY - 42}px`;
    todayTooltip.classList.remove('hidden');
  }

  function hideTooltip() {
    if (todayTooltip && todayTooltip.classList) {
      todayTooltip.classList.add('hidden');
    }
  }

  pin.ondblclick = (e) => {
    if (e.stopPropagation) e.stopPropagation();
    resetGanttTodayDateAction();
  };

  pin.onmousedown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    const startX = e.clientX || 0;
    const startLeftPx = parseFloat(lineContainer.style.left) || 0;
    const currentTodayStr = getGanttTodayDate();
    const origTodayDate = parseDate(currentTodayStr);

    let currentDayDelta = 0;
    let finalDateStr = currentTodayStr;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    if (pin.classList && pin.classList.add) {
      pin.classList.add('ring-2', 'ring-rose-400', 'scale-110');
    }

    function onMouseMove(ev) {
      const dx = (ev.clientX || 0) - startX;
      const dayDelta = Math.round(dx / pxPerDay);
      currentDayDelta = dayDelta;

      const newDate = addDays(origTodayDate, dayDelta);
      finalDateStr = formatDate(newDate);

      lineContainer.style.left = `${startLeftPx + (dayDelta * pxPerDay)}px`;

      const realTodayStr = formatDate(new Date());
      const isRealToday = (finalDateStr === realTodayStr);
      const deltaFromReal = diffDays(realTodayStr, finalDateStr);

      let deltaText = '';
      if (isRealToday) {
        deltaText = '<span class="text-rose-400 font-bold">(Hoy real)</span>';
      } else if (deltaFromReal > 0) {
        deltaText = `<span class="text-amber-400 font-bold">(+${deltaFromReal} días al futuro)</span>`;
      } else {
        deltaText = `<span class="text-blue-400 font-bold">(${deltaFromReal} días al pasado)</span>`;
      }

      updateTooltip(ev.clientX, ev.clientY, `
        <div class="font-bold text-rose-300 flex items-center gap-1.5">
          <i class="fa-solid fa-location-crosshairs text-[10px]"></i> Fecha de Corte: <span class="text-white">${finalDateStr}</span>
        </div>
        <div class="text-[10px] mt-0.5 text-slate-300">
          ${deltaText}
        </div>
      `);
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      if (pin.classList && pin.classList.remove) {
        pin.classList.remove('ring-2', 'ring-rose-400', 'scale-110');
      }
      hideTooltip();

      if (currentDayDelta !== 0 && finalDateStr !== currentTodayStr) {
        setGanttTodayDate(finalDateStr);
        showToast(`Fecha de corte actualizada: ${finalDateStr}`);
        renderCalendarioObra();
      } else {
        lineContainer.style.left = `${startLeftPx}px`;
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };
}


// ------------------------------------------
// ARRASTRE INTERACTIVO DE LÍNEA DE CORTE EN PROGRAMA FINANCIERO
// ------------------------------------------
export function initFinancialTodayLineDrag() {
  const pin = typeof document !== 'undefined' ? document.getElementById('financial-today-pin') : null;
  const lineContainer = typeof document !== 'undefined' ? document.getElementById('financial-today-line-container') : null;
  const tablePanel = typeof document !== 'undefined' ? document.getElementById('financial-table-panel') : null;
  if (!pin || !lineContainer || !tablePanel) return;

  const currentTodayStr = getGanttTodayDate();
  const origTodayDate = parseDate(currentTodayStr);

  // Intentar ajustar la posición inicial de forma exacta al encabezado correspondiente
  const thCols = (typeof document !== 'undefined' && document.querySelectorAll) ? Array.from(document.querySelectorAll('th[id^="fin-col-"]')) : [];
  if (thCols.length > 0) {
    for (let i = 0; i < thCols.length; i++) {
      const th = thCols[i];
      const s = parseDate(th.dataset.periodStart);
      const e = parseDate(th.dataset.periodEnd);
      if (origTodayDate >= s && origTodayDate <= e) {
        const daysInP = Math.max(1, diffDays(s, e));
        const frac = diffDays(s, origTodayDate) / daysInP;
        const leftPx = th.offsetLeft + Math.round(frac * th.offsetWidth);
        lineContainer.style.left = `${leftPx}px`;
        break;
      }
    }
  }

  let todayTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-today-drag-tooltip') : null;
  if (!todayTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    todayTooltip = document.createElement('div');
    todayTooltip.id = 'gantt-today-drag-tooltip';
    todayTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-rose-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(todayTooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!todayTooltip || !todayTooltip.style) return;
    todayTooltip.innerHTML = textHtml;
    todayTooltip.style.left = `${clientX + 14}px`;
    todayTooltip.style.top = `${clientY - 42}px`;
    todayTooltip.classList.remove('hidden');
  }

  function hideTooltip() {
    if (todayTooltip && todayTooltip.classList) {
      todayTooltip.classList.add('hidden');
    }
  }

  pin.ondblclick = (e) => {
    if (e.stopPropagation) e.stopPropagation();
    resetGanttTodayDateAction();
  };

  pin.onmousedown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    const startX = e.clientX || 0;
    const startLeftPx = parseFloat(lineContainer.style.left) || 676;
    let currentDayDelta = 0;
    let finalDateStr = currentTodayStr;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    if (pin.classList && pin.classList.add) {
      pin.classList.add('ring-2', 'ring-rose-400', 'scale-110');
    }

    const cols = (typeof document !== 'undefined' && document.querySelectorAll) ? Array.from(document.querySelectorAll('th[id^="fin-col-"]')) : [];
    const firstCol = cols[0];
    const lastCol = cols[cols.length - 1];
    const avgColWidth = cols.length > 0 && lastCol && firstCol ? (lastCol.offsetLeft + lastCol.offsetWidth - firstCol.offsetLeft) / cols.length : 144;
    let avgDaysPerPeriod = 30;
    if (cols.length > 0 && firstCol) {
      const s = parseDate(firstCol.dataset.periodStart);
      const e = parseDate(firstCol.dataset.periodEnd);
      avgDaysPerPeriod = Math.max(1, diffDays(s, e) + 1);
    }
    const pxPerDay = Math.max(1, avgColWidth / avgDaysPerPeriod);

    function onMouseMove(ev) {
      const dx = (ev.clientX || 0) - startX;
      const targetLeft = startLeftPx + dx;
      const dayDelta = Math.round(dx / pxPerDay);
      currentDayDelta = dayDelta;

      const newDate = addDays(origTodayDate, dayDelta);
      finalDateStr = formatDate(newDate);

      lineContainer.style.left = `${targetLeft}px`;

      const realTodayStr = formatDate(new Date());
      const isRealToday = (finalDateStr === realTodayStr);
      const deltaFromReal = diffDays(realTodayStr, finalDateStr);

      let deltaText = '';
      if (isRealToday) {
        deltaText = '<span class="text-rose-400 font-bold">(Hoy real)</span>';
      } else if (deltaFromReal > 0) {
        deltaText = `<span class="text-amber-400 font-bold">(+${deltaFromReal} días al futuro)</span>`;
      } else {
        deltaText = `<span class="text-blue-400 font-bold">(${deltaFromReal} días al pasado)</span>`;
      }

      updateTooltip(ev.clientX, ev.clientY, `
        <div class="font-bold text-rose-300 flex items-center gap-1.5">
          <i class="fa-solid fa-location-crosshairs text-[10px]"></i> Programa Financiero Corte: <span class="text-white">${finalDateStr}</span>
        </div>
        <div class="text-[10px] mt-0.5 text-slate-300">
          ${deltaText}
        </div>
      `);
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      if (pin.classList && pin.classList.remove) {
        pin.classList.remove('ring-2', 'ring-rose-400', 'scale-110');
      }
      hideTooltip();

      if (currentDayDelta !== 0 && finalDateStr !== currentTodayStr) {
        setGanttTodayDate(finalDateStr);
        showToast(`Fecha de corte actualizada: ${finalDateStr}`);
        renderCalendarioObra();
      } else {
        lineContainer.style.left = `${startLeftPx}px`;
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };
}

// ------------------------------------------
// ARRASTRE INTERACTIVO DE LÍNEA DE CORTE EN CURVA "S" Y FLUJO
// ------------------------------------------
export function initCurvaSTodayLineDrag() {
  const pin = typeof document !== 'undefined' ? document.getElementById('curva-s-today-pin') : null;
  const line = typeof document !== 'undefined' ? document.getElementById('curva-s-today-line') : null;
  const badge = typeof document !== 'undefined' ? document.getElementById('curva-s-today-badge') : null;
  const group = typeof document !== 'undefined' ? document.getElementById('curva-s-today-group') : null;
  const svgEl = pin && pin.closest ? pin.closest('svg') : (typeof document !== 'undefined' ? document.getElementById('curva-s-svg') : null);
  if (!pin || !line || !svgEl) return;

  const currentTodayStr = getGanttTodayDate();
  const origTodayDate = parseDate(currentTodayStr);

  const cfg = getScheduleSettings();
  let minDate = null;
  let maxDate = null;
  const rawItems = extractScheduleItems(state.treeData);
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const periods = generateTimePeriods(rawItems, cfg.scale, minDate ? formatDate(minDate) : cfg.startDate);
  if (!periods || periods.length === 0) return;

  const pStart0 = periods[0].startDate;
  const pEndLast = periods[periods.length - 1].endDate;
  const totalDays = Math.max(1, diffDays(pStart0, pEndLast) + 1);

  const W = 960;
  const padX = 70;
  const padTop = 40;
  const padBottom = 100;
  const chartW = W - padX * 2;
  const chartH = 380 - padTop - padBottom; // 240px

  let todayTooltip = typeof document !== 'undefined' ? document.getElementById('gantt-today-drag-tooltip') : null;
  if (!todayTooltip && typeof document !== 'undefined' && document.createElement && document.body && document.body.appendChild) {
    todayTooltip = document.createElement('div');
    todayTooltip.id = 'gantt-today-drag-tooltip';
    todayTooltip.className = 'fixed hidden z-50 bg-slate-900/95 text-slate-100 text-xs px-3 py-1.5 rounded-xl border border-rose-500 shadow-2xl pointer-events-none font-mono whitespace-nowrap backdrop-blur-md transition-opacity';
    document.body.appendChild(todayTooltip);
  }

  function updateTooltip(clientX, clientY, textHtml) {
    if (!todayTooltip || !todayTooltip.style) return;
    todayTooltip.innerHTML = textHtml;
    todayTooltip.style.left = `${clientX + 14}px`;
    todayTooltip.style.top = `${clientY - 42}px`;
    todayTooltip.classList.remove('hidden');
  }

  function hideTooltip() {
    if (todayTooltip && todayTooltip.classList) {
      todayTooltip.classList.add('hidden');
    }
  }

  pin.ondblclick = (e) => {
    if (e.stopPropagation) e.stopPropagation();
    resetGanttTodayDateAction();
  };

  const handleStart = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();

    const initialLineX = parseFloat(line.getAttribute('x1')) || padX;
    let finalDateStr = currentTodayStr;
    let didMove = false;

    if (document.body && document.body.style) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    }

    function onMouseMove(ev) {
      didMove = true;
      const rect = svgEl.getBoundingClientRect();
      const scaleX = W / (rect.width || W);
      const mouseSvgX = ((ev.clientX || 0) - rect.left) * scaleX;
      const clampedX = Math.max(padX, Math.min(padX + chartW, mouseSvgX));

      line.setAttribute('x1', clampedX.toFixed(1));
      line.setAttribute('x2', clampedX.toFixed(1));
      pin.setAttribute('transform', `translate(${clampedX.toFixed(1)}, ${padTop - 12})`);
      if (badge) {
        badge.setAttribute('transform', `translate(${clampedX.toFixed(1)}, ${padTop + chartH + 16})`);
      }

      const fraction = (clampedX - padX) / chartW;
      const daysOffset = Math.round(fraction * (totalDays - 1));
      const newDate = addDays(pStart0, daysOffset);
      finalDateStr = formatDate(newDate);

      if (badge) {
        const textEl = badge.querySelector('text');
        if (textEl) textEl.textContent = finalDateStr;
      }

      const realTodayStr = formatDate(new Date());
      const isRealToday = (finalDateStr === realTodayStr);
      const deltaFromReal = diffDays(realTodayStr, finalDateStr);

      let deltaText = '';
      if (isRealToday) {
        deltaText = '<span class="text-rose-400 font-bold">(Hoy real)</span>';
      } else if (deltaFromReal > 0) {
        deltaText = `<span class="text-amber-400 font-bold">(+${deltaFromReal} días al futuro)</span>`;
      } else {
        deltaText = `<span class="text-blue-400 font-bold">(${deltaFromReal} días al pasado)</span>`;
      }

      updateTooltip(ev.clientX, ev.clientY, `
        <div class="font-bold text-rose-300 flex items-center gap-1.5">
          <i class="fa-solid fa-location-crosshairs text-[10px]"></i> Curva "S" Corte: <span class="text-white">${finalDateStr}</span>
        </div>
        <div class="text-[10px] mt-0.5 text-slate-300">
          ${deltaText}
        </div>
      `);
    }

    function onMouseUp() {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      if (document.body && document.body.style) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }

      hideTooltip();

      if (didMove && finalDateStr !== currentTodayStr) {
        setGanttTodayDate(finalDateStr);
        showToast(`Fecha de corte actualizada: ${finalDateStr}`);
        renderCalendarioObra();
      } else {
        line.setAttribute('x1', initialLineX.toFixed(1));
        line.setAttribute('x2', initialLineX.toFixed(1));
        pin.setAttribute('transform', `translate(${initialLineX.toFixed(1)}, ${padTop - 12})`);
        if (badge) {
          badge.setAttribute('transform', `translate(${initialLineX.toFixed(1)}, ${padTop + chartH + 16})`);
          const textEl = badge.querySelector('text');
          if (textEl) textEl.textContent = currentTodayStr;
        }
      }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  };

  pin.onmousedown = handleStart;
  if (group) group.onmousedown = handleStart;
}

// ============================================================
// MODAL DE JORNADA LABORAL Y DÍAS INHÁBILES (FESTIVOS, LLUVIAS, DESCANSO)
// ============================================================

let currentJornadaModalConfig = null;
let currentJornadaActiveTab = 'semanal';

const DAY_NAMES_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_LETTERS_ES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function openCalendarioJornadaModal() {
  if (!guardTabUnlocked('calendario')) return;
  const modal = document.getElementById('modal-calendario-jornada');
  if (!modal) return;

  // Cargar configuración actual de jornada
  currentJornadaModalConfig = JSON.parse(JSON.stringify(getWorkdaysSettings()));
  currentJornadaActiveTab = 'semanal';

  // Info del proyecto
  const prjName = state.projectInfo?.nombre || state.projectName || 'Proyecto Principal';
  const prjNameEl = document.getElementById('modal-jornada-project-name');
  if (prjNameEl) prjNameEl.textContent = prjName;

  // Plazo del proyecto
  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems();
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);
  const totalDias = Math.max(1, diffDays(minDate, maxDate) + 1);

  const plazoEl = document.getElementById('modal-jornada-plazo-txt');
  if (plazoEl) {
    plazoEl.textContent = `${totalDias} días naturales (${formatDate(minDate)} al ${formatDate(maxDate)})`;
  }

  // Prellenar fecha de hoy o inicio en inputs
  const inputFestivo = document.getElementById('input-festivo-date');
  if (inputFestivo) inputFestivo.value = formatDate(minDate);
  const inputLluvia = document.getElementById('input-lluvia-date');
  if (inputLluvia) inputLluvia.value = formatDate(minDate);

  // Renderizar vistas
  renderCalendarioJornadaModal();

  // Abrir modal
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeCalendarioJornadaModal() {
  const modal = document.getElementById('modal-calendario-jornada');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

export function switchCalendarioJornadaTab(tabName) {
  currentJornadaActiveTab = tabName;
  const tabs = ['semanal', 'festivos', 'lluvias'];

  tabs.forEach(t => {
    const btn = document.getElementById(`tab-jornada-${t}`);
    const view = document.getElementById(`view-jornada-${t}`);
    if (btn) {
      if (t === tabName) {
        btn.className = 'py-2.5 px-4 text-xs font-bold border-b-2 border-blue-600 text-blue-600 flex items-center gap-2 transition cursor-pointer';
      } else {
        btn.className = 'py-2.5 px-4 text-xs font-semibold border-b-2 border-transparent text-slate-600 hover:text-slate-900 flex items-center gap-2 transition cursor-pointer';
      }
    }
    if (view) {
      if (t === tabName) {
        view.classList.remove('hidden');
      } else {
        view.classList.add('hidden');
      }
    }
  });

  renderCalendarioJornadaModal();
}

export function renderCalendarioJornadaModal() {
  if (!currentJornadaModalConfig) {
    currentJornadaModalConfig = JSON.parse(JSON.stringify(getWorkdaysSettings()));
  }

  renderJornadaWeekdaysGrid();
  renderJornadaFestivosTable();
  renderJornadaLluviasTable();
  updateJornadaModalSummary();
}

export function renderJornadaWeekdaysGrid() {
  const grid = document.getElementById('jornada-weekdays-grid');
  if (!grid || !currentJornadaModalConfig) return;

  const nonWorking = currentJornadaModalConfig.nonWorkingDaysOfWeek || [];
  // Orden amigable: Lunes a Domingo (1, 2, 3, 4, 5, 6, 0)
  const displayOrder = [1, 2, 3, 4, 5, 6, 0];

  grid.innerHTML = displayOrder.map(dayNum => {
    const isNonWorking = nonWorking.includes(dayNum);
    const dayName = DAY_NAMES_ES[dayNum];
    const dayLetter = DAY_LETTERS_ES[dayNum];

    return `
      <div onclick="toggleNonWorkingDayOfWeek(${dayNum})"
           class="p-3 rounded-xl border-2 cursor-pointer transition select-none flex flex-col items-center justify-between text-center gap-1.5 shadow-2xs ${
             isNonWorking
               ? 'bg-amber-500/10 border-amber-500 text-amber-900 hover:bg-amber-500/20'
               : 'bg-emerald-500/10 border-emerald-500 text-emerald-900 hover:bg-emerald-500/20'
           }">
        <div class="flex items-center justify-between w-full">
          <span class="w-6 h-6 rounded-full text-xs font-mono font-black flex items-center justify-center ${
            isNonWorking ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
          }">${dayLetter}</span>
          <span class="text-[10px] font-bold ${isNonWorking ? 'text-amber-700' : 'text-emerald-700'}">
            ${isNonWorking ? '<i class="fa-solid fa-moon"></i> Descanso' : '<i class="fa-solid fa-briefcase"></i> Laboral'}
          </span>
        </div>
        <span class="font-bold text-xs text-slate-800 mt-1">${dayName}</span>
        <span class="text-[9.5px] font-semibold mt-0.5 px-2 py-0.5 rounded-full ${
          isNonWorking ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
        }">
          ${isNonWorking ? 'Inhábil' : 'Hábil'}
        </span>
      </div>
    `;
  }).join('');
}

export function toggleNonWorkingDayOfWeek(dayNum) {
  if (!currentJornadaModalConfig) return;
  const list = currentJornadaModalConfig.nonWorkingDaysOfWeek || [];
  const idx = list.indexOf(dayNum);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(dayNum);
  }
  currentJornadaModalConfig.nonWorkingDaysOfWeek = list;
  renderJornadaWeekdaysGrid();
  updateJornadaModalSummary();
}

export function setNonWorkingDaysPreset(preset) {
  if (!currentJornadaModalConfig) return;
  if (preset === 'l-s') {
    currentJornadaModalConfig.nonWorkingDaysOfWeek = [0]; // Descanso Domingo
    showToast('Ajustado: Lunes a Sábado laborables (Descanso Domingo)');
  } else if (preset === 'l-v') {
    currentJornadaModalConfig.nonWorkingDaysOfWeek = [0, 6]; // Descanso Sábado y Domingo
    showToast('Ajustado: Lunes a Viernes laborables (Descanso Sábado y Domingo)');
  } else if (preset === 'todos') {
    currentJornadaModalConfig.nonWorkingDaysOfWeek = []; // 7 días laborables
    showToast('Ajustado: Todos los días laborables (Sin descansos semanales)');
  }
  renderJornadaWeekdaysGrid();
  updateJornadaModalSummary();
}

export function renderJornadaFestivosTable() {
  const tbody = document.getElementById('jornada-festivos-table-body');
  const countBadge = document.getElementById('modal-jornada-festivos-count');
  if (!currentJornadaModalConfig) return;

  const festivos = currentJornadaModalConfig.festivos || [];
  if (countBadge) countBadge.textContent = String(festivos.length);
  if (!tbody) return;

  if (festivos.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-slate-400 italic">
          No hay días festivos registrados en este proyecto. Puedes agregarlos con el formulario superior o hacer clic en "Cargar Festivos México (LFT)".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = festivos.map((f, idx) => {
    const dt = parseDate(f.date);
    const dayName = DAY_NAMES_ES[dt.getDay()];
    const parts = f.date.split('-');
    const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : f.date;

    return `
      <tr class="hover:bg-purple-50/40 transition">
        <td class="py-2 px-3 font-mono font-bold text-slate-800">${formatted}</td>
        <td class="py-2 px-3 text-slate-600 font-medium">${dayName}</td>
        <td class="py-2 px-3 text-slate-800 font-semibold flex items-center gap-1.5">
          <i class="fa-solid fa-star text-purple-500 text-[10px]"></i>
          <span>${f.name || 'Día Festivo'}</span>
        </td>
        <td class="py-2 px-3 text-center">
          <button type="button" onclick="removeFestivoFromModal(${idx})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 cursor-pointer transition" title="Eliminar festivo">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

export function addFestivoFromModal() {
  const dateInput = document.getElementById('input-festivo-date');
  const nameInput = document.getElementById('input-festivo-name');
  if (!dateInput || !currentJornadaModalConfig) return;

  const dateVal = dateInput.value;
  if (!dateVal) {
    showToast('Selecciona una fecha para el festivo', 'error');
    return;
  }

  const nameVal = (nameInput?.value || '').trim() || 'Día Festivo';

  const list = currentJornadaModalConfig.festivos || [];
  const existingIdx = list.findIndex(f => f.date === dateVal);
  if (existingIdx >= 0) {
    list[existingIdx].name = nameVal;
  } else {
    list.push({ date: dateVal, name: nameVal });
  }

  list.sort((a, b) => a.date.localeCompare(b.date));
  currentJornadaModalConfig.festivos = list;

  if (nameInput) nameInput.value = '';
  renderJornadaFestivosTable();
  updateJornadaModalSummary();
  showToast(`Festivo agregado: ${nameVal} (${dateVal})`);
}

export function removeFestivoFromModal(index) {
  if (!currentJornadaModalConfig || !currentJornadaModalConfig.festivos) return;
  const removed = currentJornadaModalConfig.festivos.splice(index, 1);
  renderJornadaFestivosTable();
  updateJornadaModalSummary();
  if (removed && removed[0]) {
    showToast(`Festivo eliminado: ${removed[0].name}`);
  }
}

export function loadMexicanHolidaysToModal() {
  if (!currentJornadaModalConfig) return;
  const cfg = getScheduleSettings();
  const year = parseInt(cfg.startDate?.slice(0, 4), 10) || 2026;
  const mexHolidays = getMexicanHolidaysForYear(year);

  const currentList = currentJornadaModalConfig.festivos || [];
  let addedCount = 0;

  mexHolidays.forEach(mh => {
    if (!currentList.some(f => f.date === mh.date)) {
      currentList.push(mh);
      addedCount++;
    }
  });

  currentList.sort((a, b) => a.date.localeCompare(b.date));
  currentJornadaModalConfig.festivos = currentList;

  renderJornadaFestivosTable();
  updateJornadaModalSummary();
  showToast(`Se cargaron ${addedCount} días festivos oficiales de México (${year})`);
}

export function renderJornadaLluviasTable() {
  const tbody = document.getElementById('jornada-lluvias-table-body');
  const countBadge = document.getElementById('modal-jornada-lluvias-count');
  if (!currentJornadaModalConfig) return;

  const lluvias = currentJornadaModalConfig.lluvias || [];
  if (countBadge) countBadge.textContent = String(lluvias.length);
  if (!tbody) return;

  if (lluvias.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="py-6 text-center text-slate-400 italic">
          No hay suspensiones por lluvia registradas en este proyecto. Puedes registrarlas arriba con la fecha y el motivo de la bitácora.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lluvias.map((ll, idx) => {
    const dt = parseDate(ll.date);
    const dayName = DAY_NAMES_ES[dt.getDay()];
    const parts = ll.date.split('-');
    const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : ll.date;

    return `
      <tr class="hover:bg-sky-50/40 transition">
        <td class="py-2 px-3 font-mono font-bold text-slate-800">${formatted}</td>
        <td class="py-2 px-3 text-slate-600 font-medium">${dayName}</td>
        <td class="py-2 px-3 text-slate-800 font-semibold flex items-center gap-1.5">
          <i class="fa-solid fa-cloud-rain text-sky-500 text-[10px]"></i>
          <span>${ll.reason || ll.name || 'Suspensión por lluvia'}</span>
        </td>
        <td class="py-2 px-3 text-center">
          <button type="button" onclick="removeLluviaFromModal(${idx})" class="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 cursor-pointer transition" title="Eliminar registro de lluvia">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

export function addLluviaFromModal() {
  const dateInput = document.getElementById('input-lluvia-date');
  const reasonInput = document.getElementById('input-lluvia-reason');
  if (!dateInput || !currentJornadaModalConfig) return;

  const dateVal = dateInput.value;
  if (!dateVal) {
    showToast('Selecciona una fecha de lluvia', 'error');
    return;
  }

  const reasonVal = (reasonInput?.value || '').trim() || 'Suspensión por lluvia';

  const list = currentJornadaModalConfig.lluvias || [];
  const existingIdx = list.findIndex(l => l.date === dateVal);
  if (existingIdx >= 0) {
    list[existingIdx].reason = reasonVal;
  } else {
    list.push({ date: dateVal, reason: reasonVal });
  }

  list.sort((a, b) => a.date.localeCompare(b.date));
  currentJornadaModalConfig.lluvias = list;

  if (reasonInput) reasonInput.value = '';
  renderJornadaLluviasTable();
  updateJornadaModalSummary();
  showToast(`Día de lluvia registrado: ${dateVal}`);
}

export function removeLluviaFromModal(index) {
  if (!currentJornadaModalConfig || !currentJornadaModalConfig.lluvias) return;
  const removed = currentJornadaModalConfig.lluvias.splice(index, 1);
  renderJornadaLluviasTable();
  updateJornadaModalSummary();
  if (removed && removed[0]) {
    showToast(`Día de lluvia eliminado: ${removed[0].date}`);
  }
}

export function updateJornadaModalSummary() {
  if (!currentJornadaModalConfig) return;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems();
  let minDate = null;
  let maxDate = null;
  rawItems.forEach(it => {
    if (it.tipo === 'concepto' && it.startDate && it.endDate) {
      const s = parseDate(it.startDate);
      const e = parseDate(it.endDate);
      if (!minDate || s < minDate) minDate = s;
      if (!maxDate || e > maxDate) maxDate = e;
    }
  });
  if (!minDate) minDate = parseDate(cfg.startDate || '2026-05-01');
  if (!maxDate || maxDate <= minDate) maxDate = addDays(minDate, 180);

  const summary = calculateWorkdaysSummary(minDate, maxDate, currentJornadaModalConfig);

  const elNaturales = document.getElementById('modal-sum-dias-naturales');
  if (elNaturales) elNaturales.textContent = String(summary.totalNaturalDays);

  const elDescanso = document.getElementById('modal-sum-dias-descanso');
  if (elDescanso) elDescanso.textContent = String(summary.weeklyRestDays);

  const elFestivos = document.getElementById('modal-sum-dias-festivos');
  if (elFestivos) elFestivos.textContent = String(summary.festivosCount);

  const elLluvia = document.getElementById('modal-sum-dias-lluvia');
  if (elLluvia) elLluvia.textContent = String(summary.lluviasCount);

  const elHabiles = document.getElementById('modal-sum-dias-habiles');
  if (elHabiles) elHabiles.textContent = String(summary.workingDays);
}

export function saveCalendarioJornadaModal() {
  if (!currentJornadaModalConfig) return;
  saveScheduleUndoSnapshot('Cambio en días inhábiles');
  saveWorkdaysSettings(currentJornadaModalConfig);
  closeCalendarioJornadaModal();
  showToast('Jornada laboral y días inhábiles guardados correctamente');
  renderCalendarioObra();
}

// ============================================================
// CONTROLADORES DE RUTA CRÍTICA (CPM), DEPENDENCIAS FIN-A-INICIO Y PROPUESTA IA
// ============================================================

export function toggleCalendarioCriticalPath() {
  if (!isAdvancedCalendarioAllowed()) {
    showToast('🔒 El análisis de Ruta Crítica (CPM) está disponible desde el Plan Plus. Tu Plan Gratuita incluye el Diagrama de Gantt básico.', 'warning');
    if (typeof window !== 'undefined') window.openSubscriptionModal?.();
    return;
  }
  const cfg = getScheduleSettings();
  const nextVal = !(cfg.showCriticalPath !== false);
  saveScheduleSettings({ showCriticalPath: nextVal });
  showToast(
    nextVal
      ? '🔥 Ruta Crítica activada: resaltando en rojo los conceptos con holgura 0 días.'
      : 'Vista estándar de colores por partida restablecida.'
  );
  renderCalendarioObra();
}

export function toggleCalendarioLinkMode() {
  calendarioLinkClickMode = !calendarioLinkClickMode;
  pendingLinkPredecessorId = null;
  if (calendarioLinkClickMode) {
    showToast('🔗 Modo Vincular activo: haz clic en el concepto predecesor y luego en el dependiente.');
  }
  renderCalendarioObra();
}

export function handleCalendarioBarLinkClick(clickedConceptId, clickedClave = '') {
  if (!clickedConceptId) return;

  if (!pendingLinkPredecessorId) {
    pendingLinkPredecessorId = String(clickedConceptId);
    showToast(`1° Predecesora seleccionada: ${clickedClave || clickedConceptId}. Ahora haz clic en el concepto que dependerá de ella.`);
    renderCalendarioObra();
    return;
  }

  if (String(pendingLinkPredecessorId) === String(clickedConceptId)) {
    pendingLinkPredecessorId = null;
    showToast('Selección de predecesora cancelada.');
    renderCalendarioObra();
    return;
  }

  const predId = pendingLinkPredecessorId;
  pendingLinkPredecessorId = null;
  const res = toggleConceptPredecessorInModel(clickedConceptId, predId);
  if (!res || !res.ok) {
    showToast(res?.error || 'No se pudo vincular el concepto.', 'error');
    renderCalendarioObra();
    return;
  }

  if (res.action === 'removed') {
    showToast(`Enlace eliminado entre ${res.predClave} y ${res.targetClave}.`);
  } else {
    showToast(`✓ Enlace Fin-a-Inicio creado: ${res.targetClave} iniciará al terminar ${res.predClave} (${res.startDate}).`);
  }
  renderCalendarioObra();
}

export function undoCalendarioScheduleAction() {
  if (!guardTabUnlocked('calendario')) return;
  const snap = undoLastScheduleChange();
  if (!snap) {
    showToast('No hay cambios por deshacer en el calendario.', 'error');
    return;
  }
  showToast(`↩ Deshacer: ${snap.label || 'cronograma previo'}.`);
  renderCalendarioObra();
}

export function redoCalendarioScheduleAction() {
  if (!guardTabUnlocked('calendario')) return;
  const snap = redoLastScheduleChange();
  if (!snap) {
    showToast('No hay cambios por rehacer en el calendario.', 'error');
    return;
  }
  showToast(`↪ Rehacer: ${snap.label || 'cambio reaplicado'}.`);
  renderCalendarioObra();
}

export function onGanttPredecessorSelect(conceptId, selectedValue) {
  if (!guardTabUnlocked('calendario')) {
    renderCalendarioObra();
    return;
  }
  if (selectedValue === '__MULTI__') {
    openConceptDependenciesModal(conceptId);
    renderCalendarioObra();
    return;
  }

  const nextPreds = selectedValue ? [String(selectedValue)] : [];
  const res = setConceptPredecessorsInModel(conceptId, nextPreds);
  if (!res || !res.ok) {
    showToast(res?.error || 'No se pudo asignar la predecesora.', 'error');
    renderCalendarioObra();
    return;
  }

  if (nextPreds.length === 0) {
    showToast(`Dependencias liberadas en ${res.clave} (inicio libre).`);
  } else {
    showToast(`✓ ${res.clave} ahora inicia al terminar su predecesora (${res.startDate}).`);
  }
  renderCalendarioObra();
}

export function clearAllCalendarioLinksAction() {
  if (!guardTabUnlocked('calendario')) return;
  clearAllScheduleDependenciesInModel();
  closeCalendarioAiModal();
  showToast('Se eliminaron todos los enlaces de dependencia (puedes usar Deshacer si lo requieres).');
  renderCalendarioObra();
}

// ------------------------------------------------------------
// MODAL DE MÚLTIPLES PREDECESORAS POR CONCEPTO
// ------------------------------------------------------------
function ensureModalContainer(modalId) {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById(modalId);
  const needsAppend = !el;
  if (!el && document.createElement) {
    el = document.createElement('div');
    el.id = modalId;
  }
  if (el && needsAppend && document.body && document.body.appendChild) {
    document.body.appendChild(el);
  }
  return el;
}

export function openConceptDependenciesModal(conceptId) {
  if (!guardTabUnlocked('calendario')) return;
  const modal = ensureModalContainer('modal-calendario-dependencias');
  if (!modal) return;

  const cfg = getScheduleSettings();
  const rawItems = extractScheduleItems(state.treeData);
  ensureInitialDates(rawItems, cfg.startDate);
  const concepts = rawItems.filter(it => it.tipo === 'concepto');
  const target = concepts.find(c => String(c.id) === String(conceptId));
  if (!target) return;

  currentDepModalConceptId = String(target.id);
  const currentPreds = new Set((target.predecessors || []).map(String));

  modal.className = 'fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
      <div class="bg-slate-900 text-white px-4 py-3.5 flex items-center justify-between shrink-0">
        <div class="min-w-0 pr-2">
          <h3 class="text-sm font-bold flex items-center gap-2">
            <i class="fa-solid fa-diagram-project text-blue-400"></i>
            <span>Dependencias Fin-a-Inicio — <span class="font-mono text-amber-300">${target.clave}</span></span>
          </h3>
          <p class="text-[11px] text-slate-300 truncate mt-0.5">${target.descripcion}</p>
        </div>
        <button type="button" onclick="closeConceptDependenciesModal()" class="text-slate-400 hover:text-white p-1 rounded cursor-pointer">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-[11px] text-blue-900">
        Marca todos los conceptos que <strong>deben terminar</strong> antes de poder iniciar <strong>${target.clave}</strong>. Se bloquean automáticamente los conceptos que generarían un ciclo.
      </div>

      <div class="p-3 overflow-y-auto flex-1 divide-y divide-slate-100 custom-scroll text-xs" id="dep-modal-checklist">
        ${concepts.filter(c => String(c.id) !== String(target.id)).map(cand => {
          const isChecked = currentPreds.has(String(cand.id));
          const isCyclic = !isChecked && wouldCreateScheduleCycle(target.id, cand.id, concepts);
          return `
            <label class="py-2 px-2 flex items-center gap-2.5 rounded-lg ${isCyclic ? 'opacity-45 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-50 cursor-pointer'}">
              <input type="checkbox"
                     class="dep-pred-checkbox rounded border-slate-300 text-blue-600 cursor-pointer"
                     value="${cand.id}"
                     ${isChecked ? 'checked' : ''}
                     ${isCyclic ? 'disabled' : ''}>
              <span class="font-mono font-bold text-[11px] text-blue-700 w-16 shrink-0">${cand.clave}</span>
              <span class="flex-1 truncate text-slate-800">${cand.descripcion}</span>
              <span class="font-mono text-[10px] text-slate-500 shrink-0">${cand.endDate || ''} (${cand.durationDays}d)</span>
            </label>
          `;
        }).join('')}
      </div>

      <div class="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <button type="button" onclick="clearConceptDependenciesFromModal()" class="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer">
          Dejar inicio libre (sin predecesoras)
        </button>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeConceptDependenciesModal()" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold cursor-pointer">
            Cancelar
          </button>
          <button type="button" onclick="saveConceptDependenciesModal()" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer">
            Guardar Enlaces
          </button>
        </div>
      </div>
    </div>
  `;
}

export function closeConceptDependenciesModal() {
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-dependencias') : null;
  if (!modal) return;
  modal.className = 'hidden';
  currentDepModalConceptId = null;
}

export function clearConceptDependenciesFromModal() {
  if (!currentDepModalConceptId) return;
  const targetId = currentDepModalConceptId;
  closeConceptDependenciesModal();
  setConceptPredecessorsInModel(targetId, []);
  showToast('Se liberaron las predecesoras del concepto.');
  renderCalendarioObra();
}

export function saveConceptDependenciesModal() {
  if (!currentDepModalConceptId || typeof document === 'undefined') return;
  const container = document.getElementById('dep-modal-checklist');
  const checkboxes = container && container.querySelectorAll
    ? Array.from(container.querySelectorAll('.dep-pred-checkbox'))
    : [];
  const selectedIds = checkboxes.filter(chk => chk.checked).map(chk => String(chk.value));
  const targetId = currentDepModalConceptId;

  const res = setConceptPredecessorsInModel(targetId, selectedIds);
  if (!res || !res.ok) {
    showToast(res?.error || 'Error al guardar dependencias.', 'error');
    return;
  }

  closeConceptDependenciesModal();
  showToast(`✓ Dependencias actualizadas para ${res.clave} (${selectedIds.length} predecesora${selectedIds.length === 1 ? '' : 's'}).`);
  renderCalendarioObra();
}

// ------------------------------------------------------------
// MODAL ASISTENTE IA POR PROCESO CONSTRUCTIVO Y RUTA CRÍTICA
// ------------------------------------------------------------
export function openCalendarioAiModal() {
  if (!guardTabUnlocked('calendario')) return;
  const modal = ensureModalContainer('modal-calendario-ia');
  if (!modal) return;

  const cfg = getScheduleSettings();
  const detectedType = detectProjectWorkType();
  const savedApiKey = state.settings?.apiKey || '';

  modal.className = 'fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
      
      <!-- Cabecera Ejecutiva -->
      <div class="bg-gradient-to-r from-violet-700 via-indigo-700 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center text-amber-300 shadow-inner shrink-0">
            <i class="fa-solid fa-wand-magic-sparkles text-base"></i>
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold leading-tight">Asistente IA — Secuencia por Proceso Constructivo y Ruta Crítica</h3>
            <p class="text-[11px] text-indigo-100 mt-0.5">Analiza el Tipo de Obra, partidas, volúmenes APU y días inhábiles para proponer dependencias Fin-a-Inicio reales</p>
          </div>
        </div>
        <button type="button" onclick="closeCalendarioAiModal()" class="text-white/75 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer">
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- Cuerpo Configurable + Vista Previa -->
      <div class="p-4 overflow-y-auto flex-1 space-y-3.5 custom-scroll text-xs">
        
        <!-- Parámetros Constructivos -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <label class="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">1. Tipo de Obra / Giro</label>
            <select id="ai-cal-worktype" onchange="refreshCalendarioAiPreview()" class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 cursor-pointer">
              ${Object.values(WORK_TYPE_PROFILES).map(p => `
                <option value="${p.id}" ${p.id === detectedType ? 'selected' : ''}>${p.label}</option>
              `).join('')}
            </select>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
            <label class="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">2. Estrategia de Frentes</label>
            <select id="ai-cal-strategy" onchange="refreshCalendarioAiPreview()" class="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-violet-500 cursor-pointer">
              <option value="parallel">⚡ Optimizada: Frentes simultáneos</option>
              <option value="serial">📏 Conservadora: En serie (1 cuadrilla)</option>
            </select>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between">
            <label class="block text-[10.5px] font-bold text-slate-600 uppercase mb-1">3. Plazo Meta Opcional (días)</label>
            <div class="flex items-center gap-2">
              <input type="number" id="ai-cal-target-days" min="10" max="1500" placeholder="Auto (APU)" onchange="refreshCalendarioAiPreview()" class="w-28 bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-slate-800 outline-none focus:border-violet-500">
              <label class="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-700 cursor-pointer select-none" title="Respeta descansos semanales, festivos y lluvias configurados en Días Inhábiles">
                <input type="checkbox" id="ai-cal-respect-workdays" ${cfg.respectWorkdays !== false ? 'checked' : ''} onchange="refreshCalendarioAiPreview()" class="rounded text-violet-600 cursor-pointer">
                <span>Días hábiles</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Barra Opcional de Enriquecimiento con Google Gemini API -->
        <div class="bg-violet-50/70 border border-violet-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <i class="fa-solid fa-microchip text-violet-600 text-xs shrink-0"></i>
            <input type="password" id="ai-cal-api-key" value="${savedApiKey}" placeholder="API Key Gemini opcional (vacío = Motor Experto Constructivo instantáneo)" class="flex-1 min-w-[180px] bg-white border border-violet-200 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-700 outline-none focus:border-violet-500">
          </div>
          <button type="button" id="btn-ai-cal-gemini" onclick="runCalendarioGeminiAiProposal()" class="px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-[11px] font-bold shadow-2xs transition cursor-pointer flex items-center gap-1.5 shrink-0">
            <i class="fa-solid fa-robot text-[10px] text-amber-200"></i>
            <span>Consultar con Gemini IA</span>
          </button>
        </div>

        <!-- Explicación del Proceso Constructivo y KPIs de la Propuesta -->
        <div id="ai-cal-summary-box" class="bg-indigo-50/60 border border-indigo-200 rounded-xl p-3 space-y-2">
        </div>

        <!-- Tabla de Vista Previa de Conceptos, Etapas, Predecesoras y Ruta Crítica -->
        <div class="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div class="bg-slate-100 border-b border-slate-200 px-3 py-2 flex items-center justify-between text-[10.5px] font-bold text-slate-600 uppercase">
            <span>Vista previa de secuencia constructiva propuesta</span>
            <span id="ai-cal-table-meta" class="font-mono text-slate-700"></span>
          </div>
          <div class="max-h-60 overflow-y-auto custom-scroll divide-y divide-slate-100" id="ai-cal-preview-list">
          </div>
        </div>

      </div>

      <!-- Pie de Modal -->
      <div class="px-5 py-3 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <button type="button" onclick="clearAllCalendarioLinksAction()" class="text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:underline cursor-pointer flex items-center gap-1">
          <i class="fa-solid fa-link-slash text-[10px]"></i> Quitar enlaces actuales
        </button>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeCalendarioAiModal()" class="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer">
            Cancelar
          </button>
          <button type="button" id="btn-ai-cal-apply" onclick="applyCalendarioAiProposal()" class="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5">
            <i class="fa-solid fa-check text-xs"></i>
            <span>Aplicar al Diagrama de Gantt</span>
          </button>
        </div>
      </div>

    </div>
  `;

  refreshCalendarioAiPreview();
}

export function closeCalendarioAiModal() {
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  if (!modal) return;
  modal.className = 'hidden';
}

function readAiModalOptions() {
  const cfg = getScheduleSettings();
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  const q = (sel, fallbackId) => (modal?.querySelector ? modal.querySelector(sel) : null) || (typeof document !== 'undefined' ? document.getElementById(fallbackId) : null);

  const wtEl = q('#ai-cal-worktype', 'ai-cal-worktype');
  const stEl = q('#ai-cal-strategy', 'ai-cal-strategy');
  const tdEl = q('#ai-cal-target-days', 'ai-cal-target-days');
  const rwEl = q('#ai-cal-respect-workdays', 'ai-cal-respect-workdays');
  const akEl = q('#ai-cal-api-key', 'ai-cal-api-key');

  return {
    workType: wtEl?.value || detectProjectWorkType(),
    strategy: stEl?.value || 'parallel',
    targetDays: parseInt(tdEl?.value, 10) || 0,
    respectWorkdays: rwEl ? Boolean(rwEl.checked) : (cfg.respectWorkdays !== false),
    apiKey: akEl?.value || state.settings?.apiKey || '',
    startDate: cfg.startDate || '2026-05-01'
  };
}

function renderProposalIntoAiModal(proposal) {
  currentAiProposalPreview = proposal;
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  const findEl = (id) => (modal?.querySelector ? modal.querySelector(`#${id}`) : null) || (typeof document !== 'undefined' ? document.getElementById(id) : null);

  const summaryBox = findEl('ai-cal-summary-box');
  const listBox = findEl('ai-cal-preview-list');
  const metaEl = findEl('ai-cal-table-meta');

  if (!proposal || !proposal.ok) {
    if (summaryBox) {
      summaryBox.innerHTML = `<p class="text-rose-600 font-semibold">${proposal?.error || 'No hay conceptos disponibles para generar una propuesta.'}</p>`;
    }
    if (listBox) listBox.innerHTML = '';
    return;
  }

  const byId = new Map();
  proposal.tasks.forEach(t => byId.set(String(t.id), t));

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-bold text-indigo-900 flex items-center gap-1.5">
          <i class="fa-solid fa-compass-drafting text-indigo-600"></i>
          <span>${proposal.modelUsed || 'Motor Constructivo'}</span>
        </span>
        <div class="flex items-center gap-1.5 flex-wrap">
          ${proposal.savingsDays > 0
            ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10.5px] font-bold">⚡ Optimiza ${proposal.savingsDays} días vs serie</span>`
            : `<span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10.5px] font-semibold">Secuencia lineal en serie</span>`
          }
          <span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 text-[10.5px] font-bold">🔥 ${proposal.criticalCount} de ${proposal.tasks.length} críticos</span>
        </div>
      </div>
      <p class="text-[11.5px] text-slate-700 leading-relaxed">${proposal.reasoning}</p>
      <div class="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono">
        <div class="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
          <span class="text-[9.5px] text-slate-500 font-sans block uppercase font-bold">Inicio → Fin</span>
          <strong class="text-slate-800">${proposal.startDate} → ${proposal.endDate}</strong>
        </div>
        <div class="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
          <span class="text-[9.5px] text-slate-500 font-sans block uppercase font-bold">Plazo Total</span>
          <strong class="text-indigo-700">${proposal.totalNaturalDays}d nat. (${proposal.workingDays} háb.)</strong>
        </div>
        <div class="bg-white rounded-lg px-2.5 py-1.5 border border-indigo-100">
          <span class="text-[9.5px] text-slate-500 font-sans block uppercase font-bold">Enlaces Fin-a-Inicio</span>
          <strong class="text-emerald-700">${proposal.tasks.filter(t => t.predecessors.length > 0).length} dependencias</strong>
        </div>
      </div>
    `;
  }

  if (metaEl) {
    metaEl.textContent = `${proposal.tasks.length} conceptos • ${proposal.totalNaturalDays} días naturales`;
  }

  if (listBox) {
    listBox.innerHTML = proposal.tasks.map(t => {
      const predClaves = (t.predecessors || []).map(pid => byId.get(String(pid))?.clave || pid);
      return `
        <div class="px-3 py-2 flex items-center justify-between gap-2 text-[11px] ${t.isCritical ? 'bg-rose-50/40' : 'bg-white'} hover:bg-slate-50">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="font-mono font-bold ${t.isCritical ? 'text-rose-700' : 'text-blue-700'} w-14 shrink-0 truncate">${t.clave}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 text-[9.5px] font-semibold shrink-0 max-w-[140px] truncate" title="${t.stageName}">${t.stageName}</span>
            <span class="truncate text-slate-800" title="${t.descripcion}">${t.descripcion}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0 font-mono text-[10.5px]">
            <span class="px-1.5 py-0.5 rounded ${predClaves.length > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}" title="Predecesoras que deben terminar antes">
              ${predClaves.length > 0 ? `Tras: ${predClaves.join(', ')}` : 'Inicio día 1'}
            </span>
            <span class="w-10 text-center font-bold text-slate-800">${t.durationDays}d</span>
            ${t.isCritical
              ? `<span class="w-14 text-center px-1 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-300 font-bold text-[9.5px]">🔥 Crít.</span>`
              : `<span class="w-14 text-center px-1 py-0.5 rounded bg-slate-100 text-slate-600 text-[9.5px]">+${t.slackDays}d</span>`
            }
          </div>
        </div>
      `;
    }).join('');
  }
}

export function refreshCalendarioAiPreview() {
  const opts = readAiModalOptions();
  const proposal = generateLocalConstructiveProposal(opts);
  renderProposalIntoAiModal(proposal);
  return proposal;
}

export async function runCalendarioGeminiAiProposal() {
  const opts = readAiModalOptions();
  const modal = typeof document !== 'undefined' ? document.getElementById('modal-calendario-ia') : null;
  const btn = (modal?.querySelector ? modal.querySelector('#btn-ai-cal-gemini') : null) || (typeof document !== 'undefined' ? document.getElementById('btn-ai-cal-gemini') : null);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> <span>Analizando con Gemini...</span>`;
  }

  try {
    const aiProposal = await generateGeminiConstructiveProposal(opts);
    renderProposalIntoAiModal(aiProposal);
    showToast(`✨ Propuesta generada con ${aiProposal.modelUsed}`);
  } catch (err) {
    showToast(err?.message || 'No se pudo consultar Gemini IA; se mantiene la propuesta experta constructiva.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-robot text-[10px] text-amber-200"></i> <span>Consultar con Gemini IA</span>`;
    }
  }
}

export function applyCalendarioAiProposal() {
  if (!currentAiProposalPreview || !currentAiProposalPreview.ok) {
    currentAiProposalPreview = refreshCalendarioAiPreview();
  }
  if (!currentAiProposalPreview || !currentAiProposalPreview.ok) {
    showToast('No hay una propuesta válida para aplicar.', 'error');
    return;
  }

  const prop = currentAiProposalPreview;
  saveScheduleSettings({ viewMode: 'gantt', showCriticalPath: true, respectWorkdays: prop.respectWorkdays });
  applyScheduleProposalToModel(prop.tasks, prop.startDate, { respectWorkdays: prop.respectWorkdays });
  closeCalendarioAiModal();

  showToast(`✓ Propuesta constructiva aplicada: ${prop.totalNaturalDays} días y ${prop.criticalCount} conceptos en Ruta Crítica.`);
  renderCalendarioObra();
}


