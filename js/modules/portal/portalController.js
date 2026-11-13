// js/modules/portal/portalController.js
// Controlador integral para la pantalla de inicio, perfil, proyectos y navegación multi-obra

import {
  setActiveProjectId,
  getActiveProjectId,
  getSettingsKey
} from '../../config/constants.js';
import {
  getCurrentUser,
  getLastKnownUser,
  getSavedUserProfile,
  saveCurrentUser,
  getProjectsList,
  saveProjectsList,
  getProjectById,
  createNewProject,
  loadSampleResidentialZipCatalog,
  duplicateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
  getProjectMembers,
  setTabAssignedMembers,
  getTabAssignedMembers,
  updateProjectMemberTabs,
  getProjectsForUser,
  canUserCreateProject,
  canUserInviteToProject,
  createProjectInvitation,
  acceptProjectInvitation,
  rejectProjectInvitation,
  getPendingInvitationsForUser,
  getWorkspaceInviters,
  getPlanLimits,
  getUserPlanId,
  canUserInviteToPlan,
  createPlanInvitation,
  getPlanCollaboratorsForOwner,
  removePlanCollaborator,
  updatePlanCollaboratorRole,
  saveRegisteredUserAccount,
  findRegisteredUserAccount,
  getFeaturedProfilesList,
  addFeaturedProfile,
  removeFeaturedProfile,
  STORAGE_KEY_FEATURED_PROFILES,
  STORAGE_KEY_CLOSED_SESSIONS,
  getClosedSessionsList,
  markSessionClosed,
  markSessionOpen,
  purgeAllRegisteredAccountsAndUsers,
  deleteUserAccountAndData,
  enforceGlobalSessionRevocation,
  PROJECT_ROLES,
  AVATARS_BY_SEX,
  GOOGLE_PRESET_ACCOUNTS,
  SAMPLE_LOGOS,
  setActiveWorkspaceData,
  getActiveWorkspaceData
} from './projectService.js';
import { showToast } from '../../ui/notifications.js';
import { persistLocalData, state, initStore } from '../../state/store.js';
import { renderBrandingUI } from '../../ui/brandingController.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { updateSobrecostoBadge, updateGrandTotal } from '../../core/calculations.js';
import { updateSubscriptionBadgesUI, closeSubscriptionModal, saveSubscription, getCurrentSubscription, syncSubscriptionFromCloud } from './subscriptionModal.js';
import { calculateProjectTotalEstimacionesSummary } from '../estimaciones/estimacionesModel.js';
import { renderSidebarNotificationsUI, clearAllChatHistory } from '../chat/projectChat.js';
import {
  signUp,
  signInWithPassword,
  signInWithGoogle,
  signOut,
  resetPasswordForEmail,
  fetchUserProfile
} from '../../core/authService.js';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js';
import { uploadManagedFile, archiveGeneratedWorkbookReport } from '../../services/s3StorageService.js';
import { mountStorageMeter } from '../../services/storageQuotaService.js';
import {
  isUserAdmin,
  showAdminDualLoginModal,
  openCubikarAdminModal
} from '../admin/cubikarAdmin.js';
import { syncProjectToCloud, fetchCloudProjects } from '../../core/cloudProjectService.js';

let customPhotoTemp = null;
let wizardData = {
  step: 1,
  logo: '',
  companyName: '',
  projectName: '',
  projectLocation: '',
  currency: 'MXN',
  currencySymbol: '$',
  applySobrecosto: true,
  indirectos: 12.00,
  financiamiento: 1.50,
  utilidad: 10.00,
  adicionales: 0.50,
  template: 'demo'
};

