// js/mobile/mobilePresupuesto.js
// Presupuesto de Obra: Catálogo Base, Insumos Base (6 categorías), bloqueo seguro y Matriz APU por concepto

import { state, persistLocalData } from '../state/store.js?v=20261119_cf40';
import { formatMoney, formatQty, formatMatrixQty, round2, round5 } from '../core/formatters.js?v=20261119_cf40';
import { getFactorSobrecosto, calculateParentTotal, calculateParentDirectTotal, syncPercentInsumos, computeMatrixDirectCost, explodeInsumoQty, explodeInsumoImporte } from '../core/calculations.js?v=20261119_cf40';
import { generateIntegratedMatrixForConcept } from '../core/matrixGenerator.js?v=20261119_cf40';
import { getExactOpusInsumosForClave } from '../modules/io/casaLauraData.js?v=20261119_cf40';
import { findNodeById, updateNode, addRootRow, addChildRow } from '../modules/catalog/treeService.js?v=20261119_cf40';
import { getConsolidatedDataMap, getInsumoConsolidationKey } from '../modules/insumosGenerales/insumosConsolidator.js?v=20261119_cf40';
import { getExpensesRecords } from '../modules/compras/expensesModel.js?v=20261119_cf40';
import { getWarehouseNetConsumptionMap, getWarehouseStockSummary } from '../modules/almacen/almacenModel.js?v=20261119_cf40';
import { getPartidaChatCount } from '../modules/chat/projectChat.js?v=20261119_cf40';
import { canCurrentUserEditProject } from '../modules/portal/projectService.js?v=20261119_cf40';
import { isTabLocked, setTabLocked } from '../ui/tabLockController.js?v=20261119_cf40';
import { showToast } from '../ui/notifications.js?v=20261119_cf40';
import { escapeHtml, isBodegueroRestricted } from './mobileBridge.js?v=20261119_cf40';

let subTab = 'cat'; // 'cat' | 'insumos'
let insumoCatFilter = 'Todos';
let searchText = '';
let conceptDetailTab = 'matriz'; // 'matriz' | 'unitarios' | 'totales'

const INSUMO_CATS = ['Todos', 'Material', 'Mano de Obra', 'Herramienta', 'Equipo', 'Maquinaria', 'Subcontrato'];

