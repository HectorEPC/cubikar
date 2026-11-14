// js/modules/ai/localEstimator.js
// Generador y estimador de matrices APU usando Catálogos Locales de Referencia (Opus, Neodata, Gobierno)
//
// Cumple estrictamente con el flujo de dos pasos:
// PASO 1: Busca en los catálogos cargados un concepto similar con los mismos elementos,
//         especificaciones y componentes técnicos. Si lo encuentra, copia su matriz de insumos
//         y la integra en el concepto seleccionado.
// PASO 2: Si no encuentra un concepto similar, interpreta la descripción del texto desde cero,
//         descomponiendo analíticamente todas las piezas, materiales, cuadrillas de mano de obra,
//         equipos/maquinaria y herramienta menor (3% MO), cotizándolos con los catálogos locales.

import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney, round2, round5 } from '../../core/formatters.js';
import { getFactorSobrecosto } from '../../core/calculations.js';
import { findNodeById, getNodeHierarchyPath, getSelectedLeafConcepts } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import { renderAPUInsumos, renderInsumosUnitarios, toggleApuSection } from '../apu/apuView.js';
import { closeAiGeneratorModal } from '../../ui/modalController.js';
import {
  getReferenceDatabaseStats,
  listReferenceCatalogs,
  getItemsByCatalogIds
} from '../reference/referenceDb.js';
import { installPresetCatalog } from '../reference/presetCatalogs.js';
import {
  generateLocalMatrix,
  buildSupplyIndex,
  flattenPresetData,
  matrixDirectCost
} from './localMatrixEngine.js';
import { CASA_LAURA_PROJECT } from '../io/casaLauraData.js';

// Modo de destino del modal: 'single' (solo concepto activo en matriz) o 'batch' (conceptos con casilla)
export let localModalTargetMode = 'single';
export let localModalSingleNodeId = null;

// Re-exportar selector de conceptos hoja con casilla seleccionada
export { getSelectedLeafConcepts };

/**
 * Construye el contexto de referencia en memoria para una ejecución de catálogo local.
 * Carga los items de los catálogos seleccionados en IndexedDB e integra el proyecto Opus certificado.
 */
export async function buildLocalGenerationContext(selectedCatalogIds = 'all') {
  let loadedItems = [];
  try {
    loadedItems = await getItemsByCatalogIds(selectedCatalogIds);
  } catch (err) {
    console.warn('Error leyendo registros de IndexedDB:', err);
  }

  // Si no hay catálogos aún en IndexedDB, auto-instalar catálogo muestra residencial para experiencia inmediata
  if (!loadedItems || loadedItems.length === 0) {
    try {
      showToast('Cargando catálogo muestra Proyecto Residencial...', 'info');
      await installPresetCatalog('catalogo_muestra_residencial');
      loadedItems = await getItemsByCatalogIds(selectedCatalogIds);
    } catch (err) {
      console.warn('Auto-instalación de catálogo preset no completada:', err);
    }
  }

  // Integrar conceptos e insumos certificados de Opus Casa Laura (12 partidas, 94 conceptos, 414 insumos)
  const opusFlat = flattenPresetData(CASA_LAURA_PROJECT);
  const allItems = [...(loadedItems || []), ...opusFlat];

  // Conceptos candidatos para PASO 1 (con matriz de insumos reales completa)
  const referenceConcepts = allItems
    .filter(it => it && it.tipo === 'Concepto' && Array.isArray(it.insumos) && it.insumos.length > 0)
    .map(it => ({
      clave: it.clave,
      descripcion: it.descripcion,
      unidad: it.unidad,
      insumos: it.insumos,
      precioUnitario: it.precioUnitario || it.costoUnitario || 0,
      costoDirecto: it.costoDirecto || it.precioUnitario || 0,
      sourceName: it.catalogName || 'Proyecto Opus Casa Laura'
    }));

  // Índice analítico de insumos (Materiales, Mano de Obra, Maquinaria, Herramienta) para PASO 2
  const supplyIndex = buildSupplyIndex(allItems);

  const fasarVal = state.settings?.pctFasar !== undefined ? Number(state.settings.pctFasar) : 70.0;
  const fasarFactor = (fasarVal > 0 && fasarVal < 5.0) ? fasarVal : (1 + (fasarVal / 100));

  return {
    referenceConcepts,
    supplyIndex,
    allItemsCount: allItems.length,
    catalogsCount: loadedItems.length,
    fasarFactor
  };
}

