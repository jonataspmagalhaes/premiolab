import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { animateLayout } from '../../utils/a11y';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { addOperacao, incrementCorretora, getIndicators, addMovimentacaoComSaldo, buildMovDescricao, getPositions, getPortfolios } from '../../services/database';
import { runDailyCalculation } from '../../services/indicatorService';
import { fetchExchangeRates } from '../../services/currencyService';
import { Glass, Pill, Badge, TickerInput, CorretoraSelector, getInstitutionMeta } from '../../components';
import { searchTickers } from '../../services/tickerSearchService';
import * as Haptics from 'expo-haptics';
var fractional = require('../../utils/fractional');
var isFractionable = fractional.isFractionable;
var sanitizeQtyInput = fractional.sanitizeQtyInput;
var decMul = fractional.decMul;
var formatQty = fractional.formatQty;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt4(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function maskDate(text) {
  var clean = text.replace(/[^0-9]/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean.slice(0, 2) + '/' + clean.slice(2, 4) + '/' + clean.slice(4, 8);
}

function brToIso(br) {
  var parts = br.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function todayBr() {
  var now = new Date();
  var d = String(now.getDate()).padStart(2, '0');
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var y = now.getFullYear();
  return d + '/' + m + '/' + y;
}

var CATEGORIAS = [
  { key: 'acao', label: 'Ação', color: C.acoes, mercado: 'BR' },
  { key: 'fii', label: 'FII', color: C.fiis, mercado: 'BR' },
  { key: 'etf', label: 'ETF BR', color: C.etfs, mercado: 'BR' },
  { key: 'bdr', label: 'BDR', color: C.bdr, mercado: 'BR' },
  { key: 'stock_int', label: 'Stocks', color: C.stock_int, mercado: 'INT' },
  { key: 'adr', label: 'ADR', color: C.adr, mercado: 'INT' },
  { key: 'reit', label: 'REIT', color: C.reit, mercado: 'INT' },
  { key: 'etf_int', label: 'ETF INT', color: C.etfs, mercado: 'INT' },
];


function isIntCategoria(cat) {
  return cat === 'stock_int' || cat === 'etf_int' || cat === 'adr' || cat === 'reit';
}

function getRealCategoria(cat) {
  if (cat === 'etf_int') return 'etf';
  return cat;
}

function getRealMercado(cat) {
  if (cat === 'stock_int' || cat === 'etf_int' || cat === 'adr' || cat === 'reit') return 'INT';
  return 'BR';
}

export default function AddOperacaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var params = (route && route.params) ? route.params : {};
  var user = useAuth().user;

  var _tipo = useState(params.tipo || 'compra'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _cat = useState(params.categoria || 'acao'); var categoria = _cat[0]; var setCategoria = _cat[1];
  var _ticker = useState(params.ticker || ''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _qtd = useState(''); var quantidade = _qtd[0]; var setQuantidade = _qtd[1];
  var _preco = useState(''); var preco = _preco[0]; var setPreco = _preco[1];
  var _corretora = useState(''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _corretoraMeta = useState(null); var corretoraMeta = _corretoraMeta[0]; var setCorretoraMeta = _corretoraMeta[1];
  var _corretagem = useState(''); var corretagem = _corretagem[0]; var setCorretagem = _corretagem[1];
  var _emolumentos = useState(''); var emolumentos = _emolumentos[0]; var setEmolumentos = _emolumentos[1];
  var _impostos = useState(''); var impostos = _impostos[0]; var setImpostos = _impostos[1];
  var _data = useState(todayBr()); var data = _data[0]; var setData = _data[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _showCustos = useState(false); var showCustos = _showCustos[0]; var setShowCustos = _showCustos[1];
  var _usdRate = useState(null); var usdRate = _usdRate[0]; var setUsdRate = _usdRate[1];
  var _portfolios = useState([]); var portfolios = _portfolios[0]; var setPortfoliosState = _portfolios[1];
  var _selPortfolioId = useState(params.portfolioId || null); var selPortfolioId = _selPortfolioId[0]; var setSelPortfolioId = _selPortfolioId[1];

  var isInt = isIntCategoria(categoria);
  var moedaSymbol = isInt ? 'US$' : 'R$';

  // Buscar cambio ao selecionar categoria internacional
  useEffect(function() {
    if (isInt && !usdRate) {
      fetchExchangeRates(['USD']).then(function(rates) {
        if (rates && rates.USD) setUsdRate(rates.USD);
      }).catch(function() {});
    }
  }, [categoria]);

  // Buscar portfolios do usuario (useFocusEffect para atualizar ao voltar de ConfigPortfolios)
  useFocusEffect(useCallback(function() {
    if (!user) return;
    getPortfolios(user.id).then(function(res) {
      setPortfoliosState(res.data || []);
    }).catch(function() {});
  }, [user]));

  var qty = parseFloat(quantidade) || 0;
  var prc = parseFloat(preco) || 0;
  var total = decMul(qty, prc);
  var custCorretagem = parseFloat(corretagem) || 0;
  var custEmolumentos = parseFloat(emolumentos) || 0;
  var custImpostos = parseFloat(impostos) || 0;
  var totalCustos = custCorretagem + custEmolumentos + custImpostos;

  // PM com custos: para compra, soma custos ao total; para venda, subtrai
  var custoTotal = tipo === 'compra' ? total + totalCustos : total - totalCustos;
  var pmComCustos = qty > 0 ? (tipo === 'compra' ? (total + totalCustos) / qty : (total - totalCustos) / qty) : 0;

  var realCatForValidation = getRealCategoria(categoria);
  var realMercadoForValidation = getRealMercado(categoria);
  var qtyFracError = qty > 0 && !isFractionable(realCatForValidation, realMercadoForValidation) && qty !== Math.floor(qty);

  var minTickerLen = isInt ? 1 : 4;
  var canSubmit = ticker.length >= minTickerLen && qty > 0 && prc > 0 && corretora && data.length === 10 && !qtyFracError;

  var tickerValid = ticker.length >= minTickerLen;
  var tickerError = ticker.length > 0 && ticker.length < minTickerLen;
  var qtyValid = qty > 0 && !qtyFracError;
  var qtyError = quantidade.length > 0 && qty <= 0;
  var prcValid = prc > 0;
  var prcError = preco.length > 0 && prc <= 0;
  var dateValid = data.length === 10 && brToIso(data) !== null;
  var dateError = data.length === 10 && brToIso(data) === null;

  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];
  var _tickers = useState([]); var tickers = _tickers[0]; var setTickers = _tickers[1];

  useEffect(function() {
    if (!user) return;
    getPositions(user.id).then(function(result) {
      var list = result.data || [];
      var names = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].ticker) names.push(list[i].ticker.toUpperCase());
      }
      setTickers(names);
    });
  }, [user]);

  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (submitted) return;
      if (!quantidade && !preco) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, submitted, quantidade, preco]);

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setLoading(true);
    try {
      var realCat = getRealCategoria(categoria);
      var realMercado = getRealMercado(categoria);
      var opPayload = {
        ticker: ticker.toUpperCase(),
        tipo: tipo,
        categoria: realCat,
        mercado: realMercado,
        quantidade: parseFloat(quantidade),
        preco: parseFloat(preco),
        custo_corretagem: custCorretagem,
        custo_emolumentos: custEmolumentos,
        custo_impostos: custImpostos,
        corretora: corretora,
        data: brToIso(data),
        taxa_cambio: realMercado === 'INT' ? (usdRate || null) : null,
      };
      if (selPortfolioId) {
        opPayload.portfolio_id = selPortfolioId;
      }
      var result = await addOperacao(user.id, opPayload);
      if (result.error) {
        Alert.alert('Erro', result.error.message);
        setSubmitted(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await incrementCorretora(user.id, corretora);
        // Trigger indicadores na primeira operacao
        getIndicators(user.id).then(function(indRes) {
          var indData = (indRes && indRes.data) || [];
          if (indData.length === 0) {
            runDailyCalculation(user.id).catch(function(e) {
              console.warn('First op indicator calc failed:', e);
            });
          }
        }).catch(function(e) {
          console.warn('First op indicator check failed:', e);
        });

        // Checar se portfolio tem operacoes_contas desabilitado
        var portOpContas = true;
        if (selPortfolioId) {
          for (var pci = 0; pci < portfolios.length; pci++) {
            if (portfolios[pci].id === selPortfolioId && portfolios[pci].operacoes_contas === false) {
              portOpContas = false;
              break;
            }
          }
        }

        // Oferecer atualizar saldo na conta
        var opTotal = tipo === 'compra' ? custoTotal : custoTotal;
        var opTipo = tipo === 'compra' ? 'saida' : 'entrada';
        var opCat = tipo === 'compra' ? 'compra_ativo' : 'venda_ativo';
        var opDescLabel = tipo === 'compra' ? 'Compra' : 'Venda';
        var opDesc = opDescLabel + ' ' + ticker.toUpperCase() + ' x' + formatQty(qty);
        if (realMercado === 'INT') {
          opDesc = opDesc + ' (US$)';
        }
        // Para movimentacao de saldo, mostra em moeda original
        var opSymbol = realMercado === 'INT' ? 'US$' : 'R$';
        var contaMoeda = (corretoraMeta && corretoraMeta.moeda) || (realMercado === 'INT' ? 'USD' : 'BRL');

        var resetFields = function() {
          setTicker('');
          setQuantidade('');
          setPreco('');
          setCorretagem('');
          setEmolumentos('');
          setImpostos('');
          setShowCustos(false);
          setData(todayBr());
          setSubmitted(false);
        };

        if (!portOpContas) {
          // Portfolio com operacoes de conta desabilitadas — nao perguntar sobre saldo
          Alert.alert('Sucesso!', 'Operação registrada.', [
            { text: 'Adicionar outra', onPress: resetFields },
            { text: 'Concluir', onPress: function() { navigation.goBack(); } },
          ]);
        } else {
        Alert.alert(
          'Operação registrada!',
          'Atualizar saldo em ' + corretora + ' (' + contaMoeda + ')? (' + (tipo === 'compra' ? '-' : '+') + opSymbol + ' ' + fmt(opTotal) + ')',
          [
            {
              text: 'Não',
              style: 'cancel',
              onPress: function() {
                Alert.alert('Sucesso!', 'Operação registrada.', [
                  { text: 'Adicionar outra', onPress: resetFields },
                  { text: 'Concluir', onPress: function() { navigation.goBack(); } },
                ]);
              },
            },
            {
              text: 'Sim, atualizar',
              onPress: function() {
                addMovimentacaoComSaldo(user.id, {
                  conta: corretora,
                  moeda: contaMoeda,
                  tipo: opTipo,
                  categoria: opCat,
                  valor: opTotal,
                  descricao: opDesc,
                  ticker: ticker.toUpperCase(),
                  referencia_tipo: 'operacao',
                  data: brToIso(data) || new Date().toISOString().substring(0, 10),
                }).catch(function(e) { console.warn('Mov saldo failed:', e); });
                Alert.alert('Sucesso!', 'Operação + saldo atualizados.', [
                  { text: 'Adicionar outra', onPress: resetFields },
                  { text: 'Concluir', onPress: function() { navigation.goBack(); } },
                ]);
              },
            },
          ]
        );
        }
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
      setSubmitted(false);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar" accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nova Operação</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Compra / Venda */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={function() { setTipo('compra'); }}
          style={[styles.toggleBtn, tipo === 'compra' && { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'compra' ? C.green : C.dim }}>COMPRA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={function() { setTipo('venda'); }}
          style={[styles.toggleBtn, tipo === 'venda' && { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'venda' ? C.red : C.dim }}>VENDA</Text>
        </TouchableOpacity>
      </View>

      {/* Categoria */}
      <Text style={styles.label}>TIPO DE ATIVO</Text>
      <View style={styles.pillRow}>
        {CATEGORIAS.map(function(cat) {
          return (
            <Pill key={cat.key} active={categoria === cat.key} color={cat.color} onPress={function() {
              var wasInt = isIntCategoria(categoria);
              var nowInt = isIntCategoria(cat.key);
              setCategoria(cat.key);
              if (wasInt !== nowInt) { setCorretora(''); setTicker(''); }
            }}>
              {cat.label}
            </Pill>
          );
        })}
      </View>

      {/* Ticker */}
      <Text style={styles.label}>TICKER *</Text>
      <TickerInput
        value={ticker}
        onChangeText={setTicker}
        tickers={tickers}
        autoFocus={true}
        returnKeyType="next"
        onSearch={function(query) { return searchTickers(query, getRealMercado(categoria)); }}
        onSuggestionSelect={function(item) {
          if (!item || !isIntCategoria(categoria)) return;
          if (item.type === 'ETF' && categoria !== 'etf_int') {
            setCategoria('etf_int');
          } else if (item.type === 'EQUITY' && categoria === 'etf_int') {
            setCategoria('stock_int');
          }
        }}
        style={[styles.input,
          tickerValid && { borderColor: C.green },
          tickerError && { borderColor: C.red },
        ]}
      />
      {tickerError ? (
        <Text style={styles.fieldError}>{isInt ? 'Informe o ticker' : 'Mínimo 4 caracteres'}</Text>
      ) : null}

      {/* Qtd + Preço */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>QUANTIDADE *</Text>
          <TextInput value={quantidade} onChangeText={function(t) { setQuantidade(sanitizeQtyInput(t, realCatForValidation, realMercadoForValidation)); }} placeholder={isInt ? '0.5' : '100'} placeholderTextColor={C.dim} keyboardType={isInt ? 'decimal-pad' : 'numeric'}
            style={[styles.input,
              qtyValid && { borderColor: C.green },
              (qtyError || qtyFracError) && { borderColor: C.red },
            ]} />
          {qtyError ? (
            <Text style={styles.fieldError}>Deve ser maior que 0</Text>
          ) : null}
          {qtyFracError ? (
            <Text style={styles.fieldError}>Este ativo não aceita frações</Text>
          ) : null}
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{'PREÇO (' + moedaSymbol + ') *'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isInt ? <Text style={{ fontSize: 14, fontFamily: F.mono, color: C.accent, marginRight: 6 }}>US$</Text> : null}
            <TextInput value={preco} onChangeText={setPreco} placeholder={isInt ? '45.00' : '34.50'} placeholderTextColor={C.dim} keyboardType="decimal-pad"
              style={[styles.input, { flex: 1 },
                prcValid && { borderColor: C.green },
                prcError && { borderColor: C.red },
              ]} />
          </View>
          {prcError ? (
            <Text style={styles.fieldError}>Deve ser maior que 0</Text>
          ) : null}
        </View>
      </View>

      {/* Data */}
      <Text style={styles.label}>DATA *</Text>
      <TextInput
        value={data}
        onChangeText={function(t) { setData(maskDate(t)); }}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={C.dim}
        keyboardType="numeric"
        maxLength={10}
        style={[styles.input,
          dateValid && { borderColor: C.green },
          dateError && { borderColor: C.red },
        ]}
      />
      {dateError ? (
        <Text style={styles.fieldError}>Data inválida</Text>
      ) : null}

      {/* Custos expandíveis */}
      <TouchableOpacity onPress={function() { animateLayout(); setShowCustos(!showCustos); }} style={styles.custoToggle}>
        <Text style={styles.custoToggleText}>{showCustos ? '▾ Custos operacionais' : '▸ Custos operacionais (opcional)'}</Text>
        {totalCustos > 0 && (
          <Badge text={moedaSymbol + ' ' + fmt(totalCustos)} color={C.yellow} />
        )}
      </TouchableOpacity>

      {showCustos && (
        <Glass padding={12}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CORRETAGEM</Text>
              <TextInput value={corretagem} onChangeText={setCorretagem} placeholder="0.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>EMOLUMENTOS</Text>
              <TextInput value={emolumentos} onChangeText={setEmolumentos} placeholder="0.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>IMPOSTOS</Text>
              <TextInput value={impostos} onChangeText={setImpostos} placeholder="0.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" returnKeyType="done" style={styles.input} />
            </View>
          </View>
        </Glass>
      )}

      {/* Resumo */}
      {total > 0 && (
        <Glass glow={tipo === 'compra' ? C.green : C.red} padding={14}>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>TOTAL DA OPERAÇÃO</Text>
            <Text style={[styles.resumoValue, { color: tipo === 'compra' ? C.green : C.red }]}>
              {moedaSymbol + ' ' + fmt(total)}
            </Text>
          </View>
          {isInt && usdRate ? (
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>EQUIVALENTE</Text>
              <Text style={[styles.resumoSmall, { color: C.sub }]}>{'≈ R$ ' + fmt(total * usdRate) + ' (US$ 1 = R$ ' + fmt(usdRate) + ')'}</Text>
            </View>
          ) : null}
          {totalCustos > 0 && (
            <View>
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>CUSTOS TOTAIS</Text>
                <Text style={[styles.resumoSmall, { color: C.yellow }]}>{moedaSymbol + ' ' + fmt(totalCustos)}</Text>
              </View>
              <View style={[styles.divider]} />
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>{tipo === 'compra' ? 'CUSTO TOTAL C/ TAXAS' : 'RECEITA LÍQUIDA'}</Text>
                <Text style={[styles.resumoValue, { color: tipo === 'compra' ? C.green : C.red }]}>
                  {moedaSymbol + ' ' + fmt(custoTotal)}
                </Text>
              </View>
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>{tipo === 'compra' ? 'PM COM CUSTOS' : 'PREÇO LÍQ. P/ AÇÃO'}</Text>
                <Text style={styles.resumoPM}>{moedaSymbol + ' ' + fmt4(pmComCustos)}</Text>
              </View>
            </View>
          )}
          {totalCustos === 0 && qty > 0 && (
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>PM</Text>
              <Text style={styles.resumoPM}>{moedaSymbol + ' ' + fmt4(prc)}</Text>
            </View>
          )}
        </Glass>
      )}

      {/* Corretora */}
      <CorretoraSelector value={corretora} onSelect={function(name, meta) { setCorretora(name); setCorretoraMeta(meta); }} userId={user.id} mercado={isInt ? 'INT' : 'BR'} color={isInt ? C.stock_int : C.acoes} label="CORRETORA *" />

      {/* Portfolio — so exibe se usuario tem portfolios customizados */}
      {portfolios.length > 0 ? (
        <View>
          <Text style={styles.label}>PORTFÓLIO</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            <Pill active={!selPortfolioId} color={C.accent} onPress={function() { setSelPortfolioId(null); }}>Padrão</Pill>
            {portfolios.map(function(pf) {
              return (
                <Pill key={pf.id} active={selPortfolioId === pf.id} color={pf.cor || C.accent} onPress={function() { setSelPortfolioId(pf.id); }}>
                  {pf.nome}
                </Pill>
              );
            })}
            {portfolios.length < 4 ? (
              <Pill active={false} color={C.dim} onPress={function() { navigation.navigate('ConfigPortfolios'); }}>+ Novo</Pill>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Submit */}
      <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} activeOpacity={0.8} style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
        accessibilityRole="button" accessibilityLabel={tipo === 'compra' ? 'Registrar Compra' : 'Registrar Venda'}>
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>{tipo === 'compra' ? 'Registrar Compra' : 'Registrar Venda'}</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 4 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  row: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.cardSolid },
  custoToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  custoToggleText: { fontSize: 11, color: C.sub, fontFamily: F.body },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  resumoLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display },
  resumoSmall: { fontSize: 12, fontWeight: '600', fontFamily: F.mono },
  resumoPM: { fontSize: 14, fontWeight: '700', color: C.accent, fontFamily: F.mono },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 6 },
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
