// js/ui/interactiveTour.js
// Motor de Tour Guiado en Vivo (Onboarding Interactivo) para Cubikar (Alternativa 3)
// Cobertura completa del 100% de la aplicación en todas las pestañas y los 15 módulos.
// Incluye Foco de Luz (Spotlight), navegación automática entre pestañas y botón visible SALTAR TUTORIAL.

const STORAGE_KEY_TOUR_DISMISSED = 'cubikar_interactive_tour_dismissed_v1';
const STORAGE_KEY_TOUR_SESSION = 'cubikar_interactive_tour_session_v1';

let currentTourId = null;
let currentStepIndex = 0;
let activeTourSteps = [];
let isTourActive = false;
let resizeObserver = null;

function saveTourSessionState(tourId, stepIndex) {
  try {
    sessionStorage.setItem(STORAGE_KEY_TOUR_SESSION, JSON.stringify({
      tourId: tourId || 'master',
      stepIndex: stepIndex || 0,
      timestamp: Date.now()
    }));
  } catch (e) {}
}

function clearTourSessionState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY_TOUR_SESSION);
  } catch (e) {}
}

/**
 * Verifica si había un tour en curso antes de recargar la página (p.ej. al entrar a un proyecto)
 * y lo reanuda automáticamente en el paso exacto donde se encontraba.
 */
export function checkAndResumeTourOnLoad() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_TOUR_SESSION);
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (session && typeof session.stepIndex === 'number') {
      // Reanudar solo si la sesión se guardó hace menos de 5 minutos
      if (Date.now() - (session.timestamp || 0) < 300000) {
        clearTourSessionState();
        setTimeout(() => {
          startInteractiveTour(session.tourId || 'master', true, session.stepIndex);
        }, 400);
        return true;
      }
    }
  } catch (e) {
    clearTourSessionState();
  }
  return false;
}

// =========================================================================
// DEFINICIÓN DE TOURS: TOUR MAESTRO (16 MÓDULOS) + TOURS ESPECÍFICOS POR PESTAÑA
// =========================================================================

