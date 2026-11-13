// js/modules/reference/presetCatalogs.js
// Gestor de Catálogos Pre-cargados (BIMSA 2018 y Gobierno)

import { showToast } from '../../ui/notifications.js';
import { saveReferenceCatalog, listReferenceCatalogs } from './referenceDb.js';
import { flattenPresetData } from '../ai/localMatrixEngine.js';

let manifestCache = null;

// Obtener el manifiesto de catálogos pre-construidos
export async function getPresetCatalogManifest() {
  if (manifestCache) return manifestCache;
  try {
    const res = await fetch('data/catalog_manifest.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifestCache = await res.json();
    return manifestCache;
  } catch (err) {
    console.warn('No se pudo cargar el manifiesto de presets:', err);
    return [];
  }
}

// Asegurar que los catálogos por defecto estén instalados automáticamente en IndexedDB
// sin consumir cuota del usuario (el espacio lo absorbe la aplicación)
export async function ensureDefaultMasterCatalogs() {
  try {
    const manifest = await getPresetCatalogManifest();
    const defaultPresets = manifest.filter(m => m.isDefault || m.absorbedByApp);
    if (!defaultPresets || defaultPresets.length === 0) return 0;

    const existingCatalogs = await listReferenceCatalogs();
    const existingIds = new Set(existingCatalogs.map(c => c.id));

    let loadedCount = 0;
    for (const preset of defaultPresets) {
      if (existingIds.has(preset.id)) continue;

      try {
        let data = null;

        // Prioridad 1: Descomprimir paquete ZIP base ultraligero con JSZip
        if (preset.zipFile && typeof window !== 'undefined' && window.JSZip) {
          try {
            const zipRes = await fetch(preset.zipFile);
            if (zipRes.ok) {
              const zipBlob = await zipRes.blob();
              const zip = await window.JSZip.loadAsync(zipBlob);
              const jsonEntry = Object.values(zip.files).find(f => f && f.name && f.name.endsWith('.json') && !f.name.startsWith('__MACOSX'));
              if (jsonEntry) {
                const jsonText = await jsonEntry.async('string');
                data = JSON.parse(jsonText.replace(/^\uFEFF/, ''));
                console.log(`[DefaultCatalogs] Paquete base ZIP cargado: ${preset.zipFile}`);
              }
            }
          } catch (zipErr) {
            console.warn(`[DefaultCatalogs] Aviso al leer ZIP ${preset.zipFile}, reintentando con JSON:`, zipErr);
          }
        }

        // Prioridad 2: Archivo JSON directo si el ZIP no estuvo disponible
        if (!data && preset.file) {
          const res = await fetch(preset.file);
          if (res.ok) {
            const rawText = await res.text();
            data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
          }
        }

        if (data) {
          const itemsList = flattenPresetData(data);
          await saveReferenceCatalog({
            id: preset.id,
            name: preset.name,
            category: preset.category,
            type: 'mixto',
            sourceFileName: preset.zipFile || preset.file,
            zipFile: preset.zipFile,
            zipName: preset.zipName,
            isPreset: true,
            isSystem: true,
            absorbedByApp: true
          }, itemsList, 'system');
          loadedCount++;
          console.log(`[DefaultCatalogs] Catálogo oficial cargado: ${preset.name} (${itemsList.length} items, absorbido por app)`);
        }
      } catch (err) {
        console.warn(`[DefaultCatalogs] Error cargando ${preset.name}:`, err);
      }
    }
    return loadedCount;
  } catch (e) {
    console.warn('[DefaultCatalogs] Error en verificación de catálogos por defecto:', e);
    return 0;
  }
}

// Cargar un catálogo preset específico por su ID
export async function installPresetCatalog(presetId) {
  const manifest = await getPresetCatalogManifest();
  const preset = manifest.find(m => m.id === presetId);
  if (!preset) {
    showToast(`No se encontró el catálogo preset "${presetId}"`, 'error');
    return false;
  }

  const btn = document.getElementById(`btn-install-preset-${presetId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Instalando...';
  }

  try {
    showToast(`Descargando e indexando ${preset.name}...`, 'info');
    let data = null;

    if (preset.zipFile && typeof window !== 'undefined' && window.JSZip) {
      try {
        const zipRes = await fetch(preset.zipFile);
        if (zipRes.ok) {
          const zipBlob = await zipRes.blob();
          const zip = await window.JSZip.loadAsync(zipBlob);
          const jsonEntry = Object.values(zip.files).find(f => f && f.name && f.name.endsWith('.json') && !f.name.startsWith('__MACOSX'));
          if (jsonEntry) {
            const jsonText = await jsonEntry.async('string');
            data = JSON.parse(jsonText.replace(/^\uFEFF/, ''));
          }
        }
      } catch (zipErr) {
        console.warn(`[InstallPreset] Aviso al leer ZIP ${preset.zipFile}:`, zipErr);
      }
    }

    if (!data && preset.file) {
      const res = await fetch(preset.file);
      if (!res.ok) throw new Error(`No se pudo leer ${preset.file} (${res.status})`);
      const rawText = await res.text();
      data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
    }

    if (!data) throw new Error(`No se pudo cargar el contenido del catálogo`);
    const itemsList = flattenPresetData(data);
    
    await saveReferenceCatalog({
      id: data.id || preset.id,
      name: data.name || preset.name,
      category: data.category || preset.category,
      type: 'mixto',
      sourceFileName: preset.zipFile || preset.file,
      zipFile: preset.zipFile,
      zipName: preset.zipName,
      isPreset: true,
      isSystem: true,
      absorbedByApp: true
    }, itemsList, 'system');

    showToast(`¡${preset.name} instalado con éxito (${itemsList.length.toLocaleString()} registros)!`, 'success');
    
    if (window.refreshMasterCatalogList) {
      await window.refreshMasterCatalogList();
    }
    if (window.triggerMasterCatalogSearch) {
      window.triggerMasterCatalogSearch();
    }
    renderPresetBadges();
    return true;
  } catch (err) {
    console.error('Error instalando preset:', err);
    showToast(`Error al instalar ${preset.name}: ${err.message}`, 'error');
    return false;
  } finally {
    if (btn) {
      btn.disabled = false;
    }
  }
}

// Cargar TODOS los catálogos BIMSA y Gobierno de una sola vez
export async function installAllPresets() {
  const manifest = await getPresetCatalogManifest();
  if (!manifest || manifest.length === 0) {
    showToast('No se encontraron catálogos pre-cargados para instalar.', 'warning');
    return;
  }

  const mainBtn = document.getElementById('btn-install-all-presets');
  if (mainBtn) {
    mainBtn.disabled = true;
    mainBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Instalando Biblioteca Completa...';
  }

  let totalInstalled = 0;
  try {
    for (const preset of manifest) {
      showToast(`Instalando ${preset.name} (${preset.itemsCount.toLocaleString()} registros)...`, 'info');
      const res = await fetch(preset.file);
      if (res.ok) {
        const rawText = await res.text();
        const data = JSON.parse(rawText.replace(/^\uFEFF/, ''));
        const itemsList = flattenPresetData(data);
        await saveReferenceCatalog({
          id: data.id || preset.id,
          name: data.name || preset.name,
          category: data.category || preset.category,
          type: 'mixto',
          sourceFileName: preset.file,
          isPreset: true,
          isSystem: true,
          absorbedByApp: true
        }, itemsList, 'system');
        totalInstalled += itemsList.length;
      }
    }

    showToast(`🎉 ¡Biblioteca completa instalada con éxito! ${totalInstalled.toLocaleString()} registros indexados.`, 'success');

    if (window.refreshMasterCatalogList) {
      await window.refreshMasterCatalogList();
    }
    if (window.triggerMasterCatalogSearch) {
      window.triggerMasterCatalogSearch();
    }
    renderPresetBadges();
  } catch (err) {
    console.error('Error en instalación masiva:', err);
    showToast(`Error durante la instalación masiva: ${err.message}`, 'error');
  } finally {
    if (mainBtn) {
      mainBtn.disabled = false;
      mainBtn.innerHTML = '<i class="fa-solid fa-bolt mr-1 text-amber-300"></i> Cargar Biblioteca Completa (61,000+ regs)';
    }
  }
}

// Renderizar las tarjetas de presets en el modal del Catálogo Maestro
export async function renderPresetBadges() {
  const container = document.getElementById('master-cat-preset-grid');
  if (!container) return;

  const manifest = await getPresetCatalogManifest();
  const installedCatalogs = await listReferenceCatalogs();
  const installedIds = new Set(installedCatalogs.map(c => c.id));

  let html = '';
  manifest.forEach(preset => {
    const isInstalled = installedIds.has(preset.id);
    
    // Iconos temáticos según categoría
    let icon = 'fa-hard-hat';
    let colorClass = 'text-blue-600 bg-blue-50 border-blue-200';
    if (preset.category.includes('Eléctrica')) {
      icon = 'fa-bolt';
      colorClass = 'text-amber-600 bg-amber-50 border-amber-200';
    } else if (preset.category.includes('Hidráulica')) {
      icon = 'fa-faucet-drip';
      colorClass = 'text-cyan-600 bg-cyan-50 border-cyan-200';
    } else if (preset.category.includes('Aire')) {
      icon = 'fa-snowflake';
      colorClass = 'text-sky-600 bg-sky-50 border-sky-200';
    } else if (preset.category.includes('Infraestructura')) {
      icon = 'fa-road';
      colorClass = 'text-emerald-600 bg-emerald-50 border-emerald-200';
    } else if (preset.category.includes('Industrial')) {
      icon = 'fa-industry';
      colorClass = 'text-purple-600 bg-purple-50 border-purple-200';
    } else if (preset.category.includes('Gobierno')) {
      icon = 'fa-landmark';
      colorClass = 'text-rose-600 bg-rose-50 border-rose-200';
    }

    html += `
      <div class="p-2.5 bg-white border ${isInstalled ? 'border-emerald-300 ring-1 ring-emerald-200 bg-emerald-50/20' : 'border-slate-200'} rounded-lg shadow-2xs flex flex-col justify-between transition hover:shadow-xs">
        <div>
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="w-6 h-6 rounded-md flex items-center justify-center text-xs ${colorClass}">
              <i class="fa-solid ${icon}"></i>
            </span>
            <span class="text-[10px] font-mono font-bold ${isInstalled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-600 bg-slate-100'} px-1.5 py-0.5 rounded border ${isInstalled ? 'border-emerald-200' : 'border-slate-200'}">
              ${preset.itemsCount.toLocaleString()} regs
            </span>
          </div>
          <h4 class="font-bold text-xs text-slate-800 line-clamp-1" title="${preset.name}">${preset.name}</h4>
          <p class="text-[10px] text-slate-500 line-clamp-2 mt-0.5" title="${preset.description}">${preset.description}</p>
        </div>
        
        <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">${preset.category}</span>
          ${isInstalled ? `
            <span class="text-[10px] font-bold text-emerald-700 flex items-center gap-1 bg-emerald-100/70 px-2 py-0.5 rounded-full">
              <i class="fa-solid fa-check text-[9px]"></i> Instalado
            </span>
          ` : `
            <button id="btn-install-preset-${preset.id}" onclick="installPresetCatalog('${preset.id}')" 
                    class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow-2xs transition active:scale-95 flex items-center gap-1">
              <i class="fa-solid fa-download text-[9px]"></i> Instalar
            </button>
          `}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Renderizar las tarjetas de paquetes base (.ZIP) oficiales en el Catálogo Maestro
export async function renderBasePackagesList() {
  const container = document.getElementById('master-cat-base-packages-list');
  if (!container) return;

  const manifest = await getPresetCatalogManifest();
  const basePresets = manifest.filter(m => m.isBase || m.zipFile);
  const existingCatalogs = await listReferenceCatalogs();
  const existingIds = new Set(existingCatalogs.map(c => c.id));

  let html = '';
  basePresets.forEach(preset => {
    const isInstalled = existingIds.has(preset.id);
    const zipUrl = preset.zipFile || `data/${preset.zipName}`;
    const zipName = preset.zipName || preset.zipFile?.split('/').pop() || `${preset.id}.zip`;

    let icon = 'fa-building-columns';
    let gradient = 'from-blue-600 to-indigo-700';
    if (preset.id.includes('igi') || preset.name.includes('Ingeniería')) {
      icon = 'fa-bridge-water';
      gradient = 'from-emerald-600 to-teal-700';
    } else if (preset.id.includes('vivienda') || preset.name.includes('Vivienda')) {
      icon = 'fa-city';
      gradient = 'from-blue-600 to-cyan-700';
    } else if (preset.id.includes('residencial') || preset.name.includes('Residencial')) {
      icon = 'fa-house-chimney';
      gradient = 'from-purple-600 to-indigo-700';
    }

    html += `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col justify-between">
        <div class="p-4">
          <div class="flex items-start justify-between gap-3 mb-2">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center text-lg shadow-sm shrink-0">
              <i class="fa-solid ${icon}"></i>
            </div>
            <div class="text-right">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <i class="fa-solid fa-shield-halved text-[9px]"></i> 0 MB Cuota (Absorbido)
              </span>
              <span class="block text-[10px] text-slate-400 font-mono mt-0.5">${preset.itemsCount.toLocaleString()} conceptos / matrices</span>
            </div>
          </div>
          <h4 class="font-bold text-sm text-slate-900 leading-snug">${preset.name}</h4>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">${preset.description}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <i class="fa-solid fa-file-zipper text-amber-500"></i>
            <span class="font-mono text-[10px] font-semibold text-slate-700 truncate max-w-[220px]" title="${zipName}">${zipName}</span>
          </div>
        </div>

        <div class="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
          ${isInstalled ? `
            <span class="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-emerald-600"></i> Indexado en el Sistema
            </span>
            <span class="text-[10px] text-slate-400 font-medium">Disponible para búsqueda</span>
          ` : `
            <span class="text-xs text-slate-500 font-medium">Catálogo base listo</span>
            <button onclick="installPresetCatalog('${preset.id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer">
              <i class="fa-solid fa-cloud-arrow-down text-xs"></i> Indexar
            </button>
          `}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
