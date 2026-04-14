// ═══════════════════════════════════════════════════════════
// Widget Bridge — sincroniza dados entre app e widgets nativos
// iOS: NSUserDefaults (App Group) via expo-modules
// Android: SharedPreferences via react-native-android-widget
// ═══════════════════════════════════════════════════════════

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

var oplabModule = null;
try {
  oplabModule = require('./oplabService');
} catch (e) {}

var SharedGroupPreferences = null;
try {
  SharedGroupPreferences = require('react-native-shared-group-preferences');
  if (SharedGroupPreferences && SharedGroupPreferences.default) {
    SharedGroupPreferences = SharedGroupPreferences.default;
  }
} catch (e) {
  // Module not linked — widget bridge will use AsyncStorage only
}

var APP_GROUP = 'group.com.premiotrader.app.data';

var WIDGET_DATA_KEY = '@premiolab_widget_data';

// ── Helpers ──────────────────────────────────────────────────

function buildCartaoLabel(cartao) {
  if (!cartao) return '';
  return (cartao.apelido || (cartao.bandeira || '').toUpperCase() + ' ••' + (cartao.ultimos_digitos || ''));
}

function buildWidgetPayload(cartao, faturaTotal, limite, vencimento, moeda, presets, cartoesArr) {
  var presetsArr = [];
  for (var i = 0; i < Math.min((presets || []).length, 4); i++) {
    var p = presets[i];
    presetsArr.push({
      id: p.id,
      label: p.label || 'Gasto',
      valor: p.valor || 0,
      icone: p.icone || 'card-outline',
      cartao_id: p.cartao_id || null,
      meio_pagamento: p.meio_pagamento || 'credito',
      conta: p.conta || null,
    });
  }

  return {
    cartao: {
      id: cartao ? (cartao.id || null) : null,
      label: buildCartaoLabel(cartao),
      fatura_total: faturaTotal || 0,
      limite: limite || 0,
      vencimento: vencimento || '',
      moeda: moeda || 'BRL',
    },
    cartoes: cartoesArr || [],
    presets: presetsArr,
    updated_at: new Date().toISOString(),
  };
}

function parseLocalDate(str) {
  if (!str) return new Date(0);
  var parts = str.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2] || '1'));
}

// ── Storage ──────────────────────────────────────────────────

var appGroupAvailable = null; // null = not tested, true/false after first try

async function saveToAppGroup(key, jsonStr) {
  if (Platform.OS !== 'ios' || !SharedGroupPreferences) return;
  if (appGroupAvailable === false) return;
  try {
    await SharedGroupPreferences.setItem(key, jsonStr, APP_GROUP);
    appGroupAvailable = true;
  } catch (e) {
    if (appGroupAvailable === null) {
      appGroupAvailable = false;
      // Silently skip — App Group not available (Expo Go)
    }
  }
}

async function saveWidgetData(data) {
  try {
    var json = JSON.stringify(data);
    await AsyncStorage.setItem(WIDGET_DATA_KEY, json);
    await saveToAppGroup('widgetData', json);

    // Android: requestWidgetUpdate para forçar refresh
    if (Platform.OS === 'android') {
      try {
        var rw = require('react-native-android-widget');
        if (rw && rw.requestWidgetUpdate) {
          rw.requestWidgetUpdate({ widgetName: 'QuickExpenseWidget' });
        }
      } catch (e) {
        // Não tem android widget instalado
      }
    }
  } catch (e) {
    // Silencioso — widget é best-effort
  }
}

