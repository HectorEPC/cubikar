// js/modules/admin/cubikarAdmin.js
// Módulo de Administración Maestra de Cubikar
// Control de Administradores, Base de Datos de Usuarios, Métricas SaaS, Consumos de IA y Alertas de Cuota

import {
  getCurrentUser,
  getRegisteredUsersList,
  getProjectsList,
  findRegisteredUserAccount,
  deleteUserAccountAndData
} from '../portal/projectService.js';
import { SUBSCRIPTION_PLANS, openSubscriptionModal } from '../portal/subscriptionModal.js';
import { showToast } from '../../ui/notifications.js';

// Administrador Maestro Oficial
export const MASTER_ADMIN_EMAIL = 'hepc.90@gmail.com';

// Claves de Almacenamiento Local
export const STORAGE_KEY_CO_ADMINS = 'cubikar_co_administrators_v2';
export const STORAGE_KEY_MARKET_RATES = 'cubikar_market_rates_v2';
export const STORAGE_KEY_CONSUMPTION = 'cubikar_user_consumption_v2';
export const STORAGE_KEY_ADMIN_SESSION_MODE = 'cubikar_admin_session_mode';

// Tarifas de Mercado Base (en Pesos Mexicanos - MXN) actualizables
export const DEFAULT_MARKET_RATES = {
  // $0.004 MXN por cada 1,000 tokens (Gemini 1.5/2.0 Flash blended input/output)
  aiTokenPer1k: 0.004,
  // $0.0005 MXN por cada MB al mes (~$0.50 MXN por GB en Supabase/S3 Storage)
  storageMbMonth: 0.0005,
  // $0.002 MXN por cada MB de transferencia y sincronización Realtime (WebSockets)
  bandwidthMb: 0.002
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

export function getUserConsumptionData(userEmail) {
  if (!userEmail) return { tokensIA: 0, storageMB: 0, bandwidthMB: 0, lastActivity: null };
  const cleanEmail = userEmail.toLowerCase().trim();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_CONSUMPTION}_${cleanEmail}`);
    if (raw) return JSON.parse(raw);
  } catch (_) {}

  // Consumo inicial estimado según proyectos existentes
  return {
    tokensIA: 15400,
    storageMB: 2.4,
    bandwidthMB: 18.5,
    lastActivity: new Date().toISOString()
  };
}

export function recordAiTokenUsage(userEmail, tokensCount) {
  if (!userEmail || !tokensCount) return;
  const cleanEmail = userEmail.toLowerCase().trim();
  const current = getUserConsumptionData(cleanEmail);
  current.tokensIA = (current.tokensIA || 0) + Number(tokensCount);
  current.lastActivity = new Date().toISOString();
  try {
    localStorage.setItem(`${STORAGE_KEY_CONSUMPTION}_${cleanEmail}`, JSON.stringify(current));
  } catch (_) {}
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
  current.storageMB = Number(megabytes.toFixed(2));
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

  // 1. Obtener plan de suscripción
  let planId = user?.subscription?.planId || 'free';
  let billingCycle = user?.subscription?.billingCycle || 'monthly';
  let subPlan = SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];

  let cuotaMensual = billingCycle === 'annual' ? (subPlan.annualPrice || subPlan.monthlyPrice) : subPlan.monthlyPrice;
  // Si es gratuita, asignamos una base de costo de cortesía de $10 MXN para medir el ratio
  let baseComparativa = cuotaMensual > 0 ? cuotaMensual : 15.0;

  // 2. Costo real de recursos consumidos
  const costoIA = ((consumption.tokensIA || 0) / 1000) * rates.aiTokenPer1k;
  const costoStorage = (consumption.storageMB || 0) * rates.storageMbMonth;
  const costoBandwidth = (consumption.bandwidthMB || 0) * rates.bandwidthMb;
  const totalCostoRecursos = Number((costoIA + costoStorage + costoBandwidth).toFixed(2));

  // 3. Porcentaje de consumo comparado con el plan
  let pctConsumo = Number(((totalCostoRecursos / baseComparativa) * 100).toFixed(1));
  if (pctConsumo > 100) pctConsumo = 100;

  // 4. Conteo de usuarios colaborativos del perfil
  const allProjects = getProjectsList();
  const userProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === cleanEmail);
  const uniqueCollaborators = new Set();
  userProjects.forEach(p => {
    (p.collaborators || []).forEach(c => {
      const email = typeof c === 'string' ? c : c?.email;
      if (email && email.toLowerCase().trim() !== cleanEmail) {
        uniqueCollaborators.add(email.toLowerCase().trim());
      }
    });
  });
  const maxCollaborators = planId === 'pro' ? 20 : (planId === 'plus' ? 10 : 5);
  const collaborativeCount = `${uniqueCollaborators.size + 1} / ${maxCollaborators}`;

  // 5. Estado de actividad
  const actividad = evaluateUserActivity(user, consumption);

  // 6. Alerta del 85%
  const isHighConsumption = pctConsumo >= 85;

  return {
    user,
    cleanEmail,
    planId,
    planName: subPlan.name,
    billingCycle,
    actividad,
    collaborativeCount,
    tokensIA: consumption.tokensIA || 0,
    storageMB: consumption.storageMB || 0,
    bandwidthMB: consumption.bandwidthMB || 0,
    gastoSuscripcion: cuotaMensual,
    totalCostoRecursos,
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
}

export function closeCubikarAdminModal() {
  const modal = document.getElementById('modal-admin-cubikar');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
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
      storageMB: `${metrics.storageMB} MB`,
      bandwidthMB: `${metrics.bandwidthMB} MB`,
      gastoSuscripcion: metrics.gastoSuscripcion,
      costoRecursos: metrics.totalCostoRecursos,
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
        <td colspan="17" class="text-center py-12 text-slate-400 font-medium bg-slate-900/40">
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

        <!-- 11. Llamadas a la IA (Tokens) -->
        <td class="px-3 py-2.5 text-right font-mono text-sky-400 whitespace-nowrap" title="Tokens Gemini/OpenAI consumidos este mes">
          <i class="fa-solid fa-brain text-[10px] text-sky-500 mr-1"></i>${row.tokensIA}
        </td>

        <!-- 12. Almacenamiento (MB) -->
        <td class="px-3 py-2.5 text-right font-mono text-indigo-300 whitespace-nowrap" title="Base de datos, catálogos e imágenes">
          <i class="fa-solid fa-database text-[10px] text-indigo-400 mr-1"></i>${row.storageMB}
        </td>

        <!-- 13. Ancho de Banda y Realtime -->
        <td class="px-3 py-2.5 text-right font-mono text-teal-300 whitespace-nowrap" title="Transferencia de datos y sincronización Realtime">
          <i class="fa-solid fa-bolt text-[10px] text-teal-400 mr-1"></i>${row.bandwidthMB}
        </td>

        <!-- 14. Total de Gastos en Suscripción -->
        <td class="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
          $ ${row.gastoSuscripcion.toFixed(2)}
        </td>

        <!-- 15. Total de Gastos en Recursos Consumidos -->
        <td class="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-200 whitespace-nowrap">
          $ ${row.costoRecursos.toFixed(2)}
        </td>

        <!-- 16. % de Gastos en Recursos Consumidos vs Plan -->
        <td class="px-3.5 py-2.5 whitespace-nowrap">
          <div class="flex items-center justify-end gap-2">
            <span class="font-mono text-xs ${pctTextColor}">${row.pctConsumo}%</span>
            <div class="w-16 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700 shrink-0">
              <div class="h-full ${barColor} rounded-full transition-all" style="width: ${row.pctConsumo}%;"></div>
            </div>
            ${row.isHighConsumption ? `
              <span title="¡Alerta! Usuario al ${row.pctConsumo}% de su límite. Notificación enviada a su campana." class="text-amber-400 text-xs animate-bounce">
                <i class="fa-solid fa-triangle-exclamation"></i>
              </span>
            ` : ''}
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
  const grossMargin = totalRevenue > 0 ? Number((((totalRevenue - totalResourceCost) / totalRevenue) * 100).toFixed(1)) : 0;

  const elTotalUsers = document.getElementById('admin-kpi-total-users');
  const elActiveUsers = document.getElementById('admin-kpi-active-users');
  const elRevenue = document.getElementById('admin-kpi-revenue');
  const elCost = document.getElementById('admin-kpi-cost');
  const elMargin = document.getElementById('admin-kpi-margin');

  if (elTotalUsers) elTotalUsers.textContent = totalUsers;
  if (elActiveUsers) elActiveUsers.textContent = activeUsers;
  if (elRevenue) elRevenue.textContent = `$ ${totalRevenue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCost) elCost.textContent = `$ ${totalResourceCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMargin) elMargin.textContent = `${grossMargin}%`;
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
  const inpAi = document.getElementById('rate-input-ai');
  const inpStorage = document.getElementById('rate-input-storage');
  const inpBw = document.getElementById('rate-input-bandwidth');

  if (inpAi) inpAi.value = rates.aiTokenPer1k;
  if (inpStorage) inpStorage.value = rates.storageMbMonth;
  if (inpBw) inpBw.value = rates.bandwidthMb;
}

export function closeMarketRatesModal() {
  const modal = document.getElementById('modal-admin-market-rates');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

export function saveMarketRatesFromModal() {
  const inpAi = document.getElementById('rate-input-ai');
  const inpStorage = document.getElementById('rate-input-storage');
  const inpBw = document.getElementById('rate-input-bandwidth');

  const newRates = {
    aiTokenPer1k: parseFloat(inpAi?.value) || DEFAULT_MARKET_RATES.aiTokenPer1k,
    storageMbMonth: parseFloat(inpStorage?.value) || DEFAULT_MARKET_RATES.storageMbMonth,
    bandwidthMb: parseFloat(inpBw?.value) || DEFAULT_MARKET_RATES.bandwidthMb
  };

  saveMarketRates(newRates);
  closeMarketRatesModal();
  renderCubikarAdminTable();
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
    'Llamadas a la IA (Tokens de Gemini / OpenAI)',
    'Almacenamiento (Base de datos y Storage en MB)',
    'Ancho de banda y sincronizacion en tiempo real',
    'Total de gastos en suscripcion',
    'Total de gastos en recursos consumidos por mes',
    '% de gastos en recursos consumidos por mes comparado con su plan (si consumio todo el recurso de la suscripcion)'
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
    d.tokensIA,
    d.storageMB,
    d.bandwidthMB,
    `$ ${d.gastoSuscripcion.toFixed(2)}`,
    `$ ${d.costoRecursos.toFixed(2)}`,
    `${d.pctConsumo}%`
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
  window.handleRemoveCoAdminClick = (email) => {
    if (confirm(`¿Estás seguro de revocar los permisos de administrador a "${email}"?`)) {
      removeCoAdmin(email);
    }
  };
}
