'use client';

// Caixa Contador — widget educacional exibido em cada secao do menu IR.
// 3 tabs internas: Regra / Como preencher / Exemplos-FAQ. Conteudo vem
// de lib/ir/contadorContent.ts.

import { useState } from 'react';
import { getContadorContent, type ContadorContent } from '@/lib/ir/contadorContent';
import { BookOpen, Navigation, Lightbulb, AlertTriangle, Scale, Clock } from 'lucide-react';

interface Props {
  secao: string;       // chave em CONTADOR_CONTENT
  defaultOpen?: boolean;
}

export function CaixaContador(props: Props) {
  var content = getContadorContent(props.secao);
  var _tab = useState<'regra' | 'preencher' | 'exemplos'>('regra');
  var tab = _tab[0];
  var setTab = _tab[1];
  var _open = useState<boolean>(props.defaultOpen != null ? props.defaultOpen : true);
  var open = _open[0];
  var setOpen = _open[1];

  if (!content) {
    return null;
  }

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03]">
      <button
        type="button"
        onClick={function () { setOpen(!open); }}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-emerald-500/[0.04] transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📗</span>
          <div className="text-left">
            <p className="text-[12px] uppercase tracking-wider text-emerald-300 font-semibold font-mono">Modo Contador</p>
            <p className="text-[13px] text-white/80 font-semibold">{content.titulo}</p>
          </div>
        </div>
        <span className={'text-white/40 transition-transform ' + (open ? 'rotate-180' : '')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="px-4 pb-4 pt-1 border-t border-emerald-500/10">
          <TabBar tab={tab} onChange={setTab} />
          {tab === 'regra' ? <RegraTab content={content} /> : null}
          {tab === 'preencher' ? <PreencherTab content={content} /> : null}
          {tab === 'exemplos' ? <ExemplosTab content={content} /> : null}

          <div className="mt-4 pt-3 border-t border-emerald-500/10 text-[10px] text-white/40 italic leading-relaxed">
            Informacao orientativa baseada em normas vigentes ate abril/2026.
            Verifique com contador em casos complexos ou mudancas legislativas recentes.
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────

function TabBar(props: { tab: string; onChange: (t: 'regra' | 'preencher' | 'exemplos') => void }) {
  var items: Array<{ k: 'regra' | 'preencher' | 'exemplos'; label: string; icon: React.ReactNode }> = [
    { k: 'regra', label: 'Regra', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { k: 'preencher', label: 'Como preencher', icon: <Navigation className="w-3.5 h-3.5" /> },
    { k: 'exemplos', label: 'Exemplos & FAQ', icon: <Lightbulb className="w-3.5 h-3.5" /> },
  ];
  return (
    <div className="flex items-center gap-1 my-3">
      {items.map(function (it) {
        var active = props.tab === it.k;
        return (
          <button
            key={it.k}
            type="button"
            onClick={function () { props.onChange(it.k); }}
            className={'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function RegraTab(props: { content: ContadorContent }) {
  var c = props.content;
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-white/80 leading-relaxed">{c.regra.resumo}</p>
      <ul className="space-y-1.5">
        {c.regra.pontos.map(function (p, i) {
          return (
            <li key={i} className="flex items-start gap-2 text-[12px] text-white/70">
              <span className="text-emerald-400 mt-0.5">•</span>
              <span className="leading-relaxed">{p}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-start gap-2 mt-3 pt-2 border-t border-white/[0.04]">
        <Scale className="w-3.5 h-3.5 text-white/40 mt-0.5 shrink-0" />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Fundamento legal</p>
          <p className="text-[11px] text-white/60 mt-0.5">{c.regra.fundamentoLegal}</p>
        </div>
      </div>
      {c.avisos.length > 0 ? (
        <div className="mt-3 rounded-md bg-amber-500/5 border border-amber-500/20 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">Avisos</p>
          </div>
          <ul className="space-y-1">
            {c.avisos.map(function (a, i) {
              return <li key={i} className="text-[11px] text-white/70 leading-relaxed">• {a}</li>;
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PreencherTab(props: { content: ContadorContent }) {
  var c = props.content;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-medium">{c.comoPreencher.programa}</span>
        <span className="text-white/60">→</span>
        <span className="text-white/80">{c.comoPreencher.ficha}</span>
        {c.comoPreencher.codigo ? (
          <>
            <span className="text-white/60">·</span>
            <span className="font-mono text-orange-300">codigo {c.comoPreencher.codigo}</span>
          </>
        ) : null}
      </div>
      <ol className="space-y-3 mt-3">
        {c.comoPreencher.steps.map(function (s, i) {
          return (
            <li key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-[12px] font-semibold text-white/90">{s.titulo}</p>
                <p className="text-[11px] text-white/60 mt-0.5 leading-relaxed">{s.descricao}</p>
                {s.dica ? (
                  <p className="text-[11px] text-emerald-300/80 mt-1 leading-relaxed">
                    <span className="font-semibold">💡 Dica:</span> {s.dica}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 pt-3 border-t border-white/[0.04] grid grid-cols-2 gap-2">
        <div className="rounded-md bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Clock className="w-3 h-3 text-white/40" />
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Prazo</p>
          </div>
          <p className="text-[11px] text-white/70 leading-relaxed">{c.prazos}</p>
        </div>
        <div className="rounded-md bg-white/[0.02] p-2.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Multa</p>
          </div>
          <p className="text-[11px] text-white/70 leading-relaxed">{c.multa}</p>
        </div>
      </div>
    </div>
  );
}

function ExemplosTab(props: { content: ContadorContent }) {
  var c = props.content;
  return (
    <div className="space-y-3">
      {c.exemplos.map(function (e, i) {
        return (
          <div key={i} className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[12px] font-semibold text-white/90 mb-1">📌 {e.titulo}</p>
            <p className="text-[11px] text-white/70 leading-relaxed mt-1">
              <span className="font-semibold text-white/60">Cenario:</span> {e.cenario}
            </p>
            <p className="text-[11px] text-white/70 leading-relaxed mt-1">
              <span className="font-semibold text-white/60">Calculo:</span> {e.calculo}
            </p>
            <p className="text-[11px] text-emerald-300/90 leading-relaxed mt-1">
              <span className="font-semibold">Resultado:</span> {e.resultado}
            </p>
          </div>
        );
      })}

      {c.faq.length > 0 ? (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-semibold mb-2">Perguntas frequentes</p>
          <div className="space-y-2">
            {c.faq.map(function (q, i) {
              return (
                <div key={i} className="text-[11px]">
                  <p className="text-white/80 font-semibold">❓ {q.pergunta}</p>
                  <p className="text-white/60 mt-0.5 leading-relaxed">{q.resposta}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