export function renderMobilePresupuesto(container, { openSheet, closeSheet, onOpenConceptChat }) {
  if (!container) return;

  if (isBodegueroRestricted()) {
    container.innerHTML = `
      <div class="m-card" style="text-align:center;padding:28px 16px;">
        <i class="fa-solid fa-lock" style="font-size:28px;color:var(--warn);margin-bottom:8px;"></i>
        <div class="m-title">Acceso Restringido</div>
        <p class="m-subtitle">Tu rol de Almacenista no tiene acceso a costos ni presupuestos.</p>
      </div>
    `;
    return;
  }

  const canEditRole = canCurrentUserEditProject();
  const locked = isTabLocked('cat');
  const editable = canEditRole && !locked;

  const grandTotal = round2((state.treeData || []).reduce((acc, r) => acc + calculateParentTotal(r), 0));
  const directTotal = round2((state.treeData || []).reduce((acc, r) => acc + calculateParentDirectTotal(r), 0));
  const factor = getFactorSobrecosto();

  container.innerHTML = `
    <div class="m-lock-bar ${editable ? 'is-unlocked' : ''}">
      <div class="m-row" style="min-width:0;flex:1;">
        <i class="fa-solid ${editable ? 'fa-lock-open' : 'fa-lock'}" style="color:${editable ? 'var(--warn)' : 'var(--muted)'};"></i>
        <span style="font-weight:700;font-size:12px;">
          ${!canEditRole ? 'Solo lectura (sin permisos de edición)' : (locked ? 'Presupuesto protegido (Solo consulta)' : 'Edición desbloqueada')}
        </span>
      </div>
      ${canEditRole ? `
        <button type="button" id="m-pres-lock-btn" class="m-btn m-btn-sm ${locked ? 'm-btn-outline' : 'm-btn-primary'}">
          ${locked ? 'Desbloquear' : 'Proteger'}
        </button>
      ` : ''}
    </div>

    <div class="m-grid-2">
      <div class="m-kpi">
        <div class="m-kpi-label">Presupuesto Total</div>
        <div class="m-kpi-value" style="color:var(--primary);">${escapeHtml(formatMoney(grandTotal))}</div>
      </div>
      <div class="m-kpi">
        <div class="m-kpi-label">${state.settings?.applySobrecosto ? `Costo Directo (x${factor.toFixed(3)})` : 'Costo Directo'}</div>
        <div class="m-kpi-value">${escapeHtml(formatMoney(directTotal))}</div>
      </div>
    </div>

    <div class="m-segmented">
      <button type="button" data-pres-sub="cat" class="m-seg-btn ${subTab === 'cat' ? 'is-active' : ''}">
        <i class="fa-solid fa-sitemap"></i> Catálogo Base
      </button>
      <button type="button" data-pres-sub="insumos" class="m-seg-btn ${subTab === 'insumos' ? 'is-active' : ''}">
        <i class="fa-solid fa-cubes"></i> Insumos Base
      </button>
    </div>

    <div class="m-row">
      <div style="position:relative;flex:1;">
        <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:12px;"></i>
        <input type="search" id="m-pres-search" class="m-input" value="${escapeHtml(searchText)}" placeholder="${subTab === 'cat' ? 'Buscar clave o concepto...' : 'Buscar material, mano de obra, clave...'}" style="padding-left:34px;">
      </div>
      ${editable && subTab === 'cat' ? `
        <button type="button" id="m-pres-add-root" class="m-btn m-btn-primary m-btn-sm" title="Agregar Partida Principal">
          <i class="fa-solid fa-plus"></i> Partida
        </button>
      ` : ''}
    </div>

    <div id="m-pres-body"></div>
  `;

  container.querySelector('#m-pres-lock-btn')?.addEventListener('click', () => {
    setTabLocked('cat', !locked);
    renderMobilePresupuesto(container, { openSheet, closeSheet, onOpenConceptChat });
  });

  container.querySelectorAll('[data-pres-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      subTab = btn.dataset.presSub;
      renderMobilePresupuesto(container, { openSheet, closeSheet, onOpenConceptChat });
    });
  });

  container.querySelector('#m-pres-add-root')?.addEventListener('click', () => {
    addRootRow();
    renderMobilePresupuesto(container, { openSheet, closeSheet, onOpenConceptChat });
  });

  const searchEl = container.querySelector('#m-pres-search');
  searchEl?.addEventListener('input', (ev) => {
    searchText = ev.target.value;
    const caret = ev.target.selectionStart;
    renderPresupuestoList(container, { editable, openSheet, closeSheet, onOpenConceptChat });
    if (subTab === 'cat') searchEl.focus();
    try { searchEl.setSelectionRange(caret, caret); } catch (_) {}
  });

  renderPresupuestoList(container, { editable, openSheet, closeSheet, onOpenConceptChat });
}

