// js/ui/videoSimulatorModal.js
// Reproductor Web de Video-Simulación Interactiva para Cubikar (Alternativa 1)
// Simula audiovisualmente el 100% de los 15 módulos con pantallas dinámicas realistas,
// cursor virtual animado con clic ripple, tipografía de texto en tiempo real,
// barra de tiempo deslizable (scrubber), selector de velocidad y subtítulos sincronizados.

import { renderModuleVisualScene } from './realisticSimulatorShell.js?v=20261113_23';

let isVideoModalOpen = false;
let currentModuleId = 1;
let isPlaying = false;
let playbackSpeed = 1.0;
let currentTimeSeconds = 0;
let simulationInterval = null;

// Variables de Audio y Narración por Voz
let isVoiceNarrationEnabled = true;
let lastSpokenKey = null;
let lastClickedStepKey = null;
let cachedSpanishVoice = null;
let audioCtx = null;

// =========================================================================
// GUIONES VISUALES DE LOS 15 M"DULOS (100% DE LA APLICACI"N)
// =========================================================================

export const VIDEO_MODULES = [
  // VENTANA 1: PORTAL DE INICIO (MIS PROYECTOS)
  {
    id: 1,
    title: 'Crear Proyecto e Identidad Corporativa',
    badge: 'Módulo 1 • Inicio',
    duration: 25,
    icon: 'fa-folder-plus',
    description: 'Asistente en 2 Pasos: Nombre de empresa, logotipo 1:1, sobrecosto y plantilla.',
    steps: [
      { t: 0, text: 'Para dar de alta una nueva obra, haz clic en el botón azul "+ Nuevo Proyecto".', targetId: 'mock-step1-btn-new', action: 'click' },
      { t: 5, text: 'Paso 1: Asigna el nombre de tu empresa constructora y sube tu logotipo institucional.', targetId: 'mock-step1-empresa', action: 'type', value: 'Constructora del Valle S.A.' },
      { t: 10, text: 'Captura el nombre de la obra y ubicación. Elige la tipología (Edificación, Vivienda, Obra Civil).', targetId: 'mock-step1-obra', action: 'type', value: 'Residencial Palmas Norte' },
      { t: 16, text: 'Paso 2: Configura la divisa (MXN) y los factores de sobrecosto (Indirectos 12%, Utilidad 10%).', targetId: 'mock-step1-sobrecosto', action: 'highlight' },
      { t: 21, text: 'Elige plantilla en blanco o de muestra y haz clic en "Crear Proyecto".', targetId: 'mock-step1-btn-finish', action: 'click' }
    ]
  },
  {
    id: 2,
    title: 'Modo de Trabajo: Obras Propias vs. Invitaciones',
    badge: 'Módulo 2 • Modo de Trabajo',
    duration: 26,
    icon: 'fa-briefcase',
    description: 'Filtro entre proyectos propios, obras compartidas por empresas colaboradoras y gobernanza de planes.',
    steps: [
      { t: 0, text: 'En el portal principal, ubica la barra de "Modo de Trabajo" con su selector desplegable de ámbitos.', targetId: 'mock-step2-mode-bar', action: 'highlight' },
      { t: 5, text: 'En "Mis proyectos", accedes a tus obras de autoría propia gobernadas por tu plan de suscripción activa.', targetId: 'mock-step2-scope-select', action: 'click' },
      { t: 11, text: 'Selecciona una empresa invitadora para acceder como colaborador con permisos granulares (Editor o Lector).', targetId: 'mock-step2-scope-select', action: 'click' },
      { t: 17, text: 'El indicador de membresía se adapta automáticamente al plan del anfitrión sin consumir tu cuota de obras.', targetId: 'mock-step2-status-badge', action: 'highlight' },
      { t: 22, text: 'Presiona "Invitaciones" para sumar residentes, calculistas o auditores a tus propios proyectos de obra.', targetId: 'mock-step2-btn-invite', action: 'click' }
    ]
  },
  {
    id: 3,
    title: 'Invitar Colaboradores y Permisos Granulares',
    badge: 'Módulo 3 • Equipo',
    duration: 25,
    icon: 'fa-users',
    description: 'Gestión de colaboradores, asignación de roles (Editar, Escribir, Leer) y permisos por pestaña.',
    steps: [
      { t: 0, text: 'En la tarjeta de tu obra, haz clic en "+ Invitar" para abrir el gestor de equipo.', targetId: 'mock-step3-btn-invite', action: 'click' },
      { t: 5, text: 'Captura el correo del colaborador y asígnale su avatar temático con casco.', targetId: 'mock-step3-email', action: 'type', value: 'ing.torres@constructora.com' },
      { t: 11, text: 'Selecciona el rol de trabajo: Editar (Control Total), Escribir (Captura) o Leer (Solo Consulta).', targetId: 'mock-step3-roles', action: 'highlight' },
      { t: 17, text: 'Activa o restringe selectivamente las pestañas (Catálogo, Compras, Bitácora).', targetId: 'mock-step3-tabs', action: 'click' },
      { t: 21, text: 'Presiona "Agregar Colaborador". El invitado recibirá la notificación para aceptar con 1 clic.', targetId: 'mock-step3-btn-add', action: 'click' }
    ]
  },

  // VENTANA 2: PESTAÑA 1: PRESUPUESTO Y APU
  {
    id: 4,
    title: 'Catálogo de Conceptos y Presupuesto Base',
    badge: 'Módulo 4 • Presupuesto',
    duration: 25,
    icon: 'fa-list-check',
    description: 'Estructuración multinivel, edición en celda, atajos Alt+Flechas y renumeración.',
    steps: [
      { t: 0, text: 'Crea Partidas Principales con el botón "+ Nueva Partida". El sistema renumerará automáticamente.', targetId: 'mock-step4-btn-partida', action: 'click' },
      { t: 6, text: 'Agrega subpartidas o conceptos de obra e ingresa sus especificaciones técnicas.', targetId: 'mock-step4-desc', action: 'type', value: 'Muro de tabique rojo recocido e=14cm' },
      { t: 12, text: 'Edita directamente en celda la unidad de medida, cantidad y precio unitario.', targetId: 'mock-step4-cells', action: 'highlight' },
      { t: 17, text: 'Usa los atajos Alt + Flecha Arriba/Abajo para reordenar renglones sin perder la jerarquía.', targetId: 'mock-step4-reorder', action: 'click' },
      { t: 21, text: 'Asigna colores personalizados por partida para presentaciones ejecutivas.', targetId: 'mock-step4-color', action: 'highlight' }
    ]
  },
  {
    id: 5,
    title: 'Análisis de Precios Unitarios (APU)',
    badge: 'Módulo 5 • Matrices',
    duration: 26,
    icon: 'fa-calculator',
    description: 'Desglose en 4 rubros: Materiales, Mano de Obra con FASAR, Maquinaria y Subcontratos.',
    steps: [
      { t: 0, text: 'Haz clic en el botón "APU" de cualquier concepto para abrir la matriz de análisis.', targetId: 'mock-step5-btn-apu', action: 'click' },
      { t: 6, text: 'Rubro Materiales: analiza insumos básicos con consumos, mermas y costos de compra.', targetId: 'mock-step5-mat', action: 'highlight' },
      { t: 12, text: 'Rubro Mano de Obra: añade cuadrillas de oficiales y peones con rendimientos y FASAR.', targetId: 'mock-step5-mo', action: 'highlight' },
      { t: 17, text: 'Rubro Equipo: define costos horarios de maquinaria y porcentaje de herramienta menor.', targetId: 'mock-step5-eq', action: 'highlight' },
      { t: 22, text: 'Comprueba cómo el Costo Directo y el Factor de Sobrecosto calculan el Precio de Venta final.', targetId: 'mock-step5-total', action: 'click' }
    ]
  },
  {
    id: 6,
    title: 'Inteligencia Artificial y Google Search Grounding',
    badge: 'Módulo 6 • IA Gemini',
    duration: 26,
    icon: 'fa-brain',
    description: 'Cotizaciones en tiempo real con fuentes de mercado y estimación automática de matrices APU.',
    steps: [
      { t: 0, text: 'Haz clic en el Menú Dividido de Inteligencia Artificial en la barra superior de herramientas.', targetId: 'mock-step6-btn-ai', action: 'click' },
      { t: 5, text: 'Selecciona "Precios Web en Vivo (Google)" para cotizar costos reales de mercado hoy.', targetId: 'mock-step6-menu-web', action: 'click' },
      { t: 10, text: 'Se despliega la ventana oficial de Google Search Grounding para la zapata seleccionada (CIM-001).', targetId: 'mock-step6-concept-card', action: 'highlight' },
      { t: 16, text: 'Verifica la activación de Google Search Grounding conectado a Home Depot, Construrama y Cemex.', targetId: 'mock-step6-grounding-toggle', action: 'click' },
      { t: 21, text: 'Presiona "Cotizar en Web y Llenar Matriz". Gemini calcula cuadrillas, materiales y rendimientos en vivo.', targetId: 'mock-step6-btn-run', action: 'click' }
    ]
  },
  {
    id: 7,
    title: 'Catálogos Maestros y de Referencia',
    badge: 'Módulo 7 • Referencia',
    duration: 25,
    icon: 'fa-book-bookmark',
    description: 'Exploración de miles de conceptos precargados en Catálogos Maestros y Tabuladores oficiales.',
    steps: [
      { t: 0, text: 'Abre el Catálogo Maestro desde la barra lateral izquierda para acceder a la biblioteca offline.', targetId: 'mock-step7-btn-master', action: 'click' },
      { t: 6, text: 'Filtra por especialidad: Edificación, Instalaciones, Infraestructura o Climatización.', targetId: 'mock-step7-specialties', action: 'click' },
      { t: 12, text: 'Busca palabras clave para localizar conceptos probados con sus matrices APU completas.', targetId: 'mock-step7-search', action: 'type', value: 'Zapata corrida concreto f\'c=250' },
      { t: 17, text: 'Revisa la ficha técnica del concepto con claves oficiales y rendimientos probados.', targetId: 'mock-step7-preview', action: 'highlight' },
      { t: 21, text: 'Haz clic en "Insertar al Presupuesto" para inyectarlo en tu obra activa con 1 solo clic.', targetId: 'mock-step7-btn-insert', action: 'click' }
    ]
  },
  {
    id: 8,
    title: 'Explosión y Consolidado de Insumos Generales',
    badge: 'Módulo 8 • Insumos',
    duration: 24,
    icon: 'fa-boxes-stacked',
    description: 'Explosión general de materiales, cambio masivo de costos y unificación de duplicados.',
    steps: [
      { t: 0, text: 'Entra a la pestaña "Insumos Generales" para ver los totales consolidados de la obra.', targetId: 'mock-step8-tab-insumos', action: 'click' },
      { t: 6, text: 'Filtra por pestaña: Materiales, Mano de Obra, Maquinaria o Subcontratos.', targetId: 'mock-step8-filters', action: 'click' },
      { t: 12, text: 'Cambio masivo: edita el costo del cemento o varilla directamente en la celda.', targetId: 'mock-step8-price-cell', action: 'type', value: '$3,850.00 / Ton' },
      { t: 17, text: 'El sistema recalcula automáticamente en cascada todos los conceptos donde se utiliza.', targetId: 'mock-step8-cascade', action: 'highlight' },
      { t: 21, text: 'Usa "Unificar Insumos" para combinar materiales duplicados bajo una sola clave estándar.', targetId: 'mock-step8-btn-unify', action: 'click' }
    ]
  },
  {
    id: 9,
    title: 'Reportes e Impresión Oficial en PDF',
    badge: 'Módulo 9 • Reportes',
    duration: 24,
    icon: 'fa-print',
    description: 'Formatos oficiales de Presupuesto Base, Matrices APU e Insumos con membrete y firmas.',
    steps: [
      { t: 0, text: 'Abre el menú de Impresión desde la barra de herramientas del presupuesto.', targetId: 'mock-step9-btn-print', action: 'click' },
      { t: 6, text: 'Configura las Firmas Oficiales: Elaboró, Revisó, Aprobó y Autorizó.', targetId: 'mock-step9-signatures', action: 'highlight' },
      { t: 12, text: 'Selecciona el formato: Presupuesto Base, Ficha de Precio Unitario (APU) o Explosión de Insumos.', targetId: 'mock-step9-formats', action: 'click' },
      { t: 17, text: 'El reporte se genera con tu Logotipo institucional 1:1, sobrecosto y totales en letra oficiales.', targetId: 'mock-step9-preview', action: 'highlight' },
      { t: 21, text: 'Descarga el archivo PDF vectorial listo para entrega técnica o licitación.', targetId: 'mock-step9-btn-download', action: 'click' }
    ]
  },

  // VENTANA 3: PESTAÑA 2: CALENDARIO DE OBRA Y GANTT
  {
    id: 10,
    title: 'Calendario de Obra y Diagrama de Gantt',
    badge: 'Módulo 10 • Tiempos',
    duration: 25,
    icon: 'fa-calendar-days',
    description: 'Cronograma interactivo ligado al catálogo, ruta crítica y calendario financiero.',
    steps: [
      { t: 0, text: 'Pasa a la pestaña "Calendario de Obra" para planificar la ejecución en el tiempo.', targetId: 'mock-step10-tab-cal', action: 'click' },
      { t: 6, text: 'Arrastra las barras del Gantt o edita las duraciones para programar las fechas de ejecución.', targetId: 'mock-step10-gantt-bars', action: 'highlight' },
      { t: 11, text: 'Usa el "Asistente AI" para sugerir duraciones lógicas según los rendimientos de la matriz APU.', targetId: 'mock-step10-btn-ai', action: 'click' },
      { t: 17, text: 'Activa la "Ruta Crítica" para vigilar las tareas que no admiten holgura en el tiempo de entrega.', targetId: 'mock-step10-critical', action: 'click' },
      { t: 21, text: 'Consulta el Calendario Financiero de erogaciones semanales o mensuales programadas.', targetId: 'mock-step10-financial', action: 'highlight' }
    ]
  },

  // VENTANA 4: PESTAÑA 3: ESTIMACIONES Y COBRO
  {
    id: 11,
    title: 'Estimaciones y Números Generadores de Cobro',
    badge: 'Módulo 11 • Cobros',
    duration: 24,
    icon: 'fa-file-invoice-dollar',
    description: 'Periodos de corte, captura de generadores de obra, amortización de anticipos y estados de cuenta.',
    steps: [
      { t: 0, text: 'Abre la pestaña "Estimaciones" para generar tus cortes de cobro de obra periódicos.', targetId: 'mock-step11-tab-est', action: 'click' },
      { t: 6, text: 'Crea una "Nueva Estimación" definiendo las fechas del periodo de corte.', targetId: 'mock-step11-btn-new', action: 'click' },
      { t: 12, text: 'Captura los volúmenes de obra efectivamente ejecutados (números generadores).', targetId: 'mock-step11-inputs', action: 'type', value: '145.00 m2 ejecutados' },
      { t: 17, text: 'Revisa el cálculo automático de amortización de anticipo (30%) y retención de fondo de garantía.', targetId: 'mock-step11-summary', action: 'highlight' },
      { t: 21, text: 'Descarga la Carátula Oficial de Estimación en PDF lista para cobro con firmas.', targetId: 'mock-step11-btn-pdf', action: 'click' }
    ]
  },

  // VENTANA 5: PESTAÑA 4: COMPRAS Y ERP
  {
    id: 12,
    title: 'Compras, Gastos y ERP Financiero',
    badge: 'Módulo 12 • Egresos',
    duration: 26,
    icon: 'fa-cart-shopping',
    description: 'Dashboard financiero, registro de facturas, comparativa presupuesto vs real y órdenes de compra.',
    steps: [
      { t: 0, text: 'Accede a "Compras y Pagos" para revisar las métricas de Presupuesto vs Gasto Real.', targetId: 'mock-step12-tab-compras', action: 'click' },
      { t: 6, text: 'Haz clic en "+ Registrar Gasto" para capturar una factura, ticket o remisión.', targetId: 'mock-step12-btn-new', action: 'click' },
      { t: 12, text: 'Captura proveedor, concepto, tipo de egreso e importe con IVA. Adjunta la factura en PDF.', targetId: 'mock-step12-form', action: 'type', value: 'Factura F-4892 • Concreto f\'c=250' },
      { t: 17, text: 'Cambia el estatus de pago con 1 clic: "Pagado", "Pendiente" o "Parcial" para control de tesorería.', targetId: 'mock-step12-status', action: 'click' },
      { t: 22, text: 'Genera e imprime la Orden de Compra oficial con membrete corporativo y folio.', targetId: 'mock-step12-btn-order', action: 'click' }
    ]
  },

  // VENTANA 6: PESTAÑA 5: BITÁCORA DE OBRA
  {
    id: 13,
    title: 'Bitácora Electrónica y Legal de Obra (LOPSRM / BESOP)',
    badge: 'Módulo 13 • Bitácora',
    duration: 26,
    icon: 'fa-book',
    description: 'Folios inalterables #001, registro de clima, firma digital táctil y sellado criptográfico.',
    steps: [
      { t: 0, text: 'Abre la pestaña "Bitácora de Obra" para gestionar el libro legal de notas conforme a ley.', targetId: 'mock-step13-tab-bitacora', action: 'click' },
      { t: 6, text: 'Haz clic en "+ Nueva Nota" y selecciona el tipo (Apertura, Instrucción, Avance o Incidencia).', targetId: 'mock-step13-btn-new', action: 'click' },
      { t: 12, text: 'Registra el estado del tiempo (Soleado, Lluvia, Viento) y vincula los conceptos ejecutados.', targetId: 'mock-step13-clima', action: 'click' },
      { t: 17, text: 'Dibuja tu firma digital manuscrita en el panel táctil con mouse, stylus o dedo.', targetId: 'mock-step13-firma', action: 'highlight' },
      { t: 22, text: 'Presiona "Sellar Nota Oficial". Se genera un Hash SHA inmutable y se compila al Libro PDF.', targetId: 'mock-step13-btn-save', action: 'click' }
    ]
  },

  // VENTANA 7: HERRAMIENTAS GLOBALES Y SEGURIDAD
  {
    id: 14,
    title: 'Chat de Proyecto y Bitácora Contextual',
    badge: 'Módulo 14 • Comunicación',
    duration: 25,
    icon: 'fa-comments',
    description: 'Canales Técnico y Financiero, menciones @Usuario y comentarios directos en partidas.',
    steps: [
      { t: 0, text: 'Abre la ventana del chat desde el botón flotante inferior o la barra lateral izquierda.', targetId: 'mock-step14-btn-chat', action: 'click' },
      { t: 5, text: 'Alterna entre la Sección Técnica (Catálogo/Calendario) y la Sección Financiera (Compras/Estimaciones).', targetId: 'mock-step14-tabs', action: 'click' },
      { t: 11, text: 'Escribe un mensaje usando "@" para alertar a un compañero con notificación en tiempo real.', targetId: 'mock-step14-input', action: 'type', value: '@Carlos Revisar volumen de concreto en cimentación' },
      { t: 17, text: 'Comenta directamente sobre cualquier partida haciendo clic en su icono de chat.', targetId: 'mock-step14-partida-tag', action: 'highlight' },
      { t: 21, text: 'Exporta la Minuta Oficial de Acuerdos a PDF con membrete institucional y firmas.', targetId: 'mock-step14-btn-print', action: 'click' }
    ]
  },
  {
    id: 15,
    title: 'Importador Universal (Excel, Opus y Neodata)',
    badge: 'Módulo 15 • Importación',
    duration: 24,
    icon: 'fa-cloud-arrow-up',
    description: 'Carga de archivos .xlsx, .csv y .json con mapeo inteligente de columnas y vista previa.',
    steps: [
      { t: 0, text: 'Haz clic en "Importar Archivo" en la barra lateral izquierda.', targetId: 'mock-step15-btn-import', action: 'click' },
      { t: 6, text: 'Arrastra tu archivo Excel (.xlsx, .xls) o respaldo de Opus / Neodata.', targetId: 'mock-step15-dropzone', action: 'highlight' },
      { t: 12, text: 'El Asistente detecta automáticamente las columnas: Clave, Descripción, Unidad, Cantidad y Precio.', targetId: 'mock-step15-mapping', action: 'highlight' },
      { t: 17, text: 'Revisa la vista previa de renglones y selecciona si importar al Presupuesto o al Catálogo Maestro.', targetId: 'mock-step15-preview', action: 'click' },
      { t: 21, text: 'Presiona "Iniciar Importación". Miles de conceptos se procesan en segundos 100% offline.', targetId: 'mock-step15-btn-start', action: 'click' }
    ]
  },
  {
    id: 16,
    title: 'Seguridad, Respaldos y Perfil Profesional',
    badge: 'Módulo 16 • Ajustes',
    duration: 24,
    icon: 'fa-shield-halved',
    description: 'Candado de bloqueo de pestañas (Tab Lock), respaldo de seguridad .json y temas día/noche.',
    steps: [
      { t: 0, text: 'Usa el botón de candado "Tab Lock" para congelar la edición contra cambios accidentales.', targetId: 'mock-step16-btn-lock', action: 'click' },
      { t: 6, text: 'Descarga un Respaldo Completo (.json) de tu obra para tener copia de seguridad local.', targetId: 'mock-step16-btn-backup', action: 'click' },
      { t: 12, text: 'En tu Perfil de Usuario, personaliza tus datos y cambia entre Modo Día y Modo Nocturno.', targetId: 'mock-step16-profile', action: 'highlight' },
      { t: 17, text: 'Monitorea tu cuota de almacenamiento en la nube y estado de sincronización.', targetId: 'mock-step16-quota', action: 'highlight' },
      { t: 21, text: '¡Listo! Cubikar mantiene tu información blindada, organizada y accesible desde cualquier lugar.', targetId: 'mock-step16-logo', action: 'click' }
    ]
  }
];

