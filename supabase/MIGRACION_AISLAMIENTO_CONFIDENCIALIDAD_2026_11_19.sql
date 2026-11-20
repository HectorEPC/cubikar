-- ==============================================================================
-- CUBIKAR · MIGRACIÓN DE AISLAMIENTO Y CONFIDENCIALIDAD (2026-11-19)
-- Aplicar en Supabase > SQL Editor DESPUÉS de MIGRACION_PAPELERA_7_DIAS.sql.
-- Es idempotente (se puede ejecutar más de una vez).
--
-- Cierra:
--  C1  Auto-alta como colaborador en obras ajenas (proyecto_colaboradores INSERT)
--  C2  Manifiestos/lápidas de anfitriones legibles por cualquier usuario (chat_mensajes)
--  C3  Canales Realtime públicos -> canales privados con RLS en realtime.messages
--  C4  Registro de archivos (archivos_almacen) con llaves S3 ajenas
--  H3  Colaboradores de solo lectura escribiendo en archivos/catálogos maestros
--  H4  Escalamiento de rol editando proyectos.configuracion (collaborators/memberTabs)
--  H5  Escritura en módulos de obras ajenas usando owner_email propio
--  M1  RPC de cuota IA invocable por cualquiera
--  M5  Lápidas falsas de obras ajenas (proyectos_eliminados)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. Funciones auxiliares (SECURITY DEFINER, sin fugas: solo devuelven booleanos del usuario actual)
-- ------------------------------------------------------------------------------

