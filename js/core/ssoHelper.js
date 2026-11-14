// js/core/ssoHelper.js
// Utilidades compartidas de Single Sign-On (SSO) entre cubikar.app, const.cubikar.app y arq.cubikar.app

export const CUBIKAR_SSO_COOKIE_NAME = 'cubikar_sso_v1';
export const STORAGE_KEY_LAST_SIGNOUT_TS = 'cubikar_last_signout_ts';

const HASH_AT_KEY = 'cubikar_sso_at';
const HASH_RT_KEY = 'cubikar_sso_rt';
const HASH_REMEMBER_KEY = 'cubikar_sso_remember';

function isCubikarDomainHost() {
  if (typeof window === 'undefined') return false;
  const host = (window.location?.hostname || '').toLowerCase();
  return host === 'cubikar.app' || host.endsWith('.cubikar.app');
}

function getSsoCookieAttributes({ includeDomain = true } = {}) {
  if (typeof window === 'undefined') return '; path=/; SameSite=Lax';
  const useDomain = includeDomain && isCubikarDomainHost();
  const domainPart = useDomain ? '; domain=.cubikar.app' : '';
  const securePart = window.location?.protocol === 'https:' ? '; Secure' : '';
  return `${domainPart}; path=/; SameSite=Lax${securePart}`;
}

export function getLastSignOutTimestamp() {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem(STORAGE_KEY_LAST_SIGNOUT_TS) || '0') || 0;
  } catch (_) {
    return 0;
  }
}

export function writeSharedSsoCookie(session, maxAgeSeconds = 7 * 24 * 60 * 60) {
  if (typeof document === 'undefined' || !session?.refresh_token) return false;
  try {
    const email = (session.user?.email || '').toLowerCase().trim();
    const ts = Date.now();
    const fullPayload = {
      at: session.access_token || '',
      rt: session.refresh_token,
      ts,
      email
    };
    let encoded = encodeURIComponent(JSON.stringify(fullPayload));
    if (encoded.length > 3600) {
      encoded = encodeURIComponent(JSON.stringify({ rt: session.refresh_token, ts, email }));
    }
    const attrs = getSsoCookieAttributes({ includeDomain: true });
    document.cookie = `${CUBIKAR_SSO_COOKIE_NAME}=${encoded}; max-age=${maxAgeSeconds}${attrs}`;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_LAST_SIGNOUT_TS);
      }
    } catch (_) {}
    return true;
  } catch (_) {
    return false;
  }
}

export function clearSharedSsoCookie({ markSignOut = true } = {}) {
  if (markSignOut && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_SIGNOUT_TS, String(Date.now()));
    } catch (_) {}
  }
  if (typeof document === 'undefined') return;
  try {
    const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT; max-age=0';
    document.cookie = `${CUBIKAR_SSO_COOKIE_NAME}=; ${expired}${getSsoCookieAttributes({ includeDomain: false })}`;
    if (isCubikarDomainHost()) {
      document.cookie = `${CUBIKAR_SSO_COOKIE_NAME}=; ${expired}${getSsoCookieAttributes({ includeDomain: true })}`;
    }
  } catch (_) {}
}

export function readSharedSsoCookie() {
  if (typeof document === 'undefined' || !document.cookie) return null;
  try {
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const name = part.slice(0, idx).trim();
      if (name !== CUBIKAR_SSO_COOKIE_NAME) continue;
      const rawVal = part.slice(idx + 1).trim();
      if (!rawVal) return null;
      const parsed = JSON.parse(decodeURIComponent(rawVal));
      if (parsed && (parsed.rt || parsed.at)) {
        return {
          accessToken: parsed.at || '',
          refreshToken: parsed.rt || '',
          ts: Number(parsed.ts || 0) || 0,
          email: (parsed.email || '').toLowerCase().trim()
        };
      }
    }
  } catch (_) {}
  return null;
}

