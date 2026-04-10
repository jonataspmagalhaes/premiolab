// kiwify-webhook — Supabase Edge Function
// Recebe postbacks da Kiwify (compra aprovada, reembolso, chargeback,
// renovacao, cancelamento) e atualiza profiles.tier + expires_at.
//
// Configurar na Kiwify:
//   URL: https://zephynezarjsxzselozi.supabase.co/functions/v1/kiwify-webhook
//   Eventos: order_approved, order_refunded, chargeback,
//            subscription_renewed, subscription_canceled
//
// Setup do segredo (token compartilhado pra validar postback):
//   npx supabase secrets set KIWIFY_WEBHOOK_SECRET=<token-da-kiwify>
//
// Deploy:
//   npx supabase functions deploy kiwify-webhook --no-verify-jwt --project-ref zephynezarjsxzselozi
//
// Migration necessaria (se nao existir): adicionar colunas em profiles
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_source TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_external_id TEXT;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("KIWIFY_WEBHOOK_SECRET") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

interface KiwifyOrder {
  order_id?: string;
  order_status?: string;
  product_id?: string;
  product_name?: string;
  webhook_event_type?: string;
  Customer?: {
    email?: string;
    full_name?: string;
  };
  Subscription?: {
    id?: string;
    status?: string;
    next_payment?: string;
    plan?: { name?: string; frequency?: string };
  };
  Product?: { product_id?: string; product_name?: string };
  TrackingParameters?: Record<string, string>;
}

async function findUserByEmail(email: string): Promise<string | null> {
  if (!email) return null;
  // Tenta auth.users primeiro
  const { data: userData } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (userData && userData.id) return userData.id;

  // Fallback: buscar pelo auth.users via admin API
  try {
    const { data: list } = await supabase.auth.admin.listUsers();
    if (list && list.users) {
      for (const u of list.users) {
        if (u.email && u.email.toLowerCase() === email.toLowerCase()) {
          return u.id;
        }
      }
    }
  } catch (_) {
    // ignore
  }
  return null;
}

function calcExpiresAt(frequency?: string): string {
  const now = new Date();
  // Default mensal: +30 dias com folga
  let days = 32;
  if (frequency && /year|annual|anual/i.test(frequency)) {
    days = 366;
  }
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString();
}

async function grantPro(
  userId: string,
  expiresAt: string,
  externalId: string | undefined,
  status: string
) {
  await supabase
    .from("profiles")
    .update({
      tier: "pro",
      subscription_expires_at: expiresAt,
      subscription_source: "kiwify",
      subscription_external_id: externalId || null,
      subscription_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function revokePro(userId: string, status: string) {
  await supabase
    .from("profiles")
    .update({
      tier: "free",
      subscription_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validacao do segredo (Kiwify envia token via query param ou header)
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("x-kiwify-token") || "";
    if (webhookSecret && token !== webhookSecret) {
      console.warn("kiwify-webhook: invalid token");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body: KiwifyOrder = await req.json();
    const eventType = body.webhook_event_type || body.order_status || "unknown";
    const email = body.Customer?.email || "";
    const externalId = body.order_id || body.Subscription?.id || "";
    const frequency = body.Subscription?.plan?.frequency;

    console.log("kiwify-webhook event:", eventType, "email:", email);

    if (!email) {
      return new Response(JSON.stringify({ error: "missing email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = await findUserByEmail(email);
    if (!userId) {
      console.warn("kiwify-webhook: user not found for email", email);
      return new Response(JSON.stringify({ error: "user not found", email }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mapeamento de eventos
    const lower = eventType.toLowerCase();

    if (
      lower === "order_approved" ||
      lower === "approved" ||
      lower === "subscription_renewed" ||
      lower === "renewed"
    ) {
      const expiresAt = calcExpiresAt(frequency);
      await grantPro(userId, expiresAt, externalId, "active");
      return new Response(
        JSON.stringify({ ok: true, action: "grant_pro", user_id: userId, expires_at: expiresAt }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (
      lower === "order_refunded" ||
      lower === "refunded" ||
      lower === "chargeback" ||
      lower === "subscription_canceled" ||
      lower === "canceled"
    ) {
      await revokePro(userId, lower);
      return new Response(
        JSON.stringify({ ok: true, action: "revoke_pro", user_id: userId, reason: lower }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, action: "noop", event: lower }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("kiwify-webhook error:", (e as Error).message);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
