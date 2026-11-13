/**
 * wordAutocorrectService.js
 * Motor de Autocorrección y Diccionario en tiempo real estilo Microsoft Word para Cubikar.
 * 
 * Características:
 * 1. Corrección automática al presionar Espacio o Puntuación:
 *    - Corrección de DOS MAyúsculas iniciales (ej: COncreto -> Concreto).
 *    - Mayúscula inicial al comienzo de frase/oración.
 *    - Tildes automáticas en palabras técnicas de construcción y español general.
 *    - Reglas morfológicas automáticas (-ción, -ería, -ísimo, etc.).
 *    - Símbolos y unidades estándar de obra (m2 -> m², m3 -> m³, cm2 -> cm²).
 * 2. Deshacer rápido con Backspace tras una autocorrección.
 * 3. Diccionario personalizado persistente (localStorage) con "Agregar al diccionario".
 * 4. Lista de palabras omitidas para la sesión.
 * 5. Generador de sugerencias ortográficas estilo Word (Levenshtein y fonética).
 * 6. Enforzador global de spellcheck nativo en todo el DOM.
 */

import { showToast } from '../ui/notifications.js';

const STORAGE_KEY_CUSTOM_DICT = 'cubikar_custom_dictionary';
const STORAGE_KEY_AUTOCORRECT_ENABLED = 'cubikar_autocorrect_enabled';

// Palabras técnicas y siglas pre-aprobadas en construcción civil y arquitectura
const DEFAULT_WHITELIST = [
  'apu', 'apus', 'neodata', 'opus', 'autocad', 'revit', 'sika', 'fester', 'cemex', 'holcim',
  'comex', 'tuboplus', 'rotoplas', 'bap', 'bae', 'pvc', 'cpvc', 'cxc', 'hdpe', 'pead',
  'fc', 'f\'c', 'kg/cm2', 'kg/cm²', 'ton/m3', 'ton/m²', 'l/seg', 'gal/min', 'btu', 'kva',
  'kw', 'hp', 'ml', 'pza', 'lote', 'tramo', 'jgo', 'viaje', 'sal', 'jor', 'hr', 'mes', 'año',
  'descimbrado', 'cimbrado', 'armado', 'habilitado', 'colado', 'vibrado', 'curado', 'plomado',
  'acuñado', 'ranurado', 'retape', 'chaflán', 'boquillado', 'emboquillado', 'apeo', 'despalme',
  'desmonte', 'sobreacarreo', 'acarreo', 'machuelo', 'brocal', 'contrahuella', 'huella', 'pretil',
  'pretiles', 'murete', 'muretes', 'dintel', 'dinteles', 'castillo', 'castillos', 'dalas',
  'cerramiento', 'cerramientos', 'enrase', 'enrases', 'entortado', 'enladrillado', 'aplanado',
  'tirol', 'tablaroca', 'durock', 'plafón', 'zoclo', 'zoclos', 'gotero', 'remate', 'remates',
  'junta', 'juntas', 'interfon', 'videoportero', 'hidroneumático', 'biodigestor', 'varilla',
  'alambrón', 'alambre', 'recocido', 'mortero', 'estuco', 'yeso', 'tabique', 'polín', 'polines',
  'puntal', 'puntales', 'tarja', 'soplete', 'soldadura', 'electrodo', 'impermeabilizante',
  'asfáltico', 'membrana', 'geotextil', 'cisterna', 'tinaco', 'flotador', 'presurizador'
];

