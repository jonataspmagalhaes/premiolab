// ═══════════════════════════════════════════════════════════
// FUNDAMENTAL ACCORDION — Indicadores de Opções + Fundamentalistas
// 6 seções accordion dentro do card expandido de CarteiraScreen
// ═══════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';
import { animateLayout } from '../utils/a11y';
import InfoTip from './InfoTip';
import FundamentalChart from './FundamentalChart';

// ── Black-Scholes helpers (para IV média) ──
function normCDF(x) {
  if (x > 10) return 1;
  if (x < -10) return 0;
  var a1 = 0.254829592; var a2 = -0.284496736; var a3 = 1.421413741;
  var a4 = -1.453152027; var a5 = 1.061405429; var p = 0.3275911;
  var sign = x < 0 ? -1 : 1;
  var absX = Math.abs(x);
  var t = 1.0 / (1.0 + p * absX);
  var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bsD1D2(s, k, t, r, sigma) {
  if (t <= 0 || sigma <= 0 || s <= 0 || k <= 0) return { d1: 0, d2: 0 };
  var d1 = (Math.log(s / k) + (r + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
  var d2 = d1 - sigma * Math.sqrt(t);
  return { d1: d1, d2: d2 };
}

function bsPrice(s, k, t, r, sigma, tipo) {
  if (t <= 0) {
    if (tipo === 'call') return Math.max(0, s - k);
    return Math.max(0, k - s);
  }
  var dd = bsD1D2(s, k, t, r, sigma);
  if (tipo === 'call') return s * normCDF(dd.d1) - k * Math.exp(-r * t) * normCDF(dd.d2);
  return k * Math.exp(-r * t) * normCDF(-dd.d2) - s * normCDF(-dd.d1);
}

function bsIV(s, k, t, r, marketPrice, tipo) {
  if (marketPrice <= 0 || s <= 0 || k <= 0 || t <= 0) return 0.35;
  var sigma = 0.30;
  for (var i = 0; i < 20; i++) {
    var price = bsPrice(s, k, t, r, sigma, tipo);
    var dd = bsD1D2(s, k, t, r, sigma);
    var vegaVal = s * Math.sqrt(t) * normPDF(dd.d1);
    if (vegaVal < 0.0001) break;
    var diff = price - marketPrice;
    sigma = sigma - diff / vegaVal;
    if (sigma < 0.01) { sigma = 0.01; break; }
    if (sigma > 5) { sigma = 5; break; }
    if (Math.abs(diff) < 0.001) break;
  }
  return Math.max(0.01, Math.min(5, sigma));
}

// ── Formatação ──
function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInd(v, dec) {
  if (v == null) return null;
  return v.toFixed(dec != null ? dec : 2);
}

// ── Tooltips ──
var TIPS = {
  pl: 'Preço/Lucro — quantos anos de lucro para pagar o preço da ação. Menor = mais barato.',
  pvp: 'Preço/Valor Patrimonial — preço vs patrimônio por ação. < 1 pode indicar desconto.',
  evEbitda: 'Valor da Firma/EBITDA — múltiplo que considera dívida. Mais completo que P/L.',
  evEbit: 'Valor da Firma/EBIT — similar ao EV/EBITDA mas desconta depreciação.',
  vpa: 'Valor Patrimonial por Ação — patrimônio líquido / número de ações.',
  lpa: 'Lucro por Ação — lucro líquido / número de ações.',
  pAtivo: 'Preço/Ativos Totais — quanto o mercado paga por real de ativo.',
  psr: 'Price-to-Sales — preço sobre receita. Útil para empresas sem lucro.',
  peg: 'P/L / crescimento. < 1 sugere preço justo vs crescimento.',
  dy: 'Dividend Yield — dividendos anuais / preço. Retorno em proventos.',
  divLiqPl: 'Dívida Líquida/Patrimônio — alavancagem. Negativo = mais caixa que dívida.',
  divLiqEbitda: 'Quantos anos de EBITDA para quitar dívida. Negativo = Caixa Líquido.',
  passivosAtivos: 'Passivos/Ativos — proporção financiada por terceiros. > 0.7 = alto.',
  plAtivos: 'Patrimônio/Ativos — proporção financiada por capital próprio.',
  mBruta: 'Margem Bruta — eficiência na produção (receita - custos diretos).',
  mEbitda: 'Margem EBITDA — eficiência operacional antes de juros/impostos/depreciação.',
  mEbit: 'Margem EBIT — eficiência operacional após depreciação.',
  mLiquida: 'Margem Líquida — lucro final sobre receita.',
  roe: 'Return on Equity — lucro sobre patrimônio. Eficiência do capital próprio.',
  roic: 'Return on Invested Capital — retorno sobre capital total (PL + dívida).',
  roa: 'Return on Assets — lucro sobre ativos totais.',
  giroAtivos: 'Receita/Ativos — velocidade de conversão de ativos em receita.',
  cagrReceitas: 'Crescimento composto anual da receita nos últimos 5 anos.',
  cagrLucros: 'Crescimento composto anual do lucro nos últimos 5 anos.',
  ativas: 'Quantidade de opções ativas neste ativo (Calls / Puts).',
  cobertura: 'Se as CALLs vendidas estão cobertas pelas ações em carteira.',
  premios: 'Total de prêmios recebidos em opções deste ativo.',
  plOpcoes: 'Resultado líquido das opções encerradas.',
  hv20: 'Volatilidade histórica 20 dias — mede oscilação real do ativo.',
  ivMedia: 'Volatilidade implícita média das opções ativas via Black-Scholes.',
  yieldOpc: 'Prêmios recebidos / custo da posição em ações.',
  proxVenc: 'Dias até o vencimento da opção ativa mais próxima.',
};

// ── Cores semânticas ──
function getColor(key, val) {
  if (val == null) return C.text;
  var rules = {
    roe: [15, 5], roa: [8, 2], roic: [12, 6],
    mLiquida: [15, 5], mBruta: [40, 20], mEbitda: [25, 10], mEbit: [15, 5],
    cagrReceitas: [10, 0], cagrLucros: [10, 0],
    dy: [6, 2],
  };
  var r = rules[key];
  if (r) {
    if (val >= r[0]) return C.green;
    if (val < r[1]) return C.red;
    return C.text;
  }
  // Valuation invertidos (menor = melhor)
  if (key === 'pl') {
    if (val > 0 && val < 10) return C.green;
    if (val > 25) return C.red;
    return C.text;
  }
  if (key === 'pvp') {
    if (val > 0 && val < 1) return C.green;
    if (val > 3) return C.red;
    return C.text;
  }
  // Endividamento
  if (key === 'divLiqPl') {
    if (val < 0.5) return C.green;
    if (val > 2) return C.red;
    return C.text;
  }
  if (key === 'divLiqEbitda') {
    if (val < 0) return C.green; // Caixa líquido
    if (val < 1) return C.green;
    if (val > 3) return C.red;
    return C.text;
  }
  if (key === 'passivosAtivos') {
    if (val < 0.5) return C.green;
    if (val > 0.7) return C.red;
    return C.text;
  }
  return C.text;
}

// ── Mapeamento de histórico por indicador ──
var HIST_MAP = {
  mLiquida: { field: 'margemLiq', suffix: '%' },
  roe: { field: 'roe', suffix: '%' },
  divLiqEbitda: { field: 'divEbitda', suffix: 'x' },
};

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════
export default function FundamentalAccordion(props) {
  var fundamentals = props.fundamentals;
  var fundLoading = props.fundLoading;
  var opcoes = props.opcoes || [];
  var positionQty = props.positionQty || 0;
  var positionCusto = props.positionCusto || 0;
  var precoAtual = props.precoAtual;
  var indicator = props.indicator;
  var ticker = props.ticker || '';
  var mercado = props.mercado || 'BR';
  var color = props.color || C.accent;

  var _exp = useState({});
  var expanded = _exp[0];
  var setExpanded = _exp[1];

  var _chart = useState(null);
  var chartData = _chart[0];
  var setChartData = _chart[1];

  var currPrefix = mercado === 'INT' ? 'US$ ' : 'R$ ';

  function toggleSection(key) {
    animateLayout();
    var next = {};
    var keys = Object.keys(expanded);
    for (var i = 0; i < keys.length; i++) { next[keys[i]] = expanded[keys[i]]; }
    next[key] = !next[key];
    setExpanded(next);
  }

  function openChart(title, histField, suffix) {
    if (!fundamentals || !fundamentals.historico) return;
    var hist = fundamentals.historico;
    var anos = hist.anos || [];
    var vals = hist[histField] || [];
    var data = [];
    for (var i = 0; i < anos.length; i++) {
      if (vals[i] != null) {
        data.push({ ano: anos[i], valor: vals[i] });
      }
    }
    if (data.length >= 2) {
      setChartData({ title: title, data: data, suffix: suffix || '' });
    }
  }

  // ═══════════════════════════════════════
  // OPÇÕES — computar métricas
  // ═══════════════════════════════════════
  var tickerUpper = ticker.toUpperCase().trim();
  var opcoesAtivas = [];
  for (var oai = 0; oai < opcoes.length; oai++) {
    if (opcoes[oai].status === 'ativa') opcoesAtivas.push(opcoes[oai]);
  }

  var activeCalls = 0; var activePuts = 0;
  for (var aci = 0; aci < opcoesAtivas.length; aci++) {
    if ((opcoesAtivas[aci].tipo || 'call').toLowerCase() === 'put') activePuts++;
    else activeCalls++;
  }
  var ativasLabel = activeCalls + 'C / ' + activePuts + 'P';
  if (activeCalls === 0 && activePuts === 0) ativasLabel = '0';

  // Cobertura
  var coberturaLabel = '\u2013'; var coberturaColor = C.text;
  var callsVendidasQty = 0;
  for (var cvi = 0; cvi < opcoesAtivas.length; cvi++) {
    var cvOp = opcoesAtivas[cvi];
    var cvIsVenda = cvOp.direcao === 'venda' || cvOp.direcao === 'lancamento';
    if ((cvOp.tipo || 'call').toLowerCase() === 'call' && cvIsVenda) {
      callsVendidasQty += (cvOp.quantidade || 0);
    }
  }
  if (callsVendidasQty > 0) {
    if (positionQty >= callsVendidasQty) { coberturaLabel = 'COBERTA'; coberturaColor = C.green; }
    else if (positionQty > 0) { coberturaLabel = 'PARCIAL'; coberturaColor = C.yellow; }
    else { coberturaLabel = 'DESCOBERTA'; coberturaColor = C.red; }
  }

  // Prêmios
  var premiosRecebidos = 0;
  for (var pri = 0; pri < opcoes.length; pri++) {
    var prOp = opcoes[pri];
    var prIsVenda = prOp.direcao === 'venda' || prOp.direcao === 'lancamento';
    var prVal = (prOp.premio || 0) * (prOp.quantidade || 0);
    if (prIsVenda) premiosRecebidos += prVal;
    else premiosRecebidos -= prVal;
  }

  // P&L opções encerradas
  var plOpcoes = 0;
  for (var pli = 0; pli < opcoes.length; pli++) {
    var plOp = opcoes[pli];
    if (plOp.status === 'ativa') continue;
    var plIsVenda = plOp.direcao === 'venda' || plOp.direcao === 'lancamento';
    if (plOp.status === 'fechada' && plOp.premio_fechamento != null) {
      if (plIsVenda) plOpcoes += ((plOp.premio || 0) - (plOp.premio_fechamento || 0)) * (plOp.quantidade || 0);
      else plOpcoes += ((plOp.premio_fechamento || 0) - (plOp.premio || 0)) * (plOp.quantidade || 0);
    } else {
      if (plIsVenda) plOpcoes += (plOp.premio || 0) * (plOp.quantidade || 0);
      else plOpcoes -= (plOp.premio || 0) * (plOp.quantidade || 0);
    }
  }

  var hv20 = indicator && indicator.hv_20 != null ? indicator.hv_20 : null;

  // IV média
  var ivMedia = null;
  if (opcoesAtivas.length > 0 && precoAtual && precoAtual > 0) {
    var ivSum = 0; var ivWeight = 0;
    for (var ivi = 0; ivi < opcoesAtivas.length; ivi++) {
      var ivOp = opcoesAtivas[ivi];
      var ivK = ivOp.strike || 0;
      var ivP = ivOp.premio || 0;
      var ivDays = Math.max(1, Math.ceil((new Date(ivOp.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
      var ivT = ivDays / 365;
      var ivTipo = (ivOp.tipo || 'call').toLowerCase();
      if (ivK > 0 && ivP > 0) {
        var computedIV = bsIV(precoAtual, ivK, ivT, 0.1325, ivP, ivTipo) * 100;
        var ivW = ivOp.quantidade || 1;
        ivSum += computedIV * ivW;
        ivWeight += ivW;
      }
    }
    if (ivWeight > 0) ivMedia = ivSum / ivWeight;
  }

  var ivColor = C.text;
  if (ivMedia != null && hv20 != null && hv20 > 0) {
    var ivRatio = ivMedia / hv20;
    if (ivRatio >= 1.3) ivColor = C.red;
    else if (ivRatio <= 0.7) ivColor = C.green;
  }

  var yieldOpcoes = positionCusto > 0 ? (premiosRecebidos / positionCusto) * 100 : 0;

  var proxVenc = null; var proxVencColor = C.text;
  var nowMs = Date.now();
  for (var pvi = 0; pvi < opcoesAtivas.length; pvi++) {
    var pvDays = Math.max(0, Math.ceil((new Date(opcoesAtivas[pvi].vencimento).getTime() - nowMs) / (1000 * 60 * 60 * 24)));
    if (proxVenc === null || pvDays < proxVenc) proxVenc = pvDays;
  }
  if (proxVenc != null) {
    if (proxVenc <= 7) proxVencColor = C.red;
    else if (proxVenc <= 21) proxVencColor = C.yellow;
  }

  var showOpcoes = opcoes.length > 0 || (indicator && indicator.hv_20 != null);

  // ═══════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════
  function renderSectionHeader(key, title, sectionColor) {
    var isOpen = expanded[key];
    return (
      <TouchableOpacity onPress={function() { toggleSection(key); }}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: 8, paddingHorizontal: 2,
          borderTopWidth: 1, borderTopColor: C.border,
        }}
        accessibilityRole="button"
        accessibilityLabel={(isOpen ? 'Recolher ' : 'Expandir ') + title}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={sectionColor || color} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: sectionColor || color, fontFamily: F.display }}>
            {title}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  function renderMetric(label, value, tipKey, metricColor, chartInfo) {
    if (value == null) return null;
    return (
      <View key={tipKey || label} style={{ width: '48%', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{label}</Text>
          {TIPS[tipKey] ? <InfoTip text={TIPS[tipKey]} size={10} color={C.dim} /> : null}
          {chartInfo ? (
            <TouchableOpacity onPress={function() { openChart(label, chartInfo.field, chartInfo.suffix); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="bar-chart-outline" size={10} color={C.dim} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={{ fontSize: 12, color: metricColor || C.text, fontFamily: F.mono, fontWeight: '600', marginTop: 1 }}>
          {value}
        </Text>
      </View>
    );
  }

  function renderGrid(metrics) {
    var filtered = [];
    for (var i = 0; i < metrics.length; i++) {
      if (metrics[i]) filtered.push(metrics[i]);
    }
    if (filtered.length === 0) return null;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 4, paddingBottom: 4 }}>
        {filtered}
      </View>
    );
  }

  // ═══════════════════════════════════════
  // BUILD SECTIONS
  // ═══════════════════════════════════════
  var fd = fundamentals || {};
  var val = fd.valuation || {};
  var end = fd.endividamento || {};
  var efi = fd.eficiencia || {};
  var rent = fd.rentabilidade || {};
  var cresc = fd.crescimento || {};

  // Check if any fundamental data exists
  var hasFundamentals = fundamentals != null;
  var hasAnyData = false;
  if (hasFundamentals) {
    var allKeys = ['pl', 'pvp', 'evEbitda', 'vpa', 'lpa', 'dy', 'roe', 'roa', 'mBruta', 'mLiquida'];
    for (var ak = 0; ak < allKeys.length; ak++) {
      var sec = allKeys[ak];
      if (val[sec] != null || rent[sec] != null || efi[sec] != null) { hasAnyData = true; break; }
    }
  }

  return (
    <View style={{ marginTop: 8 }}>
      {/* ── OPÇÕES ── */}
      {showOpcoes ? (
        <View>
          {renderSectionHeader('opcoes', 'OPÇÕES', C.opcoes)}
          {expanded['opcoes'] ? renderGrid([
            renderMetric('Ativas', ativasLabel, 'ativas', C.opcoes),
            renderMetric('Cobertura', coberturaLabel, 'cobertura', coberturaColor),
            renderMetric('Prêmios Rec.', opcoes.length > 0 ? currPrefix + fmt(premiosRecebidos) : '\u2013', 'premios', premiosRecebidos >= 0 ? C.green : C.red),
            renderMetric('P&L Opções', opcoes.length > 0 ? (plOpcoes >= 0 ? '+' : '') + currPrefix + fmt(plOpcoes) : '\u2013', 'plOpcoes', plOpcoes >= 0 ? C.green : C.red),
            renderMetric('HV 20d', hv20 != null ? hv20.toFixed(1) + '%' : '\u2013', 'hv20', C.opcoes),
            renderMetric('IV Média', ivMedia != null ? ivMedia.toFixed(1) + '%' : '\u2013', 'ivMedia', ivColor),
            renderMetric('Yield Opções', yieldOpcoes > 0 ? yieldOpcoes.toFixed(2) + '%' : '\u2013', 'yieldOpc', yieldOpcoes > 0 ? C.green : C.text),
            renderMetric('Próx. Venc.', proxVenc != null ? proxVenc + 'd' : '\u2013', 'proxVenc', proxVencColor),
          ]) : null}
        </View>
      ) : null}

      {/* ── FUNDAMENTALISTAS ── */}
      {fundLoading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={color} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 6 }}>Carregando indicadores...</Text>
        </View>
      ) : hasAnyData ? (
        <View>
          {/* VALUATION */}
          {(val.pl != null || val.pvp != null || val.evEbitda != null || val.dy != null) ? (
            <View>
              {renderSectionHeader('valuation', 'VALUATION', C.acoes)}
              {expanded['valuation'] ? renderGrid([
                val.pl != null ? renderMetric('P/L', fmtInd(val.pl, 2), 'pl', getColor('pl', val.pl)) : null,
                val.pvp != null ? renderMetric('P/VP', fmtInd(val.pvp, 2), 'pvp', getColor('pvp', val.pvp)) : null,
                val.evEbitda != null ? renderMetric('EV/EBITDA', fmtInd(val.evEbitda, 2), 'evEbitda', C.text) : null,
                val.evEbit != null ? renderMetric('EV/EBIT', fmtInd(val.evEbit, 2), 'evEbit', C.text) : null,
                val.vpa != null ? renderMetric('VPA', currPrefix + fmtInd(val.vpa, 2), 'vpa', C.text) : null,
                val.lpa != null ? renderMetric('LPA', currPrefix + fmtInd(val.lpa, 2), 'lpa', C.text) : null,
                val.pAtivo != null ? renderMetric('P/Ativo', fmtInd(val.pAtivo, 2), 'pAtivo', C.text) : null,
                val.psr != null ? renderMetric('P/SR', fmtInd(val.psr, 2), 'psr', C.text) : null,
                val.peg != null ? renderMetric('PEG Ratio', fmtInd(val.peg, 2), 'peg', C.text) : null,
                val.dy != null ? renderMetric('D.Y.', fmtInd(val.dy, 1) + '%', 'dy', getColor('dy', val.dy)) : null,
              ]) : null}
            </View>
          ) : null}

          {/* ENDIVIDAMENTO */}
          {(end.divLiqPl != null || end.divLiqEbitda != null || end.passivosAtivos != null) ? (
            <View>
              {renderSectionHeader('endividamento', 'ENDIVIDAMENTO', C.yellow)}
              {expanded['endividamento'] ? renderGrid([
                end.divLiqPl != null ? renderMetric('Dív.Líq/PL', fmtInd(end.divLiqPl, 2), 'divLiqPl', getColor('divLiqPl', end.divLiqPl)) : null,
                end.divLiqEbitda != null ? renderMetric(
                  'Dív.Líq/EBITDA',
                  end.divLiqEbitda < 0 ? 'Caixa Líq.' : fmtInd(end.divLiqEbitda, 2),
                  'divLiqEbitda',
                  getColor('divLiqEbitda', end.divLiqEbitda),
                  HIST_MAP['divLiqEbitda']
                ) : null,
                end.passivosAtivos != null ? renderMetric('Pass./Ativos', fmtInd(end.passivosAtivos, 2), 'passivosAtivos', getColor('passivosAtivos', end.passivosAtivos)) : null,
                end.plAtivos != null ? renderMetric('PL/Ativos', fmtInd(end.plAtivos, 2), 'plAtivos', C.text) : null,
              ]) : null}
            </View>
          ) : null}

          {/* EFICIÊNCIA */}
          {(efi.mBruta != null || efi.mEbitda != null || efi.mLiquida != null) ? (
            <View>
              {renderSectionHeader('eficiencia', 'EFICIÊNCIA', C.rf)}
              {expanded['eficiencia'] ? renderGrid([
                efi.mBruta != null ? renderMetric('M. Bruta', fmtInd(efi.mBruta, 1) + '%', 'mBruta', getColor('mBruta', efi.mBruta)) : null,
                efi.mEbitda != null ? renderMetric('M. EBITDA', fmtInd(efi.mEbitda, 1) + '%', 'mEbitda', getColor('mEbitda', efi.mEbitda)) : null,
                efi.mEbit != null ? renderMetric('M. EBIT', fmtInd(efi.mEbit, 1) + '%', 'mEbit', getColor('mEbit', efi.mEbit)) : null,
                efi.mLiquida != null ? renderMetric('M. Líquida', fmtInd(efi.mLiquida, 1) + '%', 'mLiquida', getColor('mLiquida', efi.mLiquida), HIST_MAP['mLiquida']) : null,
              ]) : null}
            </View>
          ) : null}

          {/* RENTABILIDADE */}
          {(rent.roe != null || rent.roa != null || rent.roic != null) ? (
            <View>
              {renderSectionHeader('rentabilidade', 'RENTABILIDADE', C.green)}
              {expanded['rentabilidade'] ? renderGrid([
                rent.roe != null ? renderMetric('ROE', fmtInd(rent.roe, 1) + '%', 'roe', getColor('roe', rent.roe), HIST_MAP['roe']) : null,
                rent.roic != null ? renderMetric('ROIC', fmtInd(rent.roic, 1) + '%', 'roic', getColor('roic', rent.roic)) : null,
                rent.roa != null ? renderMetric('ROA', fmtInd(rent.roa, 1) + '%', 'roa', getColor('roa', rent.roa)) : null,
                rent.giroAtivos != null ? renderMetric('Giro Ativos', fmtInd(rent.giroAtivos, 2), 'giroAtivos', C.text) : null,
              ]) : null}
            </View>
          ) : null}

          {/* CRESCIMENTO */}
          {(cresc.cagrReceitas != null || cresc.cagrLucros != null) ? (
            <View>
              {renderSectionHeader('crescimento', 'CRESCIMENTO (5A)', C.etfs)}
              {expanded['crescimento'] ? renderGrid([
                cresc.cagrReceitas != null ? renderMetric('CAGR Rec.', fmtInd(cresc.cagrReceitas, 1) + '%', 'cagrReceitas', getColor('cagrReceitas', cresc.cagrReceitas)) : null,
                cresc.cagrLucros != null ? renderMetric('CAGR Luc.', fmtInd(cresc.cagrLucros, 1) + '%', 'cagrLucros', getColor('cagrLucros', cresc.cagrLucros)) : null,
              ]) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* CHART MODAL */}
      <FundamentalChart
        visible={chartData != null}
        onClose={function() { setChartData(null); }}
        title={chartData ? chartData.title : ''}
        ticker={ticker}
        data={chartData ? chartData.data : []}
        suffix={chartData ? chartData.suffix : ''}
        color={color}
      />
    </View>
  );
}
