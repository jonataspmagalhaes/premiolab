// add-ai-credits — Supabase Edge Function
// Webhook endpoint for RevenueCat to add AI credits after consumable IAP purchase
// Also supports manual admin calls

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Product ID → credits mapping
const CREDIT_PACKAGES: Record<string, number> = {
  premiolab_ai_20: 20,
  premiolab_ai_50: 50,
  premiolab_ai_150: 150,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    // RevenueCat webhook format
    if (body.event && body.event.type) {
      const event = body.event;
      // Only process INITIAL_PURCHASE for consumables
      if (event.type !== "INITIAL_PURCHASE" && event.type !== "NON_RENEWING_PURCHASE") {
        return respond({ ok: true, skipped: true, reason: "event_type_ignored" });
      }

      const appUserId = event.app_user_id;
      const productId = event.product_id;

      if (!appUserId || !productId) {
        return respond({ error: "Missing app_user_id or product_id" }, 400);
      }

      const credits = CREDIT_PACKAGES[productId];
      if (!credits) {
        return respond({ ok: true, skipped: true, reason: "unknown_product" });
      }

      // Add credits
      await supabaseAdmin.rpc("add_ai_credits", {
        p_user_id: appUserId,
        p_amount: credits,
      });

      console.log("Added", credits, "AI credits for user:", appUserId, "product:", productId);
      return respond({ ok: true, credits_added: credits, user_id: appUserId });
    }

    // Manual admin call format: { user_id, credits, admin_key }
    if (body.user_id && body.credits && body.admin_key) {
      const expectedKey = Deno.env.get("ADMIN_WEBHOOK_KEY");
      if (!expectedKey || body.admin_key !== expectedKey) {
        return respond({ error: "Unauthorized" }, 401);
      }

      await supabaseAdmin.rpc("add_ai_credits", {
        p_user_id: body.user_id,
        p_amount: body.credits,
      });

      console.log("Admin added", body.credits, "AI credits for user:", body.user_id);
      return respond({ ok: true, credits_added: body.credits, user_id: body.user_id });
    }

    return respond({ error: "Invalid request format" }, 400);
  } catch (err) {
    console.error("add-ai-credits error:", err);
    return respond({ error: "Internal error" }, 500);
  }
});
