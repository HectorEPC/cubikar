// js/core/cloudProjectService.js
// Servicio de persistencia y sincronización de Proyectos y Presupuestos con Supabase PostgreSQL
// Diseñado para operar en segundo plano con alta resiliencia y sincronización multiusuario en la nube.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js';
import { getCurrentUser, saveCurrentUser } from '../modules/portal/projectService.js';
import { fetchUserProfile, resolveUserDisplayName, resolveUserRoleLabel, buildFallbackAvatarSvg } from './authService.js?v=20261114_07';
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

    // Si aún no tiene empresa asignada, crear una por defecto
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
 * Sincronizar un proyecto completo (datos generales, colaboradores y catálogo de conceptos) hacia Supabase PostgreSQL
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
        const existingLocal = user;
        const perfil = await fetchUserProfile(session.user.id);
        const resolvedName = resolveUserDisplayName({ perfil, authUser: session.user, existingUser: existingLocal });
        const resolvedRole = perfil?.rol || existingLocal?.role || 'admin';
        const resolvedAvatar = perfil?.avatar_url || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture || existingLocal?.avatar || buildFallbackAvatarSvg(resolvedName, session.user.email);
        user = {
          ...(existingLocal || {}),
          id: session.user.id,
          empresaId: perfil?.empresa_id || existingLocal?.empresaId || null,
          name: resolvedName,
          email: session.user.email,
          avatar: resolvedAvatar,
          role: resolvedRole,
          roleLabel: resolveUserRoleLabel({ roleLabel: existingLocal?.roleLabel, role: resolvedRole, isAuthenticated: true }),
          user_metadata: session.user.user_metadata ? { ...session.user.user_metadata } : (existingLocal?.user_metadata || {})
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

    // Asegurar UUID válido para PostgreSQL
    const projectId = isValidUUID(project.id) ? project.id : (project.cloudId && isValidUUID(project.cloudId) ? project.cloudId : generateUUID());
    project.cloudId = projectId;

    const ownerEmail = (project.ownerEmail || user.email || '').toLowerCase().trim();

    // 1. Guardar / Actualizar en tabla 'public.proyectos'
    const projectRecord = {
      id: projectId,
      empresa_id: empresaId || null,
      owner_email: ownerEmail,
      creado_por: user.id,
      clave: (project.clave || project.id || '').slice(0, 50),
      nombre: project.projectName || 'Proyecto sin título',
      cliente: project.client || '',
      ubicacion: project.projectLocation || '',
      tipo_obra: project.tipoObra || 'Edificación',
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
      configuracion: {
        ...(settings || {}),
        companyName: project.companyName || '',
        budgetSignatures: project.budgetSignatures || settings?.budgetSignatures || []
      },
      updated_at: new Date().toISOString()
    };

    const { error: projError } = await sb
      .from('proyectos')
      .upsert(projectRecord, { onConflict: 'id' });

    if (projError) {
      console.warn('[CloudProjectService] Error al guardar proyecto en Supabase:', projError.message);
      return { success: false, error: projError };
    }

    // 2. Registrar al propietario en 'public.proyecto_colaboradores' (garantiza acceso multiusuario)
    const ownerColab = {
      proyecto_id: projectId,
      email_colaborador: ownerEmail,
      nombre_colaborador: project.ownerName || user.name || 'Propietario',
      rol: 'owner',
      estado_invitacion: 'accepted',
      updated_at: new Date().toISOString()
    };
    await sb
      .from('proyecto_colaboradores')
      .upsert(ownerColab, { onConflict: 'proyecto_id,email_colaborador' });

    // 3. Sincronizar todos los colaboradores registrados en el proyecto
    if (Array.isArray(project.members) && project.members.length > 0) {
      for (const m of project.members) {
        const mEmail = (m.email || '').toLowerCase().trim();
        if (mEmail && mEmail !== ownerEmail) {
          const mRecord = {
            proyecto_id: projectId,
            email_colaborador: mEmail,
            nombre_colaborador: m.name || mEmail.split('@')[0],
            rol: m.role || 'editar',
            estado_invitacion: m.status === 'pending' ? 'pending' : 'accepted',
            updated_at: new Date().toISOString()
          };
          try {
            await sb
              .from('proyecto_colaboradores')
              .upsert(mRecord, { onConflict: 'proyecto_id,email_colaborador' });
          } catch (cErr) {
            console.warn('[CloudProjectService] Aviso upsert colaborador:', cErr);
          }
        }
      }
    }

    // 4. Si se proporcionó el árbol del catálogo, sincronizar partidas, conceptos e insumos
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
        insumos: Array.isArray(n.insumos) ? n.insumos : [],
        updated_at: new Date().toISOString()
      });

      // Procesar insumos de la matriz APU para compatibilidad relacional
      if (Array.isArray(n.insumos) && n.insumos.length > 0) {
        n.insumos.forEach((ins, insIdx) => {
          const insumoId = (ins.uuid && isValidUUID(ins.uuid)) ? ins.uuid : (isValidUUID(ins.id) ? ins.id : generateUUID());
          ins.uuid = insumoId;

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
 * Consultar los proyectos disponibles en Supabase para el usuario actual.
 * Utiliza RLS en PostgreSQL: devuelve todos los proyectos donde el usuario es
 * Propietario (owner_email) O Colaborador Invitado (proyecto_colaboradores).
 */
export async function fetchCloudProjects() {
  const sb = getSupabaseClient();
  const user = getCurrentUser();

  if (!isSupabaseConfigured() || !sb || !user?.id) {
    return [];
  }

  try {
    const myEmail = (user.email || '').toLowerCase().trim();

    // Consulta con join a proyecto_colaboradores (sin filtro por empresa_id para permitir colaboración inter-cuentas)
    const { data: cloudList, error } = await sb
      .from('proyectos')
      .select('*, proyecto_colaboradores(*)')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[CloudProjectService] Error al obtener proyectos de la nube:', error.message);
      return [];
    }

    if (!Array.isArray(cloudList)) return [];

    let deletedList = [];
    try {
      if (typeof localStorage !== 'undefined') {
        const rawDel = localStorage.getItem('cubikar_deleted_projects_v1');
        if (rawDel) deletedList = JSON.parse(rawDel);
      }
    } catch (_) {}
    const isDeleted = (id) => Array.isArray(deletedList) && deletedList.includes(id);

    return cloudList
      .filter(cp => !isDeleted(cp.id))
      .map(cp => {
        const ind = parseFloat(cp.pct_indirectos) || 0;
        const fin = parseFloat(cp.pct_financiamiento) || 0;
        const uti = parseFloat(cp.pct_utilidad) || 0;
        const adi = parseFloat(cp.pct_adicionales) || 0;
        const seg = parseFloat(cp.pct_seguros_fianzas ?? 1.0) || 0;
        const f = cp.aplica_sobrecosto
          ? (1 + ind / 100) * (1 + fin / 100) * (1 + uti / 100) * (1 + adi / 100) * (1 + seg / 100)
          : 1.0;

        const rawColabs = Array.isArray(cp.proyecto_colaboradores) ? cp.proyecto_colaboradores : [];
        const reconstructedMembers = rawColabs.map(c => ({
          id: c.id,
          name: c.nombre_colaborador || c.email_colaborador.split('@')[0],
          email: (c.email_colaborador || '').toLowerCase().trim(),
          role: c.rol || 'editar',
          status: c.estado_invitacion || 'accepted',
          allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora']
        }));

        const ownerColab = rawColabs.find(c => c.rol === 'owner');
        const ownerEmail = (cp.owner_email || ownerColab?.email_colaborador || user.email || '').toLowerCase().trim();
        const ownerName = ownerColab?.nombre_colaborador || (ownerEmail === myEmail ? (user.name || 'Propietario') : ownerEmail.split('@')[0]);

        const cfg = (cp.configuracion && typeof cp.configuracion === 'object') ? cp.configuracion : {};

        return {
          id: cp.id,
          cloudId: cp.id,
          isCloudSynced: true,
          projectName: cp.nombre,
          companyName: cfg.companyName || cp.cliente || 'Constructora',
          ownerEmail: ownerEmail,
          ownerName: ownerName,
          ownerPlanId: 'pro',
          projectLocation: cp.ubicacion || '',
          tipoObra: cp.tipo_obra || 'Edificación',
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
          budgetSignatures: cfg.budgetSignatures || [],
          createdAt: cp.created_at ? cp.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          updatedAt: cp.updated_at || new Date().toISOString(),
          members: reconstructedMembers.length > 0 ? reconstructedMembers : [
            {
              id: 'mem-' + user.id,
              name: user.name || user.email,
              email: myEmail,
              role: ownerEmail === myEmail ? 'owner' : 'editar',
              status: 'accepted',
              allowedTabs: ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora']
            }
          ]
        };
      });
  } catch (err) {
    console.error('[CloudProjectService] Excepción al consultar proyectos en la nube:', err);
    return [];
  }
}

/**
 * Descargar y reconstruir el árbol de catálogo desde Supabase PostgreSQL
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

    // 2. Si los conceptos no traen su insumos JSONB poblado, consultar insumos_apu relacional
    let insumosMap = new Map();
    const needsSeparateInsumos = concepts.some(c => !Array.isArray(c.insumos) || c.insumos.length === 0);

    if (needsSeparateInsumos) {
      const conceptIds = concepts.map(c => c.id);
      const { data: insumos } = await sb
        .from('insumos_apu')
        .select('*')
        .in('concepto_id', conceptIds)
        .order('orden', { ascending: true });

      if (Array.isArray(insumos)) {
        insumos.forEach(ins => {
          if (!insumosMap.has(ins.concepto_id)) insumosMap.set(ins.concepto_id, []);
          insumosMap.get(ins.concepto_id).push({
            id: ins.id,
            uuid: ins.id,
            tipo: ins.tipo,
            clave: ins.clave,
            descripcion: ins.descripcion,
            unidad: ins.unidad,
            cantidad: Number(ins.cantidad) || 0,
            costoUnitario: Number(ins.costo_unitario) || 0
          });
        });
      }
    }

    // 3. Mapear conceptos
    const map = new Map();
    const roots = [];

    concepts.forEach(c => {
      const cInsumos = (Array.isArray(c.insumos) && c.insumos.length > 0)
        ? c.insumos
        : (insumosMap.get(c.id) || []);

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
        insumos: cInsumos,
        children: []
      };
      map.set(c.id, node);
    });

    // 4. Reconstruir la jerarquía de árbol
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
 * Registrar o actualizar un colaborador en la nube
 */
export async function addCollaboratorToCloud(projectId, email, role = 'editar', status = 'accepted') {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId || !email) return { success: false };

  try {
    const cleanEmail = email.toLowerCase().trim();
    const record = {
      proyecto_id: projectId,
      email_colaborador: cleanEmail,
      nombre_colaborador: cleanEmail.split('@')[0],
      rol: role,
      estado_invitacion: status,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
      .from('proyecto_colaboradores')
      .upsert(record, { onConflict: 'proyecto_id,email_colaborador' })
      .select()
      .single();

    if (error) {
      console.warn('[CloudProjectService] Error agregando colaborador en la nube:', error.message);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error('[CloudProjectService] Excepción agregando colaborador:', err);
    return { success: false, error: err };
  }
}

/**
 * Eliminar un colaborador de un proyecto en la nube
 */
export async function removeCollaboratorFromCloud(projectId, email) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId || !email) return;

  try {
    await sb
      .from('proyecto_colaboradores')
      .delete()
      .eq('proyecto_id', projectId)
      .eq('email_colaborador', email.toLowerCase().trim());
  } catch (err) {
    console.warn('[CloudProjectService] Error removiendo colaborador en la nube:', err);
  }
}

/**
 * Actualizar una celda o concepto específico en Supabase (Persistencia de edición granular en vivo)
 */
export async function updateCloudConcept(projectId, patchOrConcept) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId || !patchOrConcept) return;

  try {
    if (patchOrConcept.type === 'update_field' && patchOrConcept.id) {
      const fieldMap = {
        cantidad: 'cantidad',
        precioUnitario: 'precio_unitario',
        costoDirecto: 'costo_directo',
        descripcion: 'descripcion',
        clave: 'clave',
        unidad: 'unidad',
        color: 'color'
      };
      const dbField = fieldMap[patchOrConcept.field];
      if (dbField) {
        await sb
          .from('catalogo_conceptos')
          .update({ [dbField]: patchOrConcept.value, updated_at: new Date().toISOString() })
          .eq('id', patchOrConcept.id)
          .eq('proyecto_id', projectId);
      }
    } else if (patchOrConcept.id) {
      await sb
        .from('catalogo_conceptos')
        .upsert({
          id: patchOrConcept.id,
          proyecto_id: projectId,
          clave: patchOrConcept.clave || '',
          descripcion: patchOrConcept.descripcion || '',
          unidad: patchOrConcept.unidad || 'pza',
          cantidad: Number(patchOrConcept.cantidad) || 0,
          precio_unitario: Number(patchOrConcept.precioUnitario) || 0,
          costo_directo: Number(patchOrConcept.costoDirecto) || 0,
          color: patchOrConcept.color || null,
          insumos: Array.isArray(patchOrConcept.insumos) ? patchOrConcept.insumos : [],
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('[CloudProjectService] Error al actualizar concepto en Supabase:', err);
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

if (typeof window !== 'undefined') {
  window.syncProjectToCloud = syncProjectToCloud;
  window.fetchCloudProjects = fetchCloudProjects;
  window.loadProjectTreeFromCloud = loadProjectTreeFromCloud;
  window.addCollaboratorToCloud = addCollaboratorToCloud;
  window.removeCollaboratorFromCloud = removeCollaboratorFromCloud;
  window.updateCloudConcept = updateCloudConcept;
  window.deleteProjectFromCloud = deleteProjectFromCloud;
}
