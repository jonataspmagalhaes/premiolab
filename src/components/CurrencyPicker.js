// ═══════════════════════════════════════════════════
// CURRENCY PICKER — Modal pesquisável de moedas
// ═══════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, FlatList,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ALL_CURRENCIES, searchCurrencies, getSymbol } from '../services/currencyService';

var C = require('../theme').C;
var F = require('../theme').F;
var SIZE = require('../theme').SIZE;

function CurrencyPicker(props) {
  var visible = props.visible;
  var onClose = props.onClose;
  var onSelect = props.onSelect;
  var recent = props.recent || [];
  var cardMoeda = props.cardMoeda;
  var color = props.color || C.accent;

  var _query = useState('');
  var query = _query[0];
  var setQuery = _query[1];

  var inputRef = useRef(null);

  // Reset query when modal opens
  useEffect(function() {
    if (visible) {
      setQuery('');
    }
  }, [visible]);

  // ── Filtered list ──
  var filtered = query.length > 0 ? searchCurrencies(query) : ALL_CURRENCIES;

  // ── Quick pills: BRL + cardMoeda (if not BRL) + recent (dedup, max 5) ──
  var quickCodes = ['BRL'];
  if (cardMoeda && cardMoeda !== 'BRL' && quickCodes.indexOf(cardMoeda) === -1) {
    quickCodes.push(cardMoeda);
  }
  for (var ri = 0; ri < recent.length; ri++) {
    if (quickCodes.indexOf(recent[ri]) === -1 && quickCodes.length < 6) {
      quickCodes.push(recent[ri]);
    }
  }
  // Add common currencies if space
  var common = ['USD', 'EUR', 'GBP'];
  for (var ci = 0; ci < common.length; ci++) {
    if (quickCodes.indexOf(common[ci]) === -1 && quickCodes.length < 6) {
      quickCodes.push(common[ci]);
    }
  }

  // ── Lookup currency object by code ──
  function findCurrency(code) {
    for (var i = 0; i < ALL_CURRENCIES.length; i++) {
      if (ALL_CURRENCIES[i].code === code) return ALL_CURRENCIES[i];
    }
    return { code: code, symbol: code, name: code };
  }

  // ── Handle selection ──
  function handleSelect(currency) {
    if (onSelect) onSelect(currency);
    if (onClose) onClose();
  }

  // ── Render quick pill ──
  function renderPill(code, index) {
    var cur = findCurrency(code);
    return (
      <TouchableOpacity
        key={'qp-' + code}
        accessibilityRole="button"
        accessibilityLabel={'Selecionar ' + cur.name}
        onPress={function() { handleSelect(cur); }}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: color + '22',
          borderWidth: 1,
          borderColor: color + '44',
          marginRight: 8,
          marginBottom: 6,
        }}
      >
        <Text style={{
          fontSize: 13,
          fontFamily: F.body,
          fontWeight: '600',
          color: color,
        }}>{cur.symbol + ' ' + cur.code}</Text>
      </TouchableOpacity>
    );
  }

  // ── Render list item ──
  function renderItem(info) {
    var item = info.item;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={item.code + ', ' + item.name}
        onPress={function() { handleSelect(item); }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.04)',
        }}
      >
        <View style={{
          width: 42,
          height: 28,
          borderRadius: 6,
          backgroundColor: color + '18',
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
        }}>
          <Text style={{
            fontSize: 11,
            fontFamily: F.mono,
            fontWeight: '700',
            color: color,
          }}>{item.code}</Text>
        </View>
        <Text style={{
          fontSize: 16,
          color: C.text,
          marginRight: 8,
          minWidth: 24,
        }}>{item.symbol}</Text>
        <Text style={{
          fontSize: 13,
          fontFamily: F.body,
          color: C.sub,
          flex: 1,
        }} numberOfLines={1}>{item.name}</Text>
      </TouchableOpacity>
    );
  }

  function keyExtractor(item) {
    return item.code;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: C.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '85%',
            minHeight: '60%',
            borderTopWidth: 1,
            borderColor: C.border,
          }}>
            {/* ── Header ── */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: SIZE.padding,
              paddingTop: 16,
              paddingBottom: 12,
            }}>
              <Text style={{
                fontSize: 16,
                fontFamily: F.display,
                fontWeight: '700',
                color: C.text,
              }}>Selecionar Moeda</Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color={C.sub} />
              </TouchableOpacity>
            </View>

            {/* ── Quick pills ── */}
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: SIZE.padding,
              marginBottom: 10,
            }}>
              {quickCodes.map(function(code, idx) {
                return renderPill(code, idx);
              })}
            </View>

            {/* ── Search input ── */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginHorizontal: SIZE.padding,
              marginBottom: 10,
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: C.border,
              paddingHorizontal: 12,
              height: 44,
            }}>
              <Ionicons name="search" size={18} color={C.dim} style={{ marginRight: 8 }} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar moeda..."
                placeholderTextColor={C.dim}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontFamily: F.body,
                  color: C.text,
                  paddingVertical: 0,
                }}
              />
              {query.length > 0 ? (
                <TouchableOpacity
                  onPress={function() { setQuery(''); }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Limpar busca"
                >
                  <Ionicons name="close-circle" size={18} color={C.dim} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* ── Currency list ── */}
            <FlatList
              data={filtered}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={15}
              maxToRenderPerBatch={20}
              windowSize={5}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 30 }}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{
                    fontSize: 13,
                    fontFamily: F.body,
                    color: C.dim,
                  }}>Nenhuma moeda encontrada</Text>
                </View>
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default CurrencyPicker;
