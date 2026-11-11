// js/modules/portal/subscriptionModal.js
// Gestión integral de Planes de Suscripción del Usuario: Gratuita, Plus y Pro

import {
  getCurrentUser,
  saveCurrentUser,
  getLastKnownUser,
  syncOwnerProjectsPlan,
  findRegisteredUserAccount,
  saveRegisteredUserAccount,
  addFeaturedProfile
} from './projectService.js';
import { showToast } from '../../ui/notifications.js';
import { isNightMode } from '../../ui/themeController.js';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js';

export const STORAGE_KEY_SUBSCRIPTION = 'adm_const_subscription';

// Migración de compatibilidad: Asegurar que el plan quede ligado a la cuenta que lo compró
// y eliminar la clave global compartida para que no se filtre a otras cuentas ni a nuevos registros.
try {
  if (typeof localStorage !== 'undefined') {
    const legacyRaw = localStorage.getItem(STORAGE_KEY_SUBSCRIPTION);
    if (legacyRaw) {
      const curr = getCurrentUser();
      const em = (curr?.email || '').toLowerCase().trim();
      if (em && !localStorage.getItem(`adm_const_subscription_${em}`)) {
        localStorage.setItem(`adm_const_subscription_${em}`, legacyRaw);
      }
      localStorage.removeItem(STORAGE_KEY_SUBSCRIPTION);
    }
  }
} catch (_) {}

// Enlaces oficiales de Stripe Checkout (Modo Prueba) vinculados a tu cuenta
export const STRIPE_PAYMENT_LINKS = {
  plus: {
    monthly: 'https://buy.stripe.com/test_28E00ifDR5Sh4Jhbpe3Je00',
    annual: 'https://buy.stripe.com/test_4gMfZg63hgwVa3B9h63Je01'
  },
  pro: {
    monthly: 'https://buy.stripe.com/test_fZu7sK63hcgF1x564U3Je02',
    annual: 'https://buy.stripe.com/test_dRm3cuajx3K97Vt1OE3Je03'
  }
};

