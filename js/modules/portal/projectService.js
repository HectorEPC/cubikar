// js/modules/portal/projectService.js
// Servicio centralizado para usuarios, proyectos multi-obra y almacenamiento aislado

import {
  STORAGE_KEY_USER,
  STORAGE_KEY_PROJECTS,
  STORAGE_KEY_INVITATIONS,
  STORAGE_KEY_PLAN_INVITATIONS,
  STORAGE_KEY_ACTIVE_WORKSPACE,
  getStorageKey,
  getSettingsKey,
  getActiveProjectId,
  DEFAULT_STORAGE_KEY,
  DEFAULT_SETTINGS_KEY
} from '../../config/constants.js';
import { defaultTreeData, defaultSettings } from '../../config/defaultData.js';
import { cleanMojibake } from '../../core/textSanitizer.js';
import { CASA_LAURA_PROJECT } from '../io/casaLauraData.js';
import { deleteProjectFromCloud } from '../../core/cloudProjectService.js';

// Avatares temáticos según sexo (SVGs ultraligeros de arquitectos e ingenieros con casco)
export const AVATARS_BY_SEX = {
  'Masculino': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%231e3a8a'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fdba74'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23f59e0b'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%232563eb'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23ffffff'/%3E%3C/svg%3E",
  'Femenino': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23581c87'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fed7aa'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23f59e0b'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%237c3aed'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23fbcfe8'/%3E%3C/svg%3E",
  'Otro': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23064e3b'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fbcfe8'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23ffffff'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%23059669'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23a7f3d0'/%3E%3C/svg%3E"
};

// Cuentas de demostración de Google con foto real
export const GOOGLE_PRESET_ACCOUNTS = [
  {
    name: "Hepc 90",
    email: "admin.general@constructora.com",
    avatar: "",
    sexo: "Masculino",
    dob: "1990-01-01"
  },
  {
    name: "Arq. Carlos Alberto Gómez",
    email: "carlos.gomez.arq@gmail.com",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    sexo: "Masculino",
    dob: "1990-08-14"
  },
  {
    name: "Ing. Mariana Torres Morales",
    email: "mariana.torres.costos@gmail.com",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
    sexo: "Femenino",
    dob: "1993-04-22"
  },
  {
    name: "Arq. Roberto Méndez Silva",
    email: "roberto.mendez.obras@gmail.com",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    sexo: "Masculino",
    dob: "1988-11-05"
  },
  {
    name: "Lic. Sofía Valenzuela Rios",
    email: "sofia.valenzuela.admin@gmail.com",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    sexo: "Femenino",
    dob: "1995-02-17"
  }
];

export const PROJECT_ROLES = {
  editar: { label: 'Editar', description: 'Control Total', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  escribir: { label: 'Escribir', description: 'Captura de Conceptos e Insumos', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  leer: { label: 'Leer', description: 'Solo Lectura', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' }
};

// Logotipos de muestra
export const SAMPLE_LOGOS = {
  shield: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50,10 L85,25 L85,55 C85,75 50,92 50,92 C50,92 15,75 15,55 L15,25 Z' fill='%232563eb'/%3E%3Cpath d='M35,48 L46,59 L68,36' fill='none' stroke='white' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
  building: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%230f172a'/%3E%3Cpath d='M25,80 L25,35 L45,20 L45,80 Z' fill='%2338bdf8'/%3E%3Cpath d='M45,80 L45,35 L75,35 L75,80 Z' fill='%230284c7'/%3E%3C/svg%3E"
};

export const STORAGE_KEY_SUBSCRIPTION = 'adm_const_subscription';
export const STORAGE_KEY_REGISTERED_USERS = 'control_obra_registered_accounts_v1';
export const STORAGE_KEY_FEATURED_PROFILES = 'control_obra_featured_profiles_v1';
export const STORAGE_KEY_CLOSED_SESSIONS = 'control_obra_closed_sessions_v1';

export function getClosedSessionsList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLOSED_SESSIONS);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    return list.map(e => (typeof e === 'string' ? e.toLowerCase().trim() : '')).filter(Boolean);
  } catch (e) {
    return [];
  }
}

export function markSessionClosed(email) {
  if (!email) return;
  try {
    const cleanEmail = email.toLowerCase().trim();
    const list = getClosedSessionsList();
    if (!list.includes(cleanEmail)) {
      list.push(cleanEmail);
      localStorage.setItem(STORAGE_KEY_CLOSED_SESSIONS, JSON.stringify(list));
    }
  } catch (e) {}
}

export function markSessionOpen(emailOrUser) {
  if (!emailOrUser) return;
  const email = typeof emailOrUser === 'string' ? emailOrUser : emailOrUser.email;
  if (!email) return;
  try {
    const cleanEmail = email.toLowerCase().trim();
    const list = getClosedSessionsList();
    const filtered = list.filter(e => e !== cleanEmail);
    localStorage.setItem(STORAGE_KEY_CLOSED_SESSIONS, JSON.stringify(filtered));
  } catch (e) {}
}

export function getRegisteredUsersList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REGISTERED_USERS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export function saveRegisteredUserAccount(userObj) {
  if (!userObj || !userObj.email) return;
  try {
    const list = getRegisteredUsersList();
    const cleanEmail = userObj.email.toLowerCase().trim();
    const filtered = list.filter(u => (u.email || '').toLowerCase().trim() !== cleanEmail);

    let sub = null;
    if (typeof localStorage !== 'undefined') {
      const subRaw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
      if (subRaw) {
        try {
          const parsed = JSON.parse(subRaw);
          if (parsed?.planId) sub = parsed;
        } catch (_) {}
      }
    }
    if (!sub) {
      sub = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      try {
        localStorage.setItem(`adm_const_subscription_${cleanEmail}`, JSON.stringify(sub));
      } catch (_) {}
    }
    userObj.subscription = sub;

    filtered.push(userObj);
    localStorage.setItem(STORAGE_KEY_REGISTERED_USERS, JSON.stringify(filtered));
    markSessionOpen(cleanEmail);
    addFeaturedProfile(userObj);
  } catch (e) {}
}

export function findRegisteredUserAccount(email) {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();
  const list = getRegisteredUsersList();
  const found = list.find(u => (u.email || '').toLowerCase().trim() === cleanEmail) || null;
  if (found && typeof localStorage !== 'undefined') {
    const subRaw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
    if (subRaw) {
      try {
        const parsed = JSON.parse(subRaw);
        if (parsed?.planId) found.subscription = parsed;
      } catch (_) {}
    } else {
      found.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
    }
  }
  return found;
}

// ==========================================
// GESTIÓN DE PERFILES DESTACADOS (SESIONES INICIADAS)
// ==========================================
export function getFeaturedProfilesList() {
  try {
    const closedList = getClosedSessionsList();
    const closedSet = new Set(closedList);
    const seenEmails = new Set();
    const result = [];

    const addProfileCandidate = (p) => {
      if (!p || !p.email) return;
      const em = p.email.toLowerCase().trim();
      if (closedSet.has(em)) return;
      if (seenEmails.has(em)) return;
      seenEmails.add(em);

      result.push({
        name: p.name || em.split('@')[0],
        email: em,
        avatar: p.avatar || (AVATARS_BY_SEX && AVATARS_BY_SEX[p.sexo]) || (AVATARS_BY_SEX && AVATARS_BY_SEX['Masculino']) || 'assets/branding/cubikar_icon_transparent.png',
        sexo: p.sexo || 'Masculino',
        role: p.role || 'Admin General',
        roleLabel: p.roleLabel || 'Administrador',
        dob: p.dob || '',
        subscription: (() => {
          if (typeof localStorage !== 'undefined') {
            const raw = localStorage.getItem(`adm_const_subscription_${em}`);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (parsed?.planId) return parsed;
              } catch (_) {}
            }
          }
          return { planId: 'free', billingCycle: 'monthly', updatedAt: null };
        })(),
        lastLogin: p.lastLogin || p.registeredAt || new Date().toISOString()
      });
    };

    // 1. Usuario actualmente activo en sesiÃ³n
    const curr = getCurrentUser();
    if (curr) {
      addProfileCandidate(curr);
    }

    // 2. Perfiles explÃ­citamente guardados en STORAGE_KEY_FEATURED_PROFILES
    const rawFeatured = localStorage.getItem(STORAGE_KEY_FEATURED_PROFILES);
    if (rawFeatured) {
      try {
        const list = JSON.parse(rawFeatured);
        if (Array.isArray(list)) list.forEach(addProfileCandidate);
      } catch (_) {}
    }

    // 3. Usuario guardado anteriormente (getSavedUserProfile)
    const savedUser = getSavedUserProfile();
    if (savedUser) {
      addProfileCandidate(savedUser);
    }

    // 4. Todas las cuentas registradas en esta computadora
    const registered = getRegisteredUsersList();
    if (Array.isArray(registered)) {
      registered.forEach(addProfileCandidate);
    }

    return result;
  } catch (e) {
    console.error('Error obteniendo perfiles destacados:', e);
    return [];
  }
}

export function addFeaturedProfile(user) {
  if (!user || !user.email) return;
  try {
    const cleanEmail = user.email.toLowerCase().trim();
    markSessionOpen(cleanEmail);

    const raw = localStorage.getItem(STORAGE_KEY_FEATURED_PROFILES);
    let list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    const filtered = list.filter(p => (p.email || '').toLowerCase().trim() !== cleanEmail);

    const profileEntry = {
      name: user.name || cleanEmail.split('@')[0],
      email: cleanEmail,
      avatar: user.avatar || (AVATARS_BY_SEX && AVATARS_BY_SEX[user.sexo]) || (AVATARS_BY_SEX && AVATARS_BY_SEX['Masculino']) || 'assets/branding/cubikar_icon_transparent.png',
      sexo: user.sexo || 'Masculino',
      role: user.role || 'Admin General',
      roleLabel: user.roleLabel || 'Administrador',
      dob: user.dob || '',
      subscription: (() => {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.planId) return parsed;
            } catch (_) {}
          }
        }
        return { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      })(),
      lastLogin: new Date().toISOString()
    };

    filtered.unshift(profileEntry);
    localStorage.setItem(STORAGE_KEY_FEATURED_PROFILES, JSON.stringify(filtered));
  } catch (e) {}
}

export function removeFeaturedProfile(email) {
  if (!email) return;
  try {
    const cleanEmail = email.toLowerCase().trim();
    markSessionClosed(cleanEmail);

    const rawFeatured = localStorage.getItem(STORAGE_KEY_FEATURED_PROFILES);
    if (rawFeatured) {
      try {
        const list = JSON.parse(rawFeatured);
        if (Array.isArray(list)) {
          const filtered = list.filter(p => (p.email || '').toLowerCase().trim() !== cleanEmail);
          localStorage.setItem(STORAGE_KEY_FEATURED_PROFILES, JSON.stringify(filtered));
        }
      } catch (_) {}
    }

    // Si la sesión activa o guardada coincide con la cuenta que se quita, cerrar sesión automáticamente
    const curr = getCurrentUser();
    if (curr && (curr.email || '').toLowerCase().trim() === cleanEmail) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
    }
    const saved = getSavedUserProfile();
    if (saved && (saved.email || '').toLowerCase().trim() === cleanEmail) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
    }

    const remaining = getFeaturedProfilesList();
    if (remaining.length === 0) {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
      localStorage.setItem('control_obra_user_profile_dismissed', 'true');
    }
  } catch (e) {}
}

// Purga total de todas las cuentas registradas e información de usuarios
export function purgeAllRegisteredAccountsAndUsers() {
  try {
    localStorage.removeItem(STORAGE_KEY_REGISTERED_USERS);
    localStorage.removeItem(STORAGE_KEY_FEATURED_PROFILES);
    localStorage.removeItem(STORAGE_KEY_CLOSED_SESSIONS);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USER + '_last');
    localStorage.removeItem('control_obra_user_profile_dismissed');
    localStorage.removeItem(STORAGE_KEY_SUBSCRIPTION);
    localStorage.removeItem(STORAGE_KEY_INVITATIONS);
    localStorage.removeItem(STORAGE_KEY_PLAN_INVITATIONS);
    localStorage.removeItem('control_obra_clipboard_concept_v1');
    localStorage.removeItem('sb-' + 'supabase-auth-token');
    // Limpiar cualquier clave relacionada con perfiles de usuario
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('control_obra_user') || k.startsWith('control_obra_featured') || k.startsWith('control_obra_closed') || k.startsWith('sb-') || k.includes('auth-token') || k.startsWith('adm_const_subscription'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('Error purgando cuentas:', e);
  }
}

