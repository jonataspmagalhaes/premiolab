'use client';

// Drawer lateral com historico completo de proventos de UM ticker.
// Dispara quando o user clica em cima do ticker numa row da lista.

import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { TickerLogo } from '@/components/TickerLogo';
import { useAppStore } from '@/store';
import { tipoLabel, valorLiquido, isIntTicker } from '@/lib/proventosUtils';
import { fmtBRL, fmtMonthYear, fmtDate } from '@/lib/fmt';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

interface Props {
  ticker: string | null;
  onClose: () => void;
}

export function TickerHistoricoSheet(props: Props) {
  var proventos = useAppStore(function (s) { return s.proventos; });
  var positions = useAppStore(function (s) { return s.positions; });

  var pos = useMemo(function () {
    if (!props.ticker) return null;
    return positions.find(function (p) { return p.ticker === props.ticker; }) || null;
  }, [positions, props.ticker]);

  // Todos os proventos do ticker
  var doTicker = useMemo(function () {
    if (!props.ticker) return [] as typeof proventos;
    return proventos
      .filter(function (p) { return p.ticker === props.ticker; })
      .map(function (p) { return { ...p, _ts: new Date(p.data_pagamento).getTime() }; })
      .sort(function (a, b) { return b._ts - a._ts; });
  }, [proventos, props.ticker]);

  // Agregacao anual pra grafico
  var porAno = useMemo(function () {
    var mapa: Record<string, number> = {};
    doTicker.forEach(function (p) {
      var ts = new Date(p.data_pagamento).getTime();
      if (isNaN(ts) || ts > Date.now()) return;
      var y = String(new Date(p.data_pagamento).getFullYear());
      mapa[y] = (mapa[y] || 0) + valorLiquido(p.valor_total || 0, p.tipo_provento, p.ticker);
    });
    return Object.keys(mapa).sort().map(function (y) {
      return { ano: y, valor: mapa[y] };
    });
  }, [doTicker]);

  // Estatisticas
  var stats = useMemo(function () {
    var total12m = 0;
    var total24m = 0;
    var count = 0;
    var now = Date.now();
    doTicker.forEach(function (p) {
      var ts = new Date(p.data_pagamento).getTime();
      if (isNaN(ts) || ts > now) return;
      var liq = valorLiquido(p.valor_total || 0, p.tipo_provento, p.ticker);
      if (ts >= now - 365 * 86400000) total12m += liq;
      if (ts >= now - 2 * 365 * 86400000) total24m += liq;
      count += 1;
    });
    // YoC medio: media dos valores_por_cota 12m dividida pelo PM atual
    var soma = 0;
    var n = 0;
    doTicker.forEach(function (p) {
      var ts = new Date(p.data_pagamento).getTime();
      if (isNaN(ts) || ts > now) return;
      if (ts < now - 365 * 86400000) return;
      if (!p.valor_por_cota) return;
      soma += p.valor_por_cota;
      n += 1;
    });
    var somaAnoVpC = soma;
    var yoc = pos && pos.pm > 0 && somaAnoVpC > 0 ? (somaAnoVpC / pos.pm) * 100 : 0;
    return { total12m: total12m, total24m: total24m, count: count, yoc: yoc };
  }, [doTicker, pos]);

  var cat = pos ? pos.categoria : (props.ticker && isIntTicker(props.ticker) ? 'stock_int' : 'acao');

  return (
    <Sheet open={props.ticker != null} onOpenChange={function (o) { if (!o) props.onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[460px] bg-[#0a0d14] border-white/[0.08]">
        {props.ticker ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <TickerLogo ticker={props.ticker} categoria={cat} size={44} />
                <div>
                  <SheetTitle className="text-[16px]">{props.ticker}</SheetTitle>
                  <SheetDescription className="text-[11px]">
                    {pos ? pos.quantidade.toLocaleString('pt-BR') + ' cotas · PM R$ ' + fmtBRL(pos.pm) : 'Sem posicao atual'}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="px-4 space-y-4 mt-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Ultimos 12m" value={'R$ ' + fmtBRL(stats.total12m)} accent="text-income" />
                <MiniStat label="Ultimos 24m" value={'R$ ' + fmtBRL(stats.total24m)} />
                <MiniStat
                  label="YoC 12m"
                  value={stats.yoc > 0 ? stats.yoc.toFixed(2) + '%' : '—'}
                  accent="text-emerald-300"
                  sub="rendimento / PM"
                />
                <MiniStat label="Pagamentos historicos" value={String(stats.count)} />
              </div>

              {/* Grafico por ano */}
              {porAno.length > 1 ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1">Recebido por ano</p>
                  <div style={{ width: '100%', height: 120 }}>
                    <ResponsiveContainer>
                      <BarChart data={porAno} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                        <XAxis dataKey="ano" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: 'rgba(249,115,22,0.06)' }}
                          contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
                          formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), 'Liquido']; }}
                        />
                        <Bar dataKey="valor" fill="#F97316" radius={[3, 3, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              {/* Lista cronologica */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-2">Historico ({doTicker.length})</p>
                <div className="space-y-1.5">
                  {doTicker.slice(0, 100).map(function (p, i) {
                    var liq = valorLiquido(p.valor_total || 0, p.tipo_provento, p.ticker);
                    var isFuturo = new Date(p.data_pagamento).getTime() > Date.now();
                    return (
                      <div key={(p.id || p.ticker) + '-' + i} className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono text-white/70">{fmtDate(new Date(p.data_pagamento))}</span>
                            <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider bg-white/[0.04] border border-white/[0.08] text-white/60">
                              {tipoLabel(p.tipo_provento)}
                            </span>
                            {isFuturo ? (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                confirmado
                              </span>
                            ) : null}
                          </div>
                          {p.valor_por_cota ? (
                            <p className="text-[9px] text-white/40 mt-0.5 font-mono">
                              R$ {p.valor_por_cota.toFixed(4)} / cota
                            </p>
                          ) : null}
                        </div>
                        <span className="text-[12px] font-mono font-semibold text-income shrink-0">
                          R$ {fmtBRL(liq)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {doTicker.length > 100 ? (
                  <p className="text-[10px] text-white/30 italic mt-2 text-center">
                    Exibindo os 100 mais recentes de {doTicker.length} pagamentos.
                  </p>
                ) : null}
              </div>

              {fmtMonthYear(new Date()).length === 0 ? null : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function MiniStat(props: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="linear-card rounded-lg p-3">
      <p className="text-[9px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-[14px] font-mono font-bold mt-0.5 ' + (props.accent || 'text-white')}>{props.value}</p>
      {props.sub ? <p className="text-[9px] text-white/30 mt-0.5">{props.sub}</p> : null}
    </div>
  );
}
