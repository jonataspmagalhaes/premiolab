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
import { getGastosRapidos, saveGastosRapidos, getCartoes } from '../../services/database';
import { Glass, EmptyState, SwipeableRow, Badge } from '../../components';
import { getSymbol } from '../../services/currencyService';
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

  function loadData() {
    if (!user) return;
    var promises = [
      getGastosRapidos(user.id),
      getCartoes(user.id),
    ];
    Promise.all(promises).then(function(results) {
      var presetsResult = results[0];
      var cartoesResult = results[1];

      setPresets(presetsResult.data || []);
      setCartoes(cartoesResult.data || []);

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
          map[card.id] = bandeira + ' •' + digitos;
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
      }
    }).catch(function() {
      // silent
    });
  }

  function getCartaoLabel(cartaoId) {
    if (!cartaoId) return 'Cartão';
    return cartoesMap[cartaoId] || 'Cartão';
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
    }
    if (route && route.params && route.params.presetCartaoId) {
      params.presetCartaoId = route.params.presetCartaoId;
    }
    navigation.navigate('AddGastoRapido', params);
  }

  function renderItem(info) {
    var item = info.item;
    var index = info.index;
    var iconName = getPresetIcon(item);
    var iconColor = getPresetColor(item);
    var cartaoLabel = getCartaoLabel(item.cartao_id);
    var valorStr = formatValor(item.valor);
    var subtitle = valorStr + ' · ' + cartaoLabel;
    var isFirst = index === 0;
    var isLast = index === presets.length - 1;

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
              <Text style={styles.itemLabel} numberOfLines={1}>{item.label || 'Sem nome'}</Text>
              <Text style={styles.itemSubtitle} numberOfLines={1}>{subtitle}</Text>
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
});
