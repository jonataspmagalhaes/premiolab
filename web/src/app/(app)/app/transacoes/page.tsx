'use client';

// Transacoes unificadas — view read-only (por ora) de operacoes + opcoes
// + proventos + renda_fixa. Filters: categoria, corretora, periodo, fonte.
// Delete funciona. Edit vem em follow-up via sheets especificos por tipo.

import { useMemo, useState } from 'react';
import { useUser, useTransacoes, type Transacao } from '@/lib/queries';
import { useAppStore } from '@/store';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { OperacaoSheet, type OperacaoInitial } from '@/components/OperacaoSheet';
import { AddProventoSheet, type ProventoInitial } from '@/components/AddProventoSheet';
import { RendaFixaSheet, type RendaFixaInitial } from '@/components/RendaFixaSheet';
import { FundoSheet, type FundoInitial } from '@/components/FundoSheet';
import { CaixaSheet } from '@/components/CaixaSheet';
import type { Caixa } from '@/store';
import { Plus } from 'lucide-react';

var supabase = getSupabaseBrowser();

// ───── Filter definitions ─────

type CatFilter =
  | 'todas'
  | 'Ação' | 'FII' | 'ETF' | 'Stock INT' | 'BDR' | 'ADR' | 'REIT' | 'Cripto'
  | 'Opção CALL' | 'Opção PUT'
  | 'Dividendo' | 'JCP' | 'Rendimento'
  | 'Renda Fixa' | 'Fundo' | 'Caixa';

var CAT_GROUPS: Array<{ label: string; cats: CatFilter[] }> = [
  { label: 'Tudo', cats: ['todas'] },
  { label: 'Ações', cats: ['Ação'] },
  { label: 'FIIs', cats: ['FII'] },
  { label: 'ETFs', cats: ['ETF'] },
  { label: 'BDRs', cats: ['BDR'] },
  { label: 'Stocks INT', cats: ['Stock INT'] },
  { label: 'ADRs', cats: ['ADR'] },
  { label: 'REITs', cats: ['REIT'] },
  { label: 'Cripto', cats: ['Cripto'] },
  { label: 'Opções', cats: ['Opção CALL', 'Opção PUT'] },
  { label: 'Proventos', cats: ['Dividendo', 'JCP', 'Rendimento'] },
  { label: 'Renda Fixa', cats: ['Renda Fixa'] },
  { label: 'Fundos', cats: ['Fundo'] },
  { label: 'Caixa', cats: ['Caixa'] },
];

type PeriodoFilter = 'tudo' | '30d' | '90d' | '365d' | 'ano';

// ───── Helpers ─────

function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className || 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function fmtValor(v: number, moeda: 'BRL' | 'USD') {
  var abs = Math.abs(v).toLocaleString(moeda === 'USD' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var prefix = moeda === 'USD' ? 'US$' : 'R$';
  return (v >= 0 ? '+' : '-') + prefix + ' ' + abs;
}

function fmtDataBR(iso: string) {
  if (!iso) return '';
  var parts = iso.substring(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0].substring(2);
}

function dataKey(iso: string): string {
  return iso.substring(0, 10);
}

function groupByDate(list: Transacao[]): Array<{ data: string; items: Transacao[] }> {
  var map: Record<string, Transacao[]> = {};
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    var k = dataKey(t.data);
    if (!map[k]) map[k] = [];
    map[k].push(t);
  }
  var keys = Object.keys(map).sort(function (a, b) { return a < b ? 1 : -1; });
  return keys.map(function (k) { return { data: k, items: map[k] }; });
}

function categoriaIcone(cat: string): string {
  if (cat === 'Ação') return 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6';
  if (cat === 'FII') return 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21';
  if (cat === 'ETF') return 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z';
  if (cat === 'Stock INT' || cat === 'ADR' || cat === 'REIT' || cat === 'BDR') return 'M12 21a9 9 0 100-18 9 9 0 000 18z M3.6 9h16.8M3.6 15h16.8M12 3a9 9 0 010 18 9 9 0 010-18z';
  if (cat === 'Cripto') return 'M12 2L4 7v10l8 5 8-5V7l-8-5z';
  if (cat.startsWith('Opção')) return 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6';
  if (cat === 'Dividendo' || cat === 'JCP' || cat === 'Rendimento') return 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1L15 14m-3-6V7m0 1v8m0 0v1';
  if (cat === 'Renda Fixa' || cat === 'Fundo') return 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z';
  if (cat === 'Caixa') return 'M21 12a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m0 0a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 9M3 9h18';
  if (cat === 'Split') return 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5';
  if (cat === 'Bonus') return 'M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z';
  return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
}

