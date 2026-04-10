// monthly-income-report — Supabase Edge Function
// Roda dia 5 de cada mes via pg_cron (cron.schedule).
// Gera relatorio de renda do mes anterior por usuario, salva em
// portfolio_backups (tipo especial) e envia push via Expo Push API.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function fmt(v: number): string {
  return (v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtInt(v: number): string {
  return Math.round(v || 0).toLocaleString("pt-BR");
}

interface MonthTotals {
  total: number;
  fii: number;
  acao: number;
  opcao: number;
  rf: number;
  byTicker: Record<string, number>;
  itemCount: number;
}

function parseDateSafe(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function inferTipo(ticker: string): "fii" | "acao" {
  return /11$/.test((ticker || "").toUpperCase()) ? "fii" : "acao";
}

async function getUsersWithPushToken(): Promise<
  { user_id: string; token: string }[]
> {
  const { data } = await supabase
    .from("push_tokens")
    .select("user_id, token");
  return data || [];
}

async function computeUserMonthlyIncome(
  userId: string,
  year: number,
  monthIdx: number
): Promise<MonthTotals> {
  const startMes = new Date(year, monthIdx, 1);
  const endMes = new Date(year, monthIdx + 1, 1);

  const { data: proventos } = await supabase
    .from("proventos")
    .select("*")
    .eq("user_id", userId)
    .gte("data_pagamento", startMes.toISOString().substring(0, 10))
    .lt("data_pagamento", endMes.toISOString().substring(0, 10));

  const totals: MonthTotals = {
    total: 0, fii: 0, acao: 0, opcao: 0, rf: 0,
    byTicker: {}, itemCount: 0,
  };

  for (const p of proventos || []) {
    const v = p.valor_total || (p.valor_por_cota || 0) * (p.quantidade || 0);
    if (v <= 0) continue;
    totals.total += v;
    const tipo = inferTipo(p.ticker);
    if (tipo === "fii") totals.fii += v;
    else totals.acao += v;
    const tk = (p.ticker || "").toUpperCase();
    totals.byTicker[tk] = (totals.byTicker[tk] || 0) + v;
    totals.itemCount++;
  }

  // Premios de opcoes fechadas no mes
  const { data: opcoes } = await supabase
    .from("opcoes")
    .select("*")
    .eq("user_id", userId)
    .gte("data_fechamento", startMes.toISOString().substring(0, 10))
    .lt("data_fechamento", endMes.toISOString().substring(0, 10));

  for (const o of opcoes || []) {
    if ((o.direcao || "venda") === "compra") continue;
    let premioLiq = (o.premio || 0) * (o.qty || 0);
    if (o.premio_fechamento != null) {
      premioLiq = ((o.premio || 0) - (o.premio_fechamento || 0)) * (o.qty || 0);
    }
    if (premioLiq <= 0) continue;
    totals.total += premioLiq;
    totals.opcao += premioLiq;
    const tk = (o.ticker_opcao || "").toUpperCase();
    totals.byTicker[tk] = (totals.byTicker[tk] || 0) + premioLiq;
    totals.itemCount++;
  }

  return totals;
}

function buildHtml(
  month: string,
  totals: MonthTotals,
  prevTotals: MonthTotals
): string {
  const delta = prevTotals.total > 0
    ? ((totals.total - prevTotals.total) / prevTotals.total) * 100
    : 0;
  const deltaStr = (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%";

  const topTickers = Object.entries(totals.byTicker)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const rows = topTickers.map(
    ([tk, v]) =>
      `<tr><td>${tk}</td><td style="text-align:right">R$ ${fmt(v as number)}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Relatorio de Renda - ${month}</title>
<style>
body { font-family: -apple-system, sans-serif; background: #070a11; color: #f1f1f4; padding: 24px; }
h1 { color: #22c55e; font-size: 24px; }
.hero { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.hero .val { font-size: 40px; font-weight: 800; color: #22c55e; }
.delta { font-size: 14px; color: ${delta >= 0 ? "#22c55e" : "#ef4444"}; }
.kpi { display: inline-block; background: rgba(255,255,255,0.04); border-radius: 10px; padding: 14px; margin-right: 8px; min-width: 120px; }
.kpi-label { font-size: 10px; color: #8888aa; text-transform: uppercase; }
.kpi-val { font-size: 18px; font-weight: 700; margin-top: 4px; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
td { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.footer { margin-top: 24px; font-size: 10px; color: #666688; text-align: center; }
</style></head><body>
<h1>Relatorio de Renda</h1>
<p style="color:#8888aa;font-size:12px">${month}</p>
<div class="hero">
  <div class="kpi-label">Renda Total Recebida</div>
  <div class="val">R$ ${fmtInt(totals.total)},${((totals.total % 1) * 100).toFixed(0).padStart(2, "0")}</div>
  <div class="delta">${deltaStr} vs mes anterior (R$ ${fmtInt(prevTotals.total)})</div>
</div>
<div>
  <div class="kpi"><div class="kpi-label">FIIs</div><div class="kpi-val">R$ ${fmt(totals.fii)}</div></div>
  <div class="kpi"><div class="kpi-label">Acoes/JCP</div><div class="kpi-val">R$ ${fmt(totals.acao)}</div></div>
  <div class="kpi"><div class="kpi-label">Opcoes</div><div class="kpi-val">R$ ${fmt(totals.opcao)}</div></div>
  <div class="kpi"><div class="kpi-label">Eventos</div><div class="kpi-val">${totals.itemCount}</div></div>
</div>
<h3 style="margin-top:24px">Top 10 Ativos</h3>
<table>${rows || '<tr><td colspan="2">Sem dados</td></tr>'}</table>
<div class="footer">Gerado por PremioLab · ${new Date().toISOString().substring(0, 10)}</div>
</body></html>`;
}

async function sendPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>
) {
  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        to: token,
        sound: "default",
        title,
        body,
        data,
        priority: "high",
      }),
    });
  } catch (e) {
    console.warn("sendPush error:", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const onDemandUserId = url.searchParams.get("user_id");

    // Mes anterior
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const monthName = lastMonth.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    let usersToProcess: { user_id: string; token?: string }[] = [];
    if (onDemandUserId) {
      usersToProcess = [{ user_id: onDemandUserId }];
    } else {
      usersToProcess = await getUsersWithPushToken();
    }

    let processedCount = 0;
    const results: { user_id: string; ok: boolean; renda: number }[] = [];

    for (const u of usersToProcess) {
      try {
        const totals = await computeUserMonthlyIncome(
          u.user_id,
          lastMonth.getFullYear(),
          lastMonth.getMonth()
        );
        const prevTotals = await computeUserMonthlyIncome(
          u.user_id,
          prevMonth.getFullYear(),
          prevMonth.getMonth()
        );

        if (totals.total <= 0 && totals.itemCount === 0) {
          results.push({ user_id: u.user_id, ok: false, renda: 0 });
          continue;
        }

        const html = buildHtml(monthName, totals, prevTotals);

        // Salvar no portfolio_backups como relatorio
        await supabase.from("portfolio_backups").insert({
          user_id: u.user_id,
          portfolio_name: "monthly_income_report_" + lastMonth.getFullYear() + "_" + String(lastMonth.getMonth() + 1).padStart(2, "0"),
          dados: {
            html,
            totals,
            prev_totals: prevTotals,
            month: monthName,
            generated_at: new Date().toISOString(),
          },
          expires_at: new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString(),
        });

        // Enviar push
        if (u.token) {
          await sendPush(
            u.token,
            "Seu relatorio de " + monthName,
            "Renda do mes: R$ " + fmt(totals.total) + ". Toque para ver.",
            { type: "monthly_income_report", month: monthName }
          );
        }

        processedCount++;
        results.push({ user_id: u.user_id, ok: true, renda: totals.total });
      } catch (e) {
        console.warn("monthly-income-report user error:", (e as Error).message);
        results.push({ user_id: u.user_id, ok: false, renda: 0 });
      }
    }

    return new Response(
      JSON.stringify({ processed: processedCount, total: usersToProcess.length, results }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
