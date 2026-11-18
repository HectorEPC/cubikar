-- ==============================================================================
-- CUBIKAR: PAPELERA DE RECICLAJE DE PROYECTOS (RETENCIÓN DE 7 DÍAS)
-- Aplica a: cubikar.app • Cubikar Construcción (ADM_CONST) • Cubikar Arquitectura (ADM_ARQ)
-- Ejecutar en: Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Columnas de borrado lógico (Soft Delete) en public.proyectos
ALTER TABLE IF EXISTS public.proyectos
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deleted_by_email VARCHAR(255) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_proyectos_deleted_at
    ON public.proyectos(deleted_at)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proyectos_owner_active
    ON public.proyectos(LOWER(owner_email), updated_at DESC)
    WHERE deleted_at IS NULL;

-- 2. Función estricta de propiedad: SOLO el anfitrión (propietario) del proyecto devuelve TRUE
CREATE OR REPLACE FUNCTION public.is_proyecto_owner(p_proj_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u_email TEXT := public.current_user_email();
BEGIN
    IF p_proj_id IS NULL OR auth.uid() IS NULL OR u_email = '' THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.proyectos p
        WHERE p.id = p_proj_id
          AND (
              LOWER(TRIM(COALESCE(p.owner_email, ''))) = u_email
              OR (
                  COALESCE(TRIM(p.owner_email), '') = ''
                  AND (
                      p.creado_por = auth.uid()
                      OR (
                          p.empresa_id IS NOT NULL
                          AND EXISTS (
                              SELECT 1 FROM public.perfiles pf
                              WHERE pf.id = auth.uid()
                                AND pf.empresa_id = p.empresa_id
                                AND pf.rol = 'owner'
                          )
                      )
                  )
              )
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 3. Actualizar check_user_project_access para ocultar proyectos en papelera a colaboradores
CREATE OR REPLACE FUNCTION public.check_user_project_access(
    proj_id TEXT,
    req_roles TEXT[] DEFAULT ARRAY['owner', 'admin', 'editar', 'escribir', 'leer']
)
RETURNS BOOLEAN AS $$
DECLARE
    u_email TEXT;
    v_clean_pid TEXT := TRIM(COALESCE(proj_id, ''));
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF v_clean_pid = '' THEN
        RETURN FALSE;
    END IF;

    u_email := public.current_user_email();
    IF u_email = '' THEN
        RETURN FALSE;
    END IF;

    -- Si el proyecto está en la papelera (deleted_at IS NOT NULL), únicamente su anfitrión
    -- puede consultarlo (para restaurarlo o respaldarlo). Colaboradores quedan bloqueados.
    IF v_clean_pid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        SELECT p.deleted_at INTO v_deleted_at
        FROM public.proyectos p
        WHERE p.id = v_clean_pid::uuid;

        IF v_deleted_at IS NOT NULL THEN
            RETURN public.is_proyecto_owner(v_clean_pid::uuid);
        END IF;
    END IF;

    IF u_email = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;

    -- Propietario directo del proyecto (o legado de su empresa cuando owner_email está vacío)
    IF EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.id::text = v_clean_pid
          AND p.deleted_at IS NULL
          AND (
              LOWER(TRIM(COALESCE(p.owner_email, ''))) = u_email
              OR (
                  COALESCE(TRIM(p.owner_email), '') = ''
                  AND p.empresa_id IS NOT NULL
                  AND p.empresa_id = public.obtener_mi_empresa_id()
              )
          )
    ) THEN
        RETURN TRUE;
    END IF;

    -- Colaboradores activos (no rechazados/revocados) en proyecto_colaboradores o configuracion del proyecto
    IF EXISTS (
        SELECT 1 FROM public.proyecto_colaboradores pc
        WHERE pc.proyecto_id::text = v_clean_pid
          AND LOWER(TRIM(pc.email_colaborador)) = u_email
          AND pc.rol = ANY(req_roles)
          AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'accepted'))) <> 'rejected'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.id::text = v_clean_pid
          AND p.deleted_at IS NULL
          AND (
              (jsonb_typeof(p.configuracion->'memberTabs') = 'object' AND (p.configuracion->'memberTabs') ? u_email AND ('editar' = ANY(req_roles) OR 'leer' = ANY(req_roles)))
              OR (
                  jsonb_typeof(p.configuracion->'collaborators') = 'array'
                  AND EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(p.configuracion->'collaborators') elem
                      WHERE LOWER(TRIM(COALESCE(elem->>'email', ''))) = u_email
                        AND LOWER(TRIM(COALESCE(elem->>'status', 'accepted'))) <> 'rejected'
                        AND COALESCE(NULLIF(TRIM(elem->>'role'), ''), 'editar') = ANY(req_roles)
                  )
              )
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 4. Impedir escritura en tablas de módulos mientras el proyecto esté en la papelera
CREATE OR REPLACE FUNCTION public.tiene_acceso_escritura_registro(
    p_empresa_id UUID,
    p_owner_email TEXT,
    p_proyecto_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_email TEXT := public.current_user_email();
    v_pid TEXT := TRIM(COALESCE(p_proyecto_id, ''));
BEGIN
    IF auth.uid() IS NULL OR v_email = '' THEN
        RETURN FALSE;
    END IF;

    IF v_pid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        IF EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = v_pid::uuid AND p.deleted_at IS NOT NULL) THEN
            RETURN FALSE;
        END IF;
    END IF;

    IF v_email = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;

    IF LOWER(TRIM(COALESCE(p_owner_email, ''))) = v_email THEN
        RETURN TRUE;
    END IF;

    IF v_pid <> '' THEN
        RETURN public.check_user_project_access(v_pid, ARRAY['owner', 'admin', 'editar', 'escribir']);
    END IF;

    IF p_empresa_id IS NOT NULL AND p_empresa_id = public.obtener_mi_empresa_id() THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 5. Proteger deleted_at y deleted_by_email en public.proyectos (solo el anfitrión puede mover/restaurar)