function categoriaColor(cat: string): { bg: string; text: string } {
  if (cat === 'Ação') return { bg: 'bg-blue-500/10', text: 'text-blue-400' };
  if (cat === 'FII') return { bg: 'bg-income/10', text: 'text-income' };
  if (cat === 'ETF') return { bg: 'bg-yellow-500/10', text: 'text-yellow-400' };
  if (cat === 'Stock INT') return { bg: 'bg-stock-int/10', text: 'text-stock-int' };
  if (cat === 'BDR') return { bg: 'bg-pink-600/10', text: 'text-pink-400' };
  if (cat === 'ADR') return { bg: 'bg-violet-500/10', text: 'text-violet-300' };
  if (cat === 'REIT') return { bg: 'bg-blue-500/10', text: 'text-blue-300' };
  if (cat === 'Cripto') return { bg: 'bg-pink-500/10', text: 'text-pink-300' };
  if (cat.startsWith('Opção')) return { bg: 'bg-purple-500/10', text: 'text-purple-400' };
  if (cat === 'Dividendo' || cat === 'JCP' || cat === 'Rendimento') return { bg: 'bg-income/10', text: 'text-income' };
  if (cat === 'Renda Fixa') return { bg: 'bg-info/10', text: 'text-info' };
  if (cat === 'Fundo') return { bg: 'bg-purple-500/10', text: 'text-purple-300' };
  if (cat === 'Caixa') return { bg: 'bg-orange-500/10', text: 'text-orange-300' };
  if (cat === 'Split') return { bg: 'bg-yellow-500/10', text: 'text-yellow-400' };
  if (cat === 'Bonus') return { bg: 'bg-amber-500/10', text: 'text-amber-400' };
  return { bg: 'bg-white/[0.04]', text: 'text-white/60' };
}

function dataDiasAtras(dias: number): string {
  var d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().substring(0, 10);
}

function inicioDoAno(): string {
  var d = new Date();
  return d.getFullYear() + '-01-01';
}

// ───── Page ─────

