-- ==============================================================================
-- CUBIKAR: CORRECCIONES DE SEGURIDAD E INTEGRIDAD (2026-11-17)
-- Aplica a: cubikar.app • Cubikar Construcción (ADM_CONST) • Cubikar Arquitectura (ADM_ARQ)
-- Ejecutar en: Supabase SQL Editor. Es idempotente (se puede ejecutar más de una vez).
-- ==============================================================================

-- 0. Helper: ¿la sentencia la ejecuta un actor del servidor?
--    Se basa en el rol del JWT de la petición (PostgREST). Sin JWT = SQL Editor, pg_cron o servicio Auth.
--    IMPORTANTE: no usar current_user dentro de funciones SECURITY DEFINER (siempre es el dueño 'postgres').
CREATE OR REPLACE FUNCTION public.request_jwt_role()
RETURNS TEXT AS $$
DECLARE
    v_role TEXT := NULLIF(current_setting('request.jwt.claim.role', true), '');
    v_claims TEXT := NULLIF(current_setting('request.jwt.claims', true), '');
BEGIN
    IF v_role IS NULL AND v_claims IS NOT NULL THEN
        BEGIN
            v_role := NULLIF(v_claims::jsonb->>'role', '');
        EXCEPTION WHEN others THEN
            v_role := NULL;
        END;
    END IF;
    RETURN COALESCE(v_role, '');
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_privileged_db_actor()
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT := public.request_jwt_role();
BEGIN
    RETURN v_role IN ('service_role', 'supabase_admin') OR v_role = '';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- 0.1 Corregir triggers existentes que se omitían para todos los usuarios
