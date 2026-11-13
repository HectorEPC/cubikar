// api/admin-users.js
// Vercel Serverless Function: Central de administración y sincronización de usuarios de Cubikar.
// Permite que el Administrador Maestro (hepc.90@gmail.com) visualice y administre
// todas las cuentas registradas desde cualquier dispositivo en tiempo real.

const DEFAULT_SUPABASE_URL = 'https://hxyzvxueoqvvjyehfpym.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXp2eHVlb3F2dmp5ZWhmcHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMTYwODAsImV4cCI6MjEwOTY5MjA4MH0.q3P-_HZ11PP5dgCkAX7o5TZGqVAoqVv438W6coZiYeA';
const MASTER_ADMIN_EMAIL = 'hepc.90@gmail.com';

// Cache global en memoria durante el ciclo de vida del contenedor serverless
if (!global._cubikarCloudUsersCache) {
  global._cubikarCloudUsersCache = new Map();
}
const globalUsersCache = global._cubikarCloudUsersCache;

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-email, x-supabase-service-key');
}

function getSupabaseConfig(req) {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const headerKey = (req.headers['x-supabase-service-key'] || '').trim();
  const envKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const serviceRoleKey = headerKey || envKey;

  return { url, anonKey, serviceRoleKey };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url: sbUrl, anonKey: sbAnonKey, serviceRoleKey } = getSupabaseConfig(req);

  // =========================================================================
  // MÉTODO GET: Retornar todos los usuarios registrados para el panel Admin
  // =========================================================================
  if (req.method === 'GET') {
    const usersMap = new Map();

    // 1. Incorporar siempre al Administrador Maestro por defecto
    usersMap.set(MASTER_ADMIN_EMAIL.toLowerCase(), {
      id: 'master-admin-hepc',
      name: 'Hepc Administrador',
      email: MASTER_ADMIN_EMAIL,
      sexo: 'Masculino',
      avatar: 'assets/branding/cubikar_icon_transparent.png',
      createdAt: '2026-01-15T00:00:00.000Z',
      lastLogin: new Date().toISOString(),
      subscription: { planId: 'pro', billingCycle: 'annual' },
      isMasterAdmin: true,
      source: 'master'
    });

    // 2. Si hay clave Service Role de Supabase, consultar la API Admin de auth.users
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

            usersMap.set(cleanEmail, {
              id: u.id,
              name: meta.full_name || meta.name || existing.name || cleanEmail.split('@')[0],
              email: cleanEmail,
              sexo: meta.sexo || existing.sexo || 'Masculino',
              dob: meta.dob || existing.dob || '',
              avatar: meta.avatar_url || meta.avatar || existing.avatar || '',
              createdAt: u.created_at || existing.createdAt || new Date().toISOString(),
              lastLogin: u.last_sign_in_at || u.created_at || existing.lastLogin || new Date().toISOString(),
              subscription: planSub,
              emailConfirmed: Boolean(u.email_confirmed_at),
              isMasterAdmin: cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase(),
              source: 'supabase_auth'
            });
            pulledFromAuth++;
          });
        }
      } catch (e) {
        console.warn('[AdminUsers API] Error consultando auth.admin.users:', e.message);
      }

      // También consultar public.perfiles si las tablas existen
      try {
        const perfRes = await fetch(`${sbUrl}/rest/v1/perfiles?select=*,empresas(*)`, {
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
              const plan = p.empresas?.plan || existing.subscription?.planId || 'free';

              usersMap.set(cleanEmail, {
                id: p.id || existing.id,
                name: p.nombre_completo || existing.name || cleanEmail.split('@')[0],
                email: cleanEmail,
                sexo: p.sexo || existing.sexo || 'Masculino',
                avatar: p.avatar_url || existing.avatar || '',
                createdAt: p.created_at || existing.createdAt || new Date().toISOString(),
                lastLogin: p.updated_at || existing.lastLogin || new Date().toISOString(),
                subscription: { planId: plan, billingCycle: existing.subscription?.billingCycle || 'monthly' },
                isMasterAdmin: cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase(),
                source: 'supabase_perfiles'
              });
            });
          }
        }
      } catch (_) {}
    }

    // 3. Consultar la tabla central de registros si existe (cubikar_registros)
    try {
      const regKey = serviceRoleKey || sbAnonKey;
      const regRes = await fetch(`${sbUrl}/rest/v1/cubikar_registros?select=*`, {
        headers: {
          apikey: regKey,
          Authorization: `Bearer ${regKey}`
        }
      });
      if (regRes.ok) {
        const rows = await regRes.json();
        if (Array.isArray(rows)) {
          rows.forEach(r => {
            if (!r || !r.email) return;
            const cleanEmail = r.email.toLowerCase().trim();
            const existing = usersMap.get(cleanEmail) || {};

            usersMap.set(cleanEmail, {
              id: r.id || existing.id,
              name: r.nombre || existing.name || cleanEmail.split('@')[0],
              email: cleanEmail,
              sexo: r.sexo || existing.sexo || 'Masculino',
              dob: r.dob || existing.dob || '',
              avatar: r.avatar || existing.avatar || '',
              createdAt: r.registered_at || existing.createdAt || new Date().toISOString(),
              lastLogin: r.last_activity || existing.lastLogin || new Date().toISOString(),
              subscription: {
                planId: r.plan || existing.subscription?.planId || 'free',
                billingCycle: r.billing_cycle || existing.subscription?.billingCycle || 'monthly'
              },
              isMasterAdmin: cleanEmail === MASTER_ADMIN_EMAIL.toLowerCase(),
              source: 'supabase_cubikar_registros'
            });
          });
        }
      }
    } catch (_) {}

    // 4. Incorporar usuarios de la caché en memoria recibidos por POST en esta instancia
    for (const [email, user] of globalUsersCache.entries()) {
      if (!usersMap.has(email)) {
        usersMap.set(email, {
          ...user,
          isMasterAdmin: email === MASTER_ADMIN_EMAIL.toLowerCase()
        });
      }
    }

    const allUsersList = Array.from(usersMap.values());

    return res.status(200).json({
      ok: true,
      total: allUsersList.length,
      users: allUsersList,
      hasServiceRole: Boolean(serviceRoleKey),
      pulledFromAuth,
      timestamp: new Date().toISOString()
    });
  }

  // =========================================================================
  // MÉTODO POST: Registrar, Sincronizar o Eliminar usuarios en la nube
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

    // -----------------------------------------------------------------------
    // ACCIÓN: REGISTRAR O ACTUALIZAR USUARIO
    // -----------------------------------------------------------------------
    if (action === 'register' || action === 'sync_user') {
      const u = body.user || {};
      const rawEmail = String(u.email || '').trim().toLowerCase();
      if (!rawEmail) {
        return res.status(400).json({ error: 'El campo "email" es obligatorio.' });
      }

      const userEntry = {
        id: u.id || `cloud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        email: rawEmail,
        name: u.name || rawEmail.split('@')[0],
        sexo: u.sexo || 'Masculino',
        dob: u.dob || '',
        avatar: u.avatar || '',
        createdAt: u.registeredAt || u.createdAt || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        subscription: u.subscription || { planId: 'free', billingCycle: 'monthly' },
        source: 'sync_post'
      };

      // Guardar en la caché en memoria compartida
      globalUsersCache.set(rawEmail, userEntry);

      // Intentar guardar en Supabase cubikar_registros
      try {
        const postKey = serviceRoleKey || sbAnonKey;
        await fetch(`${sbUrl}/rest/v1/cubikar_registros`, {
          method: 'POST',
          headers: {
            apikey: postKey,
            Authorization: `Bearer ${postKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates'
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
      } catch (_) {}

      return res.status(200).json({
        ok: true,
        message: 'Usuario sincronizado con éxito en la nube.',
        user: userEntry
      });
    }

    // -----------------------------------------------------------------------
    // ACCIÓN: ELIMINAR USUARIOS (EXCLUSIVO PARA EL ADMINISTRADOR)
    // -----------------------------------------------------------------------
    if (action === 'delete') {
      const rawEmails = Array.isArray(body.emails) ? body.emails : [body.email];
      const targets = rawEmails
        .map(e => String(e || '').trim().toLowerCase())
        .filter(e => e && e !== MASTER_ADMIN_EMAIL.toLowerCase());

      if (targets.length === 0) {
        return res.status(400).json({
          error: 'No se especificaron usuarios válidos para eliminar o se intentó eliminar al Administrador Maestro protegido.'
        });
      }

      let deletedFromAuth = 0;
      let deletedFromTables = 0;

      // Eliminar de caché en memoria
      targets.forEach(e => globalUsersCache.delete(e));

      // Si hay serviceRoleKey, eliminar de Supabase auth.users y tablas públicas
      if (serviceRoleKey) {
        try {
          const authRes = await fetch(`${sbUrl}/auth/v1/admin/users?per_page=1000`, {
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`
            }
          });

          if (authRes.ok) {
            const authData = await authRes.json();
            const authUsers = Array.isArray(authData) ? authData : (authData.users || []);

            for (const targetEmail of targets) {
              const matched = authUsers.find(u => (u.email || '').toLowerCase().trim() === targetEmail);
              if (matched && matched.id) {
                // Eliminar usuario en Supabase Auth
                const delRes = await fetch(`${sbUrl}/auth/v1/admin/users/${matched.id}`, {
                  method: 'DELETE',
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`
                  }
                });
                if (delRes.ok) deletedFromAuth++;
              }
            }
          }
        } catch (e) {
          console.warn('[AdminUsers API] Error eliminando de auth.admin:', e.message);
        }

        // Eliminar de perfiles y cubikar_registros
        for (const targetEmail of targets) {
          try {
            await fetch(`${sbUrl}/rest/v1/perfiles?email=ilike.${encodeURIComponent(targetEmail)}`, {
              method: 'DELETE',
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`
              }
            });
            await fetch(`${sbUrl}/rest/v1/cubikar_registros?email=ilike.${encodeURIComponent(targetEmail)}`, {
              method: 'DELETE',
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`
              }
            });
            deletedFromTables++;
          } catch (_) {}
        }
      }

      return res.status(200).json({
        ok: true,
        message: `${targets.length} usuario(s) procesado(s) para eliminación.`,
        deletedEmails: targets,
        deletedFromAuth,
        deletedFromTables
      });
    }

    return res.status(400).json({ error: `Acción desconocida "${action}".` });
  }

  return res.status(405).json({ error: 'Método no permitido. Usa GET o POST.' });
}
