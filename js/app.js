import {
  renderCalendarioObra,
  setCalendarioViewMode,
  setCalendarioTimeScale,
  filterCalendarioPartida,
  changeProjectStartDate,
  onGanttDateInput,
  onGanttDurationInput,
  onFinancialCellEdit,
  triggerAutoDistributeSchedule,
  exportCurrentScheduleExcel,
  printCalendarioObra,
  toggleCalendarioNodeGroup,
  expandAllCalendarioGroups,
  collapseAllCalendarioGroups,
  toggleCalendarioJustifyText,
  changeGanttZoom,
  initGanttResizer,
  syncGanttScroll,
  initGanttBarDrag,
  initPremiereZoomBar,
  updatePremiereZoomBarUI,
  scrollGanttTimelineStep,
  fitGanttTimelineEntireProject,
  changeGanttTodayDateAction,
  resetGanttTodayDateAction,
  initGanttTodayLineDrag,
  openCalendarioJornadaModal,
  closeCalendarioJornadaModal,
  switchCalendarioJornadaTab,
  renderCalendarioJornadaModal,
  toggleNonWorkingDayOfWeek,
  setNonWorkingDaysPreset,
  addFestivoFromModal,
  removeFestivoFromModal,
  loadMexicanHolidaysToModal,
  addLluviaFromModal,
  removeLluviaFromModal,
  saveCalendarioJornadaModal,
  toggleCalendarioCriticalPath,
  toggleCalendarioLinkMode,
  handleCalendarioBarLinkClick,
  undoCalendarioScheduleAction,
  redoCalendarioScheduleAction,
  onGanttPredecessorSelect,
  clearAllCalendarioLinksAction,
  openConceptDependenciesModal,
  closeConceptDependenciesModal,
  clearConceptDependenciesFromModal,
  saveConceptDependenciesModal,
  openCalendarioAiModal,
  closeCalendarioAiModal,
  refreshCalendarioAiPreview,
  runCalendarioGeminiAiProposal,
  applyCalendarioAiProposal,
  selectCalendarioRow
} from './modules/calendario/calendarioView.js';
import { initStore, state, syncClipboardFromStorage } from './state/store.js';
import { STORAGE_KEY_CLIPBOARD, getActiveProjectId } from './config/constants.js';
import { undoAction, redoAction, updateUndoRedoButtons, setHistoryRenderCallback } from './state/history.js';
import { showToast } from './ui/notifications.js';
import { formatMoney, formatQty } from './core/formatters.js';
import { getFactorSobrecosto, updateSobrecostoBadge, updateGrandTotal } from './core/calculations.js';
import { subscribeToProjectRealtime, unsubscribeFromProjectRealtime, initGlobalRealtimeSync, requestPeerSync } from './core/realtimeSync.js';
import { initAuthListener } from './core/authService.js';
import './core/collaborationCloudService.js';

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
  limpiarPortapapeles,
  updateClipboardUI,
  getClipboardData,
  moverNode,
  moverSelectedRow,
  deleteNode,
  deleteSelectedRow,
  updateNode,
  toggleExpand,
  collapseAllCatalogNodes,
  expandAllCatalogNodes,
  agruparCatalogoConceptos,
  desagruparCatalogoConceptos,
  updateNodeColor,
  clearNodeColor,
  toggleSelectNode,
  toggleSelectAll
} from './modules/catalog/treeService.js';

import {
  openImportConceptsModal,
  closeImportConceptsModal,
  onSelectSourceProject,
  onSearchSourceConcepts,
  toggleConceptSelection,
  selectAllSourceConcepts,
  toggleMatrixPreviewAccordion,
  quickCopyPasteSingleConcept,
  importSelectedConceptsToCurrentProject
} from './modules/catalog/importFromProjectModal.js';

import { renderTAB1, selectRow, highlightCatalogRowInPlace, closeApuPanel, toggleDropdownMenu, closeAllDropdownMenus } from './modules/catalog/catalogView.js';

