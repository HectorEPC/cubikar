// js/modules/portal/portalController.js
// Controlador integral para la pantalla de inicio, perfil, proyectos y navegación multi-obra

import {
  setActiveProjectId,
  getActiveProjectId
} from '../../config/constants.js';
import {
  getCurrentUser,
  saveCurrentUser,
  getProjectsList,
  getProjectById,
  createNewProject,
  duplicateProject,
  deleteProject,
  addProjectMember,
  removeProjectMember,
  updateProjectMemberRole,
  getProjectMembers,
  PROJECT_ROLES,
  AVATARS_BY_SEX,
  GOOGLE_PRESET_ACCOUNTS,
  SAMPLE_LOGOS
} from './projectService.js';
import { showToast } from '../../ui/notifications.js';
import { persistLocalData, state, initStore } from '../../state/store.js';
import { renderBrandingUI } from '../../ui/brandingController.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { updateSobrecostoBadge, updateGrandTotal } from '../../core/calculations.js';

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
  const urlParams = new URLSearchParams(window.location.search);
  const projIdFromUrl = urlParams.get('project');
  const user = getCurrentUser();

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
function showPortalView(mode = 'dashboard', returnProjectId = null) {
  const portalContainer = document.getElementById('view-portal');
  const workspaceContainer = document.getElementById('workspace-container');

  if (workspaceContainer) workspaceContainer.classList.add('hidden');
  if (portalContainer) {
    portalContainer.classList.remove('hidden');
    portalContainer.style.display = 'flex';
  }

  const user = getCurrentUser();
  if (mode === 'dashboard' && user) {
    renderPortalDashboard();
  } else {
    renderPortalAuth(mode === 'register' ? 'register' : 'login', returnProjectId);
  }
}

function showWorkspaceView(user, project) {
  const portalContainer = document.getElementById('view-portal');
  const workspaceContainer = document.getElementById('workspace-container');

  if (portalContainer) {
    portalContainer.classList.add('hidden');
    portalContainer.style.display = 'none';
  }
  if (workspaceContainer) {
    workspaceContainer.classList.remove('hidden');
  }

  updateWorkspaceHeaderUser(user);
}

