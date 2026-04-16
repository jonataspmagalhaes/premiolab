// detect-corporate-events — Supabase Edge Function
// Detecta desdobramentos e bonificacoes automaticamente via DM API
// Cria operacoes tipo 'desdobramento' ou 'bonificacao' para cada usuario que possui o ativo
//
// Deploy: npx supabase functions deploy detect-corporate-events --no-verify-jwt --project-ref zephynezarjsxzselozi

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

var supabaseUrl = Deno.env.get("SUPABASE_URL")!;
var supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
var supabase = createClient(supabaseUrl, supabaseKey);

var DM_API_KEY = Deno.env.get("DM_API_KEY") || "";
var DM_BASE = "https://api.dadosdemercado.com.br/v1";

// Rate limit DM: 1 req/s
var _lastCall = 0;
async function dmFetch(path: string): Promise<unknown | null> {
  var now = Date.now();
  if (now - _lastCall < 1100) await new Promise(function (r) { setTimeout(r, 1100 - (now - _lastCall)); });
  _lastCall = Date.now();
  try {
    var res = await fetch(DM_BASE + path, {
      headers: { "Authorization": "Bearer " + DM_API_KEY, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Buscar cvm_code mapping (ticker base -> cvm_code)
async function getCvmMap(): Promise<Record<string, number>> {
  var data = await dmFetch("/companies") as Array<Record<string, unknown>> | null;
  if (!data || !Array.isArray(data)) return {};
  var map: Record<string, number> = {};
  for (var c of data) {
    var issuer = c.b3_issuer_code as string;
    if (issuer && c.cvm_code) map[issuer] = c.cvm_code as number;
  }
  return map;
}

function tickerToIssuer(ticker: string): string {
  return ticker.replace(/\d+[BF]?$/, "");
}

// Parsear ratio "X:Y" -> multiplicador
function parseRatio(ratio: string): number {
  var parts = ratio.split(":");
  if (parts.length !== 2) return 1;
  var x = Number(parts[0]);
  var y = Number(parts[1]);
  if (!x || !y) return 1;
  return x / y;
}

interface CorporateEvent {
  ticker: string;
  tipo: "desdobramento" | "bonificacao";
  data: string;          // ex_date ou approval_date
  ratio: string;         // "2:1"
  valor: number | null;  // valor base (bonus)
  notes: string | null;
}

Deno.serve(async function (_req) {
  var startTime = Date.now();
  var results = { tickers_checked: 0, events_found: 0, events_created: 0, errors: [] as string[] };

  try {
    if (!DM_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "DM_API_KEY not set" }), { headers: { "Content-Type": "application/json" } });
    }

    // 1. Buscar tickers distintos de todos os usuarios (posicoes ativas)
    var { data: tickerRows } = await supabase
      .from("operacoes")
      .select("ticker")
      .neq("tipo", "desdobramento")
      .neq("tipo", "bonificacao");

    var allTickers = new Set<string>();
    for (var row of (tickerRows || [])) {
      var tk = (row.ticker || "").toUpperCase().trim();
      if (tk && /\d+$/.test(tk)) allTickers.add(tk); // so BR (tem numero no final)
    }
    console.log("Tickers unicos BR:", allTickers.size);

    // 2. CVM mapping
    console.log("Buscando cvm_code mapping...");
    var cvmMap = await getCvmMap();

    // 3. Para cada ticker, checar splits e bonus dos ultimos 90 dias
    var cutoffDate = new Date(Date.now() - 90 * 86400000).toISOString().substring(0, 10);
    var events: CorporateEvent[] = [];
    var checkedIssuers = new Set<string>();

    for (var ticker of allTickers) {
      var issuer = tickerToIssuer(ticker);
      if (checkedIssuers.has(issuer)) continue;
      checkedIssuers.add(issuer);

      var cvm = cvmMap[issuer];
      if (!cvm) continue;
      results.tickers_checked++;

      // Splits
      var splits = await dmFetch("/companies/" + cvm + "/splits") as Array<Record<string, unknown>> | null;
      if (splits && Array.isArray(splits)) {
        for (var s of splits) {
          var exDate = (s.ex_date || s.approval_date || "") as string;
          if (exDate < cutoffDate) continue; // so eventos recentes
          events.push({
            ticker: (s.ticker || ticker) as string,
            tipo: "desdobramento",
            data: exDate,
            ratio: (s.ratio || "1:1") as string,
            valor: null,
            notes: (s.notes || null) as string | null,
          });
        }
      }

      // Bonus
      var bonus = await dmFetch("/companies/" + cvm + "/bonus") as Array<Record<string, unknown>> | null;
      if (bonus && Array.isArray(bonus)) {
        for (var b of bonus) {
          var exDateB = (b.ex_date || b.approval_date || "") as string;
          if (exDateB < cutoffDate) continue;
          events.push({
            ticker: (b.ticker || ticker) as string,
            tipo: "bonificacao",
            data: exDateB,
            ratio: (b.ratio || "1:1") as string,
            valor: b.value != null ? Number(b.value) : null,
            notes: (b.notes || null) as string | null,
          });
        }
      }
    }

    results.events_found = events.length;
    console.log("Eventos encontrados:", events.length);

    // 4. Para cada evento, buscar usuarios que possuem o ticker e criar operacao se nao existe
    for (var evt of events) {
      // Buscar usuarios que tem operacoes nesse ticker
      var { data: userOps } = await supabase
        .from("operacoes")
        .select("user_id, portfolio_id, corretora")
        .eq("ticker", evt.ticker)
        .neq("tipo", "desdobramento")
        .neq("tipo", "bonificacao");

      // Usuarios unicos
      var userMap = new Map<string, { portfolio_id: string | null; corretora: string | null }>();
      for (var uo of (userOps || [])) {
        if (!userMap.has(uo.user_id)) {
          userMap.set(uo.user_id, { portfolio_id: uo.portfolio_id, corretora: uo.corretora });
        }
      }

      for (var [userId, info] of userMap) {
        // Verificar se ja existe operacao desse evento para esse usuario
        var { data: existing } = await supabase
          .from("operacoes")
          .select("id")
          .eq("user_id", userId)
          .eq("ticker", evt.ticker)
          .eq("tipo", evt.tipo)
          .eq("data", evt.data)
          .limit(1);

        if (existing && existing.length > 0) continue; // ja registrado

        // Verificar se usuario rejeitou este evento (deletou manualmente)
        var { data: dismissed } = await supabase
          .from("corporate_events_dismissed")
          .select("id")
          .eq("user_id", userId)
          .eq("ticker", evt.ticker)
          .eq("tipo", evt.tipo)
          .eq("data", evt.data)
          .limit(1);

        if (dismissed && dismissed.length > 0) continue; // usuario rejeitou

        // Calcular quantidade para bonificacao
        var qty = 0;
        if (evt.tipo === "bonificacao") {
          // Buscar posicao atual do usuario nesse ticker
          var { data: posOps } = await supabase
            .from("operacoes")
            .select("tipo, quantidade")
            .eq("user_id", userId)
            .eq("ticker", evt.ticker)
            .lte("data", evt.data);

          var posQty = 0;
          for (var po of (posOps || [])) {
            if (po.tipo === "compra") posQty += Number(po.quantidade);
            else if (po.tipo === "venda") posQty -= Number(po.quantidade);
          }
          // Aplicar ratio: se ratio "10:1" e tem 100 acoes, ganha 10
          var mult = parseRatio(evt.ratio);
          qty = Math.floor(posQty * (mult - 1)); // novas acoes = posicao * (mult - 1)
          if (qty <= 0) continue; // sem posicao, nada a bonificar
        }

        // Criar operacao
        var insertData: Record<string, unknown> = {
          user_id: userId,
          ticker: evt.ticker,
          tipo: evt.tipo,
          categoria: "acao", // detectar se FII pela terminacao
          quantidade: evt.tipo === "desdobramento" ? 0 : qty,
          preco: evt.valor || 0,
          data: evt.data,
          ratio: evt.ratio,
          fonte: "auto",
          portfolio_id: info.portfolio_id,
          corretora: info.corretora,
          observacao: evt.notes ? ("Auto: " + evt.notes) : "Detectado automaticamente via DM",
        };

        // Detectar categoria
        if (/\d{2}11$/.test(evt.ticker)) insertData.categoria = "fii";
        else if (/11B$/.test(evt.ticker)) insertData.categoria = "fii";

        var { error } = await supabase.from("operacoes").insert(insertData);
        if (error) {
          console.warn("Erro ao inserir evento " + evt.tipo + " " + evt.ticker + " para " + userId + ":", error.message);
          results.errors.push(evt.ticker + ":" + error.message);
        } else {
          results.events_created++;
          console.log("Criado " + evt.tipo + " " + evt.ticker + " ratio=" + evt.ratio + " para usuario " + userId.substring(0, 8));
        }
      }
    }

  } catch (e) {
    console.error("Erro geral:", e);
    results.errors.push(String(e));
  }

  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("detect-corporate-events concluido em " + elapsed + "s:", JSON.stringify(results));

  return new Response(JSON.stringify({ ok: true, elapsed: elapsed + "s", results: results }), {
    headers: { "Content-Type": "application/json" },
  });
});
