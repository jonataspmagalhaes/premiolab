import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, F, SIZE } from '../theme';

export default function TickerInput(props) {
  var value = props.value || '';
  var onChangeText = props.onChangeText;
  var tickers = props.tickers || [];
  var placeholder = props.placeholder || 'Ex: PETR4';
  var style = props.style;
  var autoFocus = props.autoFocus;
  var returnKeyType = props.returnKeyType;

  var _show = useState(false); var showSuggestions = _show[0]; var setShowSuggestions = _show[1];

  var filtered = [];
  if (value.length >= 1 && showSuggestions) {
    var upper = value.toUpperCase();
    for (var i = 0; i < tickers.length; i++) {
      if (tickers[i].indexOf(upper) === 0 && tickers[i] !== upper) {
        filtered.push(tickers[i]);
      }
      if (filtered.length >= 6) break;
    }
  }

  function handleChange(t) {
    var up = t.toUpperCase();
    onChangeText(up);
    setShowSuggestions(true);
  }

  function handleSelect(t) {
    onChangeText(t);
    setShowSuggestions(false);
  }

  return (
    <View style={styles.wrapper}>
      <TextInput
        value={value}
        onChangeText={handleChange}
        onFocus={function() { setShowSuggestions(true); }}
        onBlur={function() {
          setTimeout(function() { setShowSuggestions(false); }, 150);
        }}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        autoCapitalize="characters"
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        style={style}
        accessibilityLabel="Buscar ticker"
      />
      {filtered.length > 0 ? (
        <View style={styles.dropdown} accessibilityRole="list">
          {filtered.map(function(t) {
            return (
              <TouchableOpacity key={t} style={styles.item} onPress={function() { handleSelect(t); }}
                accessibilityRole="button" accessibilityLabel={t}>
                <Text style={styles.itemText}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

var styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    zIndex: 10,
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
  item: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  itemText: {
    fontFamily: F.mono,
    fontSize: 14,
    color: C.text,
  },
});