import {
  addInsumo,
  updateInsumo,
  removeInsumo,
  filterMatriz,
  filterInsumos,
  limpiarMatrizConceptoSeleccionado,
  limpiarMatricesCasillas
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
  toggleInsumoCard,
  agruparInsumosBase,
  desagruparInsumosBase,
  collapseAllInsumosCategories,
  expandAllInsumosCategories,
  actualizarCostoIndividualConIA,
  actualizarCostosConIASeleccionados,
  actualizarTodosLosInsumosSeleccionadosConIA,
  selectInsumoBaseRow
} from './modules/insumosGenerales/insumosView.js';

import {
  testGeminiConnection,
  executeAiGeneration,
  generarMatrizCasillasGoogleIA,
  generarMatrizConceptoActivoGoogleIA
} from './modules/ai/geminiClient.js';
import {
  executeLocalGeneration,
  openLocalCatalogSelectorModal,
  closeLocalCatalogSelectorModal,
  toggleSelectAllLocalCatalogs,
  updateLocalCatalogSelectedCount,
  confirmAndExecuteLocalGeneration,
  generarMatrizCasillasLocal,
  getSelectedLeafConcepts
} from './modules/ai/localEstimator.js';
import {
  exportData,
  importData,
  openExportModal,
  closeExportModal,
  exportCatalogExcel,
  exportCatalogOpusZip,
  exportCatalogNeodataZip,
  exportCatalogOpus,
  exportCatalogNeodata,
  exportCatalogCsv
} from './modules/io/csvHandler.js';
import { initPanelResizer } from './ui/resizer.js';

import {
  openImportModal,
  closeImportModal,
  handleUniversalFileSelect,
  onSheetSelectChange,
  executeImport,
  toggleImportDestination,
  resetImportModalUI,
  onZoneSelectChange,
  calculateParsedBudgetTotal,
  loadCasaLauraOpusDirectly
} from './modules/io/universalImporter.js';

import {
  printTab1Catalog,
  printApuMatrix,
  printInsumosGenerales,
  printCalendarioObraFormat,
  printEstimacionesFormat
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
  updateFasarPreview,
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
  STORAGE_KEY_THEME,
  initThemeMode,
  toggleThemeMode,
  applyThemeMode,
  isNightMode,
  setThemeRenderCallback
} from './ui/themeController.js';

import {
  isTabLocked,
  setTabLocked,
  toggleTabLock,
  guardTabUnlocked,
  applyTabLocksToDOM,
  setTabLockRenderCallback
} from './ui/tabLockController.js';

import {
  toggleProjectChatDock,
  toggleProjectChatMaximize,
  printProjectChatReport,
  openProjectChatForPartida,
  clearProjectChatPartidaFilter,
  setProjectChatFilter,
  onProjectChatAuthorChange,
  toggleProjectChatTagPicker,
  addProjectChatPendingTag,
  removeProjectChatPendingTag,
  sendProjectChatMessage,
  deleteProjectChatMessage,
  jumpToProjectChatTag,
  renderProjectChatDock,
  setProjectChatRefreshCallback,
  toggleMentionNotificationsPopover,
  closeMentionNotificationsPopover,
  onNotificationsUserFilterChange,
  markAllMentionsAsRead,
  openMentionNotification,
  renderSidebarNotificationsUI,
  handleAcceptInvitationAction,
  handleRejectInvitationAction
} from './modules/chat/projectChat.js';

