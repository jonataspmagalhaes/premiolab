'use client';

// /app/ir/darf — Central de DARFs. Lista todas as DARFs do ano com
// toggle de status pago (persistido em localStorage; DB persistencia
// em ir_pagamentos fica pra quando migration estiver aplicada).

import { useEffect, useMemo, useState } from 'react';
import { useIRYear } from '../_yearContext';
import { useIR } from '@/lib/ir/useIR';
import { DarfCard } from '@/components/ir/DarfCard';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { fmtBRL } from '@/lib/fmt';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';

var STORAGE_KEY = 'premiolab-ir-darfs-pagos';

function loadPagos(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function savePagos(p: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export default function DarfCentralPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var ir = useIR(ano);

  var _pagos = useState<Record<string, boolean>>({});
  var pagos = _pagos[0];
  var setPagos = _pagos[1];

  useEffect(function () {
    setPagos(loadPagos());
  }, []);

  function keyFor(mes: string, codigo: string): string {
    return mes + '-' + codigo;
  }

  function togglePago(mes: string, codigo: string, novoPago: boolean) {
    var next = Object.assign({}, pagos);
    next[keyFor(mes, codigo)] = novoPago;
    setPagos(next);
    savePagos(next);
  }

  var darfs = ir.data?.darfs || [];

  var resumo = useMemo(function () {
    var r = { total: 0, pago: 0, devido: 0, vencidas: 0 };
    darfs.forEach(function (d) {
      r.total += d.valorTotal;
      if (pagos[keyFor(d.mes, d.codigo)]) {
        r.pago += d.valorTotal;
      } else {
        r.devido += d.valorTotal;
        try {
          var v = new Date(d.vencimento);
          if (v.getTime() < Date.now()) r.vencidas += 1;
        } catch { /* ignore */ }
      }
    });
    return r;
  }, [darfs, pagos]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">DARF Central — {ano}</h1>
        <p className="text-xs text-white/40 mt-1">
          Gerador, historico e status de pagamento das DARFs.
          Status pago e persistido localmente ate a migration de ir_pagamentos ser aplicada.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total emitido" value={resumo.total} accent="text-white" sub={darfs.length + ' DARF' + (darfs.length === 1 ? '' : 's')} />
        <Kpi label="Pago" value={resumo.pago} accent="text-emerald-300" />
        <Kpi label="Em aberto" value={resumo.devido} accent="text-amber-300" />
        <Kpi
          label="Vencidas nao pagas"
          valueRaw={resumo.vencidas}
          accent={resumo.vencidas > 0 ? 'text-red-300' : 'text-white/60'}
          sub={resumo.vencidas > 0 ? 'Incide multa + Selic' : 'Em dia'}
        />
      </div>

      {resumo.vencidas > 0 ? (
        <div className="linear-card rounded-xl p-4 border border-red-500/30 bg-red-500/[0.04] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-red-300">DARFs vencidas nao pagas</p>
            <p className="text-[11px] text-white/70 mt-1 leading-relaxed">
              Multa: 0,33% ao dia (max 20%) + juros Selic acumulada. Use o Sicalc para
              calcular o valor corrigido no momento do pagamento.
            </p>
          </div>
        </div>
      ) : null}

      {darfs.length === 0 ? (
        <div className="linear-card rounded-xl p-8 text-center border border-emerald-500/20 bg-emerald-500/[0.02]">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-[13px] text-emerald-300 font-semibold">Sem DARFs devidas em {ano}</p>
          <p className="text-[11px] text-white/50 mt-1">
            Considerando isencoes aplicadas e compensacao de prejuizo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {darfs.map(function (d, i) {
            return (
              <DarfCard
                key={d.mes + '-' + d.codigo + '-' + i}
                darf={d}
                pago={pagos[keyFor(d.mes, d.codigo)] || false}
                onTogglePago={togglePago}
              />
            );
          })}
        </div>
      )}

      <CaixaContador secao="darf" defaultOpen={false} />

      <div className="flex items-start gap-2 text-[10px] text-white/40 leading-relaxed">
        <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          Use o programa Sicalc da Receita (https://www.gov.br/receitafederal) pra emitir
          a DARF oficial com codigo de barras. Esta tela gera apenas o texto
          orientativo copiavel. R$ {fmtBRL(resumo.total)} em DARFs identificadas em {ano}.
        </p>
      </div>
    </div>
  );
}

function Kpi(props: { label: string; value?: number; valueRaw?: number; accent: string; sub?: string }) {
  var display = props.valueRaw != null ? String(props.valueRaw) : 'R$ ' + fmtBRL(props.value || 0);
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-xl font-bold font-mono mt-1 ' + props.accent}>{display}</p>
      {props.sub ? <p className="text-[10px] text-white/30 mt-0.5">{props.sub}</p> : null}
    </div>
  );
}
