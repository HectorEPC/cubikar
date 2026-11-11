// js/modules/ai/aiQuotaAndCacheService.js
// Servicio unificado de cuotas mensuales de IA (Estándar vs Google Search Grounding)
// y caché inteligente de precios de insumos para proteger la rentabilidad de Cubikar.

import { state } from '../../state/store.js';
import { getActiveProjectId } from '../../config/constants.js';
import { getSupabaseClient, isSupabaseConfigured } from '../../core/supabaseClient.js';
import { resolveWorkspacePlanContext } from '../portal/projectService.js';
import { getMonthlyAiQuotaUsage, recordAiUsageDetailed, syncMonthlyAiQuotaFromServer, getCurrentMonthKey } from '../admin/cubikarAdmin.js';
import { generateLocalMatrix } from './localMatrixEngine.js';
import { buildLocalGenerationContext } from './localEstimator.js';

export const STORAGE_KEY_SUPPLY_PRICE_CACHE = 'cubikar_insumo_price_cache_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
const MAX_CACHE_ENTRIES = 2500;

export function normalizeSupplyText(str = '') {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSupplyCacheKey(descripcion = '', unidad = '') {
  const d = normalizeSupplyText(descripcion);
  const u = normalizeSupplyText(unidad);
  return `${d}::${u}`;
}

function loadPriceCacheMap() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY_SUPPLY_PRICE_CACHE);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function savePriceCacheMap(map) {
  try {
    if (typeof localStorage === 'undefined') return;
    const keys = Object.keys(map || {});
    if (keys.length > MAX_CACHE_ENTRIES) {
      keys.sort((a, b) => (map[b]?.updatedAtMs || 0) - (map[a]?.updatedAtMs || 0));
      const trimmed = {};
      keys.slice(0, MAX_CACHE_ENTRIES).forEach(k => { trimmed[k] = map[k]; });
      localStorage.setItem(STORAGE_KEY_SUPPLY_PRICE_CACHE, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(STORAGE_KEY_SUPPLY_PRICE_CACHE, JSON.stringify(map));
  } catch (_) {}
}

export function getCachedSupplyPrice(descripcion, unidad = '') {
  const keyExact = normalizeSupplyCacheKey(descripcion, unidad);
  if (!keyExact || keyExact.startsWith('::')) return null;

  const map = loadPriceCacheMap();
  const now = Date.now();
  let entry = map[keyExact];

  // Fallback si la descripción exacta coincide con distinta unidad normalizada vacía
  if (!entry) {
    const keyDescOnly = normalizeSupplyCacheKey(descripcion, '');
    entry = map[keyDescOnly] || null;
  }

  if (!entry || !(Number(entry.precioUnitario) > 0)) return null;
  if (entry.updatedAtMs && (now - entry.updatedAtMs) > CACHE_TTL_MS) return null;
  return entry;
}

export function setCachedSupplyPrices(items = [], meta = {}) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const map = loadPriceCacheMap();
  const now = Date.now();
  let savedCount = 0;

  items.forEach(item => {
    const desc = String(item?.descripcion || '').trim();
    const unit = String(item?.unidad || '').trim();
    const precio = Number(item?.costoUnitario ?? item?.precioUnitario ?? item?.costo ?? 0);
    if (!desc || !(precio > 0)) return;

    const key = normalizeSupplyCacheKey(desc, unit);
    const existing = map[key];
    // No sobrescribir un precio de búsqueda web reciente con una estimación inferior salvo overwrite explícito
    if (existing && existing.usedWebSearch && !meta.usedWebSearch && !meta.overwrite && (now - existing.updatedAtMs) < CACHE_TTL_MS) {
      return;
    }

    const record = {
      descripcion: desc,
      unidad: unit,
      tipo: item?.tipo || meta.tipo || 'materiales',
      precioUnitario: Number(precio.toFixed(2)),
      moneda: meta.moneda || item?.moneda || 'MXN',
      fuente: meta.fuente || item?.fuente || (meta.usedWebSearch ? 'Google Search Grounding' : 'Gemini / Caché'),
      usedWebSearch: Boolean(meta.usedWebSearch),
      updatedAt: new Date(now).toISOString(),
      updatedAtMs: now
    };
    map[key] = record;
    // También indexar sin unidad para hits parciales si no existía
    const descKey = normalizeSupplyCacheKey(desc, '');
    if (!map[descKey] || meta.usedWebSearch) {
      map[descKey] = record;
    }
    savedCount++;
  });

  if (savedCount > 0) savePriceCacheMap(map);
  return savedCount;
}

export function getSupplyPriceCacheStats() {
  const map = loadPriceCacheMap();
  const keys = Object.keys(map);
  const webVerified = keys.filter(k => map[k]?.usedWebSearch).length;
  return { totalEntries: keys.length, webVerifiedEntries: webVerified };
}

/**
 * Busca precios ya existentes dentro de los insumos actuales del presupuesto abierto ($0 costo).
 */
export function findProjectSupplyPrice(treeNodes, descripcion, unidad = '') {
  const targetDesc = normalizeSupplyText(descripcion);
  const targetUnit = normalizeSupplyText(unidad);
  if (!targetDesc || !Array.isArray(treeNodes)) return null;

  let foundPrice = null;
  function walk(list) {
    for (const n of list) {
      if (Array.isArray(n.insumos)) {
        for (const ins of n.insumos) {
          const insDesc = normalizeSupplyText(ins.descripcion);
          const insUnit = normalizeSupplyText(ins.unidad);
          const p = Number(ins.costoUnitario ?? ins.precioUnitario ?? ins.costo ?? 0);
          if (p > 0 && insDesc === targetDesc && (!targetUnit || !insUnit || insUnit === targetUnit)) {
            foundPrice = p;
            return;
          }
        }
      }
      if (Array.isArray(n.children) && n.children.length > 0) {
        walk(n.children);
        if (foundPrice !== null) return;
      }
    }
  }
  walk(treeNodes);
  return foundPrice;
}

/**
 * Hidrata una matriz de insumos con precios guardados en el presupuesto activo o en caché local.
 */
export function enrichInsumosWithLocalAndCachePrices(insumos = [], treeNodes = state.treeData) {
  let cacheHits = 0;
  let webCacheHits = 0;
  const enriched = (Array.isArray(insumos) ? insumos : []).map(ins => {
    const copy = { ...ins };
    const cached = getCachedSupplyPrice(copy.descripcion, copy.unidad);
    if (cached && Number(cached.precioUnitario) > 0) {
      const cachedPrice = Number(cached.precioUnitario);
      copy.costoUnitario = cachedPrice;
      copy.precioUnitario = cachedPrice;
      copy.priceSource = cached.usedWebSearch ? 'cache_web' : 'cache_local';
      cacheHits++;
      if (cached.usedWebSearch) webCacheHits++;
    } else if (!(Number(copy.costoUnitario ?? copy.precioUnitario) > 0)) {
      const projPrice = findProjectSupplyPrice(treeNodes, copy.descripcion, copy.unidad);
      if (projPrice && projPrice > 0) {
        copy.costoUnitario = projPrice;
        copy.precioUnitario = projPrice;
        copy.priceSource = 'project_match';
        cacheHits++;
      }
    }
    return copy;
  });
  return { insumos: enriched, cacheHits, webCacheHits };
}

/**
 * Resuelve el contexto activo de plan, dueño, API key propia y consumos mensuales reales.
 */
export function resolveActiveAiExecutionContext(projectIdOverride = null, explicitApiKey = '') {
  const modalKey = typeof document !== 'undefined'
    ? (document.getElementById('ai-modal-api-key')?.value || '').trim()
    : '';
  const storedKey = (state.settings?.apiKey || '').trim();
  const ownApiKey = String(explicitApiKey || modalKey || storedKey || '').trim();

  const workspace = resolveWorkspacePlanContext(projectIdOverride || (typeof getActiveProjectId === 'function' ? getActiveProjectId() : null));
  const ownerEmail = workspace.ownerEmail || workspace.currentUserEmail || '';
  const usage = getMonthlyAiQuotaUsage(ownerEmail);

  return {
    projectId: workspace.projectId,
    ownerEmail,
    planId: workspace.planId || 'free',
    limits: workspace.limits,
    ownApiKey,
    usingOwnApiKey: Boolean(ownApiKey),
    usage
  };
}

/**
 * Valida cuota mensual de IA Estándar (10 Gratuita / 1,500 Plus / 3,500 Pro; o ilimitado con API Key propia).
 */
export function checkStandardAiQuota(requestedCount = 1, projectIdOverride = null, explicitApiKey = '') {
  const ctx = resolveActiveAiExecutionContext(projectIdOverride, explicitApiKey);
  const limit = Number(ctx.limits?.aiMonthlyConcepts ?? 10);
  const used = Number(ctx.usage?.aiStandardConcepts || 0);

  if (ctx.usingOwnApiKey) {
    return {
      allowed: true,
      usingOwnApiKey: true,
      used,
      limit,
      remaining: Infinity,
      ctx
    };
  }

  const remaining = Math.max(0, limit - used);
  const needed = Math.max(1, Number(requestedCount) || 1);
  if (remaining < needed) {
    return {
      allowed: false,
      partialAllowed: remaining > 0,
      limitReached: true,
      usingOwnApiKey: false,
      used,
      limit,
      remaining,
      ctx,
      reason: `Has alcanzado tu cuota mensual de IA Estándar (${used}/${limit} conceptos en Plan ${ctx.limits?.name || ctx.planId}). Ingresa tu propia Gemini API Key o actualiza tu suscripción para continuar.`
    };
  }

  return {
    allowed: true,
    usingOwnApiKey: false,
    used,
    limit,
    remaining,
    ctx
  };
}

/**
 * Valida cuota mensual global de Cotizador Web en Vivo con Google Search Grounding (0 Gratuita / 70 Plus / 200 Pro).
 */
export function checkWebSearchGroundingQuota(requestedQueries = 1, projectIdOverride = null, explicitApiKey = '') {
  const ctx = resolveActiveAiExecutionContext(projectIdOverride, explicitApiKey);
  const limit = Number(ctx.limits?.maxSearchQueries ?? 0);
  const used = Number(ctx.usage?.searchGroundingCalls || 0);

  if (ctx.usingOwnApiKey) {
    return {
      allowed: true,
      usingOwnApiKey: true,
      used,
      limit,
      remaining: Infinity,
      ctx
    };
  }

  if (limit <= 0) {
    return {
      allowed: false,
      limitReached: true,
      planRestricted: true,
      usingOwnApiKey: false,
      used,
      limit: 0,
      remaining: 0,
      ctx,
      reason: `Las consultas de Precios Web en Vivo (Google Search Grounding) no están incluidas en el Plan Gratuita (0/mes). Actualiza a Plus (70/mes) o Pro (200/mes), o ingresa tu propia Gemini API Key.`
    };
  }

  const remaining = Math.max(0, limit - used);
  const needed = Math.max(1, Number(requestedQueries) || 1);
  if (remaining < needed) {
    return {
      allowed: false,
      limitReached: true,
      usingOwnApiKey: false,
      used,
      limit,
      remaining,
      ctx,
      reason: `Has agotado tu cuota mensual de Precios Web en Vivo (${used}/${limit} consultas en Plan ${ctx.limits?.name || ctx.planId}). Actualiza a Plan Pro (200/mes) o usa tu propia API Key.`
    };
  }

  return {
    allowed: true,
    usingOwnApiKey: false,
    used,
    limit,
    remaining,
    ctx
  };
}

export function applyServerQuotaSnapshot(ownerEmail = '', quotaSnapshot = null) {
  if (!quotaSnapshot || typeof quotaSnapshot !== 'object') return null;
  const ctx = resolveActiveAiExecutionContext();
  const targetOwner = (ownerEmail || ctx.ownerEmail || '').toLowerCase().trim();
  if (!targetOwner) return null;
  return syncMonthlyAiQuotaFromServer(targetOwner, quotaSnapshot);
}

export async function syncAiQuotaFromSupabase() {
  try {
    const sb = getSupabaseClient();
    if (!sb || !isSupabaseConfigured()) return null;
    const { data: sessionData } = await sb.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user?.id) return null;
    const monthKey = getCurrentMonthKey();
    const { data, error } = await sb
      .from('consumo_mensual_ia')
      .select('standard_calls, search_grounding_calls, plan_id, month_key')
      .eq('user_id', user.id)
      .eq('month_key', monthKey)
      .maybeSingle();
    if (error || !data) return null;
    const userEmail = (user.email || '').toLowerCase().trim();
    return syncMonthlyAiQuotaFromServer(userEmail, {
      monthKey: data.month_key || monthKey,
      standardUsed: data.standard_calls,
      searchUsed: data.search_grounding_calls,
      planId: data.plan_id
    });
  } catch (_) {
    return null;
  }
}