// ==========================================
// INICIALIZACIÓN DEL PORTAL
// ==========================================
export function initPortal() {
  enforceGlobalSessionRevocation();
  const urlParams = new URLSearchParams(window.location.search);
  const projIdFromUrl = urlParams.get('project');
  const user = getCurrentUser();

  if (user) {
    try {
      if (typeof window !== 'undefined' && typeof window.autoSyncCollaborationOnStartup === 'function') {
        window.autoSyncCollaborationOnStartup(user);
      }
    } catch (_) {}
  }

  // Detectar retorno de pago exitoso desde Stripe Checkout
  const pagoStatus = urlParams.get('pago');
  if (pagoStatus === 'exitoso') {
    const planParam = urlParams.get('plan') || 'plus';
    const cicloParam = urlParams.get('ciclo') || 'monthly';
    saveSubscription(planParam, cicloParam);
    try { updateSubscriptionBadgesUI(); } catch (_) {}

    // Sincronizar actualización de suscripción con Supabase en la tabla empresas
    const sb = getSupabaseClient();
    if (sb && user?.empresaId) {
      sb.from('empresas').update({
        plan: planParam,
        estado_suscripcion: 'active',
        periodo_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }).eq('id', user.empresaId).then(() => {
        console.info('[Stripe] Empresa actualizada con éxito en Supabase');
      }).catch(err => console.warn('[Stripe] Aviso al actualizar empresa:', err));
    }

    showToast(`🎉 ¡Pago verificado con éxito por Stripe! Plan ${planParam.toUpperCase()} activado en tu empresa.`, 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (pagoStatus === 'cancelado') {
    showToast('Proceso de pago cancelado. No se realizó ningún cargo.', 'info');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (projIdFromUrl) {
    if (!user) {
      // Si intenta abrir un proyecto sin haber iniciado sesión
      showPortalView('login', projIdFromUrl);
      return false;
    }

    const proj = getProjectById(projIdFromUrl);
    if (proj) {
      // Activar el proyecto solicitado y cargar el espacio de trabajo
      setActiveProjectId(proj.id);
      showWorkspaceView(user, proj);
      return true;
    } else {
      showToast('No se encontró el proyecto especificado. Mostrando lista de proyectos.', false);
      showPortalView('dashboard');
      return false;
    }
  }

  // Si no hay proyecto en la URL
  if (user) {
    showPortalView('dashboard');
  } else {
    showPortalView('login');
  }
  return false;
}

// Alternar visibilidad entre el Portal y el Espacio de Trabajo
export function showPortalView(mode = 'dashboard', returnProjectId = null) {
  const portalContainer = document.getElementById('view-portal');
  const workspaceContainer = document.getElementById('workspace-container');

  if (workspaceContainer) {
    workspaceContainer.classList.add('hidden');
    workspaceContainer.style.display = 'none';
  }
  if (portalContainer) {
    portalContainer.classList.remove('hidden');
    portalContainer.style.display = 'flex';
    if (typeof document !== 'undefined') {
      if (document.documentElement?.classList) document.documentElement.classList.add('portal-active');
      if (document.body?.classList) document.body.classList.add('portal-active');
    }
  }

  const effectiveReturnId = returnProjectId || null;
  const user = getCurrentUser();

  if (mode === 'dashboard' && user) {
    renderPortalDashboard(); renderSidebarNotificationsUI();
  } else if (mode === 'register') {
    renderPortalAuth('register', effectiveReturnId);
  } else {
    renderPortalAuth('login', effectiveReturnId);
  }
}

function showWorkspaceView(user, project) {
  const portalContainer = document.getElementById('view-portal');
  const workspaceContainer = document.getElementById('workspace-container');

  if (portalContainer) {
    portalContainer.classList.add('hidden');
    portalContainer.style.display = 'none';
    if (typeof document !== 'undefined') {
      if (document.documentElement?.classList) document.documentElement.classList.remove('portal-active');
      if (document.body?.classList) document.body.classList.remove('portal-active');
    }
  }
  if (workspaceContainer) {
    workspaceContainer.classList.remove('hidden');
    workspaceContainer.style.display = 'flex';
  }

  if (project && project.ownerEmail) {
    const hostEmail = (project.ownerEmail || '').toLowerCase().trim();
    const hostName = project.companyName || hostEmail;
    setActiveWorkspaceData(hostEmail, hostName);
  }
  updateWorkspaceHeaderUser(user);
  renderHeaderCollaborators();
  try {
    renderBrandingUI();
  } catch (e) {
    console.warn('Error al actualizar branding en showWorkspaceView:', e);
  }
}

// ==========================================
// PORTADA DE INICIO (INICIAR SESIÓN / REGISTRO)
// ==========================================
export function renderPortalAuth(initialTab = 'login', returnProjectId = null) {
  updatePortalHeaderUserArea(null);
  const main = document.getElementById('portal-main-container');
  if (!main) return;

  const savedUser = getSavedUserProfile();
  const featuredProfiles = getFeaturedProfilesList();

  // Logo e Identidad Institucional cubikar
  const defaultAppLogo = 'assets/branding/cubikar_icon_transparent.png?v=4';
  const logoSrc = defaultAppLogo;

  main.innerHTML = `
    <div class="max-w-xl mx-auto w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in duration-200">
      
      <!-- Encabezado de la Portada con Logo puro y Nombre cubikar -->
      <div class="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-6 sm:p-7 text-center relative overflow-hidden">
        <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 flex items-center justify-center">
          <img src="${logoSrc}" alt="cubikar" class="max-h-full max-w-full object-contain drop-shadow-xl">
        </div>
        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight font-sans">cubikar<span class="text-rose-500 font-black">.</span></h1>
      </div>

      <!-- Botón Rápido: Registrarse / Conectar con Gmail -->
      <div class="px-6 sm:px-8 pt-5 pb-1">
        <button type="button" onclick="triggerGoogleSignIn()" class="w-full bg-white hover:bg-slate-50 active:scale-98 text-slate-800 border-2 border-slate-200 hover:border-slate-300 font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center justify-center gap-2.5 group cursor-pointer">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span class="group-hover:text-blue-700 transition">Continuar / Registrarse con Google (Gmail)</span>
        </button>

        <!-- Separador -->
        <div class="flex items-center gap-3 my-4">
          <div class="h-px flex-1 bg-slate-200"></div>
          <span class="text-[10px] text-slate-400 font-medium uppercase tracking-wider shrink-0">o utiliza tu cuenta de correo</span>
          <div class="h-px flex-1 bg-slate-200"></div>
        </div>
      </div>

      <!-- Selector de Modo: Iniciar Sesión vs Registrarse -->
      <div class="px-6 sm:px-8">
        <div class="flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
          <button type="button" onclick="switchAuthTab('login')" id="btn-tab-login" class="flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${initialTab === 'login' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
            <i class="fa-solid fa-right-to-bracket text-[11px]"></i> Iniciar Sesión
          </button>
          <button type="button" onclick="switchAuthTab('register')" id="btn-tab-register" class="flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${initialTab === 'register' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}">
            <i class="fa-solid fa-user-plus text-[11px]"></i> Registrarse
          </button>
        </div>
      </div>

      <!-- ============================================== -->
      <!-- SECCIÓN: INICIAR SESIÓN -->
      <!-- ============================================== -->
      <div id="section-login" class="${initialTab === 'login' ? '' : 'hidden'} px-6 sm:px-8 py-5 space-y-4">
        
        ${featuredProfiles && featuredProfiles.length > 0 ? `
          <!-- Perfiles destacados con sesión abierta en este dispositivo -->
          <div id="section-featured-profiles" class="space-y-2.5">
            <div class="flex items-center justify-between px-0.5">
              <span class="text-[11px] text-blue-700 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <i class="fa-solid fa-users text-xs"></i> Perfiles destacados
              </span>
              <span class="text-[10px] text-slate-400 font-medium">${featuredProfiles.length} cuenta${featuredProfiles.length === 1 ? '' : 's'}</span>
            </div>
            <div class="space-y-2 max-h-60 overflow-y-auto custom-scroll pr-0.5">
              ${featuredProfiles.map(p => {
                const safeEmail = (p.email || '').replace(/'/g, "\\'");
                const safeName = (p.name || 'Usuario').replace(/'/g, "\\'");
                const avatarUrl = p.avatar || (AVATARS_BY_SEX && AVATARS_BY_SEX[p.sexo]) || (AVATARS_BY_SEX && AVATARS_BY_SEX['Masculino']) || 'assets/branding/cubikar_icon_transparent.png';
                const isCurrent = savedUser && (savedUser.email || '').toLowerCase().trim() === (p.email || '').toLowerCase().trim();
                return `
                  <div class="p-2.5 sm:p-3 ${isCurrent ? 'bg-blue-50/90 border-blue-300 ring-1 ring-blue-300/60' : 'bg-slate-50/90 hover:bg-blue-50/50 border-slate-200'} border rounded-2xl flex items-center justify-between gap-3 transition shadow-xs">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-10 h-10 rounded-full overflow-hidden border-2 ${isCurrent ? 'border-blue-600' : 'border-slate-300'} bg-white shrink-0 shadow-xs">
                        <img src="${avatarUrl}" alt="Avatar" class="w-full h-full object-cover">
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <strong class="text-xs font-bold text-slate-900 block truncate">${p.name || 'Usuario'}</strong>
                          ${isCurrent ? `<span class="text-[9.5px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded-md shadow-xs shrink-0">Activa</span>` : ''}
                        </div>
                        <span class="text-[11px] text-slate-500 font-mono truncate block">${p.email}</span>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <button type="button" onclick="removeFeaturedUserAccount('${safeEmail}', '${safeName}', '${returnProjectId || ''}')" title="Quitar cuenta y cerrar su sesión" class="bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 font-bold text-xs px-2.5 py-1.5 rounded-xl transition flex items-center gap-1 active:scale-95 cursor-pointer">
                        <i class="fa-solid fa-user-xmark text-xs"></i>
                        <span class="hidden sm:inline">Quitar cuenta</span>
                      </button>
                      <button type="button" onclick="quickLoginWithFeaturedUser('${safeEmail}', '${returnProjectId || ''}')" class="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow transition flex items-center gap-1.5 active:scale-95 cursor-pointer">
                        <span>Entrar</span> <i class="fa-solid fa-arrow-right text-[10px]"></i>
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="text-center text-[11px] text-slate-400 pt-1">O ingresa con otro correo electrónico:</div>
          </div>
        ` : ''}

        <form onsubmit="handleLoginSubmit(event, '${returnProjectId || ''}')" class="space-y-3.5">
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1">Correo Electrónico *</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i class="fa-solid fa-envelope text-xs"></i>
              </span>
              <input type="email" id="login-email" required placeholder="tu-correo@constructora.com" 
                     class="w-full pl-9 pr-3 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-mono text-slate-800 transition">
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block font-bold text-xs text-slate-700">Contraseña *</label>
              <button type="button" onclick="promptResetPassword()" class="text-[11px] text-blue-600 hover:underline cursor-pointer">¿Olvidaste tu contraseña?</button>
            </div>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i class="fa-solid fa-lock text-xs"></i>
              </span>
              <input type="password" id="login-password" required placeholder="Tu contraseña" 
                     class="w-full pl-9 pr-10 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-mono text-slate-800 transition">
              <button type="button" onclick="togglePasswordVisibility('login-password', 'login-pass-eye')" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer" title="Mostrar/Ocultar contraseña">
                <i id="login-pass-eye" class="fa-solid fa-eye text-xs"></i>
              </button>
            </div>
          </div>

          <!-- Opción de Recordar Sesión (Si no se marca, al cerrar el navegador no queda iniciada) -->
          <div class="flex items-center gap-2 pt-0.5">
            <label class="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer select-none">
              <input type="checkbox" id="login-remember-me" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer">
              <span>Mantener sesión iniciada en esta computadora</span>
            </label>
          </div>

          <button type="submit" id="btn-login-submit" class="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2 active:scale-98 cursor-pointer">
            <i class="fa-solid fa-right-to-bracket text-xs"></i>
            <span>Iniciar sesión</span>
          </button>
        </form>

        <p class="text-center text-xs text-slate-500 pt-1">
          ¿No tienes una cuenta aún? <button type="button" onclick="switchAuthTab('register')" class="text-blue-600 font-bold hover:underline cursor-pointer">Regístrate aquí</button>
        </p>
      </div>

      <!-- ============================================== -->
      <!-- SECCIÓN: REGISTRARSE (NUEVO USUARIO) -->
      <!-- ============================================== -->
      <div id="section-register" class="${initialTab === 'register' ? '' : 'hidden'} px-6 sm:px-8 py-5 space-y-3.5">
        
        <!-- Banner Dinámico de Google Auto-fill -->
        <div id="google-autofill-banner" class="hidden p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-start gap-2.5 animate-in fade-in">
          <i class="fa-brands fa-google text-emerald-600 text-base mt-0.5 shrink-0"></i>
          <div class="space-y-0.5 flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <strong class="font-bold text-emerald-950">Datos auto-rellenados desde Gmail</strong>
              <span class="text-[9px] bg-emerald-200/80 text-emerald-900 px-1.5 py-0.2 rounded font-mono font-bold">Verificado</span>
            </div>
            <p class="text-[11px] text-emerald-700 leading-snug">
              Se cargaron tu foto de perfil, nombre y correo. <strong>Puedes editar cualquiera de los campos abajo</strong> a tu gusto antes de confirmar.
            </p>
          </div>
        </div>

        <form onsubmit="handleRegisterSubmit(event, '${returnProjectId || ''}')" class="space-y-3.5">
          
          <!-- 1. SEXO (Determina automáticamente el avatar inicial) -->
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1.5">1. Selecciona tu Sexo * (Asigna tu Avatar temático)</label>
            <div class="grid grid-cols-3 gap-2">
              <button type="button" onclick="setRegSexo('Masculino')" id="btn-sexo-masc" class="p-2 border-2 border-blue-600 bg-blue-50/60 rounded-xl text-xs font-bold text-blue-900 flex items-center justify-center gap-1.5 transition cursor-pointer">
                <span>👷‍♂️</span> Masculino
              </button>
              <button type="button" onclick="setRegSexo('Femenino')" id="btn-sexo-fem" class="p-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer">
                <span>👷‍♀️</span> Femenino
              </button>
              <button type="button" onclick="setRegSexo('Otro')" id="btn-sexo-otro" class="p-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer">
                <span>👷</span> Otro
              </button>
            </div>
          </div>

          <!-- 2. FOTO / AVATAR RESULTANTE -->
          <div class="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3.5">
            <div class="w-16 h-16 rounded-full overflow-hidden border-2 border-blue-600 bg-white flex items-center justify-center shrink-0 shadow-xs">
              <img id="reg-avatar-preview" src="${AVATARS_BY_SEX['Masculino']}" alt="Avatar" class="w-full h-full object-cover">
            </div>
            <div class="space-y-1 flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <strong class="font-bold text-xs text-slate-800" id="reg-avatar-label">Avatar asignado según sexo</strong>
                <span class="text-[9px] text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Auto</span>
              </div>
              <p class="text-[10px] text-slate-500">Puedes conservar este avatar temático o subir tu propia fotografía.</p>
              <label class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer pt-0.5">
                <i class="fa-solid fa-camera text-[10px]"></i> Subir mi propia foto
                <input type="file" accept="image/*" class="hidden" onchange="handleCustomPhotoUpload(event)">
              </label>
            </div>
          </div>

          <!-- 3. NOMBRE COMPLETO -->
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1">2. Nombre Completo *</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i class="fa-solid fa-user text-xs"></i>
              </span>
              <input type="text" id="reg-fullname" required placeholder="Ej. Arq. Carlos Alberto Gómez" 
                     class="w-full pl-9 pr-3 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-semibold text-slate-800 transition">
            </div>
          </div>

          <!-- 4. CORREO ELECTRÓNICO -->
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1">3. Correo Electrónico *</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i class="fa-solid fa-envelope text-xs"></i>
              </span>
              <input type="email" id="reg-email" required placeholder="tu-correo@constructora.com" 
                     class="w-full pl-9 pr-3 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-mono text-slate-800 transition">
            </div>
          </div>

          <!-- 4. CONTRASEÑA -->
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1">4. Contraseña de Acceso * (mínimo 6 caracteres)</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i class="fa-solid fa-lock text-xs"></i>
              </span>
              <input type="password" id="reg-password" required minlength="6" placeholder="Mínimo 6 caracteres" oninput="checkPasswordMatchLive()"
                     class="w-full pl-9 pr-10 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-mono text-slate-800 transition">
              <button type="button" onclick="togglePasswordVisibility('reg-password', 'reg-pass-eye')" class="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 cursor-pointer" title="Mostrar/Ocultar contraseña">
                <i id="reg-pass-eye" class="fa-solid fa-eye text-xs"></i>
              </button>
            </div>
          </div>

          <!-- 5. CONFIRMAR CONTRASEÑA -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block font-bold text-xs text-slate-700">5. Confirmar Contraseña *</label>
              <span id="pass-match-indicator" class="hidden items-center gap-1 text-[11px] font-bold text-emerald-600 animate-in fade-in duration-150">
                <i class="fa-solid fa-circle-check text-xs"></i>
                <span>Las contraseñas coinciden</span>
              </span>
            </div>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i id="pass-match-shield" class="fa-solid fa-shield-check text-xs transition-colors duration-200"></i>
              </span>
              <input type="password" id="reg-password-confirm" required minlength="6" placeholder="Repite tu contraseña" oninput="checkPasswordMatchLive()"
                     class="w-full pl-9 pr-16 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-mono text-slate-800 transition">
              <div class="absolute inset-y-0 right-0 flex items-center pr-3 gap-1.5">
                <span id="pass-match-check-icon" class="hidden text-emerald-600 font-bold text-sm">
                  <i class="fa-solid fa-check"></i>
                </span>
                <button type="button" onclick="togglePasswordVisibility('reg-password-confirm', 'reg-confirm-pass-eye')" class="text-slate-400 hover:text-slate-600 cursor-pointer" title="Mostrar/Ocultar contraseña">
                  <i id="reg-confirm-pass-eye" class="fa-solid fa-eye text-xs"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- 6. FECHA DE NACIMIENTO -->
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1">6. Fecha de Nacimiento *</label>
            <input type="date" id="reg-dob" required value="1992-06-15" class="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-2 text-xs font-sans bg-white text-slate-800" style="color-scheme: light;">
          </div>

          <!-- Opción de Recordar Sesión -->
          <div class="flex items-center gap-2 pt-0.5">
            <label class="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer select-none">
              <input type="checkbox" id="reg-remember-me" class="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer">
              <span>Mantener sesión iniciada en esta computadora</span>
            </label>
          </div>

          <button type="submit" id="btn-submit-reg" class="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer">
            <span>Crear perfil</span>
            <i class="fa-solid fa-arrow-right text-xs"></i>
          </button>
        </form>

        <p class="text-center text-xs text-slate-500 pt-1">
          ¿Ya tienes una cuenta? <button type="button" onclick="switchAuthTab('login')" class="text-blue-600 font-bold hover:underline cursor-pointer">Inicia sesión aquí</button>
        </p>
      </div>

    </div>
  `;
}

// Cambiar entre Iniciar Sesión y Registrarse
export function switchAuthTab(tab) {
  const secLogin = document.getElementById('section-login');
  const secReg = document.getElementById('section-register');
  const btnLogin = document.getElementById('btn-tab-login');
  const btnReg = document.getElementById('btn-tab-register');

  if (!secLogin || !secReg || !btnLogin || !btnReg) return;

  if (tab === 'login') {
    secLogin.classList.remove('hidden');
    secReg.classList.add('hidden');
    btnLogin.className = "flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 bg-white text-blue-700 shadow-xs cursor-pointer";
    btnReg.className = "flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer";
  } else {
    secLogin.classList.add('hidden');
    secReg.classList.remove('hidden');
    btnLogin.className = "flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 cursor-pointer";
    btnReg.className = "flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 bg-white text-blue-700 shadow-xs cursor-pointer";
  }
}

// Actualizar avatar al cambiar el sexo en el formulario
let selectedRegSexo = 'Masculino';
export function setRegSexo(sexo) {
  selectedRegSexo = sexo;
  const btnM = document.getElementById('btn-sexo-masc');
  const btnF = document.getElementById('btn-sexo-fem');
  const btnO = document.getElementById('btn-sexo-otro');
  const preview = document.getElementById('reg-avatar-preview');
  const label = document.getElementById('reg-avatar-label');

  if (btnM) btnM.className = (sexo === 'Masculino') ? "p-2 border-2 border-blue-600 bg-blue-50/60 rounded-xl text-xs font-bold text-blue-900 flex items-center justify-center gap-1.5 transition cursor-pointer" : "p-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer";
  if (btnF) btnF.className = (sexo === 'Femenino') ? "p-2 border-2 border-purple-600 bg-purple-50/60 rounded-xl text-xs font-bold text-purple-900 flex items-center justify-center gap-1.5 transition cursor-pointer" : "p-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer";
  if (btnO) btnO.className = (sexo === 'Otro') ? "p-2 border-2 border-emerald-600 bg-emerald-50/60 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-center gap-1.5 transition cursor-pointer" : "p-2 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer";

  if (!customPhotoTemp && preview) {
    preview.src = AVATARS_BY_SEX[sexo] || AVATARS_BY_SEX['Masculino'];
  }
  if (label) {
    label.innerText = customPhotoTemp ? 'Foto personalizada cargada' : `Avatar temático (${sexo})`;
  }
}

/**
 * Helper compartido para comprimir (<canvas>), validar cuota y respaldar en IndexedDB/S3 avatares o logos en el portal.
 */
async function processPortalImageUpload(file, { modulo = 'avatares', preset = 'avatar' } = {}) {
  const res = await uploadManagedFile({
    file,
    modulo,
    categoria: 'branding',
    preset,
    showFeedback: true,
    includeDataUrl: true
  });
  if (!res.ok) {
    throw new Error(res.reason || 'No se pudo procesar la imagen.');
  }
  return res;
}

export async function handleCustomPhotoUpload(e) {
  const inputEl = e?.target;
  const file = inputEl?.files?.[0];
  if (!file) return;
  try {
    const res = await processPortalImageUpload(file, { modulo: 'avatares', preset: 'avatar' });
    customPhotoTemp = res.dataUrl;
    const preview = document.getElementById('reg-avatar-preview');
    const label = document.getElementById('reg-avatar-label');
    if (preview) preview.src = customPhotoTemp;
    if (label) label.innerText = `Foto personalizada cargada (${res.summaryText})`;
    showToast(`Foto optimizada y cargada (${res.summaryText})`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

// Enviar Registro
export async function handleRegisterSubmit(e, returnProjectId = '') {
  e.preventDefault();
  const name = document.getElementById('reg-fullname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password')?.value || '';
  const confirmPassword = document.getElementById('reg-password-confirm')?.value || '';
  const dob = document.getElementById('reg-dob').value;
  const sexo = selectedRegSexo;
  const avatar = customPhotoTemp || AVATARS_BY_SEX[sexo] || AVATARS_BY_SEX['Masculino'];

  if (password !== confirmPassword) {
    showToast('Las contraseñas no coinciden. Por favor verifica que sean iguales.', 'error');
    const confirmInput = document.getElementById('reg-password-confirm');
    if (confirmInput) confirmInput.focus();
    return;
  }

  const submitBtn = document.getElementById('btn-submit-reg');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

  // Guardar siempre en la base de datos de cuentas locales de respaldo
  const cleanEmail = email.toLowerCase().trim();
  let userPlanSub = { planId: 'free', billingCycle: 'monthly', updatedAt: new Date().toISOString() };
  try {
    const existingRaw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
    if (existingRaw) {
      const parsed = JSON.parse(existingRaw);
      if (parsed?.planId) userPlanSub = parsed;
    } else {
      localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(userPlanSub));
    }
  } catch (_) {}
  currentScopeFilter = 'owned';
  setActiveWorkspaceData(cleanEmail, name || cleanEmail);
  const initialFreeSub = userPlanSub;
  const localAccount = {
    subscription: initialFreeSub,
    name,
    email,
    password,
    sexo,
    dob,
    avatar,
    registeredAt: new Date().toISOString()
  };
  saveRegisteredUserAccount(localAccount);

  const sb = getSupabaseClient();
  if (isSupabaseConfigured() && sb && password) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Creando cuenta en Supabase...`;
    }

    try {
      const { user } = await signUp({ email, password, fullName: name });

      if (user) {
        localAccount.id = user.id;
        try {
          await sb.from('perfiles').update({
            avatar_url: avatar,
            sexo: sexo
          }).eq('id', user.id);
        } catch (_) {}
        try {
          const perfil = await fetchUserProfile(user.id);
          if (perfil?.empresa_id) {
            localAccount.empresaId = perfil.empresa_id;
          }
        } catch (_) {}
      }

      const remember = document.getElementById('reg-remember-me')?.checked ?? false;
      saveCurrentUser(localAccount, remember);
      saveRegisteredUserAccount(localAccount);

      showToast(`¡Bienvenido a Cubikar, ${name}! Tu cuenta fue creada exitosamente.`, 'success');

      const proceedSb = () => {
        if (returnProjectId) {
          openProjectInWorkspace(returnProjectId);
        } else {
          setActiveProjectId(null);
          showPortalView('dashboard');
          renderSidebarNotificationsUI();
        }
      };

      if (isUserAdmin(email) && !returnProjectId) {
        showAdminDualLoginModal(
          localAccount,
          () => proceedSb(),
          () => {
            proceedSb();
            openCubikarAdminModal();
          }
        );
      } else {
        proceedSb();
      }
      return;
    } catch (err) {
      console.warn('[Registro Supabase] Error:', err);

      // Si Supabase excede el límite de correos (rate limit) u ocurre un fallo de red/servidor,
      // permitir registrar y guardar localmente en localStorage sin bloquear al usuario
      const isRateLimit = err?.message && (
        err.message.toLowerCase().includes('rate limit') ||
        err.message.toLowerCase().includes('limit exceeded') ||
        err.message.toLowerCase().includes('too many requests')
      );

      if (isRateLimit) {
        showToast('Límite temporal de correos en la nube. Tu cuenta se creó y guardó localmente.', 'info');
        // Continuar al guardado local de abajo
      } else {
        showToast('Aviso de registro: ' + (err.message || 'Intente nuevamente'), 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnText;
        }
        return;
      }
    }
  }

  // Fallback local (localStorage)
  const newUser = {
    subscription: initialFreeSub,
    name,
    email,
    sexo,
    dob,
    avatar,
    registeredAt: new Date().toISOString()
  };
  const remember = document.getElementById('reg-remember-me')?.checked ?? false;
  saveCurrentUser(newUser, remember);
  showToast(`¡Bienvenido, ${name}! Tu perfil ha sido creado.`);

  if (returnProjectId) {
    openProjectInWorkspace(returnProjectId);
  } else {
    setActiveProjectId(null);
    showPortalView('dashboard');
    renderSidebarNotificationsUI();
  }
}

// Iniciar Sesión con correo existente y contraseña
export async function handleLoginSubmit(e, returnProjectId = '') {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password')?.value || '';

  const submitBtn = document.getElementById('btn-login-submit');
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';

  // Iniciar sesion con Supabase Auth (Nube)

  // 2. Si no es cuenta local, consultar Supabase Auth
  const sb = getSupabaseClient();
  if (isSupabaseConfigured() && sb && password) {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Verificando credenciales...`;
    }

    try {
      const { user, perfil } = await signInWithPassword({ email, password });
      const displayName = perfil?.nombre_completo || user?.user_metadata?.full_name || email;

      // Resolver suscripción persistida en la nube de Supabase (user_metadata o empresas)
      let userSub = user?.user_metadata?.subscription || null;
      if (!userSub && perfil?.empresas?.plan && perfil.empresas.plan !== 'free') {
        userSub = { planId: perfil.empresas.plan, billingCycle: 'monthly', updatedAt: new Date().toISOString() };
      }
      if (!userSub && (email === 'hepc.90@gmail.com' || email === 'admin.general@constructora.com')) {
        userSub = { planId: 'pro', billingCycle: 'monthly', updatedAt: new Date().toISOString() };
      }
      if (userSub) {
        try { localStorage.setItem(`adm_const_subscription_${email}`, JSON.stringify(userSub)); } catch (_) {}
      }

      const loggedUser = {
        id: user.id,
        empresaId: perfil?.empresa_id || null,
        name: displayName,
        email: email,
        subscription: userSub || { planId: 'free', billingCycle: 'monthly', updatedAt: null },
        avatar: perfil?.avatar_url || (AVATARS_BY_SEX && AVATARS_BY_SEX[perfil?.sexo]) || (AVATARS_BY_SEX && AVATARS_BY_SEX['Masculino']) || 'assets/branding/cubikar_icon_transparent.png',
        sexo: perfil?.sexo || 'Masculino',
        role: 'Admin General',
        lastLogin: new Date().toISOString()
      };
      const remember = document.getElementById('login-remember-me')?.checked ?? false;
      saveCurrentUser(loggedUser, remember);
      updateSubscriptionBadgesUI();
      updatePortalHeaderUserArea(loggedUser);
      updateWorkspaceHeaderUser(loggedUser);
      saveRegisteredUserAccount(loggedUser);
      showToast(`¡Hola de nuevo, ${displayName}!`, 'success');

      const proceedSb = () => {
        if (returnProjectId) {
          openProjectInWorkspace(returnProjectId);
        } else {
          setActiveProjectId(null);
          showPortalView('dashboard');
          renderSidebarNotificationsUI();
        }
      };

      if (isUserAdmin(email) && !returnProjectId) {
        showAdminDualLoginModal(
          loggedUser,
          () => proceedSb(),
          () => {
            proceedSb();
            openCubikarAdminModal();
          }
        );
      } else {
        proceedSb();
      }
      return;
    } catch (err) {
      console.warn('[Login Supabase] Error:', err);
      const isInvalid = err?.message && err.message.includes('Invalid login credentials');
      const msg = isInvalid
        ? 'Correo o contraseña incorrectos. Verifica tus datos o crea una cuenta.'
        : (err.message || 'Error al iniciar sesión');
      showToast(msg, 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
      return;
    }
  }

  // 3. Fallback de cuenta registrada localmente
  const cleanEmail = email.toLowerCase().trim();
  const regUser = findRegisteredUserAccount(cleanEmail) || GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === cleanEmail);
  if (regUser) {
    quickLoginWithFeaturedUser(cleanEmail, returnProjectId);
    return;
  }

  const savedUser = getCurrentUser();
  if (savedUser && (savedUser.email || '').toLowerCase().trim() === cleanEmail) {
    currentScopeFilter = 'owned';
    setActiveWorkspaceData(cleanEmail, savedUser.name || cleanEmail);
    showToast(`Â¡Hola de nuevo, ${savedUser.name}!`);
    const proceedSaved = () => {
      if (returnProjectId) {
        openProjectInWorkspace(returnProjectId);
      } else {
        renderPortalDashboard();
        renderSidebarNotificationsUI();
      }
    };

    if (isUserAdmin(cleanEmail) && !returnProjectId) {
      showAdminDualLoginModal(
        savedUser,
        () => proceedSaved(),
        () => {
          proceedSaved();
          openCubikarAdminModal();
        }
      );
    } else {
      proceedSaved();
    }
  } else {
    // Si no existe la cuenta ni localmente ni en nube
    showToast('No se encontrÃ³ una cuenta con ese correo. Por favor regÃ­strate.', 'error');
  }
}

export async function promptResetPassword() {
  const email = prompt('Introduce tu correo electrónico registrado para enviarte las instrucciones de restablecimiento:');
  if (!email || !email.trim()) return;

  const sb = getSupabaseClient();
  if (isSupabaseConfigured() && sb) {
    try {
      showToast('Enviando enlace a tu correo...', 'info');
      await resetPasswordForEmail(email.trim());
      showToast('¡Listo! Revisa tu bandeja de entrada.', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  } else {
    showToast('En modo local no se requiere restablecer contraseña.', 'info');
  }
}

export function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  }
}

export function checkPasswordMatchLive() {
  const p1 = document.getElementById('reg-password')?.value || '';
  const p2 = document.getElementById('reg-password-confirm')?.value || '';
  const indicator = document.getElementById('pass-match-indicator');
  const checkIcon = document.getElementById('pass-match-check-icon');
  const shield = document.getElementById('pass-match-shield');
  const confirmInput = document.getElementById('reg-password-confirm');

  if (p1 && p2 && p1 === p2) {
    if (indicator) {
      indicator.classList.remove('hidden');
      indicator.classList.add('inline-flex');
    }
    if (checkIcon) checkIcon.classList.remove('hidden');
    if (shield) {
      shield.classList.remove('text-slate-400', 'text-rose-500');
      shield.classList.add('text-emerald-500');
    }
    if (confirmInput) {
      confirmInput.classList.remove('border-slate-300', 'border-rose-400');
      confirmInput.classList.add('border-emerald-500', 'focus:border-emerald-500', 'focus:ring-emerald-500');
    }
  } else {
    if (indicator) {
      indicator.classList.add('hidden');
      indicator.classList.remove('inline-flex');
    }
    if (checkIcon) checkIcon.classList.add('hidden');
    if (shield) {
      shield.classList.remove('text-emerald-500');
      if (p2 && p1 !== p2) {
        shield.classList.add('text-rose-500');
      } else {
        shield.classList.add('text-slate-400');
      }
    }
    if (confirmInput) {
      confirmInput.classList.remove('border-emerald-500', 'focus:border-emerald-500', 'focus:ring-emerald-500');
      if (p2 && p1 !== p2) {
        confirmInput.classList.add('border-rose-400');
      } else {
        confirmInput.classList.remove('border-rose-400');
        confirmInput.classList.add('border-slate-300');
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.promptResetPassword = promptResetPassword;
  window.togglePasswordVisibility = togglePasswordVisibility;
  window.checkPasswordMatchLive = checkPasswordMatchLive;
}

export function quickLoginWithFeaturedUser(email, returnProjectId = '') {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  const current = getCurrentUser();
  if (current && current.email && current.email.toLowerCase().trim() !== cleanEmail) {
    try {
      const sb = getSupabaseClient();
      if (sb) sb.auth.signOut();
    } catch (_) {}
  }

  const featured = getFeaturedProfilesList();
  let user = featured.find(p => (p.email || '').toLowerCase().trim() === cleanEmail);
  if (!user) {
    user = findRegisteredUserAccount(cleanEmail);
  }
  if (!user) {
    const saved = getSavedUserProfile();
    if (saved && (saved.email || '').toLowerCase().trim() === cleanEmail) {
      user = saved;
    }
  }
  if (!user) {
    const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === cleanEmail);
    if (preset) {
      user = Object.assign({}, preset, { role: 'Admin General', roleLabel: 'Administrador' });
    }
  }

  if (user) {
    try {
      const userSubRaw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
      if (userSubRaw) {
        user.subscription = JSON.parse(userSubRaw);
      } else if (user.subscription && user.subscription.planId && user.subscription.planId !== 'free') {
        localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(user.subscription));
      } else if (cleanEmail === 'hepc.90@gmail.com' || cleanEmail === 'admin.general@constructora.com') {
        user.subscription = { planId: 'pro', billingCycle: 'monthly', updatedAt: new Date().toISOString() };
        localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(user.subscription));
      } else {
        user.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
        localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(user.subscription));
      }
    } catch (_) {}

    // Restablecer de inmediato el espacio de trabajo activo y el filtro al propio del usuario
    currentScopeFilter = 'owned';
    setActiveWorkspaceData(cleanEmail, user.name || cleanEmail);

    saveCurrentUser(user);
    updateSubscriptionBadgesUI();
    updatePortalHeaderUserArea(user);
    updateWorkspaceHeaderUser(user);
    addFeaturedProfile(user);
    markSessionOpen(user.email);
    showToast(`SesiÃ³n iniciada como ${user.name}`);
    const proceedNormal = () => {
      if (returnProjectId) {
        openProjectInWorkspace(returnProjectId);
      } else {
        setActiveProjectId(null);
        showPortalView('dashboard');
        renderSidebarNotificationsUI();
      }
    };

    if (isUserAdmin(cleanEmail) && !returnProjectId) {
      showAdminDualLoginModal(
        user,
        () => proceedNormal(),
        () => {
          proceedNormal();
          openCubikarAdminModal();
        }
      );
    } else {
      proceedNormal();
    }
  } else {
    showToast('No se encontrÃ³ el perfil seleccionado.', 'error');
  }
}

// Quitar un perfil específico de los perfiles destacados y cerrar su sesión automáticamente
export function removeFeaturedUserAccount(email, name = 'la cuenta', returnProjectId = '') {
  if (!email) return;
  const displayName = name || 'la cuenta';
  if (!confirm(`¿Deseas quitar a "${displayName}" de los perfiles destacados? Se cerrará su sesión automáticamente en este dispositivo.`)) {
    return;
  }

  removeFeaturedProfile(email);
  showToast(`Cuenta de "${displayName}" retirada y sesión cerrada.`, 'info');
  renderPortalAuth('login', returnProjectId);
}

export function quickLoginWithSavedUser(returnProjectId = '') {
  const list = getFeaturedProfilesList();
  if (list && list.length > 0) {
    quickLoginWithFeaturedUser(list[0].email, returnProjectId);
  } else {
    const savedUser = getSavedUserProfile();
    if (savedUser) {
      quickLoginWithFeaturedUser(savedUser.email, returnProjectId);
    }
  }
}

// Quitar la cuenta recordada del acceso rápido de la portada
export function removeSavedUserQuickProfile(returnProjectId = '') {
  const list = getFeaturedProfilesList();
  if (list && list.length > 0) {
    removeFeaturedUserAccount(list[0].email, list[0].name, returnProjectId);
  } else {
    const savedUser = getSavedUserProfile();
    if (savedUser) {
      removeFeaturedUserAccount(savedUser.email, savedUser.name, returnProjectId);
    }
  }
}

if (typeof window !== 'undefined') {
  window.quickLoginWithFeaturedUser = quickLoginWithFeaturedUser;
  window.removeFeaturedUserAccount = removeFeaturedUserAccount;
  window.quickLoginWithSavedUser = quickLoginWithSavedUser;
  window.removeSavedUserQuickProfile = removeSavedUserQuickProfile;
}

// Purgar y eliminar permanentemente todas las cuentas de usuario e información registrada
export function purgeAllUsersAndAccountsAction() {
  purgeAllRegisteredAccountsAndUsers();
  updatePortalHeaderUserArea(null);
  renderSidebarNotificationsUI();
  showToast('Todas las cuentas y perfiles de usuario han sido purgados exitosamente.', 'info');
  renderPortalAuth('login');
}

// ==========================================
// CONECTOR GOOGLE / GMAIL AUTO-FILL
// ==========================================
export async function triggerGoogleSignIn() {
  if (!isSupabaseConfigured()) {
    showToast('Supabase no está configurado para autenticación con Google.', 'error');
    return;
  }

  try {
    showToast('Conectando con Google...', 'info');
    await signInWithGoogle();
  } catch (err) {
    console.error('Error al conectar con Google OAuth:', err);
    showToast('Error al conectar con Google: ' + (err.message || 'Intente de nuevo'), 'error');
  }
}

export function closeGoogleAuthModal() {
  const modal = document.getElementById('modal-google-auth');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function selectGoogleAccount(index) {
  const account = GOOGLE_PRESET_ACCOUNTS[index];
  if (!account) return;
  applyGoogleDataToAuth(account);
  closeGoogleAuthModal();
}

export function submitCustomGoogleAccount() {
  const name = document.getElementById('custom-google-name').value.trim();
  const email = document.getElementById('custom-google-email').value.trim();
  if (!name || !email) {
    alert('Por favor ingresa tu nombre y correo Gmail.');
    return;
  }
  if (!email.toLowerCase().includes('@')) {
    alert('Por favor ingresa un correo electrónico válido.');
    return;
  }

  const initial = name.charAt(0).toUpperCase();
  const svgAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23ea4335'/%3E%3Ctext x='50' y='64' font-size='42' font-family='Arial,sans-serif' font-weight='bold' fill='white' text-anchor='middle'%3E${initial}%3C/text%3E%3C/svg%3E`;

  applyGoogleDataToAuth({
    name: name,
    email: email,
    avatar: svgAvatar,
    sexo: 'Masculino',
    dob: '1992-06-15'
  });
  closeGoogleAuthModal();
}

export function applyGoogleDataToAuth(account) {
  switchAuthTab('register');

  const nameEl = document.getElementById('reg-fullname');
  const emailEl = document.getElementById('reg-email');
  const dobEl = document.getElementById('reg-dob');
  const previewEl = document.getElementById('reg-avatar-preview');
  const banner = document.getElementById('google-autofill-banner');
  const btnSubmit = document.getElementById('btn-submit-reg');

  if (nameEl) nameEl.value = account.name;
  if (emailEl) emailEl.value = account.email;
  if (dobEl && account.dob) dobEl.value = account.dob;
  
  if (account.sexo) {
    setRegSexo(account.sexo);
  }
  
  if (account.avatar) {
    customPhotoTemp = account.avatar;
    if (previewEl) previewEl.src = account.avatar;
  }

  if (banner) {
    banner.classList.remove('hidden');
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (btnSubmit) {
    btnSubmit.innerHTML = `
      <span>Confirmar Datos y Entrar a Mis Proyectos</span>
      <i class="fa-solid fa-arrow-right text-xs"></i>
    `;
  }

  showToast(`Datos auto-rellenados desde ${account.email}. Puedes editarlos abajo.`);
}

// Helper: Indicador visual del modo y membresía activa en el dashboard
export function renderModeStatusBadgeHTML(scope, user, invitersList = null, allProjectsList = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return '';

  const uEmail = u.email.toLowerCase().trim();
  const allProjects = allProjectsList || getProjectsForUser(u);
  const inviters = invitersList || getWorkspaceInviters(u, allProjects);

  // Obtener suscripción oficial priorizando el plan activo en modal/nube
  const sub = (typeof getCurrentSubscription === 'function') ? getCurrentSubscription() : null;
  const userPlanId = sub?.planId || getUserPlanId(u);
  const userPlanLimits = getPlanLimits(userPlanId);
  const ownedProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === uEmail);
  const ownedCount = ownedProjects.length;

  if (scope === 'owned') {
    return `
      <div class="flex items-center gap-2 bg-slate-900/90 border border-amber-500/40 px-3.5 py-1.5 rounded-xl shadow-inner text-xs">
        <i class="fa-solid fa-crown text-amber-400"></i>
        <span class="text-slate-300">🏷️ Membresía activa: <strong class="text-white">Plan ${userPlanLimits.name}</strong></span>
        <span class="text-amber-300 font-mono text-[11px] bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30 font-bold">(${ownedCount}/${userPlanLimits.maxProjects} obras)</span>
      </div>
    `;
  }

  if (scope && scope.startsWith('owner:')) {
    const targetEmail = scope.replace('owner:', '').toLowerCase().trim();
    const inv = inviters.find(i => (i.email || '').toLowerCase().trim() === targetEmail);
    const hostName = inv?.name || targetEmail;
    const hostPlanId = getUserPlanId(targetEmail);
    const hostPlanLimits = getPlanLimits(hostPlanId);
    const planName = hostPlanLimits.name;
    const isEditor = inv?.isEditor || false;
    const roleDisplay = inv?.myRoleDisplay || 'Leer';
    const allSysProjects = getProjectsList();
    const hostProjects = allSysProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === targetEmail);
    const hostCount = hostProjects.length;
    const maxProjects = hostPlanLimits.maxProjects;

    if (isEditor) {
      return `
        <div class="flex items-center gap-2 bg-emerald-950/70 border border-emerald-500/50 px-3.5 py-1.5 rounded-xl shadow-inner text-xs">
          <i class="fa-solid fa-circle-check text-emerald-400"></i>
          <span class="text-emerald-200">🏷️ Membresía: <strong class="text-white">Plan ${planName}</strong> (${hostCount}/${maxProjects} obras)</span>
          <span class="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-md font-bold text-[10.5px]">⭐ Editor (Puedes crear obras)</span>
        </div>
      `;
    } else {
      return `
        <div class="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-3.5 py-1.5 rounded-xl shadow-inner text-xs">
          <i class="fa-solid fa-user-lock text-slate-400"></i>
          <span class="text-slate-300">🏷️ Membresía: <strong class="text-white">Plan ${planName}</strong> (${hostCount}/${maxProjects} obras)</span>
          <span class="bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md font-medium text-[10.5px]">🔒 Rol: ${roleDisplay} (Solo lectura / colaborador)</span>
        </div>
      `;
    }
  }

  // scope === 'all'
  return `
    <div class="flex items-center gap-2 bg-slate-900/90 border border-slate-700 px-3.5 py-1.5 rounded-xl shadow-inner text-xs">
      <i class="fa-solid fa-globe text-blue-400"></i>
      <span class="text-slate-300">🌐 Vista Global &bull; <strong class="text-white">${allProjects.length} obras accesibles</strong></span>
    </div>
  `;
}

// Helper: Botón de Crear Proyecto adaptado al Modo y Permiso actual
export function renderHeaderCreateButtonHTML(user, scope) {
  const u = user || getCurrentUser();
  const check = canUserCreateProject(u, scope);

  if (check.allowed) {
    const btnTooltip = check.isHostContext ? `Crear proyecto en la organización de ${check.hostName} consumiendo su membresía Plan ${getPlanLimits(check.planId).name}` : 'Crear un nuevo proyecto propio';
    return `
      <button onclick="openNuevoProyectoModal()" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer" title="${btnTooltip.replace(/"/g, '&quot;')}">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        <span>+ Nuevo Proyecto</span>
      </button>
    `;
  }

  if (check.isHostContext) {
    if (check.userRole === 'lector/escritor') {
      return `
        <button onclick="showToast('${(check.reason || 'Solo colaboradores con rol de Editor pueden crear proyectos aquí.').replace(/'/g, "\\'")}', 'warning');" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 font-medium text-xs transition border border-slate-800 cursor-pointer" title="${(check.reason || '').replace(/"/g, '&quot;')}">
          <i class="fa-solid fa-lock text-xs text-amber-400"></i>
          <span>Solo Editores Pueden Crear</span>
        </button>
      `;
    }
    return `
      <button onclick="showToast('${(check.reason || 'Límite de proyectos del anfitrión alcanzado.').replace(/'/g, "\\'")}', 'warning');" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 font-medium text-xs transition border border-slate-800 cursor-pointer" title="${(check.reason || '').replace(/"/g, '&quot;')}">
        <i class="fa-solid fa-lock text-xs text-amber-400"></i>
        <span>Límite del Anfitrión (${check.currentProjects}/${check.maxProjects})</span>
      </button>
    `;
  }

  return `
    <button onclick="showToast('${(check.reason || 'Límite de proyectos alcanzado para tu suscripción.').replace(/'/g, "\\'")}', 'warning'); openSubscriptionModal();" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition border border-slate-700 active:scale-95 cursor-pointer" title="${(check.reason || 'Límite de proyectos alcanzado').replace(/"/g, '&quot;')}">
      <i class="fa-solid fa-lock text-xs text-amber-400"></i>
      <span>Nuevo Proyecto (${check.currentProjects || 0}/${check.maxProjects || 2})</span>
    </button>
  `;
}

// ==========================================
// VISTA: DASHBOARD "MIS PROYECTOS"
// ==========================================
export function renderPortalDashboard() {
  const user = getCurrentUser();

  if (!user) {
    showPortalView('login');
    return;
  }
  updatePortalHeaderUserArea(user);
  try {
    if (typeof window !== 'undefined' && typeof window.autoSyncCollaborationOnStartup === 'function') {
      window.autoSyncCollaborationOnStartup(user);
    }
  } catch (_) {}
  try {
    if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.requestPeerSync === 'function') {
      window.CubikarRealtime.requestPeerSync();
    }
  } catch (_) {}

  // Sincronizar en segundo plano proyectos desde Supabase si hay sesión activa
  if (isSupabaseConfigured() && user?.id) {
    fetchCloudProjects().then(cloudList => {
      if (Array.isArray(cloudList) && cloudList.length > 0) {
        const localList = getProjectsList();
        let changed = false;
        cloudList.forEach(cp => {
          const exists = localList.some(lp => lp.id === cp.id || lp.cloudId === cp.id);
          if (!exists) {
            localList.unshift(cp);
            changed = true;
          } else {
            const idx = localList.findIndex(lp => lp.id === cp.id || lp.cloudId === cp.id);
            if (idx !== -1 && !localList[idx].isCloudSynced) {
              localList[idx].isCloudSynced = true;
              changed = true;
            }
          }
        });
        if (changed) {
          saveProjectsList(localList);
          refreshProjectsGridUI();
        }
      }
    }).catch(err => console.warn('[CloudDashboard] Aviso al consultar proyectos de la nube:', err));
  }

  const projects = getProjectsForUser(user);
  const main = document.getElementById('portal-main-container');
  if (!main) return;

  const activeCount = projects.length;
  const userEmail = (user.email || '').toLowerCase().trim();
  const ownedCount = projects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === userEmail).length;
  const invitersList = getWorkspaceInviters(user, projects);
  const sub = (typeof getCurrentSubscription === 'function') ? getCurrentSubscription() : null;
  const userPlanId = sub?.planId || getUserPlanId(user);
  const userPlanLimits = getPlanLimits(userPlanId);

  // Sincronizar membresía activa de Supabase Auth en segundo plano
  try {
    if (typeof syncSubscriptionFromCloud === 'function' && userEmail) {
      syncSubscriptionFromCloud(userEmail).then(cloudSub => {
        if (cloudSub) {
          updateSubscriptionBadgesUI();
          refreshProjectsGridUI();
        }
      }).catch(() => {});
    }
  } catch (_) {}

  main.innerHTML = `
    <!-- Header Section with KPIs -->
    <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs font-medium text-blue-400 mb-1">
          <span>PORTAL DE PROYECTOS</span>
          <span>•</span>
          <span class="text-emerald-400 font-semibold" id="activeProjectsCount">${activeCount} Obra${activeCount === 1 ? '' : 's'} Activa${activeCount === 1 ? '' : 's'}</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Mis Proyectos de Obra</h1>
        <p class="text-sm text-slate-400 mt-1 max-w-2xl">
          Supervisión integral de presupuestos base, análisis de precios unitarios (APU), matrices de insumos y control de sobrecostos.
        </p>
      </div>

      <!-- Quick Action: Primary Button -->
      <div class="flex items-center gap-3" id="portal-header-action-area">
        ${renderHeaderCreateButtonHTML(user, currentScopeFilter)}
      </div>
    </div>

    <!-- Menú Desplegable: Selector de Espacio de Trabajo con Botón de Invitaciones al Plan -->
    <div class="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
        <div class="flex items-center gap-2 shrink-0">
          <div class="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 text-sm">
            <i class="fa-solid fa-briefcase"></i>
          </div>
          <div>
            <span class="text-xs font-bold text-white block">Modo de Trabajo:</span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Menú desplegable de Modo de Trabajo -->
          <div class="relative w-40 sm:w-52 min-w-0">
            <select id="projectScopeModeSelect" onchange="setProjectScopeFilter(this.value)"
                    class="w-full appearance-none bg-slate-950 border border-slate-700 hover:border-blue-500 focus:border-blue-500 text-white font-semibold text-xs sm:text-sm rounded-xl pl-3 pr-8 py-2.5 transition outline-none cursor-pointer shadow-inner truncate">
              <option value="owned" ${currentScopeFilter === 'owned' ? 'selected' : ''}>
                Mis proyectos
              </option>
              ${invitersList.map(inv => `
                <option value="owner:${inv.email}" ${currentScopeFilter === `owner:${inv.email}` ? 'selected' : ''}>
                  ${inv.name}
                </option>
              `).join('')}
              <option value="all" ${currentScopeFilter === 'all' ? 'selected' : ''}>
                Todos los proyectos
              </option>
            </select>
            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-blue-400">
              <i class="fa-solid fa-chevron-down text-xs"></i>
            </div>
          </div>

          <!-- Botón de Invitaciones al Plan al lado derecho del menú desplegable -->
          <button type="button" 
                  id="btn-workspace-plan-invite"
                  onclick="openPlanInviteModal()" 
                  class="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer border border-blue-400/30"
                  title="Invitar usuarios a tu plan de suscripción">
            <i class="fa-solid fa-user-plus text-xs"></i>
            <span class="whitespace-nowrap">Invitaciones</span>
          </button>
        </div>
      </div>

      <!-- Indicador visual del modo actual y membresía gobernante -->
      <div id="mode-status-badge" class="shrink-0 flex items-center gap-2 text-xs">
        ${renderModeStatusBadgeHTML(currentScopeFilter, user, invitersList, projects)}
      </div>
    </div>

    <!-- Toolbar: Search, Filters & View Toggle (Todo en una sola barra integrada) -->
    <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 shadow-xl flex flex-col md:flex-row items-center justify-between gap-3">
      
      <!-- Search Input -->
      <div class="relative w-full md:w-80">
        <span class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
        <input 
          id="searchInput" 
          type="text" 
          placeholder="Buscar por nombre, empresa o ciudad..." 
          oninput="onProjectSearchInput(this.value)"
          value="${currentSearchQuery}"
          class="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-sm text-slate-200 placeholder-slate-500 transition outline-none"
        >
        <span class="absolute right-2.5 top-2.5 text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.5 rounded pointer-events-none">⌘K</span>
      </div>

      <!-- Filters & Sorting Group -->
      <div class="flex flex-wrap items-center gap-2 w-full md:w-auto justify-start md:justify-end">
        
        <!-- Filter Empresa -->
        <div class="relative">
          <select id="empresaFilter" onchange="setCompanyFilter(this.value)" class="appearance-none bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl pl-3 pr-8 py-2 hover:border-slate-700 focus:border-blue-500 transition outline-none cursor-pointer">
            <option value="all">Todas las empresas</option>
            ${renderCompanyOptionsHTML(projects)}
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>

        <!-- Filter Tipo -->
        <div class="relative">
          <select id="tipoFilter" onchange="setTipoObraFilter(this.value)" class="appearance-none bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl pl-3 pr-8 py-2 hover:border-slate-700 focus:border-blue-500 transition outline-none cursor-pointer">
            <option value="all" ${currentTipoObraFilter === 'all' ? 'selected' : ''}>Todos los tipos</option>
            <option value="Vivienda" ${currentTipoObraFilter === 'Vivienda' ? 'selected' : ''}>Vivienda</option>
            <option value="Edificación" ${currentTipoObraFilter === 'Edificación' ? 'selected' : ''}>Edificación</option>
            <option value="Infraestructura" ${currentTipoObraFilter === 'Infraestructura' ? 'selected' : ''}>Infraestructura</option>
            <option value="Obra Civil" ${currentTipoObraFilter === 'Obra Civil' ? 'selected' : ''}>Obra Civil</option>
            <option value="Remodelación" ${currentTipoObraFilter === 'Remodelación' ? 'selected' : ''}>Remodelación</option>
            <option value="Industrial" ${currentTipoObraFilter === 'Industrial' ? 'selected' : ''}>Industrial</option>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>

        <!-- Filter Estado de Salud -->
        <div class="relative">
          <select id="statusFilter" onchange="setStatusFilter(this.value)" class="appearance-none bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl pl-3 pr-8 py-2 hover:border-slate-700 focus:border-blue-500 transition outline-none cursor-pointer">
            <option value="all" ${currentStatusFilter === 'all' ? 'selected' : ''}>Todos los estados</option>
            <option value="ok" ${currentStatusFilter === 'ok' ? 'selected' : ''}>En Presupuesto</option>
            <option value="warning" ${currentStatusFilter === 'warning' ? 'selected' : ''}>Con Sobrecosto</option>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>

        <div class="h-6 w-px bg-slate-800 hidden md:block"></div>

        <!-- Sorting Group (Fecha & A-Z) -->
        <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl p-1">
          <span class="text-[11px] text-slate-500 font-medium px-1.5 hidden sm:inline">Ordenar:</span>
          <!-- Sort by Date -->
          <button id="sortByDateBtn" onclick="toggleSort('date')" class="px-2.5 py-1.5 rounded-lg text-xs font-medium ${currentSortMode.startsWith('date') ? 'text-blue-400 bg-slate-800' : 'text-slate-400 hover:text-white'} hover:text-white transition flex items-center gap-1 shadow-sm cursor-pointer" title="Ordenar por fecha de creación">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Fecha</span>
            <span id="dateSortDir" class="text-[10px]">${currentSortMode === 'date-desc' ? '↓' : '↑'}</span>
          </button>

          <!-- Sort by A-Z -->
          <button id="sortByNameBtn" onclick="toggleSort('name')" class="px-2.5 py-1.5 rounded-lg text-xs font-medium ${currentSortMode.startsWith('az') ? 'text-blue-400 bg-slate-800' : 'text-slate-400 hover:text-white'} hover:bg-slate-800/60 transition flex items-center gap-1 cursor-pointer" title="Ordenar alfabéticamente (A-Z)">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
            <span id="nameSortLabel">${currentSortMode === 'az-desc' ? 'Z - A' : 'A - Z'}</span>
          </button>
        </div>

        <div class="h-6 w-px bg-slate-800 hidden md:block"></div>

        <!-- View Switcher (Grid vs List/Table) -->
        <div class="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
          <button id="viewGridBtn" onclick="switchPortalView('grid')" class="p-1.5 rounded-lg ${currentViewMode === 'grid' ? 'text-blue-400 bg-slate-800' : 'text-slate-400'} hover:text-white transition cursor-pointer" title="Vista en tarjetas">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button id="viewListBtn" onclick="switchPortalView('list')" class="p-1.5 rounded-lg ${currentViewMode === 'list' ? 'text-blue-400 bg-slate-800' : 'text-slate-400'} hover:text-white transition cursor-pointer" title="Vista en tabla detallada">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

      </div>
    </div>

    <!-- GRID VIEW OF PROJECTS -->
    <div id="projectsGrid" class="${currentViewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}">
      ${renderProjectCardsHTML()}
    </div>

    <!-- TABLE VIEW (ALTERNATIVE VIEW) -->
    <div id="projectsTable" class="${currentViewMode === 'list' ? '' : 'hidden'} bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div class="overflow-x-auto custom-scroll">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="bg-slate-900/90 text-slate-400 uppercase text-[11px] font-semibold border-b border-slate-800">
            <tr>
              <th class="px-5 py-3.5">Proyecto & Empresa</th>
              <th class="px-4 py-3.5">Ubicación</th>
              <th class="px-4 py-3.5">Tipo</th>
              <th class="px-4 py-3.5 text-right">Presupuesto Base</th>
              <th class="px-4 py-3.5 text-center">Salud / Sobrecosto</th>
              <th class="px-4 py-3.5 text-center">Conceptos</th>
              <th class="px-4 py-3.5 text-center">Equipo</th>
              <th class="px-5 py-3.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody id="projectsTableBody" class="divide-y divide-slate-800/60">
            ${renderProjectTableRowsHTML()}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Empty State for Filters -->
    <div id="noResults" class="hidden text-center py-12 bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl">
      <svg class="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      <h4 class="text-white font-semibold text-base">No se encontraron proyectos</h4>
      <p class="text-xs text-slate-400 mt-1">Prueba con otros términos de búsqueda o limpia los filtros seleccionados.</p>
      <button onclick="resetProjectFilters()" class="mt-4 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium transition cursor-pointer">Limpiar Filtros</button>
    </div>

    <!-- Medidor de Cuota Unificada AWS S3 del Anfitrión -->
    <div id="portal-dashboard-storage-meter" class="mt-2"></div>
  `;

  refreshProjectsGridUI();
  mountStorageMeter('portal-dashboard-storage-meter', { showUpgradeButton: true }).catch(() => {});
}

export function getCompanyBadgeMeta(companyName) {
  const c = (companyName || '').toUpperCase();
  if (c.includes('HEMA')) {
    return { initials: 'HA', bg: 'bg-amber-900/30', border: 'border-amber-600/30', text: 'text-amber-300' };
  } else if (c.includes('METR') || c.includes('GCM')) {
    return { initials: 'GCM', bg: 'bg-blue-900/40', border: 'border-blue-500/40', text: 'text-blue-300' };
  } else if (c.includes('URBANIX') || c.includes('UBX')) {
    return { initials: 'UBX', bg: 'bg-emerald-900/40', border: 'border-emerald-500/40', text: 'text-emerald-300' };
  } else if (c.includes('OPUS')) {
    return { initials: 'OPUS', bg: 'bg-indigo-900/40', border: 'border-indigo-500/40', text: 'text-indigo-300' };
  } else {
    const words = (companyName || 'Constructora').split(/\s+/).filter(Boolean);
    const inits = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : ((companyName || 'OB').slice(0, 2).toUpperCase());
    return { initials: inits, bg: 'bg-slate-800/90', border: 'border-slate-700', text: 'text-blue-400' };
  }
}

export function renderMemberAvatarsModernHTML(members, projId) {
  if (!Array.isArray(members) || members.length === 0) {
    return `
      <div class="inline-block h-7 w-7 rounded-full ring-2 ring-slate-900 bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">CR</div>
      <div class="inline-block h-7 w-7 rounded-full ring-2 ring-slate-900 bg-amber-600 text-[10px] font-bold text-white flex items-center justify-center">JP</div>
    `;
  }
  const colors = ['bg-blue-600', 'bg-amber-600', 'bg-purple-600', 'bg-indigo-600', 'bg-emerald-600'];
  return members.slice(0, 3).map((m, idx) => {
    const inits = (m.name || 'US').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'US';
    const color = colors[idx % colors.length];
    if (m.avatar && !m.avatar.includes('ui-avatars')) {
      return `<img src="${m.avatar}" class="inline-block h-7 w-7 rounded-full ring-2 ring-slate-900 object-cover" title="${m.name} (${m.role || 'Colaborador'})">`;
    }
    return `<div class="inline-block h-7 w-7 rounded-full ring-2 ring-slate-900 ${color} text-[10px] font-bold text-white flex items-center justify-center" title="${m.name} (${m.role || 'Colaborador'})">${inits}</div>`;
  }).join('');
}

export function renderMemberAvatarsTableHTML(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return `
      <span class="w-6 h-6 rounded-full bg-blue-600 text-[9px] font-bold text-white flex items-center justify-center ring-1 ring-slate-900">CR</span>
      <span class="w-6 h-6 rounded-full bg-amber-600 text-[9px] font-bold text-white flex items-center justify-center ring-1 ring-slate-900">JP</span>
    `;
  }
  const colors = ['bg-blue-600', 'bg-amber-600', 'bg-purple-600', 'bg-indigo-600', 'bg-emerald-600'];
  const maxVisible = 3;
  const visible = members.slice(0, maxVisible);
  const extra = members.length - maxVisible;

  let html = visible.map((m, i) => {
    const inits = (m.name || 'US').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'US';
    return `<span class="w-6 h-6 rounded-full ${colors[i % colors.length]} text-[9px] font-bold text-white flex items-center justify-center ring-1 ring-slate-900" title="${m.name}">${inits}</span>`;
  }).join('');

  if (extra > 0) {
    html += `<span class="w-6 h-6 rounded-full bg-slate-700 text-[9px] font-bold text-slate-300 flex items-center justify-center ring-1 ring-slate-900">+${extra}</span>`;
  }
  return html;
}

export function renderMemberAvatarsHTML(members, projId) {
  return renderMemberAvatarsModernHTML(members, projId);
}

// ==========================================
// FILTROS, VISTA Y ORDENAMIENTO EN "MIS PROYECTOS"
// ==========================================
let currentSearchQuery = '';
let currentCompanyFilter = 'all';
let currentTipoObraFilter = 'all';
let currentStatusFilter = 'all'; // 'all' | 'ok' | 'warning'
let currentScopeFilter = 'owned'; // 'owned' (Mis Proyectos Propios) | 'owner:<email>' | 'all'
let currentSortMode = 'date-desc'; // 'date-desc' | 'date-asc' | 'az-asc' | 'az-desc'
let currentViewMode = 'grid'; // 'grid' | 'list'

export function setProjectScopeFilter(scope) {
  currentScopeFilter = scope || 'owned';
  const user = getCurrentUser();
  const uEmail = (user?.email || '').toLowerCase().trim();

  if (currentScopeFilter && currentScopeFilter.startsWith('owner:')) {
    const targetEmail = currentScopeFilter.replace('owner:', '').toLowerCase().trim();
    const allProjects = getProjectsForUser(user);
    const inviters = getWorkspaceInviters(user, allProjects);
    const inv = inviters.find(i => (i.email || '').toLowerCase().trim() === targetEmail);
    setActiveWorkspaceData(targetEmail, inv?.name || targetEmail);
  } else {
    setActiveWorkspaceData(uEmail, user?.name || uEmail);
  }

  updateSubscriptionBadgesUI();
  const actionArea = document.getElementById('portal-header-action-area');
  if (actionArea && user) {
    actionArea.innerHTML = renderHeaderCreateButtonHTML(user, currentScopeFilter);
  }
  const statusBadge = document.getElementById('mode-status-badge');
  if (statusBadge && user) {
    const allProjects = getProjectsForUser(user);
    const inviters = getWorkspaceInviters(user, allProjects);
    statusBadge.innerHTML = renderModeStatusBadgeHTML(currentScopeFilter, user, inviters, allProjects);
  }
  refreshProjectsGridUI();
}
export const setProjectDashboardMode = setProjectScopeFilter;

export function switchPortalView(view) {
  currentViewMode = view;
  const grid = document.getElementById('projectsGrid');
  const table = document.getElementById('projectsTable');
  const btnGrid = document.getElementById('viewGridBtn');
  const btnList = document.getElementById('viewListBtn');

  if (view === 'grid') {
    if (grid) grid.classList.remove('hidden');
    if (table) table.classList.add('hidden');
    if (btnGrid) {
      btnGrid.className = 'p-1.5 rounded-lg text-blue-400 bg-slate-800 hover:text-white transition cursor-pointer';
    }
    if (btnList) {
      btnList.className = 'p-1.5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer';
    }
  } else {
    if (grid) grid.classList.add('hidden');
    if (table) table.classList.remove('hidden');
    if (btnList) {
      btnList.className = 'p-1.5 rounded-lg text-blue-400 bg-slate-800 hover:text-white transition cursor-pointer';
    }
    if (btnGrid) {
      btnGrid.className = 'p-1.5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer';
    }
  }
}
export const switchView = switchPortalView;

export function toggleComparisonModal() {
  const modal = document.getElementById('comparisonModal');
  if (modal) {
    modal.classList.toggle('hidden');
  }
}

export function toggleCardMenu(id, e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById(id);
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  document.querySelectorAll('[id^="menu-card-"]').forEach(el => el.classList.add('hidden'));
  if (isHidden) {
    menu.classList.remove('hidden');
  }
}

export function onProjectSearchInput(value) {
  currentSearchQuery = (value || '').trim();
  refreshProjectsGridUI();
}

export function setCompanyFilter(company) {
  currentCompanyFilter = company || 'all';
  refreshProjectsGridUI();
}

export function setTipoObraFilter(tipo) {
  currentTipoObraFilter = tipo || 'all';
  refreshProjectsGridUI();
}

export function setStatusFilter(status) {
  currentStatusFilter = status || 'all';
  refreshProjectsGridUI();
}

export function toggleSort(field) {
  if (field === 'date') {
    currentSortMode = currentSortMode === 'date-desc' ? 'date-asc' : 'date-desc';
    showToast(currentSortMode === 'date-desc' ? 'Acomodado: Más recientes primero' : 'Acomodado: Más antiguos primero');
  } else if (field === 'name') {
    currentSortMode = currentSortMode === 'az-asc' ? 'az-desc' : 'az-asc';
    showToast(currentSortMode === 'az-asc' ? 'Acomodado: De la A a la Z' : 'Acomodado: De la Z a la A');
  }
  refreshProjectsGridUI();
}

export function toggleSortDate() {
  toggleSort('date');
}

export function toggleSortAZ() {
  toggleSort('name');
}

export function filterProjects() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) currentSearchQuery = searchInput.value.trim();

  const compSelect = document.getElementById('empresaFilter');
  if (compSelect) currentCompanyFilter = compSelect.value;

  const tipoSelect = document.getElementById('tipoFilter');
  if (tipoSelect) currentTipoObraFilter = tipoSelect.value;

  const statusSelect = document.getElementById('statusFilter');
  if (statusSelect) currentStatusFilter = statusSelect.value;

  refreshProjectsGridUI();
}

