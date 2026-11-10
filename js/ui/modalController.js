import { state, persistLocalData, persistSettings } from '../state/store.js';
import { defaultTreeData } from '../config/defaultData.js';
import { saveState, updateUndoRedoButtons } from '../state/history.js';
import { showToast } from './notifications.js';
import { formatQty, round2, round5 } from '../core/formatters.js';
import { getFactorSobrecosto } from '../core/calculations.js';
import { findNodeById, getNodeHierarchyPath, getSelectedLeafConcepts } from '../modules/catalog/treeService.js';
import { renderTAB1, closeApuPanel } from '../modules/catalog/catalogView.js';
import { renderAPUInsumos } from '../modules/apu/apuView.js';
import { renderInsumosGenerales } from '../modules/insumosGenerales/insumosView.js';
import { renderCalendarioObra } from '../modules/calendario/calendarioView.js';
import { renderEstimacionesView } from '../modules/estimaciones/estimacionesView.js';
import { renderBrandingUI } from './brandingController.js';
import { canCurrentUserAccessTab, renderAllTabAssignedMembers } from '../modules/portal/portalController.js';

// Modo de destino del modal Google IA: 'single' (solo concepto activo en matriz) o 'batch' (conceptos con casilla)
export let aiModalTargetMode = 'single';
export let aiModalSingleNodeId = null;

// Modal de Generación APU con Google Search Grounding
export function openAiGeneratorModal(singleSelectedOnly = false) {
  let node = null;
  const isSingle = Boolean(singleSelectedOnly);

  if (isSingle) {
    aiModalTargetMode = 'single';
    aiModalSingleNodeId = state.activeSelectedId;
    if (state.activeSelectedId) {
      node = findNodeById(state.treeData, state.activeSelectedId);
    }
    if (!node) {
      showToast('Selecciona primero un concepto en la tabla para ver y generar su matriz con Google IA.', 'warning');
      return;
    }
  } else {
    const checkedNodes = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
    if (checkedNodes.length === 0 && state.activeSelectedId) {
      const active = findNodeById(state.treeData, state.activeSelectedId);
      if (active && (!active.children || active.children.length === 0)) {
        node = active;
        aiModalTargetMode = 'single';
        aiModalSingleNodeId = active.id;
      }
    } else if (checkedNodes.length === 1) {
      node = checkedNodes[0];
      aiModalTargetMode = 'single';
      aiModalSingleNodeId = node.id;
      state.activeSelectedId = node.id;
    } else if (checkedNodes.length > 1) {
      node = checkedNodes[0];
      aiModalTargetMode = 'batch';
      aiModalSingleNodeId = null;
    }

    if (!node) {
      showToast('Selecciona con la casilla (checkbox) los conceptos que deseas generar con Google IA.', 'warning');
      return;
    }
  }

  const isParent = node.children && node.children.length > 0;
  if (isParent && aiModalTargetMode === 'single') {
    showToast('Selecciona un concepto final (hoja) de la tabla, no una partida agrupada', 'warning');
    return;
  }

  const modalPathEl = document.getElementById('ai-modal-path');
  const modalClaveEl = document.getElementById('ai-modal-clave');
  const modalDescEl = document.getElementById('ai-modal-desc');
  const modalUnidEl = document.getElementById('ai-modal-unid');
  const modalUnidHintEl = document.getElementById('ai-modal-unid-hint');
  const modalCantEl = document.getElementById('ai-modal-cant');
  const btnRun = document.getElementById('btn-ai-modal-run');

  if (aiModalTargetMode === 'batch') {
    const checkedNodes = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
    if (modalPathEl) modalPathEl.innerText = `Lote de ${checkedNodes.length} conceptos seleccionados con casilla`;
    if (modalClaveEl) modalClaveEl.innerText = `${checkedNodes.length} sel.`;
    if (modalDescEl) modalDescEl.innerText = checkedNodes.map(c => `[${c.clave || ''}] ${c.descripcion}`).slice(0, 4).join(', ') + (checkedNodes.length > 4 ? ` (+${checkedNodes.length - 4} más)` : '');
    if (modalUnidEl) modalUnidEl.innerText = 'Varias';
    if (modalUnidHintEl) modalUnidHintEl.innerText = 'cada concepto seleccionado';
    if (modalCantEl) modalCantEl.innerText = `${checkedNodes.length} conceptos`;
    if (btnRun) btnRun.innerHTML = `<i class="fa-brands fa-google text-[10px] text-amber-300"></i> Buscar en Google y Llenar ${checkedNodes.length} Matrices`;
  } else {
    const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
    const parentPath = pathArr.length > 1 ? pathArr.slice(0, -1).join('  >  ') : 'Partida Principal';

    if (modalPathEl) modalPathEl.innerText = parentPath;
    if (modalClaveEl) modalClaveEl.innerText = node.clave || '---';
    if (modalDescEl) modalDescEl.innerText = node.descripcion || 'Sin descripción';
    if (modalUnidEl) modalUnidEl.innerText = node.unidad || 'pza';
    if (modalUnidHintEl) modalUnidHintEl.innerText = `1 ${node.unidad || 'pza'}`;
    if (modalCantEl) modalCantEl.innerText = formatQty(node.cantidad || 1);
    if (btnRun) btnRun.innerHTML = `<i class="fa-brands fa-google text-[10px] text-amber-300"></i> Buscar en Google y Llenar Matriz`;
  }
  
  const modalKeyEl = document.getElementById('ai-modal-api-key');
  if (modalKeyEl) modalKeyEl.value = state.settings.apiKey || '';

  const modalLoadingEl = document.getElementById('ai-modal-loading');
  if (modalLoadingEl) modalLoadingEl.classList.add('hidden');
  const modalErrorEl = document.getElementById('ai-modal-error');
  if (modalErrorEl) modalErrorEl.classList.add('hidden');

  if (btnRun) btnRun.disabled = false;

  const modalEl = document.getElementById('modal-ai-generator');
  if (modalEl) modalEl.classList.remove('hidden');
}