/**
 * Registra consumo real de tokens (Input vs Output/Razonamiento), conceptos estándar y peticiones de Search Grounding.
 */
export function recordAiQuotaConsumption({
  ownerEmail = '',
  usageMetadata = null,
  standardConcepts = 0,
  searchGroundingCalls = 0,
  usedOwnApiKey = false,
  fallbackInputChars = 0,
  fallbackOutputChars = 0,
  quotaSnapshot = null
} = {}) {
  const ctx = resolveActiveAiExecutionContext();
  const targetOwner = (ownerEmail || ctx.ownerEmail || '').toLowerCase().trim();
  if (!targetOwner) return null;

  const inputTokens = Number(usageMetadata?.promptTokenCount) || Math.ceil(fallbackInputChars / 4);
  const candidatesTokens = Number(usageMetadata?.candidatesTokenCount) || Math.ceil(fallbackOutputChars / 4);
  const thoughtsTokens = Number(usageMetadata?.thoughtsTokenCount) || 0;

  const updated = recordAiUsageDetailed(targetOwner, {
    inputTokens,
    outputTokens: candidatesTokens,
    thoughtsTokens,
    standardConcepts,
    searchGroundingCalls,
    usedOwnApiKey
  });
  if (quotaSnapshot && !usedOwnApiKey) {
    syncMonthlyAiQuotaFromServer(targetOwner, quotaSnapshot);
  }
  return updated;
}

