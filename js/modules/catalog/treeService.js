import { state, persistLocalData } from '../../state/store.js?v=20261116_cf18';
import { saveState } from '../../state/history.js?v=20261116_cf18';
import { showToast } from '../../ui/notifications.js?v=20261116_cf18';
import { renderTAB1, closeApuPanel, selectRow } from './catalogView.js?v=20261116_cf18';
import { renderInsumosUnitarios } from '../apu/apuView.js?v=20261116_cf18';
import { renderInsumosGenerales } from '../insumosGenerales/insumosView.js?v=20261116_cf18';
import { getActiveProjectId, STORAGE_KEY_CLIPBOARD } from '../../config/constants.js?v=20261116_cf18';
import { getProjectById, validateConceptAdditionLimit, countTreeConcepts, canCurrentUserEditProject } from '../portal/projectService.js?v=20261116_cf18';
export { countTreeConcepts };
import { getFactorSobrecosto, round2 } from '../../core/calculations.js?v=20261116_cf18';
import { guardTabUnlocked } from '../../ui/tabLockController.js?v=20261116_cf18';
import { broadcastConceptChange, pushConceptUpdateToSupabase } from '../../core/realtimeSync.js?v=20261116_cf18';

function createNodeUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidNodeUuid(val) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || '').trim());
}

function renewInsumosUuids(insumos) {
  if (!Array.isArray(insumos)) return [];
  return JSON.parse(JSON.stringify(insumos)).map((ins) => {
    if (!ins || typeof ins !== 'object') return ins;
    const nextUuid = createNodeUuid();
    return { ...ins, id: nextUuid, uuid: nextUuid };
  });
}

/**
 * Guardia centralizado de límite de conceptos por suscripción (100 Gratuita, 1500 Plus, 3500 Pro).
 */
export function guardConceptLimit(additionalConcepts = 1, options = {}) {
  const check = validateConceptAdditionLimit(getActiveProjectId(), additionalConcepts, {
    ...options,
    liveTreeData: Array.isArray(options?.liveTreeData) ? options.liveTreeData : state.treeData
  });
  if (!check.allowed) {
    showToast(`🔒 ${check.reason}`, 'warning');
    if (typeof window !== 'undefined' && typeof window.openSubscriptionModal === 'function') {
      window.openSubscriptionModal();
    }
    return false;
  }
  return true;
}

// Buscar un nodo por su ID, UUID o Clave recursivamente
export function findNodeById(nodes, id) {
  if (!Array.isArray(nodes) || !id) return null;
  for (let n of nodes) {
    if (n.id === id || (n.uuid && n.uuid === id) || (n.clave && n.clave === id)) return n;
    if (n.children) {
      let found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Obtener contexto de un nodo (padre, arreglo contenedor, índice)
export function findNodeContext(nodes, id, parent = null, parentArray = null) {
  if (!parentArray) parentArray = nodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) {
      return {
        node: n,
        parent: parent,
        parentArray: nodes,
        index: i
      };
    }
    if (n.children && n.children.length > 0) {
      const found = findNodeContext(n.children, id, n, n.children);
      if (found) return found;
    }
  }
  return null;
}

// Obtener arreglo contenedor directo de un nodo
export function findParentArrayOfNode(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return nodes;
    if (nodes[i].children) {
      let found = findParentArrayOfNode(nodes[i].children, id);
      if (found) return found;
    }
  }
  return null;
}

// Obtener la ruta jerárquica de descripciones para dar contexto completo a la IA
export function getNodeHierarchyPath(nodes, targetId, path = []) {
  for (let n of nodes) {
    const current = [...path, n.descripcion];
    if (n.id === targetId) return current;
    if (n.children && n.children.length > 0) {
      const res = getNodeHierarchyPath(n.children, targetId, current);
      if (res) return res;
    }
  }
  return null;
}

// Renumeración jerárquica de claves (1, 1.1, 1.1.1...)
export function recalculateClaves(nodes, parentClave = '', options = {}) {
  if (!Array.isArray(nodes)) return;
  const force = Boolean(options && options.force);
  nodes.forEach((node, idx) => {
    if (!node || typeof node !== 'object') return;
    const computedClave = parentClave ? `${parentClave}.${idx + 1}` : `${idx + 1}`;
    const existingClave = typeof node.clave === 'string' ? node.clave.trim() : '';
    const hasCustomAlphanumericClave = Boolean(existingClave && !/^\d+(\.\d+)*$/.test(existingClave));
    if (force || !hasCustomAlphanumericClave) {
      node.clave = computedClave;
    }
    if (node.children && node.children.length > 0) {
      const nextParentClave = (force || !hasCustomAlphanumericClave) ? node.clave : computedClave;
      recalculateClaves(node.children, nextParentClave, options);
    }
  });
}

