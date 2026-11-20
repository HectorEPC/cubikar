// Compatible con Cloudflare Pages Functions (Web Crypto API) y Node.js 18+

const DEFAULT_SUPABASE_URL = 'https://hxyzvxueoqvvjyehfpym.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXp2eHVlb3F2dmp5ZWhmcHltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMTYwODAsImV4cCI6MjEwOTY5MjA4MH0.q3P-_HZ11PP5dgCkAX7o5TZGqVAoqVv438W6coZiYeA';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Límites unificados de almacenamiento por plan (Total = Proyecto + Catálogo Maestro reservado).
 * Debe mantenerse sincronizado con js/services/storageQuotaService.js.
 */
export const PLAN_STORAGE_SPECS = {
  free: {
    planId: 'free',
    name: 'Gratuita',
    totalQuotaBytes: 200 * MB,
    catalogReservedBytes: 6 * MB,
    projectFilesCapBytes: (200 - 6) * MB,
    maxFileBytes: 5 * MB,
    maxMembers: 3
  },
  plus: {
    planId: 'plus',
    name: 'Plus',
    totalQuotaBytes: 2 * GB,
    catalogReservedBytes: 50 * MB,
    projectFilesCapBytes: (2 * GB) - (50 * MB),
    maxFileBytes: 15 * MB,
    maxMembers: 10
  },
  pro: {
    planId: 'pro',
    name: 'Pro',
    totalQuotaBytes: 5 * GB,
    catalogReservedBytes: 200 * MB,
    projectFilesCapBytes: (5 * GB) - (200 * MB),
    maxFileBytes: 25 * MB,
    maxMembers: 30
  }
};

const ALLOWED_MODULOS = new Set([
  'bitacora',
  'compras',
  'estimaciones',
  'reportes',
  'catalogos_maestros',
  'avatares',
  'branding',
  'otros'
]);

const ALLOWED_CATEGORIAS = new Set(['project_files', 'master_catalog', 'branding']);

const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'webp',
  'pdf', 'xml', 'xlsx', 'xls', 'csv', 'json', 'gz'
]);

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
  const allowedOrigin = isAllowedOrigin(origin);

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin ? (origin || 'https://cubikar.app') : 'https://const.cubikar.app');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return allowedOrigin;
}

function getAwsConfig() {
  const region = (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '').trim();
  const bucket = (process.env.AWS_S3_BUCKET || '').trim();
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const sessionToken = (process.env.AWS_SESSION_TOKEN || '').trim();
  const customEndpoint = (process.env.AWS_S3_ENDPOINT || '').trim();

  const configured = Boolean(region && bucket && accessKeyId && secretAccessKey);
  return { region, bucket, accessKeyId, secretAccessKey, sessionToken, customEndpoint, configured };
}

function getSupabaseServerConfig() {
  return {
    url: (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY,
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  };
}

function rfc3986Encode(str) {
  return encodeURIComponent(str).replace(/[!*'()]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase());
}

export function encodeS3Key(key) {
  return String(key || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => rfc3986Encode(segment))
    .join('/');
}

const textEncoder = new TextEncoder();

function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key, data) {
  const keyBytes = typeof key === 'string' ? textEncoder.encode(key) : key;
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(data));
  return new Uint8Array(sig);
}

async function sha256Hex(data) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(data));
  return bufferToHex(hash);
}

function formatAmzDates(now = new Date()) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

/**
 * Genera una URL prefirmada compatible con AWS Signature Version 4 usando Web Crypto API (Cloudflare Pages & Node).
 */
