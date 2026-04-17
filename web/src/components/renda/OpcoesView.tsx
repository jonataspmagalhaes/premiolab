'use client';

// Aba Opcoes em /app/renda. Mostra P&L mensal, gr. bar composto, tabela
// detalhada das operacoes realizadas e agrupamento por estrategia.

import { useMemo, useState } from 'react';
import { useAppStore, type Opcao } from '@/store';
import { TickerLogo } from '@/components/TickerLogo';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  computeOpcoesMensal, resumoOpcoes12m, resultadoOperacao, inferirEstrategia,
} from '@/lib/opcoesUtils';
import { fmtBRL, fmtK, fmtDate } from '@/lib/fmt';

// ─── Helpers ──────────────────────────────────────────────

function isRealizada(status: string | undefined): boolean {
  var s = (status || '').toLowerCase();
  return s === 'exercida' || s === 'expirada' || s === 'fechada' || s === 'expirou_po';
}

function statusLabel(s: string | undefined): string {
  var x = (s || '').toLowerCase();
  if (x === 'exercida') return 'Exercida';
  if (x === 'expirada' || x === 'expirou_po') return 'Expirada';
  if (x === 'fechada') return 'Fechada';
  if (x === 'ativa' || x === 'aberta') return 'Em aberto';
  return s || '—';
}

function statusColor(s: string | undefined): string {
  var x = (s || '').toLowerCase();
  if (x === 'exercida') return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
  if (x === 'expirada' || x === 'expirou_po') return 'text-income bg-emerald-500/10 border-emerald-500/30';
  if (x === 'fechada') return 'text-info bg-blue-500/10 border-blue-500/30';
  return 'text-white/60 bg-white/[0.06] border-white/[0.1]';
}

// ─── Componente ──────────────────────────────────────────

