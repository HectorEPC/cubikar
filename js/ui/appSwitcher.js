// js/ui/appSwitcher.js
// Selector Unificado de Aplicaciones del Ecosistema Cubikar (Estilo Google Workspace Waffle 9-puntos)

import { appendSsoToUrlFromStorage } from '../core/ssoHelper.js';
import { getCurrentUser, getProjectsList, getDeletedProjectsList } from '../modules/portal/projectService.js';
import { getStorageKey, getSettingsKey } from '../config/constants.js';
import { getSupabaseClient } from '../core/supabaseClient.js';

function csvEsc(val) {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function flattenTreeToCsv(nodes, parentPath = '', out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const isConcept = n.type === 'concept' || !Array.isArray(n.children) || n.children.length === 0;
    if (isConcept && (n.code || n.clave || n.description || n.descripcion || n.title)) {
      const qty = Number(n.quantity ?? n.cantidad ?? 0);
      const pu = Number(n.unitPrice ?? n.precioUnitario ?? n.precio_unitario ?? 0);
      const imp = Number(n.total ?? n.importe ?? (qty * pu)) || 0;
      out.push([
        csvEsc(parentPath || n.partida || ''),
        csvEsc(n.code || n.clave || n.id || ''),
        csvEsc(n.description || n.descripcion || n.title || n.name || ''),
        csvEsc(n.unit || n.unidad || ''),
        qty.toFixed(4),
        pu.toFixed(4),
        imp.toFixed(2)
      ].join(','));
    }
    if (Array.isArray(n.children) && n.children.length > 0) {
      const lbl = n.code ? `${n.code} ${n.description || n.title || ''}`.trim() : (n.description || n.title || parentPath);
      flattenTreeToCsv(n.children, lbl, out);
    }
  }
  return out;
}

