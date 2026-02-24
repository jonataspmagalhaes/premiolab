import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboard } from '../../services/database';
import { Glass, Badge, InfoTip } from '../../components';
import { EmptyState } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import Sensitive from '../../components/Sensitive';

var P = {
  acao: { color: PRODUCT_COLORS.acao || C.acoes },
  fii: { color: PRODUCT_COLORS.fii || C.fiis },
  etf: { color: PRODUCT_COLORS.etf || C.etfs },
  opcao: { color: PRODUCT_COLORS.opcao || C.opcoes },
  stock_int: { color: PRODUCT_COLORS.stock_int || '#E879F9' },
  rf: { color: C.rf },
};

var TIPO_LABELS = {
  dividendo: 'DIV',
  jcp: 'JCP',
  rendimento: 'REND',
  rendimento_fii: 'REND',
  juros_rf: 'JUROS',
  amortizacao: 'AMORT',
  bonificacao: 'BONIF',
};

function fmt(v) {
  if (v == null || isNaN(v)) return 'R$ 0,00';
  var n = Number(v);
  var sign = n < 0 ? '-' : '';
  var abs = Math.abs(n);
  return sign + 'R$ ' + abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(v) {
  if (v == null || isNaN(v)) return '0,00';
  var n = Number(v);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Aggregate proventos by ticker
function aggregateProventos(detalhe) {
  var byTicker = {};
  for (var i = 0; i < detalhe.length; i++) {
    var item = detalhe[i];
    var tk = item.ticker || '?';
    if (!byTicker[tk]) {
      byTicker[tk] = { ticker: tk, valor: 0, tipo: item.tipo, count: 0, recebido: 0, aReceber: 0 };
    }
    byTicker[tk].valor += item.valor;
    byTicker[tk].count += 1;
    if (item.recebido) {
      byTicker[tk].recebido += item.valor;
    } else {
      byTicker[tk].aReceber += item.valor;
    }
  }
  var result = [];
  var keys = Object.keys(byTicker);
  for (var k = 0; k < keys.length; k++) {
    result.push(byTicker[keys[k]]);
  }
  result.sort(function(a, b) { return b.valor - a.valor; });
  return result;
}

// Aggregate options by ativo_base
function aggregateOpcoes(detalhe) {
  var byTicker = {};
  for (var i = 0; i < detalhe.length; i++) {
    var item = detalhe[i];
    var tk = item.ticker || '?';
    if (!byTicker[tk]) {
      byTicker[tk] = { ticker: tk, valor: 0, opcoes: [] };
    }
    byTicker[tk].valor += item.valor;
    byTicker[tk].opcoes.push(item);
  }
  var result = [];
  var keys = Object.keys(byTicker);
  for (var k = 0; k < keys.length; k++) {
    result.push(byTicker[keys[k]]);
  }
  result.sort(function(a, b) { return b.valor - a.valor; });
  return result;
}

export default function RendaResumoView(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;
  var ps = usePrivacyStyle();

  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _data = useState(null); var data = _data[0]; var setData = _data[1];

  var load = async function() {
    if (!user) return;
    try {
      var result = await getDashboard(user.id);
      setData(result);
    } catch (e) {
      console.warn('RendaResumo load:', e);
    }
    setLoading(false);
  };

  useFocusEffect(useCallback(function() {
    setLoading(true);
    load();
  }, [user && user.id]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.sub, fontFamily: F.body }}>Carregando...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState ionicon="cash-outline" title="Sem dados"
          description="Registre operações para ver sua renda." color={C.accent} />
      </View>
    );
  }

  // Data
  var rendaTotalMes = data.rendaTotalMes || 0;
  var rendaTotalMesAnterior = data.rendaTotalMesAnterior || 0;
  var plMes = data.plMes || 0;
  var plMedia3m = data.plMedia3m || 0;
  var dividendosMes = data.dividendosMes || 0;
  var dividendosCatMes = data.dividendosCatMes || { acao: 0, fii: 0, etf: 0, stock_int: 0 };
  var dividendosRecebidosMes = data.dividendosRecebidosMes || 0;
  var dividendosAReceberMes = data.dividendosAReceberMes || 0;
  var rfRendaMensal = data.rfRendaMensal || 0;
  var meta = data.meta || 6000;
  var rendaMediaAnual = data.rendaMediaAnual || 0;
  var rentabilidadeMes = data.rentabilidadeMes || 0;
  var premiosMes = data.premiosMes || 0;
  var recompraMes = data.recompraMes || 0;
  var dyCarteira = data.dyCarteira || 0;

  // Detail data
  var proventosMesDetalhe = data.proventosMesDetalhe || [];
  var premiosMesDetalhe = data.premiosMesDetalhe || [];
  var recompraMesDetalhe = data.recompraMesDetalhe || [];

  // Aggregations
  var provAgrupados = aggregateProventos(proventosMesDetalhe);
  var premAgrupados = aggregateOpcoes(premiosMesDetalhe);
  var recAgrupados = aggregateOpcoes(recompraMesDetalhe);

  var hasDetalhe = provAgrupados.length > 0 || premAgrupados.length > 0 || recAgrupados.length > 0 || rfRendaMensal > 0;

  var metaPct = meta > 0 ? Math.min((rendaTotalMes / meta) * 100, 150) : 0;

  var rendaCompare = '';
  if (rendaTotalMesAnterior > 0) {
    var rendaChangePct = ((rendaTotalMes - rendaTotalMesAnterior) / Math.abs(rendaTotalMesAnterior)) * 100;
    rendaCompare = (rendaChangePct > 0 ? '+' : '') + rendaChangePct.toFixed(0) + '% vs ant.';
  }
  var rendaBetter = rendaTotalMes >= rendaTotalMesAnterior;

  return (
    <ScrollView
      style={st.container}
      contentContainerStyle={st.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
    >
      {/* RENDA DO MÊS */}
      <Glass glow="rgba(108,92,231,0.10)" padding={SIZE.padding}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Text style={st.sectionTitle}>RENDA DO MÊS</Text>
          <InfoTip
            title="Renda do Mês"
            text="P&L de opções (prêmios - recompras) + dividendos/JCP + juros RF no mês. Opções mostra o P&L líquido, podendo ser negativo em meses com recompra."
          />
        </View>

        {/* Total + comparação */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 30, fontWeight: '800', color: rendaTotalMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.display }, ps]}>
            {fmt(rendaTotalMes)}
          </Text>
          {rendaCompare ? (
            <View style={{
              backgroundColor: (rendaBetter ? '#22c55e' : '#ef4444') + '15',
              borderWidth: 1,
              borderColor: (rendaBetter ? '#22c55e' : '#ef4444') + '30',
              borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
            }}>
              <Text style={[{ fontSize: 11, fontWeight: '700', color: rendaBetter ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                {rendaCompare}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Breakdown por tipo */}
        <View style={{ gap: 8, marginBottom: 14 }}>
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: P.opcao.color }]} />
              <Text style={st.bText}>P&L Opções</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: plMes >= 0 ? '#22c55e' : '#ef4444' }, ps]}>
              {fmt(plMes)}
            </Text>
          </View>
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: P.acao.color }]} />
              <Text style={st.bText}>Dividendos Ações</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: dividendosCatMes.acao > 0 ? '#22c55e' : C.dim }, ps]}>
              {fmt(dividendosCatMes.acao)}
            </Text>
          </View>
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: P.fii.color }]} />
              <Text style={st.bText}>Rendimentos FIIs</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: dividendosCatMes.fii > 0 ? '#22c55e' : C.dim }, ps]}>
              {fmt(dividendosCatMes.fii)}
            </Text>
          </View>
          {dividendosCatMes.etf > 0 ? (
            <View style={st.bRow}>
              <View style={st.bLabel}>
                <View style={[st.dot, { backgroundColor: P.etf.color }]} />
                <Text style={st.bText}>Dividendos ETFs</Text>
              </View>
              <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: '#22c55e' }, ps]}>
                {fmt(dividendosCatMes.etf)}
              </Text>
            </View>
          ) : null}
          {dividendosCatMes.stock_int > 0 ? (
            <View style={st.bRow}>
              <View style={st.bLabel}>
                <View style={[st.dot, { backgroundColor: P.stock_int.color }]} />
                <Text style={st.bText}>Dividendos Stocks</Text>
              </View>
              <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: '#22c55e' }, ps]}>
                {fmt(dividendosCatMes.stock_int)}
              </Text>
            </View>
          ) : null}
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: C.rf }]} />
              <Text style={st.bText}>Renda Fixa</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: rfRendaMensal > 0 ? '#22c55e' : C.dim }, ps]}>
              {fmt(rfRendaMensal)}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />

        {/* META MENSAL */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, fontWeight: '600', marginBottom: 6 }}>
              META MENSAL
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[{ fontSize: 18, fontWeight: '800', color: C.accent, fontFamily: F.display }, ps]}>
                {fmt(rendaTotalMes)}
              </Text>
              <Text style={[{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: F.display, marginLeft: 4 }, ps]}>
                / {fmt(meta)}
              </Text>
            </View>
            {(plMes !== 0 || dividendosMes > 0 || rfRendaMensal > 0) ? (
              <Text style={[{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono, marginTop: 3 }, ps]}>
                {'P&L Opções ' + fmt(plMes) + ' + Div ' + fmt(dividendosMes) + ' + RF ' + fmt(rfRendaMensal)}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 14, color: rendaMediaAnual >= meta ? '#22c55e' : 'rgba(255,255,255,0.45)', fontFamily: F.mono, fontWeight: '700' }, ps]}>
                {'Média ' + new Date().getFullYear() + ': ' + fmt(rendaMediaAnual) + '/mês'}
              </Text>
              <InfoTip
                title="Média Anual"
                text="Média calculada com base nos meses completos do ano. O mês atual (incompleto) não entra no denominador para não distorcer o resultado."
              />
            </View>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[{
              fontSize: 26, fontWeight: '800', fontFamily: F.mono,
              color: metaPct >= 100 ? '#22c55e' : metaPct >= 50 ? '#f59e0b' : C.accent,
            }, ps]}>{metaPct.toFixed(0) + '%'}</Text>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, letterSpacing: 0.5, marginTop: 2 }}>DA META</Text>
          </View>
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.03)', marginTop: 10, overflow: 'hidden' }}>
          <LinearGradient
            colors={[C.accent, metaPct >= 100 ? '#22c55e' : '#f59e0b']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: 5, borderRadius: 3, width: Math.min(metaPct, 100) + '%' }}
          />
        </View>
        {metaPct < 100 && metaPct > 0 ? (
          <Text style={[{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, textAlign: 'right', marginTop: 5 }, ps]}>
            {'Faltam ' + fmt(meta - rendaTotalMes)}
          </Text>
        ) : null}
      </Glass>

      {/* DETALHAMENTO DO MÊS */}
      {hasDetalhe ? (
        <Glass padding={SIZE.padding}>
          <Text style={[st.sectionTitle, { marginBottom: 14 }]}>DETALHAMENTO DO MÊS</Text>

          {/* PROVENTOS por ticker */}
          {provAgrupados.length > 0 ? (
            <View style={{ marginBottom: premAgrupados.length > 0 || recAgrupados.length > 0 || rfRendaMensal > 0 ? 16 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={st.subTitle}>PROVENTOS</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={[{ fontSize: 12, color: '#22c55e', fontFamily: F.mono, fontWeight: '600' }, ps]}>
                    {'Receb. ' + fmt(dividendosRecebidosMes)}
                  </Text>
                  {dividendosAReceberMes > 0 ? (
                    <Text style={[{ fontSize: 12, color: C.yellow, fontFamily: F.mono, fontWeight: '600' }, ps]}>
                      {'A receber ' + fmt(dividendosAReceberMes)}
                    </Text>
                  ) : null}
                </View>
              </View>
              {provAgrupados.map(function(item, idx) {
                var tipoLabel = TIPO_LABELS[item.tipo] || (item.tipo || 'DIV').toUpperCase();
                var tipoColor = item.tipo === 'rendimento' || item.tipo === 'rendimento_fii' ? P.fii.color
                  : item.tipo === 'jcp' ? P.acao.color
                  : item.tipo === 'dividendo' ? P.acao.color
                  : C.accent;
                return (
                  <View key={item.ticker + '_' + idx} style={[st.detalheRow, idx > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Text style={st.detalheTicker}>{item.ticker}</Text>
                      <Badge text={tipoLabel} color={tipoColor} />
                      {item.count > 1 ? (
                        <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{'x' + item.count}</Text>
                      ) : null}
                      {item.aReceber > 0 ? (
                        <View style={{ backgroundColor: C.yellow + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.mono, fontWeight: '700' }}>PENDENTE</Text>
                        </View>
                      ) : null}
                    </View>
                    <Sensitive>
                      <Text maxFontSizeMultiplier={1.5} style={[st.detalheVal, { color: '#22c55e' }]}>
                        {'+R$ ' + fmtShort(item.valor)}
                      </Text>
                    </Sensitive>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* OPÇÕES - PRÊMIOS por ticker */}
          {premAgrupados.length > 0 ? (
            <View style={{ marginBottom: recAgrupados.length > 0 || rfRendaMensal > 0 ? 16 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={st.subTitle}>OPÇÕES — PRÊMIOS</Text>
                <Sensitive>
                  <Text style={[{ fontSize: 12, color: '#22c55e', fontFamily: F.mono, fontWeight: '600' }]}>
                    {'Total ' + fmt(premiosMes)}
                  </Text>
                </Sensitive>
              </View>
              {premAgrupados.map(function(group, gIdx) {
                return (
                  <View key={'prem_' + group.ticker + '_' + gIdx}>
                    {group.opcoes.map(function(item, idx) {
                      var globalIdx = gIdx * 100 + idx;
                      return (
                        <View key={'po_' + globalIdx} style={[st.detalheRow, (gIdx > 0 || idx > 0) && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={st.detalheTicker}>{item.ticker}</Text>
                            <Badge text={item.tipo_opcao} color={P.opcao.color} />
                            {item.ticker_opcao ? (
                              <Text style={{ fontSize: 11, color: P.opcao.color, fontFamily: F.mono }}>{item.ticker_opcao}</Text>
                            ) : null}
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{item.quantidade + ' opts'}</Text>
                          </View>
                          <Sensitive>
                            <Text maxFontSizeMultiplier={1.5} style={[st.detalheVal, { color: '#22c55e' }]}>
                              {'+R$ ' + fmtShort(item.valor)}
                            </Text>
                          </Sensitive>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* OPÇÕES - RECOMPRAS por ticker */}
          {recAgrupados.length > 0 ? (
            <View style={{ marginBottom: rfRendaMensal > 0 ? 16 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={st.subTitle}>OPÇÕES — RECOMPRAS</Text>
                <Sensitive>
                  <Text style={[{ fontSize: 12, color: '#ef4444', fontFamily: F.mono, fontWeight: '600' }]}>
                    {'Total -R$ ' + fmtShort(recompraMes)}
                  </Text>
                </Sensitive>
              </View>
              {recAgrupados.map(function(group, gIdx) {
                return (
                  <View key={'rec_' + group.ticker + '_' + gIdx}>
                    {group.opcoes.map(function(item, idx) {
                      var globalIdx = gIdx * 100 + idx;
                      return (
                        <View key={'ro_' + globalIdx} style={[st.detalheRow, (gIdx > 0 || idx > 0) && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={st.detalheTicker}>{item.ticker}</Text>
                            <Badge text={item.tipo_opcao} color={'#ef4444'} />
                            {item.ticker_opcao ? (
                              <Text style={{ fontSize: 11, color: '#ef4444', fontFamily: F.mono }}>{item.ticker_opcao}</Text>
                            ) : null}
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{item.quantidade + ' opts'}</Text>
                          </View>
                          <Sensitive>
                            <Text maxFontSizeMultiplier={1.5} style={[st.detalheVal, { color: '#ef4444' }]}>
                              {'-R$ ' + fmtShort(item.valor)}
                            </Text>
                          </Sensitive>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* RENDA FIXA */}
          {rfRendaMensal > 0 ? (
            <View>
              <Text style={[st.subTitle, { marginBottom: 10 }]}>RENDA FIXA</Text>
              <View style={st.detalheRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={st.detalheTicker}>Juros estimados</Text>
                  <Badge text="RF" color={C.rf} />
                </View>
                <Sensitive>
                  <Text maxFontSizeMultiplier={1.5} style={[st.detalheVal, { color: '#22c55e' }]}>
                    {'+R$ ' + fmtShort(rfRendaMensal)}
                  </Text>
                </Sensitive>
              </View>
            </View>
          ) : null}
        </Glass>
      ) : null}

      {/* KPIs */}
      <Glass padding={SIZE.padding}>
        <Text style={[st.sectionTitle, { marginBottom: 12 }]}>
          RESUMO
        </Text>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>P&L OPÇÕES 3M</Text>
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 16, fontWeight: '800', color: plMedia3m >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
              {fmt(plMedia3m)}
            </Text>
            <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono, marginTop: 2 }}>média/mês</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }}>
              <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono }}>DY CARTEIRA</Text>
              <InfoTip
                title="Dividend Yield"
                text="DY = (Proventos recebidos nos últimos 12 meses / Valor de mercado da carteira de ações, FIIs e ETFs) × 100. Inclui dividendos, JCP e rendimentos. Quanto maior, mais a carteira gera renda passiva em relação ao capital investido."
                size={12}
              />
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 16, fontWeight: '800', color: dyCarteira > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }, ps]}>
              {dyCarteira.toFixed(2) + '%'}
            </Text>
            <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono, marginTop: 2 }}>últimos 12m</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>MÉDIA MENSAL</Text>
            <Text maxFontSizeMultiplier={1.5} numberOfLines={1} adjustsFontSizeToFit style={[{ fontSize: 16, fontWeight: '800', color: rendaMediaAnual > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }, ps]}>
              {fmt(rendaMediaAnual)}
            </Text>
            <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.mono, marginTop: 2 }}>{'em ' + new Date().getFullYear()}</Text>
          </View>
        </View>
      </Glass>

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: SIZE.gap },
  sectionTitle: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' },
  subTitle: { fontSize: 11, color: 'rgba(255,255,255,0.30)', fontFamily: F.mono, letterSpacing: 1, fontWeight: '600' },
  bRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bText: { fontSize: 12, color: C.sub, fontFamily: F.body },
  bVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
  detalheRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  detalheTicker: { fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display },
  detalheVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
});