export function closeAiGeneratorModal() {
  const modalEl = document.getElementById('modal-ai-generator');
  if (modalEl) modalEl.classList.add('hidden');
}

export function toggleAiModalKeyVisibility() {
  const input = document.getElementById('ai-modal-api-key');
  const icon = document.getElementById('ai-key-eye-icon');
  if (!input || !icon) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash text-xs';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye text-xs';
  }
}

// Modal de Configuración General
export function openSettingsModal(tab = 'informacion') {
  let targetTab = tab;
  if (!targetTab || targetTab === 'general' || targetTab === 'empresa') {
    targetTab = 'informacion';
  }
  const modalEl = document.getElementById('settings-modal');
  if (modalEl) modalEl.classList.remove('hidden');

  const applyEl = document.getElementById('cfg-apply-sobrecosto');
  if (applyEl) applyEl.checked = state.settings.applySobrecosto;
  const indEl = document.getElementById('cfg-indirectos');
  if (indEl) indEl.value = Number(state.settings.pctIndirectos || 0).toFixed(2);
  const finEl = document.getElementById('cfg-financiamiento');
  if (finEl) finEl.value = Number(state.settings.pctFinanciamiento || 0).toFixed(2);
  const utiEl = document.getElementById('cfg-utilidad');
  if (utiEl) utiEl.value = Number(state.settings.pctUtilidad || 0).toFixed(2);
  const adiEl = document.getElementById('cfg-adicionales');
  if (adiEl) adiEl.value = Number(state.settings.pctAdicionales || 0).toFixed(2);
  const segEl = document.getElementById('cfg-seguros-fianzas');
  if (segEl) segEl.value = Number(state.settings.pctSegurosFianzas ?? 1.00).toFixed(2);
  const fasarEl = document.getElementById('cfg-fasar');
  if (fasarEl) fasarEl.value = Number(state.settings.pctFasar ?? 70.00).toFixed(2);
  const keyEl = document.getElementById('cfg-api-key');
  if (keyEl) keyEl.value = state.settings.apiKey || '';

  // Configuración de Moneda
  const curSelect = document.getElementById('cfg-currency-select');
  const curSymbol = document.getElementById('cfg-currency-symbol');
  const curCode = document.getElementById('cfg-currency-code');
  const curShowCode = document.getElementById('cfg-show-currency-code');

  const curr = state.settings.currency || 'MXN';
  if (curSelect) {
    let found = false;
    for (let i = 0; i < curSelect.options.length; i++) {
      if (curSelect.options[i].value === curr) {
        curSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) curSelect.value = 'CUSTOM';
  }

  if (curSymbol) curSymbol.value = state.settings.currencySymbol || '$';
  if (curCode) curCode.value = state.settings.currency || 'MXN';
  if (curShowCode) curShowCode.checked = state.settings.showCurrencyCode ?? false;

  updateCurrencyPreview();
  updateCalculatedFactorPreview();
  updateFasarPreview();
  renderBrandingUI();
  switchSettingsTab(targetTab);
}

// Actualizar campos al cambiar el selector de moneda
export function onCurrencySelectChange(val) {
  const select = document.getElementById('cfg-currency-select');
  const symbolInput = document.getElementById('cfg-currency-symbol');
  const codeInput = document.getElementById('cfg-currency-code');
  if (!select) return;

  const opt = select.options[select.selectedIndex];
  if (!opt) return;

  if (val !== 'CUSTOM') {
    if (symbolInput) symbolInput.value = opt.dataset.symbol || '$';
    if (codeInput) codeInput.value = opt.dataset.code || val;
  }
  updateCurrencyPreview();
}

// Vista previa dinámica del formato de moneda
export function updateCurrencyPreview() {
  const symbol = (document.getElementById('cfg-currency-symbol')?.value || '$').trim();
  const code = (document.getElementById('cfg-currency-code')?.value || 'MXN').trim();
  const showCode = document.getElementById('cfg-show-currency-code')?.checked ?? false;
  const preview = document.getElementById('cfg-currency-preview');

  if (preview) {
    const codeStr = showCode ? ` ${code}` : '';
    preview.innerText = `${symbol}1,250.00${codeStr}`;
  }
}

export function closeSettingsModal() {
  const modalEl = document.getElementById('settings-modal');
  if (modalEl) modalEl.classList.add('hidden');
}

export function switchSettingsTab(tab) {
  let activeTab = tab;
  if (!activeTab || activeTab === 'general' || activeTab === 'empresa' || activeTab === 'ia') {
    activeTab = 'informacion';
  }
  const tabs = ['informacion', 'sobrecosto', 'datos'];
  tabs.forEach(t => {
    const view = document.getElementById(`modal-view-${t}`);
    const btn = document.getElementById(`modal-tab-${t}`);
    if (t === activeTab) {
      if (view) view.classList.remove('hidden');
      if (btn) btn.className = "py-2 px-3 border-b-2 border-blue-600 text-blue-600 flex items-center gap-1.5";
    } else {
      if (view) view.classList.add('hidden');
      if (btn) btn.className = "py-2 px-3 border-b-2 border-transparent text-slate-600 hover:text-slate-900 flex items-center gap-1.5";
    }
  });
}

export function updateCalculatedFactorPreview() {
  const apply = document.getElementById('cfg-apply-sobrecosto')?.checked ?? false;
  const ind = parseFloat(document.getElementById('cfg-indirectos')?.value) || 0;
  const fin = parseFloat(document.getElementById('cfg-financiamiento')?.value) || 0;
  const uti = parseFloat(document.getElementById('cfg-utilidad')?.value) || 0;
  const adi = parseFloat(document.getElementById('cfg-adicionales')?.value) || 0;
  const seg = parseFloat(document.getElementById('cfg-seguros-fianzas')?.value) || 0;

  const fInd = 1 + (ind / 100);
  const fFin = 1 + (fin / 100);
  const fUtil = 1 + (uti / 100);
  const fCarg = 1 + (adi / 100);
  const fSeg = 1 + (seg / 100);
  const factor = apply ? (fInd * fFin * fUtil * fCarg * fSeg) : 1.0;
  const pct = ((factor - 1) * 100).toFixed(2);

  const previewEl = document.getElementById('cfg-factor-preview');
  if (previewEl) previewEl.innerText = `${factor.toFixed(4)} (+${pct}%)`;
}

// Vista previa dinámica del FASAR
export function updateFasarPreview() {
  const el = document.getElementById('cfg-fasar');
  const badge = document.getElementById('cfg-fasar-badge');
  if (!el || !badge) return;
  const val = parseFloat(el.value) || 0;
  if (val > 0 && val < 5.0) {
    badge.innerText = `${val.toFixed(2)}x`;
  } else {
    const factor = 1 + (val / 100);
    badge.innerText = `${factor.toFixed(2)}x`;
  }
}

export function saveSettings() {
  state.settings.applySobrecosto = document.getElementById('cfg-apply-sobrecosto')?.checked ?? false;
  state.settings.pctIndirectos = parseFloat(parseFloat(document.getElementById('cfg-indirectos')?.value || 0).toFixed(2));
  state.settings.pctFinanciamiento = parseFloat(parseFloat(document.getElementById('cfg-financiamiento')?.value || 0).toFixed(2));
  state.settings.pctUtilidad = parseFloat(parseFloat(document.getElementById('cfg-utilidad')?.value || 0).toFixed(2));
  state.settings.pctAdicionales = parseFloat(parseFloat(document.getElementById('cfg-adicionales')?.value || 0).toFixed(2));
  state.settings.pctSegurosFianzas = parseFloat(parseFloat(document.getElementById('cfg-seguros-fianzas')?.value ?? 1.00).toFixed(2));
  state.settings.pctFasar = parseFloat(parseFloat(document.getElementById('cfg-fasar')?.value ?? 70.00).toFixed(2));
  const keyInput = document.getElementById('cfg-api-key');
  if (keyInput) {
    state.settings.apiKey = (keyInput.value || '').trim();
  }

  // Guardar Moneda de Trabajo
  const newCurrency = (document.getElementById('cfg-currency-code')?.value || 'MXN').trim().toUpperCase();
  const newSymbol = (document.getElementById('cfg-currency-symbol')?.value || '$').trim();
  const showCode = document.getElementById('cfg-show-currency-code')?.checked ?? false;

  state.settings.currency = newCurrency;
  state.settings.currencySymbol = newSymbol;
  state.settings.showCurrencyCode = showCode;

  // Guardar Datos de Empresa, Proyecto, Ubicación y Logo
  const compName = (document.getElementById('cfg-company-name')?.value || '').trim();
  if (compName) state.settings.companyName = compName;
  const projName = (document.getElementById('cfg-project-name')?.value || '').trim();
  if (projName) state.settings.projectName = projName;
  const projLoc = (document.getElementById('cfg-project-location')?.value || '').trim();
  if (projLoc) state.settings.projectLocation = projLoc;
  const compSub = (document.getElementById('cfg-company-subtitle')?.value || '').trim();
  state.settings.companySubtitle = compSub;
  renderBrandingUI();
  persistSettings();

  // Recalcular precios unitarios de todos los conceptos con APU
  const factor = getFactorSobrecosto();
  function applyFactorRecursive(nodes) {
    nodes.forEach(n => {
      if (n.insumos && n.insumos.length > 0) {
        const cd = round2(n.insumos.reduce((s, i) => s + round2(round5(i.cantidad || 0) * round2(i.costoUnitario || 0)), 0));
        n.costoDirecto = cd;
        n.precioUnitario = round2(cd * factor);
      }
      if (n.children && n.children.length > 0) {
        applyFactorRecursive(n.children);
      }
    });
  }
  applyFactorRecursive(state.treeData);

  closeSettingsModal();
  persistLocalData();
  // closeApuPanel() ya limpia activeSelectedId y ejecuta renderTAB1() una sola vez

  if (state.activeSelectedId) {
    const sel = findNodeById(state.treeData, state.activeSelectedId);
    if (sel && (!sel.children || sel.children.length === 0)) { renderAPUInsumos(sel); } else { renderTAB1(); }
  } else {
    renderTAB1();
  }

  // Re-renderizar Insumos Generales para actualizar encabezados y totales con la nueva moneda
  const viewInsumosEl = document.getElementById('view-insumos');
  if (!viewInsumosEl || !viewInsumosEl.classList.contains('hidden')) { renderInsumosGenerales(); }

  showToast(`✅ Configuración guardada. Moneda activa: ${newSymbol} (${newCurrency})`, 'success');
}

export function toggleApiKeyVisibility() {
  const input = document.getElementById('cfg-api-key');
  const icon = document.getElementById('eye-icon');
  if (!input || !icon) return;
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash text-xs';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye text-xs';
  }
}