export function resetProjectFilters() {
  currentSearchQuery = '';
  currentCompanyFilter = 'all';
  currentTipoObraFilter = 'all';
  currentStatusFilter = 'all';
  currentSortMode = 'date-desc';

  const searchInput = document.getElementById('searchInput') || document.getElementById('project-search');
  if (searchInput) searchInput.value = '';

  const compSelect = document.getElementById('empresaFilter') || document.getElementById('filter-company-select');
  if (compSelect) compSelect.value = 'all';

  const tipoSelect = document.getElementById('tipoFilter') || document.getElementById('filter-tipo-select');
  if (tipoSelect) tipoSelect.value = 'all';

  const statusSelect = document.getElementById('statusFilter');
  if (statusSelect) statusSelect.value = 'all';

  refreshProjectsGridUI();
  showToast('Filtros restablecidos');
}
export const resetFilters = resetProjectFilters;

export function getFilteredProjectsList(allProjects) {
  let filtered = [...allProjects];

  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(p =>
      (p.projectName && p.projectName.toLowerCase().includes(q)) ||
      (p.companyName && p.companyName.toLowerCase().includes(q)) ||
      (p.projectLocation && p.projectLocation.toLowerCase().includes(q)) ||
      (p.tipoObra && p.tipoObra.toLowerCase().includes(q))
    );
  }

  if (currentCompanyFilter && currentCompanyFilter !== 'all') {
    filtered = filtered.filter(p => p.companyName && p.companyName.toLowerCase() === currentCompanyFilter.toLowerCase());
  }

  if (currentTipoObraFilter && currentTipoObraFilter !== 'all') {
    filtered = filtered.filter(p => p.tipoObra && p.tipoObra.toLowerCase() === currentTipoObraFilter.toLowerCase());
  }

  if (currentStatusFilter && currentStatusFilter !== 'all') {
    filtered = filtered.filter(p => {
      const factorNum = Number(p.factorSobrecosto || 1.2584);
      const sobrecostoNum = (factorNum - 1) * 100;
      const isWarning = sobrecostoNum > 10;
      return currentStatusFilter === 'warning' ? isWarning : !isWarning;
    });
  }

  // Filtro de alcance: Mis Proyectos Propios vs Proyectos donde fui Invitado
  if (currentScopeFilter && currentScopeFilter !== 'all') {
    const user = getCurrentUser();

    const uEmail = (user?.email || '').toLowerCase().trim();

    if (currentScopeFilter === 'owned') {
      filtered = filtered.filter(p => (p.ownerEmail || '').toLowerCase().trim() === uEmail);
    } else if (currentScopeFilter === 'invited') {
      filtered = filtered.filter(p => (p.ownerEmail || '').toLowerCase().trim() !== uEmail);
    } else if (currentScopeFilter.startsWith('owner:')) {
      const targetOwner = currentScopeFilter.replace('owner:', '').toLowerCase().trim();
      filtered = filtered.filter(p => (p.ownerEmail || '').toLowerCase().trim() === targetOwner);
    }
  }

  filtered.sort((a, b) => {
    if (currentSortMode === 'date-desc') {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    if (currentSortMode === 'date-asc') {
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    }
    if (currentSortMode === 'az-asc') {
      return (a.projectName || '').localeCompare(b.projectName || '', 'es', { sensitivity: 'base' });
    }
    if (currentSortMode === 'az-desc') {
      return (b.projectName || '').localeCompare(a.projectName || '', 'es', { sensitivity: 'base' });
    }
    return 0;
  });

  return filtered;
}

