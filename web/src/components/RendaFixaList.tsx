'use client';

// Lista de Renda Fixa para exibir na Carteira.
// Mostra: cada titulo com taxa, prazo, valor aplicado, MTM estimado, projecao.
// Agregados: total aplicado, total estimado hoje, % composicao por tipo.
// Usa rendaFixaCalc (Fase 1) com indexadores estimados.

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { useUser } from '@/lib/queries';
import { RendaFixaSheet, type RendaFixaInitial } from '@/components/RendaFixaSheet';
import { useState } from 'react';
import {
  projetarRF,
  taxaEfetivaAA,
  diasEntre,
  defaultIndexador,
  type TipoRF,
  type Indexador,
} from '@/lib/rendaFixaCalc';
import { useMacroIndices } from '@/lib/useMacroIndices';

function fmtBRL(v: number): string {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return '-';
  var s = iso.substring(0, 10);
  var parts = s.split('-');
  if (parts.length !== 3) return s;
  return parts[2] + '/' + parts[1] + '/' + parts[0].substring(2);
}

function tipoLabel(tipo: string): string {
  if (tipo === 'tesouro_selic') return 'Tesouro Selic';
  if (tipo === 'tesouro_ipca') return 'Tesouro IPCA+';
  if (tipo === 'tesouro_pre') return 'Tesouro Pre';
  if (tipo === 'cdb') return 'CDB';
  if (tipo === 'lc') return 'LC';
  if (tipo === 'lci') return 'LCI';
  if (tipo === 'lca') return 'LCA';
  if (tipo === 'lci_lca') return 'LCI/LCA';
  if (tipo === 'lig') return 'LIG';
  if (tipo === 'cri') return 'CRI';
  if (tipo === 'cra') return 'CRA';
  if (tipo === 'debenture') return 'Debênture';
  if (tipo === 'debenture_incentivada') return 'Debênture Inc.';
  if (tipo === 'poupanca') return 'Poupança';
  return tipo;
}

function tipoCor(tipo: string): { bg: string; text: string } {
  if (tipo.startsWith('tesouro_')) return { bg: 'bg-info/10', text: 'text-info' };
  if (tipo === 'lci' || tipo === 'lca' || tipo === 'lci_lca' || tipo === 'lig') return { bg: 'bg-income/10', text: 'text-income' };
  if (tipo === 'cri' || tipo === 'cra') return { bg: 'bg-yellow-500/10', text: 'text-yellow-300' };
  if (tipo === 'debenture' || tipo === 'debenture_incentivada') return { bg: 'bg-purple-500/10', text: 'text-purple-300' };
  if (tipo === 'poupanca') return { bg: 'bg-pink-500/10', text: 'text-pink-300' };
  if (tipo === 'lc') return { bg: 'bg-orange-600/10', text: 'text-orange-200' };
  return { bg: 'bg-orange-500/10', text: 'text-orange-300' }; // CDB
}

// Categoria pra agrupar: prefixado, posfixado, ipcaplus
function familiaTaxa(tipo: TipoRF): 'prefixado' | 'posfixado' | 'ipcaplus' {
  if (tipo === 'tesouro_ipca') return 'ipcaplus';
  if (tipo === 'tesouro_selic') return 'posfixado';
  // CDB/LCI/Debenture: assume pre por default (sem indexador no schema)
  return 'prefixado';
}

interface RfRow {
  id: string;
  nome: string;
  tipo: TipoRF;
  indexador: Indexador;
  taxaDigitada: number;
  taxaEfetiva: number;
  valorAplicado: number;
  valorAtualEstimado: number;
  rendimentoAteAgora: number;
  rentabAteAgora: number;
  diasDecorridos: number;
  diasAteVencimento: number;
  valorBrutoVencimento: number;
  valorLiquidoVencimento: number;
  rentabBrutaTotal: number;
  rentabLiquidaTotal: number;
  irEstimado: number;
  isento: boolean;
  vencimentoISO: string;
  dataAplicacaoISO: string;
  corretora: string | null;
}