// =========================================================================
// MÉTODOS DEL CONTROLADOR DEL REPRODUCTOR
// =========================================================================

// =========================================================================
// MOTOR DE NARRACI"N POR VOZ Y EFECTOS DE SONIDO (AUDIO ENGINE)
// =========================================================================

function getSpanishVoice() {
  if (cachedSpanishVoice) return cachedSpanishVoice;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;

  // 1. Preferir voz en español de México (es-MX)
  let voice = voices.find(v => v.lang === 'es-MX' || v.lang === 'es_MX');
  // 2. Preferir voz en español latinoamericano (es-419, es-US, etc.)
  if (!voice) {
    voice = voices.find(v => v.lang && (v.lang.startsWith('es-') || v.lang.startsWith('es_')) && !v.lang.includes('ES'));
  }
  // 3. Cualquier voz en español
  if (!voice) {
    voice = voices.find(v => (v.lang && v.lang.toLowerCase().startsWith('es')) || (v.name && v.name.toLowerCase().includes('spanish')));
  }
  // 4. Fallback a la primera voz disponible
  if (!voice) voice = voices[0];

  cachedSpanishVoice = voice;
  return voice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedSpanishVoice = null;
    getSpanishVoice();
  };
}

function cleanNarrationText(text) {
  if (!text) return '';
  let clean = text.replace(/<\/?[^>]+(>|$)/g, ' ');
  clean = clean.replace(/\bAPU\b/g, 'A-P-U');
  clean = clean.replace(/\bPDF\b/g, 'P-D-F');
  clean = clean.replace(/\bERP\b/g, 'E-R-P');
  clean = clean.replace(/\bFASAR\b/g, 'Fasar');
  clean = clean.replace(/\bLOPSRM\b/g, 'Ley de Obra Pública');
  clean = clean.replace(/\bBESOP\b/g, 'Besop');
  clean = clean.replace(/\bSHA\b/g, 'Sha');
  clean = clean.replace(/\bMXN\b/g, 'pesos');
  clean = clean.replace(/\bAlt\s*\+\s*Flechas?\b/gi, 'Alt más flechas');
  clean = clean.replace(/\b1:1\b/g, 'uno a uno');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function speakNarration(rawText) {
  if (!isVoiceNarrationEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }

    const cleanText = cleanNarrationText(rawText);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voice = getSpanishVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'es-MX';
    } else {
      utterance.lang = 'es-MX';
    }

    // Ajuste de ritmo de narración según la velocidad del video (1.0x -> 1.05, 1.5x -> 1.35, 2.0x -> 1.65)
    let rate = 1.05;
    if (playbackSpeed === 1.5) rate = 1.35;
    else if (playbackSpeed === 2.0) rate = 1.65;
    utterance.rate = rate;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Retardo asíncrono seguro para que Chromium procese la cancelación previa
    setTimeout(() => {
      try {
        if (!isVoiceNarrationEnabled || !isPlaying) return;
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch (e) {}
    }, 25);
  } catch (err) {
    console.warn('[VideoSimulator] Error en síntesis de voz:', err);
  }
}