// ==========================================
// ELIMINACIÃ“N DEFINITIVA DE CUENTA Y ARCHIVOS
// ==========================================
export function deleteUserAccountAndData(email) {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();

  try {
    // 1. Eliminar todos los proyectos creados / pertenecientes a este usuario
    const allProjects = getProjectsList();
    const projectsToDelete = allProjects.filter(p => {
      const oEmail = (p.ownerEmail || '').toLowerCase().trim();
      return oEmail === cleanEmail;
    });

    projectsToDelete.forEach(p => {
      try {
        localStorage.removeItem(getSettingsKey(p.id));
        localStorage.removeItem(getStorageKey(p.id));
        localStorage.removeItem(`estimaciones_data_${p.id}`);
        localStorage.removeItem(`adm_const_state_${p.id}`);
        localStorage.removeItem(`adm_const_sobrecosto_${p.id}`);
        localStorage.removeItem(`project_chat_${p.id}`);
        deleteProjectFromCloud(p.id);
      } catch (_) {}
    });

    // 2. Guardar lista de proyectos restantes (excluyendo los del usuario y quitÃ¡ndolo de colaboradores de otros proyectos)
    const remainingProjects = allProjects.filter(p => {
      const oEmail = (p.ownerEmail || '').toLowerCase().trim();
      return oEmail !== cleanEmail;
    }).map(p => {
      if (Array.isArray(p.members)) {
        p.members = p.members.filter(m => (m.email || '').toLowerCase().trim() !== cleanEmail);
      }
      return p;
    });
    saveProjectsList(remainingProjects);

    // 3. Limpiar invitaciones asociadas a este correo
    try {
      const invs = getStoredInvitations().filter(inv => {
        const iEmail = (inv.email || inv.inviteeEmail || '').toLowerCase().trim();
        const oEmail = (inv.ownerEmail || inv.inviterEmail || '').toLowerCase().trim();
        return iEmail !== cleanEmail && oEmail !== cleanEmail;
      });
      saveStoredInvitations(invs);
    } catch (_) {}

    try {
      const planInvs = getStoredPlanInvitations().filter(pInv => {
        const iEmail = (pInv.email || pInv.inviteeEmail || '').toLowerCase().trim();
        const oEmail = (pInv.ownerEmail || '').toLowerCase().trim();
        return iEmail !== cleanEmail && oEmail !== cleanEmail;
      });
      saveStoredPlanInvitations(planInvs);
    } catch (_) {}

    // 4. Quitar de cuentas registradas en este equipo
    try {
      const registered = getRegisteredUsersList().filter(u => (u.email || '').toLowerCase().trim() !== cleanEmail);
      localStorage.setItem(STORAGE_KEY_REGISTERED_USERS, JSON.stringify(registered));
    } catch (_) {}

    // 5. Quitar de perfiles destacados
    removeFeaturedProfile(cleanEmail);

    // 6. Quitar de sesiones cerradas
    try {
      const closed = getClosedSessionsList().filter(e => e !== cleanEmail);
      localStorage.setItem(STORAGE_KEY_CLOSED_SESSIONS, JSON.stringify(closed));
    } catch (_) {}

    // 7. Limpiar suscripciones o datos locales especÃ­ficos del correo
    try {
      localStorage.removeItem(`adm_const_subscription_${cleanEmail}`);
    } catch (_) {}

    // 8. Si es el usuario activo actual, limpiar sesiÃ³n activa y espacio de trabajo
    const current = getCurrentUser();
    if (current && (current.email || '').toLowerCase().trim() === cleanEmail) {
      saveCurrentUser(null);
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_USER + '_last');
      localStorage.removeItem(STORAGE_KEY_ACTIVE_WORKSPACE);
      localStorage.removeItem('control_obra_clipboard_concept_v1');
    }

    return true;
  } catch (err) {
    console.error('Error eliminando cuenta y datos de usuario:', err);
    return false;
  }
}

// ==========================================
// GESTIÓN DE USUARIO
// ==========================================
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (raw) {
      const u = JSON.parse(raw);
      const cleanEmail = (u?.email || '').toLowerCase().trim();
      if (cleanEmail && typeof localStorage !== 'undefined') {
        const subRaw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
        if (subRaw) {
          try {
            const parsed = JSON.parse(subRaw);
            if (parsed?.planId) {
              u.subscription = parsed;
            }
          } catch (e) {}
        }
      }
      if (u && !u.subscription) {
        u.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      }
      return u;
    }
    return null;
  } catch (e) {
    console.error('Error leyendo usuario:', e);
    return null;
  }
}

// Retorna el usuario guardado en localStorage sin forzar ningún fallback inventado
export function getSavedUserProfile() {
  try {
    const isDismissed = localStorage.getItem('control_obra_user_profile_dismissed');
    if (isDismissed === 'true') {
      return null;
    }
    const raw = localStorage.getItem(STORAGE_KEY_USER + '_last') || localStorage.getItem(STORAGE_KEY_USER);
    if (raw) {
      const u = JSON.parse(raw);
      const cleanEmail = (u?.email || '').toLowerCase().trim();
      if (cleanEmail && typeof localStorage !== 'undefined') {
        const subRaw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
        if (subRaw) {
          try {
            const parsed = JSON.parse(subRaw);
            if (parsed?.planId) {
              u.subscription = parsed;
            }
          } catch (e) {}
        }
      }
      if (u && !u.subscription) {
        u.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      }
      return u;
    }
  } catch (e) {}
  return null;
}

export function getLastKnownUser() {
  const saved = getSavedUserProfile();
  if (saved) return saved;

  const fallback = {
    name: 'Hepc 90',
    email: 'admin.general@constructora.com',
    avatar: '',
    role: 'Admin General',
    sexo: 'Masculino'
  };
  try {
    const cleanEmail = (fallback.email || '').toLowerCase().trim();
    const subRaw = cleanEmail ? localStorage.getItem(`adm_const_subscription_${cleanEmail}`) : null;
    if (subRaw) fallback.subscription = JSON.parse(subRaw);
  } catch (e) {}
  return fallback;
}

export function saveCurrentUser(user) {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY_USER);
    } else {
      try {
        localStorage.removeItem('control_obra_user_profile_dismissed');
      } catch (e) {}
      const cleanUserEmail = (user?.email || '').toLowerCase().trim();

      // Sincronizar siempre con la suscripciÃ³n aislada del usuario
      if (cleanUserEmail && typeof localStorage !== 'undefined') {
        const subRaw = localStorage.getItem(`adm_const_subscription_${cleanUserEmail}`);
        const PLAN_RANKS = { pro: 3, plus: 2, free: 1 };
        if (subRaw) {
          try {
            const parsedSub = JSON.parse(subRaw);
            if (parsedSub?.planId) {
              const currentRank = PLAN_RANKS[user.subscription?.planId] || 1;
              const parsedRank = PLAN_RANKS[parsedSub.planId] || 1;

              if (currentRank > parsedRank) {
                // El usuario en memoria posee un plan superior (ej. Plus o Pro recién sincronizado)
                localStorage.setItem(`adm_const_subscription_${cleanUserEmail}`, JSON.stringify(user.subscription));
              } else if (parsedRank > currentRank) {
                // El almacenamiento local posee un plan superior
                user.subscription = parsedSub;
              } else if (user.subscription && user.subscription.updatedAt && parsedSub.updatedAt && new Date(user.subscription.updatedAt) > new Date(parsedSub.updatedAt)) {
                localStorage.setItem(`adm_const_subscription_${cleanUserEmail}`, JSON.stringify(user.subscription));
              } else {
                user.subscription = parsedSub;
              }
            }
          } catch (_) {}
        } else {
          // Si el usuario trae suscripción válida (ej. de Supabase o Google en otra PC), conservarla
          if (user.subscription && user.subscription.planId && user.subscription.planId !== 'free') {
            localStorage.setItem(`adm_const_subscription_${cleanUserEmail}`, JSON.stringify(user.subscription));
          } else if (cleanUserEmail === 'hepc.90@gmail.com' || cleanUserEmail === 'admin.general@constructora.com') {
            const proSub = { planId: 'pro', billingCycle: 'monthly', updatedAt: new Date().toISOString() };
            user.subscription = proSub;
            localStorage.setItem(`adm_const_subscription_${cleanUserEmail}`, JSON.stringify(proSub));
          } else {
            // Verificar si hay suscripción global previa antes de asignar free
            let existingGlobal = null;
            try {
              const gRaw = localStorage.getItem('adm_const_subscription');
              if (gRaw) existingGlobal = JSON.parse(gRaw);
            } catch (_) {}
            if (existingGlobal?.planId && existingGlobal.planId !== 'free') {
              user.subscription = existingGlobal;
              localStorage.setItem(`adm_const_subscription_${cleanUserEmail}`, JSON.stringify(existingGlobal));
            } else {
              const initialFree = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
              user.subscription = initialFree;
              localStorage.setItem(`adm_const_subscription_${cleanUserEmail}`, JSON.stringify(initialFree));
            }
          }
        }
      }

      if (!user.subscription) {
        user.subscription = { planId: 'free', billingCycle: 'monthly', updatedAt: null };
      }
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      try {
        localStorage.setItem(STORAGE_KEY_USER + '_last', JSON.stringify(user));
      } catch (e) {}
    }
  } catch (e) {
    console.error('Error guardando usuario:', e);
  }
}

// ==========================================
// GESTIÓN DE PROYECTOS
// ==========================================
export function getProjectsList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) {
      const list = JSON.parse(raw);
      // Asegurar que cada proyecto tenga su lista de colaboradores con permisos
      const currentUser = getCurrentUser();
      let changed = false;

      // Asegurar que el proyecto auténtico Casa Laura (Opus 2014) esté siempre registrado
      const hasCasaLaura = list.some(p => p.id === 'proj-opus-casa-laura' || (p.projectName && p.projectName.toLowerCase().includes('casa laura')));
      if (!hasCasaLaura) {
        const proj3Id = 'proj-opus-casa-laura';
        const proj3Settings = Object.assign({}, defaultSettings, {
          companyName: 'Constructora Opus México',
          companyLogo: SAMPLE_LOGOS.building,
          projectName: 'Casa Laura (Opus 2014)',
          projectLocation: 'Fraccionamiento Residencial, Puebla, Pue.',
          currency: 'MXN',
          currencySymbol: '$',
          applySobrecosto: false,
          pctIndirectos: 0.00,
          pctFinanciamiento: 0.00,
          pctUtilidad: 0.00,
          pctAdicionales: 0.00
        });
        const proj3Tree = JSON.parse(JSON.stringify(CASA_LAURA_PROJECT));
        try {
          localStorage.setItem(getSettingsKey(proj3Id), JSON.stringify(proj3Settings));
          localStorage.setItem(getStorageKey(proj3Id), JSON.stringify(proj3Tree));
        } catch (e) {}

        list.push({
          id: proj3Id,
          companyName: proj3Settings.companyName,
          companyLogo: proj3Settings.companyLogo,
          projectName: proj3Settings.projectName,
          projectLocation: proj3Settings.projectLocation,
          tipoObra: 'Vivienda',
          currency: proj3Settings.currency,
          currencySymbol: proj3Settings.currencySymbol,
          factorSobrecosto: 1.0000,
          totalPresupuesto: 2043699.54,
          conceptCount: 94,
          partidasCount: 12,
          createdAt: '2024-05-20',
          members: [
            {
              id: 'mem-' + (currentUser ? currentUser.email : 'owner'),
              name: (currentUser && currentUser.name) || 'Administrador de Obra',
              email: (currentUser && currentUser.email) || 'admin@constructora.com',
              avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
              role: 'editar'
            }
          ]
        });
        changed = true;
      }

      list.forEach(p => {
        if (p.projectName) p.projectName = cleanMojibake(p.projectName);
        if (p.companyName) p.companyName = cleanMojibake(p.companyName);
        if (p.projectLocation) p.projectLocation = cleanMojibake(p.projectLocation);
        if (p.tipoObra) p.tipoObra = cleanMojibake(p.tipoObra);
        if (Array.isArray(p.members)) {
          p.members.forEach(m => {
            if (!Array.isArray(m.allowedTabs)) {
              if (m.role === 'editar') {
                m.allowedTabs = ['cat', 'insumos', 'calendario', 'estimaciones'];
              } else if (m.email && m.email.includes('mariana')) {
                m.allowedTabs = ['insumos', 'estimaciones'];
              } else if (m.email && m.email.includes('roberto')) {
                m.allowedTabs = ['cat', 'calendario'];
              } else {
                m.allowedTabs = ['cat', 'insumos'];
              }
              changed = true;
            }
          });
        }
        if (!p.members || !Array.isArray(p.members) || p.members.length === 0) {
          p.members = [
            {
              id: 'mem-' + (currentUser ? currentUser.email : 'owner'),
              name: (currentUser && currentUser.name) || 'Administrador de Obra',
              email: (currentUser && currentUser.email) || 'admin@constructora.com',
              avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
              role: 'editar',
              allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones']
            },
            {
              id: 'mem-colab-01',
              name: 'Ing. Mariana Torres Morales',
              email: 'mariana.torres.costos@gmail.com',
              avatar: AVATARS_BY_SEX['Femenino'],
              role: 'escribir',
              allowedTabs: ['insumos', 'estimaciones']
            },
            {
              id: 'mem-colab-02',
              name: 'Arq. Roberto Méndez Silva',
              email: 'roberto.mendez.obras@gmail.com',
              avatar: AVATARS_BY_SEX['Masculino'],
              role: 'leer',
              allowedTabs: ['cat', 'calendario']
            }
          ];
          changed = true;
        }

        // Asignar tipo de obra si no cuenta con él
        if (!p.tipoObra) {
          const nameLower = (p.projectName || '').toLowerCase();
          if (nameLower.includes('torre') || nameLower.includes('corporativ') || nameLower.includes('edificio')) {
            p.tipoObra = 'Edificación';
          } else if (nameLower.includes('residencia') || nameLower.includes('casa') || nameLower.includes('vivienda') || nameLower.includes('lomas')) {
            p.tipoObra = 'Vivienda';
          } else if (nameLower.includes('puente') || nameLower.includes('cimentac') || nameLower.includes('pilot')) {
            p.tipoObra = 'Obra Civil';
          } else if (nameLower.includes('vial') || nameLower.includes('carreter') || nameLower.includes('parque')) {
            p.tipoObra = 'Infraestructura';
          } else {
            p.tipoObra = 'Edificación';
          }
          changed = true;
        }

        // Garantizar que cada proyecto tenga ownerEmail
        if (!p.ownerEmail) {
          const firstEditor = Array.isArray(p.members) ? p.members.find(m => m.role === 'editar') : null;
          p.ownerEmail = firstEditor?.email || 'admin.general@constructora.com';
          changed = true;
        }

        // Asignar fecha de creación si no cuenta con ella
        if (!p.createdAt) {
          p.createdAt = new Date().toISOString().slice(0, 10);
          changed = true;
        }
      });
      if (changed) saveProjectsList(list);
      return list;
    }
  } catch (e) {
    console.error('Error leyendo proyectos:', e);
  }
  return initializeDefaultProjects();
}

