// js/ui/interactiveTour.js
// Motor de Tour Guiado en Vivo (Onboarding Interactivo) para Cubikar
// Resalta elementos clave con un foco de atención (Spotlight), tarjeta explicativa animada,
// navegación paso a paso y botón para SALTAR el tutorial con persistencia.

const STORAGE_KEY_TOUR_DISMISSED = 'cubikar_interactive_tour_dismissed_v1';
const STORAGE_KEY_TOUR_PREFS = 'cubikar_interactive_tour_prefs_v1';

let currentTourId = null;
let currentStepIndex = 0;
let activeTourSteps = [];
let isTourActive = false;
let resizeObserver = null;

// =========================================================================
// DEFINICIÓN DE TOURS DISPONIBLES POR PANTALLA / MÓDULO
// =========================================================================

export const TOUR_DEFINITIONS = {
  // 1. TOUR DEL PORTAL GENERAL (Mis Proyectos de Obra)
  'portal': {
    id: 'portal',
    title: 'Tour de Inicio • Mis Proyectos de Obra',
    steps: [
      {
        target: '#btn-portal-nuevo-proyecto',
        fallbackTarget: '#portal-top-new-project-btn',
        title: '¡Crea tu Primera Obra!',
        moduleBadge: 'Paso 1: Nuevo Proyecto',
        content: 'Haz clic aquí para abrir el <strong>Asistente en 2 Pasos</strong>. Podrás configurar el nombre de tu empresa, subir tu logotipo oficial, fijar el sobrecosto y elegir una plantilla en blanco o de muestra.',
        position: 'bottom',
        highlightPadding: 8
      },
      {
        target: '#projectScopeModeSelect',
        fallbackTarget: '#btn-workspace-plan-invite',
        title: 'Organización de Espacios de Trabajo',
        moduleBadge: 'Paso 2: Modo y Alcance',
        content: 'Filtra rápidamente entre <strong>Tus Obras Propias</strong> y los <strong>Proyectos donde colaboras como Invitado</strong>. Cubikar aísla los datos y presupuestos de cada cliente con total seguridad.',
        position: 'bottom',
        highlightPadding: 6
      },
      {
        target: '#searchInput',
        fallbackTarget: '#portal-search-input',
        title: 'Búsqueda Instantánea de Obras',
        moduleBadge: 'Paso 3: Búsqueda Rápida',
        content: 'Localiza cualquier presupuesto en milisegundos por nombre, empresa o ciudad conforme crece tu cartera de proyectos.',
        position: 'bottom',
        highlightPadding: 6
      },
      {
        target: '#btn-portal-notifications',
        fallbackTarget: '#btn-sidebar-notifications',
        title: 'Centro de Notificaciones y Menciones',
        moduleBadge: 'Paso 4: Notificaciones',
        content: 'La campana te avisará cuando te mencionen con <strong>@Usuario</strong> en el chat de cualquier obra, cuando recibas <strong>invitaciones a colaborar</strong> o cuando haya alertas de consumo.',
        position: 'bottom',
        highlightPadding: 8
      },
      {
        target: '#btn-portal-tutorial-hub',
        fallbackTarget: '#btn-portal-info',
        title: 'Centro de Tutoriales y Ayuda',
        moduleBadge: 'Paso 5: Aprende a tu Ritmo',
        content: 'Puedes volver a abrir este <strong>Tour Guiado en Vivo</strong> o consultar el <strong>Video-Simulador con los 15 módulos</strong> en cualquier momento desde este botón.',
        position: 'bottom',
        highlightPadding: 8
      }
    ]
  },

  // 2. TOUR DEL ÁREA DE TRABAJO (Catálogo Base, APU, Chat y Barra Lateral)
  'workspace': {
    id: 'workspace',
    title: 'Tour General • Área de Trabajo de Presupuestos',
    steps: [
      {
        target: '#company-logo-img',
        fallbackTarget: '#header-project-name',
        title: 'Identidad y Membrete Oficial',
        moduleBadge: '1. Encabezado Institucional',
        content: 'Aquí se sincronizan el <strong>logotipo de tu empresa</strong>, el nombre de la obra, la ubicación y la fecha. Todos los reportes PDF oficiales llevarán este membrete automático.',
        position: 'bottom',
        highlightPadding: 10
      },
      {
        target: '#nav-tab-cat',
        fallbackTarget: '#workspace-tabs-container',
        title: 'Pestañas de Módulos Integrados',
        moduleBadge: '2. Navegación Modular',
        content: 'Alterna entre el <strong>Catálogo Base</strong>, <strong>Insumos Generales</strong>, <strong>Calendario Gantt</strong>, <strong>Estimaciones</strong>, <strong>Compras y Pagos</strong> y la <strong>Bitácora Legal de Obra</strong>.',
        position: 'bottom',
        highlightPadding: 6
      },
      {
        target: '#btn-add-partida-n1',
        fallbackTarget: '#btn-add-concept',
        title: 'Estructuración Jerárquica',
        moduleBadge: '3. Agregar Partidas y Conceptos',
        content: 'Crea Partidas (Nivel 1), Subpartidas y Conceptos con renumeración automática (1, 1.1, 1.1.1). Usa el atajo <strong>Alt + Flecha Arriba/Abajo</strong> para reordenar filas.',
        position: 'bottom',
        highlightPadding: 6
      },
      {
        target: '#badge-sobrecosto',
        fallbackTarget: '#header-factor-display',
        title: 'Factor de Sobrecosto Dinámico',
        moduleBadge: '4. Indirectos y Utilidad',
        content: 'Configura tus porcentajes de Indirectos, Financiamiento, Utilidad y FASAR. El sistema calcula en tiempo real el paso de Costo Directo a Precio Unitario de Venta.',
        position: 'right',
        highlightPadding: 8
      },
      {
        target: '#btn-sidebar-project-chat',
        fallbackTarget: '#chat-dock-toggle-btn',
        title: 'Chat y Bitácora Contextual',
        moduleBadge: '5. Chat de Obra',
        content: 'Abre la ventana de chat para comunicarte con tu equipo. Puedes filtrar por <strong>Sección Técnica</strong> o <strong>Financiera</strong> y hacer comentarios directos en cada concepto del catálogo.',
        position: 'right',
        highlightPadding: 8
      },
      {
        target: '#btn-ai-split-menu',
        fallbackTarget: '#btn-ai-matrix-generate',
        title: 'Inteligencia Artificial con Google Search',
        moduleBadge: '6. Asistente con IA',
        content: 'Investiga costos de mercado en tiempo real mediante <strong>Google Search Grounding</strong> o genera matrices completas de precios unitarios con Gemini a partir de una descripción.',
        position: 'bottom',
        highlightPadding: 6
      }
    ]
  },

  // 3. TOUR DEL MÓDULO DE COMPRAS Y PAGOS
  'compras': {
    id: 'compras',
    title: 'Tour • Compras, Gastos y ERP Financiero',
    steps: [
      {
        target: '#expenses-kpi-banner',
        fallbackTarget: '#view-compras',
        title: 'Tablero de Control Financiero (KPIs)',
        moduleBadge: '1. Métricas en Tiempo Real',
        content: 'Monitorea de un vistazo el <strong>Presupuesto Total Contratado</strong>, el <strong>Gasto Real Acumulado</strong>, las <strong>Cuentas por Pagar</strong> y el <strong>Saldo Remanente</strong> de la obra.',
        position: 'bottom',
        highlightPadding: 8
      },
      {
        target: '#btn-new-expense-record',
        fallbackTarget: '#expenses-subtab-bitacora',
        title: 'Registro de Egresos y Facturas',
        moduleBadge: '2. Captura de Gastos',
        content: 'Registra compras con desglose de IVA, clasifícalas por rubro (Materiales, Mano de Obra, Subcontratos) y adjunta <strong>facturas PDF o fotos de tickets</strong> respaldadas en la nube.',
        position: 'bottom',
        highlightPadding: 6
      },
      {
        target: '#expenses-subtab-comparativa',
        fallbackTarget: '#expenses-filter-status',
        title: 'Comparativa Presupuesto vs. Real',
        moduleBadge: '3. Semáforos de Desvío',
        content: 'Confronta en tiempo real los insumos planeados contra lo efectivamente comprado. Los semáforos en rojo te alertarán si hay sobrecostos antes de que afecten tu utilidad.',
        position: 'bottom',
        highlightPadding: 6
      }
    ]
  },

  // 4. TOUR DE LA BITÁCORA LEGAL DE OBRA
  'bitacora': {
    id: 'bitacora',
    title: 'Tour • Bitácora Electrónica y Legal (LOPSRM / BESOP)',
    steps: [
      {
        target: '#btn-new-bitacora-note',
        fallbackTarget: '#view-bitacora',
        title: 'Nueva Nota Oficial de Bitácora',
        moduleBadge: '1. Apertura de Notas',
        content: 'Genera notas oficiales con folios consecutivos inalterables (#001, #002), condiciones de clima, vinculación a conceptos del catálogo y fotografías con visor.',
        position: 'bottom',
        highlightPadding: 6
      },
      {
        target: '#bitacora-timeline-container',
        fallbackTarget: '#bitacora-search-input',
        title: 'Línea de Tiempo Legal y Criptoseguridad',
        moduleBadge: '2. Inviolabilidad de Notas',
        content: 'Cada nota sellada genera un <strong>Hash criptográfico</strong> que certifica que no ha sido alterada. Incluye <strong>firma manuscrita digital</strong> con panel táctil.',
        position: 'top',
        highlightPadding: 8
      },
      {
        target: '#btn-download-full-bitacora-book',
        fallbackTarget: '#btn-bitacora-export-pdf',
        title: 'Descarga del Libro Completo de Bitácora',
        moduleBadge: '3. Encuadernado Oficial en PDF',
        content: 'Compila en un solo clic todas las notas, actas, firmas y evidencias fotográficas en un <strong>Libro de Bitácora oficial</strong> foliado listo para auditoría o entrega.',
        position: 'bottom',
        highlightPadding: 6
      }
    ]
  }
};