function stopNarration() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
}

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch (e) {}
  }
  return audioCtx;
}

function playSfxClick() {
  if (!isVoiceNarrationEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.045);
  } catch (e) {}
}

function playSfxType() {
  if (!isVoiceNarrationEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1100 + Math.random() * 300, ctx.currentTime);
    gain.gain.setValueAtTime(0.025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch (e) {}
}

function playSfxChime() {
  if (!isVoiceNarrationEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.06, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.3);
    });
  } catch (e) {}
}

export function toggleVoiceNarration() {
  isVoiceNarrationEnabled = !isVoiceNarrationEnabled;
  if (!isVoiceNarrationEnabled) {
    stopNarration();
  } else {
    lastSpokenKey = null;
    const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
    const steps = mod.steps || [];
    let currentStep = steps[0];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (currentTimeSeconds >= steps[i].t) {
        currentStep = steps[i];
        break;
      }
    }
    if (isPlaying && currentStep) {
      speakNarration(currentStep.text);
    }
  }

  updateNarrationButtonUI();
}

function updateNarrationButtonUI() {
  const btn = document.getElementById('video-btn-narration-toggle');
  const icon = document.getElementById('video-narration-icon');
  const label = document.getElementById('video-narration-label');
  if (!btn || !icon || !label) return;

  if (isVoiceNarrationEnabled) {
    btn.className = 'px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs';
    icon.className = 'fa-solid fa-volume-high text-xs text-amber-400';
    label.textContent = 'Audio ON';
    btn.title = 'Voz de narración activada (clic para silenciar)';
  } else {
    btn.className = 'px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white font-medium text-xs flex items-center gap-1.5 transition cursor-pointer';
    icon.className = 'fa-solid fa-volume-xmark text-xs text-slate-500';
    label.textContent = 'Audio OFF';
    btn.title = 'Voz de narración silenciada (clic para activar)';
  }
}

