// RelatoriosMensaisScreen — Fase J.
// Lista os relatorios mensais de renda gerados pela edge function
// monthly-income-report (salvos em portfolio_backups com prefix
// 'monthly_income_report_YYYY_MM'). Abre o HTML em WebView.

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../../theme';
import { T } from '../../theme/tokens';
import { Glass } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';

// WebView opcional — se nao instalado, mostra texto puro
var WebView = null;
try {
  WebView = require('react-native-webview').WebView;
} catch (_) {
  WebView = null;
}

var MESES_LONG = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}

function parsePrefix(name) {
  // monthly_income_report_2026_04 → { ano: 2026, mes: 3 }
  var m = (name || '').match(/^monthly_income_report_(\d{4})_(\d{2})$/);
  if (!m) return null;
  return { ano: parseInt(m[1], 10), mes: parseInt(m[2], 10) - 1 };
}

export default function RelatoriosMensaisScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _list = useState([]); var list = _list[0]; var setList = _list[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _selected = useState(null); var selected = _selected[0]; var setSelected = _selected[1];
  var _generating = useState(false); var generating = _generating[0]; var setGenerating = _generating[1];

  function loadAll() {
    if (!user) return;
    setLoading(true);
    supabase
      .from('portfolio_backups')
      .select('id, portfolio_name, dados, created_at, expires_at')
      .eq('user_id', user.id)
      .like('portfolio_name', 'monthly_income_report_%')
      .order('created_at', { ascending: false })
      .limit(24)
      .then(function(res) {
        var arr = (res && res.data) || [];
        var parsed = arr.map(function(r) {
          var meta = parsePrefix(r.portfolio_name);
          return {
            id: r.id,
            ano: meta ? meta.ano : 0,
            mes: meta ? meta.mes : 0,
            mesLabel: meta ? (MESES_LONG[meta.mes] + ' ' + meta.ano) : r.portfolio_name,
            html: (r.dados && r.dados.html) || '',
            totals: (r.dados && r.dados.totals) || null,
            prevTotals: (r.dados && r.dados.prev_totals) || null,
            createdAt: r.created_at,
          };
        });
        setList(parsed);
        setLoading(false);
      });
  }

  useFocusEffect(useCallback(function() { loadAll(); }, [user]));

  function gerarManual() {
    if (!user || generating) return;
    setGenerating(true);
    var url = 'https://zephynezarjsxzselozi.supabase.co/functions/v1/monthly-income-report?user_id=' + user.id;
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function(r) { return r.json(); })
      .then(function() {
        // Recarrega lista
        setTimeout(function() {
          loadAll();
          setGenerating(false);
        }, 1500);
      })
      .catch(function(err) {
        console.warn('gerarManual error:', err && err.message);
        setGenerating(false);
      });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.sm, marginBottom: T.space.md }}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Ionicons name="chevron-back" size={26} color={T.color.accent} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.display }}>
          Relatorios Mensais
        </Text>
      </View>

      {/* Info + acao */}
      <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
        <Text style={{ fontSize: 12, color: T.color.textSecondary, fontFamily: F.body, marginBottom: T.space.sm, lineHeight: 18 }}>
          Geramos automaticamente um relatorio do mes anterior todo dia 5. Voce
          tambem pode gerar agora pra ver o mes atual.
        </Text>
        <TouchableOpacity
          onPress={gerarManual}
          disabled={generating}
          activeOpacity={0.8}
          style={{
            backgroundColor: generating ? T.color.surface2 : T.color.accentBg,
            paddingVertical: T.space.sm,
            borderRadius: T.radius.sm,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: T.space.xs,
            borderWidth: 1,
            borderColor: T.color.borderAccent,
          }}
        >
          {generating ? (
            <ActivityIndicator size="small" color={T.color.accent} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={T.color.accent} />
          )}
          <Text style={{ fontSize: 12, color: T.color.accent, fontFamily: F.display, fontWeight: '700' }}>
            {generating ? 'Gerando...' : 'Gerar relatorio agora'}
          </Text>
        </TouchableOpacity>
      </Glass>

      {/* Lista */}
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: T.space.xxl }}>
          <ActivityIndicator size="large" color={T.color.accent} />
        </View>
      ) : list.length === 0 ? (
        <Glass padding={T.space.cardPad}>
          <View style={{ alignItems: 'center', paddingVertical: T.space.lg }}>
            <Ionicons name="document-text-outline" size={32} color={T.color.textMuted} />
            <Text style={{ fontSize: 12, color: T.color.textMuted, fontFamily: F.body, marginTop: T.space.sm, textAlign: 'center' }}>
              Nenhum relatorio gerado ainda.{'\n'}Toque em "Gerar relatorio agora" pra ver o mes atual.
            </Text>
          </View>
        </Glass>
      ) : (
        list.map(function(item) {
          var totalMes = item.totals ? item.totals.total || 0 : 0;
          var prevTotal = item.prevTotals ? item.prevTotals.total || 0 : 0;
          var delta = prevTotal > 0 ? ((totalMes - prevTotal) / prevTotal) * 100 : 0;
          var deltaColor = delta > 0 ? T.color.income : delta < 0 ? T.color.danger : T.color.textMuted;
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.85}
              onPress={function() { setSelected(item); }}
            >
              <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.sm }}>
                  <View style={{
                    width: 44, height: 44, borderRadius: T.radius.md,
                    backgroundColor: T.color.incomeBgStrong,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="document-text" size={20} color={T.color.income} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
                      {item.mesLabel}
                    </Text>
                    <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono }}>
                      {item.totals ? (item.totals.itemCount || 0) + ' eventos' : 'sem dados'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }}>
                      {'R$ ' + fmtInt(totalMes)}
                    </Text>
                    {prevTotal > 0 ? (
                      <Text style={{ fontSize: 10, color: deltaColor, fontFamily: F.mono, fontWeight: '600' }}>
                        {(delta >= 0 ? '+' : '') + delta.toFixed(0) + '%'}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Glass>
            </TouchableOpacity>
          );
        })
      )}

      <View style={{ height: T.space.xl }} />

      {/* Modal de visualizacao */}
      <Modal visible={!!selected} animationType="slide" onRequestClose={function() { setSelected(null); }}>
        <View style={{ flex: 1, backgroundColor: T.color.bg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: T.space.sm,
            padding: T.space.md, borderBottomWidth: 1, borderBottomColor: T.color.border,
          }}>
            <TouchableOpacity onPress={function() { setSelected(null); }}>
              <Ionicons name="close" size={26} color={T.color.accent} />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 16, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
              {selected ? selected.mesLabel : ''}
            </Text>
          </View>
          {selected ? (
            WebView ? (
              <WebView
                source={{ html: selected.html || '<p>Sem conteudo</p>' }}
                style={{ flex: 1, backgroundColor: T.color.bg }}
              />
            ) : (
              <ScrollView contentContainerStyle={{ padding: T.space.md }}>
                <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono, marginBottom: T.space.md }}>
                  WebView nao instalado. Mostrando dados resumidos:
                </Text>
                {selected.totals ? (
                  <View>
                    <Text style={{ fontSize: 24, color: T.color.income, fontFamily: F.mono, fontWeight: '800', marginBottom: T.space.sm }}>
                      {'R$ ' + fmt(selected.totals.total)}
                    </Text>
                    <Text style={{ fontSize: 12, color: T.color.textSecondary, fontFamily: F.body, marginBottom: T.space.xs }}>
                      {'FIIs: R$ ' + fmt(selected.totals.fii)}
                    </Text>
                    <Text style={{ fontSize: 12, color: T.color.textSecondary, fontFamily: F.body, marginBottom: T.space.xs }}>
                      {'Acoes: R$ ' + fmt(selected.totals.acao)}
                    </Text>
                    <Text style={{ fontSize: 12, color: T.color.textSecondary, fontFamily: F.body }}>
                      {'Opcoes: R$ ' + fmt(selected.totals.opcao)}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            )
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  content: { padding: T.space.screenPad },
});