import {
  initPortal,
  showPortalView,
  renderPortalAuth,
  updatePortalHeaderUserArea,
  updateWorkspaceHeaderUser,
  switchAuthTab,
  setRegSexo,
  handleCustomPhotoUpload,
  handleRegisterSubmit,
  handleLoginSubmit,
  quickLoginWithFeaturedUser,
  removeFeaturedUserAccount,
  quickLoginWithSavedUser,
  removeSavedUserQuickProfile,
  purgeAllUsersAndAccountsAction,
  togglePasswordVisibility,
  checkPasswordMatchLive,
  triggerGoogleSignIn,
  closeGoogleAuthModal,
  selectGoogleAccount,
  submitCustomGoogleAccount,
  renderPortalDashboard,
  filterProjectCards,
  onProjectSearchInput,
  setCompanyFilter,
  setTipoObraFilter,
  setProjectScopeFilter,
  setProjectDashboardMode,
  toggleSortDate,
  toggleSortAZ,
  resetProjectFilters,
  refreshProjectsGridUI,
  renderCompanyOptionsHTML,
  openProjectInWorkspace,
  openProjectInNewTab,
  goToProjectsDashboard,
  duplicateProjectAction,
  deleteProjectAction,
  syncProjectToCloudAction,
  openNuevoProyectoModal,
  openNewProjectModal,
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
  deleteUserAccount,
  deleteCurrentUserAccountAction,
  logoutUser,
  toggleUserDropdown,
  closeUserDropdown,
  togglePortalUserDropdown,
  closePortalUserDropdown,
  renderMemberAvatarsHTML,
  openInviteModal,
  closeInviteModal,
  switchInviteModalTab,
  setInviteTabCheckboxes,
  toggleMemberTabPermission,
  setMemberAllTabsPermission,
  setInviteSexo,
  handleInvitePhotoUpload,
  selectInvitePreset,
  submitInviteMember,
  changeMemberRole,
  removeMemberFromProject,
  getActiveOrFallbackProjectId,
  copyProjectInviteLink,
  renderHeaderCollaborators,
  openPlanInviteModal,
  closePlanInviteModal,
  switchPlanInviteModalTab,
  setPlanInviteSexo,
  updatePlanInviteAvatarPreview,
  handlePlanInvitePhotoUpload,
  selectPlanInvitePreset,
  submitPlanInviteMember,
  changePlanCollaboratorRole,
  onRemovePlanCollaboratorClick,
  copyPlanInviteLink,
  TAB_METADATA,
  canCurrentUserAccessTab,
  updateNavigationTabsAccess,
  renderTabAssignedAvatars,
  renderAllTabAssignedMembers,
  openTabMembersAssignModal,
  closeTabMembersAssignModal,
  renderTabMembersModalList,
  onTabMemberCheckChange,
  toggleSelectAllTabMembers,
  saveTabMembersAssignment,
  simulateUserView,
  toggleComparisonModal,
  switchPortalView,
  switchView,
  toggleCardMenu,
  filterProjects,
  toggleSort,
  setStatusFilter,
  resetFilters,
  exportProjectToExcelAction
} from './modules/portal/portalController.js';

import {
  openCubikarAdminModal,
  closeCubikarAdminModal,
  renderCubikarAdminTable,
  openCoAdminsModal,
  closeCoAdminsModal,
  openMarketRatesModal,
  closeMarketRatesModal,
  saveMarketRatesFromModal,
  exportCubikarDatabaseToExcel,
  setAdminTableSearch,
  setAdminFilterActivity,
  setAdminFilterPlan,
  setAdminFilterCycle,
  isUserAdmin,
  isUserMasterAdmin,
  showAdminDualLoginModal
} from './modules/admin/cubikarAdmin.js';
import {
  openSubscriptionModal,
  closeSubscriptionModal,
  setSubscriptionBillingCycle,
  selectSubscriptionPlan,
  renderSubscriptionCards,
  updateSubscriptionBadgesUI,
  getCurrentSubscription,
  syncSubscriptionFromCloud
} from './modules/portal/subscriptionModal.js';

import {
  renderEstimacionesView,
  onSwitchActiveEstimacion,
  promptCreateNewEstimacion,
  confirmDeleteCurrentEstimacion,
  onChangeEstimacionDate,
  onEstimacionCantEjeInput,
  onEstimacionCantEjeBlur,
  formatCantEjeTwoDecimals,
  toggleActiveEstimacionLock,
  onEstimacionesAnticipoInput,
  onEstimacionesIvaInput,
  onSearchEstimaciones,
  toggleEstimacionesGroup,
  collapseAllEstimacionesPartidas,
  expandAllEstimacionesPartidas,
  printEstimacionActual,
  adjustConceptoColumnWidth,
  resetConceptoColumnWidth,
  scrollEstimacionesTableStep,
  openEstimacionConceptPhotosModal,
  closeEstimacionConceptPhotosModal,
  onEstimacionPhotoUrlPreviewInput,
  clearEstimacionConceptPhotoSlot,
  saveEstimacionConceptPhotosModal,
  selectEstimacionRow
} from './modules/estimaciones/estimacionesView.js';