CREATE OR REPLACE FUNCTION public.protect_proyecto_owner_change()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
    v_email TEXT := public.current_user_email();
BEGIN
    IF v_role IN ('service_role', 'supabase_admin')
       OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', NULLIF(current_setting('request.jwt.claim.role', true), ''), '') = '' THEN
        RETURN NEW;
    END IF;

    IF v_email <> 'hepc.90@gmail.com' AND LOWER(TRIM(COALESCE(OLD.owner_email, ''))) <> v_email THEN
        IF LOWER(TRIM(COALESCE(NEW.owner_email, ''))) IS DISTINCT FROM LOWER(TRIM(COALESCE(OLD.owner_email, ''))) THEN
            RAISE EXCEPTION 'Solo el propietario del proyecto puede transferir owner_email.';
        END IF;
    END IF;

    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR COALESCE(LOWER(TRIM(NEW.deleted_by_email)), '') IS DISTINCT FROM COALESCE(LOWER(TRIM(OLD.deleted_by_email)), '') THEN
        IF NOT public.is_proyecto_owner(OLD.id) THEN
            RAISE EXCEPTION 'Solo el anfitrión (propietario) del proyecto puede enviarlo a la papelera o restaurarlo.';
        END IF;
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'El proyecto está en la papelera. Restáuralo antes de modificarlo.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Política DELETE estricta: solo el anfitrión real puede borrar un proyecto
DROP POLICY IF EXISTS "proyectos_delete_colaboracion" ON public.proyectos;
CREATE POLICY "proyectos_delete_colaboracion" ON public.proyectos
    FOR DELETE USING (public.is_proyecto_owner(id));

