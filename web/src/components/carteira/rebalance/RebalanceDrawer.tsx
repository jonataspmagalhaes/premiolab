'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useDrift } from '@/hooks/useDrift';
import { useUpdateRebalanceTargets } from '@/lib/queries';
import { useAppStore } from '@/store';
import { ClassTargetsEditor } from './ClassTargetsEditor';
import { SectorTargetsEditor } from './SectorTargetsEditor';
import { TickerTargetsEditor } from './TickerTargetsEditor';
import {
  PROFILES,
  type ClassTargets,
  type SectorTargets,
  type TickerTargets,
} from '@/lib/rebalance';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | undefined;
}

type Section = 'classe' | 'setor' | 'ticker';

export function RebalanceDrawer({ open, onOpenChange, userId }: Props) {
  const drift = useDrift(userId);
  const portfolios = useAppStore((s) => s.portfolios);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);
  const updateMutation = useUpdateRebalanceTargets();

  const [openSection, setOpenSection] = useState<Section | null>('classe');

  if (!userId) {
    return null;
  }

  function commitClass(next: ClassTargets) {
    if (!userId) return;
    updateMutation.mutate({ userId, patch: { class_targets: next } });
  }
  function commitSector(next: SectorTargets) {
    if (!userId) return;
    updateMutation.mutate({ userId, patch: { sector_targets: next } });
  }
  function commitTicker(next: TickerTargets) {
    if (!userId) return;
    updateMutation.mutate({ userId, patch: { ticker_targets: next } });
  }

  function applyProfile(key: 'conservador' | 'moderado' | 'arrojado') {
    if (!userId) return;
    const preset = PROFILES[key];
    updateMutation.mutate({
      userId,
      patch: {
        class_targets: preset.class_targets,
        sector_targets: preset.sector_targets ?? {},
      },
    });
  }

  const portfolioName = selectedPortfolio === null
    ? null
    : selectedPortfolio === '__null__'
      ? 'Padrao'
      : (portfolios.find((p) => p.id === selectedPortfolio)?.nome || 'Custom');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl bg-page border-l border-white/[0.08] overflow-y-auto p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-2 border-b border-white/[0.05] sticky top-0 bg-page z-10">
          <SheetTitle className="text-lg text-white/90 font-semibold">Rebalancear carteira</SheetTitle>
          <SheetDescription className="text-[12px] text-white/50">
            Defina pesos por classe, setor e ticker. Soma deve fechar 100% por nivel.
          </SheetDescription>
          {portfolioName && (
            <div className="mt-2 px-3 py-2 rounded-md bg-amber-500/5 border border-amber-500/15">
              <p className="text-[11px] text-amber-300/90">
                Vendo drift do portfolio <strong>{portfolioName}</strong>. Metas sao globais do seu perfil.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/[0.05]">
            <span className="text-[10px] uppercase tracking-wider text-white/40">Aderencia</span>
            <span className={
              'text-[16px] font-mono font-bold ' +
              (drift.accuracy >= 80 ? 'text-emerald-300' : drift.accuracy >= 60 ? 'text-amber-300' : drift.accuracy === 0 ? 'text-white/40' : 'text-rose-300')
            }>
              {drift.accuracy}<span className="text-[10px] opacity-60">/100</span>
            </span>
          </div>
        </SheetHeader>

        <div className="px-6 py-4 space-y-5 pb-12">

          {/* Perfis */}
          <section>
            <h3 className="text-[10px] uppercase tracking-wider text-white/45 font-semibold mb-2">Perfis pre-definidos</h3>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PROFILES) as Array<keyof typeof PROFILES>).map((key) => {
                const p = PROFILES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyProfile(key)}
                    className="text-left p-3 rounded-lg bg-white/[0.025] border border-white/[0.06] hover:border-orange-500/30 hover:bg-orange-500/[0.05] transition group"
                  >
                    <p className="text-[12px] font-semibold text-white/85 group-hover:text-orange-300 transition">{p.label}</p>
                    <p className="text-[10px] text-white/40 leading-snug mt-1">{p.descricao}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Classes */}
          <Section
            title="Classes (tipo de ativo)"
            isOpen={openSection === 'classe'}
            onToggle={() => setOpenSection(openSection === 'classe' ? null : 'classe')}
          >
            <ClassTargetsEditor
              targets={drift.targets.class_targets}
              classDrift={drift.classDrift}
              onChange={commitClass}
            />
          </Section>

          {/* Setores */}
          <Section
            title="Setores"
            isOpen={openSection === 'setor'}
            onToggle={() => setOpenSection(openSection === 'setor' ? null : 'setor')}
          >
            <SectorTargetsEditor
              targets={drift.targets.sector_targets}
              sectorDrift={drift.sectorDrift}
              onChange={commitSector}
            />
          </Section>

          {/* Tickers */}
          <Section
            title="Tickers"
            isOpen={openSection === 'ticker'}
            onToggle={() => setOpenSection(openSection === 'ticker' ? null : 'ticker')}
          >
            <TickerTargetsEditor
              targets={drift.targets.ticker_targets}
              tickerDrift={drift.tickerDrift}
              onChange={commitTicker}
            />
          </Section>

          {/* Dica: simulador agora vive no card lateral da Carteira */}
          <p className="text-[10px] text-white/35 italic text-center pt-2">
            O simulador de aporte fica visivel no card ao lado da Carteira.
          </p>

        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, isOpen, onToggle, children }: { title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.025] transition"
      >
        <h3 className="text-[12px] uppercase tracking-wider text-white/70 font-semibold">{title}</h3>
        <svg
          className={'w-4 h-4 text-white/50 transition-transform ' + (isOpen ? 'rotate-180' : '')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
