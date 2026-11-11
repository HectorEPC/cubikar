-- ==============================================================================
-- SISTEMA DE CONTROL DE OBRA Y PRESUPUESTOS BASE (APU)
-- Esquema de Base de Datos para Supabase (PostgreSQL) con RLS y Realtime
-- ==============================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLAS DE SUSCRIPCIÓN, EMPRESAS Y PERFILES (Multi-Tenant)
-- ==============================================================================

-- Organizaciones / Empresas
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    rfc VARCHAR(30) DEFAULT '',
    logo_url TEXT DEFAULT '',
    -- Campos administrados automáticamente por Stripe
    stripe_customer_id VARCHAR(100) UNIQUE,
    stripe_subscription_id VARCHAR(100) UNIQUE,
    plan VARCHAR(50) DEFAULT 'free' CHECK (plan IN ('free', 'plus', 'pro', 'enterprise')),
    estado_suscripcion VARCHAR(50) DEFAULT 'trialing' CHECK (estado_suscripcion IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    periodo_fin TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Perfiles de usuario vinculados al sistema de auth nativo de Supabase (auth.users)
CREATE TABLE IF NOT EXISTS public.perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE RESTRICT,
    nombre_completo VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    avatar_url TEXT DEFAULT '',
    sexo VARCHAR(20) DEFAULT 'Otro',
    rol VARCHAR(50) DEFAULT 'admin' CHECK (rol IN ('owner', 'admin', 'editor', 'viewer')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 3. TABLA DE PROYECTOS / OBRAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.proyectos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    clave VARCHAR(50) DEFAULT '',
    nombre VARCHAR(255) NOT NULL,
    cliente VARCHAR(255) DEFAULT '',
    ubicacion TEXT DEFAULT '',
    moneda VARCHAR(10) DEFAULT 'MXN',
    simbolo_moneda VARCHAR(5) DEFAULT '$',
    aplica_sobrecosto BOOLEAN DEFAULT false,
    pct_indirectos NUMERIC(8, 4) DEFAULT 12.0000,
    pct_financiamiento NUMERIC(8, 4) DEFAULT 1.5000,
    pct_utilidad NUMERIC(8, 4) DEFAULT 10.0000,
    pct_adicionales NUMERIC(8, 4) DEFAULT 0.5000,
    anticipo_pct NUMERIC(6, 2) DEFAULT 30.00,
    iva_pct NUMERIC(6, 2) DEFAULT 16.00,
    fecha_inicio DATE DEFAULT CURRENT_DATE,
    fecha_fin DATE,
    version INTEGER DEFAULT 1,
    creado_por UUID REFERENCES public.perfiles(id),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 4. CATÁLOGO BASE DEL PRESUPUESTO (Estructura de Árbol Jerárquico)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.catalogo_conceptos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.catalogo_conceptos(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('partida', 'subpartida', 'concepto')),
    clave VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    unidad VARCHAR(30) DEFAULT 'lote',
    cantidad NUMERIC(14, 2) DEFAULT 0.00,
    precio_unitario NUMERIC(14, 2) DEFAULT 0.00,
    costo_directo NUMERIC(14, 2) DEFAULT 0.00,
    color VARCHAR(10) DEFAULT '#3b82f6',
    orden INTEGER DEFAULT 0,
    expanded BOOLEAN DEFAULT true,
    selected BOOLEAN DEFAULT true,
    ai_tips TEXT DEFAULT '',
    google_search_queries JSONB DEFAULT '[]'::jsonb,
    google_sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalogo_proyecto ON public.catalogo_conceptos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_parent ON public.catalogo_conceptos(parent_id);

-- ==============================================================================
-- 5. MATRICES DE ANÁLISIS DE PRECIOS UNITARIOS (APU) E INSUMOS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.insumos_apu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concepto_id UUID NOT NULL REFERENCES public.catalogo_conceptos(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('Material', 'Mano de Obra', 'Equipo', 'Subcontrato')),
    clave VARCHAR(50) NOT NULL,
    descripcion TEXT NOT NULL,
    unidad VARCHAR(30) NOT NULL,
    -- Estrictamente 5 decimales de precisión en rendimientos
    cantidad NUMERIC(16, 5) NOT NULL DEFAULT 0.00000,
    costo_unitario NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insumos_concepto ON public.insumos_apu(concepto_id);
CREATE INDEX IF NOT EXISTS idx_insumos_clave ON public.insumos_apu(clave);

-- ==============================================================================
-- 6. MÓDULO DE ESTIMACIONES DE AVANCE DE OBRA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.estimaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    fecha_corte DATE NOT NULL,
    notas TEXT DEFAULT '',
    estado VARCHAR(30) DEFAULT 'borrador' CHECK (estado IN ('borrador', 'presentada', 'aprobada', 'pagada')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(proyecto_id, numero)
);

CREATE TABLE IF NOT EXISTS public.estimacion_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimacion_id UUID NOT NULL REFERENCES public.estimaciones(id) ON DELETE CASCADE,
    concepto_id UUID NOT NULL REFERENCES public.catalogo_conceptos(id) ON DELETE CASCADE,
    cantidad_ejecutada NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(estimacion_id, concepto_id)
);

CREATE INDEX IF NOT EXISTS idx_estimacion_detalles ON public.estimacion_detalles(estimacion_id);

-- ==============================================================================
-- 7. MÓDULO DE CRONOGRAMA / CALENDARIO DE OBRA (GANTT)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cronograma_actividades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
    concepto_id UUID REFERENCES public.catalogo_conceptos(id) ON DELETE SET NULL,
    titulo VARCHAR(255) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    dias_duracion INTEGER NOT NULL DEFAULT 1,
    porcentaje_avance NUMERIC(5, 2) DEFAULT 0.00,
    predecesoras JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cronograma_proyecto ON public.cronograma_actividades(proyecto_id);

-- ==============================================================================
-- 8. TRIGGERS Y FUNCIONES AUTOMÁTICAS
-- ==============================================================================

-- Creación automática de Empresa y Perfil al registrarse en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    new_empresa_id UUID;
    user_name TEXT;
BEGIN
    user_name := COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

    -- Crea empresa por defecto para la nueva cuenta
    INSERT INTO public.empresas (nombre, plan, estado_suscripcion)
    VALUES (user_name || ' - Empresa', 'free', 'trialing')
    RETURNING id INTO new_empresa_id;

    -- Crea el registro de perfil
    INSERT INTO public.perfiles (id, empresa_id, nombre_completo, email, rol, avatar_url)
    VALUES (
        new.id,
        new_empresa_id,
        user_name,
        new.email,
        'owner',
        COALESCE(new.raw_user_meta_data->>'avatar_url', '')
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para mantener actualizado 'updated_at'
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_empresas_modtime ON public.empresas;
CREATE TRIGGER update_empresas_modtime BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_perfiles_modtime ON public.perfiles;
CREATE TRIGGER update_perfiles_modtime BEFORE UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_proyectos_modtime ON public.proyectos;
CREATE TRIGGER update_proyectos_modtime BEFORE UPDATE ON public.proyectos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_catalogo_modtime ON public.catalogo_conceptos;
CREATE TRIGGER update_catalogo_modtime BEFORE UPDATE ON public.catalogo_conceptos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_insumos_modtime ON public.insumos_apu;
CREATE TRIGGER update_insumos_modtime BEFORE UPDATE ON public.insumos_apu FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_estimaciones_modtime ON public.estimaciones;
CREATE TRIGGER update_estimaciones_modtime BEFORE UPDATE ON public.estimaciones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==============================================================================
-- 9. SEGURIDAD: ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Función auxiliar para obtener la empresa_id del usuario conectado
CREATE OR REPLACE FUNCTION public.obtener_mi_empresa_id()
RETURNS UUID AS $$
    SELECT empresa_id FROM public.perfiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Habilitar RLS en todas las tablas públicas
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_conceptos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insumos_apu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimacion_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cronograma_actividades ENABLE ROW LEVEL SECURITY;

-- Políticas para EMPRESAS
DROP POLICY IF EXISTS "Los usuarios solo ven su empresa" ON public.empresas;
CREATE POLICY "Los usuarios solo ven su empresa" 
    ON public.empresas FOR SELECT 
    USING (id = public.obtener_mi_empresa_id());

DROP POLICY IF EXISTS "Los dueños pueden editar su empresa" ON public.empresas;
CREATE POLICY "Los dueños pueden editar su empresa" 
    ON public.empresas FOR UPDATE 
    USING (id = public.obtener_mi_empresa_id());

-- Políticas para PERFILES
DROP POLICY IF EXISTS "Los usuarios ven perfiles de su misma empresa" ON public.perfiles;
CREATE POLICY "Los usuarios ven perfiles de su misma empresa" 
    ON public.perfiles FOR SELECT 
    USING (empresa_id = public.obtener_mi_empresa_id());

DROP POLICY IF EXISTS "Los usuarios pueden actualizar su propio perfil" ON public.perfiles;
CREATE POLICY "Los usuarios pueden actualizar su propio perfil" 
    ON public.perfiles FOR UPDATE 
    USING (id = auth.uid());

-- Políticas para PROYECTOS
DROP POLICY IF EXISTS "Ver proyectos de mi empresa" ON public.proyectos;
CREATE POLICY "Ver proyectos de mi empresa" 
    ON public.proyectos FOR SELECT 
    USING (empresa_id = public.obtener_mi_empresa_id());

DROP POLICY IF EXISTS "Crear proyectos en mi empresa" ON public.proyectos;
CREATE POLICY "Crear proyectos en mi empresa" 
    ON public.proyectos FOR INSERT 
    WITH CHECK (empresa_id = public.obtener_mi_empresa_id());

DROP POLICY IF EXISTS "Editar proyectos de mi empresa" ON public.proyectos;
CREATE POLICY "Editar proyectos de mi empresa" 
    ON public.proyectos FOR UPDATE 
    USING (empresa_id = public.obtener_mi_empresa_id());

DROP POLICY IF EXISTS "Eliminar proyectos de mi empresa" ON public.proyectos;
CREATE POLICY "Eliminar proyectos de mi empresa" 
    ON public.proyectos FOR DELETE 
    USING (empresa_id = public.obtener_mi_empresa_id());

-- Políticas para CATALOGO_CONCEPTOS
DROP POLICY IF EXISTS "Acceso a conceptos si perteneces al proyecto" ON public.catalogo_conceptos;
CREATE POLICY "Acceso a conceptos si perteneces al proyecto" 
    ON public.catalogo_conceptos FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.proyectos p 
            WHERE p.id = catalogo_conceptos.proyecto_id 
            AND p.empresa_id = public.obtener_mi_empresa_id()
        )
    );

