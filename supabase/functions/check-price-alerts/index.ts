// check-price-alerts — Supabase Edge Function
// Roda a cada 5 minutos (horario de mercado 10-18 BRT) via pg_cron
// Verifica alertas de preco de opcoes contra dados reais do mercado (OpLab API)
// Envia push notifications via Expo Push API para alertas disparados

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPLAB_BASE = "https://api.oplab.com.br/v3";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_NOTIFICATIONS_PER_RUN = 50;

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const oplabKey = Deno.env.get("OPLAB_API_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── OpLab API ───────────────────────────────────────────────

interface OplabOption {
  symbol: string;
  bid: number;
  ask: number;
  close: number;
  volume: number;
  iv: number;
  [key: string]: unknown;
}

interface OplabStrike {
  strike: number;
  call?: OplabOption;
  put?: OplabOption;
}

interface OplabSerie {
  due_date: string;
  strikes: OplabStrike[];
}

interface OplabChain {
  spot: number;
  series: OplabSerie[];
}

async function fetchOptionsChain(ticker: string): Promise<OplabChain | null> {
  if (!oplabKey) {
    console.warn("OPLAB_API_KEY not set");
    return null;
  }

  const url = OPLAB_BASE + "/market/instruments/series/" + ticker + "?bs=true&irate=13.25";

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: { "Access-Token": oplabKey },
    });

    if (!resp.ok) {
      console.warn("OpLab error for " + ticker + ": HTTP " + resp.status);
      return null;
    }

    const data = await resp.json();
    return {
      spot: data.close || data.bid || 0,
      series: data.series || [],
    };
  } catch (err) {
    console.warn("OpLab fetch error for " + ticker + ":", err);
    return null;
  }
}

function findOptionInChain(
  chain: OplabChain,
  tickerOpcao: string
): OplabOption | null {
  const target = tickerOpcao.toUpperCase();

  for (const serie of chain.series) {
    for (const strike of serie.strikes) {
      if (strike.call && strike.call.symbol && strike.call.symbol.toUpperCase() === target) {
        return strike.call;
      }
      if (strike.put && strike.put.symbol && strike.put.symbol.toUpperCase() === target) {
        return strike.put;
      }
    }
  }

  return null;
}

// ─── Alert checking ──────────────────────────────────────────

interface Alert {
  id: string;
  user_id: string;
  ticker_opcao: string;
  ativo_base: string;
  tipo_alerta: string;
  valor_alvo: number;
  direcao: string;
  ativo: boolean;
  disparado: boolean;
}

interface AlertResult {
  alert: Alert;
  triggered: boolean;
  title: string;
  body: string;
  currentValue: number;
}

function checkAlert(alert: Alert, option: OplabOption): AlertResult {
  const result: AlertResult = {
    alert: alert,
    triggered: false,
    title: "",
    body: "",
    currentValue: 0,
  };

  const tipo = alert.tipo_alerta;
  const alvo = alert.valor_alvo;
  const acima = alert.direcao === "acima";

  if (tipo === "preco") {
    const bid = option.bid || 0;
    const ask = option.ask || 0;
    const mid = (bid + ask) / 2;
    result.currentValue = mid;

    if (acima && mid >= alvo) {
      result.triggered = true;
      result.title = "Alerta de Preco: " + alert.ticker_opcao;
      result.body = "Preco atingiu R$ " + mid.toFixed(2) + " (alvo: R$ " + alvo.toFixed(2) + " acima)";
    } else if (!acima && mid <= alvo) {
      result.triggered = true;
      result.title = "Alerta de Preco: " + alert.ticker_opcao;
      result.body = "Preco caiu para R$ " + mid.toFixed(2) + " (alvo: R$ " + alvo.toFixed(2) + " abaixo)";
    }
  } else if (tipo === "divergencia") {
    const bid = option.bid || 0;
    const ask = option.ask || 0;
    const mid = (bid + ask) / 2;
    const bsPrice = (option as any).bs_price || (option as any).theoretical_price || option.close || 0;

    if (bsPrice > 0) {
      const divPct = Math.abs(mid - bsPrice) / bsPrice * 100;
      result.currentValue = divPct;

      if (divPct >= alvo) {
        result.triggered = true;
        const direction = mid > bsPrice ? "acima" : "abaixo";
        result.title = "Divergencia: " + alert.ticker_opcao;
        result.body = "Preco real " + divPct.toFixed(1) + "% " + direction + " do teorico BS (R$ " + mid.toFixed(2) + " vs R$ " + bsPrice.toFixed(2) + ")";
      }
    }
  } else if (tipo === "iv") {
    const iv = option.iv || 0;
    result.currentValue = iv;

    if (acima && iv >= alvo) {
      result.triggered = true;
      result.title = "IV Alta: " + alert.ticker_opcao;
      result.body = "IV atingiu " + (iv * 100).toFixed(1) + "% (alvo: " + (alvo * 100).toFixed(1) + "%)";
    } else if (!acima && iv <= alvo) {
      result.triggered = true;
      result.title = "IV Baixa: " + alert.ticker_opcao;
      result.body = "IV caiu para " + (iv * 100).toFixed(1) + "% (alvo: " + (alvo * 100).toFixed(1) + "%)";
    }
  } else if (tipo === "volume") {
    const vol = option.volume || 0;
    result.currentValue = vol;

    if (vol >= alvo) {
      result.triggered = true;
      result.title = "Volume Alto: " + alert.ticker_opcao;
      result.body = "Volume atingiu " + vol + " (alvo: " + alvo + ")";
    }
  }

  return result;
}

