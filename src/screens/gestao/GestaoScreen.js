import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../../theme';
import { Pill, UpgradePrompt } from '../../components';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore, useCarteira } from '../../contexts/AppStoreContext';
import CarteiraScreen from '../carteira/CarteiraScreen';
import FinanceiroView from './financeiro/FinanceiroView';
import AnaliseScreen from '../analise/AnaliseScreen';

var SUB_TABS = [
  { k: 'ativos', l: 'Ativos', color: C.acoes },
  { k: 'financeiro', l: 'Financeiro', color: C.green },
];

var ANALISE_ITEMS = [
  { k: 'perf', l: 'Performance' },
  { k: 'aloc', l: 'Alocação' },
  { k: 'comp', l: 'Composição' },
  { k: 'compar', l: 'Comparativo' },
];

export default function GestaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var _sub = useState('ativos'); var sub = _sub[0]; var setSub = _sub[1];

  // Aceitar initialTab via route params (ex: Home "Ver detalhes" -> financeiro)
  useFocusEffect(useCallback(function() {
    var p = route && route.params;
    if (p && p.initialTab) {
      var tab = p.initialTab === 'financas' ? 'financeiro' : p.initialTab;
      setSub(tab);
      navigation.setParams({ initialTab: undefined });
    }
  }, [route && route.params && route.params.initialTab]));
  var subscription = useSubscription();
  var user = useAuth().user;

  // selectedPortfolio + portfolios unificados via AppStoreContext
  var _carteira = useCarteira();
  var portfolios = _carteira.portfolios;
  var store = useAppStore();
  var selPortfolio = store.selectedPortfolio;
  var setSelPortfolio = store.setSelectedPortfolio;
  var _showPortDD = useState(false); var showPortDD = _showPortDD[0]; var setShowPortDD = _showPortDD[1];
  var _showAnaliseDD = useState(false); var showAnaliseDD = _showAnaliseDD[0]; var setShowAnaliseDD = _showAnaliseDD[1];

  var hasPortfolios = portfolios.length > 0;

  var selectedLabel = 'Todos';
  var selectedColor = C.accent;
  var selectedIcon = null;
  if (selPortfolio === '__null__') {
    selectedLabel = 'Padrão';
    selectedColor = C.accent;
    selectedIcon = null;
  } else if (selPortfolio) {
    for (var pi = 0; pi < portfolios.length; pi++) {
      if (portfolios[pi].id === selPortfolio) {
        selectedLabel = portfolios[pi].nome;
        selectedColor = portfolios[pi].cor || C.accent;
        selectedIcon = portfolios[pi].icone || null;
        break;
      }
    }
  }

  // Compute combined patrimonio summary per portfolio for "Família" view
  var familySummary = null;
  if (hasPortfolios && !selPortfolio) {
    familySummary = portfolios;
  }

  return (
    <View style={styles.container}>
      {/* Sub-tab pills */}
      <View style={styles.pillBar}>
        {SUB_TABS.map(function(tab) {
          return (
            <Pill key={tab.k} active={sub === tab.k} color={tab.color}
              onPress={function() { setSub(tab.k); setShowAnaliseDD(false); }}>
              {tab.l}
            </Pill>
          );
        })}
        <View>
          <Pill active={sub === 'perf' || sub === 'aloc' || sub === 'comp' || sub === 'compar'} color={C.accent}
            onPress={function() { setShowAnaliseDD(!showAnaliseDD); }}>
            {(function() {
              var found = ANALISE_ITEMS.find(function(a) { return a.k === sub; });
              return found ? found.l : 'Análise';
            })()} <Ionicons name={showAnaliseDD ? 'chevron-up' : 'chevron-down'} size={11} color={sub === 'perf' || sub === 'aloc' || sub === 'comp' || sub === 'compar' ? C.accent : C.textSecondary} />
          </Pill>
          {showAnaliseDD ? (
            <View style={styles.analiseDropdown}>
              {ANALISE_ITEMS.map(function(item) {
                var isActive = sub === item.k;
                return (
                  <TouchableOpacity key={item.k}
                    style={[styles.analiseItem, isActive && { backgroundColor: C.accent + '18' }]}
                    onPress={function() { setSub(item.k); setShowAnaliseDD(false); }}>
                    <Text style={[styles.analiseItemText, isActive && { color: C.accent }]}>{item.l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      {/* Portfolio selector (Ativos and Financeiro tabs when user has portfolios) */}
      {(sub === 'ativos' || sub === 'financeiro') && hasPortfolios && !showAnaliseDD ? (
        <View style={styles.portBar}>
          <TouchableOpacity
            style={styles.portSelector}
            onPress={function() { setShowPortDD(!showPortDD); }}
            activeOpacity={0.7}
          >
            {selectedIcon ? (
              <Ionicons name={selectedIcon} size={14} color={selectedColor} />
            ) : (
              <View style={[styles.portDot, { backgroundColor: selectedColor }]} />
            )}
            <Text style={styles.portLabel} numberOfLines={1}>{selectedLabel}</Text>
            <Ionicons name={showPortDD ? 'chevron-up' : 'chevron-down'} size={14} color={C.dim} />
          </TouchableOpacity>
          {showPortDD ? (
            <View style={styles.portDropdown}>
              <TouchableOpacity
                style={[styles.portItem, !selPortfolio && styles.portItemActive]}
                onPress={function() { setSelPortfolio(null); setShowPortDD(false); }}
              >
                <Ionicons name="people-outline" size={14} color={!selPortfolio ? C.accent : C.dim} />
                <Text style={[styles.portItemText, !selPortfolio && { color: C.accent }]}>Todos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.portItem, selPortfolio === '__null__' && styles.portItemActive]}
                onPress={function() { setSelPortfolio('__null__'); setShowPortDD(false); }}
              >
                <Ionicons name="briefcase-outline" size={14} color={selPortfolio === '__null__' ? C.accent : C.dim} />
                <Text style={[styles.portItemText, selPortfolio === '__null__' && { color: C.accent }]}>Padrão</Text>
              </TouchableOpacity>
              {portfolios.map(function(p) {
                var isActive = selPortfolio === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.portItem, isActive && styles.portItemActive]}
                    onPress={function() { setSelPortfolio(p.id); setShowPortDD(false); }}
                  >
                    {p.icone ? (
                      <Ionicons name={p.icone} size={14} color={isActive ? (p.cor || C.accent) : C.dim} />
                    ) : (
                      <View style={[styles.portDotSmall, { backgroundColor: p.cor || C.accent }]} />
                    )}
                    <Text style={[styles.portItemText, isActive && { color: p.cor || C.accent }]}>{p.nome}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Content */}
      {sub === 'financeiro' ? (
        <FinanceiroView navigation={navigation} portfolioId={selPortfolio} portfolios={portfolios} />
      ) : sub === 'perf' || sub === 'aloc' || sub === 'comp' || sub === 'compar' ? (
        subscription.canAccess('ANALYSIS_TAB') ? (
          <AnaliseScreen navigation={navigation} embedded={true} forcedTab={sub} portfolioId={selPortfolio} />
        ) : (
          <View style={{ flex: 1 }}>
            <UpgradePrompt feature="ANALYSIS_TAB" navigation={navigation} />
          </View>
        )
      ) : (
        <CarteiraScreen navigation={navigation} />
      )}
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  pillBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SIZE.padding,
    paddingTop: 8,
    paddingBottom: 6,
    zIndex: 20,
  },
  portBar: {
    paddingHorizontal: SIZE.padding,
    paddingBottom: 6,
    zIndex: 10,
  },
  portSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.card + '80',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.border,
    alignSelf: 'flex-start',
  },
  portDot: { width: 8, height: 8, borderRadius: 4 },
  portLabel: { fontSize: 12, fontFamily: F.body, color: C.text, maxWidth: 160 },
  portDropdown: {
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 4,
    overflow: 'hidden',
  },
  portItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  portItemActive: {
    backgroundColor: C.accent + '11',
  },
  portDotSmall: { width: 6, height: 6, borderRadius: 3 },
  portItemText: { fontSize: 13, fontFamily: F.body, color: C.text },
  analiseDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    backgroundColor: C.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    zIndex: 20,
    minWidth: 150,
  },
  analiseItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  analiseItemText: { fontSize: 13, fontFamily: F.body, color: C.text },
});
