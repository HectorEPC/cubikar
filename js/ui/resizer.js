import { APU_WIDTH_KEY } from '../config/constants.js';

let isResizingApu = false;
let startResizeX = 0;
let startApuWidth = 480;

// Inicialización del divisor arrastrable entre el catálogo y el panel APU
export function initPanelResizer() {
  const resizer = document.getElementById('panel-resizer');
  const apuPanel = document.getElementById('apu-panel');
  const container = document.getElementById('view-cat');
  if (!resizer || !apuPanel || !container) return;

  // Restaurar ancho previo guardado en localStorage
  const savedWidth = localStorage.getItem(APU_WIDTH_KEY);
  if (savedWidth) {
    const parsed = parseInt(savedWidth, 10);
    if (!isNaN(parsed) && parsed >= 320) {
      apuPanel.style.width = `${parsed}px`;
    }
  }

  function startDrag(clientX) {
    isResizingApu = true;
    startResizeX = clientX;
    startApuWidth = apuPanel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    resizer.classList.add('bg-blue-600', 'ring-2', 'ring-blue-300');
  }

  function onDrag(clientX) {
    if (!isResizingApu) return;
    const dx = clientX - startResizeX;
    // Al arrastrar hacia la izquierda (dx < 0), el panel APU a la derecha crece
    let newWidth = startApuWidth - dx;
    const containerWidth = container.clientWidth;
    const minW = 320;
    const maxW = Math.max(380, Math.floor(containerWidth * 0.86));
    newWidth = Math.max(minW, Math.min(newWidth, maxW));
    apuPanel.style.width = `${newWidth}px`;
  }

  function endDrag() {
    if (!isResizingApu) return;
    isResizingApu = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    resizer.classList.remove('bg-blue-600', 'ring-2', 'ring-blue-300');
    localStorage.setItem(APU_WIDTH_KEY, apuPanel.offsetWidth);
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
}
