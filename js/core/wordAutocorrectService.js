/**
 * wordAutocorrectService.js
 * Motor de OrtografÃ­a, AutocorrecciÃ³n y Diccionario en tiempo real estilo Microsoft Word para Cubikar.
 * 
 * CaracterÃ­sticas:
 * 1. Subrayado rojo ondulado en tiempo real en descripciones de conceptos e insumos APU.
 * 2. MenÃº contextual flotante al hacer clic derecho sobre cualquier palabra con error:
 *    - Sugerencias inmediatas ordenadas por similitud fonÃ©tica y distancia de ediciÃ³n.
 *    - Reemplazo instantÃ¡neo al hacer clic en una sugerencia.
 *    - OpciÃ³n de correcciÃ³n manual directa en el menÃº si no hay sugerencia automÃ¡tica.
 *    - "Omitir palabra" para ignorar en la sesiÃ³n.
 *    - "Agregar al diccionario" con persistencia en localStorage.
 * 3. MenÃº contextual estÃ¡ndar preservado si se hace clic derecho en palabras correctas.
 * 4. AutocorrecciÃ³n rÃ¡pida al teclear espacio/puntuaciÃ³n (COncreto -> Concreto, m2 -> mÂ², tildes tÃ©cnicas).
 * 5. Deshacer con Backspace inmediato.
 * 6. Diccionario ultra-amplio de espaÃ±ol general, construcciÃ³n civil, arquitectura, instalaciones y marcas.
 * 7. Regla de excepciÃ³n inteligente: cotas, cÃ³digos, dimensiones y especificaciones con nÃºmeros nunca se marcan como error.
 */

import { showToast } from '../ui/notifications.js?v=20261116_cf3';

const STORAGE_KEY_CUSTOM_DICT = 'cubikar_custom_dictionary';
const STORAGE_KEY_AUTOCORRECT_ENABLED = 'cubikar_autocorrect_enabled';

// Marcas y siglas pre-aprobadas en construcciÃ³n, arquitectura e instalaciones en MÃ©xico / Latam
const DEFAULT_WHITELIST = [
  // Software y sistemas
  'apu', 'apus', 'neodata', 'opus', 'autocad', 'revit', 'cubikar', 'excel', 'word',
  // Marcas de materiales y tuberÃ­as
  'cemex', 'holcim', 'cruz', 'azul', 'moctezuma', 'apaxco', 'tolteca', 'calidra', 'calhidra',
  'comex', 'fester', 'festerbond', 'sika', 'imperquimia', 'tuboplus', 'rotoplas', 'cytsa',
  'bticino', 'square', 'dexter', 'cresco', 'moen', 'interceramic', 'porcelanite', 'vinimex',
  'dolphin', 'igesa', 'vantagio', 'anger', 'leflam', 'magnum', 'smar', 'surface', 'truper',
  'urrea', 'helvex', 'dica', 'deacero', 'ternium', 'austromex', 'bellota', 'pretul', 'bosch',
  'makita', 'dewalt', 'milwaukee', 'hilti', 'stanley', 'irwin', 'klein', 'copperweld',
  // Normas y dependencias
  'cfe', 'nom', 'nmx', 'imss', 'infonavit', 'sat', 'sedatu', 'invea', 'semarnat', 'stps',
  // Abreviaturas tÃ©cnicas de planos e instalaciones
  'p.b', 'p.a', 'p.d', 'p.g', 'l.p', 'r.n', 'bap', 'bae', 'pvc', 'cpvc', 'cxc', 'hdpe', 'pead',
  'pp-r', 'pe-al-pe', 'pvc-ha', 'pvc-sa', 'pvc-sc', 'thw', 'thhn', 'ptr', 'ipr', 'ips', 'hss',
  'fc', 'f\'c', 'kg/cm2', 'kg/cmÂ²', 'ton/m3', 'ton/mÂ²', 'l/seg', 'gal/min', 'btu', 'kva', 'kw',
  'hp', 'psi', 'bar', 'rpm', 'hz', 'volts', 'amp', 'amperes', 'watts',
  // Unidades de catÃ¡logo
  'ml', 'm2', 'mÂ²', 'm3', 'mÂ³', 'cm', 'cm2', 'cmÂ²', 'cm3', 'cmÂ³', 'mm', 'mts', 'lt', 'lts',
  'litros', 'kg', 'kgs', 'ton', 'tons', 'pza', 'pzas', 'pzo', 'lote', 'lotes', 'tramo', 'tramos',
  'jgo', 'juegos', 'viaje', 'viajes', 'sal', 'salidas', 'jor', 'jornadas', 'hr', 'hrs', 'horas',
  'mes', 'meses', 'aÃ±o', 'aÃ±os', 'dia', 'dias', 'dÃ­a', 'dÃ­as', 'no.', 'nÃºm.', 'num.', 'c/u',
  's/n', 'cal', 'calibre', 'cd', 'ced', 'cedula', 'cÃ©dula', 'mod', 'cat', 'kit', 'rd', 'acc',
  'diam', 'ag.max', 'r/int', 'fo', 'go', 'ye', 'uv', 'temp',
  // Notaciones romanas comunes en planos
  'ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix'
];

