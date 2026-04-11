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

// Cria/atualiza registro em pending_subscriptions para compras orfas.
// Quando o user criar conta com esse email, AuthContext reconcilia.
async function upsertPending(
  email: string,
  tier: string,
  expiresAt: string,
  externalId: string | undefined,
  status: string,
  rawPayload: any
) {
  // Supersede pendings anteriores do mesmo email
  await supabase
    .from("pending_subscriptions")
    .update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("email", email.toLowerCase())
    .eq("status", "pending");

  const { error } = await supabase.from("pending_subscriptions").insert({
    email: email.toLowerCase(),
    tier: tier,
    subscription_source: "kiwify",
    subscription_external_id: externalId || null,
    subscription_status: status,
    expires_at: expiresAt,
    status: "pending",
    raw_payload: rawPayload,
  });
  if (error) {
    console.error("upsertPending insert error:", error.message);
    throw error;
  }
}

// Revoga pendings nao aplicados quando evento de revogacao chega pra
// email sem conta no app.
async function revokePending(email: string, reason: string) {
  await supabase
    .from("pending_subscriptions")
    .update({ status: "revoked", subscription_status: reason, updated_at: new Date().toISOString() })
    .eq("email", email.toLowerCase())
    .eq("status", "pending");
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validacao do segredo (Kiwify envia token via query param ?token=)
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("x-kiwify-token") || "";
    if (webhookSecret && token !== webhookSecret) {
      console.warn("kiwify-webhook: invalid token. got:", token, "expected length:", webhookSecret.length);
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pega body raw e tenta parsear como JSON
    const rawBody = await req.text();
    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch (parseErr) {
      console.warn("kiwify-webhook: invalid json body", rawBody.substring(0, 200));
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log completo do payload (so na primeira semana, tirar depois) para debug do formato
    console.log("kiwify-webhook RAW:", JSON.stringify(body));

    // Kiwify pode enviar o evento em multiplos campos/idiomas
    const eventType: string = (
      body.webhook_event_type ||
      body.event ||
      body.order_status ||
      body.status ||
      body.Subscription?.status ||
      "unknown"
    ).toString();

    // Email pode estar em varios lugares
    const email: string = (
      body.Customer?.email ||
      body.customer?.email ||
      body.email ||
      body.Customer?.Email ||
      ""
    ).toString().toLowerCase().trim();

    // ID externo
    const externalId: string = (
      body.order_id ||
      body.Subscription?.id ||
      body.subscription_id ||
      body.id ||
      ""
    ).toString();

    // Frequencia (mensal/anual) — varios lugares possiveis
    const frequency: string =
      body.Subscription?.plan?.frequency ||
      body.subscription?.plan?.frequency ||
      body.plan?.frequency ||
      body.frequency ||
      body.product_name ||
      "";

    console.log("kiwify-webhook parsed:", { eventType, email, externalId, frequency });

    if (!email) {
      console.warn("kiwify-webhook: missing email in payload");
      return new Response(JSON.stringify({ error: "missing email", received: Object.keys(body) }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = await findUserByEmail(email);

    // Normalizar evento — Kiwify pode enviar em pt-br ou en
    const lower = eventType.toLowerCase().trim();

    // ─── Eventos que ATIVAM PRO ───
    const grantEvents = [
      "order_approved", "approved", "compra_aprovada", "compra aprovada",
      "subscription_renewed", "renewed", "assinatura_renovada", "assinatura renovada",
      "paid", "pago", "completed", "concluido",
    ];

    // ─── Eventos que REVOGAM PRO ───
    const revokeEvents = [
      "order_refunded", "refunded", "reembolso", "reembolsado",
      "chargeback",
      "subscription_canceled", "canceled", "cancelled", "assinatura_cancelada", "assinatura cancelada",
      "subscription_late", "assinatura_atrasada", "assinatura atrasada", // atrasada = revoga (pode dar grace period futuramente)
    ];

    if (grantEvents.indexOf(lower) !== -1) {
      const expiresAt = calcExpiresAt(frequency);
      if (userId) {
        await grantPro(userId, expiresAt, externalId, "active");
        console.log("kiwify-webhook: granted PRO to", email, "until", expiresAt);
        return new Response(
          JSON.stringify({ ok: true, action: "grant_pro", user_id: userId, email, expires_at: expiresAt }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      // Compra orfa — user ainda nao tem conta. Salva pra reconciliar no signup.
      await upsertPending(email, "pro", expiresAt, externalId, "active", body);
      console.log("kiwify-webhook: saved pending PRO for", email, "until", expiresAt);
      return new Response(
        JSON.stringify({
          ok: true,
          action: "pending",
          email,
          expires_at: expiresAt,
          message: "saved for reconciliation on signup",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (revokeEvents.indexOf(lower) !== -1) {
      if (userId) {
        await revokePro(userId, lower);
        console.log("kiwify-webhook: revoked PRO from", email, "reason", lower);
        return new Response(
          JSON.stringify({ ok: true, action: "revoke_pro", user_id: userId, email, reason: lower }),
          { headers: { "Content-Type": "application/json" } }
        );
      }
      // Revogacao de compra orfa — marca pendings do email como revogados.
      await revokePending(email, lower);
      console.log("kiwify-webhook: revoked pending for", email, "reason", lower);
      return new Response(
        JSON.stringify({ ok: true, action: "revoke_pending", email, reason: lower }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Evento nao reconhecido — apenas registra (nao falha)
    console.log("kiwify-webhook: event not handled:", lower, "user_found:", !!userId);
    return new Response(
      JSON.stringify({ ok: true, action: "noop", event: lower, message: "event not handled but webhook received" }),
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
