// js/mobile/mobileAuth.js
// Pantalla real de Inicio de Sesión / Registro (Supabase Auth, Google GSI y cuentas locales)

import {
  signInWithPassword,
  signInWithGoogle,
  signUp,
  mountGoogleSignInButton,
  resetPasswordForEmail,
  fetchUserProfile,
  resolveUserDisplayName,
  resolveUserRoleLabel
} from '../core/authService.js?v=20261119_cf39';
import { getSupabaseClient, isSupabaseConfigured } from '../core/supabaseClient.js?v=20261119_cf39';
import {
  AVATARS_BY_SEX,
  GOOGLE_PRESET_ACCOUNTS,
  getCurrentUser,
  saveCurrentUser,
  getFeaturedProfilesList,
  addFeaturedProfile,
  removeFeaturedProfile,
  findRegisteredUserAccount,
  saveRegisteredUserAccount,
  getSavedUserProfile,
  markSessionOpen,
  setActiveWorkspaceData
} from '../modules/portal/projectService.js?v=20261119_cf39';
import { showToast } from '../ui/notifications.js?v=20261119_cf39';
import { uploadManagedFile } from '../services/s3StorageService.js?v=20261119_cf39';
import { escapeHtml, renderAvatarHtml } from './mobileBridge.js?v=20261119_cf39';

let authTab = 'login';
let regSexo = 'Masculino';
let customAvatarData = null;

