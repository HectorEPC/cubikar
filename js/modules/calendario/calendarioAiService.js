// js/modules/calendario/calendarioAiService.js
// Motor Experto + Asistente IA (Gemini) de Proceso Constructivo y Ruta Crítica (CPM)
// Analiza el Tipo de Obra, partidas, volúmenes, matrices APU y días inhábiles para proponer
// duraciones realistas, dependencias Fin-a-Inicio libres de ciclos y frentes simultáneos.

import { state, persistSettings } from '../../state/store.js';
import { getActiveProjectId } from '../../config/constants.js';
import { getProjectById } from '../portal/projectService.js';
import { extractJsonFromAiResponse } from '../ai/geminiClient.js';
import {
  extractScheduleItems,
  getScheduleSettings,
  getWorkdaysSettings,
  getNextWorkingDate,
  countWorkingDaysInclusive,
  calculateWorkdaysSummary,
  parseDate,
  formatDate,
  addDays,
  diffDays
} from './calendarioModel.js';

export const WORK_TYPE_PROFILES = {
  edificacion: {
    id: 'edificacion',
    label: '🏠 Edificación / Residencial y Comercial',
    shortLabel: 'Edificación',
    reasoningParallel:
      'En Edificación, el proceso constructivo inicia con Preliminares y Trazo → Excavación → Cimentación, habilitando Drenaje subterráneo/Cisterna en paralelo antes de cerrar firmes. Posteriormente levanta Estructura Vertical (Muros/Columnas/Castillos) → Losas y Cubiertas, abre frentes simultáneos de Instalaciones Ocultas (Eléctrica, Hidrosanitaria y Especiales), continúa con Albañilería/Aplanados/Impermeabilización → Pisos y Plafones, ejecuta en paralelo Carpintería, Cancelería y Herrería, y cierra con Pintura, Muebles de baño y Limpieza fina.',
    reasoningSerial:
      'Estrategia conservadora secuencial para Edificación: una cuadrilla avanza etapa por etapa esperando el término total del concepto anterior antes de iniciar el siguiente, sin traslapar especialidades.'
  },
  infraestructura: {
    id: 'infraestructura',
    label: '🛣️ Infraestructura / Vialidad y Urbanización',
    shortLabel: 'Infraestructura',
    reasoningParallel:
      'En Infraestructura y Vialidades, la secuencia constructiva protege las capas compactadas: ejecuta Topografía y Preliminares → Despalme y Cortes en Caja → Redes Subterráneas profundas (Agua Potable, Drenaje Sanitario y Pluvial) ANTES de cerrar Subrasante, evitando reabrir zanjas sobre pavimento. Una vez lista la Subrasante, avanza en paralelo con Guarniciones/Banquetas y Base Hidráulica, seguidas de Carpeta de Rodamiento y Alumbrado Público simultáneo, cerrando con Señalamiento Vial y Limpieza.',
    reasoningSerial:
      'Estrategia conservadora secuencial para Infraestructura: terracerías, líneas hidrosanitarias, guarniciones, pavimentos, alumbrado y señalamiento se ejecutan estrictamente en serie.'
  },
  industrial: {
    id: 'industrial',
    label: '🏭 Nave Industrial / Estructura Metálica',
    shortLabel: 'Industrial',
    reasoningParallel:
      'En Nave Industrial Metálica, se optimiza la Ruta Crítica adelantando desde el día 1 el Habilitado y Fabricación de Acero en Taller en paralelo con Plataforma/Terracerías y Cimentación (Zapatas, Dados y Anclas). El Montaje con grúa de Columnas y Armaduras arranca en cuanto coinciden dados fraguados y acero de taller, seguido de Cubierta Laminada para techar el área y permitir simultáneamente Firme Industrial de concreto e Instalaciones Electromecánicas/Contra Incendio, cerrando con Andenes y Acabados.',
    reasoningSerial:
      'Estrategia conservadora secuencial para Nave Industrial: cada etapa espera al cierre completo de la anterior sin fabricar estructura en paralelo con las cimentaciones.'
  },
  remodelacion: {
    id: 'remodelacion',
    label: '🔨 Remodelación / Interiores y Adecuaciones',
    shortLabel: 'Remodelación',
    reasoningParallel:
      'En Remodelación e Interiores, se inicia con Protecciones, Desmantelamientos y Demoliciones → Muros Divisorios/Tablaroca y Albañilería → tendido simultáneo de Instalaciones Eléctricas, Voz/Datos, Hidrosanitarias y Aire Acondicionado → Plafones, Pastas y Pisos → montaje paralelo de Carpintería, Cancelería de cristal y Herrería → Pintura final, Iluminación y Limpieza fina de entrega.',
    reasoningSerial:
      'Estrategia conservadora secuencial para Remodelación: demoliciones, muros, instalaciones, recubrimientos, carpinterías y pintura avanzan uno tras otro con una sola cuadrilla activa.'
  }
};