export const SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    name: 'Gratuita',
    badge: 'INICIAL',
    tagline: 'Ideal para estudiantes, docentes y profesionales que quieren presupuestar y organizar obras pequeñas.',
    monthlyPrice: 0,
    annualPrice: 0,
    currency: 'MXN',
    periodLabel: 'Siempre gratis',
    icon: 'fa-solid fa-seedling',
    popular: false,
    accent: 'slate',
    dropdownBadgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    maxProjects: 2,
    maxConcepts: 100,
    maxMembers: 3,
    storageMb: 200,
    catalogStorageMb: 6,
    aiMonthlyConcepts: 10,
    maxSearchQueries: 0,
    features: [
      'Hasta 2 proyectos activos en el portal',
      'Hasta 100 conceptos por proyecto',
      'Colaboración de 1 a 3 (hasta 3 usuarios) por cuenta para trabajar en equipo',
      'Almacenamiento en Nube de 200 MB para proyectos y evidencias (más guardado local en navegador)',
      'Espacio de 6 MB para importar catálogos maestros',
      'Catálogo Base, Matrices APU esenciales y Explosión de Insumos',
      'Copiado de conceptos con Matriz APU entre obras',
      'Importador universal (Excel, CSV, JSON y Opus)',
      'Calendario de Obra con Diagrama de Gantt básico',
      'Módulo de Estimaciones de Obra, Bitácora de obra y Control de Gastos básicos',
      'Impresión disponible en todas las pestañas (Catálogo Base, APU, Insumos, Calendario, Estimaciones, Gastos y Bitácora) con logotipo y nombre de la aplicación',
      'Vista de Día y Modo Nocturno incluidos',
      'IA Estándar (Motor local + Gemini Flash): hasta 10 conceptos/mes (o ilimitado con tu propia API Key de Google)',
      'Precios Web en Vivo (Google Search): 0 consultas/mes (o con API Key propia)'
    ]
  },
  {
    id: 'plus',
    name: 'Plus',
    badge: 'MÁS POPULAR',
    tagline: 'Para arquitectos independientes, contratistas, residentes y despachos en crecimiento.',
    monthlyPrice: 350,
    annualPrice: 280,
    originalMonthlyPrice: 799,
    originalAnnualPrice: 639,
    discountBadge: '56% OFF',
    currency: 'MXN',
    periodLabel: '/ mes',
    icon: 'fa-solid fa-bolt',
    popular: true,
    accent: 'blue',
    dropdownBadgeClass: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
    maxProjects: 15,
    maxConcepts: 1500,
    maxMembers: 10,
    storageMb: 2048,
    catalogStorageMb: 50,
    aiMonthlyConcepts: 1500,
    maxSearchQueries: 70,
    features: [
      'Hasta 15 proyectos activos en la nube con sincronización en tiempo real',
      'Hasta 1,500 líneas/conceptos por proyecto',
      'Hasta 10 usuarios incluidos bajo la misma suscripción (invitados entran 100% gratis)',
      'Selector de Espacio de Trabajo (Anfitrión / Personal)',
      'Almacenamiento en Nube de 2 GB para facturas, PDFs y fotografías de obra (con compresión inteligente)',
      'Espacio de 50 MB para importar catálogos maestros personalizados',
      'Catálogo Base, Matrices APU y Explosión de Insumos completa + copiado entre obras',
      'Asistente IA para análisis de insumos, matrices y secuencia lógica en Gantt',
      'Calendario Gantt avanzado con Ruta Crítica, Financiero y Curva "S"',
      'Control de Compras, Gastos, Órdenes de Compra y Dashboard Financiero (Presupuesto vs. Real)',
      'Bitácora de Obra Digital Legal con firmas digitales y compilación automática PDF inmutable',
      'Módulo completo de Estimaciones e Impresión profesional en todas las pestañas (sin marca de la app / con tu propio logotipo)',
      'Motor IA + Catálogo Inteligente: hasta 1,500 conceptos APU al mes por cuenta',
      'Cotizador Web en Vivo (Google Search): hasta 70 consultas de precios de mercado al mes'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'EMPRESARIAL',
    tagline: 'Para empresas constructoras, gerencias de obra, despachos de ingeniería de costos y licitadores.',
    monthlyPrice: 950,
    annualPrice: 760,
    originalMonthlyPrice: 1799,
    originalAnnualPrice: 1439,
    discountBadge: '47% OFF',
    currency: 'MXN',
    periodLabel: '/ mes',
    icon: 'fa-solid fa-crown',
    popular: false,
    accent: 'amber',
    dropdownBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
    maxProjects: 50,
    maxConcepts: 3500,
    maxMembers: 30,
    storageMb: 5120,
    catalogStorageMb: 200,
    aiMonthlyConcepts: 3500,
    maxSearchQueries: 200,
    features: [
      'Hasta 50 proyectos activos en la nube con sincronización en tiempo real',
      'Hasta 3,500 líneas/conceptos por proyecto (ideal para licitaciones y obra grande)',
      'Hasta 30 usuarios incluidos bajo la misma suscripción con control granular de permisos por proyecto y rol',
      'Almacenamiento en Nube de 5 GB de alta velocidad para toda la constructora',
      'Espacio de 200 MB para importar grandes catálogos maestros (Opus, Neodata, BIMSA, Excel)',
      'Catálogo Base, Matrices APU y Explosión de Insumos empresarial + copiado entre obras',
      'Asistente IA completo para precios unitarios, insumos, optimización de Ruta Crítica y Gantt',
      'Calendario Gantt avanzado con Ruta Crítica, Flujo Financiero y Curva "S"',
      'Control de Compras, Nómina/Rayas y Dashboard Financiero Ejecutivo (comparativa y alertas de sobrecosto)',
      'Bitácora de Obra Digital Legal: libro completo foliado en PDF, firmas digitales y archivo histórico',
      'Módulo completo de Estimaciones e Impresión institucional en todas las pestañas (Marca blanca / Membrete propio)',
      'Generación APU con Motor IA de alto volumen: hasta 3,500 conceptos al mes por cuenta',
      'Cotizador Web en Vivo (Google Search): hasta 200 consultas de precios de mercado al mes'
    ]
  }
];

let activeBillingCycle = 'monthly'; // 'monthly' | 'annual'

