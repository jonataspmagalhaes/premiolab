import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Rect as SvgRect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getProventos, getOpcoes, getOperacoes, getPositions, getMovimentacoes } from '../../services/database';
import { Glass, Badge, Pill, SectionLabel, InfoTip } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

// ═══════════ CONSTANTS ═══════════

var SUBS = [
  { k: 'caixa', l: 'Caixa' },
  { k: 'div', l: 'Dividendos' },
  { k: 'opc', l: 'Opções' },
  { k: 'ops', l: 'Operações' },
  { k: 'ir', l: 'IR' },
];

var PERIODS = [
  { k: '3M', days: 90 },
  { k: '6M', days: 180 },
  { k: '1A', days: 365 },
  { k: '2A', days: 730 },
  { k: 'Tudo', days: 0 },
];

var TIPO_COLORS = {
  dividendo: C.fiis,
  jcp: C.acoes,
  rendimento: C.rf,
  'juros rf': C.rf,
  'amortização': C.yellow,
  'bonificação': C.opcoes,
};

var STATUS_COLORS = {
  ativa: C.green,
  fechada: C.yellow,
  exercida: C.acoes,
  expirou_po: C.dim,
  expirada: C.dim,
};

var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ═══════════ HELPERS ═══════════

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonthLabel(ym) {
  if (!ym || ym.length < 7) return ym || '';
  var parts = ym.split('-');
  var m = parseInt(parts[1], 10);
  return MESES[m - 1] + '/' + parts[0].substring(2);
}

function formatDate(d) {
  if (!d) return '';
  var parts = d.substring(0, 10).split('-');
  if (parts.length < 3) return d;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function filterByPeriod(items, dateField, periodDays) {
  if (!periodDays) return items;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDays);
  var cutoffStr = cutoff.toISOString().substring(0, 10);
  return items.filter(function(item) {
    return (item[dateField] || '') >= cutoffStr;
  });
}

// ═══════════ IR COMPUTATION (from AnaliseScreen) ═══════════

function computeIR(ops) {
  var sorted = (ops || []).slice().sort(function(a, b) {
    return (a.data || '').localeCompare(b.data || '');
  });
  var pmMap = {};
  var monthResults = {};

  sorted.forEach(function(op) {
    var ticker = op.ticker;
    var cat = op.categoria || 'acao';
    if (!pmMap[ticker]) {
      pmMap[ticker] = { qty: 0, custoTotal: 0, categoria: cat };
    }
    var pos = pmMap[ticker];

    if (op.tipo === 'compra') {
      var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      pos.custoTotal += op.quantidade * op.preco + custos;
      pos.qty += op.quantidade;
    } else if (op.tipo === 'venda') {
      var pm = pos.qty > 0 ? pos.custoTotal / pos.qty : 0;
      var vendaTotal = op.quantidade * op.preco;
      var custoVenda = op.quantidade * pm;
      var ganho = vendaTotal - custoVenda;
      pos.custoTotal -= custoVenda;
      pos.qty -= op.quantidade;
      if (pos.qty <= 0) { pos.qty = 0; pos.custoTotal = 0; }

      var mKey = (op.data || '').substring(0, 7);
      if (!mKey) return;
      if (!monthResults[mKey]) {
        monthResults[mKey] = {
          vendasAcoes: 0, ganhoAcoes: 0, perdaAcoes: 0,
          vendasFII: 0, ganhoFII: 0, perdaFII: 0,
          vendasETF: 0, ganhoETF: 0, perdaETF: 0,
          vendasStockInt: 0, ganhoStockInt: 0, perdaStockInt: 0,
        };
      }
      var mr = monthResults[mKey];
      if (cat === 'fii') {
        mr.vendasFII += vendaTotal;
        if (ganho >= 0) mr.ganhoFII += ganho; else mr.perdaFII += Math.abs(ganho);
      } else if (cat === 'etf') {
        mr.vendasETF += vendaTotal;
        if (ganho >= 0) mr.ganhoETF += ganho; else mr.perdaETF += Math.abs(ganho);
      } else if (cat === 'stock_int') {
        mr.vendasStockInt += vendaTotal;
        if (ganho >= 0) mr.ganhoStockInt += ganho; else mr.perdaStockInt += Math.abs(ganho);
      } else {
        mr.vendasAcoes += vendaTotal;
        if (ganho >= 0) mr.ganhoAcoes += ganho; else mr.perdaAcoes += Math.abs(ganho);
      }
    }
  });
  return monthResults;
}

function computeTaxByMonth(monthResults) {
  var months = Object.keys(monthResults).sort();
  var prejAcumAcoes = 0;
  var prejAcumFII = 0;
  var prejAcumETF = 0;
  var prejAcumStockInt = 0;
  var results = [];

  months.forEach(function(mKey) {
    var mr = monthResults[mKey];
    var saldoAcoes = mr.ganhoAcoes - mr.perdaAcoes - prejAcumAcoes;
    var saldoFII = mr.ganhoFII - mr.perdaFII - prejAcumFII;
    var saldoETF = mr.ganhoETF - mr.perdaETF - prejAcumETF;
    var saldoStockInt = (mr.ganhoStockInt || 0) - (mr.perdaStockInt || 0) - prejAcumStockInt;

    var impostoAcoes = 0;
    if (mr.vendasAcoes > 20000 && saldoAcoes > 0) {
      impostoAcoes = saldoAcoes * 0.15;
      prejAcumAcoes = 0;
    } else if (saldoAcoes < 0) {
      prejAcumAcoes = Math.abs(saldoAcoes);
    } else {
      prejAcumAcoes = 0;
    }

    var impostoFII = 0;
    if (saldoFII > 0) {
      impostoFII = saldoFII * 0.20;
      prejAcumFII = 0;
    } else if (saldoFII < 0) {
      prejAcumFII = Math.abs(saldoFII);
    } else {
      prejAcumFII = 0;
    }

    var impostoETF = 0;
    if (saldoETF > 0) {
      impostoETF = saldoETF * 0.15;
      prejAcumETF = 0;
    } else if (saldoETF < 0) {
      prejAcumETF = Math.abs(saldoETF);
    } else {
      prejAcumETF = 0;
    }

    // Stocks internacionais: 15% flat, sem isencao de R$20k
    var impostoStockInt = 0;
    if (saldoStockInt > 0) {
      impostoStockInt = saldoStockInt * 0.15;
      prejAcumStockInt = 0;
    } else if (saldoStockInt < 0) {
      prejAcumStockInt = Math.abs(saldoStockInt);
    } else {
      prejAcumStockInt = 0;
    }

    results.push({
      month: mKey,
      vendasAcoes: mr.vendasAcoes, vendasFII: mr.vendasFII, vendasETF: mr.vendasETF,
      vendasStockInt: mr.vendasStockInt || 0,
      ganhoAcoes: mr.ganhoAcoes, perdaAcoes: mr.perdaAcoes,
      ganhoFII: mr.ganhoFII, perdaFII: mr.perdaFII,
      ganhoETF: mr.ganhoETF, perdaETF: mr.perdaETF,
      ganhoStockInt: mr.ganhoStockInt || 0, perdaStockInt: mr.perdaStockInt || 0,
      saldoAcoes: saldoAcoes, saldoFII: saldoFII, saldoETF: saldoETF, saldoStockInt: saldoStockInt,
      impostoAcoes: impostoAcoes, impostoFII: impostoFII, impostoETF: impostoETF, impostoStockInt: impostoStockInt,
      impostoTotal: impostoAcoes + impostoFII + impostoETF + impostoStockInt,
      alertaAcoes20k: mr.vendasAcoes > 20000,
      prejAcumAcoes: prejAcumAcoes, prejAcumFII: prejAcumFII, prejAcumETF: prejAcumETF, prejAcumStockInt: prejAcumStockInt,
    });
  });
  return results;
}