function normalizeText(str = '') {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Detecta automáticamente el giro / Tipo de Obra configurado en el proyecto activo
export function detectProjectWorkType() {
  try {
    const activeId = getActiveProjectId();
    const proj = activeId ? getProjectById(activeId) : null;
    const rawTipo = normalizeText(proj?.tipoObra || '');
    const rawName = normalizeText(proj?.projectName || state.settings?.projectName || '');
    const combined = `${rawTipo} ${rawName}`;

    if (/infraestructura|vial|carreter|paviment|urbaniz|puente|hidraulic|colector|drenaje urbano/.test(combined)) {
      return 'infraestructura';
    }
    if (/industrial|nave|bodega|planta|metalic|almacen|hangar/.test(combined)) {
      return 'industrial';
    }
    if (/remodel|adecuac|interior|mantenimiento|rehabilit/.test(combined)) {
      return 'remodelacion';
    }
    if (/edific|residencial|casa|vivienda|departament|comercial|torre|oficina|hospital|escuela/.test(combined)) {
      return 'edificacion';
    }

    // Inspeccionar partidas raíz si el nombre es genérico
    const partNames = (state.treeData || []).map(n => normalizeText(n.descripcion)).join(' ');
    if (/subrasante|base hidraulica|carpeta asfaltica|guarnicion|señalamiento vial/.test(partNames)) {
      return 'infraestructura';
    }
    if (/estructura metalica|cubierta kr|andenes|firme industrial/.test(partNames)) {
      return 'industrial';
    }
  } catch (e) {}

  return 'edificacion';
}

// Clasifica cada concepto dentro de su etapa constructiva lógica y subfrente paralelo según el Tipo de Obra
export function classifyConceptConstructiveStage(item, workType = 'edificacion', fallbackOrder = 0) {
  const desc = normalizeText(item.descripcion);
  const part = normalizeText(item.parentPartidaName);
  const clave = normalizeText(item.clave);
  const full = `${desc} ${part}`;

  if (workType === 'infraestructura') {
    if (/trazo|nivelacion|topograf|banco de nivel|seccionamiento|preliminar|señalamiento preventivo|demolicion/.test(full)) {
      return { stageOrder: 10, stageName: '1. Preliminares y Topografía', subFront: 'prelim', canStartEarly: false };
    }
    if (/despalme|corte en caja|excavacion en caja|terraceria|terraplen|prestamo|acarreo/.test(desc) || (/terraceria/.test(part) && !/subrasante|base/.test(desc))) {
      return { stageOrder: 20, stageName: '2. Despalme y Terracerías', subFront: 'terracerias', canStartEarly: false };
    }
    if (/colector|drenaje|sanitari|agua potable|toma domiciliaria|pozo de visita|pluvial|bocatormenta|zanja|cama de arena|tuberia pvc|tuberia pead/.test(full)) {
      return { stageOrder: 30, stageName: '3. Redes Subterráneas (Agua/Drenaje/Pluvial)', subFront: 'redes_sub', canStartEarly: false };
    }
    if (/subrasante|sub-base|subbase|mejoramiento|compactacion al 95/.test(full)) {
      return { stageOrder: 40, stageName: '4. Capa Subrasante y Sub-base', subFront: 'subrasante', canStartEarly: false };
    }
    if (/guarnicion|banqueta|rampa|cuneta|lavadero|muro de contencion/.test(full)) {
      return { stageOrder: 50, stageName: '5A. Guarniciones y Banquetas', subFront: 'obras_civiles', parallelGroup: 50, canStartEarly: false };
    }
    if (/base hidraulica|grava controlada|riego de impregnacion|riego de liga/.test(full)) {
      return { stageOrder: 50, stageName: '5B. Base Hidráulica', subFront: 'base_pav', parallelGroup: 50, canStartEarly: false };
    }
    if (/carpeta|concreto hidraulico|mr-|mr45|mr-42|losa de rodamiento|adoquin|empedrado|pavimento/.test(full)) {
      return { stageOrder: 60, stageName: '6. Pavimento / Carpeta de Rodamiento', subFront: 'carpeta', canStartEarly: false };
    }
    if (/alumbrado|luminaria|poste|registro electrico|mobiliario urbano|bolardo|arborizacion|jardineria/.test(full)) {
      return { stageOrder: 65, stageName: '7. Alumbrado Público y Mobiliario', subFront: 'alumbrado', waitsForStage: 50, canStartEarly: false };
    }
    if (/señalamiento|pintura trafico|termoplastica|vialeta|boya|raya|limpieza|entrega/.test(full)) {
      return { stageOrder: 80, stageName: '8. Señalamiento Vial y Cierre', subFront: 'cierre_vial', canStartEarly: false };
    }
  } else if (workType === 'industrial') {
    if (/taller|fabricacion|habilitado de acero|habilitado y pintura|placa base en taller/.test(desc)) {
      return { stageOrder: 15, stageName: '1B. Habilitado de Acero en Taller', subFront: 'taller_acero', canStartEarly: true };
    }
    if (/trazo|nivelacion|despalme|plataforma|terraceria|tepetate|preliminar|demolicion/.test(full)) {
      return { stageOrder: 10, stageName: '1A. Preliminares y Plataforma', subFront: 'plataforma', canStartEarly: false };
    }
    if (/excavacion|plantilla|zapata|dado|pedestal|ancla|contratrabe|grout|cimentacion|pilote/.test(full)) {
      return { stageOrder: 20, stageName: '2. Cimentación, Dados y Anclas', subFront: 'cimentacion_ind', waitsForStage: 10, canStartEarly: false };
    }
    if (/montaje|columna metalica|armadura|cabrilla|larguero|polin|contraventeo|estructura metalica|grua/.test(full)) {
      return { stageOrder: 30, stageName: '3. Montaje de Estructura Metálica', subFront: 'montaje_acero', waitsForStages: [15, 20], canStartEarly: false };
    }
    if (/cubierta|lamina|kr-18|kr18|r-101|traslucida|colchoneta|canalon|faldon|multipanel|fachada/.test(full)) {
      return { stageOrder: 40, stageName: '4. Cubierta y Fachadas Laminadas', subFront: 'cubierta_ind', canStartEarly: false };
    }
    if (/firme|piso industrial|fibra|pulido espejo|endurecedor|junta de control|muro de block/.test(full)) {
      return { stageOrder: 50, stageName: '5A. Firme Industrial y Muros', subFront: 'firme_ind', parallelGroup: 50, canStartEarly: false };
    }
    if (/subestacion|transformador|charola|high-bay|electric|contra incendio|hidrante|neumatic|instalacion/.test(full)) {
      return { stageOrder: 50, stageName: '5B. Instalaciones Industriales', subFront: 'inst_ind', parallelGroup: 50, canStartEarly: false };
    }
    if (/anden|cortina enrollable|rampa niveladora|oficina|pintura|prueba|limpieza|entrega/.test(full)) {
      return { stageOrder: 70, stageName: '6. Andenes, Acabados y Pruebas', subFront: 'cierre_ind', canStartEarly: false };
    }
  } else if (workType === 'remodelacion') {
    if (/proteccion|desmantelamiento|demolicion|retiro|acarreo de escombro|preliminar/.test(full)) {
      return { stageOrder: 10, stageName: '1. Protecciones y Demoliciones', subFront: 'demolicion', canStartEarly: false };
    }
    if (/tablaroca|durock|muro|albañileria|vano|refuerzo/.test(full)) {
      return { stageOrder: 20, stageName: '2. Muros Divisorios y Albañilería', subFront: 'muros_rem', canStartEarly: false };
    }
    if (/electric|cableado|salida|voz y datos|red/.test(full) && !/luminaria|apagador/.test(desc)) {
      return { stageOrder: 30, stageName: '3A. Instalación Eléctrica y Datos', subFront: 'elec_rem', parallelGroup: 30, canStartEarly: false };
    }
    if (/hidraulic|sanitari|plomeria|aire acondicionado|hvac|gas/.test(full) && !/mueble|wc|lavabo/.test(desc)) {
      return { stageOrder: 30, stageName: '3B. Instalaciones Hidrosanitarias / HVAC', subFront: 'hidro_rem', parallelGroup: 30, canStartEarly: false };
    }
    if (/plafon|pasta|yeso|aplanado|piso|porcelanato|loseta|lambrin|azulejo|recubrimiento/.test(full)) {
      return { stageOrder: 40, stageName: '4. Plafones, Pastas y Pisos', subFront: 'acabados_base', canStartEarly: false };
    }
    if (/carpinteria|puerta|closet|cocina|mueble fijo/.test(full)) {
      return { stageOrder: 50, stageName: '5A. Carpintería y Mobiliario', subFront: 'carp_rem', parallelGroup: 50, canStartEarly: false };
    }
    if (/canceleria|cristal|vidrio|aluminio|templado|herreria/.test(full)) {
      return { stageOrder: 50, stageName: '5B. Cancelería y Herrería', subFront: 'canc_rem', parallelGroup: 50, canStartEarly: false };
    }
    if (/pintura|luminaria|iluminacion|apagador|contacto|wc|inodoro|lavabo|accesorio|limpieza/.test(full)) {
      return { stageOrder: 60, stageName: '6. Pintura, Equipos y Limpieza Fina', subFront: 'cierre_rem', canStartEarly: false };
    }
  }

  // Perfil general Edificación / Residencial / Comercial (también respaldo universal para conceptos mixtos)
  if (/limpieza de terreno|desmonte|despalme|trazo|nivelacion|tapial|bodega provisional|demolicion previa|preliminar/.test(full) && !/limpieza final|limpieza fina|limpieza general de obra/.test(desc)) {
    return { stageOrder: 10, stageName: '1. Preliminares y Trazo', subFront: 'preliminares', canStartEarly: false };
  }
  if (/excavacion|cepa|afine de fondo|corte de terreno/.test(desc)) {
    return { stageOrder: 20, stageName: '2. Excavación en Cepas', subFront: 'excavacion', canStartEarly: false };
  }
  if (/drenaje subterraneo|albañal|registro sanitario|cisterna|fosa septica|bajo firme/.test(desc)) {
    return { stageOrder: 30, stageName: '3B. Drenaje Subterráneo y Registros', subFront: 'drenaje_sub', parallelGroup: 30, waitsForStage: 20, canStartEarly: false };
  }
  if (/plantilla|zapata|contratrabe|cadena de desplante|dala de desplante|mamposteria|pilote|losa de cimentacion|relleno compactado|cimentacion/.test(full)) {
    return { stageOrder: 30, stageName: '3A. Cimentación', subFront: 'cimentacion', parallelGroup: 30, canStartEarly: false };
  }
  if (/muro|tabique|block|castillo|columna|dala|cerramiento|enrase/.test(desc) && !/aplanado|pintura|azulejo|pasta/.test(desc)) {
    return { stageOrder: 40, stageName: '4. Estructura Vertical (Muros y Columnas)', subFront: 'estructura_vert', canStartEarly: false };
  }
  if (/losa|cimbra|vigueta|bovedilla|trabe|cubierta|losacero|pretil|escalera de concreto|estructura/.test(full) && !/impermeabil|firme|piso/.test(desc)) {
    return { stageOrder: 50, stageName: '5. Losas, Trabes y Cubiertas', subFront: 'losas', canStartEarly: false };
  }
  if ((/electric|poliducto|cableado|canalizacion|centro de carga|tablero|tierra fisica|voz y datos|cctv/.test(full)) && !/luminaria|lampara|reflector/.test(desc)) {
    return { stageOrder: 60, stageName: '6A. Instalación Eléctrica Oculta', subFront: 'inst_electrica', parallelGroup: 60, canStartEarly: false };
  }
  if ((/hidraulic|sanitari|cpvc|ppr|termofusion|cobre|ramaleo|bajada pluvial|tinaco|bomba/.test(full)) && !/wc|inodoro|lavabo|regadera|mezcladora|monomando/.test(desc)) {
    return { stageOrder: 60, stageName: '6B. Instalación Hidrosanitaria', subFront: 'inst_hidro', parallelGroup: 60, canStartEarly: false };
  }
  if (/gas|aire acondicionado|hvac|extraccion|especial|contra incendio/.test(full)) {
    return { stageOrder: 60, stageName: '6C. Instalaciones Especiales / Gas', subFront: 'inst_especial', parallelGroup: 60, canStartEarly: false };
  }
  if (/firme|aplanado|zarpeo|repello|afine|yeso|pasta|estuco|impermeabil|entortado|chaflan|boquilla|albañileria/.test(full)) {
    return { stageOrder: 70, stageName: '7. Albañilería, Aplanados e Impermeabilización', subFront: 'albanileria', canStartEarly: false };
  }
  if (/piso|loseta|porcelanato|ceramica|azulejo|lambrin|zoclo|marmol|granito|plafon|recubrimiento/.test(full)) {
    return { stageOrder: 80, stageName: '8. Pisos, Recubrimientos y Plafones', subFront: 'pisos_plafones', canStartEarly: false };
  }
  if (/carpinteria|puerta de madera|puerta tambor|closet|vestidor|cocina/.test(full)) {
    return { stageOrder: 90, stageName: '9A. Carpintería de Madera', subFront: 'carpinteria', parallelGroup: 90, canStartEarly: false };
  }
  if (/canceleria|ventana|aluminio|cristal|vidrio|domo|templado/.test(full)) {
    return { stageOrder: 90, stageName: '9B. Cancelería y Aluminio', subFront: 'canceleria', parallelGroup: 90, canStartEarly: false };
  }
  if (/herreria|barandal|porton|reja|proteccion metalica|escalera marina/.test(full)) {
    return { stageOrder: 90, stageName: '9C. Herrería', subFront: 'herreria', parallelGroup: 90, canStartEarly: false };
  }
  if (/pintura|vinilica|esmalte|sellador|wc|inodoro|lavabo|regadera|mezcladora|monomando|mueble de baño|luminaria|lampara|apagador|contacto|jardin|limpieza|entrega/.test(full)) {
    return { stageOrder: 100, stageName: '10. Pintura, Muebles, Equipos y Limpieza Final', subFront: 'acabados_finales', canStartEarly: false };
  }

  // Respaldo ordenado según posición de partida en el presupuesto
  const fallbackStage = 45 + Math.min(40, Math.floor(fallbackOrder * 2));
  return {
    stageOrder: fallbackStage,
    stageName: item.parentPartidaName ? `Etapa: ${item.parentPartidaName}` : `Actividad ${clave.toUpperCase()}`,
    subFront: `part_${normalizeText(item.parentId || 'gen')}`,
    canStartEarly: false
  };
}

// Estima días de ejecución realistas a partir de matriz APU (jornadas MO/Maq), cantidad, unidad e importe
export function estimateConceptDuration(item) {
  const cant = Math.max(0, Number(item.cantidad) || 0);
  const imp = Math.max(0, Number(item.importe) || 0);
  const unit = normalizeText(item.unidad);
  const desc = normalizeText(item.descripcion);

  // 1. Revisar si cuenta con Matriz APU con rendimientos reales de Mano de Obra o Maquinaria
  const insumos = Array.isArray(item.node?.insumos) ? item.node.insumos : [];
  if (insumos.length > 0 && cant > 0) {
    let totalJornadas = 0;
    insumos.forEach(ins => {
      const tipo = normalizeText(ins.tipo);
      const uIns = normalizeText(ins.unidad);
      const cIns = Math.max(0, Number(ins.cantidad) || 0);
      if ((tipo.includes('mano') || uIns === 'jor' || uIns === 'jornal') && cIns > 0 && cIns < 5) {
        totalJornadas += cant * cIns;
      } else if ((tipo.includes('maquinaria') || tipo.includes('equipo')) && (uIns === 'hr' || uIns === 'hora') && cIns > 0) {
        totalJornadas += (cant * cIns) / 8;
      }
    });
    if (totalJornadas > 0.5) {
      // Asumir entre 1 y 3 cuadrillas según magnitud de jornadas totales
      const crews = totalJornadas > 45 ? 3 : (totalJornadas > 18 ? 2 : 1);
      const estFromApu = Math.round(totalJornadas / crews);
      return Math.max(3, Math.min(30, estFromApu));
    }
  }

  // 2. Rendimientos típicos constructivos por unidad y especialidad
  let daysByQty = 0;
  if (cant > 0) {
    if (unit === 'm3') {
      const rate = /excavacion|corte|despalme|relleno|terraplen/.test(desc) ? 35 : 8; // m3/día
      daysByQty = Math.ceil(cant / rate);
    } else if (unit === 'm2') {
      let rate = 22;
      if (/trazo|limpieza|desmonte/.test(desc)) rate = 140;
      else if (/pintura|impermeabil/.test(desc)) rate = 45;
      else if (/muro|aplanado|piso|loseta|cimbra|losa/.test(desc)) rate = 16;
      daysByQty = Math.ceil(cant / rate);
    } else if (unit === 'ml' || unit === 'm') {
      const rate = /tuberia|cable|poliducto|pintura/.test(desc) ? 35 : 15;
      daysByQty = Math.ceil(cant / rate);
    } else if (unit === 'kg') {
      daysByQty = Math.ceil(cant / 320);
    } else if (unit === 'ton' || unit === 't') {
      daysByQty = Math.ceil(cant / 1.8);
    } else if (unit === 'sal' || unit === 'salida') {
      daysByQty = Math.ceil(cant / 4);
    } else if (unit === 'pza' || unit === 'pieza') {
      daysByQty = Math.ceil(cant / 5);
    } else if (unit === 'lote' || unit === 'jgo') {
      daysByQty = Math.max(3, Math.round(imp / 14000));
    }
  }

  const daysByImp = Math.max(3, Math.round(imp / 11000));
  let blended = daysByQty > 0 ? Math.round(daysByQty * 0.65 + daysByImp * 0.35) : daysByImp;

  // Ajuste por fraguado/curado en elementos estructurales de concreto
  if (/losa|zapata|concreto hidraulico|firme industrial|columna/.test(desc) && blended < 5) {
    blended = 5;
  }

  return Math.max(3, Math.min(30, blended || 4));
}

// Simula el cálculo CPM sobre una lista de tareas candidatas sin modificar state.treeData
export function simulateProposalCPM(candidateTasks, startDateStr = '2026-05-01', respectWorkdays = true) {
  const workdaysCfg = getWorkdaysSettings();
  const baseStartDt = getNextWorkingDate(startDateStr, workdaysCfg, respectWorkdays);
  const byId = new Map();
  candidateTasks.forEach(t => byId.set(String(t.id), t));

  // Sanitizar ciclos antes de simular
  const activeGraph = new Map();
  candidateTasks.forEach(t => activeGraph.set(String(t.id), []));
  function checkCycle(targetId, predId) {
    if (targetId === predId) return true;
    const vis = new Set();
    const st = [predId];
    while (st.length > 0) {
      const cur = st.pop();
      if (cur === targetId) return true;
      if (vis.has(cur)) continue;
      vis.add(cur);
      (activeGraph.get(cur) || []).forEach(p => st.push(p));
    }
    return false;
  }

  candidateTasks.forEach(t => {
    const tid = String(t.id);
    const safe = [];
    (t.predecessors || []).forEach(rawPid => {
      const pid = String(rawPid);
      if (byId.has(pid) && !safe.includes(pid) && !checkCycle(tid, pid)) {
        safe.push(pid);
        activeGraph.set(tid, [...safe]);
      }
    });
    t.predecessors = safe;
    t.durationDays = Math.max(3, parseInt(t.durationDays, 10) || 3);
  });

  // Forward pass
  const doneEarly = new Set();
  const guardEarly = new Set();
  function solveEarly(t) {
    const tid = String(t.id);
    if (doneEarly.has(tid) || guardEarly.has(tid)) return;
    guardEarly.add(tid);

    if (t.predecessors.length > 0) {
      let maxEnd = null;
      t.predecessors.forEach(pid => {
        const p = byId.get(pid);
        if (p) {
          solveEarly(p);
          const pe = parseDate(p.endDate);
          if (!maxEnd || pe > maxEnd) maxEnd = pe;
        }
      });
      const sDt = maxEnd ? getNextWorkingDate(addDays(maxEnd, 1), workdaysCfg, respectWorkdays) : baseStartDt;
      t.startDate = formatDate(sDt);
      t.endDate = formatDate(addDays(sDt, t.durationDays - 1));
    } else {
      t.startDate = formatDate(baseStartDt);
      t.endDate = formatDate(addDays(baseStartDt, t.durationDays - 1));
    }

    guardEarly.delete(tid);
    doneEarly.add(tid);
  }
  candidateTasks.forEach(t => solveEarly(t));

  // Backward pass
  let maxEndDt = baseStartDt;
  candidateTasks.forEach(t => {
    const e = parseDate(t.endDate);
    if (e > maxEndDt) maxEndDt = e;
  });

  const succMap = new Map();
  candidateTasks.forEach(t => succMap.set(String(t.id), []));
  candidateTasks.forEach(t => {
    t.predecessors.forEach(pid => {
      if (succMap.has(pid)) succMap.get(pid).push(t);
    });
  });

  const doneLate = new Set();
  const guardLate = new Set();
  function solveLate(t) {
    const tid = String(t.id);
    if (doneLate.has(tid) || guardLate.has(tid)) return;
    guardLate.add(tid);

    const succs = succMap.get(tid) || [];
    if (succs.length === 0) {
      const calDiff = diffDays(t.endDate, maxEndDt);
      t.slackDays = calDiff <= 0
        ? 0
        : Math.max(1, countWorkingDaysInclusive(addDays(t.endDate, 1), maxEndDt, workdaysCfg, respectWorkdays));
    } else {
      let minFloat = Infinity;
      succs.forEach(s => {
        solveLate(s);
        const gapStart = addDays(t.endDate, 1);
        const gapEnd = addDays(s.startDate, -1);
        const linkFloat = gapStart > gapEnd ? 0 : countWorkingDaysInclusive(gapStart, gapEnd, workdaysCfg, respectWorkdays);
        const cand = linkFloat + (s.slackDays || 0);
        if (cand < minFloat) minFloat = cand;
      });
      t.slackDays = Math.max(0, isFinite(minFloat) ? minFloat : 0);
    }
    t.isCritical = (t.slackDays === 0);
    guardLate.delete(tid);
    doneLate.add(tid);
  }
  candidateTasks.forEach(t => solveLate(t));

  const startStr = formatDate(baseStartDt);
  const endStr = formatDate(maxEndDt);
  const totalNaturalDays = Math.max(1, diffDays(baseStartDt, maxEndDt) + 1);
  const wdSummary = calculateWorkdaysSummary(baseStartDt, maxEndDt, workdaysCfg);
  const criticalCount = candidateTasks.filter(t => t.isCritical).length;

  return {
    tasks: candidateTasks,
    startDate: startStr,
    endDate: endStr,
    totalNaturalDays,
    workingDays: wdSummary.workingDays,
    criticalCount
  };
}

// Construye los enlaces constructivos lógicos (Frentes simultáneos o Serie)
function buildTasksForStrategy(concepts, workType, strategy = 'parallel', scaleFactor = 1) {
  const enriched = concepts.map((item, idx) => {
    const stageInfo = classifyConceptConstructiveStage(item, workType, idx);
    const baseDur = estimateConceptDuration(item);
    const scaledDur = Math.max(3, Math.min(45, Math.round(baseDur * scaleFactor)));
    return {
      id: String(item.id),
      clave: item.clave || `C-${idx + 1}`,
      descripcion: item.descripcion || '',
      parentPartidaName: item.parentPartidaName || '',
      unidad: item.unidad || '',
      cantidad: item.cantidad || 0,
      importe: item.importe || 0,
      stageOrder: stageInfo.stageOrder,
      stageName: stageInfo.stageName,
      subFront: stageInfo.subFront,
      waitsForStage: stageInfo.waitsForStage || null,
      waitsForStages: stageInfo.waitsForStages || null,
      canStartEarly: Boolean(stageInfo.canStartEarly),
      catalogIndex: idx,
      durationDays: scaledDur,
      predecessors: []
    };
  });

  // Orden constructivo lógico respetando orden de catálogo dentro de cada etapa
  const ordered = [...enriched].sort((a, b) => {
    if (a.stageOrder !== b.stageOrder) return a.stageOrder - b.stageOrder;
    return a.catalogIndex - b.catalogIndex;
  });

  if (strategy === 'serial') {
    for (let i = 1; i < ordered.length; i++) {
      ordered[i].predecessors = [ordered[i - 1].id];
    }
  } else {
    // Agrupar por stageOrder
    const stageNumbers = [...new Set(ordered.map(t => t.stageOrder))].sort((a, b) => a - b);
    const stageTasksMap = new Map();
    stageNumbers.forEach(sn => {
      stageTasksMap.set(sn, ordered.filter(t => t.stageOrder === sn));
    });

    // Para cada etapa obtener sus tareas "cierre de frente" (las últimas de cada subfrente en esa etapa)
    function getStageTerminalIds(sn) {
      const list = stageTasksMap.get(sn) || [];
      if (list.length === 0) return [];
      const lastBySubFront = new Map();
      list.forEach(t => {
        lastBySubFront.set(t.subFront, t.id);
      });
      const terminals = [...lastBySubFront.values()];
      // Limitar a máximo 3 predecesoras representativas para mantener diagrama limpio
      return terminals.slice(-3);
    }

    stageNumbers.forEach((sn, stageIdx) => {
      const tasksInStage = stageTasksMap.get(sn) || [];

      // Determinar predecesoras habilitadoras provenientes de etapas previas
      let enablingIds = [];
      const sample = tasksInStage[0];

      if (sample?.canStartEarly) {
        enablingIds = [];
      } else if (Array.isArray(sample?.waitsForStages) && sample.waitsForStages.length > 0) {
        sample.waitsForStages.forEach(targetSn => {
          const found = getStageTerminalIds(targetSn);
          found.forEach(fid => {
            if (!enablingIds.includes(fid)) enablingIds.push(fid);
          });
        });
        if (enablingIds.length === 0 && stageIdx > 0) {
          enablingIds = getStageTerminalIds(stageNumbers[stageIdx - 1]);
        }
      } else if (sample?.waitsForStage) {
        enablingIds = getStageTerminalIds(sample.waitsForStage);
        if (enablingIds.length === 0 && stageIdx > 0) {
          enablingIds = getStageTerminalIds(stageNumbers[stageIdx - 1]);
        }
      } else if (stageIdx > 0) {
        // Buscar la etapa previa inmediata que NO sea exclusivamente de taller aislado
        let prevIdx = stageIdx - 1;
        while (prevIdx > 0 && (stageTasksMap.get(stageNumbers[prevIdx]) || []).every(x => x.canStartEarly)) {
          prevIdx--;
        }
        enablingIds = getStageTerminalIds(stageNumbers[prevIdx]);
      }

      // Dentro de la etapa: subfrentes distintos corren en paralelo; conceptos del mismo subfrente se encadenan
      const subFrontGroups = new Map();
      tasksInStage.forEach(t => {
        if (!subFrontGroups.has(t.subFront)) subFrontGroups.set(t.subFront, []);
        subFrontGroups.get(t.subFront).push(t);
      });

      subFrontGroups.forEach(frontList => {
        frontList.forEach((task, idxInFront) => {
          if (idxInFront === 0) {
            task.predecessors = [...enablingIds];
          } else {
            task.predecessors = [frontList[idxInFront - 1].id];
          }
        });
      });
    });
  }

  // Devolver en el mismo orden original del catálogo para visualización natural en la tabla
  const byId = new Map();
  ordered.forEach(t => byId.set(t.id, t));
  return enriched.map(orig => byId.get(orig.id));
}

// Genera instantáneamente la propuesta experta local basada en el Proceso Constructivo del Tipo de Obra
export function generateLocalConstructiveProposal(options = {}) {
  const cfg = getScheduleSettings();
  const workType = WORK_TYPE_PROFILES[options.workType] ? options.workType : detectProjectWorkType();
  const profile = WORK_TYPE_PROFILES[workType] || WORK_TYPE_PROFILES.edificacion;
  const strategy = options.strategy === 'serial' ? 'serial' : 'parallel';
  const respectWorkdays = options.respectWorkdays !== undefined
    ? Boolean(options.respectWorkdays)
    : (cfg.respectWorkdays !== false);
  const startDateStr = options.startDate || cfg.startDate || '2026-05-01';
  const targetDays = parseInt(options.targetDays, 10) || 0;

  const allItems = extractScheduleItems(state.treeData);
  const concepts = allItems.filter(it => it.tipo === 'concepto');

  if (concepts.length === 0) {
    return {
      ok: false,
      error: 'No hay conceptos en el Catálogo Base para programar.',
      tasks: []
    };
  }

  // Primera pasada base
  let mainTasks = buildTasksForStrategy(concepts, workType, strategy, 1);
  let simMain = simulateProposalCPM(mainTasks, startDateStr, respectWorkdays);

  // Si el usuario indicó un plazo meta opcional (ej. 90 días), escalar duraciones proporcionalmente
  if (targetDays >= 10 && simMain.totalNaturalDays > 0) {
    const ratio = Math.max(0.35, Math.min(3.0, targetDays / simMain.totalNaturalDays));
    mainTasks = buildTasksForStrategy(concepts, workType, strategy, ratio);
    simMain = simulateProposalCPM(mainTasks, startDateStr, respectWorkdays);
  }

  // Comparar contra estrategia en serie para reportar días ahorrados
  const serialTasks = buildTasksForStrategy(concepts, workType, 'serial', 1);
  const simSerial = simulateProposalCPM(serialTasks, startDateStr, respectWorkdays);
  const savingsDays = strategy === 'parallel'
    ? Math.max(0, simSerial.totalNaturalDays - simMain.totalNaturalDays)
    : 0;

  return {
    ok: true,
    source: 'local_expert',
    modelUsed: 'Motor Experto de Ingeniería Constructiva',
    workType,
    workTypeLabel: profile.label,
    strategy,
    respectWorkdays,
    reasoning: strategy === 'parallel' ? profile.reasoningParallel : profile.reasoningSerial,
    startDate: simMain.startDate,
    endDate: simMain.endDate,
    totalNaturalDays: simMain.totalNaturalDays,
    workingDays: simMain.workingDays,
    criticalCount: simMain.criticalCount,
    savingsDays,
    tasks: simMain.tasks
  };
}

// Genera una propuesta avanzada consultando Gemini IA en tiempo real (con respaldo seguro al motor experto)
export async function generateGeminiConstructiveProposal(options = {}) {
  const apiKey = String(options.apiKey || state.settings?.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('Ingresa tu API Key de Google Gemini o utiliza la Propuesta Instantánea integrada.');
  }

  // Guardar API Key en ajustes si el usuario la capturó en el modal
  if (state.settings && state.settings.apiKey !== apiKey) {
    state.settings.apiKey = apiKey;
    persistSettings();
  }

  const localBase = generateLocalConstructiveProposal(options);
  if (!localBase.ok) return localBase;

  const workType = localBase.workType;
  const profile = WORK_TYPE_PROFILES[workType] || WORK_TYPE_PROFILES.edificacion;
  const strategy = localBase.strategy;
  const targetDays = parseInt(options.targetDays, 10) || 0;

  const compactCatalog = localBase.tasks.map(t => ({
    id: t.id,
    clave: t.clave,
    partida: t.parentPartidaName,
    descripcion: t.descripcion.slice(0, 110),
    unidad: t.unidad,
    cantidad: t.cantidad,
    importe: Math.round(t.importe || 0),
    etapaSugerida: t.stageName,
    duracionBase: t.durationDays
  }));

  const promptText = `Eres un Ingeniero Civil Director de Planeación y Control de Obra en México experto en Ruta Crítica (CPM) y procesos constructivos reales.

Analiza el siguiente catálogo de conceptos y genera una programación de obra lógica Fin-a-Inicio (Finish-to-Start):
- Giro / Tipo de Obra: "${profile.shortLabel}" (${profile.label})
- Estrategia solicitada: "${strategy === 'parallel' ? 'Optimizada con frentes simultáneos reales donde el proceso constructivo lo permita' : 'Secuencial conservadora con una sola cuadrilla'}"
${targetDays >= 10 ? `- Plazo objetivo aproximado deseado por el cliente: ~${targetDays} días naturales.` : ''}

Catálogo de conceptos del proyecto (JSON):
${JSON.stringify(compactCatalog)}

Reglas obligatorias:
1. Respeta estrictamente el proceso constructivo real de "${profile.shortLabel}" (por ejemplo: trazo antes de excavación, cimentación antes de estructura, instalaciones ocultas antes de cerrar acabados/pintura, redes subterráneas antes de pavimentar, etc.).
2. Cada tarea debe usar exactamente el mismo "id" recibido en el JSON.
3. "durationDays" debe ser un número entero realista mayor o igual a 3.
4. "predecessors" debe ser un arreglo de "id" de conceptos que DEBEN TERMINAR antes de poder iniciar ese concepto. PROHIBIDO crear ciclos o auto-referencias.
5. Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
\`\`\`json
{
  "reasoning": "Explicación ejecutiva breve en español (2 a 4 oraciones) del criterio constructivo y ruta crítica propuestos para esta obra...",
  "tasks": [
    { "id": "...", "durationDays": 5, "stageName": "Etapa constructiva", "predecessors": [] }
  ]
}
\`\`\``;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastError = 'No fue posible conectar con Gemini.';

  for (const modelName of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.2 }
          })
        }
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson.error?.message || `HTTP ${response.status} en ${modelName}`;
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
      const parsed = extractJsonFromAiResponse(rawText);

      if (!parsed || !Array.isArray(parsed.tasks)) {
        lastError = 'Formato JSON de programación incompleto.';
        continue;
      }

      const aiMap = new Map();
      parsed.tasks.forEach(pt => {
        if (pt && pt.id !== undefined) aiMap.set(String(pt.id), pt);
      });

      const mergedTasks = localBase.tasks.map(baseTask => {
        const aiTask = aiMap.get(String(baseTask.id));
        if (!aiTask) return baseTask;
        return Object.assign({}, baseTask, {
          durationDays: Math.max(3, Math.min(90, parseInt(aiTask.durationDays, 10) || baseTask.durationDays)),
          stageName: aiTask.stageName || baseTask.stageName,
          predecessors: Array.isArray(aiTask.predecessors)
            ? aiTask.predecessors.map(String)
            : baseTask.predecessors
        });
      });

      const simAi = simulateProposalCPM(mergedTasks, localBase.startDate, localBase.respectWorkdays);

      return Object.assign({}, localBase, {
        source: 'gemini_ai',
        modelUsed: `Google Gemini (${modelName})`,
        reasoning: parsed.reasoning || localBase.reasoning,
        startDate: simAi.startDate,
        endDate: simAi.endDate,
        totalNaturalDays: simAi.totalNaturalDays,
        workingDays: simAi.workingDays,
        criticalCount: simAi.criticalCount,
        tasks: simAi.tasks
      });
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }

  throw new Error(lastError);
}
