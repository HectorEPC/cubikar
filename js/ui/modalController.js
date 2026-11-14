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
import { renderExpensesView } from '../modules/compras/expensesView.js';
import { renderBitacoraView } from '../modules/bitacora/bitacoraView.js';
import { renderBrandingUI } from './brandingController.js';
import { canCurrentUserAccessTab, renderAllTabAssignedMembers } from '../modules/portal/portalController.js';
import { getAiQuotaBadgeSummary, syncAiQuotaFromSupabase } from '../modules/ai/aiQuotaAndCacheService.js';

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
  } else {
    const pathArr = getNodeHierarchyPath(state.treeData, node.id) || [];
    const parentPath = pathArr.length > 1 ? pathArr.slice(0, -1).join('  >  ') : 'Partida Principal';

    if (modalPathEl) modalPathEl.innerText = parentPath;
    if (modalClaveEl) modalClaveEl.innerText = node.clave || '---';
    if (modalDescEl) modalDescEl.innerText = node.descripcion || 'Sin descripción';
    if (modalUnidEl) modalUnidEl.innerText = node.unidad || 'pza';
    if (modalUnidHintEl) modalUnidHintEl.innerText = `1 ${node.unidad || 'pza'}`;
    if (modalCantEl) modalCantEl.innerText = formatQty(node.cantidad || 1);
  }
  
  const modalKeyEl = document.getElementById('ai-modal-api-key');
  if (modalKeyEl) modalKeyEl.value = state.settings.apiKey || '';

  const webCheckEl = document.getElementById('ai-modal-use-web-search');
  if (webCheckEl) webCheckEl.checked = false;

  const modalLoadingEl = document.getElementById('ai-modal-loading');
  if (modalLoadingEl) modalLoadingEl.classList.add('hidden');
  const modalErrorEl = document.getElementById('ai-modal-error');
  if (modalErrorEl) modalErrorEl.classList.add('hidden');

  if (btnRun) btnRun.disabled = false;

  refreshAiQuotaBadges();
  updateAiModalRunButtonLabel();
  syncAiQuotaFromSupabase().then(synced => {
    if (synced) refreshAiQuotaBadges();
  }).catch(() => {});

  const modalEl = document.getElementById('modal-ai-generator');
  if (modalEl) modalEl.classList.remove('hidden');
}

export function updateAiModalRunButtonLabel() {
  const btnRun = document.getElementById('btn-ai-modal-run');
  if (!btnRun) return;
  const webCheckEl = document.getElementById('ai-modal-use-web-search');
  const useWeb = Boolean(webCheckEl && webCheckEl.checked);
  const checkedNodes = getSelectedLeafConcepts ? getSelectedLeafConcepts() : [];
  const count = aiModalTargetMode === 'batch' ? checkedNodes.length : 1;

  if (useWeb) {
    btnRun.className = 'px-4 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded font-medium shadow-sm transition text-xs flex items-center gap-1.5 hover:scale-105 active:scale-95';
    btnRun.innerHTML = aiModalTargetMode === 'batch'
      ? `<i class="fa-solid fa-globe text-[10px] text-amber-200"></i> Cotizar en Web y Llenar ${count} Matrices`
      : `<i class="fa-solid fa-globe text-[10px] text-amber-200"></i> Cotizar en Web y Llenar Matriz`;
  } else {
    btnRun.className = 'px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded font-medium shadow-sm transition text-xs flex items-center gap-1.5 hover:scale-105 active:scale-95';
    btnRun.innerHTML = aiModalTargetMode === 'batch'
      ? `<i class="fa-solid fa-microchip text-[10px] text-sky-200"></i> Generar ${count} Matrices (IA Estándar)`
      : `<i class="fa-solid fa-microchip text-[10px] text-sky-200"></i> Generar Matriz (IA Estándar)`;
  }
}