export const TOUR_DEFINITIONS = {
  // TOUR MAESTRO: RECORRIDO EN CADENA POR TODAS LAS PESTAÑAS (16 MÓDULOS)
  'master': {
    id: 'master',
    title: 'Tour Maestro • Los 16 Módulos de Cubikar',
    steps: [
      {
        tab: 'portal',
        target: '#btn-portal-nuevo-proyecto',
        fallbackTarget: '#projectScopeModeSelect',
        moduleBadge: 'Módulo 1 • Inicio',
        title: '1. Creación de Proyectos e Identidad',
        content: 'Desde aquí inicias el <strong>Asistente en 2 Pasos</strong>: asignas tu empresa, subes tu logotipo oficial con recorte 1:1 y configuras tu factor de sobrecosto (Indirectos y Utilidad).',
        position: 'bottom'
      },
      {
        tab: 'portal',
        target: '#projectScopeModeSelect',
        fallbackTarget: '#btn-workspace-plan-invite',
        moduleBadge: 'Módulo 2 • Modo de Trabajo',
        title: '2. Modo de Trabajo: Propias vs. Invitaciones',
        content: 'Alterna con un clic entre <strong>Mis proyectos</strong> (obras bajo tu suscripción) y proyectos compartidos donde colaboras como invitado con permisos asignados por otros despachos.',
        position: 'bottom'
      },
      {
        tab: 'portal',
        target: '#btn-workspace-plan-invite',
        fallbackTarget: '#projectScopeModeSelect',
        moduleBadge: 'Módulo 3 • Equipo',
        title: '3. Invitaciones y Permisos Granulares',
        content: 'Invita a tu equipo asignando roles de <strong>Editar</strong> (control total), <strong>Escribir</strong> (captura) o <strong>Leer</strong> (solo consulta). Puedes autorizar o restringir pestañas individualmente.',
        position: 'bottom'
      },
      {
        tab: 'presupuesto',
        target: '#header-project-name',
        fallbackTarget: '#header-company-name',
        moduleBadge: 'Módulo 3 • Obra Activa',
        title: '3. Encabezado y Membrete Institucional',
        content: 'Al ingresar a una obra, el logotipo de tu empresa, nombre del proyecto, sobrecosto y divisa quedan permanentemente vinculados para generar reportes oficiales en PDF.',
        position: 'bottom'
      },
      {
        tab: 'presupuesto',
        subtab: 'cat',
        target: '#subtab-btn-cat',
        fallbackTarget: '#tb1-container',
        moduleBadge: 'Módulo 4 • Presupuesto',
        title: '4. Catálogo de Conceptos y Presupuesto Base',
        content: 'Estructura partidas y conceptos con renumeración automática (1, 1.1). Edita directamente en celda y usa el atajo <strong>Alt + Flecha Arriba/Abajo</strong> para mover filas.',
        position: 'bottom'
      },
      {
        tab: 'presupuesto',
        subtab: 'cat',
        target: '#badge-sobrecosto',
        fallbackTarget: '#btn-toolbar-google-ia',
        moduleBadge: 'Módulo 5 • Matrices',
        title: '5. Análisis de Precios Unitarios (APU)',
        content: 'Cada concepto cuenta con su matriz APU desglosada en 4 rubros: <strong>Materiales, Mano de Obra con FASAR, Maquinaria y Subcontratos</strong>, calculando el precio de venta final.',
        position: 'right'
      },
      {
        tab: 'presupuesto',
        target: '#badge-sobrecosto',
        fallbackTarget: '#header-factor-display',
        moduleBadge: 'Módulo 6 • Sobrecosto',
        title: '6. Factor de Sobrecosto y Moneda',
        content: 'Fija los porcentajes oficiales de Indirectos (oficina y campo), Financiamiento, Utilidad y Fianzas. El sistema calcula el multiplicador en tiempo real.',
        position: 'right'
      },
      {
        tab: 'presupuesto',
        target: '#toolbar-ai-split-wrapper',
        fallbackTarget: '#btn-toolbar-google-ia',
        moduleBadge: 'Módulo 7 • IA Gemini',
        title: '7. Inteligencia Artificial y Google Search Grounding',
        content: 'Consulta precios vigentes de mercado en tiempo real o describe un trabajo en lenguaje común para que la IA formule la matriz APU con cuadrillas y rendimientos.',
        position: 'bottom'
      },
      {
        tab: 'presupuesto',
        subtab: 'insumos',
        target: '#subtab-btn-insumos',
        fallbackTarget: '#view-insumos',
        moduleBadge: 'Módulo 8 • Insumos',
        title: '8. Explosión y Consolidado de Insumos',
        content: 'Visualiza la suma global de todos los materiales y cuadrillas de la obra. Si cambias el precio de un insumo aquí, todas las matrices del presupuesto se actualizan en cascada.',
        position: 'bottom'
      },
      {
        tab: 'presupuesto',
        target: '#btn-sidebar-project-chat',
        fallbackTarget: '#sidebar-chat-icon',
        moduleBadge: 'Módulo 9 • Chat',
        title: '9. Chat del Proyecto y Bitácora Contextual',
        content: 'Comunícate con tu equipo en canales separados: <strong>Sección Técnica</strong> y <strong>Sección Financiera</strong>. Puedes mencionar a compañeros (@) y ligar notas a partidas de obra.',
        position: 'right'
      },
      {
        tab: 'compras',
        target: '#tab-btn-compras',
        fallbackTarget: '#view-compras',
        moduleBadge: 'Módulo 10 • Egresos',
        title: '10. Compras, Gastos y ERP Financiero',
        content: 'Dashboard con Presupuesto vs Gasto Real en vivo, registro de facturas con PDF, órdenes de compra oficiales con folio y semáforos de alerta de sobrecosto.',
        position: 'bottom'
      },
      {
        tab: 'bitacora',
        target: '#tab-btn-bitacora',
        fallbackTarget: '#view-bitacora',
        moduleBadge: 'Módulo 11 • Bitácora',
        title: '11. Bitácora Electrónica y Legal (LOPSRM / BESOP)',
        content: 'Folios inalterables (#001, #002), registro de clima, firmas táctiles manuscritas y <strong>sellado criptográfico SHA</strong> para compilar el Libro Completo de Bitácora en PDF.',
        position: 'bottom'
      },
      {
        tab: 'calendario',
        target: '#tab-btn-calendario',
        fallbackTarget: '#view-calendario',
        moduleBadge: 'Módulo 12 • Tiempos',
        title: '12. Calendario de Obra y Diagrama de Gantt',
        content: 'Cronograma visual ligado al presupuesto: ajusta duraciones, activa la <strong>Ruta Crítica</strong> para vigilar tareas clave y consulta el calendario financiero de cobros.',
        position: 'bottom'
      },
      {
        tab: 'estimaciones',
        target: '#tab-btn-estimaciones',
        fallbackTarget: '#view-estimaciones',
        moduleBadge: 'Módulo 13 • Cobros',
        title: '13. Estimaciones y Números Generadores',
        content: 'Genera cortes periódicos de cobro, captura volúmenes ejecutados, aplica amortización de anticipos y descarga la carátula oficial de estimación en PDF.',
        position: 'bottom'
      },
      {
        tab: 'presupuesto',
        target: '#btn-sidebar-import-modal',
        fallbackTarget: '#btn-sidebar-export-modal',
        moduleBadge: 'Módulo 14 • Importar/Exportar',
        title: '14. Importación Universal (Excel, Opus, Neodata)',
        content: 'Carga archivos de Excel (.xlsx, .xls), CSV o respaldos de Opus y Neodata con mapeo automático de columnas y procesamiento 100% offline.',
        position: 'right'
      },
      {
        tab: 'presupuesto',
        target: '#btn-lock-cat',
        fallbackTarget: '#workspace-user-btn',
        moduleBadge: 'Módulo 15 • Seguridad',
        title: '15. Seguridad, Tab Lock y Respaldos',
        content: 'Protege tu obra con el candado <strong>Tab Lock</strong> para impedir cambios involuntarios, descarga respaldos locales .JSON y alterna entre Modo Día y Modo Nocturno.',
        position: 'bottom'
      }
    ]
  },

  // TOURS INDIVIDUALES POR PESTAÑA
  'portal': {
    id: 'portal',
    title: 'Tour • Mis Proyectos de Obra',
    steps: [
      {
        target: '#btn-portal-nuevo-proyecto',
        fallbackTarget: '#portal-top-new-project-btn',
        moduleBadge: 'Paso 1: Nuevo Proyecto',
        title: 'Crear Nuevo Proyecto',
        content: 'Haz clic aquí para abrir el Asistente en 2 Pasos y dar de alta tu primera obra con logotipo, datos de empresa y sobrecosto.',
        position: 'bottom'
      },
      {
        target: '#projectScopeModeSelect',
        fallbackTarget: '#btn-workspace-plan-invite',
        moduleBadge: 'Paso 2: Modo de Trabajo',
        title: 'Obras Propias vs. Invitaciones',
        content: 'Filtra rápidamente entre tus obras personales y los proyectos donde colaboras como invitado con acceso restringido.',
        position: 'bottom'
      },
      {
        target: '#searchInput',
        fallbackTarget: '#portal-search-input',
        moduleBadge: 'Paso 3: Búsqueda Rápida',
        title: 'Buscador Instantáneo',
        content: 'Localiza cualquier presupuesto en milisegundos por nombre de obra, cliente o ubicación.',
        position: 'bottom'
      },
      {
        target: '#btn-portal-notifications',
        fallbackTarget: '#btn-sidebar-notifications',
        moduleBadge: 'Paso 4: Notificaciones',
        title: 'Campana de Alertas Globales',
        content: 'Te avisa de menciones (@Usuario) en el chat de obra, invitaciones recibidas y avisos de consumo.',
        position: 'bottom'
      },
      {
        target: '#btn-portal-tutorial-hub',
        fallbackTarget: '#btn-portal-info',
        moduleBadge: 'Paso 5: Centro de Ayuda',
        title: 'Tutoriales y Video-Simulador',
        content: 'Vuelve a abrir este tour interactivo o consulta los videos de los 15 módulos cuando lo necesites.',
        position: 'bottom'
      }
    ]
  },

  'compras': {
    id: 'compras',
    title: 'Tour • Compras y ERP Financiero',
    steps: [
      {
        tab: 'compras',
        target: '#tab-btn-compras',
        fallbackTarget: '#view-compras',
        moduleBadge: '1. Tablero Financiero',
        title: 'Presupuesto vs. Gasto Real',
        content: 'Indicadores en tiempo real del presupuesto contratado, egresos acumulados, cuentas por pagar y saldo de obra.',
        position: 'bottom'
      },
      {
        tab: 'compras',
        target: '#view-compras',
        fallbackTarget: '#tab-btn-compras',
        moduleBadge: '2. Registro de Compras',
        title: 'Captura de Facturas y Egresos',
        content: 'Registra compras con desglose de IVA, clasifícalas por rubro y adjunta comprobantes o facturas PDF respaldadas en la nube.',
        position: 'top'
      }
    ]
  },

  'bitacora': {
    id: 'bitacora',
    title: 'Tour • Bitácora Legal de Obra',
    steps: [
      {
        tab: 'bitacora',
        target: '#tab-btn-bitacora',
        fallbackTarget: '#view-bitacora',
        moduleBadge: '1. Libro de Bitácora',
        title: 'Notas Oficiales con Folio Inmutable',
        content: 'Genera notas oficiales foliadas correlativamente (#001, #002) conforme a normativa de obra pública y privada.',
        position: 'bottom'
      },
      {
        tab: 'bitacora',
        target: '#view-bitacora',
        fallbackTarget: '#tab-btn-bitacora',
        moduleBadge: '2. Firmas y Sellado',
        title: 'Firma Digital y Hash de Integridad',
        content: 'Firma en panel táctil y sella la nota para congelarla con un Hash criptográfico SHA que certifica su inviolabilidad.',
        position: 'top'
      }
    ]
  }
};

