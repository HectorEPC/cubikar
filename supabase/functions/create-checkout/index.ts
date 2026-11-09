// supabase/functions/create-checkout/index.ts
// Función Serverless Deno para iniciar sesión de Stripe Checkout

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

// Configuración de IDs de precio en Stripe o montos en centavos MXN
const PLAN_PRICES: Record<string, { monthly: { amount: number; name: string }; annual: { amount: number; name: string } }> = {
  plus: {
    monthly: { amount: 35000, name: "Plan Plus (Mensual)" }, // $350.00 MXN
    annual: { amount: 336000, name: "Plan Plus (Anual - 20% Descuento)" } // $3,360.00 MXN
  },
  pro: {
    monthly: { amount: 95000, name: "Plan Pro (Mensual)" }, // $950.00 MXN
    annual: { amount: 912000, name: "Plan Pro (Anual - 20% Descuento)" } // $9,120.00 MXN
  }
};

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

    const { planId, billingCycle = "monthly", successUrl, cancelUrl } = await req.json();

    if (!PLAN_PRICES[planId]) {
      return new Response(JSON.stringify({ error: `Plan inválido: ${planId}` }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 2. Obtener la empresa del usuario
    const { data: perfil } = await supabaseClient
      .from("perfiles")
      .select("empresa_id, empresas(id, stripe_customer_id, nombre)")
      .eq("id", user.id)
      .single();

    let customerId = (perfil as any)?.empresas?.stripe_customer_id;

    // Crear cliente en Stripe si aún no existe
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: (perfil as any)?.empresas?.nombre || user.user_metadata?.full_name || user.email,
        metadata: {
          empresa_id: (perfil as any)?.empresa_id || "",
          user_id: user.id,
        },
      });
      customerId = customer.id;

      // Actualizar registro en base de datos
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      await adminClient
        .from("empresas")
        .update({ stripe_customer_id: customerId })
        .eq("id", (perfil as any)?.empresa_id);
    }

    const planConfig = PLAN_PRICES[planId][billingCycle as "monthly" | "annual"];
    const interval = billingCycle === "annual" ? "year" : "month";

    // 3. Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_update: { address: "auto" },
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "mxn",
            product_data: {
              name: `Sistema Control de Obra - ${planConfig.name}`,
              description: `Suscripción ${interval === 'year' ? 'Anual' : 'Mensual'} para la empresa`,
            },
            unit_amount: planConfig.amount,
            recurring: { interval: interval },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      allow_promotion_codes: true,
      subscription_data: {
        metadata: {
          empresa_id: (perfil as any)?.empresa_id,
          plan: planId,
        },
      },
      success_url: successUrl || `${req.headers.get("origin")}/?pago=exitoso`,
      cancel_url: cancelUrl || `${req.headers.get("origin")}/?pago=cancelado`,
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
