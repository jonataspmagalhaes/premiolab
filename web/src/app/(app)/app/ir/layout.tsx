'use client';

// Layout compartilhado das sub-rotas /app/ir/*.
// Header persistente com titulo + seletor de ano + aba de navegacao
// horizontal entre as secoes. O ano selecionado e compartilhado via
// IRYearContext e persistido em localStorage.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IRYearProvider, useIRYear } from './_yearContext';
import { FileText, Banknote, Scale, Landmark, Bitcoin, ShieldCheck, Receipt, TrendingUp, LayoutGrid, ClipboardList } from 'lucide-react';

interface NavTab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

var TABS: NavTab[] = [
  { href: '/app/ir', label: 'Resumo', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { href: '/app/ir/declaracao', label: 'Declaracao', icon: <ClipboardList className="w-3.5 h-3.5" /> },
  { href: '/app/ir/renda-variavel', label: 'Renda Variavel', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { href: '/app/ir/opcoes', label: 'Opcoes', icon: <Scale className="w-3.5 h-3.5" /> },
  { href: '/app/ir/renda-fixa', label: 'Renda Fixa', icon: <Landmark className="w-3.5 h-3.5" /> },
  { href: '/app/ir/cripto', label: 'Cripto', icon: <Bitcoin className="w-3.5 h-3.5" /> },
  { href: '/app/ir/rendimentos', label: 'Rendimentos', icon: <Banknote className="w-3.5 h-3.5" /> },
  { href: '/app/ir/bens', label: 'Bens & Direitos', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  { href: '/app/ir/darf', label: 'DARF', icon: <Receipt className="w-3.5 h-3.5" /> },
];

export default function IRLayout(props: { children: React.ReactNode }) {
  return (
    <IRYearProvider>
      <div className="space-y-4">
        <DisclaimerBanner />
        <TabsBar />
        {props.children}
      </div>
    </IRYearProvider>
  );
}

function DisclaimerBanner() {
  return (
    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.03] px-3 py-2.5 flex items-start gap-2">
      <FileText className="w-3.5 h-3.5 text-emerald-300 mt-0.5 shrink-0" />
      <div className="text-[11px] text-white/70 leading-relaxed space-y-1">
        <p>
          <span className="font-semibold text-emerald-300">IRPF 2026</span> (ano-base 2025): entrega
          entre <span className="font-mono">23/03/2026</span> e <span className="font-mono">29/05/2026</span>.
          Restituicao em 4 lotes (maio, junho, julho, agosto/2026). Regulamentado pelas
          Instrucoes Normativas RFB <a className="underline decoration-dotted hover:text-emerald-300" href="https://normasinternet2.receita.fazenda.gov.br" target="_blank" rel="noreferrer">2.299/2025</a>
          {' '}e <a className="underline decoration-dotted hover:text-emerald-300" href="https://normasinternet2.receita.fazenda.gov.br" target="_blank" rel="noreferrer">2.312/2026</a>.
        </p>
        <p className="text-white/40">
          Informacao orientativa. Sempre confira com contador em casos complexos.
        </p>
      </div>
    </div>
  );
}

function TabsBar() {
  var pathname = usePathname();
  var ctx = useIRYear();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex-1 min-w-0 overflow-x-auto">
        <div className="inline-flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-md p-0.5">
          {TABS.map(function (t) {
            var isResumo = t.href === '/app/ir';
            var isActive = isResumo ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium whitespace-nowrap transition ' + (isActive ? 'bg-orange-500/20 text-orange-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]')}
              >
                {t.icon}
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <select
        value={ctx.year}
        onChange={function (e) { ctx.setYear(parseInt(e.target.value, 10)); }}
        className="bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-orange-500/40 shrink-0"
      >
        {ctx.anosDisponiveis.map(function (y) {
          return <option key={y} value={y}>Ano: {y}</option>;
        })}
      </select>
    </div>
  );
}