// Exponer funciones públicas al objeto global window para compatibilidad total con eventos inline del HTML
Object.assign(window, {
  // Store & History
  undoAction,
  redoAction,
  
  // Tabs & Views
  switchTab,
  toggleThemeMode,
  applyThemeMode,
  isNightMode,
  isTabLocked,
  setTabLocked,
  toggleTabLock,
  guardTabUnlocked,
  applyTabLocksToDOM,
  openSubscriptionModal,
  closeSubscriptionModal,
  setSubscriptionBillingCycle,
  selectSubscriptionPlan,
  getCurrentSubscription,
  updateSubscriptionBadgesUI,
  syncSubscriptionFromCloud,
  
  // Estimaciones de Obra
  renderEstimacionesView,
  onSwitchActiveEstimacion,
  promptCreateNewEstimacion,
  confirmDeleteCurrentEstimacion,
  onChangeEstimacionDate,
  onEstimacionCantEjeInput,
  onEstimacionCantEjeBlur,
  formatCantEjeTwoDecimals,
  toggleActiveEstimacionLock,
  onEstimacionesAnticipoInput,
  onEstimacionesIvaInput,
  onSearchEstimaciones,
  toggleEstimacionesGroup,
  collapseAllEstimacionesPartidas,
  expandAllEstimacionesPartidas,
  printEstimacionActual,
  adjustConceptoColumnWidth,
  resetConceptoColumnWidth,
  scrollEstimacionesTableStep,
  selectEstimacionRow,
  
  // Calendario de Obra (Gantt, Financiero, Curva S)
  renderCalendarioObra,
  setCalendarioViewMode,
  setCalendarioTimeScale,
  filterCalendarioPartida,
  changeProjectStartDate,
  onGanttDateInput,
  onGanttDurationInput,
  onFinancialCellEdit,
  triggerAutoDistributeSchedule,
  exportCurrentScheduleExcel,
  printCalendarioObra,
  toggleCalendarioNodeGroup,
  expandAllCalendarioGroups,
  collapseAllCalendarioGroups,
  toggleCalendarioJustifyText,
  changeGanttZoom,
  initGanttResizer,
  syncGanttScroll,
  initGanttBarDrag,
  initPremiereZoomBar,
  updatePremiereZoomBarUI,
  scrollGanttTimelineStep,
  fitGanttTimelineEntireProject,
  changeGanttTodayDateAction,
  resetGanttTodayDateAction,
  initGanttTodayLineDrag,
  openCalendarioJornadaModal,
  closeCalendarioJornadaModal,
  switchCalendarioJornadaTab,
  renderCalendarioJornadaModal,
  toggleNonWorkingDayOfWeek,
  setNonWorkingDaysPreset,
  addFestivoFromModal,
  removeFestivoFromModal,
  loadMexicanHolidaysToModal,
  addLluviaFromModal,
  removeLluviaFromModal,
  saveCalendarioJornadaModal,
  toggleCalendarioCriticalPath,
  toggleCalendarioLinkMode,
  handleCalendarioBarLinkClick,
  undoCalendarioScheduleAction,
  redoCalendarioScheduleAction,
  onGanttPredecessorSelect,
  clearAllCalendarioLinksAction,
  openConceptDependenciesModal,
  closeConceptDependenciesModal,
  clearConceptDependenciesFromModal,
  saveConceptDependenciesModal,
  openCalendarioAiModal,
  closeCalendarioAiModal,
  refreshCalendarioAiPreview,
  runCalendarioGeminiAiProposal,
  applyCalendarioAiProposal,
  selectCalendarioRow,
  
  // Catalog Actions
  addRootRow,
  addChildRow,
  duplicarNode,
  duplicarSelectedRow,
  copiarNode,
  copiarSelectedRow,
  pegarNode,
  pegarSelectedRow,
  limpiarPortapapeles,
  updateClipboardUI,
  getClipboardData,
  openImportConceptsModal,
  closeImportConceptsModal,
  onSelectSourceProject,
  onSearchSourceConcepts,
  toggleConceptSelection,
  selectAllSourceConcepts,
  toggleMatrixPreviewAccordion,
  quickCopyPasteSingleConcept,
  importSelectedConceptsToCurrentProject,
  moverNode,
  moverSelectedRow,
  deleteNode,
  deleteSelectedRow,
  updateNode,
  toggleExpand,
  collapseAllCatalogNodes,
  expandAllCatalogNodes,
  agruparCatalogoConceptos,
  desagruparCatalogoConceptos,
  updateNodeColor,
  clearNodeColor,
  toggleSelectNode,
  toggleSelectAll,
  selectRow,
  highlightCatalogRowInPlace,
  closeApuPanel,
  renderTAB1,
  toggleDropdownMenu,
  closeAllDropdownMenus,

  // APU Actions
  addInsumo,
  updateInsumo,
  removeInsumo,
  limpiarMatrizConceptoSeleccionado,
  limpiarMatricesCasillas,
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
  agruparInsumosBase,
  desagruparInsumosBase,
  collapseAllInsumosCategories,
  expandAllInsumosCategories,
  actualizarCostoIndividualConIA,
  actualizarCostosConIASeleccionados,
  actualizarTodosLosInsumosSeleccionadosConIA,
  selectInsumoBaseRow,

  // AI & Estimator
  openAiGeneratorModal,
  closeAiGeneratorModal,
  toggleAiModalKeyVisibility,
  testGeminiConnection,
  executeAiGeneration,
  executeLocalGeneration,
  openLocalCatalogSelectorModal,
  closeLocalCatalogSelectorModal,
  toggleSelectAllLocalCatalogs,
  updateLocalCatalogSelectedCount,
  confirmAndExecuteLocalGeneration,
  generarMatrizCasillasLocal,
  generarMatrizCasillasGoogleIA,
  generarMatrizConceptoActivoGoogleIA,
  getSelectedLeafConcepts,

  // Settings & Modals
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  updateCalculatedFactorPreview,
  updateFasarPreview,
  saveSettings,
  onCurrencySelectChange,
  updateCurrencyPreview,
  toggleApiKeyVisibility,
  resetToDemoData,
  clearAllData,

  // Import / Export
  exportData,
  importData,
  openExportModal,
  closeExportModal,
  exportCatalogExcel,
  exportCatalogOpusZip,
  exportCatalogNeodataZip,
  exportCatalogOpus,
  exportCatalogNeodata,
  exportCatalogCsv,
  openImportModal,
  closeImportModal,
  handleUniversalFileSelect,
  onSheetSelectChange,
  executeImport,
  toggleImportDestination,
  resetImportModalUI,
  onZoneSelectChange,
  calculateParsedBudgetTotal,
  loadCasaLauraOpusDirectly,
  reloadCasaLauraOpus: loadCasaLauraOpusDirectly,

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
  printCalendarioObraFormat,
  printEstimacionesFormat,

  // Portal, Perfil y Multi-Proyecto
  initPortal,
  showPortalView,
  renderPortalAuth,
  updatePortalHeaderUserArea,
  updateWorkspaceHeaderUser,
  switchAuthTab,
  setRegSexo,
  handleCustomPhotoUpload,
  handleRegisterSubmit,
  handleLoginSubmit,
  quickLoginWithFeaturedUser,
  removeFeaturedUserAccount,
  quickLoginWithSavedUser,
  removeSavedUserQuickProfile,
  purgeAllUsersAndAccountsAction,
  togglePasswordVisibility,
  checkPasswordMatchLive,
  triggerGoogleSignIn,
  closeGoogleAuthModal,
  selectGoogleAccount,
  submitCustomGoogleAccount,
  renderPortalDashboard,
  filterProjectCards,
  onProjectSearchInput,
  setCompanyFilter,
  setTipoObraFilter,
  setProjectScopeFilter,
  setProjectDashboardMode,
  toggleSortDate,
  toggleSortAZ,
  resetProjectFilters,
  refreshProjectsGridUI,
  renderCompanyOptionsHTML,
  openProjectInWorkspace,
  openProjectInNewTab,
  goToProjectsDashboard,
  duplicateProjectAction,
  deleteProjectAction,
  syncProjectToCloudAction,
  openNuevoProyectoModal,
  openNewProjectModal,
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
  deleteUserAccount,
  deleteCurrentUserAccountAction,
  logoutUser,
  toggleUserDropdown,
  closeUserDropdown,
  togglePortalUserDropdown,
  closePortalUserDropdown,
  renderMemberAvatarsHTML,
  openInviteModal,
  closeInviteModal,
  switchInviteModalTab,
  setInviteTabCheckboxes,
  toggleMemberTabPermission,
  setMemberAllTabsPermission,
  setInviteSexo,
  handleInvitePhotoUpload,
  selectInvitePreset,
  submitInviteMember,
  changeMemberRole,
  removeMemberFromProject,
  getActiveOrFallbackProjectId,
  copyProjectInviteLink,
  renderHeaderCollaborators,
  openPlanInviteModal,
  closePlanInviteModal,
  switchPlanInviteModalTab,
  setPlanInviteSexo,
  updatePlanInviteAvatarPreview,
  handlePlanInvitePhotoUpload,
  selectPlanInvitePreset,
  submitPlanInviteMember,
  changePlanCollaboratorRole,
  onRemovePlanCollaboratorClick,
  copyPlanInviteLink,
  TAB_METADATA,
  canCurrentUserAccessTab,
  updateNavigationTabsAccess,
  renderTabAssignedAvatars,
  renderAllTabAssignedMembers,
  openTabMembersAssignModal,
  closeTabMembersAssignModal,
  renderTabMembersModalList,
  onTabMemberCheckChange,
  toggleSelectAllTabMembers,
  saveTabMembersAssignment,
  simulateUserView,
  toggleComparisonModal,
  switchPortalView,
  switchView,
  toggleCardMenu,
  filterProjects,
  toggleSort,
  setStatusFilter,
  resetFilters,
  subscribeToProjectRealtime,
  unsubscribeFromProjectRealtime,
  exportProjectToExcelAction
});