// Tabla de reemplazos inmediatos de autocorrecciÃ³n (estilo Word AutoCorrect)
const AUTOCORRECT_MAP = {
  // Verbos y acciones de obra frecuentes
  'colocacion': 'colocaciÃ³n',
  'instalacion': 'instalaciÃ³n',
  'demolicion': 'demoliciÃ³n',
  'excavacion': 'excavaciÃ³n',
  'fabricacion': 'fabricaciÃ³n',
  'reparacion': 'reparaciÃ³n',
  'nivelacion': 'nivelaciÃ³n',
  'compactacion': 'compactaciÃ³n',
  'cimentacion': 'cimentaciÃ³n',
  'impermeabilizacion': 'impermeabilizaciÃ³n',
  'habilitacion': 'habilitaciÃ³n',
  'aplicacion': 'aplicaciÃ³n',
  'elaboracion': 'elaboraciÃ³n',
  'construccion': 'construcciÃ³n',
  'proteccion': 'protecciÃ³n',
  'ventilacion': 'ventilaciÃ³n',
  'alimentacion': 'alimentaciÃ³n',
  'sustitucion': 'sustituciÃ³n',
  'perforacion': 'perforaciÃ³n',
  'modificacion': 'modificaciÃ³n',
  'verificacion': 'verificaciÃ³n',
  'adjudicacion': 'adjudicaciÃ³n',
  'estimacion': 'estimaciÃ³n',
  'inspeccion': 'inspecciÃ³n',
  'reubicacion': 'reubicaciÃ³n',
  'dosificacion': 'dosificaciÃ³n',
  'composicion': 'composiciÃ³n',
  'proyeccion': 'proyecciÃ³n',
  'fijacion': 'fijaciÃ³n',
  'preparacion': 'preparaciÃ³n',
  'incorporacion': 'incorporaciÃ³n',
  'extraccion': 'extracciÃ³n',
  'elevacion': 'elevaciÃ³n',
  'conduccion': 'conducciÃ³n',
  'contaminacion': 'contaminaciÃ³n',
  'certificacion': 'certificaciÃ³n',
  'senalizacion': 'seÃ±alizaciÃ³n',
  'senalamiento': 'seÃ±alamiento',
  'alineacion': 'alineaciÃ³n',
  'termofusion': 'termofusiÃ³n',
  'dilatacion': 'dilataciÃ³n',
  'expansion': 'expansiÃ³n',
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
  'albanil': 'albaÃ±il',
  'albaniles': 'albaÃ±iles',
  'albanileria': 'albaÃ±ilerÃ­a',
  'albaÃ±ileria': 'albaÃ±ilerÃ­a',
  'herreria': 'herrerÃ­a',
  'carpinteria': 'carpinterÃ­a',
  'canceleria': 'cancelerÃ­a',
  'plomeria': 'plomerÃ­a',
  'cerrajeria': 'cerrajerÃ­a',
  'vidrieria': 'vidrierÃ­a',
  'ferreteria': 'ferreterÃ­a',
  'mamposteria': 'mamposterÃ­a',

  // Elementos e instalaciones
  'tuberia': 'tuberÃ­a',
  'tuberias': 'tuberÃ­as',
  'valvula': 'vÃ¡lvula',
  'valvulas': 'vÃ¡lvulas',
  'lampara': 'lÃ¡mpara',
  'lamparas': 'lÃ¡mparas',
  'angulo': 'Ã¡ngulo',
  'angulos': 'Ã¡ngulos',
  'lamina': 'lÃ¡mina',
  'laminas': 'lÃ¡minas',
  'modulo': 'mÃ³dulo',
  'modulos': 'mÃ³dulos',
  'diametro': 'diÃ¡metro',
  'diametros': 'diÃ¡metros',
  'area': 'Ã¡rea',
  'areas': 'Ã¡reas',
  'seccion': 'secciÃ³n',
  'presion': 'presiÃ³n',
  'tension': 'tensiÃ³n',
  'guarnicion': 'guarniciÃ³n',
  'adoquin': 'adoquÃ­n',
  'chaflan': 'chaflÃ¡n',
  'hormigon': 'hormigÃ³n',
  'alambron': 'alambrÃ³n',
  'polin': 'polÃ­n',
  'plafon': 'plafÃ³n',
  'pison': 'pisÃ³n',
  'tapon': 'tapÃ³n',
  'tapones': 'tapones',
  'desague': 'desagÃ¼e',
  'estacion': 'estaciÃ³n',
  'reventon': 'reventÃ³n',
  'liquido': 'lÃ­quido',
  'liquidos': 'lÃ­quidos',
  'camion': 'camiÃ³n',
  'camiones': 'camiones',

  // Adjetivos tÃ©cnicos y matemÃ¡ticos
  'electrico': 'elÃ©ctrico',
  'electrica': 'elÃ©ctrica',
  'electricos': 'elÃ©ctricos',
  'electricas': 'elÃ©ctricas',
  'mecanico': 'mecÃ¡nico',
  'mecanica': 'mecÃ¡nica',
  'mecanicos': 'mecÃ¡nicos',
  'mecanicas': 'mecÃ¡nicas',
  'hidraulico': 'hidrÃ¡ulico',
  'hidraulica': 'hidrÃ¡ulica',
  'hidraulicos': 'hidrÃ¡ulicos',
  'hidraulicas': 'hidrÃ¡ulicas',
  'acrilico': 'acrÃ­lico',
  'acrilica': 'acrÃ­lica',
  'epoxico': 'epÃ³xico',
  'epoxica': 'epÃ³xica',
  'vinilico': 'vinÃ­lico',
  'vinilica': 'vinÃ­lica',
  'termico': 'tÃ©rmico',
  'termica': 'tÃ©rmica',
  'acustico': 'acÃºstico',
  'acustica': 'acÃºstica',
  'metalico': 'metÃ¡lico',
  'metalica': 'metÃ¡lica',
  'plastico': 'plÃ¡stico',
  'plastica': 'plÃ¡stica',
  'ceramico': 'cerÃ¡mico',
  'ceramica': 'cerÃ¡mica',
  'porcelanico': 'porcelÃ¡nico',
  'optimo': 'Ã³ptimo',
  'optima': 'Ã³ptima',
  'maximo': 'mÃ¡ximo',
  'maxima': 'mÃ¡xima',
  'minimo': 'mÃ­nimo',
  'minima': 'mÃ­nima',
  'ultimo': 'Ãºltimo',
  'ultima': 'Ãºltima',
  'tecnico': 'tÃ©cnico',
  'tecnica': 'tÃ©cnica',
  'tecnicos': 'tÃ©cnicos',
  'tecnicas': 'tÃ©cnicas',
  'basico': 'bÃ¡sico',
  'basica': 'bÃ¡sica',
  'automatico': 'automÃ¡tico',
  'automatica': 'automÃ¡tica',
  'estandar': 'estÃ¡ndar',
  'asfaltico': 'asfÃ¡ltico',
  'asfaltica': 'asfÃ¡ltica',
  'topografico': 'topogrÃ¡fico',
  'topografica': 'topogrÃ¡fica',
  'ecologico': 'ecolÃ³gico',
  'ecologica': 'ecolÃ³gica',
  'domestico': 'domÃ©stico',
  'domestica': 'domÃ©stica',
  'anticalcareo': 'anticalcÃ¡reo',
  'centrifuga': 'centrÃ­fuga',
  'comun': 'comÃºn',
  'desertico': 'desÃ©rtico',
  'electrolitico': 'electrolÃ­tico',
  'monofasica': 'monofÃ¡sica',
  'excentrica': 'excÃ©ntrica',
  'retractil': 'retrÃ¡ctil',

  // GestiÃ³n de obra, metrados y presupuestos
  'codigo': 'cÃ³digo',
  'codigos': 'cÃ³digos',
  'especificacion': 'especificaciÃ³n',
  'especificaciones': 'especificaciones',
  'catalogo': 'catÃ¡logo',
  'catalogos': 'catÃ¡logos',
  'analisis': 'anÃ¡lisis',
  'calculo': 'cÃ¡lculo',
  'calculos': 'cÃ¡lculos',
  'numero': 'nÃºmero',
  'numeros': 'nÃºmeros',
  'linea': 'lÃ­nea',
  'lineas': 'lÃ­neas',
  'limite': 'lÃ­mite',
  'limites': 'lÃ­mites',
  'periodo': 'perÃ­odo',
  'politica': 'polÃ­tica',
  'garantia': 'garantÃ­a',
  'descripcion': 'descripciÃ³n',
  'descripciones': 'descripciones',
  'observacion': 'observaciÃ³n',
  'observaciones': 'observaciones',
  'bitacora': 'bitÃ¡cora',

  // Palabras comunes del espaÃ±ol
  'tambien': 'tambiÃ©n',
  'ademas': 'ademÃ¡s',
  'despues': 'despuÃ©s',
  'pagina': 'pÃ¡gina',
  'paginas': 'pÃ¡ginas',
  'parrafo': 'pÃ¡rrafo',
  'segun': 'segÃºn',
  'quiza': 'quizÃ¡',
  'quizas': 'quizÃ¡s',
  'dia': 'dÃ­a',
  'dias': 'dÃ­as',
  'guia': 'guÃ­a',
  'guias': 'guÃ­as',
  'facil': 'fÃ¡cil',
  'dificil': 'difÃ­cil',
  'util': 'Ãºtil',
  'rapido': 'rÃ¡pido',
  'mas': 'mÃ¡s',
  'razon': 'razÃ³n',

  // Unidades de construcciÃ³n y sÃ­mbolos automÃ¡ticos
  'm2': 'mÂ²',
  'm3': 'mÂ³',
  'cm2': 'cmÂ²',
  'cm3': 'cmÂ³',
  'pie2': 'pieÂ²',
  'pie3': 'pieÂ³',
  'km2': 'kmÂ²'
};