function triggerCloudCollabSync(user) {
  try {
    if (typeof window !== 'undefined' && typeof window.triggerDebouncedCloudStateSync === 'function') {
      window.triggerDebouncedCloudStateSync(user);
    } else if (typeof window !== 'undefined' && typeof window.syncUserCollaborationToCloud === 'function') {
      window.syncUserCollaborationToCloud(user);
    }
  } catch (_) {}
}

export function saveProjectsList(projects) {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('Error guardando proyectos:', e);
  }
  triggerCloudCollabSync();
}

// Obtener proyectos accesibles para un usuario dado
// En el perfil del usuario solo aparecerán los proyectos que creó y aquellos en los que aceptó la invitación (miembro activo).
export function getProjectsForUser(user) {
  const allProjects = getProjectsList();
  if (!user || !user.email) return allProjects;
  const emailLower = user.email.toLowerCase().trim();

  return allProjects.filter(p => {
    // Es el creador/propietario del proyecto
    if (p.ownerEmail && p.ownerEmail.toLowerCase().trim() === emailLower) {
      return true;
    }
    // O es miembro activo (no pendiente de invitación)
    if (Array.isArray(p.members)) {
      return p.members.some(m => {
        const mEmail = (m.email || '').toLowerCase().trim();
        return mEmail === emailLower && m.status !== 'pending';
      });
    }
    return false;
  });
}

export function getProjectById(id) {
  const list = getProjectsList();
  return list.find(p => p.id === id) || null;
}

// Inicializar proyectos por defecto o migrar datos existentes
function initializeDefaultProjects() {
  let existingTree = null;
  let existingSettings = null;

  try {
    const rawTree = localStorage.getItem(DEFAULT_STORAGE_KEY);
    if (rawTree) existingTree = JSON.parse(rawTree);
    const rawSet = localStorage.getItem(DEFAULT_SETTINGS_KEY);
    if (rawSet) existingSettings = JSON.parse(rawSet);
  } catch (e) {}

  const initialProjects = [];

  // Proyecto Principal (basado en los datos actuales o por defecto)
  const proj1Id = 'proj-default-01';
  const proj1Settings = Object.assign({}, defaultSettings, existingSettings || {}, {
    companyName: (existingSettings && existingSettings.companyName) || 'Constructora Lomas del Ángel S.A.',
    companyLogo: (existingSettings && existingSettings.companyLogo) || SAMPLE_LOGOS.shield,
    projectName: (existingSettings && existingSettings.projectName) || 'Residencia Lomas Altas (Fase 1)',
    projectLocation: (existingSettings && existingSettings.projectLocation) || 'Av. Paseo de las Lomas 1240, CDMX',
    currency: (existingSettings && existingSettings.currency) || 'MXN',
    currencySymbol: (existingSettings && existingSettings.currencySymbol) || '$',
    applySobrecosto: true,
    pctIndirectos: 12.00,
    pctFinanciamiento: 1.50,
    pctUtilidad: 10.00,
    pctAdicionales: 0.50
  });

  const proj1Tree = existingTree && existingTree.length > 0 ? existingTree : JSON.parse(JSON.stringify(defaultTreeData));

  // Guardar almacenamiento aislado para el proyecto 1
  try {
    localStorage.setItem(getSettingsKey(proj1Id), JSON.stringify(proj1Settings));
    localStorage.setItem(getStorageKey(proj1Id), JSON.stringify(proj1Tree));
  } catch (e) {}

  const f1 = 1.2584;
  initialProjects.push({
    id: proj1Id,
    companyName: proj1Settings.companyName,
    companyLogo: proj1Settings.companyLogo,
    projectName: proj1Settings.projectName,
    projectLocation: proj1Settings.projectLocation,
    tipoObra: 'Vivienda',
    currency: proj1Settings.currency,
    currencySymbol: proj1Settings.currencySymbol,
    factorSobrecosto: f1,
    totalPresupuesto: calculateTreeTotal(proj1Tree),
    conceptCount: countTreeConcepts(proj1Tree),
    partidasCount: countTreePartidas(proj1Tree),
    createdAt: '2026-09-15'
  });

  // Proyecto de Muestra 2 (Torre Corporativa Reforma)
  const proj2Id = 'proj-demo-02';
  const proj2Settings = Object.assign({}, defaultSettings, {
    companyName: 'Grupo Constructor Metrópoli',
    companyLogo: SAMPLE_LOGOS.building,
    projectName: 'Torre Corporativa Reforma',
    projectLocation: 'Paseo de la Reforma 405, Cuauhtémoc, CDMX',
    currency: 'USD',
    currencySymbol: '$',
    applySobrecosto: true,
    pctIndirectos: 10.00,
    pctFinanciamiento: 1.20,
    pctUtilidad: 9.50,
    pctAdicionales: 0.50
  });

  const proj2Tree = [
    {
      id: 'p2-1',
      clave: '1',
      descripcion: 'SUBESTRUCTURA Y PILOTES',
      unidad: 'lote',
      cantidad: 1,
      precioUnitario: 0,
      costoDirecto: 0,
      color: '#3b82f6',
      expanded: true,
      selected: true,
      children: [
        {
          id: 'p2-1.1',
          clave: '1.1',
          descripcion: 'Pilotes de cimentación profunda de concreto armado d=80 cm h=22 m',
          unidad: 'm',
          cantidad: 1450.00,
          precioUnitario: 320.00,
          costoDirecto: 320.00,
          selected: true,
          insumos: [
            { clave: 'MAT-P01', tipo: 'Material', descripcion: 'Concreto premezclado f\'c=350 kg/cm2', unidad: 'm3', cantidad: 0.52, costoUnitario: 145.00 },
            { clave: 'MO-P01', tipo: 'Mano de Obra', descripcion: 'Cuadrilla especializada en perforación y colado', unidad: 'jor', cantidad: 0.05, costoUnitario: 180.00 },
            { clave: 'EQ-P01', tipo: 'Equipo', descripcion: 'Perforadora hidráulica sobre orugas Casagrande', unidad: 'hr', cantidad: 0.04, costoUnitario: 850.00 }
          ]
        }
      ]
    }
  ];

  try {
    localStorage.setItem(getSettingsKey(proj2Id), JSON.stringify(proj2Settings));
    localStorage.setItem(getStorageKey(proj2Id), JSON.stringify(proj2Tree));
  } catch (e) {}

  initialProjects.push({
    id: proj2Id,
    companyName: proj2Settings.companyName,
    companyLogo: proj2Settings.companyLogo,
    projectName: proj2Settings.projectName,
    projectLocation: proj2Settings.projectLocation,
    tipoObra: 'Edificación',
    currency: proj2Settings.currency,
    currencySymbol: proj2Settings.currencySymbol,
    factorSobrecosto: 1.2215,
    totalPresupuesto: calculateTreeTotal(proj2Tree),
    conceptCount: countTreeConcepts(proj2Tree),
    partidasCount: countTreePartidas(proj2Tree),
    createdAt: '2026-10-10'
  });

  // Proyecto 3: Casa Laura (Opus 2014)
  const proj3Id = 'proj-opus-casa-laura';
  const proj3Settings = Object.assign({}, defaultSettings, {
    companyName: 'Constructora Opus México',
    companyLogo: SAMPLE_LOGOS.building,
    projectName: 'Casa Laura (Opus 2014)',
    projectLocation: 'Fraccionamiento Residencial, Puebla, Pue.',
    currency: 'MXN',
    currencySymbol: '$',
    applySobrecosto: false,
    pctIndirectos: 0.00,
    pctFinanciamiento: 0.00,
    pctUtilidad: 0.00,
    pctAdicionales: 0.00
  });

  const proj3Tree = JSON.parse(JSON.stringify(CASA_LAURA_PROJECT));

  try {
    localStorage.setItem(getSettingsKey(proj3Id), JSON.stringify(proj3Settings));
    localStorage.setItem(getStorageKey(proj3Id), JSON.stringify(proj3Tree));
  } catch (e) {}

  initialProjects.push({
    id: proj3Id,
    companyName: proj3Settings.companyName,
    companyLogo: proj3Settings.companyLogo,
    projectName: proj3Settings.projectName,
    projectLocation: proj3Settings.projectLocation,
    tipoObra: 'Vivienda',
    currency: proj3Settings.currency,
    currencySymbol: proj3Settings.currencySymbol,
    factorSobrecosto: 1.0000,
    totalPresupuesto: 2043699.54,
    conceptCount: 94,
    partidasCount: 12,
    createdAt: '2024-05-20'
  });

  saveProjectsList(initialProjects);
  return initialProjects;
}

// Crear un nuevo proyecto
export function createNewProject(params) {
  const newId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : 'proj-' + Date.now();
  
  const projSettings = Object.assign({}, defaultSettings, {
    companyName: params.companyName,
    companyLogo: params.companyLogo || '',
    projectName: params.projectName,
    projectLocation: params.projectLocation,
    currency: params.currency || 'MXN',
    currencySymbol: params.currencySymbol || '$',
    applySobrecosto: params.applySobrecosto ?? true,
    pctIndirectos: params.pctIndirectos ?? 12.00,
    pctFinanciamiento: params.pctFinanciamiento ?? 1.50,
    pctUtilidad: params.pctUtilidad ?? 10.00,
    pctAdicionales: params.pctAdicionales ?? 0.50,
    pctSegurosFianzas: params.pctSegurosFianzas ?? 1.00,
    pctFasar: params.pctFasar ?? 70.00
  });

  const projTree = params.template === 'demo' ? JSON.parse(JSON.stringify(defaultTreeData)) : [];

  // Almacenar settings y catálogo del nuevo proyecto
  try {
    localStorage.setItem(getSettingsKey(newId), JSON.stringify(projSettings));
    localStorage.setItem(getStorageKey(newId), JSON.stringify(projTree));
  } catch (e) {
    console.error('Error guardando nuevo proyecto:', e);
  }

  const f = projSettings.applySobrecosto ?
    (1 + projSettings.pctIndirectos/100) * (1 + projSettings.pctFinanciamiento/100) * (1 + projSettings.pctUtilidad/100) * (1 + projSettings.pctAdicionales/100) * (1 + (projSettings.pctSegurosFianzas || 0)/100) : 1.0;

  const currentUser = getCurrentUser();
  const targetOwnerEmail = (params.ownerEmail || (currentUser && currentUser.email) || 'admin.general@constructora.com').toLowerCase().trim();
  const targetOwnerPlanId = params.ownerPlanId || getUserPlanId(targetOwnerEmail);

  // Determinar miembros iniciales
  let initialMembers = [];
  if (Array.isArray(params.members) && params.members.length > 0) {
    initialMembers = params.members;
  } else {
    const isUnderOtherHost = currentUser && currentUser.email && targetOwnerEmail !== currentUser.email.toLowerCase().trim();
    if (isUnderOtherHost) {
      initialMembers = [
        {
          id: 'mem-' + targetOwnerEmail,
          name: params.hostName || params.companyName || 'Propietario de Obra',
          email: targetOwnerEmail,
          avatar: AVATARS_BY_SEX['Masculino'],
          role: 'editar',
          status: 'active'
        },
        {
          id: 'mem-' + currentUser.email,
          name: currentUser.name || 'Editor de Obra',
          email: currentUser.email,
          avatar: currentUser.avatar || AVATARS_BY_SEX['Masculino'],
          role: 'editar',
          status: 'active'
        }
      ];

      // Vincular automáticamente a todos los demás colaboradores del plan del anfitrión (User A) con sus respectivos roles ('editar', 'escribir', 'leer')
      const existingCollabs = getPlanCollaboratorsForOwner(targetOwnerEmail);
      existingCollabs.forEach(collab => {
        const cEmail = (collab.email || '').toLowerCase().trim();
        if (cEmail && cEmail !== targetOwnerEmail && cEmail !== currentUser.email.toLowerCase().trim()) {
          initialMembers.push({
            id: 'mem-' + cEmail,
            name: collab.name || cEmail.split('@')[0],
            email: cEmail,
            avatar: collab.avatar || AVATARS_BY_SEX['Masculino'],
            role: collab.role || 'editar',
            allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones'],
            status: collab.status || 'active'
          });
        }
      });
    } else {
      initialMembers = [
        {
          id: 'mem-' + (currentUser ? currentUser.email : Date.now()),
          name: (currentUser && currentUser.name) || 'Administrador de Obra',
          email: (currentUser && currentUser.email) || 'admin@constructora.com',
          avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
          role: 'editar',
          status: 'active'
        }
      ];

      // Si el dueño mismo crea la obra, vincular automáticamente a los colaboradores ya invitados a su plan
      const existingCollabs = getPlanCollaboratorsForOwner(targetOwnerEmail);
      existingCollabs.forEach(collab => {
        const cEmail = (collab.email || '').toLowerCase().trim();
        if (cEmail && cEmail !== targetOwnerEmail) {
          initialMembers.push({
            id: 'mem-' + cEmail,
            name: collab.name || cEmail.split('@')[0],
            email: cEmail,
            avatar: collab.avatar || AVATARS_BY_SEX['Masculino'],
            role: collab.role || 'editar',
            allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones'],
            status: collab.status || 'active'
          });
        }
      });
    }
  }

  const projectEntry = {
    id: newId,
    companyName: projSettings.companyName,
    companyLogo: projSettings.companyLogo,
    projectName: projSettings.projectName,
    projectLocation: projSettings.projectLocation,
    tipoObra: params.tipoObra || 'Edificación',
    currency: projSettings.currency,
    currencySymbol: projSettings.currencySymbol,
    factorSobrecosto: f,
    totalPresupuesto: calculateTreeTotal(projTree),
    conceptCount: countTreeConcepts(projTree),
    partidasCount: countTreePartidas(projTree),
    ownerEmail: targetOwnerEmail,
    ownerPlanId: targetOwnerPlanId,
    members: initialMembers,
    createdAt: params.createdAt || new Date().toISOString().slice(0, 10)
  };

  const list = getProjectsList();
  list.unshift(projectEntry);
  saveProjectsList(list);

  try {
    if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastNewProject === 'function') {
      window.CubikarRealtime.broadcastNewProject(projectEntry);
    }
  } catch (e) {}

  return projectEntry;
}

