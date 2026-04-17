'use client';

// Card de DARF individual — mes, valor, vencimento, botoes copiar texto,
// marcar pago, exportar TXT.

import { useState } from 'react';
import type { DarfRecord } from '@/lib/ir/types';
import { buildDarfTexto } from '@/lib/ir/darf';
import { mesLabel } from '@/lib/ir/cambio';
import { fmtBRL } from '@/lib/fmt';
import { Copy, Check, Download, CircleCheck, Circle } from 'lucide-react';

interface Props {
  darf: DarfRecord;
  pago?: boolean;
  onTogglePago?: (mes: string, codigo: string, pago: boolean) => void;
}

export function DarfCard(props: Props) {
  var d = props.darf;
  var pago = props.pago || false;

  var _copied = useState(false);
  var copied = _copied[0];
  var setCopied = _copied[1];

  function handleCopy() {
    var texto = buildDarfTexto(d);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 2000);
      });
    }
  }

  function handleExport() {
    var texto = buildDarfTexto(d);
    var blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'darf_' + d.codigo + '_' + d.mes + '.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  var vencido = false;
  try {
    var venc = new Date(d.vencimento);
    vencido = !pago && venc.getTime() < Date.now();
  } catch { /* ignore */ }

  var borderClass = pago
    ? 'border-emerald-500/25 bg-emerald-500/[0.02]'
    : vencido
    ? 'border-red-500/40 bg-red-500/[0.04]'
    : 'border-orange-500/25 bg-white/[0.02]';

  return (
    <div className={'linear-card rounded-xl p-4 border ' + borderClass}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30">
              codigo {d.codigo}
            </span>
            <p className="text-[13px] font-semibold">{mesLabel(d.mes)}</p>
            {vencido ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 uppercase tracking-wider">
                Vencida
              </span>
            ) : null}
            {pago ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
                Pago
              </span>
            ) : null}
          </div>
          <p className="text-[10px] text-white/40 mt-1 font-mono">
            Vence em {d.vencimento}
          </p>
        </div>
        <div className="text-right">
          <p className={'text-xl font-mono font-bold ' + (pago ? 'text-emerald-300' : 'text-red-300')}>
            R$ {fmtBRL(d.valorTotal)}
          </p>
        </div>
      </div>

      {/* Detalhamento */}
      {d.porCategoria.filter(function (c) { return c.imposto > 0; }).length > 0 ? (
        <div className="text-[10px] text-white/50 mb-3 space-y-0.5">
          {d.porCategoria
            .filter(function (c) { return c.imposto > 0; })
            .map(function (c, i) {
              return (
                <div key={i} className="flex items-center justify-between">
                  <span>
                    {c.categoria} · R$ {c.baseCalculo.toFixed(2)} × {(c.aliquota * 100).toFixed(1)}%
                    {c.prejuizoConsumido > 0 ? ' (prej. R$ ' + c.prejuizoConsumido.toFixed(0) + ' consumido)' : ''}
                  </span>
                  <span className="font-mono text-white/70">R$ {c.imposto.toFixed(2)}</span>
                </div>
              );
            })}
        </div>
      ) : null}

      {/* Acoes */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.04]">
        {props.onTogglePago ? (
          <button
            type="button"
            onClick={function () {
              if (props.onTogglePago) props.onTogglePago(d.mes, d.codigo, !pago);
            }}
            className={'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition ' + (pago ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-white/[0.03] border border-white/[0.08] text-white/60 hover:text-white')}
          >
            {pago ? <CircleCheck className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
            {pago ? 'Pago' : 'Marcar pago'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-white/[0.03] border border-white/[0.08] text-white/60 hover:text-white transition"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copiado!' : 'Copiar texto'}
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-white/[0.03] border border-white/[0.08] text-white/60 hover:text-white transition"
        >
          <Download className="w-3.5 h-3.5" />
          TXT
        </button>
      </div>
    </div>
  );
}
