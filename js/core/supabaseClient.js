// js/core/supabaseClient.js
// Inicialización y configuración central del cliente Supabase
// Diseñado para ser 100% resiliente: si el SDK o internet fallan, la app opera en modo local seguro.

export const STORAGE_KEY_SUPABASE_CONFIG = 'adm_const_supabase_config';

// Configuración predeterminada de tu proyecto Cubikar
export const DEFAULT_SUPABASE_CONFIG = {
  url: 'https://hxyzvxueoqvvjyehfpym.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXp2eHVlb3F2dmp5ZWhmcHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMTYwODAsImV4cCI6MjEwOTY5MjA4MH0.q3P-_HZ11PP5dgCkAX7o5TZGqVAoqVv438W6coZiYeA'
};

export function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUPABASE_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const urlClean = (parsed.url || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
        return {
          url: urlClean || DEFAULT_SUPABASE_CONFIG.url,
          anonKey: parsed.anonKey || DEFAULT_SUPABASE_CONFIG.anonKey
        };
      }
    }
  } catch (e) {
    console.warn('[Supabase] Error leyendo configuración:', e);
  }
  return Object.assign({}, DEFAULT_SUPABASE_CONFIG);
}

export function saveSupabaseConfig(url, anonKey) {
  const cleanUrl = (url || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  const cleanKey = (anonKey || '').trim();
  localStorage.setItem(STORAGE_KEY_SUPABASE_CONFIG, JSON.stringify({ url: cleanUrl, anonKey: cleanKey }));
  return initSupabaseClient();
}

export function isSupabaseConfigured() {
  const cfg = getSupabaseConfig();
  return Boolean(
    cfg.url &&
    cfg.anonKey &&
    cfg.url.startsWith('https://') &&
    !cfg.url.includes('TU-PROYECTO')
  );
}

function getCreateClientFn() {
  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    return window.supabase.createClient;
  }
  return null;
}

export let supabase = null;
const recentNetFailureTimestamps = [];

function getHeaderCaseInsensitive(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return String(headers[k] || '');
  }
  return '';
}

function createResilientSupabaseFetch() {
  if (typeof globalThis === 'undefined' || typeof globalThis.fetch !== 'function') return undefined;
  return async function cubikarSupabaseFetch(input, init) {
    const now = Date.now();
    while (recentNetFailureTimestamps.length > 0 && (now - recentNetFailureTimestamps[0]) > 4000) {
      recentNetFailureTimestamps.shift();
    }
    const retryCount = Number(getHeaderCaseInsensitive(init?.headers || input?.headers, 'X-Retry-Count') || '0') || 0;
    if (retryCount >= 2 || (retryCount >= 1 && recentNetFailureTimestamps.length >= 3)) {
      throw new DOMException('Reintento suprimido por inestabilidad de red', 'AbortError');
    }
    try {
      const response = await globalThis.fetch(input, init);
      recentNetFailureTimestamps.length = 0;
      return response;
    } catch (err) {
      if (err?.name !== 'AbortError' && err?.code !== 'ABORT_ERR') {
        recentNetFailureTimestamps.push(Date.now());
      }
      throw err;
    }
  };
}

export function getSupabaseClient() {
  if (!supabase) initSupabaseClient();
  return supabase;
}

export function initSupabaseClient() {
  if (!isSupabaseConfigured()) {
    supabase = null;
    return null;
  }

  const createClientFn = getCreateClientFn();
  if (!createClientFn) {
    console.warn('[Supabase] SDK aún no disponible en window.supabase; operando en Modo Local seguro.');
    supabase = null;
    return null;
  }

  try {
    const cfg = getSupabaseConfig();
    const customFetch = createResilientSupabaseFetch();
    supabase = createClientFn(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      ...(customFetch ? { global: { fetch: customFetch } } : {}),
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    console.info('[Supabase] Cliente conectado exitosamente en la aplicación principal.');
    return supabase;
  } catch (err) {
    console.warn('[Supabase] Error al inicializar cliente:', err);
    supabase = null;
    return null;
  }
}

// Intentar inicialización automática al cargar
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initSupabaseClient());
  } else {
    initSupabaseClient();
  }
}
