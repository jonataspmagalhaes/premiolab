'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/store';
import { tipoLabel, isIntTicker, valorLiquido } from '@/lib/proventosUtils';
import { fmtBRL } from '@/lib/fmt';
import { Download, ArrowLeft } from 'lucide-react';

// Classifica provento pra declaracao IR
// Isento: dividendos BR, rendimentos FII
// Tributado 15%: JCP BR
// Tributado 30%: dividendos US (retido na fonte)
type CategoriaIR = 'isento_div' | 'isento_fii' | 'tributado_jcp' | 'tributado_us';

interface ItemIR {
  ticker: string;
  tipo: string;
  data: string;
  bruto: number;
  liquido: number;
  ir: number;
  categoria: CategoriaIR;
  categoria_label: string;
}

function categorize(ticker: string, tipoProv: string, bruto: number): { cat: CategoriaIR; liquido: number; ir: number; label: string } {
  var tl = tipoLabel(tipoProv);
  if (tl === 'JCP') return { cat: 'tributado_jcp', liquido: bruto * 0.85, ir: bruto * 0.15, label: 'JCP (IR 15% retido)' };
  if (isIntTicker(ticker)) return { cat: 'tributado_us', liquido: bruto * 0.70, ir: bruto * 0.30, label: 'Dividendo EUA (IR 30% retido)' };
  if (tl === 'Rendimento') return { cat: 'isento_fii', liquido: bruto, ir: 0, label: 'Rendimento FII (isento)' };
  return { cat: 'isento_div', liquido: bruto, ir: 0, label: 'Dividendo (isento)' };
}

