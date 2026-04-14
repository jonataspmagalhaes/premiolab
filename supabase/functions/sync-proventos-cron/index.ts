// sync-proventos-cron — Supabase Edge Function
// Cron job: sincroniza proventos automaticamente para todos os usuarios
// APIs: Brapi (BR) + Massive/ex-Polygon (INT)
// Idempotencia via UPSERT com unique index (user_id, ticker, corretora, data_com, tipo, portfolio_id) NULLS NOT DISTINCT
// Modos: cron (todos usuarios) ou on-demand (body.user_id)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Decimal from "https://esm.sh/decimal.js@10";
import { dm, DM_ENABLED, DMDividend } from "../_shared/dadosdemercado.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BRAPI_TOKEN = Deno.env.get("BRAPI_TOKEN") || "tEU8wyBixv8hCi7J3NCjsi";
const MASSIVE_API_KEY = Deno.env.get("MASSIVE_API_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

const BRAPI_URL = "https://brapi.dev/api/quote/";
const BRAPI_CURRENCY_URL = "https://brapi.dev/api/v2/currency";
const MASSIVE_URL = "https://api.massive.com/v3/reference/dividends";
const DELAY_MS = 200;

// ══════════ DECIMAL HELPERS ══════════

function decMul(a: number, b: number): number {
  return new Decimal(a || 0).times(b || 0).toNumber();
}

function decAdd(a: number, b: number): number {
  return new Decimal(a || 0).plus(b || 0).toNumber();
}

// ══════════ RATE LIMITING ══════════

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// ══════════ INTERFACES ══════════

interface Operacao {
  user_id: string;
  ticker: string;
  tipo: string;
  quantidade: number;
  data: string;
  corretora: string | null;
  mercado: string;
  portfolio_id: string | null;
  categoria: string | null;
}

interface BrapiDividend {
  paymentDate: string;
  rate: number;
  label: string;
  lastDatePrior: string | null;
  _source?: string;
}

interface MassiveDividend {
  record_date: string;
  pay_date: string;
  cash_amount: number;
}

interface SyncStats {
  checked: number;
  upserted: number;
  skipped: number;
  movs_created: number;
  errors: string[];
}

// ══════════ FETCH USD/BRL RATE ══════════

async function fetchUsdBrlRate(): Promise<number> {
  // Tentar brapi primeiro
  try {
    var url = BRAPI_CURRENCY_URL + "?currency=USD-BRL&token=" + BRAPI_TOKEN;
    var resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (resp.ok) {
      var json = await resp.json();
      var currencies = json.currency || [];
      for (var i = 0; i < currencies.length; i++) {
        if (currencies[i].fromCurrency === "USD") {
          var bid = parseFloat(currencies[i].bidPrice);
          if (bid > 0) return bid;
        }
      }
    }
  } catch (err) {
    console.warn("fetchUsdBrlRate brapi error:", err);
  }

  // Fallback: open.er-api.com
  try {
    var resp2 = await fetch("https://open.er-api.com/v6/latest/USD");
    if (resp2.ok) {
      var json2 = await resp2.json();
      if (json2.result === "success" && json2.rates && json2.rates.BRL > 0) {
        return json2.rates.BRL;
      }
    }
  } catch (err) {
    console.warn("fetchUsdBrlRate er-api error:", err);
  }

  // Fallback fixo
  return 5.5;
}

// ══════════ FETCH DIVIDENDS BRAPI (BR) ══════════

async function fetchDividendsBrapi(ticker: string): Promise<BrapiDividend[]> {
  if (!BRAPI_TOKEN) return [];
  try {
    var url = BRAPI_URL + encodeURIComponent(ticker) + "?dividends=true&token=" + BRAPI_TOKEN;
    var resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return [];
    var json = await resp.json();
    var results = json.results || [];
    if (results.length === 0) return [];
    var cashDividends = (results[0].dividendsData || {}).cashDividends || [];
    var mapped: BrapiDividend[] = [];
    for (var d of cashDividends) {
      var payDate = d.paymentDate ? d.paymentDate.substring(0, 10) : null;
      var rate = d.rate || 0;
      if (!payDate || rate <= 0) continue;
      mapped.push({
        paymentDate: payDate,
        rate: rate,
        label: (d.label || "").toUpperCase(),
        lastDatePrior: d.lastDatePrior ? d.lastDatePrior.substring(0, 10) : null,
      });
    }
    return mapped;
  } catch (err) {
    console.warn("fetchDividendsBrapi error for " + ticker + ":", err);
    return [];
  }
}

// ══════════ FETCH DIVIDENDS DADOSDEMERCADO (BR, premium) ══════════

// Adapter: converte DMDividend → BrapiDividend para reaproveitar pipeline de merge.
// Usa adj_amount se disponivel (ajustado por splits), senao amount bruto.
// Mapeia type do DadosDeMercado para label interna compativel com mapLabelToTipo
// DM retorna: "dividend" | "interest" (JCP) | "revenue" (rendimento) | outros
function dmTypeToLabel(type: string | null, categoria: string): string {
  const t = (type || "").toLowerCase();
  if (t === "interest" || t.indexOf("juros") !== -1) return "JCP";
  if (t === "revenue" || t === "income" || t.indexOf("rendimento") !== -1) return "RENDIMENTO";
  // FII sempre como rendimento (mesmo se API mandar "dividend" generico)
  if (categoria === "fii") return "RENDIMENTO";
  return "DIVIDENDO";
}

async function fetchDividendsDadosDeMercado(ticker: string, categoria: string): Promise<BrapiDividend[]> {
  if (!DM_ENABLED) return [];
  try {
    let raw: DMDividend[] = [];
    if (categoria === "fii") {
      raw = await dm.dividendsByFII(ticker);
    } else {
      raw = await dm.dividendsByCompany(ticker);
    }
    // Dedupe: DM as vezes retorna 3 eventos com mesmo (payable_date, amount) e record_dates diferentes
    // (multiplas deliberacoes corporativas do mesmo provento). Consolida mantendo o record_date mais ANTIGO
    // (menos restritivo: mais usuarios elegiveis).
    const byKey: Record<string, DMDividend> = {};
    for (const d of raw) {
      const pd = d.payable_date ? d.payable_date.substring(0, 10) : null;
      if (!pd) continue;
      const rate = d.adj_amount != null ? d.adj_amount : d.amount;
      if (!rate || rate <= 0) continue;
      const tipoKey = (d.type || "").toLowerCase();
      const k = pd + "|" + Math.round(rate * 10000) + "|" + tipoKey;
      if (!byKey[k]) {
        byKey[k] = d;
      } else {
        // Mantem o record_date mais antigo (mais permissivo pra posicao)
        const existingRd = byKey[k].record_date || "9999";
        const currentRd = d.record_date || "9999";
        if (currentRd < existingRd) byKey[k] = d;
      }
    }
    const out: BrapiDividend[] = [];
    for (const k of Object.keys(byKey)) {
      const d = byKey[k];
      const pd = d.payable_date!.substring(0, 10);
      const rate = d.adj_amount != null ? d.adj_amount : d.amount;
      out.push({
        paymentDate: pd,
        rate: rate,
        label: dmTypeToLabel(d.type, categoria),
        lastDatePrior: d.record_date ? d.record_date.substring(0, 10) : null,
        _source: "dadosdemercado",
      });
    }
    return out;
  } catch (err) {
    console.warn("fetchDividendsDadosDeMercado error for " + ticker + ":", err);
    return [];
  }
}

// ══════════ FETCH DIVIDENDS STATUSINVEST (BR fallback/cross-check) ══════════

function parseDateDDMMYYYY(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  var parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  return parts[2] + "-" + parts[1] + "-" + parts[0];
}

async function fetchDividendsStatusInvest(ticker: string, categoria: string): Promise<BrapiDividend[]> {
  // StatusInvest nao suporta ETFs — endpoints sao apenas /acao/ e /fii/
  if (categoria === "etf") return [];
  var tipo = categoria === "fii" ? "fii" : "acao";
  var siHeaders = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  var base = "https://statusinvest.com.br/";
  var result: BrapiDividend[] = [];
  var keys: Record<string, boolean> = {};

  // Endpoint 1: chart historico
  try {
    var url1 = base + tipo + "/companytickerprovents?ticker=" + encodeURIComponent(ticker) + "&chartProvType=2";
    var resp1 = await fetch(url1, { headers: siHeaders });
    if (resp1.ok) {
      var text1 = await resp1.text();
      try {
        var json1 = JSON.parse(text1);
        var models = (json1 && json1.assetEarningsModels) || [];
        for (var i = 0; i < models.length; i++) {
          var item = models[i];
          var pd = parseDateDDMMYYYY(item.pd);
          var ed = parseDateDDMMYYYY(item.ed);
          var rate = item.v;
          var label = item.et || "";
          if (!pd || !rate || rate <= 0) continue;
          var k = pd + "|" + Math.round(rate * 10000);
          if (!keys[k]) {
            keys[k] = true;
            result.push({ paymentDate: pd, rate: rate, label: label.toUpperCase(), lastDatePrior: ed });
          }
        }
      } catch (e) {
        console.warn("StatusInvest endpoint1 parse " + ticker + ":", e);
      }
    } else {
      console.warn("StatusInvest endpoint1 HTTP " + resp1.status + " for " + ticker);
    }
  } catch (e) {
    console.warn("StatusInvest endpoint1 fetch " + ticker + ":", e);
  }

  // Endpoint 2: tabela (inclui proventos recentes/futuros)
  try {
    var url2 = base + tipo + "/companytickerproventsresult?ticker=" + encodeURIComponent(ticker) + "&start=0&length=50";
    var resp2 = await fetch(url2, { headers: siHeaders });
    if (resp2.ok) {
      var text2 = await resp2.text();
      try {
        var json2 = JSON.parse(text2);
        var rows = (json2 && json2.data) || [];
        for (var j = 0; j < rows.length; j++) {
          var row = rows[j];
          var pd2 = parseDateDDMMYYYY(row.pd);
          var ed2 = parseDateDDMMYYYY(row.ed);
          var rate2 = row.v;
          var label2 = row.et || "";
          if (!pd2 || !rate2 || rate2 <= 0) continue;
          var k2 = pd2 + "|" + Math.round(rate2 * 10000);
          if (!keys[k2]) {
            keys[k2] = true;
            result.push({ paymentDate: pd2, rate: rate2, label: label2.toUpperCase(), lastDatePrior: ed2 });
          }
        }
      } catch (e) {
        console.warn("StatusInvest endpoint2 parse " + ticker + ":", e);
      }
    } else {
      console.warn("StatusInvest endpoint2 HTTP " + resp2.status + " for " + ticker);
    }
  } catch (e) {
    console.warn("StatusInvest endpoint2 fetch " + ticker + ":", e);
  }

  return result;
}

// ══════════ MERGE BRAPI + STATUSINVEST (dedup por data+rate) ══════════

// Merge preservando o _source original. Se ja setado, mantem. Se nao, usa defaultA/B.
function mergeDividends(a: BrapiDividend[], b: BrapiDividend[], defaultSourceA: string = "brapi", defaultSourceB: string = "statusinvest"): BrapiDividend[] {
  var map: Record<string, BrapiDividend> = {};
  var out: BrapiDividend[] = [];
  for (var i = 0; i < a.length; i++) {
    var x = a[i];
    var xk = (x.paymentDate || "").substring(0, 10) + "|" + Math.round((x.rate || 0) * 1000000);
    if (!x._source) x._source = defaultSourceA;
    map[xk] = x;
    out.push(x);
  }
  for (var j = 0; j < b.length; j++) {
    var y = b[j];
    var yk = (y.paymentDate || "").substring(0, 10) + "|" + Math.round((y.rate || 0) * 10000);
    if (!map[yk]) {
      if (!y._source) y._source = defaultSourceB;
      map[yk] = y;
      out.push(y);
    } else {
      // Mantem fonte prioritaria (dadosdemercado/b3) ou marca como merged
      if (map[yk]._source !== "dadosdemercado" && map[yk]._source !== "b3") {
        map[yk]._source = "merged";
      }
    }
  }
  return out;
}

// ══════════ FETCH DIVIDENDS B3 OFFICIAL (fallback final para gaps) ══════════

// Resolve ticker → tradingName via endpoint publico B3. Cache in-memory por run.
async function resolveB3TradingName(ticker: string, cache: Record<string, string | null>): Promise<string | null> {
  if (cache[ticker] !== undefined) return cache[ticker];
  // Ticker base sem digito final (PETR4 → PETR, VGIP11 → VGIP)
  var prefix = ticker.replace(/\d+$/, "");
  if (!prefix) { cache[ticker] = null; return null; }
  try {
    var params = JSON.stringify({ language: "pt-br", pageNumber: 1, pageSize: 5, company: prefix });
    var b64 = btoa(params);
    var url = "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetInitialCompanies/" + b64;
    var resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) { cache[ticker] = null; return null; }
    var json = await resp.json();
    var results = (json && json.results) || [];
    // Match por codeCVM/tradingName compativel com ticker prefix
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      var codes = (r.issuingCompany || "").toUpperCase();
      if (codes === prefix || (r.tradingName || "").toUpperCase().indexOf(prefix) !== -1) {
        cache[ticker] = r.tradingName || null;
        return cache[ticker];
      }
    }
    // Fallback: primeiro resultado
    cache[ticker] = results[0] ? (results[0].tradingName || null) : null;
    return cache[ticker];
  } catch (err) {
    console.warn("resolveB3TradingName error for " + ticker + ":", err);
    cache[ticker] = null;
    return null;
  }
}

