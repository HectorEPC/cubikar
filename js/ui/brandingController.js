// js/ui/brandingController.js
// Controlador para personalización de Nombre de Empresa, Proyecto, Ubicación y Logotipo con visor interactivo, recorte y zoom

import { state } from '../state/store.js';
import { SETTINGS_KEY } from '../config/constants.js';
import { showToast } from './notifications.js';

// Dimensiones estándar del área de recorte para el logotipo (cuadrado 1:1)
const CROP_WIDTH = 180;
const CROP_HEIGHT = 180;

// Estado del ajustador interactivo de logotipo
const adjusterState = {
  image: null,
  scale: 1,
  minScale: 0.1,
  maxScale: 5,
  baseFitScale: 1,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  initialOffsetX: 0,
  initialOffsetY: 0,
  bgMode: 'transparent', // 'transparent' | 'white'
  listenersAttached: false
};

// Guardar configuración en localStorage
function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (e) {
    console.error('Error guardando branding en settings:', e);
  }
}

// Inicializar y renderizar branding al cargar la app
export function initBranding() {
  renderBrandingUI();
}

// Actualizar elementos visuales del encabezado y formularios de configuración
export function renderBrandingUI() {
  const companyName = (state.settings && state.settings.companyName) || 'Sistema de Control de Obra';
  const companySubtitle = (state.settings && state.settings.companySubtitle) || '';
  const companyLogo = (state.settings && state.settings.companyLogo) || '';
  const projectName = (state.settings && state.settings.projectName) || 'Proyecto de Obra Base';
  const projectLocation = (state.settings && state.settings.projectLocation) || 'Ciudad de México, CDMX';

  // 1. Campo de texto de la empresa en la barra superior
  const inputName = document.getElementById('header-company-name');
  if (inputName && inputName.value !== companyName) {
    inputName.value = companyName;
  }

  // 2. Campo de texto del proyecto (en Catálogo e Insumos Generales)
  const inputProject = document.getElementById('header-project-name');
  if (inputProject && inputProject.value !== projectName) {
    inputProject.value = projectName;
  }
  const inputInsumosProject = document.getElementById('insumos-project-name');
  if (inputInsumosProject && inputInsumosProject.value !== projectName) {
    inputInsumosProject.value = projectName;
  }

  // 3. Campo de texto de la ubicación del proyecto (en Catálogo e Insumos Generales)
  const inputLocation = document.getElementById('header-project-location');
  if (inputLocation && inputLocation.value !== projectLocation) {
    inputLocation.value = projectLocation;
  }
  const inputInsumosLocation = document.getElementById('insumos-project-location');
  if (inputInsumosLocation && inputInsumosLocation.value !== projectLocation) {
    inputInsumosLocation.value = projectLocation;
  }

  const inputSubtitle = document.getElementById('header-company-subtitle');
  if (inputSubtitle && inputSubtitle.value !== companySubtitle) {
    inputSubtitle.value = companySubtitle;
  }

  // 4. Icono o imagen del logo en barra superior
  const defaultIcon = document.getElementById('default-company-icon');
  const customImg = document.getElementById('custom-company-logo');
  const btnRemove = document.getElementById('btn-remove-company-logo');
  const btnHeaderAdjust = document.getElementById('btn-header-adjust-logo');
  const container = document.getElementById('company-logo-container');

  if (companyLogo && companyLogo.trim().length > 0) {
    if (customImg) {
      customImg.src = companyLogo;
      customImg.classList.remove('hidden');
    }
    if (defaultIcon) defaultIcon.classList.add('hidden');
    if (btnRemove) btnRemove.classList.remove('hidden');
    if (btnHeaderAdjust) btnHeaderAdjust.classList.remove('hidden');
    if (container) {
      container.title = 'Haz clic para cambiar o ajustar el logotipo de la empresa';
      container.classList.add('bg-white');
      container.classList.remove('bg-slate-800/80');
    }
  } else {
    if (customImg) {
      customImg.src = '';
      customImg.classList.add('hidden');
    }
    if (defaultIcon) defaultIcon.classList.remove('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');
    if (btnHeaderAdjust) btnHeaderAdjust.classList.add('hidden');
    if (container) {
      container.title = 'Haz clic para subir el logotipo de la empresa';
      container.classList.remove('bg-white');
      container.classList.add('bg-slate-800/80');
    }
  }

  // 5. Sincronizar en modal de Configuración si los campos existen
  const modalName = document.getElementById('cfg-company-name');
  if (modalName && modalName.value !== companyName) modalName.value = companyName;

  const modalProject = document.getElementById('cfg-project-name');
  if (modalProject && modalProject.value !== projectName) modalProject.value = projectName;

  const modalLocation = document.getElementById('cfg-project-location');
  if (modalLocation && modalLocation.value !== projectLocation) modalLocation.value = projectLocation;

  const modalSubtitle = document.getElementById('cfg-company-subtitle');
  if (modalSubtitle && modalSubtitle.value !== companySubtitle) modalSubtitle.value = companySubtitle;

  const modalLogoPreview = document.getElementById('cfg-company-logo-preview');
  const modalEmptyIcon = document.getElementById('cfg-company-logo-empty-icon');
  const btnAdjustCurrent = document.getElementById('btn-adjust-current-logo');

  if (modalLogoPreview) {
    if (companyLogo) {
      modalLogoPreview.src = companyLogo;
      modalLogoPreview.classList.remove('hidden');
      if (modalEmptyIcon) modalEmptyIcon.classList.add('hidden');
      if (btnAdjustCurrent) btnAdjustCurrent.classList.remove('hidden');
    } else {
      modalLogoPreview.src = '';
      modalLogoPreview.classList.add('hidden');
      if (modalEmptyIcon) modalEmptyIcon.classList.remove('hidden');
      if (btnAdjustCurrent) btnAdjustCurrent.classList.add('hidden');
    }
  }
}

