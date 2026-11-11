// js/core/cloudProjectService.js
// Servicio de persistencia y sincronización de Proyectos y Presupuestos con Supabase PostgreSQL
// Diseñado para operar en segundo plano con alta resiliencia y respaldo offline.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { getCurrentUser, saveCurrentUser } from '../modules/portal/projectService.js';
import { fetchUserProfile } from './authService.js';
import { showToast } from '../ui/notifications.js';

export function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str.trim());
}

export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Obtener o resolver la empresa_id del usuario conectado
 */
export async function resolveUserEmpresaId(sb, user) {
  if (!user || !user.id) return null;
  if (user.empresaId && isValidUUID(user.empresaId)) {
    return user.empresaId;
  }

  try {
    const { data: perfil } = await sb
      .from('perfiles')
      .select('id, empresa_id')
      .eq('id', user.id)
      .maybeSingle();

    if (perfil?.empresa_id && isValidUUID(perfil.empresa_id)) {
      user.empresaId = perfil.empresa_id;
      return perfil.empresa_id;
    }

    // Si aún no tiene empresa asignada (ej. si el trigger se demoró), crear una por defecto
    const { data: newEmpresa, error: empErr } = await sb
      .from('empresas')
      .insert({
        nombre: (user.name || user.email || 'Mi Empresa') + ' - Constructora',
        plan: 'free',
        estado_suscripcion: 'trialing'
      })
      .select('id')
      .single();

    if (!empErr && newEmpresa?.id) {
      user.empresaId = newEmpresa.id;
      await sb.from('perfiles').upsert({
        id: user.id,
        empresa_id: newEmpresa.id,
        nombre_completo: user.name || user.email,
        email: user.email,
        rol: 'owner'
      });
      return newEmpresa.id;
    }
  } catch (err) {
    console.warn('[CloudProjectService] Error resolviendo empresa_id:', err);
  }

  return null;
}

/**
 * Sincronizar un proyecto completo (datos generales y catálogo de conceptos) hacia Supabase
 */
export async function syncProjectToCloud(project, settings = {}, treeData = null) {
  const sb = getSupabaseClient();
  let user = getCurrentUser();

  if (!isSupabaseConfigured() || !sb) {
    return { success: false, reason: 'Supabase no está configurado' };
  }

  // Si el usuario local no tiene un UUID válido, intentar obtener el usuario autenticado real de Supabase
  if (!user || !isValidUUID(user.id)) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        const perfil = await fetchUserProfile(session.user.id);
        user = {
          id: session.user.id,
          empresaId: perfil?.empresa_id || null,
          name: perfil?.nombre_completo || session.user.user_metadata?.full_name || session.user.email,
          email: session.user.email,
          avatar: perfil?.avatar_url || ''
        };
        saveCurrentUser(user);
      }
    } catch (_) {}
  }

  if (!user?.id || !isValidUUID(user.id)) {
    return { success: false, reason: 'Sin sesión activa en Supabase. Inicia sesión con tu correo y contraseña.' };
  }

  try {
    const empresaId = await resolveUserEmpresaId(sb, user);
    if (!empresaId) {
      return { success: false, reason: 'No se pudo vincular la empresa en la base de datos' };
    }

    // Asegurar UUID válido para PostgreSQL
    const projectId = isValidUUID(project.id) ? project.id : (project.cloudId && isValidUUID(project.cloudId) ? project.cloudId : generateUUID());
    project.cloudId = projectId;

    // 1. Guardar / Actualizar en tabla 'public.proyectos'
    const projectRecord = {
      id: projectId,
      empresa_id: empresaId,
      clave: (project.clave || project.id || '').slice(0, 50),
      nombre: project.projectName || 'Proyecto sin título',
      cliente: project.client || '',
      ubicacion: project.projectLocation || '',
      moneda: project.currency || settings?.currency || 'MXN',
      simbolo_moneda: project.currencySymbol || settings?.currencySymbol || '$',
      aplica_sobrecosto: Boolean(settings?.applySobrecosto ?? project.applySobrecosto),
      pct_indirectos: Number(settings?.pctIndirectos ?? project.pctIndirectos) || 0,
      pct_financiamiento: Number(settings?.pctFinanciamiento ?? project.pctFinanciamiento) || 0,
      pct_utilidad: Number(settings?.pctUtilidad ?? project.pctUtilidad) || 0,
      pct_adicionales: Number(settings?.pctAdicionales ?? project.pctAdicionales) || 0,
      pct_seguros_fianzas: Number(settings?.pctSegurosFianzas ?? project.pctSegurosFianzas ?? 1.0) || 0,
      pct_fasar: Number(settings?.pctFasar ?? project.pctFasar ?? 70.0) || 0,
      anticipo_pct: Number(settings?.anticipoPct ?? 30.0),
      iva_pct: Number(settings?.ivaPct ?? 16.0),
      creado_por: user.id,
      updated_at: new Date().toISOString()
    };

    const { error: projError } = await sb
      .from('proyectos')
      .upsert(projectRecord, { onConflict: 'id' });

    if (projError) {
      console.warn('[CloudProjectService] Error al guardar proyecto en Supabase:', projError.message);
      return { success: false, error: projError };
    }

    // 2. Si se proporcionó el árbol del catálogo, sincronizar partidas, conceptos e insumos
    if (Array.isArray(treeData) && treeData.length > 0) {
      await syncCatalogTreeToCloud(sb, projectId, treeData);
    }

    return { success: true, projectId };
  } catch (err) {
    console.error('[CloudProjectService] Excepción al sincronizar proyecto con la nube:', err);
    return { success: false, error: err };
  }
}

