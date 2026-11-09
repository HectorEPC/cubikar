# Guía de Implementación Backend con Supabase y Stripe

Este documento describe la arquitectura, puesta en marcha y despliegue del backend en **Supabase** y **Stripe** para el **Sistema de Control de Obra y Presupuestos Base (APU)**.

---

## 📁 Archivos Generados en el Proyecto

```text
ADM_CONST/
├── supabase/
│   ├── schema.sql                         # Base de datos completa en PostgreSQL, RLS y Realtime
│   ├── README_SUPABASE.md                 # Esta guía paso a paso
│   └── functions/                         # Supabase Edge Functions (Serverless Deno)
│       ├── create-checkout/
│       │   └── index.ts                   # Inicia sesión segura de pago en Stripe Checkout
│       ├── stripe-webhook/
│       │   └── index.ts                   # Sincroniza estado de suscripción ante pagos o cancelaciones
│       └── create-portal-link/
│           └── index.ts                   # Genera acceso al Stripe Customer Portal (facturas/tarjetas)
└── js/
    └── core/
        ├── supabaseClient.js              # Inicialización del SDK y detección offline/local
        ├── authService.js                 # Login, registro, Google OAuth y perfiles
        └── realtimeSync.js                # Sincronización en tiempo real y presencia de usuarios
```

---

## Paso 1: Configurar la Base de Datos en Supabase

1. Crea una cuenta o inicia sesión en [supabase.com](https://supabase.com) y crea un nuevo proyecto (ej. `adm-const-prod`).
2. En el panel izquierdo de tu proyecto en Supabase, entra a **SQL Editor**.
3. Abre el archivo local `supabase/schema.sql`, copia todo su contenido y pégalo en el editor SQL de Supabase.
4. Presiona **Run** (Ejecutar).
   - Esto creará automáticamente las tablas: `empresas`, `perfiles`, `proyectos`, `catalogo_conceptos`, `insumos_apu`, `estimaciones`, `estimacion_detalles` y `cronograma_actividades`.
   - Se activarán las políticas de seguridad **RLS (Row Level Security)**.
   - Se añadirá el trigger de creación de empresa automática al registrar usuarios.
   - Se activará la publicación para **Supabase Realtime (WebSockets)**.

---

## Paso 2: Conectar el Frontend a Supabase (¡Ya configurado!)

Tus credenciales ya se encuentran integradas en `js/core/supabaseClient.js`:
- **Project Ref**: `hxyzvxueoqvvjyehfpym`
- **Project URL**: `https://hxyzvxueoqvvjyehfpym.supabase.co`
- **Anon Key**: Configurada y activa.

---

## Paso 3: Configurar Stripe y Desplegar Edge Functions

### 3.1 Obtener Claves de Stripe
1. Entra a tu panel de [Stripe](https://dashboard.stripe.com).
2. Obtén tu **Secret Key** (`sk_live_...` o `sk_test_...` para pruebas).

### 3.2 Desplegar las Edge Functions con Supabase CLI
Abre tu terminal en la raíz del proyecto y ejecuta:

```bash
# Iniciar sesión en Supabase CLI
npx supabase login

# Vincular tu proyecto de Supabase
npx supabase link --project-ref hxyzvxueoqvvjyehfpym

# Configurar las variables secretas en Supabase
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase secrets set STRIPE_WEBHOOK_SIGNING_SECRET=whsec_...

# Desplegar las 3 Edge Functions
npx supabase functions deploy create-checkout --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
npx supabase functions deploy create-portal-link
```

### 3.3 Registrar el Webhook en Stripe
1. En el panel de Stripe, ve a **Developers > Webhooks**.
2. Haz clic en **Add Endpoint**.
3. En **Endpoint URL**, coloca:
   `https://TU-PROYECTO.supabase.co/functions/v1/stripe-webhook`
4. En **Events to send**, selecciona:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Guarda el webhook y copia el **Signing secret** (`whsec_...`).
6. Si aún no lo habías configurado en Supabase, asígnalo con:
   ```bash
   npx supabase secrets set STRIPE_WEBHOOK_SIGNING_SECRET=whsec_...
   ```

---

## Paso 4: Probar la Sincronización en Tiempo Real (Usuario A y Usuario B)

1. Abre la aplicación en dos navegadores diferentes (o uno en ventana normal y otro en incógnito).
2. Inicia sesión con usuarios que pertenezcan al mismo proyecto.
3. Edita la cantidad o precio de un concepto en el **Navegador A** y presiona `Enter`.
4. Observa cómo el **Navegador B** actualiza de inmediato el valor y los totales sin recargar la página gracias a `postgres_changes`.

---

## Paso 5: Probar el Cobro de Suscripciones

1. Abre el menú de usuario y haz clic en **Suscripción**.
2. Selecciona el plan **Plus** o **Pro** (mensual o anual).
3. La aplicación invocará `create-checkout` y te redirigirá a la pasarela oficial de **Stripe Checkout**.
4. Al pagar (con tarjeta de prueba de Stripe en modo test), Stripe llamará a `stripe-webhook`.
5. La Edge Function actualizará la empresa en Supabase a `estado_suscripcion = 'active'` y `plan = 'plus'` o `'pro'`.
6. En el modal de suscripción, aparecerá el botón **"Ver Facturas y Tarjeta en Stripe"**, el cual abre el portal de cliente de Stripe para auto-gestión.
