// js/modules/ai/insumoAiPricing.js
// Servicio de actualizaciÃ³n y cotizaciÃ³n de precios de insumos con Inteligencia Artificial
// Soporta Google Gemini con Google Search Grounding y base de datos de mercado local en MÃ©xico

import { state } from '../../state/store.js?v=20261116_cf3';
import { round2 } from '../../core/formatters.js?v=20261116_cf3';
import { getSupabaseClient } from '../../core/supabaseClient.js?v=20261116_cf3';
import {
  getCachedSupplyPrice,
  setCachedSupplyPrices,
  checkStandardAiQuota,
  checkWebSearchGroundingQuota,
  recordAiQuotaConsumption,
  applyServerQuotaSnapshot
} from './aiQuotaAndCacheService.js?v=20261116_cf3';

// Base de datos de referencia de precios de mercado de construcciÃ³n en MÃ©xico (en Pesos Mexicanos MXN)
const TABULADOR_MERCADO_MEXICO = [
  // Cemento, Concretos, Morteros y Agregados
  { regex: /cemento\s+gris|cemento\s+portland|cemento\s+cpc/i, price: 235.00, unidad: 'bulto', unitPrice: 4.70, fuente: 'Cemex / Holcim MÃ©xico' },
  { regex: /cemento\s+blanco/i, price: 340.00, unidad: 'bulto', unitPrice: 6.80, fuente: 'Cemex Blanco' },
  { regex: /cal\s+hidratada|calhidra/i, price: 95.00, unidad: 'bulto', unitPrice: 3.80, fuente: 'Calidra MÃ©xico' },
  { regex: /arena\s+(?:de\s+)?mina|arena\s+azul/i, price: 420.00, unidad: 'm3', unitPrice: 420.00, fuente: 'Agregados Nacionales' },
  { regex: /grava\s+(?:de\s+)?(?:mina|triturada|3\/4)/i, price: 460.00, unidad: 'm3', unitPrice: 460.00, fuente: 'Agregados Nacionales' },
  { regex: /concreto\s+premezclado\s+f'c\s*=\s*250/i, price: 2480.00, unidad: 'm3', unitPrice: 2480.00, fuente: 'Concreteras MÃ©xico' },
  { regex: /concreto\s+premezclado\s+f'c\s*=\s*200/i, price: 2320.00, unidad: 'm3', unitPrice: 2320.00, fuente: 'Concreteras MÃ©xico' },
  { regex: /concreto\s+premezclado\s+f'c\s*=\s*150/i, price: 2150.00, unidad: 'm3', unitPrice: 2150.00, fuente: 'Concreteras MÃ©xico' },
  { regex: /agua\s+en\s+pipa|agua\s+para\s+obra/i, price: 95.00, unidad: 'm3', unitPrice: 95.00, fuente: 'Pipas Locales' },

  // Aceros y Mallas
  { regex: /varilla\s+(?:corrugada\s+)?(?:#3|3\/8)/i, price: 178.00, unidad: 'tramo', unitPrice: 25.80, fuente: 'Ternium / Deacero' },
  { regex: /varilla\s+(?:corrugada\s+)?(?:#4|1\/2)/i, price: 315.00, unidad: 'tramo', unitPrice: 25.80, fuente: 'Ternium / Deacero' },
  { regex: /varilla\s+(?:corrugada\s+)?(?:#5|5\/8)/i, price: 492.00, unidad: 'tramo', unitPrice: 25.80, fuente: 'Ternium / Deacero' },
  { regex: /varilla\s+corrugada/i, price: 25.80, unidad: 'kg', unitPrice: 25.80, fuente: 'Acereras MÃ©xico' },
  { regex: /alambr(?:Ã³|o)n\s+(?:1\/4|de\s+acero)/i, price: 26.50, unidad: 'kg', unitPrice: 26.50, fuente: 'Deacero MÃ©xico' },
  { regex: /alambre\s+recocido/i, price: 28.50, unidad: 'kg', unitPrice: 28.50, fuente: 'Deacero MÃ©xico' },
  { regex: /malla\s+electrosoldada\s+6-6\/10-10/i, price: 42.00, unidad: 'm2', unitPrice: 42.00, fuente: 'Deacero MÃ©xico' },
  { regex: /clavo\s+para\s+concreto|clavo\s+estandar/i, price: 36.00, unidad: 'kg', unitPrice: 36.00, fuente: 'FerreterÃ­as MÃ©xico' },

  // Muros, Tabiques y Blocks
  { regex: /tabique\s+rojo\s+recocido/i, price: 4.80, unidad: 'pza', unitPrice: 4.80, fuente: 'Tabiqueras MÃ©xico' },
  { regex: /block\s+(?:pesado\s+)?12x20x40|block\s+hueco/i, price: 16.50, unidad: 'pza', unitPrice: 16.50, fuente: 'Bloqueras MÃ©xico' },
  { regex: /block\s+(?:pesado\s+)?15x20x40/i, price: 18.50, unidad: 'pza', unitPrice: 18.50, fuente: 'Bloqueras MÃ©xico' },
  { regex: /yeso\s+(?:construccion|supremo)/i, price: 125.00, unidad: 'bulto', unitPrice: 3.10, fuente: 'Yesera Monterrey' },
  { regex: /pega\s+azulejo|pega\s+piso|adhesivo\s+ceramico/i, price: 165.00, unidad: 'bulto', unitPrice: 8.25, fuente: 'Crest / Bexel' },

  // Maderas y Cimbras
  { regex: /duela\s+de\s+pino|triplay\s+de\s+pino\s+16\s*mm/i, price: 680.00, unidad: 'hoja', unitPrice: 230.00, fuente: 'MadererÃ­as MÃ©xico' },
  { regex: /madera\s+para\s+cimbra|polin\s+de\s+pino|barrote/i, price: 24.50, unidad: 'pt', unitPrice: 24.50, fuente: 'MadererÃ­as MÃ©xico' },
  { regex: /diesel\s+para\s+cimbra|desmoldante/i, price: 48.00, unidad: 'lt', unitPrice: 48.00, fuente: 'Proveedores Obra' },

  // Pinturas e Impermeabilizantes
  { regex: /pintura\s+vinilica|pintura\s+acrilica/i, price: 1650.00, unidad: 'cubeta', unitPrice: 86.80, fuente: 'Comex / Berel' },
  { regex: /sellador\s+vinilico/i, price: 780.00, unidad: 'cubeta', unitPrice: 41.00, fuente: 'Comex MÃ©xico' },
  { regex: /impermeabilizante\s+acrilico\s+5\s+a(?:Ã±|n)os/i, price: 1850.00, unidad: 'cubeta', unitPrice: 97.30, fuente: 'Fester / Sika MÃ©xico' },

  // Instalaciones (Tubos y Cables)
  { regex: /tubo\s+pvc\s+hidraulico\s+1\/2/i, price: 145.00, unidad: 'tramo', unitPrice: 24.16, fuente: 'Amanco / Tuboplus' },
  { regex: /tubo\s+pvc\s+sanitario\s+4/i, price: 340.00, unidad: 'tramo', unitPrice: 56.66, fuente: 'Amanco / Cresco' },
  { regex: /tubo\s+cobre\s+tipo\s+m\s+1\/2/i, price: 420.00, unidad: 'tramo', unitPrice: 70.00, fuente: 'Nacobre MÃ©xico' },
  { regex: /cable\s+thw\s+calibre\s+12/i, price: 14.50, unidad: 'm', unitPrice: 14.50, fuente: 'Condumex / Iusa' },
  { regex: /cable\s+thw\s+calibre\s+10/i, price: 21.00, unidad: 'm', unitPrice: 21.00, fuente: 'Condumex / Iusa' },

  // Mano de Obra (Jornadas con Factor de Salario Real FSR en MÃ©xico)
  { regex: /pe(?:Ã³|o)n/i, price: 580.00, unidad: 'jor', unitPrice: 580.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /ayudante\s+general/i, price: 620.00, unidad: 'jor', unitPrice: 620.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /oficial\s+alba(?:Ã±|n)il/i, price: 920.00, unidad: 'jor', unitPrice: 920.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /oficial\s+fierrero/i, price: 940.00, unidad: 'jor', unitPrice: 940.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /oficial\s+carpintero\s+(?:de\s+obra\s+negra)?/i, price: 930.00, unidad: 'jor', unitPrice: 930.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /oficial\s+electricista/i, price: 960.00, unidad: 'jor', unitPrice: 960.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /oficial\s+plomero|fontanero/i, price: 950.00, unidad: 'jor', unitPrice: 950.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /oficial\s+pintor/i, price: 890.00, unidad: 'jor', unitPrice: 890.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /cabo\s+de\s+oficios/i, price: 1100.00, unidad: 'jor', unitPrice: 1100.00, fuente: 'Tabulador CMIC FSR' },
  { regex: /cuadrilla/i, price: 1680.00, unidad: 'jor', unitPrice: 1680.00, fuente: 'Tabulador CMIC FSR' },

  // Maquinaria y Equipo (Renta horaria o por jornada en MÃ©xico)
  { regex: /revolvedora\s+(?:de\s+concreto\s+)?1\s+saco/i, price: 85.00, unidad: 'hr', unitPrice: 85.00, fuente: 'Arrendadoras MÃ©xico' },
  { regex: /vibrador\s+(?:para\s+concreto)?/i, price: 65.00, unidad: 'hr', unitPrice: 65.00, fuente: 'Arrendadoras MÃ©xico' },
  { regex: /bailarina|compactador\s+de\s+impacto/i, price: 95.00, unidad: 'hr', unitPrice: 95.00, fuente: 'Arrendadoras MÃ©xico' },
  { regex: /retroexcavadora\s+cat|retroexcavadora/i, price: 780.00, unidad: 'hr', unitPrice: 780.00, fuente: 'Maquinaria Pesada MÃ©xico' },
  { regex: /camion\s+volteo\s+7\s*m3/i, price: 550.00, unidad: 'hr', unitPrice: 550.00, fuente: 'Sindicatos / Transportes' },
  { regex: /andamio\s+tubular\s+con\s+plataformas/i, price: 35.00, unidad: 'dia', unitPrice: 35.00, fuente: 'Andamios Monterrey' },
  { regex: /herramienta\s+menor/i, price: 0.03, unidad: '%mo', unitPrice: 0.03, fuente: 'Normativa Neodata / Opus' }
];

// Extractor seguro de JSON
function extractJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) {
      try { return JSON.parse(match[1]); } catch (e2) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (e3) {}
    }
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try { return JSON.parse(text.substring(firstBracket, lastBracket + 1)); } catch (e4) {}
    }
    return null;
  }
}

// Estimar costo local con base de datos de mercado en MÃ©xico
export function estimarCostoInsumoLocal(tipo, descripcion, unidad, costoActual = 0) {
  const desc = (descripcion || '').toLowerCase().trim();
  const un = (unidad || '').toLowerCase().trim();

  // 1. Coincidencia exacta o por patrÃ³n en Tabulador de Mercado
  for (const item of TABULADOR_MERCADO_MEXICO) {
    if (item.regex.test(desc)) {
      // Ajuste de unidades si es necesario
      let p = item.unitPrice;
      if (un.includes('kg') && item.unidad.includes('bulto')) {
        p = round2(item.price / 50); // bulto a kg
      } else if (un.includes('ton') && item.unitPrice) {
        p = round2(item.unitPrice * 1000);
      } else if (un.includes('m') && item.unidad.includes('tramo')) {
        p = round2(item.price / 6); // tramo de 6m
      } else {
        p = item.unitPrice || item.price;
      }
      return {
        precio: round2(p),
        fuente: item.fuente,
        justificacion: `CotizaciÃ³n de referencia de mercado en MÃ©xico para ${item.unidad}`
      };
    }
  }

  // 2. Si tiene costo previo, aplicar factor de actualizaciÃ³n inflacionaria moderada (3.5% anual)
  if (costoActual > 0) {
    const updated = round2(costoActual * 1.045);
    return {
      precio: updated,
      fuente: 'IndexaciÃ³n de mercado CMIC / Neodata (+4.5%)',
      justificacion: 'Ajuste inflacionario sobre el costo histÃ³rico registrado'
    };
  }

  // 3. EstimaciÃ³n heurÃ­stica por tipo y unidad
  if (tipo === 'Mano de Obra') {
    return {
      precio: un.includes('hr') ? 115.00 : 750.00,
      fuente: 'Tabulador de Salarios de ConstrucciÃ³n (FSR)',
      justificacion: 'Costo promedio de jornada en obra'
    };
  } else if (tipo === 'Equipo') {
    return {
      precio: un.includes('%') ? 0.03 : (un.includes('hr') ? 120.00 : 350.00),
      fuente: 'Arrendadoras de Maquinaria y Equipo Ligero',
      justificacion: 'Renta horaria promedio de equipo de construcciÃ³n'
    };
  } else {
    return {
      precio: 85.00,
      fuente: 'Base de Precios Comerciales de ConstrucciÃ³n',
      justificacion: 'Precio estimado de suministro puesto en obra'
    };
  }
}

// Consultar Google Gemini para estimar precio unitario de un insumo
// Por defecto (useWebSearch = false): usa CachÃ© -> Gemini Flash SIN Google Search Grounding.
// Si useWebSearch = true: ejecuta consulta explÃ­cita de Precios Web en Vivo validando cuota mensual (0/70/200).
export async function queryGeminiParaInsumo(insumo, apiKey = '', options = {}) {
  if (!insumo || !insumo.descripcion) return null;
  const useWebSearch = Boolean(options?.useWebSearch === true);

  // 1. Revisar cachÃ© de precios ($0 costo) cuando no se pide bÃºsqueda web en vivo forzada
  if (!useWebSearch) {
    const cached = getCachedSupplyPrice(insumo.descripcion, insumo.unidad);
    if (cached && cached.precioUnitario > 0) {
      return {
        precio: round2(cached.precioUnitario),
        fuente: `${cached.fuente || 'CachÃ© Cubikar'} (CachÃ©)`,
        justificacion: 'Precio reutilizado desde cachÃ© local sin gasto de IA.',
        cachedHit: true
      };
    }
  }

  const quotaCheck = useWebSearch
    ? checkWebSearchGroundingQuota(1, null, apiKey)
    : checkStandardAiQuota(1, null, apiKey);

  if (!quotaCheck.allowed) {
    return {
      blockedByQuota: true,
      error: quotaCheck.reason,
      precio: 0
    };
  }

  const resolvedApiKey = String(apiKey || quotaCheck.ctx?.ownApiKey || state.settings?.apiKey || '').trim();

  // Intentar vÃ­a endpoint unificado /api/gemini-apu (protege clave del servidor y valida cuotas)
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (resolvedApiKey) headers['X-Gemini-Key'] = resolvedApiKey;
    try {
      const sb = getSupabaseClient();
      if (sb) {
        const { data: sData } = await sb.auth.getSession();
        if (sData?.session?.access_token) headers['Authorization'] = `Bearer ${sData.session.access_token}`;
      }
    } catch (_) {}

    const proxyRes = await fetch('/api/gemini-apu', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'insumo',
        useWebSearch,
        planId: quotaCheck.ctx?.planId || 'free',
        projectId: quotaCheck.ctx?.projectId || '',
        ownerEmail: quotaCheck.ctx?.ownerEmail || '',
        userApiKey: resolvedApiKey,
        insumo: {
          tipo: insumo.tipo || 'Material',
          clave: insumo.clave || '',
          descripcion: insumo.descripcion || '',
          unidad: insumo.unidad || 'pza',
          costoActual: insumo.costoUnitario || 0
        }
      })
    });

    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      if (proxyData?.quotaSnapshot) {
        applyServerQuotaSnapshot(quotaCheck.ctx?.ownerEmail, proxyData.quotaSnapshot);
      }
      if (proxyData?.success && Number(proxyData.costoUnitario) > 0) {
        const pRound = round2(proxyData.costoUnitario);
        setCachedSupplyPrices([{
          descripcion: insumo.descripcion,
          unidad: insumo.unidad,
          tipo: insumo.tipo,
          precioUnitario: pRound
        }], { usedWebSearch: Boolean(proxyData.usedWebSearch || useWebSearch), fuente: proxyData.fuente });

        recordAiQuotaConsumption({
          ownerEmail: quotaCheck.ctx?.ownerEmail,
          usageMetadata: proxyData.usageMetadata,
          standardConcepts: (proxyData.usedWebSearch || useWebSearch) ? 0 : 1,
          searchGroundingCalls: (proxyData.usedWebSearch || useWebSearch) ? Math.max(1, Number(proxyData.groundingQueriesCount) || 1) : 0,
          usedOwnApiKey: Boolean(proxyData.usedOwnApiKey || quotaCheck.usingOwnApiKey),
          quotaSnapshot: proxyData.quotaSnapshot || null
        });

        return {
          precio: pRound,
          fuente: proxyData.fuente || (useWebSearch ? 'Google Search Grounding' : 'Gemini Flash EstÃ¡ndar'),
          justificacion: proxyData.observaciones || 'Precio estimado en mercado mexicano'
        };
      }
    } else if (proxyRes.status === 401 || proxyRes.status === 403 || proxyRes.status === 429) {
      const errJson = await proxyRes.json().catch(() => ({}));
      if (errJson?.quotaSnapshot) {
        applyServerQuotaSnapshot(quotaCheck.ctx?.ownerEmail, errJson.quotaSnapshot);
      }
      return { blockedByQuota: true, error: errJson.error || 'Cuota de IA alcanzada.', precio: 0 };
    }
  } catch (_) {}

  if (!resolvedApiKey) return null;

  const promptText = `Eres un ingeniero civil especialista en costos y presupuestos de construcciÃ³n en MÃ©xico.
${useWebSearch ? 'Utiliza Google Search para investigar el precio unitario comercial promedio de mercado actual en MÃ©xico (MXN sin IVA):' : 'Estima con base en tus conocimientos tÃ©cnicos y tabuladores vigentes en MÃ©xico (MXN sin IVA) sin bÃºsqueda web:'}
- CategorÃ­a: "${insumo.tipo || 'Material'}"
- Clave: "${insumo.clave || ''}"
- DescripciÃ³n: "${insumo.descripcion || ''}"
- Unidad de medida: "${insumo.unidad || ''}"
- Costo actual registrado: $${insumo.costoUnitario || 0} MXN

Devuelve OBLIGATORIAMENTE un bloque JSON:
\`\`\`json
{
  "precioUnitario": 123.45,
  "fuente": "Proveedor o tabulador consultado",
  "justificacion": "ExplicaciÃ³n breve de 1 lÃ­nea"
}
\`\`\``;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const m of models) {
    try {
      const payload = { contents: [{ parts: [{ text: promptText }] }] };
      if (useWebSearch) payload.tools = [{ googleSearch: {} }];

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${resolvedApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = extractJsonSafe(text);
        if (parsed && typeof parsed.precioUnitario === 'number' && parsed.precioUnitario > 0) {
          const pRound = round2(parsed.precioUnitario);
          setCachedSupplyPrices([{
            descripcion: insumo.descripcion,
            unidad: insumo.unidad,
            tipo: insumo.tipo,
            precioUnitario: pRound
          }], { usedWebSearch, fuente: parsed.fuente || m });

          recordAiQuotaConsumption({
            ownerEmail: quotaCheck.ctx?.ownerEmail,
            usageMetadata: data.usageMetadata,
            standardConcepts: useWebSearch ? 0 : 1,
            searchGroundingCalls: useWebSearch ? 1 : 0,
            usedOwnApiKey: true
          });

          return {
            precio: pRound,
            fuente: parsed.fuente || (useWebSearch ? `Google Search Grounding (${m})` : `Gemini Flash (${m})`),
            justificacion: parsed.justificacion || 'Precio comercial estimado con IA'
          };
        }
      }
    } catch (e) {
      console.warn(`Error en consulta Gemini con modelo ${m}:`, e);
    }
  }

  return null;
}