export async function exportProjectsBackupZip(appLabel = 'Construccion') {
  const JSZipRef = typeof window !== 'undefined' ? window.JSZip : undefined;
  if (!JSZipRef) {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast('Cargando librería de compresión ZIP. Intenta nuevamente en un momento.', 'warning');
    } else {
      alert('Cargando librería de compresión ZIP. Intenta nuevamente en un momento.');
    }
    return;
  }

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const cleanEmail = (user?.email || '').toLowerCase().trim();
  const safeCompany = (user?.company || user?.name || 'Usuario').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];

  const deletedIds = new Set(typeof getDeletedProjectsList === 'function' ? getDeletedProjectsList() : []);
  const allLocal = typeof getProjectsList === 'function' ? getProjectsList() : [];
  const projects = (Array.isArray(allLocal) ? allLocal : []).filter(p => {
    if (!p || !p.id || deletedIds.has(p.id) || (p.cloudId && deletedIds.has(p.cloudId))) return false;
    if (!cleanEmail) return true;
    return (p.ownerEmail || '').toLowerCase().trim() === cleanEmail ||
      (Array.isArray(p.members) && p.members.some(m => (m.email || '').toLowerCase().trim() === cleanEmail));
  });

  const zip = new JSZipRef();
  const root = zip.folder(`Cubikar_${appLabel}_${safeCompany}`);
  const summaryRows = ['ID,Nombre,Tipo_Obra,Empresa,Ubicacion,Moneda,Propietario,Creado'];
  const projectsDir = root.folder('Proyectos');

  for (const p of projects) {
    const slug = `${(p.projectName || p.id).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 45) || 'Proyecto'}_${String(p.id).slice(0, 8)}`;
    const pDir = projectsDir.folder(slug);
    summaryRows.push([
      csvEsc(p.id),
      csvEsc(p.projectName),
      csvEsc(p.tipoObra || ''),
      csvEsc(p.companyName || ''),
      csvEsc(p.projectLocation || ''),
      csvEsc(p.currency || 'MXN'),
      csvEsc(p.ownerEmail || cleanEmail),
      csvEsc(p.createdAt || '')
    ].join(','));

    pDir.file('metadata.json', JSON.stringify(p, null, 2));
    try {
      const sRaw = localStorage.getItem(getSettingsKey(p.id));
      const tRaw = localStorage.getItem(getStorageKey(p.id));
      const eRaw = localStorage.getItem(`estimaciones_data_${p.id}`);
      const cRaw = localStorage.getItem(`compras_data_${p.id}`);
      const bRaw = localStorage.getItem(`bitacora_data_${p.id}`);
      const crRaw = localStorage.getItem(`cronograma_data_${p.id}`);
      if (sRaw) pDir.file('configuracion.json', sRaw);
      if (eRaw) pDir.file('estimaciones.json', eRaw);
      if (cRaw) pDir.file('compras_gastos.json', cRaw);
      if (bRaw) pDir.file('bitacora.json', bRaw);
      if (crRaw) pDir.file('cronograma.json', crRaw);
      if (tRaw) {
        pDir.file('presupuesto_tree.json', tRaw);
        const csvLines = ['Partida,Clave,Descripcion,Unidad,Cantidad,Precio_Unitario,Importe'];
        flattenTreeToCsv(JSON.parse(tRaw), '', csvLines);
        pDir.file('catalogo_conceptos.csv', '\uFEFF' + csvLines.join('\n'));
      }
    } catch (_) {}
  }

  // Complementar si existen proyectos remotos adicionales en Supabase aún no cacheados localmente
  try {
    const sb = getSupabaseClient();
    if (sb && user?.id) {
      const { data: cloudProjs } = await sb.from('proyectos').select('*').order('updated_at', { ascending: false });
      const seen = new Set(projects.flatMap(p => [p.id, p.cloudId].filter(Boolean)));
      for (const cp of (cloudProjs || [])) {
        if (!cp?.id || seen.has(cp.id) || deletedIds.has(cp.id)) continue;
        const slug = `${(cp.nombre || cp.id).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().slice(0, 45) || 'Proyecto'}_${String(cp.id).slice(0, 8)}`;
        const pDir = projectsDir.folder(slug);
        summaryRows.push([
          csvEsc(cp.id),
          csvEsc(cp.nombre),
          csvEsc(cp.tipo_obra || ''),
          csvEsc(cp.configuracion?.companyName || ''),
          csvEsc(cp.ubicacion || ''),
          csvEsc(cp.moneda || 'MXN'),
          csvEsc(cp.owner_email || cleanEmail),
          csvEsc(cp.created_at || '')
        ].join(','));
        pDir.file('metadata.json', JSON.stringify(cp, null, 2));
        const { data: concepts } = await sb.from('catalogo_conceptos').select('*').eq('proyecto_id', cp.id);
        if (Array.isArray(concepts)) pDir.file('catalogo_conceptos.json', JSON.stringify(concepts, null, 2));
      }
    }
  } catch (_) {}

  root.file('resumen_proyectos.csv', '\uFEFF' + summaryRows.join('\n'));
  root.file(
    'LEEME_RESPALDO.txt',
    `RESPALDO CUBIKAR (${appLabel.toUpperCase()})\nFecha: ${new Date().toLocaleString()}\nUsuario: ${user?.name || 'Invitado'} (${cleanEmail || 'sin correo'})\nProyectos incluidos: ${summaryRows.length - 1}\n`
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Cubikar_${appLabel}_${safeCompany}_Respaldo_${dateStr}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(`Respaldo ZIP generado con ${summaryRows.length - 1} proyecto(s).`, 'success');
  }
}

if (typeof window !== 'undefined') {
  window.triggerDemoBackupDownload = () => exportProjectsBackupZip('Construccion');
}