// =========================================================================
// MÉTODOS DE PERSISTENCIA Y PREFERENCIAS
// =========================================================================

export function isTourDismissed(tourId = null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOUR_DISMISSED);
    if (!raw) return false;
    const dismissed = JSON.parse(raw);
    if (tourId) {
      return Boolean(dismissed && (dismissed === true || dismissed[tourId] === true || dismissed['all'] === true));
    }
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
    if (tourId) {
      current[tourId] = Boolean(dismissed);
    } else {
      current['all'] = Boolean(dismissed);
    }
    localStorage.setItem(STORAGE_KEY_TOUR_DISMISSED, JSON.stringify(current));
  } catch (e) {}
}

export function resetTourDismissedStatus() {
  try {
    localStorage.removeItem(STORAGE_KEY_TOUR_DISMISSED);
  } catch (e) {}
}

// =========================================================================
// MOTOR PRINCIPAL DEL TOUR
// =========================================================================

/**
 * Inicia un tour guiado interactivo por ID
 * @param {string} tourId - 'portal' | 'workspace' | 'compras' | 'bitacora'
 * @param {boolean} forceStart - Si es true, inicia aunque haya sido saltado previamente
 */
export function startInteractiveTour(tourId = 'portal', forceStart = false) {
  if (!forceStart && isTourDismissed(tourId)) {
    return false;
  }

  const def = TOUR_DEFINITIONS[tourId] || TOUR_DEFINITIONS.portal;
  currentTourId = def.id;
  activeTourSteps = (def.steps || []).filter(s => Boolean(s));
  currentStepIndex = 0;

  if (activeTourSteps.length === 0) {
    console.warn(`[Tour] No hay pasos definidos para el tour: ${tourId}`);
    return false;
  }

  isTourActive = true;
  injectTourDomElements();
  showCurrentStep();
  setupKeyboardNavigation();

  // Escuchar redimensionamiento para reposicionar la tarjeta
  if (window.ResizeObserver && !resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      if (isTourActive) positionTourElements();
    });
    resizeObserver.observe(document.body);
  }

  return true;
}

