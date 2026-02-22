import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { C, F, SIZE } from '../theme';

export default function TickerInput(props) {
  var value = props.value || '';
  var onChangeText = props.onChangeText;
  var tickers = props.tickers || [];
  var placeholder = props.placeholder || 'Ex: PETR4';
  var style = props.style;
  var autoFocus = props.autoFocus;
  var returnKeyType = props.returnKeyType;
  var onSearch = props.onSearch; // opcional: function(query) => Promise<[{ticker, name}]>

  var _show = useState(false); var showSuggestions = _show[0]; var setShowSuggestions = _show[1];
  var _searching = useState(false); var searching = _searching[0]; var setSearching = _searching[1];
  var _apiResults = useState([]); var apiResults = _apiResults[0]; var setApiResults = _apiResults[1];
  var _debounceRef = useRef(null);

  // Cleanup debounce on unmount
  useEffect(function() {
    return function() {
      if (_debounceRef.current) clearTimeout(_debounceRef.current);
    };
  }, []);

  // Portfolio matches
  var portfolioMax = onSearch ? 3 : 6;
  var portfolioMatches = [];
  if (value.length >= 1 && showSuggestions) {
    var upper = value.toUpperCase();
    for (var i = 0; i < tickers.length; i++) {
      if (tickers[i].indexOf(upper) === 0 && tickers[i] !== upper) {
        portfolioMatches.push({ ticker: tickers[i], name: '', source: 'portfolio' });
      }
      if (portfolioMatches.length >= portfolioMax) break;
    }
  }

  // Merge portfolio + API (dedup)
  var merged = [];
  for (var p = 0; p < portfolioMatches.length; p++) {
    merged.push(portfolioMatches[p]);
  }
  if (onSearch) {
    var existingTickers = {};
    for (var e = 0; e < merged.length; e++) {
      existingTickers[merged[e].ticker] = true;
    }
    for (var a = 0; a < apiResults.length; a++) {
      if (!existingTickers[apiResults[a].ticker]) {
        merged.push({ ticker: apiResults[a].ticker, name: apiResults[a].name || '', source: 'api' });
      }
      if (merged.length >= 8) break;
    }
  }

  function handleChange(t) {
    var up = t.toUpperCase();
    onChangeText(up);
    setShowSuggestions(true);

    if (onSearch) {
      if (_debounceRef.current) clearTimeout(_debounceRef.current);
      if (up.length < 2) {
        setApiResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      _debounceRef.current = setTimeout(function() {
        onSearch(up).then(function(results) {
          setApiResults(results || []);
          setSearching(false);
        }).catch(function() {
          setApiResults([]);
          setSearching(false);
        });
      }, 300);
    }
  }

  function handleSelect(t) {
    onChangeText(t);
    setShowSuggestions(false);
    setApiResults([]);
    if (_debounceRef.current) clearTimeout(_debounceRef.current);
  }

  var showDropdown = showSuggestions && (merged.length > 0 || searching);

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
      {showDropdown ? (
        <View style={styles.dropdown} accessibilityRole="list">
          {searching ? (
            <View style={styles.searchingRow}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={styles.searchingText}>Buscando...</Text>
            </View>
          ) : null}
          {merged.map(function(item, idx) {
            return (
              <TouchableOpacity key={item.ticker + '-' + idx} style={styles.item} onPress={function() { handleSelect(item.ticker); }}
                accessibilityRole="button" accessibilityLabel={item.ticker + (item.name ? ', ' + item.name : '')}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemText}>{item.ticker}</Text>
                  {item.source === 'portfolio' ? (
                    <View style={styles.portfolioBadge}>
                      <Text style={styles.portfolioBadgeText}>CARTEIRA</Text>
                    </View>
                  ) : null}
                </View>
                {item.name ? (
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                ) : null}
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
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchingText: {
    fontSize: 12,
    color: C.sub,
    fontFamily: F.body,
  },
  item: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemText: {
    fontFamily: F.mono,
    fontSize: 14,
    color: C.text,
  },
  itemName: {
    fontSize: 11,
    color: C.sub,
    fontFamily: F.body,
    marginTop: 1,
  },
  portfolioBadge: {
    backgroundColor: C.accent + '20',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  portfolioBadgeText: {
    fontSize: 9,
    fontFamily: F.mono,
    color: C.accent,
    fontWeight: '700',
  },
});