export function refreshProjectsGridUI() {
  const user = getCurrentUser();

  const allProjects = user ? getProjectsForUser(user) : getProjectsList();
  const invitersList = getWorkspaceInviters(user, allProjects);
  const filtered = getFilteredProjectsList(allProjects);

  const uEmail = (user?.email || '').toLowerCase().trim();
  const ownedProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === uEmail);
  const ownedCount = ownedProjects.length;
  const sub = (typeof getCurrentSubscription === 'function') ? getCurrentSubscription() : null;
  const userPlanId = sub?.planId || getUserPlanId(user);
  const userPlanLimits = getPlanLimits(userPlanId);

  // Sincronizar el selector de Modo / Espacio de Trabajo
  const modeSelect = document.getElementById('projectScopeModeSelect');
  if (modeSelect) {
    const desiredHTML = `
      <option value="owned" ${currentScopeFilter === 'owned' ? 'selected' : ''}>Mis proyectos</option>
      ${invitersList.map(inv => `
        <option value="owner:${inv.email}" ${currentScopeFilter === `owner:${inv.email}` ? 'selected' : ''}>${inv.name}</option>
      `).join('')}
      <option value="all" ${currentScopeFilter === 'all' ? 'selected' : ''}>Todos los proyectos</option>
    `.trim();

    const currentOptionsSign = Array.from(modeSelect.options).map(o => `${o.value}:${o.textContent.trim()}`).join('|');
    const newOptionsSign = `owned:Mis proyectos|${invitersList.map(inv => `owner:${inv.email}:${inv.name}`).join('|')}|all:Todos los proyectos`;

    if (currentOptionsSign !== newOptionsSign) {
      modeSelect.innerHTML = desiredHTML;
    }
    modeSelect.value = currentScopeFilter;
  }

  // Actualizar el indicador visual de estado y membresía
  const statusBadge = document.getElementById('mode-status-badge');
  if (statusBadge) {
    statusBadge.innerHTML = renderModeStatusBadgeHTML(currentScopeFilter, user, invitersList, allProjects);
  }

  // Actualizar el botón de acción principal de Nuevo Proyecto
  const headerActionArea = document.getElementById('portal-header-action-area');
  if (headerActionArea) {
    headerActionArea.innerHTML = renderHeaderCreateButtonHTML(user, currentScopeFilter);
  }

  const grid = document.getElementById('projectsGrid') || document.getElementById('projects-grid');
  if (grid) {
    grid.innerHTML = renderProjectCardsHTML(filtered, allProjects);
  }

  const tbody = document.getElementById('projectsTableBody');
  if (tbody) {
    tbody.innerHTML = renderProjectTableRowsHTML(filtered);
  }

  const counterEl = document.getElementById('activeProjectsCount') || document.getElementById('projects-counter-badge');
  if (counterEl) {
    counterEl.textContent = `${filtered.length} Obra${filtered.length === 1 ? '' : 's'}${currentScopeFilter === 'all' ? ' Total' : ''}`;
  }

  const noResults = document.getElementById('noResults');
  if (noResults) {
    if (allProjects.length > 0 && filtered.length === 0) {
      noResults.classList.remove('hidden');
      const titleEl = document.getElementById('noResultsTitle');
      const textEl = document.getElementById('noResultsText');
      const actEl = document.getElementById('noResultsActions');

      if (currentScopeFilter === 'owned') {
        if (titleEl) titleEl.textContent = 'Aún no tienes proyectos propios creados';
        if (textEl) textEl.textContent = 'En este modo se muestran las obras creadas bajo tu perfil y membresía activa. Puedes crear una nueva obra ahora.';
        if (actEl) {
          actEl.innerHTML = `
            <button onclick="openNuevoProyectoModal()" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs text-white font-bold transition shadow cursor-pointer">
              <i class="fa-solid fa-plus mr-1"></i> Crear Proyecto Propio
            </button>
          `;
        }
      } else if (currentScopeFilter && currentScopeFilter.startsWith('owner:')) {
        const inviterEmail = currentScopeFilter.replace('owner:', '').toLowerCase().trim();
        const hostInv = invitersList.find(i => (i.email || '').toLowerCase().trim() === inviterEmail);
        const hName = hostInv?.name || inviterEmail;
        if (titleEl) titleEl.textContent = `No hay proyectos visibles en el espacio de ${hName}`;
        if (textEl) textEl.textContent = 'No se encontraron obras asignadas o creadas para este anfitrión.';
        if (actEl) {
          actEl.innerHTML = `
            <button onclick="setProjectScopeFilter('owned')" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium transition cursor-pointer">
              Volver a Mis Proyectos Propios
            </button>
          `;
        }
      } else {
        if (titleEl) titleEl.textContent = 'No se encontraron proyectos';
        if (textEl) textEl.textContent = 'Prueba con otros términos de búsqueda o limpia los filtros seleccionados.';
        if (actEl) {
          actEl.innerHTML = `
            <button onclick="resetProjectFilters()" class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium transition cursor-pointer">Limpiar Filtros</button>
          `;
        }
      }
    } else {
      noResults.classList.add('hidden');
    }
  }

  updateSortButtonsUI();
}

function updateSortButtonsUI() {
  const dateBtn = document.getElementById('sortByDateBtn');
  const nameBtn = document.getElementById('sortByNameBtn');
  const dateDirSpan = document.getElementById('dateSortDir');
  const nameLabelSpan = document.getElementById('nameSortLabel');

  if (dateBtn && dateDirSpan) {
    if (currentSortMode.startsWith('date')) {
      dateBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-400 bg-slate-800 hover:text-white transition flex items-center gap-1 shadow-sm cursor-pointer';
      dateDirSpan.textContent = currentSortMode === 'date-desc' ? '↓' : '↑';
    } else {
      dateBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition flex items-center gap-1 cursor-pointer';
    }
  }

  if (nameBtn && nameLabelSpan) {
    if (currentSortMode.startsWith('az')) {
      nameBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-400 bg-slate-800 hover:text-white transition flex items-center gap-1 shadow-sm cursor-pointer';
      nameLabelSpan.textContent = currentSortMode === 'az-desc' ? 'Z - A' : 'A - Z';
    } else {
      nameBtn.className = 'px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition flex items-center gap-1 cursor-pointer';
    }
  }
}

export function renderCompanyOptionsHTML(projects) {
  const list = projects || getProjectsList();
  const companies = Array.from(new Set(list.map(p => (p.companyName || '').trim()).filter(Boolean)));
  companies.sort((a, b) => a.localeCompare(b, 'es'));
  return companies.map(c => `
    <option value="${c.replace(/"/g, '&quot;')}" ${currentCompanyFilter.toLowerCase() === c.toLowerCase() ? 'selected' : ''}>
      ${c}
    </option>
  `).join('');
}

