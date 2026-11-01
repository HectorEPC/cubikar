import { state, persistLocalData } from '../../state/store.js';
import { saveState } from '../../state/history.js';
import { showToast } from '../../ui/notifications.js';
import { renderTAB1, closeApuPanel } from './catalogView.js';
import { renderInsumosUnitarios } from '../apu/apuView.js';
import { renderInsumosGenerales } from '../insumosGenerales/insumosView.js';

// Buscar un nodo por su ID recursivamente
export function findNodeById(nodes, id) {
  for (let n of nodes) {
    if (n.id === id) return n;
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
export function recalculateClaves(nodes, parentClave = '') {
  nodes.forEach((node, idx) => {
    node.clave = parentClave ? `${parentClave}.${idx + 1}` : `${idx + 1}`;
    if (node.children && node.children.length > 0) {
      recalculateClaves(node.children, node.clave);
    }
  });
}

// Agregar partida raíz principal
export function addRootRow() {
  saveState();
  const newId = '_' + Math.random().toString(36).substr(2, 9);
  state.treeData.push({
    id: newId,
    clave: '',
    descripcion: 'NUEVA PARTIDA PRINCIPAL',
    unidad: 'lote',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    expanded: true,
    selected: false,
    children: []
  });
  recalculateClaves(state.treeData);
  persistLocalData();
  renderTAB1();
  showToast('Partida agregada', 'success');
}

// Agregar sub-concepto / sub-renglón
export function addChildRow(parentId, e) {
  if (e) e.stopPropagation();
  const parent = findNodeById(state.treeData, parentId);
  if (!parent) return;

  // RESTRICCIÓN: si la fila ya cuenta con una matriz, restringir que se cree una sub fila
  if (parent.insumos && parent.insumos.length > 0) {
    showToast('Restricción: Esta fila ya cuenta con una matriz de insumos. Elimina sus insumos primero si deseas convertirla en partida con sub-filas.', 'warning');
    return;
  }

  saveState();
  if (!parent.children) parent.children = [];
  parent.unidad = 'lote';
  const newId = '_' + Math.random().toString(36).substr(2, 9);
  parent.children.push({
    id: newId,
    clave: '',
    descripcion: 'Nuevo Sub-concepto',
    unidad: 'm2',
    cantidad: 1,
    precioUnitario: 0,
    costoDirecto: 0,
    expanded: true,
    selected: false,
    children: []
  });
  parent.expanded = true;

  // RESTRICCIÓN: Al tener ahora una sub-fila, no mostrar la tabla de matrices para este padre
  if (state.activeSelectedId === parentId) {
    const apuPanel = document.getElementById('apu-panel');
    const panelResizer = document.getElementById('panel-resizer');
    if (apuPanel) apuPanel.classList.add('hidden');
    if (panelResizer) panelResizer.classList.add('hidden');
  }

  recalculateClaves(state.treeData);
  persistLocalData();
  renderTAB1();
  showToast('Sub-renglón agregado', 'success');
}

// Duplicar un nodo
export function duplicarNode(id, e) {
  if (e) e.stopPropagation();
  saveState();
  const nodeToDuplicate = findNodeById(state.treeData, id);
  if (!nodeToDuplicate) return;

  function cloneNode(node) {
    return {
      id: '_' + Math.random().toString(36).substr(2, 9),
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
      insumos: JSON.parse(JSON.stringify(node.insumos || [])),
      children: (node.children || []).map(child => cloneNode(child))
    };
  }

  const cloned = cloneNode(nodeToDuplicate);
  const parentList = findParentArrayOfNode(state.treeData, id);
  if (parentList) {
    const index = parentList.findIndex(n => n.id === id);
    parentList.splice(index + 1, 0, cloned);
    recalculateClaves(state.treeData);
    persistLocalData();
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

// Copiar nodo al portapapeles en memoria
export function copiarNode(id, e) {
  if (e) e.stopPropagation();
  const node = findNodeById(state.treeData, id);
  if (node) {
    state.clipboardNode = JSON.parse(JSON.stringify(node));
    showToast(`Copiado: [${node.clave}]`, 'info');
  }
}

export function copiarSelectedRow() {
  if (!state.activeSelectedId) {
    showToast('Selecciona una fila primero', 'warning');
    return;
  }
  copiarNode(state.activeSelectedId);
}

// Pegar nodo copiado debajo del seleccionado
export function pegarNode(targetId, e) {
  if (e) e.stopPropagation();
  if (!state.clipboardNode) {
    showToast('No hay ningún concepto copiado en el portapapeles', 'warning');
    return;
  }
  saveState();

  const parentList = findParentArrayOfNode(state.treeData, targetId);
  if (parentList) {
    const index = parentList.findIndex(n => n.id === targetId);
    
    function renewIds(n) {
      n.id = '_' + Math.random().toString(36).substr(2, 9);
      if (n.children) n.children.forEach(c => renewIds(c));
    }

    const pastedNode = JSON.parse(JSON.stringify(state.clipboardNode));
    renewIds(pastedNode);
    pastedNode.descripcion += ' (Copiado)';

    parentList.splice(index + 1, 0, pastedNode);
    recalculateClaves(state.treeData);
    persistLocalData();
    renderTAB1();
    showToast('Renglón pegado', 'success');
  }
}

export function pegarSelectedRow() {
  if (!state.clipboardNode) {
    showToast('No hay ningún concepto copiado', 'warning');
    return;
  }
  const targetId = state.activeSelectedId || (state.treeData.length > 0 ? state.treeData[state.treeData.length - 1].id : null);
  if (!targetId) return;
  pegarNode(targetId);
}

// Mover nodo arriba o abajo
export function moverNode(id, direction, e) {
  if (e) e.stopPropagation();
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
  persistLocalData();
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

// Eliminar nodo individual
export function deleteNode(id, e) {
  if (e) e.stopPropagation();
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
  persistLocalData();
  renderTAB1();
  showToast('Fila eliminada', 'info');
}

// Eliminar filas marcadas o fila seleccionada
export function deleteSelectedRow() {
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
    persistLocalData();
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
  const node = findNodeById(state.treeData, id);
  if (node) {
    if (field === 'cantidad' || field === 'precioUnitario' || field === 'costoDirecto') {
      node[field] = Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
    } else {
      node[field] = value;
    }
    persistLocalData();
    renderTAB1();
    if (state.activeSelectedId === id) {
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

// Actualizar color propio de un nodo
export function updateNodeColor(id, newColor, event) {
  if (event) event.stopPropagation();
  const node = findNodeById(state.treeData, id);
  if (!node) return;
  saveState();
  node.color = newColor;
  persistLocalData();
  renderTAB1();
  showToast(`Color asignado a ${node.clave || 'partida'}`, 'success');
}

// Quitar color propio de un nodo
export function clearNodeColor(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const node = findNodeById(state.treeData, id);
  if (!node) return;
  saveState();
  delete node.color;
  persistLocalData();
  renderTAB1();
  showToast(`Color restablecido en ${node.clave || 'partida'}`, 'info');
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
  function setSelectAllRecursive(nodes, val) {
    nodes.forEach(n => {
      n.selected = val;
      if (n.children) setSelectAllRecursive(n.children, val);
    });
  }
  setSelectAllRecursive(state.treeData, isChecked);
  persistLocalData();
  renderTAB1();

  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
}
