// js/ui/tutorialHubModal.js
// Modal centralizado "Centro de Tutoriales y Aprendizaje" para Cubikar
// Permite al usuario elegir entre el Tour Guiado en Vivo (Alternativa 3) con botón de Saltar,
// o el Reproductor Web de Video-Simulación Animada (Alternativa 1).

import { startInteractiveTour, isTourDismissed, resetTourDismissedStatus } from './interactiveTour.js';
import { openVideoSimulatorModal, VIDEO_MODULES } from './videoSimulatorModal.js';

let isTutorialHubOpen = false;

/**
 * Abre el Hub de Tutoriales
 */
export function openTutorialHubModal() {
  injectTutorialHubDom();
  const modal = document.getElementById('cubikar-tutorial-hub-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    isTutorialHubOpen = true;
  }
}

/**
 * Cierra el Hub de Tutoriales
 */
export function closeTutorialHubModal() {
  const modal = document.getElementById('cubikar-tutorial-hub-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    isTutorialHubOpen = false;
  }
}

/**
 * Inicia el Tour Guiado contextual cerrando el Hub
 */
export function launchTourFromHub() {
  closeTutorialHubModal();

  // Detectar en qué pantalla está el usuario
  const viewPortal = document.getElementById('view-portal');
  let tourId = 'portal';

  if (!viewPortal || viewPortal.classList.contains('hidden')) {
    const viewCompras = document.getElementById('view-compras');
    const viewBitacora = document.getElementById('view-bitacora');

    if (viewCompras && !viewCompras.classList.contains('hidden')) {
      tourId = 'compras';
    } else if (viewBitacora && !viewBitacora.classList.contains('hidden')) {
      tourId = 'bitacora';
    } else {
      tourId = 'workspace';
    }
  }

  setTimeout(() => {
    startInteractiveTour(tourId, true);
  }, 120);
}

/**
 * Abre el reproductor de video en un módulo específico desde el Hub
 */
export function launchVideoFromHub(moduleId = 1) {
  closeTutorialHubModal();
  setTimeout(() => {
    openVideoSimulatorModal(moduleId);
  }, 120);
}

/**
 * Restablece la preferencia de tours para volver a verlos automáticamente
 */
export function resetTourPreferencesFromHub() {
  resetTourDismissedStatus();
  if (typeof window.showToast === 'function') {
    window.showToast('✅ Preferencias restablecidas: los tours volverán a mostrarse.', 'success');
  }
}

