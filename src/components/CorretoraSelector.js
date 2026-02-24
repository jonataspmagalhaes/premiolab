import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../theme';
import { Pill } from './Primitives';
import { getSaldos } from '../services/database';
import { getSymbol } from '../services/currencyService';

// Lista abrangente de instituições com metadados (usada pelo AddContaScreen/OnboardingScreen)
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

function normalizeCorretora(name) {
  return (name || '').toUpperCase().trim().replace(/\s+/g, ' ');
}

function getInstitutionMeta(name) {
  var upper = (name || '').toUpperCase();
  for (var i = 0; i < ALL_INSTITUTIONS.length; i++) {
    if (ALL_INSTITUTIONS[i].name.toUpperCase() === upper) return ALL_INSTITUTIONS[i];
  }
  return null;
}

export { ALL_INSTITUTIONS, getInstitutionMeta };

export default function CorretoraSelector(props) {
  var value = props.value || '';
  var onSelect = props.onSelect;
  var userId = props.userId;
  var color = props.color || C.acoes;
  var label = props.label || 'CORRETORA';
  var showLabel = props.showLabel !== false;

  var navigation = useNavigation();
  var _userList = useState([]); var userList = _userList[0]; var setUserList = _userList[1];

  // Fetch user accounts from saldos_corretora (refresh on focus)
  useFocusEffect(useCallback(function() {
    if (!userId) return;
    getSaldos(userId).then(function(result) {
      var list = result.data || [];
      setUserList(list);
    }).catch(function() {});
  }, [userId]));

  // Build pill list from user accounts (dedup by UPPERCASE name)
  var pillNames = [];
  var seen = {};
  // Track which names have multiple currencies
  var moedaCountByName = {};

  for (var u = 0; u < userList.length; u++) {
    var uName = userList[u].corretora || userList[u].name || '';
    var uKey = uName.toUpperCase();
    var uMoeda = userList[u].moeda || 'BRL';
    if (!moedaCountByName[uKey]) moedaCountByName[uKey] = {};
    moedaCountByName[uKey][uMoeda] = true;
  }

  for (var i = 0; i < userList.length; i++) {
    var sName = userList[i].corretora || userList[i].name || '';
    var sKey = sName.toUpperCase();
    var sMoeda = userList[i].moeda || 'BRL';
    var moedaKeys = Object.keys(moedaCountByName[sKey] || {});
    var hasMultiMoeda = moedaKeys.length > 1;

    if (hasMultiMoeda) {
      // Show separate pill per currency
      var pillKey = sKey + '_' + sMoeda;
      if (!seen[pillKey]) {
        seen[pillKey] = true;
        pillNames.push({
          name: sName,
          moeda: sMoeda,
          showMoeda: true,
          tipo: userList[i].tipo,
        });
      }
    } else {
      if (!seen[sKey]) {
        seen[sKey] = true;
        pillNames.push({
          name: sName,
          moeda: sMoeda,
          showMoeda: false,
          tipo: userList[i].tipo,
        });
      }
    }
  }

  // If current value not in list, prepend it
  if (value) {
    var valKey = value.toUpperCase();
    var found = false;
    for (var f = 0; f < pillNames.length; f++) {
      if (pillNames[f].name.toUpperCase() === valKey) { found = true; break; }
    }
    if (!found) {
      pillNames.unshift({ name: value, moeda: 'BRL', showMoeda: false, tipo: null });
    }
  }

  function handlePillPress(pill) {
    if (value === pill.name) {
      onSelect('', null);
    } else {
      var meta = { moeda: pill.moeda, tipo: pill.tipo };
      onSelect(pill.name, meta);
    }
  }

  function handleAddConta() {
    navigation.navigate('AddConta');
  }

  return (
    <View style={styles.container}>
      {showLabel ? (
        <Text style={styles.label}>{label}</Text>
      ) : null}
      <View style={styles.pillRow}>
        {pillNames.map(function(pill, idx) {
          var pillLabel = pill.name;
          if (pill.showMoeda) {
            pillLabel = pill.name + ' (' + pill.moeda + ')';
          }
          return (
            <Pill key={pill.name + '_' + pill.moeda + '_' + idx} active={value === pill.name} color={color}
              onPress={function() { handlePillPress(pill); }}>
              {pillLabel}
            </Pill>
          );
        })}
        <TouchableOpacity
          onPress={handleAddConta}
          style={styles.addContaBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Adicionar Conta"
        >
          <Ionicons name="add-circle-outline" size={16} color={C.accent} />
          <Text style={styles.addContaBtnText}>Adicionar Conta</Text>
        </TouchableOpacity>
      </View>
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
    alignItems: 'center',
  },
  addContaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: C.accent + '40',
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addContaBtnText: {
    fontSize: 12,
    color: C.accent,
    fontFamily: F.body,
    fontWeight: '600',
  },
});
