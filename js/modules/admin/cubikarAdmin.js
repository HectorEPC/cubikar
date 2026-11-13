// js/modules/admin/cubikarAdmin.js
// Módulo de Administración Maestra de Cubikar
// Control de Administradores, Base de Datos de Usuarios, Métricas SaaS, Consumos de IA y Alertas de Cuota

import {
  getCurrentUser,
  getRegisteredUsersList,
  getProjectsList,
  findRegisteredUserAccount,
  deleteUserAccountAndData,
  getPlanLimits,
  countAccountUsersForOwner,
  resolveWorkspacePlanContext,
  STORAGE_KEY_REGISTERED_USERS
} from '../portal/projectService.js';
import { getSupabaseClient } from '../../core/supabaseClient.js';
import { SUBSCRIPTION_PLANS, openSubscriptionModal } from '../portal/subscriptionModal.js';
import { showToast } from '../../ui/notifications.js';

// Administrador Maestro Oficial
export const MASTER_ADMIN_EMAIL = 'hepc.90@gmail.com';

// Claves de Almacenamiento Local
export const STORAGE_KEY_CO_ADMINS = 'cubikar_co_administrators_v2';
export const STORAGE_KEY_MARKET_RATES = 'cubikar_market_rates_v2';
export const STORAGE_KEY_CONSUMPTION = 'cubikar_user_consumption_v2';
export const STORAGE_KEY_ADMIN_SESSION_MODE = 'cubikar_admin_session_mode';
export const STORAGE_KEY_SERVICE_ROLE_KEY = 'cubikar_supabase_service_role_key';

// Tarifas de Mercado Base (en Pesos Mexicanos - MXN) actualizables
export const DEFAULT_MARKET_RATES = {
  // Fallback ponderado legacy ($0.004 MXN / 1k tokens)
  aiTokenPer1k: 0.004,
  // Tokens de entrada Gemini Flash (~$0.002 MXN / 1k tokens)
  aiInputTokenPer1k: 0.002,
  // Tokens de salida / razonamiento Gemini Flash (~$0.008 MXN / 1k tokens)
  aiOutputTokenPer1k: 0.008,
  // Costo fijo por petición con Google Search Grounding ($0.70 MXN)
  aiSearchGroundingPerReq: 0.70,
  // Comisión pasarela Stripe México (3.6% + $3.00 MXN)
  stripePct: 0.036,
  stripeFixedMxn: 3.00,
  // $0.0005 MXN por cada MB al mes (~$0.50 MXN por GB en Cloud Storage)
  storageMbMonth: 0.0005,
  // $0.002 MXN por cada MB de transferencia y sincronización Realtime (WebSockets)
  bandwidthMb: 0.002,
  // Infraestructura base mensual compartida por cuenta ($1.50 MXN)
  infraBaseAccountMxn: 1.50
};

// =========================================================================
// 1. GESTIÓN DE ROLES ADMINISTRATIVOS (SuperAdmin y Co-Administradores)
// =========================================================================

export function getMarketRates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MARKET_RATES);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_MARKET_RATES, ...parsed };
    }
  } catch (_) {}
  return { ...DEFAULT_MARKET_RATES };
}

export function saveMarketRates(rates) {
  try {
    localStorage.setItem(STORAGE_KEY_MARKET_RATES, JSON.stringify(rates));
    showToast('Tarifas de mercado actualizadas con éxito.', 'success');
  } catch (_) {}
}

export function getCoAdminsList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CO_ADMINS);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (_) {}
  return [];
}

export function saveCoAdminsList(list) {
  try {
    localStorage.setItem(STORAGE_KEY_CO_ADMINS, JSON.stringify(list));
  } catch (_) {}
}

export function getSavedServiceRoleKey() {
  try {
    return localStorage.getItem(STORAGE_KEY_SERVICE_ROLE_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function saveServiceRoleKey(key) {
  try {
    localStorage.setItem(STORAGE_KEY_SERVICE_ROLE_KEY, (key || '').trim());
  } catch (_) {}
}

export function isUserMasterAdmin(email) {
  if (!email) return false;
  return email.toLowerCase().trim() === MASTER_ADMIN_EMAIL.toLowerCase().trim();
}

export function isUserAdmin(email) {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase().trim()) return true;
  const coAdmins = getCoAdminsList();
  return coAdmins.some(a => (a.email || '').toLowerCase().trim() === cleanEmail);
}

export function addCoAdmin(email, name = '') {
  if (!email || !email.trim()) {
    showToast('Ingresa un correo electrónico válido.', 'error');
    return false;
  }
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase().trim()) {
    showToast('Este correo ya es el Administrador Maestro.', 'info');
    return false;
  }
  const list = getCoAdminsList();
  if (list.some(a => (a.email || '').toLowerCase().trim() === cleanEmail)) {
    showToast('Este usuario ya es co-administrador.', 'warning');
    return false;
  }

  const currentUser = getCurrentUser();
  list.push({
    email: cleanEmail,
    name: name.trim() || cleanEmail.split('@')[0],
    role: 'admin',
    canEdit: true,
    canWrite: true,
    canRead: true,
    invitedBy: currentUser?.email || MASTER_ADMIN_EMAIL,
    invitedAt: new Date().toISOString()
  });

  saveCoAdminsList(list);
  showToast(`Administrador "${cleanEmail}" agregado con éxito.`, 'success');
  renderCoAdminsListUI();
  return true;
}

export function removeCoAdmin(email) {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase().trim()) {
    showToast('No puedes eliminar al Administrador Maestro.', 'error');
    return;
  }

  const list = getCoAdminsList().filter(a => (a.email || '').toLowerCase().trim() !== cleanEmail);
  saveCoAdminsList(list);
  showToast(`Acceso de administración revocado a "${cleanEmail}".`, 'info');
  renderCoAdminsListUI();
}

// =========================================================================
// 2. REGISTRO Y SEGUIMIENTO DE CONSUMOS TÉCNICOS (IA, Storage, Bandwidth)
// =========================================================================

export function getCurrentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeConsumptionPayload(rawObj = null) {
  const obj = rawObj && typeof rawObj === 'object' ? rawObj : {};
  const monthly = (obj.monthly && typeof obj.monthly === 'object') ? obj.monthly : {};
  return {
    tokensIA: Number(obj.tokensIA) || 0,
    aiInputTokens: Number(obj.aiInputTokens) || 0,
    aiOutputTokens: Number(obj.aiOutputTokens) || 0,
    aiStandardConcepts: Number(obj.aiStandardConcepts) || 0,
    searchGroundingCalls: Number(obj.searchGroundingCalls) || 0,
    storageMB: Number(obj.storageMB) || 0,
    bandwidthMB: Number(obj.bandwidthMB) || 0,
    monthly,
    lastActivity: obj.lastActivity || null
  };
}

