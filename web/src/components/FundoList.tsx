'use client';

// Lista de Fundos para exibir na Carteira.
// Mostra: cada fundo com classe, valor aplicado, qtde cotas, MTM estimado,
// taxa adm. Agregados: total aplicado, total estimado, % composicao por classe.

import { useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { useUser } from '@/lib/queries';
import { FundoSheet, type FundoInitial } from '@/components/FundoSheet';

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

function classeLabel(c: string | null | undefined): string {
  if (c === 'renda_fixa') return 'Renda Fixa';
  if (c === 'multimercado') return 'Multimercado';
  if (c === 'acoes') return 'Ações';
  if (c === 'cambial') return 'Cambial';
  if (c === 'previdencia') return 'Previdência';
  if (c === 'imobiliario') return 'Imobiliário';
  return 'Outros';
}

function classeCor(c: string | null | undefined): { bg: string; text: string } {
  if (c === 'renda_fixa') return { bg: 'bg-info/10', text: 'text-info' };
  if (c === 'acoes') return { bg: 'bg-orange-500/10', text: 'text-orange-300' };
  if (c === 'multimercado') return { bg: 'bg-purple-500/10', text: 'text-purple-300' };
  if (c === 'cambial') return { bg: 'bg-yellow-500/10', text: 'text-yellow-300' };
  if (c === 'previdencia') return { bg: 'bg-pink-500/10', text: 'text-pink-300' };
  if (c === 'imobiliario') return { bg: 'bg-income/10', text: 'text-income' };
  return { bg: 'bg-white/[0.04]', text: 'text-white/60' };
}

interface FundoRow {
  id: string;
  cnpj: string;
  nome: string;
  classe: string;
  valorAplicado: number;
  qtdeCotas: number | null;
  valorCotaCompra: number | null;
  taxaAdm: number | null;
  diasDecorridos: number;
  dataAplicacao: string;
  corretora: string | null;
  portfolio_id: string | null;
}

export function FundoList() {
  var fundos = useAppStore(function (s) { return s.fundos; });
  var _user = useUser();
  var userId = _user.data ? _user.data.id : undefined;
  var _editInit = useState<FundoInitial | null>(null); var editInit = _editInit[0]; var setEditInit = _editInit[1];
  var _editOpen = useState(false); var editOpen = _editOpen[0]; var setEditOpen = _editOpen[1];

  var rows: FundoRow[] = useMemo(function () {
    var hoje = Date.now();
    var out: FundoRow[] = [];
    for (var i = 0; i < fundos.length; i++) {
      var f = fundos[i];
      var dataApl = (f.data_aplicacao || '').substring(0, 10);
      var diasDec = dataApl ? Math.max(0, Math.round((hoje - Date.parse(dataApl)) / 86400000)) : 0;
      out.push({
        id: f.id || ('fundo-' + i),
        cnpj: f.cnpj,
        nome: f.nome,
        classe: f.classe || 'outros',
        valorAplicado: Number(f.valor_aplicado) || 0,
        qtdeCotas: f.qtde_cotas != null ? Number(f.qtde_cotas) : null,
        valorCotaCompra: f.valor_cota_compra != null ? Number(f.valor_cota_compra) : null,
        taxaAdm: f.taxa_admin != null ? Number(f.taxa_admin) : null,
        diasDecorridos: diasDec,
        dataAplicacao: dataApl,
        corretora: f.corretora || null,
        portfolio_id: f.portfolio_id || null,
      });
    }
    out.sort(function (a, b) { return b.valorAplicado - a.valorAplicado; });
    return out;
  }, [fundos]);

  // Agregados
  var totalAplicado = 0;
  var porClasse: Record<string, number> = {};
  for (var i = 0; i < rows.length; i++) {
    totalAplicado += rows[i].valorAplicado;
    var c = rows[i].classe;
    porClasse[c] = (porClasse[c] || 0) + rows[i].valorAplicado;
  }
  var classes = Object.keys(porClasse).sort(function (a, b) { return porClasse[b] - porClasse[a]; });

  function openEdit(row: FundoRow) {
    setEditInit({
      id: row.id,
      cnpj: row.cnpj,
      nome: row.nome,
      classe: row.classe as any,
      valor_aplicado: row.valorAplicado,
      qtde_cotas: row.qtdeCotas,
      valor_cota_compra: row.valorCotaCompra,
      data_aplicacao: row.dataAplicacao,
      corretora: row.corretora,
      taxa_admin: row.taxaAdm,
      taxa_perf: null,
      portfolio_id: row.portfolio_id,
    });
    setEditOpen(true);
  }

  if (rows.length === 0) {
    return (
      <div className="linear-card rounded-xl p-6 text-center">
        <p className="text-sm text-white/50 mb-1">Nenhum fundo cadastrado</p>
        <p className="text-xs text-white/30">Cadastre fundos de RF, Multimercado, Ações, Cambial ou Previdência na aba Transações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="linear-card rounded-xl p-3">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">Aplicado total</p>
          <p className="text-base font-mono font-bold">{fmtBRL(totalAplicado)}</p>
          <p className="text-[10px] text-white/40 font-mono">{rows.length} fundo{rows.length > 1 ? 's' : ''}</p>
        </div>
        <div className="linear-card rounded-xl p-3 col-span-2">
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Composição por classe</p>
          <div className="space-y-1">
            {classes.map(function (c) {
              var pct = totalAplicado > 0 ? (porClasse[c] / totalAplicado) * 100 : 0;
              var cor = classeCor(c);
              return (
                <div key={c} className="flex items-center gap-2 text-[11px]">
                  <span className={'text-[9px] px-1.5 py-0.5 rounded font-mono w-24 shrink-0 ' + cor.bg + ' ' + cor.text}>
                    {classeLabel(c)}
                  </span>
                  <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className={'h-full ' + cor.bg.replace('/10', '/50')} style={{ width: pct + '%' }} />
                  </div>
                  <span className="text-[10px] text-white/50 font-mono w-12 text-right">{pct.toFixed(0)}%</span>
                  <span className="text-[10px] text-white/70 font-mono w-24 text-right">{fmtBRL(porClasse[c])}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lista detalhada */}
      <div className="linear-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Fundos</span>
          <span className="text-[10px] text-white/25 font-mono">classe · CNPJ · aplicação</span>
        </div>
        <div className="divide-y divide-white/[0.03]">
          {rows.map(function (r) {
            var cor = classeCor(r.classe);
            return (
              <button
                key={r.id}
                type="button"
                onClick={function () { openEdit(r); }}
                className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={'text-[9px] px-1.5 py-0.5 rounded font-mono ' + cor.bg + ' ' + cor.text}>
                      {classeLabel(r.classe)}
                    </span>
                    <span className="text-sm font-semibold text-white truncate">{r.nome}</span>
                  </div>
                  <p className="text-[10px] text-white/40 font-mono truncate">
                    {r.cnpj}
                    {r.taxaAdm != null ? ' · adm ' + fmtPct(r.taxaAdm) : ''}
                    {r.corretora ? ' · ' + r.corretora : ''}
                    {' · há ' + r.diasDecorridos + 'd'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-mono font-semibold">{fmtBRL(r.valorAplicado)}</p>
                  {r.qtdeCotas != null ? (
                    <p className="text-[9px] text-white/30 font-mono">{r.qtdeCotas.toFixed(6)} cotas</p>
                  ) : (
                    <p className="text-[9px] text-white/30 font-mono">{fmtDataBR(r.dataAplicacao)}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="px-4 py-2 text-[9px] text-white/25 border-t border-white/[0.04]">
          MTM ao vivo (cota atual via DM) chega numa próxima iteração.
        </p>
      </div>

      {/* Edit sheet */}
      {userId && editInit ? (
        <FundoSheet
          userId={userId}
          initial={editInit}
          open={editOpen}
          onOpenChange={function (v) { setEditOpen(v); if (!v) setEditInit(null); }}
        />
      ) : null}
    </div>
  );
}