// Diccionario base exhaustivo de espaÃ±ol general y construcciÃ³n civil
const SPANISH_BASE_DICT = new Set([
  ...DEFAULT_WHITELIST,
  ...Object.values(AUTOCORRECT_MAP).map(w => w.toLowerCase()),

  // GramÃ¡tica, conectores, preposiciones y artÃ­culos
  'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'durante', 'en', 'entre',
  'hacia', 'hasta', 'mediante', 'para', 'por', 'segÃºn', 'segun', 'sin', 'so', 'sobre', 'tras',
  'versus', 'vÃ­a', 'via', 'y', 'e', 'ni', 'o', 'u', 'pero', 'mas', 'mÃ¡s', 'sino', 'siquiera',
  'aunque', 'porque', 'pues', 'ya', 'si', 'sÃ­', 'como', 'cÃ³mo', 'que', 'quÃ©', 'conforme',
  'mientras', 'cuando', 'cuÃ¡ndo', 'donde', 'dÃ³nde', 'quien', 'quiÃ©n', 'cual', 'cuÃ¡l',
  'el', 'la', 'los', 'las', 'lo', 'un', 'una', 'uno', 'unos', 'unas', 'del', 'al',
  'este', 'esta', 'estos', 'estas', 'esto', 'ese', 'esa', 'esos', 'esas', 'eso',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'aquello', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'nuestro', 'nuestra', 'nuestros', 'nuestras', 'cuyo', 'cuya', 'cuyos', 'cuyas',
  'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'mismos', 'mismas',
  'todo', 'toda', 'todos', 'todas', 'cada', 'cierto', 'cierta', 'ciertos', 'ciertas',
  'tal', 'tales', 'tanto', 'tanta', 'tantos', 'tantas', 'mucho', 'mucha', 'muchos', 'muchas',
  'poco', 'poca', 'pocos', 'pocas', 'bastante', 'bastantes', 'demasiado', 'demasiada',
  'alguno', 'alguna', 'algunos', 'algunas', 'algÃºn', 'ninguno', 'ninguna', 'ningÃºn',
  'ambos', 'ambas', 'propio', 'propia', 'propios', 'propias',
  'yo', 'tÃº', 'Ã©l', 'ella', 'ello', 'nosotros', 'nosotras', 'ellos', 'ellas', 'usted', 'ustedes',
  'me', 'te', 'se', 'nos', 'le', 'les',

  // Adverbios comunes
  'no', 'ya', 'menos', 'bien', 'mal', 'muy', 'tan', 'asÃ­', 'asi',
  'acÃ¡', 'aca', 'aquÃ­', 'aqui', 'allÃ­', 'alli', 'allÃ¡', 'alla', 'ahÃ­', 'ahi',
  'cerca', 'lejos', 'arriba', 'abajo', 'delante', 'detrÃ¡s', 'detras', 'dentro', 'fuera',
  'antes', 'despuÃ©s', 'despues', 'luego', 'pronto', 'tarde', 'temprano', 'siempre', 'nunca',
  'jamÃ¡s', 'jamas', 'apenas', 'casi', 'solo', 'sÃ³lo', 'solamente', 'tambiÃ©n', 'tambien',
  'ademÃ¡s', 'ademas', 'tampoco', 'entonces', 'inclusive', 'incluso',

  // Verbos de acciÃ³n tÃ©cnica y espaÃ±ol comÃºn (infinitivo, participio, gerundio y conjugaciones)
  'hacer', 'hace', 'hacen', 'hizo', 'hecho', 'hecha', 'hechos', 'hechas', 'haciendo',
  'tener', 'tiene', 'tienen', 'tuvo', 'tenido', 'teniendo',
  'ser', 'es', 'son', 'era', 'eran', 'fue', 'fueron', 'serÃ¡', 'sera', 'serÃ¡n', 'sido', 'siendo',
  'estar', 'estÃ¡', 'estÃ¡n', 'estaba', 'estaban', 'estuvo', 'estado', 'estados', 'estando',
  'haber', 'hay', 'habÃ­a', 'habia', 'hubo', 'habrÃ¡', 'habra',
  'dar', 'da', 'dan', 'dio', 'dado', 'dada', 'dados', 'dadas', 'dando',
  'ir', 'va', 'van', 'iba', 'ido',
  'ver', 've', 'ven', 'vio', 'visto', 'vista', 'vistos', 'vistas',
  'poder', 'puede', 'pueden', 'pudo', 'podrÃ¡', 'podra', 'podido',
  'deber', 'debe', 'deben', 'debiÃ³', 'debido', 'debida', 'debidos', 'debidas',
  'poner', 'pone', 'ponen', 'puso', 'puesto', 'puesta', 'puestos', 'puestas',
  'llevar', 'lleva', 'llevan', 'llevÃ³', 'llevado', 'llevada', 'llevados', 'llevadas', 'llevando',
  'quedar', 'queda', 'quedan', 'quedÃ³', 'quedado', 'quedada',
  'pasar', 'pasa', 'pasan', 'pasÃ³', 'pasado', 'pasada', 'pasados', 'pasadas',
  'usar', 'usa', 'usan', 'usÃ³', 'usado', 'usada', 'usados', 'usadas', 'usando',
  'utilizar', 'utiliza', 'utilizan', 'utilizÃ³', 'utilizado', 'utilizada', 'utilizados', 'utilizadas', 'utilizando',
  'seguir', 'sigue', 'siguen', 'seguido',
  'dejar', 'deja', 'dejan', 'dejado',
  'terminar', 'termina', 'terminan', 'terminÃ³', 'terminado', 'terminada', 'terminados', 'terminadas',
  'presentar', 'presenta', 'presentan', 'presentado', 'presentada', 'presentados', 'presentadas',
  'considerar', 'considera', 'consideran', 'considerado', 'considerada', 'considerados', 'consideradas',
  'requerir', 'requiere', 'requieren', 'requerido', 'requerida', 'requeridos', 'requeridas',
  'cumplir', 'cumple', 'cumplen', 'cumplido', 'cumplida',
  'abrir', 'abre', 'abren', 'abierto', 'abierta', 'abiertos', 'abiertas',
  'cerrar', 'cierra', 'cierran', 'cerrado', 'cerrada', 'cerrados', 'cerradas',
  'incluir', 'incluye', 'incluyen', 'incluyÃ³', 'incluido', 'incluida', 'incluidos', 'incluidas', 'incluyendo',
  'suministrar', 'suministro', 'suministros', 'suministra', 'suministran', 'suministrÃ³', 'suministrado', 'suministrada', 'suministrados', 'suministradas', 'suministrando',
  'colocar', 'colocaciÃ³n', 'coloca', 'colocan', 'colocÃ³', 'colocado', 'colocada', 'colocados', 'colocadas', 'colocando',
  'instalar', 'instalaciÃ³n', 'instalaciones', 'instala', 'instalan', 'instalÃ³', 'instalado', 'instalada', 'instalados', 'instaladas', 'instalando',
  'aplicar', 'aplicaciÃ³n', 'aplicaciones', 'aplica', 'aplican', 'aplicÃ³', 'aplicado', 'aplicada', 'aplicados', 'aplicadas', 'aplicando',
  'elaborar', 'elaboraciÃ³n', 'elabora', 'elaboran', 'elaborÃ³', 'elaborado', 'elaborada', 'elaborados', 'elaboradas',
  'fabricar', 'fabricaciÃ³n', 'fabrica', 'fabrican', 'fabricÃ³', 'fabricado', 'fabricada', 'fabricados', 'fabricadas',
  'construir', 'construcciÃ³n', 'construcciones', 'construye', 'construyen', 'construyÃ³', 'construido', 'construida', 'construidos', 'construidas',
  'ejecutar', 'ejecuciÃ³n', 'ejecuta', 'ejecutan', 'ejecutÃ³', 'ejecutado', 'ejecutada', 'ejecutados', 'ejecutadas',
  'reparar', 'reparaciÃ³n', 'reparaciones', 'repara', 'reparan', 'reparado', 'reparada',
  'nivelar', 'nivelaciÃ³n', 'nivela', 'nivelan', 'nivelÃ³', 'nivelado', 'nivelada', 'nivelados', 'niveladas',
  'compactar', 'compactaciÃ³n', 'compacta', 'compactan', 'compactÃ³', 'compactado', 'compactada',
  'excavar', 'excavaciÃ³n', 'excavaciones', 'excava', 'excavan', 'excavÃ³', 'excavado', 'excavada',
  'demoler', 'demoliciÃ³n', 'demoliciones', 'demuele', 'demuelen', 'demoliÃ³', 'demolido', 'demolida', 'demolidos', 'demolidas',
  'acarrear', 'acarreo', 'acarreos', 'acarrea', 'acarrean', 'acarreado',
  'desalojar', 'desaloja', 'desalojo',
  'retirar', 'retiro', 'retiros', 'retira', 'retiran', 'retirÃ³', 'retirado', 'retirada',
  'limpiar', 'limpieza', 'limpia', 'limpian', 'limpiÃ³', 'limpiado', 'limpiada',
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
  'verificar', 'verificaciÃ³n', 'verifica', 'verifican', 'verificado', 'verificada',
  'revisar', 'revisa', 'revisan', 'revisado', 'revisada',
  'conectar', 'conexiÃ³n', 'conexiones', 'conecta', 'conectan', 'conectado', 'conectada', 'conectados', 'conectadas',
  'proteger', 'protecciÃ³n', 'protege', 'protegen', 'protegido', 'protegida', 'protegidos', 'protegidas',
  'cubrir', 'cubre', 'cubren', 'cubierto', 'cubierta', 'cubiertos', 'cubiertas',
  'apisonar', 'apisonado', 'apisonada', 'apisona',
  'adherir', 'adherencia', 'adhiere', 'adherido', 'adherida',
  'alinear', 'alineaciÃ³n', 'alinea', 'alineado', 'alineada',
  'afinar', 'afine', 'afinado', 'afina',
  'asentar', 'asentado', 'asentada', 'asentados', 'asentadas', 'asienta',
  'empotrar', 'empotrado', 'empotrada', 'empotra',
  'alojar', 'alojado', 'alojada', 'aloja',
  'fijar', 'fijaciÃ³n', 'fijado', 'fijada', 'fijados', 'fijadas', 'fija', 'fijo', 'fijas', 'fijos',
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
  'dosificar', 'dosificaciÃ³n', 'dosificado', 'dosificada',

  // Vocabulario completo de materiales, elementos y conceptos de obra
  'necesario', 'necesaria', 'necesarios', 'necesarias',
  'correcto', 'correcta', 'correctos', 'correctas',
  'completo', 'completa', 'completos', 'completas',
  'directo', 'directa', 'directos', 'directas',
  'indirecto', 'indirecta', 'indirectos', 'indirectas',
  'general', 'generales', 'particular', 'particulares',
  'especÃ­fico', 'especifica', 'especÃ­fica', 'especÃ­ficos', 'especÃ­ficas',
  'indicado', 'indicada', 'indicados', 'indicadas',
  'aparente', 'aparentes', 'rÃºstico', 'rustico', 'liso', 'lisa', 'lisos', 'lisas',
  'pulido', 'pulida', 'pulidos', 'pulidas', 'acabado', 'acabados',
  'fino', 'fina', 'finos', 'finas', 'grueso', 'gruesa', 'gruesos', 'gruesas',
  'firme', 'firmes', 'pesado', 'pesada', 'ligero', 'ligera',
  'alto', 'alta', 'altos', 'altas', 'altura', 'alturas',
  'bajo', 'baja', 'bajos', 'bajas', 'ancho', 'ancha', 'anchos', 'anchas', 'anchura',
  'largo', 'larga', 'largos', 'largas', 'longitud', 'longitudes',
  'espesor', 'espesores', 'diÃ¡metro', 'diÃ¡metros',
  'secciÃ³n', 'secciones', 'calibre', 'calibres', 'cÃ©dula',
  'norma', 'normas', 'normal', 'normales', 'proyecto', 'proyectos', 'obra', 'obras',
  'sitio', 'sitios', 'plano', 'planos', 'croquis', 'detalle', 'detalles',
  'planta', 'plantas', 'fachada', 'fachadas', 'especificaciÃ³n', 'especificaciones',
  'concepto', 'conceptos', 'partida', 'partidas', 'catÃ¡logo', 'catÃ¡logos',
  'matriz', 'matrices', 'precio', 'precios', 'unitario', 'unitarios',
  'presupuesto', 'presupuestos', 'importe', 'importes', 'cantidad', 'cantidades',
  'unidad', 'unidades', 'costo', 'costos', 'total', 'totales', 'subtotal', 'subtotales',
  'iva', 'sobrecosto', 'sobrecostos', 'financiamiento', 'utilidad',
  'fianza', 'fianzas', 'anticipo', 'anticipos', 'estimaciÃ³n', 'estimaciones',
  'generador', 'generadores', 'nÃºmero', 'nÃºmeros', 'clave', 'claves', 'cÃ³digo', 'cÃ³digos',
  'descripciÃ³n', 'descripciones', 'tipo', 'tipos', 'marca', 'marcas', 'modelo', 'modelos',
  'serie', 'series', 'lÃ­nea', 'lÃ­neas', 'color', 'colores',
  'peso', 'pesos', 'volumen', 'Ã¡rea', 'Ã¡reas', 'superficie', 'superficies',
  'capacidad', 'capacidades', 'resistencia', 'resistencias',
  'presiÃ³n', 'tensiÃ³n', 'temperatura', 'temperaturas', 'tiempo', 'tiempos', 'plazo', 'plazos',
  'fecha', 'fechas', 'semana', 'semanas', 'banco', 'tiro',
  'material', 'materiales', 'insumo', 'insumos', 'mano', 'manos',
  'equipo', 'equipos', 'herramienta', 'herramientas', 'menor', 'menores',
  'seguridad', 'protecciÃ³n', 'maquinaria', 'andamio', 'andamios', 'puntal', 'puntales',
  'cimbra', 'cimbras', 'madera', 'maderas', 'polÃ­n', 'polines', 'barrote', 'barrotes',
  'tabla', 'tablas', 'tablÃ³n', 'tablones', 'triplay', 'duela', 'duelas', 'tarima', 'tarimas',
  'concreto', 'concretos', 'premezclado', 'cemento', 'cementos', 'arena', 'grava', 'agua',
  'cal', 'yeso', 'estuco', 'aditivo', 'aditivos', 'acelerante', 'retardante',
  'impermeabilizante', 'impermeabilizantes',
  'acero', 'aceros', 'refuerzo', 'estructural', 'estructurales',
  'varilla', 'varillas', 'corrugada', 'corrugadas',
  'alambrÃ³n', 'alambre', 'recocido', 'malla', 'electrosoldada', 'electrodo', 'electrodos',
  'placa', 'placas', 'solera', 'soleras', 'Ã¡ngulo', 'Ã¡ngulos', 'canal', 'canales',
  'viga', 'vigas', 'perfil', 'perfiles', 'trabe', 'trabes', 'liga',
  'cerramiento', 'cerramientos', 'columna', 'columnas', 'castillo', 'castillos', 'armex',
  'dala', 'dalas', 'cadena', 'cadenas', 'zapata', 'zapatas', 'losa', 'losas',
  'firme', 'firmes', 'plantilla', 'plantillas', 'muro', 'muros', 'carga', 'divisorio', 'divisorios', 'contenciÃ³n',
  'tabique', 'tabiques', 'tabicÃ³n', 'block', 'blocks', 'bloque', 'bloques', 'ladrillo', 'ladrillos', 'hueco', 'huecos', 'macizo', 'macizos',
  'piso', 'pisos', 'pavimento', 'pavimentos', 'asfalto', 'adoquÃ­n', 'adoquines',
  'banqueta', 'banquetas', 'guarniciÃ³n', 'guarniciones', 'machuelo', 'machuelos',
  'techo', 'techos', 'cubierta', 'cubiertas', 'azotea', 'azoteas',
  'plafÃ³n', 'plafones', 'tablaroca', 'durock', 'panel', 'paneles',
  'zoclo', 'zoclos', 'rodapiÃ©', 'gotero', 'goteros', 'chaflÃ¡n', 'chaflanes',
  'pretil', 'pretiles', 'murete', 'muretes', 'dintel', 'dinteles', 'enrase', 'enrases',
  'entortado', 'enladrillado', 'aplanado', 'aplanados', 'tirol',
  'tubo', 'tubos', 'tuberÃ­a', 'tuberÃ­as', 'cobre', 'codo', 'codos', 'cople', 'coples',
  'reducciÃ³n', 'reducciones', 'tee', 'niple', 'niples', 'tuerca', 'tuercas',
  'tornillo', 'tornillos', 'taquete', 'taquetes', 'perno', 'pernos',
  'vÃ¡lvula', 'vÃ¡lvulas', 'llave', 'llaves', 'grifo', 'grifos',
  'bomba', 'bombas', 'cisterna', 'cisternas', 'tinaco', 'tinacos', 'tanque', 'tanques',
  'flotador', 'flotadores', 'presurizador', 'hidroneumÃ¡tico', 'biodigestor',
  'tarja', 'tarjas', 'lavabo', 'lavabos', 'lavadero', 'lavaderos',
  'inodoro', 'inodoros', 'mingitorio', 'mingitorios',
  'regadera', 'regaderas', 'coladera', 'coladeras', 'cespol',
  'cable', 'cables', 'conductor', 'conductores',
  'interruptor', 'interruptores', 'termomagnÃ©tico', 'termomagnÃ©ticos', 'pastilla', 'pastillas',
  'tablero', 'tableros', 'contacto', 'contactos', 'duplex', 'apagador', 'apagadores',
  'luminaria', 'luminarias', 'foco', 'focos', 'lÃ¡mpara', 'lÃ¡mparas', 'led',
  'registro', 'registros', 'caja', 'cajas', 'chalupa', 'chalupas', 'tapa', 'tapas', 'tapÃ³n', 'tapones',
  'cancelerÃ­a', 'aluminio', 'vidrio', 'vidrios', 'cristal', 'cristales', 'espejo', 'espejos',
  'puerta', 'puertas', 'ventana', 'ventanas', 'marco', 'marcos', 'chapa', 'chapas', 'cerradura', 'cerraduras',
  'bisagra', 'bisagras', 'jaladera', 'jaladeras',
  'herrerÃ­a', 'reja', 'rejas', 'barandal', 'barandales', 'pasamanos',
  'carpinterÃ­a', 'closet', 'closets', 'mueble', 'muebles',
  'esmalte', 'esmaltes', 'azulejo', 'azulejos', 'loseta', 'losetas', 'cerÃ¡mica', 'porcelanato',
  'mÃ¡rmol', 'granito', 'cantera', 'pegazulejo', 'boquilla', 'boquillas', 'junteador',
  'membrana', 'geotextil', 'retroexcavadora', 'revolvedora', 'bailarina', 'vibrador', 'compactador',
  'oficial', 'ayudante', 'ayudantes', 'peÃ³n', 'peones', 'cuadrilla', 'cuadrillas', 'cabo',
  'residente', 'supervisor', 'supervisiÃ³n', 'ingeniero', 'arquitecto', 'contratista',
  'abrazadera', 'abrazaderas', 'acometida', 'acometidas', 'acomodo', 'acopio', 'acoplador',
  'adaptador', 'adaptadores', 'afine', 'agarradera', 'agregado', 'agregados', 'ajustable', 'alargado',
  'alimenticio', 'alineaciÃ³n', 'anticalcÃ¡reo', 'anticorrosivo', 'bajada', 'bajadas',
  'balanceada', 'barreras', 'bastidor', 'bastidores', 'bicapa', 'blanco', 'blanca', 'blancos', 'blancas',
  'bloquera', 'bronce', 'calentador', 'calentadores', 'caoba', 'capa', 'capas', 'cara', 'caras',
  'carretilla', 'carretillas', 'cebolleta', 'cedro', 'cementada', 'cementar', 'centrÃ­fuga',
  'cepa', 'cepas', 'certificaciÃ³n', 'certificada', 'certificadas', 'cimientos', 'claro', 'claros',
  'conducciÃ³n', 'conduit', 'condulet', 'conector', 'conectores', 'contaminaciÃ³n', 'contramarco', 'contramarcos',
  'corrediza', 'corredizas', 'costeras', 'cromo', 'cuadro', 'cuadros', 'cuerpo', 'cuerpos',
  'desagÃ¼e', 'descarga', 'descargas', 'descargo', 'desenraice', 'desÃ©rtico', 'desnudo', 'desnuda', 'desplante',
  'dimensionamiento', 'distancia', 'distancias', 'doble', 'dobles', 'domÃ©stico', 'domiciliaria',
  'ecolÃ³gica', 'eje', 'ejes', 'electrolÃ­tico', 'escalerilla', 'especializada', 'especializadas',
  'estaciÃ³n', 'estacionario', 'estribo', 'estribos', 'estructura', 'estructuras', 'excÃ©ntrica',
  'exteriores', 'filtro', 'filtros', 'flexible', 'flexibles', 'flotador', 'flujo',
  'forrada', 'frecuencia', 'fregadero', 'fregaderos', 'fusible', 'fusibles',
  'galvanizado', 'galvanizada', 'galvanizados', 'galvanizadas', 'gas', 'grado', 'grados',
  'gris', 'grises', 'hembra', 'hembras', 'hierro', 'hilada', 'hiladas', 'horizontal', 'horizontales',
  'impulsor', 'indicador', 'indicadores', 'industrial', 'industriales', 'inoxidable', 'inoxidables',
  'integrado', 'integrada', 'interior', 'interiores', 'lÃ­quido', 'lÃ­quidos',
  'lubricaciÃ³n', 'macho', 'machos', 'maestra', 'maestras', 'mamposterÃ­a', 'maneral', 'manerales',
  'manguera', 'mangueras', 'mediciÃ³n', 'medida', 'medidas', 'medidor', 'medidores', 'mejorar',
  'mezcla', 'mezclas', 'mezcladora', 'mezcladoras', 'minuto', 'minutos', 'mirilla',
  'monofÃ¡sica', 'monomando', 'mordazas', 'mufa', 'mufas', 'multicapa', 'nariz',
  'natural', 'naturales', 'negro', 'negra', 'negros', 'negras', 'nicho', 'nichos',
  'omega', 'omegas', 'oriÃ³n', 'ostiÃ³n', 'pala', 'palas', 'paÃ±o', 'paÃ±os', 'paso', 'pasos',
  'piedra', 'piedras', 'pino', 'pisÃ³n', 'polarizado', 'polietileno', 'polipropileno', 'polos',
  'potencia', 'preliminar', 'preliminares', 'profundidad', 'proporciÃ³n',
  'razÃ³n', 'recta', 'recto', 'rectos', 'rectas', 'red', 'redes', 'redondo', 'redonda', 'redondos', 'redondas',
  'referencia', 'referencias', 'reforzado', 'reforzada', 'reforzados', 'reforzadas',
  'regulador', 'reguladores', 'rejilla', 'rejillas', 'relleno', 'rellenos', 'rendimiento',
  'resina', 'resinas', 'retrÃ¡ctil', 'revenimiento', 'reventÃ³n', 'roca', 'rocas', 'rojo', 'roja', 'rojos', 'rojas',
  'rugoso', 'rugosa', 'sanitaria', 'sanitario', 'sanitarias', 'sanitarios', 'seca', 'seco', 'secas', 'secos', 'secado',
  'semi', 'sencilla', 'sencillo', 'sencillas', 'sencillos', 'sentido', 'sentidos',
  'seÃ±alizaciÃ³n', 'seÃ±alamiento', 'servicio', 'servicios', 'sistema', 'sistemas',
  'tala', 'talud', 'taludes', 'taza', 'tazas', 'tepetate', 'termofusiÃ³n', 'termofusionable', 'termoplÃ¡stica',
  'terreno', 'terrenos', 'tierra', 'tierras', 'urbana', 'urbano', 'uso', 'usos',
  'velocidad', 'verde', 'verdes',
  // TÃ©rminos esenciales de construcciÃ³n y nÃºmeros
  'accesorios', 'agreg', 'apile', 'artic', 'base', 'bases', 'bastidor', 'bastidores', 'brasa',
  'centro', 'centros', 'comercial', 'comerciales', 'cualquier', 'cualquiera', 'dimension', 'dimensiÃ³n',
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
    showToast(this.enabled ? 'Corrector ortogrÃ¡fico activado' : 'Corrector ortogrÃ¡fico desactivado', 'info');
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
   * Verifica si una palabra se considera ortogrÃ¡ficamente vÃ¡lida.
   */
  isValidWord(rawWord) {
    if (!rawWord) return true;
    const word = rawWord.trim();
    if (!word || word.length <= 1) return true;

    // 1. Cualquier token que contenga dÃ­gitos es una cota, especificaciÃ³n o cÃ³digo tÃ©cnico
    // ej: 0.90x2.10, 1.50m, 12x20x40, 100amp.max, no.2, no.3, 250kg, 1/2", 120v, APU-01
    if (/\d/.test(word)) return true;

    // 2. Tokens con sÃ­mbolos tÃ©cnicos de obra (pulgadas, diagonales, fÃ³rmulas, grados, potencias)
    if (/[\/'"=Â°%Â²Â³\+]/.test(word)) return true;

    // 3. Siglas y cÃ³digos en mayÃºsculas de longitud corta (ej: CFE, NOM, NMX, PVC, CPVC, HDPE, IPR, APU, FO, GO, II)
    if (/^[A-Z0-9_\-\.]+$/.test(word) && word.length <= 6) return true;

    const lower = word.toLowerCase();

    // 4. Abreviaturas y notaciones tÃ©cnicas admitidas
    if (['no.', 'nÃºm.', 'num.', 'c/u', 'kg/cm2', 'kg/cmÂ²', 'ton/m3', 'ton/mÂ²', 'f\'c', 's/n', 'p.b', 'p.a', 'p.d', 'p.g', 'l.p', 'r.n'].includes(lower)) {
      return true;
    }

    // 5. En lista de ignorados para esta sesiÃ³n
    if (this.ignoredWords.has(lower)) return true;

    // 6. En diccionario de usuario
    if (this.customDictionary.has(lower)) return true;

    // 7. Si la palabra estÃ¡ en AUTOCORRECT_MAP y requiere acentuaciÃ³n (ej: colocacion -> colocaciÃ³n)
    if (AUTOCORRECT_MAP[lower] && AUTOCORRECT_MAP[lower].toLowerCase() !== lower) {
      return false;
    }

    // 8. En diccionario pre-aprobado (base espaÃ±ola y construcciÃ³n)
    if (SPANISH_BASE_DICT.has(lower)) return true;

    return false;
  }

  /**
   * Corrige el case respetando mayÃºsculas/minÃºsculas originales:
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
   * EvalÃºa si una palabra califica para autocorrecciÃ³n inmediata al teclear espacio:
   */
  getAutocorrectReplacement(rawWord, isSentenceStart = false) {
    if (!this.enabled || !rawWord || rawWord.length < 2) return null;

    // 1. Regla de Word: "Corregir DOS MAyÃºsculas Iniciales" (ej: COncreto -> Concreto)
    if (rawWord.length >= 3 && /^[A-ZÃÃ‰ÃÃ“ÃšÃ‘]{2}[a-zÃ¡Ã©Ã­Ã³ÃºÃ±]+$/.test(rawWord)) {
      const fixed = rawWord.charAt(0) + rawWord.slice(1).toLowerCase();
      const mapped = AUTOCORRECT_MAP[fixed.toLowerCase()];
      if (mapped) {
        return this.matchCasing(fixed, mapped);
      }
      return fixed;
    }

    const lower = rawWord.toLowerCase();

    // 2. Mapeo directo en tabla de autocorrecciÃ³n
    if (AUTOCORRECT_MAP[lower]) {
      let rep = AUTOCORRECT_MAP[lower];
      if (isSentenceStart && rep.length > 0) {
        rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      } else {
        rep = this.matchCasing(rawWord, rep);
      }
      return rep;
    }

    // 3. Regla morfolÃ³gica: Palabras que terminan en "cion" sin tilde
    if (lower.length >= 6 && lower.endsWith('cion')) {
      const corrected = lower.slice(0, -4) + 'ciÃ³n';
      let rep = this.matchCasing(rawWord, corrected);
      if (isSentenceStart) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      return rep;
    }

    // 4. Regla morfolÃ³gica: Palabras que terminan en "eria" sin tilde
    if (lower.length >= 6 && lower.endsWith('eria')) {
      const corrected = lower.slice(0, -4) + 'erÃ­a';
      let rep = this.matchCasing(rawWord, corrected);
      if (isSentenceStart) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
      return rep;
    }

    // 5. MayÃºscula inicial si es inicio de frase y comenzÃ³ en minÃºscula
    if (isSentenceStart && /^[a-zÃ¡Ã©Ã­Ã³ÃºÃ±]/.test(rawWord)) {
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

    // 2. Variaciones morfolÃ³gicas (-ciÃ³n, -erÃ­a)
    if (lower.endsWith('cion')) {
      suggestions.add(this.matchCasing(rawWord, lower.slice(0, -4) + 'ciÃ³n'));
    }
    if (lower.endsWith('eria')) {
      suggestions.add(this.matchCasing(rawWord, lower.slice(0, -4) + 'erÃ­a'));
    }

    // 3. Probar reemplazo directo de vocales no acentuadas por acentuadas
    // ej: valvula -> vÃ¡lvula, linea -> lÃ­nea, hidraulico -> hidrÃ¡ulico, maximo -> mÃ¡ximo, numero -> nÃºmero
    const vowels = { a: 'Ã¡', e: 'Ã©', i: 'Ã­', o: 'Ã³', u: 'Ãº' };
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

  // CÃ¡lculo de distancia de ediciÃ³n (Levenshtein)
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
            matrix[i - 1][j - 1] + 1, // sustituciÃ³n
            Math.min(
              matrix[i][j - 1] + 1,   // inserciÃ³n
              matrix[i - 1][j] + 1    // eliminaciÃ³n
            )
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Obtiene la palabra y sus coordenadas [start, end] en una posiciÃ³n especÃ­fica de texto.
   */
  getWordAtPosition(text, pos) {
    if (!text || typeof text !== 'string') return null;
    const len = text.length;
    if (pos < 0 || pos > len) return null;

    const isWordChar = (c) => /[a-zÃ¡Ã©Ã­Ã³ÃºÃ¼Ã±A-ZÃÃ‰ÃÃ“ÃšÃœÃ‘0-9\/\'\.\-]/.test(c);

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
    if (matchPunct && !['no.', 'nÃºm.', 'num.', 'c/u', 'kg/cm2', 'ton/m3', 'f\'c', 's/n', 'p.b', 'p.a', 'p.d', 'l.p'].includes(cleanWord.toLowerCase())) {
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
   * Identifica con alta precisiÃ³n la palabra y si es error bajo las coordenadas del mouse.
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

    // 3. Buscar si coincide directamente con algÃºn error previamente detectado en este campo
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

    // 4. Si no cayÃ³ en un error conocido, extraer la palabra en la posiciÃ³n pos
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
   * Escanea un texto completo y devuelve los errores encontrados con posiciÃ³n y sugerencias.
   */
  findSpellingErrorsInText(text) {
    if (!text || typeof text !== 'string') return [];

    const regex = /([a-zÃ¡Ã©Ã­Ã³ÃºÃ¼Ã±A-ZÃÃ‰ÃÃ“ÃšÃœÃ‘0-9\/\'\.\-]+)/g;
    const errors = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      let rawWord = match[0];
      let cleanWord = rawWord;
      let start = match.index;
      let end = start + rawWord.length;

      // Descartar puntuaciÃ³n final comÃºn a menos que sea abreviatura tÃ©cnica
      const matchPunct = cleanWord.match(/([\.,;:!?\)\"\'\]]+)$/);
      if (matchPunct && !['no.', 'nÃºm.', 'num.', 'c/u', 'kg/cm2', 'ton/m3', 'f\'c', 's/n', 'p.b', 'p.a', 'p.d', 'l.p'].includes(cleanWord.toLowerCase())) {
        const punctLen = matchPunct[1].length;
        cleanWord = cleanWord.slice(0, -punctLen);
        end -= punctLen;
      }

      if (!cleanWord || cleanWord.length <= 1) continue;

      // Si la palabra no es vÃ¡lida
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
   * Intercepta la pulsaciÃ³n de teclas para realizar autocorrecciÃ³n al pulsar espacio o puntuaciÃ³n.
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

    // Deshacer autocorrecciÃ³n con Backspace inmediato
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
    const match = textBefore.match(/([a-zÃ¡Ã©Ã­Ã³ÃºÃ¼Ã±A-ZÃÃ‰ÃÃ“ÃšÃœÃ‘0-9\/\'\.\-]+)$/);
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
   * Reemplaza la palabra errÃ³nea por la seleccionada en el target editable.
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
   * Oculta el menÃº contextual flotante.
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
   * Renderiza el contenido del menÃº flotante de correcciÃ³n con opciones completas.
   */
  renderContextMenu(menu, word, suggestions, x, y, onSelect, onIgnore, onAddDict, onManualFix) {
    const escape = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    menu.innerHTML = '';

    // Encabezado
    const header = document.createElement('div');
    header.className = 'px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 mb-1';
    header.innerHTML = `<span>CorrecciÃ³n: <span class="text-rose-600 font-semibold normal-case">${escape(word)}</span></span><i class="fa-solid fa-spell-check text-blue-600 text-xs"></i>`;
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
      // Si no hay sugerencias automÃ¡ticas, ofrecer entrada manual para no dejar al usuario sin opciÃ³n
      const noSug = document.createElement('div');
      noSug.className = 'px-2.5 py-1 text-slate-500 italic text-[11px] flex items-center gap-1.5';
      noSug.innerHTML = `<i class="fa-solid fa-circle-question text-slate-400 text-[10px]"></i><span>Sin sugerencias automÃ¡ticas</span>`;
      suggContainer.appendChild(noSug);

      const manualWrap = document.createElement('div');
      manualWrap.className = 'px-2 py-1 flex items-center gap-1';
      manualWrap.innerHTML = `
        <input type="text" id="spell-manual-fix-input" class="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-500 focus:bg-white" placeholder="Escribir correcciÃ³n...">
        <button type="button" id="spell-manual-fix-btn" class="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition cursor-pointer" title="Aplicar correcciÃ³n">
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
   * Inicializa el escucha del menÃº contextual (clic derecho) estilo Word.
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

      // Si la palabra es correcta, dejamos que el navegador muestre su menÃº normal (copiar, pegar, etc.)
      if (!wordInfo.isError) {
        this.hideContextMenu();
        return;
      }

      // Â¡Palabra con error! Desplegar menÃº de Word
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

    // Copiar estilos geomÃ©tricos para alineaciÃ³n 1:1 exacta
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
   * Configura atributos de ortografÃ­a en un elemento (desactivando el subrayado nativo del navegador para evitar falsos positivos).
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
   * InicializaciÃ³n global del observador y escuchas de eventos.
   */
  initGlobalObserver() {
    // 1. Escuchar pulsaciones de teclas para autocorrecciÃ³n estilo Word
    document.addEventListener('keydown', (e) => this.handleKeydown(e), true);

    // 2. Inicializar menÃº contextual de clic derecho estilo Word
    this.initSpellContextMenu();

    // 3. Interceptar foco para asegurar atributos y adjuntar resaltadores
    document.addEventListener('focusin', (e) => {
      if (e.target) this.enforceElementSpellcheck(e.target);
    }, true);

    // 4. Aplicar de inmediato a todos los inputs y textareas existentes
    document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]').forEach(el => {
      this.enforceElementSpellcheck(el);
    });

    // 5. Observar mutaciones dinÃ¡micas (al desplegar nodos, modales, etc.)
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
