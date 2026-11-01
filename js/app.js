import { initStore, state } from './state/store.js';
import { undoAction, redoAction, updateUndoRedoButtons, setHistoryRenderCallback } from './state/history.js';
import { showToast } from './ui/notifications.js';
import { formatMoney, formatQty } from './core/formatters.js';
import { getFactorSobrecosto, updateSobrecostoBadge, updateGrandTotal } from './core/calculations.js';

import {
  findNodeById,
  recalculateClaves,
  addRootRow,
  addChildRow,
  duplicarNode,
  duplicarSelectedRow,
  copiarNode,
  copiarSelectedRow,
  pegarNode,
  pegarSelectedRow,
  moverNode,
  moverSelectedRow,
  deleteNode,
  deleteSelectedRow,
  updateNode,
  toggleExpand,
  updateNodeColor,
  clearNodeColor,
  toggleSelectNode,
  toggleSelectAll
} from './modules/catalog/treeService.js';

import { renderTAB1, selectRow, closeApuPanel, toggleDropdownMenu, closeAllDropdownMenus } from './modules/catalog/catalogView.js';

import {
  addInsumo,
  updateInsumo,
  removeInsumo,
  filterMatriz,
  filterInsumos
} from './modules/apu/apuService.js';

import {
  renderAPUInsumos,
  renderInsumosUnitarios,
  dismissGroundingBox,
  toggleApuSection
} from './modules/apu/apuView.js';

import {
  openMatrizModal,
  closeMatrizModal,
  switchMatrizModalTab,
  filterModalMatriz,
  updateModalInsumo,
  addModalInsumo,
  removeModalInsumo
} from './modules/apu/matrizModal.js';

import {
  renderInsumosGenerales,
  filterInsumosGeneralesTable,
  toggleSelectAllInsumos,
  updateCostoUnitarioGeneral,
  combinarInsumosSeleccionados,
  openCombinarModal,
  closeCombinarModal,
  selectCombinarTarget,
  ejecutarCombinacionInsumos,
  filterInsumosCategoryView,
  toggleInsumoCard
} from './modules/insumosGenerales/insumosView.js';

import { testGeminiConnection, executeAiGeneration } from './modules/ai/geminiClient.js';
import { executeLocalGeneration } from './modules/ai/localEstimator.js';
import { exportData, importData } from './modules/io/csvHandler.js';
import { initPanelResizer } from './ui/resizer.js';

import {
  openImportModal,
  closeImportModal,
  handleUniversalFileSelect,
  onSheetSelectChange,
  executeImport,
  toggleImportDestination
} from './modules/io/universalImporter.js';

import {
  printTab1Catalog,
  printApuMatrix,
  printInsumosGenerales
} from './modules/io/printService.js';

import {
  openMasterCatalogModal,
  closeMasterCatalogModal,
  onMasterCatalogSearchInput,
  triggerMasterCatalogSearch,
  insertConceptIntoBudget,
  switchMasterCatalogTab,
  handleDeleteCatalog,
  refreshMasterCatalogList
} from './modules/reference/masterCatalogModal.js';

import {
  openApuReferenceModal,
  closeApuReferenceModal,
  setApuAssistantFilter,
  onApuAssistantSearchInput,
  triggerApuAssistantSearch,
  addInsumoToApuMatrix
} from './modules/reference/apuAssistantModal.js';

import { installPresetCatalog, installAllPresets } from './modules/reference/presetCatalogs.js';

import { openReferenceDb } from './modules/reference/referenceDb.js';

import {
  openAiGeneratorModal,
  closeAiGeneratorModal,
  toggleAiModalKeyVisibility,
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  updateCalculatedFactorPreview,
  saveSettings,
  onCurrencySelectChange,
  updateCurrencyPreview,
  toggleApiKeyVisibility,
  resetToDemoData,
  clearAllData,
  switchTab
} from './ui/modalController.js';

