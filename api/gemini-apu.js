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

  const apiKey = (envKey || req.headers['x-gemini-key'] || req.body?.userApiKey || '').trim();

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'Servicio de IA no configurado: falta agregar la variable GEMINI_API_KEY en las variables de entorno de Vercel.'
    });
  }

  // 4. Validación y Sanitización del Input
  const body = req.body || {};
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

  // 5. Construir Prompt Especializado para Mercado Mexicano con Grounding
  const promptText = `Eres un ingeniero civil especialista senior en Análisis de Precios Unitarios (APU) y costos de construcción en México.
Utiliza Google Search Grounding para investigar precios comerciales y rendimientos vigentes en el mercado de la construcción en México (en Pesos Mexicanos MXN).

Datos de la fila seleccionada en TAB1-CAT-BASE:
- Ubicación / Partida en presupuesto: "${fullPath || 'GENERAL'}"
- Clave de concepto: "${clave}"
- Descripción exacta del concepto: "${descripcion}"
- Unidad de medida del concepto: "${unidad}"
- Cantidad de obra en presupuesto: ${cantidad} ${unidad}

REGLA FUNDAMENTAL DE PRECIOS UNITARIOS (APU):
La propiedad 'cantidad' de CADA insumo (Material, Mano de Obra, Equipo/Herramienta, Subcontrato) DEBE SER ESTRICTAMENTE el consumo o rendimiento unitario necesario para elaborar EXACTAMENTE UNA UNIDAD (1 ${unidad}) del concepto.
¡NO debes multiplicar por la cantidad total de obra del presupuesto (${cantidad})! Únicamente el consumo por 1 ${unidad}.
Ejemplos de congruencia matemática:
- Si el concepto es en m2 y lleva concreto (m3) con espesor 10 cm: cantidad = 1.0 * 0.10 * 1.05 desperdicio = 0.105 m3.
- Si lleva malla electrosoldada en m2: cantidad = 1.10 m2 (considerando 10% traslapes).
- Si es Mano de Obra en 'jor': cantidad = 1 / RendimientoDiario (ej. 1 / 12.5 m2/jor = 0.0800 jor).
- Si es Herramienta menor (%): cantidad = 0.03 (3%).

Instrucciones prioritarias con Google Search:
1. Realiza búsquedas en Google de los precios actuales de mercado en México para los materiales comerciales que componen este concepto (puestos en obra).
2. Busca los salarios de cuadrillas (oficiales + peones) aplicando el Factor de Salario Real (FASAR) configurado en el sistema (+${fasarVal.toFixed(1)}% / Factor ${fasarFactor.toFixed(2)}) para inflar el salario nominal y cubrir IMSS, INFONAVIT, SAR, riesgos y prestaciones según tabuladores CMIC / Neodata / Opus.
3. Determina el equipo, maquinaria y herramienta requerida.
4. Clasifica los insumos en los rubros: "Material", "Mano de Obra", "Herramienta", "Equipo", "Maquinaria" o "Subcontrato".
5. Al final de tu análisis, devuelve OBLIGATORIAMENTE un bloque de código JSON con esta estructura exacta:
\`\`\`json
{
  "sugerencias": "Recomendación técnica sobre ejecución, curado, pruebas o normativas mexicanas para este concepto...",
  "insumos": [
    {
      "clave": "MAT-01",
      "tipo": "Material",
      "descripcion": "Descripción comercial detallada del material con especificación",
      "unidad": "m3/kg/pza/etc",
      "cantidad": 0.00,
      "costoUnitario": 0.00
    },
    {
      "clave": "MO-01",
      "tipo": "Mano de Obra",
      "descripcion": "Cuadrilla de mano de obra (Oficial + Peón) con rendimiento",
      "unidad": "jor/m2/etc",
      "cantidad": 0.00,
      "costoUnitario": 0.00
    },
    {
      "clave": "EQ-01",
      "tipo": "Equipo",
      "descripcion": "Equipo o herramienta menor (% de MO)",
      "unidad": "hr/%",
      "cantidad": 0.00,
      "costoUnitario": 0.00
    }
  ]
}
\`\`\``;

  // 6. Modelos de respaldo con y sin Search Grounding (gemini-3.8-flash recomendado por Google)
  const attempts = [
    { model: 'gemini-3.8-flash', tools: [{ googleSearch: {} }] },
    { model: 'gemini-3.8-flash', tools: null },
    { model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] },
    { model: 'gemini-1.5-flash', tools: [{ googleSearch: {} }] }
  ];

  let lastError = '';

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
        lastError = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const textContent = candidate?.content?.parts?.[0]?.text;

      if (!textContent) {
        lastError = 'La IA no devolvió texto en su respuesta.';
        continue;
      }

      const parsed = extractJsonFromText(textContent);
      if (parsed && Array.isArray(parsed.insumos) && parsed.insumos.length > 0) {
        const groundingMeta = candidate.groundingMetadata;
        const searchQueries = groundingMeta?.webSearchQueries || [];
        const sources = (groundingMeta?.groundingChunks || []).map(chunk => ({
          title: chunk.web?.title || 'Fuente web',
          uri: chunk.web?.uri || '#'
        })).filter(s => s.uri !== '#');

        // Formatear insumos limpiamente
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
          modelUsed: att.model
        });
      }
    } catch (err) {
      lastError = err.message || 'Error de llamada a Google Gemini';
    }
  }

  return res.status(502).json({
    success: false,
    error: `No se pudo generar la matriz con Google IA: ${lastError}`
  });
}
