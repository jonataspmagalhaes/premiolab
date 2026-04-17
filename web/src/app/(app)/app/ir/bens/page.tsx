'use client';

// /app/ir/bens — Ficha de Bens e Direitos. Posicao em 31/12 por ativo
// agrupada pelo codigo IRPF, com discriminacao gerada pronta pra colar.

import { useMemo, useState } from 'react';
import { useIRYear } from '../_yearContext';
import { useAppStore } from '@/store';
import { useOperacoesRaw, useUser } from '@/lib/queries';
import { computeFichaBens, bensParaTexto } from '@/lib/ir/bens';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { fmtBRL } from '@/lib/fmt';
import { Copy, Check } from 'lucide-react';
import type { BensItem, OperacaoRaw } from '@/lib/ir/types';

export default function BensDireitosPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var user = useUser();
  var opsQuery = useOperacoesRaw(user.data?.id);
  var rf = useAppStore(function (s) { return s.rf; });

  var ops = useMemo<OperacaoRaw[]>(function () {
    return (opsQuery.data || []) as unknown as OperacaoRaw[];
  }, [opsQuery.data]);

  var items = useMemo<BensItem[]>(function () {
    return computeFichaBens(ops, ano, rf);
  }, [ops, ano, rf]);

  // Agrupa por codigo IRPF
  var grupos = useMemo(function () {
    var m: Record<string, { codigo: string; grupo: string; items: BensItem[]; total: number }> = {};
    items.forEach(function (it) {
      if (!m[it.codigo]) m[it.codigo] = { codigo: it.codigo, grupo: it.grupo, items: [], total: 0 };
      m[it.codigo].items.push(it);
      m[it.codigo].total += it.valorTotalBRL;
    });
    return Object.values(m).sort(function (a, b) { return a.codigo.localeCompare(b.codigo); });
  }, [items]);

  var totalGeral = useMemo(function () {
    return items.reduce(function (a, i) { return a + i.valorTotalBRL; }, 0);
  }, [items]);

  var _copied = useState<string | null>(null);
  var copied = _copied[0];
  var setCopied = _copied[1];

  function copyOne(it: BensItem) {
    var texto = it.codigo + ' | ' + it.descricao + ' | R$ ' + it.valorTotalBRL.toFixed(2);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () {
        setCopied(it.ticker + '-' + it.codigo);
        setTimeout(function () { setCopied(null); }, 2000);
      });
    }
  }

  function copyAll() {
    var texto = bensParaTexto(items, ano);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () {
        setCopied('ALL');
        setTimeout(function () { setCopied(null); }, 2000);
      });
    }
  }

  function exportTxt() {
    var texto = bensParaTexto(items, ano);
    var blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bens_direitos_' + ano + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Bens e Direitos — 31/12/{ano}</h1>
          <p className="text-xs text-white/40 mt-1">
            Custo de aquisicao em BRL (nao valor de mercado). Stocks INT convertidos
            via taxa de cambio de cada compra.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyAll}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-40 text-[11px] font-medium transition"
          >
            {copied === 'ALL' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === 'ALL' ? 'Copiado!' : 'Copiar todas'}
          </button>
          <button
            type="button"
            onClick={exportTxt}
            disabled={items.length === 0}
            className="px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-[11px] text-white/70 hover:text-white disabled:opacity-40 transition"
          >
            Exportar TXT
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label="Total de bens" value={items.length} accent="text-white" isCount />
        <Kpi label="Valor total" value={totalGeral} accent="text-income" />
        <Kpi label="Grupos IRPF" value={grupos.length} accent="text-orange-300" isCount />
      </div>

      {/* Grupos por codigo */}
      {grupos.length === 0 ? (
        <div className="linear-card rounded-xl p-8 text-center">
          <p className="text-[12px] text-white/30 italic">Nenhum bem em 31/12/{ano}.</p>
        </div>
      ) : (
        grupos.map(function (g) {
          return (
            <div key={g.codigo} className="linear-card rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30">
                    codigo {g.codigo}
                  </span>
                  <p className="text-[12px] font-semibold text-white/80">{g.grupo}</p>
                </div>
                <p className="text-[13px] font-mono font-bold text-income">R$ {fmtBRL(g.total)}</p>
              </div>
              <div className="space-y-2">
                {g.items.map(function (it, idx) {
                  var key = (it.ticker || 'rf') + '-' + idx + '-' + it.codigo;
                  return (
                    <div key={key} className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.03] last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-white/80 leading-snug">{it.descricao}</p>
                        {it.custoMedioUSD ? (
                          <p className="text-[10px] text-white/40 mt-0.5">
                            Custo USD: {it.custoMedioUSD.toFixed(2)} × {it.quantidade.toLocaleString('pt-BR')}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-[12px] font-mono font-semibold">R$ {fmtBRL(it.valorTotalBRL)}</p>
                        <button
                          type="button"
                          onClick={function () { copyOne(it); }}
                          className="p-1 rounded hover:bg-white/[0.06] transition"
                          title="Copiar pra IRPF"
                        >
                          {copied === (it.ticker + '-' + it.codigo) ? (
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-white/50" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <CaixaContador secao="bens_direitos" defaultOpen={false} />
    </div>
  );
}

function Kpi(props: { label: string; value: number; accent: string; isCount?: boolean }) {
  var display = props.isCount ? String(props.value) : 'R$ ' + fmtBRL(props.value || 0);
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-xl font-bold font-mono mt-1 ' + props.accent}>{display}</p>
    </div>
  );
}