// =========================================================================
// MÉTODOS DE CONTROL DEL TOUR GUIADO
// =========================================================================

export function isTourDismissed(tourId = null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOUR_DISMISSED);
    if (!raw) return false;
    const dismissed = JSON.parse(raw);
    if (tourId) return Boolean(dismissed && (dismissed[tourId] === true || dismissed['all'] === true));
    return Boolean(dismissed && (dismissed === true || dismissed['all'] === true));
  } catch (e) {
    return false;
  }
}

export function setTourDismissed(tourId = null, dismissed = true) {
  try {
    let current = {};
    const raw = localStorage.getItem(STORAGE_KEY_TOUR_DISMISSED);
    if (raw) {
      try { current = JSON.parse(raw); } catch (e) { current = {}; }
      if (typeof current !== 'object' || current === null) current = {};
    }
    if (tourId) current[tourId] = Boolean(dismissed);
    else current['all'] = Boolean(dismissed);
    localStorage.setItem(STORAGE_KEY_TOUR_DISMISSED, JSON.stringify(current));
  } catch (e) {}
}

export function resetTourDismissedStatus() {
  try {
    localStorage.removeItem(STORAGE_KEY_TOUR_DISMISSED);
  } catch (e) {}
}

/**
 * Inicia el Tour Guiado interactivo
 * @param {string} tourId - 'master' (15 módulos) | 'portal' | 'compras' | 'bitacora'
 * @param {boolean} forceStart - Si es true, inicia aunque haya sido saltado previamente
 * @param {number} initialStepIndex - Índice del paso en el que debe iniciar o reanudarse
 */