-- Políticas para INSUMOS_APU
DROP POLICY IF EXISTS "Acceso a insumos si perteneces al concepto del proyecto" ON public.insumos_apu;
CREATE POLICY "Acceso a insumos si perteneces al concepto del proyecto" 
    ON public.insumos_apu FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.catalogo_conceptos c
            JOIN public.proyectos p ON p.id = c.proyecto_id
            WHERE c.id = insumos_apu.concepto_id 
            AND p.empresa_id = public.obtener_mi_empresa_id()
        )
    );

-- Políticas para ESTIMACIONES
DROP POLICY IF EXISTS "Acceso a estimaciones de mi empresa" ON public.estimaciones;
CREATE POLICY "Acceso a estimaciones de mi empresa" 
    ON public.estimaciones FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.proyectos p 
            WHERE p.id = estimaciones.proyecto_id 
            AND p.empresa_id = public.obtener_mi_empresa_id()
        )
    );

DROP POLICY IF EXISTS "Acceso a detalles de estimaciones" ON public.estimacion_detalles;
CREATE POLICY "Acceso a detalles de estimaciones" 
    ON public.estimacion_detalles FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.estimaciones e
            JOIN public.proyectos p ON p.id = e.proyecto_id
            WHERE e.id = estimacion_detalles.estimacion_id 
            AND p.empresa_id = public.obtener_mi_empresa_id()
        )
    );

