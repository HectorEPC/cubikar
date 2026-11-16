// supabase/functions/stripe-webhook/index.ts
// Receptor de Webhooks de Stripe para sincronizar el estado de suscripción con Supabase

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SIGNING_SECRET") ?? "";

// Cliente con SERVICE_ROLE_KEY para actualizar registros con privilegios elevados
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature || !endpointSecret) {
    return new Response("Webhook signature o endpoint secret no configurados", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
  } catch (sigErr: any) {
    console.error("[Stripe Webhook] Firma inválida:", sigErr.message);
    return new Response(`Webhook Signature Error: ${sigErr.message}`, { status: 400 });
  }

  try {
    console.info(`[Stripe Webhook] Evento recibido: ${event.type}`);

    switch (event.type) {
      // 1. Pago inicial y sesión de suscripción completada
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const plan = subscription.metadata?.plan || session.metadata?.plan || "plus";
          const producto = subscription.metadata?.producto || session.metadata?.producto || "const"; // 'const' | 'arq' | 'combo'
          const periodoFin = new Date(subscription.current_period_end * 1000).toISOString();

          const updatePayload: Record<string, any> = {
            stripe_subscription_id: subscriptionId,
            plan: plan,
            estado_suscripcion: "active",
            periodo_fin: periodoFin,
          };

          if (producto === "arq") {
            updatePayload.acceso_arq = true;
            updatePayload.plan_arq = plan;
            updatePayload.periodo_fin_arq = periodoFin;
          } else if (producto === "const") {
            updatePayload.acceso_const = true;
            updatePayload.plan_const = plan;
            updatePayload.periodo_fin_const = periodoFin;
          } else if (producto === "combo") {
            updatePayload.acceso_arq = true;
            updatePayload.plan_arq = plan;
            updatePayload.periodo_fin_arq = periodoFin;
            updatePayload.acceso_const = true;
            updatePayload.plan_const = plan;
            updatePayload.periodo_fin_const = periodoFin;
          }

          const { error: updErr } = await supabaseAdmin
            .from("empresas")
            .update(updatePayload)
            .eq("stripe_customer_id", customerId);
          if (updErr) {
            throw new Error(`Error actualizando empresa en checkout.session.completed: ${updErr.message}`);
          }
        }
        break;
      }

      // 2. Renovación o actualización de suscripción
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status === "active" ? "active" : subscription.status;
        const plan = subscription.metadata?.plan;
        const producto = subscription.metadata?.producto || "const";
        const periodoFin = new Date(subscription.current_period_end * 1000).toISOString();

        const updatePayload: Record<string, any> = {
          estado_suscripcion: status,
          periodo_fin: periodoFin,
        };
        if (plan) {
          updatePayload.plan = plan;
          if (producto === "arq" || producto === "combo") {
            updatePayload.plan_arq = plan;
            updatePayload.acceso_arq = status === "active" || status === "trialing";
            updatePayload.periodo_fin_arq = periodoFin;
          }
          if (producto === "const" || producto === "combo") {
            updatePayload.plan_const = plan;
            updatePayload.acceso_const = status === "active" || status === "trialing";
            updatePayload.periodo_fin_const = periodoFin;
          }
        }

        const { error: updErr } = await supabaseAdmin
          .from("empresas")
          .update(updatePayload)
          .eq("stripe_customer_id", customerId);
        if (updErr) {
          throw new Error(`Error actualizando empresa en customer.subscription.updated: ${updErr.message}`);
        }

        break;
      }

      // 3. Cancelación de suscripción
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const producto = subscription.metadata?.producto || "const";

        const { data: currentEmpresa, error: fetchErr } = await supabaseAdmin
          .from("empresas")
          .select("acceso_arq, plan_arq, acceso_const, plan_const")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (fetchErr) {
          throw new Error(`Error consultando empresa en customer.subscription.deleted: ${fetchErr.message}`);
        }

        const hasActiveArq = Boolean(currentEmpresa?.acceso_arq && currentEmpresa?.plan_arq && currentEmpresa.plan_arq !== "free");
        const hasActiveConst = Boolean(currentEmpresa?.acceso_const && currentEmpresa?.plan_const && currentEmpresa.plan_const !== "free");

        const updatePayload: Record<string, any> = {};

        if (producto === "arq") {
          updatePayload.acceso_arq = false;
          updatePayload.plan_arq = "free";
          updatePayload.periodo_fin_arq = null;
          if (hasActiveConst) {
            updatePayload.plan = currentEmpresa?.plan_const || "plus";
            updatePayload.estado_suscripcion = "active";
          } else {
            updatePayload.plan = "free";
            updatePayload.estado_suscripcion = "canceled";
            updatePayload.stripe_subscription_id = null;
          }
        } else if (producto === "const") {
          updatePayload.acceso_const = false;
          updatePayload.plan_const = "free";
          updatePayload.periodo_fin_const = null;
          if (hasActiveArq) {
            updatePayload.plan = currentEmpresa?.plan_arq || "plus";
            updatePayload.estado_suscripcion = "active";
          } else {
            updatePayload.plan = "free";
            updatePayload.estado_suscripcion = "canceled";
            updatePayload.stripe_subscription_id = null;
          }
        } else if (producto === "combo") {
          updatePayload.acceso_arq = false;
          updatePayload.plan_arq = "free";
          updatePayload.periodo_fin_arq = null;
          updatePayload.acceso_const = false;
          updatePayload.plan_const = "free";
          updatePayload.periodo_fin_const = null;
          updatePayload.plan = "free";
          updatePayload.estado_suscripcion = "canceled";
          updatePayload.stripe_subscription_id = null;
        }

        const { error: updErr } = await supabaseAdmin
          .from("empresas")
          .update(updatePayload)
          .eq("stripe_customer_id", customerId);
        if (updErr) {
          throw new Error(`Error actualizando empresa en customer.subscription.deleted: ${updErr.message}`);
        }

        break;
      }

      // 4. Pago fallido (tarjeta rechazada o fondos insuficientes)
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { error: updErr } = await supabaseAdmin
          .from("empresas")
          .update({
            estado_suscripcion: "past_due",
          })
          .eq("stripe_customer_id", customerId);
        if (updErr) {
          throw new Error(`Error actualizando empresa en invoice.payment_failed: ${updErr.message}`);
        }

        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("[Stripe Webhook] Error:", err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 500 });
  }
});
