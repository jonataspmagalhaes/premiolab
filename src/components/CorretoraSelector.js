import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { C, F, SIZE } from '../theme';
import { Pill } from './Primitives';
import { getUserCorretoras } from '../services/database';
import { getSymbol } from '../services/currencyService';

// Lista abrangente de instituições com metadados
var ALL_INSTITUTIONS = [
  // Corretoras BR
  { name: 'Clear', moeda: 'BRL', tipo: 'corretora' },
  { name: 'XP Investimentos', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Rico', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Genial', moeda: 'BRL', tipo: 'corretora' },
  { name: 'BTG Pactual', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Modal', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Ágora', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Guide Investimentos', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Warren', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Órama', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Toro Investimentos', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Nova Futura', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Mirae Asset', moeda: 'BRL', tipo: 'corretora' },
  { name: 'CM Capital', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Terra Investimentos', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Necton', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Ativa Investimentos', moeda: 'BRL', tipo: 'corretora' },
  { name: 'Vitreo', moeda: 'BRL', tipo: 'corretora' },
  // Bancos BR
  { name: 'Inter', moeda: 'BRL', tipo: 'banco' },
  { name: 'Nubank', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco do Brasil', moeda: 'BRL', tipo: 'banco' },
  { name: 'Itaú', moeda: 'BRL', tipo: 'banco' },
  { name: 'Bradesco', moeda: 'BRL', tipo: 'banco' },
  { name: 'Santander', moeda: 'BRL', tipo: 'banco' },
  { name: 'Caixa', moeda: 'BRL', tipo: 'banco' },
  { name: 'Safra', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banrisul', moeda: 'BRL', tipo: 'banco' },
  { name: 'BRB', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco Pan', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco Original', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco Sofisa', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco Daycoval', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco BMG', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco Master', moeda: 'BRL', tipo: 'banco' },
  { name: 'Banco Mercantil', moeda: 'BRL', tipo: 'banco' },
  { name: 'Sicoob', moeda: 'BRL', tipo: 'banco' },
  { name: 'Sicredi', moeda: 'BRL', tipo: 'banco' },
  { name: 'Agibank', moeda: 'BRL', tipo: 'banco' },
  // Fintechs BR
  { name: 'C6 Bank', moeda: 'BRL', tipo: 'banco' },
  { name: 'PagBank', moeda: 'BRL', tipo: 'banco' },
  { name: 'Mercado Pago', moeda: 'BRL', tipo: 'banco' },
  { name: 'Neon', moeda: 'BRL', tipo: 'banco' },
  { name: 'Will Bank', moeda: 'BRL', tipo: 'banco' },
  { name: 'Next', moeda: 'BRL', tipo: 'banco' },
  { name: 'PicPay', moeda: 'BRL', tipo: 'banco' },
  // Corretoras INT
  { name: 'Avenue', moeda: 'USD', tipo: 'corretora' },
  { name: 'Nomad', moeda: 'USD', tipo: 'banco' },
  { name: 'Interactive Brokers', moeda: 'USD', tipo: 'corretora' },
  { name: 'Stake', moeda: 'USD', tipo: 'corretora' },
  { name: 'Charles Schwab', moeda: 'USD', tipo: 'corretora' },
  { name: 'TD Ameritrade', moeda: 'USD', tipo: 'corretora' },
  { name: 'Fidelity', moeda: 'USD', tipo: 'corretora' },
  { name: 'Passfolio', moeda: 'USD', tipo: 'corretora' },
  { name: 'Sproutfi', moeda: 'USD', tipo: 'corretora' },
  { name: 'eToro', moeda: 'USD', tipo: 'corretora' },
  { name: 'Revolut', moeda: 'USD', tipo: 'corretora' },
  { name: 'Wise', moeda: 'USD', tipo: 'corretora' },
  // Bancos INT
  { name: 'HSBC', moeda: 'QAR', tipo: 'banco' },
  { name: 'Al Rayan Bank', moeda: 'QAR', tipo: 'banco' },
];

var DEFAULTS_BR = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial'];
var DEFAULTS_INT = ['Avenue', 'Nomad', 'Interactive Brokers', 'Stake', 'Inter', 'XP Investimentos', 'BTG Pactual'];
var DEFAULTS_RF = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial', 'Itaú', 'Bradesco', 'Banco do Brasil'];

function normalizeCorretora(name) {
  return (name || '').trim().replace(/\s+/g, ' ');
}

function getInstitutionMeta(name) {
  var upper = (name || '').toUpperCase();
  for (var i = 0; i < ALL_INSTITUTIONS.length; i++) {
    if (ALL_INSTITUTIONS[i].name.toUpperCase() === upper) return ALL_INSTITUTIONS[i];
  }
  return null;
}

function inArray(arr, val) {
  var up = val.toUpperCase();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].toUpperCase() === up) return true;
  }
  return false;
}