// Atajos de teclado:
// - Alt + Flecha Arriba / Abajo para mover la fila seleccionada
// - Ctrl + C / Cmd + C para copiar concepto seleccionado con toda su matriz APU
// - Ctrl + V / Cmd + V para pegar concepto copiado con su matriz APU
document.addEventListener('keydown', (e) => {
  const isEditingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    if (state.activeSelectedId) {
      e.preventDefault();
      moverSelectedRow(e.key === 'ArrowUp' ? 'up' : 'down');
    }
  } else if (!isEditingText && (e.ctrlKey || e.metaKey)) {
    const viewCalendario = document.getElementById('view-calendario');
    const isCalendarioActive = viewCalendario && !viewCalendario.classList.contains('hidden');

    if (isCalendarioActive && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        redoCalendarioScheduleAction();
      } else {
        undoCalendarioScheduleAction();
      }
    } else if (isCalendarioActive && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redoCalendarioScheduleAction();
    } else if (e.key === 'c' || e.key === 'C') {
      if (state.activeSelectedId) {
        e.preventDefault();
        copiarSelectedRow();
      }
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      pegarSelectedRow();
    }
  }
});

// Selección universal de filas en cualquier tabla del área de proyecto (mismo color y estilo que Catálogo Base)
function handleWorkspaceTableRowSelection(e) {
  const target = e.target;
  if (!target || typeof target.closest !== 'function') return;

  // Ignorar fuera del área de proyecto o ventana maximizada de matriz
  if (!target.closest('#workspace-container') && !target.closest('#matriz-modal')) return;

  // Soporte para filas divididas del Gantt (panel izquierdo y derecho)
  const ganttRow = target.closest('[data-gantt-left-row], [data-gantt-right-row]');
  if (ganttRow) {
    const rowId = ganttRow.getAttribute('data-gantt-left-row') || ganttRow.getAttribute('data-gantt-right-row');
    if (rowId) selectCalendarioRow(rowId, e);
    return;
  }

  const tr = target.closest('tbody tr');
  if (!tr) return;

  // Ignorar filas vacías informativas de una sola celda con colspan
  if (tr.children.length === 1 && tr.children[0].hasAttribute('colspan')) return;

  if (tr.dataset.nodeId) {
    highlightCatalogRowInPlace(tr.dataset.nodeId);
    return;
  }
  if (tr.dataset.itemKey) {
    selectInsumoBaseRow(tr.dataset.itemKey);
    return;
  }
  if (tr.dataset.finRow) {
    selectCalendarioRow(tr.dataset.finRow, e);
    return;
  }
  if (tr.dataset.curvaRow) {
    selectCalendarioRow(tr.dataset.curvaRow, e);
    return;
  }
  if (tr.dataset.estRow) {
    selectEstimacionRow(tr.dataset.estRow, e);
    return;
  }

  // Cualquier otra tabla dentro del área de proyecto
  const tbody = tr.parentElement;
  if (tbody) {
    tbody.querySelectorAll('tr.selected-row').forEach((r) => r.classList.remove('selected-row'));
    tr.classList.add('selected-row');
  }
}

