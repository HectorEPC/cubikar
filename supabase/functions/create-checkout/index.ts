// supabase/functions/create-checkout/index.ts
// Función Serverless Deno para iniciar sesión de Stripe Checkout

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

// Configuración de IDs de precio en Stripe o montos en centavos MXN por producto
const PRODUCT_PRICES: Record<
  "const" | "arq" | "combo",
  Record<string, { monthly: { amount: number; name: string }; annual: { amount: number; name: string } }>
> = {
  const: {
    plus: {
      monthly: { amount: 35000, name: "Plan Plus (Mensual)" }, // $350.00 MXN
      annual: { amount: 336000, name: "Plan Plus (Anual - 20% Descuento)" }, // $3,360.00 MXN
    },
    pro: {
      monthly: { amount: 95000, name: "Plan Pro (Mensual)" }, // $950.00 MXN
      annual: { amount: 912000, name: "Plan Pro (Anual - 20% Descuento)" }, // $9,120.00 MXN
    },
  },
  arq: {
    plus: {
      monthly: { amount: 19900, name: "Plan Plus (Mensual)" }, // $199.00 MXN
      annual: { amount: 190800, name: "Plan Plus (Anual - 20% Descuento)" }, // $1,908.00 MXN
    },
    pro: {
      monthly: { amount: 49900, name: "Plan Pro (Mensual)" }, // $499.00 MXN
      annual: { amount: 478800, name: "Plan Pro (Anual - 20% Descuento)" }, // $4,788.00 MXN
    },
  },
  combo: {
    plus: {
      monthly: { amount: 44900, name: "Plan Plus Combo (Mensual)" }, // $449.00 MXN
      annual: { amount: 430800, name: "Plan Plus Combo (Anual - 20% Descuento)" }, // $4,308.00 MXN
    },
    pro: {
      monthly: { amount: 119000, name: "Plan Pro Combo (Mensual)" }, // $1,190.00 MXN
      annual: { amount: 1140000, name: "Plan Pro Combo (Anual - 20% Descuento)" }, // $11,400.00 MXN
    },
  },
};

function normalizeProducto(rawProducto: unknown, defaultProd: "const" | "arq" = "const"): "const" | "arq" | "combo" {
  const v = String(rawProducto ?? "").toLowerCase().trim();
  if (v === "arq" || v === "arquitectura") return "arq";
  if (v === "const" || v === "construccion" || v === "construcción") return "const";
  if (v === "combo" || v === "ambos" || v === "all") return "combo";
  return defaultProd;
}

function resolveStripePriceId(plan: string, ciclo: "monthly" | "annual", producto: "const" | "arq" | "combo"): string {
  const planUpper = plan.toUpperCase();
  const cicloUpper = ciclo.toUpperCase();
  const prodUpper = producto.toUpperCase();

  if (producto === "combo") {
    return (
      Deno.env.get(`STRIPE_PRICE_${planUpper}_${cicloUpper}_COMBO`) ||
      Deno.env.get(`STRIPE_PRICE_COMBO_${planUpper}_${cicloUpper}`) ||
      Deno.env.get(`STRIPE_PRICE_${planUpper}_${cicloUpper}_${prodUpper}`) ||
      Deno.env.get(`STRIPE_PRICE_${planUpper}_${cicloUpper}`) ||
      ""
    );
  }

  return (
    Deno.env.get(`STRIPE_PRICE_${planUpper}_${cicloUpper}_${prodUpper}`) ||
    Deno.env.get(`STRIPE_PRICE_${prodUpper}_${planUpper}_${cicloUpper}`) ||
    Deno.env.get(`STRIPE_PRICE_${planUpper}_${cicloUpper}`) ||
    ""
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    // 1. Validar usuario autenticado
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado. Inicie sesión para continuar." }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const {
      plan: rawPlan,
      planId: rawPlanId,
      ciclo = "monthly",
      billingCycle,
      producto: rawProducto,
      returnUrl,
      successUrl,
      cancelUrl,
    } = await req.json();

    const plan = String(rawPlan || rawPlanId || "").toLowerCase().trim();
    const rawCycle = String(billingCycle || ciclo || "monthly").toLowerCase().trim();
    const normalizedCycle: "monthly" | "annual" | null =
      rawCycle === "annual" || rawCycle === "anual" || rawCycle === "yearly"
        ? "annual"
        : rawCycle === "monthly" || rawCycle === "mensual"
        ? "monthly"
        : null;
    const producto = normalizeProducto(rawProducto, "const");

    if (!PRODUCT_PRICES[producto]?.[plan] || !normalizedCycle) {
      return new Response(JSON.stringify({ error: `Plan o ciclo inválido: ${plan} / ${rawCycle}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Obtener la empresa del usuario
    const { data: perfil } = await supabaseClient
      .from("perfiles")
      .select("empresa_id, empresas(id, stripe_customer_id, nombre)")
      .eq("id", user.id)
      .single();

    const empresaId = (perfil as any)?.empresa_id;
    if (!empresaId) {
      return new Response(JSON.stringify({ error: "No se encontró empresa asociada al usuario." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let customerId = (perfil as any)?.empresas?.stripe_customer_id;

    // Crear cliente en Stripe si aún no existe
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: (perfil as any)?.empresas?.nombre || user.user_metadata?.full_name || user.email,
        metadata: {
          empresa_id: empresaId,
          user_id: user.id,
        },
      });
      customerId = customer.id;

      // Actualizar registro en base de datos
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      const { error: custUpdateErr } = await adminClient
        .from("empresas")
        .update({ stripe_customer_id: customerId })
        .eq("id", empresaId);
      if (custUpdateErr) {
        throw new Error(`No se pudo vincular el cliente Stripe: ${custUpdateErr.message}`);
      }
    }

    const planConfig = PRODUCT_PRICES[producto][plan][normalizedCycle];
    const interval = normalizedCycle === "annual" ? "year" : "month";
    const priceId = resolveStripePriceId(plan, normalizedCycle, producto);
    const productTitle =
      producto === "combo"
        ? "Cubikar Suite Combo"
        : producto === "arq"
        ? "Cubikar Arquitectura"
        : "Cubikar Construcción";

    const lineItems = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "mxn",
              product_data: {
                name: `${productTitle} - ${planConfig.name}`,
                description: `Suscripción ${interval === "year" ? "Anual" : "Mensual"} para ${productTitle}`,
              },
              unit_amount: planConfig.amount,
              recurring: { interval: interval },
            },
            quantity: 1,
          },
        ];

    const baseReturn = returnUrl || req.headers.get("origin") || "";
    const sep = baseReturn.includes("?") ? "&" : "?";

    // 3. Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_update: { address: "auto" },
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "subscription",
      allow_promotion_codes: true,
      metadata: {
        empresa_id: empresaId,
        plan: plan,
        producto: producto,
        billing_cycle: normalizedCycle,
      },
      subscription_data: {
        metadata: {
          empresa_id: empresaId,
          plan: plan,
          producto: producto,
          billing_cycle: normalizedCycle,
        },
      },
      success_url: successUrl || `${baseReturn}${sep}pago=exitoso`,
      cancel_url: cancelUrl || `${baseReturn}${sep}pago=cancelado`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("[create-checkout] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