// Agregar partida raíz principal
export function addRootRow() {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para agregar partidas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  if (!guardConceptLimit(1)) return;
  saveState();
  const newId = createNodeUuid();
  const newPartida = {
    id: newId,
    uuid: newId,
    clave: '',
    descripcion: 'NUEVA PARTIDA PRINCIPAL',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    expanded: true,
    selected: false,
    children: []
  };
  state.treeData.push(newPartida);
  recalculateClaves(state.treeData);
  persistLocalData(true, {
    changeType: 'row_added',
    highlightId: newId,
    changeDescription: 'una partida principal',
    skipFullCloudSync: true,
    patch: { type: 'add_root_row', node: newPartida, orden: state.treeData.length - 1 }
  });
  renderTAB1();
  showToast('Partida agregada', 'success');
}

// Agregar sub-concepto / sub-renglón
export function addChildRow(parentId, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para agregar conceptos en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  const parent = findNodeById(state.treeData, parentId);
  if (!parent) return;

  // RESTRICCIÓN: si la fila ya cuenta con una matriz, restringir que se cree una sub fila
  if (parent.insumos && parent.insumos.length > 0) {
    showToast('Restricción: Esta fila ya cuenta con una matriz de insumos. Elimina sus insumos primero si deseas convertirla en partida con sub-filas.', 'warning');
    return;
  }

  const wasLeaf = !Array.isArray(parent.children) || parent.children.length === 0;
  const conceptDelta = wasLeaf ? 0 : 1;
  if (!guardConceptLimit(conceptDelta)) return;

  saveState();
  if (!parent.children) parent.children = [];
  parent.unidad = 'lote';
  if (wasLeaf) {
    parent.cantidad = 0;
    parent.precioUnitario = 0;
    parent.costoDirecto = 0;
  }
  const newId = createNodeUuid();
  const newNode = {
    id: newId,
    uuid: newId,
    clave: '',
    descripcion: 'Nuevo Sub-concepto',
    unidad: 'm2',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    expanded: true,
    selected: false,
    children: []
  };
  parent.children.push(newNode);
  parent.expanded = true;

  // RESTRICCIÓN: Al tener ahora una sub-fila, no mostrar la tabla de matrices para este padre
  if (state.activeSelectedId === parentId) {
    const apuPanel = document.getElementById('apu-panel');
    const panelResizer = document.getElementById('panel-resizer');
    if (apuPanel) apuPanel.classList.add('hidden');
    if (panelResizer) panelResizer.classList.add('hidden');
  }

  recalculateClaves(state.treeData);
  persistLocalData(true, {
    changeType: 'row_added',
    highlightId: newId,
    changeDescription: 'un nuevo concepto',
    skipFullCloudSync: true,
    patch: {
      type: 'add_child_row',
      parentId: parent.id,
      parentUuid: parent.uuid || parent.id,
      parentClave: parent.clave || '',
      node: newNode,
      orden: parent.children.length - 1
    }
  });
  renderTAB1();
  showToast('Sub-renglón agregado', 'success');
}

