// api/invites.js
// Backend seguro de Invitaciones por Correo Electrónico (Token 256-bit + SHA-256 en Supabase + Resend).
// Compatible con Cloudflare Workers (worker.js -> onRequest) y Node.js / Vercel (default handler).

const DEFAULT_APP_ORIGIN = 'const';
const DEFAULT_SUPABASE_URL = 'https://hxyzvxueoqvvjyehfpym.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXp2eHVlb3F2dmp5ZWhmcHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMTYwODAsImV4cCI6MjEwOTY5MjA4MH0.q3P-_HZ11PP5dgCkAX7o5TZGqVAoqVv438W6coZiYeA';

const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const ALLOWED_ROLES = new Set(['editar', 'escribir', 'leer']);
const PLAN_MAX_MEMBERS = { free: 3, plus: 10, pro: 30 };

const ROLE_DESCRIPTIONS = {
  editar: { label: 'Editar', desc: 'Control total del proyecto, catálogo/alcances, precios y configuración.' },
  escribir: { label: 'Escribir', desc: 'Captura y actualización de partidas, conceptos, avances e insumos.' },
  leer: { label: 'Leer', desc: 'Solo consulta, revisión y descarga de reportes sin modificar datos.' }
};

function isAllowedOrigin(rawOrigin) {
  if (!rawOrigin) return true;
  try {
    const parsed = new URL(rawOrigin);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'cubikar.app' ||
      host.endsWith('.cubikar.app') ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.workers.dev') ||
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
  const allowedOrigin = isAllowedOrigin(origin);
  const fallback = DEFAULT_APP_ORIGIN === 'arq' ? 'https://arq.cubikar.app' : 'https://const.cubikar.app';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin ? (origin || 'https://cubikar.app') : fallback);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  return allowedOrigin;
}

function getEnv(name, fallback = '') {
  return String(globalThis?.process?.env?.[name] || fallback).trim();
}