export function getUserConsumptionData(userEmail) {
  if (!userEmail) return normalizeConsumptionPayload(null);
  const cleanEmail = userEmail.toLowerCase().trim();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_CONSUMPTION}_${cleanEmail}`);
    if (raw) return normalizeConsumptionPayload(JSON.parse(raw));
  } catch (_) {}

  // Cuentas nuevas o sin consumos inician en 0 real; la última actividad se hereda de su login/registro
  return normalizeConsumptionPayload({ lastActivity: null });
}

export function getMonthlyAiQuotaUsage(userEmail) {
  const monthKey = getCurrentMonthKey();
  const data = getUserConsumptionData(userEmail);
  const m = data.monthly?.[monthKey] || {};
  return {
    monthKey,
    aiStandardConcepts: Number(m.aiStandardConcepts) || 0,
    searchGroundingCalls: Number(m.searchGroundingCalls) || 0,
    aiInputTokens: Number(m.aiInputTokens) || 0,
    aiOutputTokens: Number(m.aiOutputTokens) || 0,
    tokensIA: Number(m.tokensIA) || 0
  };
}

export function recordAiUsageDetailed(userEmail, usage = {}) {
  const targetEmail = (userEmail || resolveWorkspacePlanContext()?.ownerEmail || getCurrentUser()?.email || '').toLowerCase().trim();
  if (!targetEmail) return null;

  const usedOwnApiKey = Boolean(usage.usedOwnApiKey);
  const inputTokens = Math.max(0, Number(usage.inputTokens) || 0);
  const outputTokens = Math.max(0, Number(usage.outputTokens) || 0);
  const thoughtsTokens = Math.max(0, Number(usage.thoughtsTokens) || 0);
  const totalOut = outputTokens + thoughtsTokens;
  const fallbackTotal = Math.max(0, Number(usage.totalTokens) || (inputTokens + totalOut));
  const standardConcepts = Math.max(0, Number(usage.standardConcepts) || 0);
  const searchGroundingCalls = Math.max(0, Number(usage.searchGroundingCalls) || 0);

  const current = getUserConsumptionData(targetEmail);
  const monthKey = getCurrentMonthKey();
  if (!current.monthly || typeof current.monthly !== 'object') current.monthly = {};
  const m = current.monthly[monthKey] || {
    aiStandardConcepts: 0,
    searchGroundingCalls: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    tokensIA: 0,
    ownKeyTokens: 0
  };

  current.lastActivity = new Date().toISOString();
  if (usedOwnApiKey) {
    // Si el usuario usó su propia API Key, no consume cuota del plan ni costo operativo de Cubikar
    current.ownKeyTokens = (current.ownKeyTokens || 0) + fallbackTotal;
    m.ownKeyTokens = (Number(m.ownKeyTokens) || 0) + fallbackTotal;
  } else {
    current.aiInputTokens = (current.aiInputTokens || 0) + inputTokens;
    current.aiOutputTokens = (current.aiOutputTokens || 0) + totalOut;
    current.tokensIA = (current.tokensIA || 0) + fallbackTotal;
    current.aiStandardConcepts = (current.aiStandardConcepts || 0) + standardConcepts;
    current.searchGroundingCalls = (current.searchGroundingCalls || 0) + searchGroundingCalls;

    m.aiInputTokens = (Number(m.aiInputTokens) || 0) + inputTokens;
    m.aiOutputTokens = (Number(m.aiOutputTokens) || 0) + totalOut;
    m.tokensIA = (Number(m.tokensIA) || 0) + fallbackTotal;
    m.aiStandardConcepts = (Number(m.aiStandardConcepts) || 0) + standardConcepts;
    m.searchGroundingCalls = (Number(m.searchGroundingCalls) || 0) + searchGroundingCalls;
  }
  current.monthly[monthKey] = m;

  try {
    localStorage.setItem(`${STORAGE_KEY_CONSUMPTION}_${targetEmail}`, JSON.stringify(current));
  } catch (_) {}
  return current;
}

export function syncMonthlyAiQuotaFromServer(userEmail, snapshot = null) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const targetEmail = (userEmail || snapshot.ownerEmail || resolveWorkspacePlanContext()?.ownerEmail || getCurrentUser()?.email || '').toLowerCase().trim();
  if (!targetEmail) return null;

  const monthKey = String(snapshot.monthKey || getCurrentMonthKey()).trim() || getCurrentMonthKey();
  const current = getUserConsumptionData(targetEmail);
  if (!current.monthly || typeof current.monthly !== 'object') current.monthly = {};

  const prev = current.monthly[monthKey] || {
    aiStandardConcepts: 0,
    searchGroundingCalls: 0,
    aiInputTokens: 0,
    aiOutputTokens: 0,
    tokensIA: 0,
    ownKeyTokens: 0
  };

  const serverStd = Math.max(0, Number(snapshot.standardUsed ?? snapshot.standard_calls) || 0);
  const serverSearch = Math.max(0, Number(snapshot.searchUsed ?? snapshot.search_grounding_calls) || 0);

  current.monthly[monthKey] = {
    ...prev,
    aiStandardConcepts: Math.max(Number(prev.aiStandardConcepts) || 0, serverStd),
    searchGroundingCalls: Math.max(Number(prev.searchGroundingCalls) || 0, serverSearch)
  };
  current.aiStandardConcepts = Math.max(Number(current.aiStandardConcepts) || 0, serverStd);
  current.searchGroundingCalls = Math.max(Number(current.searchGroundingCalls) || 0, serverSearch);

  try {
    localStorage.setItem(`${STORAGE_KEY_CONSUMPTION}_${targetEmail}`, JSON.stringify(current));
  } catch (_) {}
  return current;
}

export function recordAiTokenUsage(userEmail, tokensCount) {
  if (!userEmail || !tokensCount) return;
  const total = Math.max(0, Number(tokensCount) || 0);
  const approxIn = Math.round(total * 0.35);
  const approxOut = Math.max(0, total - approxIn);
  return recordAiUsageDetailed(userEmail, {
    inputTokens: approxIn,
    outputTokens: approxOut,
    totalTokens: total
  });
}

export function recordBandwidthUsage(userEmail, megabytes) {
  if (!userEmail || !megabytes) return;
  const cleanEmail = userEmail.toLowerCase().trim();
  const current = getUserConsumptionData(cleanEmail);
  current.bandwidthMB = Number(((current.bandwidthMB || 0) + Number(megabytes)).toFixed(2));
  current.lastActivity = new Date().toISOString();
  try {
    localStorage.setItem(`${STORAGE_KEY_CONSUMPTION}_${cleanEmail}`, JSON.stringify(current));
  } catch (_) {}
}

export function recordStorageUsage(userEmail, megabytes) {
  if (!userEmail) return;
  const cleanEmail = userEmail.toLowerCase().trim();
  const current = getUserConsumptionData(cleanEmail);
  current.storageMB = Number(Math.max(0, Number(megabytes) || 0).toFixed(2));
  current.lastActivity = new Date().toISOString();
  try {
    localStorage.setItem(`${STORAGE_KEY_CONSUMPTION}_${cleanEmail}`, JSON.stringify(current));
  } catch (_) {}
}

// =========================================================================
// 3. EVALUACIÓN DE ACTIVIDAD (SEMÁFORO 15 DÍAS) Y ALERTA DE CONSUMO (85%+)
// =========================================================================

export function evaluateUserActivity(user, consumption) {
  // Criterio de días de inactividad
  const now = new Date();
  const lastDateStr = consumption?.lastActivity || user?.lastLogin || user?.createdAt || null;
  if (!lastDateStr) return 'activo';

  const lastDate = new Date(lastDateStr);
  const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

  if (diffDays <= 15) {
    return 'activo'; // 🟢 Menor o igual a 15 días
  } else if (diffDays <= 90) {
    return 'reposo'; // 🟡 Más de 15 días sin interacción
  } else {
    return 'inactivo'; // 🔴 Más de 90 días o cuenta congelada
  }
}

export function calculateUserMetrics(user) {
  const cleanEmail = (user.email || '').toLowerCase().trim();
  const rates = getMarketRates();
  const consumption = getUserConsumptionData(cleanEmail);
  const monthKey = getCurrentMonthKey();
  const monthConsumption = consumption.monthly?.[monthKey] || null;

  // 1. Obtener plan de suscripción y límites reales del plan
  let planId = user?.subscription?.planId || 'free';
  let billingCycle = user?.subscription?.billingCycle || 'monthly';
  let subPlan = SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];
  let planLimits = getPlanLimits(planId);

  let cuotaMensual = billingCycle === 'annual' ? (subPlan.annualPrice || subPlan.monthlyPrice) : subPlan.monthlyPrice;
  let baseComparativa = cuotaMensual > 0 ? cuotaMensual : 15.0;

  // 2. Desglose real de costos: Stripe + IA (Input vs Output/Razonamiento) + Search Grounding + Storage + Infraestructura
  const activeInTokens = monthConsumption ? (Number(monthConsumption.aiInputTokens) || 0) : (consumption.aiInputTokens || 0);
  const activeOutTokens = monthConsumption ? (Number(monthConsumption.aiOutputTokens) || 0) : (consumption.aiOutputTokens || 0);
  const activeLegacyTokens = monthConsumption ? (Number(monthConsumption.tokensIA) || 0) : (consumption.tokensIA || 0);

  let costoIA = 0;
  if (activeInTokens > 0 || activeOutTokens > 0) {
    costoIA = ((activeInTokens / 1000) * (rates.aiInputTokenPer1k ?? DEFAULT_MARKET_RATES.aiInputTokenPer1k)) +
              ((activeOutTokens / 1000) * (rates.aiOutputTokenPer1k ?? DEFAULT_MARKET_RATES.aiOutputTokenPer1k));
  } else {
    costoIA = (activeLegacyTokens / 1000) * (rates.aiTokenPer1k ?? DEFAULT_MARKET_RATES.aiTokenPer1k);
  }

  const monthSearchCalls = monthConsumption ? (Number(monthConsumption.searchGroundingCalls) || 0) : (consumption.searchGroundingCalls || 0);
  const monthAiStdConcepts = monthConsumption ? (Number(monthConsumption.aiStandardConcepts) || 0) : (consumption.aiStandardConcepts || 0);
  const costoGrounding = monthSearchCalls * (rates.aiSearchGroundingPerReq ?? DEFAULT_MARKET_RATES.aiSearchGroundingPerReq);

  const storageMB = Number(consumption.storageMB) || 0;
  const bandwidthMB = Number(consumption.bandwidthMB) || 0;
  const costoStorage = storageMB * (rates.storageMbMonth ?? DEFAULT_MARKET_RATES.storageMbMonth);
  const costoBandwidth = bandwidthMB * (rates.bandwidthMb ?? DEFAULT_MARKET_RATES.bandwidthMb);
  const costoInfraBase = Number(rates.infraBaseAccountMxn ?? DEFAULT_MARKET_RATES.infraBaseAccountMxn) || 0;
  const costoInfraestructura = costoBandwidth + costoInfraBase;

  // Comisión Stripe real (3.6% + $3.00 MXN por cobro; prorrateo mensual del fijo si ciclo es anual; $0 en plan gratuito)
  let costoStripe = 0;
  if (cuotaMensual > 0) {
    const pctFee = cuotaMensual * (rates.stripePct ?? DEFAULT_MARKET_RATES.stripePct);
    const fixedFee = (billingCycle === 'annual' ? ((rates.stripeFixedMxn ?? 3.00) / 12) : (rates.stripeFixedMxn ?? 3.00));
    costoStripe = pctFee + fixedFee;
  }

  const totalCostoTecnico = Number((costoIA + costoGrounding + costoStorage + costoInfraestructura).toFixed(2));
  const totalCostoRecursos = Number((costoStripe + totalCostoTecnico).toFixed(2));
  const margenNetoRealMxn = Number((cuotaMensual - totalCostoRecursos).toFixed(2));
  const margenNetoRealPct = cuotaMensual > 0
    ? Number(((margenNetoRealMxn / cuotaMensual) * 100).toFixed(1))
    : (totalCostoRecursos > 0 ? -100 : 0);

  // 3. Porcentaje de consumo operativo comparado con su plan
  let pctConsumo = Number(((totalCostoRecursos / baseComparativa) * 100).toFixed(1));
  if (pctConsumo > 100) pctConsumo = 100;

  // 4. Conteo real de usuarios colaborativos de la cuenta (1 titular + colaboradores únicos <= 3 / 10 / 30)
  const accountUsersStats = countAccountUsersForOwner(cleanEmail);
  const maxCollaborators = planLimits?.maxMembers || subPlan?.maxMembers || (planId === 'pro' ? 30 : (planId === 'plus' ? 10 : 3));
  const totalAccountUsers = accountUsersStats?.totalUsers || 1;
  const collaborativeCount = `${totalAccountUsers} / ${maxCollaborators}`;

  // Cuotas de Storage, IA Estándar y Google Search Grounding
  const storageLimitMb = planLimits?.storageMb || subPlan?.storageMb || (planId === 'pro' ? 5120 : (planId === 'plus' ? 2048 : 200));
  const aiStdQuota = planLimits?.aiMonthlyConcepts ?? subPlan?.aiMonthlyConcepts ?? (planId === 'pro' ? 3500 : (planId === 'plus' ? 1500 : 10));
  const searchGroundingQuota = planLimits?.maxSearchQueries ?? subPlan?.maxSearchQueries ?? (planId === 'pro' ? 200 : (planId === 'plus' ? 70 : 0));

  // 5. Estado de actividad
  const actividad = evaluateUserActivity(user, consumption);

  // 6. Alerta del 85% (por costo operativo o cuota mensual de IA / Grounding / Storage)
  const pctStorageQuota = storageLimitMb > 0 ? (storageMB / storageLimitMb) * 100 : 0;
  const pctAiStdQuota = aiStdQuota > 0 ? (monthAiStdConcepts / aiStdQuota) * 100 : 0;
  const pctGroundingQuota = searchGroundingQuota > 0 ? (monthSearchCalls / searchGroundingQuota) * 100 : 0;
  const maxQuotaPct = Math.max(pctConsumo, pctStorageQuota, pctAiStdQuota, pctGroundingQuota);
  const isHighConsumption = maxQuotaPct >= 85;

  return {
    user,
    cleanEmail,
    planId,
    planName: subPlan.name,
    billingCycle,
    actividad,
    totalAccountUsers,
    maxCollaborators,
    collaborativeCount,
    tokensIA: consumption.tokensIA || 0,
    aiInputTokens: consumption.aiInputTokens || 0,
    aiOutputTokens: consumption.aiOutputTokens || 0,
    aiStandardConcepts: monthAiStdConcepts,
    aiStdQuota,
    searchGroundingCalls: monthSearchCalls,
    totalSearchGroundingCalls: consumption.searchGroundingCalls || 0,
    searchGroundingQuota,
    storageMB,
    storageLimitMb,
    bandwidthMB,
    gastoSuscripcion: cuotaMensual,
    costoStripe: Number(costoStripe.toFixed(2)),
    costoIA: Number(costoIA.toFixed(2)),
    costoGrounding: Number(costoGrounding.toFixed(2)),
    costoStorage: Number(costoStorage.toFixed(2)),
    costoInfraestructura: Number(costoInfraestructura.toFixed(2)),
    totalCostoTecnico,
    totalCostoRecursos,
    margenNetoRealMxn,
    margenNetoRealPct,
    pctConsumo,
    isHighConsumption
  };
}

// Alerta preventiva que aparecerá en la campana de notificaciones del usuario
export function getActiveUserConsumptionAlert(userEmail) {
  if (!userEmail) return null;
  const cleanEmail = userEmail.toLowerCase().trim();
  let user = findRegisteredUserAccount(cleanEmail);
  if (!user) {
    const current = getCurrentUser();
    if (current && (current.email || '').toLowerCase().trim() === cleanEmail) {
      user = current;
    }
  }
  if (!user) {
    user = { email: cleanEmail, name: cleanEmail.split('@')[0] };
  }

  const metrics = calculateUserMetrics(user);
  if (metrics.pctConsumo >= 85) {
    return {
      type: 'high_consumption',
      pct: metrics.pctConsumo,
      planName: metrics.planName,
      message: `Has utilizado el ${metrics.pctConsumo}% de los recursos y generación con IA incluidos en tu suscripción de este mes.`,
      actionLabel: 'Mejorar mi Plan / Ver Opciones'
    };
  }
  return null;
}

// =========================================================================
// 4. MODAL SELECTOR DE INICIO (DOBLE OPCIÓN PARA EL ADMINISTRADOR)
// =========================================================================

export function showAdminDualLoginModal(user, onChooseCommonUser, onChooseAdmin) {
  const modal = document.getElementById('modal-admin-dual-login');
  if (!modal) return;

  const adminName = user?.name || 'Administrador';
  const nameEl = document.getElementById('admin-dual-login-username');
  if (nameEl) nameEl.textContent = adminName;

  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  window._adminChoiceCommon = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    sessionStorage.setItem(STORAGE_KEY_ADMIN_SESSION_MODE, 'user');
    if (typeof onChooseCommonUser === 'function') onChooseCommonUser();
  };

  window._adminChoiceAdmin = () => {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    sessionStorage.setItem(STORAGE_KEY_ADMIN_SESSION_MODE, 'admin');
    if (typeof onChooseAdmin === 'function') onChooseAdmin();
    openCubikarAdminModal();
  };
}

// =========================================================================
// 5. INTERFAZ Y RENDERIZADO DEL PANEL MAESTRO "BASES DE DATOS CUBIKAR"
// =========================================================================

let adminTableFilterText = '';
let adminFilterActivity = 'all';
let adminFilterPlan = 'all';
let adminFilterCycle = 'all';


// =========================================================================
// SELECCIÃ“N Y ELIMINACIÃ“N DE USUARIOS
// =========================================================================

export let selectedAdminUserEmails = new Set();

export function onAdminUserCheckboxChange(checkbox) {
  if (!checkbox) return;
  const val = checkbox.value;
  if (checkbox.checked) {
    selectedAdminUserEmails.add(val);
  } else {
    selectedAdminUserEmails.delete(val);
  }
  updateAdminDeleteButtonUI();
  updateSelectAllCheckboxState();
}

export function toggleSelectAllAdminUsers(checked) {
  const checkboxes = document.querySelectorAll('.admin-user-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    if (checked) {
      selectedAdminUserEmails.add(cb.value);
    } else {
      selectedAdminUserEmails.delete(cb.value);
    }
  });
  updateAdminDeleteButtonUI();
}

export function updateSelectAllCheckboxState() {
  const selectAll = document.getElementById('admin-select-all-checkbox');
  const checkboxes = document.querySelectorAll('.admin-user-checkbox');
  if (selectAll && checkboxes.length > 0) {
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    selectAll.checked = allChecked;
  }
}

export function updateAdminDeleteButtonUI() {
  const btn = document.getElementById('btn-admin-delete-selected');
  const txt = document.getElementById('btn-admin-delete-text');
  const count = selectedAdminUserEmails.size;

  if (!btn) return;

  if (count > 0) {
    btn.disabled = false;
    btn.classList.remove('cursor-not-allowed', 'opacity-60', 'bg-slate-800', 'text-slate-400');
    btn.classList.add('cursor-pointer', 'opacity-100', 'bg-rose-600', 'text-white', 'hover:bg-rose-500');
    if (txt) txt.textContent = `Eliminar (${count})`;
  } else {
    btn.disabled = true;
    btn.classList.remove('cursor-pointer', 'opacity-100', 'bg-rose-600', 'text-white', 'hover:bg-rose-500');
    btn.classList.add('cursor-not-allowed', 'opacity-60', 'bg-slate-800', 'text-slate-400');
    if (txt) txt.textContent = 'Eliminar';
  }
}

export function deleteSelectedAdminUsers() {
  const targets = Array.from(selectedAdminUserEmails).filter(e => !isUserMasterAdmin(e));
  if (targets.length === 0) {
    showToast('Selecciona al menos un usuario para eliminar (el Administrador Maestro estÃ¡ protegido).', 'warning');
    return;
  }

  const msg = targets.length === 1
    ? `Â¿EstÃ¡s seguro de que deseas eliminar permanentemente al usuario "${targets[0]}"?\n\nEsta acciÃ³n eliminarÃ¡ su cuenta, proyectos y datos asociados.`
    : `Â¿EstÃ¡s seguro de que deseas eliminar permanentemente a los ${targets.length} usuarios seleccionados?\n\nEsta acciÃ³n eliminarÃ¡ sus cuentas, proyectos y datos asociados.`;

  if (!confirm(msg)) {
    return;
  }

  let deletedCount = 0;
  targets.forEach(email => {
    try {
      deleteUserAccountAndData(email);
      removeCoAdmin(email);
      localStorage.removeItem(`${STORAGE_KEY_CONSUMPTION}_${email.toLowerCase().trim()}`);
      deletedCount++;
    } catch (e) {
      console.warn('[Admin Delete Error]:', e);
    }
  });

  // Notificar a la nube / Supabase para eliminar registros remotos
  try {
    const serviceKey = getSavedServiceRoleKey();
    fetch('/api/admin-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-supabase-service-key': serviceKey,
        'x-admin-email': MASTER_ADMIN_EMAIL
      },
      body: JSON.stringify({ action: 'delete', emails: targets })
    }).catch(err => console.warn('[Cloud Delete Sync Error]:', err));
  } catch (_) {}

  selectedAdminUserEmails.clear();
  const selectAll = document.getElementById('admin-select-all-checkbox');
  if (selectAll) selectAll.checked = false;

  showToast(`Â¡${deletedCount} usuario(s) eliminado(s) correctamente!`, 'success');
  renderCubikarAdminTable();
}

export function openCubikarAdminModal() {
  const modal = document.getElementById('modal-admin-cubikar');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  renderCubikarAdminTable();
  // Sincronizar en segundo plano con la nube para traer registros de otros dispositivos
  syncAdminUsersFromCloud(false);
  return;
}


export function closeCubikarAdminModal() {
  const modal = document.getElementById('modal-admin-cubikar');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

let isSyncingCloudUsers = false;

export async function syncAdminUsersFromCloud(isUserTriggered = false) {
  if (isSyncingCloudUsers) return;
  isSyncingCloudUsers = true;

  const syncBtn = document.getElementById('btn-admin-sync-cloud');
  const syncStatusText = document.getElementById('admin-cloud-status-text');
  if (syncBtn) {
    syncBtn.innerHTML = '<i class="fa-solid fa-rotate fa-spin text-sky-300"></i>';
    syncBtn.disabled = true;
  }
  if (syncStatusText) {
    syncStatusText.textContent = 'Sincronizando...';
  }

  try {
    const serviceKey = getSavedServiceRoleKey();
    const headers = {
      'Content-Type': 'application/json',
      'x-admin-email': MASTER_ADMIN_EMAIL
    };
    if (serviceKey) {
      headers['x-supabase-service-key'] = serviceKey;
    }

    // Si hay token de usuario en Supabase, adjuntarlo
    try {
      const sb = getSupabaseClient();
      if (sb && typeof sb.auth?.getSession === 'function') {
        const { data } = await sb.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      }
    } catch (_) {}

    const res = await fetch('/api/admin-users', {
      method: 'GET',
      headers
    });

    if (res.ok) {
      const data = await res.json();
      const cloudUsers = Array.isArray(data.users) ? data.users : [];

      if (cloudUsers.length > 0) {
        // Mergear usuarios remotos en el listado registrado local
        const localList = getRegisteredUsersList();
        const map = new Map();

        // Cargar los locales primero
        localList.forEach(u => {
          if (u && u.email) map.set(u.email.toLowerCase().trim(), u);
        });

        // Mergear los de la nube
        cloudUsers.forEach(cu => {
          if (!cu || !cu.email) return;
          const cleanEmail = cu.email.toLowerCase().trim();
          const existing = map.get(cleanEmail) || {};

          map.set(cleanEmail, {
            id: cu.id || existing.id,
            name: cu.name || existing.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            sexo: cu.sexo || existing.sexo || 'Masculino',
            dob: cu.dob || existing.dob || '',
            avatar: cu.avatar || existing.avatar || '',
            createdAt: cu.createdAt || existing.createdAt || new Date().toISOString(),
            lastLogin: cu.lastLogin || existing.lastLogin || new Date().toISOString(),
            subscription: cu.subscription || existing.subscription || { planId: 'free', billingCycle: 'monthly' }
          });
        });

        const merged = Array.from(map.values());
        try {
          localStorage.setItem(STORAGE_KEY_REGISTERED_USERS, JSON.stringify(merged));
        } catch (_) {}

        renderCubikarAdminTable();

        if (syncStatusText) {
          syncStatusText.textContent = `Nube: ${merged.length} usuarios`;
        }

        if (isUserTriggered) {
          const detail = data.pulledFromAuth > 0 ? ` (${data.pulledFromAuth} en Supabase Auth)` : '';
          showToast(`¡Sincronización completada! ${merged.length} usuario(s) disponibles en la base de datos${detail}.`, 'success');
        }
      } else {
        if (isUserTriggered) {
          showToast('Sincronización completada. No se encontraron usuarios adicionales.', 'info');
        }
      }
    } else {
      if (isUserTriggered) {
        showToast('No se pudo sincronizar con la API en la nube.', 'warning');
      }
    }
  } catch (err) {
    console.warn('[Cloud Sync Error]:', err);
    if (isUserTriggered) {
      showToast('Error de conexión al sincronizar con la nube.', 'error');
    }
  } finally {
    isSyncingCloudUsers = false;
    if (syncBtn) {
      syncBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i>';
      syncBtn.disabled = false;
    }
  }
}

export function openCloudConfigModal() {
  const modal = document.getElementById('modal-admin-cloud-config');
  if (!modal) return;

  const keyInput = document.getElementById('admin-cloud-service-key-input');
  if (keyInput) {
    keyInput.value = getSavedServiceRoleKey();
  }

  const badgeService = document.getElementById('admin-cloud-service-key-status');
  if (badgeService) {
    const hasKey = Boolean(getSavedServiceRoleKey());
    badgeService.textContent = hasKey ? 'Configurada' : 'No configurada';
    badgeService.className = hasKey
      ? 'text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold'
      : 'text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold';
  }

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

export function closeCloudConfigModal() {
  const modal = document.getElementById('modal-admin-cloud-config');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

export function saveCloudConfigFromModal() {
  const keyInput = document.getElementById('admin-cloud-service-key-input');
  const val = (keyInput?.value || '').trim();
  saveServiceRoleKey(val);
  showToast('Clave de servicio Supabase guardada. Sincronizando usuarios...', 'success');
  closeCloudConfigModal();
  syncAdminUsersFromCloud(true);
}

export function copySupabaseSqlScript() {
  const sql = `-- SCRIPT DE ACTIVACIÓN RLS Y TABLAS PARA CUBIKAR EN SUPABASE