document.addEventListener('click', handleWorkspaceTableRowSelection);
document.addEventListener('focusin', handleWorkspaceTableRowSelection);

// Sincronizar portapapeles compartido en tiempo real entre pestañas
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY_CLIPBOARD) {
    syncClipboardFromStorage();
    updateClipboardUI();
  renderHeaderCollaborators();
  renderAllTabAssignedMembers();
  updateNavigationTabsAccess();
    renderTAB1();
  }
});

// Conectar callback de renderizado al cambiar el candado de bloqueo de pestaña
setTabLockRenderCallback((tabKey) => {
  updateUndoRedoButtons();
  if (tabKey === 'cat') {
    renderTAB1();
    if (state.activeSelectedId) {
      const activeNode = findNodeById(state.treeData, state.activeSelectedId);
      if (activeNode && (!activeNode.children || activeNode.children.length === 0)) {
        renderAPUInsumos(activeNode);
      }
    }
  } else if (tabKey === 'insumos') {
    renderInsumosGenerales();
  } else if (tabKey === 'calendario') {
    renderCalendarioObra();
  } else if (tabKey === 'estimaciones') {
    renderEstimacionesView();
  }
});

// Conectar callback de renderizado en historial de deshecho/rehecho
setHistoryRenderCallback(() => {
  renderTAB1();
  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && !viewCalendario.classList.contains('hidden')) {
    renderCalendarioObra();
  }
});

