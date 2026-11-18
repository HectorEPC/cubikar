-- ==============================================================================
-- CUBIKAR: MIGRACIÓN MAESTRA CONSOLIDADA (SQL IDEMPOTENTE)
-- Aplica a: cubikar.app • Cubikar Construcción (ADM_CONST) • Cubikar Arquitectura (ADM_ARQ)
-- Ejecutar completo en: Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ACTUALIZACIÓN DE ESQUEMA: empresas, perfiles, proyectos, catalogo_conceptos,
--    insumos_apu y chat_mensajes
-- ==============================================================================

-- 1.1 Columnas de membresías independientes y Stripe en public.empresas
ALTER TABLE IF EXISTS public.empresas
    ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS acceso_arq BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS plan_arq VARCHAR(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS periodo_fin_arq TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS acceso_const BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS plan_const VARCHAR(50) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS periodo_fin_const TIMESTAMPTZ DEFAULT NULL;

-- 1.2 Columnas multiusuario en public.proyectos
DO $$
BEGIN
    IF to_regclass('public.proyectos') IS NOT NULL THEN
        ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255) NOT NULL DEFAULT '';
        ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS tipo_obra VARCHAR(100) DEFAULT 'Edificación';
        ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS pct_seguros_fianzas NUMERIC(8, 4) DEFAULT 1.0000;
        ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS pct_fasar NUMERIC(8, 4) DEFAULT 70.0000;
        ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS configuracion JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
        ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS deleted_by_email VARCHAR(255) DEFAULT '';
        ALTER TABLE public.proyectos ALTER COLUMN empresa_id DROP NOT NULL;

        -- Backfill owner_email en proyectos heredados que solo tenían empresa_id
        UPDATE public.proyectos p
        SET owner_email = LOWER(TRIM(pf.email))
        FROM public.perfiles pf
        WHERE COALESCE(TRIM(p.owner_email), '') = ''
          AND p.empresa_id IS NOT NULL
          AND pf.empresa_id = p.empresa_id
          AND pf.rol = 'owner'
          AND COALESCE(TRIM(pf.email), '') <> '';
    END IF;
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_proyectos_owner_email ON public.proyectos(LOWER(owner_email));
CREATE INDEX IF NOT EXISTS idx_proyectos_updated_at ON public.proyectos(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_proyectos_deleted_at ON public.proyectos(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proyectos_owner_active ON public.proyectos(LOWER(owner_email), updated_at DESC) WHERE deleted_at IS NULL;

-- 1.3 Columnas en public.catalogo_conceptos
DO $$
BEGIN
    IF to_regclass('public.catalogo_conceptos') IS NOT NULL THEN
        ALTER TABLE public.catalogo_conceptos ADD COLUMN IF NOT EXISTS insumos JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE public.catalogo_conceptos ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT NULL;
    END IF;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- 1.4 Ampliar tipos válidos en public.insumos_apu (Material, Mano de Obra, Herramienta, Equipo, Maquinaria, Subcontrato, Flete, Auxiliar)
DO $$
DECLARE
    v_conname TEXT;
BEGIN
    IF to_regclass('public.insumos_apu') IS NOT NULL THEN
        FOR v_conname IN
            SELECT c.conname
            FROM pg_constraint c
            WHERE c.conrelid = 'public.insumos_apu'::regclass
              AND c.contype = 'c'
              AND pg_get_constraintdef(c.oid) ILIKE '%tipo%'
        LOOP
            EXECUTE format('ALTER TABLE public.insumos_apu DROP CONSTRAINT IF EXISTS %I', v_conname);
        END LOOP;

        ALTER TABLE public.insumos_apu
            ADD CONSTRAINT insumos_apu_tipo_check
            CHECK (tipo IN ('Material', 'Mano de Obra', 'Herramienta', 'Equipo', 'Maquinaria', 'Subcontrato', 'Flete', 'Auxiliar'));
    END IF;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- 1.5 Garantizar tabla y columnas completas en public.chat_mensajes (incluyendo migración desde schema.sql)
CREATE TABLE IF NOT EXISTS public.chat_mensajes (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id VARCHAR(255) NOT NULL,
    autor_email VARCHAR(255) NOT NULL DEFAULT '',
    autor_nombre VARCHAR(255) NOT NULL DEFAULT '',
    autor_avatar TEXT DEFAULT '',
    autor_avatar_url TEXT DEFAULT '',
    mensaje TEXT NOT NULL DEFAULT '',
    partida_id VARCHAR(100) DEFAULT NULL,
    etiquetas JSONB DEFAULT '[]'::jsonb,
    adjuntos JSONB DEFAULT '[]'::jsonb,
    payload_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    IF to_regclass('public.chat_mensajes') IS NOT NULL THEN
        ALTER TABLE public.chat_mensajes DROP CONSTRAINT IF EXISTS chat_mensajes_proyecto_id_fkey;
        ALTER TABLE public.chat_mensajes ALTER COLUMN id TYPE VARCHAR(255);
        ALTER TABLE public.chat_mensajes ALTER COLUMN proyecto_id TYPE VARCHAR(255);
        ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS autor_avatar TEXT DEFAULT '';
        ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS autor_avatar_url TEXT DEFAULT '';
        ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS partida_id VARCHAR(100) DEFAULT NULL;
        ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS etiquetas JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS adjuntos JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS payload_json JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;
    END IF;
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_proyecto ON public.chat_mensajes(proyecto_id, created_at DESC);

-- 1.6 Tabla public.proyecto_colaboradores (si no existía aún)
CREATE TABLE IF NOT EXISTS public.proyecto_colaboradores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    email_colaborador VARCHAR(255) NOT NULL,
    nombre_colaborador VARCHAR(255) DEFAULT '',
    rol VARCHAR(50) NOT NULL DEFAULT 'editar' CHECK (rol IN ('owner', 'admin', 'editar', 'escribir', 'leer')),
    estado_invitacion VARCHAR(50) NOT NULL DEFAULT 'accepted' CHECK (estado_invitacion IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_proyecto_colaborador UNIQUE (proyecto_id, email_colaborador)
);

CREATE INDEX IF NOT EXISTS idx_colab_email ON public.proyecto_colaboradores(LOWER(email_colaborador));
CREATE INDEX IF NOT EXISTS idx_colab_proyecto ON public.proyecto_colaboradores(proyecto_id);

-- 1.7 Tabla autoritativa de lápidas de proyectos eliminados (Sincronización Multi-PC)
CREATE TABLE IF NOT EXISTS public.proyectos_eliminados (
    proyecto_id TEXT PRIMARY KEY,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    deleted_by_email VARCHAR(255) NOT NULL DEFAULT '',
    collaborator_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.proyectos_eliminados
    ADD COLUMN IF NOT EXISTS collaborator_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS idx_proyectos_eliminados_owner ON public.proyectos_eliminados(LOWER(owner_email));
CREATE INDEX IF NOT EXISTS idx_proyectos_eliminados_deleted_by ON public.proyectos_eliminados(LOWER(deleted_by_email));
CREATE INDEX IF NOT EXISTS idx_proyectos_eliminados_colabs ON public.proyectos_eliminados USING GIN(collaborator_emails);

-- ==============================================================================
-- 2. LLAVES FORÁNEAS CON ON DELETE CASCADE Y CASCADA EN TABLAS DE MÓDULOS
-- ==============================================================================

DO $$
DECLARE
    fk RECORD;
    v_col TEXT;
    v_ref_table TEXT;
    v_ref_col TEXT;
    v_on_delete TEXT;
BEGIN
    FOR fk IN
        SELECT c.conname,
               c.conrelid,
               c.conrelid::regclass::text AS child_table,
               c.confrelid,
               c.confrelid::regclass::text AS parent_table,
               c.confdeltype,
               c.conkey[1] AS child_attnum,
               c.confkey[1] AS parent_attnum
        FROM pg_constraint c
        WHERE c.contype = 'f'
          AND array_length(c.conkey, 1) = 1
          AND c.confrelid IN (
              COALESCE(to_regclass('public.proyectos'), 0::oid),
              COALESCE(to_regclass('public.catalogo_conceptos'), 0::oid),
              COALESCE(to_regclass('public.estimaciones'), 0::oid),
              COALESCE(to_regclass('public.empresas'), 0::oid),
              COALESCE(to_regclass('public.perfiles'), 0::oid)
          )
    LOOP
        SELECT a.attname INTO v_col FROM pg_attribute a WHERE a.attrelid = fk.conrelid AND a.attnum = fk.child_attnum;
        SELECT a.attname INTO v_ref_col FROM pg_attribute a WHERE a.attrelid = fk.confrelid AND a.attnum = fk.parent_attnum;
        v_ref_table := fk.parent_table;
        v_on_delete := NULL;

        IF v_ref_table IN ('public.proyectos', 'proyectos') AND v_col = 'proyecto_id' THEN
            IF fk.confdeltype <> 'c' THEN v_on_delete := 'CASCADE'; END IF;
        ELSIF v_ref_table IN ('public.catalogo_conceptos', 'catalogo_conceptos') THEN
            IF fk.child_table IN ('public.cronograma_actividades', 'cronograma_actividades') AND v_col = 'concepto_id' THEN
                IF fk.confdeltype <> 'n' THEN v_on_delete := 'SET NULL'; END IF;
            ELSIF fk.confdeltype <> 'c' THEN
                v_on_delete := 'CASCADE';
            END IF;
        ELSIF v_ref_table IN ('public.estimaciones', 'estimaciones') AND fk.confdeltype <> 'c' THEN
            v_on_delete := 'CASCADE';
        ELSIF fk.child_table IN ('public.perfiles', 'perfiles') AND v_col = 'empresa_id' THEN
            IF fk.confdeltype <> 'n' THEN v_on_delete := 'SET NULL'; END IF;
        ELSIF fk.child_table IN ('public.proyectos', 'proyectos') AND v_col = 'creado_por' THEN
            IF fk.confdeltype <> 'n' THEN v_on_delete := 'SET NULL'; END IF;
        END IF;

        IF v_on_delete IS NOT NULL AND v_col IS NOT NULL AND v_ref_col IS NOT NULL THEN
            EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', fk.child_table, fk.conname);
            EXECUTE format(
                'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s',
                fk.child_table, fk.conname, v_col, v_ref_table, v_ref_col, v_on_delete
            );
        END IF;
    END LOOP;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- ==============================================================================
-- 3. FUNCIONES DE IDENTIDAD Y ACCESO MULTIUSUARIO
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT AS $$
    SELECT LOWER(TRIM(COALESCE(auth.jwt()->>'email', '')));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.obtener_mi_empresa_id()
RETURNS UUID AS $$
    SELECT empresa_id FROM public.perfiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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

CREATE OR REPLACE FUNCTION public.check_user_project_access(
    proj_id UUID,
    req_roles TEXT[] DEFAULT ARRAY['owner', 'admin', 'editar', 'escribir', 'leer']
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.check_user_project_access(proj_id::text, req_roles);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Reemplaza tiene_acceso_registro eliminando dependencia insegura de public.invitaciones / pending
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

    IF LOWER(TRIM(COALESCE(p_owner_email, ''))) = v_email THEN
        RETURN TRUE;
    END IF;

    IF v_pid <> '' THEN
        RETURN public.check_user_project_access(v_pid);
    END IF;

    IF p_empresa_id IS NOT NULL AND p_empresa_id = public.obtener_mi_empresa_id() THEN
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
            OR (COALESCE(TRIM(p_owner_email), '') = '' AND (p_empresa_id IS NULL OR p_empresa_id = public.obtener_mi_empresa_id()));
    END IF;

    RETURN public.check_user_project_access(p_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_upsert_chat_message(
    p_msg_id VARCHAR,
    p_proyecto_id VARCHAR,
    p_autor_email VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    u_email TEXT := public.current_user_email();
    v_pid TEXT := TRIM(COALESCE(p_proyecto_id, ''));
    v_author TEXT := LOWER(TRIM(COALESCE(p_autor_email, '')));
    v_exists BOOLEAN := FALSE;
BEGIN
    IF auth.role() <> 'authenticated' OR u_email = '' OR v_pid = '' THEN
        RETURN FALSE;
    END IF;

    IF u_email = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;

    IF v_pid IN ('__cubikar_tombstones__', '__cubikar_host_manifest__') THEN
        RETURN v_author = u_email;
    END IF;

    IF v_pid LIKE '__cubikar_%' THEN
        RETURN FALSE;
    END IF;

    IF NOT public.check_user_project_access(v_pid) THEN
        RETURN FALSE;
    END IF;

    IF v_author = '' OR v_author = u_email THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.chat_mensajes cm WHERE cm.id = p_msg_id) INTO v_exists;
    IF v_exists THEN
        RETURN public.check_user_project_access(v_pid, ARRAY['owner', 'admin']);
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 4. TRIGGERS DE INTEGRIDAD, SEGURIDAD Y ELIMINACIÓN EN CASCADA
-- ==============================================================================

-- 4.1 Trigger: al eliminar una fila de public.proyectos, registrar lápida global en
--     public.proyectos_eliminados y purgar registros vinculados con proyecto_id TEXT
CREATE OR REPLACE FUNCTION public.trg_before_delete_proyecto()
RETURNS TRIGGER AS $$
DECLARE
    v_colabs TEXT[] := ARRAY[]::TEXT[];
    v_deleter TEXT := public.current_user_email();
BEGIN
    IF to_regclass('public.proyecto_colaboradores') IS NOT NULL THEN
        SELECT COALESCE(array_agg(DISTINCT LOWER(TRIM(pc.email_colaborador))), ARRAY[]::TEXT[])
          INTO v_colabs
          FROM public.proyecto_colaboradores pc
         WHERE pc.proyecto_id = OLD.id;
    END IF;

    IF to_regclass('public.proyectos_eliminados') IS NOT NULL THEN
        INSERT INTO public.proyectos_eliminados (proyecto_id, owner_email, deleted_by_email, collaborator_emails, deleted_at)
        VALUES (
            OLD.id::text,
            LOWER(TRIM(COALESCE(OLD.owner_email, ''))),
            COALESCE(NULLIF(v_deleter, ''), LOWER(TRIM(COALESCE(OLD.owner_email, '')))),
            COALESCE(v_colabs, ARRAY[]::TEXT[]),
            timezone('utc'::text, now())
        )
        ON CONFLICT (proyecto_id) DO UPDATE SET
            owner_email = COALESCE(NULLIF(EXCLUDED.owner_email, ''), public.proyectos_eliminados.owner_email),
            deleted_by_email = EXCLUDED.deleted_by_email,
            collaborator_emails = ARRAY(
                SELECT DISTINCT e FROM unnest(public.proyectos_eliminados.collaborator_emails || EXCLUDED.collaborator_emails) AS e
                WHERE COALESCE(e, '') <> ''
            ),
            deleted_at = EXCLUDED.deleted_at;
    END IF;

    IF to_regclass('public.chat_mensajes') IS NOT NULL THEN
        DELETE FROM public.chat_mensajes WHERE proyecto_id = OLD.id::text;
    END IF;
    IF to_regclass('public.bitacora_notas') IS NOT NULL THEN
        DELETE FROM public.bitacora_notas WHERE proyecto_id = OLD.id::text;
    END IF;
    IF to_regclass('public.bitacora_config') IS NOT NULL THEN
        DELETE FROM public.bitacora_config WHERE proyecto_id = OLD.id::text;
    END IF;
    IF to_regclass('public.compras_gastos') IS NOT NULL THEN
        DELETE FROM public.compras_gastos WHERE proyecto_id = OLD.id::text;
    END IF;
    IF to_regclass('public.proveedores') IS NOT NULL THEN
        DELETE FROM public.proveedores WHERE proyecto_id = OLD.id::text;
    END IF;
    IF to_regclass('public.cronograma_config') IS NOT NULL THEN
        DELETE FROM public.cronograma_config WHERE proyecto_id = OLD.id::text;
    END IF;
    IF to_regclass('public.invitaciones') IS NOT NULL THEN
        DELETE FROM public.invitaciones WHERE proyecto_id = OLD.id::text;
    END IF;
    IF to_regclass('public.archivos_almacen') IS NOT NULL THEN
        UPDATE public.archivos_almacen
           SET deleted_at = COALESCE(deleted_at, timezone('utc'::text, now()))
         WHERE proyecto_id = OLD.id::text;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proyectos_before_delete ON public.proyectos;
CREATE TRIGGER trg_proyectos_before_delete
    BEFORE DELETE ON public.proyectos
    FOR EACH ROW EXECUTE FUNCTION public.trg_before_delete_proyecto();

-- 4.2 Trigger: proteger campos de facturación/suscripción en public.empresas
CREATE OR REPLACE FUNCTION public.protect_empresa_billing_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
    v_email TEXT := public.current_user_email();
BEGIN
    IF v_role IN ('service_role', 'supabase_admin')
       OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', NULLIF(current_setting('request.jwt.claim.role', true), ''), '') = '' THEN
        RETURN NEW;
    END IF;

    IF v_email = 'hepc.90@gmail.com' THEN
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

-- 4.3 Trigger: evitar que un colaborador no propietario se escale su propio rol al aceptar invitación
CREATE OR REPLACE FUNCTION public.protect_colaborador_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
    v_email TEXT := public.current_user_email();
BEGIN
    IF v_role IN ('service_role', 'supabase_admin')
       OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', NULLIF(current_setting('request.jwt.claim.role', true), ''), '') = ''
       OR v_email = 'hepc.90@gmail.com' THEN
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
        -- Cuando el invitado acepta o actualiza su propia invitación, preservar su rol original de BD sin escalarlo
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

-- 4.3B Trigger: evitar que un colaborador no propietario reasigne owner_email o empresa_id del proyecto
CREATE OR REPLACE FUNCTION public.protect_proyecto_owner_change()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
    v_email TEXT := public.current_user_email();
BEGIN
    IF v_role IN ('service_role', 'supabase_admin')
       OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', NULLIF(current_setting('request.jwt.claim.role', true), ''), '') = ''
       OR v_email = 'hepc.90@gmail.com' THEN
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

DROP TRIGGER IF EXISTS trg_protect_proyecto_owner ON public.proyectos;
CREATE TRIGGER trg_protect_proyecto_owner
    BEFORE UPDATE ON public.proyectos
    FOR EACH ROW EXECUTE FUNCTION public.protect_proyecto_owner_change();

-- 4.4 Asegurar RPC administrativa obtener_usuarios_admin() restringida al Superadmin
CREATE OR REPLACE FUNCTION public.obtener_usuarios_admin()
RETURNS TABLE (
    id UUID,
    email VARCHAR,
    nombre_completo VARCHAR,
    avatar_url TEXT,
    sexo VARCHAR,
    rol VARCHAR,
    empresa_id UUID,
    empresa_nombre VARCHAR,
    plan VARCHAR,
    estado_suscripcion VARCHAR,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
    v_email TEXT := public.current_user_email();
BEGIN
    IF v_role NOT IN ('service_role', 'supabase_admin') AND v_email <> 'hepc.90@gmail.com' THEN
        RAISE EXCEPTION 'Acceso denegado: solo el Administrador Maestro puede consultar usuarios.';
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.email,
        p.nombre_completo,
        p.avatar_url,
        p.sexo,
        p.rol,
        p.empresa_id,
        COALESCE(e.nombre, 'Mi Empresa')::VARCHAR AS empresa_nombre,
        COALESCE(e.plan, 'free')::VARCHAR AS plan,
        COALESCE(e.estado_suscripcion, 'active')::VARCHAR AS estado_suscripcion,
        p.created_at,
        p.updated_at
    FROM public.perfiles p
    LEFT JOIN public.empresas e ON p.empresa_id = e.id
    ORDER BY p.created_at DESC;
END;
$$;

-- ==============================================================================
-- 5. POLÍTICAS RLS ENDURECIDAS EN TODAS LAS TABLAS
-- ==============================================================================

-- 5.1 public.empresas y public.perfiles
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Los usuarios solo ven su empresa" ON public.empresas;
CREATE POLICY "Los usuarios solo ven su empresa"
    ON public.empresas FOR SELECT
    USING (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR id = public.obtener_mi_empresa_id()
    );

DROP POLICY IF EXISTS "Los dueños pueden editar su empresa" ON public.empresas;
CREATE POLICY "Los dueños pueden editar su empresa"
    ON public.empresas FOR UPDATE
    USING (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR EXISTS (
            SELECT 1 FROM public.perfiles pf
            WHERE pf.id = auth.uid()
              AND pf.empresa_id = empresas.id
              AND pf.rol = 'owner'
        )
    )
    WITH CHECK (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR EXISTS (
            SELECT 1 FROM public.perfiles pf
            WHERE pf.id = auth.uid()
              AND pf.empresa_id = empresas.id
              AND pf.rol = 'owner'
        )
    );

DROP POLICY IF EXISTS "Los usuarios ven perfiles de su misma empresa" ON public.perfiles;
CREATE POLICY "Los usuarios ven perfiles de su misma empresa"
    ON public.perfiles FOR SELECT
    USING (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR id = auth.uid()
        OR empresa_id = public.obtener_mi_empresa_id()
    );

DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.perfiles;
CREATE POLICY "Los usuarios pueden actualizar su propio perfil"
    ON public.perfiles FOR UPDATE
    USING (public.current_user_email() = 'hepc.90@gmail.com' OR id = auth.uid())
    WITH CHECK (public.current_user_email() = 'hepc.90@gmail.com' OR id = auth.uid());

DROP POLICY IF EXISTS "Los usuarios pueden eliminar su propio perfil" ON public.perfiles;
CREATE POLICY "Los usuarios pueden eliminar su propio perfil"
    ON public.perfiles FOR DELETE
    USING (public.current_user_email() = 'hepc.90@gmail.com' OR id = auth.uid());

-- 5.2 public.proyectos
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver proyectos de mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "Crear proyectos en mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "Editar proyectos de mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "Eliminar proyectos de mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_select_colaboracion" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_insert_auth" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_update_colaboracion" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_delete_owner" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_delete_colaboracion" ON public.proyectos;

CREATE POLICY "proyectos_select_colaboracion" ON public.proyectos
    FOR SELECT USING (public.check_user_project_access(id::text));

CREATE POLICY "proyectos_insert_auth" ON public.proyectos
    FOR INSERT WITH CHECK (
        public.can_insert_or_upsert_proyecto(id, owner_email::text, empresa_id)
    );

CREATE POLICY "proyectos_update_colaboracion" ON public.proyectos
    FOR UPDATE USING (
        public.check_user_project_access(id::text, ARRAY['owner', 'admin', 'editar', 'escribir'])
    )
    WITH CHECK (
        public.can_insert_or_upsert_proyecto(id, owner_email::text, empresa_id)
    );

CREATE POLICY "proyectos_delete_colaboracion" ON public.proyectos
    FOR DELETE USING (public.is_proyecto_owner(id));

-- 5.3 public.proyectos_eliminados
ALTER TABLE public.proyectos_eliminados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tombstones_select_own" ON public.proyectos_eliminados;
DROP POLICY IF EXISTS "tombstones_insert_owner" ON public.proyectos_eliminados;
DROP POLICY IF EXISTS "tombstones_update_owner" ON public.proyectos_eliminados;
DROP POLICY IF EXISTS "tombstones_delete_owner" ON public.proyectos_eliminados;

CREATE POLICY "tombstones_select_own" ON public.proyectos_eliminados
    FOR SELECT USING (
        auth.role() = 'authenticated' AND (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(owner_email)) = public.current_user_email()
            OR LOWER(TRIM(deleted_by_email)) = public.current_user_email()
            OR public.current_user_email() = ANY(collaborator_emails)
        )
    );

CREATE POLICY "tombstones_insert_owner" ON public.proyectos_eliminados
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated' AND (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR public.check_user_project_access(proyecto_id, ARRAY['owner'])
            OR LOWER(TRIM(owner_email)) = public.current_user_email()
        )
    );

CREATE POLICY "tombstones_update_owner" ON public.proyectos_eliminados
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(owner_email)) = public.current_user_email()
            OR LOWER(TRIM(deleted_by_email)) = public.current_user_email()
        )
    );

CREATE POLICY "tombstones_delete_owner" ON public.proyectos_eliminados
    FOR DELETE USING (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR LOWER(TRIM(owner_email)) = public.current_user_email()
    );

-- 5.4 public.proyecto_colaboradores (eliminado OR auth.role() = 'authenticated')
ALTER TABLE public.proyecto_colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colaboradores_select" ON public.proyecto_colaboradores;
DROP POLICY IF EXISTS "colaboradores_insert" ON public.proyecto_colaboradores;
DROP POLICY IF EXISTS "colaboradores_update" ON public.proyecto_colaboradores;
DROP POLICY IF EXISTS "colaboradores_delete" ON public.proyecto_colaboradores;

CREATE POLICY "colaboradores_select" ON public.proyecto_colaboradores
    FOR SELECT USING (
        LOWER(TRIM(email_colaborador)) = public.current_user_email()
        OR public.check_user_project_access(proyecto_id::text)
    );

CREATE POLICY "colaboradores_insert" ON public.proyecto_colaboradores
    FOR INSERT WITH CHECK (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
        OR (
            LOWER(TRIM(email_colaborador)) = public.current_user_email()
            AND estado_invitacion = 'accepted'
            AND rol IN ('editar', 'escribir', 'leer')
        )
    );

CREATE POLICY "colaboradores_update" ON public.proyecto_colaboradores
    FOR UPDATE USING (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
        OR LOWER(TRIM(email_colaborador)) = public.current_user_email()
    );

CREATE POLICY "colaboradores_delete" ON public.proyecto_colaboradores
    FOR DELETE USING (
        public.current_user_email() = 'hepc.90@gmail.com'
        OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
        OR LOWER(TRIM(email_colaborador)) = public.current_user_email()
    );

-- 5.5 public.catalogo_conceptos
ALTER TABLE public.catalogo_conceptos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "conceptos_select" ON public.catalogo_conceptos;
DROP POLICY IF EXISTS "conceptos_insert" ON public.catalogo_conceptos;
DROP POLICY IF EXISTS "conceptos_update" ON public.catalogo_conceptos;
DROP POLICY IF EXISTS "conceptos_delete" ON public.catalogo_conceptos;
DROP POLICY IF EXISTS "Acceso a conceptos si perteneces al proyecto" ON public.catalogo_conceptos;

CREATE POLICY "conceptos_select" ON public.catalogo_conceptos
    FOR SELECT USING (public.check_user_project_access(proyecto_id::text));

CREATE POLICY "conceptos_insert" ON public.catalogo_conceptos
    FOR INSERT WITH CHECK (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));