async function fetchDividendsB3Official(ticker: string, tradingName: string, isFII: boolean): Promise<BrapiDividend[]> {
  try {
    var params = JSON.stringify({ language: "pt-br", pageNumber: 1, pageSize: 100, tradingName: tradingName });
    var b64 = btoa(params);
    // FIIs usam endpoint de fundos; acoes usam companies endpoint
    var endpoint = isFII
      ? "https://sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListedSupplementFunds/"
      : "https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedCashDividends/";
    var resp = await fetch(endpoint + b64, { headers: { Accept: "application/json" } });
    if (!resp.ok) return [];
    var json = await resp.json();
    var rows: any[] = (json && (json.results || (json.cashDividends) || [])) || [];
    var out: BrapiDividend[] = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      // B3 retorna campos variados. Normalizar:
      var pd = row.paymentDate || row.dataPagamento || row.paymentdate;
      var ed = row.lastDatePrior || row.dataEx || row.lastdateprior;
      var valor = row.rate || row.valueCash || row.dividendValue || row.value;
      var label = row.label || row.corporateAction || row.labelValue || "DIVIDENDO";
      if (!pd) continue;
      // B3 formato "dd/MM/yyyy" ou "yyyy-MM-dd"
      var pdIso = pd.indexOf("/") !== -1 ? pd.split("/").reverse().join("-") : pd.substring(0, 10);
      var edIso = ed ? (ed.indexOf("/") !== -1 ? ed.split("/").reverse().join("-") : ed.substring(0, 10)) : null;
      var rate = typeof valor === "string" ? parseFloat(valor.replace(/\./g, "").replace(",", ".")) : valor;
      if (!rate || rate <= 0) continue;
      out.push({ paymentDate: pdIso, rate: rate, label: String(label).toUpperCase(), lastDatePrior: edIso, _source: "b3" });
    }
    return out;
  } catch (err) {
    console.warn("fetchDividendsB3Official error for " + ticker + ":", err);
    return [];
  }
}