// Duplicar un nodo
export function duplicarNode(id, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para duplicar renglones.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  const nodeToDuplicate = findNodeById(state.treeData, id);
  if (!nodeToDuplicate) return;
  const cloneConcepts = Math.max(1, countTreeConcepts([nodeToDuplicate]));
  if (!guardConceptLimit(cloneConcepts)) return;
  saveState();

  function cloneNode(node) {
    const clonedId = createNodeUuid();
    return {
      id: clonedId,
      uuid: clonedId,
      clave: '',
      descripcion: node.descripcion + ' (Copia)',
      unidad: node.unidad,
      cantidad: node.cantidad,
      precioUnitario: node.precioUnitario,
      costoDirecto: node.costoDirecto || node.precioUnitario,
      expanded: node.expanded,
      selected: node.selected,
      color: node.color || null,
      googleSearchQueries: node.googleSearchQueries ? [...node.googleSearchQueries] : [],
      googleSources: node.googleSources ? [...node.googleSources] : [],
      aiTips: node.aiTips || '',
      insumos: renewInsumosUuids(node.insumos || []),
      children: (node.children || []).map(child => cloneNode(child))
    };
  }

  const cloned = cloneNode(nodeToDuplicate);
  const ctx = findNodeContext(state.treeData, nodeToDuplicate.id);
  const parentList = ctx ? ctx.parentArray : findParentArrayOfNode(state.treeData, id);
  if (parentList) {
    const index = parentList.findIndex(n => n.id === nodeToDuplicate.id);
    const insertAt = index >= 0 ? index + 1 : parentList.length;
    parentList.splice(insertAt, 0, cloned);
    recalculateClaves(state.treeData);
    persistLocalData(true, {
      changeType: 'row_added',
      highlightId: cloned.id,
      changeDescription: 'renglón duplicado',
      skipFullCloudSync: true,
      patch: {
        type: 'duplicate_node',
        id: nodeToDuplicate.id,
        uuid: nodeToDuplicate.uuid || nodeToDuplicate.id,
        clave: nodeToDuplicate.clave || '',
        parentId: ctx?.parent?.id || null,
        parentUuid: ctx?.parent?.uuid || ctx?.parent?.id || null,
        position: insertAt,
        clonedNode: cloned
      }
    });
    renderTAB1();
    showToast('Renglón duplicado', 'success');
  }
}

export function duplicarSelectedRow() {
  if (!state.activeSelectedId) {
    showToast('Selecciona una fila primero', 'warning');
    return;
  }
  duplicarNode(state.activeSelectedId);
}

// ==========================================
// PORTAPAPELES UNIVERSAL (ENTRE PROYECTOS)
// ==========================================

export function getClipboardData() {
  if (state.clipboardNode) {
    return {
      node: state.clipboardNode,
      meta: state.clipboardMeta || {
        sourceProjectId: null,
        sourceProjectName: 'Proyecto',
        insumosCount: Array.isArray(state.clipboardNode.insumos) ? state.clipboardNode.insumos.length : 0
      }
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_CLIPBOARD);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.clipboardNode = parsed.concept || parsed;
      state.clipboardMeta = {
        sourceProjectId: parsed.sourceProjectId || null,
        sourceProjectName: parsed.sourceProjectName || 'Otro Proyecto',
        insumosCount: parsed.insumosCount || (parsed.concept?.insumos?.length || 0),
        copiedAt: parsed.copiedAt || null
      };
      return {
        node: state.clipboardNode,
        meta: state.clipboardMeta
      };
    }
  } catch (e) {
    console.warn('Error al leer portapapeles compartido:', e);
  }

  return null;
}

// Copiar concepto con su respectiva matriz APU al portapapeles universal
export function copiarNode(id, e) {
  if (e) e.stopPropagation();
  const node = findNodeById(state.treeData, id);
  if (!node) return;

  const currentProjId = getActiveProjectId();
  const currentProj = currentProjId ? getProjectById(currentProjId) : null;
  const projectName = currentProj ? currentProj.projectName : (state.settings.projectName || 'Proyecto Actual');

  const clonedNode = JSON.parse(JSON.stringify(node));
  const insumosCount = Array.isArray(clonedNode.insumos) ? clonedNode.insumos.length : 0;

  const payload = {
    concept: clonedNode,
    sourceProjectId: currentProjId || 'default',
    sourceProjectName: projectName,
    insumosCount: insumosCount,
    copiedAt: new Date().toISOString()
  };

  state.clipboardNode = clonedNode;
  state.clipboardMeta = payload;

  try {
    localStorage.setItem(STORAGE_KEY_CLIPBOARD, JSON.stringify(payload));
  } catch (err) {
    console.error('Error al persistir en portapapeles compartido:', err);
  }

  updateClipboardUI();

  const matrizInfo = insumosCount > 0 
    ? ` con su matriz APU (${insumosCount} insumo${insumosCount === 1 ? '' : 's'})` 
    : ' (sin insumos)';
  const claveTxt = node.clave ? `[${node.clave}] ` : '';
  showToast(`Copiado: ${claveTxt}"${node.descripcion.slice(0, 35)}..."${matrizInfo}. Listo para pegar en este u otro proyecto.`);
}