function getSupabaseServerConfig() {
  return {
    url: getEnv('SUPABASE_URL', DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    anonKey: getEnv('SUPABASE_ANON_KEY', DEFAULT_SUPABASE_ANON_KEY),
    serviceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
  };
}

function normalizeEmail(raw) {
  return String(raw || '').toLowerCase().trim();
}

export function maskEmailAddress(email) {
  const clean = normalizeEmail(email);
  const atIdx = clean.indexOf('@');
  if (atIdx <= 0) return '•••••';
  const local = clean.slice(0, atIdx);
  const domain = clean.slice(atIdx + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}•••••@${domain}`;
}

function normalizeAppOrigin(raw) {
  const v = String(raw || DEFAULT_APP_ORIGIN).toLowerCase().trim();
  return v === 'arq' ? 'arq' : 'const';
}

function buildSmartInviteUrl(token, appOrigin) {
  const origin = normalizeAppOrigin(appOrigin);
  const customBase = origin === 'arq'
    ? getEnv('APP_BASE_URL_ARQ', 'https://arq.cubikar.app/')
    : getEnv('APP_BASE_URL_CONST', 'https://const.cubikar.app/');
  const url = new URL(customBase);
  url.searchParams.set('invite', token);
  return url.toString();
}

function generateCryptoToken256() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(raw) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(raw || '')));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sbHeaders(sb, { prefer = '' } = {}) {
  const h = {
    'Content-Type': 'application/json',
    apikey: sb.serviceRoleKey,
    Authorization: `Bearer ${sb.serviceRoleKey}`
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

async function sbRest(sb, path, { method = 'GET', body = null, prefer = '' } = {}) {
  const res = await fetch(`${sb.url}/rest/v1/${path}`, {
    method,
    headers: sbHeaders(sb, { prefer }),
    body: body !== null ? JSON.stringify(body) : undefined
  });
  const text = await res.text().catch(() => '');
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { ok: res.ok, status: res.status, data };
}

async function verifyCallerJwt(sb, jwt) {
  if (!jwt) return null;
  try {
    const res = await fetch(`${sb.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: sb.serviceRoleKey || sb.anonKey,
        Authorization: `Bearer ${jwt}`
      }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function isUserEmailConfirmed(authUser) {
  return Boolean(authUser && (authUser.email_confirmed_at || authUser.confirmed_at));
}

function normalizePlan(rawPlan) {
  const p = String(rawPlan || 'free').toLowerCase().trim();
  if (p === 'pro' || p === 'enterprise' || p === 'team') return 'pro';
  if (p === 'plus' || p === 'basico' || p === 'básico') return 'plus';
  return 'free';
}

async function resolveOwnerPlanId(sb, ownerEmail, appOrigin) {
  const clean = normalizeEmail(ownerEmail);
  if (clean === 'hepc.90@gmail.com' || clean === 'admin.general@constructora.com') return 'pro';
  try {
    const r = await sbRest(
      sb,
      `perfiles?email=ilike.${encodeURIComponent(clean)}&select=id,email,empresas(plan,plan_const,plan_arq)&limit=1`
    );
    const emp = Array.isArray(r.data) ? r.data[0]?.empresas : null;
    if (emp) {
      const appCol = appOrigin === 'arq' ? emp.plan_arq : emp.plan_const;
      return normalizePlan(appCol || emp.plan || 'free');
    }
  } catch {}
  return 'free';
}

async function resolveOwnerProfileName(sb, ownerEmail, fallbackName = '') {
  const clean = normalizeEmail(ownerEmail);
  try {
    const r = await sbRest(
      sb,
      `perfiles?email=ilike.${encodeURIComponent(clean)}&select=nombre_completo,empresas(nombre)&limit=1`
    );
    const row = Array.isArray(r.data) ? r.data[0] : null;
    return {
      ownerName: String(row?.nombre_completo || fallbackName || clean.split('@')[0] || 'Anfitrión').trim(),
      empresaNombre: String(row?.empresas?.nombre || '').trim()
    };
  } catch {
    return {
      ownerName: String(fallbackName || clean.split('@')[0] || 'Anfitrión').trim(),
      empresaNombre: ''
    };
  }
}

async function checkHostSeatLimit(sb, ownerEmail, targetEmail, projectId, appOrigin) {
  const cleanOwner = normalizeEmail(ownerEmail);
  const cleanTarget = normalizeEmail(targetEmail);
  const planId = await resolveOwnerPlanId(sb, cleanOwner, appOrigin);
  const maxMembers = PLAN_MAX_MEMBERS[planId] || 3;

  const usersSet = new Set();
  if (cleanOwner) usersSet.add(cleanOwner);

  const projsRes = await sbRest(
    sb,
    `proyectos?owner_email=ilike.${encodeURIComponent(cleanOwner)}&deleted_at=is.null&select=id`
  );
  const projIds = Array.isArray(projsRes.data) ? projsRes.data.map((p) => p.id).filter(Boolean) : [];
  if (projectId && !projIds.includes(projectId)) projIds.push(projectId);

  if (projIds.length > 0) {
    const inClause = projIds.map((id) => encodeURIComponent(id)).join(',');
    const colabRes = await sbRest(
      sb,
      `proyecto_colaboradores?proyecto_id=in.(${inClause})&select=email_colaborador,estado_invitacion`
    );
    if (Array.isArray(colabRes.data)) {
      colabRes.data.forEach((c) => {
        const em = normalizeEmail(c?.email_colaborador);
        const st = String(c?.estado_invitacion || 'pending').toLowerCase().trim();
        if (em && st !== 'rejected' && st !== 'cancelled') usersSet.add(em);
      });
    }
  }

  const invRes = await sbRest(
    sb,
    `invitaciones?owner_email=ilike.${encodeURIComponent(cleanOwner)}&estado=eq.pending&select=invitee_email,expires_at`
  );
  const nowMs = Date.now();
  if (Array.isArray(invRes.data)) {
    invRes.data.forEach((inv) => {
      const em = normalizeEmail(inv?.invitee_email);
      const exp = inv?.expires_at ? new Date(inv.expires_at).getTime() : Infinity;
      if (em && exp > nowMs) usersSet.add(em);
    });
  }

  if (cleanTarget && usersSet.has(cleanTarget)) {
    if (usersSet.size > maxMembers) {
      return {
        allowed: false,
        planId,
        maxMembers,
        currentUsers: usersSet.size,
        reason: `Tu cuenta excede el límite de ${maxMembers} usuarios del plan ${planId.toUpperCase()}.`
      };
    }
    return { allowed: true, planId, maxMembers, currentUsers: usersSet.size };
  }

  if (usersSet.size >= maxMembers) {
    return {
      allowed: false,
      planId,
      maxMembers,
      currentUsers: usersSet.size,
      reason: `Has alcanzado el límite de ${maxMembers} usuarios de tu plan ${planId.toUpperCase()}. Actualiza tu suscripción o libera un cupo rechazado/removido.`
    };
  }

  return { allowed: true, planId, maxMembers, currentUsers: usersSet.size };
}

async function fetchProjectAndVerifyInviter(sb, projectId, callerUser) {
  const projRes = await sbRest(
    sb,
    `proyectos?id=eq.${encodeURIComponent(projectId)}&deleted_at=is.null&select=id,nombre,cliente,owner_email,creado_por,configuracion&limit=1`
  );
  const proj = Array.isArray(projRes.data) ? projRes.data[0] : null;
  if (!proj) return { proj: null, allowed: false, reason: 'Proyecto no encontrado o está en la papelera.' };

  const callerEmail = normalizeEmail(callerUser?.email);
  const ownerEmail = normalizeEmail(proj.owner_email);
  const isOwner = Boolean(
    callerEmail === 'hepc.90@gmail.com' ||
    (ownerEmail && ownerEmail === callerEmail) ||
    (!ownerEmail && proj.creado_por && proj.creado_por === callerUser?.id)
  );
  if (isOwner) return { proj, allowed: true, isOwner: true };

  const pcRes = await sbRest(
    sb,
    `proyecto_colaboradores?proyecto_id=eq.${encodeURIComponent(projectId)}&email_colaborador=ilike.${encodeURIComponent(callerEmail)}&select=rol,estado_invitacion&limit=1`
  );
  const pc = Array.isArray(pcRes.data) ? pcRes.data[0] : null;
  const pcRole = String(pc?.rol || '').toLowerCase().trim();
  const pcStatus = String(pc?.estado_invitacion || '').toLowerCase().trim();
  if (pcStatus === 'accepted' && (pcRole === 'owner' || pcRole === 'admin' || pcRole === 'editar')) {
    return { proj, allowed: true, isOwner: false };
  }

  return { proj, allowed: false, reason: 'Solo el propietario o un Editor aceptado del proyecto puede enviar invitaciones.' };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendInviteEmailViaResend({ inviteUrl, inviteeEmail, inviteeName, ownerName, projectName, companyName, role, appOrigin }) {
  const apiKey = getEnv('RESEND_API_KEY', '');
  if (!apiKey) {
    return { sent: false, error: 'RESEND_API_KEY no está configurada en Cloudflare.' };
  }

  const isArq = normalizeAppOrigin(appOrigin) === 'arq';
  const appLabel = isArq ? 'Cubikar Arquitectura' : 'Cubikar Construcción';
  const fromEmail = getEnv('RESEND_FROM_EMAIL', `${appLabel} <invitaciones@cubikar.app>`);
  const roleInfo = ROLE_DESCRIPTIONS[role] || ROLE_DESCRIPTIONS.leer;

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:24px;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.35);">
      <tr>
        <td style="background:#0f172a;padding:24px 28px;color:#ffffff;border-bottom:3px solid ${isArq ? '#0ea5e9' : '#2563eb'};">
          <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em;">cubikar<span style="color:#f43f5e;">.</span> <span style="font-weight:600;color:#93c5fd;">${isArq ? 'Arquitectura' : 'Construcción'}</span></div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">Invitación personal de acceso único</div>
        </td>
      </tr>
      <tr>
        <td style="padding:26px 28px;color:#1e293b;font-size:14px;line-height:1.55;">
          <p style="margin:0 0 12px;">Hola${inviteeName ? ` <strong>${escapeHtml(inviteeName)}</strong>` : ''},</p>
          <p style="margin:0 0 18px;">
            <strong>${escapeHtml(ownerName)}</strong> te ha invitado a colaborar en <strong>${escapeHtml(appLabel)}</strong>.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:20px;">
            <tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Proyecto:</td><td style="padding:4px 0;font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(projectName)}</td></tr>
            ${companyName ? `<tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Empresa / Despacho:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(companyName)}</td></tr>` : ''}
            <tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Rol asignado:</td><td style="padding:4px 0;font-size:13px;font-weight:700;color:#1d4ed8;">${escapeHtml(roleInfo.label)}</td></tr>
            <tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Permisos:</td><td style="padding:4px 0;font-size:12px;color:#334155;">${escapeHtml(roleInfo.desc)}</td></tr>
            <tr><td style="padding:4px 0;font-size:12px;color:#64748b;">Cuenta autorizada:</td><td style="padding:4px 0;font-size:12px;font-family:monospace;color:#0f172a;">${escapeHtml(inviteeEmail)}</td></tr>
          </table>
          <div style="text-align:center;margin:24px 0;">
            <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:${isArq ? '#0284c7' : '#2563eb'};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:12px;">Revisar invitación en Cubikar</a>
          </div>
          <p style="margin:0 0 10px;font-size:12px;color:#475569;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;">
            🔒 Este enlace es <strong>personal y de un solo uso</strong> (válido por ${INVITE_TTL_DAYS} días). Solo podrás ver y aceptar esta invitación iniciando sesión con <strong>${escapeHtml(inviteeEmail)}</strong>.
          </p>
          <p style="margin:12px 0 0;font-size:11px;color:#94a3b8;word-break:break-all;">
            Si el botón no abre, copia y pega este enlace:<br>${escapeHtml(inviteUrl)}
          </p>
        </td>
      </tr>
    </table>
  </body>
  </html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [inviteeEmail],
        subject: `${ownerName} te invitó a "${projectName}" en ${appLabel}`,
        html
      })
    });
    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      return { sent: false, error: `Resend respondió ${res.status}: ${errTxt.slice(0, 220)}` };
    }
    const payload = await res.json().catch(() => ({}));
    return { sent: true, id: payload?.id || null };
  } catch (err) {
    return { sent: false, error: err?.message || 'Error enviando correo vía Resend.' };
  }
}