// Duplicar proyecto
export function duplicateProject(projectId) {
  const orig = getProjectById(projectId);
  if (!orig) return null;

  let origSettings = defaultSettings;
  let origTree = [];
  try {
    const s = localStorage.getItem(getSettingsKey(projectId));
    if (s) origSettings = JSON.parse(s);
    const t = localStorage.getItem(getStorageKey(projectId));
    if (t) origTree = JSON.parse(t);
  } catch(e) {}

  const newId = 'proj-' + Date.now();
  const copySettings = JSON.parse(JSON.stringify(origSettings));
  copySettings.projectName = orig.projectName + ' (Copia)';

  const copyTree = JSON.parse(JSON.stringify(origTree));

  try {
    localStorage.setItem(getSettingsKey(newId), JSON.stringify(copySettings));
    localStorage.setItem(getStorageKey(newId), JSON.stringify(copyTree));
    const origEst = localStorage.getItem(`estimaciones_data_${projectId}`);
    if (origEst) {
      localStorage.setItem(`estimaciones_data_${newId}`, origEst);
    }
  } catch(e) {}

  const newProj = Object.assign({}, orig, {
    id: newId,
    projectName: copySettings.projectName,
    members: (orig.members || []).map(m => Object.assign({}, m)),
    createdAt: new Date().toISOString().slice(0, 10)
  });

  const list = getProjectsList();
  list.unshift(newProj);
  saveProjectsList(list);

  return newProj;
}

// ==========================================
// GESTIÓN DE COLABORADORES / USUARIOS DE PROYECTO
// ==========================================
export function getProjectMembers(projectId) {
  const p = getProjectById(projectId);
  return (p && Array.isArray(p.members)) ? p.members : [];
}

export function addProjectMember(projectId, memberData) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return null;

  if (!Array.isArray(proj.members)) proj.members = [];

  // Verificar si ya existe por email
  const existingIdx = proj.members.findIndex(m => m.email && m.email.toLowerCase() === memberData.email.toLowerCase());
  if (existingIdx < 0) {
    const ownerEmail = (proj.ownerEmail || getCurrentUser()?.email || '').toLowerCase().trim();
    const quotaCheck = canAddUserToOwnerAccount(ownerEmail, memberData.email, projectId);
    if (!quotaCheck.allowed) {
      console.warn('[Suscripción] addProjectMember bloqueado por límite de plan:', quotaCheck.reason);
      return null;
    }
  }
  const newMember = {
    id: memberData.id || ('mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
    name: memberData.name.trim(),
    email: memberData.email.trim(),
    avatar: memberData.avatar || AVATARS_BY_SEX['Masculino'],
    role: memberData.role || 'editar', // 'editar', 'escribir', 'leer'
    allowedTabs: Array.isArray(memberData.allowedTabs) ? memberData.allowedTabs : ['cat', 'insumos', 'calendario', 'estimaciones']
  };

  if (existingIdx >= 0) {
    proj.members[existingIdx] = Object.assign(proj.members[existingIdx], newMember);
  } else {
    proj.members.push(newMember);
  }

  saveProjectsList(list);
  return newMember;
}

export function removeProjectMember(projectId, memberId) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const targetMember = proj.members.find(m => m.id === memberId);
  proj.members = proj.members.filter(m => m.id !== memberId);
  saveProjectsList(list);

  // También limpiar cualquier invitación pendiente asociada
  if (targetMember && targetMember.email) {
    try {
      const invs = getStoredInvitations().filter(
        inv => !(inv.projectId === projectId && inv.email.toLowerCase() === targetMember.email.toLowerCase())
      );
      saveStoredInvitations(invs);
    } catch (e) {}
  }

  return true;
}

export function updateProjectMemberRole(projectId, memberId, newRole) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const mem = proj.members.find(m => m.id === memberId);
  if (mem) {
    mem.role = newRole;
    saveProjectsList(list);
    return true;
  }
  return false;
}

// Actualizar pestañas permitidas para un miembro
export function updateProjectMemberTabs(projectId, memberId, allowedTabs) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const mem = proj.members.find(m => m.id === memberId);
  if (mem) {
    mem.allowedTabs = Array.isArray(allowedTabs) ? allowedTabs : [];
    saveProjectsList(list);
    return true;
  }
  return false;
}

// Actualizar los miembros asignados a una pestaña específica de este proyecto
export function setTabAssignedMembers(projectId, tabId, memberIds) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const idSet = new Set(memberIds);
  proj.members.forEach(m => {
    if (!Array.isArray(m.allowedTabs)) {
      m.allowedTabs = ['cat', 'insumos', 'calendario', 'estimaciones'];
    }
    if (idSet.has(m.id)) {
      if (!m.allowedTabs.includes(tabId)) {
        m.allowedTabs.push(tabId);
      }
    } else {
      m.allowedTabs = m.allowedTabs.filter(t => t !== tabId);
    }
  });

  saveProjectsList(list);
  return true;
}

// Obtener los miembros de este proyecto asignados a una pestaña específica
export function getTabAssignedMembers(projectId, tabId) {
  const members = getProjectMembers(projectId);
  return members.filter(m => {
    if (!Array.isArray(m.allowedTabs)) return true;
    return m.allowedTabs.includes(tabId);
  });
}

// Eliminar proyecto
export function deleteProject(projectId) {
  try {
    localStorage.removeItem(getSettingsKey(projectId));
    localStorage.removeItem(getStorageKey(projectId));
    localStorage.removeItem(`estimaciones_data_${projectId}`);
    deleteProjectFromCloud(projectId);
  } catch(e) {}

  const list = getProjectsList().filter(p => p.id !== projectId);
  saveProjectsList(list);
}

// Sincronizar el resumen del proyecto activo
export function syncActiveProjectSummary(projectId, treeData, settings) {
  if (!projectId) return;
  const list = getProjectsList();
  const idx = list.findIndex(p => p.id === projectId);
  if (idx === -1) return;

  const f = settings.applySobrecosto ?
    (1 + ((parseFloat(settings.pctIndirectos) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctFinanciamiento) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctUtilidad) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctAdicionales) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctSegurosFianzas) || 0) / 100)) : 1.0;

  list[idx].companyName = settings.companyName || list[idx].companyName;
  list[idx].companyLogo = settings.companyLogo !== undefined ? settings.companyLogo : list[idx].companyLogo;
  list[idx].projectName = settings.projectName || list[idx].projectName;
  list[idx].projectLocation = settings.projectLocation || list[idx].projectLocation;
  list[idx].currency = settings.currency || list[idx].currency;
  list[idx].currencySymbol = settings.currencySymbol || list[idx].currencySymbol;
  list[idx].factorSobrecosto = f;
  list[idx].totalPresupuesto = calculateTreeTotal(treeData);
  list[idx].conceptCount = countTreeConcepts(treeData);
  list[idx].partidasCount = countTreePartidas(treeData);

  saveProjectsList(list);
}

// ==========================================
// GESTIÓN DE INVITACIONES Y PERMISOS DE PROYECTO
// ==========================================

export function getStoredInvitations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_INVITATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveStoredInvitations(invitations) {
  try {
    localStorage.setItem(STORAGE_KEY_INVITATIONS, JSON.stringify(invitations || []));
  } catch (e) {}
  triggerCloudCollabSync();
}

// Obtener invitaciones pendientes para un usuario específico (por email)
export function getPendingInvitationsForUser(userEmail) {
  if (!userEmail) return [];
  const emailLower = userEmail.toLowerCase().trim();
  const allInvs = getStoredInvitations();
  const allProjects = getProjectsList();

  const results = [];
  const seenKeys = new Set();

  // 1. Invitaciones formales de proyectos
  allInvs.forEach(inv => {
    if (inv.status !== 'pending') return;
    if ((inv.email || '').toLowerCase().trim() !== emailLower) return;
    const key = (inv.projectId || '') + '|' + emailLower;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    results.push(inv);
  });

  // 2. Invitaciones al plan de suscripción almacenadas
  const planInvs = getStoredPlanInvitations();
  planInvs.forEach(pInv => {
    if (pInv.status !== 'pending') return;
    if ((pInv.email || '').toLowerCase().trim() !== emailLower) return;

    const hostEmail = (pInv.ownerEmail || '').toLowerCase().trim();
    const hostProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === hostEmail);

    if (hostProjects.length > 0) {
      hostProjects.forEach(hp => {
        const key = hp.id + '|' + emailLower;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          results.push({
            id: 'plan-inv-' + hp.id + '-' + pInv.id,
            projectId: hp.id,
            projectName: hp.projectName,
            companyName: hp.companyName || '',
            ownerEmail: hostEmail,
            ownerName: pInv.ownerName || hp.companyName || 'Anfitrión',
            ownerPlanId: pInv.ownerPlanId || 'free',
            email: emailLower,
            name: pInv.name,
            role: pInv.role || 'editar',
            status: 'pending',
            createdAt: pInv.invitedAt || new Date().toISOString()
          });
        }
      });
    } else {
      const key = 'plan|' + hostEmail;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push({
          id: pInv.id,
          projectId: 'plan-access',
          projectName: `Espacio de ${pInv.ownerName || hostEmail}`,
          companyName: pInv.ownerName || '',
          ownerEmail: hostEmail,
          ownerName: pInv.ownerName || 'Anfitrión',
          ownerPlanId: pInv.ownerPlanId || 'free',
          email: emailLower,
          name: pInv.name,
          role: pInv.role || 'editar',
          status: 'pending',
          createdAt: pInv.invitedAt || new Date().toISOString()
        });
      }
    }
  });

  return results;
}

