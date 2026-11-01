// js/modules/portal/projectService.js
// Servicio centralizado para usuarios, proyectos multi-obra y almacenamiento aislado

import {
  STORAGE_KEY_USER,
  STORAGE_KEY_PROJECTS,
  getStorageKey,
  getSettingsKey,
  DEFAULT_STORAGE_KEY,
  DEFAULT_SETTINGS_KEY
} from '../../config/constants.js';
import { defaultTreeData, defaultSettings } from '../../config/defaultData.js';

// Avatares temáticos según sexo (SVGs ultraligeros de arquitectos e ingenieros con casco)
export const AVATARS_BY_SEX = {
  'Masculino': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%231e3a8a'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fdba74'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23f59e0b'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%232563eb'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23ffffff'/%3E%3C/svg%3E",
  'Femenino': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23581c87'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fed7aa'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23f59e0b'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%237c3aed'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23fbcfe8'/%3E%3C/svg%3E",
  'Otro': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23064e3b'/%3E%3Ccircle cx='50' cy='42' r='18' fill='%23fbcfe8'/%3E%3Cpath d='M26,34 Q50,14 74,34 L70,40 Q50,26 30,40 Z' fill='%23ffffff'/%3E%3Cpath d='M24,88 C24,64 76,64 76,88 Z' fill='%23059669'/%3E%3Cpolygon points='50,60 45,74 55,74' fill='%23a7f3d0'/%3E%3C/svg%3E"
};

// Cuentas de demostración de Google con foto real
export const GOOGLE_PRESET_ACCOUNTS = [
  {
    name: "Arq. Carlos Alberto Gómez",
    email: "carlos.gomez.arq@gmail.com",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    sexo: "Masculino",
    dob: "1990-08-14"
  },
  {
    name: "Ing. Mariana Torres Morales",
    email: "mariana.torres.costos@gmail.com",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
    sexo: "Femenino",
    dob: "1993-04-22"
  },
  {
    name: "Arq. Roberto Méndez Silva",
    email: "roberto.mendez.obras@gmail.com",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    sexo: "Masculino",
    dob: "1988-11-05"
  },
  {
    name: "Lic. Sofía Valenzuela Rios",
    email: "sofia.valenzuela.admin@gmail.com",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
    sexo: "Femenino",
    dob: "1995-02-17"
  }
];

export const PROJECT_ROLES = {
  editar: { label: 'Editar', description: 'Control Total', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  escribir: { label: 'Escribir', description: 'Captura de Conceptos e Insumos', badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  leer: { label: 'Leer', description: 'Solo Lectura', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' }
};

// Logotipos de muestra
export const SAMPLE_LOGOS = {
  shield: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50,10 L85,25 L85,55 C85,75 50,92 50,92 C50,92 15,75 15,55 L15,25 Z' fill='%232563eb'/%3E%3Cpath d='M35,48 L46,59 L68,36' fill='none' stroke='white' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
  building: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%230f172a'/%3E%3Cpath d='M25,80 L25,35 L45,20 L45,80 Z' fill='%2338bdf8'/%3E%3Cpath d='M45,80 L45,35 L75,35 L75,80 Z' fill='%230284c7'/%3E%3C/svg%3E"
};

// ==========================================
// GESTIÓN DE USUARIO
// ==========================================
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Error leyendo usuario:', e);
    return null;
  }
}

export function saveCurrentUser(user) {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY_USER);
    } else {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    }
  } catch (e) {
    console.error('Error guardando usuario:', e);
  }
}

// ==========================================
// GESTIÓN DE PROYECTOS
// ==========================================
export function getProjectsList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (raw) {
      const list = JSON.parse(raw);
      // Asegurar que cada proyecto tenga su lista de colaboradores con permisos
      const currentUser = getCurrentUser();
      let changed = false;
      list.forEach(p => {
        if (!p.members || !Array.isArray(p.members) || p.members.length === 0) {
          p.members = [
            {
              id: 'mem-' + (currentUser ? currentUser.email : 'owner'),
              name: (currentUser && currentUser.name) || 'Administrador de Obra',
              email: (currentUser && currentUser.email) || 'admin@constructora.com',
              avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
              role: 'editar'
            },
            {
              id: 'mem-colab-01',
              name: 'Ing. Mariana Torres Morales',
              email: 'mariana.torres.costos@gmail.com',
              avatar: AVATARS_BY_SEX['Femenino'],
              role: 'escribir'
            }
          ];
          changed = true;
        }
      });
      if (changed) saveProjectsList(list);
      return list;
    }
  } catch (e) {
    console.error('Error leyendo proyectos:', e);
  }
  return initializeDefaultProjects();
}

export function saveProjectsList(projects) {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('Error guardando proyectos:', e);
  }
}

