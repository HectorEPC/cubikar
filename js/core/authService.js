// js/core/authService.js
// Servicio de Autenticación integrado con Supabase Auth y tabla public.perfiles

import { STORAGE_KEY_USER } from '../config/constants.js?v=20261116_cf5';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261116_cf5';
import { getCurrentUser, saveCurrentUser, markSessionOpen, markSessionClosed, saveRegisteredUserAccount, getClosedSessionsList, enforceGlobalSessionRevocation } from '../modules/portal/projectService.js?v=20261116_cf5';
import { restoreUserCollaborationFromCloud, autoSyncCollaborationOnStartup, isRecentInternalCloudAuthUpdate } from './collaborationCloudService.js?v=20261116_cf5';
import {
  writeSharedSsoCookie,
  clearSharedSsoCookie,
  readSharedSsoCookie,
  readLocalSupabaseTokens,
  extractIncomingSsoFromHash,
  scrubSsoHashParams,
  hasPendingIncomingSso,
  getLastSignOutTimestamp
} from './ssoHelper.js?v=20261116_cf5';

const GOOGLE_CLIENT_ID = '1097638023851-36b44hlrj7fgslfcmqlvf77dk89h7eus.apps.googleusercontent.com';
const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';

export const TUTORIAL_ACCOUNTS = {
  'tutorial.arq@cubikar.app': {
    id: '11111111-1111-4111-a111-111111111111',
    companyId: '11111111-1111-4111-a111-111111111112',
    email: 'tutorial.arq@cubikar.app',
    name: 'Arq. Demo Tutorial',
    company: 'Estudio de Arquitectura Demo',
    role: 'owner',
    plan: 'plus',
    password: 'Cubikar2026!'
  },
  'tutorial.const@cubikar.app': {
    id: '22222222-2222-4222-a222-222222222221',
    companyId: '22222222-2222-4222-a222-222222222222',
    email: 'tutorial.const@cubikar.app',
    name: 'Ing. Demo Tutorial',
    company: 'Constructora Modelo Demo',
    role: 'owner',
    plan: 'plus',
    password: 'Cubikar2026!'
  }
};

let googleGsiLoadPromise = null;
let activeGoogleNoncePair = null;
let explicitAuthDepth = 0;
let explicitAuthRemember = null;
let ssoHydrationInProgress = false;
const inFlightProfilePromises = new Map();
const cachedProfilesByUserId = new Map();

export function isSsoHydrationPending() {
  return ssoHydrationInProgress;
}

function clearCachedUserProfiles() {
  inFlightProfilePromises.clear();
  cachedProfilesByUserId.clear();
}

const PLACEHOLDER_USER_NAMES = new Set(['', 'usuario', 'usuario invitado', 'invitado']);

function resolveRememberPreference(remember = null) {
  if (remember !== null && remember !== undefined) return !!remember;
  if (typeof document !== 'undefined') {
    const el = document.getElementById('login-remember-me');
    if (el) return !!el.checked;
  }
  if (typeof localStorage !== 'undefined' && localStorage.getItem('cubikar_remember_device') === 'true') {
    return true;
  }
  return false;
}