--     (usaban current_user IN ('postgres', ...) dentro de SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.protect_empresa_billing_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_privileged_db_actor() OR public.current_user_email() = 'hepc.90@gmail.com' THEN
        RETURN NEW;
    END IF;

    IF NEW.plan IS DISTINCT FROM OLD.plan
       OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
       OR NEW.estado_suscripcion IS DISTINCT FROM OLD.estado_suscripcion
       OR NEW.periodo_fin IS DISTINCT FROM OLD.periodo_fin
       OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
       OR NEW.acceso_arq IS DISTINCT FROM OLD.acceso_arq
       OR NEW.plan_arq IS DISTINCT FROM OLD.plan_arq
       OR NEW.periodo_fin_arq IS DISTINCT FROM OLD.periodo_fin_arq
       OR NEW.acceso_const IS DISTINCT FROM OLD.acceso_const
       OR NEW.plan_const IS DISTINCT FROM OLD.plan_const
       OR NEW.periodo_fin_const IS DISTINCT FROM OLD.periodo_fin_const THEN
        RAISE EXCEPTION 'No autorizado para modificar suscripción o facturación desde cliente.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_empresa_billing ON public.empresas;
CREATE TRIGGER trg_protect_empresa_billing
    BEFORE UPDATE ON public.empresas
    FOR EACH ROW EXECUTE FUNCTION public.protect_empresa_billing_columns();

CREATE OR REPLACE FUNCTION public.protect_colaborador_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_email TEXT := public.current_user_email();
BEGIN
    IF public.is_privileged_db_actor() OR v_email = 'hepc.90@gmail.com' THEN
        RETURN NEW;
    END IF;

    IF public.check_user_project_access(OLD.proyecto_id::text, ARRAY['owner', 'admin']) THEN
        RETURN NEW;
    END IF;

    IF LOWER(TRIM(OLD.email_colaborador)) = v_email THEN
        IF NEW.proyecto_id IS DISTINCT FROM OLD.proyecto_id
           OR LOWER(TRIM(NEW.email_colaborador)) IS DISTINCT FROM LOWER(TRIM(OLD.email_colaborador)) THEN
            RAISE EXCEPTION 'Solo el propietario o admin del proyecto puede modificar el rol o asignación.';
        END IF;
        IF NEW.rol IS DISTINCT FROM OLD.rol THEN
            IF COALESCE(NEW.estado_invitacion, '') = 'accepted' AND COALESCE(OLD.estado_invitacion, '') <> 'accepted' THEN
                NEW.rol := OLD.rol;
            ELSE
                RAISE EXCEPTION 'Solo el propietario o admin del proyecto puede modificar el rol o asignación.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Operación no autorizada sobre proyecto_colaboradores.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_colaborador_role ON public.proyecto_colaboradores;
CREATE TRIGGER trg_protect_colaborador_role
    BEFORE UPDATE ON public.proyecto_colaboradores
    FOR EACH ROW EXECUTE FUNCTION public.protect_colaborador_role_escalation();

CREATE OR REPLACE FUNCTION public.protect_proyecto_owner_change()
RETURNS TRIGGER AS $$
DECLARE
    v_email TEXT := public.current_user_email();
BEGIN
    IF public.is_privileged_db_actor() OR v_email = 'hepc.90@gmail.com' THEN
        RETURN NEW;
    END IF;

    IF LOWER(TRIM(COALESCE(OLD.owner_email, ''))) <> v_email THEN
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

DROP TRIGGER IF EXISTS trg_protect_proyecto_owner ON public.proyectos;
CREATE TRIGGER trg_protect_proyecto_owner
    BEFORE UPDATE ON public.proyectos
    FOR EACH ROW EXECUTE FUNCTION public.protect_proyecto_owner_change();

-- ------------------------------------------------------------------------------
-- 1. cubikar_registros: impedir que un usuario se otorgue co-administrador o plan
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_registros_privileged_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_new_meta JSONB := COALESCE(NEW.metadata, '{}'::jsonb) - 'is_co_admin' - 'isCoAdmin';
    v_old_meta JSONB;
BEGIN
    IF public.is_privileged_db_actor() OR public.current_user_email() = 'hepc.90@gmail.com' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.metadata := v_new_meta;
        NEW.plan := 'free';
        NEW.billing_cycle := 'monthly';
        RETURN NEW;
    END IF;

    v_old_meta := COALESCE(OLD.metadata, '{}'::jsonb);
    IF v_old_meta ? 'is_co_admin' THEN
        v_new_meta := v_new_meta || jsonb_build_object('is_co_admin', v_old_meta->'is_co_admin');
    END IF;
    IF v_old_meta ? 'isCoAdmin' THEN
        v_new_meta := v_new_meta || jsonb_build_object('isCoAdmin', v_old_meta->'isCoAdmin');
    END IF;
    NEW.metadata := v_new_meta;
    NEW.plan := OLD.plan;
    NEW.billing_cycle := OLD.billing_cycle;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
    IF to_regclass('public.cubikar_registros') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_protect_registros_privileged ON public.cubikar_registros;
        CREATE TRIGGER trg_protect_registros_privileged
            BEFORE INSERT OR UPDATE ON public.cubikar_registros
            FOR EACH ROW EXECUTE FUNCTION public.protect_registros_privileged_fields();
    END IF;
END $$;

-- Revocar banderas de co-administrador que no fueron otorgadas por el servidor.
-- (El Administrador Maestro puede volver a otorgarlas desde el panel; se escriben con service_role.)
-- Descomentar solo si se desea limpiar todas las banderas existentes:
-- UPDATE public.cubikar_registros SET metadata = metadata - 'is_co_admin' - 'isCoAdmin';

-- ------------------------------------------------------------------------------
-- 2. empresas: un cliente no puede crear una empresa con plan/suscripción pagada
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanitize_empresa_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_privileged_db_actor() OR public.current_user_email() = 'hepc.90@gmail.com' THEN
        RETURN NEW;
    END IF;

    NEW.plan := 'free';
    NEW.billing_cycle := 'monthly';
    NEW.estado_suscripcion := 'trialing';
    NEW.periodo_fin := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.acceso_arq := false;
    NEW.plan_arq := NULL;
    NEW.periodo_fin_arq := NULL;
    NEW.acceso_const := false;
    NEW.plan_const := NULL;
    NEW.periodo_fin_const := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sanitize_empresa_insert ON public.empresas;
CREATE TRIGGER trg_sanitize_empresa_insert
    BEFORE INSERT ON public.empresas
    FOR EACH ROW EXECUTE FUNCTION public.sanitize_empresa_insert();

-- ------------------------------------------------------------------------------
-- 3. perfiles: un usuario no puede cambiar su empresa_id ni su rol
--    Excepción: asignación inicial (empresa_id NULL) a una empresa recién creada sin miembros.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_empresa_sin_miembros(p_empresa_id UUID, p_excluir_perfil UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN p_empresa_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id)
        AND NOT EXISTS (
            SELECT 1 FROM public.perfiles pf
            WHERE pf.empresa_id = p_empresa_id
              AND pf.id IS DISTINCT FROM p_excluir_perfil
        );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.protect_perfil_privileged_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_old_empresa UUID := CASE WHEN TG_OP = 'UPDATE' THEN OLD.empresa_id ELSE NULL END;
    v_old_rol TEXT := CASE WHEN TG_OP = 'UPDATE' THEN OLD.rol ELSE NULL END;
    v_initial_assignment BOOLEAN;
BEGIN
    IF public.is_privileged_db_actor() OR public.current_user_email() = 'hepc.90@gmail.com' THEN
        RETURN NEW;
    END IF;

    v_initial_assignment := v_old_empresa IS NULL
        AND NEW.empresa_id IS NOT NULL
        AND public.is_empresa_sin_miembros(NEW.empresa_id, NEW.id);

    IF NEW.empresa_id IS DISTINCT FROM v_old_empresa AND NOT v_initial_assignment THEN
        IF TG_OP = 'INSERT' AND NEW.empresa_id IS NULL THEN
            NULL;
        ELSE
            RAISE EXCEPTION 'No autorizado para cambiar la empresa del perfil.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NOT v_initial_assignment THEN
            NEW.rol := 'admin';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.rol IS DISTINCT FROM v_old_rol AND NOT v_initial_assignment THEN
        RAISE EXCEPTION 'No autorizado para cambiar el rol del perfil.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_perfil_privileged ON public.perfiles;
CREATE TRIGGER trg_protect_perfil_privileged
    BEFORE INSERT OR UPDATE ON public.perfiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_perfil_privileged_columns();

-- ------------------------------------------------------------------------------
-- 4. Lápidas de proyectos (__cubikar_tombstones__): solo el propietario, o si el proyecto ya no existe
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_write_project_tombstone(p_payload JSONB, p_mensaje TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_pid TEXT := TRIM(COALESCE(p_payload->>'projectId', p_mensaje, ''));
BEGIN
    IF public.current_user_email() = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;
    IF v_pid = '' THEN
        RETURN FALSE;
    END IF;
    IF v_pid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN TRUE;
    END IF;
    RETURN NOT EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = v_pid::uuid)
        OR public.is_proyecto_owner(v_pid::uuid);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "chat_insert" ON public.chat_mensajes;
CREATE POLICY "chat_insert" ON public.chat_mensajes
    FOR INSERT WITH CHECK (
        public.can_upsert_chat_message(id, proyecto_id, autor_email)
        AND (
            proyecto_id <> '__cubikar_tombstones__'
            OR public.can_write_project_tombstone(payload_json, mensaje)
        )
    );

DROP POLICY IF EXISTS "chat_update" ON public.chat_mensajes;
CREATE POLICY "chat_update" ON public.chat_mensajes
    FOR UPDATE USING (
        (
            proyecto_id IN ('__cubikar_tombstones__', '__cubikar_host_manifest__')
            AND auth.role() = 'authenticated'
            AND (LOWER(TRIM(autor_email)) = public.current_user_email() OR public.current_user_email() = 'hepc.90@gmail.com')
        )
        OR (
            proyecto_id NOT LIKE '__cubikar_%'
            AND (
                LOWER(TRIM(autor_email)) = public.current_user_email()
                OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
                OR public.current_user_email() = 'hepc.90@gmail.com'
            )
        )
    )
    WITH CHECK (
        (
            proyecto_id = '__cubikar_host_manifest__'
            AND auth.role() = 'authenticated'
            AND (LOWER(TRIM(autor_email)) = public.current_user_email() OR public.current_user_email() = 'hepc.90@gmail.com')
        )
        OR (
            proyecto_id = '__cubikar_tombstones__'
            AND auth.role() = 'authenticated'
            AND (LOWER(TRIM(autor_email)) = public.current_user_email() OR public.current_user_email() = 'hepc.90@gmail.com')
            AND public.can_write_project_tombstone(payload_json, mensaje)
        )
        OR (
            proyecto_id NOT LIKE '__cubikar_%'
            AND (
                LOWER(TRIM(autor_email)) = public.current_user_email()
                OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
                OR public.current_user_email() = 'hepc.90@gmail.com'
            )
        )
    );

-- ------------------------------------------------------------------------------
-- 5. Colaboradores con rol Editor pueden crear proyectos en el espacio de su anfitrión
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_editor_colaborador_de_anfitrion(p_host_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    u_email TEXT := public.current_user_email();
    v_host TEXT := LOWER(TRIM(COALESCE(p_host_email, '')));
BEGIN
    IF u_email = '' OR v_host = '' OR v_host = u_email THEN
        RETURN FALSE;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.proyecto_colaboradores pc
        INNER JOIN public.proyectos p ON p.id = pc.proyecto_id
        WHERE LOWER(TRIM(pc.email_colaborador)) = u_email
          AND pc.rol = 'editar'
          AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'accepted'))) = 'accepted'
          AND LOWER(TRIM(COALESCE(p.owner_email, ''))) = v_host
          AND p.deleted_at IS NULL
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM auth.users au
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(au.raw_user_meta_data->'cubikar_cloud_state_v2'->'sentPlanInvitations') = 'array'
                 THEN au.raw_user_meta_data->'cubikar_cloud_state_v2'->'sentPlanInvitations'
                 ELSE '[]'::jsonb END
        ) inv
        WHERE LOWER(TRIM(au.email)) = v_host
          AND LOWER(TRIM(COALESCE(inv->>'email', ''))) = u_email
          AND LOWER(TRIM(COALESCE(inv->>'status', ''))) IN ('accepted', 'active')
          AND COALESCE(NULLIF(TRIM(inv->>'role'), ''), 'editar') = 'editar'
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION public.can_insert_or_upsert_proyecto(
    p_id UUID,
    p_owner_email TEXT,
    p_empresa_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    u_email TEXT := public.current_user_email();
    v_existing_id UUID;
BEGIN
    IF auth.role() <> 'authenticated' OR u_email = '' THEN
        RETURN FALSE;
    END IF;

    IF u_email = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;

    SELECT p.id INTO v_existing_id FROM public.proyectos p WHERE p.id = p_id LIMIT 1;

    IF v_existing_id IS NULL THEN
        RETURN LOWER(TRIM(COALESCE(p_owner_email, ''))) = u_email
            OR (COALESCE(TRIM(p_owner_email), '') = '' AND (p_empresa_id IS NULL OR p_empresa_id = public.obtener_mi_empresa_id()))
            OR public.is_editor_colaborador_de_anfitrion(p_owner_email);
    END IF;

    RETURN public.check_user_project_access(p_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Al insertar un proyecto creado por un colaborador en el espacio del anfitrión,
-- registrar al anfitrión como 'owner' y al creador como 'editar' para que ambos lo vean.
CREATE OR REPLACE FUNCTION public.trg_after_insert_proyecto_colaborador_creador()
RETURNS TRIGGER AS $$
DECLARE
    v_owner TEXT := LOWER(TRIM(COALESCE(NEW.owner_email, '')));
    v_actor TEXT := public.current_user_email();
BEGIN
    IF v_owner = '' OR v_actor = '' OR v_actor = v_owner THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.proyecto_colaboradores (proyecto_id, email_colaborador, nombre_colaborador, rol, estado_invitacion, updated_at)
    VALUES
        (NEW.id, v_owner, SPLIT_PART(v_owner, '@', 1), 'owner', 'accepted', timezone('utc'::text, now())),
        (NEW.id, v_actor, SPLIT_PART(v_actor, '@', 1), 'editar', 'accepted', timezone('utc'::text, now()))
    ON CONFLICT ON CONSTRAINT uq_proyecto_colaborador DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proyecto_colaborador_creador ON public.proyectos;
CREATE TRIGGER trg_proyecto_colaborador_creador
    AFTER INSERT ON public.proyectos
    FOR EACH ROW EXECUTE FUNCTION public.trg_after_insert_proyecto_colaborador_creador();

-- ------------------------------------------------------------------------------
-- 6. Permisos de ejecución
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_privileged_db_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_privileged_db_actor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_project_tombstone(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_editor_colaborador_de_anfitrion(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_empresa_sin_miembros(UUID, UUID) TO authenticated;
