/**
 * spellCheckModal.js
 * Modal de Revisión Ortográfica y Gramatical estilo Microsoft Word (F7) para Cubikar.
 * 
 * Permite recorrer todos los errores ortográficos del catálogo base e insumos,
 * mostrando el texto en contexto, subrayado ondulado rojo, sugerencias inteligentes,
 * y los botones clásicos: [Cambiar], [Cambiar todas], [Omitir], [Omitir todas],
 * [Agregar al diccionario] y [Mejorar con IA].
 */

import { state, persistLocalData } from '../state/store.js';
import { wordAutocorrectService } from '../core/wordAutocorrectService.js';
import { renderTAB1 } from '../modules/catalog/catalogView.js';
import { renderAPUInsumos } from '../modules/apu/apuView.js';
import { showToast } from './notifications.js';

let activeErrors = [];
let currentErrorIndex = 0;
let totalInitialErrors = 0;
let selectedSuggestion = '';

/**
 * Escanea recursivamente el árbol de catálogo (conceptos, partidas e insumos)
 */
function scanCatalogForErrors() {
  const errors = [];

  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      // 1. Revisar descripción del nodo
      if (node.descripcion && typeof node.descripcion === 'string') {
        const found = wordAutocorrectService.findSpellingErrorsInText(node.descripcion);
        for (const item of found) {
          errors.push({
            nodeId: node.id,
            clave: node.clave || 'S/C',
            locationType: node.children && node.children.length > 0 ? 'Partida' : 'Concepto',
            targetType: 'node',
            field: 'descripcion',
            insumoIndex: null,
            fullText: node.descripcion,
            word: item.word,
            start: item.start,
            end: item.end,
            suggestions: item.suggestions,
            context: item.context
          });
        }
      }

      // 2. Revisar insumos de la matriz APU si existen
      if (Array.isArray(node.insumos)) {
        node.insumos.forEach((ins, idx) => {
          if (ins.descripcion && typeof ins.descripcion === 'string') {
            const foundInsumo = wordAutocorrectService.findSpellingErrorsInText(ins.descripcion);
            for (const item of foundInsumo) {
              errors.push({
                nodeId: node.id,
                clave: `${node.clave || 'S/C'} » ${ins.clave || 'INS'}`,
                locationType: `Insumo (${ins.tipo || 'Material'})`,
                targetType: 'insumo',
                field: 'descripcion',
                insumoIndex: idx,
                fullText: ins.descripcion,
                word: item.word,
                start: item.start,
                end: item.end,
                suggestions: item.suggestions,
                context: item.context
              });
            }
          }
        });
      }

      // 3. Recorrer hijos
      if (Array.isArray(node.children)) {
        walk(node.children);
      }
    }
  }

  walk(state.treeData);
  return errors;
}

/**
 * Abre el modal e inicia la revisión
 */
export function openSpellCheckModal() {
  const modal = document.getElementById('modal-word-spellcheck');
  if (!modal) return;

  activeErrors = scanCatalogForErrors();
  currentErrorIndex = 0;
  totalInitialErrors = activeErrors.length;
  selectedSuggestion = '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  renderSpellCheckUI();
}

/**
 * Cierra el modal
 */
