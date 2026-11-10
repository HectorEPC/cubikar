// js/modules/ai/localMatrixEngine.js
// Motor puro (sin DOM ni IndexedDB) para generar matrices APU con los catálogos locales.
//
// PASO 1: Buscar un concepto similar (mismo elemento, misma unidad, mismas especificaciones
//         técnicas y mismos componentes) que ya tenga matriz real y copiarla.
// PASO 2: Si no existe, interpretar la descripción del concepto (elemento, dimensiones, f'c,
//         armados, diámetros, calibres, proporciones, piezas incluidas...) y armar la matriz
//         desde cero con insumos reales de los catálogos cargados (con conversión de unidades).

const r5 = (v) => Math.round(((Number(v) || 0) + 1e-12) * 100000) / 100000;
const r2 = (v) => Math.round(((Number(v) || 0) + 1e-12) * 100) / 100;

// =============================================================================
// NORMALIZACIÓN DE TEXTO Y UNIDADES
// =============================================================================
export function norm(s) {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t = t.replace(/[“”″]/g, '"').replace(/[´`’‘]/g, "'");
  t = t.replace(/f\s*'?\s*c\s*=?\s*(\d{3})/g, 'fc$1');            // f'c = 200 -> fc200
  for (let i = 0; i < 2; i++) t = t.replace(/(\d)\s*x\s*(\d)/g, '$1x$2'); // 15 x 20 -> 15x20
  t = t.replace(/(\d)\s+(mm|cm|kg|kgs|lts?)\b/g, '$1$2');          // 13 mm -> 13mm
  return t.replace(/\s+/g, ' ').trim();
}

const STOP = new Set(('de la el en para con y a los las por un una del al se su sus o u e que como cada ' +
  'incluye incluyendo incluir suministro colocacion instalacion fabricacion elaboracion obra herramienta ' +
  'equipo material materiales necesarios necesario hasta desde sobre todo toda todos todas segun marca ' +
  'modelo acabado comun limpieza acarreo acarreos estacion distancia horizontal metros altura cualquier ' +
  'pruebas prueba p.u.o.t. puot medidas proyecto especificaciones correcta correcto ejecucion trabajos ' +
  'nivel niveles max maximo minimo area zona utilizando base hecho mismo misma').split(' '));

export function tokens(s) {
  return norm(s)
    .split(/[^a-z0-9/.#x-]+/)
    .map(w => w.replace(/^[.\-/]+|[.\-/]+$/g, '').replace(/(\d+)\.0+$/, '$1'))
    .filter(w => w && (w.length >= 2 || /\d/.test(w)) && !STOP.has(w));
}

export function normUnit(u) {
  const x = norm(u).replace(/[.\s]/g, '');
  if (['m', 'ml', 'mts', 'mt', 'metro', 'metros', 'mlineal'].includes(x)) return 'm';
  if (['m2', 'm²', 'mt2', 'metro2'].includes(x)) return 'm2';
  if (['m3', 'm³', 'mt3'].includes(x)) return 'm3';
  if (['pza', 'pieza', 'piezas', 'pz', 'pzas', 'pzs', 'unidad', 'u', 'und', 'ud'].includes(x)) return 'pza';
  if (['sal', 'salida', 'salidas'].includes(x)) return 'sal';
  if (['jor', 'jornada', 'jr', 'jornal'].includes(x)) return 'jor';
  if (['hr', 'hora', 'hrs', 'h', 'horas'].includes(x)) return 'hr';
  if (['kg', 'kgs', 'kilo', 'kilogramo'].includes(x)) return 'kg';
  if (['ton', 't', 'tonelada', 'tons'].includes(x)) return 'ton';
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(x)) return 'l';
  if (['jgo', 'juego', 'jg'].includes(x)) return 'jgo';
  if (['lote', 'lot', 'lte'].includes(x)) return 'lote';
  return x;
}

const DISPLAY_UNIT = { l: 'lt', jor: 'jor', hr: 'hr', m: 'm', m2: 'm2', m3: 'm3', kg: 'kg', pza: 'pza', pt: 'pt', jgo: 'jgo', ton: 'ton' };

function numIn(text, re) {
  const m = String(text || '').match(re);
  return m ? parseFloat(m[1]) : 0;
}

/**
 * Convierte el precio de un insumo de catálogo (en su unidad comercial) a la unidad de consumo requerida.
 * Ej.: varilla $/Ton -> $/kg; block $/millar -> $/pza; pintura $/cubeta 19 L -> $/L; tubo $/tramo 6 m -> $/m.
 * Devuelve null si no se puede convertir con certeza.
 */
export function convertPrice(price, fromUnitRaw, toUnit, descRaw) {
  const from = normUnit(fromUnitRaw);
  const fx = norm(fromUnitRaw).replace(/\s/g, '');
  const d = norm(descRaw);
  if (from === toUnit) return price;

  switch (toUnit) {
    case 'kg': {
      if (from === 'ton') return price / 1000;
      if (from === 'gr' || from === 'g') return price * 1000;
      const kg = numIn(fx, /(\d+(?:\.\d+)?)k/) || numIn(d, /(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?)\b/);
      if (kg > 0 && /saco|bulto|cub|pza|bolsa|caja|bote|paquete|cubeta/.test(fx)) return price / kg;
      return null;
    }
    case 'ton':
      return from === 'kg' ? price * 1000 : null;
    case 'l': {
      let n = numIn(fx, /\/(\d+(?:\.\d+)?)l/);
      if (n) return price / n;
      if (from === 'gal' || fx === 'galon') return price / 3.785;
      n = numIn(d, /(\d+(?:\.\d+)?)\s*(?:l|lt|lts|litros)\b/);
      if (/tambo/.test(fx)) return price / (n || 200);
      if (n > 0 && /cub|bote|pza|cubeta|garrafa|lata|caja|galon/.test(fx)) return price / n;
      if (/cub/.test(fx)) return price / 19;
      return null;
    }
    case 'm': {
      let n = numIn(fx, /\/(\d+(?:\.\d+)?)m/);
      if (n && /tmo|tramo/.test(fx)) return price / n;
      if (/^tmo|tramo/.test(fx)) {
        n = numIn(d, /tramos?\s*(?:de\s*)?(\d+(?:\.\d+)?)\s*(?:m|mts|metros)\b/) || 6;
        return price / n;
      }
      if (/rollo|carrete|bobina/.test(fx)) {
        n = numIn(d, /(\d+(?:\.\d+)?)\s*(?:m|mts|metros)\b/);
        if (n > 0) return price / n;
      }
      return null;
    }
    case 'pza': {
      if (fx === 'mill' || fx === 'millar') return price / 1000;
      if (fx === 'ciento') return price / 100;
      const n = numIn(fx, /caj\/(\d+)/);
      if (n) return price / n;
      if (from === 'jgo') return price;
      return null;
    }
    case 'jgo':
      return from === 'pza' ? price : null;
    case 'm2': {
      if (/rollo|hoja|pza/.test(fx)) {
        const m = d.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s*(m|mts|cm)?\b/);
        if (m) {
          let a = parseFloat(m[1]);
          let b = parseFloat(m[2]);
          if (m[3] === 'cm' || (a > 10 && b > 10)) { a /= 100; b /= 100; }
          const area = a * b;
          if (area > 0.2 && area < 500) return price / area;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

// =============================================================================
// ÍNDICE DE INSUMOS (Materiales, Mano de Obra, Equipo) DE LOS CATÁLOGOS CARGADOS
// =============================================================================
function normTipo(t) {
  const x = norm(t);
  if (x.startsWith('mat') || x === 'insumo' || x.startsWith('basico')) return 'Material';
  if (x.includes('obra') || x.includes('cuadrilla') || x === 'mo') return 'Mano de Obra';
  if (x.startsWith('maq')) return 'Maquinaria';
  if (x.startsWith('herr')) return 'Herramienta';
  if (x.startsWith('equipo')) return 'Equipo';
  return null;
}

export function buildSupplyIndex(items) {
  const byTipo = { 'Material': [], 'Mano de Obra': [], 'Equipo': [], 'Maquinaria': [], 'Herramienta': [] };
  const seen = new Set();
  let count = 0;
  for (const it of items || []) {
    const tipo = normTipo(it.tipo);
    if (!tipo) continue;
    const unit = normUnit(it.unidad);
    // Las cuadrillas reales se cotizan por jornada; descarta conceptos mal tipificados como "Mano de Obra"
    if (tipo === 'Mano de Obra' && unit !== 'jor') continue;
    // Valores de adquisición de maquinaria (no son costos horarios)
    if (/-va$/i.test(String(it.clave || ''))) continue;
    const price = Number(it.precioUnitario) > 0 ? Number(it.precioUnitario) : (Number(it.costoUnitario) || 0);
    if (!(price > 0)) continue;
    const text = norm(it.descripcion);
    const key = `${tipo}|${it.clave || ''}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byTipo[tipo].push({
      tipo, unit, price, text,
      clave: String(it.clave || ''),
      descripcion: String(it.descripcion || '').trim(),
      unidad: it.unidad,
      catalogName: it.catalogName || ''
    });
    count++;
  }
  return { byTipo, count };
}

const termCache = new Map();
function hasTerm(text, alt) {
  if (!alt) return true;
  if (alt.length <= 3 || /[\d/"#]/.test(alt)) {
    let re = termCache.get(alt);
    if (!re) {
      const esc = alt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`);
      termCache.set(alt, re);
    }
    return re.test(text);
  }
  return text.includes(alt);
}
const anyOf = (text, group) => String(group).split('|').some(a => hasTerm(text, a.trim()));

/**
 * Busca el insumo más adecuado. spec: { tipo|tipos, all:[grupos obligatorios "a|b"], any:[grupos preferentes],
 * none:[grupos excluidos], unit:'kg', range:[min,max] precio unitario razonable }
 */
export function findSupply(index, spec) {
  const tipos = spec.tipos || [spec.tipo];
  const all = (spec.all || []).filter(Boolean);
  if (all.length === 0) return null;
  let best = null;
  for (const tipo of tipos) {
    for (const s of index.byTipo[tipo] || []) {
      if (!all.every(g => anyOf(s.text, g))) continue;
      if (spec.none && spec.none.some(g => anyOf(s.text, g))) continue;
      const unitPrice = convertPrice(s.price, s.unidad, spec.unit, s.descripcion);
      if (unitPrice == null || !(unitPrice > 0)) continue;
      let score = 100;
      (spec.any || []).forEach(g => { if (g && anyOf(s.text, g)) score += 12; });
      if (s.unit === spec.unit) score += 6;
      score -= Math.min(30, s.text.length / 12);
      if (spec.range && (unitPrice < spec.range[0] || unitPrice > spec.range[1])) score -= 80;
      if (!best || score > best.score) best = { s, score, unitPrice };
    }
  }
  return best;
}

// =============================================================================
// EXTRACCIÓN DE ESPECIFICACIONES TÉCNICAS DE LA DESCRIPCIÓN
// =============================================================================
const WORDNUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, ocho: 8 };
function wordsToNums(d) {
  return d.replace(/\b(un|una|uno|dos|tres|cuatro|cinco|seis|ocho)\s+(varillas?|manos?|caras?)/g, (m, w, n) => `${WORDNUM[w]} ${n}`);
}

const BAR = {
  '2': { kg: 0.249, frac: '1/4' }, '2.5': { kg: 0.384, frac: '5/16' }, '3': { kg: 0.557, frac: '3/8' },
  '4': { kg: 0.996, frac: '1/2' }, '5': { kg: 1.56, frac: '5/8' }, '6': { kg: 2.235, frac: '3/4' }, '8': { kg: 3.973, frac: '1' }
};
const FRAC2NO = { '1/4': '2', '5/16': '2.5', '3/8': '3', '1/2': '4', '5/8': '5', '3/4': '6', '1': '8' };
const toNo = (x) => (String(x).includes('/') ? (FRAC2NO[x] || '3') : String(x));

export function parseSteel(dIn) {
  const d = wordsToNums(dIn);
  const res = { long: null, stir: null, grid: null, armex: null };
  let m = d.match(/(\d+)\s*v\s*#?\s*(\d(?:\.\d)?)\b/);                       // 4V3
  if (m) res.long = { n: +m[1], no: m[2] };
  if (!res.long) {
    m = d.match(/(\d+)\s*varillas?\s*(?:corrugadas?\s*)?(?:de|del)?\s*(?:no\.?\s*|#)?(\d\/\d+|\d(?:\.\d)?)"?/);
    if (m) res.long = { n: +m[1], no: toNo(m[2]) };
  }
  m = d.match(/estribos?\s*(?:de|del)?\s*(?:no\.?\s*|#)?(\d\/\d+|\d(?:\.\d)?)"?[^@]{0,25}?(?:a\s*cada|@)\s*(\d+)/) ||
      d.match(/(?:^|[^a-z])e\s*#?\s*(\d(?:\.\d)?)\s*@\s*(\d+)/);
  if (m) res.stir = { no: toNo(m[1]), sep: +m[2] };
  m = d.match(/varillas?\s*(?:corrugadas?\s*)?(?:de|del)?\s*(?:no\.?\s*|#)?(\d\/\d+|\d(?:\.\d)?)"?\s*(?:de diametro\s*)?(?:a\s*cada|@)\s*(\d+)/);
  if (m) res.grid = { no: toNo(m[1]), sep: +m[2], both: /ambos sentidos|dos sentidos|ambas direcciones/.test(d) };
  m = d.match(/armex\s*(?:en hoja\s*)?(\d+x\d+)?/);
  if (m) res.armex = m[1] || '15x20';
  if (!res.long && !res.grid) {
    m = d.match(/varillas?\s*(?:corrugadas?\s*)?(?:de|del)\s*(?:no\.?\s*|#)?(\d\/\d+|\d(?:\.\d)?)"?/);
    if (m) res.long = { n: 0, no: toNo(m[1]) };
  }
  return res;
}

export function parseSection(d) {
  const re = /(\d{1,3}(?:\.\d+)?)x(\d{1,3}(?:\.\d+)?)(?:x(\d{1,3}(?:\.\d+)?))?(?:\s*(cm|mm|m)\b)?/g;
  let m;
  while ((m = re.exec(d))) {
    const before = d.slice(Math.max(0, m.index - 10), m.index);
    if (/malla|armex|-\s*$/.test(before)) continue;
    let nums = [m[1], m[2], m[3]].filter(Boolean).map(Number);
    if (m[4] === 'mm') nums = nums.map(n => n / 10);
    if (m[4] === 'm' || nums.every(n => n < 5)) nums = nums.map(n => n * 100);
    if (nums.every(n => n >= 5 && n <= 400)) return nums;
  }
  return null;
}

export function parseThickness(d) {
  let m = d.match(/(?:espesor|esp\.?|e\s*=)\s*(?:de\s*)?(\d+(?:\.\d+)?)\s*(cm|mm|m)?\b/) ||
          d.match(/(\d+(?:\.\d+)?)\s*(cm|mm)\.?\s*(?:de\s*)?espesor/);
  if (!m) m = d.match(/(?:de|con)\s*(\d+(?:\.\d+)?)\s*(cm)\b/);
  if (!m) m = d.match(/(\d+(?:\.\d+)?)(cm)\b/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const un = m[2] || 'cm';
  if (un === 'mm') v /= 10;
  if (un === 'm') v *= 100;
  return v > 0 && v <= 200 ? v : null;
}

const DIAMS = [
  [13, '1/2', ['13mm', '12mm', '12.7mm', '1/2"']], [19, '3/4', ['19mm', '20mm', '3/4"']], [25, '1', ['25mm', '1"']],
  [32, '1 1/4', ['32mm', '1 1/4"']], [38, '1 1/2', ['38mm', '40mm', '1 1/2"']], [50, '2', ['50mm', '51mm', '2"']],
  [64, '2 1/2', ['64mm', '63mm', '2 1/2"']], [75, '3', ['75mm', '76mm', '3"']], [100, '4', ['100mm', '102mm', '110mm', '4"']],
  [150, '6', ['150mm', '152mm', '160mm', '6"']], [200, '8', ['200mm', '8"']]
];
export function parseDiam(d) {
  let m = d.match(/(\d{2,3})mm/);
  if (m) {
    const v = +m[1];
    let best = null;
    DIAMS.forEach(x => { if (Math.abs(x[0] - v) / x[0] <= 0.15 && (!best || Math.abs(x[0] - v) < Math.abs(best[0] - v))) best = x; });
    if (best) return best[0];
  }
  m = d.match(/(?:^|[^\d/])(\d\s)?(\d\/\d)\s*(?:"|pulg|in\b)/);
  if (m) {
    const s = m[1] ? `${m[1].trim()} ${m[2]}` : m[2];
    const f = DIAMS.find(x => x[1] === s);
    if (f) return f[0];
  }
  m = d.match(/(?:^|[^\d/.])(\d)\s*"/);
  if (m) {
    const f = DIAMS.find(x => x[1] === m[1]);
    if (f) return f[0];
  }
  return null;
}
const diamAlts = (mm) => (DIAMS.find(x => x[0] === mm) || [0, '', [`${mm}mm`]])[2].join('|');
const diamInch = (mm) => (DIAMS.find(x => x[0] === mm) || [0, ''])[1];

export function pipeMaterial(d) {
  if (/pe-al-pe|multicapa/.test(d)) return 'multicapa';
  if (/cpvc/.test(d)) return 'cpvc';
  if (/tuboplus|polipropileno|\bppr\b/.test(d)) return 'ppr';
  if (/cobre/.test(d)) return 'cobre';
  if (/galvaniz|fo\.?\s*go\b|fierro galv/.test(d)) return 'galv';
  if (/pead|polietileno de alta/.test(d)) return 'pead';
  if (/\bpvc\b/.test(d)) return /sanit|drenaje|desague|ventila/.test(d) ? 'pvc-s' : 'pvc-h';
  if (/acero al carbon|acero negro|cedula 40|ced\.? 40/.test(d)) return 'acero';
  return null;
}

function parseCalibre(d) {
  const m = d.match(/cal(?:ibre)?\.?\s*(?:no\.?\s*)?(\d{1,2})\b/) || d.match(/\b(\d{1,2})\s*awg/);
  return m ? +m[1] : null;
}

function parseProportion(d) {
  const m = d.match(/\b1\s*:\s*(\d)(?:\s*:\s*(\d))?\b/);
  if (!m) return null;
  return m[2] ? `1:${m[1]}:${m[2]}` : `1:${m[1]}`;
}

export function extractSpecs(d, famId) {
  const s = {};
  const fc = d.match(/fc(\d{3})/);
  if (fc) s.fc = +fc[1];
  if (!['pipe', 'fitting', 'conduit', 'cable', 'salida_hid', 'salida_ele'].includes(famId)) {
    const sec = parseSection(d);
    if (sec) s.section = sec.slice().sort((a, b) => a - b).join('x');
  }
  if (['area_concrete', 'plaster', 'tablaroca'].includes(famId)) {
    const t = parseThickness(d);
    if (t) s.thickness = t;
  }
  if (['pipe', 'fitting', 'salida_hid', 'conduit', 'salida_ele'].includes(famId)) {
    const dm = parseDiam(d);
    if (dm) s.diam = dm;
    const pm = pipeMaterial(d);
    if (pm) s.pipeMat = pm;
  }
  if (['cable', 'salida_ele'].includes(famId)) {
    const c = parseCalibre(d);
    if (c) s.calibre = c;
  }
  if (['linear_concrete', 'area_concrete', 'vol_concrete', 'acero'].includes(famId)) {
    const st = parseSteel(d);
    if (st.long) s.barNo = st.long.no;
    else if (st.grid) s.barNo = st.grid.no;
    if (st.armex) s.armex = st.armex;
  }
  if (['masonry', 'plaster', 'stone_masonry'].includes(famId)) {
    const p = parseProportion(d);
    if (p) s.prop = p;
  }
  return s;
}

// Componentes físicos relevantes que deben coincidir entre conceptos similares
function featureSet(d) {
  const f = new Set();
  const st = parseSteel(d);
  if (st.long || st.grid || st.stir || /varilla|acero de refuerzo/.test(d)) f.add('varilla');
  if (st.armex) f.add('armex');
  [['malla', /malla/], ['cimbra', /cimbra/], ['pulido', /pulido|escobillado/], ['membrana', /membrana/],
   ['marco', /\bmarco/], ['chapa', /chapa|cerradura/], ['vidrio', /vidrio|cristal/], ['tapa', /\btapa\b/],
   ['caliente', /agua caliente/], ['mano', /\ba mano\b|\bmanual\b/],
   ['maquina', /\bmaquina\b|\bmecanic|\bretroexcavadora\b|\btractor\b/]].forEach(([k, re]) => { if (re.test(d)) f.add(k); });
  return f;
}

// =============================================================================
// CONSTRUCTORES DE COMPONENTES
// =============================================================================
const M = (name, qty, unit, all, o = {}) => ({ tipo: 'Material', name, qty, unit, all, any: o.any, none: o.none, fb: o.fb || 0, range: o.range });
const E = (name, qty, unit, all, o = {}) => ({ tipo: 'Equipo', tipos: ['Equipo', 'Maquinaria', 'Herramienta'], name, qty, unit, all, any: o.any, none: o.none, fb: o.fb || 0, range: o.range });
const L = (trade, qty) => ({ tipo: 'Mano de Obra', trade, qty, unit: 'jor' });
const ALT = (primary, fallback) => ({ kind: 'alt', primary, fallback });

const TRADES = {
  albanil: { all: ['cuadrilla', 'albanil'], none: ['mantenimiento', '2 ayudantes', '3 ayudantes'], fb: 1480.07, label: 'Cuadrilla de albañiles (albañil + ayudante + cabo)' },
  albanil2: { all: ['cuadrilla', 'albanil'], any: ['2 ayudantes'], none: ['mantenimiento'], fb: 2028.69, label: 'Cuadrilla de albañiles (albañil + 2 ayudantes + cabo)' },
  peon: { all: ['cuadrilla', 'peon'], none: ['mantenimiento'], fb: 1510.75, label: 'Cuadrilla de peones' },
  fierrero: { all: ['cuadrilla', 'fierrero'], none: ['mantenimiento'], fb: 1126.57, label: 'Cuadrilla de fierreros (fierrero + ayudante + cabo)' },
  carpintero: { all: ['cuadrilla', 'carpintero'], none: ['mantenimiento'], fb: 1250.0, label: 'Cuadrilla de carpinteros (carpintero + ayudante)' },
  plomero: { all: ['cuadrilla', 'plomero'], none: ['mantenimiento', '2 ayudantes'], fb: 1170.84, label: 'Cuadrilla de plomeros (plomero + ayudante + cabo)' },
  electricista: { all: ['cuadrilla', 'electricista'], any: ['baja tension'], none: ['mantenimiento', 'alta tension', 'ingeniero'], fb: 1174.83, label: 'Cuadrilla de electricistas en baja tensión' },
  pintor: { all: ['cuadrilla', 'pintor'], none: ['industrial', 'mantenimiento'], fb: 1089.37, label: 'Cuadrilla de pintores (pintor + ayudante + cabo)' },
  colocador: { all: ['cuadrilla', 'colocador|azulejero'], none: ['mantenimiento'], fb: 1170.84, label: 'Cuadrilla de colocadores (colocador + ayudante + cabo)' },
  yesero: { all: ['cuadrilla', 'yesero'], none: ['mantenimiento'], fb: 1150.0, label: 'Cuadrilla de yeseros (yesero + ayudante)' },
  tablaroquero: { all: ['cuadrilla', 'tablaroquero|tablarroquero|panelero|tablaroca'], fb: 1250.0, label: 'Cuadrilla de tablaroqueros (oficial + ayudante)' },
  impermeabilizador: { all: ['cuadrilla', 'impermeabiliz'], fb: 1150.0, label: 'Cuadrilla de impermeabilizadores (oficial + ayudante)' },
  herrero: { all: ['cuadrilla', 'herrero|soldador'], none: ['mantenimiento'], fb: 1350.0, label: 'Cuadrilla de herreros (herrero + ayudante)' },
  aluminero: { all: ['cuadrilla', 'aluminero|cancelero|vidriero'], fb: 1250.0, label: 'Cuadrilla de alumineros (oficial + ayudante)' },
  topografo: { all: ['cuadrilla|brigada', 'topograf'], fb: 2400.0, label: 'Brigada de topografía (topógrafo + cadenero)' }
};

// Básicos
const DUELA_NONE = ['bari', 'tablero', 'acero', 'encino', 'parquet', 'cedro', 'caoba', 'laminad'];
const cement = (kg) => M('Cemento gris CPC 30R', kg, 'kg', ['cemento'], { any: ['cpc|portland'], none: ['pvc', 'blanco', 'cola', 'plastic', 'fibrocemento', 'asfalt', 'contacto', 'adhesivo', 'cementoso', 'impermeab', 'mortero', 'cementop', 'grout', 'cpvc'], fb: 3.0, range: [1.5, 8] });
const sand = (m3) => M('Arena de mina', m3, 'm3', ['arena'], { any: ['mina|cernida'], none: ['silica', 'silice', 'sand', 'concreto', 'mortero', 'amortiguador', 'andesita', 'boquilla', 'color', 'blast', 'pintura'], fb: 250, range: [80, 900] });
const gravel = (m3) => M('Grava de 3/4"', m3, 'm3', ['grava'], { any: ['3/4'], none: ['gravalock', 'tezontle', 'pavimento', 'sistema'], fb: 250, range: [80, 900] });
const water = (m3) => M('Agua', m3, 'm3', ['agua'], { none: ['tratamiento', 'helada', 'caliente', 'bomba', 'tinaco', 'calentador', 'tanque', 'purific', 'tuberia', 'tubo', 'valvula', 'filtro', 'residual', 'pozo', 'toma', 'medidor', 'enfriador', 'unidad', 'coil', 'fan', 'base agua', 'calidad'], fb: 160, range: [15, 400] });
const calhidra = (kg) => M('Cal hidratada (calhidra)', kg, 'kg', ['calhidra|cal hidratada'], { fb: 2.9, range: [1, 10] });
const alambre = (kg) => M('Alambre recocido cal. 18', kg, 'kg', ['alambre recocido'], { any: ['18'], fb: 31, range: [6, 70] });

function rebar(kg, no) {
  const b = BAR[no] || BAR['3'];
  return M(`Varilla corrugada fy=4200 kg/cm2 No. ${no} (${b.frac}")`, kg, 'kg', ['varilla'], {
    any: [`${b.frac}"|${b.frac} `, `no. ${no}|no ${no}|#${no}|no.${no}`, 'corrugad'],
    none: ['roscada', 'fibra', 'vidrio', 'anclaje', 'soldable', 'tierra', 'cobre', 'copperweld', 'plastic'],
    fb: 22, range: [10, 45]
  });
}

const FC_CEMENT = { 100: 265, 150: 300, 200: 350, 250: 400, 300: 450, 350: 500 };
function concrete(vol, fc = 200, d = '') {
  const kgC = FC_CEMENT[fc] || 350;
  const decomposed = [cement(kgC * vol), sand(0.52 * vol), gravel(0.65 * vol), water(0.22 * vol),
    E('Revolvedora para concreto de 1 saco', 0.45 * vol, 'hr', ['revolvedora'], { fb: 60, range: [10, 400] })];
  if (/hecho en obra|revolvedora|fabricado en obra|elaborado en obra|a mano/.test(d)) return decomposed;
  return [ALT(
    M(`Concreto premezclado f'c=${fc} kg/cm2`, vol, 'm3', ['concreto', 'premez', `fc${fc}`], { any: ['convencional', ' rn', 'no bombeable', '20mm'], none: ['mr='], fb: 0, range: [900, 4500] }),
    decomposed
  )];
}

const MORTAR = {
  '1:3': { c: 455, a: 1.07 }, '1:4': { c: 360, a: 1.13 }, '1:5': { c: 300, a: 1.17 }, '1:6': { c: 255, a: 1.2 },
  '1:1:6': { c: 200, cal: 100, a: 1.15 }, '1:1:4': { c: 270, cal: 135, a: 1.1 }, '1:2:8': { c: 160, cal: 160, a: 1.18 },
  '1:1:5': { c: 230, cal: 115, a: 1.12 }
};
function mortar(vol, prop = '1:4') {
  const p = MORTAR[prop] || MORTAR['1:4'];
  const arr = [cement(p.c * vol), sand(p.a * vol)];
  if (p.cal) arr.push(calhidra(p.cal * vol));
  arr.push(water(0.26 * vol));
  return arr;
}

// Cimbra de madera acabado común (consumo por m2 de contacto, 5 usos)
function formwork(area, d = '') {
  if (area <= 0) return [];
  const arr = [
    M('Duela de pino 3/4"x4"x8 1/4 para cimbra', 1.8 * area, 'pt', ['duela'], { any: ['3/4'], none: DUELA_NONE, fb: 17.7, range: [4, 60] }),
    M('Barrote de pino 2"x4"x8 1/4', 0.8 * area, 'pt', ['barrote'], { fb: 21.6, range: [4, 60] }),
    M('Polín de pino 3 1/2"x3 1/2"x8 1/4', 0.6 * area, 'pt', ['polin'], { none: ['laminado'], fb: 8, range: [3, 60] }),
    M('Clavo de 2 1/2" con cabeza', 0.15 * area, 'kg', ['clavo'], { any: ['2 1/2|2-4|cabeza'], none: ['riel', 'arandela', 'concreto', 'neumatic'], fb: 12, range: [5, 80] }),
    M('Desmoldante para cimbra', 0.08 * area, 'l', ['desmoldante'], { any: ['cimbra'], fb: 40, range: [5, 200] }),
    L('carpintero', 0.085 * area)
  ];
  if (/aparente|triplay/.test(d)) arr.push(M('Triplay de pino 16 mm para cimbra aparente', 0.25 * area, 'm2', ['triplay'], { any: ['16mm|15mm'], fb: 170, range: [50, 600] }));
  return arr;
}

// Producto principal del concepto a partir de su propia descripción (marca, modelo, medidas...)
const LABOR_WORDS = new Set(['suministro', 'colocacion', 'instalacion', 'fijacion', 'conexion', 'pruebas', 'limpieza', 'dimensionamiento', 'alineacion', 'cortes', 'nivelacion', 'aplicacion', 'retiro', 'acarreo', 'elevacion', 'montaje']);
function headTokens(raw) {
  const cut = norm(raw).split(/incluye|incluyendo|\bpu\b/)[0];
  return tokens(cut).filter(t => !LABOR_WORDS.has(t) && !/^\d+(\.\d+)?$/.test(t));
}
function mainItem(raw, unit, qty, o = {}) {
  const tk = headTokens(raw);
  const head = o.head || (tk[0] ? `${tk[0]}|${tk[0].replace(/s$/, '')}` : 'xxxxxx');
  const name = String(raw).split(/,|incluye/i)[0].trim().slice(0, 90);
  return M(name, qty, unit, [head].concat(o.all || []), { any: tk.slice(1, 9).concat(o.any || []), none: o.none, fb: o.fb || 0, range: o.range });
}

const NON_MATERIAL = /^(limpieza|pruebas?|acarreos?|conexion|instalacion|colocacion|fijacion|dimensionamiento|alineacion|cortes?|desperdicios?|mano de obra|herramienta|equipo|materiales?|nivelacion|trazo|suministro|retiro|maniobras?|elevacion|ajustes?|cimbrado|descimbrado|colado|vibrado|curado|armado|habilitado|todo lo necesario|lo necesario|correcta|acabado|resanes?|preparacion|aplicacion|lijado|mantenimiento|puesta en marcha|calibracion|flete|carga|descarga|desmantelamiento|proteccion|sellado|amacizado|traslapes|ganchos|mermas|maestras|reventon|terminado|enrase|plomeo|junteo|boquillado|elaboracion|fabricacion|pintado|perfilado|afine|compactado|compactacion|el sello|la mano|lo indicado)/;
export function parseIncludedItems(raw) {
  const d = norm(raw);
  const m = d.match(/incluye\s*:?\s*([^.]*)/);
  if (!m) return [];
  return m[1]
    .split(/,|;|\sy\s|\se\s/)
    .map(s => s.trim().replace(/^(el|la|los|las|un|una|de|del|sus|su)\s+/, '').trim())
    .filter(s => s.length > 3 && !NON_MATERIAL.test(s) && tokens(s).length > 0);
}
function includedExtras(raw, existing) {
  const covered = existing.map(c => norm(c.name || c.trade || '') + ' ' + (c.all || []).join(' ')).join(' | ');
  const extras = [];
  for (const phrase of parseIncludedItems(raw)) {
    const tk = tokens(phrase).filter(t => !LABOR_WORDS.has(t));
    if (tk.length === 0) continue;
    const head = tk[0].replace(/s$/, '');
    if (covered.includes(head)) continue;
    extras.push(M(phrase.charAt(0).toUpperCase() + phrase.slice(1), 1, 'pza', [`${head}|${tk[0]}`], { any: tk.slice(1) }));
  }
  return extras;
}

// =============================================================================
// FAMILIAS DE CONCEPTOS (interpretación de la descripción)
// =============================================================================
function bTrazo({ u }) {
  const k = u === 'm' ? 0.5 : 1;
  return [
    M('Barrote de pino 2"x4"x8 1/4 para estacas', 0.045 * k, 'pt', ['barrote'], { fb: 21.6, range: [4, 60] }),
    M('Duela de pino 3/4"x4"x8 1/4 para niveletas', 0.03 * k, 'pt', ['duela'], { any: ['3/4'], none: DUELA_NONE, fb: 17.7, range: [4, 60] }),
    M('Polín de pino 3 1/2"x3 1/2"x8 1/4', 0.06 * k, 'pt', ['polin'], { none: ['laminado'], fb: 8, range: [3, 60] }),
    calhidra(0.1 * k),
    M('Hilo para albañil (reventón)', 0.35 * k, 'm', ['hilo'], { any: ['albanil'], fb: 0.25, range: [0.05, 10] }),
    M('Esmalte para marcar referencias', 0.003 * k, 'l', ['esmalte'], { any: ['alquidalico'], fb: 133, range: [40, 600] }),
    L('topografo', 0.004 * k), L('peon', 0.004 * k),
    E('Nivel automático / estación total', 0.01 * k, 'hr', ['nivel|estacion total|teodolito'], { any: ['topograf', 'automatico'], fb: 80, range: [5, 800] })
  ];
}

function bLimpieza({ d, u }) {
  const k = u === 'm2' ? 1 : (u === 'ha' ? 10000 : 1);
  if (/maquina|retroexcavadora|tractor|motoconformadora|mecanic/.test(d)) {
    return [E('Retroexcavadora / tractor para desmonte', 0.003 * k, 'hr', ['retroexcavadora|tractor'], { none: ['martillo'], fb: 650, range: [150, 3000] }), L('peon', 0.004 * k)];
  }
  return [L('peon', (/desmonte|despalme|desenraice/.test(d) ? 0.02 : 0.01) * k)];
}

function bExcavacion({ d, u }) {
  const k = u === 'm' ? 0.4 : 1;
  const comps = [];
  if (/maquina|retroexcavadora|excavadora|mecanic|con equipo/.test(d)) {
    comps.push(E('Retroexcavadora sobre neumáticos', 0.07 * k, 'hr', ['retroexcavadora'], { any: ['cargador', '4x4'], none: ['martillo', 'renta'], fb: 650, range: [150, 3000] }));
    comps.push(L('peon', 0.05 * k));
  } else {
    let q = 0.4;
    if (/tipo iii|tipo 3|roca|tepetate duro/.test(d)) q = 0.75;
    else if (/tipo ii\b|tipo 2/.test(d)) q = 0.5;
    if (/2\.00 a 4\.00|mas de 2|> ?2/.test(d)) q *= 1.25;
    if (/agua|fango|lodo|humed/.test(d)) q *= 1.3;
    comps.push(L('peon', q * k));
  }
  if (/senaliz|cinta|barreras/.test(d)) comps.push(M('Cinta de polietileno para advertencia', 4 * k, 'm', ['cinta'], { any: ['advertencia|precaucion'], fb: 0.9, range: [0.1, 20] }));
  return comps;
}

function bRelleno({ d, u }) {
  const comps = [];
  const k = u === 'm3' ? 1 : (u === 'm2' ? 0.2 : 1);
  if (/tepetate|material de banco|de banco/.test(d)) comps.push(M('Tepetate de banco', 1.3 * k, 'm3', ['tepetate'], { fb: 220, range: [50, 900] }));
  else if (/grava/.test(d)) comps.push(gravel(1.3 * k));
  else if (/arena/.test(d)) comps.push(sand(1.3 * k));
  comps.push(water(0.15 * k));
  if (/bailarina|compactador|placa vibratoria|rodillo|apisonador|mecanic/.test(d)) {
    comps.push(E('Compactador de impacto (bailarina)', 0.15 * k, 'hr', ['compactador|bailarina|apisonador'], { fb: 90, range: [20, 1500] }));
    comps.push(L('peon', 0.18 * k));
  } else {
    comps.push(L('peon', 0.35 * k));
  }
  return comps;
}

function bDemolicion({ d, u }) {
  const vol = u === 'm3';
  const comps = [L('peon', vol ? 0.6 : 0.08)];
  if (/concreto|losa|firme|columna|trabe|banqueta/.test(d)) comps.push(E('Rompedora / martillo demoledor', vol ? 0.5 : 0.05, 'hr', ['rompedora|martillo demoledor|rotomartillo|demoledor'], { fb: 120, range: [10, 2000] }));
  return comps;
}

function bAcarreo({ d, u }) {
  const comps = [E('Camión de volteo 7 m3', u === 'm3' ? 0.06 : 0.02, 'hr', ['camion'], { any: ['volteo'], none: ['caja de volteo'], fb: 550, range: [100, 3000] })];
  if (/maquina|cargador|mecanic/.test(d)) comps.push(E('Cargador frontal', 0.03, 'hr', ['cargador'], { fb: 700, range: [150, 3000] }));
  else comps.push(L('peon', 0.15));
  return comps;
}

function bTablaroca({ d }) {
  const plafon = /plafon|cielo/.test(d);
  const caras = /dos caras|2 caras|ambas caras|doble cara/.test(d) ? 2 : (plafon ? 1 : (/muro|divisorio/.test(d) ? 2 : 1));
  const durock = /durock|panel de cemento/.test(d);
  const comps = [
    M(durock ? 'Panel de cemento Durock 12.7 mm' : 'Panel de yeso (tablaroca) 12.7 mm', caras * 1.05, 'm2',
      [durock ? 'durock|panel de cemento' : 'tablaroca|panel de yeso|placa de yeso|panel rey'],
      { any: ['12.7mm|1/2', /ultralight/.test(d) ? 'ultralight' : '', /resistente a la humedad|verde/.test(d) ? 'humedad' : ''], none: ['canal', 'poste', 'tornillo', 'esquinero', 'cinta', 'redimix', 'compuesto', 'reticul'], fb: durock ? 260 : 75, range: [20, 900] })
  ];
  if (plafon) {
    comps.push(M('Canal listón galvanizado cal. 26', 2.5, 'm', ['canal'], { any: ['liston'], none: ['plastic'], fb: 12, range: [2, 120] }));
    comps.push(M('Canaleta de carga galvanizada', 0.85, 'm', ['canaleta'], { fb: 14, range: [2, 120] }));
    comps.push(M('Alambre galvanizado cal. 12 para colgantes', 0.12, 'kg', ['alambre'], { any: ['galvanizado'], none: ['recocido', 'pua', 'cable'], fb: 35, range: [8, 150] }));
  } else {
    const sep = numIn(d, /a\s*cada\s*(\d{2})\s*cm/) || 61;
    comps.push(M('Poste metálico galvanizado cal. 26', (100 / sep) * 1.05, 'm', ['poste'], { any: ['galvaniz', 'cal. 26|cal 26|calibre 26', 'metalico'], none: ['concreto', 'madera', 'cerca', 'alumbrado'], fb: 18, range: [3, 150] }));
    comps.push(M('Canal de amarre galvanizado cal. 26', 0.8, 'm', ['canal'], { any: ['amarre', 'galvaniz'], none: ['liston', 'plastic'], fb: 16, range: [3, 150] }));
  }
  comps.push(M('Tornillo para panel 1" punta fina', 25 * caras + 4, 'pza', ['tornillo'], { any: ['tablaroca|panel|1"', 'punta'], none: ['anclaje', 'cabeza hexagonal'], fb: 0.25, range: [0.02, 5] }));
  comps.push(M('Cinta de refuerzo para juntas', 1.4 * caras, 'm', ['cinta'], { any: ['papel|junta|tablaroca|perfacinta'], none: ['aislar', 'teflon', 'advertencia'], fb: 0.6, range: [0.05, 20] }));
  comps.push(M('Compuesto para juntas (redimix)', 0.8 * caras, 'kg', ['redimix|compuesto|pasta'], { any: ['junta', 'tablaroca'], none: ['pulir', 'automotri'], fb: 18, range: [2, 120] }));
  comps.push(L('tablaroquero', caras === 2 ? 0.13 : 0.09));
  if (plafon) comps.push(E('Andamio tubular', 0.05, 'hr', ['andamio'], { fb: 3, range: [0.5, 200] }));
  return comps;
}

function bSalidaEle({ d }) {
  const kind = /contacto/.test(d) ? 'contacto' : (/apagador/.test(d) ? 'apagador' : (/television|telefon|datos|voz/.test(d) ? 'datos' : 'iluminacion'));
  const cal = parseCalibre(d) || (kind === 'contacto' ? 12 : 14);
  const diam = parseDiam(d) || 13;
  const conductors = kind === 'contacto' || /aterrizad|tierra/.test(d) ? 3 : 2;
  const comps = [];
  if (kind !== 'datos') {
    comps.push(M(`Cable de cobre THW-LS cal. ${cal}`, conductors * 4.2, 'm', ['cable|conductor|alambre'], { any: [`cal. ${cal}|calibre ${cal}|cal ${cal}|${cal} awg|no. ${cal}`, 'thw|thhw', 'cobre'], none: ['desnudo', 'uso rudo', 'coaxial', 'utp', 'telefon', 'aluminio', 'acero', 'tierra fisica'], fb: cal <= 10 ? 22 : (cal === 12 ? 12 : 8), range: [2, 150] }));
  }
  comps.push(M(`Tubo conduit / poliducto de ${diamInch(diam)}"`, 4.0, 'm', ['tubo|tuberia|poliducto|poliflex', 'conduit|poliflex|poliducto'], { any: [diamAlts(diam), /galvaniz|pared delgada/.test(d) ? 'galvaniz|pared delgada' : 'poliflex|poliducto|pvc'], none: ['cople', 'codo', 'conector', 'abrazadera', 'monitor', 'curva', 'condulet'], fb: 8, range: [1, 300] }));
  if (kind === 'iluminacion' && !/arbotante|muro/.test(d)) comps.push(M('Caja octagonal galvanizada', 1, 'pza', ['caja'], { any: ['octagonal|cuadrada', 'galvaniz'], fb: 12, range: [1, 300] }));
  else comps.push(M('Caja chalupa galvanizada', 1, 'pza', ['chalupa'], { any: ['galvaniz', diamAlts(diam)], fb: 8, range: [1, 300] }));
  if (kind === 'contacto') {
    comps.push(M('Contacto dúplex polarizado aterrizado', 1, 'pza', ['contacto'], { any: ['duplex|doble', 'polarizado|aterrizado', '15 amp|15a'], none: ['placa', 'industrial', 'gfci', 'falla a tierra', 'salida para'], fb: 45, range: [5, 800] }));
    comps.push(M('Placa para contacto dúplex', 1, 'pza', ['placa'], { any: ['contacto'], none: ['acero inox'], fb: 25, range: [2, 500] }));
  } else if (kind === 'apagador') {
    comps.push(M('Apagador sencillo 15 A', 1, 'pza', ['apagador'], { any: ['sencillo', '15'], none: ['placa', 'escalera', 'dimmer', 'salida para'], fb: 40, range: [5, 800] }));
    comps.push(M('Placa para apagador', 1, 'pza', ['placa'], { any: ['apagador'], none: ['acero inox'], fb: 25, range: [2, 500] }));
  } else if (kind === 'iluminacion') {
    if (/luminaria|lampara|spot|arbotante|led/.test(d)) comps.push(M('Luminaria LED', 1, 'pza', ['luminaria|lampara|spot|arbotante'], { any: ['led', /empotrar/.test(d) ? 'empotrar' : 'sobreponer'], fb: 350, range: [30, 15000] }));
    else comps.push(M('Socket de porcelana / portalámpara', 1, 'pza', ['socket|portalampara|roseta|receptaculo'], { any: ['porcelana'], fb: 18, range: [2, 300] }));
  } else {
    comps.push(M('Cable UTP / coaxial para datos', 12, 'm', ['cable'], { any: ['utp|coaxial|telefon'], fb: 9, range: [1, 200] }));
  }
  comps.push(M('Cinta de aislar', 0.1, 'pza', ['cinta'], { any: ['aislar|aislante'], fb: 15, range: [2, 200] }));
  comps.push(L('electricista', kind === 'contacto' ? 0.2 : (kind === 'apagador' ? 0.15 : 0.18)));
  return comps;
}

const PIPE = {
  cobre: { tube: ['tubo|tuberia', 'cobre'], tubeAny: ['tipo m'], fit: 'cobre', tubeNone: ['flexible', 'cobre-pvc', 'aislamiento', 'refrigeracion', 'tipo k'], mo: 0.035, fbTube: 120,
    cons: (k) => [M('Soldadura de estaño 50/50', 0.012 * k, 'kg', ['soldadura'], { any: ['50/50|95/5|estano'], none: ['electrodo', 'plata'], fb: 450, range: [80, 2500] }),
      M('Pasta fundente para soldar', 0.01 * k, 'pza', ['pasta|fundente'], { any: ['soldar|fundente'], fb: 45, range: [5, 500] }),
      M('Gas butano / propano para soplete', 0.02 * k, 'pza', ['gas'], { any: ['cilindro|soplete|propano|butano'], none: ['tanque estacionario', 'regulador'], fb: 120, range: [10, 900] })] },
  'pvc-h': { tube: ['tubo|tuberia', 'pvc', 'hidraul'], fit: 'pvc', tubeNone: ['conduit', 'cpvc', 'sanit', 'codo', 'cople'], mo: 0.012, fbTube: 35,
    cons: (k) => [M('Cemento para PVC', 0.02 * k, 'pza', ['cemento|pegamento'], { any: ['pvc'], none: ['cpvc', 'sanit'], fb: 150, range: [10, 900] }),
      M('Limpiador para PVC', 0.01 * k, 'pza', ['limpiador'], { any: ['pvc'], fb: 30, range: [5, 400] })] },
  'pvc-s': { tube: ['tubo|tuberia', 'pvc', 'sanit'], fit: 'pvc', fitAll: 'sanit', tubeNone: ['conduit', 'cpvc', 'codo', 'cople', 'ye '], mo: 0.015, fbTube: 60,
    cons: (k) => [M('Cemento para PVC sanitario', 0.03 * k, 'pza', ['cemento|pegamento'], { any: ['pvc', 'sanit'], none: ['cpvc'], fb: 276, range: [10, 900] }),
      M('Limpiador para PVC', 0.015 * k, 'pza', ['limpiador'], { any: ['pvc'], fb: 20, range: [5, 400] })] },
  cpvc: { tube: ['tubo|tuberia', 'cpvc'], fit: 'cpvc', tubeNone: ['codo', 'cople'], mo: 0.025, fbTube: 45,
    cons: (k) => [M('Cemento para CPVC', 0.02 * k, 'pza', ['cemento|pegamento'], { any: ['cpvc'], fb: 180, range: [10, 900] })] },
  ppr: { tube: ['tubo|tuberia', 'polipropileno|tuboplus|ppr'], fit: 'polipropileno|tuboplus', tubeNone: ['codo', 'cople'], mo: 0.025, fbTube: 55,
    cons: (k) => [E('Termofusora para polipropileno', 0.03 * k, 'hr', ['termofusora|termofusion'], { fb: 25, range: [2, 500] })] },
  galv: { tube: ['tubo|tuberia', 'galvaniz'], fit: 'galvaniz', tubeNone: ['conduit', 'pared delgada', 'pared gruesa', 'codo', 'cople', 'poste', 'barandal'], mo: 0.05, fbTube: 140,
    cons: (k) => [M('Cinta teflón para roscas', 0.15 * k, 'pza', ['cinta|teflon'], { any: ['teflon'], fb: 10, range: [1, 200] }),
      E('Tarraja para roscar tubo', 0.03 * k, 'hr', ['tarraja|roscadora'], { fb: 20, range: [1, 500] })] },
  multicapa: { tube: ['tubo|tuberia', 'multicapa|pe-al-pe'], fit: 'pe-al-pe|multicapa', tubeNone: ['te ', 'cople', 'codo', 'adaptador', 'valvula'], mo: 0.02, fbTube: 70,
    cons: () => [] },
  pead: { tube: ['tubo|tuberia', 'pead|polietileno'], fit: 'pead|polietileno', tubeNone: ['conduit', 'codo', 'cople', 'corrugado para'], mo: 0.02, fbTube: 60,
    cons: () => [] },
  acero: { tube: ['tubo|tuberia', 'acero'], tubeAny: ['cedula 40|ced. 40|ced 40'], fit: 'acero', tubeNone: ['galvaniz', 'conduit', 'inoxidable'], mo: 0.08, fbTube: 200,
    cons: (k) => [M('Soldadura eléctrica (electrodo E-6013)', 0.05 * k, 'kg', ['electrodo|soldadura'], { any: ['6013|6010|7018'], fb: 70, range: [20, 600] })] }
};

function pipeTube(mat, diam, qty) {
  const p = PIPE[mat];
  return M(`Tubo ${mat.toUpperCase()} de ${diamInch(diam)}" (${diam} mm)`, qty, 'm', p.tube.concat([diamAlts(diam)]), { any: p.tubeAny, none: p.tubeNone, fb: p.fbTube * (1 + diam / 50), range: [3, 20000] });
}
function pipeFitting(mat, diam, word, qty, label) {
  const p = PIPE[mat];
  const all = [word, p.fit, diamAlts(diam)];
  if (p.fitAll) all.push(p.fitAll);
  return M(`${label} ${mat.toUpperCase()} de ${diamInch(diam)}"`, qty, 'pza', all, { any: word === 'codo' ? ['90'] : [], none: ['conduit', 'reduccion', word === 'te|tee' ? 'reduccion' : 'zzzz'], fb: 25 * (1 + diam / 25), range: [1, 50000] });
}

function bPipe({ d, u }) {
  const gas = /\bgas\b/.test(d);
  const mat = pipeMaterial(d) || (gas ? 'cobre' : (/sanit|drenaje|desague/.test(d) ? 'pvc-s' : 'pvc-h'));
  const diam = parseDiam(d) || (mat === 'pvc-s' ? 100 : 13);
  const k = u === 'm' ? 1 : 6;
  const comps = [pipeTube(mat, diam, 1.05 * k)];
  const nConex = /conexiones|accesorios|codos/.test(d) ? 0.5 : 0.3;
  comps.push(pipeFitting(mat, diam, 'codo', nConex * 0.6 * k, 'Codo 90°'));
  comps.push(pipeFitting(mat, diam, 'cople|copla', nConex * 0.4 * k, 'Cople'));
  comps.push(...PIPE[mat].cons(k));
  if (/abrazadera|soporte|fijacion|colgante/.test(d) || gas) comps.push(M('Abrazadera / soporte de fijación', 0.7 * k, 'pza', ['abrazadera'], { any: [diamAlts(diam), 'omega|uña|tipo u'], fb: 6, range: [0.5, 800] }));
  comps.push(L('plomero', PIPE[mat].mo * (1 + diam / 100) * k));
  return comps;
}

function bFitting({ d }) {
  const mat = pipeMaterial(d) || 'pvc-h';
  const diam = parseDiam(d) || (mat === 'pvc-s' ? 50 : 13);
  const m = d.match(/\b(codo|cople|tee?|ye|yee|reduccion|tapon|adaptador|valvula|union|niple|brida|tuerca)\b/);
  const word = m ? (m[1] === 'te' || m[1] === 'tee' ? 'te|tee' : (m[1] === 'yee' ? 'ye|yee' : m[1])) : 'codo';
  const main = mainItem(d, 'pza', 1, { head: word, all: [PIPE[mat].fit, diamAlts(diam)], fb: 25 * (1 + diam / 25), range: [1, 80000] });
  const comps = [main];
  const consK = 0.4 * (1 + diam / 50);
  comps.push(...PIPE[mat].cons(consK).filter(c => c.tipo === 'Material'));
  comps.push(L('plomero', (/valvula/.test(d) ? 0.05 : 0.02) * (1 + diam / 100)));
  return comps;
}

function bSalidaHid({ d }) {
  const sanit = /sanit|drenaje|desague|wc|inodoro/.test(d) && !/hidraul/.test(d);
  const gas = /\bgas\b/.test(d);
  const mat = pipeMaterial(d) || (sanit ? 'pvc-s' : 'cobre');
  const diam = parseDiam(d) || (sanit ? (/wc|inodoro/.test(d) ? 100 : 50) : 13);
  const dbl = /fria y caliente|caliente y fria|agua caliente/.test(d) ? 2 : 1;
  const comps = [
    pipeTube(mat, diam, (sanit ? 3 : 6) * dbl),
    pipeFitting(mat, diam, 'codo', (sanit ? 2 : 4) * dbl, 'Codo 90°'),
    pipeFitting(mat, diam, sanit ? 'ye|yee' : 'te|tee', 1 * dbl, sanit ? 'Ye' : 'Tee'),
    pipeFitting(mat, diam, 'cople|copla', 1 * dbl, 'Cople')
  ];
  if (!sanit) comps.push(M(`Conector / adaptador ${mat} ${diamInch(diam)}"`, 1 * dbl, 'pza', ['conector|adaptador', PIPE[mat].fit, diamAlts(diam)], { fb: 25, range: [1, 2000] }));
  if (/llave de paso|valvula/.test(d)) comps.push(M(`Válvula / llave de paso ${diamInch(diam)}"`, 1 * dbl, 'pza', ['valvula|llave', diamAlts(diam)], { any: ['paso|compuerta|esfera'], fb: 180, range: [20, 20000] }));
  comps.push(...PIPE[mat].cons((sanit ? 4 : 8) * dbl));
  comps.push(L('plomero', (sanit ? 0.2 : (gas ? 0.3 : 0.25)) * dbl));
  return comps;
}

const MUEBLE_FB = { inodoro: 2500, wc: 2500, lavabo: 1500, mingitorio: 3500, tarja: 1800, fregadero: 1800, regadera: 900, mezcladora: 1500, llave: 350, lavadero: 1500, tinaco: 2200, calentador: 4500, boiler: 4500, cespol: 120, maneral: 1800 };
function bMueble({ d, raw }) {
  const m = d.match(/inodoro|\bw\.?c\b|lavabo|mingitorio|tarja|fregadero|regadera|mezcladora|llave|lavadero|tinaco|calentador|boiler|cespol|maneral/);
  const kind = m ? m[0].replace(/\./g, '') : 'mueble';
  const comps = [mainItem(raw, 'pza', 1, { head: kind === 'wc' ? 'inodoro|wc|w.c' : kind, fb: MUEBLE_FB[kind] || 800, none: ['cespol para', 'asiento para', 'llave angular para', 'valvula para'] })];
  const flex = (n) => M('Manguera flexible / alimentador', n, 'pza', ['manguera|alimentador|coflex|flexible'], { any: ['lavabo|inodoro|wc|tarja|mezcladora', '1/2'], none: ['jardin', 'contra incendio', 'gas'], fb: 85, range: [10, 1500] });
  const angular = (n) => M('Llave angular / de control 1/2"', n, 'pza', ['llave'], { any: ['angular|control|empotrar|retencion'], none: ['nariz', 'jardin', 'mezcladora'], fb: 120, range: [10, 3000] });
  if (/inodoro|wc/.test(kind)) {
    comps.push(M('Cuello de cera para inodoro', 1, 'pza', ['cuello|anillo', 'cera'], { fb: 45, range: [5, 600] }));
    comps.push(flex(1), angular(1));
    comps.push(M('Juego de pijas y taquetes de fijación', 2, 'pza', ['taquete|pija'], { fb: 3, range: [0.2, 150] }));
  } else if (/lavabo|tarja|fregadero|lavadero/.test(kind)) {
    comps.push(M('Céspol con contra', 1, 'pza', ['cespol'], { any: [kind, 'pvc|cromo'], fb: 150, range: [10, 3000] }));
    comps.push(flex(2), angular(2));
  } else if (/mezcladora|regadera|llave|maneral/.test(kind)) {
    comps.push(flex(kind === 'mezcladora' ? 2 : 0));
  }
  comps.push(M('Sellador de silicón sanitario', 0.15, 'pza', ['silicon|sellador'], { any: ['sanitario', 'silicon'], none: ['autos', 'pintura', 'concreto'], fb: 95, range: [10, 900] }));
  const valid = comps.filter(c => c.qty > 0);
  valid.push(...includedExtras(raw, valid));
  valid.push(L('plomero', /inodoro|wc|mingitorio|calentador|boiler|tinaco/.test(kind) ? 0.5 : 0.35));
  return valid;
}

function bConduit({ d, u }) {
  const diam = parseDiam(d) || 13;
  const k = u === 'm' ? 1 : 3;
  const galv = /galvaniz|pared delgada|pared gruesa/.test(d);
  return [
    M(`Tubo conduit de ${diamInch(diam)}"`, 1.05 * k, 'm', ['tubo|tuberia|poliducto|poliflex', 'conduit|poliflex|poliducto'], { any: [diamAlts(diam), galv ? 'galvaniz|pared' : 'pvc|poliflex|poliducto'], none: ['cople', 'codo', 'conector', 'abrazadera', 'monitor', 'curva', 'condulet'], fb: 10 * (1 + diam / 25), range: [1, 2000] }),
    M(`Cople conduit de ${diamInch(diam)}"`, 0.33 * k, 'pza', ['cople', 'conduit', diamAlts(diam)], { fb: 4, range: [0.5, 900] }),
    M('Abrazadera tipo uña', 0.5 * k, 'pza', ['abrazadera'], { any: [diamAlts(diam), 'una|uña|omega'], fb: 3, range: [0.2, 400] }),
    L('electricista', 0.02 * (1 + diam / 50) * k)
  ];
}

function bCable({ d }) {
  const cal = parseCalibre(d) || 12;
  const desnudo = /desnudo/.test(d);
  return [
    M(`Cable de cobre ${desnudo ? 'desnudo' : 'THW-LS'} cal. ${cal}`, 1.05, 'm', ['cable|conductor|alambre'], { any: [`cal. ${cal}|calibre ${cal}|cal ${cal}|${cal} awg|no. ${cal}`, desnudo ? 'desnudo' : 'thw|thhw|xhhw', 'cobre'], none: desnudo ? ['aluminio', 'coaxial', 'utp'] : ['desnudo', 'uso rudo', 'coaxial', 'utp', 'telefon', 'aluminio'], fb: cal <= 8 ? 45 : (cal <= 10 ? 22 : 12), range: [1, 2000] }),
    M('Cinta de aislar', 0.005, 'pza', ['cinta'], { any: ['aislar|aislante'], fb: 15, range: [2, 200] }),
    L('electricista', 0.012 * (cal <= 8 ? 2 : 1))
  ];
}

function bElectrico({ d, raw }) {
  const big = /centro de carga|tablero|interruptor/.test(d);
  const comps = [mainItem(raw, 'pza', 1, { fb: big ? 900 : 120, none: ['placa para', 'salida para'] })];
  comps.push(...includedExtras(raw, comps));
  comps.push(M('Cinta de aislar', 0.1, 'pza', ['cinta'], { any: ['aislar|aislante'], fb: 15, range: [2, 200] }));
  comps.push(L('electricista', big ? 0.5 : 0.1));
  return comps;
}

function bImper({ d, raw }) {
  const comps = [];
  const anos = numIn(d, /(\d+)\s*anos/) || 5;
  if (/prefabricad|manto|rollo|app\b|sbs|asfaltico prefab/.test(d)) {
    comps.push(M('Membrana prefabricada asfáltica APP', 1.15, 'm2', ['membrana|manto|impermeabilizante'], { any: ['prefabricad', 'app|sbs', 'asfalt'], fb: 120, range: [20, 900] }));
    comps.push(M('Primario asfáltico', 0.25, 'l', ['primario|primer'], { any: ['asfalt'], fb: 40, range: [5, 400] }));
    comps.push(E('Soplete y gas para termofusión', 0.03, 'hr', ['soplete'], { fb: 15, range: [1, 300] }));
  } else {
    const tk = headTokens(raw).filter(t => !/impermeabiliz/.test(t));
    comps.push(M(`Impermeabilizante ${/acrilic|elastomer/.test(d) ? 'acrílico elastomérico' : ''} ${anos} años`.replace(/\s+/g, ' '), anos >= 10 ? 1.6 : (anos >= 7 ? 1.4 : 1.2), 'l',
      ['impermeabilizante|resina|impermeabiliz'], { any: tk.slice(0, 6).concat([`${anos} anos`]), none: ['cementoso', 'polvo', 'integral', 'aditivo', 'mortero'], fb: 75, range: [15, 900] }));
    comps.push(M('Sellador / primario para impermeabilizante', 0.25, 'l', ['sellador|primario|primer'], { any: ['impermeab', 'acrilic', 'base agua'], none: ['vinilico 5x1', 'madera', 'silicon'], fb: 45, range: [5, 600] }));
    if (/membrana|malla|poliester|refuerzo/.test(d) || anos >= 7) comps.push(M('Membrana de refuerzo de poliéster', 1.1, 'm2', ['membrana|malla'], { any: ['poliester|refuerzo'], none: ['electrosoldada', 'geomalla', 'ciclon'], fb: 18, range: [3, 200] }));
  }
  comps.push(L('impermeabilizador', 0.035));
  return comps;
}

function bPintura({ d, raw }) {
  const manos = numIn(wordsToNums(d), /(\d)\s*manos/) || 2;
  const esmalte = /esmalte|alquidal|anticorros/.test(d);
  const epox = /epox/.test(d);
  const tk = headTokens(raw).filter(t => !/pintura|muros?|exteriores|interiores|mezcla|fino|rugoso|aplicada|color/.test(t));
  const comps = [M(`Pintura ${esmalte ? 'esmalte' : (epox ? 'epóxica' : 'vinílica')} (${manos} manos)`, r5(manos * 0.11), 'l',
    [esmalte ? 'esmalte' : (epox ? 'epox' : 'pintura')], { any: tk.slice(0, 6).concat([esmalte ? 'alquidal' : 'vinilica']), none: ['trafico', 'aerosol', 'removedor', 'thinner', 'textur', 'impermeab', 'solvente'], fb: esmalte ? 140 : 90, range: [20, 1500] })];
  if (!esmalte && !epox) comps.push(M('Sellador vinílico 5x1', /rugoso|exterior/.test(d) ? 0.15 : 0.1, 'l', ['sellador'], { any: ['vinilico', '5x1|5 x 1'], none: ['madera', 'silicon', 'impermeab'], fb: 45, range: [5, 600] }));
  if (esmalte && /herreria|metal|acero|anticorros|fierro/.test(d)) comps.push(M('Primario anticorrosivo', 0.1, 'l', ['primario|anticorrosivo'], { fb: 120, range: [20, 900] }));
  comps.push(M('Lija para preparación de superficie', 0.05, 'pza', ['lija'], { none: ['disco', 'banda', 'maquina'], fb: 9, range: [1, 200] }));
  comps.push(L('pintor', (/rugoso/.test(d) ? 0.03 : 0.025) * (manos / 2)));
  if (/altura|exterior|fachada|andamio/.test(d)) comps.push(E('Andamio tubular', 0.05, 'hr', ['andamio'], { fb: 3, range: [0.5, 200] }));
  return comps;
}

function bAplanado({ d, u, specs }) {
  const thick = specs.thickness || (/fino/.test(d) ? 1 : 2);
  let k = 1;
  if (u === 'm') k = (parseSection(d) || [])[0] ? Math.min(0.6, (parseSection(d)[0]) / 100) : (numIn(d, /de\s*(\d{1,2})\s*cm/) || 15) / 100;
  const comps = [];
  if (/yeso/.test(d)) {
    comps.push(M('Yeso para construcción', 7.5 * thick * k, 'kg', ['yeso'], { none: ['adheyeso', 'pasta', 'texpirme', 'panel', 'tablaroca', 'placa', 'plafon', 'moldura', 'aditivo', 'tirol'], fb: 2.5, range: [0.8, 12] }));
    comps.push(water(0.008 * thick * k));
    comps.push(L('yesero', (/plafon/.test(d) ? 0.09 : 0.07) * k));
  } else {
    const vol = (thick / 100) * 1.1 * k;
    comps.push(...mortar(vol, specs.prop || '1:4'));
    comps.push(L('albanil', (/fino/.test(d) ? 0.12 : (/rugoso|zarpeo/.test(d) ? 0.08 : 0.1)) * (k === 1 ? 1 : Math.max(0.35, k * 2))));
  }
  if (/altura|andamio|plafon|fachada/.test(d)) comps.push(E('Andamio tubular', 0.05 * k, 'hr', ['andamio'], { fb: 3, range: [0.5, 200] }));
  return comps;
}

function bTile({ d, u, raw }) {
  const sec = parseSection(d);
  const big = sec && Math.max(...sec) >= 60;
  const porcel = /porcelan/.test(d);
  const zoclo = /zoclo/.test(d) || u === 'm';
  const k = zoclo ? ((sec ? Math.min(...sec) : 10) / 100) : 1;
  const tk = headTokens(raw).filter(t => !/piso|loseta|zoclo|lambrin|recubrimiento|asentad|pegazulejo|boquilla|arena|color/.test(t));
  const kind = porcel ? 'porcelanato' : (/azulejo/.test(d) ? 'azulejo' : (/marmol/.test(d) ? 'marmol' : 'loseta|piso|ceramic'));
  const comps = [M(`${porcel ? 'Porcelanato' : 'Loseta cerámica'}${sec ? ` ${sec.slice(0, 2).join('x')} cm` : ''}`, (big ? 1.08 : 1.05) * k, 'm2', [kind], { any: tk.slice(0, 6).concat(sec ? [sec.slice(0, 2).join('x')] : []), none: ['adhesivo', 'pegazulejo', 'boquilla', 'cortador', 'limpiador', 'sellador'], fb: porcel ? 320 : 220, range: [40, 6000] })];
  comps.push(M(`Adhesivo ${porcel ? 'para porcelanato' : 'pegazulejo'}`, (big ? 6 : 5) * k, 'kg', ['pegazulejo|adhesivo cementoso|adhesivo para piso|adhesivo para porcelan'], { any: [porcel ? 'porcelan' : 'blanco|gris'], fb: 6, range: [1.5, 40] }));
  comps.push(M(`Boquilla ${/sin arena/.test(d) ? 'sin arena' : 'con arena'}`, (porcel ? 0.25 : 0.35) * k, 'kg', ['boquilla'], { any: [/sin arena/.test(d) ? 'sin arena' : 'arena'], none: ['flama', 'soplete', 'sand', 'universal', 'tanque'], fb: 8, range: [1.5, 60] }));
  comps.push(L('colocador', zoclo ? 0.03 : (big ? 0.1 : 0.09)));
  return comps;
}

function bMasonry({ d, specs }) {
  const sec = parseSection(d);
  const isTabique = /tabique|ladrillo/.test(d) && !/block|bloque/.test(d);
  const isTabicon = /tabicon/.test(d);
  let dims = sec && sec.length === 3 ? sec : (isTabique ? [7, 14, 28] : (isTabicon ? [10, 14, 28] : [15, 20, 40]));
  const [w, h, l] = isTabique || isTabicon ? [dims.slice().sort((a, b) => a - b)[1], dims.slice().sort((a, b) => a - b)[0], dims.slice().sort((a, b) => a - b)[2]]
    : [dims[0], dims[1], dims[2]];
  const capuchino = /capuchino|14cm de espesor|espesor de 14/.test(d);
  const faceL = capuchino ? w : l;
  const pieces = r5((1 / (((faceL + 1) / 100) * ((h + 1) / 100))) * 1.03);
  const mortarVol = isTabique || isTabicon ? (capuchino ? 0.05 : 0.025) : 0.001 * w;
  const dimTxt = sec && sec.length === 3 ? sec.join('x') : null;
  const comps = [
    M(isTabique ? 'Tabique rojo recocido 7x14x28 cm' : (isTabicon ? 'Tabicón de concreto 10x14x28 cm' : `Block de concreto ${dims.join('x')} cm`), pieces, 'pza',
      [isTabique ? 'tabique|ladrillo' : (isTabicon ? 'tabicon' : 'block|bloque')],
      { any: [dimTxt, /hueco/.test(d) ? 'hueco' : '', 'rojo|recocido|liso|gris'].filter(Boolean), none: ['mesa', 'contencion', 'conector', 'vidrio', 'celosia', 'aparente', 'adoquin'], fb: isTabique ? 3.5 : 12, range: [1, 120] }),
    ...mortar(mortarVol, specs.prop || '1:4')
  ];
  if (/escalerilla/.test(d)) comps.push(M('Escalerilla de refuerzo horizontal', 1.4, 'm', ['escalerilla'], { fb: 18, range: [3, 200] }));
  comps.push(L('albanil', isTabique ? 0.16 : (capuchino ? 0.2 : 0.128)));
  if (/altura|andamio/.test(d)) comps.push(E('Andamio tubular', 0.08, 'hr', ['andamio'], { fb: 3, range: [0.5, 200] }));
  return comps;
}

function bStone({ specs }) {
  return [
    M('Piedra braza', 1.1, 'm3', ['piedra'], { any: ['braza|brasa'], none: ['laja', 'bola', 'decorativa'], fb: 360, range: [80, 2000] }),
    ...mortar(0.31, specs.prop || '1:5'),
    L('albanil', 0.43)
  ];
}

function steelForLinear(d, b, h) {
  const st = parseSteel(d);
  const comps = [];
  let kg = 0;
  if (st.armex) {
    comps.push(M(`Armex ${st.armex}-4`, 1.05, 'm', ['armex'], { any: [st.armex], fb: 18, range: [3, 300] }));
    comps.push(alambre(0.01));
    return { comps, kg: 0 };
  }
  const isGuarn = /guarnicion/.test(d);
  const longN = st.long && st.long.n > 0 ? st.long.n : (isGuarn ? 1 : 4);
  const longNo = st.long ? st.long.no : '3';
  const kgLong = longN * BAR[longNo].kg * 1.07;
  comps.push(rebar(r5(kgLong), longNo));
  kg += kgLong;
  if (!isGuarn || st.stir) {
    const stNo = st.stir ? st.stir.no : '2';
    const sep = st.stir ? st.stir.sep : 20;
    const perim = (2 * ((b - 4) + (h - 4))) / 100 + 0.12;
    const kgStir = (100 / sep) * perim * BAR[stNo].kg * 1.05;
    if (stNo === longNo) comps[0].qty = r5(comps[0].qty + kgStir);
    else comps.push(rebar(r5(kgStir), stNo));
    kg += kgStir;
  }
  comps.push(alambre(r5(kg * 0.03)));
  return { comps, kg };
}

function bLinearConcrete({ d, specs }) {
  const sec = parseSection(d) || (/guarnicion/.test(d) ? [15, 40] : [15, 20]);
  const [b, h] = [Math.min(sec[0], sec[1]), Math.max(sec[0], sec[1])];
  const fc = specs.fc || (/guarnicion/.test(d) ? 150 : 200);
  const vol = (b * h) / 10000 * 1.03;
  const comps = [...concrete(vol, fc, d)];
  const steel = steelForLinear(d, b, h);
  comps.push(...steel.comps);
  let caras = 2 * (h / 100);
  if (/trabe|viga/.test(d)) caras = (b + 2 * h) / 100;
  else if (/columna/.test(d) && !/castillo/.test(d)) caras = 2 * (b + h) / 100;
  if (/4 caras/.test(d)) caras = 2 * (b + h) / 100;
  if (/3 caras|tres caras/.test(d)) caras = (b + 2 * h) / 100;
  if (/sin cimbra/.test(d)) caras = 0;
  comps.push(...formwork(caras, d));
  const scale = Math.sqrt((b * h) / 300);
  comps.push(L('albanil', 0.06 * scale));
  if (steel.kg > 0) comps.push(L('fierrero', steel.kg * 0.0067));
  else comps.push(L('albanil', 0.01));
  return comps;
}

function bAreaConcrete({ d, specs }) {
  const plantilla = /plantilla/.test(d);
  const losa = /losa/.test(d) && !/losa de cimentacion/.test(d) && !/piso|firme/.test(d.split(',')[0].replace(/losa piso/, 'losa'));
  const e = specs.thickness || (plantilla ? 5 : 10);
  const fc = specs.fc || (plantilla ? 100 : (losa ? 250 : 150));
  const comps = [...concrete((e / 100) * 1.03, fc, d)];
  const st = parseSteel(d);
  let kg = 0;
  if (/malla/.test(d)) comps.push(M('Malla electrosoldada 6x6-10/10', 1.1, 'm2', ['malla'], { any: ['electrosoldada', '6x6-10/10|66-1010|6-6/10-10|6x6 10/10'], none: ['ciclon', 'gallinera', 'sombra', 'geomalla', 'plastic', 'fibra', 'mosquiter', 'hexagonal', 'pollo'], fb: 37, range: [8, 300] }));
  if (st.grid) {
    kg = (100 / st.grid.sep) * BAR[st.grid.no].kg * (st.grid.both || losa ? 2 : 1) * 1.07;
    comps.push(rebar(r5(kg), st.grid.no), alambre(r5(kg * 0.03)));
  }
  const cimbraArea = losa ? 1.0 : (/cimbra|frontera/.test(d) ? 0.1 : 0);
  comps.push(...formwork(cimbraArea, d));
  if (/polietileno/.test(d)) comps.push(M('Película de polietileno', 1.1, 'm2', ['polietileno'], { any: ['pelicula|plastico|negro'], none: ['tubo', 'tuberia', 'tanque', 'cinta'], fb: 8, range: [1, 200] }));
  if (/curado|curacreto|membrana/.test(d)) comps.push(M('Membrana de curado', 0.2, 'l', ['curado|curacreto|membrana de curado|curador'], { fb: 35, range: [5, 400] }));
  if (/corte|junta|cortadora/.test(d)) comps.push(E('Cortadora de concreto con disco', 0.02, 'hr', ['cortadora'], { any: ['concreto|disco'], fb: 120, range: [10, 2000] }));
  comps.push(L('albanil2', 0.08 + Math.max(0, e - 10) * 0.004 + (/pulido|escobillado|aplanado integral|acabado fino/.test(d) ? 0.02 : 0)));
  if (kg > 0) comps.push(L('fierrero', kg * 0.0067));
  if (losa || e >= 12) comps.push(E('Vibrador para concreto', 0.03, 'hr', ['vibrador'], { any: ['concreto', 'gasolina'], none: ['regla'], fb: 45, range: [5, 800] }));
  return comps;
}

const VOL_STEEL = { zapata: 60, dado: 80, contratrabe: 110, columna: 150, trabe: 130, losa: 90, muro: 70 };
const VOL_FORM = { zapata: 1.5, dado: 4, contratrabe: 5, columna: 9, trabe: 8, losa: 10, muro: 6.7 };
function bVolConcrete({ d, specs }) {
  const el = (d.match(/zapata|dado|contratrabe|columna|trabe|losa|muro/) || ['generico'])[0];
  const fc = specs.fc || (el === 'zapata' ? 250 : 200);
  const comps = [...concrete(1.03, fc, d)];
  const st = parseSteel(d);
  let kg = 0;
  if (st.grid && el === 'zapata') kg = (100 / st.grid.sep) * BAR[st.grid.no].kg * 2 * 1.07 / 0.3;
  else if (st.long || st.grid || /armad|varilla|acero/.test(d)) kg = VOL_STEEL[el] || 80;
  if (kg > 0) {
    const no = st.grid ? st.grid.no : (st.long ? st.long.no : '4');
    comps.push(rebar(r5(kg), no), alambre(r5(kg * 0.025)));
  }
  const fArea = /sin cimbra/.test(d) ? 0 : ((VOL_FORM[el] || (/cimbra/.test(d) ? 3 : 0)));
  comps.push(...formwork(fArea, d));
  comps.push(L('albanil2', 0.35));
  if (kg > 0) comps.push(L('fierrero', kg * 0.0067));
  comps.push(E('Vibrador para concreto', 0.25, 'hr', ['vibrador'], { any: ['concreto', 'gasolina'], none: ['regla'], fb: 45, range: [5, 800] }));
  return comps;
}

function bAcero({ d, u }) {
  const st = parseSteel(d);
  const no = st.long ? st.long.no : (st.grid ? st.grid.no : (/estribo/.test(d) ? '2' : '3'));
  const k = u === 'ton' ? 1000 : 1;
  return [rebar(1.07 * k, no), alambre(0.03 * k), L('fierrero', 0.0067 * k)];
}

function bCimbra({ d }) {
  return formwork(1, d);
}

function bCarpinteria({ d, u, raw }) {
  const trade = /aluminio|cancel|ventana|vidrio|cristal/.test(d) ? 'aluminero' : (/herreria|herrero|metalic|acero|lamina|reja|barandal|porton/.test(d) ? 'herrero' : 'carpintero');
  const qty = u === 'm2' ? 1.0 : 1;
  const comps = [mainItem(raw, u === 'm2' ? 'm2' : 'pza', qty, { fb: 0 })];
  if (/chapa|cerradura/.test(d)) comps.push(M('Chapa / cerradura', 1, 'pza', ['chapa|cerradura'], { any: (d.match(/marca (\w+)/) || [])[1] ? [(d.match(/marca (\w+)/))[1]] : ['sobreponer|tubular'], fb: 450, range: [30, 15000] }));
  if (/bisagra/.test(d) || (trade === 'carpintero' && /puerta/.test(d))) comps.push(M('Bisagra de 3 1/2"', 3, 'pza', ['bisagra'], { any: ['3 1/2|3.5'], fb: 45, range: [3, 2000] }));
  comps.push(...includedExtras(raw, comps));
  comps.push(L(trade, u === 'm2' ? 0.3 : (/puerta|porton/.test(d) ? 0.6 : 0.4)));
  return comps;
}

function bGeneric({ d, u, raw }) {
  const unit = { m2: 'm2', m: 'm', m3: 'm3', kg: 'kg' }[u] || 'pza';
  const qty = ['m2', 'm', 'm3'].includes(unit) ? 1.05 : 1;
  const comps = [mainItem(raw, unit, qty, { fb: 0 })];
  comps.push(...includedExtras(raw, comps));
  let trade = 'albanil';
  if (/electric|cable|contacto|lampara|luminaria|tablero/.test(d)) trade = 'electricista';
  else if (/hidraul|sanitari|tuberia|bomba|tinaco|plomer|agua|gas\b/.test(d)) trade = 'plomero';
  else if (/pintur/.test(d)) trade = 'pintor';
  else if (/herreria|soldad|metalic/.test(d)) trade = 'herrero';
  else if (/madera|carpinter/.test(d)) trade = 'carpintero';
  const moQty = { m2: 0.08, m: 0.06, m3: 0.3, kg: 0.007 }[u] ?? (u === 'lote' ? 1 : 0.15);
  comps.push(L(trade, /bomba|calentador|equipo/.test(d) ? 0.5 : moQty));
  return comps;
}

const FAMILIES = [
  { id: 'trazo', label: 'Trazo y nivelación', test: (d) => /\btrazo\b|nivelacion topograf|replanteo/.test(d), build: bTrazo },
  { id: 'limpieza', label: 'Limpieza / desmonte', test: (d) => /^(limpieza|desmonte|despalme|deshierbe|chapeo|desyerbe)|desmonte|despalme/.test(d), build: bLimpieza },
  { id: 'relleno', label: 'Relleno compactado', test: (d) => /^relleno|relleno (de|en|compactado)|terraplen/.test(d), build: bRelleno },
  { id: 'excavacion', label: 'Excavación', test: (d) => /excavacion/.test(d), build: bExcavacion },
  { id: 'demolicion', label: 'Demolición', test: (d) => /^demolicion|^desmantelamiento|^retiro de/.test(d), build: bDemolicion },
  { id: 'acarreo', label: 'Acarreo', test: (d) => /^acarreo|^carga y acarreo|^carga,? acarreo/.test(d), build: bAcarreo },
  { id: 'tablaroca', label: 'Muro / plafón de tablaroca', test: (d) => /tablaroca|tablarroca|durock|panel de yeso|panel de cemento|panel rey/.test(d), build: bTablaroca },
  { id: 'salida_ele', label: 'Salida eléctrica', test: (d, u) => (u === 'sal' || /^salida/.test(d)) && /electric|contacto|apagador|ilumin|lampara|luminaria|spot|arbotante|centro|television|telefon|datos/.test(d), build: bSalidaEle },
  { id: 'salida_hid', label: 'Salida hidrosanitaria', test: (d, u) => (u === 'sal' || /^salida/.test(d)) && /hidraul|sanitari|agua|drenaje|lavabo|inodoro|\bwc\b|regadera|fregadero|tarja|lavadero|\bgas\b/.test(d), build: bSalidaHid },
  { id: 'mueble', label: 'Mueble / accesorio sanitario', test: (d) => /^(suministro y colocacion de |suministro e instalacion de |colocacion de |instalacion de )?(inodoro|w\.?c\b|lavabo|mingitorio|tarja|fregadero|regadera|mezcladora|llave|lavadero|tinaco|calentador|boiler|cespol|juego de maneral|maneral)/.test(d), build: bMueble },
  { id: 'fitting', label: 'Conexión / válvula de tubería', test: (d, u) => (u === 'pza' || u === 'jgo') && /^(suministro y colocacion de |suministro e instalacion de )?(codo|cople|tee?|ye|yee|reduccion|tapon|adaptador|valvula|union|niple|brida|tuerca)\b/.test(d), build: bFitting },
  { id: 'conduit', label: 'Canalización conduit', test: (d) => /^(suministro y colocacion de |suministro e instalacion de )?(tubo|tuberia|poliducto|poliflex|canalizacion)[^.]{0,30}(conduit|poliflex|poliducto)|^poliducto|^poliflex/.test(d), build: bConduit },
  { id: 'pipe', label: 'Tubería', test: (d) => /^(suministro y colocacion de |suministro e instalacion de |suministro, instalacion y prueba de )?(tubo|tuberia|linea de)\b/.test(d), build: bPipe },
  { id: 'cable', label: 'Cableado', test: (d, u) => u === 'm' && /^(suministro y colocacion de |suministro e instalacion de |cableado con |alambrado con )?\s*(cable|conductor|alambre)/.test(d), build: bCable },
  { id: 'electrico', label: 'Dispositivo eléctrico', test: (d) => /^(suministro y colocacion de |suministro e instalacion de )?(contacto|apagador|centro de carga|interruptor|luminaria|lampara|reflector|tablero|apartarrayo|varilla de tierra|sistema de tierra)/.test(d), build: bElectrico },
  { id: 'impermeabilizacion', label: 'Impermeabilización', test: (d) => /impermeabiliz/.test(d), build: bImper },
  { id: 'pintura', label: 'Pintura', test: (d) => /^(suministro y aplicacion de |aplicacion de )?(pintura|esmalte|barniz|recubrimiento epox)/.test(d), build: bPintura },
  { id: 'plaster', label: 'Aplanado / recubrimiento de muros', test: (d) => /aplanado|repellado|enjarre|emboquillado|zarpeo/.test(d), build: bAplanado },
  { id: 'tile', label: 'Piso / recubrimiento cerámico', test: (d) => /(piso|lambrin|zoclo|recubrimiento)[^.]*(loseta|porcelan|ceramic|azulejo|marmol|mosaico)|^(loseta|azulejo|porcelanato|zoclo|lambrin)/.test(d), build: bTile },
  { id: 'masonry', label: 'Muro de mampostería (block / tabique)', test: (d) => /(muro|pretil|barda|tapial|murete)[^.]*(block|bloque|tabique|ladrillo|tabicon)|^(block|tabique|tabicon)/.test(d), build: bMasonry },
  { id: 'stone_masonry', label: 'Mampostería de piedra', test: (d) => /mamposteria|piedra bra[sz]a/.test(d), build: bStone },
  { id: 'linear_concrete', label: 'Elemento lineal de concreto armado', test: (d, u) => u === 'm' && /castillo|dala|cadena|trabe|guarnicion|cerramiento|columna|viga|repison/.test(d), build: bLinearConcrete },
  { id: 'area_concrete', label: 'Firme / losa de concreto', test: (d, u) => u === 'm2' && /firme|losa|banqueta|piso de concreto|pavimento de concreto|plantilla|rampa|andador/.test(d), build: bAreaConcrete },
  { id: 'vol_concrete', label: 'Concreto volumétrico', test: (d, u) => u === 'm3' && /zapata|dado|contratrabe|columna|trabe|losa|muro de concreto|concreto|plantilla/.test(d), build: bVolConcrete },
  { id: 'acero', label: 'Acero de refuerzo', test: (d, u) => (u === 'kg' || u === 'ton') && /acero|varilla|habilitado|armado|alambron/.test(d), build: bAcero },
  { id: 'cimbra', label: 'Cimbra', test: (d, u) => u === 'm2' && /^cimbra|^cimbrado/.test(d), build: bCimbra },
  { id: 'carpinteria', label: 'Carpintería / herrería / cancelería', test: (d) => /^(suministro y colocacion de |fabricacion y colocacion de |suministro, fabricacion y colocacion de )?(puerta|ventana|cancel|canceleria|porton|reja|barandal|closet|cocina integral|herreria|proteccion)/.test(d), build: bCarpinteria },
  { id: 'generic', label: 'Concepto general', test: () => true, build: bGeneric }
];

export function detectFamily(d, u) {
  return FAMILIES.find(f => f.test(d, u)) || FAMILIES[FAMILIES.length - 1];
}

/**
 * Interpreta la descripción y devuelve la lista de componentes (insumos requeridos con su consumo unitario).
 */
export function analyzeConcept(descripcion, unidad) {
  const d = norm(descripcion);
  const u = normUnit(unidad || 'pza');
  const fam = detectFamily(d, u);
  const specs = extractSpecs(d, fam.id);
  const components = fam.build({ d, u, raw: descripcion || '', specs });
  return { family: fam.id, familyLabel: fam.label, specs, components };
}

// =============================================================================
// RESOLUCIÓN DE COMPONENTES CONTRA EL ÍNDICE DE INSUMOS
// =============================================================================
function lookup(index, c) {
  if (c.tipo === 'Mano de Obra') {
    const t = TRADES[c.trade] || TRADES.albanil;
    return findSupply(index, { tipo: 'Mano de Obra', all: t.all, any: t.any, none: t.none, unit: 'jor', range: [300, 15000] });
  }
  return findSupply(index, { tipo: c.tipo, tipos: c.tipos, all: c.all, any: c.any, none: c.none, unit: c.unit, range: c.range });
}

export function resolveComponents(components, index, fasarFactor = 1.70) {
  const out = [];
  const unresolved = [];
  const catalogs = new Set();
  let estCounter = 0;
  const fasarRatio = (fasarFactor > 0 ? fasarFactor : 1.70) / 1.70;

  const push = (c, found) => {
    const qty = r5(c.qty);
    if (!(qty > 0)) return;
    if (found) {
      if (found.s.catalogName) catalogs.add(found.s.catalogName);
      out.push({
        clave: found.s.clave || `CAT-${out.length + 1}`,
        tipo: c.tipo === 'Equipo' ? found.s.tipo : c.tipo,
        descripcion: found.s.descripcion,
        unidad: DISPLAY_UNIT[c.unit] || c.unit,
        cantidad: qty,
        costoUnitario: r2(found.unitPrice),
        catalogName: found.s.catalogName || 'Catálogo Maestro'
      });
      return;
    }
    estCounter++;
    const t = c.tipo === 'Mano de Obra' ? (TRADES[c.trade] || TRADES.albanil) : null;
    const baseFb = t ? t.fb : c.fb;
    const fb = (t && baseFb > 0) ? r2(baseFb * fasarRatio) : baseFb;
    const name = t ? t.label : c.name;
    unresolved.push(name);
    out.push({
      clave: `EST-${String(estCounter).padStart(2, '0')}`,
      tipo: c.tipo,
      descripcion: fb > 0 ? `${name} (precio estimado)` : `${name} (sin precio: capturar)`,
      unidad: DISPLAY_UNIT[c.unit] || c.unit,
      cantidad: qty,
      costoUnitario: r2(fb || 0),
      catalogName: 'Estimado (sin coincidencia en catálogos)'
    });
  };

  for (const c of components) {
    if (c.kind === 'alt') {
      const f = lookup(index, c.primary);
      if (f) push(c.primary, f);
      else c.fallback.forEach(fc => push(fc, lookup(index, fc)));
      continue;
    }
    push(c, lookup(index, c));
  }

  // Consolidar insumos repetidos (ej. cemento del concreto + cemento del mortero)
  const merged = [];
  const map = new Map();
  for (const ins of out) {
    const key = `${ins.tipo}|${ins.clave}|${ins.descripcion}|${ins.unidad}`;
    if (map.has(key)) map.get(key).cantidad = r5(map.get(key).cantidad + ins.cantidad);
    else { map.set(key, ins); merged.push(ins); }
  }

  const totalMO = merged.filter(i => i.tipo === 'Mano de Obra').reduce((a, i) => a + i.cantidad * i.costoUnitario, 0);
  if (totalMO > 0) {
    merged.push({
      clave: 'HERR-03',
      tipo: 'Herramienta',
      descripcion: 'Herramienta menor (3% de la mano de obra)',
      unidad: '%',
      cantidad: 0.03,
      costoUnitario: r2(totalMO),
      catalogName: 'Estándar APU'
    });
  }
  return { insumos: merged, unresolved, catalogs };
}

// =============================================================================
// PASO 1: CONCEPTO SIMILAR CON MATRIZ REAL
// =============================================================================
export function conceptSignature(descripcion, unidad) {
  const d = norm(descripcion);
  const u = normUnit(unidad);
  const fam = detectFamily(d, u);
  const tk = tokens(descripcion);
  return { d, unit: u, family: fam.id, tokens: new Set(tk), specs: extractSpecs(d, fam.id), features: featureSet(d) };
}

function weightedSimilarity(a, b) {
  let inter = 0, wa = 0, wb = 0;
  const w = t => (/\d/.test(t) ? 1.5 : 1);
  a.forEach(t => { wa += w(t); if (b.has(t)) inter += w(t); });
  b.forEach(t => { wb += w(t); });
  if (wa === 0 && wb === 0) return { score: 0, dice: 0, recall: 0 };
  const dice = wa + wb === 0 ? 0 : (2 * inter) / (wa + wb);
  const recall = wa === 0 ? 0 : inter / wa;
  // Si la cobertura de lo solicitado es alta (>= 60%), combina recall y dice para no penalizar catálogos detallados
  const score = recall >= 0.6 ? (0.65 * recall + 0.35 * dice) : dice;
  return { score, dice, recall };
}

export function compareConcepts(target, cand) {
  if (target.unit !== cand.unit) return { ok: false, reason: 'unidad distinta' };
  if (target.family !== cand.family) return { ok: false, reason: 'elemento distinto' };
  let missing = 0;
  for (const k of Object.keys(target.specs)) {
    if (cand.specs[k] == null) { missing++; continue; }
    if (String(cand.specs[k]) !== String(target.specs[k])) return { ok: false, reason: `especificación distinta (${k}: ${target.specs[k]} vs ${cand.specs[k]})` };
  }
  for (const f of target.features) {
    if (!cand.features.has(f)) return { ok: false, reason: `falta componente "${f}"` };
  }
  let extra = 0;
  cand.features.forEach(f => { if (!target.features.has(f)) extra++; });
  const sim = weightedSimilarity(target.tokens, cand.tokens);
  const score = sim.score - 0.05 * missing - 0.06 * extra;
  return { ok: true, score, dice: sim.dice, recall: sim.recall, missing, extra };
}

export const SIMILARITY_THRESHOLD = 0.5;

/**
 * candidates: [{ clave, descripcion, unidad, insumos, sourceName, priority }]
 */
export function findSimilarConcept(target, candidates, threshold = SIMILARITY_THRESHOLD) {
  const sig = conceptSignature(target.descripcion, target.unidad);
  let best = null;
  for (const c of candidates || []) {
    if (!Array.isArray(c.insumos) || c.insumos.length === 0) continue;
    if (c.descripcion === target.descripcion && c.id && c.id === target.id) continue;
    if (!c._sig) c._sig = conceptSignature(c.descripcion, c.unidad);
    const cmp = compareConcepts(sig, c._sig);
    if (!cmp.ok) continue;
    let score = cmp.score;
    if (target.clave && c.clave && String(target.clave).trim() === String(c.clave).trim()) score += 0.3;
    score += (c.priority || 0) * 0.01;
    if (score >= threshold && (!best || score > best.score)) best = { concept: c, score: Math.min(1, score), dice: cmp.dice };
  }
  return best;
}

// =============================================================================
// PUNTO DE ENTRADA
// =============================================================================
/**
 * ctx: { supplyIndex, referenceConcepts }
 * Devuelve { mode:'copy'|'scratch', insumos, source?, score?, family, familyLabel, unresolved, catalogs }
 */
export function generateLocalMatrix(target, ctx) {
  const sim = findSimilarConcept(target, ctx.referenceConcepts || [], ctx.threshold);
  if (sim) {
    const insumos = JSON.parse(JSON.stringify(sim.concept.insumos)).map(i => ({
      ...i,
      cantidad: r5(i.cantidad),
      costoUnitario: r2(i.costoUnitario)
    }));
    const sig = conceptSignature(target.descripcion, target.unidad);
    return {
      mode: 'copy', insumos, source: sim.concept, score: sim.score,
      family: sig.family, unresolved: [], catalogs: new Set([sim.concept.sourceName || 'Catálogo'])
    };
  }
  const analysis = analyzeConcept(target.descripcion, target.unidad);
  const res = resolveComponents(analysis.components, ctx.supplyIndex || { byTipo: {} }, ctx.fasarFactor);
  return {
    mode: 'scratch', insumos: res.insumos, family: analysis.family, familyLabel: analysis.familyLabel,
    specs: analysis.specs, unresolved: res.unresolved, catalogs: res.catalogs
  };
}

export function matrixDirectCost(insumos) {
  return r2((insumos || []).reduce((a, i) => a + r5(i.cantidad) * r2(i.costoUnitario), 0));
}

/**
 * Convierte el JSON de un catálogo preset en lista plana de registros.
 * Soporta { items:[...] } y árboles de proyecto (Opus) con partidas -> conceptos -> insumos.
 */
export function flattenPresetData(data) {
  if (data && Array.isArray(data.items)) return data.items;
  if (!Array.isArray(data)) return [];
  const items = [];
  const seenIns = new Set();
  (function walk(nodes) {
    for (const n of nodes) {
      if (Array.isArray(n.children) && n.children.length) { walk(n.children); continue; }
      if (n.tipo === 'Partida') continue;
      const pu = n.costoDirecto ?? n.precioUnitario ?? 0;
      items.push({ clave: n.clave, descripcion: n.descripcion, unidad: n.unidad, tipo: 'Concepto', costoUnitario: pu, precioUnitario: pu, insumos: Array.isArray(n.insumos) && n.insumos.length ? n.insumos : null });
      (n.insumos || []).forEach(i => {
        const k = `${i.tipo}|${i.clave}|${i.descripcion}`;
        if (seenIns.has(k)) return;
        seenIns.add(k);
        items.push({ clave: i.clave, descripcion: i.descripcion, unidad: i.unidad, tipo: i.tipo, costoUnitario: i.costoUnitario, precioUnitario: i.costoUnitario });
      });
    }
  })(data);
  return items;
}