// Generar matriz APU con catálogo local para conceptos seleccionados con casilla
export async function generarMatrizCasillasLocal() {
  let selected = getSelectedLeafConcepts();
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
    showToast('Selecciona con la casilla (checkbox) los conceptos cuya matriz deseas generar con Catálogo Local.', 'warning');
    return;
  }

  await openLocalCatalogSelectorModal(false);
}

// Abrir modal para preguntar qué catálogos considerar al generar matriz APU
// Si singleSelectedOnly es true, aplica ESTRICTAMENTE al concepto actualmente seleccionado en la pestaña Matriz
export async function openLocalCatalogSelectorModal(singleSelectedOnly = false) {
  let node = null;
  const isSingle = Boolean(singleSelectedOnly);

  if (isSingle) {
    localModalTargetMode = 'single';
    localModalSingleNodeId = state.activeSelectedId;
    if (state.activeSelectedId) {
      node = findNodeById(state.treeData, state.activeSelectedId);
    }
    if (!node) {
      showToast('Selecciona primero un concepto en la tabla para ver y generar su matriz con Catálogo Local.', 'warning');
      return;
    }
  } else {
    let selected = getSelectedLeafConcepts();
    if (selected.length === 0 && state.activeSelectedId) {
      const active = findNodeById(state.treeData, state.activeSelectedId);
      if (active && (!active.children || active.children.length === 0)) {
        selected = [active];
      }
    }

    if (selected.length === 0) {
      showToast('Selecciona con la casilla (checkbox) los conceptos cuya matriz deseas generar con Catálogo Local.', 'warning');
      return;
    }

    if (selected.length === 1) {
      node = selected[0];
      localModalTargetMode = 'single';
      localModalSingleNodeId = node.id;
      state.activeSelectedId = node.id;
    } else {
      localModalTargetMode = 'batch';
      localModalSingleNodeId = null;
      node = selected[0];
    }
  }

  const isParent = node.children && node.children.length > 0;
  if (isParent && localModalTargetMode === 'single') {
    showToast('Selecciona un concepto final (hoja) de la tabla, no una partida agrupada', 'warning');
    return;
  }

  // Llenar datos del concepto en el banner
  const modalPathEl = document.getElementById('local-cat-modal-path');
  const modalClaveEl = document.getElementById('local-cat-modal-clave');
  const modalDescEl = document.getElementById('local-cat-modal-desc');
  const modalUnitEl = document.getElementById('local-cat-modal-unit');
  const modalCantEl = document.getElementById('local-cat-modal-cant');
  const btnConfirm = document.getElementById('btn-confirm-local-generation');

  if (localModalTargetMode === 'batch') {
    const selected = getSelectedLeafConcepts();
    if (modalPathEl) modalPathEl.innerText = `Lote de ${selected.length} conceptos seleccionados con casilla`;
    if (modalClaveEl) modalClaveEl.innerText = `${selected.length} conceptos`;
    if (modalDescEl) modalDescEl.innerText = selected.map(c => `[${c.clave || ''}] ${c.descripcion}`).slice(0, 4).join(', ') + (selected.length > 4 ? ` (+${selected.length - 4} más)` : '');
    if (modalUnitEl) modalUnitEl.innerText = 'Varias';
    if (modalCantEl) modalCantEl.innerText = `${selected.length} conceptos`;
    if (btnConfirm) btnConfirm.innerHTML = `<i class="fa-solid fa-calculator text-[10px] text-amber-200"></i> <span>Generar ${selected.length} Matrices con Seleccionados</span>`;
  } else {
    const pathArr = getNodeHierarchyPath ? getNodeHierarchyPath(state.treeData, node.id) || [] : [];
    const parentPath = pathArr.length > 1 ? pathArr.slice(0, -1).join('  >  ') : 'Partida Principal';
    if (modalPathEl) modalPathEl.innerText = parentPath;
    if (modalClaveEl) modalClaveEl.innerText = node.clave || '---';
    if (modalDescEl) modalDescEl.innerText = node.descripcion || 'Sin descripción';
    if (modalUnitEl) modalUnitEl.innerText = node.unidad || 'pza';
    if (modalCantEl) modalCantEl.innerText = Number(node.cantidad || 1).toLocaleString();
    if (btnConfirm) btnConfirm.innerHTML = `<i class="fa-solid fa-calculator text-[10px] text-amber-200"></i> <span>Generar Matriz para este Concepto</span>`;
  }

  // Cargar lista de catálogos desde IndexedDB
  let catalogs = await listReferenceCatalogs();

  // Si no hay catálogos cargados, auto-instalar catálogo muestra residencial para experiencia inmediata
  if (!catalogs || catalogs.length === 0) {
    showToast('Cargando catálogo muestra Proyecto Residencial...', 'info');
    await installPresetCatalog('catalogo_muestra_residencial');
    catalogs = await listReferenceCatalogs();
  }

  const container = document.getElementById('local-cat-modal-list');
  if (container) {
    if (!catalogs || catalogs.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
          <i class="fa-solid fa-folder-open text-2xl mb-1 text-slate-300"></i>
          <p class="font-medium text-xs">No hay catálogos maestros cargados aún.</p>
          <p class="text-[11px] text-slate-400 mt-1">Abre el "Catálogo Maestro" para importar tus archivos de Opus, Neodata, Excel o presets.</p>
        </div>
      `;
    } else {
      let html = '';
      catalogs.forEach((cat) => {
        const fecha = cat.createdAt ? new Date(cat.createdAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        html += `
          <label class="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-amber-400 bg-white hover:bg-amber-50/40 transition cursor-pointer select-none group shadow-2xs">
            <div class="flex items-center gap-3">
              <input type="checkbox" name="local-cat-choice" value="${cat.id}" checked onchange="updateLocalCatalogSelectedCount()" class="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-slate-300 cursor-pointer">
              <div>
                <span class="font-bold text-xs text-slate-800 group-hover:text-amber-900 block leading-tight">${cat.name}</span>
                <div class="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <span class="bg-slate-100 px-1.5 py-0.2 rounded font-mono text-[9px] font-semibold text-slate-600">${(cat.itemsCount || 0).toLocaleString()} registros</span>
                  <span>•</span>
                  <span>${cat.category || 'General'}</span>
                  ${fecha ? `<span>•</span><span>${fecha}</span>` : ''}
                </div>
              </div>
            </div>
            <span class="text-[10px] text-slate-400 group-hover:text-amber-600 font-mono"><i class="fa-solid fa-book-bookmark"></i></span>
          </label>
        `;
      });
      container.innerHTML = html;
    }
  }

  updateLocalCatalogSelectedCount();

  const modalEl = document.getElementById('modal-local-catalog-selector');
  if (modalEl) modalEl.classList.remove('hidden');
}

// Cerrar modal selector
export function closeLocalCatalogSelectorModal() {
  const modalEl = document.getElementById('modal-local-catalog-selector');
  if (modalEl) modalEl.classList.add('hidden');
}

// Alternar todos los checkboxes
export function toggleSelectAllLocalCatalogs(selectAll) {
  const checkboxes = document.querySelectorAll('input[name="local-cat-choice"]');
  checkboxes.forEach(cb => cb.checked = selectAll);
  updateLocalCatalogSelectedCount();
}

// Actualizar contador de seleccionados
export function updateLocalCatalogSelectedCount() {
  const checked = document.querySelectorAll('input[name="local-cat-choice"]:checked');
  const total = document.querySelectorAll('input[name="local-cat-choice"]');
  const countEl = document.getElementById('local-cat-selected-count');
  if (countEl) {
    countEl.innerText = `${checked.length} de ${total.length}`;
  }
}

// Confirmar selección y ejecutar generación para todos los conceptos seleccionados con casilla
export async function confirmAndExecuteLocalGeneration() {
  const checked = document.querySelectorAll('input[name="local-cat-choice"]:checked');
  if (checked.length === 0) {
    showToast('Selecciona al menos un catálogo para generar la matriz.', 'warning');
    return;
  }

  const selectedCatalogIds = Array.from(checked).map(cb => cb.value);

  const btnConfirm = document.getElementById('btn-confirm-local-generation');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> Generando Matrices...';
  }

  try {
    let targets = [];
    if (localModalTargetMode === 'single') {
      const targetNode = findNodeById(state.treeData, localModalSingleNodeId || state.activeSelectedId);
      if (targetNode && (!targetNode.children || targetNode.children.length === 0)) {
        targets = [targetNode];
      }
    } else {
      targets = getSelectedLeafConcepts();
      if (targets.length === 0 && state.activeSelectedId) {
        const activeNode = findNodeById(state.treeData, state.activeSelectedId);
        if (activeNode && (!activeNode.children || activeNode.children.length === 0)) {
          targets = [activeNode];
        }
      }
    }

    if (targets.length === 0) {
      showToast('No se encontró el concepto para generar la matriz.', 'warning');
      closeLocalCatalogSelectorModal();
      return;
    }

    saveState();

    // Construir contexto de catálogos locales en memoria una sola vez para todo el lote
    const ctx = await buildLocalGenerationContext(selectedCatalogIds);

    let successCount = 0;
    let copiedCount = 0;
    let scratchCount = 0;

    for (const node of targets) {
      const ok = await generateSingleConceptLocalMatrix(node, selectedCatalogIds, ctx);
      if (ok) {
        successCount++;
        if (node._generationMode === 'copy') copiedCount++;
        else scratchCount++;
      }
    }

    persistLocalData();
    renderTAB1();

    if (state.activeSelectedId) {
      const activeNode = findNodeById(state.treeData, state.activeSelectedId);
      if (activeNode) {
        renderAPUInsumos(activeNode);
        renderInsumosUnitarios(activeNode);
      }
    }

    closeLocalCatalogSelectorModal();

    let msg = '';
    if (targets.length === 1) {
      const single = targets[0];
      msg = single._generationMode === 'copy'
        ? '¡Matriz APU integrada con éxito desde concepto similar en catálogo local!'
        : '¡Matriz APU analítica estructurada desde cero con insumos del catálogo local!';
    } else {
      msg = `✅ ${successCount} de ${targets.length} matrices generadas (${copiedCount} copiadas de conceptos similares, ${scratchCount} calculadas desde cero)`;
    }
    showToast(msg, 'success');
  } catch (err) {
    console.error('Error generando matrices locales:', err);
    showToast(`Error al consultar catálogo local: ${err.message}`, 'error');
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = '<i class="fa-solid fa-calculator text-[10px] text-amber-200"></i> <span>Generar Matriz con Seleccionados</span>';
    }
  }
}

/**
 * Genera la matriz APU para un solo concepto específico usando los catálogos de referencia indicados.
 * Sigue los dos pasos requeridos:
 *  1. Busca concepto similar con matriz real y lo copia.
 *  2. Si no existe, interpreta la descripción desde cero y descompone piezas, insumos, cuadrillas y equipos.
 */
export async function generateSingleConceptLocalMatrix(node, catalogIds = 'all', prebuiltCtx = null) {
  if (!node) return false;
  if (node.children && node.children.length > 0) return false;

  const ctx = prebuiltCtx || await buildLocalGenerationContext(catalogIds);
  const result = generateLocalMatrix(node, ctx);

  if (!result || !Array.isArray(result.insumos) || result.insumos.length === 0) {
    return false;
  }

  // Integrar matriz de insumos en el concepto
  node.insumos = result.insumos;
  const totalCD = matrixDirectCost(result.insumos);
  node.costoDirecto = totalCD;

  const factor = getFactorSobrecosto();
  node.precioUnitario = round2(totalCD * factor);
  node._generationMode = result.mode;

  if (result.mode === 'copy' && result.source) {
    const srcName = result.source.sourceName || 'Catálogo Maestro';
    const scorePct = Math.round((result.score || 0) * 100);

    node.googleSearchQueries = [
      `Catálogo Maestro: ${srcName}`,
      `Concepto Sincronizado: ${result.source.clave || ''}`
    ];
    node.googleSources = [
      {
        title: `${srcName} - Clave ${result.source.clave} (${result.source.descripcion.substring(0, 48)}...)`,
        uri: '#'
      }
    ];
    node.aiTips = `Paso 1: Matriz copiada e integrada de concepto similar [${result.source.clave}] "${result.source.descripcion.substring(0, 45)}..." (${scorePct}% afinidad). Insumos, rendimientos y precios unitarios calibrados de obra.`;
  } else {
    const catList = Array.from(result.catalogs || []);
    const catDisplay = catList.length > 0 ? catList.join(', ') : 'Biblioteca Maestro';

    node.googleSearchQueries = [
      `Catálogos Consultados: ${catDisplay}`,
      `Concepto Analizado: ${node.clave || ''} (${(node.descripcion || '').substring(0, 35)}...)`
    ];
    node.googleSources = catList.map(name => ({
      title: `${name} (Biblioteca Local)`,
      uri: '#'
    }));
    node.aiTips = `Paso 2: Matriz estructurada analíticamente desde cero para ${result.familyLabel || 'este concepto'}. Se interpretaron ${result.insumos.length} componentes (materiales, mano de obra, equipo y 3% herramienta menor) con costos unitarios de: ${catDisplay}.`;
  }

  return true;
}

/**
 * Generación de Matriz APU para el concepto activo en la pestaña matriz usando catálogo local.
 */
export async function executeLocalGeneration(catalogIds = 'all') {
  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) {
    showToast('Selecciona primero un concepto en la tabla para generar su matriz.', 'warning');
    return;
  }

  if (node.children && node.children.length > 0) {
    showToast('Esta fila contiene sub-conceptos (partida agrupada) y no admite matriz de insumos.', 'warning');
    return;
  }

  const btnLocal = document.getElementById('btn-ai-apu') || document.getElementById('btn-ai-modal-local');
  const btnLocalMax = document.getElementById('btn-ai-apu-max');
  const originalLocalHtml = btnLocal ? btnLocal.innerHTML : '';
  const originalLocalMaxHtml = btnLocalMax ? btnLocalMax.innerHTML : '';
  if (btnLocal) {
    btnLocal.disabled = true;
    btnLocal.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> <span>Catálogo...</span>';
  }
  if (btnLocalMax) {
    btnLocalMax.disabled = true;
    btnLocalMax.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Consultando Catálogo...</span>';
  }

  try {
    saveState();
    toggleApuSection('matriz', true);

    const ok = await generateSingleConceptLocalMatrix(node, catalogIds);
    if (ok) {
      persistLocalData();
      closeAiGeneratorModal();
      renderAPUInsumos(node);
      renderInsumosUnitarios(node);
      renderTAB1();
      showToast('¡Matriz APU generada exitosamente desde catálogo local!', 'success');
    } else {
      showToast('No se pudo estructurar la matriz para este concepto.', 'warning');
    }
  } catch (err) {
    console.error('Error generando APU con catálogo local:', err);
    showToast(`Error al consultar catálogo local: ${err.message}`, 'error');
  } finally {
    if (btnLocal) {
      btnLocal.disabled = false;
      btnLocal.innerHTML = originalLocalHtml;
    }
    if (btnLocalMax) {
      btnLocalMax.disabled = false;
      btnLocalMax.innerHTML = originalLocalMaxHtml;
    }
  }
}