export function closeSpellCheckModal() {
  const modal = document.getElementById('modal-word-spellcheck');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

/**
 * Renderiza el estado actual del revisor de Word
 */
function renderSpellCheckUI() {
  const emptyState = document.getElementById('spellcheck-empty-state');
  const reviewState = document.getElementById('spellcheck-review-state');
  const counterBadge = document.getElementById('spellcheck-counter-badge');
  const progressBar = document.getElementById('spellcheck-progress-bar');

  if (activeErrors.length === 0 || currentErrorIndex >= activeErrors.length) {
    if (reviewState) reviewState.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    if (counterBadge) counterBadge.innerText = '0 errores pendientes';
    if (progressBar) progressBar.style.width = '100%';
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');
  if (reviewState) reviewState.classList.remove('hidden');

  const current = activeErrors[currentErrorIndex];
  const progressPercent = totalInitialErrors > 0 
    ? Math.round(((totalInitialErrors - activeErrors.length) / totalInitialErrors) * 100) 
    : 0;

  if (progressBar) progressBar.style.width = `${progressPercent}%`;
  if (counterBadge) {
    counterBadge.innerText = `Error ${currentErrorIndex + 1} de ${activeErrors.length} (${progressPercent}% completado)`;
  }

  // Ubicación del concepto/insumo
  const locationBadge = document.getElementById('spellcheck-location-badge');
  if (locationBadge) {
    locationBadge.innerHTML = `<i class="fa-solid fa-tag text-blue-600 mr-1"></i> <strong class="text-slate-800">${current.locationType}:</strong> ${current.clave}`;
  }

  // Frase en contexto con subrayado ondulado rojo estilo Word
  const contextBox = document.getElementById('spellcheck-context-box');
  if (contextBox) {
    const { before, target, after } = current.context;
    contextBox.innerHTML = `
      <span class="text-slate-600">${escapeHtml(before)}</span>
      <span class="word-spell-target bg-rose-50 text-rose-700 font-bold px-1.5 py-0.5 rounded border border-rose-300 underline decoration-wavy decoration-rose-500 text-sm shadow-2xs">${escapeHtml(target)}</span>
      <span class="text-slate-600">${escapeHtml(after)}</span>
    `;
  }

  // Palabra no encontrada en el diccionario
  const notInDictLabel = document.getElementById('spellcheck-not-in-dict');
  if (notInDictLabel) {
    notInDictLabel.innerText = current.word;
  }

  // Sugerencias
  const suggestionsContainer = document.getElementById('spellcheck-suggestions-list');
  const manualInput = document.getElementById('spellcheck-manual-input');

  if (suggestionsContainer) {
    suggestionsContainer.innerHTML = '';
    const suggestions = current.suggestions && current.suggestions.length > 0
      ? current.suggestions
      : ['(Sin sugerencias inmediatas)'];

    selectedSuggestion = current.suggestions && current.suggestions.length > 0 ? current.suggestions[0] : current.word;
    if (manualInput) manualInput.value = selectedSuggestion;

    suggestions.forEach((sug, idx) => {
      const isSelected = idx === 0 && sug !== '(Sin sugerencias inmediatas)';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
        isSelected 
          ? 'bg-blue-600 text-white shadow-xs' 
          : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200'
      }`;
      btn.innerHTML = `
        <span class="flex items-center gap-2">
          <i class="fa-solid fa-spell-check text-xs ${isSelected ? 'text-blue-200' : 'text-blue-600'}"></i>
          <span>${escapeHtml(sug)}</span>
        </span>
        ${idx === 0 ? '<span class="text-[10px] font-bold uppercase opacity-80 bg-blue-700/40 px-1.5 py-0.5 rounded">Recomendada</span>' : ''}
      `;

      btn.onclick = () => {
        // Seleccionar esta sugerencia
        suggestionsContainer.querySelectorAll('button').forEach(b => {
          b.className = 'w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer bg-white hover:bg-slate-100 text-slate-800 border border-slate-200';
          const icon = b.querySelector('.fa-spell-check');
          if (icon) icon.className = 'fa-solid fa-spell-check text-xs text-blue-600';
        });
        btn.className = 'w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition cursor-pointer bg-blue-600 text-white shadow-xs';
        const icon = btn.querySelector('.fa-spell-check');
        if (icon) icon.className = 'fa-solid fa-spell-check text-xs text-blue-200';

        selectedSuggestion = sug;
        if (manualInput) manualInput.value = sug;
      };

      suggestionsContainer.appendChild(btn);
    });
  }
}

/**
 * Aplica el reemplazo en el nodo o insumo correspondiente
 */
function applyReplacementToTarget(item, replacement) {
  function findAndReplaceInTree(nodes) {
    if (!Array.isArray(nodes)) return false;
    for (const node of nodes) {
      if (node.id === item.nodeId) {
        if (item.targetType === 'node') {
          // Reemplazo en descripción del concepto
          const text = node[item.field] || '';
          node[item.field] = replaceWordAt(text, item.word, replacement, item.start);
          return true;
        } else if (item.targetType === 'insumo' && Array.isArray(node.insumos)) {
          const ins = node.insumos[item.insumoIndex];
          if (ins) {
            const text = ins[item.field] || '';
            ins[item.field] = replaceWordAt(text, item.word, replacement, item.start);
            return true;
          }
        }
      }
      if (Array.isArray(node.children)) {
        if (findAndReplaceInTree(node.children)) return true;
      }
    }
    return false;
  }

  findAndReplaceInTree(state.treeData);
}

/**
 * Reemplaza la palabra de manera segura
 */
function replaceWordAt(text, oldWord, newWord, expectedStart) {
  if (!text) return text;
  // Si coincide en la posición esperada
  if (text.substr(expectedStart, oldWord.length).toLowerCase() === oldWord.toLowerCase()) {
    return text.substring(0, expectedStart) + newWord + text.substring(expectedStart + oldWord.length);
  }
  // Reemplazo de primera ocurrencia como fallback
  const regex = new RegExp(`\\b${escapeRegExp(oldWord)}\\b`, 'i');
  return text.replace(regex, newWord);
}

/**
 * Acción: [Cambiar] una palabra (como en Word)
 */
export function changeSpellCheckCurrentWord() {
  if (activeErrors.length === 0 || currentErrorIndex >= activeErrors.length) return;

  const manualInput = document.getElementById('spellcheck-manual-input');
  const replacement = (manualInput ? manualInput.value.trim() : '') || selectedSuggestion;

  if (!replacement) {
    showToast('Ingresa o selecciona una palabra de reemplazo', 'warning');
    return;
  }

  const current = activeErrors[currentErrorIndex];
  applyReplacementToTarget(current, replacement);

  // Eliminar este error de la lista
  activeErrors.splice(currentErrorIndex, 1);

  persistLocalData();
  renderTAB1();
  if (state.activeSelectedId) {
    renderAPUInsumos();
  }

  showToast(`Cambiado "${current.word}" por "${replacement}"`, 'success');
  renderSpellCheckUI();
}

/**
 * Acción: [Cambiar todas] las ocurrencias de esta palabra en el catálogo
 */
export function changeAllSpellCheckWord() {
  if (activeErrors.length === 0 || currentErrorIndex >= activeErrors.length) return;

  const manualInput = document.getElementById('spellcheck-manual-input');
  const replacement = (manualInput ? manualInput.value.trim() : '') || selectedSuggestion;

  if (!replacement) {
    showToast('Ingresa o selecciona una palabra de reemplazo', 'warning');
    return;
  }

  const current = activeErrors[currentErrorIndex];
  const targetWord = current.word;
  let count = 0;

  // Reemplazar globalmente en todos los nodos
  function replaceAllInTree(nodes) {
    if (!Array.isArray(nodes)) return;
    const regex = new RegExp(`\\b${escapeRegExp(targetWord)}\\b`, 'gi');

    for (const node of nodes) {
      if (node.descripcion && regex.test(node.descripcion)) {
        node.descripcion = node.descripcion.replace(regex, (match) => {
          count++;
          return wordAutocorrectService.matchCasing(match, replacement);
        });
      }
      if (Array.isArray(node.insumos)) {
        node.insumos.forEach(ins => {
          if (ins.descripcion && regex.test(ins.descripcion)) {
            ins.descripcion = ins.descripcion.replace(regex, (match) => {
              count++;
              return wordAutocorrectService.matchCasing(match, replacement);
            });
          }
        });
      }
      if (Array.isArray(node.children)) {
        replaceAllInTree(node.children);
      }
    }
  }

  replaceAllInTree(state.treeData);

  // Eliminar todos los errores que correspondan a esa palabra
  const lower = targetWord.toLowerCase();
  activeErrors = activeErrors.filter(e => e.word.toLowerCase() !== lower);

  persistLocalData();
  renderTAB1();
  if (state.activeSelectedId) {
    renderAPUInsumos();
  }

  showToast(`Se reemplazaron ${count} ocurrencias de "${targetWord}" por "${replacement}"`, 'success');
  renderSpellCheckUI();
}

/**
 * Acción: [Omitir] este error una sola vez
 */
export function ignoreSpellCheckOnce() {
  if (activeErrors.length === 0) return;
  currentErrorIndex++;
  renderSpellCheckUI();
}

/**
 * Acción: [Omitir todas] las ocurrencias de esta palabra en la sesión
 */
export function ignoreAllSpellCheckWord() {
  if (activeErrors.length === 0 || currentErrorIndex >= activeErrors.length) return;

  const current = activeErrors[currentErrorIndex];
  wordAutocorrectService.ignoreWord(current.word);

  const lower = current.word.toLowerCase();
  activeErrors = activeErrors.filter(e => e.word.toLowerCase() !== lower);

  showToast(`Se omitirá "${current.word}" en esta sesión`, 'info');
  renderSpellCheckUI();
}

/**
 * Acción: [Agregar al Diccionario] (se guarda en localStorage)
 */
export function addCurrentToDictionary() {
  if (activeErrors.length === 0 || currentErrorIndex >= activeErrors.length) return;

  const current = activeErrors[currentErrorIndex];
  wordAutocorrectService.addToDictionary(current.word);

  const lower = current.word.toLowerCase();
  activeErrors = activeErrors.filter(e => e.word.toLowerCase() !== lower);

  renderSpellCheckUI();
}

/**
 * Re-escanear todo el catálogo
 */
export function rescanSpellCheck() {
  activeErrors = scanCatalogForErrors();
  currentErrorIndex = 0;
  totalInitialErrors = activeErrors.length;
  showToast('Reescaneo del catálogo completado', 'info');
  renderSpellCheckUI();
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Exponer funciones para HTML inline
window.openSpellCheckModal = openSpellCheckModal;
window.closeSpellCheckModal = closeSpellCheckModal;
window.changeSpellCheckCurrentWord = changeSpellCheckCurrentWord;
window.changeAllSpellCheckWord = changeAllSpellCheckWord;
window.ignoreSpellCheckOnce = ignoreSpellCheckOnce;
window.ignoreAllSpellCheckWord = ignoreAllSpellCheckWord;
window.addCurrentToDictionary = addCurrentToDictionary;
window.rescanSpellCheck = rescanSpellCheck;