async function handleSend(sb, callerUser, body) {
  const projectId = String(body.projectId || '').trim();
  const inviteeEmail = normalizeEmail(body.inviteeEmail || body.email);
  const inviteeName = String(body.inviteeName || body.name || inviteeEmail.split('@')[0] || 'Colaborador').trim().slice(0, 120);
  const role = ALLOWED_ROLES.has(String(body.role || '').toLowerCase().trim()) ? String(body.role).toLowerCase().trim() : 'leer';
  const allowedTabs = Array.isArray(body.allowedTabs)
    ? body.allowedTabs.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 20)
    : [];
  const appOrigin = normalizeAppOrigin(body.appOrigin);

  if (!UUID_RE.test(projectId)) {
    return { status: 400, data: { ok: false, error: 'El proyecto aún no tiene UUID sincronizado en la nube.' } };
  }
  if (!EMAIL_RE.test(inviteeEmail)) {
    return { status: 400, data: { ok: false, error: 'Correo electrónico del invitado inválido.' } };
  }

  const callerEmail = normalizeEmail(callerUser.email);
  if (inviteeEmail === callerEmail) {
    return { status: 400, data: { ok: false, error: 'No puedes enviarte una invitación a tu propio correo.' } };
  }

  const perm = await fetchProjectAndVerifyInviter(sb, projectId, callerUser);
  if (!perm.proj) return { status: 404, data: { ok: false, error: perm.reason } };
  if (!perm.allowed) return { status: 403, data: { ok: false, error: perm.reason } };

  const ownerEmail = normalizeEmail(perm.proj.owner_email || callerEmail);
  if (inviteeEmail === ownerEmail) {
    return { status: 400, data: { ok: false, error: 'El propietario del proyecto ya tiene acceso completo.' } };
  }

  // Si ya es colaborador aceptado, no sobrescribir ni permitir bypass
  const existingColab = await sbRest(
    sb,
    `proyecto_colaboradores?proyecto_id=eq.${encodeURIComponent(projectId)}&email_colaborador=ilike.${encodeURIComponent(inviteeEmail)}&select=estado_invitacion&limit=1`
  );
  const currentSt = String(existingColab.data?.[0]?.estado_invitacion || '').toLowerCase().trim();
  if (currentSt === 'accepted') {
    return { status: 409, data: { ok: false, error: `${inviteeEmail} ya aceptó y forma parte del proyecto.` } };
  }

  const seatCheck = await checkHostSeatLimit(sb, ownerEmail, inviteeEmail, projectId, appOrigin);
  if (!seatCheck.allowed) {
    return { status: 403, data: { ok: false, limitReached: true, error: seatCheck.reason } };
  }

  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  // Quemar tokens pendientes previos para la misma combinación proyecto + invitado
  await sbRest(
    sb,
    `invitaciones?proyecto_id=eq.${encodeURIComponent(projectId)}&invitee_email=ilike.${encodeURIComponent(inviteeEmail)}&estado=eq.pending`,
    { method: 'PATCH', body: { estado: 'cancelled', used_at: nowIso, updated_at: nowIso } }
  );

  const token = generateCryptoToken256();
  const tokenHash = await sha256Hex(token);
  const inviteId = `inv-${globalThis.crypto.randomUUID()}`;

  const cfg = (perm.proj.configuracion && typeof perm.proj.configuracion === 'object') ? perm.proj.configuracion : {};
  const ownerMeta = await resolveOwnerProfileName(sb, ownerEmail, cfg.ownerName || callerUser?.user_metadata?.full_name || '');
  const projectName = String(body.projectName || perm.proj.nombre || 'Proyecto de Obra').trim().slice(0, 200);
  const companyName = String(body.companyName || cfg.companyName || perm.proj.cliente || ownerMeta.empresaNombre || '').trim().slice(0, 200);

  const insertRes = await sbRest(sb, 'invitaciones', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      id: inviteId,
      proyecto_id: projectId,
      proyecto_nombre: projectName,
      owner_email: ownerEmail,
      owner_name: ownerMeta.ownerName,
      owner_plan_id: seatCheck.planId,
      invitee_name: inviteeName,
      invitee_email: inviteeEmail,
      rol: role,
      allowed_tabs: allowedTabs,
      estado: 'pending',
      token_hash: tokenHash,
      expires_at: expiresAtIso,
      app_origin: appOrigin,
      company_name: companyName,
      created_at: nowIso,
      updated_at: nowIso
    }
  });

  if (!insertRes.ok) {
    return { status: 500, data: { ok: false, error: 'No se pudo registrar la invitación en Supabase.' } };
  }

  // Asegurar fila pendiente en proyecto_colaboradores (jamás 'accepted')
  await sbRest(sb, 'proyecto_colaboradores?on_conflict=proyecto_id,email_colaborador', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: {
      proyecto_id: projectId,
      email_colaborador: inviteeEmail,
      nombre_colaborador: inviteeName,
      rol: role,
      estado_invitacion: 'pending',
      updated_at: nowIso
    }
  });

  const inviteUrl = buildSmartInviteUrl(token, appOrigin);
  const mailRes = await sendInviteEmailViaResend({
    inviteUrl,
    inviteeEmail,
    inviteeName,
    ownerName: ownerMeta.ownerName,
    projectName,
    companyName,
    role,
    appOrigin
  });

  if (mailRes.sent) {
    await sbRest(sb, `invitaciones?id=eq.${encodeURIComponent(inviteId)}`, {
      method: 'PATCH',
      body: { email_sent_at: nowIso, updated_at: nowIso }
    });
  }

  const savedRow = Array.isArray(insertRes.data) ? insertRes.data[0] : {};
  const { token_hash: _neverReturnHash, ...safeInvitation } = savedRow || {};

  return {
    status: 200,
    data: {
      ok: true,
      inviteUrl,
      emailSent: mailRes.sent,
      emailError: mailRes.error || null,
      invitation: {
        ...safeInvitation,
        id: safeInvitation.id || inviteId,
        email_sent_at: mailRes.sent ? nowIso : null
      }
    }
  };
}

