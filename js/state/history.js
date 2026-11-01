import { state, persistLocalData } from './store.js';
import { showToast } from '../ui/notifications.js';

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

  // Actualizar botones de TAB1-CAT-BASE
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = !canUndo;
  if (redoBtn) redoBtn.disabled = !canRedo;

  // Actualizar botones de INSUMOS GENERALES
  const undoBtnIns = document.getElementById('btn-undo-insumos');
  const redoBtnIns = document.getElementById('btn-redo-insumos');
  if (undoBtnIns) undoBtnIns.disabled = !canUndo;
  if (redoBtnIns) redoBtnIns.disabled = !canRedo;
}

export function undoAction() {
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
  if (redoStack.length === 0) return;
  undoStack.push(JSON.stringify(state.treeData));
  const nextState = redoStack.pop();
  state.treeData = JSON.parse(nextState);
  persistLocalData(true);
  if (renderCallback) renderCallback();
  updateUndoRedoButtons();
  showToast('Rehecho', 'info');
}