export function renderProjectCardsHTML(customFiltered, customAll) {
  const user = getCurrentUser();

  const allProjects = customAll || (user ? getProjectsForUser(user) : getProjectsList());
  if (allProjects.length === 0) {
    const createCheck = canUserCreateProject(user);
    const userCanCreate = Boolean(createCheck?.allowed);
    return `
      <div class="col-span-full bg-slate-950/70 rounded-3xl border border-slate-800 p-12 text-center space-y-3">
        <div class="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center text-2xl mx-auto border border-blue-500/20">
          <i class="fa-solid fa-folder-open"></i>
        </div>
        <h3 class="font-bold text-base text-white">Aún no tienes proyectos asignados ni creados</h3>
        <p class="text-xs text-slate-400 max-w-sm mx-auto">
          ${userCanCreate 
            ? 'Crea tu primer proyecto para comenzar a registrar partidas, APU e insumos con configuración personalizada.' 
            : 'En cuanto seas invitado y aceptes una invitación a un proyecto, aparecerá listado aquí.'}
        </p>
        ${userCanCreate ? `
          <button onclick="openNuevoProyectoModal()" class="mt-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow transition cursor-pointer">
            <i class="fa-solid fa-plus mr-1"></i> Crear Proyecto Ahora
          </button>
        ` : `
          <button onclick="openSubscriptionModal()" class="mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow transition cursor-pointer">
            <i class="fa-solid fa-crown mr-1 text-amber-300"></i> Ver Planes de Suscripción Plus y Pro
          </button>
        `}
      </div>
    `;
  }

  const filtered = customFiltered || getFilteredProjectsList(allProjects);

  if (filtered.length === 0) {
    return '';
  }

  return filtered.map(proj => {
    const factorNum = Number(proj.factorSobrecosto || 1.2584);
    const sobrecostoNum = (factorNum - 1) * 100;
    const isWarning = sobrecostoNum > 10;
    const sobrecostoFormatted = Math.abs(sobrecostoNum).toFixed(2);
    const badgeMeta = getCompanyBadgeMeta(proj.companyName);

    let sobrecostoBadge = '';
    if (isWarning) {
      sobrecostoBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse" title="Alerta: Desviación presupuestal del +${sobrecostoFormatted}%">
          <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          Sobrecosto: +${sobrecostoFormatted}%
        </span>
      `;
    } else if (Math.abs(sobrecostoNum) < 0.05) {
      sobrecostoBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Proyecto dentro del presupuesto base">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Sobrecosto: 0.00%
        </span>
      `;
    } else {
      sobrecostoBadge = `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20" title="Sobrecosto registrado">
          Sobrecosto: ${sobrecostoFormatted}%
        </span>
      `;
    }

    const estSummary = calculateProjectTotalEstimacionesSummary(proj.id, proj.totalPresupuesto);
    const sym = proj.currencySymbol || '$';
    const totalEstimadoFmt = `${sym}${estSummary.totalEstimado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pctEstimadoFmt = `${estSummary.pctAvance.toFixed(2)}%`;
    const progressVal = estSummary.barWidthPct;

    return `
    <div class="project-card group bg-slate-950/70 hover:bg-slate-950/90 border border-slate-800/90 ${isWarning ? 'hover:border-amber-500/50' : 'hover:border-blue-500/50'} rounded-2xl p-5 transition duration-200 shadow-lg flex flex-col justify-between"
         data-name="${(proj.projectName || '').replace(/"/g, '&quot;')}" 
         data-company="${(proj.companyName || '').replace(/"/g, '&quot;')}" 
         data-type="${proj.tipoObra || 'Edificación'}" 
         data-status="${isWarning ? 'warning' : 'ok'}"
         data-date="${proj.createdAt || '2026-01-01'}">
      
      <div>
        <!-- Header Card: Company, Tag & Dropdown Menu -->
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 rounded-xl ${badgeMeta.bg} border ${badgeMeta.border} flex items-center justify-center ${badgeMeta.text} font-bold text-sm tracking-wider shadow-inner shrink-0 overflow-hidden p-0.5">
              ${proj.companyLogo ? `<img src="${proj.companyLogo}" class="w-full h-full max-w-full max-h-full object-contain rounded-lg">` : badgeMeta.initials}
            </div>
            <div class="min-w-0 flex-1">
              <span class="text-xs font-semibold text-blue-400 tracking-wide uppercase block truncate">${proj.companyName}</span>
              <h3 class="text-lg font-bold text-white ${isWarning ? 'group-hover:text-amber-300' : 'group-hover:text-blue-300'} transition truncate" title="${proj.projectName}">${proj.projectName}</h3>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
              ${proj.tipoObra || 'Edificación'}
            </span>
            <!-- Quick 3-Dots Action Menu -->
            <div class="relative">
              <button onclick="toggleCardMenu('menu-card-${proj.id}', event)" class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer" title="Opciones de proyecto">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
              </button>
              <div id="menu-card-${proj.id}" class="hidden absolute right-0 mt-1 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl z-30 py-1 text-xs">
                <button type="button" onclick="openProjectInNewTab('${proj.id}')" class="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer">
                  <i class="fa-solid fa-arrow-up-right-from-square text-[10px] text-blue-400"></i>
                  <span>Abrir en pestaña nueva</span>
                </button>
                <button type="button" onclick="duplicateProjectAction('${proj.id}')" class="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer">
                  <i class="fa-solid fa-copy text-[10px] text-amber-400"></i>
                  <span>Duplicar Presupuesto</span>
                </button>
                <button type="button" onclick="exportProjectToExcelAction('${proj.id}')" class="w-full text-left px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer">
                  <i class="fa-solid fa-file-excel text-[10px] text-emerald-400"></i>
                  <span>Exportar a Excel</span>
                </button>
                <button type="button" onclick="syncProjectToCloudAction('${proj.id}', event)" class="w-full text-left px-3 py-2 text-blue-300 hover:bg-slate-800 hover:text-white flex items-center gap-2 cursor-pointer" title="Sincronizar a Supabase PostgreSQL">
                  <i class="fa-solid fa-cloud-arrow-up text-[10px] text-blue-400"></i>
                  <span>Respaldar en la Nube</span>
                </button>
                <div class="h-px bg-slate-800 my-1"></div>
                <button type="button" onclick="deleteProjectAction('${proj.id}')" class="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 cursor-pointer">
                  <i class="fa-solid fa-trash-can text-[10px]"></i>
                  <span>Eliminar Proyecto</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Metadata: Ubicación, Fecha y Etiqueta de Origen/Permiso -->
        <div class="flex flex-wrap items-center justify-between gap-y-1 gap-x-3 text-xs text-slate-400 mb-4 pb-3 border-b border-slate-800/80">
          <div class="flex items-center gap-3 min-w-0">
            <span class="flex items-center gap-1.5 text-slate-300 truncate max-w-[200px]" title="${proj.projectLocation}">
              <svg class="w-3.5 h-3.5 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span class="truncate">${proj.projectLocation || 'Sin ubicación'}</span>
            </span>
            <span class="flex items-center gap-1.5 shrink-0 hidden sm:flex">
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>${proj.createdAt || '---'}</span>
            </span>
          </div>

          <!-- Indicador de Mi Proyecto Propio vs Obra Invitada con Rol Asignado -->
          ${(() => {
            const uEmail = (user?.email || '').toLowerCase().trim();
            const isOwner = (proj.ownerEmail || '').toLowerCase().trim() === uEmail;
            if (isOwner) {
              return `
                <div class="flex items-center gap-1.5">
                  ${proj.isCloudSynced ? `
                    <span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1" title="Sincronizado con Supabase PostgreSQL">
                      <i class="fa-solid fa-cloud text-[9px]"></i> Nube
                    </span>
                  ` : ''}
                  <span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1" title="Proyecto propio creado bajo tu membresía">
                    <i class="fa-solid fa-crown text-[9px]"></i> Mi Proyecto
                  </span>
                </div>
              `;
            }
            const myMem = Array.isArray(proj.members) ? proj.members.find(m => (m.email || '').toLowerCase().trim() === uEmail) : null;
            const role = myMem?.role || 'editar';
            const roleBadgeMap = {
              editar: '<span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1" title="Invitado con rol Editor (Control total de catálogo y equipo)"><i class="fa-solid fa-pen-ruler text-[9px]"></i> Invitado: Editor</span>',
              escribir: '<span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1" title="Invitado con rol Escribir (Captura de conceptos e insumos)"><i class="fa-solid fa-pen-to-square text-[9px]"></i> Invitado: Escribir</span>',
              leer: '<span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1" title="Invitado con rol Leer (Solo consulta y reportes)"><i class="fa-solid fa-eye text-[9px]"></i> Invitado: Leer</span>'
            };
            return roleBadgeMap[role] || roleBadgeMap.editar;
          })()}
        </div>

        <!-- Metrics Panel: Budget, Concepts & Cost overrun badge -->
        <div class="bg-slate-900/90 rounded-xl p-3.5 mb-4 border border-slate-800/80">
          <div class="flex items-baseline justify-between mb-2">
            <span class="text-xs text-slate-400 font-medium">Presupuesto Base</span>
            <div class="text-right">
              <span class="text-lg font-black text-white">${proj.currencySymbol || '$'}${Number(proj.totalPresupuesto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span class="text-xs font-semibold ${proj.currency === 'USD' ? 'text-emerald-400' : 'text-blue-400'} ml-1">${proj.currency || 'MXN'}</span>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="space-y-1 mb-2.5">
            <div class="flex justify-between text-[11px] text-slate-400">
              <span>Avance estimado</span>
              <span class="font-mono ${estSummary.totalEstimado > 0 ? (isWarning ? 'text-amber-400' : 'text-emerald-400') : 'text-slate-400'} font-semibold" title="Suma de todas las Estimaciones registradas">${totalEstimadoFmt} <span class="opacity-85">(${pctEstimadoFmt})</span></span>
            </div>
            <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div class="${isWarning ? 'bg-amber-500' : 'bg-emerald-500'} h-full rounded-full transition-all duration-300" style="width: ${progressVal}%"></div>
            </div>
          </div>

          <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-800/60">
            <span class="text-slate-400 flex items-center gap-1">
              <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              ${proj.conceptCount || 0} conceptos APU
            </span>
            ${sobrecostoBadge}
          </div>
        </div>
      </div>

      <!-- Footer: Team & Main Clean Action -->
      <div class="flex items-center justify-between pt-2">
        <!-- Stacked Team Avatars -->
        <div class="flex items-center gap-2">
          <div class="flex -space-x-2 overflow-hidden">
            ${renderMemberAvatarsModernHTML(proj.members, proj.id)}
          </div>
          ${canUserInviteToProject(proj.id, user).allowed ? `
            <button type="button" onclick="openInviteModal('${proj.id}')" class="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 hover:underline cursor-pointer" title="Invitar colaboradores al proyecto">
              + Invitar
            </button>
          ` : ''}
        </div>

        <!-- Main Clear CTA -->
        <button type="button" onclick="openProjectInWorkspace('${proj.id}')" class="px-4 py-2 rounded-xl ${isWarning ? 'bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 group-hover:bg-amber-500 group-hover:text-slate-950' : 'bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 group-hover:bg-blue-600 group-hover:text-white'} text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer">
          <span>Abrir Proyecto</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </button>
      </div>

    </div>
    `;
  }).join('');
}

export function renderProjectTableRowsHTML(filteredProjects) {
  const user = getCurrentUser();

  const allProjects = user ? getProjectsForUser(user) : getProjectsList();
  const list = filteredProjects || getFilteredProjectsList(allProjects);

  if (list.length === 0) {
    return `
      <tr>
        <td colspan="8" class="text-center py-8 text-slate-500 text-xs">
          No se encontraron proyectos para mostrar en la tabla.
        </td>
      </tr>
    `;
  }

  return list.map(proj => {
    const factorNum = Number(proj.factorSobrecosto || 1.2584);
    const sobrecostoNum = (factorNum - 1) * 100;
    const isWarning = sobrecostoNum > 10;
    const sobrecostoFormatted = Math.abs(sobrecostoNum).toFixed(2);

    return `
      <tr class="table-project-row hover:bg-slate-900/50 transition"
          data-name="${(proj.projectName || '').replace(/"/g, '&quot;')}" 
          data-company="${(proj.companyName || '').replace(/"/g, '&quot;')}" 
          data-type="${proj.tipoObra || 'Edificación'}" 
          data-status="${isWarning ? 'warning' : 'ok'}"
          data-date="${proj.createdAt || '2026-01-01'}">
        <td class="px-5 py-4">
          <div class="font-bold text-white text-sm hover:text-blue-400 cursor-pointer transition" onclick="openProjectInWorkspace('${proj.id}')">${proj.projectName}</div>
          <div class="text-[11px] text-blue-400 font-medium">${proj.companyName}</div>
        </td>
        <td class="px-4 py-4 text-slate-400 max-w-xs truncate" title="${proj.projectLocation}">
          ${proj.projectLocation || 'Sin ubicación'}
        </td>
        <td class="px-4 py-4">
          <span class="px-2 py-0.5 rounded-full text-[11px] bg-blue-500/10 text-blue-300 border border-blue-500/20">${proj.tipoObra || 'Edificación'}</span>
        </td>
        <td class="px-4 py-4 text-right font-mono font-bold text-white whitespace-nowrap">
          ${proj.currencySymbol || '$'}${Number(proj.totalPresupuesto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="text-[10px] text-slate-400">${proj.currency || 'MXN'}</span>
        </td>
        <td class="px-4 py-4 text-center whitespace-nowrap">
          ${isWarning ? `
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              +${sobrecostoFormatted}%
            </span>
          ` : `
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              0.00%
            </span>
          `}
        </td>
        <td class="px-4 py-4 text-center text-slate-400 whitespace-nowrap">${proj.conceptCount || 0} APUs</td>
        <td class="px-4 py-4 text-center">
          <div class="flex justify-center -space-x-1.5 overflow-hidden py-0.5">
            ${renderMemberAvatarsTableHTML(proj.members)}
          </div>
        </td>
        <td class="px-5 py-4 text-right whitespace-nowrap">
          <button onclick="openProjectInWorkspace('${proj.id}')" class="px-3 py-1.5 rounded-lg ${isWarning ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-blue-600 hover:bg-blue-500 text-white'} font-medium text-xs transition cursor-pointer">Abrir</button>
        </td>
      </tr>
    `;
  }).join('');
}

export function exportProjectToExcelAction(projectId) {
  const p = getProjectById(projectId);
  if (!p) {
    showToast('No se encontró el proyecto para exportar', false);
    return;
  }

  let tree = [];
  try {
    const raw = localStorage.getItem(`adm_const_tree_${projectId}`);
    if (raw) tree = JSON.parse(raw);
  } catch (e) {}

  if (!tree || tree.length === 0) {
    showToast('El proyecto seleccionado no contiene conceptos cargados para exportar.', false);
    return;
  }

  try {
    const rows = [];
    rows.push(['Clave', 'Nivel', 'Descripción', 'Unidad', 'Cantidad', 'Precio Unitario', 'Importe Total']);

    function walk(nodes, lvl) {
      for (const node of nodes) {
        rows.push([
          node.clave || '',
          lvl,
          node.descripcion || '',
          node.unidad || '',
          Number(node.cantidad || 0),
          Number(node.precioUnitario || 0),
          Number(node.total || (node.cantidad * node.precioUnitario) || 0)
        ]);
        if (Array.isArray(node.children) && node.children.length > 0) {
          walk(node.children, lvl + 1);
        }
      }
    }
    walk(tree, 1);

    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto Base');
      const cleanName = (p.projectName || 'Proyecto').replace(/[^a-zA-Z0-9_-]/g, '_');
      const excelName = `${cleanName}_Presupuesto.xlsx`;
      XLSX.writeFile(wb, excelName);
      archiveGeneratedWorkbookReport(XLSX, wb, excelName, {
        modulo: 'reportes',
        entidadId: 'portal_presupuesto_excel',
        proyectoId: p.id || getActiveProjectId(),
        metadata: { tipo: 'portal_presupuesto' }
      });
      showToast(`Proyecto "${p.projectName}" exportado a Excel exitosamente.`);
    } else {
      showToast('Descargando archivo Excel del proyecto...');
    }
  } catch (err) {
    console.error('Error exportando Excel:', err);
    showToast('Ocurrió un error al exportar el archivo Excel', false);
  }
}

export function filterProjectCards(query) {
  onProjectSearchInput(query);
}

// ==========================================
// ACCIONES DE NAVEGACIÓN Y APERTURA DE OBRAS
// ==========================================
export function openProjectInWorkspace(projectId) {
  // Redirigir en la misma pestaña con parámetro ?project=ID
  const url = `${window.location.pathname}?project=${encodeURIComponent(projectId)}`;
  window.location.href = url;
}

export function openProjectInNewTab(projectId) {
  const url = `${window.location.pathname}?project=${encodeURIComponent(projectId)}`;
  window.open(url, '_blank');
  showToast('Proyecto abierto en una nueva pestaña del navegador');
}

export function goToProjectsDashboard() {
  persistLocalData(true);
  const user = getCurrentUser();

  if (!user) {
    showPortalView('login');
    return;
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('project');
    window.history.pushState({}, '', url.pathname + (url.search || ''));
    if (currentScopeFilter && currentScopeFilter.startsWith('owner:')) {
      const targetEmail = currentScopeFilter.replace('owner:', '').toLowerCase().trim();
      setActiveWorkspaceData(targetEmail);
    } else if (user) {
      setActiveWorkspaceData(user.email, user.name || user.email);
    }
  } catch (e) {}
  setActiveProjectId(null);
  showPortalView('dashboard');
}

export function duplicateProjectAction(projectId) {
  const p = getProjectById(projectId);
  if (!p) return;
  const user = getCurrentUser();
  const uEmail = (user?.email || '').toLowerCase().trim();
  const isOwner = (p.ownerEmail || '').toLowerCase().trim() === uEmail;
  const myMem = Array.isArray(p.members) ? p.members.find(m => (m.email || '').toLowerCase().trim() === uEmail) : null;
  const isEditor = isOwner || myMem?.role === 'editar' || user?.role === 'Admin General';

  if (!isEditor) {
    showToast('🔒 Solo el propietario o colaboradores con rol de Editor pueden duplicar proyectos.', 'warning');
    return;
  }

  const dup = duplicateProject(projectId);
  if (dup) {
    showToast(`Proyecto "${dup.projectName}" duplicado exitosamente`);
    renderPortalDashboard();
    renderSidebarNotificationsUI();
  }
}

export function deleteProjectAction(projectId) {
  const p = getProjectById(projectId);
  if (!p) return;
  const user = getCurrentUser();
  const uEmail = (user?.email || '').toLowerCase().trim();
  const isOwner = (p.ownerEmail || '').toLowerCase().trim() === uEmail;
  const myMem = Array.isArray(p.members) ? p.members.find(m => (m.email || '').toLowerCase().trim() === uEmail) : null;
  const isEditor = isOwner || myMem?.role === 'editar' || user?.role === 'Admin General';

  if (!isEditor) {
    showToast('🔒 Solo el propietario o colaboradores con rol de Editor pueden eliminar este proyecto.', 'warning');
    return;
  }

  if (!confirm(`¿Deseas eliminar el proyecto "${p.projectName}"? Esta acción eliminará su catálogo y configuración.`)) return;
  deleteProject(projectId);
  showToast('Proyecto eliminado', false);
  renderPortalDashboard();
}

// ==========================================
// ASISTENTE NUEVO PROYECTO (WIZARD 2 PASOS)
// ==========================================
export const openNewProjectModal = openNuevoProyectoModal;
export function openNuevoProyectoModal() {
  const user = getCurrentUser();

  const check = canUserCreateProject(user, currentScopeFilter);
  if (!check.allowed) {
    showToast(`🔒 ${check.reason || 'No es posible crear más proyectos.'}`, 'warning');
    if (!check.isHostContext) {
      openSubscriptionModal();
    }
    return;
  }

  wizardData.step = 1;
  wizardData.logo = '';
  clearWizardLogo();
  
  const cName = document.getElementById('wiz-company-name');
  const pName = document.getElementById('wiz-project-name');
  const pLoc = document.getElementById('wiz-project-location');
  const pTipo = document.getElementById('wiz-project-tipo');
  const pDate = document.getElementById('wiz-project-created-at');
  if (cName) cName.value = check.isHostContext ? (check.hostName || '') : '';
  if (pName) pName.value = '';
  if (pLoc) pLoc.value = '';
  if (pTipo) pTipo.value = 'Edificación';
  if (pDate) pDate.value = new Date().toISOString().slice(0, 10);

  const subTitle = document.getElementById('wiz-subtitle-text');
  if (subTitle) {
    if (check.isHostContext) {
      subTitle.innerHTML = `<span class="text-emerald-300 font-bold">🏢 Creando obra para ${check.hostName}</span> • Plan ${getPlanLimits(check.planId).name}`;
    } else {
      subTitle.textContent = 'Asistente de configuración inicial en 2 pasos';
    }
  }
  
  const radioBlank = document.querySelector('input[name="wiz-template"][value="blank"]');
  if (radioBlank) {
    radioBlank.checked = true;
  }
  updateTemplateSelection();

  goToWizardStep(1);
  const modal = document.getElementById('modal-nuevo-proyecto');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closeNuevoProyectoModal() {
  const modal = document.getElementById('modal-nuevo-proyecto');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function goToWizardStep(step) {
  wizardData.step = step;
  const s1 = document.getElementById('wizard-step-1');
  const s2 = document.getElementById('wizard-step-2');
  const ind1 = document.getElementById('step-indicator-1');
  const ind2 = document.getElementById('step-indicator-2');
  const btnPrev = document.getElementById('btn-wiz-prev');
  const btnNext = document.getElementById('btn-wiz-next');
  const btnFinish = document.getElementById('btn-wiz-finish');

  if (step === 1) {
    if (s1) s1.classList.remove('hidden');
    if (s2) s2.classList.add('hidden');
    if (ind1) ind1.className = "flex items-center gap-2";
    if (ind2) ind2.className = "flex items-center gap-2 opacity-50";
    if (btnPrev) btnPrev.classList.add('hidden');
    if (btnNext) btnNext.classList.remove('hidden');
    if (btnFinish) btnFinish.classList.add('hidden');
  } else {
    const company = document.getElementById('wiz-company-name').value.trim();
    const project = document.getElementById('wiz-project-name').value.trim();
    const location = document.getElementById('wiz-project-location').value.trim();
    if (!company || !project || !location) {
      alert('Por favor completa el Nombre de Empresa, Nombre de Proyecto y Ubicación antes de avanzar.');
      return;
    }

    if (s1) s1.classList.add('hidden');
    if (s2) s2.classList.remove('hidden');
    if (ind1) ind1.className = "flex items-center gap-2 opacity-50";
    if (ind2) ind2.className = "flex items-center gap-2";
    if (btnPrev) btnPrev.classList.remove('hidden');
    if (btnNext) btnNext.classList.add('hidden');
    if (btnFinish) btnFinish.classList.remove('hidden');
    updateWizardFactorPreview();
  }
}

export async function handleWizardLogoFile(e) {
  const inputEl = e?.target;
  const file = inputEl?.files?.[0];
  if (!file) return;
  try {
    const res = await processPortalImageUpload(file, { modulo: 'branding', preset: 'branding' });
    setWizardLogoImage(res.dataUrl);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

export function setSampleLogo(type) {
  setWizardLogoImage(SAMPLE_LOGOS[type]);
}

export function setWizardLogoImage(src) {
  wizardData.logo = src;
  const img = document.getElementById('wizard-logo-img');
  const fb = document.getElementById('wizard-logo-fallback');
  if (img) {
    img.src = src;
    img.classList.remove('hidden');
  }
  if (fb) {
    fb.classList.add('hidden');
    fb.style.display = 'none';
  }
}

export function clearWizardLogo() {
  wizardData.logo = '';
  const img = document.getElementById('wizard-logo-img');
  const fb = document.getElementById('wizard-logo-fallback');
  if (img) { img.src = ''; img.classList.add('hidden'); }
  if (fb) {
    fb.classList.remove('hidden');
    fb.style.display = '';
  }
}

export function onWizardCurrencyChange(val) {
  const sel = document.getElementById('wiz-currency-select');
  const sym = document.getElementById('wiz-currency-symbol');
  if (!sel || !sym) return;
  const opt = sel.options[sel.selectedIndex];
  sym.value = opt.dataset.sym || '$';
}

export function updateWizardFactorPreview() {
  const applyEl = document.getElementById('wiz-apply-sobrecosto');
  const apply = applyEl ? applyEl.checked : true;
  const ind = parseFloat(document.getElementById('wiz-indirectos')?.value || 0);
  const fin = parseFloat(document.getElementById('wiz-financiamiento')?.value || 0);
  const uti = parseFloat(document.getElementById('wiz-utilidad')?.value || 0);
  const adi = parseFloat(document.getElementById('wiz-adicionales')?.value || 0);
  const seg = parseFloat(document.getElementById('wiz-seguros-fianzas')?.value || 0);

  const f = apply ? (1 + ind/100) * (1 + fin/100) * (1 + uti/100) * (1 + adi/100) * (1 + seg/100) : 1.0;
  const pct = ((f - 1) * 100).toFixed(2);
  const previewEl = document.getElementById('wiz-factor-preview');
  if (previewEl) previewEl.innerText = `${f.toFixed(4)} (+${pct}%)`;
}

export function updateTemplateSelection() {
  const checked = document.querySelector('input[name="wiz-template"]:checked');
  const val = checked ? checked.value : 'blank';
  const lblDemo = document.getElementById('lbl-tpl-demo');
  const lblBlank = document.getElementById('lbl-tpl-blank');
  if (!lblDemo || !lblBlank) return;
  if (val === 'blank') {
    lblBlank.className = "p-2.5 bg-slate-50 border-2 border-blue-500 rounded-lg cursor-pointer flex items-start gap-2 select-none";
    lblDemo.className = "p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer flex items-start gap-2 select-none";
  } else {
    lblDemo.className = "p-2.5 bg-slate-50 border-2 border-blue-500 rounded-lg cursor-pointer flex items-start gap-2 select-none";
    lblBlank.className = "p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer flex items-start gap-2 select-none";
  }
}

export async function finalizeCreateProject() {
  const company = document.getElementById('wiz-company-name').value.trim();
  const project = document.getElementById('wiz-project-name').value.trim();
  const location = document.getElementById('wiz-project-location').value.trim();
  const tipoObra = (document.getElementById('wiz-project-tipo') && document.getElementById('wiz-project-tipo').value) || 'Edificación';
  const createdAt = (document.getElementById('wiz-project-created-at') && document.getElementById('wiz-project-created-at').value) || new Date().toISOString().slice(0, 10);
  const currency = document.getElementById('wiz-currency-select').value;
  const symbol = document.getElementById('wiz-currency-symbol').value.trim();
  const apply = document.getElementById('wiz-apply-sobrecosto').checked;
  const ind = parseFloat(document.getElementById('wiz-indirectos')?.value) || 0;
  const fin = parseFloat(document.getElementById('wiz-financiamiento')?.value) || 0;
  const uti = parseFloat(document.getElementById('wiz-utilidad')?.value) || 0;
  const adi = parseFloat(document.getElementById('wiz-adicionales')?.value) || 0;
  const segVal = parseFloat(document.getElementById('wiz-seguros-fianzas')?.value);
  const seg = isNaN(segVal) ? 1.00 : segVal;
  const fasarVal = parseFloat(document.getElementById('wiz-fasar')?.value);
  const fasar = isNaN(fasarVal) ? 70.00 : fasarVal;
  const tplEl = document.querySelector('input[name="wiz-template"]:checked');
  const tpl = tplEl ? tplEl.value : 'blank';

  const user = getCurrentUser();

  const check = canUserCreateProject(user, currentScopeFilter);
  if (!check.allowed) {
    showToast(`🔒 ${check.reason || 'No es posible crear más proyectos.'}`, 'warning');
    if (!check.isHostContext) {
      openSubscriptionModal();
    }
    return;
  }

  let sampleTree = null;
  if (tpl === 'demo') {
    showToast('Importando catálogo base de muestra (Proyecto Residencial APU)...', 'info');
    try {
      sampleTree = await loadSampleResidentialZipCatalog();
    } catch (e) {
      console.warn('[NewProject] Error al importar paquete zip de muestra:', e);
    }
  }

  const projPayload = {
    companyName: company || (check.isHostContext ? check.hostName : 'Constructora'),
    companyLogo: wizardData.logo,
    projectName: project,
    projectLocation: location,
    tipoObra: tipoObra,
    createdAt: createdAt,
    currency,
    currencySymbol: symbol,
    applySobrecosto: apply,
    pctIndirectos: ind,
    pctFinanciamiento: fin,
    pctUtilidad: uti,
    pctAdicionales: adi,
    pctSegurosFianzas: seg,
    pctFasar: fasar,
    template: tpl,
    treeData: sampleTree
  };

  if (check.isHostContext && check.hostEmail) {
    projPayload.ownerEmail = check.hostEmail;
    projPayload.ownerPlanId = check.planId;
    projPayload.hostName = check.hostName;
  }

  const newProj = createNewProject(projPayload);

  try {
    if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
      window.syncUserCollaborationToCloud(user);
    }
  } catch (_) {}

  // Sincronizar en segundo plano a Supabase PostgreSQL
  try {
    const rawTree = localStorage.getItem(`adm_const_tree_${newProj.id}`);
    const rawSettings = localStorage.getItem(`adm_const_settings_${newProj.id}`);
    const pTree = rawTree ? JSON.parse(rawTree) : [];
    const pSettings = rawSettings ? JSON.parse(rawSettings) : projPayload;
    syncProjectToCloud(newProj, pSettings, pTree).then(res => {
      if (res && res.success) {
        newProj.isCloudSynced = true;
        console.info('[CloudSync] Nuevo proyecto respaldado en Supabase con ID:', res.projectId);
      }
    }).catch(err => console.warn('[CloudSync] Aviso al respaldar nuevo proyecto:', err));
  } catch (_) {}

  closeNuevoProyectoModal();
  if (check.isHostContext) {
    showToast(`¡Proyecto "${newProj.projectName}" creado con éxito bajo la cuenta de ${check.hostName}!`);
  } else {
    showToast('¡Proyecto creado con éxito! Abriendo espacio de trabajo...');
  }
  openProjectInWorkspace(newProj.id);
}

/**
 * Acción manual para sincronizar un proyecto existente hacia Supabase
 */
export async function syncProjectToCloudAction(projectId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const proj = getProjectById(projectId);
  if (!proj) {
    showToast('Proyecto no encontrado', 'error');
    return;
  }

  showToast(`☁️ Respaldando "${proj.projectName}" en Supabase...`, 'info');
  try {
    let tree = [];
    let settings = {};
    const rawT = localStorage.getItem(`adm_const_tree_${projectId}`);
    const rawS = localStorage.getItem(`adm_const_settings_${projectId}`);
    if (rawT) tree = JSON.parse(rawT);
    if (rawS) settings = JSON.parse(rawS);

    const res = await syncProjectToCloud(proj, settings, tree);
    if (res && res.success) {
      proj.isCloudSynced = true;
      const list = getProjectsList();
      const idx = list.findIndex(p => p.id === projectId);
      if (idx !== -1) {
        list[idx].isCloudSynced = true;
        saveProjectsList(list);
      }
      refreshProjectsGridUI();
      showToast(`✅ "${proj.projectName}" respaldado en Supabase con éxito`, 'success');
    } else {
      showToast(`Aviso al respaldar: ${res.reason || 'Verifique sesión'}`, 'warning');
    }
  } catch (err) {
    console.error('[CloudSync] Error manual:', err);
    showToast('Error al conectar con Supabase: ' + err.message, 'error');
  }
}

// ==========================================
// MODAL: PERFIL DE USUARIO
// ==========================================
export function openProfileModal() {
  const u = getCurrentUser();
  if (!u) {
    showPortalView('login');
    return;
  }

  const n = document.getElementById('profile-edit-name');
  const e = document.getElementById('profile-edit-email');
  const s = document.getElementById('profile-edit-sexo');
  const d = document.getElementById('profile-edit-dob');
  const a = document.getElementById('profile-edit-avatar-img');

  if (n) n.value = u.name;
  if (e) e.value = u.email;
  if (s) s.value = u.sexo || 'Masculino';
  if (d) d.value = u.dob || '1992-06-15';
  const fallbackAvatar = (AVATARS_BY_SEX && (AVATARS_BY_SEX[u.sexo] || AVATARS_BY_SEX['Masculino'])) || 'assets/branding/cubikar_icon_transparent.png?v=4';
  const safeAvatar = (typeof u.avatar === 'string' && u.avatar.trim() && u.avatar !== 'undefined' && u.avatar !== 'null') ? u.avatar : fallbackAvatar;
  if (a) a.src = safeAvatar;
  updateSubscriptionBadgesUI({ refreshGrid: false });

  const modal = document.getElementById('modal-perfil-usuario');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  mountStorageMeter('profile-modal-storage-meter', { showUpgradeButton: false }).catch(() => {});
}

export function closeProfileModal() {
  const modal = document.getElementById('modal-perfil-usuario');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function onProfileEditSexoChange(sexo) {
  const u = getCurrentUser();
  if (!u) return;
  if (Object.values(AVATARS_BY_SEX).includes(u.avatar)) {
    u.avatar = AVATARS_BY_SEX[sexo] || AVATARS_BY_SEX['Masculino'];
    const a = document.getElementById('profile-edit-avatar-img');
    if (a) a.src = u.avatar;
  updateSubscriptionBadgesUI();

  saveCurrentUser(u);
  saveRegisteredUserAccount(u);
  }
}

export function selectProfileAvatar(key) {
  const u = getCurrentUser();
  if (!u) return;
  if (key === 'avatar-m') u.avatar = AVATARS_BY_SEX['Masculino'];
  else if (key === 'avatar-f') u.avatar = AVATARS_BY_SEX['Femenino'];
  else u.avatar = AVATARS_BY_SEX['Otro'];
  const a = document.getElementById('profile-edit-avatar-img');
  if (a) a.src = u.avatar;
  updateSubscriptionBadgesUI();


  saveCurrentUser(u);
  saveRegisteredUserAccount(u);
}

export async function handleProfilePhotoUpload(e) {
  const inputEl = e?.target;
  const file = inputEl?.files?.[0];
  if (!file) return;
  try {
    const res = await processPortalImageUpload(file, { modulo: 'avatares', preset: 'avatar' });
    const u = getCurrentUser();
    if (u) {
      u.avatar = res.dataUrl;
      u.avatarS3Key = res.s3Key || '';
      const a = document.getElementById('profile-edit-avatar-img');
      if (a) a.src = res.dataUrl;
      saveCurrentUser(u);
      saveRegisteredUserAccount(u);
      showToast(`Foto de perfil actualizada (${res.summaryText})`, 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

export function saveProfileChanges() {
  const u = getCurrentUser();
  if (!u) return;

  const n = document.getElementById('profile-edit-name');
  const e = document.getElementById('profile-edit-email');
  const s = document.getElementById('profile-edit-sexo');
  const d = document.getElementById('profile-edit-dob');

  const oldEmail = (u.email || '').toLowerCase().trim();
  if (n) u.name = n.value.trim();
  if (e) u.email = e.value.trim();
  if (s) u.sexo = s.value;
  if (d) u.dob = d.value;
  const newEmail = (u.email || '').toLowerCase().trim();
  if (oldEmail && newEmail && oldEmail !== newEmail && typeof localStorage !== 'undefined') {
    const existingSub = localStorage.getItem(`adm_const_subscription_${oldEmail}`);
    if (existingSub) {
      localStorage.setItem(`adm_const_subscription_${newEmail}`, existingSub);
    }
  }
  


  saveCurrentUser(u);
  saveRegisteredUserAccount(u);
  closeProfileModal();
  updateWorkspaceHeaderUser(u);
  updatePortalHeaderUserArea(u);
  updateSubscriptionBadgesUI();

  const portalView = document.getElementById('view-portal');
  if (portalView && !portalView.classList.contains('hidden')) {
    renderPortalDashboard(); renderSidebarNotificationsUI();
  }
  showToast('Perfil actualizado correctamente');
}

// Eliminar definitivamente la cuenta del usuario activo y todos sus archivos
export async function deleteCurrentUserAccountAction() {
  const user = getCurrentUser();
  if (!user || !user.email) {
    showToast('No hay una sesiÃ³n activa para eliminar.', 'warning');
    closeProfileModal();
    return;
  }

  const cleanEmail = user.email.toLowerCase().trim();
  const userName = user.name || cleanEmail;

  const confirmMsg =
    `âš ï¸ Â¿ELIMINAR TU CUENTA DEFINITIVAMENTE?\n\n` +
    `EstÃ¡s a punto de eliminar permanentemente la cuenta de "${userName}" (${cleanEmail}).\n\n` +
    `â€¢ Se ELIMINARÃN TODOS TUS ARCHIVOS, proyectos de obra, catÃ¡logos y matrices APU vinculados a este usuario.\n` +
    `â€¢ Toda tu informaciÃ³n se borrarÃ¡ por completo de este equipo.\n` +
    `â€¢ Si en el futuro te vuelves a registrar con este mismo correo (${cleanEmail}), la cuenta aparecerÃ¡ en blanco, totalmente nueva.\n\n` +
    `Â¿Deseas confirmar la eliminaciÃ³n definitiva ahora?`;

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    // Si Supabase estÃ¡ activo, eliminar el registro de perfil y desloguear
    const sb = getSupabaseClient();
    if (sb) {
      try {
        if (user.id) {
          await sb.from('perfiles').delete().eq('id', user.id);
        } else {
          await sb.from('perfiles').delete().eq('email', cleanEmail);
        }
      } catch (cloudErr) {
        console.warn('[Supabase] Aviso al eliminar perfil remoto:', cloudErr);
      }
      try {
        await sb.auth.signOut();
      } catch (_) {}
    }

    // Eliminar la cuenta y todos sus archivos asociados localmente
    deleteUserAccountAndData(cleanEmail);

    setActiveProjectId(null);
    closeProfileModal();
    updatePortalHeaderUserArea(null);
    renderSidebarNotificationsUI();

    showToast(`Tu cuenta (${cleanEmail}) y todos sus archivos han sido eliminados permanentemente.`, 'info');
    showPortalView('register');
  } catch (err) {
    console.error('Error al eliminar cuenta:', err);
    showToast('Error al eliminar la cuenta: ' + (err.message || err), 'error');
  }
}

export async function logoutUser(skipConfirm = false) {
  if (!skipConfirm && !confirm('¿Deseas cerrar sesión en esta computadora? Tus proyectos se conservarán intactos.')) return;

  const current = getCurrentUser();
  const cleanEmail = (current?.email || '').toLowerCase().trim();

  // 1. Cerrar sesión formalmente en Supabase Auth con alcance global
  try {
    const sb = getSupabaseClient();
    if (sb) {
      await sb.auth.signOut({ scope: 'global' });
    }
  } catch (err) {
    console.warn('[Logout] Aviso al cerrar sesión en Supabase:', err);
  }

  // 2. Marcar la sesión cerrada para este correo en esta PC
  if (cleanEmail) {
    markSessionClosed(cleanEmail);
  }

  // 3. Limpiar almacenamiento de usuario activo
  saveCurrentUser(null);

  // 4. Limpiar tokens residuales de Supabase y perfiles de sesión en esta computadora
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_WORKSPACE);
      localStorage.removeItem('control_obra_active_workspace_v1');
      localStorage.removeItem('control_obra_user_profile_v1');
      localStorage.removeItem('control_obra_user_profile_v1_last');
      localStorage.removeItem('cubikar_remember_device');

      // Purgar todos los tokens sb-* en localStorage
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('auth-token'))) {
          localStorage.removeItem(k);
        }
      }
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  } catch (_) {}

  currentScopeFilter = 'owned';
  updatePortalHeaderUserArea(null);
  renderSidebarNotificationsUI();
  showToast('Has cerrado sesión exitosamente.');

  if (window.location.search) {
    window.location.href = window.location.pathname;
  } else {
    showPortalView('login');
  }
}

// Cerrar sesión en absolutamente todas las computadoras y navegadores
export async function logoutAllDevices(skipConfirm = false) {
  if (!skipConfirm && !confirm('¿Deseas cerrar sesión en TODAS las computadoras y dispositivos?')) return;
  const current = getCurrentUser();
  const cleanEmail = (current?.email || '').toLowerCase().trim();

  try {
    const sb = getSupabaseClient();
    if (sb) {
      await sb.auth.signOut({ scope: 'global' });
    }
  } catch (err) {
    console.warn('[LogoutAll] Error revocando sesión global en Supabase:', err);
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const nextRevokeVersion = `v2_global_revoke_${Date.now()}`;
      localStorage.setItem('cubikar_auth_session_version', nextRevokeVersion);
    }
  } catch (_) {}

  await logoutUser(true);
  showToast('🔒 Has cerrado la sesión en todas las computadoras.', 'info');
}

// Eliminar permanentemente la cuenta del usuario actual y todos sus datos/archivos locales
// Alias para mantener compatibilidad
export async function deleteUserAccount() {
  return deleteCurrentUserAccountAction();
}
// ==========================================
// USUARIO EN LA BARRA SUPERIOR DEL PORTAL
// ==========================================
export function updatePortalHeaderUserArea(user) {
  const container = document.getElementById('portal-header-user-area');
  const notifWrapper = document.getElementById('portal-notifications-wrapper');

  if (!user) {
    if (notifWrapper) {
      notifWrapper.classList.add('hidden');
    }
    const portalPopover = document.getElementById('portal-notifications-popover');
    if (portalPopover) portalPopover.classList.add('hidden');

    if (container) {
      container.innerHTML = `
        <button onclick="renderPortalAuth('login')" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer">
          <i class="fa-solid fa-right-to-bracket text-blue-400"></i> Iniciar Sesión
        </button>
        <button onclick="renderPortalAuth('register')" class="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer">
          <i class="fa-solid fa-user-plus"></i> Registrarse
        </button>
      `;
    }
    return;
  }

  if (notifWrapper) {
    notifWrapper.classList.remove('hidden');
  }

  if (!container) return;

  const initials = (user.name || 'Usuario').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
  const normalizedEmail = (user.email || '').toLowerCase().trim();
  const safeAvatar = (typeof user.avatar === 'string' && user.avatar.trim() && user.avatar !== 'undefined' && user.avatar !== 'null') ? user.avatar : '';
  const existingWrapper = document.getElementById('portal-user-menu-wrapper');
  const existingDropdown = document.getElementById('portal-user-dropdown');
  const wasDropdownOpen = !!(existingDropdown && !existingDropdown.classList.contains('hidden'));
  const sameUserRendered = !!(
    existingWrapper &&
    existingDropdown &&
    (existingWrapper.dataset.userEmail || '') === normalizedEmail &&
    (existingWrapper.dataset.userAvatar || '') === safeAvatar
  );

  if (sameUserRendered) {
    const pillName = existingWrapper.querySelector('[data-portal-user-name]');
    const pillRole = existingWrapper.querySelector('[data-portal-user-role]');
    const dropName = existingWrapper.querySelector('[data-portal-dropdown-name]');
    const dropEmail = existingWrapper.querySelector('[data-portal-dropdown-email]');
    if (pillName) pillName.textContent = user.name || 'Usuario';
    if (pillRole) pillRole.textContent = user.roleLabel || 'Invitado';
    if (dropName) dropName.textContent = user.name || 'Usuario';
    if (dropEmail) dropEmail.textContent = user.email || '';
    updateSubscriptionBadgesUI({ refreshGrid: false });
    return;
  }

  container.innerHTML = `
    <!-- User Profile Pill (Compact, Unificado) -->
    <div class="relative" id="portal-user-menu-wrapper" data-user-email="${normalizedEmail}" data-user-avatar="${safeAvatar.replace(/"/g, '&quot;')}">
      <div onclick="togglePortalUserDropdown(event)" class="flex items-center gap-3 pl-2 py-1 pr-3 bg-slate-900 border border-slate-800 rounded-full hover:border-slate-700 transition cursor-pointer group select-none" title="Opciones de perfil de usuario">
        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center ring-2 ring-amber-400/30 overflow-hidden shrink-0">
          ${safeAvatar ? `<img src="${safeAvatar}" class="w-full h-full object-cover" alt="Perfil">` : initials}
        </div>
        <div class="text-left hidden sm:block">
          <div data-portal-user-name class="text-xs font-semibold text-slate-200 leading-tight max-w-[130px] truncate">${user.name || 'Usuario'}</div>
          <div data-portal-user-role class="text-[11px] text-slate-400 leading-tight max-w-[130px] truncate">${user.roleLabel || 'Invitado'}</div>
        </div>
        <svg class="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <!-- Dropdown Desplegable del Perfil en el Navbar -->
      <div id="portal-user-dropdown" class="${wasDropdownOpen ? '' : 'hidden '}absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-2 z-50 text-slate-200 animate-in fade-in zoom-in-95 duration-100">
        <div class="px-3.5 py-2.5 border-b border-slate-800 flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full overflow-hidden border border-amber-400/60 bg-slate-800 shrink-0">
            ${safeAvatar ? `<img src="${safeAvatar}" class="w-full h-full object-cover" alt="Avatar">` : `<div class="w-full h-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center">${initials}</div>`}
          </div>
          <div class="min-w-0 flex-1">
            <span data-portal-dropdown-name class="font-bold text-xs text-white block truncate">${user.name || 'Usuario'}</span>
            <span data-portal-dropdown-email class="text-[10px] text-slate-400 font-mono block truncate">${user.email || ''}</span>
          </div>
        </div>

        <div class="p-1.5 space-y-1 text-xs font-semibold">
                    ${isUserAdmin(user?.email) ? `
            <button type="button" onclick="closePortalUserDropdown(); openCubikarAdminModal()" 
                    class="w-full text-left px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 font-bold border border-amber-500/35 flex items-center gap-2 transition cursor-pointer">
              <i class="fa-solid fa-shield-halved text-amber-400 text-xs"></i>
              <span>Panel de Administración</span>
            </button>
          ` : ''}
          <button type="button" onclick="closePortalUserDropdown(); openProfileModal()" 
                  class="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2 transition cursor-pointer">
            <i class="fa-solid fa-user-gear text-blue-400 text-xs"></i>
            <span>Editar Mi Perfil</span>
          </button>
          <button type="button" onclick="closePortalUserDropdown(); openSubscriptionModal()" 
                  class="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-between gap-2 transition cursor-pointer">
            <span class="flex items-center gap-2">
              <i class="fa-solid fa-crown text-amber-400 text-xs"></i>
              <span>Suscripción</span>
            </span>
            <span id="portal-dropdown-user-plan-badge" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">Gratuita</span>
          </button>
          <button type="button" onclick="closePortalUserDropdown(); showPortalView('login')" 
                  class="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2 transition cursor-pointer">
            <i class="fa-solid fa-right-to-bracket text-blue-400 text-xs"></i>
            <span>Iniciar Sesión / Cambiar Cuenta</span>
          </button>
          <button type="button" onclick="closePortalUserDropdown(); showPortalView('register')" 
                  class="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2 transition cursor-pointer">
            <i class="fa-solid fa-user-plus text-emerald-400 text-xs"></i>
            <span>Registrar Nuevo Usuario</span>
          </button>
          <div class="h-px bg-slate-800 my-1"></div>
          <button type="button" onclick="closePortalUserDropdown(); logoutUser()" 
                  class="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-500/10 text-rose-400 flex items-center gap-2 transition cursor-pointer">
            <i class="fa-solid fa-power-off text-rose-500 text-xs"></i>
            <span>Cerrar Sesión</span>
          </button>
          <button type="button" onclick="closePortalUserDropdown(); logoutAllDevices()" 
                  class="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-500/10 text-rose-300 flex items-center gap-2 transition cursor-pointer" title="Cierra la sesión activa en todas las computadoras y dispositivos">
            <i class="fa-solid fa-laptop-slash text-rose-400 text-xs"></i>
            <span>Cerrar Sesión en Todas las PCs</span>
          </button>
        </div>
      </div>
    </div>
  `;
  updateSubscriptionBadgesUI({ refreshGrid: false });
}

export function toggleUserDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('workspace-user-dropdown');
  updateSubscriptionBadgesUI({ refreshGrid: false });
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

export function closeUserDropdown() {
  const dropdown = document.getElementById('workspace-user-dropdown');
  updateSubscriptionBadgesUI({ refreshGrid: false });
  if (dropdown && !dropdown.classList.contains('hidden')) {
    dropdown.classList.add('hidden');
  }
}

export function togglePortalUserDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('portal-user-dropdown');
  updateSubscriptionBadgesUI({ refreshGrid: false });
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

export function closePortalUserDropdown() {
  const dropdown = document.getElementById('portal-user-dropdown');
  updateSubscriptionBadgesUI({ refreshGrid: false });
  if (dropdown && !dropdown.classList.contains('hidden')) {
    dropdown.classList.add('hidden');
  }
}

// Cerrar los menús desplegables si se hace clic fuera de ellos
document.addEventListener('click', (e) => {
  const workspaceWrapper = document.getElementById('user-menu-wrapper');
  if (workspaceWrapper && !workspaceWrapper.contains(e.target)) {
    closeUserDropdown();
  }
  const portalWrapper = document.getElementById('portal-user-menu-wrapper');
  if (portalWrapper && !portalWrapper.contains(e.target)) {
    closePortalUserDropdown();
  }
});

export function updateWorkspaceHeaderUser(user) {
  let u = user || getCurrentUser();
  if (!u) {
    u = {
      name: 'Usuario Invitado',
      email: '',
      avatar: '',
      role: 'Invitado'
    };
  }
  const nameEl = document.getElementById('workspace-user-name');
  const avatarEl = document.getElementById('workspace-user-avatar');
  const initialsEl = document.getElementById('workspace-user-initials');
  const btnEl = document.getElementById('workspace-user-btn');
  const dropNameEl = document.getElementById('dropdown-user-name');
  const dropEmailEl = document.getElementById('dropdown-user-email');
  const dropAvatarEl = document.getElementById('dropdown-user-avatar');
  const dropInitialsEl = document.getElementById('dropdown-user-initials');

  const initials = (u.name || 'Usuario').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  if (nameEl) nameEl.innerText = u.name;
  if (dropNameEl) dropNameEl.innerText = u.name;
  if (dropEmailEl) dropEmailEl.innerText = u.email;
  if (initialsEl) initialsEl.innerText = initials;
  if (dropInitialsEl) dropInitialsEl.innerText = initials;
  if (btnEl) btnEl.title = `${u.name} (${u.roleLabel || u.role || 'Invitado'}) - Clic para ver opciones`;
  updateSubscriptionBadgesUI({ refreshGrid: false });

  const hasPhoto = u.avatar && u.avatar !== 'undefined' && u.avatar !== 'null' && (u.avatar.startsWith('http') || u.avatar.startsWith('data:image/png') || u.avatar.startsWith('data:image/jpeg') || u.avatar.startsWith('data:image/webp'));

  if (avatarEl) {
    if (hasPhoto) {
      avatarEl.src = u.avatar;
      avatarEl.classList.remove('hidden');
      if (initialsEl) initialsEl.classList.add('hidden');
    } else {
      avatarEl.classList.add('hidden');
      if (initialsEl) initialsEl.classList.remove('hidden');
    }
  }

  if (dropAvatarEl) {
    if (hasPhoto) {
      dropAvatarEl.src = u.avatar;
      dropAvatarEl.classList.remove('hidden');
      if (dropInitialsEl) dropInitialsEl.classList.add('hidden');
    } else {
      dropAvatarEl.classList.add('hidden');
      if (dropInitialsEl) dropInitialsEl.classList.remove('hidden');
    }
  }
}

// ==========================================
// GESTIÓN DE COLABORADORES E INVITACIONES POR PROYECTO
// ==========================================
let activeInviteProjectId = null;
let selectedInviteSexo = 'Masculino';
let inviteCustomAvatarTemp = null;

// Obtener ID del proyecto activo o fallback para invitación y visualización
export function getActiveOrFallbackProjectId() {
  let pId = getActiveProjectId();
  if (pId) return pId;

  const currentProjectName = (state.settings?.projectName || '').trim().toLowerCase();
  const list = getProjectsList();
  if (currentProjectName) {
    const matched = list.find(p => (p.projectName || '').trim().toLowerCase() === currentProjectName);
    if (matched) return matched.id;
  }
  if (list && list.length > 0) {
    return list[0].id;
  }

  return 'proj-default-01';
}

export function openInviteModal(projectId, defaultTab = 'members') {
  if (typeof projectId !== 'string' || !projectId) {
    projectId = getActiveOrFallbackProjectId();
  }
  activeInviteProjectId = projectId;
  let proj = getProjectById(projectId);
  if (!proj) {
    const list = getProjectsList();
    if (list && list.length > 0) {
      proj = list[0];
      activeInviteProjectId = proj.id;
    }
  }
  if (!proj) return;

  const currentUser = getCurrentUser();
  const inviteCheck = canUserInviteToProject(activeInviteProjectId, currentUser);
  if (!inviteCheck.allowed) {
    showToast(`🔒 ${inviteCheck.reason || 'No tienes permiso para invitar colaboradores a este proyecto.'}`, 'warning');
    if (inviteCheck.reason && inviteCheck.reason.includes('límite')) {
      openSubscriptionModal();
    }
    return;
  }

  const modal = document.getElementById('modal-invitar-usuario');
  if (!modal) return;

  const nameBadge = document.getElementById('invite-modal-project-name');
  if (nameBadge) {
    nameBadge.textContent = state.settings?.projectName || proj.projectName || 'Proyecto de Obra';
  }

  // Limpiar campos
  const nameInput = document.getElementById('invite-member-name');
  const emailInput = document.getElementById('invite-member-email');
  if (nameInput) nameInput.value = '';
  if (emailInput) emailInput.value = '';

  selectedInviteSexo = 'Masculino';
  inviteCustomAvatarTemp = null;
  updateInviteAvatarPreview();

  // Mantener el rol seleccionado si ya había uno elegido, o inicializar en 'editar' por defecto
  const currentCheckedRole = document.querySelector('input[name="invite-role"]:checked');
  if (!currentCheckedRole) {
    const defaultRadio = document.querySelector('input[name="invite-role"][value="editar"]');
    if (defaultRadio) defaultRadio.checked = true;
  }

  // Resetear checkboxes de pestañas en formulario (deseleccionadas por defecto)
  setInviteTabCheckboxes(false);

  // Activar la pestaña solicitada (por defecto 'members')
  switchInviteModalTab(defaultTab);

  modal.style.zIndex = '100000';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeInviteModal() {
  const modal = document.getElementById('modal-invitar-usuario');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  activeInviteProjectId = null;

  // Actualizar las tarjetas de proyectos para reflejar de inmediato los avatares
  const grid = document.getElementById('projects-grid');
  if (grid) {
    const searchInput = document.getElementById('project-search');
    grid.innerHTML = renderProjectCardsHTML(searchInput ? searchInput.value : '');
  }

  // Actualizar avatares en el encabezado
  renderHeaderCollaborators();
}

// Copiar enlace directo de invitación al proyecto
export function copyProjectInviteLink() {
  const pId = activeInviteProjectId || getActiveOrFallbackProjectId();
  const url = `${window.location.origin}${window.location.pathname}?project=${encodeURIComponent(pId)}&invite=1`;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('¡Enlace de invitación copiado al portapapeles! Compártelo con los colaboradores para darles acceso.');
    }).catch(() => {
      prompt('Copia este enlace de invitación para compartirlo:', url);
    });
  } else {
    prompt('Copia este enlace de invitación para compartirlo:', url);
  }
}

// ==========================================
// MODAL DE INVITACIONES AL PLAN DE SUSCRIPCIÓN
// ==========================================
let planInviteSelectedSexo = 'Masculino';
let planInviteCustomAvatarTemp = null;

export function openPlanInviteModal(defaultTab = 'collaborators') {
  const user = getCurrentUser();

  if (!user || !user.email) {
    showToast('Debes iniciar sesión para invitar usuarios a tu plan.', 'warning');
    return;
  }

  const modal = document.getElementById('modal-invitaciones-plan');
  if (!modal) return;

  renderPlanInviteModalContent();
  switchPlanInviteModalTab(defaultTab);

  modal.style.zIndex = '100000';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closePlanInviteModal() {
  const modal = document.getElementById('modal-invitaciones-plan');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  refreshProjectsGridUI();
}

export function switchPlanInviteModalTab(tab = 'collaborators') {
  const btnCollab = document.getElementById('tab-btn-plan-collaborators');
  const btnInvite = document.getElementById('tab-btn-plan-invite');
  const viewCollab = document.getElementById('view-plan-collaborators');
  const viewInvite = document.getElementById('view-plan-invite');

  if (tab === 'collaborators') {
    if (viewCollab) viewCollab.classList.remove('hidden');
    if (viewInvite) viewInvite.classList.add('hidden');
    if (btnCollab) {
      btnCollab.className = 'px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-slate-200 bg-white text-blue-600 shadow-2xs -mb-px';
    }
    if (btnInvite) {
      btnInvite.className = 'px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 -mb-px';
    }
  } else {
    if (viewCollab) viewCollab.classList.add('hidden');
    if (viewInvite) viewInvite.classList.remove('hidden');
    if (btnInvite) {
      btnInvite.className = 'px-4 py-2.5 text-xs font-bold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-slate-200 bg-white text-blue-600 shadow-2xs -mb-px';
    }
    if (btnCollab) {
      btnCollab.className = 'px-4 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 -mb-px';
    }
  }
}

export function renderPlanInviteModalContent() {
  const user = getCurrentUser();

  if (!user) return;

  const planId = getUserPlanId(user);
  const planLimits = getPlanLimits(planId);
  const check = canUserInviteToPlan(user);
  const collaborators = getPlanCollaboratorsForOwner(user.email);

  // Badge en el encabezado
  const badgePlan = document.getElementById('plan-invite-badge-plan');
  if (badgePlan) {
    badgePlan.textContent = `Plan ${planLimits.name}`;
  }

  // Contador de límite
  const counterBanner = document.getElementById('plan-invite-counter-banner');
  if (counterBanner) {
    const isAtLimit = !check.allowed;
    counterBanner.className = isAtLimit 
      ? 'p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3'
      : 'p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';

    counterBanner.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-xl ${isAtLimit ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'} flex items-center justify-center shrink-0">
          <i class="fa-solid ${isAtLimit ? 'fa-triangle-exclamation' : 'fa-users'} text-sm"></i>
        </div>
        <div>
          <span class="font-bold text-white block text-xs">Cupo de usuarios de tu suscripción:</span>
          <span class="text-[11px] ${isAtLimit ? 'text-amber-300' : 'text-slate-300'}">
            Tienes <strong class="text-white">${collaborators.length + 1}</strong> de <strong class="text-white">${planLimits.maxMembers === Infinity ? 'Ilimitados' : planLimits.maxMembers}</strong> usuarios en tu plan ${planLimits.name} <span class="text-slate-400">(Tú + ${collaborators.length} colaborador${collaborators.length === 1 ? '' : 'es'})</span>.
          </span>
        </div>
      </div>
      ${isAtLimit ? `
        <button type="button" onclick="closePlanInviteModal(); openSubscriptionModal();" class="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer shadow flex items-center gap-1.5">
          <i class="fa-solid fa-crown text-[11px]"></i> Subir a Plan Superior
        </button>
      ` : `
        <span class="shrink-0 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs rounded-xl font-mono">
          ${check.remaining} disponible${check.remaining === 1 ? '' : 's'}
        </span>
      `}
    `;
  }

  // Lista de colaboradores existentes
  const listContainer = document.getElementById('plan-invite-collaborators-list');
  const tabBadge = document.getElementById('plan-invite-tab-count');
  if (tabBadge) {
    tabBadge.textContent = collaborators.length;
  }

  if (listContainer) {
    if (collaborators.length === 0) {
      listContainer.innerHTML = `
        <div class="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <i class="fa-solid fa-user-group text-3xl text-slate-300 mb-2 block"></i>
          <p class="font-bold text-slate-700 text-xs">Aún no has invitado usuarios a tu plan</p>
          <p class="text-[11px] text-slate-500 mt-1">Invita a miembros de tu equipo para que colaboren en tus proyectos de obra.</p>
          <button type="button" onclick="switchPlanInviteModalTab('invite')" class="mt-3.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer inline-flex items-center gap-1.5">
            <i class="fa-solid fa-user-plus text-[11px]"></i> Invitar Primer Usuario
          </button>
        </div>
      `;
    } else {
      listContainer.innerHTML = collaborators.map(c => `
        <div class="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 transition shadow-2xs gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-full overflow-hidden border border-slate-200 shrink-0 bg-slate-100 flex items-center justify-center">
              ${c.avatar ? `<img src="${c.avatar}" alt="${c.name}" class="w-full h-full object-cover">` : `<span class="font-bold text-xs text-slate-700">${(c.name || 'U').charAt(0).toUpperCase()}</span>`}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-slate-800 text-xs truncate">${c.name}</span>
                ${c.status === 'pending' ? `
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    Pendiente
                  </span>
                ` : `
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Activo
                  </span>
                `}
              </div>
              <span class="text-[11px] text-slate-500 font-mono truncate block">${c.email}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <!-- Selector interactivo para editar el rol -->
            <div class="relative">
              <select onchange="changePlanCollaboratorRole('${c.email}', this.value)" 
                      class="text-xs font-semibold py-1.5 pl-2.5 pr-7 rounded-xl border border-slate-300 bg-slate-50 hover:bg-white hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-700 transition cursor-pointer shadow-2xs appearance-none"
                      title="Editar rol asignado a este usuario en tu plan">
                <option value="editar" ${c.role === 'editar' ? 'selected' : ''}>✏️ Editar</option>
                <option value="escribir" ${c.role === 'escribir' ? 'selected' : ''}>📝 Escribir</option>
                <option value="leer" ${c.role === 'leer' ? 'selected' : ''}>👁️ Leer</option>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <i class="fa-solid fa-chevron-down text-[9px]"></i>
              </div>
            </div>

            <button type="button" 
                    onclick="onRemovePlanCollaboratorClick('${c.email}')" 
                    class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer" 
                    title="Remover usuario de tu plan">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `).join('');
    }
  }

  // Previsualización de avatar del formulario
  updatePlanInviteAvatarPreview();
}