CREATE POLICY "conceptos_update" ON public.catalogo_conceptos
    FOR UPDATE USING (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));

CREATE POLICY "conceptos_delete" ON public.catalogo_conceptos
    FOR DELETE USING (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));

-- 5.6 public.insumos_apu (migrado a check_user_project_access)
ALTER TABLE public.insumos_apu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso a insumos si perteneces al concepto del proyecto" ON public.insumos_apu;
DROP POLICY IF EXISTS "insumos_apu_select" ON public.insumos_apu;
DROP POLICY IF EXISTS "insumos_apu_write" ON public.insumos_apu;
DROP POLICY IF EXISTS "insumos_apu_update" ON public.insumos_apu;
DROP POLICY IF EXISTS "insumos_apu_delete" ON public.insumos_apu;

CREATE POLICY "insumos_apu_select" ON public.insumos_apu
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.catalogo_conceptos c
            WHERE c.id = insumos_apu.concepto_id
              AND public.check_user_project_access(c.proyecto_id::text)
        )
    );

CREATE POLICY "insumos_apu_write" ON public.insumos_apu
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.catalogo_conceptos c
            WHERE c.id = insumos_apu.concepto_id
              AND public.check_user_project_access(c.proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir'])
        )
    );

CREATE POLICY "insumos_apu_update" ON public.insumos_apu
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.catalogo_conceptos c
            WHERE c.id = insumos_apu.concepto_id
              AND public.check_user_project_access(c.proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir'])
        )
    );