export function clearLocalSupabaseTokens() {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('sb-') || k.includes('auth-token'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
}

function hasValidLocalSessionForEmail(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const current = getCurrentUser();
  if (current) {
    const currentEmail = (current.email || '').toLowerCase().trim();
    if (cleanEmail && currentEmail && cleanEmail !== currentEmail) {
      return false;
    }
  }

  // 1. Sesión activa en pestaña actual
  if (typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(STORAGE_KEY_USER)) {
    return true;
  }

  // 2. Sesión recordada en localStorage
  const isDeviceRemembered = typeof localStorage !== 'undefined' && localStorage.getItem('cubikar_remember_device') !== 'false';
  if (typeof localStorage !== 'undefined' && !!localStorage.getItem(STORAGE_KEY_USER) && isDeviceRemembered) {
    return true;
  }

  // 3. Tokens SSO compartidos válidos de .cubikar.app (no revocados por sign out posterior)
  const cookieTokens = readSharedSsoCookie();
  const lastSignOutTs = getLastSignOutTimestamp();
  if (cookieTokens?.refreshToken) {
    const isRevokedBySignout = lastSignOutTs > 0 && cookieTokens.ts > 0 && cookieTokens.ts <= lastSignOutTs;
    const isEmailMatching = !cookieTokens.email || !cleanEmail || cookieTokens.email.toLowerCase().trim() === cleanEmail;
    if (!isRevokedBySignout && isEmailMatching) {
      return true;
    }
  }

  // 4. Tokens locales de Supabase no revocados
  const localTokens = readLocalSupabaseTokens();
  if (localTokens?.refreshToken) {
    const isRevokedBySignout = lastSignOutTs > 0 && localTokens.ts > 0 && localTokens.ts <= lastSignOutTs;
    const isEmailMatching = !localTokens.email || !cleanEmail || localTokens.email.toLowerCase().trim() === cleanEmail;
    if (!isRevokedBySignout && isEmailMatching) {
      return true;
    }
  }

  return false;
}

export function isPlaceholderUserName(name) {
  return typeof name !== 'string' || PLACEHOLDER_USER_NAMES.has(name.trim().toLowerCase());
}

export function resolveUserDisplayName({ perfil = null, authUser = null, existingUser = null } = {}) {
  const candidates = [
    perfil?.nombre_completo,
    authUser?.user_metadata?.full_name,
    authUser?.user_metadata?.name,
    existingUser?.name,
    authUser?.email,
    existingUser?.email
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() && !isPlaceholderUserName(candidate)) {
      return candidate.trim();
    }
  }
  return 'Usuario';
}

export function resolveUserRoleLabel({ roleLabel = '', role = '', isAuthenticated = false } = {}) {
  const trimmedLabel = typeof roleLabel === 'string' ? roleLabel.trim() : '';
  if (trimmedLabel && trimmedLabel.toLowerCase() !== 'invitado') {
    return trimmedLabel;
  }
  const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
  const roleMap = {
    admin: 'Administrador',
    'admin general': 'Admin General',
    administrador: 'Administrador',
    owner: 'Administrador',
    propietario: 'Propietario',
    editar: 'Editar',
    escribir: 'Escribir',
    leer: 'Leer',
    invitado: 'Invitado',
    guest: 'Invitado'
  };
  if (normalizedRole && roleMap[normalizedRole]) {
    return roleMap[normalizedRole];
  }
  if (normalizedRole) {
    return role.trim();
  }
  return isAuthenticated ? 'Administrador' : (trimmedLabel || 'Invitado');
}

export function buildFallbackAvatarSvg(displayName, email = '') {
  const source = (!isPlaceholderUserName(displayName) ? displayName : email) || 'U';
  const initial = encodeURIComponent(source.trim().charAt(0).toUpperCase() || 'U');
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%230284c7'/%3E%3Ctext x='50' y='64' font-size='42' font-family='Arial,sans-serif' font-weight='bold' fill='white' text-anchor='middle'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function createGoogleNoncePair() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues || !window.crypto?.subtle) {
    throw new Error('Tu navegador no soporta criptografía segura para iniciar sesión con Google.');
  }
  const randomBytes = new Uint8Array(24);
  window.crypto.getRandomValues(randomBytes);
  const rawNonce = bytesToHex(randomBytes);
  const encoded = new TextEncoder().encode(rawNonce);
  const digest = await window.crypto.subtle.digest('SHA-256', encoded);
  const hashedNonce = bytesToHex(new Uint8Array(digest));
  return { rawNonce, hashedNonce };
}

export async function ensureGoogleGsiScript(timeoutMs = 8000) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Google Sign-In requiere un navegador activo.');
  }
  if (window.google?.accounts?.id) {
    return window.google.accounts.id;
  }
  if (!googleGsiLoadPromise) {
    googleGsiLoadPromise = new Promise((resolve, reject) => {
      const startTime = Date.now();
      let scriptEl = document.querySelector(`script[src^="${GOOGLE_GSI_SRC}"]`);
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.src = GOOGLE_GSI_SRC;
        scriptEl.async = true;
        scriptEl.defer = true;
        document.head.appendChild(scriptEl);
      }

      const cleanup = () => {
        if (pollId) clearInterval(pollId);
      };

      scriptEl.addEventListener('error', () => {
        cleanup();
        googleGsiLoadPromise = null;
        reject(new Error('No se pudo cargar Google Sign-In. Verifica tu conexión o bloqueadores.'));
      }, { once: true });

      const pollId = setInterval(() => {
        if (window.google?.accounts?.id) {
          cleanup();
          resolve(window.google.accounts.id);
        } else if (Date.now() - startTime >= timeoutMs) {
          cleanup();
          googleGsiLoadPromise = null;
          reject(new Error('Google Sign-In tardó demasiado en responder.'));
        }
      }, 100);
    });
  }
  return googleGsiLoadPromise;
}

