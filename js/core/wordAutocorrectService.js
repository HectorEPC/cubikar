/**
 * wordAutocorrectService.js
 * Motor de Ortografía, Autocorrección y Diccionario en tiempo real estilo Microsoft Word para Cubikar.
 * 
 * Características:
 * 1. Subrayado rojo ondulado en tiempo real en descripciones de conceptos e insumos APU.
 * 2. Menú contextual flotante al hacer clic derecho sobre cualquier palabra con error:
 *    - Sugerencias inmediatas ordenadas por similitud fonética y distancia de edición.
 *    - Reemplazo instantáneo al hacer clic en una sugerencia.
 *    - Opción de corrección manual directa en el menú si no hay sugerencia automática.
 *    - "Omitir palabra" para ignorar en la sesión.
 *    - "Agregar al diccionario" con persistencia en localStorage.
 * 3. Menú contextual estándar preservado si se hace clic derecho en palabras correctas.
 * 4. Autocorrección rápida al teclear espacio/puntuación (COncreto -> Concreto, m2 -> m², tildes técnicas).
 * 5. Deshacer con Backspace inmediato.
 * 6. Diccionario ultra-amplio de español general, construcción civil, arquitectura, instalaciones y marcas.
 * 7. Regla de excepción inteligente: cotas, códigos, dimensiones y especificaciones con números nunca se marcan como error.
 */

import { showToast } from '../ui/notifications.js';

const STORAGE_KEY_CUSTOM_DICT = 'cubikar_custom_dictionary';
const STORAGE_KEY_AUTOCORRECT_ENABLED = 'cubikar_autocorrect_enabled';

// Marcas y siglas pre-aprobadas en construcción, arquitectura e instalaciones en México / Latam
const DEFAULT_WHITELIST = [
  // Software y sistemas
  'apu', 'apus', 'neodata', 'opus', 'autocad', 'revit', 'cubikar', 'excel', 'word',
  // Marcas de materiales y tuberías
  'cemex', 'holcim', 'cruz', 'azul', 'moctezuma', 'apaxco', 'tolteca', 'calidra', 'calhidra',
  'comex', 'fester', 'festerbond', 'sika', 'imperquimia', 'tuboplus', 'rotoplas', 'cytsa',
  'bticino', 'square', 'dexter', 'cresco', 'moen', 'interceramic', 'porcelanite', 'vinimex',
  'dolphin', 'igesa', 'vantagio', 'anger', 'leflam', 'magnum', 'smar', 'surface', 'truper',
  'urrea', 'helvex', 'dica', 'deacero', 'ternium', 'austromex', 'bellota', 'pretul', 'bosch',
  'makita', 'dewalt', 'milwaukee', 'hilti', 'stanley', 'irwin', 'klein', 'copperweld',
  // Normas y dependencias
  'cfe', 'nom', 'nmx', 'imss', 'infonavit', 'sat', 'sedatu', 'invea', 'semarnat', 'stps',
  // Abreviaturas técnicas de planos e instalaciones
  'p.b', 'p.a', 'p.d', 'p.g', 'l.p', 'r.n', 'bap', 'bae', 'pvc', 'cpvc', 'cxc', 'hdpe', 'pead',
  'pp-r', 'pe-al-pe', 'pvc-ha', 'pvc-sa', 'pvc-sc', 'thw', 'thhn', 'ptr', 'ipr', 'ips', 'hss',
  'fc', 'f\'c', 'kg/cm2', 'kg/cm²', 'ton/m3', 'ton/m²', 'l/seg', 'gal/min', 'btu', 'kva', 'kw',
  'hp', 'psi', 'bar', 'rpm', 'hz', 'volts', 'amp', 'amperes', 'watts',
  // Unidades de catálogo
  'ml', 'm2', 'm²', 'm3', 'm³', 'cm', 'cm2', 'cm²', 'cm3', 'cm³', 'mm', 'mts', 'lt', 'lts',
  'litros', 'kg', 'kgs', 'ton', 'tons', 'pza', 'pzas', 'pzo', 'lote', 'lotes', 'tramo', 'tramos',
  'jgo', 'juegos', 'viaje', 'viajes', 'sal', 'salidas', 'jor', 'jornadas', 'hr', 'hrs', 'horas',
  'mes', 'meses', 'año', 'años', 'dia', 'dias', 'día', 'días', 'no.', 'núm.', 'num.', 'c/u',
  's/n', 'cal', 'calibre', 'cd', 'ced', 'cedula', 'cédula', 'mod', 'cat', 'kit', 'rd', 'acc',
  'diam', 'ag.max', 'r/int', 'fo', 'go', 'ye', 'uv', 'temp',
  // Notaciones romanas comunes en planos
  'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix'
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
  'preparacion': 'preparación',
  'incorporacion': 'incorporación',
  'extraccion': 'extracción',
  'elevacion': 'elevación',
  'conduccion': 'conducción',
  'contaminacion': 'contaminación',
  'certificacion': 'certificación',
  'senalizacion': 'señalización',
  'senalamiento': 'señalamiento',
  'alineacion': 'alineación',
  'termofusion': 'termofusión',
  'dilatacion': 'dilatación',
  'expansion': 'expansión',
  'retape': 'retape',
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
  'conexiones': 'conexiones',
  'secciones': 'secciones',
  'guarniciones': 'guarniciones',
  'adoquines': 'adoquines',

  // Oficios y especialidades
  'albanil': 'albañil',
  'albaniles': 'albañiles',
  'albanileria': 'albañilería',
  'albañileria': 'albañilería',
  'herreria': 'herrería',
  'carpinteria': 'carpintería',
  'canceleria': 'cancelería',
  'plomeria': 'plomería',
  'cerrajeria': 'cerrajería',
  'vidrieria': 'vidriería',
  'ferreteria': 'ferretería',
  'mamposteria': 'mampostería',

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
  'presion': 'presión',
  'tension': 'tensión',
  'guarnicion': 'guarnición',
  'adoquin': 'adoquín',
  'chaflan': 'chaflán',
  'hormigon': 'hormigón',
  'alambron': 'alambrón',
  'polin': 'polín',
  'plafon': 'plafón',
  'pison': 'pisón',
  'tapon': 'tapón',
  'tapones': 'tapones',
  'desague': 'desagüe',
  'estacion': 'estación',
  'reventon': 'reventón',
  'liquido': 'líquido',
  'liquidos': 'líquidos',
  'camion': 'camión',
  'camiones': 'camiones',

  // Adjetivos técnicos y matemáticos
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
  'asfaltico': 'asfáltico',
  'asfaltica': 'asfáltica',
  'topografico': 'topográfico',
  'topografica': 'topográfica',
  'ecologico': 'ecológico',
  'ecologica': 'ecológica',
  'domestico': 'doméstico',
  'domestica': 'doméstica',
  'anticalcareo': 'anticalcáreo',
  'centrifuga': 'centrífuga',
  'comun': 'común',
  'desertico': 'desértico',
  'electrolitico': 'electrolítico',
  'monofasica': 'monofásica',
  'excentrica': 'excéntrica',
  'retractil': 'retráctil',

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
  'razon': 'razón',

  // Unidades de construcción y símbolos automáticos
  'm2': 'm²',
  'm3': 'm³',
  'cm2': 'cm²',
  'cm3': 'cm³',
  'pie2': 'pie²',
  'pie3': 'pie³',
  'km2': 'km²'
};