// Tabla de reemplazos inmediatos de autocorrección (estilo Word AutoCorrect)
const AUTOCORRECT_MAP = {
  // Verbos y acciones de obra frecuentes
  'colocacion': 'colocación',
  'instalacion': 'instalación',
  'demolicion': 'demolición',
  'excavacion': 'excavación',
  'fabricacion': 'fabricación',
  'reparacion': 'reparación',
  'nivelacion': 'nivelación',
  'compactacion': 'compactación',
  'cimentacion': 'cimentación',
  'impermeabilizacion': 'impermeabilización',
  'habilitacion': 'habilitación',
  'aplicacion': 'aplicación',
  'elaboracion': 'elaboración',
  'construccion': 'construcción',
  'proteccion': 'protección',
  'ventilacion': 'ventilación',
  'alimentacion': 'alimentación',
  'sustitucion': 'sustitución',
  'perforacion': 'perforación',
  'modificacion': 'modificación',
  'verificacion': 'verificación',
  'adjudicacion': 'adjudicación',
  'estimacion': 'estimación',
  'inspeccion': 'inspección',
  'reubicacion': 'reubicación',
  'dosificacion': 'dosificación',
  'composicion': 'composición',
  'proyeccion': 'proyección',
  'fijacion': 'fijación',
  'sellado': 'sellado',
  'resanado': 'resanado',

  // Plurales de acciones
  'colocaciones': 'colocaciones',
  'instalaciones': 'instalaciones',
  'demoliciones': 'demoliciones',
  'excavaciones': 'excavaciones',
  'fabricaciones': 'fabricaciones',
  'reparaciones': 'reparaciones',
  'cimentaciones': 'cimentaciones',
  'aplicaciones': 'aplicaciones',
  'construcciones': 'construcciones',
  'perforaciones': 'perforaciones',
  'estimaciones': 'estimaciones',
  'inspecciones': 'inspecciones',

  // Oficios y especialidades
  'albanileria': 'albañilería',
  'albañileria': 'albañilería',
  'herreria': 'herrería',
  'carpinteria': 'carpintería',
  'plomeria': 'plomería',
  'cerrajeria': 'cerrajería',
  'vidrieria': 'vidriería',
  'ferreteria': 'ferretería',
  'pinturas': 'pinturas',

  // Elementos e instalaciones
  'tuberia': 'tubería',
  'tuberias': 'tuberías',
  'valvula': 'válvula',
  'valvulas': 'válvulas',
  'lampara': 'lámpara',
  'lamparas': 'lámparas',
  'angulo': 'ángulo',
  'angulos': 'ángulos',
  'lamina': 'lámina',
  'laminas': 'láminas',
  'modulo': 'módulo',
  'modulos': 'módulos',
  'diametro': 'diámetro',
  'diametros': 'diámetros',
  'area': 'área',
  'areas': 'áreas',
  'seccion': 'sección',
  'secciones': 'secciones',
  'presion': 'presión',
  'tension': 'tensión',
  'guarnicion': 'guarnición',
  'guarniciones': 'guarniciones',
  'adoquin': 'adoquín',
  'adoquines': 'adoquines',
  'chaflan': 'chaflán',
  'hormigon': 'hormigón',
  'alambron': 'alambrón',
  'polin': 'polín',
  'plafon': 'plafón',

  // Adjetivos técnicos
  'electrico': 'eléctrico',
  'electrica': 'eléctrica',
  'electricos': 'eléctricos',
  'electricas': 'eléctricas',
  'mecanico': 'mecánico',
  'mecanica': 'mecánica',
  'mecanicos': 'mecánicos',
  'mecanicas': 'mecánicas',
  'hidraulico': 'hidráulico',
  'hidraulica': 'hidráulica',
  'hidraulicos': 'hidráulicos',
  'hidraulicas': 'hidráulicas',
  'acrilico': 'acrílico',
  'acrilica': 'acrílica',
  'epoxico': 'epóxico',
  'epoxica': 'epóxica',
  'vinilico': 'vinílico',
  'vinilica': 'vinílica',
  'termico': 'térmico',
  'termica': 'térmica',
  'acustico': 'acústico',
  'acustica': 'acústica',
  'metalico': 'metálico',
  'metalica': 'metálica',
  'plastico': 'plástico',
  'plastica': 'plástica',
  'ceramico': 'cerámico',
  'ceramica': 'cerámica',
  'porcelanico': 'porcelánico',
  'optimo': 'óptimo',
  'optima': 'óptima',
  'maximo': 'máximo',
  'maxima': 'máxima',
  'minimo': 'mínimo',
  'minima': 'mínima',
  'ultimo': 'último',
  'ultima': 'última',
  'tecnico': 'técnico',
  'tecnica': 'técnica',
  'tecnicos': 'técnicos',
  'tecnicas': 'técnicas',
  'basico': 'básico',
  'basica': 'básica',
  'automatico': 'automático',
  'automatica': 'automática',
  'estandar': 'estándar',

  // Gestión de obra, metrados y presupuestos
  'codigo': 'código',
  'codigos': 'códigos',
  'especificacion': 'especificación',
  'especificaciones': 'especificaciones',
  'catalogo': 'catálogo',
  'catalogos': 'catálogos',
  'analisis': 'análisis',
  'calculo': 'cálculo',
  'calculos': 'cálculos',
  'numero': 'número',
  'numeros': 'números',
  'linea': 'línea',
  'lineas': 'líneas',
  'limite': 'límite',
  'limites': 'límites',
  'periodo': 'período',
  'politica': 'política',
  'garantia': 'garantía',
  'descripcion': 'descripción',
  'descripciones': 'descripciones',
  'observacion': 'observación',
  'observaciones': 'observaciones',
  'bitacora': 'bitácora',

  // Palabras comunes del español
  'tambien': 'también',
  'ademas': 'además',
  'despues': 'después',
  'pagina': 'página',
  'paginas': 'páginas',
  'parrafo': 'párrafo',
  'segun': 'según',
  'quiza': 'quizá',
  'quizas': 'quizás',
  'dia': 'día',
  'dias': 'días',
  'guia': 'guía',
  'guias': 'guías',
  'facil': 'fácil',
  'dificil': 'difícil',
  'util': 'útil',
  'rapido': 'rápido',
  'mas': 'más',

  // Unidades de construcción y símbolos automáticos
  'm2': 'm²',
  'm3': 'm³',
  'cm2': 'cm²',
  'cm3': 'cm³',
  'pie2': 'pie²',
  'pie3': 'pie³',
  'km2': 'km²'
};