export function copiarSelectedRow() {
  if (!state.activeSelectedId) {
    showToast('Selecciona un concepto primero para copiarlo.', 'warning');
    return;
  }
  copiarNode(state.activeSelectedId);
}

// Pegar concepto copiado (con su respectiva matriz APU) en la ubicación seleccionada
export function pegarNode(targetId, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para pegar conceptos en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;

  const clip = getClipboardData();
  if (!clip || !clip.node) {
    showToast('No hay ningún concepto copiado en el portapapeles. Copia un concepto primero.', 'warning');
    return;
  }

  const pasteConcepts = Math.max(1, countTreeConcepts([clip.node]));
  if (!guardConceptLimit(pasteConcepts)) return;

  saveState();

  const { node: sourceNode, meta } = clip;
  const isDifferentProject = meta && meta.sourceProjectId && meta.sourceProjectId !== getActiveProjectId();

  // Buscar lista de destino
  let parentList = null;
  let insertIndex = -1;

  if (targetId) {
    parentList = findParentArrayOfNode(state.treeData, targetId);
    if (parentList) {
      insertIndex = parentList.findIndex(n => n.id === targetId);
    }
  }

  if (!parentList) {
    parentList = state.treeData;
    insertIndex = parentList.length - 1;
  }

  // Renovación recursiva de IDs únicos y preservación íntegra de la Matriz APU
  function renewNodeDeep(n) {
    const nextUuid = createNodeUuid();
    n.id = nextUuid;
    n.uuid = nextUuid;
    n.selected = true;

    // Clonar matriz de insumos con UUIDs únicos sin mutar referencias
    n.insumos = renewInsumosUuids(n.insumos || []);

    // Adaptar Precio Unitario según el Factor de Sobrecosto del proyecto destino
    if (n.costoDirecto !== undefined && n.costoDirecto !== null) {
      const factor = getFactorSobrecosto();
      n.precioUnitario = round2(n.costoDirecto * factor);
    }

    if (Array.isArray(n.children)) {
      n.children.forEach(c => renewNodeDeep(c));
    }
  }

  const pastedNode = JSON.parse(JSON.stringify(sourceNode));
  renewNodeDeep(pastedNode);

  // Si se pega dentro del mismo proyecto, agregar distintivo "(Copia)"; si viene de otro proyecto, conservar limpio
  if (!isDifferentProject) {
    pastedNode.descripcion = pastedNode.descripcion.endsWith('(Copia)')
      ? pastedNode.descripcion
      : `${pastedNode.descripcion} (Copia)`;
  }

  const position = insertIndex >= 0 ? insertIndex + 1 : parentList.length;
  parentList.splice(position, 0, pastedNode);

  recalculateClaves(state.treeData);
  const pasteCtx = findNodeContext(state.treeData, pastedNode.id);
  const targetNodeRef = targetId ? findNodeById(state.treeData, targetId) : null;
  persistLocalData(true, {
    changeType: 'row_added',
    highlightId: pastedNode.id,
    changeDescription: 'concepto pegado',
    skipFullCloudSync: true,
    patch: {
      type: 'paste_node',
      targetId: targetId || null,
      targetUuid: targetNodeRef?.uuid || targetId || null,
      targetClave: targetNodeRef?.clave || '',
      parentId: pasteCtx?.parent?.id || null,
      parentUuid: pasteCtx?.parent?.uuid || pasteCtx?.parent?.id || null,
      position,
      node: pastedNode
    }
  });
  renderTAB1();

  // Seleccionar de inmediato la fila pegada para visualizar su matriz APU
  selectRow(pastedNode.id);

  const insCount = Array.isArray(pastedNode.insumos) ? pastedNode.insumos.length : 0;
  const originStr = (meta && meta.sourceProjectName) ? ` desde "${meta.sourceProjectName}"` : '';
  showToast(`¡Concepto pegado con su Matriz APU (${insCount} insumo${insCount === 1 ? '' : 's'})${originStr}!`, 'success');
}

export function pegarSelectedRow() {
  const clip = getClipboardData();
  if (!clip || !clip.node) {
    showToast('No hay ningún concepto copiado en el portapapeles.', 'warning');
    return;
  }
  const targetId = state.activeSelectedId || (state.treeData.length > 0 ? state.treeData[state.treeData.length - 1].id : null);
  pegarNode(targetId);
}