CREATE POLICY "insumos_apu_delete" ON public.insumos_apu
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.catalogo_conceptos c
            WHERE c.id = insumos_apu.concepto_id
              AND public.check_user_project_access(c.proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir'])
        )
    );

-- 5.7 public.estimaciones, public.estimacion_detalles y public.cronograma_actividades
ALTER TABLE public.estimaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimacion_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_actividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso a estimaciones de mi empresa" ON public.estimaciones;
DROP POLICY IF EXISTS "estimaciones_select" ON public.estimaciones;
DROP POLICY IF EXISTS "estimaciones_write" ON public.estimaciones;
DROP POLICY IF EXISTS "estimaciones_update" ON public.estimaciones;
DROP POLICY IF EXISTS "estimaciones_delete" ON public.estimaciones;

CREATE POLICY "estimaciones_select" ON public.estimaciones
    FOR SELECT USING (public.check_user_project_access(proyecto_id::text));
CREATE POLICY "estimaciones_write" ON public.estimaciones
    FOR INSERT WITH CHECK (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));
CREATE POLICY "estimaciones_update" ON public.estimaciones
    FOR UPDATE USING (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));
CREATE POLICY "estimaciones_delete" ON public.estimaciones
    FOR DELETE USING (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));

DROP POLICY IF EXISTS "Acceso a detalles de estimaciones" ON public.estimacion_detalles;
DROP POLICY IF EXISTS "estimacion_detalles_select" ON public.estimacion_detalles;
DROP POLICY IF EXISTS "estimacion_detalles_write" ON public.estimacion_detalles;
DROP POLICY IF EXISTS "estimacion_detalles_update" ON public.estimacion_detalles;
DROP POLICY IF EXISTS "estimacion_detalles_delete" ON public.estimacion_detalles;