// ═══════════ BAR CHART COMPONENT ═══════════

function BarChartSingle(props) {
  var data = props.data || [];
  var color = props.color || C.green;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var h = 160;
  var padL = 50;
  var padR = 10;
  var padT = 15;
  var padB = 30;

  if (!data.length || !w) {
    return (
      <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}
        style={{ height: h }} />
    );
  }

  var maxVal = 0;
  data.forEach(function(d) { if (d.value > maxVal) maxVal = d.value; });
  if (maxVal === 0) maxVal = 1;

  var chartW = w - padL - padR;
  var chartH = h - padT - padB;
  var barW = Math.min(28, (chartW / data.length) * 0.6);
  var gap = chartW / data.length;

  var gridLines = [];
  for (var g = 0; g <= 4; g++) {
    var gy = padT + chartH - (g / 4) * chartH;
    var gv = (maxVal * g / 4);
    gridLines.push({ y: gy, label: gv >= 1000 ? (gv / 1000).toFixed(0) + 'k' : gv.toFixed(0) });
  }

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={h}>
        {gridLines.map(function(gl, gi) {
          return (
            <React.Fragment key={gi}>
              <SvgLine x1={padL} y1={gl.y} x2={w - padR} y2={gl.y}
                stroke={C.border} strokeWidth={0.5} />
              <SvgText x={padL - 6} y={gl.y + 3} fill={C.dim} fontSize={9}
                fontFamily={F.mono} textAnchor="end">{gl.label}</SvgText>
            </React.Fragment>
          );
        })}
        {data.map(function(d, i) {
          var barH = (d.value / maxVal) * chartH;
          var x = padL + i * gap + (gap - barW) / 2;
          var y = padT + chartH - barH;
          return (
            <React.Fragment key={i}>
              <SvgRect x={x} y={y} width={barW} height={barH}
                rx={3} fill={d.color || color} opacity={0.85} />
              <SvgText x={x + barW / 2} y={h - 6} fill={C.dim} fontSize={8}
                fontFamily={F.mono} textAnchor="middle">{d.label}</SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function BarChartDual(props) {
  var data = props.data || [];
  var color1 = props.color1 || C.green;
  var color2 = props.color2 || C.red;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var h = 160;
  var padL = 50;
  var padR = 10;
  var padT = 15;
  var padB = 30;

  if (!data.length || !w) {
    return (
      <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}
        style={{ height: h }} />
    );
  }

  var maxVal = 0;
  data.forEach(function(d) {
    if (d.v1 > maxVal) maxVal = d.v1;
    if (d.v2 > maxVal) maxVal = d.v2;
  });
  if (maxVal === 0) maxVal = 1;

  var chartW = w - padL - padR;
  var chartH = h - padT - padB;
  var pairW = chartW / data.length;
  var barW = Math.min(12, pairW * 0.35);

  var gridLines = [];
  for (var g = 0; g <= 4; g++) {
    var gy = padT + chartH - (g / 4) * chartH;
    var gv = (maxVal * g / 4);
    gridLines.push({ y: gy, label: gv >= 1000 ? (gv / 1000).toFixed(0) + 'k' : gv.toFixed(0) });
  }

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={h}>
        {gridLines.map(function(gl, gi) {
          return (
            <React.Fragment key={gi}>
              <SvgLine x1={padL} y1={gl.y} x2={w - padR} y2={gl.y}
                stroke={C.border} strokeWidth={0.5} />
              <SvgText x={padL - 6} y={gl.y + 3} fill={C.dim} fontSize={9}
                fontFamily={F.mono} textAnchor="end">{gl.label}</SvgText>
            </React.Fragment>
          );
        })}
        {data.map(function(d, i) {
          var cx = padL + i * pairW + pairW / 2;
          var h1 = (d.v1 / maxVal) * chartH;
          var h2 = (d.v2 / maxVal) * chartH;
          return (
            <React.Fragment key={i}>
              <SvgRect x={cx - barW - 1} y={padT + chartH - h1}
                width={barW} height={h1} rx={2} fill={color1} opacity={0.85} />
              <SvgRect x={cx + 1} y={padT + chartH - h2}
                width={barW} height={h2} rx={2} fill={color2} opacity={0.85} />
              <SvgText x={cx} y={h - 6} fill={C.dim} fontSize={8}
                fontFamily={F.mono} textAnchor="middle">{d.label}</SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// ═══════════ HORIZONTAL BAR ═══════════

function HBarRow(props) {
  var label = props.label;
  var value = props.value;
  var total = props.total;
  var color = props.color;
  var pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <View style={styles.hbarRow}>
      <View style={styles.hbarLeft}>
        <Text style={styles.hbarLabel}>{label}</Text>
        <Text style={[styles.hbarPct, { color: color }]}>{pct.toFixed(0) + '%'}</Text>
      </View>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, { width: pct + '%', backgroundColor: color }]} />
      </View>
      <Text style={styles.hbarVal}>{'R$ ' + fmt(value)}</Text>
    </View>
  );
}

// ═══════════ MAIN SCREEN ═══════════

export default function RelatoriosScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _sub = useState('caixa'); var sub = _sub[0]; var setSub = _sub[1];
  var _period = useState('1A'); var period = _period[0]; var setPeriod = _period[1];

  var _proventos = useState([]); var proventos = _proventos[0]; var setProventos = _proventos[1];
  var _opcoes = useState([]); var opcoes = _opcoes[0]; var setOpcoes = _opcoes[1];
  var _operacoes = useState([]); var operacoes = _operacoes[0]; var setOperacoes = _operacoes[1];
  var _positions = useState([]); var positions = _positions[0]; var setPositions = _positions[1];
  var _encerradas = useState([]); var encerradas = _encerradas[0]; var setEncerradas = _encerradas[1];
  var _movimentacoes = useState([]); var movimentacoes = _movimentacoes[0]; var setMovimentacoes = _movimentacoes[1];

  var load = async function() {
    if (!user) return;
    var results = await Promise.all([
      getProventos(user.id),
      getOpcoes(user.id),
      getOperacoes(user.id),
      getPositions(user.id),
      getMovimentacoes(user.id, {}),
    ]);
    setProventos(results[0].data || []);
    setOpcoes(results[1].data || []);
    setOperacoes(results[2].data || []);
    setPositions(results[3].data || []);
    setEncerradas(results[3].encerradas || []);
    setMovimentacoes(results[4].data || []);
    setLoading(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Filtered data
  var periodDays = 0;
  PERIODS.forEach(function(p) { if (p.k === period) periodDays = p.days; });

  var filteredProventos = filterByPeriod(proventos, 'data_pagamento', periodDays);
  var filteredOpcoes = periodDays ? filterByPeriod(opcoes, 'data_abertura', periodDays) : opcoes;
  var filteredOperacoes = filterByPeriod(operacoes, 'data', periodDays);
  var filteredMovs = filterByPeriod(movimentacoes, 'data', periodDays);

  // ═══════════ CAIXA DATA ═══════════

  var caixaEntradas = 0;
  var caixaSaidas = 0;
  var caixaByMonth = {};
  var caixaByConta = {};
  var caixaByCategoria = {};

  var CAT_LABELS = {
    deposito: 'Depósito', retirada: 'Retirada', transferencia: 'Transferência',
    compra_ativo: 'Compra ativo', venda_ativo: 'Venda ativo',
    premio_opcao: 'Prêmio opção', recompra_opcao: 'Recompra opção', exercicio_opcao: 'Exercício opção',
    dividendo: 'Dividendo', jcp: 'JCP', rendimento_fii: 'Rendimento FII', rendimento_rf: 'Rendimento RF',
    ajuste_manual: 'Ajuste manual', salario: 'Salário',
    despesa_fixa: 'Despesa fixa', despesa_variavel: 'Despesa variável', outro: 'Outro',
  };

  var CAT_COLORS_MAP = {
    deposito: C.green, retirada: C.red, transferencia: C.accent,
    compra_ativo: C.acoes, venda_ativo: C.green,
    premio_opcao: C.opcoes, recompra_opcao: C.red, exercicio_opcao: C.yellow,
    dividendo: C.fiis, jcp: C.acoes, rendimento_fii: C.fiis, rendimento_rf: C.rf,
    ajuste_manual: C.dim, salario: C.green,
    despesa_fixa: C.red, despesa_variavel: C.yellow, outro: C.dim,
  };

  filteredMovs.forEach(function(m) {
    var val = m.valor || 0;
    var isEntrada = m.tipo === 'entrada';
    var mKey = (m.data || '').substring(0, 7);
    var conta = m.conta || 'Sem conta';
    var cat = m.categoria || 'outro';

    if (isEntrada) caixaEntradas += val; else caixaSaidas += val;

    if (mKey) {
      if (!caixaByMonth[mKey]) caixaByMonth[mKey] = { entradas: 0, saidas: 0, movs: [] };
      if (isEntrada) caixaByMonth[mKey].entradas += val; else caixaByMonth[mKey].saidas += val;
      caixaByMonth[mKey].movs.push(m);
    }

    if (!caixaByConta[conta]) caixaByConta[conta] = { entradas: 0, saidas: 0 };
    if (isEntrada) caixaByConta[conta].entradas += val; else caixaByConta[conta].saidas += val;

    if (!caixaByCategoria[cat]) caixaByCategoria[cat] = 0;
    caixaByCategoria[cat] += val;
  });

  var caixaMonthKeys = Object.keys(caixaByMonth).sort();
  var caixaContaKeys = Object.keys(caixaByConta).sort();
  var caixaCatKeys = Object.keys(caixaByCategoria).sort(function(a, b) {
    return caixaByCategoria[b] - caixaByCategoria[a];
  });
  var caixaCatTotal = 0;
  caixaCatKeys.forEach(function(k) { caixaCatTotal += caixaByCategoria[k]; });

  // ═══════════ DIVIDENDOS DATA ═══════════

  var divTotal = 0;
  var divByTicker = {};
  var divByTipo = {};
  var divByMonth = {};
  var divByCorretora = {};

  // Build por_corretora map: ticker → corretora
  var tickerCorretora = {};
  (positions || []).forEach(function(p) {
    if (p.por_corretora) {
      var corretoras = Object.keys(p.por_corretora);
      if (corretoras.length > 0) {
        tickerCorretora[p.ticker] = corretoras[0];
      }
    }
  });

  filteredProventos.forEach(function(p) {
    var val = p.valor_total || 0;
    var ticker = (p.ticker || '').toUpperCase().trim();
    var tipo = p.tipo_provento || 'dividendo';
    var mKey = (p.data_pagamento || '').substring(0, 7);
    var corretora = tickerCorretora[ticker] || 'Sem corretora';

    divTotal += val;

    if (!divByTicker[ticker]) divByTicker[ticker] = { total: 0, items: [], categoria: '' };
    divByTicker[ticker].total += val;
    divByTicker[ticker].items.push(p);

    // Try to find categoria from positions
    (positions || []).forEach(function(pos) {
      if (pos.ticker === ticker && pos.categoria) {
        divByTicker[ticker].categoria = pos.categoria;
      }
    });

    if (!divByTipo[tipo]) divByTipo[tipo] = 0;
    divByTipo[tipo] += val;

    if (mKey) {
      if (!divByMonth[mKey]) divByMonth[mKey] = 0;
      divByMonth[mKey] += val;
    }

    if (!divByCorretora[corretora]) divByCorretora[corretora] = {};
    if (!divByCorretora[corretora][ticker]) divByCorretora[corretora][ticker] = 0;
    divByCorretora[corretora][ticker] += val;
  });

  var divTickerKeys = Object.keys(divByTicker).sort(function(a, b) {
    return divByTicker[b].total - divByTicker[a].total;
  });
  var divTipoKeys = Object.keys(divByTipo).sort(function(a, b) {
    return divByTipo[b] - divByTipo[a];
  });
  var divMonthKeys = Object.keys(divByMonth).sort();
  var divCorretoraKeys = Object.keys(divByCorretora).sort();

  // ═══════════ OPCOES DATA ═══════════

  var opcPremios = 0;
  var opcRecompras = 0;
  var opcByBase = {};
  var opcByStatus = {};
  var opcByMonth = {};

  filteredOpcoes.forEach(function(op) {
    var base = (op.ativo_base || op.ticker || '').toUpperCase().trim();
    var premioUnit = op.premio || 0;
    var qty = op.quantidade || 0;
    var premioTotal = premioUnit * qty;
    var direcao = op.direcao || 'venda';
    var status = op.status || 'ativa';
    var recompra = 0;

    if (direcao === 'venda' || direcao === 'lancamento') {
      opcPremios += premioTotal;
    }

    if (status === 'fechada' && op.premio_fechamento) {
      recompra = (op.premio_fechamento || 0) * qty;
      opcRecompras += recompra;
    }

    if (!opcByBase[base]) opcByBase[base] = { premios: 0, recompras: 0, items: [] };
    opcByBase[base].premios += premioTotal;
    opcByBase[base].recompras += recompra;
    opcByBase[base].items.push(op);

    if (!opcByStatus[status]) opcByStatus[status] = { count: 0, premio: 0 };
    opcByStatus[status].count += 1;
    opcByStatus[status].premio += premioTotal;

    var mKey = (op.data_abertura || op.created_at || '').substring(0, 7);
    if (mKey) {
      if (!opcByMonth[mKey]) opcByMonth[mKey] = { premios: 0, recompras: 0 };
      opcByMonth[mKey].premios += premioTotal;
      if (status === 'fechada') opcByMonth[mKey].recompras += recompra;
    }
  });

  var opcBaseKeys = Object.keys(opcByBase).sort(function(a, b) {
    return (opcByBase[b].premios - opcByBase[b].recompras) - (opcByBase[a].premios - opcByBase[a].recompras);
  });
  var opcMonthKeys = Object.keys(opcByMonth).sort();

  // ═══════════ OPERACOES DATA ═══════════

  var opsCompras = 0;
  var opsVendas = 0;
  var opsCustos = 0;
  var opsByTicker = {};
  var opsByMonth = {};

  filteredOperacoes.forEach(function(op) {
    var ticker = (op.ticker || '').toUpperCase().trim();
    var total = (op.quantidade || 0) * (op.preco || 0);
    var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);

    if (op.tipo === 'compra') {
      opsCompras += total;
    } else {
      opsVendas += total;
    }
    opsCustos += custos;

    if (!opsByTicker[ticker]) opsByTicker[ticker] = { compras: 0, vendas: 0, qtyCompra: 0, qtyVenda: 0, custos: 0, categoria: op.categoria || 'acao' };
    if (op.tipo === 'compra') {
      opsByTicker[ticker].compras += total;
      opsByTicker[ticker].qtyCompra += op.quantidade || 0;
    } else {
      opsByTicker[ticker].vendas += total;
      opsByTicker[ticker].qtyVenda += op.quantidade || 0;
    }
    opsByTicker[ticker].custos += custos;

    var mKey = (op.data || '').substring(0, 7);
    if (mKey) {
      if (!opsByMonth[mKey]) opsByMonth[mKey] = { compras: 0, vendas: 0 };
      if (op.tipo === 'compra') opsByMonth[mKey].compras += total;
      else opsByMonth[mKey].vendas += total;
    }
  });

  // P&L realizado por ticker (de getPositions)
  var plPorTicker = {};
  var plRealizadoTotal = 0;
  var allPosForPL = positions.concat(encerradas);
  for (var pi = 0; pi < allPosForPL.length; pi++) {
    var pp = allPosForPL[pi];
    if (pp.pl_realizado && pp.total_vendido > 0) {
      plPorTicker[pp.ticker] = {
        pl: pp.pl_realizado,
        receita: pp.receita_vendas || 0,
        custo: pp.custo_compras || 0,
        qtyVendida: pp.total_vendido,
        encerrada: pp.quantidade === 0,
      };
      plRealizadoTotal += pp.pl_realizado;
    }
  }

  // Merge P&L nos opsByTicker
  var plTickers = Object.keys(plPorTicker);
  for (var pti = 0; pti < plTickers.length; pti++) {
    var ptk = plTickers[pti];
    if (opsByTicker[ptk]) {
      opsByTicker[ptk].pl_realizado = plPorTicker[ptk].pl;
      opsByTicker[ptk].encerrada = plPorTicker[ptk].encerrada;
    }
  }

  var opsTickerKeys = Object.keys(opsByTicker).sort(function(a, b) {
    var aTotal = opsByTicker[a].compras + opsByTicker[a].vendas;
    var bTotal = opsByTicker[b].compras + opsByTicker[b].vendas;
    return bTotal - aTotal;
  });
  var opsMonthKeys = Object.keys(opsByMonth).sort();

  // ═══════════ IR DATA ═══════════

  var irMonthResults = computeIR(operacoes);
  var irTaxByMonth = computeTaxByMonth(irMonthResults);
  // Filter by period
  var irFiltered = periodDays ? irTaxByMonth.filter(function(r) {
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    var cutoffStr = cutoff.toISOString().substring(0, 7);
    return r.month >= cutoffStr;
  }) : irTaxByMonth;

  var irTotalDevido = 0;
  var irMesesAlerta = 0;
  irFiltered.forEach(function(r) {
    irTotalDevido += r.impostoTotal;
    if (r.alertaAcoes20k) irMesesAlerta++;
  });
  var lastIR = irFiltered.length > 0 ? irFiltered[irFiltered.length - 1] : null;

  // ═══════════ RENDER ═══════════

  if (loading) return <View style={styles.container}><LoadingScreen /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Relatórios</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Sub-tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
        {SUBS.map(function(s) {
          return (
            <Pill key={s.k} active={sub === s.k} color={C.accent}
              onPress={function() { setSub(s.k); }}>
              {s.l}
            </Pill>
          );
        })}
      </ScrollView>

      {/* Period filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6 }}>
        {PERIODS.map(function(p) {
          var active = period === p.k;
          return (
            <TouchableOpacity key={p.k}
              onPress={function() { setPeriod(p.k); }}
              style={[styles.periodPill, active ? styles.periodPillActive : styles.periodPillInactive]}>
              <Text style={[styles.periodText, active && { color: C.accent }]}>{p.k}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ═══════════ CAIXA TAB ═══════════ */}
      {sub === 'caixa' && (
        <View style={{ gap: SIZE.gap }}>
          {/* Summary */}
          <Glass glow={C.green} padding={16}>
            <View style={styles.resumoRow}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>ENTRADAS</Text>
                <Text style={[styles.resumoVal, { color: C.green }]}>{'R$ ' + fmt(caixaEntradas)}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>SAÍDAS</Text>
                <Text style={[styles.resumoVal, { color: C.red }]}>{'R$ ' + fmt(caixaSaidas)}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>SALDO</Text>
                <Text style={[styles.resumoVal, { color: (caixaEntradas - caixaSaidas) >= 0 ? C.green : C.red }]}>
                  {'R$ ' + fmt(caixaEntradas - caixaSaidas)}
                </Text>
              </View>
            </View>
          </Glass>

          {/* Gráfico Entradas vs Saídas por mês */}
          {caixaMonthKeys.length > 1 && (
            <View>
              <SectionLabel>ENTRADAS VS SAÍDAS</SectionLabel>
              <Glass padding={12}>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Entradas</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red }} />
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Saídas</Text>
                  </View>
                </View>
                <BarChartDual
                  data={caixaMonthKeys.map(function(mk) {
                    return {
                      label: formatMonthLabel(mk),
                      v1: caixaByMonth[mk].entradas,
                      v2: caixaByMonth[mk].saidas,
                    };
                  })}
                  color1={C.green}
                  color2={C.red}
                />
              </Glass>
            </View>
          )}

          {/* Por Categoria */}
          {caixaCatKeys.length > 0 && (
            <View>
              <SectionLabel>POR CATEGORIA</SectionLabel>
              <Glass padding={14}>
                {caixaCatKeys.map(function(cat) {
                  return (
                    <HBarRow key={cat}
                      label={CAT_LABELS[cat] || cat}
                      value={caixaByCategoria[cat]}
                      total={caixaCatTotal}
                      color={CAT_COLORS_MAP[cat] || C.accent}
                    />
                  );
                })}
              </Glass>
            </View>
          )}

          {/* Por Conta */}
          {caixaContaKeys.length > 0 && (
            <View>
              <SectionLabel>POR CONTA</SectionLabel>
              {caixaContaKeys.map(function(conta) {
                var info = caixaByConta[conta];
                var saldo = info.entradas - info.saidas;
                return (
                  <Glass key={conta} padding={0}>
                    <View style={styles.tickerHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tickerName}>{conta}</Text>
                      </View>
                      <Text style={[styles.tickerTotal, { color: saldo >= 0 ? C.green : C.red }]}>
                        {'R$ ' + fmt(saldo)}
                      </Text>
                    </View>
                    <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <Text style={[styles.itemLabel, { color: C.green }]}>Entradas</Text>
                      <Text style={[styles.itemVal, { color: C.green }]}>{'R$ ' + fmt(info.entradas)}</Text>
                    </View>
                    <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <Text style={[styles.itemLabel, { color: C.red }]}>Saídas</Text>
                      <Text style={[styles.itemVal, { color: C.red }]}>{'R$ ' + fmt(info.saidas)}</Text>
                    </View>
                  </Glass>
                );
              })}
            </View>
          )}

          {/* Detalhamento Mensal */}
          <SectionLabel>DETALHAMENTO MENSAL</SectionLabel>
          {caixaMonthKeys.length === 0 && (
            <EmptyState ionicon="wallet-outline" title="Sem movimentações"
              description="Nenhuma movimentação encontrada no período" />
          )}
          {caixaMonthKeys.slice().reverse().map(function(mk) {
            var group = caixaByMonth[mk];
            var saldoMes = group.entradas - group.saidas;
            return (
              <View key={mk}>
                <View style={styles.monthHeader}>
                  <Text style={styles.monthLabel}>{formatMonthLabel(mk)}</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Text style={[styles.monthSub, { color: C.green }]}>{'+' + fmt(group.entradas)}</Text>
                    <Text style={[styles.monthSub, { color: C.red }]}>{'-' + fmt(group.saidas)}</Text>
                    <Text style={[styles.monthSub, { color: saldoMes >= 0 ? C.green : C.red }]}>{'= ' + fmt(saldoMes)}</Text>
                  </View>
                </View>
                <Glass padding={0}>
                  {group.movs.map(function(m, mi) {
                    var isEntrada = m.tipo === 'entrada';
                    var movColor = isEntrada ? C.green : m.tipo === 'transferencia' ? C.accent : C.red;
                    var movIcon = isEntrada ? '↑' : m.tipo === 'transferencia' ? '→' : '↓';
                    return (
                      <View key={m.id || mi}
                        style={[styles.itemRow, mi > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                        <View style={[styles.movIconWrap, { backgroundColor: movColor + '12' }]}>
                          <Text style={[styles.movIconText, { color: movColor }]}>{movIcon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemLabel} numberOfLines={1}>{m.descricao || CAT_LABELS[m.categoria] || m.categoria}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <Text style={styles.itemDate}>{formatDate(m.data)}</Text>
                            <Badge text={m.conta} color={C.dim} />
                            {m.ticker ? <Badge text={m.ticker} color={C.acoes} /> : null}
                          </View>
                        </View>
                        <Text style={[styles.itemVal, { color: movColor }]}>
                          {(isEntrada ? '+' : '-') + 'R$ ' + fmt(m.valor)}
                        </Text>
                      </View>
                    );
                  })}
                </Glass>
              </View>
            );
          })}
        </View>
      )}

      {/* ═══════════ DIVIDENDOS TAB ═══════════ */}
      {sub === 'div' && (
        <View style={{ gap: SIZE.gap }}>
          {/* Summary */}
          <Glass glow={C.fiis} padding={16}>
            <View style={styles.resumoRow}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>TOTAL RECEBIDO</Text>
                <Text style={[styles.resumoVal, { color: C.green }]}>{'R$ ' + fmt(divTotal)}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>PROVENTOS</Text>
                <Text style={styles.resumoVal}>{filteredProventos.length}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>ATIVOS</Text>
                <Text style={styles.resumoVal}>{divTickerKeys.length}</Text>
              </View>
            </View>
          </Glass>

          {/* Evolução Mensal */}
          {divMonthKeys.length > 1 && (
            <View>
              <SectionLabel>EVOLUÇÃO MENSAL</SectionLabel>
              <Glass padding={12}>
                <BarChartSingle
                  data={divMonthKeys.map(function(mk) {
                    return { label: formatMonthLabel(mk), value: divByMonth[mk] };
                  })}
                  color={C.fiis}
                />
              </Glass>
            </View>
          )}

          {/* Por Tipo */}
          {divTipoKeys.length > 0 && (
            <View>
              <SectionLabel>POR TIPO</SectionLabel>
              <Glass padding={14}>
                {divTipoKeys.map(function(tipo) {
                  return (
                    <HBarRow key={tipo}
                      label={tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                      value={divByTipo[tipo]}
                      total={divTotal}
                      color={TIPO_COLORS[tipo] || C.accent}
                    />
                  );
                })}
              </Glass>
            </View>
          )}

          {/* Por Ativo */}
          <SectionLabel right={'R$ ' + fmt(divTotal)}>POR ATIVO</SectionLabel>
          {divTickerKeys.length === 0 && (
            <EmptyState ionicon="cash-outline" title="Sem proventos"
              description="Nenhum provento encontrado no período selecionado" />
          )}
          {divTickerKeys.map(function(ticker) {
            var info = divByTicker[ticker];
            var catBadge = info.categoria || 'acao';
            var catColor = catBadge === 'fii' ? C.fiis : catBadge === 'etf' ? C.etfs : catBadge === 'stock_int' ? C.stock_int : C.acoes;
            return (
              <Glass key={ticker} padding={0}>
                <View style={[styles.tickerHeader, { borderLeftWidth: 3, borderLeftColor: catColor }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.tickerName}>{ticker}</Text>
                      <Badge text={catBadge.toUpperCase()} color={catColor} />
                    </View>
                    <Text style={styles.tickerCount}>{info.items.length + ' proventos'}</Text>
                  </View>
                  <Text style={[styles.tickerTotal, { color: C.green }]}>{'R$ ' + fmt(info.total)}</Text>
                </View>
                {info.items.slice(0, 10).map(function(p, pi) {
                  return (
                    <View key={p.id || pi}
                      style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Badge text={p.tipo_provento || 'dividendo'} color={TIPO_COLORS[p.tipo_provento] || C.fiis} />
                          <Text style={styles.itemDate}>{formatDate(p.data_pagamento)}</Text>
                        </View>
                        <Text style={styles.itemDetail}>
                          {fmt(p.valor_por_cota || 0) + ' × ' + (p.quantidade || 0) + ' cotas'}
                        </Text>
                      </View>
                      <Text style={[styles.itemVal, { color: C.green }]}>{'R$ ' + fmt(p.valor_total)}</Text>
                    </View>
                  );
                })}
                {info.items.length > 10 && (
                  <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border, justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>
                      {'+ ' + (info.items.length - 10) + ' proventos'}
                    </Text>
                  </View>
                )}
              </Glass>
            );
          })}

          {/* Por Corretora */}
          {divCorretoraKeys.length > 0 && (
            <View>
              <SectionLabel>POR CORRETORA</SectionLabel>
              {divCorretoraKeys.map(function(corr) {
                var tickers = divByCorretora[corr];
                var tickerList = Object.keys(tickers).sort(function(a, b) {
                  return tickers[b] - tickers[a];
                });
                var corrTotal = 0;
                tickerList.forEach(function(t) { corrTotal += tickers[t]; });
                return (
                  <Glass key={corr} padding={0}>
                    <View style={styles.tickerHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.tickerName}>{corr}</Text>
                        <Text style={styles.tickerCount}>{tickerList.length + ' ativos'}</Text>
                      </View>
                      <Text style={[styles.tickerTotal, { color: C.green }]}>{'R$ ' + fmt(corrTotal)}</Text>
                    </View>
                    {tickerList.map(function(t, ti) {
                      return (
                        <View key={t}
                          style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <Text style={styles.itemLabel}>{t}</Text>
                          <Text style={[styles.itemVal, { color: C.green }]}>{'R$ ' + fmt(tickers[t])}</Text>
                        </View>
                      );
                    })}
                  </Glass>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* ═══════════ OPÇÕES TAB ═══════════ */}
      {sub === 'opc' && (
        <View style={{ gap: SIZE.gap }}>
          {/* Summary */}
          <Glass glow={C.opcoes} padding={16}>
            <View style={styles.resumoRow}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>PRÊMIOS</Text>
                <Text style={[styles.resumoVal, { color: C.green }]}>{'R$ ' + fmt(opcPremios)}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>RECOMPRAS</Text>
                <Text style={[styles.resumoVal, { color: C.red }]}>{'R$ ' + fmt(opcRecompras)}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>RESULTADO</Text>
                <Text style={[styles.resumoVal, { color: (opcPremios - opcRecompras) >= 0 ? C.green : C.red }]}>
                  {'R$ ' + fmt(opcPremios - opcRecompras)}
                </Text>
              </View>
            </View>
          </Glass>

          {/* Por Status */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['ativa', 'fechada', 'exercida', 'expirou_po'].map(function(st) {
              var info = opcByStatus[st] || { count: 0, premio: 0 };
              var label = st === 'expirou_po' ? 'Expirou PÓ' : st.charAt(0).toUpperCase() + st.slice(1);
              return (
                <Glass key={st} padding={10} style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9, color: STATUS_COLORS[st] || C.dim, fontFamily: F.mono, textAlign: 'center' }}>
                    {label.toUpperCase()}
                  </Text>
                  <Text style={{ fontSize: 18, color: C.text, fontFamily: F.mono, fontWeight: '700', textAlign: 'center', marginTop: 2 }}>
                    {info.count}
                  </Text>
                  <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono, textAlign: 'center', marginTop: 2 }}>
                    {'R$ ' + fmt(info.premio)}
                  </Text>
                </Glass>
              );
            })}
          </View>

          {/* Evolução Mensal */}
          {opcMonthKeys.length > 1 && (
            <View>
              <SectionLabel>EVOLUÇÃO MENSAL</SectionLabel>
              <Glass padding={12}>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Prêmios</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red }} />
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Recompras</Text>
                  </View>
                </View>
                <BarChartDual
                  data={opcMonthKeys.map(function(mk) {
                    return {
                      label: formatMonthLabel(mk),
                      v1: opcByMonth[mk].premios,
                      v2: opcByMonth[mk].recompras,
                    };
                  })}
                  color1={C.green}
                  color2={C.red}
                />
              </Glass>
            </View>
          )}

          {/* Por Ativo Base */}
          <SectionLabel right={'R$ ' + fmt(opcPremios - opcRecompras)}>POR ATIVO BASE</SectionLabel>
          {opcBaseKeys.length === 0 && (
            <EmptyState ionicon="trending-up-outline" title="Sem opções"
              description="Nenhuma opção encontrada no período selecionado" />
          )}
          {opcBaseKeys.map(function(base) {
            var info = opcByBase[base];
            var resultado = info.premios - info.recompras;
            return (
              <Glass key={base} padding={0}>
                <View style={[styles.tickerHeader, { borderLeftWidth: 3, borderLeftColor: C.opcoes }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tickerName}>{base}</Text>
                    <Text style={styles.tickerCount}>{info.items.length + ' opções'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.tickerTotal, { color: resultado >= 0 ? C.green : C.red }]}>
                      {'R$ ' + fmt(resultado)}
                    </Text>
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>
                      {'P: ' + fmt(info.premios) + ' | R: ' + fmt(info.recompras)}
                    </Text>
                  </View>
                </View>
                {info.items.slice(0, 8).map(function(op, oi) {
                  var premioTotal = (op.premio || 0) * (op.quantidade || 0);
                  var recompraTotal = op.status === 'fechada' ? (op.premio_fechamento || 0) * (op.quantidade || 0) : 0;
                  var pl = premioTotal - recompraTotal;
                  return (
                    <View key={op.id || oi}
                      style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Badge text={op.tipo === 'call' ? 'CALL' : 'PUT'} color={op.tipo === 'call' ? C.acoes : C.red} />
                          <Text style={styles.itemLabel}>{op.ticker_opcao || ''}</Text>
                          <Badge text={op.status || 'ativa'} color={STATUS_COLORS[op.status] || C.dim} />
                        </View>
                        <Text style={styles.itemDetail}>
                          {'Strike ' + fmt(op.strike) + ' × ' + (op.quantidade || 0) + ' | Prêmio ' + fmt(op.premio)}
                        </Text>
                      </View>
                      <Text style={[styles.itemVal, { color: pl >= 0 ? C.green : C.red }]}>
                        {(pl >= 0 ? '+' : '') + 'R$ ' + fmt(pl)}
                      </Text>
                    </View>
                  );
                })}
                {info.items.length > 8 && (
                  <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border, justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>
                      {'+ ' + (info.items.length - 8) + ' opções'}
                    </Text>
                  </View>
                )}
              </Glass>
            );
          })}
        </View>
      )}

      {/* ═══════════ OPERAÇÕES TAB ═══════════ */}
      {sub === 'ops' && (
        <View style={{ gap: SIZE.gap }}>
          {/* Summary */}
          <Glass glow={C.acoes} padding={16}>
            <View style={styles.resumoRow}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>COMPRAS</Text>
                <Text style={[styles.resumoVal, { color: C.acoes }]}>{'R$ ' + fmt(opsCompras)}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>VENDAS</Text>
                <Text style={[styles.resumoVal, { color: C.green }]}>{'R$ ' + fmt(opsVendas)}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>CUSTOS</Text>
                <Text style={[styles.resumoVal, { color: C.yellow }]}>{'R$ ' + fmt(opsCustos)}</Text>
              </View>
            </View>
            {plRealizadoTotal !== 0 ? (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.resumoLabel}>P&L REALIZADO</Text>
                    <InfoTip text="Resultado real das vendas, usando o preço médio de cada corretora. Se comprou a R$20 na Clear e vendeu a R$22 na Clear, o lucro é R$2/ação — mesmo que o PM geral seja diferente." size={12} />
                  </View>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>PM por corretora</Text>
                </View>
                <Text style={[styles.resumoVal, { color: plRealizadoTotal >= 0 ? C.green : C.red }]}>
                  {plRealizadoTotal >= 0 ? '+' : ''}{'R$ ' + fmt(plRealizadoTotal)}
                </Text>
              </View>
            ) : null}
          </Glass>

          {/* Evolução Mensal */}
          {opsMonthKeys.length > 1 && (
            <View>
              <SectionLabel>EVOLUÇÃO MENSAL</SectionLabel>
              <Glass padding={12}>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.acoes }} />
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Compras</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.green }} />
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Vendas</Text>
                  </View>
                </View>
                <BarChartDual
                  data={opsMonthKeys.map(function(mk) {
                    return {
                      label: formatMonthLabel(mk),
                      v1: opsByMonth[mk].compras,
                      v2: opsByMonth[mk].vendas,
                    };
                  })}
                  color1={C.acoes}
                  color2={C.green}
                />
              </Glass>
            </View>
          )}

          {/* Por Ativo */}
          <SectionLabel right={filteredOperacoes.length + ' operações'}>POR ATIVO</SectionLabel>
          {opsTickerKeys.length === 0 && (
            <EmptyState ionicon="swap-horizontal-outline" title="Sem operações"
              description="Nenhuma operação encontrada no período selecionado" />
          )}
          {opsTickerKeys.map(function(ticker) {
            var info = opsByTicker[ticker];
            var catColor = info.categoria === 'fii' ? C.fiis : info.categoria === 'etf' ? C.etfs : info.categoria === 'stock_int' ? C.stock_int : C.acoes;
            var pmCompra = info.qtyCompra > 0 ? info.compras / info.qtyCompra : 0;
            var pmVenda = info.qtyVenda > 0 ? info.vendas / info.qtyVenda : 0;
            return (
              <Glass key={ticker} padding={0}>
                <View style={[styles.tickerHeader, { borderLeftWidth: 3, borderLeftColor: catColor }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.tickerName}>{ticker}</Text>
                      <Badge text={info.categoria.toUpperCase()} color={catColor} />
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                    {'Custos: R$ ' + fmt(info.custos)}
                  </Text>
                </View>
                <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: C.acoes }]}>Compras</Text>
                    <Text style={styles.itemDetail}>
                      {info.qtyCompra + ' un. × PM R$ ' + fmt(pmCompra)}
                    </Text>
                  </View>
                  <Text style={[styles.itemVal, { color: C.acoes }]}>{'R$ ' + fmt(info.compras)}</Text>
                </View>
                {info.qtyVenda > 0 && (
                  <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemLabel, { color: C.green }]}>Vendas</Text>
                      <Text style={styles.itemDetail}>
                        {info.qtyVenda + ' un. × PM R$ ' + fmt(pmVenda)}
                      </Text>
                    </View>
                    <Text style={[styles.itemVal, { color: C.green }]}>{'R$ ' + fmt(info.vendas)}</Text>
                  </View>
                )}
                {info.pl_realizado != null && (
                  <View style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border,
                    backgroundColor: info.pl_realizado >= 0 ? C.green + '08' : C.red + '08' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemLabel, { color: info.pl_realizado >= 0 ? C.green : C.red, fontWeight: '700' }]}>
                        {info.pl_realizado >= 0 ? 'Lucro realizado' : 'Prejuízo realizado'}
                      </Text>
                      {info.encerrada ? (
                        <Text style={[styles.itemDetail, { color: C.dim }]}>Posição encerrada</Text>
                      ) : (
                        <Text style={[styles.itemDetail, { color: C.dim }]}>Vendas parciais</Text>
                      )}
                    </View>
                    <Text style={[styles.itemVal, { color: info.pl_realizado >= 0 ? C.green : C.red, fontWeight: '700', fontSize: 14 }]}>
                      {info.pl_realizado >= 0 ? '+' : ''}{'R$ ' + fmt(info.pl_realizado)}
                    </Text>
                  </View>
                )}
              </Glass>
            );
          })}
        </View>
      )}

      {/* ═══════════ IR TAB ═══════════ */}
      {sub === 'ir' && (
        <View style={{ gap: SIZE.gap }}>
          {/* Summary */}
          <Glass glow={C.yellow} padding={16}>
            <View style={styles.resumoRow}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>IR DEVIDO</Text>
                <Text style={[styles.resumoVal, { color: irTotalDevido > 0 ? C.red : C.green }]}>
                  {'R$ ' + fmt(irTotalDevido)}
                </Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>MESES</Text>
                <Text style={styles.resumoVal}>{irFiltered.length}</Text>
              </View>
              <View style={styles.resumoDivider} />
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.resumoLabel}>ALERTAS {'>'}20K</Text>
                <Text style={[styles.resumoVal, { color: irMesesAlerta > 0 ? C.yellow : C.green }]}>
                  {irMesesAlerta}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border,
              flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <InfoTip text="O cálculo de IR usa o preço médio geral do ativo (todas as corretoras juntas), conforme exigido pela Receita Federal. Ações com vendas até R$20 mil/mês são isentas. Alíquotas: ações 15%, FIIs 20%, ETFs 15%, stocks internacionais 15% (sem isenção de R$20k). Prejuízos acumulados são compensados nos meses seguintes." size={12} />
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, flex: 1 }}>
                IR calculado com PM geral (Receita Federal). O P&L em Operações usa PM por corretora.
              </Text>
            </View>
          </Glass>

          {/* Prejuízo acumulado */}
          {lastIR && (lastIR.prejAcumAcoes > 0 || lastIR.prejAcumFII > 0 || lastIR.prejAcumETF > 0 || lastIR.prejAcumStockInt > 0) && (
            <Glass padding={14}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 }}>
                PREJUÍZO ACUMULADO
              </Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {lastIR.prejAcumAcoes > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Ações</Text>
                    <Text style={{ fontSize: 13, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>
                      {'R$ ' + fmt(lastIR.prejAcumAcoes)}
                    </Text>
                  </View>
                )}
                {lastIR.prejAcumFII > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>FIIs</Text>
                    <Text style={{ fontSize: 13, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>
                      {'R$ ' + fmt(lastIR.prejAcumFII)}
                    </Text>
                  </View>
                )}
                {lastIR.prejAcumETF > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>ETFs</Text>
                    <Text style={{ fontSize: 13, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>
                      {'R$ ' + fmt(lastIR.prejAcumETF)}
                    </Text>
                  </View>
                )}
                {lastIR.prejAcumStockInt > 0 && (
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono }}>Stocks INT</Text>
                    <Text style={{ fontSize: 13, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>
                      {'R$ ' + fmt(lastIR.prejAcumStockInt)}
                    </Text>
                  </View>
                )}
              </View>
            </Glass>
          )}

          {/* Por Mês */}
          <SectionLabel>DETALHAMENTO MENSAL</SectionLabel>
          {irFiltered.length === 0 && (
            <EmptyState ionicon="calculator-outline" title="Sem vendas"
              description="Nenhuma venda de ativo encontrada no período" />
          )}
          {irFiltered.slice().reverse().map(function(r) {
            var hasImposto = r.impostoTotal > 0;
            return (
              <Glass key={r.month} padding={0}>
                <View style={styles.tickerHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.tickerName}>{formatMonthLabel(r.month)}</Text>
                    {hasImposto && <Badge text="DARF" color={C.red} />}
                    {r.alertaAcoes20k && <Badge text={'>20K'} color={C.yellow} />}
                  </View>
                  <Text style={[styles.tickerTotal, { color: hasImposto ? C.red : C.green }]}>
                    {hasImposto ? 'IR R$ ' + fmt(r.impostoTotal) : 'Isento'}
                  </Text>
                </View>

                {/* Ações */}
                {(r.vendasAcoes > 0 || r.ganhoAcoes > 0 || r.perdaAcoes > 0) && (
                  <View style={[styles.irClassRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <Text style={[styles.irClassLabel, { color: C.acoes }]}>Ações</Text>
                    <View style={styles.irClassDetail}>
                      <Text style={styles.irText}>{'Vendas: R$ ' + fmt(r.vendasAcoes)}</Text>
                      {r.ganhoAcoes > 0 && <Text style={[styles.irText, { color: C.green }]}>{'Ganho: R$ ' + fmt(r.ganhoAcoes)}</Text>}
                      {r.perdaAcoes > 0 && <Text style={[styles.irText, { color: C.red }]}>{'Perda: R$ ' + fmt(r.perdaAcoes)}</Text>}
                      {r.impostoAcoes > 0 && <Text style={[styles.irText, { color: C.red, fontWeight: '700' }]}>{'IR 15%: R$ ' + fmt(r.impostoAcoes)}</Text>}
                      {r.vendasAcoes <= 20000 && r.vendasAcoes > 0 && <Text style={[styles.irText, { color: C.green }]}>{'Isento (vendas ≤ R$20k)'}</Text>}
                    </View>
                  </View>
                )}

                {/* FIIs */}
                {(r.vendasFII > 0 || r.ganhoFII > 0 || r.perdaFII > 0) && (
                  <View style={[styles.irClassRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <Text style={[styles.irClassLabel, { color: C.fiis }]}>FIIs</Text>
                    <View style={styles.irClassDetail}>
                      <Text style={styles.irText}>{'Vendas: R$ ' + fmt(r.vendasFII)}</Text>
                      {r.ganhoFII > 0 && <Text style={[styles.irText, { color: C.green }]}>{'Ganho: R$ ' + fmt(r.ganhoFII)}</Text>}
                      {r.perdaFII > 0 && <Text style={[styles.irText, { color: C.red }]}>{'Perda: R$ ' + fmt(r.perdaFII)}</Text>}
                      {r.impostoFII > 0 && <Text style={[styles.irText, { color: C.red, fontWeight: '700' }]}>{'IR 20%: R$ ' + fmt(r.impostoFII)}</Text>}
                    </View>
                  </View>
                )}

                {/* ETFs */}
                {(r.vendasETF > 0 || r.ganhoETF > 0 || r.perdaETF > 0) && (
                  <View style={[styles.irClassRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <Text style={[styles.irClassLabel, { color: C.etfs }]}>ETFs</Text>
                    <View style={styles.irClassDetail}>
                      <Text style={styles.irText}>{'Vendas: R$ ' + fmt(r.vendasETF)}</Text>
                      {r.ganhoETF > 0 && <Text style={[styles.irText, { color: C.green }]}>{'Ganho: R$ ' + fmt(r.ganhoETF)}</Text>}
                      {r.perdaETF > 0 && <Text style={[styles.irText, { color: C.red }]}>{'Perda: R$ ' + fmt(r.perdaETF)}</Text>}
                      {r.impostoETF > 0 && <Text style={[styles.irText, { color: C.red, fontWeight: '700' }]}>{'IR 15%: R$ ' + fmt(r.impostoETF)}</Text>}
                    </View>
                  </View>
                )}

                {/* Stocks Internacionais */}
                {(r.vendasStockInt > 0 || r.ganhoStockInt > 0 || r.perdaStockInt > 0) && (
                  <View style={[styles.irClassRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <Text style={[styles.irClassLabel, { color: C.stock_int }]}>Stocks INT</Text>
                    <View style={styles.irClassDetail}>
                      <Text style={styles.irText}>{'Vendas: R$ ' + fmt(r.vendasStockInt)}</Text>
                      {r.ganhoStockInt > 0 && <Text style={[styles.irText, { color: C.green }]}>{'Ganho: R$ ' + fmt(r.ganhoStockInt)}</Text>}
                      {r.perdaStockInt > 0 && <Text style={[styles.irText, { color: C.red }]}>{'Perda: R$ ' + fmt(r.perdaStockInt)}</Text>}
                      {r.impostoStockInt > 0 && <Text style={[styles.irText, { color: C.red, fontWeight: '700' }]}>{'IR 15%: R$ ' + fmt(r.impostoStockInt)}</Text>}
                    </View>
                  </View>
                )}
              </Glass>
            );
          })}
        </View>
      )}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

// ═══════════ STYLES ═══════════

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: SIZE.gap },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },

  periodPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  periodPillActive: { backgroundColor: C.accent + '20', borderColor: C.accent + '50' },
  periodPillInactive: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' },
  periodText: { fontSize: 11, color: C.dim, fontFamily: F.mono, fontWeight: '600' },

  resumoRow: { flexDirection: 'row', alignItems: 'center' },
  resumoDivider: { width: 1, height: 30, backgroundColor: C.border },
  resumoLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoVal: { fontSize: 14, fontWeight: '700', fontFamily: F.mono, marginTop: 2, color: C.text },

  tickerHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, gap: 10 },
  tickerName: { fontSize: 14, fontWeight: '800', color: C.text, fontFamily: F.display },
  tickerCount: { fontSize: 10, color: C.sub, fontFamily: F.mono, marginTop: 2 },
  tickerTotal: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, gap: 8 },
  itemLabel: { fontSize: 12, color: C.text, fontFamily: F.body, fontWeight: '600' },
  itemDate: { fontSize: 10, color: C.sub, fontFamily: F.mono },
  itemDetail: { fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 },
  itemVal: { fontSize: 12, fontWeight: '700', fontFamily: F.mono },

  hbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  hbarLeft: { width: 90, flexDirection: 'row', alignItems: 'center', gap: 6 },
  hbarLabel: { fontSize: 11, color: C.text, fontFamily: F.body, flex: 1 },
  hbarPct: { fontSize: 10, fontFamily: F.mono, fontWeight: '600' },
  hbarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)' },
  hbarFill: { height: 6, borderRadius: 3 },
  hbarVal: { fontSize: 10, color: C.sub, fontFamily: F.mono, width: 70, textAlign: 'right' },

  irClassRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 14, gap: 10 },
  irClassLabel: { fontSize: 11, fontWeight: '700', fontFamily: F.body, width: 40 },
  irClassDetail: { flex: 1, gap: 2 },
  irText: { fontSize: 10, color: C.sub, fontFamily: F.mono },

  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  monthLabel: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  monthSub: { fontSize: 10, fontFamily: F.mono, fontWeight: '600' },
  movIconWrap: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  movIconText: { fontSize: 14, fontWeight: '700' },
});