// Crear o actualizar una invitación de proyecto
export function createProjectInvitation({ projectId, email, name, role = 'editar', allowedTabs = [], invitedBy = null }) {
  if (!projectId || !email) return null;
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return null;

  const ownerEmail = (proj.ownerEmail || (invitedBy && invitedBy.email) || '').toLowerCase().trim();
  const emailClean = email.trim().toLowerCase();
  const seatCheck = canAddUserToOwnerAccount(ownerEmail, emailClean, projectId);
  if (!seatCheck.allowed) {
    console.warn('[Suscripción] Invitación bloqueada por límite de usuarios:', seatCheck.reason);
    return null;
  }

  const invs = getStoredInvitations();

  // Eliminar invitaciones previas pendientes hacia este mismo email y proyecto
  const filteredInvs = invs.filter(i => !(i.projectId === projectId && (i.email || '').toLowerCase() === emailClean));

  const invId = 'inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  const newInvitation = {
    id: invId,
    projectId,
    projectName: proj.projectName || 'Proyecto de Obra',
    companyName: proj.companyName || '',
    ownerEmail: (proj.ownerEmail || (invitedBy && invitedBy.email) || '').toLowerCase().trim(),
    ownerName: proj.ownerName || (invitedBy && invitedBy.name) || proj.companyName || 'Anfitrión',
    ownerPlanId: proj.ownerPlanId || getProjectEffectivePlan(projectId) || 'free',
    email: emailClean,
    name: (name || emailClean.split('@')[0]).trim(),
    role: role || 'editar',
    allowedTabs: Array.isArray(allowedTabs) ? allowedTabs : ['cat', 'insumos', 'calendario', 'estimaciones'],
    invitedBy: invitedBy ? {
      name: invitedBy.name || 'Administrador',
      email: invitedBy.email || ''
    } : null,
    planId: getProjectEffectivePlan(projectId),
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  filteredInvs.unshift(newInvitation);
  saveStoredInvitations(filteredInvs);

  // Registrar también al miembro en el proyecto en estado 'pending'
  addProjectMember(projectId, {
    name: newInvitation.name,
    email: newInvitation.email,
    avatar: AVATARS_BY_SEX['Masculino'],
    role: newInvitation.role,
    allowedTabs: newInvitation.allowedTabs,
    status: 'pending'
  });

  // Emitir broadcast en tiempo real vía WebSockets a otros usuarios conectados
  try {
    if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastNewInvitation === 'function') {
      const updatedProj = getProjectById(projectId);
      window.CubikarRealtime.broadcastNewInvitation(newInvitation, updatedProj);
    }
  } catch (e) {
    console.warn('[Realtime] Error emitiendo invitación:', e);
  }

  return newInvitation;
}


// Aceptar invitación a un proyecto o al plan de un anfitrión
export function acceptProjectInvitation(invitationId, currentUser = null) {
  const user = currentUser || getCurrentUser();
  const userEmail = (user?.email || '').toLowerCase().trim();

  const invs = getStoredInvitations();
  const planInvs = getStoredPlanInvitations();
  const list = getProjectsList();

  let targetInv = null;
  let targetPlanInv = null;
  let targetProjectId = null;
  let targetProjectName = null;

  // 1. Buscar en invitaciones formales de proyectos por ID exacto
  targetInv = invs.find(i => i.id === invitationId);

  // 2. Buscar en invitaciones al plan por ID exacto o coincidencia de sufijo
  if (!targetInv) {
    targetPlanInv = planInvs.find(pi => 
      pi.id === invitationId ||
      invitationId === `plan-inv-${pi.id}` ||
      (typeof invitationId === 'string' && (invitationId.endsWith(`-${pi.id}`) || invitationId.includes(pi.id)))
    );
  }

  // 3. Si la ID tiene prefijo 'plan-inv-{projId}-{planInvId}'
  if (!targetInv && typeof invitationId === 'string' && invitationId.startsWith('plan-inv-')) {
    const raw = invitationId.replace('plan-inv-', '');
    const foundProj = list.find(p => raw.startsWith(p.id));
    if (foundProj) {
      targetProjectId = foundProj.id;
      targetProjectName = foundProj.projectName;
      const restId = raw.replace(foundProj.id + '-', '');
      if (!targetPlanInv) {
        targetPlanInv = planInvs.find(pi => pi.id === restId || (pi.email || '').toLowerCase().trim() === userEmail);
      }
    }
  }

  // 4. Si aún no se encontró por ID, buscar la invitación pendiente por correo del usuario conectado
  if (!targetInv && !targetPlanInv && userEmail) {
    targetInv = invs.find(i => (i.email || '').toLowerCase().trim() === userEmail && i.status === 'pending');
    if (!targetInv) {
      targetPlanInv = planInvs.find(pi => (pi.email || '').toLowerCase().trim() === userEmail && pi.status === 'pending');
    }
  }

  // 5. Si aún no se encontró, buscar en miembros de proyectos si el usuario está registrado con status 'pending'
  if (!targetInv && !targetPlanInv && userEmail) {
    const projWithMember = list.find(p => 
      Array.isArray(p.members) && 
      p.members.some(m => (m.email || '').toLowerCase().trim() === userEmail && (m.status === 'pending' || m.id === invitationId))
    );
    if (projWithMember) {
      const mem = projWithMember.members.find(m => (m.email || '').toLowerCase().trim() === userEmail);
      if (mem) {
        mem.status = 'active';
        if (user) {
          mem.name = user.name || mem.name;
          mem.avatar = user.avatar || mem.avatar;
        }
        saveProjectsList(list);

        try {
          if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationAccepted === 'function') {
            window.CubikarRealtime.broadcastInvitationAccepted({
              id: invitationId,
              projectId: projWithMember.id,
              projectName: projWithMember.projectName,
              ownerEmail: projWithMember.ownerEmail,
              email: userEmail,
              name: user?.name || mem.name,
              role: mem.role || 'editar'
            }, user);
          }
        } catch (e) {}

        triggerCloudCollabSync(user);
        return { ok: true, projectId: projWithMember.id, projectName: projWithMember.projectName };
      }
    }
  }

  if (!targetInv && !targetPlanInv) {
    return { ok: false, error: 'Invitación no encontrada' };
  }

  // Revalidar límite de usuarios de la cuenta anfitriona antes de aceptar
  const hostOwnerForQuota = targetInv?.ownerEmail || targetPlanInv?.ownerEmail || (targetProjectId ? getProjectById(targetProjectId)?.ownerEmail : '') || '';
  const targetProjIdForQuota = targetInv?.projectId || targetProjectId || null;
  if (hostOwnerForQuota && userEmail) {
    const quotaCheck = canAddUserToOwnerAccount(hostOwnerForQuota, userEmail, targetProjIdForQuota);
    if (!quotaCheck.allowed) {
      return {
        ok: false,
        limitReached: true,
        error: quotaCheck.reason || 'El anfitrión alcanzó el límite de usuarios permitidos en su plan.'
      };
    }
  }

  // Aceptar Invitación Formal de Proyecto
  if (targetInv) {
    targetInv.status = 'accepted';
    targetInv.acceptedAt = new Date().toISOString();
    saveStoredInvitations(invs);

    targetProjectId = targetInv.projectId;
    targetProjectName = targetInv.projectName;

    const proj = list.find(p => p.id === targetInv.projectId);
    if (proj) {
      targetProjectName = proj.projectName;
      if (!Array.isArray(proj.members)) proj.members = [];
      const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === (targetInv.email || userEmail).toLowerCase().trim());
      if (mem) {
        mem.status = 'active';
        if (user) {
          mem.name = user.name || mem.name;
          mem.avatar = user.avatar || mem.avatar;
        }
      } else {
        proj.members.push({
          id: 'mem-' + Date.now(),
          name: user?.name || targetInv.name,
          email: targetInv.email || userEmail,
          avatar: user?.avatar || AVATARS_BY_SEX['Masculino'],
          role: targetInv.role || 'editar',
          allowedTabs: targetInv.allowedTabs || ['cat', 'insumos', 'calendario', 'estimaciones'],
          status: 'active'
        });
      }
      saveProjectsList(list);
    }

    // Si también existía invitación de plan con este anfitrión, marcarla como aceptada
    if (targetInv.ownerEmail) {
      const hostEmail = (targetInv.ownerEmail || '').toLowerCase().trim();
      const pInv = planInvs.find(pi => (pi.ownerEmail || '').toLowerCase().trim() === hostEmail && (pi.email || '').toLowerCase().trim() === (targetInv.email || userEmail).toLowerCase().trim());
      if (pInv) {
        pInv.status = 'accepted';
        pInv.acceptedAt = new Date().toISOString();
        saveStoredPlanInvitations(planInvs);
      }
    }

    try {
      if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationAccepted === 'function') {
        window.CubikarRealtime.broadcastInvitationAccepted(targetInv, user);
      }
    } catch (e) {}

    triggerCloudCollabSync(user);
    return { ok: true, projectId: targetProjectId, projectName: targetProjectName || 'Proyecto de Obra' };
  }

  // Aceptar Invitación al Plan de Suscripción del Anfitrión
  if (targetPlanInv) {
    targetPlanInv.status = 'accepted';
    targetPlanInv.acceptedAt = new Date().toISOString();
    saveStoredPlanInvitations(planInvs);

    const hostEmail = (targetPlanInv.ownerEmail || '').toLowerCase().trim();
    const hostProjects = list.filter(p => (p.ownerEmail || '').toLowerCase().trim() === hostEmail);

    let assignedProj = null;
    if (targetProjectId) {
      assignedProj = hostProjects.find(p => p.id === targetProjectId);
    }
    if (!assignedProj && hostProjects.length > 0) {
      assignedProj = hostProjects[0];
    }

    // Agregar al usuario como miembro activo en todas las obras del anfitrión
    hostProjects.forEach(hp => {
      if (!Array.isArray(hp.members)) hp.members = [];
      const mem = hp.members.find(m => (m.email || '').toLowerCase().trim() === userEmail);
      if (mem) {
        mem.status = 'active';
        mem.role = targetPlanInv.role || 'editar';
        if (user) {
          mem.name = user.name || mem.name;
          mem.avatar = user.avatar || mem.avatar;
        }
      } else {
        hp.members.push({
          id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          name: user?.name || targetPlanInv.name || userEmail.split('@')[0],
          email: userEmail,
          avatar: user?.avatar || AVATARS_BY_SEX['Masculino'],
          role: targetPlanInv.role || 'editar',
          allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones'],
          status: 'active'
        });
      }
    });
    if (hostProjects.length > 0) {
      saveProjectsList(list);
    }

    // Marcar como aceptadas las invitaciones correspondientes en getStoredInvitations()
    invs.forEach(i => {
      if ((i.ownerEmail || '').toLowerCase().trim() === hostEmail && (i.email || '').toLowerCase().trim() === userEmail) {
        i.status = 'accepted';
        i.acceptedAt = new Date().toISOString();
      }
    });
    saveStoredInvitations(invs);

    const finalProjId = assignedProj ? assignedProj.id : 'plan-access';
    const finalProjName = assignedProj ? assignedProj.projectName : `Espacio de ${targetPlanInv.ownerName || hostEmail}`;

    try {
      if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationAccepted === 'function') {
        window.CubikarRealtime.broadcastInvitationAccepted({
          id: targetPlanInv.id,
          projectId: finalProjId,
          projectName: finalProjName,
          ownerEmail: hostEmail,
          email: userEmail,
          name: user?.name || targetPlanInv.name,
          role: targetPlanInv.role || 'editar'
        }, user);
      }
    } catch (e) {}

    triggerCloudCollabSync(user);
    return { ok: true, projectId: finalProjId, projectName: finalProjName };
  }

  return { ok: false, error: 'Invitación no encontrada' };
}

// Rechazar o quitar invitación
export function rejectProjectInvitation(invitationId) {
  const user = getCurrentUser();
  const userEmail = (user?.email || '').toLowerCase().trim();

  const invs = getStoredInvitations();
  const planInvs = getStoredPlanInvitations();
  const list = getProjectsList();

  let rejected = false;

  // 1. Buscar en invitaciones formales de proyectos
  const invIdx = invs.findIndex(i => 
    i.id === invitationId || 
    (userEmail && (i.email || '').toLowerCase().trim() === userEmail && i.id === invitationId)
  );
  if (invIdx >= 0) {
    const inv = invs[invIdx];
    invs.splice(invIdx, 1);
    saveStoredInvitations(invs);
    rejected = true;

    if (inv.projectId) {
      const proj = list.find(p => p.id === inv.projectId);
      if (proj && Array.isArray(proj.members)) {
        proj.members = proj.members.filter(m => (m.email || '').toLowerCase().trim() !== (inv.email || '').toLowerCase().trim());
        saveProjectsList(list);
      }
    }

    try {
      if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationRejected === 'function') {
        window.CubikarRealtime.broadcastInvitationRejected(inv, user);
      }
    } catch (e) {}
  }

  // 2. Buscar en invitaciones al plan
  const planIdx = planInvs.findIndex(pi => 
    pi.id === invitationId || 
    (typeof invitationId === 'string' && (invitationId.includes(pi.id) || invitationId.endsWith(`-${pi.id}`))) ||
    (userEmail && (pi.email || '').toLowerCase().trim() === userEmail && (pi.id === invitationId || pi.status === 'pending'))
  );
  if (planIdx >= 0) {
    const pInv = planInvs[planIdx];
    planInvs.splice(planIdx, 1);
    saveStoredPlanInvitations(planInvs);
    rejected = true;

    const hostEmail = (pInv.ownerEmail || '').toLowerCase().trim();
    list.forEach(p => {
      if ((p.ownerEmail || '').toLowerCase().trim() === hostEmail && Array.isArray(p.members)) {
        p.members = p.members.filter(m => (m.email || '').toLowerCase().trim() !== userEmail || m.status !== 'pending');
      }
    });
    saveProjectsList(list);

    try {
      if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastInvitationRejected === 'function') {
        window.CubikarRealtime.broadcastInvitationRejected({ id: pInv.id, ownerEmail: hostEmail, email: userEmail }, user);
      }
    } catch (e) {}
  }

  // 3. Si estaba en members de algún proyecto con status 'pending'
  if (!rejected && userEmail) {
    list.forEach(p => {
      if (Array.isArray(p.members)) {
        const memIdx = p.members.findIndex(m => (m.email || '').toLowerCase().trim() === userEmail && (m.status === 'pending' || m.id === invitationId));
        if (memIdx >= 0) {
          p.members.splice(memIdx, 1);
          saveProjectsList(list);
          rejected = true;
        }
      }
    });
  }

  if (rejected) {
    triggerCloudCollabSync(user);
  }
  return rejected;
}

