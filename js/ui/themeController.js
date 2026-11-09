// Controlador global de Tema Visual: Vista de Día (predeterminado) y Modo Nocturno
import { showToast } from './notifications.js';

export const STORAGE_KEY_THEME = 'adm_const_theme_mode';

let onThemeChangeRenderCallback = null;

export function setThemeRenderCallback(cb) {
  onThemeChangeRenderCallback = cb;
}

export function getThemeMode() {
  try {
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      if (document.documentElement.classList.contains('dark-mode')) return 'night';
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_THEME) === 'night' ? 'night' : 'day';
    }
  } catch (e) {
    // Fallback seguro en modo sandbox o sin almacenamiento
  }
  return 'day';
}

export function isNightMode() {
  return getThemeMode() === 'night';
}

export function updateThemeToggleUI(isNight) {
  if (typeof document === 'undefined') return;
  const btn = document.getElementById('btn-theme-toggle');
  const icon = document.getElementById('theme-toggle-icon');

  if (btn) {
    if (isNight) {
      btn.className = 'w-11 h-11 rounded-xl flex items-center justify-center bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-400/50 shadow-md shadow-amber-500/10 transition active:scale-95 cursor-pointer group relative';
      btn.title = 'Modo Actual: Modo Nocturno — Clic para cambiar a Vista de Día';
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-label', 'Cambiar a Vista de Día');
      }
    } else {
      btn.className = 'w-11 h-11 rounded-xl flex items-center justify-center bg-slate-900/80 hover:bg-indigo-500/20 text-indigo-300 hover:text-amber-300 border border-slate-800 hover:border-indigo-400/50 transition active:scale-95 cursor-pointer group relative shadow-2xs';
      btn.title = 'Modo Actual: Vista de Día — Clic para cambiar a Modo Nocturno';
      if (typeof btn.setAttribute === 'function') {
        btn.setAttribute('aria-label', 'Cambiar a Modo Nocturno');
      }
    }
  }

  if (icon) {
    icon.className = isNight
      ? 'fa-solid fa-sun text-base text-amber-300 group-hover:rotate-45 transition duration-200'
      : 'fa-solid fa-moon text-base group-hover:-rotate-12 transition duration-200';
  }
}

export function applyThemeMode(mode, options = {}) {
  const { persist = true, notify = false, rerender = false } = options;
  const normalized = mode === 'night' ? 'night' : 'day';
  const isNight = normalized === 'night';

  if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
    if (isNight) {
      document.documentElement.classList.add('dark-mode');
      if (document.documentElement.setAttribute) {
        document.documentElement.setAttribute('data-theme', 'night');
      }
    } else {
      document.documentElement.classList.remove('dark-mode');
      if (document.documentElement.setAttribute) {
        document.documentElement.setAttribute('data-theme', 'day');
      }
    }
  }

  if (persist && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_THEME, normalized);
    } catch (e) {
      // Ignorar si almacenamiento está bloqueado
    }
  }

  updateThemeToggleUI(isNight);

  if (rerender && typeof onThemeChangeRenderCallback === 'function') {
    onThemeChangeRenderCallback(normalized);
  }

  if (notify) {
    showToast(
      isNight
        ? '🌙 Modo Nocturno activado'
        : '☀️ Vista de Día activada'
    );
  }

  return normalized;
}

export function toggleThemeMode() {
  const nextMode = isNightMode() ? 'day' : 'night';
  return applyThemeMode(nextMode, { persist: true, notify: true, rerender: true });
}

export function initThemeMode() {
  let saved = 'day';
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY_THEME) === 'night') {
      saved = 'night';
    }
  } catch (e) {
    saved = 'day';
  }
  return applyThemeMode(saved, { persist: false, notify: false, rerender: false });
}