import {
  initBranding,
  updateCompanyName,
  syncCompanyName,
  updateProjectName,
  syncProjectName,
  updateProjectLocation,
  syncProjectLocation,
  updateCompanySubtitle,
  triggerCompanyLogoUpload,
  handleCompanyLogoUpload,
  removeCompanyLogo,
  openCurrentLogoAdjuster,
  closeLogoAdjusterModal,
  setLogoZoom,
  adjustLogoZoom,
  resetLogoPosition,
  setLogoBgMode,
  applyAdjustedLogo
} from './ui/brandingController.js';

import {
  initPortal,
  renderPortalAuth,
  updatePortalHeaderUserArea,
  switchAuthTab,
  setRegSexo,
  handleCustomPhotoUpload,
  handleRegisterSubmit,
  handleLoginSubmit,
  quickLoginWithSavedUser,
  triggerGoogleSignIn,
  closeGoogleAuthModal,
  selectGoogleAccount,
  submitCustomGoogleAccount,
  renderPortalDashboard,
  filterProjectCards,
  openProjectInWorkspace,
  openProjectInNewTab,
  goToProjectsDashboard,
  duplicateProjectAction,
  deleteProjectAction,
  openNuevoProyectoModal,
  closeNuevoProyectoModal,
  goToWizardStep,
  handleWizardLogoFile,
  setSampleLogo,
  clearWizardLogo,
  onWizardCurrencyChange,
  updateWizardFactorPreview,
  updateTemplateSelection,
  finalizeCreateProject,
  openProfileModal,
  closeProfileModal,
  onProfileEditSexoChange,
  selectProfileAvatar,
  handleProfilePhotoUpload,
  saveProfileChanges,
  logoutUser,
  toggleUserDropdown,
  closeUserDropdown,
  renderMemberAvatarsHTML,
  openInviteModal,
  closeInviteModal,
  setInviteSexo,
  handleInvitePhotoUpload,
  selectInvitePreset,
  submitInviteMember,
  changeMemberRole,
  removeMemberFromProject
} from './modules/portal/portalController.js';