export function getPlanById(planId) {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];
}

export function getCurrentSubscription() {
  try {
    const user = getCurrentUser();
    const cleanEmail = (user?.email || '').toLowerCase().trim();

    if (cleanEmail && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.planId) {
          const validPlan = getPlanById(parsed.planId);
          return {
            planId: validPlan.id,
            billingCycle: parsed?.billingCycle === 'annual' ? 'annual' : 'monthly',
            updatedAt: parsed?.updatedAt || null
          };
        }
      }
    }

    if (user && user.subscription && user.subscription.planId) {
      const validPlan = getPlanById(user.subscription.planId);
      return {
        planId: validPlan.id,
        billingCycle: user.subscription.billingCycle === 'annual' ? 'annual' : 'monthly',
        updatedAt: user.subscription.updatedAt || null
      };
    }

    // Administrador Maestro default: Plan Pro garantizado entre dispositivos
    if (cleanEmail === 'hepc.90@gmail.com' || cleanEmail === 'admin.general@constructora.com') {
      const proPlan = { planId: 'pro', billingCycle: 'monthly', updatedAt: new Date().toISOString() };
      if (typeof localStorage !== 'undefined' && cleanEmail) {
        try { localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(proPlan)); } catch (_) {}
      }
      return proPlan;
    }
  } catch (e) {
    // Fallback seguro a plan Gratuita
  }

  return {
    planId: 'free',
    billingCycle: 'monthly',
    updatedAt: null
  };
}

export async function syncSubscriptionFromCloud(targetEmail = null) {
  try {
    const sb = getSupabaseClient();
    if (!sb || !isSupabaseConfigured()) return null;

    const user = getCurrentUser();
    const email = (targetEmail || user?.email || '').toLowerCase().trim();
    if (!email) return null;

    const { data: { user: authUser } } = await sb.auth.getUser();
    if (authUser && (authUser.email || '').toLowerCase().trim() === email) {
      const cloudSub = authUser.user_metadata?.subscription;
      if (cloudSub?.planId) {
        const validPlan = getPlanById(cloudSub.planId);
        const resolved = {
          planId: validPlan.id,
          billingCycle: cloudSub.billingCycle === 'annual' ? 'annual' : 'monthly',
          updatedAt: cloudSub.updatedAt || new Date().toISOString()
        };
        localStorage.setItem(`adm_const_subscription_${email}`, JSON.stringify(resolved));
        if (user && (user.email || '').toLowerCase().trim() === email) {
          user.subscription = resolved;
          saveCurrentUser(user);
          updateSubscriptionBadgesUI();
          if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
            try { window.refreshProjectsGridUI(); } catch (_) {}
          }
        }
        return resolved;
      }
    }
  } catch (e) {
    console.warn('[Subscription] Error al sincronizar desde la nube:', e);
  }
  return null;
}

export function saveSubscription(planId, billingCycle = activeBillingCycle) {
  const validPlan = getPlanById(planId);
  const normalizedCycle = billingCycle === 'annual' ? 'annual' : 'monthly';
  const payload = {
    planId: validPlan.id,
    billingCycle: normalizedCycle,
    updatedAt: new Date().toISOString()
  };

  const user = getCurrentUser();
  const cleanEmail = (user?.email || '').toLowerCase().trim();

  try {
    if (typeof localStorage !== 'undefined' && cleanEmail) {
      // Guardar de forma estricta y permanente para el usuario específico que compró el plan
      localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(payload));
    }
  } catch (e) {}

  // Sincronizar en Supabase Auth en la nube para acceso entre múltiples computadoras y dispositivos
  try {
    const sb = getSupabaseClient();
    if (sb && isSupabaseConfigured() && cleanEmail) {
      sb.auth.getUser().then(({ data: { user: authUser } }) => {
        if (authUser && (authUser.email || '').toLowerCase().trim() === cleanEmail) {
          sb.auth.updateUser({
            data: { subscription: payload }
          }).then(() => {
            console.info('[Subscription] Suscripción sincronizada en la nube de Supabase Auth.');
          }).catch(err => {
            console.warn('[Subscription] Aviso al sincronizar en Supabase Auth:', err?.message || err);
          });
        }
      }).catch(() => {});

      if (user?.empresaId) {
        sb.from('empresas').update({
          plan: validPlan.id,
          updated_at: new Date().toISOString()
        }).eq('id', user.empresaId).then(() => {}).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Subscription] Error en sync cloud:', err);
  }

  try {
    if (user) {
      user.subscription = payload;
      saveCurrentUser(user);
      if (cleanEmail) {
        try {
          const regUser = findRegisteredUserAccount(cleanEmail);
          if (regUser) {
            regUser.subscription = payload;
            saveRegisteredUserAccount(regUser);
          } else {
            saveRegisteredUserAccount(user);
          }
          addFeaturedProfile(user);
        } catch (_) {}
        try {
          syncOwnerProjectsPlan(cleanEmail, validPlan.id);
        } catch (_) {}
      }
    }
  } catch (e) {}

  return payload;
}

