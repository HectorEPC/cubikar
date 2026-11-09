import { state, persistLocalData } from './store.js';
import { showToast } from '../ui/notifications.js';
import { isTabLocked, guardTabUnlocked } from '../ui/tabLockController.js';

export let undoStack = [];
export let redoStack = [];

let renderCallback = null;
export function setHistoryRenderCallback(cb) {
  renderCallback = cb;
}

export function saveState() {
  undoStack.push(JSON.stringify(state.treeData));
  if (undoStack.length > 20) undoStack.shift();
  redoStack = [];
  updateUndoRedoButtons();
  persistLocalData(false);
}

export function updateUndoRedoButtons() {
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const catLocked = isTabLocked('cat');
  const insLocked = isTabLocked('insumos');

  // Actualizar botones de TAB1-CAT-BASE
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = !canUndo || catLocked;
  if (redoBtn) redoBtn.disabled = !canRedo || catLocked;

  // Actualizar botones de INSUMOS GENERALES
  const undoBtnIns = document.getElementById('btn-undo-insumos');
  const redoBtnIns = document.getElementById('btn-redo-insumos');
  if (undoBtnIns) undoBtnIns.disabled = !canUndo || insLocked;
  if (redoBtnIns) redoBtnIns.disabled = !canRedo || insLocked;
}

export function undoAction() {
  const viewInsumos = typeof document !== 'undefined' ? document.getElementById('view-insumos') : null;
  const activeTabKey = (viewInsumos && !viewInsumos.classList.contains('hidden')) ? 'insumos' : 'cat';
  if (!guardTabUnlocked(activeTabKey)) return;
  if (undoStack.length === 0) return;
  redoStack.push(JSON.stringify(state.treeData));
  const prevState = undoStack.pop();
  state.treeData = JSON.parse(prevState);
  persistLocalData(true);
  if (renderCallback) renderCallback();
  updateUndoRedoButtons();
  showToast('Deshecho', 'info');
}

export function redoAction() {
  const viewInsumos = typeof document !== 'undefined' ? document.getElementById('view-insumos') : null;
  const activeTabKey = (viewInsumos && !viewInsumos.classList.contains('hidden')) ? 'insumos' : 'cat';
  if (!guardTabUnlocked(activeTabKey)) return;
  if (redoStack.length === 0) return;
  undoStack.push(JSON.stringify(state.treeData));
  const nextState = redoStack.pop();
  state.treeData = JSON.parse(nextState);
  persistLocalData(true);
  if (renderCallback) renderCallback();
  updateUndoRedoButtons();
  showToast('Rehecho', 'info');
}
