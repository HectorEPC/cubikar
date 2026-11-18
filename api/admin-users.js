// api/admin-users.js
// Vercel Serverless Function: Central segura de administración y sincronización de usuarios de Cubikar.
// Solo el Administrador Maestro o Co-Administradores verificados con JWT pueden listar/eliminar usuarios.

const DEFAULT_SUPABASE_URL = 'https://hxyzvxueoqvvjyehfpym.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXp2eHVlb3F2dmp5ZWhmcHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMTYwODAsImV4cCI6MjEwOTY5MjA4MH0.q3P-_HZ11PP5dgCkAX7o5TZGqVAoqVv438W6coZiYeA';
const MASTER_ADMIN_EMAIL = 'hepc.90@gmail.com';

if (!globalThis._cubikarCloudUsersCache) {
  globalThis._cubikarCloudUsersCache = new Map();
}
const globalUsersCache = globalThis._cubikarCloudUsersCache;

function isAllowedOrigin(rawOrigin) {
  if (!rawOrigin) return true;
  try {
    const parsed = new URL(rawOrigin);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'cubikar.app' ||
      host.endsWith('.cubikar.app') ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.hepc-90.workers.dev') ||
      host === 'cubikar-jj8j.vercel.app' ||
      host.endsWith('.vercel.app') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://cubikar.app');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseJwtKeyRole(key) {
  const clean = String(key || '').trim();
  if (!clean) return '';
  if (clean.startsWith('sb_secret_')) return 'secret';
  if (clean.startsWith('eyJ')) {
    try {
      const parts = clean.split('.');
      if (parts.length >= 2) {
        const payload = decodeBase64UrlJson(parts[1]);
        return String(payload?.role || '').toLowerCase().trim();
      }
    } catch {}
  }
  return '';
}

function buildSupabaseAdminHeaders(adminKey, extra = {}) {
  const clean = String(adminKey || '').trim();
  if (!clean) return { ...extra };
  if (clean.startsWith('sb_secret_')) {
    return { apikey: clean, ...extra };
  }
  return {
    apikey: clean,
    Authorization: `Bearer ${clean}`,
    ...extra
  };
}

function buildSupabaseReadHeaders(serviceRoleKey, sbAnonKey, callerToken, extra = {}) {
  if (serviceRoleKey) {
    return buildSupabaseAdminHeaders(serviceRoleKey, extra);
  }
  return {
    apikey: sbAnonKey,
    Authorization: `Bearer ${callerToken}`,
    ...extra
  };
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const rawAdminKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  const adminRole = parseJwtKeyRole(rawAdminKey);
  const serviceRoleKey = (adminRole === 'secret' || adminRole === 'service_role') ? rawAdminKey : '';
  return { url, anonKey, serviceRoleKey, misconfiguredAnonKey: adminRole === 'anon' };
}

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

// Todas las escrituras guardan el correo en minúsculas (GoTrue también lo normaliza),
// así que eq es exacto y evita los comodines de ilike ('_', '%', '*').
function emailEqFilter(email) {
  return `email=eq.${encodeURIComponent(normalizeEmail(email))}`;
}

function sanitizePostgrestSearchTerm(raw) {
  return String(raw || '')
    .trim()
    .replace(/[%*,()"\\]/g, '');
}

function getEnvCoAdmins() {
  return String(process.env.CUBIKAR_CO_ADMINS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);
}

function isCoAdminMetadata(meta) {
  return Boolean(meta && (meta.is_co_admin === true || meta.isCoAdmin === true));
}

async function listAllAuthUsers(sbUrl, serviceRoleKey) {
  const perPage = 1000;
  const maxPages = 200;
  const allUsers = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${sbUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: buildSupabaseAdminHeaders(serviceRoleKey)
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`No se pudo consultar auth.users (${res.status}): ${errTxt}`);
    }
    const data = await res.json();
    const users = Array.isArray(data) ? data : (data?.users || []);
    allUsers.push(...users);
    const total = Number(res.headers.get('x-total-count')) || 0;
    if (users.length === 0 || (total ? allUsers.length >= total : users.length < perPage)) break;
  }
  return allUsers;
}

async function updateEmpresaWithBillingCycleFallback(sbUrl, serviceRoleKey, empresaId, payload) {
  if (!sbUrl || !serviceRoleKey || !empresaId) {
    return { ok: false, updated: 0, error: 'Configuración incompleta para actualizar la empresa.' };
  }
  const headers = buildSupabaseAdminHeaders(serviceRoleKey, {
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  });
  const endpoint = `${sbUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(empresaId)}&select=id`;
  const patch = (body) => fetch(endpoint, { method: 'PATCH', headers, body: JSON.stringify(body) });
  let res = await patch(payload);
  if (!res.ok && Object.prototype.hasOwnProperty.call(payload, 'billing_cycle')) {
    const { billing_cycle: _omit, ...fallbackPayload } = payload;
    res = await patch(fallbackPayload);
  }
  if (!res.ok) {
    return { ok: false, updated: 0, error: await res.text().catch(() => `HTTP ${res.status}`) };
  }
  const rows = await res.json().catch(() => []);
  return { ok: true, updated: Array.isArray(rows) ? rows.length : 0, error: '' };
}

async function verifyCallerJwt(req, sbUrl, sbAnonKey, serviceRoleKey) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return null;

  const verifyKey = sbAnonKey || serviceRoleKey;
  if (!verifyKey || !sbUrl) return null;

  try {
    const res = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: {
        apikey: verifyKey,
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.id || !user.email) return null;
    return {
      id: user.id,
      email: String(user.email).toLowerCase().trim(),
      user_metadata: user.user_metadata || {},
      token
    };
  } catch {
    return null;
  }
}