export function updateSubscriptionBadgesUI(options = {}) {
  const { refreshGrid = true } = options || {};
  if (typeof document === 'undefined') return;
  const sub = getCurrentSubscription();
  const plan = getPlanById(sub.planId);

  const dropdownBadge = document.getElementById('dropdown-user-plan-badge');
  if (dropdownBadge) {
    dropdownBadge.textContent = plan.name;
    dropdownBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${plan.dropdownBadgeClass}`;
  }

  const portalDropdownBadge = document.getElementById('portal-dropdown-user-plan-badge');
  if (portalDropdownBadge) {
    portalDropdownBadge.textContent = plan.name;
    portalDropdownBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full border ${plan.dropdownBadgeClass}`;
  }

  const profileModalBadge = document.getElementById('profile-modal-plan-badge');
  if (profileModalBadge) {
    profileModalBadge.textContent = `Plan ${plan.name}`;
  }

  const headerActiveBadge = document.getElementById('subscription-header-active-badge');
  if (headerActiveBadge) {
    headerActiveBadge.textContent = `Plan actual: ${plan.name}`;
  }

  // Refrescar inmediatamente el indicador de membresía del portal (#mode-status-badge) y botón de nuevo proyecto
  if (refreshGrid) {
    try {
      if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    } catch (_) {}
  }
}