CREATE POLICY "estimacion_detalles_select" ON public.estimacion_detalles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.estimaciones e WHERE e.id = estimacion_detalles.estimacion_id AND public.check_user_project_access(e.proyecto_id::text))
    );
CREATE POLICY "estimacion_detalles_write" ON public.estimacion_detalles
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.estimaciones e WHERE e.id = estimacion_detalles.estimacion_id AND public.check_user_project_access(e.proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']))
    );
CREATE POLICY "estimacion_detalles_update" ON public.estimacion_detalles
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.estimaciones e WHERE e.id = estimacion_detalles.estimacion_id AND public.check_user_project_access(e.proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']))
    );
CREATE POLICY "estimacion_detalles_delete" ON public.estimacion_detalles
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.estimaciones e WHERE e.id = estimacion_detalles.estimacion_id AND public.check_user_project_access(e.proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']))
    );

DROP POLICY IF EXISTS "Acceso a cronograma de mi empresa" ON public.cronograma_actividades;
DROP POLICY IF EXISTS "cronograma_select" ON public.cronograma_actividades;
DROP POLICY IF EXISTS "cronograma_write" ON public.cronograma_actividades;
DROP POLICY IF EXISTS "cronograma_update" ON public.cronograma_actividades;
DROP POLICY IF EXISTS "cronograma_delete" ON public.cronograma_actividades;

CREATE POLICY "cronograma_select" ON public.cronograma_actividades
    FOR SELECT USING (public.check_user_project_access(proyecto_id::text));