-- Pega este código en el SQL Editor de tu proyecto Supabase y haz clic en RUN:

CREATE TABLE IF NOT EXISTS public.cubikar_registros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    sexo VARCHAR(20) DEFAULT 'Masculino',
    dob VARCHAR(30) DEFAULT '',
    avatar TEXT DEFAULT '',
    plan VARCHAR(50) DEFAULT 'free',
    billing_cycle VARCHAR(50) DEFAULT 'monthly',
    registered_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_activity TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.cubikar_registros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir insercion publica de registros" ON public.cubikar_registros;
CREATE POLICY "Permitir insercion publica de registros" ON public.cubikar_registros FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Permitir actualizacion publica de registros" ON public.cubikar_registros;
CREATE POLICY "Permitir actualizacion publica de registros" ON public.cubikar_registros FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Permitir lectura de registros" ON public.cubikar_registros;
CREATE POLICY "Permitir lectura de registros" ON public.cubikar_registros FOR SELECT USING (true);

-- Permisos SuperAdmin para hepc.90@gmail.com
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'perfiles') THEN
        DROP POLICY IF EXISTS "SuperAdmin ve todos los perfiles" ON public.perfiles;
        CREATE POLICY "SuperAdmin ve todos los perfiles" ON public.perfiles FOR SELECT 
        USING (LOWER(COALESCE(auth.jwt()->>'email', '')) = 'hepc.90@gmail.com' OR empresa_id = public.obtener_mi_empresa_id());
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'empresas') THEN
        DROP POLICY IF EXISTS "SuperAdmin ve todas las empresas" ON public.empresas;
        CREATE POLICY "SuperAdmin ve todas las empresas" ON public.empresas FOR SELECT 
        USING (LOWER(COALESCE(auth.jwt()->>'email', '')) = 'hepc.90@gmail.com' OR id = public.obtener_mi_empresa_id());
    END IF;
