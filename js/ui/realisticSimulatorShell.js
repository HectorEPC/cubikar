// js/ui/realisticSimulatorShell.js
// Motor de Renderizado Fotorrealista para el Video-Simulador de Cubikar (Alternativa 1)
// Reproduce fielmente al 100% la interfaz real de Cubikar: Barra Lateral (Rail Monday),
// Encabezado Superior con Logotipo, 5 PestaÃ±as Maestras, Toolbar de Acciones, Tablas
// y VENTANAS FLOTANTES / MODALES AUTÃ‰NTICAS (blancas, encabezados degradados oficiales,
// tarjetas de pasos, formularios, conmutadores y botones idÃ©nticos a la aplicaciÃ³n real).

export function getRealisticBudgetTableHtml(options = {}) {
  const {
    highlightPartidaBtn = false,
    highlightDesc = false,
    highlightCells = false,
    highlightReorder = false,
    highlightColor = false,
    highlightApuBtn = false,
    showAiMenu = false
  } = options;

  return `
    <div class="flex-1 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden m-2 text-slate-800 text-[11px]">
      
      <!-- Encabezado Superior Sub-pestaÃ±as y Proyecto -->
      <div class="px-3 py-1.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-1.5 bg-slate-200/80 p-0.5 rounded-md border border-slate-300">
          <button type="button" class="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-2xs flex items-center gap-1">
            <i class="fa-solid fa-list-check"></i> CatÃ¡logo Base (Presupuesto / APU)
          </button>
          <button type="button" id="mock-step8-tab-insumos" class="px-2.5 py-0.5 rounded text-[10px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
            <i class="fa-solid fa-boxes-stacked"></i> ExplosiÃ³n de Insumos (6 CategorÃ­as)
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[9.5px] text-slate-500 font-semibold uppercase flex items-center gap-1">
            <i class="fa-solid fa-file-signature text-blue-600"></i> Firmas / Responsables
          </span>
          <div class="flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[9px] text-slate-600 font-medium">
            <i class="fa-solid fa-users text-blue-500"></i> Asignados: 3
          </div>
        </div>
      </div>

      <!-- Barra de Acciones Globales (Toolbar) -->
      <div class="p-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-1 shrink-0 overflow-x-hidden text-[10px]">
        <div class="flex items-center gap-1 flex-wrap">
          <button id="mock-step4-btn-partida" class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs ${highlightPartidaBtn ? 'ring-2 ring-blue-400 animate-pulse' : ''}">
            <i class="fa-solid fa-plus text-[9px]"></i> + Agregar Partida
          </button>

          <div class="h-3 w-px bg-slate-300 mx-0.5"></div>

          <button class="bg-white text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs">
            <i class="fa-solid fa-rotate-left text-[9px]"></i>
          </button>
          <button class="bg-white text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs">
            <i class="fa-solid fa-rotate-right text-[9px]"></i>
          </button>

          <div class="h-3 w-px bg-slate-300 mx-0.5"></div>

          <button class="bg-white text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs flex items-center gap-1">
            <i class="fa-solid fa-copy text-blue-600 text-[9px]"></i> Copiar
          </button>
          <button class="bg-white text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs flex items-center gap-1">
            <i class="fa-solid fa-paste text-emerald-600 text-[9px]"></i> Pegar
          </button>

          <div class="h-3 w-px bg-slate-300 mx-0.5"></div>

          <div id="mock-step4-reorder" class="inline-flex rounded border border-slate-300 overflow-hidden ${highlightReorder ? 'ring-2 ring-amber-400 animate-pulse' : ''}">
            <button class="bg-white text-slate-700 px-1.5 py-0.5 hover:bg-slate-200 border-r border-slate-300">
              <i class="fa-solid fa-arrow-up text-[9px]"></i>
            </button>
            <button class="bg-white text-slate-700 px-1.5 py-0.5 hover:bg-slate-200">
              <i class="fa-solid fa-arrow-down text-[9px]"></i>
            </button>
          </div>

          <button id="mock-step15-btn-lock" class="bg-white text-slate-700 border border-slate-300 px-1.5 py-0.5 rounded shadow-2xs" title="Bloquear ediciÃ³n">
            <i class="fa-solid fa-lock-open text-[9px] text-slate-600"></i>
          </button>

          <div class="h-3 w-px bg-slate-300 mx-0.5"></div>

          <!-- Split AI Button Container y Menú Flotante -->
          <div class="relative inline-block">
            <div id="mock-step7-btn-ai" class="inline-flex items-center rounded bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-2xs text-[10px] ${highlightApuBtn ? 'ring-2 ring-indigo-400 animate-pulse' : ''}">
              <span class="px-2 py-0.5 font-bold flex items-center gap-1 cursor-pointer">
                <i class="fa-solid fa-wand-magic-sparkles text-[9px] text-amber-300"></i> Generar APU
              </span>
              <span class="px-1 py-0.5 border-l border-white/20 hover:bg-white/10 cursor-pointer">
                <i class="fa-solid fa-chevron-down text-[8px]"></i>
              </span>
            </div>

            ${showAiMenu ? `
              <!-- Menú Dividido de IA Flotante (Idéntico a aiSplitMenu.js) -->
              <div id="mock-step7-ai-menu" class="absolute left-0 top-full mt-1.5 z-40 w-[290px] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150 text-slate-800">
                <div class="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-wider flex items-center justify-between bg-slate-50 border-b border-slate-200 text-slate-500">
                  <span>Generar matrices seleccionadas</span>
                  <span class="text-[8.5px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Plan Profesional</span>
                </div>
                <div class="divide-y border-slate-100 text-[11px]">
                  <!-- Opción 1: Solo Catálogo Local -->
                  <div class="w-full text-left px-2.5 py-2 flex items-start gap-2 hover:bg-slate-50 transition cursor-pointer">
                    <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs bg-emerald-100 text-emerald-700">
                      <i class="fa-solid fa-database text-[10px]"></i>
                    </span>
                    <span class="flex-1 min-w-0">
                      <span class="flex items-center justify-between gap-1">
                        <span class="font-bold text-[11px] leading-tight truncate">Solo Catálogo Local</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shrink-0">Gratis ($0)</span>
                      </span>
                      <span class="block text-[9.5px] leading-snug mt-0.5 text-slate-500">Usa tus catálogos importados o BIMSA.</span>
                    </span>
                  </div>

                  <!-- Opción 2: IA Rápida (Recomendada) -->
                  <div class="w-full text-left px-2.5 py-2 flex items-start gap-2 bg-indigo-50/60 hover:bg-indigo-50 transition cursor-pointer">
                    <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs bg-indigo-100 text-indigo-700">
                      <i class="fa-solid fa-wand-magic-sparkles text-[10px]"></i>
                    </span>
                    <span class="flex-1 min-w-0">
                      <span class="flex items-center justify-between gap-1">
                        <span class="font-bold text-[11px] leading-tight truncate">IA Rápida (Recomendada)</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-emerald-400/30 bg-emerald-500/15 text-emerald-600 shrink-0">Ilimitada (API)</span>
                      </span>
                      <span class="block text-[9.5px] leading-snug mt-0.5 text-slate-500">1º Catálogo/caché ($0) · 2º Gemini Flash.</span>
                    </span>
                  </div>

                  <!-- Opción 3: Precios Web en Vivo (Google) -->
                  <div id="mock-step7-menu-web" class="w-full text-left px-2.5 py-2 flex items-start gap-2 bg-amber-50 hover:bg-amber-100/80 transition cursor-pointer ring-2 ring-amber-400 rounded-lg">
                    <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs bg-amber-100 text-amber-700">
                      <i class="fa-solid fa-globe text-[10px]"></i>
                    </span>
                    <span class="flex-1 min-w-0">
                      <span class="flex items-center justify-between gap-1">
                        <span class="font-bold text-[11px] leading-tight text-amber-900 truncate">Precios Web en Vivo (Google)</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full border border-amber-300 bg-amber-50 text-amber-700 shrink-0">200/200</span>
                      </span>
                      <span class="block text-[9.5px] leading-snug mt-0.5 text-amber-800">Investiga precios comerciales vigentes en internet.</span>
                    </span>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>

          <button id="mock-step14-btn-print" class="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-2xs">
            <i class="fa-solid fa-print text-[9px]"></i> Imprimir
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-[9.5px] font-bold text-slate-600 font-mono">Total: <strong class="text-emerald-600 font-extrabold text-xs">$417,726.92</strong></span>
        </div>
      </div>

      <!-- Tabla de Conceptos (Partidas Reales de Cubikar) -->
      <div class="flex-1 overflow-auto bg-white min-h-0">
        <table class="w-full text-left border-collapse text-[10px]">
          <thead class="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200 text-[9px]">
            <tr>
              <th class="p-1.5 w-6 text-center"></th>
              <th class="p-1.5 w-6 text-center"><input type="checkbox" class="rounded scale-75"></th>
              <th class="p-1.5 w-12 text-center">Item</th>
              <th class="p-1.5 w-20">Clave</th>
              <th class="p-1.5">DescripciÃ³n del Concepto de Obra</th>
              <th class="p-1.5 w-16 text-right">Cantidad</th>
              <th class="p-1.5 w-12 text-center">Unidad</th>
              <th class="p-1.5 w-24 text-right">P.U. Base</th>
              <th class="p-1.5 w-24 text-right">Importe</th>
              <th class="p-1.5 w-12 text-center">Matriz</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-mono text-[9.5px]">
            
            <!-- Fila Partida 01: PRELIMINARES -->
            <tr class="bg-slate-200/70 font-sans font-bold text-slate-900">
              <td class="p-1.5 text-center"><i class="fa-solid fa-chevron-down text-[8px] text-slate-600"></i></td>
              <td class="p-1.5 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-1.5 text-center">1</td>
              <td class="p-1.5">PART-01</td>
              <td class="p-1.5 uppercase tracking-wide">01 PRELIMINARES Y TERRACERÃAS</td>
              <td class="p-1.5 text-right font-mono"></td>
              <td class="p-1.5 text-center"></td>
              <td class="p-1.5 text-right font-mono"></td>
              <td class="p-1.5 text-right font-mono text-blue-900">$14,248.00</td>
              <td class="p-1.5 text-center"></td>
            </tr>

            <!-- Concepto 1.1 -->
            <tr class="hover:bg-slate-50 transition">
              <td class="p-1.5 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[8px]"></i></td>
              <td class="p-1.5 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-1.5 text-center text-slate-400">1.1</td>
              <td class="p-1.5 font-bold text-slate-700">PRE-001</td>
              <td class="p-1.5 font-sans text-slate-800">Limpieza y despalme de terreno natural espesor 20cm a mÃ¡quina</td>
              <td class="p-1.5 text-right font-bold">450.00</td>
              <td class="p-1.5 text-center">m2</td>
              <td class="p-1.5 text-right font-bold text-slate-800">$18.50</td>
              <td class="p-1.5 text-right text-emerald-700 font-bold">$8,325.00</td>
              <td class="p-1.5 text-center">
                <button class="px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[8.5px] shadow-2xs">APU</button>
              </td>
            </tr>

            <!-- Concepto 1.2 -->
            <tr class="hover:bg-slate-50 transition">
              <td class="p-1.5 text-center"><i class="fa-solid fa-grip-vertical text-slate-300 text-[8px]"></i></td>
              <td class="p-1.5 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-1.5 text-center text-slate-400">1.2</td>
              <td class="p-1.5 font-bold text-slate-700">PRE-002</td>
              <td class="p-1.5 font-sans text-slate-800">Trazo y nivelaciÃ³n con equipo topogrÃ¡fico de precisiÃ³n para desplante</td>
              <td class="p-1.5 text-right font-bold">252.00</td>
              <td class="p-1.5 text-center">m2</td>
              <td class="p-1.5 text-right font-bold text-slate-800">$23.50</td>
              <td class="p-1.5 text-right text-emerald-700 font-bold">$5,923.00</td>
              <td class="p-1.5 text-center">
                <button id="mock-step5-btn-apu" class="px-1.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold text-[8.5px] shadow-2xs ${highlightApuBtn ? 'ring-2 ring-amber-400 animate-pulse' : ''}">APU</button>
              </td>
            </tr>

            <!-- Fila Partida 02: CIMENTACIÃ“N -->
            <tr class="bg-slate-200/70 font-sans font-bold text-slate-900">
              <td class="p-1.5 text-center"><i class="fa-solid fa-chevron-down text-[8px] text-slate-600"></i></td>
              <td class="p-1.5 text-center"><input type="checkbox" class="rounded scale-75"></td>
              <td class="p-1.5 text-center">2</td>
              <td class="p-1.5">PART-02</td>
              <td class="p-1.5 uppercase tracking-wide">02 CIMENTACIÃ“N Y ESTRUCTURAS</td>
              <td class="p-1.5 text-right font-mono"></td>
              <td class="p-1.5 text-center"></td>
              <td class="p-1.5 text-right font-mono"></td>
              <td class="p-1.5 text-right font-mono text-blue-900">$403,478.92</td>
              <td class="p-1.5 text-center"></td>
            </tr>

            <!-- Concepto 2.1 (Seleccionado / Activo) -->
            <tr class="bg-blue-50/70 border-l-4 border-l-blue-600 transition">
              <td class="p-1.5 text-center"><i class="fa-solid fa-grip-vertical text-blue-500 text-[8px]"></i></td>
              <td class="p-1.5 text-center"><input type="checkbox" checked class="rounded scale-75"></td>
              <td class="p-1.5 text-center font-bold text-blue-600">2.1</td>
              <td class="p-1.5 font-bold text-blue-800">CIM-001</td>
              <td class="p-1.5 font-sans font-medium text-slate-900">
                <span id="mock-step4-desc" class="mock-type-value ${highlightDesc ? 'bg-amber-100 text-amber-950 px-1 rounded' : ''}">Zapata aislada de concreto f'c=250 kg/cm2</span>
              </td>
              <td class="p-1.5 text-right font-bold text-blue-700" id="mock-step4-cells">
                <span class="${highlightCells ? 'bg-blue-100 text-blue-900 px-1 rounded ring-1 ring-blue-400' : ''}">64.00</span>
              </td>
              <td class="p-1.5 text-center font-bold">m3</td>
              <td class="p-1.5 text-right font-bold text-slate-800">$4,379.08</td>
              <td class="p-1.5 text-right text-emerald-700 font-bold">$280,261.12</td>
              <td class="p-1.5 text-center">
                <button class="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold text-[8.5px]">APU</button>
              </td>
            </tr>

            <!-- Concepto 2.2 -->
            <tr class="hover:bg-slate-50">
              <td class="p-1.5 text-center"></td>
              <td class="p-1.5 text-center"><input type="checkbox" checked class="rounded scale-75"></td>
              <td class="p-1.5 text-center text-slate-400">2.2</td>
              <td class="p-1.5 font-bold text-slate-700">CIM-002</td>
              <td class="p-1.5 font-sans text-slate-800">Acero de refuerzo No. 4 (1/2") fy=4200 kg/cm2</td>
              <td class="p-1.5 text-right">3,850.00</td>
              <td class="p-1.5 text-center">kg</td>
              <td class="p-1.5 text-right font-bold">$43.41</td>
              <td class="p-1.5 text-right text-emerald-700 font-bold">$167,128.50</td>
              <td class="p-1.5 text-center">
                <button class="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold text-[8.5px]">APU</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function renderRealisticWorkspaceShell({
  activeTab = 'presupuesto',
  activeSubtab = 'cat',
  activeRail = '',
  mainContent = '',
  overlayModal = '',
  overlayModalWrapperId = '',
  overlayModalHidden = false,
  showChatDock = false,
  companyName = 'Constructora del Valle S.A.',
  projectName = 'Residencial Palmas Norte'
} = {}) {
  const contentHtml = mainContent || getRealisticBudgetTableHtml();

  return `
    <div class="w-full h-full flex flex-row bg-slate-900 text-slate-100 overflow-hidden font-sans select-none text-left">
      
      <!-- 1. LEFT NAVIGATION RAIL (Barra Lateral Izquierda estilo Monday / Cubikar) -->
      <aside class="w-12 min-w-[48px] bg-slate-950 border-r border-slate-800 flex flex-col items-center justify-between py-2 px-1 shrink-0 select-none">
        <!-- Top Icons -->
        <div class="flex flex-col items-center gap-2 w-full">
          <!-- Logo Cubikar -->
          <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/30 ring-1 ring-white/20">
            <i class="fa-solid fa-cube text-xs"></i>
          </div>

          <!-- Mis Proyectos -->
          <div class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer" title="Mis Proyectos">
            <i class="fa-solid fa-layer-group text-xs"></i>
          </div>

          <!-- Chat de Obra -->
          <div id="mock-step3-btn-chat" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-400 hover:bg-slate-900 cursor-pointer relative ${activeRail === 'chat' || showChatDock ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40' : ''}" title="Chat Contextual de Obra">
            <i class="fa-solid fa-comments text-xs"></i>
            <span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
          </div>

          <!-- CatÃ¡logo Maestro BIMSA -->
          <div id="mock-step6-rail-btn" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-slate-900 cursor-pointer ${activeRail === 'master' ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40' : ''}" title="CatÃ¡logos Maestros (BIMSA / Tabuladores)">
            <i class="fa-solid fa-book-bookmark text-xs"></i>
          </div>

          <!-- Importar Archivo -->
          <div id="mock-step13-rail-import" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:bg-slate-900 cursor-pointer ${activeRail === 'import' ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40' : ''}" title="Importar Opus, Neodata o Excel">
            <i class="fa-solid fa-cloud-arrow-up text-xs"></i>
          </div>
        </div>

        <!-- Bottom Icons -->
        <div class="flex flex-col items-center gap-2 w-full">
          <div id="mock-step15-btn-profile" class="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer" title="Perfil Profesional">
            <i class="fa-solid fa-user-gear text-xs"></i>
          </div>
        </div>
      </aside>

      <!-- 2. MAIN WORKSPACE VIEWPORT -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-900">
        
        <!-- TOP HEADER: CASCO, EMPRESA Y 5 PESTAÃ‘AS MAESTRAS -->
        <header class="bg-slate-950 border-b border-slate-800 px-3 py-1.5 flex flex-col gap-1 shrink-0 shadow-md">
          
          <!-- Fila Superior: Casco, Empresa y Colaboradores -->
          <div class="flex items-center justify-between gap-2">
            <!-- Izquierda: Casco y Nombres -->
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
                <i class="fa-solid fa-helmet-safety text-xs"></i>
              </div>
              <div class="truncate">
                <span class="text-xs font-bold text-white block truncate leading-tight">${companyName}</span>
                <span class="text-[9.5px] text-slate-400 font-mono truncate block leading-tight">Cubikar v2.0 â€¢ Sistema Integral</span>
              </div>
            </div>

            <!-- Derecha: PÃ­ldora de Colaboradores e Invitar -->
            <div class="flex items-center gap-1.5 shrink-0">
              <div class="flex items-center gap-1 bg-slate-900 border border-slate-750 px-2 py-0.5 rounded-full text-[10px] text-slate-300">
                <div class="flex -space-x-1">
                  <span class="w-4 h-4 rounded-full bg-blue-600 text-[8px] flex items-center justify-center text-white font-bold ring-1 ring-slate-950">A</span>
                  <span class="w-4 h-4 rounded-full bg-emerald-600 text-[8px] flex items-center justify-center text-white font-bold ring-1 ring-slate-950">M</span>
                  <span class="w-4 h-4 rounded-full bg-amber-600 text-[8px] flex items-center justify-center text-white font-bold ring-1 ring-slate-950">J</span>
                </div>
                <span class="font-semibold text-slate-400 hidden sm:inline">Equipo</span>
                <button id="mock-step2-btn-invite" class="ml-1 text-[9px] font-bold text-blue-400 hover:text-white bg-blue-600/30 hover:bg-blue-600 px-1.5 py-0.2 rounded transition cursor-pointer">
                  + Invitar
                </button>
              </div>

              <!-- Badges de Sobrecosto y Guardado -->
              <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono text-[9.5px] font-bold hidden sm:inline">
                FSR: 1.2693
              </span>
            </div>
          </div>

          <!-- Fila Inferior: 5 PESTAÃ‘AS MAESTRAS DE CUBIKAR -->
          <div class="flex items-center justify-between border-t border-slate-800/80 pt-1">
            <nav class="flex items-center gap-1 text-[10px] font-sans">
              <button class="px-2 py-1 rounded font-bold flex items-center gap-1 ${activeTab === 'presupuesto' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-300 hover:text-white'}">
                <i class="fa-solid fa-calculator text-[9px]"></i> PRESUPUESTO
              </button>
              <button id="mock-step11-tab-gantt" class="px-2 py-1 rounded font-bold flex items-center gap-1 ${activeTab === 'calendario' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-300 hover:text-white'}">
                <i class="fa-solid fa-calendar-days text-[9px]"></i> CALENDARIO
              </button>
              <button id="mock-step12-tab-estimaciones" class="px-2 py-1 rounded font-bold flex items-center gap-1 ${activeTab === 'estimaciones' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-300 hover:text-white'}">
                <i class="fa-solid fa-file-invoice-dollar text-[9px]"></i> ESTIMACIONES
              </button>
              <button id="mock-step9-tab-compras" class="px-2 py-1 rounded font-bold flex items-center gap-1 ${activeTab === 'compras' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-300 hover:text-white'}">
                <i class="fa-solid fa-cart-shopping text-[9px]"></i> COMPRAS
              </button>
              <button id="mock-step10-tab-bitacora" class="px-2 py-1 rounded font-bold flex items-center gap-1 ${activeTab === 'bitacora' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-300 hover:text-white'}">
                <i class="fa-solid fa-book-bookmark text-[9px]"></i> BITÃCORA
              </button>
            </nav>
          </div>
        </header>

        <!-- Subheader del Proyecto -->
        <div class="px-3 py-1 bg-slate-200/90 border-b border-slate-300 flex items-center justify-between text-[10px] text-slate-700 shrink-0">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1 font-bold">
              <i class="fa-solid fa-folder-tree text-blue-600"></i> Proyecto: <strong class="text-slate-900">${projectName}</strong>
            </span>
            <span class="flex items-center gap-1 text-slate-600 hidden sm:inline">
              <i class="fa-solid fa-location-dot text-rose-600"></i> UbicaciÃ³n: Ciudad de MÃ©xico, CDMX
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px]">En EjecuciÃ³n</span>
          </div>
        </div>

        <!-- Cuerpo del Espacio de Trabajo con soporte Split para Chat Dock -->
        <div class="flex-1 flex overflow-hidden relative">
          
          <!-- Contenido Central -->
          <div class="flex-1 flex flex-col overflow-hidden min-w-0">
            ${contentHtml}
          </div>

          <!-- Chat Dock Lateral (si showChatDock estÃ¡ activo) -->
          ${showChatDock ? `
            <div id="mock-step3-chat-dock" class="w-64 bg-slate-900 border-l border-slate-800 flex flex-col text-white text-[10px] shrink-0 animate-in slide-in-from-right duration-200">
              <div class="p-2 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                <span class="font-bold flex items-center gap-1.5 text-blue-400">
                  <i class="fa-solid fa-comments"></i> Chat de Obra en Vivo
                </span>
                <button id="mock-step3-btn-print" class="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold text-[9px] flex items-center gap-1">
                  <i class="fa-solid fa-print text-[8px]"></i> Minuta PDF
                </button>
              </div>

              <!-- Subtabs de Canal -->
              <div id="mock-step3-tabs" class="grid grid-cols-2 p-1 gap-1 bg-slate-950/80 border-b border-slate-800 text-center font-bold">
                <span class="py-1 rounded bg-blue-600 text-white">Canal TÃ©cnico</span>
                <span class="py-1 rounded text-slate-400 hover:text-white">Canal Financiero</span>
              </div>

              <!-- Lista de Mensajes -->
              <div class="flex-1 p-2 space-y-2 overflow-y-auto">
                <div class="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                  <div class="flex items-center justify-between mb-1">
                    <strong class="text-amber-300 font-bold text-[9px]">Arq. SofÃ­a M.</strong>
                    <span class="text-[8px] text-slate-400">10:14 AM</span>
                  </div>
                  <p class="text-slate-200 leading-tight">Se autorizÃ³ el colado del eje 4 al 8 para maÃ±ana a las 7:00 AM.</p>
                  <div id="mock-step3-bitacora-note" class="mt-1.5 inline-block px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-600/40 text-[8.5px] font-mono">
                    Partida 02 â€¢ CIM-001
                  </div>
                </div>

                <div class="bg-blue-950/40 p-2 rounded-lg border border-blue-500/30">
                  <div class="flex items-center justify-between mb-1">
                    <strong class="text-blue-300 font-bold text-[9px]">Ing. Residente</strong>
                    <span class="text-[8px] text-slate-400">Ahora</span>
                  </div>
                  <p class="text-slate-200 leading-tight">Enterado. Cuadrilla y camiÃ³n bomba listos.</p>
                </div>
              </div>

              <!-- Input de Chat con MenciÃ³n @ -->
              <div class="p-2 border-t border-slate-800 bg-slate-950 flex gap-1">
                <div id="mock-step3-chat-input" class="flex-1 p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[9.5px]">
                  <span class="mock-type-value">@Carlos Revisar volumen de concreto en cimentaciÃ³n</span>
                </div>
                <button id="mock-step3-btn-send" class="px-2 py-1 bg-blue-600 text-white rounded-lg">
                  <i class="fa-solid fa-paper-plane text-[9px]"></i>
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Modal Flotante Superpuesto (Ventana Emergente Auténtica) -->
          ${overlayModal ? `
            <div ${overlayModalWrapperId ? `id="${overlayModalWrapperId}"` : ''} class="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 z-30 animate-in fade-in duration-150 ${overlayModalHidden ? 'hidden' : ''}" ${overlayModalHidden ? 'style="display: none;"' : ''}>
              ${overlayModal}
            </div>
          ` : ''}

        </div>
      </div>
    </div>
  `;
}

export function renderRealisticPortalShell({
  overlayModal = '',
  highlightModeBar = false,
  scopeMode = 'owned'
} = {}) {
  return `
    <div class="w-full h-full flex flex-col bg-slate-900 text-slate-100 overflow-hidden font-sans select-none text-left relative">
      
      <!-- Top Portal Navbar -->
      <header class="bg-slate-950 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between shrink-0 shadow-md">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
            <i class="fa-solid fa-cube text-sm"></i>
          </div>
          <div>
            <span class="font-extrabold text-sm tracking-tight text-white flex items-center gap-1">
              cubikar<span class="text-blue-500 font-black">.</span>
            </span>
            <span class="text-[9.5px] text-slate-400 font-mono block">Mis Proyectos de Obra</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Plan Profesional (3 Obras Activas)
          </span>
          <button id="mock-step1-btn-new" class="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition">
            <i class="fa-solid fa-plus text-[10px]"></i> + Nuevo Proyecto
          </button>
        </div>
      </header>

      <!-- Main Dashboard Grid -->
      <div class="flex-1 p-4 overflow-y-auto bg-slate-900">
        <div class="max-w-5xl mx-auto space-y-3.5">

          <!-- Barra Oficial de Modo de Trabajo (portalController.js) -->
          <div id="mock-step16-mode-bar" class="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 ${highlightModeBar ? 'ring-2 ring-blue-400' : ''}">
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
              <div class="flex items-center gap-2 shrink-0">
                <div class="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-xs">
                  <i class="fa-solid fa-briefcase"></i>
                </div>
                <div>
                  <span class="text-xs font-bold text-white block">Modo de Trabajo:</span>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <!-- Menú desplegable de Modo de Trabajo -->
                <div class="relative w-48 sm:w-60 min-w-0">
                  <select id="mock-step16-scope-select" class="w-full appearance-none bg-slate-950 border border-slate-700 hover:border-blue-500 text-white font-semibold text-xs rounded-xl pl-3 pr-8 py-2 transition outline-none cursor-pointer shadow-inner truncate">
                    <option value="owned" ${scopeMode === 'owned' ? 'selected' : ''}>📁 Mis proyectos (Obras Propias)</option>
                    <option value="invited" ${scopeMode === 'invited' ? 'selected' : ''}>👥 Arq. Carlos González (Invitado)</option>
                    <option value="all" ${scopeMode === 'all' ? 'selected' : ''}>🌐 Todos los proyectos</option>
                  </select>
                  <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-blue-400">
                    <i class="fa-solid fa-chevron-down text-[10px]"></i>
                  </div>
                </div>

                <!-- Botón de Invitaciones al Plan al lado derecho -->
                <button type="button" id="mock-step16-btn-invite" class="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-3 py-2 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer border border-blue-400/30">
                  <i class="fa-solid fa-user-plus text-[10px]"></i>
                  <span class="whitespace-nowrap">Invitaciones</span>
                </button>
              </div>
            </div>

            <!-- Indicador visual del modo actual y membresía gobernante -->
            <div id="mock-step16-status-badge" class="shrink-0 flex items-center gap-2 text-xs">
              ${scopeMode === 'invited' ? `
                <div class="flex items-center gap-2 bg-slate-900/90 border border-indigo-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs">
                  <i class="fa-solid fa-user-check text-indigo-400"></i>
                  <span class="text-slate-300">Espacio Invitado: <strong class="text-white">Arq. Carlos González</strong></span>
                  <span class="text-indigo-300 font-mono text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/30 font-bold">Rol: Editor (Plan Pro del Anfitrión)</span>
                </div>
              ` : `
                <div class="flex items-center gap-2 bg-slate-900/90 border border-amber-500/40 px-3 py-1.5 rounded-xl shadow-inner text-xs">
                  <i class="fa-solid fa-crown text-amber-400"></i>
                  <span class="text-slate-300">🏷️ Membresía activa: <strong class="text-white">Plan Profesional</strong></span>
                  <span class="text-amber-300 font-mono text-[10px] bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30 font-bold">(3/5 obras)</span>
                </div>
              `}
            </div>
          </div>
          
          <div class="flex items-center justify-between">
            <h2 class="font-extrabold text-sm text-white flex items-center gap-2">
              <i class="fa-solid fa-building-user text-blue-500"></i> Proyectos en Curso
            </h2>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-400">Filtrar:</span>
              <span class="px-2 py-0.5 rounded bg-slate-800 text-white font-bold text-[10px]">Todos (3)</span>
            </div>
          </div>

          <!-- Project Cards Grid (Obras Propias) -->
          <div id="mock-step16-cards-owned" class="grid grid-cols-1 md:grid-cols-3 gap-3" ${scopeMode === 'invited' ? 'style="display: none;"' : ''}>
            
            <!-- Tarjeta 1: Residencial Palmas Norte (Activo) -->
            <div class="bg-slate-850 border-2 border-blue-500/80 rounded-2xl p-3.5 shadow-xl flex flex-col justify-between relative overflow-hidden group">
              <div class="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none"></div>
              
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-600/20 text-blue-300 border border-blue-500/30">EdificaciÃ³n</span>
                  <span class="text-[10px] text-emerald-400 font-mono font-bold">$417,726.92</span>
                </div>
                <h3 class="font-bold text-sm text-white group-hover:text-blue-400 transition">Residencial Palmas Norte</h3>
                <p class="text-[10.5px] text-slate-300 truncate">Constructora del Valle S.A.</p>
                <div class="pt-1">
                  <div class="flex justify-between text-[9px] text-slate-400 mb-1">
                    <span>Avance FÃ­sico</span><span class="font-bold text-white">43.7%</span>
                  </div>
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-blue-500 rounded-full" style="width: 43.7%;"></div>
                  </div>
                </div>
              </div>

              <div class="pt-3 mt-2 border-t border-slate-750 flex items-center justify-between gap-2">
                <div class="flex -space-x-1.5">
                  <span class="w-5 h-5 rounded-full bg-blue-600 text-[9px] flex items-center justify-center text-white font-bold">C</span>
                  <span class="w-5 h-5 rounded-full bg-emerald-600 text-[9px] flex items-center justify-center text-white font-bold">S</span>
                </div>
                <button class="bg-blue-600 text-white font-bold text-[10px] px-3 py-1 rounded-lg">Abrir Proyecto</button>
              </div>
            </div>

            <!-- Tarjeta 2: Torre Reforma 222 -->
            <div class="bg-slate-850/80 border border-slate-750 rounded-2xl p-3.5 shadow-md flex flex-col justify-between opacity-80">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-600/20 text-purple-300 border border-purple-500/30">Vertical</span>
                  <span class="text-[10px] text-emerald-400 font-mono font-bold">$1,850,200.00</span>
                </div>
                <h3 class="font-bold text-xs text-white">Torre Reforma Corporativa</h3>
                <p class="text-[10px] text-slate-400 truncate">Inmobiliaria Metropolitana</p>
                <div class="pt-1">
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-purple-500 rounded-full" style="width: 20%;"></div>
                  </div>
                </div>
              </div>
              <div class="pt-3 mt-2 border-t border-slate-750">
                <button class="w-full bg-slate-750 text-slate-300 font-bold text-[10px] py-1 rounded-lg">Abrir Obra</button>
              </div>
            </div>

            <!-- Tarjeta 3: UrbanizaciÃ³n Lomas -->
            <div class="bg-slate-850/80 border border-slate-750 rounded-2xl p-3.5 shadow-md flex flex-col justify-between opacity-80">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-600/20 text-amber-300 border border-amber-500/30">Obra Civil</span>
                  <span class="text-[10px] text-emerald-400 font-mono font-bold">$920,400.00</span>
                </div>
                <h3 class="font-bold text-xs text-white">PavimentaciÃ³n y Drenaje Lomas</h3>
                <p class="text-[10px] text-slate-400 truncate">Municipio de Zapopan</p>
                <div class="pt-1">
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-amber-500 rounded-full" style="width: 80%;"></div>
                  </div>
                </div>
              </div>
              <div class="pt-3 mt-2 border-t border-slate-750">
                <button class="w-full bg-slate-750 text-slate-300 font-bold text-[10px] py-1 rounded-lg">Abrir Obra</button>
              </div>
            </div>

          </div>

          <!-- Project Cards Grid (Espacio Invitado) -->
          <div id="mock-step16-cards-invited" class="grid grid-cols-1 md:grid-cols-3 gap-3" ${scopeMode === 'invited' ? '' : 'style="display: none;"'}>
            <!-- Tarjeta Invitada 1: Centro Comercial Plaza Mayor -->
            <div class="bg-slate-850 border-2 border-indigo-500/80 rounded-2xl p-3.5 shadow-xl flex flex-col justify-between relative overflow-hidden group">
              <div class="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none"></div>
              <div class="space-y-2">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">Comercial • Editor</span>
                  <span class="text-[10px] text-emerald-400 font-mono font-bold">$3,420,000.00</span>
                </div>
                <h3 class="font-bold text-sm text-white group-hover:text-indigo-400 transition">Centro Comercial Plaza Mayor</h3>
                <p class="text-[10.5px] text-slate-300 truncate">Propietario: Arq. Carlos González</p>
                <div class="pt-1">
                  <div class="flex justify-between text-[9px] text-slate-400 mb-1">
                    <span>Avance Físico</span><span class="font-bold text-white">68.2%</span>
                  </div>
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-500 rounded-full" style="width: 68.2%;"></div>
                  </div>
                </div>
              </div>
              <div class="pt-3 mt-2 border-t border-slate-750 flex items-center justify-between gap-2">
                <span class="text-[9.5px] text-indigo-300 font-semibold flex items-center gap-1">
                  <i class="fa-solid fa-pen-to-square text-[9px]"></i> Permiso: Edición
                </span>
                <button class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] px-3 py-1 rounded-lg">Colaborar</button>
              </div>
            </div>

            <!-- Tarjeta Invitada 2: Nave Industrial San Martín -->
            <div class="bg-slate-850/80 border border-slate-750 rounded-2xl p-3.5 shadow-md flex flex-col justify-between opacity-90">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-700 text-slate-300 border border-slate-600">Industrial • Lector</span>
                  <span class="text-[10px] text-emerald-400 font-mono font-bold">$5,110,000.00</span>
                </div>
                <h3 class="font-bold text-xs text-white">Nave Industrial San Martín</h3>
                <p class="text-[10px] text-slate-400 truncate">Propietario: Constructora Bajío</p>
                <div class="pt-1">
                  <div class="h-1.5 bg-slate-750 rounded-full overflow-hidden">
                    <div class="h-full bg-slate-500 rounded-full" style="width: 35%;"></div>
                  </div>
                </div>
              </div>
              <div class="pt-3 mt-2 border-t border-slate-750 flex items-center justify-between">
                <span class="text-[9.5px] text-slate-400 flex items-center gap-1">
                  <i class="fa-solid fa-eye text-[9px]"></i> Solo lectura
                </span>
                <button class="bg-slate-750 text-slate-300 font-bold text-[10px] px-3 py-1 rounded-lg">Auditar</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Overlay Modal AutÃ©ntico Superpuesto -->
      ${overlayModal ? `
        <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 z-30 animate-in fade-in duration-150">
          ${overlayModal}
        </div>
      ` : ''}

    </div>
  `;
}

export function renderModuleVisualScene(moduleId) {
  const container = document.getElementById('virtual-stage-dynamic-content');
  if (!container) return;

  switch (Number(moduleId)) {
    case 1: { // Crear Proyecto (Modal AutÃ©ntico: modal-nuevo-proyecto)
      const modalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado Real -->
          <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white p-3.5 flex justify-between items-center shrink-0 border-b border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                <i class="fa-solid fa-folder-plus text-sm"></i>
              </div>
              <div>
                <h3 class="font-bold text-xs sm:text-sm tracking-wide text-white">Crear Nuevo Proyecto</h3>
                <p class="text-[10px] text-slate-300">Asistente de configuraciÃ³n inicial en 2 pasos</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1 rounded transition"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- Indicador de Pasos Oficial -->
          <div class="bg-slate-100 border-b border-slate-200 px-5 py-2 flex items-center justify-between text-[11px] font-semibold shrink-0">
            <div class="flex items-center gap-1.5 text-blue-900 font-bold">
              <span class="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
              <span>1. InformaciÃ³n del Proyecto</span>
            </div>
            <i class="fa-solid fa-arrow-right text-slate-400 text-[10px]"></i>
            <div class="flex items-center gap-1.5 opacity-50">
              <span class="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center text-[10px] font-bold">2</span>
              <span class="text-slate-600">2. Sobrecosto y Moneda</span>
            </div>
          </div>

          <!-- Cuerpo del Modal -->
          <div class="p-4 space-y-3 overflow-y-auto max-h-[60vh] bg-white text-slate-800">
            <!-- Nota informativa -->
            <div class="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-900 flex items-start gap-2 text-[10.5px]">
              <i class="fa-solid fa-circle-info text-blue-600 mt-0.5"></i>
              <div>
                <strong class="font-semibold">InformaciÃ³n del Proyecto</strong>
                <p class="text-[10px] text-blue-700">Se vincularÃ¡ de forma permanente al encabezado, catÃ¡logo y reportes.</p>
              </div>
            </div>

            <!-- Logotipo -->
            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[10.5px]">Logotipo de la Empresa / Obra</label>
              <div class="flex items-center gap-2.5">
                <div class="w-12 h-12 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                  <i class="fa-solid fa-image text-lg"></i>
                </div>
                <div class="space-y-1 flex-1">
                  <div class="flex gap-1.5">
                    <span class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[10px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                      <i class="fa-solid fa-upload text-blue-600"></i> Subir Logo
                    </span>
                    <span class="bg-white border border-slate-200 text-[10px] px-1.5 py-1 rounded-lg text-slate-600">Muestra 1</span>
                    <span class="bg-white border border-slate-200 text-[10px] px-1.5 py-1 rounded-lg text-slate-600">Muestra 2</span>
                  </div>
                  <p class="text-[9.5px] text-slate-500">Formatos: PNG o JPG transparente 1:1.</p>
                </div>
              </div>
            </div>

            <!-- Nombre de Empresa -->
            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[10.5px]">Nombre de la Empresa *</label>
              <div id="mock-step1-empresa" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white text-slate-900 shadow-2xs">
                <span class="mock-type-value">Constructora del Valle S.A.</span>
              </div>
            </div>

            <!-- Nombre del Proyecto -->
            <div>
              <label class="block font-bold text-slate-700 mb-1 text-[10.5px]">Nombre del Proyecto *</label>
              <div id="mock-step1-obra" class="w-full border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white text-slate-900 shadow-2xs">
                <span class="mock-type-value">Residencial Palmas Norte (EdificaciÃ³n)</span>
              </div>
            </div>

            <!-- Sobrecosto Card -->
            <div id="mock-step1-sobrecosto" class="border border-blue-200 rounded-xl p-2.5 bg-blue-50/50 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs">
                  <i class="fa-solid fa-calculator"></i>
                </div>
                <div>
                  <span class="font-bold text-slate-800 text-[11px] block">Factor de Sobrecosto Activo</span>
                  <span class="text-[9.5px] text-slate-600">Indirectos (12%) + Financ. (1.5%) + Utilidad (10%)</span>
                </div>
              </div>
              <span class="font-mono font-extrabold text-blue-700 text-xs bg-white px-2 py-1 rounded border border-blue-200">1.2693 (+26.93%)</span>
            </div>
          </div>

          <!-- Footer con Botones -->
          <div class="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex justify-between items-center shrink-0">
            <button class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">Cancelar</button>
            <button id="mock-step1-btn-finish" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5">
              <i class="fa-solid fa-check text-[10px]"></i> Crear Proyecto
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticPortalShell({ overlayModal: modalHtml });
      break;
    }

    case 2: { // Invitar Colaboradores y Permisos Granulares (Modal: modal-invitaciones-plan)
      const modalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado con Degradado Real -->
          <div class="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white p-4 flex justify-between items-center shrink-0 border-b border-slate-800">
            <div class="min-w-0 pr-3">
              <div class="flex items-center gap-2">
                <span class="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 text-xs">
                  <i class="fa-solid fa-users-gear"></i>
                </span>
                <h3 class="font-bold text-xs sm:text-sm flex items-center gap-2 text-white">
                  Invitaciones a tu Plan de SuscripciÃ³n
                </h3>
                <span class="text-[9.5px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Plan Pro
                </span>
              </div>
              <p class="text-[10.5px] text-slate-300 mt-1">
                Suma miembros a tu cuenta para colaborar en tus proyectos de obra.
              </p>
            </div>
            <button class="text-slate-400 hover:text-white p-1 rounded"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- PestaÃ±as Superiores del Modal -->
          <div class="flex border-b border-slate-200 bg-slate-100/80 px-4 pt-2 gap-1.5 shrink-0">
            <button class="px-3.5 py-2 text-xs font-bold rounded-t-xl border-t border-x border-slate-200 bg-white text-blue-600 shadow-2xs -mb-px flex items-center gap-1.5">
              <i class="fa-solid fa-user-plus text-blue-600"></i> Invitar Nuevo Usuario
            </button>
            <button class="px-3.5 py-2 text-xs font-semibold rounded-t-xl text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
              <i class="fa-solid fa-users text-slate-500"></i> Miembros en tu Plan (3)
            </button>
          </div>

          <!-- Formulario de InvitaciÃ³n -->
          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div class="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
              <div class="flex items-center justify-between pb-1 border-b border-slate-200">
                <h4 class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <i class="fa-solid fa-user-plus text-blue-600"></i> Formulario de InvitaciÃ³n
                </h4>
                <span class="text-[10px] text-slate-500 font-medium">Asigna rol y correo</span>
              </div>

              <!-- Correo -->
              <div>
                <label class="block font-bold text-slate-700 mb-1 text-[10.5px]">Correo ElectrÃ³nico del Invitado *</label>
                <div id="mock-step2-email" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-mono font-semibold text-slate-900 shadow-2xs">
                  <span class="mock-type-value">ing.torres@constructora.com</span>
                </div>
              </div>

              <!-- Selector de Roles Reales -->
              <div>
                <label class="block font-bold text-slate-700 mb-1 text-[10.5px]">Rol de Trabajo:</label>
                <div id="mock-step2-roles" class="grid grid-cols-3 gap-2">
                  <div class="p-2 rounded-xl bg-blue-50 border-2 border-blue-600 text-center shadow-xs cursor-pointer">
                    <strong class="text-blue-900 block text-[11px] font-bold">Editar</strong>
                    <span class="text-[8.5px] text-blue-700">Control Total</span>
                  </div>
                  <div class="p-2 rounded-xl bg-white border border-slate-200 text-center cursor-pointer hover:bg-slate-50">
                    <strong class="text-slate-800 block text-[11px] font-bold">Escribir</strong>
                    <span class="text-[8.5px] text-slate-500">Solo Captura</span>
                  </div>
                  <div class="p-2 rounded-xl bg-white border border-slate-200 text-center cursor-pointer hover:bg-slate-50">
                    <strong class="text-slate-800 block text-[11px] font-bold">Leer</strong>
                    <span class="text-[8.5px] text-slate-500">Solo Consulta</span>
                  </div>
                </div>
              </div>

              <!-- Permisos por PestaÃ±a -->
              <div id="mock-step2-tabs" class="pt-1">
                <label class="block font-bold text-slate-700 mb-1 text-[10.5px]">Permisos de PestaÃ±as Habilitadas:</label>
                <div class="flex flex-wrap gap-2 text-[10px]">
                  <span class="px-2 py-1 rounded bg-blue-100 text-blue-800 font-bold border border-blue-300 flex items-center gap-1 cursor-pointer">
                    <i class="fa-solid fa-check text-[9px]"></i> Presupuesto / APU
                  </span>
                  <span class="px-2 py-1 rounded bg-blue-100 text-blue-800 font-bold border border-blue-300 flex items-center gap-1 cursor-pointer">
                    <i class="fa-solid fa-check text-[9px]"></i> Compras y Pagos
                  </span>
                  <span class="px-2 py-1 rounded bg-slate-200 text-slate-700 font-semibold border border-slate-300 flex items-center gap-1 cursor-pointer">
                    BitÃ¡cora de Obra
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer Modal -->
          <div class="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">Cancelar</button>
            <button id="mock-step2-btn-add" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 flex items-center gap-1.5">
              <i class="fa-solid fa-paper-plane text-[10px]"></i> Enviar InvitaciÃ³n
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticPortalShell({ overlayModal: modalHtml });
      break;
    }

    case 3: { // Chat de Proyecto y BitÃ¡cora Contextual
      container.innerHTML = renderRealisticWorkspaceShell({ activeRail: 'chat', showChatDock: true });
      break;
    }

    case 4: { // CatÃ¡logo de Conceptos y Presupuesto Base
      container.innerHTML = renderRealisticWorkspaceShell({
        activeTab: 'presupuesto',
        mainContent: getRealisticBudgetTableHtml({ highlightPartidaBtn: true, highlightDesc: true, highlightCells: true, highlightReorder: true, highlightColor: true })
      });
      break;
    }

    case 5: { // AnÃ¡lisis de Precios Unitarios (APU Side Panel AutÃ©ntico)
      const apuPanelHtml = `
        <div class="flex-1 flex overflow-hidden">
          <!-- Tabla a la izquierda -->
          <div class="flex-1 overflow-hidden hidden md:flex">
            ${getRealisticBudgetTableHtml({ highlightApuBtn: true })}
          </div>

          <!-- Panel Lateral APU AutÃ©ntico de Cubikar (bg-white, encabezado slate-800, tarjetas resumen y cuadrillas) -->
          <div id="mock-step5-apu-panel" class="w-full md:w-[460px] bg-white border-l border-slate-200 flex flex-col text-slate-800 text-[10.5px] shrink-0 overflow-hidden shadow-2xl">
            
            <!-- APU Header Real -->
            <div class="p-2.5 bg-slate-800 text-white rounded-t-lg flex justify-between items-center shrink-0">
              <div class="overflow-hidden pr-2">
                <div class="flex items-center gap-1.5">
                  <span class="bg-amber-400 text-slate-900 font-bold text-[9px] px-1 py-0.5 rounded font-mono">PRE-002</span>
                  <h2 class="font-bold text-xs text-slate-100 truncate">Matriz de Precio Unitario</h2>
                </div>
                <p class="text-[10px] text-slate-300 mt-0.5 truncate italic">Trazo y nivelaciÃ³n con equipo topogrÃ¡fico (m2)</p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="bg-indigo-600 text-white text-[9.5px] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                  <i class="fa-solid fa-print text-[9px]"></i> Imprimir APU
                </span>
                <span class="text-slate-400 p-1"><i class="fa-solid fa-xmark text-sm"></i></span>
              </div>
            </div>

            <!-- APU Body -->
            <div class="flex-1 overflow-auto p-2.5 space-y-2.5">
              
              <!-- Fila SecciÃ³n Matriz con BotÃ³n IA -->
              <div class="flex justify-between items-center border-b border-slate-200 pb-1">
                <span class="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                  <i class="fa-solid fa-calculator text-blue-600"></i> MATRIZ DE PRECIO UNITARIO
                </span>
                <div class="flex items-center gap-1">
                  <span class="bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-[9px] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                    <i class="fa-solid fa-wand-magic-sparkles text-amber-200 text-[9px]"></i> Generar APU
                  </span>
                  <button id="mock-step5-btn-add-insumo" class="bg-slate-800 text-white text-[9px] px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                    <i class="fa-solid fa-plus text-[8px]"></i> + Insumo
                  </button>
                </div>
              </div>

              <!-- 6 Tarjetas Resumen IdÃ©nticas a index.html (Materiales, Mano de Obra, Herramienta, Equipo, Maq, Sub) -->
              <div id="mock-step5-matriz-grid" class="grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <div class="bg-blue-50 border border-blue-200 p-1 rounded shadow-2xs">
                  <div class="flex items-center justify-center gap-1 text-blue-700 font-bold text-[8.5px]">
                    <i class="fa-solid fa-cubes"></i> MATERIALES
                  </div>
                  <span class="font-bold font-mono text-slate-800 mt-0.5 block">$4.85</span>
                </div>
                <div class="bg-amber-50 border border-amber-200 p-1 rounded shadow-2xs">
                  <div class="flex items-center justify-center gap-1 text-amber-700 font-bold text-[8.5px]">
                    <i class="fa-solid fa-hard-hat"></i> MANO DE OBRA
                  </div>
                  <span class="font-bold font-mono text-slate-800 mt-0.5 block">$10.20</span>
                </div>
                <div class="bg-orange-50 border border-orange-200 p-1 rounded shadow-2xs">
                  <div class="flex items-center justify-center gap-1 text-orange-700 font-bold text-[8.5px]">
                    <i class="fa-solid fa-wrench"></i> HERRAMIENTA
                  </div>
                  <span class="font-bold font-mono text-slate-800 mt-0.5 block">$0.51</span>
                </div>
                <div class="bg-purple-50 border border-purple-200 p-1 rounded shadow-2xs">
                  <div class="flex items-center justify-center gap-1 text-purple-700 font-bold text-[8.5px]">
                    <i class="fa-solid fa-screwdriver-wrench"></i> EQUIPO
                  </div>
                  <span class="font-bold font-mono text-slate-800 mt-0.5 block">$2.94</span>
                </div>
                <div class="bg-rose-50 border border-rose-200 p-1 rounded shadow-2xs opacity-60">
                  <div class="flex items-center justify-center gap-1 text-rose-700 font-bold text-[8.5px]">
                    <i class="fa-solid fa-tractor"></i> MAQUINARIA
                  </div>
                  <span class="font-bold font-mono text-slate-800 mt-0.5 block">$0.00</span>
                </div>
                <div class="bg-emerald-50 border border-emerald-200 p-1 rounded shadow-2xs opacity-60">
                  <div class="flex items-center justify-center gap-1 text-emerald-700 font-bold text-[8.5px]">
                    <i class="fa-solid fa-file-signature"></i> SUBCONTRATO
                  </div>
                  <span class="font-bold font-mono text-slate-800 mt-0.5 block">$0.00</span>
                </div>
              </div>

              <!-- Tabla de Insumos de la Matriz con Filas Reales -->
              <div class="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <table class="w-full text-left text-[9.5px]">
                  <thead class="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th class="p-1">Clave</th>
                      <th class="p-1">DescripciÃ³n del Insumo</th>
                      <th class="p-1 text-right">Cant.</th>
                      <th class="p-1 text-right">Costo</th>
                      <th class="p-1 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 font-mono text-[9px]">
                    <tr>
                      <td class="p-1 font-bold text-blue-700">MAT-001</td>
                      <td class="p-1 font-sans text-slate-800">Cal hidratada bulto 25kg</td>
                      <td class="p-1 text-right">0.05</td>
                      <td class="p-1 text-right">$39.00</td>
                      <td class="p-1 text-right font-bold text-slate-900">$1.95</td>
                    </tr>
                    <tr>
                      <td class="p-1 font-bold text-amber-700">MO-001</td>
                      <td class="p-1 font-sans text-slate-800">Cuadrilla 01 TopÃ³grafo + 2 Cadeneros</td>
                      <td class="p-1 text-right">0.0028</td>
                      <td class="p-1 text-right">$3,642.00</td>
                      <td class="p-1 text-right font-bold text-slate-900">$10.20</td>
                    </tr>
                    <tr>
                      <td class="p-1 font-bold text-purple-700">EQ-001</td>
                      <td class="p-1 font-sans text-slate-800">EstaciÃ³n total y trÃ­pode</td>
                      <td class="p-1 text-right">0.022</td>
                      <td class="p-1 text-right">$133.60</td>
                      <td class="p-1 text-right font-bold text-slate-900">$2.94</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Totales APU: Costo Directo + Sobrecosto = Precio Unitario -->
              <div id="mock-step5-pu-total" class="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1 font-mono text-[10px]">
                <div class="flex justify-between text-slate-600">
                  <span>Costo Directo (CD):</span>
                  <span class="font-bold text-slate-900">$18.50</span>
                </div>
                <div class="flex justify-between text-blue-700 font-semibold">
                  <span>(+) Factor Sobrecosto (+26.93%):</span>
                  <span>+$4.98</span>
                </div>
                <div class="flex justify-between text-xs font-extrabold text-emerald-700 border-t border-slate-200 pt-1">
                  <span class="font-sans">PRECIO UNITARIO FINAL (PU):</span>
                  <span>$23.48 / m2</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'presupuesto', mainContent: apuPanelHtml });
      break;
    }

    case 6: { // CatÃ¡logos Maestros: BIMSA y Gobierno (Modal: master-catalog-modal)
      const masterModalHtml = `
        <div class="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado Real de index.html -->
          <div class="bg-slate-900 text-white p-3.5 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center text-sm shadow-sm">
                <i class="fa-solid fa-book-bookmark"></i>
              </div>
              <div>
                <h2 class="font-bold text-xs sm:text-sm leading-tight text-white">CatÃ¡logo Maestro y Biblioteca de Referencia</h2>
                <div class="flex items-center gap-2 text-[10px] text-slate-300 mt-0.5">
                  <span><i class="fa-solid fa-database text-amber-400"></i> 61,420 registros</span>
                  <span>â€¢</span>
                  <span>BIMSA 2018</span>
                  <span>â€¢</span>
                  <span class="text-blue-300">Tabulador Gobierno</span>
                </div>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- PestaÃ±a de NavegaciÃ³n -->
          <div class="bg-slate-100 border-b border-slate-200 px-4 py-1.5 flex justify-between items-center text-xs shrink-0">
            <div class="flex gap-1.5">
              <button class="px-3 py-1 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs border border-slate-200">
                <i class="fa-solid fa-magnifying-glass mr-1"></i> BÃºsqueda de Conceptos
              </button>
              <button class="px-3 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900">
                Administrar CatÃ¡logos
              </button>
            </div>
            <span class="text-[10px] text-slate-500 font-mono">BIMSA 2018 Oficial</span>
          </div>

          <!-- Cuerpo: Buscador y Vista Dividida de Especialidades -->
          <div class="p-3 space-y-2.5 overflow-hidden flex-1 flex flex-col bg-white">
            
            <!-- Buscador -->
            <div class="relative bg-slate-50 p-2 rounded-lg border border-slate-200 shrink-0">
              <i class="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <div id="mock-step6-search" class="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono text-slate-800 shadow-2xs">
                <span class="mock-type-value">Zapata corrida concreto f'c=250</span>
              </div>
            </div>

            <!-- Especialidades y Preview -->
            <div class="flex-1 flex gap-2.5 overflow-hidden border border-slate-200 rounded-lg">
              
              <!-- Especialidades a la izquierda -->
              <div id="mock-step6-specialties" class="w-36 bg-slate-50 border-r border-slate-200 p-2 space-y-1 text-[10px] shrink-0 font-medium">
                <div class="p-1.5 rounded bg-blue-600 text-white font-bold flex justify-between cursor-pointer">
                  <span>EdificaciÃ³n</span><span class="font-mono text-[9px] opacity-80">18.4k</span>
                </div>
                <div class="p-1.5 rounded hover:bg-slate-200 text-slate-700 flex justify-between cursor-pointer">
                  <span>Instalaciones</span><span class="font-mono text-[9px] opacity-60">14.1k</span>
                </div>
                <div class="p-1.5 rounded hover:bg-slate-200 text-slate-700 flex justify-between cursor-pointer">
                  <span>Infraestructura</span><span class="font-mono text-[9px] opacity-60">12.8k</span>
                </div>
              </div>

              <!-- Vista Previa del Concepto BIMSA -->
              <div id="mock-step6-preview" class="flex-1 p-2.5 space-y-2 overflow-y-auto bg-white text-[10.5px]">
                <div class="p-2.5 border border-blue-200 rounded-xl bg-blue-50/50 space-y-1.5">
                  <div class="flex justify-between items-center font-mono font-bold">
                    <span class="text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">CIM-BIMSA-421</span>
                    <span class="text-emerald-700 font-extrabold text-xs">$3,980.50 / m3</span>
                  </div>
                  <p class="font-sans font-medium text-slate-800 leading-snug">
                    Zapata corrida de concreto premezclado f'c=250 kg/cm2, incluye cimbra acabado comÃºn, habilitado de acero, vibrado y curado.
                  </p>
                  <div class="grid grid-cols-3 gap-1.5 text-[9px] text-slate-600 font-mono pt-1.5 border-t border-blue-200/60">
                    <div class="bg-white p-1 rounded border border-blue-100">Materiales: $2,420</div>
                    <div class="bg-white p-1 rounded border border-blue-100">Mano Obra: $1,180</div>
                    <div class="bg-white p-1 rounded border border-blue-100">Equipo: $380.50</div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Footer del Modal -->
          <div class="bg-slate-100 px-4 py-2 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">Cerrar</button>
            <button id="mock-step6-btn-insert" class="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-plus text-[10px]"></i> Insertar al Presupuesto
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeRail: 'master', overlayModal: masterModalHtml });
      break;
    }

        case 7: { // Inteligencia Artificial y Google Search Grounding (Modal Oficial: modal-ai-generator y Menú Dividido)
      const tableWithAiMenu = getRealisticBudgetTableHtml({ showAiMenu: true });

      const aiModalCardHtml = `
        <div id="mock-step7-modal-card" class="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Modal Header Oficial de index.html #modal-ai-generator -->
          <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-4 py-3 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                <i class="fa-brands fa-google text-sm"></i>
              </div>
              <div>
                <h3 class="font-bold text-xs leading-none text-white">Google Search Grounding para APU</h3>
                <span class="text-[10px] text-blue-200/80">Búsqueda de costos de mercado y rendimientos en vivo</span>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- Modal Body Oficial de index.html -->
          <div class="p-4 space-y-3 bg-white text-slate-800">
            <!-- Fila seleccionada en TAB1-CAT-BASE -->
            <div id="mock-step7-concept-card" class="p-3 bg-blue-50/50 border border-blue-200/80 rounded-lg space-y-1.5 ring-2 ring-blue-400">
              <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span class="truncate font-sans font-medium text-slate-600">Partida 02 Cimentación &gt; Zapatas</span>
                <span class="bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded text-[9px]">CIM-001</span>
              </div>
              <p class="font-bold text-slate-900 text-xs leading-snug">Zapata aislada de concreto f'c=250 kg/cm2</p>
              <div class="flex items-center gap-4 text-[10px] text-slate-600 pt-1 border-t border-blue-200/60">
                <span>Unidad base: <strong class="text-blue-800 font-mono font-bold">m3</strong></span>
                <span>Cantidad en catálogo: <strong class="text-slate-800 font-mono">64.00</strong></span>
              </div>
            </div>

            <!-- Entrada de API Key -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center text-[10.5px]">
                <label class="font-semibold text-slate-700 flex items-center gap-1">
                  <i class="fa-solid fa-key text-blue-600"></i> Google Gemini API Key
                </label>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-slate-600 font-medium flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    <i class="fa-solid fa-vial text-[8px] text-blue-600"></i> Probar Clave
                  </span>
                  <span class="text-[10px] text-blue-600 hover:underline flex items-center gap-1">
                    <i class="fa-solid fa-arrow-up-right-from-square text-[8px]"></i> Obtener clave gratuita
                  </span>
                </div>
              </div>
              <div class="flex gap-1.5">
                <input type="password" value="AIzaSyB3k928fK29x0LmP83921Z" readonly class="flex-1 border border-slate-300 rounded p-1.5 text-xs font-mono bg-slate-50 text-slate-700">
                <button class="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded text-slate-600">
                  <i class="fa-solid fa-eye text-xs"></i>
                </button>
              </div>
              <p class="text-[9.5px] text-slate-500 leading-tight">
                Déjalo vacío para usar el límite mensual incluido en tu suscripción. Con tu propia API Key desbloqueas generación y Web Search ilimitados.
              </p>

              <!-- Estado de Cuotas de IA del Plan -->
              <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-600 flex items-center justify-between">
                <span class="font-semibold text-slate-700">Plan Profesional • Cuota IA: <strong class="text-emerald-600">Ilimitada con API propia</strong></span>
                <span class="font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Web Search: 200/200</span>
              </div>

              <!-- Toggle explícito para Google Search Grounding -->
              <div id="mock-step7-grounding-toggle" class="flex items-start gap-2 p-2.5 bg-amber-50/70 border border-amber-300 rounded-lg cursor-pointer ring-2 ring-amber-400">
                <input type="checkbox" checked readonly class="mt-0.5 w-3.5 h-3.5 rounded text-amber-600 border-amber-400">
                <div class="flex-1">
                  <span class="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                    <i class="fa-solid fa-globe text-amber-600 text-[10px]"></i>
                    Activar Google Search Grounding en vivo (Cotizar precios actuales en internet)
                  </span>
                  <span class="text-[10px] text-amber-800 block mt-0.5">
                    Fuentes en tiempo real: The Home Depot México, Construrama, Cemex México y Diario Oficial de la Federación.
                  </span>
                </div>
              </div>

              <p class="text-[10px] text-slate-500 leading-tight">
                <strong>Modo activo:</strong> Gemini 1.5 Flash + Búsqueda de insumos y rendimientos web en tiempo real.
              </p>
            </div>
          </div>

          <!-- Footer Buttons Oficial de index.html -->
          <div class="bg-slate-50 px-4 py-3 border-t border-slate-200 flex justify-end items-center gap-2 shrink-0">
            <button class="px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-700 font-medium text-xs">
              Cancelar
            </button>
            <button id="mock-step7-btn-run" class="px-4 py-1.5 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-500 hover:to-orange-500 text-white rounded font-medium shadow-sm transition text-xs flex items-center gap-1.5 ring-2 ring-amber-400 shadow-amber-500/20">
              <i class="fa-solid fa-globe text-[10px] text-amber-200"></i> Cotizar en Web y Llenar Matriz
            </button>
          </div>
        </div>
      `;

      container.innerHTML = renderRealisticWorkspaceShell({
        activeTab: 'presupuesto',
        mainContent: tableWithAiMenu,
        overlayModal: aiModalCardHtml,
        overlayModalWrapperId: 'mock-step7-modal-overlay',
        overlayModalHidden: true
      });
      break;
    }

    case 8: { // ExplosiÃ³n y Consolidado de Insumos Generales
      const insumosContentHtml = `
        <div class="flex-1 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden m-2 text-slate-800 text-[11px]">
          <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div class="flex items-center gap-1.5 bg-slate-200/80 p-0.5 rounded-md border border-slate-300">
              <button type="button" class="px-2.5 py-0.5 rounded text-[10px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1">
                <i class="fa-solid fa-list-check"></i> CatÃ¡logo Base
              </button>
              <button type="button" id="mock-step8-tab-insumos" class="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-2xs flex items-center gap-1">
                <i class="fa-solid fa-boxes-stacked"></i> ExplosiÃ³n de Insumos (6 CategorÃ­as)
              </button>
            </div>

            <button id="mock-step8-btn-unify" class="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-2xs flex items-center gap-1">
              <i class="fa-solid fa-object-group text-[9px]"></i> Unificar Insumos Duplicados
            </button>
          </div>

          <!-- Filtros por categorÃ­a -->
          <div id="mock-step8-filters" class="p-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 shrink-0 text-[10px]">
            <span class="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-bold cursor-pointer">Materiales (48)</span>
            <span class="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-medium cursor-pointer">Mano de Obra (8)</span>
            <span class="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-medium cursor-pointer">Maquinaria (6)</span>
            <span class="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 font-medium cursor-pointer">Subcontratos (4)</span>
          </div>

          <!-- Alerta de Cascada -->
          <div id="mock-step8-cascade" class="px-3 py-1 bg-amber-50 border-b border-amber-200 text-amber-900 text-[10px] flex items-center justify-between font-medium">
            <span><i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i> RecÃ¡lculo en cascada activo: cambiar el costo unitario actualiza todas las matrices del presupuesto.</span>
            <span class="text-amber-800 font-bold font-mono">6 Matrices Vinculadas</span>
          </div>

          <!-- Tabla de Insumos -->
          <div class="flex-1 overflow-auto bg-white min-h-0">
            <table class="w-full text-left border-collapse text-[10px]">
              <thead class="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 border-b border-slate-200 text-[9px]">
                <tr>
                  <th class="p-1.5 w-20">Clave</th>
                  <th class="p-1.5">DescripciÃ³n del Insumo Consolidado</th>
                  <th class="p-1.5 w-16 text-center">Unidad</th>
                  <th class="p-1.5 w-20 text-right">Cantidad Total</th>
                  <th class="p-1.5 w-28 text-right">Costo Unitario</th>
                  <th class="p-1.5 w-28 text-right">Importe Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-mono text-[9.5px]">
                <tr class="bg-blue-50/50">
                  <td class="p-1.5 font-bold text-slate-800">MAT-001</td>
                  <td class="p-1.5 font-sans font-medium text-slate-900">Cemento Gris Monterrey Tipo CPC 30R</td>
                  <td class="p-1.5 text-center">Ton</td>
                  <td class="p-1.5 text-right font-bold">18.50</td>
                  <td class="p-1.5 text-right" id="mock-step8-price-cell">
                    <span class="p-1 rounded bg-amber-100 text-amber-950 font-bold ring-1 ring-amber-400 mock-type-value">$3,850.00 / Ton</span>
                  </td>
                  <td class="p-1.5 text-right text-emerald-700 font-bold">$71,225.00</td>
                </tr>
                <tr>
                  <td class="p-1.5 font-bold text-slate-800">MAT-002</td>
                  <td class="p-1.5 font-sans text-slate-800">Varilla Corrugada No. 4 (1/2") Grado 42</td>
                  <td class="p-1.5 text-center">Ton</td>
                  <td class="p-1.5 text-right font-bold">4.20</td>
                  <td class="p-1.5 text-right font-bold text-slate-700">$22,400.00</td>
                  <td class="p-1.5 text-right text-emerald-700 font-bold">$94,080.00</td>
                </tr>
                <tr>
                  <td class="p-1.5 font-bold text-slate-800">MAT-003</td>
                  <td class="p-1.5 font-sans text-slate-800">Arena triturada de mina grano fino</td>
                  <td class="p-1.5 text-center">m3</td>
                  <td class="p-1.5 text-right font-bold">32.00</td>
                  <td class="p-1.5 text-right font-bold text-slate-700">$420.00</td>
                  <td class="p-1.5 text-right text-emerald-700 font-bold">$13,440.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'presupuesto', activeSubtab: 'insumos', mainContent: insumosContentHtml });
      break;
    }

    case 9: { // Compras, Gastos y ERP Financiero (Modal: modal-nueva-compra)
      const compraModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado Real de index.html -->
          <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-5 py-3.5 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                <i class="fa-solid fa-cart-shopping text-sm"></i>
              </div>
              <div>
                <h3 class="font-extrabold text-xs sm:text-sm leading-tight text-white">Nueva Compra / Registro de Gasto</h3>
                <p class="text-[10px] text-blue-200/80">Control de egresos, orden de compra y cruce con explosiÃ³n de insumos</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- Cuerpo del Modal -->
          <div class="p-4 space-y-3 overflow-y-auto max-h-[60vh] bg-white text-slate-800">
            <!-- VinculaciÃ³n con Insumo (idÃ©ntico a index.html) -->
            <div class="p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-[10.5px] font-bold text-slate-800 flex items-center gap-1.5">
                  <i class="fa-solid fa-link text-blue-600"></i> Vincular a Insumo del CatÃ¡logo Base:
                </label>
                <span class="text-[9.5px] text-blue-700 font-semibold">Cruce automÃ¡tico vs Presupuesto</span>
              </div>
              <div class="bg-white border border-blue-200 rounded-lg p-1.5 text-xs text-slate-800 font-medium">
                MAT-001 â€¢ Concreto premezclado f'c=250 kg/cm2
              </div>
            </div>

            <!-- Fila: Fecha y Tipo -->
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block font-bold text-slate-700 mb-0.5 text-[10px]">Fecha:</label>
                <input type="text" value="2026-11-13" readonly class="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-0.5 text-[10px]">Tipo de Gasto:</label>
                <div class="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-medium">ðŸ“¦ Materiales</div>
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-0.5 text-[10px]">Partida:</label>
                <input type="text" value="CimentaciÃ³n" readonly class="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs">
              </div>
            </div>

            <!-- DescripciÃ³n de Gasto -->
            <div>
              <label class="block font-bold text-slate-700 mb-0.5 text-[10.5px]">DescripciÃ³n del Insumo / Factura: *</label>
              <div id="mock-step9-form" class="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium text-slate-900 shadow-2xs">
                <span class="mock-type-value">Factura F-4892 â€¢ Concreto premezclado f'c=250 kg/cm2</span>
              </div>
            </div>

            <!-- Proveedor e Importe -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-bold text-slate-700 mb-0.5 text-[10px]">Proveedor:</label>
                <input type="text" value="CEMEX Concretos S.A." readonly class="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-semibold">
              </div>
              <div>
                <label class="block font-bold text-slate-700 mb-0.5 text-[10px]">Importe Total con IVA:</label>
                <input type="text" value="$68,400.00" readonly class="w-full bg-slate-50 border border-slate-300 rounded-lg p-1.5 text-xs font-mono font-bold text-emerald-700">
              </div>
            </div>

            <!-- Estatus -->
            <div class="flex items-center justify-between pt-1">
              <label class="font-bold text-slate-700 text-[10.5px]">Estatus de TesorerÃ­a:</label>
              <div id="mock-step9-status" class="flex gap-1.5">
                <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[10px] cursor-pointer">Pagado âœ“</span>
                <span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium text-[10px]">Pendiente â³</span>
              </div>
            </div>
          </div>

          <!-- Footer del Modal -->
          <div class="bg-slate-100 px-4 py-2.5 border-t border-slate-200 flex justify-between items-center shrink-0">
            <button class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">Cancelar</button>
            <div class="flex gap-2">
              <button id="mock-step9-btn-order" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1">
                <i class="fa-solid fa-file-invoice text-amber-500"></i> Orden de Compra
              </button>
              <button class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow flex items-center gap-1.5">
                <i class="fa-solid fa-check text-[10px]"></i> Guardar Gasto
              </button>
            </div>
          </div>
        </div>
      `;

      const comprasContentHtml = `
        <div class="flex-1 bg-slate-900 text-slate-100 flex flex-col overflow-hidden p-3 gap-3 text-xs">
          <!-- KPI Cards -->
          <div class="grid grid-cols-3 gap-2.5 shrink-0">
            <div class="bg-slate-850 border border-slate-750 p-2.5 rounded-xl shadow-sm">
              <span class="text-[9.5px] text-slate-400 font-bold uppercase block">Presupuesto Asignado</span>
              <span class="font-mono text-sm font-extrabold text-blue-400">$417,726.92</span>
            </div>
            <div class="bg-slate-850 border border-slate-750 p-2.5 rounded-xl shadow-sm">
              <span class="text-[9.5px] text-slate-400 font-bold uppercase block">Gastos Ejercidos (43.7%)</span>
              <span class="font-mono text-sm font-extrabold text-amber-400">$182,450.00</span>
            </div>
            <div class="bg-slate-850 border border-slate-750 p-2.5 rounded-xl shadow-sm">
              <span class="text-[9.5px] text-slate-400 font-bold uppercase block">Saldo Disponible</span>
              <span class="font-mono text-sm font-extrabold text-emerald-400">$235,276.92</span>
            </div>
          </div>

          <!-- Toolbar de Compras -->
          <div class="flex items-center justify-between pb-1 shrink-0">
            <div class="flex items-center gap-2">
              <button id="mock-step9-btn-new" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/30 flex items-center gap-1.5">
                <i class="fa-solid fa-plus text-[10px]"></i> + Registrar Gasto
              </button>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">14 Facturas Registradas</span>
          </div>

          <!-- Historial -->
          <div class="flex-1 bg-slate-850 border border-slate-750 rounded-xl overflow-hidden flex flex-col">
            <div class="p-2 border-b border-slate-750 bg-slate-900/60 font-bold text-white text-xs">Historial de Ã“rdenes y Facturas</div>
            <div class="flex-1 overflow-auto">
              <table class="w-full text-left text-[10px] font-mono">
                <thead class="bg-slate-900 text-slate-400 uppercase font-bold sticky top-0 border-b border-slate-750 text-[9px]">
                  <tr><th class="p-2">Folio</th><th class="p-2">Proveedor</th><th class="p-2">Concepto</th><th class="p-2 text-right">Importe</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-800 text-[9.5px]">
                  <tr><td class="p-2 text-blue-400">F-4892</td><td class="p-2 text-white">CEMEX Concretos S.A.</td><td class="p-2 text-slate-300">Concreto bombeado f'c=250</td><td class="p-2 text-right text-emerald-400 font-bold">$68,400.00</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'compras', mainContent: comprasContentHtml, overlayModal: compraModalHtml });
      break;
    }

    case 10: { // BitÃ¡cora ElectrÃ³nica y Legal de Obra (Modal: modal-nueva-nota-bitacora)
      const bitacoraModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado Legal Real -->
          <div class="bg-slate-900 text-white p-3.5 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center text-sm shadow-sm">
                <i class="fa-solid fa-book-bookmark"></i>
              </div>
              <div>
                <h3 class="font-bold text-xs sm:text-sm text-white">Nueva Nota de BitÃ¡cora ElectrÃ³nica</h3>
                <p class="text-[10px] text-slate-300">Reglamento LOPSRM â€¢ Folio Inmutable Cifrado</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- Cuerpo de la Nota -->
          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div class="flex items-center justify-between pb-1.5 border-b border-slate-200 flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded bg-blue-600 text-white font-bold text-[10px]">Nota #001</span>
                <span class="font-bold text-slate-800 text-xs">Colado de Zapatas Aisladas Ejes A-F</span>
              </div>
              <div id="mock-step10-weather" class="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-[10px]">
                <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-300">â˜€ï¸ Soleado 24Â°C</span>
                <span class="px-2 py-0.5 text-slate-500">ðŸŒ§ï¸ Lluvia</span>
              </div>
            </div>

            <!-- Contenido redactado -->
            <div id="mock-step10-editor" class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 leading-relaxed font-sans text-[11px]">
              <span class="mock-type-value">Siendo las 08:00 hrs se da inicio al suministro y colocaciÃ³n de concreto premezclado f'c=250 kg/cm2 en zapatas aisladas. Se tomaron 4 cilindros de muestra para prueba de laboratorio.</span>
            </div>

            <!-- Sello Digital Manuscrito -->
            <div>
              <label class="text-[10px] text-slate-600 font-bold block mb-1">Firma Digital Manuscrita (TÃ¡ctil / Cifrado LOPSRM)</label>
              <div id="mock-step10-stamp" class="h-14 rounded-xl bg-slate-50 border border-slate-300 p-2 flex items-center justify-center relative">
                <span class="font-serif italic text-blue-800 text-lg font-bold tracking-widest select-none">Ing. Carlos Mendoza Residente</span>
                <span class="absolute bottom-1 right-2 text-[8px] text-slate-400 font-mono">Hash SHA-256 Validado</span>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="bg-slate-100 px-4 py-2 border-t border-slate-200 flex justify-between items-center shrink-0">
            <span class="text-[9px] text-slate-500 font-mono">Folio Inmutable #001</span>
            <button id="mock-step10-btn-seal" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-stamp text-[10px]"></i> Sellar Nota Oficial (LOPSRM)
            </button>
          </div>
        </div>
      `;

      const bitacoraContentHtml = `
        <div class="flex-1 bg-slate-900 text-slate-100 flex flex-col overflow-hidden p-3 gap-3 text-xs">
          <div class="p-2.5 bg-slate-850 border border-slate-750 rounded-xl flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <i class="fa-solid fa-book-bookmark text-xs"></i>
              </span>
              <div>
                <h3 class="font-bold text-white text-xs">BitÃ¡cora Oficial de Obra â€¢ Libro Digital LOPSRM</h3>
                <span class="text-[9px] text-slate-400 font-mono">Folio Legal Inmutable #001 â€¢ Cifrado SHA-256</span>
              </div>
            </div>
            <button id="mock-step10-btn-note" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/30 flex items-center gap-1.5">
              <i class="fa-solid fa-plus text-[10px]"></i> + Nueva Nota de BitÃ¡cora
            </button>
          </div>
          <div id="mock-step10-timeline" class="flex-1 bg-slate-850 border border-slate-750 rounded-xl p-3">
            <span class="text-slate-400 text-[10px]">LÃ­nea de tiempo cronolÃ³gica inmutable</span>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'bitacora', mainContent: bitacoraContentHtml, overlayModal: bitacoraModalHtml });
      break;
    }

    case 11: { // Calendario de Obra y Diagrama de Gantt
      const calContentHtml = `
        <div class="flex-1 bg-slate-900 text-slate-100 flex flex-col overflow-hidden p-3 gap-2.5 text-xs">
          <!-- Toolbar Calendario -->
          <div class="flex items-center justify-between pb-1 shrink-0 flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <button id="mock-step11-btn-jornada" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold text-xs shadow-sm flex items-center gap-1.5">
                <i class="fa-solid fa-wand-magic-sparkles text-amber-300 text-[10px]"></i> Configurar Jornada & DÃ­as InhÃ¡biles
              </button>
              <button id="mock-step11-critical" class="px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center gap-1.5">
                <i class="fa-solid fa-route text-rose-400 text-[10px]"></i> Ruta CrÃ­tica Activa
              </button>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">DuraciÃ³n Total: 180 DÃ­as Calendario</span>
          </div>

          <!-- Gantt Chart Bars -->
          <div id="mock-step11-gantt-bars" class="flex-1 bg-slate-850 border border-slate-750 rounded-xl p-3 flex flex-col gap-2 overflow-hidden">
            <div class="flex justify-between text-[9px] font-mono text-slate-400 border-b border-slate-750 pb-1">
              <span class="w-36">Concepto / Partida</span>
              <span class="flex-1 flex justify-around"><span>Sem 1</span><span>Sem 2</span><span>Sem 3</span><span>Sem 4</span><span>Sem 5</span><span>Sem 6</span></span>
            </div>
            <div class="space-y-2 text-[9.5px]">
              <div class="flex items-center gap-2">
                <span class="w-36 font-bold text-white truncate">01 Preliminares</span>
                <div class="flex-1 bg-slate-800 h-5 rounded-lg relative overflow-hidden">
                  <div class="absolute left-0 w-1/4 h-full bg-blue-500 rounded-lg flex items-center px-2 text-[9px] font-bold text-white">15 DÃ­as</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-36 font-bold text-rose-300 truncate">02 CimentaciÃ³n (CrÃ­tica)</span>
                <div class="flex-1 bg-slate-800 h-5 rounded-lg relative overflow-hidden">
                  <div class="absolute left-[20%] w-[35%] h-full bg-rose-600 rounded-lg flex items-center px-2 text-[9px] font-bold text-white shadow-sm ring-1 ring-rose-400">30 DÃ­as (CrÃ­tica)</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="w-36 font-bold text-white truncate">03 Estructura Concreto</span>
                <div class="flex-1 bg-slate-800 h-5 rounded-lg relative overflow-hidden">
                  <div class="absolute left-[50%] w-[45%] h-full bg-emerald-600 rounded-lg flex items-center px-2 text-[9px] font-bold text-white">45 DÃ­as</div>
                </div>
              </div>
            </div>
            <div id="mock-step11-progress" class="mt-auto pt-2 border-t border-slate-750 flex justify-between text-[10px]">
              <span class="text-slate-400">Avance Programado vs Real</span>
              <span class="font-bold text-emerald-400">En Tiempo (+2.1%)</span>
            </div>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'calendario', mainContent: calContentHtml });
      break;
    }

    case 12: { // Estimaciones y NÃºmeros Generadores de Cobro
      const estContentHtml = `
        <div class="flex-1 bg-slate-900 text-slate-100 flex flex-col overflow-hidden p-3 gap-2.5 text-xs">
          <div class="flex items-center justify-between pb-1 shrink-0">
            <div class="flex items-center gap-2">
              <button id="mock-step12-btn-generate" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/30 flex items-center gap-1.5">
                <i class="fa-solid fa-plus text-[10px]"></i> + Generar EstimaciÃ³n #01
              </button>
            </div>
            <span class="text-[10px] text-slate-400 font-mono">Corte: Quincena 01 â€¢ PerÃ­odo 01/Nov al 15/Nov</span>
          </div>

          <div class="flex-1 flex gap-3 overflow-hidden">
            <div id="mock-step12-volumes" class="flex-1 bg-slate-850 border border-slate-750 rounded-xl p-3 flex flex-col">
              <span class="font-bold text-white text-xs mb-2">Conceptos Estimados en el PerÃ­odo</span>
              <div class="flex-1 overflow-auto">
                <table class="w-full text-left text-[10px] font-mono">
                  <thead class="bg-slate-900 text-slate-400 font-bold border-b border-slate-750">
                    <tr><th class="p-1.5">Clave</th><th class="p-1.5">Volumen</th><th class="p-1.5 text-right">P.U.</th><th class="p-1.5 text-right">Importe</th></tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800">
                    <tr><td class="p-1.5 font-bold text-blue-400">PRE-001</td><td class="p-1.5">450.00 m2</td><td class="p-1.5 text-right">$18.50</td><td class="p-1.5 text-right font-bold text-white">$8,325.00</td></tr>
                    <tr><td class="p-1.5 font-bold text-blue-400">CIM-001</td><td class="p-1.5">9.20 m3</td><td class="p-1.5 text-right">$4,379.08</td><td class="p-1.5 text-right font-bold text-white">$40,287.54</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div id="mock-step12-finiquito" class="w-72 bg-slate-850 border border-slate-750 rounded-xl p-3 flex flex-col justify-between">
              <div class="space-y-2">
                <span class="font-bold text-xs text-white block border-b border-slate-750 pb-1">CarÃ¡tula de EstimaciÃ³n</span>
                <div class="flex justify-between text-slate-300 font-mono text-[10px]"><span>Subtotal Estimado:</span><span>$48,612.54</span></div>
                <div class="flex justify-between text-amber-400 font-mono text-[10px]"><span>(-) Fondo GarantÃ­a (5%):</span><span>-$2,430.63</span></div>
                <div class="flex justify-between text-emerald-400 font-mono text-xs font-bold border-t border-slate-750 pt-1">
                  <span>LÃQUIDO A PAGAR:</span><span>$46,181.91</span>
                </div>
              </div>
              <button id="mock-step12-btn-download" class="w-full py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center gap-1.5">
                <i class="fa-solid fa-file-pdf"></i> Descargar CarÃ¡tula PDF
              </button>
            </div>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'estimaciones', mainContent: estContentHtml });
      break;
    }

    case 13: { // Importador Universal (Modal: universal-import-modal)
      const importModalHtml = `
        <div class="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado Real de index.html -->
          <div class="bg-slate-900 text-white p-3.5 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <i class="fa-solid fa-file-import text-sm"></i>
              </div>
              <div>
                <h3 class="font-bold text-xs sm:text-sm text-white">Importador Universal de Archivos y Presupuestos</h3>
                <p class="text-[10px] text-slate-300">Compatible con Opus (.zip, .bak), Neodata, Excel (.xlsx, .xls), CSV y JSON</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- Cuerpo: Dropzone y Formatos Reales -->
          <div class="p-4 space-y-3 bg-white text-slate-800">
            <div id="mock-step13-dropzone" class="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-6 text-center bg-slate-50 transition cursor-pointer">
              <div class="w-10 h-10 mx-auto rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg mb-2">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </div>
              <span class="font-bold text-xs text-slate-700 block">Presupuesto_Residencial_Opus.xlsx</span>
              <span class="text-[10px] text-slate-500 mt-0.5 block">Arrastra tu archivo o haz clic para examinar</span>
              
              <div id="mock-step13-formats" class="flex flex-wrap justify-center gap-1.5 mt-2.5 text-[9.5px] font-mono">
                <span class="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded font-bold"><i class="fa-solid fa-box-archive mr-1"></i>.zip Opus / Neodata</span>
                <span class="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded font-bold"><i class="fa-solid fa-database mr-1"></i>.bak Opus</span>
                <span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded font-bold"><i class="fa-solid fa-file-excel mr-1"></i>.xlsx / .xls</span>
                <span class="bg-slate-100 text-slate-700 border border-slate-300 px-2 py-0.5 rounded font-bold">.csv / .json</span>
              </div>
            </div>

            <!-- Vista Previa de DetecciÃ³n -->
            <div id="mock-step13-preview" class="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200 text-[10px] flex justify-between items-center">
              <span class="text-blue-900 font-bold flex items-center gap-1.5">
                <i class="fa-solid fa-check-double text-blue-600"></i> Vista Previa: 2,450 Renglones y 12 Partidas Detectadas
              </span>
              <span class="font-mono text-emerald-700 font-extrabold text-xs">$2,043,699.52 MXN</span>
            </div>
          </div>

          <!-- Footer del Modal -->
          <div class="bg-slate-100 px-4 py-2 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">Cancelar</button>
            <button id="mock-step13-btn-process" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-play text-[10px]"></i> Iniciar ImportaciÃ³n al CatÃ¡logo
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeRail: 'import', overlayModal: importModalHtml });
      break;
    }

    case 14: { // Reportes e ImpresiÃ³n Oficial en PDF (Modal: modal-presupuesto-firmas)
      const printModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado Real de index.html -->
          <div class="bg-slate-900 text-white p-3.5 flex justify-between items-center shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 text-sm">
                <i class="fa-solid fa-file-signature"></i>
              </div>
              <div>
                <h3 class="font-bold text-xs sm:text-sm text-white">Responsables y Firmas del Presupuesto</h3>
                <p class="text-[10px] text-slate-300">AparecerÃ¡n al pie del formato impreso oficial y reporte PDF</p>
              </div>
            </div>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- Cuerpo: Formatos y 4 Firmantes -->
          <div class="p-4 space-y-3 bg-white text-slate-800">
            <!-- Selector de Formato Oficial -->
            <div id="mock-step14-formats" class="grid grid-cols-3 gap-2">
              <div class="p-2 rounded-xl bg-blue-50 border-2 border-blue-600 text-center shadow-xs cursor-pointer">
                <strong class="text-blue-900 block text-[10.5px]">Presupuesto Base</strong>
                <span class="text-[8.5px] text-blue-700">Formato TAB1-CAT</span>
              </div>
              <div class="p-2 rounded-xl bg-slate-50 border border-slate-200 text-center cursor-pointer hover:bg-slate-100">
                <strong class="text-slate-800 block text-[10.5px]">Fichas de APU</strong>
                <span class="text-[8.5px] text-slate-500">Matrices Desglosadas</span>
              </div>
              <div class="p-2 rounded-xl bg-slate-50 border border-slate-200 text-center cursor-pointer hover:bg-slate-100">
                <strong class="text-slate-800 block text-[10.5px]">Insumos</strong>
                <span class="text-[8.5px] text-slate-500">ExplosiÃ³n General</span>
              </div>
            </div>

            <!-- 4 Firmas Oficiales de Obra -->
            <div id="mock-step14-signatures" class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span class="text-slate-700 font-bold block text-[10.5px]">Firmas Oficiales Configuradas (Membrete 1:1):</span>
              <div class="grid grid-cols-2 gap-2 text-[9.5px]">
                <div class="p-1.5 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[8.5px]">ElaborÃ³:</strong>
                  <span class="font-bold text-slate-800">Ing. Residente de Obra</span>
                </div>
                <div class="p-1.5 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[8.5px]">RevisÃ³:</strong>
                  <span class="font-bold text-slate-800">Superintendente General</span>
                </div>
                <div class="p-1.5 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[8.5px]">AprobÃ³:</strong>
                  <span class="font-bold text-slate-800">Director DRO</span>
                </div>
                <div class="p-1.5 rounded bg-white border border-slate-200">
                  <strong class="text-slate-500 block text-[8.5px]">AutorizÃ³:</strong>
                  <span class="font-bold text-slate-800">Cliente / Dependencia</span>
                </div>
              </div>
            </div>

            <!-- Vista Previa Vectorial -->
            <div id="mock-step14-preview" class="p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between items-center text-[10px]">
              <span class="text-slate-700 font-medium flex items-center gap-1.5">
                <i class="fa-solid fa-file-pdf text-rose-600 text-xs"></i> Vista Previa Vectorial Lista (4 Hojas con Logotipo Oficial)
              </span>
              <span class="text-emerald-700 font-mono font-bold">$417,726.92 MXN</span>
            </div>
          </div>

          <!-- Footer del Modal -->
          <div class="bg-slate-100 px-4 py-2 border-t border-slate-200 flex justify-end gap-2 shrink-0">
            <button class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold">Cerrar</button>
            <button id="mock-step14-btn-download" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow flex items-center gap-1.5">
              <i class="fa-solid fa-download text-[10px]"></i> Descargar PDF Oficial
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ activeTab: 'presupuesto', overlayModal: printModalHtml });
      break;
    }

    case 15: { // Seguridad, Respaldos y Perfil Profesional (Modal: modal-perfil-usuario)
      const profileModalHtml = `
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col text-slate-800 text-xs animate-in zoom-in-95 duration-150">
          <!-- Encabezado Real de index.html -->
          <div class="bg-slate-900 text-white p-3.5 flex justify-between items-center shrink-0">
            <h3 class="font-bold text-xs sm:text-sm flex items-center gap-2 text-white">
              <i class="fa-solid fa-user-gear text-blue-400"></i> Mi Perfil Profesional y Ajustes
            </h3>
            <button class="text-slate-400 hover:text-white p-1"><i class="fa-solid fa-xmark text-sm"></i></button>
          </div>

          <!-- Cuerpo: Avatar con Casco, Cuota y Seguridad -->
          <div class="p-4 space-y-3 bg-white text-slate-800">
            <!-- Foto y Perfil -->
            <div id="mock-step15-profile" class="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div class="w-12 h-12 rounded-full border-2 border-blue-500 bg-white flex items-center justify-center text-xl shadow-xs shrink-0">
                ðŸ‘·â€â™‚ï¸
              </div>
              <div class="space-y-0.5">
                <strong class="font-bold text-slate-900 text-xs block">Ing. Carlos Mendoza</strong>
                <span class="text-[10px] text-slate-500 font-mono block">admin@constructora.com â€¢ Plan Pro</span>
              </div>
            </div>

            <!-- Cuota de Almacenamiento AWS S3 -->
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div class="flex justify-between items-center text-[10px]">
                <span class="text-slate-600 font-semibold">Almacenamiento en la Nube (AWS S3)</span>
                <span id="mock-step15-quota" class="font-mono text-blue-700 font-bold">0.45 MB / 250 MB</span>
              </div>
              <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div class="h-full bg-blue-600 rounded-full" style="width: 8%;"></div>
              </div>
            </div>

            <!-- Candado Tab Lock -->
            <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-lock text-amber-500 text-sm"></i>
                <div>
                  <span class="font-bold text-slate-800 text-[10.5px] block">Candado Tab Lock Activo</span>
                  <span class="text-[9.5px] text-slate-500">ProtecciÃ³n contra ediciÃ³n accidental</span>
                </div>
              </div>
              <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-[9px]">Bloqueado âœ“</span>
            </div>
          </div>

          <!-- Footer: BotÃ³n Respaldo .JSON -->
          <div class="bg-slate-100 px-4 py-2 border-t border-slate-200 flex justify-between items-center shrink-0">
            <button id="mock-step15-btn-backup" class="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
              <i class="fa-solid fa-cloud-arrow-down text-blue-600"></i> Descargar Respaldo .JSON
            </button>
            <button id="mock-step15-logo" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow">
              <i class="fa-solid fa-check text-[10px]"></i> Guardar Perfil
            </button>
          </div>
        </div>
      `;
      container.innerHTML = renderRealisticWorkspaceShell({ overlayModal: profileModalHtml });
      break;
    }

    case 16: { // Modo de Trabajo: Obras Propias vs. Invitaciones (portalController.js: projectScopeModeSelect)
      container.innerHTML = renderRealisticPortalShell({
        highlightModeBar: true,
        scopeMode: 'owned'
      });
      break;
    }

    default:
      container.innerHTML = renderRealisticWorkspaceShell();
      break;
  }
}