function injectTutorialHubDom() {
  if (document.getElementById('cubikar-tutorial-hub-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'cubikar-tutorial-hub-modal';
  modal.className = 'fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[99997] hidden items-center justify-center p-3 sm:p-5 animate-in fade-in zoom-in-95 duration-150 select-none';
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100">
      
      <!-- Encabezado con degradado institucional -->
      <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-4 sm:p-5 flex justify-between items-center border-b border-slate-800 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/40 text-amber-400 flex items-center justify-center text-lg shadow-sm">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <div>
            <h2 class="font-extrabold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              Centro de Tutoriales y Aprendizaje
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                100% de la App
              </span>
            </h2>
            <p class="text-xs text-slate-300">
              Elige cómo deseas aprender a utilizar Cubikar: Tour en vivo interactivo o Video-Simulador
            </p>
          </div>
        </div>

        <button type="button" onclick="window.closeTutorialHubModalAction()"
                class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Cerrar">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>

      <!-- Contenido de las 2 Alternativas -->
      <div class="p-4 sm:p-6 overflow-y-auto custom-scroll space-y-6 flex-1 text-xs">
        
        <!-- Tarjetas Principales de Selección (Alternativa 1 vs Alternativa 3) -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          
          <!-- TARJETA 1: TOUR EN VIVO INTERACTIVO (Alternativa 3) -->
          <div class="p-5 rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-850 border border-slate-700/80 hover:border-blue-500/60 transition flex flex-col justify-between group shadow-lg">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-blue-600/30 text-blue-300 border border-blue-400/40 flex items-center gap-1.5">
                  <i class="fa-solid fa-wand-magic-sparkles text-[9px]"></i>
                  ALTERNATIVA 3
                </span>
                <span class="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <i class="fa-solid fa-forward-step text-[9px]"></i> Con botón de Saltar
                </span>
              </div>

              <div>
                <h3 class="font-extrabold text-base text-white group-hover:text-blue-300 transition">
                  Tour Guiado en Vivo
                </h3>
                <p class="text-slate-300 text-xs mt-1 leading-relaxed">
                  Aprende directamente sobre la interfaz real. La pantalla se atenúa y un <strong>foco de luz</strong> te indica dónde hacer clic, qué llenar y para qué sirve cada botón.
                </p>
              </div>

              <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-1.5 text-[11px] text-slate-300">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-circle-check text-blue-400 text-xs"></i>
                  <span>Focos de atención visuales en tiempo real.</span>
                </div>
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-circle-check text-blue-400 text-xs"></i>
                  <span>Botón visible <strong>"Saltar Tutorial"</strong> para cerrar en cualquier momento.</span>
                </div>
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-circle-check text-blue-400 text-xs"></i>
                  <span>No vuelve a molestar si decides omitirlo.</span>
                </div>
              </div>
            </div>

            <button type="button" onclick="window.launchTourFromHubAction()"
                    class="mt-5 w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 transition cursor-pointer">
              <i class="fa-solid fa-person-walking-arrow-right text-sm"></i>
              <span>Iniciar Tour Guiado en Pantalla Actual</span>
            </button>
          </div>

          <!-- TARJETA 2: REPRODUCTOR DE VIDEO-SIMULACIÓN (Alternativa 1) -->
          <div class="p-5 rounded-2xl bg-gradient-to-b from-slate-800/80 to-slate-850 border border-slate-700/80 hover:border-amber-500/60 transition flex flex-col justify-between group shadow-lg">
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center gap-1.5">
                  <i class="fa-solid fa-circle-play text-[9px]"></i>
                  ALTERNATIVA 1
                </span>
                <span class="text-[10px] text-slate-400 font-mono">15 Módulos</span>
              </div>

              <div>
                <h3 class="font-extrabold text-base text-white group-hover:text-amber-300 transition">
                  Video-Simulador Interactivo
                </h3>
                <p class="text-slate-300 text-xs mt-1 leading-relaxed">
                  Visualiza cómo se utiliza Cubikar con un <strong>cursor animado</strong> que recorre la pantalla, hace clics, llena campos y despliega <strong>subtítulos paso a paso</strong> con controles de video.
                </p>
              </div>

              <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-1.5 text-[11px] text-slate-300">
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-circle-check text-amber-400 text-xs"></i>
                  <span>Controles Play, Pausa, barra de tiempo y velocidad 1.5x / 2x.</span>
                </div>
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-circle-check text-amber-400 text-xs"></i>
                  <span>Simulación visual con clics animados y subtítulos.</span>
                </div>
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-circle-check text-amber-400 text-xs"></i>
                  <span>Cobertura al 100% de los 15 módulos del sistema.</span>
                </div>
              </div>
            </div>

            <button type="button" onclick="window.launchVideoFromHubAction(1)"
                    class="mt-5 w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-md shadow-amber-500/30 transition cursor-pointer">
              <i class="fa-solid fa-play text-xs"></i>
              <span>Abrir Reproductor de Video (Módulo 1)</span>
            </button>
          </div>

        </div>

        <!-- Acceso Directo por Módulo (Los 15 Temas de Cubikar) -->
        <div class="space-y-3 pt-2">
          <div class="flex items-center justify-between pb-1 border-b border-slate-800">
            <h4 class="font-bold text-xs text-slate-200 flex items-center gap-2">
              <i class="fa-solid fa-film text-blue-400"></i>
              <span>Acceso Directo a los 15 Módulos en Video</span>
            </h4>
            <span class="text-[10px] text-slate-400">Haz clic en cualquier módulo para reproducir</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            ${VIDEO_MODULES.map(m => `
              <div onclick="window.launchVideoFromHubAction(${m.id})"
                   class="p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 hover:bg-slate-750 hover:border-slate-700 transition cursor-pointer flex items-center gap-2.5 group">
                <div class="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 text-amber-400 group-hover:text-blue-400 flex items-center justify-center shrink-0 transition">
                  <i class="fa-solid ${m.icon} text-xs"></i>
                </div>
                <div class="min-w-0 flex-1">
                  <span class="font-semibold text-[11px] text-slate-200 group-hover:text-white block truncate leading-tight">
                    ${m.id}. ${m.title}
                  </span>
                  <span class="text-[10px] text-slate-400 font-mono">${m.duration}s</span>
                </div>
                <i class="fa-solid fa-circle-play text-xs text-slate-500 group-hover:text-blue-400 transition shrink-0"></i>
              </div>
            `).join('')}
          </div>
        </div>

      </div>

      <!-- Pie del Modal -->
      <div class="bg-slate-950 px-5 py-3 border-t border-slate-800 flex items-center justify-between shrink-0 text-[11px] text-slate-400">
        <button type="button" onclick="window.resetTourPreferencesAction()"
                class="hover:text-white underline cursor-pointer flex items-center gap-1.5 transition">
          <i class="fa-solid fa-arrow-rotate-right text-[10px]"></i>
          <span>Restablecer tutoriales automáticos</span>
        </button>

        <button type="button" onclick="window.closeTutorialHubModalAction()"
                class="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer">
          Cerrar
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(modal);
}

// =========================================================================
// ASIGNACIÓN DE GLOBALES PARA EVENTOS ONCLICK EN EL DOM
// =========================================================================
if (typeof window !== 'undefined') {
  window.openTutorialHubModal = openTutorialHubModal;
  window.closeTutorialHubModalAction = closeTutorialHubModal;
  window.launchTourFromHubAction = launchTourFromHub;
  window.launchVideoFromHubAction = launchVideoFromHub;
  window.resetTourPreferencesAction = resetTourPreferencesFromHub;
}