function exportCSV(items: ItemIR[], year: number) {
  var header = 'Ticker,Tipo,Data Pagamento,Valor Bruto,Valor Liquido,IR Retido,Categoria IR\n';
  var rows = items.map(function (i) {
    return [i.ticker, i.tipo, i.data, i.bruto.toFixed(2), i.liquido.toFixed(2), i.ir.toFixed(2), i.categoria_label].join(',');
  }).join('\n');
  var blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'proventos_ir_' + year + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function RelatorioIRPage() {
  var proventos = useAppStore(function (s) { return s.proventos; });

  var thisYear = new Date().getFullYear();
  var _year = useState<number>(thisYear - 1); // ano-base padrao: ano anterior (declaracao em abril)
  var year = _year[0]; var setYear = _year[1];

  var anos = useMemo(function () {
    var set: Record<number, boolean> = {};
    proventos.forEach(function (p) {
      var y = new Date(p.data_pagamento).getFullYear();
      if (!Number.isNaN(y)) set[y] = true;
    });
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; });
  }, [proventos]);

  var items: ItemIR[] = useMemo(function () {
    return proventos
      .filter(function (p) { return new Date(p.data_pagamento).getFullYear() === year; })
      .map(function (p) {
        var cat = categorize(p.ticker, p.tipo_provento, p.valor_total || 0);
        return {
          ticker: p.ticker,
          tipo: tipoLabel(p.tipo_provento),
          data: p.data_pagamento,
          bruto: p.valor_total || 0,
          liquido: cat.liquido,
          ir: cat.ir,
          categoria: cat.cat,
          categoria_label: cat.label,
        };
      })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }, [proventos, year]);

  var resumo = useMemo(function () {
    var r = {
      isento_div: { count: 0, total: 0 },
      isento_fii: { count: 0, total: 0 },
      tributado_jcp: { count: 0, total: 0, ir: 0 },
      tributado_us: { count: 0, total: 0, ir: 0 },
    };
    items.forEach(function (i) {
      var k = i.categoria;
      r[k].count += 1;
      r[k].total += i.bruto;
      if (k === 'tributado_jcp' || k === 'tributado_us') r[k].ir += i.ir;
    });
    return r;
  }, [items]);

  var totalIsento = resumo.isento_div.total + resumo.isento_fii.total;
  var totalTributado = resumo.tributado_jcp.total + resumo.tributado_us.total;
  var totalIR = resumo.tributado_jcp.ir + resumo.tributado_us.ir;
  var totalLiquido = totalIsento + (totalTributado - totalIR);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/app/renda" className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white mb-1 transition">
            <ArrowLeft className="w-3 h-3" /> Voltar pra Renda
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Relatório IR</h1>
          <p className="text-xs text-white/40">Proventos classificados para declaração anual</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={function (e) { setYear(parseInt(e.target.value, 10)); }}
            className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-orange-500/40"
          >
            {anos.length === 0 ? <option value={thisYear - 1}>{thisYear - 1}</option> : null}
            {anos.map(function (y) { return <option key={y} value={y}>{y}</option>; })}
          </select>
          <button
            type="button"
            onClick={function () { exportCSV(items, year); }}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/40 text-[12px] font-medium hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Totais topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="linear-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Total bruto</p>
          <p className="text-xl font-bold font-mono mt-1">R$ {fmtBRL(totalIsento + totalTributado)}</p>
          <p className="text-[10px] text-white/30 mt-0.5">{items.length} proventos</p>
        </div>
        <div className="linear-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-mono">Isentos</p>
          <p className="text-xl font-bold font-mono mt-1 text-emerald-300">R$ {fmtBRL(totalIsento)}</p>
          <p className="text-[10px] text-white/30 mt-0.5">Dividendos BR + Rend. FII</p>
        </div>
        <div className="linear-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-mono">Tributados</p>
          <p className="text-xl font-bold font-mono mt-1 text-amber-300">R$ {fmtBRL(totalTributado)}</p>
          <p className="text-[10px] text-white/30 mt-0.5">JCP + Dividendos EUA</p>
        </div>
        <div className="linear-card rounded-xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-red-400/80 font-mono">IR retido</p>
          <p className="text-xl font-bold font-mono mt-1 text-red-300">R$ {fmtBRL(totalIR)}</p>
          <p className="text-[10px] text-white/30 mt-0.5">Já descontado na fonte</p>
        </div>
      </div>

      {/* Quebra por categoria */}
      <div className="linear-card rounded-xl p-5">
        <h3 className="text-[13px] font-semibold mb-3">Classificação fiscal</h3>
        <div className="space-y-2">
          <CategoriaRow
            label="Dividendos (BR) — Isento"
            info="Linha 'Rendimentos Isentos' - Ficha 09 - Código 09"
            total={resumo.isento_div.total}
            count={resumo.isento_div.count}
            color="emerald"
          />
          <CategoriaRow
            label="Rendimentos FII — Isento"
            info="Linha 'Rendimentos Isentos' - Ficha 09 - Código 26"
            total={resumo.isento_fii.total}
            count={resumo.isento_fii.count}
            color="emerald"
          />
          <CategoriaRow
            label="JCP — Tributado 15% (retido na fonte)"
            info="Linha 'Tributação Exclusiva' - Ficha 10 - Código 10"
            total={resumo.tributado_jcp.total}
            count={resumo.tributado_jcp.count}
            ir={resumo.tributado_jcp.ir}
            color="amber"
          />
          <CategoriaRow
            label="Dividendos EUA — Tributado 30% na fonte"
            info="Linha 'Rendimentos no Exterior' - IR pago pode ser deduzido"
            total={resumo.tributado_us.total}
            count={resumo.tributado_us.count}
            ir={resumo.tributado_us.ir}
            color="amber"
          />
        </div>

        <div className="mt-4 pt-4 border-t border-white/[0.06] text-[11px] text-white/50">
          <p>
            <span className="font-semibold text-white/70">Total líquido recebido em {year}:</span>{' '}
            <span className="font-mono font-bold text-income">R$ {fmtBRL(totalLiquido)}</span>
          </p>
          <p className="mt-1 text-white/40">
            ⚠️ Informações para orientação. Sempre verifique com contador e Receita Federal.
          </p>
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="linear-card rounded-xl p-5">
        <h3 className="text-[13px] font-semibold mb-3">Detalhamento ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-[12px] text-white/40 italic text-center py-8">Sem proventos em {year}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/[0.06]">
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Data</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Ticker</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Tipo</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Bruto</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">IR</th>
                  <th className="py-2 font-medium uppercase tracking-wider text-[9px] text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {items.map(function (i, idx) {
                  return (
                    <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                      <td className="py-2 pr-3 font-mono text-white/60">{i.data}</td>
                      <td className="py-2 pr-3 font-semibold">{i.ticker}</td>
                      <td className="py-2 pr-3">
                        <span className={'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ' +
                          (i.categoria === 'isento_fii' ? 'text-emerald-300 bg-emerald-500/10' :
                           i.categoria === 'tributado_jcp' ? 'text-amber-300 bg-amber-500/10' :
                           i.categoria === 'tributado_us' ? 'text-amber-300 bg-amber-500/10' :
                           'text-white/60 bg-white/[0.06]')}>
                          {i.tipo}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-right">R$ {fmtBRL(i.bruto)}</td>
                      <td className="py-2 pr-3 font-mono text-right text-red-300">
                        {i.ir > 0 ? '-R$ ' + fmtBRL(i.ir) : '—'}
                      </td>
                      <td className="py-2 font-mono text-right text-income font-semibold">R$ {fmtBRL(i.liquido)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoriaRow({ label, info, total, count, ir, color }: {
  label: string; info: string; total: number; count: number; ir?: number; color: 'emerald' | 'amber';
}) {
  var colorClass = color === 'emerald' ? 'text-emerald-300' : 'text-amber-300';
  return (
    <div className="flex items-start justify-between py-2 border-b border-white/[0.04] last:border-0">
      <div className="flex-1 pr-3">
        <p className="text-[12px] font-medium">{label}</p>
        <p className="text-[10px] text-white/40 mt-0.5">{info}</p>
      </div>
      <div className="text-right">
        <p className={'text-[13px] font-mono font-bold ' + colorClass}>R$ {fmtBRL(total)}</p>
        <p className="text-[10px] text-white/40 mt-0.5">
          {count} {count === 1 ? 'provento' : 'proventos'}
          {typeof ir === 'number' && ir > 0 ? ' · IR R$ ' + fmtBRL(ir) : ''}
        </p>
      </div>
    </div>
  );
}