async function lookupInviteByToken(sb, rawToken) {
  const token = String(rawToken || '').trim();
  if (!TOKEN_RE.test(token)) {
    return { errorStatus: 400, errorBody: { ok: false, code: 'INVALID_TOKEN', state: 'INVALID_TOKEN', error: 'Enlace inválido o malformado.' } };
  }

  const tokenHash = await sha256Hex(token);
  const res = await sbRest(
    sb,
    `invitaciones?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,proyecto_id,proyecto_nombre,owner_email,owner_name,owner_plan_id,invitee_name,invitee_email,rol,allowed_tabs,estado,expires_at,app_origin,company_name,email_sent_at,used_at,created_at&limit=1`
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row) {
    return { errorStatus: 400, errorBody: { ok: false, code: 'INVALID_TOKEN', state: 'INVALID_TOKEN', error: 'Enlace inválido.' } };
  }

  const st = String(row.estado || '').toLowerCase().trim();
  const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
  if (st !== 'pending' || row.used_at || expired) {
    return {
      errorStatus: 410,
      errorBody: {
        ok: false,
        code: 'TOKEN_EXPIRED_OR_USED',
        state: 'TOKEN_EXPIRED_OR_USED',
        status: expired && st === 'pending' ? 'expired' : st,
        error: 'Este enlace ya fue utilizado, rechazado o expiró.'
      }
    };
  }

  return { row, tokenHash };
}