// Consultar Google Gemini por lote (Batch) para mÃºltiples insumos seleccionados
export async function queryGeminiLoteInsumos(insumosList, apiKey = '', options = {}) {
  if (!insumosList || insumosList.length === 0) return null;
  const useWebSearch = Boolean(options?.useWebSearch === true);

  const resultMap = {};
  const pendingList = [];

  // 1. Cuando NO es bÃºsqueda web en vivo forzada, resolver primero con CachÃ© de precios ($0)
  for (const item of insumosList) {
    if (!useWebSearch) {
      const cached = getCachedSupplyPrice(item.descripcion, item.unidad);
      if (cached && cached.precioUnitario > 0) {
        resultMap[item.key] = {
          precio: round2(cached.precioUnitario),
          fuente: `${cached.fuente || 'CachÃ©'} (CachÃ©)`
        };
        continue;
      }
    }
    pendingList.push(item);
  }

  if (pendingList.length === 0) {
    return resultMap;
  }

  const chunkSize = useWebSearch ? 10 : 35;
  for (let start = 0; start < pendingList.length; start += chunkSize) {
    const chunk = pendingList.slice(start, start + chunkSize);

    const quotaCheck = useWebSearch
      ? checkWebSearchGroundingQuota(1, null, apiKey)
      : checkStandardAiQuota(1, null, apiKey);

    if (!quotaCheck.allowed) {
      return {
        ...resultMap,
        __quotaError: quotaCheck.reason
      };
    }

    const resolvedApiKey = String(apiKey || quotaCheck.ctx?.ownApiKey || state.settings?.apiKey || '').trim();
    let chunkHandled = false;

    // Intentar primero vÃ­a backend /api/gemini-apu
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (resolvedApiKey) headers['X-Gemini-Key'] = resolvedApiKey;
      try {
        const sb = getSupabaseClient();
        if (sb) {
          const { data: sData } = await sb.auth.getSession();
          if (sData?.session?.access_token) headers['Authorization'] = `Bearer ${sData.session.access_token}`;
        }
      } catch (_) {}

      const proxyRes = await fetch('/api/gemini-apu', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'insumos_batch',
          useWebSearch,
          planId: quotaCheck.ctx?.planId || 'free',
          projectId: quotaCheck.ctx?.projectId || '',
          ownerEmail: quotaCheck.ctx?.ownerEmail || '',
          userApiKey: resolvedApiKey,
          insumos: chunk.map(it => ({
            key: it.key,
            tipo: it.tipo,
            descripcion: it.descripcion,
            unidad: it.unidad,
            costoUnitario: it.costoUnitario || 0
          }))
        })
      });

      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData?.quotaSnapshot) {
          applyServerQuotaSnapshot(quotaCheck.ctx?.ownerEmail, proxyData.quotaSnapshot);
        }
        if (proxyData?.success && Array.isArray(proxyData.items)) {
          const toCache = [];
          proxyData.items.forEach((resItem, idx) => {
            const orig = chunk[Number(resItem.indice || idx + 1) - 1] || chunk[idx];
            const p = round2(parseFloat(resItem.costoUnitario) || 0);
            if (orig && p > 0) {
              resultMap[orig.key] = {
                precio: p,
                fuente: resItem.fuente || (useWebSearch ? 'Google Search Grounding' : 'Gemini Flash EstÃ¡ndar')
              };
              toCache.push({
                descripcion: orig.descripcion,
                unidad: orig.unidad,
                tipo: orig.tipo,
                precioUnitario: p
              });
            }
          });
          setCachedSupplyPrices(toCache, { usedWebSearch: Boolean(proxyData.usedWebSearch || useWebSearch) });
          recordAiQuotaConsumption({
            ownerEmail: quotaCheck.ctx?.ownerEmail,
            usageMetadata: proxyData.usageMetadata,
            standardConcepts: (proxyData.usedWebSearch || useWebSearch) ? 0 : 1,
            searchGroundingCalls: (proxyData.usedWebSearch || useWebSearch) ? Math.max(1, Number(proxyData.groundingQueriesCount) || 1) : 0,
            usedOwnApiKey: Boolean(proxyData.usedOwnApiKey || quotaCheck.usingOwnApiKey),
            quotaSnapshot: proxyData.quotaSnapshot || null
          });
          chunkHandled = true;
        }
      } else if (proxyRes.status === 401 || proxyRes.status === 403 || proxyRes.status === 429) {
        const errJson = await proxyRes.json().catch(() => ({}));
        if (errJson?.quotaSnapshot) {
          applyServerQuotaSnapshot(quotaCheck.ctx?.ownerEmail, errJson.quotaSnapshot);
        }
        return { ...resultMap, __quotaError: errJson.error || 'Cuota mensual de IA agotada.' };
      }
    } catch (_) {}

    if (chunkHandled) continue;
    if (!resolvedApiKey) continue;

    const promptText = `Eres un ingeniero civil especialista en costos de construcciÃ³n en MÃ©xico.
${useWebSearch ? 'Utiliza Google Search para investigar el precio unitario comercial de mercado actual en MÃ©xico (MXN antes de IVA):' : 'Estima con base en tus conocimientos tÃ©cnicos el precio unitario promedio actual en MÃ©xico (MXN antes de IVA) sin bÃºsqueda web:'}

${chunk.map((item, idx) => `[${idx + 1}] ID: "${item.key}", CategorÃ­a: "${item.tipo}", DescripciÃ³n: "${item.descripcion}", Unidad: "${item.unidad}", Costo actual: $${item.costoUnitario || 0}`).join('\n')}

Devuelve OBLIGATORIAMENTE un arreglo JSON con el precio comercial para cada insumo con esta estructura exacta:
\`\`\`json
[
  ${chunk.map(item => `{"id": "${item.key}", "precioUnitario": 0.00, "fuente": "Proveedor en MÃ©xico"}`).join(',\n  ')}
]
\`\`\``;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const m of models) {
      try {
        const payload = { contents: [{ parts: [{ text: promptText }] }] };
        if (useWebSearch) payload.tools = [{ googleSearch: {} }];

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${resolvedApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const parsed = extractJsonSafe(text);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const toCache = [];
            parsed.forEach(res => {
              if (res && res.id && typeof res.precioUnitario === 'number' && res.precioUnitario > 0) {
                const pRound = round2(res.precioUnitario);
                resultMap[res.id] = {
                  precio: pRound,
                  fuente: res.fuente || (useWebSearch ? `Google Search Grounding (${m})` : `Gemini Flash (${m})`)
                };
                const orig = chunk.find(x => x.key === res.id);
                if (orig) toCache.push({ descripcion: orig.descripcion, unidad: orig.unidad, tipo: orig.tipo, precioUnitario: pRound });
              }
            });
            setCachedSupplyPrices(toCache, { usedWebSearch });
            recordAiQuotaConsumption({
              ownerEmail: quotaCheck.ctx?.ownerEmail,
              usageMetadata: data.usageMetadata,
              standardConcepts: useWebSearch ? 0 : 1,
              searchGroundingCalls: useWebSearch ? 1 : 0,
              usedOwnApiKey: true
            });
            chunkHandled = true;
            break;
          }
        }
      } catch (e) {
        console.warn(`Error en consulta Gemini batch con modelo ${m}:`, e);
      }
    }
  }

  return Object.keys(resultMap).length > 0 ? resultMap : null;
}

// Estimar costo de un insumo (Cascada: CachÃ© / Tabulador Local -> Gemini EstÃ¡ndar; o Search Grounding si useWebSearch = true)
export async function estimarCostoInsumoConIA(insumo, options = {}) {
  const useWebSearch = Boolean(options?.useWebSearch === true);
  const apiKey = state.settings?.apiKey || '';

  const aiResult = await queryGeminiParaInsumo(insumo, apiKey, { useWebSearch });
  if (aiResult && aiResult.blockedByQuota) {
    return aiResult;
  }
  if (aiResult && aiResult.precio > 0) return aiResult;

  if (useWebSearch) {
    return {
      blockedByQuota: false,
      error: 'No se pudo obtener cotizaciÃ³n en vivo para este insumo.',
      precio: 0
    };
  }
  return estimarCostoInsumoLocal(insumo.tipo, insumo.descripcion, insumo.unidad, insumo.costoUnitario);
}