CREATE POLICY "cronograma_write" ON public.cronograma_actividades
    FOR INSERT WITH CHECK (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));
CREATE POLICY "cronograma_update" ON public.cronograma_actividades
    FOR UPDATE USING (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));
CREATE POLICY "cronograma_delete" ON public.cronograma_actividades
    FOR DELETE USING (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar', 'escribir']));

-- 5.7B Políticas separadas de lectura/escritura en tablas de módulos (bitacora_config, bitacora_notas, proveedores, compras_gastos, cronograma_config)
DO $$
DECLARE
    v_mod_table TEXT;
    v_mod_tables TEXT[] := ARRAY['bitacora_config', 'bitacora_notas', 'proveedores', 'compras_gastos', 'cronograma_config'];
BEGIN
    FOREACH v_mod_table IN ARRAY v_mod_tables LOOP
        IF to_regclass('public.' || v_mod_table) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "Acceso bitacora config" ON public.%I', v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "Acceso bitacora notas" ON public.%I', v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "Acceso proveedores" ON public.%I', v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "Acceso compras gastos" ON public.%I', v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "Acceso cronograma config" ON public.%I', v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "%I_select" ON public.%I', v_mod_table, v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "%I_insert" ON public.%I', v_mod_table, v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "%I_update" ON public.%I', v_mod_table, v_mod_table);
            EXECUTE format('DROP POLICY IF EXISTS "%I_delete" ON public.%I', v_mod_table, v_mod_table);

            EXECUTE format(
                'CREATE POLICY "%I_select" ON public.%I FOR SELECT USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))',
                v_mod_table, v_mod_table
            );
            EXECUTE format(
                'CREATE POLICY "%I_insert" ON public.%I FOR INSERT WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))',
                v_mod_table, v_mod_table
            );
            EXECUTE format(
                'CREATE POLICY "%I_update" ON public.%I FOR UPDATE USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text)) WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))',
                v_mod_table, v_mod_table
            );
            EXECUTE format(
                'CREATE POLICY "%I_delete" ON public.%I FOR DELETE USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))',
                v_mod_table, v_mod_table
            );
        END IF;
    END LOOP;
END $$;

-- 5.8 public.chat_mensajes (eliminado OR auth.role() = 'authenticated' y acceso anónimo a __cubikar_%)
ALTER TABLE public.chat_mensajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso chat proyecto" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_select" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_insert" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_update" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_delete" ON public.chat_mensajes;

CREATE POLICY "chat_select" ON public.chat_mensajes
    FOR SELECT USING (
        (proyecto_id IN ('__cubikar_tombstones__', '__cubikar_host_manifest__') AND auth.role() = 'authenticated')
        OR (proyecto_id NOT LIKE '__cubikar_%' AND public.check_user_project_access(proyecto_id::text))
    );

CREATE POLICY "chat_insert" ON public.chat_mensajes
    FOR INSERT WITH CHECK (
        public.can_upsert_chat_message(id, proyecto_id, autor_email)
    );

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
    );

CREATE POLICY "chat_delete" ON public.chat_mensajes
    FOR DELETE USING (
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
    );

-- 5.9 Cerrar políticas USING (true) en public.invitaciones y public.cubikar_registros
DO $$
BEGIN
    IF to_regclass('public.invitaciones') IS NOT NULL THEN
        ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Acceso a invitaciones" ON public.invitaciones;
        DROP POLICY IF EXISTS "invitaciones_select" ON public.invitaciones;
        DROP POLICY IF EXISTS "invitaciones_insert" ON public.invitaciones;
        DROP POLICY IF EXISTS "invitaciones_update" ON public.invitaciones;
        DROP POLICY IF EXISTS "invitaciones_delete" ON public.invitaciones;

        CREATE POLICY "invitaciones_select" ON public.invitaciones FOR SELECT USING (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(owner_email)) = public.current_user_email()
            OR LOWER(TRIM(invitee_email)) = public.current_user_email()
            OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
        );
        CREATE POLICY "invitaciones_insert" ON public.invitaciones FOR INSERT WITH CHECK (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR (
                LOWER(TRIM(owner_email)) = public.current_user_email()
                AND public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
            )
        );
        CREATE POLICY "invitaciones_update" ON public.invitaciones FOR UPDATE USING (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(owner_email)) = public.current_user_email()
            OR LOWER(TRIM(invitee_email)) = public.current_user_email()
            OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
        );
        CREATE POLICY "invitaciones_delete" ON public.invitaciones FOR DELETE USING (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(owner_email)) = public.current_user_email()
            OR LOWER(TRIM(invitee_email)) = public.current_user_email()
            OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
        );
    END IF;

    IF to_regclass('public.cubikar_registros') IS NOT NULL THEN
        ALTER TABLE public.cubikar_registros ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Permitir insercion publica de registros" ON public.cubikar_registros;
        DROP POLICY IF EXISTS "Permitir actualizacion publica de registros" ON public.cubikar_registros;
        DROP POLICY IF EXISTS "Permitir lectura de registros" ON public.cubikar_registros;
        DROP POLICY IF EXISTS "registros_select_own" ON public.cubikar_registros;
        DROP POLICY IF EXISTS "registros_insert_own" ON public.cubikar_registros;
        DROP POLICY IF EXISTS "registros_update_own" ON public.cubikar_registros;
        DROP POLICY IF EXISTS "registros_delete_own" ON public.cubikar_registros;

        CREATE POLICY "registros_select_own" ON public.cubikar_registros FOR SELECT USING (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(email)) = public.current_user_email()
        );
        CREATE POLICY "registros_insert_own" ON public.cubikar_registros FOR INSERT WITH CHECK (
            auth.role() = 'authenticated' AND (
                public.current_user_email() = 'hepc.90@gmail.com'
                OR LOWER(TRIM(email)) = public.current_user_email()
            )
        );
        CREATE POLICY "registros_update_own" ON public.cubikar_registros FOR UPDATE USING (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(email)) = public.current_user_email()
        );
        CREATE POLICY "registros_delete_own" ON public.cubikar_registros FOR DELETE USING (
            public.current_user_email() = 'hepc.90@gmail.com'
            OR LOWER(TRIM(email)) = public.current_user_email()
        );
    END IF;
END $$;

-- ==============================================================================
-- 5.5 TABLAS DE MÓDULOS OPERATIVOS (CRONOGRAMA, BITÁCORA, COMPRAS, ESTIMACIONES, ARCHIVOS)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE IF EXISTS public.estimaciones
    ADD COLUMN IF NOT EXISTS fotos JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS resumen JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS detalles_json JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.cronograma_actividades
    ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.cronograma_config (
    proyecto_id TEXT PRIMARY KEY,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    config_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

DROP TRIGGER IF EXISTS update_cronograma_config_modtime ON public.cronograma_config;
CREATE TRIGGER update_cronograma_config_modtime
    BEFORE UPDATE ON public.cronograma_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.cronograma_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso cronograma config" ON public.cronograma_config;
DROP POLICY IF EXISTS "cronograma_config_select" ON public.cronograma_config;
DROP POLICY IF EXISTS "cronograma_config_insert" ON public.cronograma_config;
DROP POLICY IF EXISTS "cronograma_config_update" ON public.cronograma_config;
DROP POLICY IF EXISTS "cronograma_config_delete" ON public.cronograma_config;

CREATE POLICY "cronograma_config_select"
    ON public.cronograma_config FOR SELECT
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "cronograma_config_insert"
    ON public.cronograma_config FOR INSERT
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "cronograma_config_update"
    ON public.cronograma_config FOR UPDATE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "cronograma_config_delete"
    ON public.cronograma_config FOR DELETE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));