// Actualizar nombre de la empresa
export function updateCompanyName(name) {
  const cleanName = (name || '').trim() || 'Sistema de Control de Obra';
  if (!state.settings) state.settings = {};
  state.settings.companyName = cleanName;
  persistSettings();
  renderBrandingUI();
  showToast('Nombre de la empresa guardado', 'success');
}

// Actualizar nombre del proyecto
export function updateProjectName(name) {
  const cleanProject = (name || '').trim() || 'Proyecto de Obra Base';
  if (!state.settings) state.settings = {};
  state.settings.projectName = cleanProject;
  persistSettings();
  renderBrandingUI();
  showToast('Nombre del proyecto guardado', 'success');
}

// Actualizar ubicación del proyecto
export function updateProjectLocation(loc) {
  const cleanLoc = (loc || '').trim() || 'Ciudad de México, CDMX';
  if (!state.settings) state.settings = {};
  state.settings.projectLocation = cleanLoc;
  persistSettings();
  renderBrandingUI();
  showToast('Ubicación del proyecto guardada', 'success');
}

// Actualizar subtítulo de la empresa
export function updateCompanySubtitle(sub) {
  const cleanSub = (sub || '').trim();
  state.settings.companySubtitle = cleanSub;
  persistSettings();
  renderBrandingUI();
}

// Disparador del selector de archivos de imagen
export function triggerCompanyLogoUpload() {
  const input = document.getElementById('company-logo-input');
  if (input) input.click();
}

// Manejar selección de imagen e iniciar el ajustador interactivo
export function handleCompanyLogoUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Selecciona un archivo de imagen válido (PNG, JPG, SVG, WebP).', 'warning');
    return;
  }

  try {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        openLogoAdjusterModal(img);
      };
      img.onerror = () => {
        showToast('No se pudo procesar la imagen seleccionada', 'error');
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      showToast('Error al leer el archivo de imagen', 'error');
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('Error al abrir imagen:', err);
    showToast('Error al abrir la imagen: ' + err.message, 'error');
  } finally {
    if (event.target) event.target.value = '';
  }
}

// Quitar logo personalizado y regresar al sombrero amarillo
export function removeCompanyLogo(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  state.settings.companyLogo = '';
  persistSettings();
  renderBrandingUI();
  showToast('Logotipo restablecido al ícono predeterminado', 'info');
}