// Limpiar portapapeles
export function limpiarPortapapeles() {
  state.clipboardNode = null;
  state.clipboardMeta = null;
  try {
    localStorage.removeItem(STORAGE_KEY_CLIPBOARD);
  } catch (e) {}
  updateClipboardUI();
  showToast('Portapapeles vaciado.');
}

// Actualizar el indicador visual de concepto copiado en la interfaz
export function updateClipboardUI() {
  const clip = getClipboardData();
  const indicator = document.getElementById('clipboard-indicator');
  const btnPegar = document.getElementById('btn-toolbar-pegar');

  if (btnPegar) {
    if (clip && clip.node) {
      btnPegar.classList.remove('opacity-40');
      btnPegar.title = `Pegar concepto copiado: [${clip.node.clave || ''}] ${clip.node.descripcion.slice(0, 30)}... (${clip.meta?.insumosCount || 0} insumos)`;
    } else {
      btnPegar.title = 'No hay ningún concepto copiado en el portapapeles';
    }
  }

  if (indicator) {
    indicator.innerHTML = '';
    indicator.classList.add('hidden');
    indicator.classList.remove('flex');
  }
}

// Mover nodo arriba o abajo
export function moverNode(id, direction, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para mover filas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  const ctx = findNodeContext(state.treeData, id);
  if (!ctx) return;

  saveState();

  const { node, parent, parentArray, index } = ctx;
  const hasChildren = node.children && node.children.length > 0;

  if (direction === 'up') {
    if (index > 0) {
      const prevSibling = parentArray[index - 1];
      if (!hasChildren && prevSibling.children && prevSibling.children.length > 0) {
        parentArray.splice(index, 1);
        prevSibling.children.push(node);
        prevSibling.expanded = true;
      } else {
        parentArray[index] = prevSibling;
        parentArray[index - 1] = node;
      }
    } else {
      if (parent) {
        const grandCtx = findNodeContext(state.treeData, parent.id);
        if (grandCtx) {
          parentArray.splice(index, 1);
          grandCtx.parentArray.splice(grandCtx.index, 0, node);
        }
      } else {
        showToast('Ya está en la primera posición', 'info');
        return;
      }
    }
  } else if (direction === 'down') {
    if (index < parentArray.length - 1) {
      const nextSibling = parentArray[index + 1];
      if (!hasChildren && nextSibling.children && nextSibling.children.length > 0) {
        parentArray.splice(index, 1);
        nextSibling.children.unshift(node);
        nextSibling.expanded = true;
      } else {
        parentArray[index] = nextSibling;
        parentArray[index + 1] = node;
      }
    } else {
      if (parent) {
        const grandCtx = findNodeContext(state.treeData, parent.id);
        if (grandCtx) {
          parentArray.splice(index, 1);
          grandCtx.parentArray.splice(grandCtx.index + 1, 0, node);
        }
      } else {
        showToast('Ya está en la última posición', 'info');
        return;
      }
    }
  }

  recalculateClaves(state.treeData);
  persistLocalData(true, {
    changeType: 'row_moved',
    highlightId: id,
    changeDescription: 'orden de filas',
    patch: { type: 'move_node', id, direction }
  });
  renderTAB1();

  if (state.activeSelectedId === id) {
    const selNode = findNodeById(state.treeData, id);
    if (selNode) {
      const apuClave = document.getElementById('apu-clave');
      if (apuClave) apuClave.innerText = selNode.clave;
    }
  }

  setTimeout(() => {
    const selectedEl = document.querySelector('.selected-row');
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, 40);
}

export function moverSelectedRow(direction) {
  if (!state.activeSelectedId) {
    showToast('Selecciona una fila primero', 'warning');
    return;
  }
  moverNode(state.activeSelectedId, direction);
}

function collectSubtreeUuids(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.uuid) out.push(node.uuid);
  if (Array.isArray(node.children)) {
    node.children.forEach(c => collectSubtreeUuids(c, out));
  }
  return out;
}