export function setPlanInviteSexo(sexo) {
  planInviteSelectedSexo = sexo;
  planInviteCustomAvatarTemp = null;
  updatePlanInviteAvatarPreview();
}

export function updatePlanInviteAvatarPreview() {
  const img = document.getElementById('plan-invite-avatar-preview');
  if (img) {
    img.src = planInviteCustomAvatarTemp || AVATARS_BY_SEX[planInviteSelectedSexo] || AVATARS_BY_SEX['Masculino'];
  }
}

export async function handlePlanInvitePhotoUpload(event) {
  const inputEl = event?.target;
  const file = inputEl?.files?.[0];
  if (!file) return;
  try {
    const res = await processPortalImageUpload(file, { modulo: 'avatares', preset: 'avatar' });
    planInviteCustomAvatarTemp = res.dataUrl;
    updatePlanInviteAvatarPreview();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

export function selectPlanInvitePreset(index) {
  const preset = GOOGLE_PRESET_ACCOUNTS[index];
  if (!preset) return;
  const nameInput = document.getElementById('plan-invite-member-name');
  const emailInput = document.getElementById('plan-invite-member-email');
  if (nameInput) nameInput.value = preset.name;
  if (emailInput) emailInput.value = preset.email;
  planInviteSelectedSexo = preset.sexo || 'Masculino';
  planInviteCustomAvatarTemp = preset.avatar || null;
  updatePlanInviteAvatarPreview();
}

export function submitPlanInviteMember(event) {
  if (event) event.preventDefault();
  const nameInput = document.getElementById('plan-invite-member-name');
  const emailInput = document.getElementById('plan-invite-member-email');
  const roleRadio = document.querySelector('input[name="plan-invite-role"]:checked');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const role = roleRadio ? roleRadio.value : 'editar';

  if (!email || !email.includes('@')) {
    showToast('Por favor introduce un correo electrónico válido.', 'warning');
    return;
  }

  const avatar = planInviteCustomAvatarTemp || AVATARS_BY_SEX[planInviteSelectedSexo] || AVATARS_BY_SEX['Masculino'];

  const result = createPlanInvitation({
    email,
    name: name || email.split('@')[0],
    role,
    avatar
  });

  if (!result.ok) {
    showToast(result.error || 'No fue posible enviar la invitación.', 'warning');
    if (result.limitReached) {
      closePlanInviteModal();
      openSubscriptionModal();
    }
    return;
  }

  showToast(`¡Invitación a tu plan enviada exitosamente a ${email}!`, 'success');
  if (nameInput) nameInput.value = '';
  if (emailInput) emailInput.value = '';
  planInviteCustomAvatarTemp = null;
  updatePlanInviteAvatarPreview();

  renderPlanInviteModalContent();
  switchPlanInviteModalTab('collaborators');
}

export function changePlanCollaboratorRole(collaboratorEmail, newRole) {
  const ok = updatePlanCollaboratorRole(collaboratorEmail, newRole);
  if (ok) {
    const roleLabel = PROJECT_ROLES[newRole]?.label || newRole;
    showToast(`Rol actualizado a "${roleLabel}" para ${collaboratorEmail}`);
    renderPlanInviteModalContent();
    renderHeaderCollaborators();
    renderPortalDashboard();
  }
}

export function onRemovePlanCollaboratorClick(email) {
  if (!confirm(`¿Deseas remover al usuario ${email} de tu plan de suscripción? Perderá el acceso a tus proyectos.`)) {
    return;
  }
  const ok = removePlanCollaborator(email);
  if (ok) {
    showToast(`Usuario ${email} removido de tu suscripción.`);
    renderPlanInviteModalContent();
  }
}

export function copyPlanInviteLink() {
  const user = getCurrentUser();

  const ownerEmail = user?.email || '';
  const url = `${window.location.origin}${window.location.pathname}?host=${encodeURIComponent(ownerEmail)}&plan_invite=1`;
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('¡Enlace de invitación a tu plan copiado al portapapeles!');
    }).catch(() => {
      prompt('Copia este enlace de invitación a tu plan:', url);
    });
  } else {
    prompt('Copia este enlace de invitación a tu plan:', url);
  }
}

