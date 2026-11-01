import { state, persistLocalData } from '../state/store.js';
import { SETTINGS_KEY } from '../config/constants.js';
import { defaultTreeData } from '../config/defaultData.js';
import { saveState, updateUndoRedoButtons } from '../state/history.js';
import { showToast } from './notifications.js';
import { formatQty } from '../core/formatters.js';
import { getFactorSobrecosto } from '../core/calculations.js';
import { findNodeById, getNodeHierarchyPath } from '../modules/catalog/treeService.js';
import { renderTAB1, closeApuPanel } from '../modules/catalog/catalogView.js';
import { renderAPUInsumos } from '../modules/apu/apuView.js';
import { renderInsumosGenerales } from '../modules/insumosGenerales/insumosView.js';
import { renderBrandingUI } from './brandingController.js';

// Modal de Generación APU con Google Search Grounding
export function openAiGeneratorModal() {
  if (!state.activeSelectedId) {
    showToast('Selecciona un concepto en la tabla TAB1-CAT-BASE primero', 'warning');
    return;
  }

  const node = findNodeById(state.treeData, state.activeSelectedId);
  if (!node) return;

  const isParent = node.children && node.children.length > 0;
  if (isParent) {
    showToast('Selecciona un concepto final (hoja) de la tabla, no una partida agrupada', 'warning');
    return;
  }

  const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
  const parentPath = pathArr.length > 1 ? pathArr.slice(0, -1).join('  >  ') : 'Partida Principal';

  const modalPathEl = document.getElementById('ai-modal-path');
  if (modalPathEl) modalPathEl.innerText = parentPath;
  const modalClaveEl = document.getElementById('ai-modal-clave');
  if (modalClaveEl) modalClaveEl.innerText = node.clave || '---';
  const modalDescEl = document.getElementById('ai-modal-desc');
  if (modalDescEl) modalDescEl.innerText = node.descripcion || 'Sin descripción';
  const modalUnidEl = document.getElementById('ai-modal-unid');
  if (modalUnidEl) modalUnidEl.innerText = node.unidad || 'pza';
  const modalUnidHintEl = document.getElementById('ai-modal-unid-hint');
  if (modalUnidHintEl) modalUnidHintEl.innerText = `1 ${node.unidad || 'pza'}`;
  const modalCantEl = document.getElementById('ai-modal-cant');
  if (modalCantEl) modalCantEl.innerText = formatQty(node.cantidad || 1);
  
  const modalKeyEl = document.getElementById('ai-modal-api-key');
  if (modalKeyEl) modalKeyEl.value = state.settings.apiKey || '';

  const modalLoadingEl = document.getElementById('ai-modal-loading');
  if (modalLoadingEl) modalLoadingEl.classList.add('hidden');
  const modalErrorEl = document.getElementById('ai-modal-error');
  if (modalErrorEl) modalErrorEl.classList.add('hidden');

  const btnRun = document.getElementById('btn-ai-modal-run');
  if (btnRun) btnRun.disabled = false;
  const btnLocal = document.getElementById('btn-ai-modal-local');
  if (btnLocal) btnLocal.disabled = false;

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
  if (!activeTab || activeTab === 'general' || activeTab === 'empresa') {
    activeTab = 'informacion';
  }
  const tabs = ['informacion', 'sobrecosto', 'ia', 'datos'];
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

  const fInd = 1 + (ind / 100);
  const fFin = 1 + (fin / 100);
  const fUtil = 1 + (uti / 100);
  const fCarg = 1 + (adi / 100);
  const factor = apply ? (fInd * fFin * fUtil * fCarg) : 1.0;
  const pct = ((factor - 1) * 100).toFixed(2);

  const previewEl = document.getElementById('cfg-factor-preview');
  if (previewEl) previewEl.innerText = `${factor.toFixed(4)} (+${pct}%)`;
}

export function saveSettings() {
  state.settings.applySobrecosto = document.getElementById('cfg-apply-sobrecosto')?.checked ?? false;
  state.settings.pctIndirectos = parseFloat(parseFloat(document.getElementById('cfg-indirectos')?.value || 0).toFixed(2));
  state.settings.pctFinanciamiento = parseFloat(parseFloat(document.getElementById('cfg-financiamiento')?.value || 0).toFixed(2));
  state.settings.pctUtilidad = parseFloat(parseFloat(document.getElementById('cfg-utilidad')?.value || 0).toFixed(2));
  state.settings.pctAdicionales = parseFloat(parseFloat(document.getElementById('cfg-adicionales')?.value || 0).toFixed(2));
  state.settings.apiKey = (document.getElementById('cfg-api-key')?.value || '').trim();

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

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (e) {
    console.error('Error guardando settings:', e);
  }

  // Recalcular precios unitarios de todos los conceptos con APU
  const factor = getFactorSobrecosto();
  function applyFactorRecursive(nodes) {
    nodes.forEach(n => {
      if (n.insumos && n.insumos.length > 0) {
        const cd = n.insumos.reduce((s, i) => s + ((i.cantidad || 0) * (i.costoUnitario || 0)), 0);
        n.costoDirecto = cd;
        n.precioUnitario = cd * factor;
      }
      if (n.children && n.children.length > 0) {
        applyFactorRecursive(n.children);
      }
    });
  }
  applyFactorRecursive(state.treeData);

  closeSettingsModal();
  persistLocalData();
  renderTAB1();

  if (state.activeSelectedId) {
    const sel = findNodeById(state.treeData, state.activeSelectedId);
    if (sel) renderAPUInsumos(sel);
  }

  // Re-renderizar Insumos Generales para actualizar encabezados y totales con la nueva moneda
  renderInsumosGenerales();

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
  renderTAB1();
  showToast('Catálogo demo restablecido', 'info');
}

export function clearAllData() {
  if (!confirm('¿Estás seguro de vaciar todo el catálogo de obra?')) return;
  state.treeData = [];
  saveState();
  closeSettingsModal();
  closeApuPanel();
  renderTAB1();
  showToast('Presupuesto vaciado', 'warning');
}

// Cambio de pestañas principales: Catálogo vs Insumos Generales
export function switchTab(tab) {
  const viewCat = document.getElementById('view-cat');
  const viewInsumos = document.getElementById('view-insumos');
  const btnCat = document.getElementById('tab-btn-cat');
  const btnInsumos = document.getElementById('tab-btn-insumos');
  if (!viewCat || !viewInsumos || !btnCat || !btnInsumos) return;

  if (tab === 'cat') {
    viewCat.classList.remove('hidden');
    viewInsumos.classList.add('hidden');
    btnCat.className = "px-3 py-1 rounded text-xs font-semibold bg-blue-600 text-white transition flex items-center gap-1.5";
    btnInsumos.className = "px-3 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5";
  } else {
    viewCat.classList.add('hidden');
    viewInsumos.classList.remove('hidden');
    btnCat.className = "px-3 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5";
    btnInsumos.className = "px-3 py-1 rounded text-xs font-semibold bg-blue-600 text-white transition flex items-center gap-1.5";
    renderInsumosGenerales();
  }
  updateUndoRedoButtons();
}
