import { state, persistSettings, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { findNodeById, getNodeHierarchyPath, getSelectedLeafConcepts } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { renderAPUInsumos, renderInsumosUnitarios } from '../apu/apuView.js';
import { closeAiGeneratorModal, openAiGeneratorModal, aiModalTargetMode, aiModalSingleNodeId } from '../../ui/modalController.js';
import { round2, getFactorSobrecosto } from '../../core/calculations.js';
import { round5 } from '../../core/formatters.js';
import { getSupabaseClient } from '../../core/supabaseClient.js';
import {
  tryResolveConceptLocally,
  setCachedSupplyPrices,
  enrichInsumosWithLocalAndCachePrices,
  checkStandardAiQuota,
  checkWebSearchGroundingQuota,
  recordAiQuotaConsumption,
  applyServerQuotaSnapshot,
  resolveActiveAiExecutionContext
} from './aiQuotaAndCacheService.js';

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

  showToast('Probando conexión estándar con Gemini Flash (sin costo Web Search)...', 'info');

  const testModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let testSuccess = false;
  let testErr = '';

  for (let m of testModels) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKeyInput}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responde únicamente con: CONEXION_EXITOSA' }] }]
        })
      });

      if (response.ok) {
        testSuccess = true;
        if (errorBox) errorBox.classList.add('hidden');
        showToast(`✅ Conexión verificada con ${m}`, 'success');
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

/**
 * Helper compartido para aplicar insumos generados (local, caché, estándar o Search Grounding) sobre un nodo.
 */
function applyGeneratedMatrixToNode(node, rawInsumos, meta = {}) {
  const normalized = (Array.isArray(rawInsumos) ? rawInsumos : []).map((item, idx) => {
    let cleanTipo = 'Material';
    const t = String(item.tipo || '').toLowerCase();
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
      cantidad: round5(parseFloat(item.cantidad) || 0),
      costoUnitario: round2(parseFloat(item.costoUnitario ?? item.precioUnitario) || 0)
    };
  });

  const hydrated = enrichInsumosWithLocalAndCachePrices(normalized, state.treeData);
  node.insumos = hydrated.insumos.map(it => ({
    clave: it.clave,
    tipo: it.tipo,
    descripcion: it.descripcion,
    unidad: it.unidad,
    cantidad: round5(parseFloat(it.cantidad) || 0),
    costoUnitario: round2(parseFloat(it.costoUnitario ?? it.precioUnitario) || 0)
  }));

  node.googleSearchQueries = meta.googleSearchQueries || [];
  node.googleSources = meta.googleSources || [];
  node.aiTips = meta.aiTips || '';

  const totalCD = round2(node.insumos.reduce((acc, ins) => acc + (round5(ins.cantidad || 0) * round2(ins.costoUnitario || 0)), 0));
  const factorSobrecosto = getFactorSobrecosto();
  node.costoDirecto = totalCD;
  node.precioUnitario = round2(totalCD * factorSobrecosto);
}

/**
 * Genera la matriz APU para el concepto activo usando cascada inteligente:
 *  - Modo Estándar (useWebSearch = false, defecto): 1º Motor Local + Caché ($0) -> 2º Gemini Flash SIN googleSearch.
 *  - Modo Cotizador Web en Vivo (useWebSearch = true, acción explícita): consulta Gemini con Google Search Grounding
 *    validando la cuota mensual global (0 Gratuita / 70 Plus / 200 Pro o API Key propia) y guarda precios en caché.
 */