// Renderizar avatares y estado de colaboradores en el encabezado de proyecto
export function renderHeaderCollaborators() {
  const container = document.getElementById('header-colaboradores-avatars');
  if (!container) return;

  const pId = getActiveOrFallbackProjectId();
  const proj = getProjectById(pId);
  let members = (proj && Array.isArray(proj.members)) ? proj.members : [];

  // Si no cuenta aún con miembros asignados, inicializar con equipo base con roles
  if (members.length === 0) {
    const currentUser = getCurrentUser();
    members = [
      {
        id: 'mem-' + ((currentUser && currentUser.email) || 'admin'),
        name: (currentUser && currentUser.name) || 'Administrador de Obra',
        email: (currentUser && currentUser.email) || 'admin@constructora.com',
        avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
        role: 'editar'
      },
      {
        id: 'mem-colab-01',
        name: 'Ing. Mariana Torres Morales',
        email: 'mariana.torres.costos@gmail.com',
        avatar: AVATARS_BY_SEX['Femenino'],
        role: 'escribir'
      },
      {
        id: 'mem-colab-02',
        name: 'Arq. Roberto Méndez Silva',
        email: 'roberto.mendez.obras@gmail.com',
        avatar: AVATARS_BY_SEX['Masculino'],
        role: 'leer'
      }
    ];
    if (proj) {
      proj.members = members;
      const list = getProjectsList();
      const idx = list.findIndex(p => p.id === proj.id);
      if (idx !== -1) {
        list[idx] = proj;
        saveProjectsList(list);
      }
    }
  }

  const roleLabels = {
    editar: 'Editar (Control total)',
    escribir: 'Escribir (Captura APU/Insumos)',
    leer: 'Leer (Solo consulta)'
  };

  const roleColors = {
    editar: 'ring-blue-500 bg-blue-600',
    escribir: 'ring-emerald-500 bg-emerald-600',
    leer: 'ring-amber-500 bg-amber-600'
  };

  const maxVisible = 3;
  const visible = members.slice(0, maxVisible);
  const extra = members.length - maxVisible;

  const html = visible.map((m, idx) => {
    const roleClass = roleColors[m.role] || 'ring-blue-500 bg-blue-600';
    const roleTxt = roleLabels[m.role] || m.role;
    const inits = (m.name || 'US').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'US';
    
    if (m.avatar && (m.avatar.startsWith('http') || m.avatar.startsWith('data:image'))) {
      return `
        <div class="relative group/avatar inline-block" title="${m.name} • Permiso: ${roleTxt}">
          <img src="${m.avatar}" class="inline-block h-6 w-6 rounded-full ring-2 ${roleClass} object-cover shadow-xs">
        </div>
      `;
    }
    return `
      <div class="inline-block h-6 w-6 rounded-full ring-2 ${roleClass} text-[9px] font-bold text-white flex items-center justify-center shadow-xs" title="${m.name} • Permiso: ${roleTxt}">
        ${inits}
      </div>
    `;
  }).join('');

  const extraBadge = extra > 0 
    ? `<span class="inline-block h-6 w-6 rounded-full ring-2 ring-slate-700 bg-slate-700 text-[9px] font-bold text-slate-300 flex items-center justify-center shadow-xs" title="+${extra} colaboradores más">+${extra}</span>`
    : '';

  container.innerHTML = html + extraBadge;
}

export function setInviteSexo(sexo) {
  selectedInviteSexo = sexo;
  inviteCustomAvatarTemp = null;
  updateInviteAvatarPreview();
}