// --------------------------------------------------------------------------
// MÓDULO DE AJUSTE, RECORTE, PAN Y ZOOM INTERACTIVO DE LOGOTIPO
// --------------------------------------------------------------------------

function setupAdjusterCanvasListeners() {
  const canvas = document.getElementById('logo-adjuster-canvas');
  if (!canvas || adjusterState.listenersAttached) return;
  adjusterState.listenersAttached = true;

  // Arrastre con ratón
  canvas.addEventListener('mousedown', (e) => {
    if (!adjusterState.image) return;
    adjusterState.isDragging = true;
    adjusterState.dragStartX = e.clientX;
    adjusterState.dragStartY = e.clientY;
    adjusterState.initialOffsetX = adjusterState.offsetX;
    adjusterState.initialOffsetY = adjusterState.offsetY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!adjusterState.isDragging || !adjusterState.image) return;
    const dx = e.clientX - adjusterState.dragStartX;
    const dy = e.clientY - adjusterState.dragStartY;
    adjusterState.offsetX = adjusterState.initialOffsetX + dx;
    adjusterState.offsetY = adjusterState.initialOffsetY + dy;
    renderAdjusterCanvas();
  });

  window.addEventListener('mouseup', () => {
    adjusterState.isDragging = false;
  });

  // Arrastre táctil
  canvas.addEventListener('touchstart', (e) => {
    if (!adjusterState.image || e.touches.length === 0) return;
    adjusterState.isDragging = true;
    adjusterState.dragStartX = e.touches[0].clientX;
    adjusterState.dragStartY = e.touches[0].clientY;
    adjusterState.initialOffsetX = adjusterState.offsetX;
    adjusterState.initialOffsetY = adjusterState.offsetY;
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (!adjusterState.isDragging || !adjusterState.image || e.touches.length === 0) return;
    const dx = e.touches[0].clientX - adjusterState.dragStartX;
    const dy = e.touches[0].clientY - adjusterState.dragStartY;
    adjusterState.offsetX = adjusterState.initialOffsetX + dx;
    adjusterState.offsetY = adjusterState.initialOffsetY + dy;
    renderAdjusterCanvas();
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    adjusterState.isDragging = false;
  });

  // Zoom con rueda del ratón
  canvas.addEventListener('wheel', (e) => {
    if (!adjusterState.image) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const newScale = Math.min(Math.max(adjusterState.scale * factor, adjusterState.minScale), adjusterState.maxScale);
    setLogoZoom(newScale);
  }, { passive: false });
}

