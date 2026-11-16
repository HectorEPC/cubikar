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

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url, anonKey, serviceRoleKey };
}

function sanitizePostgrestFilterTerm(raw) {
  return String(raw || '')
    .trim()
    .replace(/[%_,()]/g, '');
}

async function updateEmpresaWithBillingCycleFallback(sbUrl, serviceRoleKey, empresaId, payload) {
  if (!sbUrl || !serviceRoleKey || !empresaId) return { ok: false };
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal'
  };
  const endpoint = `${sbUrl}/rest/v1/empresas?id=eq.${encodeURIComponent(empresaId)}`;
  let res = await fetch(endpoint, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok && Object.prototype.hasOwnProperty.call(payload, 'billing_cycle')) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.billing_cycle;
    res = await fetch(endpoint, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(fallbackPayload)
    });
  }
  return res;
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
  const email = String(callerEmail || '').toLowerCase().trim();
  if (!email) return false;
  if (email === MASTER_ADMIN_EMAIL.toLowerCase()) return true;

  const envCoAdmins = String(process.env.CUBIKAR_CO_ADMINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (envCoAdmins.includes(email)) return true;

  const readKey = serviceRoleKey || sbAnonKey;
  const authBearer = serviceRoleKey || callerToken;
  if (!readKey || !authBearer) return false;

  try {
    const safeEmail = sanitizePostgrestFilterTerm(email);
    if (!safeEmail) return false;
    const res = await fetch(
      `${sbUrl}/rest/v1/cubikar_registros?email=ilike.${encodeURIComponent(safeEmail)}&select=email,metadata&limit=1`,
      {
        headers: {
          apikey: readKey,
          Authorization: `Bearer ${authBearer}`
        }
      }
    );
    if (res.ok) {
      const rows = await res.json();
      const meta = rows?.[0]?.metadata;
      if (meta && (meta.is_co_admin === true || meta.isCoAdmin === true)) {
        return true;
      }
    }
  } catch {}

  return false;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.headers.origin && !isAllowedOrigin(req.headers.origin)) {
    return res.status(403).json({ error: 'Acceso no autorizado desde este origen.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url: sbUrl, anonKey: sbAnonKey, serviceRoleKey } = getSupabaseConfig();
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
    const envCoAdmins = String(process.env.CUBIKAR_CO_ADMINS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(e => e && e !== MASTER_ADMIN_EMAIL.toLowerCase());
    envCoAdmins.forEach(em => {
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
        const readKey = serviceRoleKey || sbAnonKey;
        const readBearer = serviceRoleKey || caller.token;
        const regRes = await fetch(`${sbUrl}/rest/v1/cubikar_registros?select=email,nombre,registered_at,metadata`, {
          headers: {
            apikey: readKey,
            Authorization: `Bearer ${readBearer}`
          }
        });
        if (regRes.ok) {
          const rows = await regRes.json();
          if (Array.isArray(rows)) {
            rows.forEach(r => {
              const em = String(r?.email || '').toLowerCase().trim();
              const meta = (r?.metadata && typeof r.metadata === 'object') ? r.metadata : {};
              if (em && em !== MASTER_ADMIN_EMAIL.toLowerCase() && (meta.is_co_admin === true || meta.isCoAdmin === true)) {
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
        const authRes = await fetch(`${sbUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        });

        if (authRes.ok) {
          const authData = await authRes.json();
          const authUsers = Array.isArray(authData) ? authData : (authData.users || []);

          authUsers.forEach(u => {
            if (!u || !u.email) return;
            const cleanEmail = u.email.toLowerCase().trim();
            const meta = u.user_metadata || {};
            const planSub = meta.subscription || { planId: 'free', billingCycle: 'monthly' };
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
        }
      } catch (e) {
        console.warn('[AdminUsers API] Error consultando auth.admin.users:', e.message);
      }

      try {
        const searchParam = sanitizePostgrestFilterTerm(reqUrl.searchParams.get('search') || '');
        const orFilter = searchParam
          ? `&or=(email.ilike.*${encodeURIComponent(searchParam)}*,nombre_completo.ilike.*${encodeURIComponent(searchParam)}*)`
          : '';
        const perfRes = await fetch(`${sbUrl}/rest/v1/perfiles?select=*,empresas(*)${orFilter}`, {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
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
      const readKey = serviceRoleKey || sbAnonKey;
      const readBearer = serviceRoleKey || caller.token;
      const regRes = await fetch(`${sbUrl}/rest/v1/cubikar_registros?select=*`, {
        headers: {
          apikey: readKey,
          Authorization: `Bearer ${readBearer}`
        }
      });
      if (regRes.ok) {
        const rows = await regRes.json();
        if (Array.isArray(rows)) {
          rows.forEach(r => {
            if (!r || !r.email) return;
            const cleanEmail = r.email.toLowerCase().trim();
            const existing = usersMap.get(cleanEmail);
            const meta = (r.metadata && typeof r.metadata === 'object') ? r.metadata : {};
            const isCoAdminRow = cleanEmail !== MASTER_ADMIN_EMAIL.toLowerCase() && (meta.is_co_admin === true || meta.isCoAdmin === true || coAdminsMap.has(cleanEmail));

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
          const safeEmail = sanitizePostgrestFilterTerm(rawEmail);
          const perfRes = await fetch(
            `${sbUrl}/rest/v1/perfiles?email=ilike.${encodeURIComponent(safeEmail)}&select=empresa_id,empresas(id,plan)&limit=1`,
            {
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`
              }
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
        const postKey = serviceRoleKey || sbAnonKey;
        const postBearer = serviceRoleKey || caller.token;
        await fetch(`${sbUrl}/rest/v1/cubikar_registros?on_conflict=email`, {
          method: 'POST',
          headers: {
            apikey: postKey,
            Authorization: `Bearer ${postBearer}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
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
      const targetEmail = sanitizePostgrestFilterTerm(String(body.email || '').trim().toLowerCase());
      if (!targetEmail || targetEmail === MASTER_ADMIN_EMAIL.toLowerCase()) {
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
          `${sbUrl}/rest/v1/perfiles?email=ilike.${encodeURIComponent(targetEmail)}&select=id,empresa_id&limit=1`,
          { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
        );
        const rows = perfRes.ok ? await perfRes.json() : [];
        const empresaId = rows?.[0]?.empresa_id;
        if (empresaId) {
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
          const empRes = await updateEmpresaWithBillingCycleFallback(sbUrl, serviceRoleKey, empresaId, updatePayload);
          if (!empRes.ok) {
            const errTxt = await empRes.text();
            return res.status(500).json({ error: `No se pudo actualizar empresa: ${errTxt}` });
          }
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
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`
            }
          });
          if (!delRes.ok) {
            const errTxt = await delRes.text().catch(() => '');
            return res.status(500).json({
              error: `Error al eliminar usuario en Supabase Auth (${delRes.status}): ${errTxt || 'Fallo en /auth/v1/admin/users'}`
            });
          }
          deletedFromAuth++;
        } else {
          const authRes = await fetch(`${sbUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`
            }
          });

          if (!authRes.ok) {
            const errTxt = await authRes.text().catch(() => '');
            return res.status(500).json({
              error: `No se pudo consultar auth.users para eliminar (${authRes.status}): ${errTxt}`
            });
          }

          const authData = await authRes.json();
          const authUsers = Array.isArray(authData) ? authData : (authData.users || []);

          for (const targetEmail of targets) {
            const matched = authUsers.find(u => (u.email || '').toLowerCase().trim() === targetEmail);
            if (matched && matched.id) {
              const delRes = await fetch(`${sbUrl}/auth/v1/admin/users/${matched.id}`, {
                method: 'DELETE',
                headers: {
                  apikey: serviceRoleKey,
                  Authorization: `Bearer ${serviceRoleKey}`
                }
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
          const safeTarget = sanitizePostgrestFilterTerm(targetEmail);
          if (!safeTarget) continue;
          await fetch(`${sbUrl}/rest/v1/perfiles?email=ilike.${encodeURIComponent(safeTarget)}`, {
            method: 'DELETE',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`
            }
          });
          await fetch(`${sbUrl}/rest/v1/cubikar_registros?email=ilike.${encodeURIComponent(safeTarget)}`, {
            method: 'DELETE',
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`
            }
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
      const targetEmail = sanitizePostgrestFilterTerm(String(body.email || '').trim().toLowerCase());
      if (!targetEmail || !targetEmail.includes('@')) {
        return res.status(400).json({ error: 'Correo de co-administrador inválido.' });
      }
      if (targetEmail === MASTER_ADMIN_EMAIL.toLowerCase()) {
        return res.status(400).json({ error: 'El Administrador Maestro no puede modificarse.' });
      }

      const isCoAdminFlag = Boolean(body.isCoAdmin);
      const targetName = String(body.name || '').trim() || targetEmail.split('@')[0];

      try {
        // Actualizar únicamente user_metadata del usuario objetivo (targetUser.id) si existe en Auth,
        // sin sobrescribir masterUser.user_metadata.cubikar_coadmins
        if (serviceRoleKey) {
          try {
            const authRes = await fetch(`${sbUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`
              }
            });
            if (authRes.ok) {
              const authData = await authRes.json();
              const authUsers = Array.isArray(authData) ? authData : (authData.users || []);
              const targetUser = authUsers.find(u => (u?.email || '').toLowerCase().trim() === targetEmail);
              if (targetUser && targetUser.id) {
                const prevUserMeta = (targetUser.user_metadata && typeof targetUser.user_metadata === 'object')
                  ? targetUser.user_metadata
                  : {};
                await fetch(`${sbUrl}/auth/v1/admin/users/${targetUser.id}`, {
                  method: 'PUT',
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    user_metadata: {
                      ...prevUserMeta,
                      is_co_admin: isCoAdminFlag,
                      isCoAdmin: isCoAdminFlag
                    }
                  })
                });
              }
            }
          } catch (_) {}
        }

        const readKey = serviceRoleKey || sbAnonKey;
        const authBearer = serviceRoleKey || caller.token;
        let existingRow = null;

        const checkRes = await fetch(
          `${sbUrl}/rest/v1/cubikar_registros?email=ilike.${encodeURIComponent(targetEmail)}&select=email,nombre,metadata&limit=1`,
          { headers: { apikey: readKey, Authorization: `Bearer ${authBearer}` } }
        );
        if (checkRes.ok) {
          const rows = await checkRes.json();
          existingRow = Array.isArray(rows) ? rows[0] : null;
        }

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
          headers: {
            apikey: readKey,
            Authorization: `Bearer ${authBearer}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
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
