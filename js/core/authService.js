// js/core/authService.js
// Servicio de Autenticación integrado con Supabase Auth y tabla public.perfiles

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { saveCurrentUser } from '../modules/portal/projectService.js';

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
  syncLocalUserSession(data.user, perfil);

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

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });

  if (error) throw error;
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
export function syncLocalUserSession(user, perfil) {
  if (!user) return;
  const localUser = {
    id: user.id,
    name: perfil?.nombre_completo || user.user_metadata?.full_name || user.email,
    email: user.email,
    avatar: perfil?.avatar_url || user.user_metadata?.avatar_url || '',
    role: perfil?.rol || 'admin',
    empresaId: perfil?.empresa_id || null,
    plan: perfil?.empresas?.plan || 'free',
    estadoSuscripcion: perfil?.empresas?.estado_suscripcion || 'trialing'
  };
  saveCurrentUser(localUser);
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
      const perfil = await fetchUserProfile(session.user.id);
      syncLocalUserSession(session.user, perfil);
      if (onAuthChangeCallback) onAuthChangeCallback(event, session, perfil);
    } else {
      if (onAuthChangeCallback) onAuthChangeCallback(event, null, null);
    }
  });
}
