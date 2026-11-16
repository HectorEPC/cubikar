-- ==============================================================================
-- CUBIKAR: ARQUITECTURA DEFINITIVA DE COLABORACIÓN Y TIEMPO REAL MULTIUSUARIO
-- Migración PostgreSQL para Supabase con RLS, Tablas Centrales y Realtime WebSockets
-- ==============================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLA CENTRAL: public.proyectos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.proyectos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nombre VARCHAR(255) NOT NULL,
    clave VARCHAR(50) DEFAULT '',
    cliente VARCHAR(255) DEFAULT '',
    ubicacion TEXT DEFAULT '',
    tipo_obra VARCHAR(100) DEFAULT 'Edificación',
    moneda VARCHAR(10) DEFAULT 'MXN',
    simbolo_moneda VARCHAR(5) DEFAULT '$',
    aplica_sobrecosto BOOLEAN DEFAULT false,
    pct_indirectos NUMERIC(8, 4) DEFAULT 12.0000,
    pct_financiamiento NUMERIC(8, 4) DEFAULT 1.5000,
    pct_utilidad NUMERIC(8, 4) DEFAULT 10.0000,
    pct_adicionales NUMERIC(8, 4) DEFAULT 0.5000,
    pct_seguros_fianzas NUMERIC(8, 4) DEFAULT 1.0000,
    pct_fasar NUMERIC(8, 4) DEFAULT 70.0000,
    anticipo_pct NUMERIC(6, 2) DEFAULT 30.00,
    iva_pct NUMERIC(6, 2) DEFAULT 16.00,
    configuracion JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Asegurar columnas si la tabla ya existía previamente
DO $$
BEGIN
    ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255) NOT NULL DEFAULT '';
    ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS tipo_obra VARCHAR(100) DEFAULT 'Edificación';
    ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS configuracion JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE public.proyectos ALTER COLUMN empresa_id DROP NOT NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_proyectos_owner_email ON public.proyectos(LOWER(owner_email));
CREATE INDEX IF NOT EXISTS idx_proyectos_updated_at ON public.proyectos(updated_at DESC);

-- ==============================================================================
-- 3. TABLA CENTRAL: public.proyecto_colaboradores
-- ==============================================================================
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