// Sincronizar y actualizar el plan de suscripción en todos los proyectos propiedad del usuario
export function syncOwnerProjectsPlan(ownerEmail, newPlanId) {
  if (!ownerEmail || !newPlanId) return false;
  const targetEmail = ownerEmail.toLowerCase().trim();
  const list = getProjectsList();
  let modified = false;

  list.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === targetEmail) {
      if (proj.ownerPlanId !== newPlanId) {
        proj.ownerPlanId = newPlanId;
        modified = true;
      }
    }
  });

  if (modified) {
    saveProjectsList(list);
  }
  return modified;
}

// Determinar el plan de suscripción aplicable al proyecto (hereda la suscripción del dueño)
export function getProjectEffectivePlan(projectId) {
  const proj = typeof projectId === 'object' ? projectId : getProjectById(projectId);
  if (!proj) return 'free';

  if (proj.ownerEmail) {
    const livePlan = getUserPlanId(proj.ownerEmail);
    if (livePlan && livePlan !== 'free') return livePlan;
  }

  if (proj.ownerPlanId) return proj.ownerPlanId;

  return getUserPlanId(proj.ownerEmail) || 'free';
}

// ==========================================
// LÍMITES POR PLAN DE SUSCRIPCIÓN
// ==========================================
export const PLAN_LIMITS = {
  free: {
    name: 'Gratuita',
    maxProjects: 2,
    maxConcepts: 100,
    maxMembers: 3,
    storageMb: 200,
    catalogStorageMb: 6,
    projectStorageMb: 194,
    maxFileMb: 5,
    aiMonthlyConcepts: 10,
    maxSearchQueries: 0,
    canInvite: true
  },
  plus: {
    name: 'Plus',
    maxProjects: 15,
    maxConcepts: 1500,
    maxMembers: 10,
    storageMb: 2048,
    catalogStorageMb: 50,
    projectStorageMb: 1998,
    maxFileMb: 15,
    aiMonthlyConcepts: 1500,
    maxSearchQueries: 70,
    canInvite: true
  },
  pro: {
    name: 'Pro',
    maxProjects: 50,
    maxConcepts: 3500,
    maxMembers: 30,
    storageMb: 5120,
    catalogStorageMb: 200,
    projectStorageMb: 4920,
    maxFileMb: 25,
    aiMonthlyConcepts: 3500,
    maxSearchQueries: 200,
    canInvite: true
  }
};

export function getPlanLimits(planId) {
  return PLAN_LIMITS[planId] || PLAN_LIMITS.free;
}

// Obtener plan del usuario (acepta objeto de usuario o correo electrónico directamente)
export function getUserPlanId(userOrEmail = null) {
  let cleanEmail = '';
  let u = null;

  if (typeof userOrEmail === 'string') {
    cleanEmail = userOrEmail.toLowerCase().trim();
  } else {
    u = userOrEmail || getCurrentUser();
    cleanEmail = (u?.email || '').toLowerCase().trim();
  }

  // 1. Sincronizar directamente con getCurrentSubscription si está disponible para el usuario actual
  const activeUser = getCurrentUser();
  const activeEmail = (activeUser?.email || '').toLowerCase().trim();
  if ((!cleanEmail || cleanEmail === activeEmail) && typeof window !== 'undefined' && typeof window.getCurrentSubscription === 'function') {
    try {
      const winSub = window.getCurrentSubscription();
      if (winSub?.planId && winSub.planId !== 'free') {
        return winSub.planId;
      }
    } catch (_) {}
  }

  if (cleanEmail && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`adm_const_subscription_${cleanEmail}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.planId) {
          if (u && typeof u === 'object') {
            if (!u.subscription) u.subscription = {};
            u.subscription.planId = parsed.planId;
          }
          return parsed.planId;
        }
      }
    } catch (e) {}
  }

  if (u && typeof u === 'object' && u?.subscription?.planId) {
    return u.subscription.planId;
  }
  if (activeUser?.subscription?.planId) {
    return activeUser.subscription.planId;
  }

  // Clave global por compatibilidad heredada
  if ((!cleanEmail || cleanEmail === activeEmail) && typeof localStorage !== 'undefined') {
    try {
      const globalRaw = localStorage.getItem('adm_const_subscription');
      if (globalRaw) {
        const parsedG = JSON.parse(globalRaw);
        if (parsedG?.planId && parsedG.planId !== 'free') return parsedG.planId;
      }
    } catch (_) {}
  }

  if (cleanEmail) {
    if (cleanEmail === 'hepc.90@gmail.com' || cleanEmail === 'admin.general@constructora.com') {
      return 'pro';
    }
    try {
      const reg = findRegisteredUserAccount(cleanEmail);
      if (reg?.subscription?.planId) return reg.subscription.planId;
      const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === cleanEmail);
      if (preset?.subscription?.planId) return preset.subscription.planId;
    } catch (_) {}
  }

  return 'free';
}

// Validar si el usuario puede crear proyectos según su plan y límites (en modo propio o bajo anfitrión)
export function canUserCreateProject(user = null, targetScope = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return { allowed: false, reason: 'Debes iniciar sesión para crear proyectos.' };

  const uEmail = u.email.toLowerCase().trim();

  // Verificar si se está creando en el espacio de un anfitrión (Modo Anfitrión)
  const hostEmail = (targetScope && typeof targetScope === 'string' && targetScope.startsWith('owner:'))
    ? targetScope.replace('owner:', '').toLowerCase().trim()
    : null;

  if (hostEmail && hostEmail !== uEmail) {
    const allProjects = getProjectsList();
    const hostProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === hostEmail);

    let hostName = hostEmail;
    try {
      const registered = findRegisteredUserAccount(hostEmail);
      if (registered?.name) hostName = registered.name;
      const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === hostEmail);
      if (preset?.name && hostName === hostEmail) hostName = preset.name;
    } catch (_) {}

    const hostPlanId = getUserPlanId(hostEmail);
    let userHasEditorRole = false;

    // Buscar en proyectos del anfitrión donde este usuario es miembro activo
    for (const p of hostProjects) {
      if (p.companyName && hostName === hostEmail) hostName = p.companyName;
      if (p.ownerName && hostName === hostEmail) hostName = p.ownerName;
      if (Array.isArray(p.members)) {
        const mem = p.members.find(m => (m.email || '').toLowerCase().trim() === uEmail && m.status !== 'pending');
        if (mem && mem.role === 'editar') {
          userHasEditorRole = true;
        }
      }
    }

    // Revisar invitaciones al plan de suscripción que hayan sido aceptadas
    const planInvs = getStoredPlanInvitations();
    const myPlanInv = planInvs.find(inv => 
      (inv.ownerEmail || '').toLowerCase().trim() === hostEmail && 
      (inv.email || '').toLowerCase().trim() === uEmail &&
      inv.status === 'accepted'
    );
    if (myPlanInv) {
      if (myPlanInv.ownerName && hostName === hostEmail) hostName = myPlanInv.ownerName;
      if (myPlanInv.role === 'editar') userHasEditorRole = true;
    }

    // Revisar también invitaciones individuales a proyectos aceptadas
    const invitations = getStoredInvitations();
    const myInv = invitations.find(inv => 
      (inv.ownerEmail || '').toLowerCase().trim() === hostEmail && 
      (inv.email || '').toLowerCase().trim() === uEmail &&
      inv.status === 'accepted'
    );
    if (myInv) {
      if (myInv.ownerName && hostName === hostEmail) hostName = myInv.ownerName;
      if (myInv.role === 'editar') userHasEditorRole = true;
    }

    // Solo el rol explícito 'editar' otorgado por el anfitrión (o ser el propio dueño) permite crear obras en este espacio
    if (uEmail === hostEmail) {
      userHasEditorRole = true;
    }

    if (!userHasEditorRole) {
      return {
        allowed: false,
        reason: `Solo los colaboradores con rol de Editor pueden crear nuevos proyectos en la organización de ${hostName}. Tu rol actual no permite crear obras aquí.`,
        isHostContext: true,
        hostEmail,
        hostName,
        userRole: 'lector/escritor'
      };
    }

    const hostLimits = getPlanLimits(hostPlanId);
    const hostProjectsCount = hostProjects.length;

    if (hostProjectsCount >= hostLimits.maxProjects) {
      return {
        allowed: false,
        reason: `El anfitrión (${hostName}) ha alcanzado el límite de ${hostLimits.maxProjects} proyectos activos para su Plan ${hostLimits.name}.`,
        planId: hostPlanId,
        maxProjects: hostLimits.maxProjects,
        currentProjects: hostProjectsCount,
        isHostContext: true,
        hostEmail,
        hostName
      };
    }

    return {
      allowed: true,
      planId: hostPlanId,
      maxProjects: hostLimits.maxProjects,
      currentProjects: hostProjectsCount,
      isHostContext: true,
      hostEmail,
      hostName
    };
  }

  // Modo Proyectos Propios: validar estrictamente contra la suscripción activa del usuario

  // Obtener plan del usuario, priorizando la membresía activa en memoria/modal
  let planId = getUserPlanId(u);
  if (typeof window !== 'undefined' && typeof window.getCurrentSubscription === 'function') {
    try {
      const activeSub = window.getCurrentSubscription();
      if (activeSub?.planId && (!uEmail || uEmail === (getCurrentUser()?.email || '').toLowerCase().trim())) {
        planId = activeSub.planId;
      }
    } catch (_) {}
  }
  const limits = getPlanLimits(planId);

  // Contar los proyectos propios creados por este usuario
  const allProjects = getProjectsList();
  const ownedProjects = allProjects.filter(p => (p.ownerEmail || '').toLowerCase().trim() === uEmail);
  const currentCount = ownedProjects.length;

  if (currentCount >= limits.maxProjects) {
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${limits.maxProjects} proyectos activos para tu suscripción ${limits.name}. Actualiza tu plan para crear más obras.`,
      planId,
      maxProjects: limits.maxProjects,
      currentProjects: currentCount,
      isHostContext: false
    };
  }

  return {
    allowed: true,
    planId,
    maxProjects: limits.maxProjects,
    currentProjects: currentCount,
    isHostContext: false
  };
}

// Obtener lista de anfitriones/organizaciones que han invitado al usuario
export function getWorkspaceInviters(user = null, allProjectsList = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return [];
  const uEmail = u.email.toLowerCase().trim();
  const userProjects = allProjectsList || getProjectsForUser(u);

  const map = new Map();

  // 1. Revisar obras donde el usuario es miembro activo aceptado
  userProjects.forEach(p => {
    const oEmail = (p.ownerEmail || '').toLowerCase().trim();
    if (oEmail && oEmail !== uEmail) {
      if (Array.isArray(p.members)) {
        const mem = p.members.find(m => (m.email || '').toLowerCase().trim() === uEmail && m.status !== 'pending');
        if (mem) {
          if (!map.has(oEmail)) {
            let hostName = p.ownerName;
            try {
              const reg = findRegisteredUserAccount(oEmail);
              if (reg?.name) hostName = reg.name;
              const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === oEmail);
              if (preset?.name && (!hostName || hostName === oEmail)) hostName = preset.name;
            } catch (_) {}

            if (!hostName) {
              hostName = p.companyName || oEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }

            const planId = getUserPlanId(oEmail) || p.ownerPlanId || 'free';
            const planLimits = getPlanLimits(planId);

            map.set(oEmail, {
              email: oEmail,
              name: hostName,
              companyName: p.companyName || '',
              planId: planId,
              planName: planLimits.name,
              maxProjects: planLimits.maxProjects,
              maxMembers: planLimits.maxMembers,
              count: 0,
              isEditor: false,
              roles: new Set()
            });
          }

          const entry = map.get(oEmail);
          entry.count++;

          if (mem.role) {
            entry.roles.add(mem.role);
            if (mem.role === 'editar') {
              entry.isEditor = true;
            }
          }
        }
      }
    }
  });

  // 2. Revisar también si hay invitaciones aceptadas al plan de suscripción
  const planInvs = getStoredPlanInvitations();
  planInvs.forEach(pInv => {
    const oEmail = (pInv.ownerEmail || '').toLowerCase().trim();
    const guestEmail = (pInv.email || '').toLowerCase().trim();
    if (guestEmail === uEmail && oEmail && oEmail !== uEmail && pInv.status === 'accepted') {
      let hostName = pInv.ownerName;
      try {
        const reg = findRegisteredUserAccount(oEmail);
        if (reg?.name) hostName = reg.name;
        const preset = GOOGLE_PRESET_ACCOUNTS.find(a => (a.email || '').toLowerCase().trim() === oEmail);
        if (preset?.name && (!hostName || hostName === oEmail)) hostName = preset.name;
      } catch (_) {}

      if (!hostName) hostName = oEmail;

      const planId = getUserPlanId(oEmail) || pInv.ownerPlanId || 'free';
      const planLimits = getPlanLimits(planId);

      if (!map.has(oEmail)) {
        map.set(oEmail, {
          email: oEmail,
          name: hostName,
          companyName: hostName,
          planId: planId,
          planName: planLimits.name,
          maxProjects: planLimits.maxProjects,
          maxMembers: planLimits.maxMembers,
          count: 0,
          isEditor: pInv.role === 'editar',
          roles: new Set([pInv.role || 'editar'])
        });
      } else {
        const entry = map.get(oEmail);
        if (pInv.role === 'editar') entry.isEditor = true;
        entry.roles.add(pInv.role || 'editar');
      }
    }
  });

  return Array.from(map.values()).map(inv => {
    let myRoleDisplay = 'Leer';
    if (inv.isEditor) {
      myRoleDisplay = 'Editor';
    } else if (inv.roles.has('escribir')) {
      myRoleDisplay = 'Escribir';
    }
    return {
      ...inv,
      myRoleDisplay
    };
  });
}

