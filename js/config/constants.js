export const DEFAULT_STORAGE_KEY = 'control_obra_treeData_v4';
export const DEFAULT_SETTINGS_KEY = 'control_obra_settings_v4';
export const APU_WIDTH_KEY = 'control_obra_apu_width';

export const STORAGE_KEY_USER = 'control_obra_user_profile_v1';
export const STORAGE_KEY_PROJECTS = 'control_obra_projects_v1';

let activeProjectId = null;

export function setActiveProjectId(id) {
  activeProjectId = id;
}

export function getActiveProjectId() {
  return activeProjectId;
}

export function getStorageKey(projectId = null) {
  const pId = projectId || activeProjectId;
  return pId ? `control_obra_treeData_${pId}` : DEFAULT_STORAGE_KEY;
}

export function getSettingsKey(projectId = null) {
  const pId = projectId || activeProjectId;
  return pId ? `control_obra_settings_${pId}` : DEFAULT_SETTINGS_KEY;
}

// Retrocompatibilidad para módulos existentes
export const STORAGE_KEY = DEFAULT_STORAGE_KEY;
export const SETTINGS_KEY = DEFAULT_SETTINGS_KEY;