// Exponer funciones públicas al objeto global window para compatibilidad total con eventos inline del HTML
Object.assign(window, {
  // Store & History
  undoAction,
  redoAction,
  
  // Tabs & Views
  switchTab,
  
  // Catalog Actions
  addRootRow,
  addChildRow,
  duplicarNode,
  duplicarSelectedRow,
  copiarNode,
  copiarSelectedRow,
  pegarNode,
  pegarSelectedRow,
  moverNode,
  moverSelectedRow,
  deleteNode,
  deleteSelectedRow,
  updateNode,
  toggleExpand,
  updateNodeColor,
  clearNodeColor,
  toggleSelectNode,
  toggleSelectAll,
  selectRow,
  closeApuPanel,
  renderTAB1,
  toggleDropdownMenu,
  closeAllDropdownMenus,

  // APU Actions
  addInsumo,
  updateInsumo,
  removeInsumo,
  filterMatriz,
  filterInsumos,
  dismissGroundingBox,
  toggleApuSection,
  openMatrizModal,
  closeMatrizModal,
  switchMatrizModalTab,
  filterModalMatriz,
  updateModalInsumo,
  addModalInsumo,
  removeModalInsumo,

  // Insumos Generales
  renderInsumosGenerales,
  filterInsumosGeneralesTable,
  toggleSelectAllInsumos,
  updateCostoUnitarioGeneral,
  combinarInsumosSeleccionados,
  openCombinarModal,
  closeCombinarModal,
  selectCombinarTarget,
  ejecutarCombinacionInsumos,
  filterInsumosCategoryView,
  toggleInsumoCard,

  // AI & Estimator
  openAiGeneratorModal,
  closeAiGeneratorModal,
  toggleAiModalKeyVisibility,
  testGeminiConnection,
  executeAiGeneration,
  executeLocalGeneration,

  // Settings & Modals
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  updateCalculatedFactorPreview,
  saveSettings,
  onCurrencySelectChange,
  updateCurrencyPreview,
  toggleApiKeyVisibility,
  resetToDemoData,
  clearAllData,

  // Import / Export
  exportData,
  importData,
  openImportModal,
  closeImportModal,
  handleUniversalFileSelect,
  onSheetSelectChange,
  executeImport,
  toggleImportDestination,

  // Master Catalog (Opción 1)
  openMasterCatalogModal,
  closeMasterCatalogModal,
  onMasterCatalogSearchInput,
  triggerMasterCatalogSearch,
  insertConceptIntoBudget,
  switchMasterCatalogTab,
  handleDeleteCatalog,
  refreshMasterCatalogList,
  installPresetCatalog,
  installAllPresets,

  // APU Assistant (Opción 2)
  openApuReferenceModal,
  closeApuReferenceModal,
  setApuAssistantFilter,
  onApuAssistantSearchInput,
  triggerApuAssistantSearch,
  addInsumoToApuMatrix,

  // Utilities
  showToast,

  // Branding (Empresa, Proyecto, Ubicación y Logo interactivo)
  initBranding,
  updateCompanyName,
  syncCompanyName,
  updateProjectName,
  syncProjectName,
  updateProjectLocation,
  syncProjectLocation,
  updateCompanySubtitle,
  triggerCompanyLogoUpload,
  handleCompanyLogoUpload,
  removeCompanyLogo,
  openCurrentLogoAdjuster,
  closeLogoAdjusterModal,
  setLogoZoom,
  adjustLogoZoom,
  resetLogoPosition,
  setLogoBgMode,
  applyAdjustedLogo,

  // Print Services
  printTab1Catalog,
  printApuMatrix,
  printInsumosGenerales,

  // Portal, Perfil y Multi-Proyecto
  initPortal,
  renderPortalAuth,
  updatePortalHeaderUserArea,
  switchAuthTab,
  setRegSexo,
  handleCustomPhotoUpload,
  handleRegisterSubmit,
  handleLoginSubmit,
  quickLoginWithSavedUser,
  triggerGoogleSignIn,
  closeGoogleAuthModal,
  selectGoogleAccount,
  submitCustomGoogleAccount,
  renderPortalDashboard,
  filterProjectCards,
  openProjectInWorkspace,
  openProjectInNewTab,
  goToProjectsDashboard,
  duplicateProjectAction,
  deleteProjectAction,
  openNuevoProyectoModal,
  closeNuevoProyectoModal,
  goToWizardStep,
  handleWizardLogoFile,
  setSampleLogo,
  clearWizardLogo,
  onWizardCurrencyChange,
  updateWizardFactorPreview,
  updateTemplateSelection,
  finalizeCreateProject,
  openProfileModal,
  closeProfileModal,
  onProfileEditSexoChange,
  selectProfileAvatar,
  handleProfilePhotoUpload,
  saveProfileChanges,
  logoutUser,
  toggleUserDropdown,
  closeUserDropdown,
  renderMemberAvatarsHTML,
  openInviteModal,
  closeInviteModal,
  setInviteSexo,
  handleInvitePhotoUpload,
  selectInvitePreset,
  submitInviteMember,
  changeMemberRole,
  removeMemberFromProject
});

// Atajos de teclado: Alt + Flecha Arriba / Abajo para mover la fila seleccionada
document.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    if (state.activeSelectedId) {
      e.preventDefault();
      moverSelectedRow(e.key === 'ArrowUp' ? 'up' : 'down');
    }
  }
});

// Conectar callback de renderizado en historial de deshecho/rehecho
setHistoryRenderCallback(() => {
  renderTAB1();
  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
});

// Inicialización de la aplicación al cargar el módulo
const isWorkspaceActive = initPortal();
if (isWorkspaceActive) {
  initStore();
  initBranding();
  initPanelResizer();
  renderTAB1();
  updateUndoRedoButtons();
  openReferenceDb().catch(err => console.warn('IndexedDB reference DB:', err));
}
