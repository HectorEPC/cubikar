// js/ui/videoSimulatorModal.js
// Reproductor Web de Video-Simulación Interactiva para Cubikar (Alternativa 1)
// Ofrece una experiencia audiovisual interactiva estilo Loom / YouTube con:
// Cursor virtual animado, clics con efecto ripple, transcripción/subtítulos sincronizados,
// barra de tiempo deslizable (scrubber), selector de velocidad (1x, 1.5x, 2x) y lista de los 15 módulos.

let isVideoModalOpen = false;
let currentModuleId = 1;
let isPlaying = false;
let playbackSpeed = 1.0;
let currentTimeSeconds = 0;
let simulationInterval = null;
let animationStepIndex = 0;

// =========================================================================
// CATÁLOGO DE LOS 15 MÓDULOS CON GUION VISUAL Y SUBTÍTULOS SINCRONIZADOS
// =========================================================================

export const VIDEO_MODULES = [
  {
    id: 1,
    title: 'Crear Proyecto e Identidad Corporativa',
    badge: 'Módulo 1 • Inicio',
    duration: 36,
    icon: 'fa-folder-plus',
    description: 'Aprende a usar el Asistente en 2 Pasos, configurar tu empresa, subir tu logotipo 1:1 y fijar el sobrecosto reglamentario.',
    steps: [
      { t: 0, text: 'Bienvenido a Cubikar. Para crear una nueva obra, haz clic en el botón azul "+ Nuevo Proyecto".', target: 'btn-nuevo-proyecto', action: 'move_and_click' },
      { t: 6, text: 'Paso 1: Asigna el Nombre de tu Empresa y carga el Logotipo oficial para los membretes.', target: 'input-empresa', action: 'type_text', val: 'Constructora del Valle S.A.' },
      { t: 14, text: 'Captura el Nombre de la Obra y Ubicación. Selecciona la especialidad (Edificación, Vivienda, Obra Civil).', target: 'input-obra', action: 'type_text', val: 'Residencial Palmas Norte' },
      { t: 22, text: 'Paso 2: Define la divisa (MXN, USD) y los porcentajes de Indirectos, Financiamiento y Utilidad.', target: 'input-sobrecosto', action: 'highlight_box' },
      { t: 29, text: 'Selecciona "Catálogo de Muestra" para practicar o "Proyecto en Blanco", y haz clic en "Crear Proyecto".', target: 'btn-finalizar-proyecto', action: 'click_and_success' }
    ]
  },
  {
    id: 2,
    title: 'Invitar Colaboradores y Permisos Granulares',
    badge: 'Módulo 2 • Equipo',
    duration: 32,
    icon: 'fa-users',
    description: 'Cómo invitar ingenieros y supervisores, asignar roles (Editar, Escribir, Leer) y autorizar pestañas específicas.',
    steps: [
      { t: 0, text: 'En la tarjeta de tu obra, haz clic en el enlace "+ Invitar" o abre el modal de Equipo y Permisos.', target: 'btn-invitar-card', action: 'move_and_click' },
      { t: 7, text: 'Escribe el nombre y correo electrónico del colaborador. Asígnale su avatar temático con casco.', target: 'input-invitar-email', action: 'type_text', val: 'ing.torres@constructora.com' },
      { t: 15, text: 'Selecciona su Rol de Trabajo: Editar (Control total), Escribir (Captura) o Leer (Solo consulta).', target: 'role-selector', action: 'highlight_box' },
      { t: 22, text: 'Permisos Granulares: Activa únicamente las pestañas autorizadas (Catálogo, Compras, Bitácora...).', target: 'tabs-permissions-grid', action: 'toggle_switches' },
      { t: 28, text: 'Haz clic en "Agregar Colaborador". El invitado recibirá la notificación y podrá aceptar con 1 clic.', target: 'btn-submit-invitacion', action: 'click_and_success' }
    ]
  },
  {
    id: 3,
    title: 'Chat de Proyecto y Bitácora Contextual',
    badge: 'Módulo 3 • Comunicación',
    duration: 30,
    icon: 'fa-comments',
    description: 'Comunicación en vivo dividida en canal Técnico y Financiero, menciones @Usuario y notas ligadas a conceptos.',
    steps: [
      { t: 0, text: 'Abre la ventana flotante del chat desde el botón inferior derecho o la barra lateral izquierda.', target: 'chat-dock-trigger', action: 'move_and_click' },
      { t: 7, text: 'Alterna entre la Sección Técnica (Catálogo/Calendario) y la Sección Financiera (Compras/Estimaciones).', target: 'chat-sections-nav', action: 'click_tab' },
      { t: 14, text: 'Escribe una mención usando "@" para alertar a un compañero con sonido y notificación en su campana.', target: 'chat-input', action: 'type_text', val: '@Carlos Revisar volumen de concreto en cimentación' },
      { t: 22, text: 'Haz clic en el icono de chat de cualquier renglón del catálogo para comentar directamente sobre esa partida.', target: 'concept-chat-btn', action: 'highlight_box' },
      { t: 27, text: 'Exporta la Minuta Oficial de Acuerdos del Chat a PDF con membrete institucional y firmas.', target: 'btn-print-chat', action: 'click_and_success' }
    ]
  },
  {
    id: 4,
    title: 'Catálogo de Conceptos y Presupuesto Base',
    badge: 'Módulo 4 • Presupuesto',
    duration: 34,
    icon: 'fa-list-check',
    description: 'Estructuración multinivel (partidas y subpartidas), renumeración automática y atajos de teclado Alt+Flechas.',
    steps: [
      { t: 0, text: 'Crea Partidas (Nivel 1) con el botón "+ Nueva Partida". El sistema generará la clave "1", "2", etc.', target: 'btn-add-partida', action: 'move_and_click' },
      { t: 7, text: 'Agrega subpartidas o conceptos dentro del renglón. La renumeración automática ajustará "1.1", "1.2".', target: 'btn-add-subpartida', action: 'click_and_render' },
      { t: 15, text: 'Edita directamente en celda la clave, descripción técnica, unidad de medida, volumen y precio unitario.', target: 'table-row-active', action: 'type_text', val: 'Muro de tabique rojo recocido e=14cm' },
      { t: 23, text: 'Usa el atajo "Alt + Flecha Arriba / Abajo" para reordenar renglones de obra sin perder jerarquía.', target: 'row-reorder-handle', action: 'move_row' },
      { t: 29, text: 'Personaliza los colores por partida para una presentación ejecutiva impecable.', target: 'color-picker-dot', action: 'click_and_success' }
    ]
  },
  {
    id: 5,
    title: 'Análisis de Precios Unitarios (APU)',
    badge: 'Módulo 5 • Matrices',
    duration: 38,
    icon: 'fa-calculator',
    description: 'Desglose en 4 rubros (Materiales, Mano de Obra, Equipo y Subcontratos) y aplicación de sobrecosto.',
    steps: [
      { t: 0, text: 'Haz clic en el botón "APU" de cualquier concepto para abrir la matriz de análisis maximizable.', target: 'btn-open-apu-modal', action: 'move_and_click' },
      { t: 8, text: 'Rubro Materiales: captura insumos básicos con cantidades, mermas reglamentarias y costos de compra.', target: 'rubro-materiales-card', action: 'highlight_box' },
      { t: 16, text: 'Rubro Mano de Obra: añade cuadrillas de oficiales y peones. El sistema aplica el FASAR automáticamente.', target: 'rubro-mano-obra-card', action: 'highlight_box' },
      { t: 24, text: 'Rubro Equipo: define costos horarios de maquinaria, herramienta menor (% MO) y equipo de seguridad.', target: 'rubro-equipo-card', action: 'highlight_box' },
      { t: 31, text: 'Comprueba el Costo Directo total y observa cómo el Factor de Sobrecosto calcula el Precio de Venta final.', target: 'apu-total-footer', action: 'click_and_success' }
    ]
  },
  {
    id: 6,
    title: 'Catálogos Maestros: BIMSA y Gobierno',
    badge: 'Módulo 6 • Referencia',
    duration: 32,
    icon: 'fa-book-bookmark',
    description: 'Exploración de más de 61,000 conceptos precargados de BIMSA 2018 y Tabuladores de Gobierno en IndexedDB.',
    steps: [
      { t: 0, text: 'Abre el Catálogo Maestro desde la barra lateral izquierda (icono del libro con marcador).', target: 'btn-master-catalog', action: 'move_and_click' },
      { t: 7, text: 'Filtra por especialidad: Edificación, Instalaciones, Infraestructura, Industrial o HVAC.', target: 'catalog-specialty-tabs', action: 'click_tab' },
      { t: 15, text: 'Escribe en el buscador cualquier palabra clave (ej. "Zapata aislada", "Tubería cobre", "Plafón").', target: 'catalog-search-input', action: 'type_text', val: 'Zapata corrida de concreto f\'c=250' },
      { t: 23, text: 'Revisa la ficha técnica del concepto y su desglose completo de materiales y cuadrillas.', target: 'catalog-item-preview', action: 'highlight_box' },
      { t: 28, text: 'Haz clic en "Insertar al Presupuesto" para agregarlo a tu obra activa en un segundo.', target: 'btn-insert-to-active-proj', action: 'click_and_success' }
    ]
  },
  {
    id: 7,
    title: 'Inteligencia Artificial y Google Search Grounding',
    badge: 'Módulo 7 • IA Gemini',
    duration: 35,
    icon: 'fa-brain',
    description: 'Cotizaciones en tiempo real con fuentes de mercado y estimación automática de matrices APU.',
    steps: [
      { t: 0, text: 'Despliega el Menú Dividido de Inteligencia Artificial en la barra superior de herramientas.', target: 'btn-ai-split-menu', action: 'move_and_click' },
      { t: 8, text: 'Elige "Cotizaciones con Google Search" para investigar precios actuales de acero, cemento o madera.', target: 'menu-opt-google-grounding', action: 'highlight_box' },
      { t: 16, text: 'O elige "Generador con Gemini": escribe en lenguaje natural lo que necesitas presupuestar.', target: 'ai-prompt-input', action: 'type_text', val: 'Colocación de piso porcelanato 60x60 pegado con peguerozo' },
      { t: 25, text: 'La IA analiza el concepto y propone los materiales, la cuadrilla con rendimiento y la herramienta necesaria.', target: 'ai-generated-matrix-preview', action: 'highlight_box' },
      { t: 31, text: 'Revisa la propuesta y presiona "Aplicar Matriz" para vincularla a tu concepto de obra.', target: 'btn-apply-ai-matrix', action: 'click_and_success' }
    ]
  },
  {
    id: 8,
    title: 'Explosión y Consolidado de Insumos Generales',
    badge: 'Módulo 8 • Insumos',
    duration: 30,
    icon: 'fa-boxes-stacked',
    description: 'Explosión de todos los materiales de la obra, cambio masivo de costos unitarios y unificación de duplicados.',
    steps: [
      { t: 0, text: 'Entra a la pestaña "Insumos Generales". El sistema suma los consumos de todo el presupuesto.', target: 'tab-insumos-generales', action: 'move_and_click' },
      { t: 8, text: 'Filtra por pestaña: Materiales, Mano de Obra, Maquinaria o Subcontratos para analizar volúmenes totales.', target: 'insumos-category-tabs', action: 'click_tab' },
      { t: 15, text: 'Cambio masivo de costo: edita el precio de la tonelada de cemento o varilla directamente en la tabla.', target: 'insumo-price-cell', action: 'type_text', val: '$3,850.00' },
      { t: 23, text: 'Todas las matrices del proyecto que usan ese insumo se recalculan automáticamente en cascada.', target: 'insumo-cascade-indicator', action: 'highlight_box' },
      { t: 27, text: 'Usa "Unificar Insumos" para combinar registros repetidos bajo una sola clave oficial.', target: 'btn-unify-insumos', action: 'click_and_success' }
    ]
  },
  {
    id: 9,
    title: 'Compras, Gastos y ERP Financiero',
    badge: 'Módulo 9 • Egresos',
    duration: 36,
    icon: 'fa-cart-shopping',
    description: 'Dashboard de control financiero, captura de facturas y tickets, comparativa presupuesto vs real y órdenes de compra.',
    steps: [
      { t: 0, text: 'Accede a la pestaña "Compras y Pagos" para ver el Dashboard con Presupuesto vs Gasto Real.', target: 'tab-compras-pagos', action: 'move_and_click' },
      { t: 8, text: 'Haz clic en "+ Registrar Gasto / Compra" para dar de alta una factura, ticket o remisión.', target: 'btn-register-expense', action: 'click_and_render' },
      { t: 15, text: 'Captura el proveedor, folio, concepto, tipo de egreso e importe con IVA. Sube tu factura en PDF.', target: 'expense-form-fields', action: 'type_text', val: 'Factura F-4892 • Concreto Premezclado f\'c=250' },
      { t: 23, text: 'Cambia el estatus de pago con 1 clic: "Pagado", "Pendiente" o "Parcial" para control de tesorería.', target: 'payment-status-pill', action: 'highlight_box' },
      { t: 29, text: 'Revisa la "Comparativa": el semáforo rojo te alertará si un insumo excede el costo presupuestado.', target: 'comparativa-subtab-view', action: 'click_tab' },
      { t: 33, text: 'Genera e imprime la Orden de Compra oficial con membrete corporativo y folio correlativo.', target: 'btn-print-orden-compra', action: 'click_and_success' }
    ]
  },
  {
    id: 10,
    title: 'Bitácora Electrónica y Legal de Obra (LOPSRM / BESOP)',
    badge: 'Módulo 10 • Bitácora',
    duration: 38,
    icon: 'fa-book',
    description: 'Folios inalterables #001, condiciones meteorológicas, firma digital en panel táctil y sellado criptográfico.',
    steps: [
      { t: 0, text: 'Abre la pestaña "Bitácora de Obra" para gestionar el libro legal de notas conforme a normativa.', target: 'tab-bitacora-obra', action: 'move_and_click' },
      { t: 8, text: 'Haz clic en "+ Nueva Nota" y selecciona el tipo (Apertura, Instrucción, Avance, Suspensión/Clima, Incidencia).', target: 'btn-new-bitacora-note', action: 'click_and_render' },
      { t: 16, text: 'Registra el estado del tiempo (Soleado, Lluvia, Viento) y vincula la nota a los conceptos de obra ejecutados.', target: 'weather-selector-grid', action: 'highlight_box' },
      { t: 23, text: 'Adjunta fotografías de evidencia con el visor Lightbox y redacta el acuerdo o incidencia técnica.', target: 'photos-upload-preview', action: 'type_text', val: 'Se concluyó el colado de contratrabes del eje A al D' },
      { t: 30, text: 'Abre el panel táctil de firma: plasma tu firma manuscrita digital con mouse, lápiz stylus o pantalla táctil.', target: 'signature-canvas-pad', action: 'draw_signature' },
      { t: 35, text: 'Presiona "Sellar Nota Oficial". Se genera un Hash inmutable y queda lista para el Libro en PDF.', target: 'btn-seal-bitacora-note', action: 'click_and_success' }
    ]
  },
  {
    id: 11,
    title: 'Calendario de Obra y Diagrama de Gantt',
    badge: 'Módulo 11 • Tiempos',
    duration: 32,
    icon: 'fa-calendar-days',
    description: 'Fechas de inicio y fin, programación con IA, ruta crítica y calendario financiero de erogaciones.',
    steps: [
      { t: 0, text: 'Entra a la pestaña "Calendario de Obra" para ver el cronograma visual sincronizado con el catálogo.', target: 'tab-calendario-obra', action: 'move_and_click' },
      { t: 7, text: 'Arrastra las barras del Gantt o ajusta las duraciones en días para programar cada actividad.', target: 'gantt-bars-container', action: 'move_gantt_bar' },
      { t: 15, text: 'Utiliza el "Asistente AI de Programación" para sugerir duraciones lógicas según volúmenes de obra.', target: 'btn-ai-scheduling', action: 'highlight_box' },
      { t: 23, text: 'Activa la "Ruta Crítica" para identificar las tareas que determinan la fecha final del proyecto.', target: 'btn-toggle-critical-path', action: 'click_tab' },
      { t: 28, text: 'Consulta el Calendario Financiero para ver los montos que se cobrarán por semana o por mes.', target: 'financial-schedule-row', action: 'click_and_success' }
    ]
  },
  {
    id: 12,
    title: 'Estimaciones y Números Generadores de Cobro',
    badge: 'Módulo 12 • Cobros',
    duration: 32,
    icon: 'fa-file-invoice-dollar',
    description: 'Cortes quincenales/mensuales, captura de generadores de obra, amortización de anticipos y retenciones.',
    steps: [
      { t: 0, text: 'Abre la pestaña "Estimaciones" para generar tus cortes de cobro periódicos.', target: 'tab-estimaciones-view', action: 'move_and_click' },
      { t: 7, text: 'Crea una "Nueva Estimación" definiendo el periodo de corte (ej. Del 1 al 15 del mes).', target: 'btn-nueva-estimacion', action: 'click_and_render' },
      { t: 15, text: 'Captura los volúmenes de obra ejecutados en el periodo (generadores de obra).', target: 'estimacion-inputs-table', action: 'type_text', val: '145.00 m2 ejecutados' },
      { t: 23, text: 'El sistema calcula el acumulado anterior, el cobro actual, el saldo por cobrar y la amortización de anticipo.', target: 'estimacion-resumen-kpis', action: 'highlight_box' },
      { t: 28, text: 'Descarga la Carátula Oficial de Estimación en PDF lista para revisión de supervisión.', target: 'btn-export-estimacion-pdf', action: 'click_and_success' }
    ]
  },
  {
    id: 13,
    title: 'Importador Universal (Excel, Opus y Neodata)',
    badge: 'Módulo 13 • Importación',
    duration: 30,
    icon: 'fa-cloud-arrow-up',
    description: 'Carga de archivos .xlsx, .csv y .json con mapeo inteligente de columnas y vista previa de registros.',
    steps: [
      { t: 0, text: 'Haz clic en el botón "Importar Archivo" en la barra lateral izquierda.', target: 'btn-open-importer', action: 'move_and_click' },
      { t: 7, text: 'Arrastra tu archivo de Excel (.xlsx, .xls) o exportación de Opus / Neodata.', target: 'dropzone-importer', action: 'drop_file' },
      { t: 15, text: 'El Asistente detecta automáticamente las columnas: Clave, Descripción, Unidad, Cantidad y Precio.', target: 'mapping-columns-selects', action: 'highlight_box' },
      { t: 22, text: 'Revisa la vista previa de renglones y elige si importar al Presupuesto Activo o al Catálogo Maestro.', target: 'preview-importer-table', action: 'click_tab' },
      { t: 27, text: 'Presiona "Iniciar Importación". Miles de conceptos se procesan en segundos 100% offline.', target: 'btn-start-importing', action: 'click_and_success' }
    ]
  },
  {
    id: 14,
    title: 'Reportes e Impresión Oficial en PDF',
    badge: 'Módulo 14 • Reportes',
    duration: 30,
    icon: 'fa-print',
    description: 'Presupuesto Base, Matrices APU, Insumos Generales y Minutas con membrete institucional y firmas.',
    steps: [
      { t: 0, text: 'Abre el menú de Impresión desde el botón de la impresora en la barra de herramientas.', target: 'btn-open-print-menu', action: 'move_and_click' },
      { t: 7, text: 'Configura las Firmas Oficiales: nombres y cargos de Elaboró, Revisó, Aprobó y Autorizó.', target: 'signatures-config-modal', action: 'highlight_box' },
      { t: 15, text: 'Selecciona el formato deseado: Presupuesto Base, Ficha de Precio Unitario (APU) o Explosión de Insumos.', target: 'print-formats-list', action: 'click_tab' },
      { t: 22, text: 'El reporte se genera con tu Logotipo institucional 1:1, sobrecosto y totales en letra reglamentarios.', target: 'print-preview-dialog', action: 'highlight_box' },
      { t: 27, text: 'Descarga el archivo PDF vectorial o envía directamente a la impresora de planos/oficina.', target: 'btn-confirm-pdf-download', action: 'click_and_success' }
    ]
  },
  {
    id: 15,
    title: 'Seguridad, Respaldos y Perfil Profesional',
    badge: 'Módulo 15 • Ajustes',
    duration: 28,
    icon: 'fa-shield-halved',
    description: 'Candado de bloqueo de pestañas (Tab Lock), respaldo de seguridad local .json y administración de cuenta.',
    steps: [
      { t: 0, text: 'Activa el "Bloqueo de Pestaña" con el icono de candado para congelar la edición contra cambios accidentales.', target: 'btn-toggle-tab-lock', action: 'move_and_click' },
      { t: 7, text: 'Descarga un Respaldo Completo (.json) de tu obra desde el menú de opciones para tener copia física.', target: 'btn-download-json-backup', action: 'click_and_render' },
      { t: 14, text: 'En tu Perfil de Usuario, actualiza tus datos y cambia el tema visual entre Modo Día y Modo Nocturno.', target: 'user-profile-summary', action: 'highlight_box' },
      { t: 21, text: 'Monitorea tu cuota de almacenamiento en la nube y sincronización en tiempo real.', target: 'storage-quota-meter', action: 'highlight_box' },
      { t: 26, text: '¡Todo listo! Cubikar mantiene tu información blindada, organizada y accesible desde cualquier lugar.', target: 'cubikar-shield-logo', action: 'click_and_success' }
    ]
  }
];

