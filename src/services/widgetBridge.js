// ═══════════════════════════════════════════════════════════
// Widget Bridge — sincroniza dados entre app e widgets nativos
// iOS: NSUserDefaults (App Group) via expo-modules
// Android: SharedPreferences via react-native-android-widget
// ═══════════════════════════════════════════════════════════

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

var WIDGET_DATA_KEY = '@premiolab_widget_data';

// ── Helpers ──────────────────────────────────────────────────

function buildWidgetPayload(cartao, faturaTotal, limite, vencimento, moeda, presets) {
  var cartaoLabel = '';
  if (cartao) {
    cartaoLabel = (cartao.apelido || (cartao.bandeira || '').toUpperCase() + ' ••' + (cartao.ultimos_digitos || ''));
  }

  var presetsArr = [];
  for (var i = 0; i < Math.min((presets || []).length, 4); i++) {
    var p = presets[i];
    presetsArr.push({
      id: p.id,
      label: p.label || 'Gasto',
      valor: p.valor || 0,
      icone: p.icone || 'card-outline',
      cartao_id: p.cartao_id,
    });
  }

  return {
    cartao: {
      id: cartao ? cartao.id : null,
      label: cartaoLabel,
      fatura_total: faturaTotal || 0,
      limite: limite || 0,
      vencimento: vencimento || '',
      moeda: moeda || 'BRL',
    },
    presets: presetsArr,
    updated_at: new Date().toISOString(),
  };
}

// ── Storage ──────────────────────────────────────────────────

async function saveWidgetData(data) {
  try {
    var json = JSON.stringify(data);
    await AsyncStorage.setItem(WIDGET_DATA_KEY, json);

    // iOS: se expo-modules disponível, salvar em App Group UserDefaults
    if (Platform.OS === 'ios') {
      try {
        var SharedGroupPreferences = require('react-native').NativeModules.SharedGroupPreferences;
        if (SharedGroupPreferences && SharedGroupPreferences.setItem) {
          await SharedGroupPreferences.setItem('widgetData', json, 'group.com.premiotrader.app.data');
        }
      } catch (e) {
        // Module não disponível — widget lerá via timeline refresh
      }
    }

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

async function updateWidgetFromContext(userId, database, currencyService) {
  try {
    var getCartoes = database.getCartoes;
    var getFatura = database.getFatura;
    var getGastosRapidos = database.getGastosRapidos;
    var getSymbol = currencyService.getSymbol;

    var cartoesRes = await getCartoes(userId);
    var cartoes = (cartoesRes && cartoesRes.data) || [];
    if (cartoes.length === 0) return;

    var cartao = cartoes[0]; // usa primeiro cartão ativo
    var now = new Date();
    var mes = now.getMonth() + 1;
    var ano = now.getFullYear();

    var faturaRes = await getFatura(userId, cartao.id, mes, ano);
    var faturaTotal = (faturaRes && faturaRes.data && faturaRes.data.total) || 0;
    var vencimento = (faturaRes && faturaRes.data && faturaRes.data.vencimento) || '';

    var presetsRes = await getGastosRapidos(userId);
    var presets = (presetsRes && presetsRes.data) || [];

    var simbolo = getSymbol(cartao.moeda || 'BRL');

    await updateWidgetData(
      cartao,
      faturaTotal,
      cartao.limite || 0,
      vencimento,
      cartao.moeda || 'BRL',
      presets
    );
  } catch (e) {
    // Silencioso — widget é best-effort
  }
}

export default {
  updateWidgetData: updateWidgetData,
  updateWidgetFromContext: updateWidgetFromContext,
  getWidgetData: getWidgetData,
  buildWidgetPayload: buildWidgetPayload,
  WIDGET_DATA_KEY: WIDGET_DATA_KEY,
};
