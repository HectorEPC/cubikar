// js/modules/reference/masterCatalogModal.js
// Modal de Catálogo Maestro y Biblioteca de Referencia (Opción 1)

import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { formatMoney } from '../../core/formatters.js';
import { findNodeById, recalculateClaves, guardConceptLimit } from '../catalog/treeService.js';
import { renderTAB1 } from '../catalog/catalogView.js';
import {
  listReferenceCatalogs,
  searchReferenceItems,
  deleteReferenceCatalog,
  getReferenceDatabaseStats,
  syncMasterCatalogsFromCloud
} from './referenceDb.js';
import { ensureDefaultMasterCatalogs } from './presetCatalogs.js';
import { getHostStorageSummary, renderStorageMeterHtml } from '../../services/storageQuotaService.js';
import { openImportModal } from '../io/universalImporter.js';
import { generateIntegratedMatrixForConcept } from '../../core/matrixGenerator.js';

let debounceTimer = null;
let currentSearchResults = [];

// Abrir modal de Catálogo Maestro
export async function openMasterCatalogModal() {
  const modal = document.getElementById('master-catalog-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  switchMasterCatalogTab('search');
  await refreshMasterCatalogList();
  triggerMasterCatalogSearch();

  // Carga e indexación automática de catálogos por defecto (espacio absorbido por la app)
  ensureDefaultMasterCatalogs().then(async (added) => {
    if (added > 0) {
      await refreshMasterCatalogList();
      triggerMasterCatalogSearch();
    }
  }).catch(() => {});

  syncMasterCatalogsFromCloud().then(async (res) => {
    if (res?.restored > 0) {
      showToast(`${res.restored} catálogo(s) maestro(s) restaurado(s) desde la nube AWS S3.`, 'success');
      await refreshMasterCatalogList();
      triggerMasterCatalogSearch();
    }
  }).catch(() => {});
}

// Cerrar modal
export function closeMasterCatalogModal() {
  const modal = document.getElementById('master-catalog-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Actualizar lista de catálogos en el filtro y estadísticas
export async function refreshMasterCatalogList() {
  try {
    const stats = await getReferenceDatabaseStats();

    // Actualizar contadores superiores
    const countEl = document.getElementById('master-cat-total-items');
    if (countEl) countEl.textContent = stats.totalItems.toLocaleString();

    const catsCountEl = document.getElementById('master-cat-total-catalogs');
    if (catsCountEl) catsCountEl.textContent = stats.catalogsCount.toLocaleString();

    // Actualizar badges de almacenamiento y espacio de trabajo
    const storageBadgeEl = document.getElementById('master-cat-storage-badge');
    if (storageBadgeEl) {
      storageBadgeEl.textContent = `${stats.totalMb} MB / ${stats.maxStorageMb} MB (${stats.usagePct}%)`;
      storageBadgeEl.className = `font-mono px-2 py-0.5 rounded-full text-[10px] font-bold border ${stats.usagePct > 85 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'}`;
    }

    const wsBadgeEl = document.getElementById('master-cat-workspace-badge');
    if (wsBadgeEl) {
      wsBadgeEl.textContent = `${stats.ownerName} (${stats.planName})`;
    }

    // Llenar selector de catálogos
    const select = document.getElementById('master-cat-catalog-filter');
    if (select) {
      const currentVal = select.value;
      select.innerHTML = '<option value="all">📚 Todos los Catálogos</option>';
      stats.catalogs.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        const isAbsorbed = Boolean(c.isPreset || c.isSystem || c.absorbedByApp || c.ownerEmail === 'system');
        const mbTxt = isAbsorbed ? 'Espacio absorbido' : (c.sizeMb !== undefined ? `${c.sizeMb} MB` : (c.sizeBytes ? `${(c.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : ''));
        opt.textContent = `${c.name} (${(c.itemsCount || 0).toLocaleString()} reg • ${mbTxt})`;
        select.appendChild(opt);
      });
      if (currentVal) select.value = currentVal;
    }

    // Actualizar tabla de administración de catálogos
    await renderCatalogsManageList(stats.catalogs, stats);
  } catch (err) {
    console.error('Error cargando catálogos:', err);
  }
}

// Renderizar la lista de catálogos para administrar/eliminar
async function renderCatalogsManageList(catalogs, stats = null) {
  const container = document.getElementById('master-cat-manage-list');
  if (!container) return;

  const storageSummary = await getHostStorageSummary().catch(() => null);
  const meterHtml = storageSummary ? renderStorageMeterHtml(storageSummary, { compact: true }) : '';
  const pct = stats?.usagePct || 0;
  const barCls = pct >= 100 ? 'bg-rose-600' : (pct >= 90 ? 'bg-amber-500' : 'bg-blue-600');

  const storageHeader = stats ? `
    <div class="space-y-2.5 mb-3">
      ${meterHtml}
      <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs">
        <div class="flex flex-wrap justify-between items-center text-xs mb-1.5 font-semibold gap-1">
          <span class="text-slate-700 flex items-center gap-1.5">
            <i class="fa-solid fa-hard-drive text-blue-600"></i>
            <span>Apartado Catálogo Maestro (Plan ${stats.planName || 'Gratuita'}):</span>
          </span>
          <span class="font-mono text-slate-900 font-bold">${stats.totalMb} MB de ${stats.maxStorageMb} MB reservados (${pct}%)</span>
        </div>
        <div class="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
          <div class="${barCls} h-full rounded-full transition-all duration-300" style="width: ${Math.min(100, pct)}%"></div>
        </div>
        <div class="flex flex-wrap justify-between items-center text-[10px] text-slate-500 mt-1.5">
          <span>Titular del Espacio: <strong class="text-slate-700">${stats.ownerName || 'Mi Cuenta'}</strong> (${stats.ownerEmail || ''})</span>
          <span>${catalogs.length} catálogo${catalogs.length === 1 ? '' : 's'} activo${catalogs.length === 1 ? '' : 's'} · Respaldo S3 automático</span>
        </div>
      </div>
    </div>
  ` : '';

  if (catalogs.length === 0) {
    const ownerNameTxt = stats?.ownerName ? `en el espacio de trabajo de <strong>${stats.ownerName}</strong>` : 'aún';
    container.innerHTML = `
      ${storageHeader}
      <div class="p-6 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
        <i class="fa-solid fa-folder-open text-3xl mb-2 text-slate-300"></i>
        <p class="font-medium text-xs text-slate-600">No hay catálogos maestros cargados ${ownerNameTxt}.</p>
        <p class="text-[11px] text-slate-400 mt-1">Usa el botón "Importar Archivo" para agregar tus archivos de BIMSA, Gobierno, Excel, CSV u Opus.</p>
      </div>
    `;
    return;
  }

  let html = storageHeader + '<div class="space-y-2">';
  catalogs.forEach(c => {
    const isAbsorbed = Boolean(c.isPreset || c.isSystem || c.absorbedByApp || c.ownerEmail === 'system');
    const fecha = c.createdAt ? new Date(c.createdAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const mbTxt = isAbsorbed 
      ? '<span class="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold border border-emerald-200">0 MB • Absorbido por la app</span>'
      : `<span class="bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded font-mono">${c.sizeMb !== undefined ? `${c.sizeMb} MB` : (c.sizeBytes ? `${(c.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '0.10 MB')}</span>`;

    html += `
      <div class="flex items-center justify-between p-2.5 bg-white border ${isAbsorbed ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-200'} rounded-xl shadow-xs hover:border-blue-300 transition">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg ${isAbsorbed ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'} flex items-center justify-center font-bold text-sm shrink-0">
            <i class="fa-solid ${isAbsorbed ? 'fa-shield-halved' : 'fa-book'}"></i>
          </div>
          <div class="min-w-0">
            <span class="font-bold text-xs text-slate-800 block truncate">${c.name}</span>
            <div class="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 mt-0.5">
              <span class="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded font-mono">${(c.itemsCount || 0).toLocaleString()} registros</span>
              ${mbTxt}
              <span>•</span>
              <span>${c.category || 'General'}</span>
              <span>•</span>
              <span>${fecha}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          ${isAbsorbed ? `
            <span class="text-emerald-700 bg-emerald-50 text-[10px] font-bold px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1 shrink-0" title="Catálogo oficial del sistema (Espacio absorbido por Cubikar • No consume almacenamiento del usuario)">
              <i class="fa-solid fa-circle-check text-emerald-600"></i> Por defecto
            </span>
          ` : `
            <button onclick="handleDeleteCatalog('${c.id}', '${c.name.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition shrink-0 cursor-pointer" title="Eliminar este catálogo">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          `}
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}

// Eliminar un catálogo con confirmación
export async function handleDeleteCatalog(catalogId, catalogName) {
  if (!confirm(`¿Estás seguro de eliminar el catálogo "${catalogName}" y todos sus conceptos?`)) {
    return;
  }

  try {
    await deleteReferenceCatalog(catalogId);
    showToast(`Catálogo "${catalogName}" eliminado`, 'info');
    await refreshMasterCatalogList();
    triggerMasterCatalogSearch();
  } catch (err) {
    showToast(`Error al eliminar: ${err.message}`, 'error');
  }
}

// Búsqueda con debounce
export function onMasterCatalogSearchInput() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    triggerMasterCatalogSearch();
  }, 250);
}

// Ejecutar búsqueda en la base de datos IndexedDB
export async function triggerMasterCatalogSearch() {
  const query = document.getElementById('master-cat-search-input')?.value || '';
  const tipo = document.getElementById('master-cat-tipo-filter')?.value || 'all';
  const catalogId = document.getElementById('master-cat-catalog-filter')?.value || 'all';

  const tbody = document.getElementById('master-cat-results-body');
  const countBadge = document.getElementById('master-cat-results-count');

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400">
          <i class="fa-solid fa-spinner fa-spin text-xl text-blue-600 mb-2"></i>
          <p class="text-xs">Buscando en catálogos de referencia...</p>
        </td>
      </tr>
    `;
  }

  try {
    const results = await searchReferenceItems({
      catalogId,
      tipo,
      query,
      limit: 150
    });

    currentSearchResults = results;

    if (countBadge) {
      countBadge.textContent = `${results.length} ${results.length === 150 ? '+ resultados' : 'resultados'}`;
    }

    renderSearchResultsTable(results);
  } catch (err) {
    console.error('Error buscando conceptos:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="p-6 text-center text-red-500 text-xs">
            Error al consultar la base de datos: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

// Renderizar tabla de resultados
function renderSearchResultsTable(items) {
  const tbody = document.getElementById('master-cat-results-body');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center text-slate-400">
          <i class="fa-solid fa-magnifying-glass text-2xl text-slate-300 mb-2"></i>
          <p class="text-xs font-semibold text-slate-600">No se encontraron conceptos o insumos.</p>
          <p class="text-[11px] text-slate-400 mt-1">Prueba con otros términos de búsqueda o asegúrate de haber importado tus archivos.</p>
        </td>
      </tr>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-blue-50/60 border-b border-slate-100 transition group';

    // Badge según tipo
    let tipoBadge = '';
    if (item.tipo === 'Material') {
      tipoBadge = '<span class="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Material</span>';
    } else if (item.tipo === 'Mano de Obra') {
      tipoBadge = '<span class="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">M. Obra</span>';
    } else if (item.tipo === 'Herramienta') {
      tipoBadge = '<span class="text-[9px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">Herramienta</span>';
    } else if (item.tipo === 'Equipo') {
      tipoBadge = '<span class="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">Equipo</span>';
    } else if (item.tipo === 'Maquinaria') {
      tipoBadge = '<span class="text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">Maquinaria</span>';
    } else if (item.tipo === 'Subcontrato') {
      tipoBadge = '<span class="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Subcontrato</span>';
    } else {
      tipoBadge = '<span class="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Concepto</span>';
    }

    tr.innerHTML = `
      <td class="p-2 align-top w-28 min-w-[100px]">
        <span class="font-mono text-xs font-bold text-blue-700 block">${item.clave || '-'}</span>
        <div class="mt-1">${tipoBadge}</div>
      </td>
      <td class="p-2 align-top text-xs text-slate-800 text-justify">
        <div class="font-medium leading-relaxed">${item.descripcion || '-'}</div>
        <div class="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
          <span><i class="fa-solid fa-book-bookmark text-[9px]"></i> ${item.catalogName || 'Catálogo'}</span>
          ${item.familia ? `<span>• Familia: ${item.familia}</span>` : ''}
        </div>
      </td>
      <td class="p-2 align-top text-center font-mono text-xs w-16 text-slate-600">
        ${item.unidad || 'pza'}
      </td>
      <td class="p-2 align-top text-right font-mono text-xs font-bold text-slate-800 w-28">
        ${formatMoney(item.precioUnitario || 0)}
      </td>
      <td class="p-2 align-top text-center w-24">
        <button onclick="insertConceptIntoBudget(${index})" class="bg-blue-600 hover:bg-blue-500 text-white text-[11px] px-2.5 py-1 rounded flex items-center gap-1 font-medium shadow-sm transition active:scale-95 cursor-pointer" title="Insertar concepto al presupuesto activo">
          <i class="fa-solid fa-plus text-[10px]"></i> Insertar
        </button>
      </td>
    `;
    fragment.appendChild(tr);
  });

  tbody.replaceChildren(fragment);
}

// Insertar concepto seleccionado al presupuesto de obra (TAB1-CAT-BASE)
export function insertConceptIntoBudget(resultIndex) {
  const item = currentSearchResults[resultIndex];
  if (!item) return;

  if (!guardConceptLimit(1)) return;

  saveState();

  const integratedInsumos = (Array.isArray(item.insumos) && item.insumos.length > 0)
    ? JSON.parse(JSON.stringify(item.insumos))
    : generateIntegratedMatrixForConcept(item);

  const newNode = {
    id: '_' + Math.random().toString(36).substr(2, 9),
    clave: item.clave || '',
    descripcion: item.descripcion || '',
    unidad: item.unidad || 'pza',
    cantidad: 1,
    precioUnitario: item.precioUnitario || 0,
    costoDirecto: item.precioUnitario || 0,
    expanded: true,
    selected: true,
    insumos: integratedInsumos,
    children: []
  };

  // Si hay una fila seleccionada en TAB1, insertarlo como hijo o a continuación
  if (state.activeSelectedId) {
    const selectedNode = findNodeById(state.treeData, state.activeSelectedId);
    if (selectedNode) {
      if (!selectedNode.children) selectedNode.children = [];
      selectedNode.children.push(newNode);
      selectedNode.expanded = true;
    } else {
      state.treeData.push(newNode);
    }
  } else {
    // Si no hay fila seleccionada, agregar como partida principal
    state.treeData.push(newNode);
  }

  recalculateClaves(state.treeData);
  persistLocalData();
  renderTAB1();

  showToast(`Concepto "${item.clave || item.descripcion.slice(0, 25)}" insertado al presupuesto`, 'success');
}

// Alternar entre pestaña de Búsqueda y Gestión de Catálogos
export function switchMasterCatalogTab(tab) {
  const searchTab = document.getElementById('master-cat-tab-search');
  const manageTab = document.getElementById('master-cat-tab-manage');

  const viewSearch = document.getElementById('master-cat-view-search');
  const viewManage = document.getElementById('master-cat-view-manage');

  const activeClass = "px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-blue-700 shadow-xs border border-slate-200 transition";
  const inactiveClass = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-800 transition";

  if (searchTab) searchTab.className = inactiveClass;
  if (manageTab) manageTab.className = inactiveClass;

  if (viewSearch) viewSearch.classList.add('hidden');
  if (viewManage) viewManage.classList.add('hidden');

  if (tab === 'search') {
    if (searchTab) searchTab.className = activeClass;
    if (viewSearch) viewSearch.classList.remove('hidden');
    triggerMasterCatalogSearch();
  } else {
    if (manageTab) manageTab.className = activeClass;
    if (viewManage) viewManage.classList.remove('hidden');
    refreshMasterCatalogList();
  }
}