async function handleVerify(sb, callerUser, body) {
  const lookup = await lookupInviteByToken(sb, body.token);
  if (lookup.errorBody) return { status: lookup.errorStatus, data: lookup.errorBody };

  const row = lookup.row;
  const inviteeEmail = normalizeEmail(row.invitee_email);
  const maskedEmail = maskEmailAddress(inviteeEmail);
  const appOrigin = normalizeAppOrigin(row.app_origin);

  // Sin sesión real válida: NO revelar nombre de proyecto, dueño ni empresa
  if (!callerUser || !callerUser.email) {
    return {
      status: 200,
      data: {
        ok: true,
        state: 'AUTH_REQUIRED',
        maskedEmail,
        appOrigin,
        expiresAt: row.expires_at || null
      }
    };
  }

  const currentEmail = normalizeEmail(callerUser.email);
  if (currentEmail !== inviteeEmail) {
    return {
      status: 403,
      data: {
        ok: false,
        code: 'WRONG_ACCOUNT',
        state: 'WRONG_ACCOUNT',
        maskedEmail,
        currentEmail,
        appOrigin,
        error: `Acceso denegado: esta invitación es personal para ${maskedEmail}, pero tienes sesión iniciada como ${currentEmail}.`
      }
    };
  }

  if (!isUserEmailConfirmed(callerUser)) {
    return {
      status: 403,
      data: {
        ok: false,
        code: 'EMAIL_NOT_CONFIRMED',
        state: 'EMAIL_NOT_CONFIRMED',
        maskedEmail,
        currentEmail,
        appOrigin,
        error: 'Debes confirmar tu correo electrónico desde el enlace enviado a tu bandeja antes de ver o aceptar esta invitación.'
      }
    };
  }

  return {
    status: 200,
    data: {
      ok: true,
      state: 'READY',
      maskedEmail,
      invitation: {
        id: row.id,
        projectId: row.proyecto_id,
        projectName: row.proyecto_nombre || 'Proyecto de Obra',
        companyName: row.company_name || '',
        ownerName: row.owner_name || row.owner_email,
        ownerEmail: normalizeEmail(row.owner_email),
        ownerPlanId: row.owner_plan_id || 'free',
        inviteeEmail,
        inviteeName: row.invitee_name || '',
        role: row.rol || 'leer',
        allowedTabs: Array.isArray(row.allowed_tabs) ? row.allowed_tabs : [],
        appOrigin,
        createdAt: row.created_at,
        expiresAt: row.expires_at
      }
    }
  };
}