export async function generarMatrizConceptoActivoGoogleIA(targetNodeId = null, options = {}) {
  const targetId = targetNodeId || state.activeSelectedId;
  const node = targetId ? findNodeById(state.treeData, targetId) : null;
  const useWebSearch = Boolean(options?.useWebSearch === true);

  if (!node) {
    showToast('Selecciona un concepto en el catálogo primero para generar su matriz APU.', 'warning');
    return false;
  }

  if (node.children && node.children.length > 0) {
    showToast('Solo se puede generar matriz en conceptos individuales (hojas), no en partidas agrupadoras.', 'warning');
    return false;
  }

  // PASO 1 DE CASCADA ($0 costo): Motor Local + Caché de insumos cuando NO se pidió búsqueda web en vivo explícita
  if (!useWebSearch) {
    const localRes = await tryResolveConceptLocally(node, options?.localCtx || null);
    if (localRes && localRes.matched && localRes.insumos.length > 0) {
      saveState();
      applyGeneratedMatrixToNode(node, localRes.insumos, {
        googleSearchQueries: [],
        googleSources: [],
        aiTips: `⚡ Matriz resuelta automáticamente por Motor Local + Caché de Insumos ($0 consumo de IA, similitud ${Math.round((localRes.score || 0) * 100)}%).`
      });
      persistLocalData();
      renderAPUInsumos(node);
      renderInsumosUnitarios(node);
      renderTAB1();
      if (!options?.silentLocalToast) {
        showToast(`⚡ Matriz resuelta localmente con Motor Local + Caché para [${node.clave || ''}] ($0 costo IA).`, 'success');
      }
      if (typeof window !== 'undefined' && typeof window.refreshAiQuotaBadges === 'function') {
        window.refreshAiQuotaBadges();
      }
      return true;
    }
  }

  // PASO 2: Validar cuota mensual de IA Estándar (10/1500/3500) o Google Search Grounding (0/70/200)
  const quotaCheck = useWebSearch
    ? checkWebSearchGroundingQuota(1)
    : checkStandardAiQuota(1);

  if (!quotaCheck.allowed) {
    if (options && typeof options === 'object') options._quotaStopped = true;
    showToast(`🔒 ${quotaCheck.reason}`, 'warning');
    if (!options?.silentQuotaModal && typeof window !== 'undefined' && typeof window.openSubscriptionModal === 'function') {
      window.openSubscriptionModal();
    }
    return false;
  }

  const btnHeader = document.getElementById('btn-ai-apu');
  const btnHeaderMenu = document.getElementById('btn-apu-ai-menu');
  const btnMax = document.getElementById('btn-ai-apu-max');
  const btnMaxMenu = document.getElementById('btn-apu-max-ai-menu');
  const originalHeaderHtml = btnHeader ? btnHeader.innerHTML : '';
  const originalMaxHtml = btnMax ? btnMax.innerHTML : '';

  const setLoadingState = (loading) => {
    if (btnHeader) {
      btnHeader.disabled = loading;
      btnHeader.innerHTML = loading
        ? `<i class="fa-solid fa-circle-notch fa-spin text-[10px] text-amber-300"></i> <span class="text-[8px]">${useWebSearch ? 'Buscando Web...' : 'Generando...'}</span>`
        : originalHeaderHtml;
    }
    if (btnHeaderMenu) btnHeaderMenu.disabled = loading;
    if (btnMax) {
      btnMax.disabled = loading;
      btnMax.innerHTML = loading
        ? `<i class="fa-solid fa-circle-notch fa-spin text-xs text-amber-300"></i> ${useWebSearch ? 'Buscando Web...' : 'Generando...'}`
        : originalMaxHtml;
    }
    if (btnMaxMenu) btnMaxMenu.disabled = loading;
  };

  setLoadingState(true);
  showToast(
    useWebSearch
      ? `🌐 Cotizando precios en Web en Vivo (Google Search) para [${node.clave || ''}]...`
      : `🤖 Generando matriz con Gemini Flash Estándar (sin Web Search) para [${node.clave || ''}]...`,
    'info'
  );

  const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
  const fullPath = pathArr.join('  >  ');
  const fasarVal = state.settings?.pctFasar !== undefined ? Number(state.settings.pctFasar) : 70.0;
  const fasarFactor = (fasarVal > 0 && fasarVal < 5.0) ? fasarVal : (1 + (fasarVal / 100));
  const ownApiKey = quotaCheck.ctx?.ownApiKey || state.settings?.apiKey || '';

  try {
    const payload = {
      mode: 'apu',
      useWebSearch,
      planId: quotaCheck.ctx?.planId || 'free',
      projectId: quotaCheck.ctx?.projectId || '',
      ownerEmail: quotaCheck.ctx?.ownerEmail || '',
      node: {
        clave: node.clave || '',
        descripcion: node.descripcion || '',
        unidad: node.unidad || 'pza',
        cantidad: node.cantidad || 1
      },
      fullPath,
      fasarVal,
      fasarFactor,
      userApiKey: ownApiKey
    };

    const headers = { 'Content-Type': 'application/json' };
    if (ownApiKey) {
      headers['X-Gemini-Key'] = ownApiKey;
    }
    try {
      const sb = getSupabaseClient();
      if (sb) {
        const { data: sessionData } = await sb.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      }
    } catch (_) {}

    const response = await fetch('/api/gemini-apu', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data?.quotaSnapshot) {
      applyServerQuotaSnapshot(quotaCheck.ctx?.ownerEmail, data.quotaSnapshot);
    }

    if (!response.ok || !data.success) {
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        if (options && typeof options === 'object') options._quotaStopped = true;
      }
      throw new Error(data.error || `HTTP ${response.status}: Error al conectar con el servicio de IA`);
    }

    if (!Array.isArray(data.insumos) || data.insumos.length === 0) {
      throw new Error('La IA no devolvió insumos utilizables para este concepto.');
    }

    saveState();

    // Guardar precios obtenidos en caché local para evitar consultas repetidas futuras
    setCachedSupplyPrices(data.insumos, {
      usedWebSearch: Boolean(data.usedWebSearch || useWebSearch),
      fuente: Boolean(data.usedWebSearch || useWebSearch) ? 'Google Search Grounding' : 'Gemini Flash Estándar'
    });

    applyGeneratedMatrixToNode(node, data.insumos, {
      googleSearchQueries: data.googleSearchQueries || [],
      googleSources: data.googleSources || [],
      aiTips: data.sugerencias || ''
    });

    recordAiQuotaConsumption({
      ownerEmail: quotaCheck.ctx?.ownerEmail,
      usageMetadata: data.usageMetadata,
      standardConcepts: (data.usedWebSearch || useWebSearch) ? 0 : 1,
      searchGroundingCalls: (data.usedWebSearch || useWebSearch) ? Math.max(1, Number(data.groundingQueriesCount) || 1) : 0,
      usedOwnApiKey: Boolean(data.usedOwnApiKey || quotaCheck.usingOwnApiKey),
      quotaSnapshot: data.quotaSnapshot || null
    });

    persistLocalData();
    renderAPUInsumos(node);
    renderInsumosUnitarios(node);
    renderTAB1();
    if (typeof window !== 'undefined' && typeof window.refreshAiQuotaBadges === 'function') {
      window.refreshAiQuotaBadges();
    }

    showToast(
      useWebSearch
        ? `🌐 Matriz cotizada con Precios Web en Vivo para [${node.clave || ''}] (precios guardados en caché)`
        : `✅ Matriz generada con IA Estándar para [${node.clave || ''}]`,
      'success'
    );
    return true;
  } catch (err) {
    console.error('Error generando matriz con Google IA:', err);

    if (ownApiKey && !(options && options._quotaStopped)) {
      try {
        showToast('Reintentando consulta directa con API Key local...', 'info');
        const fallbackRes = await queryGeminiSingleConcept(node, ownApiKey, null, { useWebSearch });
        if (fallbackRes.success) {
          persistLocalData();
          renderAPUInsumos(node);
          renderInsumosUnitarios(node);
          renderTAB1();
          if (typeof window !== 'undefined' && typeof window.refreshAiQuotaBadges === 'function') {
            window.refreshAiQuotaBadges();
          }
          showToast(useWebSearch ? '🌐 Matriz cotizada con Google Search Grounding' : '✅ Matriz generada con Gemini Flash', 'success');
          return true;
        }
      } catch (fbErr) {
        console.warn('Fallback local no completado:', fbErr);
      }
    }

    showToast(`Error al generar matriz: ${err.message}`, 'error');
    return false;
  } finally {
    setLoadingState(false);
  }
}

