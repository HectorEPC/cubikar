/**
 * wordAutocorrectService.js
 * Motor de Autocorrección, Subrayado Ondulado Rojo en Vivo y Menú Contextual (Clic Derecho) estilo Microsoft Word.
 * 
 * Características:
 * 1. Subrayado rojo ondulado en tiempo real en descripciones y campos editables al escribir.
 * 2. Menú contextual flotante al hacer clic derecho sobre cualquier palabra con error:
 *    - Sugerencias inmediatas ordenadas por similitud fonética y distancia de edición.
 *    - Reemplazo instantáneo al hacer clic en una sugerencia.
 *    - "Omitir palabra" para ignorar en la sesión.
 *    - "Agregar al diccionario" con persistencia en localStorage.
 * 3. Menú contextual estándar preservado si se hace clic derecho en palabras correctas.
 * 4. Autocorrección rápida al teclear espacio/puntuación (COncreto -> Concreto, m2 -> m², tildes técnicas).
 * 5. Deshacer con Backspace inmediato.
 * 6. Diccionario de construcción civil, arquitectura, administración de obra y español general.
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

// Diccionario base amplio de español y terminología de construcción y arquitectura
const SPANISH_BASE_DICT = new Set([
  ...DEFAULT_WHITELIST,
  ...Object.values(AUTOCORRECT_MAP).map(w => w.toLowerCase()),

  // Preposiciones, conjunciones y conectores gramaticales
  'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'durante', 'en', 'entre',
  'hacia', 'hasta', 'mediante', 'para', 'por', 'según', 'segun', 'sin', 'so', 'sobre', 'tras',
  'versus', 'vía', 'via', 'y', 'e', 'ni', 'o', 'u', 'pero', 'mas', 'sino', 'siquiera',
  'aunque', 'porque', 'pues', 'ya', 'si', 'como', 'que', 'conforme', 'mientras', 'cuando', 'donde',

  // Artículos, pronombres y determinantes
  'el', 'la', 'los', 'las', 'lo', 'un', 'una', 'uno', 'unos', 'unas', 'del', 'al',
  'este', 'esta', 'estos', 'estas', 'esto', 'ese', 'esa', 'esos', 'esas', 'eso',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'aquello', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'nuestro', 'nuestra', 'nuestros', 'nuestras', 'cuyo', 'cuya', 'cuyos', 'cuyas',
  'otro', 'otra', 'otros', 'otras', 'mismo', 'misma', 'mismos', 'mismas',
  'todo', 'toda', 'todos', 'todas', 'cada', 'cierto', 'cierta', 'ciertos', 'ciertas',
  'tal', 'tales', 'tanto', 'tanta', 'tantos', 'tantas', 'mucho', 'mucha', 'muchos', 'muchas',
  'poco', 'poca', 'pocos', 'pocas', 'bastante', 'bastantes', 'demasiado', 'demasiada',
  'alguno', 'alguna', 'algunos', 'algunas', 'algún', 'algun', 'ninguno', 'ninguna', 'ningún',
  'ambos', 'ambas', 'propio', 'propia', 'propios', 'propias',
  'yo', 'tú', 'tu', 'él', 'ella', 'ello', 'nosotros', 'nosotras', 'ellos', 'ellas', 'usted', 'ustedes',
  'me', 'te', 'se', 'nos', 'le', 'les',

  // Adverbios comunes
  'no', 'sí', 'ya', 'más', 'menos', 'bien', 'mal', 'muy', 'tan', 'así', 'asi',
  'acá', 'aca', 'aquí', 'aqui', 'allí', 'alli', 'allá', 'alla', 'ahí', 'ahi',
  'cerca', 'lejos', 'arriba', 'abajo', 'delante', 'detrás', 'detras', 'dentro', 'fuera',
  'antes', 'después', 'despues', 'luego', 'pronto', 'tarde', 'temprano', 'siempre', 'nunca',
  'jamás', 'jamas', 'apenas', 'casi', 'solo', 'solamente', 'también', 'tambien', 'además', 'ademas',

  // Verbos frecuentes (obra y español general)
  'suministro', 'suministros', 'suministrar', 'suministrado', 'suministrada', 'suministrados', 'suministradas',
  'colocación', 'colocar', 'colocado', 'colocada', 'colocados', 'colocadas', 'colocando',
  'instalación', 'instalar', 'instalado', 'instalada', 'instalados', 'instaladas', 'instalando',
  'aplicación', 'aplicar', 'aplicado', 'aplicada', 'aplicados', 'aplicadas',
  'elaboración', 'elaborar', 'elaborado', 'elaborada', 'elaborados', 'elaboradas',
  'fabricación', 'fabricar', 'fabricado', 'fabricada', 'fabricados', 'fabricadas',
  'construcción', 'construir', 'construido', 'construida', 'construidos', 'construidas',
  'ejecución', 'ejecutar', 'ejecutado', 'ejecutada', 'ejecutados', 'ejecutadas',
  'reparación', 'reparar', 'reparado', 'reparada', 'reparados', 'reparadas',
  'nivelación', 'nivelar', 'nivelado', 'nivelada', 'nivelados', 'niveladas',
  'compactación', 'compactar', 'compactado', 'compactada', 'compactados', 'compactadas',
  'excavación', 'excavar', 'excavado', 'excavada',
  'demolición', 'demoler', 'demolido', 'demolida', 'demolidos', 'demolidas',
  'incluye', 'incluyen', 'incluido', 'incluida', 'incluidos', 'incluidas', 'incluyendo',
  'acarreo', 'acarrear', 'acarreado', 'habilitado', 'armado', 'cimbrado', 'descimbrado',
  'colado', 'vibrado', 'curado', 'plomado', 'ranurado', 'resanado', 'sellado', 'emboquillado',
  'pintado', 'limpieza', 'limpiar', 'retiro', 'retirar', 'verificar', 'revisar',
  'ser', 'es', 'son', 'era', 'eran', 'fue', 'fueron', 'será', 'sera', 'serán', 'sido', 'siendo',
  'estar', 'está', 'están', 'estaba', 'estaban', 'estuvo', 'estado', 'estados',
  'haber', 'hay', 'había', 'habia', 'hubo',
  'tener', 'tiene', 'tienen', 'tenía', 'tenia', 'tuvo', 'tenido',
  'hacer', 'hace', 'hacen', 'hizo', 'hecho', 'hecha', 'hechos', 'hechas',
  'dar', 'da', 'dan', 'dio', 'dado', 'dada', 'dados', 'dadas',
  'ir', 'va', 'van', 'iba', 'ido',
  'ver', 've', 'ven', 'vio', 'visto', 'vista', 'vistos', 'vistas',
  'poder', 'puede', 'pueden', 'pudo', 'podrá', 'podra',
  'deber', 'debe', 'deben', 'debido', 'debida', 'debidos', 'debidas',
  'usar', 'usa', 'usan', 'usado', 'usada', 'usados', 'usadas',
  'utilizar', 'utiliza', 'utilizan', 'utilizado', 'utilizada', 'utilizados', 'utilizadas',
  'quedar', 'queda', 'quedan', 'quedado',
  'llevar', 'lleva', 'llevan', 'llevado',

  // Sustantivos y Adjetivos de construcción, arquitectura y obra
  'necesario', 'necesaria', 'necesarios', 'necesarias',
  'correcto', 'correcta', 'correctos', 'correctas',
  'completo', 'completa', 'completos', 'completas',
  'directo', 'directa', 'directos', 'directas',
  'indirecto', 'indirecta', 'indirectos', 'indirectas',
  'general', 'generales', 'particular', 'particulares',
  'específico', 'especifica', 'específicos', 'específicas',
  'indicado', 'indicada', 'indicados', 'indicadas',
  'aparente', 'aparentes', 'rústico', 'rustico', 'liso', 'lisa', 'pulido', 'pulida',
  'acabado', 'acabados', 'fino', 'fina', 'grueso', 'gruesa', 'firme', 'firmes',
  'pesado', 'pesada', 'ligero', 'ligera',
  'alto', 'alta', 'altura', 'bajo', 'baja', 'ancho', 'ancha', 'anchura',
  'largo', 'larga', 'longitud', 'espesor', 'espesores', 'diámetro', 'diametro',
  'sección', 'seccion', 'secciones', 'calibre', 'calibres', 'cédula', 'cedula',
  'norma', 'normas', 'proyecto', 'proyectos', 'obra', 'obras', 'sitio', 'sitios',
  'plano', 'planos', 'croquis', 'detalle', 'detalles', 'corte', 'cortes', 'planta', 'plantas',
  'fachada', 'fachadas', 'especificación', 'especificaciones',
  'concepto', 'conceptos', 'partida', 'partidas', 'catálogo', 'catalogos', 'catálogos',
  'matriz', 'matrices', 'precio', 'precios', 'unitario', 'unitarios',
  'presupuesto', 'presupuestos', 'importe', 'importes', 'cantidad', 'cantidades',
  'unidad', 'unidades', 'costo', 'costos', 'total', 'totales', 'subtotal', 'subtotales',
  'iva', 'sobrecosto', 'financiamiento', 'utilidad', 'fianza', 'fianzas', 'anticipo', 'anticipos',
  'estimación', 'estimaciones', 'generador', 'generadores',
  'número', 'numero', 'números', 'numeros', 'clave', 'claves', 'código', 'codigo',
  'descripción', 'descripciones', 'tipo', 'tipos', 'marca', 'marcas', 'modelo', 'modelos',
  'serie', 'series', 'línea', 'lineas', 'líneas', 'color', 'colores',
  'peso', 'pesos', 'volumen', 'área', 'superficie', 'capacidad', 'resistencia',
  'presión', 'tensión', 'temperatura', 'tiempo', 'plazo', 'fecha',
  'día', 'días', 'semana', 'semanas', 'mes', 'meses', 'año', 'años', 'hora', 'horas',
  'jornada', 'jornadas', 'viaje', 'viajes', 'tramo', 'tramos', 'lote', 'lotes',
  'juego', 'juegos', 'pieza', 'piezas', 'salida', 'salidas',
  'banco', 'tiro', 'material', 'materiales', 'insumo', 'insumos',
  'mano', 'obra', 'equipo', 'equipos', 'herramienta', 'herramientas', 'menor',
  'seguridad', 'protección', 'maquinaria', 'andamio', 'andamios', 'puntal', 'puntales',
  'cimbra', 'cimbras', 'madera', 'polín', 'polin', 'polines', 'barrote', 'barrotes',
  'tabla', 'tablas', 'tablón', 'triplay', 'duela', 'tarima', 'tarimas',
  'concreto', 'premezclado', 'cemento', 'arena', 'grava', 'agua', 'cal', 'yeso', 'estuco',
  'aditivo', 'acelerante', 'retardante', 'impermeabilizante',
  'acero', 'refuerzo', 'estructural', 'varilla', 'varillas', 'corrugada', 'corrugadas',
  'alambrón', 'alambre', 'recocido', 'malla', 'electrosoldada', 'soldadura', 'electrodo',
  'placa', 'placas', 'solera', 'soleras', 'ángulo', 'angulos', 'canal', 'canales',
  'viga', 'vigas', 'perfil', 'perfiles', 'ipr', 'ips', 'ptr', 'hss',
  'trabe', 'trabes', 'liga', 'cerramiento', 'cerramientos', 'columna', 'columnas',
  'castillo', 'castillos', 'armex', 'dala', 'dalas', 'cadena', 'cadenas',
  'zapata', 'zapatas', 'losa', 'losas', 'firme', 'firmes', 'plantilla', 'plantillas',
  'muro', 'muros', 'carga', 'divisorio', 'contención',
  'tabique', 'tabicón', 'block', 'bloque', 'ladrillo', 'hueco', 'macizo',
  'piso', 'pisos', 'pavimento', 'pavimentos', 'asfalto', 'adoquín', 'adoquines',
  'banqueta', 'banquetas', 'guarnición', 'guarniciones', 'machuelo', 'machuelos',
  'techo', 'techos', 'cubierta', 'cubiertas', 'azotea', 'azoteas',
  'plafón', 'plafones', 'tablaroca', 'durock', 'panel', 'paneles',
  'zoclo', 'zoclos', 'rodapié', 'gotero', 'chaflán', 'pretil', 'pretiles', 'murete', 'muretes',
  'dintel', 'dinteles', 'enrase', 'enrases', 'entortado', 'enladrillado', 'aplanado', 'tirol',
  'tubo', 'tubos', 'tubería', 'tuberias', 'cobre', 'pvc', 'cpvc', 'cxc', 'hdpe', 'pead',
  'codo', 'codos', 'cople', 'coples', 'reducción', 'reducciones', 'tee', 'niple', 'niples',
  'tuerca', 'tuercas', 'tornillo', 'tornillos', 'taquete', 'taquetes', 'anclaje', 'perno', 'pernos',
  'válvula', 'válvulas', 'llave', 'llaves', 'grifo', 'grifos',
  'bomba', 'bombas', 'cisterna', 'cisternas', 'tinaco', 'tinacos', 'tanque', 'tanques',
  'flotador', 'flotadores', 'presurizador', 'hidroneumático', 'biodigestor',
  'tarja', 'tarjas', 'lavabo', 'lavabos', 'inodoro', 'inodoros', 'mingitorio', 'mingitorios',
  'regadera', 'regaderas', 'coladera', 'coladeras', 'cespol',
  'cable', 'cables', 'conductor', 'conductores', 'thw', 'thhn',
  'interruptor', 'interruptores', 'termomagnético', 'pastilla', 'pastillas',
  'tablero', 'tableros', 'centro', 'centros', 'carga',
  'contacto', 'contactos', 'duplex', 'apagador', 'apagadores',
  'luminaria', 'luminarias', 'foco', 'focos', 'lámpara', 'lámparas', 'led',
  'registro', 'registros', 'caja', 'cajas', 'chalupa', 'tapa', 'tapas',
  'cancelería', 'aluminio', 'vidrio', 'vidrios', 'cristal', 'cristales', 'espejo', 'espejos',
  'puerta', 'puertas', 'ventana', 'ventanas', 'marco', 'marcos', 'chapa', 'chapas', 'cerradura',
  'bisagra', 'bisagras', 'jaladera', 'jaladeras',
  'herrería', 'reja', 'rejas', 'barandal', 'barandales', 'pasamanos',
  'carpintería', 'closet', 'closets', 'mueble', 'muebles',
  'pintura', 'pinturas', 'esmalte', 'esmaltes', 'vinílica', 'acrílica', 'epóxica', 'sellador', 'barniz',
  'azulejo', 'azulejos', 'loseta', 'losetas', 'cerámica', 'porcelanato', 'mármol', 'granito', 'cantera',
  'pegazulejo', 'boquilla', 'junteador',
  'camión', 'camiones', 'volteo', 'retroexcavadora', 'revolvedora', 'bailarina', 'vibrador', 'compactador',
  'oficial', 'ayudante', 'peón', 'peones', 'cuadrilla', 'cabo', 'residente', 'supervisor', 'supervisión',
  'ingeniero', 'arquitecto', 'contratista',

  // Abreviaturas y notaciones comunes
  'no', 'no.', 'núm', 'num', 'núm.', 'num.', 'c/u', 'promedio', 'similar', 'equivalente'
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
    showToast(this.enabled ? 'Corrector ortográfico estilo Word activado' : 'Corrector ortográfico desactivado', 'info');
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

    // Abreviaturas y notaciones técnicas admitidas
    const lower = word.toLowerCase();
    if (['no.', 'núm.', 'num.', 'c/u', 'kg/cm2', 'kg/cm²', 'ton/m3', 'ton/m²', 'f\'c'].includes(lower)) {
      return true;
    }

    // Números, medidas técnicas (ej: 250kg, 1/2", 12.5m), códigos con guion (PRE-001)
    if (/^[0-9]+([\.,\/][0-9]+)*$/.test(word)) return true;
    if (/^[0-9]+(\/|'|")?[a-zA-Z%²³°\/]*$/.test(word)) return true;
    if (/^[A-Z0-9_\-]+$/.test(word)) return true; // Claves en mayúsculas como CLV-01, APU1
    if (word.includes('/') || word.includes('=')) return true; // f'c=250, kg/m2

    // En lista de ignorados para esta sesión
    if (this.ignoredWords.has(lower)) return true;

    // En diccionario de usuario
    if (this.customDictionary.has(lower)) return true;

    // Si la palabra está en AUTOCORRECT_MAP y requiere acentuación (ej: colocacion -> colocación)
    if (AUTOCORRECT_MAP[lower] && AUTOCORRECT_MAP[lower].toLowerCase() !== lower) {
      return false;
    }

    // En diccionario pre-aprobado
    if (SPANISH_BASE_DICT.has(lower)) return true;

    return false;
  }

  /**
   * Corrige el case respetando mayúsculas/minúsculas originales:
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

    // 3. Buscar en el diccionario base por distancia de Levenshtein (1 o 2 cambios)
    const candidates = [];
    for (const dictWord of SPANISH_BASE_DICT) {
      if (Math.abs(dictWord.length - lower.length) > 2) continue;
      const dist = this.levenshtein(lower, dictWord);
      if (dist <= 2) {
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
   * Obtiene la palabra y sus coordenadas [start, end] en una posición específica de texto.
   */
  getWordAtPosition(text, pos) {
    if (!text || typeof text !== 'string') return null;
    const len = text.length;
    if (pos < 0 || pos > len) return null;

    const isWordChar = (c) => /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ0-9\/\'\.\-]/.test(c);

    let checkPos = pos;
    // Si el cursor cayó al final de la palabra o en un separador tras la palabra
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
    if (matchPunct && !['no.', 'núm.', 'num.', 'c/u', 'kg/cm2', 'ton/m3', 'f\'c'].includes(cleanWord.toLowerCase())) {
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
      if (matchPunct && !['no.', 'núm.', 'num.', 'c/u', 'kg/cm2', 'ton/m3', 'f\'c'].includes(cleanWord.toLowerCase())) {
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
   * Renderiza el contenido del menú flotante de corrección.
   */
  renderContextMenu(menu, word, suggestions, x, y, onSelect, onIgnore, onAddDict) {
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
      const noSug = document.createElement('div');
      noSug.className = 'px-3 py-1.5 text-slate-400 italic text-[11px]';
      noSug.innerText = 'Sin sugerencias disponibles';
      suggContainer.appendChild(noSug);
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

    // Mostrar y posicionar evitando desbordamiento
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

      const text = isContentEditable ? target.innerText : target.value;
      if (!text) {
        this.hideContextMenu();
        return;
      }

      // En Chromium, target.selectionStart ya refleja la posición del clic derecho
      let pos = typeof target.selectionStart === 'number' ? target.selectionStart : -1;
      
      const wordInfo = this.getWordAtPosition(text, pos);
      if (!wordInfo || !wordInfo.word) {
        this.hideContextMenu();
        return;
      }

      // Si la palabra es correcta, dejamos que el navegador muestre su menú normal (copiar, pegar, etc.)
      if (this.isValidWord(wordInfo.word)) {
        this.hideContextMenu();
        return;
      }

      // ¡Palabra con error! Desplegar menú de Word
      e.preventDefault();
      e.stopPropagation();

      activeTarget = target;
      activeWordInfo = wordInfo;

      const suggestions = this.getSuggestions(wordInfo.word);
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

    // Solo soportamos textarea e input de texto
    const isTextarea = element.tagName === 'TEXTAREA';
    const isInput = element.tagName === 'INPUT' && (element.type === 'text' || !element.type);
    if (!isTextarea && !isInput) return;

    // Buscar si ya existe un backdrop hermano en su contenedor
    let backdrop = element.parentElement ? element.parentElement.querySelector('.cubikar-spell-backdrop') : null;

    // Si no tiene contenedor o backdrop, crearlo dinámicamente si es posible
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

    // Actualización inicial
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
   * Configura atributos nativos de spellcheck en un elemento.
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

      // Si es un textarea con clase desc-input o dentro de un wrap, adjuntar resaltador
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

    // 3. Interceptar foco para asegurar atributos de ortografía y adjuntar resaltadores
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