// Eliminar nodo individual
export function deleteNode(id, e) {
  if (e) e.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para eliminar filas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  const targetNode = findNodeById(state.treeData, id);
  const targetUuid = targetNode?.uuid || null;
  const targetClave = targetNode?.clave || null;
  const descendantUuids = targetNode ? collectSubtreeUuids(targetNode) : [];
  saveState();
  function removeRecursive(nodes) {
    return nodes.filter(node => {
      if (node.id === id) return false;
      if (node.children) node.children = removeRecursive(node.children);
      return true;
    });
  }
  state.treeData = removeRecursive(state.treeData);
  if (state.activeSelectedId === id) closeApuPanel();
  recalculateClaves(state.treeData);
  if (typeof window !== 'undefined' && typeof window.markLocalConceptsDeleted === 'function') {
    window.markLocalConceptsDeleted(getActiveProjectId(), [targetUuid, id, ...descendantUuids]);
  }
  persistLocalData(true, {
    changeType: 'row_deleted',
    changeDescription: 'una fila del catálogo',
    skipFullCloudSync: true,
    patch: { type: 'delete_node', id, uuid: targetUuid, clave: targetClave, descendantUuids }
  });
  renderTAB1();
  showToast('Fila eliminada', 'info');
}

// Eliminar filas marcadas o fila seleccionada
export function deleteSelectedRow() {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para eliminar filas en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) return;
  function countCheckedNodes(nodes) {
    let count = 0;
    nodes.forEach(n => {
      if (n.selected) count++;
      if (n.children) count += countCheckedNodes(n.children);
    });
    return count;
  }

  const checkedTotal = countCheckedNodes(state.treeData);

  if (checkedTotal > 0) {
    if (!confirm(`¿Deseas eliminar las ${checkedTotal} filas marcadas con Checkbox?`)) return;
    saveState();

    const deletedIds = [];
    const deletedUuids = [];
    const deletedTargets = [];
    function collectCheckedTargets(nodes) {
      nodes.forEach(n => {
        if (n.selected) {
          deletedIds.push(n.id);
          if (n.uuid) deletedUuids.push(n.uuid);
          collectSubtreeUuids(n, deletedUuids);
          deletedTargets.push({ id: n.id, uuid: n.uuid || null, clave: n.clave || null });
        } else if (n.children) {
          collectCheckedTargets(n.children);
        }
      });
    }
    collectCheckedTargets(state.treeData);

    function filterOutChecked(nodes) {
      return nodes.filter(n => {
        if (n.selected) return false;
        if (n.children) n.children = filterOutChecked(n.children);
        return true;
      });
    }

    state.treeData = filterOutChecked(state.treeData);

    if (state.activeSelectedId) {
      const stillExists = findNodeById(state.treeData, state.activeSelectedId);
      if (!stillExists) closeApuPanel();
    }

    recalculateClaves(state.treeData);
    if (typeof window !== 'undefined' && typeof window.markLocalConceptsDeleted === 'function') {
      window.markLocalConceptsDeleted(getActiveProjectId(), [...deletedUuids, ...deletedIds]);
    }
    persistLocalData(true, {
      changeType: 'row_deleted',
      changeDescription: `${checkedTotal} fila(s) del catálogo`,
      skipFullCloudSync: true,
      patch: {
        type: 'delete_nodes',
        ids: deletedIds,
        uuids: Array.from(new Set(deletedUuids)),
        targets: deletedTargets
      }
    });
    renderTAB1();
    showToast(`${checkedTotal} filas eliminadas`, 'info');
  } else if (state.activeSelectedId) {
    if (confirm('¿Deseas eliminar la fila seleccionada actual?')) {
      deleteNode(state.activeSelectedId);
    }
  } else {
    showToast('Selecciona una fila o marca casillas para eliminar', 'warning');
  }
}

// Actualizar un campo de un nodo (descripcion, unidad, cantidad, precioUnitario)
export function updateNode(id, field, value) {
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para editar conceptos en este proyecto.', 'warning');
    renderTAB1();
    return;
  }
  if (!guardTabUnlocked('cat')) {
    renderTAB1();
    return;
  }
  const node = findNodeById(state.treeData, id);
  if (node) {
    if (!isValidNodeUuid(node.uuid)) {
      node.uuid = isValidNodeUuid(node.id) ? String(node.id) : createNodeUuid();
    }
    if (field === 'cantidad' || field === 'precioUnitario' || field === 'costoDirecto') {
      node[field] = Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
    } else {
      node[field] = value;
    }
    try {
      broadcastConceptChange(node);
    } catch (_) {}
    const isConfirmedInCloud = typeof window !== 'undefined' && typeof window.isConceptConfirmedInCloud === 'function'
      ? window.isConceptConfirmedInCloud(getActiveProjectId(), node.uuid)
      : true;
    persistLocalData(true, {
      changeType: 'text_edit',
      highlightId: node.id,
      changeDescription: `el concepto "${node.clave || ''}"`,
      patch: {
        type: 'update_field',
        id: node.id,
        uuid: node.uuid,
        clave: node.clave || '',
        field,
        value: node[field]
      },
      skipFullCloudSync: isConfirmedInCloud
    });
    renderTAB1();
    if (state.activeSelectedId === id || state.activeSelectedId === node.id) {
      renderInsumosUnitarios(node);
    }
  }
}