// Acciones explícitas de Precios Web en Vivo (Google Search Grounding)
export async function generarMatrizConBusquedaWebActiva(targetNodeId = null) {
  return generarMatrizConceptoActivoGoogleIA(targetNodeId, { useWebSearch: true });
}

export async function generarMatrizCasillasConBusquedaWeb() {
  return generarMatrizCasillasGoogleIA({ useWebSearch: true });
}

// Generar matrices APU con IA para conceptos seleccionados (Estándar por defecto; Cascada Local -> Gemini sin Web Search)
export async function generarMatrizCasillasGoogleIA(options = {}) {
  const useWebSearch = Boolean(options?.useWebSearch === true);
  let selected = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
  if (selected.length === 0 && state.activeSelectedId) {
    const active = findNodeById(state.treeData, state.activeSelectedId);
    if (active && (!active.children || active.children.length === 0)) {
      active.selected = true;
      selected.push(active);
      persistLocalData();
      renderTAB1();
    }
  }

  if (selected.length === 0) {
    showToast('Selecciona con la casilla (checkbox) los conceptos cuya matriz deseas generar.', 'warning');
    return;
  }

  const btnToolbar = document.getElementById('btn-toolbar-google-ia');
  const btnToolbarMenu = document.getElementById('btn-toolbar-ai-menu');
  const originalToolbarHtml = btnToolbar ? btnToolbar.innerHTML : '';
  if (btnToolbar) {
    btnToolbar.disabled = true;
    btnToolbar.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin text-[10px] text-amber-200"></i> ${useWebSearch ? 'Buscando Web...' : 'Generando...'}`;
  }
  if (btnToolbarMenu) btnToolbarMenu.disabled = true;

  saveState();
  let successCount = 0;
  let quotaStopped = false;

  for (let i = 0; i < selected.length; i++) {
    const concept = selected[i];
    const callOpts = { useWebSearch, silentQuotaModal: true, silentLocalToast: selected.length > 1 };
    const ok = await generarMatrizConceptoActivoGoogleIA(concept.id, callOpts);
    if (ok) {
      successCount++;
    } else if (callOpts._quotaStopped) {
      quotaStopped = true;
      break;
    }
  }

  if (btnToolbar) {
    btnToolbar.disabled = false;
    btnToolbar.innerHTML = originalToolbarHtml;
  }
  if (btnToolbarMenu) btnToolbarMenu.disabled = false;

  if (quotaStopped && typeof window !== 'undefined' && typeof window.openSubscriptionModal === 'function') {
    window.openSubscriptionModal();
  }

  if (successCount > 0) {
    showToast(
      useWebSearch
        ? `🌐 ${successCount} de ${selected.length} matrices cotizadas con Precios Web en Vivo.`
        : `✅ ${successCount} de ${selected.length} matrices procesadas (Motor Local + Caché + IA Estándar).`,
      'success'
    );
  }
}

