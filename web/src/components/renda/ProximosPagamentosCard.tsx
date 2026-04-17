'use client';

// Card "Proximos Pagamentos" hibrido:
// - CONFIRMADO (badge verde): provento ja anunciado oficialmente com
//   data_pagamento futura, vindo da tabela `proventos` (sincronizada).
// - ESTIMADO (badge amarelo): inferencia via calendario externo
//   (DM/StatusInvest) na tabela `proventos_agenda`, exposto pelo hook
//   useProventosCalendar.
//
// Ordenacao: data_pagamento crescente. Top 10 + "Ver todos" quando > 10.

import { useMemo } from 'react';
import { useAppStore, type Provento, type ProventoEstimado } from '@/store';
import { TickerLogo } from '@/components/TickerLogo';
import { useProventosCalendar } from '@/lib/queries';
import { tipoLabel, valorLiquido, isIntTicker } from '@/lib/proventosUtils';
import { fmtBRL } from '@/lib/fmt';

interface ProximosItem {
  ticker: string;
  categoria: string;
  data_pagamento: string;    // YYYY-MM-DD
  valor_liquido: number;     // ja com IR descontado (JCP 15%, INT 30%)
  tipo: string;              // tipo_provento normalizado
  confirmado: boolean;
  fonte?: string;            // 'manual' | 'dm' | 'statusinvest' | 'cache' | 'sync'
}

function parseIsoDate(s: string): Date {
  // Aceita YYYY-MM-DD ou ISO completo
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return new Date(0);
}

function fmtCurtaData(d: Date): string {
  var meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return String(d.getDate()).padStart(2, '0') + ' ' + meses[d.getMonth()];
}

function diasAte(dpIso: string): string {
  var d = parseIsoDate(dpIso);
  var ms = d.getTime() - Date.now();
  var dias = Math.ceil(ms / 86400000);
  if (dias < 0) return 'hoje';
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanha';
  if (dias <= 7) return 'em ' + dias + 'd';
  if (dias <= 30) return 'em ' + dias + 'd';
  return 'em ' + Math.round(dias / 30) + 'm';
}

export function ProximosPagamentosCard() {
  var proventos = useAppStore(function (s) { return s.proventos; });
  var positions = useAppStore(function (s) { return s.positions; });
  var estimadosStore = useAppStore(function (s) { return s.renda.proventosEstimados; });

  // Tickers em carteira (quantidade > 0)
  var tickers = useMemo(function () {
    return positions.filter(function (p) { return p.quantidade > 0; }).map(function (p) { return p.ticker; });
  }, [positions]);

  // Dispara calendario externo pros tickers ativos (hidrata o store)
  useProventosCalendar(tickers, 60);

  var catByTicker = useMemo(function () {
    var m: Record<string, string> = {};
    positions.forEach(function (p) { m[p.ticker] = p.categoria; });
    return m;
  }, [positions]);

  var qtyByTicker = useMemo(function () {
    var m: Record<string, number> = {};
    positions.forEach(function (p) { m[p.ticker] = p.quantidade; });
    return m;
  }, [positions]);

  // Monta lista unificada
  var lista: ProximosItem[] = useMemo(function () {
    var out: ProximosItem[] = [];
    var now = Date.now();
    var limiteFuturo = now + 60 * 86400000;

    // 1) Confirmados: proventos com data_pagamento > hoje (oficial, anunciado)
    proventos.forEach(function (p: Provento) {
      var dp = parseIsoDate(p.data_pagamento).getTime();
      if (dp < now) return;
      if (dp > limiteFuturo) return;
      out.push({
        ticker: p.ticker,
        categoria: catByTicker[p.ticker] || (isIntTicker(p.ticker) ? 'stock_int' : 'acao'),
        data_pagamento: p.data_pagamento,
        valor_liquido: valorLiquido(p.valor_total || 0, p.tipo_provento, p.ticker),
        tipo: p.tipo_provento,
        confirmado: true,
        fonte: p.fonte || 'manual',
      });
    });

    // 2) Estimados: do calendario externo. Projetam valor por cota × qty atual.
    // Dedup: se ja existe confirmado com mesmo ticker+data_pagamento+tipo, pula.
    var confKey: Record<string, boolean> = {};
    out.forEach(function (it) { confKey[it.ticker + '|' + it.data_pagamento + '|' + tipoLabel(it.tipo)] = true; });

    estimadosStore.forEach(function (e: ProventoEstimado) {
      var dp = parseIsoDate(e.data_pagamento).getTime();
      if (dp < now) return;
      if (dp > limiteFuturo) return;
      var k = e.ticker + '|' + e.data_pagamento + '|' + tipoLabel(e.tipo);
      if (confKey[k]) return;
      var qty = qtyByTicker[e.ticker] || 0;
      if (qty <= 0) return;
      var bruto = e.valor_por_cota * qty;
      out.push({
        ticker: e.ticker,
        categoria: catByTicker[e.ticker] || (isIntTicker(e.ticker) ? 'stock_int' : 'acao'),
        data_pagamento: e.data_pagamento,
        valor_liquido: valorLiquido(bruto, e.tipo, e.ticker),
        tipo: e.tipo,
        confirmado: false,
        fonte: e.fonte || 'dm',
      });
    });

    out.sort(function (a, b) { return a.data_pagamento.localeCompare(b.data_pagamento); });
    return out;
  }, [proventos, estimadosStore, catByTicker, qtyByTicker]);

  var top10 = lista.slice(0, 10);
  var totalMostrado = top10.reduce(function (acc, x) { return acc + x.valor_liquido; }, 0);
  var qtdConfirmados = lista.filter(function (x) { return x.confirmado; }).length;
  var qtdEstimados = lista.length - qtdConfirmados;

  return (
    <div className="col-span-12 lg:col-span-6 linear-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono">Proximos pagamentos · 60 dias</p>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="flex items-center gap-1 text-emerald-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {qtdConfirmados} confirmado{qtdConfirmados === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1 text-amber-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            {qtdEstimados} estimado{qtdEstimados === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="text-[12px] text-white/30 italic py-4">
          Sem pagamentos previstos nos proximos 60 dias.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {top10.map(function (x, idx) {
              var d = parseIsoDate(x.data_pagamento);
              return (
                <div
                  key={x.ticker + '-' + x.data_pagamento + '-' + x.tipo + '-' + idx}
                  className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TickerLogo ticker={x.ticker} categoria={x.categoria} size={26} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold leading-tight truncate">{x.ticker}</p>
                      <p className="text-[10px] text-white/40 leading-tight mt-0.5">
                        {fmtCurtaData(d)} · {diasAte(x.data_pagamento)} · {tipoLabel(x.tipo)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={
                        'text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ' +
                        (x.confirmado
                          ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/30'
                          : 'text-amber-300 bg-amber-500/10 border border-amber-500/25')
                      }
                      title={x.confirmado ? 'Anunciado oficialmente' : 'Estimado via historico + calendario externo'}
                    >
                      {x.confirmado ? 'Confirmado' : 'Estimado'}
                    </span>
                    <p className="text-[12px] font-mono font-semibold text-income">
                      R$ {fmtBRL(x.valor_liquido)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {lista.length > 10 ? (
            <p className="text-[10px] text-white/40 mt-2 text-center">
              + {lista.length - 10} pagamentos
            </p>
          ) : null}

          <div className="mt-3 pt-2 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-white/50">Total liquido</span>
            <span className="font-mono text-[13px] font-semibold text-income">R$ {fmtBRL(totalMostrado)}</span>
          </div>
        </>
      )}
    </div>
  );
}