// ==========================================
// PORTADA DE INICIO (INICIAR SESIÓN / REGISTRO)
// ==========================================
export function renderPortalAuth(initialTab = 'login', returnProjectId = null) {
  updatePortalHeaderUserArea(null);
  const main = document.getElementById('portal-main-container');
  if (!main) return;

  const savedUser = getCurrentUser();

  main.innerHTML = `
    <div class="max-w-xl mx-auto w-full bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in duration-200">
      
      <!-- Encabezado de la Portada -->
      <div class="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white p-6 sm:p-7 text-center relative overflow-hidden">
        <div class="w-12 h-12 mx-auto mb-2.5 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400 text-xl shadow-lg shadow-blue-600/20">
          <i class="fa-solid fa-hard-hat"></i>
        </div>
        <h1 class="text-xl sm:text-2xl font-black tracking-tight">Sistema de Control de Obra</h1>
        <p class="text-xs text-slate-300 mt-1 max-w-sm mx-auto">
          Presupuestos Base, Matrices de Precios Unitarios (APU) e Insumos Generales
        </p>
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
        <div class="relative flex items-center justify-center my-4">
          <div class="border-t border-slate-200 w-full"></div>
          <span class="bg-white px-3 text-[10px] text-slate-400 font-medium uppercase tracking-wider relative">o utiliza tu cuenta de correo</span>
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
        
        ${savedUser ? `
          <!-- Acceso rápido 1-clic si ya tiene perfil -->
          <div class="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-11 h-11 rounded-full overflow-hidden border-2 border-blue-600 bg-white shrink-0 shadow-xs">
                <img src="${savedUser.avatar}" alt="Avatar" class="w-full h-full object-cover">
              </div>
              <div class="min-w-0">
                <span class="text-[10px] text-blue-700 font-bold uppercase tracking-wider block">Perfil Detectado</span>
                <strong class="text-xs font-bold text-slate-900 block truncate">${savedUser.name}</strong>
                <span class="text-[11px] text-slate-500 font-mono truncate block">${savedUser.email}</span>
              </div>
            </div>
            <button type="button" onclick="quickLoginWithSavedUser('${returnProjectId || ''}')" class="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow transition shrink-0 flex items-center gap-1.5 active:scale-95 cursor-pointer">
              <span>Entrar</span> <i class="fa-solid fa-arrow-right text-[10px]"></i>
            </button>
          </div>
          <div class="text-center text-[11px] text-slate-400">O ingresa con otro correo electrónico:</div>
        ` : ''}

        <form onsubmit="handleLoginSubmit(event, '${returnProjectId || ''}')" class="space-y-3.5">
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1">Correo Electrónico Registrado *</label>
            <div class="relative">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i class="fa-solid fa-envelope text-xs"></i>
              </span>
              <input type="email" id="login-email" required placeholder="tu-correo@constructora.com" 
                     class="w-full pl-9 pr-3 py-2 border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs font-mono text-slate-800 transition">
            </div>
          </div>

          <button type="submit" class="w-full bg-slate-900 hover:bg-blue-600 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2 active:scale-98 cursor-pointer">
            <i class="fa-solid fa-right-to-bracket text-xs"></i>
            <span>Iniciar Sesión e Ir a Mi Perfil</span>
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

          <!-- 5. FECHA DE NACIMIENTO -->
          <div>
            <label class="block font-bold text-xs text-slate-700 mb-1">4. Fecha de Nacimiento *</label>
            <input type="date" id="reg-dob" required value="1992-06-15" class="w-full border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl p-2 text-xs font-sans">
          </div>

          <button type="submit" id="btn-submit-reg" class="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-98 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer">
            <span>Crear Perfil y Entrar a Mis Proyectos</span>
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

export function handleCustomPhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    customPhotoTemp = evt.target.result;
    const preview = document.getElementById('reg-avatar-preview');
    const label = document.getElementById('reg-avatar-label');
    if (preview) preview.src = customPhotoTemp;
    if (label) label.innerText = 'Foto personalizada cargada';
    showToast('Foto cargada exitosamente');
  };
  reader.readAsDataURL(file);
}

// Enviar Registro
export function handleRegisterSubmit(e, returnProjectId = '') {
  e.preventDefault();
  const name = document.getElementById('reg-fullname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const dob = document.getElementById('reg-dob').value;
  const sexo = selectedRegSexo;
  const avatar = customPhotoTemp || AVATARS_BY_SEX[sexo] || AVATARS_BY_SEX['Masculino'];

  const newUser = {
    name,
    email,
    sexo,
    dob,
    avatar,
    registeredAt: new Date().toISOString()
  };
  saveCurrentUser(newUser);
  showToast(`¡Bienvenido, ${name}! Tu perfil ha sido creado.`);

  if (returnProjectId) {
    openProjectInWorkspace(returnProjectId);
  } else {
    renderPortalDashboard();
  }
}

// Iniciar Sesión con correo existente
export function handleLoginSubmit(e, returnProjectId = '') {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();

  const savedUser = getCurrentUser();
  if (savedUser && savedUser.email && savedUser.email.toLowerCase() === email) {
    showToast(`¡Hola de nuevo, ${savedUser.name}!`);
    if (returnProjectId) {
      openProjectInWorkspace(returnProjectId);
    } else {
      renderPortalDashboard();
    }
  } else {
    // Si no existe perfil previo, crearlo con ese correo
    const nameFromEmail = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const tempUser = {
      name: nameFromEmail || 'Usuario de Obra',
      email: email,
      sexo: 'Masculino',
      dob: '1992-06-15',
      avatar: AVATARS_BY_SEX['Masculino'],
      registeredAt: new Date().toISOString()
    };
    saveCurrentUser(tempUser);
    showToast(`Perfil iniciado para ${email}`);
    if (returnProjectId) {
      openProjectInWorkspace(returnProjectId);
    } else {
      renderPortalDashboard();
    }
  }
}

export function quickLoginWithSavedUser(returnProjectId = '') {
  const savedUser = getCurrentUser();
  if (savedUser) {
    showToast(`Sesión iniciada como ${savedUser.name}`);
    if (returnProjectId) {
      openProjectInWorkspace(returnProjectId);
    } else {
      renderPortalDashboard();
    }
  }
}

// ==========================================
// CONECTOR GOOGLE / GMAIL AUTO-FILL
// ==========================================
export function triggerGoogleSignIn() {
  const modal = document.getElementById('modal-google-auth');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
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

// ==========================================
// VISTA: DASHBOARD "MIS PROYECTOS"
// ==========================================
export function renderPortalDashboard() {
  const user = getCurrentUser();
  if (!user) {
    renderPortalAuth('login');
    return;
  }
  updatePortalHeaderUserArea(user);

  const projects = getProjectsList();
  const main = document.getElementById('portal-main-container');
  if (!main) return;

  main.innerHTML = `
    <div class="max-w-6xl mx-auto w-full space-y-5 animate-in fade-in duration-200">
      
      <!-- Área de Perfil del Usuario: Usuario del lado derecho en la parte superior -->
      <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white rounded-3xl p-5 sm:p-6 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        <!-- Lado Izquierdo: Información y Estado de Obras -->
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">Panel de Control</span>
            <span class="text-xs text-slate-300 font-mono">• ${projects.length} Proyectos Registrados</span>
          </div>
          <h1 class="font-black text-xl sm:text-2xl text-white tracking-tight">Mis Proyectos de Obra</h1>
          <p class="text-xs text-slate-300">Presupuestos base, análisis de precios unitarios, catálogos e insumos generales.</p>
        </div>

        <!-- Lado Derecho: Usuario en la parte superior con Menú Desplegable (Editar perfil y Cerrar sesión) -->
        <div class="relative self-end sm:self-auto shrink-0" id="portal-user-menu-wrapper">
          <button type="button" id="portal-user-btn" onclick="togglePortalUserDropdown(event)" 
                  class="flex items-center gap-3 bg-slate-800/95 hover:bg-slate-800 border border-slate-700 hover:border-blue-400 p-1.5 pl-3 pr-3.5 rounded-2xl cursor-pointer transition select-none shadow-md group" 
                  title="Opciones de perfil: Editar perfil y Cerrar sesión">
            <div class="text-right">
              <span class="font-bold text-xs sm:text-sm text-white block max-w-[160px] truncate group-hover:text-blue-300 transition">${user.name}</span>
              <span class="text-[10px] text-slate-400 font-mono block truncate">${user.email}</span>
            </div>
            <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-blue-400 bg-white shrink-0 shadow-xs">
              <img src="${user.avatar}" class="w-full h-full object-cover" alt="Perfil">
            </div>
            <i class="fa-solid fa-chevron-down text-xs text-slate-400 group-hover:text-blue-400 transition ml-0.5"></i>
          </button>

          <!-- Dropdown Desplegable: Editar Perfil y Cerrar Sesión -->
          <div id="portal-user-dropdown" class="hidden absolute right-0 top-full mt-2 w-60 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 text-slate-800 animate-in fade-in zoom-in-95 duration-100">
            <!-- Header del Dropdown con Datos de Perfil -->
            <div class="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-full overflow-hidden border border-blue-400 bg-slate-100 shrink-0">
                <img src="${user.avatar}" class="w-full h-full object-cover" alt="Avatar">
              </div>
              <div class="min-w-0 flex-1">
                <span class="font-bold text-xs text-slate-900 block truncate">${user.name}</span>
                <span class="text-[10px] text-emerald-600 font-semibold block flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span> Perfil Activo
                </span>
              </div>
            </div>

            <!-- Opciones: Editar Perfil y Cerrar Sesión -->
            <div class="p-1.5 space-y-1 text-xs font-semibold">
              <button type="button" onclick="openProfileModal(); closePortalUserDropdown();" 
                      class="w-full text-left px-3 py-2 rounded-xl hover:bg-blue-50 text-slate-700 hover:text-blue-700 flex items-center gap-2.5 transition cursor-pointer">
                <i class="fa-solid fa-user-pen text-blue-600 text-sm"></i>
                <span>Editar perfil</span>
              </button>

              <button type="button" onclick="logoutUser()" 
                      class="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 text-rose-600 flex items-center gap-2.5 transition cursor-pointer">
                <i class="fa-solid fa-power-off text-rose-500 text-sm"></i>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      <!-- Fila de Búsqueda y Botón Independiente "Nuevo Proyecto" -->
      <div class="flex flex-col md:flex-row items-stretch md:items-start gap-3">
        
        <!-- Barra de Búsqueda y Filtros (Más compacta para que quepa el botón independiente) -->
        <div class="flex-1 bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
          
          <!-- Fila Superior: Buscador y Contador -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div class="relative flex-1">
              <span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <i class="fa-solid fa-magnifying-glass text-xs"></i>
              </span>
              <input type="text" id="project-search" oninput="onProjectSearchInput(this.value)" value="${currentSearchQuery}" placeholder="Buscar por nombre, empresa, tipo o ubicación..." 
                     class="w-full pl-9 pr-3 py-1.5 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-xs">
            </div>

            <div class="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <span class="text-xs text-slate-500 font-bold font-mono" id="projects-counter-badge">${projects.length} proyectos</span>
              <button id="btn-reset-filters" type="button" onclick="resetProjectFilters()" class="${(currentCompanyFilter !== 'all' || currentTipoObraFilter !== 'all' || currentSearchQuery !== '' || currentSortMode !== 'date-desc') ? '' : 'hidden'} text-[11px] text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2 py-1 font-semibold transition cursor-pointer">
                <i class="fa-solid fa-rotate-left mr-1"></i> Limpiar
              </button>
            </div>
          </div>

          <!-- Fila Inferior: Barra de Botones de Filtrar y Acomodar -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
            
            <!-- FILTRAR POR: Empresa y Tipo de Obra -->
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-0.5">
                <i class="fa-solid fa-filter text-[10px]"></i> Filtrar:
              </span>

              <!-- Botón / Selector Empresa -->
              <div id="wrapper-filter-company" class="flex items-center ${currentCompanyFilter !== 'all' ? 'bg-blue-50 border-blue-400 text-blue-900 font-semibold' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'} border rounded-xl px-2.5 py-1 transition shadow-2xs">
                <i class="fa-solid fa-building text-blue-600 text-[11px] mr-1.5"></i>
                <select id="filter-company-select" onchange="setCompanyFilter(this.value)" class="bg-transparent font-semibold text-xs focus:outline-none cursor-pointer pr-1">
                  <option value="all">Todas las empresas</option>
                  ${renderCompanyOptionsHTML(projects)}
                </select>
              </div>

              <!-- Botón / Selector Tipo de Obra -->
              <div id="wrapper-filter-tipo" class="flex items-center ${currentTipoObraFilter !== 'all' ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'} border rounded-xl px-2.5 py-1 transition shadow-2xs">
                <i class="fa-solid fa-trowel-bricks text-emerald-600 text-[11px] mr-1.5"></i>
                <select id="filter-tipo-select" onchange="setTipoObraFilter(this.value)" class="bg-transparent font-semibold text-xs focus:outline-none cursor-pointer pr-1">
                  <option value="all" ${currentTipoObraFilter === 'all' ? 'selected' : ''}>Todos los tipos</option>
                  <option value="Edificación" ${currentTipoObraFilter === 'Edificación' ? 'selected' : ''}>Edificación</option>
                  <option value="Vivienda" ${currentTipoObraFilter === 'Vivienda' ? 'selected' : ''}>Vivienda</option>
                  <option value="Obra Civil" ${currentTipoObraFilter === 'Obra Civil' ? 'selected' : ''}>Obra Civil</option>
                  <option value="Infraestructura" ${currentTipoObraFilter === 'Infraestructura' ? 'selected' : ''}>Infraestructura</option>
                  <option value="Remodelación" ${currentTipoObraFilter === 'Remodelación' ? 'selected' : ''}>Remodelación</option>
                  <option value="Industrial" ${currentTipoObraFilter === 'Industrial' ? 'selected' : ''}>Industrial / Comercial</option>
                </select>
              </div>
            </div>

            <!-- ACOMODAR POR: Fecha de Creación y De la A a la Z -->
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-0.5">
                <i class="fa-solid fa-arrow-down-short-wide text-[10px]"></i> Acomodar:
              </span>

              <!-- Botón Fecha de Creación -->
              <button type="button" id="btn-sort-date" onclick="toggleSortDate()" 
                      class="px-2.5 py-1 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${currentSortMode.startsWith('date') ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-sm' : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs'}" 
                      title="Acomodar conforme a la fecha de creación">
                <i class="fa-regular fa-calendar-days text-[11px]"></i>
                <span>Fecha</span>
                <i id="icon-sort-date" class="fa-solid ${currentSortMode === 'date-asc' ? 'fa-arrow-up' : 'fa-arrow-down'} text-[10px]"></i>
              </button>

              <!-- Botón De la A a la Z -->
              <button type="button" id="btn-sort-az" onclick="toggleSortAZ()" 
                      class="px-2.5 py-1 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${currentSortMode.startsWith('az') ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-sm' : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs'}" 
                      title="Acomodar alfabéticamente de la A a la Z por nombre de proyecto">
                <i class="fa-solid ${currentSortMode === 'az-desc' ? 'fa-arrow-up-z-a' : 'fa-arrow-down-a-z'} text-[11px]"></i>
                <span>A - Z</span>
                <i id="icon-sort-az" class="fa-solid ${currentSortMode === 'az-desc' ? 'fa-arrow-up' : 'fa-arrow-down'} text-[10px] ${currentSortMode.startsWith('az') ? '' : 'hidden'}"></i>
              </button>
            </div>

          </div>

        </div>

        <!-- BOTÓN INDEPENDIENTE "NUEVO PROYECTO" (LADO DERECHO) -->
        <button type="button" onclick="openNuevoProyectoModal()" 
                class="shrink-0 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs sm:text-sm px-5 py-3.5 sm:py-4 rounded-2xl shadow-lg shadow-blue-600/30 border border-blue-500/40 transition flex items-center justify-center gap-2 cursor-pointer h-full self-stretch md:self-auto hover:shadow-xl" 
                title="Crear un nuevo proyecto de obra">
          <i class="fa-solid fa-plus text-sm sm:text-base"></i>
          <span class="tracking-wide whitespace-nowrap">Nuevo Proyecto</span>
        </button>

      </div>

      <!-- Cuadrícula de Proyectos -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="projects-grid">
        ${renderProjectCardsHTML()}
      </div>

    </div>
  `;
}

export function renderMemberAvatarsHTML(members, projId) {
  if (!Array.isArray(members) || members.length === 0) {
    return `<span class="text-[10px] text-slate-400 italic">Sin colaboradores</span>`;
  }

  const roleStyles = {
    editar: { label: 'Editar (Control total)', tag: 'Editar', badgeClass: 'bg-blue-600 text-white' },
    escribir: { label: 'Escribir (Captura APU/Insumos)', tag: 'Escribir', badgeClass: 'bg-emerald-600 text-white' },
    leer: { label: 'Leer (Solo lectura)', tag: 'Leer', badgeClass: 'bg-amber-600 text-white' }
  };

  const maxVisible = 5;
  const visible = members.slice(0, maxVisible);
  const extra = members.length - maxVisible;

  const avatarsHtml = visible.map(m => {
    const roleInfo = roleStyles[m.role] || roleStyles.editar;
    const tooltipText = `${m.name} • Permiso: ${roleInfo.label}`;
    return `
      <div class="relative group/avatar inline-block z-10 hover:z-20 cursor-pointer" onclick="openInviteModal('${projId}')" title="${tooltipText}">
        <div class="w-7 h-7 rounded-full overflow-hidden border-2 border-white shadow-2xs hover:scale-115 transition-transform bg-slate-200">
          <img src="${m.avatar || AVATARS_BY_SEX['Masculino']}" alt="${m.name}" class="w-full h-full object-cover">
        </div>
        <!-- Tooltip flotante con nombre y permiso al pasar el cursor -->
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/avatar:flex flex-col items-center z-40 pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
          <div class="bg-slate-900 text-white text-[10px] font-semibold rounded-lg py-1 px-2.5 shadow-xl flex items-center gap-1.5 border border-slate-700">
            <span class="max-w-[140px] truncate">${m.name}</span>
            <span class="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${roleInfo.badgeClass}">${roleInfo.tag}</span>
          </div>
          <div class="w-1.5 h-1.5 bg-slate-900 rotate-45 -mt-1 border-r border-b border-slate-700"></div>
        </div>
      </div>
    `;
  }).join('');

  const extraHtml = extra > 0 ? `
    <div class="w-7 h-7 rounded-full bg-slate-200 border-2 border-white text-slate-700 text-[10px] font-bold flex items-center justify-center shadow-2xs cursor-pointer z-0 hover:scale-110 transition-transform" onclick="openInviteModal('${projId}')" title="${extra} colaboradores más">
      +${extra}
    </div>
  ` : '';

  return avatarsHtml + extraHtml;
}

// ==========================================
// FILTROS Y ORDENAMIENTO EN "MIS PROYECTOS"
// ==========================================
let currentSearchQuery = '';
let currentCompanyFilter = 'all';
let currentTipoObraFilter = 'all';
let currentSortMode = 'date-desc'; // 'date-desc' | 'date-asc' | 'az-asc' | 'az-desc'

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

export function toggleSortDate() {
  if (currentSortMode === 'date-desc') {
    currentSortMode = 'date-asc';
    showToast('Acomodado: Proyectos más antiguos primero');
  } else {
    currentSortMode = 'date-desc';
    showToast('Acomodado: Proyectos más recientes primero');
  }
  refreshProjectsGridUI();
}

export function toggleSortAZ() {
  if (currentSortMode === 'az-asc') {
    currentSortMode = 'az-desc';
    showToast('Acomodado: De la Z a la A');
  } else {
    currentSortMode = 'az-asc';
    showToast('Acomodado: De la A a la Z');
  }
  refreshProjectsGridUI();
}

export function resetProjectFilters() {
  currentSearchQuery = '';
  currentCompanyFilter = 'all';
  currentTipoObraFilter = 'all';
  currentSortMode = 'date-desc';

  const searchInput = document.getElementById('project-search');
  if (searchInput) searchInput.value = '';

  const compSelect = document.getElementById('filter-company-select');
  if (compSelect) compSelect.value = 'all';

  const tipoSelect = document.getElementById('filter-tipo-select');
  if (tipoSelect) tipoSelect.value = 'all';

  refreshProjectsGridUI();
  showToast('Filtros restablecidos');
}

export function refreshProjectsGridUI() {
  const grid = document.getElementById('projects-grid');
  if (grid) {
    grid.innerHTML = renderProjectCardsHTML();
  }
  updateSortButtonsUI();
}

function updateSortButtonsUI() {
  const btnDate = document.getElementById('btn-sort-date');
  const btnAZ = document.getElementById('btn-sort-az');
  const iconDate = document.getElementById('icon-sort-date');
  const iconAZ = document.getElementById('icon-sort-az');
  const btnReset = document.getElementById('btn-reset-filters');
  const compWrapper = document.getElementById('wrapper-filter-company');
  const tipoWrapper = document.getElementById('wrapper-filter-tipo');

  const isFiltered = currentCompanyFilter !== 'all' || currentTipoObraFilter !== 'all' || currentSearchQuery !== '' || currentSortMode !== 'date-desc';
  if (btnReset) {
    if (isFiltered) {
      btnReset.classList.remove('hidden');
    } else {
      btnReset.classList.add('hidden');
    }
  }

  if (compWrapper) {
    if (currentCompanyFilter !== 'all') {
      compWrapper.className = "flex items-center bg-blue-50 border border-blue-400 text-blue-900 font-semibold rounded-xl px-2.5 py-1 transition shadow-2xs";
    } else {
      compWrapper.className = "flex items-center bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl px-2.5 py-1 transition shadow-2xs";
    }
  }

  if (tipoWrapper) {
    if (currentTipoObraFilter !== 'all') {
      tipoWrapper.className = "flex items-center bg-emerald-50 border border-emerald-400 text-emerald-900 font-semibold rounded-xl px-2.5 py-1 transition shadow-2xs";
    } else {
      tipoWrapper.className = "flex items-center bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl px-2.5 py-1 transition shadow-2xs";
    }
  }

  if (btnDate && iconDate) {
    if (currentSortMode.startsWith('date')) {
      btnDate.className = "px-2.5 py-1 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer bg-blue-600 border-blue-600 text-white shadow-sm active:scale-95";
      if (currentSortMode === 'date-desc') {
        iconDate.className = "fa-solid fa-arrow-down text-[10px]";
        btnDate.title = "Acomodado: Más recientes primero (clic para más antiguos)";
      } else {
        iconDate.className = "fa-solid fa-arrow-up text-[10px]";
        btnDate.title = "Acomodado: Más antiguos primero (clic para más recientes)";
      }
    } else {
      btnDate.className = "px-2.5 py-1 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs active:scale-95";
      iconDate.className = "fa-solid fa-arrow-down text-slate-400 text-[10px]";
      btnDate.title = "Clic para acomodar conforme a la fecha de creación";
    }
  }

  if (btnAZ && iconAZ) {
    if (currentSortMode.startsWith('az')) {
      btnAZ.className = "px-2.5 py-1 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer bg-blue-600 border-blue-600 text-white shadow-sm active:scale-95";
      iconAZ.classList.remove('hidden');
      if (currentSortMode === 'az-asc') {
        iconAZ.className = "fa-solid fa-arrow-down text-[10px]";
        btnAZ.title = "Acomodado: De la A a la Z (clic para Z a la A)";
      } else {
        iconAZ.className = "fa-solid fa-arrow-up text-[10px]";
        btnAZ.title = "Acomodado: De la Z a la A (clic para A a la Z)";
      }
    } else {
      btnAZ.className = "px-2.5 py-1 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer bg-white hover:bg-slate-100 border-slate-300 text-slate-700 shadow-2xs active:scale-95";
      iconAZ.classList.add('hidden');
      btnAZ.title = "Clic para acomodar alfabéticamente de la A a la Z";
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

export function renderProjectCardsHTML() {
  const allProjects = getProjectsList();
  if (allProjects.length === 0) {
    return `
      <div class="col-span-full bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
        <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mx-auto">
          <i class="fa-solid fa-folder-open"></i>
        </div>
        <h3 class="font-bold text-base text-slate-800">Aún no tienes proyectos creados</h3>
        <p class="text-xs text-slate-500 max-w-sm mx-auto">Crea tu primer proyecto para comenzar a registrar partidas, APU e insumos generales con configuración personalizada.</p>
        <button onclick="openNuevoProyectoModal()" class="mt-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl shadow transition cursor-pointer">
          <i class="fa-solid fa-plus mr-1"></i> Crear Proyecto Ahora
        </button>
      </div>
    `;
  }

  let filtered = [...allProjects];

  // 1. Filtrar por búsqueda de texto
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase().trim();
    filtered = filtered.filter(p =>
      (p.projectName && p.projectName.toLowerCase().includes(q)) ||
      (p.companyName && p.companyName.toLowerCase().includes(q)) ||
      (p.projectLocation && p.projectLocation.toLowerCase().includes(q)) ||
      (p.tipoObra && p.tipoObra.toLowerCase().includes(q))
    );
  }

  // 2. Filtrar por Empresa
  if (currentCompanyFilter && currentCompanyFilter !== 'all') {
    filtered = filtered.filter(p => p.companyName && p.companyName.toLowerCase() === currentCompanyFilter.toLowerCase());
  }

  // 3. Filtrar por Tipo de Obra
  if (currentTipoObraFilter && currentTipoObraFilter !== 'all') {
    filtered = filtered.filter(p => p.tipoObra && p.tipoObra.toLowerCase() === currentTipoObraFilter.toLowerCase());
  }

  // 4. Acomodar / Ordenar
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

  // Actualizar contador en el DOM si existe
  const counterEl = document.getElementById('projects-counter-badge');
  if (counterEl) {
    counterEl.textContent = `${filtered.length} de ${allProjects.length} proyectos`;
  }

  if (filtered.length === 0) {
    return `
      <div class="col-span-full bg-white rounded-3xl border border-slate-200 p-10 text-center text-xs text-slate-500 space-y-3">
        <div class="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center text-xl mx-auto">
          <i class="fa-solid fa-filter-circle-xmark"></i>
        </div>
        <p class="font-semibold text-slate-700">No se encontraron proyectos con los filtros aplicados.</p>
        <p class="text-slate-400 text-[11px]">Intenta seleccionar otra empresa, tipo de obra o término de búsqueda.</p>
        <button onclick="resetProjectFilters()" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-xl font-bold transition cursor-pointer">
          <i class="fa-solid fa-rotate-left text-xs"></i> Restablecer filtros
        </button>
      </div>
    `;
  }

  return filtered.map(proj => `
    <div class="bg-white rounded-2xl border border-slate-200 hover:border-blue-400 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col group">
      
      <!-- Encabezado de la Tarjeta con Logo, Empresa, Tipo de Obra y Fecha -->
      <div class="p-4 border-b border-slate-100 flex items-start gap-3 bg-slate-50/50">
        <div class="w-11 h-11 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 shadow-2xs">
          ${proj.companyLogo ? `<img src="${proj.companyLogo}" class="max-h-full max-w-full object-contain">` : `<i class="fa-solid fa-building text-slate-400"></i>`}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-1 mb-0.5">
            <span class="text-[10px] text-blue-600 font-bold uppercase tracking-wider block truncate">${proj.companyName}</span>
            <span class="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
              <i class="fa-solid fa-tag text-[8px] text-blue-500"></i> ${proj.tipoObra || 'Edificación'}
            </span>
          </div>
          <h3 class="font-bold text-sm text-slate-900 truncate group-hover:text-blue-700 transition" title="${proj.projectName}">${proj.projectName}</h3>
          <div class="flex items-center justify-between text-[11px] text-slate-500 mt-1 gap-2">
            <p class="truncate flex items-center gap-1" title="${proj.projectLocation}">
              <i class="fa-solid fa-location-dot text-rose-500 text-[10px]"></i>
              <span class="truncate">${proj.projectLocation}</span>
            </p>
            <span class="text-[10px] text-slate-400 font-mono shrink-0 flex items-center gap-1" title="Fecha de creación: ${proj.createdAt || '---'}">
              <i class="fa-regular fa-calendar text-[10px]"></i> ${proj.createdAt || '---'}
            </span>
          </div>
        </div>
      </div>

      <!-- Métricas del Proyecto -->
      <div class="p-4 space-y-2.5 flex-1 text-xs">
        <div class="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-100">
          <span class="text-slate-500 text-[11px]">Presupuesto Base:</span>
          <span class="font-bold font-mono text-slate-900 text-sm">
            ${proj.currencySymbol || '$'}${Number(proj.totalPresupuesto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="text-[10px] text-slate-400 font-sans">${proj.currency || 'MXN'}</span>
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
          <div class="flex items-center gap-1.5">
            <i class="fa-solid fa-list-check text-blue-500 text-[10px]"></i>
            <span>${proj.conceptCount || 0} conceptos</span>
          </div>
          <div class="flex items-center gap-1.5">
            <i class="fa-solid fa-percent text-amber-500 text-[10px]"></i>
            <span>Sobrecosto: ${((Number(proj.factorSobrecosto || 1.2584) - 1) * 100).toFixed(2)}%</span>
          </div>
        </div>
      </div>

      <!-- Apartado de Colaboradores e Invitaciones de Usuarios -->
      <div class="px-3.5 py-2 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Equipo:</span>
          <div class="flex items-center -space-x-1.5 overflow-visible py-0.5">
            ${renderMemberAvatarsHTML(proj.members, proj.id)}
          </div>
        </div>
        <button type="button" onclick="openInviteModal('${proj.id}')" class="shrink-0 inline-flex items-center gap-1 bg-white hover:bg-blue-50 text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg px-2 py-1 text-[11px] font-semibold transition shadow-2xs cursor-pointer" title="Agregar o invitar usuarios con permisos de editar, escribir o leer">
          <i class="fa-solid fa-user-plus text-[10px]"></i>
          <span>Invitar</span>
        </button>
      </div>

      <!-- Botones de Acción (Abrir en esta ventana vs Abrir en nueva pestaña) -->
      <div class="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
        <button onclick="openProjectInWorkspace('${proj.id}')" class="flex-1 bg-slate-900 hover:bg-blue-600 active:scale-95 text-white text-xs font-semibold py-1.5 px-3 rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer" title="Entrar al espacio de trabajo de este proyecto">
          <i class="fa-solid fa-folder-open text-[11px]"></i> Abrir
        </button>

        <!-- ABRIR EN PESTAÑA INDEPENDIENTE -->
        <button onclick="openProjectInNewTab('${proj.id}')" class="bg-white hover:bg-slate-100 text-blue-700 border border-blue-200 text-xs font-semibold py-1.5 px-2.5 rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer" title="Abrir este proyecto en una pestaña independiente del navegador">
          <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> Pestaña Nueva
        </button>

        <button onclick="duplicateProjectAction('${proj.id}')" class="text-slate-400 hover:text-slate-700 p-1.5 rounded transition cursor-pointer" title="Duplicar proyecto">
          <i class="fa-solid fa-copy text-xs"></i>
        </button>

        <button onclick="deleteProjectAction('${proj.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 rounded transition cursor-pointer" title="Eliminar proyecto">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      </div>

    </div>
  `).join('');
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
  window.location.href = window.location.pathname;
}

export function duplicateProjectAction(projectId) {
  const dup = duplicateProject(projectId);
  if (dup) {
    showToast(`Proyecto "${dup.projectName}" duplicado exitosamente`);
    renderPortalDashboard();
  }
}

export function deleteProjectAction(projectId) {
  const p = getProjectById(projectId);
  if (!p) return;
  if (!confirm(`¿Deseas eliminar el proyecto "${p.projectName}"? Esta acción eliminará su catálogo y configuración.`)) return;
  deleteProject(projectId);
  showToast('Proyecto eliminado', false);
  renderPortalDashboard();
}

// ==========================================
// ASISTENTE NUEVO PROYECTO (WIZARD 2 PASOS)
// ==========================================
export function openNuevoProyectoModal() {
  wizardData.step = 1;
  wizardData.logo = '';
  clearWizardLogo();
  
  const cName = document.getElementById('wiz-company-name');
  const pName = document.getElementById('wiz-project-name');
  const pLoc = document.getElementById('wiz-project-location');
  const pTipo = document.getElementById('wiz-project-tipo');
  const pDate = document.getElementById('wiz-project-created-at');
  if (cName) cName.value = '';
  if (pName) pName.value = '';
  if (pLoc) pLoc.value = '';
  if (pTipo) pTipo.value = 'Edificación';
  if (pDate) pDate.value = new Date().toISOString().slice(0, 10);
  
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

export function handleWizardLogoFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    setWizardLogoImage(evt.target.result);
  };
  reader.readAsDataURL(file);
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
  if (fb) fb.classList.add('hidden');
}

export function clearWizardLogo() {
  wizardData.logo = '';
  const img = document.getElementById('wizard-logo-img');
  const fb = document.getElementById('wizard-logo-fallback');
  if (img) { img.src = ''; img.classList.add('hidden'); }
  if (fb) fb.classList.remove('hidden');
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

  const f = apply ? (1 + ind/100) * (1 + fin/100) * (1 + uti/100) * (1 + adi/100) : 1.0;
  const pct = ((f - 1) * 100).toFixed(2);
  const previewEl = document.getElementById('wiz-factor-preview');
  if (previewEl) previewEl.innerText = `${f.toFixed(4)} (+${pct}%)`;
}

export function updateTemplateSelection() {
  const checked = document.querySelector('input[name="wiz-template"]:checked');
  const val = checked ? checked.value : 'demo';
  const lblDemo = document.getElementById('lbl-tpl-demo');
  const lblBlank = document.getElementById('lbl-tpl-blank');
  if (!lblDemo || !lblBlank) return;
  if (val === 'demo') {
    lblDemo.className = "p-2.5 bg-slate-50 border-2 border-blue-500 rounded-lg cursor-pointer flex items-start gap-2 select-none";
    lblBlank.className = "p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer flex items-start gap-2 select-none";
  } else {
    lblDemo.className = "p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer flex items-start gap-2 select-none";
    lblBlank.className = "p-2.5 bg-slate-50 border-2 border-blue-500 rounded-lg cursor-pointer flex items-start gap-2 select-none";
  }
}

export function finalizeCreateProject() {
  const company = document.getElementById('wiz-company-name').value.trim();
  const project = document.getElementById('wiz-project-name').value.trim();
  const location = document.getElementById('wiz-project-location').value.trim();
  const tipoObra = (document.getElementById('wiz-project-tipo') && document.getElementById('wiz-project-tipo').value) || 'Edificación';
  const createdAt = (document.getElementById('wiz-project-created-at') && document.getElementById('wiz-project-created-at').value) || new Date().toISOString().slice(0, 10);
  const currency = document.getElementById('wiz-currency-select').value;
  const symbol = document.getElementById('wiz-currency-symbol').value.trim();
  const apply = document.getElementById('wiz-apply-sobrecosto').checked;
  const ind = parseFloat(document.getElementById('wiz-indirectos').value) || 0;
  const fin = parseFloat(document.getElementById('wiz-financiamiento').value) || 0;
  const uti = parseFloat(document.getElementById('wiz-utilidad').value) || 0;
  const adi = parseFloat(document.getElementById('wiz-adicionales').value) || 0;
  const tplEl = document.querySelector('input[name="wiz-template"]:checked');
  const tpl = tplEl ? tplEl.value : 'demo';

  const newProj = createNewProject({
    companyName: company,
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
    template: tpl
  });

  closeNuevoProyectoModal();
  showToast('¡Proyecto creado con éxito! Abriendo espacio de trabajo...');
  openProjectInWorkspace(newProj.id);
}

// ==========================================
// MODAL: PERFIL DE USUARIO
// ==========================================
export function openProfileModal() {
  const u = getCurrentUser();
  if (!u) return;

  const n = document.getElementById('profile-edit-name');
  const e = document.getElementById('profile-edit-email');
  const s = document.getElementById('profile-edit-sexo');
  const d = document.getElementById('profile-edit-dob');
  const a = document.getElementById('profile-edit-avatar-img');

  if (n) n.value = u.name;
  if (e) e.value = u.email;
  if (s) s.value = u.sexo || 'Masculino';
  if (d) d.value = u.dob || '1992-06-15';
  if (a) a.src = u.avatar;

  const modal = document.getElementById('modal-perfil-usuario');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
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
    saveCurrentUser(u);
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
  saveCurrentUser(u);
}

export function handleProfilePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const u = getCurrentUser();
    if (u) {
      u.avatar = evt.target.result;
      const a = document.getElementById('profile-edit-avatar-img');
      if (a) a.src = evt.target.result;
      saveCurrentUser(u);
      showToast('Foto de perfil actualizada');
    }
  };
  reader.readAsDataURL(file);
}

export function saveProfileChanges() {
  const u = getCurrentUser();
  if (!u) return;

  u.name = document.getElementById('profile-edit-name').value.trim();
  u.email = document.getElementById('profile-edit-email').value.trim();
  u.sexo = document.getElementById('profile-edit-sexo').value;
  u.dob = document.getElementById('profile-edit-dob').value;
  
  saveCurrentUser(u);
  closeProfileModal();
  updateWorkspaceHeaderUser(u);

  const grid = document.getElementById('projects-grid');
  if (grid) {
    renderPortalDashboard();
  }
  showToast('Perfil actualizado correctamente');
}

export function logoutUser() {
  if (!confirm('¿Deseas cerrar sesión para cambiar de usuario? Tus proyectos se conservarán.')) return;
  saveCurrentUser(null);
  window.location.href = window.location.pathname;
}

// ==========================================
// USUARIO EN LA BARRA SUPERIOR DEL PORTAL
// ==========================================
export function updatePortalHeaderUserArea(user) {
  const container = document.getElementById('portal-header-user-area');
  if (!container) return;

  if (!user) {
    container.innerHTML = `
      <button onclick="renderPortalAuth('login')" class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer">
        <i class="fa-solid fa-right-to-bracket text-blue-400"></i> Iniciar Sesión
      </button>
      <button onclick="renderPortalAuth('register')" class="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer">
        <i class="fa-solid fa-user-plus"></i> Registrarse
      </button>
    `;
    return;
  }

  container.innerHTML = `
    <button onclick="renderPortalDashboard()" class="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 font-medium mr-1 bg-slate-900 border border-slate-800 cursor-pointer">
      <i class="fa-solid fa-layer-group text-blue-400"></i> Mis Proyectos
    </button>

    <div class="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 p-1 pl-3 rounded-full cursor-pointer transition select-none" onclick="openProfileModal()" title="Ver y editar mi perfil">
      <span class="text-xs font-semibold text-white max-w-[140px] truncate">${user.name}</span>
      <div class="w-7 h-7 rounded-full overflow-hidden border border-blue-400 bg-white shrink-0">
        <img src="${user.avatar}" class="w-full h-full object-cover" alt="Avatar">
      </div>
    </div>

    <button onclick="logoutUser()" class="text-slate-400 hover:text-rose-400 text-xs p-2 transition ml-1 cursor-pointer" title="Cerrar sesión / Cambiar de usuario">
      <i class="fa-solid fa-power-off"></i>
    </button>
  `;
}

// ==========================================
// USUARIO Y MENÚ DESPLEGABLE EN EL ESPACIO DE TRABAJO
// ==========================================
export function toggleUserDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('workspace-user-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

export function closeUserDropdown() {
  const dropdown = document.getElementById('workspace-user-dropdown');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    dropdown.classList.add('hidden');
  }
}

export function togglePortalUserDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('portal-user-dropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

export function closePortalUserDropdown() {
  const dropdown = document.getElementById('portal-user-dropdown');
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

function updateWorkspaceHeaderUser(user) {
  const nameEl = document.getElementById('workspace-user-name');
  const avatarEl = document.getElementById('workspace-user-avatar');
  const dropNameEl = document.getElementById('dropdown-user-name');
  const dropEmailEl = document.getElementById('dropdown-user-email');
  const dropAvatarEl = document.getElementById('dropdown-user-avatar');

  if (user) {
    if (nameEl) nameEl.innerText = user.name;
    if (avatarEl) avatarEl.src = user.avatar;
    if (dropNameEl) dropNameEl.innerText = user.name;
    if (dropEmailEl) dropEmailEl.innerText = user.email;
    if (dropAvatarEl) dropAvatarEl.src = user.avatar;
  }
}

// ==========================================
// GESTIÓN DE COLABORADORES E INVITACIONES POR PROYECTO
// ==========================================
let activeInviteProjectId = null;
let selectedInviteSexo = 'Masculino';
let inviteCustomAvatarTemp = null;

export function openInviteModal(projectId) {
  activeInviteProjectId = projectId;
  const proj = getProjectById(projectId);
  if (!proj) return;

  const modal = document.getElementById('modal-invitar-usuario');
  if (!modal) return;

  const nameBadge = document.getElementById('invite-modal-project-name');
  if (nameBadge) nameBadge.textContent = proj.projectName;

  // Limpiar campos
  const nameInput = document.getElementById('invite-member-name');
  const emailInput = document.getElementById('invite-member-email');
  if (nameInput) nameInput.value = '';
  if (emailInput) emailInput.value = '';

  selectedInviteSexo = 'Masculino';
  inviteCustomAvatarTemp = null;
  updateInviteAvatarPreview();

  // Resetear rol a 'editar'
  const defaultRadio = document.querySelector('input[name="invite-role"][value="editar"]');
  if (defaultRadio) defaultRadio.checked = true;

  renderInviteModalMembersList();

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
}

export function setInviteSexo(sexo) {
  selectedInviteSexo = sexo;
  inviteCustomAvatarTemp = null;
  updateInviteAvatarPreview();
}

export function handleInvitePhotoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    inviteCustomAvatarTemp = evt.target.result;
    updateInviteAvatarPreview();
  };
  reader.readAsDataURL(file);
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

export function submitInviteMember(e) {
  if (e) e.preventDefault();
  if (!activeInviteProjectId) return;

  const nameInput = document.getElementById('invite-member-name');
  const emailInput = document.getElementById('invite-member-email');
  const roleRadio = document.querySelector('input[name="invite-role"]:checked');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const role = roleRadio ? roleRadio.value : 'editar';

  if (!name || !email) {
    alert('Por favor completa el nombre y el correo electrónico del colaborador.');
    return;
  }

  const avatar = inviteCustomAvatarTemp || AVATARS_BY_SEX[selectedInviteSexo] || AVATARS_BY_SEX['Masculino'];

  const added = addProjectMember(activeInviteProjectId, {
    name,
    email,
    avatar,
    role
  });

  if (added) {
    showToast(`Usuario "${name}" agregado con permiso de "${PROJECT_ROLES[role]?.label || role}"`);
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    inviteCustomAvatarTemp = null;
    updateInviteAvatarPreview();
    renderInviteModalMembersList();
  }
}

export function changeMemberRole(memberId, newRole) {
  if (!activeInviteProjectId) return;
  const ok = updateProjectMemberRole(activeInviteProjectId, memberId, newRole);
  if (ok) {
    showToast(`Permiso actualizado a "${PROJECT_ROLES[newRole]?.label || newRole}"`);
    renderInviteModalMembersList();
  }
}

export function removeMemberFromProject(memberId, memberName) {
  if (!activeInviteProjectId) return;
  if (!confirm(`¿Deseas remover a "${memberName || 'este usuario'}" del proyecto?`)) return;

  const ok = removeProjectMember(activeInviteProjectId, memberId);
  if (ok) {
    showToast(`Usuario removido del proyecto`, false);
    renderInviteModalMembersList();
  }
}

export function renderInviteModalMembersList() {
  if (!activeInviteProjectId) return;
  const members = getProjectMembers(activeInviteProjectId);
  const container = document.getElementById('invite-members-list');
  const countBadge = document.getElementById('invite-members-count');

  if (countBadge) {
    countBadge.textContent = `${members.length} colaborador${members.length === 1 ? '' : 'es'}`;
  }

  if (!container) return;

  if (members.length === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
        No hay colaboradores asignados todavía a este proyecto.
      </div>
    `;
    return;
  }

  container.innerHTML = members.map(m => {
    return `
      <div class="flex items-center justify-between gap-3 p-2.5 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-200 transition">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-2xs shrink-0 bg-slate-200">
            <img src="${m.avatar || AVATARS_BY_SEX['Masculino']}" alt="${m.name}" class="w-full h-full object-cover">
          </div>
          <div class="min-w-0">
            <h4 class="font-bold text-slate-800 text-xs truncate" title="${m.name}">${m.name}</h4>
            <p class="text-[11px] text-slate-500 font-mono truncate" title="${m.email}">${m.email}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Selector de Permiso -->
          <select onchange="changeMemberRole('${m.id}', this.value)" class="text-xs font-semibold py-1 px-2 rounded-lg border border-slate-300 bg-white text-slate-700 focus:border-blue-500 focus:outline-none cursor-pointer" title="Modificar permiso de este usuario">
            <option value="editar" ${m.role === 'editar' ? 'selected' : ''}>✏️ Editar (Control Total)</option>
            <option value="escribir" ${m.role === 'escribir' ? 'selected' : ''}>📝 Escribir (APU/Insumos)</option>
            <option value="leer" ${m.role === 'leer' ? 'selected' : ''}>👁️ Leer (Solo Consulta)</option>
          </select>

          <!-- Botón Eliminar -->
          <button type="button" onclick="removeMemberFromProject('${m.id}', '${m.name.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-rose-600 p-1.5 rounded transition cursor-pointer" title="Remover del proyecto">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}