/**
 * Aplanar y sincronizar el árbol jerárquico a 'public.catalogo_conceptos' y 'public.insumos_apu'
 */
export async function syncCatalogTreeToCloud(sb, projectId, treeData) {
  if (!sb || !projectId || !Array.isArray(treeData)) return;

  const flatConcepts = [];
  const flatInsumos = [];

  function walk(nodes, parentId = null, depth = 1) {
    nodes.forEach((n, idx) => {
      const conceptId = (n.uuid && isValidUUID(n.uuid)) ? n.uuid : (isValidUUID(n.id) ? n.id : generateUUID());
      n.uuid = conceptId;

      const isParent = Array.isArray(n.children) && n.children.length > 0;
      let tipo = 'concepto';
      if (isParent) {
        tipo = depth === 1 ? 'partida' : 'subpartida';
      }

      flatConcepts.push({
        id: conceptId,
        proyecto_id: projectId,
        parent_id: parentId,
        tipo: tipo,
        clave: String(n.clave || `C-${idx + 1}`).slice(0, 50),
        descripcion: n.descripcion || '',
        unidad: String(n.unidad || (isParent ? 'lote' : 'pza')).slice(0, 30),
        cantidad: Number(n.cantidad) || 0,
        precio_unitario: Number(n.precioUnitario) || 0,
        costo_directo: Number(n.costoDirecto) || 0,
        color: n.color || null,
        orden: idx,
        expanded: n.expanded !== false,
        selected: n.selected !== false,
        updated_at: new Date().toISOString()
      });

      // Procesar insumos de la matriz APU
      if (Array.isArray(n.insumos) && n.insumos.length > 0) {
        n.insumos.forEach((ins, insIdx) => {
          const insumoId = (ins.uuid && isValidUUID(ins.uuid)) ? ins.uuid : (isValidUUID(ins.id) ? ins.id : generateUUID());
          ins.uuid = insumoId;

          // Mapear al constraint CHECK ('Material', 'Mano de Obra', 'Equipo', 'Subcontrato')
          let cleanTipo = ins.tipo || 'Material';
          if (cleanTipo === 'Herramienta' || cleanTipo === 'Maquinaria') {
            cleanTipo = 'Equipo';
          }
          if (!['Material', 'Mano de Obra', 'Equipo', 'Subcontrato'].includes(cleanTipo)) {
            cleanTipo = 'Material';
          }

          flatInsumos.push({
            id: insumoId,
            concepto_id: conceptId,
            tipo: cleanTipo,
            clave: String(ins.clave || `INS-${insIdx + 1}`).slice(0, 50),
            descripcion: ins.descripcion || '',
            unidad: String(ins.unidad || 'pza').slice(0, 30),
            cantidad: Number(ins.cantidad) || 0,
            costo_unitario: Number(ins.costoUnitario) || 0,
            orden: insIdx,
            updated_at: new Date().toISOString()
          });
        });
      }

      if (isParent) {
        walk(n.children, conceptId, depth + 1);
      }
    });
  }

  walk(treeData);

  // Guardar conceptos en lotes de 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < flatConcepts.length; i += BATCH_SIZE) {
    const chunk = flatConcepts.slice(i, i + BATCH_SIZE);
    const { error: cErr } = await sb
      .from('catalogo_conceptos')
      .upsert(chunk, { onConflict: 'id' });
    if (cErr) {
      console.warn('[CloudProjectService] Aviso al sincronizar lote de conceptos:', cErr.message);
    }
  }

  // Guardar insumos en lotes de 100
  for (let i = 0; i < flatInsumos.length; i += BATCH_SIZE) {
    const chunk = flatInsumos.slice(i, i + BATCH_SIZE);
    const { error: insErr } = await sb
      .from('insumos_apu')
      .upsert(chunk, { onConflict: 'id' });
    if (insErr) {
      console.warn('[CloudProjectService] Aviso al sincronizar lote de insumos:', insErr.message);
    }
  }
}

/**
 * Consultar los proyectos disponibles en Supabase para la empresa del usuario
 */
