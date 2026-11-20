-- ==============================================================================
-- CUBIKAR · MIGRACIÓN DE INVITACIONES POR CORREO CON TOKEN 256-BIT (SHA-256)
-- Aplicar en Supabase > SQL Editor.
-- Es completamente idempotente (se puede ejecutar más de una vez sin errores).
--
-- Incluye:
--  1. Columnas e índices seguros en public.invitaciones (token_hash único, expiración, origen, uso)
--  2. Restricción de permisos por columna y políticas RLS para impedir lectura/edición de token_hash desde el cliente
--  3. Trigger de protección para mantener inmutabilidad del token_hash y evitar reutilización desde el cliente
--  4. Cierre de auto-aceptación silenciosa de 'pending' en get_my_collaboration_workspaces()
--  5. Exigencia estricta de estado 'accepted'/'active' en check_user_project_access() y cubikar_es_miembro_proyecto()
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Asegurar tabla public.invitaciones y nuevas columnas e índices
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitaciones (
    id VARCHAR(100) PRIMARY KEY,
    proyecto_id VARCHAR(100) NOT NULL,
    proyecto_nombre VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_plan_id VARCHAR(50) DEFAULT 'free',
    invitee_name VARCHAR(255) NOT NULL,
    invitee_email VARCHAR(255) NOT NULL,
    rol VARCHAR(50) DEFAULT 'editar',
    allowed_tabs JSONB DEFAULT '[]'::jsonb,
    estado VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.invitaciones
    ADD COLUMN IF NOT EXISTS token_hash TEXT,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS app_origin VARCHAR(20) DEFAULT 'const',
    ADD COLUMN IF NOT EXISTS company_name TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invitaciones_token_hash
    ON public.invitaciones (token_hash)
    WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invitaciones_proyecto_email
    ON public.invitaciones (proyecto_id, LOWER(invitee_email));

CREATE INDEX IF NOT EXISTS idx_invitaciones_estado_expires
    ON public.invitaciones (estado, expires_at);

-- Normalizar estados inesperados si existieran y asegurar CHECK consistente
DO $$
DECLARE
    c RECORD;
BEGIN
    UPDATE public.invitaciones
    SET estado = 'pending'
    WHERE estado IS NULL
       OR LOWER(TRIM(estado)) NOT IN ('pending', 'accepted', 'rejected', 'cancelled');

    UPDATE public.invitaciones
    SET estado = LOWER(TRIM(estado));

    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.invitaciones'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%estado%'
    LOOP
        EXECUTE format('ALTER TABLE public.invitaciones DROP CONSTRAINT IF EXISTS %I', c.conname);
    END LOOP;

    ALTER TABLE public.invitaciones
        ADD CONSTRAINT chk_invitaciones_estado
        CHECK (estado IN ('pending', 'accepted', 'rejected', 'cancelled'));
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Seguridad por columna y RLS en public.invitaciones
--    Ningún usuario autenticado o anónimo puede leer o manipular token_hash.
-- ------------------------------------------------------------------------------
ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invitaciones FROM PUBLIC, anon, authenticated;

-- El cliente autenticado solo puede leer metadatos no secretos y borrar filas propias (al purgar obra).
-- La creación, verificación y respuesta (accept/reject) con token_hash ocurre exclusivamente vía Worker (service_role).
GRANT SELECT (
    id,
    proyecto_id,
    proyecto_nombre,
    owner_email,
    owner_name,
    owner_plan_id,
    invitee_name,
    invitee_email,
    rol,
    allowed_tabs,
    estado,
    expires_at,
    app_origin,
    company_name,
    email_sent_at,
    used_at,
    created_at,
    updated_at
) ON public.invitaciones TO authenticated;

GRANT DELETE ON public.invitaciones TO authenticated;

DROP POLICY IF EXISTS "Acceso a invitaciones" ON public.invitaciones;
DROP POLICY IF EXISTS "invitaciones_select" ON public.invitaciones;
DROP POLICY IF EXISTS "invitaciones_insert" ON public.invitaciones;
DROP POLICY IF EXISTS "invitaciones_update" ON public.invitaciones;
DROP POLICY IF EXISTS "invitaciones_delete" ON public.invitaciones;

CREATE POLICY "invitaciones_select" ON public.invitaciones FOR SELECT USING (
    public.current_user_email() = 'hepc.90@gmail.com'
    OR LOWER(TRIM(owner_email)) = public.current_user_email()
    OR (
        LOWER(TRIM(invitee_email)) = public.current_user_email()
        AND LOWER(TRIM(COALESCE(estado, 'pending'))) <> 'cancelled'
    )
    OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar'])
);

CREATE POLICY "invitaciones_insert" ON public.invitaciones FOR INSERT WITH CHECK (
    COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '') = 'service_role'
);