// =========================================================================
// MÉTODOS DEL CONTROLADOR DEL REPRODUCTOR DE VIDEO
// =========================================================================

/**
 * Abre el reproductor de video-simulador interactivo
 * @param {number} moduleId - ID del módulo a cargar (1 al 15)
 */
export function openVideoSimulatorModal(moduleId = 1) {
  currentModuleId = Number(moduleId) || 1;
  isVideoModalOpen = true;
  currentTimeSeconds = 0;
  isPlaying = true;

  injectVideoSimulatorDom();
  loadModuleInPlayer(currentModuleId);

  const modal = document.getElementById('cubikar-video-simulator-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  startPlaybackTimer();
}

/**
 * Cierra la ventana del reproductor
 */
export function closeVideoSimulatorModal() {
  pauseVideoSimulation();
  isVideoModalOpen = false;

  const modal = document.getElementById('cubikar-video-simulator-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}
export const closeVideoSimulatorModalAction = closeVideoSimulatorModal;

/**
 * Carga un módulo específico en el reproductor
 */
export function selectVideoModule(moduleId) {
  currentModuleId = Number(moduleId);
  currentTimeSeconds = 0;
  loadModuleInPlayer(currentModuleId);
  if (!isPlaying) {
    toggleVideoPlayPause();
  }
}

/**
 * Carga datos del módulo activo en la interfaz del reproductor
 */
function loadModuleInPlayer(modId) {
  const mod = VIDEO_MODULES.find(m => m.id === modId) || VIDEO_MODULES[0];

  const titleEl = document.getElementById('video-player-mod-title');
  const badgeEl = document.getElementById('video-player-mod-badge');
  const descEl = document.getElementById('video-player-mod-desc');
  const totalTimeEl = document.getElementById('video-player-total-time');

  if (titleEl) titleEl.textContent = mod.title;
  if (badgeEl) badgeEl.textContent = mod.badge;
  if (descEl) descEl.textContent = mod.description;
  if (totalTimeEl) totalTimeEl.textContent = formatTimeDisplay(mod.duration);

  // Resaltar elemento activo en la lista lateral
  document.querySelectorAll('.video-playlist-item').forEach(el => {
    const elId = Number(el.getAttribute('data-mod-id'));
    if (elId === mod.id) {
      el.classList.add('bg-blue-600/25', 'border-blue-500/50', 'text-white');
      el.classList.remove('bg-slate-800/60', 'border-slate-800', 'text-slate-300');
    } else {
      el.classList.remove('bg-blue-600/25', 'border-blue-500/50', 'text-white');
      el.classList.add('bg-slate-800/60', 'border-slate-800', 'text-slate-300');
    }
  });

  updateProgressScrubber(0, mod.duration);
  renderSimulationStageFrame(0);
}

/**
 * Inicia o reanuda la reproducción
 */
export function toggleVideoPlayPause() {
  isPlaying = !isPlaying;
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) {
    playIcon.className = isPlaying ? 'fa-solid fa-pause text-base' : 'fa-solid fa-play text-base';
  }

  if (isPlaying) {
    startPlaybackTimer();
  } else {
    pauseVideoSimulation();
  }
}

function pauseVideoSimulation() {
  isPlaying = false;
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-play text-base';
}

function startPlaybackTimer() {
  if (simulationInterval) clearInterval(simulationInterval);

  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  const stepMs = 250;

  simulationInterval = setInterval(() => {
    if (!isPlaying) return;

    currentTimeSeconds += (stepMs / 1000) * playbackSpeed;

    if (currentTimeSeconds >= mod.duration) {
      // Fin del video actual: pasar al siguiente módulo o pausar
      currentTimeSeconds = mod.duration;
      pauseVideoSimulation();
      if (currentModuleId < VIDEO_MODULES.length) {
        setTimeout(() => {
          selectVideoModule(currentModuleId + 1);
        }, 1200);
      }
    }

    updateProgressScrubber(currentTimeSeconds, mod.duration);
    renderSimulationStageFrame(currentTimeSeconds);
  }, stepMs);
}

/**
 * Salto manual en la barra de tiempo (Scrubber)
 */
export function seekVideoSimulation(event) {
  const progressBar = document.getElementById('video-progress-container');
  if (!progressBar) return;

  const rect = progressBar.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));

  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  currentTimeSeconds = pct * mod.duration;

  updateProgressScrubber(currentTimeSeconds, mod.duration);
  renderSimulationStageFrame(currentTimeSeconds);
}