export async function fetchCloudProjects() {
  const sb = getSupabaseClient();
  const user = getCurrentUser();

  if (!isSupabaseConfigured() || !sb || !user?.id) {
    return [];
  }

  try {
    const empresaId = await resolveUserEmpresaId(sb, user);
    if (!empresaId) return [];

    const { data: cloudList, error } = await sb
      .from('proyectos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[CloudProjectService] Error al obtener proyectos de la nube:', error.message);
      return [];
    }

    if (!Array.isArray(cloudList)) return [];

    return cloudList.map(cp => {
      const ind = parseFloat(cp.pct_indirectos) || 0;
      const fin = parseFloat(cp.pct_financiamiento) || 0;
      const uti = parseFloat(cp.pct_utilidad) || 0;
      const adi = parseFloat(cp.pct_adicionales) || 0;
      const seg = parseFloat(cp.pct_seguros_fianzas ?? 1.0) || 0;
      const f = cp.aplica_sobrecosto
        ? (1 + ind / 100) * (1 + fin / 100) * (1 + uti / 100) * (1 + adi / 100) * (1 + seg / 100)
        : 1.0;

      let existingProj = null;
      try {
        const rawList = localStorage.getItem('control_obra_projects_v1');
        if (rawList) {
          const parsed = JSON.parse(rawList);
          existingProj = parsed.find(p => p.id === cp.id || p.cloudId === cp.id);
        }
      } catch (_) {}

      const restoredMembers = (existingProj && Array.isArray(existingProj.members) && existingProj.members.length > 0)
        ? existingProj.members
        : [
            {
              id: 'mem-' + user.id,
              name: user.name || user.email,
              email: user.email,
              avatar: user.avatar || '',
              role: 'editar',
              allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones', 'compras']
            }
          ];

      return {
        id: cp.id,
        cloudId: cp.id,
        isCloudSynced: true,
        projectName: cp.nombre,
        companyName: existingProj?.companyName || user.name || 'Mi Constructora',
        ownerEmail: existingProj?.ownerEmail || (cp.creado_por === user.id ? user.email : user.email),
        ownerName: existingProj?.ownerName || user.name || 'Anfitrión',
        ownerPlanId: existingProj?.ownerPlanId || user.plan || 'free',
        projectLocation: cp.ubicacion || '',
        currency: cp.moneda || 'MXN',
        currencySymbol: cp.simbolo_moneda || '$',
        applySobrecosto: cp.aplica_sobrecosto,
        pctIndirectos: ind,
        pctFinanciamiento: fin,
        pctUtilidad: uti,
        pctAdicionales: adi,
        pctSegurosFianzas: seg,
        pctFasar: Number(cp.pct_fasar ?? 70.0),
        factorSobrecosto: f,
        createdAt: cp.created_at ? cp.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
        members: restoredMembers
      };
    });
  } catch (err) {
    console.error('[CloudProjectService] Excepción al consultar proyectos en la nube:', err);
    return [];
  }
}

/**
 * Descargar y reconstruir el árbol de catálogo desde Supabase
 */
export async function loadProjectTreeFromCloud(projectId) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId) return null;

  try {
    // 1. Obtener conceptos
    const { data: concepts, error: cErr } = await sb
      .from('catalogo_conceptos')
      .select('*')
      .eq('proyecto_id', projectId)
      .order('orden', { ascending: true });

    if (cErr || !Array.isArray(concepts) || concepts.length === 0) {
      return null;
    }

    // 2. Obtener insumos de todos los conceptos de esta obra
    const conceptIds = concepts.map(c => c.id);
    const { data: insumos } = await sb
      .from('insumos_apu')
      .select('*')
      .in('concepto_id', conceptIds)
      .order('orden', { ascending: true });

    // 3. Mapear conceptos
    const map = new Map();
    const roots = [];

    concepts.forEach(c => {
      const node = {
        id: c.id,
        uuid: c.id,
        clave: c.clave,
        descripcion: c.descripcion,
        unidad: c.unidad,
        cantidad: Number(c.cantidad) || 0,
        precioUnitario: Number(c.precio_unitario) || 0,
        costoDirecto: Number(c.costo_directo) || 0,
        color: c.color || null,
        expanded: c.expanded !== false,
        selected: c.selected !== false,
        insumos: [],
        children: []
      };
      map.set(c.id, node);
    });

    // 4. Adjuntar insumos a sus conceptos
    if (Array.isArray(insumos)) {
      insumos.forEach(ins => {
        const parentNode = map.get(ins.concepto_id);
        if (parentNode) {
          parentNode.insumos.push({
            id: ins.id,
            uuid: ins.id,
            tipo: ins.tipo,
            clave: ins.clave,
            descripcion: ins.descripcion,
            unidad: ins.unidad,
            cantidad: Number(ins.cantidad) || 0,
            costoUnitario: Number(ins.costo_unitario) || 0
          });
        }
      });
    }

    // 5. Reconstruir la jerarquía de árbol
    concepts.forEach(c => {
      const node = map.get(c.id);
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  } catch (err) {
    console.error('[CloudProjectService] Excepción al descargar árbol de conceptos:', err);
    return null;
  }
}

/**
 * Eliminar un proyecto en la nube
 */
export async function deleteProjectFromCloud(projectId) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId) return;

  try {
    await sb.from('proyectos').delete().eq('id', projectId);
  } catch (err) {
    console.warn('[CloudProjectService] Error al eliminar proyecto en la nube:', err);
  }
}