export function resetToDemoData() {
  if (!confirm('¿Restablecer el catálogo al ejemplo demo? Se sobrescribirán los datos actuales.')) return;
  state.treeData = JSON.parse(JSON.stringify(defaultTreeData));
  saveState();
  closeSettingsModal();
  closeApuPanel();
  // closeApuPanel() ya limpia activeSelectedId y ejecuta renderTAB1() una sola vez
  showToast('Catálogo demo restablecido', 'info');
}

export function clearAllData() {
  if (!confirm('¿Estás seguro de vaciar todo el catálogo de obra?')) return;
  state.treeData = [];
  saveState();
  closeSettingsModal();
  closeApuPanel();
  // closeApuPanel() ya limpia activeSelectedId y ejecuta renderTAB1() una sola vez
  showToast('Presupuesto vaciado', 'warning');
}

// Cambio de pestañas principales: Catálogo vs Insumos Generales vs Calendario de Obra vs Estimaciones
export function switchTab(tab) {
  if (typeof canCurrentUserAccessTab === 'function' && !canCurrentUserAccessTab(tab)) {
    const tabNames = {
      cat: 'Catálogo Base',
      insumos: 'Insumos Base',
      calendario: 'Calendario de Obra',
      estimaciones: 'Estimaciones de Obra'
    };
    showToast(`🔒 No tienes permiso asignado para acceder a la pestaña "${tabNames[tab] || tab}". Esta pestaña está restringida solo a los miembros autorizados por el administrador.`, 'warning');
    return;
  }

  const viewCat = document.getElementById('view-cat');
  const viewInsumos = document.getElementById('view-insumos');
  const viewCalendario = document.getElementById('view-calendario');
  const viewEstimaciones = document.getElementById('view-estimaciones');
  const btnCat = document.getElementById('tab-btn-cat');
  const btnInsumos = document.getElementById('tab-btn-insumos');
  const btnCalendario = document.getElementById('tab-btn-calendario');
  const btnEstimaciones = document.getElementById('tab-btn-estimaciones');
  if (!viewCat || !viewInsumos || !btnCat || !btnInsumos) return;

  const activeClass = "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs";
  const inactiveClass = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer";

  viewCat.classList.add('hidden');
  viewInsumos.classList.add('hidden');
  if (viewCalendario) viewCalendario.classList.add('hidden');
  if (viewEstimaciones) viewEstimaciones.classList.add('hidden');

  btnCat.className = inactiveClass;
  btnInsumos.className = inactiveClass;
  if (btnCalendario) btnCalendario.className = inactiveClass;
  if (btnEstimaciones) btnEstimaciones.className = inactiveClass;

  if (tab === 'cat') {
    viewCat.classList.remove('hidden');
    btnCat.className = activeClass;
  } else if (tab === 'insumos') {
    viewInsumos.classList.remove('hidden');
    btnInsumos.className = activeClass;
    const viewInsumosEl = document.getElementById('view-insumos');
  if (!viewInsumosEl || !viewInsumosEl.classList.contains('hidden')) { renderInsumosGenerales(); }
  } else if (tab === 'calendario') {
    if (viewCalendario) viewCalendario.classList.remove('hidden');
    if (btnCalendario) btnCalendario.className = activeClass;
    renderCalendarioObra();
  } else if (tab === 'estimaciones') {
    if (viewEstimaciones) viewEstimaciones.classList.remove('hidden');
    if (btnEstimaciones) btnEstimaciones.className = activeClass;
    renderEstimacionesView();
  }
  updateUndoRedoButtons();
  if (typeof renderAllTabAssignedMembers === 'function') {
    renderAllTabAssignedMembers();
  }
}

