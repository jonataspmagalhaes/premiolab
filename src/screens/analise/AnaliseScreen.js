import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getPositions, getProventos, getOpcoes, getProfile } from '../../services/database';
import { Glass, Badge, Pill, SectionLabel, Gauge } from '../../components';

export default function AnaliseScreen() {
  const { user } = useAuth();
  const [sub, setSub] = useState('perf');
  const [positions, setPositions] = useState([]);
  const [proventos, setProventos] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    const [posRes, provRes] = await Promise.all([
      getPositions(user.id),
      getProventos(user.id),
    ]);
    setPositions(posRes.data || []);
    setProventos(provRes.data || []);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { load(); }, [user]));

  const totalPatrimonio = positions.reduce(
    (s, p) => s + p.quantidade * (p.preco_atual || p.pm), 0
  );
  const totalProvs = proventos.reduce((s, p) => s + (p.valor_total || 0), 0);

  // Group proventos by month
  const provsByMonth = {};
  proventos.forEach((p) => {
    const d = new Date(p.data_pagamento);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!provsByMonth[key]) provsByMonth[key] = [];
    provsByMonth[key].push(p);
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        {[
          { k: 'perf', l: 'Performance' },
          { k: 'aloc', l: 'Alocação' },
          { k: 'prov', l: 'Proventos' },
          { k: 'ir', l: 'IR' },
        ].map((t) => (
          <Pill key={t.k} active={sub === t.k} color={C.accent} onPress={() => setSub(t.k)}>
            {t.l}
          </Pill>
        ))}
      </View>

      {/* Performance */}
      {sub === 'perf' && (
        <>
          <Glass glow={C.accent} padding={14}>
            <SectionLabel>PATRIMÔNIO TOTAL</SectionLabel>
            <Text style={styles.bigValue}>
              R$ {totalPatrimonio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Text>
          </Glass>
          <Glass padding={14}>
            <SectionLabel>PROVENTOS TOTAIS</SectionLabel>
            <Text style={[styles.bigValue, { color: C.green }]}>
              R$ {totalProvs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Text>
          </Glass>
          <Glass padding={14}>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
              Gráficos de rentabilidade vs IBOV e CDI serão conectados à API brapi.dev para dados reais.
            </Text>
          </Glass>
        </>
      )}

      {/* Alocação */}
      {sub === 'aloc' && (
        <>
          {positions.length === 0 ? (
            <Glass padding={20}>
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                Adicione ativos para ver a alocação
              </Text>
            </Glass>
          ) : (
            <>
              {/* Donut */}
              <Glass glow={C.accent} padding={14}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <View style={{ position: 'relative', width: 90, height: 90 }}>
                    <Svg width={90} height={90} viewBox="0 0 90 90">
                      {(() => {
                        let cum = 0;
                        const colors = { 'AÇ': C.acoes, 'FII': C.fiis, 'ETF': C.etfs };
                        const grouped = {};
                        positions.forEach((p) => {
                          const t = p.tipo_ativo || 'AÇ';
                          if (!grouped[t]) grouped[t] = 0;
                          grouped[t] += p.quantidade * (p.preco_atual || p.pm);
                        });
                        return Object.entries(grouped).map(([tipo, valor], i) => {
                          const pct = totalPatrimonio > 0 ? valor / totalPatrimonio : 0;
                          const r = 38, circ = 2 * Math.PI * r;
                          const dash = pct * circ;
                          const offset = -(cum) * circ;
                          cum += pct;
                          return (
                            <Circle
                              key={i}
                              cx={45} cy={45} r={r}
                              fill="none"
                              stroke={colors[tipo] || C.accent}
                              strokeWidth={8}
                              strokeDasharray={`${dash} ${circ - dash}`}
                              strokeDashoffset={offset}
                              rotation={-90}
                              origin="45,45"
                            />
                          );
                        });
                      })()}
                    </Svg>
                    <View style={styles.donutCenter}>
                      <Text style={styles.donutValue}>
                        R$ {(totalPatrimonio / 1000).toFixed(0)}k
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    {(() => {
                      const colors = { 'AÇ': C.acoes, 'FII': C.fiis, 'ETF': C.etfs };
                      const labels = { 'AÇ': 'Ações', 'FII': 'FIIs', 'ETF': 'ETFs' };
                      const grouped = {};
                      positions.forEach((p) => {
                        const t = p.tipo_ativo || 'AÇ';
                        if (!grouped[t]) grouped[t] = 0;
                        grouped[t] += p.quantidade * (p.preco_atual || p.pm);
                      });
                      return Object.entries(grouped).map(([tipo, valor], i) => {
                        const pct = totalPatrimonio > 0 ? (valor / totalPatrimonio * 100) : 0;
                        return (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors[tipo] || C.accent }} />
                            <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body, flex: 1 }}>
                              {labels[tipo] || tipo}
                            </Text>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors[tipo] || C.accent, fontFamily: F.mono }}>
                              {pct.toFixed(0)}%
                            </Text>
                          </View>
                        );
                      });
                    })()}
                  </View>
                </View>
              </Glass>

              {/* Position list */}
              <Glass padding={0}>
                {positions.map((p, i) => {
                  const colors = { 'AÇ': C.acoes, 'FII': C.fiis, 'ETF': C.etfs };
                  const valor = p.quantidade * (p.preco_atual || p.pm);
                  const pct = totalPatrimonio > 0 ? (valor / totalPatrimonio * 100) : 0;
                  return (
                    <View key={i} style={[styles.allocRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: colors[p.tipo_ativo] || C.accent }} />
                        <Text style={styles.allocTicker}>{p.ticker}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={styles.allocBarBg}>
                          <View style={[styles.allocBarFill, { width: `${pct}%`, backgroundColor: colors[p.tipo_ativo] || C.accent }]} />
                        </View>
                        <Text style={[styles.allocPct, { color: colors[p.tipo_ativo] || C.accent }]}>{pct.toFixed(0)}%</Text>
                      </View>
                    </View>
                  );
                })}
              </Glass>
            </>
          )}
        </>
      )}

      {/* Proventos */}
      {sub === 'prov' && (
        <>
          <Glass glow={C.fiis} padding={14}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {[
                { l: 'TOTAL', v: `R$ ${totalProvs.toLocaleString('pt-BR')}`, c: C.fiis },
                { l: 'REGISTROS', v: String(proventos.length), c: C.accent },
              ].map((d, i) => (
                <View key={i} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 7, color: C.dim, fontFamily: F.mono }}>{d.l}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: d.c, fontFamily: F.display }}>{d.v}</Text>
                </View>
              ))}
            </View>
          </Glass>

          {Object.entries(provsByMonth)
            .sort(([a], [b]) => b.localeCompare(a))
            .slice(0, 6)
            .map(([month, items]) => {
              const total = items.reduce((s, p) => s + (p.valor_total || 0), 0);
              const [y, m] = month.split('-');
              const label = `${['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][parseInt(m)]}/${y}`;
              return (
                <Glass key={month} padding={0}>
                  <View style={styles.monthHeader}>
                    <Text style={styles.monthLabel}>{label}</Text>
                    <Text style={[styles.monthTotal, { color: C.green }]}>
                      +R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  {items.map((p, i) => (
                    <View key={i} style={[styles.provRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>{p.ticker}</Text>
                        <Badge text={p.tipo_provento || 'DIV'} color={C.fiis} />
                      </View>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                        +R$ {(p.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Text>
                    </View>
                  ))}
                </Glass>
              );
            })}
        </>
      )}

      {/* IR */}
      {sub === 'ir' && (
        <Glass padding={20}>
          <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center', lineHeight: 20 }}>
            O módulo de IR calculará automaticamente impostos por tipo de operação (ações swing/day trade, FIIs, opções, ETFs) com compensação de prejuízo acumulado e geração de DARF.
          </Text>
        </Glass>
      )}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  subTabs: { flexDirection: 'row', gap: 5 },
  bigValue: { fontSize: 24, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 4 },

  donutCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  donutValue: { fontSize: 13, fontWeight: '800', color: C.text, fontFamily: F.display },

  allocRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  allocTicker: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  allocBarBg: { width: 60, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)' },
  allocBarFill: { height: 4, borderRadius: 2 },
  allocPct: { fontSize: 12, fontWeight: '800', fontFamily: F.display, width: 36, textAlign: 'right' },

  monthHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 12,
  },
  monthLabel: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  monthTotal: { fontSize: 12, fontWeight: '700', fontFamily: F.mono },
  provRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12,
  },
});