// ══════════ FETCH USD/BRL HISTORICO (Yahoo) ══════════
// Busca serie historica de fechamento USD-BRL dos ultimos 2 anos.
// Retorna Map<"YYYY-MM-DD", rate>. Lookup O(1) com fallback pra rate mais proxima.
async function fetchUsdBrlHistorical(): Promise<Record<string, number>> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/USDBRL=X?interval=1d&range=2y";
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    });
    if (!resp.ok) return {};
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    if (!result) return {};
    const timestamps: number[] = result.timestamp || [];
    const closes: number[] = result.indicators?.quote?.[0]?.close || [];
    const out: Record<string, number> = {};
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close && close > 0) {
        const d = new Date(timestamps[i] * 1000).toISOString().substring(0, 10);
        out[d] = close;
      }
    }
    return out;
  } catch (err) {
    console.warn("fetchUsdBrlHistorical error:", err);
    return {};
  }
}

// Lookup rate na data ou mais proxima anterior. Fallback pro ultimo disponivel.
function lookupHistoricalRate(rates: Record<string, number>, dateStr: string, fallback: number): number {
  if (rates[dateStr]) return rates[dateStr];
  // Procura a data mais proxima ANTERIOR (mercado fechado no dia)
  const sorted = Object.keys(rates).sort();
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i] <= dateStr) return rates[sorted[i]];
  }
  return fallback;
}

// ══════════ FETCH DIVIDENDS YAHOO (INT) ══════════
// Yahoo Finance v8 chart API — gratuita, cobre ETFs/ADRs americanos
async function fetchDividendsYahoo(ticker: string): Promise<MassiveDividend[]> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(ticker) + "?interval=1d&range=2y&events=div";
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });
    if (!resp.ok) {
      console.warn("Yahoo dividends HTTP " + resp.status + " for " + ticker);
      return [];
    }
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];
    const events = result.events?.dividends;
    if (!events) return [];

    const out: MassiveDividend[] = [];
    for (const k of Object.keys(events)) {
      const ev = events[k];
      if (!ev || !ev.amount || ev.amount <= 0) continue;
      const dateStr = new Date(ev.date * 1000).toISOString().substring(0, 10);
      out.push({
        pay_date: dateStr,
        record_date: dateStr, // Yahoo nao tem record_date separado
        cash_amount: ev.amount,
      });
    }
    return out;
  } catch (err) {
    console.warn("fetchDividendsYahoo error for " + ticker + ":", err);
    return [];
  }
}

// ══════════ FETCH DIVIDENDS MASSIVE (INT) ══════════

async function fetchDividendsMassive(ticker: string): Promise<MassiveDividend[]> {
  if (!MASSIVE_API_KEY) return [];
  try {
    var url = MASSIVE_URL + "?ticker=" + encodeURIComponent(ticker) + "&apiKey=" + MASSIVE_API_KEY;
    var resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return [];
    var json = await resp.json();
    return (json.results || []).filter(function (d: MassiveDividend) {
      return d.cash_amount > 0 && d.pay_date && d.record_date;
    });
  } catch (err) {
    console.warn("fetchDividendsMassive error for " + ticker + ":", err);
    return [];
  }
}

// ══════════ MAP LABEL TO TIPO ══════════

function mapLabelToTipo(label: string): string {
  if (!label) return "dividendo";
  var upper = label.toUpperCase().trim();
  if (upper === "JCP" || upper.indexOf("JCP") !== -1 || upper.indexOf("JUROS SOBRE CAPITAL") !== -1 || upper.indexOf("INTEREST") !== -1) return "jcp";
  if (upper.indexOf("RENDIMENTO") !== -1 || upper.indexOf("REND.") !== -1 || upper === "REVENUE" || upper === "INCOME") return "rendimento";
  if (upper.indexOf("BONIFIC") !== -1 || upper === "BONUS" || upper === "STOCK DIVIDEND") return "bonificacao";
  if (upper.indexOf("AMORTIZ") !== -1 || upper === "AMORTIZATION" || upper.indexOf("AMORT.") !== -1) return "amortizacao";
  if (upper.indexOf("DESDOBRAM") !== -1 || upper === "SPLIT" || upper === "STOCK SPLIT") return "bonificacao";
  return "dividendo";
}

