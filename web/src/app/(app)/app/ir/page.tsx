'use client';

// Placeholder do menu IR. O conteudo completo (modo Contador) vem no
// Bloco B do plano — ver C:\Users\Admin\.claude\plans\...
// Esta tela serve hoje como "destino" pros bookmarks antigos (redirect
// de /app/renda/ir) e pro item "IR" do AppTopNav.

import Link from 'next/link';
import { FileText, ShieldCheck, Scale, Landmark, Bitcoin, Banknote, TrendingUp, Receipt } from 'lucide-react';

var SECOES = [
  { label: 'Renda Variavel', descricao: 'Swing trade BR (acoes, FIIs, ETFs, BDR/ADR/REIT) e stocks internacionais', icone: 'tv' },
  { label: 'Opcoes', descricao: 'P&L mensal, swing 15%, daytrade 20%, compensacao silo-separada', icone: 'sc' },
  { label: 'Renda Fixa', descricao: 'Tabela regressiva, LCI/LCA isenta, debentures incentivadas', icone: 'bk' },
  { label: 'Cripto', descricao: 'Isencao R$35k/mes em vendas, daytrade 22,5%', icone: 'bt' },
  { label: 'Rendimentos', descricao: 'Isentos (dividendos BR, rendimentos FII), JCP 15%, dividendos EUA 30%', icone: 'rc' },
  { label: 'Bens e Direitos', descricao: 'Posicao 31/12 por ativo, custo medio BRL, codigos IRPF pre-preenchidos', icone: 'sh' },
  { label: 'DARF Central', descricao: 'Gerador de DARF mensal, codigo 6015/4600, alerta de vencidos', icone: 'ft' },
  { label: 'Modo Contador', descricao: 'Regras IR brasileiras, passo a passo IRPF, FAQ, exemplos de preenchimento', icone: 'sl' },
];

function IconFor(props: { nome: string }) {
  var size = 'w-5 h-5';
  var nome = props.nome;
  if (nome === 'tv') return <TrendingUp className={size} />;
  if (nome === 'sc') return <Scale className={size} />;
  if (nome === 'bk') return <Landmark className={size} />;
  if (nome === 'bt') return <Bitcoin className={size} />;
  if (nome === 'rc') return <Banknote className={size} />;
  if (nome === 'sh') return <ShieldCheck className={size} />;
  if (nome === 'ft') return <Receipt className={size} />;
  return <FileText className={size} />;
}

export default function IRPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Imposto de Renda</h1>
        <p className="text-xs text-white/40 mt-1">
          Ferramenta completa pra declarar IR: regras, calculos, DARF e Ficha de Bens.
        </p>
      </div>

      <div className="linear-card rounded-xl p-5 border border-amber-500/30 bg-amber-500/[0.04]">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">🚧</span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-amber-200">Em construcao</p>
            <p className="text-[11px] text-white/60 mt-1.5 leading-relaxed">
              O menu IR completo (modo Contador) esta sendo implementado em um proximo bloco
              de commits. Cobrira todas as classes de ativos (acoes, FIIs, ETFs, opcoes,
              RF, cripto, stocks internacionais), com orientacao fiscal detalhada, geracao
              de DARF e textos prontos para colar no programa IRPF.
            </p>
            <p className="text-[11px] text-white/60 mt-2 leading-relaxed">
              Por enquanto, a classificacao basica de proventos (isentos, JCP 15%, dividendos
              EUA 30%) continua disponivel na tela antiga:
            </p>
            <Link
              href="/app/renda/ir"
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium hover:bg-emerald-500/25 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              Abrir classificacao de proventos (legado)
            </Link>
          </div>
        </div>
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-white/40 font-mono mb-3">Secoes planejadas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SECOES.map(function (s) {
            return (
              <div
                key={s.label}
                className="linear-card rounded-xl p-4 opacity-70 hover:opacity-100 transition"
                title="Em construcao"
              >
                <div className="flex items-center gap-2 mb-2 text-orange-300">
                  <IconFor nome={s.icone} />
                  <span className="text-[13px] font-semibold">{s.label}</span>
                </div>
                <p className="text-[11px] text-white/50 leading-relaxed">{s.descricao}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