async function isVerifiedAdmin(callerEmail, sbUrl, serviceRoleKey, callerToken, sbAnonKey) {
  const email = normalizeEmail(callerEmail);
  if (!email) return false;
  if (email === MASTER_ADMIN_EMAIL) return true;
  if (getEnvCoAdmins().includes(email)) return true;
  if (!serviceRoleKey && (!sbAnonKey || !callerToken)) return false;

  // metadata.is_co_admin solo puede cambiarlo service_role o el Administrador Maestro (trigger en BD).
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/cubikar_registros?${emailEqFilter(email)}&select=metadata&limit=1`,
      { headers: buildSupabaseReadHeaders(serviceRoleKey, sbAnonKey, callerToken) }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return isCoAdminMetadata(rows?.[0]?.metadata);
  } catch {
    return false;
  }
}

function decodeBase64UrlToUint8(b64u) {
  const b64 = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeBase64UrlJson(b64u) {
  const txt = new TextDecoder().decode(decodeBase64UrlToUint8(b64u));
  return JSON.parse(txt);
}

async function verifySupabaseJwtCryptographic(token, sbUrl) {
  try {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 3) return null;
    const header = decodeBase64UrlJson(parts[0]);
    const payload = decodeBase64UrlJson(parts[1]);
    const uid = String(payload?.sub || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return null;
    if (payload?.aud && payload.aud !== 'authenticated') return null;
    if (sbUrl && payload?.iss && !String(payload.iss).startsWith(sbUrl)) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload?.exp || Number(payload.exp) < nowSec - 300) return null;

    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const sigBytes = decodeBase64UrlToUint8(parts[2]);

    if (header?.alg === 'ES256') {
      const jwksRes = await fetch(`${sbUrl}/auth/v1/.well-known/jwks.json`);
      if (!jwksRes.ok) return null;
      const jwks = await jwksRes.json();
      const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
      const jwk = (header.kid ? keys.find(k => k.kid === header.kid) : null) ||
                  keys.find(k => k.kty === 'EC' && (!k.alg || k.alg === 'ES256'));
      if (!jwk) return null;
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const valid = await globalThis.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        cryptoKey,
        sigBytes,
        signingInput
      );
      return valid ? {
        userId: uid,
        email: String(payload.email || '').toLowerCase().trim(),
        userMetadata: (payload?.user_metadata && typeof payload.user_metadata === 'object') ? payload.user_metadata : {}
      } : null;
    }

    const jwtSecret = (process.env.SUPABASE_JWT_SECRET || '').trim();
    if (header?.alg === 'HS256' && jwtSecret) {
      const hmacKey = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(jwtSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const valid = await globalThis.crypto.subtle.verify('HMAC', hmacKey, sigBytes, signingInput);
      return valid ? {
        userId: uid,
        email: String(payload.email || '').toLowerCase().trim(),
        userMetadata: (payload?.user_metadata && typeof payload.user_metadata === 'object') ? payload.user_metadata : {}
      } : null;
    }

    return null;
  } catch {
    return null;
  }
}

function buildCompactUserMetadata(existingMeta = {}) {
  const src = (existingMeta && typeof existingMeta === 'object') ? existingMeta : {};
  const cleaned = {};
  const scalarKeys = [
    'sub', 'email', 'email_verified', 'phone_verified', 'full_name', 'name',
    'given_name', 'family_name', 'empresa_nombre', 'role', 'provider', 'providers',
    'sexo', 'dob', 'subscription'
  ];
  for (const k of scalarKeys) {
    if (src[k] !== undefined) {
      if (typeof src[k] === 'string' && src[k].length > 512) {
        cleaned[k] = src[k].slice(0, 512);
      } else {
        cleaned[k] = src[k];
      }
    }
  }
  for (const imgKey of ['avatar_url', 'picture']) {
    const val = src[imgKey];
    if (typeof val === 'string' && val.trim() && !val.trim().startsWith('data:') && val.length <= 512) {
      cleaned[imgKey] = val.trim();
    } else if (Object.prototype.hasOwnProperty.call(src, imgKey)) {
      cleaned[imgKey] = null;
    }
  }
  const v2 = src.cubikar_cloud_state_v2;
  if (v2 && typeof v2 === 'object') {
    let compactV2 = {
      version: 2,
      subscription: v2.subscription || cleaned.subscription || { planId: 'free', billingCycle: 'monthly' },
      ownedProjects: [],
      collaboratedProjects: [],
      planInvitations: Array.isArray(v2.planInvitations) ? v2.planInvitations.slice(0, 15) : [],
      acceptedInvitations: Array.isArray(v2.acceptedInvitations) ? v2.acceptedInvitations.slice(0, 15) : [],
      sentPlanInvitations: Array.isArray(v2.sentPlanInvitations) ? v2.sentPlanInvitations.slice(0, 15) : [],
      sentProjectInvitations: Array.isArray(v2.sentProjectInvitations) ? v2.sentProjectInvitations.slice(0, 15) : [],
      deletedProjectIds: Array.isArray(v2.deletedProjectIds) ? v2.deletedProjectIds.slice(-15) : [],
      updatedAt: v2.updatedAt || new Date().toISOString()
    };
    if (JSON.stringify(compactV2).length > 1800) {
      compactV2 = {
        version: 2,
        subscription: compactV2.subscription,
        ownedProjects: [],
        collaboratedProjects: [],
        planInvitations: compactV2.planInvitations.slice(0, 5),
        acceptedInvitations: compactV2.acceptedInvitations.slice(0, 5),
        sentPlanInvitations: [],
        sentProjectInvitations: [],
        deletedProjectIds: compactV2.deletedProjectIds.slice(-10),
        updatedAt: compactV2.updatedAt
      };
    }
    cleaned.cubikar_cloud_state_v2 = compactV2;
  }
  if (Array.isArray(src.cubikar_dismissed_notifications) && src.cubikar_dismissed_notifications.length > 0) {
    cleaned.cubikar_dismissed_notifications = src.cubikar_dismissed_notifications
      .slice(-15)
      .map(v => String(v || '').slice(0, 64))
      .filter(Boolean);
  } else if (Object.prototype.hasOwnProperty.call(src, 'cubikar_dismissed_notifications')) {
    cleaned.cubikar_dismissed_notifications = null;
  }
  if (Array.isArray(src.cubikar_read_mentions) && src.cubikar_read_mentions.length > 0) {
    cleaned.cubikar_read_mentions = src.cubikar_read_mentions
      .slice(-15)
      .map(v => String(v || '').slice(0, 64))
      .filter(Boolean);
  } else if (Object.prototype.hasOwnProperty.call(src, 'cubikar_read_mentions')) {
    cleaned.cubikar_read_mentions = null;
  }
  // GoTrue PUT /admin/users hace merge de claves de primer nivel:
  // cualquier clave legado/desconocida (incluida cubikar_collaboration_v1) debe ir explícitamente en null para borrarse.
  for (const existingKey of Object.keys(src)) {
    if (!Object.prototype.hasOwnProperty.call(cleaned, existingKey)) {
      cleaned[existingKey] = null;
    }
  }
  return cleaned;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Acceso no autorizado desde este origen.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url: sbUrl, anonKey: sbAnonKey, serviceRoleKey, misconfiguredAnonKey } = getSupabaseConfig();

  // Auto-reparación segura para sesiones bloqueadas por JWT / user_metadata sobredimensionado:
  // Recibe accessToken en el BODY POST (sin cabecera Authorization gigante en HTTP/2)
  // y lo valida criptográficamente con JWKS (ES256) antes de compactar user_metadata vía Admin API
  // o respaldo directo self-service vía PUT /auth/v1/user (sin depender de service_role en Cloudflare).
  if (req.method === 'POST') {
    let preBody = req.body;
    if (typeof preBody === 'string') {
      try { preBody = JSON.parse(preBody); } catch { preBody = null; }
    }
    if (preBody && String(preBody.action || '').toLowerCase() === 'slim_own_jwt_metadata') {
      const rawToken = String(preBody.accessToken || '').trim();
      const verified = await verifySupabaseJwtCryptographic(rawToken, sbUrl);
      if (!verified?.userId) {
        return res.status(401).json({ error: 'Token de sesión inválido o expirado para compactación.' });
      }
      try {
        // Nivel 1: Si hay una service_role / sb_secret válida, compactar vía Admin API
        if (serviceRoleKey) {
          try {
            const userAdminEndpoint = `${sbUrl}/auth/v1/admin/users/${encodeURIComponent(verified.userId)}`;
            const adminReadHeaders = buildSupabaseAdminHeaders(serviceRoleKey);
            const getUserRes = await fetch(userAdminEndpoint, { headers: adminReadHeaders });
            if (getUserRes.ok) {
              const adminUser = await getUserRes.json();
              const prevMeta = adminUser?.user_metadata || verified.userMetadata || {};
              const beforeChars = JSON.stringify(prevMeta).length;
              const cleanedMeta = buildCompactUserMetadata(prevMeta);

              const putHeaders = buildSupabaseAdminHeaders(serviceRoleKey, { 'Content-Type': 'application/json' });
              let putRes = await fetch(userAdminEndpoint, {
                method: 'PUT',
                headers: putHeaders,
                body: JSON.stringify({ user_metadata: cleanedMeta })
              });
              if (putRes.ok) {
                let updatedAdminUser = await putRes.json().catch(() => null);
                let actualAfterChars = updatedAdminUser?.user_metadata
                  ? JSON.stringify(updatedAdminUser.user_metadata).length
                  : JSON.stringify(cleanedMeta).length;

                if (actualAfterChars > 3500) {
                  const pureCleaned = Object.fromEntries(Object.entries(cleanedMeta).filter(([, v]) => v !== null));
                  await fetch(userAdminEndpoint, {
                    method: 'PUT',
                    headers: putHeaders,
                    body: JSON.stringify({ user_metadata: {} })
                  });
                  putRes = await fetch(userAdminEndpoint, {
                    method: 'PUT',
                    headers: putHeaders,
                    body: JSON.stringify({ user_metadata: pureCleaned })
                  });
                  if (putRes.ok) {
                    updatedAdminUser = await putRes.json().catch(() => null);
                    if (updatedAdminUser?.user_metadata) {
                      actualAfterChars = JSON.stringify(updatedAdminUser.user_metadata).length;
                    }
                  }
                }
                return res.status(200).json({
                  ok: true,
                  repaired: true,
                  method: 'admin',
                  beforeChars,
                  afterChars: actualAfterChars
                });
              }
            }
          } catch {}
        }

        // Nivel 2 (Respaldo automático sin depender de SUPABASE_SERVICE_ROLE_KEY):
        // Compactar los propios metadatos del usuario vía server-to-server PUT /auth/v1/user
        let prevMeta = (verified.userMetadata && typeof verified.userMetadata === 'object')
          ? verified.userMetadata
          : {};
        if (Object.keys(prevMeta).length === 0 && rawToken.length <= 14000) {
          try {
            const selfGetRes = await fetch(`${sbUrl}/auth/v1/user`, {
              headers: { apikey: sbAnonKey, Authorization: `Bearer ${rawToken}` }
            });
            if (selfGetRes.ok) {
              const selfUser = await selfGetRes.json().catch(() => null);
              if (selfUser?.user_metadata) prevMeta = selfUser.user_metadata;
            }
          } catch {}
        }

        const beforeChars = JSON.stringify(prevMeta).length;
        const cleanedMeta = buildCompactUserMetadata(prevMeta);
        try {
          const selfPutRes = await fetch(`${sbUrl}/auth/v1/user`, {
            method: 'PUT',
            headers: {
              apikey: sbAnonKey,
              Authorization: `Bearer ${rawToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: cleanedMeta })
          });
          if (!selfPutRes.ok) {
            const errTxt = await selfPutRes.text().catch(() => '');
            const statusOut = selfPutRes.status === 431 ? 422 : selfPutRes.status;
            return res.status(statusOut).json({
              error: `No se pudo auto-compactar sesión (${selfPutRes.status}): ${errTxt}`,
              needsServiceRoleKey: selfPutRes.status === 431 || !serviceRoleKey,
              misconfiguredAnonKey: Boolean(misconfiguredAnonKey)
            });
          }
          const updatedSelf = await selfPutRes.json().catch(() => null);
          const actualAfterChars = updatedSelf?.user_metadata
            ? JSON.stringify(updatedSelf.user_metadata).length
            : JSON.stringify(cleanedMeta).length;
          return res.status(200).json({
            ok: true,
            repaired: true,
            method: 'self',
            beforeChars,
            afterChars: actualAfterChars
          });
        } catch (selfErr) {
          return res.status(422).json({
            error: `El token actual excede el límite HTTP para self-repair (${rawToken.length} bytes): ${selfErr?.message || selfErr}`,
            needsServiceRoleKey: true,
            misconfiguredAnonKey: Boolean(misconfiguredAnonKey)
          });
        }
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Error interno compactando sesión JWT.' });
      }
    }
  }

  const caller = await verifyCallerJwt(req, sbUrl, sbAnonKey, serviceRoleKey);
  if (!caller) {
    return res.status(401).json({ error: 'No autorizado. Se requiere sesión activa verificada.' });
  }

  const callerIsAdmin = await isVerifiedAdmin(caller.email, sbUrl, serviceRoleKey, caller.token, sbAnonKey);

  // =========================================================================
  // MÉTODO GET: Retornar todos los usuarios registrados (SOLO ADMIN VERIFICADO)
  // =========================================================================
  if (req.method === 'GET') {
    const reqUrl = new URL(req.url || '/api/admin-users', 'http://localhost');
    const checkSelf = reqUrl.searchParams.get('check_self') === '1';

    if (!callerIsAdmin) {
      if (checkSelf) {
        return res.status(200).json({ ok: true, isAdmin: false, email: caller.email, coAdmins: [] });
      }
      return res.status(403).json({ error: 'Acceso denegado. Solo administradores autorizados.' });
    }

    const coAdminsMap = new Map();
    getEnvCoAdmins()
      .filter(em => em !== MASTER_ADMIN_EMAIL)
      .forEach(em => {
        coAdminsMap.set(em, {
          email: em,
          name: em.split('@')[0],
          role: 'admin',
          canEdit: true,
          canWrite: true,
          canRead: true,
          invitedBy: MASTER_ADMIN_EMAIL,
          invitedAt: '2026-01-15T00:00:00.000Z',
          source: 'env'
        });
      });

    if (checkSelf) {
      try {
        const regRes = await fetch(`${sbUrl}/rest/v1/cubikar_registros?select=email,nombre,registered_at,metadata`, {
          headers: buildSupabaseReadHeaders(serviceRoleKey, sbAnonKey, caller.token)
        });
        if (regRes.ok) {
          const rows = await regRes.json();
          if (Array.isArray(rows)) {
            rows.forEach(r => {
              const em = String(r?.email || '').toLowerCase().trim();
              const meta = (r?.metadata && typeof r.metadata === 'object') ? r.metadata : {};
              if (em && em !== MASTER_ADMIN_EMAIL.toLowerCase() && isCoAdminMetadata(meta)) {
                coAdminsMap.set(em, {
                  email: em,
                  name: r.nombre || em.split('@')[0],
                  role: 'admin',
                  canEdit: true,
                  canWrite: true,
                  canRead: true,
                  invitedBy: meta.updated_by || MASTER_ADMIN_EMAIL,
                  invitedAt: meta.updated_at || r.registered_at || new Date().toISOString(),
                  source: 'supabase'
                });
              }
            });
          }
        }
      } catch {}

      return res.status(200).json({
        ok: true,
        isAdmin: true,
        email: caller.email,
        coAdmins: Array.from(coAdminsMap.values())
      });
    }

    const usersMap = new Map();

    // 1. Incorporar siempre al Administrador Maestro por defecto
    usersMap.set(MASTER_ADMIN_EMAIL.toLowerCase(), {
      id: 'master-admin-hepc',
      name: 'Héctor Emmanuel Pérez Cornejo',
      email: MASTER_ADMIN_EMAIL,
      sexo: 'Masculino',
      avatar: 'assets/branding/cubikar_icon_transparent.png',
      createdAt: '2026-01-15T00:00:00.000Z',
      lastLogin: new Date().toISOString(),
      subscription: { planId: 'pro', billingCycle: 'annual', isCombo: true },
      subscriptionConst: { planId: 'pro', billingCycle: 'annual' },
      subscriptionArq: { planId: 'pro', billingCycle: 'annual' },
      appUsage: 'ambas',
      isMasterAdmin: true,
      isCoAdmin: false,
      source: 'master'
    });

    // 2. Consultar auth.users y public.perfiles join empresas si existe SERVICE_ROLE_KEY
    let pulledFromAuth = 0;
    if (serviceRoleKey) {
      try {
        const authUsers = await listAllAuthUsers(sbUrl, serviceRoleKey);
        authUsers.forEach(u => {
          if (!u || !u.email) return;
          const cleanEmail = u.email.toLowerCase().trim();
          const meta = u.user_metadata || {};
          // Nunca derivar plan desde user_metadata editable por el cliente; perfiles->empresas es la fuente autoritativa.
          const planSub = { planId: 'free', billingCycle: 'monthly' };
          const existing = usersMap.get(cleanEmail) || {};
          const isMaster = cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase();

          usersMap.set(cleanEmail, {
            id: u.id,
            name: meta.full_name || meta.name || existing.name || cleanEmail.split('@')[0],
            email: cleanEmail,
            sexo: meta.sexo || existing.sexo || 'Masculino',
            dob: meta.dob || existing.dob || '',
            avatar: meta.avatar_url || meta.avatar || existing.avatar || '',
            createdAt: u.created_at || existing.createdAt || new Date().toISOString(),
            lastLogin: u.last_sign_in_at || u.created_at || existing.lastLogin || new Date().toISOString(),
            subscription: isMaster ? { planId: 'pro', billingCycle: 'annual', isCombo: true } : planSub,
            emailConfirmed: Boolean(u.email_confirmed_at),
            isMasterAdmin: isMaster,
            isCoAdmin: coAdminsMap.has(cleanEmail),
            source: 'supabase_auth'
          });
          pulledFromAuth++;
        });
      } catch (e) {
        console.warn('[AdminUsers API] Error consultando auth.admin.users:', e.message);
      }

      try {
        const searchParam = sanitizePostgrestSearchTerm(reqUrl.searchParams.get('search') || '');
        const orFilter = searchParam
          ? `&or=(email.ilike.*${encodeURIComponent(searchParam)}*,nombre_completo.ilike.*${encodeURIComponent(searchParam)}*)`
          : '';
        const perfRes = await fetch(`${sbUrl}/rest/v1/perfiles?select=*,empresas(*)${orFilter}`, {
          headers: buildSupabaseAdminHeaders(serviceRoleKey)
        });
        if (perfRes.ok) {
          const perfiles = await perfRes.json();
          if (Array.isArray(perfiles)) {
            perfiles.forEach(p => {
              if (!p || !p.email) return;
              const cleanEmail = p.email.toLowerCase().trim();
              const existing = usersMap.get(cleanEmail) || {};
              const isMaster = cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase();
              const emp = p.empresas || {};
              const hasExplicitProd = emp.plan_const != null || emp.plan_arq != null || emp.acceso_const != null || emp.acceso_arq != null;
              const plan = isMaster ? 'pro' : (emp.plan || existing.subscription?.planId || 'free');
              const legacyFallback = !hasExplicitProd ? plan : 'free';
              const planConst = isMaster
                ? 'pro'
                : ((emp.acceso_const === false && !emp.plan_const)
                    ? 'free'
                    : (emp.plan_const || legacyFallback || existing.subscriptionConst?.planId || 'free'));
              const planArq = isMaster
                ? 'pro'
                : ((emp.acceso_arq === false && !emp.plan_arq)
                    ? 'free'
                    : (emp.plan_arq || legacyFallback || existing.subscriptionArq?.planId || 'free'));
              const isCombo = isMaster || (planConst === 'pro' && planArq === 'pro') || (Boolean(emp.acceso_const) && Boolean(emp.acceso_arq) && planConst === planArq && planConst !== 'free');
              const appUsage = isMaster ? 'ambas' : (isCombo ? 'ambas' : (planConst !== 'free' && planArq !== 'free' ? 'ambas' : (planConst !== 'free' ? 'const' : (planArq !== 'free' ? 'arq' : 'ambas'))));
              const billingCycle = isMaster ? 'annual' : (emp.billing_cycle || existing.subscription?.billingCycle || 'monthly');

              usersMap.set(cleanEmail, {
                ...existing,
                id: p.id || existing.id,
                empresaId: p.empresa_id || emp.id || existing.empresaId || null,
                name: p.nombre_completo || existing.name || cleanEmail.split('@')[0],
                email: cleanEmail,
                sexo: p.sexo || existing.sexo || 'Masculino',
                avatar: p.avatar_url || existing.avatar || '',
                createdAt: p.created_at || existing.createdAt || new Date().toISOString(),
                lastLogin: existing.lastLogin || p.updated_at || new Date().toISOString(),
                subscription: { planId: plan, billingCycle, isCombo },
                subscriptionConst: { planId: planConst, billingCycle },
                subscriptionArq: { planId: planArq, billingCycle },
                appUsage,
                isMasterAdmin: isMaster,
                isCoAdmin: Boolean(existing.isCoAdmin || coAdminsMap.has(cleanEmail)),
                source: 'supabase_perfiles'
              });
            });
          }
        }
      } catch {}
    }

    // 3. Complementar desde cubikar_registros SIN sobrescribir datos autoritativos de Auth/Empresas
    try {
      const regRes = await fetch(`${sbUrl}/rest/v1/cubikar_registros?select=*`, {
        headers: buildSupabaseReadHeaders(serviceRoleKey, sbAnonKey, caller.token)
      });
      if (regRes.ok) {
        const rows = await regRes.json();
        if (Array.isArray(rows)) {
          rows.forEach(r => {
            if (!r || !r.email) return;
            const cleanEmail = r.email.toLowerCase().trim();
            const existing = usersMap.get(cleanEmail);
            const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata : {};
            const isCoAdminRow = cleanEmail !== MASTER_ADMIN_EMAIL.toLowerCase() && (isCoAdminMetadata(meta) || coAdminsMap.has(cleanEmail));

            if (isCoAdminRow) {
              coAdminsMap.set(cleanEmail, {
                email: cleanEmail,
                name: r.nombre || existing?.name || cleanEmail.split('@')[0],
                role: 'admin',
                canEdit: true,
                canWrite: true,
                canRead: true,
                invitedBy: meta.updated_by || MASTER_ADMIN_EMAIL,
                invitedAt: meta.updated_at || r.registered_at || new Date().toISOString(),
                source: 'supabase'
              });
            }

            if (existing) {
              // Preservar subscription/subscriptionConst/subscriptionArq/appUsage/emailConfirmed/id reales
              usersMap.set(cleanEmail, {
                ...existing,
                dob: existing.dob || r.dob || '',
                lastLogin: existing.lastLogin || r.last_activity || existing.createdAt,
                name: existing.name || r.nombre || cleanEmail.split('@')[0],
                avatar: existing.avatar || r.avatar || '',
                isCoAdmin: Boolean(existing.isCoAdmin || isCoAdminRow)
              });
            } else {
              const fallbackPlan = r.plan || 'free';
              usersMap.set(cleanEmail, {
                id: r.id,
                name: r.nombre || cleanEmail.split('@')[0],
                email: cleanEmail,
                sexo: r.sexo || 'Masculino',
                dob: r.dob || '',
                avatar: r.avatar || '',
                createdAt: r.registered_at || new Date().toISOString(),
                lastLogin: r.last_activity || r.registered_at || new Date().toISOString(),
                subscription: {
                  planId: fallbackPlan,
                  billingCycle: r.billing_cycle || 'monthly'
                },
                subscriptionConst: { planId: fallbackPlan, billingCycle: r.billing_cycle || 'monthly' },
                subscriptionArq: { planId: fallbackPlan, billingCycle: r.billing_cycle || 'monthly' },
                appUsage: 'ambas',
                isMasterAdmin: cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase(),
                isCoAdmin: isCoAdminRow,
                source: 'supabase_cubikar_registros'
              });
            }
          });
        }
      }
    } catch {}

    // 4. Incorporar usuarios de la caché en memoria recibidos por POST en esta instancia
    for (const [email, user] of globalUsersCache.entries()) {
      if (!usersMap.has(email)) {
        usersMap.set(email, {
          ...user,
          isMasterAdmin: email === MASTER_ADMIN_EMAIL.toLowerCase(),
          isCoAdmin: coAdminsMap.has(email)
        });
      }
    }

    const allUsersList = Array.from(usersMap.values());

    return res.status(200).json({
      ok: true,
      total: allUsersList.length,
      users: allUsersList,
      coAdmins: Array.from(coAdminsMap.values()),
      hasServiceRole: Boolean(serviceRoleKey),
      pulledFromAuth,
      timestamp: new Date().toISOString()
    });
  }

  // =========================================================================
  // MÉTODO POST: Sincronizar usuario propio o Eliminar usuarios (Admin)
  // =========================================================================
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Cuerpo JSON inválido' });
      }
    }
    body = body || {};

    const action = String(body.action || 'register').toLowerCase();

    if (action === 'register' || action === 'sync_user') {
      const u = body.user || {};
      const rawEmail = String(u.email || '').trim().toLowerCase();
      if (!rawEmail) {
        return res.status(400).json({ error: 'El campo "email" es obligatorio.' });
      }

      if (rawEmail !== caller.email && !callerIsAdmin) {
        return res.status(403).json({ error: 'No autorizado para sincronizar otro usuario.' });
      }

      // Resolver plan autoritativo desde BD si hay serviceRoleKey (evita auto-asignación de plan por payload)
      let authoritativePlan = 'free';
      let targetEmpresaId = null;
      if (serviceRoleKey) {
        try {
          const perfRes = await fetch(
            `${sbUrl}/rest/v1/perfiles?${emailEqFilter(rawEmail)}&select=empresa_id,empresas(id,plan)&limit=1`,
            {
              headers: buildSupabaseAdminHeaders(serviceRoleKey)
            }
          );
          if (perfRes.ok) {
            const rows = await perfRes.json();
            targetEmpresaId = rows?.[0]?.empresa_id || rows?.[0]?.empresas?.id || null;
            if (rows?.[0]?.empresas?.plan) {
              authoritativePlan = String(rows[0].empresas.plan).toLowerCase().trim();
            }
          }
        } catch {}
      }

      const safePlan = callerIsAdmin && u.subscription?.planId ? u.subscription.planId : authoritativePlan;
      const billingCycle = u.subscription?.billingCycle === 'annual' ? 'annual' : 'monthly';

      if (callerIsAdmin && serviceRoleKey && targetEmpresaId && u.subscription?.planId) {
        try {
          await updateEmpresaWithBillingCycleFallback(sbUrl, serviceRoleKey, targetEmpresaId, {
            plan: safePlan,
            billing_cycle: billingCycle,
            estado_suscripcion: safePlan === 'free' ? 'trialing' : 'active'
          });
        } catch {}
      }

      const userEntry = {
        id: caller.email === rawEmail ? caller.id : (u.id || `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
        email: rawEmail,
        name: u.name || rawEmail.split('@')[0],
        sexo: u.sexo || 'Masculino',
        dob: u.dob || '',
        avatar: u.avatar || '',
        createdAt: u.registeredAt || u.createdAt || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        subscription: {
          planId: safePlan || 'free',
          billingCycle
        },
        source: 'sync_post'
      };

      globalUsersCache.set(rawEmail, userEntry);

      try {
        await fetch(`${sbUrl}/rest/v1/cubikar_registros?on_conflict=email`, {
          method: 'POST',
          headers: buildSupabaseReadHeaders(serviceRoleKey, sbAnonKey, caller.token, {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          }),
          body: JSON.stringify({
            email: rawEmail,
            nombre: userEntry.name,
            sexo: userEntry.sexo,
            dob: userEntry.dob,
            avatar: userEntry.avatar,
            plan: userEntry.subscription.planId,
            billing_cycle: userEntry.subscription.billingCycle,
            registered_at: userEntry.createdAt,
            last_activity: userEntry.lastLogin
          })
        });
      } catch {}

      return res.status(200).json({
        ok: true,
        message: 'Usuario sincronizado con éxito en la nube.',
        user: userEntry
      });
    }

    if (action === 'update_plan' || action === 'set_plan') {
      if (!callerIsAdmin) {
        return res.status(403).json({ error: 'Acceso denegado. Solo administradores autorizados.' });
      }
      if (!serviceRoleKey) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.' });
      }
      const targetEmail = normalizeEmail(body.email);
      if (!targetEmail || !targetEmail.includes('@') || targetEmail === MASTER_ADMIN_EMAIL) {
        return res.status(400).json({ error: 'Correo inválido o protegido.' });
      }
      const plan = ['free', 'plus', 'pro'].includes(String(body.plan || '').toLowerCase().trim())
        ? String(body.plan).toLowerCase().trim()
        : 'free';
      const billingCycle = String(body.billingCycle || body.ciclo || 'monthly').toLowerCase().trim() === 'annual'
        ? 'annual'
        : 'monthly';
      const prodRaw = String(body.producto || 'combo').toLowerCase().trim();
      const producto = (prodRaw === 'arq' || prodRaw === 'arquitectura')
        ? 'arq'
        : ((prodRaw === 'const' || prodRaw === 'construccion') ? 'const' : 'combo');

      try {
        const perfRes = await fetch(
          `${sbUrl}/rest/v1/perfiles?${emailEqFilter(targetEmail)}&select=id,empresa_id&limit=1`,
          { headers: buildSupabaseAdminHeaders(serviceRoleKey) }
        );
        if (!perfRes.ok) {
          const errTxt = await perfRes.text().catch(() => '');
          return res.status(500).json({ error: `No se pudo consultar el perfil (${perfRes.status}): ${errTxt}` });
        }
        const rows = await perfRes.json();
        const empresaId = rows?.[0]?.empresa_id;
        if (!empresaId) {
          return res.status(404).json({ error: `No se encontró una empresa asociada a ${targetEmail}; no se actualizó ninguna membresía.` });
        }
        const updatePayload = {
          plan,
          billing_cycle: billingCycle,
          estado_suscripcion: plan === 'free' ? 'trialing' : 'active'
        };
        if (producto === 'arq' || producto === 'combo') {
          updatePayload.plan_arq = plan;
          updatePayload.acceso_arq = plan !== 'free';
        }
        if (producto === 'const' || producto === 'combo') {
          updatePayload.plan_const = plan;
          updatePayload.acceso_const = plan !== 'free';
        }
        const empResult = await updateEmpresaWithBillingCycleFallback(sbUrl, serviceRoleKey, empresaId, updatePayload);
        if (!empResult.ok) {
          return res.status(500).json({ error: `No se pudo actualizar empresa: ${empResult.error}` });
        }
        if (empResult.updated === 0) {
          return res.status(404).json({ error: `La empresa ${empresaId} no existe; no se actualizó ninguna membresía.` });
        }
        return res.status(200).json({ ok: true, email: targetEmail, plan, billingCycle, producto });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Error actualizando membresía.' });
      }
    }

    if (action === 'delete') {
      if (!callerIsAdmin) {
        return res.status(403).json({ error: 'Acceso denegado. Solo administradores verificados pueden eliminar usuarios.' });
      }

      if (!serviceRoleKey) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.' });
      }

      const rawEmails = Array.isArray(body.emails) ? body.emails : [body.email];
      const targets = rawEmails
        .map(e => String(e || '').trim().toLowerCase())
        .filter(e => e && e !== MASTER_ADMIN_EMAIL.toLowerCase());

      if (targets.length === 0 && !body.userId) {
        return res.status(400).json({
          error: 'No se especificaron usuarios válidos para eliminar o se intentó eliminar al Administrador Maestro protegido.'
        });
      }

      let deletedFromAuth = 0;
      let deletedFromTables = 0;

      targets.forEach(e => globalUsersCache.delete(e));

      try {
        if (body.userId) {
          const delRes = await fetch(`${sbUrl}/auth/v1/admin/users/${encodeURIComponent(String(body.userId))}`, {
            method: 'DELETE',
            headers: buildSupabaseAdminHeaders(serviceRoleKey)
          });
          if (!delRes.ok) {
            const errTxt = await delRes.text().catch(() => '');
            return res.status(500).json({
              error: `Error al eliminar usuario en Supabase Auth (${delRes.status}): ${errTxt || 'Fallo en /auth/v1/admin/users'}`
            });
          }
          deletedFromAuth++;
        } else {
          const authUsers = await listAllAuthUsers(sbUrl, serviceRoleKey);
          for (const targetEmail of targets) {
            const matched = authUsers.find(u => (u.email || '').toLowerCase().trim() === targetEmail);
            if (matched && matched.id) {
              const delRes = await fetch(`${sbUrl}/auth/v1/admin/users/${matched.id}`, {
                method: 'DELETE',
                headers: buildSupabaseAdminHeaders(serviceRoleKey)
              });
              if (!delRes.ok) {
                const errTxt = await delRes.text().catch(() => '');
                return res.status(500).json({
                  error: `No se pudo eliminar a ${targetEmail} de Supabase Auth (${delRes.status}): ${errTxt}`
                });
              }
              deletedFromAuth++;
            }
          }
        }
      } catch (e) {
        console.warn('[AdminUsers API] Error eliminando de auth.admin:', e.message);
        return res.status(500).json({ error: `Error eliminando usuario de Supabase Auth: ${e.message}` });
      }

      for (const targetEmail of targets) {
        try {
          await fetch(`${sbUrl}/rest/v1/perfiles?${emailEqFilter(targetEmail)}`, {
            method: 'DELETE',
            headers: buildSupabaseAdminHeaders(serviceRoleKey)
          });
          await fetch(`${sbUrl}/rest/v1/cubikar_registros?${emailEqFilter(targetEmail)}`, {
            method: 'DELETE',
            headers: buildSupabaseAdminHeaders(serviceRoleKey)
          });
          deletedFromTables++;
        } catch {}
      }

      return res.status(200).json({
        ok: true,
        message: `${targets.length} usuario(s) procesado(s) para eliminación.`,
        deletedEmails: targets,
        deletedFromAuth,
        deletedFromTables
      });
    }

    if (action === 'set_coadmin') {
      if (!callerIsAdmin) {
        return res.status(403).json({ error: 'Acceso denegado. Solo administradores autorizados.' });
      }
      const targetEmail = normalizeEmail(body.email);
      if (!targetEmail || !targetEmail.includes('@')) {
        return res.status(400).json({ error: 'Correo de co-administrador inválido.' });
      }
      if (targetEmail === MASTER_ADMIN_EMAIL) {
        return res.status(400).json({ error: 'El Administrador Maestro no puede modificarse.' });
      }
      // Sin service_role, el trigger de BD solo acepta el cambio de is_co_admin con el JWT del Administrador Maestro.
      if (!serviceRoleKey && caller.email !== MASTER_ADMIN_EMAIL) {
        return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.' });
      }

      const isCoAdminFlag = Boolean(body.isCoAdmin);
      const targetName = String(body.name || '').trim() || targetEmail.split('@')[0];

      try {
        if (serviceRoleKey) {
          try {
            const authUsers = await listAllAuthUsers(sbUrl, serviceRoleKey);
            const targetUser = authUsers.find(u => normalizeEmail(u?.email) === targetEmail);
            if (targetUser && targetUser.id) {
              const prevUserMeta = (targetUser.user_metadata && typeof targetUser.user_metadata === 'object')
                ? targetUser.user_metadata
                : {};
              await fetch(`${sbUrl}/auth/v1/admin/users/${targetUser.id}`, {
                method: 'PUT',
                headers: buildSupabaseAdminHeaders(serviceRoleKey, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                  user_metadata: {
                    ...prevUserMeta,
                    is_co_admin: isCoAdminFlag,
                    isCoAdmin: isCoAdminFlag
                  }
                })
              });
            }
          } catch (_) {}
        }

        const checkRes = await fetch(
          `${sbUrl}/rest/v1/cubikar_registros?${emailEqFilter(targetEmail)}&select=email,nombre,metadata&limit=1`,
          { headers: buildSupabaseReadHeaders(serviceRoleKey, sbAnonKey, caller.token) }
        );
        if (!checkRes.ok) {
          const errTxt = await checkRes.text().catch(() => '');
          return res.status(checkRes.status).json({ error: `No se pudo leer el registro del co-administrador: ${errTxt}` });
        }
        const existingRows = await checkRes.json();
        const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;

        const prevMeta = (existingRow?.metadata && typeof existingRow.metadata === 'object') ? existingRow.metadata : {};
        const nextMeta = {
          ...prevMeta,
          is_co_admin: isCoAdminFlag,
          isCoAdmin: isCoAdminFlag,
          updated_by: caller.email,
          updated_at: new Date().toISOString()
        };

        const upsertRes = await fetch(`${sbUrl}/rest/v1/cubikar_registros?on_conflict=email`, {
          method: 'POST',
          headers: buildSupabaseReadHeaders(serviceRoleKey, sbAnonKey, caller.token, {
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          }),
          body: JSON.stringify({
            email: targetEmail,
            nombre: existingRow?.nombre || targetName,
            metadata: nextMeta
          })
        });

        if (!upsertRes.ok) {
          const errTxt = await upsertRes.text();
          return res.status(upsertRes.status).json({ error: `No se pudo actualizar co-administrador: ${errTxt}` });
        }

        return res.status(200).json({
          ok: true,
          email: targetEmail,
          isCoAdmin: isCoAdminFlag
        });
      } catch (err) {
        return res.status(500).json({ error: err.message || 'Error guardando co-administrador.' });
      }
    }

    return res.status(400).json({ error: `Acción desconocida "${action}".` });
  }

  return res.status(405).json({ error: 'Método no permitido. Usa GET o POST.' });
}

export async function onRequest(context) {
  const { request, env } = context;
  globalThis.process = globalThis.process || { env: {} };
  globalThis.process.env = { ...(globalThis.process.env || {}), ...(env || {}) };

  const headersObj = {};
  request.headers.forEach((value, key) => {
    headersObj[key.toLowerCase()] = value;
  });

  let body = null;
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    const rawText = await request.text().catch(() => '');
    if (rawText) {
      try {
        body = JSON.parse(rawText);
      } catch {
        body = rawText;
      }
    }
  }

  let statusCode = 200;
  const resHeaders = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  let responseBody = '';

  const req = {
    method: request.method,
    url: request.url,
    headers: headersObj,
    body
  };

  const res = {
    setHeader(k, v) {
      resHeaders.set(k, String(v));
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseBody = JSON.stringify(data);
      return this;
    },
    end(txt = '') {
      responseBody = txt || '';
      return this;
    }
  };

  await handler(req, res);
  return new Response(statusCode === 204 || request.method === 'OPTIONS' ? null : responseBody, {
    status: statusCode,
    headers: resHeaders
  });
}
