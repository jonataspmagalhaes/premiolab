'use client';

// /app/ir/rendimentos — classificacao fiscal completa de proventos +
// CaixaContador para cada fonte. Cobre Ficha 09 (Isentos), Ficha 10
// (Exclusiva), Ficha 17 (Exterior).

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { useIRYear } from '../_yearContext';
import { classifyProventoIR, agruparPorCategoria } from '@/lib/ir/rendimentos';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { fmtBRL } from '@/lib/fmt';
import type { ItemRendimento, CategoriaRendimento } from '@/lib/ir/types';

interface CategoriaDisplay {
  key: CategoriaRendimento;
  label: string;
  ficha: string;
  codigo: string;
  contador: string | null; // chave em contadorContent; null = sem caixa
  color: string;           // tailwind token
}

var CATEGORIAS: CategoriaDisplay[] = [
  { key: 'isento_div_br', label: 'Dividendos BR — Isento', ficha: '09', codigo: '09', contador: 'dividendos_br', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  { key: 'isento_fii', label: 'Rendimentos FII — Isento', ficha: '09', codigo: '26', contador: null, color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  { key: 'tributado_jcp', label: 'JCP — Tributacao exclusiva 15%', ficha: '10', codigo: '10', contador: 'jcp', color: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  { key: 'tributado_us', label: 'Dividendos EUA — 30% retido', ficha: '17', codigo: '—', contador: 'dividendos_eua', color: 'text-info bg-info/10 border-info/25' },
  { key: 'tributado_rf', label: 'RF tributada — Exclusiva', ficha: '10', codigo: '06', contador: 'rf_tributada', color: 'text-amber-300 bg-amber-500/10 border-amber-500/25' },
  { key: 'isento_rf', label: 'RF isenta (LCI/LCA/debenture)', ficha: '09', codigo: '12/24', contador: 'rf_isenta', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' },
  { key: 'carne_leao', label: 'Carne-leao (sem retencao exterior)', ficha: 'Carne-leao', codigo: '—', contador: null, color: 'text-red-300 bg-red-500/10 border-red-500/25' },
];

export default function IRRendimentosPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var proventos = useAppStore(function (s) { return s.proventos; });

  var classificados = useMemo<ItemRendimento[]>(function () {
    return proventos
      .filter(function (p) { return p.data_pagamento && p.data_pagamento.substring(0, 4) === String(ano); })
      .map(classifyProventoIR);
  }, [proventos, ano]);

  var grupos = useMemo(function () { return agruparPorCategoria(classificados); }, [classificados]);

  var totalBruto = 0;
  var totalLiquido = 0;
  var totalIR = 0;
  classificados.forEach(function (r) {
    totalBruto += r.bruto;
    totalLiquido += r.liquido;
    totalIR += r.irRetido;
  });

  function handleExportCsv() {
    var header = 'Ticker,Tipo,Data,Bruto,Liquido,IR Retido,Ficha,Codigo,Categoria\n';
    var rows = classificados.map(function (i) {
      return [
        i.ticker,
        i.descricao.replace(/,/g, ';'),
        i.data,
        i.bruto.toFixed(2),
        i.liquido.toFixed(2),
        i.irRetido.toFixed(2),
        i.ficha,
        i.codigo,
        i.categoria,
      ].join(',');
    }).join('\n');
    var blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rendimentos_ir_' + ano + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Rendimentos — {ano}</h1>
          <p className="text-xs text-white/40 mt-1">
            Proventos classificados por ficha IRPF: isentos, tributacao exclusiva, exterior.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={classificados.length === 0}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Exportar CSV ({classificados.length})
        </button>
      </div>

      {/* Totais topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiIR label="Bruto total" value={totalBruto} accent="text-white" sub={classificados.length + ' pagamentos'} />
        <KpiIR label="Liquido recebido" value={totalLiquido} accent="text-income" sub="apos IR retido" />
        <KpiIR label="IR retido fonte" value={totalIR} accent="text-amber-300" sub="JCP + EUA" />
        <KpiIR label="Isentos (informar)" value={(grupos.isento_div_br?.total || 0) + (grupos.isento_fii?.total || 0)} accent="text-emerald-300" sub="Ficha 09" />
      </div>

      {/* Breakdown por categoria */}
      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Por categoria fiscal</p>
        <div className="space-y-2">
          {CATEGORIAS.map(function (c) {
            var g = grupos[c.key];
            if (!g || g.count === 0) return null;
            return (
              <div key={c.key} className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ' + c.color}>
                      Ficha {c.ficha} · {c.codigo}
                    </span>
                    <span className="text-[12px] font-semibold text-white/90">{c.label}</span>
                  </div>
                  <p className="text-[10px] text-white/40 mt-1">
                    {g.count} pagamento{g.count === 1 ? '' : 's'}
                    {g.irRetido > 0 ? ' · IR retido R$ ' + fmtBRL(g.irRetido) : ''}
                  </p>
                </div>
                <p className="text-[13px] font-mono font-bold text-white/90">R$ {fmtBRL(g.total)}</p>
              </div>
            );
          })}
          {classificados.length === 0 ? (
            <p className="text-[12px] text-white/30 italic py-4">Sem proventos em {ano}.</p>
          ) : null}
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Detalhamento ({classificados.length})</p>
        {classificados.length === 0 ? (
          <p className="text-[12px] text-white/30 italic py-4">Nenhum provento classificado em {ano}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/[0.06]">
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Data</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Ticker</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Descricao</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Ficha/Codigo</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Bruto</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">IR</th>
                  <th className="py-2 font-medium uppercase tracking-wider text-[9px] text-right">Liquido</th>
                </tr>
              </thead>
              <tbody>
                {classificados.slice(0, 500).map(function (r, i) {
                  return (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                      <td className="py-2 pr-3 font-mono text-white/60">{r.data}</td>
                      <td className="py-2 pr-3 font-semibold">{r.ticker}</td>
                      <td className="py-2 pr-3 text-white/70">{r.descricao}</td>
                      <td className="py-2 pr-3 font-mono text-orange-300 text-[10px]">{r.ficha} / {r.codigo}</td>
                      <td className="py-2 pr-3 font-mono text-right">R$ {fmtBRL(r.bruto)}</td>
                      <td className="py-2 pr-3 font-mono text-right text-red-300">
                        {r.irRetido > 0 ? '-R$ ' + fmtBRL(r.irRetido) : '—'}
                      </td>
                      <td className="py-2 font-mono text-right font-semibold text-income">R$ {fmtBRL(r.liquido)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {classificados.length > 500 ? (
              <p className="text-[10px] text-white/40 text-center mt-3">
                Exibindo primeiros 500 de {classificados.length}. Use Exportar CSV pra ver todos.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Caixas Contador — 4 principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CaixaContador secao="dividendos_br" defaultOpen={false} />
        <CaixaContador secao="jcp" defaultOpen={false} />
        <CaixaContador secao="dividendos_eua" defaultOpen={false} />
        <CaixaContador secao="rf_isenta" defaultOpen={false} />
      </div>
    </div>
  );
}

function KpiIR(props: { label: string; value: number; accent: string; sub?: string }) {
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-xl font-bold font-mono mt-1 ' + props.accent}>R$ {fmtBRL(props.value || 0)}</p>
      {props.sub ? <p className="text-[10px] text-white/30 mt-0.5">{props.sub}</p> : null}
    </div>
  );
}