// Diccionario base exhaustivo de español general y construcción civil
const SPANISH_BASE_DICT = new Set([
  ...DEFAULT_WHITELIST,
  ...Object.values(AUTOCORRECT_MAP).map(w => w.toLowerCase()),

  // Gramática, conectores, preposiciones y artículos
  'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'durante', 'en', 'entre',
  'hacia', 'hasta', 'mediante', 'para', 'por', 'según', 'segun', 'sin', 'so', 'sobre', 'tras',
  'versus', 'vía', 'via', 'y', 'e', 'ni', 'o', 'u', 'pero', 'mas', 'más', 'sino', 'siquiera',
  'aunque', 'porque', 'pues', 'ya', 'si', 'sí', 'como', 'cómo', 'que', 'qué', 'conforme',
  'mientras', 'cuando', 'cuándo', 'donde', 'dónde', 'quien', 'quién', 'cual', 'cuál',
  'el', 'la', 'los', 'las', 'lo', 'un', 'una', 'uno', 'unos', 'unas', 'del', 'al',
  'este', 'esta', 'estos', 'estas', 'esto', 'ese', 'esa', 'esos', 'esas', 'eso',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'aquello', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'nuestro', 'nuestra', 'nuestros', 'nuestras', 'cuyo', 'cuya', 'cuyos', 'cuyas',
  'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'mismos', 'mismas',
  'todo', 'toda', 'todos', 'todas', 'cada', 'cierto', 'cierta', 'ciertos', 'ciertas',
  'tal', 'tales', 'tanto', 'tanta', 'tantos', 'tantas', 'mucho', 'mucha', 'muchos', 'muchas',
  'poco', 'poca', 'pocos', 'pocas', 'bastante', 'bastantes', 'demasiado', 'demasiada',
  'alguno', 'alguna', 'algunos', 'algunas', 'algún', 'ninguno', 'ninguna', 'ningún',
  'ambos', 'ambas', 'propio', 'propia', 'propios', 'propias',
  'yo', 'tú', 'él', 'ella', 'ello', 'nosotros', 'nosotras', 'ellos', 'ellas', 'usted', 'ustedes',
  'me', 'te', 'se', 'nos', 'le', 'les',

  // Adverbios comunes
  'no', 'ya', 'menos', 'bien', 'mal', 'muy', 'tan', 'así', 'asi',
  'acá', 'aca', 'aquí', 'aqui', 'allí', 'alli', 'allá', 'alla', 'ahí', 'ahi',
  'cerca', 'lejos', 'arriba', 'abajo', 'delante', 'detrás', 'detras', 'dentro', 'fuera',
  'antes', 'después', 'despues', 'luego', 'pronto', 'tarde', 'temprano', 'siempre', 'nunca',
  'jamás', 'jamas', 'apenas', 'casi', 'solo', 'sólo', 'solamente', 'también', 'tambien',
  'además', 'ademas', 'tampoco', 'entonces', 'inclusive', 'incluso',

  // Verbos de acción técnica y español común (infinitivo, participio, gerundio y conjugaciones)
  'hacer', 'hace', 'hacen', 'hizo', 'hecho', 'hecha', 'hechos', 'hechas', 'haciendo',
  'tener', 'tiene', 'tienen', 'tuvo', 'tenido', 'teniendo',
  'ser', 'es', 'son', 'era', 'eran', 'fue', 'fueron', 'será', 'sera', 'serán', 'sido', 'siendo',
  'estar', 'está', 'están', 'estaba', 'estaban', 'estuvo', 'estado', 'estados', 'estando',
  'haber', 'hay', 'había', 'habia', 'hubo', 'habrá', 'habra',
  'dar', 'da', 'dan', 'dio', 'dado', 'dada', 'dados', 'dadas', 'dando',
  'ir', 'va', 'van', 'iba', 'ido',
  'ver', 've', 'ven', 'vio', 'visto', 'vista', 'vistos', 'vistas',
  'poder', 'puede', 'pueden', 'pudo', 'podrá', 'podra', 'podido',
  'deber', 'debe', 'deben', 'debió', 'debido', 'debida', 'debidos', 'debidas',
  'poner', 'pone', 'ponen', 'puso', 'puesto', 'puesta', 'puestos', 'puestas',
  'llevar', 'lleva', 'llevan', 'llevó', 'llevado', 'llevada', 'llevados', 'llevadas', 'llevando',
  'quedar', 'queda', 'quedan', 'quedó', 'quedado', 'quedada',
  'pasar', 'pasa', 'pasan', 'pasó', 'pasado', 'pasada', 'pasados', 'pasadas',
  'usar', 'usa', 'usan', 'usó', 'usado', 'usada', 'usados', 'usadas', 'usando',
  'utilizar', 'utiliza', 'utilizan', 'utilizó', 'utilizado', 'utilizada', 'utilizados', 'utilizadas', 'utilizando',
  'seguir', 'sigue', 'siguen', 'seguido',
  'dejar', 'deja', 'dejan', 'dejado',
  'terminar', 'termina', 'terminan', 'terminó', 'terminado', 'terminada', 'terminados', 'terminadas',
  'presentar', 'presenta', 'presentan', 'presentado', 'presentada', 'presentados', 'presentadas',
  'considerar', 'considera', 'consideran', 'considerado', 'considerada', 'considerados', 'consideradas',
  'requerir', 'requiere', 'requieren', 'requerido', 'requerida', 'requeridos', 'requeridas',
  'cumplir', 'cumple', 'cumplen', 'cumplido', 'cumplida',
  'abrir', 'abre', 'abren', 'abierto', 'abierta', 'abiertos', 'abiertas',
  'cerrar', 'cierra', 'cierran', 'cerrado', 'cerrada', 'cerrados', 'cerradas',
  'incluir', 'incluye', 'incluyen', 'incluyó', 'incluido', 'incluida', 'incluidos', 'incluidas', 'incluyendo',
  'suministrar', 'suministro', 'suministros', 'suministra', 'suministran', 'suministró', 'suministrado', 'suministrada', 'suministrados', 'suministradas', 'suministrando',
  'colocar', 'colocación', 'coloca', 'colocan', 'colocó', 'colocado', 'colocada', 'colocados', 'colocadas', 'colocando',
  'instalar', 'instalación', 'instalaciones', 'instala', 'instalan', 'instaló', 'instalado', 'instalada', 'instalados', 'instaladas', 'instalando',
  'aplicar', 'aplicación', 'aplicaciones', 'aplica', 'aplican', 'aplicó', 'aplicado', 'aplicada', 'aplicados', 'aplicadas', 'aplicando',
  'elaborar', 'elaboración', 'elabora', 'elaboran', 'elaboró', 'elaborado', 'elaborada', 'elaborados', 'elaboradas',
  'fabricar', 'fabricación', 'fabrica', 'fabrican', 'fabricó', 'fabricado', 'fabricada', 'fabricados', 'fabricadas',
  'construir', 'construcción', 'construcciones', 'construye', 'construyen', 'construyó', 'construido', 'construida', 'construidos', 'construidas',
  'ejecutar', 'ejecución', 'ejecuta', 'ejecutan', 'ejecutó', 'ejecutado', 'ejecutada', 'ejecutados', 'ejecutadas',
  'reparar', 'reparación', 'reparaciones', 'repara', 'reparan', 'reparado', 'reparada',
  'nivelar', 'nivelación', 'nivela', 'nivelan', 'niveló', 'nivelado', 'nivelada', 'nivelados', 'niveladas',
  'compactar', 'compactación', 'compacta', 'compactan', 'compactó', 'compactado', 'compactada',
  'excavar', 'excavación', 'excavaciones', 'excava', 'excavan', 'excavó', 'excavado', 'excavada',
  'demoler', 'demolición', 'demoliciones', 'demuele', 'demuelen', 'demolió', 'demolido', 'demolida', 'demolidos', 'demolidas',
  'acarrear', 'acarreo', 'acarreos', 'acarrea', 'acarrean', 'acarreado',
  'desalojar', 'desaloja', 'desalojo',
  'retirar', 'retiro', 'retiros', 'retira', 'retiran', 'retiró', 'retirado', 'retirada',
  'limpiar', 'limpieza', 'limpia', 'limpian', 'limpió', 'limpiado', 'limpiada',
  'habilitar', 'habilitado', 'habilitada', 'habilitados', 'habilitadas', 'habilita', 'habilitan',
  'armar', 'armado', 'armada', 'armados', 'armadas', 'arma', 'arman',
  'cimbrar', 'cimbrado', 'cimbrada', 'cimbra', 'cimbras',
  'descimbrar', 'descimbrado', 'descimbra',
  'colar', 'colado', 'colada', 'colados', 'coladas', 'cola', 'colan',
  'vibrar', 'vibrado', 'vibra', 'vibran',
  'curar', 'curado', 'cura', 'curan',
  'plomar', 'plomado', 'ploma',
  'ranurar', 'ranurado', 'ranurada', 'ranura', 'ranuras',
  'resanar', 'resanado', 'resanada', 'resana',
  'sellar', 'sellado', 'sellada', 'sellados', 'selladas', 'sella', 'sellador', 'selladores',
  'pintar', 'pintado', 'pintada', 'pintados', 'pintadas', 'pinta', 'pintura', 'pinturas',
  'verificar', 'verificación', 'verifica', 'verifican', 'verificado', 'verificada',
  'revisar', 'revisa', 'revisan', 'revisado', 'revisada',
  'conectar', 'conexión', 'conexiones', 'conecta', 'conectan', 'conectado', 'conectada', 'conectados', 'conectadas',
  'proteger', 'protección', 'protege', 'protegen', 'protegido', 'protegida', 'protegidos', 'protegidas',
  'cubrir', 'cubre', 'cubren', 'cubierto', 'cubierta', 'cubiertos', 'cubiertas',
  'apisonar', 'apisonado', 'apisonada', 'apisona',
  'adherir', 'adherencia', 'adhiere', 'adherido', 'adherida',
  'alinear', 'alineación', 'alinea', 'alineado', 'alineada',
  'afinar', 'afine', 'afinado', 'afina',
  'asentar', 'asentado', 'asentada', 'asentados', 'asentadas', 'asienta',
  'empotrar', 'empotrado', 'empotrada', 'empotra',
  'alojar', 'alojado', 'alojada', 'aloja',
  'fijar', 'fijación', 'fijado', 'fijada', 'fijados', 'fijadas', 'fija', 'fijo', 'fijas', 'fijos',
  'ensamblar', 'ensamblado', 'ensamblada',
  'soldar', 'soldadura', 'soldaduras', 'soldado', 'soldada', 'soldados', 'soldadas', 'suelda',
  'atornillar', 'atornillado', 'atornillada',
  'anclar', 'anclaje', 'anclajes', 'anclado', 'anclada', 'ancla', 'anclas',
  'llenar', 'llenado', 'llena', 'llenan',
  'vaciar', 'vaciado', 'vaciada',
  'desmontar', 'desmonte', 'desmontes', 'desmonta', 'desmontado',
  'despalmar', 'despalme', 'despalmes', 'despalma', 'despalmado',
  'cortar', 'corte', 'cortes', 'corta', 'cortan', 'cortado', 'cortada',
  'doblar', 'doblez', 'doblado', 'doblada',
  'amarrar', 'amarre', 'amarres', 'amarrado', 'amarrada',
  'traslapar', 'traslape', 'traslapes', 'traslapado',
  'dosificar', 'dosificación', 'dosificado', 'dosificada',

  // Vocabulario completo de materiales, elementos y conceptos de obra
  'necesario', 'necesaria', 'necesarios', 'necesarias',
  'correcto', 'correcta', 'correctos', 'correctas',
  'completo', 'completa', 'completos', 'completas',
  'directo', 'directa', 'directos', 'directas',
  'indirecto', 'indirecta', 'indirectos', 'indirectas',
  'general', 'generales', 'particular', 'particulares',
  'específico', 'especifica', 'específica', 'específicos', 'específicas',
  'indicado', 'indicada', 'indicados', 'indicadas',
  'aparente', 'aparentes', 'rústico', 'rustico', 'liso', 'lisa', 'lisos', 'lisas',
  'pulido', 'pulida', 'pulidos', 'pulidas', 'acabado', 'acabados',
  'fino', 'fina', 'finos', 'finas', 'grueso', 'gruesa', 'gruesos', 'gruesas',
  'firme', 'firmes', 'pesado', 'pesada', 'ligero', 'ligera',
  'alto', 'alta', 'altos', 'altas', 'altura', 'alturas',
  'bajo', 'baja', 'bajos', 'bajas', 'ancho', 'ancha', 'anchos', 'anchas', 'anchura',
  'largo', 'larga', 'largos', 'largas', 'longitud', 'longitudes',
  'espesor', 'espesores', 'diámetro', 'diámetros',
  'sección', 'secciones', 'calibre', 'calibres', 'cédula',
  'norma', 'normas', 'normal', 'normales', 'proyecto', 'proyectos', 'obra', 'obras',
  'sitio', 'sitios', 'plano', 'planos', 'croquis', 'detalle', 'detalles',
  'planta', 'plantas', 'fachada', 'fachadas', 'especificación', 'especificaciones',
  'concepto', 'conceptos', 'partida', 'partidas', 'catálogo', 'catálogos',
  'matriz', 'matrices', 'precio', 'precios', 'unitario', 'unitarios',
  'presupuesto', 'presupuestos', 'importe', 'importes', 'cantidad', 'cantidades',
  'unidad', 'unidades', 'costo', 'costos', 'total', 'totales', 'subtotal', 'subtotales',
  'iva', 'sobrecosto', 'sobrecostos', 'financiamiento', 'utilidad',
  'fianza', 'fianzas', 'anticipo', 'anticipos', 'estimación', 'estimaciones',
  'generador', 'generadores', 'número', 'números', 'clave', 'claves', 'código', 'códigos',
  'descripción', 'descripciones', 'tipo', 'tipos', 'marca', 'marcas', 'modelo', 'modelos',
  'serie', 'series', 'línea', 'líneas', 'color', 'colores',
  'peso', 'pesos', 'volumen', 'área', 'áreas', 'superficie', 'superficies',
  'capacidad', 'capacidades', 'resistencia', 'resistencias',
  'presión', 'tensión', 'temperatura', 'temperaturas', 'tiempo', 'tiempos', 'plazo', 'plazos',
  'fecha', 'fechas', 'semana', 'semanas', 'banco', 'tiro',
  'material', 'materiales', 'insumo', 'insumos', 'mano', 'manos',
  'equipo', 'equipos', 'herramienta', 'herramientas', 'menor', 'menores',
  'seguridad', 'protección', 'maquinaria', 'andamio', 'andamios', 'puntal', 'puntales',
  'cimbra', 'cimbras', 'madera', 'maderas', 'polín', 'polines', 'barrote', 'barrotes',
  'tabla', 'tablas', 'tablón', 'tablones', 'triplay', 'duela', 'duelas', 'tarima', 'tarimas',
  'concreto', 'concretos', 'premezclado', 'cemento', 'cementos', 'arena', 'grava', 'agua',
  'cal', 'yeso', 'estuco', 'aditivo', 'aditivos', 'acelerante', 'retardante',
  'impermeabilizante', 'impermeabilizantes',
  'acero', 'aceros', 'refuerzo', 'estructural', 'estructurales',
  'varilla', 'varillas', 'corrugada', 'corrugadas',
  'alambrón', 'alambre', 'recocido', 'malla', 'electrosoldada', 'electrodo', 'electrodos',
  'placa', 'placas', 'solera', 'soleras', 'ángulo', 'ángulos', 'canal', 'canales',
  'viga', 'vigas', 'perfil', 'perfiles', 'trabe', 'trabes', 'liga',
  'cerramiento', 'cerramientos', 'columna', 'columnas', 'castillo', 'castillos', 'armex',
  'dala', 'dalas', 'cadena', 'cadenas', 'zapata', 'zapatas', 'losa', 'losas',
  'firme', 'firmes', 'plantilla', 'plantillas', 'muro', 'muros', 'carga', 'divisorio', 'divisorios', 'contención',
  'tabique', 'tabiques', 'tabicón', 'block', 'blocks', 'bloque', 'bloques', 'ladrillo', 'ladrillos', 'hueco', 'huecos', 'macizo', 'macizos',
  'piso', 'pisos', 'pavimento', 'pavimentos', 'asfalto', 'adoquín', 'adoquines',
  'banqueta', 'banquetas', 'guarnición', 'guarniciones', 'machuelo', 'machuelos',
  'techo', 'techos', 'cubierta', 'cubiertas', 'azotea', 'azoteas',
  'plafón', 'plafones', 'tablaroca', 'durock', 'panel', 'paneles',
  'zoclo', 'zoclos', 'rodapié', 'gotero', 'goteros', 'chaflán', 'chaflanes',
  'pretil', 'pretiles', 'murete', 'muretes', 'dintel', 'dinteles', 'enrase', 'enrases',
  'entortado', 'enladrillado', 'aplanado', 'aplanados', 'tirol',
  'tubo', 'tubos', 'tubería', 'tuberías', 'cobre', 'codo', 'codos', 'cople', 'coples',
  'reducción', 'reducciones', 'tee', 'niple', 'niples', 'tuerca', 'tuercas',
  'tornillo', 'tornillos', 'taquete', 'taquetes', 'perno', 'pernos',
  'válvula', 'válvulas', 'llave', 'llaves', 'grifo', 'grifos',
  'bomba', 'bombas', 'cisterna', 'cisternas', 'tinaco', 'tinacos', 'tanque', 'tanques',
  'flotador', 'flotadores', 'presurizador', 'hidroneumático', 'biodigestor',
  'tarja', 'tarjas', 'lavabo', 'lavabos', 'lavadero', 'lavaderos',
  'inodoro', 'inodoros', 'mingitorio', 'mingitorios',
  'regadera', 'regaderas', 'coladera', 'coladeras', 'cespol',
  'cable', 'cables', 'conductor', 'conductores',
  'interruptor', 'interruptores', 'termomagnético', 'termomagnéticos', 'pastilla', 'pastillas',
  'tablero', 'tableros', 'contacto', 'contactos', 'duplex', 'apagador', 'apagadores',
  'luminaria', 'luminarias', 'foco', 'focos', 'lámpara', 'lámparas', 'led',
  'registro', 'registros', 'caja', 'cajas', 'chalupa', 'chalupas', 'tapa', 'tapas', 'tapón', 'tapones',
  'cancelería', 'aluminio', 'vidrio', 'vidrios', 'cristal', 'cristales', 'espejo', 'espejos',
  'puerta', 'puertas', 'ventana', 'ventanas', 'marco', 'marcos', 'chapa', 'chapas', 'cerradura', 'cerraduras',
  'bisagra', 'bisagras', 'jaladera', 'jaladeras',
  'herrería', 'reja', 'rejas', 'barandal', 'barandales', 'pasamanos',
  'carpintería', 'closet', 'closets', 'mueble', 'muebles',
  'esmalte', 'esmaltes', 'azulejo', 'azulejos', 'loseta', 'losetas', 'cerámica', 'porcelanato',
  'mármol', 'granito', 'cantera', 'pegazulejo', 'boquilla', 'boquillas', 'junteador',
  'membrana', 'geotextil', 'retroexcavadora', 'revolvedora', 'bailarina', 'vibrador', 'compactador',
  'oficial', 'ayudante', 'ayudantes', 'peón', 'peones', 'cuadrilla', 'cuadrillas', 'cabo',
  'residente', 'supervisor', 'supervisión', 'ingeniero', 'arquitecto', 'contratista',
  'abrazadera', 'abrazaderas', 'acometida', 'acometidas', 'acomodo', 'acopio', 'acoplador',
  'adaptador', 'adaptadores', 'afine', 'agarradera', 'agregado', 'agregados', 'ajustable', 'alargado',
  'alimenticio', 'alineación', 'anticalcáreo', 'anticorrosivo', 'bajada', 'bajadas',
  'balanceada', 'barreras', 'bastidor', 'bastidores', 'bicapa', 'blanco', 'blanca', 'blancos', 'blancas',
  'bloquera', 'bronce', 'calentador', 'calentadores', 'caoba', 'capa', 'capas', 'cara', 'caras',
  'carretilla', 'carretillas', 'cebolleta', 'cedro', 'cementada', 'cementar', 'centrífuga',
  'cepa', 'cepas', 'certificación', 'certificada', 'certificadas', 'cimientos', 'claro', 'claros',
  'conducción', 'conduit', 'condulet', 'conector', 'conectores', 'contaminación', 'contramarco', 'contramarcos',
  'corrediza', 'corredizas', 'costeras', 'cromo', 'cuadro', 'cuadros', 'cuerpo', 'cuerpos',
  'desagüe', 'descarga', 'descargas', 'descargo', 'desenraice', 'desértico', 'desnudo', 'desnuda', 'desplante',
  'dimensionamiento', 'distancia', 'distancias', 'doble', 'dobles', 'doméstico', 'domiciliaria',
  'ecológica', 'eje', 'ejes', 'electrolítico', 'escalerilla', 'especializada', 'especializadas',
  'estación', 'estacionario', 'estribo', 'estribos', 'estructura', 'estructuras', 'excéntrica',
  'exteriores', 'filtro', 'filtros', 'flexible', 'flexibles', 'flotador', 'flujo',
  'forrada', 'frecuencia', 'fregadero', 'fregaderos', 'fusible', 'fusibles',
  'galvanizado', 'galvanizada', 'galvanizados', 'galvanizadas', 'gas', 'grado', 'grados',
  'gris', 'grises', 'hembra', 'hembras', 'hierro', 'hilada', 'hiladas', 'horizontal', 'horizontales',
  'impulsor', 'indicador', 'indicadores', 'industrial', 'industriales', 'inoxidable', 'inoxidables',
  'integrado', 'integrada', 'interior', 'interiores', 'líquido', 'líquidos',
  'lubricación', 'macho', 'machos', 'maestra', 'maestras', 'mampostería', 'maneral', 'manerales',
  'manguera', 'mangueras', 'medición', 'medida', 'medidas', 'medidor', 'medidores', 'mejorar',
  'mezcla', 'mezclas', 'mezcladora', 'mezcladoras', 'minuto', 'minutos', 'mirilla',
  'monofásica', 'monomando', 'mordazas', 'mufa', 'mufas', 'multicapa', 'nariz',
  'natural', 'naturales', 'negro', 'negra', 'negros', 'negras', 'nicho', 'nichos',
  'omega', 'omegas', 'orión', 'ostión', 'pala', 'palas', 'paño', 'paños', 'paso', 'pasos',
  'piedra', 'piedras', 'pino', 'pisón', 'polarizado', 'polietileno', 'polipropileno', 'polos',
  'potencia', 'preliminar', 'preliminares', 'profundidad', 'proporción',
  'razón', 'recta', 'recto', 'rectos', 'rectas', 'red', 'redes', 'redondo', 'redonda', 'redondos', 'redondas',
  'referencia', 'referencias', 'reforzado', 'reforzada', 'reforzados', 'reforzadas',
  'regulador', 'reguladores', 'rejilla', 'rejillas', 'relleno', 'rellenos', 'rendimiento',
  'resina', 'resinas', 'retráctil', 'revenimiento', 'reventón', 'roca', 'rocas', 'rojo', 'roja', 'rojos', 'rojas',
  'rugoso', 'rugosa', 'sanitaria', 'sanitario', 'sanitarias', 'sanitarios', 'seca', 'seco', 'secas', 'secos', 'secado',
  'semi', 'sencilla', 'sencillo', 'sencillas', 'sencillos', 'sentido', 'sentidos',
  'señalización', 'señalamiento', 'servicio', 'servicios', 'sistema', 'sistemas',
  'tala', 'talud', 'taludes', 'taza', 'tazas', 'tepetate', 'termofusión', 'termofusionable', 'termoplástica',
  'terreno', 'terrenos', 'tierra', 'tierras', 'urbana', 'urbano', 'uso', 'usos',
  'velocidad', 'verde', 'verdes',
  // Términos esenciales de construcción y números
  'accesorios', 'agreg', 'apile', 'artic', 'base', 'bases', 'bastidor', 'bastidores', 'brasa',
  'centro', 'centros', 'comercial', 'comerciales', 'cualquier', 'cualquiera', 'dimension', 'dimensión',
  'dimensiones', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'veinte', 'treinta', 'cien', 'mil',
  'emboquillado', 'emboquillados', 'estableciendo', 'explora', 'fondo', 'fondos', 'lieresa',
  'mexicana', 'mexicano', 'mexicanas', 'mexicanos', 'perfectamente', 'plus', 'principal',
  'principales', 'senso', 'tratamiento', 'tratamientos', 'unido', 'unida', 'unidos', 'unidas',
  'universal', 'universales', 'zona', 'zonas', 'pieza', 'piezas', 'puente', 'puentes', 'rampa', 'rampas',
  'juego', 'juntas', 'lado', 'lados', 'llana', 'llanas', 'min', 'mortero', 'morteros', 'nivel', 'niveles',
  'pie', 'pies', 'producto', 'productos', 'prueba', 'pruebas', 'roza', 'salida', 'salidas', 'toma', 'tomas',
  'top', 'trabajo', 'trabajos', 'trazo', 'trazos', 'volteo', 'angular', 'angulares', 'expuesta', 'expuestas',
  'expuesto', 'expuestos', 'posi', 'li'
]);

