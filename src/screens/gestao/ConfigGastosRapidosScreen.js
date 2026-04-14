import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getGastosRapidos, saveGastosRapidos, getCartoes, getProfile, updateProfile } from '../../services/database';
import { Glass, EmptyState, SwipeableRow, Badge } from '../../components';
import { getSymbol } from '../../services/currencyService';
import widgetBridge from '../../services/widgetBridge';
import * as databaseModule from '../../services/database';
import * as currencyServiceModule from '../../services/currencyService';
var finCats = require('../../constants/financeCategories');

function formatValor(num) {
  if (!num && num !== 0) return 'R$ 0,00';
  var abs = Math.abs(num);
  var fixed = abs.toFixed(2);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return 'R$ ' + parts[0] + ',' + parts[1];
}

export default function ConfigGastosRapidosScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var user = useAuth().user;

  var _presets = useState([]); var presets = _presets[0]; var setPresets = _presets[1];
  var _cartoes = useState([]); var cartoes = _cartoes[0]; var setCartoes = _cartoes[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _cartoesMap = useState({}); var cartoesMap = _cartoesMap[0]; var setCartoesMap = _cartoesMap[1];
  var _cartaoPrincipal = useState(null); var cartaoPrincipal = _cartaoPrincipal[0]; var setCartaoPrincipal = _cartaoPrincipal[1];

  function loadData() {
    if (!user) return;
    var promises = [
      getGastosRapidos(user.id),
      getCartoes(user.id),
      getProfile(user.id),
    ];
    Promise.all(promises).then(function(results) {
      var presetsResult = results[0];
      var cartoesResult = results[1];
      var profileResult = results[2];

      setPresets(presetsResult.data || []);
      setCartoes(cartoesResult.data || []);
      if (profileResult.data && profileResult.data.cartao_principal) {
        setCartaoPrincipal(profileResult.data.cartao_principal);
      }

      // Build cartoesMap: id → label string
      var map = {};
      var cards = cartoesResult.data || [];
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (card.apelido) {
          map[card.id] = card.apelido;
        } else {
          var bandeira = card.bandeira ? card.bandeira.toUpperCase() : 'CARTÃO';
          var digitos = card.ultimos_digitos || '****';
          map[card.id] = bandeira + ' ••' + digitos;
        }
      }
      setCartoesMap(map);
      setLoading(false);
    }).catch(function() {
      setLoading(false);
    });
  }

  useFocusEffect(useCallback(function() {
    setLoading(true);
    loadData();
  }, [user]));

  function handleDelete(id) {
    Alert.alert(
      'Excluir Gasto Rápido',
      'Deseja remover este atalho?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: function() {
            var updated = [];
            for (var i = 0; i < presets.length; i++) {
              if (presets[i].id !== id) {
                updated.push(presets[i]);
              }
            }
            saveGastosRapidos(user.id, updated).then(function(r) {
              if (r && r.error) {
                Alert.alert('Erro', 'Falha ao excluir gasto rápido.');
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setPresets(updated);
                Toast.show({
                  type: 'success',
                  text1: 'Gasto rápido excluído',
                  visibilityTime: 2000,
                });
                widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
              }
            }).catch(function() {
              Alert.alert('Erro', 'Falha ao salvar alterações.');
            });
          },
        },
      ]
    );
  }

  function handleReorder(idx, direction) {
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= presets.length) return;

    var updated = [];
    for (var i = 0; i < presets.length; i++) {
      updated.push(presets[i]);
    }

    var temp = updated[idx];
    updated[idx] = updated[newIdx];
    updated[newIdx] = temp;

    Haptics.selectionAsync();
    setPresets(updated);

    saveGastosRapidos(user.id, updated).then(function(r) {
      if (r && r.error) {
        Alert.alert('Erro', 'Falha ao salvar ordem.');
      } else {
        widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
      }
    }).catch(function() {
      // silent
    });
  }

  function getCartaoLabel(cartaoId) {
    if (!cartaoId) return 'Cartão';
    if (!cartoesMap[cartaoId]) return null; // null = cartão removido
    return cartoesMap[cartaoId];
  }

  function getPresetIcon(preset) {
    if (preset.icon) return preset.icon;
    var cat = preset.categoria || preset.subcategoria;
    if (cat) return finCats.getCatIcon(preset.categoria, preset.subcategoria);
    return 'flash-outline';
  }

  function getPresetColor(preset) {
    if (preset.color) return preset.color;
    var cat = preset.categoria || preset.subcategoria;
    if (cat) return finCats.getCatColor(preset.categoria, preset.subcategoria);
    return C.accent;
  }

  function navigateAdd(editPreset) {
    var params = {};
    if (editPreset) {
      params.preset = editPreset;
    } else if (route && route.params && route.params.presetCartaoId) {
      // Only propagate presetCartaoId for new presets, not edits
      params.presetCartaoId = route.params.presetCartaoId;
    }
    navigation.navigate('AddGastoRapido', params);
  }

  function handleSetCartaoPrincipal(cardId) {
    var newVal = cardId === cartaoPrincipal ? null : cardId;
    setCartaoPrincipal(newVal);
    Haptics.selectionAsync();
    updateProfile(user.id, { cartao_principal: newVal }).then(function(r) {
      if (r && r.error) {
        Toast.show({ type: 'error', text1: 'Erro ao salvar cartão principal' });
      } else {
        Toast.show({ type: 'success', text1: newVal ? 'Cartão principal definido' : 'Cartão principal removido', visibilityTime: 1500 });
        widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
      }
    }).catch(function() {});
  }

  function renderItem(info) {
    var item = info.item;
    var index = info.index;
    var iconName = getPresetIcon(item);
    var iconColor = getPresetColor(item);
    var meio = item.meio_pagamento || 'credito';
    var usaConta = meio === 'pix' || meio === 'debito';
    var cartaoLbl = usaConta ? null : getCartaoLabel(item.cartao_id);
    var cartaoRemovido = !usaConta && item.cartao_id && cartaoLbl === null;
    var targetLabel = usaConta ? (item.conta || 'Conta') : (cartaoRemovido ? 'Cartão removido' : (cartaoLbl || 'Cartão'));
    var valorStr = formatValor(item.valor);
    var subtitle = valorStr + ' · ' + targetLabel;
    var isFirst = index === 0;
    var isLast = index === presets.length - 1;

    var meioBadge = meio === 'pix' ? { text: 'PIX', color: C.green }
      : meio === 'debito' ? { text: 'DÉBITO', color: C.rf }
      : { text: 'CARTÃO', color: C.accent };

    return (
      <SwipeableRow onDelete={function() { handleDelete(item.id); }}>
        <TouchableOpacity
          style={styles.itemRow}
          onPress={function() { navigateAdd(item); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={item.label + ', ' + valorStr}
        >
          <View style={styles.itemLeft}>
            <View style={[styles.iconCircle, { backgroundColor: iconColor + '22' }]}>
              <Ionicons name={iconName} size={18} color={iconColor} />
            </View>
            <View style={styles.itemTexts}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.itemLabel} numberOfLines={1}>{item.label || 'Sem nome'}</Text>
                <Badge text={meioBadge.text} color={meioBadge.color} />
              </View>
              <Text style={[styles.itemSubtitle, cartaoRemovido && { color: C.red }]} numberOfLines={1}>{subtitle}</Text>
            </View>
          </View>
          <View style={styles.itemRight}>
            {!isFirst ? (
              <TouchableOpacity
                style={styles.arrowBtn}
                onPress={function() { handleReorder(index, -1); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Mover para cima"
              >
                <Ionicons name="chevron-up-outline" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.arrowPlaceholder} />
            )}
            {!isLast ? (
              <TouchableOpacity
                style={styles.arrowBtn}
                onPress={function() { handleReorder(index, 1); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Mover para baixo"
              >
                <Ionicons name="chevron-down-outline" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.arrowPlaceholder} />
            )}
          </View>
        </TouchableOpacity>
      </SwipeableRow>
    );
  }

  function renderEmpty() {
    return (
      <EmptyState
        ionicon="flash-outline"
        title="Nenhum gasto rápido"
        description="Crie atalhos para registrar despesas frequentes com 1 toque"
        cta="Criar primeiro"
        onCta={function() { navigateAdd(null); }}
        color={C.accent}
      />
    );
  }

  function renderFooter() {
    if (presets.length === 0) return null;
    return (
      <TouchableOpacity
        style={styles.addBtn}
        onPress={function() { navigateAdd(null); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Novo gasto rápido"
      >
        <Ionicons name="add-circle-outline" size={20} color={C.accent} />
        <Text style={styles.addBtnText}>Novo Gasto Rápido</Text>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={function() { navigation.goBack(); }}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Text style={styles.backText}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Gastos Rápidos</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={function() { navigation.goBack(); }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Text style={styles.backText}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gastos Rápidos</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtitle}>
        Configure gastos frequentes para registrar com 1 toque
      </Text>

      {/* CARTÃO PRINCIPAL */}
      {cartoes.length > 0 ? (
        <View style={styles.principalSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Ionicons name="star" size={14} color={C.yellow || '#F59E0B'} />
            <Text style={styles.principalTitle}>Cartão Principal</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cartoes.map(function(c) {
              var cLabel = (c.apelido || c.bandeira.toUpperCase()) + ' ••' + c.ultimos_digitos;
              var isActive = cartaoPrincipal === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={function() { handleSetCartaoPrincipal(c.id); }}
                  activeOpacity={0.7}
                  style={[styles.principalPill, isActive && styles.principalPillActive]}
                >
                  {isActive ? <Ionicons name="star" size={12} color="#F59E0B" style={{ marginRight: 4 }} /> : null}
                  <Text style={[styles.principalPillText, isActive && { color: C.text }]}>{cLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.principalHint}>
            Usado como padrão em novos gastos rápidos e widget
          </Text>
        </View>
      ) : null}

      <FlatList
        data={presets}
        keyExtractor={function(item, idx) { return item.id ? String(item.id) : 'preset-' + idx; }}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingTop: 54,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZE.padding,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    fontSize: 28,
    color: C.text,
    fontFamily: F.body,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: F.display,
    color: C.text,
    textAlign: 'center',
    marginRight: 36,
  },
  headerSpacer: {
    width: 0,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: F.body,
    color: C.textSecondary,
    paddingHorizontal: SIZE.padding,
    marginBottom: 16,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: SIZE.padding,
    paddingBottom: 40,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border || 'rgba(255,255,255,0.06)',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemTexts: {
    flex: 1,
    marginRight: 8,
  },
  itemLabel: {
    fontSize: 15,
    fontFamily: F.display,
    color: C.text,
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 12,
    fontFamily: F.body,
    color: C.textSecondary,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowPlaceholder: {
    width: 32,
    height: 32,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.accent + '44',
    borderStyle: 'dashed',
    borderRadius: SIZE.radius,
  },
  addBtnText: {
    fontSize: 15,
    fontFamily: F.display,
    color: C.accent,
    marginLeft: 8,
  },
  principalSection: {
    paddingHorizontal: SIZE.padding,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  principalTitle: {
    fontSize: 13,
    fontFamily: F.display,
    color: C.text,
  },
  principalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  principalPillActive: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  principalPillText: {
    fontSize: 13,
    fontFamily: F.body,
    color: C.textSecondary,
  },
  principalHint: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.textTertiary || '#666688',
    marginTop: 8,
  },
});