export default function TransacoesPage() {
  var _user = useUser();
  var userId = _user.data ? _user.data.id : undefined;
  var _tx = useTransacoes(userId);
  var transacoes = _tx.data || [];
  var portfolios = useAppStore(function (s) { return s.portfolios; });
  var selectedPortfolio = useAppStore(function (s) { return s.selectedPortfolio; });
  var qc = useQueryClient();

  var _grupo = useState<string>('Tudo'); var grupoAtivo = _grupo[0]; var setGrupoAtivo = _grupo[1];
  var _corretora = useState<string>('todas'); var corretoraFiltro = _corretora[0]; var setCorretoraFiltro = _corretora[1];
  var _periodo = useState<PeriodoFilter>('tudo'); var periodo = _periodo[0]; var setPeriodo = _periodo[1];
  var _fonte = useState<'todas' | 'manual' | 'sync'>('todas'); var fonteFiltro = _fonte[0]; var setFonteFiltro = _fonte[1];
  var _busca = useState(''); var busca = _busca[0]; var setBusca = _busca[1];
  var _addOpOpen = useState(false); var addOpOpen = _addOpOpen[0]; var setAddOpOpen = _addOpOpen[1];
  var _editOpInit = useState<OperacaoInitial | null>(null); var editOpInit = _editOpInit[0]; var setEditOpInit = _editOpInit[1];
  var _editOpOpen = useState(false); var editOpOpen = _editOpOpen[0]; var setEditOpOpen = _editOpOpen[1];
  var _editProvInit = useState<ProventoInitial | null>(null); var editProvInit = _editProvInit[0]; var setEditProvInit = _editProvInit[1];
  var _editProvOpen = useState(false); var editProvOpen = _editProvOpen[0]; var setEditProvOpen = _editProvOpen[1];
  var _addRfOpen = useState(false); var addRfOpen = _addRfOpen[0]; var setAddRfOpen = _addRfOpen[1];
  var _addFundoOpen = useState(false); var addFundoOpen = _addFundoOpen[0]; var setAddFundoOpen = _addFundoOpen[1];
  var _editFundoInit = useState<FundoInitial | null>(null); var editFundoInit = _editFundoInit[0]; var setEditFundoInit = _editFundoInit[1];
  var _editFundoOpen = useState(false); var editFundoOpen = _editFundoOpen[0]; var setEditFundoOpen = _editFundoOpen[1];
  var _editRfInit = useState<RendaFixaInitial | null>(null); var editRfInit = _editRfInit[0]; var setEditRfInit = _editRfInit[1];
  var _editRfOpen = useState(false); var editRfOpen = _editRfOpen[0]; var setEditRfOpen = _editRfOpen[1];
  var _editCaixaInit = useState<Caixa | null>(null); var editCaixaInit = _editCaixaInit[0]; var setEditCaixaInit = _editCaixaInit[1];
  var _editCaixaOpen = useState(false); var editCaixaOpen = _editCaixaOpen[0]; var setEditCaixaOpen = _editCaixaOpen[1];
  var _loadingEdit = useState(false); var loadingEdit = _loadingEdit[0]; var setLoadingEdit = _loadingEdit[1];

  // Lista unica de corretoras presentes nas transacoes
  var corretoras = useMemo(function () {
    var set: Record<string, true> = {};
    for (var i = 0; i < transacoes.length; i++) {
      var c = transacoes[i].corretora;
      if (c) set[c] = true;
    }
    return Object.keys(set).sort();
  }, [transacoes]);

  var filtradas = useMemo(function () {
    var grupo = CAT_GROUPS.filter(function (g) { return g.label === grupoAtivo; })[0];
    var cats = grupo ? grupo.cats : ['todas' as CatFilter];
    var cortePeriodo: string | null = null;
    if (periodo === '30d') cortePeriodo = dataDiasAtras(30);
    else if (periodo === '90d') cortePeriodo = dataDiasAtras(90);
    else if (periodo === '365d') cortePeriodo = dataDiasAtras(365);
    else if (periodo === 'ano') cortePeriodo = inicioDoAno();

    var buscaLc = busca.trim().toLowerCase();

    return transacoes.filter(function (t) {
      if (cats[0] !== 'todas' && cats.indexOf(t.categoria_display as CatFilter) < 0) return false;
      if (corretoraFiltro !== 'todas' && t.corretora !== corretoraFiltro) return false;
      if (fonteFiltro !== 'todas' && t.fonte !== fonteFiltro) return false;
      if (cortePeriodo && t.data < cortePeriodo) return false;
      if (buscaLc && t.descricao.toLowerCase().indexOf(buscaLc) < 0) return false;
      return true;
    });
  }, [transacoes, grupoAtivo, corretoraFiltro, periodo, fonteFiltro, busca]);

  var grupos = useMemo(function () { return groupByDate(filtradas); }, [filtradas]);

  async function openEdit(t: Transacao) {
    if (!userId) return;
    if (t.source_table !== 'operacoes' && t.source_table !== 'proventos' && t.source_table !== 'renda_fixa' && t.source_table !== 'fundos' && t.source_table !== 'caixa') return;

    setLoadingEdit(true);
    try {
      if (t.source_table === 'caixa') {
        var resC = await supabase
          .from('caixa')
          .select('id, corretora, moeda, valor, data, descricao, created_at')
          .eq('id', t.source_id)
          .eq('user_id', userId)
          .single();
        if (resC.error || !resC.data) {
          alert('Erro ao carregar caixa: ' + (resC.error ? resC.error.message : 'não encontrado'));
          return;
        }
        var rc: any = resC.data;
        setEditCaixaInit({
          id: rc.id,
          corretora: rc.corretora,
          moeda: rc.moeda === 'USD' ? 'USD' : 'BRL',
          valor: Number(rc.valor) || 0,
          data: rc.data,
          descricao: rc.descricao,
          created_at: rc.created_at,
        });
        setEditCaixaOpen(true);
      } else if (t.source_table === 'operacoes') {
        var res = await supabase
          .from('operacoes')
          .select('id, ticker, tipo, categoria, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos, corretora, data, mercado, portfolio_id')
          .eq('id', t.source_id)
          .eq('user_id', userId)
          .single();
        if (res.error || !res.data) {
          alert('Erro ao carregar operação: ' + (res.error ? res.error.message : 'não encontrada'));
          return;
        }
        var r: any = res.data;
        var custosSum = (Number(r.custo_corretagem) || 0) + (Number(r.custo_emolumentos) || 0) + (Number(r.custo_impostos) || 0);
        setEditOpInit({
          id: r.id,
          ticker: r.ticker,
          tipo: r.tipo,
          categoria: r.categoria,
          quantidade: Number(r.quantidade) || 0,
          preco: Number(r.preco) || 0,
          custos: custosSum,
          corretora: r.corretora,
          data: r.data,
          mercado: r.mercado || 'BR',
          portfolio_id: r.portfolio_id,
        });
        setEditOpOpen(true);
      } else if (t.source_table === 'proventos') {
        var resP = await supabase
          .from('proventos')
          .select('id, ticker, tipo, valor_por_cota, quantidade, data_pagamento, corretora, portfolio_id')
          .eq('id', t.source_id)
          .eq('user_id', userId)
          .single();
        if (resP.error || !resP.data) {
          alert('Erro ao carregar provento: ' + (resP.error ? resP.error.message : 'não encontrado'));
          return;
        }
        var rp: any = resP.data;
        setEditProvInit({
          id: rp.id,
          ticker: rp.ticker,
          tipo: rp.tipo,
          valor_por_cota: Number(rp.valor_por_cota) || 0,
          quantidade: Number(rp.quantidade) || 0,
          data_pagamento: rp.data_pagamento,
          corretora: rp.corretora,
          portfolio_id: rp.portfolio_id,
        });
        setEditProvOpen(true);
      } else if (t.source_table === 'renda_fixa') {
        var resRf = await supabase
          .from('renda_fixa')
          .select('id, tipo, emissor, taxa, indexador, valor_aplicado, vencimento, corretora, portfolio_id')
          .eq('id', t.source_id)
          .eq('user_id', userId)
          .single();
        if (resRf.error || !resRf.data) {
          alert('Erro ao carregar RF: ' + (resRf.error ? resRf.error.message : 'não encontrada'));
          return;
        }
        var rr: any = resRf.data;
        setEditRfInit({
          id: rr.id,
          tipo: rr.tipo,
          emissor: rr.emissor,
          taxa: rr.taxa != null ? Number(rr.taxa) : null,
          indexador: rr.indexador || null,
          valor_aplicado: Number(rr.valor_aplicado) || 0,
          vencimento: rr.vencimento,
          corretora: rr.corretora,
          portfolio_id: rr.portfolio_id,
        });
        setEditRfOpen(true);
      } else if (t.source_table === 'fundos') {
        var resF = await supabase
          .from('fundos')
          .select('id, cnpj, nome, classe, valor_aplicado, qtde_cotas, valor_cota_compra, data_aplicacao, corretora, taxa_admin, taxa_perf, portfolio_id')
          .eq('id', t.source_id)
          .eq('user_id', userId)
          .single();
        if (resF.error || !resF.data) {
          alert('Erro ao carregar fundo: ' + (resF.error ? resF.error.message : 'não encontrado'));
          return;
        }
        var rf2: any = resF.data;
        setEditFundoInit({
          id: rf2.id,
          cnpj: rf2.cnpj,
          nome: rf2.nome,
          classe: rf2.classe,
          valor_aplicado: Number(rf2.valor_aplicado) || 0,
          qtde_cotas: rf2.qtde_cotas != null ? Number(rf2.qtde_cotas) : null,
          valor_cota_compra: rf2.valor_cota_compra != null ? Number(rf2.valor_cota_compra) : null,
          data_aplicacao: rf2.data_aplicacao,
          corretora: rf2.corretora,
          taxa_admin: rf2.taxa_admin != null ? Number(rf2.taxa_admin) : null,
          taxa_perf: rf2.taxa_perf != null ? Number(rf2.taxa_perf) : null,
          portfolio_id: rf2.portfolio_id,
        });
        setEditFundoOpen(true);
      }
    } finally {
      setLoadingEdit(false);
    }
  }

  async function handleDelete(t: Transacao) {
    var what = t.categoria_display + ' · ' + t.descricao + ' · ' + fmtDataBR(t.data);
    if (!confirm('Remover "' + what + '"?')) return;
    await supabase.from(t.source_table).delete().eq('id', t.source_id);
    // Invalida tudo que pode ter mudado
    await qc.invalidateQueries({ queryKey: ['transacoes'] });
    if (t.source_table === 'operacoes') await qc.invalidateQueries({ queryKey: ['operacoes-raw'] });
    if (t.source_table === 'opcoes') await qc.invalidateQueries({ queryKey: ['opcoes'] });
    if (t.source_table === 'proventos') await qc.invalidateQueries({ queryKey: ['proventos'] });
    if (t.source_table === 'renda_fixa') await qc.invalidateQueries({ queryKey: ['renda_fixa'] });
    if (t.source_table === 'fundos') await qc.invalidateQueries({ queryKey: ['fundos'] });
    if (t.source_table === 'caixa') await qc.invalidateQueries({ queryKey: ['caixa'] });
    await qc.invalidateQueries({ queryKey: ['saldos'] });
    await qc.invalidateQueries({ queryKey: ['positions'] });
  }

  return (
    <div className="relative z-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 anim-up flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold mb-1">Transações</h1>
          <p className="text-xs text-white/40">
            Histórico unificado: operações, opções, proventos e renda fixa. Filtre por categoria, corretora ou período.
          </p>
        </div>
        {userId ? (
          <div className="flex items-center gap-2 shrink-0">
            <OperacaoSheet
              userId={userId}
              open={addOpOpen}
              onOpenChange={setAddOpOpen}
              trigger={
                <Button
                  size="sm"
                  className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Operação
                </Button>
              }
            />
            <RendaFixaSheet
              userId={userId}
              open={addRfOpen}
              onOpenChange={setAddRfOpen}
            />
            <FundoSheet
              userId={userId}
              open={addFundoOpen}
              onOpenChange={setAddFundoOpen}
            />
            <CaixaSheet userId={userId} />
          </div>
        ) : null}
      </div>

      {/* Sheet de edit (controlado, sem trigger) */}
      {userId && editOpInit ? (
        <OperacaoSheet
          userId={userId}
          initial={editOpInit}
          open={editOpOpen}
          onOpenChange={function (v) { setEditOpOpen(v); if (!v) setEditOpInit(null); }}
        />
      ) : null}
      {userId && editProvInit ? (
        <AddProventoSheet
          userId={userId}
          initial={editProvInit}
          open={editProvOpen}
          onOpenChange={function (v) { setEditProvOpen(v); if (!v) setEditProvInit(null); }}
        />
      ) : null}
      {userId && editRfInit ? (
        <RendaFixaSheet
          userId={userId}
          initial={editRfInit}
          open={editRfOpen}
          onOpenChange={function (v) { setEditRfOpen(v); if (!v) setEditRfInit(null); }}
        />
      ) : null}
      {userId && editFundoInit ? (
        <FundoSheet
          userId={userId}
          initial={editFundoInit}
          open={editFundoOpen}
          onOpenChange={function (v) { setEditFundoOpen(v); if (!v) setEditFundoInit(null); }}
        />
      ) : null}
      {userId && editCaixaInit ? (
        <CaixaSheet
          userId={userId}
          entry={editCaixaInit}
          open={editCaixaOpen}
          onOpenChange={function (v) { setEditCaixaOpen(v); if (!v) setEditCaixaInit(null); }}
        />
      ) : null}

      {/* KPI — total de transacoes */}
      <div className="mb-6 anim-up d1">
        <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">{filtradas.length} transações</p>
      </div>

      {/* Filters row 1 — categoria chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-3">
        {CAT_GROUPS.map(function (g) {
          var active = grupoAtivo === g.label;
          return (
            <button
              key={g.label}
              type="button"
              onClick={function () { setGrupoAtivo(g.label); }}
              className={'shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition ' +
                (active ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* Filters row 2 — selects */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
        <input
          type="text"
          value={busca}
          onChange={function (e) { setBusca(e.target.value); }}
          placeholder="Buscar por ticker…"
          className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-orange-500/40"
        />
        <select
          value={corretoraFiltro}
          onChange={function (e) { setCorretoraFiltro(e.target.value); }}
          className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[12px] text-white focus:outline-none focus:border-orange-500/40"
        >
          <option value="todas">Todas corretoras</option>
          {corretoras.map(function (c) {
            return <option key={c} value={c}>{c}</option>;
          })}
        </select>
        <select
          value={periodo}
          onChange={function (e) { setPeriodo(e.target.value as PeriodoFilter); }}
          className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[12px] text-white focus:outline-none focus:border-orange-500/40"
        >
          <option value="tudo">Todo o período</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="365d">Últimos 12 meses</option>
          <option value="ano">Desde jan/{new Date().getFullYear()}</option>
        </select>
        <select
          value={fonteFiltro}
          onChange={function (e) { setFonteFiltro(e.target.value as any); }}
          className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[12px] text-white focus:outline-none focus:border-orange-500/40"
        >
          <option value="todas">Manual + Auto</option>
          <option value="manual">Só manuais</option>
          <option value="sync">Só sincronizadas</option>
        </select>
      </div>

      {/* Lista agrupada por data */}
      <div className="linear-card rounded-xl overflow-hidden anim-up d5">
        {_tx.isLoading ? (
          <div className="py-16 text-center text-white/30 text-sm font-mono animate-pulse">Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-white/50 mb-1">Nenhuma transação encontrada</p>
            <p className="text-xs text-white/25">Ajuste os filtros ou adicione operações/proventos nas telas específicas.</p>
          </div>
        ) : (
          <div>
            {grupos.map(function (g) {
              return (
                <div key={g.data}>
                  <div className="sticky top-0 bg-page/95 backdrop-blur-sm px-4 py-2 border-b border-white/[0.04]">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-white/40">
                      {fmtDataBR(g.data)}
                    </span>
                  </div>
                  {g.items.map(function (t) {
                    var c = categoriaColor(t.categoria_display);
                    var signedColor = t.valor_signed >= 0 ? 'text-income' : 'text-danger';
                    return (
                      <div key={t.uid} className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] group">
                        <div className={'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' + c.bg}>
                          <Ico d={categoriaIcone(t.categoria_display)} className={'w-3.5 h-3.5 ' + c.text} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-semibold text-white truncate">{t.descricao}</span>
                            <span className={'text-[9px] px-1.5 py-0.5 rounded font-mono ' + c.bg + ' ' + c.text}>
                              {t.categoria_display}
                            </span>
                            {t.fonte === 'sync' ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-info/10 text-info">auto</span>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-white/40 truncate">
                            {t.subtitulo}
                            {t.corretora ? <span className="text-white/30"> · {t.corretora}</span> : null}
                          </p>
                        </div>
                        <span className={'text-sm font-mono font-semibold shrink-0 ' + signedColor}>
                          {fmtValor(t.valor_signed, t.moeda)}
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                          {(t.source_table === 'operacoes' || t.source_table === 'proventos' || t.source_table === 'renda_fixa' || t.source_table === 'fundos' || t.source_table === 'caixa') ? (
                            <button
                              type="button"
                              onClick={function () { openEdit(t); }}
                              disabled={loadingEdit}
                              className="w-7 h-7 rounded-md hover:bg-orange-500/10 text-white/30 hover:text-orange-300 flex items-center justify-center disabled:opacity-50"
                              aria-label="Editar"
                              title="Editar"
                            >
                              <Ico d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={function () { handleDelete(t); }}
                            className="w-7 h-7 rounded-md hover:bg-red-500/10 text-white/30 hover:text-red-400 flex items-center justify-center"
                            aria-label="Remover"
                            title="Remover"
                          >
                            <Ico d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22m-5 0V5a2 2 0 00-2-2H9a2 2 0 00-2 2v2" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-white/25 text-center mt-4">
        Operações: criar e editar aqui · Opções, proventos e RF: edit em breve
      </p>
    </div>
  );
}