export function initAppSwitcher(containerId = 'cubikar-app-switcher-mount', currentApp = 'portal') {
  if (typeof window !== 'undefined') {
    window.triggerDemoBackupDownload = () => exportProjectsBackupZip('Construccion');
  }
  const mount = document.getElementById(containerId);
  if (!mount) return;

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // URLs de destino según entorno
  const urls = {
    portal: isLocalhost ? (currentApp === 'portal' ? '#' : '../Cubikar/index.html') : 'https://cubikar.app/',
    const: isLocalhost ? (currentApp === 'const' ? '#' : '../ADM_CONST/index.html') : 'https://const.cubikar.app/',
    arq: isLocalhost ? (currentApp === 'arq' ? '#' : '../ADM_ARQ/index.html') : 'https://arq.cubikar.app/'
  };

  mount.innerHTML = `
    <div class="relative inline-block text-left" id="cubikar-app-switcher-wrapper">
      <button type="button" id="cubikar-app-switcher-btn" 
              class="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 transition flex items-center justify-center cursor-pointer shadow-xs"
              title="Ecosistema Cubikar (Cambiar de Aplicación)">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2.2" />
          <circle cx="12" cy="5" r="2.2" />
          <circle cx="19" cy="5" r="2.2" />
          <circle cx="5" cy="12" r="2.2" />
          <circle cx="12" cy="12" r="2.2" />
          <circle cx="19" cy="12" r="2.2" />
          <circle cx="5" cy="19" r="2.2" />
          <circle cx="12" cy="19" r="2.2" />
          <circle cx="19" cy="19" r="2.2" />
        </svg>
      </button>

      <!-- Popover Desplegable -->
      <div id="cubikar-app-switcher-menu" 
           style="z-index: 100005;"
           class="hidden absolute right-0 top-full mt-2 w-72 sm:w-80 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-3 z-50 text-slate-100 animate-in fade-in zoom-in-95 duration-100">
        
        <div class="px-3 py-2 border-b border-slate-800 flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <img src="assets/branding/cubikar_icon_transparent.png" alt="cubikar" class="w-5 h-5 object-contain">
            <span class="text-xs font-bold text-white uppercase tracking-wider font-sans">Ecosistema Cubikar</span>
          </div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">SSO Activo</span>
        </div>

        <div class="space-y-1.5">
          <!-- 1. CUBIKAR CONSTRUCCIÓN -->
          <a href="${urls.const}" 
             data-cubikar-sso-link="const"
             data-base-href="${urls.const}"
             class="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-800/80 transition ${currentApp === 'const' ? 'bg-amber-500/10 border border-amber-500/30' : 'border border-transparent'}">
            <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-helmet-safety text-base"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white">Cubikar Construcción</span>
                ${currentApp === 'const' ? '<span class="text-[9px] font-black text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">EN USO</span>' : ''}
              </div>
              <p class="text-[10.5px] text-slate-400 truncate">Obras, Matrices APU y Bitácora Legal</p>
            </div>
          </a>

          <!-- 2. CUBIKAR ARQUITECTURA -->
          <a href="${urls.arq}" 
             data-cubikar-sso-link="arq"
             data-base-href="${urls.arq}"
             class="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-800/80 transition ${currentApp === 'arq' ? 'bg-blue-500/10 border border-blue-500/30' : 'border border-transparent'}">
            <div class="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/40 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-compass-drafting text-base"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white">Cubikar Arquitectura</span>
                ${currentApp === 'arq' ? '<span class="text-[9px] font-black text-blue-400 bg-blue-500/20 px-1.5 py-0.5 rounded">EN USO</span>' : ''}
              </div>
              <p class="text-[10.5px] text-slate-400 truncate">Proyectos Ejecutivos y Honorarios</p>
            </div>
          </a>

          <!-- 3. PORTAL CENTRAL -->
          <a href="${urls.portal}" 
             data-cubikar-sso-link="portal"
             data-base-href="${urls.portal}"
             class="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-800/80 transition ${currentApp === 'portal' ? 'bg-slate-800 border border-slate-700' : 'border border-transparent'}">
            <div class="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center text-lg shrink-0">
              <i class="fa-solid fa-globe text-base"></i>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white">Portal &amp; Facturación</span>
                ${currentApp === 'portal' ? '<span class="text-[9px] font-black text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded">ACTUAL</span>' : ''}
              </div>
              <p class="text-[10.5px] text-slate-400 truncate">Planes, Suscripciones y Mi Cuenta</p>
            </div>
          </a>
        </div>

        <!-- Botón Rápido de Respaldo -->
        <div class="mt-2 pt-2 border-t border-slate-800">
          <button type="button" onclick="window.triggerDemoBackupDownload && window.triggerDemoBackupDownload()" 
                  class="w-full py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold flex items-center justify-center gap-2 transition cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span>Descargar Respaldo Completo (.zip)</span>
          </button>
        </div>

      </div>
    </div>
  `;

  // Manejo de eventos abrir / cerrar
  const btn = document.getElementById('cubikar-app-switcher-btn');
  const menu = document.getElementById('cubikar-app-switcher-menu');

  if (btn && menu) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });

    menu.querySelectorAll('[data-cubikar-sso-link]').forEach((link) => {
      const targetApp = link.getAttribute('data-cubikar-sso-link');
      const baseHref = link.getAttribute('data-base-href') || link.getAttribute('href');
      const refreshSsoHref = () => {
        if (!targetApp || targetApp === currentApp || !baseHref || baseHref === '#') return;
        link.setAttribute('href', appendSsoToUrlFromStorage(baseHref));
      };
      link.addEventListener('pointerdown', refreshSsoHref);
      link.addEventListener('click', (e) => {
        if (targetApp === currentApp) {
          e.preventDefault();
          menu.classList.add('hidden');
          return;
        }
        refreshSsoHref();
      });
    });

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.add('hidden');
      }
    });
  }
}