/**
 * Registro con Correo Electrónico y Contraseña
 */
export async function signUp({ email, password, fullName }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  explicitAuthDepth += 1;
  explicitAuthRemember = true;
  if (email) markSessionOpen(email);
  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        }
      }
    });

    if (error) throw error;
    return data;
  } finally {
    explicitAuthDepth = Math.max(0, explicitAuthDepth - 1);
    if (explicitAuthDepth === 0) explicitAuthRemember = null;
  }
}

/**
 * Inicio de sesión con Correo Electrónico y Contraseña
 */
export async function signInWithPassword({ email, password, remember = null }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  const cleanEmail = (email || '').toLowerCase().trim();
  const effectiveRemember = resolveRememberPreference(remember);
  explicitAuthDepth += 1;
  explicitAuthRemember = effectiveRemember;
  if (email) markSessionOpen(cleanEmail);
  try {
    let data = null;
    let authError = null;

    try {
      const res = await sb.auth.signInWithPassword({
        email: cleanEmail,
        password
      });
      data = res.data;
      authError = res.error;
    } catch (e) {
      authError = e;
    }

    // Reconocimiento directo para cuentas de tutorial
    if ((authError || !data?.user) && TUTORIAL_ACCOUNTS[cleanEmail] && password === TUTORIAL_ACCOUNTS[cleanEmail].password) {
      const tut = TUTORIAL_ACCOUNTS[cleanEmail];
      const syntheticUser = {
        id: tut.id,
        email: tut.email,
        aud: 'authenticated',
        role: 'authenticated',
        user_metadata: {
          full_name: tut.name,
          name: tut.name,
          empresa_nombre: tut.company,
          plan: 'plus',
          subscription: { planId: 'plus', billingCycle: 'monthly', isBetaTest: true }
        },
        app_metadata: { provider: 'email', providers: ['email'] }
      };
      const syntheticProfile = {
        id: tut.id,
        nombre_completo: tut.name,
        email: tut.email,
        rol: tut.role,
        avatar_url: '',
        empresas: {
          id: tut.companyId,
          nombre: tut.company,
          plan: 'plus',
          estado_suscripcion: 'active',
          acceso_arq: true,
          plan_arq: 'plus',
          acceso_const: true,
          plan_const: 'plus'
        }
      };
      const syntheticSession = {
        access_token: 'tut_access_token_' + tut.id,
        refresh_token: 'tut_refresh_token_' + tut.id,
        user: syntheticUser,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30
      };

      syncLocalUserSession(syntheticUser, syntheticProfile, true, effectiveRemember);
      if (effectiveRemember) {
        writeSharedSsoCookie(syntheticSession);
      }
      return { session: syntheticSession, user: syntheticUser, perfil: syntheticProfile };
    }

    if (authError) throw authError;

    syncLocalUserSession(data.user, null, true, effectiveRemember);
    if (effectiveRemember && data.session) {
      writeSharedSsoCookie(data.session);
    } else if (!effectiveRemember) {
      clearSharedSsoCookie({ markSignOut: false });
    }

    let perfil = null;
    if (data?.user?.id) {
      perfil = await Promise.race([
        fetchUserProfile(data.user.id),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500))
      ]).catch(() => null);
      if (perfil) {
        syncLocalUserSession(data.user, perfil, false, null);
      }
    }

    return { session: data.session, user: data.user, perfil };
  } finally {
    explicitAuthDepth = Math.max(0, explicitAuthDepth - 1);
    if (explicitAuthDepth === 0) explicitAuthRemember = null;
  }
}

/**
 * Inicio de sesión mediante Google (OAuth)
 */