-- Políticas para CRONOGRAMA
DROP POLICY IF EXISTS "Acceso a cronograma de mi empresa" ON public.cronograma_actividades;
CREATE POLICY "Acceso a cronograma de mi empresa" 
    ON public.cronograma_actividades FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM public.proyectos p 
            WHERE p.id = cronograma_actividades.proyecto_id 
            AND p.empresa_id = public.obtener_mi_empresa_id()
        )
    );

-- ==============================================================================
-- 10. TABLA DE INVITACIONES Y COLABORADORES DE OBRA
-- ==============================================================================
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

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso a invitaciones" ON public.invitaciones;
CREATE POLICY "Acceso a invitaciones" ON public.invitaciones FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- 11. FUNCIÓN AUXILIAR DE ACCESO MULTI-TENANT Y COLABORADORES INVITADOS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.tiene_acceso_registro(
    p_empresa_id UUID,
    p_owner_email TEXT,
    p_proyecto_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_email TEXT := LOWER(COALESCE(auth.jwt()->>'email', ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    IF p_empresa_id IS NOT NULL AND p_empresa_id = public.obtener_mi_empresa_id() THEN
        RETURN true;
    END IF;

    IF v_email <> '' AND LOWER(COALESCE(p_owner_email, '')) = v_email THEN
        RETURN true;
    END IF;

    IF COALESCE(p_proyecto_id, '') <> '' THEN
        IF EXISTS (
            SELECT 1 FROM public.proyectos p
            WHERE p.id::text = p_proyecto_id
              AND p.empresa_id = public.obtener_mi_empresa_id()
        ) THEN
            RETURN true;
        END IF;

        IF v_email <> '' AND EXISTS (
            SELECT 1 FROM public.invitaciones i
            WHERE i.proyecto_id::text = p_proyecto_id
              AND LOWER(i.invitee_email) = v_email
              AND i.estado IN ('pending', 'accepted', 'active')
        ) THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 12. EXTENSIONES DE ESQUEMA PARA ESTIMACIONES Y CRONOGRAMA
-- ==============================================================================
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
CREATE POLICY "Acceso cronograma config"
    ON public.cronograma_config FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));

-- ==============================================================================
-- 13. ÍNDICE CENTRAL DE ARCHIVOS EN AWS S3 Y CONTROL DE CUOTAS (archivos_almacen)
-- ==============================================================================
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

-- RPC para calcular consumo real del anfitrión en servidor (proyectos + catálogos maestro)
CREATE OR REPLACE FUNCTION public.obtener_consumo_almacen_anfitrion(p_owner_email TEXT)
RETURNS TABLE (
    owner_email TEXT,
    plan_id TEXT,
    project_files_bytes BIGINT,
    master_catalog_bytes BIGINT,
    total_bytes BIGINT,
    files_count BIGINT
) AS $$
DECLARE
    v_owner TEXT := LOWER(TRIM(COALESCE(p_owner_email, '')));
    v_plan TEXT := 'free';
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Autenticación requerida';
    END IF;

    IF v_owner = '' THEN
        v_owner := LOWER(COALESCE(auth.jwt()->>'email', ''));
    END IF;

    SELECT COALESCE(e.plan, 'free')
      INTO v_plan
      FROM public.perfiles pf
      LEFT JOIN public.empresas e ON e.id = pf.empresa_id
     WHERE LOWER(pf.email) = v_owner
     ORDER BY (CASE WHEN pf.rol = 'owner' THEN 0 ELSE 1 END), pf.updated_at DESC
     LIMIT 1;

    RETURN QUERY
    SELECT
        v_owner,
        COALESCE(v_plan, 'free'),
        COALESCE(SUM(CASE WHEN a.categoria <> 'master_catalog' THEN a.tamano_bytes ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(CASE WHEN a.categoria = 'master_catalog' THEN a.tamano_bytes ELSE 0 END), 0)::BIGINT,
        COALESCE(SUM(a.tamano_bytes), 0)::BIGINT,
        COUNT(*)::BIGINT
    FROM public.archivos_almacen a
    WHERE LOWER(a.owner_email) = v_owner
      AND a.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 14. MÓDULO DE BITÁCORA DE OBRA (Configuración + Notas/Asientos)
-- ==============================================================================
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
CREATE POLICY "Acceso bitacora config"
    ON public.bitacora_config FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));

