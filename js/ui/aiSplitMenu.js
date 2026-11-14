// Controlador del menú Split-Button unificado para generación de matrices APU y cotización de insumos
import { getAiQuotaBadgeSummary, syncAiQuotaFromSupabase } from '../modules/ai/aiQuotaAndCacheService.js';
import { isNightMode } from './themeController.js';

const MENU_ID = 'ai-split-floating-menu';

let activeScope = null;
let activeTriggerEl = null;
let listenersBound = false;

const SCOPE_CONFIG = {
  toolbar: {
    header: 'Generar matrices seleccionadas',
    includeLocalCatalog: true,
    onLocal: () => window.generarMatrizCasillasLocal?.(),
    onStandard: () => window.generarMatrizCasillasGoogleIA?.(),
    onWebSearch: () => window.generarMatrizCasillasConBusquedaWeb?.(),
    lockedViewId: 'view-cat'
  },
  apu: {
    header: 'Generar matriz de este concepto',
    includeLocalCatalog: true,
    onLocal: () => window.openLocalCatalogSelectorModal?.(true),
    onStandard: () => window.generarMatrizConceptoActivoGoogleIA?.(),
    onWebSearch: () => window.generarMatrizConBusquedaWebActiva?.(),
    lockedViewId: 'view-cat'
  },
  'apu-max': {
    header: 'Generar matriz de este concepto',
    includeLocalCatalog: true,
    onLocal: () => window.openLocalCatalogSelectorModal?.(true),
    onStandard: () => window.generarMatrizConceptoActivoGoogleIA?.(),
    onWebSearch: () => window.generarMatrizConBusquedaWebActiva?.(),
    lockedViewId: 'view-cat'
  },
  insumos: {
    header: 'Cotizar insumos seleccionados',
    includeLocalCatalog: false,
    onStandard: () => window.actualizarTodosLosInsumosSeleccionadosConIA?.(),
    onWebSearch: () => window.actualizarInsumosConBusquedaWeb?.(),
    lockedViewId: 'view-insumos'
  }
};

function ensureGlobalListeners() {
  if (listenersBound || typeof document === 'undefined') return;
  listenersBound = true;

  document.addEventListener('pointerdown', (e) => {
    const menu = document.getElementById(MENU_ID);
    if (!menu || menu.classList.contains('hidden')) return;
    if (menu.contains(e.target)) return;
    if (activeTriggerEl && activeTriggerEl.contains(e.target)) return;
    closeAiSplitMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAiSplitMenu();
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', closeAiSplitMenu);
    window.addEventListener('scroll', closeAiSplitMenu, true);
  }
}

function getOrCreateMenuElement() {
  let menu = document.getElementById(MENU_ID);
  if (!menu) {
    menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'menu');
    menu.className = 'hidden fixed rounded-xl shadow-2xl border overflow-hidden select-none';
    menu.style.zIndex = '100000';
    menu.style.width = '310px';
    document.body.appendChild(menu);
  }
  return menu;
}