// ══════════ ALIASES DE CORRETORA ══════════
// Normaliza variacoes do mesmo nome de corretora pra evitar duplicatas.
// Ex: "XP INVESTIMENTOS" e "XP" viram "XP".
const CORRETORA_ALIASES: Record<string, string> = {
  "XP INVESTIMENTOS": "XP",
  "XP INVEST": "XP",
  "XPI": "XP",
  "ITAU UNIBANCO": "ITAU",
  "ITAU CORRETORA": "ITAU",
  "BRADESCO CORRETORA": "BRADESCO",
  "BTG PACTUAL": "BTG",
  "BTG PACTUAL DIGITAL": "BTG",
  "RICO INVESTIMENTOS": "RICO",
  "CLEAR CORRETORA": "CLEAR",
  "MODALMAIS": "MODAL",
  "MODAL MAIS": "MODAL",
  "NU INVEST": "NUBANK",
  "NUINVEST": "NUBANK",
  "INTER INVEST": "INTER",
  "BANCO INTER": "INTER",
  "AVENUE SECURITIES": "AVENUE",
  "GENIAL INVESTIMENTOS": "GENIAL",
};

function normalizeCorretora(raw: string | null | undefined): string {
  if (!raw) return "SEM CORRETORA";
  const up = raw.toString().trim().toUpperCase();
  if (!up) return "SEM CORRETORA";
  return CORRETORA_ALIASES[up] || up;
}

// ══════════ POSICAO HISTORICA NA DATA COM (por corretora, filtrada por portfolio) ══════════

function getPosicaoNaDataCom(
  ops: Operacao[],
  userId: string,
  ticker: string,
  recordDate: string,
  portfolioId: string | null
): Record<string, number> {
  var byCorretora: Record<string, number> = {};
  var tickerUpper = ticker.toUpperCase().trim();

  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    if (op.user_id !== userId) continue;
    if ((op.ticker || "").toUpperCase().trim() !== tickerUpper) continue;
    // Filtrar por portfolio
    var opPf = op.portfolio_id || null;
    if (opPf !== portfolioId) continue;

    var opDate = (op.data || "").substring(0, 10);
    if (!opDate) continue;

    var corretora = normalizeCorretora(op.corretora);
    if (!byCorretora[corretora]) byCorretora[corretora] = 0;

    if (op.tipo === "compra") {
      if (opDate <= recordDate) byCorretora[corretora] += op.quantidade || 0;
    } else if (op.tipo === "venda") {
      // Venda na data-com ou depois nao tira direito ao dividendo (liquidacao D+2)
      if (opDate < recordDate) byCorretora[corretora] -= op.quantidade || 0;
    }
  }

  var result: Record<string, number> = {};
  for (var corr of Object.keys(byCorretora)) {
    if (byCorretora[corr] > 0) result[corr] = byCorretora[corr];
  }
  return result;
}

// ══════════ FIND CONTA FOR MOVIMENTACAO ══════════

interface SaldoConta {
  name: string;
  moeda: string;
}

function findContaForCorretora(
  saldosByName: Record<string, SaldoConta[]>,
  porCorretora: Record<string, number>,
  preferMoeda: string
): string | null {
  if (!porCorretora) return null;
  var corKeys = Object.keys(porCorretora);
  for (var i = 0; i < corKeys.length; i++) {
    var corName = normalizeCorretora(corKeys[i]);
    var matches = saldosByName[corName];
    if (matches) {
      // Preferir conta na moeda certa
      for (var j = 0; j < matches.length; j++) {
        if (matches[j].moeda === preferMoeda) return matches[j].name;
      }
      return matches[0].name;
    }
  }
  return null;
}

// ══════════ MOVIMENTACAO DEDUP KEY ══════════

function movDedupKey(ticker: string, dataPagamento: string, tipo: string): string {
  return (ticker || "").toUpperCase().trim() + "|" + (dataPagamento || "").substring(0, 10) + "|" + (tipo || "dividendo");
}

// ══════════ MAIN SYNC ══════════