function updateBillingCycleToggleUI() {
  if (typeof document === 'undefined') return;
  const btnMonthly = document.getElementById('btn-sub-cycle-monthly');
  const btnAnnual = document.getElementById('btn-sub-cycle-annual');
  const night = isNightMode();

  if (btnMonthly) {
    btnMonthly.className = activeBillingCycle === 'monthly'
      ? (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm transition cursor-pointer'
        : 'px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm border border-slate-200 transition cursor-pointer')
      : (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer'
        : 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer');
  }

  if (btnAnnual) {
    btnAnnual.className = activeBillingCycle === 'annual'
      ? (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm transition cursor-pointer flex items-center gap-1.5'
        : 'px-4 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-900 shadow-sm border border-slate-200 transition cursor-pointer flex items-center gap-1.5')
      : (night
        ? 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer flex items-center gap-1.5'
        : 'px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer flex items-center gap-1.5');
  }
}

export function renderSubscriptionCards() {
  if (typeof document === 'undefined') return;
  const grid = document.getElementById('subscription-plans-grid');
  if (!grid) return;

  const currentSub = getCurrentSubscription();
  const night = isNightMode();

  updateBillingCycleToggleUI();
  updateSubscriptionBadgesUI();

  grid.innerHTML = SUBSCRIPTION_PLANS.map(plan => {
    const isCurrent = currentSub.planId === plan.id;
    const price = activeBillingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice;
    const origPrice = activeBillingCycle === 'annual' ? plan.originalAnnualPrice : plan.originalMonthlyPrice;
    const hasDiscount = Boolean(origPrice && origPrice > price);
    const annualTotal = plan.annualPrice * 12;

    // Estilos adaptativos según nivel de suscripción y modo visual (Día / Nocturno)
    let cardBorder = night ? 'border-slate-700/90 bg-slate-900/90' : 'border-slate-200 bg-white';
    let badgeClasses = night ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-100 text-slate-700 border border-slate-200';
    let iconBoxClasses = night ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'bg-emerald-50 text-emerald-600 border border-emerald-200';
    let checkIconColor = 'text-emerald-500';
    let actionBtnClasses = '';
    let actionBtnLabel = '';

    if (plan.id === 'plus') {
      cardBorder = night
        ? 'border-blue-500/80 bg-slate-900 ring-2 ring-blue-500/25 shadow-xl'
        : 'border-blue-500 bg-white ring-2 ring-blue-500/15 shadow-lg';
      badgeClasses = 'bg-blue-600 text-white border border-blue-500 shadow-2xs';
      iconBoxClasses = night
        ? 'bg-blue-500/20 text-blue-400 border border-blue-400/30'
        : 'bg-blue-50 text-blue-600 border border-blue-200';
      checkIconColor = night ? 'text-blue-400' : 'text-blue-600';
    } else if (plan.id === 'pro') {
      cardBorder = night
        ? 'border-amber-500/70 bg-slate-900/95 shadow-xl'
        : 'border-amber-400 bg-white shadow-md';
      badgeClasses = night
        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
        : 'bg-amber-100 text-amber-800 border border-amber-300';
      iconBoxClasses = night
        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
        : 'bg-amber-50 text-amber-600 border border-amber-200';
      checkIconColor = night ? 'text-amber-400' : 'text-amber-600';
    }

    if (isCurrent) {
      actionBtnClasses = night
        ? 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 flex items-center justify-center gap-1.5 cursor-default'
        : 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center justify-center gap-1.5 cursor-default';
      actionBtnLabel = `<i class="fa-solid fa-circle-check"></i><span>Plan Actual Activo</span>`;
    } else if (plan.id === 'plus') {
      actionBtnClasses = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 active:scale-98 text-white shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
      actionBtnLabel = `<i class="fa-solid fa-bolt text-[11px]"></i><span>Elegir Plan Plus</span>`;
    } else if (plan.id === 'pro') {
      actionBtnClasses = 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-98 text-slate-950 shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer';
      actionBtnLabel = `<i class="fa-solid fa-crown text-[11px]"></i><span>Elegir Plan Pro</span>`;
    } else {
      actionBtnClasses = night
        ? 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 transition flex items-center justify-center gap-1.5 cursor-pointer'
        : 'w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition flex items-center justify-center gap-1.5 cursor-pointer';
      actionBtnLabel = `<span>Cambiar a Gratuita</span>`;
    }

    const billingSubtext = plan.id === 'free'
      ? 'Sin tarjeta bancaria ni vencimiento'
      : (activeBillingCycle === 'annual'
        ? `Facturado anualmente ($${annualTotal.toLocaleString('es-MX')} MXN/año • Ahorras 20%)`
        : 'Facturación mensual flexible • Cancela cuando quieras');

    return `
      <div class="relative rounded-2xl border-2 p-5 flex flex-col justify-between transition duration-200 ${cardBorder}" data-plan-card="${plan.id}">
        <div>
          <!-- Fila Superior: Icono + Nombre + Etiqueta -->
          <div class="flex items-start justify-between gap-2 mb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 ${iconBoxClasses}">
                <i class="${plan.icon}"></i>
              </div>
              <div>
                <h4 class="font-extrabold text-base leading-tight ${night ? 'text-slate-100' : 'text-slate-900'}">${plan.name}</h4>
                <span class="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClasses}">
                  ${isCurrent ? 'ACTIVO' : plan.badge}
                </span>
              </div>
            </div>
            ${hasDiscount ? `
              <span class="text-[9.5px] font-black px-2 py-0.5 rounded-md ${
                plan.id === 'pro'
                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
              } flex items-center gap-1 shadow-2xs shrink-0">
                <i class="fa-solid fa-fire text-[9px]"></i> ${plan.discountBadge}
              </span>
            ` : ''}
          </div>

          <!-- Descripción corta -->
          <p class="text-xs leading-relaxed mb-4 ${night ? 'text-slate-300' : 'text-slate-600'}">
            ${plan.tagline}
          </p>

          <!-- Bloque de Precio -->
          <div class="p-3.5 rounded-xl mb-4 border ${night ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200/80'}">
            ${hasDiscount ? `
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-xs font-semibold line-through text-slate-400">
                  $${origPrice.toLocaleString('es-MX')} MXN
                </span>
                <span class="text-[9.5px] font-black px-1.5 py-0.5 rounded-sm bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  Ahorras $${(origPrice - price).toLocaleString('es-MX')}${plan.periodLabel}
                </span>
              </div>
            ` : ''}
            <div class="flex items-baseline gap-1">
              <span class="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                plan.id === 'pro'
                  ? (night ? 'text-amber-400' : 'text-amber-600')
                  : (plan.id === 'plus' ? (night ? 'text-blue-400' : 'text-blue-600') : (night ? 'text-white' : 'text-slate-900'))
              }">
                $${price.toLocaleString('es-MX')}
              </span>
              <span class="text-xs font-bold ${night ? 'text-slate-400' : 'text-slate-500'}">
                ${plan.id === 'free' ? '' : plan.currency} ${plan.periodLabel}
              </span>
            </div>
            ${hasDiscount ? `
              <div class="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-500">
                <i class="fa-solid fa-bolt text-[9px]"></i>
                <span>Precio especial de lanzamiento</span>
              </div>
            ` : ''}
            <p class="text-[10px] mt-1 font-medium ${night ? 'text-slate-400' : 'text-slate-500'}">
              ${billingSubtext}
            </p>
          </div>

          <!-- Lista de Beneficios -->
          <div class="space-y-2 mb-5">
            <span class="block text-[10px] font-bold uppercase tracking-wider ${night ? 'text-slate-400' : 'text-slate-500'}">
              Incluye:
            </span>
            <ul class="space-y-1.5 text-[11.5px] sm:text-xs">
              ${plan.features.map(feat => `
                <li class="flex items-start gap-2 ${night ? 'text-slate-200' : 'text-slate-700'}">
                  <i class="fa-solid fa-check ${checkIconColor} mt-0.5 text-[11px] shrink-0"></i>
                  <span class="leading-snug">${feat}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>

        <!-- Botón de Selección -->
        <div class="pt-3 border-t ${night ? 'border-slate-800' : 'border-slate-100'}">
          <button type="button"
                  ${isCurrent ? 'disabled' : `onclick="selectSubscriptionPlan('${plan.id}')"`}
                  class="${actionBtnClasses}">
            ${actionBtnLabel}
          </button>
        </div>
      </div>
    `;
  }).join('');

  renderSubscriptionComparisonTable(night);
}

export function renderSubscriptionComparisonTable(night = isNightMode()) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('subscription-comparison-container');
  if (!container) return;

  const isAnnual = activeBillingCycle === 'annual';
  const rows = [
    ['Proyectos Activos', '2 proyectos', '15 proyectos', '50 proyectos'],
    ['Conceptos por Proyecto', '100', '1,500', '3,500'],
    ['Usuarios Colaboradores', '3 usuarios (1 a 3)', '10 usuarios', '30 usuarios'],
    ['Generación APU con IA (Motor + Flash)', '10 / mes', '1,500 / mes', '3,500 / mes'],
    ['Precios Web en Vivo (Google Search)', '0 (o API propia)', '70 / mes', '200 / mes'],
    ['Impresión en Todas las Pestañas', 'Con logo y nombre de la App', 'Marca propia / Sin marca de App', 'Marca blanca corporativa'],
    ['Ruta Crítica, Curva S y Financiero', 'Básico', 'Completo', 'Completo'],
    ['Bitácora Legal y Control de Compras', 'Básico', 'Completo', 'Completo'],
    ['Almacenamiento en Nube', '200 MB', '2 GB', '5 GB'],
    ['Catálogos Maestros Importados', '6 MB', '50 MB', '200 MB']
  ];

  const wrapCls = night ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800';
  const thCls = night ? 'bg-slate-800/90 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200';
  const tdBorder = night ? 'border-slate-800' : 'border-slate-200';

  container.innerHTML = `
    <div id="subscription-comparison-table" class="rounded-2xl border overflow-hidden shadow-sm ${wrapCls}">
      <div class="px-4 py-3 border-b ${tdBorder} flex items-center justify-between flex-wrap gap-2">
        <h4 class="font-extrabold text-xs sm:text-sm flex items-center gap-2">
          <i class="fa-solid fa-table-list text-blue-500"></i>
          <span>Cuadro Comparativo de Planes y Cuotas</span>
        </h4>
        <span class="text-[10px] font-semibold ${night ? 'text-slate-400' : 'text-slate-500'}">
          Gratuita (\$0) • Plus (${isAnnual ? '$280' : '$350'}/mes) • Pro (${isAnnual ? '$760' : '$950'}/mes)
        </span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-[11px] sm:text-xs">
          <thead>
            <tr class="border-b ${thCls}">
              <th class="py-2.5 px-3 font-bold">Característica</th>
              <th class="py-2.5 px-3 font-bold text-center">Gratuita (\$0)</th>
              <th class="py-2.5 px-3 font-bold text-center text-blue-500">Plus (${isAnnual ? '$280' : '$350'} / mes)</th>
              <th class="py-2.5 px-3 font-bold text-center text-amber-500">Pro (${isAnnual ? '$760' : '$950'} / mes)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr class="border-b last:border-b-0 ${tdBorder}">
                <td class="py-2 px-3 font-semibold">${r[0]}</td>
                <td class="py-2 px-3 text-center">${r[1]}</td>
                <td class="py-2 px-3 text-center font-medium">${r[2]}</td>
                <td class="py-2 px-3 text-center font-medium">${r[3]}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

export function openSubscriptionModal() {
  if (typeof document === 'undefined') return;
  const sub = getCurrentSubscription();
  activeBillingCycle = sub.billingCycle || 'monthly';

  renderSubscriptionCards();

  const modal = document.getElementById('modal-suscripcion-usuario');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  // Sincronizar en segundo plano con la nube de Supabase por si se actualizó en otra computadora
  try {
    syncSubscriptionFromCloud().then(cloudSub => {
      if (cloudSub) {
        renderSubscriptionCards();
        updateSubscriptionBadgesUI();
        if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
          try { window.refreshProjectsGridUI(); } catch (_) {}
        }
      }
    }).catch(() => {});
  } catch (_) {}
}

export function closeSubscriptionModal() {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById('modal-suscripcion-usuario');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  try {
    updateSubscriptionBadgesUI();
    if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
  } catch (_) {}
}

export function setSubscriptionBillingCycle(cycle) {
  activeBillingCycle = cycle === 'annual' ? 'annual' : 'monthly';
  const current = getCurrentSubscription();
  saveSubscription(current.planId, activeBillingCycle);
  renderSubscriptionCards();
}

export function selectSubscriptionPlan(planId) {
  if (planId === 'free') {
    saveSubscription('free', activeBillingCycle);
    renderSubscriptionCards();
    updateSubscriptionBadgesUI();
    try {
      if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
        window.refreshProjectsGridUI();
      }
    } catch (_) {}
    showToast(`\u{2728} Plan Gratuito activo`);
    return;
  }

  const cycle = activeBillingCycle === 'annual' ? 'annual' : 'monthly';
  const checkoutUrl = STRIPE_PAYMENT_LINKS[planId]?.[cycle];

  if (checkoutUrl) {
    showToast('Redirigiendo a la pasarela de pago segura de Stripe...', 'info');
    setTimeout(() => {
      window.location.href = checkoutUrl;
    }, 350);
    return;
  }

  const plan = getPlanById(planId);
  saveSubscription(plan.id, activeBillingCycle);
  renderSubscriptionCards();
  updateSubscriptionBadgesUI();
  try {
    if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
      window.refreshProjectsGridUI();
    }
  } catch (_) {}
    showToast(`\u{2728} Suscripci\u{00F3}n actualizada al plan ${plan.name}`);
}

// Exponer funciones globales para sincronización unificada entre módulos
if (typeof window !== 'undefined') {
  window.getCurrentSubscription = getCurrentSubscription;
  window.syncSubscriptionFromCloud = syncSubscriptionFromCloud;
  window.updateSubscriptionBadgesUI = updateSubscriptionBadgesUI;
  window.openSubscriptionModal = openSubscriptionModal;
  window.closeSubscriptionModal = closeSubscriptionModal;
}