CREATE TABLE IF NOT EXISTS public.archivos_almacen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    proyecto_id TEXT DEFAULT '',
    owner_email VARCHAR(255) NOT NULL,
    uploaded_by_email VARCHAR(255) DEFAULT '',
    modulo VARCHAR(60) NOT NULL CHECK (modulo IN (
        'bitacora', 'compras', 'estimaciones', 'reportes',
        'catalogos_maestros', 'avatares', 'branding', 'otros'
    )),
    categoria VARCHAR(40) NOT NULL DEFAULT 'project_files' CHECK (categoria IN (
        'project_files', 'master_catalog', 'branding'
    )),
    entidad_id TEXT DEFAULT '',
    nombre_original TEXT NOT NULL,
    mime_type VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
    extension VARCHAR(20) DEFAULT '',
    s3_bucket VARCHAR(120) DEFAULT '',
    s3_key TEXT NOT NULL UNIQUE,
    tamano_original_bytes BIGINT NOT NULL DEFAULT 0,
    tamano_bytes BIGINT NOT NULL DEFAULT 0,
    sha256 VARCHAR(64) DEFAULT '',
    metadata JSONB DEFAULT '{}'::jsonb,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_archivos_owner_active ON public.archivos_almacen(LOWER(owner_email), categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_archivos_proyecto ON public.archivos_almacen(proyecto_id, modulo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_archivos_empresa ON public.archivos_almacen(empresa_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_archivos_almacen_modtime ON public.archivos_almacen;
CREATE TRIGGER update_archivos_almacen_modtime
    BEFORE UPDATE ON public.archivos_almacen
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.archivos_almacen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso archivos almacen empresa o colaborador" ON public.archivos_almacen;
CREATE POLICY "Acceso archivos almacen empresa o colaborador"
    ON public.archivos_almacen FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));

CREATE TABLE IF NOT EXISTS public.bitacora_config (
    proyecto_id TEXT PRIMARY KEY,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    titulo_obra TEXT DEFAULT '',
    contrato_num VARCHAR(100) DEFAULT '',
    contratista TEXT DEFAULT '',
    supervision TEXT DEFAULT '',
    residente_nombre VARCHAR(255) DEFAULT '',
    supervisor_nombre VARCHAR(255) DEFAULT '',
    folio_actual INTEGER DEFAULT 1,
    config_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bitacora_notas (
    id VARCHAR(120) PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    folio INTEGER NOT NULL DEFAULT 1,
    fecha DATE,
    tipo VARCHAR(60) DEFAULT 'seguimiento',
    clasificacion VARCHAR(60) DEFAULT 'general',
    titulo TEXT NOT NULL DEFAULT '',
    contenido TEXT DEFAULT '',
    autor_nombre VARCHAR(255) DEFAULT '',
    autor_email VARCHAR(255) DEFAULT '',
    estado VARCHAR(40) DEFAULT 'borrador',
    fotos JSONB DEFAULT '[]'::jsonb,
    pdf_s3_key TEXT DEFAULT '',
    pdf_archivo_id UUID REFERENCES public.archivos_almacen(id) ON DELETE SET NULL,
    sello_json JSONB DEFAULT '{}'::jsonb,
    payload_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bitacora_notas_proyecto ON public.bitacora_notas(proyecto_id, folio);

DROP TRIGGER IF EXISTS update_bitacora_config_modtime ON public.bitacora_config;
CREATE TRIGGER update_bitacora_config_modtime
    BEFORE UPDATE ON public.bitacora_config
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bitacora_notas_modtime ON public.bitacora_notas;
CREATE TRIGGER update_bitacora_notas_modtime
    BEFORE UPDATE ON public.bitacora_notas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bitacora_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso bitacora config" ON public.bitacora_config;
DROP POLICY IF EXISTS "bitacora_config_select" ON public.bitacora_config;
DROP POLICY IF EXISTS "bitacora_config_insert" ON public.bitacora_config;
DROP POLICY IF EXISTS "bitacora_config_update" ON public.bitacora_config;
DROP POLICY IF EXISTS "bitacora_config_delete" ON public.bitacora_config;

CREATE POLICY "bitacora_config_select"
    ON public.bitacora_config FOR SELECT
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "bitacora_config_insert"
    ON public.bitacora_config FOR INSERT
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "bitacora_config_update"
    ON public.bitacora_config FOR UPDATE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "bitacora_config_delete"
    ON public.bitacora_config FOR DELETE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));

DROP POLICY IF EXISTS "Acceso bitacora notas" ON public.bitacora_notas;
DROP POLICY IF EXISTS "bitacora_notas_select" ON public.bitacora_notas;
DROP POLICY IF EXISTS "bitacora_notas_insert" ON public.bitacora_notas;
DROP POLICY IF EXISTS "bitacora_notas_update" ON public.bitacora_notas;
DROP POLICY IF EXISTS "bitacora_notas_delete" ON public.bitacora_notas;

CREATE POLICY "bitacora_notas_select"
    ON public.bitacora_notas FOR SELECT
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "bitacora_notas_insert"
    ON public.bitacora_notas FOR INSERT
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "bitacora_notas_update"
    ON public.bitacora_notas FOR UPDATE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "bitacora_notas_delete"
    ON public.bitacora_notas FOR DELETE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));

CREATE TABLE IF NOT EXISTS public.proveedores (
    id VARCHAR(120) PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    nombre VARCHAR(255) NOT NULL,
    rfc VARCHAR(30) DEFAULT '',
    categoria VARCHAR(100) DEFAULT '',
    telefono VARCHAR(50) DEFAULT '',
    email VARCHAR(255) DEFAULT '',
    notas TEXT DEFAULT '',
    payload_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.compras_gastos (
    id VARCHAR(120) PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    proveedor_id VARCHAR(120) DEFAULT '',
    concepto_id TEXT DEFAULT '',
    fecha DATE,
    tipo VARCHAR(60) DEFAULT 'compra',
    categoria VARCHAR(100) DEFAULT 'Material',
    descripcion TEXT NOT NULL DEFAULT '',
    folio_factura VARCHAR(120) DEFAULT '',
    subtotal NUMERIC(14, 2) DEFAULT 0.00,
    iva NUMERIC(14, 2) DEFAULT 0.00,
    total NUMERIC(14, 2) DEFAULT 0.00,
    metodo_pago VARCHAR(60) DEFAULT '',
    estado VARCHAR(40) DEFAULT 'pagado',
    evidencia_s3_key TEXT DEFAULT '',
    evidencia_archivo_id UUID REFERENCES public.archivos_almacen(id) ON DELETE SET NULL,
    evidencia_json JSONB DEFAULT '{}'::jsonb,
    payload_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proveedores_proyecto ON public.proveedores(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_compras_gastos_proyecto ON public.compras_gastos(proyecto_id, fecha);

DROP TRIGGER IF EXISTS update_proveedores_modtime ON public.proveedores;
CREATE TRIGGER update_proveedores_modtime
    BEFORE UPDATE ON public.proveedores
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_compras_gastos_modtime ON public.compras_gastos;
CREATE TRIGGER update_compras_gastos_modtime
    BEFORE UPDATE ON public.compras_gastos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_gastos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "proveedores_select" ON public.proveedores;
DROP POLICY IF EXISTS "proveedores_insert" ON public.proveedores;
DROP POLICY IF EXISTS "proveedores_update" ON public.proveedores;
DROP POLICY IF EXISTS "proveedores_delete" ON public.proveedores;

CREATE POLICY "proveedores_select"
    ON public.proveedores FOR SELECT
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "proveedores_insert"
    ON public.proveedores FOR INSERT
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "proveedores_update"
    ON public.proveedores FOR UPDATE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "proveedores_delete"
    ON public.proveedores FOR DELETE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));

DROP POLICY IF EXISTS "Acceso compras gastos" ON public.compras_gastos;
DROP POLICY IF EXISTS "compras_gastos_select" ON public.compras_gastos;
DROP POLICY IF EXISTS "compras_gastos_insert" ON public.compras_gastos;
DROP POLICY IF EXISTS "compras_gastos_update" ON public.compras_gastos;
DROP POLICY IF EXISTS "compras_gastos_delete" ON public.compras_gastos;

CREATE POLICY "compras_gastos_select"
    ON public.compras_gastos FOR SELECT
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "compras_gastos_insert"
    ON public.compras_gastos FOR INSERT
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "compras_gastos_update"
    ON public.compras_gastos FOR UPDATE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));
