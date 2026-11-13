// js/ui/resizer.js
// Controlador de redimensionamiento arrastrable del panel APU / Matriz adaptativo a la resolución de pantalla.

import { APU_WIDTH_KEY } from '../config/constants.js';

let isResizingApu = false;
let startResizeX = 0;
let startApuWidth = 480;

/**
 * Calcula y limita el ancho del panel APU respetando:
 * 1. La resolución actual de la pantalla y el ancho del contenedor view-cat.
 * 2. Un ancho mínimo vital para la tabla de catálogo (tb1-container) para que nunca se colapse ni empuje el panel fuera de la pantalla.
 * 3. Márgenes, gaps y el propio ancho del divisor (panel-resizer).
 */
export function getClampedApuWidth(targetWidth) {
  const container = document.getElementById('view-cat');
  const containerWidth = container ? container.clientWidth : (typeof window !== 'undefined' ? window.innerWidth : 1280);

  // Espacio ocupado por padding del contenedor p-3 (12px * 2 = 24px) + gap-3 (12px * 2 = 24px) + divisor (10px)
  const overhead = 58;
  const usableWidth = Math.max(340, containerWidth - overhead);

  // La tabla de presupuesto principal debe conservar siempre espacio mínimo suficiente (mínimo 320px o 28% del espacio)
  const minTableWidth = Math.max(320, Math.floor(usableWidth * 0.28));

  // Ancho mínimo del panel APU (para que sus tarjetas, botones y inputs se lean bien)
  const minApuWidth = Math.min(320, Math.floor(usableWidth * 0.5));

  // Ancho máximo del panel APU: nunca puede sobrepasar el espacio que deja la tabla ni el 70% del contenedor
  const maxApuWidth = Math.max(minApuWidth, Math.min(
    Math.floor(usableWidth * 0.70),
    usableWidth - minTableWidth
  ));

  const parsed = parseInt(targetWidth, 10);
  if (isNaN(parsed) || parsed <= 0) {
    // Ancho sugerido inicial adaptado a la resolución (alrededor de 480px, pero sin rebasar límites)
    return Math.max(minApuWidth, Math.min(480, maxApuWidth));
  }

  return Math.max(minApuWidth, Math.min(parsed, maxApuWidth));
}

// Inicialización del divisor arrastrable entre el catálogo y el panel APU
export function initPanelResizer() {
  const resizer = document.getElementById('panel-resizer');
  const apuPanel = document.getElementById('apu-panel');
  const container = document.getElementById('view-cat');
  if (!resizer || !apuPanel || !container) return;

  // Restaurar ancho previo guardado en localStorage, siempre validado contra la resolución actual
  const savedWidth = localStorage.getItem(APU_WIDTH_KEY);
  const clampedWidth = getClampedApuWidth(savedWidth);
  apuPanel.style.width = `${clampedWidth}px`;
  apuPanel.style.maxWidth = `${getClampedApuWidth(99999)}px`;

  function startDrag(clientX) {
    isResizingApu = true;
    startResizeX = clientX;
    startApuWidth = apuPanel.offsetWidth || parseInt(apuPanel.style.width, 10) || 480;

    // Desactivar transiciones durante el arrastre para evitar retraso visual y desbordamiento
    const tb1 = document.getElementById('tb1-container');
    if (tb1) tb1.style.transition = 'none';
    apuPanel.style.transition = 'none';

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('bg-blue-600', 'ring-2', 'ring-blue-300');
  }

  function onDrag(clientX) {
    if (!isResizingApu) return;
    const dx = clientX - startResizeX;
    // Al arrastrar hacia la izquierda (dx < 0), el panel APU a la derecha crece
    const targetWidth = startApuWidth - dx;
    const clamped = getClampedApuWidth(targetWidth);
    apuPanel.style.width = `${clamped}px`;
  }

  function endDrag() {
    if (!isResizingApu) return;
    isResizingApu = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizer.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-300');

    // Restaurar transiciones normales
    const tb1 = document.getElementById('tb1-container');
    if (tb1) tb1.style.transition = '';
    apuPanel.style.transition = '';

    const finalWidth = apuPanel.offsetWidth || parseInt(apuPanel.style.width, 10);
    if (finalWidth) {
      localStorage.setItem(APU_WIDTH_KEY, finalWidth);
    }
  }

  // Eventos de Mouse
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startDrag(e.clientX);

    function onMouseMove(e) {
      onDrag(e.clientX);
    }
    function onMouseUp() {
      endDrag();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Soporte para pantallas táctiles
  resizer.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length > 0) {
      startDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isResizingApu && e.touches && e.touches.length > 0) {
      onDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (isResizingApu) endDrag();
  });

  // Listener de redimensionamiento de ventana para adaptar automáticamente la ventana desplegable
  window.addEventListener('resize', () => {
    if (apuPanel && !apuPanel.classList.contains('hidden') && apuPanel.style.width) {
      const currentWidth = parseInt(apuPanel.style.width, 10);
      const clamped = getClampedApuWidth(currentWidth);
      apuPanel.style.width = `${clamped}px`;
      apuPanel.style.maxWidth = `${getClampedApuWidth(99999)}px`;
    }
  });
}