export function getProjectById(id) {
  const list = getProjectsList();
  return list.find(p => p.id === id) || null;
}

// Inicializar proyectos por defecto o migrar datos existentes
function initializeDefaultProjects() {
  let existingTree = null;
  let existingSettings = null;

  try {
    const rawTree = localStorage.getItem(DEFAULT_STORAGE_KEY);
    if (rawTree) existingTree = JSON.parse(rawTree);
    const rawSet = localStorage.getItem(DEFAULT_SETTINGS_KEY);
    if (rawSet) existingSettings = JSON.parse(rawSet);
  } catch (e) {}

  const initialProjects = [];

  // Proyecto Principal (basado en los datos actuales o por defecto)
  const proj1Id = 'proj-default-01';
  const proj1Settings = Object.assign({}, defaultSettings, existingSettings || {}, {
    companyName: (existingSettings && existingSettings.companyName) || 'Constructora Lomas del Ángel S.A.',
    companyLogo: (existingSettings && existingSettings.companyLogo) || SAMPLE_LOGOS.shield,
    projectName: (existingSettings && existingSettings.projectName) || 'Residencia Lomas Altas (Fase 1)',
    projectLocation: (existingSettings && existingSettings.projectLocation) || 'Av. Paseo de las Lomas 1240, CDMX',
    currency: (existingSettings && existingSettings.currency) || 'MXN',
    currencySymbol: (existingSettings && existingSettings.currencySymbol) || '$',
    applySobrecosto: true,
    pctIndirectos: 12.00,
    pctFinanciamiento: 1.50,
    pctUtilidad: 10.00,
    pctAdicionales: 0.50
  });

  const proj1Tree = existingTree && existingTree.length > 0 ? existingTree : JSON.parse(JSON.stringify(defaultTreeData));

  // Guardar almacenamiento aislado para el proyecto 1
  try {
    localStorage.setItem(getSettingsKey(proj1Id), JSON.stringify(proj1Settings));
    localStorage.setItem(getStorageKey(proj1Id), JSON.stringify(proj1Tree));
  } catch (e) {}

  const f1 = 1.2584;
  initialProjects.push({
    id: proj1Id,
    companyName: proj1Settings.companyName,
    companyLogo: proj1Settings.companyLogo,
    projectName: proj1Settings.projectName,
    projectLocation: proj1Settings.projectLocation,
    currency: proj1Settings.currency,
    currencySymbol: proj1Settings.currencySymbol,
    factorSobrecosto: f1,
    totalPresupuesto: calculateTreeTotal(proj1Tree),
    conceptCount: countTreeConcepts(proj1Tree),
    partidasCount: countTreePartidas(proj1Tree),
    createdAt: new Date().toISOString().slice(0, 10)
  });

  // Proyecto de Muestra 2 (Torre Corporativa Reforma)
  const proj2Id = 'proj-demo-02';
  const proj2Settings = Object.assign({}, defaultSettings, {
    companyName: 'Grupo Constructor Metrópoli',
    companyLogo: SAMPLE_LOGOS.building,
    projectName: 'Torre Corporativa Reforma',
    projectLocation: 'Paseo de la Reforma 405, Cuauhtémoc, CDMX',
    currency: 'USD',
    currencySymbol: '$',
    applySobrecosto: true,
    pctIndirectos: 10.00,
    pctFinanciamiento: 1.20,
    pctUtilidad: 9.50,
    pctAdicionales: 0.50
  });

  const proj2Tree = [
    {
      id: 'p2-1',
      clave: '1',
      descripcion: 'SUBESTRUCTURA Y PILOTES',
      unidad: 'lote',
      cantidad: 1,
      precioUnitario: 0,
      costoDirecto: 0,
      color: '#3b82f6',
      expanded: true,
      selected: true,
      children: [
        {
          id: 'p2-1.1',
          clave: '1.1',
          descripcion: 'Pilotes de cimentación profunda de concreto armado d=80 cm h=22 m',
          unidad: 'm',
          cantidad: 1450.00,
          precioUnitario: 320.00,
          costoDirecto: 320.00,
          selected: true,
          insumos: [
            { clave: 'MAT-P01', tipo: 'Material', descripcion: 'Concreto premezclado f\'c=350 kg/cm2', unidad: 'm3', cantidad: 0.52, costoUnitario: 145.00 },
            { clave: 'MO-P01', tipo: 'Mano de Obra', descripcion: 'Cuadrilla especializada en perforación y colado', unidad: 'jor', cantidad: 0.05, costoUnitario: 180.00 },
            { clave: 'EQ-P01', tipo: 'Equipo', descripcion: 'Perforadora hidráulica sobre orugas Casagrande', unidad: 'hr', cantidad: 0.04, costoUnitario: 850.00 }
          ]
        }
      ]
    }
  ];

  try {
    localStorage.setItem(getSettingsKey(proj2Id), JSON.stringify(proj2Settings));
    localStorage.setItem(getStorageKey(proj2Id), JSON.stringify(proj2Tree));
  } catch (e) {}

  initialProjects.push({
    id: proj2Id,
    companyName: proj2Settings.companyName,
    companyLogo: proj2Settings.companyLogo,
    projectName: proj2Settings.projectName,
    projectLocation: proj2Settings.projectLocation,
    currency: proj2Settings.currency,
    currencySymbol: proj2Settings.currencySymbol,
    factorSobrecosto: 1.2215,
    totalPresupuesto: calculateTreeTotal(proj2Tree),
    conceptCount: countTreeConcepts(proj2Tree),
    partidasCount: countTreePartidas(proj2Tree),
    createdAt: new Date().toISOString().slice(0, 10)
  });

  saveProjectsList(initialProjects);
  return initialProjects;
}