-- ¿El correo pertenece a la obra (dueño, colaborador no rechazado o invitado registrado por el dueño)?
CREATE OR REPLACE FUNCTION public.cubikar_es_miembro_proyecto(p_proj_id UUID, p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
BEGIN
    IF p_proj_id IS NULL OR v_email = '' THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.id = p_proj_id
          AND p.deleted_at IS NULL
          AND (
              LOWER(TRIM(COALESCE(p.owner_email, ''))) = v_email
              OR EXISTS (
                  SELECT 1 FROM public.proyecto_colaboradores pc
                  WHERE pc.proyecto_id = p.id
                    AND LOWER(TRIM(pc.email_colaborador)) = v_email
                    AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'accepted'))) <> 'rejected'
              )
              OR (
                  jsonb_typeof(p.configuracion->'collaborators') = 'array'
                  AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(p.configuracion->'collaborators') e
                      WHERE LOWER(TRIM(COALESCE(e->>'email', ''))) = v_email
                        AND LOWER(TRIM(COALESCE(e->>'status', 'accepted'))) <> 'rejected'
                  )
              )
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ¿El usuario actual comparte al menos una obra con p_other_email? (para notificaciones Realtime)
CREATE OR REPLACE FUNCTION public.cubikar_comparte_obra_con(p_other_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_me TEXT := public.current_user_email();
    v_other TEXT := LOWER(TRIM(COALESCE(p_other_email, '')));
BEGIN
    IF auth.uid() IS NULL OR v_me = '' OR v_other = '' THEN
        RETURN FALSE;
    END IF;
    IF v_other = v_me OR v_me = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.deleted_at IS NULL
          AND (
              LOWER(TRIM(COALESCE(p.owner_email, ''))) IN (v_me, v_other)
              OR EXISTS (
                  SELECT 1 FROM public.proyecto_colaboradores pc
                  WHERE pc.proyecto_id = p.id
                    AND LOWER(TRIM(pc.email_colaborador)) IN (v_me, v_other)
              )
          )
          AND public.cubikar_es_miembro_proyecto(p.id, v_me)
          AND public.cubikar_es_miembro_proyecto(p.id, v_other)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ¿El usuario actual puede leer el manifiesto/lápida auxiliar escrito por p_autor?
CREATE OR REPLACE FUNCTION public.cubikar_puede_leer_aux_chat(p_proyecto_id TEXT, p_autor TEXT, p_mensaje TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_me TEXT := public.current_user_email();
    v_host TEXT := LOWER(TRIM(COALESCE(p_autor, '')));
BEGIN
    IF auth.uid() IS NULL OR v_me = '' THEN
        RETURN FALSE;
    END IF;
    IF v_me = 'hepc.90@gmail.com' OR v_host = v_me THEN
        RETURN TRUE;
    END IF;
    -- Miembro (colaborador o invitado) de alguna obra vigente de ese anfitrión
    IF EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.deleted_at IS NULL
          AND LOWER(TRIM(COALESCE(p.owner_email, ''))) = v_host
          AND public.cubikar_es_miembro_proyecto(p.id, v_me)
    ) THEN
        RETURN TRUE;
    END IF;
    -- Lápida de una obra eliminada en la que el usuario era colaborador
    IF p_proyecto_id = '__cubikar_tombstones__' AND EXISTS (
        SELECT 1 FROM public.proyectos_eliminados pe
        WHERE pe.proyecto_id = TRIM(COALESCE(p_mensaje, ''))
          AND v_me = ANY(pe.collaborator_emails)
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Invitación válida registrada por el dueño en la configuración de la obra (o fila pendiente previa)
CREATE OR REPLACE FUNCTION public.cubikar_invitacion_valida(p_proj_id UUID, p_rol TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_me TEXT := public.current_user_email();
    v_rol TEXT := LOWER(TRIM(COALESCE(p_rol, '')));
BEGIN
    IF auth.uid() IS NULL OR v_me = '' OR p_proj_id IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.id = p_proj_id
          AND p.deleted_at IS NULL
          AND (
              (
                  jsonb_typeof(p.configuracion->'collaborators') = 'array'
                  AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(p.configuracion->'collaborators') e
                      WHERE LOWER(TRIM(COALESCE(e->>'email', ''))) = v_me
                        AND LOWER(TRIM(COALESCE(e->>'status', 'pending'))) <> 'rejected'
                        AND (
                            v_rol = 'leer'
                            OR LOWER(TRIM(COALESCE(NULLIF(e->>'role', ''), 'editar'))) = v_rol
                        )
                  )
              )
              OR (
                  v_rol = 'leer'
                  AND jsonb_typeof(p.configuracion->'memberTabs') = 'object'
                  AND (p.configuracion->'memberTabs') ? v_me
              )
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- H4. memberTabs solo concede LECTURA; collaborators[] y memberTabs solo los cambia dueño/admin
-- ------------------------------------------------------------------------------
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
              -- memberTabs ya no concede escritura (solo lectura)
              (jsonb_typeof(p.configuracion->'memberTabs') = 'object' AND (p.configuracion->'memberTabs') ? u_email AND 'leer' = ANY(req_roles))
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

CREATE OR REPLACE FUNCTION public.cubikar_proteger_miembros_configuracion()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
BEGIN
    IF v_role = 'service_role' OR public.current_user_email() = 'hepc.90@gmail.com' THEN
        RETURN NEW;
    END IF;
    IF public.check_user_project_access(OLD.id::text, ARRAY['owner', 'admin']) THEN
        RETURN NEW;
    END IF;
    -- Editores pueden guardar su configuración, pero la lista de miembros/roles se conserva intacta
    IF NEW.configuracion IS DISTINCT FROM OLD.configuracion THEN
        NEW.configuracion := COALESCE(NEW.configuracion, '{}'::jsonb);
        IF OLD.configuracion ? 'collaborators' THEN
            NEW.configuracion := jsonb_set(NEW.configuracion, '{collaborators}', OLD.configuracion->'collaborators', true);
        ELSE
            NEW.configuracion := NEW.configuracion - 'collaborators';
        END IF;
        IF OLD.configuracion ? 'memberTabs' THEN
            NEW.configuracion := jsonb_set(NEW.configuracion, '{memberTabs}', OLD.configuracion->'memberTabs', true);
        ELSE
            NEW.configuracion := NEW.configuracion - 'memberTabs';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_cubikar_proteger_miembros_configuracion ON public.proyectos;
CREATE TRIGGER trg_cubikar_proteger_miembros_configuracion
    BEFORE UPDATE ON public.proyectos
    FOR EACH ROW EXECUTE FUNCTION public.cubikar_proteger_miembros_configuracion();

-- ------------------------------------------------------------------------------
-- H5 / C4. Acceso a registros de módulos: si la obra existe, decide SOLO la membresía de la obra
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tiene_acceso_registro(
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
    IF v_email = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;
    IF v_pid <> '' AND EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id::text = v_pid) THEN
        RETURN public.check_user_project_access(v_pid);
    END IF;
    IF LOWER(TRIM(COALESCE(p_owner_email, ''))) = v_email THEN
        RETURN TRUE;
    END IF;
    -- Lectura de registros sin obra compartidos dentro de la misma empresa (comportamiento previo)
    IF v_pid = '' AND p_empresa_id IS NOT NULL AND p_empresa_id = public.obtener_mi_empresa_id() THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

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

    -- Obra existente: solo dueño/admin/editores de ESA obra (owner_email del registro ya no basta)
    IF v_pid <> '' AND EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id::text = v_pid) THEN
        RETURN public.check_user_project_access(v_pid, ARRAY['owner', 'admin', 'editar', 'escribir']);
    END IF;

    -- Registros propios aún sin obra en la nube (IDs locales) o sin obra
    IF LOWER(TRIM(COALESCE(p_owner_email, ''))) = v_email THEN
        RETURN TRUE;
    END IF;

    IF v_pid = '' AND p_empresa_id IS NOT NULL AND p_empresa_id = public.obtener_mi_empresa_id()
       AND LOWER(TRIM(COALESCE(p_owner_email, ''))) IN ('', v_email) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- C1. Alta de colaboradores: el invitado solo puede darse de alta si el dueño lo invitó con ese rol
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "colaboradores_insert" ON public.proyecto_colaboradores;
CREATE POLICY "colaboradores_insert" ON public.proyecto_colaboradores
    FOR INSERT WITH CHECK (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
        OR (
            LOWER(TRIM(email_colaborador)) = public.current_user_email()
            AND rol IN ('editar', 'escribir', 'leer')
            AND public.cubikar_invitacion_valida(proyecto_id, rol)
        )
    );

-- ------------------------------------------------------------------------------
-- C2. Manifiestos y lápidas auxiliares: solo autor y miembros de las obras de ese anfitrión
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "chat_select" ON public.chat_mensajes;
CREATE POLICY "chat_select" ON public.chat_mensajes
    FOR SELECT USING (
        (
            proyecto_id IN ('__cubikar_tombstones__', '__cubikar_host_manifest__')
            AND public.cubikar_puede_leer_aux_chat(proyecto_id::text, autor_email::text, mensaje)
        )
        OR (proyecto_id NOT LIKE '__cubikar_%' AND public.check_user_project_access(proyecto_id::text))
    );

-- ------------------------------------------------------------------------------
-- H3 / C4. archivos_almacen y catalogos_maestros: lectura y escritura separadas
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Acceso archivos almacen empresa o colaborador" ON public.archivos_almacen;
DROP POLICY IF EXISTS "archivos_almacen_select" ON public.archivos_almacen;
DROP POLICY IF EXISTS "archivos_almacen_insert" ON public.archivos_almacen;
DROP POLICY IF EXISTS "archivos_almacen_update" ON public.archivos_almacen;
DROP POLICY IF EXISTS "archivos_almacen_delete" ON public.archivos_almacen;
CREATE POLICY "archivos_almacen_select" ON public.archivos_almacen FOR SELECT
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "archivos_almacen_insert" ON public.archivos_almacen FOR INSERT
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "archivos_almacen_update" ON public.archivos_almacen FOR UPDATE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "archivos_almacen_delete" ON public.archivos_almacen FOR DELETE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));