export function startInteractiveTour(tourId = 'master', forceStart = true, initialStepIndex = 0) {
  const def = TOUR_DEFINITIONS[tourId] || TOUR_DEFINITIONS.master;
  currentTourId = def.id;
  activeTourSteps = (def.steps || []).filter(Boolean);

  if (activeTourSteps.length === 0) return false;

  // Si el usuario ya está dentro del workspace y lanza el tour maestro desde el workspace
  // sin especificar un paso específico, iniciar en el paso 3 (Módulo 3: Obra Activa)
  // para no interrumpir su trabajo ni recargar la página.
  if (tourId === 'master' && initialStepIndex === 0) {
    const workspaceContainer = document.getElementById('workspace-container');
    const isWorkspaceVisible = workspaceContainer && !workspaceContainer.classList.contains('hidden') && workspaceContainer.style.display !== 'none';
    if (isWorkspaceVisible) {
      initialStepIndex = 2; // Índice 2 es el Paso 3 (Módulo 3: Encabezado y Membrete Institucional)
    }
  }

  currentStepIndex = Math.min(Math.max(0, initialStepIndex), activeTourSteps.length - 1);

  isTourActive = true;
  saveTourSessionState(currentTourId, currentStepIndex);
  injectTourDomElements();
  executeCurrentStep();
  setupKeyboardNavigation();

  if (window.ResizeObserver && !resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      if (isTourActive) positionTourElements();
    });
    resizeObserver.observe(document.body);
  }

  return true;
}