CREATE POLICY "compras_gastos_delete"
    ON public.compras_gastos FOR DELETE
    USING (public.tiene_acceso_escritura_registro(empresa_id, owner_email::text, proyecto_id::text));

CREATE TABLE IF NOT EXISTS public.catalogos_maestros (
    id VARCHAR(120) PRIMARY KEY,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    version VARCHAR(50) DEFAULT '1.0',
    total_conceptos INTEGER DEFAULT 0,
    tamano_bytes BIGINT NOT NULL DEFAULT 0,
    s3_key TEXT DEFAULT '',
    archivo_id UUID REFERENCES public.archivos_almacen(id) ON DELETE SET NULL,
    resumen_json JSONB DEFAULT '{}'::jsonb,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalogos_maestros_owner ON public.catalogos_maestros(LOWER(owner_email)) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_catalogos_maestros_modtime ON public.catalogos_maestros;
CREATE TRIGGER update_catalogos_maestros_modtime
    BEFORE UPDATE ON public.catalogos_maestros
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.catalogos_maestros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso catalogos maestros" ON public.catalogos_maestros;
CREATE POLICY "Acceso catalogos maestros"
    ON public.catalogos_maestros FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, ''::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, ''::text));

-- ==============================================================================
-- 6. PUBLICACIÓN EN SUPABASE REALTIME
-- ==============================================================================

DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY[
        'proyectos',
        'proyectos_eliminados',
        'proyecto_colaboradores',
        'catalogo_conceptos',
        'insumos_apu',
        'estimaciones',
        'estimacion_detalles',
        'cronograma_actividades',
        'cronograma_config',
        'archivos_almacen',
        'bitacora_config',
        'bitacora_notas',
        'proveedores',
        'compras_gastos',
        'chat_mensajes',
        'catalogos_maestros'
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables LOOP
        IF to_regclass('public.' || v_table) IS NOT NULL THEN
            BEGIN
                EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', v_table);
            EXCEPTION WHEN others THEN NULL;
            END;
            BEGIN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
            EXCEPTION WHEN duplicate_object THEN NULL;
            WHEN undefined_object THEN NULL;
            END;
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 7. RPC MULTI-PC DE ESPACIOS DE COLABORACIÓN Y SANEAMIENTO DE JWT INFLADOS
-- ==============================================================================

-- 7.1 Consulta segura de espacios compartidos donde el usuario es colaborador (pending o accepted)
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

    -- 1. Promover invitaciones activas (no rechazadas ni de obras eliminadas o en papelera) en proyecto_colaboradores a 'accepted'
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

    -- 2. Reconciliar invitados registrados en proyectos.configuracion (memberTabs / collaborators) de cuentas anfitrionas
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

-- 7.2 Limpieza idempotente de auth.users.raw_user_meta_data inflada (> ~2.5 KB o con llaves legadas)
DO $$
DECLARE
    r RECORD;
    v_meta JSONB;
    v_cs JSONB;
    v_arr JSONB;
    v_k TEXT;
    v_v JSONB;
    v_safe_keys TEXT[] := ARRAY[
        'sub', 'email', 'email_verified', 'phone_verified',
        'full_name', 'name', 'user_name', 'preferred_username',
        'empresa_nombre', 'company_name', 'plan', 'subscription',
        'role', 'rol', 'auth_session_version', 'cubikar_cloud_state_v2',
        'cubikar_dismissed_notifications', 'cubikar_read_mentions'
    ];
    v_cleaned_count INT := 0;
BEGIN
    IF to_regclass('auth.users') IS NULL THEN
        RETURN;
    END IF;

    FOR r IN
        SELECT id, raw_user_meta_data
        FROM auth.users
        WHERE raw_user_meta_data IS NOT NULL
          AND (
              raw_user_meta_data ? 'cubikar_collaboration_v1'
              OR length(raw_user_meta_data::text) > 2500
              OR LEFT(COALESCE(raw_user_meta_data->>'avatar_url', ''), 5) = 'data:'
              OR LEFT(COALESCE(raw_user_meta_data->>'picture', ''), 5) = 'data:'
              OR jsonb_typeof(raw_user_meta_data->'cubikar_cloud_state_v2'->'ownedProjects') = 'array'
              OR jsonb_typeof(raw_user_meta_data->'cubikar_cloud_state_v2'->'collaboratedProjects') = 'array'
          )
    LOOP
        v_meta := COALESCE(r.raw_user_meta_data, '{}'::jsonb);

        -- Eliminar llave legada v1
        v_meta := v_meta - 'cubikar_collaboration_v1';

        -- Eliminar avatares base64 o URLs extensas del JWT
        IF (v_meta ? 'avatar_url') AND (
            LEFT(COALESCE(v_meta->>'avatar_url', ''), 5) = 'data:'
            OR length(COALESCE(v_meta->>'avatar_url', '')) > 512
        ) THEN
            v_meta := v_meta - 'avatar_url';
        END IF;
        IF (v_meta ? 'picture') AND (
            LEFT(COALESCE(v_meta->>'picture', ''), 5) = 'data:'
            OR length(COALESCE(v_meta->>'picture', '')) > 512
        ) THEN
            v_meta := v_meta - 'picture';
        END IF;

        -- Compactar cubikar_cloud_state_v2 preservando suscripción e invitaciones ligeras
        IF jsonb_typeof(v_meta->'cubikar_cloud_state_v2') = 'object' THEN
            v_cs := v_meta->'cubikar_cloud_state_v2';
            v_cs := v_cs - 'ownedProjects' - 'collaboratedProjects';

            FOR v_k IN SELECT unnest(ARRAY['planInvitations', 'acceptedInvitations', 'sentPlanInvitations', 'sentProjectInvitations']) LOOP
                IF jsonb_typeof(v_cs->v_k) = 'array' THEN
                    SELECT COALESCE(jsonb_agg(
                        CASE WHEN jsonb_typeof(elem) = 'object'
                             THEN elem - 'avatar' - 'companyLogo'
                             ELSE elem
                        END
                        ORDER BY ord ASC
                    ), '[]'::jsonb)
                    INTO v_arr
                    FROM (
                        SELECT elem, ord
                        FROM jsonb_array_elements(v_cs->v_k) WITH ORDINALITY AS t(elem, ord)
                        ORDER BY ord DESC
                        LIMIT 10
                    ) sub;
                    v_cs := jsonb_set(v_cs, ARRAY[v_k], v_arr, true);
                END IF;
            END LOOP;

            IF jsonb_typeof(v_cs->'deletedProjectIds') = 'array' AND jsonb_array_length(v_cs->'deletedProjectIds') > 15 THEN
                SELECT COALESCE(jsonb_agg(elem ORDER BY ord ASC), '[]'::jsonb)
                INTO v_arr
                FROM (
                    SELECT elem, ord
                    FROM jsonb_array_elements(v_cs->'deletedProjectIds') WITH ORDINALITY AS t(elem, ord)
                    ORDER BY ord DESC
                    LIMIT 15
                ) sub;
                v_cs := jsonb_set(v_cs, '{deletedProjectIds}', v_arr, true);
            END IF;

            IF length(v_cs::text) > 1800 THEN
                v_cs := jsonb_strip_nulls(jsonb_build_object(
                    'version', COALESCE(v_cs->'version', '2'::jsonb),
                    'subscription', v_cs->'subscription',
                    'planInvitations', CASE WHEN jsonb_typeof(v_cs->'planInvitations') = 'array' THEN v_cs->'planInvitations' ELSE '[]'::jsonb END,
                    'deletedProjectIds', COALESCE((
                        SELECT jsonb_agg(elem ORDER BY ord ASC)
                        FROM (
                            SELECT elem, ord FROM jsonb_array_elements(COALESCE(v_cs->'deletedProjectIds', '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
                            ORDER BY ord DESC LIMIT 10
                        ) d
                    ), '[]'::jsonb),
                    'updatedAt', v_cs->'updatedAt'
                ));
            END IF;

            IF length(v_cs::text) > 1800 THEN
                v_cs := jsonb_strip_nulls(jsonb_build_object(
                    'version', 2,
                    'subscription', v_cs->'subscription',
                    'updatedAt', v_cs->'updatedAt'
                ));
            END IF;

            v_meta := jsonb_set(v_meta, '{cubikar_cloud_state_v2}', v_cs, true);
        END IF;

        -- Acotar listas de notificaciones/menciones leídas en metadata
        FOR v_k IN SELECT unnest(ARRAY['cubikar_dismissed_notifications', 'cubikar_read_mentions']) LOOP
            IF jsonb_typeof(v_meta->v_k) = 'array' AND jsonb_array_length(v_meta->v_k) > 20 THEN
                SELECT COALESCE(jsonb_agg(elem ORDER BY ord ASC), '[]'::jsonb)
                INTO v_arr
                FROM (
                    SELECT elem, ord FROM jsonb_array_elements(v_meta->v_k) WITH ORDINALITY AS t(elem, ord)
                    ORDER BY ord DESC LIMIT 20
                ) n;
                v_meta := jsonb_set(v_meta, ARRAY[v_k], v_arr, true);
            END IF;
        END LOOP;

        -- Purga de respaldo si aún supera 3 KB
        IF length(v_meta::text) > 3000 THEN
            FOR v_k, v_v IN SELECT key, value FROM jsonb_each(v_meta) LOOP
                IF NOT (v_k = ANY(v_safe_keys)) THEN
                    IF length(v_v::text) > 400 OR LEFT(COALESCE(v_v #>> '{}', ''), 5) = 'data:' THEN
                        v_meta := v_meta - v_k;
                    END IF;
                END IF;
            END LOOP;
        END IF;

        IF length(v_meta::text) > 3500 THEN
            v_meta := v_meta - 'cubikar_dismissed_notifications' - 'cubikar_read_mentions';
            IF jsonb_typeof(v_meta->'cubikar_cloud_state_v2') = 'object' THEN
                v_meta := jsonb_set(
                    v_meta,
                    '{cubikar_cloud_state_v2}',
                    jsonb_strip_nulls(jsonb_build_object(
                        'version', 2,
                        'subscription', v_meta->'cubikar_cloud_state_v2'->'subscription',
                        'updatedAt', v_meta->'cubikar_cloud_state_v2'->'updatedAt'
                    )),
                    true
                );
            END IF;
        END IF;

        UPDATE auth.users
        SET raw_user_meta_data = v_meta,
            updated_at = timezone('utc'::text, now())
        WHERE id = r.id;

        v_cleaned_count := v_cleaned_count + 1;
    END LOOP;

    RAISE NOTICE 'Cubikar Auth Metadata cleanup completed. Compacted % auth.users rows.', v_cleaned_count;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Sin privilegios sobre auth.users en esta sesión; omitiendo saneamiento directo de JWT.';
    WHEN others THEN
        RAISE NOTICE 'Aviso durante saneamiento de raw_user_meta_data: %', SQLERRM;
END $$;

-- 7.3 Reconciliación global de proyectos activos e invitaciones de anfitriones hacia public.proyecto_colaboradores
DO $$
BEGIN
    -- A) Promover invitaciones activas ('pending') en obras no eliminadas a 'accepted'
    UPDATE public.proyecto_colaboradores pc
    SET estado_invitacion = 'accepted',
        updated_at = timezone('utc'::text, now())
    FROM public.proyectos p
    WHERE pc.proyecto_id = p.id
      AND p.deleted_at IS NULL
      AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'pending'))) = 'pending'
      AND (
          to_regclass('public.proyectos_eliminados') IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM public.proyectos_eliminados pe
              WHERE pe.proyecto_id = p.id::text
          )
      );

    -- B) Reconciliar colaboradores desde proyectos.configuracion->'memberTabs'
    INSERT INTO public.proyecto_colaboradores (
        proyecto_id,
        email_colaborador,
        nombre_colaborador,
        rol,
        estado_invitacion,
        updated_at
    )
    SELECT DISTINCT ON (p.id, LOWER(TRIM(mt.key)))
        p.id,
        LOWER(TRIM(mt.key)),
        SPLIT_PART(LOWER(TRIM(mt.key)), '@', 1),
        'editar',
        'accepted',
        timezone('utc'::text, now())
    FROM public.proyectos p
    CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(p.configuracion->'memberTabs') = 'object'
             THEN p.configuracion->'memberTabs'
             ELSE '{}'::jsonb
        END
    ) AS mt(key, value)
    WHERE p.deleted_at IS NULL
      AND LOWER(TRIM(mt.key)) LIKE '%@%'
      AND LOWER(TRIM(mt.key)) <> LOWER(TRIM(COALESCE(p.owner_email, '')))
      AND (
          to_regclass('public.proyectos_eliminados') IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM public.proyectos_eliminados pe
              WHERE pe.proyecto_id = p.id::text
          )
      )
    ON CONFLICT (proyecto_id, email_colaborador) DO UPDATE
    SET estado_invitacion = CASE
            WHEN LOWER(TRIM(COALESCE(public.proyecto_colaboradores.estado_invitacion, ''))) = 'rejected' THEN 'rejected'
            ELSE 'accepted'
        END,
        updated_at = timezone('utc'::text, now());

    -- C) Reconciliar colaboradores desde proyectos.configuracion->'collaborators'
    INSERT INTO public.proyecto_colaboradores (
        proyecto_id,
        email_colaborador,
        nombre_colaborador,
        rol,
        estado_invitacion,
        updated_at
    )
    SELECT DISTINCT ON (p.id, LOWER(TRIM(elem->>'email')))
        p.id,
        LOWER(TRIM(elem->>'email')),
        COALESCE(NULLIF(TRIM(elem->>'name'), ''), SPLIT_PART(LOWER(TRIM(elem->>'email')), '@', 1)),
        COALESCE(NULLIF(TRIM(elem->>'role'), ''), 'editar'),
        'accepted',
        timezone('utc'::text, now())
    FROM public.proyectos p
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.configuracion->'collaborators') = 'array'
             THEN p.configuracion->'collaborators'
             ELSE '[]'::jsonb
        END
    ) elem
    WHERE p.deleted_at IS NULL
      AND LOWER(TRIM(COALESCE(elem->>'email', ''))) LIKE '%@%'
      AND LOWER(TRIM(COALESCE(elem->>'email', ''))) <> LOWER(TRIM(COALESCE(p.owner_email, '')))
      AND LOWER(TRIM(COALESCE(elem->>'status', 'accepted'))) <> 'rejected'
      AND (
          to_regclass('public.proyectos_eliminados') IS NULL
          OR NOT EXISTS (
              SELECT 1 FROM public.proyectos_eliminados pe
              WHERE pe.proyecto_id = p.id::text
          )
      )
    ON CONFLICT (proyecto_id, email_colaborador) DO UPDATE
    SET estado_invitacion = CASE
            WHEN LOWER(TRIM(COALESCE(public.proyecto_colaboradores.estado_invitacion, ''))) = 'rejected' THEN 'rejected'
            ELSE 'accepted'
        END,
        updated_at = timezone('utc'::text, now());
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Aviso durante reconciliación global de proyecto_colaboradores: %', SQLERRM;
END $$;

-- ==============================================================================
-- 8. PAPELERA DE RECICLAJE DE PROYECTOS (RETENCIÓN DE 7 DÍAS - SOLO ANFITRIÓN)
-- ==============================================================================

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
        EXCEPTION WHEN others THEN
            NULL;
        END;
    END IF;
END $$;


-- ==============================================================================
-- ANEXO: CORRECCIONES DE SEGURIDAD E INTEGRIDAD (2026-11-17)
-- ==============================================================================
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