DROP POLICY IF EXISTS "Acceso catalogos maestros" ON public.catalogos_maestros;
DROP POLICY IF EXISTS "catalogos_maestros_select" ON public.catalogos_maestros;
DROP POLICY IF EXISTS "catalogos_maestros_insert" ON public.catalogos_maestros;
DROP POLICY IF EXISTS "catalogos_maestros_update" ON public.catalogos_maestros;
DROP POLICY IF EXISTS "catalogos_maestros_delete" ON public.catalogos_maestros;
CREATE POLICY "catalogos_maestros_select" ON public.catalogos_maestros FOR SELECT
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, ''::text));
CREATE POLICY "catalogos_maestros_insert" ON public.catalogos_maestros FOR INSERT
    WITH CHECK (LOWER(TRIM(owner_email)) = public.current_user_email() OR public.current_user_email() = 'hepc.90@gmail.com');
CREATE POLICY "catalogos_maestros_update" ON public.catalogos_maestros FOR UPDATE
    USING (LOWER(TRIM(owner_email)) = public.current_user_email() OR public.current_user_email() = 'hepc.90@gmail.com')
    WITH CHECK (LOWER(TRIM(owner_email)) = public.current_user_email() OR public.current_user_email() = 'hepc.90@gmail.com');
CREATE POLICY "catalogos_maestros_delete" ON public.catalogos_maestros FOR DELETE
    USING (LOWER(TRIM(owner_email)) = public.current_user_email() OR public.current_user_email() = 'hepc.90@gmail.com');

