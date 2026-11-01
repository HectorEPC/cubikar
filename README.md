# Sistema de Control de Obra y Presupuestos Base (APU)

Plataforma profesional para la elaboración, administración y control integral de presupuestos de obra, análisis de precios unitarios (APU), matrices de costos directos, factores de sobrecosto y explosión de insumos generales, con soporte para Google Search Grounding e importación universal de catálogos.

---

## 🚀 Características Principales

- **Catálogo de Conceptos y Presupuesto Base (TAB1-CAT-BASE)**:
  - Estructura jerárquica ilimitada (partidas, subpartidas, conceptos).
  - Cálculo dinámico de costos directos, factores de sobrecosto y precios de venta.
  - Formato estricto a 2 decimales para importes, cantidades y rendimientos.
  - Reordenamiento rápido de filas (atajos `Alt + Flecha Arriba / Abajo`).
  - Personalización de colores por partida.

- **Análisis de Precios Unitarios (APU)**:
  - Desglose detallado por 4 rubros: Materiales, Mano de Obra, Maquinaria/Equipo y Subcontratos.
  - Ventana modal maximizable con ficha técnica del concepto.
  - Vista dual: Matriz de Costo Unitario y Explosión Total de Obra.

- **Consolidado de Insumos Generales**:
  - Explosión automática y consolidada de todos los insumos de la obra.
  - Filtros por categoría y búsqueda en tiempo real.
  - Edición masiva de costos y combinación inteligente de insumos duplicados.

- **Identidad Corporativa y Branding**:
  - Personalización del Nombre de la Empresa y Logotipo.
  - Visor interactivo con recorte cuadrado (1:1), zoom deslizante (+/-) y arrastre para encuadre.
  - Nombre del Proyecto y Ubicación editables en tiempo real y sincronizados en todas las vistas.

- **Impresión y Exportación Profesional (PDF / Papel)**:
  - Formatos oficiales estandarizados para Presupuesto Base, Matriz APU e Insumos Generales.
  - Encabezado corporativo institucional con logotipo cuadrado, datos de empresa, proyecto, ubicación, fecha, sobrecosto y moneda de trabajo.

- **Importación Universal de Catálogos**:
  - Soporte para archivos `.xlsx`, `.xls`, `.csv` y `.json`.
  - Compatibilidad directa con catálogos maestros exportados de Opus, Neodata y bases de datos locales.

---

## 🛠️ Tecnologías

- **Frontend**: HTML5, Tailwind CSS, FontAwesome 6.
- **Motor de Aplicación**: JavaScript Modular (ES Modules nativos).
- **Procesamiento de Archivos**: SheetJS (`xlsx.full.min.js`).
- **Almacenamiento**: LocalStorage y IndexedDB para bases de datos de referencia locales.

---

## 📋 Uso

1. Abre `index.html` en cualquier navegador web moderno (Chrome, Edge, Firefox, Safari).
2. No requiere instalación de servidores ni dependencias externas; funciona 100% de manera local y offline.