// Validar si el usuario puede invitar a colaboradores a un proyecto específico
export function canUserInviteToProject(projectId, user = null, targetEmail = '') {
  const u = user || getCurrentUser();
  if (!u || !u.email) return { allowed: false, reason: 'Debes iniciar sesión.' };

  const proj = getProjectById(projectId);
  if (!proj) return { allowed: false, reason: 'Proyecto no encontrado.' };

  const uEmail = u.email.toLowerCase().trim();
  const isOwner = (proj.ownerEmail || '').toLowerCase().trim() === uEmail;

  // Si no es el dueño, verificar si es miembro con rol 'editar' (Editor)
  let isEditor = false;
  if (Array.isArray(proj.members)) {
    const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === uEmail && m.status !== 'pending');
    if (mem && mem.role === 'editar') {
      isEditor = true;
    }
  }

  if (!isOwner && !isEditor) {
    return {
      allowed: false,
      reason: 'Solo el creador del proyecto o colaboradores con rol de Editor pueden invitar nuevos usuarios.'
    };
  }

  const effectivePlanId = getProjectEffectivePlan(projectId);
  const limits = getPlanLimits(effectivePlanId);
  const members = Array.isArray(proj.members) ? proj.members : [];
  const currentMembersCount = members.length;
  const ownerEmail = (proj.ownerEmail || uEmail).toLowerCase().trim();
  const normalizedTarget = (targetEmail || '').toLowerCase().trim();

  if (normalizedTarget) {
    return canAddUserToOwnerAccount(ownerEmail, normalizedTarget, projectId);
  }

  if (currentMembersCount >= limits.maxMembers) {
    return {
      allowed: false,
      limitReached: true,
      reason: `Este proyecto ha alcanzado el límite de ${limits.maxMembers} colaboradores permitidos en el Plan ${limits.name}. Para invitar a más colaboradores, actualiza la suscripción de la obra.`,
      planId: effectivePlanId,
      maxMembers: limits.maxMembers,
      currentMembers: currentMembersCount
    };
  }

  const accountStats = countAccountUsersForOwner(ownerEmail);
  const projEmails = new Set(members.map(m => (m?.email || '').toLowerCase().trim()).filter(Boolean));
  const hasUnassignedAccountCollab = [...accountStats.collaboratorsSet].some(em => !projEmails.has(em));

  if (accountStats.totalUsers >= limits.maxMembers && !hasUnassignedAccountCollab) {
    return {
      allowed: false,
      limitReached: true,
      reason: `Has alcanzado el límite de ${limits.maxMembers} usuarios permitidos en tu cuenta (${limits.name}). Actualiza tu suscripción para invitar a más colaboradores.`,
      planId: effectivePlanId,
      maxMembers: limits.maxMembers,
      currentMembers: accountStats.totalUsers
    };
  }

  return {
    allowed: true,
    planId: effectivePlanId,
    maxMembers: limits.maxMembers,
    currentMembers: currentMembersCount,
    accountUsers: accountStats.totalUsers
  };
}

// Determinar el rol del usuario en un proyecto
export function getUserRoleInProject(projectId, user = null) {
  const u = user || getCurrentUser();
  if (!u || !u.email) return null;

  const proj = getProjectById(projectId);
  if (!proj) return null;

  const uEmail = u.email.toLowerCase().trim();
  if (proj.ownerEmail && proj.ownerEmail.toLowerCase().trim() === uEmail) {
    return 'owner'; // Dueño / Creador
  }

  if (Array.isArray(proj.members)) {
    const mem = proj.members.find(m => (m.email || '').toLowerCase().trim() === uEmail && m.status !== 'pending');
    return mem ? mem.role : null;
  }

  return null;
}

// ==========================================
// GESTIÓN DE INVITACIONES AL PLAN DE SUSCRIPCIÓN
// ==========================================
export function getStoredPlanInvitations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PLAN_INVITATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveStoredPlanInvitations(invitations) {
  try {
    localStorage.setItem(STORAGE_KEY_PLAN_INVITATIONS, JSON.stringify(invitations || []));
  } catch (e) {}
  triggerCloudCollabSync();
}

export function getPlanCollaboratorsForOwner(ownerEmail) {
  if (!ownerEmail) return [];
  const oEmail = ownerEmail.toLowerCase().trim();
  const allPlanInvs = getStoredPlanInvitations();
  const map = new Map();

  allPlanInvs.forEach(inv => {
    if ((inv.ownerEmail || '').toLowerCase().trim() === oEmail) {
      const email = (inv.email || '').toLowerCase().trim();
      if (email && !map.has(email)) {
        map.set(email, {
          id: inv.id,
          name: inv.name || email.split('@')[0],
          email: email,
          role: inv.role || 'editar',
          status: inv.status || 'pending',
          avatar: inv.avatar || AVATARS_BY_SEX['Masculino'],
          invitedAt: inv.invitedAt || new Date().toISOString(),
          isPlanDirect: true
        });
      }
    }
  });

  const allProjects = getProjectsList();
  allProjects.forEach(p => {
    if ((p.ownerEmail || '').toLowerCase().trim() === oEmail && Array.isArray(p.members)) {
      p.members.forEach(m => {
        const mEmail = (m.email || '').toLowerCase().trim();
        if (mEmail && mEmail !== oEmail) {
          if (!map.has(mEmail)) {
            map.set(mEmail, {
              id: m.id || ('mem-' + mEmail),
              name: m.name || mEmail.split('@')[0],
              email: mEmail,
              role: m.role || 'editar',
              status: m.status || 'active',
              avatar: m.avatar || AVATARS_BY_SEX['Masculino'],
              invitedAt: m.invitedAt || new Date().toISOString(),
              isPlanDirect: false
            });
          }
        }
      });
    }
  });

  return Array.from(map.values());
}

export function canUserInviteToPlan(user = null, targetEmail = '') {
  const u = user || getCurrentUser();
  if (!u || !u.email) return { allowed: false, reason: 'Debes iniciar sesión para invitar usuarios a tu plan.' };

  const planId = getUserPlanId(u);
  const limits = getPlanLimits(planId);
  const normalizedTarget = (targetEmail || '').toLowerCase().trim();

  if (normalizedTarget) {
    const check = canAddUserToOwnerAccount(u.email, normalizedTarget, null);
    return {
      ...check,
      planName: limits.name,
      currentMembers: check.currentUsers,
      maxMembers: limits.maxMembers
    };
  }

  const accountStats = countAccountUsersForOwner(u.email);
  const currentCount = accountStats.totalUsers;

  if (currentCount >= limits.maxMembers) {
    return {
      allowed: false,
      limitReached: true,
      reason: `Has alcanzado el límite de ${limits.maxMembers} usuarios permitidos en tu cuenta (${limits.name}: 1 titular + ${Math.max(0, limits.maxMembers - 1)} colaboradores). Actualiza tu plan para invitar más miembros.`,
      planId,
      planName: limits.name,
      maxMembers: limits.maxMembers,
      currentMembers: currentCount,
      collaboratorsCount: accountStats.collaboratorsCount,
      remaining: 0
    };
  }

  return {
    allowed: true,
    planId,
    planName: limits.name,
    maxMembers: limits.maxMembers,
    currentMembers: currentCount,
    collaboratorsCount: accountStats.collaboratorsCount,
    remaining: Math.max(0, limits.maxMembers - currentCount)
  };
}

export function createPlanInvitation({ email, name, role = 'editar', avatar = null, user = null }) {
  if (!email) return { ok: false, error: 'Debes indicar un correo electrónico válido.' };

  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) {
    return { ok: false, error: 'Usuario no autenticado.' };
  }

  const check = canUserInviteToPlan(currentUser, email);
  if (!check.allowed) {
    return { ok: false, error: check.reason, limitReached: true };
  }

  const cleanEmail = email.trim().toLowerCase();
  const ownerEmail = currentUser.email.toLowerCase().trim();

  if (cleanEmail === ownerEmail) {
    return { ok: false, error: 'No puedes invitarte a ti mismo a tu propio plan.' };
  }

  const planId = getUserPlanId(currentUser);
  const planLimits = getPlanLimits(planId);
  const invs = getStoredPlanInvitations();

  const filtered = invs.filter(i => !(
    (i.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
    (i.email || '').toLowerCase().trim() === cleanEmail
  ));

  const invId = 'plan-inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  const newInv = {
    id: invId,
    ownerEmail: ownerEmail,
    ownerName: currentUser.name || 'Anfitrión',
    ownerPlanId: planId,
    ownerPlanName: planLimits.name,
    email: cleanEmail,
    name: name || cleanEmail.split('@')[0],
    role: role || 'editar',
    avatar: avatar || AVATARS_BY_SEX['Masculino'],
    status: 'pending',
    invitedAt: new Date().toISOString()
  };

  filtered.push(newInv);
  saveStoredPlanInvitations(filtered);

  // Vincular también a los proyectos propios para que aparezca en el equipo con acceso
  const allProjects = getProjectsList();
  let modifiedProjects = false;
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail) {
      if (!Array.isArray(proj.members)) proj.members = [];
      const existing = proj.members.find(m => (m.email || '').toLowerCase().trim() === cleanEmail);
      if (!existing) {
        proj.members.push({
          id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          name: newInv.name,
          email: cleanEmail,
          avatar: newInv.avatar,
          role: newInv.role,
          allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones'],
          status: 'pending'
        });
        modifiedProjects = true;
      }
    }
  });

  if (modifiedProjects) {
    saveProjectsList(allProjects);
  }

  // Generar invitaciones en getStoredInvitations() para cada proyecto propio del anfitrión y emitir broadcast
  const allStoredInvs = getStoredInvitations();
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail) {
      const exists = allStoredInvs.some(i => i.projectId === proj.id && (i.email || '').toLowerCase().trim() === cleanEmail);
      if (!exists) {
        const pInvEntry = {
          id: 'inv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          projectId: proj.id,
          projectName: proj.projectName || 'Proyecto de Obra',
          companyName: proj.companyName || '',
          ownerEmail: ownerEmail,
          ownerName: currentUser.name || 'Anfitrión',
          ownerPlanId: planId,
          email: cleanEmail,
          name: newInv.name,
          role: newInv.role,
          allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones'],
          status: 'pending',
          createdAt: new Date().toISOString()
        };
        allStoredInvs.unshift(pInvEntry);

        try {
          if (typeof window !== 'undefined' && window.CubikarRealtime && typeof window.CubikarRealtime.broadcastNewInvitation === 'function') {
            window.CubikarRealtime.broadcastNewInvitation(pInvEntry, proj);
          }
        } catch (e) {}
      }
    }
  });
  saveStoredInvitations(allStoredInvs);

  return { ok: true, invitation: newInv };
}

export function removePlanCollaborator(collaboratorEmail, user = null) {
  if (!collaboratorEmail) return false;
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;

  const ownerEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = collaboratorEmail.toLowerCase().trim();

  const invs = getStoredPlanInvitations().filter(i => !(
    (i.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
    (i.email || '').toLowerCase().trim() === targetEmail
  ));
  saveStoredPlanInvitations(invs);

  // Remover también de los proyectos del anfitrión
  const allProjects = getProjectsList();
  let modified = false;
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail && Array.isArray(proj.members)) {
      const prevLen = proj.members.length;
      proj.members = proj.members.filter(m => (m.email || '').toLowerCase().trim() !== targetEmail);
      if (proj.members.length !== prevLen) modified = true;
    }
  });

  if (modified) saveProjectsList(allProjects);
  return true;
}

