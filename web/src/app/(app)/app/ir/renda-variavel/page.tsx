'use client';

// /app/ir/renda-variavel — calculo mensal de IR em operacoes comuns
// (swing trade). Sub-tabs por categoria (Acoes BR, FII, ETF, BDR/ADR/REIT,
// Stocks INT). IsencaoIndicator so em Acoes (R$20k).

import { useMemo, useState } from 'react';
import { useIRYear } from '../_yearContext';
import { useAppStore } from '@/store';
import { useOperacoesRaw, useUser } from '@/lib/queries';
import { computeIROperacoes } from '@/lib/ir/operacoes';
import { computeTaxByMonth } from '@/lib/ir/tax';
import { DEFAULT_PREJUIZO } from '@/lib/ir/index';
import { IsencaoIndicator } from '@/components/ir/IsencaoIndicator';
import { IRMonthTable, IRMoneyCell, type IRMonthCol } from '@/components/ir/IRMonthTable';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { fmtBRL } from '@/lib/fmt';
import { LIMITES_ISENCAO } from '@/lib/ir/constants';
import type { CategoriaIR, MonthResult, OperacaoRaw, VendaDetalhada } from '@/lib/ir/types';

interface CatSubTab {
  key: 'acao' | 'fii' | 'etf' | 'bdr_adr_reit' | 'stock_int';
  label: string;
  cats: CategoriaIR[];
  contador: string;
  isencao20k: boolean;
}

var SUB_TABS: CatSubTab[] = [
  { key: 'acao', label: 'Acoes BR', cats: ['acao'], contador: 'rv_acoes', isencao20k: true },
  { key: 'fii', label: 'FIIs', cats: ['fii'], contador: 'rv_fii', isencao20k: false },
  { key: 'etf', label: 'ETFs', cats: ['etf'], contador: 'rv_acoes', isencao20k: false },
  { key: 'bdr_adr_reit', label: 'BDR / ADR / REIT', cats: ['bdr', 'adr', 'reit'], contador: 'rv_acoes', isencao20k: false },
  { key: 'stock_int', label: 'Stocks INT', cats: ['stock_int'], contador: 'rv_acoes', isencao20k: false },
];

interface RowData {
  mes: string;
  vendas: number;
  ganho: number;
  imposto: number;
  isento: boolean;
  prejuizoConsumido: number;
  prejuizoRemanescente: number;
  [key: string]: unknown;
}

