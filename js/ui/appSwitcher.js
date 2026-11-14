// assets/js/appSwitcher.js
// Selector Unificado de Aplicaciones del Ecosistema Cubikar (Estilo Google Workspace Waffle 9-puntos)

export function initAppSwitcher(containerId = 'cubikar-app-switcher-mount', currentApp = 'portal') {
  const mount = document.getElementById(containerId);
  if (!mount) return;

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // URLs de destino según entorno
  const urls = {
    portal: isLocalhost ? (currentApp === 'portal' ? '#' : '../Cubikar/index.html') : 'https://cubikar.app',
    const: isLocalhost ? (currentApp === 'const' ? '#' : '../ADM_CONST/index.html') : 'https://const.cubikar.app',
    arq: isLocalhost ? (currentApp === 'arq' ? '#' : '../ADM_ARQ/index.html') : 'https://arq.cubikar.app'
  };

  mount.innerHTML = `
    <div class="relative inline-block text-left" id="cubikar-app-switcher-wrapper">
      <button type="button" id="cubikar-app-switcher-btn" 
              class="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 transition flex items-center justify-center cursor-pointer shadow-xs"
              title="Ecosistema Cubikar (Cambiar de Aplicación)">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2.2" />
          <circle cx="12" cy="5" r="2.2" />
          <circle cx="19" cy="5" r="2.2" />
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="19" cy="12" r="2.2" />
          <circle cx="5" cy="19" r="2.2" />
          <circle cx="12" cy="19" r="2.2" />
          <circle cx="19" cy="19" r="2.2" />
        </svg>
      </button>

      <!-- Popover Desplegable -->
      <div id="cubikar-app-switcher-menu" 
           style="z-index: 100005;"
           class="hidden absolute right-0 top-full mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-3 z-50 text-slate-100 animate-in fade-in zoom-in-95 duration-100">
        
        <div class="px-3 py-2 border-b border-slate-800 flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <img src="assets/branding/cubikar_icon_transparent.png" alt="cubikar" class="w-5 h-5 object-contain">
            <span class="text-xs font-bold text-white uppercase tracking-wider font-sans">Ecosistema Cubikar</span>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">SSO Activo</span>
        </div>

        <div class="space-y-1.5">
          <!-- 1. CUBIKAR CONSTRUCCIÓN -->
          <a href="${urls.const}" 
             class="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-800/80 transition ${currentApp === 'const' ? 'bg-amber-500/10 border border-amber-500/30' : 'border border-transparent'}">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-helmet-safety text-base"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white">Cubikar Construcción</span>
                ${currentApp === 'const' ? '<span class="text-[9px] font-black text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">EN USO</span>' : ''}
              </div>
              <p class="text-[10.5px] text-slate-400 truncate">Obras, Matrices APU y Bitácora Legal</p>
            </div>
          </a>

          <!-- 2. CUBIKAR ARQUITECTURA -->
          <a href="${urls.arq}" 
             class="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-800/80 transition ${currentApp === 'arq' ? 'bg-blue-500/10 border border-blue-500/30' : 'border border-transparent'}">
            <div class="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/40 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-compass-drafting text-base"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white">Cubikar Arquitectura</span>
                ${currentApp === 'arq' ? '<span class="text-[9px] font-black text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">EN USO</span>' : ''}
              </div>
              <p class="text-[10.5px] text-slate-400 truncate">Proyectos Ejecutivos y Honorarios</p>
            </div>
          </a>

          <!-- 3. PORTAL CENTRAL -->
          <a href="${urls.portal}" 
             class="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-800/80 transition ${currentApp === 'portal' ? 'bg-slate-800 border border-slate-700' : 'border border-transparent'}">
            <div class="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-globe text-base"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white">Portal &amp; Facturación</span>
                ${currentApp === 'portal' ? '<span class="text-[9px] font-black text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded">ACTUAL</span>' : ''}
              </div>
              <p class="text-[10.5px] text-slate-400 truncate">Planes, Suscripciones y Mi Cuenta</p>
            </div>
          </a>
        </div>

        <!-- Botón Rápido de Respaldo -->
        <div class="mt-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="window.triggerDemoBackupDownload && window.triggerDemoBackupDownload()" 
                  class="w-full py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center justify-center gap-2 transition cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span>Descargar Respaldo Completo (.zip)</span>
          </button>
        </div>

      </div>
    </div>
  `;

  // Manejo de eventos abrir / cerrar
  const btn = document.getElementById('cubikar-app-switcher-btn');
  const menu = document.getElementById('cubikar-app-switcher-menu');

  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });
  }
}
