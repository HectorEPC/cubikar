// js/modules/catalog/signaturesModal.js
// Modal para configurar los responsables y firmantes del Catálogo y Presupuesto de Obra (TAB1-CAT-BASE)
// Los nombres y cargos configurados se imprimen en la parte inferior del formato oficial.

import { state, persistSettings } from '../../state/store.js';
import { showToast } from '../../ui/notifications.js';

export const DEFAULT_BUDGET_SIGNATURES = [
  { rol: 'ELABORÓ', nombre: '', cargo: 'Departamento de Precios Unitarios y Presupuestos' },
  { rol: 'REVISÓ', nombre: '', cargo: 'Coordinación de Costos e Ingeniería' },
  { rol: 'AUTORIZÓ / CLIENTE', nombre: '', cargo: 'Dirección de Obra y Supervisión' }
];

let draftSignatures = [];

// Obtener las firmas del presupuesto activas o los valores predeterminados
export function getBudgetSignatures() {
  const custom = state.settings?.budgetSignatures;
  if (Array.isArray(custom) && custom.length > 0) {
    return custom.map((s) => ({
      rol: s.rol || 'FIRMA',
      nombre: s.nombre || '',
      cargo: s.cargo || ''
    }));
  }
  return DEFAULT_BUDGET_SIGNATURES.map((s) => ({ ...s }));
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Abrir el modal de configuración de firmas
export function openPresupuestoSignaturesModal() {
  const modal = document.getElementById('modal-presupuesto-firmas');
  if (!modal) return;

  // Cargar una copia de trabajo de las firmas actuales
  draftSignatures = getBudgetSignatures().map((s) => ({ ...s }));

  renderPresupuestoSignaturesForm();

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

// Cerrar el modal
export function closePresupuestoSignaturesModal() {
  const modal = document.getElementById('modal-presupuesto-firmas');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  draftSignatures = [];
}

// Renderizar el formulario con las tarjetas de cada firmante
export function renderPresupuestoSignaturesForm() {
  const container = document.getElementById('modal-presupuesto-firmas-list');
  if (!container) return;

  if (draftSignatures.length === 0) {
    draftSignatures = DEFAULT_BUDGET_SIGNATURES.map((s) => ({ ...s }));
  }

  const canRemove = draftSignatures.length > 1;
  const canAdd = draftSignatures.length < 5;

  const addBtn = document.getElementById('btn-add-presupuesto-signature');
  if (addBtn) {
    addBtn.disabled = !canAdd;
    if (!canAdd) {
      addBtn.classList.add('opacity-40', 'cursor-not-allowed');
    } else {
      addBtn.classList.remove('opacity-40', 'cursor-not-allowed');
    }
  }

  container.innerHTML = draftSignatures
    .map((sig, idx) => {
      return `
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-2.5 relative transition hover:border-blue-300">
          <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-mono font-bold">${idx + 1}</span>
              Responsable #${idx + 1}
            </span>
            ${canRemove ? `
              <button type="button" 
                      onclick="removePresupuestoSignature(${idx})" 
                      class="text-slate-400 hover:text-rose-600 text-xs p-1 rounded hover:bg-rose-50 transition cursor-pointer" 
                      title="Eliminar este firmante">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            ` : ''}
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Rol / Título de la Firma:
              </label>
              <input type="text" 
                     value="${escapeHtml(sig.rol)}" 
                     placeholder="Ej: ELABORÓ, REVISÓ, AUTORIZÓ"
                     oninput="updateDraftSignature(${idx}, 'rol', this.value)"
                     class="w-full text-xs font-bold uppercase text-slate-800 bg-slate-50 hover:bg-white border border-slate-300 focus:border-blue-500 focus:bg-white rounded-lg px-2.5 py-1.5 outline-none transition">
            </div>

            <div>
              <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Nombre del Responsable que firmará:
              </label>
              <input type="text" 
                     value="${escapeHtml(sig.nombre)}" 
                     placeholder="Ej: Ing. Juan Pérez Gómez"
                     oninput="updateDraftSignature(${idx}, 'nombre', this.value)"
                     class="w-full text-xs font-semibold text-slate-900 bg-slate-50 hover:bg-white border border-slate-300 focus:border-blue-500 focus:bg-white rounded-lg px-2.5 py-1.5 outline-none transition">
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Cargo / Puesto / Dependencia:
            </label>
            <input type="text" 
                   value="${escapeHtml(sig.cargo)}" 
                   placeholder="Ej: Departamento de Precios Unitarios y Presupuestos"
                   oninput="updateDraftSignature(${idx}, 'cargo', this.value)"
                   class="w-full text-xs text-slate-700 bg-slate-50 hover:bg-white border border-slate-300 focus:border-blue-500 focus:bg-white rounded-lg px-2.5 py-1.5 outline-none transition">
          </div>
        </div>
      `;
    })
    .join('');
}

// Agregar un nuevo firmante (hasta 5)
export function addPresupuestoSignature() {
  if (draftSignatures.length >= 5) {
    showToast('Se permite un máximo de 5 firmantes', 'info');
    return;
  }
  const defaultRoles = ['SUPERVISIÓN', 'RESIDENTE DE OBRA', 'CONTRATISTA', 'CLIENTE'];
  const nextRole = defaultRoles[draftSignatures.length % defaultRoles.length] || 'FIRMA';

  draftSignatures.push({
    rol: nextRole,
    nombre: '',
    cargo: ''
  });

  renderPresupuestoSignaturesForm();
}

// Eliminar un firmante
export function removePresupuestoSignature(index) {
  if (draftSignatures.length <= 1) {
    showToast('Debe existir al menos un firmante', 'warning');
    return;
  }
  draftSignatures.splice(index, 1);
  renderPresupuestoSignaturesForm();
}

// Actualizar campo de un firmante en el borrador
export function updateDraftSignature(index, field, value) {
  if (draftSignatures[index]) {
    draftSignatures[index][field] = value;
  }
}

// Restablecer los 3 firmantes estándar
export function resetDefaultPresupuestoSignatures() {
  draftSignatures = DEFAULT_BUDGET_SIGNATURES.map((s) => ({ ...s }));
  renderPresupuestoSignaturesForm();
  showToast('Se restablecieron los 3 firmantes predeterminados', 'info');
}

// Guardar las firmas configuradas en el proyecto
export function savePresupuestoSignatures() {
  if (!state.settings) state.settings = {};

  // Limpiar y validar
  const cleaned = draftSignatures.map((s) => ({
    rol: (s.rol || 'FIRMA').trim().toUpperCase(),
    nombre: (s.nombre || '').trim(),
    cargo: (s.cargo || '').trim()
  }));

  state.settings.budgetSignatures = cleaned;
  persistSettings();

  closePresupuestoSignaturesModal();
  showToast('Firmas del presupuesto guardadas correctamente', 'success');
}