/**
 * Cambia la velocidad de reproducción (1x, 1.5x, 2x)
 */
export function cyclePlaybackSpeed() {
  if (playbackSpeed === 1.0) playbackSpeed = 1.5;
  else if (playbackSpeed === 1.5) playbackSpeed = 2.0;
  else playbackSpeed = 1.0;

  const speedBadge = document.getElementById('video-speed-indicator');
  if (speedBadge) speedBadge.textContent = `${playbackSpeed}x`;
}

/**
 * Reinicia el video actual a segundo 0
 */
export function restartCurrentVideo() {
  currentTimeSeconds = 0;
  isPlaying = true;
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-pause text-base';
  startPlaybackTimer();
}

/**
 * Formatea segundos a MM:SS
 */
function formatTimeDisplay(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
}

/**
 * Actualiza la barra visual de progreso y tiempos
 */
function updateProgressScrubber(current, total) {
  const bar = document.getElementById('video-progress-fill');
  const knob = document.getElementById('video-progress-knob');
  const timeCurrentEl = document.getElementById('video-player-current-time');

  const pct = total > 0 ? (current / total) * 100 : 0;

  if (bar) bar.style.width = `${pct}%`;
  if (knob) knob.style.left = `${pct}%`;
  if (timeCurrentEl) timeCurrentEl.textContent = formatTimeDisplay(current);
}

