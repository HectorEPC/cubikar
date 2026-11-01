import { state, persistSettings } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { findNodeById, getNodeHierarchyPath } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { renderAPUInsumos, renderInsumosUnitarios } from '../apu/apuView.js';
import { closeAiGeneratorModal } from '../../ui/modalController.js';

// Extractor robusto de JSON para respuestas de Gemini
export function extractJsonFromAiResponse(text) {
  if (!text) throw new Error('Respuesta vacía');
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
      try {
        const jsonSubstring = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonSubstring);
      } catch (e3) {}
    }
    throw new Error('La respuesta devuelta por la IA no pudo ser interpretada como JSON.');
  }
}

// Probar conexión de API Key con Google Search Grounding
export async function testGeminiConnection() {
  const apiKeyInput = (document.getElementById('ai-modal-api-key')?.value || '').trim();
  const errorBox = document.getElementById('ai-modal-error');
  const errorTitle = document.getElementById('ai-modal-error-title');
  const errorMsg = document.getElementById('ai-modal-error-msg');

  if (!apiKeyInput) {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Se requiere API Key';
    if (errorMsg) errorMsg.innerText = 'Ingresa una API Key para probar la conexión con Google Search Grounding.';
    return;
  }

  showToast('Probando Google Search Grounding con Gemini 3.8 Flash...', 'info');

  const testModels = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let testSuccess = false;
  let testErr = '';

  for (let m of testModels) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKeyInput}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Prueba de conexión con Google Search. ¿Cuál es el precio del cemento en México?' }] }],
          tools: [{ googleSearch: {} }]
        })
      });

      if (response.ok) {
        testSuccess = true;
        if (errorBox) errorBox.classList.add('hidden');
        showToast(`✅ Conexión verificada con ${m} y Google Search Grounding`, 'success');
        break;
      } else {
        const errData = await response.json().catch(() => ({}));
        testErr = errData.error?.message || `HTTP ${response.status}: Error con ${m}`;
      }
    } catch (e) {
      testErr = e.message || 'Error de red al conectar con Google.';
    }
  }

  if (!testSuccess) {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Fallo en la prueba de conexión';
    if (errorMsg) errorMsg.innerText = testErr;
  }
}