-- ------------------------------------------------------------------------------
-- M5. Lápidas de proyectos: nadie puede "eliminar" una obra vigente de otro anfitrión
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "tombstones_insert_owner" ON public.proyectos_eliminados;
CREATE POLICY "tombstones_insert_owner" ON public.proyectos_eliminados
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR public.check_user_project_access(proyecto_id, ARRAY['owner'])
            OR (
                LOWER(TRIM(owner_email)) = public.current_user_email()
                AND NOT EXISTS (
                    SELECT 1 FROM public.proyectos p
                    WHERE p.id::text = proyecto_id
                      AND LOWER(TRIM(COALESCE(p.owner_email, ''))) <> public.current_user_email()
                )
            )
        )
    );

-- ------------------------------------------------------------------------------
-- M1. La cuota de IA solo la gestiona el servidor (service_role)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regprocedure('public.check_and_increment_ai_quota(uuid,text,integer,integer)') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION public.check_and_increment_ai_quota(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
        GRANT EXECUTE ON FUNCTION public.check_and_increment_ai_quota(UUID, TEXT, INTEGER, INTEGER) TO service_role;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- C3. Realtime privado: cada obra solo para sus miembros; buzón personal por usuario
--     Tópicos usados por las apps:  obra_<uuid>   y   cubikar_user_<correo>
-- ------------------------------------------------------------------------------
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cubikar_realtime_select" ON realtime.messages;
CREATE POLICY "cubikar_realtime_select" ON realtime.messages
    FOR SELECT TO authenticated
    USING (
        (realtime.topic() LIKE 'obra\_%' AND public.check_user_project_access(substring(realtime.topic() FROM 6)))
        OR realtime.topic() = 'cubikar_user_' || public.current_user_email()
        OR (realtime.topic() = 'cubikar-superadmin-realtime' AND public.current_user_email() = 'hepc.90@gmail.com')
    );

DROP POLICY IF EXISTS "cubikar_realtime_insert" ON realtime.messages;
CREATE POLICY "cubikar_realtime_insert" ON realtime.messages
    FOR INSERT TO authenticated
    WITH CHECK (
        (realtime.topic() LIKE 'obra\_%' AND public.check_user_project_access(substring(realtime.topic() FROM 6)))
        OR (
            realtime.topic() LIKE 'cubikar\_user\_%'
            AND public.cubikar_comparte_obra_con(substring(realtime.topic() FROM 14))
        )
    );

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.cubikar_es_miembro_proyecto(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cubikar_comparte_obra_con(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cubikar_puede_leer_aux_chat(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cubikar_invitacion_valida(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.cubikar_es_miembro_proyecto(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.cubikar_comparte_obra_con(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.cubikar_puede_leer_aux_chat(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.cubikar_invitacion_valida(UUID, TEXT) FROM anon;

-- ==============================================================================
-- DESPUÉS DE EJECUTAR ESTE SCRIPT Y DE PUBLICAR LAS APPS (v20261119_cf36 o superior):
--   Supabase > Project Settings > Realtime > desactivar "Allow public access"
--   (obliga a que todos los canales sean privados y validados por estas políticas).
-- ==============================================================================