DROP POLICY IF EXISTS "Acceso bitacora notas" ON public.bitacora_notas;
CREATE POLICY "Acceso bitacora notas"
    ON public.bitacora_notas FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));

-- ==============================================================================
-- 15. MÓDULO DE COMPRAS, GASTOS Y PROVEEDORES
-- ==============================================================================
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
CREATE POLICY "Acceso proveedores"
    ON public.proveedores FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));

DROP POLICY IF EXISTS "Acceso compras gastos" ON public.compras_gastos;
CREATE POLICY "Acceso compras gastos"
    ON public.compras_gastos FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));

-- ==============================================================================
-- 16. MÓDULO DE CHAT INTERNO DE OBRA Y CATÁLOGOS MAESTROS EN NUBE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.chat_mensajes (
    id VARCHAR(120) PRIMARY KEY,
    proyecto_id TEXT NOT NULL,
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    owner_email VARCHAR(255) NOT NULL DEFAULT '',
    autor_nombre VARCHAR(255) NOT NULL DEFAULT '',
    autor_email VARCHAR(255) NOT NULL DEFAULT '',
    autor_avatar_url TEXT DEFAULT '',
    mensaje TEXT NOT NULL DEFAULT '',
    adjuntos JSONB DEFAULT '[]'::jsonb,
    payload_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_mensajes_proyecto ON public.chat_mensajes(proyecto_id, created_at);

DROP TRIGGER IF EXISTS update_chat_mensajes_modtime ON public.chat_mensajes;
CREATE TRIGGER update_chat_mensajes_modtime
    BEFORE UPDATE ON public.chat_mensajes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.chat_mensajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso chat proyecto" ON public.chat_mensajes;
CREATE POLICY "Acceso chat proyecto"
    ON public.chat_mensajes FOR ALL
    USING (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text))
    WITH CHECK (public.tiene_acceso_registro(empresa_id, owner_email::text, proyecto_id::text));

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
-- 17. PUBLICACIÓN EN TIEMPO REAL (Supabase Realtime)
-- ==============================================================================
DO $$
DECLARE
    v_table TEXT;
    v_tables TEXT[] := ARRAY[
        'proyectos',
        'catalogo_conceptos',
        'insumos_apu',
        'estimaciones',
        'estimacion_detalles',
        'cronograma_actividades',
        'cronograma_config',
        'invitaciones',
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
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN undefined_object THEN NULL;
        END;
    END LOOP;
END $$;

-- ==============================================================================
-- 18. CUOTAS MENSUALES DE IA ESTÁNDAR Y GOOGLE SEARCH GROUNDING (POR CUENTA)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.consumo_mensual_ia (
    user_id UUID NOT NULL,
    month_key TEXT NOT NULL, -- Formato YYYY-MM (UTC)
    plan_id TEXT NOT NULL DEFAULT 'free',
    standard_calls INTEGER NOT NULL DEFAULT 0,
    search_grounding_calls INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_consumo_mensual_ia_month ON public.consumo_mensual_ia(month_key);

DROP TRIGGER IF EXISTS update_consumo_mensual_ia_modtime ON public.consumo_mensual_ia;
CREATE TRIGGER update_consumo_mensual_ia_modtime
    BEFORE UPDATE ON public.consumo_mensual_ia
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.consumo_mensual_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuario lee su propio consumo IA" ON public.consumo_mensual_ia;
CREATE POLICY "Usuario lee su propio consumo IA"
    ON public.consumo_mensual_ia FOR SELECT
    USING (auth.uid() = user_id);

-- RPC atómico ejecutado por /api/gemini-apu para validar e incrementar cuota mensual
CREATE OR REPLACE FUNCTION public.check_and_increment_ai_quota(
    p_user_id UUID,
    p_plan_id TEXT DEFAULT 'free',
    p_std_delta INTEGER DEFAULT 0,
    p_search_delta INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_month TEXT := to_char(timezone('UTC', NOW()), 'YYYY-MM');
    v_plan TEXT := LOWER(COALESCE(NULLIF(TRIM(p_plan_id), ''), 'free'));
    v_max_std INTEGER;
    v_max_search INTEGER;
    v_cur_std INTEGER := 0;
    v_cur_search INTEGER := 0;
    v_next_std INTEGER;
    v_next_search INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'missing_user_id');
    END IF;

    IF v_plan NOT IN ('free', 'plus', 'pro') THEN
        v_plan := 'free';
    END IF;

    v_max_std := CASE v_plan WHEN 'pro' THEN 3500 WHEN 'plus' THEN 1500 ELSE 10 END;
    v_max_search := CASE v_plan WHEN 'pro' THEN 200 WHEN 'plus' THEN 70 ELSE 0 END;

    INSERT INTO public.consumo_mensual_ia (user_id, month_key, plan_id, standard_calls, search_grounding_calls)
    VALUES (p_user_id, v_month, v_plan, 0, 0)
    ON CONFLICT (user_id, month_key) DO UPDATE SET plan_id = EXCLUDED.plan_id;

    SELECT standard_calls, search_grounding_calls
      INTO v_cur_std, v_cur_search
      FROM public.consumo_mensual_ia
     WHERE user_id = p_user_id AND month_key = v_month
     FOR UPDATE;

    v_next_std := v_cur_std + GREATEST(0, COALESCE(p_std_delta, 0));
    v_next_search := v_cur_search + GREATEST(0, COALESCE(p_search_delta, 0));

    IF COALESCE(p_search_delta, 0) > 0 AND v_next_search > v_max_search THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'web_search_quota_exceeded',
            'plan_id', v_plan,
            'month_key', v_month,
            'standard_used', v_cur_std,
            'standard_limit', v_max_std,
            'search_used', v_cur_search,
            'search_limit', v_max_search
        );
    END IF;

    IF COALESCE(p_std_delta, 0) > 0 AND v_next_std > v_max_std THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'standard_ai_quota_exceeded',
            'plan_id', v_plan,
            'month_key', v_month,
            'standard_used', v_cur_std,
            'standard_limit', v_max_std,
            'search_used', v_cur_search,
            'search_limit', v_max_search
        );
    END IF;

    UPDATE public.consumo_mensual_ia
       SET plan_id = v_plan,
           standard_calls = v_next_std,
           search_grounding_calls = v_next_search,
           updated_at = NOW()
     WHERE user_id = p_user_id AND month_key = v_month;

    RETURN jsonb_build_object(
        'allowed', true,
        'plan_id', v_plan,
        'month_key', v_month,
        'standard_used', v_next_std,
        'standard_limit', v_max_std,
        'search_used', v_next_search,
        'search_limit', v_max_search
    );
END;
$$;