export async function buildPresignedS3Url({
  method = 'GET',
  bucket,
  region,
  accessKeyId,
  secretAccessKey,
  sessionToken = '',
  key,
  expiresIn = 300,
  now = new Date(),
  customEndpoint = '',
  responseContentDisposition = ''
}) {
  if (!bucket || !region || !accessKeyId || !secretAccessKey || !key) {
    throw new Error('Parámetros AWS S3 incompletos para generar firma SigV4.');
  }

  const httpMethod = String(method).toUpperCase();
  const safeExpires = Math.max(30, Math.min(3600, Math.floor(Number(expiresIn) || 300)));
  const { amzDate, dateStamp } = formatAmzDates(now);
  const encodedKey = encodeS3Key(key);

  let host;
  let canonicalUri;
  let baseUrlPrefix;

  if (customEndpoint) {
    const endpointUrl = new URL(customEndpoint);
    host = endpointUrl.host;
    canonicalUri = `/${rfc3986Encode(bucket)}/${encodedKey}`;
    baseUrlPrefix = `${endpointUrl.protocol}//${host}`;
  } else {
    host = `${bucket}.s3.${region}.amazonaws.com`;
    canonicalUri = `/${encodedKey}`;
    baseUrlPrefix = `https://${host}`;
  }

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(safeExpires),
    'X-Amz-SignedHeaders': 'host'
  };

  if (sessionToken) {
    queryParams['X-Amz-Security-Token'] = sessionToken;
  }

  if (httpMethod === 'GET' && responseContentDisposition) {
    queryParams['response-content-disposition'] = responseContentDisposition;
  }

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((paramKey) => `${rfc3986Encode(paramKey)}=${rfc3986Encode(queryParams[paramKey])}`)
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    httpMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const canonicalReqHash = await sha256Hex(canonicalRequest);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalReqHash
  ].join('\n');

  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signatureBytes = await hmacSha256(kSigning, stringToSign);
  const signature = bufferToHex(signatureBytes);

  return {
    url: `${baseUrlPrefix}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`,
    canonicalRequestHash: canonicalReqHash,
    credentialScope,
    expiresIn: safeExpires
  };
}

function sanitizeSegment(raw, fallback = 'item', maxLen = 60) {
  const cleaned = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
  return cleaned || fallback;
}

function sanitizeFileName(rawName) {
  const base = String(rawName || 'archivo')
    .split(/[\\/]/)
    .pop()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (base || 'archivo').slice(0, 120);
}

function extractExtension(fileName) {
  const parts = String(fileName || '').toLowerCase().split('.');
  return parts.length > 1 ? parts.pop().trim() : '';
}

function buildS3ObjectKey({ ownerEmail, proyectoId, modulo, fileName }) {
  const ownerSlug = sanitizeSegment(String(ownerEmail || '').replace('@', '_at_'), 'anon', 48);
  const projectSlug = sanitizeSegment(proyectoId || 'cuenta', 'cuenta', 48);
  const moduleSlug = ALLOWED_MODULOS.has(modulo) ? modulo : 'otros';
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const uid = globalThis.crypto.randomUUID().slice(0, 12);
  const safeName = sanitizeFileName(fileName);
  return `${ownerSlug}/${projectSlug}/${moduleSlug}/${ym}/${uid}-${safeName}`;
}

async function verifySupabaseJwt(token) {
  const sb = getSupabaseServerConfig();
  const res = await fetch(`${sb.url}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: sb.serviceRoleKey || sb.anonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

async function fetchHostQuotaUsage(ownerEmail, callerJwt) {
  const sb = getSupabaseServerConfig();
  const apiKey = sb.serviceRoleKey || sb.anonKey;
  const authBearer = callerJwt || sb.serviceRoleKey;

  const rpcRes = await fetch(`${sb.url}/rest/v1/rpc/obtener_consumo_almacen_anfitrion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${authBearer}`
    },
    body: JSON.stringify({ p_owner_email: ownerEmail })
  });

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    throw new Error(`No se pudo consultar cuota en Supabase (${rpcRes.status}): ${errText}`);
  }

  const rows = await rpcRes.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  const rawPlan = String(row?.plan_id || 'free').toLowerCase();
  const planKey = PLAN_STORAGE_SPECS[rawPlan] ? rawPlan : 'free';
  return {
    planId: planKey,
    spec: PLAN_STORAGE_SPECS[planKey],
    projectFilesBytes: Number(row?.project_files_bytes || 0),
    masterCatalogBytes: Number(row?.master_catalog_bytes || 0),
    totalBytes: Number(row?.total_bytes || 0),
    filesCount: Number(row?.files_count || 0)
  };
}

async function verifyStorageRecordAccess(s3Key, callerJwt) {
  const sb = getSupabaseServerConfig();
  const apiKey = sb.serviceRoleKey || sb.anonKey;
  const url = `${sb.url}/rest/v1/archivos_almacen?s3_key=eq.${encodeURIComponent(s3Key)}&deleted_at=is.null&select=id,owner_email,proyecto_id,s3_key,nombre_original,mime_type`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${callerJwt}`
    }
  });

  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function emailPrefixOf(email) {
  return sanitizeSegment(String(email || '').toLowerCase().trim().replace('@', '_at_'), 'anon', 48) + '/';
}

