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
-- 11. PUBLICACIÓN EN TIEMPO REAL (Supabase Realtime)
-- ==============================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.proyectos;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.catalogo_conceptos;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.insumos_apu;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estimaciones;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estimacion_detalles;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cronograma_actividades;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invitaciones;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
