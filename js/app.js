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
import { hydrateProjectModulesFromCloud } from './core/cloudModulesSyncService.js';
import { syncPendingMediaUploads } from './services/s3StorageService.js';
import { initAuthListener } from './core/authService.js';
import { isRecentInternalCloudAuthUpdate } from './core/collaborationCloudService.js';
import { getCurrentUser } from './modules/portal/projectService.js';

import {
  renderExpensesView,
  switchExpensesSubTab,
  openNewExpenseModal,
  closeNewExpenseModal,
  saveExpenseModalForm,
  calculateExpenseModalTotals,
  onExpenseInsumoSelectChange,
  onEvidenceFileInputChange,
  removeTempEvidence,
  toggleExpenseStatusAction,
  deleteExpenseAction,
  printExpensePurchaseOrder,
  exportExpensesExcelAction,
  openEvidenceAction,
  onExpensesSearchChange,
  onExpensesTypeFilterChange,
  onExpensesStatusFilterChange,
  clearExpensesFilters,
  onComparativaSearchChange,
  onComparativaTypeFilterChange,
  onComparativaAlertFilterChange,
  openSuppliersListModal,
  closeSuppliersListModal,
  openSupplierModal,
  closeSupplierModal,
  saveSupplierModalForm,
  deleteSupplierAction,
  populateInsumosDropdown,
  filterInsumosDropdown,
  clearInsumoSearch,
  updateProjectQtyDisplay,
  copyProjectQtyToInput,
  printExpensesActiveReportAction,
  agruparComprasAction,
  desagruparComprasAction,
  toggleComparativaCategoryCollapse,
  toggleAllComparativaCategories
} from './modules/compras/expensesView.js';
import {
  exportExpensesToExcel,
  printSingleOrdenCompra,
  printExpensesActiveReport
} from './modules/compras/expensesExporter.js';
import {
  openExpenseEvidence
} from './modules/compras/driveExpenseService.js';
import {
  renderBitacoraView,
  openBitacoraConfigModal,
  saveBitacoraConfigModalAction,
  onBitacoraTodayWeatherChange,
  openBitacoraNoteModal,
  closeBitacoraModal,
  insertBitacoraTemplate,
  onBitacoraConceptSearch,
  toggleBitacoraConceptLink,
  onBitacoraPhotosSelected,
  updateTempEvidenceCaption,
  removeTempBitacoraEvidence,
  saveBitacoraNoteFormAction,
  deleteBitacoraDraftAction,
  createFeDeErratasAction,
  openSignBitacoraNoteModal,
  clearBitacoraSignatureCanvas,
  confirmAndSealBitacoraNoteAction,
  downloadSingleNotePdfAction,
  openBitacoraPdfAction,
  downloadFullBitacoraBookAction,
  syncPendingBitacoraCloudAction,
  downloadBitacoraLightboxEvidenceAction,
  onBitacoraSearchChange,
  onBitacoraTypeFilterChange,
  onBitacoraStatusFilterChange,
  onBitacoraDateFromChange,
  onBitacoraDateToChange,
  toggleBitacoraSortOrder,
  clearBitacoraFilters,
  scrollToBitacoraNote,
  openBitacoraPhotoLightbox
} from './modules/bitacora/bitacoraView.js';

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
  autoColorRows,
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
  openPresupuestoSignaturesModal,
  closePresupuestoSignaturesModal,
  addPresupuestoSignature,
  removePresupuestoSignature,
  updateDraftSignature,
  resetDefaultPresupuestoSignatures,
  savePresupuestoSignatures,
  getBudgetSignatures
} from './modules/catalog/signaturesModal.js';

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
  actualizarInsumosConBusquedaWeb,
  selectInsumoBaseRow
} from './modules/insumosGenerales/insumosView.js';

import {
  testGeminiConnection,
  executeAiGeneration,
  generarMatrizCasillasGoogleIA,
  generarMatrizConceptoActivoGoogleIA,
  generarMatrizConBusquedaWebActiva,
  generarMatrizCasillasConBusquedaWeb
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
import { toggleAiSplitMenu, closeAiSplitMenu } from './ui/aiSplitMenu.js';

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
} from './modules/reference/masterCatalogModal.js?v=20261113_02';