export async function signInWithGoogle() {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  let cleanRedirect = window.location.href.split('#')[0].split('?')[0];
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    cleanRedirect = 'http://localhost:3000/index.html';
  }

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: cleanRedirect
    }
  });

  if (error) throw error;
  if (data?.url && typeof window !== 'undefined') {
    window.location.href = data.url;
  }
  return data;
}

/**
 * Autenticación directa con ID Token de Google (evita redirect /auth/v1/callback)
 */
export async function signInWithGoogleIdToken({ idToken, rawNonce, remember = null }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está configurado para iniciar sesión con Google.');
  }
  if (!idToken) {
    throw new Error('Google no devolvió un token de identidad válido.');
  }

  const effectiveRemember = typeof remember === 'boolean'
    ? remember
    : Boolean(typeof document !== 'undefined' && document.getElementById('login-remember-me')?.checked);

  const payload = {
    provider: 'google',
    token: idToken
  };
  if (rawNonce) {
    payload.nonce = rawNonce;
  }

  explicitAuthDepth += 1;
  explicitAuthRemember = effectiveRemember;
  try {
    const { data, error } = await sb.auth.signInWithIdToken(payload);
    if (error) throw error;

    let perfil = null;
    if (data?.user?.id) {
      markSessionOpen(data.user.email || data.user);
      syncLocalUserSession(data.user, null, true, effectiveRemember);
      if (effectiveRemember && data.session) {
        writeSharedSsoCookie(data.session);
      } else if (!effectiveRemember) {
        clearSharedSsoCookie({ markSignOut: false });
      }
      perfil = await Promise.race([
        fetchUserProfile(data.user.id),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500))
      ]).catch(() => null);
      if (perfil) {
        syncLocalUserSession(data.user, perfil, false, null);
      }
    }

    return {
      user: data?.user || null,
      session: data?.session || null,
      perfil,
      localUser: getCurrentUser()
    };
  } finally {
    explicitAuthDepth = Math.max(0, explicitAuthDepth - 1);
    if (explicitAuthDepth === 0) explicitAuthRemember = null;
  }
}

/**
 * Monta el botón oficial de Google Identity Services con nonce SHA-256
 */
export async function mountGoogleSignInButton({
  container,
  fallbackBtn = null,
  forceRefresh = false,
  onStart = null,
  onSuccess = null,
  onError = null
}) {
  if (!container) return false;

  try {
    const googleId = await ensureGoogleGsiScript();
    if (forceRefresh || !activeGoogleNoncePair) {
      activeGoogleNoncePair = await createGoogleNoncePair();
    }
    const { hashedNonce } = activeGoogleNoncePair;
    const rawWidth = container.getBoundingClientRect?.().width
      || container.parentElement?.getBoundingClientRect?.().width
      || 340;
    const buttonWidth = Math.max(220, Math.min(380, Math.floor(rawWidth || 340)));

    googleId.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashedNonce,
      ux_mode: 'popup',
      context: 'signin',
      auto_select: false,
      itp_support: true,
      callback: async (response) => {
        const usedRawNonce = activeGoogleNoncePair?.rawNonce || null;
        activeGoogleNoncePair = null;
        if (!response?.credential) {
          const credErr = new Error('No se recibió una credencial válida de Google.');
          if (typeof onError === 'function') onError(credErr);
          return;
        }
        try {
          if (typeof onStart === 'function') onStart();
          const result = await signInWithGoogleIdToken({
            idToken: response.credential,
            rawNonce: usedRawNonce
          });
          if (typeof onSuccess === 'function') await onSuccess(result);
        } catch (err) {
          if (typeof document !== 'undefined' && document.body.contains(container)) {
            mountGoogleSignInButton({
              container,
              fallbackBtn,
              forceRefresh: true,
              onStart,
              onSuccess,
              onError
            }).catch(() => {});
          }
          if (typeof onError === 'function') onError(err);
        }
      }
    });

    container.innerHTML = '';
    googleId.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'medium',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'es',
      width: buttonWidth
    });
    container.classList.remove('hidden');
    if (fallbackBtn) {
      fallbackBtn.classList.add('hidden');
    }
    return true;
  } catch (err) {
    console.warn('[Google GIS] No se pudo renderizar el botón oficial:', err);
    container.classList.add('hidden');
    if (fallbackBtn) {
      fallbackBtn.classList.remove('hidden');
    }
    return false;
  }
}

/**
 * Cierre de sesión seguro
 */
