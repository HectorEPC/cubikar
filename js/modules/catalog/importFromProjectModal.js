// js/modules/catalog/importFromProjectModal.js
// Asistente visual para explorar, seleccionar y copiar conceptos con sus matrices APU desde otro proyecto

import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { getActiveProjectId, getStorageKey, getSettingsKey } from '../../config/constants.js';
import { getProjectsList, getProjectById, getCurrentUser, getProjectsForUser } from '../portal/projectService.js';
import { recalculateClaves } from './treeService.js';
import { renderTAB1, selectRow } from './catalogView.js';
import { getFactorSobrecosto, round2 } from '../../core/calculations.js';
import { formatMoney, getCurrencySymbol } from '../../core/formatters.js';

let activeSourceProjectId = null;
let activeSourceTreeData = [];
let selectedConceptIds = new Set();
let sourceSearchQuery = '';

// Abrir el modal de copia de conceptos desde otro proyecto
export function openImportConceptsModal() {
  const modal = document.getElementById('modal-copiar-de-otro-proyecto');
  if (!modal) return;

  const currentProjId = getActiveProjectId();
  const currentUser = getCurrentUser();
  const allProjects = currentUser ? getProjectsForUser(currentUser) : getProjectsList();

  // Filtrar proyectos disponibles excluyendo el proyecto actual
  const otherProjects = allProjects.filter(p => p.id !== currentProjId);

  const selectEl = document.getElementById('import-source-project-select');
  const countBadge = document.getElementById('import-other-projects-count');
  if (countBadge) {
    countBadge.textContent = `${otherProjects.length} obra${otherProjects.length === 1 ? '' : 's'} disponible${otherProjects.length === 1 ? '' : 's'}`;
  }

  if (!selectEl) return;

  if (otherProjects.length === 0) {
    selectEl.innerHTML = `<option value="">No hay otros proyectos creados aún</option>`;
    renderSourceConceptsEmptyState('No tienes otros proyectos creados aún en tu perfil para transferir conceptos.');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    return;
  }

  selectEl.innerHTML = otherProjects.map((p, idx) => `
    <option value="${p.id}" ${idx === 0 ? 'selected' : ''}>
      ${p.projectName} (${p.companyName || 'Empresa'}) • ${p.conceptCount || 0} conceptos
    </option>
  `).join('');

  activeSourceProjectId = otherProjects[0].id;
  selectedConceptIds.clear();
  sourceSearchQuery = '';

  const searchInput = document.getElementById('import-search-concepts');
  if (searchInput) searchInput.value = '';

  loadSourceProjectConcepts(activeSourceProjectId);

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

export function closeImportConceptsModal() {
  const modal = document.getElementById('modal-copiar-de-otro-proyecto');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  selectedConceptIds.clear();
  activeSourceTreeData = [];
  activeSourceProjectId = null;
}

// Cargar catálogo y conceptos del proyecto seleccionado
export function onSelectSourceProject(projectId) {
  activeSourceProjectId = projectId;
  selectedConceptIds.clear();
  loadSourceProjectConcepts(projectId);
}

function loadSourceProjectConcepts(projectId) {
  if (!projectId) {
    activeSourceTreeData = [];
    renderSourceConceptsList();
    return;
  }

  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    activeSourceTreeData = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error al cargar catálogo del proyecto origen:', e);
    activeSourceTreeData = [];
  }

  renderSourceConceptsList();
  updateImportSelectionCounter();
}

// Búsqueda en vivo de conceptos
export function onSearchSourceConcepts(query) {
  sourceSearchQuery = (query || '').trim().toLowerCase();
  renderSourceConceptsList();
}

// Aplanar conceptos del árbol con ruta de partida
function flattenConcepts(nodes, parentPath = '') {
  const list = [];
  nodes.forEach(n => {
    const isLeaf = !n.children || n.children.length === 0;
    const currentPath = parentPath ? `${parentPath} > ${n.descripcion}` : n.descripcion;

    if (isLeaf) {
      list.push({
        node: n,
        partidaPath: parentPath || 'General'
      });
    } else {
      list.push(...flattenConcepts(n.children, currentPath));
    }
  });
  return list;
}