// Ejecución de Generación con IA y Google Search Grounding
export async function executeAiGeneration() {
  const apiKeyInput = (document.getElementById('ai-modal-api-key')?.value || '').trim();
  const errorBox = document.getElementById('ai-modal-error');
  const errorTitle = document.getElementById('ai-modal-error-title');
  const errorMsg = document.getElementById('ai-modal-error-msg');
  const loadingBox = document.getElementById('ai-modal-loading');
  const loadingText = document.getElementById('ai-modal-loading-text');
  const btnRun = document.getElementById('btn-ai-modal-run');
  const btnLocal = document.getElementById('btn-ai-modal-local');

  if (!apiKeyInput) {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Se requiere API Key';
    if (errorMsg) errorMsg.innerText = 'Para realizar búsquedas en Google Search Grounding en tiempo real, ingresa tu API Key gratuita de Gemini.';
    document.getElementById('ai-modal-api-key')?.focus();
    return;
  }

  // Guardar API Key para futuros usos
  state.settings.apiKey = apiKeyInput;
  persistSettings();
  const cfgInput = document.getElementById('cfg-api-key');
  if (cfgInput) cfgInput.value = apiKeyInput;

  if (errorBox) errorBox.classList.add('hidden');
  if (loadingBox) loadingBox.classList.remove('hidden');
  if (btnRun) btnRun.disabled = true;
  if (btnLocal) btnLocal.disabled = true;

  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) {
    closeAiGeneratorModal();
    return;
  }

  const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
  const fullPath = pathArr.join('  >  ');

  const promptText = `Eres un ingeniero civil especialista senior en Análisis de Precios Unitarios (APU) y costos de construcción en México.
Utiliza Google Search Grounding para investigar precios comerciales y rendimientos vigentes en el mercado de la construcción en México (en Pesos Mexicanos MXN).

Datos de la fila seleccionada en TAB1-CAT-BASE:
- Ubicación / Partida en presupuesto: "${fullPath}"
- Clave de concepto: "${node.clave}"
- Descripción exacta del concepto: "${node.descripcion}"
- Unidad de medida del concepto: "${node.unidad}"
- Cantidad de obra en presupuesto: ${node.cantidad || 1} ${node.unidad}

REGLA FUNDAMENTAL DE PRECIOS UNITARIOS (APU):
La propiedad 'cantidad' de CADA insumo (Material, Mano de Obra, Equipo/Herramienta, Subcontrato) DEBE SER ESTRICTAMENTE el consumo o rendimiento unitario necesario para elaborar EXACTAMENTE UNA UNIDAD (1 ${node.unidad}) del concepto.
¡NO debes multiplicar por la cantidad total de obra del presupuesto (${node.cantidad || 1})! Únicamente el consumo por 1 ${node.unidad}.
Ejemplos de congruencia matemática:
- Si el concepto es en m2 y lleva concreto (m3) con espesor 10 cm: cantidad = 1.0 * 0.10 * 1.05 desperdicio = 0.105 m3.
- Si lleva malla electrosoldada en m2: cantidad = 1.10 m2 (considerando 10% traslapes).
- Si es Mano de Obra en 'jor': cantidad = 1 / RendimientoDiario (ej. 1 / 12.5 m2/jor = 0.0800 jor).
- Si es Herramienta menor (%): cantidad = 0.03 (3%).

Instrucciones prioritarias con Google Search:
1. Realiza búsquedas en Google de los precios actuales de mercado en México para los materiales comerciales que componen este concepto (puestos en obra).
2. Busca los salarios de cuadrillas (oficiales + peones) con Factor de Salario Real y sus rendimientos por cada 1 ${node.unidad} según tabuladores CMIC / Neodata / Opus.
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

  const attempts = [
    { model: 'gemini-3.8-flash', tools: [{ googleSearch: {} }] },
    { model: 'gemini-2.5-flash', tools: [{ googleSearch: {} }] },
    { model: 'gemini-3.8-flash', tools: null },
    { model: 'gemini-1.5-flash', tools: [{ google_search: {} }] },
    { model: 'gemini-1.5-flash', tools: [{ googleSearch: {} }] }
  ];

  let success = false;
  let lastError = '';

  for (let att of attempts) {
    try {
      if (loadingText) {
        loadingText.innerText = att.tools 
          ? `Buscando cotizaciones en Google Search Grounding con ${att.model}...`
          : `Consultando modelo ${att.model}...`;
      }

      const reqPayload = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.2
        }
      };

      if (att.tools) {
        reqPayload.tools = att.tools;
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${att.model}:generateContent?key=${apiKeyInput}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson.error?.message || `HTTP ${response.status} ${response.statusText}`;
        console.warn(`Intento fallido con ${att.model} (tools: ${!!att.tools}):`, lastError);
        continue;
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const textContent = candidate?.content?.parts?.[0]?.text;

      if (!textContent) {
        lastError = 'La IA no devolvió texto en su respuesta.';
        continue;
      }

      const parsed = extractJsonFromAiResponse(textContent);
      if (parsed && Array.isArray(parsed.insumos) && parsed.insumos.length > 0) {
        saveState();

        const groundingMeta = candidate.groundingMetadata;
        const searchQueries = groundingMeta?.webSearchQueries || [];
        const sources = (groundingMeta?.groundingChunks || []).map(chunk => ({
          title: chunk.web?.title || 'Fuente web',
          uri: chunk.web?.uri || '#'
        })).filter(s => s.uri !== '#');

        node.googleSearchQueries = searchQueries;
        node.googleSources = sources;
        node.aiTips = parsed.sugerencias || '';

        node.insumos = parsed.insumos.map((item, idx) => {
          let cleanTipo = 'Material';
          const t = (item.tipo || '').toLowerCase();
          if (t.includes('mano') || t.includes('obra') || t === 'mo') cleanTipo = 'Mano de Obra';
          else if (t.includes('herr')) cleanTipo = 'Herramienta';
          else if (t.includes('maq')) cleanTipo = 'Maquinaria';
          else if (t.includes('equipo') || t === 'eq') cleanTipo = 'Equipo';
          else if (t.includes('subcontrat') || t === 'sub') cleanTipo = 'Subcontrato';

          return {
            clave: item.clave || `${cleanTipo.substring(0, 3).toUpperCase()}-0${idx + 1}`,
            tipo: cleanTipo,
            descripcion: item.descripcion || 'Insumo de obra',
            unidad: item.unidad || 'pza',
            cantidad: Math.round(((parseFloat(item.cantidad) || 1) + Number.EPSILON) * 100) / 100,
            costoUnitario: Math.round(((parseFloat(item.costoUnitario) || 0) + Number.EPSILON) * 100) / 100
          };
        });

        success = true;
        break;
      }
    } catch (err) {
      lastError = err.message || 'Error de red';
      console.error('Error durante la llamada:', err);
    }
  }

  if (success) {
    closeAiGeneratorModal();
    renderAPUInsumos(node);
    renderInsumosUnitarios(node);
    renderTAB1();
    showToast('Matriz generada con Google Search Grounding', 'success');
  } else {
    if (loadingBox) loadingBox.classList.add('hidden');
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = 'Error al consultar Google Search';
    if (errorMsg) errorMsg.innerText = `${lastError}. Verifica tu API Key o prueba la conexión.`;
    if (btnRun) btnRun.disabled = false;
    if (btnLocal) btnLocal.disabled = false;
  }
}