// Palabras de diccionario base ampliado en español
const SPANISH_BASE_DICT = new Set([
  ...DEFAULT_WHITELIST,
  ...Object.values(AUTOCORRECT_MAP).map(w => w.toLowerCase()),
  'suministro', 'suministros', 'suministrar', 'mano', 'obra', 'material', 'materiales',
  'equipo', 'equipos', 'herramienta', 'herramientas', 'menor', 'seguridad', 'concepto',
  'conceptos', 'precio', 'precios', 'unitario', 'unitarios', 'presupuesto', 'partida',
  'partidas', 'importe', 'cantidad', 'unidad', 'total', 'subtotal', 'iva', 'sobrecosto',
  'concreto', 'acero', 'cemento', 'arena', 'grava', 'agua', 'madera', 'tabique', 'block',
  'ladrillo', 'yeso', 'cal', 'pintura', 'esmalte', 'impermeabilizante', 'placa', 'solera',
  'viga', 'trabe', 'columna', 'zapata', 'losa', 'firme', 'plantilla', 'muro', 'piso',
  'techo', 'cubierta', 'azotea', 'fachada', 'banqueta', 'pavimento', 'asfalto', 'tubo',
  'cople', 'codo', 'reduccion', 'reducción', 'niple', 'tuerca', 'tornillo', 'taquete',
  'anclaje', 'soldadura', 'cable', 'conductor', 'interruptor', 'tablero', 'centro',
  'carga', 'contacto', 'apagador', 'luminaria', 'foco', 'registro', 'caja', 'tapa',
  'incluye', 'incluyen', 'acarreo', 'elevacion', 'elevación', 'trazo', 'nivelacion',
  'desperdicio', 'limpieza', 'retiro', 'banco', 'obra', 'proyecto', 'plano', 'planos',
  'contratista', 'residente', 'supervisor', 'supervisión', 'avance', 'estimación',
  'finiquito', 'fianza', 'anticipo', 'amortizacion', 'amortización', 'directo', 'indirecto',
  'financiamiento', 'utilidad', 'cargos', 'adicionales', 'maquinaria', 'pesada', 'retroexcavadora',
  'revolvedora', 'compactador', 'bailarina', 'vibrador', 'camion', 'camión', 'volteo',
  'grúa', 'andamio', 'puntal', 'planta', 'corte', 'detalle', 'especificaciones', 'norma'
]);

