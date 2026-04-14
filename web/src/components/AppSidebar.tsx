'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/store';
import { LogoMark } from '@/components/Logo';
import { PortfolioSwitcher } from '@/components/PortfolioSwitcher';

var NAV_ITEMS = [
  { href: '/app', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { href: '/app/carteira', label: 'Carteira', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { href: '/app/renda', label: 'Renda', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1L15 14m-3-6V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1L9 14m3 4v1m6-9a9 9 0 11-18 0 9 9 0 0118 0z' },
  { href: '/app/opcoes', label: 'Opcoes', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { href: '/app/estrategias', label: 'Estrategias', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { href: '/app/analise', label: 'Analise', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { href: '/app/financeiro', label: 'Financeiro', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { href: '/app/config', label: 'Config', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function fmtBR(v: number) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}

export function AppTopNav() {
  var pathname = usePathname();
  var renda = useAppStore(function (s) { return s.renda; });

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-page/60 backdrop-blur-xl border-b border-white/[0.06] z-40 hidden lg:block">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
        {/* Logo */}
        <Link href="/app" className="flex items-center gap-2.5 hover:opacity-80 transition mr-8 shrink-0">
          <LogoMark size={28} />
          <span className="text-[14px] font-semibold tracking-tight">Premio<span className="text-orange-400">Lab</span></span>
        </Link>

        {/* Nav items */}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(function (item) {
            var isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={'flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-[13px] font-medium ' + (isActive ? 'bg-white/[0.06] text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.03]')}
              >
                <NavIcon d={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right side — portfolio + renda + PRO */}
        <div className="ml-auto flex items-center gap-3">
          <PortfolioSwitcher />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-income shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
            <span className="text-[11px] text-white/40">Renda</span>
            <span className="text-xs font-semibold font-mono text-income">R$ {fmtBR(renda.atual)}</span>
            <span className="text-[9px] text-white/30">/mes</span>
          </div>
          <button className="shine-button px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-semibold hover:bg-orange-500/20 transition">
            PRO
          </button>
        </div>
      </div>
    </header>
  );
}

// Top bar mobile/tablet — logo + portfolio switcher + renda compact
export function AppMobileHeader() {
  var renda = useAppStore(function (s) { return s.renda; });

  return (
    <header className="fixed top-0 left-0 right-0 h-12 bg-page/80 backdrop-blur-xl border-b border-white/[0.06] z-40 lg:hidden">
      <div className="px-3 h-full flex items-center gap-2">
        <Link href="/app" className="flex items-center gap-1.5 shrink-0">
          <LogoMark size={22} />
          <span className="text-[12px] font-semibold tracking-tight">Premio<span className="text-orange-400">Lab</span></span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
            <span className="w-1 h-1 rounded-full bg-income" />
            <span className="text-[10px] font-mono text-income font-semibold">R$ {fmtBR(renda.atual)}</span>
          </div>
          <PortfolioSwitcher />
        </div>
      </div>
    </header>
  );
}

// Bottom nav pra mobile
export function MobileBottomNav() {
  var pathname = usePathname();
  var items = NAV_ITEMS.slice(0, 5);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-page/80 backdrop-blur-xl border-t border-white/[0.06] z-40 lg:hidden flex">
      {items.map(function (item) {
        var isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={'flex-1 flex flex-col items-center py-2 gap-1 transition ' + (isActive ? 'text-orange-400' : 'text-white/30')}
          >
            <NavIcon d={item.icon} />
            <span className="text-[9px] font-mono">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
