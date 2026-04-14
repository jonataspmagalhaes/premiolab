'use client';

import { useAppStore, type Position } from '@/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useUser, usePatrimonioSnapshots } from '@/lib/queries';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

// ═══════ Formatters ═══════

function fmtBR(v: number) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmtDec(v: number) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(v: number) {
  if (v >= 1000000) return (v / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '';
  if (v >= 1000) return (v / 1000).toFixed(0) + 'k';
  return fmtBR(v);
}

// ═══════ Constants ═══════

var CLASS_COLORS: Record<string, string> = {
  acao: '#F97316', fii: '#22C55E', rf: '#06B6D4', etf: '#F59E0B',
  stock_int: '#E879F9', caixa: 'rgba(255,255,255,0.15)',
};
var CLASS_LABELS: Record<string, string> = {
  acao: 'Acoes', fii: 'FIIs', rf: 'Renda Fixa', etf: 'ETFs',
  stock_int: 'Internacional', caixa: 'Caixa',
};
var CLASS_LUCIDE: Record<string, string> = {
  acao: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  fii: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  rf: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  etf: 'M4 6h16M4 12h16m-7 6h7',
  stock_int: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9',
  caixa: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
};

// ═══════ SVG Icon ═══════

function Ico({ d, className, style }: { d: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className || 'w-4 h-4'} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ═══════ Ticker Logo ═══════

function TickerLogo({ ticker, categoria, size }: { ticker: string; categoria: string; size?: number }) {
  var s = size || 36;
  var _failed = useState(false);
  var failed = _failed[0];
  var setFailed = _failed[1];
  var color = CLASS_COLORS[categoria] || '#F97316';
  var iconD = CLASS_LUCIDE[categoria] || CLASS_LUCIDE.acao;
  // StatusInvest logo URL
  var base = ticker.replace(/\d+[BF]?$/, '').toLowerCase();
  var logoUrl = 'https://statusinvest.com.br/img/company/bottom/' + base + '.png';

  if (failed) {
    return (
      <div
        className="rounded-xl flex items-center justify-center border"
        style={{ width: s, height: s, backgroundColor: color + '15', borderColor: color + '15' }}
      >
        <Ico d={iconD} className="w-4 h-4" style={{ color: color }} />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl flex items-center justify-center border overflow-hidden"
      style={{ width: s, height: s, backgroundColor: color + '10', borderColor: color + '15' }}
    >
      <Image
        src={logoUrl}
        alt={ticker}
        width={s - 8}
        height={s - 8}
        className="rounded-lg object-contain"
        onError={function () { setFailed(true); }}
        unoptimized
      />
    </div>
  );
}

// ═══════ Proventos Calendar ═══════

var MONTH_NAMES_FULL = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function ProventosCalendar({ proventos }: { proventos: Array<{ ticker: string; tipo_provento: string; valor_total: number; data_pagamento: string }> }) {
  var now = new Date();
  var _offset = useState(0); // 0 = mes atual, +1 = proximo, -1 = anterior
  var offset = _offset[0];
  var setOffset = _offset[1];
  var _selDay = useState<number | null>(null);
  var selDay = _selDay[0];
  var setSelDay = _selDay[1];
  var viewDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  var year = viewDate.getFullYear();
  var month = viewDate.getMonth();
  var isCurrentMonth = offset === 0;

  // Proventos do mes atual agrupados por dia
  var porDia: Record<number, Array<{ ticker: string; valor: number; tipo: string }>> = {};
  var totalMes = 0;

  // Dedup por (dia + ticker + tipo) — soma valores duplicados (multi-corretora/multi-portfolio)
  var dedupMap: Record<string, { dia: number; ticker: string; tipo: string; valor: number }> = {};
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var d = new Date(p.data_pagamento);
    if (isNaN(d.getTime())) continue;
    if (d.getFullYear() === year && d.getMonth() === month) {
      var dia = d.getDate();
      var tipo = p.tipo_provento || 'dividendo';
      var ticker = (p.ticker || '').toUpperCase().trim();
      var k = dia + '|' + ticker + '|' + tipo;
      if (!dedupMap[k]) {
        dedupMap[k] = { dia: dia, ticker: ticker, tipo: tipo, valor: 0 };
      }
      // Heurística: se já existe uma entrada com mesmo valor exato, é duplicata — pula
      var v = p.valor_total || 0;
      if (dedupMap[k] && Math.abs(dedupMap[k].valor - v) < 0.01) continue;
      // Caso contrario, soma (multi-portfolio legitimo de tickers diferentes nao chega aqui pq key é dia+ticker+tipo)
      if (!dedupMap[k]) dedupMap[k] = { dia: dia, ticker: ticker, tipo: tipo, valor: 0 };
      dedupMap[k].valor = Math.max(dedupMap[k].valor, v);
    }
  }
  // Achatar de volta + recalcular totalMes a partir dos valores dedupados
  var dedupKeys = Object.keys(dedupMap);
  for (var dk = 0; dk < dedupKeys.length; dk++) {
    var entry = dedupMap[dedupKeys[dk]];
    if (!porDia[entry.dia]) porDia[entry.dia] = [];
    porDia[entry.dia].push({ ticker: entry.ticker, valor: entry.valor, tipo: entry.tipo });
    totalMes += entry.valor;
  }

  // Gerar grid do calendario
  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var today = isCurrentMonth ? now.getDate() : -1;

  var cells = [];
  // Espacos vazios antes do dia 1
  for (var e = 0; e < firstDay; e++) {
    cells.push({ day: 0, items: [] });
  }
  // Dias do mes
  for (var dd = 1; dd <= daysInMonth; dd++) {
    cells.push({ day: dd, items: porDia[dd] || [] });
  }

  // Lista dos proventos do mes para exibir abaixo
  var allItems: Array<{ ticker: string; valor: number; tipo: string; dia: number }> = [];
  for (var dayKey in porDia) {
    var dayNum = parseInt(dayKey);
    for (var j = 0; j < porDia[dayKey].length; j++) {
      allItems.push({
        ticker: porDia[dayKey][j].ticker,
        valor: porDia[dayKey][j].valor,
        tipo: porDia[dayKey][j].tipo,
        dia: dayNum,
      });
    }
  }
  allItems.sort(function (a, b) { return a.dia - b.dia; });

  return (
    <div className="linear-card rounded-xl p-5 anim-up d6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-income/10 flex items-center justify-center">
            <Ico d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" className="w-4 h-4 text-income" />
          </div>
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Dividendos</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={function () { setOffset(offset - 1); setSelDay(null); }} className="w-5 h-5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] flex items-center justify-center text-xs">‹</button>
          <div className="text-right">
            <span className="text-[11px] font-semibold text-white/70">{MONTH_NAMES_FULL[month]} {year}</span>
            {totalMes > 0 && (
              <p className="text-[10px] font-mono text-income">+R$ {fmtDec(totalMes)}</p>
            )}
          </div>
          <button type="button" onClick={function () { setOffset(offset + 1); setSelDay(null); }} className="w-5 h-5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] flex items-center justify-center text-xs">›</button>
          {offset !== 0 && (
            <button type="button" onClick={function () { setOffset(0); setSelDay(null); }} className="ml-1 px-1.5 py-0.5 text-[9px] rounded bg-white/[0.04] text-white/50 hover:text-white/80">hoje</button>
          )}
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(function (w) {
          return <div key={w} className="text-center text-[9px] text-white/25 font-mono py-1">{w}</div>;
        })}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map(function (cell, idx) {
          if (cell.day === 0) {
            return <div key={'e' + idx} className="h-8" />;
          }
          var hasProventos = cell.items.length > 0;
          var isToday = cell.day === today;
          var isPast = cell.day < today;
          var dayTotal = 0;
          for (var x = 0; x < cell.items.length; x++) dayTotal += cell.items[x].valor;

          var isSelected = selDay === cell.day;
          return (
            <button
              key={cell.day}
              type="button"
              onClick={function () { if (hasProventos) setSelDay(isSelected ? null : cell.day); }}
              className={'relative h-8 rounded-md flex items-center justify-center text-[11px] font-mono transition ' +
                (isSelected ? 'bg-income/40 text-white font-bold ring-2 ring-income' :
                isToday ? 'bg-orange-500/20 text-orange-400 font-bold ring-1 ring-orange-500/30' :
                hasProventos ? 'bg-income/10 text-income font-semibold cursor-pointer hover:bg-income/20' :
                isPast ? 'text-white/20 cursor-default' : 'text-white/40 cursor-default')}
              disabled={!hasProventos}
              title={hasProventos ? 'Clique pra ver o que sera pago dia ' + cell.day : undefined}
            >
              {cell.day}
              {hasProventos && !isSelected && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-income shadow-[0_0_4px_rgba(34,197,94,0.6)]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Lista de proventos do mes */}
      {allItems.length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-3" />
          {selDay && (
            <p className="text-[10px] text-income mb-1.5 font-semibold">
              Dia {selDay} · {(porDia[selDay] || []).length} {(porDia[selDay] || []).length === 1 ? 'pagamento' : 'pagamentos'}
            </p>
          )}
          <div className="space-y-2 max-h-[160px] overflow-y-auto">
            {(selDay ? allItems.filter(function (it) { return it.dia === selDay; }) : allItems.slice(0, 6)).map(function (item, idx) {
              var isPast = item.dia <= today;
              return (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={'w-1.5 h-1.5 rounded-full ' + (isPast ? 'bg-income' : 'bg-orange-500')} />
                    <span className="text-white/60 font-medium">{item.ticker}</span>
                    <span className="text-white/25 text-[10px] font-mono">dia {item.dia}</span>
                  </div>
                  <span className={'font-mono font-medium ' + (isPast ? 'text-income' : 'text-orange-400')}>+R$ {fmtDec(item.valor)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {proventos.length === 0 && (
        <div className="h-20 flex items-center justify-center text-muted text-sm">
          Nenhum provento registrado
        </div>
      )}
    </div>
  );
}

// ═══════ Counter Animation Hook ═══════

function useCounter(target: number, duration: number) {
  var ref = useRef<HTMLElement>(null);
  var prevTarget = useRef(0);

  useEffect(function () {
    var el = ref.current;
    if (!el || target === 0) return;
    var start = prevTarget.current;
    prevTarget.current = target;
    var startTime = performance.now();

    function update(now: number) {
      var prog = Math.min((now - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - prog, 3);
      var current = start + (target - start) * ease;
      el!.textContent = 'R$ ' + fmtBR(current);
      if (prog < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }, [target, duration]);

  return ref;
}

// ═══════ SVG Donut ═══════

function DonutChart({
  data,
  selectedKey,
  onSelect,
}: {
  data: Array<{ key: string; value: number; color: string; pct: number }>;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
}) {
  var radius = 52;
  var circumference = 2 * Math.PI * radius;
  var offset = 0;

  var gradients = [
    { id: 'dg-acao', from: '#F97316', to: '#FB923C' },
    { id: 'dg-fii', from: '#22C55E', to: '#4ADE80' },
    { id: 'dg-rf', from: '#06B6D4', to: '#22D3EE' },
    { id: 'dg-etf', from: '#F59E0B', to: '#FBBF24' },
    { id: 'dg-stock_int', from: '#E879F9', to: '#F0ABFC' },
  ];

  return (
    <svg width="170" height="170" viewBox="0 0 140 140">
      <defs>
        {gradients.map(function (g) {
          return (
            <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={g.from} />
              <stop offset="100%" stopColor={g.to} />
            </linearGradient>
          );
        })}
        <filter id="donutGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Track */}
      <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="12" />
      {/* Segments */}
      {data.map(function (seg, i) {
        var segLen = (seg.pct / 100) * circumference;
        var dashOffset = -offset;
        offset += segLen;
        var gradId = 'dg-' + seg.key;
        var hasGrad = gradients.some(function (g) { return g.id === gradId; });
        var strokeColor = hasGrad ? 'url(#' + gradId + ')' : seg.color;
        var isSelected = selectedKey === seg.key;
        var isDimmed = selectedKey != null && !isSelected;
        var strokeWidth = isSelected ? 15 : 12;
        var opacity = isDimmed ? 0.3 : 1;
        return (
          <circle
            key={seg.key}
            className={'donut-seg ds' + (i + 1)}
            cx="70" cy="70" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={segLen + ' ' + (circumference - segLen)}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 70 70)"
            filter={i < 3 ? 'url(#donutGlow)' : undefined}
            opacity={opacity}
            style={{ cursor: 'pointer', transition: 'stroke-width 180ms ease, opacity 180ms ease' }}
            onClick={function () {
              if (onSelect) onSelect(isSelected ? null : seg.key);
            }}
          />
        );
      })}
      {/* Inner ring accent */}
      <circle cx="70" cy="70" r="42" fill="none" stroke="rgba(249,115,22,0.04)" strokeWidth="0.5" />
    </svg>
  );
}

// ═══════ Patrimonio Chart (Recharts, real data) ═══════

type Range = '1M' | '3M' | '6M' | '1A' | 'MAX';

function rangeToDays(r: Range): number | null {
  if (r === '1M') return 30;
  if (r === '3M') return 90;
  if (r === '6M') return 180;
  if (r === '1A') return 365;
  return null;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string; name: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#0e1118] border border-white/[0.08] rounded-lg px-3 py-2 shadow-2xl">
      <p className="text-[10px] text-white/40 font-mono mb-1.5">{label}</p>
      {payload.map(function (p) {
        return (
          <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-white/60">{p.name}</span>
            <span className="font-mono font-semibold text-white ml-auto">R$ {fmtBR(p.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PatrimonioChart({ range }: { range: Range }) {
  var userQ = useUser();
  var snapsQ = usePatrimonioSnapshots(userQ.data?.id);
  var patrimonio = useAppStore(function (s) { return s.patrimonio; });
  var saldos = useAppStore(function (s) { return s.saldos; });

  var saldosTotal = useMemo(function () {
    var t = 0;
    for (var i = 0; i < saldos.length; i++) t += saldos[i].saldo || 0;
    return t;
  }, [saldos]);

  var data = useMemo(function () {
    var raw = snapsQ.data || [];
    var days = rangeToDays(range);
    var cutoff = days !== null ? Date.now() - days * 86400000 : 0;
    var series: Array<{ date: string; label: string; total: number; investido: number }> = [];
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i];
      var t = new Date(r.data).getTime();
      if (Number.isNaN(t)) continue;
      if (days !== null && t < cutoff) continue;
      var d = new Date(r.data);
      var label = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
      series.push({
        date: r.data,
        label: label,
        total: Number(r.valor) || 0,
        investido: r.valor_investido != null ? Number(r.valor_investido) : (Number(r.valor) - (Number(r.valor_saldos) || 0)),
      });
    }
    // Append today as the live point
    if (patrimonio.total > 0) {
      var today = new Date();
      var todayLabel = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0');
      var todayIso = today.toISOString().slice(0, 10);
      var last = series[series.length - 1];
      var point = { date: todayIso, label: todayLabel, total: patrimonio.total + saldosTotal, investido: patrimonio.investido };
      if (last && last.date === todayIso) {
        series[series.length - 1] = point;
      } else {
        series.push(point);
      }
    }
    return series;
  }, [snapsQ.data, range, patrimonio, saldosTotal]);

  if (snapsQ.isLoading) {
    return <div className="h-[240px] mt-2 rounded-lg bg-white/[0.02] animate-pulse" />;
  }

  if (data.length < 2) {
    return (
      <div className="h-[240px] mt-2 flex flex-col items-center justify-center text-white/30 text-sm gap-1">
        <p>Sem hist\u00f3rico suficiente para este per\u00edodo</p>
        <p className="text-[11px] text-white/20">Snapshots s\u00e3o gerados pela Edge Function `weekly-snapshot`</p>
      </div>
    );
  }

  return (
    <div className="h-[240px] mt-2 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F97316" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={function (v: number) { return 'R$ ' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)); }}
            width={55}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Total"
            stroke="#F97316"
            strokeWidth={2}
            fill="url(#gradTotal)"
            dot={false}
            activeDot={{ r: 4, fill: '#F97316', stroke: '#0e1118', strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="investido"
            name="Investido"
            stroke="#22C55E"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            fill="url(#gradInv)"
            dot={false}
            activeDot={{ r: 3, fill: '#22C55E', stroke: '#0e1118', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════ Ticker Tape ═══════

function TickerTape() {
  var tickers = [
    { symbol: 'PETR4', price: 'R$38,42', change: '+1.2%', up: true },
    { symbol: 'BBAS3', price: 'R$27,15', change: '+0.8%', up: true },
    { symbol: 'VALE3', price: 'R$58,90', change: '-0.5%', up: false },
    { symbol: 'ITUB4', price: 'R$35,20', change: '+0.3%', up: true },
    { symbol: 'IBOV', price: '132.450', change: '+0.9%', up: true },
    { symbol: 'SELIC', price: '14,25%', change: '', up: true },
  ];

  var items = tickers.concat(tickers); // duplicate for seamless loop

  return (
    <div className="relative z-10 h-8 bg-page/80 border-b border-white/[0.04] overflow-hidden">
      <div className="flex items-center h-full whitespace-nowrap animate-ticker-scroll">
        {items.map(function (t, i) {
          return (
            <span key={i} className="contents">
              <span className="inline-flex items-center gap-1.5 px-5 text-xs font-mono">
                <span className="text-white/40">{t.symbol}</span>
                <span className={t.up ? 'text-income' : 'text-danger'}>{t.price} {t.change}</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-orange-500/30 inline-block" />
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ═══════ Top Movers Card ═══════

type MoverPeriod = 'hoje' | 'semana' | 'mes' | 'ano' | 'tudo';

function TopMoversCard({ positions }: { positions: Position[] }) {
  var _per = useState<MoverPeriod>('hoje');
  var per = _per[0];
  var setPer = _per[1];

  var available: Record<MoverPeriod, boolean> = { hoje: true, semana: false, mes: false, ano: false, tudo: true };

  // Computa pct + R$ por ticker pro periodo escolhido
  var entries: Array<{ ticker: string; categoria: string; pct: number; valor: number }> = [];
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    if (p.preco_atual == null || p.preco_atual <= 0) continue;
    var pct = 0;
    var valor = 0;
    if (per === 'hoje') {
      if (p.day_change_pct == null) continue;
      pct = p.day_change_pct;
      valor = (p.valor_mercado || (p.preco_atual * p.quantidade)) * pct / 100;
    } else if (per === 'tudo') {
      if (p.pm <= 0) continue;
      pct = ((p.preco_atual - p.pm) / p.pm) * 100;
      valor = (p.preco_atual - p.pm) * p.quantidade;
    } else continue;
    entries.push({ ticker: p.ticker, categoria: p.categoria, pct: pct, valor: valor });
  }
  var ups = entries.filter(function (e) { return e.pct > 0; }).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 5);
  var downs = entries.filter(function (e) { return e.pct < 0; }).sort(function (a, b) { return a.pct - b.pct; }).slice(0, 5);

  var PERIODS: { key: MoverPeriod; label: string }[] = [
    { key: 'hoje', label: 'Hoje' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mes' }, { key: 'ano', label: 'Ano' }, { key: 'tudo', label: 'Tudo' },
  ];

  function row(m: { ticker: string; categoria: string; pct: number; valor: number }, isUp: boolean) {
    return (
      <div key={m.ticker} className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <TickerLogo ticker={m.ticker} categoria={m.categoria} size={24} />
          <span className="text-[12px] font-semibold truncate">{m.ticker}</span>
        </div>
        <div className="text-right shrink-0">
          <p className={'text-[12px] font-mono font-semibold ' + (isUp ? 'text-income' : 'text-danger')}>
            {isUp ? '+' : ''}{m.pct.toFixed(1)}%
          </p>
          <p className={'text-[10px] font-mono ' + (isUp ? 'text-income/50' : 'text-danger/50')}>
            {isUp ? '+' : ''}R$ {fmtBR(m.valor)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Ico d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" className="w-4 h-4 text-orange-400" />
          </div>
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Top Movers</span>
        </div>
        <div className="ml-auto flex gap-0.5 bg-white/[0.03] rounded-lg p-0.5">
          {PERIODS.map(function (p) {
            var active = per === p.key;
            var av = available[p.key];
            return (
              <button
                key={p.key}
                type="button"
                disabled={!av}
                onClick={function () { if (av) setPer(p.key); }}
                title={av ? undefined : 'Em breve (precisa historico)'}
                className={'px-2 py-0.5 rounded text-[10px] font-medium transition ' + (active && av ? 'bg-white/[0.08] text-white' : (av ? 'text-white/40 hover:text-white/70' : 'text-white/15 cursor-not-allowed'))}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {ups.length === 0 && downs.length === 0 ? (
        <div className="h-20 flex items-center justify-center text-muted text-sm">Sem dados</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-income/70 font-mono mb-1.5">↑ Maiores altas</p>
            <div className="space-y-1.5">
              {ups.length > 0 ? ups.map(function (m) { return row(m, true); }) : <p className="text-[11px] text-white/30 italic">Nenhum ativo em alta</p>}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-danger/70 font-mono mb-1.5">↓ Maiores quedas</p>
            <div className="space-y-1.5">
              {downs.length > 0 ? downs.map(function (m) { return row(m, false); }) : <p className="text-[11px] text-white/30 italic">Nenhum ativo em queda</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════ Main Dashboard ═══════

export default function DashboardPage() {
  var patrimonio = useAppStore(function (s) { return s.patrimonio; });
  var renda = useAppStore(function (s) { return s.renda; });
  var profile = useAppStore(function (s) { return s.profile; });
  var positions = useAppStore(function (s) { return s.positions; });
  var proventos = useAppStore(function (s) { return s.proventos; });
  var opcoes = useAppStore(function (s) { return s.opcoes; });

  var meta = (profile && profile.meta_mensal) || 0;
  var pctMeta = meta > 0 ? Math.min(999, (renda.atual / meta) * 100) : 0;
  var dyReal = patrimonio.investido > 0 ? (renda.atual * 12 / patrimonio.investido) * 100 : 0;

  var _range = useState<Range>('1A');
  var chartRange = _range[0];
  var setChartRange = _range[1];

  var _selClass = useState<string | null>(null);
  var selectedClass = _selClass[0];
  var setSelectedClass = _selClass[1];

  var donutCenterRef = useCounter(patrimonio.total, 1200);
  var patrimonioRef = useCounter(patrimonio.total, 1200);
  var rendaRef = useCounter(renda.atual, 1200);

  // Donut data
  var donutData = Object.entries(patrimonio.porClasse)
    .filter(function (entry) { return entry[1] > 0; })
    .map(function (entry) {
      return {
        key: entry[0],
        name: CLASS_LABELS[entry[0]] || entry[0],
        value: entry[1],
        color: CLASS_COLORS[entry[0]] || '#555',
        pct: patrimonio.total > 0 ? (entry[1] / patrimonio.total) * 100 : 0,
      };
    })
    .sort(function (a, b) { return b.value - a.value; });

  // Selected class breakdown: top tickers within the class
  var selectedClassInfo = useMemo(function () {
    if (!selectedClass) return null;
    var knownBuckets = ['fii', 'etf', 'stock_int', 'rf', 'caixa'];
    function matches(cat: string) {
      if (selectedClass === 'acao') return knownBuckets.indexOf(cat) === -1;
      return cat === selectedClass;
    }
    var filtered = positions.filter(function (p) {
      if (p.quantidade <= 0) return false;
      return matches(p.categoria || 'acao');
    });
    var items = filtered.map(function (p) {
      var v = p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade;
      return { ticker: p.ticker, valor: v, categoria: p.categoria };
    }).sort(function (a, b) { return b.valor - a.valor; });
    var total = 0;
    for (var i = 0; i < items.length; i++) total += items[i].valor;
    return { total: total, count: items.length, top: items.slice(0, 5) };
  }, [selectedClass, positions]);

  // Renda por fonte (approximate from proventos)
  var rendaPorFonte: Record<string, number> = { acao: 0, fii: 0 };
  var now = new Date();
  var threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var d = new Date(p.data_pagamento);
    if (d >= threeMonthsAgo && d < now) {
      var tk = (p.ticker || '').toUpperCase();
      // FIIs end with 11, acoes are the rest
      if (/\d{2}11$/.test(tk) || /11B$/.test(tk)) {
        rendaPorFonte.fii += (p.valor_total || 0);
      } else {
        rendaPorFonte.acao += (p.valor_total || 0);
      }
    }
  }
  // average over 3
  rendaPorFonte.fii = rendaPorFonte.fii / 3;
  rendaPorFonte.acao = rendaPorFonte.acao / 3;

  // Top positions for table
  var topPositions = positions.slice().map(function (p) {
    return {
      ticker: p.ticker,
      categoria: p.categoria,
      quantidade: p.quantidade,
      pm: p.pm,
      preco_atual: p.preco_atual,
      valor: ((p.preco_atual != null ? p.preco_atual : p.pm) || 0) * p.quantidade,
    };
  }).sort(function (a, b) { return b.valor - a.valor; }).slice(0, 8);

  return (
    <>
      {/* Ticker Tape */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-6 mb-5">
        <TickerTape />
      </div>

      <div className="relative z-10">
        {/* ═══════ Grid 12 cols ═══════ */}
        <div className="grid grid-cols-12 gap-4 items-stretch">

          {/* Composicao (donut) — mobile order-2 */}
          <div className="col-span-12 lg:col-span-3 order-2 lg:order-1 linear-card rounded-xl p-5 anim-up d1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Ico d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" className="w-4 h-4 text-orange-400" />
                </div>
                <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Composicao</span>
              </div>

              {donutData.length > 0 ? (
                <>
                  <div className="flex items-center justify-center py-5 relative">
                    <DonutChart data={donutData} selectedKey={selectedClass} onSelect={setSelectedClass} />
                    <div className="absolute text-center pointer-events-none">
                      {selectedClass && selectedClassInfo ? (
                        <>
                          <p className="text-[9px] uppercase tracking-widest font-mono" style={{ color: (CLASS_COLORS[selectedClass] || '#F97316') + 'cc' }}>
                            {CLASS_LABELS[selectedClass] || selectedClass}
                          </p>
                          <p className="text-lg font-bold font-mono">R$ {fmtK(selectedClassInfo.total)}</p>
                          <p className="text-[10px] text-white/40 font-mono">{selectedClassInfo.count} {selectedClassInfo.count === 1 ? 'ativo' : 'ativos'}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[9px] text-white/30 uppercase tracking-widest font-mono">Patrimonio</p>
                          <p className="text-xl font-bold font-mono" ref={donutCenterRef as React.RefObject<HTMLParagraphElement>}>R$ {fmtBR(patrimonio.total)}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Legend — click row to select class */}
                  <div className="space-y-3 mt-3">
                    {donutData.map(function (d, idx) {
                      var isSel = selectedClass === d.key;
                      var isDim = selectedClass != null && !isSel;
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={function () { setSelectedClass(isSel ? null : d.key); }}
                          className={'w-full flex items-center justify-between anim-up d' + (idx + 3) + ' group rounded-lg -mx-2 px-2 py-1 transition ' + (isSel ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]')}
                          style={{ opacity: isDim ? 0.45 : 1 }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'linear-gradient(135deg, ' + d.color + ', ' + d.color + '99)', boxShadow: '0 0 6px ' + d.color + '66' }} />
                            <span className="text-xs text-white/60 group-hover:text-white/80 transition">{d.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono" style={{ color: d.color + '99' }}>{d.pct.toFixed(0)}%</span>
                            <span className="text-xs font-mono font-semibold">R$ {fmtK(d.value)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Expanded info — top 5 da classe selecionada */}
                  {selectedClass && selectedClassInfo && selectedClassInfo.top.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-white/[0.04]">
                      <p className="text-[9px] uppercase tracking-widest font-mono text-white/30 mb-2">Top 5 ativos</p>
                      <div className="space-y-1.5">
                        {selectedClassInfo.top.map(function (t) {
                          var pct = selectedClassInfo.total > 0 ? (t.valor / selectedClassInfo.total) * 100 : 0;
                          return (
                            <div key={t.ticker} className="flex items-center justify-between text-[11px]">
                              <span className="text-white/70 font-semibold">{t.ticker}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-white/30 font-mono">{pct.toFixed(1)}%</span>
                                <span className="text-white/80 font-mono font-medium">R$ {fmtK(t.valor)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-52 flex items-center justify-center text-muted text-sm">
                  Nenhuma posicao
                </div>
              )}
            </div>

          {/* Calendario Dividendos — mobile order-6 (after Top Movers) */}
          <div className="col-span-12 lg:col-span-3 order-6 lg:order-4">
            <ProventosCalendar proventos={proventos} />
          </div>

          {/* Patrimonio Total (chart) — mobile order-1 (first) */}
          <div className="col-span-12 lg:col-span-6 order-1 lg:order-2 linear-card rounded-xl p-5 anim-up d2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <Ico d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" className="w-3.5 h-3.5 text-orange-400" />
                    </div>
                    <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Patrimonio Total</span>
                  </div>
                  <p className="text-2xl font-bold font-mono tracking-tight" ref={patrimonioRef as React.RefObject<HTMLParagraphElement>}>
                    R$ {fmtBR(patrimonio.total)}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />Total
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-income" />Investido
                    </span>
                  </div>
                </div>
                <div className="flex gap-0.5 bg-white/[0.03] rounded-lg p-0.5">
                  {(['1M', '3M', '6M', '1A', 'MAX'] as Range[]).map(function (label) {
                    var isActive = label === chartRange;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={function () { setChartRange(label); }}
                        className={'px-3 py-1 rounded-md text-[11px] font-medium transition ' + (isActive ? 'bg-white/[0.06] text-white' : 'text-white/40 hover:text-white/70')}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <PatrimonioChart range={chartRange} />
            </div>

            {/* Meta bar */}
            {meta > 0 && (
              <div className="linear-card rounded-xl p-4 mt-4 anim-up d4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Ico d="M13 10V3L4 14h7v7l9-11h-7z" className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-medium text-white/50">Meta Mensal</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold font-mono text-income">{pctMeta.toFixed(0)}%</span>
                    <span className="text-[10px] text-white/30 font-mono">de R$ {fmtBR(meta)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bar-anim"
                    style={{
                      width: Math.min(100, pctMeta) + '%',
                      background: pctMeta >= 100
                        ? 'linear-gradient(90deg, #F97316, #22C55E)'
                        : 'linear-gradient(90deg, #F97316, #FB923C)',
                    }}
                  />
                </div>
              </div>
            )}

          {/* end Patrimonio card */}

          {/* Top Movers — mobile order-5 (after Opcoes) */}
          <div className="col-span-12 lg:col-span-6 order-5 lg:order-5 linear-card rounded-xl p-5 anim-up d8">
            <TopMoversCard positions={positions} />
          </div>
          {/* end Top Movers */}

          {/* Renda Passiva — mobile order-3 */}
          <div className="col-span-12 lg:col-span-3 order-3 lg:order-3 linear-card rounded-xl p-5 anim-up d3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-income/10 flex items-center justify-center">
                  <Ico d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" className="w-3.5 h-3.5 text-income" />
                </div>
                <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Renda Passiva</span>
              </div>
              <p className="text-2xl font-bold font-mono text-income mb-1" ref={rendaRef as React.RefObject<HTMLParagraphElement>}>
                R$ {fmtBR(renda.atual)}
              </p>
              <p className="text-[10px] text-white/30 mb-3">media mensal (3m)</p>

              {(function () {
                var n = new Date();
                var mesAtualKey = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
                var mesAnteriorKey = (n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear()) + '-' + String(n.getMonth() === 0 ? 12 : n.getMonth()).padStart(2, '0');
                var totalAtual = 0;
                var totalAnterior = 0;
                var proventosDoMes: Array<{ ticker: string; valor: number; tipo: string; dia: number }> = [];

                for (var pi = 0; pi < proventos.length; pi++) {
                  var pr = proventos[pi];
                  var dp = new Date(pr.data_pagamento);
                  if (isNaN(dp.getTime())) continue;
                  var pk = dp.getFullYear() + '-' + String(dp.getMonth() + 1).padStart(2, '0');
                  if (pk === mesAtualKey) {
                    totalAtual += pr.valor_total || 0;
                    proventosDoMes.push({ ticker: pr.ticker, valor: pr.valor_total || 0, tipo: pr.tipo_provento || 'dividendo', dia: dp.getDate() });
                  } else if (pk === mesAnteriorKey) {
                    totalAnterior += pr.valor_total || 0;
                  }
                }

                var diff = totalAnterior > 0 ? ((totalAtual - totalAnterior) / totalAnterior) * 100 : 0;
                var isUp = diff >= 0;
                proventosDoMes.sort(function (a, b) { return b.valor - a.valor; });

                return (
                  <>
                    {/* Comparativo meses */}
                    <div className="bg-white/[0.02] rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-white/40">Este mes</span>
                        <span className="text-xs font-mono font-semibold text-income">+R$ {fmtDec(totalAtual)}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-white/40">Mes anterior</span>
                        <span className="text-xs font-mono text-white/40">R$ {fmtDec(totalAnterior)}</span>
                      </div>
                      {totalAnterior > 0 && (
                        <div className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ' +
                          (isUp ? 'bg-income/10 text-income' : 'bg-danger/10 text-danger')}>
                          <Ico d={isUp ? 'M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25' : 'M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25'} className="w-3 h-3" />
                          {isUp ? '+' : ''}{diff.toFixed(1)}%
                        </div>
                      )}
                    </div>

                    {/* KPIs */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/[0.02] rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-white/30 mb-0.5">Ativos</p>
                        <p className="text-sm font-bold font-mono">{positions.length}</p>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-white/30 mb-0.5">DY Real</p>
                        <p className="text-sm font-bold font-mono text-orange-400">{dyReal.toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Por fonte */}
                    <div className="space-y-1.5 mb-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">Dividendos</span>
                        <span className="font-mono font-medium text-income">+R$ {fmtBR(rendaPorFonte.acao)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-white/40">FIIs</span>
                        <span className="font-mono font-medium text-income">+R$ {fmtBR(rendaPorFonte.fii)}</span>
                      </div>
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-3" />

                    {/* Lista proventos do mes */}
                    <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Recebidos este mes</p>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto">
                      {proventosDoMes.length > 0 ? proventosDoMes.slice(0, 10).map(function (item, idx) {
                        return (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-income" />
                              <span className="text-[11px] text-white/60 font-medium">{item.ticker}</span>
                              <span className="text-[9px] text-white/20 font-mono">dia {item.dia}</span>
                            </div>
                            <span className="text-[11px] font-mono font-medium text-income">+R$ {fmtDec(item.valor)}</span>
                          </div>
                        );
                      }) : (
                        <p className="text-[11px] text-white/25 text-center py-2">Nenhum provento este mes</p>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

          {/* end Renda Passiva */}

          {/* Opcoes — mobile order-4 */}
          <div className="col-span-12 lg:col-span-3 order-4 lg:order-6 linear-card rounded-xl p-5 anim-up d10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg bg-stock-int/10 flex items-center justify-center">
                  <Ico d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" className="w-3.5 h-3.5 text-stock-int" />
                </div>
                <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Opcoes</span>
              </div>

              {(function () {
                if (opcoes.length === 0) {
                  return <div className="flex items-center justify-center text-muted text-sm py-4">Nenhuma opcao</div>;
                }

                // Premios e recompras
                var premiosTotal = 0;
                var recomprasTotal = 0;
                var ativasCount = 0;
                for (var oi = 0; oi < opcoes.length; oi++) {
                  var op = opcoes[oi];
                  if (op.status === 'ativa') ativasCount++;
                  premiosTotal += (op.premio || 0) * (op.qty || 0);
                  if (op.status === 'fechada' && op.premio > 0) {
                    recomprasTotal += (op.premio || 0) * (op.qty || 0) * 0.3;
                  }
                }
                var saldo = premiosTotal - recomprasTotal;
                var isPositive = saldo >= 0;

                // Proximos vencimentos
                var proxVenc = opcoes.filter(function (o) { return o.status === 'ativa'; })
                  .map(function (o) {
                    var venc = new Date(o.vencimento);
                    var dias = Math.ceil((venc.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    return { ticker: o.ticker_opcao, base: o.ativo_base, tipo: o.tipo, strike: o.strike, dias: dias };
                  })
                  .sort(function (a, b) { return a.dias - b.dias; })
                  .slice(0, 4);

                return (
                  <>
                    {/* P&L resumo */}
                    <div className="bg-white/[0.02] rounded-lg p-3 mb-3">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <p className="text-[10px] text-white/30">Premios</p>
                          <p className="text-xs font-mono font-semibold text-income">+R$ {fmtBR(premiosTotal)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/30">Recompras</p>
                          <p className="text-xs font-mono font-semibold text-danger">-R$ {fmtBR(recomprasTotal)}</p>
                        </div>
                      </div>
                      <div className="h-px bg-white/[0.04] my-2" />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/40">Saldo</span>
                        <span className={'text-sm font-mono font-bold ' + (isPositive ? 'text-income' : 'text-danger')}>
                          {isPositive ? '+' : ''}R$ {fmtBR(saldo)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mt-2">
                        <div className="h-full rounded-full" style={{
                          width: (premiosTotal > 0 ? Math.min(100, ((premiosTotal - recomprasTotal) / premiosTotal) * 100) : 0) + '%',
                          background: isPositive ? 'linear-gradient(90deg, #22C55E, #4ADE80)' : 'linear-gradient(90deg, #EF4444, #F87171)',
                        }} />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/[0.02] rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-white/30 mb-0.5">Ativas</p>
                        <p className="text-sm font-bold font-mono text-stock-int">{ativasCount}</p>
                      </div>
                      <div className="bg-white/[0.02] rounded-lg p-2.5 text-center">
                        <p className="text-[10px] text-white/30 mb-0.5">Total</p>
                        <p className="text-sm font-bold font-mono">{opcoes.length}</p>
                      </div>
                    </div>

                    {/* Vencimentos */}
                    {proxVenc.length > 0 && (
                      <>
                        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent my-3" />
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Proximos vencimentos</p>
                        <div className="space-y-2">
                          {proxVenc.map(function (v, idx) {
                            var urgente = v.dias <= 7;
                            var proximo = v.dias <= 30;
                            return (
                              <div key={idx} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={'w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold ' +
                                    (v.tipo === 'call' ? 'bg-income/10 text-income' : 'bg-danger/10 text-danger')}>
                                    {v.tipo === 'call' ? 'C' : 'P'}
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-semibold">{v.ticker}</p>
                                    <p className="text-[9px] text-white/25 font-mono">{v.base} @{fmtDec(v.strike)}</p>
                                  </div>
                                </div>
                                <span className={'text-[11px] font-mono font-semibold ' +
                                  (urgente ? 'text-danger' : proximo ? 'text-warning' : 'text-white/40')}>
                                  {v.dias}d
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
          </div>
          {/* end Opcoes */}

          {/* Carteira (table) — mobile order-7 (last) */}
          <div className="col-span-12 mt-1 order-7 lg:order-7 linear-card rounded-xl p-5 anim-up d5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.5)]" />
                  <span className="text-sm font-semibold">Carteira</span>
                  <span className="text-[10px] text-white/30 font-mono ml-1">{positions.length} ativos</span>
                </div>
              </div>

              {topPositions.length > 0 ? (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-white/30 uppercase tracking-wider font-mono">
                        <th className="text-left py-2 px-3 font-normal">Ativo</th>
                        <th className="text-right py-2 px-3 font-normal hidden sm:table-cell">Qtd</th>
                        <th className="text-right py-2 px-3 font-normal hidden md:table-cell">PM</th>
                        <th className="text-right py-2 px-3 font-normal">Valor</th>
                        <th className="text-right py-2 px-3 font-normal w-16 hidden sm:table-cell">Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPositions.map(function (pos, idx) {
                        var pct = patrimonio.total > 0 ? (pos.valor / patrimonio.total) * 100 : 0;
                        var color = CLASS_COLORS[pos.categoria] || '#F97316';
                        var iconD = CLASS_LUCIDE[pos.categoria] || CLASS_LUCIDE.acao;
                        return (
                          <tr key={pos.ticker} className={'row-anim d' + (idx + 6) + ' border-t border-white/[0.04] hover:bg-white/[0.02] transition group'}>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-3">
                                <div className="group-hover:scale-110 transition-all">
                                  <TickerLogo ticker={pos.ticker} categoria={pos.categoria} size={36} />
                                </div>
                                <div>
                                  <p className="text-[13px] font-semibold tracking-tight">{pos.ticker}</p>
                                  <p className="text-[10px] text-white/30 font-mono">{CLASS_LABELS[pos.categoria] || pos.categoria}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right text-[13px] font-mono text-white/60 hidden sm:table-cell">{pos.quantidade.toLocaleString('pt-BR')}</td>
                            <td className="py-3 px-3 text-right text-[13px] font-mono text-white/40 hidden md:table-cell">R$ {fmtDec(pos.pm)}</td>
                            <td className="py-3 px-3 text-right text-[13px] font-mono font-medium">R$ {fmtBR(pos.valor)}</td>
                            <td className="py-3 px-3 hidden sm:table-cell">
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="w-12 h-1 bg-white/[0.04] rounded-full overflow-hidden hidden lg:block">
                                  <div className="h-full rounded-full" style={{ width: Math.min(100, pct * 2) + '%', backgroundColor: color }} />
                                </div>
                                <span className="text-[10px] font-mono text-white/40 w-8 text-right">{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-40 flex flex-col items-center justify-center text-muted gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center">
                    <Ico d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" className="w-5 h-5 text-muted" />
                  </div>
                  <p className="text-sm">Nenhuma posicao registrada</p>
                </div>
              )}
          </div>
          {/* end Carteira */}

        </div>
      </div>
    </>
  );
}