export async function signOut(options = {}) {
  const scope = options?.scope === 'global' ? 'global' : 'local';
  activeGoogleNoncePair = null;
  clearCachedUserProfiles();
  const current = getCurrentUser();
  if (current?.email) {
    markSessionClosed(current.email);
  }
  clearSharedSsoCookie({ markSignOut: true });
  try {
    if (typeof window !== 'undefined' && window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  } catch (_) {}
  const sb = getSupabaseClient();
  if (sb) {
    if (scope === 'global') {
      // Ejecutar scope global ANTES de limpiar tokens o hacer signOut local para enviar JWT válido
      try {
        await sb.auth.signOut({ scope: 'global' });
      } catch (_) {}
    }
    try {
      await sb.auth.signOut({ scope: 'local' });
    } catch (_) {}
  }
  clearLocalSupabaseTokens();
  saveCurrentUser(null);
}

export const signOutUser = signOut;

/**
 * Recuperación de contraseña por Email
 */
export async function resetPasswordForEmail(email) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  const { data, error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}#reset-password`
  });

  if (error) throw error;
  return data;
}

/**
 * Obtener perfil completo y empresa asociada desde la base de datos
 */
export async function fetchUserProfile(userId, forceRefresh = false) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return null;

  const cached = cachedProfilesByUserId.get(userId);
  if (!forceRefresh && cached && (Date.now() - cached.fetchedAt) < 5000) {
    return cached.data;
  }
  if (inFlightProfilePromises.has(userId)) {
    return inFlightProfilePromises.get(userId);
  }

  const reqPromise = (async () => {
    try {
      const { data, error } = await sb
        .from('perfiles')
        .select(`
          id,
          nombre_completo,
          email,
          avatar_url,
          rol,
          empresa_id,
          empresas (
            id,
            nombre,
            plan,
            plan_const,
            acceso_const,
            periodo_fin_const,
            plan_arq,
            acceso_arq,
            periodo_fin_arq,
            estado_suscripcion,
            logo_url
          )
        `)
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[Supabase Auth] Perfil no encontrado:', error.message);
        return null;
      }
      cachedProfilesByUserId.set(userId, { data, fetchedAt: Date.now() });
      return data;
    } catch (err) {
      console.error('[Supabase Auth] Error al obtener perfil:', err);
      return null;
    } finally {
      inFlightProfilePromises.delete(userId);
    }
  })();

  inFlightProfilePromises.set(userId, reqPromise);
  return reqPromise;
}

/**
 * Sincroniza la sesión con el estado local del portal
 */
const initialSyncedUserIds = new Set();