/**
 * Renderiza el cuadro animado en el escenario virtual (Stage)
 */
function renderSimulationStageFrame(seconds) {
  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  const steps = mod.steps || [];

  // Encontrar el paso activo según el segundo actual
  let currentStep = steps[0];
  for (let i = steps.length - 1; i >= 0; i--) {
    if (seconds >= steps[i].t) {
      currentStep = steps[i];
      break;
    }
  }

  // Actualizar subtítulo sincronizado
  const subtitleEl = document.getElementById('video-subtitle-caption');
  if (subtitleEl && currentStep) {
    subtitleEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-600/30 text-blue-300 font-mono text-[10px] font-bold border border-blue-400/30 mr-2 shrink-0">
        <i class="fa-solid fa-play text-[8px]"></i> ${formatTimeDisplay(seconds)}
      </span>
      <span>${currentStep.text}</span>
    `;
  }

  // Animar cursor virtual y elementos interactivos en el canvas simulado
  animateVirtualStageCursor(currentStep, seconds);
}

/**
 * Anima el cursor y efectos de clic dentro del mock-up de Cubikar
 */
function animateVirtualStageCursor(step, seconds) {
  const cursor = document.getElementById('virtual-cursor-pointer');
  const ripple = document.getElementById('virtual-cursor-ripple');
  const targetMockEl = document.getElementById(`mock-el-${step.target}`);

  if (!cursor) return;

  // Si el objetivo simulado existe en el canvas, mover el cursor hacia él
  if (targetMockEl) {
    const parent = document.getElementById('virtual-desktop-screen');
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const targetRect = targetMockEl.getBoundingClientRect();

    const targetX = targetRect.left - parentRect.left + (targetRect.width / 2);
    const targetY = targetRect.top - parentRect.top + (targetRect.height / 2);

    cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;
    cursor.style.opacity = '1';

    // Disparar efecto de clic si corresponde
    if (step.action === 'move_and_click' || step.action === 'click_and_success' || step.action === 'click_tab') {
      const stepElapsed = seconds - step.t;
      if (stepElapsed > 0.8 && stepElapsed < 1.4 && ripple) {
        ripple.style.left = `${targetX}px`;
        ripple.style.top = `${targetY}px`;
        ripple.className = 'virtual-ripple-ring active';
      } else if (ripple) {
        ripple.className = 'virtual-ripple-ring';
      }
    }
  }
}

// =========================================================================
// INYECCIÓN DEL MODAL REPRODUCTOR EN EL DOM
// =========================================================================

function injectVideoSimulatorDom() {
  if (document.getElementById('cubikar-video-simulator-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'cubikar-video-simulator-modal';
  modal.className = 'fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[99998] hidden items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95 duration-150 select-none';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden text-slate-100">
      
      <!-- Barra Superior de Control del Modal -->
      <div class="bg-slate-950 px-4 sm:px-6 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-blue-600/25 border border-blue-400/40 text-blue-400 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-play text-sm"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span id="video-player-mod-badge" class="px-2 py-0.2 rounded-full text-[9.5px] font-extrabold bg-blue-600/30 text-blue-300 border border-blue-400/30 uppercase tracking-wide">
                Módulo 1
              </span>
              <span class="text-[10px] text-slate-400 hidden sm:inline">• Reproductor Interactivo de Cubikar</span>
            </div>
            <h2 id="video-player-mod-title" class="font-bold text-xs sm:text-sm text-white truncate leading-tight">
              Crear Proyecto e Identidad Corporativa
            </h2>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="window.closeVideoSimulatorModalAction()"
                  class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                  title="Cerrar Reproductor">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
      </div>

      <!-- Cuerpo Principal Dividido: Escenario de Video (Izquierda) + Playlist de Módulos (Derecha) -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        
        <!-- Escenario de Video y Controles (Área Principal) -->
        <div class="flex-1 flex flex-col bg-slate-950/70 p-3 sm:p-4 min-w-0 overflow-hidden">
          
          <!-- Pantalla Virtual de Simulación (Desktop Canvas) -->
          <div id="virtual-desktop-screen" class="relative flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner flex flex-col min-h-[260px] sm:min-h-[360px]">
            
            <!-- Barra de ventana simulada de Cubikar -->
            <div class="bg-slate-950 px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                <span class="font-mono text-[10px] ml-1 text-slate-500">Cubikar v2.0 • Sistema de Control de Obra</span>
              </div>
              <span class="text-[10px] font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                🔴 Simulación Interactiva en Vivo
              </span>
            </div>

            <!-- Interfaz Gráfica Simulada de Cubikar -->
            <div class="flex-1 p-3 sm:p-4 overflow-hidden relative flex flex-col justify-center items-center text-center">
              
              <!-- Mockup Dinámico que cambia según el módulo -->
              <div class="w-full max-w-xl bg-slate-850 border border-slate-700/60 rounded-xl p-4 sm:p-5 shadow-xl text-left space-y-3.5 animate-in fade-in duration-200">
                <div class="flex items-center justify-between pb-2.5 border-b border-slate-700">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-lg bg-blue-600/30 text-blue-400 flex items-center justify-center font-bold text-xs">
                      <i class="fa-solid fa-cube"></i>
                    </div>
                    <div>
                      <span class="font-bold text-xs text-white block">Cubikar Workspace Demo</span>
                      <span class="text-[10px] text-slate-400">Guía paso a paso en pantalla</span>
                    </div>
                  </div>
                  <button id="mock-el-btn-nuevo-proyecto" type="button" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-plus text-[9px]"></i> + Nuevo Proyecto
                  </button>
                </div>

                <div class="space-y-2 text-xs">
                  <div id="mock-el-input-empresa" class="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-mono text-[11px] flex items-center justify-between">
                    <span>Constructora del Valle S.A.</span>
                    <i class="fa-solid fa-check text-emerald-400 text-[10px]"></i>
                  </div>
                  <div id="mock-el-input-obra" class="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-mono text-[11px] flex items-center justify-between">
                    <span>Residencial Palmas Norte (Edificación)</span>
                    <i class="fa-solid fa-check text-emerald-400 text-[10px]"></i>
                  </div>
                </div>

                <div id="mock-el-input-sobrecosto" class="p-2.5 bg-blue-950/40 border border-blue-500/30 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <strong class="text-blue-300 text-[11px] block">Factor de Sobrecosto Activo</strong>
                    <span class="text-[10px] text-slate-400">Indirectos (12%) + Financ. (1.5%) + Utilidad (10%)</span>
                  </div>
                  <span class="font-mono font-bold text-amber-400 text-xs">1.2693 (+26.93%)</span>
                </div>

                <div class="flex justify-end pt-1">
                  <button id="mock-el-btn-finalizar-proyecto" type="button" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs shadow-md flex items-center gap-1.5">
                    <i class="fa-solid fa-check text-[10px]"></i> Proyecto Listo
                  </button>
                </div>
              </div>

              <!-- Cursor Virtual Animado -->
              <div id="virtual-cursor-pointer" class="absolute pointer-events-none transition-all duration-500 ease-out z-20" style="left: 0; top: 0; opacity: 0;">
                <svg class="w-6 h-6 drop-shadow-md text-amber-400 fill-current" viewBox="0 0 24 24">
                  <path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 5.428z" stroke="#0f172a" stroke-width="1.5" />
                </svg>
              </div>

              <!-- Anillo de Clic Virtual (Ripple) -->
              <div id="virtual-cursor-ripple" class="virtual-ripple-ring pointer-events-none"></div>

            </div>

            <!-- Franja Inferior de Subtítulos Sincronizados (CC) -->
            <div class="bg-slate-950/95 px-4 py-2.5 border-t border-slate-800 flex items-center min-h-[46px] shrink-0 text-xs text-slate-200">
              <div id="video-subtitle-caption" class="flex items-center min-w-0 flex-1 leading-snug">
                <!-- Se llena dinámicamente con renderSimulationStageFrame() -->
              </div>
            </div>

          </div>

          <!-- Barra de Controles de Video (Línea de Tiempo, Play/Pausa, Velocidad) -->
          <div class="pt-3 flex flex-col gap-2 shrink-0">
            <!-- Barra de Progreso Deslizable (Scrubber) -->
            <div id="video-progress-container" onclick="window.seekVideoSimulationAction(event)"
                 class="h-2.5 bg-slate-800 hover:bg-slate-700 rounded-full cursor-pointer relative overflow-hidden transition-all group">
              <div id="video-progress-fill" class="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-100" style="width: 0%;"></div>
              <div id="video-progress-knob" class="absolute top-0 bottom-0 w-3 bg-white rounded-full shadow -ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" style="left: 0%;"></div>
            </div>

            <!-- Botones de Control -->
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-3">
                <!-- Play / Pausa -->
                <button type="button" onclick="window.toggleVideoPlayPauseAction()"
                        class="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center transition shadow-md shadow-blue-600/30 cursor-pointer"
                        title="Reproducir / Pausar">
                  <i id="video-btn-play-icon" class="fa-solid fa-play text-sm"></i>
                </button>

                <!-- Reiniciar -->
                <button type="button" onclick="window.restartCurrentVideoAction()"
                        class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                        title="Reiniciar Video">
                  <i class="fa-solid fa-rotate-left text-xs"></i>
                </button>

                <!-- Tiempo Actual / Total -->
                <div class="font-mono text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <span id="video-player-current-time">00:00</span>
                  <span class="text-slate-500">/</span>
                  <span id="video-player-total-time">00:36</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <!-- Selector de Velocidad -->
                <button type="button" onclick="window.cyclePlaybackSpeedAction()"
                        class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        title="Cambiar Velocidad de Reproducción">
                  <i class="fa-solid fa-gauge-high text-[10px] text-blue-400"></i>
                  <span id="video-speed-indicator">1.0x</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- Playlist Lateral: Los 15 Módulos de Cubikar -->
        <div class="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col shrink-0 min-h-0">
          <div class="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
            <span class="font-bold text-xs text-white flex items-center gap-2">
              <i class="fa-solid fa-list-ol text-blue-400"></i>
              <span>Temario de Módulos (15)</span>
            </span>
            <span class="text-[10px] font-mono text-slate-400">100% Cubierto</span>
          </div>

          <!-- Lista Scrollable de Módulos -->
          <div class="flex-1 overflow-y-auto custom-scroll p-2 space-y-1.5">
            ${VIDEO_MODULES.map(m => `
              <div onclick="window.selectVideoModuleAction(${m.id})"
                   data-mod-id="${m.id}"
                   class="video-playlist-item p-2.5 rounded-xl border border-slate-800 bg-slate-800/60 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-2.5 text-xs select-none">
                <div class="w-7 h-7 rounded-lg bg-slate-900 border border-slate-700 text-blue-400 flex items-center justify-center shrink-0 text-xs">
                  <i class="fa-solid ${m.icon}"></i>
                </div>
                <div class="min-w-0 flex-1">
                  <span class="font-semibold block truncate leading-tight">${m.id}. ${m.title}</span>
                  <div class="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                    <span>${m.duration}s</span>
                    <span>•</span>
                    <span class="text-blue-400 font-medium">${m.badge.split('•')[1] || ''}</span>
                  </div>
                </div>
                <i class="fa-solid fa-circle-play text-xs text-slate-500 opacity-60"></i>
              </div>
            `).join('')}
          </div>

          <!-- Pie de Playlist con botón de Tour Guiado en Vivo -->
          <div class="p-2.5 border-t border-slate-800 bg-slate-950/50 shrink-0">
            <button type="button" onclick="window.closeVideoSimulatorModalAction(); window.startInteractiveTour('portal', true);"
                    class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer">
              <i class="fa-solid fa-person-walking-arrow-right text-xs"></i>
              <span>Probar Tour Guiado en Vivo</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  `;

  document.body.appendChild(modal);

  // Inyectar estilos CSS para el efecto ripple animado
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .virtual-ripple-ring {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid rgba(59, 130, 246, 0.9);
      transform: translate(-50%, -50%) scale(0);
      opacity: 0;
      pointer-events: none;
      transition: none;
    }
    .virtual-ripple-ring.active {
      animation: virtualRipplePulse 0.6s ease-out forwards;
    }
    @keyframes virtualRipplePulse {
      0% { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

// =========================================================================
// ASIGNACIÓN DE GLOBALES PARA EVENTOS ONCLICK EN EL DOM
// =========================================================================
if (typeof window !== 'undefined') {
  window.openVideoSimulatorModal = openVideoSimulatorModal;
  window.closeVideoSimulatorModalAction = closeVideoSimulatorModal;
  window.selectVideoModuleAction = selectVideoModule;
  window.toggleVideoPlayPauseAction = toggleVideoPlayPause;
  window.seekVideoSimulationAction = seekVideoSimulation;
  window.cyclePlaybackSpeedAction = cyclePlaybackSpeed;
  window.restartCurrentVideoAction = restartCurrentVideo;
}
