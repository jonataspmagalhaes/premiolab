// update-rankings — Supabase Edge Function
// Roda diariamente (6h BRT = 9h UTC) via cron
// Busca fundamentalistas de brapi (BR), Yahoo (INT), DM (fundos), Tesouro Transparente
// Grava na tabela rankings_cache (sem RLS) para acesso instantaneo pelo web app
//
// Deploy: npx supabase functions deploy update-rankings --no-verify-jwt --project-ref zephynezarjsxzselozi

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const BRAPI_TOKEN = "tEU8wyBixv8hCi7J3NCjsi";
const DM_API_KEY = Deno.env.get("DM_API_KEY") || "";

// ═══════ Universo curado ═══════

const ACOES_BR = [
  "VALE3","PETR4","ITUB4","BBDC4","ABEV3","WEGE3","BBAS3","B3SA3","SUZB3","JBSS3",
  "LREN3","GGBR4","CMIG4","TAEE11","ELET3","VIVT3","TOTS3","EQTL3","PRIO3","CSAN3",
  "KLBN11","ITSA4","SBSP3","RDOR3","HAPV3",
];

const FIIS_BR = [
  "MXRF11","HGLG11","XPLG11","KNRI11","VISC11","BTLG11","VGIP11","KNSC11","RECR11","CPTS11",
  "HGBS11","XPML11","PVBI11","HSML11","TRXF11","IRDM11","KNCR11","BCFF11","VGHF11","XPCI11",
];

const STOCKS_INT = [
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","JPM","V","JNJ",
  "PG","KO","PEP","NFLX","DIS",
];

const REITS_INT = [
  "O","SPG","AMT","PLD","EQIX","DLR","PSA","WELL","VTR","AVB",
];

// ═══════ Types ═══════

interface RankedAsset {
  ticker: string;
  nome: string;
  tipo: string;
  preco: number | null;
  variacao_dia: number | null;
  metrics: Record<string, number | null>;
  dy_flag?: string | null;
}

// ═══════ Helpers ═══════

function safeNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return n;
}

function pct(v: unknown): number | null {
  const n = safeNum(v);
  if (n == null) return null;
  return n * 100;
}

function dyFlag(dy: number | null, pl: number | null): string | null {
  if (dy == null) return null;
  if (pl != null && pl < 0 && dy > 5) return "extraordinary";
  if (dy > 25) return "extraordinary";
  if (dy > 15) return "warning";
  return null;
}

function sleep(ms: number) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// ═══════ DM API helper ═══════

const DM_BASE = "https://api.dadosdemercado.com.br/v1";
let _dmLastCall = 0;

async function dmFetch(path: string): Promise<unknown | null> {
  // Rate limit 1 req/s
  const now = Date.now();
  const elapsed = now - _dmLastCall;
  if (elapsed < 1100) await sleep(1100 - elapsed);
  _dmLastCall = Date.now();

  try {
    const res = await fetch(DM_BASE + path, {
      headers: { "Authorization": "Bearer " + DM_API_KEY, "Accept": "application/json" },
    });
    if (!res.ok) { console.warn("DM " + path + " HTTP " + res.status); return null; }
    return await res.json();
  } catch (e) {
    console.warn("DM fetch error " + path, e);
    return null;
  }
}

// ═══════ DM BR (acoes + FIIs) — fonte primaria ═══════
// Fluxo: 1) /companies → cvm_code mapping
//        2) /tickers/{tk}/dy → DY
//        3) /companies/{cvm}/market_ratios → P/L, P/VP
//        4) /companies/{cvm}/ratios → ROE, margens, divida
//        5) brapi batch (sem modules) → preco + variacao dia

interface CvmMapping { cvm_code: number; name: string; issuer: string }

async function getCvmMapping(): Promise<Record<string, CvmMapping>> {
  const data = await dmFetch("/companies") as Array<Record<string, unknown>> | null;
  if (!data || !Array.isArray(data)) return {};
  const map: Record<string, CvmMapping> = {};
  for (const c of data) {
    const issuer = (c.b3_issuer_code || "") as string;
    if (issuer) {
      map[issuer] = {
        cvm_code: c.cvm_code as number,
        name: (c.name || "") as string,
        issuer: issuer,
      };
    }
  }
  return map;
}