-- 7. Excluir proyectos en papelera de get_my_collaboration_workspaces()
CREATE OR REPLACE FUNCTION public.get_my_collaboration_workspaces()
RETURNS TABLE (
    proyecto_id UUID,
    nombre TEXT,
    owner_email TEXT,
    owner_name TEXT,
    company_name TEXT,
    rol TEXT,
    estado_invitacion TEXT,
    updated_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
DECLARE
    u_email TEXT;
BEGIN
    u_email := public.current_user_email();
    IF u_email = '' THEN
        RETURN;
    END IF;

    -- 1. Promover invitaciones activas (no rechazadas ni de obras eliminadas o en papelera)
    UPDATE public.proyecto_colaboradores pc
    SET estado_invitacion = 'accepted',
        updated_at = timezone('utc'::text, now())
    FROM public.proyectos p
    WHERE pc.proyecto_id = p.id
      AND p.deleted_at IS NULL
      AND LOWER(TRIM(pc.email_colaborador)) = u_email
      AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'pending'))) = 'pending'
      AND LOWER(TRIM(COALESCE(p.owner_email, ''))) <> u_email
      AND (
          to_regclass('public.proyectos_eliminados') IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM public.proyectos_eliminados pe
              WHERE pe.proyecto_id = p.id::text
          )
      );

    -- 2. Reconciliar invitados registrados en proyectos.configuracion
    INSERT INTO public.proyecto_colaboradores (
        proyecto_id,
        email_colaborador,
        nombre_colaborador,
        rol,
        estado_invitacion,
        updated_at
    )
    SELECT DISTINCT ON (p.id)
        p.id,
        u_email,
        COALESCE(
            (
                SELECT NULLIF(TRIM(elem->>'name'), '')
                FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(p.configuracion->'collaborators') = 'array'
                         THEN p.configuracion->'collaborators'
                         ELSE '[]'::jsonb
                    END
                ) elem
                WHERE LOWER(TRIM(COALESCE(elem->>'email', ''))) = u_email
                LIMIT 1
            ),
            SPLIT_PART(u_email, '@', 1)
        ),
        COALESCE(
            (
                SELECT NULLIF(TRIM(elem->>'role'), '')
                FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(p.configuracion->'collaborators') = 'array'
                         THEN p.configuracion->'collaborators'
                         ELSE '[]'::jsonb
                    END
                ) elem
                WHERE LOWER(TRIM(COALESCE(elem->>'email', ''))) = u_email
                LIMIT 1
            ),
            'editar'
        ),
        'accepted',
        timezone('utc'::text, now())
    FROM public.proyectos p
    WHERE p.deleted_at IS NULL
      AND LOWER(TRIM(COALESCE(p.owner_email, ''))) <> u_email
      AND (
          (jsonb_typeof(p.configuracion->'memberTabs') = 'object' AND (p.configuracion->'memberTabs') ? u_email)
          OR (
              jsonb_typeof(p.configuracion->'collaborators') = 'array'
              AND EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(p.configuracion->'collaborators') elem
                  WHERE LOWER(TRIM(COALESCE(elem->>'email', ''))) = u_email
                    AND LOWER(TRIM(COALESCE(elem->>'status', 'accepted'))) <> 'rejected'
              )
          )
      )
      AND (
          to_regclass('public.proyectos_eliminados') IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM public.proyectos_eliminados pe
              WHERE pe.proyecto_id = p.id::text
          )
      )
    ON CONFLICT ON CONSTRAINT uq_proyecto_colaborador DO UPDATE
    SET estado_invitacion = CASE
            WHEN LOWER(TRIM(COALESCE(public.proyecto_colaboradores.estado_invitacion, ''))) = 'rejected' THEN 'rejected'
            ELSE 'accepted'
        END,
        updated_at = timezone('utc'::text, now());

    -- 3. Reconciliar invitaciones activas desde metadatos de cuentas anfitrionas en auth.users
    BEGIN
        INSERT INTO public.proyecto_colaboradores (
            proyecto_id,
            email_colaborador,
            nombre_colaborador,
            rol,
            estado_invitacion,
            updated_at
        )
        SELECT DISTINCT ON (p.id)
            p.id,
            u_email,
            SPLIT_PART(u_email, '@', 1),
            COALESCE(NULLIF(TRIM(inv_elem->>'role'), ''), 'editar'),
            'accepted',
            timezone('utc'::text, now())
        FROM auth.users au
        CROSS JOIN LATERAL jsonb_array_elements(
            (CASE WHEN jsonb_typeof(au.raw_user_meta_data->'cubikar_cloud_state_v2'->'sentPlanInvitations') = 'array'
                  THEN au.raw_user_meta_data->'cubikar_cloud_state_v2'->'sentPlanInvitations'
                  ELSE '[]'::jsonb END)
            ||
            (CASE WHEN jsonb_typeof(au.raw_user_meta_data->'cubikar_cloud_state_v2'->'sentProjectInvitations') = 'array'
                  THEN au.raw_user_meta_data->'cubikar_cloud_state_v2'->'sentProjectInvitations'
                  ELSE '[]'::jsonb END)
        ) inv_elem
        INNER JOIN public.proyectos p
            ON LOWER(TRIM(COALESCE(p.owner_email, ''))) = LOWER(TRIM(COALESCE(au.email, inv_elem->>'ownerEmail', '')))
           AND p.deleted_at IS NULL
           AND (
               COALESCE(TRIM(inv_elem->>'projectId'), '') = ''
               OR inv_elem->>'projectId' = p.id::text
           )
        WHERE LOWER(TRIM(COALESCE(inv_elem->>'email', ''))) = u_email
          AND LOWER(TRIM(COALESCE(inv_elem->>'status', 'accepted'))) <> 'rejected'
          AND LOWER(TRIM(COALESCE(p.owner_email, ''))) <> u_email
          AND (
              to_regclass('public.proyectos_eliminados') IS NULL
              OR NOT EXISTS (
                  SELECT 1 FROM public.proyectos_eliminados pe
                  WHERE pe.proyecto_id = p.id::text
              )
          )
        ON CONFLICT ON CONSTRAINT uq_proyecto_colaborador DO UPDATE
        SET estado_invitacion = CASE
                WHEN LOWER(TRIM(COALESCE(public.proyecto_colaboradores.estado_invitacion, ''))) = 'rejected' THEN 'rejected'
                ELSE 'accepted'
            END,
            updated_at = timezone('utc'::text, now());
    EXCEPTION WHEN others THEN
        NULL;
    END;

    RETURN QUERY
    SELECT
        p.id AS proyecto_id,
        COALESCE(p.nombre, 'Proyecto de Obra')::text AS nombre,
        LOWER(TRIM(COALESCE(p.owner_email, owner_pc.email_colaborador, '')))::text AS owner_email,
        COALESCE(
            NULLIF(TRIM(p.configuracion->>'ownerName'), ''),
            NULLIF(TRIM(owner_pc.nombre_colaborador), ''),
            NULLIF(TRIM(pf.nombre_completo), ''),
            NULLIF(SPLIT_PART(LOWER(TRIM(COALESCE(p.owner_email, owner_pc.email_colaborador, ''))), '@', 1), ''),
            'Anfitrión'
        )::text AS owner_name,
        COALESCE(
            NULLIF(TRIM(p.configuracion->>'companyName'), ''),
            NULLIF(TRIM(p.cliente), ''),
            ''
        )::text AS company_name,
        COALESCE(pc.rol, 'editar')::text AS rol,
        COALESCE(pc.estado_invitacion, 'accepted')::text AS estado_invitacion,
        GREATEST(COALESCE(pc.updated_at, p.updated_at), COALESCE(p.updated_at, pc.updated_at)) AS updated_at
    FROM public.proyecto_colaboradores pc
    INNER JOIN public.proyectos p ON p.id = pc.proyecto_id
    LEFT JOIN LATERAL (
        SELECT opc.email_colaborador, opc.nombre_colaborador
        FROM public.proyecto_colaboradores opc
        WHERE opc.proyecto_id = p.id AND opc.rol = 'owner'
        ORDER BY opc.updated_at DESC NULLS LAST
        LIMIT 1
    ) owner_pc ON TRUE
    LEFT JOIN public.perfiles pf
        ON LOWER(TRIM(COALESCE(pf.email, ''))) = LOWER(TRIM(COALESCE(p.owner_email, owner_pc.email_colaborador, '')))
    WHERE p.deleted_at IS NULL
      AND LOWER(TRIM(pc.email_colaborador)) = u_email
      AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'accepted'))) <> 'rejected'
      AND LOWER(TRIM(COALESCE(p.owner_email, owner_pc.email_colaborador, ''))) <> u_email
      AND (
          to_regclass('public.proyectos_eliminados') IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM public.proyectos_eliminados pe
              WHERE pe.proyecto_id = p.id::text
          )
      )
    ORDER BY GREATEST(COALESCE(pc.updated_at, p.updated_at), COALESCE(p.updated_at, pc.updated_at)) DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_collaboration_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_collaboration_workspaces() TO authenticated;

