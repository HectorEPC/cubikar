// js/core/cloudProjectService.js
// Servicio de persistencia y sincronización de Proyectos y Presupuestos con Supabase PostgreSQL
// Diseñado para operar en segundo plano con alta resiliencia y sincronización multiusuario en la nube.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient.js?v=20261116_cf11';
import { getCurrentUser, saveCurrentUser, getProjectsList, getUserPlanId } from '../modules/portal/projectService.js?v=20261116_cf11';
import { fetchUserProfile, resolveUserDisplayName, resolveUserRoleLabel, buildFallbackAvatarSvg } from './authService.js?v=20261116_cf11';
import { showToast } from '../ui/notifications.js?v=20261116_cf11';

export function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str.trim());
}

export function resolveCloudProjectId(projectId) {
  const raw = String(projectId || '').trim();
  if (!raw) return '';
  if (isValidUUID(raw)) return raw;
  try {
    const list = typeof getProjectsList === 'function' ? getProjectsList() : [];
    const found = Array.isArray(list) ? list.find(p => p && (p.id === raw || p.cloudId === raw)) : null;
    if (found?.cloudId && isValidUUID(found.cloudId)) return found.cloudId;
    if (found?.id && isValidUUID(found.id)) return found.id;
  } catch (_) {}
  return '';
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

function collectNodeFlagUuids(nodes, predicate, out = []) {
  if (!Array.isArray(nodes)) return out;
  for (const n of nodes) {
    if (!n) continue;
    const isParent = Array.isArray(n.children) && n.children.length > 0;
    if (!isParent && predicate(n)) {
      const uid = (n.uuid && isValidUUID(n.uuid)) ? n.uuid : (isValidUUID(n.id) ? n.id : null);
      if (uid) out.push(uid);
    }
    if (isParent) collectNodeFlagUuids(n.children, predicate, out);
  }
  return out;
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

    // Asegurar UUID válido para PostgreSQL y bloquear si está marcado como eliminado
    const projectId = isValidUUID(project.id) ? project.id : (project.cloudId && isValidUUID(project.cloudId) ? project.cloudId : generateUUID());
    try {
      const rawDel = typeof localStorage !== 'undefined' ? localStorage.getItem('cubikar_deleted_projects_v1') : null;
      const delList = rawDel ? JSON.parse(rawDel) : [];
      if (Array.isArray(delList) && (delList.includes(project.id) || delList.includes(projectId))) {
        return { success: false, reason: 'Proyecto eliminado' };
      }
    } catch (_) {}
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
      configuracion: (() => {
        const safeSettings = { ...((settings && typeof settings === 'object') ? settings : {}) };
        delete safeSettings.apiKey;
        const clearedMatrixIds = Array.isArray(treeData)
          ? collectNodeFlagUuids(treeData, (n) => Boolean(n?.userClearedMatrix))
          : (Array.isArray(safeSettings.clearedMatrixIds) ? safeSettings.clearedMatrixIds : []);
        const customizedMatrixIds = Array.isArray(treeData)
          ? collectNodeFlagUuids(treeData, (n) => Boolean(n?.isMatrixCustomized))
          : (Array.isArray(safeSettings.customizedMatrixIds) ? safeSettings.customizedMatrixIds : []);
        return {
          ...safeSettings,
          clearedMatrixIds,
          customizedMatrixIds,
          companyName: project.companyName || '',
          budgetSignatures: project.budgetSignatures || settings?.budgetSignatures || [],
          memberTabs: Array.isArray(project.members)
            ? project.members.reduce((acc, m) => {
                const em = (m?.email || '').toLowerCase().trim();
                if (em && Array.isArray(m.allowedTabs)) acc[em] = m.allowedTabs;
                return acc;
              }, { ...((safeSettings && safeSettings.memberTabs) || {}) })
            : ((safeSettings && safeSettings.memberTabs) || {})
        };
      })(),
      updated_at: new Date().toISOString()
    };

    const { error: projError } = await sb
      .from('proyectos')
      .upsert(projectRecord, { onConflict: 'id' });

    if (projError) {
      console.warn('[CloudProjectService] Error al guardar proyecto en Supabase:', projError.message);
      return { success: false, error: projError };
    }
    project.isCloudSynced = true;

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

    // 4. Si se proporcionó el árbol del catálogo, sincronizar partidas, conceptos e insumos (incluso si fue vaciado)
    if (Array.isArray(treeData)) {
      await syncCatalogTreeToCloud(sb, projectId, treeData, { skipConfigFlags: true });
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
export async function syncCatalogTreeToCloud(sb, projectId, treeData, options = {}) {
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

  const keepConceptIds = new Set(flatConcepts.map(c => c.id));
  const keepInsumoIds = new Set(flatInsumos.map(i => i.id));
  const BATCH_SIZE = 500;

  // 1. Eliminar nodos e insumos huérfanos eliminados localmente
  try {
    const { data: existingConcepts } = await sb
      .from('catalogo_conceptos')
      .select('id')
      .eq('proyecto_id', projectId);

    const staleConceptIds = (Array.isArray(existingConcepts) ? existingConcepts : [])
      .map(r => r?.id)
      .filter(id => id && !keepConceptIds.has(id));

    for (let i = 0; i < staleConceptIds.length; i += BATCH_SIZE) {
      const staleChunk = staleConceptIds.slice(i, i + BATCH_SIZE);
      await sb.from('insumos_apu').delete().in('concepto_id', staleChunk);
      await sb.from('catalogo_conceptos').delete().in('id', staleChunk).eq('proyecto_id', projectId);
    }
  } catch (delErr) {
    console.warn('[CloudProjectService] Aviso al depurar conceptos eliminados:', delErr?.message || delErr);
  }

  // 2. Guardar conceptos en lotes de 100
  for (let i = 0; i < flatConcepts.length; i += BATCH_SIZE) {
    const chunk = flatConcepts.slice(i, i + BATCH_SIZE);
    const { error: cErr } = await sb
      .from('catalogo_conceptos')
      .upsert(chunk, { onConflict: 'id' });
    if (cErr) {
      console.warn('[CloudProjectService] Aviso al sincronizar lote de conceptos:', cErr.message);
    }
  }

  // 3. Guardar insumos en lotes de 100 y eliminar insumos removidos/vaciados en la nube
  for (let i = 0; i < flatInsumos.length; i += BATCH_SIZE) {
    const chunk = flatInsumos.slice(i, i + BATCH_SIZE);
    const { error: insErr } = await sb
      .from('insumos_apu')
      .upsert(chunk, { onConflict: 'id' });
    if (insErr) {
      console.warn('[CloudProjectService] Aviso al sincronizar lote de insumos:', insErr.message);
    }
  }

  try {
    const activeConceptIds = Array.from(keepConceptIds);
    for (let i = 0; i < activeConceptIds.length; i += BATCH_SIZE) {
      const cChunk = activeConceptIds.slice(i, i + BATCH_SIZE);
      const { data: existingIns } = await sb
        .from('insumos_apu')
        .select('id')
        .in('concepto_id', cChunk);

      const staleInsIds = (Array.isArray(existingIns) ? existingIns : [])
        .map(r => r?.id)
        .filter(id => id && !keepInsumoIds.has(id));

      for (let j = 0; j < staleInsIds.length; j += BATCH_SIZE) {
        await sb.from('insumos_apu').delete().in('id', staleInsIds.slice(j, j + BATCH_SIZE));
      }
    }
  } catch (delInsErr) {
    console.warn('[CloudProjectService] Aviso al depurar insumos eliminados:', delInsErr?.message || delInsErr);
  }

  // 4. Persistir banderas de matrices limpiadas/personalizadas si se invocó fuera de syncProjectToCloud
  if (!options?.skipConfigFlags && isValidUUID(projectId)) {
    try {
      const clearedMatrixIds = collectNodeFlagUuids(treeData, (n) => Boolean(n?.userClearedMatrix));
      const customizedMatrixIds = collectNodeFlagUuids(treeData, (n) => Boolean(n?.isMatrixCustomized));
      const { data: projRow } = await sb
        .from('proyectos')
        .select('configuracion')
        .eq('id', projectId)
        .maybeSingle();
      if (projRow) {
        const nextCfg = { ...(projRow.configuracion || {}), clearedMatrixIds, customizedMatrixIds };
        delete nextCfg.apiKey;
        await sb.from('proyectos').update({ configuracion: nextCfg }).eq('id', projectId);
      }
    } catch (_) {}
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
    return null;
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
      return null;
    }

    if (!Array.isArray(cloudList)) return null;

    let deletedList = [];
    try {
      if (typeof localStorage !== 'undefined') {
        const rawDel = localStorage.getItem('cubikar_deleted_projects_v1');
        if (rawDel) deletedList = JSON.parse(rawDel);
      }
    } catch (_) {}

    const cloudDeletedIds = new Set();
    try {
      const { data: delRows } = await sb
        .from('proyectos_eliminados')
        .select('proyecto_id');
      if (Array.isArray(delRows)) {
        const mergedLocal = Array.isArray(deletedList) ? [...deletedList] : [];
        let changed = false;
        for (const r of delRows) {
          const did = r?.proyecto_id ? String(r.proyecto_id).trim() : '';
          if (did) {
            cloudDeletedIds.add(did);
            if (!mergedLocal.includes(did)) {
              mergedLocal.push(did);
              changed = true;
            }
          }
        }
        if (changed && typeof localStorage !== 'undefined') {
          deletedList = mergedLocal;
          localStorage.setItem('cubikar_deleted_projects_v1', JSON.stringify(mergedLocal.slice(-200)));
        }
      }
    } catch (_) {}

    const isDeleted = (id) => {
      const sid = String(id || '').trim();
      return (Array.isArray(deletedList) && deletedList.includes(sid)) || cloudDeletedIds.has(sid);
    };

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

        const rawCfg = (cp.configuracion && typeof cp.configuracion === 'object') ? cp.configuracion : {};
        const cfg = { ...rawCfg };
        delete cfg.apiKey;
        const memberTabsMap = (cfg.memberTabs && typeof cfg.memberTabs === 'object') ? cfg.memberTabs : {};
        const defaultTabs = ['cat', 'insumos', 'calendario', 'estimaciones', 'compras', 'bitacora'];

        const rawColabs = Array.isArray(cp.proyecto_colaboradores) ? cp.proyecto_colaboradores : [];
        const reconstructedMembers = rawColabs.map(c => {
          const cEmail = (c.email_colaborador || '').toLowerCase().trim();
          return {
            id: c.id,
            name: c.nombre_colaborador || c.email_colaborador.split('@')[0],
            email: cEmail,
            role: c.rol || 'editar',
            status: c.estado_invitacion || 'accepted',
            allowedTabs: Array.isArray(memberTabsMap[cEmail]) ? memberTabsMap[cEmail] : defaultTabs
          };
        });

        const ownerColab = rawColabs.find(c => c.rol === 'owner');
        const ownerEmail = (cp.owner_email || ownerColab?.email_colaborador || (cp.creado_por && cp.creado_por === user.id ? myEmail : '') || '').toLowerCase().trim();
        const isMyOwn = ownerEmail === myEmail || (cp.creado_por && cp.creado_por === user.id);
        const isMyCollab = rawColabs.some(c => (c.email_colaborador || '').toLowerCase().trim() === myEmail && c.estado_invitacion !== 'rejected');
        if (!isMyOwn && !isMyCollab) {
          return null;
        }
        const ownerName = ownerColab?.nombre_colaborador || (ownerEmail === myEmail ? (user.name || 'Propietario') : (ownerEmail ? ownerEmail.split('@')[0] : 'Propietario'));

        return {
          id: cp.id,
          cloudId: cp.id,
          isCloudSynced: true,
          projectName: cp.nombre,
          companyName: cfg.companyName || cp.cliente || 'Constructora',
          ownerEmail: ownerEmail,
          ownerName: ownerName,
          ownerPlanId: cfg.ownerPlanId || (isMyOwn ? getUserPlanId(user) : 'pro'),
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
          clearedMatrixIds: Array.isArray(cfg.clearedMatrixIds) ? cfg.clearedMatrixIds : [],
          customizedMatrixIds: Array.isArray(cfg.customizedMatrixIds) ? cfg.customizedMatrixIds : [],
          createdAt: cp.created_at ? cp.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          updatedAt: cp.updated_at || new Date().toISOString(),
          members: reconstructedMembers
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.error('[CloudProjectService] Excepción al consultar proyectos en la nube:', err);
    return null;
  }
}

/**
 * Descargar y reconstruir el árbol de catálogo desde Supabase PostgreSQL
 */
export async function loadProjectTreeFromCloud(projectId) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid)) return null;

  try {
    // 1. Obtener conceptos y metadatos de configuración (matrices vaciadas intencionalmente)
    const [{ data: concepts, error: cErr }, { data: projRow }] = await Promise.all([
      sb.from('catalogo_conceptos').select('*').eq('proyecto_id', targetUuid).order('orden', { ascending: true }),
      sb.from('proyectos').select('configuracion').eq('id', targetUuid).maybeSingle()
    ]);

    if (cErr || !Array.isArray(concepts)) {
      return null;
    }
    if (concepts.length === 0) {
      return projRow ? [] : null;
    }

    const projCfg = (projRow?.configuracion && typeof projRow.configuracion === 'object') ? projRow.configuracion : {};
    const clearedMatrixIds = new Set(Array.isArray(projCfg.clearedMatrixIds) ? projCfg.clearedMatrixIds : []);
    const customizedMatrixIds = new Set(Array.isArray(projCfg.customizedMatrixIds) ? projCfg.customizedMatrixIds : []);

    // 2. Si los conceptos no traen su insumos JSONB poblado (y no fueron vaciados explícitamente), consultar insumos_apu relacional
    let insumosMap = new Map();
    const candidateConceptIds = concepts
      .filter(c => !clearedMatrixIds.has(c.id) && (!Array.isArray(c.insumos) || c.insumos.length === 0))
      .map(c => c.id);

    if (candidateConceptIds.length > 0) {
      const { data: insumos } = await sb
        .from('insumos_apu')
        .select('*')
        .in('concepto_id', candidateConceptIds)
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
      const isCleared = clearedMatrixIds.has(c.id);
      const cInsumos = isCleared
        ? []
        : ((Array.isArray(c.insumos) && c.insumos.length > 0) ? c.insumos : (insumosMap.get(c.id) || []));

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
        userClearedMatrix: isCleared,
        isMatrixCustomized: customizedMatrixIds.has(c.id) || cInsumos.length > 0,
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
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid) || !email) return { success: false };

  try {
    const cleanEmail = email.toLowerCase().trim();
    const record = {
      proyecto_id: targetUuid,
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

export async function updateCollaboratorRoleInCloud(projectId, email, role) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid) || !email || !role) return { success: false };

  try {
    const cleanEmail = email.toLowerCase().trim();
    const { data, error } = await sb
      .from('proyecto_colaboradores')
      .update({ rol: role, updated_at: new Date().toISOString() })
      .eq('proyecto_id', targetUuid)
      .eq('email_colaborador', cleanEmail)
      .select();

    if (error) {
      console.warn('[CloudProjectService] Error actualizando rol de colaborador:', error.message);
      return { success: false, error };
    }
    if (Array.isArray(data) && data.length === 0) {
      return await addCollaboratorToCloud(targetUuid, cleanEmail, role, 'accepted');
    }
    return { success: true, data: data?.[0] || null };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function syncProjectMemberTabsToCloud(projectId, memberEmailOrMap, allowedTabs = null) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid)) return { success: false };

  try {
    const { data: row } = await sb
      .from('proyectos')
      .select('configuracion')
      .eq('id', targetUuid)
      .maybeSingle();

    const prevCfg = (row?.configuracion && typeof row.configuracion === 'object') ? row.configuracion : {};
    const prevTabs = (prevCfg.memberTabs && typeof prevCfg.memberTabs === 'object') ? prevCfg.memberTabs : {};
    const nextTabs = { ...prevTabs };

    if (memberEmailOrMap && typeof memberEmailOrMap === 'object') {
      Object.entries(memberEmailOrMap).forEach(([em, tabs]) => {
        const cleanEm = String(em || '').toLowerCase().trim();
        if (cleanEm && Array.isArray(tabs)) nextTabs[cleanEm] = tabs;
      });
    } else if (typeof memberEmailOrMap === 'string' && memberEmailOrMap.trim()) {
      const cleanEm = memberEmailOrMap.toLowerCase().trim();
      nextTabs[cleanEm] = Array.isArray(allowedTabs) ? allowedTabs : [];
    }

    const nextCfg = { ...prevCfg, memberTabs: nextTabs };
    const { error } = await sb
      .from('proyectos')
      .update({ configuracion: nextCfg, updated_at: new Date().toISOString() })
      .eq('id', targetUuid);

    if (error) {
      console.warn('[CloudProjectService] Error actualizando pestañas de colaborador:', error.message);
      return { success: false, error };
    }
    return { success: true, memberTabs: nextTabs };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Eliminar un colaborador de un proyecto en la nube
 */
export async function removeCollaboratorFromCloud(projectId, email) {
  const sb = getSupabaseClient();
  const targetUuid = resolveCloudProjectId(projectId);
  if (!isSupabaseConfigured() || !sb || !isValidUUID(targetUuid) || !email) return;

  try {
    await sb
      .from('proyecto_colaboradores')
      .delete()
      .eq('proyecto_id', targetUuid)
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

  const targetUuid = resolveCloudProjectId(projectId);
  if (!isValidUUID(targetUuid)) return;

  const rawConceptId = (patchOrConcept.uuid && isValidUUID(patchOrConcept.uuid))
    ? String(patchOrConcept.uuid).trim()
    : String(patchOrConcept.id || '').trim();
  if (!isValidUUID(rawConceptId)) return;

  try {
    if (patchOrConcept.type === 'update_field' && rawConceptId) {
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
        const { error } = await sb
          .from('catalogo_conceptos')
          .update({ [dbField]: patchOrConcept.value, updated_at: new Date().toISOString() })
          .eq('id', rawConceptId)
          .eq('proyecto_id', targetUuid);
        if (error) console.warn('[CloudProjectService] Error al actualizar campo de concepto:', error.message);
      }
    } else if (rawConceptId) {
      const isCleared = Boolean(patchOrConcept.userClearedMatrix) && (!Array.isArray(patchOrConcept.insumos) || patchOrConcept.insumos.length === 0);
      const { error } = await sb
        .from('catalogo_conceptos')
        .upsert({
          id: rawConceptId,
          proyecto_id: targetUuid,
          clave: patchOrConcept.clave || '',
          descripcion: patchOrConcept.descripcion || '',
          unidad: patchOrConcept.unidad || 'pza',
          cantidad: Number(patchOrConcept.cantidad) || 0,
          precio_unitario: Number(patchOrConcept.precioUnitario) || 0,
          costo_directo: Number(patchOrConcept.costoDirecto) || 0,
          color: patchOrConcept.color || null,
          insumos: isCleared ? [] : (Array.isArray(patchOrConcept.insumos) ? patchOrConcept.insumos : []),
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      if (error) console.warn('[CloudProjectService] Error al hacer upsert de concepto:', error.message);
      if (isCleared) {
        await sb.from('insumos_apu').delete().eq('concepto_id', rawConceptId);
      }
    }
  } catch (err) {
    console.warn('[CloudProjectService] Error al actualizar concepto en Supabase:', err);
  }
}

/**
 * Eliminar un proyecto en la nube y registrar tombstone persistente en Supabase
 */
export async function deleteProjectFromCloud(projectId, opts = {}) {
  const sb = getSupabaseClient();
  if (!isSupabaseConfigured() || !sb || !projectId) {
    return { success: false, skipped: true };
  }

  try {
    const rawId = String(projectId).trim();
    const list = typeof getProjectsList === 'function' ? getProjectsList() : [];
    const proj = (opts?.project && typeof opts.project === 'object')
      ? opts.project
      : (Array.isArray(list) ? list.find(p => p && (p.id === rawId || p.cloudId === rawId)) : null);

    const resolvedUuid = resolveCloudProjectId(rawId);
    const targetUuid = resolvedUuid || (opts?.cloudId && isValidUUID(String(opts.cloudId)) ? String(opts.cloudId).trim() : '');
    const textIds = Array.from(new Set([rawId, targetUuid].filter(Boolean)));

    const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    const deletedByEmail = String(opts?.deletedByEmail || currentUser?.email || '').toLowerCase().trim();
    const ownerEmail = String(opts?.ownerEmail || proj?.ownerEmail || deletedByEmail || '').toLowerCase().trim();
    const collabEmails = Array.from(new Set([
      ...(Array.isArray(proj?.members) ? proj.members.map(m => String(m?.email || '').toLowerCase().trim()) : []),
      ...(Array.isArray(opts?.collaboratorEmails) ? opts.collaboratorEmails.map(e => String(e || '').toLowerCase().trim()) : [])
    ].filter(Boolean)));

    const nowIso = new Date().toISOString();
    const tombstoneIds = Array.from(new Set([targetUuid, rawId].filter(Boolean)));
    if (tombstoneIds.length > 0) {
      const tombstoneRows = tombstoneIds.map(id => ({
        proyecto_id: id,
        owner_email: ownerEmail || deletedByEmail || null,
        deleted_by_email: deletedByEmail || ownerEmail || null,
        collaborator_emails: collabEmails,
        deleted_at: nowIso
      }));
      const { error: tombErr } = await sb
        .from('proyectos_eliminados')
        .upsert(tombstoneRows, { onConflict: 'proyecto_id' });
      if (tombErr) {
        console.warn('[CloudProjectService] Aviso guardando tombstone en proyectos_eliminados:', tombErr.message);
      }
    }

    const textTables = ['cronograma_config', 'bitacora_notas', 'bitacora_config', 'compras_gastos', 'proveedores', 'chat_mensajes'];
    await Promise.allSettled(
      textTables.map(tbl => sb.from(tbl).delete().in('proyecto_id', textIds))
    );

    if (isValidUUID(targetUuid)) {
      try {
        const { data: estRows } = await sb
          .from('estimaciones')
          .select('id')
          .eq('proyecto_id', targetUuid);
        const estIds = Array.isArray(estRows) ? estRows.map(r => r?.id).filter(Boolean) : [];
        if (estIds.length > 0) {
          await sb.from('estimacion_detalles').delete().in('estimacion_id', estIds);
        }
      } catch (_) {}

      const uuidTables = [
        'catalogo_conceptos',
        'proyecto_colaboradores',
        'estimaciones',
        'cronograma_actividades',
        'invitaciones'
      ];
      await Promise.allSettled(
        uuidTables.map(tbl => sb.from(tbl).delete().eq('proyecto_id', targetUuid))
      );

      const { error: delProjErr } = await sb.from('proyectos').delete().eq('id', targetUuid);
      if (delProjErr) {
        console.warn('[CloudProjectService] Error eliminando fila de proyectos:', delProjErr.message || delProjErr);
        return { success: false, error: delProjErr };
      }
    }

    return { success: true, deletedId: targetUuid || rawId };
  } catch (err) {
    console.warn('[CloudProjectService] Error al eliminar proyecto en la nube:', err);
    return { success: false, error: err };
  }
}

if (typeof window !== 'undefined') {
  window.syncProjectToCloud = syncProjectToCloud;
  window.fetchCloudProjects = fetchCloudProjects;
  window.loadProjectTreeFromCloud = loadProjectTreeFromCloud;
  window.addCollaboratorToCloud = addCollaboratorToCloud;
  window.updateCollaboratorRoleInCloud = updateCollaboratorRoleInCloud;
  window.syncProjectMemberTabsToCloud = syncProjectMemberTabsToCloud;
  window.removeCollaboratorFromCloud = removeCollaboratorFromCloud;
  window.updateCloudConcept = updateCloudConcept;
  window.deleteProjectFromCloud = deleteProjectFromCloud;
}