/**
 * Ejecuta y muestra el paso actual navegando entre pestañas automáticamente
 */
function executeCurrentStep() {
  if (!isTourActive || !activeTourSteps[currentStepIndex]) return;

  const step = activeTourSteps[currentStepIndex];

  // Si el paso requiere una pestaña específica de la aplicación, conmutar a ella
  if (step.tab) {
    if (step.tab === 'portal') {
      const viewPortal = document.getElementById('view-portal');
      const workspace = document.getElementById('workspace-container');
      if (workspace && (!viewPortal || viewPortal.classList.contains('hidden') || viewPortal.style.display === 'none')) {
        // Conmutar a la vista del portal limpiamente en memoria
        if (typeof window.goToProjectsDashboard === 'function') {
          try { window.goToProjectsDashboard(); } catch (_) {}
        }
        if (viewPortal) {
          viewPortal.classList.remove('hidden');
          viewPortal.style.display = '';
        }
        if (workspace) {
          workspace.classList.add('hidden');
          workspace.style.display = 'none';
        }
      }
    } else {
      // El paso pertenece a una pestaña del espacio de trabajo (presupuesto, compras, bitácora, etc.):
      const viewPortal = document.getElementById('view-portal');
      const workspace = document.getElementById('workspace-container');
      const isViewingPortal = viewPortal && !viewPortal.classList.contains('hidden') && viewPortal.style.display !== 'none';

      if (isViewingPortal && workspace) {
        // Conmutar instantáneamente al Workspace en memoria (SPA sin recarga forzada para no perder el tour)
        viewPortal.classList.add('hidden');
        viewPortal.style.display = 'none';
        workspace.classList.remove('hidden');
        workspace.style.display = 'flex';
        if (document.documentElement?.classList) document.documentElement.classList.remove('portal-active');
        if (document.body?.classList) document.body.classList.remove('portal-active');

        if (typeof window.renderTAB1 === 'function') {
          try { window.renderTAB1(); } catch (_) {}
        }
        if (typeof window.renderHeaderCollaborators === 'function') {
          try { window.renderHeaderCollaborators(); } catch (_) {}
        }
      }

      // Conmutar a la pestaña requerida del workspace
      if (typeof window.switchTab === 'function') {
        try {
          window.switchTab(step.tab);
          if (step.subtab && typeof window.switchPresupuestoSubTab === 'function') {
            window.switchPresupuestoSubTab(step.subtab);
          }
        } catch (e) {}
      }
    }
  }

  // Guardar estado actual de sesión
  saveTourSessionState(currentTourId, currentStepIndex);

  // Dar tiempo a la transición y renderizado de la pestaña
  setTimeout(() => {
    const targetEl = resolveStepTarget(step);
    if (targetEl && typeof targetEl.scrollIntoView === 'function') {
      try {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch (e) {}
    }

    renderTourCard(step, targetEl);
    highlightTargetElement(targetEl, step.highlightPadding || 8);
  }, 180);
}

function resolveStepTarget(step) {
  if (!step) return null;
  let el = null;
  if (step.target) {
    try { el = document.querySelector(step.target); } catch (e) {}
  }
  if (!el && step.fallbackTarget) {
    try { el = document.querySelector(step.fallbackTarget); } catch (e) {}
  }
  if (!el) return null;

  // Comprobar visibilidad geométrica real en pantalla (soporta fixed, sticky, flex)
  const rect = el.getBoundingClientRect();
  const isVisible = rect.width > 0 && rect.height > 0;
  return isVisible ? el : (el.offsetParent !== null ? el : null);
}

function injectTourDomElements() {
  let overlay = document.getElementById('cubikar-tour-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cubikar-tour-overlay';
    overlay.className = 'fixed inset-0 pointer-events-none transition-all duration-200';
    overlay.style.zIndex = '99990';
    overlay.innerHTML = `
      <svg id="cubikar-tour-svg-mask" class="w-full h-full absolute inset-0 pointer-events-auto" style="fill: rgba(15, 23, 42, 0.82);">
        <defs>
          <mask id="cubikar-tour-mask-cutout">
            <rect width="100%" height="100%" fill="white" />
            <rect id="cubikar-tour-cutout-rect" x="0" y="0" width="0" height="0" rx="12" ry="12" fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#cubikar-tour-mask-cutout)" />
      </svg>
      <div id="cubikar-tour-focus-ring" class="absolute pointer-events-none transition-all duration-200 ring-4 ring-blue-500 shadow-[0_0_35px_rgba(59,130,246,0.7)] rounded-xl" style="display: none;"></div>
    `;
    document.body.appendChild(overlay);
  }

  let card = document.getElementById('cubikar-tour-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'cubikar-tour-card';
    card.className = 'fixed bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4 sm:p-5 w-[92vw] sm:w-[420px] max-w-[450px] pointer-events-auto transition-all duration-200 animate-in fade-in zoom-in-95';
    card.style.zIndex = '99995';
    document.body.appendChild(card);
  }
}

function highlightTargetElement(targetEl, padding = 8) {
  const cutoutRect = document.getElementById('cubikar-tour-cutout-rect');
  const focusRing = document.getElementById('cubikar-tour-focus-ring');
  if (!cutoutRect || !focusRing) return;

  if (!targetEl) {
    cutoutRect.setAttribute('x', '0');
    cutoutRect.setAttribute('y', '0');
    cutoutRect.setAttribute('width', '0');
    cutoutRect.setAttribute('height', '0');
    focusRing.style.display = 'none';
    return;
  }

  const rect = targetEl.getBoundingClientRect();
  const pad = Math.max(4, padding);
  const x = Math.max(0, rect.left - pad);
  const y = Math.max(0, rect.top - pad);
  const width = rect.width + (pad * 2);
  const height = rect.height + (pad * 2);

  cutoutRect.setAttribute('x', String(x));
  cutoutRect.setAttribute('y', String(y));
  cutoutRect.setAttribute('width', String(width));
  cutoutRect.setAttribute('height', String(height));
  cutoutRect.setAttribute('rx', '12');
  cutoutRect.setAttribute('ry', '12');

  focusRing.style.display = 'block';
  focusRing.style.left = `${x}px`;
  focusRing.style.top = `${y}px`;
  focusRing.style.width = `${width}px`;
  focusRing.style.height = `${height}px`;
}

function renderTourCard(step, targetEl) {
  const card = document.getElementById('cubikar-tour-card');
  if (!card) return;

  const totalSteps = activeTourSteps.length;
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === totalSteps - 1;

  card.innerHTML = `
    <!-- Encabezado con Insignia, Título y Botón Saltar -->
    <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
      <div class="space-y-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center gap-1">
            <i class="fa-solid fa-graduation-cap text-[9px]"></i>
            ${step.moduleBadge || `Paso ${currentStepIndex + 1} de ${totalSteps}`}
          </span>
          <span class="text-[11px] font-mono text-slate-400 font-bold">
            ${currentStepIndex + 1} / ${totalSteps}
          </span>
        </div>
        <h3 class="font-bold text-sm text-white tracking-tight leading-snug">
          ${step.title || 'Guía de Usuario'}
        </h3>
      </div>

      <!-- Botón de Cierre / Saltar Rápido (✕) -->
      <button type="button" onclick="window.skipInteractiveTourAction(false)"
              class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
              title="Saltar Tutorial">
        <i class="fa-solid fa-xmark text-xs"></i>
      </button>
    </div>

    <!-- Explicación del Paso -->
    <div class="py-3 text-xs text-slate-300 leading-relaxed font-normal">
      ${step.content || ''}
    </div>

    <!-- Barra de Navegación y Botón SALTAR TUTORIAL -->
    <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 select-none">
      <button type="button" onclick="window.skipInteractiveTourAction(true)"
              class="text-xs text-slate-400 hover:text-rose-400 font-bold flex items-center gap-1.5 transition cursor-pointer group py-1"
              title="Saltar y cerrar el tutorial ahora">
        <i class="fa-solid fa-forward-step text-[10px] group-hover:translate-x-0.5 transition-transform"></i>
        <span>Saltar Tutorial</span>
      </button>

      <div class="flex items-center gap-2">
        ${!isFirst ? `
          <button type="button" onclick="window.prevInteractiveTourStep()"
                  class="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer flex items-center gap-1 shadow-xs">
            <i class="fa-solid fa-arrow-left text-[10px]"></i>
            <span class="hidden sm:inline">Anterior</span>
          </button>
        ` : ''}

        <button type="button" onclick="window.nextInteractiveTourStep()"
                class="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-600/30">
          <span>${isLast ? '¡Finalizar Tour!' : 'Siguiente'}</span>
          <i class="fa-solid ${isLast ? 'fa-check' : 'fa-arrow-right'} text-[10px]"></i>
        </button>
      </div>
    </div>
  `;

  positionTourElements();
}

function positionTourElements() {
  const card = document.getElementById('cubikar-tour-card');
  if (!card || !isTourActive) return;

  const step = activeTourSteps[currentStepIndex];
  const targetEl = resolveStepTarget(step);

  if (!targetEl) {
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const rect = targetEl.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 14;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = 0;
  let top = 0;
  const prefPos = step.position || 'bottom';

  if (prefPos === 'bottom') {
    top = rect.bottom + margin;
    left = rect.left + (rect.width / 2) - (cardRect.width / 2);
    if (top + cardRect.height > viewportHeight - 10) {
      top = rect.top - cardRect.height - margin;
    }
  } else if (prefPos === 'top') {
    top = rect.top - cardRect.height - margin;
    left = rect.left + (rect.width / 2) - (cardRect.width / 2);
    if (top < 10) top = rect.bottom + margin;
  } else if (prefPos === 'left') {
    top = rect.top + (rect.height / 2) - (cardRect.height / 2);
    left = rect.left - cardRect.width - margin;
    if (left < 10) left = rect.right + margin;
  } else if (prefPos === 'right') {
    top = rect.top + (rect.height / 2) - (cardRect.height / 2);
    left = rect.right + margin;
    if (left + cardRect.width > viewportWidth - 10) left = rect.left - cardRect.width - margin;
  }

  left = Math.max(12, Math.min(left, viewportWidth - cardRect.width - 12));
  top = Math.max(12, Math.min(top, viewportHeight - cardRect.height - 12));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.transform = 'none';
}

export function nextInteractiveTourStep() {
  if (!isTourActive) return;
  if (currentStepIndex < activeTourSteps.length - 1) {
    currentStepIndex++;
    executeCurrentStep();
  } else {
    closeInteractiveTour(true);
  }
}

export function prevInteractiveTourStep() {
  if (!isTourActive) return;
  if (currentStepIndex > 0) {
    currentStepIndex--;
    executeCurrentStep();
  }
}

export function skipInteractiveTour(persistDismissal = true) {
  if (persistDismissal) {
    setTourDismissed(currentTourId, true);
  }
  closeInteractiveTour(false);
}

export function closeInteractiveTour(completed = false) {
  isTourActive = false;
  currentTourId = null;
  activeTourSteps = [];
  currentStepIndex = 0;
  clearTourSessionState();

  const overlay = document.getElementById('cubikar-tour-overlay');
  if (overlay) overlay.remove();

  const card = document.getElementById('cubikar-tour-card');
  if (card) card.remove();

  teardownKeyboardNavigation();

  if (completed && typeof window.showToast === 'function') {
    window.showToast('🎉 ¡Felicidades! Has completado el recorrido completo de Cubikar.', 'success');
  }
}

function onTourKeyDown(e) {
  if (!isTourActive) return;
  if (e.key === 'Escape') skipInteractiveTour(true);
  else if (e.key === 'ArrowRight' || e.key === 'Enter') nextInteractiveTourStep();
  else if (e.key === 'ArrowLeft') prevInteractiveTourStep();
}

function setupKeyboardNavigation() {
  window.addEventListener('keydown', onTourKeyDown);
}

function teardownKeyboardNavigation() {
  window.removeEventListener('keydown', onTourKeyDown);
}

if (typeof window !== 'undefined') {
  window.startInteractiveTour = startInteractiveTour;
  window.nextInteractiveTourStep = nextInteractiveTourStep;
  window.prevInteractiveTourStep = prevInteractiveTourStep;
  window.skipInteractiveTourAction = (persist = true) => skipInteractiveTour(persist);
  window.closeInteractiveTour = closeInteractiveTour;
  window.resetTourDismissedStatus = resetTourDismissedStatus;
}