/**
 * Consulta directa a Gemini (usando API Key propia). Respeta useWebSearch (default: false).
 */
export async function queryGeminiSingleConcept(node, apiKeyInput, onStatus, options = {}) {
  if (!node) return { success: false, error: 'Nodo no válido' };
  const useWebSearch = Boolean(options?.useWebSearch === true);

  const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
  const fullPath = pathArr.join('  >  ');

  const fasarVal = state.settings?.pctFasar !== undefined ? Number(state.settings.pctFasar) : 70.0;
  const fasarFactor = (fasarVal > 0 && fasarVal < 5.0) ? fasarVal : (1 + (fasarVal / 100));

  const promptText = `Eres un ingeniero civil especialista senior en Análisis de Precios Unitarios (APU) y costos de construcción en México.
${useWebSearch
  ? 'Utiliza Google Search Grounding para investigar precios comerciales y rendimientos vigentes en el mercado de la construcción en México (en Pesos Mexicanos MXN).'
  : 'Calcula la matriz usando tabuladores técnicos estándar mexicanos (CMIC / Neodata / Opus) en Pesos Mexicanos MXN sin búsqueda web externa.'}

Datos de la fila seleccionada en TAB1-CAT-BASE:
- Ubicación / Partida en presupuesto: "${fullPath}"
- Clave de concepto: "${node.clave || ''}"
- Descripción exacta del concepto: "${node.descripcion || ''}"
- Unidad de medida del concepto: "${node.unidad || 'pza'}"
- Cantidad de obra en presupuesto: ${node.cantidad || 1} ${node.unidad || 'pza'}

REGLA FUNDAMENTAL DE PRECIOS UNITARIOS (APU):
La propiedad 'cantidad' de CADA insumo (Material, Mano de Obra, Equipo/Herramienta, Subcontrato) DEBE SER ESTRICTAMENTE el consumo o rendimiento unitario necesario para elaborar EXACTAMENTE UNA UNIDAD (1 ${node.unidad || 'pza'}) del concepto.
¡NO debes multiplicar por la cantidad total de obra del presupuesto (${node.cantidad || 1})! Únicamente el consumo por 1 ${node.unidad || 'pza'}.

Instrucciones:
1. ${useWebSearch ? 'Realiza búsquedas en Google de los precios actuales de mercado en México para los materiales comerciales (puestos en obra).' : 'Asigna precios unitarios comerciales promedio vigentes en México puestos en obra (sin IVA).'}
2. Aplica el Factor de Salario Real (FASAR) configurado (+${fasarVal.toFixed(1)}% / Factor ${fasarFactor.toFixed(2)}) a cuadrillas de mano de obra.
3. Clasifica en: "Material", "Mano de Obra", "Herramienta", "Equipo", "Maquinaria" o "Subcontrato".
4. Devuelve OBLIGATORIAMENTE un bloque JSON:
\`\`\`json
{
  "sugerencias": "Recomendación técnica para este concepto...",
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

  for (let att of attempts) {
    try {
      if (onStatus) {
        onStatus(att.tools
          ? `Buscando cotizaciones en Google Search Grounding con ${att.model}...`
          : `Consultando modelo estándar ${att.model}...`);
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
        const groundingMeta = candidate.groundingMetadata;
        const searchQueries = groundingMeta?.webSearchQueries || [];
        const sources = (groundingMeta?.groundingChunks || []).map(chunk => ({
          title: chunk.web?.title || 'Fuente web',
          uri: chunk.web?.uri || '#'
        })).filter(s => s.uri !== '#');

        setCachedSupplyPrices(parsed.insumos, {
          usedWebSearch: Boolean(att.tools),
          fuente: att.tools ? 'Google Search Grounding' : 'Gemini Flash Estándar'
        });

        applyGeneratedMatrixToNode(node, parsed.insumos, {
          googleSearchQueries: searchQueries,
          googleSources: sources,
          aiTips: parsed.sugerencias || ''
        });

        recordAiQuotaConsumption({
          usageMetadata: data.usageMetadata,
          standardConcepts: att.tools ? 0 : 1,
          searchGroundingCalls: att.tools ? Math.max(1, searchQueries.length || 1) : 0,
          usedOwnApiKey: true
        });

        return { success: true };
      }
    } catch (err) {
      lastError = err.message || 'Error de red';
      console.error('Error durante la llamada:', err);
    }
  }

  return { success: false, error: lastError };
}

// Ejecución desde Modal de IA: cascada Motor Local + Caché -> IA Estándar (sin búsqueda por defecto) o Web Search explícito
export async function executeAiGeneration() {
  const apiKeyInput = (document.getElementById('ai-modal-api-key')?.value || '').trim();
  const useWebSearch = Boolean(document.getElementById('ai-modal-use-web-search')?.checked === true);
  const errorBox = document.getElementById('ai-modal-error');
  const errorTitle = document.getElementById('ai-modal-error-title');
  const errorMsg = document.getElementById('ai-modal-error-msg');
  const loadingBox = document.getElementById('ai-modal-loading');
  const loadingText = document.getElementById('ai-modal-loading-text');
  const btnRun = document.getElementById('btn-ai-modal-run');

  if (apiKeyInput) {
    state.settings.apiKey = apiKeyInput;
    persistSettings();
    const cfgInput = document.getElementById('cfg-api-key');
    if (cfgInput) cfgInput.value = apiKeyInput;
  }

  let targets = [];
  if (aiModalTargetMode === 'single') {
    const targetNode = findNodeById(state.treeData, aiModalSingleNodeId || state.activeSelectedId);
    if (targetNode && (!targetNode.children || targetNode.children.length === 0)) {
      targets = [targetNode];
    }
  } else {
    targets = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
    if (targets.length === 0 && state.activeSelectedId) {
      const activeNode = findNodeById(state.treeData, state.activeSelectedId);
      if (activeNode && (!activeNode.children || activeNode.children.length === 0)) {
        targets = [activeNode];
      }
    }
  }

  if (targets.length === 0) {
    showToast('Selecciona al menos un concepto en la tabla primero.', 'warning');
    closeAiGeneratorModal();
    return;
  }

  if (errorBox) errorBox.classList.add('hidden');
  if (loadingBox) loadingBox.classList.remove('hidden');
  if (btnRun) btnRun.disabled = true;

  saveState();

  let successCount = 0;
  let lastError = '';
  let quotaStopped = false;

  for (let i = 0; i < targets.length; i++) {
    const node = targets[i];
    const prefix = targets.length > 1 ? `(${i + 1}/${targets.length}) ` : '';

    if (loadingText) {
      loadingText.innerText = `${prefix}${useWebSearch ? 'Buscando Web en Vivo' : 'Procesando Cascada Local / IA'} para [${node.clave || ''}] ${node.descripcion.substring(0, 30)}...`;
    }

    try {
      const callOpts = {
        useWebSearch,
        silentQuotaModal: true,
        silentLocalToast: targets.length > 1
      };
      const ok = await generarMatrizConceptoActivoGoogleIA(node.id, callOpts);
      if (ok) {
        successCount++;
      } else if (callOpts._quotaStopped) {
        quotaStopped = true;
        lastError = useWebSearch
          ? 'Cuota mensual de Precios Web en Vivo agotada o no incluida en tu plan.'
          : 'Cuota mensual de IA Estándar agotada para este plan.';
        break;
      } else {
        lastError = 'No se pudo procesar el concepto con IA.';
      }
    } catch (err) {
      lastError = err.message || 'Error de conexión';
      console.error(`Error en concepto ${node.clave}:`, err);
    }
  }

  if (loadingBox) loadingBox.classList.add('hidden');
  if (btnRun) btnRun.disabled = false;

  if (successCount > 0) {
    persistLocalData();
    closeAiGeneratorModal();

    if (state.activeSelectedId) {
      const activeNode = findNodeById(state.treeData, state.activeSelectedId);
      if (activeNode) {
        renderAPUInsumos(activeNode);
        renderInsumosUnitarios(activeNode);
      }
    }
    renderTAB1();

    const msg = targets.length === 1
      ? (useWebSearch ? '🌐 Matriz cotizada con Precios Web en Vivo' : '✅ Matriz generada con Cascada Local + IA Estándar')
      : `✅ Matrices generadas para ${successCount} de ${targets.length} conceptos`;
    showToast(msg, 'success');
    if (quotaStopped && typeof window !== 'undefined' && typeof window.openSubscriptionModal === 'function') {
      window.openSubscriptionModal();
    }
  } else {
    if (errorBox) errorBox.classList.remove('hidden');
    if (errorTitle) errorTitle.innerText = quotaStopped ? 'Límite de Suscripción Alcanzado' : 'Error al generar con IA';
    if (errorMsg) errorMsg.innerText = lastError;
    if (quotaStopped && typeof window !== 'undefined' && typeof window.openSubscriptionModal === 'function') {
      window.openSubscriptionModal();
    }
  }
}