-- 8. RPCs seguras de Papelera (exclusivas para el Anfitrión del proyecto)

-- 8.1 Mover proyecto a Papelera (Soft Delete por 7 días)
CREATE OR REPLACE FUNCTION public.mover_proyecto_a_papelera(p_proyecto_id UUID)
RETURNS JSONB AS $$
DECLARE
    u_email TEXT := public.current_user_email();
    v_exists BOOLEAN := FALSE;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL OR u_email = '' THEN
        RAISE EXCEPTION 'Sesión no autenticada.';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.proyectos WHERE id = p_proyecto_id) INTO v_exists;
    IF NOT v_exists THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Proyecto no encontrado.');
    END IF;

    IF NOT public.is_proyecto_owner(p_proyecto_id) THEN
        RAISE EXCEPTION 'Solo el anfitrión (propietario) del proyecto puede enviarlo a la papelera.';
    END IF;

    UPDATE public.proyectos
    SET deleted_at = COALESCE(deleted_at, timezone('utc'::text, now())),
        deleted_by_email = u_email,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_proyecto_id
    RETURNING deleted_at INTO v_deleted_at;

    RETURN jsonb_build_object(
        'ok', true,
        'id', p_proyecto_id,
        'deleted_at', v_deleted_at,
        'expires_at', v_deleted_at + INTERVAL '7 days'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.mover_proyecto_a_papelera(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mover_proyecto_a_papelera(UUID) TO authenticated;

-- 8.2 Restaurar proyecto desde Papelera (solo Anfitrión)
CREATE OR REPLACE FUNCTION public.restaurar_proyecto_de_papelera(p_proyecto_id UUID)
RETURNS JSONB AS $$
DECLARE
    u_email TEXT := public.current_user_email();
    v_deleted_at TIMESTAMPTZ;
    v_found BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL OR u_email = '' THEN
        RAISE EXCEPTION 'Sesión no autenticada.';
    END IF;

    SELECT TRUE, deleted_at INTO v_found, v_deleted_at
    FROM public.proyectos
    WHERE id = p_proyecto_id;

    IF NOT COALESCE(v_found, FALSE) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'El proyecto ya no existe o fue purgado definitivamente.');
    END IF;

    IF NOT public.is_proyecto_owner(p_proyecto_id) THEN
        RAISE EXCEPTION 'Solo el anfitrión (propietario) del proyecto puede restaurarlo.';
    END IF;

    IF v_deleted_at IS NOT NULL AND v_deleted_at < (timezone('utc'::text, now()) - INTERVAL '7 days') THEN
        DELETE FROM public.proyectos WHERE id = p_proyecto_id;
        RETURN jsonb_build_object('ok', false, 'expired', true, 'error', 'El proyecto superó el límite de 7 días en la papelera y se eliminó definitivamente.');
    END IF;

    UPDATE public.proyectos
    SET deleted_at = NULL,
        deleted_by_email = '',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_proyecto_id;

    IF to_regclass('public.proyectos_eliminados') IS NOT NULL THEN
        DELETE FROM public.proyectos_eliminados WHERE proyecto_id = p_proyecto_id::text;
    END IF;

    IF to_regclass('public.chat_mensajes') IS NOT NULL THEN
        DELETE FROM public.chat_mensajes
        WHERE proyecto_id = '__cubikar_tombstones__'
          AND (id = '__tombstone__' || p_proyecto_id::text OR mensaje = p_proyecto_id::text);
    END IF;

    RETURN jsonb_build_object('ok', true, 'id', p_proyecto_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.restaurar_proyecto_de_papelera(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restaurar_proyecto_de_papelera(UUID) TO authenticated;

-- 8.3 Eliminar proyecto definitivamente (solo Anfitrión)
CREATE OR REPLACE FUNCTION public.eliminar_proyecto_definitivamente(p_proyecto_id UUID)
RETURNS JSONB AS $$
DECLARE
    u_email TEXT := public.current_user_email();
    v_found BOOLEAN := FALSE;
    v_s3_keys JSONB := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL OR u_email = '' THEN
        RAISE EXCEPTION 'Sesión no autenticada.';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.proyectos WHERE id = p_proyecto_id) INTO v_found;
    IF NOT v_found THEN
        RETURN jsonb_build_object('ok', true, 'id', p_proyecto_id, 'already_purged', true, 's3_keys', '[]'::jsonb);
    END IF;

    IF NOT public.is_proyecto_owner(p_proyecto_id) THEN
        RAISE EXCEPTION 'Solo el anfitrión (propietario) del proyecto puede eliminarlo definitivamente.';
    END IF;

    IF to_regclass('public.archivos_almacen') IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(a.s3_key), '[]'::jsonb)
        INTO v_s3_keys
        FROM public.archivos_almacen a
        WHERE a.proyecto_id = p_proyecto_id::text
          AND a.deleted_at IS NULL
          AND COALESCE(a.s3_key, '') <> '';
    END IF;

    DELETE FROM public.proyectos WHERE id = p_proyecto_id;

    RETURN jsonb_build_object('ok', true, 'id', p_proyecto_id, 's3_keys', COALESCE(v_s3_keys, '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.eliminar_proyecto_definitivamente(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_proyecto_definitivamente(UUID) TO authenticated;

-- 8.4 Listar Papelera del Anfitrión (auto-purga primero sus proyectos > 7 días)
CREATE OR REPLACE FUNCTION public.listar_papelera_anfitrion()
RETURNS TABLE (
    id UUID,
    nombre VARCHAR,
    cliente VARCHAR,
    ubicacion TEXT,
    tipo_obra VARCHAR,
    moneda VARCHAR,
    simbolo_moneda VARCHAR,
    owner_email VARCHAR,
    deleted_by_email VARCHAR,
    deleted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    configuracion JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    u_email TEXT := public.current_user_email();
BEGIN
    IF auth.uid() IS NULL OR u_email = '' THEN
        RETURN;
    END IF;

    DELETE FROM public.proyectos p
    WHERE p.deleted_at IS NOT NULL
      AND p.deleted_at < (timezone('utc'::text, now()) - INTERVAL '7 days')
      AND public.is_proyecto_owner(p.id);

    RETURN QUERY
    SELECT
        p.id,
        p.nombre,
        p.cliente,
        p.ubicacion,
        p.tipo_obra,
        p.moneda,
        p.simbolo_moneda,
        p.owner_email,
        p.deleted_by_email,
        p.deleted_at,
        (p.deleted_at + INTERVAL '7 days') AS expires_at,
        p.configuracion,
        p.created_at,
        p.updated_at
    FROM public.proyectos p
    WHERE p.deleted_at IS NOT NULL
      AND public.is_proyecto_owner(p.id)
    ORDER BY p.deleted_at DESC;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.listar_papelera_anfitrion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_papelera_anfitrion() TO authenticated;

-- 8.5 Purga global automática (para pg_cron o service_role) al cumplir 7 días
CREATE OR REPLACE FUNCTION public.purgar_proyectos_papelera_expirados()
RETURNS INTEGER AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
    v_count INTEGER := 0;
BEGIN
    IF v_role NOT IN ('service_role', 'supabase_admin')
       AND current_user NOT IN ('postgres', 'supabase_admin')
       AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Acceso denegado: función reservada para mantenimiento programado del servidor.';
    END IF;

    DELETE FROM public.proyectos
    WHERE deleted_at IS NOT NULL
      AND deleted_at < (timezone('utc'::text, now()) - INTERVAL '7 days');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.purgar_proyectos_papelera_expirados() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purgar_proyectos_papelera_expirados() FROM anon;
REVOKE ALL ON FUNCTION public.purgar_proyectos_papelera_expirados() FROM authenticated;

-- 9. Programación automática diaria con pg_cron (si está disponible en el proyecto Supabase)
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION WHEN others THEN
        NULL;
    END;

    IF to_regclass('cron.job') IS NOT NULL THEN
        BEGIN
            PERFORM cron.unschedule('cubikar-purgar-papelera-7d');
        EXCEPTION WHEN others THEN
            NULL;
        END;

        BEGIN
            PERFORM cron.schedule(
                'cubikar-purgar-papelera-7d',
                '0 3 * * *',
                'SELECT public.purgar_proyectos_papelera_expirados();'
            );
            RAISE NOTICE 'Job cron "cubikar-purgar-papelera-7d" programado diariamente a las 03:00 UTC.';
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'No se pudo registrar cron.schedule automáticamente: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'Extensión pg_cron no habilitada; la purga de 7 días también se ejecuta automáticamente en listar_papelera_anfitrion().';
    END IF;
END $$;