// Crear un nuevo proyecto
export function createNewProject(params) {
  const newId = 'proj-' + Date.now();
  
  const projSettings = Object.assign({}, defaultSettings, {
    companyName: params.companyName,
    companyLogo: params.companyLogo || '',
    projectName: params.projectName,
    projectLocation: params.projectLocation,
    currency: params.currency || 'MXN',
    currencySymbol: params.currencySymbol || '$',
    applySobrecosto: params.applySobrecosto ?? true,
    pctIndirectos: params.pctIndirectos ?? 12.00,
    pctFinanciamiento: params.pctFinanciamiento ?? 1.50,
    pctUtilidad: params.pctUtilidad ?? 10.00,
    pctAdicionales: params.pctAdicionales ?? 0.50
  });

  const projTree = params.template === 'demo' ? JSON.parse(JSON.stringify(defaultTreeData)) : [];

  // Almacenar settings y catálogo del nuevo proyecto
  try {
    localStorage.setItem(getSettingsKey(newId), JSON.stringify(projSettings));
    localStorage.setItem(getStorageKey(newId), JSON.stringify(projTree));
  } catch (e) {
    console.error('Error guardando nuevo proyecto:', e);
  }

  const f = projSettings.applySobrecosto ?
    (1 + projSettings.pctIndirectos/100) * (1 + projSettings.pctFinanciamiento/100) * (1 + projSettings.pctUtilidad/100) * (1 + projSettings.pctAdicionales/100) : 1.0;

  const currentUser = getCurrentUser();
  const projectEntry = {
    id: newId,
    companyName: projSettings.companyName,
    companyLogo: projSettings.companyLogo,
    projectName: projSettings.projectName,
    projectLocation: projSettings.projectLocation,
    currency: projSettings.currency,
    currencySymbol: projSettings.currencySymbol,
    factorSobrecosto: f,
    totalPresupuesto: calculateTreeTotal(projTree),
    conceptCount: countTreeConcepts(projTree),
    partidasCount: countTreePartidas(projTree),
    members: [
      {
        id: 'mem-' + (currentUser ? currentUser.email : Date.now()),
        name: (currentUser && currentUser.name) || 'Administrador de Obra',
        email: (currentUser && currentUser.email) || 'admin@constructora.com',
        avatar: (currentUser && currentUser.avatar) || AVATARS_BY_SEX['Masculino'],
        role: 'editar'
      }
    ],
    createdAt: new Date().toISOString().slice(0, 10)
  };

  const list = getProjectsList();
  list.unshift(projectEntry);
  saveProjectsList(list);

  return projectEntry;
}

// Duplicar proyecto
export function duplicateProject(projectId) {
  const orig = getProjectById(projectId);
  if (!orig) return null;

  let origSettings = defaultSettings;
  let origTree = [];
  try {
    const s = localStorage.getItem(getSettingsKey(projectId));
    if (s) origSettings = JSON.parse(s);
    const t = localStorage.getItem(getStorageKey(projectId));
    if (t) origTree = JSON.parse(t);
  } catch(e) {}

  const newId = 'proj-' + Date.now();
  const copySettings = JSON.parse(JSON.stringify(origSettings));
  copySettings.projectName = orig.projectName + ' (Copia)';

  const copyTree = JSON.parse(JSON.stringify(origTree));

  try {
    localStorage.setItem(getSettingsKey(newId), JSON.stringify(copySettings));
    localStorage.setItem(getStorageKey(newId), JSON.stringify(copyTree));
  } catch(e) {}

  const newProj = Object.assign({}, orig, {
    id: newId,
    projectName: copySettings.projectName,
    members: (orig.members || []).map(m => Object.assign({}, m)),
    createdAt: new Date().toISOString().slice(0, 10)
  });

  const list = getProjectsList();
  list.unshift(newProj);
  saveProjectsList(list);

  return newProj;
}

