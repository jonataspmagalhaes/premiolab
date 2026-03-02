// ═══════════════════════════════════════════════════════════
// Android Widget Task Handler
// Registra com react-native-android-widget para renderizar
// QuickExpenseWidget com dados do AsyncStorage
// ═══════════════════════════════════════════════════════════

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuickExpenseWidget from './QuickExpenseWidget';

var WIDGET_DATA_KEY = '@premiolab_widget_data';

async function loadData() {
  try {
    var json = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (json) return JSON.parse(json);
  } catch (e) {
    // ignore
  }
  return {
    cartao: { id: null, label: '', fatura_total: 0, limite: 0, vencimento: '', moeda: 'BRL' },
    presets: [],
    updated_at: null,
  };
}

async function widgetTaskHandler(props) {
  var widgetAction = props.widgetAction;
  var renderWidget = props.renderWidget;

  if (widgetAction === 'WIDGET_DELETED') {
    return;
  }

  // WIDGET_ADDED, WIDGET_UPDATE, WIDGET_RESIZED, WIDGET_CLICK
  var data = await loadData();

  renderWidget(
    <QuickExpenseWidget data={data} />
  );
}

export default widgetTaskHandler;