export { ALL_INSTITUTIONS, DEFAULTS_RF, getInstitutionMeta };

export default function CorretoraSelector(props) {
  var value = props.value || '';
  var onSelect = props.onSelect;
  var userId = props.userId;
  var mercado = props.mercado || 'BR';
  var color = props.color || C.acoes;
  var label = props.label || 'CORRETORA';
  var showLabel = props.showLabel !== false;
  var defaultsProp = props.defaults;

  var _userList = useState([]); var userList = _userList[0]; var setUserList = _userList[1];
  var _showInput = useState(false); var showInput = _showInput[0]; var setShowInput = _showInput[1];
  var _searchText = useState(''); var searchText = _searchText[0]; var setSearchText = _searchText[1];
  var _extras = useState([]); var extras = _extras[0]; var setExtras = _extras[1];
  var _inputRef = useRef(null);

  // Fetch user corretoras on mount
  useEffect(function() {
    if (!userId) return;
    getUserCorretoras(userId).then(function(result) {
      var list = result.data || [];
      var names = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].name) names.push(list[i].name);
      }
      setUserList(names);
    }).catch(function() {});
  }, [userId]);

  // Build pill list: user corretoras first, then defaults (dedup)
  var defaultList = defaultsProp || (mercado === 'INT' ? DEFAULTS_INT : DEFAULTS_BR);
  var pillNames = [];
  var seen = {};

  // User corretoras first
  for (var u = 0; u < userList.length; u++) {
    var uKey = userList[u].toUpperCase();
    if (!seen[uKey]) {
      seen[uKey] = true;
      pillNames.push(userList[u]);
    }
  }
  // Defaults
  for (var d = 0; d < defaultList.length; d++) {
    var dKey = defaultList[d].toUpperCase();
    if (!seen[dKey]) {
      seen[dKey] = true;
      pillNames.push(defaultList[d]);
    }
  }
  // Extras from this session
  for (var x = 0; x < extras.length; x++) {
    var xKey = extras[x].toUpperCase();
    if (!seen[xKey]) {
      seen[xKey] = true;
      pillNames.push(extras[x]);
    }
  }
  // If current value not in list, prepend it
  if (value && !seen[value.toUpperCase()]) {
    pillNames.unshift(value);
  }

  // Build search suggestions when typing
  var suggestions = [];
  if (showInput && searchText.length >= 1) {
    var q = searchText.toUpperCase();
    var addedNames = {};
    // User corretoras matching query (badge MINHA)
    for (var um = 0; um < userList.length; um++) {
      if (userList[um].toUpperCase().indexOf(q) !== -1) {
        if (!addedNames[userList[um].toUpperCase()]) {
          addedNames[userList[um].toUpperCase()] = true;
          var umMeta = getInstitutionMeta(userList[um]);
          suggestions.push({
            name: userList[um],
            moeda: umMeta ? umMeta.moeda : 'BRL',
            tipo: umMeta ? umMeta.tipo : 'corretora',
            isMinha: true,
          });
        }
      }
      if (suggestions.length >= 6) break;
    }
    // ALL_INSTITUTIONS matching query
    if (suggestions.length < 6) {
      for (var ai = 0; ai < ALL_INSTITUTIONS.length; ai++) {
        if (ALL_INSTITUTIONS[ai].name.toUpperCase().indexOf(q) !== -1) {
          if (!addedNames[ALL_INSTITUTIONS[ai].name.toUpperCase()]) {
            addedNames[ALL_INSTITUTIONS[ai].name.toUpperCase()] = true;
            suggestions.push({
              name: ALL_INSTITUTIONS[ai].name,
              moeda: ALL_INSTITUTIONS[ai].moeda,
              tipo: ALL_INSTITUTIONS[ai].tipo,
              isMinha: false,
            });
          }
        }
        if (suggestions.length >= 6) break;
      }
    }
  }

  // Check if typed text exactly matches a suggestion
  var exactMatch = false;
  if (searchText.length >= 2) {
    var stUp = searchText.toUpperCase();
    for (var em = 0; em < suggestions.length; em++) {
      if (suggestions[em].name.toUpperCase() === stUp) { exactMatch = true; break; }
    }
  }

  function handlePillPress(name) {
    if (value === name) {
      // Toggle off
      onSelect('', null);
    } else {
      var meta = getInstitutionMeta(name);
      onSelect(name, meta);
    }
    setShowInput(false);
    setSearchText('');
  }

  function handleOutraPress() {
    if (showInput) {
      setShowInput(false);
      setSearchText('');
    } else {
      setShowInput(true);
      setSearchText('');
      setTimeout(function() {
        if (_inputRef.current) _inputRef.current.focus();
      }, 100);
    }
  }

  function handleSelectSuggestion(item) {
    var normalized = normalizeCorretora(item.name);
    var meta = { moeda: item.moeda, tipo: item.tipo };
    onSelect(normalized, meta);
    // Add to extras if not already in pills
    if (!inArray(pillNames, normalized)) {
      setExtras(function(prev) {
        var next = [];
        for (var i = 0; i < prev.length; i++) next.push(prev[i]);
        next.push(normalized);
        return next;
      });
    }
    setShowInput(false);
    setSearchText('');
    Keyboard.dismiss();
  }

  function handleConfirmCustom() {
    var normalized = normalizeCorretora(searchText);
    if (normalized.length < 2) return;
    // Check if matches existing institution
    var meta = getInstitutionMeta(normalized);
    onSelect(normalized, meta);
    // Add to extras
    if (!inArray(pillNames, normalized)) {
      setExtras(function(prev) {
        var next = [];
        for (var i = 0; i < prev.length; i++) next.push(prev[i]);
        next.push(normalized);
        return next;
      });
    }
    setShowInput(false);
    setSearchText('');
    Keyboard.dismiss();
  }

  var showDropdown = showInput && (suggestions.length > 0 || (searchText.length >= 2 && !exactMatch));

  return (
    <View style={styles.container}>
      {showLabel ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
      <View style={styles.pillRow}>
        {pillNames.map(function(name) {
          return (
            <Pill key={name} active={value === name} color={color}
              onPress={function() { handlePillPress(name); }}>
              {name}
            </Pill>
          );
        })}
        <Pill key="__outra" active={showInput} color={C.accent}
          onPress={handleOutraPress}>
          + Outra
        </Pill>
      </View>
      {showInput ? (
        <View style={styles.inputWrapper}>
          <TextInput
            ref={_inputRef}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar corretora ou banco..."
            placeholderTextColor={C.dim}
            returnKeyType="done"
            onSubmitEditing={function() {
              if (searchText.length >= 2) handleConfirmCustom();
            }}
            style={styles.input}
            accessibilityLabel="Buscar corretora ou banco"
          />
          {showDropdown ? (
            <View style={styles.dropdown}>
              {suggestions.map(function(item, idx) {
                var sym = getSymbol(item.moeda) || item.moeda;
                return (
                  <TouchableOpacity key={item.name + '-' + idx} style={styles.dropItem}
                    onPress={function() { handleSelectSuggestion(item); }}
                    accessibilityRole="button" accessibilityLabel={item.name}>
                    <View style={styles.dropItemRow}>
                      <Text style={styles.dropItemName}>{item.name}</Text>
                      <View style={styles.dropItemBadges}>
                        {item.isMinha ? (
                          <View style={styles.minhaBadge}>
                            <Text style={styles.minhaBadgeText}>MINHA</Text>
                          </View>
                        ) : null}
                        <View style={styles.moedaBadge}>
                          <Text style={styles.moedaBadgeText}>{sym}</Text>
                        </View>
                      </View>
                    </View>
                    <Text style={styles.dropItemTipo} numberOfLines={1}>
                      {item.tipo === 'banco' ? 'Banco' : 'Corretora'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {searchText.length >= 2 && !exactMatch ? (
                <TouchableOpacity style={styles.dropItem}
                  onPress={handleConfirmCustom}
                  accessibilityRole="button" accessibilityLabel={'Usar ' + searchText}>
                  <Text style={styles.dropItemCustom}>{'Usar "' + normalizeCorretora(searchText) + '"'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

var styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 10,
    color: C.dim,
    fontFamily: F.mono,
    letterSpacing: 0.8,
    marginTop: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inputWrapper: {
    position: 'relative',
    zIndex: 10,
    marginTop: 4,
  },
  input: {
    backgroundColor: C.cardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: C.text,
    fontFamily: F.body,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: C.cardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: SIZE.radius,
    marginTop: 2,
    zIndex: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dropItem: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  dropItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropItemName: {
    fontFamily: F.body,
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  dropItemBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dropItemTipo: {
    fontSize: 11,
    color: C.sub,
    fontFamily: F.body,
    marginTop: 1,
  },
  dropItemCustom: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.accent,
  },
  minhaBadge: {
    backgroundColor: C.accent + '20',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  minhaBadgeText: {
    fontSize: 9,
    fontFamily: F.mono,
    color: C.accent,
    fontWeight: '700',
  },
  moedaBadge: {
    backgroundColor: C.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  moedaBadgeText: {
    fontSize: 9,
    fontFamily: F.mono,
    color: C.sub,
    fontWeight: '600',
  },
});
