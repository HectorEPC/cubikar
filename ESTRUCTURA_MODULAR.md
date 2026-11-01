# 🏗️ Guía del Sistema Modular - Control de Obra (ES6)

¡Tu aplicación ha sido completamente modularizada y optimizada!
Se preservó el 100% de la funcionalidad, estilos, fórmulas de sobrecosto, conexión a Google Search Grounding y datos previos.

---

## 🚀 ¿Cómo abrir la aplicación?

Para abrir la aplicación sin restricciones de seguridad del navegador (CORS para módulos ES6):

1. **Haz doble clic en el archivo `iniciar_app.bat`**.
2. Se abrirá una pequeña ventana de consola y **tu navegador web se abrirá automáticamente** en la dirección:
   `http://localhost:8080/`
3. ¡Listo! Puedes trabajar con total normalidad.
4. Para cerrar el servidor cuando termines, simplemente cierra la ventanita negra de la consola o presiona `Ctrl + C`.

---

## 📂 ¿Dónde está cada función en tu nuevo proyecto?

A partir de ahora, cuando quieras que agreguemos o cambiemos algo, cada cosa está en su carpeta correspondiente:

### 1. 🎨 Estilos Visuales
* `css/styles.css`: Barras de desplazamiento personalizadas, resaltado de filas seleccionadas, selectores de color en círculo, menús desplegables.

### 2. 🗄️ Configuración y Datos Iniciales
* `js/config/constants.js`: Nombres de claves de almacenamiento local (`localStorage`).
* `js/config/defaultData.js`: El catálogo de demostración inicial (Cimentación, Firme de concreto, Fexpan, Estructura).

### 3. 🧠 Estado y Guardado
* `js/state/store.js`: Guarda los datos del presupuesto (`treeData`), configuraciones (`settings`) y persistencia automática en el navegador.
* `js/state/history.js`: Sistema de Deshacer (`Ctrl+Z` / Botón Deshacer) y Rehacer.

### 4. 📐 Núcleo y Fórmulas
* `js/core/calculations.js`: Fórmulas de Sobrecosto (Indirectos, Financiamiento, Utilidad, Cargos adicionales) y sumatorias del presupuesto.
* `js/core/colors.js`: Generación y caché de colores progresivos por nivel jerárquico.
* `js/core/formatters.js`: Formateo de moneda (`$1,234.56`) y cantidades de obra con 2 decimales.

### 5. 📑 Catálogo de Conceptos (TAB1-CAT-BASE)
* `js/modules/catalog/treeService.js`: Lógica de agregar partidas, sub-renglones, duplicar, copiar, pegar, mover filas arriba/abajo, eliminar y renumeración de claves (`1`, `1.1`, etc.).
* `js/modules/catalog/catalogView.js`: Dibuja en pantalla la tabla principal y maneja la selección de filas.

### 6. 📊 Matriz de Precios Unitarios (APU)
* `js/modules/apu/apuService.js`: Agregar insumos, modificar cantidades/costos, eliminar y filtros por tipo (Material, M. Obra, Equipo, Subcontrato).
* `js/modules/apu/apuView.js`: Dibuja la tabla de la Matriz APU, la tabla inferior de insumos de obra y el recuadro de cotizaciones de Google.

### 7. 📦 Insumos Generales (Explosión de Insumos)
* `js/modules/insumosGenerales/insumosConsolidator.js`: Suma todos los insumos de la obra agrupados por categoría.
* `js/modules/insumosGenerales/insumosView.js`: Dibuja las tablas de Materiales, Mano de Obra, Equipos y Subcontratos, búsqueda en tiempo real, cambio de costo unitario masivo y unificación de insumos.

### 8. 🤖 Inteligencia Artificial y Cotización
* `js/modules/ai/geminiClient.js`: Conexión con Gemini 3.8 Flash y Google Search Grounding en tiempo real.
* `js/modules/ai/localEstimator.js`: Generador de matrices APU usando los Catálogos Locales Importados (BIMSA / Gobierno en IndexedDB). Analiza el concepto, extrae palabras clave, localiza materiales, cuadrillas de mano de obra y equipo reales en la base de datos local y construye la matriz con claves y costos de referencia oficiales.

### 9. 💾 Archivos, Importación y Catálogos de Referencia
* `js/modules/io/universalImporter.js`: Importador universal compatible con Excel (.xlsx, .xls BIMSA), CSV y JSON. Detección automática de columnas, vista previa de registros, selector de hojas y selector de destino (Catálogo Maestro vs Presupuesto Activo).
* `js/modules/reference/referenceDb.js`: Motor de base de datos local IndexedDB (`APU_REFERENCE_DB`) para almacenar cientos de miles de registros de referencia (BIMSA, Gobierno) con búsquedas instantáneas y sin límite de 5MB.
* `js/modules/reference/presetCatalogs.js`: Instalador y gestor de la biblioteca de 61,000+ conceptos e insumos de BIMSA 2018 (6 especialidades de Opus) y Tabulador Oficial de Gobierno en 1 clic.
* `js/modules/reference/masterCatalogModal.js`: Buscador y explorador del Catálogo Maestro de Referencia (Opción 1), con filtros por rubro y catálogo, pestaña de instalación en 1 clic de BIMSA/Gobierno, inserción al presupuesto con 1 clic y administración/eliminación de catálogos.
* `js/modules/reference/apuAssistantModal.js`: Asistente de insumos para la matriz de precios unitarios (Opción 2), con búsqueda por categoría (Material, M. Obra, Equipo) e inserción directa con rendimiento a la matriz activa.
* `js/modules/io/csvHandler.js`: Exportación del presupuesto de obra activo a CSV.
* `js/vendor/xlsx.full.min.js`: Librería local SheetJS para procesar hojas de cálculo 100% offline en el navegador.
* `data/`: Paquetes maestros estructurados y optimizados de BIMSA 2018 (Edificación, Instalaciones, Infraestructura, Industrial, HVAC) y Gobierno 2022.

### 10. 🖥️ Interfaz de Usuario
* `js/ui/resizer.js`: Barra vertical arrastrable para agrandar o reducir el panel de matrices e insumos.
* `js/ui/modalController.js`: Ventanas emergentes de configuración, generación por IA y cambio entre pestañas.
* `js/ui/notifications.js`: Notificaciones tipo "Toast" en la esquina inferior derecha.

### 11. 🚀 Archivo Maestro
* `js/app.js`: Une todos los módulos anteriores y los conecta con la página.
* `index.html`: Ahora es un archivo limpio y ligero (se redujo de más de 3,200 líneas a solo 850 líneas).
* `index_monolitico_backup.html`: Copia de seguridad intacta del archivo original previo a la modularización.