/**
 * Paso 1 de cascada de IA ($0 costo): intenta resolver con Motor Local + Caché de insumos + Presupuesto actual.
 */
export async function tryResolveConceptLocally(node, customCtx = null) {
  if (!node) return { matched: false, insumos: [] };
  const genCtx = customCtx || await buildLocalGenerationContext('all');
  const localResult = generateLocalMatrix(node, genCtx);

  const hasInsumos = Boolean(localResult && Array.isArray(localResult.insumos) && localResult.insumos.length > 0);
  const isStrongCopyMatch = hasInsumos && localResult.mode === 'copy';
  const isCleanScratchMatch = hasInsumos
    && localResult.mode === 'scratch'
    && localResult.family !== 'generic'
    && (!Array.isArray(localResult.unresolved) || localResult.unresolved.length === 0)
    && localResult.insumos.every(it => Number(it.costoUnitario) > 0);

  if (isStrongCopyMatch || isCleanScratchMatch) {
    const hydrated = enrichInsumosWithLocalAndCachePrices(localResult.insumos, state.treeData);
    return {
      matched: true,
      mode: localResult.mode,
      score: localResult.score || (isStrongCopyMatch ? 1 : 0.85),
      source: hydrated.webCacheHits > 0 ? 'local_engine_plus_web_cache' : 'local_engine',
      insumos: hydrated.insumos,
      cacheHits: hydrated.cacheHits
    };
  }

  return { matched: false, insumos: [] };
}

export function getAiQuotaBadgeSummary() {
  const ctx = resolveActiveAiExecutionContext();
  const cacheStats = getSupplyPriceCacheStats();
  if (ctx.usingOwnApiKey) {
    return {
      planId: ctx.planId,
      planName: ctx.limits?.name || 'Propia API Key',
      usingOwnApiKey: true,
      stdText: 'API Key Propia (Ilimitado)',
      webText: 'API Key Propia (Ilimitado)',
      cacheEntries: cacheStats.totalEntries
    };
  }
  const stdUsed = ctx.usage?.aiStandardConcepts || 0;
  const stdMax = ctx.limits?.aiMonthlyConcepts ?? 10;
  const webUsed = ctx.usage?.searchGroundingCalls || 0;
  const webMax = ctx.limits?.maxSearchQueries ?? 0;
  return {
    planId: ctx.planId,
    planName: ctx.limits?.name || ctx.planId,
    usingOwnApiKey: false,
    stdUsed,
    stdMax,
    webUsed,
    webMax,
    stdText: `IA Estándar: ${stdUsed}/${stdMax} este mes`,
    webText: `Web Search: ${webUsed}/${webMax} este mes`,
    cacheEntries: cacheStats.totalEntries
  };
}