async function syncProjectConfigForDecision(sb, projectId, inviteeEmail, inviteeName, role, allowedTabs, accepted, appOrigin = DEFAULT_APP_ORIGIN) {
  const cleanEmail = normalizeEmail(inviteeEmail);
  const pRes = await sbRest(sb, `proyectos?id=eq.${encodeURIComponent(projectId)}&select=id,configuracion&limit=1`);
  const proj = Array.isArray(pRes.data) ? pRes.data[0] : null;
  if (!proj) return;

  const cfg = (proj.configuracion && typeof proj.configuracion === 'object') ? { ...proj.configuracion } : {};
  const prevCols = Array.isArray(cfg.collaborators) ? cfg.collaborators : [];
  const nextCols = prevCols.filter((c) => normalizeEmail(c?.email) !== cleanEmail);

  const prevTabs = (cfg.memberTabs && typeof cfg.memberTabs === 'object') ? { ...cfg.memberTabs } : {};

  if (accepted) {
    nextCols.push({
      email: cleanEmail,
      name: inviteeName || cleanEmail.split('@')[0],
      role: role || 'leer',
      status: 'accepted'
    });
    if (Array.isArray(allowedTabs) && allowedTabs.length > 0) {
      prevTabs[cleanEmail] = allowedTabs;
    } else if (!Object.prototype.hasOwnProperty.call(prevTabs, cleanEmail)) {
      prevTabs[cleanEmail] = normalizeAppOrigin(appOrigin) === 'arq'
        ? ['alcances', 'presupuesto', 'seguimiento', 'calendario', 'estimaciones']
        : ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora', 'almacen'];
    }
  } else {
    delete prevTabs[cleanEmail];
  }

  cfg.collaborators = nextCols;
  cfg.memberTabs = prevTabs;

  await sbRest(sb, `proyectos?id=eq.${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: { configuracion: cfg, updated_at: new Date().toISOString() }
  });
}

async function handleRespond(sb, callerUser, body) {
  const action = String(body.action || '').toLowerCase().trim();
  if (action !== 'accept' && action !== 'reject') {
    return { status: 400, data: { ok: false, error: 'Acción inválida (usa accept o reject).' } };
  }
  if (!callerUser || !callerUser.email) {
    return { status: 401, data: { ok: false, error: 'Inicia sesión para responder a esta invitación.' } };
  }
  if (!isUserEmailConfirmed(callerUser)) {
    return { status: 403, data: { ok: false, code: 'EMAIL_NOT_CONFIRMED', error: 'Debes confirmar tu correo electrónico antes de responder.' } };
  }

  const lookup = await lookupInviteByToken(sb, body.token);
  if (lookup.errorBody) return { status: lookup.errorStatus, data: lookup.errorBody };

  const row = lookup.row;
  const inviteeEmail = normalizeEmail(row.invitee_email);
  const callerEmail = normalizeEmail(callerUser.email);
  if (callerEmail !== inviteeEmail) {
    return {
      status: 403,
      data: {
        ok: false,
        code: 'WRONG_ACCOUNT',
        maskedEmail: maskEmailAddress(inviteeEmail),
        currentEmail: callerEmail,
        error: 'Acceso denegado: la sesión actual no coincide con el correo invitado.'
      }
    };
  }

  const appOrigin = normalizeAppOrigin(row.app_origin);
  const ownerEmail = normalizeEmail(row.owner_email);

  if (action === 'accept') {
    const seatCheck = await checkHostSeatLimit(sb, ownerEmail, inviteeEmail, row.proyecto_id, appOrigin);
    if (!seatCheck.allowed) {
      return { status: 403, data: { ok: false, limitReached: true, error: seatCheck.reason } };
    }
  }

  const nowIso = new Date().toISOString();
  const nextStatus = action === 'accept' ? 'accepted' : 'rejected';

  // Consumo atómico de un solo uso
  const claimRes = await sbRest(
    sb,
    `invitaciones?id=eq.${encodeURIComponent(row.id)}&token_hash=eq.${encodeURIComponent(lookup.tokenHash)}&estado=eq.pending&used_at=is.null`,
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { estado: nextStatus, used_at: nowIso, updated_at: nowIso }
    }
  );

  if (!claimRes.ok || !Array.isArray(claimRes.data) || claimRes.data.length !== 1) {
    return {
      status: 410,
      data: { ok: false, code: 'TOKEN_EXPIRED_OR_USED', error: 'Este enlace ya fue utilizado o expiró.' }
    };
  }

  const resolvedName = String(
    callerUser?.user_metadata?.full_name ||
    callerUser?.user_metadata?.name ||
    row.invitee_name ||
    inviteeEmail.split('@')[0]
  ).trim();

  if (action === 'accept') {
    await sbRest(sb, 'proyecto_colaboradores?on_conflict=proyecto_id,email_colaborador', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: {
        proyecto_id: row.proyecto_id,
        email_colaborador: inviteeEmail,
        nombre_colaborador: resolvedName,
        rol: ALLOWED_ROLES.has(row.rol) ? row.rol : 'leer',
        estado_invitacion: 'accepted',
        updated_at: nowIso
      }
    });
    await syncProjectConfigForDecision(sb, row.proyecto_id, inviteeEmail, resolvedName, row.rol, row.allowed_tabs, true, appOrigin);

    return {
      status: 200,
      data: {
        ok: true,
        action: 'accepted',
        invitationId: row.id,
        projectId: row.proyecto_id,
        projectName: row.proyecto_nombre || 'Proyecto',
        companyName: row.company_name || '',
        ownerEmail,
        ownerName: row.owner_name || ownerEmail,
        role: row.rol || 'leer',
        allowedTabs: Array.isArray(row.allowed_tabs) ? row.allowed_tabs : [],
        appOrigin
      }
    };
  }

  // Rechazo: marcar rejected en proyecto_colaboradores y liberar cupo en configuración
  await sbRest(
    sb,
    `proyecto_colaboradores?proyecto_id=eq.${encodeURIComponent(row.proyecto_id)}&email_colaborador=ilike.${encodeURIComponent(inviteeEmail)}`,
    {
      method: 'PATCH',
      body: { estado_invitacion: 'rejected', updated_at: nowIso }
    }
  );
  await syncProjectConfigForDecision(sb, row.proyecto_id, inviteeEmail, resolvedName, row.rol, [], false, appOrigin);

  return {
    status: 200,
    data: {
      ok: true,
      action: 'rejected',
      invitationId: row.id,
      projectId: row.proyecto_id,
      ownerEmail,
      inviteeEmail
    }
  };
}

async function handleList(sb, callerUser, body) {
  const projectId = String(body.projectId || '').trim();
  if (!UUID_RE.test(projectId)) {
    return { status: 400, data: { ok: false, error: 'UUID de proyecto inválido.' } };
  }
  const perm = await fetchProjectAndVerifyInviter(sb, projectId, callerUser);
  if (!perm.proj) return { status: 404, data: { ok: false, error: perm.reason } };
  if (!perm.allowed) return { status: 403, data: { ok: false, error: perm.reason } };

  const res = await sbRest(
    sb,
    `invitaciones?proyecto_id=eq.${encodeURIComponent(projectId)}&select=id,proyecto_id,proyecto_nombre,owner_email,owner_name,owner_plan_id,invitee_name,invitee_email,rol,allowed_tabs,estado,expires_at,app_origin,company_name,email_sent_at,used_at,created_at,updated_at&order=created_at.desc`
  );
  return { status: 200, data: { ok: true, invitations: Array.isArray(res.data) ? res.data : [] } };
}

async function handleRevoke(sb, callerUser, body) {
  const projectId = String(body.projectId || '').trim();
  const inviteId = String(body.inviteId || '').trim();
  if (!UUID_RE.test(projectId) || !inviteId) {
    return { status: 400, data: { ok: false, error: 'Parámetros incompletos para cancelar invitación.' } };
  }
  const perm = await fetchProjectAndVerifyInviter(sb, projectId, callerUser);
  if (!perm.proj) return { status: 404, data: { ok: false, error: perm.reason } };
  if (!perm.allowed) return { status: 403, data: { ok: false, error: perm.reason } };

  const nowIso = new Date().toISOString();
  const res = await sbRest(
    sb,
    `invitaciones?id=eq.${encodeURIComponent(inviteId)}&proyecto_id=eq.${encodeURIComponent(projectId)}&estado=eq.pending`,
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { estado: 'cancelled', used_at: nowIso, updated_at: nowIso }
    }
  );
  const cancelledRow = Array.isArray(res.data) ? res.data[0] : null;
  if (cancelledRow?.invitee_email) {
    const cleanEmail = normalizeEmail(cancelledRow.invitee_email);
    await sbRest(
      sb,
      `proyecto_colaboradores?proyecto_id=eq.${encodeURIComponent(projectId)}&email_colaborador=ilike.${encodeURIComponent(cleanEmail)}&estado_invitacion=eq.pending`,
      { method: 'DELETE' }
    );
  }
  return { status: 200, data: { ok: true, cancelled: Boolean(cancelledRow) } };
}

function resolveAction(req, body) {
  const pathname = String(req.url || '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  if (pathname.endsWith('/send')) return 'send';
  if (pathname.endsWith('/verify')) return 'verify';
  if (pathname.endsWith('/respond')) return 'respond';
  if (pathname.endsWith('/list')) return 'list';
  if (pathname.endsWith('/revoke')) return 'revoke';
  return String(body?.action || '').toLowerCase().trim();
}

export default async function handler(req, res) {
  const originAllowed = setCorsHeaders(req, res);
  if (req.headers.origin && !originAllowed) {
    return res.status(403).json({ ok: false, error: 'Origen no autorizado.' });
  }
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido. Utiliza POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'JSON inválido.' }); }
  }
  body = body || {};

  const sb = getSupabaseServerConfig();
  if (!sb.serviceRoleKey) {
    return res.status(503).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en el servidor.' });
  }

  const authHeader = req.headers.authorization || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const callerUser = jwt ? await verifyCallerJwt(sb, jwt) : null;

  const action = resolveAction(req, body);
  try {
    let out;
    if (action === 'verify') {
      out = await handleVerify(sb, callerUser, body);
    } else {
      if (!callerUser?.id || !callerUser?.email) {
        return res.status(401).json({ ok: false, error: 'Sesión autenticada requerida.' });
      }
      if (action === 'send') out = await handleSend(sb, callerUser, body);
      else if (action === 'respond') out = await handleRespond(sb, callerUser, body);
      else if (action === 'list') out = await handleList(sb, callerUser, body);
      else if (action === 'revoke') out = await handleRevoke(sb, callerUser, body);
      else out = { status: 400, data: { ok: false, error: `Acción no soportada: ${action}` } };
    }
    return res.status(out.status).json(out.data);
  } catch (err) {
    console.error('[api/invites]', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Error interno procesando invitación.' });
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  globalThis.process = globalThis.process || { env: {} };
  globalThis.process.env = { ...(globalThis.process.env || {}), ...(env || {}) };

  const headersObj = {};
  request.headers.forEach((value, key) => {
    headersObj[key.toLowerCase()] = value;
  });

  let body = {};
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    const rawText = await request.text().catch(() => '');
    if (rawText) {
      try { body = JSON.parse(rawText); } catch { body = rawText; }
    }
  }

  let statusCode = 200;
  const resHeaders = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  let responseBody = '';

  const req = { method: request.method, url: request.url, headers: headersObj, body };
  const res = {
    setHeader(k, v) { resHeaders.set(k, String(v)); },
    status(code) { statusCode = code; return this; },
    json(data) { responseBody = JSON.stringify(data); return this; },
    end(txt = '') { responseBody = txt || ''; return this; }
  };

  await handler(req, res);
  return new Response(statusCode === 204 || request.method === 'OPTIONS' ? null : responseBody, {
    status: statusCode,
    headers: resHeaders
  });
}
