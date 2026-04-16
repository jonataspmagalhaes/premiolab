'use client';

import { useMemo, useState } from 'react';
import { computeAporteSuggestions, type RebalanceTargets } from '@/lib/rebalance';
import { useAppStore } from '@/store';
import { TickerLogo } from '@/components/TickerLogo';
import { usePlannedTickerPrices } from '@/hooks/usePlannedTickerPrices';

interface Props {
  targets: RebalanceTargets;
  total: number;
}

export function AporteSimulator({ targets, total }: Props) {
  const positions = useAppStore((s) => s.positions);
  const [aporteText, setAporteText] = useState('');
  const [copied, setCopied] = useState(false);

  // Busca precos de tickers planejados (com meta mas sem posicao)
  const { planned, isFetching: pricesFetching } = usePlannedTickerPrices(targets.ticker_targets);

  const aporte = parseAporte(aporteText);
  const suggestions = useMemo(
    () => computeAporteSuggestions(positions, targets, aporte, total, planned),
    [positions, targets, aporte, total, planned],
  );

  const totalAlocado = suggestions.reduce((s, x) => s + x.valor, 0);
  const sobra = aporte - totalAlocado;

  function copyPlan() {
    if (suggestions.length === 0) return;
    const lines: string[] = ['Plano de aporte — R$ ' + aporte.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })];
    for (const s of suggestions) {
      lines.push(`${s.ticker} × ${s.cotas} cotas @ R$ ${s.preco.toFixed(2).replace('.', ',')} = R$ ${s.valor.toFixed(2).replace('.', ',')}  [${s.motivo}]`);
    }
    if (sobra > 0.5) {
      lines.push('— Sobra: R$ ' + sobra.toFixed(2).replace('.', ','));
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1">Vou aportar</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-white/40 pointer-events-none">R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={aporteText}
              onChange={(e) => setAporteText(e.target.value)}
              placeholder="0,00"
              className="w-full pl-9 pr-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] text-[13px] font-mono text-white/90 focus:outline-none focus:border-orange-500/40"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={copyPlan}
          disabled={suggestions.length === 0}
          className="px-3 py-2 rounded-md bg-orange-500/15 border border-orange-500/25 text-orange-300 text-[11px] font-semibold hover:bg-orange-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copied ? 'Copiado!' : 'Copiar plano'}
        </button>
      </div>

      {aporte <= 0 && (
        <p className="text-[11px] text-white/40 italic">Digite o valor do aporte para ver sugestoes.</p>
      )}

      {aporte > 0 && suggestions.length === 0 && (
        <p className="text-[11px] text-white/40 italic">
          {pricesFetching
            ? 'Buscando precos dos tickers planejados...'
            : 'Nenhuma sugestao gerada. Defina metas por classe ou ticker para o simulador funcionar.'}
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          {suggestions.map((s, i) => (
            <div key={s.ticker + i} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-white/[0.025] border border-white/[0.04]">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <TickerLogo ticker={s.ticker} categoria={s.categoria} size={22} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-semibold text-white/90">{s.ticker}</span>
                    {s.novo && (
                      <span className="px-1 py-px rounded bg-emerald-500/15 text-emerald-300 text-[8px] font-bold uppercase tracking-wider">novo</span>
                    )}
                    <span className="text-[10px] text-white/40">× {s.cotas} cotas</span>
                  </div>
                  <span className="text-[10px] text-white/45">{motivoLabel(s.motivo)} · {s.sector}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[12px] font-mono font-semibold text-white/90">R$ {s.valor.toFixed(2).replace('.', ',')}</p>
                <p className="text-[9px] text-white/40 font-mono">@ {s.preco.toFixed(2).replace('.', ',')}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-2.5 pt-2 text-[10px] text-white/50">
            <span>Total alocado: <span className="font-mono text-white/70">R$ {totalAlocado.toFixed(2).replace('.', ',')}</span></span>
            {sobra > 0.5 && (
              <span>Sobra: <span className="font-mono text-amber-300">R$ {sobra.toFixed(2).replace('.', ',')}</span></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function parseAporte(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function motivoLabel(m: string): string {
  if (m === 'class_deficit') return 'Falta na classe';
  if (m === 'sector_deficit') return 'Falta no setor';
  if (m === 'ticker_deficit') return 'Meta do ticker';
  return m;
}