END $$;
`;

  navigator.clipboard.writeText(sql).then(() => {
    showToast('¡Script SQL copiado al portapapeles! Pégalo en el SQL Editor de Supabase.', 'success');
  }).catch(() => {
    showToast('No se pudo copiar automáticamente. Puedes copiarlo desde supabase/schema.sql.', 'warning');
  });
}

export function getFullAdminUsersDataset() {
  const registered = getRegisteredUsersList();
  const current = getCurrentUser();

  // Asegurar que hepc.90@gmail.com esté siempre presente como Administrador Maestro
  let allUsers = [...registered];
  const hasMaster = allUsers.some(u => (u.email || '').toLowerCase().trim() === MASTER_ADMIN_EMAIL.toLowerCase().trim());
  if (!hasMaster) {
    allUsers.unshift({
      name: 'Hepc Administrador',
      email: MASTER_ADMIN_EMAIL,
      createdAt: '2026-01-15T00:00:00.000Z',
      lastLogin: new Date().toISOString(),
      subscription: { planId: 'pro', billingCycle: 'annual' }
    });
  }

  // Si hay usuario en sesión y no está en la lista, incluirlo
  if (current && !allUsers.some(u => (u.email || '').toLowerCase().trim() === (current.email || '').toLowerCase().trim())) {
    allUsers.push(current);
  }

  // Mapear métricas para cada usuario
  return allUsers.map((u, idx) => {
    const metrics = calculateUserMetrics(u);
    const regDate = u.createdAt ? new Date(u.createdAt) : new Date('2026-02-01');
    const inicioSub = u.subscription?.updatedAt ? new Date(u.subscription.updatedAt) : regDate;
    const finSub = new Date(inicioSub.getTime() + (metrics.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000);

    const pad = (n) => String(n).padStart(2, '0');
    const formatDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

    return {
      no: (idx + 1).toFixed(2),
      nombre: u.name || u.email.split('@')[0],
      correo: u.email,
      fechaRegistro: formatDate(regDate),
      actividad: metrics.actividad,
      membresia: metrics.planId,
      tipoMembresia: metrics.billingCycle,
      inicioMembresia: formatDate(inicioSub),
      finMembresia: formatDate(finSub),
      usuariosColaborativos: metrics.collaborativeCount,
      tokensIA: metrics.tokensIA.toLocaleString('es-MX'),
      aiInputTokens: metrics.aiInputTokens,
      aiOutputTokens: metrics.aiOutputTokens,
      aiStandardConcepts: metrics.aiStandardConcepts,
      aiStdQuota: metrics.aiStdQuota,
      searchGroundingCalls: metrics.searchGroundingCalls,
      searchGroundingQuota: metrics.searchGroundingQuota,
      storageMB: `${metrics.storageMB} / ${metrics.storageLimitMb >= 2048 ? (metrics.storageLimitMb / 1024) + ' GB' : metrics.storageLimitMb + ' MB'}`,
      storageMBRaw: metrics.storageMB,
      storageLimitMb: metrics.storageLimitMb,
      bandwidthMB: `${metrics.bandwidthMB} MB`,
      costoStripe: metrics.costoStripe,
      costoIA: metrics.costoIA,
      costoGrounding: metrics.costoGrounding,
      costoStorage: metrics.costoStorage,
      costoInfraestructura: metrics.costoInfraestructura,
      gastoSuscripcion: metrics.gastoSuscripcion,
      costoRecursos: metrics.totalCostoRecursos,
      margenNetoRealMxn: metrics.margenNetoRealMxn,
      margenNetoRealPct: metrics.margenNetoRealPct,
      pctConsumo: metrics.pctConsumo,
      isHighConsumption: metrics.isHighConsumption,
      rawUser: u
    };
  });
}

export function renderCubikarAdminTable() {
  const tbody = document.getElementById('admin-cubikar-table-body');
  if (!tbody) return;

  let dataset = getFullAdminUsersDataset();

  // Filtros interactivos
  if (adminTableFilterText) {
    const q = adminTableFilterText.toLowerCase();
    dataset = dataset.filter(d => d.nombre.toLowerCase().includes(q) || d.correo.toLowerCase().includes(q));
  }
  if (adminFilterActivity !== 'all') {
    dataset = dataset.filter(d => d.actividad === adminFilterActivity);
  }
  if (adminFilterPlan !== 'all') {
    dataset = dataset.filter(d => d.membresia === adminFilterPlan);
  }
  if (adminFilterCycle !== 'all') {
    dataset = dataset.filter(d => d.tipoMembresia === adminFilterCycle);
  }

  // KPIs Superiores
  updateAdminKpisUI(dataset);

  if (dataset.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="18" class="text-center py-12 text-slate-400 font-medium bg-slate-900/40">
          <i class="fa-solid fa-filter-circle-xmark text-3xl mb-2 text-slate-500 block"></i>
          No se encontraron registros con los filtros seleccionados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = dataset.map(row => {
    // Semáforo de Actividad idéntico a la hoja del usuario
    let badgeActividad = '';
    if (row.actividad === 'activo') {
      badgeActividad = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#22c55e] text-slate-950 uppercase tracking-wider shadow-sm"><i class="fa-solid fa-circle text-[7px]"></i> Activo</span>`;
    } else if (row.actividad === 'reposo') {
      badgeActividad = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#f59e0b] text-slate-950 uppercase tracking-wider shadow-sm"><i class="fa-solid fa-moon text-[8px]"></i> Reposo</span>`;
    } else {
      badgeActividad = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-[#ef4444] text-white uppercase tracking-wider shadow-sm"><i class="fa-solid fa-ban text-[8px]"></i> Inactivo</span>`;
    }

    // Badge de Membresía
    const badgePlanClass = row.membresia === 'pro'
      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
      : (row.membresia === 'plus' ? 'bg-blue-500/20 text-blue-300 border-blue-400/40' : 'bg-slate-700 text-slate-300 border-slate-600');

    // Resaltado de celda y barra de consumo al 85%+
    let barColor = 'bg-blue-500';
    let pctTextColor = 'text-slate-300';
    let rowHighlightClass = 'hover:bg-slate-800/60';

    if (row.pctConsumo >= 95) {
      barColor = 'bg-rose-500';
      pctTextColor = 'text-rose-400 font-extrabold';
      rowHighlightClass = 'bg-rose-950/20 hover:bg-rose-950/40 border-l-4 border-l-rose-500';
    } else if (row.pctConsumo >= 85) {
      barColor = 'bg-amber-500';
      pctTextColor = 'text-amber-400 font-bold';
      rowHighlightClass = 'bg-amber-950/20 hover:bg-amber-950/40 border-l-4 border-l-amber-500';
    }

    return `
      <tr class="transition-colors border-b border-slate-800 text-xs text-slate-200 select-text ${rowHighlightClass}">
        <!-- 0. Casilla de SelecciÃ³n -->
        <td class="px-2.5 py-2.5 text-center border-r border-slate-800/80">
          ${isUserMasterAdmin(row.correo) ? `
            <span class="text-amber-400/50 text-xs" title="Administrador Maestro protegido (No eliminable)"><i class="fa-solid fa-lock"></i></span>
          ` : `
            <input type="checkbox" value="${row.correo}" ${selectedAdminUserEmails.has(row.correo) ? 'checked' : ''} onchange="onAdminUserCheckboxChange(this)"
                   class="admin-user-checkbox rounded border-slate-700 text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4">
          `}
        </td>

        <!-- 1. No -->
        <td class="px-3 py-2.5 text-center font-mono text-slate-400 font-bold">${row.no}</td>
        
        <!-- 2. Nombre de Usuario -->
        <td class="px-3.5 py-2.5 font-semibold text-white whitespace-nowrap">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-full bg-slate-800 text-amber-400 border border-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0">
              ${row.nombre.charAt(0).toUpperCase()}
            </div>
            <span class="truncate max-w-[150px]" title="${row.nombre}">${row.nombre}</span>
          </div>
        </td>

        <!-- 3. Correo -->
        <td class="px-3.5 py-2.5 font-mono text-slate-300 whitespace-nowrap">
          <span class="truncate max-w-[170px] block" title="${row.correo}">${row.correo}</span>
        </td>

        <!-- 4. Fecha de Registro -->
        <td class="px-3 py-2.5 text-center font-mono text-slate-400 whitespace-nowrap">${row.fechaRegistro}</td>

        <!-- 5. Actividad (Semáforo) -->
        <td class="px-3 py-2.5 text-center whitespace-nowrap">${badgeActividad}</td>

        <!-- 6. Membresía Activa -->
        <td class="px-3 py-2.5 text-center whitespace-nowrap">
          <span class="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border uppercase ${badgePlanClass}">
            ${row.membresia}
          </span>
        </td>

        <!-- 7. Tipo de Membresía -->
        <td class="px-3 py-2.5 text-center capitalize text-slate-300 whitespace-nowrap">${row.tipoMembresia}</td>

        <!-- 8. Inicio de Membresía -->
        <td class="px-3 py-2.5 text-center font-mono text-slate-400 whitespace-nowrap">${row.inicioMembresia}</td>

        <!-- 9. Fin de Membresía -->
        <td class="px-3 py-2.5 text-center font-mono text-slate-400 whitespace-nowrap">${row.finMembresia}</td>

        <!-- 10. Cantidad de Usuarios Colaborativos -->
        <td class="px-3 py-2.5 text-center font-mono font-semibold text-slate-300 whitespace-nowrap">${row.usuariosColaborativos}</td>

        <!-- 11. Llamadas a la IA Estándar (Input / Output + Cuota Mes) -->
        <td class="px-3 py-2.5 text-right font-mono text-sky-400 whitespace-nowrap" title="Input: ${row.aiInputTokens.toLocaleString('es-MX')} tok | Output/Raz.: ${row.aiOutputTokens.toLocaleString('es-MX')} tok ($${row.costoIA.toFixed(2)})">
          <div class="font-bold"><i class="fa-solid fa-brain text-[10px] text-sky-500 mr-1"></i>${row.tokensIA}</div>
          <div class="text-[10px] text-slate-400">${row.aiStandardConcepts}/${row.aiStdQuota} std • $${row.costoIA.toFixed(2)}</div>
        </td>

        <!-- 12. Consultas Web Search Grounding (Cuota 0/70/200) -->
        <td class="px-3 py-2.5 text-right font-mono text-amber-300 whitespace-nowrap" title="Google Search Grounding ($0.70 MXN/req)">
          <div class="font-bold"><i class="fa-brands fa-google text-[10px] text-amber-400 mr-1"></i>${row.searchGroundingCalls} / ${row.searchGroundingQuota}</div>
          <div class="text-[10px] text-slate-400">$${row.costoGrounding.toFixed(2)} MXN</div>
        </td>

        <!-- 13. Almacenamiento (MB / Cuota 200MB / 2GB / 5GB) -->
        <td class="px-3 py-2.5 text-right font-mono text-indigo-300 whitespace-nowrap" title="Storage en nube ($${row.costoStorage.toFixed(2)})">
          <i class="fa-solid fa-database text-[10px] text-indigo-400 mr-1"></i>${row.storageMB}
        </td>

        <!-- 14. Stripe + Infraestructura + Realtime -->
        <td class="px-3 py-2.5 text-right font-mono text-teal-300 whitespace-nowrap" title="Stripe: $${row.costoStripe.toFixed(2)} | Infra+Sync (${row.bandwidthMB}): $${row.costoInfraestructura.toFixed(2)}">
          <div class="font-bold">$${(row.costoStripe + row.costoInfraestructura).toFixed(2)}</div>
          <div class="text-[10px] text-slate-400">Stripe $${row.costoStripe.toFixed(2)} • ${row.bandwidthMB}</div>
        </td>

        <!-- 15. Total Ingresos Suscripción -->
        <td class="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
          $ ${row.gastoSuscripcion.toFixed(2)}
        </td>

        <!-- 16. Costo Real Operativo Total (Stripe+IA+Search+Storage+Infra) -->
        <td class="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-200 whitespace-nowrap">
          $ ${row.costoRecursos.toFixed(2)}
        </td>

        <!-- 17. Margen Neto Real & % Consumo -->
        <td class="px-3.5 py-2.5 whitespace-nowrap">
          <div class="flex flex-col items-end gap-1">
            <span class="font-mono text-xs font-extrabold ${row.margenNetoRealMxn >= 0 ? 'text-emerald-400' : 'text-rose-400'}">
              ${row.margenNetoRealMxn >= 0 ? '+' : ''}$ ${row.margenNetoRealMxn.toFixed(2)} (${row.margenNetoRealPct}%)
            </span>
            <div class="flex items-center justify-end gap-2">
              <span class="font-mono text-[10px] ${pctTextColor}">${row.pctConsumo}%</span>
              <div class="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shrink-0">
                <div class="h-full ${barColor} rounded-full transition-all" style="width: ${row.pctConsumo}%;"></div>
              </div>
              ${row.isHighConsumption ? `
                <span title="¡Alerta! Usuario al ${row.pctConsumo}% de su límite." class="text-amber-400 text-xs animate-bounce">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                </span>
              ` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  updateAdminDeleteButtonUI();
  updateSelectAllCheckboxState();
}

function updateAdminKpisUI(dataset) {
  const totalUsers = dataset.length;
  const activeUsers = dataset.filter(d => d.actividad === 'activo').length;
  const totalRevenue = dataset.reduce((acc, curr) => acc + (curr.gastoSuscripcion || 0), 0);
  const totalResourceCost = dataset.reduce((acc, curr) => acc + (curr.costoRecursos || 0), 0);
  const netMarginMxn = totalRevenue - totalResourceCost;
  const netMarginPct = totalRevenue > 0 ? Number(((netMarginMxn / totalRevenue) * 100).toFixed(1)) : 0;

  const elTotalUsers = document.getElementById('admin-kpi-total-users');
  const elActiveUsers = document.getElementById('admin-kpi-active-users');
  const elRevenue = document.getElementById('admin-kpi-revenue');
  const elCost = document.getElementById('admin-kpi-cost');
  const elMargin = document.getElementById('admin-kpi-margin');

  if (elTotalUsers) elTotalUsers.textContent = totalUsers;
  if (elActiveUsers) elActiveUsers.textContent = activeUsers;
  if (elRevenue) elRevenue.textContent = `$ ${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCost) elCost.textContent = `$ ${totalResourceCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMargin) {
    elMargin.textContent = `${netMarginPct}% ($ ${netMarginMxn.toLocaleString('es-MX', { minimumFractionDigits: 2 })})`;
    elMargin.className = `text-base font-extrabold font-mono ${netMarginMxn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
  }
}