export function syncLocalUserSession(user, perfil, force = false, remember = null) {
  if (!user) return;
  const current = getCurrentUser();
  const cleanEmail = (user.email || '').toLowerCase().trim();
  const sameEmail = !!(current?.email && cleanEmail && current.email.toLowerCase().trim() === cleanEmail);
  if (!force && current && current.email && user.email && !sameEmail) {
    console.info('[Supabase Auth] Sesión remota difiere del usuario activo local, respetando usuario activo actual.');
    return;
  }
  const existingSameUser = sameEmail ? current : null;
  const resolvedName = resolveUserDisplayName({ perfil, authUser: user, existingUser: existingSameUser });
  const rawAvatar = perfil?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || existingSameUser?.avatar || '';
  const fallbackAvatar = buildFallbackAvatarSvg(resolvedName, user.email);

  let userSub = null;
  const metaSub = user.user_metadata?.subscription;
  const existingCycle = metaSub?.billingCycle === 'annual' ? 'annual' : 'monthly';

  // 1. Prioridad máxima: Plan autoritativo en tabla empresas de Supabase
  if (perfil?.empresas) {
    const emp = perfil.empresas;
    const dbPlan = emp.plan_const || emp.plan || 'free';
    const statusOk = !emp.estado_suscripcion || emp.estado_suscripcion === 'active' || emp.estado_suscripcion === 'trialing';
    const effectiveDbPlan = (dbPlan !== 'free' && !statusOk) ? 'free' : dbPlan;
    if (effectiveDbPlan !== 'free' || emp.estado_suscripcion === 'canceled' || emp.estado_suscripcion === 'inactive') {
      userSub = {
        planId: effectiveDbPlan,
        billingCycle: existingCycle,
        updatedAt: new Date().toISOString()
      };
    }
  }

  // 2. Fallback: metadatos en Supabase Auth si aún no había empresa resuelta
  if ((!userSub || userSub.planId === 'free') && metaSub && typeof metaSub === 'object' && metaSub.planId && metaSub.planId !== 'free') {
    userSub = {
      planId: metaSub.planId,
      billingCycle: existingCycle,
      updatedAt: metaSub.updatedAt || new Date().toISOString()
    };
  }

  // 3. Fallback local en este navegador
  if ((!userSub || userSub.planId === 'free') && typeof localStorage !== 'undefined') {
    const userSubRaw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
    if (userSubRaw) {
      try {
        const parsed = JSON.parse(userSubRaw);
        if (parsed?.planId && parsed.planId !== 'free') {
          userSub = parsed;
        }
      } catch (_) {}
    }
  }

  // 4. Administrador Maestro oficial
  if ((!userSub || userSub.planId === 'free') && (cleanEmail === 'hepc.90@gmail.com' || cleanEmail === 'admin.general@constructora.com')) {
    userSub = {
      planId: 'pro',
      billingCycle: 'monthly',
      updatedAt: new Date().toISOString()
    };
  }

  // 5. Fallback final a Gratuito
  if (!userSub) {
    userSub = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(userSub));
    }
  } catch (_) {}

  const resolvedRole = perfil?.rol || existingSameUser?.role || 'admin';
  const localUser = {
    subscription: userSub,
    id: user.id,
    name: resolvedName,
    email: user.email,
    avatar: rawAvatar || fallbackAvatar,
    role: resolvedRole,
    roleLabel: resolveUserRoleLabel({ roleLabel: existingSameUser?.roleLabel, role: resolvedRole, isAuthenticated: true }),
    empresaId: perfil?.empresa_id || existingSameUser?.empresaId || null,
    plan: userSub?.planId || perfil?.empresas?.plan_const || perfil?.empresas?.plan || 'free',
    estadoSuscripcion: perfil?.empresas?.estado_suscripcion || 'trialing',
    user_metadata: user.user_metadata ? { ...user.user_metadata } : (existingSameUser?.user_metadata || {})
  };
  saveCurrentUser(localUser, remember);
  try {
    saveRegisteredUserAccount(localUser);
    markSessionOpen(localUser.email || localUser);
    if (typeof window !== 'undefined' && typeof window.updateSubscriptionBadgesUI === 'function') {
      window.updateSubscriptionBadgesUI();
    }
    if (typeof window !== 'undefined' && typeof window.refreshProjectsGridUI === 'function') {
      refreshProjectsGridUI();
    }
    const shouldTriggerInitialSync = Boolean(force) || !initialSyncedUserIds.has(user.id);
    if (shouldTriggerInitialSync) {
      initialSyncedUserIds.add(user.id);
      setTimeout(() => {
        try {
          restoreUserCollaborationFromCloud(user);
        } catch (_) {}
        autoSyncCollaborationOnStartup(user, { force: Boolean(force) });
        import('../modules/ai/aiQuotaAndCacheService.js?v=20261116_cf5')
          .then(m => m.syncAiQuotaFromSupabase())
          .catch(() => {});
      }, 50);
    }
  } catch (e) {}
  return localUser;
}

/**
 * Verifica síncronamente si hay una sesión SSO entrante pendiente desde otro subdominio Cubikar
 */
export function hasPendingIncomingSsoSession() {
  return hasPendingIncomingSso(!!getCurrentUser());
}

/**
 * Hidrata una sesión SSO entrante (vía URL hash o cookie compartida .cubikar.app) sin pedir login de nuevo
 */