export function renderMobileAuth(container, { returnProjectId = '', onAuthSuccess }) {
  if (!container) return;
  const featured = getFeaturedProfilesList();
  const rememberedDefault = typeof localStorage !== 'undefined' && localStorage.getItem('cubikar_remember_device') === 'true';

  container.innerHTML = `
    <div style="max-width:440px;margin:8px auto 0;width:100%;display:flex;flex-direction:column;gap:12px;">
      <div class="m-card" style="text-align:center;padding:18px 16px;">
        <img src="assets/branding/cubikar_icon_transparent.png" alt="Cubikar" style="width:48px;height:48px;object-fit:contain;margin:0 auto 8px;display:block;">
        <h1 class="m-title" style="font-size:19px;">cubikar Construcción</h1>
        <p class="m-subtitle">
          ${returnProjectId ? 'Inicia sesión para abrir la obra compartida' : 'Accede a tus proyectos, presupuestos y control de obra'}
        </p>

        <div class="m-segmented" style="margin-top:14px;">
          <button type="button" id="m-tab-login" class="m-seg-btn ${authTab === 'login' ? 'is-active' : ''}">
            <i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión
          </button>
          <button type="button" id="m-tab-reg" class="m-seg-btn ${authTab === 'register' ? 'is-active' : ''}">
            <i class="fa-solid fa-user-plus"></i> Registrarse
          </button>
        </div>
      </div>

      ${featured.length > 0 && authTab === 'login' ? `
        <div class="m-card">
          <div class="m-row-between" style="margin-bottom:8px;">
            <span class="m-label" style="margin:0;">Cuentas guardadas en este dispositivo</span>
            <span class="m-pill m-pill-blue"><i class="fa-solid fa-bolt"></i> Rápido</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:7px;">
            ${featured.map(acc => `
              <div class="m-card-alt m-row-between" style="padding:8px 10px;">
                <button type="button" data-quick-email="${escapeHtml(acc.email)}" class="m-row" style="flex:1;min-width:0;border:none;background:none;text-align:left;cursor:pointer;color:inherit;padding:0;">
                  <div class="m-avatar-btn" style="width:34px;height:34px;flex-shrink:0;border-width:1.5px;">
                    ${renderAvatarHtml(acc, 34)}
                  </div>
                  <div style="min-width:0;flex:1;">
                    <div style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(acc.name || acc.email)}</div>
                    <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(acc.email)}</div>
                  </div>
                </button>
                <button type="button" data-remove-email="${escapeHtml(acc.email)}" class="m-icon-btn" style="width:30px;height:30px;font-size:11px;" title="Quitar de este dispositivo">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="m-card" style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <div id="mobile-google-gsi-slot" style="display:flex;justify-content:center;min-height:40px;"></div>
          <button type="button" id="mobile-google-fallback" class="m-btn m-btn-outline" style="width:100%;margin-top:6px;">
            <i class="fa-brands fa-google" style="color:#ea4335;"></i> Continuar con Google / Gmail
          </button>
        </div>

        <div style="display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px;font-weight:700;">
          <span style="flex:1;height:1px;background:var(--border);"></span>
          <span>O CON TU CORREO</span>
          <span style="flex:1;height:1px;background:var(--border);"></span>
        </div>

        ${authTab === 'login' ? `
          <form id="m-login-form" style="display:flex;flex-direction:column;gap:10px;">
            <div>
              <label class="m-label" for="m-login-email">Correo electrónico</label>
              <input id="m-login-email" type="email" required class="m-input" placeholder="correo@constructora.com" autocomplete="email">
            </div>
            <div>
              <div class="m-row-between" style="margin-bottom:4px;">
                <label class="m-label" for="m-login-pass" style="margin:0;">Contraseña</label>
                <button type="button" id="m-forgot-pass" style="border:none;background:none;color:var(--primary);font-size:11px;font-weight:700;cursor:pointer;">¿Olvidaste tu contraseña?</button>
              </div>
              <div style="position:relative;">
                <input id="m-login-pass" type="password" required class="m-input" placeholder="Tu contraseña" style="padding-right:42px;" autocomplete="current-password">
                <button type="button" id="m-login-eye" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:none;background:none;color:var(--muted);cursor:pointer;">
                  <i class="fa-solid fa-eye"></i>
                </button>
              </div>
            </div>
            <label class="m-row" style="font-size:12px;color:var(--text-soft);cursor:pointer;">
              <input type="checkbox" id="login-remember-me" ${rememberedDefault ? 'checked' : ''} style="width:16px;height:16px;">
              <span>Mantener sesión iniciada en este dispositivo</span>
            </label>
            <button type="submit" id="m-login-submit" class="m-btn m-btn-primary" style="width:100%;">
              <i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión
            </button>
          </form>
        ` : `
          <form id="m-reg-form" style="display:flex;flex-direction:column;gap:10px;">
            <div>
              <label class="m-label">Avatar / Perfil</label>
              <div class="m-row" style="gap:10px;">
                <img id="m-reg-avatar" src="${escapeHtml(customAvatarData || AVATARS_BY_SEX[regSexo])}" alt="Avatar" style="width:48px;height:48px;border-radius:999px;object-fit:cover;border:2px solid var(--primary);">
                <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;">
                    ${['Masculino', 'Femenino', 'Otro'].map(sx => `
                      <button type="button" data-reg-sexo="${sx}" class="m-btn m-btn-sm ${regSexo === sx ? 'm-btn-primary' : 'm-btn-outline'}">${sx}</button>
                    `).join('')}
                  </div>
                  <label class="m-btn m-btn-sm m-btn-outline" style="cursor:pointer;">
                    <i class="fa-solid fa-camera"></i> Subir foto
                    <input type="file" id="m-reg-photo" accept="image/*" style="display:none;">
                  </label>
                </div>
              </div>
            </div>
            <div>
              <label class="m-label" for="m-reg-name">Nombre completo *</label>
              <input id="m-reg-name" type="text" required class="m-input" placeholder="Arq. / Ing. Nombre Apellido" autocomplete="name">
            </div>
            <div>
              <label class="m-label" for="m-reg-email">Correo electrónico *</label>
              <input id="m-reg-email" type="email" required class="m-input" placeholder="correo@constructora.com" autocomplete="email">
            </div>
            <div class="m-grid-2">
              <div>
                <label class="m-label" for="m-reg-pass">Contraseña *</label>
                <input id="m-reg-pass" type="password" required minlength="6" class="m-input" placeholder="Mín. 6 caract." autocomplete="new-password">
              </div>
              <div>
                <label class="m-label" for="m-reg-pass2">Confirmar *</label>
                <input id="m-reg-pass2" type="password" required minlength="6" class="m-input" placeholder="Repetir" autocomplete="new-password">
              </div>
            </div>
            <div>
              <label class="m-label" for="m-reg-dob">Fecha de nacimiento</label>
              <input id="m-reg-dob" type="date" class="m-input" value="1992-06-15">
            </div>
            <label class="m-row" style="font-size:12px;color:var(--text-soft);cursor:pointer;">
              <input type="checkbox" id="reg-remember-me" ${rememberedDefault ? 'checked' : ''} style="width:16px;height:16px;">
              <span>Mantener sesión iniciada en este dispositivo</span>
            </label>
            <button type="submit" id="m-reg-submit" class="m-btn m-btn-primary" style="width:100%;">
              <i class="fa-solid fa-user-check"></i> Crear Cuenta y Entrar
            </button>
          </form>
        `}
      </div>
    </div>
  `;

  container.querySelector('#m-tab-login')?.addEventListener('click', () => {
    authTab = 'login';
    renderMobileAuth(container, { returnProjectId, onAuthSuccess });
  });
  container.querySelector('#m-tab-reg')?.addEventListener('click', () => {
    authTab = 'register';
    renderMobileAuth(container, { returnProjectId, onAuthSuccess });
  });

  // Google GSI & Fallback
  const gsiSlot = container.querySelector('#mobile-google-gsi-slot');
  const gsiFallback = container.querySelector('#mobile-google-fallback');
  if (gsiSlot && isSupabaseConfigured()) {
    mountGoogleSignInButton({
      container: gsiSlot,
      fallbackBtn: gsiFallback,
      onSuccess: () => {
        showToast('Sesión iniciada con Google.', 'success');
        onAuthSuccess?.(returnProjectId);
      },
      onError: (err) => {
        showToast(err?.message || 'Error al autenticar con Google.', 'error');
      }
    }).catch(() => {});
  }
  gsiFallback?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      showToast(err?.message || 'Google Sign-In no disponible sin Supabase configurado.', 'error');
    }
  });

  // Quick featured accounts
  container.querySelectorAll('[data-quick-email]').forEach(btn => {
    btn.addEventListener('click', () => {
      const email = btn.dataset.quickEmail;
      handleQuickFeaturedLogin(email, returnProjectId, onAuthSuccess);
    });
  });
  container.querySelectorAll('[data-remove-email]').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFeaturedProfile(btn.dataset.removeEmail);
      showToast('Cuenta eliminada de accesos rápidos en este dispositivo.', 'info');
      renderMobileAuth(container, { returnProjectId, onAuthSuccess });
    });
  });

  if (authTab === 'login') {
    const passEl = container.querySelector('#m-login-pass');
    const eyeEl = container.querySelector('#m-login-eye');
    eyeEl?.addEventListener('click', () => {
      const hidden = passEl.type === 'password';
      passEl.type = hidden ? 'text' : 'password';
      eyeEl.innerHTML = hidden ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });

    container.querySelector('#m-forgot-pass')?.addEventListener('click', async () => {
      const email = (container.querySelector('#m-login-email')?.value || '').trim();
      if (!email) {
        showToast('Escribe tu correo primero para enviar la recuperación.', 'warning');
        return;
      }
      try {
        await resetPasswordForEmail(email);
        showToast('Se envió un enlace de recuperación a tu correo.', 'success');
      } catch (err) {
        showToast(err?.message || 'No se pudo enviar el correo de recuperación.', 'error');
      }
    });

    container.querySelector('#m-login-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = (container.querySelector('#m-login-email')?.value || '').trim().toLowerCase();
      const password = container.querySelector('#m-login-pass')?.value || '';
      const remember = Boolean(container.querySelector('#login-remember-me')?.checked);
      const submitBtn = container.querySelector('#m-login-submit');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
      }
      try {
        const { user, perfil } = await signInWithPassword({ email, password, remember });
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
        const isMaster = email === 'hepc.90@gmail.com';
        const resolvedRole = isMaster ? 'Admin General' : (perfil?.rol && perfil.rol !== 'Admin General' ? perfil.rol : 'usuario');
        const resolvedName = resolveUserDisplayName({ perfil, authUser: user }) || email;
        const loggedUser = {
          id: user.id,
          empresaId: perfil?.empresa_id || null,
          name: resolvedName,
          email,
          subscription: userSub || { planId: 'free', billingCycle: 'monthly', updatedAt: null },
          avatar: perfil?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || AVATARS_BY_SEX[perfil?.sexo] || AVATARS_BY_SEX.Masculino,
          sexo: perfil?.sexo || 'Masculino',
          role: resolvedRole,
          roleLabel: resolveUserRoleLabel({ role: resolvedRole, isAuthenticated: true }),
          user_metadata: user?.user_metadata ? { ...user.user_metadata } : {},
          lastLogin: new Date().toISOString()
        };
        saveCurrentUser(loggedUser, remember);
        addFeaturedProfile(loggedUser);
        setActiveWorkspaceData(email, loggedUser.name);
        markSessionOpen(email);
        showToast(`¡Bienvenido, ${loggedUser.name}!`, 'success');
        onAuthSuccess?.(returnProjectId);
      } catch (err) {
        const localReg = findRegisteredUserAccount(email);
        if (localReg && (!isSupabaseConfigured() || err?.message?.includes('Failed to fetch'))) {
          saveCurrentUser(localReg, remember);
          setActiveWorkspaceData(email, localReg.name || email);
          markSessionOpen(email);
          showToast(`Sesión local iniciada como ${localReg.name}`, 'info');
          onAuthSuccess?.(returnProjectId);
          return;
        }
        showToast(err?.message || 'Credenciales incorrectas.', 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar Sesión';
        }
      }
    });
  } else {
    container.querySelectorAll('[data-reg-sexo]').forEach(btn => {
      btn.addEventListener('click', () => {
        regSexo = btn.dataset.regSexo;
        const img = container.querySelector('#m-reg-avatar');
        if (img && !customAvatarData) img.src = AVATARS_BY_SEX[regSexo] || AVATARS_BY_SEX.Masculino;
        renderMobileAuth(container, { returnProjectId, onAuthSuccess });
      });
    });

    container.querySelector('#m-reg-photo')?.addEventListener('change', async (ev) => {
      const file = ev.target?.files?.[0];
      if (!file) return;
      try {
        const res = await uploadManagedFile({
          file, modulo: 'avatares', categoria: 'branding', preset: 'avatar', showFeedback: true, includeDataUrl: true
        });
        if (res.ok && res.dataUrl) {
          customAvatarData = res.dataUrl;
          const img = container.querySelector('#m-reg-avatar');
          if (img) img.src = customAvatarData;
        }
      } catch (err) {
        showToast(err?.message || 'Error al cargar foto.', 'error');
      }
    });

    container.querySelector('#m-reg-form')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fullName = (container.querySelector('#m-reg-name')?.value || '').trim();
      const email = (container.querySelector('#m-reg-email')?.value || '').trim().toLowerCase();
      const password = container.querySelector('#m-reg-pass')?.value || '';
      const pass2 = container.querySelector('#m-reg-pass2')?.value || '';
      const dob = container.querySelector('#m-reg-dob')?.value || '1992-06-15';
      const remember = Boolean(container.querySelector('#reg-remember-me')?.checked);

      if (password !== pass2) {
        showToast('Las contraseñas no coinciden.', 'error');
        return;
      }
      const btn = container.querySelector('#m-reg-submit');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando cuenta...';
      }
      let cloudUser = null;
      try {
        if (isSupabaseConfigured() && getSupabaseClient()) {
          const data = await signUp({ email, password, fullName });
          cloudUser = data?.user || null;
        }
      } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (!msg.includes('rate limit')) {
          showToast(err?.message || 'No se pudo completar el registro.', 'error');
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-user-check"></i> Crear Cuenta y Entrar';
          }
          return;
        }
      }
      const newUser = {
        ...(cloudUser?.id ? { id: cloudUser.id } : {}),
        subscription: { planId: 'free', billingCycle: 'monthly', updatedAt: new Date().toISOString() },
        name: fullName,
        email,
        sexo: regSexo,
        dob,
        avatar: customAvatarData || AVATARS_BY_SEX[regSexo] || AVATARS_BY_SEX.Masculino,
        role: 'usuario',
        roleLabel: 'Usuario',
        registeredAt: new Date().toISOString()
      };
      saveRegisteredUserAccount(newUser);
      saveCurrentUser(newUser, remember);
      addFeaturedProfile(newUser);
      setActiveWorkspaceData(email, fullName);
      markSessionOpen(email);
      showToast(`¡Bienvenido, ${fullName}!`, 'success');
      onAuthSuccess?.(returnProjectId);
    });
  }
}

function handleQuickFeaturedLogin(email, returnProjectId, onAuthSuccess) {
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanEmail) return;
  let user = getFeaturedProfilesList().find(p => (p.email || '').toLowerCase().trim() === cleanEmail)
    || findRegisteredUserAccount(cleanEmail)
    || (getSavedUserProfile()?.email?.toLowerCase().trim() === cleanEmail ? getSavedUserProfile() : null)
    || GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === cleanEmail);

  if (!user) {
    showToast('No se encontró el perfil seleccionado.', 'error');
    return;
  }
  const cloned = { ...user };
  const isMaster = cleanEmail === 'hepc.90@gmail.com';
  if (!cloned.role) cloned.role = isMaster ? 'Admin General' : 'usuario';
  if (!cloned.roleLabel) cloned.roleLabel = isMaster ? 'Administrador' : 'Usuario';
  setActiveWorkspaceData(cleanEmail, cloned.name || cleanEmail);
  saveCurrentUser(cloned, true);
  addFeaturedProfile(cloned);
  markSessionOpen(cleanEmail);
  showToast(`Sesión iniciada como ${cloned.name}`, 'success');
  onAuthSuccess?.(returnProjectId);
}