export default function RendaVariavelPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;

  var user = useUser();
  var opsQuery = useOperacoesRaw(user.data?.id);
  var ops = useMemo<OperacaoRaw[]>(function () {
    return (opsQuery.data || []) as unknown as OperacaoRaw[];
  }, [opsQuery.data]);

  var _subtab = useState<CatSubTab['key']>('acao');
  var subtab = _subtab[0];
  var setSubtab = _subtab[1];

  var cur = useMemo(function () {
    var found = SUB_TABS.find(function (s) { return s.key === subtab; });
    return found || SUB_TABS[0];
  }, [subtab]);

  var monthResults = useMemo<MonthResult[]>(function () {
    return computeIROperacoes(ops, ano);
  }, [ops, ano]);

  var taxResult = useMemo(function () {
    return computeTaxByMonth(monthResults, DEFAULT_PREJUIZO);
  }, [monthResults]);

  // Linhas da aba atual
  var rows = useMemo<RowData[]>(function () {
    return monthResults.map(function (mr) {
      var vendas = 0;
      var ganho = 0;
      cur.cats.forEach(function (c) {
        vendas += mr.vendas[c] || 0;
        ganho += mr.ganhos[c] || 0;
      });
      // Encontra darf desse mes; extrai info da primeira cat da subtab
      var darf = taxResult.darfs.find(function (d) { return d.mes === mr.mes; });
      var imposto = 0;
      var isento = false;
      var prejuizoConsumido = 0;
      var prejuizoRemanescente = 0;
      if (darf) {
        darf.porCategoria.forEach(function (pc) {
          if (cur.cats.indexOf(pc.categoria) >= 0) {
            imposto += pc.imposto;
            if (pc.isento) isento = true;
            prejuizoConsumido += pc.prejuizoConsumido;
            prejuizoRemanescente += pc.prejuizoRemanescente;
          }
        });
      }
      return {
        mes: mr.mes,
        vendas: vendas,
        ganho: ganho,
        imposto: imposto,
        isento: isento,
        prejuizoConsumido: prejuizoConsumido,
        prejuizoRemanescente: prejuizoRemanescente,
      };
    });
  }, [monthResults, taxResult.darfs, cur]);

  var totais = useMemo(function () {
    var t = { vendas: 0, ganho: 0, imposto: 0 };
    rows.forEach(function (r) { t.vendas += r.vendas; t.ganho += r.ganho; t.imposto += r.imposto; });
    return t;
  }, [rows]);

  // Detalhe de vendas da aba atual
  var detalheVendas = useMemo<VendaDetalhada[]>(function () {
    var out: VendaDetalhada[] = [];
    monthResults.forEach(function (mr) {
      mr.detalhe.forEach(function (v) {
        if (cur.cats.indexOf(v.categoria) >= 0) out.push(v);
      });
    });
    return out.sort(function (a, b) { return b.data.localeCompare(a.data); });
  }, [monthResults, cur]);

  // Maior venda do mes atual (pra IsencaoIndicator)
  var mesMaiorVenda = useMemo(function () {
    var max = 0;
    rows.forEach(function (r) { if (r.vendas > max) max = r.vendas; });
    return max;
  }, [rows]);

  var cols: IRMonthCol<RowData>[] = [
    {
      key: 'vendas',
      label: 'Vendas',
      align: 'right',
      render: function (r) { return r.vendas === 0 ? <span className="font-mono text-white/30">—</span> : <span className="font-mono text-white/70">R$ {fmtBRL(r.vendas)}</span>; },
      footer: function () { return <span className="font-mono text-white/90">R$ {fmtBRL(totais.vendas)}</span>; },
    },
    {
      key: 'ganho',
      label: 'Ganho liquido',
      align: 'right',
      render: function (r) { return <IRMoneyCell value={r.ganho} />; },
      footer: function () { return <IRMoneyCell value={totais.ganho} />; },
    },
    {
      key: 'isencao',
      label: cur.isencao20k ? 'Isencao 20k?' : 'Silo',
      align: 'right',
      render: function (r) {
        if (cur.isencao20k && r.isento) {
          return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Isento</span>;
        }
        if (cur.isencao20k && r.vendas > LIMITES_ISENCAO.acoes_vendas_mes && r.ganho > 0) {
          return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">+20k</span>;
        }
        return <span className="font-mono text-white/30 text-[10px]">—</span>;
      },
    },
    {
      key: 'imposto',
      label: 'IR devido',
      align: 'right',
      render: function (r) {
        if (r.imposto === 0) return <span className="font-mono text-white/30">—</span>;
        return <span className="font-mono text-red-300 font-semibold">R$ {fmtBRL(r.imposto)}</span>;
      },
      footer: function () { return <span className="font-mono text-red-300 font-bold">R$ {fmtBRL(totais.imposto)}</span>; },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Renda Variavel — {ano}</h1>
          <p className="text-xs text-white/40 mt-1">Swing trade por categoria: ganhos, prejuizos, IR devido mes a mes.</p>
        </div>
      </div>

      {/* Sub-tabs de categoria */}
      <div className="flex flex-wrap items-center gap-1 rounded-md bg-white/[0.03] border border-white/[0.06] p-0.5 w-fit">
        {SUB_TABS.map(function (t) {
          var active = subtab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={function () { setSubtab(t.key); }}
              className={'px-2.5 py-1.5 rounded text-[11px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]')}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* KPIs da categoria */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiIR label="Vendas totais" value={totais.vendas} accent="text-white" />
        <KpiIR label="Ganho/Perda liquido" value={totais.ganho} accent={totais.ganho >= 0 ? 'text-income' : 'text-red-400'} />
        <KpiIR label="IR devido no ano" value={totais.imposto} accent="text-red-300" />
        {cur.isencao20k ? (
          <div className="linear-card rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-2">
              Isencao mensal (maior mes)
            </p>
            <IsencaoIndicator atual={mesMaiorVenda} limite={LIMITES_ISENCAO.acoes_vendas_mes} />
          </div>
        ) : (
          <div className="linear-card rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Silo de compensacao</p>
            <p className="text-[13px] font-semibold text-white/80 mt-1">{cur.label}</p>
            <p className="text-[10px] text-white/40 mt-0.5">Prejuizo so compensa ganho desta categoria.</p>
          </div>
        )}
      </div>

      {/* Tabela mensal */}
      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">{cur.label} — mensal</p>
        <IRMonthTable rows={rows} cols={cols} emptyMessage={'Sem operacoes em ' + ano + '.'} />
      </div>

      {/* Detalhe de vendas */}
      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Detalhamento de vendas ({detalheVendas.length})</p>
        {detalheVendas.length === 0 ? (
          <p className="text-[12px] text-white/30 italic py-4">Nenhuma venda nesta categoria em {ano}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/[0.06]">
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Data</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Ticker</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Qty</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Preco venda</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">PM</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Custos</th>
                  <th className="py-2 font-medium uppercase tracking-wider text-[9px] text-right">Ganho</th>
                </tr>
              </thead>
              <tbody>
                {detalheVendas.slice(0, 500).map(function (v, i) {
                  return (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                      <td className="py-1.5 pr-3 font-mono text-white/60">{v.data}</td>
                      <td className="py-1.5 pr-3 font-semibold">{v.ticker}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-white/60">{v.quantidade}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-white/70">R$ {fmtBRL(v.precoVenda)}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-white/60">R$ {fmtBRL(v.precoMedio)}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-white/50">R$ {fmtBRL(v.custos)}</td>
                      <td className="py-1.5 font-mono text-right">
                        <IRMoneyCell value={v.ganho} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {detalheVendas.length > 500 ? (
              <p className="text-[10px] text-white/40 text-center mt-3">
                Exibindo primeiras 500 de {detalheVendas.length} vendas.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Caixa Contador da categoria ativa */}
      <CaixaContador secao={cur.contador} defaultOpen={false} />
    </div>
  );
}

function KpiIR(props: { label: string; value: number; accent: string }) {
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-xl font-bold font-mono mt-1 ' + props.accent}>
        {props.value >= 0 ? 'R$ ' : '-R$ '}{fmtBRL(Math.abs(props.value || 0))}
      </p>
    </div>
  );
}