// Plegar / desplegar hijos de un nodo
export function toggleExpand(id, e) {
  if (e) e.stopPropagation();
  const node = findNodeById(state.treeData, id);
  if (node) {
    node.expanded = !node.expanded;
    persistLocalData();
    renderTAB1();
  }
}

// Agrupar (colapsar) todas las partidas del Catálogo Base
export function collapseAllCatalogNodes() {
  function collapseRecursive(nodes) {
    nodes.forEach(n => {
      if (n.children && n.children.length > 0) {
        n.expanded = false;
        collapseRecursive(n.children);
      }
    });
  }
  collapseRecursive(state.treeData);
  persistLocalData();
  renderTAB1();
  showToast('Se han agrupado todas las partidas del catálogo', 'info');
}

// Desagrupar (expandir) todas las partidas del Catálogo Base
export function expandAllCatalogNodes() {
  function expandRecursive(nodes) {
    nodes.forEach(n => {
      if (n.children && n.children.length > 0) {
        n.expanded = true;
        expandRecursive(n.children);
      }
    });
  }
  expandRecursive(state.treeData);
  persistLocalData();
  renderTAB1();
  showToast('Se han desagrupado y mostrado todos los conceptos', 'info');
}

// Acción de barra de herramientas: Agrupar conceptos
export function agruparCatalogoConceptos() {
  if (state.activeSelectedId) {
    const selectedNode = findNodeById(state.treeData, state.activeSelectedId);
    if (selectedNode && selectedNode.children && selectedNode.children.length > 0) {
      selectedNode.expanded = false;
      persistLocalData();
      renderTAB1();
      showToast(`Partida ${selectedNode.clave || ''} agrupada`, 'info');
      return;
    }
  }
  collapseAllCatalogNodes();
}

// Acción de barra de herramientas: Desagrupar conceptos
export function desagruparCatalogoConceptos() {
  if (state.activeSelectedId) {
    const selectedNode = findNodeById(state.treeData, state.activeSelectedId);
    if (selectedNode && selectedNode.children && selectedNode.children.length > 0) {
      selectedNode.expanded = true;
      persistLocalData();
      renderTAB1();
      showToast(`Partida ${selectedNode.clave || ''} desagrupada`, 'info');
      return;
    }
  }
  expandAllCatalogNodes();
}

// Actualizar color propio de un nodo
export function updateNodeColor(id, newColor, event) {
  if (event) event.stopPropagation();
  if (!canCurrentUserEditProject()) {
    showToast('🔒 Modo solo lectura: No tienes permisos para editar colores en este proyecto.', 'warning');
    return;
  }
  if (!guardTabUnlocked('cat')) {
    renderTAB1();
    return;
  }
  const node = findNodeById(state.treeData, id);
  if (!node) return;
  saveState();
  node.color = newColor;
  persistLocalData(false, {
    changeType: 'color_updated',
    highlightId: id,
    changeDescription: `color de ${node.clave || 'partida'}`,
    patch: { type: 'update_color', id, uuid: node.uuid || null, clave: node.clave || null, color: newColor }
  });
  renderTAB1();
  showToast(`Color asignado a ${node.clave || 'partida'}`, 'success');
}

// Quitar color propio de un nodo
export function clearNodeColor(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!guardTabUnlocked('cat')) return;
  const node = findNodeById(state.treeData, id);
  if (!node) return;
  saveState();
  delete node.color;
  persistLocalData(false, {
    changeType: 'color_updated',
    highlightId: id,
    changeDescription: `color de ${node.clave || 'partida'}`,
    patch: { type: 'update_color', id, uuid: node.uuid || null, clave: node.clave || null, color: null }
  });
  renderTAB1();
  showToast(`Color restablecido en ${node.clave || 'partida'}`, 'info');
}

const AUTO_ROW_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#ef4444',
  '#84cc16',
  '#0ea5e9'
];