export function readLocalSupabaseTokens() {
  if (typeof localStorage === 'undefined') return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-.*-auth-token$/i.test(k)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const sessionObj = parsed?.currentSession || parsed?.session || parsed;
      const at = sessionObj?.access_token || '';
      const rt = sessionObj?.refresh_token || '';
      if (at && rt) {
        return { accessToken: at, refreshToken: rt, email: (sessionObj?.user?.email || '').toLowerCase().trim() };
      }
    }
  } catch (_) {}
  return null;
}

export function extractIncomingSsoFromHash() {
  if (typeof window === 'undefined' || !window.location?.hash) return null;
  try {
    const rawHash = window.location.hash.replace(/^#/, '');
    if (!rawHash.includes(HASH_AT_KEY) && !rawHash.includes(HASH_RT_KEY)) return null;
    const params = new URLSearchParams(rawHash);
    const accessToken = params.get(HASH_AT_KEY) || '';
    const refreshToken = params.get(HASH_RT_KEY) || '';
    if (!accessToken || !refreshToken) return null;
    const rememberParam = params.get(HASH_REMEMBER_KEY);
    return {
      accessToken,
      refreshToken,
      remember: rememberParam !== '0',
      fromHash: true
    };
  } catch (_) {
    return null;
  }
}

export function scrubSsoHashParams() {
  if (typeof window === 'undefined' || !window.history?.replaceState || !window.location?.hash) return;
  try {
    const rawHash = window.location.hash.replace(/^#/, '');
    if (!rawHash.includes(HASH_AT_KEY) && !rawHash.includes(HASH_RT_KEY)) return;
    const params = new URLSearchParams(rawHash);
    params.delete(HASH_AT_KEY);
    params.delete(HASH_RT_KEY);
    params.delete(HASH_REMEMBER_KEY);
    const remaining = params.toString();
    const nextUrl = window.location.pathname + window.location.search + (remaining ? `#${remaining}` : '');
    window.history.replaceState(null, document.title, nextUrl);
  } catch (_) {}
}

export function hasPendingIncomingSso(hasLocalUser = false) {
  if (extractIncomingSsoFromHash()) {
    return true;
  }
  if (typeof window !== 'undefined' && window.location?.hash?.includes('access_token=') && !window.location.hash.includes('type=recovery')) {
    return true;
  }
  if (hasLocalUser) return false;
  const cookieTokens = readSharedSsoCookie();
  if (!cookieTokens || !cookieTokens.refreshToken) return false;
  const lastSignOutTs = getLastSignOutTimestamp();
  if (lastSignOutTs > 0 && cookieTokens.ts > 0 && cookieTokens.ts <= lastSignOutTs) {
    return false;
  }
  return true;
}

export function buildSsoTargetUrl(targetUrl, tokens, remember = true) {
  if (!targetUrl || targetUrl === '#') return targetUrl;
  const baseUrl = String(targetUrl).split('#')[0];
  if (!tokens?.access_token && !tokens?.accessToken) return baseUrl;
  const at = tokens.access_token || tokens.accessToken;
  const rt = tokens.refresh_token || tokens.refreshToken;
  if (!at || !rt) return baseUrl;
  const rememberFlag = remember === false ? '0' : '1';
  const ssoHash = new URLSearchParams({
    [HASH_AT_KEY]: at,
    [HASH_RT_KEY]: rt,
    [HASH_REMEMBER_KEY]: rememberFlag
  }).toString();
  return `${baseUrl}#${ssoHash}`;
}

export function appendSsoToUrlFromStorage(targetUrl, remember = null) {
  if (!targetUrl || targetUrl === '#') return targetUrl;
  const tokens = readLocalSupabaseTokens() || readSharedSsoCookie();
  if (!tokens) return targetUrl;
  let effectiveRemember = remember;
  if (effectiveRemember === null && typeof localStorage !== 'undefined') {
    const pref = localStorage.getItem('cubikar_remember_device');
    effectiveRemember = pref === null ? true : pref === 'true';
  }
  return buildSsoTargetUrl(targetUrl, tokens, effectiveRemember !== false);
}