// ==========================================
// GESTIÓN DE COLABORADORES / USUARIOS DE PROYECTO
// ==========================================
export function getProjectMembers(projectId) {
  const p = getProjectById(projectId);
  return (p && Array.isArray(p.members)) ? p.members : [];
}

export function addProjectMember(projectId, memberData) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj) return null;

  if (!Array.isArray(proj.members)) proj.members = [];

  // Verificar si ya existe por email
  const existingIdx = proj.members.findIndex(m => m.email && m.email.toLowerCase() === memberData.email.toLowerCase());
  const newMember = {
    id: memberData.id || ('mem-' + Date.now()),
    name: memberData.name.trim(),
    email: memberData.email.trim(),
    avatar: memberData.avatar || AVATARS_BY_SEX['Masculino'],
    role: memberData.role || 'editar' // 'editar', 'escribir', 'leer'
  };

  if (existingIdx >= 0) {
    proj.members[existingIdx] = Object.assign(proj.members[existingIdx], newMember);
  } else {
    proj.members.push(newMember);
  }

  saveProjectsList(list);
  return newMember;
}

export function removeProjectMember(projectId, memberId) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  proj.members = proj.members.filter(m => m.id !== memberId);
  saveProjectsList(list);
  return true;
}

export function updateProjectMemberRole(projectId, memberId, newRole) {
  const list = getProjectsList();
  const proj = list.find(p => p.id === projectId);
  if (!proj || !Array.isArray(proj.members)) return false;

  const mem = proj.members.find(m => m.id === memberId);
  if (mem) {
    mem.role = newRole;
    saveProjectsList(list);
    return true;
  }
  return false;
}

// Eliminar proyecto
export function deleteProject(projectId) {
  try {
    localStorage.removeItem(getSettingsKey(projectId));
    localStorage.removeItem(getStorageKey(projectId));
  } catch(e) {}

  const list = getProjectsList().filter(p => p.id !== projectId);
  saveProjectsList(list);
}

// Sincronizar el resumen del proyecto activo
export function syncActiveProjectSummary(projectId, treeData, settings) {
  if (!projectId) return;
  const list = getProjectsList();
  const idx = list.findIndex(p => p.id === projectId);
  if (idx === -1) return;

  const f = settings.applySobrecosto ?
    (1 + ((parseFloat(settings.pctIndirectos) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctFinanciamiento) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctUtilidad) || 0) / 100)) *
    (1 + ((parseFloat(settings.pctAdicionales) || 0) / 100)) : 1.0;

  list[idx].companyName = settings.companyName || list[idx].companyName;
  list[idx].companyLogo = settings.companyLogo !== undefined ? settings.companyLogo : list[idx].companyLogo;
  list[idx].projectName = settings.projectName || list[idx].projectName;
  list[idx].projectLocation = settings.projectLocation || list[idx].projectLocation;
  list[idx].currency = settings.currency || list[idx].currency;
  list[idx].currencySymbol = settings.currencySymbol || list[idx].currencySymbol;
  list[idx].factorSobrecosto = f;
  list[idx].totalPresupuesto = calculateTreeTotal(treeData);
  list[idx].conceptCount = countTreeConcepts(treeData);
  list[idx].partidasCount = countTreePartidas(treeData);

  saveProjectsList(list);
}

// ==========================================
// UTILIDADES DE CÁLCULO PARA EL RESUMEN
// ==========================================
function calculateTreeTotal(nodes) {
  if (!Array.isArray(nodes)) return 0;
  return nodes.reduce((sum, n) => sum + calculateNodeTotal(n), 0);
}

function calculateNodeTotal(node) {
  if (!node.children || node.children.length === 0) {
    const cant = Number(node.cantidad) || 0;
    const pu = Number(node.precioUnitario) || 0;
    return cant * pu;
  }
  return node.children.reduce((acc, c) => acc + calculateNodeTotal(c), 0);
}

function countTreeConcepts(nodes) {
  if (!Array.isArray(nodes)) return 0;
  let count = 0;
  function traverse(list) {
    list.forEach(n => {
      if (!n.children || n.children.length === 0) count++;
      else traverse(n.children);
    });
  }
  traverse(nodes);
  return count;
}

function countTreePartidas(nodes) {
  if (!Array.isArray(nodes)) return 0;
  let count = 0;
  function traverse(list) {
    list.forEach(n => {
      if (n.children && n.children.length > 0) {
        count++;
        traverse(n.children);
      }
    });
  }
  traverse(nodes);
  return count;
}