// Asignar colores jerárquicos automáticamente a las filas de primer nivel (o sub-partidas si hay una sola raíz)
export function autoColorRows(event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!guardTabUnlocked('cat')) return;
  if (!Array.isArray(state.treeData) || state.treeData.length === 0) {
    showToast('No hay partidas para colorear', 'warning');
    return;
  }

  let targets = state.treeData;
  if (state.treeData.length === 1 && Array.isArray(state.treeData[0].children)) {
    const subPartidas = state.treeData[0].children.filter(
      (child) => Array.isArray(child.children) && child.children.length > 0
    );
    if (subPartidas.length > 1) {
      targets = [state.treeData[0], ...subPartidas];
    }
  }

  saveState();

  const hasUncolored = targets.some((node) => !node.color);
  let coloredCount = 0;

  if (hasUncolored) {
    const usedColors = new Set(
      targets.filter((node) => node.color).map((node) => node.color.toLowerCase())
    );
    let paletteIdx = 0;

    targets.forEach((node) => {
      if (node.color) return;
      let chosen = null;
      for (let attempt = 0; attempt < AUTO_ROW_PALETTE.length; attempt++) {
        const candidate = AUTO_ROW_PALETTE[(paletteIdx + attempt) % AUTO_ROW_PALETTE.length];
        if (!usedColors.has(candidate.toLowerCase())) {
          chosen = candidate;
          paletteIdx = (paletteIdx + attempt + 1) % AUTO_ROW_PALETTE.length;
          break;
        }
      }
      if (!chosen) {
        chosen = AUTO_ROW_PALETTE[paletteIdx % AUTO_ROW_PALETTE.length];
        paletteIdx = (paletteIdx + 1) % AUTO_ROW_PALETTE.length;
      }
      node.color = chosen;
      usedColors.add(chosen.toLowerCase());
      coloredCount++;
    });
  } else {
    const firstColor = (targets[0].color || '').toLowerCase();
    const currentIdx = AUTO_ROW_PALETTE.findIndex((c) => c.toLowerCase() === firstColor);
    const startIdx = currentIdx >= 0 ? (currentIdx + 1) % AUTO_ROW_PALETTE.length : 0;

    targets.forEach((node, idx) => {
      node.color = AUTO_ROW_PALETTE[(startIdx + idx) % AUTO_ROW_PALETTE.length];
      coloredCount++;
    });
  }

  persistLocalData();
  renderTAB1();
  showToast(
    hasUncolored
      ? `Colores asignados automáticamente a ${coloredCount} ${coloredCount === 1 ? 'fila' : 'filas'}`
      : `Esquema de color actualizado en ${coloredCount} ${coloredCount === 1 ? 'fila' : 'filas'}`,
    'success'
  );
}

// Checkbox individual de fila (con propagación a hijos)
export function toggleSelectNode(id, isChecked, e) {
  if (e) e.stopPropagation();
  const node = findNodeById(state.treeData, id);
  if (!node) return;

  function setSelectRecursive(targetNode, val) {
    targetNode.selected = val;
    if (targetNode.children) {
      targetNode.children.forEach(child => setSelectRecursive(child, val));
    }
  }

  setSelectRecursive(node, isChecked);
  persistLocalData();
  renderTAB1();

  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
}

// Seleccionar o deseleccionar todas las filas
export function toggleSelectAll(isChecked) {
  const val = Boolean(isChecked);
  function setSelectAllRecursive(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(n => {
      n.selected = val;
      if (n.children && n.children.length > 0) {
        setSelectAllRecursive(n.children);
      }
    });
  }
  setSelectAllRecursive(state.treeData);

  // Asegurar que visualmente todas las casillas DOM del cuerpo se sincronicen de inmediato
  const domChecks = document.querySelectorAll('#tb1-body input[type="checkbox"]');
  domChecks.forEach(cb => { cb.checked = val; });

  persistLocalData();
  renderTAB1();

  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
}

// Obtener todos los conceptos hoja que tienen la casilla (checkbox) seleccionada
export function getSelectedLeafConcepts() {
  const selected = [];
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      const isLeaf = !n.children || n.children.length === 0;
      if (n.selected && isLeaf) {
        selected.push(n);
      }
      if (n.children && n.children.length > 0) {
        walk(n.children);
      }
    }
  }
  walk(state.treeData);
  return selected;
}

if (typeof window !== 'undefined') {
  window.recalculateClaves = recalculateClaves;
}
