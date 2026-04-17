// proventos-calendar-fetch — Supabase Edge Function
//
// Enriquece a tabela proventos_agenda com calendario oficial de proventos
// anunciados (data_com + data_pagamento + valor_por_cota) para os tickers
// requisitados. Usado pelo endpoint /api/proventos/calendar do web app.
//
// Input (POST body):
//   { tickers: string[]; horizonte_dias?: number }
//
// Output:
//   { inserted: number; updated: number; skipped: string[]; tickers_fetched: number }
//
// Fluxo:
//   1. Pra cada ticker, consulta DM (dividendsByCompany ou dividendsByFII).
//   2. Filtra apenas eventos com payable_date > hoje E < hoje + horizonte.
//   3. UPSERT em proventos_agenda (conflict em ticker+data_pagamento+tipo).
//   4. Ticker sem DM cai no fallback StatusInvest.
//
// Deploy:
//   npx supabase functions deploy proventos-calendar-fetch --no-verify-jwt \
//     --project-ref zephynezarjsxzselozi

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dm, DM_ENABLED, type DMDividend } from "../_shared/dadosdemercado.ts";

var supabaseUrl = Deno.env.get("SUPABASE_URL")!;
var supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
var supabase = createClient(supabaseUrl, supabaseKey);

interface Req { tickers: string[]; horizonte_dias?: number }

// Heuristica pra decidir FII vs empresa: FII tem sufixo 11 e vem do set
// conhecido de tickers com code '2' no tipo. Chamamos dividendsByCompany
// primeiro; se vazio e sufixo 11, tenta dividendsByFII.
function looksLikeFII(ticker: string): boolean {
  var t = (ticker || '').toUpperCase();
  return /\d11$/.test(t);
}

function isoDate(s: string | null): string | null {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeTipo(raw: string | null): string {
  var t = (raw || '').toUpperCase();
  if (t.indexOf('JCP') >= 0 || t.indexOf('JUROS') >= 0) return 'jcp';
  if (t.indexOf('REND') >= 0) return 'rendimento';
  if (t.indexOf('AMORT') >= 0) return 'amortizacao';
  if (t.indexOf('BONIF') >= 0) return 'bonificacao';
  return 'dividendo';
}

async function fetchFromDM(ticker: string): Promise<DMDividend[]> {
  if (!DM_ENABLED) return [];
  var t = ticker.toUpperCase();
  // Chama endpoint de empresa primeiro; se vazio e for 11, tenta FII.
  var divs = await dm.dividendsByCompany(t);
  if (divs.length === 0 && looksLikeFII(t)) {
    divs = await dm.dividendsByFII(t);
  }
  return divs;
}

// Fallback leve StatusInvest: so chama se DM vier vazio; usa o endpoint
// publico /acao/companytickerprovents?ticker=X ou /fii/companytickerprovents
async function fetchFromStatusInvest(ticker: string): Promise<DMDividend[]> {
  var t = ticker.toUpperCase();
  var isFii = looksLikeFII(t);
  var base = isFii
    ? 'https://statusinvest.com.br/fii/companytickerprovents'
    : 'https://statusinvest.com.br/acao/companytickerprovents';
  try {
    var res = await fetch(base + '?ticker=' + encodeURIComponent(t), {
      headers: { 'User-Agent': 'Mozilla/5.0 PremioLab/1.0', 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    var json = await res.json() as { assetEarningsModels?: Array<{ et?: string; pd?: string; ed?: string; v?: number; rec?: string }> };
    var rows = json.assetEarningsModels || [];
    return rows.map(function (r): DMDividend {
      return {
        ticker: t,
        type: (r.et || '').toUpperCase(),
        amount: Number(r.v) || 0,
        adj_amount: null,
        approval_date: null,
        ex_date: r.ed || null,
        record_date: r.rec || r.ed || r.pd || '',
        payable_date: r.pd || null,
        cvm_code: null,
        notes: null,
      };
    });
  } catch (err) {
    console.warn('statusinvest ' + t + ' error', err);
    return [];
  }
}

Deno.serve(async function (req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  var body: Req;
  try {
    body = await req.json() as Req;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  var tickers = (body.tickers || []).map(function (t) { return String(t || '').toUpperCase().trim(); }).filter(function (t) { return t.length > 0; });
  var horizonte = Math.max(7, Math.min(180, body.horizonte_dias || 60));
  if (tickers.length === 0) {
    return new Response(JSON.stringify({ error: 'tickers required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  var now = new Date();
  var cutoffPast = new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10);  // incluir ate 3d passado (ja pago recente)
  var cutoffFuture = new Date(now.getTime() + horizonte * 86400000).toISOString().slice(0, 10);

  var inserted = 0;
  var updated = 0;
  var skipped: string[] = [];
  var fetched = 0;

  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    var rows: DMDividend[] = [];
    try {
      rows = await fetchFromDM(t);
    } catch (err) {
      console.warn('dm fetch ' + t, err);
    }
    if (rows.length === 0) {
      try {
        rows = await fetchFromStatusInvest(t);
      } catch (err) {
        console.warn('si fetch ' + t, err);
      }
    }
    if (rows.length === 0) { skipped.push(t); continue; }
    fetched += 1;

    // Filtra so futuros + recentes ate cutoffFuture
    var filtrados = rows.filter(function (r) {
      var dp = isoDate(r.payable_date);
      if (!dp) return false;
      return dp >= cutoffPast && dp <= cutoffFuture;
    });
    if (filtrados.length === 0) continue;

    // Upsert batch
    var payload = filtrados.map(function (r) {
      return {
        ticker: t,
        tipo: normalizeTipo(r.type),
        data_com: isoDate(r.record_date) || isoDate(r.ex_date),
        data_pagamento: isoDate(r.payable_date)!,
        valor_por_cota: r.amount,
        fonte: 'dm',
        updated_at: new Date().toISOString(),
      };
    });

    var upsert = await supabase
      .from('proventos_agenda')
      .upsert(payload, { onConflict: 'ticker,data_pagamento,tipo', ignoreDuplicates: false })
      .select('id');
    if (upsert.error) {
      console.warn('upsert ' + t + ' err', upsert.error);
      continue;
    }
    inserted += upsert.data?.length || 0;
  }

  return new Response(JSON.stringify({
    inserted: inserted,
    updated: updated,
    skipped: skipped,
    tickers_fetched: fetched,
    horizonte_dias: horizonte,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