export function updatePlanCollaboratorRole(collaboratorEmail, newRole, user = null) {
  if (!collaboratorEmail || !newRole) return false;
  const currentUser = user || getCurrentUser();
  if (!currentUser || !currentUser.email) return false;

  const ownerEmail = currentUser.email.toLowerCase().trim();
  const targetEmail = collaboratorEmail.toLowerCase().trim();

  // 1. Actualizar en invitaciones persistentes al plan de suscripción
  const planInvs = getStoredPlanInvitations();
  let planInvsModified = false;
  planInvs.forEach(inv => {
    if ((inv.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
        (inv.email || '').toLowerCase().trim() === targetEmail) {
      inv.role = newRole;
      planInvsModified = true;
    }
  });
  if (planInvsModified) {
    saveStoredPlanInvitations(planInvs);
  }

  // 2. Actualizar en invitaciones pendientes a proyectos de este anfitrión
  const projInvs = getStoredInvitations();
  let projInvsModified = false;
  projInvs.forEach(inv => {
    if ((inv.ownerEmail || '').toLowerCase().trim() === ownerEmail &&
        (inv.email || '').toLowerCase().trim() === targetEmail) {
      inv.role = newRole;
      projInvsModified = true;
    }
  });
  if (projInvsModified) {
    saveStoredInvitations(projInvs);
  }

  // 3. Actualizar en los miembros de todos los proyectos propiedad del dueño
  const allProjects = getProjectsList();
  let projectsModified = false;
  allProjects.forEach(proj => {
    if ((proj.ownerEmail || '').toLowerCase().trim() === ownerEmail && Array.isArray(proj.members)) {
      proj.members.forEach(m => {
        if ((m.email || '').toLowerCase().trim() === targetEmail) {
          m.role = newRole;
          projectsModified = true;
        }
      });
    }
  });
  if (projectsModified) {
    saveProjectsList(allProjects);
  }

  return true;
}

// ==========================================
// UTILIDADES DE CÁLCULO PARA EL RESUMEN
// ==========================================
function calculateTreeTotal(nodes) {
  if (!Array.isArray(nodes)) return 0;
  return nodes.reduce((sum, n) => sum + calculateNodeTotal(n), 0);
}

function calculateNodeTotal(node) {
  if (!node.children || node.children.length === 0) {
    const cant = Number(node.cantidad) || 0;
    const pu = Number(node.precioUnitario) || 0;
    return cant * pu;
  }
  return node.children.reduce((acc, c) => acc + calculateNodeTotal(c), 0);
}

export function countTreeConcepts(nodes) {
  if (!Array.isArray(nodes)) return 0;
  let count = 0;
  function traverse(list) {
    list.forEach(n => {
      if (!n.children || n.children.length === 0) count++;
      else traverse(n.children);
    });
  }
  traverse(nodes);
  return count;
}

function countTreePartidas(nodes) {
  if (!Array.isArray(nodes)) return 0;
  let count = 0;
  function traverse(list) {
    list.forEach(n => {
      if (n.children && n.children.length > 0) {
        count++;
        traverse(n.children);
      }
    });
  }
  traverse(nodes);
  return count;
}


// ==========================================
// GESTIÓN DE ESPACIO DE TRABAJO ACTIVO
// ==========================================
export function setActiveWorkspaceData(ownerEmail, ownerName = '') {
  try {
    if (typeof localStorage !== 'undefined') {
      const payload = {
        ownerEmail: (ownerEmail || '').toLowerCase().trim(),
        ownerName: ownerName || ownerEmail || '',
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY_ACTIVE_WORKSPACE, JSON.stringify(payload));
    }
  } catch (e) {
    console.error('Error guardando active workspace:', e);
  }
}

export function getActiveWorkspaceData() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_WORKSPACE);
      if (raw) {
        try {
          return JSON.parse(raw);
        } catch (_) {
          if (typeof raw === 'string' && raw.startsWith('owner:')) {
            return { ownerEmail: raw.replace('owner:', '').trim(), ownerName: '' };
          }
        }
      }
    }
  } catch (e) {}
  const u = getCurrentUser();
  return {
    ownerEmail: (u?.email || '').toLowerCase().trim(),
    ownerName: u?.name || u?.email || ''
  };
}

// ==========================================
// RESOLUCIÓN UNIFICADA DE PLAN, USUARIOS Y CONCEPTOS POR SUSCRIPCIÓN
// ==========================================
const DEFAULT_SAMPLE_DEMO_EMAILS = new Set([
  'mariana.torres.costos@gmail.com',
  'roberto.mendez.obras@gmail.com'
]);

export function resolveWorkspacePlanContext(projectIdOverride = null) {
  const currentUser = getCurrentUser();
  const currentEmail = (currentUser?.email || '').toLowerCase().trim();
  const projectId = projectIdOverride || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null);
  const proj = projectId ? getProjectById(projectId) : null;
  const activeWs = getActiveWorkspaceData();

  let ownerEmail = currentEmail;
  if (proj && proj.ownerEmail) {
    ownerEmail = proj.ownerEmail.toLowerCase().trim();
  } else if (activeWs && activeWs.ownerEmail) {
    ownerEmail = activeWs.ownerEmail.toLowerCase().trim();
  }

  let planId = 'free';
  if (proj) {
    planId = getProjectEffectivePlan(proj.id) || 'free';
  } else if (ownerEmail) {
    planId = getUserPlanId(ownerEmail) || 'free';
    if (ownerEmail === currentEmail && typeof window !== 'undefined' && typeof window.getCurrentSubscription === 'function') {
      try {
        const activeSub = window.getCurrentSubscription();
        if (activeSub?.planId) planId = activeSub.planId;
      } catch (_) {}
    }
  }

  return {
    projectId: proj?.id || projectId || null,
    project: proj || null,
    ownerEmail,
    planId,
    limits: getPlanLimits(planId),
    currentUserEmail: currentEmail
  };
}

/**
 * Calcula todos los usuarios reales únicos asociados a la cuenta de un propietario:
 * 1 propietario + colaboradores reales únicos (invitaciones de plan, invitaciones a obra aceptadas/pendientes y miembros no-muestra).
 */
export function countAccountUsersForOwner(ownerEmail) {
  const oEmail = (ownerEmail || getCurrentUser()?.email || '').toLowerCase().trim();
  const usersSet = new Set();
  const collaboratorsSet = new Set();
  if (oEmail) usersSet.add(oEmail);

  // Colaboradores de plan globales
  try {
    const planCollabs = typeof getPlanCollaboratorsForOwner === 'function' ? getPlanCollaboratorsForOwner(oEmail) : [];
    (Array.isArray(planCollabs) ? planCollabs : []).forEach(c => {
      const em = (c?.email || '').toLowerCase().trim();
      if (em && em !== oEmail) {
        usersSet.add(em);
        collaboratorsSet.add(em);
      }
    });
  } catch (_) {}

  // Invitaciones a plan pendientes o aceptadas
  try {
    const planInvs = typeof getStoredPlanInvitations === 'function' ? getStoredPlanInvitations() : [];
    (Array.isArray(planInvs) ? planInvs : []).forEach(inv => {
      if ((inv?.ownerEmail || '').toLowerCase().trim() !== oEmail) return;
      if (inv?.status === 'rejected') return;
      const em = (inv?.email || '').toLowerCase().trim();
      if (em && em !== oEmail) {
        usersSet.add(em);
        collaboratorsSet.add(em);
      }
    });
  } catch (_) {}

  // Invitaciones por proyecto aceptadas o pendientes
  const explicitlyInvitedEmails = new Set(collaboratorsSet);
  try {
    const projInvs = typeof getStoredInvitations === 'function' ? getStoredInvitations() : [];
    (Array.isArray(projInvs) ? projInvs : []).forEach(inv => {
      if ((inv?.ownerEmail || '').toLowerCase().trim() !== oEmail) return;
      if (inv?.status === 'rejected') return;
      const em = (inv?.email || '').toLowerCase().trim();
      if (em && em !== oEmail) {
        usersSet.add(em);
        collaboratorsSet.add(em);
        explicitlyInvitedEmails.add(em);
      }
    });
  } catch (_) {}

  // Miembros activos en proyectos propios (excluyendo presets de muestra no invitados explícitamente)
  try {
    const allProjects = getProjectsList();
    allProjects
      .filter(p => (p?.ownerEmail || '').toLowerCase().trim() === oEmail)
      .forEach(p => {
        (Array.isArray(p.members) ? p.members : []).forEach(m => {
          const em = (m?.email || '').toLowerCase().trim();
          if (!em || em === oEmail || m?.status === 'pending') return;
          if (DEFAULT_SAMPLE_DEMO_EMAILS.has(em) && !explicitlyInvitedEmails.has(em)) return;
          usersSet.add(em);
          collaboratorsSet.add(em);
        });
      });
  } catch (_) {}

  return {
    ownerEmail: oEmail,
    totalUsers: Math.max(1, usersSet.size),
    collaboratorsCount: collaboratorsSet.size,
    usersSet,
    collaboratorsSet
  };
}

/**
 * Valida si se puede agregar o invitar un usuario (targetEmail) bajo el plan del propietario de la cuenta.
 */
export function canAddUserToOwnerAccount(ownerEmail, targetEmail = '', targetProjectId = null) {
  const oEmail = (ownerEmail || '').toLowerCase().trim();
  const tEmail = (targetEmail || '').toLowerCase().trim();
  const planId = getUserPlanId(oEmail) || 'free';
  const limits = getPlanLimits(planId);
  const accountStats = countAccountUsersForOwner(oEmail);

  // Si ya pertenece al conjunto de usuarios reales de la cuenta, no consume un asiento nuevo de cuenta
  if (tEmail && accountStats.usersSet.has(tEmail)) {
    if (accountStats.totalUsers > limits.maxMembers) {
      return {
        allowed: false,
        limitReached: true,
        planId,
        maxMembers: limits.maxMembers,
        currentUsers: accountStats.totalUsers,
        reason: `La cuenta ya excede el límite de ${limits.maxMembers} usuarios del Plan ${limits.name}. Actualiza tu plan o remueve colaboradores.`
      };
    }
    return {
      allowed: true,
      alreadyAccountMember: true,
      planId,
      maxMembers: limits.maxMembers,
      currentUsers: accountStats.totalUsers,
      remaining: Math.max(0, limits.maxMembers - accountStats.totalUsers)
    };
  }

  // Verificar límite global por cuenta (1 a 3 / 10 / 30 usuarios totales incluyendo propietario)
  if (accountStats.totalUsers >= limits.maxMembers) {
    return {
      allowed: false,
      limitReached: true,
      planId,
      maxMembers: limits.maxMembers,
      currentUsers: accountStats.totalUsers,
      reason: `Has alcanzado el límite de ${limits.maxMembers} usuarios en tu cuenta (Plan ${limits.name}). Actualiza a un plan superior para agregar más colaboradores.`
    };
  }

  // Si se proporcionó un proyecto específico, validar que el proyecto tampoco rebase los miembros visibles de su plan
  if (targetProjectId) {
    const proj = getProjectById(targetProjectId);
    if (proj && Array.isArray(proj.members)) {
      const existingInProj = proj.members.some(m => (m?.email || '').toLowerCase().trim() === tEmail);
      if (!existingInProj && proj.members.length >= limits.maxMembers) {
        return {
          allowed: false,
          limitReached: true,
          planId,
          maxMembers: limits.maxMembers,
          currentUsers: proj.members.length,
          reason: `Este proyecto ya tiene ${proj.members.length} de ${limits.maxMembers} miembros permitidos en Plan ${limits.name}. Remueve un colaborador existente o actualiza tu plan.`
        };
      }
    }
  }

  return {
    allowed: true,
    planId,
    maxMembers: limits.maxMembers,
    currentUsers: accountStats.totalUsers,
    remaining: Math.max(0, limits.maxMembers - accountStats.totalUsers)
  };
}

/**
 * Valida límite de conceptos por proyecto (100 Gratuita, 1500 Plus, 3500 Pro) según el plan efectivo del dueño del proyecto.
 */
export function validateConceptAdditionLimit(projectId = null, additionalConcepts = 1, options = {}) {
  const ctx = resolveWorkspacePlanContext(projectId);
  const maxConcepts = ctx.limits?.maxConcepts || 100;
  const replaceExisting = Boolean(options?.replaceExisting);

  let currentConcepts = 0;
  if (Array.isArray(options?.liveTreeData)) {
    currentConcepts = countTreeConcepts(options.liveTreeData);
  } else if (typeof localStorage !== 'undefined') {
    try {
      const storageKey = ctx.projectId ? getStorageKey(ctx.projectId) : getStorageKey();
      const rawTree = localStorage.getItem(storageKey);
      if (rawTree) currentConcepts = countTreeConcepts(JSON.parse(rawTree));
    } catch (_) {}
  }

  const addNum = Math.max(0, Number(additionalConcepts) || 0);
  const projectedTotal = replaceExisting ? addNum : currentConcepts + addNum;

  if (projectedTotal > maxConcepts) {
    return {
      allowed: false,
      limitReached: true,
      planId: ctx.planId,
      planName: ctx.limits?.name || ctx.planId,
      currentConcepts,
      projectedTotal,
      maxConcepts,
      reason: `Has alcanzado el límite de ${maxConcepts.toLocaleString('es-MX')} conceptos por proyecto para el Plan ${ctx.limits?.name || ctx.planId} (actuales: ${currentConcepts.toLocaleString('es-MX')}, proyectados: ${projectedTotal.toLocaleString('es-MX')}). Actualiza tu suscripción para continuar agregando conceptos.`
    };
  }

  return {
    allowed: true,
    planId: ctx.planId,
    planName: ctx.limits?.name || ctx.planId,
    currentConcepts,
    projectedTotal,
    maxConcepts,
    remaining: Math.max(0, maxConcepts - currentConcepts)
  };
}