function tickerToIssuer(ticker: string): string {
  // VALE3 → VALE, PETR4 → PETR, TAEE11 → TAEE, KLBN11 → KLBN
  return ticker.replace(/\d+[BF]?$/, "");
}

async function fetchDM_BR(tickers: string[], isFiiMode: boolean): Promise<RankedAsset[]> {
  console.log("DM: buscando cvm_code mapping...");
  const cvmMap = await getCvmMapping();

  const results: RankedAsset[] = [];

  for (const tk of tickers) {
    const issuer = tickerToIssuer(tk);
    const mapping = cvmMap[issuer];

    // 1. DY via /tickers/{tk}/dy
    const dyData = await dmFetch("/tickers/" + tk + "/dy") as Array<Record<string, unknown>> | null;
    let dy: number | null = null;
    if (dyData && Array.isArray(dyData) && dyData.length > 0) {
      // Ultimo ano com dados
      const lastYear = dyData[dyData.length - 1];
      dy = safeNum(lastYear.dy);
    }

    let pl: number | null = null;
    let pvp: number | null = null;
    let roe: number | null = null;
    let roa: number | null = null;
    let mLiquida: number | null = null;
    let mEbitda: number | null = null;
    let divLiqEbitda: number | null = null;
    let nome = tk;
    let preco: number | null = null;

    if (mapping) {
      nome = mapping.name;
      const cvm = mapping.cvm_code;

      // 2. Market ratios → P/L, P/VP, preco
      const mr = await dmFetch("/companies/" + cvm + "/market_ratios?statement_type=con") as Array<Record<string, unknown>> | null;
      if (mr && Array.isArray(mr) && mr.length > 0) {
        const last = mr[mr.length - 1];
        pl = safeNum(last.price_earnings);
        pvp = safeNum(last.price_to_book);
        preco = safeNum(last.price);
      }

      // 3. Financial ratios → ROE, margens, divida
      const fr = await dmFetch("/companies/" + cvm + "/ratios?statement_type=con&period_type=ttm") as Array<Record<string, unknown>> | null;
      if (fr && Array.isArray(fr) && fr.length > 0) {
        const last = fr[fr.length - 1];
        roe = safeNum(last.return_on_equity);
        roa = safeNum(last.return_on_assets);
        mLiquida = safeNum(last.net_margin);
        mEbitda = safeNum(last.ebitda_margin);
        const netDebt = safeNum(last.net_debt);
        const ebitda = safeNum(last.ebitda);
        if (netDebt != null && ebitda != null && ebitda !== 0) {
          divLiqEbitda = netDebt / ebitda;
        }
      }
    }

    // Para FIIs sem cvm_code, ainda temos DY do /tickers endpoint
    const isFii = isFiiMode || /\d{2}11$/.test(tk);

    results.push({
      ticker: tk,
      nome: nome,
      tipo: isFii ? "fii" : "acao",
      preco: preco,
      variacao_dia: null, // DM nao retorna variacao dia; merge preenche do brapi
      metrics: {
        dy: dy,
        pl: pl,
        pvp: pvp,
        roe: roe,
        roa: roa,
        margem_liquida: mLiquida,
        margem_ebitda: mEbitda,
        div_liq_ebitda: divLiqEbitda,
        ev_ebitda: null,
      },
      dy_flag: dyFlag(dy, pl),
    });

    console.log("  " + tk + " DY=" + (dy != null ? dy.toFixed(1) + "%" : "null") + " PL=" + (pl != null ? pl.toFixed(1) : "null") + " ROE=" + (roe != null ? roe.toFixed(1) : "null"));
  }

  // Complementar precos com brapi (batch, sem modules — rapido e estavel)
  console.log("DM: complementando precos via brapi...");
  const BATCH = 15;
  for (let i = 0; i < tickers.length; i += BATCH) {
    const chunk = tickers.slice(i, i + BATCH);
    const url = "https://brapi.dev/api/quote/" + chunk.join(",") + "?token=" + BRAPI_TOKEN;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      for (const r of (json.results || [])) {
        if (!r || !r.symbol) continue;
        const match = results.find(function (a) { return a.ticker === r.symbol; });
        if (match) {
          match.preco = safeNum(r.regularMarketPrice) ?? match.preco;
          match.variacao_dia = safeNum(r.regularMarketChangePercent);
          if (!match.nome || match.nome === match.ticker) {
            match.nome = r.longName || r.shortName || match.nome;
          }
        }
      }
    } catch (e) {
      console.warn("brapi price error", e);
    }
  }

  return results;
}