CREATE POLICY "invitaciones_update" ON public.invitaciones FOR UPDATE USING (
    COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '') = 'service_role'
) WITH CHECK (
    COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '') = 'service_role'
);

CREATE POLICY "invitaciones_delete" ON public.invitaciones FOR DELETE USING (
    COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '') = 'service_role'
    OR public.current_user_email() = 'hepc.90@gmail.com'
    OR LOWER(TRIM(owner_email)) = public.current_user_email()
    OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar'])
);

CREATE OR REPLACE FUNCTION public.cubikar_proteger_invitaciones_token()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
BEGIN
    IF v_role = 'service_role' THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Las invitaciones con token deben gestionarse desde el endpoint seguro del servidor.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_invitaciones_protect_token ON public.invitaciones;
CREATE TRIGGER trg_invitaciones_protect_token
    BEFORE INSERT OR UPDATE ON public.invitaciones
    FOR EACH ROW
    EXECUTE FUNCTION public.cubikar_proteger_invitaciones_token();

-- ------------------------------------------------------------------------------
-- 3. Cerrar acceso con estado 'pending' en helpers y RLS de proyecto
-- ------------------------------------------------------------------------------
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
                    AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'pending'))) = 'accepted'
              )
              OR (
                  jsonb_typeof(p.configuracion->'collaborators') = 'array'
                  AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(p.configuracion->'collaborators') e
                      WHERE LOWER(TRIM(COALESCE(e->>'email', ''))) = v_email
                        AND LOWER(TRIM(COALESCE(e->>'status', 'pending'))) IN ('accepted', 'active')
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

    -- Exigir explícitamente estado_invitacion = 'accepted' (nunca conceder acceso a 'pending' o 'rejected')
    IF EXISTS (
        SELECT 1 FROM public.proyecto_colaboradores pc
        WHERE pc.proyecto_id::text = v_clean_pid
          AND LOWER(TRIM(pc.email_colaborador)) = u_email
          AND pc.rol = ANY(req_roles)
          AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'pending'))) = 'accepted'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.id::text = v_clean_pid
          AND p.deleted_at IS NULL
          AND (
              (
                  jsonb_typeof(p.configuracion->'memberTabs') = 'object'
                  AND (p.configuracion->'memberTabs') ? u_email
                  AND 'leer' = ANY(req_roles)
                  AND NOT EXISTS (
                      SELECT 1 FROM public.proyecto_colaboradores pc_blk
                      WHERE pc_blk.proyecto_id = p.id
                        AND LOWER(TRIM(pc_blk.email_colaborador)) = u_email
                        AND LOWER(TRIM(COALESCE(pc_blk.estado_invitacion, 'pending'))) <> 'accepted'
                  )
                  AND NOT (
                      jsonb_typeof(p.configuracion->'collaborators') = 'array'
                      AND EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements(p.configuracion->'collaborators') ce
                          WHERE LOWER(TRIM(COALESCE(ce->>'email', ''))) = u_email
                            AND LOWER(TRIM(COALESCE(ce->>'status', 'pending'))) NOT IN ('accepted', 'active')
                      )
                  )
              )
              OR (
                  jsonb_typeof(p.configuracion->'collaborators') = 'array'
                  AND EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(p.configuracion->'collaborators') elem
                      WHERE LOWER(TRIM(COALESCE(elem->>'email', ''))) = u_email
                        AND LOWER(TRIM(COALESCE(elem->>'status', 'pending'))) IN ('accepted', 'active')
                        AND COALESCE(NULLIF(TRIM(elem->>'role'), ''), 'leer') = ANY(req_roles)
                  )
              )
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------------------
-- 4. Eliminar auto-aceptación silenciosa de get_my_collaboration_workspaces()
--    Solo devuelve colaboraciones ya aceptadas explícitamente por el usuario.
-- ------------------------------------------------------------------------------
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
        COALESCE(pc.rol, 'leer')::text AS rol,
        pc.estado_invitacion::text AS estado_invitacion,
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
      AND LOWER(TRIM(COALESCE(pc.estado_invitacion, 'pending'))) = 'accepted'
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.get_my_collaboration_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_collaboration_workspaces() TO authenticated;