class WordAutocorrectService {
  constructor() {
    this.customDictionary = new Set();
    this.ignoredWords = new Set();
    this.lastAutocorrectEvent = null;
    this.enabled = true;
    this.highlightedElements = new Set();
    this.activeContextMenu = null;

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
    showToast(this.enabled ? 'Corrector ortográfico activado' : 'Corrector ortográfico desactivado', 'info');
    this.refreshHighlighters();
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
    this.refreshHighlighters();
    showToast(`"${word}" agregada al diccionario personal`, 'success');
  }

  removeFromDictionary(word) {
    if (!word) return;
    const clean = word.toLowerCase().trim();
    this.customDictionary.delete(clean);
    this.saveCustomDictionary();
    this.refreshHighlighters();
  }

  getCustomDictionary() {
    return Array.from(this.customDictionary).sort();
  }

  ignoreWord(word) {
    if (!word) return;
    this.ignoredWords.add(word.toLowerCase().trim());
    this.refreshHighlighters();
  }

  isIgnored(word) {
    if (!word) return false;
    return this.ignoredWords.has(word.toLowerCase().trim());
  }

  clearIgnored() {
    this.ignoredWords.clear();
    this.refreshHighlighters();
  }

  /**
   * Verifica si una palabra se considera ortográficamente válida.
   */
  isValidWord(rawWord) {
    if (!rawWord) return true;
    const word = rawWord.trim();
    if (!word || word.length <= 1) return true;

    // 1. Cualquier token que contenga dígitos es una cota, especificación o código técnico
    // ej: 0.90x2.10, 1.50m, 12x20x40, 100amp.max, no.2, no.3, 250kg, 1/2", 120v, APU-01
    if (/\d/.test(word)) return true;

    // 2. Tokens con símbolos técnicos de obra (pulgadas, diagonales, fórmulas, grados, potencias)
    if (/[\/'"=°%²³\+]/.test(word)) return true;

    // 3. Siglas y códigos en mayúsculas de longitud corta (ej: CFE, NOM, NMX, PVC, CPVC, HDPE, IPR, APU, FO, GO, II)
    if (/^[A-Z0-9_\-\.]+$/.test(word) && word.length <= 6) return true;

    const lower = word.toLowerCase();

    // 4. Abreviaturas y notaciones técnicas admitidas
    if (['no.', 'núm.', 'num.', 'c/u', 'kg/cm2', 'kg/cm²', 'ton/m3', 'ton/m²', 'f\'c', 's/n', 'p.b', 'p.a', 'p.d', 'p.g', 'l.p', 'r.n'].includes(lower)) {
      return true;
    }

    // 5. En lista de ignorados para esta sesión
    if (this.ignoredWords.has(lower)) return true;

    // 6. En diccionario de usuario
    if (this.customDictionary.has(lower)) return true;

    // 7. Si la palabra está en AUTOCORRECT_MAP y requiere acentuación (ej: colocacion -> colocación)
    if (AUTOCORRECT_MAP[lower] && AUTOCORRECT_MAP[lower].toLowerCase() !== lower) {
      return false;
    }

    // 8. En diccionario pre-aprobado (base española y construcción)
    if (SPANISH_BASE_DICT.has(lower)) return true;

    return false;
  }

  /**
   * Corrige el case respetando mayúsculas/minúsculas originales:
   */
  matchCasing(original, replacement) {
    if (!original || !replacement) return replacement;

    if (original === original.toUpperCase() && original.length > 1) {
      return replacement.toUpperCase();
    }

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

    // 1. Regla de Word: "Corregir DOS MAyúsculas Iniciales" (ej: COncreto -> Concreto)
    if (rawWord.length >= 3 && /^[A-ZÁÉÍÓÚÑ]{2}[a-záéíóúñ]+$/.test(rawWord)) {
      const fixed = rawWord.charAt(0) + rawWord.slice(1).toLowerCase();
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
      if (isSentenceStart && rep.length > 0) {
        rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      } else {
        rep = this.matchCasing(rawWord, rep);
      }
      return rep;
    }

    // 3. Regla morfológica: Palabras que terminan en "cion" sin tilde
    if (lower.length >= 6 && lower.endsWith('cion')) {
      const corrected = lower.slice(0, -4) + 'ción';
      let rep = this.matchCasing(rawWord, corrected);
      if (isSentenceStart) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      return rep;
    }

    // 4. Regla morfológica: Palabras que terminan en "eria" sin tilde
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

    // 3. Probar reemplazo directo de vocales no acentuadas por acentuadas
    // ej: valvula -> válvula, linea -> línea, hidraulico -> hidráulico, maximo -> máximo, numero -> número
    const vowels = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      if (vowels[ch]) {
        const candidate = lower.slice(0, i) + vowels[ch] + lower.slice(i + 1);
        if (SPANISH_BASE_DICT.has(candidate)) {
          suggestions.add(this.matchCasing(rawWord, candidate));
        }
      }
    }

    // 4. Buscar en el diccionario base por distancia de Levenshtein (1 o 2 cambios; 3 si longitud >= 6)
    const maxDist = lower.length >= 6 ? 2 : 1;
    const candidates = [];
    for (const dictWord of SPANISH_BASE_DICT) {
      if (Math.abs(dictWord.length - lower.length) > maxDist) continue;
      const dist = this.levenshtein(lower, dictWord);
      if (dist <= maxDist) {
        candidates.push({ word: dictWord, dist });
      }
    }

    // Ordenar candidatos por menor distancia y relevancia
    candidates.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      const aFirst = a.word[0] === lower[0] ? 0 : 1;
      const bFirst = b.word[0] === lower[0] ? 0 : 1;
      if (aFirst !== bFirst) return aFirst - bFirst;
      return Math.abs(a.word.length - lower.length) - Math.abs(b.word.length - lower.length);
    });