// =========================================================================
// MÉTODOS DEL CONTROLADOR DEL REPRODUCTOR
// =========================================================================

export function openVideoSimulatorModal(moduleId = 1) {
  currentModuleId = Number(moduleId) || 1;
  isVideoModalOpen = true;
  currentTimeSeconds = 0;
  isPlaying = true;
  lastSpokenKey = null;
  lastClickedStepKey = null;

  getAudioContext();

  injectVideoSimulatorDom();
  loadModuleInPlayer(currentModuleId);

  const modal = document.getElementById('cubikar-video-simulator-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  updateNarrationButtonUI();
  startPlaybackTimer();
}

export function closeVideoSimulatorModal() {
  pauseVideoSimulation();
  stopNarration();
  isVideoModalOpen = false;

  const modal = document.getElementById('cubikar-video-simulator-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}
export const closeVideoSimulatorModalAction = closeVideoSimulatorModal;

export function selectVideoModule(moduleId) {
  stopNarration();
  currentModuleId = Number(moduleId);
  currentTimeSeconds = 0;
  lastSpokenKey = null;
  lastClickedStepKey = null;
  loadModuleInPlayer(currentModuleId);
  if (!isPlaying) {
    toggleVideoPlayPause();
  }
}

function loadModuleInPlayer(modId) {
  const mod = VIDEO_MODULES.find(m => m.id === modId) || VIDEO_MODULES[0];

  const titleEl = document.getElementById('video-player-mod-title');
  const badgeEl = document.getElementById('video-player-mod-badge');
  const totalTimeEl = document.getElementById('video-player-total-time');

  if (titleEl) titleEl.textContent = `${mod.id}. ${mod.title}`;
  if (badgeEl) badgeEl.textContent = mod.badge;
  if (totalTimeEl) totalTimeEl.textContent = formatTimeDisplay(mod.duration);

  // Renderizar la pantalla simulada correspondiente al módulo
  renderModuleVisualScene(mod.id);

  // Resaltar elemento activo en la lista lateral
  document.querySelectorAll('.video-playlist-item').forEach(el => {
    const elId = Number(el.getAttribute('data-mod-id'));
    if (elId === mod.id) {
      el.classList.add('bg-blue-600/30', 'border-blue-500/60', 'text-white');
      el.classList.remove('bg-slate-800/60', 'border-slate-800', 'text-slate-300');
    } else {
      el.classList.remove('bg-blue-600/30', 'border-blue-500/60', 'text-white');
      el.classList.add('bg-slate-800/60', 'border-slate-800', 'text-slate-300');
    }
  });

  updateProgressScrubber(0, mod.duration);
  renderSimulationStageFrame(0);
}

export function toggleVideoPlayPause() {
  isPlaying = !isPlaying;
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) {
    playIcon.className = isPlaying ? 'fa-solid fa-pause text-base' : 'fa-solid fa-play text-base';
  }

  if (isPlaying) {
    getAudioContext();
    startPlaybackTimer();
  } else {
    pauseVideoSimulation();
  }
}

function pauseVideoSimulation() {
  isPlaying = false;
  stopNarration();
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-play text-base';
}

function startPlaybackTimer() {
  if (simulationInterval) clearInterval(simulationInterval);

  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-pause text-base';

  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  const stepMs = 250;

  simulationInterval = setInterval(() => {
    if (!isPlaying) return;

    currentTimeSeconds += (stepMs / 1000) * playbackSpeed;

    if (currentTimeSeconds >= mod.duration) {
      currentTimeSeconds = mod.duration;
      pauseVideoSimulation();
      playSfxChime();
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

export function seekVideoSimulation(event) {
  const progressBar = document.getElementById('video-progress-container');
  if (!progressBar) return;

  const rect = progressBar.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));

  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  currentTimeSeconds = pct * mod.duration;

  stopNarration();
  lastSpokenKey = null;
  lastClickedStepKey = null;

  updateProgressScrubber(currentTimeSeconds, mod.duration);
  renderSimulationStageFrame(currentTimeSeconds);
}

export function cyclePlaybackSpeed() {
  if (playbackSpeed === 1.0) playbackSpeed = 1.5;
  else if (playbackSpeed === 1.5) playbackSpeed = 2.0;
  else playbackSpeed = 1.0;

  const speedBadge = document.getElementById('video-speed-indicator');
  if (speedBadge) speedBadge.textContent = `${playbackSpeed}x`;

  // Re-narrar el paso actual a la nueva velocidad si está reproduciendo
  if (isPlaying && isVoiceNarrationEnabled) {
    const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
    const steps = mod.steps || [];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (currentTimeSeconds >= steps[i].t) {
        speakNarration(steps[i].text);
        break;
      }
    }
  }
}

export function restartCurrentVideo() {
  stopNarration();
  currentTimeSeconds = 0;
  isPlaying = true;
  lastSpokenKey = null;
  lastClickedStepKey = null;
  const playIcon = document.getElementById('video-btn-play-icon');
  if (playIcon) playIcon.className = 'fa-solid fa-pause text-base';
  startPlaybackTimer();
}

function formatTimeDisplay(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
}

function updateProgressScrubber(current, total) {
  const bar = document.getElementById('video-progress-fill');
  const knob = document.getElementById('video-progress-knob');
  const timeCurrentEl = document.getElementById('video-player-current-time');

  const pct = total > 0 ? (current / total) * 100 : 0;

  if (bar) bar.style.width = `${pct}%`;
  if (knob) knob.style.left = `${pct}%`;
  if (timeCurrentEl) timeCurrentEl.textContent = formatTimeDisplay(current);
}

function renderSimulationStageFrame(seconds) {
  const mod = VIDEO_MODULES.find(m => m.id === currentModuleId) || VIDEO_MODULES[0];
  const steps = mod.steps || [];

  let currentStep = steps[0];
  let currentStepIndex = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (seconds >= steps[i].t) {
      currentStep = steps[i];
      currentStepIndex = i;
      break;
    }
  }

  // Actualizar subtítulo sincronizado con icono de narración
  const subtitleEl = document.getElementById('video-subtitle-caption');
  if (subtitleEl && currentStep) {
    subtitleEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-600/30 text-blue-300 font-mono text-[10px] font-bold border border-blue-400/30 mr-2 shrink-0">
        <i class="fa-solid ${isVoiceNarrationEnabled ? 'fa-volume-high text-amber-400 animate-pulse' : 'fa-play text-blue-400'} text-[8px]"></i> ${formatTimeDisplay(seconds)}
      </span>
      <span>${currentStep.text}</span>
    `;
  }

  // Disparar narración por voz si cambió de paso
  const stepKey = `${currentModuleId}_${currentStepIndex}`;
  if (isPlaying && isVoiceNarrationEnabled && lastSpokenKey !== stepKey) {
    lastSpokenKey = stepKey;
    speakNarration(currentStep.text);
  }

    // Control Dinámico de Vistas y Ventanas Flotantes para Módulo 6 (IA Gemini Grounding)
  if (currentModuleId === 6) {
    const aiMenu = document.getElementById('mock-step6-ai-menu');
    const aiOverlay = document.getElementById('mock-step6-modal-overlay');
    if (aiMenu && aiOverlay) {
      if (seconds < 10) {
        aiMenu.style.display = 'block';
        aiOverlay.style.display = 'none';
        aiOverlay.classList.add('hidden');
      } else {
        aiMenu.style.display = 'none';
        aiOverlay.style.display = 'flex';
        aiOverlay.classList.remove('hidden');
      }
    }
  }

  // Control Dinámico para Módulo 2 (Modo de Trabajo: Obras Propias vs Invitaciones)
  if (currentModuleId === 2) {
    const scopeSelect = document.getElementById('mock-step2-scope-select');
    const statusBadge = document.getElementById('mock-step2-status-badge');
    const ownCards = document.getElementById('mock-step2-cards-owned');
    const invitedCards = document.getElementById('mock-step2-cards-invited');

    if (scopeSelect && statusBadge && ownCards && invitedCards) {
      if (seconds < 11) {
        scopeSelect.value = 'owned';
        statusBadge.innerHTML = `
          <div class="flex items-center gap-2 bg-slate-900/90 border border-amber-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs">
            <i class="fa-solid fa-crown text-amber-400"></i>
            <span class="text-slate-300">🏷️ Membresía activa: <strong class="text-white">Plan Profesional</strong></span>
            <span class="text-amber-300 font-mono text-[10px] bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30 font-bold">(3/5 obras)</span>
          </div>
        `;
        ownCards.style.display = 'grid';
        invitedCards.style.display = 'none';
      } else {
        scopeSelect.value = 'invited';
        statusBadge.innerHTML = `
          <div class="flex items-center gap-2 bg-slate-900/90 border border-indigo-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs ring-2 ring-indigo-400 animate-pulse">
            <i class="fa-solid fa-user-check text-indigo-400"></i>
            <span class="text-slate-300">Espacio Invitado: <strong class="text-white">Arq. Carlos González</strong></span>
            <span class="text-indigo-300 font-mono text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/30 font-bold">Rol: Editor (Plan Pro del Anfitrión)</span>
          </div>
        `;
        ownCards.style.display = 'none';
        invitedCards.style.display = 'grid';
      }
    }
  }

  // Animar el cursor virtual hacia el objetivo de la escena
  animateVirtualStageCursor(currentStep, seconds);
}

function animateVirtualStageCursor(step, seconds) {
  const cursor = document.getElementById('virtual-cursor-pointer');
  const ripple = document.getElementById('virtual-cursor-ripple');
  if (!cursor || !step) return;

  const stage = document.getElementById('virtual-stage-viewport') || document.getElementById('virtual-desktop-screen');
  if (!stage) return;

  const targetEl = document.getElementById(step.targetId);
  const stageRect = stage.getBoundingClientRect();

  let targetX = stage.clientWidth / 2;
  let targetY = stage.clientHeight / 2;

  if (targetEl) {
    const targetRect = targetEl.getBoundingClientRect();
    targetX = targetRect.left - stageRect.left + (targetRect.width / 2);
    targetY = targetRect.top - stageRect.top + (targetRect.height / 2);
  }

  cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;
  cursor.style.opacity = '1';

  // Efecto de Clic (Ripple) y Sonido SFX
  const stepElapsed = seconds - step.t;
  const clickKey = `${currentModuleId}_${step.t}`;
  if (stepElapsed > 0.3 && stepElapsed < 1.1 && ripple) {
    ripple.style.left = `${targetX}px`;
    ripple.style.top = `${targetY}px`;
    ripple.className = 'virtual-ripple-ring active';

    if (step.action === 'click' && stepElapsed >= 0.3 && stepElapsed < 0.7 && lastClickedStepKey !== clickKey) {
      lastClickedStepKey = clickKey;
      playSfxClick();
    }
  } else if (ripple) {
    ripple.className = 'virtual-ripple-ring';
  }

  // Efecto de tipeo simulado si hay valor con sonido de tecleo
  if (step.action === 'type' && step.value && targetEl) {
    const textSpan = targetEl.querySelector('.mock-type-value') || targetEl;
    if (textSpan && textSpan.tagName !== 'INPUT') {
      const fullText = step.value;
      const progress = Math.min(1, Math.max(0, (seconds - step.t) / 2));
      const chars = Math.floor(progress * fullText.length);
      const prevChars = Number(textSpan.getAttribute('data-typed-chars') || '0');
      if (chars > prevChars) {
        textSpan.setAttribute('data-typed-chars', String(chars));
        playSfxType();
      }
      textSpan.textContent = fullText.slice(0, chars);
    }
  }
}

// =========================================================================
// RENDERIZADOR DINMICO DE PANTALLAS FOTORREALISTAS (15 MDULOS DE CUBIKAR)
// =========================================================================
// Implementado e importado desde './realisticSimulatorShell.js' para
// garantizar que coincida al 100% con la interfaz real de Cubikar.

// =========================================================================
// INYECCIN DE LA INTERFAZ DEL REPRODUCTOR EN EL DOM
// =========================================================================

function injectVideoSimulatorDom() {
  const existing = document.getElementById('cubikar-video-simulator-modal');
  if (existing) {
    if (existing.getAttribute('data-version') !== '20261113_realistic_modals_v3') {
      existing.remove(); // Elimina la versión antigua en memoria para re-inyectar la nueva interfaz realista con modales auténticos
    } else {
      return;
    }
  }

  const modal = document.createElement('div');
  modal.id = 'cubikar-video-simulator-modal';
  modal.setAttribute('data-version', '20261113_realistic_modals_v3');
  modal.className = 'fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[99998] hidden items-center justify-center p-2 sm:p-4 animate-in fade-in zoom-in-95 duration-150 select-none';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden text-slate-100">
      
      <!-- Barra Superior -->
      <div class="bg-slate-950 px-4 sm:px-6 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-xl bg-blue-600/25 border border-blue-400/40 text-blue-400 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-circle-play text-sm"></i>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span id="video-player-mod-badge" class="px-2 py-0.2 rounded-full text-[9.5px] font-extrabold bg-blue-600/30 text-blue-300 border border-blue-400/30 uppercase tracking-wide">
                Mdulo 1
              </span>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                <i class="fa-solid fa-volume-high text-[8px]"></i> Narracin por Voz
              </span>
              <span class="text-[10px] text-slate-400 hidden sm:inline">. Reproductor Interactivo de Cubikar</span>
            </div>
            <h2 id="video-player-mod-title" class="font-bold text-xs sm:text-sm text-white truncate leading-tight">
              1. Crear Proyecto e Identidad Corporativa
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

      <!-- Cuerpo: Escenario + Playlist -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        
        <!-- Escenario de Video y Controles -->
        <div class="flex-1 flex flex-col bg-slate-950/70 p-3 sm:p-4 min-w-0 overflow-hidden">
          
          <!-- Pantalla Virtual de Simulacin Fotorrealista -->
          <div id="virtual-desktop-screen" class="relative flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner flex flex-col min-h-[280px] sm:min-h-[380px]">
            
            <div class="bg-slate-950 px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                <span class="font-mono text-[10px] ml-1 text-slate-500">Cubikar Workspace . Interfaz Oficial en Vivo</span>
              </div>
              <span class="text-[10px] font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                • Animación en Tiempo Real
              </span>
            </div>

            <!-- Contenido dinámico del módulo actual (Fotorrealista al 100% Pantalla Completa Flush) -->
            <div id="virtual-stage-viewport" class="flex-1 p-0 overflow-hidden relative flex flex-col bg-slate-900 text-slate-100 select-none min-h-[380px] w-full h-full">
              <div id="virtual-stage-dynamic-content" class="w-full h-full flex-1 flex flex-col overflow-hidden relative"></div>

              <!-- Cursor Virtual Animado -->
              <div id="virtual-cursor-pointer" class="absolute pointer-events-none transition-all duration-300 ease-out z-30" style="left: 0; top: 0; opacity: 0;">
                <svg class="w-6 h-6 drop-shadow-md text-amber-400 fill-current" viewBox="0 0 24 24">
                  <path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 5.428z" stroke="#0f172a" stroke-width="1.5" />
                </svg>
              </div>

              <!-- Anillo de Clic Virtual (Ripple) -->
              <div id="virtual-cursor-ripple" class="virtual-ripple-ring pointer-events-none z-30"></div>
            </div>

            <!-- Subttulos Sincronizados (CC) -->
            <div class="bg-slate-950/95 px-4 py-2.5 border-t border-slate-800 flex items-center min-h-[46px] shrink-0 text-xs text-slate-200">
              <div id="video-subtitle-caption" class="flex items-center min-w-0 flex-1 leading-snug"></div>
            </div>

          </div>

          <!-- Controles de Video -->
          <div class="pt-3 flex flex-col gap-2 shrink-0">
            <div id="video-progress-container" onclick="window.seekVideoSimulationAction(event)"
                 class="h-2.5 bg-slate-800 hover:bg-slate-700 rounded-full cursor-pointer relative overflow-hidden transition-all group">
              <div id="video-progress-fill" class="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-100" style="width: 0%;"></div>
              <div id="video-progress-knob" class="absolute top-0 bottom-0 w-3 bg-white rounded-full shadow -ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" style="left: 0%;"></div>
            </div>

            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-3">
                <button type="button" onclick="window.toggleVideoPlayPauseAction()"
                        class="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center justify-center transition shadow-md shadow-blue-600/30 cursor-pointer"
                        title="Reproducir / Pausar">
                  <i id="video-btn-play-icon" class="fa-solid fa-play text-sm"></i>
                </button>
                <button type="button" onclick="window.restartCurrentVideoAction()"
                        class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                        title="Reiniciar Video">
                  <i class="fa-solid fa-rotate-left text-xs"></i>
                </button>
                <div class="font-mono text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <span id="video-player-current-time">00:00</span>
                  <span class="text-slate-500">/</span>
                  <span id="video-player-total-time">00:25</span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <!-- Botón de Audio y Narración por Voz -->
                <button type="button" id="video-btn-narration-toggle" onclick="window.toggleVoiceNarrationAction()"
                        class="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                        title="Voz de narración en español y efectos de sonido (Clic para silenciar)">
                  <i id="video-narration-icon" class="fa-solid fa-volume-high text-xs text-amber-400"></i>
                  <span id="video-narration-label" class="hidden sm:inline">Audio ON</span>
                </button>

                <button type="button" onclick="window.cyclePlaybackSpeedAction()"
                        class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        title="Velocidad">
                  <i class="fa-solid fa-gauge-high text-[10px] text-blue-400"></i>
                  <span id="video-speed-indicator">1.0x</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- Playlist Lateral: Los 15 Módulos -->
        <div class="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col shrink-0 min-h-0">
          <div class="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
            <span class="font-bold text-xs text-white flex items-center gap-2">
              <i class="fa-solid fa-list-ol text-blue-400"></i>
              <span>Temario de Módulos (${VIDEO_MODULES.length})</span>
            </span>
            <span class="text-[10px] font-mono text-emerald-400 font-bold">100% Cubierto</span>
          </div>

          <div class="flex-1 overflow-y-auto custom-scroll p-2 space-y-1.5">
            ${VIDEO_MODULES.map(m => `
              <div onclick="window.selectVideoModuleAction(${m.id})"
                   data-mod-id="${m.id}"
                   class="video-playlist-item p-2 rounded-xl border border-slate-800 bg-slate-800/60 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-2.5 text-xs select-none">
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

          <div class="p-2.5 border-t border-slate-800 bg-slate-950/50 shrink-0">
            <button type="button" onclick="window.closeVideoSimulatorModalAction(); window.startInteractiveTour('master', true);"
                    class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer">
              <i class="fa-solid fa-person-walking-arrow-right text-xs"></i>
              <span>Iniciar Tour en Vivo (${VIDEO_MODULES.length} Módulos)</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  `;

  document.body.appendChild(modal);

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
    }
    .virtual-ripple-ring.active {
      animation: virtualRipplePulse 0.5s ease-out forwards;
    }
    @keyframes virtualRipplePulse {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

if (typeof window !== 'undefined') {
  window.openVideoSimulatorModal = openVideoSimulatorModal;
  window.closeVideoSimulatorModalAction = closeVideoSimulatorModal;
  window.selectVideoModuleAction = selectVideoModule;
  window.toggleVideoPlayPauseAction = toggleVideoPlayPause;
  window.seekVideoSimulationAction = seekVideoSimulation;
  window.cyclePlaybackSpeedAction = cyclePlaybackSpeed;
  window.restartCurrentVideoAction = restartCurrentVideo;
  window.toggleVoiceNarrationAction = toggleVoiceNarration;
  window.renderSimulationStageFrame = renderSimulationStageFrame;
}
