// api/gemini-apu.js
// Vercel Serverless Function: Generación segura de APU con Google Gemini y Search Grounding.
// Protege la Gemini API Key en el servidor para que el cliente nunca la vea ni pueda robarla.

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 20;      // 20 peticiones por minuto por IP
const ipRequests = new Map();

function isRateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const record = ipRequests.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  record.count++;
  ipRequests.set(ip, record);

  // Limpieza periódica de registros caducados
  if (ipRequests.size > 2000) {
    for (const [k, v] of ipRequests.entries()) {
      if (now > v.resetAt) ipRequests.delete(k);
    }
  }
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

function extractJsonFromText(text) {
  if (!text) throw new Error('Respuesta vacía del modelo');
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
    throw new Error('La respuesta devuelta por la IA no pudo ser interpretada como JSON estructurado.');
  }
}

export default async function handler(req, res) {
  // Solo admitir método POST y preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gemini-Key');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Método no permitido. Utiliza POST.' });
  }

  // 1. Verificación de Origen (CORS / Anti-Leeching)
  const origin = req.headers.origin || req.headers.referer || '';
  const isAllowedOrigin = !origin ||
    origin.includes('cubikar-jj8j.vercel.app') ||
    origin.includes('vercel.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1');

  if (!isAllowedOrigin) {
    return res.status(403).json({ success: false, error: 'Acceso no autorizado desde este origen.' });
  }

  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gemini-Key');

  // 2. Control de Frecuencia (Rate Limiting)
  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim();
  if (isRateLimited(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'Límite de solicitudes alcanzado. Por favor espera un momento antes de generar otra matriz.'
    });
  }

  // 3. Obtener API Key de Gemini segura
  // Busca GEMINI_API_KEY o cualquier variante configurada en las variables de entorno de Vercel
  let envKey = process.env.GEMINI_API_KEY ||
               process.env['Gemini API Key'] ||
               process.env['GEMINI API KEY'] ||
               process.env.GEMINI_KEY ||
               process.env.GOOGLE_API_KEY ||
               process.env.GOOGLE_GEMINI_API_KEY;

  if (!envKey) {
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string' && (v.startsWith('AIzaSy') || k.toLowerCase().includes('gemini'))) {
        envKey = v;
        break;
      }
    }
  }

  // 3. Priorizar API Key explícita del usuario (si ingresa su propia key, no consume cuota de la plataforma)
  const body = req.body || {};
  const userProvidedKey = String(req.headers['x-gemini-key'] || body.userApiKey || '').trim();
  const usingOwnApiKey = Boolean(userProvidedKey);
  const apiKey = userProvidedKey || envKey;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'Servicio de IA no configurado: falta GEMINI_API_KEY en el servidor o una API Key propia.'
    });
  }

  // Modo explícito: useWebSearch DEBE venir estrictamente en true para activar Google Search Grounding ($0.70 MXN/req)
  const useWebSearch = Boolean(body.useWebSearch === true || body.enableWebSearch === true);
  const mode = String(body.mode || 'apu').toLowerCase().trim();

  // Guard servidor contra Supabase JWT + plan real en BD + tabla mensual de cuotas cuando usa key de plataforma
  const sbUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const sbAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const sbReadKey = serviceRoleKey || sbAnonKey;
  let quotaSnapshot = null;
  let quotaUserId = null;
  let resolvedQuotaPlanId = 'free';

  const normalizePlan = (raw) => {
    const k = String(raw || 'free').toLowerCase().trim();
    if (k === 'enterprise') return 'pro';
    return (k === 'plus' || k === 'pro') ? k : 'free';
  };
  const buildQuotaSnapshot = (quotaOut, fallbackPlan) => {
    if (!quotaOut || typeof quotaOut !== 'object') return null;
    const p = normalizePlan(quotaOut.plan_id || fallbackPlan);
    return {
      planId: p,
      monthKey: quotaOut.month_key || '',
      standardUsed: Number(quotaOut.standard_used) || 0,
      standardLimit: Number(quotaOut.standard_limit) || (p === 'pro' ? 3500 : (p === 'plus' ? 1500 : 10)),
      searchUsed: Number(quotaOut.search_used) || 0,
      searchLimit: Number(quotaOut.search_limit) ?? (p === 'pro' ? 200 : (p === 'plus' ? 70 : 0))
    };
  };

  if (!usingOwnApiKey) {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    let verifiedPlanId = (sbUrl && serviceRoleKey) ? 'free' : normalizePlan(body.planId || 'free');
    let verifiedUserId = null;
    let verifiedUserEmail = '';

    if (token && sbUrl && sbReadKey) {
      try {
        const uRes = await fetch(`${sbUrl}/auth/v1/user`, {
          headers: { apikey: sbReadKey, Authorization: `Bearer ${token}` }
        });
        if (uRes.ok) {
          const uJson = await uRes.json();
          verifiedUserId = uJson?.id || null;
          verifiedUserEmail = String(uJson?.email || '').toLowerCase().trim();
          const metaPlan = uJson?.user_metadata?.subscription?.planId || uJson?.user_metadata?.cubikar_cloud_state_v2?.subscription?.planId;
          verifiedPlanId = normalizePlan(metaPlan || (serviceRoleKey ? 'free' : (body.planId || 'free')));
        }
      } catch (_) {}
    }

    if (sbUrl && serviceRoleKey && !verifiedUserId) {
      return res.status(401).json({
        success: false,
        errorCode: 'AUTH_REQUIRED_FOR_PLATFORM_AI',
        error: 'Inicia sesión en tu cuenta o ingresa tu propia Gemini API Key para usar el servicio de IA.'
      });
    }

    quotaUserId = verifiedUserId;

    // Resolver plan autoritativo desde PostgreSQL (empresas.plan) y validar si colabora en cuenta de anfitrión
    if (verifiedUserId && sbUrl && serviceRoleKey) {
      try {
        const perfRes = await fetch(
          `${sbUrl}/rest/v1/perfiles?id=eq.${encodeURIComponent(verifiedUserId)}&select=id,email,empresa_id,empresas(id,plan,estado_suscripcion)&limit=1`,
          { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
        );
        if (perfRes.ok) {
          const perfRows = await perfRes.json();
          const dbPlan = perfRows?.[0]?.empresas?.plan ? normalizePlan(perfRows[0].empresas.plan) : '';
          // No degradar a 'free' si user_metadata ya registra una suscripción pagada (plus/pro) aún no sincronizada en empresas.plan
          if (dbPlan && (dbPlan !== 'free' || verifiedPlanId === 'free')) {
            verifiedPlanId = dbPlan;
          }
        }

        const reqOwnerEmail = String(body.ownerEmail || '').toLowerCase().trim();
        const reqProjectId = String(body.projectId || '').trim();
        if (reqOwnerEmail && verifiedUserEmail && reqOwnerEmail !== verifiedUserEmail) {
          const invQuery = reqProjectId
            ? `owner_email=ilike.${encodeURIComponent(reqOwnerEmail)}&invitee_email=ilike.${encodeURIComponent(verifiedUserEmail)}&proyecto_id=eq.${encodeURIComponent(reqProjectId)}&estado=in.(accepted,active)&select=owner_email,proyecto_id&limit=1`
            : `owner_email=ilike.${encodeURIComponent(reqOwnerEmail)}&invitee_email=ilike.${encodeURIComponent(verifiedUserEmail)}&estado=in.(accepted,active)&select=owner_email&limit=1`;
          const invRes = await fetch(`${sbUrl}/rest/v1/invitaciones?${invQuery}`, {
            headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
          });
          const invRows = invRes.ok ? await invRes.json() : [];
          if (Array.isArray(invRows) && invRows.length > 0) {
            const ownerPerfRes = await fetch(
              `${sbUrl}/rest/v1/perfiles?email=ilike.${encodeURIComponent(reqOwnerEmail)}&select=id,email,empresas(plan)&limit=1`,
              { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
            );
            const ownerRows = ownerPerfRes.ok ? await ownerPerfRes.json() : [];
            if (ownerRows?.[0]?.id) {
              quotaUserId = ownerRows[0].id;
              let ownerPlan = ownerRows[0]?.empresas?.plan ? normalizePlan(ownerRows[0].empresas.plan) : 'free';
              if (ownerPlan === 'free') {
                try {
                  const admRes = await fetch(`${sbUrl}/auth/v1/admin/users/${encodeURIComponent(ownerRows[0].id)}`, {
                    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
                  });
                  if (admRes.ok) {
                    const admUser = await admRes.json();
                    const ownerMetaPlan = admUser?.user_metadata?.subscription?.planId || admUser?.user_metadata?.cubikar_cloud_state_v2?.subscription?.planId;
                    if (ownerMetaPlan) ownerPlan = normalizePlan(ownerMetaPlan);
                  }
                } catch (_) {}
              }
              verifiedPlanId = ownerPlan;
            }
          }
        }
      } catch (_) {}
    }

    resolvedQuotaPlanId = verifiedPlanId;

    if (useWebSearch && verifiedPlanId === 'free') {
      return res.status(403).json({
        success: false,
        errorCode: 'SEARCH_GROUNDING_FORBIDDEN',
        error: 'El Cotizador Web en Vivo (Google Search Grounding) no está incluido en Plan Gratuita (0/mes). Actualiza a Plus (70/mes), Pro (200/mes) o ingresa tu propia Gemini API Key.'
      });
    }

    if (quotaUserId && sbUrl && serviceRoleKey) {
      const preStdDelta = useWebSearch ? 0 : 1;
      const preSearchDelta = useWebSearch ? 1 : 0;
      try {
        const rpcRes = await fetch(`${sbUrl}/rest/v1/rpc/check_and_increment_ai_quota`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          },
          body: JSON.stringify({
            p_user_id: quotaUserId,
            p_plan_id: verifiedPlanId,
            p_std_delta: preStdDelta,
            p_search_delta: preSearchDelta
          })
        });
        if (rpcRes.ok) {
          const quotaOut = await rpcRes.json();
          const snap = buildQuotaSnapshot(quotaOut, verifiedPlanId);
          if (snap) quotaSnapshot = snap;
          if (quotaOut && quotaOut.allowed === false) {
            return res.status(429).json({
              success: false,
              errorCode: useWebSearch ? 'SEARCH_GROUNDING_QUOTA_EXCEEDED' : 'AI_STANDARD_QUOTA_EXCEEDED',
              error: quotaOut.reason || 'Has alcanzado tu cuota mensual de IA para este plan.',
              quotaSnapshot
            });
          }
        }
      } catch (_) {}
    }
  }

  // 4. Validación y construcción de prompt según modo y useWebSearch
  let promptText = '';
  const parsePriceNumber = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const cleaned = String(v || '').replace(/[^0-9.-]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  if (mode === 'insumo') {
    const insumo = body.insumo || body;
    const desc = String(insumo.descripcion || '').trim().slice(0, 400);
    const unidad = String(insumo.unidad || 'pza').trim().slice(0, 30);
    const tipo = String(insumo.tipo || 'Material').trim().slice(0, 50);
    const costoActual = Number(insumo.costoActual ?? insumo.precioUnitario ?? 0) || 0;
    if (!desc) return res.status(400).json({ success: false, error: 'Se requiere la descripción del insumo.' });

    promptText = `Eres un experto ingeniero de costos de construcción en México (CMIC / Neodata / Opus).
${useWebSearch ? 'Utiliza Google Search para investigar precios comerciales VIGENTES de mercado en México (MXN).' : 'Estima con base en tus conocimientos y tabuladores de precios promedio en México (MXN) sin realizar búsquedas externas.'}
Calcula el costo unitario actualizado (sin IVA, puesto en obra o salario nominal/integrado según rubro) en MXN:
- Tipo de Insumo: ${tipo}
- Descripción: "${desc}"
- Unidad: "${unidad}"
- Costo actual de referencia en catálogo: $${costoActual.toFixed(2)} MXN

Responde OBLIGATORIAMENTE con un bloque JSON limpio:
\`\`\`json
{
  "costoUnitario": 0.00,
  "moneda": "MXN",
  "fuente": "Descripción breve de referencia comercial",
  "observaciones": "Nota corta técnica de rendimiento o vigencia"
}
\`\`\``;
  } else if (mode === 'insumos_batch') {
    const batchCap = useWebSearch ? 10 : 35;
    const insumosList = Array.isArray(body.insumos) ? body.insumos.slice(0, batchCap) : [];
    if (insumosList.length === 0) return res.status(400).json({ success: false, error: 'Se requiere una lista de insumos.' });
    const listText = insumosList.map((ins, i) => `${i + 1}. [${ins.tipo || 'Material'}] "${String(ins.descripcion || '').slice(0, 200)}" (Unidad: ${ins.unidad || 'pza'}, Actual: $${Number(ins.costoUnitario || 0).toFixed(2)})`).join('\n');

    promptText = `Eres un ingeniero de costos de construcción en México (CMIC / Neodata / Opus).
${useWebSearch ? 'Investiga en Google Search los precios comerciales actuales en México (MXN sin IVA) para esta lista de insumos:' : 'Estima los precios comerciales promedio vigentes en México (MXN sin IVA) usando tabuladores técnicos para esta lista de insumos:'}

${listText}

Devuelve OBLIGATORIAMENTE un arreglo JSON exacto manteniendo el orden:
\`\`\`json
{
  "items": [
    { "indice": 1, "descripcion": "...", "costoUnitario": 0.00, "fuente": "Referencia México" }
  ]
}
\`\`\``;
  } else if (mode === 'calendario') {
    promptText = String(body.promptText || '').trim().slice(0, 12000);
    if (!promptText) return res.status(400).json({ success: false, error: 'Se requiere el prompt de calendario.' });
  } else {
    const node = body.node || {};
    const descripcion = String(node.descripcion || body.descripcion || '').trim().slice(0, 500);
    const unidad = String(node.unidad || body.unidad || 'pza').trim().slice(0, 20);
    const clave = String(node.clave || body.clave || '').trim().slice(0, 50);
    const cantidad = Number(node.cantidad || body.cantidad || 1) || 1;
    const fullPath = String(body.fullPath || '').trim().slice(0, 300);
    const fasarVal = Number(body.fasarVal ?? 70.0);
    const fasarFactor = Number(body.fasarFactor ?? 1.70);

    if (!descripcion) {
      return res.status(400).json({ success: false, error: 'Se requiere la descripción del concepto.' });
    }

    promptText = `Eres un ingeniero civil especialista senior en Análisis de Precios Unitarios (APU) y costos de construcción en México.
${useWebSearch
  ? 'Utiliza Google Search Grounding para investigar precios comerciales y rendimientos vigentes en el mercado de la construcción en México (en Pesos Mexicanos MXN).'
  : 'Calcula la matriz de precios unitarios utilizando tabuladores estándar mexicanos (CMIC / Neodata / Opus) en Pesos Mexicanos (MXN).'}

Datos de la fila seleccionada en TAB1-CAT-BASE:
- Ubicación / Partida en presupuesto: "${fullPath || 'GENERAL'}"
- Clave de concepto: "${clave}"
- Descripción exacta del concepto: "${descripcion}"
- Unidad de medida del concepto: "${unidad}"
- Cantidad de obra en presupuesto: ${cantidad} ${unidad}

REGLA FUNDAMENTAL DE PRECIOS UNITARIOS (APU):
La propiedad 'cantidad' de CADA insumo (Material, Mano de Obra, Equipo/Herramienta, Subcontrato) DEBE SER ESTRICTAMENTE el consumo o rendimiento unitario necesario para elaborar EXACTAMENTE UNA UNIDAD (1 ${unidad}) del concepto.
¡NO debes multiplicar por la cantidad total de obra del presupuesto (${cantidad})! Únicamente el consumo por 1 ${unidad}.

Instrucciones de análisis:
1. ${useWebSearch ? 'Consulta precios comerciales vigentes en México puestos en obra.' : 'Asigna precios unitarios comerciales promedio vigentes en México puestos en obra (sin IVA).'}
2. Calcula los salarios reales de cuadrillas aplicando el FASAR configurado (+${fasarVal.toFixed(1)}% / Factor ${fasarFactor.toFixed(2)}).
3. Clasifica los insumos en: "Material", "Mano de Obra", "Herramienta", "Equipo", "Maquinaria" o "Subcontrato".
4. Devuelve OBLIGATORIAMENTE un bloque de código JSON con esta estructura exacta:
\`\`\`json
{
  "sugerencias": "Recomendación técnica sobre ejecución, curado, pruebas o normativas mexicanas...",
  "insumos": [
    {
      "clave": "MAT-01",
      "tipo": "Material",
      "descripcion": "Descripción comercial detallada del material",
      "unidad": "m3/kg/pza/etc",
      "cantidad": 0.00,
      "costoUnitario": 0.00
    }
  ]
}
\`\`\``;
  }

  // 6. Modelos estrictamente separados según useWebSearch (default: false SIN googleSearch)
  const attempts = useWebSearch
    ? [
        { model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] },
        { model: 'gemini-2.0-flash', tools: [{ googleSearch: {} }] },
        { model: 'gemini-1.5-flash', tools: [{ googleSearch: {} }] }
      ]
    : [
        { model: 'gemini-2.5-flash', tools: null },
        { model: 'gemini-2.0-flash', tools: null },
        { model: 'gemini-1.5-flash', tools: null }
      ];

  let lastError = '';
  const debugErrors = [];

  for (const att of attempts) {
    try {
      const reqPayload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.2
        }
      };

      if (att.tools) {
        reqPayload.tools = att.tools;
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${att.model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const msg = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
        debugErrors.push({ model: att.model, tools: !!att.tools, status: response.status, msg });
        lastError = msg;
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const textContent = candidate?.content?.parts?.[0]?.text;

      if (!textContent) {
        lastError = 'La IA no devolvió texto en su respuesta.';
        debugErrors.push({ model: att.model, msg: lastError });
        continue;
      }

      const groundingMeta = candidate.groundingMetadata;
      const searchQueries = groundingMeta?.webSearchQueries || [];
      const sources = (groundingMeta?.groundingChunks || []).map(chunk => ({
        title: chunk.web?.title || 'Fuente web',
        uri: chunk.web?.uri || '#'
      })).filter(s => s.uri !== '#');

      const usageRaw = data.usageMetadata || {};
      const usageMetadata = {
        promptTokenCount: Number(usageRaw.promptTokenCount) || 0,
        candidatesTokenCount: Number(usageRaw.candidatesTokenCount) || 0,
        thoughtsTokenCount: Number(usageRaw.thoughtsTokenCount) || 0,
        totalTokenCount: Number(usageRaw.totalTokenCount) || 0
      };
      const usedWebSearch = Boolean(att.tools);
      const groundingQueriesCount = usedWebSearch ? Math.max(1, searchQueries.length || 0) : 0;

      const parsed = extractJsonFromText(textContent);

      // Reconciliar consultas web adicionales si Gemini ejecutó > 1 webSearchQueries en el mismo prompt
      if (!usingOwnApiKey && usedWebSearch && groundingQueriesCount > 1 && quotaUserId && sbUrl && serviceRoleKey) {
        try {
          const extraRes = await fetch(`${sbUrl}/rest/v1/rpc/check_and_increment_ai_quota`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`
            },
            body: JSON.stringify({
              p_user_id: quotaUserId,
              p_plan_id: resolvedQuotaPlanId,
              p_std_delta: 0,
              p_search_delta: groundingQueriesCount - 1
            })
          });
          if (extraRes.ok) {
            const extraOut = await extraRes.json();
            const extraSnap = buildQuotaSnapshot(extraOut, resolvedQuotaPlanId);
            if (extraSnap) quotaSnapshot = extraSnap;
          }
        } catch (_) {}
      }

      if (mode === 'calendario') {
        return res.status(200).json({
          success: true,
          parsed: parsed || null,
          textContent,
          usageMetadata,
          usedWebSearch,
          usedOwnApiKey: usingOwnApiKey,
          groundingQueriesCount,
          quotaSnapshot,
          modelUsed: att.model
        });
      }

      if (mode === 'insumo') {
        const pCost = parsePriceNumber(parsed?.costoUnitario);
        if (parsed && pCost > 0) {
          return res.status(200).json({
            success: true,
            costoUnitario: Math.round(pCost * 100) / 100,
            moneda: parsed.moneda || 'MXN',
            fuente: parsed.fuente || (usedWebSearch ? 'Google Search Grounding' : 'Tabulador Gemini Flash'),
            observaciones: parsed.observaciones || '',
            googleSearchQueries: searchQueries,
            googleSources: sources,
            usageMetadata,
            usedWebSearch,
            usedOwnApiKey: usingOwnApiKey,
            groundingQueriesCount,
            quotaSnapshot,
            modelUsed: att.model
          });
        }
      }

      if (mode === 'insumos_batch') {
        if (parsed && Array.isArray(parsed.items)) {
          return res.status(200).json({
            success: true,
            items: parsed.items.map(it => ({
              ...it,
              costoUnitario: Math.round(parsePriceNumber(it.costoUnitario) * 100) / 100
            })),
            googleSearchQueries: searchQueries,
            googleSources: sources,
            usageMetadata,
            usedWebSearch,
            usedOwnApiKey: usingOwnApiKey,
            groundingQueriesCount,
            quotaSnapshot,
            modelUsed: att.model
          });
        }
      }

      if (parsed && Array.isArray(parsed.insumos) && parsed.insumos.length > 0) {
        const cleanInsumos = parsed.insumos.map((item, idx) => {
          let cleanTipo = 'Material';
          const t = (item.tipo || '').toLowerCase();
          if (t.includes('mano') || t.includes('obra') || t === 'mo') cleanTipo = 'Mano de Obra';
          else if (t.includes('herr')) cleanTipo = 'Herramienta';
          else if (t.includes('maq')) cleanTipo = 'Maquinaria';
          else if (t.includes('equipo') || t === 'eq') cleanTipo = 'Equipo';
          else if (t.includes('subcontrat') || t === 'sub') cleanTipo = 'Subcontrato';

          const cant = parseFloat(item.cantidad) || 0;
          const costo = parseFloat(item.costoUnitario) || 0;

          return {
            clave: item.clave || `${cleanTipo.substring(0, 3).toUpperCase()}-0${idx + 1}`,
            tipo: cleanTipo,
            descripcion: item.descripcion || 'Insumo de obra',
            unidad: item.unidad || 'pza',
            cantidad: Math.round(cant * 100000) / 100000,
            costoUnitario: Math.round(costo * 100) / 100
          };
        });

        return res.status(200).json({
          success: true,
          insumos: cleanInsumos,
          sugerencias: parsed.sugerencias || '',
          googleSearchQueries: searchQueries,
          googleSources: sources,
          usageMetadata,
          usedWebSearch,
          usedOwnApiKey: usingOwnApiKey,
          groundingQueriesCount,
          quotaSnapshot,
          modelUsed: att.model
        });
      }
    } catch (err) {
      lastError = err.message || 'Error de llamada a Google Gemini';
    }
  }

  return res.status(502).json({
    success: false,
    error: `No se pudo generar con Google IA: ${lastError}`,
    debugErrors
  });
}