// El prefijo por correo solo identifica sin ambigüedad si la sanitización no alteró el correo
function isLosslessEmailPrefix(email) {
  const raw = String(email || '').toLowerCase().trim().replace('@', '_at_');
  return raw.length > 0 && raw.length <= 48 && sanitizeSegment(raw, 'anon', 48) === raw;
}

async function callerHasProjectAccess(proyectoId, callerJwt, roles = null) {
  const pid = String(proyectoId || '').trim();
  if (!pid) return false;
  const sb = getSupabaseServerConfig();
  try {
    const res = await fetch(`${sb.url}/rest/v1/rpc/check_user_project_access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sb.anonKey || sb.serviceRoleKey, Authorization: `Bearer ${callerJwt}` },
      body: JSON.stringify(roles ? { proj_id: pid, req_roles: roles } : { proj_id: pid })
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch (_) {
    return false;
  }
}

/**
 * Un registro de archivos_almacen solo autoriza la llave si:
 *  1) la llave S3 fue generada bajo el prefijo del dueño del registro (evita registros falsificados), y
 *  2) el solicitante es el dueño o miembro de la obra del registro (escritura para eliminar).
 */
async function isStorageRecordAuthorized(record, s3Key, callerEmail, callerJwt, needWrite = false) {
  if (!record) return false;
  const owner = String(record.owner_email || '').toLowerCase().trim();
  if (!owner || !s3Key.startsWith(emailPrefixOf(owner))) return false;
  if (owner === String(callerEmail || '').toLowerCase().trim()) return true;
  const roles = needWrite ? ['owner', 'admin', 'editar', 'escribir'] : null;
  return callerHasProjectAccess(record.proyecto_id, callerJwt, roles);
}

export function validateUploadQuota({ spec, projectFilesBytes, masterCatalogBytes, categoria, incomingBytes, originalBytes }) {
  if (!Number.isFinite(incomingBytes) || incomingBytes <= 0) {
    return { allowed: false, status: 400, reason: 'El tamaño del archivo debe ser mayor a 0 bytes.' };
  }

  const preCompressionBytes = Number(originalBytes || incomingBytes);
  if (preCompressionBytes > spec.maxFileBytes) {
    const maxMb = Math.round(spec.maxFileBytes / MB);
    return {
      allowed: false,
      status: 413,
      reason: `El archivo excede el límite individual de ${maxMb} MB para el plan ${spec.name}.`
    };
  }

  const isCatalog = categoria === 'master_catalog';
  const poolUsed = isCatalog ? masterCatalogBytes : projectFilesBytes;
  const poolLimit = isCatalog ? spec.catalogReservedBytes : spec.projectFilesCapBytes;
  const projectedPool = poolUsed + incomingBytes;

  if (projectedPool > poolLimit) {
    return {
      allowed: false,
      status: 413,
      reason: isCatalog
        ? `Espacio reservado para Catálogo Maestro agotado (${Math.round(spec.catalogReservedBytes / MB)} MB en plan ${spec.name}).`
        : `Cuota de almacenamiento de proyectos alcanzada en el plan ${spec.name}. Libera espacio o actualiza tu plan.`
    };
  }

  return {
    allowed: true,
    usagePctAfter: Math.round((projectedPool / poolLimit) * 1000) / 10
  };
}

export default async function handler(req, res) {
  const originAllowed = setCorsHeaders(req, res);

  if (req.headers.origin && !originAllowed) {
    return res.status(403).json({ error: 'Acceso no autorizado desde este origen.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Cuerpo JSON inválido.' });
    }
  }
  body = body || {};

  const action = String(body.action || 'upload').toLowerCase();
  const aws = getAwsConfig();

  if (action === 'status') {
    return res.status(200).json({
      configured: aws.configured,
      region: aws.configured ? aws.region : null,
      bucket: aws.configured ? aws.bucket : null
    });
  }

  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Se requiere sesión iniciada en Supabase para operar con AWS S3.' });
  }

  const callerUser = await verifySupabaseJwt(token);
  if (!callerUser || !callerUser.email) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }

  if (!aws.configured) {
    return res.status(503).json({
      error: 'AWS S3 aún no está configurado en el servidor (variables AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY pendientes).',
      code: 'S3_NOT_CONFIGURED'
    });
  }

  try {
    if (action === 'upload') {
      const fileName = String(body.fileName || '').trim();
      const mimeType = String(body.mimeType || 'application/octet-stream').trim();
      const modulo = String(body.modulo || 'otros').trim();
      const categoria = ALLOWED_CATEGORIAS.has(body.categoria)
        ? body.categoria
        : (modulo === 'catalogos_maestros' ? 'master_catalog' : (modulo === 'branding' || modulo === 'avatares' ? 'branding' : 'project_files'));
      const proyectoId = String(body.proyectoId || '').trim();
      const callerEmailLower = String(callerUser.email || '').trim().toLowerCase();
      let ownerEmail = String(body.ownerEmail || callerEmailLower).trim().toLowerCase();
      if (ownerEmail !== callerEmailLower) {
        // Subir al espacio de otro anfitrión solo si el solicitante edita una obra de ESE anfitrión
        let allowedForHost = false;
        if (proyectoId && await callerHasProjectAccess(proyectoId, token, ['owner', 'admin', 'editar', 'escribir'])) {
          try {
            const sbCfg = getSupabaseServerConfig();
            const pr = await fetch(`${sbCfg.url}/rest/v1/proyectos?id=eq.${encodeURIComponent(proyectoId)}&select=owner_email&limit=1`, {
              headers: { apikey: sbCfg.anonKey || sbCfg.serviceRoleKey, Authorization: `Bearer ${token}` }
            });
            const rows = pr.ok ? await pr.json() : [];
            allowedForHost = Array.isArray(rows) && rows.length > 0 && String(rows[0].owner_email || '').toLowerCase().trim() === ownerEmail;
          } catch (_) {
            allowedForHost = false;
          }
        }
        if (!allowedForHost) {
          return res.status(403).json({ error: 'No tienes permiso para subir archivos al espacio de otro usuario.' });
        }
      }
      const fileSizeBytes = Number(body.fileSizeBytes || 0);
      const originalBytes = Number(body.originalBytes || fileSizeBytes);
      const ext = extractExtension(fileName);

      if (!fileName || !ALLOWED_MODULOS.has(modulo)) {
        return res.status(400).json({ error: 'Parámetros de archivo o módulo inválidos.' });
      }
      if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
        return res.status(400).json({ error: `Extensión .${ext || '?'} no permitida en el almacenamiento seguro.` });
      }

      const usage = await fetchHostQuotaUsage(ownerEmail, token);
      const check = validateUploadQuota({
        spec: usage.spec,
        projectFilesBytes: usage.projectFilesBytes,
        masterCatalogBytes: usage.masterCatalogBytes,
        categoria,
        incomingBytes: fileSizeBytes,
        originalBytes
      });

      if (!check.allowed) {
        return res.status(check.status).json({ error: check.reason, code: 'QUOTA_EXCEEDED', usage });
      }

      const s3Key = buildS3ObjectKey({ ownerEmail, proyectoId, modulo, fileName });
      const signed = await buildPresignedS3Url({
        method: 'PUT',
        bucket: aws.bucket,
        region: aws.region,
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
        sessionToken: aws.sessionToken,
        customEndpoint: aws.customEndpoint,
        key: s3Key,
        expiresIn: 300
      });

      return res.status(200).json({
        uploadUrl: signed.url,
        method: 'PUT',
        s3Key,
        bucket: aws.bucket,
        region: aws.region,
        expiresIn: signed.expiresIn,
        headers: {
          'Content-Type': mimeType
        },
        quota: {
          planId: usage.planId,
          usagePctAfter: check.usagePctAfter,
          warning90: check.usagePctAfter >= 90
        }
      });
    }

    if (action === 'download') {
      const s3Key = String(body.s3Key || '').trim().replace(/^\/+/, '');
      if (!s3Key || s3Key.includes('..') || s3Key.startsWith('_respaldos_servidor/')) {
        return res.status(400).json({ error: 's3Key inválido.' });
      }

      const record = await verifyStorageRecordAccess(s3Key, token);
      const recordOk = await isStorageRecordAuthorized(record, s3Key, callerUser.email, token, false);
      const ownPrefixOk = isLosslessEmailPrefix(callerUser.email) && s3Key.startsWith(emailPrefixOf(callerUser.email));
      if (!recordOk && !ownPrefixOk) {
        return res.status(403).json({ error: 'No tienes permiso para descargar este archivo.' });
      }

      const disposition = body.download && record?.nombre_original
        ? `attachment; filename="${sanitizeFileName(record.nombre_original)}"`
        : '';

      const signed = await buildPresignedS3Url({
        method: 'GET',
        bucket: aws.bucket,
        region: aws.region,
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
        sessionToken: aws.sessionToken,
        customEndpoint: aws.customEndpoint,
        key: s3Key,
        expiresIn: 900,
        responseContentDisposition: disposition
      });

      return res.status(200).json({
        downloadUrl: signed.url,
        s3Key,
        expiresIn: signed.expiresIn,
        method: 'GET'
      });
    }

    if (action === 'delete') {
      const s3Key = String(body.s3Key || '').trim().replace(/^\/+/, '');
      if (!s3Key || s3Key.includes('..') || s3Key.startsWith('_respaldos_servidor/')) {
        return res.status(400).json({ error: 's3Key inválido.' });
      }

      const record = await verifyStorageRecordAccess(s3Key, token);
      const recordOk = await isStorageRecordAuthorized(record, s3Key, callerUser.email, token, true);
      const ownPrefixOk = isLosslessEmailPrefix(callerUser.email) && s3Key.startsWith(emailPrefixOf(callerUser.email));
      if (!recordOk && !ownPrefixOk) {
        return res.status(403).json({ error: 'No tienes permiso para eliminar este archivo de S3.' });
      }

      const signedDelete = await buildPresignedS3Url({
        method: 'DELETE',
        bucket: aws.bucket,
        region: aws.region,
        accessKeyId: aws.accessKeyId,
        secretAccessKey: aws.secretAccessKey,
        sessionToken: aws.sessionToken,
        customEndpoint: aws.customEndpoint,
        key: s3Key,
        expiresIn: 120
      });

      const s3DelRes = await fetch(signedDelete.url, { method: 'DELETE' });
      if (!s3DelRes.ok && s3DelRes.status !== 204 && s3DelRes.status !== 404) {
        const errBody = await s3DelRes.text();
        return res.status(502).json({ error: `AWS S3 rechazó la eliminación (${s3DelRes.status}): ${errBody}` });
      }

      return res.status(200).json({
        ok: true,
        deleted: true,
        s3Key
      });
    }

    return res.status(400).json({ error: `Acción no soportada: ${action}` });
  } catch (err) {
    console.error('[api/s3-presign]', err);
    return res.status(500).json({ error: err?.message || 'Error interno generando firma S3.' });
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