export function OpcoesView() {
  var opcoes = useAppStore(function (s) { return s.opcoes; });

  var _anoAtual = new Date().getFullYear();
  var _ano = useState<number>(_anoAtual);
  var ano = _ano[0];
  var setAno = _ano[1];

  var _filtro = useState<'todas' | 'realizadas' | 'abertas'>('todas');
  var filtro = _filtro[0];
  var setFiltro = _filtro[1];

  var _estrategia = useState<string>('todas');
  var estrategia = _estrategia[0];
  var setEstrategia = _estrategia[1];

  // Anos disponiveis (baseado em data_fechamento/vencimento/data_abertura)
  var anos = useMemo(function () {
    var s: Record<number, boolean> = {};
    s[_anoAtual] = true;
    opcoes.forEach(function (o) {
      var ds = [o.data_fechamento, o.vencimento, o.data_abertura];
      ds.forEach(function (d) {
        if (!d) return;
        var y = new Date(d).getFullYear();
        if (!isNaN(y)) s[y] = true;
      });
    });
    return Object.keys(s).map(Number).sort(function (a, b) { return b - a; });
  }, [opcoes, _anoAtual]);

  // Estrategias disponiveis
  var estrategias = useMemo(function () {
    var s: Record<string, boolean> = {};
    opcoes.forEach(function (o) { s[inferirEstrategia(o)] = true; });
    return Object.keys(s).sort();
  }, [opcoes]);

  // Opcoes do ano selecionado
  var opcoesAno = useMemo(function () {
    return opcoes.filter(function (o) {
      var dataRef = o.data_fechamento || o.vencimento || o.data_abertura;
      if (!dataRef) return false;
      var y = new Date(dataRef).getFullYear();
      return y === ano;
    });
  }, [opcoes, ano]);

  // Aplica filtros de filtro + estrategia
  var opcoesFiltradas = useMemo(function () {
    return opcoesAno.filter(function (o) {
      if (filtro === 'realizadas' && !isRealizada(o.status)) return false;
      if (filtro === 'abertas' && isRealizada(o.status)) return false;
      if (estrategia !== 'todas' && inferirEstrategia(o) !== estrategia) return false;
      return true;
    });
  }, [opcoesAno, filtro, estrategia]);

  // P&L mensal no ano (12 meses jan a dez)
  var mensal = useMemo(function () {
    // Usa computeOpcoesMensal com periodo dinamico a partir do ano
    var base: Array<{ mesISO: string; label: string; premios: number; recompras: number; liquido: number; count: number }> = [];
    var nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (var m = 0; m < 12; m++) {
      base.push({
        mesISO: ano + '-' + String(m + 1).padStart(2, '0') + '-01',
        label: nomes[m] + '/' + String(ano).slice(-2),
        premios: 0, recompras: 0, liquido: 0, count: 0,
      });
    }
    opcoesAno.forEach(function (o) {
      if (!isRealizada(o.status)) return;
      var dataRef = o.data_fechamento || o.vencimento || o.data_abertura;
      if (!dataRef) return;
      var d = new Date(dataRef);
      if (isNaN(d.getTime()) || d.getFullYear() !== ano) return;
      var mIdx = d.getMonth();
      var res = resultadoOperacao(o);
      if (res >= 0) base[mIdx].premios += res;
      else base[mIdx].recompras += Math.abs(res);
      base[mIdx].liquido += res;
      base[mIdx].count += 1;
    });
    return base;
  }, [opcoesAno, ano]);

  // Totais do ano
  var totais = useMemo(function () {
    var premios = 0, recompras = 0, liquido = 0, count = 0;
    mensal.forEach(function (m) {
      premios += m.premios;
      recompras += m.recompras;
      liquido += m.liquido;
      count += m.count;
    });
    return { premios: premios, recompras: recompras, liquido: liquido, count: count };
  }, [mensal]);

  // Agrupamento por estrategia
  var porEstrategia = useMemo(function () {
    var m: Record<string, { estrategia: string; premios: number; recompras: number; liquido: number; count: number }> = {};
    opcoesAno.forEach(function (o) {
      if (!isRealizada(o.status)) return;
      var e = inferirEstrategia(o);
      if (!m[e]) m[e] = { estrategia: e, premios: 0, recompras: 0, liquido: 0, count: 0 };
      var res = resultadoOperacao(o);
      if (res >= 0) m[e].premios += res;
      else m[e].recompras += Math.abs(res);
      m[e].liquido += res;
      m[e].count += 1;
    });
    return Object.values(m).sort(function (a, b) { return b.liquido - a.liquido; });
  }, [opcoesAno]);

  // Operacoes ordenadas para tabela (decrescente por data ref)
  var operacoesOrd = useMemo(function () {
    var copy = opcoesFiltradas.slice();
    copy.sort(function (a, b) {
      var da = a.data_fechamento || a.vencimento || a.data_abertura || '';
      var db = b.data_fechamento || b.vencimento || b.data_abertura || '';
      return db.localeCompare(da);
    });
    return copy;
  }, [opcoesFiltradas]);

  var resumo12m = useMemo(function () { return resumoOpcoes12m(opcoes); }, [opcoes]);

  return (
    <div className="space-y-4">
      {/* Header de filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={ano}
          onChange={function (e) { setAno(parseInt(e.target.value, 10)); }}
          className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-orange-500/40"
        >
          {anos.map(function (y) { return <option key={y} value={y}>{y}</option>; })}
        </select>

        <div className="flex items-center gap-1 rounded-md bg-white/[0.03] border border-white/[0.08] p-0.5">
          {(['todas', 'realizadas', 'abertas'] as const).map(function (k) {
            return (
              <button
                key={k}
                type="button"
                onClick={function () { setFiltro(k); }}
                className={'px-2.5 py-1 rounded text-[11px] transition ' + (filtro === k ? 'bg-orange-500/20 text-orange-300' : 'text-white/60 hover:text-white')}
              >
                {k === 'todas' ? 'Todas' : k === 'realizadas' ? 'Realizadas' : 'Em aberto'}
              </button>
            );
          })}
        </div>

        {estrategias.length > 0 ? (
          <select
            value={estrategia}
            onChange={function (e) { setEstrategia(e.target.value); }}
            className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-orange-500/40"
          >
            <option value="todas">Toda estrategia</option>
            {estrategias.map(function (e) { return <option key={e} value={e}>{e}</option>; })}
          </select>
        ) : null}
      </div>

      {/* KPIs no ano */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiBox label={'Liquido ' + ano} value={totais.liquido} accent={totais.liquido >= 0 ? 'text-income' : 'text-red-400'} />
        <KpiBox label="Premios recebidos" value={totais.premios} accent="text-emerald-300" />
        <KpiBox label="Recompras/perdas" value={totais.recompras} accent="text-red-300" />
        <KpiBox label="Liquido 12m (rolling)" value={resumo12m.total12m} accent={resumo12m.total12m >= 0 ? 'text-income' : 'text-red-400'} sub={'Operacoes 12m: ' + resumo12m.operacoes12m} />
      </div>

      {/* Grafico composto mensal do ano */}
      <div className="linear-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-white/40 font-mono">P&L mensal {ano}</p>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-emerald-300">
              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> Premios
            </span>
            <span className="flex items-center gap-1 text-red-300">
              <span className="inline-block w-2 h-2 rounded-sm bg-red-500" /> Recompras
            </span>
            <span className="flex items-center gap-1 text-white/80">
              <span className="inline-block w-3 h-0.5 bg-white/80" /> Liquido
            </span>
          </div>
        </div>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <ComposedChart data={mensal} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={function (v) { return 'R$ ' + fmtK(v); }} />
              <Tooltip
                cursor={{ fill: 'rgba(108,92,231,0.06)' }}
                contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                formatter={function (v: unknown, name: unknown) {
                  var num = Number(v) || 0;
                  var nm = String(name);
                  var labelName = nm === 'premios' ? 'Premios' : nm === 'recompras' ? 'Recompras' : 'Liquido';
                  return ['R$ ' + fmtBRL(num), labelName];
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" />
              <Bar dataKey="premios" stackId="pl" fill="#22C55E" fillOpacity={0.85} maxBarSize={32} />
              <Bar dataKey="recompras" stackId="pl" fill="#EF4444" fillOpacity={0.75} maxBarSize={32} />
              <Line type="monotone" dataKey="liquido" stroke="#FFFFFF" strokeWidth={1.5} dot={{ r: 2.5, fill: '#FFFFFF' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela mensal + agrupamento estrategia */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 linear-card rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Tabela mensal {ano}</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-white/40 border-b border-white/[0.06]">
                <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Mes</th>
                <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Premios</th>
                <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Recompras</th>
                <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Liquido</th>
                <th className="py-2 font-medium uppercase tracking-wider text-[9px] text-right">Ops</th>
              </tr>
            </thead>
            <tbody>
              {mensal.map(function (m) {
                var cor = m.liquido > 0 ? 'text-income' : m.liquido < 0 ? 'text-red-300' : 'text-white/30';
                return (
                  <tr key={m.mesISO} className="border-b border-white/[0.03]">
                    <td className="py-1.5 pr-3 font-mono text-white/70">{m.label}</td>
                    <td className="py-1.5 pr-3 font-mono text-right text-emerald-300">
                      {m.premios > 0 ? 'R$ ' + fmtBRL(m.premios) : '—'}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-right text-red-300">
                      {m.recompras > 0 ? '-R$ ' + fmtBRL(m.recompras) : '—'}
                    </td>
                    <td className={'py-1.5 pr-3 font-mono text-right font-semibold ' + cor}>
                      {m.liquido === 0 ? '—' : (m.liquido > 0 ? 'R$ ' : '-R$ ') + fmtBRL(Math.abs(m.liquido))}
                    </td>
                    <td className="py-1.5 font-mono text-right text-white/50">{m.count || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/[0.08]">
                <td className="py-2 pr-3 font-semibold text-[11px] text-white/80">Total</td>
                <td className="py-2 pr-3 font-mono text-right text-emerald-300 font-semibold">R$ {fmtBRL(totais.premios)}</td>
                <td className="py-2 pr-3 font-mono text-right text-red-300 font-semibold">-R$ {fmtBRL(totais.recompras)}</td>
                <td className={'py-2 pr-3 font-mono text-right font-bold ' + (totais.liquido >= 0 ? 'text-income' : 'text-red-400')}>
                  {(totais.liquido >= 0 ? 'R$ ' : '-R$ ') + fmtBRL(Math.abs(totais.liquido))}
                </td>
                <td className="py-2 font-mono text-right text-white/70 font-semibold">{totais.count}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Por estrategia */}
        <div className="col-span-12 lg:col-span-5 linear-card rounded-xl p-5">
          <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Por estrategia ({ano})</p>
          {porEstrategia.length === 0 ? (
            <p className="text-[12px] text-white/30 italic">Sem operacoes realizadas em {ano}.</p>
          ) : (
            <div className="space-y-2">
              {porEstrategia.map(function (e) {
                var cor = e.liquido >= 0 ? 'text-income' : 'text-red-400';
                return (
                  <div key={e.estrategia} className="flex items-start justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                    <div>
                      <p className="text-[12px] font-semibold">{e.estrategia}</p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {e.count} op · Premios R$ {fmtK(e.premios)} · Recompras R$ {fmtK(e.recompras)}
                      </p>
                    </div>
                    <p className={'text-[13px] font-mono font-bold ' + cor}>
                      {e.liquido >= 0 ? 'R$ ' : '-R$ '}{fmtBRL(Math.abs(e.liquido))}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabela de operacoes */}
      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">
          Operacoes ({operacoesOrd.length})
        </p>
        {operacoesOrd.length === 0 ? (
          <p className="text-[12px] text-white/30 italic py-4">Nenhuma operacao com os filtros aplicados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/[0.06]">
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Data ref.</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Ativo</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Ticker</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Estrategia</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Strike</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Qty</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Premio</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Fechamento</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Status</th>
                  <th className="py-2 font-medium uppercase tracking-wider text-[9px] text-right">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {operacoesOrd.map(function (o) {
                  return <OpcaoRow key={o.id || (o.ticker_opcao + '-' + o.data_abertura)} o={o} />;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OpcaoRow(props: { o: Opcao }) {
  var o = props.o;
  var dataRef = o.data_fechamento || o.vencimento || o.data_abertura;
  var dStr = dataRef ? fmtDate(new Date(dataRef)) : '—';
  var res = isRealizada(o.status) ? resultadoOperacao(o) : 0;
  var corRes = res > 0 ? 'text-income' : res < 0 ? 'text-red-300' : 'text-white/40';
  return (
    <tr className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
      <td className="py-1.5 pr-3 font-mono text-white/60">{dStr}</td>
      <td className="py-1.5 pr-3">
        <div className="flex items-center gap-1.5">
          <TickerLogo ticker={o.ativo_base} categoria={'acao'} size={20} />
          <span className="text-white/80">{o.ativo_base}</span>
        </div>
      </td>
      <td className="py-1.5 pr-3 font-mono text-[10px] text-white/60">{o.ticker_opcao}</td>
      <td className="py-1.5 pr-3">
        <span className="text-[10px] text-white/70">{inferirEstrategia(o)}</span>
      </td>
      <td className="py-1.5 pr-3 font-mono text-right text-white/70">{o.strike.toFixed(2)}</td>
      <td className="py-1.5 pr-3 font-mono text-right text-white/60">{o.qty}</td>
      <td className="py-1.5 pr-3 font-mono text-right text-white/70">R$ {o.premio.toFixed(2)}</td>
      <td className="py-1.5 pr-3 font-mono text-right text-white/60">
        {o.premio_fechamento != null ? 'R$ ' + Number(o.premio_fechamento).toFixed(2) : '—'}
      </td>
      <td className="py-1.5 pr-3">
        <span className={'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ' + statusColor(o.status)}>
          {statusLabel(o.status)}
        </span>
      </td>
      <td className={'py-1.5 font-mono text-right font-semibold ' + corRes}>
        {res === 0 ? '—' : (res > 0 ? 'R$ ' : '-R$ ') + fmtBRL(Math.abs(res))}
      </td>
    </tr>
  );
}

function KpiBox(props: { label: string; value: number; accent: string; sub?: string }) {
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-base font-bold font-mono mt-1 ' + props.accent}>
        {props.value === 0 ? 'R$ 0,00' : (props.value > 0 ? 'R$ ' : '-R$ ') + fmtBRL(Math.abs(props.value))}
      </p>
      {props.sub ? <p className="text-[10px] text-white/30 mt-0.5">{props.sub}</p> : null}
    </div>
  );
}