// Dibujar canvas de encuadre
export function renderAdjusterCanvas() {
  const canvas = document.getElementById('logo-adjuster-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Limpiar
  ctx.clearRect(0, 0, w, h);

  // Fondo con cuadrícula sutil (damero) para visibilidad de transparencias
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, w, h);

  const gridSize = 14;
  ctx.fillStyle = '#cbd5e1';
  for (let y = 0; y < h; y += gridSize) {
    for (let x = 0; x < w; x += gridSize) {
      if ((Math.floor(x / gridSize) + Math.floor(y / gridSize)) % 2 === 0) {
        ctx.fillRect(x, y, gridSize, gridSize);
      }
    }
  }

  const cropX = Math.round((w - CROP_WIDTH) / 2);
  const cropY = Math.round((h - CROP_HEIGHT) / 2);

  // Dibujar imagen escalada y posicionada
  if (adjusterState.image) {
    const img = adjusterState.image;
    const imgW = img.width * adjusterState.scale;
    const imgH = img.height * adjusterState.scale;
    const centerX = cropX + CROP_WIDTH / 2 + adjusterState.offsetX;
    const centerY = cropY + CROP_HEIGHT / 2 + adjusterState.offsetY;

    if (adjusterState.bgMode === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cropX, cropY, CROP_WIDTH, CROP_HEIGHT);
    }

    ctx.save();
    ctx.drawImage(img, centerX - imgW / 2, centerY - imgH / 2, imgW, imgH);
    ctx.restore();
  }

  // Máscara oscura para delimitar el área que no quedará en el corte
  ctx.fillStyle = 'rgba(15, 23, 42, 0.70)';
  // Superior
  ctx.fillRect(0, 0, w, cropY);
  // Inferior
  ctx.fillRect(0, cropY + CROP_HEIGHT, w, h - (cropY + CROP_HEIGHT));
  // Izquierda
  ctx.fillRect(0, cropY, cropX, CROP_HEIGHT);
  // Derecha
  ctx.fillRect(cropX + CROP_WIDTH, cropY, w - (cropX + CROP_WIDTH), CROP_HEIGHT);

  // Borde principal del recuadro de recorte (azul profesional)
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.strokeRect(cropX, cropY, CROP_WIDTH, CROP_HEIGHT);

  // Guías de esquinas blancas
  const cornerLen = 14;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;

  // Esquina superior izquierda
  ctx.beginPath();
  ctx.moveTo(cropX, cropY + cornerLen);
  ctx.lineTo(cropX, cropY);
  ctx.lineTo(cropX + cornerLen, cropY);
  ctx.stroke();

  // Esquina superior derecha
  ctx.beginPath();
  ctx.moveTo(cropX + CROP_WIDTH - cornerLen, cropY);
  ctx.lineTo(cropX + CROP_WIDTH, cropY);
  ctx.lineTo(cropX + CROP_WIDTH, cropY + cornerLen);
  ctx.stroke();

  // Esquina inferior izquierda
  ctx.beginPath();
  ctx.moveTo(cropX, cropY + CROP_HEIGHT - cornerLen);
  ctx.lineTo(cropX, cropY + CROP_HEIGHT);
  ctx.lineTo(cropX + cornerLen, cropY + CROP_HEIGHT);
  ctx.stroke();

  // Esquina inferior derecha
  ctx.beginPath();
  ctx.moveTo(cropX + CROP_WIDTH - cornerLen, cropY + CROP_HEIGHT);
  ctx.lineTo(cropX + CROP_WIDTH, cropY + CROP_HEIGHT);
  ctx.lineTo(cropX + CROP_WIDTH, cropY + CROP_HEIGHT - cornerLen);
  ctx.stroke();

  // Cruz tenue de alineación central
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cropX + CROP_WIDTH / 2, cropY);
  ctx.lineTo(cropX + CROP_WIDTH / 2, cropY + CROP_HEIGHT);
  ctx.moveTo(cropX, cropY + CROP_HEIGHT / 2);
  ctx.lineTo(cropX + CROP_WIDTH, cropY + CROP_HEIGHT / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Actualizar previsualización en vivo
  updateLivePreviews();
}

// Generar DataURL del recorte exacto
function generateCroppedDataUrl() {
  if (!adjusterState.image) return '';
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = CROP_WIDTH;
  exportCanvas.height = CROP_HEIGHT;
  const ctx = exportCanvas.getContext('2d');

  if (adjusterState.bgMode === 'white') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CROP_WIDTH, CROP_HEIGHT);
  }

  ctx.save();
  ctx.translate(CROP_WIDTH / 2 + adjusterState.offsetX, CROP_HEIGHT / 2 + adjusterState.offsetY);
  const w = adjusterState.image.width * adjusterState.scale;
  const h = adjusterState.image.height * adjusterState.scale;
  ctx.drawImage(adjusterState.image, -w / 2, -h / 2, w, h);
  ctx.restore();

  const mime = adjusterState.bgMode === 'white' ? 'image/jpeg' : 'image/png';
  return exportCanvas.toDataURL(mime, 0.92);
}

// Actualizar las mini vistas previas en tiempo real
function updateLivePreviews() {
  if (!adjusterState.image) return;
  const previewData = generateCroppedDataUrl();
  const headerPreview = document.getElementById('logo-live-preview-header');
  const docPreview = document.getElementById('logo-live-preview-doc');
  if (headerPreview) headerPreview.src = previewData;
  if (docPreview) docPreview.src = previewData;

  const pctEl = document.getElementById('logo-zoom-percent');
  if (pctEl) {
    const pct = Math.round((adjusterState.scale / adjusterState.baseFitScale) * 100);
    pctEl.innerText = `${pct}%`;
  }

  const nameEl = document.getElementById('logo-preview-company-name');
  if (nameEl) {
    nameEl.innerText = (state.settings && state.settings.companyName) || 'Sistema de Control de Obra';
  }
}