// Renderizar la lista de conceptos disponibles para copiar
function renderSourceConceptsList() {
  const container = document.getElementById('import-concepts-list-container');
  if (!container) return;

  const flattened = flattenConcepts(activeSourceTreeData);

  let filtered = flattened;
  if (sourceSearchQuery) {
    filtered = flattened.filter(item => {
      const desc = (item.node.descripcion || '').toLowerCase();
      const clave = (item.node.clave || '').toLowerCase();
      const path = (item.partidaPath || '').toLowerCase();
      return desc.includes(sourceSearchQuery) || clave.includes(sourceSearchQuery) || path.includes(sourceSearchQuery);
    });
  }

  if (filtered.length === 0) {
    renderSourceConceptsEmptyState(sourceSearchQuery ? 'No se encontraron conceptos que coincidan con la búsqueda.' : 'Este proyecto no contiene conceptos registrados.');
    return;
  }

  container.innerHTML = filtered.map(item => {
    const n = item.node;
    const insumos = Array.isArray(n.insumos) ? n.insumos : [];
    const insumosCount = insumos.length;
    const isChecked = selectedConceptIds.has(n.id);
    const pu = Number(n.precioUnitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cd = Number(n.costoDirecto || n.precioUnitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Contadores por categoría de insumo
    const matCount = insumos.filter(i => i.tipo === 'Material').length;
    const moCount = insumos.filter(i => i.tipo === 'Mano de Obra').length;
    const eqCount = insumos.filter(i => i.tipo === 'Equipo').length;
    const herrCount = insumos.filter(i => i.tipo === 'Herramienta').length;
    const maqCount = insumos.filter(i => i.tipo === 'Maquinaria').length;
    const subCount = insumos.filter(i => i.tipo === 'Subcontrato').length;

    const breakdownPills = [];
    if (matCount) breakdownPills.push(`<span class="bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-semibold text-[9px]">${matCount} Mat</span>`);
    if (moCount) breakdownPills.push(`<span class="bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-semibold text-[9px]">${moCount} MO</span>`);
    if (herrCount) breakdownPills.push(`<span class="bg-orange-50 text-orange-700 px-1.5 py-0.2 rounded font-semibold text-[9px]">${herrCount} Herr</span>`);
    if (eqCount) breakdownPills.push(`<span class="bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded font-semibold text-[9px]">${eqCount} Eq</span>`);
    if (maqCount) breakdownPills.push(`<span class="bg-rose-50 text-rose-700 px-1.5 py-0.2 rounded font-semibold text-[9px]">${maqCount} Maq</span>`);
    if (subCount) breakdownPills.push(`<span class="bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-semibold text-[9px]">${subCount} Sub</span>`);

    return `
      <div class="bg-white rounded-2xl border ${isChecked ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20' : 'border-slate-200 hover:border-slate-300'} p-3.5 transition shadow-2xs space-y-2.5">
        
        <!-- Fila Superior: Checkbox, Clave, Descripción y Acción Rápida -->
        <div class="flex items-start gap-3">
          <input type="checkbox" onchange="toggleConceptSelection('${n.id}', this.checked)" ${isChecked ? 'checked' : ''} 
                 class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer mt-0.5 shrink-0">
          
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="bg-slate-100 text-slate-800 font-mono font-bold text-[10px] px-2 py-0.5 rounded border border-slate-200">
                ${n.clave || 'S/C'}
              </span>
              <span class="text-[10px] text-slate-400 font-semibold truncate max-w-xs" title="${item.partidaPath}">
                <i class="fa-solid fa-folder-open text-blue-400 mr-1"></i>${item.partidaPath}
              </span>
            </div>

            <h4 class="font-bold text-slate-900 text-xs leading-snug cursor-pointer select-none" onclick="toggleConceptSelection('${n.id}', !${isChecked})">
              ${n.descripcion}
            </h4>
          </div>

          <!-- Botón Rápido 1-Clic: Copiar y Pegar de inmediato -->
          <button type="button" onclick="quickCopyPasteSingleConcept('${n.id}')" 
                  class="bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-[10px] px-2.5 py-1.5 rounded-xl border border-blue-200 hover:border-blue-600 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs active:scale-95" 
                  title="Copiar e insertar este concepto con su matriz directamente en el proyecto actual">
            <i class="fa-solid fa-plus text-[9px]"></i>
            <span class="hidden sm:inline">Pegar este</span>
          </button>
        </div>

        <!-- Fila Inferior: Métricas, Badge de Matriz y Toggle de Vista Previa -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div class="flex items-center gap-3 text-[11px] text-slate-600">
            <span>Unidad: <strong class="text-slate-800 font-mono">${n.unidad || 'pza'}</strong></span>
            <span>Cant: <strong class="text-slate-800 font-mono">${Number(n.cantidad || 0).toLocaleString('es-MX')}</strong></span>
            <span>C. Directo: <strong class="text-slate-800 font-mono">$${cd}</strong></span>
            <span>P. Unitario: <strong class="text-blue-700 font-bold font-mono">$${pu}</strong></span>
          </div>

          <div class="flex items-center gap-2">
            ${insumosCount > 0 ? `
              <div class="flex items-center gap-1">
                <span class="inline-flex items-center gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-[9px] px-2 py-0.5 rounded-full shadow-2xs">
                  <i class="fa-solid fa-calculator text-[8px]"></i>
                  <span>${insumosCount} insumo${insumosCount === 1 ? '' : 's'}</span>
                </span>
                <div class="hidden sm:flex items-center gap-1 ml-1">
                  ${breakdownPills.join('')}
                </div>
              </div>
              <button type="button" onclick="toggleMatrixPreviewAccordion('${n.id}')" 
                      class="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-1">
                <span id="preview-btn-text-${n.id}">Ver matriz</span>
                <i id="preview-icon-${n.id}" class="fa-solid fa-chevron-down text-[8px] transition-transform"></i>
              </button>
            ` : `
              <span class="text-[10px] text-slate-400 italic">Sin matriz de insumos</span>
            `}
          </div>
        </div>

        <!-- Acordeón Plegable: Vista Previa de la Matriz APU -->
        ${insumosCount > 0 ? `
          <div id="matrix-preview-container-${n.id}" class="hidden pt-2 border-t border-slate-100 animate-in fade-in">
            <div class="bg-slate-50 rounded-xl p-2.5 border border-slate-200 space-y-1.5">
              <div class="flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase tracking-wider pb-1 border-b border-slate-200">
                <span>Insumo y Descripción</span>
                <span>Consumo Unitario y Costo</span>
              </div>
              <div class="space-y-1 max-h-40 overflow-y-auto pr-1">
                ${insumos.map(ins => `
                  <div class="flex items-center justify-between text-[10px] p-1 rounded bg-white border border-slate-100">
                    <div class="min-w-0 flex-1 truncate pr-2">
                      <span class="font-mono text-[9px] font-bold text-blue-600 mr-1">[${ins.tipo || 'Insumo'}]</span>
                      <span class="font-medium text-slate-800">${ins.descripcion}</span>
                    </div>
                    <div class="text-right shrink-0 font-mono text-[10px] text-slate-700">
                      <span>${Number(ins.cantidad || 0).toFixed(5)} ${ins.unidad}</span>
                      <span class="text-slate-400 mx-1">×</span>
                      <span class="font-bold text-slate-900">$${Number(ins.costoUnitario || 0).toFixed(2)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }).join('');
}

function renderSourceConceptsEmptyState(message) {
  const container = document.getElementById('import-concepts-list-container');
  if (container) {
    container.innerHTML = `
      <div class="p-10 text-center space-y-2 bg-slate-50 rounded-2xl border border-slate-200 text-slate-500">
        <div class="w-12 h-12 bg-white rounded-2xl border border-slate-200 text-slate-400 flex items-center justify-center text-xl mx-auto shadow-2xs">
          <i class="fa-solid fa-folder-open"></i>
        </div>
        <p class="font-bold text-xs text-slate-700">${message}</p>
        <p class="text-[11px] text-slate-400">Selecciona otro proyecto en el desplegable superior para examinar sus conceptos y matrices.</p>
      </div>
    `;
  }
}

// Alternar vista previa de la matriz en el acordeón
export function toggleMatrixPreviewAccordion(nodeId) {
  const container = document.getElementById(`matrix-preview-container-${nodeId}`);
  const btnText = document.getElementById(`preview-btn-text-${nodeId}`);
  const icon = document.getElementById(`preview-icon-${nodeId}`);

  if (container) {
    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
      container.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Ocultar';
      if (icon) icon.className = 'fa-solid fa-chevron-up text-[8px] transition-transform';
    } else {
      container.classList.add('hidden');
      if (btnText) btnText.textContent = 'Ver matriz';
      if (icon) icon.className = 'fa-solid fa-chevron-down text-[8px] transition-transform';
    }
  }
}

// Selección individual y masiva
export function toggleConceptSelection(nodeId, isChecked) {
  if (isChecked) {
    selectedConceptIds.add(nodeId);
  } else {
    selectedConceptIds.delete(nodeId);
  }
  updateImportSelectionCounter();
}

export function selectAllSourceConcepts(selectAll) {
  const flattened = flattenConcepts(activeSourceTreeData);
  if (selectAll) {
    flattened.forEach(item => selectedConceptIds.add(item.node.id));
  } else {
    selectedConceptIds.clear();
  }
  renderSourceConceptsList();
  updateImportSelectionCounter();
}

function updateImportSelectionCounter() {
  const countBadge = document.getElementById('import-selected-count-badge');
  const btnSubmit = document.getElementById('btn-import-confirm-submit');
  const count = selectedConceptIds.size;

  if (countBadge) {
    countBadge.textContent = `${count} concepto${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}`;
  }

  if (btnSubmit) {
    if (count > 0) {
      btnSubmit.removeAttribute('disabled');
      btnSubmit.classList.remove('opacity-40', 'cursor-not-allowed');
      btnSubmit.innerHTML = `
        <i class="fa-solid fa-file-import"></i>
        <span>Copiar ${count} Concepto${count === 1 ? '' : 's'} con Matriz al Proyecto</span>
      `;
    } else {
      btnSubmit.setAttribute('disabled', 'true');
      btnSubmit.classList.add('opacity-40', 'cursor-not-allowed');
      btnSubmit.innerHTML = `
        <i class="fa-solid fa-file-import"></i>
        <span>Selecciona conceptos para copiar</span>
      `;
    }
  }
}

// Helper para renovar IDs y recalcular PU con sobrecosto del proyecto destino
function renewNodeDeep(n) {
  n.id = '_' + Math.random().toString(36).substr(2, 9);
  n.selected = true;

  if (Array.isArray(n.insumos)) {
    n.insumos = JSON.parse(JSON.stringify(n.insumos));
  } else {
    n.insumos = [];
  }

  if (n.costoDirecto !== undefined && n.costoDirecto !== null) {
    const factor = getFactorSobrecosto();
    n.precioUnitario = round2(n.costoDirecto * factor);
  }

  if (Array.isArray(n.children)) {
    n.children.forEach(c => renewNodeDeep(c));
  }
}

// Copiar y pegar un solo concepto al instante
export function quickCopyPasteSingleConcept(nodeId) {
  const flattened = flattenConcepts(activeSourceTreeData);
  const found = flattened.find(i => i.node.id === nodeId);
  if (!found) return;

  saveState();

  const sourceProj = getProjectById(activeSourceProjectId);
  const sourceName = sourceProj ? sourceProj.projectName : 'Otro Proyecto';

  const clonedNode = JSON.parse(JSON.stringify(found.node));
  renewNodeDeep(clonedNode);

  // Ubicar destino
  let parentList = null;
  let insertIndex = -1;

  if (state.activeSelectedId) {
    parentList = findParentList(state.treeData, state.activeSelectedId);
    if (parentList) {
      insertIndex = parentList.findIndex(n => n.id === state.activeSelectedId);
    }
  }

  if (!parentList) {
    parentList = state.treeData;
    insertIndex = parentList.length - 1;
  }

  const pos = insertIndex >= 0 ? insertIndex + 1 : parentList.length;
  parentList.splice(pos, 0, clonedNode);

  recalculateClaves(state.treeData);
  persistLocalData(true);
  renderTAB1();
  selectRow(clonedNode.id);

  const insCount = Array.isArray(clonedNode.insumos) ? clonedNode.insumos.length : 0;
  showToast(`¡Concepto "${clonedNode.descripcion.slice(0, 30)}..." copiado con su Matriz APU (${insCount} insumos) desde "${sourceName}"!`, 'success');
  closeImportConceptsModal();
}

// Importar todos los conceptos seleccionados con sus matrices APU
export function importSelectedConceptsToCurrentProject() {
  if (selectedConceptIds.size === 0) {
    showToast('Selecciona al menos un concepto para copiar.', 'warning');
    return;
  }

  const flattened = flattenConcepts(activeSourceTreeData);
  const toImport = flattened.filter(i => selectedConceptIds.has(i.node.id));

  if (toImport.length === 0) return;

  saveState();

  const sourceProj = getProjectById(activeSourceProjectId);
  const sourceName = sourceProj ? sourceProj.projectName : 'Otro Proyecto';

  let parentList = null;
  let insertIndex = -1;

  if (state.activeSelectedId) {
    parentList = findParentList(state.treeData, state.activeSelectedId);
    if (parentList) {
      insertIndex = parentList.findIndex(n => n.id === state.activeSelectedId);
    }
  }

  if (!parentList) {
    parentList = state.treeData;
    insertIndex = parentList.length - 1;
  }

  let totalInsumosImportados = 0;
  const newNodes = [];

  toImport.forEach((item, idx) => {
    const cloned = JSON.parse(JSON.stringify(item.node));
    renewNodeDeep(cloned);
    totalInsumosImportados += (cloned.insumos ? cloned.insumos.length : 0);
    newNodes.push(cloned);

    const pos = insertIndex >= 0 ? insertIndex + 1 + idx : parentList.length;
    parentList.splice(pos, 0, cloned);
  });

  recalculateClaves(state.treeData);
  persistLocalData(true);
  renderTAB1();

  if (newNodes.length > 0) {
    selectRow(newNodes[0].id);
  }

  closeImportConceptsModal();

  showToast(`¡${newNodes.length} concepto${newNodes.length === 1 ? '' : 's'} con sus matrices APU (${totalInsumosImportados} insumos en total) copiados desde "${sourceName}"!`, 'success');
}

function findParentList(nodes, targetId) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) return nodes;
    if (nodes[i].children) {
      const res = findParentList(nodes[i].children, targetId);
      if (res) return res;
    }
  }
  return null;
}