export function refreshAiQuotaBadges() {
  try {
    const summary = getAiQuotaBadgeSummary();
    if (!summary) return;

    const modalKeyVal = document.getElementById('ai-modal-api-key')?.value?.trim() || '';
    const usingOwnKey = summary.usingOwnApiKey || Boolean(modalKeyVal);

    const bannerEl = document.getElementById('ai-modal-quota-banner');
    if (bannerEl) {
      const keyBadge = usingOwnKey
        ? '<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">API Key Propia: Ilimitado</span>'
        : `<span class="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">Plan ${summary.planName}</span>`;
      const stdText = usingOwnKey ? 'Ilimitado' : `${summary.stdUsed}/${summary.stdMax} este mes`;
      const webText = usingOwnKey ? 'Ilimitado' : `${summary.webUsed}/${summary.webMax} este mes`;
      bannerEl.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
          <div class="flex items-center gap-1.5">
            ${keyBadge}
            <span class="text-slate-700 font-medium">IA Estándar: <strong>${stdText}</strong></span>
          </div>
          <div class="flex items-center gap-2 text-slate-600">
            <span>Web Search: <strong class="${!usingOwnKey && summary.webMax === 0 ? 'text-rose-600' : 'text-amber-700'}">${webText}</strong></span>
            <span class="text-emerald-700">Caché: <strong>${summary.cacheEntries}</strong></span>
          </div>
        </div>
      `;
    }

    const webCheckEl = document.getElementById('ai-modal-use-web-search');
    const webHintEl = document.getElementById('ai-modal-web-search-hint');
    if (webCheckEl) {
      const webBlocked = !usingOwnKey && summary.webMax <= 0;
      if (webBlocked) {
        webCheckEl.checked = false;
        webCheckEl.disabled = true;
        if (webHintEl) {
          webHintEl.innerText = 'Bloqueado en Plan Gratuita (requiere Plan Plus/Pro o tu propia API Key).';
          webHintEl.className = 'text-[10px] text-rose-600 block mt-0.5';
        }
      } else {
        webCheckEl.disabled = false;
        if (webHintEl) {
          webHintEl.innerText = usingOwnKey
            ? 'API Key propia detectada: puedes activar Google Search Grounding sin consumir cuota de la cuenta.'
            : `Cuota disponible este mes: ${Math.max(0, summary.webMax - summary.webUsed)} de ${summary.webMax} consultas Web en Vivo.`;
          webHintEl.className = 'text-[10px] text-amber-700 block mt-0.5';
        }
      }
      updateAiModalRunButtonLabel();
    }
  } catch (err) {
    console.warn('[UI] refreshAiQuotaBadges error:', err);
  }
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
export let activePresupuestoSubTab = 'cat';

export function switchPresupuestoSubTab(subTab) {
  if ((subTab === 'cat' || subTab === 'insumos') && typeof canCurrentUserAccessTab === 'function' && !canCurrentUserAccessTab(subTab)) {
    const label = subTab === 'cat' ? 'Catálogo Base y APU' : 'Insumos Generales';
    showToast(`🔒 No tienes permiso asignado para acceder a "${label}".`, 'warning');
    return;
  }
  activePresupuestoSubTab = subTab;
  const viewCat = document.getElementById('view-cat');
  const viewInsumos = document.getElementById('view-insumos');
  const subBtnCat = document.getElementById('subtab-btn-cat');
  const subBtnInsumos = document.getElementById('subtab-btn-insumos');

  const activeSubClass = "px-3 py-1 rounded-md text-xs font-bold bg-blue-600 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer";
  const inactiveSubClass = "px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition flex items-center gap-1.5 cursor-pointer";

  if (subTab === 'cat') {
    if (viewCat) viewCat.classList.remove('hidden');
    if (viewInsumos) viewInsumos.classList.add('hidden');
    if (subBtnCat) subBtnCat.className = activeSubClass;
    if (subBtnInsumos) subBtnInsumos.className = inactiveSubClass;
  } else if (subTab === 'insumos') {
    if (viewCat) viewCat.classList.add('hidden');
    if (viewInsumos) viewInsumos.classList.remove('hidden');
    if (subBtnCat) subBtnCat.className = inactiveSubClass;
    if (subBtnInsumos) subBtnInsumos.className = activeSubClass;
    renderInsumosGenerales();
  }
  updateUndoRedoButtons();
}

export function switchTab(tab) {
  // Soporte directo para 'cat' e 'insumos' redirigiendo a la pestaña unificada 'presupuesto'
  let targetTab = tab;
  let targetSubTab = null;
  if (tab === 'cat') {
    targetTab = 'presupuesto';
    targetSubTab = 'cat';
  } else if (tab === 'insumos') {
    targetTab = 'presupuesto';
    targetSubTab = 'insumos';
  } else if (tab === 'presupuesto' && typeof canCurrentUserAccessTab === 'function') {
    // Si un colaborador invitado solo tiene permiso en Insumos (y no en Catálogo), abrir directo en Insumos
    if (!canCurrentUserAccessTab('cat') && canCurrentUserAccessTab('insumos')) {
      targetSubTab = 'insumos';
    }
  }

  const accessCheckKey = targetSubTab || targetTab;
  if (typeof canCurrentUserAccessTab === 'function' && !canCurrentUserAccessTab(accessCheckKey)) {
    const tabNames = {
      presupuesto: 'Presupuesto',
      cat: 'Catálogo Base y APU',
      insumos: 'Insumos Generales',
      calendario: 'Calendario de Obra',
      estimaciones: 'Estimaciones de Obra',
      compras: 'Compras y Pagos',
      bitacora: 'Bitácora de Obra'
    };
    showToast(`🔒 No tienes permiso asignado para acceder a la pestaña "${tabNames[accessCheckKey] || accessCheckKey}". Esta pestaña está restringida solo a los miembros autorizados por el administrador.`, 'warning');
    return;
  }

  const viewCat = document.getElementById('view-cat');
  const viewInsumos = document.getElementById('view-insumos');
  const viewCalendario = document.getElementById('view-calendario');
  const viewEstimaciones = document.getElementById('view-estimaciones');
  const viewCompras = document.getElementById('view-compras');
  const viewBitacora = document.getElementById('view-bitacora');

  const btnPresupuesto = document.getElementById('tab-btn-presupuesto') || document.getElementById('tab-btn-cat');
  const btnInsumos = document.getElementById('tab-btn-insumos');
  const btnCalendario = document.getElementById('tab-btn-calendario');
  const btnEstimaciones = document.getElementById('tab-btn-estimaciones');
  const btnCompras = document.getElementById('tab-btn-compras');
  const btnBitacora = document.getElementById('tab-btn-bitacora');

  const activeClass = "px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs";
  const inactiveClass = "px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer";

  if (viewCat) viewCat.classList.add('hidden');
  if (viewInsumos) viewInsumos.classList.add('hidden');
  if (viewCalendario) viewCalendario.classList.add('hidden');
  if (viewEstimaciones) viewEstimaciones.classList.add('hidden');
  if (viewCompras) viewCompras.classList.add('hidden');
  if (viewBitacora) viewBitacora.classList.add('hidden');

  if (btnPresupuesto) btnPresupuesto.className = inactiveClass;
  if (btnInsumos) btnInsumos.className = inactiveClass;
  if (btnCalendario) btnCalendario.className = inactiveClass;
  if (btnEstimaciones) btnEstimaciones.className = inactiveClass;
  if (btnCompras) btnCompras.className = inactiveClass;
  if (btnBitacora) btnBitacora.className = inactiveClass;

  if (targetTab === 'presupuesto') {
    if (btnPresupuesto) btnPresupuesto.className = activeClass;
    if (targetSubTab) {
      switchPresupuestoSubTab(targetSubTab);
    } else {
      const preferred = activePresupuestoSubTab || 'cat';
      const fallbackSub = (typeof canCurrentUserAccessTab === 'function' && !canCurrentUserAccessTab(preferred))
        ? (canCurrentUserAccessTab('cat') ? 'cat' : 'insumos')
        : preferred;
      switchPresupuestoSubTab(fallbackSub);
    }
  } else if (tab === 'calendario') {
    if (viewCalendario) viewCalendario.classList.remove('hidden');
    if (btnCalendario) btnCalendario.className = activeClass;
    renderCalendarioObra();
  } else if (tab === 'estimaciones') {
    if (viewEstimaciones) viewEstimaciones.classList.remove('hidden');
    if (btnEstimaciones) btnEstimaciones.className = activeClass;
    renderEstimacionesView();
  } else if (tab === 'compras') {
    if (viewCompras) viewCompras.classList.remove('hidden');
    if (btnCompras) btnCompras.className = activeClass;
    renderExpensesView();
  } else if (tab === 'bitacora') {
    if (viewBitacora) viewBitacora.classList.remove('hidden');
    if (btnBitacora) btnBitacora.className = activeClass;
    renderBitacoraView();
  }
  updateUndoRedoButtons();
  if (typeof renderAllTabAssignedMembers === 'function') {
    renderAllTabAssignedMembers();
  }
  if (typeof window.onGlobalActiveTabChange === 'function') {
    try {
      window.onGlobalActiveTabChange(tab);
    } catch (e) {}
  }
}

// Modal de Información de la Plataforma (Hero, Funciones Estrella y Comparativo)
export function openPlatformInfoModal() {
  const modal = document.getElementById('modal-platform-info');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closePlatformInfoModal() {
  const modal = document.getElementById('modal-platform-info');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function handlePlatformInfoEmpiezaGratis() {
  closePlatformInfoModal();
  const user = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
  if (!user) {
    if (typeof window.renderPortalAuth === 'function') {
      window.renderPortalAuth('register');
    }
  } else {
    if (typeof window.openNuevoProyectoModal === 'function') {
      window.openNuevoProyectoModal();
    } else if (typeof window.renderPortalDashboard === 'function') {
      window.renderPortalDashboard();
    }
  }
}

export function handlePlatformInfoVerPlanes() {
  closePlatformInfoModal();
  if (typeof window.openSubscriptionModal === 'function') {
    window.openSubscriptionModal();
  }
}

// =========================================================================
// CIERRE AUTOMÁTICO AL HACER CLIC FUERA DE VENTANAS FLOTANTES Y MODALES
// =========================================================================

const BACKDROP_MODAL_CLOSERS = {
  'modal-ai-generator': () => window.closeAiGeneratorModal?.(),
  'modal-local-catalog-selector': () => window.closeLocalCatalogSelectorModal?.(),
  'matriz-modal': () => window.closeMatrizModal?.(),
  'settings-modal': () => window.closeSettingsModal?.(),
  'logo-adjuster-modal': () => window.closeLogoAdjusterModal?.(),
  'universal-import-modal': () => window.closeImportModal?.(),
  'catalog-export-modal': () => window.closeExportModal?.(),
  'master-catalog-modal': () => window.closeMasterCatalogModal?.(),
  'apu-reference-modal': () => window.closeApuReferenceModal?.(),
  'modal-combinar-insumos': () => window.closeCombinarModal?.(),
  'modal-google-auth': () => window.closeGoogleAuthModal?.(),
  comparisonModal: () => window.toggleComparisonModal?.(),
  'modal-nuevo-proyecto': () => window.closeNuevoProyectoModal?.(),
  'modal-editar-proyecto': () => window.closeEditarProyectoModal?.(),
  'modal-perfil-usuario': () => window.closeProfileModal?.(),
  'modal-asignar-miembros-pestana': () => window.closeTabMembersAssignModal?.(),
  'modal-calendario-jornada': () => window.closeCalendarioJornadaModal?.(),
  'modal-invitaciones-plan': () => window.closePlanInviteModal?.(),
  'modal-invitar-usuario': () => window.closeInviteModal?.(),
  'modal-copiar-de-otro-proyecto': () => window.closeImportConceptsModal?.(),
  'modal-platform-info': () => window.closePlatformInfoModal?.(),
  'modal-suscripcion-usuario': () => window.closeSubscriptionModal?.(),
  'modal-admin-dual-login': () => {
    if (typeof window._adminChoiceCommon === 'function') {
      window._adminChoiceCommon();
      return;
    }
    const modal = document.getElementById('modal-admin-dual-login');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
  },
  'modal-admin-cubikar': () => window.closeCubikarAdminModal?.(),
  'modal-admin-coadmins': () => window.closeCoAdminsModal?.(),
  'modal-admin-market-rates': () => window.closeMarketRatesModal?.(),
  'modal-admin-cloud-config': () => window.closeCloudConfigModal?.(),
  'modal-presupuesto-firmas': () => window.closePresupuestoSignaturesModal?.(),
  'modal-compras-firmas': () => window.closeExpensesSignaturesModal?.(),
  'modal-nueva-compra': () => window.closeNewExpenseModal?.(),
  'modal-lista-proveedores': () => window.closeSuppliersListModal?.(),
  'modal-nuevo-proveedor': () => window.closeSupplierModal?.(),
  'modal-bitacora-note': () => window.closeBitacoraModal?.(),
  'modal-bitacora-sign': () => window.closeBitacoraModal?.(),
  'modal-bitacora-config': () => window.closeBitacoraModal?.(),
  'modal-bitacora-lightbox': () => window.closeBitacoraModal?.(),
  'modal-bitacora-downloads': () => window.closeBitacoraModal?.(),
  'modal-calendario-dependencias': () => window.closeConceptDependenciesModal?.(),
  'modal-calendario-ia': () => window.closeCalendarioAiModal?.(),
  'estimacion-fotos-modal': () => window.closeEstimacionConceptPhotosModal?.(),
  'modal-factura-estimacion': () => (window.closeFacturaModal || window.closeFacturaEstimacionModal)?.(),
  'modal-word-spellcheck': () => window.closeSpellCheckModal?.()
};

let floatingOutsideCloseBound = false;
let lastFloatingPointerDownTarget = null;
let hadAiSplitMenuOpenOnPointerDown = false;

function isFloatingElementVisible(el) {
  if (!el || !el.isConnected || el.classList.contains('hidden')) return false;
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function getEffectiveZIndex(el) {
  if (!el || typeof getComputedStyle !== 'function') return 0;
  const parsed = Number.parseInt(getComputedStyle(el).zIndex, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTopmostVisibleBackdropModal() {
  if (typeof document === 'undefined') return null;
  const visible = Array.from(document.querySelectorAll('.fixed.inset-0')).filter(isFloatingElementVisible);
  if (visible.length === 0) return null;

  return visible.reduce((topEl, candidate) => {
    if (!topEl) return candidate;
    const zDiff = getEffectiveZIndex(candidate) - getEffectiveZIndex(topEl);
    if (zDiff > 0) return candidate;
    if (zDiff < 0) return topEl;
    // Desempate por orden real de apilamiento en el DOM (último queda al frente)
    return (topEl.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) ? candidate : topEl;
  }, null);
}

function closeBackdropModalElement(modalEl) {
  if (!modalEl) return;
  const mappedCloser = modalEl.id ? BACKDROP_MODAL_CLOSERS[modalEl.id] : null;
  if (typeof mappedCloser === 'function') {
    mappedCloser();
  }

  if (!isFloatingElementVisible(modalEl)) return;

  const fallbackCloseBtn = modalEl.querySelector('button[onclick*="close" i], button[onclick*="Close"]');
  if (fallbackCloseBtn && typeof fallbackCloseBtn.click === 'function') {
    fallbackCloseBtn.click();
  }

  if (isFloatingElementVisible(modalEl)) {
    modalEl.classList.add('hidden');
    if (modalEl.style && modalEl.style.display === 'flex') {
      modalEl.style.display = 'none';
    }
  }
}

function isClickInsideElement(target, downTarget, containerEl) {
  if (!containerEl) return false;
  return (target instanceof Node && containerEl.contains(target)) ||
    (downTarget instanceof Node && containerEl.contains(downTarget));
}

function isTargetOrOriginInsideSelector(target, downTarget, selector) {
  const toElement = (node) => (node instanceof Element ? node : node?.parentElement || null);
  const check = (node) => {
    const el = toElement(node);
    return Boolean(el && el.closest(selector));
  };
  return check(target) || check(downTarget);
}

const SINGLE_POPOVER_CLOSE_RULES = [
  {
    isOpen: () =>
      isFloatingElementVisible(document.getElementById('portal-notifications-popover')) ||
      isFloatingElementVisible(document.getElementById('sidebar-notifications-popover')),
    allowedSelector: '#portal-notifications-wrapper, #sidebar-notifications-wrapper',
    close: () => window.closeMentionNotificationsPopover?.()
  },
  {
    isOpen: () => isFloatingElementVisible(document.getElementById('workspace-user-dropdown')),
    allowedSelector: '#user-menu-wrapper',
    close: () => window.closeUserDropdown?.()
  },
  {
    isOpen: () => isFloatingElementVisible(document.getElementById('portal-user-dropdown')),
    allowedSelector: '#portal-user-menu-wrapper',
    close: () => window.closePortalUserDropdown?.()
  },
  {
    isOpen: () => isFloatingElementVisible(document.getElementById('cubikar-chat-dock')),
    allowedSelector: '#cubikar-chat-dock, #sidebar-project-chat-wrapper, #btn-sidebar-project-chat, [onclick*="openProjectChatForPartida"], [onclick*="toggleProjectChatDock"]',
    close: () => window.toggleProjectChatDock?.(false)
  }
];

function closeOpenNonModalPopovers(target, downTarget) {
  SINGLE_POPOVER_CLOSE_RULES.forEach((rule) => {
    if (rule.isOpen() && !isTargetOrOriginInsideSelector(target, downTarget, rule.allowedSelector)) {
      rule.close();
    }
  });

  document.querySelectorAll('[id^="menu-card-"]:not(.hidden)').forEach((menuEl) => {
    if (!isClickInsideElement(target, downTarget, menuEl.parentElement || menuEl)) {
      menuEl.classList.add('hidden');
    }
  });

  document.querySelectorAll('.dropdown-menu.show').forEach((menuEl) => {
    const container = menuEl.closest('.dropdown-container') || menuEl;
    if (!isClickInsideElement(target, downTarget, container)) {
      menuEl.classList.remove('show', 'dropdown-menu-up');
      if (container !== menuEl) container.classList.remove('is-open');
    }
  });
}

/**
 * Registra listeners globales en fase de captura para cerrar modales, menús y ventanas
 * flotantes al hacer clic fuera de su contenido, ignorando arrastres iniciados dentro.
 */
export function initFloatingWindowOutsideClose() {
  if (floatingOutsideCloseBound || typeof document === 'undefined') return;
  floatingOutsideCloseBound = true;

  document.addEventListener('pointerdown', (e) => {
    lastFloatingPointerDownTarget = e.target;
    const splitMenu = document.getElementById('ai-split-floating-menu');
    hadAiSplitMenuOpenOnPointerDown = Boolean(
      isFloatingElementVisible(splitMenu) && !(e.target instanceof Node && splitMenu.contains(e.target))
    );
  }, true);

  document.addEventListener('click', (e) => {
    const downTarget = lastFloatingPointerDownTarget;
    const consumeForSplitMenu = hadAiSplitMenuOpenOnPointerDown;
    lastFloatingPointerDownTarget = null;
    hadAiSplitMenuOpenOnPointerDown = false;

    if (e.target instanceof Element && e.target.closest('#toast-container')) {
      return;
    }

    const topmostModal = getTopmostVisibleBackdropModal();
    if (topmostModal) {
      if (e.target === topmostModal) {
        // Evitar cerrar si el usuario inició un arrastre o selección dentro del modal y soltó fuera
        const dragStartedInsideDialog = Boolean(
          downTarget instanceof Node &&
          downTarget !== topmostModal &&
          topmostModal.contains(downTarget)
        );
        if (consumeForSplitMenu || dragStartedInsideDialog) {
          e.stopPropagation();
          return;
        }
        closeBackdropModalElement(topmostModal);
        e.stopPropagation();
      }
      return;
    }

    closeOpenNonModalPopovers(e.target, downTarget);
  }, true);
}