// Conectar callback de renderizado al cambiar entre Vista de Día y Modo Nocturno
setThemeRenderCallback(() => {
  renderTAB1();
  if (state.activeSelectedId) {
    const activeNode = findNodeById(state.treeData, state.activeSelectedId);
    if (activeNode && (!activeNode.children || activeNode.children.length === 0)) {
      renderAPUInsumos(activeNode);
    }
  }
  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && !viewCalendario.classList.contains('hidden')) {
    renderCalendarioObra();
  }
  const viewEstimaciones = document.getElementById('view-estimaciones');
  if (viewEstimaciones && !viewEstimaciones.classList.contains('hidden')) {
    renderEstimacionesView();
  }
  const subModal = document.getElementById('modal-suscripcion-usuario');
  if (subModal && !subModal.classList.contains('hidden')) {
    renderSubscriptionCards();
  }
});

// Sincronizar tema visual entre pestañas abiertas
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY_THEME) {
    applyThemeMode(e.newValue === 'night' ? 'night' : 'day', { persist: false, notify: false, rerender: true });
  }
});

// Inicializar tema visual (Vista de Día por defecto o Modo Nocturno guardado)
initThemeMode();
try {
  initAuthListener((event, session, perfil) => {
    if (session?.user) {
      // Sincronizar membresía activa de Supabase Auth en segundo plano
      try {
        syncSubscriptionFromCloud(session.user.email).then(cloudSub => {
          if (cloudSub) {
            updateSubscriptionBadgesUI();
            if (typeof refreshProjectsGridUI === 'function') {
              refreshProjectsGridUI();
            }
          }
        }).catch(() => {});
      } catch (_) {}

      const workspaceContainer = document.getElementById('workspace-container');
      const isWorkspaceVisible = workspaceContainer && !workspaceContainer.classList.contains('hidden') && workspaceContainer.style.display !== 'none';
      if (!isWorkspaceVisible) {
        showPortalView('dashboard');
      } else {
        try { updateWorkspaceHeaderUser(perfil || session.user); } catch (_) {}
      }
      try { renderSidebarNotificationsUI(); } catch (_) {}
      try { initGlobalRealtimeSync(); requestPeerSync(); } catch (_) {}
      try {
        if (typeof window !== 'undefined' && typeof window.autoSyncCollaborationOnStartup === 'function') {
          window.autoSyncCollaborationOnStartup(session.user);
        }
      } catch (_) {}

      if (typeof window !== 'undefined' && window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery'))) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }
    }
  });
} catch (_) {}

// Inicialización de la aplicación al cargar el módulo
const isWorkspaceActive = initPortal();
if (isWorkspaceActive) {
  initStore();
  initBranding();
  initPanelResizer();
  renderTAB1();
  updateUndoRedoButtons();
  updateClipboardUI();
  openReferenceDb().catch(err => console.warn('IndexedDB reference DB:', err));
  const activePId = getActiveProjectId();
  if (activePId) {
    try {
      subscribeToProjectRealtime(activePId);
    } catch (e) {
      console.warn('[Realtime] Aviso al conectar canal de obra:', e);
    }
  }

  // Inicializar canal WebSocket global para invitaciones y proyectos en tiempo real
  try {
    initGlobalRealtimeSync();
  } catch (e) {
    console.warn('[Realtime] Aviso inicializando sincronización global:', e);
  }
}

// Asegurar renderizado de colaboradores en el encabezado de proyecto
if (typeof document !== 'undefined') {
  renderHeaderCollaborators();
  renderAllTabAssignedMembers();
  updateNavigationTabsAccess();
  updateSubscriptionBadgesUI();
  applyTabLocksToDOM();
  renderProjectChatDock();
  try {
    initGlobalRealtimeSync();
    requestPeerSync();
    if (typeof window !== 'undefined' && typeof window.autoSyncCollaborationOnStartup === 'function') {
      window.autoSyncCollaborationOnStartup();
    }
  } catch (e) {}
}

window.handleAcceptInvitationAction = handleAcceptInvitationAction;
window.handleRejectInvitationAction = handleRejectInvitationAction;
window.toggleProjectChatDock = toggleProjectChatDock;
window.toggleProjectChatMaximize = toggleProjectChatMaximize;
window.printProjectChatReport = printProjectChatReport;
window.openProjectChatForPartida = openProjectChatForPartida;
window.clearProjectChatPartidaFilter = clearProjectChatPartidaFilter;
window.setProjectChatFilter = setProjectChatFilter;
window.onProjectChatAuthorChange = onProjectChatAuthorChange;
window.toggleProjectChatTagPicker = toggleProjectChatTagPicker;
window.addProjectChatPendingTag = addProjectChatPendingTag;
window.removeProjectChatPendingTag = removeProjectChatPendingTag;
window.sendProjectChatMessage = sendProjectChatMessage;
window.deleteProjectChatMessage = deleteProjectChatMessage;
window.jumpToProjectChatTag = jumpToProjectChatTag;
window.renderProjectChatDock = renderProjectChatDock;
window.toggleMentionNotificationsPopover = toggleMentionNotificationsPopover;
window.closeMentionNotificationsPopover = closeMentionNotificationsPopover;
window.onNotificationsUserFilterChange = onNotificationsUserFilterChange;
window.markAllMentionsAsRead = markAllMentionsAsRead;
window.openMentionNotification = openMentionNotification;
window.renderSidebarNotificationsUI = renderSidebarNotificationsUI;
window.openEstimacionConceptPhotosModal = openEstimacionConceptPhotosModal;
window.closeEstimacionConceptPhotosModal = closeEstimacionConceptPhotosModal;
window.onEstimacionPhotoUrlPreviewInput = onEstimacionPhotoUrlPreviewInput;
window.clearEstimacionConceptPhotoSlot = clearEstimacionConceptPhotoSlot;
window.saveEstimacionConceptPhotosModal = saveEstimacionConceptPhotosModal;

setProjectChatRefreshCallback(() => {
  renderTAB1();
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && !viewCalendario.classList.contains('hidden')) {
    renderCalendarioObra();
  }
  const viewEstimaciones = document.getElementById('view-estimaciones');
  if (viewEstimaciones && !viewEstimaciones.classList.contains('hidden')) {
    renderEstimacionesView();
  }
});