// ═══════ Yahoo Finance (INT) — cookie/crumb ═══════

function rawYahoo(obj: unknown): number | null {
  if (obj == null) return null;
  if (typeof obj === "object" && (obj as Record<string, unknown>).raw != null) return safeNum((obj as Record<string, unknown>).raw);
  return safeNum(obj);
}

async function getYahooCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
    const setCookies = cookieRes.headers.getSetCookie ? cookieRes.headers.getSetCookie() : [];
    const cookieStr = setCookies.map(function (c: string) { return c.split(";")[0]; }).join("; ");
    if (!cookieStr) return null;

    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": "Mozilla/5.0", "Cookie": cookieStr },
    });
    if (!crumbRes.ok) return null;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.length < 5) return null;

    return { cookie: cookieStr, crumb: crumb };
  } catch (e) {
    console.warn("Yahoo crumb error", e);
    return null;
  }
}

async function fetchYahoo(tickers: string[], isReit: boolean): Promise<RankedAsset[]> {
  const auth = await getYahooCrumb();
  if (!auth) { console.warn("Yahoo: no crumb"); return []; }

  const results: RankedAsset[] = [];
  const PARALLEL = 5;

  for (let i = 0; i < tickers.length; i += PARALLEL) {
    const chunk = tickers.slice(i, i + PARALLEL);
    const promises = chunk.map(function (tk) {
      const url = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" + encodeURIComponent(tk)
        + "?modules=defaultKeyStatistics,financialData,summaryDetail,price&crumb=" + encodeURIComponent(auth.crumb);
      return fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Cookie": auth.cookie } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    });

    const responses = await Promise.all(promises);

    for (let j = 0; j < responses.length; j++) {
      const json = responses[j];
      if (!json) continue;

      const result = (json.quoteSummary?.result?.[0]) || {};
      const ks = result.defaultKeyStatistics || {};
      const fd = result.financialData || {};
      const sd = result.summaryDetail || {};
      const price = result.price || {};

      let dy = rawYahoo(sd.dividendYield) || rawYahoo(sd.trailingAnnualDividendYield);
      if (dy != null && dy < 1) dy = dy * 100;
      const pe = rawYahoo(sd.trailingPE) || rawYahoo(ks.forwardPE);
      const pb = rawYahoo(ks.priceToBook);
      let roe = rawYahoo(fd.returnOnEquity);
      if (roe != null && Math.abs(roe) < 5) roe = roe * 100;
      let profitMargin = rawYahoo(fd.profitMargins);
      if (profitMargin != null && Math.abs(profitMargin) < 5) profitMargin = profitMargin * 100;

      results.push({
        ticker: chunk[j],
        nome: (price.longName || price.shortName || chunk[j]) as string,
        tipo: isReit ? "reit" : "stock_int",
        preco: rawYahoo(price.regularMarketPrice),
        variacao_dia: rawYahoo(price.regularMarketChangePercent),
        metrics: { dy, pl: pe, pvp: pb, roe, margem_liquida: profitMargin },
        dy_flag: dyFlag(dy, pe),
      });
    }
    await sleep(500);
  }

  return results;
}

// ═══════ Fundos (DM API) ═══════

async function fetchFundos(): Promise<RankedAsset[]> {
  if (!DM_API_KEY) return [];
  try {
    // Busca lista completa e filtra os que tem management_fee OU sao populares
    const listData = await dmFetch("/funds") as Array<Record<string, unknown>> | null;
    if (!listData || !Array.isArray(listData)) return [];

    // Priorizar fundos com taxa_admin preenchida e patrimonio alto
    const withFee = listData.filter(function (f) { return f.management_fee != null && (f.net_worth as number) > 100000000; });
    withFee.sort(function (a, b) { return ((b.net_worth as number) || 0) - ((a.net_worth as number) || 0); });

    const selected = withFee.slice(0, 20);
    console.log("Fundos: " + selected.length + " com taxa_admin (de " + withFee.length + " candidatos)");

    const results: RankedAsset[] = [];

    for (const f of selected) {
      // Buscar cotas para calcular rentabilidade 12m
      let rent12m: number | null = null;
      const fundId = f.id as string;
      if (fundId) {
        const quotes = await dmFetch("/funds/" + fundId + "/quotes") as Array<Record<string, unknown>> | null;
        if (quotes && Array.isArray(quotes) && quotes.length >= 2) {
          const first = quotes[0];
          const last = quotes[quotes.length - 1];
          const firstQuote = safeNum(first.quote);
          const lastQuote = safeNum(last.quote);
          if (firstQuote && lastQuote && firstQuote > 0) {
            rent12m = ((lastQuote / firstQuote) - 1) * 100;
          }
        }
      }

      results.push({
        ticker: (f.cnpj || f.slug || "") as string,
        nome: (f.trade_name || f.name || f.slug || "") as string,
        tipo: "fundo",
        preco: null,
        variacao_dia: null,
        metrics: {
          patrimonio: safeNum(f.net_worth),
          cotistas: safeNum(f.shareholders),
          taxa_admin: safeNum(f.management_fee),
          taxa_perf: safeNum(f.performance_fee),
          rentabilidade_12m: rent12m,
        },
        dy_flag: null,
      });

      console.log("  " + ((f.trade_name || f.name) as string).substring(0, 35) + " fee=" + f.management_fee + " rent=" + (rent12m != null ? rent12m.toFixed(1) + "%" : "null"));
    }

    return results;
  } catch (e) {
    console.warn("DM funds error", e);
    return [];
  }
}

// ═══════ Tesouro Direto ═══════

async function fetchTesouro(): Promise<RankedAsset[]> {
  try {
    const csvUrl = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PresssPublicosDireto.csv";
    const res = await fetch(csvUrl);
    if (!res.ok) return [];
    const text = await res.text();
    const lines = text.split("\n");
    if (lines.length < 2) return [];

    const header = lines[0].split(";").map(function (h) { return h.trim().replace(/"/g, ""); });
    const nomeIdx = header.indexOf("Tipo Titulo");
    const vencIdx = header.indexOf("Data Vencimento");
    const taxaIdx = header.indexOf("Taxa Compra Manha");
    const puIdx = header.indexOf("PU Compra Manha");

    const today = new Date();
    const titulos: RankedAsset[] = [];
    const seen = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(";").map(function (c) { return c.trim().replace(/"/g, ""); });
      if (cols.length < Math.max(nomeIdx, vencIdx, taxaIdx, puIdx) + 1) continue;

      const nome = cols[nomeIdx];
      const vencStr = cols[vencIdx]; // DD/MM/YYYY
      const taxa = safeNum(cols[taxaIdx]?.replace(",", "."));
      const pu = safeNum(cols[puIdx]?.replace(",", "."));

      if (!nome || !vencStr) continue;
      const parts = vencStr.split("/");
      if (parts.length !== 3) continue;
      const vencDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      if (vencDate <= today) continue;

      const key = nome + "|" + vencStr;
      if (seen.has(key)) continue;
      seen.add(key);

      const ano = Number(parts[2]);
      const label = nome + " " + ano;

      titulos.push({
        ticker: label,
        nome: label,
        tipo: "tesouro",
        preco: pu,
        variacao_dia: null,
        metrics: { taxa: taxa, vencimento_ano: ano },
        dy_flag: null,
      });
    }

    return titulos;
  } catch (e) {
    console.warn("Tesouro error", e);
    return [];
  }
}

// ═══════ Validacao ═══════

function validateAssets(type: string, assets: RankedAsset[], minCount: number): boolean {
  if (assets.length < minCount) {
    console.warn("Validacao falhou para " + type + ": so " + assets.length + " ativos (minimo " + minCount + ")");
    return false;
  }
  // Pelo menos 30% dos ativos devem ter alguma metrica preenchida
  let withMetrics = 0;
  for (const a of assets) {
    const vals = Object.values(a.metrics);
    if (vals.some(function (v) { return v != null; })) withMetrics++;
  }
  const ratio = withMetrics / assets.length;
  if (ratio < 0.3) {
    console.warn("Validacao falhou para " + type + ": so " + (ratio * 100).toFixed(0) + "% com metricas (minimo 30%)");
    return false;
  }
  return true;
}

const MIN_COUNTS: Record<string, number> = {
  acoes: 15,
  fiis: 10,
  stocks: 8,
  reits: 5,
  fundos: 10,
  tesouro: 5,
};

// ═══════ Merge + Upsert ═══════
// Combina dados novos com existentes — se brapi nao retornou uma metrica
// nesta rodada, mantém o valor da rodada anterior. Assim gaps sao preenchidos
// progressivamente ao longo de multiplas execucoes.

function mergeAssets(existing: RankedAsset[], fresh: RankedAsset[]): RankedAsset[] {
  // Mapa do que ja existe por ticker
  const oldMap: Record<string, RankedAsset> = {};
  for (const a of existing) { oldMap[a.ticker] = a; }

  const merged: RankedAsset[] = [];
  const seen = new Set<string>();

  for (const f of fresh) {
    seen.add(f.ticker);
    const old = oldMap[f.ticker];
    if (!old) {
      // Ticker novo — usa dados frescos
      merged.push(f);
      continue;
    }
    // Merge: para cada metrica, prefere valor fresco; se null, mantem antigo
    const mergedMetrics: Record<string, number | null> = {};
    const allKeys = new Set([...Object.keys(f.metrics), ...Object.keys(old.metrics)]);
    for (const k of allKeys) {
      mergedMetrics[k] = f.metrics[k] != null ? f.metrics[k] : (old.metrics[k] ?? null);
    }
    merged.push({
      ticker: f.ticker,
      nome: f.nome || old.nome,
      tipo: f.tipo,
      preco: f.preco ?? old.preco,           // preco sempre fresco quando disponivel
      variacao_dia: f.variacao_dia ?? old.variacao_dia,
      metrics: mergedMetrics,
      dy_flag: f.dy_flag ?? old.dy_flag,
    });
  }

  // Tickers que existiam mas nao vieram no fetch — mantém (nao perder dados)
  for (const a of existing) {
    if (!seen.has(a.ticker)) merged.push(a);
  }

  return merged;
}

async function upsertRanking(type: string, assets: RankedAsset[]): Promise<boolean> {
  const minCount = MIN_COUNTS[type] || 5;

  if (!validateAssets(type, assets, minCount)) {
    console.warn("SKIP " + type + " — validacao falhou, mantendo dados anteriores");
    return false;
  }

  // Merge com dados existentes — so para tipos com tickers fixos (acoes, fiis, stocks, reits)
  // Fundos, tesouro, noticias substituem integralmente (dataset muda a cada rodada)
  const MERGE_TYPES = new Set(["acoes", "fiis", "stocks", "reits"]);

  let finalAssets = assets;
  if (MERGE_TYPES.has(type)) {
    const { data: existing } = await supabase
      .from("rankings_cache")
      .select("assets")
      .eq("type", type)
      .single();

    if (existing && existing.assets) {
      try {
        const oldAssets: RankedAsset[] = typeof existing.assets === "string"
          ? JSON.parse(existing.assets) : existing.assets;
        finalAssets = mergeAssets(oldAssets, assets);
        const freshFilled = assets.reduce(function (n, a) { return n + Object.values(a.metrics).filter(function (v) { return v != null; }).length; }, 0);
        const mergedFilled = finalAssets.reduce(function (n, a) { return n + Object.values(a.metrics).filter(function (v) { return v != null; }).length; }, 0);
        console.log(type + " merge: " + freshFilled + " metricas frescas -> " + mergedFilled + " apos merge");
      } catch {
        // Se parse falhar, usa dados frescos
      }
    }
  }

  const { error } = await supabase
    .from("rankings_cache")
    .upsert({ type: type, assets: JSON.stringify(finalAssets), updated_at: new Date().toISOString() }, { onConflict: "type" });

  if (error) {
    console.error("Erro ao gravar " + type + ":", error);
    return false;
  }

  console.log("OK " + type + ": " + finalAssets.length + " ativos gravados");
  return true;
}

// ═══════ Upsert generico (dados macro — sem validacao de assets) ═══════

async function upsertMarketData(type: string, data: unknown): Promise<boolean> {
  if (!data) {
    console.warn("SKIP " + type + " — sem dados");
    return false;
  }
  const { error } = await supabase
    .from("rankings_cache")
    .upsert({ type: type, assets: JSON.stringify(data), updated_at: new Date().toISOString() }, { onConflict: "type" });
  if (error) {
    console.error("Erro ao gravar " + type + ":", error);
    return false;
  }
  console.log("OK " + type);
  return true;
}

// ═══════ Indices Economicos (DM) ═══════

async function fetchIndices(): Promise<Array<Record<string, unknown>> | null> {
  const codes = ["selic", "cdi", "ipca", "igp-m"];
  const results: Array<Record<string, unknown>> = [];

  for (const code of codes) {
    const data = await dmFetch("/macro/" + code) as Array<Record<string, unknown>> | null;
    if (data && Array.isArray(data) && data.length > 0) {
      // Array vem descrescente (mais recente primeiro)
      const current = data[0];
      // Valor de ~30 dias atras para calcular tendencia
      const prev = data.length > 22 ? data[22] : (data.length > 1 ? data[data.length - 1] : null);
      const curVal = safeNum(current.value);
      const prevVal = prev ? safeNum(prev.value) : null;
      let trend: string | null = null;
      if (curVal != null && prevVal != null) {
        if (curVal > prevVal) trend = "up";
        else if (curVal < prevVal) trend = "down";
        else trend = "stable";
      }

      results.push({
        code: code,
        value: curVal,
        date: current.date,
        prev_value: prevVal,
        prev_date: prev ? prev.date : null,
        trend: trend,
        // Historico recente (12 pontos, cronologico)
        history: data.slice(0, 12).reverse(),
      });
    }
  }

  return results.length > 0 ? results : null;
}

// ═══════ Bolsas (IBOV via DM + internacionais via Yahoo) ═══════

async function fetchBolsas(): Promise<Array<Record<string, unknown>> | null> {
  const results: Array<Record<string, unknown>> = [];

  // IBOV via DM /tickers/IBOV/quotes
  const ibovData = await dmFetch("/tickers/IBOV/quotes") as Array<Record<string, unknown>> | null;
  if (ibovData && Array.isArray(ibovData) && ibovData.length >= 2) {
    const last = ibovData[ibovData.length - 1];
    const prev = ibovData[ibovData.length - 2];
    const lastClose = safeNum(last.close);
    const prevClose = safeNum(prev.close);
    const pct = (lastClose && prevClose && prevClose > 0) ? ((lastClose - prevClose) / prevClose) * 100 : null;
    results.push({
      code: "IBOV",
      name: "Ibovespa",
      value: lastClose,
      change_pct: pct,
      date: last.date,
      trend: pct != null ? (pct > 0 ? "up" : pct < 0 ? "down" : "stable") : null,
    });
  }

  // IFIX via DM
  const ifixData = await dmFetch("/tickers/IFIX/quotes") as Array<Record<string, unknown>> | null;
  if (ifixData && Array.isArray(ifixData) && ifixData.length >= 2) {
    const last = ifixData[ifixData.length - 1];
    const prev = ifixData[ifixData.length - 2];
    const lastClose = safeNum(last.close);
    const prevClose = safeNum(prev.close);
    const pct = (lastClose && prevClose && prevClose > 0) ? ((lastClose - prevClose) / prevClose) * 100 : null;
    results.push({
      code: "IFIX",
      name: "IFIX (FIIs)",
      value: lastClose,
      change_pct: pct,
      date: last.date,
      trend: pct != null ? (pct > 0 ? "up" : pct < 0 ? "down" : "stable") : null,
    });
  }

  // Internacionais via Yahoo v8/chart
  const intIndexes = [
    { symbol: "%5EGSPC", name: "S&P 500" },
    { symbol: "%5EIXIC", name: "Nasdaq" },
    { symbol: "%5EDJI", name: "Dow Jones" },
    { symbol: "%5EN225", name: "Nikkei 225" },
  ];

  for (const idx of intIndexes) {
    try {
      const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + idx.symbol + "?interval=1d&range=5d";
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = safeNum(meta.regularMarketPrice);
      const prev = safeNum(meta.chartPreviousClose);
      const pct = (price && prev && prev > 0) ? ((price - prev) / prev) * 100 : null;
      results.push({
        code: idx.symbol.replace(/%5E/g, ""),
        name: idx.name,
        value: price,
        change_pct: pct,
        date: new Date().toISOString().substring(0, 10),
        trend: pct != null ? (pct > 0 ? "up" : pct < 0 ? "down" : "stable") : null,
      });
    } catch (e) {
      console.warn("Yahoo index error " + idx.symbol, e);
    }
  }

  return results.length > 0 ? results : null;
}

// ═══════ Commodities (Yahoo) ═══════

async function fetchCommodities(): Promise<Array<Record<string, unknown>> | null> {
  const items = [
    { symbol: "GC=F", name: "Ouro", unit: "USD/oz" },
    { symbol: "SI=F", name: "Prata", unit: "USD/oz" },
    { symbol: "CL=F", name: "Petroleo WTI", unit: "USD/bbl" },
    { symbol: "BZ=F", name: "Brent", unit: "USD/bbl" },
    { symbol: "ZS=F", name: "Soja", unit: "USD/bu" },
    { symbol: "KC=F", name: "Cafe", unit: "USD/lb" },
    { symbol: "TIO=F", name: "Minerio de Ferro", unit: "USD/t" },
    { symbol: "ZC=F", name: "Milho", unit: "USD/bu" },
    { symbol: "SB=F", name: "Acucar", unit: "USD/lb" },
  ];

  const results: Array<Record<string, unknown>> = [];

  for (const item of items) {
    try {
      const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(item.symbol) + "?interval=1d&range=5d";
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = safeNum(meta.regularMarketPrice);
      const prev = safeNum(meta.chartPreviousClose);
      const pct = (price && prev && prev > 0) ? ((price - prev) / prev) * 100 : null;
      results.push({
        code: item.symbol.replace("=F", ""),
        name: item.name,
        unit: item.unit,
        value: price,
        change_pct: pct,
        trend: pct != null ? (pct > 0 ? "up" : pct < 0 ? "down" : "stable") : null,
      });
    } catch (e) {
      console.warn("Yahoo commodity error " + item.symbol, e);
    }
  }

  return results.length > 0 ? results : null;
}

// ═══════ Boletim Focus (DM) ═══════

async function fetchFocus(): Promise<unknown | null> {
  const data = await dmFetch("/macro/focus/selic");
  return data || null;
}

// ═══════ Curva de Juros (DM) ═══════

async function fetchCurvaJuros(): Promise<Record<string, unknown> | null> {
  const curves: Record<string, unknown> = {};

  const pre = await dmFetch("/macro/yield_curves/ettj_pre");
  if (pre) curves.ettj_pre = pre;

  const ipca = await dmFetch("/macro/yield_curves/ettj_ipca");
  if (ipca) curves.ettj_ipca = ipca;

  return Object.keys(curves).length > 0 ? curves : null;
}

// ═══════ Moedas (DM) ═══════

async function fetchMoedas(): Promise<Array<Record<string, unknown>> | null> {
  // Lista de moedas disponiveis
  const currencies = await dmFetch("/currencies") as Array<Record<string, unknown>> | null;
  if (!currencies || !Array.isArray(currencies)) return null;

  // Pegar cotacao atual das principais
  const mainCurrencies = ["USD", "EUR", "GBP", "JPY", "CNY", "ARS"];
  // Tentar ultimos 5 dias uteis (fim de semana/feriado nao tem cotacao)
  const results: Array<Record<string, unknown>> = [];

  for (const code of mainCurrencies) {
    let rate = null;
    for (let daysBack = 1; daysBack <= 5; daysBack++) {
      const dateStr = new Date(Date.now() - daysBack * 86400000).toISOString().substring(0, 10);
      rate = await dmFetch("/currencies/" + code + "/BRL/" + dateStr);
      if (rate) break;
    }
    if (rate) {
      results.push({
        code: code,
        rate: rate,
      });
    }
  }

  // Adicionar cripto via Yahoo
  const cryptos = [
    { symbol: "BTC-USD", name: "Bitcoin", code: "BTC" },
    { symbol: "ETH-USD", name: "Ethereum", code: "ETH" },
    { symbol: "SOL-USD", name: "Solana", code: "SOL" },
  ];
  for (const c of cryptos) {
    try {
      const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + c.symbol + "?interval=1d&range=5d";
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = safeNum(meta.regularMarketPrice);
      const prev = safeNum(meta.chartPreviousClose);
      const pct = (price && prev && prev > 0) ? ((price - prev) / prev) * 100 : null;
      results.push({
        code: c.code,
        crypto: true,
        name: c.name,
        value: price,
        change_pct: pct,
        trend: pct != null ? (pct > 0 ? "up" : pct < 0 ? "down" : "stable") : null,
      });
    } catch { /* skip */ }
  }

  return results.length > 0 ? results : null;
}

// ═══════ Noticias (DM) ═══════

async function fetchNoticias(): Promise<Array<Record<string, unknown>> | null> {
  const data = await dmFetch("/news") as Array<Record<string, unknown>> | null;
  if (!data || !Array.isArray(data)) return null;
  // Limitar a 20 noticias mais recentes
  return data.slice(0, 20);
}

// ═══════ Handler ═══════

// Aceita ?type=acoes|fiis|stocks|reits|fundos|tesouro|indices|bolsas|focus|curva_juros|moedas|noticias|all
// Chamar com type especifico para evitar timeout. "all" roda tudo (pode estourar).
// Cron deve chamar cada type separadamente.

Deno.serve(async function (req) {
  const startTime = Date.now();
  const results: Record<string, string> = {};
  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type") || "all";
  const types = typeParam === "all"
    ? ["acoes", "fiis", "stocks", "reits", "fundos", "tesouro", "indices", "bolsas", "commodities", "focus", "curva_juros", "moedas", "noticias"]
    : typeParam.split(",");

  try {
    for (const t of types) {
      console.log("Buscando " + t + "...");

      if (t === "acoes") {
        const acoes = await fetchDM_BR(ACOES_BR, false);
        const filtered = acoes.filter(function (a) { return a.tipo === "acao"; });
        results.acoes = (await upsertRanking("acoes", filtered)) ? "ok:" + filtered.length : "skip";

      } else if (t === "fiis") {
        const fiis = await fetchDM_BR(FIIS_BR, true);
        results.fiis = (await upsertRanking("fiis", fiis)) ? "ok:" + fiis.length : "skip";

      } else if (t === "stocks") {
        const stocks = await fetchYahoo(STOCKS_INT, false);
        results.stocks = (await upsertRanking("stocks", stocks)) ? "ok:" + stocks.length : "skip";

      } else if (t === "reits") {
        const reits = await fetchYahoo(REITS_INT, true);
        results.reits = (await upsertRanking("reits", reits)) ? "ok:" + reits.length : "skip";

      } else if (t === "fundos") {
        const fundos = await fetchFundos();
        results.fundos = (await upsertRanking("fundos", fundos)) ? "ok:" + fundos.length : "skip";

      } else if (t === "tesouro") {
        const tesouro = await fetchTesouro();
        results.tesouro = (await upsertRanking("tesouro", tesouro)) ? "ok:" + tesouro.length : "skip";

      } else if (t === "indices") {
        const indices = await fetchIndices();
        results.indices = (await upsertMarketData("indices", indices)) ? "ok" : "skip";

      } else if (t === "bolsas") {
        const bolsas = await fetchBolsas();
        results.bolsas = (await upsertMarketData("bolsas", bolsas)) ? "ok" : "skip";

      } else if (t === "commodities") {
        const commodities = await fetchCommodities();
        results.commodities = (await upsertMarketData("commodities", commodities)) ? "ok" : "skip";

      } else if (t === "focus") {
        const focus = await fetchFocus();
        results.focus = (await upsertMarketData("focus", focus)) ? "ok" : "skip";

      } else if (t === "curva_juros") {
        const curva = await fetchCurvaJuros();
        results.curva_juros = (await upsertMarketData("curva_juros", curva)) ? "ok" : "skip";

      } else if (t === "moedas") {
        const moedas = await fetchMoedas();
        results.moedas = (await upsertMarketData("moedas", moedas)) ? "ok" : "skip";

      } else if (t === "noticias") {
        const noticias = await fetchNoticias();
        results.noticias = (await upsertMarketData("noticias", noticias)) ? "ok" : "skip";
      }
    }

  } catch (e) {
    console.error("Erro geral:", e);
    results.error = String(e);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("update-rankings [" + typeParam + "] concluido em " + elapsed + "s:", JSON.stringify(results));

  return new Response(JSON.stringify({ ok: true, elapsed: elapsed + "s", types: typeParam, results: results }), {
    headers: { "Content-Type": "application/json" },
  });
});