function renderPresupuestoList(container, ctx) {
  const body = container.querySelector('#m-pres-body');
  if (!body) return;

  if (subTab === 'insumos') {
    renderInsumosBaseList(body, ctx);
    return;
  }

  const q = searchText.trim().toLowerCase();
  const rows = [];
  const walk = (nodes, depth = 0) => {
    (nodes || []).forEach(node => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const matches = !q
        || String(node.clave || '').toLowerCase().includes(q)
        || String(node.descripcion || '').toLowerCase().includes(q);
      if (!q || matches || hasChildren) {
        rows.push({ node, depth, hasChildren, matches });
      }
      if (hasChildren && (q || node.expanded !== false)) {
        walk(node.children, depth + 1);
      }
    });
  };
  walk(state.treeData || []);

  if (rows.length === 0) {
    body.innerHTML = `
      <div class="m-card" style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">
        <i class="fa-solid fa-coins" style="font-size:26px;margin-bottom:8px;display:block;"></i>
        No hay conceptos visibles en este presupuesto.
      </div>
    `;
    return;
  }

  body.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
    ${rows.map(({ node, depth, hasChildren }) => {
      const imp = hasChildren ? calculateParentTotal(node) : round2((node.cantidad || 0) * (node.precioUnitario || 0));
      const pad = Math.min(depth * 12, 24);
      if (hasChildren) {
        return `
          <div class="m-card-alt m-row-between" style="margin-left:${pad}px;padding:10px 12px;border-left:3px solid var(--primary);">
            <button type="button" data-toggle-node="${escapeHtml(node.id)}" class="m-row" style="flex:1;min-width:0;border:none;background:none;color:inherit;text-align:left;cursor:pointer;padding:0;">
              <i class="fa-solid ${node.expanded !== false ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size:11px;color:var(--primary);width:14px;"></i>
              <div style="min-width:0;flex:1;">
                <span class="m-mono" style="font-size:10.5px;font-weight:800;color:var(--primary);">${escapeHtml(node.clave || '')}</span>
                <div style="font-size:12.5px;font-weight:800;line-height:1.25;">${escapeHtml(node.descripcion || 'Partida')}</div>
              </div>
            </button>
            <div style="text-align:right;flex-shrink:0;">
              <div class="m-mono" style="font-size:12.5px;font-weight:800;">${escapeHtml(formatMoney(imp))}</div>
              ${ctx.editable ? `
                <button type="button" data-add-child="${escapeHtml(node.id)}" class="m-btn m-btn-sm m-btn-soft" style="margin-top:4px;padding:3px 7px;font-size:10.5px;">
                  <i class="fa-solid fa-plus"></i> Sub
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }

      const chatCount = getPartidaChatCount(node.id);
      return `
        <div class="m-card" style="margin-left:${pad}px;padding:11px 12px;">
          <div class="m-row" style="align-items:flex-start;">
            <input type="checkbox" data-sel-node="${escapeHtml(node.id)}" ${node.selected ? 'checked' : ''} style="margin-top:3px;width:16px;height:16px;flex-shrink:0;" title="Incluir en Insumos Base">
            <button type="button" data-open-concept="${escapeHtml(node.id)}" style="flex:1;min-width:0;border:none;background:none;color:inherit;text-align:left;padding:0;cursor:pointer;">
              <div class="m-row-between" style="margin-bottom:3px;">
                <span class="m-pill m-pill-blue m-mono">${escapeHtml(node.clave || 'S/C')}</span>
                <span class="m-mono" style="font-size:13px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(imp))}</span>
              </div>
              <div style="font-size:12.5px;font-weight:700;line-height:1.35;">${escapeHtml(node.descripcion || '')}</div>
              <div class="m-row-between" style="margin-top:6px;font-size:11.5px;color:var(--muted);">
                <span class="m-mono">${escapeHtml(formatQty(node.cantidad || 0))} ${escapeHtml(node.unidad || 'pza')} &times; ${escapeHtml(formatMoney(node.precioUnitario || 0))}</span>
                <span class="m-row" style="gap:8px;">
                  ${chatCount > 0 ? `<span class="m-pill m-pill-blue"><i class="fa-solid fa-comments"></i> ${chatCount}</span>` : ''}
                  <span style="color:var(--primary);font-weight:700;">Ver APU <i class="fa-solid fa-angle-right"></i></span>
                </span>
              </div>
            </button>
          </div>
          ${ctx.editable && depth === 0 ? `
            <div style="text-align:right;margin-top:6px;padding-top:6px;border-top:1px solid var(--border);">
              <button type="button" data-add-child="${escapeHtml(node.id)}" class="m-btn m-btn-sm m-btn-soft" style="padding:3px 8px;font-size:10.5px;">
                <i class="fa-solid fa-plus"></i> Sub
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('')}
  </div>`;

  body.querySelectorAll('[data-toggle-node]').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = findNodeById(state.treeData, btn.dataset.toggleNode);
      if (n) {
        n.expanded = n.expanded === false;
        persistLocalData();
        renderPresupuestoList(container, ctx);
      }
    });
  });

  body.querySelectorAll('[data-add-child]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      addChildRow(btn.dataset.addChild);
      renderMobilePresupuesto(container, ctx);
    });
  });

  body.querySelectorAll('[data-sel-node]').forEach(cb => {
    cb.addEventListener('change', () => {
      const n = findNodeById(state.treeData, cb.dataset.selNode);
      if (n) {
        n.selected = cb.checked;
        persistLocalData(true);
      }
    });
  });

  body.querySelectorAll('[data-open-concept]').forEach(btn => {
    btn.addEventListener('click', () => {
      openConceptSheet(btn.dataset.openConcept, container, ctx);
    });
  });
}

function renderInsumosBaseList(body, ctx) {
  const map = getConsolidatedDataMap();
  const q = searchText.trim().toLowerCase();
  const allRows = [];

  Object.keys(map || {}).forEach(cat => {
    if (insumoCatFilter !== 'Todos' && cat !== insumoCatFilter) return;
    Object.values(map[cat] || {}).forEach(item => {
      const text = `${item.clave} ${item.descripcion} ${cat}`.toLowerCase();
      if (!q || text.includes(q)) {
        allRows.push({ ...item, categoria: cat });
      }
    });
  });

  const whSummary = getWarehouseStockSummary();
  const stockMap = new Map((whSummary.items || []).map(i => [i.insumoKey, i]));

  body.innerHTML = `
    <div class="m-chip-bar" style="margin-bottom:10px;">
      ${INSUMO_CATS.map(cat => `
        <button type="button" data-ins-cat="${escapeHtml(cat)}" class="m-chip ${insumoCatFilter === cat ? 'is-active' : ''}">
          ${escapeHtml(cat)}
        </button>
      `).join('')}
    </div>
    ${allRows.length === 0 ? `
      <div class="m-card" style="text-align:center;padding:22px;">
        <div style="font-size:13.5px;font-weight:800;">Sin insumos consolidados</div>
        <p class="m-subtitle" style="margin-bottom:10px;">Marca las casillas de los conceptos en Catálogo Base para consolidar sus insumos aquí.</p>
        <button type="button" id="m-sel-all-concepts" class="m-btn m-btn-soft m-btn-sm">
          <i class="fa-solid fa-check-double"></i> Seleccionar todos los conceptos
        </button>
      </div>
    ` : `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${allRows.map(item => {
          const whKey = getInsumoConsolidationKey(item);
          const wh = stockMap.get(whKey);
          const stockQty = wh ? wh.availableStock : 0;
          return `
            <div class="m-card">
              <div class="m-row-between" style="margin-bottom:4px;">
                <span class="m-pill m-pill-blue">${escapeHtml(item.categoria)}</span>
                <span class="m-mono" style="font-size:13px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(item.totalImporte))}</span>
              </div>
              <div style="font-size:12.5px;font-weight:700;">${escapeHtml(item.descripcion)}</div>
              <div class="m-row-between" style="margin-top:6px;font-size:11.5px;color:var(--muted);">
                <span class="m-mono">Base: ${escapeHtml(formatQty(item.cantidadTotal))} ${escapeHtml(item.unidad)} &times; ${escapeHtml(formatMoney(item.costoUnitario))}</span>
                <span class="m-pill ${stockQty > 0 ? 'm-pill-green' : 'm-pill-neutral'}">
                  Stock: ${escapeHtml(formatQty(stockQty))}
                </span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `}
  `;

  body.querySelectorAll('[data-ins-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      insumoCatFilter = btn.dataset.insCat;
      renderInsumosBaseList(body, ctx);
    });
  });

  body.querySelector('#m-sel-all-concepts')?.addEventListener('click', () => {
    const selectLeaves = (nodes) => (nodes || []).forEach(n => {
      if (n.children && n.children.length > 0) selectLeaves(n.children);
      else n.selected = true;
    });
    selectLeaves(state.treeData);
    persistLocalData(true);
    renderInsumosBaseList(body, ctx);
  });
}