async function syncProventos(targetUserId?: string): Promise<SyncStats & { message?: string }> {
  var stats: SyncStats = { checked: 0, upserted: 0, skipped: 0, movs_created: 0, errors: [] };

  // ─── Advisory lock por usuario pra evitar race entre web e mobile ─────
  // pg_try_advisory_xact_lock retorna false se ja esta travado. Usa hash estavel do user_id.
  if (targetUserId) {
    try {
      // Converte uuid em bigint hash via abs-hash-of-string
      let hash = 0;
      for (let i = 0; i < targetUserId.length; i++) {
        hash = ((hash << 5) - hash + targetUserId.charCodeAt(i)) | 0;
      }
      // pg_try_advisory_lock nao-transacional (persiste ate unlock ou conexao fechar)
      const lockR = await supabase.rpc("pg_try_advisory_lock", { key: hash });
      if (lockR.error || lockR.data === false) {
        // Ignora: ou RPC nao existe (silenciosamente ok), ou lock falhou (outro sync rodando)
        if (lockR.data === false) {
          return { checked: 0, upserted: 0, skipped: 0, movs_created: 0, errors: [], message: "Sync ja em andamento (lock)" };
        }
      }
    } catch (_) { /* RPC pg_try_advisory_lock pode nao estar exposta — ignora */ }
  }

  // ─── Pre-cleanup: remover proventos corretora=null onde existe versao com corretora preenchida ──────
  // Evita duplicacao entre legado e novo sync. Fetch-then-delete em 2 round trips.
  try {
    let nullQuery = supabase
      .from("proventos")
      .select("id, user_id, ticker, data_pagamento, tipo, portfolio_id")
      .is("corretora", null)
      .neq("fonte", "manual");
    if (targetUserId) nullQuery = nullQuery.eq("user_id", targetUserId);
    const nullR = await nullQuery.limit(5000);
    const nullRows = nullR.data || [];

    if (nullRows.length > 0) {
      // Para cada null, checar se existe gemeo com corretora preenchida
      const idsToDelete: number[] = [];
      for (const nr of nullRows) {
        let twinQuery = supabase
          .from("proventos")
          .select("id", { head: false, count: "exact" })
          .eq("user_id", nr.user_id)
          .eq("ticker", nr.ticker)
          .eq("data_pagamento", nr.data_pagamento)
          .eq("tipo", nr.tipo)
          .not("corretora", "is", null)
          .limit(1);
        if (nr.portfolio_id) twinQuery = twinQuery.eq("portfolio_id", nr.portfolio_id);
        else twinQuery = twinQuery.is("portfolio_id", null);
        const twinR = await twinQuery;
        if ((twinR.data || []).length > 0) {
          idsToDelete.push(nr.id);
        }
      }
      if (idsToDelete.length > 0) {
        // Delete em lotes de 100
        for (let k = 0; k < idsToDelete.length; k += 100) {
          await supabase.from("proventos").delete().in("id", idsToDelete.slice(k, k + 100));
        }
        console.log("Pre-cleanup: removidos " + idsToDelete.length + " proventos corretora=null com gemeos preenchidos");
      }
    }

    // ─── Pre-cleanup 2: colapsar duplicatas com mesmo (ticker, data_pagamento, tipo, portfolio, valor) ─
    // Diferentes data_com/corretora/fonte mas mesmo pagamento real. Mantem 1 linha por grupo.
    let allQuery = supabase
      .from("proventos")
      .select("id, ticker, data_pagamento, tipo, portfolio_id, valor_por_cota, data_com, corretora, fonte, created_at")
      .order("data_pagamento", { ascending: false });
    if (targetUserId) allQuery = allQuery.eq("user_id", targetUserId);
    const allR = await allQuery.limit(10000);
    const allProvLocal = allR.data || [];

    // Agrupar por (ticker, data_pagamento, tipo, portfolio, valor_bucket_4decimais)
    // Precisao 4 decimais agrupa 1.75764 e 1.757644112 como mesmo (ambos viram 17576)
    // Proventos com valores diferentes de verdade (ex: 0.0591 vs 0.1859) continuam separados.
    const groups: Record<string, any[]> = {};
    for (const p of allProvLocal) {
      const v = Math.round((p.valor_por_cota || 0) * 10000);
      const k = [p.ticker, p.data_pagamento, p.tipo, p.portfolio_id || "_", v].join("|");
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    }

    const toDelete: number[] = [];
    const sourceScore: Record<string, number> = {
      "dadosdemercado": 1, "merged": 2, "b3": 3, "brapi": 4, "statusinvest": 5, "manual": 6, "legado": 7,
    };
    for (const k of Object.keys(groups)) {
      const rows = groups[k];
      if (rows.length < 2) continue;
      // Ordena: corretora preenchida primeiro, depois fonte melhor, data_com mais antiga
      rows.sort(function (a: any, b: any) {
        const ca = a.corretora ? 0 : 1;
        const cb = b.corretora ? 0 : 1;
        if (ca !== cb) return ca - cb;
        const sa = sourceScore[a.fonte || "legado"] || 8;
        const sb = sourceScore[b.fonte || "legado"] || 8;
        if (sa !== sb) return sa - sb;
        return (a.data_com || "9999") < (b.data_com || "9999") ? -1 : 1;
      });
      // Mantem [0], deleta o resto
      for (let i = 1; i < rows.length; i++) {
        toDelete.push(rows[i].id);
      }
    }
    if (toDelete.length > 0) {
      for (let k = 0; k < toDelete.length; k += 100) {
        await supabase.from("proventos").delete().in("id", toDelete.slice(k, k + 100));
      }
      console.log("Pre-cleanup dedup: removidos " + toDelete.length + " proventos duplicados");
    }
  } catch (e) {
    console.warn("pre-cleanup falhou:", e);
  }

  // ─── Fetch operacoes ──────────────────────
  var opsQuery = supabase
    .from("operacoes")
    .select("user_id, ticker, tipo, quantidade, data, corretora, mercado, portfolio_id, categoria");

  if (targetUserId) {
    opsQuery = opsQuery.eq("user_id", targetUserId);
  }

  var opsResult = await opsQuery;
  if (opsResult.error) {
    console.error("Error fetching operacoes:", opsResult.error);
    return { checked: 0, upserted: 0, skipped: 0, movs_created: 0, errors: [opsResult.error.message], message: "Erro: " + opsResult.error.message };
  }
  var allOps: Operacao[] = opsResult.data || [];
  if (allOps.length === 0) {
    return { checked: 0, upserted: 0, skipped: 0, movs_created: 0, errors: [], message: "Nenhuma operacao encontrada" };
  }

  // ─── Agregar posicoes por user + ticker + portfolio_id ──────
  var positionMap: Record<string, {
    user_id: string; ticker: string; mercado: string; portfolio_id: string | null; totalQty: number;
  }> = {};

  for (var i = 0; i < allOps.length; i++) {
    var op = allOps[i];
    var ticker = (op.ticker || "").toUpperCase().trim();
    if (!ticker) continue;
    var pfId = op.portfolio_id || null;
    var key = op.user_id + "|" + ticker + "|" + (pfId || "__null__");

    if (!positionMap[key]) {
      positionMap[key] = { user_id: op.user_id, ticker: ticker, mercado: op.mercado || "BR", portfolio_id: pfId, totalQty: 0 };
    }
    if (op.tipo === "compra") positionMap[key].totalQty += op.quantidade || 0;
    else if (op.tipo === "venda") positionMap[key].totalQty -= op.quantidade || 0;
  }

  // Inclui TODAS as posicoes (mesmo totalQty<=0): tickers vendidos podem ter direito a dividendos
  // passados se user detinha posicao na data-com. O check per-data-com em positionAtDateForPortfolio
  // filtra corretamente os que nao tinham posicao.
  var activePositions = Object.values(positionMap);

  // ─── Unique tickers by mercado ──────
  var brTickerSet = new Set<string>();
  var intTickerSet = new Set<string>();
  for (var j = 0; j < activePositions.length; j++) {
    if (activePositions[j].mercado === "INT") intTickerSet.add(activePositions[j].ticker);
    else brTickerSet.add(activePositions[j].ticker);
  }

  // ─── Mapear categoria real por ticker (a partir de operacoes) ──────
  // Substitui heuristica regex por dado real — evita confundir ETF/FII/acao
  var categoriaByTicker: Record<string, string> = {};
  for (var cti = 0; cti < allOps.length; cti++) {
    var cop = allOps[cti];
    var ctk = (cop.ticker || "").toUpperCase().trim();
    if (!ctk || !cop.categoria) continue;
    // Primeira categoria encontrada vence (operacoes estao ordenadas por data asc)
    if (!categoriaByTicker[ctk]) categoriaByTicker[ctk] = cop.categoria;
  }

  console.log("Positions: " + activePositions.length + " | BR: " + brTickerSet.size + " | INT: " + intTickerSet.size);

  // ─── Fetch USD/BRL rate (se houver INT) ──────
  var usdRate = 1;
  var usdRateHistory: Record<string, number> = {};
  if (intTickerSet.size > 0) {
    usdRate = await fetchUsdBrlRate();
    usdRateHistory = await fetchUsdBrlHistorical();
    console.log("USD/BRL rate atual: " + usdRate + ", hist dates: " + Object.keys(usdRateHistory).length);
  }

  // ─── Unique users for post-processing ──────
  var userIds = new Set<string>();
  for (var k = 0; k < activePositions.length; k++) {
    userIds.add(activePositions[k].user_id);
  }

  // ─── Fetch saldos_corretora por user (para movimentacoes) ──────
  var saldosByUser: Record<string, Record<string, SaldoConta[]>> = {};
  for (var uid of userIds) {
    var saldosResult = await supabase
      .from("saldos_corretora")
      .select("name, moeda")
      .eq("user_id", uid);
    var saldosData = saldosResult.data || [];
    var byName: Record<string, SaldoConta[]> = {};
    for (var si = 0; si < saldosData.length; si++) {
      var snOriginal = (saldosData[si].name || "").trim();
      var sn = normalizeCorretora(snOriginal);
      var sm = (saldosData[si].moeda || "BRL").toUpperCase();
      if (sn && sn !== "SEM CORRETORA") {
        if (!byName[sn]) byName[sn] = [];
        byName[sn].push({ name: snOriginal, moeda: sm });
      }
    }
    saldosByUser[uid] = byName;
  }

  // ─── Fetch portfolios por user (para check operacoes_contas) ──────
  var portfolioBlockedByUser: Record<string, Record<string, boolean>> = {};
  for (var uid2 of userIds) {
    var pfResult = await supabase
      .from("portfolios")
      .select("id, operacoes_contas")
      .eq("user_id", uid2);
    var pfData = pfResult.data || [];
    var blocked: Record<string, boolean> = {};
    for (var pi = 0; pi < pfData.length; pi++) {
      if (pfData[pi].operacoes_contas === false) {
        blocked[pfData[pi].id] = true;
      }
    }
    portfolioBlockedByUser[uid2] = blocked;
  }

  // ─── Fetch existing movimentacoes por user (para dedup) ──────
  var existingMovKeysByUser: Record<string, Record<string, boolean>> = {};
  for (var uid3 of userIds) {
    var movResult = await supabase
      .from("movimentacoes")
      .select("categoria, ticker, data")
      .eq("user_id", uid3)
      .in("categoria", ["dividendo", "jcp", "rendimento_fii"]);
    var movData = movResult.data || [];
    var movKeys: Record<string, boolean> = {};
    for (var mi = 0; mi < movData.length; mi++) {
      var emv = movData[mi];
      var movTipo = emv.categoria === "jcp" ? "jcp" : emv.categoria === "rendimento_fii" ? "rendimento" : "dividendo";
      movKeys[movDedupKey(emv.ticker, emv.data, movTipo)] = true;
    }
    existingMovKeysByUser[uid3] = movKeys;
  }

  var now = new Date();
  var todayStr = now.toISOString().substring(0, 10);
  var cutoffStr = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

  // ─── INT TICKERS FIRST (Yahoo rapido — evita perder por timeout no BR) ──────

  for (var intTickerA of intTickerSet) {
    try {
      var divsIntA = await fetchDividendsYahoo(intTickerA);
      var intSourceA = "yahoo";
      if (divsIntA.length === 0) {
        divsIntA = await fetchDividendsMassive(intTickerA);
        if (divsIntA.length > 0) intSourceA = "massive";
      }
      try {
        await supabase.from("dividend_sync_log").insert([
          { ticker: intTickerA, categoria: categoriaByTicker[intTickerA] || "stock_int", source: intSourceA, dividends_found: divsIntA.length },
        ]);
      } catch (_) { /* noop */ }
      stats.checked++;

      for (var diiA = 0; diiA < divsIntA.length; diiA++) {
        var divIntA = divsIntA[diiA];
        var payDateA = (divIntA.pay_date || "").substring(0, 10);
        var recordDateA = (divIntA.record_date || "").substring(0, 10);
        if (!payDateA || payDateA < cutoffStr) { stats.skipped++; continue; }

        var dataComIntA = recordDateA || payDateA;
        var rateA = lookupHistoricalRate(usdRateHistory, payDateA, usdRate);
      var valorUnitarioBRLA = new Decimal(divIntA.cash_amount).times(rateA).toDecimalPlaces(4).toNumber();
        var holdersIntA = activePositions.filter(function (p) { return p.ticker === intTickerA && p.mercado === "INT"; });

        for (var hiiA = 0; hiiA < holdersIntA.length; hiiA++) {
          var holderIntA = holdersIntA[hiiA];
          var posPerCorrIntA = getPosicaoNaDataCom(allOps, holderIntA.user_id, intTickerA, dataComIntA, holderIntA.portfolio_id);
          var corrKeysIntA = Object.keys(posPerCorrIntA);
          if (corrKeysIntA.length === 0) continue;

          var totalQtyIntA = 0;
          for (var ciiA = 0; ciiA < corrKeysIntA.length; ciiA++) {
            totalQtyIntA = decAdd(totalQtyIntA, posPerCorrIntA[corrKeysIntA[ciiA]]);
          }
          if (totalQtyIntA <= 0) continue;

          var valorTotalIntA = decMul(totalQtyIntA, valorUnitarioBRLA);
          var mainCorrIntA: string | null = null;
          var maxCorrQtyIntA = 0;
          for (const cniA of Object.keys(posPerCorrIntA)) {
            if (posPerCorrIntA[cniA] > maxCorrQtyIntA) { maxCorrQtyIntA = posPerCorrIntA[cniA]; mainCorrIntA = cniA; }
          }

          var upsertPayloadIntA: Record<string, unknown> = {
            user_id: holderIntA.user_id,
            ticker: intTickerA,
            corretora: mainCorrIntA,
            data_com: dataComIntA,
            tipo: "dividendo",
            valor_por_cota: valorUnitarioBRLA,
            quantidade: totalQtyIntA,
            data_pagamento: payDateA,
            portfolio_id: holderIntA.portfolio_id || null,
            por_corretora: posPerCorrIntA,
            fonte: intSourceA,
          };
          var upsertResultIntA = await supabase
            .from("proventos")
            .upsert(upsertPayloadIntA, { onConflict: "user_id,ticker,corretora,data_com,tipo,portfolio_id" });
          if (upsertResultIntA.error) {
            stats.errors.push(intTickerA + ": " + upsertResultIntA.error.message);
          } else {
            stats.upserted++;
          }
        }
      }
    } catch (err) {
      stats.errors.push("INT " + intTickerA + ": " + String(err));
    }
  }

  // Marca que INTs foram processados para pular o loop legacy abaixo
  var _intAlreadyProcessed = true;

  // ─── BR TICKERS (Brapi) ─────────────────────────

  var b3NameCache: Record<string, string | null> = {};

  for (var brTicker of brTickerSet) {
    try {
      var categoriaReal = categoriaByTicker[brTicker] || "acao";

      // 1a fonte (premium, se ativa): DadosDeMercado — schema estavel, coverage confirmada
      var dmDivs = await fetchDividendsDadosDeMercado(brTicker, categoriaReal);
      // 2a fonte: brapi (grátis, cobertura boa para blue chips)
      var brapiDivs = await fetchDividendsBrapi(brTicker);
      // 3a fonte: StatusInvest (cobre FIIs/small caps que brapi falha)
      var siDivs = await fetchDividendsStatusInvest(brTicker, categoriaReal);
      var b3Divs: BrapiDividend[] = [];

      // 4a fonte: B3 oficial — so chama se todas anteriores falharam (evita rate limit)
      if (dmDivs.length === 0 && brapiDivs.length === 0 && siDivs.length === 0) {
        var tradingName = await resolveB3TradingName(brTicker, b3NameCache);
        if (tradingName) {
          b3Divs = await fetchDividendsB3Official(brTicker, tradingName, categoriaReal === "fii");
          await sleep(DELAY_MS);
        }
      }

      // Merge em cascata: dm → brapi → si → b3 (ordem importa — primeiros ganham)
      var divs = mergeDividends(
        mergeDividends(mergeDividends(dmDivs, brapiDivs), siDivs),
        b3Divs,
      );

      // Telemetria: log por ticker/fonte (best-effort, nao bloqueia sync)
      try {
        var logRows: any[] = [
          { ticker: brTicker, categoria: categoriaReal, source: "brapi", dividends_found: brapiDivs.length },
          { ticker: brTicker, categoria: categoriaReal, source: "statusinvest", dividends_found: siDivs.length },
          { ticker: brTicker, categoria: categoriaReal, source: "merged", dividends_found: divs.length },
        ];
        if (DM_ENABLED) {
          logRows.push({ ticker: brTicker, categoria: categoriaReal, source: "dadosdemercado", dividends_found: dmDivs.length });
        }
        if (b3Divs.length > 0 || (dmDivs.length === 0 && brapiDivs.length === 0 && siDivs.length === 0)) {
          logRows.push({ ticker: brTicker, categoria: categoriaReal, source: "b3", dividends_found: b3Divs.length });
        }
        await supabase.from("dividend_sync_log").insert(logRows);
      } catch (logErr) {
        console.warn("dividend_sync_log insert failed for " + brTicker + ":", logErr);
      }

      stats.checked++;
      await sleep(DELAY_MS);

      for (var di = 0; di < divs.length; di++) {
        var div = divs[di];
        if (div.paymentDate < cutoffStr) { stats.skipped++; continue; }

        // Normaliza tipo para FII sempre como 'rendimento' (senao duplica entre fontes)
        var tipo = (categoriaReal === "fii") ? "rendimento" : mapLabelToTipo(div.label);
        var dataCom = div.lastDatePrior || div.paymentDate;
        var valorUnitario = div.rate;

        // Para cada usuario+portfolio que detem este ticker
        var holders = activePositions.filter(function (p) { return p.ticker === brTicker && p.mercado !== "INT"; });

        for (var hi = 0; hi < holders.length; hi++) {
          var holder = holders[hi];
          var posPerCorretora = getPosicaoNaDataCom(allOps, holder.user_id, brTicker, dataCom, holder.portfolio_id);
          var corrKeys = Object.keys(posPerCorretora);
          if (corrKeys.length === 0) continue;

          // Calcular total qty (soma de todas corretoras)
          var totalQty = 0;
          for (var ci = 0; ci < corrKeys.length; ci++) {
            totalQty = decAdd(totalQty, posPerCorretora[corrKeys[ci]]);
          }
          if (totalQty <= 0) continue;

          // Calcular valor_total (JCP desconta 15% IR)
          var valorTotal = decMul(totalQty, valorUnitario);
          if (tipo === "jcp") {
            valorTotal = decMul(valorTotal, 0.85);
          }

          // Corretora principal = maior qty no map (compativel com legado que gravava corretora unica)
          var mainCorr: string | null = null;
          var maxCorrQty = 0;
          for (const cn of Object.keys(posPerCorretora)) {
            if (posPerCorretora[cn] > maxCorrQty) { maxCorrQty = posPerCorretora[cn]; mainCorr = cn; }
          }

          var upsertPayload: Record<string, unknown> = {
            user_id: holder.user_id,
            ticker: brTicker,
            corretora: mainCorr,
            data_com: dataCom,
            tipo: tipo,
            valor_por_cota: valorUnitario,
            quantidade: totalQty,
            data_pagamento: div.paymentDate,
            portfolio_id: holder.portfolio_id || null,
            por_corretora: posPerCorretora,
            fonte: div._source || "brapi",
          };

          var upsertResult = await supabase
            .from("proventos")
            .upsert(upsertPayload, { onConflict: "user_id,ticker,corretora,data_com,tipo,portfolio_id" });

          if (upsertResult.error) {
            stats.errors.push(brTicker + ": " + upsertResult.error.message);
          } else {
            stats.upserted++;

            // ─── Movimentacao (se data_pagamento <= hoje) ──────
            if (div.paymentDate <= todayStr) {
              var movCreated = await createMovimentacao(
                holder.user_id,
                brTicker,
                tipo,
                valorTotal,
                div.paymentDate,
                posPerCorretora,
                holder.portfolio_id,
                "BRL",
                null
              );
              if (movCreated) stats.movs_created++;
            }
          }
        }
      }
    } catch (err) {
      stats.errors.push("BR " + brTicker + ": " + String(err));
    }
  }

  // ─── INT TICKERS (ja processados acima — skip legacy) ──────

  if (_intAlreadyProcessed) { /* pulamos o loop antigo */ } else
  for (var intTicker of intTickerSet) {
    try {
      // Yahoo primeiro (gratuito, confiavel pra ETFs/ADRs US)
      var divsInt = await fetchDividendsYahoo(intTicker);
      var intSource = "yahoo";
      // Fallback Massive se Yahoo nao retornar
      if (divsInt.length === 0) {
        divsInt = await fetchDividendsMassive(intTicker);
        if (divsInt.length > 0) intSource = "massive";
      }
      try {
        await supabase.from("dividend_sync_log").insert([
          { ticker: intTicker, categoria: categoriaByTicker[intTicker] || "stock_int", source: intSource, dividends_found: divsInt.length },
        ]);
      } catch (logErr) {
        console.warn("dividend_sync_log insert failed for " + intTicker + ":", logErr);
      }
      stats.checked++;
      await sleep(DELAY_MS);

      for (var dii = 0; dii < divsInt.length; dii++) {
        var divInt = divsInt[dii];
        var payDate = (divInt.pay_date || "").substring(0, 10);
        var recordDate = (divInt.record_date || "").substring(0, 10);
        if (!payDate || payDate < cutoffStr) { stats.skipped++; continue; }

        var dataComInt = recordDate || payDate;
        // Converter USD→BRL usando taxa HISTORICA da data de pagamento (mais preciso)
        var rateLegacy = lookupHistoricalRate(usdRateHistory, payDate, usdRate);
        var valorUnitarioBRL = new Decimal(divInt.cash_amount).times(rateLegacy).toDecimalPlaces(4).toNumber();

        var holdersInt = activePositions.filter(function (p) { return p.ticker === intTicker && p.mercado === "INT"; });

        for (var hii = 0; hii < holdersInt.length; hii++) {
          var holderInt = holdersInt[hii];
          var posPerCorrInt = getPosicaoNaDataCom(allOps, holderInt.user_id, intTicker, dataComInt, holderInt.portfolio_id);
          var corrKeysInt = Object.keys(posPerCorrInt);
          if (corrKeysInt.length === 0) continue;

          var totalQtyInt = 0;
          for (var cii = 0; cii < corrKeysInt.length; cii++) {
            totalQtyInt = decAdd(totalQtyInt, posPerCorrInt[corrKeysInt[cii]]);
          }
          if (totalQtyInt <= 0) continue;

          var valorTotalInt = decMul(totalQtyInt, valorUnitarioBRL);

          // Corretora principal INT
          var mainCorrInt: string | null = null;
          var maxCorrQtyInt = 0;
          for (const cni of Object.keys(posPerCorrInt)) {
            if (posPerCorrInt[cni] > maxCorrQtyInt) { maxCorrQtyInt = posPerCorrInt[cni]; mainCorrInt = cni; }
          }

          var upsertPayloadInt: Record<string, unknown> = {
            user_id: holderInt.user_id,
            ticker: intTicker,
            corretora: mainCorrInt,
            data_com: dataComInt,
            tipo: "dividendo",
            valor_por_cota: valorUnitarioBRL,
            quantidade: totalQtyInt,
            data_pagamento: payDate,
            portfolio_id: holderInt.portfolio_id || null,
            por_corretora: posPerCorrInt,
            fonte: intSource,
          };

          var upsertResultInt = await supabase
            .from("proventos")
            .upsert(upsertPayloadInt, { onConflict: "user_id,ticker,corretora,data_com,tipo,portfolio_id" });

          if (upsertResultInt.error) {
            stats.errors.push(intTicker + ": " + upsertResultInt.error.message);
          } else {
            stats.upserted++;

            // Movimentacao para INT (valor ja em BRL)
            if (payDate <= todayStr) {
              var descUsd = "Dividendo " + intTicker + " (US$ " + divInt.cash_amount.toFixed(4) + " x " + usdRate.toFixed(2) + ")";
              var movCreatedInt = await createMovimentacao(
                holderInt.user_id,
                intTicker,
                "dividendo",
                valorTotalInt,
                payDate,
                posPerCorrInt,
                holderInt.portfolio_id,
                "BRL",
                descUsd
              );
              if (movCreatedInt) stats.movs_created++;
            }
          }
        }
      }
    } catch (err) {
      stats.errors.push("INT " + intTicker + ": " + String(err));
    }
  }

  // ─── Update last_dividend_sync for each user ──────
  for (var uid4 of userIds) {
    try {
      await supabase
        .from("profiles")
        .update({ last_dividend_sync: todayStr })
        .eq("id", uid4);
    } catch (err) {
      console.warn("Failed to update last_dividend_sync for " + uid4 + ":", err);
    }
  }

  var msg = "Sync completo: " + stats.checked + " tickers, " + stats.upserted + " upserted, " + stats.skipped + " skipped, " + stats.movs_created + " movs, " + stats.errors.length + " erros";
  console.log(msg);
  return { checked: stats.checked, upserted: stats.upserted, skipped: stats.skipped, movs_created: stats.movs_created, errors: stats.errors, message: msg };

  // ── createMovimentacao (hoisted) ──────────────────
  // Function declarations are hoisted in JS/TS, so this is available above

  async function createMovimentacao(
    userId: string,
    ticker: string,
    tipo: string,
    valor: number,
    dataPagamento: string,
    porCorretora: Record<string, number>,
    portfolioId: string | null,
    _moeda: string,
    customDescricao: string | null
  ): Promise<boolean> {
    if (valor <= 0) return false;

    // Check portfolio blocked
    var blocked = portfolioBlockedByUser[userId] || {};
    if (portfolioId && blocked[portfolioId]) return false;

    // Dedup check
    var movKeys = existingMovKeysByUser[userId] || {};
    var mKey = movDedupKey(ticker, dataPagamento, tipo);
    if (movKeys[mKey]) return false;

    // Find matching account
    var saldos = saldosByUser[userId] || {};
    var conta = findContaForCorretora(saldos, porCorretora, "BRL");
    if (!conta) return false;

    // Map tipo to categoria
    var categoria = tipo === "jcp" ? "jcp" : tipo === "rendimento" ? "rendimento_fii" : "dividendo";
    var descricao = customDescricao || ((categoria === "jcp" ? "JCP" : categoria === "rendimento_fii" ? "Rendimento" : "Dividendo") + " " + ticker);

    try {
      var insertResult = await supabase
        .from("movimentacoes")
        .insert({
          user_id: userId,
          conta: conta,
          tipo: "entrada",
          categoria: categoria,
          valor: valor,
          descricao: descricao,
          ticker: ticker,
          referencia_tipo: "provento",
          data: dataPagamento,
        });

      if (insertResult.error) {
        console.warn("createMovimentacao error for " + ticker + ":", insertResult.error.message);
        return false;
      }

      // Mark as created for dedup within this run
      if (!existingMovKeysByUser[userId]) existingMovKeysByUser[userId] = {};
      existingMovKeysByUser[userId][mKey] = true;
      return true;
    } catch (err) {
      console.warn("createMovimentacao exception for " + ticker + ":", err);
      return false;
    }
  }
}

// ══════════ HTTP HANDLER ══════════

Deno.serve(async function (req) {
  try {
    var body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch (_e) {
      // Body vazio (cron call) — processar todos
    }

    var targetUserId = body.user_id ? String(body.user_id) : undefined;
    var result = await syncProventos(targetUserId);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