class WordAutocorrectService {
  constructor() {
    this.customDictionary = new Set();
    this.ignoredWords = new Set();
    this.lastAutocorrectEvent = null; // Para poder revertir con Backspace
    this.enabled = true;

    this.loadCustomDictionary();
    this.loadSettings();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTOCORRECT_ENABLED);
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
    } catch (e) {
      this.enabled = true;
    }
  }

  toggleEnabled(val) {
    this.enabled = val !== undefined ? !!val : !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY_AUTOCORRECT_ENABLED, String(this.enabled));
    } catch (e) {}
    showToast(this.enabled ? 'Autocorrección estilo Word activada' : 'Autocorrección desactivada', 'info');
    return this.enabled;
  }

  loadCustomDictionary() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_DICT);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.customDictionary = new Set(parsed.map(w => w.toLowerCase().trim()));
        }
      }
    } catch (e) {
      this.customDictionary = new Set();
    }
  }

  saveCustomDictionary() {
    try {
      const arr = Array.from(this.customDictionary);
      localStorage.setItem(STORAGE_KEY_CUSTOM_DICT, JSON.stringify(arr));
    } catch (e) {}
  }

  addToDictionary(word) {
    if (!word || typeof word !== 'string') return;
    const clean = word.toLowerCase().trim();
    this.customDictionary.add(clean);
    this.saveCustomDictionary();
    showToast(`"${word}" agregada al diccionario personal`, 'success');
  }

  removeFromDictionary(word) {
    if (!word) return;
    const clean = word.toLowerCase().trim();
    this.customDictionary.delete(clean);
    this.saveCustomDictionary();
  }

  getCustomDictionary() {
    return Array.from(this.customDictionary).sort();
  }

  ignoreWord(word) {
    if (!word) return;
    this.ignoredWords.add(word.toLowerCase().trim());
  }

  isIgnored(word) {
    if (!word) return false;
    return this.ignoredWords.has(word.toLowerCase().trim());
  }

  clearIgnored() {
    this.ignoredWords.clear();
  }

  // Verifica si una palabra se considera ortográficamente válida
  isValidWord(rawWord) {
    if (!rawWord) return true;
    const word = rawWord.trim();
    if (!word || word.length <= 1) return true;

    // Números, medidas técnicas (ej: 250kg, 1/2", 12.5m), códigos con guion (PRE-001)
    if (/^[0-9]+([\.,\/][0-9]+)*$/.test(word)) return true;
    if (/^[0-9]+(\/|'|")?[a-zA-Z%²³°\/]*$/.test(word)) return true;
    if (/^[A-Z0-9_\-]+$/.test(word)) return true; // Claves en mayúsculas como CLV-01, APU1
    if (word.includes('/') || word.includes('=')) return true; // f'c=250, kg/m2

    const lower = word.toLowerCase();

    // En lista de ignorados
    if (this.ignoredWords.has(lower)) return true;

    // En diccionario de usuario
    if (this.customDictionary.has(lower)) return true;

    // En diccionario pre-aprobado
    if (SPANISH_BASE_DICT.has(lower)) return true;

    return false;
  }

  /**
   * Corrige el case respetando mayúsculas/minúsculas originales:
   * - "TODO MAYÚSCULAS" -> devuelve en MAYÚSCULAS
   * - "Tipo Oracion" -> devuelve con Mayúscula inicial
   * - "minusculas" -> devuelve en minúsculas
   */
  matchCasing(original, replacement) {
    if (!original || !replacement) return replacement;

    // Todo en mayúsculas
    if (original === original.toUpperCase() && original.length > 1) {
      return replacement.toUpperCase();
    }

    // Primera letra mayúscula
    const isFirstUpper = original.charAt(0) === original.charAt(0).toUpperCase() &&
                         original.charAt(0) !== original.charAt(0).toLowerCase();
    const isSecondLower = original.length > 1 && original.charAt(1) === original.charAt(1).toLowerCase();

    if (isFirstUpper && (isSecondLower || original.length === 1)) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }

    return replacement.toLowerCase();
  }

  /**
   * Evalúa si una palabra califica para autocorrección inmediata al teclear espacio:
   */
  getAutocorrectReplacement(rawWord, isSentenceStart = false) {
    if (!this.enabled || !rawWord || rawWord.length < 2) return null;

    // 1. Regla de Word: "Corregir DOS MAyúsculas Iniciales" (ej: COncreto -> Concreto, SUministro -> Suministro)
    if (rawWord.length >= 3 &&
        /^[A-ZÁÉÍÓÚÑ]{2}[a-záéíóúñ]+$/.test(rawWord)) {
      const fixed = rawWord.charAt(0) + rawWord.slice(1).toLowerCase();
      // Si la palabra resultante tiene un reemplazo de tildes posterior
      const mapped = AUTOCORRECT_MAP[fixed.toLowerCase()];
      if (mapped) {
        return this.matchCasing(fixed, mapped);
      }
      return fixed;
    }

    const lower = rawWord.toLowerCase();

    // 2. Mapeo directo en tabla de autocorrección
    if (AUTOCORRECT_MAP[lower]) {
      let rep = AUTOCORRECT_MAP[lower];
      // Si está al inicio de la oración, forzar mayúscula inicial
      if (isSentenceStart && rep.length > 0) {
        rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      } else {
        rep = this.matchCasing(rawWord, rep);
      }
      return rep;
    }

    // 3. Regla morfológica: Palabras que terminan en "cion" sin tilde (longitud >= 6)
    if (lower.length >= 6 && lower.endsWith('cion')) {
      const corrected = lower.slice(0, -4) + 'ción';
      let rep = this.matchCasing(rawWord, corrected);
      if (isSentenceStart) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      return rep;
    }

    // 4. Regla morfológica: Palabras que terminan en "eria" sin tilde (longitud >= 6)
    if (lower.length >= 6 && lower.endsWith('eria')) {
      const corrected = lower.slice(0, -4) + 'ería';
      let rep = this.matchCasing(rawWord, corrected);
      if (isSentenceStart) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      return rep;
    }

    // 5. Mayúscula inicial si es inicio de frase y comenzó en minúscula
    if (isSentenceStart && /^[a-záéíóúñ]/.test(rawWord)) {
      return rawWord.charAt(0).toUpperCase() + rawWord.slice(1);
    }

    return null;
  }

  /**
   * Genera sugerencias estilo Word para una palabra con posible error:
   */
  getSuggestions(rawWord) {
    if (!rawWord) return [];
    const word = rawWord.trim();
    const lower = word.toLowerCase();
    const suggestions = new Set();

    // 1. Sugerencia directa por tabla
    if (AUTOCORRECT_MAP[lower]) {
      suggestions.add(this.matchCasing(rawWord, AUTOCORRECT_MAP[lower]));
    }

    // 2. Variaciones morfológicas (-ción, -ería)
    if (lower.endsWith('cion')) {
      suggestions.add(this.matchCasing(rawWord, lower.slice(0, -4) + 'ción'));
    }
    if (lower.endsWith('eria')) {
      suggestions.add(this.matchCasing(rawWord, lower.slice(0, -4) + 'ería'));
    }

    // 3. Buscar en el diccionario base por distancia de Levenshtein (1 o 2 cambios)
    const candidates = [];
    for (const dictWord of SPANISH_BASE_DICT) {
      if (Math.abs(dictWord.length - lower.length) > 2) continue;
      const dist = this.levenshtein(lower, dictWord);
      if (dist <= 2) {
        candidates.push({ word: dictWord, dist });
      }
    }

    // Ordenar candidatos por menor distancia
    candidates.sort((a, b) => a.dist - b.dist);
    for (const c of candidates.slice(0, 4)) {
      suggestions.add(this.matchCasing(rawWord, c.word));
    }

    return Array.from(suggestions);
  }

  // Cálculo de distancia de edición (Levenshtein)
  levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // sustitución
            Math.min(
              matrix[i][j - 1] + 1,   // inserción
              matrix[i - 1][j] + 1    // eliminación
            )
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Escanea un texto completo y devuelve los errores encontrados con posición y sugerencias.
   */
  findSpellingErrorsInText(text) {
    if (!text || typeof text !== 'string') return [];

    // Separar palabras conservando índices
    const regex = /([a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\/\'\.\-]+)/g;
    const errors = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      const word = match[0];
      const start = match.index;
      const end = start + word.length;

      // Si la palabra no es válida
      if (!this.isValidWord(word)) {
        const suggestions = this.getSuggestions(word);
        errors.push({
          word,
          start,
          end,
          suggestions,
          context: this.getContextSnippet(text, start, end)
        });
      }
    }

    return errors;
  }

  // Obtiene un snippet con contexto alrededor del error
  getContextSnippet(text, start, end) {
    const pad = 35;
    const snippetStart = Math.max(0, start - pad);
    const snippetEnd = Math.min(text.length, end + pad);

    const before = (snippetStart > 0 ? '...' : '') + text.substring(snippetStart, start);
    const target = text.substring(start, end);
    const after = text.substring(end, snippetEnd) + (snippetEnd < text.length ? '...' : '');

    return { before, target, after };
  }

  /**
   * Intercepta la pulsación de teclas para realizar autocorrección al pulsar espacio o puntuación.
   */
  handleKeydown(e) {
    if (!this.enabled) return;

    const target = e.target;
    if (!target) return;

    // Solo inputs editables de texto o textareas
    const isInput = target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'search' || !target.type);
    const isTextarea = target.tagName === 'TEXTAREA';
    const isContentEditable = target.isContentEditable;

    if (!isInput && !isTextarea && !isContentEditable) return;
    if (target.readOnly || target.disabled) return;

    // Deshacer autocorrección con Backspace inmediato
    if (e.key === 'Backspace' && this.lastAutocorrectEvent) {
      const { element, originalText, cursorPosition } = this.lastAutocorrectEvent;
      if (element === target && (target.value !== undefined || isContentEditable)) {
        // Si el usuario presiona Backspace inmediatamente tras la corrección, revertimos al original
        if (target.selectionStart === cursorPosition) {
          e.preventDefault();
          if (isContentEditable) {
            target.innerText = originalText;
          } else {
            target.value = originalText;
            target.setSelectionRange(cursorPosition - 1, cursorPosition - 1);
          }
          this.lastAutocorrectEvent = null;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
      }
      this.lastAutocorrectEvent = null;
    }

    // Teclas disparadoras de Word AutoCorrect: Espacio, Enter, Punto, Coma, Punto y coma, Dos puntos
    const triggers = [' ', 'Enter', '.', ',', ';', ':', '!', '?'];
    if (!triggers.includes(e.key)) {
      this.lastAutocorrectEvent = null;
      return;
    }

    if (isContentEditable) {
      // Para contenteditable el flujo nativo maneja texto enriquecido
      return;
    }

    const value = target.value;
    const cursorPos = target.selectionStart;

    // Solo si el cursor está en un punto único (no una selección amplia)
    if (cursorPos !== target.selectionEnd) return;

    // Obtener el texto previo al cursor
    const textBefore = value.slice(0, cursorPos);
    // Extraer la última palabra completa antes del trigger
    const match = textBefore.match(/([a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\/\'\.\-]+)$/);
    if (!match) return;

    const lastWord = match[1];
    const wordStart = cursorPos - lastWord.length;

    // Determinar si es inicio de oración
    const textPreWord = textBefore.slice(0, wordStart).trim();
    const isSentenceStart = textPreWord.length === 0 || /[\.\?\!\n]\s*$/.test(textPreWord);

    const replacement = this.getAutocorrectReplacement(lastWord, isSentenceStart);
    if (!replacement || replacement === lastWord) return;

    // Registrar para posible Backspace
    const triggerChar = e.key === 'Enter' ? '\n' : e.key;
    const originalFullValue = value;

    // Realizar el reemplazo manteniendo la tecla pulsada
    e.preventDefault();

    const newValue = value.slice(0, wordStart) + replacement + triggerChar + value.slice(cursorPos);
    target.value = newValue;

    const newCursorPos = wordStart + replacement.length + triggerChar.length;
    target.setSelectionRange(newCursorPos, newCursorPos);

    this.lastAutocorrectEvent = {
      element: target,
      originalText: originalFullValue,
      cursorPosition: newCursorPos
    };

    // Disparar eventos para que los bindings reactivos del proyecto se enteren
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Configura atributos nativos de spellcheck en un elemento
   */
  enforceElementSpellcheck(el) {
    if (!el || el.dataset?.spellcheckConfigured === 'true') return;

    const isText = (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || !el.type)) ||
                   el.tagName === 'TEXTAREA' ||
                   el.isContentEditable;

    if (isText) {
      el.spellcheck = true;
      el.setAttribute('spellcheck', 'true');
      el.setAttribute('autocorrect', 'on');
      el.setAttribute('autocapitalize', 'sentences');
      el.setAttribute('lang', 'es');
      el.dataset.spellcheckConfigured = 'true';
    }
  }

  /**
   * Inicialización global del observador y escuchas de eventos
   */
  initGlobalObserver() {
    // 1. Escuchar pulsaciones de teclas para autocorrección estilo Word
    document.addEventListener('keydown', (e) => this.handleKeydown(e), true);

    // 2. Interceptar foco para asegurar atributos de ortografía
    document.addEventListener('focusin', (e) => {
      if (e.target) this.enforceElementSpellcheck(e.target);
    }, true);

    // 3. Aplicar de inmediato a todos los inputs existentes
    document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]').forEach(el => {
      this.enforceElementSpellcheck(el);
    });

    // 4. Observar mutaciones dinámicas (al desplegar nodos, modales, etc.)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && node.matches('input, textarea, [contenteditable]')) {
                this.enforceElementSpellcheck(node);
              }
              const childInputs = node.querySelectorAll ? node.querySelectorAll('input, textarea, [contenteditable]') : [];
              childInputs.forEach(el => this.enforceElementSpellcheck(el));
            }
          });
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // 5. Interceptar atajo de teclado F7 estilo Microsoft Word
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F7') {
        e.preventDefault();
        if (typeof window.openSpellCheckModal === 'function') {
          window.openSpellCheckModal();
        }
      }
    });
  }
}

// Instancia singleton compartida
export const wordAutocorrectService = new WordAutocorrectService();