export function RendaFixaList() {
  var rf = useAppStore(function (s) { return s.rf; });
  var _user = useUser();
  var userId = _user.data ? _user.data.id : undefined;
  var macro = useMacroIndices();
  var idx = { cdi: macro.data ? macro.data.cdi : 14.65, ipca: macro.data ? macro.data.ipca_12m : 4.14 };
  var _editInit = useState<RendaFixaInitial | null>(null); var editInit = _editInit[0]; var setEditInit = _editInit[1];
  var _editOpen = useState(false); var editOpen = _editOpen[0]; var setEditOpen = _editOpen[1];

  var rows: RfRow[] = useMemo(function () {
    var out: RfRow[] = [];
    var hoje = new Date().toISOString().substring(0, 10);
    for (var i = 0; i < rf.length; i++) {
      var r = rf[i];
      var tipo = (r.tipo || 'cdb') as TipoRF;
      var ix: Indexador = (r.indexador || '') as Indexador;
      if (!ix) ix = defaultIndexador(tipo);
      var dataApl = (r.created_at ? r.created_at.substring(0, 10) : hoje);
      var venc = r.vencimento || hoje;
      var taxaDigitada = Number(r.taxa) || 0;
      var teff = taxaEfetivaAA(tipo, taxaDigitada, idx, ix);
      var aplicado = Number(r.valor_aplicado) || 0;

      // Valor atual estimado (juros compostos do início até hoje)
      var diasDec = diasEntre(dataApl, hoje);
      var anosDec = diasDec / 365.25;
      var valorAtual = aplicado * Math.pow(1 + teff / 100, anosDec);

      // Projeção até vencimento (do início até venc)
      var proj = projetarRF({
        tipo: tipo,
        taxaDigitada: taxaDigitada,
        valorAplicado: aplicado,
        dataAplicacaoISO: dataApl,
        vencimentoISO: venc,
        idx: idx,
        indexador: ix,
      });

      out.push({
        id: r.id || ('rf-' + i),
        nome: r.emissor || tipoLabel(tipo),
        tipo: tipo,
        indexador: ix,
        taxaDigitada: taxaDigitada,
        taxaEfetiva: teff,
        valorAplicado: aplicado,
        valorAtualEstimado: valorAtual,
        rendimentoAteAgora: valorAtual - aplicado,
        rentabAteAgora: aplicado > 0 ? (valorAtual / aplicado - 1) * 100 : 0,
        diasDecorridos: diasDec,
        diasAteVencimento: diasEntre(hoje, venc),
        valorBrutoVencimento: proj ? proj.valorBrutoVencimento : aplicado,
        valorLiquidoVencimento: proj ? proj.valorLiquidoVencimento : aplicado,
        rentabBrutaTotal: proj ? proj.rentabTotalPct : 0,
        rentabLiquidaTotal: proj ? proj.rentabLiquidaPct : 0,
        irEstimado: proj ? proj.ir : 0,
        isento: proj ? proj.isento : false,
        vencimentoISO: venc,
        dataAplicacaoISO: dataApl,
        corretora: r.corretora || null,
      });
    }
    out.sort(function (a, b) { return a.vencimentoISO < b.vencimentoISO ? -1 : 1; });
    return out;
  }, [rf, idx.cdi, idx.ipca]);

  // Agregados
  var totalAplicado = 0;
  var totalAtual = 0;
  var totalProjVenc = 0;
  var porFamilia: Record<'prefixado' | 'posfixado' | 'ipcaplus', number> = { prefixado: 0, posfixado: 0, ipcaplus: 0 };
  for (var i = 0; i < rows.length; i++) {
    var x = rows[i];
    totalAplicado += x.valorAplicado;
    totalAtual += x.valorAtualEstimado;
    totalProjVenc += x.valorLiquidoVencimento;
    porFamilia[familiaTaxa(x.tipo)] += x.valorAtualEstimado;
  }
  var pctPrefix = totalAtual > 0 ? (porFamilia.prefixado / totalAtual) * 100 : 0;
  var pctPos = totalAtual > 0 ? (porFamilia.posfixado / totalAtual) * 100 : 0;
  var pctIpca = totalAtual > 0 ? (porFamilia.ipcaplus / totalAtual) * 100 : 0;

  function openEdit(row: RfRow) {
    setEditInit({
      id: row.id,
      tipo: row.tipo,
      emissor: row.nome,
      taxa: row.taxaDigitada,
      indexador: row.indexador as any,
      valor_aplicado: row.valorAplicado,
      vencimento: row.vencimentoISO,
      corretora: row.corretora,
      portfolio_id: null,
    });
    setEditOpen(true);
  }

  if (rows.length === 0) {
    return (
      <div className="linear-card rounded-xl p-6 text-center">
        <p className="text-sm text-white/50 mb-1">Nenhuma renda fixa cadastrada</p>
        <p className="text-xs text-white/30">Cadastre Tesouro, CDB, LCI, LCA ou debênture na aba Transações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="linear-card rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">Aplicado</p>
          <p className="text-base font-mono font-bold">{fmtBRL(totalAplicado)}</p>
        </div>
        <div className="linear-card rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">Estimado hoje</p>
          <p className="text-base font-mono font-bold text-income">{fmtBRL(totalAtual)}</p>
          <p className="text-[10px] text-income/70 font-mono">+{fmtBRL(totalAtual - totalAplicado)}</p>
        </div>
        <div className="linear-card rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">Líquido no venc.</p>
          <p className="text-base font-mono font-bold text-info">{fmtBRL(totalProjVenc)}</p>
          <p className="text-[10px] text-info/70 font-mono">{rows.length} título{rows.length > 1 ? 's' : ''}</p>
        </div>
        <div className="linear-card rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">Composição</p>
          <div className="space-y-0.5 mt-0.5">
            <div className="flex justify-between text-[10px]"><span className="text-white/50">Pré</span><span className="font-mono text-white/70">{pctPrefix.toFixed(0)}%</span></div>
            <div className="flex justify-between text-[10px]"><span className="text-white/50">Pós</span><span className="font-mono text-white/70">{pctPos.toFixed(0)}%</span></div>
            <div className="flex justify-between text-[10px]"><span className="text-white/50">IPCA+</span><span className="font-mono text-white/70">{pctIpca.toFixed(0)}%</span></div>
          </div>
        </div>
      </div>

      {/* Lista detalhada */}
      <div className="linear-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Títulos</span>
          <span className="text-[10px] text-white/25 font-mono">aplicado · atual · vencimento</span>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {rows.map(function (r) {
            var cor = tipoCor(r.tipo);
            var corRentab = r.rentabAteAgora >= 0 ? 'text-income' : 'text-danger';
            var faltam = r.diasAteVencimento;
            var venceuOuQuase = faltam <= 0;
            return (
              <button
                key={r.id}
                type="button"
                onClick={function () { openEdit(r); }}
                className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={'text-[9px] px-1.5 py-0.5 rounded font-mono ' + cor.bg + ' ' + cor.text}>
                      {tipoLabel(r.tipo)}
                    </span>
                    <span className="text-sm font-semibold text-white truncate">{r.nome}</span>
                    {r.isento ? <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-income/10 text-income">isento IR</span> : null}
                  </div>
                  <p className="text-[10px] text-white/40 font-mono">
                    {r.indexador === 'cdi' ? r.taxaDigitada + '% CDI' :
                     r.indexador === 'ipca' ? 'IPCA + ' + r.taxaDigitada + '%' :
                     r.indexador === 'selic' ? 'Selic + ' + r.taxaDigitada + '%' :
                     fmtPct(r.taxaDigitada) + ' pré'}{' '}
                    → {fmtPct(r.taxaEfetiva)} a.a. · venc. {fmtDataBR(r.vencimentoISO)}{' '}
                    {venceuOuQuase ? <span className="text-warning">· vencido</span> : <span>· {faltam}d</span>}
                    {r.corretora ? <span className="text-white/30"> · {r.corretora}</span> : null}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:gap-6 sm:text-right shrink-0">
                  <div>
                    <p className="text-[9px] text-white/30 font-mono">aplicado</p>
                    <p className="text-[12px] font-mono text-white/70">{fmtBRL(r.valorAplicado)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/30 font-mono">atual</p>
                    <p className={'text-[12px] font-mono font-semibold ' + corRentab}>{fmtBRL(r.valorAtualEstimado)}</p>
                    <p className={'text-[9px] font-mono ' + corRentab}>{r.rentabAteAgora >= 0 ? '+' : ''}{fmtPct(r.rentabAteAgora)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/30 font-mono">no venc.</p>
                    <p className="text-[12px] font-mono text-info">{fmtBRL(r.valorLiquidoVencimento)}</p>
                    <p className="text-[9px] font-mono text-info/70">+{fmtPct(r.rentabLiquidaTotal)}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="px-4 py-2 text-[9px] text-white/25 border-t border-white/[0.04]">
          Estimativas usando CDI {idx.cdi.toFixed(2).replace('.', ',')}% e IPCA {idx.ipca.toFixed(2).replace('.', ',')}% atuais (BCB · {macro.data && macro.data.cdi_data ? macro.data.cdi_data : 'fallback'}). Rentab. real depende dos indexadores no momento do resgate.
        </p>
      </div>

      {/* Edit sheet */}
      {userId && editInit ? (
        <RendaFixaSheet
          userId={userId}
          initial={editInit}
          open={editOpen}
          onOpenChange={function (v) { setEditOpen(v); if (!v) setEditInit(null); }}
        />
      ) : null}
    </div>
  );
}