// =========================================================================
// 6. GESTIÓN DE CO-ADMINISTRADORES (SUB-MODAL)
// =========================================================================

export function openCoAdminsModal() {
  const modal = document.getElementById('modal-admin-coadmins');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  renderCoAdminsListUI();
}

export function closeCoAdminsModal() {
  const modal = document.getElementById('modal-admin-coadmins');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

export function renderCoAdminsListUI() {
  const container = document.getElementById('coadmins-list-container');
  if (!container) return;

  const list = getCoAdminsList();
  const currentUser = getCurrentUser();
  const isMaster = currentUser && isUserMasterAdmin(currentUser.email);

  if (list.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800 text-xs">
        <i class="fa-solid fa-users-slash text-2xl text-slate-500 mb-2 block"></i>
        Actualmente no hay co-administradores invitados. Solo el Administrador Maestro (${MASTER_ADMIN_EMAIL}) tiene acceso.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(admin => {
    return `
      <div class="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold text-xs shrink-0">
            <i class="fa-solid fa-shield"></i>
          </div>
          <div class="min-w-0">
            <div class="font-bold text-white truncate">${admin.name || admin.email}</div>
            <div class="text-[11px] font-mono text-slate-400 truncate">${admin.email}</div>
            <div class="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
              <i class="fa-solid fa-check text-[8px]"></i> Permisos: Editar, Escribir y Leer
            </div>
          </div>
        </div>

        <div>
          ${isMaster ? `
            <button type="button" onclick="handleRemoveCoAdminClick('${admin.email}')" 
                    class="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold transition cursor-pointer flex items-center gap-1.5"
                    title="Revocar acceso de administrador">
              <i class="fa-solid fa-trash-can"></i>
              <span>Eliminar Acceso</span>
            </button>
          ` : `
            <span class="text-[10px] text-slate-500 italic">Solo SuperAdmin</span>
          `}
        </div>
      </div>
    `;
  }).join('');
  updateAdminDeleteButtonUI();
  updateSelectAllCheckboxState();
}

// =========================================================================
// 7. GESTIÓN DE TARIFAS DE MERCADO (SUB-MODAL)
// =========================================================================

export function openMarketRatesModal() {
  const modal = document.getElementById('modal-admin-market-rates');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  const rates = getMarketRates();
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('rate-input-ai-in', rates.aiInputTokenPer1k ?? DEFAULT_MARKET_RATES.aiInputTokenPer1k);
  setVal('rate-input-ai-out', rates.aiOutputTokenPer1k ?? DEFAULT_MARKET_RATES.aiOutputTokenPer1k);
  setVal('rate-input-grounding', rates.aiSearchGroundingPerReq ?? DEFAULT_MARKET_RATES.aiSearchGroundingPerReq);
  setVal('rate-input-stripe-pct', ((rates.stripePct ?? DEFAULT_MARKET_RATES.stripePct) * 100).toFixed(2));
  setVal('rate-input-stripe-fixed', rates.stripeFixedMxn ?? DEFAULT_MARKET_RATES.stripeFixedMxn);
  setVal('rate-input-storage', rates.storageMbMonth ?? DEFAULT_MARKET_RATES.storageMbMonth);
  setVal('rate-input-bandwidth', rates.bandwidthMb ?? DEFAULT_MARKET_RATES.bandwidthMb);
  setVal('rate-input-infra', rates.infraBaseAccountMxn ?? DEFAULT_MARKET_RATES.infraBaseAccountMxn);
}

export function closeMarketRatesModal() {
  const modal = document.getElementById('modal-admin-market-rates');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

export function saveMarketRatesFromModal() {
  const readNum = (id, fallback) => {
    const el = document.getElementById(id);
    const val = el ? parseFloat(el.value) : NaN;
    return Number.isFinite(val) && val >= 0 ? val : fallback;
  };
  const aiIn = readNum('rate-input-ai-in', DEFAULT_MARKET_RATES.aiInputTokenPer1k);
  const aiOut = readNum('rate-input-ai-out', DEFAULT_MARKET_RATES.aiOutputTokenPer1k);

  const newRates = {
    aiTokenPer1k: Number(((aiIn + aiOut) / 2).toFixed(5)),
    aiInputTokenPer1k: aiIn,
    aiOutputTokenPer1k: aiOut,
    aiSearchGroundingPerReq: readNum('rate-input-grounding', DEFAULT_MARKET_RATES.aiSearchGroundingPerReq),
    stripePct: readNum('rate-input-stripe-pct', DEFAULT_MARKET_RATES.stripePct * 100) / 100,
    stripeFixedMxn: readNum('rate-input-stripe-fixed', DEFAULT_MARKET_RATES.stripeFixedMxn),
    storageMbMonth: readNum('rate-input-storage', DEFAULT_MARKET_RATES.storageMbMonth),
    bandwidthMb: readNum('rate-input-bandwidth', DEFAULT_MARKET_RATES.bandwidthMb),
    infraBaseAccountMxn: readNum('rate-input-infra', DEFAULT_MARKET_RATES.infraBaseAccountMxn)
  };

  saveMarketRates(newRates);
  closeMarketRatesModal();
  renderCubikarAdminTable();
  showToast('Tarifas reales de mercado actualizadas.', 'success');
}

// =========================================================================
// 8. EXPORTACIÓN A EXCEL / CSV CON EL FORMATO EXACTO
// =========================================================================

export function exportCubikarDatabaseToExcel() {
  const dataset = getFullAdminUsersDataset();
  if (!dataset || dataset.length === 0) {
    showToast('No hay datos para exportar.', 'warning');
    return;
  }

  // Encabezados exactos a la imagen del usuario
  const headers = [
    'no',
    'Nombre de usuario',
    'Correo',
    'Fecha de registro',
    'Actividad',
    'Membrecia activa',
    'tipo de membrecia (mensual / anual)',
    'Inicio de membrecia',
    'Fin de membrecia',
    'Cantidad de usuarios colaborativos por perfil',
    'IA Input Tokens',
    'IA Output/Raz Tokens',
    'Conceptos IA Estándar (Mes)',
    'Google Search Grounding (Mes)',
    'Almacenamiento (MB / Cuota)',
    'Ancho de banda (MB)',
    'Comisión Stripe ($ MXN)',
    'Costo IA + Grounding ($ MXN)',
    'Costo Storage + Infra ($ MXN)',
    'Ingresos Suscripción ($ MXN)',
    'Costo Total Operativo ($ MXN)',
    'Margen Neto Real ($ MXN)',
    'Margen Neto Real (%)'
  ];

  const rows = dataset.map(d => [
    d.no,
    d.nombre,
    d.correo,
    d.fechaRegistro,
    d.actividad,
    d.membresia,
    d.tipoMembresia,
    d.inicioMembresia,
    d.finMembresia,
    d.usuariosColaborativos,
    d.aiInputTokens,
    d.aiOutputTokens,
    `${d.aiStandardConcepts} / ${d.aiStdQuota}`,
    `${d.searchGroundingCalls} / ${d.searchGroundingQuota}`,
    d.storageMB,
    d.bandwidthMB,
    `$ ${d.costoStripe.toFixed(2)}`,
    `$ ${(d.costoIA + d.costoGrounding).toFixed(2)}`,
    `$ ${(d.costoStorage + d.costoInfraestructura).toFixed(2)}`,
    `$ ${d.gastoSuscripcion.toFixed(2)}`,
    `$ ${d.costoRecursos.toFixed(2)}`,
    `$ ${d.margenNetoRealMxn.toFixed(2)}`,
    `${d.margenNetoRealPct}%`
  ]);

  if (typeof XLSX !== 'undefined') {
    const wsData = [
      ['BASES DE DATOS CUBIKAR'],
      headers,
      ...rows
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bases de Datos Cubikar');
    XLSX.writeFile(wb, `Bases_de_Datos_Cubikar_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('Tabla exportada exitosamente a Excel.', 'success');
  } else {
    // CSV Fallback
    const csvContent = '\uFEFF' + [
      headers.join(';'),
      ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bases_de_Datos_Cubikar_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Tabla exportada exitosamente a CSV.', 'success');
  }
}

// =========================================================================
// 9. FILTROS Y EVENTOS GLOBALES
// =========================================================================

export function setAdminTableSearch(text) {
  adminTableFilterText = text || '';
  renderCubikarAdminTable();
}

export function setAdminFilterActivity(val) {
  adminFilterActivity = val || 'all';
  renderCubikarAdminTable();
}

export function setAdminFilterPlan(val) {
  adminFilterPlan = val || 'all';
  renderCubikarAdminTable();
}

export function setAdminFilterCycle(val) {
  adminFilterCycle = val || 'all';
  renderCubikarAdminTable();
}

// Exponer en window para eventos inline HTML
if (typeof window !== 'undefined') {
  window.openCubikarAdminModal = openCubikarAdminModal;
  window.closeCubikarAdminModal = closeCubikarAdminModal;
  window.renderCubikarAdminTable = renderCubikarAdminTable;
  window.openCoAdminsModal = openCoAdminsModal;
  window.closeCoAdminsModal = closeCoAdminsModal;
  window.openMarketRatesModal = openMarketRatesModal;
  window.closeMarketRatesModal = closeMarketRatesModal;
  window.saveMarketRatesFromModal = saveMarketRatesFromModal;
  window.exportCubikarDatabaseToExcel = exportCubikarDatabaseToExcel;
  window.setAdminTableSearch = setAdminTableSearch;
  window.setAdminFilterActivity = setAdminFilterActivity;
  window.setAdminFilterPlan = setAdminFilterPlan;
  window.setAdminFilterCycle = setAdminFilterCycle;
  window.onAdminUserCheckboxChange = onAdminUserCheckboxChange;
  window.toggleSelectAllAdminUsers = toggleSelectAllAdminUsers;
  window.deleteSelectedAdminUsers = deleteSelectedAdminUsers;
  window.handleAddCoAdminSubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('coadmin-email-input')?.value;
    const name = document.getElementById('coadmin-name-input')?.value;
    if (addCoAdmin(email, name)) {
      document.getElementById('coadmin-email-input').value = '';
      if (document.getElementById('coadmin-name-input')) document.getElementById('coadmin-name-input').value = '';
    }
  };
  window.syncAdminUsersFromCloud = syncAdminUsersFromCloud;
  window.openCloudConfigModal = openCloudConfigModal;
  window.closeCloudConfigModal = closeCloudConfigModal;
  window.saveCloudConfigFromModal = saveCloudConfigFromModal;
  window.copySupabaseSqlScript = copySupabaseSqlScript;
  window.handleRemoveCoAdminClick = (email) => {
    if (confirm(`¿Estás seguro de revocar los permisos de administrador a "${email}"?`)) {
      removeCoAdmin(email);
    }
  };
}