    for (const c of candidates.slice(0, 5)) {
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
   * Obtiene la palabra y sus coordenadas [start, end] en una posición específica de texto.
   */
  getWordAtPosition(text, pos) {
    if (!text || typeof text !== 'string') return null;
    const len = text.length;
    if (pos < 0 || pos > len) return null;

    const isWordChar = (c) => /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\/\'\.\-]/.test(c);

    let checkPos = pos;
    if (checkPos > 0 && (checkPos >= len || !isWordChar(text[checkPos])) && isWordChar(text[checkPos - 1])) {
      checkPos = checkPos - 1;
    }

    if (checkPos < 0 || checkPos >= len || !isWordChar(text[checkPos])) {
      return null;
    }

    let start = checkPos;
    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }
    let end = checkPos;
    while (end < len && isWordChar(text[end])) {
      end++;
    }

    let rawWord = text.substring(start, end);
    let cleanWord = rawWord;

    const matchPunct = cleanWord.match(/([\.,;:!?\)\"\'\]]+)$/);
    if (matchPunct && !['no.', 'núm.', 'num.', 'c/u', 'kg/cm2', 'ton/m3', 'f\'c', 's/n', 'p.b', 'p.a', 'p.d', 'l.p'].includes(cleanWord.toLowerCase())) {
      const punctLen = matchPunct[1].length;
      cleanWord = cleanWord.slice(0, -punctLen);
      end -= punctLen;
    }

    return {
      word: cleanWord,
      rawWord,
      start,
      end
    };
  }

  /**
   * Identifica con alta precisión la palabra y si es error bajo las coordenadas del mouse.
   */
  getWordUnderPointer(target, event) {
    if (!target) return null;
    const text = target.isContentEditable ? target.innerText : target.value;
    if (!text) return null;

    let pos = -1;

    // 1. Coordenadas precisas del puntero en el texto
    if (document.caretPositionFromPoint) {
      try {
        const cp = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (cp && typeof cp.offset === 'number') {
          pos = cp.offset;
        }
      } catch (err) {}
    }

    if (pos < 0 && document.caretRangeFromPoint) {
      try {
        const cr = document.caretRangeFromPoint(event.clientX, event.clientY);
        if (cr && typeof cr.startOffset === 'number') {
          pos = cr.startOffset;
        }
      } catch (err) {}
    }

    // 2. Si las coordenadas no respondieron, consultar selectionStart del elemento
    if (pos < 0 && typeof target.selectionStart === 'number') {
      pos = target.selectionStart;
    }

    // 3. Buscar si coincide directamente con algún error previamente detectado en este campo
    const errors = this.findSpellingErrorsInText(text);

    if (pos >= 0) {
      const matched = errors.find(err => pos >= (err.start - 1) && pos <= (err.end + 1));
      if (matched) {
        return {
          word: matched.word,
          rawWord: matched.rawWord,
          start: matched.start,
          end: matched.end,
          suggestions: matched.suggestions || this.getSuggestions(matched.word),
          isError: true
        };
      }
    }

    // 4. Si no cayó en un error conocido, extraer la palabra en la posición pos
    const wordInfo = this.getWordAtPosition(text, pos >= 0 ? pos : 0);
    if (wordInfo) {
      const isValid = this.isValidWord(wordInfo.word);
      return {
        ...wordInfo,
        suggestions: isValid ? [] : this.getSuggestions(wordInfo.word),
        isError: !isValid
      };
    }

    return null;
  }

  /**
   * Escanea un texto completo y devuelve los errores encontrados con posición y sugerencias.
   */
  findSpellingErrorsInText(text) {
    if (!text || typeof text !== 'string') return [];

    const regex = /([a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\/\'\.\-]+)/g;
    const errors = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      let rawWord = match[0];
      let cleanWord = rawWord;
      let start = match.index;
      let end = start + rawWord.length;

      // Descartar puntuación final común a menos que sea abreviatura técnica
      const matchPunct = cleanWord.match(/([\.,;:!?\)\"\'\]]+)$/);
      if (matchPunct && !['no.', 'núm.', 'num.', 'c/u', 'kg/cm2', 'ton/m3', 'f\'c', 's/n', 'p.b', 'p.a', 'p.d', 'l.p'].includes(cleanWord.toLowerCase())) {
        const punctLen = matchPunct[1].length;
        cleanWord = cleanWord.slice(0, -punctLen);
        end -= punctLen;
      }

      if (!cleanWord || cleanWord.length <= 1) continue;

      // Si la palabra no es válida
      if (!this.isValidWord(cleanWord)) {
        const suggestions = this.getSuggestions(cleanWord);
        errors.push({
          word: cleanWord,
          rawWord,
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

    const isInput = target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'search' || !target.type);
    const isTextarea = target.tagName === 'TEXTAREA';
    const isContentEditable = target.isContentEditable;

    if (!isInput && !isTextarea && !isContentEditable) return;
    if (target.readOnly || target.disabled) return;

    // Deshacer autocorrección con Backspace inmediato
    if (e.key === 'Backspace' && this.lastAutocorrectEvent) {
      const { element, originalText, cursorPosition } = this.lastAutocorrectEvent;
      if (element === target && (target.value !== undefined || isContentEditable)) {
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
          this.updateElementHighlight(target);
          return;
        }
      }
      this.lastAutocorrectEvent = null;
    }

    const triggers = [' ', 'Enter', '.', ',', ';', ':', '!', '?'];
    if (!triggers.includes(e.key)) {
      this.lastAutocorrectEvent = null;
      return;
    }

    if (isContentEditable) return;

    const value = target.value;
    const cursorPos = target.selectionStart;

    if (cursorPos !== target.selectionEnd) return;

    const textBefore = value.slice(0, cursorPos);
    const match = textBefore.match(/([a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\/\'\.\-]+)$/);
    if (!match) return;

    const lastWord = match[1];
    const wordStart = cursorPos - lastWord.length;

    const textPreWord = textBefore.slice(0, wordStart).trim();
    const isSentenceStart = textPreWord.length === 0 || /[\.\?\!\n]\s*$/.test(textPreWord);

    const replacement = this.getAutocorrectReplacement(lastWord, isSentenceStart);
    if (!replacement || replacement === lastWord) return;

    const triggerChar = e.key === 'Enter' ? '\n' : e.key;
    const originalFullValue = value;

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

    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    this.updateElementHighlight(target);
  }

  /**
   * Reemplaza la palabra errónea por la seleccionada en el target editable.
   */
  replaceWord(target, wordInfo, newWord) {
    if (!target || !wordInfo || !newWord) return;

    if (target.isContentEditable) {
      const text = target.innerText;
      const before = text.slice(0, wordInfo.start);
      const after = text.slice(wordInfo.end);
      target.innerText = before + newWord + after;
    } else {
      const val = target.value;
      const before = val.slice(0, wordInfo.start);
      const after = val.slice(wordInfo.end);
      target.value = before + newWord + after;
      const newPos = wordInfo.start + newWord.length;
      target.setSelectionRange(newPos, newPos);
      target.focus();
    }

    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    this.updateElementHighlight(target);
  }

  /**
   * Oculta el menú contextual flotante.
   */
  hideContextMenu() {
    const menu = document.getElementById('word-spell-context-menu');
    if (menu) {
      menu.classList.add('hidden');
      menu.style.display = 'none';
    }
    this.activeContextMenu = null;
  }

  /**
   * Renderiza el contenido del menú flotante de corrección con opciones completas.
   */
  renderContextMenu(menu, word, suggestions, x, y, onSelect, onIgnore, onAddDict, onManualFix) {
    const escape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    menu.innerHTML = '';

    // Encabezado
    const header = document.createElement('div');
    header.className = 'px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 mb-1';
    header.innerHTML = `<span>Corrección: <span class="text-rose-600 font-semibold normal-case">${escape(word)}</span></span><i class="fa-solid fa-spell-check text-blue-600 text-xs"></i>`;
    menu.appendChild(header);

    // Lista de sugerencias
    const suggContainer = document.createElement('div');
    suggContainer.className = 'px-1 space-y-0.5';

    if (suggestions && suggestions.length > 0) {
      suggestions.forEach(sug => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'w-full text-left px-2.5 py-1.5 rounded-lg text-slate-800 font-bold hover:text-blue-600 hover:bg-blue-50 transition flex items-center justify-between cursor-pointer group text-xs';
        btn.innerHTML = `<span class="flex items-center gap-2"><i class="fa-solid fa-check text-[11px] text-blue-500 group-hover:scale-110 transition-transform"></i><span>${escape(sug)}</span></span><span class="text-[9px] text-slate-400 font-normal">Reemplazar</span>`;
        btn.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(sug);
        };
        suggContainer.appendChild(btn);
      });
    } else {
      // Si no hay sugerencias automáticas, ofrecer entrada manual para no dejar al usuario sin opción
      const noSug = document.createElement('div');
      noSug.className = 'px-2.5 py-1 text-slate-500 italic text-[11px] flex items-center gap-1.5';
      noSug.innerHTML = `<i class="fa-solid fa-circle-question text-slate-400 text-[10px]"></i><span>Sin sugerencias automáticas</span>`;
      suggContainer.appendChild(noSug);

      const manualWrap = document.createElement('div');
      manualWrap.className = 'px-2 py-1 flex items-center gap-1';
      manualWrap.innerHTML = `
        <input type="text" id="spell-manual-fix-input" class="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-500 focus:bg-white" placeholder="Escribir corrección...">
        <button type="button" id="spell-manual-fix-btn" class="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition cursor-pointer" title="Aplicar corrección">
          <i class="fa-solid fa-check text-[10px]"></i>
        </button>
      `;
      suggContainer.appendChild(manualWrap);

      setTimeout(() => {
        const input = manualWrap.querySelector('#spell-manual-fix-input');
        const btn = manualWrap.querySelector('#spell-manual-fix-btn');
        if (input && btn) {
          const applyManual = () => {
            const val = input.value.trim();
            if (val && onManualFix) onManualFix(val);
          };
          btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); applyManual(); };
          input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); applyManual(); } };
        }
      }, 0);
    }
    menu.appendChild(suggContainer);

    // Separador
    const div1 = document.createElement('div');
    div1.className = 'my-1 border-t border-slate-100';
    menu.appendChild(div1);

    // Acciones de Diccionario
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'px-1 space-y-0.5';

    const btnIgnore = document.createElement('button');
    btnIgnore.type = 'button';
    btnIgnore.className = 'w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-2 cursor-pointer text-[11px] font-medium';
    btnIgnore.innerHTML = `<i class="fa-solid fa-forward-step text-[11px] text-slate-400 w-4 text-center"></i><span>Omitir "${escape(word)}"</span>`;
    btnIgnore.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onIgnore();
    };
    actionsContainer.appendChild(btnIgnore);

    const btnAddDict = document.createElement('button');
    btnAddDict.type = 'button';
    btnAddDict.className = 'w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition flex items-center gap-2 cursor-pointer text-[11px] font-medium';
    btnAddDict.innerHTML = `<i class="fa-solid fa-book-bookmark text-[11px] text-amber-500 w-4 text-center"></i><span>Agregar al diccionario</span>`;
    btnAddDict.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onAddDict();
    };
    actionsContainer.appendChild(btnAddDict);

    menu.appendChild(actionsContainer);

    // Mostrar y posicionar evitando desbordamiento de pantalla
    menu.style.display = 'block';
    menu.classList.remove('hidden');

    const menuRect = menu.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    if (posX + menuRect.width > winWidth - 10) {
      posX = Math.max(10, winWidth - menuRect.width - 10);
    }
    if (posY + menuRect.height > winHeight - 10) {
      posY = Math.max(10, posY - menuRect.height);
    }

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;
  }

  /**
   * Inicializa el escucha del menú contextual (clic derecho) estilo Word.
   */
  initSpellContextMenu() {
    let menu = document.getElementById('word-spell-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'word-spell-context-menu';
      menu.className = 'fixed hidden z-[100010] bg-white rounded-xl shadow-2xl border border-slate-200/90 py-1.5 min-w-[220px] max-w-[280px] text-xs font-sans select-none backdrop-blur-sm';
      document.body.appendChild(menu);
    }

    let activeTarget = null;
    let activeWordInfo = null;

    document.addEventListener('contextmenu', (e) => {
      const target = e.target;
      if (!target) return;

      const isInput = target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'search' || !target.type);
      const isTextarea = target.tagName === 'TEXTAREA';
      const isContentEditable = target.isContentEditable;

      if (!isInput && !isTextarea && !isContentEditable) {
        this.hideContextMenu();
        return;
      }

      if (target.readOnly || target.disabled) {
        this.hideContextMenu();
        return;
      }

      // Obtener de forma robusta la palabra bajo el puntero
      const wordInfo = this.getWordUnderPointer(target, e);
      if (!wordInfo || !wordInfo.word) {
        this.hideContextMenu();
        return;
      }

      // Si la palabra es correcta, dejamos que el navegador muestre su menú normal (copiar, pegar, etc.)
      if (!wordInfo.isError) {
        this.hideContextMenu();
        return;
      }

      // ¡Palabra con error! Desplegar menú de Word
      e.preventDefault();
      e.stopPropagation();

      activeTarget = target;
      activeWordInfo = wordInfo;

      const suggestions = wordInfo.suggestions || this.getSuggestions(wordInfo.word);
      this.renderContextMenu(
        menu,
        wordInfo.word,
        suggestions,
        e.clientX,
        e.clientY,
        (chosenWord) => {
          this.replaceWord(activeTarget, activeWordInfo, chosenWord);
          this.hideContextMenu();
        },
        () => {
          this.ignoreWord(wordInfo.word);
          this.hideContextMenu();
        },
        () => {
          this.addToDictionary(wordInfo.word);
          this.hideContextMenu();
        },
        (manualWord) => {
          this.replaceWord(activeTarget, activeWordInfo, manualWord);
          this.hideContextMenu();
        }
      );
    }, true);

    // Ocultar al hacer clic fuera o presionar Escape
    document.addEventListener('mousedown', (e) => {
      if (menu && !menu.contains(e.target)) {
        this.hideContextMenu();
      }
    }, true);

    window.addEventListener('scroll', () => this.hideContextMenu(), true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideContextMenu();
    }, true);
  }

  /**
   * Conecta y sincroniza el subrayado visual ondulado rojo para un textarea o input editable.
   */
  attachSpellHighlighter(element) {
    if (!element || element.__spellHighlighterAttached) return;

    const isTextarea = element.tagName === 'TEXTAREA';
    const isInput = element.tagName === 'INPUT' && (element.type === 'text' || !element.type);
    if (!isTextarea && !isInput) return;

    let backdrop = element.parentElement ? element.parentElement.querySelector('.cubikar-spell-backdrop') : null;

    if (!backdrop && element.parentElement) {
      const parent = element.parentElement;
      if (!parent.classList.contains('cubikar-spell-wrap')) {
        parent.classList.add('cubikar-spell-wrap');
      }
      backdrop = document.createElement('div');
      backdrop.className = 'cubikar-spell-backdrop';
      parent.insertBefore(backdrop, element);
    }

    if (!backdrop) return;

    element.__spellBackdrop = backdrop;
    element.__spellHighlighterAttached = true;
    this.highlightedElements.add(element);

    const update = () => this.updateElementHighlight(element);

    element.addEventListener('input', update);
    element.addEventListener('change', update);
    element.addEventListener('scroll', () => {
      if (backdrop) {
        backdrop.scrollTop = element.scrollTop;
        backdrop.scrollLeft = element.scrollLeft;
      }
    });

    update();
  }

  /**
   * Actualiza las marcas onduladas rojas en el backdrop de un elemento.
   */
  updateElementHighlight(element) {
    if (!element || !element.__spellBackdrop) return;
    const backdrop = element.__spellBackdrop;
    const text = element.value || '';

    if (!this.enabled || !text) {
      backdrop.innerHTML = '';
      return;
    }

    // Copiar estilos geométricos para alineación 1:1 exacta
    const cs = window.getComputedStyle(element);
    backdrop.style.fontFamily = cs.fontFamily;
    backdrop.style.fontSize = cs.fontSize;
    backdrop.style.fontWeight = cs.fontWeight;
    backdrop.style.lineHeight = cs.lineHeight;
    backdrop.style.letterSpacing = cs.letterSpacing;
    backdrop.style.textAlign = cs.textAlign;
    backdrop.style.paddingTop = cs.paddingTop;
    backdrop.style.paddingRight = cs.paddingRight;
    backdrop.style.paddingBottom = cs.paddingBottom;
    backdrop.style.paddingLeft = cs.paddingLeft;
    backdrop.style.borderTopWidth = cs.borderTopWidth;
    backdrop.style.borderRightWidth = cs.borderRightWidth;
    backdrop.style.borderBottomWidth = cs.borderBottomWidth;
    backdrop.style.borderLeftWidth = cs.borderLeftWidth;
    backdrop.style.boxSizing = cs.boxSizing;

    const escape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const errors = this.findSpellingErrorsInText(text);

    let html = '';
    let last = 0;
    for (const err of errors) {
      html += escape(text.slice(last, err.start));
      html += `<span class="cubikar-spell-error">${escape(text.slice(err.start, err.end))}</span>`;
      last = err.end;
    }
    html += escape(text.slice(last));

    if (text.endsWith('\n')) html += ' ';
    backdrop.innerHTML = html;
    backdrop.scrollTop = element.scrollTop;
    backdrop.scrollLeft = element.scrollLeft;
  }

  /**
   * Refresca todos los elementos resaltados activos.
   */
  refreshHighlighters() {
    this.highlightedElements.forEach(el => {
      if (document.body.contains(el)) {
        this.updateElementHighlight(el);
      } else {
        this.highlightedElements.delete(el);
      }
    });
  }

  /**
   * Configura atributos de ortografía en un elemento (desactivando el subrayado nativo del navegador para evitar falsos positivos).
   */
  enforceElementSpellcheck(el) {
    if (!el || el.dataset?.spellcheckConfigured === 'true') return;

    const isText = (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || !el.type)) ||
                   el.tagName === 'TEXTAREA' ||
                   el.isContentEditable;

    if (isText) {
      // DESACTIVAR spellcheck nativo del navegador para que no subraye todo en rojo por discrepancia de idioma del SO
      el.spellcheck = false;
      el.setAttribute('spellcheck', 'false');
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocapitalize', 'sentences');
      el.setAttribute('lang', 'es');
      el.dataset.spellcheckConfigured = 'true';

      if (el.tagName === 'TEXTAREA' || el.classList.contains('desc-input')) {
        this.attachSpellHighlighter(el);
      }
    }
  }

  /**
   * Inicialización global del observador y escuchas de eventos.
   */
  initGlobalObserver() {
    // 1. Escuchar pulsaciones de teclas para autocorrección estilo Word
    document.addEventListener('keydown', (e) => this.handleKeydown(e), true);

    // 2. Inicializar menú contextual de clic derecho estilo Word
    this.initSpellContextMenu();

    // 3. Interceptar foco para asegurar atributos y adjuntar resaltadores
    document.addEventListener('focusin', (e) => {
      if (e.target) this.enforceElementSpellcheck(e.target);
    }, true);

    // 4. Aplicar de inmediato a todos los inputs y textareas existentes
    document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]').forEach(el => {
      this.enforceElementSpellcheck(el);
    });

    // 5. Observar mutaciones dinámicas (al desplegar nodos, modales, etc.)
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
  }
}

// Instancia singleton compartida
export const wordAutocorrectService = new WordAutocorrectService();