import {
  openApuReferenceModal,
  closeApuReferenceModal,
  setApuAssistantFilter,
  onApuAssistantSearchInput,
  triggerApuAssistantSearch,
  addInsumoToApuMatrix
} from './modules/reference/apuAssistantModal.js';

import { installPresetCatalog, installAllPresets, ensureDefaultMasterCatalogs } from './modules/reference/presetCatalogs.js';

import { openReferenceDb } from './modules/reference/referenceDb.js';

// Motor de Autocorrección y Revisor Ortográfico estilo Microsoft Word (F7)
import { wordAutocorrectService } from './core/wordAutocorrectService.js';
import {
  openSpellCheckModal,
  closeSpellCheckModal,
  changeSpellCheckCurrentWord,
  changeAllSpellCheckWord,
  ignoreSpellCheckOnce,
  ignoreAllSpellCheckWord,
  addCurrentToDictionary,
  rescanSpellCheck
} from './ui/spellCheckModal.js';

import {
  openAiGeneratorModal,
  closeAiGeneratorModal,
  toggleAiModalKeyVisibility,
  refreshAiQuotaBadges,
  updateAiModalRunButtonLabel,
  openSettingsModal,
  closeSettingsModal,
  openPlatformInfoModal,
  closePlatformInfoModal,
  handlePlatformInfoEmpiezaGratis,
  handlePlatformInfoVerPlanes,
  switchSettingsTab,
  updateCalculatedFactorPreview,
  updateFasarPreview,
  saveSettings,
  onCurrencySelectChange,
  updateCurrencyPreview,
  toggleApiKeyVisibility,
  resetToDemoData,
  clearAllData,
  switchTab,
  switchPresupuestoSubTab,
  initFloatingWindowOutsideClose
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
  switchProjectChatSection,
  autoSwitchChatSectionFromTab,
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
  exportProjectToExcelAction,
  logoutAllDevices
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
  onEstimacionPhotoFileSelected,
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
  switchPresupuestoSubTab,
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
  autoColorRows,
  toggleSelectNode,
  toggleSelectAll,
  selectRow,
  highlightCatalogRowInPlace,
  closeApuPanel,
  renderTAB1,
  toggleDropdownMenu,
  closeAllDropdownMenus,

  // Firmas y Responsables de Presupuesto
  openPresupuestoSignaturesModal,
  closePresupuestoSignaturesModal,
  addPresupuestoSignature,
  removePresupuestoSignature,
  updateDraftSignature,
  resetDefaultPresupuestoSignatures,
  savePresupuestoSignatures,
  getBudgetSignatures,

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
  actualizarInsumosConBusquedaWeb,
  selectInsumoBaseRow,

  // AI & Estimator
  openAiGeneratorModal,
  closeAiGeneratorModal,
  toggleAiModalKeyVisibility,
  refreshAiQuotaBadges,
  updateAiModalRunButtonLabel,
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
  generarMatrizConBusquedaWebActiva,
  generarMatrizCasillasConBusquedaWeb,
  getSelectedLeafConcepts,
  toggleAiSplitMenu,
  closeAiSplitMenu,

  // Settings & Modals
  openSettingsModal,
  closeSettingsModal,
  openPlatformInfoModal,
  closePlatformInfoModal,
  handlePlatformInfoEmpiezaGratis,
  handlePlatformInfoVerPlanes,
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
  } else if (tabKey === 'bitacora') {
    renderBitacoraView();
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
  const viewBitacora = document.getElementById('view-bitacora');
  if (viewBitacora && !viewBitacora.classList.contains('hidden')) {
    renderBitacoraView();
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

// Inicializar Motor Global de Autocorrección y Spellcheck estilo Microsoft Word
wordAutocorrectService.initGlobalObserver();
window.wordAutocorrectService = wordAutocorrectService;
window.openSpellCheckModal = openSpellCheckModal;
window.closeSpellCheckModal = closeSpellCheckModal;
window.changeSpellCheckCurrentWord = changeSpellCheckCurrentWord;
window.changeAllSpellCheckWord = changeAllSpellCheckWord;
window.ignoreSpellCheckOnce = ignoreSpellCheckOnce;
window.ignoreAllSpellCheckWord = ignoreAllSpellCheckWord;
window.addCurrentToDictionary = addCurrentToDictionary;
window.rescanSpellCheck = rescanSpellCheck;
window.logoutAllDevices = logoutAllDevices;

// Verificar validez de sesión al volver a la pestaña en cualquier computadora
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const activeUser = getCurrentUser();
    if (!activeUser) {
      const workspaceContainer = document.getElementById('workspace-container');
      const isWs = workspaceContainer && !workspaceContainer.classList.contains('hidden') && workspaceContainer.style.display !== 'none';
      if (isWs) {
        showPortalView('login');
      }
    }
  }
});
try {
  initAuthListener((event, session, perfil) => {
    if (session?.user) {
      const isInternalSync = (event === 'USER_UPDATED' && isRecentInternalCloudAuthUpdate());
      const prevPlanId = getCurrentSubscription()?.planId || null;
      // Sincronizar membresía activa de Supabase Auth en segundo plano
      try {
        syncSubscriptionFromCloud(session.user.email).then(cloudSub => {
          if (cloudSub) {
            const didPlanChange = cloudSub.planId && cloudSub.planId !== prevPlanId;
            updateSubscriptionBadgesUI({ refreshGrid: false });
            if (didPlanChange && typeof refreshProjectsGridUI === 'function') {
              refreshProjectsGridUI();
            }
          }
        }).catch(() => {});
      } catch (_) {}

      const currentUser = getCurrentUser();
      if (!currentUser) {
        showPortalView('login');
        return;
      }
      const workspaceContainer = document.getElementById('workspace-container');
      const isWorkspaceVisible = workspaceContainer && !workspaceContainer.classList.contains('hidden') && workspaceContainer.style.display !== 'none';
      if (!isWorkspaceVisible) {
        const portalGridExists = !!document.getElementById('portal-projects-grid');
        const currentMenuEmail = document.getElementById('portal-user-menu-wrapper')?.dataset?.userEmail || '';
        const incomingEmail = (session.user.email || '').toLowerCase().trim();
        if (portalGridExists && currentMenuEmail === incomingEmail && (isInternalSync || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION')) {
          updatePortalHeaderUserArea(currentUser || session.user);
        } else {
          showPortalView('dashboard');
        }
      } else {
        try { updateWorkspaceHeaderUser(currentUser || session.user); } catch (_) {}
      }
      try { renderSidebarNotificationsUI(); } catch (_) {}
      if (!isInternalSync) {
        try { initGlobalRealtimeSync(); requestPeerSync(); } catch (_) {}
        try {
          if (typeof window !== 'undefined' && typeof window.autoSyncCollaborationOnStartup === 'function') {
            window.autoSyncCollaborationOnStartup(session.user);
          }
        } catch (_) {}
      }

      if (typeof window !== 'undefined' && window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery'))) {
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
      }
    } else {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        showPortalView('login');
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
  openReferenceDb()
    .then(() => ensureDefaultMasterCatalogs().catch(err => console.warn('[PresetCatalogs] Error al sincronizar catálogos por defecto:', err)))
    .catch(err => console.warn('IndexedDB reference DB:', err));
  const activePId = getActiveProjectId();
  if (activePId) {
    try {
      subscribeToProjectRealtime(activePId);
    } catch (e) {
      console.warn('[Realtime] Aviso al conectar canal de obra:', e);
    }
    hydrateProjectModulesFromCloud(activePId).catch(() => {});
    syncPendingMediaUploads(activePId).catch(() => {});
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      syncPendingMediaUploads().then((res) => {
        if (res?.synced > 0) {
          showToast(`☁️ Reconexión detectada: ${res.synced} archivo(s) sincronizado(s) a AWS S3.`, 'success');
        }
      }).catch(() => {});
    });
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
  initFloatingWindowOutsideClose();
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
window.switchProjectChatSection = switchProjectChatSection;
window.autoSwitchChatSectionFromTab = autoSwitchChatSectionFromTab;
window.onGlobalActiveTabChange = autoSwitchChatSectionFromTab;
window.renderProjectChatDock = renderProjectChatDock;
window.toggleMentionNotificationsPopover = toggleMentionNotificationsPopover;
window.closeMentionNotificationsPopover = closeMentionNotificationsPopover;
window.onNotificationsUserFilterChange = onNotificationsUserFilterChange;
window.markAllMentionsAsRead = markAllMentionsAsRead;
window.openMentionNotification = openMentionNotification;
window.renderSidebarNotificationsUI = renderSidebarNotificationsUI;
window.openEstimacionConceptPhotosModal = openEstimacionConceptPhotosModal;
window.closeEstimacionConceptPhotosModal = closeEstimacionConceptPhotosModal;
window.onEstimacionPhotoFileSelected = onEstimacionPhotoFileSelected;
window.onEstimacionPhotoUrlPreviewInput = onEstimacionPhotoUrlPreviewInput;
window.clearEstimacionConceptPhotoSlot = clearEstimacionConceptPhotoSlot;
window.saveEstimacionConceptPhotosModal = saveEstimacionConceptPhotosModal;

window.renderExpensesView = renderExpensesView;
window.switchExpensesSubTab = switchExpensesSubTab;
window.openNewExpenseModal = openNewExpenseModal;
window.closeNewExpenseModal = closeNewExpenseModal;
window.saveExpenseModalForm = saveExpenseModalForm;
window.calculateExpenseModalTotals = calculateExpenseModalTotals;
window.onExpenseInsumoSelectChange = onExpenseInsumoSelectChange;
window.onEvidenceFileInputChange = onEvidenceFileInputChange;
window.removeTempEvidence = removeTempEvidence;
window.toggleExpenseStatusAction = toggleExpenseStatusAction;
window.deleteExpenseAction = deleteExpenseAction;
window.printExpensePurchaseOrder = printExpensePurchaseOrder;
window.exportExpensesExcelAction = exportExpensesExcelAction;
window.openEvidenceAction = openEvidenceAction;
window.onExpensesSearchChange = onExpensesSearchChange;
window.onExpensesTypeFilterChange = onExpensesTypeFilterChange;
window.onExpensesStatusFilterChange = onExpensesStatusFilterChange;
window.clearExpensesFilters = clearExpensesFilters;
window.onComparativaSearchChange = onComparativaSearchChange;
window.onComparativaTypeFilterChange = onComparativaTypeFilterChange;
window.onComparativaAlertFilterChange = onComparativaAlertFilterChange;
window.openSuppliersListModal = openSuppliersListModal;
window.closeSuppliersListModal = closeSuppliersListModal;
window.openSupplierModal = openSupplierModal;
window.closeSupplierModal = closeSupplierModal;
window.saveSupplierModalForm = saveSupplierModalForm;
window.deleteSupplierAction = deleteSupplierAction;
window.populateInsumosDropdown = populateInsumosDropdown;
window.filterInsumosDropdown = filterInsumosDropdown;
window.clearInsumoSearch = clearInsumoSearch;
window.updateProjectQtyDisplay = updateProjectQtyDisplay;
window.copyProjectQtyToInput = copyProjectQtyToInput;
window.printExpensesActiveReportAction = printExpensesActiveReportAction;
window.printExpensesActiveReport = printExpensesActiveReport;
window.agruparComprasAction = agruparComprasAction;
window.desagruparComprasAction = desagruparComprasAction;
window.toggleComparativaCategoryCollapse = toggleComparativaCategoryCollapse;
window.toggleAllComparativaCategories = toggleAllComparativaCategories;

// Alias de conveniencia e interoperabilidad para compras, pagos y destajos
window.switchComprasSubTab = function(sub) {
  if (sub === 'pagos' || sub === 'ordenes') {
    switchExpensesSubTab('bitacora');
  } else if (sub === 'destajos') {
    switchExpensesSubTab('bitacora');
    onExpensesTypeFilterChange('labor');
  } else if (sub === 'comparativa') {
    switchExpensesSubTab('comparativa');
  } else {
    switchExpensesSubTab('tablero');
  }
};
window.openNewOrdenCompraModal = function(editId = null) {
  openNewExpenseModal(editId);
  const typeEl = document.getElementById('expense-form-type');
  if (typeEl && !editId) typeEl.value = 'material';
};
window.openNewPagoModal = function(editId = null) {
  openNewExpenseModal(editId);
  const statusEl = document.getElementById('expense-form-status');
  if (statusEl && !editId) statusEl.value = 'paid';
};
window.openNewDestajoModal = function(editId = null) {
  openNewExpenseModal(editId);
  const typeEl = document.getElementById('expense-form-type');
  if (typeEl && !editId) typeEl.value = 'labor';
};
window.printOrdenCompraSingle = printExpensePurchaseOrder;

// Bitácora de Obra Digital y Legal
window.renderBitacoraView = renderBitacoraView;
window.openBitacoraConfigModal = openBitacoraConfigModal;
window.saveBitacoraConfigModalAction = saveBitacoraConfigModalAction;
window.onBitacoraTodayWeatherChange = onBitacoraTodayWeatherChange;
window.openBitacoraNoteModal = openBitacoraNoteModal;
window.closeBitacoraModal = closeBitacoraModal;
window.insertBitacoraTemplate = insertBitacoraTemplate;
window.onBitacoraConceptSearch = onBitacoraConceptSearch;
window.toggleBitacoraConceptLink = toggleBitacoraConceptLink;
window.onBitacoraPhotosSelected = onBitacoraPhotosSelected;
window.updateTempEvidenceCaption = updateTempEvidenceCaption;
window.removeTempBitacoraEvidence = removeTempBitacoraEvidence;
window.saveBitacoraNoteFormAction = saveBitacoraNoteFormAction;
window.deleteBitacoraDraftAction = deleteBitacoraDraftAction;
window.createFeDeErratasAction = createFeDeErratasAction;
window.openSignBitacoraNoteModal = openSignBitacoraNoteModal;
window.clearBitacoraSignatureCanvas = clearBitacoraSignatureCanvas;
window.confirmAndSealBitacoraNoteAction = confirmAndSealBitacoraNoteAction;
window.downloadSingleNotePdfAction = downloadSingleNotePdfAction;
window.openBitacoraPdfAction = openBitacoraPdfAction;
window.downloadFullBitacoraBookAction = downloadFullBitacoraBookAction;
window.syncPendingBitacoraCloudAction = syncPendingBitacoraCloudAction;
window.downloadBitacoraLightboxEvidenceAction = downloadBitacoraLightboxEvidenceAction;
window.onBitacoraSearchChange = onBitacoraSearchChange;
window.onBitacoraTypeFilterChange = onBitacoraTypeFilterChange;
window.onBitacoraStatusFilterChange = onBitacoraStatusFilterChange;
window.onBitacoraDateFromChange = onBitacoraDateFromChange;
window.onBitacoraDateToChange = onBitacoraDateToChange;
window.toggleBitacoraSortOrder = toggleBitacoraSortOrder;
window.clearBitacoraFilters = clearBitacoraFilters;
window.scrollToBitacoraNote = scrollToBitacoraNote;
window.openBitacoraPhotoLightbox = openBitacoraPhotoLightbox;

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
  const viewBitacora = document.getElementById('view-bitacora');
  if (viewBitacora && !viewBitacora.classList.contains('hidden')) {
    renderBitacoraView();
  }
  const viewCompras = document.getElementById('view-compras');
  if (viewCompras && !viewCompras.classList.contains('hidden')) {
    renderExpensesView();
  }
});