export async function handleInvitePhotoUpload(e) {
  const inputEl = e?.target;
  const file = inputEl?.files?.[0];
  if (!file) return;
  try {
    const res = await processPortalImageUpload(file, { modulo: 'avatares', preset: 'avatar' });
    inviteCustomAvatarTemp = res.dataUrl;
    updateInviteAvatarPreview();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
}

function updateInviteAvatarPreview() {
  const img = document.getElementById('invite-avatar-preview');
  if (img) {
    img.src = inviteCustomAvatarTemp || AVATARS_BY_SEX[selectedInviteSexo] || AVATARS_BY_SEX['Masculino'];
  }
}

export function selectInvitePreset(index) {
  const acc = GOOGLE_PRESET_ACCOUNTS[index];
  if (!acc) return;

  const nameInput = document.getElementById('invite-member-name');
  const emailInput = document.getElementById('invite-member-email');
  if (nameInput) nameInput.value = acc.name;
  if (emailInput) emailInput.value = acc.email;

  if (acc.sexo) selectedInviteSexo = acc.sexo;
  inviteCustomAvatarTemp = acc.avatar || null;
  updateInviteAvatarPreview();
}

// Alternar pestañas dentro del modal de Equipo y Permisos (Miembros con Acceso / Invitar Colaborador)
export function switchInviteModalTab(tab = 'members') {
  const btnMembers = document.getElementById('tab-btn-modal-members');
  const btnInvite = document.getElementById('tab-btn-modal-invite');
  const viewMembers = document.getElementById('invite-modal-view-members');
  const viewInvite = document.getElementById('invite-modal-view-invite');

  if (tab === 'invite') {
    if (btnInvite) {
      btnInvite.className = 'px-4 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-slate-200 bg-white text-blue-600 shadow-2xs -mb-px';
      const icon = btnInvite.querySelector('i');
      if (icon) {
        icon.className = 'fa-solid fa-user-plus text-blue-600';
      }
    }
    if (btnMembers) {
      btnMembers.className = 'px-4 py-2 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 -mb-px';
      const icon = btnMembers.querySelector('i');
      if (icon) {
        icon.className = 'fa-solid fa-users text-slate-500';
      }
    }
    if (viewMembers) viewMembers.classList.add('hidden');
    if (viewInvite) viewInvite.classList.remove('hidden');
  } else {
    if (btnMembers) {
      btnMembers.className = 'px-4 py-2 text-xs font-bold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-slate-200 bg-white text-blue-600 shadow-2xs -mb-px';
      const icon = btnMembers.querySelector('i');
      if (icon) {
        icon.className = 'fa-solid fa-users text-blue-600';
      }
    }
    if (btnInvite) {
      btnInvite.className = 'px-4 py-2 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 cursor-pointer border-t border-x border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 -mb-px';
      const icon = btnInvite.querySelector('i');
      if (icon) {
        icon.className = 'fa-solid fa-user-plus text-slate-500';
      }
    }
    if (viewMembers) viewMembers.classList.remove('hidden');
    if (viewInvite) viewInvite.classList.add('hidden');
    renderInviteModalMembersList();
  }
}

// Marcar / desmarcar checkboxes de pestañas en el formulario de invitación
export function setInviteTabCheckboxes(checkAll) {
  const cbs = document.querySelectorAll('input[name="invite-tab-access"]');
  cbs.forEach(cb => { cb.checked = !!checkAll; });
}

// Quitar o poner autorización de una pestaña específica para un colaborador invitado
export function toggleMemberTabPermission(memberId, tabKey) {
  if (!activeInviteProjectId) {
    activeInviteProjectId = getActiveOrFallbackProjectId();
  }
  if (!activeInviteProjectId) return;

  const members = getProjectMembers(activeInviteProjectId);
  const mem = members.find(m => m.id === memberId);
  if (!mem) return;

  const currentTabs = Array.isArray(mem.allowedTabs) ? [...mem.allowedTabs] : ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora'];
  const hasTab = currentTabs.includes(tabKey);
  const newTabs = hasTab ? currentTabs.filter(t => t !== tabKey) : [...currentTabs, tabKey];

  const ok = updateProjectMemberTabs(activeInviteProjectId, memberId, newTabs);
  if (ok) {
    const tabName = TAB_METADATA[tabKey]?.name || tabKey;
    if (hasTab) {
      showToast(`Pestaña "${tabName}" retirada para ${mem.name}`, false);
    } else {
      showToast(`Pestaña "${tabName}" autorizada para ${mem.name}`);
    }
    renderInviteModalMembersList();
    renderAllTabAssignedMembers();
    updateNavigationTabsAccess();
  }
}

// Asignar todas o quitar todas las pestañas para un colaborador
export function setMemberAllTabsPermission(memberId, grantAll) {
  if (!activeInviteProjectId) {
    activeInviteProjectId = getActiveOrFallbackProjectId();
  }
  if (!activeInviteProjectId) return;

  const members = getProjectMembers(activeInviteProjectId);
  const mem = members.find(m => m.id === memberId);
  if (!mem) return;

  const newTabs = grantAll ? ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora'] : [];
  const ok = updateProjectMemberTabs(activeInviteProjectId, memberId, newTabs);
  if (ok) {
    showToast(grantAll ? `Todas las pestañas autorizadas para ${mem.name}` : `Todas las pestañas retiradas para ${mem.name}`, !grantAll);
    renderInviteModalMembersList();
    renderAllTabAssignedMembers();
    updateNavigationTabsAccess();
  }
}

export function submitInviteMember(e) {
  if (e) e.preventDefault();
  if (!activeInviteProjectId) {
    activeInviteProjectId = getActiveOrFallbackProjectId();
  }
  if (!activeInviteProjectId) return;

  const nameInput = document.getElementById('invite-member-name');
  const emailInput = document.getElementById('invite-member-email');
  const roleRadio = document.querySelector('input[name="invite-role"]:checked');
  const tabChecks = document.querySelectorAll('input[name="invite-tab-access"]:checked');
  const allowedTabs = Array.from(tabChecks).map(cb => cb.value);

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const role = roleRadio ? roleRadio.value : 'editar';

  if (!name || !email) {
    alert('Por favor completa el nombre y el correo electrónico del colaborador.');
    return;
  }

  const avatar = inviteCustomAvatarTemp || AVATARS_BY_SEX[selectedInviteSexo] || AVATARS_BY_SEX['Masculino'];
  const currentUser = getCurrentUser();
  const inviteCheck = canUserInviteToProject(activeInviteProjectId, currentUser, email);
  if (!inviteCheck.allowed) {
    showToast(`🔒 ${inviteCheck.reason || 'No tienes permitido invitar más colaboradores.'}`, 'warning');
    if (inviteCheck.limitReached || (inviteCheck.reason && inviteCheck.reason.includes('límite'))) {
      openSubscriptionModal();
    }
    return;
  }

  // Crear la invitación formal persistente para que aparezca en la campana de notificaciones del usuario X
  const inv = createProjectInvitation({
    projectId: activeInviteProjectId,
    email,
    name,
    role,
    allowedTabs,
    invitedBy: currentUser
  });

  if (inv) {
    showToast(`Invitación enviada a ${email}. Aparecerá en sus notificaciones de campana.`);
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    inviteCustomAvatarTemp = null;
    updateInviteAvatarPreview();
    setInviteTabCheckboxes(false);
    
    // Cambiar automáticamente a la pestaña 1 (Miembros con Acceso) para ver al nuevo miembro
    switchInviteModalTab('members');
    renderHeaderCollaborators();
    renderAllTabAssignedMembers();
    renderSidebarNotificationsUI();
  }
}

export function changeMemberRole(memberId, newRole) {
  if (!activeInviteProjectId) return;
  const ok = updateProjectMemberRole(activeInviteProjectId, memberId, newRole);
  if (ok) {
    showToast(`Permiso actualizado a "${PROJECT_ROLES[newRole]?.label || newRole}"`);
    renderInviteModalMembersList();
    renderHeaderCollaborators();
  }
}

export function removeMemberFromProject(memberId, memberName) {
  if (!activeInviteProjectId) return;
  const currentUser = getCurrentUser();
  if (!canUserInviteToProject(activeInviteProjectId, currentUser)) {
    showToast('🔒 Solo el dueño del proyecto o usuarios con rol de Editor pueden remover colaboradores.', 'warning');
    return;
  }
  if (!confirm(`¿Deseas remover a "${memberName || 'este usuario'}" del proyecto?`)) return;

  const ok = removeProjectMember(activeInviteProjectId, memberId);
  if (ok) {
    showToast(`Usuario removido del proyecto`, false);
    renderInviteModalMembersList();
    renderHeaderCollaborators();
    renderAllTabAssignedMembers();
    refreshProjectsGridUI();
    renderSidebarNotificationsUI();
  }
}

export function renderInviteModalMembersList() {
  if (!activeInviteProjectId) {
    activeInviteProjectId = getActiveOrFallbackProjectId();
  }
  if (!activeInviteProjectId) return;
  const members = getProjectMembers(activeInviteProjectId);
  const container = document.getElementById('invite-members-list');
  const countBadge = document.getElementById('invite-members-count');
  const tabCountBadge = document.getElementById('invite-tab-count-badge');
  const simulateSelect = document.getElementById('select-simulate-user-view');

  if (countBadge) {
    countBadge.textContent = `${members.length} colaborador${members.length === 1 ? '' : 'es'}`;
  }
  if (tabCountBadge) {
    tabCountBadge.textContent = `${members.length}`;
  }

  // Actualizar selector de simulación de vista
  if (simulateSelect) {
    const currentUser = getCurrentUser();
    const currentEmail = currentUser ? currentUser.email : 'admin.general@constructora.com';
    simulateSelect.innerHTML = `
      <option value="admin" ${currentEmail === 'admin.general@constructora.com' ? 'selected' : ''}>👑 Tú (Administrador - Todas)</option>
      ${members.map(m => {
        const tabList = (m.allowedTabs || ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora']).map(t => TAB_METADATA[t]?.name).filter(Boolean).join(', ');
        return `<option value="${m.email}" ${currentEmail === m.email ? 'selected' : ''}>${m.name} (${tabList || 'Sin acceso'})</option>`;
      }).join('')}
    `;
  }

  if (!container) return;

  if (members.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-xs">
        <i class="fa-solid fa-users text-2xl text-slate-300 mb-2 block"></i>
        <p class="font-semibold text-slate-600">No hay colaboradores asignados todavía a este proyecto.</p>
        <p class="text-[11px] text-slate-400 mt-1">Usa la pestaña <strong>"Invitar o Agregar Nuevo Colaborador"</strong> para sumar miembros.</p>
        <button type="button" onclick="switchInviteModalTab('invite')" class="mt-3 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-xs">
          <i class="fa-solid fa-user-plus text-[10px]"></i> Invitar Colaborador Ahora
        </button>
      </div>
    `;
    return;
  }

  const tabDefs = [
    { id: 'cat', label: 'Catálogo', icon: 'fa-list-check', activeBg: 'bg-blue-50 text-blue-700 border-blue-400 hover:bg-blue-100', iconColor: 'text-blue-600' },
    { id: 'insumos', label: 'Insumos', icon: 'fa-boxes-stacked', activeBg: 'bg-purple-50 text-purple-700 border-purple-400 hover:bg-purple-100', iconColor: 'text-purple-600' },
    { id: 'calendario', label: 'Calendario', icon: 'fa-calendar-days', activeBg: 'bg-amber-50 text-amber-700 border-amber-400 hover:bg-amber-100', iconColor: 'text-amber-500' },
    { id: 'estimaciones', label: 'Estimaciones', icon: 'fa-file-invoice-dollar', activeBg: 'bg-emerald-50 text-emerald-700 border-emerald-400 hover:bg-emerald-100', iconColor: 'text-emerald-600' },
    { id: 'compras', label: 'Compras', icon: 'fa-cart-shopping', activeBg: 'bg-indigo-50 text-indigo-700 border-indigo-400 hover:bg-indigo-100', iconColor: 'text-indigo-600' },
    { id: 'bitacora', label: 'Bitácora', icon: 'fa-book-bookmark', activeBg: 'bg-teal-50 text-teal-700 border-teal-400 hover:bg-teal-100', iconColor: 'text-teal-600' }
  ];

  container.innerHTML = members.map(m => {
    const tabs = Array.isArray(m.allowedTabs) ? m.allowedTabs : ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora'];
    return `
      <div class="flex flex-col gap-2 p-3 bg-white hover:bg-slate-50/90 rounded-2xl border border-slate-200 shadow-2xs transition">
        <!-- Fila Superior: Perfil + Rol + Eliminar -->
        <div class="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-xs shrink-0 bg-slate-200">
              <img src="${m.avatar || AVATARS_BY_SEX['Masculino']}" alt="${m.name}" class="w-full h-full object-cover">
            </div>
            <div class="min-w-0">
              <h4 class="font-bold text-slate-800 text-xs truncate" title="${m.name}">${m.name}</h4>
              <p class="text-[11px] text-slate-500 font-mono truncate" title="${m.email}">${m.email}</p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <!-- Selector de Rol General -->
            <select onchange="changeMemberRole('${m.id}', this.value)" class="text-xs font-semibold py-1 px-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:border-blue-500 focus:outline-none cursor-pointer" title="Modificar rol de acceso">
              <option value="editar" ${m.role === 'editar' ? 'selected' : ''}>✏️ Editar</option>
              <option value="escribir" ${m.role === 'escribir' ? 'selected' : ''}>📝 Escribir</option>
              <option value="leer" ${m.role === 'leer' ? 'selected' : ''}>👁️ Leer</option>
            </select>

            <!-- Botón Eliminar -->
            <button type="button" onclick="removeMemberFromProject('${m.id}', '${m.name.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer" title="Remover del proyecto">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>

        <!-- Fila Inferior: Pestañas de Autorización (Quitar o Poner) -->
        <div class="pt-2 border-t border-slate-100">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <i class="fa-solid fa-sliders text-blue-600 text-[10px]"></i> Pestañas autorizadas:
            </span>
            <div class="flex items-center gap-1.5 text-[10px]">
              <button type="button" onclick="setMemberAllTabsPermission('${m.id}', true)" class="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer" title="Autorizar todas las pestañas">Todas</button>
              <span class="text-slate-300">|</span>
              <button type="button" onclick="setMemberAllTabsPermission('${m.id}', false)" class="text-slate-500 hover:text-rose-600 font-bold hover:underline cursor-pointer" title="Quitar todas las pestañas">Ninguna</button>
            </div>
          </div>

          <!-- Botones interactivos para Quitar o Poner cada pestaña -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            ${tabDefs.map(t => {
              const isAllowed = tabs.includes(t.id);
              if (isAllowed) {
                return `
                  <button type="button" onclick="toggleMemberTabPermission('${m.id}', '${t.id}')"
                          class="px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition flex items-center justify-between gap-1 cursor-pointer shadow-2xs ${t.activeBg}"
                          title="Acceso autorizado a ${t.label}. Haz clic para QUITAR autorización.">
                    <span class="flex items-center gap-1.5 truncate">
                      <i class="fa-solid ${t.icon} ${t.iconColor} text-[10px]"></i>
                      <span class="truncate">${t.label}</span>
                    </span>
                    <i class="fa-solid fa-check text-emerald-600 text-[11px] shrink-0" title="Activa"></i>
                  </button>
                `;
              } else {
                return `
                  <button type="button" onclick="toggleMemberTabPermission('${m.id}', '${t.id}')"
                          class="px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition flex items-center justify-between gap-1 cursor-pointer bg-slate-100 text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-700 opacity-60 hover:opacity-100"
                          title="Sin acceso a ${t.label}. Haz clic para PONER autorización.">
                    <span class="flex items-center gap-1.5 truncate">
                      <i class="fa-solid ${t.icon} text-slate-400 text-[10px]"></i>
                      <span class="truncate line-through decoration-slate-300">${t.label}</span>
                    </span>
                    <i class="fa-solid fa-xmark text-slate-400 text-[11px] shrink-0" title="Inactiva"></i>
                  </button>
                `;
              }
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    document.querySelectorAll('[id^="menu-card-"]:not(.hidden)').forEach((el) => {
      const container = el.parentElement || el;
      if (!(e.target instanceof Node && container.contains(e.target))) {
        el.classList.add('hidden');
      }
    });
    const portalUserWrapper = document.getElementById('portal-user-menu-wrapper');
    if (portalUserWrapper && !(e.target instanceof Node && portalUserWrapper.contains(e.target))) {
      closePortalUserDropdown();
    }
  });

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const input = document.getElementById('searchInput');
      if (input) input.focus();
    } else if (e.key === 'Escape') {
      document.querySelectorAll('[id^="menu-card-"]').forEach(el => el.classList.add('hidden'));
      closePortalUserDropdown();
      const modal = document.getElementById('comparisonModal');
      closeSubscriptionModal();
      if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
    }
  });
}

// ==========================================
// ASIGNACIÓN Y GESTIÓN DE ACCESO A PESTAÑAS POR PROYECTO
// ==========================================

export const TAB_METADATA = {
  cat: { id: 'cat', name: 'Catálogo Base', icon: 'fa-solid fa-list-check', color: 'blue' },
  insumos: { id: 'insumos', name: 'Insumos Base', icon: 'fa-solid fa-boxes-stacked', color: 'purple' },
  calendario: { id: 'calendario', name: 'Calendario de Obra', icon: 'fa-solid fa-calendar-days', color: 'amber' },
  estimaciones: { id: 'estimaciones', name: 'Estimaciones', icon: 'fa-solid fa-file-invoice-dollar', color: 'emerald' },
  compras: { id: 'compras', name: 'Compras y Pagos', icon: 'fa-solid fa-cart-shopping', color: 'indigo' },
  bitacora: { id: 'bitacora', name: 'Bitácora de Obra', icon: 'fa-solid fa-book-bookmark', color: 'teal' }
};

let activeConfiguringTabId = null;

// Determinar si el usuario actual tiene acceso a la pestaña especificada
export function canCurrentUserAccessTab(tabId) {
  const user = getCurrentUser();

  if (!user || !user.email) return true;
  const uEmail = user.email.toLowerCase().trim();
  if (user.role === 'Admin General' || uEmail === 'admin.general@constructora.com') return true;

  const pId = getActiveOrFallbackProjectId();
  const proj = getProjectById(pId);
  if (!proj) return true;

  // El propietario del proyecto SIEMPRE tiene acceso completo a todas las pestañas de su obra
  if (proj.ownerEmail && proj.ownerEmail.toLowerCase().trim() === uEmail) return true;

  if (!Array.isArray(proj.members) || proj.members.length === 0) return true;

  const mem = proj.members.find(m => m.email && m.email.toLowerCase().trim() === uEmail);
  if (!mem) return true;
  if (mem.role === 'editar' && (!Array.isArray(mem.allowedTabs) || mem.allowedTabs.length === 0)) return true;

  if (Array.isArray(mem.allowedTabs)) {
    if (tabId === 'presupuesto') {
      return mem.allowedTabs.includes('presupuesto') || mem.allowedTabs.includes('cat') || mem.allowedTabs.includes('insumos');
    }
    return mem.allowedTabs.includes(tabId);
  }
  return true;
}

// Actualizar iconos de candado y estado visual de las pestañas en el encabezado
export function updateNavigationTabsAccess() {
  const tabDomMap = {
    presupuesto: 'tab-btn-presupuesto',
    cat: 'subtab-btn-cat',
    insumos: 'subtab-btn-insumos',
    calendario: 'tab-btn-calendario',
    estimaciones: 'tab-btn-estimaciones',
    compras: 'tab-btn-compras',
    bitacora: 'tab-btn-bitacora'
  };
  const tabs = ['presupuesto', 'cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora'];
  tabs.forEach(tabId => {
    const btn = document.getElementById(tabDomMap[tabId] || `tab-btn-${tabId}`);
    if (!btn) return;

    const allowed = canCurrentUserAccessTab(tabId);
    let lockIcon = btn.querySelector('.tab-lock-indicator');

    if (!allowed) {
      if (btn.dataset.origTitle === undefined) {
        btn.dataset.origTitle = btn.title || '';
      }
      btn.classList.add('opacity-50');
      btn.title = 'Pestaña restringida: No estás asignado a esta pestaña';
      if (!lockIcon) {
        const iconSpan = document.createElement('i');
        iconSpan.className = 'fa-solid fa-lock text-[10px] text-amber-400 ml-1 tab-lock-indicator';
        btn.appendChild(iconSpan);
      }
    } else {
      btn.classList.remove('opacity-50');
      if (btn.dataset.origTitle !== undefined) {
        btn.title = btn.dataset.origTitle;
        delete btn.dataset.origTitle;
      }
      if (lockIcon) lockIcon.remove();
    }
  });
}

// Renderizar avatares de miembros asignados a una pestaña
export function renderTabAssignedAvatars(tabId) {
  const container = document.getElementById(`tab-avatars-${tabId}`);
  if (!container) return;

  const pId = getActiveOrFallbackProjectId();
  const assigned = getTabAssignedMembers(pId, tabId);

  if (assigned.length === 0) {
    container.innerHTML = `<span class="text-[10px] text-slate-400 italic font-sans ml-1">Sin miembros</span>`;
    return;
  }

  const roleColors = {
    editar: 'ring-blue-500 bg-blue-600',
    escribir: 'ring-emerald-500 bg-emerald-600',
    leer: 'ring-amber-500 bg-amber-600'
  };

  const maxVisible = 3;
  const visible = assigned.slice(0, maxVisible);
  const extra = assigned.length - maxVisible;

  const html = visible.map(m => {
    const roleClass = roleColors[m.role] || 'ring-blue-500 bg-blue-600';
    const inits = (m.name || 'US').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'US';
    if (m.avatar && (m.avatar.startsWith('http') || m.avatar.startsWith('data:image'))) {
      return `<img src="${m.avatar}" class="inline-block h-5 w-5 rounded-full ring-2 ${roleClass} object-cover shadow-2xs" title="${m.name} (${m.role})">`;
    }
    return `<div class="inline-block h-5 w-5 rounded-full ring-2 ${roleClass} text-[8px] font-bold text-white flex items-center justify-center shadow-2xs" title="${m.name} (${m.role})">${inits}</div>`;
  }).join('');

  const extraBadge = extra > 0
    ? `<span class="inline-block h-5 w-5 rounded-full ring-2 ring-slate-400 bg-slate-600 text-[8px] font-bold text-white flex items-center justify-center shadow-2xs" title="+${extra} más">+${extra}</span>`
    : '';

  container.innerHTML = html + extraBadge;
}

// Renderizar todos los widgets de miembros asignados a cada pestaña
export function renderAllTabAssignedMembers() {
  ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora'].forEach(tabId => {
    renderTabAssignedAvatars(tabId);
  });
}

// Abrir modal para asignar miembros a una pestaña específica
export function openTabMembersAssignModal(tabId) {
  activeConfiguringTabId = tabId || 'cat';
  const meta = TAB_METADATA[activeConfiguringTabId] || TAB_METADATA.cat;

  const modal = document.getElementById('modal-asignar-miembros-pestana');
  if (!modal) return;

  const titleEl = document.getElementById('modal-tab-name-title');
  const projNameEl = document.getElementById('modal-tab-project-name');
  const iconEl = document.getElementById('modal-tab-badge-icon');

  if (titleEl) titleEl.textContent = meta.name;
  if (projNameEl) projNameEl.textContent = state.settings?.projectName || 'Proyecto de Obra';
  if (iconEl) iconEl.innerHTML = `<i class="${meta.icon}"></i>`;

  renderTabMembersModalList();

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeTabMembersAssignModal() {
  const modal = document.getElementById('modal-asignar-miembros-pestana');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  activeConfiguringTabId = null;
}

export function renderTabMembersModalList() {
  const container = document.getElementById('modal-tab-members-list');
  if (!container || !activeConfiguringTabId) return;

  const pId = getActiveOrFallbackProjectId();
  const members = getProjectMembers(pId);

  if (members.length === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-xs">
        <i class="fa-solid fa-users-slash text-2xl text-slate-400 mb-2 block"></i>
        No hay colaboradores invitados a este proyecto todavía.<br>
        <button type="button" onclick="closeTabMembersAssignModal(); openInviteModal();" class="mt-2 text-xs text-blue-600 font-bold hover:underline cursor-pointer">
          + Invitar colaboradores ahora
        </button>
      </div>
    `;
    return;
  }

  const roleBadges = {
    editar: '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">Editar</span>',
    escribir: '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">Escribir</span>',
    leer: '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Leer</span>'
  };

  container.innerHTML = members.map(m => {
    const hasAccess = Array.isArray(m.allowedTabs) ? m.allowedTabs.includes(activeConfiguringTabId) : true;
    const inits = (m.name || 'US').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'US';
    const avatarHtml = m.avatar && (m.avatar.startsWith('http') || m.avatar.startsWith('data:image'))
      ? `<img src="${m.avatar}" class="w-8 h-8 rounded-full object-cover border border-slate-300">`
      : `<div class="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">${inits}</div>`;

    return `
      <label class="flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none ${hasAccess ? 'bg-blue-50/50 border-blue-300' : 'bg-white border-slate-200 hover:bg-slate-50'}">
        <div class="flex items-center gap-2.5 min-w-0">
          <input type="checkbox" name="tab-member-check" value="${m.id}" ${hasAccess ? 'checked' : ''} onchange="onTabMemberCheckChange(this)" class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer">
          ${avatarHtml}
          <div class="min-w-0">
            <div class="font-bold text-xs text-slate-800 truncate">${m.name}</div>
            <div class="text-[10px] text-slate-500 font-mono truncate">${m.email}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${roleBadges[m.role] || roleBadges.editar}
        </div>
      </label>
    `;
  }).join('');
}

export function onTabMemberCheckChange(checkbox) {
  const card = checkbox.closest('label');
  if (card) {
    if (checkbox.checked) {
      card.className = "flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none bg-blue-50/50 border-blue-300";
    } else {
      card.className = "flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none bg-white border-slate-200 hover:bg-slate-50";
    }
  }
}

export function toggleSelectAllTabMembers(checkAll) {
  const checkboxes = document.querySelectorAll('input[name="tab-member-check"]');
  checkboxes.forEach(cb => {
    cb.checked = Boolean(checkAll);
    onTabMemberCheckChange(cb);
  });
}

export function saveTabMembersAssignment() {
  if (!activeConfiguringTabId) return;

  const checkboxes = document.querySelectorAll('input[name="tab-member-check"]:checked');
  const selectedMemberIds = Array.from(checkboxes).map(cb => cb.value);

  const pId = getActiveOrFallbackProjectId();
  setTabAssignedMembers(pId, activeConfiguringTabId, selectedMemberIds);

  const tabName = TAB_METADATA[activeConfiguringTabId]?.name || activeConfiguringTabId;
  showToast(`✅ Asignación guardada: ${selectedMemberIds.length} miembros tienen acceso a ${tabName}`, 'success');

  closeTabMembersAssignModal();
  renderAllTabAssignedMembers();
  updateNavigationTabsAccess();
}

// Simular vista como un colaborador específico para probar permisos de pestañas
export function simulateUserView(emailOrRole) {
  if (emailOrRole === 'admin') {
    const adminUser = {
      name: 'Administrador de Obra',
      email: 'admin.general@constructora.com',
      avatar: '',
      role: 'Admin General',
      sexo: 'Masculino'
    };
    saveCurrentUser(adminUser);
    updateWorkspaceHeaderUser(adminUser);
    updateNavigationTabsAccess();
    showToast('👁️ Vista restablecida como Administrador (Acceso total a todas las pestañas)', 'info');
    return;
  }

  const pId = getActiveOrFallbackProjectId();
  const members = getProjectMembers(pId);
  const mem = members.find(m => m.email === emailOrRole || m.id === emailOrRole);
  if (mem) {
    const simUser = {
      name: mem.name,
      email: mem.email,
      avatar: mem.avatar || '',
      role: mem.role,
      roleLabel: PROJECT_ROLES[mem.role]?.label || mem.role,
      sexo: 'Masculino'
    };
    saveCurrentUser(simUser);
    updateWorkspaceHeaderUser(simUser);
    updateNavigationTabsAccess();
    const tabNames = (mem.allowedTabs || []).map(t => TAB_METADATA[t]?.name).join(', ') || 'Ninguna pestaña';
    showToast(`🎭 Cambiado a vista de: ${mem.name} (Pestañas accesibles: ${tabNames})`, 'info');
  }
}

// Exponer utilidades del Portal a window para reactividad entre modales
if (typeof window !== 'undefined') {
  window.refreshProjectsGridUI = refreshProjectsGridUI;
  window.renderModeStatusBadgeHTML = renderModeStatusBadgeHTML;
  window.renderHeaderCreateButtonHTML = renderHeaderCreateButtonHTML;
}