async function getWidgetData() {
  try {
    var json = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (json) return JSON.parse(json);
    return null;
  } catch (e) {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────

async function updateWidgetData(cartao, faturaTotal, limite, vencimento, moeda, presets) {
  var payload = buildWidgetPayload(cartao, faturaTotal, limite, vencimento, moeda, presets);
  await saveWidgetData(payload);
  return payload;
}

async function buildCartoesArray(userId, cartoes, database) {
  var now = new Date();
  var mes = now.getMonth() + 1;
  var ano = now.getFullYear();
  var arr = [];
  var maxCards = Math.min(cartoes.length, 3);
  for (var ci = 0; ci < maxCards; ci++) {
    var c = cartoes[ci];
    var ft = 0;
    var vc = '';
    try {
      var fr = await database.getFatura(userId, c.id, mes, ano);
      ft = (fr && fr.data && fr.data.total) || 0;
      vc = (fr && fr.data && fr.data.vencimento) || '';
    } catch (e) {}
    arr.push({
      id: c.id || null,
      label: buildCartaoLabel(c),
      fatura_total: ft,
      limite: c.limite || 0,
      vencimento: vc,
      moeda: c.moeda || 'BRL',
    });
  }
  return arr;
}

async function updateWidgetFromContext(userId, database, currencyService) {
  try {
    var getCartoes = database.getCartoes;
    var getGastosRapidos = database.getGastosRapidos;

    var cartoesRes = await getCartoes(userId);
    var cartoes = (cartoesRes && cartoesRes.data) || [];

    // Prioritize cartão principal from profile
    var cartao = null;
    var getProfile = database.getProfile;
    var profileRes = await getProfile(userId);
    var principalId = profileRes && profileRes.data && profileRes.data.cartao_principal;
    if (principalId) {
      for (var cpi = 0; cpi < cartoes.length; cpi++) {
        if (cartoes[cpi].id === principalId) { cartao = cartoes[cpi]; break; }
      }
    }
    if (!cartao && cartoes.length > 0) cartao = cartoes[0];

    var cartoesArr = await buildCartoesArray(userId, cartoes, database);

    var faturaTotal = cartoesArr.length > 0 ? cartoesArr[0].fatura_total : 0;
    var vencimento = cartoesArr.length > 0 ? cartoesArr[0].vencimento : '';

    var presetsRes = await getGastosRapidos(userId);
    var presets = (presetsRes && presetsRes.data) || [];

    var payload = buildWidgetPayload(
      cartao,
      faturaTotal,
      cartao ? (cartao.limite || 0) : 0,
      vencimento,
      cartao ? (cartao.moeda || 'BRL') : 'BRL',
      presets,
      cartoesArr
    );
    await saveWidgetData(payload);
  } catch (e) {
    // Silencioso — widget é best-effort
  }
}

// ── Vencimentos helpers ─────────────────────────────────────

function calcMoneyness(tipo, strike, spot) {
  if (!spot || spot <= 0 || !strike || strike <= 0) return { label: null, distPct: null };
  var diff = ((spot - strike) / strike) * 100;
  if (Math.abs(diff) < 1) return { label: 'ATM', distPct: Math.round(diff * 100) / 100 };
  var tipoUp = (tipo || 'CALL').toUpperCase();
  if (tipoUp === 'CALL') {
    return { label: spot > strike ? 'ITM' : 'OTM', distPct: Math.round(diff * 100) / 100 };
  }
  return { label: spot < strike ? 'ITM' : 'OTM', distPct: Math.round(diff * 100) / 100 };
}

function getMarketPrice(optData, isVenda) {
  if (!optData) return null;
  var bid = Number(optData.bid) || 0;
  var ask = Number(optData.ask) || 0;
  var close = Number(optData.close) || 0;
  if (isVenda) return ask > 0 ? ask : bid > 0 ? bid : close > 0 ? close : null;
  return bid > 0 ? bid : ask > 0 ? ask : close > 0 ? close : null;
}

function withTimeout(promise, ms) {
  return new Promise(function(resolve) {
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; resolve(null); }
    }, ms);
    promise.then(function(result) {
      if (!done) { done = true; clearTimeout(timer); resolve(result); }
    }).catch(function() {
      if (!done) { done = true; clearTimeout(timer); resolve(null); }
    });
  });
}

// ── Unified Widget Sync ─────────────────────────────────────
// Builds payload for ALL 5 widgets from pre-loaded dashboard data
// Each widget slice is saved as its own UserDefaults key for robust decoding