// ─── Expo Push Notifications ─────────────────────────────────

interface PushMessage {
  to: string[];
  sound: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
}

async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Expo Push API accepts array of messages
  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    if (!resp.ok) {
      console.warn("Expo Push API error: HTTP " + resp.status);
      const text = await resp.text();
      console.warn("Expo Push response:", text);
    } else {
      const result = await resp.json();
      console.log("Expo Push sent:", JSON.stringify(result).substring(0, 300));
    }
  } catch (err) {
    console.warn("Expo Push fetch error:", err);
  }
}

// ─── Main logic ──────────────────────────────────────────────

async function checkAlerts(): Promise<{
  ok: boolean;
  checked: number;
  triggered: number;
  notified: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // 1. Fetch all active, unfired alerts
  const { data: alerts, error: alertsError } = await supabase
    .from("alertas_opcoes")
    .select("*")
    .eq("ativo", true)
    .eq("disparado", false);

  if (alertsError) {
    console.error("Error fetching alerts:", alertsError);
    return { ok: false, checked: 0, triggered: 0, notified: 0, errors: [alertsError.message] };
  }

  if (!alerts || alerts.length === 0) {
    console.log("No active alerts to check");
    return { ok: true, checked: 0, triggered: 0, notified: 0, errors: [] };
  }

  console.log("Found " + alerts.length + " active alerts");

  // 2. Group alerts by ativo_base
  const alertsByBase: Record<string, Alert[]> = {};
  for (const alert of alerts) {
    const base = (alert.ativo_base || "").toUpperCase();
    if (!base) continue;
    if (!alertsByBase[base]) alertsByBase[base] = [];
    alertsByBase[base].push(alert);
  }

  const bases = Object.keys(alertsByBase);
  console.log("Unique ativo_base tickers: " + bases.join(", "));

  // 3. Fetch option chains for each unique ativo_base
  const chains: Record<string, OplabChain | null> = {};
  for (const base of bases) {
    chains[base] = await fetchOptionsChain(base);
    // Small delay to respect rate limits (50 req/s)
    if (bases.length > 5) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // 4. Check each alert against market data
  const triggeredResults: AlertResult[] = [];

  for (const alert of alerts) {
    const base = (alert.ativo_base || "").toUpperCase();
    const chain = chains[base];

    if (!chain) {
      // OpLab failed for this ticker — skip
      continue;
    }

    const option = findOptionInChain(chain, alert.ticker_opcao);
    if (!option) {
      // Option not found in chain (may have expired)
      continue;
    }

    const result = checkAlert(alert, option);
    if (result.triggered) {
      triggeredResults.push(result);
    }
  }

  console.log("Triggered alerts: " + triggeredResults.length);

  if (triggeredResults.length === 0) {
    return { ok: true, checked: alerts.length, triggered: 0, notified: 0, errors: [] };
  }

  // 5. Cap at MAX_NOTIFICATIONS_PER_RUN
  const toProcess = triggeredResults.slice(0, MAX_NOTIFICATIONS_PER_RUN);

  // 6. Group triggered alerts by user_id for batch push
  const alertsByUser: Record<string, AlertResult[]> = {};
  for (const result of toProcess) {
    const uid = result.alert.user_id;
    if (!alertsByUser[uid]) alertsByUser[uid] = [];
    alertsByUser[uid].push(result);
  }

  // 7. Fetch push tokens for each user and send notifications
  let notifiedCount = 0;
  const pushMessages: PushMessage[] = [];

  for (const userId of Object.keys(alertsByUser)) {
    const userAlerts = alertsByUser[userId];

    // Fetch fresh push tokens (last 60 days)
    const { data: tokenRows, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .gt("updated_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());

    if (tokenError) {
      console.warn("Error fetching push tokens for user " + userId + ":", tokenError);
      errors.push("Token fetch error for " + userId);
      continue;
    }

    if (!tokenRows || tokenRows.length === 0) {
      console.log("No push tokens for user " + userId + ", skipping notification");
      // Still mark alerts as fired even without tokens
    }

    const tokens = (tokenRows || []).map((r: { token: string }) => r.token).filter(Boolean);

    // Build push messages for this user's alerts
    for (const result of userAlerts) {
      if (tokens.length > 0) {
        pushMessages.push({
          to: tokens,
          sound: "default",
          title: result.title,
          body: result.body,
          data: {
            type: "price_alert",
            alerta_id: result.alert.id,
            ticker_opcao: result.alert.ticker_opcao,
            tipo_alerta: result.alert.tipo_alerta,
          },
          channelId: "default",
        });
        notifiedCount++;
      }

      // 8. Mark alert as fired
      const { error: updateError } = await supabase
        .from("alertas_opcoes")
        .update({ disparado: true, disparado_em: new Date().toISOString() })
        .eq("id", result.alert.id);

      if (updateError) {
        console.warn("Error marking alert " + result.alert.id + " as fired:", updateError);
        errors.push("Update error for alert " + result.alert.id);
      }
    }
  }

  // 9. Send all push notifications in batch
  if (pushMessages.length > 0) {
    await sendPushNotifications(pushMessages);
  }

  console.log("Done: checked=" + alerts.length + " triggered=" + toProcess.length + " notified=" + notifiedCount);

  return {
    ok: true,
    checked: alerts.length,
    triggered: toProcess.length,
    notified: notifiedCount,
    errors: errors,
  };
}

// ─── Serve ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    // Accept cron calls (service role key in Authorization) or internal calls
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !authHeader.includes(supabaseKey)) {
      // Not service role — still allow (--no-verify-jwt)
    }

    const result = await checkAlerts();

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