-- ==============================================================================
-- 4. TABLA CENTRAL: public.catalogo_conceptos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.catalogo_conceptos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.catalogo_conceptos(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL DEFAULT 'concepto' CHECK (tipo IN ('partida', 'subpartida', 'concepto')),
    clave VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    unidad VARCHAR(30) DEFAULT 'lote',
    cantidad NUMERIC(14, 2) DEFAULT 0.00,
    precio_unitario NUMERIC(14, 2) DEFAULT 0.00,
    costo_directo NUMERIC(14, 2) DEFAULT 0.00,
    color VARCHAR(20) DEFAULT NULL,
    orden INTEGER DEFAULT 0,
    expanded BOOLEAN DEFAULT true,
    selected BOOLEAN DEFAULT true,
    insumos JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE public.catalogo_conceptos ADD COLUMN IF NOT EXISTS insumos JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.catalogo_conceptos ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalogo_proyecto ON public.catalogo_conceptos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_parent ON public.catalogo_conceptos(parent_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_orden ON public.catalogo_conceptos(proyecto_id, orden);

-- ==============================================================================
-- 5. TABLA CENTRAL: public.chat_mensajes
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.chat_mensajes (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    autor_email VARCHAR(255) NOT NULL,
    autor_nombre VARCHAR(255) DEFAULT '',
    autor_avatar TEXT DEFAULT '',
    autor_avatar_url TEXT DEFAULT '',
    mensaje TEXT NOT NULL DEFAULT '',
    partida_id VARCHAR(100) DEFAULT NULL,
    etiquetas JSONB DEFAULT '[]'::jsonb,
    payload_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

DO $$
BEGIN
    ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS autor_avatar_url TEXT DEFAULT '';
    ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS payload_json JSONB DEFAULT '{}'::jsonb;
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_proyecto ON public.chat_mensajes(proyecto_id, created_at DESC);

-- ==============================================================================
-- 6. FUNCIONES DE SEGURIDAD Y ACCESO MULTIUSUARIO (ANTI-RECURSIÓN Y POLIMÓRFICAS)
-- ==============================================================================

-- Función 1: Obtener email del JWT autenticado en minúsculas y limpio
CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT AS $$
    SELECT LOWER(COALESCE(auth.jwt()->>'email', ''));
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Función 2A: Validar acceso a un proyecto recibiendo TEXT (compatible con UUID, TEXT o VARCHAR)
CREATE OR REPLACE FUNCTION public.check_user_project_access(
    proj_id TEXT, 
    req_roles TEXT[] DEFAULT ARRAY['owner', 'admin', 'editar', 'escribir', 'leer']
)
RETURNS BOOLEAN AS $$
DECLARE
    u_email TEXT;
BEGIN
    u_email := public.current_user_email();
    IF u_email = '' THEN
        RETURN FALSE;
    END IF;

    -- Superadmin permanente para auditoría y soporte
    IF u_email = 'hepc.90@gmail.com' THEN
        RETURN TRUE;
    END IF;

    -- Acceso directo si es el propietario
    IF EXISTS (
        SELECT 1 FROM public.proyectos p
        WHERE p.id::text = proj_id
        AND LOWER(p.owner_email) = u_email
    ) THEN
        RETURN TRUE;
    END IF;

    -- Acceso si es colaborador invitado con rol permitido
    RETURN EXISTS (
        SELECT 1 FROM public.proyecto_colaboradores pc
        WHERE pc.proyecto_id::text = proj_id
        AND LOWER(pc.email_colaborador) = u_email
        AND pc.rol = ANY(req_roles)
        AND pc.estado_invitacion IN ('accepted', 'pending')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Función 2B: Sobrecarga para UUID (delega transparentemente a TEXT)
CREATE OR REPLACE FUNCTION public.check_user_project_access(
    proj_id UUID, 
    req_roles TEXT[] DEFAULT ARRAY['owner', 'admin', 'editar', 'escribir', 'leer']
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN public.check_user_project_access(proj_id::text, req_roles);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Trigger para mantener actualizado 'updated_at'
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proyectos_updated_at ON public.proyectos;
CREATE TRIGGER trg_proyectos_updated_at BEFORE UPDATE ON public.proyectos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_colab_updated_at ON public.proyecto_colaboradores;
CREATE TRIGGER trg_colab_updated_at BEFORE UPDATE ON public.proyecto_colaboradores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_conceptos_updated_at ON public.catalogo_conceptos;
CREATE TRIGGER trg_conceptos_updated_at BEFORE UPDATE ON public.catalogo_conceptos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==============================================================================
-- 7. POLÍTICAS RLS (ROW LEVEL SECURITY) DEFINITIVAS
-- ==============================================================================

ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyecto_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_conceptos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mensajes ENABLE ROW LEVEL SECURITY;

-- 7.1 Políticas para public.proyectos
DROP POLICY IF EXISTS "proyectos_select_colaboracion" ON public.proyectos;
DROP POLICY IF EXISTS "Ver proyectos de mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "Crear proyectos en mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "Editar proyectos de mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "Eliminar proyectos de mi empresa" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_insert_auth" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_update_colaboracion" ON public.proyectos;
DROP POLICY IF EXISTS "proyectos_delete_owner" ON public.proyectos;

CREATE POLICY "proyectos_select_colaboracion" ON public.proyectos
    FOR SELECT USING (public.check_user_project_access(id::text));

CREATE POLICY "proyectos_insert_auth" ON public.proyectos
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "proyectos_update_colaboracion" ON public.proyectos
    FOR UPDATE USING (public.check_user_project_access(id::text, ARRAY['owner', 'admin', 'editar']));

CREATE POLICY "proyectos_delete_owner" ON public.proyectos
    FOR DELETE USING (
        LOWER(owner_email) = public.current_user_email()
        OR public.current_user_email() = 'hepc.90@gmail.com'
    );

-- 7.2 Políticas para public.proyecto_colaboradores
DROP POLICY IF EXISTS "colaboradores_select" ON public.proyecto_colaboradores;
DROP POLICY IF EXISTS "colaboradores_insert" ON public.proyecto_colaboradores;
DROP POLICY IF EXISTS "colaboradores_update" ON public.proyecto_colaboradores;
DROP POLICY IF EXISTS "colaboradores_delete" ON public.proyecto_colaboradores;

CREATE POLICY "colaboradores_select" ON public.proyecto_colaboradores
    FOR SELECT USING (
        LOWER(email_colaborador) = public.current_user_email()
        OR public.check_user_project_access(proyecto_id::text)
    );

CREATE POLICY "colaboradores_insert" ON public.proyecto_colaboradores
    FOR INSERT WITH CHECK (
        public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar'])
        OR auth.role() = 'authenticated'
    );

CREATE POLICY "colaboradores_update" ON public.proyecto_colaboradores
    FOR UPDATE USING (
        public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar'])
        OR LOWER(email_colaborador) = public.current_user_email()
    );

CREATE POLICY "colaboradores_delete" ON public.proyecto_colaboradores
    FOR DELETE USING (
        public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar'])
        OR LOWER(email_colaborador) = public.current_user_email()
    );

-- 7.3 Políticas para public.catalogo_conceptos
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
    FOR DELETE USING (public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin', 'editar']));

-- 7.4 Políticas para public.chat_mensajes
DROP POLICY IF EXISTS "chat_select" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_insert" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_delete" ON public.chat_mensajes;

CREATE POLICY "chat_select" ON public.chat_mensajes
    FOR SELECT USING (public.check_user_project_access(proyecto_id::text));

CREATE POLICY "chat_insert" ON public.chat_mensajes
    FOR INSERT WITH CHECK (public.check_user_project_access(proyecto_id::text));

CREATE POLICY "chat_delete" ON public.chat_mensajes
    FOR DELETE USING (
        LOWER(autor_email) = public.current_user_email()
        OR public.check_user_project_access(proyecto_id::text, ARRAY['owner', 'admin'])
    );

-- ==============================================================================
-- 8. PUBLICACIÓN EN SUPABASE REALTIME (WEBSOCKETS < 1 SEGUNDO)
-- ==============================================================================

ALTER TABLE public.proyectos REPLICA IDENTITY FULL;
ALTER TABLE public.proyecto_colaboradores REPLICA IDENTITY FULL;
ALTER TABLE public.catalogo_conceptos REPLICA IDENTITY FULL;
ALTER TABLE public.chat_mensajes REPLICA IDENTITY FULL;

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.proyectos;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.proyecto_colaboradores;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.catalogo_conceptos;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensajes;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