async function updateAllWidgetsFromDashboard(userId, dashResult, database, currencyService) {
  try {
    var now = new Date();

    // ── QuickExpense slice (needs extra queries) ──
    try {
      var cartoesRes = await database.getCartoes(userId, '__null__');
      var cartoes = (cartoesRes && cartoesRes.data) || [];
      var cartao = cartoes.length > 0 ? cartoes[0] : null;

      var cartoesArr = await buildCartoesArray(userId, cartoes, database);

      var faturaTotal = cartoesArr.length > 0 ? cartoesArr[0].fatura_total : 0;
      var vencimento = cartoesArr.length > 0 ? cartoesArr[0].vencimento : '';

      var presetsRes = await database.getGastosRapidos(userId);
      var presets = (presetsRes && presetsRes.data) || [];

      var qePayload = buildWidgetPayload(cartao, faturaTotal, cartao ? (cartao.limite || 0) : 0, vencimento, cartao ? (cartao.moeda || 'BRL') : 'BRL', presets, cartoesArr);
      // Keep legacy key for backward compat
      await saveWidgetData(qePayload);
    } catch (e) {
      console.warn('Widget bridge: QuickExpense slice failed', e);
    }

    // ── Patrimonio slice ──
    try {
      var patrimonioSlice = {
        total: Number(dashResult.patrimonio) || 0,
        rentabilidadeMes: Number(dashResult.rentabilidadeMes) || 0,
        history: [],
      };
      var hist = dashResult.patrimonioHistory || [];
      var histStart = hist.length > 30 ? hist.length - 30 : 0;
      for (var hi = histStart; hi < hist.length; hi++) {
        var hp = hist[hi];
        if (hp && hp.date && Number(hp.value) > 0) {
          patrimonioSlice.history.push({
            d: String(hp.date),
            v: Number(hp.value),
          });
        }
      }
      await saveToAppGroup('patrimonioData', JSON.stringify(patrimonioSlice));
    } catch (e) {
      console.warn('Widget bridge: patrimonio slice failed', e);
    }

    // ── Heatmap slice ──
    try {
      var heatmapSlice = { positions: [] };
      var positions = dashResult.positions || [];
      var posWithValor = [];
      for (var pi = 0; pi < positions.length; pi++) {
        var pos = positions[pi];
        if (!pos || !pos.ticker) continue;
        var valor = (Number(pos.preco_atual) || Number(pos.preco_medio) || 0) * (Number(pos.quantidade) || 0);
        posWithValor.push({
          ticker: String(pos.ticker),
          change: Number(pos.change_day) || 0,
          valor: valor,
        });
      }
      posWithValor.sort(function(a, b) { return b.valor - a.valor; });
      for (var hi2 = 0; hi2 < Math.min(posWithValor.length, 8); hi2++) {
        heatmapSlice.positions.push(posWithValor[hi2]);
      }
      await saveToAppGroup('heatmapData', JSON.stringify(heatmapSlice));
    } catch (e) {
      console.warn('Widget bridge: heatmap slice failed', e);
    }

    // ── Vencimentos slice (enriched with spot, moneyness, OpLab market data, P&L) ──
    try {
      var vencimentosSlice = { opcoes: [] };
      var opsData = dashResult.opsAtivasData || [];
      var opsSorted = [];
      for (var oi = 0; oi < opsData.length; oi++) {
        opsSorted.push(opsData[oi]);
      }
      opsSorted.sort(function(a, b) {
        var da = a.vencimento || '9999-12-31';
        var db = b.vencimento || '9999-12-31';
        return da < db ? -1 : da > db ? 1 : 0;
      });

      // Group combined operations (same base+strike+type+vencimento+direcao)
      var opsGrouped = [];
      var groupMap = {};
      for (var gi = 0; gi < opsSorted.length; gi++) {
        var gop = opsSorted[gi];
        var gBase = String(gop.ativo_base || '').toUpperCase().trim();
        var gTipo = String(gop.tipo || 'call').toUpperCase();
        var gStrike = Number(gop.strike) || 0;
        var gVenc = gop.vencimento || '';
        var gDir = String(gop.direcao || 'venda').toLowerCase();
        if (gDir === 'lancamento') gDir = 'venda';
        var gKey = gBase + '|' + gTipo + '|' + gStrike + '|' + gVenc + '|' + gDir;
        if (groupMap[gKey] != null) {
          var existing = opsGrouped[groupMap[gKey]];
          existing.quantidade = (existing.quantidade || 0) + (Number(gop.quantidade) || 0);
          // Weighted average premio
          var eQty = Number(existing._origQty) || 0;
          var nQty = Number(gop.quantidade) || 0;
          var totalQty = eQty + nQty;
          if (totalQty > 0) {
            existing.premio = ((Number(existing.premio) || 0) * eQty + (Number(gop.premio) || 0) * nQty) / totalQty;
          }
          existing._origQty = totalQty;
        } else {
          var grouped = {};
          for (var gk in gop) { grouped[gk] = gop[gk]; }
          grouped._origQty = Number(gop.quantidade) || 0;
          groupMap[gKey] = opsGrouped.length;
          opsGrouped.push(grouped);
        }
      }

      // Limit to 3 opcoes (widget medium fits 3 rows)
      var opsSliced = opsGrouped.slice(0, 3);

      // Build spotMap from positions
      var spotMap = {};
      var positionsArr = dashResult.positions || [];
      for (var si = 0; si < positionsArr.length; si++) {
        var spos = positionsArr[si];
        if (spos && spos.ticker && spos.preco_atual) {
          spotMap[String(spos.ticker).toUpperCase().trim()] = Number(spos.preco_atual);
        }
      }

      // Best-effort OpLab fetch (8s timeout)
      var oplabChains = {};
      if (oplabModule && opsSliced.length > 0) {
        try {
          var basesUnique = {};
          for (var bi = 0; bi < opsSliced.length; bi++) {
            var baseKey = String(opsSliced[bi].ativo_base || '').toUpperCase().trim();
            if (baseKey) basesUnique[baseKey] = true;
          }
          var basesList = Object.keys(basesUnique);
          var chainPromises = [];
          for (var ci = 0; ci < basesList.length; ci++) {
            chainPromises.push(withTimeout(oplabModule.fetchOptionsChain(basesList[ci], 13.25), 8000));
          }
          var chainResults = await Promise.all(chainPromises);
          for (var ri = 0; ri < basesList.length; ri++) {
            if (chainResults[ri]) oplabChains[basesList[ri]] = chainResults[ri];
          }
        } catch (e) {
          // OpLab fetch failed — continue without market data
        }
      }

      for (var vi = 0; vi < opsSliced.length; vi++) {
        var op = opsSliced[vi];
        var vencDate = parseLocalDate(op.vencimento);
        var diffMs = vencDate.getTime() - now.getTime();
        var dte = Math.max(0, Math.ceil(diffMs / 86400000));

        var opTipo = String((op.tipo || 'call')).toUpperCase();
        var opBase = String(op.ativo_base || '').toUpperCase().trim();
        var opStrike = Number(op.strike) || 0;
        var opPremio = Number(op.premio) || 0;
        var opQty = Number(op.quantidade) || 0;
        var opDirecao = String(op.direcao || 'venda').toLowerCase();
        if (opDirecao === 'lancamento') opDirecao = 'venda';
        var isVenda = opDirecao === 'venda';

        var spot = spotMap[opBase] || null;
        var money = calcMoneyness(opTipo, opStrike, spot);

        // OpLab market data
        var optData = null;
        if (oplabModule && oplabModule.getCachedOptionData) {
          optData = oplabModule.getCachedOptionData(opBase, opStrike, opTipo, op.vencimento);
        }
        var mktPrice = getMarketPrice(optData, isVenda);
        var optBid = optData ? (Number(optData.bid) || null) : null;
        var optAsk = optData ? (Number(optData.ask) || null) : null;

        // P&L calculation
        var plTotal = null;
        var plPct = null;
        if (mktPrice !== null && opPremio > 0) {
          var plUnit = isVenda ? (opPremio - mktPrice) : (mktPrice - opPremio);
          plTotal = Math.round(plUnit * opQty * 100) / 100;
          plPct = Math.round((plUnit / opPremio) * 10000) / 100;
        }

        vencimentosSlice.opcoes.push({
          tipo: opTipo,
          ticker: String(op.ticker_opcao || ''),
          base: opBase,
          strike: opStrike,
          dte: dte,
          direcao: opDirecao,
          premio: opPremio > 0 ? opPremio : null,
          quantidade: opQty > 0 ? opQty : null,
          spot: spot,
          moneyness: money.label,
          distPct: money.distPct,
          marketPrice: mktPrice,
          bid: optBid,
          ask: optAsk,
          plTotal: plTotal,
          plPct: plPct,
        });
      }
      await saveToAppGroup('vencimentosData', JSON.stringify(vencimentosSlice));
    } catch (e) {
      console.warn('Widget bridge: vencimentos slice failed', e);
    }

    // ── Renda slice ──
    try {
      var rendaSlice = {
        totalMes: Number(dashResult.rendaTotalMes) || 0,
        meta: Number(dashResult.meta) || 6000,
        totalMesAnterior: Number(dashResult.rendaTotalMesAnterior) || 0,
      };
      await saveToAppGroup('rendaData', JSON.stringify(rendaSlice));
    } catch (e) {
      console.warn('Widget bridge: renda slice failed', e);
    }

  } catch (e) {
    console.warn('Widget bridge: unified sync failed', e);
  }
}

export default {
  updateWidgetData: updateWidgetData,
  updateWidgetFromContext: updateWidgetFromContext,
  updateAllWidgetsFromDashboard: updateAllWidgetsFromDashboard,
  getWidgetData: getWidgetData,
  buildWidgetPayload: buildWidgetPayload,
  saveToAppGroup: saveToAppGroup,
  WIDGET_DATA_KEY: WIDGET_DATA_KEY,
  APP_GROUP: APP_GROUP,
};