export async function hydrateIncomingSsoSession() {
  enforceGlobalSessionRevocation();
  const sb = getSupabaseClient();
  if (!sb) return { hydrated: false };

  const hashTokens = extractIncomingSsoFromHash();
  scrubSsoHashParams();

  let tokens = hashTokens;
  if (!tokens && !getCurrentUser()) {
    const cookieTokens = readSharedSsoCookie();
    const lastSignOutTs = getLastSignOutTimestamp();
    if (cookieTokens?.refreshToken && !(lastSignOutTs > 0 && cookieTokens.ts > 0 && cookieTokens.ts <= lastSignOutTs)) {
      tokens = cookieTokens;
    }
  }

  if (tokens?.email) {
    markSessionOpen(tokens.email);
  }

  if (!tokens?.refreshToken && !tokens?.email) {
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) {
        const current = getCurrentUser();
        const email = (data.session.user.email || '').toLowerCase().trim();
        const isClosed = getClosedSessionsList().includes(email);
        if (current || (!isClosed && hasValidLocalSessionForEmail(email))) {
          return { hydrated: true, session: data.session, user: data.session.user };
        }
      }
    } catch (_) {}
    return { hydrated: false };
  }

  const effectiveRemember = tokens.fromHash ? tokens.remember !== false : true;
  explicitAuthDepth += 1;
  explicitAuthRemember = effectiveRemember;
  ssoHydrationInProgress = true;
  try {
    const tutEmail = (tokens?.email || '').toLowerCase().trim();
    if (tutEmail && TUTORIAL_ACCOUNTS[tutEmail]) {
      const tut = TUTORIAL_ACCOUNTS[tutEmail];
      const syntheticUser = {
        id: tut.id,
        email: tut.email,
        aud: 'authenticated',
        role: 'authenticated',
        user_metadata: {
          full_name: tut.name,
          name: tut.name,
          empresa_nombre: tut.company,
          plan: 'plus',
          subscription: { planId: 'plus', billingCycle: 'monthly', isBetaTest: true }
        },
        app_metadata: { provider: 'email', providers: ['email'] }
      };
      const syntheticProfile = {
        id: tut.id,
        nombre_completo: tut.name,
        email: tut.email,
        rol: tut.role,
        avatar_url: '',
        empresas: {
          id: tut.companyId,
          nombre: tut.company,
          plan: 'plus',
          estado_suscripcion: 'active',
          acceso_arq: true,
          plan_arq: 'plus',
          acceso_const: true,
          plan_const: 'plus'
        }
      };
      markSessionOpen(tutEmail);
      syncLocalUserSession(syntheticUser, syntheticProfile, true, effectiveRemember);
      return { hydrated: true, session: { access_token: tokens.accessToken || 'tut_token', user: syntheticUser }, user: syntheticUser };
    }

    let sessionData = null;
    let sessionError = null;

    if (tokens.accessToken && tokens.refreshToken) {
      try {
        const res = await sb.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
        if (res.data?.session?.user) {
          sessionData = res.data;
        } else {
          sessionError = res.error;
        }
      } catch (err) {
        sessionError = err;
      }
    }

    if (!sessionData && tokens.refreshToken) {
      try {
        const res = await sb.auth.refreshSession({ refresh_token: tokens.refreshToken });
        if (res.data?.session?.user) {
          sessionData = res.data;
          sessionError = null;
        } else {
          sessionError = res.error || sessionError;
        }
      } catch (err) {
        sessionError = err;
      }
    }

    if (!sessionData) {
      try {
        const { data: existingData } = await sb.auth.getSession();
        if (existingData?.session?.user) {
          const em = (existingData.session.user.email || '').toLowerCase().trim();
          if (!tokens.email || em === tokens.email) {
            sessionData = existingData;
            sessionError = null;
          }
        }
      } catch (_) {}
    }

    if (!sessionData?.session?.user) {
      return { hydrated: false, error: sessionError };
    }

    const data = sessionData;

    const email = (data.session.user.email || '').toLowerCase().trim();
    if (email) markSessionOpen(email);
    syncLocalUserSession(data.session.user, null, true, effectiveRemember);
    if (effectiveRemember) {
      writeSharedSsoCookie(data.session);
    }
    fetchUserProfile(data.session.user.id).then((perfil) => {
      if (perfil && getCurrentUser()?.id === data.session.user.id) {
        syncLocalUserSession(data.session.user, perfil, false, null);
      }
    }).catch(() => {});

    return { hydrated: true, session: data.session, user: data.session.user };
  } catch (err) {
    console.warn('[Supabase SSO] No se pudo hidratar sesión entrante:', err?.message || err);
    return { hydrated: false, error: err };
  } finally {
    ssoHydrationInProgress = false;
    explicitAuthDepth = Math.max(0, explicitAuthDepth - 1);
    if (explicitAuthDepth === 0) explicitAuthRemember = null;
  }
}

