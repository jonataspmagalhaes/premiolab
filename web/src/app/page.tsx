// Landing "em breve" — premiolab.com.br
// Mesmo padrao visual da home (cores, efeitos, linear-card) mas layout centrado simples.

'use client';

import Link from 'next/link';
import { BackgroundEffects } from '@/components/BackgroundEffects';
import { LogoMark } from '@/components/Logo';

// ═══════ SVG Icon ═══════

function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className || 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ═══════ Main Landing ═══════

export default function HomePage() {
  return (
    <div className="min-h-screen bg-page relative flex flex-col">
      <BackgroundEffects />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-page/60 backdrop-blur-xl border-b border-white/[0.06] z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-[14px] font-semibold tracking-tight">Premio<span className="text-orange-400">Lab</span></span>
          </div>
          <Link
            href="/login"
            className="shine-button flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold bg-gradient-to-r from-orange-500 to-orange-600 text-page shadow-[0_0_15px_rgba(249,115,22,0.3)] hover:shadow-[0_0_25px_rgba(249,115,22,0.5)] transition-all"
          >
            <Ico d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" className="w-4 h-4" />
            Entrar
          </Link>
        </div>
      </header>

      {/* Hero centrado */}
      <main className="relative z-10 flex-1 flex items-center justify-center pt-14 px-4 sm:px-6">
        <div className="max-w-2xl w-full text-center py-20">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/[0.08] border border-orange-500/20 mb-8 anim-up">
            <span className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.6)] animate-pulse" />
            <span className="text-xs text-orange-400 font-mono font-semibold uppercase tracking-wider">Em breve</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight mb-6 anim-up d1">
            Sua renda mensal,<br />
            <span className="text-orange-400">organizada</span> e <span className="text-income">crescendo</span>.
          </h1>

          <p className="text-base md:text-lg text-white/50 leading-relaxed mb-10 max-w-xl mx-auto anim-up d2">
            O app que projeta, acompanha e otimiza sua renda passiva de FIIs, acoes,
            opcoes e renda fixa — tudo num lugar so. Agora tambem no navegador.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-10 anim-up d3">
            {[
              { icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z', label: 'Renda 12m', color: 'text-income' },
              { icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z', label: 'Composicao', color: 'text-info' },
              { icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', label: 'Opcoes + IA', color: 'text-stock-int' },
              { icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605', label: 'Dashboard', color: 'text-orange-400' },
              { icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z', label: 'IR', color: 'text-warning' },
            ].map(function (feat) {
              return (
                <div key={feat.label} className="linear-card flex items-center gap-2 px-4 py-2.5 rounded-xl">
                  <Ico d={feat.icon} className={'w-4 h-4 ' + feat.color} />
                  <span className="text-xs text-white/60 font-medium">{feat.label}</span>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className="anim-up d4">
            <Link
              href="/login"
              className="shine-button inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-page font-bold text-base shadow-[0_0_25px_rgba(249,115,22,0.35)] hover:shadow-[0_0_40px_rgba(249,115,22,0.55)] hover:scale-[1.02] transition-all"
            >
              Entrar na minha conta
            </Link>
            <p className="text-xs text-white/30 mt-4">
              Ja tem conta no app mobile? Use as mesmas credenciais.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/30">
          <div className="flex items-center gap-2 opacity-50">
            <LogoMark size={20} />
            <span className="text-[12px] font-semibold tracking-tight text-white/60">Premio<span className="text-orange-400/60">Lab</span></span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacidade" className="hover:text-white/60 transition">Privacidade</Link>
            <Link href="/termos" className="hover:text-white/60 transition">Termos</Link>
            <a href="mailto:contato@premiolab.com.br" className="hover:text-white/60 transition">Contato</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
