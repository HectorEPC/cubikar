// js/core/authService.js
// Servicio de Autenticación integrado con Supabase Auth y tabla public.perfiles

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { getCurrentUser, saveCurrentUser, markSessionOpen, saveRegisteredUserAccount } from '../modules/portal/projectService.js';
import { restoreUserCollaborationFromCloud, autoSyncCollaborationOnStartup } from './collaborationCloudService.js';

/**
 * Registro con Correo Electrónico y Contraseña
 */
export async function signUp({ email, password, fullName }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

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
}

/**
 * Inicio de sesión con Correo Electrónico y Contraseña
 */
export async function signInWithPassword({ email, password }) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb) {
    throw new Error('Supabase no está disponible en este momento.');
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  const perfil = await fetchUserProfile(data.user.id);
  syncLocalUserSession(data.user, perfil, true);

  return { session: data.session, user: data.user, perfil };
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
 * Cierre de sesión seguro
 */
export async function signOut() {
  const sb = getSupabaseClient();
  if (sb) {
    try {
      await sb.auth.signOut();
    } catch (_) {}
  }
  saveCurrentUser(null);
}

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
export async function fetchUserProfile(userId) {
  const sb = getSupabaseClient();
  if (!sb || !userId) return null;

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
    return data;
  } catch (err) {
    console.error('[Supabase Auth] Error al obtener perfil:', err);
    return null;
  }
}

/**
 * Sincroniza la sesión con el estado local del portal
 */
export function syncLocalUserSession(user, perfil, force = false) {
  if (!user) return;
  const current = getCurrentUser();
  if (!force && current && current.email && user.email && current.email.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
    console.info('[Supabase Auth] Sesión remota difiere del usuario activo local, respetando usuario activo actual.');
    return;
  }
  const rawAvatar = perfil?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
  const initial = (perfil?.nombre_completo || user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'U').charAt(0).toUpperCase();
  const fallbackAvatar = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%230284c7'/%3E%3Ctext x='50' y='64' font-size='42' font-family='Arial,sans-serif' font-weight='bold' fill='white' text-anchor='middle'%3E${initial}%3C/text%3E%3C/svg%3E`;

  const cleanEmail = (user.email || '').toLowerCase().trim();
  let userSub = null;

  // 1. Prioridad: Metadatos en la nube de Supabase Auth (guardados en la cuenta del usuario)
  const metaSub = user.user_metadata?.subscription;
  if (metaSub && typeof metaSub === 'object' && metaSub.planId) {
    userSub = {
      planId: metaSub.planId,
      billingCycle: metaSub.billingCycle === 'annual' ? 'annual' : 'monthly',
      updatedAt: metaSub.updatedAt || new Date().toISOString()
    };
  }

  // 2. Si la empresa remota en Supabase tiene plan 'plus' o 'pro'
  if ((!userSub || userSub.planId === 'free') && perfil?.empresas?.plan && perfil.empresas.plan !== 'free') {
    userSub = {
      planId: perfil.empresas.plan,
      billingCycle: 'monthly',
      updatedAt: new Date().toISOString()
    };
  }

  // 3. Si en localStorage local ya existía un plan registrado para este usuario
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

  // 4. Si es la cuenta del Administrador Maestro oficial, garantizar Plan Pro
  if ((!userSub || userSub.planId === 'free') && (cleanEmail === 'hepc.90@gmail.com' || cleanEmail === 'admin.general@constructora.com')) {
    userSub = {
      planId: 'pro',
      billingCycle: 'monthly',
      updatedAt: new Date().toISOString()
    };
  }

  // 5. Fallback a Gratuito si es un usuario recién registrado sin suscripción
  if (!userSub) {
    userSub = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
  }

  // Guardar en el almacenamiento local de esta PC para que toda la interfaz respete el plan
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(userSub));
    }
  } catch (_) {}

  // Si la suscripción es de pago y no estaba en Supabase Auth, sincronizarla a la nube
  if (userSub && userSub.planId !== 'free' && (!metaSub || metaSub.planId !== userSub.planId)) {
    try {
      const sbClient = getSupabaseClient();
      if (sbClient) {
        sbClient.auth.updateUser({
          data: { subscription: userSub }
        }).catch(() => {});
      }
    } catch (_) {}
  }

  const localUser = {
    subscription: userSub,
    id: user.id,
    name: perfil?.nombre_completo || user.user_metadata?.full_name || user.user_metadata?.name || user.email,
    email: user.email,
    avatar: rawAvatar || fallbackAvatar,
    role: perfil?.rol || 'admin',
    empresaId: perfil?.empresa_id || null,
    plan: perfil?.empresas?.plan || 'free',
    estadoSuscripcion: perfil?.empresas?.estado_suscripcion || 'trialing'
  };
  saveCurrentUser(localUser);
  try {
    saveRegisteredUserAccount(localUser);
    markSessionOpen(localUser.email || localUser);
    restoreUserCollaborationFromCloud(user);
    setTimeout(() => {
      autoSyncCollaborationOnStartup(user);
    }, 100);
  } catch (e) {}
  return localUser;
}

/**
 * Listener global de eventos de autenticación
 */
export function initAuthListener(onAuthChangeCallback) {
  const sb = getSupabaseClient();
  if (!sb) return;

  sb.auth.onAuthStateChange(async (event, session) => {
    console.info(`[Supabase Auth] Evento: ${event}`);
    if (session?.user) {
      const isExplicitLogin = (event === 'SIGNED_IN' || event === 'USER_UPDATED');
      const perfil = await fetchUserProfile(session.user.id);
      syncLocalUserSession(session.user, perfil, isExplicitLogin);
      try {
        autoSyncCollaborationOnStartup(session.user);
      } catch (e) {}
      if (onAuthChangeCallback) onAuthChangeCallback(event, session, perfil);
    } else {
      if (onAuthChangeCallback) onAuthChangeCallback(event, null, null);
    }
  });
}