/**
 * Muestra el paso actual del tour activo
 */
function showCurrentStep() {
  if (!isTourActive || !activeTourSteps[currentStepIndex]) return;

  const step = activeTourSteps[currentStepIndex];
  const targetEl = resolveStepTarget(step);

  // Asegurar visibilidad haciendo scroll suave si es necesario
  if (targetEl && typeof targetEl.scrollIntoView === 'function') {
    try {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch (e) {}
  }

  setTimeout(() => {
    renderTourCard(step, targetEl);
    highlightTargetElement(targetEl, step.highlightPadding || 8);
  }, 80);
}

/**
 * Resuelve el elemento HTML objetivo del paso
 */
function resolveStepTarget(step) {
  if (!step) return null;
  let el = null;
  if (step.target) {
    try { el = document.querySelector(step.target); } catch (e) {}
  }
  if (!el && step.fallbackTarget) {
    try { el = document.querySelector(step.fallbackTarget); } catch (e) {}
  }
  return (el && el.offsetParent !== null) ? el : null;
}

/**
 * Inyecta los contenedores HTML del tour en el body si no existen
 */
function injectTourDomElements() {
  let overlay = document.getElementById('cubikar-tour-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cubikar-tour-overlay';
    overlay.className = 'fixed inset-0 pointer-events-none transition-all duration-200';
    overlay.style.zIndex = '99990';
    overlay.innerHTML = `
      <!-- Máscara SVG con recorte dinámico (Spotlight) -->
      <svg id="cubikar-tour-svg-mask" class="w-full h-full absolute inset-0 pointer-events-auto" style="fill: rgba(15, 23, 42, 0.78);">
        <defs>
          <mask id="cubikar-tour-mask-cutout">
            <rect width="100%" height="100%" fill="white" />
            <rect id="cubikar-tour-cutout-rect" x="0" y="0" width="0" height="0" rx="12" ry="12" fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#cubikar-tour-mask-cutout)" />
      </svg>
      <!-- Anillo pulsante que enmarca el elemento enfocado -->
      <div id="cubikar-tour-focus-ring" class="absolute pointer-events-none transition-all duration-200 ring-4 ring-blue-500/90 shadow-[0_0_30px_rgba(59,130,246,0.6)] rounded-xl" style="display: none;"></div>
    `;
    document.body.appendChild(overlay);
  }

  let card = document.getElementById('cubikar-tour-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'cubikar-tour-card';
    card.className = 'fixed bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4 sm:p-5 w-[92vw] sm:w-[410px] max-w-[440px] pointer-events-auto transition-all duration-200 animate-in fade-in zoom-in-95';
    card.style.zIndex = '99995';
    document.body.appendChild(card);
  }
}

/**
 * Resalta visualmente el elemento con la máscara SVG y el anillo pulsante
 */
function highlightTargetElement(targetEl, padding = 8) {
  const cutoutRect = document.getElementById('cubikar-tour-cutout-rect');
  const focusRing = document.getElementById('cubikar-tour-focus-ring');
  if (!cutoutRect || !focusRing) return;

  if (!targetEl) {
    // Si no hay elemento en pantalla, centrar el foco o enfocar neutro
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

/**
 * Dibuja el contenido de la tarjeta flotante del tour
 */
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

    <!-- Cuerpo con la Explicación -->
    <div class="py-3 text-xs text-slate-300 leading-relaxed font-normal">
      ${step.content || ''}
    </div>

    <!-- Barra de Navegación y Acciones -->
    <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 select-none">
      <!-- Botón Saltar Tutorial con Menú de Preferencia -->
      <button type="button" onclick="window.skipInteractiveTourAction(true)"
              class="text-xs text-slate-400 hover:text-rose-400 font-bold flex items-center gap-1.5 transition cursor-pointer group py-1"
              title="Saltar este recorrido interactivo">
        <i class="fa-solid fa-forward-step text-[10px] group-hover:translate-x-0.5 transition-transform"></i>
        <span>Saltar Tutorial</span>
      </button>

      <!-- Botones Anterior y Siguiente -->
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
          <span>${isLast ? '¡Entendido! Finalizar' : 'Siguiente'}</span>
          <i class="fa-solid ${isLast ? 'fa-check' : 'fa-arrow-right'} text-[10px]"></i>
        </button>
      </div>
    </div>
  `;

  positionTourElements();
}

/**
 * Calcula y posiciona la tarjeta cerca del elemento enfocado
 */
function positionTourElements() {
  const card = document.getElementById('cubikar-tour-card');
  if (!card || !isTourActive) return;

  const step = activeTourSteps[currentStepIndex];
  const targetEl = resolveStepTarget(step);

  if (!targetEl) {
    // Si no hay elemento visible, centrar la tarjeta en la pantalla
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
    // Si se desborda por abajo, cambiar a top
    if (top + cardRect.height > viewportHeight - 10) {
      top = rect.top - cardRect.height - margin;
    }
  } else if (prefPos === 'top') {
    top = rect.top - cardRect.height - margin;
    left = rect.left + (rect.width / 2) - (cardRect.width / 2);
    if (top < 10) {
      top = rect.bottom + margin;
    }
  } else if (prefPos === 'left') {
    top = rect.top + (rect.height / 2) - (cardRect.height / 2);
    left = rect.left - cardRect.width - margin;
    if (left < 10) {
      left = rect.right + margin;
    }
  } else if (prefPos === 'right') {
    top = rect.top + (rect.height / 2) - (cardRect.height / 2);
    left = rect.right + margin;
    if (left + cardRect.width > viewportWidth - 10) {
      left = rect.left - cardRect.width - margin;
    }
  }

  // Ajustes para no salir de los bordes de la ventana
  left = Math.max(12, Math.min(left, viewportWidth - cardRect.width - 12));
  top = Math.max(12, Math.min(top, viewportHeight - cardRect.height - 12));

  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.transform = 'none';
}

/**
 * Avanza al siguiente paso del tour
 */
export function nextInteractiveTourStep() {
  if (!isTourActive) return;
  if (currentStepIndex < activeTourSteps.length - 1) {
    currentStepIndex++;
    showCurrentStep();
  } else {
    // Final del tour completado con éxito
    closeInteractiveTour(true);
  }
}

/**
 * Retrocede al paso anterior
 */
export function prevInteractiveTourStep() {
  if (!isTourActive) return;
  if (currentStepIndex > 0) {
    currentStepIndex--;
    showCurrentStep();
  }
}

/**
 * Salta el tutorial inmediatamente y guarda la preferencia si el usuario lo decide
 */
export function skipInteractiveTour(persistDismissal = true) {
  if (persistDismissal) {
    setTourDismissed(currentTourId, true);
  }
  closeInteractiveTour(false);
}

/**
 * Cierra y limpia los elementos del tour en pantalla
 */
export function closeInteractiveTour(completed = false) {
  isTourActive = false;
  currentTourId = null;
  activeTourSteps = [];
  currentStepIndex = 0;

  const overlay = document.getElementById('cubikar-tour-overlay');
  if (overlay) overlay.remove();

  const card = document.getElementById('cubikar-tour-card');
  if (card) card.remove();

  teardownKeyboardNavigation();

  if (completed) {
    if (typeof window.showToast === 'function') {
      window.showToast('🎉 ¡Excelente! Has completado el recorrido guiado.', 'success');
    }
  }
}

// Navegación por teclado (Flechas y Escape)
function onTourKeyDown(e) {
  if (!isTourActive) return;
  if (e.key === 'Escape') {
    skipInteractiveTour(true);
  } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
    nextInteractiveTourStep();
  } else if (e.key === 'ArrowLeft') {
    prevInteractiveTourStep();
  }
}

function setupKeyboardNavigation() {
  window.addEventListener('keydown', onTourKeyDown);
}

function teardownKeyboardNavigation() {
  window.removeEventListener('keydown', onTourKeyDown);
}

// =========================================================================
// ASIGNACIÓN DE GLOBALES PARA EVENTOS ONCLICK EN EL DOM
// =========================================================================
if (typeof window !== 'undefined') {
  window.startInteractiveTour = startInteractiveTour;
  window.nextInteractiveTourStep = nextInteractiveTourStep;
  window.prevInteractiveTourStep = prevInteractiveTourStep;
  window.skipInteractiveTourAction = (persist = true) => skipInteractiveTour(persist);
  window.closeInteractiveTour = closeInteractiveTour;
  window.resetTourDismissedStatus = resetTourDismissedStatus;
}