function ensureConceptInsumos(node) {
  if (!node) return [];
  if (!Array.isArray(node.insumos)) node.insumos = [];
  const isLeaf = !node.children || node.children.length === 0;
  if (isLeaf && !node.isMatrixCustomized && !node.userClearedMatrix && node.insumos.length === 0) {
    const opus = getExactOpusInsumosForClave(node.clave);
    if (opus && opus.length > 0) {
      node.insumos = JSON.parse(JSON.stringify(opus));
      node.insumos.forEach(ins => {
        ins.cantidad = round5(ins.cantidad);
        ins.costoUnitario = round2(ins.costoUnitario);
      });
    } else if (parseFloat(node.precioUnitario) > 0 || parseFloat(node.costoDirecto) > 0) {
      node.insumos = generateIntegratedMatrixForConcept(node);
    }
  }
  return node.insumos;
}

function openConceptSheet(conceptId, container, ctx) {
  const node = findNodeById(state.treeData, conceptId);
  if (!node) return;
  const insumos = ensureConceptInsumos(node);

  const renderSheetContent = () => {
    const canEdit = canCurrentUserEditProject() && !isTabLocked('cat');
    const cantConc = round2(node.cantidad || 0);
    const pu = round2(node.precioUnitario || 0);
    const cd = round2(node.costoDirecto !== undefined ? node.costoDirecto : pu);
    const factor = getFactorSobrecosto();

    const expenses = getExpensesRecords().filter(r => r.paymentStatus !== 'cancelled');
    const whOutMap = getWarehouseNetConsumptionMap();
    const stockSummary = getWarehouseStockSummary();
    const stockMap = new Map((stockSummary.items || []).map(i => [i.insumoKey, i.availableStock]));

    const matricesHtml = insumos.length === 0
      ? '<div class="m-card-alt" style="text-align:center;font-size:12px;color:var(--muted);">Sin insumos desglosados en la matriz APU.</div>'
      : insumos.map((ins, i) => {
          const insCant = round5(ins.cantidad || 0);
          const insCu = round2(ins.costoUnitario || 0);
          const unitSub = round2(insCant * insCu);
          const totalCantObra = explodeInsumoQty(ins, cantConc);
          const totalImporteObra = explodeInsumoImporte(ins, cantConc);
          const key = getInsumoConsolidationKey(ins);
          const boughtQty = expenses
            .filter(r => r.insumoId === key || getInsumoConsolidationKey({ clave: r.insumoClave, descripcion: r.description, unidad: r.unit, tipo: r.category }) === key)
            .reduce((s, r) => s + round2(r.quantity || 0), 0);
          const whEntry = whOutMap?.byKey?.get(key)
            || (ins.clave ? whOutMap?.byClave?.get(String(ins.clave).trim().toLowerCase()) : null);
          const whOutQty = round2(whEntry?.netExitedToSiteQty || 0);
          const whStock = round2(whEntry?.stockEnBodega ?? stockMap.get(key) ?? 0);

          if (conceptDetailTab === 'matriz') {
            return `
              <div class="m-card-alt">
                <div class="m-row-between">
                  <span class="m-pill m-pill-blue">${escapeHtml(ins.tipo || 'Material')}</span>
                  <span class="m-mono" style="font-size:12px;font-weight:800;">${escapeHtml(formatMoney(unitSub))} / ${escapeHtml(node.unidad || 'ud')}</span>
                </div>
                <div style="font-size:12px;font-weight:700;margin:4px 0;">${escapeHtml(ins.descripcion || '')}</div>
                <div class="m-row-between" style="font-size:11px;color:var(--muted);">
                  <span class="m-mono">${escapeHtml(formatMatrixQty(insCant))} ${escapeHtml(ins.unidad || '')} &times; ${escapeHtml(formatMoney(insCu))}</span>
                  ${canEdit ? `<button type="button" data-del-ins="${i}" class="m-btn m-btn-sm m-btn-outline" style="color:var(--danger);padding:2px 7px;"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
              </div>
            `;
          }
          if (conceptDetailTab === 'unitarios') {
            return `
              <div class="m-card-alt m-row-between">
                <div style="min-width:0;flex:1;">
                  <div style="font-size:12px;font-weight:700;">${escapeHtml(ins.descripcion || '')}</div>
                  <div class="m-mono" style="font-size:11px;color:var(--muted);">Rend: ${escapeHtml(formatMatrixQty(insCant))} ${escapeHtml(ins.unidad || '')}</div>
                </div>
                <div style="text-align:right;">
                  <div class="m-mono" style="font-size:12px;font-weight:800;">${escapeHtml(formatMoney(insCu))}</div>
                  <div class="m-mono" style="font-size:10.5px;color:var(--primary);">Imp: ${escapeHtml(formatMoney(unitSub))}</div>
                </div>
              </div>
            `;
          }
          return `
            <div class="m-card-alt">
              <div class="m-row-between" style="margin-bottom:4px;">
                <span style="font-size:12px;font-weight:700;flex:1;min-width:0;">${escapeHtml(ins.descripcion || '')}</span>
                <span class="m-mono" style="font-size:12px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(totalImporteObra))}</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;font-size:10.5px;text-align:center;">
                <div class="m-card" style="padding:5px 3px;"><div style="color:var(--muted);">Base</div><strong class="m-mono">${escapeHtml(formatQty(totalCantObra))}</strong></div>
                <div class="m-card" style="padding:5px 3px;"><div style="color:var(--muted);">Comprado</div><strong class="m-mono">${escapeHtml(formatQty(boughtQty))}</strong></div>
                <div class="m-card" style="padding:5px 3px;"><div style="color:var(--muted);">Salidas</div><strong class="m-mono">${escapeHtml(formatQty(whOutQty))}</strong></div>
                <div class="m-card" style="padding:5px 3px;"><div style="color:var(--muted);">Bodega</div><strong class="m-mono">${escapeHtml(formatQty(whStock))}</strong></div>
              </div>
            </div>
          `;
        }).join('');

    ctx.openSheet({
      title: `Concepto ${node.clave || ''}`,
      bodyHtml: `
        <div class="m-card-alt">
          <div style="font-size:13px;font-weight:800;line-height:1.35;">${escapeHtml(node.descripcion || '')}</div>
          <div class="m-grid-2" style="margin-top:8px;">
            <div>
              <div style="font-size:10.5px;color:var(--muted);">Costo Directo / P.U.</div>
              <div class="m-mono" style="font-size:13px;font-weight:800;">${escapeHtml(formatMoney(cd))} / ${escapeHtml(formatMoney(pu))}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10.5px;color:var(--muted);">Importe Total</div>
              <div class="m-mono" style="font-size:14px;font-weight:800;color:var(--primary);">${escapeHtml(formatMoney(round2(cantConc * pu)))}</div>
            </div>
          </div>
        </div>

        ${canEdit ? `
          <div class="m-card">
            <div style="font-size:11.5px;font-weight:800;margin-bottom:8px;">Edición rápida de concepto</div>
            <div class="m-grid-2">
              <div>
                <label class="m-label" for="m-c-cant">Cantidad (${escapeHtml(node.unidad || 'pza')})</label>
                <input id="m-c-cant" type="number" step="0.01" class="m-input m-mono" value="${cantConc}">
              </div>
              <div>
                <label class="m-label" for="m-c-pu">Precio Unitario ${insList.length > 0 ? '<span style="font-size:10px;color:var(--muted);">(APU)</span>' : ''}</label>
                <input id="m-c-pu" type="number" step="0.01" class="m-input m-mono" value="${pu}" ${insList.length > 0 ? 'disabled title="Calculado automáticamente por la matriz APU"' : ''}>
              </div>
            </div>
            <button type="button" id="m-c-save-fields" class="m-btn m-btn-primary m-btn-sm" style="margin-top:8px;width:100%;">
              <i class="fa-solid fa-floppy-disk"></i> Guardar Cambios
            </button>
          </div>
        ` : ''}

        <div class="m-segmented">
          <button type="button" data-cd-tab="matriz" class="m-seg-btn ${conceptDetailTab === 'matriz' ? 'is-active' : ''}">Matriz</button>
          <button type="button" data-cd-tab="unitarios" class="m-seg-btn ${conceptDetailTab === 'unitarios' ? 'is-active' : ''}">Unitarios</button>
          <button type="button" data-cd-tab="totales" class="m-seg-btn ${conceptDetailTab === 'totales' ? 'is-active' : ''}">Totales</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:7px;">${matricesHtml}</div>

        ${canEdit && conceptDetailTab === 'matriz' ? `
          <form id="m-add-insumo-form" class="m-card-alt" style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:11.5px;font-weight:800;"><i class="fa-solid fa-plus"></i> Agregar insumo a matriz</div>
            <div class="m-grid-2">
              <select id="m-ai-tipo" class="m-select">
                <option value="Material">Material</option>
                <option value="Mano de Obra">Mano de Obra</option>
                <option value="Herramienta">Herramienta</option>
                <option value="Equipo">Equipo</option>
                <option value="Maquinaria">Maquinaria</option>
                <option value="Subcontrato">Subcontrato</option>
              </select>
              <input id="m-ai-unid" class="m-input" value="pza" placeholder="Unidad">
            </div>
            <input id="m-ai-desc" class="m-input" required placeholder="Descripción del insumo">
            <div class="m-grid-2">
              <input id="m-ai-cant" type="number" step="0.00001" required class="m-input m-mono" placeholder="Cantidad (1 ${escapeHtml(node.unidad || 'ud')})">
              <input id="m-ai-cu" type="number" step="0.01" required class="m-input m-mono" placeholder="Costo Unitario">
            </div>
            <button type="submit" class="m-btn m-btn-soft m-btn-sm"><i class="fa-solid fa-plus"></i> Añadir Insumo</button>
          </form>
        ` : ''}
      `,
      footerHtml: `
        <button type="button" id="m-c-open-chat" class="m-btn m-btn-soft" style="margin-right:auto;">
          <i class="fa-solid fa-comments"></i> Chat Concepto
        </button>
        <button type="button" id="m-c-close" class="m-btn m-btn-outline">Cerrar</button>
      `
    });

    document.getElementById('m-c-close')?.addEventListener('click', ctx.closeSheet);
    document.getElementById('m-c-open-chat')?.addEventListener('click', () => {
      ctx.closeSheet();
      ctx.onOpenConceptChat?.(node);
    });

    document.querySelectorAll('[data-cd-tab]').forEach(b => {
      b.addEventListener('click', () => {
        conceptDetailTab = b.dataset.cdTab;
        renderSheetContent();
      });
    });

    document.getElementById('m-c-save-fields')?.addEventListener('click', () => {
      const nextCant = parseFloat(document.getElementById('m-c-cant')?.value) || 0;
      const hasMat = Array.isArray(node.insumos) && node.insumos.length > 0;
      const nextPu = parseFloat(document.getElementById('m-c-pu')?.value) || 0;
      const okCant = updateNode(node.id, 'cantidad', nextCant);
      const okPu = hasMat ? true : updateNode(node.id, 'precioUnitario', nextPu);
      if (okCant === false || okPu === false) {
        return;
      }
      showToast('Concepto actualizado y sincronizado.', 'success');
      renderMobilePresupuesto(container, ctx);
      renderSheetContent();
    });

    document.querySelectorAll('[data-del-ins]').forEach(b => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.dataset.delIns, 10);
        if (!Number.isInteger(idx) || !node.insumos[idx]) return;
        node.insumos.splice(idx, 1);
        node.isMatrixCustomized = true;
        recalcNodeFromInsumos(node, factor);
        persistLocalData(true);
        renderMobilePresupuesto(container, ctx);
        renderSheetContent();
      });
    });

    document.getElementById('m-add-insumo-form')?.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const tipo = document.getElementById('m-ai-tipo').value;
      const unidad = document.getElementById('m-ai-unid').value.trim() || 'pza';
      const descripcion = document.getElementById('m-ai-desc').value.trim();
      const cantidad = round5(parseFloat(document.getElementById('m-ai-cant').value) || 0);
      const costoUnitario = round2(parseFloat(document.getElementById('m-ai-cu').value) || 0);
      if (!descripcion) return;
      node.insumos.push({
        id: `ins_${Date.now()}`,
        tipo,
        clave: tipo.slice(0, 3).toUpperCase(),
        descripcion,
        unidad,
        cantidad,
        costoUnitario
      });
      node.isMatrixCustomized = true;
      recalcNodeFromInsumos(node, factor);
      persistLocalData(true);
      showToast('Insumo agregado a la matriz APU.', 'success');
      renderMobilePresupuesto(container, ctx);
      renderSheetContent();
    });
  };

  renderSheetContent();
}

function recalcNodeFromInsumos(node, factor) {
  syncPercentInsumos(node.insumos || []);
  const direct = computeMatrixDirectCost(node.insumos || [], { syncPercent: false });
  node.costoDirecto = direct;
  node.precioUnitario = round2(direct * (factor || 1));
}