function buildQuotaDescriptors(summary) {
  const usingKey = Boolean(summary?.usingOwnApiKey);
  const stdBadge = usingKey
    ? { text: 'Ilimitada (API propia)', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' }
    : { text: `${summary?.stdUsed ?? 0}/${summary?.stdMax ?? 10}`, cls: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/30' };

  const webMax = Number(summary?.webMax ?? 0);
  const webUsed = Number(summary?.webUsed ?? 0);
  const webBlockedPlan = !usingKey && webMax <= 0;

  let webBadge;
  if (usingKey) {
    webBadge = { text: 'API propia', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' };
  } else if (webBlockedPlan) {
    webBadge = { text: '🔒 Plus / Pro', cls: 'bg-slate-500/15 text-slate-500 border-slate-500/30' };
  } else {
    const exhausted = webUsed >= webMax;
    webBadge = {
      text: `${webUsed}/${webMax}`,
      cls: exhausted
        ? 'bg-rose-500/15 text-rose-600 border-rose-500/30'
        : 'bg-amber-500/15 text-amber-700 border-amber-500/30'
    };
  }

  return { stdBadge, webBadge, webBlockedPlan };
}

function renderMenuContent(menu, scope) {
  const cfg = SCOPE_CONFIG[scope];
  if (!cfg) return;

  const night = isNightMode();
  const summary = getAiQuotaBadgeSummary();
  const { stdBadge, webBadge, webBlockedPlan } = buildQuotaDescriptors(summary);

  menu.className = `fixed rounded-xl shadow-2xl border overflow-hidden select-none ${
    night
      ? 'bg-slate-900 border-slate-700 text-slate-100'
      : 'bg-white border-slate-200 text-slate-800'
  }`;

  const headerCls = night
    ? 'bg-slate-950/70 border-b border-slate-800 text-slate-400'
    : 'bg-slate-50 border-b border-slate-200 text-slate-500';
  const itemHoverCls = night ? 'hover:bg-slate-800/90' : 'hover:bg-slate-50';
  const defaultCardCls = night ? 'bg-indigo-950/35 hover:bg-indigo-950/60' : 'bg-indigo-50/60 hover:bg-indigo-50';
  const subCls = night ? 'text-slate-400' : 'text-slate-500';
  const dividerCls = night ? 'border-slate-800' : 'border-slate-100';

  const items = [];
  if (cfg.includeLocalCatalog) {
    items.push({
      action: 'local',
      icon: 'fa-solid fa-database',
      iconWrap: night ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700',
      title: 'Solo Catálogo Local',
      desc: 'Usa únicamente tus catálogos importados o de referencia.',
      badgeText: 'Gratis ($0)',
      badgeCls: night
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200',
      rowCls: itemHoverCls
    });
  }

  items.push({
    action: 'standard',
    icon: 'fa-solid fa-wand-magic-sparkles',
    iconWrap: night ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700',
    title: cfg.includeLocalCatalog ? 'IA Rápida (Recomendada)' : 'IA Rápida (Caché + Flash)',
    desc: cfg.includeLocalCatalog
      ? '1º Busca en catálogo/caché ($0) · 2º Gemini Flash sin Web.'
      : '1º Caché local ($0) · 2º Estimación estándar sin internet.',
    badgeText: stdBadge.text,
    badgeCls: stdBadge.cls,
    rowCls: defaultCardCls
  });

  items.push({
    action: 'web',
    icon: 'fa-solid fa-globe',
    iconWrap: night ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700',
    title: 'Precios Web en Vivo (Google)',
    desc: webBlockedPlan
      ? 'No incluido en Plan Gratuita (0/mes). Actualiza o usa tu API Key.'
      : 'Investiga precios comerciales vigentes hoy en internet.',
    badgeText: webBadge.text,
    badgeCls: webBadge.cls,
    rowCls: itemHoverCls
  });

  menu.innerHTML = `
    <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wider flex items-center justify-between ${headerCls}">
      <span>${cfg.header}</span>
      <span class="text-[9px] font-semibold opacity-80">Plan ${(summary?.planName || summary?.planId || 'Gratuita')}</span>
    </div>
    <div class="divide-y ${dividerCls}">
      ${items.map((it) => `
        <button type="button" data-ai-split-action="${it.action}" role="menuitem"
                class="w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition cursor-pointer ${it.rowCls}">
          <span class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs ${it.iconWrap}">
            <i class="${it.icon}"></i>
          </span>
          <span class="flex-1 min-w-0">
            <span class="flex items-center justify-between gap-2">
              <span class="font-bold text-xs leading-tight truncate">${it.title}</span>
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${it.badgeCls}">${it.badgeText}</span>
            </span>
            <span class="block text-[10.5px] leading-snug mt-0.5 ${subCls}">${it.desc}</span>
          </span>
        </button>
      `).join('')}
    </div>
  `;

  menu.querySelectorAll('[data-ai-split-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-ai-split-action');
      closeAiSplitMenu();
      if (action === 'local') cfg.onLocal?.();
      else if (action === 'standard') cfg.onStandard?.();
      else if (action === 'web') cfg.onWebSearch?.();
    });
  });
}

function positionMenu(menu, triggerEl) {
  const anchor = triggerEl?.closest('[id$="-ai-split-wrapper"]') || triggerEl;
  const rect = anchor.getBoundingClientRect();
  const menuW = Math.min(310, Math.max(260, window.innerWidth - 16));
  menu.style.width = `${menuW}px`;

  // Mostrar temporalmente invisible para medir altura real
  menu.style.visibility = 'hidden';
  menu.classList.remove('hidden');
  const menuH = menu.offsetHeight || 200;

  let left = rect.right - menuW;
  if (left < 8) left = Math.max(8, rect.left);
  if (left + menuW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuW - 8);

  let top = rect.bottom + 6;
  if (top + menuH > window.innerHeight - 10 && rect.top - menuH - 6 > 8) {
    top = rect.top - menuH - 6;
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.style.visibility = 'visible';
}

/**
 * Cierra el menú desplegable de modos IA si está abierto.
 */
export function closeAiSplitMenu() {
  if (typeof document === 'undefined') return;
  const menu = document.getElementById(MENU_ID);
  if (menu) menu.classList.add('hidden');
  if (activeTriggerEl) activeTriggerEl.setAttribute('aria-expanded', 'false');
  activeScope = null;
  activeTriggerEl = null;
}

/**
 * Abre o alterna el menú Split-Button con los modos Catálogo Local, IA Rápida y Precios Web.
 */
export function toggleAiSplitMenu(scope, triggerEl, ev) {
  if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
  if (typeof document === 'undefined' || !SCOPE_CONFIG[scope]) return;

  ensureGlobalListeners();
  const cfg = SCOPE_CONFIG[scope];
  const lockedView = cfg.lockedViewId ? document.getElementById(cfg.lockedViewId) : null;
  if (lockedView?.getAttribute('data-tab-locked') === 'true') return;

  const menu = getOrCreateMenuElement();
  const alreadyOpenForScope = !menu.classList.contains('hidden') && activeScope === scope;
  if (alreadyOpenForScope) {
    closeAiSplitMenu();
    return;
  }

  if (activeTriggerEl) activeTriggerEl.setAttribute('aria-expanded', 'false');
  activeScope = scope;
  activeTriggerEl = triggerEl || null;
  if (activeTriggerEl) activeTriggerEl.setAttribute('aria-expanded', 'true');

  renderMenuContent(menu, scope);
  positionMenu(menu, activeTriggerEl || document.body);

  // Refrescar cuota real desde Supabase sin bloquear apertura
  syncAiQuotaFromSupabase().then((synced) => {
    if (synced && activeScope === scope && !menu.classList.contains('hidden')) {
      renderMenuContent(menu, scope);
    }
  }).catch(() => {});
}