// Ajustar nivel de zoom directamente desde el slider
export function setLogoZoom(value) {
  if (!adjusterState.image) return;
  adjusterState.scale = Math.min(Math.max(value, adjusterState.minScale), adjusterState.maxScale);
  const slider = document.getElementById('logo-zoom-slider');
  if (slider && Math.abs(parseFloat(slider.value) - adjusterState.scale) > 0.001) {
    slider.value = adjusterState.scale.toFixed(3);
  }
  renderAdjusterCanvas();
}

// Ajustar zoom incremental con botones +/-
export function adjustLogoZoom(delta) {
  if (!adjusterState.image) return;
  setLogoZoom(adjusterState.scale + delta * adjusterState.baseFitScale);
}

// Restablecer posición y zoom al centro óptimo
export function resetLogoPosition() {
  if (!adjusterState.image) return;
  adjusterState.scale = adjusterState.baseFitScale;
  adjusterState.offsetX = 0;
  adjusterState.offsetY = 0;
  const slider = document.getElementById('logo-zoom-slider');
  if (slider) slider.value = adjusterState.scale.toFixed(3);
  renderAdjusterCanvas();
}

// Cambiar modo de fondo (transparente vs blanco)
export function setLogoBgMode(mode) {
  adjusterState.bgMode = mode;
  renderAdjusterCanvas();
}

// Abrir el modal de ajuste con un objeto Image cargado
export function openLogoAdjusterModal(imgElement) {
  if (!imgElement) return;
  adjusterState.image = imgElement;

  // Escala para ajustar la imagen en el recuadro
  const fitW = CROP_WIDTH / imgElement.width;
  const fitH = CROP_HEIGHT / imgElement.height;
  adjusterState.baseFitScale = Math.min(fitW, fitH) * 0.95;
  adjusterState.scale = adjusterState.baseFitScale;
  adjusterState.minScale = adjusterState.baseFitScale * 0.25;
  adjusterState.maxScale = Math.max(adjusterState.baseFitScale * 6, 4.0);
  adjusterState.offsetX = 0;
  adjusterState.offsetY = 0;
  adjusterState.bgMode = 'transparent';

  const modal = document.getElementById('logo-adjuster-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  const slider = document.getElementById('logo-zoom-slider');
  if (slider) {
    slider.min = adjusterState.minScale.toFixed(3);
    slider.max = adjusterState.maxScale.toFixed(3);
    slider.step = ((adjusterState.maxScale - adjusterState.minScale) / 100).toFixed(4);
    slider.value = adjusterState.scale.toFixed(3);
  }

  const radioTrans = document.querySelector('input[name="logo-bg-mode"][value="transparent"]');
  if (radioTrans) radioTrans.checked = true;

  setupAdjusterCanvasListeners();
  renderAdjusterCanvas();
}

// Abrir el modal de ajuste para el logotipo actual almacenado
export function openCurrentLogoAdjuster() {
  const currentLogo = state.settings && state.settings.companyLogo;
  if (!currentLogo) {
    triggerCompanyLogoUpload();
    return;
  }
  const img = new Image();
  img.onload = () => openLogoAdjusterModal(img);
  img.onerror = () => triggerCompanyLogoUpload();
  img.src = currentLogo;
}

// Cerrar modal de ajuste de logotipo
export function closeLogoAdjusterModal() {
  const modal = document.getElementById('logo-adjuster-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Guardar logotipo ajustado en el sistema
export function applyAdjustedLogo() {
  if (!adjusterState.image) return;
  try {
    const finalDataUrl = generateCroppedDataUrl();
    if (!state.settings) state.settings = {};
    state.settings.companyLogo = finalDataUrl;
    persistSettings();
    renderBrandingUI();
    closeLogoAdjusterModal();
    showToast('¡Logotipo ajustado y guardado correctamente!', 'success');
  } catch (err) {
    console.error('Error al aplicar logo:', err);
    showToast('Error al guardar logotipo: ' + err.message, 'error');
  }
}