/**
 * Listener global de eventos de autenticación
 */
export function initAuthListener(onAuthChangeCallback) {
  enforceGlobalSessionRevocation();
  const sb = getSupabaseClient();
  if (!sb) return;

  // Callback síncrono: evita bloquear navigator.locks de Supabase GoTrue con consultas DB en línea.
  sb.auth.onAuthStateChange((event, session) => {
    console.info(`[Supabase Auth] Evento: ${event}`);
    if (session?.user) {
      const email = (session.user.email || '').toLowerCase().trim();
      const current = getCurrentUser();
      const closedList = getClosedSessionsList();
      const isClosed = closedList.includes(email);
      const isOAuthRedirect = typeof window !== 'undefined' && (
        window.location.hash.includes('cubikar_sso_at=') ||
        window.location.hash.includes('cubikar_sso_rt=') ||
        window.location.hash.includes('cubikar_sso_email=') ||
        window.location.hash.includes('access_token') ||
        window.location.hash.includes('refresh_token') ||
        window.location.search.includes('code=')
      );
      const isExplicitInteractive = explicitAuthDepth > 0 || isOAuthRedirect || ssoHydrationInProgress || hasPendingIncomingSso(false);
      const hasActiveLocal = hasValidLocalSessionForEmail(email);

      // Nunca auto-ingresar desde sesiones/tokens pasivos (INITIAL_SESSION, TOKEN_REFRESHED, SIGNED_IN)
      // si la sesión fue cerrada explícitamente o no existe una sesión local activa/recordada.
      if (isExplicitInteractive) {
        markSessionOpen(email);
      } else if (isClosed || (!hasActiveLocal && !hasPendingIncomingSso(false))) {
        console.info(`[Supabase Auth] Bloqueando auto-sesión pasiva (${event}) por sesión cerrada o sin persistencia en este equipo.`);
        clearCachedUserProfiles();
        clearLocalSupabaseTokens();
        saveCurrentUser(null);
        setTimeout(() => {
          try {
            sb.auth.signOut({ scope: 'local' }).catch(() => {});
          } catch (_) {}
          if (current && onAuthChangeCallback) onAuthChangeCallback('SIGNED_OUT', null, null);
        }, 0);
        return;
      }

      const isInternalSync = (event === 'USER_UPDATED' && isRecentInternalCloudAuthUpdate());
      const isExplicitLogin = (event === 'SIGNED_IN' || (event === 'USER_UPDATED' && !isInternalSync) || isOAuthRedirect);
      const rememberPref = isExplicitInteractive ? explicitAuthRemember : null;
      const shouldKeepSsoCookie = rememberPref !== null ? rememberPref : resolveRememberPreference(null);
      if (shouldKeepSsoCookie) {
        writeSharedSsoCookie(session);
      } else if (rememberPref === false) {
        clearSharedSsoCookie({ markSignOut: false });
      }

      const cachedEntry = cachedProfilesByUserId.get(session.user.id);
      const initialPerfil = cachedEntry ? cachedEntry.data : null;
      syncLocalUserSession(session.user, initialPerfil, isExplicitLogin, rememberPref);

      setTimeout(() => {
        if (!isInternalSync && event !== 'TOKEN_REFRESHED') {
          try {
            autoSyncCollaborationOnStartup(session.user, { force: isExplicitLogin });
          } catch (e) {}
        }
        if (onAuthChangeCallback) onAuthChangeCallback(event, session, initialPerfil);

        if (!initialPerfil) {
          fetchUserProfile(session.user.id).then((perfil) => {
            if (perfil && getCurrentUser()?.id === session.user.id) {
              syncLocalUserSession(session.user, perfil, false, null);
              if (onAuthChangeCallback) {
                onAuthChangeCallback('PROFILE_LOADED', session, perfil);
              }
            }
          }).catch(() => {});
        }
      }, 0);
    } else {
      if (event === 'SIGNED_OUT') {
        initialSyncedUserIds.clear();
        clearCachedUserProfiles();
        clearSharedSsoCookie({ markSignOut: true });
      }
      setTimeout(() => {
        if (onAuthChangeCallback) onAuthChangeCallback(event, null, null);
      }, 0);
    }
  });
}
